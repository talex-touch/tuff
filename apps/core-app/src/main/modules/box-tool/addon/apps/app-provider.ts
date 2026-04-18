import type { TimingLogLevel, TimingMeta, TimingOptions } from '@talex-touch/utils'
import type {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils/core-box'
import type {
  SearchIndexItem,
  SearchIndexKeyword,
  SearchIndexService
} from '../../search-engine/search-index-service'
import type { ProviderContext } from '../../search-engine/types'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import type { AppIndexAddPathResult } from '@talex-touch/utils/transport/events/types'
import {
  completeTiming,
  createRetrier,
  sleep,
  startTiming,
  StorageList,
  timingLogger
} from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { runAdaptiveTaskQueue } from '@talex-touch/utils/common/utils'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import { spawnSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { TuffInputType, TuffSearchResultBuilder } from '@talex-touch/utils/core-box'
import chalk from 'chalk'
import { and, eq, inArray, or, sql } from 'drizzle-orm'

import { app, BrowserWindow, shell } from 'electron'
import {
  DirectoryAddedEvent,
  DirectoryUnlinkedEvent,
  FileAddedEvent,
  FileChangedEvent,
  FileUnlinkedEvent,
  TalexEvents,
  touchEventBus
} from '../../../../core/eventbus/touch-event'
import {
  config as configSchema,
  fileExtensions,
  files as filesSchema,
  keywordMappings
} from '../../../../db/schema'
import { dbWriteScheduler } from '../../../../db/db-write-scheduler'
import { withSqliteRetry } from '../../../../db/sqlite-retry'

import { createDbUtils } from '../../../../db/utils'
import { appTaskGate } from '../../../../service/app-task-gate'
import { deviceIdleService } from '../../../../service/device-idle-service'
import { getMainConfig, saveMainConfig } from '../../../storage'
import FileSystemWatcher from '../../file-system-watcher'
import searchEngineCore from '../../search-engine/search-core'
import { appScanner } from './app-scanner'
import { normalizeDisplayName, shouldUpdateDisplayName } from './display-name-sync-utils'
import { matchNoisySystemAppRule } from './app-noise-filter'
import { formatLog, LogStyle } from './app-utils'
import { processSearchResults } from './search-processing-service'
import type { AppLaunchKind, ScannedAppInfo } from './app-types'

const SLOW_SEARCH_THRESHOLD_MS = 400
const appProviderLog = getLogger('app-provider')
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

type AppTimingMeta = TimingMeta & {
  label?: string
  message?: string
  unit?: 'ms' | 's'
  precision?: number
  style?: keyof typeof LogStyle
  suffix?: string
  stage?: string
}

const APP_TIMING_STYLE_BY_LEVEL: Record<TimingLogLevel, keyof typeof LogStyle> = {
  none: 'info',
  info: 'info',
  warn: 'warning',
  error: 'error'
}

const APP_TIMING_BASE_OPTIONS: TimingOptions = {
  storeHistory: false,
  logThresholds: {
    none: 200,
    info: 1000,
    warn: 3000
  },
  formatter: (entry) => {
    const meta = (entry.meta ?? {}) as AppTimingMeta
    const stageLabel =
      typeof meta.label === 'string'
        ? meta.label
        : typeof meta.stage === 'string'
          ? meta.stage
          : entry.label.split(':').slice(1).join(':') || entry.label
    const message = typeof meta.message === 'string' ? meta.message : `${stageLabel}`
    const unit = meta.unit ?? (entry.durationMs >= 1000 ? 's' : 'ms')
    const precision = meta.precision ?? (unit === 's' ? 2 : 0)
    const value =
      unit === 's'
        ? `${(entry.durationMs / 1000).toFixed(precision)}s`
        : `${entry.durationMs.toFixed(precision)}ms`
    const durationText = chalk.cyan(value)
    const suffix = typeof meta.suffix === 'string' ? ` ${meta.suffix}` : ''
    const styleKey =
      (meta.style as keyof typeof LogStyle | undefined) ??
      APP_TIMING_STYLE_BY_LEVEL[entry.logLevel ?? 'info']
    const styleFn = LogStyle[styleKey] ?? LogStyle.info
    return formatLog('AppProvider', `${message} in ${durationText}${suffix}`, styleFn)
  }
}

type DbAppRecord = typeof filesSchema.$inferSelect
type DbAppWithExtensions = DbAppRecord & { extensions: Record<string, string | null> }
type FileExtensionInsert = { fileId: number; key: string; value: string }
type FileSystemPathEvent =
  | FileAddedEvent
  | FileChangedEvent
  | FileUnlinkedEvent
  | DirectoryAddedEvent
  | DirectoryUnlinkedEvent

function logApp(
  message: string,
  style: (message: string) => string = LogStyle.info,
  meta?: Record<string, unknown>
): void {
  const logArgs = meta ? [meta] : []
  if (style === LogStyle.error) {
    appProviderLog.error(message, ...logArgs)
    return
  }
  if (style === LogStyle.warning) {
    appProviderLog.warn(message, ...logArgs)
    return
  }
  if (style === LogStyle.process) {
    appProviderLog.debug(message, ...logArgs)
    return
  }
  appProviderLog.info(message, ...logArgs)
}

function resolveAppTimingOptions(overrides?: TimingOptions): TimingOptions {
  if (!overrides) return APP_TIMING_BASE_OPTIONS

  return {
    ...APP_TIMING_BASE_OPTIONS,
    ...overrides,
    logThresholds: {
      ...(APP_TIMING_BASE_OPTIONS.logThresholds ?? {}),
      ...(overrides.logThresholds ?? {})
    },
    formatter: overrides.formatter ?? APP_TIMING_BASE_OPTIONS.formatter,
    logger: overrides.logger ?? APP_TIMING_BASE_OPTIONS.logger
  }
}

function logAppDuration(
  stage: string,
  startedAt: number,
  meta: AppTimingMeta = {},
  overrides?: TimingOptions
): number {
  return completeTiming(
    `AppProvider:${stage}`,
    startedAt,
    { ...meta, stage },
    resolveAppTimingOptions(overrides)
  )
}

function logAppDurationMs(
  stage: string,
  durationMs: number,
  meta: AppTimingMeta = {},
  overrides?: TimingOptions
): number {
  return timingLogger.print(
    `AppProvider:${stage}`,
    durationMs,
    { ...meta, stage },
    resolveAppTimingOptions(overrides)
  )
}

function isSqliteBusyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, rawCode, message } = error as {
    code?: string
    rawCode?: number
    message?: string
  }
  if (code === 'SQLITE_BUSY' || rawCode === 5) return true
  return typeof message === 'string' && message.includes('SQLITE_BUSY')
}

const sqliteBusyRetrier = createRetrier({
  maxRetries: 3,
  timeoutMs: 2000,
  shouldRetry: (error) => isSqliteBusyError(error),
  onRetry: (attempt) =>
    logApp(
      `SQLITE_BUSY encountered while updating app display name, retrying attempt ${attempt + 1}`,
      LogStyle.warning
    )
})

function runWithSqliteBusyRetry<T>(operation: () => Promise<T>): Promise<T> {
  const wrapped = sqliteBusyRetrier(operation)
  return wrapped() as Promise<T>
}

const MISSING_ICON_CONFIG_KEY = 'app_provider_missing_icon_apps'
const PENDING_DELETION_CONFIG_KEY = 'app_provider_pending_deletion'
const BACKFILL_LAST_RUN_CONFIG_KEY = 'app_provider_last_backfill'
const FULL_SYNC_LAST_RUN_CONFIG_KEY = 'app_provider_last_full_sync'
const FULL_SYNC_PERSIST_RETRY_BASE_DELAY_MS = 200
const DELETION_GRACE_PERIOD_MS = 3 * 60 * 1000 // 3 minutes grace period
const DELETION_MIN_MISS_COUNT = 2 // Must be missing for at least 2 scans
const STARTUP_BACKFILL_INITIAL_DELAY_MS = 15_000
const STARTUP_HEAVY_TASK_EXTRA_DELAY_DEV_MS = 30_000
const STARTUP_HEAVY_TASK_WAIT_RENDERER_TIMEOUT_MS = 30_000
const STARTUP_BACKFILL_MIN_INTERVAL_DEV_MS = 6 * 60 * 60 * 1000
const STARTUP_MDLS_SCAN_MIN_INTERVAL_DEV_MS = 6 * 60 * 60 * 1000
const APP_IDENTITY_EXTENSION_KEY = 'appIdentity'
const APP_LAUNCH_KIND_EXTENSION_KEY = 'launchKind'
const APP_LAUNCH_TARGET_EXTENSION_KEY = 'launchTarget'
const APP_LAUNCH_ARGS_EXTENSION_KEY = 'launchArgs'
const APP_WORKING_DIRECTORY_EXTENSION_KEY = 'workingDirectory'
const APP_DISPLAY_PATH_EXTENSION_KEY = 'displayPath'
const APP_IDENTIFIER_EXTENSION_KEYS = ['bundleId', APP_IDENTITY_EXTENSION_KEY] as const

function resolveAppItemId(value: {
  bundleId?: string | null
  stableId?: string | null
  appIdentity?: string | null
  path: string
}): string {
  return value.bundleId || value.stableId || value.appIdentity || value.path
}

function splitLaunchArgs(rawArgs?: string): string[] {
  if (!rawArgs) return []

  const args: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < rawArgs.length; i += 1) {
    const char = rawArgs[i]
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && /\s/.test(char)) {
      if (current) {
        args.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (current) {
    args.push(current)
  }

  return args
}

export interface AppIndexSettings {
  hideNoisySystemApps: boolean
  startupBackfillEnabled: boolean
  startupBackfillRetryMax: number
  startupBackfillRetryBaseMs: number
  startupBackfillRetryMaxMs: number
  fullSyncEnabled: boolean
  fullSyncIntervalMs: number
  fullSyncCheckIntervalMs: number
  fullSyncCooldownMs: number
  fullSyncPersistRetry: number
}

export interface AppIndexRebuildResult {
  success: boolean
  message?: string
  error?: string
}

const DEFAULT_APP_INDEX_SETTINGS: AppIndexSettings = {
  hideNoisySystemApps: true,
  startupBackfillEnabled: true,
  startupBackfillRetryMax: 5,
  startupBackfillRetryBaseMs: 5000,
  startupBackfillRetryMaxMs: 5 * 60 * 1000,
  fullSyncEnabled: true,
  fullSyncIntervalMs: 24 * 60 * 60 * 1000,
  fullSyncCheckIntervalMs: 10 * 60 * 1000,
  fullSyncCooldownMs: 60 * 60 * 1000,
  fullSyncPersistRetry: 3
}

interface PendingDeletionEntry {
  id: number
  path: string
  uniqueId: string
  firstMissedAt: number
  missCount: number
}

class AppProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'app-provider'
  readonly name = 'App Provider'
  readonly type = 'application' as const
  readonly supportedInputTypes = [TuffInputType.Text]
  readonly priority = 'fast' as const
  readonly expectedDuration = 50

  private dbUtils: ReturnType<typeof createDbUtils> | null = null
  private context: ProviderContext | null = null
  private isInitializing: Promise<void> | null = null
  private readonly isMac = process.platform === 'darwin'
  private processingPaths: Set<string> = new Set()
  private aliases: Record<string, string[]> = {}
  private searchIndex: SearchIndexService | null = null
  private appIndexSettings: AppIndexSettings = { ...DEFAULT_APP_INDEX_SETTINGS }
  private startupBackfillStarted = false
  private fullSyncRegistered = false
  private volatileLastFullSyncTime: number | null = null
  private maintenanceTaskQueue: Promise<void> = Promise.resolve()
  private maintenanceTaskMap = new Map<string, Promise<unknown>>()

  constructor() {
    logApp('Initializing AppProvider service', LogStyle.info)
  }

  private isDevelopmentRuntime(): boolean {
    if (is.dev) return true
    if (process.env.NODE_ENV === 'development') return true
    if (process.env.BUILD_TYPE === 'development') return true

    const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? ''
    return /^(https?):\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(rendererUrl)
  }

  async onLoad(context: ProviderContext): Promise<void> {
    const loadStart = startTiming()
    logApp('Loading AppProvider service...', LogStyle.process)
    this.context = context
    this.dbUtils = createDbUtils(context.databaseManager.getDb())
    this.searchIndex = context.searchIndex

    this.loadAppIndexSettings()
    this._scheduleStartupBackfill()
    this._scheduleFullSync()

    // 注意：补漏/全量同步会在后台触发关键词同步
    this._subscribeToFSEvents()
    this._registerWatchPaths()
    this._scheduleMdlsUpdateScan()

    logApp('AppProvider service loaded successfully', LogStyle.success)
    logAppDuration('onLoad', loadStart, {
      label: 'onLoad finished',
      style: 'success',
      unit: 's',
      precision: 2
    })
  }

  private loadAppIndexSettings(): void {
    try {
      const raw = getMainConfig(StorageList.APP_INDEX_SETTINGS) as
        | Partial<AppIndexSettings>
        | undefined
      this.appIndexSettings = this.normalizeAppIndexSettings(raw)
      saveMainConfig(StorageList.APP_INDEX_SETTINGS, this.appIndexSettings)
    } catch (error) {
      this.appIndexSettings = { ...DEFAULT_APP_INDEX_SETTINGS }
      logApp('Failed to load app index settings, using defaults', LogStyle.warning, {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private normalizeAppIndexSettings(raw?: Partial<AppIndexSettings> | null): AppIndexSettings {
    const data = raw && typeof raw === 'object' ? raw : {}
    const clampMs = (value: unknown, fallback: number) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return fallback
      }
      return value
    }
    const clampCount = (value: unknown, fallback: number) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return fallback
      }
      return Math.floor(value)
    }

    const retryBaseMs = clampMs(
      data.startupBackfillRetryBaseMs,
      DEFAULT_APP_INDEX_SETTINGS.startupBackfillRetryBaseMs
    )
    const retryMaxMs = Math.max(
      clampMs(data.startupBackfillRetryMaxMs, DEFAULT_APP_INDEX_SETTINGS.startupBackfillRetryMaxMs),
      retryBaseMs
    )

    return {
      hideNoisySystemApps:
        typeof data.hideNoisySystemApps === 'boolean'
          ? data.hideNoisySystemApps
          : DEFAULT_APP_INDEX_SETTINGS.hideNoisySystemApps,
      startupBackfillEnabled:
        typeof data.startupBackfillEnabled === 'boolean'
          ? data.startupBackfillEnabled
          : DEFAULT_APP_INDEX_SETTINGS.startupBackfillEnabled,
      startupBackfillRetryMax: clampCount(
        data.startupBackfillRetryMax,
        DEFAULT_APP_INDEX_SETTINGS.startupBackfillRetryMax
      ),
      startupBackfillRetryBaseMs: retryBaseMs,
      startupBackfillRetryMaxMs: retryMaxMs,
      fullSyncEnabled:
        typeof data.fullSyncEnabled === 'boolean'
          ? data.fullSyncEnabled
          : DEFAULT_APP_INDEX_SETTINGS.fullSyncEnabled,
      fullSyncIntervalMs: clampMs(
        data.fullSyncIntervalMs,
        DEFAULT_APP_INDEX_SETTINGS.fullSyncIntervalMs
      ),
      fullSyncCheckIntervalMs: clampMs(
        data.fullSyncCheckIntervalMs,
        DEFAULT_APP_INDEX_SETTINGS.fullSyncCheckIntervalMs
      ),
      fullSyncCooldownMs: clampMs(
        data.fullSyncCooldownMs,
        DEFAULT_APP_INDEX_SETTINGS.fullSyncCooldownMs
      ),
      fullSyncPersistRetry: Math.max(
        1,
        clampCount(data.fullSyncPersistRetry, DEFAULT_APP_INDEX_SETTINGS.fullSyncPersistRetry)
      )
    }
  }

  async onDestroy(): Promise<void> {
    logApp('Unloading AppProvider service', LogStyle.process)
    this._unsubscribeFromFSEvents()
    logApp('AppProvider service unloaded', LogStyle.success)
  }

  public getAppIndexSettings(): AppIndexSettings {
    return { ...this.appIndexSettings }
  }

  public updateAppIndexSettings(input: Partial<AppIndexSettings>): AppIndexSettings {
    const previous = this.appIndexSettings
    this.appIndexSettings = this.normalizeAppIndexSettings({
      ...this.appIndexSettings,
      ...input
    })

    try {
      saveMainConfig(StorageList.APP_INDEX_SETTINGS, this.appIndexSettings)
    } catch (error) {
      logApp('Failed to persist app index settings', LogStyle.warning, {
        error: error instanceof Error ? error.message : String(error)
      })
    }

    if (
      previous.fullSyncEnabled !== this.appIndexSettings.fullSyncEnabled ||
      previous.fullSyncCheckIntervalMs !== this.appIndexSettings.fullSyncCheckIntervalMs
    ) {
      this._refreshFullSyncSchedule()
    }

    if (previous.startupBackfillEnabled !== this.appIndexSettings.startupBackfillEnabled) {
      this._scheduleStartupBackfill()
    }

    return { ...this.appIndexSettings }
  }

  public async addAppByPath(rawPath: string): Promise<AppIndexAddPathResult> {
    const appPath = this.resolveAppPath(rawPath, { skipWatchCheck: true })
    if (!appPath) {
      return { success: false, status: 'invalid', reason: 'invalid-path' }
    }
    return this.processAppPath(appPath)
  }

  public async setAliases(aliases: Record<string, string[]>): Promise<void> {
    logApp('Updating app aliases', LogStyle.process)
    this.aliases = aliases

    logApp('App aliases updated, resyncing all app keywords', LogStyle.info)

    if (!this.dbUtils) return

    const allApps = await this.dbUtils.getFilesByType('app')
    const appsWithExtensions = await this.fetchExtensionsForFiles(allApps)

    logApp(
      `Resyncing keywords for ${chalk.cyan(appsWithExtensions.length)} apps...`,
      LogStyle.process
    )

    await runAdaptiveTaskQueue(
      appsWithExtensions,
      async (app, index) => {
        const appInfo = this._mapDbAppToScannedInfo(app)
        await this._syncKeywordsForApp(appInfo)

        if ((index + 1) % 100 === 0 || index === appsWithExtensions.length - 1) {
          logApp(
            `Processed ${chalk.cyan(index + 1)}/${chalk.cyan(appsWithExtensions.length)} app keyword syncs`,
            LogStyle.info
          )
        }
      },
      {
        estimatedTaskTimeMs: 5,
        yieldIntervalMs: 10,
        maxBatchSize: 10,
        label: 'AppProvider::aliasKeywordSync'
      }
    )

    logApp('All app keywords synced successfully', LogStyle.success)
  }

  private resolveScannedAppKey(
    app: Pick<ScannedAppInfo, 'bundleId' | 'stableId' | 'path'>
  ): string {
    return resolveAppItemId(app)
  }

  private resolveDbAppKey(app: DbAppWithExtensions): string {
    return resolveAppItemId({
      bundleId: app.extensions.bundleId,
      appIdentity: app.extensions.appIdentity,
      path: app.path
    })
  }

  private buildAppExtensions(
    fileId: number,
    app: Pick<
      ScannedAppInfo,
      | 'bundleId'
      | 'icon'
      | 'stableId'
      | 'launchKind'
      | 'launchTarget'
      | 'launchArgs'
      | 'workingDirectory'
      | 'displayPath'
    >
  ): FileExtensionInsert[] {
    const extensions: FileExtensionInsert[] = []
    if (app.bundleId) {
      extensions.push({ fileId, key: 'bundleId', value: app.bundleId })
    }
    if (app.icon) {
      extensions.push({ fileId, key: 'icon', value: app.icon })
    }
    if (app.stableId) {
      extensions.push({ fileId, key: APP_IDENTITY_EXTENSION_KEY, value: app.stableId })
    }
    extensions.push({ fileId, key: APP_LAUNCH_KIND_EXTENSION_KEY, value: app.launchKind })
    extensions.push({ fileId, key: APP_LAUNCH_TARGET_EXTENSION_KEY, value: app.launchTarget })
    if (app.launchArgs) {
      extensions.push({ fileId, key: APP_LAUNCH_ARGS_EXTENSION_KEY, value: app.launchArgs })
    }
    if (app.workingDirectory) {
      extensions.push({
        fileId,
        key: APP_WORKING_DIRECTORY_EXTENSION_KEY,
        value: app.workingDirectory
      })
    }
    if (app.displayPath) {
      extensions.push({ fileId, key: APP_DISPLAY_PATH_EXTENSION_KEY, value: app.displayPath })
    }
    return extensions
  }

  private buildScannedAppsMap(scannedApps: ScannedAppInfo[]): Map<string, ScannedAppInfo> {
    return new Map(
      scannedApps
        .map((app) => [this.resolveScannedAppKey(app), app] as const)
        .filter(([key]) => Boolean(key))
    )
  }

  private async loadScannedApps(options?: { forceRefresh?: boolean }): Promise<ScannedAppInfo[]> {
    return await appScanner.getApps({ forceRefresh: options?.forceRefresh === true })
  }

  private runMaintenanceTask<T>(taskKey: string, task: () => Promise<T>): Promise<T> {
    const existing = this.maintenanceTaskMap.get(taskKey)
    if (existing) {
      return existing as Promise<T>
    }

    const label = `AppProvider.${taskKey}`
    const startTask = () => appTaskGate.runAppTask(task, label)
    const basePromise = this.maintenanceTaskQueue.then(startTask, startTask)
    const trackedPromise = basePromise.finally(() => {
      if (this.maintenanceTaskMap.get(taskKey) === trackedPromise) {
        this.maintenanceTaskMap.delete(taskKey)
      }
    })

    this.maintenanceTaskMap.set(taskKey, trackedPromise)
    this.maintenanceTaskQueue = trackedPromise.then(
      () => undefined,
      () => undefined
    )

    return trackedPromise
  }

  private _scheduleStartupBackfill(): void {
    if (!this.appIndexSettings.startupBackfillEnabled) {
      logApp('Startup backfill disabled, skipping', LogStyle.info)
      return
    }
    if (this.startupBackfillStarted) return
    this.startupBackfillStarted = true

    const isDevelopmentRuntime = this.isDevelopmentRuntime()
    const delayMs = isDevelopmentRuntime
      ? STARTUP_BACKFILL_INITIAL_DELAY_MS + STARTUP_HEAVY_TASK_EXTRA_DELAY_DEV_MS
      : STARTUP_BACKFILL_INITIAL_DELAY_MS
    logApp(`Scheduling startup backfill (deferred ${Math.round(delayMs / 1000)}s)`, LogStyle.info)
    setTimeout(() => {
      void this._runStartupBackfillWithRetry()
    }, delayMs)
  }

  private async _runStartupBackfillWithRetry(): Promise<void> {
    const maxRetries = this.appIndexSettings.startupBackfillRetryMax

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const readiness = await this._shouldRunStartupBackfill()

      if (readiness.allowed) {
        const task = this._runStartupBackfill()
        this.isInitializing = task
        try {
          await task
          await this._setLastBackfillTime(Date.now())
          return
        } catch (error) {
          logApp('Startup backfill failed', LogStyle.error, {
            error: error instanceof Error ? error.message : String(error)
          })
        } finally {
          if (this.isInitializing === task) {
            this.isInitializing = null
          }
        }
      }

      if (readiness.reason === 'recent-backfill') {
        logApp(
          'Startup backfill skipped: recently completed in this dev environment',
          LogStyle.info
        )
        return
      }

      if (attempt >= maxRetries) {
        logApp('Startup backfill stopped after retries', LogStyle.warning, {
          reason: readiness.reason
        })
        return
      }

      const delay = this._getBackfillRetryDelay(attempt + 1)
      logApp(
        `Startup backfill deferred (${readiness.reason || 'not-ready'}), retrying in ${Math.round(
          delay / 1000
        )}s`,
        LogStyle.info
      )
      await sleep(delay)
    }
  }

  private async _shouldRunStartupBackfill(): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.dbUtils || !this.searchIndex) {
      return { allowed: false, reason: 'missing-context' }
    }

    if (this.isDevelopmentRuntime()) {
      const lastBackfillTime = await this._getLastBackfillTime()
      if (
        lastBackfillTime &&
        Date.now() - lastBackfillTime < STARTUP_BACKFILL_MIN_INTERVAL_DEV_MS
      ) {
        return { allowed: false, reason: 'recent-backfill' }
      }
    }

    if (this.isDevelopmentRuntime() && this.isMainRendererLoading()) {
      return { allowed: false, reason: 'renderer-loading' }
    }

    if (appTaskGate.isActive()) {
      return { allowed: false, reason: 'app-busy' }
    }

    const decision = await deviceIdleService.canRun({ idleThresholdMs: 0, forceAfterMs: 0 })
    if (!decision.allowed) {
      return { allowed: false, reason: decision.reason }
    }

    return { allowed: true }
  }

  private _getBackfillRetryDelay(attempt: number): number {
    const base = this.appIndexSettings.startupBackfillRetryBaseMs
    const maxDelay = this.appIndexSettings.startupBackfillRetryMaxMs
    const multiplier = 3
    const rawDelay = Math.min(base * multiplier ** Math.max(0, attempt - 1), maxDelay)
    const jitter = 0.2
    const factor = 1 - jitter + Math.random() * jitter * 2
    return Math.round(rawDelay * factor)
  }

  private _runStartupBackfill(): Promise<void> {
    return this.runMaintenanceTask('startup-backfill', async () => {
      await this._performStartupBackfill()
    })
  }

  private async _performStartupBackfill(): Promise<void> {
    if (!this.dbUtils) {
      logApp('Database not initialized, skipping startup backfill', LogStyle.error)
      return
    }

    const initStart = startTiming()
    logApp('Starting startup backfill...', LogStyle.process)

    const scanStart = startTiming()
    const scannedApps = await this.loadScannedApps({ forceRefresh: true })
    logAppDuration('BackfillScanApps', scanStart, {
      label: `Scanned ${chalk.cyan(scannedApps.length)} apps`,
      style: 'info',
      unit: 's',
      precision: 2
    })

    await this._recordMissingIconApps(scannedApps)

    const dbLoadStart = startTiming()
    const dbApps = await this.dbUtils!.getFilesByType('app')
    const dbAppsWithExtensions = await this.fetchExtensionsForFiles(dbApps)
    logAppDuration('BackfillLoadDbApps', dbLoadStart, {
      label: `Loaded ${chalk.cyan(dbApps.length)} DB app records`,
      style: 'info',
      unit: 's',
      precision: 2
    })

    const scannedAppsMap = this.buildScannedAppsMap(scannedApps)
    const existingIds = new Set(dbAppsWithExtensions.map((app) => this.resolveDbAppKey(app)))
    const toAdd = scannedApps.filter((app) => {
      const uniqueId = this.resolveScannedAppKey(app)
      return !!uniqueId && !existingIds.has(uniqueId)
    })
    const toUpdateDisplayName = dbAppsWithExtensions
      .map((dbApp) => {
        const uniqueId = this.resolveDbAppKey(dbApp)
        const scannedApp = scannedAppsMap.get(uniqueId)
        if (!scannedApp) return null
        if (!shouldUpdateDisplayName(dbApp.displayName, scannedApp.displayName)) {
          return null
        }
        return { fileId: dbApp.id, app: scannedApp, existingDisplayName: dbApp.displayName }
      })
      .filter(Boolean) as Array<{
      fileId: number
      app: ScannedAppInfo
      existingDisplayName: string | null
    }>

    ;(dbApps as unknown[]).length = 0
    ;(dbAppsWithExtensions as unknown[]).length = 0

    logApp(
      `Startup backfill found ${chalk.green(toAdd.length)} missing apps and ${chalk.yellow(
        toUpdateDisplayName.length
      )} displayName corrections`,
      LogStyle.info
    )

    if (toAdd.length > 0) {
      logApp(`Adding ${chalk.cyan(toAdd.length)} missing apps...`, LogStyle.process)
      const addStartTime = startTiming()

      await runAdaptiveTaskQueue(
        toAdd,
        async (app, index) => {
          const [insertedFile] = await this.dbUtils!.getDb()
            .insert(filesSchema)
            .values({
              path: app.path,
              name: app.name,
              displayName: app.displayName,
              type: 'app' as const,
              mtime: app.lastModified,
              ctime: new Date()
            })
            .onConflictDoUpdate({
              target: filesSchema.path,
              set: {
                name: sql`excluded.name`,
                displayName: sql`excluded.display_name`,
                mtime: sql`excluded.mtime`
              }
            })
            .returning()

          if (insertedFile) {
            const extensions = this.buildAppExtensions(insertedFile.id, app)
            if (extensions.length > 0) await this.dbUtils!.addFileExtensions(extensions)

            await this._syncKeywordsForApp(app)
          }

          if ((index + 1) % 50 === 0 || index === toAdd.length - 1) {
            logApp(
              `Processed ${chalk.cyan(index + 1)}/${chalk.cyan(toAdd.length)} app additions`,
              LogStyle.info
            )
          }
        },
        {
          estimatedTaskTimeMs: 12,
          label: 'AppProvider::backfillAddApps'
        }
      )

      logAppDuration('BackfillAddApps', addStartTime, {
        label: 'Missing apps added',
        style: 'success',
        unit: 's',
        precision: 1
      })
    }

    if (toUpdateDisplayName.length > 0) {
      logApp(
        `Correcting ${chalk.cyan(toUpdateDisplayName.length)} localized app display names...`,
        LogStyle.process
      )
      const updateStartTime = startTiming()
      let updatedCount = 0
      let failedCount = 0

      await runAdaptiveTaskQueue(
        toUpdateDisplayName,
        async ({ fileId, app, existingDisplayName }, index) => {
          const nextDisplayName = normalizeDisplayName(app.displayName)
          if (!shouldUpdateDisplayName(existingDisplayName, nextDisplayName)) {
            return
          }

          try {
            await this.dbUtils!.getDb()
              .update(filesSchema)
              .set({ displayName: nextDisplayName })
              .where(eq(filesSchema.id, fileId))

            await this._syncKeywordsForApp({ ...app, displayName: nextDisplayName })
            updatedCount += 1
          } catch (error) {
            failedCount += 1
            logApp(
              `Failed to correct displayName for ${chalk.yellow(app.path)}: ${
                error instanceof Error ? error.message : String(error)
              }`,
              LogStyle.warning
            )
          }

          if ((index + 1) % 50 === 0 || index === toUpdateDisplayName.length - 1) {
            logApp(
              `Processed ${chalk.cyan(index + 1)}/${chalk.cyan(toUpdateDisplayName.length)} displayName corrections`,
              LogStyle.info
            )
          }
        },
        {
          estimatedTaskTimeMs: 10,
          label: 'AppProvider::backfillUpdateDisplayName'
        }
      )

      const correctionStyle = failedCount > 0 ? LogStyle.warning : LogStyle.success
      logApp(
        `DisplayName correction summary: updated ${chalk.green(updatedCount)}, failed ${chalk.yellow(failedCount)}`,
        correctionStyle
      )
      logAppDuration('BackfillFixDisplayName', updateStartTime, {
        label: 'DisplayName correction complete',
        style: failedCount > 0 ? 'warning' : 'success',
        unit: 's',
        precision: 1,
        suffix: `(updated=${chalk.green(updatedCount)}, failed=${chalk.yellow(failedCount)})`
      })
    }

    logAppDuration('StartupBackfill', initStart, {
      label: 'Startup backfill complete',
      style: 'success',
      unit: 's',
      precision: 2
    })
  }

  private _scheduleFullSync(): void {
    if (!this.appIndexSettings.fullSyncEnabled) {
      logApp('Full sync disabled, skipping schedule', LogStyle.info)
      return
    }
    if (this.fullSyncRegistered) return
    this.fullSyncRegistered = true

    const intervalMs = this.appIndexSettings.fullSyncCheckIntervalMs
    logApp(
      `Registering app full sync polling service (${Math.round(intervalMs / 60000)} min interval)`,
      LogStyle.info
    )
    pollingService.register(
      'app_provider_full_sync',
      async () => {
        await this._runFullSyncIfDue()
      },
      {
        interval: intervalMs,
        unit: 'milliseconds',
        lane: 'maintenance',
        backpressure: 'latest_wins',
        dedupeKey: 'app_provider_full_sync',
        maxInFlight: 1
      }
    )
  }

  private _refreshFullSyncSchedule(): void {
    pollingService.unregister('app_provider_full_sync')
    this.fullSyncRegistered = false
    this._scheduleFullSync()
  }

  private async _runFullSyncIfDue(): Promise<void> {
    if (!this.dbUtils) {
      logApp('Database not initialized, skipping full sync', LogStyle.error)
      return
    }

    const lastSync = await this._getLastFullSyncTime()
    const now = Date.now()
    const fullSyncCooldownMs = Math.max(
      this.appIndexSettings.fullSyncCooldownMs,
      this.appIndexSettings.fullSyncIntervalMs
    )
    if (lastSync && now - lastSync < fullSyncCooldownMs) {
      appProviderLog.debug(
        `${chalk.cyan(((now - lastSync) / (60 * 60 * 1000)).toFixed(2))} hours since last full sync, skipping`
      )
      return
    }

    if (appTaskGate.isActive()) {
      logApp('App task active, skipping full sync', LogStyle.info)
      return
    }

    const decision = await deviceIdleService.canRun({ lastRunAt: lastSync ?? undefined })
    if (!decision.allowed) {
      logApp(`Full sync skipped (${decision.reason || 'not-ready'})`, LogStyle.info)
      return
    }

    await this._runFullSync(decision.forced === true)
  }

  private _runFullSync(forced: boolean): Promise<void> {
    return this.runMaintenanceTask('full-sync', async () => {
      await this._performFullSync(forced)
    })
  }

  private async _performFullSync(forced: boolean): Promise<void> {
    if (!this.dbUtils) {
      logApp('Database not initialized, skipping full sync', LogStyle.error)
      return
    }

    const syncStart = startTiming()
    logApp(forced ? 'Starting forced full sync...' : 'Starting full sync...', LogStyle.process)

    try {
      await this._initialize({ forceRefresh: true })
      await this._setLastFullSyncTime(Date.now())
      logAppDuration('FullSync', syncStart, {
        label: forced ? 'Forced full sync complete' : 'Full sync complete',
        style: 'success',
        unit: 's',
        precision: 2
      })
    } catch (error) {
      logApp('Full sync failed', LogStyle.error, {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private _mapDbAppToScannedInfo(app: DbAppWithExtensions): ScannedAppInfo {
    return {
      name: app.name,
      displayName: app.displayName || undefined,
      fileName:
        app.extensions.displayPath ||
        (app.path.startsWith('shell:AppsFolder\\')
          ? app.name
          : path.basename(app.path, path.extname(app.path) || undefined)),
      path: app.path,
      icon: app.extensions.icon || '',
      bundleId: app.extensions.bundleId || '',
      uniqueId: app.extensions.appIdentity || app.extensions.bundleId || app.path,
      stableId: app.extensions.appIdentity || app.extensions.bundleId || app.path,
      launchKind: (app.extensions.launchKind as AppLaunchKind | undefined) || 'path',
      launchTarget: app.extensions.launchTarget || app.path,
      launchArgs: app.extensions.launchArgs || undefined,
      workingDirectory: app.extensions.workingDirectory || undefined,
      displayPath: app.extensions.displayPath || undefined,
      lastModified: app.mtime
    }
  }

  /**
   * 为应用同步关键词
   */
  private async _syncKeywordsForApp(appInfo: ScannedAppInfo): Promise<void> {
    if (!this.searchIndex) return

    const keywordsSet = await this._generateKeywordsForApp(appInfo)
    const itemId = resolveAppItemId(appInfo)

    const keywordEntries: SearchIndexKeyword[] = Array.from(keywordsSet).map((keyword) => ({
      value: keyword,
      priority:
        this._isAcronymForApp(keyword, appInfo) || this._isAliasForApp(keyword, appInfo) ? 1.5 : 1.1
    }))

    const aliasList = this._getAliasesForApp(appInfo)
    const aliasEntries: SearchIndexKeyword[] = aliasList.map((alias) => ({
      value: alias,
      priority: 1.5
    }))

    const indexItem: SearchIndexItem = {
      itemId,
      providerId: this.id,
      type: this.type,
      name: appInfo.name,
      displayName: appInfo.displayName || undefined,
      description: appInfo.description || undefined,
      path: appInfo.path,
      extension:
        appInfo.launchKind === 'uwp'
          ? '.uwp'
          : path.extname(appInfo.launchTarget || appInfo.path).toLowerCase(),
      aliases: aliasEntries,
      keywords: keywordEntries,
      tags: appInfo.bundleId ? [appInfo.bundleId] : undefined
    }

    await this.searchIndex.indexItems([indexItem])
  }

  private _isAcronymForApp(keyword: string, appInfo: ScannedAppInfo): boolean {
    const names = [appInfo.name, appInfo.displayName, appInfo.fileName].filter(Boolean) as string[]
    return names.some((name) => {
      if (!name || !name.includes(' ')) return false
      const acronym = name
        .split(' ')
        .filter((word) => word)
        .map((word) => word.charAt(0))
        .join('')
        .toLowerCase()
      return acronym === keyword
    })
  }

  private _isAliasForApp(keyword: string, appInfo: ScannedAppInfo): boolean {
    const uniqueId = resolveAppItemId(appInfo)
    const aliasList = this.aliases[uniqueId] || this.aliases[appInfo.path] || []
    return aliasList.includes(keyword)
  }

  private _getAliasesForApp(appInfo: ScannedAppInfo): string[] {
    const uniqueId = resolveAppItemId(appInfo)
    const aliasesById = this.aliases[uniqueId] || []
    const aliasesByPath = this.aliases[appInfo.path] || []
    return Array.from(new Set([...aliasesById, ...aliasesByPath])).map((alias) =>
      alias.toLowerCase()
    )
  }

  private async _recordMissingIconApps(scannedApps: ScannedAppInfo[]): Promise<void> {
    const knownMissingIconApps = await this._getKnownMissingIconApps()
    let missingIconConfigUpdated = false

    for (const app of scannedApps) {
      if (app.icon) continue

      const uniqueId = this.resolveScannedAppKey(app)
      if (!uniqueId || knownMissingIconApps.has(uniqueId)) continue

      logApp(`Icon not found for app: ${chalk.yellow(app.name)}`, LogStyle.warning)
      knownMissingIconApps.add(uniqueId)
      missingIconConfigUpdated = true
    }

    if (missingIconConfigUpdated) {
      await this._saveKnownMissingIconApps(knownMissingIconApps)
    }
  }

  private async _generateKeywordsForApp(appInfo: ScannedAppInfo): Promise<Set<string>> {
    const generatedKeywords = new Set<string>()
    const names = [appInfo.name, appInfo.displayName, appInfo.fileName].filter(Boolean) as string[]
    const CHINESE_REGEX = /[\u4E00-\u9FA5]/
    const INVALID_KEYWORD_REGEX = /[^a-z0-9\u4E00-\u9FA5]/i

    for (const name of names) {
      const lowerCaseName = name.toLowerCase()
      generatedKeywords.add(lowerCaseName)
      generatedKeywords.add(lowerCaseName.replace(/\s/g, ''))

      lowerCaseName.split(/[\s-]/).forEach((word) => {
        if (word) generatedKeywords.add(word)
      })

      const acronym = this._generateAcronym(name)
      if (acronym) generatedKeywords.add(acronym)

      if (CHINESE_REGEX.test(name)) {
        try {
          const { pinyin } = await import('pinyin-pro')
          const pinyinFull = pinyin(name, { toneType: 'none' }).replace(/\s/g, '')
          generatedKeywords.add(pinyinFull)
          const pinyinFirst = pinyin(name, { pattern: 'first', toneType: 'none' }).replace(
            /\s/g,
            ''
          )
          generatedKeywords.add(pinyinFirst)
        } catch {
          logApp(`Failed to get pinyin for: ${name}`, LogStyle.warning)
        }
      }
    }

    const uniqueId = resolveAppItemId(appInfo)
    const aliasList = this.aliases[uniqueId] || this.aliases[appInfo.path]
    if (aliasList) {
      aliasList.forEach((alias) => generatedKeywords.add(alias.toLowerCase()))
    }

    const finalKeywords = new Set<string>()
    for (const keyword of generatedKeywords) {
      if (keyword.length > 1 && !INVALID_KEYWORD_REGEX.test(keyword)) {
        finalKeywords.add(keyword)
      }
    }

    return finalKeywords
  }

  private _generateAcronym(name: string): string {
    if (!name || !name.includes(' ')) {
      return ''
    }
    return name
      .split(' ')
      .filter((word) => word)
      .map((word) => word.charAt(0))
      .join('')
      .toLowerCase()
  }

  private async _initialize(options?: { forceRefresh?: boolean }): Promise<void> {
    const initStart = startTiming()
    logApp('Initializing app data...', LogStyle.process)

    const scanStart = startTiming()
    const scannedApps = await this.loadScannedApps({ forceRefresh: options?.forceRefresh === true })
    logAppDuration('ScanApps', scanStart, {
      label: `Scanned ${chalk.cyan(scannedApps.length)} apps`,
      style: 'info',
      unit: 's',
      precision: 2
    })
    const scannedAppsMap = this.buildScannedAppsMap(scannedApps)

    await this._recordMissingIconApps(scannedApps)

    const dbLoadStart = startTiming()
    const dbApps = await this.dbUtils!.getFilesByType('app')
    const dbAppsWithExtensions = await this.fetchExtensionsForFiles(dbApps)
    logAppDuration('LoadDbApps', dbLoadStart, {
      label: `Loaded ${chalk.cyan(dbApps.length)} DB app records`,
      style: 'info',
      unit: 's',
      precision: 2
    })
    const invalidIconApps = new Set<string>()
    for (const app of dbAppsWithExtensions) {
      const icon = app.extensions.icon
      if (icon && !isValidBase64DataUrl(icon)) {
        const uniqueId = this.resolveDbAppKey(app)
        if (uniqueId) invalidIconApps.add(uniqueId)
      }
    }
    if (invalidIconApps.size > 0) {
      logApp(
        `Detected ${chalk.yellow(invalidIconApps.size)} invalid app icons, will refresh`,
        LogStyle.warning
      )
    }
    const dbAppsMap = new Map(dbAppsWithExtensions.map((app) => [this.resolveDbAppKey(app), app]))

    const toAdd: ScannedAppInfo[] = []
    const toUpdate: Array<{
      fileId: number
      app: ScannedAppInfo
      existingDisplayName: string | null
    }> = []
    const missingApps: Array<{ id: number; path: string; uniqueId: string }> = []

    logApp(
      `Comparing ${chalk.cyan(scannedApps.length)} scanned apps with ${chalk.cyan(dbApps.length)} apps in DB`,
      LogStyle.info
    )

    for (const [uniqueId, scannedApp] of scannedAppsMap.entries()) {
      const dbApp = dbAppsMap.get(uniqueId)
      if (!dbApp) {
        toAdd.push(scannedApp)
      } else {
        const shouldRefreshIcon = invalidIconApps.has(uniqueId)
        const hasDisplayNameDrift = shouldUpdateDisplayName(
          dbApp.displayName,
          scannedApp.displayName
        )
        if (
          shouldRefreshIcon ||
          scannedApp.lastModified.getTime() > new Date(dbApp.mtime).getTime() ||
          hasDisplayNameDrift
        ) {
          toUpdate.push({
            fileId: dbApp.id,
            app: scannedApp,
            existingDisplayName: dbApp.displayName
          })
        }
        dbAppsMap.delete(uniqueId)
      }
    }

    // Collect missing apps for grace period processing
    for (const [uniqueId, deletedApp] of dbAppsMap.entries()) {
      missingApps.push({
        id: deletedApp.id,
        path: deletedApp.path,
        uniqueId
      })
    }

    // Process missing apps with grace period protection
    const toDeleteIds = await this._processAppsForDeletion(missingApps)

    logApp(
      `Found ${chalk.green(toAdd.length)} to add, ${chalk.yellow(toUpdate.length)} to update, ${chalk.yellow(missingApps.length)} missing (${chalk.red(toDeleteIds.length)} confirmed for deletion)`,
      LogStyle.info
    )

    const db = this.dbUtils!.getDb()

    if (toAdd.length > 0) {
      logApp(`Adding ${chalk.cyan(toAdd.length)} new apps...`, LogStyle.process)
      const addStartTime = startTiming()

      await runAdaptiveTaskQueue(
        toAdd,
        async (app, index) => {
          const [insertedFile] = await db
            .insert(filesSchema)
            .values({
              path: app.path,
              name: app.name,
              displayName: app.displayName,
              type: 'app' as const,
              mtime: app.lastModified,
              ctime: new Date()
            })
            .onConflictDoUpdate({
              target: filesSchema.path,
              set: {
                name: sql`excluded.name`,
                displayName: sql`excluded.display_name`,
                mtime: sql`excluded.mtime`
              }
            })
            .returning()

          if (insertedFile) {
            const extensions = this.buildAppExtensions(insertedFile.id, app)
            if (extensions.length > 0) await this.dbUtils!.addFileExtensions(extensions)

            await this._syncKeywordsForApp(app)
          }

          if ((index + 1) % 50 === 0 || index === toAdd.length - 1) {
            logApp(
              `Processed ${chalk.cyan(index + 1)}/${chalk.cyan(toAdd.length)} app additions`,
              LogStyle.info
            )
          }
        },
        {
          estimatedTaskTimeMs: 12,
          label: 'AppProvider::addApps'
        }
      )

      logAppDuration('AddApps', addStartTime, {
        label: 'New apps added',
        style: 'success',
        unit: 's',
        precision: 1
      })
    }

    if (toUpdate.length > 0) {
      logApp(`Updating ${chalk.cyan(toUpdate.length)} apps...`, LogStyle.process)
      const updateStartTime = startTiming()

      await runAdaptiveTaskQueue(
        toUpdate,
        async ({ fileId, app, existingDisplayName }, index) => {
          const updateData: Partial<typeof filesSchema.$inferInsert> = {
            name: app.name,
            path: app.path,
            mtime: app.lastModified
          }
          const nextDisplayName = normalizeDisplayName(app.displayName)
          if (shouldUpdateDisplayName(existingDisplayName, nextDisplayName)) {
            updateData.displayName = nextDisplayName
          }

          await db.update(filesSchema).set(updateData).where(eq(filesSchema.id, fileId))

          const extensions = this.buildAppExtensions(fileId, app)
          if (extensions.length > 0) await this.dbUtils!.addFileExtensions(extensions)

          await this._syncKeywordsForApp(app)

          // 改为每100个输出一次，但保持10个一组的处理
          if ((index + 1) % 100 === 0 || index === toUpdate.length - 1) {
            logApp(
              `Processed ${chalk.cyan(index + 1)}/${chalk.cyan(toUpdate.length)} app updates`,
              LogStyle.info
            )
          }
        },
        {
          estimatedTaskTimeMs: 10,
          yieldIntervalMs: 10, // 每10ms让出控制权，避免阻塞
          maxBatchSize: 10, // 保持10个一组的批处理
          label: 'AppProvider::updateApps'
        }
      )

      logAppDuration('UpdateApps', updateStartTime, {
        label: 'Apps updated',
        style: 'success',
        unit: 's',
        precision: 1
      })
    }

    if (toDeleteIds.length > 0) {
      logApp(`Deleting ${chalk.cyan(toDeleteIds.length)} apps...`, LogStyle.process)

      const deletedItemIds = (
        await db
          .select({
            extensionKey: fileExtensions.key,
            extensionValue: fileExtensions.value,
            path: filesSchema.path
          })
          .from(filesSchema)
          .leftJoin(
            fileExtensions,
            and(
              eq(filesSchema.id, fileExtensions.fileId),
              inArray(fileExtensions.key, [...APP_IDENTIFIER_EXTENSION_KEYS])
            )
          )
          .where(inArray(filesSchema.id, toDeleteIds))
      ).reduce<string[]>((items, row) => {
        if (row.extensionValue && APP_IDENTIFIER_EXTENSION_KEYS.includes(row.extensionKey as any)) {
          items.push(row.extensionValue)
          return items
        }
        if (row.path) {
          items.push(row.path)
        }
        return items
      }, [])

      const deleteStart = startTiming()
      await db.transaction(async (tx) => {
        await tx.delete(filesSchema).where(inArray(filesSchema.id, toDeleteIds))
        await tx.delete(fileExtensions).where(inArray(fileExtensions.fileId, toDeleteIds))
      })

      if (deletedItemIds.length > 0) {
        await this.searchIndex?.removeItems(deletedItemIds)
      }

      logAppDuration('DeleteApps', deleteStart, {
        label: 'Apps deleted successfully',
        style: 'success',
        unit: 's',
        precision: 1
      })
    }

    logAppDuration('Initialize', initStart, {
      label: 'App data initialization complete',
      style: 'success',
      unit: 's',
      precision: 2
    })
  }

  private resolveAppPath(
    rawPath: string,
    options?: { skipWatchCheck?: boolean; logIgnore?: boolean }
  ): string | null {
    if (!rawPath) return null
    let appPath = rawPath

    if (this.isMac) {
      if (appPath.includes('.app/')) {
        appPath = appPath.substring(0, appPath.indexOf('.app') + 4)
      }
      if (!appPath.endsWith('.app')) {
        return null
      }
      if (!options?.skipWatchCheck && !this._isWatchPathCandidate(appPath)) {
        if (options?.logIgnore) {
          logApp(`Ignoring app change outside watch roots: ${chalk.gray(appPath)}`, LogStyle.info)
        }
        return null
      }
    }

    return appPath
  }

  private async upsertAppInfo(appInfo: ScannedAppInfo): Promise<'added' | 'updated'> {
    const existingFile = await this.dbUtils!.getFileByPath(appInfo.path)
    const db = this.dbUtils!.getDb()

    if (existingFile) {
      logApp(`Updating existing app: ${chalk.cyan(appInfo.name)}`, LogStyle.process)

      const updateData: Partial<typeof filesSchema.$inferInsert> = {
        name: appInfo.name,
        mtime: appInfo.lastModified
      }

      const normalizedDisplayName = normalizeDisplayName(appInfo.displayName)
      if (shouldUpdateDisplayName(existingFile.displayName, normalizedDisplayName)) {
        updateData.displayName = normalizedDisplayName
      }

      await db.update(filesSchema).set(updateData).where(eq(filesSchema.id, existingFile.id))

      await this.dbUtils!.addFileExtensions(this.buildAppExtensions(existingFile.id, appInfo))

      await this._syncKeywordsForApp(appInfo)
      logApp(`App ${chalk.cyan(appInfo.name)} updated successfully`, LogStyle.success)
      return 'updated'
    }

    logApp(`Adding new app: ${chalk.cyan(appInfo.name)}`, LogStyle.process)

    const [insertedFile] = await db
      .insert(filesSchema)
      .values({
        path: appInfo.path,
        name: appInfo.name,
        displayName: appInfo.displayName,
        type: 'app' as const,
        mtime: appInfo.lastModified,
        ctime: new Date()
      })
      .returning()

    if (insertedFile) {
      await this.dbUtils!.addFileExtensions(this.buildAppExtensions(insertedFile.id, appInfo))

      await this._syncKeywordsForApp(appInfo)
      logApp(`New app ${chalk.cyan(appInfo.name)} added successfully`, LogStyle.success)
    }

    return 'added'
  }

  private async processAppPath(appPath: string): Promise<AppIndexAddPathResult> {
    if (this.processingPaths.has(appPath)) {
      return { success: false, status: 'invalid', reason: 'processing' }
    }
    if (!this.dbUtils) {
      return { success: false, status: 'error', reason: 'db-not-ready' }
    }

    this.processingPaths.add(appPath)

    try {
      if (!(await this._waitForItemStable(appPath))) {
        logApp(`Item is unstable, skipping: ${chalk.yellow(appPath)}`, LogStyle.warning)
        return { success: false, status: 'invalid', reason: 'unstable' }
      }

      logApp(`Fetching app info: ${chalk.cyan(appPath)}`, LogStyle.process)
      const appInfo = await appScanner.getAppInfoByPath(appPath)
      if (!appInfo) {
        logApp(`Could not get app info for: ${chalk.yellow(appPath)}`, LogStyle.warning)
        return { success: false, status: 'invalid', reason: 'not-app' }
      }

      const status = await this.upsertAppInfo(appInfo)
      return { success: true, status, path: appInfo.path }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logApp(`Error processing app change: ${chalk.red(message)}`, LogStyle.error)
      return { success: false, status: 'error', reason: message }
    } finally {
      this.processingPaths.delete(appPath)
    }
  }

  private handleItemAddedOrChanged = async (event: unknown): Promise<void> => {
    const fsEvent = event as FileSystemPathEvent
    if (!fsEvent || !fsEvent.filePath || this.processingPaths.has(fsEvent.filePath)) return

    const appPath = this.resolveAppPath(fsEvent.filePath, { logIgnore: true })
    if (!appPath) return

    logApp(`App change detected: ${chalk.cyan(appPath)}`, LogStyle.info)
    await this.processAppPath(appPath)
  }

  private handleItemUnlinked = async (event: unknown): Promise<void> => {
    const fsEvent = event as FileSystemPathEvent
    if (!fsEvent || !fsEvent.filePath || this.processingPaths.has(fsEvent.filePath)) return

    let appPath = fsEvent.filePath
    if (this.isMac) {
      if (appPath.includes('.app/')) appPath = appPath.substring(0, appPath.indexOf('.app') + 4)
      if (!appPath.endsWith('.app')) return
      if (!this._isWatchPathCandidate(appPath)) {
        return
      }
    }

    logApp(`App deletion detected: ${chalk.cyan(appPath)}`, LogStyle.process)
    this.processingPaths.add(appPath)

    try {
      const fileToDelete = await this.dbUtils!.getFileByPath(appPath)
      if (fileToDelete) {
        const extensions = await this.dbUtils!.getFileExtensions(fileToDelete.id)
        const itemId = extensions.find((e) => e.key === 'bundleId')?.value || fileToDelete.path

        await this.dbUtils!.getDb().transaction(async (tx) => {
          await tx.delete(filesSchema).where(eq(filesSchema.id, fileToDelete.id))
          await tx.delete(fileExtensions).where(eq(fileExtensions.fileId, fileToDelete.id))
        })

        await this.searchIndex?.removeItems([itemId])

        logApp(`App deleted from database: ${chalk.cyan(appPath)}`, LogStyle.success)
      } else {
        logApp(`App to delete not found in database: ${chalk.yellow(appPath)}`, LogStyle.warning)
      }
    } catch (error) {
      logApp(`Error deleting app: ${chalk.red((error as Error).message)}`, LogStyle.error)
    } finally {
      this.processingPaths.delete(appPath)
    }
  }

  private async fetchExtensionsForFiles(files: DbAppRecord[]): Promise<DbAppWithExtensions[]> {
    if (!this.dbUtils) return files.map((f) => ({ ...f, extensions: {} }))

    const fileIds = files.map((f) => f.id)
    if (fileIds.length === 0) return []

    const db = this.dbUtils.getDb()

    // Chunk the query to avoid a single massive IN(...) that blocks the event
    // loop while SQLite scans hundreds of IDs.  Yield between chunks.
    const CHUNK_SIZE = 50
    const extensionsByFileId: Record<number, Record<string, string | null>> = {}

    for (let i = 0; i < fileIds.length; i += CHUNK_SIZE) {
      const chunk = fileIds.slice(i, i + CHUNK_SIZE)
      const rows = await db
        .select()
        .from(fileExtensions)
        .where(inArray(fileExtensions.fileId, chunk))

      for (const ext of rows) {
        if (!extensionsByFileId[ext.fileId]) {
          extensionsByFileId[ext.fileId] = {}
        }
        if (ext.value) {
          extensionsByFileId[ext.fileId][ext.key] = ext.value
        }
      }

      // Yield between chunks to keep the event loop responsive
      if (i + CHUNK_SIZE < fileIds.length) {
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
    }

    return files.map((file) => ({
      ...file,
      extensions: extensionsByFileId[file.id] || {}
    }))
  }

  async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    const { item, searchResult } = args

    const sessionId = searchResult?.sessionId
    if (sessionId) {
      logApp(`Recording app execution: ${chalk.cyan(item.id)}`, LogStyle.info)
      searchEngineCore.recordExecute(sessionId, item).catch((err) => {
        logApp(`Failed to record execution: ${chalk.red(err.message)}`, LogStyle.error)
      })
    }

    const appMeta = (item.meta?.app as
      | {
          path?: string
          launchKind?: AppLaunchKind
          launchTarget?: string
          launchArgs?: string
          workingDirectory?: string
        }
      | undefined) ?? { path: undefined }
    const appPath = appMeta.path
    if (!appPath) {
      logApp('Execution failed: App path not found', LogStyle.error)
      return null
    }

    const launchKind = appMeta.launchKind || 'path'
    const launchTarget = appMeta.launchTarget || appPath
    const launchArgs = appMeta.launchArgs
    const workingDirectory = appMeta.workingDirectory

    if (launchKind === 'shortcut') {
      logApp(`Launching shortcut app: ${chalk.cyan(launchTarget)}`, LogStyle.process)
      try {
        const child = spawnSafe(launchTarget, splitLaunchArgs(launchArgs), {
          cwd: workingDirectory,
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        })
        child.unref()
        logApp(`App launched successfully: ${chalk.green(appPath)}`, LogStyle.success)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logApp(`Failed to launch shortcut app: ${chalk.red(message)}`, LogStyle.error)
      }
      return null
    }

    if (launchKind === 'uwp') {
      const explorerTarget = `shell:AppsFolder\\${launchTarget}`
      logApp(`Launching Windows Store app: ${chalk.cyan(explorerTarget)}`, LogStyle.process)
      try {
        const child = spawnSafe('explorer.exe', [explorerTarget], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        })
        child.unref()
        logApp(
          `Windows Store app launched successfully: ${chalk.green(explorerTarget)}`,
          LogStyle.success
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logApp(`Failed to launch Windows Store app: ${chalk.red(message)}`, LogStyle.error)
      }
      return null
    }

    logApp(`Opening app: ${chalk.cyan(launchTarget)}`, LogStyle.process)
    void shell
      .openPath(launchTarget)
      .then((errorMessage) => {
        if (errorMessage) {
          logApp(`Failed to open app: ${chalk.red(errorMessage)}`, LogStyle.error)
          return
        }
        logApp(`App opened successfully: ${chalk.green(launchTarget)}`, LogStyle.success)
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        logApp(`Failed to open app: ${chalk.red(message)}`, LogStyle.error)
      })

    return null
  }

  async onSearch(query: TuffQuery): Promise<TuffSearchResult> {
    const searchStart = startTiming()
    logApp(`Performing search: ${chalk.cyan(query.text)}`, LogStyle.process)

    if (!this.dbUtils || !this.searchIndex) {
      logApp('Search dependencies not ready, returning empty result', LogStyle.warning)
      return new TuffSearchResultBuilder(query).build()
    }

    const rawText = query.text.trim()
    if (!rawText) {
      return new TuffSearchResultBuilder(query).build()
    }

    const db = this.dbUtils.getDb()
    const normalizedQuery = rawText.toLowerCase()
    const baseTerms = normalizedQuery.split(/[\s/]+/).filter(Boolean)
    const terms = baseTerms.length > 0 ? baseTerms : [normalizedQuery]

    let preciseMatchedItemIds: Set<string> | null = null
    if (terms.length > 0) {
      const preciseStart = startTiming()
      logApp(`Executing precise query: ${chalk.cyan(terms.join(', '))}`, LogStyle.info)

      const preciseResults = await Promise.all(
        terms.map((term) =>
          db
            .select({ itemId: keywordMappings.itemId })
            .from(keywordMappings)
            .where(and(eq(keywordMappings.keyword, term), eq(keywordMappings.providerId, this.id)))
            .limit(200)
        )
      )

      const termMatches = preciseResults.map((rows) => new Set(rows.map((entry) => entry.itemId)))
      if (termMatches.length > 0) {
        preciseMatchedItemIds = termMatches.reduce<Set<string> | null>((accumulator, current) => {
          if (!accumulator) return current
          return new Set([...accumulator].filter((id) => current.has(id)))
        }, null)
      }
      logAppDuration(
        'PreciseLookup',
        preciseStart,
        {
          label: 'Precise term lookup',
          style: 'info',
          unit: 'ms',
          precision: 0,
          suffix: `with ${chalk.cyan(preciseMatchedItemIds?.size ?? 0)} result(s)`
        },
        { logger: (message) => appProviderLog.debug(message) }
      )
    }

    const shouldCheckPhrase = baseTerms.length > 1 || baseTerms.length === 0
    if (shouldCheckPhrase) {
      const phraseStart = startTiming()
      const phraseMatches = await db
        .select({ itemId: keywordMappings.itemId })
        .from(keywordMappings)
        .where(
          and(eq(keywordMappings.keyword, normalizedQuery), eq(keywordMappings.providerId, this.id))
        )
        .limit(200)

      if (phraseMatches.length > 0) {
        const phraseSet = new Set(phraseMatches.map((entry) => entry.itemId))
        preciseMatchedItemIds = preciseMatchedItemIds
          ? new Set([...preciseMatchedItemIds, ...phraseSet])
          : phraseSet
      }
      logAppDuration(
        'PhraseLookup',
        phraseStart,
        {
          label: 'Phrase lookup',
          style: 'info',
          unit: 'ms',
          precision: 0,
          suffix: `with ${chalk.cyan(preciseMatchedItemIds?.size ?? 0)} accumulated result(s)`
        },
        { logger: (message) => appProviderLog.debug(message) }
      )
    }

    // Prefix recall for short queries (e.g. "f" → "feishu", "wind" → "windsurf")
    // Precise lookup uses exact match which misses prefix relationships
    if (normalizedQuery.length <= 5) {
      const prefixStart = startTiming()
      const prefixResults = await this.searchIndex.lookupByKeywordPrefix(
        this.id,
        normalizedQuery,
        200
      )
      if (prefixResults.length > 0) {
        const prefixSet = new Set(prefixResults.map((r) => r.itemId))
        preciseMatchedItemIds = preciseMatchedItemIds
          ? new Set([...preciseMatchedItemIds, ...prefixSet])
          : prefixSet
      }
      logAppDuration(
        'PrefixLookup',
        prefixStart,
        {
          label: 'Prefix keyword lookup',
          style: 'info',
          unit: 'ms',
          precision: 0,
          suffix: `with ${chalk.cyan(prefixResults.length)} prefix match(es)`
        },
        { logger: (message) => appProviderLog.debug(message) }
      )
    }

    const ftsQuery = this.buildFtsQuery(terms)
    const ftsStart = startTiming()
    const ftsMatches = ftsQuery ? await this.searchIndex.search(this.id, ftsQuery, 150) : []
    if (ftsQuery) {
      logAppDuration(
        'FTSSearch',
        ftsStart,
        {
          label: 'FTS search',
          style: 'info',
          unit: 'ms',
          precision: 0,
          suffix: `(${chalk.cyan(ftsQuery)}) returned ${chalk.cyan(ftsMatches.length)} matches`
        },
        { logger: (message) => appProviderLog.debug(message) }
      )
    }

    const preciseCandidates = preciseMatchedItemIds ? Array.from(preciseMatchedItemIds) : []
    const maxCandidateCount = 120
    const candidateIds = new Set<string>(preciseCandidates)

    for (const match of ftsMatches) {
      if (candidateIds.size >= maxCandidateCount) break
      candidateIds.add(match.itemId)
    }

    // N-gram fuzzy recall: when FTS + precise results are insufficient,
    // use n-gram overlap to find candidates that may have typos (e.g. "aplpe" → "apple")
    const NGRAM_RECALL_THRESHOLD = 5
    if (candidateIds.size < NGRAM_RECALL_THRESHOLD && normalizedQuery.length >= 3) {
      const ngramStart = startTiming()
      const ngramCandidates = await this.searchIndex.lookupByNgrams(this.id, normalizedQuery, 30)

      for (const candidate of ngramCandidates) {
        if (candidateIds.size >= maxCandidateCount) break
        candidateIds.add(candidate.itemId)
      }

      logAppDuration(
        'NgramRecall',
        ngramStart,
        {
          label: 'N-gram fuzzy recall',
          style: 'info',
          unit: 'ms',
          precision: 0,
          suffix: `recalled ${chalk.cyan(ngramCandidates.length)} candidates`
        },
        { logger: (message) => appProviderLog.debug(message) }
      )
    }

    // Subsequence recall: "nte" → "netease", "wc" → "wechat"
    // Catches cases where query chars appear in order but not contiguously
    const SUBSEQ_RECALL_THRESHOLD = 5
    if (candidateIds.size < SUBSEQ_RECALL_THRESHOLD && normalizedQuery.length >= 2) {
      const subseqStart = startTiming()
      const subseqResults = await this.searchIndex.lookupBySubsequence(this.id, normalizedQuery, 50)

      for (const result of subseqResults) {
        if (candidateIds.size >= maxCandidateCount) break
        candidateIds.add(result.itemId)
      }

      logAppDuration(
        'SubseqRecall',
        subseqStart,
        {
          label: 'Subsequence recall',
          style: 'info',
          unit: 'ms',
          precision: 0,
          suffix: `recalled ${chalk.cyan(subseqResults.length)} candidates`
        },
        { logger: (message) => appProviderLog.debug(message) }
      )
    }

    if (candidateIds.size === 0) {
      logApp('No candidates found for query, returning empty result', LogStyle.info)
      return new TuffSearchResultBuilder(query).build()
    }

    const candidateList = Array.from(candidateIds)
    const fetchStart = startTiming()
    const subquery = db
      .select({ fileId: fileExtensions.fileId })
      .from(fileExtensions)
      .where(
        and(
          inArray(fileExtensions.key, [...APP_IDENTIFIER_EXTENSION_KEYS]),
          inArray(fileExtensions.value, candidateList)
        )
      )

    const files = await db
      .select()
      .from(filesSchema)
      .where(
        and(
          eq(filesSchema.type, 'app'),
          or(inArray(filesSchema.path, candidateList), inArray(filesSchema.id, subquery))
        )
      )

    logAppDuration(
      'LoadCandidates',
      fetchStart,
      {
        label: `Loaded ${chalk.cyan(files.length)} candidate app rows`,
        style: 'info',
        unit: 'ms',
        precision: 0
      },
      { logger: (message) => appProviderLog.debug(message) }
    )

    if (files.length === 0) {
      logApp('Candidate mapping returned no rows, search result empty', LogStyle.warning)
      return new TuffSearchResultBuilder(query).build()
    }

    const appsWithExtensions = await this.fetchExtensionsForFiles(files)
    const filteredAppsWithExtensions =
      this.isMac && this.appIndexSettings.hideNoisySystemApps
        ? (() => {
            const ruleCounts: Record<string, number> = {}
            const filtered = appsWithExtensions.filter((app) => {
              const rule = matchNoisySystemAppRule({
                path: app.path,
                bundleId: app.extensions.bundleId,
                name: app.displayName || app.name
              })
              if (!rule) {
                return true
              }
              ruleCounts[rule] = (ruleCounts[rule] ?? 0) + 1
              return false
            })
            const filteredCount = appsWithExtensions.length - filtered.length
            if (filteredCount > 0) {
              appProviderLog.debug('Filtered noisy system apps from search candidates', {
                query: rawText,
                filteredCount,
                ruleCounts
              })
            }
            return filtered
          })()
        : appsWithExtensions
    const isFuzzySearch = !preciseMatchedItemIds || preciseMatchedItemIds.size === 0

    const processedResults = await processSearchResults(
      filteredAppsWithExtensions,
      query,
      isFuzzySearch,
      this.aliases
    )

    const sortedItems = processedResults.map((item) => {
      const { score: _score, ...rest } = item
      return rest
    })

    const elapsedMs = performance.now() - searchStart
    if (elapsedMs > SLOW_SEARCH_THRESHOLD_MS) {
      logAppDurationMs(
        'SlowSearch',
        elapsedMs,
        {
          label: 'Slow search',
          message: `Slow search: ${chalk.cyan(rawText)}`,
          style: 'warning',
          unit: 's',
          precision: 2,
          suffix: `returned ${chalk.green(sortedItems.length)} results (precise=${chalk.cyan(
            preciseMatchedItemIds?.size ?? 0
          )}, fts=${chalk.cyan(ftsMatches.length)})`
        },
        {
          logThresholds: { none: SLOW_SEARCH_THRESHOLD_MS, info: 1000, warn: 2500 },
          logger: (message) => appProviderLog.warn(message)
        }
      )
    }

    return new TuffSearchResultBuilder(query).setItems(sortedItems).build()
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
    return limitedTokens.join(' ')
  }

  private _subscribeToFSEvents(): void {
    // Windows: 跳过文件系统事件订阅，避免权限问题
    if (process.platform === 'win32') {
      logApp('Skipping FS event subscription on Windows', LogStyle.info)
      return
    }

    logApp('Subscribing to file system events', LogStyle.info)

    if (this.isMac) {
      touchEventBus.on(TalexEvents.DIRECTORY_ADDED, this.handleItemAddedOrChanged)
      touchEventBus.on(TalexEvents.DIRECTORY_UNLINKED, this.handleItemUnlinked)
    } else {
      touchEventBus.on(TalexEvents.FILE_ADDED, this.handleItemAddedOrChanged)
      touchEventBus.on(TalexEvents.FILE_UNLINKED, this.handleItemUnlinked)
    }

    touchEventBus.on(TalexEvents.FILE_CHANGED, this.handleItemAddedOrChanged)
  }

  private _unsubscribeFromFSEvents(): void {
    logApp('Unsubscribing from file system events', LogStyle.info)

    touchEventBus.off(TalexEvents.DIRECTORY_ADDED, this.handleItemAddedOrChanged)
    touchEventBus.off(TalexEvents.DIRECTORY_UNLINKED, this.handleItemUnlinked)
    touchEventBus.off(TalexEvents.FILE_ADDED, this.handleItemAddedOrChanged)
    touchEventBus.off(TalexEvents.FILE_UNLINKED, this.handleItemUnlinked)
    touchEventBus.off(TalexEvents.FILE_CHANGED, this.handleItemAddedOrChanged)
  }

  private _registerWatchPaths(): void {
    // Windows: 跳过目录监视，避免 EPERM 权限错误
    if (process.platform === 'win32') {
      logApp('Skipping watch path registration on Windows', LogStyle.info)
      return
    }

    const watchPaths = appScanner.getWatchPaths()
    logApp(`Registering watch paths: ${chalk.cyan(watchPaths.join(', '))}`, LogStyle.info)

    for (const p of watchPaths) {
      const depth = this.isMac && (p === '/Applications' || p.endsWith('/Applications')) ? 1 : 4
      FileSystemWatcher.addPath(p, depth)
    }
  }

  private _isWatchPathCandidate(appPath: string): boolean {
    if (!this.isMac) {
      return true
    }

    const normalizedPath = path.resolve(appPath)
    const watchRoots = appScanner
      .getWatchPaths()
      .filter((watchPath) => Boolean(watchPath) && existsSync(watchPath))
      .map((watchPath) => path.resolve(watchPath))

    if (watchRoots.length === 0) {
      return true
    }

    return watchRoots.some(
      (root) => normalizedPath === root || normalizedPath.startsWith(`${root}${path.sep}`)
    )
  }

  private async _waitForItemStable(itemPath: string, delay = 500, retries = 5): Promise<boolean> {
    logApp(`Waiting for item to stabilize: ${chalk.cyan(itemPath)}`, LogStyle.info)

    for (let i = 0; i < retries; i++) {
      try {
        const size1 = (await fs.stat(itemPath)).size
        await new Promise((resolve) => setTimeout(resolve, delay))
        const size2 = (await fs.stat(itemPath)).size

        if (size1 === size2) {
          logApp(`Item stabilized: ${chalk.green(itemPath)}`, LogStyle.success)
          await sleep(1000)
          return true
        } else {
          logApp(
            `Item still changing: ${chalk.yellow(itemPath)}, retry ${i + 1}/${retries}`,
            LogStyle.info
          )
        }
      } catch (error) {
        logApp(
          `Failed to check item stability: ${chalk.red((error as Error).message)}`,
          LogStyle.error
        )
        return false
      }
    }

    logApp(`Item did not stabilize: ${chalk.yellow(itemPath)}`, LogStyle.warning)
    return false
  }

  private getMainWindow(): BrowserWindow | null {
    const primary = ($app as { window?: { window?: BrowserWindow } }).window?.window
    if (primary && !primary.isDestroyed()) {
      return primary
    }

    const fallback = BrowserWindow.getAllWindows()[0]
    if (!fallback || fallback.isDestroyed()) {
      return null
    }
    return fallback
  }

  private isMainRendererLoading(): boolean {
    const win = this.getMainWindow()
    if (!win) return false
    const webContents = win.webContents
    if (!webContents || webContents.isDestroyed()) return false
    return webContents.isLoadingMainFrame()
  }

  private async waitForMainRendererReady(timeoutMs = STARTUP_HEAVY_TASK_WAIT_RENDERER_TIMEOUT_MS) {
    const win = this.getMainWindow()
    if (!win) return

    const webContents = win.webContents
    if (!webContents || webContents.isDestroyed()) return
    if (!webContents.isLoadingMainFrame()) return

    logApp('Main renderer is loading, postpone heavy app scan tasks', LogStyle.info)

    await new Promise<void>((resolve) => {
      let settled = false
      let timeout: NodeJS.Timeout | null = setTimeout(() => {
        timeout = null
        finish()
      }, timeoutMs)

      const finish = (): void => {
        if (settled) return
        settled = true
        if (timeout) {
          clearTimeout(timeout)
          timeout = null
        }
        webContents.removeListener('did-finish-load', finish)
        webContents.removeListener('did-fail-load', finish)
        webContents.removeListener('render-process-gone', finish)
        resolve()
      }

      webContents.once('did-finish-load', finish)
      webContents.once('did-fail-load', finish)
      webContents.once('render-process-gone', finish)
    })
  }

  private _scheduleMdlsUpdateScan(): void {
    if (process.platform !== 'darwin') {
      logApp('Not on macOS, skipping mdls scan scheduling', LogStyle.info)
      return
    }

    const isDevelopmentRuntime = this.isDevelopmentRuntime()

    if (isDevelopmentRuntime) {
      const delayMs = 15_000 + STARTUP_HEAVY_TASK_EXTRA_DELAY_DEV_MS
      logApp(
        `Deferring dev mode mdls scan by ${Math.round(delayMs / 1000)}s to avoid startup contention`,
        LogStyle.info
      )
      setTimeout(() => {
        void (async () => {
          const lastScanTimestamp = (await this._getLastScanTime()) || 0
          if (
            lastScanTimestamp &&
            Date.now() - lastScanTimestamp < STARTUP_MDLS_SCAN_MIN_INTERVAL_DEV_MS
          ) {
            logApp('Skipping dev mode mdls scan: completed recently', LogStyle.info)
            return
          }

          await this.waitForMainRendererReady()
          await this._runMdlsUpdateScan()
          logApp('Dev mode mdls scan complete', LogStyle.success)
        })()
      }, delayMs)
    }

    logApp('Registering mdls update polling service (10 min interval)', LogStyle.info)
    pollingService.register(
      'app_provider_mdls_update_scan',
      async () => {
        const lastScanTimestamp = (await this._getLastScanTime()) || 0
        const now = Date.now()

        if (!isDevelopmentRuntime && now - lastScanTimestamp > 60 * 60 * 1000) {
          logApp('Over 1 hour since last scan, starting mdls scan', LogStyle.info)
          await this._runMdlsUpdateScan()
        } else if (isDevelopmentRuntime && !lastScanTimestamp) {
          logApp('First scan in dev mode', LogStyle.info)
          await this.waitForMainRendererReady()
          await this._runMdlsUpdateScan()
        } else {
          appProviderLog.debug(
            `${chalk.cyan(((now - lastScanTimestamp) / (60 * 1000)).toFixed(1))} minutes since last scan, skipping`
          )
        }
      },
      { interval: 10, unit: 'minutes' }
    )
  }

  public async rebuildIndex(): Promise<AppIndexRebuildResult> {
    if (!this.context || !this.dbUtils) {
      const error = 'Cannot rebuild: initialization context not available'
      logApp(error, LogStyle.error)
      return { success: false, error }
    }

    try {
      await this._forceRebuild()
      return {
        success: true,
        message: 'App index rebuild complete'
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logApp('App index rebuild failed', LogStyle.error, { error: message })
      return { success: false, error: message }
    }
  }

  private async _runManualRebuild(): Promise<void> {
    await this.runMaintenanceTask('manual-rebuild', async () => {
      await this._performRebuild()
    })
  }

  private async _performRebuild(): Promise<void> {
    logApp('Forcing app database rebuild...', LogStyle.process)

    if (!this.context || !this.dbUtils) {
      throw new Error('Cannot rebuild: initialization context not available')
    }

    const db = this.dbUtils.getDb()
    const appRows = await db
      .select({ id: filesSchema.id })
      .from(filesSchema)
      .where(eq(filesSchema.type, 'app'))
    const appIds = appRows.map((row) => row.id)

    if (appIds.length > 0) {
      await db.transaction(async (tx) => {
        await tx.delete(fileExtensions).where(inArray(fileExtensions.fileId, appIds))
        await tx.delete(filesSchema).where(inArray(filesSchema.id, appIds))
      })
    }

    await this._clearPendingDeletions()
    await this.searchIndex?.removeByProvider(this.id)

    logApp('Database cleared, rebuilding app index...', LogStyle.info)

    this.isInitializing = null
    await this._performFullSync(true)

    logApp('App database rebuild complete', LogStyle.success)
  }

  private async _forceRebuild(): Promise<void> {
    await this._runManualRebuild()
  }

  private async _getConfigTimestamp(key: string): Promise<number | null> {
    if (!this.dbUtils) return null

    try {
      const db = this.dbUtils.getDb()
      const result = await db.select().from(configSchema).where(eq(configSchema.key, key)).limit(1)

      if (result.length > 0 && result[0].value) {
        const parsed = Number.parseInt(result[0].value, 10)
        if (!Number.isNaN(parsed)) return parsed
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logApp(`Failed to read config ${key}: ${message}`, LogStyle.warning)
    }

    return null
  }

  private async _setConfigValue(key: string, value: string): Promise<boolean> {
    if (!this.dbUtils) return false

    const db = this.dbUtils.getDb()
    try {
      await dbWriteScheduler.schedule(`app-provider.config.${key}`, () =>
        withSqliteRetry(
          () =>
            db.insert(configSchema).values({ key, value }).onConflictDoUpdate({
              target: configSchema.key,
              set: { value }
            }),
          { label: `app-provider.config.${key}` }
        )
      )
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logApp(`Failed to persist config ${key}: ${message}`, LogStyle.warning)
      return false
    }
  }

  private async _setConfigTimestamp(key: string, timestamp: number): Promise<boolean> {
    return this._setConfigValue(key, timestamp.toString())
  }

  private async _setLastBackfillTime(timestamp: number): Promise<void> {
    await this._setConfigTimestamp(BACKFILL_LAST_RUN_CONFIG_KEY, timestamp)
  }

  private async _getLastBackfillTime(): Promise<number | null> {
    return this._getConfigTimestamp(BACKFILL_LAST_RUN_CONFIG_KEY)
  }

  private async _getLastFullSyncTime(): Promise<number | null> {
    const persisted = await this._getConfigTimestamp(FULL_SYNC_LAST_RUN_CONFIG_KEY)
    if (persisted && this.volatileLastFullSyncTime) {
      return Math.max(persisted, this.volatileLastFullSyncTime)
    }
    return persisted ?? this.volatileLastFullSyncTime
  }

  private async _setLastFullSyncTime(timestamp: number): Promise<void> {
    this.volatileLastFullSyncTime = timestamp

    const retryCount = Math.max(1, this.appIndexSettings.fullSyncPersistRetry)
    for (let attempt = 0; attempt < retryCount; attempt++) {
      const persisted = await this._setConfigTimestamp(FULL_SYNC_LAST_RUN_CONFIG_KEY, timestamp)
      if (persisted) {
        return
      }
      if (attempt < retryCount - 1) {
        const delayMs = FULL_SYNC_PERSIST_RETRY_BASE_DELAY_MS * (attempt + 1)
        await sleep(delayMs)
      }
    }

    logApp(
      `Failed to persist full sync timestamp after ${retryCount} attempts, using in-memory fallback`,
      LogStyle.warning
    )
  }

  private async _getLastScanTime(): Promise<number | null> {
    return this._getConfigTimestamp('app_provider_last_mdls_scan')
  }

  private async _setLastScanTime(timestamp: number): Promise<void> {
    await this._setConfigTimestamp('app_provider_last_mdls_scan', timestamp)
  }

  private async _getLastMdlsLocale(): Promise<string | null> {
    if (!this.dbUtils) return null
    const db = this.dbUtils.getDb()
    const result = await db
      .select({ value: configSchema.value })
      .from(configSchema)
      .where(eq(configSchema.key, 'app_provider_last_mdls_locale'))
      .limit(1)
    return result[0]?.value ?? null
  }

  private async _setLastMdlsLocale(locale: string): Promise<void> {
    await this._setConfigValue('app_provider_last_mdls_locale', locale)
  }

  private async _getKnownMissingIconApps(): Promise<Set<string>> {
    if (!this.dbUtils) return new Set()

    const db = this.dbUtils.getDb()

    try {
      const result = await db
        .select({ value: configSchema.value })
        .from(configSchema)
        .where(eq(configSchema.key, MISSING_ICON_CONFIG_KEY))
        .limit(1)

      const rawValue = result[0]?.value
      if (!rawValue) return new Set()

      const parsed = JSON.parse(rawValue)
      if (!Array.isArray(parsed)) return new Set()

      const ids = parsed.filter(
        (item): item is string => typeof item === 'string' && item.length > 0
      )
      return new Set(ids)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logApp(
        `Failed to load missing icon config, continuing without cache: ${message}`,
        LogStyle.warning
      )
      return new Set()
    }
  }

  private async _saveKnownMissingIconApps(appIds: Set<string>): Promise<void> {
    if (!this.dbUtils) return

    const serializedIds = JSON.stringify(Array.from(appIds))

    await this._setConfigValue(MISSING_ICON_CONFIG_KEY, serializedIds)
  }

  private _runMdlsUpdateScan(): Promise<void> {
    return this.runMaintenanceTask('mdls-update-scan', async () => {
      await this._performMdlsUpdateScan()
    })
  }

  private async _performMdlsUpdateScan(): Promise<void> {
    if (process.platform !== 'darwin') {
      logApp('Not on macOS, skipping mdls scan', LogStyle.info)
      return
    }

    if (!this.dbUtils) {
      logApp('Database not initialized, cannot run mdls scan', LogStyle.error)
      return
    }

    const dbUtils = this.dbUtils

    logApp('Starting mdls update scan...', LogStyle.process)

    const t0 = performance.now()
    const allDbApps = await dbUtils.getFilesByType('app')
    const t1 = performance.now()
    if (allDbApps.length === 0) {
      logApp('No apps in DB, skipping mdls scan', LogStyle.info)
      return
    }

    await new Promise<void>((resolve) => setImmediate(resolve))

    const dbAppsWithExtensions = await this.fetchExtensionsForFiles(allDbApps)
    const t2 = performance.now()

    await new Promise<void>((resolve) => setImmediate(resolve))

    const scannedApps: ScannedAppInfo[] = []
    for (let mi = 0; mi < dbAppsWithExtensions.length; mi++) {
      scannedApps.push(this._mapDbAppToScannedInfo(dbAppsWithExtensions[mi]))
      if ((mi + 1) % 50 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
    }
    const dbAppsByUniqueId = new Map(
      dbAppsWithExtensions.map((app) => [this.resolveDbAppKey(app), app])
    )

    // Detect system locale change — if the user switched language, mdls will
    // return new displayNames so we must force a full re-scan.
    // Also force full scan on first run (lastLocale is null) to ensure correct
    // localized names override any English fallbacks from initial plist parsing.
    const currentLocale = app.getLocale()
    const lastLocale = await this._getLastMdlsLocale()
    const localeChanged = lastLocale !== null && lastLocale !== currentLocale
    const isFirstMdlsScan = lastLocale === null

    let appsNeedingMdls: typeof scannedApps
    let appsWithDisplayName: typeof scannedApps

    if (localeChanged || isFirstMdlsScan) {
      logApp(
        isFirstMdlsScan
          ? `First mdls scan (locale: ${chalk.green(currentLocale)}), scanning all apps`
          : `System locale changed (${chalk.yellow(lastLocale)} → ${chalk.green(currentLocale)}), forcing full mdls rescan`,
        LogStyle.info
      )
      appsNeedingMdls = scannedApps
      appsWithDisplayName = []
    } else {
      appsNeedingMdls = scannedApps.filter((app) => !app.displayName)
      appsWithDisplayName = scannedApps.filter((app) => app.displayName)
    }

    logApp(
      `mdls scan: ${chalk.cyan(appsNeedingMdls.length)} apps need mdls, ${chalk.green(appsWithDisplayName.length)} skipped${localeChanged ? ' (locale changed, full rescan)' : ''}`,
      LogStyle.info
    )

    const { updatedApps, updatedCount, deletedApps } = await appScanner.runMdlsUpdateScan(
      appsNeedingMdls,
      appsWithDisplayName
    )
    const t3 = performance.now()

    if (updatedCount > 0 && updatedApps.length > 0) {
      const db = dbUtils.getDb()

      for (const app of updatedApps) {
        const dbApp = dbAppsByUniqueId.get(this.resolveScannedAppKey(app))
        if (!dbApp) {
          continue
        }
        await runWithSqliteBusyRetry(() =>
          db
            .update(filesSchema)
            .set({ displayName: app.displayName })
            .where(eq(filesSchema.id, dbApp.id))
        )

        const appInfo = this._mapDbAppToScannedInfo({
          ...dbApp,
          displayName: app.displayName ?? dbApp.displayName
        })

        const itemId = appInfo.uniqueId
        await this.searchIndex?.removeItems([itemId])
        await this._syncKeywordsForApp(appInfo)
      }
    }
    const t4 = performance.now()

    if (deletedApps.length > 0) {
      const db = dbUtils.getDb()
      logApp(
        `Deleting ${chalk.yellow(deletedApps.length)} missing apps from database`,
        LogStyle.process
      )

      for (const app of deletedApps) {
        try {
          const dbApp = dbAppsByUniqueId.get(this.resolveScannedAppKey(app))
          if (!dbApp) {
            logApp(`App deletion target not found: ${chalk.yellow(app.path)}`, LogStyle.warning)
            continue
          }
          const extensions = await dbUtils.getFileExtensions(dbApp.id)
          const itemId = extensions.find((e) => e.key === 'bundleId')?.value || dbApp.path

          await db.transaction(async (tx) => {
            await tx.delete(filesSchema).where(eq(filesSchema.id, dbApp.id))
            await tx.delete(fileExtensions).where(eq(fileExtensions.fileId, dbApp.id))
          })

          await this.searchIndex?.removeItems([itemId])

          logApp(`App deleted from database: ${chalk.cyan(dbApp.path)}`, LogStyle.success)
        } catch (error) {
          logApp(
            `Error deleting app ${chalk.red(app.path)}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            LogStyle.error
          )
        }
      }
    }
    const t5 = performance.now()

    await this._setLastScanTime(Date.now())
    await this._setLastMdlsLocale(currentLocale)

    logApp(
      `mdlsUpdateScan timing: dbQuery=${Math.round(t1 - t0)}ms fetchExt=${Math.round(t2 - t1)}ms scan=${Math.round(t3 - t2)}ms(${appsNeedingMdls.length}mdls+${appsWithDisplayName.length}skip) dbUpdate=${Math.round(t4 - t3)}ms(${updatedCount}upd) dbDelete=${Math.round(t5 - t4)}ms(${deletedApps.length}del) total=${Math.round(t5 - t0)}ms`,
      LogStyle.info
    )
  }

  private async _getPendingDeletions(): Promise<Map<string, PendingDeletionEntry>> {
    if (!this.dbUtils) return new Map()

    const db = this.dbUtils.getDb()

    try {
      const result = await db
        .select({ value: configSchema.value })
        .from(configSchema)
        .where(eq(configSchema.key, PENDING_DELETION_CONFIG_KEY))
        .limit(1)

      const rawValue = result[0]?.value
      if (!rawValue) return new Map()

      const parsed = JSON.parse(rawValue) as PendingDeletionEntry[]
      if (!Array.isArray(parsed)) return new Map()

      return new Map(parsed.map((entry) => [entry.uniqueId, entry]))
    } catch (error) {
      logApp(
        `Failed to load pending deletions: ${error instanceof Error ? error.message : String(error)}`,
        LogStyle.warning
      )
      return new Map()
    }
  }

  private async _savePendingDeletions(entries: Map<string, PendingDeletionEntry>): Promise<void> {
    if (!this.dbUtils) return

    const serialized = JSON.stringify(Array.from(entries.values()))

    await this._setConfigValue(PENDING_DELETION_CONFIG_KEY, serialized)
  }

  private async _clearPendingDeletions(): Promise<void> {
    await this._savePendingDeletions(new Map())
  }

  private async _processAppsForDeletion(
    missingApps: Array<{ id: number; path: string; uniqueId: string }>
  ): Promise<number[]> {
    const now = Date.now()
    const pendingDeletions = await this._getPendingDeletions()
    const confirmedDeleteIds: number[] = []
    let pendingUpdated = false

    for (const app of missingApps) {
      // First check if file actually exists on disk
      if (existsSync(app.path)) {
        // File exists, remove from pending if present
        if (pendingDeletions.has(app.uniqueId)) {
          logApp(
            `App reappeared, removing from pending deletion: ${chalk.green(app.path)}`,
            LogStyle.info
          )
          pendingDeletions.delete(app.uniqueId)
          pendingUpdated = true
        }
        continue
      }

      // File doesn't exist, check pending status
      const existing = pendingDeletions.get(app.uniqueId)

      if (!existing) {
        // First time missing, add to pending
        logApp(
          `App missing (1st time), adding to pending deletion: ${chalk.yellow(app.path)}`,
          LogStyle.info
        )
        pendingDeletions.set(app.uniqueId, {
          id: app.id,
          path: app.path,
          uniqueId: app.uniqueId,
          firstMissedAt: now,
          missCount: 1
        })
        pendingUpdated = true
      } else {
        // Already pending, increment miss count
        existing.missCount++
        pendingUpdated = true

        const elapsed = now - existing.firstMissedAt
        const graceExpired = elapsed >= DELETION_GRACE_PERIOD_MS
        const minMissCountReached = existing.missCount >= DELETION_MIN_MISS_COUNT

        if (graceExpired && minMissCountReached) {
          // Grace period expired and min miss count reached, confirm deletion
          logApp(
            `App confirmed for deletion (missed ${existing.missCount} times, ${(elapsed / 1000).toFixed(0)}s elapsed): ${chalk.red(app.path)}`,
            LogStyle.warning
          )
          confirmedDeleteIds.push(app.id)
          pendingDeletions.delete(app.uniqueId)
        } else {
          logApp(
            `App still in grace period (missed ${existing.missCount} times, ${(elapsed / 1000).toFixed(0)}s/${(DELETION_GRACE_PERIOD_MS / 1000).toFixed(0)}s): ${chalk.yellow(app.path)}`,
            LogStyle.info
          )
        }
      }
    }

    if (pendingUpdated) {
      await this._savePendingDeletions(pendingDeletions)
    }

    return confirmedDeleteIds
  }
}

// 导出单例
export const appProvider = new AppProvider()
