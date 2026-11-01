import type {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  OpenerInfo,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { StreamContext } from '@talex-touch/utils/transport/main'
import type {
  FileIndexAddPathResult,
  FileIndexBatteryStatus,
  FileIndexContentSettings,
  FileIndexFailedFilesResult,
  FileIndexProgress as FileIndexProgressPayload,
  FileIndexRebuildRequest,
  FileIndexRebuildResult,
  FileIndexStats
} from '@talex-touch/utils/transport/events/types'
import type {
  IndexedFileSourceRecordRow,
  IndexedSourceDelta,
  IndexedSourceEvidence,
  IndexedSourceRecord,
  IndexedSourceRecordBatch,
  IndexedSourceReconcileRequest,
  IndexedSourceReconcileResult,
  IndexedSourceResetRequest,
  IndexedSourceResetResult,
  IndexedSourceScanRequest,
  IndexedSourceWatchEvent,
  IndexedWorkerScheduleResult
} from '@talex-touch/utils/search'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../../db/schema'
import type { SearchIndexService } from '../../search-engine/search-index-service'
import type { ProviderContext } from '../../search-engine/types'
import { executeIndexedFile } from './services/file-provider-execution-service'
import {
  DEFAULT_FILE_INDEX_SETTINGS,
  FILE_CONTENT_INDEX_POLICY_VERSION,
  type FileIndexSettings,
  type ScannedFileInfo
} from './types'
import type { IndexWorkerFileResult } from './workers/file-index-worker-client'
import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { StorageList, TuffInputType } from '@talex-touch/utils'
import { fileFilterService } from '@talex-touch/utils/common/file-filter-service'
import { runAdaptiveTaskQueue } from '@talex-touch/utils/common/utils'
import { OpenerEvents } from '@talex-touch/utils/transport/events'

import { getTuffTransportMain, type ITuffTransportMain } from '@talex-touch/utils/transport/main'
import {
  IndexedWriteFlushSnapshotService,
  IndexedSourceResetReasons,
  IndexedSourceScanReasons,
  mapIndexedFileSourceRecord,
  resolveIndexedWatchRootSet
} from '@talex-touch/utils/search'
import { and, eq, gt, inArray } from 'drizzle-orm'
import { app } from 'electron'
import { notificationModule } from '../../../notification'
import { operationalErrorService } from '../../../observability'
import { t } from '../../../../utils/i18n-helper'
import emptyOpenerSvg from '../../../../../renderer/src/assets/svg/EmptyAppPlaceholder.svg?raw'
import { dbWriteScheduler } from '../../../../db/db-write-scheduler'
import { scheduleDbWrite } from '../../../../db/db-write'
import { fileIndexProgress, files as filesSchema, fileTypeIs } from '../../../../db/schema'
import { isSqliteBusyError } from '../../../../db/sqlite-retry'
import { createDbUtils } from '../../../../db/utils'
import { appTaskGate } from '../../../../service/app-task-gate'
import { deviceIdleService } from '../../../../service/device-idle-service'
import { formatDuration } from '../../../../utils/logger'
import { enterPerfContext } from '../../../../utils/perf-context'
import { getMainConfig, saveMainConfig } from '../../../storage'
import {
  chunkArray,
  getTypeTagsForExtension,
  KEYWORD_MAP,
  WHITELISTED_EXTENSIONS
} from './constants'
import { normalizeFsPath } from '@talex-touch/utils/common/file-scan-utils'
import { getFileTraversalExclusionReason, getScanChildExclusionReason } from './utils'
import { FileIndexWorkerClient } from './workers/file-index-worker-client'
import { FileReconcileWorkerClient } from './workers/file-reconcile-worker-client'
import { FileScanWorkerClient } from './workers/file-scan-worker-client'
import { EmbeddingService } from './embedding-service'
import { iconService } from '../../../../service/icon-service'
import { ThumbnailWorkerClient } from './workers/thumbnail-worker-client'
import {
  createIndexedFileAssetLookup,
  registerFileAssetBridge,
  sanitizeIndexedFileExtensions
} from './file-asset-bridge'
import { AdaptiveBatchScheduler } from '../../search-engine/adaptive-batch-scheduler'
import type { IndexedWriteDeleteExecutorResult } from '../../search-engine/indexing-write-delete-executor-service'
import {
  IndexedWriteInsertExecutorService,
  IndexedWriteUpdateExecutorService
} from '@talex-touch/utils/search'
import type { FilePersistencePort, UpsertFileRecord } from '../../search-engine/search-index-writer'
import { searchIndexWriter } from '../../search-engine/search-index-writer'
import { waitForIndexMaintenanceIdle } from '../../search-engine/search-activity'
import { isIndexingSourceMutationLeaseInvalidError } from '../../search-engine/indexing-source-mutation-gate'
import {
  FileProviderProgressStateService,
  FileProviderProgressStreamPublisher
} from './services/file-provider-progress-stream-service'
import {
  FileProviderWorkerStatusService,
  type FileProviderWorkerStatusSnapshot
} from './services/file-provider-worker-status-service'
import {
  getWatchDepthForPath as resolveWatchDepthForPath,
  normalizeWatchPath
} from './services/file-provider-path-service'
import { FileProviderWatchService } from './services/file-provider-watch-service'
import { FILE_WATCH_SUBTREE_RECONCILE_REASON } from './services/file-watch-subtree-service'
import { FileProviderWatchSubtreeReconcileService } from './services/file-provider-watch-subtree-reconcile-service'
import {
  FileProviderSubtreePersistService,
  readFileRowsByPath
} from './services/file-provider-subtree-persist-service'
import { FileProviderOpenerService } from './services/file-provider-opener-service'
import {
  FileProviderIncrementalQueueService,
  type FileProviderIncrementalAction,
  type FileProviderIncrementalEntry
} from './services/file-provider-incremental-queue-service'
import { FileProviderIncrementalWritePlannerService } from './services/file-provider-incremental-write-planner-service'
import {
  FileProviderIncrementalWriteService,
  type FileProviderIncrementalChangeEntry
} from './services/file-provider-incremental-write-service'
import { FileProviderEmbeddingIndexService } from './services/file-provider-embedding-index-service'
import { FileProviderIndexRuntimeService } from './services/file-provider-index-runtime-service'
import { computeFileIndexStats } from './services/file-provider-index-stats'
import {
  buildFileProviderRuntimeEvidence,
  buildIndexWorkerWorkload,
  recordRuntimeWriteFailureSnapshot,
  recordRuntimeWriteSnapshot,
  type FileProviderIndexBacklogSnapshot
} from './services/file-provider-runtime-evidence'
import {
  FileProviderIntegrityService,
  type FileProviderIntegritySnapshot
} from './services/file-provider-integrity-service'
import { FileProviderRuntimeResetService } from './services/file-provider-runtime-reset-service'
import { FileProviderScanProgressService } from './services/file-provider-scan-progress-service'
import { FileProviderEnrichmentResumeService } from './services/file-provider-enrichment-resume-service'
import { FileProviderContentIndexPolicyService } from './services/file-provider-content-index-policy-service'
import { FileProviderContentCapacityService } from './services/file-provider-content-capacity-service'
import { classifyRunFailure, isIndexFullFailure } from './services/file-provider-run-failure'
import { FileProviderBootPassService } from './services/file-provider-boot-pass-service'
import { FileProviderIndexRowStore } from './services/file-provider-index-row-store'
import {
  fileProviderLog,
  logFileProviderDebug,
  logFileProviderError,
  logFileProviderInfo,
  logFileProviderWarn
} from './file-provider-log'
import { getStartupDegradeWindowRemainingMs } from '../../../../db/runtime-flags'
import { FileProviderWriteSideEffectService } from './services/file-provider-write-side-effect-service'
import { FileProviderExtensionService } from './services/file-provider-extension-service'
import {
  FileProviderIndexingProgressService,
  type FileProviderIndexingProgressResult
} from './services/file-provider-indexing-progress-service'
import { FileProviderIndexSchedulerService } from './services/file-provider-index-scheduler-service'
import type { FileProviderIndexSchedulerFile } from './services/file-provider-index-scheduler-service'
import { isIndexWorkerFileMissing } from './workers/index-worker-read-failure'
import { FileProviderReconciliationInsertService } from './services/file-provider-reconciliation-insert-service'
import {
  FileProviderMaintenanceService,
  FILE_MAINTENANCE_ROUND_BUDGET_MS,
  FILE_MAINTENANCE_SLICE_SIZE
} from './services/file-provider-maintenance-service'
import {
  FileProviderFullScanInsertService,
  type FileProviderFullScanPersistResult
} from './services/file-provider-full-scan-insert-service'
import { FileProviderFullScanRunService } from './services/file-provider-full-scan-run-service'
import {
  FileProviderFullScanCheckpointService,
  listScanChildDirectories
} from './services/file-provider-full-scan-checkpoint-service'
import { FileProviderReconciliationDiffService } from './services/file-provider-reconciliation-diff-service'
import {
  FileProviderReconciliationRunService,
  getReconciliationFileRecordsPage,
  type FileProviderReconciliationDbRecord
} from './services/file-provider-reconciliation-run-service'
import { FileProviderReconciliationUpdateService } from './services/file-provider-reconciliation-update-service'
import { FileProviderScanStrategyService } from './services/file-provider-scan-strategy-service'
import { FileProviderAssetService } from './services/file-provider-asset-service'
import { FileProviderSearchResultService } from './services/file-provider-search-result-service'
import { FileProviderSearchItemService } from './services/file-provider-search-item-service'
import {
  FileProviderScanStreamService,
  streamDirectoryBatchesDirect,
  type DirectoryBatchStream
} from './services/file-provider-scan-stream-service'
import FileSystemWatcher from '../../file-system-watcher'
import {
  createFileIndexSyncStats,
  filterFileIndexCandidatesByProgress,
  type FileIndexedSourceRuntimeMutationDelegate,
  type FileIndexedSourceRuntimeResetDelegate,
  type FileIndexedSourceScanResult,
  type FileIndexRunOptions,
  type FileIndexSyncStats,
  type FileProviderRuntimeWriteSnapshot,
  type FileUpdateRecord
} from './file-provider-index-contracts'
import { resolveFileProviderBaseWatchPaths } from './file-provider-watch-paths'

const FILE_ICON_WRITE_MAX_QUEUE = 24
/**
 * How long one `getIndexStats()` snapshot serves every caller.
 *
 * Six `COUNT(*)` queries cost ~36 ms against a live index, and each file-system watch event asks
 * for diagnostics — so a burst of watch events used to issue a burst of scans on the main thread.
 * One second is set by the readers (progress, health, evidence), all of which poll slower than
 * that and none of which can act on a sub-second difference in the counts.
 */
const FILE_INDEX_STATS_CACHE_MS = 1_000
/** Extra breathing room after the DB startup degrade window (contracts §7). */

const FILE_PROVIDER_BASE_WATCH_PATHS_ENV = 'TUFF_FILE_PROVIDER_BASE_WATCH_PATHS'

const EMPTY_OPENER_LOGO = `data:image/svg+xml;utf8,${encodeURIComponent(emptyOpenerSvg.trim())}`

/**
 * Stable public classification for a failed indexed file. The raw parser or
 * SQLite error text stays in main-process diagnostics; only the code crosses.
 */
function classifyFailedFileIndexError(lastError: string | null): string | null {
  if (!lastError) return null
  return lastError.includes('SQLITE_BUSY') ? 'FILE_INDEX_DATABASE_BUSY' : 'FILE_INDEX_ITEM_FAILED'
}

// class ProgressLogger {
//   private processed = 0
//   private lastLoggedAt = 0
//   private readonly startTime = performance.now()

//   constructor(
//     private readonly label: string,
//     private readonly total: number,
//     private readonly logFn: (message: string) => void,
//     private readonly intervalMs = 5_000
//   ) {}

//   advance(by: number): void {
//     if (by <= 0) {
//       return
//     }
//     this.processed = Math.min(this.processed + by, this.total)
//     this.maybeLog()
//   }

//   finish(): void {
//     this.maybeLog(true)
//   }

//   private maybeLog(force = false): void {
//     const now = performance.now()
//     if (!force && this.processed < this.total && now - this.lastLoggedAt < this.intervalMs) {
//       return
//     }

//     this.lastLoggedAt = now
//     const safeTotal = this.total || 0
//     const percent = safeTotal > 0 ? Math.min(100, (this.processed / safeTotal) * 100) : 100
//     const elapsedSec = (now - this.startTime) / 1000
//     const totalDisplay = safeTotal > 0 ? safeTotal.toString() : '–'

//     const progress = `${this.label} ${this.processed}/${totalDisplay} (${percent.toFixed(
//       1
//     )}%) elapsed ${elapsedSec.toFixed(1)}s`
//     this.logFn(progress)
//   }
// }

const FILE_INDEX_SEARCH_DRAIN_TIMEOUT_MS = 30_000
const FILE_INDEX_SEARCH_DRAIN_INTERVAL_MS = 100

export { resolveFileProviderBaseWatchPaths }

class FileProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'file-provider'
  readonly name = 'File Provider'
  readonly type = 'file' as const
  readonly supportedInputTypes = [TuffInputType.Text, TuffInputType.Files]
  readonly priority = 'deferred' as const

  private dbUtils: ReturnType<typeof createDbUtils> | null = null
  private isInitializing: Promise<FileIndexSyncStats> | null = null
  private initializationFailed: boolean = false
  /** Stable public failure projection of the last indexing run failure. */
  private initializationFailure: { code: string; retryable: boolean; reportId: string } | null =
    null
  private initializationContext: ProviderContext | null = null
  private readonly baseWatchPaths: string[]
  private watchPaths: string[]
  private databaseFilePath: string | null = null
  private searchIndex: SearchIndexService | null = null
  private embeddingService: EmbeddingService | null = null
  /** AIMD adaptive batch scheduler for flush operations — persists across flushes. */
  private readonly flushBatchScheduler = new AdaptiveBatchScheduler({
    initialSize: 5,
    maxSize: 20,
    targetMs: 400,
    minSize: 2,
    ssthresh: 10
  })
  /** AIMD adaptive batch scheduler for fullScan upsert — persists across scans. */
  private readonly upsertBatchScheduler = new AdaptiveBatchScheduler({
    initialSize: 5,
    maxSize: 10,
    targetMs: 300,
    minSize: 2,
    ssthresh: 10
  })
  private watchPathsRegistered = false
  private readonly isCaseInsensitiveFs =
    process.platform === 'darwin' || process.platform === 'win32'
  private readonly timestampToleranceMs = 1_000

  private openersChannelRegistered = false
  private readonly progressStream = new FileProviderProgressStreamPublisher()
  private readonly progressState = new FileProviderProgressStateService(this.progressStream)
  private readonly fileScanWorker = new FileScanWorkerClient()
  private readonly reconcileWorker = new FileReconcileWorkerClient()
  private readonly fileIndexWorker: FileIndexWorkerClient
  private readonly scanStreamService = new FileProviderScanStreamService({
    scanBatches: (...args) => this.fileScanWorker.scanBatches(...args),
    waitForIdle: () => appTaskGate.waitForIdle(),
    scanDirect: (...args) => this.scanDirectoryBatchesDirectStream(...args),
    logInfo: (message, meta) => this.logInfo(message, meta),
    logWarn: (message, error, meta) => this.logWarn(message, error, meta)
  })
  private readonly indexRowStore = new FileProviderIndexRowStore({
    sourceId: this.id,
    getDbUtils: () => this.dbUtils,
    isSearchSplitEnabled: () => this.isSearchSplitEnabledNow(),
    ensurePortReady: (reason) => this.ensureSearchIndexWorkerReady(reason),
    getPort: () => this.requireFilePersistencePort(),
    logDebug: (message, meta) => this.logDebug(message, meta)
  })
  private readonly thumbnailWorker = new ThumbnailWorkerClient()
  private disposeAssetBridge: (() => void) | null = null

  private filePersistencePort: FilePersistencePort | null = null
  private filePersistenceReady: Promise<boolean> | null = null
  private backgroundStartupPromise: Promise<void> | null = null
  private backgroundStartupReady = false
  private backgroundStartupError: Error | null = null
  /** Stable public projection of the last background startup failure. */
  private backgroundStartupFailure: { code: string; retryable: boolean; reportId: string } | null =
    null
  private readonly workerStatusService = new FileProviderWorkerStatusService()
  private workerDiagnosticsStarted = false
  private readonly pendingIndexWorkerResults = new Map<number, IndexWorkerFileResult>()
  private readonly inflightIndexWorkerResults = new Map<number, IndexWorkerFileResult>()
  private readonly cancelledIndexWorkerMutationLeases = new Set<string>()
  private manualRebuildPendingNotification = false
  private shuttingDown = false
  private indexRunAbortController: AbortController | null = null
  private indexRunSource: 'auto' | 'manual' | null = null
  private lastIntegritySnapshot: FileProviderIntegritySnapshot | null = null
  private indexedSourceRuntimeResetDelegate: FileIndexedSourceRuntimeResetDelegate | null = null
  private indexedSourceRuntimeMutationDelegate: FileIndexedSourceRuntimeMutationDelegate | null =
    null

  private fileIndexSettings: FileIndexSettings = { ...DEFAULT_FILE_INDEX_SETTINGS }

  private async waitForCacheWriteCapacity(maxQueued: number, label: string): Promise<boolean> {
    try {
      await dbWriteScheduler.waitForCapacity(maxQueued)
      return true
    } catch (error) {
      this.logWarn('Skipped cache write after DB backpressure failure', error, { label })
      return false
    }
  }

  private readonly enableFileIconExtraction =
    (process.env.TALEX_FILE_PROVIDER_EXTRACT_ICONS ?? 'true').toLowerCase() !== 'false'
  private readonly watchService: FileProviderWatchService
  private readonly watchSubtreeReconcileService: FileProviderWatchSubtreeReconcileService
  private readonly subtreePersistService: FileProviderSubtreePersistService
  private readonly openerService: FileProviderOpenerService
  private readonly indexRuntimeService: FileProviderIndexRuntimeService
  private readonly integrityService: FileProviderIntegrityService
  private readonly runtimeResetService: FileProviderRuntimeResetService
  private readonly scanProgressService: FileProviderScanProgressService
  private readonly scanStrategyService: FileProviderScanStrategyService
  private readonly incrementalQueueService: FileProviderIncrementalQueueService
  private readonly incrementalWritePlanner: FileProviderIncrementalWritePlannerService
  private readonly incrementalWriteService: FileProviderIncrementalWriteService<
    typeof filesSchema.$inferInsert,
    typeof filesSchema.$inferSelect,
    typeof filesSchema.$inferSelect,
    typeof filesSchema.$inferSelect
  >
  private readonly writeSideEffectService: FileProviderWriteSideEffectService<
    typeof filesSchema.$inferSelect
  >
  private readonly extensionService: FileProviderExtensionService
  private readonly indexingProgressService: FileProviderIndexingProgressService
  private readonly fileUpdateExecutor: IndexedWriteUpdateExecutorService<
    FileUpdateRecord,
    typeof filesSchema.$inferSelect
  >
  private readonly incrementalInsertExecutor: IndexedWriteInsertExecutorService<
    typeof filesSchema.$inferInsert,
    typeof filesSchema.$inferSelect
  >
  private readonly incrementalPersistSnapshotService =
    new IndexedWriteFlushSnapshotService<FileProviderRuntimeWriteSnapshot>()
  private readonly ftsWriteSnapshotService =
    new IndexedWriteFlushSnapshotService<FileProviderRuntimeWriteSnapshot>()
  private readonly ftsDeleteSnapshotService =
    new IndexedWriteFlushSnapshotService<FileProviderRuntimeWriteSnapshot>()
  private readonly fullScanCheckpointService: FileProviderFullScanCheckpointService
  private readonly fullScanRunService: FileProviderFullScanRunService<
    FileIndexRunOptions | undefined
  >
  private readonly fullScanInsertService: FileProviderFullScanInsertService<
    FileIndexRunOptions | undefined
  >
  private readonly reconciliationDiffService: FileProviderReconciliationDiffService
  private readonly reconciliationUpdateService: FileProviderReconciliationUpdateService<
    FileUpdateRecord,
    FileIndexRunOptions | undefined
  >
  private readonly reconciliationInsertService: FileProviderReconciliationInsertService<
    FileIndexRunOptions | undefined
  >
  private readonly reconciliationRunService: FileProviderReconciliationRunService<
    FileIndexRunOptions | undefined
  >
  private readonly indexSchedulerService: FileProviderIndexSchedulerService
  private readonly enrichmentResumeService: FileProviderEnrichmentResumeService
  private readonly contentIndexPolicyService: FileProviderContentIndexPolicyService
  private readonly embeddingIndexService = new FileProviderEmbeddingIndexService({
    checkContentCapacity: () => this.contentIndexPolicyService.checkAdmission(),
    isPathAdmitted: (filePath) => this.isSearchPathAdmitted(filePath),
    getEmbeddingService: () => this.embeddingService ?? null,
    logDebug: (m, meta) => this.logDebug(m, meta)
  })
  public readonly assetService: FileProviderAssetService
  private readonly searchResultService: FileProviderSearchResultService
  private readonly searchItemService: FileProviderSearchItemService
  private readonly maintenanceService = new FileProviderMaintenanceService({
    sourceId: this.id,
    getDbUtils: () => this.dbUtils,
    getSearchIndex: () => this.searchIndex,
    getFilePersistencePort: () => this.requireFilePersistencePort(),
    getRuntimeMutationDelegate: () => this.requireRuntimeMutationDelegate(),
    isSplitEnabled: () => this.isSearchSplitEnabledNow(),
    isShuttingDown: () => this.shuttingDown,
    isInitializing: () => this.isInitializing !== null,
    isWithinWatchRoots: (filePath) => this.isWithinWatchRoots(filePath),
    normalizePath: (filePath) => this.normalizePath(filePath),
    mapRecord: (record) => this.mapFileToIndexedSourceRecord(record),
    onBaseCommitReady: () => this.enrichmentResumeService.resume('base-maintenance-commit'),
    onCapacityEvicted: () => {
      if (isIndexFullFailure(this.initializationFailure)) this.initializationFailure = null
      void this.runAutoIndexing()
    },
    emitCleanupProgress: (current, total) => {
      if (this.isInitializing !== null) {
        this.progressState.emit('cleanup', current, total)
      }
    },
    logInfo: (message, metadata) => this.logInfo(message, metadata),
    logDebug: (message, metadata) => this.logDebug(message, metadata),
    logWarn: (message, error, metadata) => this.logWarn(message, error, metadata)
  })
  private readonly bootPassService = new FileProviderBootPassService({
    sourceId: this.id,
    getDbUtils: () => this.dbUtils,
    isShuttingDown: () => this.shuttingDown,
    isSearchSplitEnabled: () => this.isSearchSplitEnabledNow(),
    isRuntimeReady: () => Boolean(this.dbUtils && this.indexedSourceRuntimeMutationDelegate),
    getRuntimeMutationDelegate: () => this.requireRuntimeMutationDelegate(),
    getMaintenance: () => this.maintenanceService,
    getWatchPaths: () => this.watchPaths,
    countIndexedRows: (reason) => this.countSearchIndexByProvider(this.id, reason),
    mapRecord: (row) => this.mapFileToIndexedSourceRecord(row),
    emitRecordBatch: (batch) => this.emitIndexedSourceRecordBatchFromBatch(batch),
    logInfo: (message, meta) => this.logInfo(message, meta),
    logDebug: (message, meta) => this.logDebug(message, meta),
    logWarn: (message, error, meta) => this.logWarn(message, error, meta)
  })

  constructor() {
    this.baseWatchPaths = resolveFileProviderBaseWatchPaths({
      envValue: process.env[FILE_PROVIDER_BASE_WATCH_PATHS_ENV],
      getPath: (name) => app.getPath(name),
      onPathError: (name, error) => {
        this.logWarn('Could not resolve system path; skipping', error, {
          pathKey: name
        })
      }
    })
    const rootSet = resolveIndexedWatchRootSet({
      basePaths: this.baseWatchPaths,
      normalizePath: (rawPath) => this.normalizePath(rawPath)
    })
    this.watchPaths = rootSet.paths
    this.watchService = new FileProviderWatchService({
      baseWatchPaths: this.baseWatchPaths,
      getDbUtils: () => this.dbUtils,
      getWatchDepthForPath: resolveWatchDepthForPath,
      normalizePath: (rawPath) => this.normalizePath(rawPath),
      runAutoIndexing: () => this.runAutoIndexing(),
      logDebug: (message, meta) => this.logDebug(message, meta),
      logWarn: (message, error, meta) => this.logWarn(message, error, meta),
      logError: (message, error, meta) => this.logError(message, error, meta),
      // Resolved per call (never captured): the failed-files cleanup task
      // reads file_index_progress from the split-aware home, so its deletes
      // must route to the SAME home — through the worker when the split is
      // on. Leaving these unwired would read search-home ids and delete
      // primary rows by those ids (cross-home id collision).
      isSearchSplitEnabled: () =>
        Boolean(this.initializationContext?.databaseManager.isSearchSplitEnabled()),
      execSearchIndexWrite: async (statements, mode) =>
        await searchIndexWriter.execWrite(statements, mode)
    })
    this.assetService = new FileProviderAssetService({
      getDbUtils: () => this.dbUtils,
      withDbWrite: (label, operation) =>
        this.isSearchSplitEnabledNow() ? operation() : scheduleDbWrite(label, operation),
      waitForWriteCapacity: (maxQueued, label) =>
        this.isSearchSplitEnabledNow()
          ? Promise.resolve(true)
          : this.waitForCacheWriteCapacity(maxQueued, label),
      waitForIdle: async () => {
        await appTaskGate.waitForIdle()
      },
      yieldToEventLoop: async () => await new Promise<void>((resolve) => setImmediate(resolve)),
      toTimestamp: (value) => this.toTimestamp(value),
      logDebug: (message, meta) => this.logDebug(message, meta),
      logWarn: (message, error, meta) => this.logWarn(message, error, meta),
      iconService,
      thumbnailWorker: this.thumbnailWorker,
      enableIconExtraction: this.enableFileIconExtraction,
      iconWriteMaxQueue: FILE_ICON_WRITE_MAX_QUEUE
    })
    const lookupIndexedFiles = createIndexedFileAssetLookup({
      getDbUtils: () => this.dbUtils,
      logWarn: (message, error, meta) => this.logWarn(message, error, meta)
    })
    // Spotlight, Everything and the recommendation engine render file rows this provider did not
    // hand them; through the bridge they get the index's thumbnails and the same lazy generation
    // search results have. See file-asset-bridge.ts.
    this.disposeAssetBridge = registerFileAssetBridge({
      lookupIndexedFiles,
      ensureThumbnail: (file, extensions) =>
        this.assetService.ensureThumbnail(file.id, file.path, file, extensions)
    })
    this.openerService = new FileProviderOpenerService({
      emptyLogo: EMPTY_OPENER_LOGO,
      enableFileIconExtraction: this.enableFileIconExtraction,
      getDbUtils: () => this.dbUtils,
      withDbWrite: (label, operation) => scheduleDbWrite(label, operation),
      getStoredOpeners: () => {
        const raw = getMainConfig(StorageList.OPENERS) as unknown
        return raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as Record<string, OpenerInfo>)
          : {}
      },
      saveStoredOpeners: (next) => saveMainConfig(StorageList.OPENERS, next),
      getFileIconPath: (filePath) => iconService.getFileIconPath(filePath),
      logWarn: (message, error, meta) => this.logWarn(message, error, meta),
      logError: (message, error, meta) => this.logError(message, error, meta)
    })
    this.runtimeResetService = new FileProviderRuntimeResetService({
      sourceId: this.id,
      getDbUtils: () => this.dbUtils,
      normalizePath: (rawPath) => this.normalizePath(rawPath),
      getScanProgressPaths: () => [...this.watchPaths],
      withDbWrite: (label, operation) =>
        scheduleDbWrite(label, operation, { priority: 'interactive', dropPolicy: 'none' }),
      logInfo: (message, meta) => this.logInfo(message, meta),
      // Resolved per call (never captured): the split decides whether the
      // scan_progress clear targets the worker-owned search file.
      isSearchSplitEnabled: () =>
        Boolean(this.initializationContext?.databaseManager.isSearchSplitEnabled()),
      execSearchIndexWrite: async (statements, mode) =>
        await searchIndexWriter.execWrite(statements, mode)
    })
    this.integrityService = new FileProviderIntegrityService({
      sourceId: this.id,
      countSearchIndexByProvider: (providerId, reason, mutationLeaseId) =>
        this.countSearchIndexByProvider(providerId, reason, mutationLeaseId),
      resetRuntimeState: async (request) => {
        return await this.resetFileIndexRuntimeStateViaIndexedRuntime({
          sourceId: this.id,
          reason: request.reason,
          clearSearchIndex: request.clearSearchIndex,
          clearScanProgress: request.clearScanProgress
        })
      },
      logInfo: (message, meta) => this.logInfo(message, meta),
      cleanupSource: async (sourceId, mutationLeaseId) =>
        await this.requireRuntimeMutationDelegate().cleanupSource(sourceId, mutationLeaseId)
    })
    this.scanProgressService = new FileProviderScanProgressService({
      getDbUtils: () => this.dbUtils,
      normalizePath: (rawPath) => this.normalizePath(rawPath),
      ensureSearchIndexWorkerReady: (reason) => this.ensureSearchIndexWorkerReady(reason),
      getSearchIndexWorker: () => this.requireFilePersistencePort(),
      isSearchSplitEnabled: () =>
        Boolean(this.initializationContext?.databaseManager.isSearchSplitEnabled()),
      execSearchIndexWrite: async (statements, mode) =>
        await searchIndexWriter.execWrite(statements, mode)
    })
    this.scanStrategyService = new FileProviderScanStrategyService({
      getCompletedPaths: (watchPaths) => this.scanProgressService.getCompletedPaths(watchPaths),
      normalizePath: (rawPath) => this.normalizePath(rawPath),
      yieldAfterRead: async () => {
        await new Promise<void>((resolve) => setImmediate(resolve))
      },
      now: () => performance.now(),
      formatDuration,
      logDebug: (message, meta) => this.logDebug(message, meta),
      logInfo: (message, meta) => this.logInfo(message, meta)
    })
    this.incrementalQueueService = new FileProviderIncrementalQueueService({
      normalizePath: (rawPath) => this.normalizePath(rawPath),
      isWithinWatchRoots: (rawPath) => this.isWithinWatchRoots(rawPath),
      prepareFlush: () => this.prepareIncrementalFlush(),
      processEntries: (entries) => this.processIncrementalEntries(entries),
      logError: (message, error, meta) => this.logError(message, error, meta)
    })
    this.incrementalWritePlanner = new FileProviderIncrementalWritePlannerService({
      normalizePath: (filePath) => this.normalizePath(filePath),
      timestampToleranceMs: this.timestampToleranceMs
    })
    this.incrementalWriteService = new FileProviderIncrementalWriteService({
      planner: this.incrementalWritePlanner,
      normalizePath: (filePath) => this.normalizePath(filePath),
      buildRecord: (rawPath, options) => this.buildFileRecord(rawPath, options),
      getExistingRows: async (paths) => {
        if (!this.dbUtils || paths.length === 0) return []
        // Split-aware home: the planner's insert-vs-update decision AND the
        // row ids embedded in its update records must come from the SAME file
        // the worker writes (search-index.db when the split is on). Reading
        // the primary here fed PRIMARY row ids into worker-side
        // updateFileMetadata — the 2d.3 cross-home id-collision hazard.
        return await this.dbUtils
          .getFileIndexReadDb()
          .select()
          .from(filesSchema)
          .where(inArray(filesSchema.path, paths))
      },
      insertRecords: (records) => this.insertIncrementalRecords(records),
      updateRecords: (records) => this._processFileUpdates(records, 10),
      logDebug: (message, meta) => this.logDebug(message, meta),
      logInfo: (message, meta) => this.logInfo(message, meta)
    })
    this.subtreePersistService = new FileProviderSubtreePersistService({
      sourceId: this.id,
      maintenance: this.maintenanceService,
      planner: this.incrementalWritePlanner,
      readRows: (paths) => readFileRowsByPath(this.dbUtils, paths),
      mapRecord: (row) => this.mapFileToIndexedSourceRecord(row),
      applyBatchWithPersistence: (batch, records) =>
        this.requireRuntimeMutationDelegate().applyBatchWithPersistence(batch, records),
      emitCommittedScanProgress: (count, options) => this.emitCommittedScanProgress(count, options)
    })
    this.watchSubtreeReconcileService = new FileProviderWatchSubtreeReconcileService({
      sourceId: this.id,
      getSearchIndex: () => this.searchIndex,
      getWatchPaths: () => this.watchPaths,
      isShuttingDown: () => this.shuttingDown,
      ensureFileSystemWatchers: () => this.ensureFileSystemWatchers(),
      isWithinWatchRoots: (rawPath) => this.isWithinWatchRoots(rawPath),
      getWatchDepthForPath: resolveWatchDepthForPath,
      mapFileToIndexedSourceRecord: (record) => this.mapFileToIndexedSourceRecord(record),
      scanDirectoryBatchesWithWorker: (dirPath, excludePathsSet, signal, onStats, options) =>
        this.scanDirectoryBatchesWithWorker(dirPath, excludePathsSet, signal, onStats, options),
      buildFileRecord: (rawPath, options) => this.buildFileRecord(rawPath, options),
      handleIncrementalDeletes: (paths, options) => this.handleIncrementalDeletes(paths, options),
      handleIncrementalAddsOrChanges: (entries, options) =>
        this.handleIncrementalAddsOrChanges(entries, options),
      deleteReconciledRecords: (records, options) =>
        this.maintenanceService.deleteFileRecords(records, 'missing', options),
      persistSubtreeRecords: (records, options) =>
        this.subtreePersistService.persist(records, options),
      pathAbsenceEvidence: (filePath) => this.maintenanceService.getFileAbsenceEvidence(filePath),
      isStaleIndexPath: (filePath) => this.maintenanceService.isStaleExcludedIndexPath(filePath),
      canContinue: (options) => this.maintenanceService.canContinueFileMaintenance(options),
      persistMissingScope: (scope) =>
        this.maintenanceService.enqueueFileMaintenanceWork([
          { reason: 'missing-root', filePath: scope }
        ]),
      getMissingCursor: (scope) =>
        this.maintenanceService.getFileMaintenanceCursor(
          this.maintenanceService.fileMaintenanceTaskId('missing-root', scope, null)
        ),
      saveMissingCursor: (scope, cursor) =>
        this.maintenanceService.setFileMaintenanceCursor(
          this.maintenanceService.fileMaintenanceTaskId('missing-root', scope, null),
          cursor
        ),
      finishMissingScope: (scope) =>
        this.maintenanceService.removeFileMaintenanceWork([
          this.maintenanceService.fileMaintenanceTaskId('missing-root', scope, null)
        ]),
      resumeMaintenance: () => this.maintenanceService.scheduleFileMaintenance()
    })
    this.extensionService = new FileProviderExtensionService({
      getDbUtils: () => this.dbUtils,
      isSearchSplitEnabledNow: () => this.isSearchSplitEnabledNow(),
      waitForCacheWriteCapacity: (maxQueue, label) =>
        this.waitForCacheWriteCapacity(maxQueue, label)
    })
    this.indexingProgressService = new FileProviderIndexingProgressService(() => this.dbUtils)
    this.writeSideEffectService = new FileProviderWriteSideEffectService({
      processFileExtensions: (files) => this.processFileExtensions(files),
      scheduleIndexing: (files, reason, mutationLeaseId) =>
        this.scheduleIndexing(files, reason, mutationLeaseId),
      logWarn: (message, error, meta) => this.logWarn(message, error, meta)
    })
    this.fileUpdateExecutor = new IndexedWriteUpdateExecutorService({
      waitBeforeChunk: async () => {
        if (!this.isSearchSplitEnabledNow()) await dbWriteScheduler.waitForCapacity(4)
      },
      updateChunk: (records) => this.indexRowStore.updateFileMetadataChunk(records),
      refreshUpdated: (records) => this.indexRowStore.refreshFileUpdateRecords(records),
      dispatchUpdated: (records) => {
        return this.writeSideEffectService.dispatch(records, {
          extensionContext: 'file-update',
          indexReason: 'file-update'
        })
      },
      runQueue: (chunks, handler, options) => runAdaptiveTaskQueue(chunks, handler, options),
      now: () => performance.now(),
      formatDuration,
      logDebug: (message, meta) => this.logDebug(message, meta),
      label: 'FileProvider::processFileUpdates'
    })
    this.incrementalInsertExecutor = new IndexedWriteInsertExecutorService({
      persist: (records) => this.indexRowStore.persistIncrementalRecords(records),
      dispatchInserted: (records) => {
        return this.writeSideEffectService.dispatch(records, {
          extensionContext: 'incremental',
          indexReason: 'incremental-insert'
        })
      },
      logDebug: (message, meta) => this.logDebug(message, meta),
      successMessage: 'Incremental index completed'
    })
    this.fullScanCheckpointService = new FileProviderFullScanCheckpointService({
      listChildDirectories: (rootPath, excludePathsSet) =>
        listScanChildDirectories(rootPath, {
          readdir: (directoryPath) => fs.readdir(directoryPath, { withFileTypes: true }),
          join: (root, name) => path.join(root, name),
          hooks: { getTraversalExclusionReason: getScanChildExclusionReason },
          excludePathsSet
        }),
      getCompletedPaths: (paths) => this.scanProgressService.getCompletedPaths(paths),
      recordCompleted: async (checkpointPath, reason) => {
        await this.scanProgressService.upsertCompletedPaths(
          [checkpointPath],
          new Date().toISOString(),
          reason
        )
      },
      clearCompleted: async (paths) => {
        if (!this.dbUtils) return
        await this.scanProgressService.deletePaths(this.dbUtils.getFileIndexReadDb(), paths)
      },
      normalizePath: (rawPath) => this.normalizePath(rawPath),
      logDebug: (message, meta) => this.logDebug(message, meta)
    })
    this.fullScanRunService = new FileProviderFullScanRunService({
      enterPerfContext: (label, metadata) => enterPerfContext(label, metadata),
      scanDirectory: (rootPath, currentExcludePathsSet, runOptions, onStats) =>
        this.scanDirectoryBatchesWithWorker(
          rootPath,
          currentExcludePathsSet,
          runOptions?.signal,
          onStats
        ),
      // Admitted before the paced chunks, so the files a full index refuses cost no pauses.
      insertRecords: async (rootPath, records, runOptions) =>
        this.fullScanInsertService.execute(
          rootPath,
          await this.maintenanceService.capacity.admit(records),
          runOptions
        ),
      emitProgress: (current, total) => this.progressState.emit('scanning', current, total),
      yieldAfterScan: async () => {
        await new Promise<void>((resolve) => setImmediate(resolve))
      },
      now: () => performance.now(),
      formatDuration,
      logDebug: (message, meta) => this.logDebug(message, meta),
      checkpoints: this.fullScanCheckpointService
    })
    this.fullScanInsertService = new FileProviderFullScanInsertService({
      getBatchSize: () => this.upsertBatchScheduler.currentSize,
      recordBatchDuration: (durationMs) => this.upsertBatchScheduler.recordDuration(durationMs),
      waitForIdle: async (runOptions) => {
        if (runOptions?.maintenance !== false) {
          await waitForIndexMaintenanceIdle(runOptions?.signal ?? this.maintenanceService.signal)
        }
      },
      persistAndEmitBatch: (records, runOptions) =>
        this.persistAndPublishFullScanBatch(records, runOptions),
      emitProgress: (current, total) => this.progressState.emit('indexing', current, total),
      sleep: async (durationMs, runOptions) => {
        const signal = runOptions?.signal ?? this.maintenanceService.signal
        signal.throwIfAborted()
        await new Promise<void>((resolve, reject) => {
          const finish = () => {
            clearTimeout(timer)
            signal.removeEventListener('abort', abort)
          }
          const abort = () => {
            finish()
            reject(signal.reason)
          }
          const timer = setTimeout(() => {
            finish()
            resolve()
          }, durationMs)
          signal.addEventListener('abort', abort, { once: true })
          if (signal.aborted) abort()
        })
      },
      now: () => performance.now(),
      formatDuration,
      logInfo: (message, meta) => this.logInfo(message, meta),
      logDebug: (message, meta) => this.logDebug(message, meta)
    })
    this.reconciliationDiffService = new FileProviderReconciliationDiffService({
      reconcileWithWorker: (diskFiles, dbFiles, reconciliationPaths) =>
        this.reconcileWorker.reconcile(diskFiles, dbFiles, reconciliationPaths),
      logWarn: (message, error, meta) => this.logWarn(message, error, meta)
    })
    this.reconciliationUpdateService = new FileProviderReconciliationUpdateService({
      persistAndPublish: (records, runOptions) => this.persistReconciledUpdates(records, runOptions)
    })
    this.reconciliationInsertService = new FileProviderReconciliationInsertService({
      persistAndPublish: (records, runOptions) =>
        this.persistAndPublishFullScanBatch(records, runOptions),
      emitProgress: (current, total) => this.progressState.emit('indexing', current, total)
    })
    this.reconciliationRunService = new FileProviderReconciliationRunService({
      enterPerfContext: (label, metadata) => enterPerfContext(label, metadata),
      waitForIdle: async (runOptions) => {
        if (runOptions?.maintenance !== false) {
          await waitForIndexMaintenanceIdle(runOptions?.signal ?? this.maintenanceService.signal)
        }
      },
      assertActive: (runOptions) => runOptions?.signal?.throwIfAborted(),
      getDbFilesByPaths: (paths, runOptions) =>
        this.getReconciliationDbFilesByPaths(paths, runOptions),
      hasRootRows: async (rootPath, runOptions) => {
        runOptions?.signal?.throwIfAborted()
        if (!this.dbUtils) throw new Error('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
        return (await getReconciliationFileRecordsPage(this.dbUtils, rootPath, 0, 1)).length > 0
      },
      getDeferralReason: () => this.bootPassService.getReconciliationDeferralReason(),
      scanDirectory: (rootPath, currentExcludePathsSet, runOptions, onStats) =>
        this.scanDirectoryBatchesWithWorker(
          rootPath,
          currentExcludePathsSet,
          runOptions?.signal,
          onStats
        ),
      reconcile: (diskFiles, dbFiles, paths) =>
        this.reconciliationDiffService.reconcile(diskFiles, dbFiles, paths),
      finishMissingScan: async (rootPath, runOptions, deadlineAt) => {
        const taskId = this.maintenanceService.fileMaintenanceTaskId('missing-root', rootPath, null)
        await this.maintenanceService.enqueueFileMaintenanceWork([
          { reason: 'missing-root', filePath: rootPath }
        ])
        const result = await this.maintenanceService.runMissingFileMaintenance(taskId, rootPath, {
          ...runOptions,
          maintenanceDeadlineAt: Math.min(
            runOptions?.maintenanceDeadlineAt ?? deadlineAt,
            deadlineAt
          )
        })
        if (!result.done) this.maintenanceService.scheduleFileMaintenance()
        return result
      },
      updateRecords: (records, runOptions) =>
        this.reconciliationUpdateService.execute(records, runOptions),
      insertRecords: (records, runOptions) =>
        this.reconciliationInsertService.execute(records, runOptions),
      emitProgress: (current, total) => this.progressState.emit('reconciliation', current, total),
      yieldAfterDbRead: async () => {
        await new Promise<void>((resolve) => setImmediate(resolve))
      },
      yieldAfterPathScan: async () => {
        await new Promise<void>((resolve) => setImmediate(resolve))
      },
      now: () => performance.now(),
      formatDuration,
      logDebug: (message, meta) => this.logDebug(message, meta),
      logWarn: (message, error, meta) => this.logWarn(message, error, meta)
    })
    this.indexSchedulerService = new FileProviderIndexSchedulerService({
      getDatabaseFilePath: () => this.databaseFilePath,
      getProviderId: () => this.id,
      getProviderType: () => this.type,
      getWatchPaths: () => this.watchPaths,
      normalizePath: (rawPath) => this.normalizePath(rawPath),
      indexFiles: async (dbPath, providerId, providerType, files) => {
        if (files.some((file) => !file.mutationLeaseId)) {
          throw new Error('FILE_INDEX_MUTATION_LEASE_REQUIRED')
        }
        // Deferred payloads own the next idle continuation, not another parser batch.
        if (!(await this.indexRuntimeService.waitForPersisted())) {
          for (const file of files) {
            if (file.mutationLeaseId) this.indexSchedulerService.cancelLease(file.mutationLeaseId)
          }
          return { processed: 0, failed: 0 }
        }
        if (!(await this.contentIndexPolicyService.checkAdmission())) {
          throw new Error('FILE_CONTENT_STORAGE_PAUSED')
        }
        return await this.fileIndexWorker.indexFiles(dbPath, providerId, providerType, files)
      },
      logWarn: (message, error, meta) => this.logWarn(message, error, meta)
    })
    this.enrichmentResumeService = new FileProviderEnrichmentResumeService({
      getSearchIndex: () => this.searchIndex,
      isShuttingDown: () => this.shuttingDown,
      isEnabled: () => this.contentIndexPolicyService.isAdmissionEnabled(),
      isImageEmbeddingReady: () => this.embeddingService?.isImageReady() ?? false,
      withMutationLease: async (operation) =>
        await this.requireRuntimeMutationDelegate().withMutationLease(operation, {
          maintenance: true,
          signal: this.maintenanceService.signal
        }),
      scheduleIndexing: (files, reason, leaseId) => this.scheduleIndexing(files, reason, leaseId),
      waitForSearchIndexDrain: (reason, leaseId) => this.waitForSearchIndexDrain(reason, leaseId),
      yieldToEventLoop: async () => await new Promise<void>((resolve) => setImmediate(resolve)),
      logInfo: (message, meta) => this.logInfo(message, meta),
      logWarn: (message, error, meta) => this.logWarn(message, error, meta)
    })
    this.contentIndexPolicyService = new FileProviderContentIndexPolicyService({
      capacity: new FileProviderContentCapacityService({
        getDirectory: () => {
          const database = this.initializationContext?.databaseManager
          if (!database) return null
          const target = database.getSearchDatabaseFilePath()
          return target && target !== ':memory:' ? path.dirname(target) : null
        },
        onChange: () => this.contentIndexPolicyService.handleStorageChange()
      }),
      cleanupVersion: FILE_CONTENT_INDEX_POLICY_VERSION,
      getSettings: () => this.fileIndexSettings,
      updateSettings: (patch) => this.watchService.updateFileIndexSettings(patch),
      syncSettings: () => this.syncWatchServiceState(),
      getSchedulerSnapshot: () => this.indexSchedulerService.getSnapshot(),
      isResumeActive: () => this.enrichmentResumeService.isActive(),
      resume: (reason) => this.enrichmentResumeService.resume(reason),
      stop: () => this.enrichmentResumeService.stop(),
      cancelPending: () => {
        this.embeddingService?.cancelPending()
        this.indexRuntimeService?.cancelDeferredFlush()
        this.indexSchedulerService.cancelPending()
        if (this.contentIndexPolicyService.isEnabled()) this.fileIndexWorker?.shutdown()
        this.pendingIndexWorkerResults.clear()
      },
      clearData: () => this.clearContentIndexingDataWithLease(),
      compact: (reason) => this.maintenanceService.compactSearchIndex(reason)
    })
    this.indexRuntimeService = new FileProviderIndexRuntimeService({
      checkContentCapacity: () => this.contentIndexPolicyService.checkAdmission(true),
      isContentAdmissionEnabled: () => this.contentIndexPolicyService.isAdmissionEnabled(),
      recordStorageFailure: (error) => this.contentIndexPolicyService.recordStorageFailure(error),
      resumeDeferredFlush: async (operation, signal) => {
        await this.requireRuntimeMutationDelegate().withMutationLease(operation, {
          maintenance: true,
          signal: AbortSignal.any([signal, this.maintenanceService.signal])
        })
      },
      prepareDeferredEntries: async (entries, leaseId) => {
        if (!this.dbUtils || this.shuttingDown) return false
        const current = new Map<number, typeof filesSchema.$inferSelect>()
        for (const batch of chunkArray(entries, 100)) {
          const rows = await this.dbUtils
            .getFileIndexReadDb()
            .select()
            .from(filesSchema)
            .where(
              inArray(
                filesSchema.id,
                batch.map((entry) => entry.fileId)
              )
            )
          for (const row of rows) current.set(row.id, row)
        }
        return entries.every((entry) => {
          const row = current.get(entry.fileId)
          return (
            row &&
            leaseId &&
            !this.isIndexWorkerMutationLeaseCancelled(leaseId) &&
            this.isWithinWatchRoots(row.path) &&
            !this.maintenanceService.isStaleExcludedIndexPath(row.path) &&
            (entry.fileVersion == null ||
              (this.toTimestamp(row.mtime) === entry.fileVersion && row.size === entry.fileSize))
          )
        })
      },
      isMutationLeaseCancelled: (leaseId) => this.isIndexWorkerMutationLeaseCancelled(leaseId),
      flushBatchScheduler: this.flushBatchScheduler,
      getDbUtils: () => this.dbUtils,
      getSearchIndex: () => this.searchIndex,
      getPendingResults: () => this.pendingIndexWorkerResults,
      getInflightResults: () => this.inflightIndexWorkerResults,
      ensureSearchIndexWorkerReady: (reason) => this.ensureSearchIndexWorkerReady(reason),
      getSearchIndexWorker: () => this.requireFilePersistencePort(),
      buildPersistEntries: (entries) => this.contentIndexPolicyService.buildPersistEntries(entries),
      publishRecords: (entries) => this.publishCommittedWorkerRecords(entries),
      indexEmbeddings: (entries) =>
        this.contentIndexPolicyService.isEnabled()
          ? this.embeddingIndexService.indexCommittedEntries(entries)
          : Promise.resolve(),
      logDebug: (message, meta) => this.logDebug(message, meta),
      logWarn: (message, error, meta) => this.logWarn(message, error, meta)
    })
    this.fileIndexWorker = new FileIndexWorkerClient(
      (payload) => {
        if (this.isIndexWorkerMutationLeaseCancelled(payload.mutationLeaseId)) return
        this.indexRuntimeService.handleIndexWorkerFile(payload)
      },
      async () => {
        // A foreground handoff retains durable payloads but releases parser/source credit.
        if (!(await this.indexRuntimeService.waitForPersisted())) {
          for (const entry of [
            ...this.pendingIndexWorkerResults.values(),
            ...this.inflightIndexWorkerResults.values()
          ]) {
            if (entry.mutationLeaseId) this.indexSchedulerService.cancelLease(entry.mutationLeaseId)
          }
        }
      }
    )
    this.searchItemService = new FileProviderSearchItemService({
      providerId: this.id,
      providerName: this.name,
      getAssetService: () => this.assetService,
      cleanupStaleFileResult: (file, reason) =>
        this.maintenanceService.cleanupStaleFileResult(file, reason),
      ensurePersistenceReady: (reason) => this.ensureSearchIndexWorkerReady(reason),
      removeFileExtensions: (fileId, keys) =>
        this.requireFilePersistencePort().removeFileExtensions(fileId, keys),
      logDebug: (message, meta) => this.logDebug(message, meta),
      logWarn: (message, error, meta) => this.logWarn(message, error, meta)
    })
    this.searchResultService = new FileProviderSearchResultService({
      providerId: this.id,
      getDbUtils: () => this.dbUtils,
      getSearchIndex: () => this.searchIndex,
      isContentIndexingEnabled: () => this.contentIndexPolicyService.isEnabled(),
      isPathAdmitted: (filePath) => this.isSearchPathAdmitted(filePath),
      buildItem: (file, extensions) => this.searchItemService.createItem(file, extensions),
      normalizeItem: (item, file, extensions, reason) =>
        this.searchItemService.normalizeItem(item, file, extensions, { reason }),
      sanitizeExtensions: sanitizeIndexedFileExtensions,
      cleanupStaleCandidates: (paths) =>
        this.maintenanceService.cleanupStaleSearchCandidates(paths),
      semanticSearch: (semanticQuery, limit, signal) =>
        this.embeddingService?.semanticSearch(semanticQuery, limit, signal) ?? Promise.resolve([]),
      logDebug: (message, meta) => this.logDebug(message, meta),
      formatDuration,
      now: () => performance.now()
    })
    this.logDebug('Watching paths', {
      count: this.watchPaths.length
    })
  }

  private logInfo(message: string, meta?: Record<string, unknown>): void {
    logFileProviderInfo(message, meta)
  }

  private logWarn(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    logFileProviderWarn(message, error, meta)
  }

  private logDebug(message: string, meta?: Record<string, unknown>): void {
    logFileProviderDebug(message, meta)
  }

  private logError(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    logFileProviderError(message, error, meta)
  }

  public setFilePersistencePort(port: FilePersistencePort | null): void {
    this.filePersistencePort = port
    this.filePersistenceReady = null
  }

  private async awaitShutdownProducer(task: Promise<unknown>, label: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`FILE_PROVIDER_SHUTDOWN_PRODUCER_TIMEOUT:${label}`))
      }, FILE_INDEX_SEARCH_DRAIN_TIMEOUT_MS)
      timeout.unref?.()
      void task.then(
        () => {
          clearTimeout(timeout)
          resolve()
        },
        (error) => {
          clearTimeout(timeout)
          reject(error)
        }
      )
    })
  }

  public async prepareForSearchIndexShutdown(): Promise<void> {
    this.workerStatusService.stopDiagnostics()
    this.shuttingDown = true
    this.contentIndexPolicyService.dispose()
    this.indexRuntimeService.dispose()
    const maintenanceDrain = this.maintenanceService.stop()
    this.indexRunAbortController?.abort(new Error('FILE_PROVIDER_SHUTTING_DOWN'))
    // Content enrichment is durably marked pending before admission. Stop accepting work and
    // terminate its read-only worker now, rather than letting a parser/publication barrier consume
    // the app's entire quit budget. A later launch resumes every unfinished row.
    this.enrichmentResumeService.stop()
    this.indexSchedulerService.close()
    this.fileIndexWorker.shutdown()
    this.disposeAssetBridge?.()
    this.disposeAssetBridge = null
    this.watchService.dispose()
    const assetDrain = this.assetService.close()
    const openerDrain = this.openerService.close()
    this.bootPassService.cancel()
    try {
      const producerDrains: Promise<void>[] = [
        this.awaitShutdownProducer(assetDrain, 'file-assets'),
        this.awaitShutdownProducer(openerDrain, 'file-openers'),
        this.awaitShutdownProducer(
          this.embeddingService?.close() ?? Promise.resolve(),
          'file-semantic-reader'
        ),
        this.awaitShutdownProducer(maintenanceDrain, 'file-maintenance')
      ]
      if (this.isInitializing) {
        producerDrains.push(
          this.awaitShutdownProducer(
            this.isInitializing.catch((error) => {
              this.logWarn('File indexing failed while preparing shutdown', error)
            }),
            'indexing'
          )
        )
      }
      if (this.backgroundStartupPromise) {
        producerDrains.push(
          this.awaitShutdownProducer(this.backgroundStartupPromise, 'background-startup')
        )
      }
      await Promise.all(producerDrains)
      if (this.indexedSourceRuntimeMutationDelegate) {
        await this.indexedSourceRuntimeMutationDelegate.drainSource(
          this.id,
          FILE_INDEX_SEARCH_DRAIN_TIMEOUT_MS
        )
      }
      await this.drainIndexedSourceMutations('shutdown')
    } catch (error) {
      await this.resetIndexedSourceRuntimeState({
        sourceId: this.id,
        reason: IndexedSourceResetReasons.HealthRepair,
        clearSearchIndex: false,
        clearScanProgress: true
      }).catch((resetError) => {
        this.logWarn('Failed to clear scan progress after shutdown drain failure', resetError)
      })
      throw error
    } finally {
      this.fileScanWorker.shutdown()
      this.reconcileWorker.shutdown()
    }
  }

  public setIndexedSourceRuntimeMutationDelegate(
    delegate: FileIndexedSourceRuntimeMutationDelegate | null
  ): void {
    this.indexedSourceRuntimeMutationDelegate = delegate
  }

  public async handleIndexedSourceRuntimeRecordsApplied(
    records: readonly IndexedSourceRecord[],
    mutationLeaseId?: string
  ): Promise<void> {
    if (!this.dbUtils) return
    const paths = [
      ...new Set(
        records
          .filter((record) => record.metadata?.runtimePublication === 'base')
          .map((record) => record.path)
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
      )
    ]
    if (paths.length === 0) return
    // Worker-committed rows live in the worker's home; the ids on these rows
    // feed extension/icon writes (which are routed to the same home), so the
    // read must come from it too.
    const files = await this.dbUtils
      .getFileIndexReadDb()
      .select()
      .from(filesSchema)
      .where(and(fileTypeIs('file'), inArray(filesSchema.path, paths)))
    if (files.length === 0) return
    const progressRows = await this.dbUtils.getFileIndexProgressByFileIds(
      files.map((file) => file.id)
    )
    const indexingFiles = filterFileIndexCandidatesByProgress(files, progressRows)
    await this.writeSideEffectService.dispatch(
      files,
      {
        extensionContext: 'runtime-writer-ack',
        indexReason: 'runtime-writer-ack',
        mutationLeaseId
      },
      indexingFiles
    )
  }

  private requireFilePersistencePort(): FilePersistencePort {
    if (!this.filePersistencePort) {
      throw new Error('FILE_PERSISTENCE_PORT_UNAVAILABLE')
    }
    return this.filePersistencePort
  }

  /**
   * Split topology resolved PER CALL (never captured): whether the file-index
   * tables live in the worker-owned search-index.db. See issue #295 and the
   * embedding split-brain (constructor capture was the bug class).
   */
  private isSearchSplitEnabledNow(): boolean {
    return Boolean(this.initializationContext?.databaseManager.isSearchSplitEnabled())
  }

  private requireRuntimeMutationDelegate(): FileIndexedSourceRuntimeMutationDelegate {
    if (!this.indexedSourceRuntimeMutationDelegate) {
      throw new Error('INDEXED_SOURCE_RUNTIME_MUTATION_DELEGATE_UNAVAILABLE')
    }
    return this.indexedSourceRuntimeMutationDelegate
  }

  private createSearchIndexWorkerReady(): Promise<boolean> {
    return this.requireFilePersistencePort()
      .waitUntilReady()
      .then(() => true)
      .catch((error) => {
        this.logError('File persistence port readiness failed', error)
        this.filePersistenceReady = null
        return false
      })
  }

  private async ensureSearchIndexWorkerReady(reason: string): Promise<boolean> {
    if (!this.filePersistencePort) {
      this.logWarn('File persistence port operation skipped: port unavailable', undefined, {
        reason
      })
      return false
    }
    this.filePersistenceReady ??= this.createSearchIndexWorkerReady()
    const ready = await this.filePersistenceReady
    if (!ready) {
      this.logWarn('File persistence port operation skipped: readiness unavailable', undefined, {
        reason
      })
    }
    return ready
  }

  public setIndexedSourceRuntimeResetDelegate(
    delegate: FileIndexedSourceRuntimeResetDelegate | null
  ): void {
    this.indexedSourceRuntimeResetDelegate = delegate
  }

  private async resetFileIndexRuntimeStateViaIndexedRuntime(
    request: IndexedSourceResetRequest
  ): Promise<IndexedSourceResetResult> {
    if (!this.indexedSourceRuntimeResetDelegate) {
      throw new Error('INDEXED_SOURCE_RUNTIME_RESET_DELEGATE_UNAVAILABLE')
    }
    if (request.clearSearchIndex) await this.maintenanceService.capacity.reset()
    return await this.indexedSourceRuntimeResetDelegate(request)
  }

  public async resetIndexedSourceRuntimeState(
    request: IndexedSourceResetRequest
  ): Promise<IndexedSourceResetResult> {
    if (
      request.reason === IndexedSourceResetReasons.ManualRebuild ||
      request.reason === IndexedSourceResetReasons.UserClear
    ) {
      await this.preemptBackgroundIndexing(request.reason === IndexedSourceResetReasons.UserClear)
    }
    if (request.clearSearchIndex) {
      return await this.resetFileIndexRuntimeStateViaIndexedRuntime(request)
    }

    const result = await this.runtimeResetService.reset({ request })
    return {
      ...result,
      clearedSearchIndex: false,
      clearedSearchIndexRows: 0,
      clearedScanProgress: result.clearedScanProgress,
      scanProgressRows: result.scanProgressRows ?? 0
    }
  }

  private async countSearchIndexByProvider(
    providerId: string,
    _reason: string,
    mutationLeaseId?: string
  ): Promise<number> {
    return await this.requireRuntimeMutationDelegate().countSource(providerId, mutationLeaseId)
  }

  private async persistAndPublishFullScanBatch(
    records: UpsertFileRecord[],
    options?: FileIndexRunOptions
  ): Promise<FileProviderFullScanPersistResult> {
    if (records.length === 0) return { insertedCount: 0 }
    if (records.length > 10) throw new Error('FILE_FULL_SCAN_SLICE_TOO_LARGE')
    const startedAt = performance.now()
    try {
      const result = await this.maintenanceService.withFileMutationSlice(
        options,
        async (mutationLeaseId) => {
          const acceptedRecords = await this.maintenanceService.admitScanRecords(records)
          if (acceptedRecords.length === 0) return { persistedCount: 0, metrics: undefined }
          const mutation = this.requireRuntimeMutationDelegate().applyBatchWithPersistence
          return await mutation(
            {
              sourceId: this.id,
              records: acceptedRecords.map((record) => this.mapFileToIndexedSourceRecord(record)),
              mutationLeaseId
            },
            acceptedRecords
          )
        }
      )
      const persistedCount = result.persistedCount
      const metrics = result.metrics
      recordRuntimeWriteSnapshot(this.ftsWriteSnapshotService, {
        entries: persistedCount,
        reason: 'full-scan.upsert.fused',
        durationMs: performance.now() - startedAt,
        metadata: {
          writeMode: 'fused',
          requestedRows: records.length,
          persistedRows: persistedCount,
          indexedItems: metrics?.indexedItems,
          removedItems: metrics?.removedItems,
          legacyItemIds: metrics?.legacyItemIds,
          workerDurationMs: metrics?.workerDurationMs,
          persistDurationMs: metrics?.persistDurationMs,
          workerCpuMicros: metrics?.workerCpuMicros,
          applyDurationMs: metrics?.applyDurationMs,
          roundTripDurationMs: metrics?.roundTripDurationMs,
          visibilityDurationMs: metrics?.visibilityDurationMs,
          storeBoundary: 'file-persistence-fts'
        }
      })
      // The source lease has ended. Backpressure from the stream consumer can
      // delay traversal here, but cannot hold watch/reset behind a long lease.
      await this.emitCommittedScanProgress(
        persistedCount,
        options,
        records[records.length - 1].path
      )
      return { insertedCount: persistedCount, workerCpuMicros: metrics?.workerCpuMicros }
    } catch (error) {
      recordRuntimeWriteFailureSnapshot(this.ftsWriteSnapshotService, {
        error,
        reason: 'full-scan.upsert.fused',
        entries: records.length,
        metadata: {
          writeMode: 'fused',
          requestedRows: records.length,
          acceptedRows: records.length,
          storeBoundary: 'file-persistence-fts'
        }
      })
      throw error
    }
  }

  private async persistReconciledUpdates(
    records: FileUpdateRecord[],
    options?: FileIndexRunOptions
  ): Promise<{ updatedCount: number }> {
    if (records.length === 0 || !this.dbUtils) return { updatedCount: 0 }
    const result = await this.maintenanceService.withFileMutationSlice(
      options,
      async (mutationLeaseId) => {
        const rows = await this.dbUtils!.getFileIndexReadDb()
          .select()
          .from(filesSchema)
          .where(
            inArray(
              filesSchema.id,
              records.map((record) => record.id)
            )
          )
        const byId = new Map(rows.map((row) => [row.id, row]))
        const current = records.flatMap((record) => {
          const existing = byId.get(record.id)
          if (
            !existing ||
            existing.path !== record.path ||
            !this.isWithinWatchRoots(record.path) ||
            this.maintenanceService.isStaleExcludedIndexPath(record.path)
          )
            return []
          return [{ ...existing, ...record, lastIndexedAt: new Date() }]
        })
        if (current.length === 0) return { persistedCount: 0 }
        const mutation = this.requireRuntimeMutationDelegate().applyBatchWithPersistence
        return await mutation(
          {
            sourceId: this.id,
            records: current.map((record) => this.mapFileToIndexedSourceRecord(record)),
            mutationLeaseId
          },
          current
        )
      }
    )
    await this.emitCommittedScanProgress(result.persistedCount, options)
    return { updatedCount: result.persistedCount }
  }

  private async emitCommittedScanProgress(
    committedRecordCount: number,
    options?: FileIndexRunOptions,
    cursor?: string
  ): Promise<void> {
    if (!options?.onRecordBatch || committedRecordCount === 0) return
    const signal = options.signal
    signal?.throwIfAborted()
    const publication = Promise.resolve(
      options.onRecordBatch({
        sourceId: this.id,
        records: [],
        committedRecordCount,
        cursor
      })
    )
    if (!signal) {
      await publication
      return
    }
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        signal.removeEventListener('abort', abort)
        reject(signal.reason)
      }
      signal.addEventListener('abort', abort, { once: true })
      void publication.then(
        () => {
          signal.removeEventListener('abort', abort)
          resolve()
        },
        (error) => {
          signal.removeEventListener('abort', abort)
          reject(error)
        }
      )
      if (signal.aborted) abort()
    })
  }

  private mapFileToIndexedSourceRecord(file: IndexedFileSourceRecordRow): IndexedSourceRecord {
    const record = mapIndexedFileSourceRecord(file, { sourceId: this.id })
    record.metadata = { ...record.metadata, runtimePublication: 'base' }
    const extension = (file.extension || path.extname(file.name)).toLowerCase()
    const keywords = KEYWORD_MAP[extension] ?? []
    const tags = new Set<string>(getTypeTagsForExtension(extension))
    if (extension) tags.add(extension.replace(/^\./, ''))
    return {
      ...record,
      keywords,
      tags: tags.size > 0 ? [...tags] : undefined,
      search: {
        keywords: keywords.map((value) => ({ value, priority: 1.05 }))
      }
    }
  }

  private mapWorkerResultToIndexedSourceRecord(result: IndexWorkerFileResult): IndexedSourceRecord {
    const item = result.indexItem
    const mapTerms = (terms: typeof item.keywords, priority: number) =>
      terms
        ?.filter((term) => term.value.length > 0)
        .map((term) => ({
          value: term.value,
          priority: term.priority ?? priority
        }))
    const legacyItemIdsValue = (item as unknown as { legacyItemIds?: unknown }).legacyItemIds
    const legacyItemIds = Array.isArray(legacyItemIdsValue)
      ? legacyItemIdsValue.filter(
          (value): value is string => typeof value === 'string' && value.length > 0
        )
      : undefined
    return {
      sourceId: this.id,
      recordId: item.itemId,
      stableKey: item.itemId,
      kind: 'file',
      title: item.displayName || item.name,
      subtitle: item.description ?? item.path ?? undefined,
      path: item.path ?? undefined,
      keywords: item.keywords?.map((term) => term.value),
      tags: item.tags,
      metadata: {
        content: item.content ?? undefined,
        extension: item.extension ?? undefined,
        type: item.type,
        runtimePublication: 'worker-enrichment'
      },
      search: {
        aliases: mapTerms(item.aliases, 1.5),
        keywords: mapTerms(item.keywords, 1.1),
        legacyItemIds
      }
    }
  }

  private isIndexWorkerMutationLeaseCancelled(mutationLeaseId?: string): boolean {
    return Boolean(mutationLeaseId && this.cancelledIndexWorkerMutationLeases.has(mutationLeaseId))
  }

  private async publishCommittedWorkerRecords(entries: IndexWorkerFileResult[]): Promise<number> {
    if (entries.length === 0) return 0
    const entriesByLease = new Map<string | undefined, IndexWorkerFileResult[]>()
    for (const entry of entries) {
      // A file the worker found gone has nothing to publish; a stale search entry
      // is removed by cleanupStaleSearchCandidates once a search reaches it.
      if (isIndexWorkerFileMissing(entry.progress)) continue
      const group = entriesByLease.get(entry.mutationLeaseId) ?? []
      group.push(entry)
      entriesByLease.set(entry.mutationLeaseId, group)
    }

    let indexedItems = 0
    for (const [mutationLeaseId, group] of entriesByLease) {
      if (!(await this.contentIndexPolicyService.checkAdmission())) {
        throw new Error('FILE_CONTENT_STORAGE_PAUSED')
      }
      if (this.isIndexWorkerMutationLeaseCancelled(mutationLeaseId)) {
        // Persistence may already have marked these rows complete. Without
        // publication they remain recoverable, even when the lease timed out.
        await this.markContentEnrichmentPending(group.map((entry) => ({ id: entry.fileId })))
        this.logWarn('Discarded worker enrichment from a cancelled mutation lease', undefined, {
          mutationLeaseId,
          entries: group.length
        })
        continue
      }
      try {
        const summary = await this.requireRuntimeMutationDelegate().applyBatch({
          sourceId: this.id,
          records: group.map((entry) => this.mapWorkerResultToIndexedSourceRecord(entry)),
          mutationLeaseId
        })
        if (summary && typeof summary === 'object' && 'indexedItemCount' in summary) {
          indexedItems += Number(summary.indexedItemCount) || 0
        }
      } catch (error) {
        if (!mutationLeaseId || !isIndexingSourceMutationLeaseInvalidError(error, this.id))
          throw error
        await this.markContentEnrichmentPending(group.map((entry) => ({ id: entry.fileId })))
        this.logWarn('Re-armed worker enrichment after mutation lease expiry', error, {
          mutationLeaseId,
          entries: group.length,
          recoveryReason: 'stale-mutation-lease'
        })
        if (!this.shuttingDown) this.enrichmentResumeService.resume('recovery.stale-mutation-lease')
      }
    }
    return indexedItems
  }

  private async emitIndexedSourceRecordBatchFromBatch(
    batch: IndexedSourceRecordBatch,
    options?: FileIndexRunOptions
  ): Promise<void> {
    if (batch.records.length === 0) return
    await this.maintenanceService.withFileMutationSlice(options, (mutationLeaseId) =>
      this.requireRuntimeMutationDelegate().applyBatch({ ...batch, mutationLeaseId })
    )
    await this.emitCommittedScanProgress(batch.records.length, options, batch.cursor)
  }

  private syncWatchServiceState(): void {
    this.fileIndexSettings = this.watchService.getCurrentSettings()
    this.watchPaths = this.watchService.getWatchPaths()
    this.watchPathsRegistered = this.watchService.isWatchPathRegistered()
    this.maintenanceService.updateConfiguration(this.watchPaths, this.fileIndexSettings.extraPaths)
  }

  private initializeBackgroundTaskService(): void {
    if (this.shuttingDown) return
    this.watchService.initializeBackgroundTaskService()
    this.syncWatchServiceState()
  }

  private scheduleBackgroundStartupTasks(loadStart: number): void {
    if (this.shuttingDown || this.backgroundStartupPromise) return

    this.backgroundStartupReady = false
    this.backgroundStartupError = null
    this.backgroundStartupFailure = null
    this.backgroundStartupPromise = new Promise<void>((resolve) => setImmediate(resolve))
      .then(async () => {
        if (this.shuttingDown) return
        await waitForIndexMaintenanceIdle(this.maintenanceService.signal)
        if (this.shuttingDown) return
        this.logDebug('FileProvider background startup running')

        const workerReady = await this.ensureSearchIndexWorkerReady('startup.background')
        if (this.shuttingDown) return
        this.initializeBackgroundTaskService()
        if (workerReady) {
          await this.contentIndexPolicyService.reconcileAtStartup()
          if (this.shuttingDown) return
        }
        await this.ensureFileSystemWatchers()
        if (this.shuttingDown) return

        if (workerReady) {
          this.backgroundStartupReady = true
          void this.bootPassService.maybeRunHotCatchup()
          this.maintenanceService.scheduleFileMaintenance()
          // Layer-2 safety net for the split topology: if the (rebuildable)
          // search file holds zero index rows while watch roots exist, request
          // one Startup scan through the normal eligibility gate. Development
          // and production use the same path; a contained failure must never
          // reject the startup chain.
          void this.bootPassService.maybeRunBootstrapReindex()
          this.bootPassService.schedulePathNormalizationMigration()
          this.assetService.scheduleLegacyIconMigration(
            Math.max(30_000, getStartupDegradeWindowRemainingMs())
          )
        } else {
          const error = new Error('Search index worker initialization failed')
          this.backgroundStartupError = error
          const report = operationalErrorService.report({
            domain: 'file-index',
            operation: 'background-startup.worker-ready',
            error,
            code: 'FILE_INDEX_STARTUP_WORKER_UNAVAILABLE',
            retryable: true,
            userImpact: 'degraded'
          })
          this.backgroundStartupFailure = {
            code: report.code,
            retryable: report.retryable,
            reportId: report.id
          }
        }
      })
      .catch((error) => {
        const normalizedError = error instanceof Error ? error : new Error(String(error))
        this.backgroundStartupError = normalizedError
        const busy = isSqliteBusyError(error)
        const report = operationalErrorService.report({
          domain: 'file-index',
          operation: 'background-startup.initialize',
          error: normalizedError,
          code: busy ? 'FILE_INDEX_DATABASE_BUSY' : 'FILE_INDEX_STARTUP_FAILED',
          retryable: true,
          userImpact: 'degraded'
        })
        this.backgroundStartupFailure = {
          code: report.code,
          retryable: report.retryable,
          reportId: report.id
        }
      })
      .finally(() => {
        this.logDebug('FileProvider background startup finished', {
          duration: formatDuration(performance.now() - loadStart),
          ready: this.backgroundStartupReady,
          error: this.backgroundStartupError?.message ?? null
        })
        this.backgroundStartupPromise = null
      })
  }

  /**
   * Record user activity for background task scheduling
   */
  recordUserActivity(): void {
    this.watchService.recordUserActivity()
  }

  private async shouldRunAutoIndexing(): Promise<{
    allowed: boolean
    reason?: string
    battery?: FileIndexBatteryStatus | null
  }> {
    this.syncWatchServiceState()
    return this.watchService.shouldRunAutoIndexing({
      isInitializing: this.isInitializing !== null,
      hasInitializationContext: this.initializationContext !== null
    })
  }

  private async runAutoIndexing(): Promise<boolean> {
    if (this.shuttingDown || isIndexFullFailure(this.initializationFailure)) return false
    const decision = await this.shouldRunAutoIndexing()
    if (!decision.allowed) {
      this.logDebug('Auto index scan skipped', {
        reason: decision.reason,
        batteryLevel: decision.battery?.level ?? null,
        batteryCharging: decision.battery?.charging ?? null
      })
      return false
    }
    if (this.shuttingDown) return false

    await this.ensureFileSystemWatchers()
    if (this.shuttingDown) return false
    try {
      await this.requireRuntimeMutationDelegate().scanSource(IndexedSourceScanReasons.Startup)
      return true
    } catch (error) {
      this.logWarn('Auto index scan aborted', error)
      return false
    }
  }

  private async preemptBackgroundIndexing(includeManual = false): Promise<void> {
    this.indexRuntimeService.cancelDeferredFlush()
    this.pendingIndexWorkerResults.clear()
    const activeScan = includeManual || this.indexRunSource === 'auto' ? this.isInitializing : null
    if (activeScan)
      this.indexRunAbortController?.abort(new Error('FILE_INDEX_BACKGROUND_PREEMPTED'))
    const maintenanceDrain = this.maintenanceService.cancelRun()
    const pending: Promise<unknown>[] = []
    if (activeScan) pending.push(activeScan)
    pending.push(maintenanceDrain)
    await Promise.allSettled(pending)
  }
  private async startIndexing(
    source: 'auto' | 'manual',
    options?: FileIndexRunOptions
  ): Promise<FileIndexSyncStats> {
    if (!(await this.ensureSearchIndexWorkerReady(`indexing.${source}`))) {
      throw new Error('FILE_PERSISTENCE_PORT_UNAVAILABLE')
    }
    if (this.isInitializing) throw new Error('Indexing is already in progress')

    this.initializationFailed = false
    this.initializationFailure = null
    this.progressState.resetRun()
    this.progressState.emit('idle', 0, 0)
    const controller = new AbortController()
    const signal = AbortSignal.any([
      controller.signal,
      this.maintenanceService.signal,
      ...(options?.signal ? [options.signal] : [])
    ])
    const runOptions: FileIndexRunOptions = { ...options, signal, maintenance: source === 'auto' }
    this.indexRunAbortController = controller
    this.indexRunSource = source
    const run = this._initialize(runOptions)
      .then(async (stats) => {
        if (!runOptions.onRecordBatch) {
          await this.drainIndexedSourceMutations(`indexing.${source}`)
        }
        this.initializationFailed = false
        this.logInfo(`File indexing ${source} run completed successfully`)
        if (source === 'manual' && !stats.pending) this.notifyManualRebuildCompleted()
        return stats
      })
      .catch((error) => {
        if (this.shuttingDown || signal.aborted) {
          this.initializationFailed = false
          this.initializationFailure = null
          this.logDebug(`File indexing ${source} run cancelled`)
          this.progressState.emit('idle', 0, 0)
          if (source === 'manual') this.manualRebuildPendingNotification = false
          if (options?.throwOnFailure) throw error
          return createFileIndexSyncStats()
        }

        const failure = classifyRunFailure(error)
        this.initializationFailed = failure.halts
        const report = operationalErrorService.report({
          domain: 'file-index',
          operation: `indexing.${source}`,
          error,
          code: failure.code,
          retryable: failure.retryable,
          userImpact: 'degraded'
        })
        this.initializationFailure = {
          code: report.code,
          retryable: report.retryable,
          reportId: report.id
        }
        void this.maintenanceService.capacity.relieve(error)
        this.logError(`File indexing ${source} run failed`, error)
        this.progressState.emit('idle', 0, 0)
        if (source === 'manual') this.manualRebuildPendingNotification = false
        if (options?.throwOnFailure) throw error
        return { ...createFileIndexSyncStats(), errors: 1 }
      })
      .finally(() => {
        if (this.isInitializing === run) {
          this.isInitializing = null
          const snapshot = this.progressState.getSnapshot(false)
          if (snapshot.progress.stage !== 'idle' && snapshot.progress.stage !== 'completed') {
            this.progressState.emit('idle', 0, 0)
          }
        }
        if (this.indexRunAbortController === controller) {
          this.indexRunAbortController = null
          this.indexRunSource = null
        }
        if (!this.shuttingDown) this.maintenanceService.scheduleFileMaintenance()
      })

    this.isInitializing = run
    return run
  }

  private notifyManualRebuildCompleted(): void {
    if (!this.manualRebuildPendingNotification) return

    this.manualRebuildPendingNotification = false
    notificationModule.showInternalSystemNotification({
      title: t('notifications.fileIndexRebuildCompleteTitle'),
      message: t('notifications.fileIndexRebuildCompleteBody'),
      level: 'success',
      system: { silent: false }
    })
  }

  public isStartupReady(): boolean {
    return this.backgroundStartupReady
  }

  public isStartupPending(): boolean {
    return this.backgroundStartupPromise !== null
  }

  public buildStartupDegradedNotice(_query: TuffQuery): TuffItem | null {
    return null
  }

  public getWatchedPaths(): string[] {
    return [...this.watchPaths]
  }

  public getPendingWatchPermissionPaths(): string[] {
    return this.watchService.getPendingPermissionPaths()
  }

  public ownsWatchPath(rawPath: string): boolean {
    return this.isWithinWatchRoots(rawPath)
  }

  public resolvePreviewResourcePath(rawPath: string): Promise<string | null> {
    return this.assetService.resolvePreviewResourcePath(rawPath)
  }

  public async *streamIndexedSourceSnapshot(
    request: IndexedSourceScanRequest
  ): AsyncIterable<IndexedSourceRecordBatch> {
    if (request.sourceId !== this.id) {
      throw new Error(`Unsupported file index source: ${request.sourceId}`)
    }
    const dbUtils = this.dbUtils
    if (!dbUtils) {
      throw new Error('FILE_PROVIDER_DATABASE_UNAVAILABLE_FOR_SCHEMA_MIGRATION')
    }
    let lastId = 0
    while (true) {
      if (request.signal?.aborted) {
        throw request.signal.reason ?? new Error('file-indexed-source-scan-aborted')
      }
      // File rows live in the worker-owned home under the split — stream the
      // snapshot from the same home the worker writes (primary when off).
      const rows = await dbUtils
        .getFileIndexReadDb()
        .select()
        .from(filesSchema)
        .where(and(eq(filesSchema.type, 'file'), gt(filesSchema.id, lastId)))
        .orderBy(filesSchema.id)
        .limit(100)
      if (rows.length === 0) break
      lastId = rows[rows.length - 1]!.id
      yield {
        sourceId: this.id,
        records: rows.map((record) => this.mapFileToIndexedSourceRecord(record))
      }
    }
    yield { sourceId: this.id, records: [], done: true }
  }

  public async scanIndexedSource(
    request: IndexedSourceScanRequest,
    options?: Pick<
      FileIndexRunOptions,
      'onRecordBatch' | 'throwOnFailure' | 'signal' | 'mutationLeaseId'
    >
  ): Promise<FileIndexedSourceScanResult> {
    if (this.shuttingDown) throw new Error('FILE_PROVIDER_SHUTTING_DOWN')
    if (request.signal?.aborted) {
      throw request.signal.reason ?? new Error('file-indexed-source-scan-aborted')
    }
    if (request.reason === IndexedSourceScanReasons.SchemaMigration) {
      throw new Error('FILE_SCHEMA_MIGRATION_REQUIRES_STREAMING_SNAPSHOT')
    }

    const batches: IndexedSourceRecordBatch[] = []
    await this.ensureFileSystemWatchers()
    await this.startIndexing(
      request.reason === IndexedSourceScanReasons.ManualRebuild ? 'manual' : 'auto',
      {
        throwOnFailure: options?.throwOnFailure,
        signal: options?.signal ?? request.signal,
        mutationLeaseId: options?.mutationLeaseId ?? request.mutationLeaseId,
        onRecordBatch: async (batch) => {
          if (options?.onRecordBatch) {
            await options.onRecordBatch(batch)
          } else {
            batches.push(batch)
          }
        }
      }
    )
    return {
      batches: options?.onRecordBatch
        ? []
        : [...batches, { sourceId: this.id, records: [], done: true }]
    }
  }

  public async drainIndexedSourceMutations(
    reason: string,
    mutationLeaseId?: string
  ): Promise<void> {
    if (this.shuttingDown) {
      if (mutationLeaseId !== undefined) {
        this.cancelledIndexWorkerMutationLeases.add(mutationLeaseId)
        this.indexSchedulerService.cancelLease(mutationLeaseId)
        this.fileIndexWorker.cancelLease(mutationLeaseId)
      } else {
        this.indexSchedulerService.cancelPending()
      }
      // These results have not crossed the durable persistence barrier. Their progress rows were
      // set to pending before scheduler admission, so dropping the in-memory copies is recoverable.
      for (const [fileId, result] of this.pendingIndexWorkerResults) {
        if (mutationLeaseId === undefined || result.mutationLeaseId === mutationLeaseId) {
          this.pendingIndexWorkerResults.delete(fileId)
        }
      }
      return
    }

    try {
      await this.waitForSearchIndexDrain(reason, mutationLeaseId)
      if (!this.shuttingDown) this.enrichmentResumeService.resume(reason)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const timedOut =
        message.startsWith('file-index-search-drain-timeout:') ||
        message === 'FILE_INDEX_SCHEDULER_DRAIN_TIMEOUT'

      if (!timedOut) throw error

      if (mutationLeaseId !== undefined) {
        this.cancelledIndexWorkerMutationLeases.add(mutationLeaseId)
        this.indexSchedulerService.cancelLease(mutationLeaseId)
        this.fileIndexWorker.cancelLease(mutationLeaseId)
        await this.indexSchedulerService
          .drain(FILE_INDEX_SEARCH_DRAIN_TIMEOUT_MS, mutationLeaseId)
          .catch((cancelError) => {
            this.logWarn('Failed to settle cancelled index worker lease', cancelError, {
              mutationLeaseId
            })
          })
      } else {
        this.indexSchedulerService.cancelPending()
        this.fileIndexWorker.shutdown()
      }

      const pendingFiles: Array<{ id: number }> = []
      for (const [id, result] of this.pendingIndexWorkerResults) {
        if (mutationLeaseId === undefined || result.mutationLeaseId === mutationLeaseId) {
          pendingFiles.push({ id })
        }
      }
      if (pendingFiles.length > 0) await this.markContentEnrichmentPending(pendingFiles)

      for (const [fileId, result] of this.pendingIndexWorkerResults) {
        if (mutationLeaseId === undefined || result.mutationLeaseId === mutationLeaseId) {
          this.pendingIndexWorkerResults.delete(fileId)
        }
      }
      // The executor still owns inflight payloads until its promise settles.
      // Keeping them accounted also blocks a new parser batch from overtaking it.

      // scan_progress records filesystem coverage and must survive a later
      // content-enrichment timeout. Resume only unfinished file_index_progress
      // rows under a fresh background mutation lease.
      if (!this.shuttingDown) this.enrichmentResumeService.resume(`recovery.${reason}`)
      return
    }
  }

  public async reconcileIndexedSource(
    request: IndexedSourceReconcileRequest
  ): Promise<IndexedSourceReconcileResult> {
    if (this.shuttingDown) throw new Error('FILE_PROVIDER_SHUTTING_DOWN')
    if (request.reason === FILE_WATCH_SUBTREE_RECONCILE_REASON) {
      for (const root of request.roots ?? [])
        await this.maintenanceService.scheduleChangedFilterScope(root.path)
      return await this.watchSubtreeReconcileService.reconcile(request)
    }
    const startedAt = Date.now()
    await this.ensureFileSystemWatchers()
    const stats = await this.startIndexing('auto', {
      signal: request.signal,
      throwOnFailure: true,
      mutationLeaseId: request.mutationLeaseId,
      onRecordBatch: request.onRecordBatch
    })

    return {
      sourceId: this.id,
      added: stats.added,
      changed: stats.changed,
      deleted: stats.deleted,
      skipped: stats.skipped,
      errors: stats.errors,
      deltas: [],
      startedAt,
      completedAt: Date.now(),
      reason: request.reason ?? 'file-index-reconciliation'
    }
  }

  public async handleIndexedSourceWatchEvent(
    event: IndexedSourceWatchEvent
  ): Promise<IndexedSourceDelta[]> {
    await this.maintenanceService.scheduleChangedFilterScope(event.path)
    return await this.watchSubtreeReconcileService.handleWatchEvent(event)
  }

  private toTimestamp(value: Date | number | string | null | undefined): number | null {
    if (!value) {
      return null
    }
    if (value instanceof Date) {
      return value.getTime()
    }
    if (typeof value === 'number') {
      return value
    }
    const parsed = new Date(value)
    const time = parsed.getTime()
    return Number.isNaN(time) ? null : time
  }

  async onLoad(context: ProviderContext): Promise<void> {
    // 最先赋值 initializationContext，确保即使后续任何步骤失败，rebuildIndex 也能使用
    this.initializationContext = context

    const loadStart = performance.now()

    this.dbUtils = createDbUtils(context.databaseManager.getDb(), undefined, {
      enabled: context.databaseManager.isSearchSplitEnabled(),
      searchDb: context.databaseManager.getSearchDb(),
      writer: searchIndexWriter
    })
    this.searchIndex = context.searchIndex

    try {
      // Same split-aware routing as the dbUtils context above, but resolved at
      // CALL time (never captured): when the split is on, embeddings live in
      // the worker-owned search file (writes forwarded via execWrite, reads
      // from the search connection); when off, everything stays on the
      // primary db. Capturing getDb() here was the embedding split-brain:
      // EmbeddingService wrote the primary while dbUtils routed to the worker.
      this.embeddingService = new EmbeddingService({
        isSplitEnabled: () => context.databaseManager.isSearchSplitEnabled(),
        getReadDb: () => context.databaseManager.getSearchDb(),
        getDatabasePath: () => context.databaseManager.getSearchDatabaseFilePath(),
        getPrimaryDb: () => context.databaseManager.getDb(),
        checkContentCapacity: () => this.contentIndexPolicyService.checkAdmission(),
        recordStorageFailure: (error) => this.contentIndexPolicyService.recordStorageFailure(error),
        execWrite: async (statements, mode) => await searchIndexWriter.execWrite(statements, mode)
      })
    } catch (error) {
      this.logWarn('EmbeddingService init failed, semantic search disabled', error)
    }

    // Store the database file path to exclude it from scanning
    // Prefer database module path when available.
    const databaseDir = context.databaseManager.filePath
    this.databaseFilePath = databaseDir
      ? path.join(databaseDir, 'database.db')
      : path.join(app.getPath('userData'), 'database.db')

    this.watchService.loadFileIndexSettings()
    this.syncWatchServiceState()

    this.logDebug('FileProvider.onLoad called', {
      watchPathsCount: this.watchPaths.length,
      watchPaths: JSON.stringify(this.watchPaths.slice(0, 3))
    })

    // 尽早注册 transport 事件，避免前端启动期请求出现 no-handler 警告
    this.registerOpenersChannel(context)

    // 索引 worker、后台索引任务与文件系统监听器延后到首屏空闲后准备。
    this.scheduleBackgroundStartupTasks(loadStart)
    const loadDuration = performance.now() - loadStart
    this.logDebug('Provider onLoad completed (background startup continues)', {
      duration: formatDuration(loadDuration)
    })
  }

  private async ensureFileSystemWatchers(): Promise<void> {
    if (this.shuttingDown) return
    this.startWorkerDiagnostics()
    await this.watchService.ensureFileSystemWatchers({
      subscribeToFileSystemEvents: () => undefined
    })
    if (this.shuttingDown) return
    this.syncWatchServiceState()
  }

  /**
   * Starts the 30s per-isolate memory/backlog journal at the first real provider
   * activity. Idempotent; the snapshot loader is observational (no DB query) and
   * the workload map carries counts only — never paths or file contents.
   */
  private startWorkerDiagnostics(): void {
    if (this.workerDiagnosticsStarted || this.shuttingDown) return
    this.workerDiagnosticsStarted = true
    this.workerStatusService.startDiagnostics(
      () => this.getWorkerStatusSnapshot(),
      () =>
        buildIndexWorkerWorkload(
          this.getIndexBacklogSnapshot(),
          iconService.getFileIconCacheStats()
        )
    )
  }

  public registerOpenersChannel(contextOrTransport?: ProviderContext | ITuffTransportMain): void {
    if (this.openersChannelRegistered) {
      return
    }

    let transport: ITuffTransportMain | null = null
    if (
      contextOrTransport &&
      'on' in contextOrTransport &&
      typeof contextOrTransport.on === 'function'
    ) {
      transport = contextOrTransport
    } else if (contextOrTransport && 'touchApp' in contextOrTransport) {
      const channel = contextOrTransport.touchApp.channel
      const keyManager =
        channel && typeof channel === 'object' && 'keyManager' in channel
          ? channel.keyManager
          : channel
      transport = getTuffTransportMain(channel, keyManager)
    }

    if (!transport) {
      return
    }

    const resolveOpenerHandler = async (payload: { extension?: string }) => {
      const extension = typeof payload?.extension === 'string' ? payload.extension : null
      if (!extension) {
        return null
      }

      try {
        return await this.openerService.getOpenerForExtension(extension)
      } catch (error) {
        this.logError('Failed to resolve opener for extension', error, {
          extension
        })
        return null
      }
    }

    transport.on(OpenerEvents.app.resolve, resolveOpenerHandler)

    this.openersChannelRegistered = true
  }

  public async getContentIndexSettings(): Promise<FileIndexContentSettings> {
    return await this.contentIndexPolicyService.refreshSnapshot()
  }

  public updateContentIndexSettings(contentIndexingEnabled: boolean) {
    return this.contentIndexPolicyService.update(contentIndexingEnabled)
  }

  private async clearContentIndexingDataWithLease(): Promise<void> {
    const delegate = this.requireRuntimeMutationDelegate()
    await delegate.withMutationLease(async () => {
      this.indexSchedulerService.cancelPending()
      await this.indexSchedulerService.drain(this.indexSchedulerService.getDrainTimeoutMs(false))
      await this.indexRuntimeService.waitForInFlight()
      const affectedItems = await this.indexRowStore.clearContentIndexingData()
      await delegate.publishContentCleared(affectedItems)
    })
    this.indexStatsCache = null
  }

  /**
   * 获取索引状态。公共边界只暴露稳定分类（errorCode/retryable/reportId）；
   * 原始 Error 保留在主进程本地诊断（logError / operationalErrorService）。
   */
  public getIndexingStatus() {
    const isIndexing = this.isInitializing !== null
    const contentSettings = this.contentIndexPolicyService.getSnapshot()
    return {
      isInitializing: isIndexing,
      initializationFailed: this.initializationFailed,
      errorCode: this.initializationFailure?.code ?? this.backgroundStartupFailure?.code ?? null,
      retryable: this.initializationFailure?.retryable ?? this.backgroundStartupFailure?.retryable,
      reportId:
        this.initializationFailure?.reportId ?? this.backgroundStartupFailure?.reportId ?? null,
      startupReady: this.backgroundStartupReady,
      startupPending: this.backgroundStartupPromise !== null,
      startupErrorCode: this.backgroundStartupFailure?.code ?? null,
      ...this.progressState.getSnapshot(isIndexing),
      contentIndexingEnabled: contentSettings.contentIndexingEnabled,
      contentIndexingState: contentSettings.state,
      contentIndexStorage: contentSettings.storage
    }
  }

  /** Capacity mode's horizon in ms: files at or before it are out of a full index. */
  public async getCapacityHorizonMs(): Promise<number | null> {
    return await this.maintenanceService.capacity.readHorizonMs()
  }

  /**
   * 获取索引统计信息
   *
   * Single-flighted: one diagnostics request fans out to `getHealth()` and
   * `getEvidence()` in parallel (indexing-diagnostics-service.ts:36), and both
   * call this. Without sharing the in-flight promise a single poll ran the six
   * COUNT(*) queries twice — 12 scans, measured 8.1s on a 6 GB index. The
   * result is a read-only snapshot, so concurrent callers can safely share it.
   *
   * In-flight sharing only covers callers that overlap. The polls that actually happen are
   * sequential — one per file-system watch event — so the window is capped in time as well; see
   * `FILE_INDEX_STATS_CACHE_MS`.
   */
  private inflightIndexStats: Promise<FileIndexStats> | null = null
  private indexStatsCache: { at: number; value: FileIndexStats } | null = null

  public async getIndexStats(): Promise<FileIndexStats> {
    const cached = this.indexStatsCache
    // Copy out: a served snapshot must not be mutable through one caller into the next.
    if (cached && Date.now() - cached.at < FILE_INDEX_STATS_CACHE_MS) return { ...cached.value }

    if (this.inflightIndexStats) return { ...(await this.inflightIndexStats) }

    const run = this.computeIndexStats().then((value) => {
      this.indexStatsCache = { at: Date.now(), value }
      return value
    })
    this.inflightIndexStats = run
    try {
      return { ...(await run) }
    } finally {
      this.inflightIndexStats = null
    }
  }

  private async computeIndexStats(): Promise<FileIndexStats> {
    return await computeFileIndexStats(this.searchIndex, this.id)
  }

  public async getIndexedSourceEvidence(): Promise<IndexedSourceEvidence[]> {
    const stats = await this.getIndexStats()
    return [
      await this.scanProgressService.buildEvidence({
        sourceId: this.id,
        watchPaths: this.watchPaths,
        pendingPermissionPaths: this.getPendingWatchPermissionPaths(),
        stats,
        isIndexingActive: this.isInitializing !== null || this.backgroundStartupPromise !== null
      }),
      ...buildFileProviderRuntimeEvidence({
        sourceId: this.id,
        integrity: this.lastIntegritySnapshot,
        flush: this.indexRuntimeService.getFlushSnapshot(),
        backlog: this.getIndexBacklogSnapshot(),
        incrementalPersist: this.incrementalPersistSnapshotService.getSnapshot(),
        ftsWrite: this.ftsWriteSnapshotService.getSnapshot(),
        ftsDelete: this.ftsDeleteSnapshotService.getSnapshot(),
        embeddingPause: this.embeddingService?.getUsageLimitPause() ?? null
      })
    ]
  }

  /**
   * 获取失败文件的安全摘要：只有 basename 和稳定分类跨越 transport 边界，
   * 绝对路径与原始解析错误仅保留在主进程本地诊断中。
   */
  public async getFailedFiles(): Promise<FileIndexFailedFilesResult> {
    if (!this.dbUtils) return { files: [] }

    // Same home as the failed-files cleanup task reads/deletes.
    const db = this.dbUtils.getFileIndexReadDb()
    const rows = await db
      .select({
        fileId: fileIndexProgress.fileId,
        path: filesSchema.path,
        lastError: fileIndexProgress.lastError,
        updatedAt: fileIndexProgress.updatedAt
      })
      .from(fileIndexProgress)
      .innerJoin(filesSchema, eq(fileIndexProgress.fileId, filesSchema.id))
      .where(eq(fileIndexProgress.status, 'failed'))
      .limit(500)

    return {
      files: rows.map((row) => ({
        fileId: row.fileId,
        fileName: path.basename(row.path),
        errorCode: classifyFailedFileIndexError(row.lastError),
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null
      }))
    }
  }

  /**
   * Get battery level and charging status
   */
  public async getBatteryLevel(): Promise<FileIndexBatteryStatus | null> {
    const status = await deviceIdleService.getBatteryStatus()
    if (!status) return null
    return {
      level: status.level,
      charging: status.charging
    }
  }

  /**
   * 手动触发重建索引（清空 scan_progress 强制全量扫描）
   */
  public async rebuildIndex(request?: FileIndexRebuildRequest): Promise<FileIndexRebuildResult> {
    if (this.isInitializing && this.indexRunSource === 'manual') {
      return {
        success: false,
        reason: 'initializing'
      }
    }

    if (!this.initializationContext) {
      return {
        success: false,
        reason: 'missing-context'
      }
    }

    const force = request?.force === true
    const batteryStatus = await this.getBatteryLevel()
    const criticalThreshold = deviceIdleService.getSettings().blockBatteryBelowPercent

    if (batteryStatus && batteryStatus.level < criticalThreshold && !force) {
      return {
        success: false,
        requiresConfirm: true,
        reason: 'battery-low',
        battery: batteryStatus,
        threshold: criticalThreshold
      }
    }
    await this.preemptBackgroundIndexing()

    this.logInfo('Manual index rebuild triggered', {
      force,
      batteryLevel: batteryStatus?.level ?? null,
      batteryCharging: batteryStatus?.charging ?? null
    })

    // 如果 onLoad 中途失败导致 dbUtils 为空，尝试用 initializationContext 重新初始化
    if (!this.dbUtils && this.initializationContext) {
      try {
        this.dbUtils = createDbUtils(
          this.initializationContext.databaseManager.getDb(),
          undefined,
          {
            enabled: this.initializationContext.databaseManager.isSearchSplitEnabled(),
            searchDb: this.initializationContext.databaseManager.getSearchDb(),
            writer: searchIndexWriter
          }
        )
        this.searchIndex = this.initializationContext.searchIndex
        this.logInfo('Re-initialized dbUtils from saved context')
      } catch (err) {
        this.logError('Failed to re-initialize dbUtils', err)
        return {
          success: false,
          reason: 'missing-context'
        }
      }
    }

    if (this.dbUtils) {
      try {
        const resetResult = await this.resetFileIndexRuntimeStateViaIndexedRuntime({
          sourceId: this.id,
          reason: IndexedSourceResetReasons.ManualRebuild,
          clearScanProgress: true,
          // 手动/强制重建应产出全新索引：清空现有行，避免如今已越界的条目残留
          // （例如旧版本错误索引的 *.photoslibrary bundle 内容），否则重扫不会主动删除它们。
          clearSearchIndex: true
        })
        if (resetResult.error) {
          return {
            success: false,
            errorCode: resetResult.errorCode,
            retryable: resetResult.retryable,
            reportId: resetResult.reportId,
            battery: batteryStatus
          }
        }
      } catch (error) {
        const busy = isSqliteBusyError(error)
        const report = operationalErrorService.report({
          domain: 'file-index',
          operation: 'manual-rebuild',
          error,
          code: busy ? 'FILE_INDEX_DATABASE_BUSY' : 'FILE_INDEX_REBUILD_FAILED',
          retryable: busy,
          userImpact: 'blocked'
        })
        return {
          success: false,
          errorCode: report.code,
          retryable: report.retryable,
          reportId: report.id,
          battery: batteryStatus
        }
      }
    }

    await this.ensureFileSystemWatchers()
    this.manualRebuildPendingNotification = true
    void this.requireRuntimeMutationDelegate()
      .scanSource(IndexedSourceScanReasons.ManualRebuild)
      .then(() => this.notifyManualRebuildCompleted())
      .catch((error) => {
        this.manualRebuildPendingNotification = false
        this.logWarn('Manual index rebuild failed before completion notification', error)
      })

    return {
      success: true,
      battery: batteryStatus
    }
  }

  public async addWatchPath(rawPath: string): Promise<FileIndexAddPathResult> {
    const trimmed = typeof rawPath === 'string' ? rawPath.trim() : ''
    if (!trimmed) {
      return { success: false, status: 'invalid', reason: 'path-empty' }
    }

    // Manual-add ingress: normalize before the path becomes a watch root or an
    // index id (see normalizeFsPath).
    const resolved = normalizeFsPath(path.resolve(trimmed))
    let stats: Awaited<ReturnType<typeof fs.stat>>
    try {
      stats = await fs.stat(resolved)
    } catch (error) {
      this.logWarn('File index addPath failed: path not found', error, { path: resolved })
      return { success: false, status: 'invalid', reason: 'path-not-found' }
    }

    const isFileTarget = stats.isFile()
    const watchPath = stats.isDirectory() ? resolved : path.dirname(resolved)

    if (this.isWithinWatchRoots(watchPath)) {
      if (isFileTarget) {
        await this.preemptBackgroundIndexing()
        this.logDebug('addWatchPath exists(root), enqueue incremental add', {
          path: resolved,
          watchPath
        })
        this.logInfo('File index addPath hit existing watch root; enqueue incremental add', {
          path: resolved,
          watchPath
        })
        this.enqueueIncrementalUpdate(resolved, 'add', { manual: true })
      }
      return { success: true, status: 'exists', path: watchPath }
    }

    const nextExtraPaths = [...this.fileIndexSettings.extraPaths, watchPath]
    try {
      await this.watchService.updateFileIndexSettings({ extraPaths: nextExtraPaths })
      this.syncWatchServiceState()
    } catch (error) {
      const report = operationalErrorService.report({
        domain: 'file-index',
        operation: 'add-watch-path',
        error,
        code: 'FILE_INDEX_SETTINGS_PERSIST_FAILED',
        retryable: true,
        userImpact: 'blocked'
      })
      return {
        success: false,
        status: 'error',
        path: resolved,
        errorCode: report.code,
        reportId: report.id
      }
    }

    if (this.watchPathsRegistered) {
      try {
        await FileSystemWatcher.addPath(watchPath, resolveWatchDepthForPath(watchPath))
      } catch (error) {
        this.logWarn('Failed to register extra watch path', error, { path: watchPath })
      }
    } else {
      await this.ensureFileSystemWatchers()
    }

    await this.preemptBackgroundIndexing()
    if (!this.isInitializing) {
      void this.requireRuntimeMutationDelegate()
        .scanSource(IndexedSourceScanReasons.ManualRebuild)
        .catch((error) => {
          this.logWarn('Manual indexing failed after adding watch path', error)
        })
    }

    if (isFileTarget) {
      this.logDebug('addWatchPath added and enqueue incremental add', {
        path: resolved,
        watchPath
      })
      this.logInfo('File index addPath added watch path and enqueued incremental add', {
        path: resolved,
        watchPath
      })
      this.enqueueIncrementalUpdate(resolved, 'add', { manual: true })
    }

    return { success: true, status: 'added', path: watchPath }
  }

  /**
   * The stream the progress throttle publishes to. The publisher owns the subscriptions, the
   * replay for a late subscriber and the flush timer, so this only has to admit one.
   */
  public registerProgressStream(context: StreamContext<FileIndexProgressPayload>): void {
    this.progressStream.register(context)
  }

  private scanDirectoryBatchesWithWorker(
    ...args: Parameters<DirectoryBatchStream>
  ): AsyncIterable<ScannedFileInfo[]> {
    return this.scanStreamService.scanWithWorker(...args)
  }

  private scanDirectoryBatchesDirectStream(
    ...args: Parameters<DirectoryBatchStream>
  ): AsyncIterable<ScannedFileInfo[]> {
    return streamDirectoryBatchesDirect(...args)
  }

  private async getReconciliationDbFilesByPaths(
    paths: string[],
    options?: FileIndexRunOptions
  ): Promise<FileProviderReconciliationDbRecord[]> {
    if (paths.length === 0) return []
    options?.signal?.throwIfAborted()
    if (!this.dbUtils) throw new Error('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
    // Ids feed reconciliation update/delete records — same-home read (2d.3).
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

  private scheduleIndexing(
    files: FileProviderIndexSchedulerFile[],
    reason: string,
    mutationLeaseId?: string
  ): Promise<IndexedWorkerScheduleResult> {
    if (!this.contentIndexPolicyService.isEnabled() || !this.searchIndex || files.length === 0) {
      return Promise.resolve({ accepted: 0, deferred: 0 })
    }
    if (this.shuttingDown && !this.isInitializing && !mutationLeaseId) {
      return Promise.resolve({ accepted: 0, deferred: 0 })
    }
    return this.enqueueContentIndexing(files, reason, mutationLeaseId)
  }

  /**
   * Marks the dirty enrichment status durably BEFORE the bounded scheduler can
   * defer the batch, then admits what capacity allows. Records the scheduler
   * could not admit (`result.deferred`) stay pending in file_index_progress for
   * the enrichment-resume service; they are never buffered in memory.
   */
  private async enqueueContentIndexing(
    files: FileProviderIndexSchedulerFile[],
    reason: string,
    mutationLeaseId?: string
  ): Promise<IndexedWorkerScheduleResult> {
    if (!(await this.contentIndexPolicyService.checkAdmission())) {
      return { accepted: 0, deferred: files.length }
    }
    try {
      await this.markContentEnrichmentPending(files, mutationLeaseId)
    } catch (error) {
      if (this.contentIndexPolicyService.recordStorageFailure(error)) {
        return { accepted: 0, deferred: files.length }
      }
      throw error
    }
    if (
      !this.contentIndexPolicyService.isAdmissionEnabled() ||
      this.isInitializing ||
      this.maintenanceService.isBaseMutationSliceActive
    ) {
      return { accepted: 0, deferred: files.length }
    }
    if (this.shuttingDown && !this.isInitializing && !mutationLeaseId) {
      return { accepted: 0, deferred: 0 }
    }
    if (!mutationLeaseId) {
      this.enrichmentResumeService.resume(reason)
      return { accepted: 0, deferred: files.length }
    }
    return this.indexSchedulerService.schedule(files, reason, mutationLeaseId)
  }

  private async markContentEnrichmentPending(
    files: ReadonlyArray<{ id?: number | null }>,
    mutationLeaseId?: string
  ): Promise<void> {
    const dbUtils = this.dbUtils
    if (!dbUtils) return
    const fileIds = files
      .map((file) => file.id)
      .filter((fileId): fileId is number => typeof fileId === 'number')
    if (fileIds.length === 0) return
    // New files have no progress row and are covered by the resume query's
    // IS NULL branch; this flips any existing non-pending row (including a stale
    // `processing` row from a previous version) back to pending.
    if (this.isSearchSplitEnabledNow()) {
      await dbUtils.markFileEnrichmentPending(fileIds)
    } else {
      await scheduleDbWrite('file-index.enrichment.pending', () =>
        dbUtils.markFileEnrichmentPending(fileIds)
      )
    }
    if (mutationLeaseId) {
      this.logDebug('Marked file enrichment pending', {
        count: fileIds.length,
        mutationLeaseId
      })
    }
  }

  private normalizePath(p: string): string {
    // NFC first: comparison keys have to agree with the NFC-normalized paths
    // that scan/watch ingress writes into the index.
    return normalizeWatchPath(normalizeFsPath(p), this.isCaseInsensitiveFs)
  }

  private isWithinWatchRoots(rawPath: string): boolean {
    return Boolean(this.watchService?.ownsWatchPath?.(rawPath))
  }

  /** Current file-source scope; native providers keep their own admission rules. */
  public isSearchPathAdmitted(filePath: string): boolean {
    return this.maintenanceService.isSearchPathAdmitted(filePath)
  }

  /**
   * Single ingress for every non-scan path that reaches the index: watcher
   * events and manual adds both land here, and macOS hands them over
   * decomposed (NFD). Normalizing once here is what lets DB lookups compare
   * like with like — see normalizeFsPath.
   */
  private enqueueIncrementalUpdate(
    rawPath: string,
    action: FileProviderIncrementalAction,
    options?: { manual?: boolean }
  ): void {
    if (this.shuttingDown) return
    this.incrementalQueueService.enqueue(normalizeFsPath(rawPath), action, options)
  }

  private async prepareIncrementalFlush(): Promise<boolean> {
    if (this.shuttingDown) return false

    if (!this.dbUtils) {
      this.logWarn('flushIncrementalQueue skipped: dbUtils not ready.')
      return false
    }

    return true
  }

  private async processIncrementalEntries(entries: FileProviderIncrementalEntry[]): Promise<void> {
    let offset = 0
    while (offset < entries.length) {
      const deleting = entries[offset][1].action === 'delete'
      let end = offset + 1
      while (
        end < entries.length &&
        end - offset < FILE_MAINTENANCE_SLICE_SIZE &&
        (entries[end][1].action === 'delete') === deleting
      )
        end += 1
      const chunk = entries.slice(offset, end)
      if (deleting) await this.handleIncrementalDeletes(chunk.map(([, payload]) => payload.rawPath))
      else await this.handleIncrementalAddsOrChanges(chunk as FileProviderIncrementalChangeEntry[])
      offset = end
    }
  }

  private async handleIncrementalDeletes(
    paths: string[],
    options: FileIndexRunOptions = { maintenance: false }
  ): Promise<IndexedWriteDeleteExecutorResult<FileProviderReconciliationDbRecord>> {
    const deleted: FileProviderReconciliationDbRecord[] = []
    for (const chunk of chunkArray(paths, FILE_MAINTENANCE_SLICE_SIZE)) {
      options.signal?.throwIfAborted()
      const records = await this.maintenanceService.findIncrementalDeleteRecords(chunk)
      const result = await this.maintenanceService.deleteFileRecords(records, 'watch', {
        ...options,
        maintenance: false
      })
      deleted.push(...result.deleted)
    }
    return {
      deleted,
      deletedIds: deleted.map((record) => record.id),
      deletedPaths: deleted.map((record) => record.path)
    }
  }

  private async handleIncrementalAddsOrChanges(
    entries: Array<[string, { action: 'add' | 'change'; rawPath: string; manual?: boolean }]>,
    options: { dispatchSideEffects?: boolean } = {}
  ): Promise<void> {
    if (!this.dbUtils) return

    const startedAt = performance.now()
    try {
      const result = await this.incrementalWriteService.execute(
        entries as FileProviderIncrementalChangeEntry[],
        options
      )
      if (options.dispatchSideEffects !== false) {
        const records = [...result.inserted, ...result.updated, ...result.refreshed].map((record) =>
          this.mapFileToIndexedSourceRecord(record)
        )
        if (records.length > 0) {
          const delegate = this.requireRuntimeMutationDelegate()
          if (result.refreshed.length > 0) {
            await delegate.withMutationLease(async (leaseId) => {
              if (this.contentIndexPolicyService.isEnabled()) {
                await this.markContentEnrichmentPending(result.refreshed, leaseId)
              }
              await delegate.applyBatch({ sourceId: this.id, records, mutationLeaseId: leaseId })
              await this.drainIndexedSourceMutations('mutation', leaseId)
            })
          } else {
            await delegate.applyBatch({ sourceId: this.id, records })
          }
        }
      }
      recordRuntimeWriteSnapshot(this.incrementalPersistSnapshotService, {
        entries: result.inserted.length + result.updated.length,
        reason: 'incremental.add-change',
        durationMs: performance.now() - startedAt,
        metadata: {
          requestedRows: entries.length,
          insertedRows: result.inserted.length,
          updatedRows: result.updated.length,
          unchangedRows: result.unchangedCount,
          manual: result.manual,
          storeBoundary: 'incremental-db-persist'
        }
      })
    } catch (error) {
      recordRuntimeWriteFailureSnapshot(this.incrementalPersistSnapshotService, {
        error,
        reason: 'incremental.add-change',
        entries: entries.length,
        metadata: {
          requestedRows: entries.length,
          storeBoundary: 'incremental-db-persist'
        }
      })
      throw error
    }
  }

  private async insertIncrementalRecords(
    records: Array<typeof filesSchema.$inferInsert>
  ): Promise<Array<typeof filesSchema.$inferSelect>> {
    return await this.incrementalInsertExecutor.execute(records, { dispatchSideEffects: false })
  }

  private async buildFileRecord(
    rawPath: string,
    options?: { manualForce?: boolean }
  ): Promise<typeof filesSchema.$inferInsert | null> {
    try {
      const stats = await fs.lstat(rawPath)
      if (stats.isSymbolicLink() || !stats.isFile()) return null

      const manualForce = options?.manualForce === true
      const name = path.basename(rawPath)
      const extension = path.extname(name).toLowerCase()
      const target = { path: rawPath, name, extension }
      const exclusionReason = manualForce
        ? fileFilterService.getManualIndexExclusionReason(target)
        : !WHITELISTED_EXTENSIONS.has(extension)
          ? 'unsupported-extension'
          : (fileFilterService.getManualIndexExclusionReason(target) ??
            (await getFileTraversalExclusionReason(rawPath, undefined, this.watchPaths)))

      if (exclusionReason) {
        this.logDebug('Skipped incremental file by unified filter', {
          path: rawPath,
          extension,
          reason: exclusionReason,
          manualForce
        })
        return null
      }

      if (manualForce && !WHITELISTED_EXTENSIONS.has(extension)) {
        this.logDebug('Accepted manual incremental file outside automatic whitelist', {
          path: rawPath,
          extension
        })
      }

      const record = {
        path: rawPath,
        name,
        extension,
        size: stats.size,
        mtime: stats.mtime,
        ctime: stats.birthtime ?? stats.ctime,
        lastIndexedAt: new Date(),
        isDir: false,
        type: 'file'
      }
      if (manualForce) return record
      return (await this.maintenanceService.capacity.admit([record]))[0] ?? null
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err?.code !== 'ENOENT') {
        this.logError('Failed to read file metadata', error, { path: rawPath })
      }
      return null
    }
  }

  /**
   * Lightweight cross-table integrity check.
   *
   * When an inconsistency is detected (e.g. FTS5 was dropped/emptied but
   * files table still has data), we only:
   *   1. Clear scan_progress  — forces the normal worker-based scan pipeline
   *      to do a full re-scan and naturally re-index everything into FTS5.
   *   2. Clear stale FTS5/keyword_mappings entries for this provider so the
   *      re-scan starts from a clean slate.
   *
   * This avoids doing a heavy rebuild on the main thread which
   * previously caused the app to freeze.
   */
  private async runIntegrityCheck(
    db: LibSQLDatabase<typeof schema>,
    mutationLeaseId?: string
  ): Promise<FileProviderIntegritySnapshot> {
    const snapshot = await this.integrityService.check(db, {
      repair: false,
      mutationLeaseId
    })
    this.lastIntegritySnapshot = snapshot
    return snapshot
  }

  private async _initialize(options?: FileIndexRunOptions): Promise<FileIndexSyncStats> {
    options?.signal?.throwIfAborted()
    const initStart = performance.now()
    const stats = createFileIndexSyncStats()
    this.logDebug('Starting index process')
    if (!this.dbUtils) return stats

    // Integrity compares FTS rows (worker home) against files rows — both
    // counts must come from the SAME home or the check flags phantom
    // inconsistencies (primary's stale file rows vs the search file's index).
    const db = this.dbUtils.getFileIndexReadDb()
    // file_index_progress 表由数据库迁移自动创建，无需手动创建
    const excludePathsSet = this.databaseFilePath ? new Set([this.databaseFilePath]) : undefined

    // If FTS5 table was recreated (schema migration), clear scan_progress
    // so all watch paths go through full scan and content gets re-indexed.
    if (this.searchIndex?.didMigrate) {
      this.logInfo('FTS5 table was migrated — clearing scan_progress for full re-index')
      await this.resetIndexedSourceRuntimeState({
        sourceId: this.id,
        reason: IndexedSourceResetReasons.SchemaMigration,
        clearSearchIndex: false,
        clearScanProgress: true
      })
    }

    // --- Cross-table integrity check ---
    // Detects inconsistencies between files table, FTS5 index, keyword_mappings,
    // and scan_progress. These can arise from interrupted migrations, crashes,
    // or previous schema changes that dropped the FTS5 table.
    if (this.searchIndex) {
      const integrity = await this.runIntegrityCheck(db, options?.mutationLeaseId)
      if (integrity.needsRebuild) {
        await this.resetIndexedSourceRuntimeState({
          sourceId: this.id,
          reason: IndexedSourceResetReasons.IntegrityRepair,
          clearSearchIndex: false,
          clearScanProgress: true
        })
      }
    }
    // Yield after heavy integrity check queries
    await new Promise<void>((resolve) => setImmediate(resolve))
    options?.signal?.throwIfAborted()

    // --- 1. Index Cleanup (FR-IX-4) ---
    if (
      options?.maintenance !== false &&
      !(await this.maintenanceService.replayPendingFileDeletionCommits({
        ...options,
        maintenanceDeadlineAt: performance.now() + FILE_MAINTENANCE_ROUND_BUDGET_MS
      }))
    ) {
      stats.pending = true
      this.maintenanceService.scheduleFileMaintenance()
      this.progressState.emit('idle', 0, 0)
      return stats
    }
    const cleanupResult = await this.maintenanceService.runConfigurationCleanup(options)
    stats.deleted += cleanupResult.deletedCount
    stats.pending = !cleanupResult.done
    if (!cleanupResult.done) this.maintenanceService.scheduleFileMaintenance()
    options?.signal?.throwIfAborted()

    // --- 2. Determine Scan Strategy (FR-IX-3: Resumable Indexing) ---
    const { newPathsToScan, reconciliationPaths } = await this.scanStrategyService.resolve(
      this.watchPaths
    )
    options?.signal?.throwIfAborted()
    const completedScanProgressPaths = new Set<string>()
    const fullScanCheckpointsToClear = new Map<string, string[]>()

    // --- 3. Full Scan for New Paths ---
    if (newPathsToScan.length > 0) {
      const fullScanResult = await this.fullScanRunService.execute(newPathsToScan, options, {
        excludePathsSet
      })
      stats.added += fullScanResult.added
      if (fullScanResult.completedPaths.length < newPathsToScan.length) stats.pending = true
      for (const scannedPath of fullScanResult.completedPaths) {
        completedScanProgressPaths.add(scannedPath)
      }
      for (const [rootPath, children] of fullScanResult.checkpointsToClear) {
        fullScanCheckpointsToClear.set(rootPath, children)
      }
    }
    options?.signal?.throwIfAborted()

    // --- 4. Reconciliation Scan for Existing Paths (FR-IX-2) ---
    if (reconciliationPaths.length > 0) {
      const reconciliationResult = await this.reconciliationRunService.execute(
        reconciliationPaths,
        options,
        {
          excludePathsSet
        }
      )
      stats.added += reconciliationResult.added
      stats.changed += reconciliationResult.changed
      stats.deleted += reconciliationResult.deleted
      stats.skipped += reconciliationResult.skipped
      if (reconciliationResult.completedPaths.length < reconciliationPaths.length)
        stats.pending = true
      for (const reconciledPath of reconciliationResult.completedPaths) {
        completedScanProgressPaths.add(reconciledPath)
      }
    }
    options?.signal?.throwIfAborted()

    if (completedScanProgressPaths.size > 0) {
      const scanTime = new Date()
      await this.scanProgressService.upsertCompletedPaths(
        Array.from(completedScanProgressPaths),
        scanTime.toISOString(),
        'scan-progress.upsert'
      )
      // Only once the root's own record exists: a root that is both unrecorded and stripped of
      // its child checkpoints would be rescanned from zero on the next boot.
      for (const [rootPath, children] of fullScanCheckpointsToClear) {
        if (!completedScanProgressPaths.has(rootPath)) continue
        await this.fullScanCheckpointService.clearRootCheckpoints(children)
      }
    }

    this.progressState.emit(
      stats.pending ? 'idle' : 'completed',
      stats.pending ? 0 : 1,
      stats.pending ? 0 : 1
    )
    this.logInfo(
      stats.pending ? 'Index round paused with durable remaining work' : 'Index process complete',
      {
        duration: formatDuration(performance.now() - initStart)
      }
    )

    // Schedule deferred thumbnail generation (low-priority, non-blocking)
    void this.assetService.generateMissingThumbnails()
    return stats
  }

  private async _processFileUpdates(
    filesToUpdate: FileUpdateRecord[],
    chunkSize = 10
  ): Promise<Array<typeof filesSchema.$inferSelect>> {
    if (!this.dbUtils) return []
    return await this.fileUpdateExecutor.execute(filesToUpdate, chunkSize, {
      dispatchSideEffects: false
    })
  }

  private async processFileExtensions(files: (typeof filesSchema.$inferSelect)[]): Promise<void> {
    return this.extensionService.processFileExtensions(files)
  }

  public async getIndexingProgress(paths?: string[]): Promise<FileProviderIndexingProgressResult> {
    return this.indexingProgressService.getIndexingProgress(paths)
  }

  public async getWorkerStatusSnapshot(): Promise<FileProviderWorkerStatusSnapshot> {
    return this.workerStatusService.getSnapshot(async () => [
      await this.fileScanWorker.getStatus(),
      await this.fileIndexWorker.getStatus(),
      await this.reconcileWorker.getStatus(),
      ...(await Promise.all(this.assetService.getWorkerStatuses())),
      ...(this.filePersistencePort ? [await this.filePersistencePort.getStatus()] : [])
    ])
  }

  /** Numeric, content-free backlog diagnostics; see {@link FileProviderIndexBacklogSnapshot}. */
  public getIndexBacklogSnapshot(): FileProviderIndexBacklogSnapshot {
    return {
      scheduler: this.indexSchedulerService.getSnapshot(),
      buffer: this.indexRuntimeService.getBufferSnapshot()
    }
  }

  public isSearchIndexWorkerBusy(mutationLeaseId?: string): boolean {
    if (mutationLeaseId !== undefined) {
      if (this.indexSchedulerService.hasPendingWork(mutationLeaseId)) return true
      if (this.indexRuntimeService.isMutationLeaseDetached(mutationLeaseId)) return false
      for (const result of this.pendingIndexWorkerResults.values()) {
        if (result.mutationLeaseId === mutationLeaseId) return true
      }
      for (const result of this.inflightIndexWorkerResults.values()) {
        if (result.mutationLeaseId === mutationLeaseId) return true
      }
      return false
    }
    return (
      this.indexSchedulerService.hasPendingWork() ||
      this.fileIndexWorker.hasPendingWork() ||
      this.pendingIndexWorkerResults.size > 0 ||
      this.inflightIndexWorkerResults.size > 0 ||
      (this.filePersistencePort?.hasPendingWork() ?? false)
    )
  }

  private async waitForSearchIndexDrain(reason: string, mutationLeaseId?: string): Promise<void> {
    const timeoutMs = this.indexSchedulerService.getDrainTimeoutMs(mutationLeaseId !== undefined)
    const deadline = Date.now() + timeoutMs
    await this.indexSchedulerService.drain(Math.max(1, deadline - Date.now()), mutationLeaseId)

    while (true) {
      // Do not await a foreign publication while holding this source's gate.
      if (mutationLeaseId !== undefined && !this.isSearchIndexWorkerBusy(mutationLeaseId)) return
      this.indexRuntimeService.scheduleFlush(0, 'source-drain')
      if (!this.isSearchIndexWorkerBusy(mutationLeaseId)) {
        if (mutationLeaseId === undefined && this.filePersistencePort) {
          await this.filePersistencePort.drain(Math.max(1, deadline - Date.now()))
        }
        return
      }
      if (Date.now() >= deadline) break
      await new Promise<void>((resolve) => setTimeout(resolve, FILE_INDEX_SEARCH_DRAIN_INTERVAL_MS))
    }

    this.logWarn('Search index drain timed out after indexed-source scan', undefined, {
      reason,
      timeoutMs,
      busy: this.isSearchIndexWorkerBusy(mutationLeaseId),
      mutationLeaseId
    })
    throw new Error(`file-index-search-drain-timeout:${reason}`)
  }

  /**
   * Deferred semantic recall entry point used by the search engine after first results render.
   * Returns brand-new semantically-related items only (ids in `excludeIds` are filtered out),
   * so the caller can append them to the active session without duplicates.
   */
  public async semanticRecall(
    query: TuffQuery,
    excludeIds: Set<string>,
    signal: AbortSignal
  ): Promise<TuffItem[]> {
    if (!this.embeddingService) return []
    return this.searchResultService.semanticRecall(query, excludeIds, signal)
  }

  public hasSearchFilters(rawText: string): boolean {
    return this.searchResultService.hasFilters(rawText)
  }

  async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult> {
    return await this.searchResultService.search(query, signal)
  }

  onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    return executeIndexedFile(args, fileProviderLog)
  }
}

export const fileProvider = new FileProvider()
