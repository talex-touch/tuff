import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import type {
  ProviderCredentialSurface,
  ProviderCredentialVault
} from './provider-credential-service'
import { describe, expect, it, vi } from 'vitest'
import {
  createProviderCredentialService,
  providerCredentialSecureStoreKey,
  redactProviderConfigDocument
} from './provider-credential-service'

const SECRET = 'synthetic-provider-secret-value'
const SPACED_SECRET = '  synthetic-provider-secret-value  '

function provider(overrides: Partial<IntelligenceProviderConfig> = {}): IntelligenceProviderConfig {
  return {
    id: 'openai-default',
    type: 'openai',
    name: 'Synthetic OpenAI',
    enabled: true,
    ...overrides
  } as IntelligenceProviderConfig
}

function createSurface(
  initial: Record<string, unknown>,
  options: {
    id?: string
    failWrites?: readonly number[]
    readDelay?: Promise<void>
  } = {}
): ProviderCredentialSurface & {
  current: Record<string, unknown>
  reads: number
  writes: number
  revision: number
} {
  return {
    id: options.id ?? 'main-config',
    current: structuredClone(initial),
    reads: 0,
    writes: 0,
    revision: 1,
    async read() {
      this.reads += 1
      await options.readDelay
      return { document: structuredClone(this.current), revision: this.revision }
    },
    async write(document, expectedRevision) {
      this.writes += 1
      if (expectedRevision !== undefined && expectedRevision !== this.revision) return false
      if (options.failWrites?.includes(this.writes)) return false
      this.current = structuredClone(document) as Record<string, unknown>
      this.revision += 1
      return true
    }
  }
}

function createVault(initial: Record<string, string> = {}): ProviderCredentialVault & {
  values: Map<string, string>
  applyCalls: number
  failApplyCalls: Set<number>
} {
  const values = new Map(Object.entries(initial))
  return {
    values,
    applyCalls: 0,
    failApplyCalls: new Set<number>(),
    async get(key) {
      return values.get(key) ?? null
    },
    async apply(entries) {
      this.applyCalls += 1
      if (this.failApplyCalls.has(this.applyCalls)) return false
      for (const entry of entries) {
        if (entry.value === null) values.delete(entry.key)
        else values.set(entry.key, entry.value)
      }
      return true
    }
  }
}

describe('providerCredentialService', () => {
  it('keeps a fresh install unchanged without creating secure-store entries', async () => {
    const surface = createSurface({ providers: [provider({ enabled: false })] })
    const vault = createVault()
    const service = createProviderCredentialService({ surfaces: [surface], vault })

    await service.initialize()

    expect(surface.writes).toBe(0)
    expect(vault.applyCalls).toBe(0)
    expect(service.resolve(provider())).toBeUndefined()
  })

  it('rejects malformed or duplicate legacy providers before secure-store access', async () => {
    const duplicate = provider({ id: 'duplicate', apiKey: SECRET })
    const surface = createSurface({
      providers: [duplicate, provider({ id: 'duplicate', apiKey: 'synthetic-second-secret' })]
    })
    const vault = createVault()
    const service = createProviderCredentialService({ surfaces: [surface], vault })

    await expect(service.initialize()).rejects.toThrow('PROVIDER_CREDENTIAL_CONFIG_INVALID')

    expect(vault.applyCalls).toBe(0)
    expect(surface.writes).toBe(0)
  })

  it('maps dependency exceptions to stable redacted lifecycle failures', async () => {
    const secretSurface = createSurface({ providers: [provider({ apiKey: SECRET })] })
    const throwingVault = createVault()
    throwingVault.apply = vi.fn(async () => {
      throw new Error(`native secure path leaked ${SECRET}`)
    })
    const secureReport = vi.fn()
    const secureService = createProviderCredentialService({
      surfaces: [secretSurface],
      vault: throwingVault,
      report: secureReport
    })

    await expect(secureService.initialize()).rejects.toThrow(
      'PROVIDER_CREDENTIAL_SECURE_WRITE_FAILED'
    )
    expect(JSON.stringify(secureReport.mock.calls)).not.toContain(SECRET)
    expect(secretSurface.writes).toBe(0)

    const readReport = vi.fn()
    const readService = createProviderCredentialService({
      surfaces: [
        {
          id: 'throwing-config',
          read: async () => {
            throw new Error(`native config path leaked ${SECRET}`)
          },
          write: async () => true
        }
      ],
      vault: createVault(),
      report: readReport
    })
    await expect(readService.initialize()).rejects.toThrow('PROVIDER_CREDENTIAL_CONFIG_READ_FAILED')
    expect(JSON.stringify(readReport.mock.calls)).not.toContain(SECRET)
  })

  it('moves a legacy credential to secure storage without changing whitespace', async () => {
    const surface = createSurface({ providers: [provider({ apiKey: SPACED_SECRET })] })
    const vault = createVault()
    const service = createProviderCredentialService({ surfaces: [surface], vault })

    await service.initialize()

    const key = providerCredentialSecureStoreKey('openai-default')
    expect(vault.values.get(key)).toBe(SPACED_SECRET)
    expect(surface.current).toEqual({
      providers: [
        expect.objectContaining({
          id: 'openai-default',
          hasCredential: true,
          authRef: 'provider-credential:openai-default'
        })
      ]
    })
    expect(JSON.stringify(surface.current)).not.toContain(SPACED_SECRET)
    expect(service.resolve(provider())).toBe(SPACED_SECRET)
  })

  it('keeps a non-blank secure credential authoritative while sanitizing conflicting legacy values', async () => {
    const key = providerCredentialSecureStoreKey('openai-default')
    const main = createSurface({ providers: [provider({ apiKey: SECRET })] }, { id: 'main-config' })
    const legacy = createSurface(
      { providers: [provider({ apiKey: 'synthetic-later-surface-secret' })] },
      { id: 'legacy-db' }
    )
    const vault = createVault({ [key]: 'synthetic-stale-secure-value' })
    const report = vi.fn()
    const service = createProviderCredentialService({ surfaces: [main, legacy], vault, report })

    await service.initialize()

    expect(vault.values.get(key)).toBe('synthetic-stale-secure-value')
    expect(service.resolve(provider())).toBe('synthetic-stale-secure-value')
    expect(JSON.stringify(main.current)).not.toContain(SECRET)
    expect(JSON.stringify(legacy.current)).not.toContain('synthetic-later-surface-secret')
    expect(report).toHaveBeenCalledWith(
      'PROVIDER_CREDENTIAL_SOURCE_CONFLICT',
      expect.objectContaining({ surface: 'legacy-db', providerId: 'openai-default' })
    )
  })

  it('preserves every legacy surface when the secure-store write fails and retries later', async () => {
    const main = createSurface({ providers: [provider({ apiKey: SECRET })] }, { id: 'main-config' })
    const legacy = createSurface({ providers: [provider({ apiKey: SECRET })] }, { id: 'legacy-db' })
    const vault = createVault()
    vault.failApplyCalls.add(1)
    const report = vi.fn()
    const service = createProviderCredentialService({ surfaces: [main, legacy], vault, report })

    await expect(service.initialize()).rejects.toThrow('PROVIDER_CREDENTIAL_SECURE_WRITE_FAILED')
    expect(main.writes).toBe(0)
    expect(legacy.writes).toBe(0)
    expect(service.resolve(provider())).toBe(SECRET)
    expect(JSON.stringify(report.mock.calls)).not.toContain(SECRET)

    await service.initialize()
    expect(vault.values.get(providerCredentialSecureStoreKey('openai-default'))).toBe(SECRET)
    expect(JSON.stringify(main.current)).not.toContain(SECRET)
    expect(JSON.stringify(legacy.current)).not.toContain(SECRET)
  })

  it('rolls back the vault and earlier sanitized surfaces when a later surface fails', async () => {
    const key = providerCredentialSecureStoreKey('openai-default')
    const main = createSurface({ providers: [provider({ apiKey: SECRET })] }, { id: 'main-config' })
    const legacy = createSurface(
      { providers: [provider({ apiKey: SECRET })] },
      { id: 'legacy-db', failWrites: [1] }
    )
    const vault = createVault({ [key]: 'synthetic-previous-secret' })
    const service = createProviderCredentialService({ surfaces: [main, legacy], vault })

    await expect(service.initialize()).rejects.toThrow('PROVIDER_CREDENTIAL_CONFIG_WRITE_FAILED')

    expect(vault.values.get(key)).toBe('synthetic-previous-secret')
    expect(JSON.stringify(main.current)).toContain(SECRET)
    expect(JSON.stringify(legacy.current)).toContain(SECRET)
    expect(service.resolve(provider())).toBe('synthetic-previous-secret')
  })

  it('reports a stable rollback failure without claiming config-write-only failure', async () => {
    const main = createSurface(
      { providers: [provider({ apiKey: SECRET })] },
      { id: 'main-config', failWrites: [2] }
    )
    const legacy = createSurface(
      { providers: [provider({ apiKey: SECRET })] },
      { id: 'legacy-db', failWrites: [1] }
    )
    const vault = createVault()
    const report = vi.fn()
    const service = createProviderCredentialService({ surfaces: [main, legacy], vault, report })

    await expect(service.initialize()).rejects.toThrow('PROVIDER_CREDENTIAL_ROLLBACK_FAILED')
    expect(report).toHaveBeenCalledWith(
      'PROVIDER_CREDENTIAL_ROLLBACK_FAILED',
      expect.objectContaining({ surface: 'legacy-db' })
    )
  })

  it('is idempotent across restart and hydrates runtime credentials main-side', async () => {
    const key = providerCredentialSecureStoreKey('openai-default')
    const surface = createSurface({
      providers: [
        provider({
          hasCredential: true,
          authRef: 'provider-credential:openai-default'
        })
      ]
    })
    const vault = createVault({ [key]: SECRET })

    const first = createProviderCredentialService({ surfaces: [surface], vault })
    await first.initialize()
    const second = createProviderCredentialService({ surfaces: [surface], vault })
    await second.initialize()

    expect(surface.writes).toBe(0)
    expect(vault.applyCalls).toBe(0)
    expect(second.resolve(provider())).toBe(SECRET)
  })

  it('repairs semantically blank secure values without treating them as credentials', async () => {
    const key = providerCredentialSecureStoreKey('openai-default')
    const surface = createSurface({
      providers: [
        provider({
          hasCredential: true,
          authRef: 'provider-credential:openai-default'
        })
      ]
    })
    const vault = createVault({ [key]: '   ' })
    const service = createProviderCredentialService({ surfaces: [surface], vault })

    await service.initialize()

    expect(vault.values.has(key)).toBe(false)
    expect(service.resolve(provider())).toBeUndefined()
    expect(surface.current).toEqual({
      providers: [expect.objectContaining({ hasCredential: false })]
    })
  })

  it('serializes concurrent initialization into one migration', async () => {
    let releaseRead: (() => void) | undefined
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve
    })
    const surface = createSurface(
      { providers: [provider({ apiKey: SECRET })] },
      { readDelay: readGate }
    )
    const vault = createVault()
    const service = createProviderCredentialService({ surfaces: [surface], vault })

    const first = service.initialize()
    const second = service.initialize()
    releaseRead?.()
    await Promise.all([first, second])

    expect(surface.reads).toBe(1)
    expect(surface.writes).toBe(1)
    expect(vault.applyCalls).toBe(1)
  })

  it('updates and deletes every config surface with one credential mutation', async () => {
    const main = createSurface({ providers: [provider({ enabled: false })] }, { id: 'main-config' })
    const legacy = createSurface({ providers: [] }, { id: 'legacy-db' })
    const vault = createVault()
    const service = createProviderCredentialService({ surfaces: [main, legacy], vault })
    await service.initialize()

    const saved = await service.saveProvider({
      provider: provider({ enabled: true }),
      credential: { action: 'set', value: SPACED_SECRET }
    })
    expect(saved.hasCredential).toBe(true)
    expect(JSON.stringify(saved)).not.toContain(SPACED_SECRET)
    expect(service.resolve(saved)).toBe(SPACED_SECRET)
    expect(vault.applyCalls).toBe(1)
    expect(main.current.providers as unknown[]).toHaveLength(1)
    expect(legacy.current.providers as unknown[]).toHaveLength(1)

    await service.deleteProvider({ providerId: 'openai-default' })
    expect(vault.values.size).toBe(0)
    expect(main.current).toEqual({ providers: [] })
    expect(legacy.current).toEqual({ providers: [] })
  })

  it('rejects stale compare-and-swap writes and preserves concurrent external config changes', async () => {
    const surface = createSurface({ providers: [provider({ enabled: false })] })
    const vault = createVault()
    const service = createProviderCredentialService({ surfaces: [surface], vault })
    await service.initialize()

    const write = surface.write.bind(surface)
    let injectConflict = true
    surface.write = async (document, expectedRevision) => {
      if (injectConflict) {
        injectConflict = false
        surface.current = { ...surface.current, externalRevision: 'preserve-me' }
        surface.revision += 1
      }
      return await write(document, expectedRevision)
    }

    await expect(
      service.saveProvider({
        provider: provider({ enabled: true }),
        credential: { action: 'set', value: SECRET }
      })
    ).rejects.toThrow('PROVIDER_CREDENTIAL_CONFIG_WRITE_FAILED')

    expect(surface.current.externalRevision).toBe('preserve-me')
    expect(vault.values.size).toBe(0)
    expect(service.resolve(provider())).toBeUndefined()
  })

  it('uses secure storage as source of truth even when the credential was not cached', async () => {
    const key = providerCredentialSecureStoreKey('orphan-provider')
    const main = createSurface({ providers: [] }, { id: 'main-config' })
    const legacy = createSurface({ providers: [] }, { id: 'legacy-db' })
    const vault = createVault({ [key]: SPACED_SECRET })
    const service = createProviderCredentialService({ surfaces: [main, legacy], vault })
    await service.initialize()

    expect(service.has('orphan-provider')).toBe(false)
    const saved = await service.saveProvider({
      provider: provider({ id: 'orphan-provider' }),
      credential: { action: 'preserve' }
    })
    expect(saved.hasCredential).toBe(true)
    expect(service.resolve(saved)).toBe(SPACED_SECRET)

    await service.destroy()
    const restarted = createProviderCredentialService({ surfaces: [main, legacy], vault })
    await restarted.initialize()
    await restarted.deleteProvider({ providerId: 'orphan-provider' })
    expect(vault.values.has(key)).toBe(false)
  })

  it('rejects apiKey mirrors, nested credentials, accessors, proxies, sparse arrays and classes', async () => {
    const surface = createSurface({ providers: [provider({ enabled: false })] })
    const vault = createVault()
    const service = createProviderCredentialService({ surfaces: [surface], vault })
    await service.initialize()

    const hostileProviders: unknown[] = [
      provider({ apiKey: SECRET }),
      provider({ metadata: { apiKey: SECRET } }),
      provider({ metadata: new Proxy({}, {}) }),
      provider({ models: Array.from({ length: 2 }) }),
      provider({ metadata: new (class HostMetadata {})() }),
      Object.defineProperty(provider(), 'metadata', {
        enumerable: true,
        get: () => ({ origin: 'accessor' })
      })
    ]
    for (const hostile of hostileProviders) {
      await expect(
        service.saveProvider({
          provider: hostile as IntelligenceProviderConfig,
          credential: { action: 'preserve' }
        })
      ).rejects.toThrow('PROVIDER_CREDENTIAL_REQUEST_INVALID')
    }
  })

  it('clears in-memory credentials and rejects new work after shutdown', async () => {
    const key = providerCredentialSecureStoreKey('openai-default')
    const surface = createSurface({ providers: [provider()] })
    const vault = createVault({ [key]: SECRET })
    const service = createProviderCredentialService({ surfaces: [surface], vault })
    await service.initialize()

    await service.destroy()

    expect(service.resolve(provider())).toBeUndefined()
    await expect(service.deleteProvider({ providerId: 'openai-default' })).rejects.toThrow(
      'PROVIDER_CREDENTIAL_SERVICE_CLOSED'
    )
  })

  it('redacts provider credentials from renderer projections and nested storage', () => {
    const redacted = redactProviderConfigDocument({
      providers: [provider({ apiKey: SECRET })]
    })
    const rejectedNested = redactProviderConfigDocument({
      providers: [provider({ metadata: { token: SECRET } })]
    })

    expect(redacted).toEqual({
      providers: [expect.objectContaining({ hasCredential: true })]
    })
    expect(JSON.stringify(redacted)).not.toContain(SECRET)
    expect(JSON.stringify(redacted)).not.toContain('apiKey')
    expect(rejectedNested).toEqual({})
  })
})
