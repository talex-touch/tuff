import type {
  MaybePromise,
  ModuleDestroyContext,
  ModuleInitContext,
  ModuleKey
} from '@talex-touch/utils'
import type {
  CatalogVoiceProviderCheckResponse,
  CatalogVoiceProviderRollbackRequest,
  CatalogVoiceProviderRollbackResponse,
  CatalogVoiceProviderSyncResponse
} from '@talex-touch/utils/transport/events/types/catalog'
import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { CatalogEvents } from '@talex-touch/utils/transport/events'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import {
  CATALOG_CLIENT_SDKAPI,
  CATALOG_ERROR_CODES,
  CatalogContractError,
  DomainLexiconRegistry,
  serializeDomainLexiconCatalogPack,
  type CatalogManifestV1,
  type CatalogPackRef,
  type CatalogPackType,
  type CatalogRollbackReason,
  type DomainLexiconCatalogEntryV1,
  type DomainLexiconEntry
} from '@talex-touch/utils/i18n'
import { app } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { createLogger } from '../../utils/logger'
import {
  getSanitizedAuthSessionState,
  performNexusRequestWithAuth,
  subscribeAuthState
} from '../auth'
import { databaseModule } from '../database'
import { getNetworkService } from '../network'
import { getRuntimeNexusBaseUrl } from '../nexus/runtime-base'
import { BaseModule } from '../abstract-base-module'
import {
  SqliteCatalogRepository,
  type BuiltinCatalogPack,
  type CatalogDatabase,
  type CatalogRepository,
  type CatalogRepositorySnapshot,
  type CatalogRepositoryStatus,
  type CatalogStoredPack,
  type VoiceProviderCatalogRepository
} from './catalog-repository'
import {
  NexusCatalogRemote,
  type CatalogRemote,
  type CatalogStreamClient,
  type VoiceProviderCatalogRemote
} from './catalog-remote'
import {
  DefaultCatalogService,
  type CatalogLogContext,
  type CatalogService,
  type CatalogServiceLogger
} from './catalog-service'
import {
  PinnedCatalogVerifier,
  type CatalogVerifier,
  type VerifiedDomainLexiconPack,
  type VerifiedVoiceProviderPack,
  type VoiceProviderCatalogVerifier
} from './catalog-verifier'
import {
  replaceOfficialDomainLexiconRegistryForHost,
  UNIT_LEXICON_ENTRIES,
  UNIT_LEXICON_VERSION
} from '@talex-touch/utils/i18n/unit-lexicon'

const catalogLog = createLogger('CatalogModule')
const BUILTIN_CATALOG_PACK_ID = 'builtin.domain-lexicon'
const BUILTIN_CATALOG_CREATED_AT = '1970-01-01T00:00:00.000Z'
const TRUST_ROOT_FILE = path.join('resources', 'keys', 'release-signing-public.pem')
const resolveKeyManager = (channel: unknown): unknown =>
  (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel

export interface CatalogTrustRootEnvironment {
  appPath: string
  resourcesPath?: string
  cwd: string
}

type CatalogAuthState = {
  readonly isLoaded: boolean
  readonly isSignedIn: boolean
  readonly user: { readonly id: string } | null
}

export interface CatalogModuleDependencies {
  repository?: CatalogRepository
  remote?: CatalogRemote
  verifier?: CatalogVerifier
  voiceRepository?: VoiceProviderCatalogRepository
  voiceVerifier?: VoiceProviderCatalogVerifier
  voiceRemote?: VoiceProviderCatalogRemote
  baseline?: BuiltinCatalogPack
  getDatabase?: () => CatalogDatabase
  getNetwork?: () => CatalogStreamClient
  resolveBaseUrl?: () => string
  loadTrustRoot?: () => Promise<string | Buffer>
  publishRegistry?: (registry: DomainLexiconRegistry) => void
  clock?: () => number
  logger?: CatalogServiceLogger
  subscribeAuth?: (listener: (state: CatalogAuthState) => void) => () => void
  getAuthState?: () => CatalogAuthState
  getTransport?: (ctx: ModuleInitContext<TalexEvents>) => ITuffTransportMain | null
}

class PublishingCatalogService implements CatalogService {
  constructor(
    private readonly delegate: CatalogService,
    private readonly publish: (registry: DomainLexiconRegistry) => void
  ) {}

  async initialize() {
    const status = await this.delegate.initialize()
    this.publish(this.delegate.getActiveRegistry())
    return status
  }

  getActiveRegistry() {
    return this.delegate.getActiveRegistry()
  }

  getStatus() {
    return this.delegate.getStatus()
  }

  checkUpdates(type?: CatalogPackType) {
    return this.delegate.checkUpdates(type)
  }

  downloadPack(manifest: CatalogManifestV1) {
    return this.delegate.downloadPack(manifest)
  }

  importPack(pack: VerifiedDomainLexiconPack) {
    return this.delegate.importPack(pack)
  }

  async activatePack(ref: CatalogPackRef) {
    const status = await this.delegate.activatePack(ref)
    this.publish(this.delegate.getActiveRegistry())
    return status
  }

  async rollback(type: CatalogPackType, reason: CatalogRollbackReason) {
    const status = await this.delegate.rollback(type, reason)
    this.publish(this.delegate.getActiveRegistry())
    return status
  }

  getVoiceProviderRegistry() {
    return this.delegate.getVoiceProviderRegistry()
  }

  getVoiceProviderStatus() {
    return this.delegate.getVoiceProviderStatus()
  }

  downloadVoiceProviderPack(manifest: CatalogManifestV1) {
    return this.delegate.downloadVoiceProviderPack(manifest)
  }

  importVoiceProviderPack(pack: VerifiedVoiceProviderPack) {
    return this.delegate.importVoiceProviderPack(pack)
  }

  activateVoiceProviderPack(ref: CatalogPackRef) {
    return this.delegate.activateVoiceProviderPack(ref)
  }

  rollbackVoiceProvider(reason: CatalogRollbackReason) {
    return this.delegate.rollbackVoiceProvider(reason)
  }
}

export class CatalogModule extends BaseModule {
  static key: ModuleKey = Symbol.for('CatalogModule')
  name: ModuleKey = CatalogModule.key

  private readonly dependencies: CatalogModuleDependencies
  private readonly baseline: BuiltinCatalogPack
  private service: CatalogService | null = null
  private transport: ITuffTransportMain | null = null
  private readonly disposers: Array<() => void> = []
  private syncedAccountId: string | null = null
  private loginSyncInFlight: Promise<unknown> | null = null
  private pendingLoginSyncAccountId: string | null = null
  private voiceSyncInFlight: Promise<CatalogVoiceProviderSyncResponse> | null = null
  private voiceMutationQueue: Promise<void> = Promise.resolve()

  constructor(dependencies: CatalogModuleDependencies = {}) {
    super(CatalogModule.key)
    this.dependencies = dependencies
    this.baseline = dependencies.baseline ?? createBuiltinCatalogPack()
  }

  async onInit(_ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    const repository = this.resolveRepository()
    const remote = this.resolveRemote()
    const verifier = await this.resolveVerifier()
    const logger = this.dependencies.logger ?? defaultServiceLogger
    const voiceRepository =
      this.dependencies.voiceRepository ??
      (repository instanceof SqliteCatalogRepository ? repository : undefined)
    const voiceVerifier =
      this.dependencies.voiceVerifier ??
      (verifier instanceof PinnedCatalogVerifier ? verifier : undefined)
    const voiceRemote =
      this.dependencies.voiceRemote ?? (remote instanceof NexusCatalogRemote ? remote : undefined)

    const coreService = new DefaultCatalogService({
      repository,
      remote,
      verifier,
      baseline: this.baseline,
      voiceRepository,
      voiceVerifier,
      voiceRemote,
      clock: this.dependencies.clock,
      logger
    })
    const service = new PublishingCatalogService(coreService, (registry) =>
      this.publishRegistry(registry)
    )
    this.service = service
    this.transport = this.resolveTransport(_ctx)

    try {
      await service.initialize()
    } catch {
      // DefaultCatalogService already degrades initialization; this is a final lifecycle guard.
      this.publishRegistry(this.baseline.registry)
    }

    this.registerTransportHandlers()
    this.registerLoginSync()
  }

  onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): MaybePromise<void> {
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose()
      } catch {
        // Ignore listener cleanup failures during shutdown.
      }
    }
    this.transport = null
    this.loginSyncInFlight = null
    this.voiceSyncInFlight = null
    this.voiceMutationQueue = Promise.resolve()
    this.syncedAccountId = null
    this.pendingLoginSyncAccountId = null
    this.publishRegistry(this.baseline.registry)
    this.service = null
  }

  getService(): CatalogService {
    if (!this.service) {
      throw new CatalogContractError(
        CATALOG_ERROR_CODES.databaseUnavailable,
        'Catalog module is not initialized'
      )
    }
    return this.service
  }

  private resolveRepository(): CatalogRepository {
    if (this.dependencies.repository) return this.dependencies.repository
    try {
      const db = (this.dependencies.getDatabase ?? (() => databaseModule.getDb()))()
      return new SqliteCatalogRepository(db, { now: this.dependencies.clock })
    } catch {
      return new UnavailableCatalogRepository()
    }
  }

  private resolveRemote(): CatalogRemote {
    if (this.dependencies.remote) return this.dependencies.remote
    try {
      const network = (this.dependencies.getNetwork ?? getNetworkService)()
      const resolveBaseUrl = this.dependencies.resolveBaseUrl ?? getRuntimeNexusBaseUrl
      return new NexusCatalogRemote({
        network,
        resolveBaseUrl,
        requestWithAuth: (path) =>
          performNexusRequestWithAuth(
            { method: 'GET', path, context: 'catalog.voice-provider.payload-key' },
            {
              trustedBaseUrl: resolveBaseUrl(),
              rejectRedirects: true,
              timeoutMs: 10_000
            }
          )
      })
    } catch {
      return new UnavailableCatalogRemote()
    }
  }

  private async resolveVerifier(): Promise<CatalogVerifier> {
    if (this.dependencies.verifier) return this.dependencies.verifier
    try {
      const publicKeyPem = await (this.dependencies.loadTrustRoot ?? loadCatalogTrustRoot)()
      return new PinnedCatalogVerifier({ publicKeyPem })
    } catch {
      return new UnavailableCatalogVerifier()
    }
  }

  private resolveTransport(ctx: ModuleInitContext<TalexEvents>): ITuffTransportMain | null {
    if (this.dependencies.getTransport) return this.dependencies.getTransport(ctx)
    const channel = ctx.runtime?.channel
    return channel ? getTuffTransportMain(channel, resolveKeyManager(channel)) : null
  }

  private registerLoginSync(): void {
    const subscribe = this.dependencies.subscribeAuth ?? subscribeAuthState
    this.disposers.push(subscribe((state) => this.onAuthStateChanged(state)))
    const current = (this.dependencies.getAuthState ?? getSanitizedAuthSessionState)()
    this.onAuthStateChanged(current)
  }

  private onAuthStateChanged(state: CatalogAuthState): void {
    if (!state.isSignedIn) {
      this.syncedAccountId = null
      this.pendingLoginSyncAccountId = null
      return
    }
    const accountId = state.user?.id?.trim()
    if (!accountId || this.syncedAccountId === accountId) return
    this.syncedAccountId = accountId
    if (this.loginSyncInFlight) {
      this.pendingLoginSyncAccountId = accountId
      return
    }
    this.runLoginVoiceProviderSync(accountId)
  }

  private runLoginVoiceProviderSync(accountId: string): void {
    this.loginSyncInFlight = this.syncVoiceProviderCatalog()
      .catch(() => undefined)
      .finally(() => {
        this.loginSyncInFlight = null
        const current = (this.dependencies.getAuthState ?? getSanitizedAuthSessionState)()
        if (current.isSignedIn && current.user?.id === accountId) {
          const code = this.service?.getVoiceProviderStatus().lastErrorCode ?? null
          if (code) {
            catalogLog.warn('Voice provider catalog login sync failed', {
              meta: { operation: 'login-sync', code }
            })
          }
        }
        const pending = this.pendingLoginSyncAccountId
        this.pendingLoginSyncAccountId = null
        if (pending && current.isSignedIn && current.user?.id === pending) {
          this.runLoginVoiceProviderSync(pending)
        }
      })
  }

  private registerTransportHandlers(): void {
    if (!this.transport) return
    this.disposers.push(
      this.transport.on(CatalogEvents.voiceProvider.getStatus, (_payload, context) => {
        this.assertHostOnly(context, 'catalog.voice-provider.status')
        return { status: this.getService().getVoiceProviderStatus() }
      }),
      this.transport.on(CatalogEvents.voiceProvider.checkUpdates, (_payload, context) => {
        this.assertHostOnly(context, 'catalog.voice-provider.check-updates')
        return this.checkVoiceProviderUpdates()
      }),
      this.transport.on(CatalogEvents.voiceProvider.sync, (_payload, context) => {
        this.assertHostOnly(context, 'catalog.voice-provider.sync')
        return this.syncVoiceProviderCatalog()
      }),
      this.transport.on(CatalogEvents.voiceProvider.rollback, (payload, context) => {
        this.assertHostOnly(context, 'catalog.voice-provider.rollback')
        return this.rollbackVoiceProviderCatalog(payload)
      })
    )
  }

  private assertHostOnly(context: HandlerContext | undefined, eventName: string): void {
    if (!context?.plugin) return
    catalogLog.warn('Blocked plugin caller from host catalog control', {
      meta: { operation: eventName, code: CATALOG_ERROR_CODES.typeUnsupported }
    })
    throw new CatalogContractError(
      CATALOG_ERROR_CODES.typeUnsupported,
      'Catalog control is available only to the host renderer'
    )
  }

  private hasCloudControlSession(): boolean {
    const state = (this.dependencies.getAuthState ?? getSanitizedAuthSessionState)()
    return state.isLoaded && state.isSignedIn && Boolean(state.user?.id?.trim())
  }

  private async checkVoiceProviderUpdates(): Promise<CatalogVoiceProviderCheckResponse> {
    const service = this.getService()
    if (!this.hasCloudControlSession()) {
      return {
        outcome: 'failed',
        status: service.getVoiceProviderStatus(),
        candidate: null,
        errorCode: CATALOG_ERROR_CODES.authenticationRequired
      }
    }
    try {
      const checked = await service.checkUpdates('voice-provider')
      return {
        outcome: checked.status,
        status: service.getVoiceProviderStatus(),
        candidate:
          checked.status === 'update-available' ? manifestDiagnostic(checked.manifest) : null,
        errorCode: null
      }
    } catch {
      const status = service.getVoiceProviderStatus()
      return { outcome: 'failed', status, candidate: null, errorCode: status.lastErrorCode }
    }
  }

  private enqueueVoiceMutation<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.voiceMutationQueue.then(operation, operation)
    this.voiceMutationQueue = task.then(
      () => undefined,
      () => undefined
    )
    return task
  }

  private syncVoiceProviderCatalog(): Promise<CatalogVoiceProviderSyncResponse> {
    if (!this.hasCloudControlSession()) {
      return Promise.resolve({
        outcome: 'failed',
        status: this.getService().getVoiceProviderStatus(),
        activated: null,
        errorCode: CATALOG_ERROR_CODES.authenticationRequired
      })
    }
    if (this.voiceSyncInFlight) return this.voiceSyncInFlight
    const task = this.enqueueVoiceMutation(() => this.performVoiceProviderCatalogSync())
    this.voiceSyncInFlight = task
    void task.then(
      () => {
        if (this.voiceSyncInFlight === task) this.voiceSyncInFlight = null
      },
      () => {
        if (this.voiceSyncInFlight === task) this.voiceSyncInFlight = null
      }
    )
    return task
  }

  private async performVoiceProviderCatalogSync(): Promise<CatalogVoiceProviderSyncResponse> {
    const service = this.getService()
    if (!this.hasCloudControlSession()) {
      return {
        outcome: 'failed',
        status: service.getVoiceProviderStatus(),
        activated: null,
        errorCode: CATALOG_ERROR_CODES.authenticationRequired
      }
    }
    try {
      const checked = await service.checkUpdates('voice-provider')
      if (checked.status === 'no-update') {
        return {
          outcome: 'no-update',
          status: service.getVoiceProviderStatus(),
          activated: null,
          errorCode: null
        }
      }
      const verified = await service.downloadVoiceProviderPack(checked.manifest)
      const stored = await service.importVoiceProviderPack(verified)
      const status = await service.activateVoiceProviderPack(stored)
      return { outcome: 'activated', status, activated: status.active, errorCode: null }
    } catch {
      const status = service.getVoiceProviderStatus()
      return { outcome: 'failed', status, activated: null, errorCode: status.lastErrorCode }
    }
  }

  private rollbackVoiceProviderCatalog(
    request: CatalogVoiceProviderRollbackRequest
  ): Promise<CatalogVoiceProviderRollbackResponse> {
    return this.enqueueVoiceMutation(async () => {
      const service = this.getService()
      try {
        const status = await service.rollbackVoiceProvider(request.reason ?? 'manual')
        return { outcome: 'rolled-back', status, errorCode: null }
      } catch {
        const status = service.getVoiceProviderStatus()
        return { outcome: 'failed', status, errorCode: status.lastErrorCode }
      }
    })
  }

  private publishRegistry(registry: DomainLexiconRegistry): void {
    try {
      const publish =
        this.dependencies.publishRegistry ?? replaceOfficialDomainLexiconRegistryForHost
      publish(registry)
    } catch {
      catalogLog.warn('Catalog registry publication failed', {
        meta: { operation: 'publish', code: CATALOG_ERROR_CODES.activationFailed }
      })
    }
  }
}

function manifestDiagnostic(manifest: CatalogManifestV1) {
  return Object.freeze({
    type: manifest.type,
    packId: manifest.packId,
    version: manifest.version,
    payloadSha256: manifest.payloadSha256,
    source: 'remote' as const,
    signatureStatus: 'verified' as const
  })
}

export function createBuiltinCatalogPack(): BuiltinCatalogPack {
  const entries = Object.freeze(UNIT_LEXICON_ENTRIES.map((entry) => Object.freeze({ ...entry })))
  const pack = {
    contractVersion: 1 as const,
    type: 'domain-lexicon' as const,
    packId: BUILTIN_CATALOG_PACK_ID,
    version: UNIT_LEXICON_VERSION,
    schemaVersion: 1 as const,
    createdAt: BUILTIN_CATALOG_CREATED_AT,
    locales: ['zh-CN', 'en-US'] as const,
    entries: entries.map(stripEntryProvenance)
  }
  const payloadBytes = serializeDomainLexiconCatalogPack(pack)

  return Object.freeze({
    manifest: Object.freeze({
      type: pack.type,
      packId: pack.packId,
      version: pack.version,
      schemaVersion: pack.schemaVersion,
      createdAt: pack.createdAt,
      minSdkapi: CATALOG_CLIENT_SDKAPI,
      locales: pack.locales,
      entryCount: pack.entries.length,
      payloadBytes: payloadBytes.byteLength,
      payloadSha256: createHash('sha256').update(payloadBytes).digest('hex')
    }),
    source: 'builtin' as const,
    signatureStatus: 'builtin' as const,
    entries,
    registry: new DomainLexiconRegistry(entries)
  })
}

export function catalogTrustRootCandidates(environment: CatalogTrustRootEnvironment): string[] {
  const candidates = [
    path.join(environment.appPath, TRUST_ROOT_FILE),
    ...(environment.resourcesPath
      ? [
          path.join(environment.resourcesPath, 'app', TRUST_ROOT_FILE),
          path.join(environment.resourcesPath, TRUST_ROOT_FILE)
        ]
      : []),
    path.join(environment.cwd, TRUST_ROOT_FILE)
  ]
  return [...new Set(candidates)]
}

export function resolveCatalogTrustRootPath(
  environment: CatalogTrustRootEnvironment,
  pathExists: (candidate: string) => boolean = existsSync
): string {
  const resolved = catalogTrustRootCandidates(environment).find(pathExists)
  if (!resolved) {
    throw new CatalogContractError(
      CATALOG_ERROR_CODES.trustRootUnavailable,
      'Catalog trust root is unavailable'
    )
  }
  return resolved
}

export async function loadCatalogTrustRoot(): Promise<Buffer> {
  const trustRootPath = resolveCatalogTrustRootPath({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath || undefined,
    cwd: process.cwd()
  })
  return await readFile(trustRootPath)
}

function stripEntryProvenance(entry: DomainLexiconEntry): DomainLexiconCatalogEntryV1 {
  return {
    id: entry.id,
    domain: entry.domain,
    labels: entry.labels,
    aliases: entry.aliases,
    ...(entry.searchBoost === undefined ? {} : { searchBoost: entry.searchBoost }),
    ...(entry.deprecated === undefined ? {} : { deprecated: entry.deprecated }),
    ...(entry.replacedBy === undefined ? {} : { replacedBy: entry.replacedBy }),
    ...(entry.metadata === undefined ? {} : { metadata: entry.metadata })
  }
}

class UnavailableCatalogRepository implements CatalogRepository {
  async initializeBaseline(_pack: BuiltinCatalogPack): Promise<CatalogRepositorySnapshot> {
    throw unavailable(CATALOG_ERROR_CODES.databaseUnavailable)
  }

  async importVerifiedPack(_pack: VerifiedDomainLexiconPack): Promise<CatalogStoredPack> {
    throw unavailable(CATALOG_ERROR_CODES.databaseUnavailable)
  }

  async activatePack(_ref: CatalogPackRef): Promise<CatalogRepositorySnapshot> {
    throw unavailable(CATALOG_ERROR_CODES.databaseUnavailable)
  }

  async rollback(
    _type: CatalogPackType,
    _reason: CatalogRollbackReason
  ): Promise<CatalogRepositorySnapshot> {
    throw unavailable(CATALOG_ERROR_CODES.databaseUnavailable)
  }

  async getStatus(_type: CatalogPackType): Promise<CatalogRepositoryStatus> {
    throw unavailable(CATALOG_ERROR_CODES.databaseUnavailable)
  }
}

class UnavailableCatalogRemote implements CatalogRemote {
  async fetchLatestManifest(_type: CatalogPackType): Promise<Uint8Array | null> {
    throw unavailable(CATALOG_ERROR_CODES.remoteUnavailable)
  }

  async fetchPack(_manifest: CatalogManifestV1): Promise<Uint8Array> {
    throw unavailable(CATALOG_ERROR_CODES.remoteUnavailable)
  }
}

class UnavailableCatalogVerifier implements CatalogVerifier {
  verifyManifest(_manifestBytes: Uint8Array): CatalogManifestV1 {
    throw unavailable(CATALOG_ERROR_CODES.trustRootUnavailable)
  }

  verifyPack(_manifest: CatalogManifestV1, _payloadBytes: Uint8Array): VerifiedDomainLexiconPack {
    throw unavailable(CATALOG_ERROR_CODES.trustRootUnavailable)
  }
}

function unavailable(
  code: (typeof CATALOG_ERROR_CODES)[keyof typeof CATALOG_ERROR_CODES]
): CatalogContractError {
  return new CatalogContractError(code, 'Catalog dependency is unavailable')
}

function toCatalogLogMeta(context: CatalogLogContext): Record<string, string> {
  const meta: Record<string, string> = { operation: context.operation }
  if (context.code) meta.code = context.code
  if (context.type) meta.type = context.type
  if (context.packId) meta.packId = context.packId
  if (context.version) meta.version = context.version
  return meta
}

const defaultServiceLogger: CatalogServiceLogger = {
  info(message, context) {
    catalogLog.info(message, { meta: toCatalogLogMeta(context) })
  },
  warn(message, context) {
    catalogLog.warn(message, { meta: toCatalogLogMeta(context) })
  }
}

export const catalogModule = new CatalogModule()

export function getCatalogService(): CatalogService {
  return catalogModule.getService()
}
