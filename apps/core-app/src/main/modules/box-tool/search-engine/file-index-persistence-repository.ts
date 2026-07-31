import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { and, eq, inArray, sql } from 'drizzle-orm'
import * as schema from '../../../db/schema'
import { withSqliteRetry } from '../../../db/sqlite-retry'
import {
  normalizeScanProgressSourceId,
  resolveScanProgressSchemaShape,
  upsertSourceScopedScanProgress
} from './scan-progress-schema'
import { normalizeScanProgressUpsert } from './workers/search-index-worker-scan-progress'

const PERSIST_CHUNK_SIZE = 3
const PERSIST_CHUNK_YIELD_MS = 30

export const FILE_INDEX_METADATA_UPDATE_MAX_BATCH = 100
export const FILE_INDEX_METADATA_INVALID_CODE = 'FILE_INDEX_METADATA_INVALID'

export const FILE_INDEX_PERSISTENCE_RETRY_LABELS = {
  persistChunk: 'search-index.worker.persistChunk',
  upsertFiles: 'search-index.worker.upsertFiles',
  upsertScanProgress: 'search-index.worker.upsertScanProgress',
  removeFile: 'search-index.worker.removeFile',
  removeFileExtensions: 'search-index.worker.removeFileExtensions',
  updateFileMetadata: 'search-index.worker.updateFileMetadata'
} as const

export interface FilePersistenceEntry {
  fileId: number
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

export interface FileIndexPersistenceRepository {
  persistEntries(entries: FilePersistenceEntry[]): Promise<PersistEntriesSummary>
  upsertFiles(records: UpsertFileRecord[]): Promise<Array<Record<string, unknown>>>
  updateFileMetadata(records: FileMetadataUpdateRecord[]): Promise<FileMetadataUpdateSummary>
  upsertScanProgress(paths: string[], lastScanned: string, sourceId?: string): Promise<number>
  removeFile(path: string): Promise<void>
  removeFileExtensions(fileId: number, keys: string[]): Promise<void>
}

interface PersistChunkSummary {
  persistedRows: number
  fileUpdates: number
  progressRows: number
  embeddings: number
  staleFileIds: number[]
}

export function withFileIndexPersistenceRetry<T>(
  operation: () => Promise<T>,
  label: string
): Promise<T> {
  return withSqliteRetry(operation, { label })
}

export class SqliteFileIndexPersistenceRepository implements FileIndexPersistenceRepository {
  constructor(private readonly db: LibSQLDatabase<typeof schema>) {}

  async persistEntries(entries: FilePersistenceEntry[]): Promise<PersistEntriesSummary> {
    const summary: PersistEntriesSummary = {
      entries: entries.length,
      chunks: 0,
      persistedRows: 0,
      fileUpdates: 0,
      progressRows: 0,
      embeddings: 0,
      staleFileIds: []
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

      if (offset + PERSIST_CHUNK_SIZE < entries.length) {
        await new Promise<void>((resolve) => setTimeout(resolve, PERSIST_CHUNK_YIELD_MS))
      }
    }

    return summary
  }

  async upsertFiles(records: UpsertFileRecord[]): Promise<Array<Record<string, unknown>>> {
    if (records.length === 0) return []

    const rows = await withFileIndexPersistenceRetry(
      () =>
        this.db
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
          .returning(),
      FILE_INDEX_PERSISTENCE_RETRY_LABELS.upsertFiles
    )

    return rows as Array<Record<string, unknown>>
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
    return await withFileIndexPersistenceRetry(
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
      await withFileIndexPersistenceRetry(
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

    await withFileIndexPersistenceRetry(
      () =>
        this.db.run(sql`
          INSERT INTO scan_progress (path, last_scanned)
          VALUES ${sql.join(
            normalizedUpsert.paths.map(
              (entryPath) => sql`(${entryPath}, ${normalizedUpsert.lastScanned.getTime()})`
            ),
            sql`, `
          )}
          ON CONFLICT(path) DO UPDATE SET
            last_scanned = excluded.last_scanned
        `),
      FILE_INDEX_PERSISTENCE_RETRY_LABELS.upsertScanProgress
    )
    return normalizedUpsert.paths.length
  }

  async removeFile(path: string): Promise<void> {
    await withFileIndexPersistenceRetry(async () => {
      await this.db.delete(schema.files).where(eq(schema.files.path, path))
    }, FILE_INDEX_PERSISTENCE_RETRY_LABELS.removeFile)
  }

  async removeFileExtensions(fileId: number, keys: string[]): Promise<void> {
    if (keys.length === 0) return

    await withFileIndexPersistenceRetry(async () => {
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
        staleFileIds: []
      }
    }

    return await withFileIndexPersistenceRetry(
      () =>
        this.db.transaction(
          async (tx) => {
            const existingRows = await tx
              .select({ fileId: schema.files.id })
              .from(schema.files)
              .where(
                inArray(
                  schema.files.id,
                  entries.map((entry) => entry.fileId)
                )
              )
            const existingFileIds = new Set(existingRows.map((row) => row.fileId))
            const summary: PersistChunkSummary = {
              persistedRows: 0,
              fileUpdates: 0,
              progressRows: 0,
              embeddings: 0,
              staleFileIds: []
            }

            for (const entry of entries) {
              const { fileId, fileUpdate, progress } = entry
              if (!existingFileIds.has(fileId)) {
                summary.staleFileIds.push(fileId)
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
