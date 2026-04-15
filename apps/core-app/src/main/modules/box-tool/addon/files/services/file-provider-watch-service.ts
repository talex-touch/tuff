import type { FileChangedEvent, FileUnlinkedEvent } from '../../../../../core/eventbus/touch-event'
import type { ITouchEvent } from '@talex-touch/utils'
import path from 'node:path'
import type { FileIndexBatteryStatus } from '@talex-touch/utils/transport/events/types'
import { StorageList } from '@talex-touch/utils'
import { appTaskGate } from '../../../../../service/app-task-gate'
import {
  AppUsageActivityTracker,
  BackgroundTaskService
} from '../../../../../service/background-task-service'
import { deviceIdleService } from '../../../../../service/device-idle-service'
import { createFailedFilesCleanupTask } from '../../../../../service/failed-files-cleanup-task'
import type { DbUtils } from '../../../../../db/utils'
import { formatDuration } from '../../../../../utils/logger'
import { getMainConfig, saveMainConfig } from '../../../../storage'
import FileSystemWatcher from '../../../file-system-watcher'
import { isSearchRecentlyActive } from '../../../search-engine/search-activity'
import type { FileIndexSettings } from '../types'

const DEFAULT_FILE_INDEX_SETTINGS: FileIndexSettings = {
  autoScanEnabled: true,
  autoScanIntervalMs: 24 * 60 * 60 * 1000,
  autoScanIdleThresholdMs: 60 * 60 * 1000,
  autoScanCheckIntervalMs: 5 * 60 * 1000,
  extraPaths: []
}

export interface FileProviderWatchServiceDeps {
  baseWatchPaths: string[]
  isCaseInsensitiveFs: boolean
  getDbUtils: () => DbUtils | null
  getWatchDepthForPath: (watchPath: string) => number
  normalizePath: (rawPath: string) => string
  enqueueIncrementalUpdate: (
    rawPath: string,
    action: 'add' | 'change' | 'delete',
    manual?: boolean
  ) => void
  runAutoIndexing: () => Promise<void>
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  logError: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

export class FileProviderWatchService {
  private readonly baseWatchPaths: string[]
  private readonly isCaseInsensitiveFs: boolean
  private readonly getDbUtils: FileProviderWatchServiceDeps['getDbUtils']
  private readonly getWatchDepthForPath: FileProviderWatchServiceDeps['getWatchDepthForPath']
  private readonly normalizePath: FileProviderWatchServiceDeps['normalizePath']
  private readonly enqueueIncrementalUpdate: FileProviderWatchServiceDeps['enqueueIncrementalUpdate']
  private readonly runAutoIndexing: FileProviderWatchServiceDeps['runAutoIndexing']
  private readonly logDebug: FileProviderWatchServiceDeps['logDebug']
  private readonly logWarn: FileProviderWatchServiceDeps['logWarn']
  private readonly logError: FileProviderWatchServiceDeps['logError']

  private watchPaths: string[]
  private normalizedWatchPaths: string[]
  private backgroundTaskService: BackgroundTaskService | null = null
  private activityTracker: AppUsageActivityTracker | null = null
  private autoIndexTaskRegistered = false
  private fsEventsSubscribed = false
  private watchPathsRegistered = false
  private fileIndexSettings: FileIndexSettings = { ...DEFAULT_FILE_INDEX_SETTINGS }

  readonly handleFsAddedOrChanged = (event: ITouchEvent) => {
    const fileEvent = event as FileChangedEvent & { filePath?: string }
    if (!fileEvent?.filePath) return
    this.enqueueIncrementalUpdate(fileEvent.filePath, 'change')
  }

  readonly handleFsUnlinked = (event: ITouchEvent) => {
    const fileEvent = event as FileUnlinkedEvent & { filePath?: string }
    if (!fileEvent?.filePath) return
    this.enqueueIncrementalUpdate(fileEvent.filePath, 'delete')
  }

  constructor(deps: FileProviderWatchServiceDeps) {
    this.baseWatchPaths = [...deps.baseWatchPaths]
    this.isCaseInsensitiveFs = deps.isCaseInsensitiveFs
    this.getDbUtils = deps.getDbUtils
    this.getWatchDepthForPath = deps.getWatchDepthForPath
    this.normalizePath = deps.normalizePath
    this.enqueueIncrementalUpdate = deps.enqueueIncrementalUpdate
    this.runAutoIndexing = deps.runAutoIndexing
    this.logDebug = deps.logDebug
    this.logWarn = deps.logWarn
    this.logError = deps.logError
    this.watchPaths = [...deps.baseWatchPaths]
    this.normalizedWatchPaths = deps.baseWatchPaths.map((p) => deps.normalizePath(p))
  }

  getCurrentSettings(): FileIndexSettings {
    return this.fileIndexSettings
  }

  getWatchPaths(): string[] {
    return [...this.watchPaths]
  }

  getNormalizedWatchPaths(): string[] {
    return [...this.normalizedWatchPaths]
  }

  isWatchPathRegistered(): boolean {
    return this.watchPathsRegistered
  }

  markWatchPathsRegistered(value: boolean): void {
    this.watchPathsRegistered = value
  }

  isFileSystemSubscribed(): boolean {
    return this.fsEventsSubscribed
  }

  markFileSystemSubscribed(value: boolean): void {
    this.fsEventsSubscribed = value
  }

  recordUserActivity(): void {
    this.backgroundTaskService?.recordActivity()
  }

  normalizeFileIndexSettings(raw?: Partial<FileIndexSettings> | null): FileIndexSettings {
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

  applyWatchPaths(extraPaths: string[]): void {
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

  loadFileIndexSettings(): void {
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

  initializeBackgroundTaskService(): void {
    const dbUtils = this.getDbUtils()
    if (!dbUtils) {
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

    const cleanupTask = createFailedFilesCleanupTask(dbUtils.getDb() as any, {
      maxRetryAge: 24 * 60 * 60 * 1000,
      batchSize: 100,
      maxRetries: 3
    })

    this.backgroundTaskService.registerTask(cleanupTask)

    if (!this.autoIndexTaskRegistered) {
      this.backgroundTaskService.registerTask({
        id: 'file-index.auto-scan',
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

  async getScanEligibility(): Promise<{
    newPaths: string[]
    stalePaths: string[]
    lastScannedAt: number | null
  }> {
    const dbUtils = this.getDbUtils()
    if (!dbUtils) {
      return { newPaths: [], stalePaths: [], lastScannedAt: null }
    }

    const db = dbUtils.getDb() as any
    const completedScans = await db.select().from('scan_progress')
    const completedMap = new Map<string, number>()
    let lastScannedAt: number | null = null

    for (const scan of completedScans) {
      const timestamp = typeof scan?.lastScanned === 'string' ? Date.parse(scan.lastScanned) : null
      if (timestamp && Number.isFinite(timestamp)) {
        completedMap.set(scan.path, timestamp)
        if (!lastScannedAt || timestamp > lastScannedAt) {
          lastScannedAt = timestamp
        }
      }
    }

    const newPaths = this.watchPaths.filter((watchPath) => !completedMap.has(watchPath))
    const intervalMs = this.fileIndexSettings.autoScanIntervalMs
    const now = Date.now()
    const stalePaths =
      intervalMs <= 0
        ? Array.from(completedMap.keys()).filter((watchPath) => this.watchPaths.includes(watchPath))
        : this.watchPaths.filter((watchPath) => {
            const last = completedMap.get(watchPath)
            if (!last) return false
            return now - last >= intervalMs
          })

    return { newPaths, stalePaths, lastScannedAt }
  }

  async shouldRunAutoIndexing(input: {
    isInitializing: boolean
    hasInitializationContext: boolean
  }): Promise<{
    allowed: boolean
    reason?: string
    battery?: FileIndexBatteryStatus | null
  }> {
    if (!this.fileIndexSettings.autoScanEnabled) {
      return { allowed: false, reason: 'disabled' }
    }

    if (input.isInitializing) {
      return { allowed: false, reason: 'initializing' }
    }

    if (!this.getDbUtils() || !input.hasInitializationContext) {
      return { allowed: false, reason: 'missing-context' }
    }

    if (this.watchPaths.length === 0) {
      return { allowed: false, reason: 'no-paths' }
    }

    if (appTaskGate.isActive()) {
      return { allowed: false, reason: 'app-busy' }
    }

    if (isSearchRecentlyActive(2000)) {
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

  async ensureFileSystemWatchers(input: {
    subscribeToFileSystemEvents: () => void
  }): Promise<void> {
    if (this.watchPathsRegistered) {
      if (!this.fsEventsSubscribed) {
        input.subscribeToFileSystemEvents()
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
    input.subscribeToFileSystemEvents()
  }
}
