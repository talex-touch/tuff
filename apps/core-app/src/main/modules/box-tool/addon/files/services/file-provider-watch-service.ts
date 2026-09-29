import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import path from 'node:path'
import type { FileIndexBatteryStatus } from '@talex-touch/utils/transport/events/types'
import { StorageList } from '@talex-touch/utils'
import { normalizeFsPath } from '@talex-touch/utils/common/file-scan-utils'
import { appTaskGate } from '../../../../../service/app-task-gate'
import {
  AppUsageActivityTracker,
  BackgroundTaskService
} from '../../../../../service/background-task-service'
import { deviceIdleService } from '../../../../../service/device-idle-service'
import { createFailedFilesCleanupTask } from '../../../../../service/failed-files-cleanup-task'
import type * as schema from '../../../../../db/schema'
import type { DbUtils } from '../../../../../db/utils'
import { formatDuration } from '../../../../../utils/logger'
import { getMainConfig, saveMainConfig, saveMainConfigDurable } from '../../../../storage'
import FileSystemWatcher from '../../../file-system-watcher'
import { isSearchRecentlyActive } from '../../../search-engine/search-activity'
import { DEFAULT_FILE_INDEX_SETTINGS, type FileIndexSettings } from '../types'
import {
  filterIndexedWatchPendingPermissionPaths,
  isIndexedWatchPathOwned,
  resolveIndexedAutoScanPreflight,
  resolveIndexedScanEligibility,
  resolveIndexedWatchRootSet,
  toIndexedScanTimestamp
} from '@talex-touch/utils/search'
import { sql } from 'drizzle-orm'
import { resolveScanProgressSchemaShape } from '../../../search-engine/scan-progress-schema'

/** How long after boot the first scan check runs — a check, not a forced scan. */
const STARTUP_SCAN_CHECK_DELAY_MS = 2_500

export interface FileProviderWatchServiceDeps {
  baseWatchPaths: string[]
  getDbUtils: () => DbUtils | null
  getWatchDepthForPath: (watchPath: string) => number
  normalizePath: (rawPath: string) => string
  runAutoIndexing: () => Promise<boolean>
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  logError: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  /** See FileProviderScanProgressServiceDeps — resolved per call, never captured. */
  isSearchSplitEnabled?: () => boolean
  /** Worker-forwarded write path for the split topology (sole writer of search-index.db). */
  execSearchIndexWrite?: (
    statements: Array<{ sql: string; args: unknown[] }>,
    mode?: 'single' | 'transaction'
  ) => Promise<unknown>
}

export class FileProviderWatchService {
  private readonly baseWatchPaths: string[]
  private readonly getDbUtils: FileProviderWatchServiceDeps['getDbUtils']
  private readonly getWatchDepthForPath: FileProviderWatchServiceDeps['getWatchDepthForPath']
  private readonly normalizePath: FileProviderWatchServiceDeps['normalizePath']
  private readonly runAutoIndexing: FileProviderWatchServiceDeps['runAutoIndexing']
  private readonly logDebug: FileProviderWatchServiceDeps['logDebug']
  private readonly logWarn: FileProviderWatchServiceDeps['logWarn']
  private readonly logError: FileProviderWatchServiceDeps['logError']

  private readonly isSearchSplitEnabled: NonNullable<
    FileProviderWatchServiceDeps['isSearchSplitEnabled']
  >
  private readonly execSearchIndexWrite: FileProviderWatchServiceDeps['execSearchIndexWrite']

  private watchPaths: string[]
  private normalizedWatchPaths: string[]
  private backgroundTaskService: BackgroundTaskService | null = null
  private activityTracker: AppUsageActivityTracker | null = null
  private autoIndexTaskRegistered = false
  private fsEventsSubscribed = false
  private watchPathsRegistered = false
  /**
   * The boot check. Files created while the app was offline are covered by the same eligibility
   * rules as any other run — an unseen or stale root — so boot never forces a scan on its own.
   */
  private startupScanTimer: NodeJS.Timeout | null = null
  private fileIndexSettings: FileIndexSettings = { ...DEFAULT_FILE_INDEX_SETTINGS }

  constructor(deps: FileProviderWatchServiceDeps) {
    this.baseWatchPaths = [...deps.baseWatchPaths]
    this.getDbUtils = deps.getDbUtils
    this.getWatchDepthForPath = deps.getWatchDepthForPath
    this.normalizePath = deps.normalizePath
    this.runAutoIndexing = deps.runAutoIndexing
    this.logDebug = deps.logDebug
    this.logWarn = deps.logWarn
    this.logError = deps.logError
    this.isSearchSplitEnabled = deps.isSearchSplitEnabled ?? (() => false)
    this.execSearchIndexWrite = deps.execSearchIndexWrite
    const rootSet = resolveIndexedWatchRootSet({
      basePaths: deps.baseWatchPaths,
      normalizePath: deps.normalizePath
    })
    this.watchPaths = rootSet.paths
    this.normalizedWatchPaths = rootSet.normalizedPaths
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

  getPendingPermissionPaths(): string[] {
    const pendingPaths =
      typeof FileSystemWatcher.getPendingPaths === 'function'
        ? FileSystemWatcher.getPendingPaths()
        : []
    return filterIndexedWatchPendingPermissionPaths({
      pendingPaths,
      normalizedWatchPaths: this.normalizedWatchPaths,
      normalizePath: this.normalizePath
    })
  }

  ownsWatchPath(rawPath: string): boolean {
    return isIndexedWatchPathOwned({
      rawPath,
      normalizedWatchPaths: this.normalizedWatchPaths,
      normalizePath: this.normalizePath,
      pathSeparator: path.sep
    })
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

    const hasStoredSettings = Object.keys(data).length > 0
    const rawExtraPaths = Array.isArray(data.extraPaths)
      ? data.extraPaths.filter((value): value is string => typeof value === 'string')
      : []
    const normalizedExtraPaths: string[] = []
    const extraPathSet = new Set<string>()

    for (const rawPath of rawExtraPaths) {
      const trimmed = rawPath.trim()
      if (!trimmed) continue
      // Configured-path ingress: an extra path persisted in NFD would produce
      // NFD scan roots and NFD index ids (see normalizeFsPath).
      const resolved = normalizeFsPath(path.resolve(trimmed))
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
      contentIndexingEnabled:
        typeof data.contentIndexingEnabled === 'boolean'
          ? data.contentIndexingEnabled
          : DEFAULT_FILE_INDEX_SETTINGS.contentIndexingEnabled,
      contentIndexCleanupVersion:
        typeof data.contentIndexCleanupVersion === 'number' &&
        Number.isInteger(data.contentIndexCleanupVersion) &&
        data.contentIndexCleanupVersion >= 0
          ? data.contentIndexCleanupVersion
          : hasStoredSettings
            ? 0
            : DEFAULT_FILE_INDEX_SETTINGS.contentIndexCleanupVersion,
      extraPaths: normalizedExtraPaths
    }
  }

  applyWatchPaths(extraPaths: string[]): void {
    const rootSet = resolveIndexedWatchRootSet({
      basePaths: this.baseWatchPaths,
      extraPaths,
      normalizePath: this.normalizePath
    })
    this.watchPaths = rootSet.paths
    this.normalizedWatchPaths = rootSet.normalizedPaths
  }

  loadFileIndexSettings(): void {
    try {
      const raw = getMainConfig(StorageList.FILE_INDEX_SETTINGS) as
        | Partial<FileIndexSettings>
        | undefined
      this.fileIndexSettings = this.normalizeFileIndexSettings(raw)
      this.applyWatchPaths(this.fileIndexSettings.extraPaths)

      if (
        !raw ||
        Object.keys(raw).length === 0 ||
        typeof raw.contentIndexingEnabled !== 'boolean' ||
        typeof raw.contentIndexCleanupVersion !== 'number'
      ) {
        saveMainConfig(StorageList.FILE_INDEX_SETTINGS, this.fileIndexSettings)
      }
    } catch (error) {
      this.fileIndexSettings = { ...DEFAULT_FILE_INDEX_SETTINGS }
      this.applyWatchPaths(this.fileIndexSettings.extraPaths)
      this.logWarn('Failed to load file index settings, using defaults', error)
    }
  }

  async updateFileIndexSettings(patch: Partial<FileIndexSettings>): Promise<FileIndexSettings> {
    const next = this.normalizeFileIndexSettings({ ...this.fileIndexSettings, ...patch })
    const result = await saveMainConfigDurable(StorageList.FILE_INDEX_SETTINGS, next)
    if (!result.success) throw new Error('FILE_INDEX_SETTINGS_PERSIST_FAILED')
    this.fileIndexSettings = next
    this.applyWatchPaths(next.extraPaths)
    return next
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

    // Per-call resolution (never constructor capture): the task must follow
    // the live split topology — file_index_progress rows sit in the
    // worker-owned search file when the split is on, and their deletes are
    // forwarded to the worker instead of running on a main-thread connection.
    const cleanupTask = createFailedFilesCleanupTask(
      {
        getReadDb: () =>
          (this.getDbUtils()?.getFileIndexReadDb() as LibSQLDatabase<typeof schema>) ?? null,
        getPrimaryDb: () => (this.getDbUtils()?.getDb() as LibSQLDatabase<typeof schema>) ?? null,
        isSearchSplitEnabled: () => this.isSearchSplitEnabled(),
        execSearchIndexWrite: this.execSearchIndexWrite
      },
      {
        maxRetryAge: 24 * 60 * 60 * 1000,
        batchSize: 100,
        maxRetries: 3
      }
    )

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

    if (!this.startupScanTimer) {
      this.startupScanTimer = setTimeout(() => {
        this.startupScanTimer = null
        void this.runAutoIndexing().catch((error) => {
          this.logWarn('Startup file scan check failed', error)
        })
      }, STARTUP_SCAN_CHECK_DELAY_MS)
      this.startupScanTimer.unref()
    }

    this.logDebug('Background task service initialized')
  }
  dispose(): void {
    if (this.startupScanTimer) {
      clearTimeout(this.startupScanTimer)
      this.startupScanTimer = null
    }
  }

  async getScanEligibility(): Promise<{
    newPaths: string[]
    stalePaths: string[]
    lastScannedAt: number | null
    /** Any progress row in scope — the root's own or one of its checkpointed children. */
    hasScanEvidence: boolean
  }> {
    const dbUtils = this.getDbUtils()
    if (!dbUtils) {
      return { newPaths: [], stalePaths: [], lastScannedAt: null, hasScanEvidence: false }
    }

    // Eligibility must read the home the worker writes scan_progress into
    // (search-index.db when the split is on). Reading the primary here let
    // stale pre-split rows mark every root "recently scanned", so
    // shouldRunAutoIndexing never allowed a scan and the empty search file was
    // never populated (V1 ship-blocker #3). Split off → same handle as before.
    const db = dbUtils.getFileIndexReadDb()
    const shape = await resolveScanProgressSchemaShape(db)
    const progressRows = shape.sourceScoped
      ? await db.all<{ path: string; lastScanned: unknown }>(sql`
          SELECT path, last_scanned AS lastScanned
          FROM scan_progress
          WHERE source_id = ${'file-provider'}
        `)
      : await db.all<{ path: string; lastScanned: unknown }>(sql`
          SELECT path, last_scanned AS lastScanned
          FROM scan_progress
        `)
    const evidence = this.resolveScanProgressEvidence(progressRows)
    const eligibility = resolveIndexedScanEligibility({
      watchPaths: this.watchPaths,
      completedScans: evidence.completedScans,
      intervalMs: this.fileIndexSettings.autoScanIntervalMs,
      normalizePath: this.normalizePath
    })

    return {
      ...eligibility,
      lastScannedAt: evidence.lastScannedAt ?? eligibility.lastScannedAt,
      hasScanEvidence: evidence.hasScanEvidence
    }
  }

  /**
   * Child rows are resumable checkpoints, not proof that their owning root finished. They count as
   * scan evidence (so a restart still obeys the idle gate) and update the observed timestamp, while
   * only an exact root row closes that root's eligibility. The next scan then resumes past the
   * completed children instead of suppressing the incomplete root for a full auto-scan interval.
   */
  private resolveScanProgressEvidence(
    rows: ReadonlyArray<{ path: string; lastScanned: unknown }>
  ): {
    completedScans: Array<{ path: string; lastScanned: unknown }>
    lastScannedAt: number | null
    hasScanEvidence: boolean
  } {
    const completedScans: Array<{ path: string; lastScanned: unknown }> = []
    let lastScannedAt: number | null = null
    for (const row of rows) {
      const root = this.resolveOwningWatchRoot(row.path)
      if (!root) continue
      const timestamp = toIndexedScanTimestamp(row.lastScanned)
      if (timestamp === null) continue
      lastScannedAt = lastScannedAt === null ? timestamp : Math.max(lastScannedAt, timestamp)
      if (this.normalizePath(row.path) !== this.normalizePath(root)) continue
      completedScans.push({ path: root, lastScanned: row.lastScanned })
    }
    return {
      completedScans,
      lastScannedAt,
      hasScanEvidence: lastScannedAt !== null
    }
  }

  /** The most specific watch root containing `rawPath`, or null when no root owns it. */
  private resolveOwningWatchRoot(rawPath: string): string | null {
    let owner: string | null = null
    let ownerLength = -1
    for (const root of this.watchPaths) {
      const normalizedRoot = this.normalizePath(root)
      const owned = isIndexedWatchPathOwned({
        rawPath,
        normalizedWatchPaths: [normalizedRoot],
        normalizePath: this.normalizePath,
        pathSeparator: path.sep
      })
      if (!owned || normalizedRoot.length <= ownerLength) continue
      owner = root
      ownerLength = normalizedRoot.length
    }
    return owner
  }

  async shouldRunAutoIndexing(input: {
    isInitializing: boolean
    hasInitializationContext: boolean
  }): Promise<{
    allowed: boolean
    reason?: string
    battery?: FileIndexBatteryStatus | null
  }> {
    const dbUtils = this.getDbUtils()
    const basePreflightInput = {
      autoScanEnabled: this.fileIndexSettings.autoScanEnabled,
      isInitializing: input.isInitializing,
      hasDbContext: Boolean(dbUtils),
      hasInitializationContext: input.hasInitializationContext,
      watchPathCount: this.watchPaths.length,
      appBusy: appTaskGate.isActive(),
      searchActive: isSearchRecentlyActive(2000)
    }
    const earlyPreflight = resolveIndexedAutoScanPreflight(basePreflightInput)
    if (!earlyPreflight.allowed) {
      return earlyPreflight
    }

    const eligibility = await this.getScanEligibility()
    const preflight = resolveIndexedAutoScanPreflight({
      ...basePreflightInput,
      hasEligiblePaths: eligibility.newPaths.length > 0 || eligibility.stalePaths.length > 0
    })

    if (!preflight.allowed) {
      return preflight
    }

    const decision = await deviceIdleService.canRun({
      // No progress at all means there is nothing to search until one scan finishes, so that very
      // first run may start straight away. Every later run — the check right after boot included —
      // waits for the idle window, so restarting the app can no longer start a full walk by itself.
      idleThresholdMs: eligibility.hasScanEvidence
        ? this.fileIndexSettings.autoScanIdleThresholdMs
        : 0
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
        this.fsEventsSubscribed = true
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
    this.fsEventsSubscribed = true
  }
}
