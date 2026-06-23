import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IntelligenceCapabilityType,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'
import {
  createChatProvider,
  FakeProviderManager,
  getStorageMocks
} from './intelligence-test-harness'

const storageMocks = getStorageMocks()

class ProviderModelOptionsManager extends FakeProviderManager {
  registerFromConfig() {
    return undefined as never
  }
}

describe('CoreApp intelligence provider model options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storageMocks.storedConfig = undefined
  })

  it('returns sanitized text.chat provider and model options', async () => {
    const { intelligenceCapabilityRegistry } = await import('./intelligence-capability-registry')
    const { getProviderModelOptions } = await import('./intelligence-provider-model-options')
    const { setIntelligenceProviderManager } = await import('./intelligence-sdk')

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
})
