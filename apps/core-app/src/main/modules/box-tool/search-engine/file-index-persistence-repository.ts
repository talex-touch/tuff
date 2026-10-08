import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { SearchIndexService } from './search-index-service'
import type { SearchIndexWriteTx } from './search-index-document-store'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import * as schema from '../../../db/schema'
import { withSqliteRetry } from '../../../db/sqlite-retry'
import {
  normalizeScanProgressSourceId,
  resolveScanProgressSchemaShape,
  SCAN_PROGRESS_UPSERT_CHUNK_ROWS,
  upsertSourceScopedScanProgress
} from './scan-progress-schema'
import { normalizeScanProgressUpsert } from './workers/search-index-worker-scan-progress'

const PERSIST_CHUNK_SIZE = 3
const PERSIST_CHUNK_YIELD_MS = 30

export const FILE_INDEX_METADATA_UPDATE_MAX_BATCH = 100
export const FILE_INDEX_METADATA_INVALID_CODE = 'FILE_INDEX_METADATA_INVALID'
export const FILE_INDEX_DELETE_MAX_BATCH = 64
export const FILE_INDEX_DELETE_INVALID_CODE = 'FILE_INDEX_DELETE_INVALID'

export const FILE_INDEX_PERSISTENCE_RETRY_LABELS = {
  persistChunk: 'search-index.worker.persistChunk',
  upsertFiles: 'search-index.worker.upsertFiles',
  upsertScanProgress: 'search-index.worker.upsertScanProgress',
  removeFileRecords: 'search-index.worker.removeFileRecords',
  removeMissingFileSearchRecords: 'search-index.worker.removeMissingFileSearchRecords',
  listPendingFileDeletionCommits: 'search-index.worker.listPendingFileDeletionCommits',
  acknowledgeFileDeletionCommits: 'search-index.worker.acknowledgeFileDeletionCommits',
  removeFileExtensions: 'search-index.worker.removeFileExtensions',
  updateFileMetadata: 'search-index.worker.updateFileMetadata'
} as const

export interface FilePersistenceEntry {
  fileId: number
  /**
   * File mtime (ms) the worker produced this entry for. When it no longer
   * matches `files.mtime`, a newer version already owns the row and this entry
   * is skipped (never overwrites newer content or progress).
   */
  fileVersion?: number | null
  /** File size at scheduling time; second half of the version fingerprint. */
  fileSize?: number | null
  fileUpdate: {
    content: string | null
    embeddingStatus: string
    embeddings?: Array<{ vector: number[]; model: string }>
    contentHash: string | null
  } | null
  progress: {
    status: string
    progress: number
    processedBytes: number | null
    totalBytes: number | null
    lastError: string | null
    startedAt: string | null
    updatedAt: string | null
  }
}

export interface PersistEntriesSummary {
  entries: number
  chunks: number
  persistedRows: number
  fileUpdates: number
  progressRows: number
  embeddings: number
  /** File rows deleted before their asynchronous enrichment result reached SQLite. */
  staleFileIds?: number[]
  /** Entries skipped because a newer file version already owns the row. */
  supersededFileIds?: number[]
}

export interface UpsertFileRecord {
  path: string
  name: string
  extension?: string | null
  size?: number | null
  mtime: Date | number | string
  ctime: Date | number | string
  lastIndexedAt: Date | number | string
  isDir: boolean
  type: string
}

/**
 * Bounded metadata update for an existing `files` row, located strictly by
 * `files.id`. Never carries `path`: missing ids are skipped and rows are never
 * resurrected through a path upsert.
 */
export interface FileMetadataUpdateRecord {
  id: number
  name: string
  extension: string | null
  size: number | null
  mtime: Date | number | string
  ctime: Date | number | string
  lastIndexedAt: Date | number | string
  isDir: boolean
  type: string
}

export interface FileMetadataUpdateSummary {
  requested: number
  updated: number
  missingFileIds: number[]
}

/** File timestamps use the integer-second representation stored by SQLite. */
export interface ExpectedFileRecord {
  id: number
  path: string
  mtime: number
  ctime: number
  size: number | null
  lastIndexedAt: number
  itemId: string
  legacyItemIds?: readonly string[]
}

export interface ExpectedMissingFileSearchRecord {
  itemId: string
  path: string
  ftsRowid: number | null
  documentHash: string | null
  /** Integer seconds from search_index_meta.updated_at. */
  updatedAt: number
}

export interface FileRecordRemovalOptions {
  maintenance?: boolean
  signal?: AbortSignal
  /** Rechecked in the main-side execution callback; never serialized to a worker. */
  isStillCurrent?: () => boolean
}

/** Durable publication intent, committed atomically with the corresponding deletion. */
export interface FileDeletionCommitReceipt {
  commitId: string
  sourceId: string
  deletedRecords: Array<ExpectedFileRecord | ExpectedMissingFileSearchRecord>
  removedIndexedItems: number
}

export interface RemoveFileRecordsResult {
  deletedRecords: ExpectedFileRecord[]
  removedIndexedItems: number
  commitId: string | null
  /** No transaction ran; the producer must release its lease before waiting again. */
  deferred: boolean
}

export interface RemoveMissingFileSearchRecordsResult {
  deletedRecords: ExpectedMissingFileSearchRecord[]
  removedIndexedItems: number
  commitId: string | null
  deferred: boolean
}

export interface ListPendingFileDeletionCommitsResult {
  commits: FileDeletionCommitReceipt[]
  deferred: boolean
}

export interface AcknowledgeFileDeletionCommitsResult {
  acknowledged: number
  deferred: boolean
}

export interface FileIndexPersistenceRepository {
  persistEntries(entries: FilePersistenceEntry[]): Promise<PersistEntriesSummary>
  upsertFiles(records: UpsertFileRecord[]): Promise<Array<Record<string, unknown>>>
  updateFileMetadata(records: FileMetadataUpdateRecord[]): Promise<FileMetadataUpdateSummary>
  upsertScanProgress(paths: string[], lastScanned: string, sourceId?: string): Promise<number>
  removeFileExtensions(fileId: number, keys: string[]): Promise<void>
}

interface PersistChunkSummary {
  persistedRows: number
  fileUpdates: number
  progressRows: number
  embeddings: number
  staleFileIds: number[]
  supersededFileIds: number[]
}

export function withFileIndexPersistenceRetry<T>(
  operation: () => Promise<T>,
  label: string,
  client?: Pick<Client, 'reconnect'>
): Promise<T> {
  return withSqliteRetry(operation, {
    label,
    // @libsql/client#352: a native statement that fails SQLITE_BUSY stays active until GC.
    // Reconnect this writer-owned file client before retrying so the poisoned connection cannot
    // make every later transaction fail at COMMIT with "SQL statements in progress".
    onBusy: client ? () => client.reconnect() : undefined
  })
}

export class SqliteFileIndexPersistenceRepository implements FileIndexPersistenceRepository {
  private readonly client: Client

  constructor(private readonly db: LibSQLDatabase<typeof schema>) {
    const client = (db as LibSQLDatabase<typeof schema> & { $client?: Client }).$client
    if (!client) throw new Error('LIBSQL_CLIENT_UNAVAILABLE')
    this.client = client
  }

  private withRetry<T>(operation: () => Promise<T>, label: string): Promise<T> {
    return withFileIndexPersistenceRetry(operation, label, this.client)
  }

  async persistEntries(entries: FilePersistenceEntry[]): Promise<PersistEntriesSummary> {
    const summary: PersistEntriesSummary = {
      entries: entries.length,
      chunks: 0,
      persistedRows: 0,
      fileUpdates: 0,
      progressRows: 0,
      embeddings: 0,
      staleFileIds: [],
      supersededFileIds: []
    }

    for (let offset = 0; offset < entries.length; offset += PERSIST_CHUNK_SIZE) {
      const chunk = entries.slice(offset, offset + PERSIST_CHUNK_SIZE)
      const chunkSummary = await this.persistChunk(chunk)
      summary.chunks += 1
      summary.persistedRows += chunkSummary.persistedRows
      summary.fileUpdates += chunkSummary.fileUpdates
      summary.progressRows += chunkSummary.progressRows
      summary.embeddings += chunkSummary.embeddings
      summary.staleFileIds?.push(...chunkSummary.staleFileIds)
      summary.supersededFileIds?.push(...chunkSummary.supersededFileIds)

      if (offset + PERSIST_CHUNK_SIZE < entries.length) {
        await new Promise<void>((resolve) => setTimeout(resolve, PERSIST_CHUNK_YIELD_MS))
      }
    }

    return summary
  }

  async upsertFiles(records: UpsertFileRecord[]): Promise<Array<Record<string, unknown>>> {
    if (records.length === 0) return []

    return await this.withRetry(
      () =>
        this.db.transaction(async (tx) => await this.upsertFilesInTransaction(tx, records), {
          behavior: 'immediate'
        }),
      FILE_INDEX_PERSISTENCE_RETRY_LABELS.upsertFiles
    )
  }

  async upsertFilesInTransaction(
    tx: Pick<LibSQLDatabase<typeof schema>, 'insert' | 'update'>,
    records: readonly UpsertFileRecord[]
  ): Promise<Array<Record<string, unknown>>> {
    if (records.length === 0) return []
    const rows = await tx
      .insert(schema.files)
      .values(
        records.map((record) => ({
          path: record.path,
          name: record.name,
          extension: record.extension ?? null,
          size: typeof record.size === 'number' ? record.size : null,
          mtime: toDate(record.mtime),
          ctime: toDate(record.ctime),
          lastIndexedAt: toDate(record.lastIndexedAt),
          isDir: record.isDir,
          type: record.type
        }))
      )
      .onConflictDoUpdate({
        target: schema.files.path,
        set: {
          name: sql`excluded.name`,
          extension: sql`excluded.extension`,
          size: sql`excluded.size`,
          mtime: sql`excluded.mtime`,
          ctime: sql`excluded.ctime`,
          lastIndexedAt: sql`excluded.last_indexed_at`,
          isDir: sql`excluded.is_dir`,
          type: sql`excluded.type`
        }
      })
      .returning()
    await this.markPendingInTransaction(
      tx,
      rows.filter((row) => row.type === 'file').map((row) => row.id)
    )
    return rows as Array<Record<string, unknown>>
  }

  private async markPendingInTransaction(
    tx: Pick<LibSQLDatabase<typeof schema>, 'update'>,
    fileIds: number[]
  ): Promise<void> {
    if (fileIds.length === 0) return
    // A restart between metadata commit and scheduler admission must still see
    // the changed file as dirty. Missing progress rows remain recoverable by IS NULL.
    await tx
      .update(schema.fileIndexProgress)
      .set({ status: 'pending', progress: 0, lastError: null, updatedAt: new Date() })
      .where(
        and(
          inArray(schema.fileIndexProgress.fileId, fileIds),
          ne(schema.fileIndexProgress.status, 'pending')
        )
      )
  }

  async updateFileMetadata(
    records: FileMetadataUpdateRecord[]
  ): Promise<FileMetadataUpdateSummary> {
    const summary: FileMetadataUpdateSummary = {
      requested: records.length,
      updated: 0,
      missingFileIds: []
    }
    if (records.length === 0) return summary
    if (records.length > FILE_INDEX_METADATA_UPDATE_MAX_BATCH) {
      throw metadataInvalidError(`batch-size-exceeds-${FILE_INDEX_METADATA_UPDATE_MAX_BATCH}`)
    }

    // Validate the full batch before any SQL so a hostile or malformed record
    // can never produce a partial write or leak a native bind error message.
    const validated = records.map((record) => normalizeMetadataUpdateRecord(record))
    const uniqueIds = new Set(validated.map((record) => record.id))
    if (uniqueIds.size !== validated.length) {
      throw metadataInvalidError('duplicate-file-id')
    }

    // The summary is built inside the retried closure so a busy retry never
    // double-counts rows or duplicates missingFileIds entries.
    return await this.withRetry(
      () =>
        this.db.transaction(
          async (tx) => {
            const attemptSummary: FileMetadataUpdateSummary = {
              requested: records.length,
              updated: 0,
              missingFileIds: []
            }
            const existingRows = await tx
              .select({ fileId: schema.files.id })
              .from(schema.files)
              .where(
                inArray(
                  schema.files.id,
                  validated.map((record) => record.id)
                )
              )
            const existingFileIds = new Set(existingRows.map((row) => row.fileId))

            for (const record of validated) {
              if (!existingFileIds.has(record.id)) {
                attemptSummary.missingFileIds.push(record.id)
                continue
              }
              await tx
                .update(schema.files)
                .set({
                  name: record.name,
                  extension: record.extension,
                  size: record.size,
                  mtime: record.mtime,
                  ctime: record.ctime,
                  lastIndexedAt: record.lastIndexedAt,
                  isDir: record.isDir,
                  type: record.type
                })
                .where(eq(schema.files.id, record.id))
              attemptSummary.updated += 1
            }
            await this.markPendingInTransaction(
              tx,
              validated
                .filter((record) => record.type === 'file' && existingFileIds.has(record.id))
                .map((record) => record.id)
            )

            return attemptSummary
          },
          { behavior: 'immediate' }
        ),
      FILE_INDEX_PERSISTENCE_RETRY_LABELS.updateFileMetadata
    )
  }

  async upsertScanProgress(
    paths: string[],
    lastScanned: string,
    sourceId?: string
  ): Promise<number> {
    const normalizedUpsert = normalizeScanProgressUpsert(paths, lastScanned)
    if (!normalizedUpsert) return 0

    const shape = await resolveScanProgressSchemaShape(this.db)
    if (shape.sourceScoped) {
      const resolvedSourceId = normalizeScanProgressSourceId(sourceId)
      await this.withRetry(
        () =>
          upsertSourceScopedScanProgress(this.db, {
            sourceId: resolvedSourceId,
            paths: normalizedUpsert.paths,
            lastScannedAt: normalizedUpsert.lastScanned.getTime()
          }),
        FILE_INDEX_PERSISTENCE_RETRY_LABELS.upsertScanProgress
      )
      return normalizedUpsert.paths.length
    }

    // Chunked for the same reason as the source-scoped branch: normalizeScanProgressUpsert
    // dedupes and validates but caps nothing, and two bound parameters per path hits
    // SQLite's 32766-variable ceiling at 16384 paths (#671).
    for (
      let offset = 0;
      offset < normalizedUpsert.paths.length;
      offset += SCAN_PROGRESS_UPSERT_CHUNK_ROWS
    ) {
      const chunk = normalizedUpsert.paths.slice(offset, offset + SCAN_PROGRESS_UPSERT_CHUNK_ROWS)
      await this.withRetry(
        () =>
          this.db.run(sql`
            INSERT INTO scan_progress (path, last_scanned)
            VALUES ${sql.join(
              chunk.map(
                (entryPath) => sql`(${entryPath}, ${normalizedUpsert.lastScanned.getTime()})`
              ),
              sql`, `
            )}
            ON CONFLICT(path) DO UPDATE SET
              last_scanned = excluded.last_scanned
          `),
        FILE_INDEX_PERSISTENCE_RETRY_LABELS.upsertScanProgress
      )
    }
    return normalizedUpsert.paths.length
  }

  async removeFileExtensions(fileId: number, keys: string[]): Promise<void> {
    if (keys.length === 0) return

    await this.withRetry(async () => {
      await this.db
        .delete(schema.fileExtensions)
        .where(
          and(eq(schema.fileExtensions.fileId, fileId), inArray(schema.fileExtensions.key, keys))
        )
    }, FILE_INDEX_PERSISTENCE_RETRY_LABELS.removeFileExtensions)
  }

  private async persistChunk(entries: FilePersistenceEntry[]): Promise<PersistChunkSummary> {
    if (entries.length === 0) {
      return {
        persistedRows: 0,
        fileUpdates: 0,
        progressRows: 0,
        embeddings: 0,
        staleFileIds: [],
        supersededFileIds: []
      }
    }

    return await this.withRetry(
      () =>
        this.db.transaction(
          async (tx) => {
            const existingRows = await tx
              .select({
                fileId: schema.files.id,
                mtime: schema.files.mtime,
                size: schema.files.size
              })
              .from(schema.files)
              .where(
                inArray(
                  schema.files.id,
                  entries.map((entry) => entry.fileId)
                )
              )
            const fingerprintByFileId = new Map(
              existingRows.map((row) => [
                row.fileId,
                { mtime: row.mtime.getTime(), size: row.size ?? null }
              ])
            )
            const summary: PersistChunkSummary = {
              persistedRows: 0,
              fileUpdates: 0,
              progressRows: 0,
              embeddings: 0,
              staleFileIds: [],
              supersededFileIds: []
            }

            for (const entry of entries) {
              const { fileId, fileUpdate, progress } = entry
              const currentFingerprint = fingerprintByFileId.get(fileId)
              if (!currentFingerprint) {
                summary.staleFileIds.push(fileId)
                continue
              }
              if (
                typeof entry.fileVersion === 'number' &&
                Number.isFinite(entry.fileVersion) &&
                (currentFingerprint.mtime !== entry.fileVersion ||
                  currentFingerprint.size !== (entry.fileSize ?? null))
              ) {
                // A newer file version already owns this row: skip both content
                // and progress so an older result can never resurrect stale
                // content or reset newer progress to completed. Size is part of
                // the fingerprint because mtime can be quantized to seconds, so
                // an in-second change would otherwise slip past an mtime-only fence.
                summary.supersededFileIds.push(fileId)
                continue
              }

              if (fileUpdate) {
                await tx
                  .update(schema.files)
                  .set({
                    content: fileUpdate.content,
                    embeddingStatus: fileUpdate.embeddingStatus as 'none' | 'pending' | 'completed'
                  })
                  .where(eq(schema.files.id, fileId))
                summary.fileUpdates += 1
                summary.persistedRows += 1

                if (fileUpdate.embeddings && fileUpdate.embeddings.length > 0) {
                  const sourceId = String(fileId)
                  await tx
                    .delete(schema.embeddings)
                    .where(
                      and(
                        eq(schema.embeddings.sourceId, sourceId),
                        eq(schema.embeddings.sourceType, 'file')
                      )
                    )
                  await tx.insert(schema.embeddings).values(
                    fileUpdate.embeddings.map((embedding) => ({
                      sourceId,
                      sourceType: 'file',
                      embedding: embedding.vector,
                      model: embedding.model || 'unknown',
                      contentHash: fileUpdate.contentHash
                    }))
                  )
                  summary.embeddings += fileUpdate.embeddings.length
                  summary.persistedRows += fileUpdate.embeddings.length
                }
              }

              const startedAt = progress.startedAt ? new Date(progress.startedAt) : null
              const updatedAt = progress.updatedAt ? new Date(progress.updatedAt) : new Date()
              const progressValues = {
                status: progress.status as
                  | 'pending'
                  | 'processing'
                  | 'completed'
                  | 'skipped'
                  | 'failed',
                progress: progress.progress,
                processedBytes: progress.processedBytes,
                totalBytes: progress.totalBytes,
                lastError: progress.lastError,
                startedAt,
                updatedAt
              }

              await tx
                .insert(schema.fileIndexProgress)
                .values({ fileId, ...progressValues })
                .onConflictDoUpdate({
                  target: schema.fileIndexProgress.fileId,
                  set: progressValues
                })
              summary.progressRows += 1
              summary.persistedRows += 1
            }

            return summary
          },
          { behavior: 'immediate' }
        ),
      FILE_INDEX_PERSISTENCE_RETRY_LABELS.persistChunk
    )
  }
}

interface StoredFileVersion {
  id: number
  path: string
  mtime: number
  ctime: number
  size: number | null
  lastIndexedAt: number
}

type TransactionalSearchItemRemover = Pick<SearchIndexService, 'removeProviderItemsInTransaction'>

function fileDeleteInvalidError(reason: string): Error {
  const error = new Error(`${FILE_INDEX_DELETE_INVALID_CODE}: ${reason}`)
  error.name = 'FileIndexDeleteInvalidError'
  return error
}

/** The caller owns the single-writer transaction and publishes only after it commits. */
export async function removeFileRecordsInTransaction(
  tx: SearchIndexWriteTx,
  service: TransactionalSearchItemRemover,
  sourceId: string,
  records: readonly ExpectedFileRecord[]
): Promise<RemoveFileRecordsResult> {
  if (records.length > FILE_INDEX_DELETE_MAX_BATCH) {
    throw fileDeleteInvalidError('batch-too-large')
  }
  const empty: RemoveFileRecordsResult = {
    deletedRecords: [],
    removedIndexedItems: 0,
    commitId: null,
    deferred: false
  }
  if (records.length === 0) return empty

  const requestedIds = new Set<number>()
  let requestedItemIds = 0
  for (const record of records) {
    if (!Number.isSafeInteger(record.id) || record.id <= 0 || requestedIds.has(record.id)) {
      throw fileDeleteInvalidError('file-id-invalid-or-duplicate')
    }
    if (!record.path || !record.itemId) throw fileDeleteInvalidError('identity-missing')
    if (
      !Number.isSafeInteger(record.mtime) ||
      !Number.isSafeInteger(record.ctime) ||
      !Number.isSafeInteger(record.lastIndexedAt) ||
      (record.size !== null && (!Number.isSafeInteger(record.size) || record.size < 0))
    ) {
      throw fileDeleteInvalidError('file-version-invalid')
    }
    if (record.legacyItemIds?.some((itemId) => !itemId)) {
      throw fileDeleteInvalidError('legacy-item-id-missing')
    }
    requestedIds.add(record.id)
    requestedItemIds += 1 + (record.legacyItemIds?.length ?? 0)
  }
  if (requestedItemIds > FILE_INDEX_DELETE_MAX_BATCH * 4) {
    throw fileDeleteInvalidError('item-batch-too-large')
  }

  // Read raw timestamps: Drizzle's timestamp columns decode these values as Dates.
  const currentRows = await tx.all<StoredFileVersion>(sql`
    SELECT id, path, mtime, ctime, size, last_indexed_at AS lastIndexedAt
    FROM files WHERE id IN (${sql.join(
      [...requestedIds].map((id) => sql`${id}`),
      sql`, `
    )})
      AND type = 'file'
  `)
  const currentById = new Map(currentRows.map((record) => [record.id, record]))
  const matching = records.filter((expected) => {
    const current = currentById.get(expected.id)
    return (
      current !== undefined &&
      current.path === expected.path &&
      current.mtime === expected.mtime &&
      current.ctime === expected.ctime &&
      current.size === expected.size &&
      current.lastIndexedAt === expected.lastIndexedAt
    )
  })
  if (matching.length === 0) return empty

  const deletedRows = await tx
    .delete(schema.files)
    .where(
      and(
        inArray(
          schema.files.id,
          matching.map((record) => record.id)
        ),
        eq(schema.files.type, 'file')
      )
    )
    .returning({ id: schema.files.id })
  const deletedIds = new Set(deletedRows.map((record) => record.id))
  const deletedRecords = matching.filter((record) => deletedIds.has(record.id))
  if (deletedRecords.length === 0) return empty

  const itemIds = new Set<string>()
  const legacyPaths = new Map<string, Set<string>>()
  const acceptedLegacyPaths = new Map<string, string>()
  for (const record of deletedRecords) {
    itemIds.add(record.itemId)
    for (const itemId of record.legacyItemIds ?? []) {
      if (itemId === record.itemId) continue
      let paths = legacyPaths.get(itemId)
      if (!paths) {
        paths = new Set<string>()
        legacyPaths.set(itemId, paths)
      }
      paths.add(record.path.toLowerCase())
    }
  }
  if (legacyPaths.size > 0) {
    // Keep the bounded metadata-PK lookup outermost, then probe FTS by trusted rowid.
    // A numeric id read from another historical home is not deletion authorization.
    const locatedAliases = await tx.all<{ itemId: string; path: string }>(sql`
      SELECT metadata.item_id AS itemId, document.path AS path
      FROM search_index_meta AS metadata
      CROSS JOIN search_index AS document
      WHERE metadata.provider_id = ${sourceId}
        AND metadata.item_id IN (${sql.join(
          [...legacyPaths.keys()].map((itemId) => sql`${itemId}`),
          sql`, `
        )})
        AND metadata.fts_rowid IS NOT NULL
        AND document.rowid = metadata.fts_rowid
        AND document.provider = metadata.provider_id
        AND document.item_id = metadata.item_id
    `)
    for (const alias of locatedAliases) {
      if (legacyPaths.get(alias.itemId)?.has(alias.path)) {
        itemIds.add(alias.itemId)
        acceptedLegacyPaths.set(alias.itemId, alias.path)
      }
    }
  }
  for (let recordIndex = 0; recordIndex < deletedRecords.length; recordIndex += 1) {
    const record = deletedRecords[recordIndex]
    const legacyItemIds = record.legacyItemIds
    if (!legacyItemIds?.length) continue
    const storedPath = record.path.toLowerCase()
    let acceptedLegacyIds: string[] | null = null
    for (let index = 0; index < legacyItemIds.length; index += 1) {
      const itemId = legacyItemIds[index]
      if (itemId === record.itemId || acceptedLegacyPaths.get(itemId) !== storedPath) {
        acceptedLegacyIds ??= legacyItemIds.slice(0, index)
      } else if (acceptedLegacyIds !== null) {
        acceptedLegacyIds.push(itemId)
      }
    }
    if (acceptedLegacyIds !== null) {
      deletedRecords[recordIndex] = { ...record, legacyItemIds: acceptedLegacyIds }
    }
  }
  const removedIndexedItems = await service.removeProviderItemsInTransaction(tx, sourceId, [
    ...itemIds
  ])

  // Explicit cleanup also covers older connections without foreign_keys enabled.
  const fileIds = [...deletedIds]
  await tx.delete(schema.fileExtensions).where(inArray(schema.fileExtensions.fileId, fileIds))
  await tx.delete(schema.fileIndexProgress).where(inArray(schema.fileIndexProgress.fileId, fileIds))
  await tx
    .delete(schema.embeddings)
    .where(
      and(
        eq(schema.embeddings.sourceType, 'file'),
        inArray(schema.embeddings.sourceId, fileIds.map(String))
      )
    )

  const progressShape = await resolveScanProgressSchemaShape(tx)
  if (progressShape.tableExists) {
    const paths = sql.join(
      deletedRecords.map((record) => sql`${record.path}`),
      sql`, `
    )
    await tx.run(
      progressShape.sourceScoped
        ? sql`DELETE FROM scan_progress WHERE source_id = ${sourceId} AND path IN (${paths})`
        : sql`DELETE FROM scan_progress WHERE path IN (${paths})`
    )
  }
  const commitId = randomUUID()
  await tx.insert(schema.searchIndexPendingCommits).values({
    commitId,
    sourceId,
    deletedRecords: JSON.stringify(deletedRecords),
    removedIndexedItems
  })
  return { deletedRecords, removedIndexedItems, commitId, deferred: false }
}

/** Missing-file cleanup is authorized by both file absence and a trusted document version. */
export async function removeMissingFileSearchRecordsInTransaction(
  tx: SearchIndexWriteTx,
  service: TransactionalSearchItemRemover,
  sourceId: string,
  records: readonly ExpectedMissingFileSearchRecord[]
): Promise<RemoveMissingFileSearchRecordsResult> {
  if (records.length > FILE_INDEX_DELETE_MAX_BATCH) {
    throw fileDeleteInvalidError('batch-too-large')
  }
  const empty: RemoveMissingFileSearchRecordsResult = {
    deletedRecords: [],
    removedIndexedItems: 0,
    commitId: null,
    deferred: false
  }
  if (records.length === 0) return empty
  const itemIds = new Set<string>()
  for (const record of records) {
    if (!record.path || !record.itemId || itemIds.has(record.itemId)) {
      throw fileDeleteInvalidError('search-identity-invalid-or-duplicate')
    }
    if (
      !Number.isSafeInteger(record.updatedAt) ||
      (record.ftsRowid !== null &&
        (!Number.isSafeInteger(record.ftsRowid) || record.ftsRowid <= 0)) ||
      (record.documentHash !== null && typeof record.documentHash !== 'string')
    ) {
      throw fileDeleteInvalidError('search-version-invalid')
    }
    itemIds.add(record.itemId)
  }
  const locatedRecords = records.filter(
    (record) => record.ftsRowid !== null && Boolean(record.documentHash)
  )
  if (locatedRecords.length === 0) return empty

  const presentFiles = await tx.all<{ path: string }>(sql`
    SELECT path FROM files
    WHERE path IN (${sql.join(
      locatedRecords.map((record) => sql`${record.path}`),
      sql`, `
    )})
      AND ${schema.fileTypeIs('file')}
  `)
  const presentPaths = new Set(presentFiles.map((record) => record.path))
  const metaRows = await tx.all<{
    itemId: string
    ftsRowid: number | null
    documentHash: string | null
    updatedAt: number
  }>(sql`
    SELECT item_id AS itemId, fts_rowid AS ftsRowid,
      document_hash AS documentHash, updated_at AS updatedAt
    FROM search_index_meta
    WHERE provider_id = ${sourceId}
      AND item_id IN (${sql.join(
        locatedRecords.map((record) => sql`${record.itemId}`),
        sql`, `
      )})
  `)
  const currentMeta = new Map(metaRows.map((record) => [record.itemId, record]))
  const indexedRows = await tx.all<{
    ftsRowid: number
    provider: string
    itemId: string
    path: string
  }>(sql`
    SELECT rowid AS ftsRowid, provider, item_id AS itemId, path FROM search_index
    WHERE rowid IN (${sql.join(
      locatedRecords.map((record) => sql`${record.ftsRowid}`),
      sql`, `
    )})
  `)
  const currentDocuments = new Map(indexedRows.map((record) => [record.ftsRowid, record]))
  const deletedRecords = locatedRecords.filter((expected) => {
    if (presentPaths.has(expected.path)) return false
    const meta = currentMeta.get(expected.itemId)
    const document =
      expected.ftsRowid === null ? undefined : currentDocuments.get(expected.ftsRowid)
    return (
      meta !== undefined &&
      document !== undefined &&
      meta.ftsRowid === expected.ftsRowid &&
      meta.documentHash === expected.documentHash &&
      meta.updatedAt === expected.updatedAt &&
      document.provider === sourceId &&
      document.itemId === expected.itemId &&
      document.path === expected.path.toLowerCase()
    )
  })
  if (deletedRecords.length === 0) return empty
  const removedIndexedItems = await service.removeProviderItemsInTransaction(
    tx,
    sourceId,
    deletedRecords.map((record) => record.itemId)
  )
  const commitId = randomUUID()
  await tx.insert(schema.searchIndexPendingCommits).values({
    commitId,
    sourceId,
    deletedRecords: JSON.stringify(deletedRecords),
    removedIndexedItems
  })
  return { deletedRecords, removedIndexedItems, commitId, deferred: false }
}

/** Reads only this source's oldest outstanding publication intents from the same live home. */
export async function listPendingFileDeletionCommitsInHome(
  db: Pick<SearchIndexWriteTx, 'all'>,
  sourceId: string,
  limit = FILE_INDEX_DELETE_MAX_BATCH
): Promise<ListPendingFileDeletionCommitsResult> {
  if (!Number.isSafeInteger(limit) || limit <= 0)
    throw fileDeleteInvalidError('commit-limit-invalid')
  const boundedLimit = Math.min(FILE_INDEX_DELETE_MAX_BATCH, limit)
  const rows = await db.all<{
    commitId: string
    sourceId: string
    deletedRecords: string
    removedIndexedItems: number
  }>(sql`
    SELECT commit_id AS commitId, source_id AS sourceId,
      deleted_records AS deletedRecords, removed_indexed_items AS removedIndexedItems
    FROM search_index_pending_commits
    WHERE source_id = ${sourceId}
    ORDER BY rowid ASC LIMIT ${boundedLimit}
  `)
  const commits = rows.map((row): FileDeletionCommitReceipt => {
    const deletedRecords: unknown = JSON.parse(row.deletedRecords)
    if (
      !Array.isArray(deletedRecords) ||
      deletedRecords.length === 0 ||
      deletedRecords.length > FILE_INDEX_DELETE_MAX_BATCH ||
      deletedRecords.some(
        (record) =>
          !record ||
          typeof record !== 'object' ||
          typeof record.itemId !== 'string' ||
          typeof record.path !== 'string'
      ) ||
      !Number.isSafeInteger(row.removedIndexedItems) ||
      row.removedIndexedItems < 0
    ) {
      throw fileDeleteInvalidError('pending-commit-invalid')
    }
    return {
      commitId: row.commitId,
      sourceId: row.sourceId,
      deletedRecords: deletedRecords as FileDeletionCommitReceipt['deletedRecords'],
      removedIndexedItems: row.removedIndexedItems
    }
  })
  return { commits, deferred: false }
}

/** Acknowledgement follows successful publication and never repeats the physical deletion. */
export async function acknowledgeFileDeletionCommitsInHome(
  db: Pick<SearchIndexWriteTx, 'delete'>,
  sourceId: string,
  commitIds: readonly string[]
): Promise<AcknowledgeFileDeletionCommitsResult> {
  if (commitIds.length > FILE_INDEX_DELETE_MAX_BATCH || commitIds.some((commitId) => !commitId)) {
    throw fileDeleteInvalidError('commit-ids-invalid')
  }
  if (commitIds.length === 0) return { acknowledged: 0, deferred: false }
  const acknowledgedRows = await db
    .delete(schema.searchIndexPendingCommits)
    .where(
      and(
        eq(schema.searchIndexPendingCommits.sourceId, sourceId),
        inArray(schema.searchIndexPendingCommits.commitId, [...new Set(commitIds)])
      )
    )
    .returning({ commitId: schema.searchIndexPendingCommits.commitId })
  return { acknowledged: acknowledgedRows.length, deferred: false }
}

function toDate(value: Date | number | string): Date {
  return value instanceof Date ? value : new Date(value)
}

interface NormalizedMetadataUpdateRecord {
  id: number
  name: string
  extension: string | null
  size: number | null
  mtime: Date
  ctime: Date
  lastIndexedAt: Date
  isDir: boolean
  type: string
}

function metadataInvalidError(reason: string): Error {
  const error = new Error(`${FILE_INDEX_METADATA_INVALID_CODE}: ${reason}`)
  error.name = 'FileIndexMetadataInvalidError'
  return error
}

function normalizeMetadataUpdateRecord(
  record: FileMetadataUpdateRecord
): NormalizedMetadataUpdateRecord {
  if (!record || typeof record !== 'object') {
    throw metadataInvalidError('record-not-an-object')
  }

  const { id, name, extension, size, mtime, ctime, lastIndexedAt, isDir, type } = record

  if (typeof id !== 'number' || !Number.isFinite(id) || !Number.isInteger(id) || id <= 0) {
    throw metadataInvalidError('id-not-positive-integer')
  }
  if (typeof name !== 'string') {
    throw metadataInvalidError('name-not-string')
  }
  if (extension !== null && extension !== undefined && typeof extension !== 'string') {
    throw metadataInvalidError('extension-not-string-or-null')
  }
  if (
    size !== null &&
    size !== undefined &&
    (typeof size !== 'number' || !Number.isFinite(size) || size < 0)
  ) {
    throw metadataInvalidError('size-not-nonnegative-finite-or-null')
  }
  if (typeof isDir !== 'boolean') {
    throw metadataInvalidError('is-dir-not-boolean')
  }
  if (typeof type !== 'string' || type.length === 0) {
    throw metadataInvalidError('type-not-non-empty-string')
  }

  return {
    id,
    name,
    extension: typeof extension === 'string' ? extension : null,
    size: typeof size === 'number' ? size : null,
    mtime: normalizeMetadataDate(mtime, 'mtime'),
    ctime: normalizeMetadataDate(ctime, 'ctime'),
    lastIndexedAt: normalizeMetadataDate(lastIndexedAt, 'last-indexed-at'),
    isDir,
    type
  }
}

function normalizeMetadataDate(value: Date | number | string, field: string): Date {
  if (value instanceof Date) {
    const time = value.getTime()
    if (!Number.isFinite(time)) {
      throw metadataInvalidError(`${field}-invalid-date`)
    }
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw metadataInvalidError(`${field}-non-finite-number`)
    }
    return new Date(value)
  }
  if (typeof value === 'string') {
    const time = Date.parse(value)
    if (!Number.isFinite(time)) {
      throw metadataInvalidError(`${field}-invalid-date-string`)
    }
    return new Date(time)
  }
  throw metadataInvalidError(`${field}-unsupported-type`)
}
