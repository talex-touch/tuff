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
  FileIndexEstimateBasis,
  FileIndexEstimateStatus,
  FileIndexProgress as FileIndexProgressPayload,
  FileIndexRebuildRequest,
  FileIndexRebuildResult
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
  IndexedSourceWatchEvent
} from '@talex-touch/utils/search'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Buffer } from 'node:buffer'
import type { TouchApp } from '../../../../core/touch-app'
import type * as schema from '../../../../db/schema'
import type { SearchIndexService } from '../../search-engine/search-index-service'
import type { ProviderContext } from '../../search-engine/types'
import type { FileTypeTag } from './constants'
import type { FileIndexSettings, ScannedFileInfo } from './types'
import type { IndexWorkerFileResult } from './workers/file-index-worker-client'
import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import {
  StorageList,
  timingLogger,
  TuffItemBuilder,
  TuffInputType,
  TuffSearchResultBuilder
} from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { runAdaptiveTaskQueue } from '@talex-touch/utils/common/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { OpenerEvents } from '@talex-touch/utils/transport/events'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import {
  IndexedSourceIntegrityEvidenceService,
  IndexedWriteFlushEvidenceService,
  IndexedSourceResetReasons,
  IndexedSourceScanReasons,
  IndexedWriteRuntimeEmitterService,
  isIndexedWatchPathOwned,
  mapIndexedFileSourceRecord,
  resolveIndexedWatchRootSet
} from '@talex-touch/utils/search'
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core/alias'
import { app, shell } from 'electron'
import { notificationModule } from '../../../notification'
import { t } from '../../../../utils/i18n-helper'
import emptyOpenerSvg from '../../../../../renderer/src/assets/svg/EmptyAppPlaceholder.svg?raw'
import { dbWriteScheduler } from '../../../../db/db-write-scheduler'
import {
  embeddings as embeddingsSchema,
  fileExtensions,
  fileIndexProgress,
  files as filesSchema
} from '../../../../db/schema'
import { isSqliteBusyError, withSqliteRetry } from '../../../../db/sqlite-retry'
import { createDbUtils } from '../../../../db/utils'
import { appTaskGate } from '../../../../service/app-task-gate'
import { deviceIdleService } from '../../../../service/device-idle-service'
import { FILE_TIMING_BASE_OPTIONS } from '../../../../utils/file-indexing-utils'
import {
  normalizeRenderableSource,
  normalizeTuffItemLocalAssets,
  type LocalAssetFallbackKind
} from '../../../../utils/local-renderable-assets'
import { formatDuration } from '../../../../utils/logger'
import { enterPerfContext } from '../../../../utils/perf-context'
import { getMainConfig, saveMainConfig } from '../../../storage'
import { searchLogger } from '../../search-engine/search-logger'
import {
  BLACKLISTED_EXTENSIONS,
  getTypeTagsForExtension,
  KEYWORD_MAP,
  WHITELISTED_EXTENSIONS
} from './constants'
import { isIndexableFile, mapFileToTuffItem, scanDirectory } from './utils'
import {
  THUMBNAIL_EXTENSIONS,
  getThumbnailUnsupportedReason,
  isThumbnailCandidate
} from './thumbnail-config'
import { FileIndexWorkerClient } from './workers/file-index-worker-client'
import { FileReconcileWorkerClient } from './workers/file-reconcile-worker-client'
import { FileScanWorkerClient } from './workers/file-scan-worker-client'
import { EmbeddingService } from './embedding-service'
import { IconWorkerClient } from './workers/icon-worker-client'
import {
  ThumbnailWorkerClient,
  type ThumbnailGenerationResult
} from './workers/thumbnail-worker-client'
import { AdaptiveBatchScheduler } from '../../search-engine/adaptive-batch-scheduler'
import {
  IndexedWriteDeleteExecutorService,
  type IndexedWriteDeleteExecutorResult,
  type IndexedWriteDeleteRecord
} from '../../search-engine/indexing-write-delete-executor-service'
import {
  IndexedWriteInsertExecutorService,
  IndexedWriteUpdateExecutorService
} from '@talex-touch/utils/search'
import {
  SearchIndexWorkerClient,
  type UpsertFileRecord
} from '../../search-engine/workers/search-index-worker-client'
import {
  getProgressStreamFlushDelayMs,
  shouldEmitProgressStreamImmediately
} from './services/file-provider-progress-stream-service'
import { FileProviderProgressEstimatorService } from './services/file-provider-progress-estimator-service'
import {
  FileProviderWorkerStatusService,
  type FileProviderWorkerStatusSnapshot
} from './services/file-provider-worker-status-service'
import {
  getWatchDepthForPath as resolveWatchDepthForPath,
  normalizeWatchPath
} from './services/file-provider-path-service'
import {
  buildFtsQuery as buildFileProviderFtsQuery,
  resolveExtensionsForTypeFilters as resolveFileProviderExtensionsForTypeFilters,
  resolveTypeTag as resolveFileProviderTypeTag
} from './services/file-provider-search-service'
import {
  FILE_ICON_META_EXTENSION_KEY,
  persistFileIconCache,
  type FileIconCacheMeta
} from './services/file-provider-icon-cache-service'
import { FileProviderWatchService } from './services/file-provider-watch-service'
import {
  FileProviderOpenerService,
  type ResolvedOpener
} from './services/file-provider-opener-service'
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
import { FileProviderIndexRuntimeService } from './services/file-provider-index-runtime-service'
import {
  FileProviderIntegrityService,
  type FileProviderIntegritySnapshot
} from './services/file-provider-integrity-service'
import { FileProviderScanProgressService } from './services/file-provider-scan-progress-service'
import { FileProviderRuntimeResetService } from './services/file-provider-runtime-reset-service'
import { FileProviderWriteSideEffectService } from './services/file-provider-write-side-effect-service'
import { FileProviderIndexSchedulerService } from './services/file-provider-index-scheduler-service'
import { FileProviderIndexPersistEntryMapperService } from './services/file-provider-index-persist-entry-mapper-service'
import { FileProviderReconciliationInsertService } from './services/file-provider-reconciliation-insert-service'
import { FileProviderCleanupDeleteService } from './services/file-provider-cleanup-delete-service'
import { FileProviderFullScanInsertService } from './services/file-provider-full-scan-insert-service'
import { FileProviderFullScanRunService } from './services/file-provider-full-scan-run-service'
import { FileProviderReconciliationDeleteService } from './services/file-provider-reconciliation-delete-service'
import { FileProviderReconciliationDiffService } from './services/file-provider-reconciliation-diff-service'
import {
  FileProviderReconciliationRunService,
  type FileProviderReconciliationDbRecord
} from './services/file-provider-reconciliation-run-service'
import { FileProviderReconciliationUpdateService } from './services/file-provider-reconciliation-update-service'
import { FileProviderScanStrategyService } from './services/file-provider-scan-strategy-service'
import FileSystemWatcher from '../../file-system-watcher'

const fileProviderLog = getLogger('file-provider')
const SEMANTIC_TRIGGER_MIN_QUERY_LENGTH = 3
const SEMANTIC_TRIGGER_MAX_CANDIDATES = 20
const SEMANTIC_SEARCH_TIMEOUT_MS = 120
const BASE64_MARKER = 'base64,'
const BASE64_PAYLOAD_PATTERN = /^[A-Za-z0-9+/=]+$/
const THUMBNAIL_STATUS_KEY = 'thumbnailStatus'
const FILE_PROVIDER_STARTUP_READY_WAIT_MS = 3_000
const FILE_EXTENSION_WRITE_MAX_QUEUE = 12
const FILE_ICON_WRITE_MAX_QUEUE = 24
const fileIntegrityEvidenceService = new IndexedSourceIntegrityEvidenceService()
const indexFlushEvidenceService = new IndexedWriteFlushEvidenceService()

function isValidBase64DataUrl(value: string): boolean {
  const markerIndex = value.indexOf(BASE64_MARKER)
  if (markerIndex === -1) {
    return true
  }
  const payload = value.slice(markerIndex + BASE64_MARKER.length)
  if (!payload) {
    return false
  }
  return BASE64_PAYLOAD_PATTERN.test(payload)
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const safeChunkSize = Math.max(1, Math.floor(chunkSize))
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += safeChunkSize) {
    chunks.push(items.slice(i, i + safeChunkSize))
  }
  return chunks
}

interface IconCacheEntry {
  icon?: string | null
  meta?: FileIconCacheMeta
}

interface ThumbnailStatusPayload {
  status: 'failed' | 'unsupported'
  reason: string
  mtime: number | null
  size: number | null
  at: number
}

type ThumbnailFileSnapshot = Pick<typeof filesSchema.$inferSelect, 'mtime' | 'size'>

interface FileUpdateRecord {
  id: number
  path: string
  name: string
  extension: string | null
  size: number | null
  ctime: Date
  mtime: Date
  type: string
  isDir: boolean
}

type EmbeddingDbExecutor = Pick<LibSQLDatabase<typeof schema>, 'delete'>

const FILE_PROVIDER_PROGRESS_TASK_ID = 'file-provider.progress-cleanup'
const pollingService = PollingService.getInstance()

const DEFAULT_FILE_INDEX_SETTINGS: FileIndexSettings = {
  autoScanEnabled: true,
  autoScanIntervalMs: 24 * 60 * 60 * 1000,
  autoScanIdleThresholdMs: 60 * 60 * 1000,
  autoScanCheckIntervalMs: 5 * 60 * 1000,
  extraPaths: []
}

const fileIndexFailedEvent = defineRawEvent<
  {
    error: string
    stack?: string
    timestamp: number
  },
  void
>('file-index:failed')
const EMPTY_OPENER_LOGO = `data:image/svg+xml;utf8,${encodeURIComponent(emptyOpenerSvg.trim())}`

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

interface FileIndexSyncStats {
  added: number
  changed: number
  deleted: number
  skipped: number
  errors: number
}

interface FileIndexRunOptions {
  onRecordBatch?: (batch: IndexedSourceRecordBatch) => void | Promise<void>
  onDelta?: (delta: IndexedSourceDelta) => void | Promise<void>
}

interface FileIndexedSourceScanResult {
  batches: IndexedSourceRecordBatch[]
}

type FileIndexedSourceRuntimeResetDelegate = (
  request: IndexedSourceResetRequest
) => Promise<IndexedSourceResetResult>

function createFileIndexSyncStats(): FileIndexSyncStats {
  return {
    added: 0,
    changed: 0,
    deleted: 0,
    skipped: 0,
    errors: 0
  }
}

class FileProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'file-provider'
  readonly name = 'File Provider'
  readonly type = 'file' as const
  readonly supportedInputTypes = [TuffInputType.Text, TuffInputType.Files]
  readonly priority = 'deferred' as const
  readonly expectedDuration = 500

  private dbUtils: ReturnType<typeof createDbUtils> | null = null
  private isInitializing: Promise<FileIndexSyncStats> | null = null
  private initializationFailed: boolean = false
  private initializationError: Error | null = null
  private initializationContext: ProviderContext | null = null
  private readonly baseWatchPaths: string[]
  private watchPaths: string[]
  private normalizedWatchPaths: string[]
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
    maxSize: 20,
    targetMs: 300,
    minSize: 2,
    ssthresh: 10
  })
  private watchPathsRegistered = false
  private readonly isCaseInsensitiveFs =
    process.platform === 'darwin' || process.platform === 'win32'
  private readonly timestampToleranceMs = 1_000

  private openersChannelRegistered = false
  private readonly progressStreamContexts = new Set<StreamContext<FileIndexProgressPayload>>()
  private lastProgressStreamPayload: FileIndexProgressPayload | null = null
  private lastProgressStreamEmitAt = 0
  private pendingProgressStreamPayload: FileIndexProgressPayload | null = null
  private progressStreamFlushTimer: NodeJS.Timeout | null = null
  private readonly iconExtractionPending = new Map<string, Promise<Buffer | null>>()
  private readonly fileScanWorker = new FileScanWorkerClient()
  private readonly reconcileWorker = new FileReconcileWorkerClient()
  private readonly fileIndexWorker: FileIndexWorkerClient

  private readonly iconWorker = new IconWorkerClient()
  private readonly searchIndexWorker = new SearchIndexWorkerClient()
  private searchIndexWorkerReady: Promise<boolean> | null = null
  private backgroundStartupPromise: Promise<void> | null = null
  private backgroundStartupReady = false
  private backgroundStartupError: Error | null = null
  private readonly workerStatusService = new FileProviderWorkerStatusService()
  private readonly pendingIndexWorkerResults = new Map<number, IndexWorkerFileResult>()
  private readonly inflightIndexWorkerResults = new Map<number, IndexWorkerFileResult>()
  private manualRebuildPendingNotification = false
  private lastIntegritySnapshot: FileProviderIntegritySnapshot | null = null
  private indexedSourceRuntimeResetDelegate: FileIndexedSourceRuntimeResetDelegate | null = null

  private touchApp: TouchApp | null = null
  private fileIndexSettings: FileIndexSettings = { ...DEFAULT_FILE_INDEX_SETTINGS }
  private indexingProgress = {
    current: 0,
    total: 0,
    stage: 'idle' as 'idle' | 'cleanup' | 'scanning' | 'indexing' | 'reconciliation' | 'completed'
  }

  private async withDbWrite<T>(label: string, operation: () => Promise<T>): Promise<T> {
    return dbWriteScheduler.schedule(label, () => withSqliteRetry(operation, { label }))
  }

  private async waitForCacheWriteCapacity(maxQueued: number, label: string): Promise<boolean> {
    try {
      await dbWriteScheduler.waitForCapacity(maxQueued)
      return true
    } catch (error) {
      this.logWarn('Skipped cache write after DB backpressure failure', error, { label })
      return false
    }
  }

  private indexingStartTime: number | null = null
  private indexingStats = {
    processedItems: 0,
    startTime: 0,
    lastUpdateTime: 0,
    averageItemsPerSecond: 0,
    estimateStatus: 'unknown' as FileIndexEstimateStatus,
    speedSampleCount: 0,
    estimateBasis: 'none' as FileIndexEstimateBasis
  }
  private readonly progressEstimator = new FileProviderProgressEstimatorService()

  private readonly enableFileIconExtraction =
    (process.env.TALEX_FILE_PROVIDER_EXTRACT_ICONS ?? 'true').toLowerCase() !== 'false'
  private readonly watchService: FileProviderWatchService
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
  private readonly fileUpdateExecutor: IndexedWriteUpdateExecutorService<
    FileUpdateRecord,
    typeof filesSchema.$inferSelect
  >
  private readonly incrementalInsertExecutor: IndexedWriteInsertExecutorService<
    typeof filesSchema.$inferInsert,
    typeof filesSchema.$inferSelect
  >
  private readonly incrementalDeleteExecutor: IndexedWriteDeleteExecutorService<IndexedWriteDeleteRecord>
  private readonly cleanupDeleteService: FileProviderCleanupDeleteService<
    IndexedWriteDeleteRecord,
    FileIndexRunOptions | undefined
  >
  private readonly fullScanRunService: FileProviderFullScanRunService<
    FileIndexRunOptions | undefined
  >
  private readonly fullScanInsertService: FileProviderFullScanInsertService<
    typeof filesSchema.$inferSelect,
    FileIndexRunOptions | undefined
  >
  private readonly reconciliationDeleteService: FileProviderReconciliationDeleteService<
    IndexedWriteDeleteRecord,
    FileIndexRunOptions | undefined
  >
  private readonly reconciliationDiffService: FileProviderReconciliationDiffService
  private readonly reconciliationUpdateService: FileProviderReconciliationUpdateService<
    FileUpdateRecord,
    typeof filesSchema.$inferSelect,
    FileIndexRunOptions | undefined
  >
  private readonly reconciliationInsertService: FileProviderReconciliationInsertService<
    typeof filesSchema.$inferSelect,
    FileIndexRunOptions | undefined
  >
  private readonly reconciliationRunService: FileProviderReconciliationRunService<
    FileIndexRunOptions | undefined
  >
  private readonly indexSchedulerService: FileProviderIndexSchedulerService
  private readonly indexPersistEntryMapper: FileProviderIndexPersistEntryMapperService
  private readonly watchRuntimeEmitter =
    new IndexedWriteRuntimeEmitterService<IndexedFileSourceRecordRow>({
      sourceId: this.id,
      mapRecord: (record) => this.mapFileToIndexedSourceRecord(record),
      getPath: (record) => record.path
    })

  constructor() {
    const pathNames: ('documents' | 'downloads' | 'desktop' | 'music' | 'pictures' | 'videos')[] = [
      'documents',
      'downloads',
      'desktop',
      'music',
      'pictures',
      'videos'
    ]
    const paths = pathNames.map((name) => {
      try {
        return app.getPath(name)
      } catch (error) {
        this.logWarn('Could not resolve system path; skipping', error, {
          pathKey: name
        })
        return null
      }
    })
    this.baseWatchPaths = [...new Set(paths.filter((p): p is string => !!p))]
    const rootSet = resolveIndexedWatchRootSet({
      basePaths: this.baseWatchPaths,
      normalizePath: (rawPath) => this.normalizePath(rawPath)
    })
    this.watchPaths = rootSet.paths
    this.normalizedWatchPaths = rootSet.normalizedPaths
    this.watchService = new FileProviderWatchService({
      baseWatchPaths: this.baseWatchPaths,
      getDbUtils: () => this.dbUtils,
      getWatchDepthForPath: (watchPath) => this.getWatchDepthForPath(watchPath),
      normalizePath: (rawPath) => this.normalizePath(rawPath),
      enqueueIncrementalUpdate: (rawPath, action, manual) =>
        this.enqueueIncrementalUpdate(rawPath, action, { manual }),
      runAutoIndexing: () => this.runAutoIndexing(),
      logDebug: (message, meta) => this.logDebug(message, meta),
      logWarn: (message, error, meta) => this.logWarn(message, error, meta),
      logError: (message, error, meta) => this.logError(message, error, meta)
    })
    this.openerService = new FileProviderOpenerService({
      emptyLogo: EMPTY_OPENER_LOGO,
      enableFileIconExtraction: this.enableFileIconExtraction,
      getDbUtils: () => this.dbUtils,
      withDbWrite: (label, operation) => this.withDbWrite(label, operation),
      getStoredOpeners: () => {
        const raw = getMainConfig(StorageList.OPENERS) as unknown
        return raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as Record<string, OpenerInfo>)
          : {}
      },
      saveStoredOpeners: (next) => saveMainConfig(StorageList.OPENERS, next),
      extractFileIconQueued: (filePath) => this.extractFileIconQueued(filePath),
      isValidBase64DataUrl,
      logWarn: (message, error, meta) => this.logWarn(message, error, meta),
      logError: (message, error, meta) => this.logError(message, error, meta)
    })
    this.runtimeResetService = new FileProviderRuntimeResetService({
      sourceId: this.id,
      getDbUtils: () => this.dbUtils,
      normalizePath: (rawPath) => this.normalizePath(rawPath),
      removeSearchIndexByProvider: (providerId, reason) =>
        this.removeSearchIndexByProvider(providerId, reason),
      getScanProgressPaths: () => [...this.watchPaths],
      withDbWrite: (label, operation) => this.withDbWrite(label, operation),
      logInfo: (message, meta) => this.logInfo(message, meta)
    })
    this.integrityService = new FileProviderIntegrityService({
      sourceId: this.id,
      countSearchIndexByProvider: (providerId, reason) =>
        this.countSearchIndexByProvider(providerId, reason),
      resetRuntimeState: async (request) => {
        return await this.resetFileIndexRuntimeStateViaIndexedRuntime({
          sourceId: this.id,
          reason: request.reason,
          clearSearchIndex: request.clearSearchIndex,
          clearScanProgress: request.clearScanProgress
        })
      },
      logInfo: (message, meta) => this.logInfo(message, meta),
      searchIndexWorker: this.searchIndexWorker
    })
    this.scanProgressService = new FileProviderScanProgressService({
      getDbUtils: () => this.dbUtils,
      normalizePath: (rawPath) => this.normalizePath(rawPath),
      ensureSearchIndexWorkerReady: (reason) => this.ensureSearchIndexWorkerReady(reason),
      getSearchIndexWorker: () => this.searchIndexWorker
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
        return await this.dbUtils
          .getDb()
          .select()
          .from(filesSchema)
          .where(inArray(filesSchema.path, paths))
      },
      insertRecords: (records) => this.insertIncrementalRecords(records),
      updateRecords: (records) => this._processFileUpdates(records),
      logDebug: (message, meta) => this.logDebug(message, meta),
      logInfo: (message, meta) => this.logInfo(message, meta)
    })
    this.writeSideEffectService = new FileProviderWriteSideEffectService({
      processFileExtensions: (files) => this.processFileExtensions(files),
      scheduleIndexing: (files, reason) => this.scheduleIndexing(files, reason),
      logWarn: (message, error, meta) => this.logWarn(message, error, meta)
    })
    this.fileUpdateExecutor = new IndexedWriteUpdateExecutorService({
      waitBeforeChunk: async () => {
        await appTaskGate.waitForIdle()
        await dbWriteScheduler.waitForCapacity(4)
      },
      updateOne: (record) => this.updateFileRecord(record),
      refreshUpdated: (records) => this.refreshFileUpdateRecords(records),
      dispatchUpdated: (records) => {
        this.writeSideEffectService.dispatch(records, {
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
      persist: (records) => this.persistIncrementalRecords(records),
      dispatchInserted: (records) => {
        this.writeSideEffectService.dispatch(records, {
          extensionContext: 'incremental',
          indexReason: 'incremental-insert'
        })
      },
      logDebug: (message, meta) => this.logDebug(message, meta),
      successMessage: 'Incremental index completed'
    })
    this.incrementalDeleteExecutor = new IndexedWriteDeleteExecutorService({
      normalizePath: (rawPath) => path.normalize(rawPath),
      findExisting: (paths) => this.findIncrementalDeleteRecords(paths),
      deleteRecords: (records) => this.deleteIncrementalRecords(records),
      removeSearchIndexItems: (paths) => this.removeSearchIndexItems(paths, 'incremental.delete'),
      logDebug: (message, meta) => this.logDebug(message, meta),
      successMessage: 'Incremental remove completed'
    })
    this.cleanupDeleteService = new FileProviderCleanupDeleteService({
      sourceId: this.id,
      getAllIndexedFileRecords: async () => {
        if (!this.dbUtils) return []
        return await this.dbUtils
          .getDb()
          .select({ path: filesSchema.path, id: filesSchema.id })
          .from(filesSchema)
          .where(eq(filesSchema.type, 'file'))
      },
      isWithinWatchRoots: (filePath) => this.isWithinWatchRoots(filePath),
      yieldAfterRead: async () => {
        await new Promise<void>((resolve) => setImmediate(resolve))
      },
      deleteRecords: (records) => this.deleteCleanupRecords(records),
      removeSearchIndexItems: (paths) => this.removeCleanupSearchIndexItems(paths),
      emitDelta: (delta, runOptions) => this.emitIndexedSourceDelta(delta, runOptions),
      emitProgress: (current, total) => this.emitIndexingProgress('cleanup', current, total),
      now: () => performance.now(),
      formatDuration,
      logInfo: (message, meta) => this.logInfo(message, meta),
      logDebug: (message, meta) => this.logDebug(message, meta)
    })
    this.fullScanRunService = new FileProviderFullScanRunService({
      enterPerfContext: (label, metadata) => enterPerfContext(label, metadata),
      scanDirectory: (rootPath, currentExcludePathsSet) =>
        this.scanDirectoryWithWorker(rootPath, currentExcludePathsSet),
      insertRecords: (rootPath, records, runOptions) =>
        this.fullScanInsertService.execute(rootPath, records, runOptions),
      emitProgress: (current, total) => this.emitIndexingProgress('scanning', current, total),
      yieldAfterScan: async () => {
        await new Promise<void>((resolve) => setImmediate(resolve))
      },
      now: () => performance.now(),
      formatDuration,
      logDebug: (message, meta) => this.logDebug(message, meta)
    })
    this.fullScanInsertService = new FileProviderFullScanInsertService({
      sourceId: this.id,
      getBatchSize: () => this.upsertBatchScheduler.currentSize,
      recordBatchDuration: (durationMs) => this.upsertBatchScheduler.recordDuration(durationMs),
      waitForIdle: async () => {
        await appTaskGate.waitForIdle()
      },
      upsertFiles: (records, reason) => this.upsertSearchIndexFiles(records, reason),
      dispatchSideEffects: (records) => {
        this.writeSideEffectService.dispatch(records, {
          extensionContext: 'full-scan',
          indexReason: 'full-scan'
        })
      },
      emitRecordBatch: (batch, runOptions) =>
        this.emitIndexedSourceRecordBatchFromBatch(batch, runOptions),
      mapRecord: (record) => this.mapFileToIndexedSourceRecord(record),
      emitProgress: (current, total) => this.emitIndexingProgress('indexing', current, total),
      sleep: async (durationMs) => {
        await new Promise<void>((resolve) => setTimeout(resolve, durationMs))
      },
      now: () => performance.now(),
      formatDuration,
      logInfo: (message, meta) => this.logInfo(message, meta),
      logDebug: (message, meta) => this.logDebug(message, meta)
    })
    this.reconciliationDeleteService = new FileProviderReconciliationDeleteService({
      sourceId: this.id,
      deleteRecords: (records) => this.deleteReconciledRecords(records),
      emitDelta: (delta, runOptions) => this.emitIndexedSourceDelta(delta, runOptions)
    })
    this.reconciliationDiffService = new FileProviderReconciliationDiffService({
      reconcileWithWorker: (diskFiles, dbFiles, reconciliationPaths) =>
        this.reconcileWorker.reconcile(diskFiles, dbFiles, reconciliationPaths),
      logWarn: (message, error, meta) => this.logWarn(message, error, meta)
    })
    this.reconciliationUpdateService = new FileProviderReconciliationUpdateService({
      sourceId: this.id,
      updateRecords: (records) => this._processFileUpdates(records),
      emitDelta: (delta, runOptions) => this.emitIndexedSourceDelta(delta, runOptions),
      mapRecord: (record) => this.mapFileToIndexedSourceRecord(record)
    })
    this.reconciliationInsertService = new FileProviderReconciliationInsertService({
      sourceId: this.id,
      waitForIdle: async () => {
        await appTaskGate.waitForIdle()
      },
      runQueue: (chunks, handler, options) => runAdaptiveTaskQueue(chunks, handler, options),
      upsertFiles: (records, reason) => this.upsertSearchIndexFiles(records, reason),
      dispatchSideEffects: (records) => {
        this.writeSideEffectService.dispatch(records, {
          extensionContext: 'reconciliation',
          indexReason: 'reconciliation-insert'
        })
      },
      emitRecordBatch: (batch, runOptions) =>
        this.emitIndexedSourceRecordBatchFromBatch(batch, runOptions),
      emitDelta: (delta, runOptions) => this.emitIndexedSourceDelta(delta, runOptions),
      mapRecord: (record) => this.mapFileToIndexedSourceRecord(record),
      emitProgress: (current, total) => this.emitIndexingProgress('indexing', current, total),
      now: () => performance.now(),
      formatDuration,
      logDebug: (message, meta) => this.logDebug(message, meta)
    })
    this.reconciliationRunService = new FileProviderReconciliationRunService({
      enterPerfContext: (label, metadata) => enterPerfContext(label, metadata),
      waitForIdle: async () => {
        await appTaskGate.waitForIdle()
      },
      getDbFiles: (paths) => this.getReconciliationDbFiles(paths),
      scanDirectory: (rootPath, currentExcludePathsSet) =>
        this.scanDirectoryWithWorker(rootPath, currentExcludePathsSet),
      reconcile: (diskFiles, dbFiles, paths) =>
        this.reconciliationDiffService.reconcile(diskFiles, dbFiles, paths),
      deleteRecords: (records, runOptions) =>
        this.reconciliationDeleteService.execute(records, runOptions),
      updateRecords: (records, runOptions) =>
        this.reconciliationUpdateService.execute(records, runOptions),
      insertRecords: (records, runOptions) =>
        this.reconciliationInsertService.execute(records, runOptions),
      emitProgress: (current, total) => this.emitIndexingProgress('reconciliation', current, total),
      yieldAfterDbRead: async () => {
        await new Promise<void>((resolve) => setImmediate(resolve))
      },
      yieldAfterPathScan: async () => {
        await new Promise<void>((resolve) => setImmediate(resolve))
      },
      now: () => performance.now(),
      formatDuration,
      logDebug: (message, meta) => this.logDebug(message, meta)
    })
    this.indexSchedulerService = new FileProviderIndexSchedulerService({
      getDatabaseFilePath: () => this.databaseFilePath,
      getProviderId: () => this.id,
      getProviderType: () => this.type,
      getWatchPaths: () => this.watchPaths,
      normalizePath: (rawPath) => this.normalizePath(rawPath),
      indexFiles: (dbPath, providerId, providerType, files) =>
        this.fileIndexWorker.indexFiles(dbPath, providerId, providerType, files),
      logWarn: (message, error, meta) => this.logWarn(message, error, meta)
    })
    this.indexPersistEntryMapper = new FileProviderIndexPersistEntryMapperService()
    this.indexRuntimeService = new FileProviderIndexRuntimeService({
      flushBatchScheduler: this.flushBatchScheduler,
      getDbUtils: () => this.dbUtils,
      getSearchIndex: () => this.searchIndex,
      getPendingResults: () => this.pendingIndexWorkerResults,
      getInflightResults: () => this.inflightIndexWorkerResults,
      ensureSearchIndexWorkerReady: (reason) => this.ensureSearchIndexWorkerReady(reason),
      getSearchIndexWorker: () => this.searchIndexWorker,
      buildPersistEntries: (entries) => this.indexPersistEntryMapper.map(entries),
      logDebug: (message, meta) => this.logDebug(message, meta),
      logWarn: (message, error, meta) => this.logWarn(message, error, meta)
    })
    this.fileIndexWorker = new FileIndexWorkerClient((payload) =>
      this.indexRuntimeService.handleIndexWorkerFile(payload)
    )
    this.logDebug('Watching paths', {
      count: this.watchPaths.length
    })
  }

  private logInfo(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      fileProviderLog.info(message, meta)
    } else {
      fileProviderLog.info(message)
    }
  }

  private logWarn(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    if (error && meta) {
      fileProviderLog.warn(message, { ...meta, error })
      return
    }
    if (meta) {
      fileProviderLog.warn(message, meta)
      return
    }
    if (error) {
      fileProviderLog.warn(message, error)
      return
    }
    fileProviderLog.warn(message)
  }

  private logDebug(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      fileProviderLog.debug(message, meta)
    } else {
      fileProviderLog.debug(message)
    }
  }

  private logError(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    if (error && meta) {
      fileProviderLog.error(message, { ...meta, error })
      return
    }
    if (meta) {
      fileProviderLog.error(message, meta)
      return
    }
    if (error) {
      fileProviderLog.error(message, error)
      return
    }
    fileProviderLog.error(message)
  }

  private createSearchIndexWorkerReady(databaseFilePath: string): Promise<boolean> {
    return this.searchIndexWorker
      .init(databaseFilePath)
      .then(() => true)
      .catch((error) => {
        this.logError('SearchIndexWorkerClient init failed', error)
        if (this.searchIndexWorkerReady) {
          this.searchIndexWorkerReady = null
        }
        return false
      })
  }

  private async ensureSearchIndexWorkerReady(reason: string): Promise<boolean> {
    if (!this.searchIndexWorkerReady) {
      if (!this.databaseFilePath) {
        this.logWarn('SearchIndexWorkerClient init skipped: database path unavailable', undefined, {
          reason
        })
        return false
      }
      this.searchIndexWorkerReady = this.createSearchIndexWorkerReady(this.databaseFilePath)
    }

    const ready = await this.searchIndexWorkerReady
    if (!ready) {
      this.logWarn(
        'SearchIndexWorkerClient operation skipped: worker init unavailable',
        undefined,
        {
          reason
        }
      )
    }
    return ready
  }

  private async removeSearchIndexItems(itemIds: string[], reason: string): Promise<void> {
    if (itemIds.length === 0) return
    if (!(await this.ensureSearchIndexWorkerReady(reason))) return
    await this.searchIndexWorker.removeProviderItems(this.id, itemIds)
  }

  private cleanupStaleFileResult(file: typeof filesSchema.$inferSelect, reason: string): void {
    // Phase 2: Delegate file removal to worker (single-writer architecture)
    void this.ensureSearchIndexWorkerReady(`file-index.${reason}.cleanup`)
      .then((ready) => {
        if (!ready) {
          this.logDebug('Stale file result cleanup skipped: worker not ready', {
            path: file.path,
            reason
          })
          return
        }
        return this.searchIndexWorker
          .removeFile(file.path)
          .then(() =>
            this.removeSearchIndexItems([file.path], `file-index.${reason}.remove-search`)
          )
      })
      .catch((error) => {
        // Best-effort cleanup. With single-writer architecture, SQLITE_BUSY should
        // be rare, but kept for backwards compatibility during migration.
        if (isSqliteBusyError(error)) {
          this.logDebug('Stale file result cleanup deferred (db busy)', { path: file.path, reason })
        } else {
          this.logWarn('Failed to cleanup stale file result', error, { path: file.path, reason })
        }
      })
  }

  private cleanupStaleFileAsset(
    file: typeof filesSchema.$inferSelect,
    keys: string[],
    reason: string
  ): void {
    if (typeof file.id !== 'number' || keys.length === 0) return
    // Phase 2: Delegate file_extensions removal to worker (single-writer architecture)
    void this.ensureSearchIndexWorkerReady(`file-index.${reason}.cleanup-asset`)
      .then((ready) => {
        if (!ready) {
          this.logDebug('Stale file asset cleanup skipped: worker not ready', {
            path: file.path,
            keys,
            reason
          })
          return
        }
        return this.searchIndexWorker.removeFileExtensions(file.id as number, keys)
      })
      .catch((error) => {
        if (isSqliteBusyError(error)) {
          this.logDebug('Stale file asset cache cleanup deferred (db busy)', {
            path: file.path,
            keys,
            reason
          })
        } else {
          this.logWarn('Failed to cleanup stale file asset cache', error, {
            path: file.path,
            keys,
            reason
          })
        }
      })
  }

  private inferAssetCacheKeys(
    extensions: Record<string, string>,
    missingPaths: string[]
  ): string[] {
    const keys = new Set<string>()
    const referencesMissingPath = (value: string | undefined): boolean => {
      if (!value) return false
      const normalized = normalizeRenderableSource(value)
      return (
        'missing' in normalized &&
        typeof normalized.localPath === 'string' &&
        missingPaths.includes(normalized.localPath)
      )
    }
    for (const missingPath of missingPaths) {
      if (extensions.thumbnail && extensions.thumbnail.includes(missingPath)) {
        keys.add('thumbnail')
      }
      if (extensions.icon && extensions.icon.includes(missingPath)) {
        keys.add('icon')
      }
    }
    if (referencesMissingPath(extensions.thumbnail)) {
      keys.add('thumbnail')
    }
    if (referencesMissingPath(extensions.icon)) {
      keys.add('icon')
    }
    return Array.from(keys)
  }

  private normalizeFileSearchItem(
    item: TuffItem,
    file: typeof filesSchema.$inferSelect,
    extensions: Record<string, string>,
    options: {
      reason: string
      fallbackKind?: LocalAssetFallbackKind
    }
  ): TuffItem | null {
    const normalized = normalizeTuffItemLocalAssets(item, {
      dropMissingFile: true,
      fallbackKind: options.fallbackKind ?? (file.isDir ? 'folder' : 'file')
    })

    if (!normalized.item) {
      this.cleanupStaleFileResult(file, options.reason)
      return null
    }

    if (normalized.missingPaths.length > 0) {
      const staleKeys = this.inferAssetCacheKeys(extensions, normalized.missingPaths)
      this.cleanupStaleFileAsset(file, staleKeys, options.reason)
      if (staleKeys.includes('thumbnail') && typeof file.id === 'number') {
        void this.ensureFileThumbnail(file.id, file.path, file).catch((error) => {
          this.logWarn('Failed to regenerate stale thumbnail', error, { path: file.path })
        })
      }
      if (staleKeys.includes('icon') && typeof file.id === 'number') {
        void this.ensureFileIcon(file.id, file.path, file).catch((error) => {
          this.logWarn('Failed to regenerate stale icon', error, { path: file.path })
        })
      }
    }

    return normalized.item
  }

  private async removeSearchIndexByProvider(
    providerId: string,
    reason: string
  ): Promise<{ removedIndexedItems: number }> {
    if (!(await this.ensureSearchIndexWorkerReady(reason))) {
      return { removedIndexedItems: 0 }
    }

    const removedIndexedItems = await this.searchIndexWorker.countByProvider(providerId)
    await this.searchIndexWorker.removeByProvider(providerId)
    return { removedIndexedItems }
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
      return this.resetIndexedSourceRuntimeState(request)
    }

    return await this.indexedSourceRuntimeResetDelegate(request)
  }

  public async resetIndexedSourceRuntimeState(
    request: IndexedSourceResetRequest
  ): Promise<IndexedSourceResetResult> {
    const result = await this.runtimeResetService.reset({ request })

    return {
      ...result,
      clearedSearchIndex: result.clearedSearchIndex,
      clearedSearchIndexRows: result.clearedSearchIndexRows ?? 0,
      clearedScanProgress: result.clearedScanProgress,
      scanProgressRows: result.scanProgressRows ?? 0
    }
  }

  private async countSearchIndexByProvider(providerId: string, reason: string): Promise<number> {
    if (!(await this.ensureSearchIndexWorkerReady(reason))) return 0
    return this.searchIndexWorker.countByProvider(providerId)
  }

  private async upsertSearchIndexFiles(
    records: UpsertFileRecord[],
    reason: string
  ): Promise<Array<typeof filesSchema.$inferSelect>> {
    if (records.length === 0) return []
    if (!(await this.ensureSearchIndexWorkerReady(reason))) return []
    return (await this.searchIndexWorker.upsertFiles(records)) as unknown as Array<
      typeof filesSchema.$inferSelect
    >
  }

  private mapFileToIndexedSourceRecord(file: IndexedFileSourceRecordRow): IndexedSourceRecord {
    return mapIndexedFileSourceRecord(file, { sourceId: this.id })
  }

  private async emitIndexedSourceRecordBatchFromBatch(
    batch: IndexedSourceRecordBatch,
    options?: FileIndexRunOptions
  ): Promise<void> {
    if (!options?.onRecordBatch || batch.records.length === 0) {
      return
    }

    await options.onRecordBatch(batch)
  }

  private async emitIndexedSourceDelta(
    delta: IndexedSourceDelta,
    options?: FileIndexRunOptions
  ): Promise<void> {
    if (!options?.onDelta) {
      return
    }

    await options.onDelta(delta)
  }

  private syncWatchServiceState(): void {
    this.fileIndexSettings = this.watchService.getCurrentSettings()
    this.watchPaths = this.watchService.getWatchPaths()
    this.normalizedWatchPaths = this.watchService.getNormalizedWatchPaths()
    this.watchPathsRegistered = this.watchService.isWatchPathRegistered()
  }

  private applyWatchPaths(extraPaths: string[]): void {
    this.watchService.applyWatchPaths(extraPaths)
    this.syncWatchServiceState()
  }

  private initializeBackgroundTaskService(): void {
    this.watchService.initializeBackgroundTaskService()
    this.syncWatchServiceState()
  }

  private scheduleBackgroundStartupTasks(loadStart: number): void {
    if (this.backgroundStartupPromise) return

    this.backgroundStartupReady = false
    this.backgroundStartupError = null
    this.backgroundStartupPromise = new Promise<void>((resolve) => setImmediate(resolve))
      .then(async () => {
        const becameIdle = await appTaskGate.waitForIdle(FILE_PROVIDER_STARTUP_READY_WAIT_MS)
        this.logDebug('FileProvider background startup running', { becameIdle })

        const workerReady = await this.ensureSearchIndexWorkerReady('startup.background')
        this.initializeBackgroundTaskService()
        await this.ensureFileSystemWatchers()

        if (workerReady) {
          this.backgroundStartupReady = true
        } else {
          this.backgroundStartupError = new Error('Search index worker initialization failed')
        }
      })
      .catch((error) => {
        this.backgroundStartupError = error instanceof Error ? error : new Error(String(error))
        this.logWarn('FileProvider background startup failed', error)
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

  private async runAutoIndexing(): Promise<void> {
    const decision = await this.shouldRunAutoIndexing()
    if (!decision.allowed) {
      this.logDebug('Auto index scan skipped', {
        reason: decision.reason,
        batteryLevel: decision.battery?.level ?? null,
        batteryCharging: decision.battery?.charging ?? null
      })
      return
    }

    await this.ensureFileSystemWatchers()
    try {
      await this.startIndexing('auto')
    } catch (error) {
      this.logWarn('Auto index scan aborted', error)
    }
  }

  private async startIndexing(
    source: 'auto' | 'manual',
    options?: FileIndexRunOptions
  ): Promise<FileIndexSyncStats> {
    if (!(await this.ensureSearchIndexWorkerReady(`indexing.${source}`))) {
      throw new Error('Search index worker is not ready')
    }

    if (this.isInitializing) {
      throw new Error('Indexing is already in progress')
    }

    this.initializationFailed = false
    this.initializationError = null

    const run = this._initialize(options)
      .then((stats) => {
        this.initializationFailed = false
        this.logInfo(`File indexing ${source} run completed successfully`)
        if (source === 'manual') {
          this.notifyManualRebuildCompleted()
        }
        return stats
      })
      .catch((error) => {
        this.initializationFailed = true
        this.initializationError = error
        this.logError(`File indexing ${source} run failed`, error)
        this.emitIndexingProgress('idle', 0, 0)
        this.notifyIndexingFailure(error)
        if (source === 'manual') {
          this.manualRebuildPendingNotification = false
        }
        return {
          ...createFileIndexSyncStats(),
          errors: 1
        }
      })
      .finally(() => {
        if (this.isInitializing === run) {
          this.isInitializing = null
        }
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

  public buildStartupDegradedNotice(query: TuffQuery): TuffItem | null {
    const searchText = query.text?.trim() ?? ''
    if (!searchText || this.backgroundStartupReady) {
      return null
    }

    const detail = this.backgroundStartupError?.message
      ? `File index startup is degraded: ${this.backgroundStartupError.message}`
      : 'File index startup is still warming up; results may be partial until the index worker and filesystem watcher are ready.'

    return new TuffItemBuilder(
      `file-provider:startup-degraded:${encodeURIComponent(searchText).slice(0, 64)}`,
      this.type,
      this.id
    )
      .setKind('notification')
      .setTitle('File search is warming up')
      .setSubtitle('Partial file results')
      .setDescription(detail)
      .setAccessory('File Index')
      .setActions([
        {
          id: 'open-file-index-settings',
          type: 'navigate',
          label: 'Open File Index settings',
          description: 'Review file index status, failed files, and rebuild controls.',
          icon: { type: 'class', value: 'i-ri-settings-3-line' },
          payload: {
            path: '/setting?section=file-index',
            section: 'file-index'
          }
        }
      ])
      .setFinalScore(0.05)
      .build()
  }

  public getWatchedPaths(): string[] {
    return [...this.watchPaths]
  }

  public getPendingWatchPermissionPaths(): string[] {
    return this.watchService.getPendingPermissionPaths()
  }

  public ownsWatchPath(rawPath: string): boolean {
    return this.watchService.ownsWatchPath(rawPath)
  }

  public async scanIndexedSource(
    request: IndexedSourceScanRequest
  ): Promise<FileIndexedSourceScanResult | null> {
    if (
      request.reason === IndexedSourceScanReasons.ManualRebuild ||
      request.reason === IndexedSourceScanReasons.SchemaMigration
    ) {
      const result = await this.rebuildIndex({ force: true })
      if (!result.success) {
        throw new Error(result.error || result.reason || 'file-index-rebuild-failed')
      }
      if (this.isInitializing) {
        await this.isInitializing
      }
      return null
    }

    const batches: IndexedSourceRecordBatch[] = []
    await this.ensureFileSystemWatchers()
    await this.startIndexing('auto', {
      onRecordBatch: async (batch) => {
        batches.push(batch)
      }
    })
    batches.push({
      sourceId: this.id,
      records: [],
      done: true
    })

    return { batches }
  }

  public async reconcileIndexedSource(
    request: IndexedSourceReconcileRequest
  ): Promise<IndexedSourceReconcileResult> {
    const startedAt = Date.now()
    await this.ensureFileSystemWatchers()
    const deltas: IndexedSourceDelta[] = []
    const stats = await this.startIndexing('auto', {
      onDelta: async (delta) => {
        deltas.push(delta)
      }
    })

    return {
      sourceId: this.id,
      added: stats.added,
      changed: stats.changed,
      deleted: stats.deleted,
      skipped: stats.skipped,
      errors: stats.errors,
      deltas,
      startedAt,
      completedAt: Date.now(),
      reason: request.reason ?? 'file-index-reconciliation'
    }
  }

  public async handleIndexedSourceWatchEvent(
    event: IndexedSourceWatchEvent
  ): Promise<IndexedSourceDelta[]> {
    if (!this.isWithinWatchRoots(event.path)) {
      return []
    }

    this.enqueueIncrementalUpdate(event.path, event.action, { manual: false })

    if (event.action === 'delete') {
      return [
        this.watchRuntimeEmitter.buildDeleteDelta(event.path, {
          reason: 'file-provider-watch-delete'
        })
      ]
    }

    const record = await this.buildFileRecord(event.path)
    if (!record) {
      return []
    }

    return [
      this.watchRuntimeEmitter.buildDelta(record, {
        action: event.action,
        reason: 'file-provider-watch-event'
      })
    ]
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

  private buildThumbnailStatus(
    file: ThumbnailFileSnapshot | undefined,
    result: Extract<ThumbnailGenerationResult, { status: 'failed' | 'unsupported' }>
  ): string {
    const payload: ThumbnailStatusPayload = {
      status: result.status,
      reason: result.reason,
      mtime: file ? this.toTimestamp(file.mtime) : null,
      size: file && typeof file.size === 'number' ? file.size : null,
      at: Date.now()
    }
    return JSON.stringify(payload)
  }

  private parseThumbnailStatus(value: string | undefined): ThumbnailStatusPayload | null {
    if (!value) return null
    try {
      const parsed = JSON.parse(value) as Partial<ThumbnailStatusPayload>
      if (
        (parsed.status !== 'failed' && parsed.status !== 'unsupported') ||
        typeof parsed.reason !== 'string'
      ) {
        return null
      }
      return {
        status: parsed.status,
        reason: parsed.reason,
        mtime: typeof parsed.mtime === 'number' ? parsed.mtime : null,
        size: typeof parsed.size === 'number' ? parsed.size : null,
        at: typeof parsed.at === 'number' ? parsed.at : 0
      }
    } catch {
      return null
    }
  }

  private matchesThumbnailStatus(
    file: ThumbnailFileSnapshot,
    status: ThumbnailStatusPayload | null
  ): boolean {
    if (!status) return false
    const fileMtime = this.toTimestamp(file.mtime)
    const fileSize = typeof file.size === 'number' ? file.size : null
    return status.mtime === fileMtime && status.size === fileSize
  }

  private shouldSkipThumbnailGeneration(
    file: ThumbnailFileSnapshot,
    extensions?: Record<string, string>
  ): boolean {
    const status = this.parseThumbnailStatus(extensions?.[THUMBNAIL_STATUS_KEY])
    return this.matchesThumbnailStatus(file, status)
  }

  private async persistThumbnailStatus(
    fileId: number,
    file: ThumbnailFileSnapshot | undefined,
    result: Extract<ThumbnailGenerationResult, { status: 'failed' | 'unsupported' }>
  ): Promise<void> {
    if (!this.dbUtils) return
    await this.withDbWrite('thumbnail.status', () =>
      this.dbUtils!.addFileExtensions([
        { fileId, key: THUMBNAIL_STATUS_KEY, value: this.buildThumbnailStatus(file, result) }
      ])
    )
  }

  async onLoad(context: ProviderContext): Promise<void> {
    // 最先赋值 initializationContext，确保即使后续任何步骤失败，rebuildIndex 也能使用
    this.initializationContext = context

    const loadStart = performance.now()

    this.dbUtils = createDbUtils(context.databaseManager.getDb())
    this.searchIndex = context.searchIndex
    this.touchApp = context.touchApp

    // EmbeddingService is best-effort; failures must not block the rest of onLoad
    try {
      this.embeddingService = new EmbeddingService(context.databaseManager.getDb())
    } catch (error) {
      this.logWarn('EmbeddingService init failed, semantic search disabled', error)
    }
    // Store the database file path to exclude it from scanning
    // Prefer database module path when available.
    const databaseDir = context.databaseManager.filePath
    this.databaseFilePath = databaseDir
      ? path.join(databaseDir, 'database.db')
      : path.join(app.getPath('userData'), 'database.db')

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
    await this.watchService.ensureFileSystemWatchers({
      subscribeToFileSystemEvents: () => undefined
    })
    this.syncWatchServiceState()
  }

  private registerOpenersChannel(context: ProviderContext): void {
    if (this.openersChannelRegistered) {
      return
    }

    const channel = context.touchApp.channel as unknown
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    const transport = getTuffTransportMain(channel, keyManager)

    const resolveOpenerHandler = async (payload: { extension?: string }) => {
      const extension = typeof payload?.extension === 'string' ? payload.extension : null
      if (!extension) {
        return null
      }

      try {
        return await this.getOpenerForExtension(extension)
      } catch (error) {
        this.logError('Failed to resolve opener for extension', error, {
          extension
        })
        return null
      }
    }

    transport.on(OpenerEvents.app.resolve, resolveOpenerHandler)
    transport.on(OpenerEvents.legacy.resolveApp, resolveOpenerHandler)

    this.openersChannelRegistered = true
  }

  /**
   * 通知前端索引初始化失败
   */
  private notifyIndexingFailure(error: Error): void {
    if (!this.touchApp) {
      this.logWarn('TouchApp not available, cannot send failure notification')
      return
    }

    const channel = this.touchApp.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    const transport = getTuffTransportMain(channel, keyManager)

    try {
      transport.broadcast(fileIndexFailedEvent, {
        error: error.message,
        stack: error.stack,
        timestamp: Date.now()
      })
    } catch (err) {
      this.logError('Failed to send indexing failure notification', err)
    }
  }

  /**
   * 获取索引状态
   */
  public getIndexingStatus() {
    const now = Date.now()
    const isIndexing = this.isInitializing !== null
    let estimatedCompletion: number | null = null
    let estimatedRemainingMs: number | null = null

    if (isIndexing && this.indexingStartTime) {
      const estimate = this.progressEstimator.getEstimate()
      estimatedRemainingMs = estimate.estimatedRemainingMs
      this.indexingStats.averageItemsPerSecond = estimate.averageItemsPerSecond
      this.indexingStats.estimateStatus = estimate.status
      this.indexingStats.speedSampleCount = estimate.speedSampleCount
      this.indexingStats.estimateBasis = estimate.estimateBasis
      if (estimatedRemainingMs != null) {
        estimatedCompletion = now + estimatedRemainingMs
      }
    } else if (!isIndexing) {
      // Indexing is complete, set to 0 instead of null
      estimatedRemainingMs = 0
    }

    return {
      isInitializing: isIndexing,
      initializationFailed: this.initializationFailed,
      error: this.initializationError?.message || null,
      startupReady: this.backgroundStartupReady,
      startupPending: this.backgroundStartupPromise !== null,
      startupError: this.backgroundStartupError?.message || null,
      progress: { ...this.indexingProgress },
      startTime: this.indexingStartTime,
      estimatedCompletion,
      estimatedRemainingMs,
      averageItemsPerSecond: this.indexingStats.averageItemsPerSecond,
      estimateStatus: this.indexingStats.estimateStatus,
      speedSampleCount: this.indexingStats.speedSampleCount,
      estimateBasis: this.indexingStats.estimateBasis
    }
  }

  /**
   * 获取索引统计信息
   */
  public async getIndexStats(): Promise<{
    totalFiles: number
    failedFiles: number
    skippedFiles: number
    completedFiles: number
    embeddingCompletedFiles: number
    embeddingRows: number
  }> {
    if (!this.dbUtils) {
      return {
        totalFiles: 0,
        failedFiles: 0,
        skippedFiles: 0,
        completedFiles: 0,
        embeddingCompletedFiles: 0,
        embeddingRows: 0
      }
    }

    const db = this.dbUtils.getDb()

    const [
      totalFilesResult,
      failedFilesResult,
      skippedFilesResult,
      completedFilesResult,
      embeddingCompletedFilesResult,
      embeddingRowsResult
    ] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(filesSchema)
        .where(eq(filesSchema.type, 'file')),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(fileIndexProgress)
        .where(eq(fileIndexProgress.status, 'failed')),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(fileIndexProgress)
        .where(eq(fileIndexProgress.status, 'skipped')),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(fileIndexProgress)
        .where(eq(fileIndexProgress.status, 'completed')),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(filesSchema)
        .where(and(eq(filesSchema.type, 'file'), eq(filesSchema.embeddingStatus, 'completed'))),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(embeddingsSchema)
        .where(eq(embeddingsSchema.sourceType, 'file'))
    ])

    const totalFiles = totalFilesResult[0]?.count ?? 0
    const failedFiles = failedFilesResult[0]?.count ?? 0
    const skippedFiles = skippedFilesResult[0]?.count ?? 0
    const completedFiles = completedFilesResult[0]?.count ?? 0
    const embeddingCompletedFiles = embeddingCompletedFilesResult[0]?.count ?? 0
    const embeddingRows = embeddingRowsResult[0]?.count ?? 0

    return {
      totalFiles,
      failedFiles,
      skippedFiles,
      completedFiles,
      embeddingCompletedFiles,
      embeddingRows
    }
  }

  public async getIndexedSourceEvidence(): Promise<IndexedSourceEvidence[]> {
    const stats = await this.getIndexStats()
    const evidence: IndexedSourceEvidence[] = [
      await this.scanProgressService.buildEvidence({
        sourceId: this.id,
        watchPaths: this.watchPaths,
        pendingPermissionPaths: this.getPendingWatchPermissionPaths(),
        stats,
        isIndexingActive: this.isInitializing !== null || this.backgroundStartupPromise !== null
      })
    ]

    if (this.lastIntegritySnapshot) {
      evidence.push(
        fileIntegrityEvidenceService.build({
          id: `${this.id}:integrity`,
          label: 'File index integrity',
          snapshot: {
            ...this.lastIntegritySnapshot,
            indexedRows: this.lastIntegritySnapshot.ftsRows
          },
          reasons: {
            rebuildScheduled: 'fts-files-count-mismatch-rebuild-scheduled',
            aligned: 'fts-files-count-aligned'
          },
          metadata: {
            ...this.lastIntegritySnapshot
          }
        })
      )
    }

    const flushSnapshot = this.indexRuntimeService.getFlushSnapshot()
    if (flushSnapshot) {
      evidence.push(
        indexFlushEvidenceService.build({
          id: `${this.id}:index-flush`,
          label: 'File index flush',
          snapshot: flushSnapshot
        })
      )
    }

    return evidence
  }

  /**
   * 获取失败文件的详细信息列表
   */
  public async getFailedFiles(): Promise<
    Array<{
      fileId: number
      path: string
      lastError: string | null
      updatedAt: string | null
    }>
  > {
    if (!this.dbUtils) return []

    const db = this.dbUtils.getDb()
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

    return rows.map((row) => ({
      fileId: row.fileId,
      path: row.path,
      lastError: row.lastError,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null
    }))
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
    if (this.isInitializing) {
      return {
        success: false,
        reason: 'initializing',
        error: 'Indexing is already in progress'
      }
    }

    if (!this.initializationContext) {
      return {
        success: false,
        reason: 'missing-context',
        error: 'Cannot rebuild: initialization context not available'
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

    this.logInfo('Manual index rebuild triggered', {
      force,
      batteryLevel: batteryStatus?.level ?? null,
      batteryCharging: batteryStatus?.charging ?? null
    })

    // 如果 onLoad 中途失败导致 dbUtils 为空，尝试用 initializationContext 重新初始化
    if (!this.dbUtils && this.initializationContext) {
      try {
        this.dbUtils = createDbUtils(this.initializationContext.databaseManager.getDb())
        this.searchIndex = this.initializationContext.searchIndex
        this.touchApp = this.initializationContext.touchApp
        this.logInfo('Re-initialized dbUtils from saved context')
      } catch (err) {
        this.logError('Failed to re-initialize dbUtils', err)
        return {
          success: false,
          reason: 'missing-context',
          error: 'Database initialization failed'
        }
      }
    }

    if (this.dbUtils) {
      await this.resetFileIndexRuntimeStateViaIndexedRuntime({
        sourceId: this.id,
        reason: IndexedSourceResetReasons.ManualRebuild,
        clearScanProgress: true,
        // 手动/强制重建应产出全新索引：清空现有行，避免如今已越界的条目残留
        // （例如旧版本错误索引的 *.photoslibrary bundle 内容），否则重扫不会主动删除它们。
        clearSearchIndex: true
      })
    }

    await this.ensureFileSystemWatchers()
    this.manualRebuildPendingNotification = true
    void this.startIndexing('manual').catch((error) => {
      this.manualRebuildPendingNotification = false
      this.logWarn('Manual index rebuild failed before completion notification', error)
    })

    return {
      success: true,
      message: 'Index rebuild started',
      battery: batteryStatus
    }
  }

  public async addWatchPath(rawPath: string): Promise<FileIndexAddPathResult> {
    const trimmed = typeof rawPath === 'string' ? rawPath.trim() : ''
    if (!trimmed) {
      return { success: false, status: 'invalid', reason: 'path-empty' }
    }

    const resolved = path.resolve(trimmed)
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
    this.fileIndexSettings = { ...this.fileIndexSettings, extraPaths: nextExtraPaths }

    try {
      saveMainConfig(StorageList.FILE_INDEX_SETTINGS, this.fileIndexSettings)
    } catch (error) {
      this.logWarn('Failed to persist file index extra paths', error, { path: watchPath })
    }

    this.applyWatchPaths(this.fileIndexSettings.extraPaths)
    this.syncWatchServiceState()

    if (this.watchPathsRegistered) {
      try {
        await FileSystemWatcher.addPath(watchPath, this.getWatchDepthForPath(watchPath))
      } catch (error) {
        this.logWarn('Failed to register extra watch path', error, { path: watchPath })
      }
    } else {
      await this.ensureFileSystemWatchers()
    }

    if (!this.isInitializing) {
      void this.startIndexing('manual').catch((error) => {
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

  public registerProgressStream(context: StreamContext<FileIndexProgressPayload>): void {
    this.progressStreamContexts.add(context)
    if (this.lastProgressStreamPayload) {
      // Emit asynchronously to avoid adding extra sync work to stream-start handshake.
      setImmediate(() => {
        if (!context.isCancelled()) {
          context.emit(this.lastProgressStreamPayload as FileIndexProgressPayload)
        }
      })
    }
    this.ensureProgressCleanupTimer()
  }

  private emitProgressStream(payload: FileIndexProgressPayload): void {
    if (this.progressStreamContexts.size === 0) {
      this.lastProgressStreamPayload = payload
      this.clearProgressStreamFlushTimer()
      this.pendingProgressStreamPayload = null
      return
    }

    const now = Date.now()
    const previous = this.lastProgressStreamEmitAt > 0 ? this.lastProgressStreamPayload : null

    if (
      shouldEmitProgressStreamImmediately({
        previous,
        next: payload,
        now,
        lastEmitAt: this.lastProgressStreamEmitAt
      })
    ) {
      this.flushProgressStreamPayload(payload, now)
      return
    }

    this.pendingProgressStreamPayload = payload
    this.scheduleProgressStreamFlush(now)
  }

  private scheduleProgressStreamFlush(now: number): void {
    if (this.progressStreamFlushTimer) {
      return
    }

    const delayMs = getProgressStreamFlushDelayMs(now, this.lastProgressStreamEmitAt)
    this.progressStreamFlushTimer = setTimeout(() => {
      this.progressStreamFlushTimer = null
      const pending = this.pendingProgressStreamPayload
      this.pendingProgressStreamPayload = null
      if (!pending) {
        return
      }
      this.flushProgressStreamPayload(pending, Date.now())
    }, delayMs)
  }

  private clearProgressStreamFlushTimer(): void {
    if (this.progressStreamFlushTimer) {
      clearTimeout(this.progressStreamFlushTimer)
      this.progressStreamFlushTimer = null
    }
  }

  private flushProgressStreamPayload(payload: FileIndexProgressPayload, emittedAt: number): void {
    this.lastProgressStreamPayload = payload
    this.lastProgressStreamEmitAt = emittedAt

    for (const stream of Array.from(this.progressStreamContexts)) {
      if (stream.isCancelled()) {
        this.progressStreamContexts.delete(stream)
        continue
      }
      stream.emit(payload)
    }

    if (this.progressStreamContexts.size === 0) {
      this.clearProgressStreamFlushTimer()
      this.pendingProgressStreamPayload = null
      this.clearProgressCleanupTimer()
    }
  }

  private ensureProgressCleanupTimer(): void {
    if (pollingService.isRegistered(FILE_PROVIDER_PROGRESS_TASK_ID)) {
      return
    }

    pollingService.register(
      FILE_PROVIDER_PROGRESS_TASK_ID,
      () => {
        for (const stream of Array.from(this.progressStreamContexts)) {
          if (stream.isCancelled()) {
            this.progressStreamContexts.delete(stream)
          }
        }

        if (this.progressStreamContexts.size === 0) {
          this.clearProgressCleanupTimer()
        }
      },
      { interval: 30_000, unit: 'milliseconds' }
    )
    pollingService.start()
  }

  private clearProgressCleanupTimer(): void {
    pollingService.unregister(FILE_PROVIDER_PROGRESS_TASK_ID)
    this.clearProgressStreamFlushTimer()
    this.pendingProgressStreamPayload = null
  }

  private async scanDirectoryWithWorker(
    dirPath: string,
    excludePathsSet?: Set<string>
  ): Promise<ScannedFileInfo[]> {
    await appTaskGate.waitForIdle()
    try {
      return await this.fileScanWorker.scan([dirPath], excludePathsSet, 500)
    } catch (error) {
      this.logWarn('File scan worker failed, falling back to direct scan', error, { path: dirPath })
      return await scanDirectory(dirPath, excludePathsSet)
    }
  }

  private async getReconciliationDbFiles(
    reconciliationPaths: string[]
  ): Promise<FileProviderReconciliationDbRecord[]> {
    if (!this.dbUtils) return []
    const db = this.dbUtils.getDb()
    const pathFilters = reconciliationPaths.map(
      (targetPath) => sql`${filesSchema.path} LIKE ${`${targetPath}%`}`
    )
    const pathWhere = pathFilters.length > 0 ? or(...pathFilters) : undefined

    return await db
      .select({
        id: filesSchema.id,
        path: filesSchema.path,
        mtime: filesSchema.mtime
      })
      .from(filesSchema)
      .where(
        pathWhere ? and(eq(filesSchema.type, 'file'), pathWhere) : eq(filesSchema.type, 'file')
      )
  }

  private scheduleIndexing(files: (typeof filesSchema.$inferSelect)[], reason: string): void {
    if (!this.searchIndex) {
      return
    }
    this.indexSchedulerService.schedule(files, reason)
  }

  private extractFileIconQueued(filePath: string): Promise<Buffer | null> {
    const existing = this.iconExtractionPending.get(filePath)
    if (existing) {
      return existing
    }

    const task = (async () => {
      await appTaskGate.waitForIdle()
      try {
        return await this.iconWorker.extract(filePath)
      } catch (error) {
        // Do NOT fall back to sync extractFileIcon — it blocks the event loop.
        // The worker is the only safe extraction path; if it fails, skip the icon.
        this.logWarn('Icon worker extraction failed; skipping icon', error, {
          path: filePath
        })
        return null
      }
    })()

    this.iconExtractionPending.set(filePath, task)
    task.finally(() => {
      this.iconExtractionPending.delete(filePath)
    })

    return task
  }

  private async getOpenerForExtension(rawExtension: string): Promise<ResolvedOpener | null> {
    return this.openerService.getOpenerForExtension(rawExtension)
  }

  private readonly pendingIconExtractions = new Set<number>()
  private readonly pendingThumbnailExtractions = new Set<number>()
  private _thumbnailTaskRunning = false

  private async ensureFileIcon(
    fileId: number,
    filePath: string,
    file?: typeof filesSchema.$inferSelect
  ): Promise<void> {
    if (this.pendingIconExtractions.has(fileId)) {
      return
    }

    this.pendingIconExtractions.add(fileId)
    try {
      const hasCapacity = await this.waitForCacheWriteCapacity(
        FILE_ICON_WRITE_MAX_QUEUE,
        'file-icon.persist'
      )
      if (!hasCapacity) {
        return
      }

      const icon = await this.extractFileIconQueued(filePath)
      if (!icon || icon.length === 0) {
        return
      }
      const iconBuffer = Buffer.isBuffer(icon) ? icon : Buffer.from(icon)
      const iconValue = `data:image/png;base64,${iconBuffer.toString('base64')}`
      if (!isValidBase64DataUrl(iconValue)) {
        this.logWarn('Invalid base64 icon generated, skipping persist', {
          fileId,
          path: filePath
        })
        return
      }

      const meta: FileIconCacheMeta = {
        mtime: file ? this.toTimestamp(file.mtime) : Date.now(),
        size: file && typeof file.size === 'number' ? file.size : null
      }

      if (this.dbUtils) {
        await persistFileIconCache(
          {
            dbUtils: this.dbUtils,
            withDbWrite: (label, operation) => this.withDbWrite(label, operation)
          },
          fileId,
          iconValue,
          meta
        )
      }
    } catch (error) {
      this.logWarn('Failed to extract icon', error, { path: filePath })
    } finally {
      this.pendingIconExtractions.delete(fileId)
    }
  }

  private readonly thumbnailWorker = new ThumbnailWorkerClient()

  private async ensureFileThumbnail(
    fileId: number,
    filePath: string,
    file?: typeof filesSchema.$inferSelect,
    extensions?: Record<string, string>
  ): Promise<void> {
    if (this.pendingThumbnailExtractions.has(fileId)) {
      return
    }
    if (file && this.shouldSkipThumbnailGeneration(file, extensions)) {
      return
    }
    if (file && !isThumbnailCandidate(file.extension, file.size)) {
      const reason = getThumbnailUnsupportedReason(file.extension, file.size)
      if (reason) {
        await this.persistThumbnailStatus(fileId, file, {
          status: 'unsupported',
          reason,
          durationMs: 0
        })
      }
      return
    }

    this.pendingThumbnailExtractions.add(fileId)
    try {
      const thumbnail = await this.thumbnailWorker.generate(filePath, {
        extension: file?.extension,
        sizeBytes: file?.size
      })
      if (!this.dbUtils) {
        return
      }
      if (thumbnail.status === 'generated') {
        await this.withDbWrite('thumbnail.worker', () =>
          this.dbUtils!.addFileExtensions([
            { fileId, key: 'thumbnail', value: thumbnail.path },
            {
              fileId,
              key: THUMBNAIL_STATUS_KEY,
              value: JSON.stringify({ status: 'generated', at: Date.now() })
            }
          ])
        )
        return
      }
      await this.persistThumbnailStatus(fileId, file, thumbnail)
      this.logDebug('Thumbnail generation skipped', {
        path: filePath,
        status: thumbnail.status,
        reason: thumbnail.reason
      })
    } catch (error) {
      this.logWarn('Failed to generate thumbnail', error, { path: filePath })
    } finally {
      this.pendingThumbnailExtractions.delete(fileId)
    }
  }

  /**
   * Background thumbnail generation — runs after scan completes.
   * Processes one file at a time with setImmediate yields to avoid blocking the event loop.
   */
  private async generateMissingThumbnails(): Promise<void> {
    if (this._thumbnailTaskRunning || !this.dbUtils) return
    this._thumbnailTaskRunning = true

    try {
      const db = this.dbUtils.getDb()

      const thumbnailExtensions = [...THUMBNAIL_EXTENSIONS].map((e) => `.${e}`)
      const thumbnailExtension = alias(fileExtensions, 'thumbnail_extension')
      const thumbnailStatusExtension = alias(fileExtensions, 'thumbnail_status_extension')

      // Find image files that don't have a thumbnail extension yet
      const candidates = await db
        .select({
          id: filesSchema.id,
          path: filesSchema.path,
          extension: filesSchema.extension,
          size: filesSchema.size,
          mtime: filesSchema.mtime,
          ctime: filesSchema.ctime,
          statusValue: thumbnailStatusExtension.value
        })
        .from(filesSchema)
        .leftJoin(
          thumbnailExtension,
          and(
            eq(thumbnailExtension.fileId, filesSchema.id),
            eq(thumbnailExtension.key, 'thumbnail')
          )
        )
        .leftJoin(
          thumbnailStatusExtension,
          and(
            eq(thumbnailStatusExtension.fileId, filesSchema.id),
            eq(thumbnailStatusExtension.key, THUMBNAIL_STATUS_KEY)
          )
        )
        .where(
          and(isNull(thumbnailExtension.value), inArray(filesSchema.extension, thumbnailExtensions))
        )
        .limit(1000)

      if (candidates.length === 0) return

      this.logDebug('Starting deferred thumbnail generation', { count: candidates.length })
      let generated = 0
      let skipped = 0

      for (const file of candidates) {
        if (!this._thumbnailTaskRunning) break // allow cancellation

        if (
          this.shouldSkipThumbnailGeneration(file, {
            [THUMBNAIL_STATUS_KEY]: file.statusValue ?? ''
          })
        ) {
          skipped++
          continue
        }

        if (!isThumbnailCandidate(file.extension, file.size)) {
          const reason = getThumbnailUnsupportedReason(file.extension, file.size)
          if (typeof file.id === 'number' && reason) {
            await this.persistThumbnailStatus(file.id, file, {
              status: 'unsupported',
              reason,
              durationMs: 0
            })
          }
          skipped++
          continue
        }

        // Yield to event loop before each thumbnail
        await new Promise<void>((resolve) => setImmediate(resolve))
        await appTaskGate.waitForIdle()

        let thumbnail: ThumbnailGenerationResult | null = null
        try {
          thumbnail = await this.thumbnailWorker.generate(file.path, {
            extension: file.extension,
            sizeBytes: file.size
          })
        } catch (error) {
          this.logWarn('Thumbnail worker failed', error, { path: file.path })
        }
        if (thumbnail && typeof file.id === 'number') {
          if (thumbnail.status === 'generated') {
            await this.withDbWrite('thumbnail.deferred', () =>
              this.dbUtils!.addFileExtensions([
                { fileId: file.id, key: 'thumbnail', value: thumbnail.path },
                {
                  fileId: file.id,
                  key: THUMBNAIL_STATUS_KEY,
                  value: JSON.stringify({ status: 'generated', at: Date.now() })
                }
              ])
            )
            generated++
          } else {
            await this.persistThumbnailStatus(file.id, file, thumbnail)
            skipped++
          }
        }
      }

      this.logDebug('Deferred thumbnail generation completed', {
        generated,
        skipped,
        total: candidates.length
      })
    } catch (error) {
      this.logWarn('Deferred thumbnail generation failed', error)
    } finally {
      this._thumbnailTaskRunning = false
    }
  }

  private getWatchDepthForPath(watchPath: string): number {
    return resolveWatchDepthForPath(watchPath)
  }

  private normalizePath(p: string): string {
    return normalizeWatchPath(p, this.isCaseInsensitiveFs)
  }

  private isWithinWatchRoots(rawPath: string): boolean {
    return isIndexedWatchPathOwned({
      rawPath,
      normalizedWatchPaths: this.normalizedWatchPaths,
      normalizePath: (path) => this.normalizePath(path),
      pathSeparator: path.sep
    })
  }

  private enqueueIncrementalUpdate(
    rawPath: string,
    action: FileProviderIncrementalAction,
    options?: { manual?: boolean }
  ): void {
    this.incrementalQueueService.enqueue(rawPath, action, options)
  }

  private async prepareIncrementalFlush(): Promise<boolean> {
    if (this.isInitializing) {
      try {
        await this.isInitializing
      } catch (error) {
        this.logError('Initialization failed before processing increments.', error)
        return false
      }
    }

    if (!this.dbUtils) {
      this.logWarn('flushIncrementalQueue skipped: dbUtils not ready.')
      return false
    }

    return true
  }

  private async processIncrementalEntries(entries: FileProviderIncrementalEntry[]): Promise<void> {
    const deleted = entries
      .filter(([, payload]) => payload.action === 'delete')
      .map(([, payload]) => payload.rawPath)

    const changedEntries = entries.filter(([, payload]) => payload.action !== 'delete') as Array<
      [string, { action: 'add' | 'change'; rawPath: string; manual?: boolean }]
    >

    if (deleted.length > 0) {
      await this.handleIncrementalDeletes(deleted)
    }

    if (changedEntries.length > 0) {
      await this.handleIncrementalAddsOrChanges(changedEntries)
    }
  }

  private async handleIncrementalDeletes(paths: string[]): Promise<void> {
    if (!this.dbUtils) return
    await this.incrementalDeleteExecutor.execute(paths)
  }

  private async findIncrementalDeleteRecords(paths: string[]): Promise<IndexedWriteDeleteRecord[]> {
    if (!this.dbUtils || paths.length === 0) return []
    return await this.dbUtils
      .getDb()
      .select({ id: filesSchema.id, path: filesSchema.path })
      .from(filesSchema)
      .where(inArray(filesSchema.path, paths))
  }

  private async deleteIncrementalRecords(records: IndexedWriteDeleteRecord[]): Promise<void> {
    if (!this.dbUtils || records.length === 0) return
    const db = this.dbUtils.getDb()
    const idsToDelete = records.map((file) => file.id)
    await this.withDbWrite('file-index.incremental.delete', async () => {
      await db.delete(filesSchema).where(inArray(filesSchema.id, idsToDelete))
      await this.deleteEmbeddingsByFileIds(db, idsToDelete)
    })
  }

  private async deleteCleanupRecords(records: IndexedWriteDeleteRecord[]): Promise<void> {
    if (!this.dbUtils || records.length === 0) return
    const db = this.dbUtils.getDb()
    const idsToDelete = records.map((file) => file.id)
    const pathsToDelete = records.map((file) => file.path)
    await this.withDbWrite('file-index.cleanup.delete', async () => {
      await db.delete(filesSchema).where(inArray(filesSchema.id, idsToDelete))
      await this.deleteEmbeddingsByFileIds(db, idsToDelete)
      await this.scanProgressService.deletePaths(db, pathsToDelete)
    })
  }

  private async removeCleanupSearchIndexItems(paths: string[]): Promise<void> {
    const pathChunks = chunkArray(paths, 50)
    for (const chunk of pathChunks) {
      await this.removeSearchIndexItems(chunk, 'cleanup.remove-stale')
    }
  }

  private async deleteReconciledRecords(
    records: IndexedWriteDeleteRecord[]
  ): Promise<IndexedWriteDeleteExecutorResult<IndexedWriteDeleteRecord>> {
    if (!this.dbUtils || records.length === 0) {
      return { deleted: [], deletedIds: [], deletedPaths: [] }
    }

    return await new IndexedWriteDeleteExecutorService<IndexedWriteDeleteRecord>({
      normalizePath: (rawPath) => path.normalize(rawPath),
      findExisting: async () => [],
      deleteRecords: async (resolvedRecords) => {
        const db = this.dbUtils!.getDb()
        const idsToDelete = resolvedRecords.map((file) => file.id)
        const deleteChunks = chunkArray(idsToDelete, 50)
        for (const chunk of deleteChunks) {
          await appTaskGate.waitForIdle()
          await dbWriteScheduler.waitForCapacity(4)
          await this.withDbWrite('file-index.reconcile.delete', async () => {
            await db.delete(filesSchema).where(inArray(filesSchema.id, chunk))
            await this.deleteEmbeddingsByFileIds(db, chunk)
          })
        }
      },
      removeSearchIndexItems: async (paths) => {
        const pathChunks = chunkArray(paths, 100)
        for (const chunk of pathChunks) {
          await appTaskGate.waitForIdle()
          await this.removeSearchIndexItems(chunk, 'reconciliation.remove-deleted')
        }
      },
      logDebug: (message, meta) => this.logDebug(message, meta),
      successMessage: 'Reconciliation remove completed'
    }).executeExisting(records)
  }

  private async handleIncrementalAddsOrChanges(
    entries: Array<[string, { action: 'add' | 'change'; rawPath: string; manual?: boolean }]>
  ): Promise<void> {
    if (!this.dbUtils) return

    await this.incrementalWriteService.execute(entries as FileProviderIncrementalChangeEntry[])
  }

  private async insertIncrementalRecords(
    records: Array<typeof filesSchema.$inferInsert>
  ): Promise<Array<typeof filesSchema.$inferSelect>> {
    return await this.incrementalInsertExecutor.execute(records)
  }

  private async persistIncrementalRecords(
    records: Array<typeof filesSchema.$inferInsert>
  ): Promise<Array<typeof filesSchema.$inferSelect>> {
    if (!this.dbUtils || records.length === 0) return []
    const db = this.dbUtils.getDb()
    return await this.withDbWrite('file-index.incremental.insert', () =>
      db
        .insert(filesSchema)
        .values(records)
        .onConflictDoUpdate({
          target: filesSchema.path,
          set: {
            name: sql`excluded.name`,
            extension: sql`excluded.extension`,
            size: sql`excluded.size`,
            mtime: sql`excluded.mtime`,
            ctime: sql`excluded.ctime`,
            lastIndexedAt: sql`excluded.last_indexed_at`
          }
        })
        .returning()
    )
  }

  private async buildFileRecord(
    rawPath: string,
    options?: { manualForce?: boolean }
  ): Promise<typeof filesSchema.$inferInsert | null> {
    try {
      const stats = await fs.stat(rawPath)
      if (!stats.isFile()) {
        return null
      }

      const manualForce = options?.manualForce === true
      const name = path.basename(rawPath)
      const extension = path.extname(name).toLowerCase()

      if (manualForce) {
        if (extension && BLACKLISTED_EXTENSIONS.has(extension)) {
          this.logDebug('buildFileRecord filtered(manual-blacklist)', {
            path: rawPath,
            extension,
            reason: 'blacklisted-extension'
          })
          this.logDebug('Skipped manual incremental file: blacklisted extension', {
            path: rawPath,
            extension
          })
          return null
        }
      } else if (!isIndexableFile(rawPath, extension, name)) {
        this.logDebug('Skipped incremental file: not indexable by whitelist', {
          path: rawPath,
          extension
        })
        return null
      }

      if (manualForce && !WHITELISTED_EXTENSIONS.has(extension)) {
        this.logDebug('buildFileRecord accepted(manual-force)', {
          path: rawPath,
          extension
        })
        this.logInfo('Manual incremental file accepted by manual-force fallback', {
          path: rawPath,
          extension
        })
      }

      return {
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
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err?.code !== 'ENOENT') {
        this.logError('Failed to read file metadata', error, {
          path: rawPath
        })
      }
      return null
    }
  }

  private emitIndexingProgress(
    stage: typeof this.indexingProgress.stage,
    current: number,
    total: number
  ): void {
    const now = Date.now()

    // Track start time when indexing begins
    if (stage !== 'idle' && stage !== 'completed' && !this.indexingStartTime) {
      this.indexingStartTime = now
      this.indexingStats.startTime = now
      this.indexingStats.processedItems = 0
      this.indexingStats.lastUpdateTime = now
    }

    // Update stats
    if (this.indexingStartTime && stage !== 'idle' && stage !== 'completed') {
      const elapsed = (now - this.indexingStats.startTime) / 1000 // seconds
      if (elapsed > 0 && current > 0) {
        this.indexingStats.averageItemsPerSecond = current / elapsed
      }
      this.indexingStats.processedItems = current
      this.indexingStats.lastUpdateTime = now
    }

    // Reset on completion or idle
    if (stage === 'completed' || stage === 'idle') {
      this.indexingStartTime = null
      this.indexingStats = {
        processedItems: 0,
        startTime: 0,
        lastUpdateTime: 0,
        averageItemsPerSecond: 0,
        estimateStatus: stage === 'completed' ? 'complete' : 'unknown',
        speedSampleCount: 0,
        estimateBasis: stage === 'completed' ? 'complete' : 'none'
      }
      this.progressEstimator.reset()
    }

    this.indexingProgress = { stage, current, total }

    const estimate = this.progressEstimator.update({
      stage,
      current,
      total,
      now
    })
    this.indexingStats.averageItemsPerSecond = estimate.averageItemsPerSecond
    this.indexingStats.estimateStatus = estimate.status
    this.indexingStats.speedSampleCount = estimate.speedSampleCount
    this.indexingStats.estimateBasis = estimate.estimateBasis

    const payload = {
      stage,
      current,
      total,
      progress: total > 0 ? Math.round((current / total) * 100) : 0,
      startTime: this.indexingStartTime,
      estimatedRemainingMs: estimate.estimatedRemainingMs,
      averageItemsPerSecond: this.indexingStats.averageItemsPerSecond,
      estimateStatus: estimate.status,
      speedSampleCount: estimate.speedSampleCount,
      estimateBasis: estimate.estimateBasis
    }

    this.emitProgressStream(payload)
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
   * This avoids doing a heavy `indexItems` rebuild on the main thread which
   * previously caused the app to freeze.
   */
  private async runIntegrityCheck(db: LibSQLDatabase<typeof schema>): Promise<void> {
    this.lastIntegritySnapshot = await this.integrityService.check(db)
  }

  private async _initialize(options?: FileIndexRunOptions): Promise<FileIndexSyncStats> {
    const initStart = performance.now()
    const stats = createFileIndexSyncStats()
    this.logDebug('Starting index process')
    if (!this.dbUtils) return stats

    const db = this.dbUtils.getDb()
    const indexEnsuredStart = performance.now()
    await this.ensureKeywordIndexes(db)
    // file_index_progress 表由数据库迁移自动创建，无需手动创建
    this.logDebug('Keyword indexes ensured', {
      duration: formatDuration(performance.now() - indexEnsuredStart)
    })
    const excludePathsSet = this.databaseFilePath ? new Set([this.databaseFilePath]) : undefined

    // If FTS5 table was recreated (schema migration), clear scan_progress
    // so all watch paths go through full scan and content gets re-indexed.
    if (this.searchIndex?.didMigrate) {
      this.logInfo('FTS5 table was migrated — clearing scan_progress for full re-index')
      await this.resetFileIndexRuntimeStateViaIndexedRuntime({
        sourceId: this.id,
        reason: IndexedSourceResetReasons.SchemaMigration,
        clearScanProgress: true
      })
    }

    // --- Cross-table integrity check ---
    // Detects inconsistencies between files table, FTS5 index, keyword_mappings,
    // and scan_progress. These can arise from interrupted migrations, crashes,
    // or previous schema changes that dropped the FTS5 table.
    if (this.searchIndex) {
      await this.runIntegrityCheck(db)
    }
    // Yield after heavy integrity check queries
    await new Promise<void>((resolve) => setImmediate(resolve))

    // --- 1. Index Cleanup (FR-IX-4) ---
    const cleanupResult = await this.cleanupDeleteService.execute(options)
    stats.deleted += cleanupResult.deletedCount

    // --- 2. Determine Scan Strategy (FR-IX-3: Resumable Indexing) ---
    const { newPathsToScan, reconciliationPaths } = await this.scanStrategyService.resolve(
      this.watchPaths
    )
    const completedScanProgressPaths = new Set<string>()

    // --- 3. Full Scan for New Paths ---
    if (newPathsToScan.length > 0) {
      const fullScanResult = await this.fullScanRunService.execute(newPathsToScan, options, {
        excludePathsSet
      })
      stats.added += fullScanResult.added
      for (const scannedPath of fullScanResult.completedPaths) {
        completedScanProgressPaths.add(scannedPath)
      }
    }

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
      for (const reconciledPath of reconciliationResult.completedPaths) {
        completedScanProgressPaths.add(reconciledPath)
      }
    }

    if (completedScanProgressPaths.size > 0) {
      const scanTime = new Date()
      await this.scanProgressService.upsertCompletedPaths(
        Array.from(completedScanProgressPaths),
        scanTime.toISOString(),
        'scan-progress.upsert'
      )
    }

    this.emitIndexingProgress('completed', 1, 1)
    this.logInfo('Index process complete', {
      duration: formatDuration(performance.now() - initStart)
    })

    // Schedule deferred thumbnail generation (low-priority, non-blocking)
    void this.generateMissingThumbnails()
    return stats
  }
  private async _processFileUpdates(
    filesToUpdate: FileUpdateRecord[],
    chunkSize = 10
  ): Promise<Array<typeof filesSchema.$inferSelect>> {
    if (!this.dbUtils) return []
    return await this.fileUpdateExecutor.execute(filesToUpdate, chunkSize)
  }

  private async updateFileRecord(file: FileUpdateRecord): Promise<void> {
    if (!this.dbUtils) return
    const db = this.dbUtils.getDb()
    await this.withDbWrite('file-index.file-update.single', () =>
      db
        .update(filesSchema)
        .set({
          extension: file.extension,
          size: file.size,
          ctime: file.ctime,
          mtime: file.mtime,
          name: file.name,
          type: file.type,
          isDir: file.isDir,
          lastIndexedAt: new Date()
        })
        .where(eq(filesSchema.id, file.id))
    )
  }

  private async refreshFileUpdateRecords(
    files: FileUpdateRecord[]
  ): Promise<Array<typeof filesSchema.$inferSelect>> {
    if (!this.dbUtils || files.length === 0) return []
    const ids = files.map((file) => file.id)
    return await this.dbUtils.getDb().select().from(filesSchema).where(inArray(filesSchema.id, ids))
  }

  private buildFtsQuery(terms: string[]): string {
    return buildFileProviderFtsQuery(terms)
  }

  private async processFileExtensions(files: (typeof filesSchema.$inferSelect)[]): Promise<void> {
    if (!this.dbUtils) return
    if (files.length === 0) return

    const iconCache = this.enableFileIconExtraction
      ? await this.buildIconCache(files)
      : new Map<number, IconCacheEntry>()

    const timingToken = timingLogger.start(
      'FileProvider:ProcessExtensions',
      {
        stage: 'ProcessFileExtensions',
        message: 'Processing file extensions',
        files: files.length
      },
      FILE_TIMING_BASE_OPTIONS
    )

    const extensionsToAdd: { fileId: number; key: string; value: string }[] = []
    let status: 'success' | 'failed' = 'success'

    try {
      const desiredKeywordExtensions = new Map<number, string>()

      await runAdaptiveTaskQueue(
        files,
        async (file) => {
          const fileId = typeof file.id === 'number' ? file.id : null

          if (fileId && this.enableFileIconExtraction) {
            const cached = iconCache.get(fileId)
            if (this.needsIconExtraction(file, cached)) {
              try {
                // Always fire-and-forget — icon extraction goes through the worker thread
                // and should never block the scan/index pipeline
                void this.ensureFileIcon(fileId, file.path, file)
              } catch {
                /* ignore icon failures */
              }
            }
          }

          const fileExtension = file.extension || path.extname(file.name).toLowerCase()
          const keywords = KEYWORD_MAP[fileExtension]
          if (keywords) {
            if (fileId) {
              desiredKeywordExtensions.set(fileId, JSON.stringify(keywords))
            }
          }
        },
        {
          estimatedTaskTimeMs: 3,
          label: 'FileProvider::processFileExtensions'
        }
      )

      if (desiredKeywordExtensions.size > 0) {
        const fileIds = Array.from(desiredKeywordExtensions.keys())
        const existingKeywordRows = await this.dbUtils!.getFileExtensionsByFileIds(fileIds, [
          'keywords'
        ])
        const existingKeywordMap = new Map<number, string>()
        for (const row of existingKeywordRows) {
          if (row.key === 'keywords' && typeof row.value === 'string') {
            existingKeywordMap.set(row.fileId, row.value)
          }
        }

        for (const [fileId, value] of desiredKeywordExtensions.entries()) {
          if (existingKeywordMap.get(fileId) === value) {
            continue
          }
          extensionsToAdd.push({ fileId, key: 'keywords', value })
        }
      }

      if (extensionsToAdd.length > 0) {
        const hasCapacity = await this.waitForCacheWriteCapacity(
          FILE_EXTENSION_WRITE_MAX_QUEUE,
          'file-index.extensions.upsert'
        )
        if (!hasCapacity) {
          return
        }

        await this.withDbWrite('file-index.extensions.upsert', () =>
          this.dbUtils!.addFileExtensions(extensionsToAdd)
        )
      }
    } catch (error) {
      status = 'failed'
      throw error
    } finally {
      timingLogger.finish(
        timingToken,
        {
          stage: 'ProcessFileExtensions',
          message:
            status === 'success'
              ? 'Processed file extensions'
              : 'Failed to process file extensions',
          files: files.length,
          extensions: extensionsToAdd.length,
          status
        },
        FILE_TIMING_BASE_OPTIONS
      )
    }
  }

  private async buildIconCache(
    files: (typeof filesSchema.$inferSelect)[]
  ): Promise<Map<number, IconCacheEntry>> {
    const cache = new Map<number, IconCacheEntry>()
    if (!this.dbUtils) {
      return cache
    }

    const fileIds = files
      .map((file) => file.id)
      .filter((id): id is number => typeof id === 'number')

    if (fileIds.length === 0) {
      return cache
    }

    const rows = await this.dbUtils.getFileExtensionsByFileIds(fileIds, [
      'icon',
      FILE_ICON_META_EXTENSION_KEY
    ])
    const invalidIconFileIds: number[] = []

    for (const row of rows) {
      const entry = cache.get(row.fileId) ?? {}
      if (row.key === 'icon') {
        if (row.value && !isValidBase64DataUrl(row.value)) {
          invalidIconFileIds.push(row.fileId)
        } else {
          entry.icon = row.value
        }
      } else if (row.key === FILE_ICON_META_EXTENSION_KEY && row.value) {
        try {
          const parsed = JSON.parse(row.value) as FileIconCacheMeta
          entry.meta = {
            mtime: typeof parsed?.mtime === 'number' ? parsed.mtime : null,
            size: typeof parsed?.size === 'number' ? parsed.size : null
          }
        } catch {
          entry.meta = undefined
        }
      }
      cache.set(row.fileId, entry)
    }

    if (invalidIconFileIds.length > 0) {
      this.logWarn('Invalid icon cache detected, will re-extract', {
        count: invalidIconFileIds.length,
        sample: invalidIconFileIds.slice(0, 3)
      })
    }

    return cache
  }

  private sanitizeFileExtensions(extensions: Record<string, string>): Record<string, string> {
    const sanitized = { ...extensions }
    for (const key of ['icon', 'thumbnail'] as const) {
      const value = sanitized[key]
      if (!value) continue
      if (value.startsWith('data:')) {
        if (!isValidBase64DataUrl(value)) {
          delete sanitized[key]
        }
        continue
      }
      const normalized = normalizeRenderableSource(value)
      if ('missing' in normalized) {
        continue
      }
      sanitized[key] = normalized.value
    }
    return sanitized
  }

  private needsIconExtraction(
    file: typeof filesSchema.$inferSelect,
    cached?: IconCacheEntry
  ): boolean {
    if (!this.enableFileIconExtraction) {
      return false
    }
    if (!cached || !cached.icon) {
      return true
    }
    if (!cached.meta) {
      return true
    }
    const fileMtime = this.toTimestamp(file.mtime)
    const cachedMtime = typeof cached.meta.mtime === 'number' ? cached.meta.mtime : null
    if (cachedMtime !== fileMtime) {
      return true
    }
    const fileSize = typeof file.size === 'number' ? file.size : null
    const cachedSize = typeof cached.meta.size === 'number' ? cached.meta.size : null
    return cachedSize !== fileSize
  }

  private async deleteEmbeddingsByFileIds(
    executor: EmbeddingDbExecutor,
    fileIds: number[]
  ): Promise<void> {
    if (fileIds.length === 0) return
    const sourceIds = fileIds.map((id) => String(id))
    await executor
      .delete(embeddingsSchema)
      .where(
        and(eq(embeddingsSchema.sourceType, 'file'), inArray(embeddingsSchema.sourceId, sourceIds))
      )
  }

  private extractSearchFilters(rawText: string): {
    text: string
    typeFilters: Set<FileTypeTag>
    extensionFilters: string[]
  } {
    const tokens = rawText.split(/\s+/).filter(Boolean)
    const retained: string[] = []
    const typeFilters = new Set<FileTypeTag>()
    const extensionFilters: string[] = []

    for (const token of tokens) {
      const trimmed = token.trim()
      if (!trimmed) continue
      const normalized = trimmed.toLowerCase()

      // *.txt or *.{mp4,mov} glob pattern
      if (/^\*\.\w+$/.test(normalized) || /^\*\.\{[\w,]+\}$/.test(normalized)) {
        const extensions = this.parseExtensionGlob(normalized)
        if (extensions.length > 0) {
          extensionFilters.push(...extensions)
          continue
        }
      }

      // ext:pdf pattern
      if (normalized.startsWith('ext:')) {
        const ext = '.' + normalized.slice(4)
        if (WHITELISTED_EXTENSIONS.has(ext)) {
          extensionFilters.push(ext)
          continue
        }
      }

      if (normalized.startsWith('type:')) {
        const resolved = this.resolveTypeTag(normalized.slice(5))
        if (resolved) {
          typeFilters.add(resolved)
          continue
        }
      }

      const aliasTag = this.resolveTypeTag(normalized)
      if (aliasTag) {
        typeFilters.add(aliasTag)
      }

      retained.push(trimmed)
    }

    return { text: retained.join(' ').trim(), typeFilters, extensionFilters }
  }

  public hasSearchFilters(rawText: string): boolean {
    const { typeFilters, extensionFilters, text } = this.extractSearchFilters(rawText)
    return typeFilters.size > 0 || extensionFilters.length > 0 || text !== rawText.trim()
  }

  private resolveTypeTag(raw: string): FileTypeTag | null {
    return resolveFileProviderTypeTag(raw)
  }

  private parseExtensionGlob(pattern: string): string[] {
    // *.txt → ['.txt']
    const simpleMatch = pattern.match(/^\*\.(\w+)$/)
    if (simpleMatch) {
      const ext = '.' + simpleMatch[1]
      return WHITELISTED_EXTENSIONS.has(ext) ? [ext] : []
    }
    // *.{mp4,mov} → ['.mp4', '.mov']
    const braceMatch = pattern.match(/^\*\.\{([\w,]+)\}$/)
    if (braceMatch) {
      return braceMatch[1]
        .split(',')
        .map((e) => '.' + e.trim())
        .filter((ext) => WHITELISTED_EXTENSIONS.has(ext))
    }
    return []
  }

  private resolveExtensionsForTypeFilters(typeFilters: Set<FileTypeTag>): string[] {
    return resolveFileProviderExtensionsForTypeFilters(typeFilters)
  }

  private matchesTypeFilters(
    file: typeof filesSchema.$inferSelect,
    typeFilters: Set<FileTypeTag>
  ): boolean {
    if (typeFilters.size === 0) return true
    const extension = (file.extension || '').toLowerCase()
    const tags = new Set(getTypeTagsForExtension(extension))
    for (const tag of typeFilters) {
      if (tags.has(tag)) return true
    }
    return false
  }

  private async buildTypeOnlySearchResult(
    query: TuffQuery,
    typeFilters: Set<FileTypeTag>
  ): Promise<TuffSearchResult> {
    if (!this.dbUtils) {
      return new TuffSearchResultBuilder(query).build()
    }

    const extensions = this.resolveExtensionsForTypeFilters(typeFilters)
    if (extensions.length === 0) {
      return new TuffSearchResultBuilder(query).build()
    }

    const db = this.dbUtils.getDb()
    const rows = await db
      .select({
        file: filesSchema,
        extensionKey: fileExtensions.key,
        extensionValue: fileExtensions.value
      })
      .from(filesSchema)
      .leftJoin(fileExtensions, eq(filesSchema.id, fileExtensions.fileId))
      .where(and(eq(filesSchema.type, 'file'), inArray(filesSchema.extension, extensions)))
      .orderBy(desc(filesSchema.mtime))
      .limit(50)

    const filesMap = new Map<
      string,
      { file: typeof filesSchema.$inferSelect; extensions: Record<string, string> }
    >()

    for (const row of rows) {
      if (!this.matchesTypeFilters(row.file, typeFilters)) {
        continue
      }
      if (!filesMap.has(row.file.path)) {
        filesMap.set(row.file.path, { file: row.file, extensions: {} })
      }
      if (row.extensionKey && row.extensionValue) {
        filesMap.get(row.file.path)!.extensions[row.extensionKey] = row.extensionValue
      }
    }

    const items = Array.from(filesMap.values()).flatMap(({ file, extensions }) => {
      const sanitizedExtensions = this.sanitizeFileExtensions(extensions)
      const tuffItem = mapFileToTuffItem(
        file,
        sanitizedExtensions,
        this.id,
        this.name,
        (file) => {
          if (typeof file.id === 'number') {
            this.ensureFileIcon(file.id, file.path, file).catch((error) => {
              this.logWarn('Failed to lazy load icon', error, { path: file.path })
            })
          }
        },
        (file) => {
          if (typeof file.id === 'number') {
            this.ensureFileThumbnail(file.id, file.path, file, sanitizedExtensions).catch(
              (error) => {
                this.logWarn('Failed to lazy load thumbnail', error, { path: file.path })
              }
            )
          }
        }
      )
      tuffItem.scoring = {
        final: 0.4,
        match: 0.4,
        recency: 0,
        frequency: 0,
        base: 0
      }
      tuffItem.meta = {
        ...tuffItem.meta,
        file: {
          path: tuffItem.meta?.file?.path || '',
          ...tuffItem.meta?.file
        }
      }
      const normalizedItem = this.normalizeFileSearchItem(tuffItem, file, sanitizedExtensions, {
        reason: 'type-only-result',
        fallbackKind: file.isDir ? 'folder' : 'file'
      })
      if (!normalizedItem) return []
      return [normalizedItem]
    })

    return new TuffSearchResultBuilder(query).setItems(items).build()
  }

  private async buildExtensionOnlySearchResult(
    query: TuffQuery,
    extensionFilters: string[]
  ): Promise<TuffSearchResult> {
    if (!this.dbUtils || extensionFilters.length === 0) {
      return new TuffSearchResultBuilder(query).build()
    }

    const db = this.dbUtils.getDb()
    const normalizedExts = extensionFilters.map((e) => e.toLowerCase())
    const rows = await db
      .select({
        file: filesSchema,
        extensionKey: fileExtensions.key,
        extensionValue: fileExtensions.value
      })
      .from(filesSchema)
      .leftJoin(fileExtensions, eq(filesSchema.id, fileExtensions.fileId))
      .where(and(eq(filesSchema.type, 'file'), inArray(filesSchema.extension, normalizedExts)))
      .orderBy(desc(filesSchema.mtime))
      .limit(50)

    const filesMap = new Map<
      string,
      { file: typeof filesSchema.$inferSelect; extensions: Record<string, string> }
    >()

    for (const row of rows) {
      if (!filesMap.has(row.file.path)) {
        filesMap.set(row.file.path, { file: row.file, extensions: {} })
      }
      if (row.extensionKey && row.extensionValue) {
        filesMap.get(row.file.path)!.extensions[row.extensionKey] = row.extensionValue
      }
    }

    const items = Array.from(filesMap.values()).flatMap(({ file, extensions }) => {
      const sanitizedExtensions = this.sanitizeFileExtensions(extensions)
      const tuffItem = mapFileToTuffItem(
        file,
        sanitizedExtensions,
        this.id,
        this.name,
        (file) => {
          if (typeof file.id === 'number') {
            this.ensureFileIcon(file.id, file.path, file).catch((error) => {
              this.logWarn('Failed to lazy load icon', error, { path: file.path })
            })
          }
        },
        (file) => {
          if (typeof file.id === 'number') {
            this.ensureFileThumbnail(file.id, file.path, file, sanitizedExtensions).catch(
              (error) => {
                this.logWarn('Failed to lazy load thumbnail', error, { path: file.path })
              }
            )
          }
        }
      )
      tuffItem.scoring = {
        final: 0.4,
        match: 0.4,
        recency: 0,
        frequency: 0,
        base: 0
      }
      tuffItem.meta = {
        ...tuffItem.meta,
        file: {
          path: tuffItem.meta?.file?.path || '',
          ...tuffItem.meta?.file
        }
      }
      const normalizedItem = this.normalizeFileSearchItem(tuffItem, file, sanitizedExtensions, {
        reason: 'extension-only-result',
        fallbackKind: file.isDir ? 'folder' : 'file'
      })
      if (!normalizedItem) return []
      return [normalizedItem]
    })

    return new TuffSearchResultBuilder(query).setItems(items).build()
  }

  public async getIndexingProgress(paths?: string[]): Promise<{
    summary: Record<string, number>
    entries: Array<{
      path: string
      status: string | null
      progress: number | null
      processedBytes: number | null
      totalBytes: number | null
      updatedAt: Date | null
      lastError: string | null
    }>
  }> {
    if (!this.dbUtils) {
      return { summary: {}, entries: [] }
    }

    const db = this.dbUtils.getDb()
    const limit = paths && paths.length > 0 ? undefined : 50

    const rows = await db
      .select({
        path: filesSchema.path,
        status: fileIndexProgress.status,
        progress: fileIndexProgress.progress,
        processedBytes: fileIndexProgress.processedBytes,
        totalBytes: fileIndexProgress.totalBytes,
        updatedAt: fileIndexProgress.updatedAt,
        lastError: fileIndexProgress.lastError
      })
      .from(fileIndexProgress)
      .innerJoin(filesSchema, eq(fileIndexProgress.fileId, filesSchema.id))
      .where(paths && paths.length > 0 ? inArray(filesSchema.path, paths) : sql`1 = 1`)
      .orderBy(desc(fileIndexProgress.updatedAt))
      .limit(limit ?? Number.MAX_SAFE_INTEGER)

    const entries = rows.map((row) => ({
      path: row.path,
      status: row.status,
      progress: row.progress,
      processedBytes: row.processedBytes,
      totalBytes: row.totalBytes,
      updatedAt: row.updatedAt,
      lastError: row.lastError
    }))

    let summary: Record<string, number> = {}

    if (paths && paths.length > 0) {
      summary = entries.reduce<Record<string, number>>((acc, entry) => {
        const key = entry.status ?? 'unknown'
        acc[key] = (acc[key] ?? 0) + 1
        return acc
      }, {})
    } else {
      const summaryRows = await db.all<{ status: string; total: number }>(
        sql`SELECT status, COUNT(*) as total FROM file_index_progress GROUP BY status`
      )
      summary = summaryRows.reduce<Record<string, number>>((acc, row) => {
        acc[row.status ?? 'unknown'] = row.total
        return acc
      }, {})
    }

    return { summary, entries }
  }

  public async getWorkerStatusSnapshot(): Promise<FileProviderWorkerStatusSnapshot> {
    return this.workerStatusService.getSnapshot(() =>
      Promise.all([
        this.fileScanWorker.getStatus(),
        this.fileIndexWorker.getStatus(),
        this.reconcileWorker.getStatus(),
        this.iconWorker.getStatus(),
        this.thumbnailWorker.getStatus(),
        this.searchIndexWorker.getStatus()
      ])
    )
  }

  public isSearchIndexWorkerBusy(): boolean {
    return (
      this.pendingIndexWorkerResults.size > 0 ||
      this.inflightIndexWorkerResults.size > 0 ||
      this.searchIndexWorker.hasPendingWork()
    )
  }

  private scheduleSemanticEnrichment(normalizedQuery: string, candidateCount: number): void {
    const shouldRunSemantic =
      Boolean(this.embeddingService) &&
      normalizedQuery.length >= SEMANTIC_TRIGGER_MIN_QUERY_LENGTH &&
      candidateCount < SEMANTIC_TRIGGER_MAX_CANDIDATES

    if (!shouldRunSemantic || !this.embeddingService) {
      return
    }

    setTimeout(() => {
      void this.embeddingService?.semanticSearch(normalizedQuery, 30).catch((error) => {
        this.logWarn('Semantic enrichment failed', error)
        return []
      })
    }, SEMANTIC_SEARCH_TIMEOUT_MS)
  }

  async onSearch(query: TuffQuery, _signal: AbortSignal): Promise<TuffSearchResult> {
    searchLogger.logProviderSearch('file-provider', query.text, 'File System')
    searchLogger.fileSearchStart(query.text)
    if (!this.dbUtils || !this.searchIndex) {
      searchLogger.fileSearchNotInitialized()
      return new TuffSearchResultBuilder(query).build()
    }

    const searchStart = performance.now()
    const rawText = query.text.trim()
    const { text: searchText, typeFilters, extensionFilters } = this.extractSearchFilters(rawText)
    searchLogger.fileSearchText(searchText, typeFilters.size)

    const logTerms = searchText
      .toLowerCase()
      .split(/[\s/]+/)
      .filter(Boolean)
    searchLogger.logKeywordAnalysis(searchText, logTerms, typeFilters.size)

    if (!searchText && typeFilters.size === 0 && extensionFilters.length === 0) {
      return new TuffSearchResultBuilder(query).build()
    }

    if (!searchText && typeFilters.size > 0) {
      return this.buildTypeOnlySearchResult(query, typeFilters)
    }

    if (!searchText && extensionFilters.length > 0) {
      return this.buildExtensionOnlySearchResult(query, extensionFilters)
    }

    const db = this.dbUtils.getDb()
    const normalizedQuery = searchText.toLowerCase()
    const baseTerms = normalizedQuery.split(/[\s/]+/).filter(Boolean)
    const terms = baseTerms.length > 0 ? baseTerms : [normalizedQuery]
    const shouldCheckPhrase = baseTerms.length > 1 || baseTerms.length === 0

    let preciseMatchPaths: Set<string> | null = null
    const preciseLookupTerms = shouldCheckPhrase
      ? Array.from(new Set([...terms, normalizedQuery]))
      : terms
    if (preciseLookupTerms.length > 0) {
      searchLogger.filePreciseSearch(terms)
      const preciseStart = performance.now()
      const preciseSearchLimit = Math.max(200, preciseLookupTerms.length * 200)
      const preciseResultMap = await this.searchIndex.lookupByKeywords(
        this.id,
        preciseLookupTerms,
        preciseSearchLimit
      )

      const termMatches = terms.map(
        (term) => new Set((preciseResultMap.get(term) ?? []).map((entry) => entry.itemId))
      )
      searchLogger.filePreciseQueries(1)
      searchLogger.filePreciseResults(termMatches.map((s) => s.size))

      if (termMatches.length > 0) {
        preciseMatchPaths = termMatches.reduce((accumulator, current) => {
          if (!accumulator) return current
          return new Set([...accumulator].filter((id) => current.has(id)))
        })
      }
      this.logDebug('Precise keyword lookup completed', {
        terms: terms.join(', '),
        duration: formatDuration(performance.now() - preciseStart)
      })

      if (shouldCheckPhrase) {
        const phraseStart = performance.now()
        const phraseMatches = preciseResultMap.get(normalizedQuery) ?? []
        if (phraseMatches.length > 0) {
          const phraseSet = new Set(phraseMatches.map((entry) => entry.itemId))
          preciseMatchPaths = preciseMatchPaths
            ? new Set([...preciseMatchPaths, ...phraseSet])
            : phraseSet
        }
        this.logDebug('Phrase keyword lookup completed', {
          query: normalizedQuery,
          matches: preciseMatchPaths?.size ?? 0,
          duration: formatDuration(performance.now() - phraseStart)
        })
      }
    }

    // Prefix recall for short queries (e.g. "wind" → "windsurf")
    if (normalizedQuery.length <= 5) {
      const prefixStart = performance.now()
      const prefixResults = await this.searchIndex.lookupByKeywordPrefix(
        this.id,
        normalizedQuery,
        200
      )
      if (prefixResults.length > 0) {
        const prefixSet = new Set(prefixResults.map((r) => r.itemId))
        preciseMatchPaths = preciseMatchPaths
          ? new Set([...preciseMatchPaths, ...prefixSet])
          : prefixSet
      }
      this.logDebug('Prefix keyword lookup completed', {
        query: normalizedQuery,
        matches: prefixResults.length,
        duration: formatDuration(performance.now() - prefixStart)
      })
    }

    const ftsQuery = this.buildFtsQuery(terms.length > 0 ? terms : [normalizedQuery])
    searchLogger.fileFtsQuery(ftsQuery || '')
    const ftsStart = performance.now()
    const ftsMatches = ftsQuery ? await this.searchIndex.search(this.id, ftsQuery, 150) : []
    searchLogger.fileFtsResults(ftsMatches.length, performance.now() - ftsStart)
    if (ftsQuery) {
      this.logDebug('FTS search completed', {
        query: ftsQuery,
        matches: ftsMatches.length,
        duration: formatDuration(performance.now() - ftsStart)
      })
    }

    const preciseCandidates = preciseMatchPaths ? Array.from(preciseMatchPaths) : []
    const maxCandidateCount = 120
    const candidateIds = new Set<string>(preciseCandidates)

    for (const match of ftsMatches) {
      if (candidateIds.size >= maxCandidateCount) break
      candidateIds.add(match.itemId)
    }

    const semanticScoreMap = new Map<string, number>()
    this.scheduleSemanticEnrichment(normalizedQuery, candidateIds.size)

    if (candidateIds.size === 0) {
      return new TuffSearchResultBuilder(query).build()
    }

    const candidatePaths = Array.from(candidateIds).slice(0, maxCandidateCount)

    searchLogger.fileDataFetch(candidatePaths.length)
    const dataFetchStart = performance.now()
    const rows = await db
      .select({
        file: filesSchema,
        extensionKey: fileExtensions.key,
        extensionValue: fileExtensions.value
      })
      .from(filesSchema)
      .leftJoin(fileExtensions, eq(filesSchema.id, fileExtensions.fileId))
      .where(and(eq(filesSchema.type, 'file'), inArray(filesSchema.path, candidatePaths)))
    searchLogger.fileDataResults(rows.length, performance.now() - dataFetchStart)
    this.logDebug('Loaded candidate rows for scoring', {
      count: rows.length,
      duration: formatDuration(performance.now() - dataFetchStart)
    })

    const filesMap = new Map<
      string,
      { file: typeof filesSchema.$inferSelect; extensions: Record<string, string> }
    >()

    for (const row of rows) {
      if (!filesMap.has(row.file.path)) {
        filesMap.set(row.file.path, { file: row.file, extensions: {} })
      }
      if (row.extensionKey && row.extensionValue) {
        filesMap.get(row.file.path)!.extensions[row.extensionKey] = row.extensionValue
      }
    }

    const staleIds = candidatePaths.filter((path) => !filesMap.has(path))
    if (staleIds.length > 0) {
      await this.removeSearchIndexItems(staleIds, 'search.remove-stale-candidates')
    }

    if (filesMap.size === 0) {
      return new TuffSearchResultBuilder(query).build()
    }

    if (typeFilters.size > 0) {
      for (const [path, entry] of Array.from(filesMap.entries())) {
        if (!this.matchesTypeFilters(entry.file, typeFilters)) {
          filesMap.delete(path)
        }
      }

      if (filesMap.size === 0) {
        return new TuffSearchResultBuilder(query).build()
      }
    }

    if (extensionFilters.length > 0) {
      const extSet = new Set(extensionFilters.map((e) => e.toLowerCase()))
      for (const [path, entry] of Array.from(filesMap.entries())) {
        const fileExt = (entry.file.extension || '').toLowerCase()
        if (!extSet.has(fileExt)) {
          filesMap.delete(path)
        }
      }

      if (filesMap.size === 0) {
        return new TuffSearchResultBuilder(query).build()
      }
    }

    const ftsScoreMap = new Map<string, number>()
    for (const match of ftsMatches) {
      const normalizedScore = match.score > 0 ? 1 / (match.score + 1) : 1
      const previous = ftsScoreMap.get(match.itemId) ?? 0
      if (normalizedScore > previous) {
        ftsScoreMap.set(match.itemId, normalizedScore)
      }
    }

    const now = Date.now()
    const weights = {
      keyword: 0.45,
      fts: 0.35,
      lastUsed: 0.1,
      frequency: 0.05,
      lastModified: 0.05
    }

    const scoredItems = Array.from(filesMap.values())
      .map(({ file, extensions }) => {
        const sanitizedExtensions = this.sanitizeFileExtensions(extensions)
        const lastModified = new Date(file.mtime).getTime()
        const daysSinceLastModified = (now - lastModified) / (1000 * 3600 * 24)
        const lastModifiedScore = Math.exp(-0.05 * daysSinceLastModified)

        const lastUsedScore = 0
        const frequencyScore = 0
        const keywordScore = preciseMatchPaths?.has(file.path) ? 1 : 0
        const ftsScore = ftsScoreMap.get(file.path) ?? 0
        const semanticScore = semanticScoreMap.get(file.path) ?? 0

        const typeScore = typeFilters.size > 0 ? 1 : 0

        const finalScore =
          weights.keyword * keywordScore +
          weights.fts * ftsScore +
          weights.lastUsed * lastUsedScore +
          weights.frequency * frequencyScore +
          weights.lastModified * lastModifiedScore +
          (typeFilters.size > 0 ? 0.15 * typeScore : 0) +
          0.25 * semanticScore

        const tuffItem = mapFileToTuffItem(
          file,
          sanitizedExtensions,
          this.id,
          this.name,
          (file) => {
            if (typeof file.id === 'number') {
              this.ensureFileIcon(file.id, file.path, file).catch((error) => {
                this.logWarn('Failed to lazy load icon', error, { path: file.path })
              })
            }
          },
          (file) => {
            if (typeof file.id === 'number') {
              this.ensureFileThumbnail(file.id, file.path, file, sanitizedExtensions).catch(
                (error) => {
                  this.logWarn('Failed to lazy load thumbnail', error, { path: file.path })
                }
              )
            }
          }
        )
        const matchScore = Math.max(keywordScore, ftsScore, semanticScore)
        tuffItem.scoring = {
          final: finalScore,
          match: matchScore,
          recency: lastUsedScore,
          frequency: frequencyScore,
          base: lastModifiedScore,
          match_details:
            keywordScore > 0
              ? { type: 'exact', query: rawText }
              : ftsScore > 0
                ? { type: 'semantic', query: rawText, confidence: ftsScore }
                : semanticScore > 0
                  ? { type: 'semantic', query: rawText, confidence: semanticScore }
                  : undefined
        }

        if (!tuffItem.meta) {
          tuffItem.meta = {}
        }

        tuffItem.meta.usage = { clickCount: 0 }

        const extensionMeta = tuffItem.meta.extension ?? {}
        tuffItem.meta.extension = {
          ...extensionMeta,
          search: {
            keywordMatch: keywordScore > 0,
            ftsScore,
            semanticScore
          }
        }

        if (typeFilters.size > 0) {
          // tuffItem.meta.file = {
          //   ...(tuffItem.meta.file as Record<string, unknown> | undefined),
          //   fileTypes: Array.from(typeFilters)
          // }
        }

        return this.normalizeFileSearchItem(tuffItem, file, sanitizedExtensions, {
          reason: 'search-result',
          fallbackKind: file.isDir ? 'folder' : 'file'
        })
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => (b.scoring?.final || 0) - (a.scoring?.final || 0))
      .slice(0, 50)

    const result = new TuffSearchResultBuilder(query).setItems(scoredItems).build()
    this.logDebug('Search completed', {
      query: rawText,
      items: scoredItems.length,
      duration: formatDuration(performance.now() - searchStart)
    })
    return result
  }

  private async ensureKeywordIndexes(db: LibSQLDatabase<typeof schema>): Promise<void> {
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS idx_keyword_mappings_keyword ON keyword_mappings(keyword)`
    )
  }

  async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    const filePath = args.item.meta?.file?.path
    if (!filePath) {
      const err = new Error('File path not found in TuffItem')
      this.logError('File path missing for execution request', err)
      return null
    }

    try {
      // Check if file exists before opening to avoid macOS system dialog
      await fs.access(filePath)
      await shell.openPath(filePath)
      return null
    } catch (err: unknown) {
      const errorCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? (err as { code?: string }).code
          : undefined
      if (errorCode === 'ENOENT') {
        this.logError('File not found', new Error(`File does not exist: ${filePath}`), {
          path: filePath
        })
      } else {
        this.logError('Failed to open file', err, { path: filePath })
      }
      return null
    }
  }
}

export const fileProvider = new FileProvider()
