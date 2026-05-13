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
})
