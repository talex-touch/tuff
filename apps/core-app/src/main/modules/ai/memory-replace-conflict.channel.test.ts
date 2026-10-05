import type { Client } from '@libsql/client'
import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type {
  EvaluateMemoryInput,
  EvaluateMemoryResult,
  MemoryUpsertInput
} from '@talex-touch/utils/types/intelligence'
import type { IntelligenceSdkTransport } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { createClient } from '@libsql/client'
import { SdkApi } from '@talex-touch/utils/plugin'
import { createTrustedTestPluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import {
  createIntelligenceSdk,
  intelligenceContextEvents
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../db/schema'
import { isMemoryReplaceConflict } from '../../../shared/intelligence/memory-errors'
import './intelligence-test-harness'
import { IntelligenceModule } from './intelligence-module'
import { MEMORY_REPLACE_CONFLICT_REASON } from './memory-error-projection'

/**
 * A memory replace that loses its compare-and-swap, through everything between the memory page and
 * the database: the module's own channel registration, the real memory service on a migrated
 * database, and the renderer's real SDK, whose transport here hands each request straight to the
 * registered handler instead of over Electron's channel. What comes out is the error the memory
 * page receives — read with the page's own test for it.
 *
 * Before the channel projected the conflict, the page got the public sentence: it said "保存记忆失败",
 * never reloaded, and every retry failed against the same stale copy.
 */

const harness = vi.hoisted(() => ({
  client: undefined as unknown,
  db: undefined as unknown
}))

const permissionMocks = vi.hoisted(() => ({
  getPermissionModule: vi.fn(),
  checkPermission: vi.fn(),
  getPluginByName: vi.fn()
}))

vi.mock('../database', () => ({
  databaseModule: {
    getClient: () => harness.client,
    getDb: () => harness.db
  }
}))
vi.mock('../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    schedule: async (_label: string, operation: () => Promise<unknown>) => await operation()
  }
}))
vi.mock('../permission/permission-module-ref', () => ({
  getPermissionModule: permissionMocks.getPermissionModule
}))
vi.mock('../plugin/plugin-module', () => ({
  pluginModule: { pluginManager: { getPluginByName: permissionMocks.getPluginByName } }
}))
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
vi.mock('./intelligence-sdk', () => ({ tuffIntelligence: { invoke: vi.fn(), stream: vi.fn() } }))
vi.mock('./intelligence-config', () => ({
  debugPrintConfig: vi.fn(),
  ensureIntelligenceConfigLoaded: vi.fn(),
  getCapabilityOptions: vi.fn(),
  setupConfigUpdateListener: vi.fn()
}))
vi.mock('./capability-testers', () => ({ capabilityTesterRegistry: { get: vi.fn() } }))
vi.mock('./intelligence-capability-status', () => ({ resolveCapabilityStatus: vi.fn() }))
vi.mock('./intelligence-provider-model-options', () => ({ getProviderModelOptions: vi.fn() }))

type EventDefinition = TuffEvent<unknown, unknown> & { toEventName: () => string }
type Handler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown

interface ContextRegistrarHarness {
  createChannelRegistrars: (transport: {
    on: (event: EventDefinition, handler: Handler) => () => void
    onStream: (event: EventDefinition, handler: unknown) => () => void
  }) => { registerProtectedSafe: unknown }
  registerContextChannels: (registerProtectedSafe: unknown) => void
}

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../resources/db/migrations')
const SDK_API = SdkApi.V260817
const PUBLIC_SENTENCE = 'The operation failed. Please retry.'
const HOST = {} as HandlerContext

let client: Client
let sandbox: string

/** The context channels as the module registers them, by event name. */
function registerContextChannels(): Map<string, Handler> {
  const handlers = new Map<string, Handler>()
  const module = new IntelligenceModule() as unknown as ContextRegistrarHarness
  const registrars = module.createChannelRegistrars({
    on: (event, handler) => {
      handlers.set(event.toEventName(), handler)
      return () => handlers.delete(event.toEventName())
    },
    onStream: () => () => {}
  })
  module.registerContextChannels(registrars.registerProtectedSafe)
  return handlers
}

/** The renderer's SDK, its transport handing each request to the registered handler. */
function rendererSdk(handlers: Map<string, Handler>) {
  const transport = {
    send: async (event: EventDefinition, payload: unknown) => {
      const handler = handlers.get(event.toEventName())
      if (!handler) throw new Error(`nothing registered for ${event.toEventName()}`)
      // Electron's channel clones every payload; so does this one.
      return await handler(structuredClone(payload), HOST)
    }
  } as unknown as IntelligenceSdkTransport
  return createIntelligenceSdk(transport)
}

/** The replacement the editor builds from an evaluation (`MemoryEditor.vue`). */
function replacementFrom(input: EvaluateMemoryInput, evaluation: EvaluateMemoryResult) {
  const candidate = evaluation.candidate!
  const replacement: MemoryUpsertInput = {
    type: candidate.type,
    scope: candidate.scope,
    content: input.content,
    summary: candidate.summary,
    tags: candidate.tags,
    confidence: candidate.confidence ?? undefined,
    privacyLevel: candidate.privacyLevel ?? undefined,
    enabled: true
  }
  return replacement
}

const EDIT: EvaluateMemoryInput = {
  content: 'Reply in Simplified Chinese; keep code, commands and error text in English.',
  type: 'preference',
  scope: 'global',
  summary: 'Reply in Chinese, code in English',
  tags: ['language']
}

beforeEach(async () => {
  permissionMocks.getPluginByName.mockReturnValue({ sdkapi: SDK_API })
  permissionMocks.checkPermission.mockReturnValue({ allowed: true })
  permissionMocks.getPermissionModule.mockReturnValue({
    checkPermission: permissionMocks.checkPermission
  })
  sandbox = await mkdtemp(join(tmpdir(), 'tuff-memory-replace-'))
  client = createClient({ url: `file:${join(sandbox, 'database.sqlite')}` })
  harness.client = client
  harness.db = drizzle(client, { schema })
  await migrate(harness.db as ReturnType<typeof drizzle<typeof schema>>, { migrationsFolder })
})

afterEach(async () => {
  client.close()
  await rm(sandbox, { recursive: true, force: true })
})

describe('memory replace conflict through the real channel', () => {
  it('reaches the page as the conflict it acts on, and the reloaded copy then replaces', async () => {
    const sdk = rendererSdk(registerContextChannels())
    const saved = await sdk.contextSaveMemory({
      type: 'preference',
      scope: 'global',
      content: 'Reply in Simplified Chinese.',
      summary: 'Reply in Chinese',
      tags: ['language'],
      enabled: true
    })
    // The editor opened on `saved`; meanwhile another window switches the memory off.
    await new Promise((settle) => setTimeout(settle, 5))
    const switched = await sdk.contextSetMemoryEnabled({ memoryId: saved.id, enabled: false })
    expect(switched.updatedAt).toBeGreaterThan(saved.updatedAt)

    const evaluation = await sdk.contextEvaluateMemory(EDIT)
    const failure = await sdk
      .contextReplaceMemory({
        memoryId: saved.id,
        expectedUpdatedAt: saved.updatedAt,
        evaluationFingerprint: evaluation.fingerprint!,
        replacement: replacementFrom(EDIT, evaluation)
      })
      .then(
        () => null,
        (error: unknown) => error
      )

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe(
      `[MEMORY_REPLACE_CONFLICT] ${MEMORY_REPLACE_CONFLICT_REASON}`
    )
    expect(isMemoryReplaceConflict(failure)).toBe(true)

    // Nothing was written: the memory is still there, switched off by the other window, alone.
    const reloaded = await sdk.contextListMemories({ status: 'all' })
    expect(reloaded.memories.map((memory) => [memory.id, memory.enabled])).toEqual([
      [saved.id, false]
    ])

    // What the page does next — reload, re-base, evaluate again, replace — goes through.
    const again = await sdk.contextEvaluateMemory(EDIT)
    const replaced = await sdk.contextReplaceMemory({
      memoryId: saved.id,
      expectedUpdatedAt: reloaded.memories[0]!.updatedAt,
      evaluationFingerprint: again.fingerprint!,
      replacement: replacementFrom(EDIT, again)
    })
    expect(replaced.memory.replacesMemoryId).toBe(saved.id)
    expect((await sdk.contextListMemories({ status: 'all' })).memories.map((m) => m.id)).toEqual([
      replaced.memory.id
    ])
  })

  it('keeps the public sentence for every other replace failure', async () => {
    const handlers = registerContextChannels()
    const sdk = rendererSdk(handlers)
    const saved = await sdk.contextSaveMemory({
      type: 'preference',
      scope: 'global',
      content: 'Reply in Simplified Chinese.',
      enabled: true
    })
    const evaluation = await sdk.contextEvaluateMemory(EDIT)

    // An evaluation of other content: the service refuses it with its own code.
    const mismatch = await handlers.get(intelligenceContextEvents.replaceMemory.toEventName())!(
      {
        memoryId: saved.id,
        expectedUpdatedAt: saved.updatedAt,
        evaluationFingerprint: `${evaluation.fingerprint}-other`,
        replacement: replacementFrom(EDIT, evaluation)
      },
      HOST
    )
    expect(mismatch).toEqual({ ok: false, error: PUBLIC_SENTENCE })
  })

  it('never lets a plugin reach the replace: it gets the public sentence, never the conflict', async () => {
    const handlers = registerContextChannels()
    const sdk = rendererSdk(handlers)
    const saved = await sdk.contextSaveMemory({
      type: 'preference',
      scope: 'global',
      content: 'Reply in Simplified Chinese.',
      enabled: true
    })
    const evaluation = await sdk.contextEvaluateMemory(EDIT)
    const plugin = {
      plugin: createTrustedTestPluginContext({
        name: 'memory-test-plugin',
        pluginInstanceId: 'memory-test-instance',
        uniqueKey: 'memory-test-key'
      })
    } as HandlerContext

    const answer = await handlers.get(intelligenceContextEvents.replaceMemory.toEventName())!(
      {
        memoryId: saved.id,
        expectedUpdatedAt: saved.updatedAt - 1,
        evaluationFingerprint: evaluation.fingerprint,
        replacement: replacementFrom(EDIT, evaluation),
        _sdkapi: SDK_API
      },
      plugin
    )
    expect(answer).toEqual({ ok: false, error: PUBLIC_SENTENCE })
    expect(permissionMocks.checkPermission).toHaveBeenCalledOnce()
    expect((await sdk.contextListMemories({ status: 'all' })).memories.map((m) => m.id)).toEqual([
      saved.id
    ])
  })
})
