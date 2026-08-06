import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'
import { intelligenceApiEvents } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { IntelligenceModule } from './intelligence-module'

vi.mock('../sentry/sentry-service', () => {
  class SentryServiceModule {
    isTelemetryEnabled = vi.fn(() => false)
    isEnabled = vi.fn(() => false)
    queueNexusTelemetry = vi.fn()
  }

  const service = new SentryServiceModule()
  return {
    SentryServiceModule,
    getSentryService: vi.fn(() => service),
    setSentryServiceInstance: vi.fn()
  }
})

const intelligenceSdkMocks = vi.hoisted(() => ({
  testProvider: vi.fn(),
  invoke: vi.fn(),
  queryAuditLogs: vi.fn(),
  getTodayStats: vi.fn(),
  getMonthStats: vi.fn(),
  getUsageStats: vi.fn()
}))
const adminOperationMocks = vi.hoisted(() => ({
  fetchProviderModels: vi.fn(),
  getIntelligenceLocalEnvironment: vi.fn()
}))
const discoveryMocks = vi.hoisted(() => ({
  getCapabilityTestMeta: vi.fn(() => undefined),
  resolveCapabilityStatus: vi.fn((capabilityId: string) => ({
    capabilityId,
    available: true,
    providerIds: ['discovery-provider']
  })),
  getProviderModelOptions: vi.fn(() => [
    {
      providerId: 'discovery-provider',
      providerName: 'Discovery Provider',
      models: ['discovery-model'],
      defaultModel: 'discovery-model'
    }
  ])
}))
const intelligenceEventMocks = vi.hoisted(() => {
  // Any member the module registers resolves to a stub with an internally
  // consistent name. The previous hand-kept lists went stale every time the
  // domain grew an event — which is exactly how this suite kept breaking.
  const events = (group: string) => {
    const cache: Record<string, { toEventName: () => string }> = {}
    return new Proxy(cache, {
      get: (_target, key: string) => (cache[key] ??= { toEventName: () => `${group}:${key}` })
    })
  }
  return {
    intelligenceApiEvents: events('intelligence:api'),
    intelligenceContextEvents: events('intelligence:context'),
    intelligenceKnowledgeEvents: events('intelligence:knowledge')
  }
})

vi.mock('@talex-touch/utils/transport/sdk/domains/intelligence', () => ({
  ...intelligenceEventMocks
}))
vi.mock('@talex-touch/utils/transport/events/types', async (importOriginal) => ({
  // Real constants and guards (they're pure data), with only the error-code
  // check stubbed — a hand-listed mock goes stale every time the module
  // grows an export, which is exactly how this suite broke.
  ...(await importOriginal<typeof import('@talex-touch/utils/transport/events/types')>()),
  isIntelligenceErrorCode: vi.fn(() => false)
}))
vi.mock('./intelligence-sdk', () => ({
  setIntelligenceProviderManager: vi.fn(),
  tuffIntelligence: intelligenceSdkMocks
}))
vi.mock('./provider-models', () => ({
  fetchProviderModels: adminOperationMocks.fetchProviderModels
}))
vi.mock('./intelligence-local-environment', () => ({
  getIntelligenceLocalEnvironment: adminOperationMocks.getIntelligenceLocalEnvironment
}))
vi.mock('./capability-testers', () => ({
  capabilityTesterRegistry: {
    get: discoveryMocks.getCapabilityTestMeta
  }
}))
vi.mock('./intelligence-capability-status', () => ({
  resolveCapabilityStatus: discoveryMocks.resolveCapabilityStatus
}))
vi.mock('./intelligence-provider-model-options', () => ({
  getProviderModelOptions: discoveryMocks.getProviderModelOptions
}))

type AdminHandler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown

type AdminEventKey = keyof typeof intelligenceEventMocks.intelligenceApiEvents

interface AdminChannelRegistrar {
  registerCapabilityChannels: (register: unknown) => void
  registerStatsChannels: (register: unknown) => void
  registerEnvironmentChannels: (register: unknown) => void
}

function captureAdminHandlers() {
  const handlers = new Map<string, AdminHandler>()
  const register = vi.fn(
    (
      event: TuffEvent<unknown, unknown> & { toEventName: () => string },
      _action: string,
      handler: AdminHandler
    ) => {
      handlers.set(event.toEventName(), handler)
    }
  )
  const module = new IntelligenceModule() as unknown as AdminChannelRegistrar

  module.registerCapabilityChannels(register)
  module.registerStatsChannels(register)
  module.registerEnvironmentChannels(register)

  return handlers
}

function getHandler(handlers: Map<string, AdminHandler>, eventKey: AdminEventKey): AdminHandler {
  const handler = handlers.get(intelligenceApiEvents[eventKey].toEventName())
  if (!handler) {
    throw new Error(`Intelligence admin handler for ${eventKey} was not registered`)
  }
  return handler
}

function pluginContext(): HandlerContext {
  return {
    plugin: { name: 'third-party-plugin', uniqueKey: 'plugin-key', verified: true }
  } as HandlerContext
}

const providerPayload = {
  id: 'plugin-provider',
  name: 'Plugin Provider',
  type: 'local',
  enabled: true
}

describe('intelligenceModule admin surface boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    {
      name: 'provider diagnostics',
      eventKey: 'testProvider',
      payload: { provider: providerPayload },
      operation: intelligenceSdkMocks.testProvider
    },
    {
      name: 'capability diagnostics',
      eventKey: 'testCapability',
      payload: { capabilityId: 'text.chat', providerId: 'plugin-provider' },
      operation: intelligenceSdkMocks.invoke
    },
    {
      name: 'provider model fetching',
      eventKey: 'fetchModels',
      payload: { provider: providerPayload },
      operation: adminOperationMocks.fetchProviderModels
    },
    {
      name: 'cross-caller audit logs',
      eventKey: 'getAuditLogs',
      payload: { callerId: 'plugin:other-plugin', limit: 10 },
      operation: intelligenceSdkMocks.queryAuditLogs
    },
    {
      name: 'today cross-caller stats',
      eventKey: 'getTodayStats',
      payload: { callerId: 'plugin:other-plugin' },
      operation: intelligenceSdkMocks.getTodayStats
    },
    {
      name: 'monthly cross-caller stats',
      eventKey: 'getMonthStats',
      payload: { callerId: 'plugin:other-plugin' },
      operation: intelligenceSdkMocks.getMonthStats
    },
    {
      name: 'usage cross-caller stats',
      eventKey: 'getUsageStats',
      payload: {
        callerId: 'plugin:other-plugin',
        periodType: 'day',
        startPeriod: '2026-07-14',
        endPeriod: '2026-07-14'
      },
      operation: intelligenceSdkMocks.getUsageStats
    },
    {
      name: 'local environment inspection',
      eventKey: 'getLocalEnvironment',
      payload: undefined,
      operation: adminOperationMocks.getIntelligenceLocalEnvironment
    }
  ] as const)(
    'rejects verified plugin access to $name before privileged work',
    async ({ eventKey, payload, operation }) => {
      const handler = getHandler(captureAdminHandlers(), eventKey)

      await expect(handler(payload, pluginContext())).rejects.toThrow(
        'INTELLIGENCE_HOST_ONLY_CAPABILITY'
      )
      expect(operation).not.toHaveBeenCalled()
    },
    15_000
  )

  it('keeps safe capability discovery available to verified plugins', async () => {
    const handlers = captureAdminHandlers()

    await expect(
      getHandler(handlers, 'getCapabilityTestMeta')(
        { capabilityId: 'unknown.capability' },
        pluginContext()
      )
    ).resolves.toEqual({ requiresUserInput: false, inputHint: '' })
    await expect(
      getHandler(handlers, 'getCapabilityStatus')({ capabilityId: 'text.chat' }, pluginContext())
    ).resolves.toEqual({
      capabilityId: 'text.chat',
      available: true,
      providerIds: ['discovery-provider']
    })
    await expect(
      getHandler(handlers, 'getProviderModelOptions')(
        { capabilityId: 'text.chat' },
        pluginContext()
      )
    ).resolves.toEqual([
      {
        providerId: 'discovery-provider',
        providerName: 'Discovery Provider',
        models: ['discovery-model'],
        defaultModel: 'discovery-model'
      }
    ])
  })

  it('keeps host provider validation separate from the plugin-only boundary', async () => {
    const handler = getHandler(captureAdminHandlers(), 'testProvider')

    await expect(handler(null, {} as HandlerContext)).rejects.toThrow('Missing provider payload')
    expect(intelligenceSdkMocks.testProvider).not.toHaveBeenCalled()
  })

  it('keeps host usage payload validation separate from the plugin-only boundary', async () => {
    const handler = getHandler(captureAdminHandlers(), 'getUsageStats')

    await expect(handler(null, {} as HandlerContext)).rejects.toThrow('Invalid payload')
    expect(intelligenceSdkMocks.getUsageStats).not.toHaveBeenCalled()
  })
})
