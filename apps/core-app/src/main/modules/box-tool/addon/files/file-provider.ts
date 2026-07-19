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
  IndexedSourceWatchEvent,
  IndexedWriteFlushSnapshot
} from '@talex-touch/utils/search'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { TouchApp } from '../../../../core/touch-app'
import type * as schema from '../../../../db/schema'
import type { SearchIndexService } from '../../search-engine/search-index-service'
import type { ProviderContext } from '../../search-engine/types'
import type { FileIndexSettings, ScannedFileInfo } from './types'
import type { IndexWorkerFileResult } from './workers/file-index-worker-client'
import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { StorageList, timingLogger, TuffInputType } from '@talex-touch/utils'
import { fileFilterService } from '@talex-touch/utils/common/file-filter-service'
import { getLogger } from '@talex-touch/utils/common/logger'
import { runAdaptiveTaskQueue } from '@talex-touch/utils/common/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { OpenerEvents } from '@talex-touch/utils/transport/events'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import {
  IndexedSourceIntegrityEvidenceService,
  IndexedWriteFlushEvidenceService,
  IndexedWriteFlushSnapshotService,
  IndexedSourceResetReasons,
  IndexedSourceScanReasons,
  IndexedWriteRuntimeEmitterService,
  buildIndexedWriteFlushFailureSnapshot,
  buildIndexedWriteFlushResultSnapshot,
  isIndexedWatchPathOwned,
  mapIndexedFileSourceRecord,
  resolveIndexedWatchRootSet
} from '@talex-touch/utils/search'
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { app, shell } from 'electron'
import { notificationModule } from '../../../notification'
import { t } from '../../../../utils/i18n-helper'
import emptyOpenerSvg from '../../../../../renderer/src/assets/svg/EmptyAppPlaceholder.svg?raw'
import { dbWriteScheduler } from '../../../../db/db-write-scheduler'
import {
  embeddings as embeddingsSchema,
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
import { getTypeTagsForExtension, KEYWORD_MAP, WHITELISTED_EXTENSIONS } from './constants'
import {
  isIndexableFile,
  mapFileToTuffItem,
  scanDirectoryBatches as scanDirectoryBatchesDirect
} from './utils'
import { FileIndexWorkerClient } from './workers/file-index-worker-client'
import { FileReconcileWorkerClient } from './workers/file-reconcile-worker-client'
import { FileScanWorkerClient } from './workers/file-scan-worker-client'
import { EmbeddingService } from './embedding-service'
import { IconWorkerClient } from './workers/icon-worker-client'
import { ThumbnailWorkerClient } from './workers/thumbnail-worker-client'
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
import type { FilePersistencePort, UpsertFileRecord } from '../../search-engine/search-index-writer'
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
import { FileProviderAssetService } from './services/file-provider-asset-service'
import { FileProviderSearchResultService } from './services/file-provider-search-result-service'
import FileSystemWatcher from '../../file-system-watcher'

const fileProviderLog = getLogger('file-provider')
const BASE64_MARKER = 'base64,'
const BASE64_PAYLOAD_PATTERN = /^[A-Za-z0-9+/=]+$/
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

type FileProviderRuntimeWriteSnapshot = Omit<IndexedWriteFlushSnapshot, 'status'> & {
  status: 'flushed' | 'failed'
}

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
const FILE_PROVIDER_BASE_WATCH_PATHS_ENV = 'TUFF_FILE_PROVIDER_BASE_WATCH_PATHS'

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
  throwOnFailure?: boolean
  signal?: AbortSignal
  mutationLeaseId?: string
}

export interface FileIndexedSourceRuntimeMutationDelegate {
  applyBatch: (batch: IndexedSourceRecordBatch) => Promise<unknown>
  applyDelta: (delta: IndexedSourceDelta) => Promise<unknown>
  cleanupSource: (sourceId: string, mutationLeaseId?: string) => Promise<unknown>
  countSource: (sourceId: string, mutationLeaseId?: string) => Promise<number>
  drainSource: (sourceId: string, timeoutMs?: number) => Promise<void>
  scanSource: (reason: IndexedSourceScanRequest['reason']) => Promise<unknown>
}

interface FileIndexedSourceScanResult {
  batches: IndexedSourceRecordBatch[]
}

const FILE_INDEX_SEARCH_DRAIN_TIMEOUT_MS = 30_000
const FILE_INDEX_SEARCH_DRAIN_INTERVAL_MS = 100

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

export function resolveFileProviderBaseWatchPaths(input: {
  envValue?: string
  getPath: (name: 'documents' | 'downloads' | 'desktop' | 'music' | 'pictures' | 'videos') => string
  onPathError?: (name: string, error: unknown) => void
}): string[] {
  const envPaths =
    typeof input.envValue === 'string'
      ? input.envValue
          .split(path.delimiter)
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => path.resolve(value))
      : []
  if (envPaths.length > 0) {
    return [...new Set(envPaths)]
  }

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
      return input.getPath(name)
    } catch (error) {
      input.onPathError?.(name, error)
      return null
    }
  })
  return [...new Set(paths.filter((p): p is string => !!p))]
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
  private readonly fileScanWorker = new FileScanWorkerClient()
  private readonly reconcileWorker = new FileReconcileWorkerClient()
  private readonly fileIndexWorker: FileIndexWorkerClient
  private readonly iconWorker = new IconWorkerClient()
  private readonly thumbnailWorker = new ThumbnailWorkerClient()

  private filePersistencePort: FilePersistencePort | null = null
  private filePersistenceReady: Promise<boolean> | null = null
  private backgroundStartupPromise: Promise<void> | null = null
  private backgroundStartupReady = false
  private backgroundStartupError: Error | null = null
  private readonly workerStatusService = new FileProviderWorkerStatusService()
  private readonly pendingIndexWorkerResults = new Map<number, IndexWorkerFileResult>()
  private readonly inflightIndexWorkerResults = new Map<number, IndexWorkerFileResult>()
  private readonly cancelledIndexWorkerMutationLeases = new Set<string>()
  private manualRebuildPendingNotification = false
  private shuttingDown = false
  private lastIntegritySnapshot: FileProviderIntegritySnapshot | null = null
  private indexedSourceRuntimeResetDelegate: FileIndexedSourceRuntimeResetDelegate | null = null
  private indexedSourceRuntimeMutationDelegate: FileIndexedSourceRuntimeMutationDelegate | null =
    null

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
  private readonly incrementalPersistSnapshotService =
    new IndexedWriteFlushSnapshotService<FileProviderRuntimeWriteSnapshot>()
  private readonly ftsWriteSnapshotService =
    new IndexedWriteFlushSnapshotService<FileProviderRuntimeWriteSnapshot>()
  private readonly ftsDeleteSnapshotService =
    new IndexedWriteFlushSnapshotService<FileProviderRuntimeWriteSnapshot>()
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
  private readonly assetService: FileProviderAssetService
  private readonly searchResultService: FileProviderSearchResultService
  private readonly watchRuntimeEmitter =
    new IndexedWriteRuntimeEmitterService<IndexedFileSourceRecordRow>({
      sourceId: this.id,
      mapRecord: (record) => this.mapFileToIndexedSourceRecord(record),
      getPath: (record) => record.path
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
    this.assetService = new FileProviderAssetService({
      getDbUtils: () => this.dbUtils,
      withDbWrite: (label, operation) => this.withDbWrite(label, operation),
      waitForWriteCapacity: (maxQueued, label) => this.waitForCacheWriteCapacity(maxQueued, label),
      waitForIdle: async () => {
        await appTaskGate.waitForIdle()
      },
      yieldToEventLoop: async () => await new Promise<void>((resolve) => setImmediate(resolve)),
      toTimestamp: (value) => this.toTimestamp(value),
      isValidBase64DataUrl,
      logDebug: (message, meta) => this.logDebug(message, meta),
      logWarn: (message, error, meta) => this.logWarn(message, error, meta),
      iconWorker: this.iconWorker,
      thumbnailWorker: this.thumbnailWorker,
      enableIconExtraction: this.enableFileIconExtraction,
      iconWriteMaxQueue: FILE_ICON_WRITE_MAX_QUEUE
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
      extractFileIconQueued: (filePath) => this.assetService.extractIconQueued(filePath),
      isValidBase64DataUrl,
      logWarn: (message, error, meta) => this.logWarn(message, error, meta),
      logError: (message, error, meta) => this.logError(message, error, meta)
    })
    this.runtimeResetService = new FileProviderRuntimeResetService({
      sourceId: this.id,
      getDbUtils: () => this.dbUtils,
      normalizePath: (rawPath) => this.normalizePath(rawPath),
      getScanProgressPaths: () => [...this.watchPaths],
      withDbWrite: (label, operation) => this.withDbWrite(label, operation),
      logInfo: (message, meta) => this.logInfo(message, meta)
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
      getSearchIndexWorker: () => this.requireFilePersistencePort()
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
      updateRecords: (records) => this._processFileUpdates(records, 10),
      logDebug: (message, meta) => this.logDebug(message, meta),
      logInfo: (message, meta) => this.logInfo(message, meta)
    })
    this.writeSideEffectService = new FileProviderWriteSideEffectService({
      processFileExtensions: (files) => this.processFileExtensions(files),
      scheduleIndexing: (files, reason, mutationLeaseId) =>
        this.scheduleIndexing(files, reason, mutationLeaseId),
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
      logDebug: (message, meta) => this.logDebug(message, meta),
      successMessage: 'Incremental remove completed'
    })
    this.cleanupDeleteService = new FileProviderCleanupDeleteService({
      sourceId: this.id,
      getIndexedFileRecordsPage: async (afterId, limit, runOptions) => {
        runOptions?.signal?.throwIfAborted()
        if (!this.dbUtils) return []
        return await this.dbUtils
          .getDb()
          .select({ path: filesSchema.path, id: filesSchema.id })
          .from(filesSchema)
          .where(and(eq(filesSchema.type, 'file'), gt(filesSchema.id, afterId)))
          .orderBy(filesSchema.id)
          .limit(limit)
      },
      isWithinWatchRoots: (filePath) => this.isWithinWatchRoots(filePath),
      yieldAfterRead: async () => {
        await new Promise<void>((resolve) => setImmediate(resolve))
      },
      deleteRecords: (records) => this.deleteCleanupRecords(records),
      emitDelta: (delta, runOptions) => this.emitIndexedSourceDelta(delta, runOptions),
      emitProgress: (current, total) => this.emitIndexingProgress('cleanup', current, total),
      now: () => performance.now(),
      formatDuration,
      logInfo: (message, meta) => this.logInfo(message, meta),
      logDebug: (message, meta) => this.logDebug(message, meta)
    })
    this.fullScanRunService = new FileProviderFullScanRunService({
      enterPerfContext: (label, metadata) => enterPerfContext(label, metadata),
      scanDirectory: (rootPath, currentExcludePathsSet, runOptions) =>
        this.scanDirectoryBatchesWithWorker(rootPath, currentExcludePathsSet, runOptions?.signal),
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
      updateRecords: (records) => this._processFileUpdates(records, 10),
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
      emitRecordBatch: (batch, runOptions) =>
        this.emitIndexedSourceRecordBatchFromBatch(batch, runOptions),
      emitDelta: (delta, runOptions) => this.emitIndexedSourceDelta(delta, runOptions),
      shouldEmitRecordBatch: (runOptions) => Boolean(runOptions?.onRecordBatch),
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
      assertActive: (runOptions) => runOptions?.signal?.throwIfAborted(),
      prepareSeenPaths: (runOptions) => this.prepareReconciliationSeenPaths(runOptions),
      recordSeenPaths: (paths, runOptions) => this.recordReconciliationSeenPaths(paths, runOptions),
      getDbFilesByPaths: (paths, runOptions) =>
        this.getReconciliationDbFilesByPaths(paths, runOptions),
      getMissingDbFiles: (rootPath, afterId, limit, runOptions) =>
        this.getMissingReconciliationDbFiles(rootPath, afterId, limit, runOptions),
      clearSeenPaths: (runOptions) => this.clearReconciliationSeenPaths(runOptions),
      scanDirectory: (rootPath, currentExcludePathsSet, runOptions) =>
        this.scanDirectoryBatchesWithWorker(rootPath, currentExcludePathsSet, runOptions?.signal),
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
      getSearchIndexWorker: () => this.requireFilePersistencePort(),
      buildPersistEntries: (entries) => this.indexPersistEntryMapper.map(entries),
      publishRecords: async (entries) => await this.publishCommittedWorkerRecords(entries),
      logDebug: (message, meta) => this.logDebug(message, meta),
      logWarn: (message, error, meta) => this.logWarn(message, error, meta)
    })
    this.fileIndexWorker = new FileIndexWorkerClient((payload) => {
      if (this.isIndexWorkerMutationLeaseCancelled(payload.mutationLeaseId)) return
      this.indexRuntimeService.handleIndexWorkerFile(payload)
    })
    this.searchResultService = new FileProviderSearchResultService({
      providerId: this.id,
      getDbUtils: () => this.dbUtils,
      getSearchIndex: () => this.searchIndex,
      buildItem: (file, extensions) => this.createFileSearchItem(file, extensions),
      normalizeItem: (item, file, extensions, reason) =>
        this.normalizeFileSearchItem(item, file, extensions, { reason }),
      sanitizeExtensions: (extensions) => this.sanitizeFileExtensions(extensions),
      cleanupStaleCandidates: (paths) => this.cleanupStaleSearchCandidates(paths),
      semanticSearch: (semanticQuery, limit) =>
        this.embeddingService?.semanticSearch(semanticQuery, limit) ?? Promise.resolve([]),
      logDebug: (message, meta) => this.logDebug(message, meta),
      formatDuration,
      now: () => performance.now()
    })
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
    this.shuttingDown = true
    try {
      const producerDrains: Promise<void>[] = []
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
      this.indexSchedulerService.close()
      this.fileScanWorker.shutdown()
      this.fileIndexWorker.shutdown()
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
    const files = await this.dbUtils
      .getDb()
      .select()
      .from(filesSchema)
      .where(and(eq(filesSchema.type, 'file'), inArray(filesSchema.path, paths)))
    if (files.length === 0) return
    this.writeSideEffectService.dispatch(files, {
      extensionContext: 'runtime-writer-ack',
      indexReason: 'runtime-writer-ack',
      mutationLeaseId
    })
  }

  private requireFilePersistencePort(): FilePersistencePort {
    if (!this.filePersistencePort) {
      throw new Error('FILE_PERSISTENCE_PORT_UNAVAILABLE')
    }
    return this.filePersistencePort
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

  private async removeSearchIndexItems(itemIds: string[], reason: string): Promise<void> {
    if (itemIds.length === 0) return
    const delegate = this.requireRuntimeMutationDelegate()
    await Promise.all(
      itemIds.map(
        async (itemId) =>
          await delegate.applyDelta({
            sourceId: this.id,
            action: 'delete',
            stableKey: itemId,
            path: itemId,
            reason
          })
      )
    )
  }

  private cleanupStaleSearchCandidates(itemIds: string[]): void {
    if (itemIds.length === 0) return

    void (async () => {
      if (!(await this.ensureSearchIndexWorkerReady('search.remove-stale-candidates'))) return
      const persistence = this.requireFilePersistencePort()
      for (const itemId of itemIds) await persistence.removeFile(itemId)
      await this.removeSearchIndexItems(itemIds, 'search.remove-stale-candidates')
    })().catch((error) => {
      if (isSqliteBusyError(error)) {
        this.logDebug('Stale search candidate cleanup deferred (db busy)', {
          count: itemIds.length
        })
        return
      }
      this.logWarn('Failed to cleanup stale search candidates', error, { count: itemIds.length })
    })
  }

  private cleanupStaleFileResult(file: typeof filesSchema.$inferSelect, reason: string): void {
    void this.ensureSearchIndexWorkerReady(`file-index.${reason}.cleanup`)
      .then(async (ready) => {
        if (!ready) {
          this.logDebug('Stale file result cleanup skipped: persistence port not ready', {
            path: file.path,
            reason
          })
          return
        }
        await this.requireFilePersistencePort().removeFile(file.path)
        await this.removeSearchIndexItems([file.path], `file-index.${reason}.remove-search`)
      })
      .catch((error) => {
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
    void this.ensureSearchIndexWorkerReady(`file-index.${reason}.cleanup-asset`)
      .then(async (ready) => {
        if (!ready) {
          this.logDebug('Stale file asset cleanup skipped: persistence port not ready', {
            path: file.path,
            keys,
            reason
          })
          return
        }
        await this.requireFilePersistencePort().removeFileExtensions(file.id, keys)
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
        void this.assetService.ensureThumbnail(file.id, file.path, file).catch((error) => {
          this.logWarn('Failed to regenerate stale thumbnail', error, { path: file.path })
        })
      }
      if (staleKeys.includes('icon') && typeof file.id === 'number') {
        void this.assetService.ensureIcon(file.id, file.path, file).catch((error) => {
          this.logWarn('Failed to regenerate stale icon', error, { path: file.path })
        })
      }
    }

    return normalized.item
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
    return await this.indexedSourceRuntimeResetDelegate(request)
  }

  public async resetIndexedSourceRuntimeState(
    request: IndexedSourceResetRequest
  ): Promise<IndexedSourceResetResult> {
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

  private async upsertSearchIndexFiles(
    records: UpsertFileRecord[],
    reason: string
  ): Promise<Array<typeof filesSchema.$inferSelect>> {
    if (records.length === 0) return []

    const acceptedRecords = records.filter((record) => {
      const extension = record.extension?.toLowerCase() || path.extname(record.name).toLowerCase()
      return (
        WHITELISTED_EXTENSIONS.has(extension) &&
        fileFilterService.getIndexExclusionReason({
          path: record.path,
          name: record.name,
          extension
        }) === null
      )
    })
    if (acceptedRecords.length === 0) return []
    if (!(await this.ensureSearchIndexWorkerReady(reason))) {
      throw new Error('FILE_PERSISTENCE_PORT_UNAVAILABLE')
    }

    const startedAt = performance.now()
    try {
      const persisted = (await this.requireFilePersistencePort().upsertFiles(
        acceptedRecords
      )) as unknown as Array<typeof filesSchema.$inferSelect>
      this.recordRuntimeWriteSnapshot(this.ftsWriteSnapshotService, {
        entries: persisted.length,
        reason,
        durationMs: performance.now() - startedAt,
        metadata: {
          requestedRows: records.length,
          acceptedRows: acceptedRecords.length,
          persistedRows: persisted.length,
          storeBoundary: 'file-persistence'
        }
      })
      return persisted
    } catch (error) {
      this.recordRuntimeWriteFailureSnapshot(this.ftsWriteSnapshotService, {
        error,
        reason,
        entries: acceptedRecords.length,
        metadata: {
          requestedRows: records.length,
          acceptedRows: acceptedRecords.length,
          storeBoundary: 'file-persistence'
        }
      })
      throw error
    }
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
    return (
      mutationLeaseId !== undefined && this.cancelledIndexWorkerMutationLeases.has(mutationLeaseId)
    )
  }

  private async publishCommittedWorkerRecords(entries: IndexWorkerFileResult[]): Promise<number> {
    if (entries.length === 0) return 0
    const entriesByLease = new Map<string | undefined, IndexWorkerFileResult[]>()
    for (const entry of entries) {
      const group = entriesByLease.get(entry.mutationLeaseId) ?? []
      group.push(entry)
      entriesByLease.set(entry.mutationLeaseId, group)
    }

    let indexedItems = 0
    for (const [mutationLeaseId, group] of entriesByLease) {
      if (this.isIndexWorkerMutationLeaseCancelled(mutationLeaseId)) {
        this.logWarn('Discarded worker enrichment from a cancelled mutation lease', undefined, {
          mutationLeaseId,
          entries: group.length
        })
        continue
      }
      const summary = await this.requireRuntimeMutationDelegate().applyBatch({
        sourceId: this.id,
        records: group.map((entry) => this.mapWorkerResultToIndexedSourceRecord(entry)),
        mutationLeaseId
      })
      if (summary && typeof summary === 'object' && 'indexedItemCount' in summary) {
        indexedItems += Number(summary.indexedItemCount) || 0
      }
    }
    return indexedItems
  }

  private async emitIndexedSourceRecordBatchFromBatch(
    batch: IndexedSourceRecordBatch,
    options?: FileIndexRunOptions
  ): Promise<void> {
    if (batch.records.length === 0) return
    if (options?.onRecordBatch) {
      await options.onRecordBatch(batch)
      return
    }
    await this.requireRuntimeMutationDelegate().applyBatch(batch)
  }

  private async emitIndexedSourceDelta(
    delta: IndexedSourceDelta,
    options?: FileIndexRunOptions
  ): Promise<void> {
    if (options?.onDelta) {
      await options.onDelta(delta)
      return
    }
    await this.requireRuntimeMutationDelegate().applyDelta(delta)
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
    if (this.shuttingDown) return
    this.watchService.initializeBackgroundTaskService()
    this.syncWatchServiceState()
  }

  private scheduleBackgroundStartupTasks(loadStart: number): void {
    if (this.shuttingDown || this.backgroundStartupPromise) return

    this.backgroundStartupReady = false
    this.backgroundStartupError = null
    this.backgroundStartupPromise = new Promise<void>((resolve) => setImmediate(resolve))
      .then(async () => {
        if (this.shuttingDown) return
        const becameIdle = await appTaskGate.waitForIdle(FILE_PROVIDER_STARTUP_READY_WAIT_MS)
        if (this.shuttingDown) return
        this.logDebug('FileProvider background startup running', { becameIdle })

        const workerReady = await this.ensureSearchIndexWorkerReady('startup.background')
        if (this.shuttingDown) return
        this.initializeBackgroundTaskService()
        await this.ensureFileSystemWatchers()
        if (this.shuttingDown) return

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
    if (this.shuttingDown) return
    const decision = await this.shouldRunAutoIndexing()
    if (!decision.allowed) {
      this.logDebug('Auto index scan skipped', {
        reason: decision.reason,
        batteryLevel: decision.battery?.level ?? null,
        batteryCharging: decision.battery?.charging ?? null
      })
      return
    }
    if (this.shuttingDown) return

    await this.ensureFileSystemWatchers()
    try {
      await this.requireRuntimeMutationDelegate().scanSource(IndexedSourceScanReasons.Startup)
    } catch (error) {
      this.logWarn('Auto index scan aborted', error)
    }
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
    this.initializationError = null
    const run = this._initialize(options)
      .then(async (stats) => {
        if (!options?.onRecordBatch && !options?.onDelta) {
          await this.drainIndexedSourceMutations(`indexing.${source}`)
        }
        this.initializationFailed = false
        this.logInfo(`File indexing ${source} run completed successfully`)
        if (source === 'manual') this.notifyManualRebuildCompleted()
        return stats
      })
      .catch((error) => {
        this.initializationFailed = true
        this.initializationError = error
        this.logError(`File indexing ${source} run failed`, error)
        this.emitIndexingProgress('idle', 0, 0)
        this.notifyIndexingFailure(error)
        if (source === 'manual') this.manualRebuildPendingNotification = false
        if (options?.throwOnFailure) throw error
        return { ...createFileIndexSyncStats(), errors: 1 }
      })
      .finally(() => {
        if (this.isInitializing === run) this.isInitializing = null
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
    void query
    return null
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
      const rows = await dbUtils
        .getDb()
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
      'onRecordBatch' | 'onDelta' | 'throwOnFailure' | 'signal' | 'mutationLeaseId'
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
    await this.startIndexing('auto', {
      throwOnFailure: options?.throwOnFailure,
      signal: options?.signal ?? request.signal,
      mutationLeaseId: options?.mutationLeaseId ?? request.mutationLeaseId,
      onRecordBatch: async (batch) => {
        if (options?.onRecordBatch) {
          await options.onRecordBatch(batch)
        } else {
          batches.push(batch)
        }
      },
      onDelta: options?.onDelta
    })
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
    try {
      await this.waitForSearchIndexDrain(reason, mutationLeaseId)
    } catch (error) {
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
      for (const [fileId, result] of this.pendingIndexWorkerResults) {
        if (mutationLeaseId === undefined || result.mutationLeaseId === mutationLeaseId) {
          this.pendingIndexWorkerResults.delete(fileId)
        }
      }
      for (const [fileId, result] of this.inflightIndexWorkerResults) {
        if (mutationLeaseId === undefined || result.mutationLeaseId === mutationLeaseId) {
          this.inflightIndexWorkerResults.delete(fileId)
        }
      }
      await this.resetIndexedSourceRuntimeState({
        sourceId: this.id,
        reason: IndexedSourceResetReasons.HealthRepair,
        clearSearchIndex: false,
        clearScanProgress: true
      }).catch((resetError) => {
        this.logWarn('Failed to clear scan progress after enrichment drain failure', resetError)
      })
      throw error
    }
  }

  public async reconcileIndexedSource(
    request: IndexedSourceReconcileRequest
  ): Promise<IndexedSourceReconcileResult> {
    if (this.shuttingDown) throw new Error('FILE_PROVIDER_SHUTTING_DOWN')
    const startedAt = Date.now()
    await this.ensureFileSystemWatchers()
    const deltas: IndexedSourceDelta[] = []
    const stats = await this.startIndexing('auto', {
      signal: request.signal,
      throwOnFailure: true,
      mutationLeaseId: request.mutationLeaseId,
      onRecordBatch: request.onRecordBatch,
      onDelta: async (delta) => {
        if (request.onDelta) await request.onDelta(delta)
        else deltas.push(delta)
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
    if (this.shuttingDown) return []
    if (!this.isWithinWatchRoots(event.path)) return []

    if (event.action === 'delete') {
      const deleted = await this.handleIncrementalDeletes([event.path], false)
      if (deleted.deletedPaths.length === 0) return []
      return [
        this.watchRuntimeEmitter.buildDeleteDelta(event.path, {
          reason: 'file-provider-watch-delete'
        })
      ]
    }

    await this.handleIncrementalAddsOrChanges(
      [[event.path, { action: event.action, rawPath: event.path }]],
      { dispatchSideEffects: false }
    )
    const record = await this.buildFileRecord(event.path)
    return record
      ? [
          this.watchRuntimeEmitter.buildDelta(record, {
            action: event.action,
            reason: 'file-provider-watch-event'
          })
        ]
      : []
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

    this.dbUtils = createDbUtils(context.databaseManager.getDb())
    this.searchIndex = context.searchIndex
    this.touchApp = context.touchApp

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
    if (this.shuttingDown) return
    await this.watchService.ensureFileSystemWatchers({
      subscribeToFileSystemEvents: () => undefined
    })
    if (this.shuttingDown) return
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

    this.pushRuntimeWriteEvidence(evidence)

    return evidence
  }

  private pushRuntimeWriteEvidence(evidence: IndexedSourceEvidence[]): void {
    const snapshots: Array<{
      snapshot: FileProviderRuntimeWriteSnapshot | null
      id: string
      label: string
    }> = [
      {
        snapshot: this.incrementalPersistSnapshotService.getSnapshot(),
        id: `${this.id}:incremental-persist`,
        label: 'File incremental DB persist'
      },
      {
        snapshot: this.ftsWriteSnapshotService.getSnapshot(),
        id: `${this.id}:fts-write`,
        label: 'File FTS write'
      },
      {
        snapshot: this.ftsDeleteSnapshotService.getSnapshot(),
        id: `${this.id}:fts-delete`,
        label: 'File FTS delete'
      }
    ]

    for (const item of snapshots) {
      if (!item.snapshot) continue
      evidence.push(
        indexFlushEvidenceService.build({
          id: item.id,
          label: item.label,
          snapshot: item.snapshot
        })
      )
    }
  }

  private recordRuntimeWriteSnapshot(
    service: IndexedWriteFlushSnapshotService<FileProviderRuntimeWriteSnapshot>,
    input: {
      entries: number
      reason: string
      metadata?: Record<string, unknown>
      durationMs?: number
    }
  ): void {
    service.record(
      buildIndexedWriteFlushResultSnapshot<FileProviderRuntimeWriteSnapshot>({
        status: 'flushed',
        entries: input.entries,
        pending: 0,
        inflight: 0,
        reason: input.reason,
        metadata: input.metadata,
        durationMs: input.durationMs
      })
    )
  }

  private recordRuntimeWriteFailureSnapshot(
    service: IndexedWriteFlushSnapshotService<FileProviderRuntimeWriteSnapshot>,
    input: {
      error: unknown
      reason: string
      entries?: number
      metadata?: Record<string, unknown>
    }
  ): void {
    service.record(
      buildIndexedWriteFlushFailureSnapshot<FileProviderRuntimeWriteSnapshot>({
        error: input.error,
        pendingSize: 0,
        inflightSize: 0,
        flushResult: {
          status: 'failed',
          entries: input.entries ?? 0,
          pending: 0,
          inflight: 0,
          reason: input.reason,
          metadata: input.metadata
        }
      })
    )
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
          return { success: false, error: resetResult.error, battery: batteryStatus }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logWarn('Manual index rebuild reset failed', error)
        return { success: false, error: message, battery: batteryStatus }
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

  private async *scanDirectoryBatchesWithWorker(
    dirPath: string,
    excludePathsSet?: Set<string>,
    signal?: AbortSignal
  ): AsyncIterable<ScannedFileInfo[]> {
    await appTaskGate.waitForIdle()
    let yielded = false
    try {
      for await (const batch of this.fileScanWorker.scanBatches(
        [dirPath],
        excludePathsSet,
        500,
        signal
      )) {
        yielded = true
        yield batch
      }
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error
      if (yielded) throw error
      this.logWarn('File scan worker failed before its first batch; using direct scan', error, {
        path: dirPath
      })
      yield* this.scanDirectoryBatchesDirectStream(dirPath, excludePathsSet, signal)
    }
  }

  private async *scanDirectoryBatchesDirectStream(
    dirPath: string,
    excludePathsSet?: Set<string>,
    signal?: AbortSignal
  ): AsyncIterable<ScannedFileInfo[]> {
    const controller = new AbortController()
    const abort = (): void => controller.abort(signal?.reason)
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    const queued: ScannedFileInfo[][] = []
    const producerWaiters = new Set<() => void>()
    let consumerWake: (() => void) | null = null
    let producerDone = false
    let producerError: unknown = null
    const wakeAll = () => {
      for (const wake of producerWaiters) wake()
      producerWaiters.clear()
      consumerWake?.()
    }
    const producer = scanDirectoryBatchesDirect(
      dirPath,
      async (batch) => {
        while (queued.length >= 2) {
          controller.signal.throwIfAborted()
          await new Promise<void>((resolve) => producerWaiters.add(resolve))
        }
        controller.signal.throwIfAborted()
        queued.push(batch)
        consumerWake?.()
      },
      excludePathsSet,
      undefined,
      controller.signal,
      500
    )
      .catch((error) => {
        producerError = error
      })
      .finally(() => {
        producerDone = true
        wakeAll()
      })

    try {
      while (true) {
        const batch = queued.shift()
        if (batch) {
          for (const wake of producerWaiters) wake()
          producerWaiters.clear()
          yield batch
          continue
        }
        if (producerDone) {
          if (producerError) throw producerError
          return
        }
        await new Promise<void>((resolve) => {
          consumerWake = resolve
        })
        consumerWake = null
      }
    } finally {
      controller.abort(new Error('FILE_SCAN_STREAM_CONSUMER_CLOSED'))
      wakeAll()
      signal?.removeEventListener('abort', abort)
      await producer
    }
  }

  private async prepareReconciliationSeenPaths(options?: FileIndexRunOptions): Promise<void> {
    options?.signal?.throwIfAborted()
    if (!this.dbUtils) throw new Error('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
    const db = this.dbUtils.getDb()
    await this.withDbWrite('file-reconciliation.seen.prepare', async () => {
      options?.signal?.throwIfAborted()
      await db.run(sql`DROP TABLE IF EXISTS temp.file_reconciliation_seen_paths`)
      await db.run(sql`
        CREATE TEMP TABLE file_reconciliation_seen_paths (
          path TEXT PRIMARY KEY NOT NULL
        ) WITHOUT ROWID
      `)
    })
  }

  private async recordReconciliationSeenPaths(
    paths: string[],
    options?: FileIndexRunOptions
  ): Promise<void> {
    if (paths.length === 0) return
    options?.signal?.throwIfAborted()
    if (!this.dbUtils) throw new Error('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
    const db = this.dbUtils.getDb()
    await this.withDbWrite('file-reconciliation.seen.record', async () => {
      options?.signal?.throwIfAborted()
      await db.run(sql`
        INSERT OR IGNORE INTO file_reconciliation_seen_paths (path)
        VALUES ${sql.join(
          paths.map((filePath) => sql`(${filePath})`),
          sql`, `
        )}
      `)
    })
  }

  private async getReconciliationDbFilesByPaths(
    paths: string[],
    options?: FileIndexRunOptions
  ): Promise<FileProviderReconciliationDbRecord[]> {
    if (paths.length === 0) return []
    options?.signal?.throwIfAborted()
    if (!this.dbUtils) throw new Error('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
    return await this.dbUtils
      .getDb()
      .select({ id: filesSchema.id, path: filesSchema.path, mtime: filesSchema.mtime })
      .from(filesSchema)
      .where(and(eq(filesSchema.type, 'file'), inArray(filesSchema.path, paths)))
  }

  private async getMissingReconciliationDbFiles(
    rootPath: string,
    afterId: number,
    limit: number,
    options?: FileIndexRunOptions
  ): Promise<FileProviderReconciliationDbRecord[]> {
    options?.signal?.throwIfAborted()
    if (!this.dbUtils) throw new Error('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
    const queryRoot = path.normalize(rootPath)
    const descendantPrefix = queryRoot.endsWith(path.sep) ? queryRoot : `${queryRoot}${path.sep}`
    const escapedPrefix = descendantPrefix
      .replace(/!/g, '!!')
      .replace(/%/g, '!%')
      .replace(/_/g, '!_')
    return await this.dbUtils.getDb().all<FileProviderReconciliationDbRecord>(sql`
      SELECT f.id, f.path, f.mtime
      FROM files AS f
      WHERE f.type = 'file'
        AND (f.path = ${queryRoot} OR f.path LIKE ${`${escapedPrefix}%`} ESCAPE '!')
        AND f.id > ${afterId}
        AND NOT EXISTS (
          SELECT 1
          FROM file_reconciliation_seen_paths AS seen
          WHERE seen.path = f.path
        )
      ORDER BY f.id
      LIMIT ${limit}
    `)
  }

  private async clearReconciliationSeenPaths(_options?: FileIndexRunOptions): Promise<void> {
    if (!this.dbUtils) return
    const db = this.dbUtils.getDb()
    await this.withDbWrite('file-reconciliation.seen.clear', async () => {
      await db.run(sql`DROP TABLE IF EXISTS temp.file_reconciliation_seen_paths`)
    })
  }

  private scheduleIndexing(
    files: (typeof filesSchema.$inferSelect)[],
    reason: string,
    mutationLeaseId?: string
  ): void {
    if (!this.searchIndex) return
    if (this.shuttingDown && !this.isInitializing && !mutationLeaseId) return
    this.indexSchedulerService.schedule(files, reason, mutationLeaseId)
  }

  private async getOpenerForExtension(rawExtension: string): Promise<ResolvedOpener | null> {
    return this.openerService.getOpenerForExtension(rawExtension)
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
    if (this.shuttingDown) return
    this.incrementalQueueService.enqueue(rawPath, action, options)
  }

  private async prepareIncrementalFlush(): Promise<boolean> {
    if (this.shuttingDown) return false
    if (this.isInitializing) {
      try {
        await this.isInitializing
      } catch (error) {
        this.logError('Initialization failed before processing increments.', error)
        return false
      }
    }
    if (this.shuttingDown) return false

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

  private async handleIncrementalDeletes(
    paths: string[],
    applyRuntime = true
  ): Promise<IndexedWriteDeleteExecutorResult<IndexedWriteDeleteRecord>> {
    if (!this.dbUtils) return { deleted: [], deletedIds: [], deletedPaths: [] }
    const result = await this.incrementalDeleteExecutor.execute(paths)
    if (applyRuntime && result.deletedPaths.length > 0) {
      const delegate = this.requireRuntimeMutationDelegate()
      await Promise.all(
        result.deletedPaths.map(
          async (filePath) =>
            await delegate.applyDelta({
              sourceId: this.id,
              action: 'delete',
              stableKey: filePath,
              path: filePath,
              reason: 'file-provider-incremental-delete'
            })
        )
      )
    }
    return result
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
        for (const chunk of chunkArray(idsToDelete, 50)) {
          await appTaskGate.waitForIdle()
          await dbWriteScheduler.waitForCapacity(4)
          await this.withDbWrite('file-index.reconcile.delete', async () => {
            await db.delete(filesSchema).where(inArray(filesSchema.id, chunk))
            await this.deleteEmbeddingsByFileIds(db, chunk)
          })
        }
      },
      logDebug: (message, meta) => this.logDebug(message, meta),
      successMessage: 'Reconciliation remove completed'
    }).executeExisting(records)
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
        const records = [...result.inserted, ...result.updated].map((record) =>
          this.mapFileToIndexedSourceRecord(record)
        )
        if (records.length > 0) {
          await this.requireRuntimeMutationDelegate().applyBatch({ sourceId: this.id, records })
        }
      }
      this.recordRuntimeWriteSnapshot(this.incrementalPersistSnapshotService, {
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
      this.recordRuntimeWriteFailureSnapshot(this.incrementalPersistSnapshotService, {
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

  private async persistIncrementalRecords(
    records: Array<typeof filesSchema.$inferInsert>
  ): Promise<Array<typeof filesSchema.$inferSelect>> {
    if (!this.dbUtils || records.length === 0) return []

    const acceptedRecords = records.filter(
      (record) =>
        fileFilterService.getManualIndexExclusionReason({
          path: record.path,
          name: record.name,
          extension: record.extension
        }) === null
    )
    if (acceptedRecords.length !== records.length) {
      this.logDebug('Filtered incremental index records at commit boundary', {
        requested: records.length,
        accepted: acceptedRecords.length,
        filtered: records.length - acceptedRecords.length
      })
    }
    if (acceptedRecords.length === 0) return []

    const db = this.dbUtils.getDb()
    return await this.withDbWrite('file-index.incremental.insert', () =>
      db
        .insert(filesSchema)
        .values(acceptedRecords)
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
      if (!stats.isFile()) return null

      const manualForce = options?.manualForce === true
      const name = path.basename(rawPath)
      const extension = path.extname(name).toLowerCase()
      const exclusionReason = manualForce
        ? fileFilterService.getManualIndexExclusionReason({
            path: rawPath,
            name,
            extension
          })
        : isIndexableFile(rawPath, extension, name)
          ? null
          : 'unsupported-extension'

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
        this.logError('Failed to read file metadata', error, { path: rawPath })
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

    const db = this.dbUtils.getDb()
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
    const cleanupResult = await this.cleanupDeleteService.execute(options)
    stats.deleted += cleanupResult.deletedCount
    options?.signal?.throwIfAborted()

    // --- 2. Determine Scan Strategy (FR-IX-3: Resumable Indexing) ---
    const { newPathsToScan, reconciliationPaths } = await this.scanStrategyService.resolve(
      this.watchPaths
    )
    options?.signal?.throwIfAborted()
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
    }

    this.emitIndexingProgress('completed', 1, 1)
    this.logInfo('Index process complete', {
      duration: formatDuration(performance.now() - initStart)
    })

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

  private async processFileExtensions(files: (typeof filesSchema.$inferSelect)[]): Promise<void> {
    if (!this.dbUtils) return
    if (files.length === 0) return

    const iconCache = this.enableFileIconExtraction
      ? await this.assetService.buildIconCache(files)
      : undefined

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
            const cached = iconCache?.get(fileId)
            if (this.assetService.needsIconExtraction(file, cached)) {
              void this.assetService.ensureIcon(fileId, file.path, file)
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
  private createFileSearchItem(
    file: typeof filesSchema.$inferSelect,
    extensions: Record<string, string>
  ): TuffItem {
    return mapFileToTuffItem(
      file,
      extensions,
      this.id,
      this.name,
      (indexedFile) => {
        if (typeof indexedFile.id === 'number') {
          void this.assetService
            .ensureIcon(indexedFile.id, indexedFile.path, indexedFile)
            .catch((error) => {
              this.logWarn('Failed to lazy load icon', error, { path: indexedFile.path })
            })
        }
      },
      (indexedFile) => {
        if (typeof indexedFile.id === 'number') {
          void this.assetService
            .ensureThumbnail(indexedFile.id, indexedFile.path, indexedFile, extensions)
            .catch((error) => {
              this.logWarn('Failed to lazy load thumbnail', error, { path: indexedFile.path })
            })
        }
      }
    )
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
    return this.workerStatusService.getSnapshot(async () => [
      await this.fileScanWorker.getStatus(),
      await this.fileIndexWorker.getStatus(),
      await this.reconcileWorker.getStatus(),
      ...(await Promise.all(this.assetService.getWorkerStatuses())),
      ...(this.filePersistencePort ? [await this.filePersistencePort.getStatus()] : [])
    ])
  }

  public isSearchIndexWorkerBusy(mutationLeaseId?: string): boolean {
    if (mutationLeaseId !== undefined) {
      if (this.indexSchedulerService.hasPendingWork(mutationLeaseId)) return true
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
    const startedAt = Date.now()
    const deadline = startedAt + FILE_INDEX_SEARCH_DRAIN_TIMEOUT_MS
    await this.indexSchedulerService.drain(Math.max(1, deadline - Date.now()), mutationLeaseId)

    while (true) {
      await this.indexRuntimeService.flush()
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
      timeoutMs: FILE_INDEX_SEARCH_DRAIN_TIMEOUT_MS,
      busy: this.isSearchIndexWorkerBusy(mutationLeaseId),
      mutationLeaseId
    })
    throw new Error(`file-index-search-drain-timeout:${reason}`)
  }

  /**
   * Deferred semantic recall entry point used by the search engine after first
   * results render. Delegates to the search-result service; returns brand-new
   * semantically-related items only (ids in `excludeIds` are filtered out), so
   * the caller can append them to the active session without duplicates.
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
