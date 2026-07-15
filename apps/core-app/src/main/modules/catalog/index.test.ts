import type { ModuleDestroyContext, ModuleInitContext } from '@talex-touch/utils'
import { CATALOG_ERROR_CODES } from '@talex-touch/utils/i18n'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type {
  CatalogRepository,
  CatalogRepositorySnapshot,
  CatalogStoredPack
} from './catalog-repository'
import type { CatalogRemote } from './catalog-remote'
import type { CatalogVerifier } from './catalog-verifier'

vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd() }
}))

vi.mock('../database', () => ({
  databaseModule: { getDb: vi.fn() }
}))

vi.mock('../network', () => ({
  getNetworkService: vi.fn()
}))

vi.mock('../nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: () => 'https://nexus.example.test'
}))

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}))

import {
  CatalogModule,
  catalogTrustRootCandidates,
  createBuiltinCatalogPack,
  resolveCatalogTrustRootPath
} from './index'
import { PinnedCatalogVerifier } from './catalog-verifier'

function snapshot(): CatalogRepositorySnapshot {
  const baseline = createBuiltinCatalogPack()
  const active: CatalogStoredPack = {
    ...baseline.manifest,
    source: 'builtin',
    signatureStatus: 'builtin',
    status: 'active',
    importedAt: 100,
    activatedAt: 101
  }
  return {
    active,
    previous: null,
    lastCheckedAt: null,
    lastUpdatedAt: 101,
    rollbackReason: null,
    registry: baseline.registry
  }
}

function dependencies(
  options: {
    initialize?: () => Promise<CatalogRepositorySnapshot>
    latest?: () => Promise<Uint8Array | null>
  } = {}
) {
  const initialized = snapshot()
  const repository: CatalogRepository = {
    initializeBaseline: vi.fn(options.initialize ?? (async () => initialized)),
    importVerifiedPack: vi.fn(),
    activatePack: vi.fn(),
    rollback: vi.fn(),
    getStatus: vi.fn()
  }
  const remote: CatalogRemote = {
    fetchLatestManifest: vi.fn(options.latest ?? (async () => new Uint8Array([1]))),
    fetchPack: vi.fn()
  }
  const verifier: CatalogVerifier = {
    verifyManifest: vi.fn(),
    verifyPack: vi.fn()
  }
  return { initialized, repository, remote, verifier }
}

const initContext = {} as ModuleInitContext<TalexEvents>
const destroyContext = {} as ModuleDestroyContext<TalexEvents>

describe('CatalogModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds one deterministic immutable baseline from the packaged unit lexicon', () => {
    const first = createBuiltinCatalogPack()
    const second = createBuiltinCatalogPack()

    expect(first.manifest).toEqual(second.manifest)
    expect(first.manifest.packId).toBe('builtin.domain-lexicon')
    expect(first.manifest.payloadSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(first.entries.length).toBeGreaterThan(0)
    expect(first.registry.resolve('unit.length.meter', 'en-US')?.label).toBe('meter')
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.entries)).toBe(true)
  })

  it('initializes storage and publishes the committed registry without any startup network call', async () => {
    const { initialized, repository, remote, verifier } = dependencies()
    const publishRegistry = vi.fn()
    const module = new CatalogModule({
      repository,
      remote,
      verifier,
      publishRegistry
    })

    await expect(module.onInit(initContext)).resolves.toBeUndefined()

    expect(repository.initializeBaseline).toHaveBeenCalledTimes(1)
    expect(remote.fetchLatestManifest).not.toHaveBeenCalled()
    expect(remote.fetchPack).not.toHaveBeenCalled()
    expect(publishRegistry).toHaveBeenCalledWith(initialized.registry)
    expect(module.getService().getStatus()).toMatchObject({
      databaseAvailable: true,
      registrySource: 'sqlite'
    })

    module.onDestroy(destroyContext)
    expect(publishRegistry).toHaveBeenLastCalledWith(expect.anything())
  })

  it('publishes committed activation and rollback registries only after their repository operations succeed', async () => {
    const { initialized, repository, remote, verifier } = dependencies()
    const activationSnapshot = snapshot()
    const rollbackSnapshot = snapshot()
    const publishRegistry = vi.fn()
    const module = new CatalogModule({
      repository,
      remote,
      verifier,
      publishRegistry
    })
    const activation = Promise.withResolvers<CatalogRepositorySnapshot>()
    vi.mocked(repository.activatePack).mockImplementationOnce(() => activation.promise)
    vi.mocked(repository.rollback).mockResolvedValueOnce(rollbackSnapshot)

    await module.onInit(initContext)
    const service = module.getService()

    const activating = service.activatePack(activationSnapshot.active)
    expect(publishRegistry).toHaveBeenCalledTimes(1)
    expect(publishRegistry).toHaveBeenLastCalledWith(initialized.registry)

    activation.resolve(activationSnapshot)
    await activating
    expect(publishRegistry).toHaveBeenNthCalledWith(2, activationSnapshot.registry)

    await service.rollback('domain-lexicon', 'manual')
    expect(publishRegistry).toHaveBeenNthCalledWith(3, rollbackSnapshot.registry)

    vi.mocked(repository.activatePack).mockRejectedValueOnce(new Error('activation failed'))
    await expect(service.activatePack(activationSnapshot.active)).rejects.toMatchObject({
      code: CATALOG_ERROR_CODES.activationFailed
    })
    expect(publishRegistry).toHaveBeenCalledTimes(3)
    expect(publishRegistry).toHaveBeenLastCalledWith(rollbackSnapshot.registry)
  })

  it('keeps startup alive and publishes the baseline when the database binding is unavailable', async () => {
    const { remote, verifier } = dependencies()
    const publishRegistry = vi.fn()
    const module = new CatalogModule({
      getDatabase: () => {
        throw new Error('sensitive database path')
      },
      remote,
      verifier,
      publishRegistry
    })

    await expect(module.onInit(initContext)).resolves.toBeUndefined()

    expect(module.getService().getStatus()).toMatchObject({
      databaseAvailable: false,
      registrySource: 'builtin-fallback',
      lastErrorCode: CATALOG_ERROR_CODES.databaseUnavailable
    })
    expect(publishRegistry).toHaveBeenCalledWith(module.getService().getActiveRegistry())
    expect(remote.fetchLatestManifest).not.toHaveBeenCalled()
  })

  it('keeps the baseline usable while a missing trust root fails remote verification closed', async () => {
    const { repository, remote } = dependencies()
    const module = new CatalogModule({
      repository,
      remote,
      loadTrustRoot: async () => {
        throw new Error('missing key path')
      },
      publishRegistry: vi.fn()
    })
    await module.onInit(initContext)

    await expect(module.getService().checkUpdates()).rejects.toMatchObject({
      code: CATALOG_ERROR_CODES.trustRootUnavailable
    })
    expect(
      module.getService().getActiveRegistry().resolve('unit.length.meter', 'en-US')?.label
    ).toBe('meter')
  })

  it('resolves the trust root from app.asar and packaged-resource layouts in stable order', async () => {
    const environment = {
      appPath: '/Applications/tuff.app/Contents/Resources/app.asar',
      resourcesPath: '/Applications/tuff.app/Contents/Resources',
      cwd: '/work/core-app'
    }
    expect(catalogTrustRootCandidates(environment)).toEqual([
      path.join(environment.appPath, 'resources/keys/release-signing-public.pem'),
      path.join(environment.resourcesPath, 'app/resources/keys/release-signing-public.pem'),
      path.join(environment.resourcesPath, 'resources/keys/release-signing-public.pem'),
      path.join(environment.cwd, 'resources/keys/release-signing-public.pem')
    ])
    expect(
      resolveCatalogTrustRootPath(
        environment,
        (candidate) => candidate === catalogTrustRootCandidates(environment)[1]
      )
    ).toBe(catalogTrustRootCandidates(environment)[1])

    const developmentPath = resolveCatalogTrustRootPath({
      appPath: process.cwd(),
      cwd: process.cwd()
    })
    const pem = await readFile(developmentPath)
    expect(() => new PinnedCatalogVerifier({ publicKeyPem: pem })).not.toThrow()
  })

  it('fails host access before lifecycle initialization with a stable error', () => {
    const module = new CatalogModule(dependencies())
    expect(() => module.getService()).toThrowError(
      expect.objectContaining({
        code: CATALOG_ERROR_CODES.databaseUnavailable
      })
    )
  })
})
