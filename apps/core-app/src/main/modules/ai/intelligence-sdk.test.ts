import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  IntelligenceCapabilityType,
  IntelligenceProviderType,
  type IntelligenceInvokeOptions,
  type IntelligenceInvokeResult,
  type IntelligenceProviderAdapter,
  type IntelligenceProviderConfig,
  type IntelligenceProviderManagerAdapter,
  type IntelligenceVisionOcrPayload,
  type IntelligenceVisionOcrResult
} from '@talex-touch/utils'
import { aiCapabilityRegistry } from './intelligence-capability-registry'
import { AiSDK, setIntelligenceProviderManager } from './intelligence-sdk'

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

  createProviderInstance(): IntelligenceProviderAdapter {
    throw new Error('not needed in test')
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
  aiCapabilityRegistry.clear()
})

describe('AiSDK invoke', () => {
  it('falls back to secondary provider when primary provider fails', async () => {
    aiCapabilityRegistry.register({
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

    const sdk = new AiSDK({
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

  it('renders routing prompt template before chat invoke', async () => {
    aiCapabilityRegistry.register({
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

    const sdk = new AiSDK({
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
})
