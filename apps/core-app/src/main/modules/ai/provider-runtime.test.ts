import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeProviderForRuntime } from './provider-runtime'

const authMocks = vi.hoisted(() => ({
  getAuthToken: vi.fn()
}))
const providerCredentialMocks = vi.hoisted(() => ({
  resolveProviderCredential: vi.fn()
}))

vi.mock('../auth', () => authMocks)
vi.mock('./provider-credential-runtime', () => providerCredentialMocks)

describe('provider-runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    providerCredentialMocks.resolveProviderCredential.mockReturnValue(undefined)
  })

  it('injects the app auth token without re-enabling disabled Nexus-managed providers', () => {
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
      enabled: false,
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

  it('prefers the authoritative secure credential over stale transient plaintext', () => {
    authMocks.getAuthToken.mockReturnValue('app-token')
    providerCredentialMocks.resolveProviderCredential.mockReturnValue('  secure-current  ')
    const provider = {
      id: 'custom-openai',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Custom OpenAI',
      enabled: true,
      apiKey: 'stale-legacy-key',
      priority: 2
    }

    expect(normalizeProviderForRuntime(provider)).toEqual({
      ...provider,
      apiKey: '  secure-current  '
    })
  })

  it('preserves meaningful credential whitespace for non-Nexus providers', () => {
    authMocks.getAuthToken.mockReturnValue('app-token')
    const provider = {
      id: 'custom-openai',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Custom OpenAI',
      enabled: true,
      apiKey: '  sk-user  ',
      priority: 2
    }

    expect(normalizeProviderForRuntime(provider)).toEqual(provider)
    expect(normalizeProviderForRuntime(provider).apiKey).toBe('  sk-user  ')
  })
})
