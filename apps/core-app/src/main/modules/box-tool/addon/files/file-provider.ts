import type {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  ITouchEvent,
  OpenerInfo,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type {
  FileParserEmbedding,
  FileParserProgress,
  FileParserResult
} from '@talex-touch/utils/electron/file-parsers'
import type { StreamContext } from '@talex-touch/utils/transport/main'
import type {
  FileIndexAddPathResult,
  FileIndexBatteryStatus,
  FileIndexProgress as FileIndexProgressPayload,
  FileIndexRebuildRequest,
  FileIndexRebuildResult
} from '@talex-touch/utils/transport/events/types'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Buffer } from 'node:buffer'
import type { FileChangedEvent, FileUnlinkedEvent } from '../../../../core/eventbus/touch-event'
import type { TouchApp } from '../../../../core/touch-app'
import type * as schema from '../../../../db/schema'
import type { SearchIndexItem, SearchIndexService } from '../../search-engine/search-index-service'
import type { ProviderContext } from '../../search-engine/types'
import type { FileTypeTag } from './constants'
import type { ScannedFileInfo } from './types'
import type { IndexWorkerFile, IndexWorkerFileResult } from './workers/file-index-worker-client'
import type { ReconcileDbFile, ReconcileDiskFile } from './workers/file-reconcile-worker-client'
import type { WorkerStatusSnapshot } from './workers/worker-status'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { promisify } from 'node:util'
import {
  StorageList,
  timingLogger,
  TuffInputType,
  TuffSearchResultBuilder
} from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { runAdaptiveTaskQueue } from '@talex-touch/utils/common/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { fileParserRegistry } from '@talex-touch/utils/electron/file-parsers'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { app, shell } from 'electron'
// extract-file-icon removed — sync native call blocks event loop; icon extraction is done via IconWorkerClient only
import plist from 'plist'
import emptyOpenerSvg from '../../../../../renderer/src/assets/svg/EmptyAppPlaceholder.svg?raw'
import { FileAddedEvent, TalexEvents, touchEventBus } from '../../../../core/eventbus/touch-event'
import { dbWriteScheduler } from '../../../../db/db-write-scheduler'
import {
  embeddings as embeddingsSchema,
  fileExtensions,
  fileIndexProgress,
  files as filesSchema,
  scanProgress
} from '../../../../db/schema'
import { withSqliteRetry } from '../../../../db/sqlite-retry'
import { createDbUtils } from '../../../../db/utils'
import { appTaskGate } from '../../../../service/app-task-gate'
import {
  AppUsageActivityTracker,
  BackgroundTaskService
} from '../../../../service/background-task-service'
import { deviceIdleService } from '../../../../service/device-idle-service'
import { createFailedFilesCleanupTask } from '../../../../service/failed-files-cleanup-task'
import { FILE_TIMING_BASE_OPTIONS } from '../../../../utils/file-indexing-utils'
import { formatDuration } from '../../../../utils/logger'
import { enterPerfContext } from '../../../../utils/perf-context'
import { getMainConfig, saveMainConfig } from '../../../storage'
import FileSystemWatcher from '../../file-system-watcher'
import { isSearchRecentlyActive } from '../../search-engine/search-activity'
import { searchLogger } from '../../search-engine/search-logger'
import {
  BLACKLISTED_EXTENSIONS,
  CONTENT_INDEXABLE_EXTENSIONS,
  getContentSizeLimitMB,
  getTypeTagsForExtension,
  KEYWORD_MAP,
  WHITELISTED_EXTENSIONS
} from './constants'
import { isIndexableFile, mapFileToTuffItem, scanDirectory } from './utils'
import { THUMBNAIL_EXTENSIONS, isThumbnailCandidate } from './thumbnail-config'
import { FileIndexWorkerClient } from './workers/file-index-worker-client'
import { FileReconcileWorkerClient } from './workers/file-reconcile-worker-client'
import { FileScanWorkerClient } from './workers/file-scan-worker-client'
import { EmbeddingService } from './embedding-service'
import { IconWorkerClient } from './workers/icon-worker-client'
import { ThumbnailWorkerClient } from './workers/thumbnail-worker-client'
import { AdaptiveBatchScheduler } from '../../search-engine/adaptive-batch-scheduler'
import {
  SearchIndexWorkerClient,
  type PersistEntry
} from '../../search-engine/workers/search-index-worker-client'
import {
  getWatchDepthForPath as resolveWatchDepthForPath,
  normalizeWatchPath
} from './services/file-provider-path-service'
import {
  buildFtsQuery as buildFileProviderFtsQuery,
  buildSearchIndexItem as buildFileProviderSearchIndexItem,
  resolveExtensionsForTypeFilters as resolveFileProviderExtensionsForTypeFilters,
  resolveTypeTag as resolveFileProviderTypeTag
} from './services/file-provider-search-service'

const MAX_CONTENT_LENGTH = 200_000
const ICON_META_EXTENSION_KEY = 'iconMeta'
const fileProviderLog = getLogger('file-provider')
const SEARCH_ACTIVE_WINDOW_MS = 2000
const SEMANTIC_TRIGGER_MIN_QUERY_LENGTH = 3
const SEMANTIC_TRIGGER_MAX_CANDIDATES = 20
const SEMANTIC_SEARCH_TIMEOUT_MS = 120
const BASE64_MARKER = 'base64,'
const BASE64_PAYLOAD_PATTERN = /^[A-Za-z0-9+/=]+$/

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

type FileIndexStatus = (typeof fileIndexProgress.$inferSelect)['status']
type IncrementalUpdateAction = 'add' | 'change' | 'delete'

interface IncrementalUpdatePayload {
  action: IncrementalUpdateAction
  rawPath: string
  manual?: boolean
}

interface IconCacheMeta {
  mtime: number | null
  size: number | null
}

interface IconCacheEntry {
  icon?: string | null
  meta?: IconCacheMeta
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

type EmbeddingDbExecutor = Pick<LibSQLDatabase<typeof schema>, 'delete' | 'insert'>

export interface FileIndexSettings {
  autoScanEnabled: boolean
  autoScanIntervalMs: number
  autoScanIdleThresholdMs: number
  autoScanCheckIntervalMs: number
  extraPaths: string[]
}

const execFileAsync = promisify(execFile)
const FILE_PROVIDER_PROGRESS_TASK_ID = 'file-provider.progress-cleanup'
const FILE_PROVIDER_PROGRESS_MIN_EMIT_INTERVAL_MS = 160
const FILE_PROVIDER_PROGRESS_MAX_SILENCE_MS = 1000
const FILE_PROVIDER_PROGRESS_CURRENT_STEP = 25
const FILE_INDEX_AUTO_TASK_ID = 'file-index.auto-scan'
const pollingService = PollingService.getInstance()

const DEFAULT_FILE_INDEX_SETTINGS: FileIndexSettings = {
  autoScanEnabled: true,
  autoScanIntervalMs: 24 * 60 * 60 * 1000,
  autoScanIdleThresholdMs: 60 * 60 * 1000,
  autoScanCheckIntervalMs: 5 * 60 * 1000,
  extraPaths: []
}

const LAUNCH_SERVICES_PLIST_PATH = path.join(
  os.homedir(),
  'Library',
  'Preferences',
  'com.apple.LaunchServices',
  'com.apple.launchservices.secure.plist'
)

interface ResolvedOpener {
  bundleId: string
  name: string
  logo: string
  path?: string
  lastResolvedAt: string
}

type LaunchServicesRoleKey = 'LSHandlerRoleAll' | 'LSHandlerRoleViewer' | 'LSHandlerRoleEditor'

type LaunchServicesHandler = {
  LSHandlerContentTag?: string
  LSHandlerContentTagClass?: string
  LSHandlerContentType?: string
  LSHandlerRoleAll?: string
  LSHandlerRoleViewer?: string
  LSHandlerRoleEditor?: string
  LSHandlerPreferredVersions?: Partial<Record<LaunchServicesRoleKey, string>>
}

const openerResolveEvent = defineRawEvent<{ extension: string }, ResolvedOpener | null>(
  'openers:resolve'
)
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

class FileProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'file-provider'
  readonly name = 'File Provider'
  readonly type = 'file' as const
  readonly supportedInputTypes = [TuffInputType.Text, TuffInputType.Files]
  readonly priority = 'deferred' as const
  readonly expectedDuration = 500

  private dbUtils: ReturnType<typeof createDbUtils> | null = null
  private isInitializing: Promise<void> | null = null
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
  private fsEventsSubscribed = false
  private watchPathsRegistered = false
  private incrementalTaskChain: Promise<void> = Promise.resolve()
  private readonly pendingIncrementalPaths: Map<string, IncrementalUpdatePayload> = new Map()

  private readonly isCaseInsensitiveFs = process.platform !== 'linux'
  private readonly timestampToleranceMs = 1_000
  private readonly handleFsAddedOrChanged = (event: ITouchEvent) => {
    const fileEvent = event as FileAddedEvent | FileChangedEvent
    if (!fileEvent?.filePath) return
    this.enqueueIncrementalUpdate(
      fileEvent.filePath,
      fileEvent instanceof FileAddedEvent ? 'add' : 'change'
    )
  }

  private readonly handleFsUnlinked = (event: ITouchEvent) => {
    const fileEvent = event as FileUnlinkedEvent
    if (!fileEvent?.filePath) return
    this.enqueueIncrementalUpdate(fileEvent.filePath, 'delete')
  }

  private openersChannelRegistered = false
  private readonly progressStreamContexts = new Set<StreamContext<FileIndexProgressPayload>>()
  private lastProgressStreamPayload: FileIndexProgressPayload | null = null
  private lastProgressStreamEmitAt = 0
  private pendingProgressStreamPayload: FileIndexProgressPayload | null = null
  private progressStreamFlushTimer: NodeJS.Timeout | null = null
  private launchServicesLoadPromise: Promise<LaunchServicesHandler[]> | null = null
  private readonly openerNegativeCache = new Map<string, number>()
  private readonly openerResolveConcurrency = 2
  private openerResolveInFlight = 0
  private openerResolveWaiters: Array<() => void> = []
  private readonly utiCache = new Map<string, string | null>()
  private readonly bundleIdCache = new Map<string, string | null>()
  private readonly iconExtractionPending = new Map<string, Promise<Buffer | null>>()
  private readonly fileScanWorker = new FileScanWorkerClient()
  private readonly reconcileWorker = new FileReconcileWorkerClient()
  private readonly fileIndexWorker = new FileIndexWorkerClient((payload) =>
    this.handleIndexWorkerFile(payload)
  )

  private readonly iconWorker = new IconWorkerClient()
  private readonly searchIndexWorker = new SearchIndexWorkerClient()
  private readonly openerCache = new Map<string, ResolvedOpener>()
  private readonly openerPromises = new Map<string, Promise<ResolvedOpener | null>>()
  private readonly openerIconJobs = new Map<string, Promise<void>>()
  private launchServicesHandlers: LaunchServicesHandler[] | null = null
  private launchServicesMTime?: number
  private readonly failedContentCache = new Map<
    number,
    { status: FileIndexStatus; updatedAt: number | null; lastError: string | null }
  >()

  private readonly pendingIndexWorkerResults = new Map<number, IndexWorkerFileResult>()
  private indexWorkerFlushTimer: NodeJS.Timeout | null = null
  /** Guard to prevent overlapping flushIndexWorkerResults calls */
  private indexWorkerFlushing = false

  private readonly pendingContentProgress = new Map<
    number,
    { progress: number; processedBytes: number; totalBytes: number; updatedAt: Date }
  >()

  private contentProgressFlushTimer: NodeJS.Timeout | null = null

  private backgroundTaskService: BackgroundTaskService | null = null
  private activityTracker: AppUsageActivityTracker | null = null
  private touchApp: TouchApp | null = null
  private fileIndexSettings: FileIndexSettings = { ...DEFAULT_FILE_INDEX_SETTINGS }
  private autoIndexTaskRegistered = false
  private indexingProgress = {
    current: 0,
    total: 0,
    stage: 'idle' as 'idle' | 'cleanup' | 'scanning' | 'indexing' | 'reconciliation' | 'completed'
  }

  private async withDbWrite<T>(label: string, operation: () => Promise<T>): Promise<T> {
    return dbWriteScheduler.schedule(label, () => withSqliteRetry(operation, { label }))
  }

  private indexingStartTime: number | null = null
  private indexingStats = {
    processedItems: 0,
    startTime: 0,
    lastUpdateTime: 0,
    averageItemsPerSecond: 0
  }

  private readonly enableFileIconExtraction =
    (process.env.TALEX_FILE_PROVIDER_EXTRACT_ICONS ?? 'true').toLowerCase() !== 'false'

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
    this.watchPaths = [...this.baseWatchPaths]
    this.normalizedWatchPaths = this.watchPaths.map((p) => this.normalizePath(p))
    this.logDebug('Watching paths', {
      count: this.watchPaths.length
    })

    void this.indexFilesForSearch
    void this.extractContentForFiles
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

  private recordContentFailure(
    fileId: number,
    lastError: string | null,
    updatedAt?: number | null
  ): void {
    let timestamp: number | null
    if (typeof updatedAt === 'number' && Number.isFinite(updatedAt)) {
      timestamp = updatedAt
    } else if (updatedAt === null) {
      timestamp = null
    } else {
      timestamp = Date.now()
    }
    this.failedContentCache.set(fileId, {
      status: 'failed',
      updatedAt: timestamp,
      lastError
    })
  }

  private clearContentFailure(fileId: number): void {
    this.failedContentCache.delete(fileId)
  }

  private normalizeFileIndexSettings(raw?: Partial<FileIndexSettings> | null): FileIndexSettings {
    const data = raw && typeof raw === 'object' ? raw : {}
    const clampMs = (value: unknown, fallback: number) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return fallback
      }
      return value
    }

    const rawExtraPaths = Array.isArray(data.extraPaths)
      ? data.extraPaths.filter((value): value is string => typeof value === 'string')
      : []
    const normalizedExtraPaths: string[] = []
    const extraPathSet = new Set<string>()

    for (const rawPath of rawExtraPaths) {
      const trimmed = rawPath.trim()
      if (!trimmed) continue
      const resolved = path.resolve(trimmed)
      const normalized = this.normalizePath(resolved)
      if (extraPathSet.has(normalized)) {
        continue
      }
      extraPathSet.add(normalized)
      normalizedExtraPaths.push(resolved)
    }

    return {
      autoScanEnabled:
        typeof data.autoScanEnabled === 'boolean'
          ? data.autoScanEnabled
          : DEFAULT_FILE_INDEX_SETTINGS.autoScanEnabled,
      autoScanIntervalMs: clampMs(
        data.autoScanIntervalMs,
        DEFAULT_FILE_INDEX_SETTINGS.autoScanIntervalMs
      ),
      autoScanIdleThresholdMs: clampMs(
        data.autoScanIdleThresholdMs,
        DEFAULT_FILE_INDEX_SETTINGS.autoScanIdleThresholdMs
      ),
      autoScanCheckIntervalMs: clampMs(
        data.autoScanCheckIntervalMs,
        DEFAULT_FILE_INDEX_SETTINGS.autoScanCheckIntervalMs
      ),
      extraPaths: normalizedExtraPaths
    }
  }

  private applyWatchPaths(extraPaths: string[]): void {
    const next: string[] = []
    const seen = new Set<string>()

    for (const candidate of [...this.baseWatchPaths, ...extraPaths]) {
      if (!candidate) continue
      const normalized = this.normalizePath(candidate)
      if (seen.has(normalized)) continue
      seen.add(normalized)
      next.push(candidate)
    }

    this.watchPaths = next
    this.normalizedWatchPaths = next.map((p) => this.normalizePath(p))
  }

  private loadFileIndexSettings(): void {
    try {
      const raw = getMainConfig(StorageList.FILE_INDEX_SETTINGS) as
        | Partial<FileIndexSettings>
        | undefined
      this.fileIndexSettings = this.normalizeFileIndexSettings(raw)
      this.applyWatchPaths(this.fileIndexSettings.extraPaths)

      if (!raw || Object.keys(raw).length === 0) {
        saveMainConfig(StorageList.FILE_INDEX_SETTINGS, this.fileIndexSettings)
      }
    } catch (error) {
      this.fileIndexSettings = { ...DEFAULT_FILE_INDEX_SETTINGS }
      this.applyWatchPaths(this.fileIndexSettings.extraPaths)
      this.logWarn('Failed to load file index settings, using defaults', error)
    }
  }

  private initializeBackgroundTaskService(): void {
    if (!this.dbUtils) {
      this.logWarn('Database utils not available, skipping background task service initialization')
      return
    }

    this.loadFileIndexSettings()
    this.activityTracker = AppUsageActivityTracker.getInstance()

    this.backgroundTaskService = BackgroundTaskService.getInstance(this.activityTracker, {
      idleThresholdMs: this.fileIndexSettings.autoScanIdleThresholdMs,
      checkIntervalMs: this.fileIndexSettings.autoScanCheckIntervalMs,
      maxConcurrentTasks: 1,
      taskTimeoutMs: 30 * 60 * 1000
    })

    const cleanupTask = createFailedFilesCleanupTask(this.dbUtils.getDb(), {
      maxRetryAge: 24 * 60 * 60 * 1000,
      batchSize: 100,
      maxRetries: 3
    })

    this.backgroundTaskService.registerTask(cleanupTask)

    if (!this.autoIndexTaskRegistered) {
      this.backgroundTaskService.registerTask({
        id: FILE_INDEX_AUTO_TASK_ID,
        name: 'File Index Auto Scan',
        priority: 'low',
        canInterrupt: true,
        estimatedDuration: 15 * 60 * 1000,
        execute: async () => {
          await this.runAutoIndexing()
        }
      })
      this.autoIndexTaskRegistered = true
    }

    this.backgroundTaskService.on('taskCompleted', (data) => {
      this.logDebug(`Background task completed: ${data.task.name}`, {
        duration: formatDuration(data.duration)
      })
    })

    this.backgroundTaskService.on('taskFailed', (data) => {
      this.logError(`Background task failed: ${data.task.name}`, data.error)
    })

    this.backgroundTaskService.start()

    this.logDebug('Background task service initialized')
  }

  /**
   * Record user activity for background task scheduling
   */
  recordUserActivity(): void {
    if (this.backgroundTaskService) {
      this.backgroundTaskService.recordActivity()
    }
  }

  private async getScanEligibility(): Promise<{
    newPaths: string[]
    stalePaths: string[]
    lastScannedAt: number | null
  }> {
    if (!this.dbUtils) {
      return { newPaths: [], stalePaths: [], lastScannedAt: null }
    }

    const db = this.dbUtils.getDb()
    const completedScans = await db.select().from(scanProgress)
    const completedMap = new Map<string, number>()
    let lastScannedAt: number | null = null

    for (const scan of completedScans) {
      const timestamp = this.toTimestamp(scan.lastScanned)
      if (timestamp) {
        completedMap.set(scan.path, timestamp)
        if (!lastScannedAt || timestamp > lastScannedAt) {
          lastScannedAt = timestamp
        }
      }
    }

    const newPaths = this.watchPaths.filter((path) => !completedMap.has(path))
    const intervalMs = this.fileIndexSettings.autoScanIntervalMs
    const now = Date.now()
    const stalePaths =
      intervalMs <= 0
        ? Array.from(completedMap.keys()).filter((path) => this.watchPaths.includes(path))
        : this.watchPaths.filter((path) => {
            const last = completedMap.get(path)
            if (!last) return false
            return now - last >= intervalMs
          })

    return { newPaths, stalePaths, lastScannedAt }
  }

  private async shouldRunAutoIndexing(): Promise<{
    allowed: boolean
    reason?: string
    battery?: FileIndexBatteryStatus | null
  }> {
    if (!this.fileIndexSettings.autoScanEnabled) {
      return { allowed: false, reason: 'disabled' }
    }

    if (this.isInitializing) {
      return { allowed: false, reason: 'initializing' }
    }

    if (!this.dbUtils || !this.initializationContext) {
      return { allowed: false, reason: 'missing-context' }
    }

    if (this.watchPaths.length === 0) {
      return { allowed: false, reason: 'no-paths' }
    }

    if (appTaskGate.isActive()) {
      return { allowed: false, reason: 'app-busy' }
    }

    if (isSearchRecentlyActive(SEARCH_ACTIVE_WINDOW_MS)) {
      return { allowed: false, reason: 'search-active' }
    }

    const eligibility = await this.getScanEligibility()
    if (eligibility.newPaths.length === 0 && eligibility.stalePaths.length === 0) {
      return { allowed: false, reason: 'interval' }
    }

    const decision = await deviceIdleService.canRun({
      idleThresholdMs: this.fileIndexSettings.autoScanIdleThresholdMs
    })

    const battery = decision.snapshot.battery
      ? { level: decision.snapshot.battery.level, charging: decision.snapshot.battery.charging }
      : null

    if (!decision.allowed) {
      return { allowed: false, reason: decision.reason, battery }
    }

    return { allowed: true, battery }
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

  private async startIndexing(source: 'auto' | 'manual'): Promise<void> {
    if (this.isInitializing) {
      throw new Error('Indexing is already in progress')
    }

    this.initializationFailed = false
    this.initializationError = null

    const run = this._initialize()
      .then(() => {
        this.initializationFailed = false
        this.logInfo(`File indexing ${source} run completed successfully`)
      })
      .catch((error) => {
        this.initializationFailed = true
        this.initializationError = error
        this.logError(`File indexing ${source} run failed`, error)
        this.emitIndexingProgress('idle', 0, 0)
        this.notifyIndexingFailure(error)
      })
      .finally(() => {
        if (this.isInitializing === run) {
          this.isInitializing = null
        }
      })

    this.isInitializing = run
    return run
  }

  private async shouldSkipContentDueToFailure(
    file: typeof filesSchema.$inferSelect
  ): Promise<boolean> {
    if (!this.dbUtils || !file.id) return false

    const fileId = file.id
    const fileModifiedAt = this.toTimestamp(file.mtime)
    const cachedFailure = this.failedContentCache.get(fileId)

    if (cachedFailure) {
      if (cachedFailure.updatedAt && fileModifiedAt && fileModifiedAt > cachedFailure.updatedAt) {
        this.failedContentCache.delete(fileId)
        this.logDebug('Retrying content parse after file modification', {
          path: file.path
        })
      } else {
        return true
      }
    }

    try {
      const [progress] = await this.dbUtils.getFileIndexProgressByFileIds([fileId])
      if (!progress || progress.status !== 'failed') {
        return false
      }

      const progressUpdatedAt = this.toTimestamp(progress.updatedAt)
      if (progressUpdatedAt && fileModifiedAt && fileModifiedAt > progressUpdatedAt) {
        this.logDebug('Retrying content parse after recorded failure', {
          path: file.path
        })
        return false
      }

      this.recordContentFailure(fileId, progress.lastError ?? null, progressUpdatedAt ?? null)
      this.logDebug('Skipping content parse for previously failed file', {
        path: file.path,
        lastError: progress.lastError ?? 'unknown'
      })
      return true
    } catch (error) {
      this.logWarn('Failed to load previous file index status; continuing parse', error, {
        fileId,
        path: file.path
      })
      return false
    }
  }

  // private createProgressLogger(_label: string, _total: number): ProgressLogger {
  //   return new ProgressLogger(_label, _total, (message) => this.logInfo(message))
  // }

  public getWatchedPaths(): string[] {
    return [...this.watchPaths]
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

  private timestampsEqual(
    a: Date | number | string | null | undefined,
    b: Date | number | string | null | undefined
  ): boolean {
    const left = this.toTimestamp(a)
    const right = this.toTimestamp(b)
    if (left === null || right === null) {
      return left === right
    }
    return Math.abs(left - right) <= this.timestampToleranceMs
  }

  // private hasDiskFileChanged(
  //   _diskFile: ScannedFileInfo,
  //   _dbFile: typeof filesSchema.$inferSelect
  // ): boolean {
  //   if (!this.timestampsEqual(_diskFile.mtime, _dbFile.mtime)) {
  //     return true
  //   }
  //   if (!this.timestampsEqual(_diskFile.ctime, _dbFile.ctime)) {
  //     return true
  //   }
  //   if ((_diskFile.size ?? 0) !== (_dbFile.size ?? 0)) {
  //     return true
  //   }
  //   if ((_diskFile.extension ?? '') !== (_dbFile.extension ?? '')) {
  //     return true
  //   }
  //   if ((_diskFile.name ?? '') !== (_dbFile.name ?? '')) {
  //     return true
  //   }
  //   return false
  // }

  private hasRecordChanged(
    incoming: typeof filesSchema.$inferInsert,
    existing: typeof filesSchema.$inferSelect
  ): boolean {
    if (!this.timestampsEqual(incoming.mtime, existing.mtime)) {
      return true
    }
    if (!this.timestampsEqual(incoming.ctime, existing.ctime)) {
      return true
    }
    if ((incoming.size ?? 0) !== (existing.size ?? 0)) {
      return true
    }
    if ((incoming.extension ?? '') !== (existing.extension ?? '')) {
      return true
    }
    if ((incoming.name ?? '') !== (existing.name ?? '')) {
      return true
    }
    return false
  }

  async onLoad(context: ProviderContext): Promise<void> {
    // 最先赋值 initializationContext，确保即使后续任何步骤失败，rebuildIndex 也能使用
    this.initializationContext = context

    const loadStart = performance.now()

    // Keep a reference to internal helpers (no-op) so TS doesn't treat them as unused.
    void this.computeReconciliationDiff([], [], [])
    void this.indexFilesForSearch([])
    void this.extractContentForFiles([])

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

    // Initialize the search index worker with the database path so that
    // all FTS5 + keyword_mappings write operations run off the main thread.
    void this.searchIndexWorker.init(this.databaseFilePath).catch((error) => {
      this.logError('SearchIndexWorkerClient init failed', error)
    })

    // 🔍 DEBUG: 确认 onLoad 被调用
    this.logDebug('[DEBUG] FileProvider.onLoad called', {
      watchPathsCount: this.watchPaths.length,
      watchPaths: JSON.stringify(this.watchPaths.slice(0, 3))
    })

    this.initializeBackgroundTaskService()

    // 尽早注册 channel，避免前端启动期请求出现 no-handler 警告
    this.registerOpenersChannel(context)
    this.registerIndexingChannels(context)

    // 索引任务由后台调度执行（空闲+电量策略）
    this.logDebug('onLoad: background index task registered, waiting for idle conditions')

    // 只等待文件系统监听器设置完成，不等待索引完成
    await this.ensureFileSystemWatchers()
    const loadDuration = performance.now() - loadStart
    this.logDebug('Provider onLoad completed (indexing continues in background)', {
      duration: formatDuration(loadDuration)
    })
  }

  private async ensureFileSystemWatchers(): Promise<void> {
    if (this.watchPathsRegistered) {
      if (!this.fsEventsSubscribed) {
        this.subscribeToFileSystemEvents()
      }
      return
    }

    if (this.watchPaths.length === 0) {
      this.logWarn('No watch paths resolved; skipping watcher registration.')
      return
    }

    this.logDebug('Registering watch paths', {
      count: this.watchPaths.length,
      sample: this.watchPaths.slice(0, 3).join(', ')
    })

    try {
      await Promise.all(
        this.watchPaths.map((watchPath) =>
          FileSystemWatcher.addPath(watchPath, this.getWatchDepthForPath(watchPath)).catch(
            (error) => {
              this.logError('Failed to watch path', error, {
                path: watchPath
              })
            }
          )
        )
      )
    } catch (error) {
      this.logError('Error while registering watch paths.', error)
    }

    this.watchPathsRegistered = true
    this.subscribeToFileSystemEvents()
  }

  private registerOpenersChannel(context: ProviderContext): void {
    if (this.openersChannelRegistered) {
      return
    }

    const channel = context.touchApp.channel as unknown
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    const transport = getTuffTransportMain(channel, keyManager)

    transport.on(openerResolveEvent, async (payload) => {
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
    })

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

    if (isIndexing && this.indexingStartTime && this.indexingProgress.total > 0) {
      const elapsed = now - this.indexingStartTime
      const progress = this.indexingProgress.current / this.indexingProgress.total

      if (progress > 0.01) {
        // Only estimate if we have at least 1% progress
        const estimatedTotalTime = elapsed / progress
        estimatedRemainingMs = Math.max(0, estimatedTotalTime - elapsed)
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
      progress: { ...this.indexingProgress },
      startTime: this.indexingStartTime,
      estimatedCompletion,
      estimatedRemainingMs,
      averageItemsPerSecond: this.indexingStats.averageItemsPerSecond
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

    // 清空 scan_progress 表，强制全量扫描
    if (this.dbUtils) {
      const db = this.dbUtils.getDb()
      await this.withDbWrite('file-index.scan-progress.clear', () => db.delete(scanProgress))
      this.logInfo('Cleared scan_progress table for full rescan')
    }

    await this.ensureFileSystemWatchers()
    void this.startIndexing('manual')

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
        console.log('[FileProvider] addWatchPath exists(root), enqueue incremental add', {
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

    const normalized = this.normalizePath(watchPath)
    if (this.normalizedWatchPaths.includes(normalized)) {
      if (isFileTarget) {
        console.log('[FileProvider] addWatchPath exists(normalized), enqueue incremental add', {
          path: resolved,
          watchPath
        })
        this.logInfo(
          'File index addPath hit existing normalized watch path; enqueue incremental add',
          {
            path: resolved,
            watchPath
          }
        )
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

    if (this.watchPathsRegistered) {
      try {
        await FileSystemWatcher.addPath(watchPath, this.getWatchDepthForPath(watchPath))
      } catch (error) {
        this.logWarn('Failed to register extra watch path', error, { path: watchPath })
      }
      if (!this.fsEventsSubscribed) {
        this.subscribeToFileSystemEvents()
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
      console.log('[FileProvider] addWatchPath added and enqueue incremental add', {
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
   * 注册索引管理相关的 IPC 通道
   */
  private registerIndexingChannels(_context: ProviderContext): void {
    // Legacy channel handlers migrated to transport (AppEvents.fileIndex).* in common channel module.
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

    if (this.shouldEmitProgressImmediately(previous, payload, now)) {
      this.flushProgressStreamPayload(payload, now)
      return
    }

    this.pendingProgressStreamPayload = payload
    this.scheduleProgressStreamFlush(now)
  }

  private shouldEmitProgressImmediately(
    previous: FileIndexProgressPayload | null,
    next: FileIndexProgressPayload,
    now: number
  ): boolean {
    if (!previous) {
      return true
    }

    if (next.stage !== previous.stage) {
      return true
    }

    if (next.stage === 'completed' || next.stage === 'idle') {
      return true
    }

    const elapsed = now - this.lastProgressStreamEmitAt
    if (elapsed >= FILE_PROVIDER_PROGRESS_MAX_SILENCE_MS) {
      return true
    }

    if (elapsed < FILE_PROVIDER_PROGRESS_MIN_EMIT_INTERVAL_MS) {
      return false
    }

    if (next.progress !== previous.progress) {
      return true
    }
    if (Math.abs(next.current - previous.current) >= FILE_PROVIDER_PROGRESS_CURRENT_STEP) {
      return true
    }
    if (next.total !== previous.total) {
      return true
    }
    return false
  }

  private scheduleProgressStreamFlush(now: number): void {
    if (this.progressStreamFlushTimer) {
      return
    }

    const elapsed = now - this.lastProgressStreamEmitAt
    const delayMs = Math.max(0, FILE_PROVIDER_PROGRESS_MIN_EMIT_INTERVAL_MS - elapsed)
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

  private async withOpenerResolveSlot<T>(task: () => Promise<T>): Promise<T> {
    if (this.openerResolveInFlight >= this.openerResolveConcurrency) {
      await new Promise<void>((resolve) => {
        this.openerResolveWaiters.push(resolve)
      })
    }

    this.openerResolveInFlight += 1
    try {
      return await task()
    } finally {
      this.openerResolveInFlight -= 1
      const next = this.openerResolveWaiters.shift()
      if (next) {
        next()
      }
    }
  }

  private isOpenerNegativeCached(extension: string): boolean {
    const expiresAt = this.openerNegativeCache.get(extension)
    if (!expiresAt) {
      return false
    }
    if (expiresAt <= Date.now()) {
      this.openerNegativeCache.delete(extension)
      return false
    }
    return true
  }

  private markOpenerNegativeCache(extension: string): void {
    const ttlMs = 10 * 60 * 1000
    this.openerNegativeCache.set(extension, Date.now() + ttlMs)
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

  private computeReconciliationDiff(
    diskFiles: ReconcileDiskFile[],
    dbFiles: ReconcileDbFile[],
    reconciliationPaths: string[]
  ): {
    filesToAdd: ReconcileDiskFile[]
    filesToUpdate: Array<ReconcileDiskFile & { id: number }>
    deletedIds: number[]
  } {
    const dbMap = new Map<string, ReconcileDbFile>()
    for (const dbFile of dbFiles) {
      dbMap.set(dbFile.path, dbFile)
    }

    const filesToAdd: ReconcileDiskFile[] = []
    const filesToUpdate: Array<ReconcileDiskFile & { id: number }> = []
    const seenDiskPaths = new Set<string>()

    for (const diskFile of diskFiles) {
      if (seenDiskPaths.has(diskFile.path)) {
        continue
      }
      seenDiskPaths.add(diskFile.path)

      const dbFile = dbMap.get(diskFile.path)
      if (!dbFile) {
        filesToAdd.push(diskFile)
      } else if (diskFile.mtime > dbFile.mtime) {
        filesToUpdate.push({ ...diskFile, id: dbFile.id })
      }
      dbMap.delete(diskFile.path)
    }

    const deletedIds: number[] = []
    if (reconciliationPaths.length > 0) {
      for (const [path, dbFile] of dbMap.entries()) {
        if (reconciliationPaths.some((prefix) => path.startsWith(prefix))) {
          deletedIds.push(dbFile.id)
        }
      }
    }

    return { filesToAdd, filesToUpdate, deletedIds }
  }

  private scheduleIndexing(files: (typeof filesSchema.$inferSelect)[], reason: string): void {
    if (!this.databaseFilePath || !this.searchIndex) {
      return
    }

    const payload: IndexWorkerFile[] = files
      .filter((file) => typeof file.id === 'number')
      .map((file) => ({
        id: file.id as number,
        path: file.path,
        name: file.name,
        displayName: file.displayName ?? null,
        extension: file.extension ?? null,
        size: typeof file.size === 'number' ? file.size : null,
        mtime: this.toTimestamp(file.mtime) ?? Date.now(),
        ctime: this.toTimestamp(file.ctime) ?? Date.now()
      }))

    if (payload.length === 0) {
      return
    }

    const chunkSize = 30
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize)
      void this.fileIndexWorker
        .indexFiles(this.databaseFilePath, this.id, this.type, chunk)
        .catch((error) => {
          this.logWarn('File index worker failed', error, {
            reason,
            size: chunk.length
          })
        })
    }
  }

  private handleIndexWorkerFile(payload: IndexWorkerFileResult): void {
    if (!payload || typeof payload.fileId !== 'number') {
      return
    }

    this.pendingIndexWorkerResults.set(payload.fileId, payload)

    if (!this.indexWorkerFlushTimer) {
      // Use a longer flush interval to accumulate more results per batch,
      // reducing the number of heavy indexItems calls on the main thread.
      const flushDelay = this.pendingIndexWorkerResults.size > 30 ? 500 : 250
      this.indexWorkerFlushTimer = setTimeout(() => {
        this.indexWorkerFlushTimer = null
        void this.flushIndexWorkerResults()
      }, flushDelay)
    }
  }

  private async flushIndexWorkerResults(): Promise<void> {
    if (!this.dbUtils || !this.searchIndex) {
      return
    }

    if (this.pendingIndexWorkerResults.size === 0) {
      return
    }

    // Prevent overlapping flushes: if a previous flush (including its
    // indexItems call with heavy FTS5 writes) is still running, defer.
    // This avoids multiple competing SQLite transactions that compound
    // event loop blocking.
    if (this.indexWorkerFlushing) {
      if (!this.indexWorkerFlushTimer) {
        this.indexWorkerFlushTimer = setTimeout(() => {
          this.indexWorkerFlushTimer = null
          void this.flushIndexWorkerResults()
        }, 300)
      }
      return
    }

    this.indexWorkerFlushing = true
    try {
      await this.doFlushIndexWorkerResults()
    } finally {
      this.indexWorkerFlushing = false
    }
  }

  private async doFlushIndexWorkerResults(): Promise<void> {
    if (!this.dbUtils || !this.searchIndex) return
    if (this.pendingIndexWorkerResults.size === 0) return

    // Adaptive flush batch size — AIMD scheduler adjusts based on transaction duration.
    const FLUSH_BATCH_SIZE = this.flushBatchScheduler.currentSize
    let entries: IndexWorkerFileResult[]
    if (this.pendingIndexWorkerResults.size <= FLUSH_BATCH_SIZE) {
      entries = Array.from(this.pendingIndexWorkerResults.values())
      this.pendingIndexWorkerResults.clear()
    } else {
      entries = []
      const keysToDelete: number[] = []
      for (const [key, value] of this.pendingIndexWorkerResults) {
        entries.push(value)
        keysToDelete.push(key)
        if (entries.length >= FLUSH_BATCH_SIZE) break
      }
      for (const key of keysToDelete) {
        this.pendingIndexWorkerResults.delete(key)
      }
      // Schedule another flush for remaining items
      if (this.pendingIndexWorkerResults.size > 0 && !this.indexWorkerFlushTimer) {
        this.indexWorkerFlushTimer = setTimeout(() => {
          this.indexWorkerFlushTimer = null
          void this.flushIndexWorkerResults()
        }, 400)
      }
    }

    const withContent = entries.filter(
      (e) => e.indexItem.content && e.indexItem.content.length > 0
    ).length
    if (withContent > 0) {
      this.logDebug(`Flushing ${entries.length} worker results (${withContent} with content)`)
    }

    // Build PersistEntry[] — all data needed for persist + FTS5 index in one
    // worker call.  This eliminates SQLITE_BUSY_SNAPSHOT errors by making the
    // worker the single DB writer for this hot path.
    const persistEntries: PersistEntry[] = entries.map((entry) => ({
      fileId: entry.fileId,
      fileUpdate: entry.fileUpdate
        ? {
            content: entry.fileUpdate.content,
            embeddingStatus: entry.fileUpdate.embeddingStatus,
            embeddings: entry.fileUpdate.embeddings?.map((emb) => ({
              vector: emb.vector,
              model: emb.model
            })),
            contentHash:
              entry.fileUpdate.contentHash ?? this.buildContentHash(entry.fileUpdate.content ?? '')
          }
        : null,
      progress: {
        status: entry.progress.status,
        progress: entry.progress.progress,
        processedBytes: entry.progress.processedBytes,
        totalBytes: entry.progress.totalBytes,
        lastError: entry.progress.lastError,
        startedAt: entry.progress.startedAt ?? null,
        updatedAt: entry.progress.updatedAt ?? new Date().toISOString()
      },
      indexItem: entry.indexItem
    }))

    // Single worker call: persist files/embeddings/progress + index into FTS5.
    // All DB writes happen in the worker thread — no main-thread SQLite contention.
    const flushStart = performance.now()
    await this.searchIndexWorker.persistAndIndex(persistEntries)
    this.flushBatchScheduler.recordDuration(performance.now() - flushStart)
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
    const normalized = normalizeOpenerExtension(rawExtension)
    if (!normalized) {
      return null
    }

    if (this.openerCache.has(normalized)) {
      return this.openerCache.get(normalized)!
    }

    const stored = this.getOpenerFromStorageByExtension(normalized)
    if (stored) {
      const opener: ResolvedOpener = {
        bundleId: stored.bundleId,
        name: stored.name,
        logo: this.resolveOpenerLogo(stored.logo),
        path: stored.path,
        lastResolvedAt: stored.lastResolvedAt ?? new Date().toISOString()
      }
      this.openerCache.set(normalized, opener)
      return opener
    }

    if (this.isOpenerNegativeCached(normalized)) {
      return null
    }

    let pending = this.openerPromises.get(normalized)
    if (!pending) {
      pending = this.withOpenerResolveSlot(async () => {
        try {
          const result = await this.resolveOpener(normalized)
          if (!result) {
            this.markOpenerNegativeCache(normalized)
          }
          return result
        } catch (error) {
          this.markOpenerNegativeCache(normalized)
          throw error
        }
      })
      this.openerPromises.set(normalized, pending)
    }

    let result: ResolvedOpener | null = null
    try {
      result = await pending
    } finally {
      this.openerPromises.delete(normalized)
    }

    if (result) {
      this.openerCache.set(normalized, result)
    }

    return result
  }

  private async resolveOpener(extension: string): Promise<ResolvedOpener | null> {
    if (process.platform !== 'darwin') {
      return null
    }

    const sanitized = sanitizeOpenerExtension(extension)
    if (!sanitized) {
      return null
    }

    const bundleId = await this.getBundleIdForExtension(sanitized)
    if (!bundleId) {
      return null
    }

    const appInfo = await this.getAppInfoByBundleId(bundleId)
    if (!appInfo) {
      return null
    }

    let logo = appInfo.logo
    if (!logo) {
      const cached = this.getOpenerFromStorage(sanitized, bundleId)
      if (cached?.logo) {
        logo = cached.logo
        if (appInfo.fileId) {
          this.persistOpenerIcon(appInfo.fileId, cached.logo)
        }
      }
    }

    if (!logo && appInfo.path && this.enableFileIconExtraction) {
      this.scheduleOpenerIconUpdate(sanitized, bundleId, appInfo)
    }

    const resolvedLogo = this.resolveOpenerLogo(logo)
    const opener: ResolvedOpener = {
      bundleId,
      name: appInfo.name,
      logo: resolvedLogo,
      path: appInfo.path,
      lastResolvedAt: new Date().toISOString()
    }

    this.persistOpenerToStorage(sanitized, opener)

    return opener
  }

  private resolveOpenerLogo(logo?: string | null): string {
    if (logo && logo.trim().length > 0) {
      return logo
    }
    return EMPTY_OPENER_LOGO
  }

  private getOpenerFromStorageByExtension(extension: string): OpenerInfo | null {
    try {
      const raw = getMainConfig(StorageList.OPENERS) as unknown
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null
      }
      const entry = (raw as Record<string, OpenerInfo>)[extension]
      return entry ?? null
    } catch (error) {
      this.logWarn('Failed to read openers cache', error, { extension })
      return null
    }
  }

  private getOpenerFromStorage(extension: string, bundleId: string): OpenerInfo | null {
    try {
      const raw = getMainConfig(StorageList.OPENERS) as unknown
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null
      }
      const entry = (raw as Record<string, OpenerInfo>)[extension]
      if (!entry || entry.bundleId !== bundleId) {
        return null
      }
      return entry
    } catch (error) {
      this.logWarn('Failed to read openers cache', error, { extension })
      return null
    }
  }

  private persistOpenerIcon(fileId: number, logo: string): void {
    if (!this.dbUtils || !logo) {
      return
    }

    const db = this.dbUtils.getDb()
    void this.withDbWrite('file-opener.icon.persist', () =>
      db
        .insert(fileExtensions)
        .values({
          fileId,
          key: 'icon',
          value: logo
        })
        .onConflictDoUpdate({
          target: [fileExtensions.fileId, fileExtensions.key],
          set: { value: logo }
        })
    ).catch((error) => {
      this.logWarn('Failed to persist opener icon', error, { fileId })
    })
  }

  private persistOpenerToStorage(extension: string, opener: OpenerInfo): void {
    try {
      const raw = getMainConfig(StorageList.OPENERS) as unknown
      const current =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as Record<string, OpenerInfo>)
          : {}
      const existing = current[extension]
      const next = { ...existing, ...opener }

      if (
        existing &&
        existing.logo === next.logo &&
        existing.bundleId === next.bundleId &&
        existing.name === next.name &&
        existing.path === next.path &&
        existing.lastResolvedAt === next.lastResolvedAt
      ) {
        return
      }

      const updated = { ...current, [extension]: next }
      saveMainConfig(StorageList.OPENERS, updated)
    } catch (error) {
      this.logWarn('Failed to persist opener cache', error, { extension })
    }
  }

  private scheduleOpenerIconUpdate(
    extension: string,
    bundleId: string,
    appInfo: { fileId: number; name: string; path: string; logo: string }
  ): void {
    if (!this.enableFileIconExtraction || !appInfo.path) {
      return
    }

    if (this.openerIconJobs.has(extension)) {
      return
    }

    const task = (async () => {
      const logo = await this.generateApplicationIcon(appInfo.path)
      if (!logo) {
        return
      }

      if (appInfo.fileId) {
        this.persistOpenerIcon(appInfo.fileId, logo)
      }

      const opener: ResolvedOpener = {
        bundleId,
        name: appInfo.name,
        logo,
        path: appInfo.path,
        lastResolvedAt: new Date().toISOString()
      }

      this.openerCache.set(extension, opener)
      this.persistOpenerToStorage(extension, opener)
    })()
      .catch((error) => {
        this.logWarn('Failed to refresh opener icon', error, { extension })
      })
      .finally(() => {
        this.openerIconJobs.delete(extension)
      })

    this.openerIconJobs.set(extension, task)
  }

  private async getBundleIdForExtension(extension: string): Promise<string | null> {
    if (this.bundleIdCache.has(extension)) {
      return this.bundleIdCache.get(extension) ?? null
    }

    const handlers = await this.loadLaunchServicesHandlers()
    if (handlers.length === 0) {
      this.bundleIdCache.set(extension, null)
      return null
    }

    const lower = extension.toLowerCase()

    const directMatch = handlers.find(
      (handler) =>
        typeof handler?.LSHandlerContentTag === 'string' &&
        handler.LSHandlerContentTag.toLowerCase() === lower &&
        handler.LSHandlerContentTagClass === 'public.filename-extension'
    )

    const directBundle = this.pickBundleIdFromHandler(directMatch)
    if (directBundle) {
      this.bundleIdCache.set(extension, directBundle)
      return directBundle
    }

    const uti = await this.resolveUniformTypeIdentifier(lower)
    if (!uti) {
      this.bundleIdCache.set(extension, null)
      return null
    }

    const utiMatch = handlers.find(
      (handler) =>
        typeof handler?.LSHandlerContentType === 'string' &&
        handler.LSHandlerContentType.toLowerCase() === uti.toLowerCase()
    )

    const bundleId = this.pickBundleIdFromHandler(utiMatch)
    this.bundleIdCache.set(extension, bundleId)
    return bundleId
  }

  private pickBundleIdFromHandler(
    handler: LaunchServicesHandler | null | undefined
  ): string | null {
    if (!handler) {
      return null
    }

    const roleKeys: LaunchServicesRoleKey[] = [
      'LSHandlerRoleAll',
      'LSHandlerRoleViewer',
      'LSHandlerRoleEditor'
    ]

    for (const key of roleKeys) {
      const value = handler[key]
      if (typeof value === 'string' && value.length > 0) {
        return value
      }
    }

    const preferred = handler.LSHandlerPreferredVersions
    if (preferred) {
      for (const key of roleKeys) {
        const value = preferred[key]
        if (typeof value === 'string' && value.length > 0) {
          return value
        }
      }
    }

    return null
  }

  private async loadLaunchServicesHandlers(): Promise<LaunchServicesHandler[]> {
    if (process.platform !== 'darwin') {
      return []
    }

    if (this.launchServicesLoadPromise) {
      return this.launchServicesLoadPromise
    }

    this.launchServicesLoadPromise = (async () => {
      try {
        const stats = await fs.stat(LAUNCH_SERVICES_PLIST_PATH)
        if (this.launchServicesHandlers && this.launchServicesMTime === stats.mtimeMs) {
          return this.launchServicesHandlers
        }

        const { stdout } = await execFileAsync('plutil', [
          '-convert',
          'xml1',
          '-o',
          '-',
          LAUNCH_SERVICES_PLIST_PATH
        ])

        const parsed = plist.parse(stdout.toString()) as {
          LSHandlers?: LaunchServicesHandler[]
        }
        const handlers = Array.isArray(parsed?.LSHandlers) ? parsed.LSHandlers : []

        this.launchServicesHandlers = handlers
        this.launchServicesMTime = stats.mtimeMs

        return handlers
      } catch (error) {
        this.logError('Failed to load LaunchServices configuration for opener resolution.', error)
        this.launchServicesHandlers = []
        this.launchServicesMTime = undefined
        return []
      } finally {
        this.launchServicesLoadPromise = null
      }
    })()

    return this.launchServicesLoadPromise
  }

  private async resolveUniformTypeIdentifier(extension: string): Promise<string | null> {
    if (process.platform !== 'darwin') {
      return null
    }

    const safeExt = extension.replace(/[^a-z0-9.+-]/gi, '')
    if (!safeExt) {
      return null
    }

    if (this.utiCache.has(safeExt)) {
      return this.utiCache.get(safeExt) ?? null
    }

    const tempPath = path.join(
      os.tmpdir(),
      `talex-touch-${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`
    )

    try {
      await fs.writeFile(tempPath, '')
      const { stdout } = await execFileAsync('mdls', ['-name', 'kMDItemContentType', tempPath])
      const match = /"([^"\n]+)"/.exec(stdout.toString())
      const uti = match ? match[1] : null
      this.utiCache.set(safeExt, uti)
      return uti
    } catch (error) {
      this.logWarn(`Failed to resolve UTI for extension .${extension}`, error)
      this.utiCache.set(safeExt, null)
      return null
    } finally {
      try {
        await fs.unlink(tempPath)
      } catch {
        /* ignore */
      }
    }
  }

  private async getAppInfoByBundleId(bundleId: string): Promise<{
    fileId: number
    name: string
    path: string
    logo: string
  } | null> {
    if (!this.dbUtils) {
      return null
    }

    try {
      const db = this.dbUtils.getDb()

      const mapping = await db
        .select({ fileId: fileExtensions.fileId })
        .from(fileExtensions)
        .where(and(eq(fileExtensions.key, 'bundleId'), eq(fileExtensions.value, bundleId)))
        .limit(1)

      const fileId = mapping[0]?.fileId
      if (!fileId) {
        return null
      }

      const [fileRow] = await db
        .select({
          id: filesSchema.id,
          name: filesSchema.name,
          displayName: filesSchema.displayName,
          path: filesSchema.path
        })
        .from(filesSchema)
        .where(eq(filesSchema.id, fileId))
        .limit(1)

      if (!fileRow) {
        return null
      }

      const [iconRow] = await db
        .select({ value: fileExtensions.value })
        .from(fileExtensions)
        .where(and(eq(fileExtensions.fileId, fileId), eq(fileExtensions.key, 'icon')))
        .limit(1)

      return {
        fileId,
        name: fileRow.displayName || fileRow.name,
        path: fileRow.path,
        logo: iconRow?.value ?? ''
      }
    } catch (error) {
      this.logError('Failed to read app info for bundle', error, {
        bundleId
      })
      return null
    }
  }

  private async generateApplicationIcon(appPath: string): Promise<string> {
    try {
      const buffer = await this.extractFileIconQueued(appPath)
      if (buffer && buffer.length > 0) {
        const normalized = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
        const iconValue = `data:image/png;base64,${normalized.toString('base64')}`
        return isValidBase64DataUrl(iconValue) ? iconValue : ''
      }
    } catch (error) {
      this.logWarn('Failed to extract icon', error, {
        path: appPath
      })
    }
    return ''
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

      const meta: IconCacheMeta = {
        mtime: file ? this.toTimestamp(file.mtime) : Date.now(),
        size: file && typeof file.size === 'number' ? file.size : null
      }

      if (this.dbUtils) {
        const db = this.dbUtils.getDb()
        await db.transaction(async (tx) => {
          // Insert icon
          await tx
            .insert(fileExtensions)
            .values({
              fileId,
              key: 'icon',
              value: iconValue
            })
            .onConflictDoUpdate({
              target: [fileExtensions.fileId, fileExtensions.key],
              set: { value: iconValue }
            })

          // Insert meta
          await tx
            .insert(fileExtensions)
            .values({
              fileId,
              key: ICON_META_EXTENSION_KEY,
              value: JSON.stringify(meta)
            })
            .onConflictDoUpdate({
              target: [fileExtensions.fileId, fileExtensions.key],
              set: { value: JSON.stringify(meta) }
            })
        })
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
    file?: typeof filesSchema.$inferSelect
  ): Promise<void> {
    if (this.pendingThumbnailExtractions.has(fileId)) {
      return
    }
    if (file && !isThumbnailCandidate(file.extension, file.size)) {
      return
    }

    this.pendingThumbnailExtractions.add(fileId)
    try {
      const thumbnail = await this.thumbnailWorker.generate(filePath)
      if (!thumbnail || !this.dbUtils) {
        return
      }
      await this.withDbWrite('thumbnail.worker', () =>
        this.dbUtils!.addFileExtensions([{ fileId, key: 'thumbnail', value: thumbnail }])
      )
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

      // Build extension filter: WHERE extension IN ('.png', '.jpg', ...)
      const imageExtensions = [...THUMBNAIL_EXTENSIONS].map((e) => `.${e}`)

      // Find image files that don't have a thumbnail extension yet
      const candidates = await db
        .select({
          id: filesSchema.id,
          path: filesSchema.path,
          extension: filesSchema.extension,
          size: filesSchema.size
        })
        .from(filesSchema)
        .leftJoin(
          fileExtensions,
          and(eq(fileExtensions.fileId, filesSchema.id), eq(fileExtensions.key, 'thumbnail'))
        )
        .where(and(isNull(fileExtensions.value), inArray(filesSchema.extension, imageExtensions)))
        .limit(500)

      if (candidates.length === 0) return

      this.logDebug('Starting deferred thumbnail generation', { count: candidates.length })
      let generated = 0

      for (const file of candidates) {
        if (!this._thumbnailTaskRunning) break // allow cancellation

        if (!isThumbnailCandidate(file.extension, file.size)) continue

        // Yield to event loop before each thumbnail
        await new Promise<void>((resolve) => setImmediate(resolve))
        await appTaskGate.waitForIdle()

        let thumbnail: string | null = null
        try {
          thumbnail = await this.thumbnailWorker.generate(file.path)
        } catch (error) {
          this.logWarn('Thumbnail worker failed', error, { path: file.path })
        }
        if (thumbnail && typeof file.id === 'number') {
          await this.withDbWrite('thumbnail.deferred', () =>
            this.dbUtils!.addFileExtensions([
              { fileId: file.id, key: 'thumbnail', value: thumbnail }
            ])
          )
          generated++
        }
      }

      this.logDebug('Deferred thumbnail generation completed', {
        generated,
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

  private subscribeToFileSystemEvents(): void {
    if (this.fsEventsSubscribed) {
      return
    }

    touchEventBus.on(TalexEvents.FILE_ADDED, this.handleFsAddedOrChanged)
    touchEventBus.on(TalexEvents.FILE_CHANGED, this.handleFsAddedOrChanged)
    touchEventBus.on(TalexEvents.FILE_UNLINKED, this.handleFsUnlinked)

    this.fsEventsSubscribed = true
    this.logDebug('Subscribed to file system events for incremental updates.')
  }

  private normalizePath(p: string): string {
    return normalizeWatchPath(p, this.isCaseInsensitiveFs)
  }

  private isWithinWatchRoots(rawPath: string): boolean {
    if (!rawPath) return false
    const normalizedPath = this.normalizePath(rawPath)
    for (const watchRoot of this.normalizedWatchPaths) {
      if (normalizedPath === watchRoot) return true
      const withSeparator = watchRoot.endsWith(path.sep) ? watchRoot : `${watchRoot}${path.sep}`
      if (normalizedPath.startsWith(withSeparator)) {
        return true
      }
    }
    return false
  }

  private enqueueIncrementalUpdate(
    rawPath: string,
    action: IncrementalUpdateAction,
    options?: { manual?: boolean }
  ): void {
    if (!this.isWithinWatchRoots(rawPath)) {
      return
    }

    const manual = options?.manual === true
    const normalizedPath = this.normalizePath(rawPath)
    const prev = this.pendingIncrementalPaths.get(normalizedPath)
    if (action === 'delete') {
      this.pendingIncrementalPaths.set(normalizedPath, { action, rawPath })
    } else if (!prev || prev.action !== 'delete') {
      const nextAction: 'add' | 'change' = prev?.action === 'add' ? 'add' : action
      const nextRawPath = action === 'add' ? rawPath : (prev?.rawPath ?? rawPath)
      this.pendingIncrementalPaths.set(normalizedPath, {
        action: nextAction,
        rawPath: nextRawPath,
        manual: prev?.manual === true || manual
      })
    }

    this.scheduleIncrementalProcessing()
  }

  private scheduleIncrementalProcessing(): void {
    if (this.pendingIncrementalPaths.size === 0) return

    this.incrementalTaskChain = this.incrementalTaskChain
      .then(() => this.flushIncrementalQueue())
      .catch((error) => {
        this.logError('Failed to process incremental updates.', error)
      })
  }

  private async flushIncrementalQueue(): Promise<void> {
    if (this.pendingIncrementalPaths.size === 0) {
      return
    }

    if (this.isInitializing) {
      try {
        await this.isInitializing
      } catch (error) {
        this.logError('Initialization failed before processing increments.', error)
        return
      }
    }

    if (!this.dbUtils) {
      this.logWarn('flushIncrementalQueue skipped: dbUtils not ready.')
      return
    }

    const entries = Array.from(this.pendingIncrementalPaths.entries())
    this.pendingIncrementalPaths.clear()

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
    if (!this.dbUtils || paths.length === 0) return
    const db = this.dbUtils.getDb()
    const normalized = Array.from(new Set(paths.map((p) => path.normalize(p))))
    const existing = await db
      .select({ id: filesSchema.id, path: filesSchema.path })
      .from(filesSchema)
      .where(inArray(filesSchema.path, normalized))

    if (existing.length === 0) {
      return
    }

    const idsToDelete = existing.map((file) => file.id)
    const pathsToDelete = existing.map((file) => file.path)
    await this.withDbWrite('file-index.incremental.delete', async () => {
      await db.delete(filesSchema).where(inArray(filesSchema.id, idsToDelete))
      await this.deleteEmbeddingsByFileIds(db, idsToDelete)
    })
    // Remove from FTS5 via worker thread to avoid blocking main thread
    await this.searchIndexWorker.removeItems(pathsToDelete)
    this.logDebug('Incremental remove completed', {
      removed: existing.length
    })
  }

  private async handleIncrementalAddsOrChanges(
    entries: Array<[string, { action: 'add' | 'change'; rawPath: string; manual?: boolean }]>
  ): Promise<void> {
    if (!this.dbUtils) return
    const db = this.dbUtils.getDb()
    const manualEntries = entries.filter(([, payload]) => payload.manual === true)
    const manualPaths = new Set(
      manualEntries.map(([, payload]) => this.normalizePath(payload.rawPath))
    )

    const recordMap = new Map<string, typeof filesSchema.$inferInsert>()
    for (const [, payload] of entries) {
      const record = await this.buildFileRecord(payload.rawPath, {
        manualForce: payload.manual === true
      })
      if (record) {
        recordMap.set(record.path, record)
      }
    }

    if (recordMap.size === 0) {
      if (manualEntries.length > 0) {
        console.log('[FileProvider] incremental manual summary', {
          total: manualEntries.length,
          accepted: 0,
          inserted: 0,
          updated: 0,
          unchanged: 0
        })
      }
      return
    }

    const manualAccepted = Array.from(recordMap.keys()).reduce((count, filePath) => {
      return count + (manualPaths.has(this.normalizePath(filePath)) ? 1 : 0)
    }, 0)

    const targetPaths = Array.from(recordMap.keys())
    const existingRows = await db
      .select()
      .from(filesSchema)
      .where(inArray(filesSchema.path, targetPaths))
    const existingMap = new Map(existingRows.map((row) => [row.path, row]))

    const filesToInsert: (typeof filesSchema.$inferInsert)[] = []
    const filesToUpdate: (typeof filesSchema.$inferSelect)[] = []
    let unchangedCount = 0

    for (const [filePath, record] of recordMap.entries()) {
      const existing = existingMap.get(filePath)
      if (existing) {
        if (this.hasRecordChanged(record, existing)) {
          filesToUpdate.push({
            ...existing,
            name: record.name,
            extension: record.extension || null,
            size: record.size || null,
            mtime: record.mtime,
            ctime: record.ctime,
            lastIndexedAt: record.lastIndexedAt || new Date(),
            type: existing.type || 'file',
            isDir: false
          })
        } else {
          unchangedCount += 1
        }
      } else {
        filesToInsert.push(record)
      }
    }

    if (filesToInsert.length > 0) {
      const inserted = await this.withDbWrite('file-index.incremental.insert', () =>
        db
          .insert(filesSchema)
          .values(filesToInsert)
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

      // Fire-and-forget: keyword/icon processing should not block the incremental pipeline
      void this.processFileExtensions(inserted).catch((e) =>
        this.logWarn('processFileExtensions failed (incremental)', e)
      )
      this.scheduleIndexing(inserted, 'incremental-insert')
      this.logDebug('Incremental index completed', {
        inserted: inserted.length
      })
    }

    if (filesToUpdate.length > 0) {
      await this._processFileUpdates(filesToUpdate)
      this.logDebug('Incremental update completed', {
        updated: filesToUpdate.length
      })
    }

    if (unchangedCount > 0) {
      this.logDebug(`Skipped ${unchangedCount} unchanged file(s) during incremental sync.`)
    }

    if (manualEntries.length > 0) {
      const manualInserted = filesToInsert.reduce((count, file) => {
        return count + (manualPaths.has(this.normalizePath(file.path)) ? 1 : 0)
      }, 0)
      const manualUpdated = filesToUpdate.reduce((count, file) => {
        return count + (manualPaths.has(this.normalizePath(file.path)) ? 1 : 0)
      }, 0)
      const manualUnchanged = Math.max(0, manualAccepted - manualInserted - manualUpdated)
      console.log('[FileProvider] incremental manual summary', {
        total: manualEntries.length,
        accepted: manualAccepted,
        inserted: manualInserted,
        updated: manualUpdated,
        unchanged: manualUnchanged
      })
    }
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
          console.log('[FileProvider] buildFileRecord filtered(manual-blacklist)', {
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
        console.log('[FileProvider] buildFileRecord accepted(manual-force)', {
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
        averageItemsPerSecond: 0
      }
    }

    this.indexingProgress = { stage, current, total }

    // Calculate estimated completion
    let estimatedRemainingMs: number | null = null
    if (this.indexingStartTime && total > 0 && current > 0) {
      const elapsed = now - this.indexingStartTime
      const progress = current / total
      if (progress > 0.01) {
        const estimatedTotalTime = elapsed / progress
        estimatedRemainingMs = estimatedTotalTime - elapsed
      }
    }

    const payload = {
      stage,
      current,
      total,
      progress: total > 0 ? Math.round((current / total) * 100) : 0,
      startTime: this.indexingStartTime,
      estimatedRemainingMs,
      averageItemsPerSecond: this.indexingStats.averageItemsPerSecond
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
    const start = performance.now()
    this.logInfo('Running cross-table integrity check')

    const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve))

    // 1. Compare FTS5 row count vs files table count
    // Each query is a synchronous SQLite operation — yield between them
    // to keep the event loop responsive.
    const ftsCount = await this.searchIndexWorker.countByProvider(this.id)
    await yieldToEventLoop()

    const fileCountResult = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(filesSchema)
      .where(eq(filesSchema.type, 'file'))
    const filesCount = fileCountResult[0]?.cnt ?? 0
    await yieldToEventLoop()

    this.logInfo('Integrity check: row counts', {
      ftsRows: ftsCount,
      filesRows: filesCount
    })

    // 2. Check if FTS is significantly out-of-sync
    const needsRebuild = filesCount > 0 && (ftsCount === 0 || ftsCount < filesCount * 0.8)

    if (needsRebuild) {
      this.logInfo(
        `FTS5 index inconsistency detected (fts=${ftsCount}, files=${filesCount}) — clearing scan_progress for full re-scan`
      )

      // Clear stale FTS5 entries so the re-scan writes fresh data
      if (ftsCount > 0) {
        await this.searchIndexWorker.removeByProvider(this.id)
        this.logInfo('Cleared stale FTS5 entries')
      }

      // Clear scan_progress so the normal scan pipeline does a full re-scan.
      // The worker-based indexing pipeline will naturally rebuild FTS5 as
      // each file is scanned — no need to do it synchronously here.
      const scanProgressCount = await db.select({ cnt: sql<number>`count(*)` }).from(scanProgress)
      if ((scanProgressCount[0]?.cnt ?? 0) > 0) {
        this.logInfo('Clearing scan_progress to trigger full re-scan')
        await this.withDbWrite('file-index.integrity-reset', () => db.delete(scanProgress))
      }
    } else if (ftsCount > 0) {
      // 3. Clean orphaned keyword_mappings (entries without corresponding FTS5 row)
      // NOTE: Do NOT use LEFT JOIN here — search_index is an FTS5 virtual table
      // which does not support efficient JOINs (no B-tree index on item_id).
      await yieldToEventLoop()
      const orphanedKeywords = await db.all<{ cnt: number }>(sql`
        SELECT count(*) as cnt FROM keyword_mappings km
        WHERE km.provider_id = ${this.id}
          AND km.item_id NOT IN (
            SELECT item_id FROM search_index WHERE provider = ${this.id}
          )
      `)
      await yieldToEventLoop()
      const orphanCount = orphanedKeywords[0]?.cnt ?? 0
      if (orphanCount > 0) {
        this.logInfo(`Removing ${orphanCount} orphaned keyword_mappings entries`)
        await this.withDbWrite('file-index.integrity-keywords', () =>
          db.run(sql`
            DELETE FROM keyword_mappings
            WHERE provider_id = ${this.id}
              AND item_id NOT IN (
                SELECT item_id FROM search_index WHERE provider = ${this.id}
              )
          `)
        )
      }
    }

    this.logInfo('Integrity check completed', {
      duration: formatDuration(performance.now() - start),
      needsRebuild
    })
  }

  private async _initialize(): Promise<void> {
    const initStart = performance.now()
    this.logDebug('Starting index process')
    if (!this.dbUtils) return

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
      await this.withDbWrite('file-index.migration-reset', () => db.delete(scanProgress))
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
    const cleanupStart = performance.now()
    this.logInfo('Cleaning stale index entries from removed watch paths')
    this.emitIndexingProgress('cleanup', 0, 1)
    const allDbFilePaths = await db
      .select({ path: filesSchema.path, id: filesSchema.id })
      .from(filesSchema)
      .where(eq(filesSchema.type, 'file'))
    // Yield after heavy SELECT on files table
    await new Promise<void>((resolve) => setImmediate(resolve))
    const filesToDelete = allDbFilePaths.filter(
      (file) => !this.watchPaths.some((watchPath) => file.path.startsWith(watchPath))
    )

    if (filesToDelete.length > 0) {
      const idsToDelete = filesToDelete.map((f) => f.id)
      this.logInfo('Removing stale database entries', {
        removed: idsToDelete.length
      })

      // Delete files + embeddings in the scheduler
      await this.withDbWrite('file-index.cleanup.delete', async () => {
        await db.delete(filesSchema).where(inArray(filesSchema.id, idsToDelete))
        await this.deleteEmbeddingsByFileIds(db, idsToDelete)
        const pathsToDelete = filesToDelete.map((f) => f.path)
        await db.delete(scanProgress).where(inArray(scanProgress.path, pathsToDelete))
      })

      // Remove from FTS5 index via worker thread — no longer blocks main event loop
      const pathsToRemove = filesToDelete.map((f) => f.path)
      if (pathsToRemove.length > 0) {
        const removeChunkSize = 50
        for (let i = 0; i < pathsToRemove.length; i += removeChunkSize) {
          const chunk = pathsToRemove.slice(i, i + removeChunkSize)
          await this.searchIndexWorker.removeItems(chunk)
        }
      }
    }
    this.emitIndexingProgress('cleanup', 1, 1)
    this.logDebug('Cleanup stage finished', {
      duration: formatDuration(performance.now() - cleanupStart),
      removed: filesToDelete.length
    })

    // --- 2. Determine Scan Strategy (FR-IX-3: Resumable Indexing) ---
    const strategyStart = performance.now()
    const completedScans = await db.select().from(scanProgress)
    // Yield after scan_progress read
    await new Promise<void>((resolve) => setImmediate(resolve))
    const completedScanPaths = new Set(completedScans.map((s) => s.path))

    const newPathsToScan = this.watchPaths.filter((p) => !completedScanPaths.has(p))
    const reconciliationPaths = this.watchPaths.filter((p) => completedScanPaths.has(p))

    // 🔍 DEBUG: 详细输出扫描策略信息
    this.logDebug('[DEBUG] File indexing scan strategy', {
      totalWatchPaths: this.watchPaths.length,
      watchPaths: JSON.stringify(this.watchPaths),
      completedScansCount: completedScans.length,
      completedPaths: JSON.stringify(Array.from(completedScanPaths)),
      newPathsCount: newPathsToScan.length,
      newPaths: JSON.stringify(newPathsToScan),
      reconciliationCount: reconciliationPaths.length,
      reconciliationPaths: JSON.stringify(reconciliationPaths)
    })

    this.logInfo('Scan strategy prepared', {
      newPaths: newPathsToScan.length,
      reconciliationPaths: reconciliationPaths.length,
      duration: formatDuration(performance.now() - strategyStart)
    })

    // --- 3. Full Scan for New Paths ---
    if (newPathsToScan.length > 0) {
      const fullScanContext = enterPerfContext('FileProvider.fullScan', {
        paths: newPathsToScan.length
      })
      try {
        this.logDebug('Starting full scan for new paths', {
          count: newPathsToScan.length,
          sample: newPathsToScan.slice(0, 3).join(', ')
        })
        this.emitIndexingProgress('scanning', 0, newPathsToScan.length)
        let scannedPaths = 0
        for (const newPath of newPathsToScan) {
          const pathScanStart = performance.now()
          this.logDebug('Scanning new path', { path: newPath })
          const diskFiles = await this.scanDirectoryWithWorker(newPath, excludePathsSet)
          this.logDebug('Directory scan completed', {
            path: newPath,
            files: diskFiles.length,
            duration: formatDuration(performance.now() - pathScanStart)
          })

          scannedPaths++
          this.emitIndexingProgress('scanning', scannedPaths, newPathsToScan.length)

          // Yield after scan completes — the worker result deserialization and
          // the subsequent .map() below are synchronous and can stall the event loop
          // for large directories (7000+ files).
          await new Promise<void>((resolve) => setImmediate(resolve))

          const lastIndexedAt = new Date()
          const newFileRecords = diskFiles.map((file) => ({
            path: file.path,
            name: file.name,
            extension: file.extension,
            size: file.size,
            mtime: file.mtime,
            ctime: file.ctime,
            lastIndexedAt,
            isDir: false,
            type: 'file'
          }))

          if (newFileRecords.length > 0) {
            this.logInfo('Preparing to index full-scan results', {
              path: newPath,
              files: newFileRecords.length
            })
            // Adaptive chunking: use AIMD scheduler to size upsert batches
            // based on real-time transaction duration feedback.
            let indexedFiles = 0
            this.emitIndexingProgress('indexing', 0, newFileRecords.length)
            let recordOffset = 0
            while (recordOffset < newFileRecords.length) {
              const chunkSize = this.upsertBatchScheduler.currentSize
              const chunk = newFileRecords.slice(recordOffset, recordOffset + chunkSize)
              recordOffset += chunk.length

              await appTaskGate.waitForIdle()
              await dbWriteScheduler.waitForCapacity(4)
              const chunkStart = performance.now()
              const inserted = await this.withDbWrite('file-index.full-scan.upsert', async () =>
                db
                  .insert(filesSchema)
                  .values(chunk)
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
              this.upsertBatchScheduler.recordDuration(performance.now() - chunkStart)
              this.logDebug('Full scan chunk inserted', {
                path: newPath,
                chunk: `batch(${chunkSize})`,
                size: chunk.length,
                duration: formatDuration(performance.now() - chunkStart)
              })
              // Fire-and-forget: keyword/icon processing should not block the scan pipeline
              void this.processFileExtensions(inserted).catch((e) =>
                this.logWarn('processFileExtensions failed (full-scan)', e)
              )
              this.scheduleIndexing(inserted, 'full-scan')
              indexedFiles += chunk.length
              this.emitIndexingProgress('indexing', indexedFiles, newFileRecords.length)
              // Pacing delay: sleep proportional to batch duration to avoid
              // flooding the serial DbWriteScheduler queue with cascading writes.
              // This mirrors TCP pacing — we space out packets (batches) so the
              // downstream pipeline (indexWorker → flush → FTS5) can drain.
              const batchMs = performance.now() - chunkStart
              await new Promise<void>((resolve) =>
                setTimeout(resolve, Math.max(100, Math.round(batchMs)))
              )
            }
          }
        }
      } finally {
        fullScanContext()
      }
    }

    // --- 4. Reconciliation Scan for Existing Paths (FR-IX-2) ---
    if (reconciliationPaths.length > 0) {
      const reconciliationContext = enterPerfContext('FileProvider.reconciliation', {
        paths: reconciliationPaths.length
      })
      const reconciliationStart = performance.now()
      try {
        this.logDebug('Starting reconciliation scan', {
          count: reconciliationPaths.length,
          sample: reconciliationPaths.slice(0, 3).join(', ')
        })

        this.emitIndexingProgress('reconciliation', 0, reconciliationPaths.length)
        await appTaskGate.waitForIdle()

        const pathFilters = reconciliationPaths.map(
          (targetPath) => sql`${filesSchema.path} LIKE ${`${targetPath}%`}`
        )
        const pathWhere = pathFilters.length > 0 ? or(...pathFilters) : undefined

        const dbFiles = await db
          .select({
            id: filesSchema.id,
            path: filesSchema.path,
            mtime: filesSchema.mtime
          })
          .from(filesSchema)
          .where(
            pathWhere ? and(eq(filesSchema.type, 'file'), pathWhere) : eq(filesSchema.type, 'file')
          )

        // Yield after heavy SELECT to let pending microtasks/IO run
        await new Promise<void>((resolve) => setImmediate(resolve))

        const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve))

        const diskFiles: ScannedFileInfo[] = []
        let reconciledPaths = 0
        for (const dir of reconciliationPaths) {
          await appTaskGate.waitForIdle()
          const scanned = await this.scanDirectoryWithWorker(dir, excludePathsSet)
          for (const scannedFile of scanned) {
            diskFiles.push(scannedFile)
          }
          await yieldToEventLoop()
          reconciledPaths++
          this.emitIndexingProgress('reconciliation', reconciledPaths, reconciliationPaths.length)
        }

        const diskPayload: ReconcileDiskFile[] = diskFiles.map((file) => ({
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.size,
          mtime: this.toTimestamp(file.mtime) ?? 0,
          ctime: this.toTimestamp(file.ctime) ?? 0
        }))

        const dbPayload: ReconcileDbFile[] = dbFiles.map((file) => ({
          id: file.id,
          path: file.path,
          mtime: this.toTimestamp(file.mtime) ?? 0
        }))

        let reconcileResult: {
          filesToAdd: ReconcileDiskFile[]
          filesToUpdate: Array<ReconcileDiskFile & { id: number }>
          deletedIds: number[]
        }
        try {
          reconcileResult = await this.reconcileWorker.reconcile(
            diskPayload,
            dbPayload,
            reconciliationPaths
          )
        } catch (error) {
          this.logWarn('File reconcile worker failed, falling back to main-thread diff', error, {
            files: diskPayload.length
          })
          reconcileResult = this.computeReconciliationDiff(
            diskPayload,
            dbPayload,
            reconciliationPaths
          )
        }

        const filesToAdd = reconcileResult.filesToAdd
        const filesToUpdate = reconcileResult.filesToUpdate.map((file) => ({
          id: file.id,
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.size,
          mtime: new Date(file.mtime),
          ctime: new Date(file.ctime),
          type: 'file',
          isDir: false
        }))
        const deletedFileIds = reconcileResult.deletedIds

        if (deletedFileIds.length > 0) {
          const deleteChunks: number[][] = []
          const deleteChunkSize = 50
          for (let i = 0; i < deletedFileIds.length; i += deleteChunkSize) {
            deleteChunks.push(deletedFileIds.slice(i, i + deleteChunkSize))
          }

          for (const chunk of deleteChunks) {
            await appTaskGate.waitForIdle()
            await dbWriteScheduler.waitForCapacity(4)
            await this.withDbWrite('file-index.reconcile.delete', async () => {
              await db.delete(filesSchema).where(inArray(filesSchema.id, chunk))
              await this.deleteEmbeddingsByFileIds(db, chunk)
            })
          }

          const deletedIdSet = new Set(deletedFileIds)
          const removedPaths = dbFiles
            .filter((file) => deletedIdSet.has(file.id))
            .map((file) => file.path)

          if (removedPaths.length > 0) {
            const pathChunks: string[][] = []
            const pathChunkSize = 100
            for (let i = 0; i < removedPaths.length; i += pathChunkSize) {
              pathChunks.push(removedPaths.slice(i, i + pathChunkSize))
            }
            for (const chunk of pathChunks) {
              await appTaskGate.waitForIdle()
              await this.searchIndexWorker.removeItems(chunk)
            }
          }
        }

        if (filesToUpdate.length > 0) {
          await this._processFileUpdates(filesToUpdate)
        }

        if (filesToAdd.length > 0) {
          const newFileRecords = filesToAdd.map((file) => ({
            path: file.path,
            name: file.name,
            extension: file.extension,
            size: file.size,
            mtime: new Date(file.mtime),
            ctime: new Date(file.ctime),
            lastIndexedAt: new Date(),
            isDir: false,
            type: 'file'
          }))

          const chunkSize = 20
          const chunks: (typeof newFileRecords)[] = []
          for (let i = 0; i < newFileRecords.length; i += chunkSize) {
            chunks.push(newFileRecords.slice(i, i + chunkSize))
          }

          let reconciledFiles = 0
          this.emitIndexingProgress('indexing', 0, filesToAdd.length)
          await runAdaptiveTaskQueue(
            chunks,
            async (chunk, chunkIndex) => {
              await appTaskGate.waitForIdle()
              await dbWriteScheduler.waitForCapacity(4)
              const chunkStart = performance.now()
              const inserted = await this.withDbWrite('file-index.reconcile.upsert', () =>
                db
                  .insert(filesSchema)
                  .values(chunk)
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
              this.logDebug('Reconciliation chunk inserted', {
                chunk: `${chunkIndex + 1}/${chunks.length}`,
                size: chunk.length,
                duration: formatDuration(performance.now() - chunkStart)
              })
              // Fire-and-forget: keyword/icon processing should not block reconciliation
              void this.processFileExtensions(inserted).catch((e) =>
                this.logWarn('processFileExtensions failed (reconciliation)', e)
              )
              this.scheduleIndexing(inserted, 'reconciliation-insert')
              reconciledFiles += chunk.length
              this.emitIndexingProgress('indexing', reconciledFiles, filesToAdd.length)
            },
            {
              estimatedTaskTimeMs: 20,
              label: 'FileProvider::reconciliationInsert'
            }
          )
        }

        const scanTime = new Date()
        await this.withDbWrite('file-index.scan-progress.bulk-upsert', () =>
          db
            .insert(scanProgress)
            .values(reconciliationPaths.map((path) => ({ path, lastScanned: scanTime })))
            .onConflictDoUpdate({
              target: scanProgress.path,
              set: { lastScanned: scanTime }
            })
        )

        this.logDebug('Reconciliation completed', {
          duration: formatDuration(performance.now() - reconciliationStart),
          added: filesToAdd.length,
          updated: filesToUpdate.length,
          deleted: deletedFileIds.length
        })
      } finally {
        reconciliationContext()
      }
    }

    this.emitIndexingProgress('completed', 1, 1)
    this.logInfo('Index process complete', {
      duration: formatDuration(performance.now() - initStart)
    })

    // Schedule deferred thumbnail generation (low-priority, non-blocking)
    void this.generateMissingThumbnails()
  }

  private async _processFileUpdates(filesToUpdate: FileUpdateRecord[], chunkSize = 10) {
    if (!this.dbUtils) return
    const db = this.dbUtils.getDb()

    const chunks: FileUpdateRecord[][] = []
    for (let i = 0; i < filesToUpdate.length; i += chunkSize) {
      chunks.push(filesToUpdate.slice(i, i + chunkSize))
    }

    let processedCount = 0
    const logInterval = 200
    const processStart = performance.now()

    await runAdaptiveTaskQueue(
      chunks,
      async (chunk) => {
        await appTaskGate.waitForIdle()
        await dbWriteScheduler.waitForCapacity(4)
        const chunkStart = performance.now()

        // Run each UPDATE as a separate scheduled task so the scheduler
        // can yield between them. Do NOT batch them in a single withDbWrite
        // — that blocks the event loop for the entire chunk duration.
        for (const file of chunk) {
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
        const ids = chunk.map((file) => file.id)
        const refreshed = await db.select().from(filesSchema).where(inArray(filesSchema.id, ids))

        // Fire-and-forget: keyword/icon processing should not block file updates
        void this.processFileExtensions(refreshed).catch((e) =>
          this.logWarn('processFileExtensions failed (file-update)', e)
        )
        this.scheduleIndexing(refreshed, 'file-update')

        processedCount += chunk.length
        if (processedCount % logInterval === 0 || processedCount === filesToUpdate.length) {
          const chunkDuration = performance.now() - chunkStart
          const totalDuration = performance.now() - processStart
          const averagePerFile = processedCount > 0 ? totalDuration / processedCount : totalDuration
          this.logDebug('File update chunk processed', {
            processed: processedCount,
            total: filesToUpdate.length,
            duration: formatDuration(chunkDuration),
            averageDuration: formatDuration(averagePerFile)
          })
        }
      },
      {
        estimatedTaskTimeMs: 20,
        label: 'FileProvider::processFileUpdates'
      }
    )
  }

  private async indexFilesForSearch(files: (typeof filesSchema.$inferSelect)[]): Promise<void> {
    if (files.length === 0) return

    const indexStart = performance.now()
    const items: SearchIndexItem[] = files.map((file) => this.buildSearchIndexItem(file))
    await this.searchIndexWorker.indexItems(items)

    // 只在处理大量文件时输出详细日志，减少日志噪音
    if (files.length >= 50) {
      this.logDebug('Indexed files for search', {
        count: files.length,
        duration: formatDuration(performance.now() - indexStart)
      })
    }
  }

  private buildSearchIndexItem(file: typeof filesSchema.$inferSelect): SearchIndexItem {
    return buildFileProviderSearchIndexItem(file, this.id, this.type)
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
              extensionsToAdd.push({
                fileId,
                key: 'keywords',
                value: JSON.stringify(keywords)
              })
            }
          }
        },
        {
          estimatedTaskTimeMs: 3,
          label: 'FileProvider::processFileExtensions'
        }
      )

      if (extensionsToAdd.length > 0) {
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
      ICON_META_EXTENSION_KEY
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
      } else if (row.key === ICON_META_EXTENSION_KEY && row.value) {
        try {
          const parsed = JSON.parse(row.value) as IconCacheMeta
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
    const iconValue = extensions.icon
    const thumbnailValue = extensions.thumbnail
    if (
      (!iconValue || isValidBase64DataUrl(iconValue)) &&
      (!thumbnailValue || isValidBase64DataUrl(thumbnailValue))
    ) {
      return extensions
    }

    const sanitized = { ...extensions }
    if (iconValue && !isValidBase64DataUrl(iconValue)) {
      delete sanitized.icon
    }
    if (thumbnailValue && !isValidBase64DataUrl(thumbnailValue)) {
      delete sanitized.thumbnail
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

  private async extractContentForFiles(files: (typeof filesSchema.$inferSelect)[]): Promise<void> {
    if (!this.dbUtils) return
    if (files.length === 0) return

    await runAdaptiveTaskQueue(
      files,
      async (file) => {
        await appTaskGate.waitForIdle()
        try {
          await this.extractContentForFile(file)
        } catch (error) {
          this.logError('Failed to extract content for file', error, {
            path: file.path
          })
        }
      },
      {
        estimatedTaskTimeMs: 20,
        label: 'FileProvider::extractContent'
      }
    )
  }

  private createProgressReporter(fileId: number, totalBytes: number | null) {
    return (progress: FileParserProgress) => {
      if (!this.dbUtils) return

      const processed = progress.processedBytes ?? 0
      const total = progress.totalBytes ?? totalBytes ?? 0
      const percentage = progress.percentage ?? (total > 0 ? processed / total : 0)

      this.pendingContentProgress.set(fileId, {
        progress: Math.min(99, Math.round((percentage || 0) * 100)),
        processedBytes: processed,
        totalBytes: total,
        updatedAt: new Date()
      })

      if (!this.contentProgressFlushTimer) {
        this.contentProgressFlushTimer = setTimeout(() => {
          this.contentProgressFlushTimer = null
          void this.flushContentProgress()
        }, 150)
      }
    }
  }

  private async flushContentProgress(): Promise<void> {
    if (!this.dbUtils) {
      return
    }

    if (this.pendingContentProgress.size === 0) {
      return
    }

    const entries = Array.from(this.pendingContentProgress.entries())
    this.pendingContentProgress.clear()

    const db = this.dbUtils.getDb()

    await this.withDbWrite('file-index.progress.flush', () =>
      db.transaction(async (tx) => {
        for (const [fileId, payload] of entries) {
          await tx
            .insert(fileIndexProgress)
            .values({
              fileId,
              progress: payload.progress,
              processedBytes: payload.processedBytes,
              totalBytes: payload.totalBytes,
              updatedAt: payload.updatedAt
            })
            .onConflictDoUpdate({
              target: fileIndexProgress.fileId,
              set: {
                progress: payload.progress,
                processedBytes: payload.processedBytes,
                totalBytes: payload.totalBytes,
                updatedAt: payload.updatedAt
              }
            })
        }
      })
    )
  }

  private async extractContentForFile(file: typeof filesSchema.$inferSelect): Promise<void> {
    if (!this.dbUtils) return
    if (!file.id) return

    const extension = (file.extension || path.extname(file.name) || '').toLowerCase()
    if (!CONTENT_INDEXABLE_EXTENSIONS.has(extension)) {
      await this.withDbWrite('file-index.content.disabled', () =>
        this.dbUtils!.getDb()
          .insert(fileIndexProgress)
          .values({
            fileId: file.id!,
            status: 'skipped',
            progress: 100,
            processedBytes: 0,
            totalBytes: file.size ?? null,
            lastError: 'content-indexing-disabled',
            updatedAt: new Date()
          })
          .onConflictDoUpdate({
            target: fileIndexProgress.fileId,
            set: {
              status: 'skipped',
              progress: 100,
              processedBytes: 0,
              totalBytes: file.size ?? null,
              lastError: 'content-indexing-disabled',
              updatedAt: new Date()
            }
          })
      )
      this.clearContentFailure(file.id)
      return
    }

    const size = await this.ensureFileSize(file)
    const maxBytes = getContentSizeLimitMB(extension) * 1024 * 1024

    if (maxBytes && size !== null && size > maxBytes) {
      await this.withDbWrite('file-index.content.too-large', () =>
        this.dbUtils!.getDb()
          .insert(fileIndexProgress)
          .values({
            fileId: file.id!,
            status: 'skipped',
            progress: 100,
            processedBytes: 0,
            totalBytes: size,
            lastError: 'file-too-large',
            updatedAt: new Date()
          })
          .onConflictDoUpdate({
            target: fileIndexProgress.fileId,
            set: {
              status: 'skipped',
              progress: 100,
              processedBytes: 0,
              totalBytes: size,
              lastError: 'file-too-large',
              updatedAt: new Date()
            }
          })
      )
      this.clearContentFailure(file.id)
      file.content = null
      return
    }

    if (await this.shouldSkipContentDueToFailure(file)) {
      file.content = null
      return
    }

    await this.withDbWrite('file-index.content.start', () =>
      this.dbUtils!.getDb()
        .insert(fileIndexProgress)
        .values({
          fileId: file.id!,
          status: 'processing',
          progress: 5,
          processedBytes: 0,
          totalBytes: size ?? null,
          startedAt: new Date(),
          lastError: null,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: fileIndexProgress.fileId,
          set: {
            status: 'processing',
            progress: 5,
            processedBytes: 0,
            totalBytes: size ?? null,
            startedAt: new Date(),
            lastError: null,
            updatedAt: new Date()
          }
        })
    )
    this.clearContentFailure(file.id)

    const progressReporter = this.createProgressReporter(file.id, size)
    const parseStart = performance.now()
    let result: FileParserResult | null = null
    try {
      result = await fileParserRegistry.parseWithBestParser(
        {
          filePath: file.path,
          extension,
          size: size ?? 0,
          maxBytes
        },
        progressReporter
      )
    } catch (error) {
      this.logError('Parser threw while processing file', error, {
        path: file.path
      })
      await this.withDbWrite('file-index.content.parser-error', () =>
        this.dbUtils!.getDb()
          .insert(fileIndexProgress)
          .values({
            fileId: file.id!,
            status: 'failed',
            progress: 100,
            processedBytes: 0,
            totalBytes: size ?? null,
            lastError: error instanceof Error ? error.message : 'parser-error',
            updatedAt: new Date()
          })
          .onConflictDoUpdate({
            target: fileIndexProgress.fileId,
            set: {
              status: 'failed',
              progress: 100,
              processedBytes: 0,
              totalBytes: size ?? null,
              lastError: error instanceof Error ? error.message : 'parser-error',
              updatedAt: new Date()
            }
          })
      )
      this.recordContentFailure(file.id, error instanceof Error ? error.message : 'parser-error')
      file.content = null
      return
    }

    if (!result) {
      await this.withDbWrite('file-index.content.parser-not-found', () =>
        this.dbUtils!.getDb()
          .insert(fileIndexProgress)
          .values({
            fileId: file.id!,
            status: 'skipped',
            progress: 100,
            processedBytes: 0,
            totalBytes: size ?? null,
            lastError: 'parser-not-found',
            updatedAt: new Date()
          })
          .onConflictDoUpdate({
            target: fileIndexProgress.fileId,
            set: {
              status: 'skipped',
              progress: 100,
              processedBytes: 0,
              totalBytes: size ?? null,
              lastError: 'parser-not-found',
              updatedAt: new Date()
            }
          })
      )
      this.clearContentFailure(file.id)
      file.content = null
      return
    }

    await this.handleParserResult(file, result, size, performance.now() - parseStart)
  }

  private buildContentHash(content: string): string | null {
    if (!content) return null
    return createHash('sha256').update(content).digest('hex')
  }

  private async persistEmbeddings(
    executor: EmbeddingDbExecutor,
    fileId: number,
    contentHash: string | null,
    embeddings: FileParserEmbedding[]
  ): Promise<void> {
    if (embeddings.length === 0) return
    const sourceId = String(fileId)

    await executor
      .delete(embeddingsSchema)
      .where(and(eq(embeddingsSchema.sourceId, sourceId), eq(embeddingsSchema.sourceType, 'file')))

    await executor.insert(embeddingsSchema).values(
      embeddings.map((embedding) => ({
        sourceId,
        sourceType: 'file',
        embedding: embedding.vector,
        model: embedding.model || 'unknown',
        contentHash
      }))
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

  private async handleParserResult(
    file: typeof filesSchema.$inferSelect,
    result: FileParserResult,
    size: number | null,
    durationMs: number
  ): Promise<void> {
    if (!this.dbUtils) return
    const db = this.dbUtils.getDb()
    const fileId = file.id
    if (!fileId) return

    const totalBytes = result.totalBytes ?? size ?? null
    const processedBytes = result.processedBytes ?? totalBytes ?? null

    if (result.status === 'success') {
      const rawContent = result.content ?? ''
      const trimmedContent =
        rawContent.length > MAX_CONTENT_LENGTH
          ? `${rawContent.slice(0, MAX_CONTENT_LENGTH)}\n...[truncated]`
          : rawContent

      const embeddingStatus =
        result.embeddings && result.embeddings.length > 0 ? 'completed' : 'pending'
      const contentHash = this.buildContentHash(rawContent)

      await this.withDbWrite('file-index.content.success', () =>
        db.transaction(async (tx) => {
          await tx
            .update(filesSchema)
            .set({
              content: trimmedContent,
              embeddingStatus
            })
            .where(eq(filesSchema.id, fileId))

          await tx
            .insert(fileIndexProgress)
            .values({
              fileId,
              status: 'completed',
              progress: 100,
              processedBytes,
              totalBytes,
              lastError: null,
              updatedAt: new Date()
            })
            .onConflictDoUpdate({
              target: fileIndexProgress.fileId,
              set: {
                status: 'completed',
                progress: 100,
                processedBytes,
                totalBytes,
                lastError: null,
                updatedAt: new Date()
              }
            })

          if (result.embeddings && result.embeddings.length > 0) {
            await this.persistEmbeddings(tx, fileId, contentHash, result.embeddings)
          }
        })
      )

      file.content = trimmedContent

      if (result.embeddings && result.embeddings.length > 0) {
        this.logDebug('Persisted embeddings for file', {
          path: file.path,
          embeddings: result.embeddings.length
        })
      } else if (this.embeddingService && trimmedContent.length > 50) {
        // No parser-provided embeddings — generate via Intelligence SDK (best-effort, non-blocking)
        this.embeddingService.indexFile(file.path, trimmedContent).catch(() => {
          // Graceful degradation: ignore embedding generation failures
        })
      }

      this.clearContentFailure(fileId)

      this.logDebug('Content parsed for file', {
        path: file.path,
        duration: formatDuration(durationMs),
        length: trimmedContent.length
      })
      return
    }

    const progressPayload = {
      progress: 100,
      processedBytes,
      totalBytes,
      lastError: result.reason ?? null,
      updatedAt: new Date()
    }

    if (result.status === 'skipped') {
      await this.withDbWrite('file-index.content.skipped', () =>
        db
          .insert(fileIndexProgress)
          .values({
            fileId,
            status: 'skipped',
            ...progressPayload
          })
          .onConflictDoUpdate({
            target: fileIndexProgress.fileId,
            set: {
              status: 'skipped',
              ...progressPayload
            }
          })
      )
      this.clearContentFailure(fileId)
      file.content = null
      return
    }

    await this.withDbWrite('file-index.content.failed', () =>
      db
        .insert(fileIndexProgress)
        .values({
          fileId,
          status: 'failed',
          ...progressPayload
        })
        .onConflictDoUpdate({
          target: fileIndexProgress.fileId,
          set: {
            status: 'failed',
            ...progressPayload
          }
        })
    )
    this.recordContentFailure(fileId, result.reason ?? null)
    file.content = null
  }

  private async ensureFileSize(file: typeof filesSchema.$inferSelect): Promise<number | null> {
    if (typeof file.size === 'number' && file.size >= 0) {
      return file.size
    }

    try {
      const stats = await fs.stat(file.path)
      file.size = stats.size
      if (file.id && this.dbUtils) {
        const db = this.dbUtils.getDb()
        await this.withDbWrite('file-index.file-size.update', () =>
          db.update(filesSchema).set({ size: stats.size }).where(eq(filesSchema.id, file.id!))
        )
      }
      return stats.size
    } catch (error) {
      this.logError('Failed to stat file size', error, {
        path: file.path
      })
      return null
    }
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

    const items = Array.from(filesMap.values()).map(({ file, extensions }) => {
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
            this.ensureFileThumbnail(file.id, file.path, file).catch((error) => {
              this.logWarn('Failed to lazy load thumbnail', error, { path: file.path })
            })
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
      return tuffItem
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

    const items = Array.from(filesMap.values()).map(({ file, extensions }) => {
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
            this.ensureFileThumbnail(file.id, file.path, file).catch((error) => {
              this.logWarn('Failed to lazy load thumbnail', error, { path: file.path })
            })
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
      return tuffItem
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

  public async getWorkerStatusSnapshot(): Promise<{
    summary: { total: number; busy: number; idle: number; offline: number }
    workers: WorkerStatusSnapshot[]
  }> {
    const workers = await Promise.all([
      this.fileScanWorker.getStatus(),
      this.fileIndexWorker.getStatus(),
      this.reconcileWorker.getStatus(),
      this.iconWorker.getStatus(),
      this.thumbnailWorker.getStatus(),
      this.searchIndexWorker.getStatus()
    ])

    const summary = workers.reduce(
      (acc, worker) => {
        acc.total += 1
        if (worker.state === 'busy') {
          acc.busy += 1
        } else if (worker.state === 'idle') {
          acc.idle += 1
        } else {
          acc.offline += 1
        }
        return acc
      },
      { total: 0, busy: 0, idle: 0, offline: 0 }
    )

    return { summary, workers }
  }

  async onSearch(query: TuffQuery, _signal: AbortSignal): Promise<TuffSearchResult> {
    // Windows 平台禁用文件搜索，直接返回空结果
    if (process.platform === 'win32') {
      return new TuffSearchResultBuilder(query).build()
    }

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
    const shouldRunSemantic =
      Boolean(this.embeddingService) &&
      normalizedQuery.length >= SEMANTIC_TRIGGER_MIN_QUERY_LENGTH &&
      candidateIds.size < SEMANTIC_TRIGGER_MAX_CANDIDATES

    if (shouldRunSemantic && this.embeddingService) {
      let semanticTimedOut = false
      let timeoutId: NodeJS.Timeout | null = null
      const semanticTask = this.embeddingService
        .semanticSearch(normalizedQuery, 30)
        .catch((error) => {
          this.logWarn('Semantic search failed, fallback to lexical recall only', error)
          return []
        })
      const timeoutTask = new Promise<Array<{ sourceId: string; score: number }>>((resolve) => {
        timeoutId = setTimeout(() => {
          semanticTimedOut = true
          resolve([])
        }, SEMANTIC_SEARCH_TIMEOUT_MS)
      })

      const semanticMatches = await Promise.race([semanticTask, timeoutTask])
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      if (semanticTimedOut) {
        this.logDebug('Semantic search skipped due to timeout budget', {
          timeoutMs: SEMANTIC_SEARCH_TIMEOUT_MS,
          queryLength: normalizedQuery.length
        })
      }

      for (const match of semanticMatches) {
        if (candidateIds.size >= maxCandidateCount) break
        candidateIds.add(match.sourceId)
        semanticScoreMap.set(match.sourceId, match.score)
      }
    }

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
      await this.searchIndexWorker.removeItems(staleIds)
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

    const validPaths = Array.from(filesMap.keys())
    const usageStart = performance.now()
    const usageSummaries = await this.dbUtils.getUsageSummaryByItemIds(validPaths)
    this.logDebug('Usage summary lookup completed', {
      items: validPaths.length,
      duration: formatDuration(performance.now() - usageStart)
    })
    const usageMap = new Map(usageSummaries.map((summary) => [summary.itemId, summary]))

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
        const usage = usageMap.get(file.path)
        const lastUsed = usage ? new Date(usage.lastUsed).getTime() : 0
        const daysSinceLastUsed = lastUsed > 0 ? (now - lastUsed) / (1000 * 3600 * 24) : Infinity
        const lastUsedScore = lastUsed > 0 ? Math.exp(-0.1 * daysSinceLastUsed) : 0

        const lastModified = new Date(file.mtime).getTime()
        const daysSinceLastModified = (now - lastModified) / (1000 * 3600 * 24)
        const lastModifiedScore = Math.exp(-0.05 * daysSinceLastModified)

        const frequencyScore = usage ? Math.log10(usage.clickCount + 1) / 2 : 0
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
              this.ensureFileThumbnail(file.id, file.path, file).catch((error) => {
                this.logWarn('Failed to lazy load thumbnail', error, { path: file.path })
              })
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

        if (usage) {
          tuffItem.meta.usage = {
            clickCount: usage.clickCount ?? 0,
            lastUsed: usage.lastUsed ? new Date(usage.lastUsed).toISOString() : undefined
          }
        } else {
          tuffItem.meta.usage = {
            clickCount: 0
          }
        }

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

        return tuffItem
      })
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

function normalizeOpenerExtension(rawExtension: string): string {
  return rawExtension.replace(/^\./, '').trim().toLowerCase()
}

function sanitizeOpenerExtension(extension: string): string {
  return extension.replace(/[^a-z0-9.+-]/gi, '')
}
