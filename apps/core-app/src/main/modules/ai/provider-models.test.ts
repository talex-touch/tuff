import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { fetchProviderModels } from './provider-models'

const networkMocks = vi.hoisted(() => ({
  request: vi.fn()
}))

vi.mock('../network', () => ({
  getNetworkService: () => networkMocks
}))

describe('fetchProviderModels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns stored models for Nexus-managed providers without calling /models', async () => {
    const models = await fetchProviderModels({
      id: 'tuff-nexus-default',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Tuff Nexus',
      enabled: true,
      priority: 1,
      apiKey: 'app-token',
      baseUrl: 'https://nexus.example.com/v1',
      models: ['gpt-4o-mini', 'gpt-4o-mini', 'gpt-4o'],
      defaultModel: 'gpt-4o-mini',
      metadata: { origin: 'tuff-nexus', tokenMode: 'auth' }
    })

    expect(models).toEqual(['gpt-4o-mini', 'gpt-4o'])
    expect(networkMocks.request).not.toHaveBeenCalled()
  })

  it('fetches local Ollama models from /api/tags without an API key', async () => {
    networkMocks.request.mockResolvedValueOnce({
      data: {
        models: [{ name: 'llama3.1:8b' }, { model: 'qwen2.5:7b' }, { name: 'llama3.1:8b' }]
      }
    })

    const models = await fetchProviderModels({
      id: 'local-default',
      type: IntelligenceProviderType.LOCAL,
      name: 'Local Model',
      enabled: true,
      priority: 3,
      baseUrl: 'http://localhost:11434',
      models: []
    })

    expect(models).toEqual(['llama3.1:8b', 'qwen2.5:7b'])
    expect(networkMocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'http://localhost:11434/api/tags',
        cooldownPolicy: expect.objectContaining({
          key: 'local-default:ollama.chat'
        }),
        proxyOverride: { mode: 'direct' }
      })
    )
  })

  it('lets local provider probes bypass chat cooldown without stored fallback', async () => {
    networkMocks.request.mockRejectedValue(new Error('provider unavailable'))

    await expect(
      fetchProviderModels(
        {
          id: 'local-default',
          type: IntelligenceProviderType.LOCAL,
          name: 'Local Model',
          enabled: true,
          priority: 3,
          baseUrl: 'http://localhost:11434',
          models: ['stale-model']
        },
        {
          allowStoredFallback: false,
          skipCooldownCheck: true
        }
      )
    ).rejects.toThrow('provider unavailable')

    expect(networkMocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://localhost:11434/api/tags',
        skipCooldownCheck: true,
        cooldownPolicy: expect.objectContaining({
          key: 'local-default:ollama.chat'
        })
      })
    )
  })

  it('falls back to OpenAI-compatible local models when Ollama tags are unavailable', async () => {
    networkMocks.request
      .mockRejectedValueOnce(new Error('Ollama endpoint unavailable'))
      .mockResolvedValueOnce({
        data: {
          data: [{ id: 'local-openai-model' }]
        }
      })

    const models = await fetchProviderModels({
      id: 'local-default',
      type: IntelligenceProviderType.LOCAL,
      name: 'Local Model',
      enabled: true,
      priority: 3,
      baseUrl: 'http://localhost:11434',
      models: []
    })

    expect(models).toEqual(['local-openai-model'])
    expect(networkMocks.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'GET',
        url: 'http://localhost:11434/v1/models',
        proxyOverride: { mode: 'direct' }
      })
    )
  })
})
