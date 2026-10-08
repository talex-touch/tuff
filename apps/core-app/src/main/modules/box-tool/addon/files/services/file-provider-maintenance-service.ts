import type { IndexedFileSourceRecordRow, IndexedSourceRecord } from '@talex-touch/utils/search'
import { chunkIndexedWriteRecords } from '@talex-touch/utils/search'
import {
  PROJECT_MARKER_ENTRIES,
  PROJECT_MARKER_SUFFIXES
} from '@talex-touch/utils/common/file-scan-constants'
import { fileFilterService } from '@talex-touch/utils/common/file-filter-service'
import { normalizeFsPath } from '@talex-touch/utils/common/file-scan-utils'
import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { DbUtils } from '../../../../../db/utils'
import { scheduleDbWrite } from '../../../../../db/db-write'
import {
  files as filesSchema,
  fileTypeIs,
  searchIndexFileMaintenance,
  searchIndexMaintenanceProgress
} from '../../../../../db/schema'
import { formatDuration } from '../../../../../utils/logger'
import type { SearchIndexService } from '../../../search-engine/search-index-service'
import type { IndexedWriteDeleteExecutorResult } from '../../../search-engine/indexing-write-delete-executor-service'
import type {
  ExpectedFileRecord,
  ExpectedMissingFileSearchRecord,
  FileDeletionCommitReceipt,
  FileRecordRemovalOptions,
  FilePersistencePort
} from '../../../search-engine/search-index-writer'
import {
  acknowledgeFileDeletionCommitsInPrimaryHome,
  listPendingFileDeletionCommitsInPrimaryHome,
  removeFileRecordsInPrimaryHome,
  removeMissingFileSearchRecordsInPrimaryHome,
  searchIndexWriter
} from '../../../search-engine/search-index-writer'
import {
  isIndexMaintenanceIdle,
  waitForIndexMaintenanceIdle
} from '../../../search-engine/search-activity'
import type {
  FileIndexedSourceRuntimeMutationDelegate,
  FileIndexRunOptions
} from '../file-provider-index-contracts'
import { getFileTraversalExclusionReason } from '../file-traversal-policy'
import {
  FileProviderCleanupDeleteService,
  type FileProviderCleanupDeleteResult
} from './file-provider-cleanup-delete-service'
import {
  getReconciliationFileRecordsPage,
  type FileProviderReconciliationDbRecord
} from './file-provider-reconciliation-run-service'
import { FileProviderReconciliationDeleteService } from './file-provider-reconciliation-delete-service'

export const FILE_MAINTENANCE_ROUND_BUDGET_MS = 1_500
export const FILE_MAINTENANCE_SLICE_SIZE = 64
/** Gap between maintenance rounds while durable work is pending. */
export const FILE_MAINTENANCE_DELAY_MS = 1_000
/**
 * The same gap once the main thread has just lagged. A round is up to 1.5s of main-thread work
 * (synchronous index reads included), so at the normal 1s gap a struggling loop sees one block
 * every ~2.5s for as long as the walk lasts. Backing off does not skip work, it spreads it.
 */
export const FILE_MAINTENANCE_LAG_BACKOFF_DELAY_MS = 5_000
export const FILE_MAINTENANCE_LAG_BACKOFF_THRESHOLD_MS = 1_000
export const FILE_MAINTENANCE_LAG_BACKOFF_WINDOW_MS = 10_000

export interface RecentEventLoopLag {
  lagMs: number
  at: number
}

export function resolveFileMaintenanceDelayMs(
  recentLag: RecentEventLoopLag | null | undefined,
  now: number
): number {
  if (
    recentLag &&
    recentLag.lagMs >= FILE_MAINTENANCE_LAG_BACKOFF_THRESHOLD_MS &&
    now - recentLag.at <= FILE_MAINTENANCE_LAG_BACKOFF_WINDOW_MS
  ) {
    return FILE_MAINTENANCE_LAG_BACKOFF_DELAY_MS
  }
  return FILE_MAINTENANCE_DELAY_MS
}
type FileSearchOrphanCandidate = Pick<ExpectedMissingFileSearchRecord, 'itemId'> &
  Partial<ExpectedMissingFileSearchRecord> & { filesystemPath?: string }
type FileMaintenanceReason =
  | 'missing-root'
  | 'filter-root'
  | 'stale-file'
  | 'orphan-search'
  | 'path-rekey'
type FileMaintenanceWork = Omit<typeof searchIndexFileMaintenance.$inferSelect, 'reason'> & {
  reason: FileMaintenanceReason
  rowId: number
}
const NEXT_FILE_MAINTENANCE_REASON: Record<FileMaintenanceReason, FileMaintenanceReason> = {
  'missing-root': 'filter-root',
  'filter-root': 'stale-file',
  'stale-file': 'orphan-search',
  'orphan-search': 'path-rekey',
  'path-rekey': 'missing-root'
}

export interface FileProviderMaintenanceDeps {
  sourceId: string
  getDbUtils: () => DbUtils | null
  getSearchIndex: () => SearchIndexService | null
  getFilePersistencePort: () => FilePersistencePort
  getRuntimeMutationDelegate: () => FileIndexedSourceRuntimeMutationDelegate
  isSplitEnabled: () => boolean
  isShuttingDown: () => boolean
  isInitializing: () => boolean
  isWithinWatchRoots: (filePath: string) => boolean
  normalizePath: (filePath: string) => string
  mapRecord: (record: IndexedFileSourceRecordRow) => IndexedSourceRecord
  onBaseCommitReady: () => void
  emitCleanupProgress: (current: number, total: number) => void
  /** Latest main-process event-loop lag, if the host tracks one; spaces rounds out after it. */
  getRecentEventLoopLag?: () => RecentEventLoopLag | null
  logInfo: (message: string, metadata?: Record<string, unknown>) => void
  logDebug: (message: string, metadata?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, metadata?: Record<string, unknown>) => void
}

export class FileProviderMaintenanceService {
  private readonly maintenanceAbortController = new AbortController()
  private maintenanceTimer: NodeJS.Timeout | null = null
  private maintenanceRun: Promise<void> | null = null
  private baseMutationSliceDepth = 0
  private maintenanceRunAbortController: AbortController | null = null
  private maintenanceCleanupNext = true
  private maintenanceCleanupPending = true
  private maintenanceWorkReason: FileMaintenanceReason = 'missing-root'
  private readonly maintenanceWorkAfterRowId: Record<FileMaintenanceReason, number> = {
    'missing-root': 0,
    'filter-root': 0,
    'stale-file': 0,
    'orphan-search': 0,
    'path-rekey': 0
  }
  private watchConfigurationSignature = ''
  private watchConfigurationGeneration = 0
  private readonly cleanupFilterEvidence = new Map<string, string[]>()
  private readonly cleanupDirectoryReads = new Map<string, Promise<string[]>>()
  private watchPaths: string[] = []
  private extraPaths: string[] = []
  private readonly cleanupDeleteService: FileProviderCleanupDeleteService<
    FileProviderReconciliationDbRecord,
    FileIndexRunOptions | undefined
  >
  private readonly reconciliationDeleteService: FileProviderReconciliationDeleteService<
    FileProviderReconciliationDbRecord,
    FileIndexRunOptions | undefined
  >

  constructor(private readonly deps: FileProviderMaintenanceDeps) {
    this.reconciliationDeleteService = new FileProviderReconciliationDeleteService({
      sourceId: deps.sourceId,
      deleteRecords: (records, options) => this.deleteFileRecords(records, 'missing', options)
    })
    this.cleanupDeleteService = new FileProviderCleanupDeleteService<
      FileProviderReconciliationDbRecord,
      FileIndexRunOptions | undefined
    >({
      sourceId: this.id,
      getIndexedFileRecordsPage: async (afterId, limit, runOptions) => {
        runOptions?.signal?.throwIfAborted()
        if (!this.dbUtils) return []
        this.cleanupFilterEvidence.clear()
        this.cleanupDirectoryReads.clear()
        // Cleanup deletes are keyed by these ids — read the home the delete
        // will target (worker-owned search file under the split).
        return await this.dbUtils
          .getFileIndexReadDb()
          .select({
            id: filesSchema.id,
            path: filesSchema.path,
            mtime: filesSchema.mtime,
            ctime: filesSchema.ctime,
            size: filesSchema.size,
            lastIndexedAt: filesSchema.lastIndexedAt
          })
          .from(filesSchema)
          .where(and(eq(filesSchema.type, 'file'), gt(filesSchema.id, afterId)))
          .orderBy(filesSchema.id)
          .limit(limit)
      },
      isWithinWatchRoots: (filePath) => this.deps.isWithinWatchRoots(filePath),
      isStaleIndexPath: (filePath, runOptions) =>
        this.classifyExcludedCleanupPath(filePath, runOptions),
      yieldAfterRead: async () => {
        await new Promise<void>((resolve) => setImmediate(resolve))
      },
      getCursorKey: () => this.getCleanupTaskKey(),
      loadCursor: (key) => this.getMaintenanceCursor(key),
      saveCursor: (key, cursor) => this.setMaintenanceCursor(key, cursor),
      canContinue: (runOptions) => this.canContinueFileMaintenance(runOptions),
      roundBudgetMs: FILE_MAINTENANCE_ROUND_BUDGET_MS,
      deleteRecords: (records, runOptions) =>
        this.deleteFileRecords(records, 'configuration', runOptions),
      emitProgress: (current, total) => this.deps.emitCleanupProgress(current, total),
      now: () => performance.now(),
      formatDuration,
      logInfo: (message, meta) => this.deps.logInfo(message, meta),
      logDebug: (message, meta) => this.deps.logDebug(message, meta)
    })
  }
  private get id(): string {
    return this.deps.sourceId
  }
  private get dbUtils(): DbUtils | null {
    return this.deps.getDbUtils()
  }
  private get searchIndex(): SearchIndexService | null {
    return this.deps.getSearchIndex()
  }
  private get shuttingDown(): boolean {
    return this.deps.isShuttingDown()
  }
  private get isInitializing(): boolean {
    return this.deps.isInitializing()
  }
  public get signal(): AbortSignal {
    return this.maintenanceAbortController.signal
  }
  public get isBaseMutationSliceActive(): boolean {
    return this.baseMutationSliceDepth > 0
  }
  public updateConfiguration(watchPaths: readonly string[], extraPaths: readonly string[]): void {
    const signature = JSON.stringify([watchPaths, extraPaths])
    if (signature === this.watchConfigurationSignature) return
    this.watchPaths = [...watchPaths]
    this.extraPaths = [...extraPaths]
    this.watchConfigurationSignature = signature
    this.watchConfigurationGeneration += 1
    this.cleanupFilterEvidence.clear()
    this.cleanupDirectoryReads.clear()
    this.maintenanceCleanupPending = true
    this.scheduleFileMaintenance()
  }
  public async cancelRun(): Promise<void> {
    this.maintenanceRunAbortController?.abort(new Error('FILE_INDEX_BACKGROUND_PREEMPTED'))
    clearTimeout(this.maintenanceTimer ?? undefined)
    this.maintenanceTimer = null
    await this.maintenanceRun?.catch(() => undefined)
  }
  public async stop(): Promise<void> {
    this.maintenanceAbortController.abort(new Error('FILE_PROVIDER_SHUTTING_DOWN'))
    await this.cancelRun()
  }
  public async runConfigurationCleanup(
    options?: FileIndexRunOptions
  ): Promise<FileProviderCleanupDeleteResult> {
    const result = await this.cleanupDeleteService.execute(options)
    this.maintenanceCleanupPending = !result.done
    if (!result.done) this.scheduleFileMaintenance()
    return result
  }

  /** Search returns immediately; observed versions are persisted before background execution. */
  public cleanupStaleSearchCandidates(itemIds: string[]): void {
    if (this.shuttingDown || itemIds.length === 0) return
    void this.enqueueOrphanSearchCandidates(itemIds).catch((error) => {
      this.deps.logWarn('Failed to persist stale search candidate work', error, {
        count: itemIds.length
      })
    })
  }

  public async enqueueOrphanSearchCandidates(
    itemIds: string[],
    reason: 'orphan-search' | 'path-rekey' = 'orphan-search'
  ): Promise<void> {
    const dbUtils = this.dbUtils
    if (!dbUtils) return
    for (const ids of chunkIndexedWriteRecords(
      [...new Set(itemIds)],
      FILE_MAINTENANCE_SLICE_SIZE
    )) {
      this.maintenanceAbortController.signal.throwIfAborted()
      const records = await dbUtils.getFileIndexReadDb().all<FileSearchOrphanCandidate>(sql`
          SELECT m.item_id AS itemId, s.path, m.fts_rowid AS ftsRowid,
                 m.document_hash AS documentHash, m.updated_at AS updatedAt
          FROM search_index_meta AS m
          LEFT JOIN search_index AS s ON s.rowid = m.fts_rowid
            AND s.provider = m.provider_id AND s.item_id = m.item_id
          WHERE m.provider_id = ${this.id}
            AND m.item_id IN (${sql.join(
              ids.map((id) => sql`${id}`),
              sql`, `
            )})
        `)
      const byItemId = new Map(records.map((record) => [record.itemId, record]))
      await this.enqueueFileMaintenanceWork(
        ids.map((itemId) => {
          const observed = byItemId.get(itemId)
          // Discovery without a locator stays unresolved, never an invented
          // deletion version. Backfill later supplies a verified FTS path/rowid.
          const record: FileSearchOrphanCandidate = {
            ...(observed ?? { itemId }),
            filesystemPath: path.isAbsolute(itemId) ? itemId : undefined
          }
          return {
            reason,
            filePath: record.filesystemPath ?? record.path ?? '',
            expectedRecord: record
          }
        })
      )
    }
    this.scheduleFileMaintenance()
  }

  /** Absence is trusted only under a currently monitored, readable directory. */
  public async getFileAbsenceEvidence(
    filePath: string,
    reachableRoots = new Map<string, Promise<boolean>>(),
    expectedFile = false
  ): Promise<'missing' | 'present' | 'unavailable'> {
    const normalized = this.deps.normalizePath(filePath)
    let root: string | undefined
    for (const candidate of this.watchPaths) {
      const key = this.deps.normalizePath(candidate).replace(/[\\/]+$/, '')
      if (
        (normalized === key || normalized.startsWith(`${key}/`)) &&
        (root === undefined || candidate.length > root.length)
      )
        root = candidate
    }
    if (!root) return 'unavailable'
    let reachable = reachableRoots.get(root)
    if (!reachable) {
      reachable = (async () => {
        try {
          const stats = await fs.lstat(root)
          if (!stats.isDirectory() || stats.isSymbolicLink()) return false
          const directory = await fs.opendir(root)
          await directory.close()
          return true
        } catch {
          return false
        }
      })()
      reachableRoots.set(root, reachable)
    }
    if (!(await reachable)) return 'unavailable'
    try {
      const stats = await fs.lstat(filePath)
      return expectedFile && (!stats.isFile() || stats.isSymbolicLink()) ? 'missing' : 'present'
    } catch (error) {
      return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT' ? 'missing' : 'unavailable'
    }
  }

  public cleanupStaleFileResult(file: typeof filesSchema.$inferSelect, reason: string): void {
    if (this.shuttingDown) return
    const observed = this.toExpectedFileRecord(file)
    void this.enqueueFileMaintenanceWork([
      { reason: 'stale-file', filePath: file.path, expectedRecord: observed }
    ])
      .then(() => this.scheduleFileMaintenance())
      .catch((error) => {
        this.deps.logWarn('Failed to persist stale file result work', error, {
          path: file.path,
          reason
        })
      })
  }

  private isUserMonitoredPath(filePath: string): boolean {
    const normalizedFile = this.deps.normalizePath(filePath)
    return this.extraPaths.some((extraPath) => {
      const root = this.deps.normalizePath(extraPath).replace(/[\\/]+$/, '')
      return root.length > 0 && (normalizedFile === root || normalizedFile.startsWith(`${root}/`))
    })
  }

  /** Current file-source scope; native providers keep their own admission rules. */
  public isSearchPathAdmitted(filePath: string): boolean {
    if (!this.deps.isWithinWatchRoots(filePath) || this.isStaleExcludedIndexPath(filePath))
      return false
    return this.isUserMonitoredPath(filePath) || !this.cleanupFilterEvidence.has(filePath)
  }

  public isStaleExcludedIndexPath(filePath: string): boolean {
    const reason = fileFilterService.getSearchExclusionReason({
      path: filePath,
      name: path.basename(filePath),
      extension: path.extname(filePath),
      isDirectory: false
    })
    if (
      this.isUserMonitoredPath(filePath) &&
      (reason === 'development-path' ||
        reason === 'cache-path' ||
        reason === 'system-path' ||
        reason === 'excluded-path')
    )
      return false
    return reason !== null
  }

  public async classifyExcludedCleanupPath(
    filePath: string,
    options?: FileIndexRunOptions
  ): Promise<boolean | null> {
    options?.signal?.throwIfAborted()
    if (this.isStaleExcludedIndexPath(filePath)) return true
    if (this.isUserMonitoredPath(filePath)) return false
    const markers = new Set<string>()
    let unavailable = false
    const reason = await getFileTraversalExclusionReason(filePath, async (directoryPath) => {
      options?.signal?.throwIfAborted()
      let pending = this.cleanupDirectoryReads.get(directoryPath)
      if (!pending) {
        pending = fs.readdir(directoryPath)
        this.cleanupDirectoryReads.set(directoryPath, pending)
      }
      try {
        const names = await pending
        for (const name of names) {
          if (
            PROJECT_MARKER_ENTRIES.has(name.toLowerCase()) ||
            PROJECT_MARKER_SUFFIXES.some((suffix) => name.toLowerCase().endsWith(suffix))
          ) {
            markers.add(path.join(directoryPath, name))
          }
        }
        return names
      } catch {
        unavailable = true
        // An unreadable parent is not proof of a project marker. The existing
        // traversal vocabulary stays conservative instead of its strict fallback.
        return []
      }
    })
    options?.signal?.throwIfAborted()
    if (unavailable) return null
    if (reason && markers.size > 0) {
      this.cleanupFilterEvidence.set(filePath, [...markers])
      return true
    }
    return false
  }

  public async scheduleChangedFilterScope(filePath: string): Promise<void> {
    const name = path.basename(filePath).toLowerCase()
    if (
      !PROJECT_MARKER_ENTRIES.has(name) &&
      !PROJECT_MARKER_SUFFIXES.some((suffix) => name.endsWith(suffix))
    )
      return
    const scope = path.dirname(filePath)
    if (!this.deps.isWithinWatchRoots(scope)) return
    this.cleanupFilterEvidence.clear()
    this.cleanupDirectoryReads.clear()
    this.watchConfigurationGeneration += 1
    await this.enqueueFileMaintenanceWork([{ reason: 'filter-root', filePath: scope }])
    await this.setFileMaintenanceCursor(this.fileMaintenanceTaskId('filter-root', scope, null), 0)
    this.scheduleFileMaintenance()
  }

  public async findIncrementalDeleteRecords(
    paths: string[]
  ): Promise<FileProviderReconciliationDbRecord[]> {
    if (!this.dbUtils || paths.length === 0) return []
    return await this.dbUtils
      .getFileIndexReadDb()
      .select({
        id: filesSchema.id,
        path: filesSchema.path,
        mtime: filesSchema.mtime,
        ctime: filesSchema.ctime,
        size: filesSchema.size,
        lastIndexedAt: filesSchema.lastIndexedAt
      })
      .from(filesSchema)
      .where(and(fileTypeIs('file'), inArray(filesSchema.path, paths)))
  }

  public async withFileMutationSlice<T>(
    options: FileIndexRunOptions | undefined,
    operation: (leaseId: string) => Promise<T>
  ): Promise<T> {
    const maintenance = options?.maintenance !== false
    const signal = options?.signal ?? this.maintenanceAbortController.signal
    signal.throwIfAborted()
    const execute = async (leaseId: string): Promise<T> => {
      this.baseMutationSliceDepth += 1
      try {
        return await operation(leaseId)
      } finally {
        this.baseMutationSliceDepth -= 1
      }
    }
    let result: T
    if (options?.mutationLeaseId) {
      result = await execute(options.mutationLeaseId)
    } else {
      // No source permission, worker admission or transaction exists during this wait.
      if (maintenance) await waitForIndexMaintenanceIdle(signal)
      result = await this.deps
        .getRuntimeMutationDelegate()
        .withMutationLease(execute, { maintenance, signal })
    }
    if (maintenance && !this.shuttingDown && !this.isInitializing) {
      this.deps.onBaseCommitReady()
    }
    return result
  }

  private toExpectedFileRecord(record: FileProviderReconciliationDbRecord): ExpectedFileRecord {
    const seconds = (value: Date | number | string | null): number => {
      const timestamp =
        value instanceof Date
          ? Math.floor(value.getTime() / 1000)
          : typeof value === 'number'
            ? value
            : value === null
              ? Number.NaN
              : Math.floor(new Date(value).getTime() / 1000)
      if (!Number.isSafeInteger(timestamp)) throw new Error('FILE_DELETE_VERSION_REQUIRED')
      return timestamp
    }
    return {
      id: record.id,
      path: record.path,
      mtime: seconds(record.mtime),
      ctime: seconds(record.ctime),
      size: record.size,
      lastIndexedAt: seconds(record.lastIndexedAt),
      itemId: record.path,
      legacyItemIds: [String(record.id)]
    }
  }

  public async deleteFileRecords(
    records: FileProviderReconciliationDbRecord[],
    evidence:
      | 'configuration'
      | 'missing'
      | 'watch'
      | {
          keptFileId: number
        },
    options?: FileIndexRunOptions
  ): Promise<
    IndexedWriteDeleteExecutorResult<FileProviderReconciliationDbRecord> & {
      deferred: boolean
    }
  > {
    const empty = { deleted: [], deletedIds: [], deletedPaths: [], deferred: false }
    if (records.length === 0 || !this.dbUtils) return empty
    if (records.length > FILE_MAINTENANCE_SLICE_SIZE) throw new Error('FILE_DELETE_SLICE_TOO_LARGE')
    const observed = records.map((record) => this.toExpectedFileRecord(record))
    if (!this.canContinueFileMaintenance(options)) return { ...empty, deferred: true }
    return await this.withFileMutationSlice(options, async (mutationLeaseId) => {
      const authorized: ExpectedFileRecord[] = []
      const reachableRoots = new Map<string, Promise<boolean>>()
      const markerChecks = new Map<string, Promise<boolean | null>>()
      let unavailable = false
      const configurationGeneration = this.watchConfigurationGeneration
      const removalOptions: FileRecordRemovalOptions = {
        maintenance: options?.maintenance !== false,
        signal: options?.signal ?? this.maintenanceAbortController.signal,
        isStillCurrent: () => this.watchConfigurationGeneration === configurationGeneration
      }
      for (const record of observed) {
        options?.signal?.throwIfAborted()
        if (typeof evidence === 'object') {
          const rows = await this.dbUtils!.getFileIndexReadDb()
            .select()
            .from(filesSchema)
            .where(and(eq(filesSchema.id, evidence.keptFileId), eq(filesSchema.type, 'file')))
            .limit(1)
          const keeper = rows[0] ? this.toExpectedFileRecord(rows[0]) : null
          const target = normalizeFsPath(record.path)
          if (
            keeper &&
            keeper.id !== record.id &&
            normalizeFsPath(keeper.path) === target &&
            (keeper.lastIndexedAt > record.lastIndexedAt ||
              (keeper.lastIndexedAt === record.lastIndexedAt &&
                (keeper.path === target || (record.path !== target && keeper.id < record.id))))
          )
            authorized.push(record)
          continue
        }
        if (evidence === 'configuration') {
          if (
            !this.deps.isWithinWatchRoots(record.path) ||
            this.isStaleExcludedIndexPath(record.path)
          ) {
            authorized.push(record)
          } else if (!this.isUserMonitoredPath(record.path)) {
            for (const marker of this.cleanupFilterEvidence.get(record.path) ?? []) {
              if (!this.canContinueFileMaintenance(options)) {
                unavailable = true
                break
              }
              let check = markerChecks.get(marker)
              if (!check) {
                check = fs.lstat(marker).then(
                  () => true,
                  (error: NodeJS.ErrnoException) => (error.code === 'ENOENT' ? false : null)
                )
                markerChecks.set(marker, check)
              }
              const exists = await check
              if (exists === null) unavailable = true
              if (exists === true) {
                authorized.push(record)
                break
              }
            }
          }
        } else if (this.deps.isWithinWatchRoots(record.path)) {
          const state = await this.getFileAbsenceEvidence(record.path, reachableRoots, true)
          if (state === 'missing') authorized.push(record)
          else if (state === 'unavailable') unavailable = true
        }
      }
      if (authorized.length === 0) return { ...empty, deferred: unavailable }
      const result = this.deps.isSplitEnabled()
        ? await this.deps
            .getFilePersistencePort()
            .removeFileRecords(this.id, authorized, removalOptions)
        : await removeFileRecordsInPrimaryHome(
            this.dbUtils!.getFileIndexReadDb(),
            this.searchIndex!,
            this.id,
            authorized,
            removalOptions
          )
      if (result.deferred) return { ...empty, deferred: true }
      let publicationComplete = true
      if (result.commitId) {
        publicationComplete = await this.publishFileDeletionReceipt(
          {
            commitId: result.commitId,
            sourceId: this.id,
            deletedRecords: result.deletedRecords,
            removedIndexedItems: result.removedIndexedItems
          },
          mutationLeaseId,
          options
        )
      }
      return {
        deleted: result.deletedRecords,
        deletedIds: result.deletedRecords.map((record) => record.id),
        deletedPaths: result.deletedRecords.map((record) => record.path),
        deferred: unavailable || !publicationComplete
      }
    })
  }

  private async publishFileDeletionReceipt(
    receipt: FileDeletionCommitReceipt,
    mutationLeaseId: string,
    options?: FileIndexRunOptions
  ): Promise<boolean> {
    if (receipt.sourceId !== this.id) throw new Error('FILE_DELETE_COMMIT_SOURCE_MISMATCH')
    // A committed transaction always publishes before observing cancellation.
    // Failed visibility/publication leaves this real receipt durable for replay.
    await this.deps.getRuntimeMutationDelegate().publishFileDeletionCommit({
      sourceId: this.id,
      deletedRecords: receipt.deletedRecords,
      removedIndexedItems: receipt.removedIndexedItems,
      mutationLeaseId,
      reason: 'file-provider-fused-delete'
    })
    if (options?.signal?.aborted || this.shuttingDown) return false
    const removalOptions = {
      maintenance: options?.maintenance !== false,
      signal: options?.signal ?? this.maintenanceAbortController.signal
    }
    const result = this.deps.isSplitEnabled()
      ? await this.deps
          .getFilePersistencePort()
          .acknowledgeFileDeletionCommits(this.id, [receipt.commitId], removalOptions)
      : await acknowledgeFileDeletionCommitsInPrimaryHome(
          this.dbUtils!.getFileIndexReadDb(),
          this.id,
          [receipt.commitId],
          removalOptions
        )
    return !result.deferred
  }

  public async replayPendingFileDeletionCommits(options?: FileIndexRunOptions): Promise<boolean> {
    const startedAt = performance.now()
    if (!this.canContinueFileMaintenance(options)) return false
    const removalOptions = {
      maintenance: options?.maintenance !== false,
      signal: options?.signal ?? this.maintenanceAbortController.signal
    }
    const pending = this.deps.isSplitEnabled()
      ? await this.deps
          .getFilePersistencePort()
          .listPendingFileDeletionCommits(this.id, FILE_MAINTENANCE_SLICE_SIZE, removalOptions)
      : await listPendingFileDeletionCommitsInPrimaryHome(
          this.dbUtils!.getFileIndexReadDb(),
          this.id,
          FILE_MAINTENANCE_SLICE_SIZE,
          removalOptions
        )
    if (pending.deferred) return false
    for (const receipt of pending.commits) {
      if (
        !this.canContinueFileMaintenance(options) ||
        performance.now() - startedAt >= FILE_MAINTENANCE_ROUND_BUDGET_MS
      )
        return false
      const complete = await this.withFileMutationSlice(options, (mutationLeaseId) =>
        this.publishFileDeletionReceipt(receipt, mutationLeaseId, options)
      )
      if (!complete) return false
    }
    return pending.commits.length < FILE_MAINTENANCE_SLICE_SIZE
  }

  public canContinueFileMaintenance(options?: FileIndexRunOptions): boolean {
    options?.signal?.throwIfAborted()
    if (this.shuttingDown) return false
    if (
      options?.maintenanceDeadlineAt !== undefined &&
      performance.now() >= options.maintenanceDeadlineAt
    ) {
      return false
    }
    return options?.maintenance === false || isIndexMaintenanceIdle()
  }

  public getCleanupTaskKey(): string {
    // Configuration changes start a fresh sweep. Old cursors do not authorize
    // deletion, and execution checks current extra-root/filter ownership again.
    return `file-cleanup/v2/${createHash('sha256').update(this.watchConfigurationSignature).digest('hex')}`
  }

  public async getMaintenanceCursor(task: string): Promise<number> {
    if (!this.dbUtils) throw new Error('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
    const rows = await this.dbUtils
      .getFileIndexReadDb()
      .select({ cursor: searchIndexMaintenanceProgress.cursor })
      .from(searchIndexMaintenanceProgress)
      .where(eq(searchIndexMaintenanceProgress.task, task))
      .limit(1)
    return rows[0]?.cursor ?? 0
  }

  public async setMaintenanceCursor(task: string, cursor: number): Promise<void> {
    if (!this.dbUtils) throw new Error('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
    const db = this.dbUtils.getFileIndexReadDb()
    const query = db
      .insert(searchIndexMaintenanceProgress)
      .values({ task, cursor })
      .onConflictDoUpdate({ target: searchIndexMaintenanceProgress.task, set: { cursor } })
    if (this.deps.isSplitEnabled()) {
      const prepared = query.toSQL()
      await searchIndexWriter.execWrite([{ sql: prepared.sql, args: prepared.params }])
    } else {
      await scheduleDbWrite('file-maintenance.cursor', () => query)
    }
  }

  public fileMaintenanceTaskId(
    reason: FileMaintenanceReason,
    filePath: string,
    expectedRecord: string | null
  ): string {
    return createHash('sha256')
      .update(`${this.id}\0${reason}\0${filePath}\0${expectedRecord ?? ''}`)
      .digest('hex')
  }

  public async enqueueFileMaintenanceWork(
    entries: Array<{
      reason: FileMaintenanceReason
      filePath: string
      expectedRecord?: ExpectedFileRecord | FileSearchOrphanCandidate
    }>
  ): Promise<void> {
    if (entries.length === 0) return
    if (!this.dbUtils) throw new Error('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
    for (const chunk of chunkIndexedWriteRecords(entries, FILE_MAINTENANCE_SLICE_SIZE)) {
      const query = this.dbUtils
        .getFileIndexReadDb()
        .insert(searchIndexFileMaintenance)
        .values(
          chunk.map((entry) => {
            const expectedRecord = entry.expectedRecord
              ? JSON.stringify(entry.expectedRecord)
              : null
            return {
              taskId: this.fileMaintenanceTaskId(entry.reason, entry.filePath, expectedRecord),
              sourceId: this.id,
              reason: entry.reason,
              filePath: entry.filePath,
              expectedRecord,
              cursor: 0
            }
          })
        )
        .onConflictDoNothing()
      if (this.deps.isSplitEnabled()) {
        const prepared = query.toSQL()
        await searchIndexWriter.execWrite([{ sql: prepared.sql, args: prepared.params }])
      } else {
        await scheduleDbWrite('file-maintenance.enqueue', () => query)
      }
    }
  }

  public async getFileMaintenanceCursor(taskId: string): Promise<number> {
    if (!this.dbUtils) throw new Error('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
    const rows = await this.dbUtils
      .getFileIndexReadDb()
      .select({ cursor: searchIndexFileMaintenance.cursor })
      .from(searchIndexFileMaintenance)
      .where(
        and(
          eq(searchIndexFileMaintenance.taskId, taskId),
          eq(searchIndexFileMaintenance.sourceId, this.id)
        )
      )
      .limit(1)
    return rows[0]?.cursor ?? 0
  }

  public async setFileMaintenanceCursor(taskId: string, cursor: number): Promise<void> {
    if (!this.dbUtils) throw new Error('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
    const query = this.dbUtils
      .getFileIndexReadDb()
      .update(searchIndexFileMaintenance)
      .set({ cursor })
      .where(
        and(
          eq(searchIndexFileMaintenance.taskId, taskId),
          eq(searchIndexFileMaintenance.sourceId, this.id)
        )
      )
    if (this.deps.isSplitEnabled()) {
      const prepared = query.toSQL()
      await searchIndexWriter.execWrite([{ sql: prepared.sql, args: prepared.params }])
    } else {
      await scheduleDbWrite('file-maintenance.cursor', () => query)
    }
  }

  public async removeFileMaintenanceWork(taskIds: string[]): Promise<void> {
    if (taskIds.length === 0) return
    if (!this.dbUtils) throw new Error('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
    const query = this.dbUtils
      .getFileIndexReadDb()
      .delete(searchIndexFileMaintenance)
      .where(
        and(
          eq(searchIndexFileMaintenance.sourceId, this.id),
          inArray(searchIndexFileMaintenance.taskId, taskIds)
        )
      )
    if (this.deps.isSplitEnabled()) {
      const prepared = query.toSQL()
      await searchIndexWriter.execWrite([{ sql: prepared.sql, args: prepared.params }])
    } else {
      await scheduleDbWrite('file-maintenance.complete', () => query)
    }
  }

  public async runMissingFileMaintenance(
    task: string,
    rootPath: string,
    options?: FileIndexRunOptions,
    evidence: 'missing' | 'configuration' = 'missing'
  ): Promise<{
    deletedCount: number
    done: boolean
  }> {
    const startedAt = performance.now()
    let deletedCount = 0
    let cursor = await this.getFileMaintenanceCursor(task)
    for (let page = 0; page < 16; page += 1) {
      if (
        !this.canContinueFileMaintenance(options) ||
        performance.now() - startedAt >= FILE_MAINTENANCE_ROUND_BUDGET_MS
      ) {
        return { deletedCount, done: false }
      }
      // A removed monitoring scope is no longer absence evidence. Configuration
      // cleanup independently retires its records under the current root set.
      if (!this.deps.isWithinWatchRoots(rootPath)) {
        await this.removeFileMaintenanceWork([task])
        return { deletedCount, done: true }
      }
      if (!this.dbUtils) throw new Error('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
      const records = await getReconciliationFileRecordsPage(
        this.dbUtils,
        rootPath,
        cursor,
        FILE_MAINTENANCE_SLICE_SIZE
      )
      this.cleanupFilterEvidence.clear()
      this.cleanupDirectoryReads.clear()
      if (records.length === 0) {
        await this.removeFileMaintenanceWork([task])
        return { deletedCount, done: true }
      }
      if (!this.canContinueFileMaintenance(options)) return { deletedCount, done: false }
      let candidates = records
      if (evidence === 'configuration') {
        candidates = []
        for (const record of records) {
          const excluded = await this.classifyExcludedCleanupPath(record.path, options)
          if (excluded === null) return { deletedCount, done: false }
          if (excluded) candidates.push(record)
        }
      }
      if (
        !this.canContinueFileMaintenance(options) ||
        performance.now() - startedAt >= FILE_MAINTENANCE_ROUND_BUDGET_MS
      ) {
        return { deletedCount, done: false }
      }
      const result =
        candidates.length === 0
          ? { deletedCount: 0, deferred: false }
          : evidence === 'configuration'
            ? await this.deleteFileRecords(candidates, 'configuration', options).then((result) => ({
                deletedCount: result.deleted.length,
                deferred: result.deferred
              }))
            : await this.reconciliationDeleteService.execute(candidates, options)
      deletedCount += result.deletedCount
      if (result.deferred) return { deletedCount, done: false }
      const nextCursor = records[records.length - 1].id
      await this.setFileMaintenanceCursor(task, nextCursor)
      cursor = nextCursor
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
    return { deletedCount, done: false }
  }

  private async runOrphanSearchMaintenance(
    tasks: readonly FileMaintenanceWork[],
    options: FileIndexRunOptions
  ): Promise<void> {
    if (!this.dbUtils || tasks.length === 0 || !this.canContinueFileMaintenance(options)) return
    const candidates = tasks.map((task) => {
      if (!task.expectedRecord) throw new Error('FILE_MAINTENANCE_EXPECTED_RECORD_REQUIRED')
      return {
        taskId: task.taskId,
        reason: task.reason,
        record: JSON.parse(task.expectedRecord) as FileSearchOrphanCandidate
      }
    })
    const itemIds = candidates.map(({ record }) => record.itemId)
    const versions = await this.dbUtils.getFileIndexReadDb()
      .all<ExpectedMissingFileSearchRecord>(sql`
        SELECT m.item_id AS itemId, s.path, m.fts_rowid AS ftsRowid,
               m.document_hash AS documentHash, m.updated_at AS updatedAt
        FROM search_index_meta AS m CROSS JOIN search_index AS s ON s.rowid = m.fts_rowid
          AND s.provider = m.provider_id AND s.item_id = m.item_id
        WHERE m.provider_id = ${this.id} AND s.path IS NOT NULL AND s.path <> ''
          AND m.item_id IN (${sql.join(
            itemIds.map((id) => sql`${id}`),
            sql`, `
          )})
      `)
    const versionById = new Map(versions.map((record) => [record.itemId, record]))
    const candidateById = new Map(
      candidates.map((candidate) => [candidate.record.itemId, candidate])
    )
    const filesystemPaths = versions.flatMap((record) => {
      const filePath = path.isAbsolute(record.itemId)
        ? record.itemId
        : candidateById.get(record.itemId)?.record.filesystemPath
      return filePath ? [filePath] : []
    })
    const existing = await this.findIncrementalDeleteRecords(filesystemPaths)
    const catalogPaths = new Set(existing.map((row) => row.path))
    if (!this.canContinueFileMaintenance(options)) return
    await this.withFileMutationSlice(options, async (mutationLeaseId) => {
      const authorized = new Map<string, ExpectedMissingFileSearchRecord>()
      const retired = new Set<string>()
      const roots = new Map<string, Promise<boolean>>()
      const configurationGeneration = this.watchConfigurationGeneration
      const removalOptions: FileRecordRemovalOptions = {
        maintenance: true,
        signal: options.signal ?? this.maintenanceAbortController.signal,
        isStillCurrent: () => this.watchConfigurationGeneration === configurationGeneration
      }
      for (const candidate of candidates) {
        options.signal?.throwIfAborted()
        const observed = candidate.record
        const current = versionById.get(observed.itemId)
        if (!current) {
          if (observed.ftsRowid != null && observed.documentHash) retired.add(candidate.taskId)
          continue
        }
        const filePath = path.isAbsolute(current.itemId) ? current.itemId : observed.filesystemPath
        if (candidate.reason === 'path-rekey') {
          if (!filePath || normalizeFsPath(filePath) === filePath) {
            retired.add(candidate.taskId)
            continue
          }
          const canonicalPath = normalizeFsPath(filePath)
          const rows = await this.dbUtils!.getFileIndexReadDb()
            .select()
            .from(filesSchema)
            .where(and(eq(filesSchema.path, canonicalPath), eq(filesSchema.type, 'file')))
            .limit(1)
          if (rows.length === 0) continue
          await this.deps.getRuntimeMutationDelegate().applyBatch({
            sourceId: this.id,
            mutationLeaseId,
            records: rows.map((record) => this.deps.mapRecord(record))
          })
          if (
            current.ftsRowid != null &&
            current.documentHash &&
            current.path === filePath.toLowerCase()
          ) {
            authorized.set(current.itemId, { ...current, path: filePath })
          }
          continue
        }
        if (filePath && catalogPaths.has(filePath)) {
          retired.add(candidate.taskId)
          continue
        }
        if (
          observed.ftsRowid != null &&
          observed.documentHash &&
          (observed.ftsRowid !== current.ftsRowid ||
            observed.documentHash !== current.documentHash ||
            observed.updatedAt !== current.updatedAt)
        ) {
          retired.add(candidate.taskId)
          continue
        }
        if (filePath && current.path !== filePath.toLowerCase()) continue
        // FTS.path is folded for search. Unknown-case legacy paths cannot
        // provide disk absence evidence on a case-sensitive volume.
        const targetPath = filePath ?? current.path
        const outside = filePath
          ? !this.deps.isWithinWatchRoots(filePath) || this.isStaleExcludedIndexPath(filePath)
          : !this.watchPaths.some((root) => {
              const key = this.deps
                .normalizePath(root)
                .toLowerCase()
                .replace(/[\\/]+$/, '')
              const target = this.deps.normalizePath(current.path).toLowerCase()
              return target === key || target.startsWith(`${key}/`)
            })
        if (!outside) {
          if (!filePath) continue
          const evidence = await this.getFileAbsenceEvidence(filePath, roots, true)
          if (evidence === 'present') {
            retired.add(candidate.taskId)
            continue
          }
          if (evidence !== 'missing') continue
        }
        if (current.ftsRowid == null || !current.documentHash) continue
        authorized.set(current.itemId, { ...current, path: targetPath })
      }
      const result =
        authorized.size === 0
          ? { deletedRecords: [], removedIndexedItems: 0, commitId: null, deferred: false }
          : this.deps.isSplitEnabled()
            ? await this.deps
                .getFilePersistencePort()
                .removeMissingFileSearchRecords(this.id, [...authorized.values()], removalOptions)
            : await removeMissingFileSearchRecordsInPrimaryHome(
                this.dbUtils!.getFileIndexReadDb(),
                this.searchIndex!,
                this.id,
                [...authorized.values()],
                removalOptions
              )
      if (result.deferred) return
      if (
        result.commitId &&
        !(await this.publishFileDeletionReceipt(
          {
            commitId: result.commitId,
            sourceId: this.id,
            deletedRecords: result.deletedRecords,
            removedIndexedItems: result.removedIndexedItems
          },
          mutationLeaseId,
          options
        ))
      )
        return
      const actualIds = new Set(result.deletedRecords.map((record) => record.itemId))
      await this.removeFileMaintenanceWork(
        candidates
          .filter(
            (candidate) => actualIds.has(candidate.record.itemId) || retired.has(candidate.taskId)
          )
          .map((candidate) => candidate.taskId)
      )
    })
  }

  public scheduleFileMaintenance(): void {
    if (this.shuttingDown || this.maintenanceTimer) return
    const delayMs = resolveFileMaintenanceDelayMs(
      this.deps.getRecentEventLoopLag?.() ?? null,
      Date.now()
    )
    this.maintenanceTimer = setTimeout(() => {
      this.maintenanceTimer = null
      if (this.shuttingDown) return
      if (this.isInitializing || this.maintenanceRun) {
        this.scheduleFileMaintenance()
        return
      }
      const controller = new AbortController()
      this.maintenanceRunAbortController = controller
      const signal = AbortSignal.any([controller.signal, this.maintenanceAbortController.signal])
      const run = (async () => {
        await waitForIndexMaintenanceIdle(signal)
        const options: FileIndexRunOptions = {
          maintenance: true,
          signal,
          maintenanceDeadlineAt: performance.now() + FILE_MAINTENANCE_ROUND_BUDGET_MS
        }
        if (!(await this.replayPendingFileDeletionCommits(options))) {
          this.scheduleFileMaintenance()
          return
        }
        if (this.maintenanceCleanupNext && this.maintenanceCleanupPending) {
          const cleanup = await this.cleanupDeleteService.execute(options)
          this.maintenanceCleanupPending = !cleanup.done
          this.scheduleFileMaintenance()
        } else if (this.dbUtils) {
          const reason = this.maintenanceWorkReason
          const tasks = await this.dbUtils.getFileIndexReadDb().all<FileMaintenanceWork>(sql`
              SELECT rowid AS rowId, task_id AS taskId, source_id AS sourceId, reason,
                     file_path AS filePath, expected_record AS expectedRecord, cursor
              FROM search_index_file_maintenance
              WHERE source_id = ${this.id} AND reason = ${reason}
                AND rowid > ${this.maintenanceWorkAfterRowId[reason]}
              ORDER BY rowid LIMIT ${FILE_MAINTENANCE_SLICE_SIZE}
            `)
          if (tasks.length === 0) this.maintenanceWorkAfterRowId[reason] = 0
          if (reason === 'orphan-search' || reason === 'path-rekey') {
            await this.runOrphanSearchMaintenance(tasks, options)
            if (tasks.length > 0)
              this.maintenanceWorkAfterRowId[reason] = tasks[tasks.length - 1].rowId
          } else {
            for (const task of tasks) {
              if (!this.canContinueFileMaintenance(options)) break
              if (reason === 'missing-root' || reason === 'filter-root') {
                await this.runMissingFileMaintenance(
                  task.taskId,
                  task.filePath,
                  options,
                  reason === 'filter-root' ? 'configuration' : 'missing'
                )
              } else {
                if (!task.expectedRecord)
                  throw new Error('FILE_MAINTENANCE_EXPECTED_RECORD_REQUIRED')
                const record = JSON.parse(task.expectedRecord) as ExpectedFileRecord
                const result = await this.deleteFileRecords([record], 'missing', options)
                if (!result.deferred) await this.removeFileMaintenanceWork([task.taskId])
              }
              this.maintenanceWorkAfterRowId[reason] = task.rowId
            }
          }
          this.maintenanceWorkReason = NEXT_FILE_MAINTENANCE_REASON[reason]
          const pending = await this.dbUtils
            .getFileIndexReadDb()
            .select({ taskId: searchIndexFileMaintenance.taskId })
            .from(searchIndexFileMaintenance)
            .where(eq(searchIndexFileMaintenance.sourceId, this.id))
            .limit(1)
          if (this.maintenanceCleanupPending || pending.length > 0) this.scheduleFileMaintenance()
        }
        this.maintenanceCleanupNext = !this.maintenanceCleanupNext
      })()
      this.maintenanceRun = run
      void run
        .catch((error) => {
          if (!signal.aborted) {
            this.deps.logWarn('File maintenance round failed; durable work retained', error)
            this.scheduleFileMaintenance()
          }
        })
        .finally(() => {
          if (this.maintenanceRun === run) this.maintenanceRun = null
          if (this.maintenanceRunAbortController === controller)
            this.maintenanceRunAbortController = null
        })
    }, delayMs)
    this.maintenanceTimer.unref?.()
  }
}
