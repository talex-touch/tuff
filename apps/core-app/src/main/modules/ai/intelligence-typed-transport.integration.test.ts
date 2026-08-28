import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type {
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceProviderAdapter,
  IntelligenceProviderConfig,
  IntelligenceStreamChunk
} from '@talex-touch/tuff-intelligence'
import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import type { HandlerContext, PluginActivationIdentity } from '@talex-touch/utils/transport/main'
import type { StreamContext } from '@talex-touch/utils/transport/types'
import { createClient } from '@libsql/client'
import {
  IntelligenceCapabilityType,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'
import { structuredStrictStringify } from '@talex-touch/utils'
import { SdkApi } from '@talex-touch/utils/plugin'
import { createPluginTuffTransport } from '@talex-touch/utils/transport'
import { createIntelligenceSdk } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { TuffMainTransport } from '@talex-touch/utils/transport/sdk/main-transport'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../db/schema'
import { intelligenceAuditLogs, intelligenceUsageStats } from '../../db/schema'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import './intelligence-test-harness'
import { intelligenceAuditLogger } from './intelligence-audit-logger'
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import { IntelligenceModule } from './intelligence-module'
import { intelligenceQuotaManager } from './intelligence-quota-manager'
import { setIntelligenceProviderManager, tuffIntelligence } from './intelligence-sdk'
import { createChatProvider, FakeProviderManager } from './intelligence-test-harness'

const permissionMocks = vi.hoisted(() => ({
  getPermissionModule: vi.fn(),
  checkPermission: vi.fn(),
  getPluginByName: vi.fn()
}))

const electronMocks = vi.hoisted(() => ({
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() }
}))

vi.mock('electron', () => ({
  app: {
    commandLine: { appendSwitch: vi.fn() },
    getAppPath: vi.fn(() => '/tmp/app'),
    getPath: vi.fn(() => '/tmp'),
    getVersion: vi.fn(() => '0.0.0-test'),
    isPackaged: false,
    on: vi.fn(),
    once: vi.fn(),
    setAppLogsPath: vi.fn(),
    setPath: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined)
  },
  BrowserWindow: class BrowserWindow {},
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
  MessageChannelMain: class MessageChannelMain {},
  Tray: class Tray {},
  crashReporter: { start: vi.fn() },
  ipcMain: electronMocks.ipcMain,
  nativeImage: { createFromPath: vi.fn() },
  powerMonitor: { on: vi.fn(), removeListener: vi.fn() },
  screen: { getPrimaryDisplay: vi.fn() }
}))

vi.mock('../permission/permission-module-ref', () => ({
  getPermissionModule: permissionMocks.getPermissionModule
}))

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      getPluginByName: permissionMocks.getPluginByName
    }
  }
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

vi.mock('./intelligence-config', () => ({
  debugPrintConfig: vi.fn(),
  ensureIntelligenceConfigLoaded: vi.fn(),
  getCapabilityOptions: vi.fn(),
  setupConfigUpdateListener: vi.fn()
}))

const SDK_API = SdkApi.V260817
const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../resources/db/migrations')

let client: Client
let db: LibSQLDatabase<typeof schema>
let tempDir: string

vi.mock('../database', () => ({
  databaseModule: {
    getDb: () => db
  }
}))

type EventDefinition<TReq = unknown, TRes = unknown> = TuffEvent<TReq, TRes> & {
  toEventName: () => string
}
type InvokeHandler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown
type StreamHandler = (payload: unknown, context: StreamContext<unknown>) => Promise<void> | void

interface RegistrarTransport {
  on: (event: EventDefinition, handler: InvokeHandler) => () => void
  onStream: (event: EventDefinition, handler: StreamHandler) => () => void
}

interface RegistrarBundle {
  registerProtectedSafe: unknown
  registerProtectedStream: unknown
}

interface IntelligenceRegistrarHarness {
  createChannelRegistrars: (transport: RegistrarTransport) => RegistrarBundle
  registerInvokeChannels: (registerSafe: unknown, registerStream: unknown) => void
}

type BridgeHandler = (data: unknown) => unknown

let senderSequence = 0

class ProductionTypedTransportHarness {
  private readonly bridgeHandlers = new Map<string, Set<BridgeHandler>>()
  private readonly pluginListeners = new Map<string, Set<(data: unknown) => void>>()
  private readonly activation: PluginActivationIdentity
  private readonly sender
  private lastStreamCompletion: Promise<void> = Promise.resolve()
  readonly invokeWireReplies: unknown[] = []
  readonly sdk

  constructor(pluginName: string) {
    this.activation = {
      name: pluginName,
      pluginInstanceId: `typed-transport:${pluginName}`,
      activationGeneration: 1,
      key: `typed-transport-key:${pluginName}`
    }
    this.sender = {
      id: ++senderSequence,
      isDestroyed: vi.fn(() => false),
      once: vi.fn(),
      postMessage: vi.fn(),
      send: vi.fn((_channel: string, envelope: { name?: string }) => {
        if (!envelope?.name) return
        for (const listener of this.pluginListeners.get(envelope.name) ?? []) listener(envelope)
      })
    }

    const bridge = {
      regChannel: (type: 'main' | 'plugin', eventName: string, handler: BridgeHandler) => {
        const key = `${type}:${eventName}`
        const handlers = this.bridgeHandlers.get(key) ?? new Set<BridgeHandler>()
        handlers.add(handler)
        this.bridgeHandlers.set(key, handlers)
        return () => {
          handlers.delete(handler)
          if (handlers.size === 0) this.bridgeHandlers.delete(key)
        }
      },
      sendTo: vi.fn(),
      sendPlugin: vi.fn(),
      broadcast: vi.fn(),
      broadcastTo: vi.fn(),
      broadcastPlugin: vi.fn()
    }
    const keyManager = {
      resolveIdentity: (key: string) => (key === this.activation.key ? this.activation : undefined),
      resolveCurrentIdentity: (name: string) =>
        name === this.activation.name ? this.activation : undefined,
      resolveSenderIdentity: (sender: unknown) =>
        sender === this.sender ? this.activation : undefined
    }
    const mainTransport = new TuffMainTransport(bridge as never, keyManager as never)
    const registrarTransport: RegistrarTransport = {
      on: mainTransport.on.bind(mainTransport) as RegistrarTransport['on'],
      onStream: ((event: EventDefinition, handler: StreamHandler) =>
        mainTransport.onStream(event as never, (payload, context) => {
          const completion = Promise.resolve(
            handler(payload, context as StreamContext<unknown>)
          ).then(() => undefined)
          this.lastStreamCompletion = completion.catch(() => undefined)
          return completion
        })) as RegistrarTransport['onStream']
    }
    const module = new IntelligenceModule() as unknown as IntelligenceRegistrarHarness
    const registrars = module.createChannelRegistrars(registrarTransport)
    module.registerInvokeChannels(
      registrars.registerProtectedSafe,
      registrars.registerProtectedStream
    )

    const pluginChannel = {
      sendToMain: (eventName: string, payload?: unknown) =>
        this.sendToMain(eventName, this.withSdkApi(payload)),
      onMain: (eventName: string, listener: (data: unknown) => void) => {
        const listeners = this.pluginListeners.get(eventName) ?? new Set<(data: unknown) => void>()
        listeners.add(listener)
        this.pluginListeners.set(eventName, listeners)
        return () => {
          listeners.delete(listener)
          if (listeners.size === 0) this.pluginListeners.delete(eventName)
        }
      }
    }
    this.sdk = createIntelligenceSdk(createPluginTuffTransport(pluginChannel))
  }

  waitForLastStream(): Promise<void> {
    return this.lastStreamCompletion
  }

  private async sendToMain(eventName: string, payload?: unknown): Promise<unknown> {
    const handlers = this.bridgeHandlers.get(`plugin:${eventName}`)
    if (!handlers?.size) {
      throw new Error(`Production plugin handler ${eventName} was not registered`)
    }
    let result: unknown
    const envelope = {
      data: payload,
      plugin: this.activation.name,
      pluginIdentity: this.activation,
      header: {
        uniqueKey: this.activation.key,
        event: { sender: this.sender }
      }
    }
    for (const handler of handlers) {
      try {
        result = await handler(envelope)
      } catch (error) {
        result = error
      }
    }
    const wireReply = JSON.parse(structuredStrictStringify(result)) as unknown
    this.invokeWireReplies.push(wireReply)
    return wireReply
  }

  private withSdkApi<T>(payload: T): T {
    if (!payload || typeof payload !== 'object') return payload
    return { ...(payload as Record<string, unknown>), _sdkapi: SDK_API } as T
  }
}

function deferred<T = void>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void
  let rejectPromise!: (reason?: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

function providerConfig(id: string, priority: number): IntelligenceProviderConfig {
  return {
    id,
    type: IntelligenceProviderType.LOCAL,
    name: id,
    enabled: true,
    priority,
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini'],
    capabilities: ['text.chat']
  }
}

function createSyntheticProvider(
  id: string,
  priority: number,
  chat: IntelligenceProviderAdapter['chat'],
  chatStream: IntelligenceProviderAdapter['chatStream']
): IntelligenceProviderAdapter {
  const provider = createChatProvider(providerConfig(id, priority), chat)
  provider.chatStream = chatStream
  return provider
}

function installProviders(providers: IntelligenceProviderAdapter[]): void {
  intelligenceCapabilityRegistry.clear()
  intelligenceCapabilityRegistry.register({
    id: 'text.chat',
    type: IntelligenceCapabilityType.CHAT,
    name: 'Typed Transport Chat',
    description: 'synthetic typed transport integration',
    supportedProviders: [IntelligenceProviderType.LOCAL]
  })
  setIntelligenceProviderManager(new FakeProviderManager(providers))
  tuffIntelligence.updateConfig({
    defaultStrategy: 'adaptive-default',
    enableAudit: true,
    enableQuota: true,
    enableCache: false,
    capabilities: {
      'text.chat': {
        providers: providers.map((provider, index) => ({
          providerId: provider.getConfig().id,
          priority: provider.getConfig().priority ?? index + 1,
          enabled: true
        }))
      }
    }
  })
}

function createPluginClient(pluginName: string) {
  const harness = new ProductionTypedTransportHarness(pluginName)
  return {
    harness,
    sdk: harness.sdk,
    callerId: `plugin:${pluginName}`
  }
}

async function setScenarioQuota(callerId: string): Promise<void> {
  await intelligenceQuotaManager.setQuota({
    callerId,
    callerType: 'plugin',
    requestsPerMinute: 100,
    requestsPerDay: 100,
    requestsPerMonth: 100,
    tokensPerMinute: 100_000,
    tokensPerDay: 100_000,
    tokensPerMonth: 100_000,
    costLimitPerDay: 10,
    costLimitPerMonth: 10,
    enabled: true
  })
}

async function readScenarioLedger(callerId: string) {
  await intelligenceAuditLogger.flushToDB()
  const auditRows = await db
    .select()
    .from(intelligenceAuditLogs)
    .where(eq(intelligenceAuditLogs.caller, callerId))
  const usageRows = await db
    .select()
    .from(intelligenceUsageStats)
    .where(eq(intelligenceUsageStats.callerId, callerId))
  const quotaUsage = await intelligenceQuotaManager.getCurrentUsage(callerId, 'plugin')
  return { auditRows, quotaUsage, usageRows }
}

function expectEmptyUsage(usage: Awaited<ReturnType<typeof readScenarioLedger>>['quotaUsage']) {
  expect(usage).toEqual({
    requestsThisMinute: 0,
    requestsToday: 0,
    requestsThisMonth: 0,
    tokensThisMinute: 0,
    tokensToday: 0,
    tokensThisMonth: 0,
    costToday: 0,
    costThisMonth: 0
  })
}

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'tuff-intelligence-typed-transport-'))
  client = createClient({ url: `file:${join(tempDir, 'typed-transport.sqlite')}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  await intelligenceAuditLogger.destroy()
  intelligenceQuotaManager.clearCache()
}, 60_000)

beforeEach(() => {
  vi.clearAllMocks()
  intelligenceQuotaManager.clearCache()
  permissionMocks.getPluginByName.mockReturnValue({ sdkapi: SDK_API })
  permissionMocks.checkPermission.mockReturnValue({ allowed: true })
  permissionMocks.getPermissionModule.mockReturnValue({
    checkPermission: permissionMocks.checkPermission
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await intelligenceAuditLogger.flushToDB()
  await dbWriteScheduler.drain()
  intelligenceQuotaManager.clearCache()
  intelligenceCapabilityRegistry.clear()
  client?.close()
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
}, 60_000)

describe('Intelligence typed transport integration', () => {
  it('runs an invoke through permission, provider, audit, usage, and quota', async () => {
    const pluginName = 'typed-invoke-success'
    const callerId = `plugin:${pluginName}`
    const chat: IntelligenceProviderAdapter['chat'] = vi.fn(
      async (_payload, options): Promise<IntelligenceInvokeResult<string>> => {
        expect(options.metadata?.caller).toBe(callerId)
        return {
          result: 'invoke-ok',
          usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
          model: 'gpt-4o-mini',
          latency: 31,
          traceId: 'trace-typed-invoke-success',
          provider: 'typed-invoke-runtime'
        }
      }
    )
    const chatStream: IntelligenceProviderAdapter['chatStream'] = vi.fn(async function* () {})
    const provider = createSyntheticProvider('typed-invoke-provider', 1, chat, chatStream)
    installProviders([provider])
    const { sdk } = createPluginClient(pluginName)
    await setScenarioQuota(callerId)

    const result = await sdk.invoke(
      'text.chat',
      { messages: [{ role: 'user', content: 'synthetic invoke' }] },
      { metadata: { caller: 'host:spoofed' } }
    )

    expect(result).toMatchObject({
      result: 'invoke-ok',
      provider: 'typed-invoke-runtime',
      traceId: 'trace-typed-invoke-success'
    })
    expect(chat).toHaveBeenCalledOnce()
    expect(permissionMocks.checkPermission).toHaveBeenCalledWith(
      pluginName,
      'intelligence.basic',
      SDK_API
    )

    const { auditRows, quotaUsage, usageRows } = await readScenarioLedger(callerId)
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0]).toMatchObject({
      traceId: 'trace-typed-invoke-success',
      capabilityId: 'text.chat',
      provider: 'typed-invoke-runtime',
      model: 'gpt-4o-mini',
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
      latency: 31,
      success: true,
      error: null
    })
    expect(usageRows).toHaveLength(2)
    for (const row of usageRows) {
      expect(row).toMatchObject({
        requestCount: 1,
        successCount: 1,
        failureCount: 0,
        totalTokens: 20
      })
    }
    expect(quotaUsage).toMatchObject({
      requestsThisMinute: 1,
      requestsToday: 1,
      requestsThisMonth: 1,
      tokensThisMinute: 20,
      tokensToday: 20,
      tokensThisMonth: 20
    })
  })

  it('denies invoke and stream before provider, audit, or usage work', async () => {
    const pluginName = 'typed-permission-deny'
    const callerId = `plugin:${pluginName}`
    const chat: IntelligenceProviderAdapter['chat'] = vi.fn(async () => {
      throw new Error('provider must not run')
    })
    const chatStream: IntelligenceProviderAdapter['chatStream'] = vi.fn(async function* () {
      throw new Error('provider stream must not run')
    })
    const provider = createSyntheticProvider('typed-denied-provider', 1, chat, chatStream)
    installProviders([provider])
    const { harness, sdk } = createPluginClient(pluginName)
    await setScenarioQuota(callerId)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const denyReasonCanary = 'synthetic-deny-secret-for-typed-permission-deny'
    const denyPathCanary = '/Users/private/.tuff/provider-token.json'
    permissionMocks.checkPermission.mockReturnValue({
      allowed: false,
      reason: `${denyReasonCanary} ${denyPathCanary}`,
      code: 'PERMISSION_DENIED'
    })

    await expect(
      sdk.invoke('text.chat', { messages: [{ role: 'user', content: 'deny invoke' }] })
    ).rejects.toMatchObject({
      code: 'INTELLIGENCE_PERMISSION_DENIED',
      message: 'INTELLIGENCE_PERMISSION_DENIED'
    })

    const onError = vi.fn()
    const onEnd = vi.fn()
    await sdk.stream(
      'text.chat',
      { messages: [{ role: 'user', content: 'deny stream' }] },
      { onError, onEnd }
    )
    await harness.waitForLastStream()

    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      message: 'INTELLIGENCE_PERMISSION_DENIED'
    })
    expect(onEnd).not.toHaveBeenCalled()
    expect(chat).not.toHaveBeenCalled()
    expect(chatStream).not.toHaveBeenCalled()
    const logged = JSON.stringify(consoleError.mock.calls)
    expect(logged).toContain('INTELLIGENCE_PERMISSION_DENIED')
    expect(logged).not.toContain(denyReasonCanary)
    expect(logged).not.toContain(denyPathCanary)
    expect(logged).not.toContain(pluginName)
    expect(logged).not.toContain(String(SDK_API))
    expect(harness.invokeWireReplies).toContainEqual({
      ok: false,
      error: 'INTELLIGENCE_PERMISSION_DENIED'
    })
    expect(JSON.stringify(harness.invokeWireReplies)).not.toContain('stack')

    const { auditRows, quotaUsage, usageRows } = await readScenarioLedger(callerId)
    expect(auditRows).toHaveLength(0)
    expect(usageRows).toHaveLength(0)
    expectEmptyUsage(quotaUsage)
  })

  it('records one terminal stream failure through the typed transport', async () => {
    const pluginName = 'typed-stream-failure'
    const callerId = `plugin:${pluginName}`
    const chat: IntelligenceProviderAdapter['chat'] = vi.fn(async () => {
      throw new Error('invoke must not run')
    })
    const chatStream: IntelligenceProviderAdapter['chatStream'] = vi.fn(async function* () {
      throw new Error('SYNTHETIC_STREAM_FAILURE')
    })
    const provider = createSyntheticProvider('typed-failure-provider', 1, chat, chatStream)
    installProviders([provider])
    const { harness, sdk } = createPluginClient(pluginName)
    await setScenarioQuota(callerId)
    const onDelta = vi.fn()
    const onEnd = vi.fn()
    const onError = vi.fn()

    await sdk.stream(
      'text.chat',
      { messages: [{ role: 'user', content: 'terminal failure' }] },
      { onDelta, onEnd, onError }
    )
    await harness.waitForLastStream()

    expect(chatStream).toHaveBeenCalledOnce()
    expect(onDelta).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledOnce()

    const { auditRows, quotaUsage, usageRows } = await readScenarioLedger(callerId)
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0]).toMatchObject({
      capabilityId: 'text.chat',
      provider: 'typed-failure-provider',
      model: 'gpt-4o-mini',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      success: false,
      error: 'INTELLIGENCE_PROVIDER_FAILED'
    })
    expect(usageRows).toHaveLength(2)
    for (const row of usageRows) {
      expect(row).toMatchObject({ requestCount: 1, successCount: 0, failureCount: 1 })
    }
    expect(quotaUsage).toMatchObject({
      requestsThisMinute: 1,
      requestsToday: 1,
      requestsThisMonth: 1,
      tokensThisMinute: 0,
      tokensToday: 0,
      tokensThisMonth: 0
    })
  })

  it('falls back before the first delta and accounts only the successful provider', async () => {
    const pluginName = 'typed-stream-fallback'
    const callerId = `plugin:${pluginName}`
    const unusedChat: IntelligenceProviderAdapter['chat'] = vi.fn(async () => {
      throw new Error('invoke must not run')
    })
    const primaryStream: IntelligenceProviderAdapter['chatStream'] = vi.fn(async function* () {
      throw new Error('PRIMARY_STREAM_FAILED')
    })
    const fallbackStream: IntelligenceProviderAdapter['chatStream'] = vi.fn(
      async function* (): AsyncGenerator<IntelligenceStreamChunk> {
        yield {
          delta: 'fallback-ok',
          done: false,
          traceId: 'trace-typed-fallback',
          provider: 'typed-fallback-runtime',
          model: 'gpt-4o-mini',
          latency: 47
        }
        yield {
          delta: '',
          done: true,
          usage: { promptTokens: 15, completionTokens: 5, totalTokens: 20 }
        }
      }
    )
    const primary = createSyntheticProvider('typed-primary-provider', 1, unusedChat, primaryStream)
    const fallback = createSyntheticProvider(
      'typed-fallback-provider',
      2,
      unusedChat,
      fallbackStream
    )
    installProviders([primary, fallback])
    const { harness, sdk } = createPluginClient(pluginName)
    await setScenarioQuota(callerId)
    const onStart = vi.fn()
    const onDelta = vi.fn()
    const onEnd = vi.fn()
    const onError = vi.fn()

    await sdk.stream(
      'text.chat',
      { messages: [{ role: 'user', content: 'fallback stream' }] },
      { onStart, onDelta, onEnd, onError }
    )
    await harness.waitForLastStream()

    expect(primaryStream).toHaveBeenCalledOnce()
    expect(fallbackStream).toHaveBeenCalledOnce()
    expect(onStart).toHaveBeenCalledOnce()
    expect(onDelta).toHaveBeenCalledOnce()
    expect(onDelta.mock.calls[0]?.[0]).toBe('fallback-ok')
    expect(onError).not.toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalledOnce()
    expect(onEnd.mock.calls[0]?.[0]).toMatchObject({
      type: 'end',
      traceId: 'trace-typed-fallback',
      provider: 'typed-fallback-runtime',
      result: 'fallback-ok',
      usage: { promptTokens: 15, completionTokens: 5, totalTokens: 20 }
    })

    const { auditRows, quotaUsage, usageRows } = await readScenarioLedger(callerId)
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0]).toMatchObject({
      traceId: 'trace-typed-fallback',
      capabilityId: 'text.chat',
      provider: 'typed-fallback-runtime',
      model: 'gpt-4o-mini',
      promptTokens: 15,
      completionTokens: 5,
      totalTokens: 20,
      latency: 47,
      success: true,
      error: null
    })
    expect(usageRows).toHaveLength(2)
    for (const row of usageRows) {
      expect(row).toMatchObject({
        requestCount: 1,
        successCount: 1,
        failureCount: 0,
        totalTokens: 20
      })
    }
    expect(quotaUsage).toMatchObject({
      requestsThisMinute: 1,
      requestsToday: 1,
      requestsThisMonth: 1,
      tokensThisMinute: 20,
      tokensToday: 20,
      tokensThisMonth: 20
    })
  })

  it('propagates transport cancellation to the provider without callbacks or ledger rows', async () => {
    const pluginName = 'typed-stream-cancel'
    const callerId = `plugin:${pluginName}`
    const releaseProvider = deferred()
    const providerFinally = deferred()
    let providerSignal: AbortSignal | undefined
    const unusedChat: IntelligenceProviderAdapter['chat'] = vi.fn(async () => {
      throw new Error('invoke must not run')
    })
    const chatStream: IntelligenceProviderAdapter['chatStream'] = vi.fn(
      async function* (_payload, options): AsyncGenerator<IntelligenceStreamChunk> {
        providerSignal = (options as IntelligenceInvokeOptions & { signal?: AbortSignal }).signal
        try {
          yield { delta: 'before-cancel', done: false }
          await releaseProvider.promise
          yield { delta: 'after-cancel', done: false }
        } finally {
          providerFinally.resolve()
        }
      }
    )
    const provider = createSyntheticProvider('typed-cancel-provider', 1, unusedChat, chatStream)
    installProviders([provider])
    const { harness, sdk } = createPluginClient(pluginName)
    await setScenarioQuota(callerId)
    const firstDelta = deferred()
    const onStart = vi.fn()
    const onDelta = vi.fn((delta: string) => {
      if (delta === 'before-cancel') firstDelta.resolve()
    })
    const onEnd = vi.fn()
    const onError = vi.fn()

    const controller = await sdk.stream(
      'text.chat',
      { messages: [{ role: 'user', content: 'cancel stream' }] },
      { onStart, onDelta, onEnd, onError }
    )
    await firstDelta.promise
    controller.cancel()
    releaseProvider.resolve()
    await providerFinally.promise
    await harness.waitForLastStream()

    expect(controller.cancelled).toBe(true)
    expect(providerSignal).toBeInstanceOf(AbortSignal)
    expect(providerSignal?.aborted).toBe(true)
    expect(chatStream).toHaveBeenCalledOnce()
    expect(onStart).toHaveBeenCalledOnce()
    expect(onDelta).toHaveBeenCalledOnce()
    expect(onDelta).toHaveBeenCalledWith('before-cancel', expect.any(Object))
    expect(onEnd).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()

    const { auditRows, quotaUsage, usageRows } = await readScenarioLedger(callerId)
    expect(auditRows).toHaveLength(0)
    expect(usageRows).toHaveLength(0)
    expectEmptyUsage(quotaUsage)
  })
})
