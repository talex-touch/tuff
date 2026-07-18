import type {
  IntelligenceAudioTranscribeResult,
  IntelligenceEmbeddingPayload,
  IntelligenceImageEditResult,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceProviderAdapter,
  IntelligenceProviderConfig,
  IntelligenceProviderManagerAdapter,
  IntelligenceStreamEvent,
  IntelligenceSTTResult,
  IntelligenceTTSResult,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult,
  PromptWorkflowExecution
} from '@talex-touch/tuff-intelligence'
import { Buffer } from 'node:buffer'
import {
  IntelligenceCapabilityType,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentManager } from './agents'
import { intelligenceAuditLogger } from './intelligence-audit-logger'
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import { markOuterGovernedInvocation } from './intelligence-invoke-governance'
import { intelligenceQuotaManager } from './intelligence-quota-manager'
import {
  setIntelligenceAutonomousRuntimeAdapter,
  setIntelligenceProviderManager,
  TuffIntelligenceSDK
} from './intelligence-sdk'

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

const autonomousRuntimeMocks = {
  executeAgentCapability: vi.fn(),
  executeWorkflowCapability: vi.fn()
}
setIntelligenceAutonomousRuntimeAdapter(autonomousRuntimeMocks)

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
  vi.restoreAllMocks()
  intelligenceCapabilityRegistry.clear()
  vi.mocked(agentManager.isInitialized).mockReset()
  vi.mocked(agentManager.isInitialized).mockReturnValue(false)
  autonomousRuntimeMocks.executeAgentCapability.mockReset()
  autonomousRuntimeMocks.executeWorkflowCapability.mockReset()
  setIntelligenceAutonomousRuntimeAdapter(autonomousRuntimeMocks)
})

describe('tuffIntelligenceSDK quota verification', () => {
  it('normalizes quota storage failures as QUOTA_CHECK_UNAVAILABLE', async () => {
    vi.spyOn(intelligenceQuotaManager, 'checkQuota').mockRejectedValue(
      new Error('quota storage read failed')
    )
    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: true,
      enableCache: false
    })

    await expect(sdk.checkQuota('quota-unavailable-caller')).rejects.toMatchObject({
      code: 'QUOTA_CHECK_UNAVAILABLE',
      reason: 'Quota verification is unavailable, so the request was blocked.',
      recovery: 'Retry after quota storage recovers or inspect Intelligence quota configuration.'
    })
  })

  it('blocks invoke before provider execution when quota verification fails', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test quota failure handling',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })
    const provider = createProvider(
      {
        id: 'quota-guarded-chat',
        type: IntelligenceProviderType.LOCAL,
        name: 'Quota Guarded Chat',
        enabled: true,
        priority: 1,
        models: ['quota-guarded-chat'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    provider.chat = vi.fn()
    setIntelligenceProviderManager(new FakeProviderManager([provider]))
    vi.spyOn(intelligenceQuotaManager, 'checkQuota').mockRejectedValue(
      new Error('quota storage read failed')
    )

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: true,
      enableCache: false
    })

    await expect(
      sdk.invoke(
        'text.chat',
        { messages: [{ role: 'user', content: 'hello' }] },
        {
          metadata: { caller: 'quota-unavailable-caller' }
        }
      )
    ).rejects.toMatchObject({ code: 'QUOTA_CHECK_UNAVAILABLE' })
    expect(provider.chat).not.toHaveBeenCalled()
  })

  it('blocks stream before provider execution when quota verification fails', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test quota failure handling',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })
    const provider = createProvider(
      {
        id: 'quota-guarded-stream',
        type: IntelligenceProviderType.LOCAL,
        name: 'Quota Guarded Stream',
        enabled: true,
        priority: 1,
        models: ['quota-guarded-stream'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    setIntelligenceProviderManager(new FakeProviderManager([provider]))
    vi.spyOn(intelligenceQuotaManager, 'checkQuota').mockRejectedValue(
      new Error('quota storage read failed')
    )

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: true,
      enableCache: false
    })
    const stream = sdk.stream(
      'text.chat',
      { messages: [{ role: 'user', content: 'hello' }] },
      {
        metadata: { caller: 'quota-unavailable-caller' }
      }
    )

    await expect(stream.next()).rejects.toMatchObject({ code: 'QUOTA_CHECK_UNAVAILABLE' })
    expect(provider.chatStream).not.toHaveBeenCalled()
  })
})

describe('tuffIntelligenceSDK outer-governed invokes', () => {
  it('runs marked invokes without inner governance while unmarked invokes retain it', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test outer invoke governance',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })
    const chatInvoke = vi
      .fn()
      .mockResolvedValueOnce({
        result: 'outer-governed response',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        model: 'governed-chat',
        latency: 4,
        traceId: 'trace-outer-governed',
        provider: IntelligenceProviderType.LOCAL
      })
      .mockResolvedValueOnce({
        result: 'direct response',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        model: 'governed-chat',
        latency: 5,
        traceId: 'trace-direct',
        provider: IntelligenceProviderType.LOCAL
      })
    const provider = createProvider(
      {
        id: 'governed-chat',
        type: IntelligenceProviderType.LOCAL,
        name: 'Governed Chat',
        enabled: true,
        priority: 1,
        models: ['governed-chat'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    provider.chat = chatInvoke
    setIntelligenceProviderManager(new FakeProviderManager([provider]))
    const quotaCheck = vi
      .spyOn(intelligenceQuotaManager, 'checkQuota')
      .mockResolvedValue({ allowed: true })
    const auditLog = vi.spyOn(intelligenceAuditLogger, 'log').mockResolvedValue(undefined)
    const sdk = new TuffIntelligenceSDK({
      enableAudit: true,
      enableQuota: true,
      enableCache: false
    })
    const payload = { messages: [{ role: 'user', content: 'hello' }] }

    const outerGovernedResult = await sdk.invoke<string>(
      'text.chat',
      payload,
      markOuterGovernedInvocation({ metadata: { caller: 'workflow:outer-governed' } })
    )

    expect(outerGovernedResult.result).toBe('outer-governed response')
    expect(chatInvoke).toHaveBeenCalledOnce()
    expect(quotaCheck).not.toHaveBeenCalled()
    expect(auditLog).not.toHaveBeenCalled()

    const directResult = await sdk.invoke<string>('text.chat', payload, {
      metadata: { caller: 'workflow:outer-governed' }
    })

    expect(directResult.result).toBe('direct response')
    expect(chatInvoke).toHaveBeenCalledTimes(2)
    expect(quotaCheck).toHaveBeenCalledOnce()
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityId: 'text.chat',
        caller: 'workflow:outer-governed',
        success: true
      })
    )
  })

  it('preserves provider fallback while suppressing the marked invocation failure audit', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test outer-governed failure audit suppression',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })
    const primaryChat = vi.fn().mockRejectedValue(new Error('primary provider failed'))
    const fallbackChat = vi.fn().mockResolvedValue({
      result: 'fallback response',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'fallback-governed-chat',
      latency: 8,
      traceId: 'trace-outer-governed-fallback',
      provider: IntelligenceProviderType.LOCAL
    })
    const primaryProvider = createProvider(
      {
        id: 'primary-governed-chat',
        type: IntelligenceProviderType.LOCAL,
        name: 'Primary Governed Chat',
        enabled: true,
        priority: 1,
        models: ['primary-governed-chat'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    primaryProvider.chat = primaryChat
    const fallbackProvider = createProvider(
      {
        id: 'fallback-governed-chat',
        type: IntelligenceProviderType.LOCAL,
        name: 'Fallback Governed Chat',
        enabled: true,
        priority: 2,
        models: ['fallback-governed-chat'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    fallbackProvider.chat = fallbackChat
    setIntelligenceProviderManager(new FakeProviderManager([primaryProvider, fallbackProvider]))
    const quotaCheck = vi
      .spyOn(intelligenceQuotaManager, 'checkQuota')
      .mockResolvedValue({ allowed: true })
    const auditLog = vi.spyOn(intelligenceAuditLogger, 'log').mockResolvedValue(undefined)
    const sdk = new TuffIntelligenceSDK({
      enableAudit: true,
      enableQuota: true,
      enableCache: false
    })

    const result = await sdk.invoke<string>(
      'text.chat',
      { messages: [{ role: 'user', content: 'hello' }] },
      markOuterGovernedInvocation({ metadata: { caller: 'workflow:outer-governed' } })
    )

    expect(result.result).toBe('fallback response')
    expect(primaryChat).toHaveBeenCalledOnce()
    expect(fallbackChat).toHaveBeenCalledOnce()
    expect(quotaCheck).not.toHaveBeenCalled()
    expect(auditLog).not.toHaveBeenCalled()
  })
  it('records one fallback success and caches the ordinary invocation', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test ordinary fallback audit and cache',
      supportedProviders: [IntelligenceProviderType.OPENAI, IntelligenceProviderType.CUSTOM]
    })
    const primaryChat = vi.fn().mockRejectedValue(new Error('primary provider failed'))
    const fallbackUsage = { promptTokens: 13, completionTokens: 8, totalTokens: 21 }
    const fallbackChat = vi.fn().mockResolvedValue({
      result: 'cached fallback response',
      usage: fallbackUsage,
      model: 'fallback-model',
      latency: 17,
      traceId: 'trace-ordinary-fallback',
      provider: IntelligenceProviderType.CUSTOM
    })
    const primaryProvider = createProvider(
      {
        id: 'ordinary-primary-chat',
        type: IntelligenceProviderType.OPENAI,
        name: 'Ordinary Primary Chat',
        apiKey: 'ordinary-primary-key',
        enabled: true,
        priority: 1,
        models: ['primary-model'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    primaryProvider.chat = primaryChat
    const fallbackProvider = createProvider(
      {
        id: 'ordinary-fallback-chat',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Ordinary Fallback Chat',
        apiKey: 'ordinary-fallback-key',
        enabled: true,
        priority: 2,
        models: ['fallback-model'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    fallbackProvider.chat = fallbackChat
    setIntelligenceProviderManager(new FakeProviderManager([primaryProvider, fallbackProvider]))
    const auditLog = vi.spyOn(intelligenceAuditLogger, 'log').mockResolvedValue(undefined)
    const sdk = new TuffIntelligenceSDK({
      enableAudit: true,
      enableQuota: false,
      enableCache: true
    })
    const payload = { messages: [{ role: 'user', content: 'cache this fallback' }] }

    const firstResult = await sdk.invoke<string>('text.chat', payload)
    const cachedResult = await sdk.invoke<string>('text.chat', payload)

    expect(firstResult).toMatchObject({
      result: 'cached fallback response',
      provider: IntelligenceProviderType.CUSTOM,
      model: 'fallback-model',
      traceId: 'trace-ordinary-fallback',
      usage: fallbackUsage,
      latency: 17
    })
    expect(cachedResult).toEqual(firstResult)
    expect(primaryChat).toHaveBeenCalledOnce()
    expect(fallbackChat).toHaveBeenCalledOnce()
    expect(auditLog).toHaveBeenCalledTimes(1)
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        provider: IntelligenceProviderType.CUSTOM,
        model: 'fallback-model',
        traceId: 'trace-ordinary-fallback',
        usage: fallbackUsage,
        latency: 17
      })
    )
  })

  it('writes one failure audit and rejects with the primary error when every provider fails', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test ordinary fallback total failure audit',
      supportedProviders: [IntelligenceProviderType.OPENAI, IntelligenceProviderType.CUSTOM]
    })
    const primaryFailure = new Error('primary provider failed')
    const primaryChat = vi.fn().mockRejectedValue(primaryFailure)
    const fallbackChat = vi.fn().mockRejectedValue(new Error('fallback provider failed'))
    const primaryProvider = createProvider(
      {
        id: 'failing-primary-chat',
        type: IntelligenceProviderType.OPENAI,
        name: 'Failing Primary Chat',
        apiKey: 'failing-primary-key',
        enabled: true,
        priority: 1,
        models: ['primary-model'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    primaryProvider.chat = primaryChat
    const fallbackProvider = createProvider(
      {
        id: 'failing-fallback-chat',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Failing Fallback Chat',
        apiKey: 'failing-fallback-key',
        enabled: true,
        priority: 2,
        models: ['fallback-model'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    fallbackProvider.chat = fallbackChat
    setIntelligenceProviderManager(new FakeProviderManager([primaryProvider, fallbackProvider]))
    const auditLog = vi.spyOn(intelligenceAuditLogger, 'log').mockResolvedValue(undefined)
    const sdk = new TuffIntelligenceSDK({
      enableAudit: true,
      enableQuota: false,
      enableCache: true
    })

    await expect(
      sdk.invoke<string>('text.chat', {
        messages: [{ role: 'user', content: 'all providers fail' }]
      })
    ).rejects.toBe(primaryFailure)

    expect(primaryChat).toHaveBeenCalledOnce()
    expect(fallbackChat).toHaveBeenCalledOnce()
    expect(auditLog).toHaveBeenCalledTimes(1)
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        provider: 'failing-primary-chat',
        error: 'primary provider failed'
      })
    )
  })
})

describe('tuffIntelligenceSDK invoke', () => {
  it('exposes canonical domain wrappers matching the renderer transport SDK', async () => {
    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    })
    const invokeCalls: Array<[string, unknown, IntelligenceInvokeOptions | undefined]> = []
    const invoke = vi.fn(
      async <T>(
        capabilityId: string,
        payload: unknown,
        options?: IntelligenceInvokeOptions
      ): Promise<IntelligenceInvokeResult<T>> => {
        invokeCalls.push([capabilityId, payload, options])
        return {
          result: undefined as T,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          model: 'stub-model',
          latency: 0,
          traceId: 'trace-stub',
          provider: IntelligenceProviderType.CUSTOM
        }
      }
    )
    sdk.invoke = invoke as TuffIntelligenceSDK['invoke']

    const options = { metadata: { caller: 'sdk-domain-parity' } }
    const grammarPayload = { text: 'hello' } as Parameters<typeof sdk.text.grammar>[0]
    const intentPayload = { text: 'deploy', possibleIntents: ['deploy'] } as Parameters<
      typeof sdk.intent.detect
    >[0]
    const sentimentPayload = { text: 'great' } as Parameters<typeof sdk.sentiment.analyze>[0]
    const contentPayload = { text: 'Ada Lovelace' } as Parameters<typeof sdk.content.extract>[0]
    const keywordsPayload = { text: 'AI workflow SDK' } as Parameters<
      typeof sdk.keywords.extract
    >[0]
    const captionPayload = { source: { type: 'base64', base64: 'aW1n' } } as Parameters<
      typeof sdk.image.caption
    >[0]
    const analyzePayload = { source: { type: 'base64', base64: 'aW1n' } } as Parameters<
      typeof sdk.image.analyze
    >[0]
    const imageGeneratePayload = { prompt: 'draw a workflow' } as Parameters<
      typeof sdk.image.generate
    >[0]
    const semanticPayload = {
      query: 'workflow',
      documents: [{ id: 'doc-1', content: 'AI SDK' }]
    } as Parameters<typeof sdk.search.semantic>[0]
    const rerankPayload = {
      query: 'workflow',
      documents: [{ id: 'doc-1', content: 'AI SDK' }]
    } as Parameters<typeof sdk.search.rerank>[0]

    await sdk.text.grammar(grammarPayload, options)
    await sdk.intent.detect(intentPayload, options)
    await sdk.sentiment.analyze(sentimentPayload, options)
    await sdk.content.extract(contentPayload, options)
    await sdk.keywords.extract(keywordsPayload, options)
    await sdk.image.caption(captionPayload, options)
    await sdk.image.analyze(analyzePayload, options)
    await sdk.image.generate(imageGeneratePayload, options)
    await sdk.search.semantic(semanticPayload, options)
    await sdk.search.rerank(rerankPayload, options)

    expect(invokeCalls).toEqual([
      ['text.grammar', grammarPayload, options],
      ['intent.detect', intentPayload, options],
      ['sentiment.analyze', sentimentPayload, options],
      ['content.extract', contentPayload, options],
      ['keywords.extract', keywordsPayload, options],
      ['image.caption', captionPayload, options],
      ['image.analyze', analyzePayload, options],
      ['image.generate', imageGeneratePayload, options],
      ['search.semantic', semanticPayload, options],
      ['search.rerank', rerankPayload, options]
    ])
  })
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
  it('composes semantic search from provider embeddings with model preference and skips unusable vectors', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'search.semantic',
      type: IntelligenceCapabilityType.SEMANTIC_SEARCH,
      name: 'Semantic Search',
      description: 'test embedding-backed semantic search capability',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })

    const embedding = vi.fn(
      async (
        payload: IntelligenceEmbeddingPayload
      ): Promise<IntelligenceInvokeResult<number[]>> => {
        if (payload.text === 'semantic query') {
          return {
            result: [1, 0],
            usage: { promptTokens: 4, completionTokens: 0, totalTokens: 4 },
            model: 'embedding-model',
            latency: 8,
            traceId: 'trace-query',
            provider: IntelligenceProviderType.CUSTOM
          }
        }

        if (payload.text === 'generated document') {
          return {
            result: [0.8, 0.6],
            usage: { promptTokens: 3, completionTokens: 0, totalTokens: 3 },
            model: 'embedding-model',
            latency: 6,
            traceId: 'trace-document',
            provider: IntelligenceProviderType.CUSTOM
          }
        }

        throw new Error(`Unexpected embedding text: ${String(payload.text)}`)
      }
    )
    const provider = createProvider(
      {
        id: 'embedding-provider',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Embedding Provider',
        enabled: true,
        priority: 1,
        apiKey: 'embedding-key',
        defaultModel: 'chat-default',
        models: ['chat-default'],
        capabilities: ['search.semantic']
      },
      vi.fn()
    )
    provider.embedding = embedding
    Reflect.deleteProperty(provider, 'semanticSearch')
    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false,
      capabilities: {
        'search.semantic': {
          providers: [
            {
              providerId: 'embedding-provider',
              priority: 1,
              models: ['embedding-model']
            }
          ]
        }
      }
    })

    const result = await sdk.search.semantic({
      query: 'semantic query',
      documents: [
        { id: 'provided-best', content: 'best', embedding: [1, 0] },
        {
          id: 'provided-middle',
          content: 'middle',
          embedding: [0.9, Math.sqrt(1 - 0.9 ** 2)]
        },
        { id: 'generated', content: 'generated document' },
        { id: 'below-threshold', content: 'below threshold', embedding: [0, 1] },
        { id: 'mismatched', content: 'mismatched', embedding: [1, 0, 0] },
        { id: 'invalid', content: 'invalid', embedding: [Number.NaN, 0] }
      ],
      threshold: 0.75,
      topK: 2
    })

    expect(embedding.mock.calls.map(([payload]) => payload)).toEqual([
      { text: 'semantic query', model: 'embedding-model' },
      { text: 'generated document', model: 'embedding-model' }
    ])
    expect(result.result.results.map(({ id }) => id)).toEqual(['provided-best', 'provided-middle'])
    expect(result.result.results[0]?.score).toBeCloseTo(1)
    expect(result.result.results[1]?.score).toBeCloseTo(0.9)
    expect(result).toMatchObject({
      provider: IntelligenceProviderType.CUSTOM,
      model: 'embedding-model',
      traceId: 'trace-query-chunked-1',
      usage: { promptTokens: 7, completionTokens: 0, totalTokens: 7 }
    })
  })
  it('inherits embedding routing when semantic routing has no enabled binding', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'search.semantic',
      type: IntelligenceCapabilityType.SEMANTIC_SEARCH,
      name: 'Semantic Search',
      description: 'test semantic embedding routing inheritance',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })
    intelligenceCapabilityRegistry.register({
      id: 'embedding.generate',
      type: IntelligenceCapabilityType.EMBEDDING,
      name: 'Embedding',
      description: 'test embedding routing',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })

    const embedding = vi.fn(async (payload: IntelligenceEmbeddingPayload) => ({
      result: [1, 0],
      usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
      model: 'embedding-binding-model',
      latency: 1,
      traceId: `trace-${payload.text}`,
      provider: IntelligenceProviderType.CUSTOM
    }))
    const provider = createProvider(
      {
        id: 'embedding-route-provider',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Embedding Route Provider',
        enabled: true,
        priority: 1,
        apiKey: 'embedding-route-key',
        defaultModel: 'chat-only-default',
        models: ['chat-only-default'],
        capabilities: ['embedding.generate']
      },
      vi.fn()
    )
    provider.embedding = embedding
    Reflect.deleteProperty(provider, 'semanticSearch')
    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const result = await new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false,
      capabilities: {
        'search.semantic': {
          providers: [
            {
              providerId: 'embedding-route-provider',
              priority: 1,
              enabled: false,
              models: ['disabled-semantic-model']
            }
          ]
        },
        'embedding.generate': {
          providers: [
            {
              providerId: 'embedding-route-provider',
              priority: 1,
              enabled: true,
              models: ['embedding-binding-model']
            }
          ]
        }
      }
    }).search.semantic({
      query: 'inheritance query',
      documents: [{ id: 'inheritance-document', content: 'inheritance document' }]
    })

    expect(embedding.mock.calls.map(([payload]) => payload)).toEqual([
      { text: 'inheritance query', model: 'embedding-binding-model' },
      { text: 'inheritance document', model: 'embedding-binding-model' }
    ])
    expect(result.result.results).toEqual([
      { id: 'inheritance-document', content: 'inheritance document', score: 1 }
    ])
  })

  it('falls back after each unusable query vector instead of returning an empty semantic result', async () => {
    const invalidQueryVectors: Array<[name: string, vector: number[]]> = [
      ['NaN', [Number.NaN, 0]],
      ['Infinity', [Number.POSITIVE_INFINITY, 0]],
      ['zero norm', [0, 0]]
    ]

    for (const [_name, invalidQueryVector] of invalidQueryVectors) {
      intelligenceCapabilityRegistry.clear()
      intelligenceCapabilityRegistry.register({
        id: 'search.semantic',
        type: IntelligenceCapabilityType.SEMANTIC_SEARCH,
        name: 'Semantic Search',
        description: 'test invalid semantic query vector fallback',
        supportedProviders: [IntelligenceProviderType.CUSTOM]
      })

      const primaryEmbedding = vi.fn(async () => ({
        result: invalidQueryVector,
        usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
        model: 'primary-embedding-model',
        latency: 1,
        traceId: 'trace-primary-invalid',
        provider: IntelligenceProviderType.CUSTOM
      }))
      const fallbackEmbedding = vi.fn(async () => ({
        result: [1, 0],
        usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
        model: 'fallback-embedding-model',
        latency: 1,
        traceId: 'trace-fallback-valid',
        provider: IntelligenceProviderType.CUSTOM
      }))
      const primaryProvider = createProvider(
        {
          id: 'invalid-vector-primary',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Invalid Vector Primary',
          enabled: true,
          priority: 1,
          apiKey: 'invalid-vector-primary-key',
          defaultModel: 'primary-embedding-model',
          models: ['primary-embedding-model']
        },
        vi.fn()
      )
      primaryProvider.embedding = primaryEmbedding
      Reflect.deleteProperty(primaryProvider, 'semanticSearch')
      const fallbackProvider = createProvider(
        {
          id: 'invalid-vector-fallback',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Invalid Vector Fallback',
          enabled: true,
          priority: 2,
          apiKey: 'invalid-vector-fallback-key',
          defaultModel: 'fallback-embedding-model',
          models: ['fallback-embedding-model']
        },
        vi.fn()
      )
      fallbackProvider.embedding = fallbackEmbedding
      Reflect.deleteProperty(fallbackProvider, 'semanticSearch')
      setIntelligenceProviderManager(new FakeProviderManager([primaryProvider, fallbackProvider]))

      const result = await new TuffIntelligenceSDK({
        enableAudit: false,
        enableQuota: false,
        enableCache: false,
        capabilities: {
          'search.semantic': {
            providers: [
              {
                providerId: 'invalid-vector-primary',
                priority: 1,
                models: ['primary-embedding-model']
              },
              {
                providerId: 'invalid-vector-fallback',
                priority: 2,
                models: ['fallback-embedding-model']
              }
            ]
          }
        }
      }).search.semantic({
        query: 'invalid vector query',
        documents: [{ id: 'fallback-document', content: 'fallback document', embedding: [1, 0] }]
      })

      expect(result).toMatchObject({
        result: {
          results: [{ id: 'fallback-document', score: 1 }]
        },
        model: 'fallback-embedding-model'
      })
      expect(primaryEmbedding).toHaveBeenCalledOnce()
      expect(fallbackEmbedding).toHaveBeenCalledOnce()
    }
  })

  it('returns selected semantic metadata without embedding an empty document set', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'search.semantic',
      type: IntelligenceCapabilityType.SEMANTIC_SEARCH,
      name: 'Semantic Search',
      description: 'test empty semantic documents',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })

    const embedding = vi.fn().mockRejectedValue(new Error('embedding must not be called'))
    const provider = createProvider(
      {
        id: 'empty-document-provider',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Empty Document Provider',
        enabled: true,
        priority: 1,
        apiKey: 'empty-document-key',
        defaultModel: 'empty-document-model',
        models: ['empty-document-model']
      },
      vi.fn()
    )
    provider.embedding = embedding
    Reflect.deleteProperty(provider, 'semanticSearch')
    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const result = await new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false,
      capabilities: {
        'search.semantic': {
          providers: [
            {
              providerId: 'empty-document-provider',
              priority: 1,
              models: ['empty-document-model']
            }
          ]
        }
      }
    }).search.semantic({ query: 'empty documents', documents: [] })

    expect(result).toMatchObject({
      result: { results: [] },
      provider: 'empty-document-provider',
      model: 'empty-document-model'
    })
    expect(embedding).not.toHaveBeenCalled()
  })

  it('uses the fallback provider embedding model after native semantic search fails', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'search.semantic',
      type: IntelligenceCapabilityType.SEMANTIC_SEARCH,
      name: 'Semantic Search',
      description: 'test native semantic fallback embedding model',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })

    const nativeSemanticSearch = vi.fn().mockRejectedValue(new Error('native semantic unavailable'))
    const fallbackEmbedding = vi.fn(async (payload: IntelligenceEmbeddingPayload) => ({
      result: [1, 0],
      usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
      model: 'fallback-embedding-model',
      latency: 1,
      traceId: `trace-fallback-${payload.text}`,
      provider: IntelligenceProviderType.CUSTOM
    }))
    const primaryProvider = createProvider(
      {
        id: 'native-semantic-primary',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Native Semantic Primary',
        enabled: true,
        priority: 1,
        apiKey: 'native-semantic-primary-key',
        defaultModel: 'chat-primary-model',
        models: ['chat-primary-model']
      },
      vi.fn()
    )
    primaryProvider.semanticSearch = nativeSemanticSearch
    const fallbackProvider = createProvider(
      {
        id: 'embedding-semantic-fallback',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Embedding Semantic Fallback',
        enabled: true,
        priority: 2,
        apiKey: 'embedding-semantic-fallback-key',
        defaultModel: 'chat-fallback-model',
        models: ['chat-fallback-model']
      },
      vi.fn()
    )
    fallbackProvider.embedding = fallbackEmbedding
    Reflect.deleteProperty(fallbackProvider, 'semanticSearch')
    setIntelligenceProviderManager(new FakeProviderManager([primaryProvider, fallbackProvider]))

    const result = await new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false,
      capabilities: {
        'search.semantic': {
          providers: [
            {
              providerId: 'native-semantic-primary',
              priority: 1,
              models: ['primary-native-model']
            },
            {
              providerId: 'embedding-semantic-fallback',
              priority: 2,
              models: ['fallback-embedding-model']
            }
          ]
        }
      }
    }).search.semantic({
      query: 'fallback model query',
      documents: [
        { id: 'fallback-model-document', content: 'fallback document', embedding: [1, 0] }
      ]
    })

    expect(nativeSemanticSearch).toHaveBeenCalledOnce()
    expect(fallbackEmbedding).toHaveBeenCalledWith(
      { text: 'fallback model query', model: 'fallback-embedding-model' },
      expect.any(Object)
    )
    expect(result).toMatchObject({
      result: { results: [{ id: 'fallback-model-document', score: 1 }] },
      model: 'fallback-embedding-model'
    })
  })

  it('prefers a provider native semantic search implementation over embeddings', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'search.semantic',
      type: IntelligenceCapabilityType.SEMANTIC_SEARCH,
      name: 'Semantic Search',
      description: 'test native semantic search capability',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })

    const embedding = vi.fn().mockRejectedValue(new Error('embeddings must not be called'))
    const nativeSemanticSearch = vi.fn().mockResolvedValue({
      result: {
        results: [{ id: 'native-result', content: 'native result', score: 1 }]
      },
      usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 },
      model: 'native-semantic-model',
      latency: 3,
      traceId: 'trace-native-semantic',
      provider: IntelligenceProviderType.CUSTOM
    })
    const provider = createProvider(
      {
        id: 'native-semantic-provider',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Native Semantic Provider',
        enabled: true,
        priority: 1,
        apiKey: 'native-semantic-key',
        capabilities: ['search.semantic']
      },
      vi.fn()
    )
    provider.embedding = embedding
    provider.semanticSearch = nativeSemanticSearch
    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const result = await new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    }).search.semantic({
      query: 'native query',
      documents: [{ id: 'native-document', content: 'native document' }]
    })

    expect(result).toMatchObject({
      result: { results: [{ id: 'native-result', score: 1 }] },
      provider: IntelligenceProviderType.CUSTOM,
      model: 'native-semantic-model',
      traceId: 'trace-native-semantic',
      usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 }
    })
    expect(embedding).not.toHaveBeenCalled()
  })
  it('composes reranking from embeddings with normalized scores, stable original ranks, and topK', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'search.rerank',
      type: IntelligenceCapabilityType.RERANK,
      name: 'Document Reranking',
      description: 'test embedding-backed rerank capability',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })

    const embedding = vi.fn(
      async (
        payload: IntelligenceEmbeddingPayload
      ): Promise<IntelligenceInvokeResult<number[]>> => {
        const vectors: Record<string, number[]> = {
          'Which policy is most relevant?': [1, 0],
          'The middle policy is related.': [0, 1],
          'The opposing policy is unrelated.': [-1, 0],
          'The exact policy is most relevant.': [1, 0]
        }
        const text = typeof payload.text === 'string' ? payload.text : undefined
        const result = text ? vectors[text] : undefined
        if (!result || !text) {
          throw new Error(`Unexpected embedding text: ${String(payload.text)}`)
        }

        return {
          result,
          usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
          model: 'local-embedding',
          latency: 1,
          traceId: `embedding-${text}`,
          provider: IntelligenceProviderType.LOCAL
        }
      }
    )
    const provider = createProvider(
      {
        id: 'local-generic-rerank',
        type: IntelligenceProviderType.LOCAL,
        name: 'Local Generic Rerank',
        enabled: true,
        priority: 1,
        models: ['local-embedding'],
        capabilities: ['embedding.generate']
      },
      vi.fn()
    )
    provider.embedding = embedding
    Reflect.deleteProperty(provider, 'rerank')
    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const result = await new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    }).search.rerank({
      query: 'Which policy is most relevant?',
      documents: [
        {
          id: 'middle-policy',
          content: 'The middle policy is related.',
          metadata: { source: 'middle', version: 2 }
        },
        {
          id: 'opposing-policy',
          content: 'The opposing policy is unrelated.',
          metadata: { source: 'opposing' }
        },
        {
          id: 'exact-policy',
          content: 'The exact policy is most relevant.',
          metadata: { source: 'exact', version: 3 }
        }
      ],
      topK: 2
    })

    expect(embedding.mock.calls.map(([payload]) => payload)).toEqual([
      { text: 'Which policy is most relevant?' },
      { text: 'The middle policy is related.' },
      { text: 'The opposing policy is unrelated.' },
      { text: 'The exact policy is most relevant.' }
    ])
    expect(result.result.results).toEqual([
      {
        id: 'exact-policy',
        content: 'The exact policy is most relevant.',
        score: 1,
        originalRank: 2,
        metadata: { source: 'exact', version: 3 }
      },
      {
        id: 'middle-policy',
        content: 'The middle policy is related.',
        score: 0.5,
        originalRank: 0,
        metadata: { source: 'middle', version: 2 }
      }
    ])
    expect(result.result.results.every(({ score }) => score >= 0 && score <= 1)).toBe(true)
  })

  it('rejects an empty generic rerank query before embedding', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'search.rerank',
      type: IntelligenceCapabilityType.RERANK,
      name: 'Document Reranking',
      description: 'test generic rerank query validation',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })

    const embedding = vi.fn().mockRejectedValue(new Error('embedding must not be called'))
    const provider = createProvider(
      {
        id: 'local-generic-rerank-empty-query',
        type: IntelligenceProviderType.LOCAL,
        name: 'Local Generic Rerank',
        enabled: true,
        priority: 1,
        models: ['local-embedding'],
        capabilities: ['embedding.generate']
      },
      vi.fn()
    )
    provider.embedding = embedding
    Reflect.deleteProperty(provider, 'rerank')
    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    await expect(
      new TuffIntelligenceSDK({
        enableAudit: false,
        enableQuota: false,
        enableCache: false
      }).search.rerank({
        query: ' \t ',
        documents: [{ id: 'document', content: 'A rerank document.' }]
      })
    ).rejects.toThrow('[Intelligence] Rerank query is required')
    expect(embedding).not.toHaveBeenCalled()
  })

  it('prefers a provider native rerank implementation over embeddings', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'search.rerank',
      type: IntelligenceCapabilityType.RERANK,
      name: 'Document Reranking',
      description: 'test native rerank capability',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })

    const embedding = vi.fn().mockRejectedValue(new Error('embeddings must not be called'))
    const nativeRerank = vi.fn().mockResolvedValue({
      result: {
        results: [
          {
            id: 'native-result',
            content: 'Native rerank result.',
            score: 0.7,
            originalRank: 0,
            metadata: { source: 'native' }
          }
        ]
      },
      usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 },
      model: 'native-rerank-model',
      latency: 3,
      traceId: 'trace-native-rerank',
      provider: IntelligenceProviderType.LOCAL
    })
    const provider = createProvider(
      {
        id: 'native-rerank-provider',
        type: IntelligenceProviderType.LOCAL,
        name: 'Native Rerank Provider',
        enabled: true,
        priority: 1,
        capabilities: ['search.rerank', 'embedding.generate']
      },
      vi.fn()
    )
    provider.embedding = embedding
    provider.rerank = nativeRerank
    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const result = await new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    }).search.rerank({
      query: 'native query',
      documents: [{ id: 'native-document', content: 'Native rerank result.' }]
    })

    expect(result).toMatchObject({
      result: {
        results: [
          {
            id: 'native-result',
            content: 'Native rerank result.',
            score: 0.7,
            originalRank: 0,
            metadata: { source: 'native' }
          }
        ]
      },
      provider: IntelligenceProviderType.LOCAL,
      model: 'native-rerank-model',
      traceId: 'trace-native-rerank',
      usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 }
    })
    expect(embedding).not.toHaveBeenCalled()
  })

  it('composes RAG from embeddings and chat while exposing only retrieved source context', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'rag.query',
      type: IntelligenceCapabilityType.RAG_QUERY,
      name: 'RAG Query',
      description: 'test embedding and chat RAG fallback capability',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })

    const embedding = vi.fn(
      async (
        payload: IntelligenceEmbeddingPayload
      ): Promise<IntelligenceInvokeResult<number[]>> => {
        const vectors: Record<string, number[]> = {
          'Which policy applies to compatibility windows?': [1, 0],
          'Compatibility windows reject remote URLs.': [0.8, 0.6],
          'The indexing runtime owns durable search mutations.': [0, 1]
        }
        const text = typeof payload.text === 'string' ? payload.text : undefined
        const result = text ? vectors[text] : undefined
        if (!result || !text) {
          throw new Error(`Unexpected embedding text: ${String(payload.text)}`)
        }

        return {
          result,
          usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
          model: 'local-embedding',
          latency: 1,
          traceId: `embedding-${text}`,
          provider: IntelligenceProviderType.LOCAL
        }
      }
    )
    const chat = vi.fn().mockResolvedValue({
      result: 'Compatibility windows reject remote URLs.',
      usage: { promptTokens: 4, completionTokens: 3, totalTokens: 7 },
      model: 'local-chat',
      latency: 2,
      traceId: 'rag-chat',
      provider: IntelligenceProviderType.LOCAL
    })
    const provider = createProvider(
      {
        id: 'local-generic-rag',
        type: IntelligenceProviderType.LOCAL,
        name: 'Local Generic RAG',
        enabled: true,
        priority: 1,
        models: ['local-chat'],
        capabilities: ['rag.query']
      },
      vi.fn()
    )
    provider.embedding = embedding
    provider.chat = chat
    Reflect.deleteProperty(provider, 'ragQuery')
    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const result = await new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    }).rag.query({
      query: 'Which policy applies to compatibility windows?',
      documents: [
        {
          id: 'remote-url-policy',
          content: 'Compatibility windows reject remote URLs.',
          metadata: { policy: 'compatibility-window', severity: 'critical' }
        },
        {
          id: 'indexing-policy',
          content: 'The indexing runtime owns durable search mutations.',
          metadata: { policy: 'indexing' }
        }
      ],
      topK: 1
    })

    expect(embedding.mock.calls.map(([payload]) => payload)).toEqual([
      { text: 'Which policy applies to compatibility windows?' },
      { text: 'Compatibility windows reject remote URLs.' },
      { text: 'The indexing runtime owns durable search mutations.' }
    ])
    expect(chat).toHaveBeenCalledOnce()
    const [chatPayload] = chat.mock.calls[0] ?? []
    const prompt = chatPayload.messages.map(({ content }) => content).join('\n')
    expect(prompt).toContain('Compatibility windows reject remote URLs.')
    expect(prompt).not.toContain('The indexing runtime owns durable search mutations.')
    expect(result.result.answer).toBe('Compatibility windows reject remote URLs.')
    expect(result.result.sources).toEqual([
      {
        id: 'remote-url-policy',
        content: 'Compatibility windows reject remote URLs.',
        relevance: expect.closeTo(0.8),
        metadata: { policy: 'compatibility-window', severity: 'critical' }
      }
    ])
    expect(result.result.confidence).toBeCloseTo(result.result.sources[0]?.relevance ?? 0)
  })

  it('rejects generic RAG without caller-provided documents before chat', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'rag.query',
      type: IntelligenceCapabilityType.RAG_QUERY,
      name: 'RAG Query',
      description: 'test missing RAG documents',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })

    const embedding = vi.fn().mockRejectedValue(new Error('embedding must not be called'))
    const chat = vi.fn().mockRejectedValue(new Error('chat must not be called'))
    const provider = createProvider(
      {
        id: 'local-generic-rag-no-documents',
        type: IntelligenceProviderType.LOCAL,
        name: 'Local Generic RAG',
        enabled: true,
        priority: 1,
        models: ['local-chat'],
        capabilities: ['rag.query']
      },
      vi.fn()
    )
    provider.embedding = embedding
    provider.chat = chat
    Reflect.deleteProperty(provider, 'ragQuery')
    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    await expect(
      new TuffIntelligenceSDK({
        enableAudit: false,
        enableQuota: false,
        enableCache: false
      }).rag.query({ query: 'Which policy applies?' })
    ).rejects.toThrow('[Intelligence] RAG query requires caller-provided documents')
    expect(embedding).not.toHaveBeenCalled()
    expect(chat).not.toHaveBeenCalled()
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

  it('renders top-level prompt fields before legacy metadata and configured prompt bindings', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test prompt template precedence',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })

    const chatInvoke = vi.fn().mockResolvedValue({
      result: 'ok',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'chat-local',
      latency: 10,
      traceId: 'trace-explicit-template',
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
          promptBinding: {
            capabilityId: 'text.chat',
            promptId: 'configured.text.chat',
            promptVersion: '1.0.0'
          }
        }
      },
      promptRegistry: [
        {
          id: 'configured.text.chat',
          version: '1.0.0',
          template: 'Configured {{topic}} instructions',
          scope: 'capability',
          status: 'active',
          capabilityId: 'text.chat',
          updatedAt: 1
        }
      ]
    })

    await sdk.invoke(
      'text.chat',
      { messages: [{ role: 'user', content: 'hello' }] },
      {
        promptTemplate: 'Explicit {{topic}} instructions',
        promptVariables: { topic: 'top-level' },
        metadata: {
          promptTemplate: 'Legacy {{topic}} instructions',
          promptVariables: { topic: 'metadata' }
        }
      }
    )

    const [payload] = chatInvoke.mock.calls[0] ?? []
    expect(payload.messages).toEqual([
      { role: 'system', content: 'Explicit top-level instructions' },
      { role: 'user', content: 'hello' }
    ])
  })

  it('preserves the rendered explicit prompt when a chat provider falls back', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test chat prompt fallback',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })

    const primaryChat = vi.fn().mockRejectedValue(new Error('primary unavailable'))
    const fallbackChat = vi.fn().mockResolvedValue({
      result: 'fallback response',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'fallback-chat',
      latency: 10,
      traceId: 'trace-fallback-template',
      provider: IntelligenceProviderType.LOCAL
    })
    const primaryProvider = createProvider(
      {
        id: 'chat-primary',
        type: IntelligenceProviderType.LOCAL,
        name: 'Chat Primary',
        enabled: true,
        priority: 1,
        models: ['primary-chat'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    primaryProvider.chat = primaryChat
    const fallbackProvider = createProvider(
      {
        id: 'chat-fallback',
        type: IntelligenceProviderType.LOCAL,
        name: 'Chat Fallback',
        enabled: true,
        priority: 2,
        models: ['fallback-chat'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    fallbackProvider.chat = fallbackChat
    setIntelligenceProviderManager(new FakeProviderManager([primaryProvider, fallbackProvider]))

    const result = await new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false,
      capabilities: {
        'text.chat': {
          providers: [
            { providerId: 'chat-primary', priority: 1 },
            { providerId: 'chat-fallback', priority: 2 }
          ]
        }
      }
    }).invoke<string>(
      'text.chat',
      { messages: [{ role: 'user', content: 'hello' }] },
      {
        promptTemplate: 'Answer {{subject}} precisely',
        promptVariables: { subject: 'the fallback request' },
        metadata: {
          promptTemplate: 'Legacy {{subject}} prompt',
          promptVariables: { subject: 'metadata request' }
        }
      }
    )

    const expectedMessages = [
      { role: 'system', content: 'Answer the fallback request precisely' },
      { role: 'user', content: 'hello' }
    ]
    expect(result.result).toBe('fallback response')
    expect(primaryChat).toHaveBeenCalledOnce()
    expect(fallbackChat).toHaveBeenCalledOnce()
    expect(primaryChat.mock.calls[0]?.[0].messages).toEqual(expectedMessages)
    expect(fallbackChat.mock.calls[0]?.[0].messages).toEqual(expectedMessages)
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

  it('adopts backend stream metadata for delta, usage, and end events', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test chat capability',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })

    async function* streamChunks() {
      yield {
        delta: 'back',
        done: false,
        traceId: 'trace_backend_42',
        provider: 'backend-router',
        model: 'backend-model',
        latency: 321
      }
      yield { delta: 'end', done: false }
      yield {
        delta: '',
        done: true,
        usage: { promptTokens: 5, completionTokens: 8, totalTokens: 13 }
      }
    }

    const provider = createProvider(
      {
        id: 'configured-stream-provider',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Configured Stream Provider',
        enabled: true,
        priority: 1,
        defaultModel: 'configured-stream-model',
        apiKey: 'stream-test-key',
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
          providers: [{ providerId: 'configured-stream-provider', priority: 1 }]
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
    expect(events.filter((event) => event.type === 'delta')).toEqual([
      expect.objectContaining({
        delta: 'back',
        content: 'back',
        traceId: 'trace_backend_42',
        provider: 'backend-router',
        model: 'backend-model'
      }),
      expect.objectContaining({
        delta: 'end',
        content: 'backend',
        traceId: 'trace_backend_42',
        provider: 'backend-router',
        model: 'backend-model'
      })
    ])
    expect(events.find((event) => event.type === 'usage')).toMatchObject({
      traceId: 'trace_backend_42',
      provider: 'backend-router',
      model: 'backend-model',
      usage: { promptTokens: 5, completionTokens: 8, totalTokens: 13 }
    })
    expect(events.at(-1)).toMatchObject({
      type: 'end',
      traceId: 'trace_backend_42',
      provider: 'backend-router',
      model: 'backend-model',
      result: 'backend',
      usage: { promptTokens: 5, completionTokens: 8, totalTokens: 13 },
      metadata: { latency: 321 }
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
    expect(events.map((event) => event.type)).toEqual(['start', 'delta', 'usage', 'end'])
    expect(events.at(-1)).toMatchObject({
      type: 'end',
      provider: 'local-default',
      result: 'local',
      content: 'local',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
    })
  })

  it('propagates selected stream failures after a delta without invoking fallback', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test post-delta stream fallback guard',
      supportedProviders: [IntelligenceProviderType.CUSTOM, IntelligenceProviderType.LOCAL]
    })

    const streamError = new Error('PRIMARY_STREAM_INTERRUPTED')
    async function* selectedStreamChunks() {
      yield { delta: 'primary', done: false }
      throw streamError
    }
    async function* fallbackStreamChunks() {
      yield { delta: 'fallback', done: false }
    }

    const selectedProvider = createProvider(
      {
        id: 'selected-stream-provider',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Selected Stream Provider',
        enabled: true,
        priority: 1,
        apiKey: 'selected-stream-key',
        models: ['selected-stream-model'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    selectedProvider.chatStream = vi.fn(() => selectedStreamChunks())

    const fallbackProvider = createProvider(
      {
        id: 'local-stream-fallback',
        type: IntelligenceProviderType.LOCAL,
        name: 'Local Stream Fallback',
        enabled: true,
        priority: 2,
        models: ['local-stream-model'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    fallbackProvider.chatStream = vi.fn(() => fallbackStreamChunks())
    setIntelligenceProviderManager(new FakeProviderManager([selectedProvider, fallbackProvider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false,
      capabilities: {
        'text.chat': {
          providers: [
            { providerId: 'selected-stream-provider', priority: 1, enabled: true },
            { providerId: 'local-stream-fallback', priority: 2, enabled: true }
          ]
        }
      }
    })

    const events: IntelligenceStreamEvent<string>[] = []
    const consume = async () => {
      for await (const event of sdk.stream<string>('text.chat', {
        messages: [{ role: 'user', content: 'hello' }]
      })) {
        events.push(event)
      }
    }

    await expect(consume()).rejects.toBe(streamError)
    expect(events.filter((event) => event.type === 'delta').map((event) => event.delta)).toEqual([
      'primary'
    ])
    expect(selectedProvider.chatStream).toHaveBeenCalledOnce()
    expect(fallbackProvider.chatStream).not.toHaveBeenCalled()
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

  it('dispatches image.edit wrapper to provider imageEdit capability', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'image.edit',
      type: IntelligenceCapabilityType.IMAGE_EDIT,
      name: 'Image Editing',
      description: 'test image edit capability',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })

    const imageEditInvoke = vi.fn().mockResolvedValue({
      result: {
        image: { base64: 'edited-image-base64' },
        revisedPrompt: 'Add a red scarf'
      } satisfies IntelligenceImageEditResult,
      usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
      model: 'image-edit-1',
      latency: 21,
      traceId: 'trace-image-edit',
      provider: IntelligenceProviderType.CUSTOM
    })

    const provider = createProvider(
      {
        id: 'custom-image-edit',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Custom Image Edit',
        enabled: true,
        priority: 1,
        apiKey: 'image-edit-key',
        models: ['image-edit-1'],
        capabilities: ['image.edit']
      },
      vi.fn()
    )
    provider.imageEdit = imageEditInvoke

    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    })

    const payload = {
      source: { type: 'data-url' as const, dataUrl: 'data:image/png;base64,source-base64' },
      mask: { type: 'base64' as const, base64: 'mask-base64' },
      prompt: 'Add a red scarf',
      editType: 'inpaint' as const
    }

    const result = await sdk.image.edit(payload)

    expect(result.result.image.base64).toBe('edited-image-base64')
    expect(result.result.revisedPrompt).toBe('Add a red scarf')
    expect(imageEditInvoke).toHaveBeenCalledOnce()
    expect(imageEditInvoke.mock.calls[0]?.[0]).toEqual(payload)
    expect(imageEditInvoke.mock.calls[0]?.[1]).toMatchObject({
      metadata: { capabilityId: 'image.edit' }
    })
  })

  it('dispatches audio.tts wrapper to provider TTS capability', async () => {
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

    const payload = {
      text: 'Hello',
      voice: 'alloy',
      format: 'mp3' as const
    }

    const result = await sdk.audio.tts(payload)

    expect(result.result.audio).toBe('data:audio/mpeg;base64,AAAA')
    expect(ttsInvoke).toHaveBeenCalledOnce()
    expect(ttsInvoke.mock.calls[0]?.[0]).toEqual(payload)
    expect(ttsInvoke.mock.calls[0]?.[1]).toMatchObject({
      metadata: { capabilityId: 'audio.tts' }
    })
  })

  it('dispatches audio.stt wrapper to provider STT capability', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'audio.stt',
      type: IntelligenceCapabilityType.STT,
      name: 'Speech-to-Text',
      description: 'test stt capability',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })

    const sttInvoke = vi.fn().mockResolvedValue({
      result: {
        text: 'launch sequence',
        confidence: 0.91,
        language: 'en',
        segments: [{ text: 'launch sequence', start: 0, end: 1.8, confidence: 0.91 }]
      } satisfies IntelligenceSTTResult,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: 'stt-1',
      latency: 18,
      traceId: 'trace-stt',
      provider: IntelligenceProviderType.CUSTOM
    })

    const provider = createProvider(
      {
        id: 'custom-stt',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Custom STT',
        enabled: true,
        priority: 1,
        apiKey: 'stt-key',
        models: ['stt-1'],
        capabilities: ['audio.stt']
      },
      vi.fn()
    )
    provider.stt = sttInvoke

    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    })

    const payload = {
      audio: 'data:audio/wav;base64,AAAA',
      language: 'en',
      format: 'wav',
      enableTimestamps: true
    }

    const result = await sdk.audio.stt(payload)

    expect(result.result.text).toBe('launch sequence')
    expect(result.result.confidence).toBe(0.91)
    expect(sttInvoke).toHaveBeenCalledOnce()
    expect(sttInvoke.mock.calls[0]?.[0]).toEqual(payload)
    expect(sttInvoke.mock.calls[0]?.[1]).toMatchObject({
      metadata: { capabilityId: 'audio.stt' }
    })
  })

  it('dispatches audio.transcribe wrapper to provider audioTranscribe capability', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'audio.transcribe',
      type: IntelligenceCapabilityType.AUDIO_TRANSCRIBE,
      name: 'Audio Transcription',
      description: 'test audio transcription capability',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })

    const audioTranscribeInvoke = vi.fn().mockResolvedValue({
      result: {
        text: 'bonjour',
        language: 'fr',
        duration: 2.4,
        segments: [{ id: 0, text: 'bonjour', start: 0, end: 2.4, confidence: 0.96 }]
      } satisfies IntelligenceAudioTranscribeResult,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: 'transcribe-1',
      latency: 24,
      traceId: 'trace-transcribe',
      provider: IntelligenceProviderType.CUSTOM
    })

    const provider = createProvider(
      {
        id: 'custom-transcribe',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Custom Transcribe',
        enabled: true,
        priority: 1,
        apiKey: 'transcribe-key',
        models: ['transcribe-1'],
        capabilities: ['audio.transcribe']
      },
      vi.fn()
    )
    provider.audioTranscribe = audioTranscribeInvoke

    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    })

    const payload = {
      audio: 'data:audio/mpeg;base64,BBBB',
      language: 'fr',
      format: 'mp3',
      task: 'transcribe' as const,
      enableTimestamps: true,
      prompt: 'Short greeting'
    }

    const result = await sdk.audio.transcribe(payload)

    expect(result.result.text).toBe('bonjour')
    expect(result.result.duration).toBe(2.4)
    expect(audioTranscribeInvoke).toHaveBeenCalledOnce()
    expect(provider.stt).not.toHaveBeenCalled()
    expect(audioTranscribeInvoke.mock.calls[0]?.[0]).toEqual(payload)
    expect(audioTranscribeInvoke.mock.calls[0]?.[1]).toMatchObject({
      metadata: { capabilityId: 'audio.transcribe' }
    })
  })

  it('dispatches workflow.execute wrapper to orchestration runtime', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'workflow.execute',
      type: IntelligenceCapabilityType.WORKFLOW,
      name: 'Workflow Execution',
      description: 'test workflow capability',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })

    const workflowInvoke = autonomousRuntimeMocks.executeWorkflowCapability
    workflowInvoke.mockResolvedValue({
      result: {
        id: 'execution-1',
        workflowId: 'workflow-alpha',
        status: 'completed',
        startedAt: 100,
        completedAt: 120,
        inputs: { topic: 'release' },
        outputs: { summary: 'done' },
        steps: [
          {
            stepId: 'summarize',
            status: 'completed',
            startedAt: 100,
            completedAt: 120,
            input: { topic: 'release' },
            output: 'done'
          }
        ]
      } satisfies PromptWorkflowExecution,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'workflow-runtime',
      latency: 20,
      traceId: 'trace-workflow',
      provider: 'intelligence-runtime'
    })

    const provider = createProvider(
      {
        id: 'custom-workflow',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Custom Workflow',
        enabled: true,
        priority: 1,
        apiKey: 'workflow-key',
        models: ['workflow-runtime'],
        capabilities: ['workflow.execute']
      },
      vi.fn()
    )

    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    })

    const payload = { workflowId: 'workflow-alpha', inputs: { topic: 'release' } }

    const result = await sdk.workflow.execute(payload, { metadata: { sessionId: 'session-1' } })

    expect(result.result.status).toBe('completed')
    expect(result.result.outputs?.summary).toBe('done')
    expect(workflowInvoke).toHaveBeenCalledOnce()
    expect(workflowInvoke.mock.calls[0]?.[0]).toEqual(payload)
    expect(workflowInvoke.mock.calls[0]?.[1]).toMatchObject({
      metadata: {
        capabilityId: 'workflow.execute',
        sessionId: 'session-1'
      }
    })
  })

  it('dispatches workflow.execute through the runtime for a text.chat-only provider', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'workflow.execute',
      type: IntelligenceCapabilityType.WORKFLOW,
      name: 'Workflow Execution',
      description: 'test chat-backed workflow capability',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })

    const workflowInvoke = autonomousRuntimeMocks.executeWorkflowCapability
    workflowInvoke.mockResolvedValue({
      result: {
        id: 'chat-backed-execution',
        workflowId: 'workflow-chat-backed',
        status: 'completed',
        startedAt: 100,
        completedAt: 110,
        inputs: { release: '2.5.0' },
        outputs: { summary: 'workflow completed through chat runtime' },
        steps: []
      } satisfies PromptWorkflowExecution,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'chat-runtime-model',
      latency: 10,
      traceId: 'trace-chat-backed-workflow',
      provider: 'intelligence-runtime'
    })

    const undeclaredProvider = createProvider(
      {
        id: 'workflow-without-chat-declaration',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Workflow Without Chat Declaration',
        enabled: true,
        priority: 1,
        apiKey: 'undeclared-key',
        models: ['undeclared-model'],
        capabilities: ['embedding.generate']
      },
      vi.fn()
    )
    const chatBackedProvider = createProvider(
      {
        id: 'workflow-chat-runtime',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Workflow Chat Runtime',
        enabled: true,
        priority: 2,
        apiKey: 'chat-runtime-key',
        models: ['chat-runtime-model'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    Reflect.deleteProperty(chatBackedProvider, 'agent')
    setIntelligenceProviderManager(
      new FakeProviderManager([undeclaredProvider, chatBackedProvider])
    )

    const payload = { workflowId: 'workflow-chat-backed', inputs: { release: '2.5.0' } }
    const result = await new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false,
      capabilities: {
        'text.chat': {
          providers: [
            {
              providerId: 'workflow-without-chat-declaration',
              priority: 1,
              models: ['undeclared-model']
            },
            {
              providerId: 'workflow-chat-runtime',
              priority: 2,
              models: ['workflow-chat-bound-model']
            }
          ]
        }
      }
    }).workflow.execute(payload, { metadata: { sessionId: 'workflow-chat-session' } })

    expect(result.result.outputs?.summary).toBe('workflow completed through chat runtime')
    expect(workflowInvoke).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({
        allowedProviderIds: ['workflow-chat-runtime'],
        modelPreference: ['workflow-chat-bound-model'],
        metadata: {
          capabilityId: 'workflow.execute',
          sessionId: 'workflow-chat-session'
        }
      })
    )
  })

  it('dispatches agent.run through the runtime for a text.chat-only provider', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'agent.run',
      type: IntelligenceCapabilityType.AGENT,
      name: 'Agent Execution',
      description: 'test chat-backed agent capability',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })
    vi.mocked(agentManager.isInitialized).mockReturnValue(false)

    const agentInvoke = autonomousRuntimeMocks.executeAgentCapability
    agentInvoke.mockResolvedValue({
      result: {
        result: 'Prioritize the release validation checklist.',
        steps: [
          {
            thought: 'validate release',
            observation: 'Prioritize the release validation checklist.'
          }
        ],
        toolCalls: [],
        iterations: 1
      },
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
      model: 'chat-runtime-model',
      latency: 12,
      traceId: 'trace-chat-backed-agent',
      provider: 'intelligence-runtime'
    })

    const undeclaredProvider = createProvider(
      {
        id: 'agent-without-chat-declaration',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Agent Without Chat Declaration',
        enabled: true,
        priority: 1,
        apiKey: 'undeclared-key',
        models: ['undeclared-model'],
        capabilities: ['embedding.generate']
      },
      vi.fn()
    )
    const chatBackedProvider = createProvider(
      {
        id: 'agent-chat-runtime',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Agent Chat Runtime',
        enabled: true,
        priority: 2,
        apiKey: 'chat-runtime-key',
        models: ['chat-runtime-model'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    Reflect.deleteProperty(chatBackedProvider, 'agent')
    setIntelligenceProviderManager(
      new FakeProviderManager([undeclaredProvider, chatBackedProvider])
    )

    const payload = { task: 'Prepare the release validation checklist.' }
    const result = await new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false,
      capabilities: {
        'text.chat': {
          providers: [
            {
              providerId: 'agent-without-chat-declaration',
              priority: 1,
              models: ['undeclared-model']
            },
            {
              providerId: 'agent-chat-runtime',
              priority: 2,
              models: ['agent-chat-bound-model']
            }
          ]
        }
      }
    }).agent.run(payload, { metadata: { sessionId: 'agent-chat-session' } })

    expect(result.result.result).toBe('Prioritize the release validation checklist.')
    expect(agentInvoke).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({
        allowedProviderIds: ['agent-chat-runtime'],
        modelPreference: ['agent-chat-bound-model'],
        metadata: {
          capabilityId: 'agent.run',
          sessionId: 'agent-chat-session'
        }
      })
    )
  })
})
