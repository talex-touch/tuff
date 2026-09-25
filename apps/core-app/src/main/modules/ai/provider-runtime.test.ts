import { DEFAULT_PROVIDERS, IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
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

/**
 * The shipped Nexus channel: `DEFAULT_PROVIDERS`' own `tuff-nexus-default`, which carries the
 * buffered `audio.stt` capability and no `audio.asr`. Cloned so a projection that rewrote its
 * input in place could not leak that mutation into the rest of the suite.
 */
function shippedNexusDefault() {
  const provider = DEFAULT_PROVIDERS.find((candidate) => candidate.id === 'tuff-nexus-default')
  if (!provider) throw new Error('DEFAULT_PROVIDERS no longer ships tuff-nexus-default')
  return structuredClone(provider)
}

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
        voiceAsr: { protocol: 'nexus-pack' },
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
        voiceAsr: { protocol: 'nexus-pack' },
        tokenInjected: false,
        tokenMode: 'guest'
      }
    })
  })

  it('projects the shipped Nexus channel onto realtime asr without rewriting its persisted capabilities', () => {
    authMocks.getAuthToken.mockReturnValue('Bearer app-token')
    const persisted = shippedNexusDefault()

    const projected = normalizeProviderForRuntime(persisted)

    // Routing is decided by the declared capability list, so the runtime entry is appended while
    // every persisted entry — `audio.stt` among them — keeps its place.
    expect(projected.capabilities).toEqual([...(persisted.capabilities ?? []), 'audio.asr'])
    // The projection is a copy: the capability list the app stores and shows stays as shipped.
    expect(persisted.capabilities).not.toContain('audio.asr')
    // Re-projecting a runtime provider reuses that entry rather than stacking a second one.
    expect(normalizeProviderForRuntime(projected).capabilities).toEqual(projected.capabilities)
    // Nothing else about the channel moves: same identity, endpoint, models and switch state.
    expect(projected).toMatchObject({
      id: persisted.id,
      type: persisted.type,
      enabled: persisted.enabled,
      priority: persisted.priority,
      baseUrl: persisted.baseUrl,
      models: persisted.models,
      defaultModel: persisted.defaultModel
    })
  })

  it('does not grant realtime asr to a non-Nexus channel that only declares buffered transcription', () => {
    authMocks.getAuthToken.mockReturnValue('app-token')

    const projected = normalizeProviderForRuntime({
      id: 'dashscope-asr',
      type: IntelligenceProviderType.CUSTOM,
      name: 'DashScope ASR',
      enabled: true,
      priority: 3,
      capabilities: ['audio.stt'],
      metadata: { voiceAsr: { protocol: 'bailian-paraformer' } }
    })

    expect(projected.capabilities).toEqual(['audio.stt'])
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
