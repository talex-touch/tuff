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

describe('CoreApp shared intelligence resolver contract', () => {
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
        'text.chat': { id: 'text.chat', label: 'Chat', providers: [{ providerId: 'local-chat' }] }
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
        'text.chat': { id: 'text.chat', label: 'Chat', providers: [{ providerId: 'local-chat' }] }
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
