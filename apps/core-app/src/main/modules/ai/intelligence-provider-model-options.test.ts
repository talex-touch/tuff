import {
  IntelligenceCapabilityType,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createChatProvider,
  FakeProviderManager,
  getStorageMocks
} from './intelligence-test-harness'
// The harness must register Vitest mocks before subject modules, so this import order is intentional.
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import { getProviderModelOptions } from './intelligence-provider-model-options'
import { setIntelligenceProviderManager } from './intelligence-sdk'
import { OpenAIProvider } from './providers/openai-provider'
import { SiliconflowProvider } from './providers/siliconflow-provider'
import { IntelligenceProvider } from './runtime/base-provider'

const storageMocks = getStorageMocks()

class ProviderModelOptionsManager extends FakeProviderManager {
  registerFromConfig() {
    return undefined as never
  }
}

class RuntimeProviderWithoutExtendedOverrides extends IntelligenceProvider {
  readonly type = IntelligenceProviderType.CUSTOM

  async chat(): Promise<never> {
    throw new Error('not used')
  }

  async *chatStream(): AsyncGenerator<never> {
    throw new Error('not used')
  }

  async embedding(): Promise<never> {
    throw new Error('not used')
  }

  async translate(): Promise<never> {
    throw new Error('not used')
  }
}

class RuntimeImageCaptionProvider extends RuntimeProviderWithoutExtendedOverrides {
  async imageCaption(): Promise<never> {
    throw new Error('not used')
  }
}

describe('coreApp intelligence provider model options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storageMocks.storedConfig = undefined
  })

  it('returns sanitized text.chat provider and model options', () => {
    intelligenceCapabilityRegistry.clear()
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test chat',
      supportedProviders: [
        IntelligenceProviderType.LOCAL,
        IntelligenceProviderType.OPENAI,
        IntelligenceProviderType.CUSTOM
      ]
    })
    storageMocks.storedConfig = {
      providers: [
        {
          id: 'local-chat',
          type: IntelligenceProviderType.LOCAL,
          name: 'Local Chat',
          enabled: true,
          capabilities: ['text.chat']
        },
        {
          id: 'openai-chat',
          type: IntelligenceProviderType.OPENAI,
          name: 'OpenAI',
          enabled: true,
          apiKey: 'sk-test',
          capabilities: ['text.chat']
        },
        {
          id: 'guest-chat',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Guest Nexus',
          enabled: true,
          apiKey: 'guest',
          capabilities: ['text.chat'],
          metadata: { tokenMode: 'guest' }
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false
      },
      capabilities: {
        'text.chat': {
          id: 'text.chat',
          providers: [
            { providerId: 'local-chat', priority: 1, enabled: true },
            { providerId: 'openai-chat', priority: 2, enabled: true },
            { providerId: 'guest-chat', priority: 3, enabled: true }
          ]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }

    setIntelligenceProviderManager(
      new ProviderModelOptionsManager([
        createChatProvider(
          {
            id: 'local-chat',
            type: IntelligenceProviderType.LOCAL,
            name: 'Local Chat',
            defaultModel: 'llama3.1',
            models: ['qwen2.5', 'llama3.1'],
            capabilities: ['text.chat']
          },
          vi.fn()
        ),
        createChatProvider(
          {
            id: 'openai-chat',
            type: IntelligenceProviderType.OPENAI,
            name: 'OpenAI',
            apiKey: 'sk-test',
            defaultModel: 'gpt-4.1-mini',
            models: ['gpt-4.1', 'gpt-4.1-mini'],
            capabilities: ['text.chat'],
            metadata: { secretAlias: 'provider/openai' }
          },
          vi.fn()
        ),
        createChatProvider(
          {
            id: 'guest-chat',
            type: IntelligenceProviderType.CUSTOM,
            name: 'Guest Nexus',
            apiKey: 'guest',
            defaultModel: 'nexus-default',
            models: ['nexus-default'],
            capabilities: ['text.chat'],
            metadata: { tokenMode: 'guest' }
          },
          vi.fn()
        ),
        createChatProvider(
          {
            id: 'vision-only',
            type: IntelligenceProviderType.LOCAL,
            name: 'Vision Only',
            defaultModel: 'system-ocr',
            models: ['system-ocr'],
            capabilities: ['vision.ocr']
          },
          vi.fn()
        )
      ])
    )

    const options = getProviderModelOptions('text.chat')

    expect(options).toEqual([
      {
        providerId: 'local-chat',
        providerName: 'Local Chat',
        providerType: IntelligenceProviderType.LOCAL,
        models: ['llama3.1', 'qwen2.5'],
        defaultModel: 'llama3.1',
        capabilities: ['text.chat'],
        available: true
      },
      {
        providerId: 'openai-chat',
        providerName: 'OpenAI',
        providerType: IntelligenceProviderType.OPENAI,
        models: ['gpt-4.1-mini', 'gpt-4.1'],
        defaultModel: 'gpt-4.1-mini',
        capabilities: ['text.chat'],
        available: true
      },
      {
        providerId: 'guest-chat',
        providerName: 'Guest Nexus',
        providerType: IntelligenceProviderType.CUSTOM,
        models: ['nexus-default'],
        defaultModel: 'nexus-default',
        capabilities: ['text.chat'],
        available: false
      }
    ])
    expect(JSON.stringify(options)).not.toContain('sk-test')
    expect(JSON.stringify(options)).not.toContain('secretAlias')
    expect(options.map((option) => option.providerId)).not.toContain('vision-only')
  })

  it('omits configured image caption providers that inherit the unsupported base method', () => {
    intelligenceCapabilityRegistry.clear()
    intelligenceCapabilityRegistry.register({
      id: 'image.caption',
      type: IntelligenceCapabilityType.IMAGE_CAPTION,
      name: 'Image Captioning',
      description: 'test image captioning',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })
    storageMocks.storedConfig = {
      providers: [
        {
          id: 'inherited-caption',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Inherited Caption',
          enabled: true,
          apiKey: 'credentialed-api-key',
          defaultModel: 'inherited-caption-model',
          models: ['inherited-caption-model'],
          capabilities: ['image.caption']
        },
        {
          id: 'implemented-caption',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Implemented Caption',
          enabled: true,
          apiKey: 'credentialed-api-key',
          defaultModel: 'implemented-caption-model',
          models: ['implemented-caption-model'],
          capabilities: ['image.caption']
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false
      },
      capabilities: {
        'image.caption': {
          id: 'image.caption',
          providers: [
            { providerId: 'inherited-caption', priority: 1, enabled: true },
            { providerId: 'implemented-caption', priority: 2, enabled: true }
          ]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }
    setIntelligenceProviderManager(
      new ProviderModelOptionsManager([
        new RuntimeProviderWithoutExtendedOverrides({
          id: 'inherited-caption',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Inherited Caption',
          enabled: true,
          apiKey: 'credentialed-api-key',
          defaultModel: 'inherited-caption-model',
          models: ['inherited-caption-model'],
          capabilities: ['image.caption']
        }),
        new RuntimeImageCaptionProvider({
          id: 'implemented-caption',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Implemented Caption',
          enabled: true,
          apiKey: 'credentialed-api-key',
          defaultModel: 'implemented-caption-model',
          models: ['implemented-caption-model'],
          capabilities: ['image.caption']
        })
      ])
    )

    expect(getProviderModelOptions('image.caption')).toEqual([
      {
        providerId: 'implemented-caption',
        providerName: 'Implemented Caption',
        providerType: IntelligenceProviderType.CUSTOM,
        models: ['implemented-caption-model'],
        defaultModel: 'implemented-caption-model',
        capabilities: ['image.caption'],
        available: true
      }
    ])
  })

  it('lists provider-specific defaults for unbound OpenAI-compatible media capabilities', () => {
    intelligenceCapabilityRegistry.clear()
    intelligenceCapabilityRegistry.register({
      id: 'image.generate',
      type: IntelligenceCapabilityType.IMAGE_GENERATE,
      name: 'Image Generation',
      description: 'test image generation model options',
      supportedProviders: [IntelligenceProviderType.OPENAI, IntelligenceProviderType.SILICONFLOW]
    })
    intelligenceCapabilityRegistry.register({
      id: 'audio.stt',
      type: IntelligenceCapabilityType.STT,
      name: 'Speech-to-Text',
      description: 'test speech recognition model options',
      supportedProviders: [IntelligenceProviderType.OPENAI, IntelligenceProviderType.SILICONFLOW]
    })
    intelligenceCapabilityRegistry.register({
      id: 'audio.tts',
      type: IntelligenceCapabilityType.TTS,
      name: 'Text-to-Speech',
      description: 'test speech synthesis model options',
      supportedProviders: [IntelligenceProviderType.OPENAI, IntelligenceProviderType.SILICONFLOW]
    })
    storageMocks.storedConfig = {
      providers: [
        {
          id: 'openai-multimodal',
          type: IntelligenceProviderType.OPENAI,
          name: 'OpenAI',
          enabled: true,
          apiKey: 'openai-key',
          defaultModel: 'gpt-4o-mini',
          models: ['gpt-4o', 'gpt-4o-mini'],
          capabilities: ['image.generate', 'audio.stt', 'audio.tts']
        },
        {
          id: 'siliconflow-multimodal',
          type: IntelligenceProviderType.SILICONFLOW,
          name: 'SiliconFlow',
          enabled: true,
          apiKey: 'siliconflow-key',
          defaultModel: 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B',
          models: ['deepseek-ai/DeepSeek-R1-0528-Qwen3-8B'],
          capabilities: ['image.generate', 'audio.stt', 'audio.tts']
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false
      },
      capabilities: {
        'image.generate': { id: 'image.generate', providers: [] },
        'audio.stt': { id: 'audio.stt', providers: [] },
        'audio.tts': { id: 'audio.tts', providers: [] }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }
    setIntelligenceProviderManager(
      new ProviderModelOptionsManager([
        new OpenAIProvider({
          id: 'openai-multimodal',
          type: IntelligenceProviderType.OPENAI,
          name: 'OpenAI',
          enabled: true,
          apiKey: 'openai-key',
          defaultModel: 'gpt-4o-mini',
          models: ['gpt-4o', 'gpt-4o-mini'],
          capabilities: ['image.generate', 'audio.stt', 'audio.tts']
        }),
        new SiliconflowProvider({
          id: 'siliconflow-multimodal',
          type: IntelligenceProviderType.SILICONFLOW,
          name: 'SiliconFlow',
          enabled: true,
          apiKey: 'siliconflow-key',
          defaultModel: 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B',
          models: ['deepseek-ai/DeepSeek-R1-0528-Qwen3-8B'],
          capabilities: ['image.generate', 'audio.stt', 'audio.tts']
        })
      ])
    )

    expect(getProviderModelOptions('image.generate')).toEqual([
      {
        providerId: 'openai-multimodal',
        providerName: 'OpenAI',
        providerType: IntelligenceProviderType.OPENAI,
        models: ['gpt-image-1'],
        defaultModel: 'gpt-image-1',
        capabilities: ['image.generate', 'audio.stt', 'audio.tts'],
        available: true
      },
      {
        providerId: 'siliconflow-multimodal',
        providerName: 'SiliconFlow',
        providerType: IntelligenceProviderType.SILICONFLOW,
        models: ['Kwai-Kolors/Kolors'],
        defaultModel: 'Kwai-Kolors/Kolors',
        capabilities: ['image.generate', 'audio.stt', 'audio.tts'],
        available: true
      }
    ])
    expect(getProviderModelOptions('audio.stt')).toEqual([
      {
        providerId: 'openai-multimodal',
        providerName: 'OpenAI',
        providerType: IntelligenceProviderType.OPENAI,
        models: ['whisper-1', 'gpt-4o-transcribe'],
        defaultModel: 'whisper-1',
        capabilities: ['image.generate', 'audio.stt', 'audio.tts'],
        available: true
      },
      {
        providerId: 'siliconflow-multimodal',
        providerName: 'SiliconFlow',
        providerType: IntelligenceProviderType.SILICONFLOW,
        models: ['FunAudioLLM/SenseVoiceSmall'],
        defaultModel: 'FunAudioLLM/SenseVoiceSmall',
        capabilities: ['image.generate', 'audio.stt', 'audio.tts'],
        available: true
      }
    ])
    expect(getProviderModelOptions('audio.tts')).toEqual([
      {
        providerId: 'openai-multimodal',
        providerName: 'OpenAI',
        providerType: IntelligenceProviderType.OPENAI,
        models: ['tts-1', 'tts-1-hd'],
        defaultModel: 'tts-1',
        capabilities: ['image.generate', 'audio.stt', 'audio.tts'],
        available: true
      },
      {
        providerId: 'siliconflow-multimodal',
        providerName: 'SiliconFlow',
        providerType: IntelligenceProviderType.SILICONFLOW,
        models: ['fnlp/MOSS-TTSD-v0.5'],
        defaultModel: 'fnlp/MOSS-TTSD-v0.5',
        capabilities: ['image.generate', 'audio.stt', 'audio.tts'],
        available: true
      }
    ])
  })

  it('lists embedding-only providers for inherited semantic search routing', () => {
    intelligenceCapabilityRegistry.clear()
    intelligenceCapabilityRegistry.register({
      id: 'search.semantic',
      type: IntelligenceCapabilityType.SEMANTIC_SEARCH,
      name: 'Semantic Search',
      description: 'test semantic embedding model options',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })
    intelligenceCapabilityRegistry.register({
      id: 'embedding.generate',
      type: IntelligenceCapabilityType.EMBEDDING,
      name: 'Embedding',
      description: 'test embedding model routing',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })
    storageMocks.storedConfig = {
      providers: [
        {
          id: 'semantic-embedding-provider',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Semantic Embedding Provider',
          enabled: true,
          apiKey: 'semantic-embedding-key',
          defaultModel: 'generic-chat-model',
          models: ['generic-chat-model'],
          capabilities: ['embedding.generate']
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false
      },
      capabilities: {
        'search.semantic': {
          id: 'search.semantic',
          providers: [
            {
              providerId: 'semantic-embedding-provider',
              priority: 1,
              enabled: false,
              models: ['disabled-semantic-model']
            }
          ]
        },
        'embedding.generate': {
          id: 'embedding.generate',
          providers: [
            {
              providerId: 'semantic-embedding-provider',
              priority: 1,
              enabled: true,
              models: ['semantic-embedding-model']
            }
          ]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }
    setIntelligenceProviderManager(
      new ProviderModelOptionsManager([
        new RuntimeProviderWithoutExtendedOverrides({
          id: 'semantic-embedding-provider',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Semantic Embedding Provider',
          enabled: true,
          apiKey: 'semantic-embedding-key',
          defaultModel: 'generic-chat-model',
          models: ['generic-chat-model'],
          capabilities: ['embedding.generate']
        })
      ])
    )

    expect(getProviderModelOptions('search.semantic')).toEqual([
      {
        providerId: 'semantic-embedding-provider',
        providerName: 'Semantic Embedding Provider',
        providerType: IntelligenceProviderType.CUSTOM,
        models: ['semantic-embedding-model'],
        defaultModel: 'semantic-embedding-model',
        capabilities: ['embedding.generate'],
        available: true
      }
    ])
  })

  it('lists embedding-only providers for inherited rerank routing', () => {
    intelligenceCapabilityRegistry.clear()
    intelligenceCapabilityRegistry.register({
      id: 'search.rerank',
      type: IntelligenceCapabilityType.RERANK,
      name: 'Search Rerank',
      description: 'test embedding-backed rerank model options',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })
    intelligenceCapabilityRegistry.register({
      id: 'embedding.generate',
      type: IntelligenceCapabilityType.EMBEDDING,
      name: 'Embedding',
      description: 'test embedding model routing',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })
    storageMocks.storedConfig = {
      providers: [
        {
          id: 'rerank-embedding-provider',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Rerank Embedding Provider',
          enabled: true,
          apiKey: 'rerank-embedding-key',
          defaultModel: 'generic-chat-model',
          models: ['generic-chat-model'],
          capabilities: ['embedding.generate']
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false
      },
      capabilities: {
        'search.rerank': {
          id: 'search.rerank',
          providers: [
            {
              providerId: 'rerank-embedding-provider',
              priority: 1,
              enabled: false,
              models: ['disabled-rerank-model']
            }
          ]
        },
        'embedding.generate': {
          id: 'embedding.generate',
          providers: [
            {
              providerId: 'rerank-embedding-provider',
              priority: 1,
              enabled: true,
              models: ['rerank-embedding-model']
            }
          ]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }
    setIntelligenceProviderManager(
      new ProviderModelOptionsManager([
        new RuntimeProviderWithoutExtendedOverrides({
          id: 'rerank-embedding-provider',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Rerank Embedding Provider',
          enabled: true,
          apiKey: 'rerank-embedding-key',
          defaultModel: 'generic-chat-model',
          models: ['generic-chat-model'],
          capabilities: ['embedding.generate']
        })
      ])
    )

    expect(getProviderModelOptions('search.rerank')).toEqual([
      {
        providerId: 'rerank-embedding-provider',
        providerName: 'Rerank Embedding Provider',
        providerType: IntelligenceProviderType.CUSTOM,
        models: ['rerank-embedding-model'],
        defaultModel: 'rerank-embedding-model',
        capabilities: ['embedding.generate'],
        available: true
      }
    ])
  })
})
