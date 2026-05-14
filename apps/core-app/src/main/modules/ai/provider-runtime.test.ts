import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { normalizeProviderForRuntime } from './provider-runtime'

const authMocks = vi.hoisted(() => ({
  getAuthToken: vi.fn()
}))

vi.mock('../auth', () => authMocks)

describe('provider-runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('injects the app auth token into Nexus-managed providers', () => {
    authMocks.getAuthToken.mockReturnValue('Bearer app-token')

    const provider = normalizeProviderForRuntime({
      id: 'tuff-nexus-default',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Tuff Nexus',
      enabled: false,
      priority: 1,
      metadata: { origin: 'tuff-nexus' }
    })

    expect(provider).toMatchObject({
      enabled: true,
      apiKey: 'app-token',
      metadata: {
        origin: 'tuff-nexus',
        tokenInjected: true,
        tokenMode: 'auth'
      }
    })
  })

  it('marks Nexus-managed providers as guest when no app auth token exists', () => {
    authMocks.getAuthToken.mockReturnValue(null)

    const provider = normalizeProviderForRuntime({
      id: 'custom-nexus',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Nexus Mirror',
      enabled: true,
      priority: 1,
      metadata: { origin: 'tuff-nexus' }
    })

    expect(provider).toMatchObject({
      enabled: true,
      apiKey: 'guest',
      metadata: {
        origin: 'tuff-nexus',
        tokenInjected: false,
        tokenMode: 'guest'
      }
    })
  })

  it('leaves non-Nexus providers unchanged', () => {
    authMocks.getAuthToken.mockReturnValue('app-token')
    const provider = {
      id: 'custom-openai',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Custom OpenAI',
      enabled: true,
      apiKey: 'sk-user',
      priority: 2
    }

    expect(normalizeProviderForRuntime(provider)).toBe(provider)
  })
})
