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
import { resolveCapabilityStatus } from './intelligence-capability-status'
import { setIntelligenceProviderManager } from './intelligence-sdk'
import { IntelligenceProvider } from './runtime/base-provider'

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

const storageMocks = getStorageMocks()

describe('coreApp shared intelligence resolver contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storageMocks.storedConfig = undefined
  })

  it('reports Nexus text.translate unavailable while account token is guest', async () => {
    const { intelligenceCapabilityRegistry } = await import('./intelligence-capability-registry')
    const { resolveCapabilityStatus } = await import('./intelligence-capability-status')
    const { setIntelligenceProviderManager } = await import('./intelligence-sdk')

    intelligenceCapabilityRegistry.clear()
    intelligenceCapabilityRegistry.register({
      id: 'text.translate',
      type: IntelligenceCapabilityType.TRANSLATE,
      name: 'Translate',
      description: 'test translate',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })
    storageMocks.storedConfig = {
      providers: [
        {
          id: 'tuff-nexus-default',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Tuff Nexus',
          enabled: true,
          apiKey: 'guest',
          capabilities: ['text.translate'],
          metadata: { origin: 'tuff-nexus', tokenMode: 'guest' }
        }
      ],
      globalConfig: { defaultStrategy: 'adaptive-default', enableAudit: true, enableCache: false },
      capabilities: {
        'text.translate': {
          id: 'text.translate',
          providers: [{ providerId: 'tuff-nexus-default', priority: 1, enabled: true }]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }
    setIntelligenceProviderManager(
      new FakeProviderManager([
        createChatProvider(
          {
            id: 'tuff-nexus-default',
            type: IntelligenceProviderType.CUSTOM,
            apiKey: 'guest',
            capabilities: ['text.translate'],
            metadata: { origin: 'tuff-nexus', tokenMode: 'guest' }
          },
          vi.fn()
        )
      ])
    )

    expect(resolveCapabilityStatus('text.translate')).toEqual({
      capabilityId: 'text.translate',
      available: false,
      providerIds: [],
      reason: 'no-enabled-provider'
    })
  })

  it.each([
    ['image.caption', IntelligenceCapabilityType.IMAGE_CAPTION, 'Image Captioning'],
    ['audio.transcribe', IntelligenceCapabilityType.AUDIO_TRANSCRIBE, 'Audio Transcription']
  ])(
    'reports %s unavailable when its provider inherits the unsupported base method',
    (capabilityId, type, name) => {
      const providerId = `credentialed-${capabilityId.replace('.', '-')}`

      intelligenceCapabilityRegistry.clear()
      intelligenceCapabilityRegistry.register({
        id: capabilityId,
        type,
        name,
        description: `test ${capabilityId}`,
        supportedProviders: [IntelligenceProviderType.CUSTOM]
      })
      storageMocks.storedConfig = {
        providers: [
          {
            id: providerId,
            type: IntelligenceProviderType.CUSTOM,
            name: 'Credentialed custom provider',
            enabled: true,
            apiKey: 'credentialed-api-key',
            capabilities: [capabilityId]
          }
        ],
        globalConfig: {
          defaultStrategy: 'adaptive-default',
          enableAudit: true,
          enableCache: false
        },
        capabilities: {
          [capabilityId]: {
            id: capabilityId,
            providers: [{ providerId, priority: 1, enabled: true }]
          }
        },
        promptRegistry: [],
        promptBindings: [],
        version: 2
      }
      setIntelligenceProviderManager(
        new FakeProviderManager([
          new RuntimeProviderWithoutExtendedOverrides({
            id: providerId,
            type: IntelligenceProviderType.CUSTOM,
            name: 'Credentialed custom provider',
            enabled: true,
            apiKey: 'credentialed-api-key',
            capabilities: [capabilityId]
          })
        ])
      )

      expect(resolveCapabilityStatus(capabilityId)).toEqual({
        capabilityId,
        available: false,
        providerIds: [],
        reason: 'no-enabled-provider'
      })
    }
  )

  it('reports semantic search available when a credentialed provider implements embedding', () => {
    const providerId = 'credentialed-semantic-embedding'

    intelligenceCapabilityRegistry.clear()
    intelligenceCapabilityRegistry.register({
      id: 'search.semantic',
      type: IntelligenceCapabilityType.SEMANTIC_SEARCH,
      name: 'Semantic Search',
      description: 'test embedding-backed semantic search',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })
    storageMocks.storedConfig = {
      providers: [
        {
          id: providerId,
          type: IntelligenceProviderType.CUSTOM,
          name: 'Credentialed embedding provider',
          enabled: true,
          apiKey: 'credentialed-api-key',
          capabilities: ['search.semantic']
        }
      ],
      globalConfig: { defaultStrategy: 'adaptive-default', enableAudit: true, enableCache: false },
      capabilities: {
        'search.semantic': {
          id: 'search.semantic',
          providers: [{ providerId, priority: 1, enabled: true }]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }
    setIntelligenceProviderManager(
      new FakeProviderManager([
        new RuntimeProviderWithoutExtendedOverrides({
          id: providerId,
          type: IntelligenceProviderType.CUSTOM,
          name: 'Credentialed embedding provider',
          enabled: true,
          apiKey: 'credentialed-api-key',
          capabilities: ['search.semantic']
        })
      ])
    )

    expect(resolveCapabilityStatus('search.semantic')).toEqual({
      capabilityId: 'search.semantic',
      available: true,
      providerIds: [providerId]
    })
  })

  it('normalizes capability aliases when reading configured capability options', async () => {
    const { getCapabilityOptions } = await import('./intelligence-config')
    storageMocks.storedConfig = {
      providers: [
        { id: 'local-chat', type: IntelligenceProviderType.LOCAL, name: 'Local', enabled: true }
      ],
      globalConfig: { defaultStrategy: 'adaptive-default', enableAudit: true, enableCache: false },
      capabilities: {
        'text.chat': {
          id: 'text.chat',
          providers: [
            { providerId: 'local-chat', priority: 1, enabled: true, models: ['llama3.1'] }
          ]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }

    expect(getCapabilityOptions('chat.completion')).toMatchObject({
      allowedProviderIds: ['local-chat'],
      modelPreference: ['llama3.1']
    })
  })

  it('normalizes capability aliases during SDK invoke', async () => {
    const { intelligenceCapabilityRegistry } = await import('./intelligence-capability-registry')
    const { TuffIntelligenceSDK, setIntelligenceProviderManager } =
      await import('./intelligence-sdk')
    const chat = vi.fn().mockResolvedValue({
      result: 'ok',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'llama3.1',
      latency: 1,
      traceId: 'trace-alias',
      provider: IntelligenceProviderType.LOCAL
    })

    intelligenceCapabilityRegistry.clear()
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test chat',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })
    setIntelligenceProviderManager(
      new FakeProviderManager([
        createChatProvider({ id: 'local-chat', models: ['llama3.1'] }, chat)
      ])
    )

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      capabilities: {
        'text.chat': { label: 'Chat', providers: [{ providerId: 'local-chat' }] }
      }
    })

    await sdk.invoke('chat.completion', { messages: [{ role: 'user', content: 'hello' }] })

    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([{ role: 'user', content: 'hello' }])
      }),
      expect.anything()
    )
  })

  it('normalizes prompt binding capability aliases during SDK invoke', async () => {
    const { intelligenceCapabilityRegistry } = await import('./intelligence-capability-registry')
    const { TuffIntelligenceSDK, setIntelligenceProviderManager } =
      await import('./intelligence-sdk')
    const chat = vi.fn().mockResolvedValue({
      result: 'ok',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'llama3.1',
      latency: 1,
      traceId: 'trace-contract',
      provider: IntelligenceProviderType.LOCAL
    })

    intelligenceCapabilityRegistry.clear()
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test chat',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })
    setIntelligenceProviderManager(
      new FakeProviderManager([
        createChatProvider({ id: 'local-chat', models: ['llama3.1'] }, chat)
      ])
    )

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      capabilities: {
        'text.chat': { label: 'Chat', providers: [{ providerId: 'local-chat' }] }
      },
      promptRegistry: [
        {
          id: 'prompt.chat.alias',
          version: '1.0.0',
          template: 'Shared {{topic}} prompt',
          scope: 'capability',
          status: 'active',
          capabilityId: 'text.chat'
        }
      ]
    })

    await sdk.invoke(
      'text.chat',
      { messages: [{ role: 'user', content: 'hello' }] },
      {
        metadata: {
          promptVariables: { topic: 'resolver' },
          promptBinding: { capabilityId: 'chat.completion', promptId: 'prompt.chat.alias' }
        }
      }
    )

    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([{ role: 'system', content: 'Shared resolver prompt' }])
      }),
      expect.anything()
    )
  })
})
