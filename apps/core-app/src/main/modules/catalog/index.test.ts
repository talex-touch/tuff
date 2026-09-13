import type { ModuleDestroyContext, ModuleInitContext } from '@talex-touch/utils'
import {
  CATALOG_ERROR_CODES,
  type CatalogManifestV1,
  type CatalogPackType
} from '@talex-touch/utils/i18n'
import { CatalogEvents } from '@talex-touch/utils/transport/events'
import type {
  CatalogVoiceProviderCheckResponse,
  CatalogVoiceProviderRollbackResponse,
  CatalogVoiceProviderSyncResponse
} from '@talex-touch/utils/transport/events/types/catalog'
import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type {
  CatalogRepository,
  CatalogRepositorySnapshot,
  CatalogStoredPack,
  VoiceProviderCatalogRepository,
  VoiceProviderCatalogSnapshot
} from './catalog-repository'
import type { CatalogRemote, VoiceProviderCatalogRemote } from './catalog-remote'
import type {
  CatalogVerifier,
  VerifiedVoiceProviderPack,
  VoiceProviderCatalogVerifier
} from './catalog-verifier'

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

// Keep the heavy main-transport graph (electron ipcMain, stream runtime) out of this unit harness;
// the module reaches every handler through the injected `getTransport` seam.
vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn()
}))

// The module consumes auth through the injected `subscribeAuth`/`getAuthState` seams; the real
// module is replaced so signed-out is the deterministic fallback for the tests that omit them.
vi.mock('../auth', () => ({
  subscribeAuthState: vi.fn(() => () => {}),
  getSanitizedAuthSessionState: vi.fn(() => ({
    isLoaded: true,
    isSignedIn: false,
    user: null
  }))
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

type CatalogAuthState = {
  isLoaded: boolean
  isSignedIn: boolean
  user: { id: string } | null
}

const signedOutState: CatalogAuthState = { isLoaded: true, isSignedIn: false, user: null }
const signedInState = (id: string): CatalogAuthState => ({
  isLoaded: true,
  isSignedIn: true,
  user: { id }
})

/** A signature value that only the signed manifest carries: it must never cross a control response. */
const VOICE_MANIFEST_SIGNATURE = 'SIGNATURE-SECRET-MUST-NOT-LEAK'

function voiceManifest(): CatalogManifestV1 {
  return {
    contractVersion: 1,
    type: 'voice-provider',
    packId: 'voice.demo-pack',
    version: '2',
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    minSdkapi: 0,
    locales: ['en-US'],
    entryCount: 1,
    payloadBytes: 8,
    payloadSha256: 'b'.repeat(64),
    payloadEncryption: { algorithm: 'aes-256-gcm', keyId: 'voice-key-v1' },
    signatureAlgorithm: 'rsa-sha256',
    keyId: 'release-v1',
    signature: VOICE_MANIFEST_SIGNATURE
  }
}

function storedVoicePack(manifest: CatalogManifestV1): CatalogStoredPack {
  return {
    type: manifest.type,
    packId: manifest.packId,
    version: manifest.version,
    schemaVersion: manifest.schemaVersion,
    createdAt: manifest.createdAt,
    minSdkapi: manifest.minSdkapi,
    locales: manifest.locales,
    entryCount: manifest.entryCount,
    payloadBytes: manifest.payloadBytes,
    payloadSha256: manifest.payloadSha256,
    source: 'remote',
    signatureStatus: 'verified',
    status: 'active',
    importedAt: 150,
    activatedAt: 160
  }
}

function voiceSnapshot(pack: CatalogStoredPack): VoiceProviderCatalogSnapshot {
  return {
    active: pack,
    previous: null,
    lastCheckedAt: null,
    lastUpdatedAt: pack.activatedAt,
    rollbackReason: null,
    registry: {} as VoiceProviderCatalogSnapshot['registry'],
    pack: {} as VoiceProviderCatalogSnapshot['pack']
  }
}

type TransportHandler = (payload: unknown, context: HandlerContext) => unknown
type CatalogEvent = { toEventName: () => string }

/**
 * Wires the module's injected seams to recorders so a test can drive auth transitions and call the
 * registered transport handlers directly. `pipeline` records the voice-provider call order across
 * remote, verifier, and repository seams.
 */
function createVoiceHarness(
  options: { auth?: CatalogAuthState; manifest?: CatalogManifestV1 } = {}
) {
  const manifest = options.manifest ?? voiceManifest()
  const pipeline: string[] = []
  const payloadBytes = new Uint8Array([1, 2, 3])
  const stored = storedVoicePack(manifest)
  const voiceProviderSnapshot = voiceSnapshot(stored)

  const repository: CatalogRepository = {
    initializeBaseline: vi.fn(async () => snapshot()),
    importVerifiedPack: vi.fn(),
    activatePack: vi.fn(),
    rollback: vi.fn(),
    getStatus: vi.fn()
  }
  const remote: CatalogRemote = {
    fetchLatestManifest: vi.fn(async (type: CatalogPackType) => {
      pipeline.push(`check:${type}`)
      return new Uint8Array([9])
    }),
    fetchPack: vi.fn(async () => {
      pipeline.push('download')
      return payloadBytes
    })
  }
  const verifier: CatalogVerifier = {
    verifyManifest: vi.fn(() => manifest),
    verifyPack: vi.fn()
  }
  const voiceVerifier: VoiceProviderCatalogVerifier = {
    verifyVoiceProviderPack: vi.fn(() => ({ manifest }) as unknown as VerifiedVoiceProviderPack)
  }
  const voiceRemote: VoiceProviderCatalogRemote = {
    fetchVoiceProviderPayloadKey: vi.fn(async () => {
      pipeline.push('key')
      return { keyId: 'voice-key-v1', keyBytes: new Uint8Array(32) }
    })
  }
  const voiceRepository: VoiceProviderCatalogRepository = {
    importVoiceProviderPack: vi.fn(async () => {
      pipeline.push('import')
      return stored
    }),
    activateVoiceProviderPack: vi.fn(async () => {
      pipeline.push('activate')
      return voiceProviderSnapshot
    }),
    rollbackVoiceProvider: vi.fn(async () => {
      pipeline.push('rollback')
      return voiceProviderSnapshot
    }),
    getVoiceProviderStatus: vi.fn(),
    loadVoiceProviderSnapshot: vi.fn(async () => null)
  }

  const handlers = new Map<string, TransportHandler>()
  const handlerCleanups: Mock[] = []
  const transport = {
    on: vi.fn((event: CatalogEvent, handler: TransportHandler) => {
      const key = event.toEventName()
      handlers.set(key, handler)
      const cleanup = vi.fn(() => handlers.delete(key))
      handlerCleanups.push(cleanup)
      return cleanup
    })
  } as unknown as ITuffTransportMain

  const listeners = new Set<(state: CatalogAuthState) => void>()
  const authTeardown = vi.fn()
  const getAuthState = vi.fn(() => authState.current)
  const subscribeAuth = vi.fn((listener: (state: CatalogAuthState) => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      authTeardown()
    }
  })
  const authState = { current: options.auth ?? signedOutState }
  const emitAuth = (state: CatalogAuthState): void => {
    authState.current = state
    for (const listener of [...listeners]) listener(state)
  }

  const module = new CatalogModule({
    repository,
    remote,
    verifier,
    voiceRepository,
    voiceVerifier,
    voiceRemote,
    publishRegistry: vi.fn(),
    subscribeAuth,
    getAuthState,
    getTransport: () => transport
  })

  const handlerFor = (event: CatalogEvent): TransportHandler => {
    const handler = handlers.get(event.toEventName())
    if (!handler) throw new Error(`No handler registered for ${event.toEventName()}`)
    return handler
  }

  const invoke = async (
    event: CatalogEvent,
    payload: unknown = {},
    context: HandlerContext = {} as HandlerContext
  ): Promise<unknown> => handlerFor(event)(payload, context)

  return {
    module,
    repository,
    remote,
    verifier,
    voiceRepository,
    voiceVerifier,
    voiceRemote,
    pipeline,
    handlers,
    handlerCleanups,
    subscribeAuth,
    getAuthState,
    emitAuth,
    authTeardown,
    invoke
  }
}

/** Drains queued microtasks so the fire-and-forget login sync settles without wall-clock waits. */
async function flushMicrotasks(count = 1): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve()
  }
}

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

  describe('voice provider catalog controls', () => {
    it('performs zero catalog remote calls at signed-out startup and one ordered voice sync on first sign-in', async () => {
      const harness = createVoiceHarness()
      await harness.module.onInit(initContext)

      expect(harness.remote.fetchLatestManifest).not.toHaveBeenCalled()
      expect(harness.remote.fetchPack).not.toHaveBeenCalled()

      harness.emitAuth(signedInState('account-a'))
      await flushMicrotasks(64)

      expect(harness.pipeline).toEqual([
        'check:voice-provider',
        'download',
        'key',
        'import',
        'activate'
      ])
    })

    it('runs the login voice sync exactly once per account transition', async () => {
      const harness = createVoiceHarness({ auth: signedInState('account-a') })
      await harness.module.onInit(initContext)
      await flushMicrotasks(64)
      expect(harness.remote.fetchLatestManifest).toHaveBeenCalledTimes(1)

      // The same account re-emitting a signed-in state must not launch a second sync.
      harness.emitAuth(signedInState('account-a'))
      await flushMicrotasks(64)
      expect(harness.remote.fetchLatestManifest).toHaveBeenCalledTimes(1)

      // Logging out re-arms the account so a later sign-in syncs again.
      harness.emitAuth(signedOutState)
      harness.emitAuth(signedInState('account-a'))
      await flushMicrotasks(64)
      expect(harness.remote.fetchLatestManifest).toHaveBeenCalledTimes(2)

      // Switching to a different account also syncs.
      harness.emitAuth(signedInState('account-b'))
      await flushMicrotasks(64)
      expect(harness.remote.fetchLatestManifest).toHaveBeenCalledTimes(3)
    })

    it('queues one sync for an account that signs in while another sync is in flight', async () => {
      const harness = createVoiceHarness()
      await harness.module.onInit(initContext)

      // Gate account A's first check so its sync stays in flight while B signs in. B is then served a
      // newer pack version so its queued sync is a full pipeline rather than an immediate no-update.
      const newerManifest = { ...voiceManifest(), version: '3', payloadSha256: 'c'.repeat(64) }
      const firstCheck = Promise.withResolvers<Uint8Array>()
      let checkCount = 0
      let verifyCount = 0
      vi.mocked(harness.remote.fetchLatestManifest).mockImplementation(async (type) => {
        checkCount += 1
        harness.pipeline.push(`check:${type}`)
        return checkCount === 1 ? firstCheck.promise : new Uint8Array([9])
      })
      vi.mocked(harness.verifier.verifyManifest).mockImplementation(() => {
        verifyCount += 1
        return verifyCount === 1 ? voiceManifest() : newerManifest
      })

      harness.emitAuth(signedInState('account-a'))
      await flushMicrotasks(64)
      expect(harness.pipeline).toEqual(['check:voice-provider'])

      harness.emitAuth(signedInState('account-b'))
      // B re-emitting the same signed-in state must not queue a second pending sync.
      harness.emitAuth(signedInState('account-b'))
      await flushMicrotasks(64)
      expect(harness.pipeline).toEqual(['check:voice-provider'])

      firstCheck.resolve(new Uint8Array([9]))
      await flushMicrotasks(256)

      // A finishes completely, then B's single queued sync runs: no interleaved mutation order.
      expect(harness.pipeline).toEqual([
        'check:voice-provider',
        'download',
        'key',
        'import',
        'activate',
        'check:voice-provider',
        'download',
        'key',
        'import',
        'activate'
      ])
      expect(checkCount).toBe(2)
      expect(verifyCount).toBe(2)
      expect(harness.voiceRepository.activateVoiceProviderPack).toHaveBeenCalledTimes(2)
    })

    it('answers a signed-out manual check and sync with the stable auth error before any remote work', async () => {
      const harness = createVoiceHarness()
      await harness.module.onInit(initContext)

      const check = (await harness.invoke(
        CatalogEvents.voiceProvider.checkUpdates
      )) as CatalogVoiceProviderCheckResponse
      const sync = (await harness.invoke(
        CatalogEvents.voiceProvider.sync
      )) as CatalogVoiceProviderSyncResponse

      expect(check).toMatchObject({
        outcome: 'failed',
        candidate: null,
        errorCode: CATALOG_ERROR_CODES.authenticationRequired
      })
      expect(sync).toMatchObject({
        outcome: 'failed',
        activated: null,
        errorCode: CATALOG_ERROR_CODES.authenticationRequired
      })

      // The gate must land before the remote, verifier, and repository seams, not after a failure.
      expect(harness.pipeline).toEqual([])
      expect(harness.remote.fetchLatestManifest).not.toHaveBeenCalled()
      expect(harness.remote.fetchPack).not.toHaveBeenCalled()
      expect(harness.voiceRemote.fetchVoiceProviderPayloadKey).not.toHaveBeenCalled()
      expect(harness.verifier.verifyManifest).not.toHaveBeenCalled()
      expect(harness.voiceVerifier.verifyVoiceProviderPack).not.toHaveBeenCalled()
      expect(harness.voiceRepository.importVoiceProviderPack).not.toHaveBeenCalled()
      expect(harness.voiceRepository.activateVoiceProviderPack).not.toHaveBeenCalled()
    })

    it('keeps status and the local rollback entry reachable while signed out', async () => {
      const harness = createVoiceHarness()
      await harness.module.onInit(initContext)

      const status = await harness.invoke(CatalogEvents.voiceProvider.getStatus)
      expect(status).toEqual({
        status: expect.objectContaining({ active: null, lastErrorCode: null })
      })

      const rollback = (await harness.invoke(CatalogEvents.voiceProvider.rollback, {
        reason: 'manual'
      })) as CatalogVoiceProviderRollbackResponse
      expect(rollback).toMatchObject({ outcome: 'rolled-back', errorCode: null })
      expect(harness.voiceRepository.rollbackVoiceProvider).toHaveBeenCalledWith('manual')

      expect(harness.pipeline).toEqual(['rollback'])
      expect(harness.remote.fetchLatestManifest).not.toHaveBeenCalled()
    })

    it('serves sanitized diagnostics and drives the exact service pipeline for host callers', async () => {
      const harness = createVoiceHarness({ auth: signedInState('account-a') })
      const activatedDiagnostic = {
        type: 'voice-provider',
        packId: 'voice.demo-pack',
        version: '2',
        payloadSha256: 'b'.repeat(64),
        source: 'remote',
        signatureStatus: 'verified'
      }
      const newerManifest = { ...voiceManifest(), version: '3', payloadSha256: 'c'.repeat(64) }
      const newerDiagnostic = {
        ...activatedDiagnostic,
        version: '3',
        payloadSha256: 'c'.repeat(64)
      }
      let verifyCount = 0
      // The login sync activates version 2; the manual controls then see version 3 as the remote
      // head so this test still exercises the real check/download/key/import/activate pipeline.
      vi.mocked(harness.verifier.verifyManifest).mockImplementation(() =>
        verifyCount++ === 0 ? voiceManifest() : newerManifest
      )
      await harness.module.onInit(initContext)
      await flushMicrotasks(64)
      harness.pipeline.length = 0

      const status = await harness.invoke(CatalogEvents.voiceProvider.getStatus)
      expect(Object.keys(status as object)).toEqual(['status'])
      expect(status).toEqual({
        status: expect.objectContaining({ active: activatedDiagnostic, lastErrorCode: null })
      })
      expect(JSON.stringify(status)).not.toContain(VOICE_MANIFEST_SIGNATURE)

      const check = (await harness.invoke(
        CatalogEvents.voiceProvider.checkUpdates
      )) as CatalogVoiceProviderCheckResponse
      expect(check).toMatchObject({ outcome: 'update-available', errorCode: null })
      expect(check.candidate).toEqual(newerDiagnostic)
      expect(harness.pipeline).toEqual(['check:voice-provider'])
      expect(JSON.stringify(check)).not.toContain(VOICE_MANIFEST_SIGNATURE)

      harness.pipeline.length = 0
      const sync = (await harness.invoke(
        CatalogEvents.voiceProvider.sync
      )) as CatalogVoiceProviderSyncResponse
      expect(sync).toMatchObject({ outcome: 'activated', errorCode: null })
      expect(sync.activated).toEqual(activatedDiagnostic)
      expect(harness.pipeline).toEqual([
        'check:voice-provider',
        'download',
        'key',
        'import',
        'activate'
      ])
      expect(JSON.stringify(sync)).not.toContain(VOICE_MANIFEST_SIGNATURE)

      harness.pipeline.length = 0
      const rollback = (await harness.invoke(CatalogEvents.voiceProvider.rollback, {
        reason: 'manual'
      })) as CatalogVoiceProviderRollbackResponse
      expect(rollback).toMatchObject({ outcome: 'rolled-back', errorCode: null })
      expect(harness.voiceRepository.rollbackVoiceProvider).toHaveBeenCalledWith('manual')
      expect(harness.pipeline).toEqual(['rollback'])
      expect(JSON.stringify(rollback)).not.toContain(VOICE_MANIFEST_SIGNATURE)
    })

    it('rejects plugin callers and never reaches a catalog mutation seam', async () => {
      const harness = createVoiceHarness()
      await harness.module.onInit(initContext)
      const pluginContext = { plugin: { name: 'untrusted-plugin' } } as unknown as HandlerContext

      for (const event of [
        CatalogEvents.voiceProvider.getStatus,
        CatalogEvents.voiceProvider.checkUpdates,
        CatalogEvents.voiceProvider.sync,
        CatalogEvents.voiceProvider.rollback
      ]) {
        await expect(harness.invoke(event, {}, pluginContext)).rejects.toMatchObject({
          code: CATALOG_ERROR_CODES.typeUnsupported
        })
      }

      expect(harness.pipeline).toEqual([])
      expect(harness.remote.fetchLatestManifest).not.toHaveBeenCalled()
      expect(harness.remote.fetchPack).not.toHaveBeenCalled()
      expect(harness.voiceRepository.importVoiceProviderPack).not.toHaveBeenCalled()
      expect(harness.voiceRepository.activateVoiceProviderPack).not.toHaveBeenCalled()
      expect(harness.voiceRepository.rollbackVoiceProvider).not.toHaveBeenCalled()
    })

    it('disposes transport handlers and the auth subscription on destroy', async () => {
      const harness = createVoiceHarness()
      await harness.module.onInit(initContext)

      expect(harness.handlers.size).toBe(4)
      expect(harness.subscribeAuth).toHaveBeenCalledTimes(1)

      harness.module.onDestroy(destroyContext)

      expect(harness.handlers.size).toBe(0)
      expect(harness.authTeardown).toHaveBeenCalledTimes(1)
      for (const cleanup of harness.handlerCleanups) {
        expect(cleanup).toHaveBeenCalledTimes(1)
      }
    })
  })
})
