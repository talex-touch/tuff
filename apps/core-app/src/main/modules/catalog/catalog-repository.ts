import {
  CATALOG_CONTRACT_VERSION,
  CATALOG_ERROR_CODES,
  CATALOG_ROLLBACK_REASONS,
  CatalogContractError,
  DomainLexiconRegistry,
  normalizeCatalogManifest,
  normalizeDomainLexiconCatalogPack,
  type AppLocale,
  type CatalogPackRef,
  type CatalogPackSource,
  type CatalogPackStatus,
  type CatalogPackType,
  type CatalogRollbackReason,
  type CatalogSignatureStatus,
  type DomainLexiconCatalogEntryV1,
  type DomainLexiconEntry
} from '@talex-touch/utils/i18n'
import { and, asc, eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import { catalogDomainLexiconEntries, catalogPacks, catalogState } from '../../db/schema'
import * as schema from '../../db/schema'
import { withSqliteRetry } from '../../db/sqlite-retry'
import type { VerifiedDomainLexiconPack } from './catalog-verifier'

const ENTRY_INSERT_BATCH_SIZE = 200

export type CatalogDatabase = LibSQLDatabase<typeof schema>
type CatalogPackRow = typeof catalogPacks.$inferSelect

export interface CatalogPackMetadata extends CatalogPackRef {
  schemaVersion: 1
  createdAt: string
  minSdkapi: number
  locales: readonly AppLocale[]
  entryCount: number
  payloadBytes: number
  payloadSha256: string
}

export interface BuiltinCatalogPack {
  readonly manifest: CatalogPackMetadata
  readonly source: 'builtin'
  readonly signatureStatus: 'builtin'
  readonly entries: readonly DomainLexiconEntry[]
  readonly registry: DomainLexiconRegistry
}

export interface CatalogStoredPack extends CatalogPackMetadata {
  source: CatalogPackSource
  signatureStatus: CatalogSignatureStatus
  status: CatalogPackStatus
  importedAt: number
  activatedAt: number | null
}

export interface CatalogRepositoryStatus {
  active: CatalogStoredPack | null
  previous: CatalogStoredPack | null
  lastCheckedAt: number | null
  lastUpdatedAt: number | null
  rollbackReason: CatalogRollbackReason | null
}

export interface CatalogRepositorySnapshot extends CatalogRepositoryStatus {
  active: CatalogStoredPack
  registry: DomainLexiconRegistry
}

export interface CatalogRepository {
  initializeBaseline(pack: BuiltinCatalogPack): Promise<CatalogRepositorySnapshot>
  importVerifiedPack(pack: VerifiedDomainLexiconPack): Promise<CatalogStoredPack>
  activatePack(ref: CatalogPackRef): Promise<CatalogRepositorySnapshot>
  rollback(type: CatalogPackType, reason: CatalogRollbackReason): Promise<CatalogRepositorySnapshot>
  getStatus(type: CatalogPackType): Promise<CatalogRepositoryStatus>
}

export interface SqliteCatalogRepositoryOptions {
  now?: () => number
}

interface PreparedPack {
  metadata: CatalogPackMetadata
  source: CatalogPackSource
  signatureStatus: CatalogSignatureStatus
  entries: readonly DomainLexiconEntry[]
  entryRows: Array<typeof catalogDomainLexiconEntries.$inferInsert>
  registry: DomainLexiconRegistry
}

interface StoredCandidate {
  stored: CatalogStoredPack
  registry: DomainLexiconRegistry
}

export class SqliteCatalogRepository implements CatalogRepository {
  private readonly now: () => number

  constructor(
    private readonly db: CatalogDatabase,
    options: SqliteCatalogRepositoryOptions = {}
  ) {
    this.now = options.now ?? Date.now
  }

  async initializeBaseline(pack: BuiltinCatalogPack): Promise<CatalogRepositorySnapshot> {
    const prepared = preparePack(pack)
    try {
      await this.withWrite('catalog.initialize', async () => {
        const now = this.now()
        await this.db.transaction(async (tx) => {
          const [existingPack] = await tx
            .select()
            .from(catalogPacks)
            .where(packIdentity(prepared.metadata))
            .limit(1)
          if (existingPack && existingPack.payloadSha256 !== prepared.metadata.payloadSha256) {
            throw catalogError(
              CATALOG_ERROR_CODES.versionConflict,
              'Catalog pack version conflicts with stored content'
            )
          }

          const [existingState] = await tx
            .select()
            .from(catalogState)
            .where(eq(catalogState.type, prepared.metadata.type))
            .limit(1)

          if (!existingPack) {
            await tx
              .insert(catalogPacks)
              .values(
                packInsertValues(
                  prepared,
                  existingState ? 'ready' : 'active',
                  now,
                  existingState ? null : now
                )
              )
            await insertEntryRows(tx, prepared.entryRows)
          }

          if (!existingState) {
            await tx
              .update(catalogPacks)
              .set({ status: 'active', activatedAt: now })
              .where(packIdentity(prepared.metadata))
            await tx.insert(catalogState).values({
              type: prepared.metadata.type,
              activePackId: prepared.metadata.packId,
              activePackVersion: prepared.metadata.version,
              previousPackId: null,
              previousPackVersion: null,
              lastCheckedAt: null,
              lastUpdatedAt: now,
              rollbackReason: null,
              updatedAt: now
            })
          }
        })
      })
      return await this.loadSnapshot(pack.manifest.type)
    } catch (error) {
      rethrowRepositoryError(
        error,
        CATALOG_ERROR_CODES.databaseUnavailable,
        'Catalog database initialization failed'
      )
    }
  }

  async importVerifiedPack(pack: VerifiedDomainLexiconPack): Promise<CatalogStoredPack> {
    const prepared = preparePack(pack)
    try {
      return await this.withWrite('catalog.import', async () => {
        const now = this.now()
        const row = await this.db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(catalogPacks)
            .where(packIdentity(prepared.metadata))
            .limit(1)
          if (existing) {
            if (existing.payloadSha256 !== prepared.metadata.payloadSha256) {
              throw catalogError(
                CATALOG_ERROR_CODES.versionConflict,
                'Catalog pack version conflicts with stored content'
              )
            }
            return existing
          }

          const values = packInsertValues(prepared, 'ready', now, null)
          await tx.insert(catalogPacks).values(values)
          await insertEntryRows(tx, prepared.entryRows)
          return values as CatalogPackRow
        })
        return toStoredPack(row)
      })
    } catch (error) {
      rethrowRepositoryError(error, CATALOG_ERROR_CODES.importFailed, 'Catalog import failed')
    }
  }

  async activatePack(ref: CatalogPackRef): Promise<CatalogRepositorySnapshot> {
    try {
      return await this.withWrite('catalog.activate', async () => {
        const candidate = await this.loadCandidate(ref)
        const current = await this.getStatusInternal(ref.type)
        if (samePack(current.active, ref)) {
          return { ...current, active: candidate.stored, registry: candidate.registry }
        }

        const now = this.now()
        await this.db.transaction(async (tx) => {
          if (current.previous) {
            await tx
              .update(catalogPacks)
              .set({ status: 'ready' })
              .where(packIdentity(current.previous))
          }
          if (current.active) {
            await tx
              .update(catalogPacks)
              .set({ status: 'previous' })
              .where(packIdentity(current.active))
          }
          await tx
            .update(catalogPacks)
            .set({ status: 'active', activatedAt: now })
            .where(packIdentity(ref))

          if (current.active) {
            await tx
              .update(catalogState)
              .set({
                activePackId: ref.packId,
                activePackVersion: ref.version,
                previousPackId: current.active.packId,
                previousPackVersion: current.active.version,
                lastUpdatedAt: now,
                rollbackReason: null,
                updatedAt: now
              })
              .where(eq(catalogState.type, ref.type))
          } else {
            await tx.insert(catalogState).values({
              type: ref.type,
              activePackId: ref.packId,
              activePackVersion: ref.version,
              previousPackId: null,
              previousPackVersion: null,
              lastCheckedAt: null,
              lastUpdatedAt: now,
              rollbackReason: null,
              updatedAt: now
            })
          }
        })

        return {
          active: { ...candidate.stored, status: 'active', activatedAt: now },
          previous: current.active ? { ...current.active, status: 'previous' } : null,
          lastCheckedAt: current.lastCheckedAt,
          lastUpdatedAt: now,
          rollbackReason: null,
          registry: candidate.registry
        }
      })
    } catch (error) {
      rethrowRepositoryError(
        error,
        CATALOG_ERROR_CODES.activationFailed,
        'Catalog activation failed'
      )
    }
  }

  async rollback(
    type: CatalogPackType,
    reason: CatalogRollbackReason
  ): Promise<CatalogRepositorySnapshot> {
    if (!(CATALOG_ROLLBACK_REASONS as readonly string[]).includes(reason)) {
      throw catalogError(CATALOG_ERROR_CODES.rollbackFailed, 'Catalog rollback reason is invalid')
    }

    try {
      return await this.withWrite('catalog.rollback', async () => {
        const current = await this.getStatusInternal(type)
        if (!current.active || !current.previous) {
          throw catalogError(CATALOG_ERROR_CODES.noPrevious, 'Catalog has no previous pack')
        }
        const candidate = await this.loadCandidate(current.previous)
        const now = this.now()

        await this.db.transaction(async (tx) => {
          await tx
            .update(catalogPacks)
            .set({ status: 'previous' })
            .where(packIdentity(current.active!))
          await tx
            .update(catalogPacks)
            .set({ status: 'active', activatedAt: now })
            .where(packIdentity(current.previous!))
          await tx
            .update(catalogState)
            .set({
              activePackId: current.previous!.packId,
              activePackVersion: current.previous!.version,
              previousPackId: current.active!.packId,
              previousPackVersion: current.active!.version,
              lastUpdatedAt: now,
              rollbackReason: reason,
              updatedAt: now
            })
            .where(eq(catalogState.type, type))
        })

        return {
          active: { ...candidate.stored, status: 'active', activatedAt: now },
          previous: { ...current.active, status: 'previous' },
          lastCheckedAt: current.lastCheckedAt,
          lastUpdatedAt: now,
          rollbackReason: reason,
          registry: candidate.registry
        }
      })
    } catch (error) {
      rethrowRepositoryError(error, CATALOG_ERROR_CODES.rollbackFailed, 'Catalog rollback failed')
    }
  }

  async getStatus(type: CatalogPackType): Promise<CatalogRepositoryStatus> {
    try {
      return await withSqliteRetry(() => this.getStatusInternal(type), {
        label: 'catalog.status'
      })
    } catch (error) {
      rethrowRepositoryError(
        error,
        CATALOG_ERROR_CODES.databaseUnavailable,
        'Catalog status is unavailable'
      )
    }
  }

  private async loadSnapshot(type: CatalogPackType): Promise<CatalogRepositorySnapshot> {
    const status = await this.getStatusInternal(type)
    if (!status.active) {
      throw catalogError(
        CATALOG_ERROR_CODES.activePackInvalid,
        'Catalog active pack is unavailable'
      )
    }
    const candidate = await this.loadCandidate(status.active)
    return { ...status, active: candidate.stored, registry: candidate.registry }
  }

  private async getStatusInternal(type: CatalogPackType): Promise<CatalogRepositoryStatus> {
    const [state] = await this.db
      .select()
      .from(catalogState)
      .where(eq(catalogState.type, type))
      .limit(1)
    if (!state) {
      return {
        active: null,
        previous: null,
        lastCheckedAt: null,
        lastUpdatedAt: null,
        rollbackReason: null
      }
    }

    if ((state.previousPackId === null) !== (state.previousPackVersion === null)) {
      throw catalogError(
        CATALOG_ERROR_CODES.activePackInvalid,
        'Catalog previous pointer is incomplete'
      )
    }

    const active = await this.loadStoredPack({
      type,
      packId: state.activePackId,
      version: state.activePackVersion
    })
    if (!active || active.status !== 'active') {
      throw catalogError(CATALOG_ERROR_CODES.activePackInvalid, 'Catalog active pointer is invalid')
    }

    let previous: CatalogStoredPack | null = null
    if (state.previousPackId && state.previousPackVersion) {
      previous = await this.loadStoredPack({
        type,
        packId: state.previousPackId,
        version: state.previousPackVersion
      })
      if (!previous || previous.status !== 'previous') {
        throw catalogError(
          CATALOG_ERROR_CODES.activePackInvalid,
          'Catalog previous pointer is invalid'
        )
      }
    }

    const rollbackReason = normalizeRollbackReason(state.rollbackReason)
    return {
      active,
      previous,
      lastCheckedAt: normalizeNullableInteger(state.lastCheckedAt),
      lastUpdatedAt: normalizeNullableInteger(state.lastUpdatedAt),
      rollbackReason
    }
  }

  private async loadStoredPack(ref: CatalogPackRef): Promise<CatalogStoredPack | null> {
    const [row] = await this.db.select().from(catalogPacks).where(packIdentity(ref)).limit(1)
    return row ? toStoredPack(row) : null
  }

  private async loadCandidate(ref: CatalogPackRef): Promise<StoredCandidate> {
    const stored = await this.loadStoredPack(ref)
    if (!stored) {
      throw catalogError(CATALOG_ERROR_CODES.packNotFound, 'Catalog pack is unavailable')
    }

    try {
      const rows = await this.db
        .select()
        .from(catalogDomainLexiconEntries)
        .where(
          and(
            eq(catalogDomainLexiconEntries.packType, ref.type),
            eq(catalogDomainLexiconEntries.packId, ref.packId),
            eq(catalogDomainLexiconEntries.packVersion, ref.version)
          )
        )
        .orderBy(asc(catalogDomainLexiconEntries.entryId))
      if (rows.length !== stored.entryCount) {
        throw new Error('Catalog entry count mismatch')
      }

      const pack = normalizeDomainLexiconCatalogPack({
        contractVersion: CATALOG_CONTRACT_VERSION,
        type: stored.type,
        packId: stored.packId,
        version: stored.version,
        schemaVersion: stored.schemaVersion,
        createdAt: stored.createdAt,
        locales: stored.locales,
        entries: rows.map(rowToCatalogEntry)
      })
      const source: DomainLexiconEntry['source'] =
        stored.source === 'builtin' ? 'builtin' : `catalog:${stored.packId}@${stored.version}`
      const entries = Object.freeze(
        pack.entries.map((entry) => Object.freeze({ ...entry, source, version: stored.version }))
      )
      return {
        stored,
        registry: new DomainLexiconRegistry(entries)
      }
    } catch {
      throw catalogError(
        CATALOG_ERROR_CODES.activePackInvalid,
        'Catalog stored entries are invalid'
      )
    }
  }

  private async withWrite<T>(label: string, operation: () => Promise<T>): Promise<T> {
    return dbWriteScheduler.schedule(label, () => withSqliteRetry(operation, { label }))
  }
}

function preparePack(pack: BuiltinCatalogPack | VerifiedDomainLexiconPack): PreparedPack {
  try {
    const metadata = normalizePackMetadata(pack.manifest)
    const expectedSource: DomainLexiconEntry['source'] =
      pack.source === 'builtin' ? 'builtin' : `catalog:${metadata.packId}@${metadata.version}`
    if (
      pack.entries.length !== metadata.entryCount ||
      pack.entries.some(
        (entry) => entry.source !== expectedSource || entry.version !== metadata.version
      )
    ) {
      throw new Error('Catalog pack provenance mismatch')
    }

    const normalized = normalizeDomainLexiconCatalogPack({
      contractVersion: CATALOG_CONTRACT_VERSION,
      type: metadata.type,
      packId: metadata.packId,
      version: metadata.version,
      schemaVersion: metadata.schemaVersion,
      createdAt: metadata.createdAt,
      locales: metadata.locales,
      entries: pack.entries.map(stripEntryProvenance)
    })
    const entries = Object.freeze(
      normalized.entries.map((entry) =>
        Object.freeze({
          ...entry,
          source: expectedSource,
          version: metadata.version
        })
      )
    )
    const registry = new DomainLexiconRegistry(entries)

    return {
      metadata,
      source: pack.source,
      signatureStatus: pack.signatureStatus,
      entries,
      entryRows: entries.map((entry) => ({
        packType: metadata.type,
        packId: metadata.packId,
        packVersion: metadata.version,
        entryId: entry.id,
        domain: entry.domain,
        labelsJson: JSON.stringify(entry.labels),
        aliasesJson: JSON.stringify(entry.aliases),
        searchBoostJson: entry.searchBoost === undefined ? null : JSON.stringify(entry.searchBoost),
        deprecated: entry.deprecated ?? false,
        replacedBy: entry.replacedBy ?? null,
        metadataJson: entry.metadata === undefined ? null : JSON.stringify(entry.metadata)
      })),
      registry
    }
  } catch (error) {
    if (error instanceof CatalogContractError) throw error
    throw catalogError(CATALOG_ERROR_CODES.packInvalid, 'Catalog pack input is invalid')
  }
}

function normalizePackMetadata(
  value: CatalogPackMetadata | VerifiedDomainLexiconPack['manifest']
): CatalogPackMetadata {
  const manifest = normalizeCatalogManifest({
    contractVersion: CATALOG_CONTRACT_VERSION,
    ...value,
    signatureAlgorithm: 'rsa-sha256',
    keyId: 'release-v1',
    signature: 'AA=='
  })
  return Object.freeze({
    type: manifest.type,
    packId: manifest.packId,
    version: manifest.version,
    schemaVersion: manifest.schemaVersion,
    createdAt: manifest.createdAt,
    minSdkapi: manifest.minSdkapi,
    locales: manifest.locales,
    entryCount: manifest.entryCount,
    payloadBytes: manifest.payloadBytes,
    payloadSha256: manifest.payloadSha256
  })
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

function rowToCatalogEntry(
  row: typeof catalogDomainLexiconEntries.$inferSelect
): DomainLexiconCatalogEntryV1 {
  const value: DomainLexiconCatalogEntryV1 = {
    id: row.entryId,
    domain: row.domain as DomainLexiconCatalogEntryV1['domain'],
    labels: parseJson(row.labelsJson) as DomainLexiconCatalogEntryV1['labels'],
    aliases: parseJson(row.aliasesJson) as DomainLexiconCatalogEntryV1['aliases']
  }
  if (row.searchBoostJson !== null) {
    value.searchBoost = parseJson(row.searchBoostJson) as DomainLexiconCatalogEntryV1['searchBoost']
  }
  if (row.deprecated) value.deprecated = true
  if (row.replacedBy !== null) value.replacedBy = row.replacedBy
  if (row.metadataJson !== null) {
    value.metadata = parseJson(row.metadataJson) as DomainLexiconCatalogEntryV1['metadata']
  }
  return value
}

function toStoredPack(row: CatalogPackRow): CatalogStoredPack {
  try {
    if (
      !isPackSource(row.source) ||
      !isSignatureStatus(row.signatureStatus) ||
      !isPackStatus(row.status) ||
      (row.source === 'builtin') !== (row.signatureStatus === 'builtin')
    ) {
      throw new Error('Catalog pack status fields are invalid')
    }
    const metadata = normalizePackMetadata({
      type: row.type,
      packId: row.packId,
      version: row.version,
      schemaVersion: row.schemaVersion as 1,
      createdAt: new Date(row.createdAt).toISOString(),
      minSdkapi: row.minSdkapi,
      locales: parseJson(row.localesJson) as AppLocale[],
      entryCount: row.entryCount,
      payloadBytes: row.payloadBytes,
      payloadSha256: row.payloadSha256
    })
    return Object.freeze({
      ...metadata,
      source: row.source,
      signatureStatus: row.signatureStatus,
      status: row.status,
      importedAt: normalizeInteger(row.importedAt),
      activatedAt: normalizeNullableInteger(row.activatedAt)
    })
  } catch {
    throw catalogError(
      CATALOG_ERROR_CODES.activePackInvalid,
      'Catalog stored pack metadata is invalid'
    )
  }
}

function packInsertValues(
  prepared: PreparedPack,
  status: CatalogPackStatus,
  importedAt: number,
  activatedAt: number | null
): typeof catalogPacks.$inferInsert {
  return {
    type: prepared.metadata.type,
    packId: prepared.metadata.packId,
    version: prepared.metadata.version,
    schemaVersion: prepared.metadata.schemaVersion,
    payloadSha256: prepared.metadata.payloadSha256,
    payloadBytes: prepared.metadata.payloadBytes,
    entryCount: prepared.metadata.entryCount,
    localesJson: JSON.stringify(prepared.metadata.locales),
    minSdkapi: prepared.metadata.minSdkapi,
    source: prepared.source,
    signatureStatus: prepared.signatureStatus,
    status,
    createdAt: Date.parse(prepared.metadata.createdAt),
    importedAt,
    activatedAt
  }
}

async function insertEntryRows(
  tx: Parameters<Parameters<CatalogDatabase['transaction']>[0]>[0],
  rows: PreparedPack['entryRows']
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += ENTRY_INSERT_BATCH_SIZE) {
    await tx
      .insert(catalogDomainLexiconEntries)
      .values(rows.slice(offset, offset + ENTRY_INSERT_BATCH_SIZE))
  }
}

function packIdentity(ref: CatalogPackRef) {
  return and(
    eq(catalogPacks.type, ref.type),
    eq(catalogPacks.packId, ref.packId),
    eq(catalogPacks.version, ref.version)
  )
}

function samePack(stored: CatalogStoredPack | null, ref: CatalogPackRef): boolean {
  return Boolean(
    stored &&
    stored.type === ref.type &&
    stored.packId === ref.packId &&
    stored.version === ref.version
  )
}

function normalizeRollbackReason(value: string | null): CatalogRollbackReason | null {
  if (value === null) return null
  if ((CATALOG_ROLLBACK_REASONS as readonly string[]).includes(value)) {
    return value as CatalogRollbackReason
  }
  throw catalogError(CATALOG_ERROR_CODES.activePackInvalid, 'Catalog rollback reason is invalid')
}

function normalizeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Catalog integer field is invalid')
  }
  return value
}

function normalizeNullableInteger(value: number | null): number | null {
  return value === null ? null : normalizeInteger(value)
}

function isPackSource(value: string): value is CatalogPackSource {
  return value === 'builtin' || value === 'remote'
}

function isSignatureStatus(value: string): value is CatalogSignatureStatus {
  return value === 'builtin' || value === 'verified'
}

function isPackStatus(value: string): value is CatalogPackStatus {
  return value === 'ready' || value === 'active' || value === 'previous'
}

function parseJson(value: string): unknown {
  return JSON.parse(value)
}

function catalogError(
  code: (typeof CATALOG_ERROR_CODES)[keyof typeof CATALOG_ERROR_CODES],
  message: string
): CatalogContractError {
  return new CatalogContractError(code, message)
}

function rethrowRepositoryError(
  error: unknown,
  fallbackCode: (typeof CATALOG_ERROR_CODES)[keyof typeof CATALOG_ERROR_CODES],
  fallbackMessage: string
): never {
  if (error instanceof CatalogContractError) throw error
  throw catalogError(fallbackCode, fallbackMessage)
}
