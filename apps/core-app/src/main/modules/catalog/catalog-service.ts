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
  type DomainLexiconRegistry
} from '@talex-touch/utils/i18n'
import type {
  BuiltinCatalogPack,
  CatalogRepository,
  CatalogRepositorySnapshot,
  CatalogStoredPack
} from './catalog-repository'
import type { CatalogRemote } from './catalog-remote'
import type { CatalogVerifier, VerifiedDomainLexiconPack } from './catalog-verifier'

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
  private readonly clock: () => number
  private readonly logger: CatalogServiceLogger
  private activeRegistry: DomainLexiconRegistry
  private status: CatalogStatus

  constructor(dependencies: CatalogServiceDependencies) {
    this.repository = dependencies.repository
    this.remote = dependencies.remote
    this.verifier = dependencies.verifier
    this.baseline = dependencies.baseline
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
    this.status = freezeStatus({ ...this.status, lastCheckedAt: this.clock() })
    try {
      const manifestBytes = await this.remote.fetchLatestManifest(type)
      if (manifestBytes === null) {
        this.clearError()
        return { status: 'no-update', type }
      }

      const manifest = this.verifier.verifyManifest(manifestBytes)
      const active = this.status.active
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
        this.clearError()
        return { status: 'no-update', type }
      }

      this.clearError()
      return { status: 'update-available', manifest }
    } catch (error) {
      const failure = normalizeFailure(
        error,
        CATALOG_ERROR_CODES.remoteUnavailable,
        'Catalog update check failed'
      )
      this.recordFailure('check-updates', failure, { type })
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
