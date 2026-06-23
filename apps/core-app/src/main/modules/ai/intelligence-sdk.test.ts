import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  IntelligenceCapabilityType,
  IntelligenceProviderType,
  type IntelligenceInvokeOptions,
  type IntelligenceInvokeResult,
  type IntelligenceProviderAdapter,
  type IntelligenceProviderConfig,
  type IntelligenceProviderManagerAdapter,
  type IntelligenceStreamEvent,
  type IntelligenceTTSResult,
  type IntelligenceVisionOcrPayload,
  type IntelligenceVisionOcrResult
} from '@talex-touch/tuff-intelligence'
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import { TuffIntelligenceSDK, setIntelligenceProviderManager } from './intelligence-sdk'

const { appMock } = vi.hoisted(() => ({
  appMock: {
    commandLine: { appendSwitch: vi.fn() },
    getAppPath: vi.fn(() => '/tmp/app'),
    getPath: vi.fn(() => '/tmp'),
    on: vi.fn(),
    once: vi.fn(),
    setAppLogsPath: vi.fn(),
    setPath: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn(),
    isPackaged: false
  }
}))

vi.mock('electron', () => {
  const electronMock = {
    __esModule: true as const,
    app: appMock,
    BrowserWindow: class BrowserWindow {},
    crashReporter: {
      start: vi.fn()
    },
    Tray: class Tray {},
    MessageChannelMain: class MessageChannelMain {
      port1 = {
        on: vi.fn(),
        postMessage: vi.fn(),
        start: vi.fn(),
        close: vi.fn()
      }
      port2 = {
        on: vi.fn(),
        postMessage: vi.fn(),
        start: vi.fn(),
        close: vi.fn()
      }
    },
    Menu: {
      buildFromTemplate: vi.fn(),
      setApplicationMenu: vi.fn()
    },
    nativeImage: {
      createFromPath: vi.fn()
    },
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn(),
      removeHandler: vi.fn()
    }
  }

  return {
    ...electronMock,
    default: electronMock
  }
})

vi.mock('talex-mica-electron', () => ({
  IS_WINDOWS_11: false,
  WIN10: false,
  MicaBrowserWindow: class MicaBrowserWindow {},
  useMicaElectron: vi.fn()
}))

vi.mock('@sentry/electron/main', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn((fn: (scope: unknown) => void) =>
    fn({
      setTag: vi.fn(),
      setContext: vi.fn(),
      setExtra: vi.fn()
    })
  ),
  getCurrentScope: vi.fn(() => ({
    setTag: vi.fn(),
    setContext: vi.fn(),
    setUser: vi.fn()
  })),
  flush: vi.fn(async () => true)
}))

vi.mock('./agents', () => ({
  agentManager: {
    isInitialized: vi.fn(() => false),
    executeTaskImmediate: vi.fn()
  }
}))

vi.mock('./intelligence-deepagent-orchestration', () => ({
  intelligenceDeepAgentOrchestrationService: {
    executeAgentCapability: vi.fn(),
    executeWorkflowCapability: vi.fn()
  }
}))

interface TestProvider extends IntelligenceProviderAdapter {
  visionOcr: (
    payload: IntelligenceVisionOcrPayload,
    options: IntelligenceInvokeOptions
  ) => Promise<IntelligenceInvokeResult<IntelligenceVisionOcrResult>>
}

class FakeProviderManager implements IntelligenceProviderManagerAdapter {
  private providers = new Map<string, TestProvider>()

  constructor(providers: TestProvider[]) {
    for (const provider of providers) {
      this.providers.set(provider.getConfig().id, provider)
    }
  }

  registerFactory(): void {}

  clear(): void {
    this.providers.clear()
  }

  registerFromConfig(): IntelligenceProviderAdapter {
    throw new Error('not needed in test')
  }

  getEnabled(): IntelligenceProviderAdapter[] {
    return Array.from(this.providers.values()).filter((provider) => provider.isEnabled())
  }

  get(providerId: string): IntelligenceProviderAdapter | undefined {
    return this.providers.get(providerId)
  }

  createProviderInstance(config: IntelligenceProviderConfig): IntelligenceProviderAdapter {
    const provider = this.providers.get(config.id)
    if (!provider) {
      throw new Error(`provider not found: ${config.id}`)
    }
    return provider
  }
}

function createProvider(
  config: IntelligenceProviderConfig,
  visionOcr: TestProvider['visionOcr']
): TestProvider {
  return {
    getConfig: () => config,
    updateConfig: vi.fn(),
    isEnabled: () => config.enabled,
    chat: vi.fn(),
    chatStream: vi.fn(),
    embedding: vi.fn(),
    translate: vi.fn(),
    visionOcr,
    summarize: vi.fn(),
    rewrite: vi.fn(),
    grammarCheck: vi.fn(),
    codeGenerate: vi.fn(),
    codeExplain: vi.fn(),
    codeReview: vi.fn(),
    codeRefactor: vi.fn(),
    codeDebug: vi.fn(),
    intentDetect: vi.fn(),
    sentimentAnalyze: vi.fn(),
    contentExtract: vi.fn(),
    keywordsExtract: vi.fn(),
    classification: vi.fn(),
    imageCaption: vi.fn(),
    imageAnalyze: vi.fn(),
    imageGenerate: vi.fn(),
    imageEdit: vi.fn(),
    tts: vi.fn(),
    stt: vi.fn(),
    audioTranscribe: vi.fn(),
    ragQuery: vi.fn(),
    semanticSearch: vi.fn(),
    rerank: vi.fn(),
    agent: vi.fn()
  } as unknown as TestProvider
}

afterEach(() => {
  intelligenceCapabilityRegistry.clear()
})

describe('TuffIntelligenceSDK invoke', () => {
  it('passes testRun through non-local provider connection tests', async () => {
    const chat = vi.fn().mockResolvedValue({
      result: 'ok',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'chat-local',
      latency: 10,
      traceId: 'trace-chat',
      provider: IntelligenceProviderType.LOCAL
    })
    const providerConfig = {
      id: 'chat-local',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Chat Local',
      enabled: true,
      priority: 1,
      apiKey: 'test-key',
      models: ['chat-local'],
      capabilities: ['text.chat']
    }
    const provider = createProvider(providerConfig, vi.fn())
    provider.chat = chat
    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    })

    const result = await sdk.testProvider(providerConfig)

    expect(result.success).toBe(true)
    expect(chat).toHaveBeenCalledWith(expect.any(Object), {
      timeout: 30000,
      testRun: true
    })
  })

  it('uses lightweight local model probe for local provider connection tests', async () => {
    const providerConfig = {
      id: 'chat-local',
      type: IntelligenceProviderType.LOCAL,
      name: 'Chat Local',
      enabled: true,
      priority: 1,
      baseUrl: 'http://localhost:11434',
      models: ['chat-local'],
      capabilities: ['text.chat']
    }
    const provider = createProvider(providerConfig, vi.fn())
    provider.chat = vi.fn()
    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    })

    const network = await import('../network')
    const requestSpy = vi.spyOn(network.getNetworkService(), 'request').mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { models: [{ name: 'chat-local' }] },
      url: 'http://localhost:11434/api/tags',
      ok: true
    })

    const result = await sdk.testProvider(providerConfig)

    expect(result.success).toBe(true)
    expect(provider.chat).not.toHaveBeenCalled()
    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'http://localhost:11434/api/tags',
        skipCooldownCheck: true,
        cooldownPolicy: expect.objectContaining({
          key: 'chat-local:ollama.chat'
        })
      })
    )
    requestSpy.mockRestore()
  })

  it('returns a stable code for provider cooldown failures', async () => {
    const cooldownError = Object.assign(new Error('Network guard cooldown active for key "x"'), {
      name: 'NetworkCooldownError',
      code: 'NETWORK_COOLDOWN_ACTIVE',
      retryAfterMs: 2300
    })
    const providerConfig = {
      id: 'chat-local',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Chat Local',
      enabled: true,
      apiKey: 'test-key',
      priority: 1,
      models: ['chat-local'],
      capabilities: ['text.chat']
    }
    const provider = createProvider(providerConfig, vi.fn())
    provider.chat = vi.fn().mockRejectedValue(cooldownError)
    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    })

    const result = await sdk.testProvider(providerConfig)

    expect(result).toMatchObject({
      success: false,
      code: 'NETWORK_COOLDOWN_ACTIVE',
      message: 'NETWORK_COOLDOWN_ACTIVE:3'
    })
    expect(result.message).not.toContain('Network guard cooldown')
  })

  it('falls back to secondary provider when primary provider fails', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'vision.ocr',
      type: IntelligenceCapabilityType.VISION_OCR,
      name: 'Vision OCR',
      description: 'test capability',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })

    const firstProviderVision = vi.fn().mockRejectedValue(new Error('primary provider failed'))
    const secondProviderVision = vi.fn().mockResolvedValue({
      result: {
        text: 'fallback text'
      } as IntelligenceVisionOcrResult,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: 'system-ocr',
      latency: 12,
      traceId: 'trace-fallback',
      provider: IntelligenceProviderType.LOCAL
    })

    const firstProvider = createProvider(
      {
        id: 'local-primary',
        type: IntelligenceProviderType.LOCAL,
        name: 'Local Primary',
        enabled: true,
        priority: 1,
        models: ['system-ocr'],
        capabilities: ['vision.ocr']
      },
      firstProviderVision
    )

    const secondProvider = createProvider(
      {
        id: 'local-fallback',
        type: IntelligenceProviderType.LOCAL,
        name: 'Local Fallback',
        enabled: true,
        priority: 2,
        models: ['system-ocr'],
        capabilities: ['vision.ocr']
      },
      secondProviderVision
    )

    setIntelligenceProviderManager(new FakeProviderManager([firstProvider, secondProvider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    })

    const result = await sdk.invoke<IntelligenceVisionOcrResult>('vision.ocr', {
      source: {
        type: 'base64',
        base64: Buffer.from('image-data').toString('base64')
      }
    })

    expect(result.result.text).toBe('fallback text')
    expect(firstProviderVision).toHaveBeenCalledOnce()
    expect(secondProviderVision).toHaveBeenCalledOnce()
  })

  it('skips guest Nexus provider before routing and uses the next available provider', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test capability',
      supportedProviders: [IntelligenceProviderType.CUSTOM, IntelligenceProviderType.LOCAL]
    })

    const nexusChat = vi.fn().mockRejectedValue(new Error('NEXUS_AUTH_REQUIRED'))
    const localChat = vi.fn().mockResolvedValue({
      result: 'fallback chat',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'local-chat',
      latency: 8,
      traceId: 'trace-local-chat',
      provider: IntelligenceProviderType.LOCAL
    })

    const nexusProvider = createProvider(
      {
        id: 'tuff-nexus-default',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Tuff Nexus',
        enabled: true,
        priority: 1,
        apiKey: 'guest',
        capabilities: ['text.chat'],
        metadata: { origin: 'tuff-nexus', tokenMode: 'guest' }
      },
      vi.fn()
    )
    nexusProvider.chat = nexusChat

    const localProvider = createProvider(
      {
        id: 'local-chat',
        type: IntelligenceProviderType.LOCAL,
        name: 'Local Chat',
        enabled: true,
        priority: 2,
        models: ['local-chat'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    localProvider.chat = localChat

    setIntelligenceProviderManager(new FakeProviderManager([nexusProvider, localProvider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    })

    const result = await sdk.invoke<string>('text.chat', {
      messages: [{ role: 'user', content: 'hello' }]
    })

    expect(result.result).toBe('fallback chat')
    expect(nexusChat).not.toHaveBeenCalled()
    expect(localChat).toHaveBeenCalledOnce()
  })

  it('ignores stale enabled Nexus capability binding when the provider is disabled', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test capability',
      supportedProviders: [IntelligenceProviderType.CUSTOM, IntelligenceProviderType.LOCAL]
    })

    const nexusChat = vi.fn().mockRejectedValue(new Error('NEXUS_AUTH_REQUIRED'))
    const localChat = vi.fn().mockResolvedValue({
      result: 'local chat',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'qwen2.5:3b',
      latency: 7,
      traceId: 'trace-local-chat',
      provider: IntelligenceProviderType.LOCAL
    })

    const nexusProvider = createProvider(
      {
        id: 'tuff-nexus-default',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Tuff Nexus',
        enabled: false,
        priority: 1,
        apiKey: 'guest',
        capabilities: ['text.chat'],
        metadata: { origin: 'tuff-nexus', tokenMode: 'guest' }
      },
      vi.fn()
    )
    nexusProvider.chat = nexusChat

    const localProvider = createProvider(
      {
        id: 'local-default',
        type: IntelligenceProviderType.LOCAL,
        name: 'Local Ollama',
        enabled: true,
        priority: 2,
        models: ['qwen2.5:3b'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    localProvider.chat = localChat

    setIntelligenceProviderManager(new FakeProviderManager([nexusProvider, localProvider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false,
      capabilities: {
        'text.chat': {
          providers: [
            { providerId: 'tuff-nexus-default', priority: 1, enabled: true },
            { providerId: 'local-default', priority: 1, enabled: true, models: [] }
          ]
        }
      }
    })

    const result = await sdk.invoke<string>('text.chat', {
      messages: [{ role: 'user', content: 'hello' }]
    })

    expect(result.result).toBe('local chat')
    expect(nexusChat).not.toHaveBeenCalled()
    expect(localChat).toHaveBeenCalledOnce()
  })

  it('fails explicit unavailable provider selection instead of silently falling back', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test capability',
      supportedProviders: [IntelligenceProviderType.CUSTOM, IntelligenceProviderType.LOCAL]
    })

    const localChat = vi.fn().mockResolvedValue({
      result: 'local chat',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'qwen2.5:3b',
      latency: 7,
      traceId: 'trace-local-chat',
      provider: IntelligenceProviderType.LOCAL
    })

    const localProvider = createProvider(
      {
        id: 'local-default',
        type: IntelligenceProviderType.LOCAL,
        name: 'Local Ollama',
        enabled: true,
        priority: 1,
        models: ['qwen2.5:3b'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    localProvider.chat = localChat

    setIntelligenceProviderManager(new FakeProviderManager([localProvider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    })

    await expect(
      sdk.invoke<string>(
        'text.chat',
        { messages: [{ role: 'user', content: 'hello' }] },
        {
          preferredProviderId: 'tuff-nexus-default',
          modelPreference: ['nexus-default']
        }
      )
    ).rejects.toThrow('[Intelligence] No enabled providers for text.chat')
    expect(localChat).not.toHaveBeenCalled()
  })

  it('fails explicit provider runtime errors instead of silently falling back', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test capability',
      supportedProviders: [IntelligenceProviderType.CUSTOM, IntelligenceProviderType.LOCAL]
    })

    const nexusChat = vi.fn().mockRejectedValue(new Error('NEXUS_AUTH_REQUIRED'))
    const localChat = vi.fn().mockResolvedValue({
      result: 'local chat',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'qwen2.5:3b',
      latency: 7,
      traceId: 'trace-local-chat',
      provider: IntelligenceProviderType.LOCAL
    })

    const nexusProvider = createProvider(
      {
        id: 'tuff-nexus-default',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Tuff Nexus',
        enabled: true,
        priority: 1,
        apiKey: 'nexus-token',
        models: ['nexus-default'],
        capabilities: ['text.chat'],
        metadata: { origin: 'tuff-nexus', tokenMode: 'auth' }
      },
      vi.fn()
    )
    nexusProvider.chat = nexusChat

    const localProvider = createProvider(
      {
        id: 'local-default',
        type: IntelligenceProviderType.LOCAL,
        name: 'Local Ollama',
        enabled: true,
        priority: 2,
        models: ['qwen2.5:3b'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    localProvider.chat = localChat

    setIntelligenceProviderManager(new FakeProviderManager([nexusProvider, localProvider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    })

    await expect(
      sdk.invoke<string>(
        'text.chat',
        { messages: [{ role: 'user', content: 'hello' }] },
        {
          preferredProviderId: 'tuff-nexus-default',
          modelPreference: ['nexus-default']
        }
      )
    ).rejects.toThrow('NEXUS_AUTH_REQUIRED')
    expect(nexusChat).toHaveBeenCalledOnce()
    expect(localChat).not.toHaveBeenCalled()
  })

  it('renders routing prompt template before chat invoke', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test chat capability',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })

    const chatInvoke = vi.fn().mockResolvedValue({
      result: { message: 'ok' },
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'chat-local',
      latency: 10,
      traceId: 'trace-chat',
      provider: IntelligenceProviderType.LOCAL
    })

    const provider = createProvider(
      {
        id: 'chat-local',
        type: IntelligenceProviderType.LOCAL,
        name: 'Chat Local',
        enabled: true,
        priority: 1,
        models: ['chat-local'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    provider.chat = chatInvoke

    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false,
      capabilities: {
        'text.chat': {
          providers: [{ providerId: 'chat-local', priority: 1 }],
          promptTemplate: 'You are {{topic}} assistant'
        }
      }
    })

    await sdk.invoke(
      'text.chat',
      {
        messages: [{ role: 'user', content: 'hello' }]
      },
      {
        metadata: {
          promptVariables: {
            topic: 'OCR'
          }
        }
      }
    )

    expect(chatInvoke).toHaveBeenCalledOnce()
    const [payload] = chatInvoke.mock.calls[0] ?? []
    expect(payload.messages[0]).toEqual({
      role: 'system',
      content: 'You are OCR assistant'
    })
    expect(payload.messages[1]).toEqual({ role: 'user', content: 'hello' })
  })

  it('streams text.chat deltas from provider chatStream', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test chat capability',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })

    async function* streamChunks() {
      yield { delta: '你', done: false }
      yield { delta: '好', done: false }
      yield {
        delta: '',
        done: true,
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 }
      }
    }

    const provider = createProvider(
      {
        id: 'chat-local',
        type: IntelligenceProviderType.LOCAL,
        name: 'Chat Local',
        enabled: true,
        priority: 1,
        models: ['chat-local'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    provider.chatStream = vi.fn(() => streamChunks())
    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false,
      capabilities: {
        'text.chat': {
          providers: [{ providerId: 'chat-local', priority: 1 }]
        }
      }
    })

    const events: IntelligenceStreamEvent<string>[] = []
    for await (const event of sdk.stream<string>('text.chat', {
      messages: [{ role: 'user', content: 'hello' }]
    })) {
      events.push(event)
    }

    expect(events.map((event) => event.type)).toEqual(['start', 'delta', 'delta', 'usage', 'end'])
    expect(events.filter((event) => event.type === 'delta').map((event) => event.delta)).toEqual([
      '你',
      '好'
    ])
    expect(events.at(-1)).toMatchObject({
      type: 'end',
      result: '你好',
      content: '你好',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 }
    })
  })

  it('streams through local routing without touching disabled Nexus providers', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test chat capability',
      supportedProviders: [IntelligenceProviderType.CUSTOM, IntelligenceProviderType.LOCAL]
    })

    async function* localStreamChunks() {
      yield { delta: 'local', done: false }
      yield {
        delta: '',
        done: true,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      }
    }

    const nexusProvider = createProvider(
      {
        id: 'tuff-nexus-default',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Tuff Nexus',
        enabled: false,
        priority: 1,
        apiKey: 'guest',
        capabilities: ['text.chat'],
        metadata: { origin: 'tuff-nexus', tokenMode: 'guest' }
      },
      vi.fn()
    )
    nexusProvider.chatStream = vi.fn(async function* () {
      throw new Error('NEXUS_STREAM_UNSUPPORTED')
    })

    const localProvider = createProvider(
      {
        id: 'local-default',
        type: IntelligenceProviderType.LOCAL,
        name: 'Local Ollama',
        enabled: true,
        priority: 2,
        models: ['llama3.1'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    localProvider.chatStream = vi.fn(() => localStreamChunks())

    setIntelligenceProviderManager(new FakeProviderManager([nexusProvider, localProvider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false,
      capabilities: {
        'text.chat': {
          providers: [
            { providerId: 'tuff-nexus-default', priority: 1, enabled: false },
            { providerId: 'local-default', priority: 2, enabled: true, models: ['llama3.1'] }
          ]
        }
      }
    })

    const events: IntelligenceStreamEvent<string>[] = []
    for await (const event of sdk.stream<string>('text.chat', {
      messages: [{ role: 'user', content: 'hello' }]
    })) {
      events.push(event)
    }

    expect(nexusProvider.chatStream).not.toHaveBeenCalled()
    expect(localProvider.chatStream).toHaveBeenCalledOnce()
    expect(events.map((event) => event.type)).toEqual(['start', 'delta', 'usage', 'end'])
    expect(events.at(-1)).toMatchObject({
      type: 'end',
      result: 'local',
      content: 'local',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
    })
  })

  it('falls back to local stream when selected Nexus stream requires auth', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test chat capability',
      supportedProviders: [IntelligenceProviderType.CUSTOM, IntelligenceProviderType.LOCAL]
    })

    async function* localStreamChunks() {
      yield { delta: 'local', done: false }
      yield {
        delta: '',
        done: true,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      }
    }

    const nexusProvider = createProvider(
      {
        id: 'tuff-nexus-default',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Tuff Nexus',
        enabled: true,
        priority: 1,
        apiKey: 'nexus-token',
        models: ['nexus-default'],
        capabilities: ['text.chat'],
        metadata: { origin: 'tuff-nexus', tokenMode: 'auth' }
      },
      vi.fn()
    )
    nexusProvider.chatStream = vi.fn(async function* () {
      throw new Error('NEXUS_AUTH_REQUIRED')
    })

    const localProvider = createProvider(
      {
        id: 'local-default',
        type: IntelligenceProviderType.LOCAL,
        name: 'Local Ollama',
        enabled: true,
        priority: 2,
        models: ['llama3.1'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    localProvider.chatStream = vi.fn(() => localStreamChunks())

    setIntelligenceProviderManager(new FakeProviderManager([nexusProvider, localProvider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false,
      capabilities: {
        'text.chat': {
          providers: [
            { providerId: 'tuff-nexus-default', priority: 1, enabled: true },
            { providerId: 'local-default', priority: 2, enabled: true }
          ]
        }
      }
    })

    const events: IntelligenceStreamEvent<string>[] = []
    for await (const event of sdk.stream<string>('text.chat', {
      messages: [{ role: 'user', content: 'hello' }]
    })) {
      events.push(event)
    }

    expect(nexusProvider.chatStream).toHaveBeenCalledOnce()
    expect(localProvider.chatStream).toHaveBeenCalledOnce()
    expect(events.at(-1)).toMatchObject({
      type: 'end',
      provider: 'local-default',
      result: 'local',
      content: 'local',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
    })
  })

  it('fails explicit stream provider errors instead of silently falling back', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test chat capability',
      supportedProviders: [IntelligenceProviderType.CUSTOM, IntelligenceProviderType.LOCAL]
    })

    async function* localStreamChunks() {
      yield { delta: 'local', done: false }
    }

    const nexusProvider = createProvider(
      {
        id: 'tuff-nexus-default',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Tuff Nexus',
        enabled: true,
        priority: 1,
        apiKey: 'nexus-token',
        models: ['nexus-default'],
        capabilities: ['text.chat'],
        metadata: { origin: 'tuff-nexus', tokenMode: 'auth' }
      },
      vi.fn()
    )
    nexusProvider.chatStream = vi.fn(async function* () {
      throw new Error('NEXUS_AUTH_REQUIRED')
    })

    const localProvider = createProvider(
      {
        id: 'local-default',
        type: IntelligenceProviderType.LOCAL,
        name: 'Local Ollama',
        enabled: true,
        priority: 2,
        models: ['llama3.1'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    localProvider.chatStream = vi.fn(() => localStreamChunks())

    setIntelligenceProviderManager(new FakeProviderManager([nexusProvider, localProvider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false,
      capabilities: {
        'text.chat': {
          providers: [
            { providerId: 'tuff-nexus-default', priority: 1, enabled: true },
            { providerId: 'local-default', priority: 2, enabled: true }
          ]
        }
      }
    })

    const consume = async () => {
      const events: IntelligenceStreamEvent<string>[] = []
      for await (const event of sdk.stream<string>(
        'text.chat',
        { messages: [{ role: 'user', content: 'hello' }] },
        {
          preferredProviderId: 'tuff-nexus-default',
          modelPreference: ['nexus-default']
        }
      )) {
        events.push(event)
      }
      return events
    }

    await expect(consume()).rejects.toThrow('NEXUS_AUTH_REQUIRED')
    expect(nexusProvider.chatStream).toHaveBeenCalledOnce()
    expect(localProvider.chatStream).not.toHaveBeenCalled()
  })

  it('dispatches audio.tts to provider TTS capability', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'audio.tts',
      type: IntelligenceCapabilityType.TTS,
      name: 'Text-to-Speech',
      description: 'test tts capability',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })

    const ttsInvoke = vi.fn().mockResolvedValue({
      result: {
        audio: 'data:audio/mpeg;base64,AAAA',
        format: 'mp3'
      } satisfies IntelligenceTTSResult,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: 'tts-1',
      latency: 15,
      traceId: 'trace-tts',
      provider: IntelligenceProviderType.CUSTOM
    })

    const provider = createProvider(
      {
        id: 'custom-tts',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Custom TTS',
        enabled: true,
        priority: 1,
        apiKey: 'tts-key',
        models: ['tts-1'],
        capabilities: ['audio.tts']
      },
      vi.fn()
    )
    provider.tts = ttsInvoke

    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    })

    const result = await sdk.invoke<IntelligenceTTSResult>('audio.tts', {
      text: 'Hello',
      voice: 'alloy',
      format: 'mp3'
    })

    expect(result.result.audio).toBe('data:audio/mpeg;base64,AAAA')
    expect(ttsInvoke).toHaveBeenCalledOnce()
    expect(ttsInvoke.mock.calls[0]?.[0]).toMatchObject({
      text: 'Hello',
      voice: 'alloy',
      format: 'mp3'
    })
  })

  it('resolves DeepAgent runtime config from non-Anthropic provider selection', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test chat capability',
      supportedProviders: [IntelligenceProviderType.OPENAI, IntelligenceProviderType.ANTHROPIC]
    })

    const anthropicProvider = createProvider(
      {
        id: 'anthropic-primary',
        type: IntelligenceProviderType.ANTHROPIC,
        name: 'Anthropic Primary',
        enabled: true,
        priority: 1,
        models: ['claude-3-7-sonnet'],
        capabilities: ['text.chat'],
        apiKey: 'anthropic-key',
        baseUrl: 'https://api.anthropic.com/v1'
      },
      vi.fn()
    )

    const openaiProvider = createProvider(
      {
        id: 'openai-fallback',
        type: IntelligenceProviderType.OPENAI,
        name: 'OpenAI Fallback',
        enabled: true,
        priority: 2,
        models: ['gpt-4.1-mini'],
        defaultModel: 'gpt-4.1-mini',
        capabilities: ['text.chat'],
        apiKey: 'openai-key'
      },
      vi.fn()
    )

    setIntelligenceProviderManager(new FakeProviderManager([anthropicProvider, openaiProvider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    })

    const config = await sdk.resolveDeepAgentRuntimeConfig('text.chat')

    expect(config.providerId).toBe('openai-fallback')
    expect(config.providerType).toBe(IntelligenceProviderType.OPENAI)
    expect(config.baseUrl).toBe('https://api.openai.com/v1')
    expect(config.apiKey).toBe('openai-key')
    expect(config.model).toBe('gpt-4.1-mini')
  })
})
