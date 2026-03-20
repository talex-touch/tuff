import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  IntelligenceCapabilityType,
  IntelligenceProviderType,
  type IntelligenceInvokeOptions,
  type IntelligenceInvokeResult,
  type IntelligenceProviderAdapter,
  type IntelligenceProviderConfig,
  type IntelligenceProviderManagerAdapter,
  type IntelligenceTTSPayload,
  type IntelligenceTTSResult,
  type IntelligenceVisionOcrPayload,
  type IntelligenceVisionOcrResult
} from '@talex-touch/tuff-intelligence'
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import { TuffIntelligenceSDK, setIntelligenceProviderManager } from './intelligence-sdk'

const { appMock } = vi.hoisted(() => ({
  appMock: {
    commandLine: { appendSwitch: vi.fn() },
    on: vi.fn(),
    once: vi.fn(),
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

vi.mock('./agents', () => ({
  agentManager: {
    isInitialized: vi.fn(() => false),
    executeTaskImmediate: vi.fn()
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
  intelligenceCapabilityRegistry.clear()
})

describe('TuffIntelligenceSDK invoke', () => {
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

  it('dispatches audio.tts capability to provider tts implementation', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'audio.tts',
      type: IntelligenceCapabilityType.TTS,
      name: 'Audio TTS',
      description: 'text to speech',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })

    const ttsInvoke = vi.fn().mockResolvedValue({
      result: {
        audio: 'tfile://audio/sample.mp3',
        url: 'tfile://audio/sample.mp3',
        format: 'mp3'
      } as IntelligenceTTSResult,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: 'tts-local',
      latency: 9,
      traceId: 'trace-tts',
      provider: IntelligenceProviderType.LOCAL
    })

    const provider = createProvider(
      {
        id: 'local-tts',
        type: IntelligenceProviderType.LOCAL,
        name: 'Local TTS',
        enabled: true,
        priority: 1,
        models: ['tts-local'],
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

    const payload: IntelligenceTTSPayload = {
      text: 'hello',
      format: 'mp3'
    }
    const result = await sdk.invoke<IntelligenceTTSResult>('audio.tts', payload)

    expect(result.result.url).toBe('tfile://audio/sample.mp3')
    expect(ttsInvoke).toHaveBeenCalledOnce()
  })

  it('reports unsupported error for video.generate placeholder capability', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'video.generate',
      type: IntelligenceCapabilityType.VIDEO_GENERATE,
      name: 'Video Generation',
      description: 'video generation placeholder',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })

    const provider = createProvider(
      {
        id: 'local-video',
        type: IntelligenceProviderType.LOCAL,
        name: 'Local Video',
        enabled: true,
        priority: 1,
        models: ['video-local'],
        capabilities: ['video.generate']
      },
      vi.fn()
    )

    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    })

    await expect(
      sdk.invoke('video.generate', {
        prompt: 'sunset over city'
      })
    ).rejects.toThrow('capability not supported')
  })
})
