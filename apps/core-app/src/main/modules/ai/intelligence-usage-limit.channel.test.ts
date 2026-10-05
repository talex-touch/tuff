/**
 * A12 through the real channel registration and the real SDK: with the daily request limit used
 * up, the capability test the prompts and skills pages run answers the app's own renderer with the
 * refusal's code and reason — which limit, when it resets — instead of the one public sentence.
 *
 * Nothing between the channel and the SDK's usage gate is mocked: the limit lives in the real
 * quota manager on a migrated libSQL file and the day's usage in the real ledger table
 * (`usage-limit-refusal.test-harness`). Only Electron, storage and the plugin host are stood in for.
 */
import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { UsageLimitRefusalFixture } from './usage-ledger/usage-limit-refusal.test-harness'
import {
  IntelligenceCapabilityType,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'
import { createTrustedTestPluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { intelligenceApiEvents } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import { IntelligenceModule } from './intelligence-module'
import {
  closeUsageLimitRefusalDatabase,
  openUsageLimitRefusalDatabase,
  reachDailyRequestLimit
} from './usage-ledger/usage-limit-refusal.test-harness'
import { setUsageLimits } from './usage-ledger/usage-limits'

let fixture: UsageLimitRefusalFixture | undefined

vi.mock('../database', () => ({
  databaseModule: {
    getDb: () => fixture?.db
  }
}))

vi.mock('../permission/permission-module-ref', () => ({
  getPermissionModule: vi.fn(() => null)
}))

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: { pluginManager: { getPluginByName: vi.fn() } }
}))

vi.mock('../sentry/sentry-service', () => {
  const service = {
    isTelemetryEnabled: vi.fn(() => false),
    isEnabled: vi.fn(() => false),
    queueNexusTelemetry: vi.fn()
  }
  return {
    SentryServiceModule: class {},
    getSentryService: vi.fn(() => service),
    setSentryServiceInstance: vi.fn()
  }
})

type EventDefinition = TuffEvent<unknown, unknown> & { toEventName: () => string }
type InvokeHandler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown

interface CapabilityRegistrarHarness {
  createChannelRegistrars: (transport: {
    on: (event: EventDefinition, handler: InvokeHandler) => () => void
    onStream: (event: EventDefinition, handler: unknown) => () => void
  }) => { registerSafe: unknown; registerProtectedSafe: unknown }
  registerCapabilityChannels: (registerSafe: unknown, registerProtectedSafe: unknown) => void
  registerStatsChannels: (registerSafe: unknown) => void
}

/** Every channel the module's capability and stats groups register, by event name. */
function registerChannels(): Map<string, InvokeHandler> {
  const handlers = new Map<string, InvokeHandler>()
  const module = new IntelligenceModule() as unknown as CapabilityRegistrarHarness
  const registrars = module.createChannelRegistrars({
    on: (event, handler) => {
      handlers.set(event.toEventName(), handler)
      return () => handlers.delete(event.toEventName())
    },
    onStream: () => () => undefined
  })
  module.registerCapabilityChannels(registrars.registerSafe, registrars.registerProtectedSafe)
  module.registerStatsChannels(registrars.registerSafe)
  return handlers
}

function requireHandler(
  handlers: Map<string, InvokeHandler>,
  event: { toEventName: () => string }
): InvokeHandler {
  const handler = handlers.get(event.toEventName())
  if (!handler) throw new Error(`${event.toEventName()} was not registered`)
  return handler
}

/** The capability test handler, registered by the module's own channel code. */
function registerCapabilityTest(): InvokeHandler {
  return requireHandler(registerChannels(), intelligenceApiEvents.testCapability)
}

const HOST = {} as HandlerContext
const PLUGIN = {
  plugin: createTrustedTestPluginContext({
    name: 'usage-limit-test-plugin',
    pluginInstanceId: 'usage-limit-test-instance',
    uniqueKey: 'usage-limit-test-key'
  })
} as HandlerContext
const TEST_PAYLOAD = { capabilityId: 'text.chat', userInput: 'ping' }

/** 2026-10-04 10:00 in Shanghai: the limit resets at the next local midnight. */
const NOW = Date.parse('2026-10-04T02:00:00.000Z')
const RESETS_AT_ISO = '2026-10-04T16:00:00.000Z'
const originalTimeZone = process.env.TZ

beforeAll(async () => {
  process.env.TZ = 'Asia/Shanghai'
  fixture = await openUsageLimitRefusalDatabase()
}, 60_000)

beforeEach(() => {
  process.env.TZ = 'Asia/Shanghai'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  intelligenceCapabilityRegistry.clear()
  intelligenceCapabilityRegistry.register({
    id: 'text.chat',
    type: IntelligenceCapabilityType.CHAT,
    name: 'text.chat',
    description: 'usage limit channel test',
    supportedProviders: [IntelligenceProviderType.CUSTOM]
  })
})

afterEach(async () => {
  vi.useRealTimers()
  await setUsageLimits({})
})

afterAll(async () => {
  intelligenceCapabilityRegistry.clear()
  await closeUsageLimitRefusalDatabase(fixture)
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
}, 60_000)

describe('intelligence:api:test-capability under the global usage limit', () => {
  it('tells the app which limit refused the test and when it resets', async () => {
    const testCapability = registerCapabilityTest()

    // Positive control: without a limit the same call gets past the gate and fails later, on
    // something that is not the limit (no channel is configured in this database).
    const unlimited = (await testCapability(TEST_PAYLOAD, HOST)) as { ok: boolean; error: string }
    expect(unlimited.ok).toBe(false)
    expect(unlimited.error).not.toContain('USAGE_LIMIT_REACHED')

    expect(await reachDailyRequestLimit(fixture!, NOW)).toBe(Date.parse(RESETS_AT_ISO))
    await expect(testCapability(TEST_PAYLOAD, HOST)).resolves.toEqual({
      ok: false,
      error: `[USAGE_LIMIT_REACHED:text.chat] The usage limit you set is reached (requestsPerDay: 1 / 1); it resets at 2026-10-05 00:00 local time (${RESETS_AT_ISO}).`,
      code: 'USAGE_LIMIT_REACHED'
    })
  })

  it('keeps a plugin out before any call is made, with a code and nothing else', async () => {
    const testCapability = registerCapabilityTest()
    await reachDailyRequestLimit(fixture!, NOW)

    const refused = (await testCapability(TEST_PAYLOAD, PLUGIN)) as Record<string, unknown>
    expect(refused.ok).toBe(false)
    expect(refused.error).toMatch(/^[A-Z][A-Z0-9_]+$/)
    expect(refused.error).not.toBe('USAGE_LIMIT_REACHED')
    expect(JSON.stringify(refused)).not.toContain('requestsPerDay')
  })
})

describe('intelligence:api:get/set-usage-limits answer a refusal by its code', () => {
  const invalid = (reason: string) => ({
    ok: false,
    error: `[INVALID_REQUEST] ${reason}`,
    code: 'INVALID_REQUEST'
  })

  it('tells the limits drawer which field the host refused, and why', async () => {
    const handlers = registerChannels()
    const set = requireHandler(handlers, intelligenceApiEvents.setUsageLimits)
    const get = requireHandler(handlers, intelligenceApiEvents.getUsageLimits)

    await expect(set({ requestsPerDay: 0 }, HOST)).resolves.toEqual(
      invalid('requestsPerDay must be a positive whole number, or empty for no limit.')
    )
    // Past the safe integer range: the renderer's own check now refuses the same value.
    await expect(set({ tokensPerMonth: 2 ** 53 }, HOST)).resolves.toEqual(
      invalid('tokensPerMonth must be a positive whole number, or empty for no limit.')
    )
    await expect(set({ costUsdPerDay: -1 }, HOST)).resolves.toEqual(
      invalid('costUsdPerDay must be a positive amount in USD, or empty for no limit.')
    )
    await expect(set({ requestsPerWeek: 1 }, HOST)).resolves.toEqual(
      invalid('"requestsPerWeek" is not a usage limit.')
    )
    await expect(set('requestsPerDay=3', HOST)).resolves.toEqual(
      invalid('The usage limits must be an object of limit names.')
    )

    // Positive control: a valid change is stored and read back through the same channels.
    await expect(set({ requestsPerDay: 3 }, HOST)).resolves.toMatchObject({
      ok: true,
      result: { requestsPerDay: 3 }
    })
    await expect(get(undefined, HOST)).resolves.toMatchObject({
      ok: true,
      result: { requestsPerDay: 3 }
    })
  })

  it('gives a plugin a stable code and nothing else', async () => {
    const handlers = registerChannels()
    for (const event of [
      intelligenceApiEvents.setUsageLimits,
      intelligenceApiEvents.getUsageLimits
    ]) {
      const reply = (await requireHandler(handlers, event)(
        { requestsPerDay: 0 },
        PLUGIN
      )) as Record<string, unknown>
      expect(reply.ok).toBe(false)
      expect(reply.error).toMatch(/^[A-Z][A-Z0-9_]+$/)
      expect(Object.keys(reply).sort()).toEqual(['error', 'ok'])
    }
  })
})
