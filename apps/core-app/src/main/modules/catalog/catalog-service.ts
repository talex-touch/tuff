import {
  CATALOG_ERROR_CODES,
  CatalogContractError,
  type CatalogErrorCode,
  type CatalogManifestV1,
  type CatalogPackDiagnostic,
  type CatalogPackRef,
  type CatalogPackType,
  type CatalogRollbackReason,
  type CatalogStatus,
  type DomainLexiconRegistry,
  type VoiceProviderRegistry
} from '@talex-touch/utils/i18n'
import type {
  BuiltinCatalogPack,
  CatalogRepository,
  CatalogRepositorySnapshot,
  CatalogStoredPack,
  VoiceProviderCatalogRepository,
  VoiceProviderCatalogSnapshot
} from './catalog-repository'
import type { CatalogRemote, VoiceProviderCatalogRemote } from './catalog-remote'
import type {
  CatalogVerifier,
  VerifiedDomainLexiconPack,
  VerifiedVoiceProviderPack,
  VoiceProviderCatalogVerifier
} from './catalog-verifier'

export type CatalogUpdateCheckResult =
  | { status: 'no-update'; type: CatalogPackType }
  | { status: 'update-available'; manifest: CatalogManifestV1 }

export interface CatalogService {
  initialize(): Promise<CatalogStatus>
  getActiveRegistry(): DomainLexiconRegistry
  getStatus(): CatalogStatus
  checkUpdates(type?: CatalogPackType): Promise<CatalogUpdateCheckResult>
  downloadPack(manifest: CatalogManifestV1): Promise<VerifiedDomainLexiconPack>
  importPack(pack: VerifiedDomainLexiconPack): Promise<CatalogStoredPack>
  activatePack(ref: CatalogPackRef): Promise<CatalogStatus>
  rollback(type: CatalogPackType, reason: CatalogRollbackReason): Promise<CatalogStatus>
  /** Read-only active voice-provider facade; null until a voice pack activates. */
  getVoiceProviderRegistry(): VoiceProviderRegistry | null
  getVoiceProviderStatus(): CatalogStatus
  downloadVoiceProviderPack(manifest: CatalogManifestV1): Promise<VerifiedVoiceProviderPack>
  importVoiceProviderPack(pack: VerifiedVoiceProviderPack): Promise<CatalogStoredPack>
  activateVoiceProviderPack(ref: CatalogPackRef): Promise<CatalogStatus>
  rollbackVoiceProvider(reason: CatalogRollbackReason): Promise<CatalogStatus>
}

export interface CatalogLogContext {
  operation: string
  code?: CatalogErrorCode
  type?: CatalogPackType
  packId?: string
  version?: string
}

export interface CatalogServiceLogger {
  info(message: string, context: CatalogLogContext): void
  warn(message: string, context: CatalogLogContext): void
}

export interface CatalogServiceDependencies {
  repository: CatalogRepository
  remote: CatalogRemote
  verifier: CatalogVerifier
  baseline: BuiltinCatalogPack
  voiceRepository?: VoiceProviderCatalogRepository
  voiceVerifier?: VoiceProviderCatalogVerifier
  voiceRemote?: VoiceProviderCatalogRemote
  clock?: () => number
  logger?: CatalogServiceLogger
}

const silentLogger: CatalogServiceLogger = {
  info: () => undefined,
  warn: () => undefined
}

export class DefaultCatalogService implements CatalogService {
  private readonly repository: CatalogRepository
  private readonly remote: CatalogRemote
  private readonly verifier: CatalogVerifier
  private readonly baseline: BuiltinCatalogPack
  private readonly voiceRepository: VoiceProviderCatalogRepository | null
  private readonly voiceVerifier: VoiceProviderCatalogVerifier | null
  private readonly voiceRemote: VoiceProviderCatalogRemote | null
  private readonly clock: () => number
  private readonly logger: CatalogServiceLogger
  private activeRegistry: DomainLexiconRegistry
  private status: CatalogStatus
  private voiceRegistry: VoiceProviderRegistry | null = null
  private voiceStatus: CatalogStatus

  constructor(dependencies: CatalogServiceDependencies) {
    this.repository = dependencies.repository
    this.remote = dependencies.remote
    this.verifier = dependencies.verifier
    this.baseline = dependencies.baseline
    this.voiceRepository = dependencies.voiceRepository ?? null
    this.voiceVerifier = dependencies.voiceVerifier ?? null
    this.voiceRemote = dependencies.voiceRemote ?? null
    this.clock = dependencies.clock ?? Date.now
    this.logger = dependencies.logger ?? silentLogger
    this.activeRegistry = dependencies.baseline.registry
    this.status = freezeStatus({
      databaseAvailable: false,
      registrySource: 'builtin-fallback',
      active: diagnosticFromBaseline(dependencies.baseline),
      previous: null,
      lastCheckedAt: null,
      lastUpdatedAt: null,
      rollbackReason: null,
      lastErrorCode: null
    })
    this.voiceStatus = freezeStatus({
      databaseAvailable: false,
      registrySource: 'builtin-fallback',
      active: null,
      previous: null,
      lastCheckedAt: null,
      lastUpdatedAt: null,
      rollbackReason: null,
      lastErrorCode: null
    })
  }

  async initialize(): Promise<CatalogStatus> {
    try {
      const snapshot = await this.repository.initializeBaseline(this.baseline)
      this.publishSnapshot(snapshot)
      this.logger.info('Catalog initialized', {
        operation: 'initialize',
        type: snapshot.active.type,
        packId: snapshot.active.packId,
        version: snapshot.active.version
      })
      await this.initializeVoiceProvider()
    } catch (error) {
      const failure = normalizeFailure(
        error,
        CATALOG_ERROR_CODES.databaseUnavailable,
        'Catalog database initialization failed'
      )
      this.activeRegistry = this.baseline.registry
      this.status = freezeStatus({
        databaseAvailable: false,
        registrySource: 'builtin-fallback',
        active: diagnosticFromBaseline(this.baseline),
        previous: null,
        lastCheckedAt: this.status.lastCheckedAt,
        lastUpdatedAt: null,
        rollbackReason: null,
        lastErrorCode: failure.code
      })
      this.logFailure('initialize', failure)
    }
    return this.status
  }

  getActiveRegistry(): DomainLexiconRegistry {
    return this.activeRegistry
  }

  getStatus(): CatalogStatus {
    return this.status
  }

  async checkUpdates(type: CatalogPackType = 'domain-lexicon'): Promise<CatalogUpdateCheckResult> {
    this.markChecked(type)
    try {
      const manifestBytes = await this.remote.fetchLatestManifest(type)
      if (manifestBytes === null) {
        this.clearErrorFor(type)
        return { status: 'no-update', type }
      }

      const manifest = this.verifier.verifyManifest(manifestBytes)
      if (manifest.type !== type) {
        throw new CatalogContractError(
          CATALOG_ERROR_CODES.typeUnsupported,
          'Catalog manifest type does not match the requested catalog'
        )
      }
      if (type === 'voice-provider' && !manifest.payloadEncryption) {
        throw new CatalogContractError(
          CATALOG_ERROR_CODES.payloadEncryptionRequired,
          'Voice provider catalog payload must be encrypted'
        )
      }
      const active = this.activeDiagnosticFor(type)
      if (
        active &&
        active.type === manifest.type &&
        active.packId === manifest.packId &&
        active.version === manifest.version
      ) {
        if (active.payloadSha256 !== manifest.payloadSha256) {
          throw new CatalogContractError(
            CATALOG_ERROR_CODES.versionConflict,
            'Catalog version conflicts with active content'
          )
        }
        this.clearErrorFor(type)
        return { status: 'no-update', type }
      }

      this.clearErrorFor(type)
      return { status: 'update-available', manifest }
    } catch (error) {
      const failure = normalizeFailure(
        error,
        CATALOG_ERROR_CODES.remoteUnavailable,
        'Catalog update check failed'
      )
      this.recordFailureFor(type, 'check-updates', failure, { type })
      throw failure
    }
  }

  async downloadPack(manifest: CatalogManifestV1): Promise<VerifiedDomainLexiconPack> {
    try {
      const payloadBytes = await this.remote.fetchPack(manifest)
      const verified = this.verifier.verifyPack(manifest, payloadBytes)
      this.clearError()
      return verified
    } catch (error) {
      const failure = normalizeFailure(
        error,
        CATALOG_ERROR_CODES.remoteUnavailable,
        'Catalog download failed'
      )
      this.recordFailure('download', failure, manifest)
      throw failure
    }
  }

  async importPack(pack: VerifiedDomainLexiconPack): Promise<CatalogStoredPack> {
    try {
      const stored = await this.repository.importVerifiedPack(pack)
      this.status = freezeStatus({
        ...this.status,
        databaseAvailable: true,
        lastErrorCode: null
      })
      return stored
    } catch (error) {
      const failure = normalizeFailure(
        error,
        CATALOG_ERROR_CODES.importFailed,
        'Catalog import failed'
      )
      this.recordFailure('import', failure, pack.manifest)
      throw failure
    }
  }

  async activatePack(ref: CatalogPackRef): Promise<CatalogStatus> {
    try {
      const snapshot = await this.repository.activatePack(ref)
      this.publishSnapshot(snapshot)
      return this.status
    } catch (error) {
      const failure = normalizeFailure(
        error,
        CATALOG_ERROR_CODES.activationFailed,
        'Catalog activation failed'
      )
      this.recordFailure('activate', failure, ref)
      throw failure
    }
  }

  async rollback(type: CatalogPackType, reason: CatalogRollbackReason): Promise<CatalogStatus> {
    try {
      const snapshot = await this.repository.rollback(type, reason)
      this.publishSnapshot(snapshot)
      return this.status
    } catch (error) {
      const failure = normalizeFailure(
        error,
        CATALOG_ERROR_CODES.rollbackFailed,
        'Catalog rollback failed'
      )
      this.recordFailure('rollback', failure, { type })
      throw failure
    }
  }

  getVoiceProviderRegistry(): VoiceProviderRegistry | null {
    return this.voiceRegistry
  }

  getVoiceProviderStatus(): CatalogStatus {
    return this.voiceStatus
  }

  async downloadVoiceProviderPack(manifest: CatalogManifestV1): Promise<VerifiedVoiceProviderPack> {
    let keyBytes: Uint8Array | null = null
    try {
      const verifier = this.requireVoiceVerifier()
      const voiceRemote = this.requireVoiceRemote()
      const payloadBytes = await this.remote.fetchPack(manifest)
      const keyMaterial = await voiceRemote.fetchVoiceProviderPayloadKey(manifest)
      if (keyMaterial.keyId !== manifest.payloadEncryption?.keyId) {
        keyMaterial.keyBytes.fill(0)
        throw new CatalogContractError(
          CATALOG_ERROR_CODES.payloadKeyUnavailable,
          'Catalog payload key identity does not match the manifest'
        )
      }
      keyBytes = keyMaterial.keyBytes
      const verified = verifier.verifyVoiceProviderPack(manifest, payloadBytes, keyBytes)
      this.clearVoiceError()
      return verified
    } catch (error) {
      const failure = normalizeFailure(
        error,
        CATALOG_ERROR_CODES.remoteUnavailable,
        'Catalog download failed'
      )
      this.recordVoiceFailure('download', failure, manifest)
      throw failure
    } finally {
      keyBytes?.fill(0)
    }
  }

  async importVoiceProviderPack(pack: VerifiedVoiceProviderPack): Promise<CatalogStoredPack> {
    const repository = this.requireVoiceRepository()
    try {
      const stored = await repository.importVoiceProviderPack(pack)
      this.voiceStatus = freezeStatus({
        ...this.voiceStatus,
        databaseAvailable: true,
        lastErrorCode: null
      })
      return stored
    } catch (error) {
      const failure = normalizeFailure(
        error,
        CATALOG_ERROR_CODES.importFailed,
        'Catalog import failed'
      )
      this.recordVoiceFailure('import', failure, pack.manifest)
      throw failure
    }
  }

  async activateVoiceProviderPack(ref: CatalogPackRef): Promise<CatalogStatus> {
    const repository = this.requireVoiceRepository()
    try {
      const snapshot = await repository.activateVoiceProviderPack(ref)
      this.publishVoiceSnapshot(snapshot)
      return this.voiceStatus
    } catch (error) {
      const failure = normalizeFailure(
        error,
        CATALOG_ERROR_CODES.activationFailed,
        'Catalog activation failed'
      )
      this.recordVoiceFailure('activate', failure, ref)
      throw failure
    }
  }

  async rollbackVoiceProvider(reason: CatalogRollbackReason): Promise<CatalogStatus> {
    const repository = this.requireVoiceRepository()
    try {
      const snapshot = await repository.rollbackVoiceProvider(reason)
      this.publishVoiceSnapshot(snapshot)
      return this.voiceStatus
    } catch (error) {
      const failure = normalizeFailure(
        error,
        CATALOG_ERROR_CODES.rollbackFailed,
        'Catalog rollback failed'
      )
      this.recordVoiceFailure('rollback', failure, { type: 'voice-provider' })
      throw failure
    }
  }

  private async initializeVoiceProvider(): Promise<void> {
    if (!this.voiceRepository) return
    try {
      const snapshot = await this.voiceRepository.loadVoiceProviderSnapshot()
      if (!snapshot) return
      this.publishVoiceSnapshot(snapshot)
    } catch (error) {
      const failure = normalizeFailure(
        error,
        CATALOG_ERROR_CODES.databaseUnavailable,
        'Catalog voice provider initialization failed'
      )
      this.voiceStatus = freezeStatus({ ...this.voiceStatus, lastErrorCode: failure.code })
      this.logFailure('initialize', failure, { type: 'voice-provider' })
    }
  }

  private requireVoiceRepository(): VoiceProviderCatalogRepository {
    if (!this.voiceRepository) {
      throw new CatalogContractError(
        CATALOG_ERROR_CODES.databaseUnavailable,
        'Catalog voice provider repository is unavailable'
      )
    }
    return this.voiceRepository
  }

  private requireVoiceVerifier(): VoiceProviderCatalogVerifier {
    if (!this.voiceVerifier) {
      throw new CatalogContractError(
        CATALOG_ERROR_CODES.trustRootUnavailable,
        'Catalog voice provider verifier is unavailable'
      )
    }
    return this.voiceVerifier
  }

  private requireVoiceRemote(): VoiceProviderCatalogRemote {
    if (!this.voiceRemote) {
      throw new CatalogContractError(
        CATALOG_ERROR_CODES.payloadKeyUnavailable,
        'Catalog voice provider payload key remote is unavailable'
      )
    }
    return this.voiceRemote
  }

  private activeDiagnosticFor(type: CatalogPackType): CatalogPackDiagnostic | null {
    return type === 'domain-lexicon' ? this.status.active : this.voiceStatus.active
  }

  private markChecked(type: CatalogPackType): void {
    const lastCheckedAt = this.clock()
    if (type === 'domain-lexicon') {
      this.status = freezeStatus({ ...this.status, lastCheckedAt })
      return
    }
    this.voiceStatus = freezeStatus({ ...this.voiceStatus, lastCheckedAt })
  }

  private clearErrorFor(type: CatalogPackType): void {
    if (type === 'domain-lexicon') {
      this.clearError()
      return
    }
    this.clearVoiceError()
  }

  private recordFailureFor(
    type: CatalogPackType,
    operation: string,
    failure: CatalogContractError,
    identity: Partial<CatalogPackRef>
  ): void {
    if (type === 'domain-lexicon') {
      this.recordFailure(operation, failure, identity)
      return
    }
    this.recordVoiceFailure(operation, failure, identity)
  }

  private clearVoiceError(): void {
    if (this.voiceStatus.lastErrorCode === null) return
    this.voiceStatus = freezeStatus({ ...this.voiceStatus, lastErrorCode: null })
  }

  private recordVoiceFailure(
    operation: string,
    failure: CatalogContractError,
    identity: Partial<CatalogPackRef>
  ): void {
    this.voiceStatus = freezeStatus({ ...this.voiceStatus, lastErrorCode: failure.code })
    this.logFailure(operation, failure, identity)
  }

  private publishVoiceSnapshot(snapshot: VoiceProviderCatalogSnapshot): void {
    this.voiceRegistry = snapshot.registry
    this.voiceStatus = freezeStatus({
      databaseAvailable: true,
      registrySource: 'sqlite',
      active: diagnosticFromStored(snapshot.active),
      previous: snapshot.previous ? diagnosticFromStored(snapshot.previous) : null,
      lastCheckedAt: this.voiceStatus.lastCheckedAt ?? snapshot.lastCheckedAt,
      lastUpdatedAt: snapshot.lastUpdatedAt,
      rollbackReason: snapshot.rollbackReason,
      lastErrorCode: null
    })
  }

  private publishSnapshot(snapshot: CatalogRepositorySnapshot): void {
    this.activeRegistry = snapshot.registry
    this.status = freezeStatus({
      databaseAvailable: true,
      registrySource: 'sqlite',
      active: diagnosticFromStored(snapshot.active),
      previous: snapshot.previous ? diagnosticFromStored(snapshot.previous) : null,
      lastCheckedAt: this.status.lastCheckedAt ?? snapshot.lastCheckedAt,
      lastUpdatedAt: snapshot.lastUpdatedAt,
      rollbackReason: snapshot.rollbackReason,
      lastErrorCode: null
    })
  }

  private clearError(): void {
    if (this.status.lastErrorCode === null) return
    this.status = freezeStatus({ ...this.status, lastErrorCode: null })
  }

  private recordFailure(
    operation: string,
    failure: CatalogContractError,
    identity: Partial<CatalogPackRef>
  ): void {
    this.status = freezeStatus({ ...this.status, lastErrorCode: failure.code })
    this.logFailure(operation, failure, identity)
  }

  private logFailure(
    operation: string,
    failure: CatalogContractError,
    identity: Partial<CatalogPackRef> = {}
  ): void {
    this.logger.warn('Catalog operation failed', {
      operation,
      code: failure.code,
      type: identity.type,
      packId: identity.packId,
      version: identity.version
    })
  }
}

function diagnosticFromBaseline(pack: BuiltinCatalogPack): CatalogPackDiagnostic {
  return Object.freeze({
    type: pack.manifest.type,
    packId: pack.manifest.packId,
    version: pack.manifest.version,
    payloadSha256: pack.manifest.payloadSha256,
    source: pack.source,
    signatureStatus: pack.signatureStatus
  })
}

function diagnosticFromStored(pack: CatalogStoredPack): CatalogPackDiagnostic {
  return Object.freeze({
    type: pack.type,
    packId: pack.packId,
    version: pack.version,
    payloadSha256: pack.payloadSha256,
    source: pack.source,
    signatureStatus: pack.signatureStatus
  })
}

function freezeStatus(status: CatalogStatus): CatalogStatus {
  return Object.freeze({ ...status })
}

function normalizeFailure(
  error: unknown,
  fallbackCode: CatalogErrorCode,
  message: string
): CatalogContractError {
  if (error instanceof CatalogContractError) return error
  return new CatalogContractError(fallbackCode, message)
}
