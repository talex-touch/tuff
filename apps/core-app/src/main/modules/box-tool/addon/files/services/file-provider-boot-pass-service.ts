import process from 'node:process'
import {
  IndexedSourceScanReasons,
  type IndexedSourceRecord,
  type IndexedSourceRecordBatch
} from '@talex-touch/utils/search'
import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import { dbWriteScheduler } from '../../../../../db/db-write-scheduler'
import { scheduleDbWrite } from '../../../../../db/db-write'
import { getStartupDegradeWindowRemainingMs } from '../../../../../db/runtime-flags'
import { config as configSchema, files as filesSchema, fileTypeIs } from '../../../../../db/schema'
import type { DbUtils } from '../../../../../db/utils'
import { appTaskGate } from '../../../../../service/app-task-gate'
import { searchIndexWriter } from '../../../search-engine/search-index-writer'
import { chunkArray, FILE_CONTENT_MAX_CHARS, FILE_CONTENT_TOO_LONG_REASON } from '../constants'
import type { FileIndexedSourceRuntimeMutationDelegate } from '../file-provider-index-contracts'
import { shouldBootstrapFileReindex } from './file-provider-bootstrap-reindex'
import {
  FILE_KEYWORD_BACKFILL_VERSION,
  FileProviderKeywordBackfillService
} from './file-provider-keyword-backfill-service'
import { FileProviderEmbeddingBlobMigrationService } from './file-provider-embedding-blob-migration-service'
import { FileProviderOverlongContentCleanupService } from './file-provider-overlong-content-cleanup-service'
import type { FileProviderMaintenanceService } from './file-provider-maintenance-service'
import {
  FileProviderPathNormalizationService,
  shouldDeferReconciliationForPathNormalization,
  shouldRunPathNormalizationOnPlatform,
  type FilePathNormalizationRewrite,
  type FilePathNormalizationRow
} from './file-provider-path-normalization-service'

type FileRecord = typeof filesSchema.$inferSelect

const FILE_PATH_NORMALIZATION_INITIAL_DELAY_MS = 30_000
const FILE_PATH_NORMALIZATION_CONFIG_KEY = 'file_provider_path_normalization_version'
const FILE_KEYWORD_BACKFILL_INITIAL_DELAY_MS = 30_000
const FILE_KEYWORD_BACKFILL_CONFIG_KEY = 'file_provider_keyword_schema_version'
const FILE_EMBEDDING_BLOB_CONFIG_KEY = 'file_provider_embedding_blob_version'
const FILE_OVERLONG_CONTENT_CONFIG_KEY = 'file_provider_overlong_content_cleanup_version'

export interface FileProviderBootPassServiceDeps {
  sourceId: string
  getDbUtils: () => DbUtils | null
  isShuttingDown: () => boolean
  isSearchSplitEnabled: () => boolean
  /** The keyword backfill re-emits through the runtime, so it waits for both. */
  isRuntimeReady: () => boolean
  getRuntimeMutationDelegate: () => FileIndexedSourceRuntimeMutationDelegate
  /** Lazy: tests swap the maintenance service after construction. */
  getMaintenance: () => FileProviderMaintenanceService
  getWatchRootCount: () => number
  countIndexedRows: (reason: string) => Promise<number>
  mapRecord: (row: FileRecord) => IndexedSourceRecord
  emitRecordBatch: (batch: IndexedSourceRecordBatch) => Promise<void>
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

/**
 * The once-per-boot passes of the file index: the bootstrap reindex, the NFC path repair and the
 * keyword schema backfill, which runs queued behind the repair.
 */
export class FileProviderBootPassService {
  /** Once-per-boot guard for the split-topology bootstrap reindex net. */
  private bootstrapReindexChecked = false
  /** Once-per-boot guard for the NFC path repair pass. */
  private pathNormalizationScheduled = false
  /** Set after the repair's first attempt, successful or not. */
  private pathNormalizationAttempted = false
  private pathNormalizationTimer: NodeJS.Timeout | null = null
  /** Once-per-boot guard for the keyword schema backfill pass. */
  private keywordBackfillScheduled = false
  private keywordBackfillTimer: NodeJS.Timeout | null = null
  private readonly pathNormalizationService: FileProviderPathNormalizationService
  private readonly keywordBackfillService: FileProviderKeywordBackfillService<FileRecord>
  private readonly embeddingBlobMigrationService: FileProviderEmbeddingBlobMigrationService
  private readonly overlongContentCleanupService: FileProviderOverlongContentCleanupService<FileRecord>

  constructor(private readonly deps: FileProviderBootPassServiceDeps) {
    this.pathNormalizationService = new FileProviderPathNormalizationService({
      getAppliedVersion: () => this.getPathNormalizationAppliedVersion(),
      setAppliedVersion: (version) => this.setPathNormalizationAppliedVersion(version),
      loadRowsPage: (afterId, limit) => this.loadPathNormalizationRowsPage(afterId, limit),
      loadRowsByPaths: (paths) => this.loadPathNormalizationRowsByPaths(paths),
      rewritePath: (rewrite) => this.rewriteFilePathToNormalizedForm(rewrite),
      removeIndexedFile: async (deletion) => {
        const maintenance = this.deps.getMaintenance()
        const rows = await maintenance.findIncrementalDeleteRecords([deletion.path])
        if (rows.length === 0) return false
        if (rows[0].id !== deletion.id) throw new Error('FILE_PATH_NORMALIZATION_VERSION_CHANGED')
        const result = await maintenance.deleteFileRecords(rows, {
          keptFileId: deletion.keptId
        })
        if (result.deferred || !result.deletedIds.includes(deletion.id)) {
          throw new Error('FILE_PATH_NORMALIZATION_VERSION_CHANGED')
        }
        return true
      },
      removeIndexEntry: (filePath) =>
        this.deps.getMaintenance().enqueueOrphanSearchCandidates([filePath], 'path-rekey'),
      reindexRows: async (ids) => {
        const dbUtils = this.deps.getDbUtils()
        if (!dbUtils || ids.length === 0) return
        const rows = await dbUtils
          .getFileIndexReadDb()
          .select()
          .from(filesSchema)
          .where(inArray(filesSchema.id, ids))
        for (const chunk of chunkArray(rows, 10)) {
          await this.deps.getMaintenance().withFileMutationSlice(undefined, (mutationLeaseId) =>
            this.deps.getRuntimeMutationDelegate().applyBatch({
              sourceId: this.deps.sourceId,
              mutationLeaseId,
              records: chunk.map((record) => this.deps.mapRecord(record))
            })
          )
        }
      },
      yieldBetweenPages: async () => {
        await new Promise<void>((resolve) => setImmediate(resolve))
      },
      logInfo: (message, meta) => this.deps.logInfo(message, meta),
      logWarn: (message, error, meta) => this.deps.logWarn(message, error, meta)
    })
    this.keywordBackfillService = new FileProviderKeywordBackfillService<FileRecord>({
      getAppliedVersion: () => this.getKeywordBackfillAppliedVersion(),
      setAppliedVersion: (version) => this.setKeywordBackfillAppliedVersion(version),
      isReady: () => this.deps.isRuntimeReady(),
      loadRowsPage: (afterId, limit) => this.loadKeywordBackfillRowsPage(afterId, limit),
      emitRows: (rows) => this.emitKeywordBackfillRows(rows),
      waitForWriteCapacity: async () => {
        await appTaskGate.waitForIdle()
        await dbWriteScheduler.waitForCapacity(4)
      },
      logInfo: (message, meta) => this.deps.logInfo(message, meta),
      logWarn: (message, error, meta) => this.deps.logWarn(message, error, meta)
    })
    this.embeddingBlobMigrationService = new FileProviderEmbeddingBlobMigrationService({
      getAppliedVersion: () => this.getEmbeddingBlobMigrationAppliedVersion(),
      setAppliedVersion: (version) => this.setEmbeddingBlobMigrationAppliedVersion(version),
      isReady: () => this.deps.isRuntimeReady(),
      loadPage: (afterId, limit) => this.loadEmbeddingBlobMigrationPage(afterId, limit),
      writePage: (updates) => this.writeEmbeddingBlobMigrationPage(updates),
      waitForWriteCapacity: async () => {
        await appTaskGate.waitForIdle()
        await dbWriteScheduler.waitForCapacity(4)
      },
      logInfo: (message, meta) => this.deps.logInfo(message, meta),
      logWarn: (message, error, meta) => this.deps.logWarn(message, error, meta)
    })
    this.overlongContentCleanupService = new FileProviderOverlongContentCleanupService<FileRecord>({
      getAppliedVersion: () => this.readAppliedVersion(FILE_OVERLONG_CONTENT_CONFIG_KEY),
      setAppliedVersion: (version) =>
        this.writeAppliedVersion(
          FILE_OVERLONG_CONTENT_CONFIG_KEY,
          'file-index.overlong-content-cleanup.version',
          version
        ),
      isReady: () => this.deps.isRuntimeReady(),
      loadPage: (afterId, limit) => this.loadOverlongContentPage(afterId, limit),
      processPage: (rows) => this.clearOverlongContentPage(rows),
      waitForWriteCapacity: async () => {
        await appTaskGate.waitForIdle()
        await dbWriteScheduler.waitForCapacity(4)
      },
      logInfo: (message, meta) => this.deps.logInfo(message, meta),
      logWarn: (message, error, meta) => this.deps.logWarn(message, error, meta)
    })
  }

  /** Stops the passes that have not started; reconciliation must not stay parked waiting on them. */
  cancel(): void {
    if (this.pathNormalizationTimer) {
      clearTimeout(this.pathNormalizationTimer)
      this.pathNormalizationTimer = null
      // The pass will not run this boot, so reconciliation must not stay
      // parked waiting for it.
      this.pathNormalizationAttempted = true
    }
    if (this.keywordBackfillTimer) {
      clearTimeout(this.keywordBackfillTimer)
      this.keywordBackfillTimer = null
    }
  }

  getReconciliationDeferralReason(): string | null {
    return shouldDeferReconciliationForPathNormalization({
      scheduled: this.pathNormalizationScheduled,
      attempted: this.pathNormalizationAttempted
    })
      ? 'path-normalization-pending'
      : null
  }

  /**
   * Layer-2 bootstrap/self-heal reindex for the split topology (V1
   * ship-blocker #3). The primary trigger for a fresh search-index.db is
   * scan-progress emptiness (empty file → full scan); this net additionally
   * covers "index rows lost but scan_progress survived", where the eligibility
   * gate would otherwise stay closed forever. At most once per boot; the runtime
   * applies the same source eligibility in development and production. It is
   * deliberately NOT deferred by the startup degrade window because an empty
   * index is missing user-visible search capability, not background maintenance.
   */
  async maybeRunBootstrapReindex(): Promise<void> {
    if (this.deps.isShuttingDown() || this.bootstrapReindexChecked) return
    this.bootstrapReindexChecked = true

    try {
      const splitEnabled = this.deps.isSearchSplitEnabled()
      let indexedCount: number | null = null
      if (splitEnabled) {
        indexedCount = await this.deps.countIndexedRows('bootstrap.emptiness-check')
      }
      const watchRootCount = this.deps.getWatchRootCount()
      const decision = shouldBootstrapFileReindex({
        splitEnabled,
        indexedCount,
        watchRootCount,
        alreadyChecked: false
      })
      if (!decision.run) {
        this.deps.logDebug('Search index bootstrap reindex not needed', {
          reason: decision.reason,
          indexedCount,
          watchRoots: watchRootCount
        })
        return
      }

      this.deps.logInfo(
        `Search index bootstrap reindex scheduled: search_index empty for '${this.deps.sourceId}' with ${watchRootCount} watch root(s)`
      )
      await this.deps.getRuntimeMutationDelegate().scanSource(IndexedSourceScanReasons.Startup)
      this.deps.logInfo('Search index bootstrap reindex completed', {
        indexedCount: await this.deps.countIndexedRows('bootstrap.completion-check')
      })
    } catch (error) {
      // Contained: the runtime serializes concurrent scans, so "already in
      // progress" style failures here mean the normal path took over.
      this.deps.logWarn('Search index bootstrap reindex failed', error)
    }
  }

  /**
   * Boot-time maintenance writer (database-write-contracts §7): the one-time
   * NFC path repair only starts after the DB startup degrade window, so its
   * writes never join the startup write storm. The pass itself is idempotent
   * and self-gated on a config version, so a re-schedule is harmless.
   */
  schedulePathNormalizationMigration(): void {
    if (this.deps.isShuttingDown() || this.pathNormalizationScheduled) return
    if (!shouldRunPathNormalizationOnPlatform(process.platform)) {
      // Byte-exact filesystem: the two unicode forms are two different files,
      // so there is nothing to merge and no id to rewrite.
      this.deps.logDebug('File path normalization migration not applicable on this platform', {
        platform: process.platform
      })
      this.scheduleKeywordSchemaBackfill()
      return
    }
    this.pathNormalizationScheduled = true
    const delayMs = Math.max(
      FILE_PATH_NORMALIZATION_INITIAL_DELAY_MS,
      getStartupDegradeWindowRemainingMs()
    )
    this.deps.logInfo('Scheduling file path normalization migration', {
      deferredMs: Math.round(delayMs)
    })
    this.pathNormalizationTimer = setTimeout(() => {
      this.pathNormalizationTimer = null
      if (this.deps.isShuttingDown()) {
        // Nothing will attempt the pass this boot; release reconciliation.
        this.pathNormalizationAttempted = true
        return
      }
      void this.pathNormalizationService
        .run()
        .then((result) => {
          if (result.status === 'skipped') {
            this.deps.logDebug('File path normalization migration skipped', {
              reason: result.reason
            })
          }
        })
        .catch((error) => {
          this.deps.logWarn('File path normalization migration failed', error)
        })
        .finally(() => {
          // Attempted, not necessarily successful: reconciliation resumes
          // either way (see shouldDeferReconciliationForPathNormalization).
          this.pathNormalizationAttempted = true
          // Queued behind the repair rather than run alongside it: both walk
          // the whole files table, and the repair rewrites the very ids the
          // backfill would re-emit under.
          this.scheduleKeywordSchemaBackfill()
        })
    }, delayMs)
  }

  /**
   * Boot-time maintenance writer (database-write-contracts §7): the one-time
   * keyword rewrite for rows indexed under the previous charset rules. Reads
   * no files — the keywords come from the indexed row — and is self-gated on a
   * config version, so a re-schedule is harmless.
   */
  private scheduleKeywordSchemaBackfill(): void {
    if (this.deps.isShuttingDown() || this.keywordBackfillScheduled) return
    this.keywordBackfillScheduled = true
    const delayMs = Math.max(
      FILE_KEYWORD_BACKFILL_INITIAL_DELAY_MS,
      getStartupDegradeWindowRemainingMs()
    )
    this.deps.logInfo('Scheduling file keyword schema backfill', {
      version: FILE_KEYWORD_BACKFILL_VERSION,
      deferredMs: Math.round(delayMs)
    })
    this.keywordBackfillTimer = setTimeout(() => {
      this.keywordBackfillTimer = null
      if (this.deps.isShuttingDown()) return
      void this.keywordBackfillService
        .run()
        .then((result) => {
          if (result.status === 'skipped') {
            this.deps.logDebug('File keyword schema backfill skipped', { reason: result.reason })
          }
        })
        .catch((error) => {
          this.deps.logWarn('File keyword schema backfill failed', error)
        })
        .finally(() => {
          // The backfill rewrites every file's keyword rows. Over-long bodies go first so the BLOB
          // pass does not convert vectors that are about to be deleted, and the compaction runs once
          // after both: it is what hands the freed pages back to the disk.
          if (this.deps.isShuttingDown()) return
          void this.runOverlongContentCleanup()
            .then(() => (this.deps.isShuttingDown() ? undefined : this.runEmbeddingBlobMigration()))
            .finally(() => {
              if (!this.deps.isShuttingDown()) {
                void this.deps.getMaintenance().compactSearchIndex('boot-check')
              }
            })
        })
    }, delayMs)
  }

  private async loadKeywordBackfillRowsPage(afterId: number, limit: number): Promise<FileRecord[]> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) return []
    // Split-aware home: the re-emit writes into the index the worker owns, so
    // the rows must come from that same home (contracts §6).
    return await dbUtils
      .getFileIndexReadDb()
      .select()
      .from(filesSchema)
      .where(and(eq(filesSchema.type, 'file'), gt(filesSchema.id, afterId)))
      .orderBy(filesSchema.id)
      .limit(limit)
  }

  /**
   * Re-emit indexed rows through the normal indexed-source write path. The
   * writer compares each item's keyword hash before touching keyword_mappings,
   * so rows already carrying current keywords cost a hash comparison and
   * nothing else.
   */
  private async emitKeywordBackfillRows(rows: FileRecord[]): Promise<void> {
    if (rows.length === 0) return
    await this.deps.emitRecordBatch({
      sourceId: this.deps.sourceId,
      records: rows.map((row) => this.deps.mapRecord(row))
    })
  }

  private async runOverlongContentCleanup(): Promise<void> {
    try {
      const result = await this.overlongContentCleanupService.run()
      if (result.status === 'skipped') {
        this.deps.logDebug('Over-long content cleanup skipped', { reason: result.reason })
      }
    } catch (error) {
      this.deps.logWarn('Over-long content cleanup failed', error)
    }
  }

  /**
   * Rows still holding a body above the cap, or recorded `truncated` (a cut prefix of an even longer
   * file). Both predicates are read from the worker's home, the one the clear below writes to.
   */
  private async loadOverlongContentPage(afterId: number, limit: number): Promise<FileRecord[]> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) return []
    return await dbUtils
      .getFileIndexReadDb()
      .select()
      .from(filesSchema)
      .where(
        and(
          fileTypeIs('file'),
          gt(filesSchema.id, afterId),
          sql`(length(${filesSchema.content}) > ${FILE_CONTENT_MAX_CHARS}
            OR ${filesSchema.id} IN (SELECT file_id FROM file_index_progress WHERE status = 'truncated'))`
        )
      )
      .orderBy(filesSchema.id)
      .limit(limit)
  }

  /**
   * Publishes the emptied search documents first, then clears the rows. Re-emitting the record with
   * `content: null` replaces the FTS `content` column through the normal write path (the document
   * hash covers it). A failure between the two leaves `files.content` in place, so the page is
   * selected again on the next boot.
   */
  private async clearOverlongContentPage(rows: FileRecord[]): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils || rows.length === 0) return
    await this.deps.emitRecordBatch({
      sourceId: this.deps.sourceId,
      records: rows.map((row) => this.deps.mapRecord({ ...row, content: null }))
    })

    const ids = rows.map((row) => row.id)
    const reason = FILE_CONTENT_TOO_LONG_REASON
    if (this.deps.isSearchSplitEnabled()) {
      const marks = ids.map(() => '?').join(', ')
      await searchIndexWriter.execWrite(
        [
          {
            sql: `UPDATE files SET content = NULL, embedding_status = 'none' WHERE id IN (${marks})`,
            args: ids
          },
          {
            sql: `DELETE FROM embeddings WHERE source_type = 'file' AND source_id IN (${marks})`,
            args: ids.map(String)
          },
          {
            sql: `DELETE FROM file_extensions WHERE key = 'content_chunks' AND file_id IN (${marks})`,
            args: ids
          },
          {
            sql: `INSERT INTO file_index_progress (file_id, status, progress, last_error, updated_at)
              SELECT id, 'skipped', 100, ?, strftime('%s', 'now') FROM files WHERE id IN (${marks})
              ON CONFLICT(file_id) DO UPDATE SET status = 'skipped', progress = 100,
                last_error = excluded.last_error, updated_at = excluded.updated_at`,
            args: [reason, ...ids]
          }
        ],
        'transaction'
      )
      return
    }
    const fileIds = sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `
    )
    const sourceIds = sql.join(
      ids.map((id) => sql`${String(id)}`),
      sql`, `
    )
    const db = dbUtils.getDb()
    await scheduleDbWrite('file-index.overlong-content-cleanup', async () => {
      await db.transaction(async (tx) => {
        await tx.run(
          sql`UPDATE files SET content = NULL, embedding_status = 'none' WHERE id IN (${fileIds})`
        )
        await tx.run(
          sql`DELETE FROM embeddings WHERE source_type = 'file' AND source_id IN (${sourceIds})`
        )
        await tx.run(
          sql`DELETE FROM file_extensions WHERE key = 'content_chunks' AND file_id IN (${fileIds})`
        )
        await tx.run(sql`INSERT INTO file_index_progress (file_id, status, progress, last_error, updated_at)
          SELECT id, 'skipped', 100, ${reason}, strftime('%s', 'now') FROM files WHERE id IN (${fileIds})
          ON CONFLICT(file_id) DO UPDATE SET status = 'skipped', progress = 100,
            last_error = excluded.last_error, updated_at = excluded.updated_at`)
      })
    })
  }

  private async runEmbeddingBlobMigration(): Promise<void> {
    try {
      const result = await this.embeddingBlobMigrationService.run()
      if (result.status === 'skipped') {
        this.deps.logDebug('Embedding BLOB migration skipped', { reason: result.reason })
      }
    } catch (error) {
      this.deps.logWarn('Embedding BLOB migration failed', error)
    }
  }

  private async loadEmbeddingBlobMigrationPage(
    afterId: number,
    limit: number
  ): Promise<Array<{ id: number; embedding: string }>> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) return []
    // Split-aware home: the rewrite lands in the index file the worker owns (contracts §6).
    const rows = await dbUtils.getFileIndexReadDb().all<{ id: number; embedding: string }>(sql`
      SELECT id, embedding FROM embeddings
      WHERE id > ${afterId} AND typeof(embedding) = 'text'
      ORDER BY id LIMIT ${limit}`)
    return rows.map((row) => ({ id: Number(row.id), embedding: row.embedding }))
  }

  private async writeEmbeddingBlobMigrationPage(
    updates: Array<{ id: number; blob: Uint8Array }>
  ): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) return
    // `typeof(...) = 'text'` keeps a vector the embedding service rewrote in the meantime.
    const statements = updates.map((update) => ({
      sql: "UPDATE embeddings SET embedding = ? WHERE id = ? AND typeof(embedding) = 'text'",
      args: [update.blob, update.id]
    }))
    if (this.deps.isSearchSplitEnabled()) {
      await searchIndexWriter.execWrite(statements, 'transaction')
      return
    }
    const db = dbUtils.getDb()
    await scheduleDbWrite('file-index.embedding-blob-migration', async () => {
      await db.transaction(async (tx) => {
        for (const update of updates) {
          await tx.run(
            sql`UPDATE embeddings SET embedding = ${update.blob} WHERE id = ${update.id} AND typeof(embedding) = 'text'`
          )
        }
      })
    })
  }

  private async getEmbeddingBlobMigrationAppliedVersion(): Promise<number | null> {
    return await this.readAppliedVersion(FILE_EMBEDDING_BLOB_CONFIG_KEY)
  }

  private async setEmbeddingBlobMigrationAppliedVersion(version: number): Promise<void> {
    await this.writeAppliedVersion(
      FILE_EMBEDDING_BLOB_CONFIG_KEY,
      'file-index.embedding-blob-migration.version',
      version
    )
  }

  private async getKeywordBackfillAppliedVersion(): Promise<number | null> {
    return await this.readAppliedVersion(FILE_KEYWORD_BACKFILL_CONFIG_KEY)
  }

  private async setKeywordBackfillAppliedVersion(version: number): Promise<void> {
    await this.writeAppliedVersion(
      FILE_KEYWORD_BACKFILL_CONFIG_KEY,
      'file-index.keyword-backfill.version',
      version
    )
  }

  private async loadPathNormalizationRowsPage(
    afterId: number,
    limit: number
  ): Promise<FilePathNormalizationRow[]> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) return []
    // Split-aware home: the rewrite/delete this feeds targets the file the
    // worker owns, so the ids must come from that same home (2d.3).
    return await dbUtils
      .getFileIndexReadDb()
      .select({
        id: filesSchema.id,
        path: filesSchema.path,
        lastIndexedAt: filesSchema.lastIndexedAt
      })
      .from(filesSchema)
      .where(and(eq(filesSchema.type, 'file'), gt(filesSchema.id, afterId)))
      .orderBy(filesSchema.id)
      .limit(limit)
  }

  private async loadPathNormalizationRowsByPaths(
    paths: string[]
  ): Promise<FilePathNormalizationRow[]> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils || paths.length === 0) return []
    return await dbUtils
      .getFileIndexReadDb()
      .select({
        id: filesSchema.id,
        path: filesSchema.path,
        lastIndexedAt: filesSchema.lastIndexedAt
      })
      .from(filesSchema)
      .where(and(fileTypeIs('file'), inArray(filesSchema.path, paths)))
  }

  /**
   * `UPDATE files SET path` on whichever home owns the table: forwarded to the
   * search-index worker under the split (sole writer of that file), otherwise
   * queued on the primary lane. Never both.
   */
  private async rewriteFilePathToNormalizedForm(
    rewrite: FilePathNormalizationRewrite
  ): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) throw new Error('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
    // Persist both sides of the rekey before metadata moves. A failed base
    // publication can then recover from the canonical row without a disk scan.
    await this.deps.getMaintenance().enqueueOrphanSearchCandidates([rewrite.fromPath], 'path-rekey')
    const statement = dbUtils
      .getFileIndexReadDb()
      .update(filesSchema)
      .set({ path: rewrite.toPath })
      .where(
        and(
          eq(filesSchema.id, rewrite.id),
          eq(filesSchema.path, rewrite.fromPath),
          eq(filesSchema.type, 'file')
        )
      )
      .toSQL()
    if (this.deps.isSearchSplitEnabled()) {
      await searchIndexWriter.execWrite([{ sql: statement.sql, args: statement.params }], 'single')
      return
    }
    const db = dbUtils.getDb()
    await scheduleDbWrite('file-index.path-normalization.rewrite', async () => {
      await db
        .update(filesSchema)
        .set({ path: rewrite.toPath })
        .where(
          and(
            eq(filesSchema.id, rewrite.id),
            eq(filesSchema.path, rewrite.fromPath),
            eq(filesSchema.type, 'file')
          )
        )
    })
  }

  private async getPathNormalizationAppliedVersion(): Promise<number | null> {
    return await this.readAppliedVersion(FILE_PATH_NORMALIZATION_CONFIG_KEY)
  }

  private async setPathNormalizationAppliedVersion(version: number): Promise<void> {
    await this.writeAppliedVersion(
      FILE_PATH_NORMALIZATION_CONFIG_KEY,
      'file-index.path-normalization.version',
      version
    )
  }

  private async readAppliedVersion(key: string): Promise<number | null> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) return null
    const rows = await dbUtils
      .getDb()
      .select({ value: configSchema.value })
      .from(configSchema)
      .where(eq(configSchema.key, key))
    const raw = rows[0]?.value
    if (!raw) return null
    const parsed = Number.parseInt(raw, 10)
    return Number.isNaN(parsed) ? null : parsed
  }

  private async writeAppliedVersion(key: string, label: string, version: number): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) return
    const db = dbUtils.getDb()
    await scheduleDbWrite(label, async () => {
      await db
        .insert(configSchema)
        .values({ key, value: String(version) })
        .onConflictDoUpdate({
          target: configSchema.key,
          set: { value: String(version) }
        })
    })
  }
}
