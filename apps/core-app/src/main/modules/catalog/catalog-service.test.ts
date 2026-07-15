import {
  CATALOG_CLIENT_SDKAPI,
  CATALOG_ERROR_CODES,
  CatalogContractError,
  DomainLexiconRegistry,
  type CatalogManifestV1,
  type DomainLexiconEntry
} from '@talex-touch/utils/i18n'
import { describe, expect, it, vi } from 'vitest'
import type {
  BuiltinCatalogPack,
  CatalogRepository,
  CatalogRepositorySnapshot,
  CatalogStoredPack
} from './catalog-repository'
import type { CatalogRemote } from './catalog-remote'
import { DefaultCatalogService, type CatalogServiceLogger } from './catalog-service'
import type { CatalogVerifier, VerifiedDomainLexiconPack } from './catalog-verifier'

const createdAt = '2026-07-15T00:00:00.000Z'

function entry(
  label: string,
  source: DomainLexiconEntry['source'],
  version: string
): DomainLexiconEntry {
  return {
    id: 'unit.length.catalog-meter',
    domain: 'unit',
    source,
    version,
    labels: {
      default: label,
      locales: { 'zh-CN': `${label}-中文`, 'en-US': label }
    },
    aliases: {
      default: [`${label}-alias`],
      locales: {
        'zh-CN': [`${label}-中文别名`],
        'en-US': [`${label}-alias`]
      }
    }
  }
}

function registry(
  label: string,
  source: DomainLexiconEntry['source'],
  version: string
): DomainLexiconRegistry {
  return new DomainLexiconRegistry([entry(label, source, version)])
}

function baseline(): BuiltinCatalogPack {
  const version = '260000'
  const baselineEntry = entry('baseline meter', 'builtin', version)
  return {
    manifest: {
      type: 'domain-lexicon',
      packId: 'builtin.domain-lexicon',
      version,
      schemaVersion: 1,
      createdAt,
      minSdkapi: CATALOG_CLIENT_SDKAPI,
      locales: ['zh-CN', 'en-US'],
      entryCount: 1,
      payloadBytes: 100,
      payloadSha256: 'b'.repeat(64)
    },
    source: 'builtin',
    signatureStatus: 'builtin',
    entries: [baselineEntry],
    registry: new DomainLexiconRegistry([baselineEntry])
  }
}

function stored(
  version: string,
  options: {
    packId?: string
    source?: 'builtin' | 'remote'
    status?: 'ready' | 'active' | 'previous'
    hash?: string
  } = {}
): CatalogStoredPack {
  const source = options.source ?? 'remote'
  return {
    type: 'domain-lexicon',
    packId:
      options.packId ??
      (source === 'builtin' ? 'builtin.domain-lexicon' : 'official.domain-lexicon'),
    version,
    schemaVersion: 1,
    createdAt,
    minSdkapi: CATALOG_CLIENT_SDKAPI,
    locales: ['zh-CN', 'en-US'],
    entryCount: 1,
    payloadBytes: 100,
    payloadSha256: options.hash ?? (source === 'builtin' ? 'b' : 'a').repeat(64),
    source,
    signatureStatus: source === 'builtin' ? 'builtin' : 'verified',
    status: options.status ?? 'active',
    importedAt: 100,
    activatedAt: options.status === 'ready' ? null : 101
  }
}

function repositorySnapshot(
  options: {
    active?: CatalogStoredPack
    previous?: CatalogStoredPack | null
    activeRegistry?: DomainLexiconRegistry
    rollbackReason?: 'operator-request' | null
    lastUpdatedAt?: number
  } = {}
): CatalogRepositorySnapshot {
  const active = options.active ?? stored('260000', { source: 'builtin', status: 'active' })
  const source: DomainLexiconEntry['source'] =
    active.source === 'builtin' ? 'builtin' : `catalog:${active.packId}@${active.version}`
  return {
    active,
    previous: options.previous ?? null,
    lastCheckedAt: null,
    lastUpdatedAt: options.lastUpdatedAt ?? 101,
    rollbackReason: options.rollbackReason ?? null,
    registry: options.activeRegistry ?? registry(`${active.version} meter`, source, active.version)
  }
}

function manifest(overrides: Partial<CatalogManifestV1> = {}): CatalogManifestV1 {
  return {
    contractVersion: 1,
    type: 'domain-lexicon',
    packId: 'official.domain-lexicon',
    version: '2026.07.15',
    schemaVersion: 1,
    createdAt,
    minSdkapi: CATALOG_CLIENT_SDKAPI,
    locales: ['zh-CN', 'en-US'],
    entryCount: 1,
    payloadBytes: 100,
    payloadSha256: 'a'.repeat(64),
    signatureAlgorithm: 'rsa-sha256',
    keyId: 'release-v1',
    signature: 'c2lnbmF0dXJl',
    ...overrides
  }
}

function verifiedPack(signed = manifest()): VerifiedDomainLexiconPack {
  const remoteSource: DomainLexiconEntry['source'] = `catalog:${signed.packId}@${signed.version}`
  const remoteEntry = entry('remote meter', remoteSource, signed.version)
  const { signature: _signature, ...verifiedManifest } = signed
  return {
    manifest: verifiedManifest,
    source: 'remote',
    signatureStatus: 'verified',
    entries: [remoteEntry],
    registry: new DomainLexiconRegistry([remoteEntry])
  } as unknown as VerifiedDomainLexiconPack
}

function harness(
  options: {
    initialize?: () => Promise<CatalogRepositorySnapshot>
    latest?: () => Promise<Uint8Array | null>
  } = {}
) {
  const base = baseline()
  const baselineSnapshot = repositorySnapshot({
    activeRegistry: base.registry
  })
  const signed = manifest()
  const verified = verifiedPack(signed)
  const ready = stored(signed.version, { status: 'ready' })
  const activeSnapshot = repositorySnapshot({
    active: { ...ready, status: 'active', activatedAt: 200 },
    previous: stored('260000', {
      source: 'builtin',
      status: 'previous'
    }),
    activeRegistry: verified.registry,
    lastUpdatedAt: 200
  })

  const repository: CatalogRepository = {
    initializeBaseline: vi.fn(options.initialize ?? (async () => baselineSnapshot)),
    importVerifiedPack: vi.fn(async () => ready),
    activatePack: vi.fn(async () => activeSnapshot),
    rollback: vi.fn(async () => baselineSnapshot),
    getStatus: vi.fn(async () => baselineSnapshot)
  }
  const remote: CatalogRemote = {
    fetchLatestManifest: vi.fn(options.latest ?? (async () => new Uint8Array([1]))),
    fetchPack: vi.fn(async () => new Uint8Array([2]))
  }
  const verifier: CatalogVerifier = {
    verifyManifest: vi.fn(() => signed),
    verifyPack: vi.fn(() => verified)
  }
  const logger: CatalogServiceLogger = {
    info: vi.fn(),
    warn: vi.fn()
  }
  let now = 500
  const service = new DefaultCatalogService({
    repository,
    remote,
    verifier,
    baseline: base,
    clock: () => now++,
    logger
  })

  return {
    service,
    repository,
    remote,
    verifier,
    logger,
    base,
    signed,
    verified,
    ready,
    baselineSnapshot,
    activeSnapshot
  }
}

describe('DefaultCatalogService', () => {
  it('starts with the packaged baseline and initializes without network access', async () => {
    const { service, repository, remote, base } = harness()

    expect(service.getActiveRegistry()).toBe(base.registry)
    const status = await service.initialize()

    expect(repository.initializeBaseline).toHaveBeenCalledWith(base)
    expect(remote.fetchLatestManifest).not.toHaveBeenCalled()
    expect(remote.fetchPack).not.toHaveBeenCalled()
    expect(status).toMatchObject({
      databaseAvailable: true,
      registrySource: 'sqlite',
      lastErrorCode: null
    })
    expect(Object.isFrozen(status)).toBe(true)
  })

  it('degrades initialization to the built-in registry without leaking database errors', async () => {
    const failure = new CatalogContractError(
      CATALOG_ERROR_CODES.databaseUnavailable,
      'sensitive /Users/name/database.db'
    )
    const { service, base, remote, logger } = harness({
      initialize: async () => {
        throw failure
      }
    })

    await expect(service.initialize()).resolves.toMatchObject({
      databaseAvailable: false,
      registrySource: 'builtin-fallback',
      lastErrorCode: CATALOG_ERROR_CODES.databaseUnavailable
    })
    expect(service.getActiveRegistry()).toBe(base.registry)
    expect(remote.fetchLatestManifest).not.toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('database.db')
    expect(logger.warn).toHaveBeenCalledWith('Catalog operation failed', {
      operation: 'initialize',
      code: CATALOG_ERROR_CODES.databaseUnavailable,
      type: undefined,
      packId: undefined,
      version: undefined
    })
  })

  it('keeps check, download, import, activation, and rollback as explicit stages', async () => {
    const {
      service,
      repository,
      remote,
      verifier,
      verified,
      signed,
      ready,
      activeSnapshot,
      baselineSnapshot,
      base
    } = harness()
    await service.initialize()

    await expect(service.checkUpdates()).resolves.toMatchObject({
      status: 'update-available'
    })
    expect(remote.fetchPack).not.toHaveBeenCalled()
    expect(repository.importVerifiedPack).not.toHaveBeenCalled()
    expect(repository.activatePack).not.toHaveBeenCalled()

    await expect(service.downloadPack(signed)).resolves.toBe(verified)
    expect(verifier.verifyPack).toHaveBeenCalled()

    await expect(service.importPack(verified)).resolves.toBe(ready)
    expect(service.getActiveRegistry()).toBe(base.registry)
    expect(repository.activatePack).not.toHaveBeenCalled()

    await service.activatePack(ready)
    expect(service.getActiveRegistry()).toBe(activeSnapshot.registry)
    expect(service.getStatus().previous?.packId).toBe('builtin.domain-lexicon')

    vi.mocked(repository.rollback).mockResolvedValueOnce(baselineSnapshot)
    await service.rollback('domain-lexicon', 'manual')
    expect(service.getActiveRegistry()).toBe(baselineSnapshot.registry)
  })

  it('returns no-update for identical active content and rejects same-version hash conflicts', async () => {
    const active = stored('2026.07.15', { status: 'active' })
    const activeSnapshot = repositorySnapshot({ active })
    const { service, repository, verifier } = harness()
    vi.mocked(repository.initializeBaseline).mockResolvedValueOnce(activeSnapshot)
    await service.initialize()

    await expect(service.checkUpdates()).resolves.toEqual({
      status: 'no-update',
      type: 'domain-lexicon'
    })

    vi.mocked(verifier.verifyManifest).mockReturnValueOnce(
      manifest({ payloadSha256: 'c'.repeat(64) })
    )
    await expect(service.checkUpdates()).rejects.toMatchObject({
      code: CATALOG_ERROR_CODES.versionConflict
    })
    expect(service.getStatus().lastErrorCode).toBe(CATALOG_ERROR_CODES.versionConflict)
  })

  it('clears stale errors after success while retaining rollback reason until activation', async () => {
    const rolledBackSnapshot = repositorySnapshot({
      active: stored('2026.07.15', { status: 'active' }),
      previous: stored('2026.07.16', { status: 'previous' }),
      rollbackReason: 'operator-request'
    })
    const { service, repository, remote, activeSnapshot } = harness()
    vi.mocked(repository.initializeBaseline).mockResolvedValueOnce(rolledBackSnapshot)
    await service.initialize()

    vi.mocked(remote.fetchLatestManifest).mockRejectedValueOnce(
      new CatalogContractError(CATALOG_ERROR_CODES.remoteUnavailable, 'sensitive upstream body')
    )
    await expect(service.checkUpdates()).rejects.toMatchObject({
      code: CATALOG_ERROR_CODES.remoteUnavailable
    })
    expect(service.getStatus()).toMatchObject({
      lastErrorCode: CATALOG_ERROR_CODES.remoteUnavailable,
      rollbackReason: 'operator-request'
    })

    vi.mocked(remote.fetchLatestManifest).mockResolvedValueOnce(null)
    await expect(service.checkUpdates()).resolves.toEqual({
      status: 'no-update',
      type: 'domain-lexicon'
    })
    expect(service.getStatus()).toMatchObject({
      lastErrorCode: null,
      rollbackReason: 'operator-request'
    })

    vi.mocked(repository.activatePack).mockResolvedValueOnce(activeSnapshot)
    await service.activatePack(activeSnapshot.active)
    expect(service.getStatus().rollbackReason).toBeNull()
  })

  it('does not publish a candidate registry when activation persistence fails', async () => {
    const { service, repository, base, ready } = harness()
    await service.initialize()
    vi.mocked(repository.activatePack).mockRejectedValueOnce(
      new CatalogContractError(CATALOG_ERROR_CODES.activationFailed, 'sensitive sqlite details')
    )

    await expect(service.activatePack(ready)).rejects.toMatchObject({
      code: CATALOG_ERROR_CODES.activationFailed
    })
    expect(service.getActiveRegistry()).toBe(base.registry)
    expect(service.getStatus().lastErrorCode).toBe(CATALOG_ERROR_CODES.activationFailed)
  })
})
