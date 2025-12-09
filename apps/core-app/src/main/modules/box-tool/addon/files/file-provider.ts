import type {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  ITouchEvent,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { FileParserProgress, FileParserResult } from '@talex-touch/utils/electron/file-parsers'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { FileChangedEvent, FileUnlinkedEvent } from '../../../../core/eventbus/touch-event'
import type { TouchApp } from '../../../../core/touch-app'
import type * as schema from '../../../../db/schema'
import type { Primitive } from '../../../../utils/logger'
import type {
  SearchIndexItem,
  SearchIndexKeyword,
  SearchIndexService
} from '../../search-engine/search-index-service'
import type { ProviderContext } from '../../search-engine/types'
import type { FileTypeTag } from './constants'
import type { ScannedFileInfo } from './types'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { promisify } from 'node:util'
import { timingLogger, TuffInputType, TuffSearchResultBuilder } from '@talex-touch/utils'
import { ChannelType } from '@talex-touch/utils/channel'
import { runAdaptiveTaskQueue } from '@talex-touch/utils/common/utils'
import { fileParserRegistry } from '@talex-touch/utils/electron/file-parsers'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { app, shell } from 'electron'
import extractFileIcon from 'extract-file-icon'
import plist from 'plist'
import { FileAddedEvent, TalexEvents, touchEventBus } from '../../../../core/eventbus/touch-event'
import {
  fileExtensions,
  fileIndexProgress,
  files as filesSchema,
  keywordMappings,
  scanProgress
} from '../../../../db/schema'
import { createDbUtils } from '../../../../db/utils'
import {
  AppUsageActivityTracker,
  BackgroundTaskService
} from '../../../../service/background-task-service'
import { createFailedFilesCleanupTask } from '../../../../service/failed-files-cleanup-task'
import { FILE_TIMING_BASE_OPTIONS } from '../../../../utils/file-indexing-utils'
import { TYPE_ALIAS_MAP } from '../../../../utils/file-types'
import { fileProviderLog, formatDuration } from '../../../../utils/logger'
import FileSystemWatcher from '../../file-system-watcher'
import { searchLogger } from '../../search-engine/search-logger'
import {
  CONTENT_INDEXABLE_EXTENSIONS,
  getContentSizeLimitMB,
  getTypeTagsForExtension,
  KEYWORD_MAP,
  TYPE_TAG_EXTENSION_MAP
} from './constants'
import { isIndexableFile, mapFileToTuffItem, scanDirectory } from './utils'

const MAX_CONTENT_LENGTH = 200_000
const ICON_META_EXTENSION_KEY = 'iconMeta'

type FileIndexStatus = (typeof fileIndexProgress.$inferSelect)['status']

interface IconCacheMeta {
  mtime: number | null
  size: number | null
}

interface IconCacheEntry {
  icon?: string | null
  meta?: IconCacheMeta
}

const execFileAsync = promisify(execFile)

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

  private dbUtils: ReturnType<typeof createDbUtils> | null = null
  private isInitializing: Promise<void> | null = null
  private initializationFailed: boolean = false
  private initializationError: Error | null = null
  private initializationContext: ProviderContext | null = null
  private readonly WATCH_PATHS: string[]
  private readonly normalizedWatchPaths: string[]
  private databaseFilePath: string | null = null
  private searchIndex: SearchIndexService | null = null
  private fsEventsSubscribed = false
  private watchPathsRegistered = false
  private incrementalTaskChain: Promise<void> = Promise.resolve()
  private readonly pendingIncrementalPaths: Map<
    string,
    { action: 'add' | 'change' | 'delete'; rawPath: string }
  > = new Map()

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
  private readonly openerCache = new Map<string, ResolvedOpener>()
  private readonly openerPromises = new Map<string, Promise<ResolvedOpener | null>>()
  private launchServicesHandlers: any[] | null = null
  private launchServicesMTime?: number
  private readonly failedContentCache = new Map<
    number,
    { status: FileIndexStatus; updatedAt: number | null; lastError: string | null }
  >()

  private backgroundTaskService: BackgroundTaskService | null = null
  private activityTracker: AppUsageActivityTracker | null = null
  private touchApp: TouchApp | null = null
  private indexingProgress = {
    current: 0,
    total: 0,
    stage: 'idle' as 'idle' | 'cleanup' | 'scanning' | 'indexing' | 'reconciliation' | 'completed'
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
    this.WATCH_PATHS = [...new Set(paths.filter((p): p is string => !!p))]
    this.normalizedWatchPaths = this.WATCH_PATHS.map((p) => this.normalizePath(p))
    this.logInfo('Watching paths', {
      count: this.WATCH_PATHS.length
    })
  }

  private logInfo(message: string, meta?: Record<string, Primitive>): void {
    if (meta) {
      fileProviderLog.info(message, { meta })
    } else {
      fileProviderLog.info(message)
    }
  }

  private logWarn(message: string, error?: unknown, meta?: Record<string, Primitive>): void {
    if (error || meta) {
      fileProviderLog.warn(message, {
        ...(meta ? { meta } : {}),
        ...(error ? { error } : {})
      })
    } else {
      fileProviderLog.warn(message)
    }
  }

  private logDebug(message: string, meta?: Record<string, Primitive>): void {
    if (meta) {
      fileProviderLog.debug(message, { meta })
    } else {
      fileProviderLog.debug(message)
    }
  }

  private logError(message: string, error?: unknown, meta?: Record<string, Primitive>): void {
    if (error || meta) {
      fileProviderLog.error(message, {
        ...(meta ? { meta } : {}),
        ...(error ? { error } : {})
      })
    } else {
      fileProviderLog.error(message)
    }
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

  private initializeBackgroundTaskService(): void {
    if (!this.dbUtils) {
      this.logWarn('Database utils not available, skipping background task service initialization')
      return
    }

    this.activityTracker = AppUsageActivityTracker.getInstance()

    this.backgroundTaskService = BackgroundTaskService.getInstance(this.activityTracker, {
      idleThresholdMs: 60 * 60 * 1000,
      checkIntervalMs: 5 * 60 * 1000,
      maxConcurrentTasks: 1,
      taskTimeoutMs: 30 * 60 * 1000
    })

    const cleanupTask = createFailedFilesCleanupTask(this.dbUtils.getDb(), {
      maxRetryAge: 24 * 60 * 60 * 1000,
      batchSize: 100,
      maxRetries: 3
    })

    this.backgroundTaskService.registerTask(cleanupTask)

    this.backgroundTaskService.on('taskCompleted', (data) => {
      this.logDebug(`Background task completed: ${data.task.name}`, {
        duration: formatDuration(data.duration)
      })
    })

    this.backgroundTaskService.on('taskFailed', (data) => {
      this.logError(`Background task failed: ${data.task.name}`, data.error)
    })

    this.backgroundTaskService.start()

    this.logInfo('Background task service initialized')
  }

  /**
   * Record user activity for background task scheduling
   */
  recordUserActivity(): void {
    if (this.backgroundTaskService) {
      this.backgroundTaskService.recordActivity()
    }
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
    return [...this.WATCH_PATHS]
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
    const loadStart = performance.now()

    // Windows 平台暂时禁用文件索引，避免权限问题导致闪退
    // TODO: Phase 2 将使用 Everything SDK 替代
    if (process.platform === 'win32') {
      this.logInfo('File indexing disabled on Windows platform (Everything SDK integration planned)')
      this.dbUtils = createDbUtils(context.databaseManager.getDb())
      this.searchIndex = context.searchIndex
      this.touchApp = context.touchApp
      this.initializationContext = context
      // 只注册必要的 channel，不启动扫描
      this.registerOpenersChannel(context)
      this.registerIndexingChannels(context)
      return
    }

    this.dbUtils = createDbUtils(context.databaseManager.getDb())
    this.searchIndex = context.searchIndex
    this.touchApp = context.touchApp
    this.initializationContext = context // 保存 context 用于重建
    // Store the database file path to exclude it from scanning
    // Assuming the database file is named 'database.db' and located in the user data directory.
    this.databaseFilePath = path.join(app.getPath('userData'), 'database.db')

    // 🔍 DEBUG: 确认 onLoad 被调用
    this.logInfo('[DEBUG] FileProvider.onLoad called', {
      watchPathsCount: this.WATCH_PATHS.length,
      watchPaths: JSON.stringify(this.WATCH_PATHS.slice(0, 3))
    })

    this.initializeBackgroundTaskService()

    // 启动异步后台索引任务，不阻塞onLoad
    if (!this.isInitializing) {
      this.logInfo('onLoad: starting background index task...')
      // 重置状态
      this.isInitializing = null
      this.initializationFailed = false
      this.initializationError = null

      // 不等待初始化完成，让它在后台运行
      this.isInitializing = this._initialize()
        .then(() => {
          this.initializationFailed = false
          this.isInitializing = null // 重置状态，确保前端能正确显示"已完成"
          this.logInfo('File indexing initialization completed successfully')
        })
        .catch((error) => {
          this.initializationFailed = true
          this.initializationError = error
          this.isInitializing = null // 即使失败也重置状态
          this.logError('Background index task failed', error)
          this.emitIndexingProgress('idle', 0, 0)
          // 通知前端索引失败
          this.notifyIndexingFailure(error)
        })
    } else {
      this.logInfo('[DEBUG] Skipping initialization - already in progress')
    }

    // 只等待文件系统监听器设置完成，不等待索引完成
    await this.ensureFileSystemWatchers()
    this.registerOpenersChannel(context)
    this.registerIndexingChannels(context) // 注册索引管理通道
    const loadDuration = performance.now() - loadStart
    this.logInfo('Provider onLoad completed (indexing continues in background)', {
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

    if (this.WATCH_PATHS.length === 0) {
      this.logWarn('No watch paths resolved; skipping watcher registration.')
      return
    }

    this.logInfo('Registering watch paths', {
      count: this.WATCH_PATHS.length,
      sample: this.WATCH_PATHS.slice(0, 3).join(', ')
    })

    try {
      await Promise.all(
        this.WATCH_PATHS.map((watchPath) =>
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

    const channel = context.touchApp.channel

    channel.regChannel(ChannelType.MAIN, 'openers:resolve', async ({ data }) => {
      const extension = typeof data?.extension === 'string' ? data.extension : null
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

    this.touchApp.channel
      .send(ChannelType.MAIN, 'file-index:failed', {
        error: error.message,
        stack: error.stack,
        timestamp: Date.now()
      })
      .catch((err) => {
        this.logError('Failed to send indexing failure notification', err)
      })
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
  }> {
    if (!this.dbUtils) {
      return { totalFiles: 0, failedFiles: 0, skippedFiles: 0 }
    }

    const db = this.dbUtils.getDb()

    // 查询总文件数
    const totalFilesResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(filesSchema)
      .where(eq(filesSchema.type, 'file'))

    const totalFiles = totalFilesResult[0]?.count ?? 0

    // 查询失败的文件数
    const failedFilesResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(fileIndexProgress)
      .where(eq(fileIndexProgress.status, 'failed'))

    const failedFiles = failedFilesResult[0]?.count ?? 0

    // 查询跳过的文件数
    const skippedFilesResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(fileIndexProgress)
      .where(eq(fileIndexProgress.status, 'skipped'))

    const skippedFiles = skippedFilesResult[0]?.count ?? 0

    return { totalFiles, failedFiles, skippedFiles }
  }


  /**
   * Get battery level and charging status
   */
  public async getBatteryLevel(): Promise<{ level: number; charging: boolean } | null> {
    try {
      const { powerMonitor } = await import('electron')

      // Check if we're on AC power
      const onBattery = powerMonitor.onBatteryPower ?? false

      // For macOS, we can get more detailed battery info
      if (process.platform === 'darwin') {
        const { execFile } = await import('child_process')
        const { promisify } = await import('util')
        const execFileAsync = promisify(execFile)

        try {
          const { stdout } = await execFileAsync('pmset', ['-g', 'batt'])
          const match = /\d+%/.exec(stdout)
          if (match) {
            const level = parseInt(match[0].replace('%', ''), 10)
            return {
              level,
              charging: !onBattery
            }
          }
        } catch (error) {
          this.logWarn('Failed to get battery level from pmset', error)
        }
      }

      // Fallback: assume full battery if on AC power
      return {
        level: onBattery ? 50 : 100,
        charging: !onBattery
      }
    } catch (error) {
      this.logError('Failed to check battery status', error)
      return null
    }
  }

  /**
   * 手动触发重建索引（清空 scan_progress 强制全量扫描）
   */
  public async rebuildIndex(): Promise<void> {
    if (this.isInitializing) {
      throw new Error('Indexing is already in progress')
    }

    if (!this.initializationContext) {
      throw new Error('Cannot rebuild: initialization context not available')
    }

    this.logInfo('Manual index rebuild triggered')

    // 清空 scan_progress 表，强制全量扫描
    if (this.dbUtils) {
      const db = this.dbUtils.getDb()
      await db.delete(scanProgress)
      this.logInfo('Cleared scan_progress table for full rescan')
    }

    // 重新初始化
    await this.onLoad(this.initializationContext)
  }

  /**
   * 注册索引管理相关的 IPC 通道
   */
  private registerIndexingChannels(context: ProviderContext): void {
    const channel = context.touchApp.channel

    // 查询索引状态
    channel.regChannel(ChannelType.MAIN, 'file-index:status', () => {
      return this.getIndexingStatus()
    })

    // 手动触发重建
    channel.regChannel(ChannelType.MAIN, 'file-index:rebuild', async () => {
      try {
        await this.rebuildIndex()
        return { success: true, message: 'Index rebuild started' }
      } catch (error: any) {
        this.logError('Failed to trigger index rebuild', error)
        return { success: false, error: error.message }
      }
    })

    // 查询电池状态
    channel.regChannel(ChannelType.MAIN, 'file-index:battery-level', async () => {
      try {
        const batteryStatus = await this.getBatteryLevel()
        return batteryStatus
      } catch (error: any) {
        this.logError('Failed to get battery level', error)
        return null
      }
    })

    // 查询索引统计信息
    channel.regChannel(ChannelType.MAIN, 'file-index:stats', async () => {
      try {
        return await this.getIndexStats()
      } catch (error: any) {
        this.logError('Failed to get index stats', error)
        return { totalFiles: 0, failedFiles: 0, skippedFiles: 0 }
      }
    })
  }

  private async getOpenerForExtension(rawExtension: string): Promise<ResolvedOpener | null> {
    const normalized = rawExtension.replace(/^\./, '').toLowerCase()
    if (!normalized) {
      return null
    }

    if (this.openerCache.has(normalized)) {
      return this.openerCache.get(normalized)!
    }

    let pending = this.openerPromises.get(normalized)
    if (!pending) {
      pending = this.resolveOpener(normalized)
      this.openerPromises.set(normalized, pending)
    }

    const result = await pending
    this.openerPromises.delete(normalized)

    if (result) {
      this.openerCache.set(normalized, result)
    }

    return result
  }

  private async resolveOpener(extension: string): Promise<ResolvedOpener | null> {
    if (process.platform !== 'darwin') {
      return null
    }

    const sanitized = extension.replace(/[^a-z0-9.+-]/gi, '')
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
    if (!logo && appInfo.path) {
      logo = await this.generateApplicationIcon(appInfo.path)
    }

    const opener: ResolvedOpener = {
      bundleId,
      name: appInfo.name,
      logo,
      path: appInfo.path,
      lastResolvedAt: new Date().toISOString()
    }

    return opener
  }

  private async getBundleIdForExtension(extension: string): Promise<string | null> {
    const handlers = await this.loadLaunchServicesHandlers()
    if (handlers.length === 0) {
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
      return directBundle
    }

    const uti = await this.resolveUniformTypeIdentifier(lower)
    if (!uti) {
      return null
    }

    const utiMatch = handlers.find(
      (handler) =>
        typeof handler?.LSHandlerContentType === 'string' &&
        handler.LSHandlerContentType.toLowerCase() === uti.toLowerCase()
    )

    return this.pickBundleIdFromHandler(utiMatch)
  }

  private pickBundleIdFromHandler(handler: any): string | null {
    if (!handler || typeof handler !== 'object') {
      return null
    }

    const roleKeys = ['LSHandlerRoleAll', 'LSHandlerRoleViewer', 'LSHandlerRoleEditor']

    for (const key of roleKeys) {
      const value = handler[key]
      if (typeof value === 'string' && value.length > 0) {
        return value
      }
    }

    const preferred = handler.LSHandlerPreferredVersions
    if (preferred && typeof preferred === 'object') {
      for (const key of roleKeys) {
        const value = preferred[key]
        if (typeof value === 'string' && value.length > 0) {
          return value
        }
      }
    }

    return null
  }

  private async loadLaunchServicesHandlers(): Promise<any[]> {
    if (process.platform !== 'darwin') {
      return []
    }

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

      const parsed = plist.parse(stdout.toString()) as { LSHandlers?: any[] }
      const handlers = Array.isArray(parsed?.LSHandlers) ? parsed.LSHandlers : []

      this.launchServicesHandlers = handlers
      this.launchServicesMTime = stats.mtimeMs

      return handlers
    } catch (error) {
      this.logError('Failed to load LaunchServices configuration for opener resolution.', error)
      this.launchServicesHandlers = []
      this.launchServicesMTime = undefined
      return []
    }
  }

  private async resolveUniformTypeIdentifier(extension: string): Promise<string | null> {
    if (process.platform !== 'darwin') {
      return null
    }

    const safeExt = extension.replace(/[^a-z0-9.+-]/gi, '')
    if (!safeExt) {
      return null
    }

    const tempPath = path.join(
      os.tmpdir(),
      `talex-touch-${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`
    )

    try {
      await fs.writeFile(tempPath, '')
      const { stdout } = await execFileAsync('mdls', ['-name', 'kMDItemContentType', tempPath])
      const match = /"([^"\n]+)"/.exec(stdout.toString())
      return match ? match[1] : null
    } catch (error) {
      this.logWarn(`Failed to resolve UTI for extension .${extension}`, error)
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
      const buffer = extractFileIcon(appPath)
      if (buffer && buffer.length > 0) {
        return `data:image/png;base64,${buffer.toString('base64')}`
      }
    } catch (error) {
      this.logWarn('Failed to extract icon', error, {
        path: appPath
      })
    }
    return ''
  }

  private readonly pendingIconExtractions = new Set<number>()

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
      const icon = extractFileIcon(filePath)
      const iconValue = `data:image/png;base64,${icon.toString('base64')}`

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

  private getWatchDepthForPath(watchPath: string): number {
    const lower = watchPath.toLowerCase()
    if (process.platform === 'darwin') {
      // macOS Spotlight-style directories usually shallow
      if (lower.endsWith('/applications') || lower.endsWith('/downloads')) {
        return 1
      }
      return 2
    }
    if (process.platform === 'win32') {
      return 4
    }
    return 3
  }

  private subscribeToFileSystemEvents(): void {
    if (this.fsEventsSubscribed) {
      return
    }

    touchEventBus.on(TalexEvents.FILE_ADDED, this.handleFsAddedOrChanged)
    touchEventBus.on(TalexEvents.FILE_CHANGED, this.handleFsAddedOrChanged)
    touchEventBus.on(TalexEvents.FILE_UNLINKED, this.handleFsUnlinked)

    this.fsEventsSubscribed = true
    this.logInfo('Subscribed to file system events for incremental updates.')
  }

  private normalizePath(p: string): string {
    const normalized = path.normalize(p)
    return this.isCaseInsensitiveFs ? normalized.toLowerCase() : normalized
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

  private enqueueIncrementalUpdate(rawPath: string, action: 'add' | 'change' | 'delete'): void {
    if (!this.isWithinWatchRoots(rawPath)) {
      return
    }

    const normalizedPath = this.normalizePath(rawPath)
    const prev = this.pendingIncrementalPaths.get(normalizedPath)
    if (action === 'delete') {
      this.pendingIncrementalPaths.set(normalizedPath, { action, rawPath })
    } else if (!prev || prev.action !== 'delete') {
      const nextAction: 'add' | 'change' = prev?.action === 'add' ? 'add' : action
      const nextRawPath = action === 'add' ? rawPath : (prev?.rawPath ?? rawPath)
      this.pendingIncrementalPaths.set(normalizedPath, { action: nextAction, rawPath: nextRawPath })
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
      [string, { action: 'add' | 'change'; rawPath: string }]
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
    await db.delete(filesSchema).where(inArray(filesSchema.id, idsToDelete))
    await this.searchIndex?.removeItems(existing.map((file) => file.path))
    this.logInfo('Incremental remove completed', {
      removed: existing.length
    })
  }

  private async handleIncrementalAddsOrChanges(
    entries: Array<[string, { action: 'add' | 'change'; rawPath: string }]>
  ): Promise<void> {
    if (!this.dbUtils) return
    const db = this.dbUtils.getDb()

    const recordMap = new Map<string, typeof filesSchema.$inferInsert>()
    for (const [, payload] of entries) {
      const record = await this.buildFileRecord(payload.rawPath)
      if (record) {
        recordMap.set(record.path, record)
      }
    }

    if (recordMap.size === 0) {
      return
    }

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
      const inserted = await db
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
      await this.processFileExtensions(inserted)
      await this.extractContentForFiles(inserted)
      await this.indexFilesForSearch(inserted)
      this.logInfo('Incremental index completed', {
        inserted: inserted.length
      })
    }

    if (filesToUpdate.length > 0) {
      await this._processFileUpdates(filesToUpdate)
      this.logInfo('Incremental update completed', {
        updated: filesToUpdate.length
      })
    }

    if (unchangedCount > 0) {
      this.logDebug(`Skipped ${unchangedCount} unchanged file(s) during incremental sync.`)
    }
  }

  private async buildFileRecord(rawPath: string): Promise<typeof filesSchema.$inferInsert | null> {
    try {
      const stats = await fs.stat(rawPath)
      if (!stats.isFile()) {
        return null
      }

      const name = path.basename(rawPath)
      const extension = path.extname(name).toLowerCase()
      if (!isIndexableFile(rawPath, extension, name)) {
        return null
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

    if (this.touchApp) {
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

      this.touchApp.channel
        .send(ChannelType.MAIN, 'file-index:progress', {
          stage,
          current,
          total,
          progress: total > 0 ? Math.round((current / total) * 100) : 0,
          startTime: this.indexingStartTime,
          estimatedRemainingMs,
          averageItemsPerSecond: this.indexingStats.averageItemsPerSecond
        })
        .catch((error) => {
          console.warn('[FileProvider] Failed to emit indexing progress:', error)
        })
    }
  }

  private async _initialize(): Promise<void> {
    const initStart = performance.now()
    this.logInfo('Starting index process')
    if (!this.dbUtils) return

    const db = this.dbUtils.getDb()
    const indexEnsuredStart = performance.now()
    await this.ensureKeywordIndexes(db)
    // file_index_progress 表由数据库迁移自动创建，无需手动创建
    this.logInfo('Keyword indexes ensured', {
      duration: formatDuration(performance.now() - indexEnsuredStart)
    })
    const excludePathsSet = this.databaseFilePath ? new Set([this.databaseFilePath]) : undefined

    // --- 1. Index Cleanup (FR-IX-4) ---
    const cleanupStart = performance.now()
    this.logInfo('Cleaning stale index entries from removed watch paths')
    this.emitIndexingProgress('cleanup', 0, 1)
    const allDbFilePaths = await db
      .select({ path: filesSchema.path, id: filesSchema.id })
      .from(filesSchema)
      .where(eq(filesSchema.type, 'file'))
    const filesToDelete = allDbFilePaths.filter(
      (file) => !this.WATCH_PATHS.some((watchPath) => file.path.startsWith(watchPath))
    )

    if (filesToDelete.length > 0) {
      const idsToDelete = filesToDelete.map((f) => f.id)
      this.logInfo('Removing stale database entries', {
        removed: idsToDelete.length
      })
      await db.delete(filesSchema).where(inArray(filesSchema.id, idsToDelete))
      const pathsToDelete = filesToDelete.map((f) => f.path)
      await db.delete(scanProgress).where(inArray(scanProgress.path, pathsToDelete))
      await this.searchIndex?.removeItems(pathsToDelete)
    }
    this.emitIndexingProgress('cleanup', 1, 1)
    this.logInfo('Cleanup stage finished', {
      duration: formatDuration(performance.now() - cleanupStart),
      removed: filesToDelete.length
    })

    // --- 2. Determine Scan Strategy (FR-IX-3: Resumable Indexing) ---
    const strategyStart = performance.now()
    const completedScans = await db.select().from(scanProgress)
    const completedScanPaths = new Set(completedScans.map((s) => s.path))

    const newPathsToScan = this.WATCH_PATHS.filter((p) => !completedScanPaths.has(p))
    const reconciliationPaths = this.WATCH_PATHS.filter((p) => completedScanPaths.has(p))

    // 🔍 DEBUG: 详细输出扫描策略信息
    this.logInfo('[DEBUG] File indexing scan strategy', {
      totalWatchPaths: this.WATCH_PATHS.length,
      watchPaths: JSON.stringify(this.WATCH_PATHS),
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
      this.logInfo('Starting full scan for new paths', {
        count: newPathsToScan.length,
        sample: newPathsToScan.slice(0, 3).join(', ')
      })
      this.emitIndexingProgress('scanning', 0, newPathsToScan.length)
      let scannedPaths = 0
      for (const newPath of newPathsToScan) {
        const pathScanStart = performance.now()
        this.logDebug('Scanning new path', { path: newPath })
        const diskFiles = await scanDirectory(newPath, excludePathsSet)
        this.logDebug('Directory scan completed', {
          path: newPath,
          files: diskFiles.length,
          duration: formatDuration(performance.now() - pathScanStart)
        })

        scannedPaths++
        this.emitIndexingProgress('scanning', scannedPaths, newPathsToScan.length)

        const newFileRecords = diskFiles.map((file) => ({
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.size,
          mtime: file.mtime,
          ctime: file.ctime,
          lastIndexedAt: new Date(),
          isDir: false,
          type: 'file'
        }))

        if (newFileRecords.length > 0) {
          this.logInfo('Preparing to index full-scan results', {
            path: newPath,
            files: newFileRecords.length
          })
          const chunkSize = 100
          const chunks: (typeof newFileRecords)[] = []
          for (let i = 0; i < newFileRecords.length; i += chunkSize) {
            chunks.push(newFileRecords.slice(i, i + chunkSize))
          }

          let indexedFiles = 0
          this.emitIndexingProgress('indexing', 0, newFileRecords.length)
          await runAdaptiveTaskQueue(
            chunks,
            async (chunk, chunkIndex) => {
              const chunkStart = performance.now()
              const inserted = await db
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
              this.logDebug('Full scan chunk inserted', {
                path: newPath,
                chunk: `${chunkIndex + 1}/${chunks.length}`,
                size: chunk.length,
                duration: formatDuration(performance.now() - chunkStart)
              })
              await this.processFileExtensions(inserted)
              await this.extractContentForFiles(inserted)
              await this.indexFilesForSearch(inserted)
              indexedFiles += chunk.length
              this.emitIndexingProgress('indexing', indexedFiles, newFileRecords.length)
            },
            {
              estimatedTaskTimeMs: 8,
              label: `FileProvider::fullScan(${newPath})`
            }
          )
        } else {
          this.logDebug('No indexable files discovered during full scan', {
            path: newPath
          })
        }

        await db.insert(scanProgress).values({ path: newPath, lastScanned: new Date() })
        this.logInfo('Full scan complete for path', {
          path: newPath,
          duration: formatDuration(performance.now() - pathScanStart),
          files: newFileRecords.length
        })
      }
    }

    // --- 4. Reconciliation Scan for Existing Paths (FR-IX-2) ---
    if (reconciliationPaths.length > 0) {
      const reconciliationStart = performance.now()
      this.logInfo('Starting reconciliation scan', {
        count: reconciliationPaths.length,
        sample: reconciliationPaths.slice(0, 3).join(', ')
      })
      this.emitIndexingProgress('reconciliation', 0, reconciliationPaths.length)
      const dbReadStart = performance.now()
      const dbFiles = await db.select().from(filesSchema).where(eq(filesSchema.type, 'file'))
      this.logDebug('Loaded DB file records for reconciliation', {
        count: dbFiles.length,
        duration: formatDuration(performance.now() - dbReadStart)
      })
      const dbFileMap = new Map(dbFiles.map((file) => [file.path, file]))

      const diskScanStart = performance.now()
      const diskFiles: ScannedFileInfo[] = []
      let reconciledPaths = 0
      for (const dir of reconciliationPaths) {
        diskFiles.push(...(await scanDirectory(dir, excludePathsSet)))
        reconciledPaths++
        this.emitIndexingProgress('reconciliation', reconciledPaths, reconciliationPaths.length)
      }
      this.logDebug('Disk reconciliation scan finished', {
        files: diskFiles.length,
        duration: formatDuration(performance.now() - diskScanStart)
      })
      const diskFileMap = new Map(diskFiles.map((file) => [file.path, file]))

      const filesToAdd: ScannedFileInfo[] = []
      const filesToUpdate: (typeof filesSchema.$inferSelect)[] = []

      for (const [path, diskFile] of diskFileMap.entries()) {
        const dbFile = dbFileMap.get(path)
        if (!dbFile) {
          filesToAdd.push(diskFile)
        } else if (diskFile.mtime > dbFile.mtime) {
          filesToUpdate.push({
            ...dbFile,
            name: diskFile.name,
            extension: diskFile.extension,
            size: diskFile.size,
            mtime: diskFile.mtime,
            ctime: diskFile.ctime,
            lastIndexedAt: new Date(),
            isDir: false,
            type: 'file'
          })
        }
        dbFileMap.delete(path)
      }

      const deletedFiles = Array.from(dbFileMap.values()).filter((file) =>
        reconciliationPaths.some((p) => file.path.startsWith(p))
      )
      const deletedFileIds = deletedFiles.map((file) => file.id)

      if (deletedFileIds.length > 0) {
        this.logInfo('Removing files missing from disk', {
          count: deletedFileIds.length
        })
        await db.delete(filesSchema).where(inArray(filesSchema.id, deletedFileIds))
        if (deletedFiles.length > 0) {
          await this.searchIndex?.removeItems(deletedFiles.map((file) => file.path))
        }
      }

      if (filesToUpdate.length > 0) {
        this.logInfo('Updating modified files during reconciliation', {
          count: filesToUpdate.length
        })
        await this._processFileUpdates(filesToUpdate)
      }

      if (filesToAdd.length > 0) {
        this.logInfo('Indexing new files discovered during reconciliation', {
          count: filesToAdd.length
        })
        const newFileRecords = filesToAdd.map((file) => ({
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.size,
          mtime: file.mtime,
          ctime: file.ctime,
          lastIndexedAt: new Date(),
          isDir: false,
          type: 'file'
        }))

        const chunkSize = 500
        const chunks: (typeof newFileRecords)[] = []
        for (let i = 0; i < newFileRecords.length; i += chunkSize) {
          chunks.push(newFileRecords.slice(i, i + chunkSize))
        }

        let reconciledFiles = 0
        this.emitIndexingProgress('indexing', 0, filesToAdd.length)
        await runAdaptiveTaskQueue(
          chunks,
          async (chunk, chunkIndex) => {
            const chunkStart = performance.now()
            const inserted = await db
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
            this.logDebug('Reconciliation chunk inserted', {
              chunk: `${chunkIndex + 1}/${chunks.length}`,
              size: chunk.length,
              duration: formatDuration(performance.now() - chunkStart)
            })
            await this.processFileExtensions(inserted)
            await this.extractContentForFiles(inserted)
            await this.indexFilesForSearch(inserted)
            reconciledFiles += chunk.length
            this.emitIndexingProgress('indexing', reconciledFiles, filesToAdd.length)
          },
          {
            estimatedTaskTimeMs: 6,
            label: 'FileProvider::reconciliationInsert'
          }
        )
      }

      this.logInfo('Reconciliation completed', {
        duration: formatDuration(performance.now() - reconciliationStart),
        added: filesToAdd.length,
        updated: filesToUpdate.length,
        deleted: deletedFileIds.length
      })
    }

    this.emitIndexingProgress('completed', 1, 1)
    this.logInfo('Index process complete', {
      duration: formatDuration(performance.now() - initStart)
    })
  }

  private async _processFileUpdates(
    filesToUpdate: (typeof filesSchema.$inferSelect)[],
    chunkSize = 10
  ) {
    if (!this.dbUtils) return
    const db = this.dbUtils.getDb()

    const chunks: (typeof filesSchema.$inferSelect)[][] = []
    for (let i = 0; i < filesToUpdate.length; i += chunkSize) {
      chunks.push(filesToUpdate.slice(i, i + chunkSize))
    }

    let processedCount = 0
    const logInterval = 200
    const processStart = performance.now()

    await runAdaptiveTaskQueue(
      chunks,
      async (chunk) => {
        const chunkStart = performance.now()

        const updatePromises = chunk.map((file) =>
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
        await Promise.all(updatePromises)

        await this.processFileExtensions(chunk)

        await this.extractContentForFiles(chunk)

        await this.indexFilesForSearch(chunk)

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
        estimatedTaskTimeMs: 10,
        label: 'FileProvider::processFileUpdates'
      }
    )
  }

  private async indexFilesForSearch(files: (typeof filesSchema.$inferSelect)[]): Promise<void> {
    if (!this.searchIndex) return
    if (files.length === 0) return

    const indexStart = performance.now()
    const items: SearchIndexItem[] = files.map((file) => this.buildSearchIndexItem(file))
    await this.searchIndex.indexItems(items)

    // 只在处理大量文件时输出详细日志，减少日志噪音
    if (files.length >= 50) {
      this.logDebug('Indexed files for search', {
        count: files.length,
        duration: formatDuration(performance.now() - indexStart)
      })
    }
  }

  private buildSearchIndexItem(file: typeof filesSchema.$inferSelect): SearchIndexItem {
    const extension = (file.extension || path.extname(file.name) || '').toLowerCase()
    const extensionKeywords = KEYWORD_MAP[extension] || []
    const keywords: SearchIndexKeyword[] = extensionKeywords.map((keyword) => ({
      value: keyword,
      priority: 1.05
    }))

    const tags = new Set<string>()
    if (extension) {
      tags.add(extension.replace(/^\./, ''))
    }
    for (const tag of getTypeTagsForExtension(extension)) {
      tags.add(tag)
    }

    return {
      itemId: file.path,
      providerId: this.id,
      type: this.type,
      name: file.name,
      displayName: file.displayName ?? undefined,
      path: file.path,
      extension,
      content: file.content ?? undefined,
      keywords,
      tags: tags.size > 0 ? Array.from(tags) : undefined
    }
  }

  private buildFtsQuery(terms: string[]): string {
    const tokens: string[] = []
    for (const term of terms) {
      const cleaned = term.replace(/[^a-z0-9\u4E00-\u9FA5]+/gi, ' ').trim()
      if (!cleaned) continue
      tokens.push(...cleaned.split(/\s+/))
    }

    if (tokens.length === 0) {
      return ''
    }

    const limitedTokens = tokens.slice(0, 5)
    return limitedTokens.map((token) => `${token}*`).join(' AND ')
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
                await this.ensureFileIcon(fileId, file.path, file)
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
        await this.dbUtils.addFileExtensions(extensionsToAdd)
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

    for (const row of rows) {
      const entry = cache.get(row.fileId) ?? {}
      if (row.key === 'icon') {
        entry.icon = row.value
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

    return cache
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

      this.dbUtils
        .setFileIndexProgress(fileId, {
          progress: Math.min(99, Math.round((percentage || 0) * 100)),
          processedBytes: processed,
          totalBytes: total
        })
        .catch((error) =>
          this.logError('Failed to update content progress', error, {
            fileId
          })
        )
    }
  }

  private async extractContentForFile(file: typeof filesSchema.$inferSelect): Promise<void> {
    if (!this.dbUtils) return
    if (!file.id) return

    const extension = (file.extension || path.extname(file.name) || '').toLowerCase()
    if (!CONTENT_INDEXABLE_EXTENSIONS.has(extension)) {
      await this.dbUtils.setFileIndexProgress(file.id, {
        status: 'skipped',
        progress: 100,
        processedBytes: 0,
        totalBytes: file.size ?? null,
        lastError: 'content-indexing-disabled'
      })
      this.clearContentFailure(file.id)
      return
    }

    const size = await this.ensureFileSize(file)
    const maxBytes = getContentSizeLimitMB(extension) * 1024 * 1024

    if (maxBytes && size !== null && size > maxBytes) {
      await this.dbUtils.setFileIndexProgress(file.id, {
        status: 'skipped',
        progress: 100,
        processedBytes: 0,
        totalBytes: size,
        lastError: 'file-too-large'
      })
      this.clearContentFailure(file.id)
      file.content = null
      return
    }

    if (await this.shouldSkipContentDueToFailure(file)) {
      file.content = null
      return
    }

    await this.dbUtils.setFileIndexProgress(file.id, {
      status: 'processing',
      progress: 5,
      processedBytes: 0,
      totalBytes: size ?? null,
      startedAt: new Date(),
      lastError: null
    })
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
      await this.dbUtils.setFileIndexProgress(file.id, {
        status: 'failed',
        progress: 100,
        processedBytes: 0,
        totalBytes: size ?? null,
        lastError: error instanceof Error ? error.message : 'parser-error'
      })
      this.recordContentFailure(file.id, error instanceof Error ? error.message : 'parser-error')
      file.content = null
      return
    }

    if (!result) {
      await this.dbUtils.setFileIndexProgress(file.id, {
        status: 'skipped',
        progress: 100,
        processedBytes: 0,
        totalBytes: size ?? null,
        lastError: 'parser-not-found'
      })
      this.clearContentFailure(file.id)
      file.content = null
      return
    }

    await this.handleParserResult(file, result, size, performance.now() - parseStart)
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

      await db
        .update(filesSchema)
        .set({
          content: trimmedContent,
          embeddingStatus:
            result.embeddings && result.embeddings.length > 0 ? 'completed' : 'pending'
        })
        .where(eq(filesSchema.id, fileId))

      file.content = trimmedContent

      if (result.embeddings && result.embeddings.length > 0) {
        // TODO: hook into embeddings table when vector storage is ready
        this.logDebug('Parser returned embeddings for file', {
          path: file.path,
          embeddings: result.embeddings.length
        })
      }

      await this.dbUtils.setFileIndexProgress(fileId, {
        status: 'completed',
        progress: 100,
        processedBytes,
        totalBytes,
        lastError: null,
        updatedAt: new Date()
      })
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
      await this.dbUtils.setFileIndexProgress(fileId, {
        status: 'skipped',
        ...progressPayload
      })
      this.clearContentFailure(fileId)
      file.content = null
      return
    }

    await this.dbUtils.setFileIndexProgress(fileId, {
      status: 'failed',
      ...progressPayload
    })
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
        await this.dbUtils
          .getDb()
          .update(filesSchema)
          .set({ size: stats.size })
          .where(eq(filesSchema.id, file.id))
      }
      return stats.size
    } catch (error) {
      this.logError('Failed to stat file size', error, {
        path: file.path
      })
      return null
    }
  }

  private extractSearchFilters(rawText: string): { text: string; typeFilters: Set<FileTypeTag> } {
    const tokens = rawText.split(/\s+/).filter(Boolean)
    const retained: string[] = []
    const typeFilters = new Set<FileTypeTag>()

    for (const token of tokens) {
      const trimmed = token.trim()
      if (!trimmed) continue
      const normalized = trimmed.toLowerCase()

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

    return { text: retained.join(' ').trim(), typeFilters }
  }

  private resolveTypeTag(raw: string): FileTypeTag | null {
    if (!raw) return null
    const normalized = raw.toLowerCase()
    if (TYPE_ALIAS_MAP[normalized]) {
      return TYPE_ALIAS_MAP[normalized]
    }

    if (normalized.endsWith('s')) {
      const singular = normalized.replace(/s$/i, '')
      if (TYPE_ALIAS_MAP[singular]) {
        return TYPE_ALIAS_MAP[singular]
      }
    }

    if (normalized.endsWith('es')) {
      const singular = normalized.replace(/es$/i, '')
      if (TYPE_ALIAS_MAP[singular]) {
        return TYPE_ALIAS_MAP[singular]
      }
    }

    return null
  }

  private resolveExtensionsForTypeFilters(typeFilters: Set<FileTypeTag>): string[] {
    const extensions = new Set<string>()
    for (const tag of typeFilters) {
      const mapped = TYPE_TAG_EXTENSION_MAP[tag]
      if (!mapped) continue
      for (const ext of mapped) {
        extensions.add(ext)
      }
    }
    return Array.from(extensions)
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
      const tuffItem = mapFileToTuffItem(file, extensions, this.id, this.name, (file) => {
        if (typeof file.id === 'number') {
          this.ensureFileIcon(file.id, file.path, file).catch((error) => {
            this.logWarn('Failed to lazy load icon', error, { path: file.path })
          })
        }
      })
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
    const { text: searchText, typeFilters } = this.extractSearchFilters(rawText)
    searchLogger.fileSearchText(searchText, typeFilters.size)

    const logTerms = searchText
      .toLowerCase()
      .split(/[\s/]+/)
      .filter(Boolean)
    searchLogger.logKeywordAnalysis(searchText, logTerms, typeFilters.size)

    if (!searchText && typeFilters.size === 0) {
      return new TuffSearchResultBuilder(query).build()
    }

    if (!searchText && typeFilters.size > 0) {
      return this.buildTypeOnlySearchResult(query, typeFilters)
    }

    const db = this.dbUtils.getDb()
    const normalizedQuery = searchText.toLowerCase()
    const baseTerms = normalizedQuery.split(/[\s/]+/).filter(Boolean)
    const terms = baseTerms.length > 0 ? baseTerms : [normalizedQuery]

    let preciseMatchPaths: Set<string> | null = null
    if (terms.length > 0) {
      searchLogger.filePreciseSearch(terms)
      const preciseStart = performance.now()
      const preciseSearchLimit = 200
      const preciseQueries = terms.map((term) =>
        db
          .select({ itemId: keywordMappings.itemId })
          .from(keywordMappings)
          .where(and(eq(keywordMappings.keyword, term), eq(keywordMappings.providerId, this.id)))
          .limit(preciseSearchLimit)
      )
      searchLogger.filePreciseQueries(preciseQueries.length)
      const preciseResults = await Promise.all(preciseQueries)
      const termMatches = preciseResults.map((rows) => new Set(rows.map((entry) => entry.itemId)))
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
    }

    const shouldCheckPhrase = baseTerms.length > 1 || baseTerms.length === 0
    if (shouldCheckPhrase) {
      const phraseStart = performance.now()
      const phraseMatches = await db
        .select({ itemId: keywordMappings.itemId })
        .from(keywordMappings)
        .where(
          and(eq(keywordMappings.keyword, normalizedQuery), eq(keywordMappings.providerId, this.id))
        )
        .limit(200)
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
      await this.searchIndex.removeItems(staleIds)
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
        return this.buildTypeOnlySearchResult(query, typeFilters)
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

        const typeScore = typeFilters.size > 0 ? 1 : 0

        const finalScore =
          weights.keyword * keywordScore +
          weights.fts * ftsScore +
          weights.lastUsed * lastUsedScore +
          weights.frequency * frequencyScore +
          weights.lastModified * lastModifiedScore +
          (typeFilters.size > 0 ? 0.15 * typeScore : 0)

        const tuffItem = mapFileToTuffItem(file, extensions, this.id, this.name, (file) => {
          if (typeof file.id === 'number') {
            this.ensureFileIcon(file.id, file.path, file).catch((error) => {
              this.logWarn('Failed to lazy load icon', error, { path: file.path })
            })
          }
        })
        const matchScore = Math.max(keywordScore, ftsScore)
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
            ftsScore
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
    } catch (err: any) {
      if (err.code === 'ENOENT') {
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
