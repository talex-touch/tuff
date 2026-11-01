import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import {
  IndexedSourceScanReasons,
  type IndexedSourceRecord,
  type IndexedSourceRecordBatch
} from '@talex-touch/utils/search'
import { and, eq, gt, inArray } from 'drizzle-orm'
import { dbWriteScheduler } from '../../../../../db/db-write-scheduler'
import { scheduleDbWrite } from '../../../../../db/db-write'
import { getStartupDegradeWindowRemainingMs } from '../../../../../db/runtime-flags'
import { config as configSchema, files as filesSchema, fileTypeIs } from '../../../../../db/schema'
import type { DbUtils } from '../../../../../db/utils'
import { appTaskGate } from '../../../../../service/app-task-gate'
import { searchIndexWriter } from '../../../search-engine/search-index-writer'
import { chunkArray } from '../constants'
import type { FileIndexedSourceRuntimeMutationDelegate } from '../file-provider-index-contracts'
import { findLinkedWorktreeHolding } from '../file-traversal-policy'
import { shouldBootstrapFileReindex } from './file-provider-bootstrap-reindex'
import {
  FileProviderHotCatchupService,
  HOT_CATCHUP_KNOWN_FOLDER_NAMES,
  HOT_CATCHUP_RETRY_DELAYS_MS
} from './file-provider-hot-catchup-service'
import {
  FILE_KEYWORD_BACKFILL_VERSION,
  FileProviderKeywordBackfillService
} from './file-provider-keyword-backfill-service'
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
  getWatchPaths: () => readonly string[]
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
  /** Once-per-boot guard for the hot-directory catch-up; its repeats are counted separately. */
  private hotCatchupStarted = false
  private hotCatchup: FileProviderHotCatchupService | null = null
  private hotCatchupPasses = 0
  private hotCatchupRetryTimer: NodeJS.Timeout | null = null
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
    if (this.hotCatchupRetryTimer) {
      clearTimeout(this.hotCatchupRetryTimer)
      this.hotCatchupRetryTimer = null
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
      const watchRootCount = this.deps.getWatchPaths().length
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
   * Catches the folders most likely to have changed while the app was down up to date before the
   * whole-home reconcile gets to them, so a screenshot taken meanwhile is searchable seconds after
   * launch. Planned once per boot; bounded in scopes and time and run on the router's hot lane, so
   * it neither stalls startup nor waits behind queued resume work. A scope the pass could not
   * finish (a whole-source reconcile holding the run gate, or maintenance busy past the scope's
   * time budget) is repeated after 1 and again after 5 minutes, then left to the broad scan.
   * Contained: a failure here must never reject the startup chain.
   */
  async maybeRunHotCatchup(): Promise<void> {
    if (this.deps.isShuttingDown() || this.hotCatchupStarted || !this.deps.isRuntimeReady()) return
    try {
      const delegate = this.deps.getRuntimeMutationDelegate()
      const withLane = delegate.withHotSubtreeLane?.bind(delegate)
      if (!withLane) return
      this.hotCatchupStarted = true
      this.hotCatchup = new FileProviderHotCatchupService({
        isShuttingDown: () => this.deps.isShuttingDown(),
        getWatchPaths: () => this.deps.getWatchPaths(),
        getHomeDirectory: () => os.homedir(),
        getKnownFolders: () =>
          HOT_CATCHUP_KNOWN_FOLDER_NAMES.map((name) => path.join(os.homedir(), name)),
        readRecentFiles: async (sinceMs, limit) => {
          const rows =
            (await this.deps.getDbUtils()?.getRecentlyCreatedFiles(new Date(sinceMs), limit)) ?? []
          return rows.map((row) => ({ path: row.path, createdAtMs: row.ctime.getTime() }))
        },
        readDirectoryMtimeMs: async (directoryPath) => {
          try {
            const stats = await fs.lstat(directoryPath)
            return stats.isDirectory() ? stats.mtimeMs : null
          } catch {
            return null
          }
        },
        isAdmitted: async (directoryPath) =>
          !this.deps.getMaintenance().isStaleExcludedIndexPath(directoryPath) &&
          (await findLinkedWorktreeHolding(directoryPath, this.deps.getWatchPaths())) === null,
        withLane,
        logInfo: (message, meta) => this.deps.logInfo(message, meta),
        logDebug: (message, meta) => this.deps.logDebug(message, meta)
      })
    } catch (error) {
      this.deps.logWarn('Hot-directory catch-up failed', error)
      return
    }
    await this.runHotCatchupPass(undefined)
  }

  /** Never rejects. `retryScopes` is the `unfinished` list of the pass before; none plans afresh. */
  private async runHotCatchupPass(retryScopes: readonly string[] | undefined): Promise<void> {
    const catchup = this.hotCatchup
    if (!catchup) return
    this.hotCatchupPasses += 1
    try {
      const outcome = await catchup.run(retryScopes)
      this.scheduleHotCatchupRetry(outcome.stoppedBy === 'shutdown' ? [] : outcome.unfinished)
    } catch (error) {
      this.deps.logWarn('Hot-directory catch-up failed', error)
      // A pass that threw has no verdict on its scopes (or never planned any): same input again.
      this.scheduleHotCatchupRetry(retryScopes)
    }
  }

  private scheduleHotCatchupRetry(scopes: readonly string[] | undefined): void {
    const delay = HOT_CATCHUP_RETRY_DELAYS_MS[this.hotCatchupPasses - 1]
    if (delay === undefined || scopes?.length === 0 || this.deps.isShuttingDown()) return
    this.hotCatchupRetryTimer = setTimeout(() => {
      this.hotCatchupRetryTimer = null
      if (!this.deps.isShuttingDown()) void this.runHotCatchupPass(scopes)
    }, delay)
    this.hotCatchupRetryTimer.unref?.()
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
          // The backfill rewrites every file's keyword rows; hand the pages it freed back to the disk.
          if (!this.deps.isShuttingDown()) {
            void this.deps.getMaintenance().compactSearchIndex('boot-check')
          }
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
