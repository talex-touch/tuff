import type { TimingLogLevel, TimingMeta, TimingOptions } from '@talex-touch/utils'
import type {
  IndexedSourceDelta,
  IndexedSourceEvidence,
  IndexedSourceHealth,
  IndexedSourceRecord,
  IndexedSourceRecordBatch,
  IndexedSourceReconcileRequest,
  IndexedSourceReconcileResult,
  IndexedSourceRoot,
  IndexedSourceResetRequest,
  IndexedSourceResetResult,
  IndexedSourceScanRequest,
  IndexedSourceWatchEvent
} from '@talex-touch/utils/search'
import type {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils/core-box'
import type { SearchIndexService } from '../../search-engine/search-index-service'
import type { ProviderContext } from '../../search-engine/types'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import type {
  AppIndexAddPathResult,
  AppIndexDiagnoseRequest,
  AppIndexEntryMutationResult,
  AppIndexManagedEntry,
  AppIndexReindexRequest,
  AppIndexUpsertEntryRequest
} from '@talex-touch/utils/transport/events/types'
import { completeTiming, sleep, startTiming, StorageList, timingLogger } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { runAdaptiveTaskQueue } from '@talex-touch/utils/common/utils'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import { TuffInputType, TuffSearchResultBuilder } from '@talex-touch/utils/core-box'
import {
  IndexedSourceGroupedEvidenceService,
  IndexedSourceResetReasons,
  IndexedSourceRootEvidenceService,
  IndexedSourceScanReasons
} from '@talex-touch/utils/search'
import chalk from 'chalk'
import { and, eq, inArray, or, sql } from 'drizzle-orm'

import { app, BrowserWindow } from 'electron'
import type {
  DirectoryAddedEvent,
  DirectoryUnlinkedEvent,
  FileAddedEvent,
  FileChangedEvent,
  FileUnlinkedEvent
} from '../../../../core/eventbus/touch-event'
import { config as configSchema, fileExtensions, files as filesSchema } from '../../../../db/schema'
import { dbWriteScheduler, type DbWritePriority } from '../../../../db/db-write-scheduler'
import { withSqliteRetry } from '../../../../db/sqlite-retry'

import { createDbUtils, type DbUtils } from '../../../../db/utils'
import { appTaskGate } from '../../../../service/app-task-gate'
import { deviceIdleService } from '../../../../service/device-idle-service'
import { getMainConfig, saveMainConfig } from '../../../storage'
import { operationalErrorService } from '../../../observability'
import FileSystemWatcher from '../../file-system-watcher'
import searchEngineCore from '../../search-engine/search-core'
import { appScanner, type AppScannerSourceScanResult } from './app-scanner'
import { scheduleAppLaunch } from './app-launcher'
import { AppProviderSourceScanner } from './app-provider-source-scanner'
import { AppIndexedSourceRecordMapper } from './services/app-index-record-sync-service'
import { AppIndexMaintenanceService } from './services/app-index-maintenance-service'
import { AppManagedEntryService } from './services/app-managed-entry-service'
import {
  isProbablyCorruptedDisplayName,
  normalizeDisplayName,
  resolveDisplayName,
  shouldUpdateDisplayName
} from './display-name-sync-utils'
import {
  APP_ALTERNATE_NAMES_EXTENSION_KEY,
  APP_DISPLAY_PATH_EXTENSION_KEY,
  APP_DISPLAY_NAME_QUALITY_EXTENSION_KEY,
  APP_DISPLAY_NAME_SOURCE_EXTENSION_KEY,
  APP_ENTRY_SOURCE_EXTENSION_KEY,
  APP_ENTRY_SOURCE_MANUAL,
  APP_IDENTIFIER_EXTENSION_KEYS,
  APP_IDENTITY_KIND_EXTENSION_KEY,
  APP_LAUNCH_KIND_EXTENSION_KEY,
  APP_LAUNCH_TARGET_EXTENSION_KEY,
  APP_SCANNED_OPTIONAL_EXTENSION_KEYS,
  buildAppExtensions,
  buildManagedEntryExtensions,
  isAppEntryEnabledExtensionMap,
  isManagedEntryExtensionMap,
  normalizeAppDisplayNameQuality,
  readAlternateNames,
  readAppIdentityKind,
  resolveAppItemId,
  resolveAppItemIds,
  shouldScanMdlsDisplayName
} from './app-index-metadata'
import { matchNoisySystemAppRule } from './app-noise-filter'
import { diagnoseAppSearch, reindexAppSearchTarget } from './app-provider-diagnostics'
import {
  hasAppIconDrift,
  hasAppLaunchMetadataDrift,
  hasStringListDrift,
  resolveMissingScannedExtensionKeys
} from './app-provider-metadata-sync'
import {
  expandWindowsEnvironmentVariables,
  isWindowsUwpAppId,
  isWindowsUwpShellPath
} from './app-provider-path-utils'
import { formatLog, LogStyle, normalizeStringList } from './app-utils'
import {
  APP_SEMANTIC_ALIAS_CATALOG_VERSION,
  resolveScannedAppSemanticAliases
} from './app-semantic-catalog'
import {
  APP_TOOL_SOURCE_CATALOG_VERSION,
  getAppToolSourceCatalogSummary,
  resolveAppToolSourceIds
} from './app-tool-source-catalog'
import { isSearchableAppRow, processSearchResults } from './search-processing-service'
import type { AppLaunchKind, ScannedAppInfo } from './app-types'

const SLOW_SEARCH_THRESHOLD_MS = 400
const APP_INDEX_SCAN_POLL_MS = 75
const appProviderLog = getLogger('app-provider')

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
type AppFileWriteDb = Pick<ReturnType<DbUtils['getDb']>, 'insert' | 'delete'>
type AppFileMutationDb = Pick<ReturnType<DbUtils['getDb']>, 'insert' | 'update' | 'delete'>
type AppIndexSyncStats = {
  added: number
  changed: number
  deleted: number
  skipped: number
  errors: number
}
type AppSourceEvidenceKey =
  | 'watch-roots'
  | 'manual'
  | 'windows-start-menu'
  | 'windows-uwp'
  | 'windows-registry'
  | 'windows-app-paths'
  | 'windows-steam'
  | 'macos-mdfind'
  | 'macos-mdls'
  | 'linux-desktop'
  | 'unknown'
type FileSystemPathEvent =
  | FileAddedEvent
  | FileChangedEvent
  | FileUnlinkedEvent
  | DirectoryAddedEvent
  | DirectoryUnlinkedEvent

const APP_SOURCE_EVIDENCE_LABELS: Record<AppSourceEvidenceKey, string> = {
  'watch-roots': 'Watch roots',
  manual: 'Manual app entries',
  'windows-start-menu': 'Windows Start Menu shortcuts',
  'windows-uwp': 'Windows UWP apps',
  'windows-registry': 'Windows uninstall registry',
  'windows-app-paths': 'Windows App Paths registry',
  'windows-steam': 'Steam apps',
  'macos-mdfind': 'macOS mdfind applications',
  'macos-mdls': 'macOS mdls metadata repair',
  'linux-desktop': 'Linux desktop entries',
  unknown: 'Unclassified app records'
}
const appGroupedEvidenceService = new IndexedSourceGroupedEvidenceService()
const appRootEvidenceService = new IndexedSourceRootEvidenceService()

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

const MISSING_ICON_CONFIG_KEY = 'app_provider_missing_icon_apps'
const PENDING_DELETION_CONFIG_KEY = 'app_provider_pending_deletion'
const BACKFILL_LAST_RUN_CONFIG_KEY = 'app_provider_last_backfill'
const FULL_SYNC_LAST_RUN_CONFIG_KEY = 'app_provider_last_full_sync'
const SEMANTIC_ALIAS_CATALOG_VERSION_CONFIG_KEY = 'app_provider_semantic_alias_catalog_version'
const FULL_SYNC_PERSIST_RETRY_BASE_DELAY_MS = 200
const DELETION_GRACE_PERIOD_MS = 3 * 60 * 1000 // 3 minutes grace period
const DELETION_MIN_MISS_COUNT = 2 // Must be missing for at least 2 scans
const STARTUP_BACKFILL_INITIAL_DELAY_MS = 15_000
const STARTUP_HEAVY_TASK_EXTRA_DELAY_DEV_MS = 30_000
const STARTUP_HEAVY_TASK_WAIT_RENDERER_TIMEOUT_MS = 30_000
const STARTUP_BACKFILL_MIN_INTERVAL_DEV_MS = 6 * 60 * 60 * 1000
const STARTUP_MDLS_SCAN_MIN_INTERVAL_DEV_MS = 6 * 60 * 60 * 1000
const WINDOWS_REALTIME_APP_EXTENSIONS = new Set(['.lnk', '.exe', '.appref-ms'])

function resolveScannedDisplayName(app: Pick<ScannedAppInfo, 'displayName' | 'name'>): string {
  return resolveDisplayName(app.displayName, app.name)
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
  errorCode?: string
  retryable?: boolean
  reportId?: string
}

type AppIndexProcessPathResult = AppIndexAddPathResult & {
  appInfo?: ScannedAppInfo
}

export interface AppIndexedSourceRuntimeDelegate {
  scan(reason: IndexedSourceScanRequest['reason']): Promise<unknown>
  reconcile(reason: string): Promise<unknown>
  applyDelta(delta: IndexedSourceDelta): Promise<unknown>
  reset(request: IndexedSourceResetRequest): Promise<IndexedSourceResetResult>
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
const APP_PROVIDER_SHUTDOWN_DRAIN_TIMEOUT_MS = 30_000

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

  private dbUtils: DbUtils | null = null
  private context: ProviderContext | null = null
  private isInitializing: Promise<void> | null = null
  private readonly isMac = process.platform === 'darwin'
  private processingPaths: Set<string> = new Set()
  private aliases: Record<string, string[]> = {}
  private searchIndex: SearchIndexService | null = null
  private appIndexSettings: AppIndexSettings = { ...DEFAULT_APP_INDEX_SETTINGS }
  private startupBackfillStarted = false
  private startupIndexHealthCheckStarted = false
  private volatileLastFullSyncTime: number | null = null
  private indexedSourceRuntimeDelegate: AppIndexedSourceRuntimeDelegate | null = null
  private shuttingDown = false
  private mdlsReconcileTask: Promise<void> | null = null
  private startupIndexHealthTimer: NodeJS.Timeout | null = null
  private startupIndexHealthTask: Promise<void> | null = null
  private startupBackfillTimer: NodeJS.Timeout | null = null
  private startupBackfillTask: Promise<void> | null = null
  private semanticAliasCatalogTimer: NodeJS.Timeout | null = null
  private semanticAliasCatalogTask: Promise<void> | null = null
  private readonly startupProducerAbort = new AbortController()
  private readonly externalMutationTasks = new Set<Promise<unknown>>()
  private shutdownPreparation: Promise<void> | null = null
  private readonly sourceScanner = new AppProviderSourceScanner({
    resolveScannedAppKey: (app) => this.resolveScannedAppKey(app),
    isManagedEntry: (extensions) => isManagedEntryExtensionMap(extensions),
    logApp: (message, style) => {
      logApp(message, style)
    },
    getKnownMissingIconApps: async () => await this._getKnownMissingIconApps(),
    saveKnownMissingIconApps: async (knownMissingIconApps) => {
      await this._saveKnownMissingIconApps(knownMissingIconApps)
    }
  })
  private readonly recordMapper = new AppIndexedSourceRecordMapper({
    generateKeywords: (app) => this._generateKeywordsForApp(app),
    getAliases: (app) => this._getAliasesForApp(app),
    resolveToolSourceIds: (app) => this.resolveScannedAppToolSourceIds(app)
  })
  private readonly managedEntries = new AppManagedEntryService({
    getDbUtils: () => this.dbUtils,
    fetchExtensions: (apps) => this.fetchExtensionsForFiles(apps),
    mapDbAppToScannedInfo: (app) => this._mapDbAppToScannedInfo(app),
    toExtensionMap: (records) => this.toExtensionMap(records),
    syncKeywords: async (appInfo) => {
      await this.publishAppRuntimeUpsert(appInfo, 'app-managed-entry-upsert')
    },
    removeIndexedItems: async (itemIds) => {
      await this.publishAppRuntimeDeletes(itemIds, 'app-managed-entry-delete')
    },
    syncIndexedState: async (appInfo, extensions) => {
      if (extensions && isAppEntryEnabledExtensionMap(extensions)) {
        await this.publishAppRuntimeUpsert(appInfo, 'app-managed-entry-enabled')
      } else {
        await this.publishAppRuntimeDeletes(
          resolveAppItemIds(appInfo),
          'app-managed-entry-disabled'
        )
      }
    }
  })
  private readonly maintenance = new AppIndexMaintenanceService({
    runFullSyncIfDue: async () => await this._runFullSyncIfDue()
  })

  constructor() {
    logApp('Initializing AppProvider service', LogStyle.info)
  }

  private async runDbMutation<T>(
    label: string,
    operation: () => Promise<T>,
    priority: DbWritePriority = 'background'
  ): Promise<T> {
    return await dbWriteScheduler.schedule(label, () => withSqliteRetry(operation, { label }), {
      priority,
      dropPolicy: 'none'
    })
  }

  private async runAppTransaction<T>(
    db: ReturnType<DbUtils['getDb']>,
    operation: (
      writer: AppFileMutationDb,
      extensionWriter: AppFileWriteDb | undefined
    ) => Promise<T>
  ): Promise<T> {
    if (typeof db.transaction === 'function') {
      return await db.transaction(async (transaction) =>
        operation(
          transaction as unknown as AppFileMutationDb,
          transaction as unknown as AppFileWriteDb
        )
      )
    }
    return await operation(db, undefined)
  }

  public setIndexedSourceRuntimeDelegate(delegate: AppIndexedSourceRuntimeDelegate | null): void {
    this.indexedSourceRuntimeDelegate = delegate
  }

  public async prepareForSearchIndexShutdown(): Promise<void> {
    if (!this.shutdownPreparation) {
      const preparation = (async () => {
        this.shuttingDown = true
        this.startupProducerAbort.abort(new Error('APP_PROVIDER_SHUTTING_DOWN'))
        this.clearStartupProducerTimers()
        pollingService.unregister('app_provider_mdls_update_scan')
        const settlement = Promise.allSettled([
          this.mdlsReconcileTask,
          this.startupIndexHealthTask,
          this.startupBackfillTask,
          this.semanticAliasCatalogTask,
          ...this.externalMutationTasks,
          this.maintenance.stop()
        ])
        await this.awaitShutdownProducerSettlement(settlement)
      })()
      this.shutdownPreparation = preparation
      void preparation.catch(() => {
        if (this.shutdownPreparation === preparation) this.shutdownPreparation = null
      })
    }
    await this.shutdownPreparation
  }

  private async awaitShutdownProducerSettlement(settlement: Promise<unknown>): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('APP_PROVIDER_SHUTDOWN_PRODUCER_TIMEOUT'))
      }, APP_PROVIDER_SHUTDOWN_DRAIN_TIMEOUT_MS)
      timeout.unref?.()
      void settlement.then(
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

  private clearStartupProducerTimers(): void {
    if (this.startupIndexHealthTimer) clearTimeout(this.startupIndexHealthTimer)
    if (this.startupBackfillTimer) clearTimeout(this.startupBackfillTimer)
    if (this.semanticAliasCatalogTimer) clearTimeout(this.semanticAliasCatalogTimer)
    this.startupIndexHealthTimer = null
    this.startupBackfillTimer = null
    this.semanticAliasCatalogTimer = null
  }

  private async waitForStartupProducerDelay(delayMs: number): Promise<void> {
    const signal = this.startupProducerAbort.signal
    if (signal.aborted) return

    await new Promise<void>((resolve) => {
      const finish = (): void => {
        clearTimeout(timer)
        signal.removeEventListener('abort', finish)
        resolve()
      }
      const timer = setTimeout(finish, delayMs)
      signal.addEventListener('abort', finish, { once: true })
    })
  }

  private runExternalAppMutation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.shuttingDown) return Promise.reject(new Error('APP_PROVIDER_SHUTTING_DOWN'))

    const task = operation()
    this.externalMutationTasks.add(task)
    void task.then(
      () => this.externalMutationTasks.delete(task),
      () => this.externalMutationTasks.delete(task)
    )
    return task
  }

  private requireIndexedSourceRuntimeDelegate(): AppIndexedSourceRuntimeDelegate {
    if (!this.indexedSourceRuntimeDelegate) {
      throw new Error('APP_INDEXED_SOURCE_RUNTIME_DELEGATE_UNAVAILABLE')
    }
    return this.indexedSourceRuntimeDelegate
  }

  private async publishAppRuntimeUpsert(appInfo: ScannedAppInfo, reason: string): Promise<void> {
    const record = await this.mapScannedAppToIndexedSourceRecord(this.id, appInfo)
    await this.requireIndexedSourceRuntimeDelegate().applyDelta({
      sourceId: this.id,
      action: 'change',
      record,
      path: appInfo.path,
      reason
    })
  }

  private async publishAppRuntimeDeletes(
    itemIds: readonly string[],
    reason: string
  ): Promise<void> {
    for (const stableKey of new Set(itemIds.filter(Boolean))) {
      await this.requireIndexedSourceRuntimeDelegate().applyDelta({
        sourceId: this.id,
        action: 'delete',
        stableKey,
        reason
      })
    }
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
    this._scheduleFullSync()
    this._scheduleStartupIndexHealthCheck()
    this._scheduleSemanticAliasCatalogSync()

    // 注意：补漏/全量同步会在后台触发关键词同步；实时事件由 IndexingRuntime 统一路由
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
    await this.prepareForSearchIndexShutdown()
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
    return await this.runExternalAppMutation(async () => {
      const appPath = this.resolveAppPath(rawPath, { skipWatchCheck: true })
      if (!appPath) {
        return { success: false, status: 'invalid', reason: 'invalid-path' }
      }
      const { appInfo, ...result } = await this.processAppPath(appPath, {
        managedEntry: true
      })
      if (result.success && appInfo) {
        await this.publishAppRuntimeUpsert(appInfo, 'app-manual-path-upsert')
      }
      return result
    })
  }

  public async diagnoseAppSearch(request: AppIndexDiagnoseRequest) {
    return diagnoseAppSearch(this.createDiagnosticsContext(), request)
  }

  public async getIndexedSourceHealth(): Promise<IndexedSourceHealth> {
    const health = await this.getAppSearchIndexHealth()
    const isWarming = this.isInitializing !== null || this.startupBackfillStarted

    return {
      status: health.healthy ? 'ready' : isWarming ? 'warming' : 'degraded',
      permissionState: 'not-required',
      itemCount: health.appCount,
      watchState: 'active',
      reconcileState: this.maintenance.isFullSyncRegistered() ? 'scheduled' : 'idle',
      reason: health.healthy
        ? undefined
        : `App index rows=${health.appCount}, searchIndexRows=${health.indexedItemCount}`,
      lastIndexedAt: this.volatileLastFullSyncTime ?? undefined
    }
  }

  public getIndexedSourceRoots(): IndexedSourceRoot[] {
    return appScanner.getWatchPaths().map((watchPath) => ({
      sourceId: this.id,
      path: watchPath,
      permissionState: 'not-required',
      watchDepth: this.resolveWatchDepthForPath(watchPath)
    }))
  }

  public async getIndexedSourceEvidence(): Promise<IndexedSourceEvidence[]> {
    const watchRoots = this.getIndexedSourceRoots()
    const evidence: IndexedSourceEvidence[] = [
      appRootEvidenceService.build({
        id: 'app-provider:watch-roots',
        label: APP_SOURCE_EVIDENCE_LABELS['watch-roots'],
        roots: watchRoots.map((root) => root.path),
        emptyReason: 'app-watch-roots-empty'
      })
    ]

    const appEvidence = await this.getIndexedAppRecordEvidence()
    return [...evidence, this.getIndexedToolSourceEvidence(), ...appEvidence]
  }

  public async *scanIndexedSource(
    request: IndexedSourceScanRequest
  ): AsyncIterable<IndexedSourceRecordBatch> {
    if (request.sourceId !== this.id) {
      throw new Error(`Unsupported app index source: ${request.sourceId}`)
    }
    if (request.signal?.aborted) {
      throw request.signal.reason ?? new Error('App index source scan aborted')
    }

    if (request.reason === IndexedSourceScanReasons.SchemaMigration) {
      yield* this.buildIndexedSourceRecordBatches(request.sourceId, request.signal)
      return
    }

    if (request.reason === IndexedSourceScanReasons.ManualRebuild) {
      await this._runManualRebuild()
      yield* this.buildIndexedSourceRecordBatches(request.sourceId, request.signal)
      return
    }

    const task = this._runStartupBackfill(request.signal)
    let backfillSettled = false
    const settlement = task.then(
      () => {
        backfillSettled = true
      },
      () => {
        backfillSettled = true
      }
    )
    const fingerprints = new Map<string, string>()
    this.isInitializing = task
    try {
      do {
        yield* this.buildChangedIndexedSourceRecordBatches(
          request.sourceId,
          fingerprints,
          request.signal,
          request.onDelta
        )
        if (!backfillSettled) {
          await Promise.race([settlement, sleep(APP_INDEX_SCAN_POLL_MS)])
        }
      } while (!backfillSettled)

      await task
      await this._setLastBackfillTime(Date.now())
      yield* this.buildChangedIndexedSourceRecordBatches(
        request.sourceId,
        fingerprints,
        request.signal,
        request.onDelta
      )
      yield { sourceId: request.sourceId, records: [], done: true }
    } finally {
      await settlement
      if (this.isInitializing === task) this.isInitializing = null
    }
  }

  public async reconcileIndexedSource(
    request: IndexedSourceReconcileRequest
  ): Promise<IndexedSourceReconcileResult> {
    const startedAt = Date.now()
    const beforeRecords = await this.collectIndexedSourceRecords(request.sourceId, request.signal)
    const syncStats = await this._runFullSync(true, true)
    let mdlsStats: AppIndexSyncStats = this.createEmptySyncStats()
    if (process.platform === 'darwin') {
      mdlsStats = await this._runMdlsUpdateScan()
    }
    const stats = this.mergeSyncStats(syncStats, mdlsStats)
    const afterRecords = await this.collectIndexedSourceRecords(request.sourceId, request.signal)
    const beforeByStableKey = new Map(beforeRecords.map((record) => [record.stableKey, record]))
    const afterByStableKey = new Map(afterRecords.map((record) => [record.stableKey, record]))
    const deltas: IndexedSourceDelta[] = []

    for (const record of afterRecords) {
      const previous = beforeByStableKey.get(record.stableKey)
      if (!previous || JSON.stringify(previous) !== JSON.stringify(record)) {
        deltas.push({
          sourceId: this.id,
          action: previous ? 'change' : 'add',
          record,
          path: record.path,
          reason: 'app-provider-reconcile'
        })
      }
    }
    for (const record of beforeRecords) {
      if (!afterByStableKey.has(record.stableKey)) {
        deltas.push({
          sourceId: this.id,
          action: 'delete',
          stableKey: record.stableKey,
          path: record.path,
          reason: 'app-provider-reconcile'
        })
      }
    }

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
      reason: process.platform === 'darwin' ? 'full-sync+mdls-update-scan' : 'full-sync'
    }
  }

  public async handleIndexedSourceWatchEvent(
    event: IndexedSourceWatchEvent
  ): Promise<IndexedSourceDelta[]> {
    const fsEvent = { filePath: event.path }

    if (event.action === 'delete') {
      const deletedItemIds = await this.handleItemUnlinked(fsEvent)
      return (deletedItemIds ?? []).map((stableKey) => ({
        sourceId: this.id,
        action: 'delete' as const,
        stableKey,
        reason: 'app-provider-watch-delete'
      }))
    }

    const appPath = this.resolveAppPath(event.path, { logIgnore: true })
    if (!appPath) {
      return []
    }

    const result = await this.processAppPath(appPath)
    if (!result.success || !result.appInfo) {
      return []
    }

    const record = await this.mapScannedAppToIndexedSourceRecord(this.id, result.appInfo)
    return [
      {
        sourceId: this.id,
        action: event.action,
        record,
        path: result.appInfo.path,
        reason: 'app-provider-watch-event'
      }
    ]
  }

  private resolveWatchDepthForPath(watchPath: string): number {
    return this.isMac && (watchPath === '/Applications' || watchPath.endsWith('/Applications'))
      ? 1
      : 4
  }

  private async *buildIndexedSourceRecordBatches(
    sourceId: string,
    signal?: AbortSignal,
    done = true
  ): AsyncIterable<IndexedSourceRecordBatch> {
    if (sourceId !== this.id) {
      throw new Error(`Unsupported app index source: ${sourceId}`)
    }
    if (!this.dbUtils) {
      throw new Error('Cannot scan app index source before database initialization')
    }

    const apps = await this.dbUtils.getFilesByType('app')
    const appsWithExtensions = await this.fetchExtensionsForFiles(apps)
    const searchableApps = appsWithExtensions.filter((app) =>
      isAppEntryEnabledExtensionMap(app.extensions)
    )
    const batchSize = 50

    if (searchableApps.length === 0) {
      if (signal?.aborted) throw signal.reason ?? new Error('App index source scan aborted')
      if (done) yield { sourceId, records: [], done: true }
      return
    }

    for (let offset = 0; offset < searchableApps.length; offset += batchSize) {
      if (signal?.aborted) throw signal.reason ?? new Error('App index source scan aborted')
      const appsBatch = searchableApps.slice(offset, offset + batchSize)
      const records = await Promise.all(
        appsBatch.map(
          async (app) =>
            await this.mapScannedAppToIndexedSourceRecord(
              sourceId,
              this._mapDbAppToScannedInfo(app)
            )
        )
      )
      if (signal?.aborted) throw signal.reason ?? new Error('App index source scan aborted')
      yield {
        sourceId,
        records,
        done: done && offset + appsBatch.length >= searchableApps.length
      }
    }
  }

  private async *buildChangedIndexedSourceRecordBatches(
    sourceId: string,
    fingerprints: Map<string, string>,
    signal?: AbortSignal,
    onDelta?: IndexedSourceScanRequest['onDelta']
  ): AsyncIterable<IndexedSourceRecordBatch> {
    const seenStableKeys = new Set<string>()
    for await (const batch of this.buildIndexedSourceRecordBatches(sourceId, signal, false)) {
      const records = batch.records.filter((record) => {
        seenStableKeys.add(record.stableKey)
        const fingerprint = JSON.stringify(record)
        if (fingerprints.get(record.stableKey) === fingerprint) return false
        fingerprints.set(record.stableKey, fingerprint)
        return true
      })
      if (records.length > 0) {
        yield { sourceId, records }
      }
    }

    for (const stableKey of [...fingerprints.keys()]) {
      if (seenStableKeys.has(stableKey)) continue
      const delta: IndexedSourceDelta = {
        sourceId,
        action: 'delete',
        stableKey,
        reason: 'app-provider-startup-identity-replaced'
      }
      if (onDelta) {
        await onDelta(delta)
      } else {
        await this.requireIndexedSourceRuntimeDelegate().applyDelta(delta)
      }
      fingerprints.delete(stableKey)
    }
  }

  private async collectIndexedSourceRecords(
    sourceId: string,
    signal?: AbortSignal
  ): Promise<IndexedSourceRecord[]> {
    const records: IndexedSourceRecord[] = []
    for await (const batch of this.buildIndexedSourceRecordBatches(sourceId, signal)) {
      records.push(...batch.records)
    }
    return records
  }

  private async mapScannedAppToIndexedSourceRecord(
    sourceId: string,
    appInfo: ScannedAppInfo
  ): Promise<IndexedSourceRecord> {
    const { itemId, search, tags, toolSourceIds } = await this.recordMapper.map(appInfo)
    const launchTarget = appInfo.launchTarget || appInfo.path
    const extension =
      appInfo.launchKind === 'uwp'
        ? '.uwp'
        : appInfo.launchKind === 'protocol'
          ? '.protocol'
          : path.extname(launchTarget).toLowerCase() || undefined

    return {
      sourceId,
      recordId: itemId,
      stableKey: itemId,
      kind: 'app',
      title: resolveScannedDisplayName(appInfo) || appInfo.name,
      subtitle: appInfo.description || appInfo.displayPath || launchTarget,
      path: appInfo.path,
      uri:
        appInfo.launchKind === 'protocol' || appInfo.launchKind === 'uwp'
          ? launchTarget
          : undefined,
      icon: appInfo.icon,
      mtime: appInfo.lastModified?.getTime(),
      keywords: search.keywords?.map((term) => term.value),
      tags,
      search,
      metadata: {
        extension,
        launchKind: appInfo.launchKind,
        launchTarget,
        launchArgs: appInfo.launchArgs,
        workingDirectory: appInfo.workingDirectory,
        identityKind: appInfo.identityKind,
        displayNameSource: appInfo.displayNameSource,
        displayNameQuality: appInfo.displayNameQuality,
        displayPath: appInfo.displayPath,
        toolSources: toolSourceIds
      }
    }
  }

  public async reindexAppSearchTarget(request: AppIndexReindexRequest) {
    return await this.runExternalAppMutation(
      async () => await reindexAppSearchTarget(this.createDiagnosticsContext(), request)
    )
  }

  private createDiagnosticsContext() {
    return {
      id: this.id,
      dbUtils: this.dbUtils,
      searchIndex: this.searchIndex,
      fetchExtensionsForFiles: (files: DbAppRecord[]) => this.fetchExtensionsForFiles(files),
      mapDbAppToScannedInfo: (app: DbAppWithExtensions) => this._mapDbAppToScannedInfo(app),
      generateKeywordsForApp: (appInfo: ScannedAppInfo) => this._generateKeywordsForApp(appInfo),
      getAliasesForApp: (appInfo: ScannedAppInfo) => this._getAliasesForApp(appInfo),
      addAppByPath: (rawPath: string) => this.addAppByPath(rawPath),
      buildFtsQuery: (terms: string[]) => this.buildFtsQuery(terms),
      syncIndexedAppState: async (app: DbAppWithExtensions) => {
        const appInfo = this._mapDbAppToScannedInfo(app)
        if (isAppEntryEnabledExtensionMap(app.extensions)) {
          await this.publishAppRuntimeUpsert(appInfo, 'app-diagnostics-reindex')
        } else {
          await this.publishAppRuntimeDeletes(
            resolveAppItemIds(appInfo),
            'app-diagnostics-disabled'
          )
        }
      },
      logError: (message: string, meta?: Record<string, unknown>) =>
        logApp(message, LogStyle.error, meta)
    }
  }

  public async listManagedEntries(): Promise<AppIndexManagedEntry[]> {
    return await this.managedEntries.list()
  }

  public async upsertManagedEntry(
    input: AppIndexUpsertEntryRequest
  ): Promise<AppIndexEntryMutationResult> {
    return await this.runExternalAppMutation(async () => await this.managedEntries.upsert(input))
  }

  public async removeManagedEntry(pathValue: string): Promise<AppIndexEntryMutationResult> {
    return await this.runExternalAppMutation(
      async () => await this.managedEntries.remove(pathValue)
    )
  }

  public async setManagedEntryEnabled(
    pathValue: string,
    enabled: boolean
  ): Promise<AppIndexEntryMutationResult> {
    return await this.runExternalAppMutation(
      async () => await this.managedEntries.setEnabled(pathValue, enabled)
    )
  }

  public async setAliases(aliases: Record<string, string[]>): Promise<void> {
    await this.runExternalAppMutation(async () => {
      this.aliases = aliases
      logApp(
        'App aliases updated; the next runtime scan will publish the new search projection',
        LogStyle.info
      )
    })
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

  private async upsertAppExtensions(
    writer: AppFileWriteDb | undefined,
    extensions: Array<{ fileId: number; key: string; value: string }>
  ): Promise<void> {
    if (extensions.length === 0) return
    if (!writer) {
      await this.dbUtils!.addFileExtensions(extensions)
      return
    }
    await writer
      .insert(fileExtensions)
      .values(extensions)
      .onConflictDoUpdate({
        target: [fileExtensions.fileId, fileExtensions.key],
        set: { value: sql`excluded.value` }
      })
  }

  private async syncScannedAppExtensions(
    fileId: number,
    app: Pick<
      ScannedAppInfo,
      | 'bundleId'
      | 'icon'
      | 'stableId'
      | 'uniqueId'
      | 'launchKind'
      | 'launchTarget'
      | 'launchArgs'
      | 'workingDirectory'
      | 'displayPath'
      | 'description'
      | 'alternateNames'
      | 'identityKind'
      | 'displayNameSource'
      | 'displayNameQuality'
    >,
    writer?: AppFileWriteDb
  ): Promise<void> {
    const extensions = buildAppExtensions(fileId, app)
    await this.upsertAppExtensions(writer, extensions)

    const staleExtensionKeys = resolveMissingScannedExtensionKeys(
      extensions,
      APP_SCANNED_OPTIONAL_EXTENSION_KEYS
    )

    if (staleExtensionKeys.length > 0) {
      const deleteWriter = writer ?? this.dbUtils!.getDb()
      await deleteWriter
        .delete(fileExtensions)
        .where(
          and(eq(fileExtensions.fileId, fileId), inArray(fileExtensions.key, staleExtensionKeys))
        )
    }
  }

  private toExtensionMap(
    records: Array<{ key: string; value: string | null }>
  ): Record<string, string | null> {
    return records.reduce<Record<string, string | null>>((accumulator, record) => {
      accumulator[record.key] = record.value
      return accumulator
    }, {})
  }

  private partitionDbApps(apps: DbAppWithExtensions[]): {
    scannedApps: DbAppWithExtensions[]
    managedEntries: DbAppWithExtensions[]
  } {
    return this.sourceScanner.partitionDbApps(apps)
  }

  private buildScannedAppsMap(scannedApps: ScannedAppInfo[]): Map<string, ScannedAppInfo> {
    return this.sourceScanner.buildScannedAppsMap(scannedApps)
  }

  private async loadScannedApps(options?: { forceRefresh?: boolean }): Promise<ScannedAppInfo[]> {
    return await this.sourceScanner.loadScannedApps(options)
  }

  private runMaintenanceTask<T>(taskKey: string, task: () => Promise<T>): Promise<T> {
    return this.maintenance.run(taskKey, task)
  }

  private async getAppSearchIndexHealth(): Promise<{
    appCount: number
    indexedItemCount: number
    healthy: boolean
  }> {
    if (!this.dbUtils || !this.searchIndex) {
      return { appCount: 0, indexedItemCount: 0, healthy: false }
    }

    const [apps, indexedItemCount] = await Promise.all([
      this.dbUtils.getFilesByType('app'),
      this.searchIndex.countByProvider(this.id).catch((error) => {
        logApp('Failed to count app search index rows', LogStyle.warning, {
          error: error instanceof Error ? error.message : String(error)
        })
        return 0
      })
    ])

    return {
      appCount: apps.length,
      indexedItemCount,
      healthy: apps.length > 0 && indexedItemCount > 0
    }
  }

  private async getIndexedAppRecordEvidence(): Promise<IndexedSourceEvidence[]> {
    const scannerEvidence = await this.getScannerAppSourceEvidence()
    if (scannerEvidence) {
      return scannerEvidence
    }

    if (!this.dbUtils) {
      return [
        this.buildAppSourceEvidence('unknown', 0, {
          status: 'degraded',
          reason: 'app-db-unavailable'
        })
      ]
    }

    const apps = await this.dbUtils.getFilesByType('app')
    const appsWithExtensions = await this.fetchExtensionsForFiles(apps)
    const counts = new Map<AppSourceEvidenceKey, number>()

    for (const app of appsWithExtensions) {
      const key = this.resolveAppSourceEvidenceKey(app)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    return this.getPlatformEvidenceKeys()
      .filter((key) => key === 'manual' || key === 'macos-mdls' || (counts.get(key) ?? 0) > 0)
      .map((key) =>
        this.buildAppSourceEvidence(key, counts.get(key) ?? 0, {
          status:
            key === 'macos-mdls' ? 'ready' : (counts.get(key) ?? 0) > 0 ? 'ready' : 'degraded',
          reason:
            key === 'manual' && (counts.get(key) ?? 0) === 0
              ? 'manual-app-entries-empty'
              : undefined
        })
      )
  }

  private async getScannerAppSourceEvidence(): Promise<IndexedSourceEvidence[] | null> {
    if (process.platform !== 'win32') return null

    try {
      const results = await appScanner.getAppsBySource()
      if (!results) return null

      return this.buildWindowsScannerEvidence(results)
    } catch (error) {
      return [
        this.buildAppSourceEvidence('unknown', 0, {
          status: 'degraded',
          reason: `windows-scanner-source-evidence-failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          metadata: {
            evidenceSource: 'scanner'
          }
        })
      ]
    }
  }

  private getIndexedToolSourceEvidence(): IndexedSourceEvidence {
    const summary = getAppToolSourceCatalogSummary()
    return {
      id: 'app-provider:tool-sources',
      label: 'Tool source aliases',
      status: summary.length > 0 ? 'ready' : 'degraded',
      itemCount: summary.reduce((total, source) => total + source.appCount, 0),
      lastCheckedAt: Date.now(),
      reason: summary.length > 0 ? undefined : 'app-tool-source-catalog-empty',
      metadata: {
        catalogVersion: APP_TOOL_SOURCE_CATALOG_VERSION,
        semanticAliasCatalogVersion: APP_SEMANTIC_ALIAS_CATALOG_VERSION,
        sources: summary.map((source) => ({
          id: source.sourceId,
          label: source.label,
          appCount: source.appCount,
          aliasCount: source.aliasCount
        }))
      }
    }
  }

  private buildWindowsScannerEvidence(
    results: AppScannerSourceScanResult[]
  ): IndexedSourceEvidence[] {
    return appGroupedEvidenceService.build({
      sourceId: this.id,
      keys: this.getPlatformEvidenceKeys().filter((key) => key !== 'unknown'),
      labels: APP_SOURCE_EVIDENCE_LABELS,
      results: results.map((result) => ({
        sourceId: result.sourceId,
        label: result.label,
        itemCount: result.apps.length,
        error: result.error
      })),
      metadata: {
        platform: process.platform
      },
      resultMetadata: {
        evidenceSource: 'scanner'
      },
      emptyReason: (key) => `${key}-empty`,
      overrides: {
        manual: {
          itemCount: 0,
          status: 'degraded',
          reason: 'manual-app-entries-not-scanned',
          metadata: {
            evidenceSource: 'scanner'
          }
        }
      }
    })
  }

  private buildAppSourceEvidence(
    key: AppSourceEvidenceKey,
    itemCount: number,
    options: {
      status?: IndexedSourceEvidence['status']
      reason?: string
      metadata?: Record<string, unknown>
    } = {}
  ): IndexedSourceEvidence {
    return {
      id: `app-provider:${key}`,
      label: APP_SOURCE_EVIDENCE_LABELS[key],
      status: options.status ?? (itemCount > 0 ? 'ready' : 'degraded'),
      itemCount,
      lastCheckedAt: Date.now(),
      reason: options.reason,
      metadata: {
        platform: process.platform,
        ...options.metadata
      }
    }
  }

  private getPlatformEvidenceKeys(): AppSourceEvidenceKey[] {
    if (process.platform === 'win32') {
      return [
        'windows-start-menu',
        'windows-uwp',
        'windows-registry',
        'windows-app-paths',
        'windows-steam',
        'manual',
        'unknown'
      ]
    }

    if (process.platform === 'darwin') {
      return ['macos-mdfind', 'macos-mdls', 'manual', 'unknown']
    }

    if (process.platform === 'linux') {
      return ['linux-desktop', 'manual', 'unknown']
    }

    return ['manual', 'unknown']
  }

  private resolveAppSourceEvidenceKey(app: DbAppWithExtensions): AppSourceEvidenceKey {
    if (app.extensions[APP_ENTRY_SOURCE_EXTENSION_KEY] === APP_ENTRY_SOURCE_MANUAL) {
      return 'manual'
    }

    const identityKind = app.extensions[APP_IDENTITY_KIND_EXTENSION_KEY]
    const launchKind = app.extensions[APP_LAUNCH_KIND_EXTENSION_KEY]
    const displayNameSource = (
      app.extensions[APP_DISPLAY_NAME_SOURCE_EXTENSION_KEY] ?? ''
    ).toLowerCase()
    const displayPath = (
      app.extensions[APP_DISPLAY_PATH_EXTENSION_KEY] ??
      app.path ??
      ''
    ).toLowerCase()
    const launchTarget = (app.extensions[APP_LAUNCH_TARGET_EXTENSION_KEY] ?? '').toLowerCase()

    if (identityKind === 'windows-uwp' || launchKind === 'uwp') return 'windows-uwp'
    if (launchKind === 'protocol' && launchTarget.startsWith('steam://')) return 'windows-steam'
    if (displayNameSource.includes('app paths')) return 'windows-app-paths'
    if (displayNameSource.includes('registry')) return 'windows-registry'
    if (identityKind === 'windows-shortcut' || displayPath.endsWith('.lnk')) {
      return 'windows-start-menu'
    }
    if (identityKind === 'linux-desktop' || displayPath.endsWith('.desktop')) return 'linux-desktop'
    if (
      identityKind === 'macos-bundle' ||
      identityKind === 'macos-path' ||
      app.path.endsWith('.app')
    ) {
      return 'macos-mdfind'
    }

    return 'unknown'
  }

  private _scheduleStartupIndexHealthCheck(): void {
    if (this.shuttingDown || this.startupIndexHealthCheckStarted) return
    this.startupIndexHealthCheckStarted = true

    this.startupIndexHealthTimer = setTimeout(() => {
      this.startupIndexHealthTimer = null
      if (this.shuttingDown) return
      const task = this._ensureStartupIndexHealth()
      this.startupIndexHealthTask = task
      void task.finally(() => {
        if (this.startupIndexHealthTask === task) this.startupIndexHealthTask = null
      })
    }, 1000)
  }

  private async _ensureStartupIndexHealth(): Promise<void> {
    if (this.shuttingDown) return
    if (!this.dbUtils || !this.searchIndex) {
      return
    }

    try {
      const health = await this.getAppSearchIndexHealth()
      if (health.healthy) {
        appProviderLog.debug('App search index health check passed', { meta: health })
        return
      }

      logApp(
        `App search index is empty or incomplete (apps=${chalk.cyan(
          health.appCount
        )}, indexed=${chalk.cyan(health.indexedItemCount)}), triggering startup backfill`,
        LogStyle.warning
      )

      await this.waitForMainRendererReady()
      if (this.shuttingDown) return
      await this.requireIndexedSourceRuntimeDelegate().scan(IndexedSourceScanReasons.Startup)
    } catch (error) {
      logApp('Startup app index health check failed', LogStyle.warning, {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private _scheduleSemanticAliasCatalogSync(): void {
    if (this.shuttingDown) return
    this.semanticAliasCatalogTimer = setTimeout(() => {
      this.semanticAliasCatalogTimer = null
      if (this.shuttingDown) return
      const task = this._syncSemanticAliasCatalogIfNeeded()
      this.semanticAliasCatalogTask = task
      void task.finally(() => {
        if (this.semanticAliasCatalogTask === task) this.semanticAliasCatalogTask = null
      })
    }, 2000)
  }

  private async _syncSemanticAliasCatalogIfNeeded(): Promise<void> {
    if (this.shuttingDown) return
    if (!this.dbUtils || !this.searchIndex) {
      return
    }

    try {
      const storedVersion = await this._getConfigNumber(SEMANTIC_ALIAS_CATALOG_VERSION_CONFIG_KEY)
      if (storedVersion === APP_SEMANTIC_ALIAS_CATALOG_VERSION) {
        return
      }

      await this.runMaintenanceTask('semantic-alias-catalog-sync', async () => {
        await this.syncExistingAppKeywordsForSemanticAliasCatalog()
      })

      await this._setConfigValue(
        SEMANTIC_ALIAS_CATALOG_VERSION_CONFIG_KEY,
        APP_SEMANTIC_ALIAS_CATALOG_VERSION.toString()
      )
    } catch (error) {
      logApp('Failed to sync app semantic alias catalog', LogStyle.warning, {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private async syncExistingAppKeywordsForSemanticAliasCatalog(): Promise<void> {
    logApp(
      `App Semantic Alias Catalog v${chalk.cyan(APP_SEMANTIC_ALIAS_CATALOG_VERSION)} will apply on the next runtime scan`,
      LogStyle.info
    )
  }

  private _scheduleStartupBackfill(): void {
    if (this.shuttingDown) return
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
    this.startupBackfillTimer = setTimeout(() => {
      this.startupBackfillTimer = null
      if (this.shuttingDown) return
      const task = this._runStartupBackfillWithRetry()
      this.startupBackfillTask = task
      void task
        .catch((error) => {
          logApp('Startup backfill producer failed', LogStyle.error, {
            error: error instanceof Error ? error.message : String(error)
          })
        })
        .finally(() => {
          if (this.startupBackfillTask === task) this.startupBackfillTask = null
        })
    }, delayMs)
  }

  private async _runStartupBackfillWithRetry(): Promise<void> {
    if (this.shuttingDown) return
    const maxRetries = this.appIndexSettings.startupBackfillRetryMax

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (this.shuttingDown) return
      const readiness = await this._shouldRunStartupBackfill()

      if (readiness.allowed) {
        try {
          if (this.shuttingDown) return
          await this.requireIndexedSourceRuntimeDelegate().scan(IndexedSourceScanReasons.Startup)
          return
        } catch (error) {
          logApp('Startup backfill failed', LogStyle.error, {
            error: error instanceof Error ? error.message : String(error)
          })
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
      await this.waitForStartupProducerDelay(delay)
    }
  }

  private async _shouldRunStartupBackfill(): Promise<{ allowed: boolean; reason?: string }> {
    if (this.shuttingDown) return { allowed: false, reason: 'shutting-down' }
    if (!this.dbUtils || !this.searchIndex) {
      return { allowed: false, reason: 'missing-context' }
    }

    if (this.isDevelopmentRuntime()) {
      const lastBackfillTime = await this._getLastBackfillTime()
      if (
        lastBackfillTime &&
        Date.now() - lastBackfillTime < STARTUP_BACKFILL_MIN_INTERVAL_DEV_MS
      ) {
        const health = await this.getAppSearchIndexHealth()
        if (health.healthy) {
          return { allowed: false, reason: 'recent-backfill' }
        }
        logApp(
          `Ignoring recent-backfill guard because app search index is unhealthy (apps=${chalk.cyan(
            health.appCount
          )}, indexed=${chalk.cyan(health.indexedItemCount)})`,
          LogStyle.warning
        )
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

  private _runStartupBackfill(signal?: AbortSignal): Promise<void> {
    return this.runMaintenanceTask('startup-backfill', async () => {
      await this._performStartupBackfill(signal)
    })
  }

  private async _performStartupBackfill(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    if (!this.dbUtils) {
      logApp('Database not initialized, skipping startup backfill', LogStyle.error)
      return
    }

    const initStart = startTiming()
    logApp('Starting startup backfill...', LogStyle.process)

    const scanStart = startTiming()
    const scannedApps = await this.loadScannedApps({ forceRefresh: true })
    signal?.throwIfAborted()
    logAppDuration('BackfillScanApps', scanStart, {
      label: `Scanned ${chalk.cyan(scannedApps.length)} apps`,
      style: 'info',
      unit: 's',
      precision: 2
    })

    await this._recordMissingIconApps(scannedApps)
    signal?.throwIfAborted()

    const dbLoadStart = startTiming()
    const dbApps = await this.dbUtils!.getFilesByType('app')
    const dbAppsWithExtensions = await this.fetchExtensionsForFiles(dbApps)
    signal?.throwIfAborted()
    const { scannedApps: dbScannedAppsWithExtensions, managedEntries } =
      this.partitionDbApps(dbAppsWithExtensions)
    logAppDuration('BackfillLoadDbApps', dbLoadStart, {
      label: `Loaded ${chalk.cyan(dbScannedAppsWithExtensions.length)} scanned and ${chalk.cyan(
        managedEntries.length
      )} managed DB app records`,
      style: 'info',
      unit: 's',
      precision: 2
    })

    const scannedAppsMap = this.buildScannedAppsMap(scannedApps)
    const existingIds = new Set(dbScannedAppsWithExtensions.map((app) => this.resolveDbAppKey(app)))
    const toAdd = scannedApps.filter((app) => {
      const uniqueId = this.resolveScannedAppKey(app)
      return !!uniqueId && !existingIds.has(uniqueId)
    })
    const toUpdateMetadata = dbScannedAppsWithExtensions
      .map((dbApp) => {
        const uniqueId = this.resolveDbAppKey(dbApp)
        const scannedApp = scannedAppsMap.get(uniqueId)
        if (!scannedApp) return null
        const nextDisplayName = resolveScannedDisplayName(scannedApp)
        const hasDisplayNameDrift = shouldUpdateDisplayName(dbApp.displayName, nextDisplayName, {
          currentQuality: normalizeAppDisplayNameQuality(
            dbApp.extensions[APP_DISPLAY_NAME_QUALITY_EXTENSION_KEY]
          ),
          incomingQuality: scannedApp.displayNameQuality
        })
        const hasAlternateNamesDrift = hasStringListDrift(
          dbApp.extensions[APP_ALTERNATE_NAMES_EXTENSION_KEY],
          scannedApp.alternateNames
        )
        const hasIconDrift = hasAppIconDrift(dbApp.extensions.icon, scannedApp.icon)
        const hasLaunchMetadataDrift = hasAppLaunchMetadataDrift(dbApp.extensions, scannedApp)
        if (
          !hasDisplayNameDrift &&
          !hasAlternateNamesDrift &&
          !hasIconDrift &&
          !hasLaunchMetadataDrift
        ) {
          return null
        }
        return {
          fileId: dbApp.id,
          app: scannedApp,
          existingDisplayName: dbApp.displayName,
          existingDisplayNameQuality: normalizeAppDisplayNameQuality(
            dbApp.extensions[APP_DISPLAY_NAME_QUALITY_EXTENSION_KEY]
          ),
          existingExtensions: dbApp.extensions
        }
      })
      .filter(Boolean) as Array<{
      fileId: number
      app: ScannedAppInfo
      existingDisplayName: string | null
      existingDisplayNameQuality?: ScannedAppInfo['displayNameQuality']
      existingExtensions: Record<string, string | null>
    }>

    ;(dbApps as unknown[]).length = 0
    ;(dbAppsWithExtensions as unknown[]).length = 0
    ;(dbScannedAppsWithExtensions as unknown[]).length = 0

    logApp(
      `Startup backfill found ${chalk.green(toAdd.length)} missing apps and ${chalk.yellow(
        toUpdateMetadata.length
      )} metadata corrections`,
      LogStyle.info
    )

    if (toAdd.length > 0) {
      logApp(`Adding ${chalk.cyan(toAdd.length)} missing apps...`, LogStyle.process)
      const addStartTime = startTiming()

      await runAdaptiveTaskQueue(
        toAdd,
        async (app, index) => {
          signal?.throwIfAborted()
          const cleanDisplayName = resolveScannedDisplayName(app)
          await this.runDbMutation('app-provider.backfill-add', async () => {
            const db = this.dbUtils!.getDb()
            await this.runAppTransaction(db, async (tx, extensionWriter) => {
              const [insertedFile] = await tx
                .insert(filesSchema)
                .values({
                  path: app.path,
                  name: app.name,
                  displayName: cleanDisplayName,
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
                await this.syncScannedAppExtensions(insertedFile.id, app, extensionWriter)
              }
            })
          })
          signal?.throwIfAborted()

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
      signal?.throwIfAborted()

      logAppDuration('BackfillAddApps', addStartTime, {
        label: 'Missing apps added',
        style: 'success',
        unit: 's',
        precision: 1
      })
    }

    if (toUpdateMetadata.length > 0) {
      logApp(
        `Correcting ${chalk.cyan(toUpdateMetadata.length)} localized app metadata...`,
        LogStyle.process
      )
      const updateStartTime = startTiming()
      let updatedCount = 0
      let failedCount = 0

      await runAdaptiveTaskQueue(
        toUpdateMetadata,
        async ({ fileId, app, existingDisplayName, existingDisplayNameQuality }, index) => {
          signal?.throwIfAborted()
          const nextDisplayName = normalizeDisplayName(resolveScannedDisplayName(app))

          try {
            await this.runDbMutation('app-provider.backfill-update', async () => {
              const db = this.dbUtils!.getDb()
              await this.runAppTransaction(db, async (tx, extensionWriter) => {
                if (
                  shouldUpdateDisplayName(existingDisplayName, nextDisplayName, {
                    currentQuality: existingDisplayNameQuality,
                    incomingQuality: app.displayNameQuality
                  })
                ) {
                  await tx
                    .update(filesSchema)
                    .set({ displayName: nextDisplayName })
                    .where(eq(filesSchema.id, fileId))
                }

                await this.syncScannedAppExtensions(fileId, app, extensionWriter)
              })
            })

            updatedCount += 1
          } catch (error) {
            failedCount += 1
            logApp(
              `Failed to correct app metadata for ${chalk.yellow(app.path)}: ${
                error instanceof Error ? error.message : String(error)
              }`,
              LogStyle.warning
            )
          }
          signal?.throwIfAborted()

          if ((index + 1) % 50 === 0 || index === toUpdateMetadata.length - 1) {
            logApp(
              `Processed ${chalk.cyan(index + 1)}/${chalk.cyan(toUpdateMetadata.length)} metadata corrections`,
              LogStyle.info
            )
          }
        },
        {
          estimatedTaskTimeMs: 10,
          label: 'AppProvider::backfillUpdateDisplayName'
        }
      )
      signal?.throwIfAborted()

      const correctionStyle = failedCount > 0 ? LogStyle.warning : LogStyle.success
      logApp(
        `DisplayName correction summary: updated ${chalk.green(updatedCount)}, failed ${chalk.yellow(failedCount)}`,
        correctionStyle
      )
      logAppDuration('BackfillFixDisplayName', updateStartTime, {
        label: 'App metadata correction complete',
        style: failedCount > 0 ? 'warning' : 'success',
        unit: 's',
        precision: 1,
        suffix: `(updated=${chalk.green(updatedCount)}, failed=${chalk.yellow(failedCount)})`
      })
    }

    signal?.throwIfAborted()

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

    const intervalMs = this.appIndexSettings.fullSyncCheckIntervalMs
    if (!this.maintenance.registerFullSync(intervalMs)) return
    logApp(
      `Registering app full sync polling service (${Math.round(intervalMs / 60000)} min interval)`,
      LogStyle.info
    )
  }

  private _refreshFullSyncSchedule(): void {
    this.maintenance.refreshFullSync(
      this.appIndexSettings.fullSyncCheckIntervalMs,
      this.appIndexSettings.fullSyncEnabled
    )
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

    await this.requireIndexedSourceRuntimeDelegate().reconcile(
      decision.forced === true
        ? 'app-provider-forced-full-sync'
        : 'app-provider-scheduled-full-sync'
    )
  }

  private _runFullSync(forced: boolean, throwOnFailure = false): Promise<AppIndexSyncStats> {
    return this.runMaintenanceTask('full-sync', async () => {
      return await this._performFullSync(forced, throwOnFailure)
    })
  }

  private async _performFullSync(
    forced: boolean,
    throwOnFailure = false
  ): Promise<AppIndexSyncStats> {
    if (!this.dbUtils) {
      logApp('Database not initialized, skipping full sync', LogStyle.error)
      if (throwOnFailure) throw new Error('APP_INDEX_DATABASE_UNAVAILABLE')
      return {
        ...this.createEmptySyncStats(),
        skipped: 1,
        errors: 1
      }
    }

    const syncStart = startTiming()
    logApp(forced ? 'Starting forced full sync...' : 'Starting full sync...', LogStyle.process)

    try {
      const stats = await this._initialize({ forceRefresh: true })
      if (throwOnFailure && stats.errors > 0) {
        throw new Error(`APP_INDEX_FULL_SYNC_FAILED:${String(stats.errors)}`)
      }
      await this._setLastFullSyncTime(Date.now())
      logAppDuration('FullSync', syncStart, {
        label: forced ? 'Forced full sync complete' : 'Full sync complete',
        style: 'success',
        unit: 's',
        precision: 2
      })
      return stats
    } catch (error) {
      logApp('Full sync failed', LogStyle.error, {
        error: error instanceof Error ? error.message : String(error)
      })
      if (throwOnFailure) throw error
      return {
        ...this.createEmptySyncStats(),
        errors: 1
      }
    }
  }

  private _mapDbAppToScannedInfo(app: DbAppWithExtensions): ScannedAppInfo {
    const displayName = resolveDisplayName(app.displayName, app.name)
    return {
      name: app.name,
      displayName: displayName || undefined,
      fileName:
        app.extensions.displayPath ||
        (app.path.startsWith('shell:AppsFolder\\')
          ? app.name
          : path.basename(app.path, path.extname(app.path) || undefined)),
      path: app.path,
      icon: app.extensions.icon || '',
      bundleId: app.extensions.bundleId || '',
      uniqueId: app.extensions.appIdentity || app.path || app.extensions.bundleId || '',
      stableId: app.extensions.appIdentity || app.path || app.extensions.bundleId || '',
      launchKind: (app.extensions.launchKind as AppLaunchKind | undefined) || 'path',
      launchTarget: app.extensions.launchTarget || app.path,
      launchArgs: app.extensions.launchArgs || undefined,
      workingDirectory: app.extensions.workingDirectory || undefined,
      displayPath: app.extensions.displayPath || undefined,
      description: app.extensions.description || undefined,
      alternateNames: readAlternateNames(app.extensions),
      identityKind: readAppIdentityKind(app.extensions.identityKind),
      displayNameSource: app.extensions[APP_DISPLAY_NAME_SOURCE_EXTENSION_KEY] || undefined,
      displayNameQuality: normalizeAppDisplayNameQuality(
        app.extensions[APP_DISPLAY_NAME_QUALITY_EXTENSION_KEY]
      ),
      lastModified: app.mtime
    }
  }

  private resolveScannedAppToolSourceIds(appInfo: ScannedAppInfo): string[] {
    return resolveAppToolSourceIds({
      name: appInfo.name,
      displayName: appInfo.displayName,
      fileName: appInfo.fileName,
      alternateNames: appInfo.alternateNames,
      bundleId: appInfo.bundleId,
      uniqueId: appInfo.uniqueId,
      stableId: appInfo.stableId,
      path: appInfo.path,
      launchTarget: appInfo.launchTarget || appInfo.path,
      displayPath: appInfo.displayPath,
      description: appInfo.description
    })
  }

  private resolveAliasesForApp(appInfo: ScannedAppInfo): string[] {
    const uniqueId = resolveAppItemId(appInfo)
    const aliasesById = this.aliases[uniqueId] || []
    const aliasesByPath = this.aliases[appInfo.path] || []
    const aliasesByBundleId = this.aliases[appInfo.bundleId] || []
    return normalizeStringList([
      ...aliasesById,
      ...aliasesByPath,
      ...aliasesByBundleId,
      ...resolveScannedAppSemanticAliases(appInfo)
    ]).map((alias) => alias.toLowerCase())
  }

  private _getAliasesForApp(appInfo: ScannedAppInfo): string[] {
    return this.resolveAliasesForApp(appInfo)
  }

  private async _recordMissingIconApps(scannedApps: ScannedAppInfo[]): Promise<void> {
    await this.sourceScanner.recordMissingIconApps(scannedApps)
  }

  private async _generateKeywordsForApp(appInfo: ScannedAppInfo): Promise<Set<string>> {
    const generatedKeywords = new Set<string>()
    const names = Array.from(
      new Set(
        [appInfo.displayName, appInfo.name, appInfo.fileName]
          .concat(appInfo.alternateNames ?? [])
          .filter((value): value is string => Boolean(value?.trim()))
          .map((value) => value.trim())
      )
    )
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
          const pinyinFull = pinyin(name, { toneType: 'none' }).replace(/\s/g, '').toLowerCase()
          generatedKeywords.add(pinyinFull)
          const pinyinFirst = pinyin(name, { pattern: 'first', toneType: 'none' })
            .replace(/\s/g, '')
            .toLowerCase()
          generatedKeywords.add(pinyinFirst)
        } catch {
          logApp(`Failed to get pinyin for: ${name}`, LogStyle.warning)
        }
      }
    }

    const aliasList = this.resolveAliasesForApp(appInfo)
    aliasList.forEach((alias) => generatedKeywords.add(alias.toLowerCase()))

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

  private createEmptySyncStats(): AppIndexSyncStats {
    return {
      added: 0,
      changed: 0,
      deleted: 0,
      skipped: 0,
      errors: 0
    }
  }

  private mergeSyncStats(...statsList: AppIndexSyncStats[]): AppIndexSyncStats {
    return statsList.reduce<AppIndexSyncStats>(
      (merged, stats) => ({
        added: merged.added + stats.added,
        changed: merged.changed + stats.changed,
        deleted: merged.deleted + stats.deleted,
        skipped: merged.skipped + stats.skipped,
        errors: merged.errors + stats.errors
      }),
      this.createEmptySyncStats()
    )
  }

  private async _initialize(options?: { forceRefresh?: boolean }): Promise<AppIndexSyncStats> {
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
    const { scannedApps: dbScannedAppsWithExtensions, managedEntries } =
      this.partitionDbApps(dbAppsWithExtensions)
    logAppDuration('LoadDbApps', dbLoadStart, {
      label: `Loaded ${chalk.cyan(dbScannedAppsWithExtensions.length)} scanned and ${chalk.cyan(
        managedEntries.length
      )} managed DB app records`,
      style: 'info',
      unit: 's',
      precision: 2
    })
    const dbAppsMap = new Map(
      dbScannedAppsWithExtensions.map((app) => [this.resolveDbAppKey(app), app])
    )

    const toAdd: ScannedAppInfo[] = []
    const toUpdate: Array<{
      fileId: number
      app: ScannedAppInfo
      existingDisplayName: string | null
      existingDisplayNameQuality?: ScannedAppInfo['displayNameQuality']
      existingExtensions: Record<string, string | null>
      existingName: string
    }> = []
    const missingApps: Array<{ id: number; path: string; uniqueId: string }> = []

    logApp(
      `Comparing ${chalk.cyan(scannedApps.length)} scanned apps with ${chalk.cyan(
        dbScannedAppsWithExtensions.length
      )} scanned apps in DB`,
      LogStyle.info
    )

    for (const [uniqueId, scannedApp] of scannedAppsMap.entries()) {
      const dbApp = dbAppsMap.get(uniqueId)
      if (!dbApp) {
        toAdd.push(scannedApp)
      } else {
        const resolvedScannedDisplayName = resolveScannedDisplayName(scannedApp)
        const hasDisplayNameDrift = shouldUpdateDisplayName(
          dbApp.displayName,
          resolvedScannedDisplayName,
          {
            currentQuality: normalizeAppDisplayNameQuality(
              dbApp.extensions[APP_DISPLAY_NAME_QUALITY_EXTENSION_KEY]
            ),
            incomingQuality: scannedApp.displayNameQuality
          }
        )
        const hasNameDrift =
          isProbablyCorruptedDisplayName(dbApp.name) ||
          (normalizeDisplayName(dbApp.name) !== normalizeDisplayName(scannedApp.name) &&
            !isProbablyCorruptedDisplayName(scannedApp.name))
        const hasAlternateNamesDrift = hasStringListDrift(
          dbApp.extensions[APP_ALTERNATE_NAMES_EXTENSION_KEY],
          scannedApp.alternateNames
        )
        const hasIconDrift = hasAppIconDrift(dbApp.extensions.icon, scannedApp.icon)
        const hasLaunchMetadataDrift = hasAppLaunchMetadataDrift(dbApp.extensions, scannedApp)
        if (
          scannedApp.lastModified.getTime() > new Date(dbApp.mtime).getTime() ||
          hasDisplayNameDrift ||
          hasNameDrift ||
          hasAlternateNamesDrift ||
          hasIconDrift ||
          hasLaunchMetadataDrift
        ) {
          toUpdate.push({
            fileId: dbApp.id,
            app: scannedApp,
            existingDisplayName: dbApp.displayName,
            existingDisplayNameQuality: normalizeAppDisplayNameQuality(
              dbApp.extensions[APP_DISPLAY_NAME_QUALITY_EXTENSION_KEY]
            ),
            existingExtensions: dbApp.extensions,
            existingName: dbApp.name
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
          const cleanDisplayName = resolveScannedDisplayName(app)
          await this.runDbMutation('app-provider.batch-add', async () => {
            await this.runAppTransaction(db, async (tx, extensionWriter) => {
              const [insertedFile] = await tx
                .insert(filesSchema)
                .values({
                  path: app.path,
                  name: app.name,
                  displayName: cleanDisplayName,
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
                await this.syncScannedAppExtensions(insertedFile.id, app, extensionWriter)
              }
            })
          })

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
        async (
          { fileId, app, existingDisplayName, existingDisplayNameQuality, existingName },
          index
        ) => {
          const nextName = isProbablyCorruptedDisplayName(app.name) ? existingName : app.name
          const updateData: Partial<typeof filesSchema.$inferInsert> = {
            name: nextName,
            path: app.path,
            mtime: app.lastModified
          }
          const nextDisplayName = normalizeDisplayName(resolveScannedDisplayName(app))
          if (
            shouldUpdateDisplayName(existingDisplayName, nextDisplayName, {
              currentQuality: existingDisplayNameQuality,
              incomingQuality: app.displayNameQuality
            })
          ) {
            updateData.displayName = nextDisplayName
          }

          await this.runDbMutation('app-provider.batch-update', async () => {
            await this.runAppTransaction(db, async (tx, extensionWriter) => {
              await tx.update(filesSchema).set(updateData).where(eq(filesSchema.id, fileId))
              await this.syncScannedAppExtensions(fileId, app, extensionWriter)
            })
          })

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

      const deleteStart = startTiming()
      await this.runDbMutation('app-provider.batch-delete', async () => {
        await this.runAppTransaction(db, async (tx) => {
          await tx.delete(filesSchema).where(inArray(filesSchema.id, toDeleteIds))
          await tx.delete(fileExtensions).where(inArray(fileExtensions.fileId, toDeleteIds))
        })
      })

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

    return {
      added: toAdd.length,
      changed: toUpdate.length,
      deleted: toDeleteIds.length,
      skipped: missingApps.length - toDeleteIds.length,
      errors: 0
    }
  }

  private resolveAppPath(
    rawPath: string,
    options?: { skipWatchCheck?: boolean; logIgnore?: boolean }
  ): string | null {
    if (!rawPath) return null
    let appPath =
      process.platform === 'win32' ? expandWindowsEnvironmentVariables(rawPath.trim()) : rawPath

    if (process.platform === 'win32') {
      if (isWindowsUwpShellPath(appPath)) {
        return appPath
      }
      if (isWindowsUwpAppId(appPath)) {
        return `shell:AppsFolder\\${appPath}`
      }
    }

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
    } else if (process.platform === 'win32') {
      const extension = path.extname(appPath).toLowerCase()
      if (!WINDOWS_REALTIME_APP_EXTENSIONS.has(extension)) {
        return null
      }
    }

    return appPath
  }

  private async upsertAppInfo(
    appInfo: ScannedAppInfo,
    options: { managedEntry?: boolean } = {}
  ): Promise<'added' | 'updated'> {
    const existingFile = await this.dbUtils!.getFileByPath(appInfo.path)
    const db = this.dbUtils!.getDb()

    if (existingFile) {
      logApp(`Updating existing app: ${chalk.cyan(appInfo.name)}`, LogStyle.process)
      const existingExtensions = this.toExtensionMap(
        await this.dbUtils!.getFileExtensions(existingFile.id)
      )

      const updateData: Partial<typeof filesSchema.$inferInsert> = {
        name: isProbablyCorruptedDisplayName(appInfo.name) ? existingFile.name : appInfo.name,
        mtime: appInfo.lastModified
      }

      const normalizedDisplayName = normalizeDisplayName(resolveScannedDisplayName(appInfo))
      if (
        shouldUpdateDisplayName(existingFile.displayName, normalizedDisplayName, {
          currentQuality: normalizeAppDisplayNameQuality(
            existingExtensions[APP_DISPLAY_NAME_QUALITY_EXTENSION_KEY]
          ),
          incomingQuality: appInfo.displayNameQuality
        })
      ) {
        updateData.displayName = normalizedDisplayName
      }

      await this.runDbMutation(
        'app-provider.entry-update',
        async () => {
          await this.runAppTransaction(db, async (tx, extensionWriter) => {
            await tx.update(filesSchema).set(updateData).where(eq(filesSchema.id, existingFile.id))
            if (options.managedEntry === true) {
              await this.upsertAppExtensions(
                extensionWriter,
                buildManagedEntryExtensions(existingFile.id, appInfo, true)
              )
            } else {
              await this.syncScannedAppExtensions(existingFile.id, appInfo, extensionWriter)
            }
          })
        },
        options.managedEntry === true ? 'interactive' : 'background'
      )

      logApp(`App ${chalk.cyan(appInfo.name)} updated successfully`, LogStyle.success)
      return 'updated'
    }

    logApp(`Adding new app: ${chalk.cyan(appInfo.name)}`, LogStyle.process)

    const insertedFile = await this.runDbMutation(
      'app-provider.entry-add',
      async () => {
        return await this.runAppTransaction(db, async (tx, extensionWriter) => {
          const [inserted] = await tx
            .insert(filesSchema)
            .values({
              path: appInfo.path,
              name: appInfo.name,
              displayName: resolveScannedDisplayName(appInfo),
              type: 'app' as const,
              mtime: appInfo.lastModified,
              ctime: new Date()
            })
            .returning()

          if (inserted) {
            if (options.managedEntry === true) {
              await this.upsertAppExtensions(
                extensionWriter,
                buildManagedEntryExtensions(inserted.id, appInfo, true)
              )
            } else {
              await this.syncScannedAppExtensions(inserted.id, appInfo, extensionWriter)
            }
          }
          return inserted
        })
      },
      options.managedEntry === true ? 'interactive' : 'background'
    )

    if (insertedFile) {
      logApp(`New app ${chalk.cyan(appInfo.name)} added successfully`, LogStyle.success)
    }

    return 'added'
  }

  private async processAppPath(
    appPath: string,
    options: { managedEntry?: boolean } = {}
  ): Promise<AppIndexProcessPathResult> {
    if (this.processingPaths.has(appPath)) {
      return { success: false, status: 'invalid', reason: 'processing' }
    }
    if (!this.dbUtils) {
      return { success: false, status: 'error', reason: 'db-not-ready' }
    }

    this.processingPaths.add(appPath)

    try {
      const isVirtualWindowsApp = process.platform === 'win32' && isWindowsUwpShellPath(appPath)
      if (!isVirtualWindowsApp && !(await this._waitForItemStable(appPath))) {
        logApp(`Item is unstable, skipping: ${chalk.yellow(appPath)}`, LogStyle.warning)
        return { success: false, status: 'invalid', reason: 'unstable' }
      }

      logApp(`Fetching app info: ${chalk.cyan(appPath)}`, LogStyle.process)
      const appInfo = await appScanner.getAppInfoByPath(appPath)
      if (!appInfo) {
        logApp(`Could not get app info for: ${chalk.yellow(appPath)}`, LogStyle.warning)
        return { success: false, status: 'invalid', reason: 'not-app' }
      }

      const status = await this.upsertAppInfo(appInfo, options)
      return { success: true, status, path: appInfo.path, appInfo }
    } catch (error) {
      const report = operationalErrorService.report({
        domain: 'app-index',
        operation: 'process-path',
        error,
        code: 'APP_INDEX_ENTRY_MUTATION_FAILED',
        userImpact: 'degraded'
      })
      return { success: false, status: 'error', reason: report.publicMessage }
    } finally {
      this.processingPaths.delete(appPath)
    }
  }

  private handleItemUnlinked = async (event: unknown): Promise<string[]> => {
    const fsEvent = event as FileSystemPathEvent
    if (!fsEvent || !fsEvent.filePath || this.processingPaths.has(fsEvent.filePath)) return []

    let appPath = fsEvent.filePath
    if (this.isMac) {
      if (appPath.includes('.app/')) appPath = appPath.substring(0, appPath.indexOf('.app') + 4)
      if (!appPath.endsWith('.app')) return []
      if (!this._isWatchPathCandidate(appPath)) {
        return []
      }
    } else if (process.platform === 'win32') {
      const extension = path.extname(appPath).toLowerCase()
      if (!WINDOWS_REALTIME_APP_EXTENSIONS.has(extension)) {
        return []
      }
    }

    logApp(`App deletion detected: ${chalk.cyan(appPath)}`, LogStyle.process)
    this.processingPaths.add(appPath)

    try {
      const fileToDelete = await this.dbUtils?.getFileByPath(appPath)
      if (!fileToDelete || !this.dbUtils) {
        logApp(`App to delete not found in database: ${chalk.yellow(appPath)}`, LogStyle.warning)
        return []
      }

      const [storedApp] = await this.fetchExtensionsForFiles([fileToDelete])
      const itemIds = storedApp
        ? resolveAppItemIds(this._mapDbAppToScannedInfo(storedApp))
        : resolveAppItemIds({ path: fileToDelete.path })

      await this.runDbMutation('app-provider.realtime-delete', async () => {
        await this.runAppTransaction(this.dbUtils!.getDb(), async (tx) => {
          await tx.delete(filesSchema).where(eq(filesSchema.id, fileToDelete.id))
          await tx.delete(fileExtensions).where(eq(fileExtensions.fileId, fileToDelete.id))
        })
      })

      logApp(`App deleted from database: ${chalk.cyan(appPath)}`, LogStyle.success)
      return itemIds
    } catch (error) {
      logApp(`Error deleting app: ${chalk.red((error as Error).message)}`, LogStyle.error)
      throw error
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
    const launchTarget =
      launchKind === 'uwp' && isWindowsUwpShellPath(appMeta.launchTarget || appPath)
        ? (appMeta.launchTarget || appPath).replace(/^shell:AppsFolder\\/i, '')
        : appMeta.launchTarget || appPath
    const launchArgs = appMeta.launchArgs
    const workingDirectory = appMeta.workingDirectory

    scheduleAppLaunch({
      name: item.render?.basic?.title,
      path: appPath,
      launchKind,
      launchTarget,
      launchArgs,
      workingDirectory,
      sourceItemId: item.id
    })

    return null
  }

  async onSearch(query: TuffQuery, signal?: AbortSignal): Promise<TuffSearchResult> {
    if (signal?.aborted) {
      return new TuffSearchResultBuilder(query).build()
    }
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
    const shouldCheckPhrase = baseTerms.length > 1 || baseTerms.length === 0
    const preciseLookupTerms = shouldCheckPhrase
      ? Array.from(new Set([...terms, normalizedQuery]))
      : terms
    const preciseSearchLimit = Math.max(200, preciseLookupTerms.length * 200)
    const preciseStart = startTiming()
    logApp(`Executing precise query: ${chalk.cyan(terms.join(', '))}`, LogStyle.info)

    const shouldLookupPrefix = normalizedQuery.length <= 5
    const prefixStart = startTiming()
    const ftsQuery = this.buildFtsQuery(terms)
    const ftsStart = startTiming()

    const [preciseResultMap, prefixResults, ftsMatches] = await Promise.all([
      this.searchIndex.lookupByKeywords(this.id, preciseLookupTerms, preciseSearchLimit),
      shouldLookupPrefix
        ? this.searchIndex.lookupByKeywordPrefix(this.id, normalizedQuery, 200)
        : Promise.resolve([]),
      ftsQuery ? this.searchIndex.search(this.id, ftsQuery, 150) : Promise.resolve([])
    ])

    if (signal?.aborted) {
      return new TuffSearchResultBuilder(query).build()
    }

    const termMatches = terms.map(
      (term) => new Set((preciseResultMap.get(term) ?? []).map((entry) => entry.itemId))
    )
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

    if (shouldCheckPhrase) {
      const phraseStart = startTiming()
      const phraseMatches = preciseResultMap.get(normalizedQuery) ?? []

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
    if (shouldLookupPrefix) {
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
      if (signal?.aborted) {
        return new TuffSearchResultBuilder(query).build()
      }

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

    // Subsequence recall: "nte" → "netease", "wc" → "chatapp"
    // Catches cases where query chars appear in order but not contiguously
    const SUBSEQ_RECALL_THRESHOLD = 5
    if (candidateIds.size < SUBSEQ_RECALL_THRESHOLD && normalizedQuery.length >= 2) {
      const subseqStart = startTiming()
      const subseqResults = await this.searchIndex.lookupBySubsequence(this.id, normalizedQuery, 50)
      if (signal?.aborted) {
        return new TuffSearchResultBuilder(query).build()
      }

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

    if (signal?.aborted) {
      return new TuffSearchResultBuilder(query).build()
    }
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
    if (signal?.aborted) {
      return new TuffSearchResultBuilder(query).build()
    }
    const searchableAppsWithExtensions = appsWithExtensions.filter(isSearchableAppRow)
    const filteredAppsWithExtensions =
      this.isMac && this.appIndexSettings.hideNoisySystemApps
        ? (() => {
            const ruleCounts: Record<string, number> = {}
            const filtered = searchableAppsWithExtensions.filter((app) => {
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
            const filteredCount = searchableAppsWithExtensions.length - filtered.length
            if (filteredCount > 0) {
              appProviderLog.debug('Filtered noisy system apps from search candidates', {
                query: rawText,
                filteredCount,
                ruleCounts
              })
            }
            return filtered
          })()
        : searchableAppsWithExtensions
    const isFuzzySearch = !preciseMatchedItemIds || preciseMatchedItemIds.size === 0

    const processedResults = await processSearchResults(
      filteredAppsWithExtensions,
      query,
      isFuzzySearch,
      this.aliases
    )

    if (signal?.aborted) {
      return new TuffSearchResultBuilder(query).build()
    }

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

  private _registerWatchPaths(): void {
    const watchPaths = appScanner.getWatchPaths()
    logApp(`Registering watch paths: ${chalk.cyan(watchPaths.join(', '))}`, LogStyle.info)

    for (const p of watchPaths) {
      const depth = this.resolveWatchDepthForPath(p)
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
    const primary = this.context?.touchApp.window.window
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
          if (this.shuttingDown) return
          const lastScanTimestamp = (await this._getLastScanTime()) || 0
          if (
            lastScanTimestamp &&
            Date.now() - lastScanTimestamp < STARTUP_MDLS_SCAN_MIN_INTERVAL_DEV_MS
          ) {
            logApp('Skipping dev mode mdls scan: completed recently', LogStyle.info)
            return
          }

          await this.waitForMainRendererReady()
          await this._runScheduledMdlsReconcile()
          logApp('Dev mode mdls scan complete', LogStyle.success)
        })()
      }, delayMs)
    }

    logApp('Registering mdls update polling service (10 min interval)', LogStyle.info)
    pollingService.register(
      'app_provider_mdls_update_scan',
      async () => {
        if (this.shuttingDown) return
        const lastScanTimestamp = (await this._getLastScanTime()) || 0
        const now = Date.now()

        if (!isDevelopmentRuntime && now - lastScanTimestamp > 60 * 60 * 1000) {
          logApp('Over 1 hour since last scan, starting mdls scan', LogStyle.info)
          await this._runScheduledMdlsReconcile()
        } else if (isDevelopmentRuntime && !lastScanTimestamp) {
          logApp('First scan in dev mode', LogStyle.info)
          await this.waitForMainRendererReady()
          await this._runScheduledMdlsReconcile()
        } else {
          appProviderLog.debug(
            `${chalk.cyan(((now - lastScanTimestamp) / (60 * 1000)).toFixed(1))} minutes since last scan, skipping`
          )
        }
      },
      {
        interval: 10,
        unit: 'minutes',
        lane: 'maintenance',
        backpressure: 'latest_wins',
        dedupeKey: 'app_provider_mdls_update_scan',
        maxInFlight: 1
      }
    )
  }

  public async resetIndexedSourceLocalState(
    request: IndexedSourceResetRequest
  ): Promise<IndexedSourceResetResult> {
    const startedAt = Date.now()
    await this._runManualRebuild()
    return {
      sourceId: this.id,
      reason: request.reason,
      clearedSearchIndex: false,
      clearedScanProgress: false,
      startedAt,
      completedAt: Date.now()
    }
  }

  public async rebuildIndex(): Promise<AppIndexRebuildResult> {
    return await this.runExternalAppMutation(async () => {
      if (!this.context || !this.dbUtils) {
        const error = 'Cannot rebuild: initialization context not available'
        logApp(error, LogStyle.error)
        return { success: false, error }
      }

      try {
        const result = await this.requireIndexedSourceRuntimeDelegate().reset({
          sourceId: this.id,
          reason: IndexedSourceResetReasons.ManualRebuild,
          clearSearchIndex: true,
          clearScanProgress: false
        })
        if (result.error) {
          return {
            success: false,
            error: result.error,
            errorCode: result.errorCode,
            retryable: result.retryable,
            reportId: result.reportId
          }
        }
        return {
          success: true,
          message: 'App index rebuild complete'
        }
      } catch (error) {
        const report = operationalErrorService.report({
          domain: 'app-index',
          operation: 'manual-rebuild',
          error,
          code: 'APP_INDEX_REBUILD_FAILED',
          userImpact: 'blocked'
        })
        return {
          success: false,
          error: report.publicMessage,
          errorCode: report.code,
          retryable: report.retryable,
          reportId: report.id
        }
      }
    })
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
    const appRows = await db.select().from(filesSchema).where(eq(filesSchema.type, 'app'))
    const appsWithExtensions = await this.fetchExtensionsForFiles(appRows)
    const appIds = this.partitionDbApps(appsWithExtensions).scannedApps.map((row) => row.id)

    if (appIds.length > 0) {
      await this.runDbMutation(
        'app-provider.manual-rebuild-clear',
        async () => {
          await this.runAppTransaction(db, async (tx) => {
            await tx.delete(fileExtensions).where(inArray(fileExtensions.fileId, appIds))
            await tx.delete(filesSchema).where(inArray(filesSchema.id, appIds))
          })
        },
        'interactive'
      )
    }

    await this._clearPendingDeletions()

    logApp('Database cleared, rebuilding app index...', LogStyle.info)

    this.isInitializing = null
    await this._performFullSync(true)

    logApp('App database rebuild complete', LogStyle.success)
  }

  private async _getConfigNumber(key: string): Promise<number | null> {
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

  private async _getConfigTimestamp(key: string): Promise<number | null> {
    return this._getConfigNumber(key)
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

  private _runMdlsUpdateScan(): Promise<AppIndexSyncStats> {
    return this.runMaintenanceTask('mdls-update-scan', async () => {
      return await this._performMdlsUpdateScan()
    })
  }

  private async _runScheduledMdlsReconcile(): Promise<void> {
    if (this.shuttingDown) return
    if (this.mdlsReconcileTask) {
      await this.mdlsReconcileTask
      return
    }

    const task = this.requireIndexedSourceRuntimeDelegate()
      .reconcile('app-provider-scheduled-mdls')
      .then(() => undefined)
    this.mdlsReconcileTask = task
    try {
      await task
    } finally {
      if (this.mdlsReconcileTask === task) this.mdlsReconcileTask = null
    }
  }

  private async _performMdlsUpdateScan(): Promise<AppIndexSyncStats> {
    if (process.platform !== 'darwin') {
      logApp('Not on macOS, skipping mdls scan', LogStyle.info)
      return this.createEmptySyncStats()
    }

    if (!this.dbUtils) {
      logApp('Database not initialized, cannot run mdls scan', LogStyle.error)
      return {
        ...this.createEmptySyncStats(),
        skipped: 1,
        errors: 1
      }
    }

    const dbUtils = this.dbUtils

    logApp('Starting mdls update scan...', LogStyle.process)

    const t0 = performance.now()
    const allDbApps = await dbUtils.getFilesByType('app')
    const t1 = performance.now()
    if (allDbApps.length === 0) {
      logApp('No apps in DB, skipping mdls scan', LogStyle.info)
      return this.createEmptySyncStats()
    }

    await new Promise<void>((resolve) => setImmediate(resolve))

    const dbAppsWithExtensions = await this.fetchExtensionsForFiles(allDbApps)
    const { scannedApps: dbScannedAppsWithExtensions } = this.partitionDbApps(dbAppsWithExtensions)
    const t2 = performance.now()

    if (dbScannedAppsWithExtensions.length === 0) {
      logApp('No scanned apps in DB, skipping mdls scan', LogStyle.info)
      return this.createEmptySyncStats()
    }

    await new Promise<void>((resolve) => setImmediate(resolve))

    const scannedApps: ScannedAppInfo[] = []
    for (let mi = 0; mi < dbScannedAppsWithExtensions.length; mi++) {
      scannedApps.push(this._mapDbAppToScannedInfo(dbScannedAppsWithExtensions[mi]))
      if ((mi + 1) % 50 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
    }
    const dbAppsByUniqueId = new Map(
      dbScannedAppsWithExtensions.map((app) => [this.resolveDbAppKey(app), app])
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
      appsNeedingMdls = scannedApps.filter(shouldScanMdlsDisplayName)
      appsWithDisplayName = scannedApps.filter((app) => !shouldScanMdlsDisplayName(app))
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
    const db = dbUtils.getDb()

    if (updatedCount > 0 && updatedApps.length > 0) {
      for (const app of updatedApps) {
        const dbApp = dbAppsByUniqueId.get(this.resolveScannedAppKey(app))
        if (!dbApp) {
          continue
        }
        const nextDisplayName = normalizeDisplayName(resolveScannedDisplayName(app))
        await this.runDbMutation('app-provider.mdls-update', async () => {
          await this.runAppTransaction(db, async (tx, extensionWriter) => {
            await tx
              .update(filesSchema)
              .set({ displayName: nextDisplayName })
              .where(eq(filesSchema.id, dbApp.id))
            await this.syncScannedAppExtensions(dbApp.id, app, extensionWriter)
          })
        })
      }
    }

    if (appsNeedingMdls.length > 0 && updatedApps.length < appsNeedingMdls.length) {
      const updatedKeys = new Set(updatedApps.map((app) => this.resolveScannedAppKey(app)))
      const metadataOnlyApps = appsNeedingMdls.filter((app) => {
        if (!app.displayName) return false
        return !updatedKeys.has(this.resolveScannedAppKey(app))
      })

      for (const app of metadataOnlyApps) {
        const dbApp = dbAppsByUniqueId.get(this.resolveScannedAppKey(app))
        if (!dbApp) continue
        await this.runDbMutation('app-provider.mdls-metadata', async () => {
          await this.runAppTransaction(db, async (_tx, extensionWriter) => {
            await this.syncScannedAppExtensions(dbApp.id, app, extensionWriter)
          })
        })
      }
    }
    const t4 = performance.now()

    if (deletedApps.length > 0) {
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
          await this.runDbMutation('app-provider.mdls-delete', async () => {
            await this.runAppTransaction(db, async (tx) => {
              await tx.delete(filesSchema).where(eq(filesSchema.id, dbApp.id))
              await tx.delete(fileExtensions).where(eq(fileExtensions.fileId, dbApp.id))
            })
          })

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

    return {
      added: 0,
      changed: updatedCount,
      deleted: deletedApps.length,
      skipped: appsWithDisplayName.length,
      errors: 0
    }
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
