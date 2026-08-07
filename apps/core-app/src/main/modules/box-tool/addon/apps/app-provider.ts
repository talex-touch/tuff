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
import { normalizeFsPath } from '@talex-touch/utils/common/file-scan-utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import { TuffInputType, TuffSearchResultBuilder } from '@talex-touch/utils/core-box'
import {
  IndexedSourceGroupedEvidenceService,
  IndexedSourceResetReasons,
  IndexedSourceRootEvidenceService,
  IndexedSourceScanReasons,
  buildSearchKeywordLookupTerms,
  collectSearchKeywordMatches,
  hasHanCharacter,
  normalizeSearchText
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
import { type DbWritePriority } from '../../../../db/db-write-scheduler'
import { scheduleDbWrite } from '../../../../db/db-write'
import { getStartupDegradeWindowRemainingMs } from '../../../../db/runtime-flags'

import { createDbUtils, type CoreDatabase, type DbUtils } from '../../../../db/utils'
import { appTaskGate } from '../../../../service/app-task-gate'
import { deviceIdleService } from '../../../../service/device-idle-service'
import { iconService } from '../../../../service/icon-service'
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
import { resolveExistingVersionedAppIconCachePath } from './app-icon-cache'
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
type AppFileWriteDb = Pick<CoreDatabase, 'insert' | 'delete'>
type AppFileMutationDb = Pick<CoreDatabase, 'insert' | 'update' | 'delete'>
type AppDbBatchItem = Parameters<CoreDatabase['batch']>[0][number]
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
const PROD_MDLS_SCAN_MIN_INTERVAL_MS = 60 * 60 * 1000
const WINDOWS_REALTIME_APP_EXTENSIONS = new Set(['.lnk', '.exe', '.appref-ms'])

// Install-to-searchable budget for one app, summed across the watch chain:
//   FSEvents dispatch  0.1-1s   (OS, chokidar-fsevents)
// + event coalescing   0.4s     (APP_WATCH_COALESCE_WINDOW_MS, indexed-source-event-router)
// + stability wait     0.55s    (APP_STABILITY_PROBE_INTERVAL_MS + APP_STABILITY_SETTLE_MS)
// + app info + upsert  ~0.35s
//   = 1.5-2.5s against a 10s target.
// chokidar already applies a 2000ms awaitWriteFinish threshold upstream, so the probe pair here
// only has to catch a bundle still being copied in, not debounce the write burst itself.
const APP_STABILITY_PROBE_INTERVAL_MS = 300
const APP_STABILITY_SETTLE_MS = 250

// Per-path resolution retry (F1). A transient failure — chunk load, mdls throttle, Spotlight lag,
// bundle mid-write — is retried out of band so the watch route (and its source mutation lease) is
// not held for the whole backoff. Retries are scheduled, never awaited inline.
const APP_RESOLUTION_RETRY_DELAYS_MS = [2_000, 8_000, 30_000] as const
const APP_RESOLUTION_RETRY_MAX_TRACKED_PATHS = 64
// Dead-letter sweep runs only while the set is non-empty and is torn down as soon as it drains,
// so an idle app index holds zero timers.
const APP_RESOLUTION_DEAD_LETTER_SWEEP_INTERVAL_MS = 10 * 60 * 1000
const APP_RESOLUTION_DEAD_LETTER_MAX_SWEEPS = 3
const APP_RESOLUTION_DEAD_LETTER_MAX_ENTRIES = 64

// The watch-root cardinality probe (F4) only ever runs on macOS, so it states the normalization
// platform instead of reading the running one: the two unicode forms it has to reconcile are an
// Apple filesystem artefact, and on a byte-exact filesystem they would be two different bundles.
const WATCH_ROOT_PROBE_PLATFORM = 'darwin'

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
const APP_ADDITION_COMMIT_CHUNK_SIZE = 50
const EMPTY_APP_EXTENSION_MAP: Readonly<Record<string, string | null>> = {}

interface PendingDeletionEntry {
  id: number
  path: string
  uniqueId: string
  firstMissedAt: number
  missCount: number
}

interface AppResolutionRetryEntry {
  /** Retries already scheduled for this path; indexes into APP_RESOLUTION_RETRY_DELAYS_MS. */
  attempt: number
  managedEntry: boolean
  timer: NodeJS.Timeout | null
}

interface AppResolutionDeadLetterEntry {
  managedEntry: boolean
  sweeps: number
  lastError: string
}

interface ScannedAppMetadataUpdate {
  fileId: number
  app: ScannedAppInfo
  existingDisplayName: string | null
  existingDisplayNameQuality?: ScannedAppInfo['displayNameQuality']
  existingExtensions: Record<string, string | null>
  existingName?: string
}

class AppProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'app-provider'
  readonly name = 'App Provider'
  readonly type = 'application' as const
  readonly supportedInputTypes = [TuffInputType.Text]
  readonly priority = 'fast' as const

  private dbUtils: DbUtils | null = null
  private context: ProviderContext | null = null
  private isInitializing: Promise<void> | null = null
  private readonly isMac = process.platform === 'darwin'
  private processingPaths: Set<string> = new Set()
  private aliases: Record<string, string[]> = {}
  private searchIndex: SearchIndexService | null = null
  private appIndexSettings: AppIndexSettings = { ...DEFAULT_APP_INDEX_SETTINGS }
  private startupBackfillStarted = false
  /**
   * Set when a Startup-reason backfill skipped its filesystem diff + DB writes
   * because it ran inside the startup degrade window (R4). scanIndexedSource
   * must then NOT stamp the last-backfill timestamp — the window-gated timer
   * re-run owns the real (write-performing) backfill, and stamping early would
   * make its dev recent-backfill guard skip it.
   */
  private startupBackfillWritesDeferred = false
  private startupIndexHealthCheckStarted = false
  private volatileLastBackfillTime: number | null = null
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
  private readonly appResolutionRetries = new Map<string, AppResolutionRetryEntry>()
  private readonly appResolutionDeadLetters = new Map<string, AppResolutionDeadLetterEntry>()
  private appResolutionSweepTimer: NodeJS.Timeout | null = null
  private readonly startupProducerAbort = new AbortController()
  private readonly externalMutationTasks = new Set<Promise<unknown>>()
  private readonly appIconHydrationPending = new Set<string>()
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
    // Busy retry is scheduler-owned (delayed re-enqueue); no inner withSqliteRetry.
    return await scheduleDbWrite(label, operation, { priority, dropPolicy: 'none' })
  }

  private async runAppTransaction<T>(
    db: CoreDatabase,
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

  private async executeAppBatch(db: CoreDatabase, queries: AppDbBatchItem[]): Promise<void> {
    const firstQuery = queries[0]
    if (!firstQuery) return
    const batch: [AppDbBatchItem, ...AppDbBatchItem[]] = [firstQuery, ...queries.slice(1)]
    await db.batch(batch)
  }

  private async persistScannedAppAdditions(
    label: string,
    apps: readonly ScannedAppInfo[],
    signal?: AbortSignal
  ): Promise<void> {
    if (apps.length === 0 || !this.dbUtils) return
    const db = this.dbUtils.getDb()

    // One transaction for the whole backfill keeps the WAL writer lock for its full duration and
    // starves every other writer, so commit per chunk and hand the lock back in between. Each row is
    // an upsert keyed by the unique `files.path`, so a chunk that fails leaves the already committed
    // apps intact and the next backfill diffs the DB against the scan and re-adds what is missing.
    for (let offset = 0; offset < apps.length; offset += APP_ADDITION_COMMIT_CHUNK_SIZE) {
      signal?.throwIfAborted()
      const chunk = apps.slice(offset, offset + APP_ADDITION_COMMIT_CHUNK_SIZE)

      await this.runDbMutation(label, async () => {
        await this.runAppTransaction(db, async (tx, extensionWriter) => {
          for (const appInfo of chunk) {
            signal?.throwIfAborted()
            if (!appInfo) continue
            const [insertedFile] = await tx
              .insert(filesSchema)
              .values({
                path: appInfo.path,
                name: appInfo.name,
                displayName: resolveScannedDisplayName(appInfo),
                type: 'app' as const,
                mtime: appInfo.lastModified,
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
              await this.syncScannedAppExtensions(
                insertedFile.id,
                appInfo,
                extensionWriter,
                EMPTY_APP_EXTENSION_MAP
              )
            }
          }
        })
      })

      logApp(
        `Processed ${chalk.cyan(offset + chunk.length)}/${chalk.cyan(apps.length)} app additions`,
        LogStyle.info
      )
    }
  }

  private buildScannedAppUpdateData(
    update: ScannedAppMetadataUpdate
  ): Partial<typeof filesSchema.$inferInsert> {
    const { app: appInfo, existingDisplayName, existingDisplayNameQuality } = update
    const updateData: Partial<typeof filesSchema.$inferInsert> = {
      path: appInfo.path,
      mtime: appInfo.lastModified
    }

    if (update.existingName !== undefined) {
      updateData.name = isProbablyCorruptedDisplayName(appInfo.name)
        ? update.existingName
        : appInfo.name
    }

    const nextDisplayName = normalizeDisplayName(resolveScannedDisplayName(appInfo))
    if (
      shouldUpdateDisplayName(existingDisplayName, nextDisplayName, {
        currentQuality: existingDisplayNameQuality,
        incomingQuality: appInfo.displayNameQuality
      })
    ) {
      updateData.displayName = nextDisplayName
    }
    return updateData
  }

  private async persistScannedAppMetadataUpdates(
    label: string,
    updates: readonly ScannedAppMetadataUpdate[],
    signal?: AbortSignal
  ): Promise<void> {
    if (updates.length === 0 || !this.dbUtils) return
    const db = this.dbUtils.getDb()

    // Reuse one LibSQL transaction per bounded chunk. Starting one transaction per app retains a
    // local database connection until native cleanup runs, while one unbounded transaction holds
    // the WAL writer lock for too long during large rescans.
    for (let offset = 0; offset < updates.length; offset += APP_ADDITION_COMMIT_CHUNK_SIZE) {
      signal?.throwIfAborted()
      const chunk = updates.slice(offset, offset + APP_ADDITION_COMMIT_CHUNK_SIZE)

      await this.runDbMutation(label, async () => {
        await this.runAppTransaction(db, async (tx, extensionWriter) => {
          for (const update of chunk) {
            signal?.throwIfAborted()
            const { fileId, app: appInfo } = update
            await tx
              .update(filesSchema)
              .set(this.buildScannedAppUpdateData(update))
              .where(eq(filesSchema.id, fileId))
            await this.syncScannedAppExtensions(
              fileId,
              appInfo,
              extensionWriter,
              update.existingExtensions
            )
          }
        })
      })

      logApp(
        `Processed ${chalk.cyan(offset + chunk.length)}/${chalk.cyan(updates.length)} app updates`,
        LogStyle.info
      )
    }
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
        this.clearAppResolutionTimers()
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
    // The app CATALOG (files/file_extensions rows of type 'app', including
    // user-authored managed entries) lives on the PRIMARY db: every write in
    // this provider is a raw transaction on getDb(), and manual entries are
    // user data that must not move into the rebuildable search-index.db. So
    // reads must target the primary too — passing the search-split context here
    // (c86d82db5) routed catalog READS to the empty search file while the raw
    // txn WRITES stayed on the primary, and with the split on the record-batch
    // builder then found zero apps and never pushed anything into the search
    // index (V1 2026-08-05 ship-blocker #3). The search-index HOME is bridged
    // by the push pipeline instead: catalog rows → indexed-source records →
    // worker-owned search_index/keyword_mappings in search-index.db.
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
    const isWarming = await this.isAppIndexWarming()

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
      if (this.startupBackfillWritesDeferred) {
        // The backfill deferred its writes past the degrade window: leave the
        // last-backfill timestamp untouched so the timer-driven re-run is not
        // skipped by the dev recent-backfill guard (and isAppIndexWarming
        // keeps reporting an unfinished first pass on a true first launch).
        this.startupBackfillWritesDeferred = false
      } else {
        await this._setLastBackfillTime(Date.now())
      }
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
    writer?: AppFileWriteDb,
    existingExtensions?: Readonly<Record<string, string | null>>
  ): Promise<void> {
    const extensions = buildAppExtensions(fileId, app)
    await this.upsertAppExtensions(writer, extensions)

    const missingExtensionKeys = resolveMissingScannedExtensionKeys(
      extensions,
      APP_SCANNED_OPTIONAL_EXTENSION_KEYS
    )
    const staleExtensionKeys = existingExtensions
      ? missingExtensionKeys.filter((key) => Object.hasOwn(existingExtensions, key))
      : missingExtensionKeys

    if (staleExtensionKeys.length > 0) {
      const deleteWriter = writer ?? this.dbUtils!.getDb()
      await deleteWriter
        .delete(fileExtensions)
        .where(
          and(eq(fileExtensions.fileId, fileId), inArray(fileExtensions.key, staleExtensionKeys))
        )
    }
  }

  private async repairPersistedAppIconPointers(apps: DbAppWithExtensions[]): Promise<void> {
    if ((!this.isMac && process.platform !== 'win32') || !this.dbUtils || apps.length === 0) {
      return
    }

    const iconUpserts: Array<{ fileId: number; key: string; value: string }> = []
    const staleIconFileIds: number[] = []
    for (const dbApp of apps) {
      const persistedIcon = dbApp.extensions.icon?.trim() || ''
      const cachedIcon = resolveExistingVersionedAppIconCachePath(
        dbApp.path,
        dbApp.extensions.bundleId || ''
      )

      if (cachedIcon) {
        if (persistedIcon !== cachedIcon) {
          iconUpserts.push({ fileId: dbApp.id, key: 'icon', value: cachedIcon })
          dbApp.extensions.icon = cachedIcon
        }
      } else if (hasAppIconDrift(persistedIcon, undefined)) {
        staleIconFileIds.push(dbApp.id)
        dbApp.extensions.icon = null
      }
    }

    if (iconUpserts.length === 0 && staleIconFileIds.length === 0) return

    await this.runDbMutation('app-provider.icon-pointer-repair', async () => {
      const db = this.dbUtils!.getDb()
      if (typeof db.batch !== 'function') {
        await this.runAppTransaction(db, async (tx, extensionWriter) => {
          const writer = extensionWriter ?? tx
          await this.upsertAppExtensions(writer, iconUpserts)
          if (staleIconFileIds.length > 0) {
            await writer
              .delete(fileExtensions)
              .where(
                and(
                  eq(fileExtensions.key, 'icon'),
                  inArray(fileExtensions.fileId, staleIconFileIds)
                )
              )
          }
        })
        return
      }

      const queries: AppDbBatchItem[] = []
      if (iconUpserts.length > 0) {
        queries.push(
          db
            .insert(fileExtensions)
            .values(iconUpserts)
            .onConflictDoUpdate({
              target: [fileExtensions.fileId, fileExtensions.key],
              set: { value: sql`excluded.value` }
            })
        )
      }
      if (staleIconFileIds.length > 0) {
        queries.push(
          db
            .delete(fileExtensions)
            .where(
              and(eq(fileExtensions.key, 'icon'), inArray(fileExtensions.fileId, staleIconFileIds))
            )
        )
      }
      await this.executeAppBatch(db, queries)
    })

    logApp(
      `Repaired ${chalk.green(iconUpserts.length)} cached and cleared ${chalk.yellow(staleIconFileIds.length)} stale app icon pointers`,
      LogStyle.success
    )
  }

  private async persistHydratedAppIcons(
    entries: ReadonlyArray<{ appInfo: ScannedAppInfo; icon: string }>
  ): Promise<Set<string>> {
    if (!this.dbUtils || entries.length === 0) return new Set()

    const entriesByPath = new Map(entries.map((entry) => [entry.appInfo.path, entry]))
    const rows = await this.dbUtils
      .getDb()
      .select({ id: filesSchema.id, path: filesSchema.path })
      .from(filesSchema)
      .where(inArray(filesSchema.path, [...entriesByPath.keys()]))
    const extensions = rows.flatMap((row) => {
      const entry = entriesByPath.get(row.path)
      return entry ? [{ fileId: row.id, key: 'icon', value: entry.icon }] : []
    })
    if (extensions.length === 0) return new Set()

    await this.runDbMutation('app-provider.icon-hydrate-batch', async () => {
      const db = this.dbUtils!.getDb()
      if (typeof db.batch !== 'function') {
        await this.runAppTransaction(db, async (tx, extensionWriter) => {
          await this.upsertAppExtensions(extensionWriter ?? tx, extensions)
        })
        return
      }

      await db.batch([
        db
          .insert(fileExtensions)
          .values(extensions)
          .onConflictDoUpdate({
            target: [fileExtensions.fileId, fileExtensions.key],
            set: { value: sql`excluded.value` }
          })
      ])
    })

    return new Set(rows.map((row) => row.path))
  }

  private scheduleAppIconHydration(scannedApps: ScannedAppInfo[]): void {
    if (!this.isMac && process.platform !== 'win32') {
      void this._recordMissingIconApps(scannedApps).catch((error) => {
        logApp('Failed to record missing app icons', LogStyle.warning, {
          error: error instanceof Error ? error.message : String(error)
        })
      })
      return
    }

    const candidates = scannedApps.filter(
      (appInfo) =>
        !appInfo.icon &&
        (this.isMac || Boolean(appInfo.iconSourcePath)) &&
        !this.appIconHydrationPending.has(appInfo.path)
    )
    if (candidates.length === 0) {
      void this._recordMissingIconApps(scannedApps).catch((error) => {
        logApp('Failed to record missing app icons', LogStyle.warning, {
          error: error instanceof Error ? error.message : String(error)
        })
      })
      return
    }

    for (const appInfo of candidates) {
      this.appIconHydrationPending.add(appInfo.path)
    }

    const task = this.runExternalAppMutation(async () => {
      const hydratedEntries: Array<{ appInfo: ScannedAppInfo; icon: string }> = []

      for (const appInfo of candidates) {
        if (this.shuttingDown) break

        try {
          const icon = await iconService.ensureAppIcon(
            appInfo.iconSourcePath ?? appInfo.path,
            appInfo.bundleId
          )
          if (!icon) continue

          appInfo.icon = icon
          hydratedEntries.push({ appInfo, icon })
        } catch (error) {
          logApp(`Failed to hydrate app icon for ${chalk.yellow(appInfo.path)}`, LogStyle.warning, {
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      let pendingPersistence = hydratedEntries
      let lastPersistenceError: unknown
      const maxAttempts = 3
      for (let attempt = 1; attempt <= maxAttempts && pendingPersistence.length > 0; attempt += 1) {
        if (this.shuttingDown) break

        try {
          const persistedPaths = await this.persistHydratedAppIcons(pendingPersistence)
          pendingPersistence = pendingPersistence.filter(
            ({ appInfo }) => !persistedPaths.has(appInfo.path)
          )
          lastPersistenceError = undefined
        } catch (error) {
          lastPersistenceError = error
        }

        if (pendingPersistence.length > 0 && attempt < maxAttempts) {
          await this.waitForStartupProducerDelay(500 * 2 ** (attempt - 1))
        }
      }

      if (!this.shuttingDown && pendingPersistence.length > 0) {
        logApp(
          `Deferred persistence for ${chalk.yellow(pendingPersistence.length)} hydrated app icons`,
          LogStyle.warning,
          lastPersistenceError
            ? {
                error:
                  lastPersistenceError instanceof Error
                    ? lastPersistenceError.message
                    : String(lastPersistenceError)
              }
            : undefined
        )
      }

      if (!this.shuttingDown) {
        await this._recordMissingIconApps(scannedApps)
      }
      if (hydratedEntries.length > 0) {
        logApp(
          `Hydrated ${chalk.green(hydratedEntries.length)} app icons in background`,
          LogStyle.success
        )
      }
    }).finally(() => {
      for (const appInfo of candidates) {
        this.appIconHydrationPending.delete(appInfo.path)
      }
    })

    void task.catch((error) => {
      if (this.shuttingDown) return
      logApp('Background app icon hydration failed', LogStyle.warning, {
        error: error instanceof Error ? error.message : String(error)
      })
    })
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

  /**
   * @param options.probeFilesystem Also compare the watch roots against the stored rows. Row counts
   *   alone cannot see an app that never made it into the database — a full `/Applications` and a
   *   full index agree with each other while both are missing the same bundle — so the decision
   *   points that can act on the answer (startup health check, backfill guard) ask for the
   *   filesystem cardinality too. It is a readdir per root, never polled.
   */
  private async getAppSearchIndexHealth(options?: { probeFilesystem?: boolean }): Promise<{
    appCount: number
    indexedItemCount: number
    healthy: boolean
    unindexedOnDisk?: number
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

    const countsHealthy = apps.length > 0 && indexedItemCount > 0
    if (!countsHealthy || options?.probeFilesystem !== true) {
      return { appCount: apps.length, indexedItemCount, healthy: countsHealthy }
    }

    const unindexedOnDisk = await this.countUnindexedWatchRootApps(apps)
    if (unindexedOnDisk > 0) {
      logApp(
        `Watch roots hold ${chalk.yellow(unindexedOnDisk)} app(s) missing from the index`,
        LogStyle.warning
      )
    }

    return {
      appCount: apps.length,
      indexedItemCount,
      healthy: unindexedOnDisk === 0,
      unindexedOnDisk
    }
  }

  /**
   * Counts `.app` bundles sitting directly in a watch root that have no row yet. Cardinality only:
   * no stat of the bundle contents, no plist read, no mdls. The scan depth for these roots is 1, so
   * a single readdir per root sees everything the watcher itself would report.
   *
   * Because a non-zero answer is what makes the source unhealthy, a miscount is expensive: it buys
   * a full backfill on every launch. Two things are therefore checked before counting an entry —
   * both sides of the comparison are normalized (macOS hands out decomposed names where the stored
   * row is composed, see normalizeFsPath), and the entry has to carry a manifest, because a
   * directory merely named `*.app` can never produce a row and would otherwise pin the source
   * unhealthy forever. The manifest check costs one `access` per *unmatched* entry, so a healthy
   * index pays nothing for it.
   */
  private async countUnindexedWatchRootApps(appRows: DbAppRecord[]): Promise<number> {
    if (!this.isMac) return 0

    const indexedPaths = new Set(
      appRows.map((row) => normalizeFsPath(path.resolve(row.path), WATCH_ROOT_PROBE_PLATFORM))
    )
    let unindexed = 0

    for (const watchPath of appScanner.getWatchPaths()) {
      if (!watchPath) continue
      let entries: string[]
      try {
        entries = await fs.readdir(watchPath)
      } catch {
        // A missing or unreadable root is the watcher's problem, not evidence of a stale index.
        continue
      }

      for (const entry of entries) {
        if (!entry.endsWith('.app')) continue
        const entryPath = path.resolve(watchPath, entry)
        if (indexedPaths.has(normalizeFsPath(entryPath, WATCH_ROOT_PROBE_PLATFORM))) continue
        if (!(await this.hasBundleManifest(entryPath))) continue
        unindexed += 1
      }
    }

    return unindexed
  }

  private async hasBundleManifest(bundlePath: string): Promise<boolean> {
    try {
      await fs.access(path.join(bundlePath, 'Contents', 'Info.plist'))
      return true
    } catch {
      return false
    }
  }

  private isAppIndexPipelineBusy(): boolean {
    return (
      this.isInitializing !== null ||
      this.startupBackfillTimer !== null ||
      this.startupBackfillTask !== null
    )
  }

  // A scan writes `files` rows while it runs but its `search_index` rows are only committed once the
  // producer finishes, so an empty index is expected until the first commit lands. A Runtime scan
  // reaches `isInitializing` only when its generator is pulled, so the persisted backfill timestamp
  // is what tells apart "first pass still pending" from "index really is broken".
  private async isAppIndexWarming(): Promise<boolean> {
    if (this.isAppIndexPipelineBusy()) return true
    if (!this.appIndexSettings.startupBackfillEnabled) return false
    return (await this._getLastBackfillTime()) === null
  }

  private async waitForAppIndexPipelineIdle(): Promise<void> {
    const signal = this.startupProducerAbort.signal
    let onAbort: (() => void) | undefined
    const aborted = new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve()
        return
      }
      onAbort = () => resolve()
      signal.addEventListener('abort', onAbort, { once: true })
    })
    // Owners clear their task field from a derived promise chain, so a re-read can still hand back
    // the promise that just settled. Awaiting each promise at most once keeps that from spinning on
    // microtasks while still following the pipeline onto a genuinely new task.
    const awaited = new Set<Promise<void>>()

    try {
      while (!this.shuttingDown && !signal.aborted) {
        const pending = [this.startupBackfillTask, this.isInitializing].find(
          (task): task is Promise<void> => task !== null && !awaited.has(task)
        )
        if (!pending) return
        awaited.add(pending)
        // Producers report their own failures; here a rejection only means the wait is over. The
        // abort race matters because shutdown drains this probe but not the Runtime scan it waits
        // on, so a scan that never settles must not pin the drain.
        await Promise.race([pending.catch(() => undefined), aborted])
      }
    } finally {
      if (onAbort) signal.removeEventListener('abort', onAbort)
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
      await this.waitForAppIndexPipelineIdle()
      if (this.shuttingDown) return

      const health = await this.getAppSearchIndexHealth({ probeFilesystem: true })
      if (health.healthy) {
        appProviderLog.debug('App search index health check passed', { meta: health })
        return
      }

      if (await this.isAppIndexWarming()) {
        appProviderLog.debug('App search index is warming, deferring to the scan owner', {
          meta: health
        })
        return
      }

      logApp(
        `App search index is empty or incomplete (apps=${chalk.cyan(
          health.appCount
        )}, indexed=${chalk.cyan(health.indexedItemCount)}, unindexedOnDisk=${chalk.cyan(
          health.unindexedOnDisk ?? 0
        )}), triggering startup backfill`,
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
    const baseDelayMs = isDevelopmentRuntime
      ? STARTUP_BACKFILL_INITIAL_DELAY_MS + STARTUP_HEAVY_TASK_EXTRA_DELAY_DEV_MS
      : STARTUP_BACKFILL_INITIAL_DELAY_MS
    // Startup write-storm gate (R4): defer the backfill (and its batched
    // backfill-add/backfill-update writes) past the DB startup degrade window.
    const delayMs = Math.max(baseDelayMs, getStartupDegradeWindowRemainingMs())
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
        const health = await this.getAppSearchIndexHealth({ probeFilesystem: true })
        if (health.healthy) {
          return { allowed: false, reason: 'recent-backfill' }
        }
        logApp(
          `Ignoring recent-backfill guard because app search index is unhealthy (apps=${chalk.cyan(
            health.appCount
          )}, indexed=${chalk.cyan(health.indexedItemCount)}, unindexedOnDisk=${chalk.cyan(
            health.unindexedOnDisk ?? 0
          )})`,
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

    // Startup write-storm gate (R4), boot-path edition. The window-gated timer
    // in _scheduleStartupBackfill() no longer owns boot: since the Runtime
    // writer-ownership change, the boot backfill runs inline through
    // search-core's initial app scan (runInitialAppScan → scanIndexedSource →
    // here) ~1-2s after boot, so the gate must live on this shared execution
    // path. Inside the window we skip the mdls/filesystem diff and every DB
    // write it can produce (backfill-add, backfill-update, icon-pointer
    // repair) and arm the deferred timer to run the real backfill after the
    // window. First launch is exempt (last-backfill timestamp still null, the
    // same signal isAppIndexWarming uses): initial population is what makes
    // apps searchable, and there is no startup indexing load worth protecting
    // ahead of it.
    const degradeRemainingMs = getStartupDegradeWindowRemainingMs()
    if (degradeRemainingMs > 0 && (await this._getLastBackfillTime()) !== null) {
      this.startupBackfillWritesDeferred = true
      logApp(
        `Startup backfill deferred past DB degrade window (${Math.round(
          degradeRemainingMs / 1000
        )}s remaining)`,
        LogStyle.info
      )
      // Arm the window-gated timer unless one is already pending/running; the
      // started-latch only guards double-arming, so release it for this
      // deliberate deferral re-arm (bounded: the window itself expires).
      if (this.startupBackfillTimer === null && this.startupBackfillTask === null) {
        this.startupBackfillStarted = false
        this._scheduleStartupBackfill()
      }
      return
    }

    const initStart = startTiming()
    logApp('Starting startup backfill...', LogStyle.process)

    const scanStart = startTiming()
    const scannedApps = await this.loadScannedApps({ forceRefresh: true })
    signal?.throwIfAborted()
    this.scheduleAppIconHydration(scannedApps)
    logAppDuration('BackfillScanApps', scanStart, {
      label: `Scanned ${chalk.cyan(scannedApps.length)} apps`,
      style: 'info',
      unit: 's',
      precision: 2
    })

    const dbLoadStart = startTiming()
    const dbApps = await this.dbUtils!.getFilesByType('app')
    const dbAppsWithExtensions = await this.fetchExtensionsForFiles(dbApps)
    signal?.throwIfAborted()
    const { scannedApps: dbScannedAppsWithExtensions, managedEntries } =
      this.partitionDbApps(dbAppsWithExtensions)
    await this.repairPersistedAppIconPointers(dbScannedAppsWithExtensions)
    signal?.throwIfAborted()
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

      await this.persistScannedAppAdditions('app-provider.backfill-add', toAdd, signal)
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

      await this.persistScannedAppMetadataUpdates(
        'app-provider.backfill-update',
        toUpdateMetadata,
        signal
      )
      signal?.throwIfAborted()

      logApp(
        `DisplayName correction summary: updated ${chalk.green(toUpdateMetadata.length)}, failed ${chalk.yellow(0)}`,
        LogStyle.success
      )
      logAppDuration('BackfillFixDisplayName', updateStartTime, {
        label: 'App metadata correction complete',
        style: 'success',
        unit: 's',
        precision: 1,
        suffix: `(updated=${chalk.green(toUpdateMetadata.length)}, failed=${chalk.yellow(0)})`
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

    for (const name of names) {
      const lowerCaseName = name.toLowerCase()
      generatedKeywords.add(lowerCaseName)
      generatedKeywords.add(lowerCaseName.replace(/\s/g, ''))

      lowerCaseName.split(/[\s-]/).forEach((word) => {
        if (word) generatedKeywords.add(word)
      })

      const acronym = this._generateAcronym(name)
      if (acronym) generatedKeywords.add(acronym)

      if (hasHanCharacter(name)) {
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

    // Keywords are cleaned rather than vetoed, so multi-word aliases
    // ("vs code") and non-Latin names survive instead of being dropped whole.
    const finalKeywords = new Set<string>()
    for (const keyword of generatedKeywords) {
      const normalized = normalizeSearchText(keyword)
      if (normalized.length > 1) {
        finalKeywords.add(normalized)
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
    this.scheduleAppIconHydration(scannedApps)
    logAppDuration('ScanApps', scanStart, {
      label: `Scanned ${chalk.cyan(scannedApps.length)} apps`,
      style: 'info',
      unit: 's',
      precision: 2
    })
    const scannedAppsMap = this.buildScannedAppsMap(scannedApps)

    const dbLoadStart = startTiming()
    const dbApps = await this.dbUtils!.getFilesByType('app')
    const dbAppsWithExtensions = await this.fetchExtensionsForFiles(dbApps)
    const { scannedApps: dbScannedAppsWithExtensions, managedEntries } =
      this.partitionDbApps(dbAppsWithExtensions)
    await this.repairPersistedAppIconPointers(dbScannedAppsWithExtensions)
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

      await this.persistScannedAppAdditions('app-provider.batch-add', toAdd)

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

      await this.persistScannedAppMetadataUpdates('app-provider.batch-update', toUpdate)

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
        mtime: appInfo.lastModified,
        lastIndexedAt: new Date()
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
              await this.syncScannedAppExtensions(
                existingFile.id,
                appInfo,
                extensionWriter,
                existingExtensions
              )
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
              ctime: new Date(),
              lastIndexedAt: new Date()
            })
            .returning()

          if (inserted) {
            if (options.managedEntry === true) {
              await this.upsertAppExtensions(
                extensionWriter,
                buildManagedEntryExtensions(inserted.id, appInfo, true)
              )
            } else {
              await this.syncScannedAppExtensions(
                inserted.id,
                appInfo,
                extensionWriter,
                EMPTY_APP_EXTENSION_MAP
              )
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
    options: { managedEntry?: boolean; scheduleRetry?: boolean } = {}
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
      const resolution = await appScanner.resolveAppInfoByPath(appPath)
      if (!resolution.ok) {
        if (resolution.outcome === 'not-app') {
          logApp(`Not an app, skipping: ${chalk.yellow(appPath)}`, LogStyle.warning)
          this.forgetAppResolutionFailure(appPath)
          return { success: false, status: 'invalid', reason: 'not-app' }
        }

        logApp(`Failed to resolve app info for: ${chalk.yellow(appPath)}`, LogStyle.warning, {
          error:
            resolution.error instanceof Error ? resolution.error.message : String(resolution.error)
        })
        this.handleAppResolutionFailure(appPath, resolution.error, options)
        return { success: false, status: 'error', reason: 'scan-failed' }
      }

      const appInfo = resolution.appInfo
      const status = await this.upsertAppInfo(appInfo, options)
      this.scheduleAppIconHydration([appInfo])
      this.forgetAppResolutionFailure(appPath)
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

  /**
   * Parks a transient resolution failure for an out-of-band retry. The watch route must not await
   * the backoff: it runs under the per-source mutation lease, so sleeping here would stall every
   * other app event for the length of the ladder.
   */
  private handleAppResolutionFailure(
    appPath: string,
    error: unknown,
    options: { managedEntry?: boolean; scheduleRetry?: boolean } = {}
  ): void {
    if (options.scheduleRetry === false || this.shuttingDown) return

    const managedEntry = options.managedEntry === true
    const existing = this.appResolutionRetries.get(appPath)
    const attempt = existing?.attempt ?? 0
    if (existing?.timer) clearTimeout(existing.timer)

    const delayMs = APP_RESOLUTION_RETRY_DELAYS_MS[attempt]
    if (delayMs === undefined) {
      this.moveAppResolutionToDeadLetter(appPath, error, managedEntry, attempt, 'retries-exhausted')
      return
    }
    if (!existing && this.appResolutionRetries.size >= APP_RESOLUTION_RETRY_MAX_TRACKED_PATHS) {
      // Too many paths are failing at once to give this one a ladder of its own; it skips straight
      // to the sweep, which is the bounded queue the ladder would have handed it to anyway.
      this.moveAppResolutionToDeadLetter(appPath, error, managedEntry, attempt, 'retry-slots-full')
      return
    }

    const timer = setTimeout(() => {
      const entry = this.appResolutionRetries.get(appPath)
      if (entry) entry.timer = null
      void this.retryAppResolution(appPath, managedEntry)
    }, delayMs)
    timer.unref?.()
    // The attempt counter must survive the timer firing, otherwise the ladder restarts at its
    // first delay on every failure and never reaches the dead letter.
    this.appResolutionRetries.set(appPath, { attempt: attempt + 1, managedEntry, timer })

    logApp(
      `App resolution failed, retry ${attempt + 1}/${APP_RESOLUTION_RETRY_DELAYS_MS.length} in ${Math.round(
        delayMs / 1000
      )}s: ${chalk.yellow(appPath)}`,
      LogStyle.warning
    )
  }

  private async retryAppResolution(appPath: string, managedEntry: boolean): Promise<void> {
    if (this.shuttingDown) return
    try {
      const result = await this.processAppPath(appPath, { managedEntry })
      if (!result.success || !result.appInfo) return
      logApp(`App resolution recovered on retry: ${chalk.green(appPath)}`, LogStyle.success)
      await this.publishRecoveredAppResolution(result.appInfo)
    } catch (error) {
      logApp('App resolution retry failed', LogStyle.warning, {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * A retry runs outside the watch route, so nothing downstream publishes its record; the provider
   * has to hand the recovered app to the runtime itself or the row would stay out of the index.
   */
  private async publishRecoveredAppResolution(appInfo: ScannedAppInfo): Promise<void> {
    try {
      await this.publishAppRuntimeUpsert(appInfo, 'app-resolution-retry-upsert')
    } catch (error) {
      logApp('Failed to publish recovered app resolution', LogStyle.warning, {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private moveAppResolutionToDeadLetter(
    appPath: string,
    error: unknown,
    managedEntry: boolean,
    attempts: number,
    cause: 'retries-exhausted' | 'retry-slots-full'
  ): void {
    const existing = this.appResolutionRetries.get(appPath)
    if (existing?.timer) clearTimeout(existing.timer)
    this.appResolutionRetries.delete(appPath)

    const message = error instanceof Error ? error.message : String(error)
    const report = operationalErrorService.report({
      domain: 'app-index',
      operation: 'resolve-path',
      error: error instanceof Error ? error : new Error(message),
      code: 'APP_INDEX_RESOLVE_RETRIES_EXHAUSTED',
      userImpact: 'degraded',
      context: { attempts, cause }
    })

    if (
      !this.appResolutionDeadLetters.has(appPath) &&
      this.appResolutionDeadLetters.size >= APP_RESOLUTION_DEAD_LETTER_MAX_ENTRIES
    ) {
      const oldest = this.appResolutionDeadLetters.keys().next()
      if (!oldest.done) this.appResolutionDeadLetters.delete(oldest.value)
    }
    this.appResolutionDeadLetters.set(appPath, { managedEntry, sweeps: 0, lastError: message })

    logApp(
      cause === 'retries-exhausted'
        ? `App resolution exhausted ${attempts} retries, parked for sweep: ${chalk.yellow(appPath)}`
        : `App resolution retry slots are full, parked for sweep without retrying: ${chalk.yellow(
            appPath
          )}`,
      LogStyle.error,
      { reportId: report.id, deadLetters: this.appResolutionDeadLetters.size }
    )
    this.ensureAppResolutionSweep()
  }

  /** The sweep exists only while something is parked, so an idle app index holds no timer. */
  private ensureAppResolutionSweep(): void {
    if (this.appResolutionSweepTimer || this.shuttingDown) return
    if (this.appResolutionDeadLetters.size === 0) return

    const timer = setInterval(() => {
      void this.sweepAppResolutionDeadLetters()
    }, APP_RESOLUTION_DEAD_LETTER_SWEEP_INTERVAL_MS)
    timer.unref?.()
    this.appResolutionSweepTimer = timer
  }

  private stopAppResolutionSweep(): void {
    if (!this.appResolutionSweepTimer) return
    clearInterval(this.appResolutionSweepTimer)
    this.appResolutionSweepTimer = null
  }

  private async sweepAppResolutionDeadLetters(): Promise<void> {
    if (this.shuttingDown) {
      this.stopAppResolutionSweep()
      return
    }

    for (const [appPath, entry] of [...this.appResolutionDeadLetters]) {
      // A later watch event can put a parked path back on the ladder. The ladder then owns it: it
      // ends either by resolving the path (which clears both maps) or by parking it here again,
      // whereas a sweep running in parallel would only race it and leave a retry entry that
      // nothing re-arms.
      if (this.appResolutionRetries.has(appPath)) continue

      if (entry.sweeps >= APP_RESOLUTION_DEAD_LETTER_MAX_SWEEPS) {
        this.appResolutionDeadLetters.delete(appPath)
        logApp(
          `Dropping app path that stayed unresolvable across ${entry.sweeps} sweeps: ${chalk.yellow(
            appPath
          )}`,
          LogStyle.warning,
          { lastError: entry.lastError }
        )
        continue
      }

      entry.sweeps += 1
      // The sweep is the ladder's continuation, not a new failure, so it must not re-enter the
      // backoff schedule — the sweep count is what bounds it from here.
      const result = await this.processAppPath(appPath, {
        managedEntry: entry.managedEntry,
        scheduleRetry: false
      })
      if (result.success && result.appInfo) {
        logApp(`App resolution recovered on sweep: ${chalk.green(appPath)}`, LogStyle.success)
        await this.publishRecoveredAppResolution(result.appInfo)
      }
    }

    if (this.appResolutionDeadLetters.size === 0) this.stopAppResolutionSweep()
  }

  /** Called whenever a path reaches a terminal state (resolved, not an app, or removed). */
  private forgetAppResolutionFailure(appPath: string): void {
    const retry = this.appResolutionRetries.get(appPath)
    if (retry) {
      if (retry.timer) clearTimeout(retry.timer)
      this.appResolutionRetries.delete(appPath)
    }
    if (this.appResolutionDeadLetters.delete(appPath)) {
      if (this.appResolutionDeadLetters.size === 0) this.stopAppResolutionSweep()
    }
  }

  private clearAppResolutionTimers(): void {
    for (const entry of this.appResolutionRetries.values()) {
      if (entry.timer) clearTimeout(entry.timer)
      entry.timer = null
    }
    this.appResolutionRetries.clear()
    this.stopAppResolutionSweep()
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
    // A removed bundle will never resolve, so retiring its pending retries here is what keeps a
    // deleted app from holding a timer (and eventually a dead-letter slot) for nothing.
    this.forgetAppResolutionFailure(appPath)
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
    const normalizedQuery = rawText.normalize('NFC').toLowerCase()
    const baseTerms = normalizedQuery.split(/[\s/]+/).filter(Boolean)
    const terms = baseTerms.length > 0 ? baseTerms : [normalizedQuery]
    // Keywords are stored in cleaned form (and, for accented text, in a folded
    // twin), so every term is looked up as typed, cleaned and folded. The whole
    // cleaned query is looked up as a single keyword too, which is what reaches
    // spaced aliases like "vs code" and full titles.
    const cleanedQuery = normalizeSearchText(rawText)

    let preciseMatchedItemIds: Set<string> | null = null
    const shouldCheckPhrase = baseTerms.length > 1 || baseTerms.length === 0
    const preciseLookupTerms = buildSearchKeywordLookupTerms([
      ...terms,
      normalizedQuery,
      cleanedQuery
    ])
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
        ? this.searchIndex.lookupByKeywordPrefix(this.id, cleanedQuery || normalizedQuery, 200)
        : Promise.resolve([]),
      ftsQuery ? this.searchIndex.search(this.id, ftsQuery, 150) : Promise.resolve([])
    ])

    if (signal?.aborted) {
      return new TuffSearchResultBuilder(query).build()
    }

    const termMatches = terms.map((term) => collectSearchKeywordMatches(preciseResultMap, term))
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
      const phraseSet = collectSearchKeywordMatches(preciseResultMap, normalizedQuery)

      if (phraseSet.size > 0) {
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

  /**
   * Build the FTS query string. Terms are cleaned with the shared charset rules
   * (non-Latin scripts survive instead of being deleted); the tokens are quoted
   * when SearchIndexService turns this string into an FTS5 MATCH expression.
   */
  private buildFtsQuery(terms: string[]): string {
    const tokens: string[] = []
    for (const term of terms) {
      const cleaned = normalizeSearchText(term)
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

  private async _waitForItemStable(
    itemPath: string,
    delay = APP_STABILITY_PROBE_INTERVAL_MS,
    retries = 5
  ): Promise<boolean> {
    logApp(`Waiting for item to stabilize: ${chalk.cyan(itemPath)}`, LogStyle.info)

    for (let i = 0; i < retries; i++) {
      try {
        const size1 = (await fs.stat(itemPath)).size
        await new Promise((resolve) => setTimeout(resolve, delay))
        const size2 = (await fs.stat(itemPath)).size

        if (size1 === size2) {
          logApp(`Item stabilized: ${chalk.green(itemPath)}`, LogStyle.success)
          await sleep(APP_STABILITY_SETTLE_MS)
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

        if (!isDevelopmentRuntime && now - lastScanTimestamp > PROD_MDLS_SCAN_MIN_INTERVAL_MS) {
          logApp('Over 1 hour since last scan, starting mdls scan', LogStyle.info)
          await this._runScheduledMdlsReconcile()
        } else if (
          isDevelopmentRuntime &&
          // Gating on "never scanned" instead of an interval made this poll a one-shot: after the
          // first scan it took the else branch forever, leaving the 24h full sync as dev's only
          // way to notice an app the watch chain missed.
          now - lastScanTimestamp > STARTUP_MDLS_SCAN_MIN_INTERVAL_DEV_MS
        ) {
          logApp('Over 6 hours since last scan in dev mode, starting mdls scan', LogStyle.info)
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
      await scheduleDbWrite(`app-provider.config.${key}`, () =>
        db.insert(configSchema).values({ key, value }).onConflictDoUpdate({
          target: configSchema.key,
          set: { value }
        })
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
    this.volatileLastBackfillTime = timestamp
    await this._setConfigTimestamp(BACKFILL_LAST_RUN_CONFIG_KEY, timestamp)
  }

  private async _getLastBackfillTime(): Promise<number | null> {
    const persisted = await this._getConfigTimestamp(BACKFILL_LAST_RUN_CONFIG_KEY)
    if (persisted && this.volatileLastBackfillTime) {
      return Math.max(persisted, this.volatileLastBackfillTime)
    }
    return persisted ?? this.volatileLastBackfillTime
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

    const updatedKeys = new Set(updatedApps.map((app) => this.resolveScannedAppKey(app)))
    const metadataOnlyApps =
      appsNeedingMdls.length > 0 && updatedApps.length < appsNeedingMdls.length
        ? appsNeedingMdls.filter((app) => {
            if (!app.displayName) return false
            return !updatedKeys.has(this.resolveScannedAppKey(app))
          })
        : []
    const mdlsUpdates = [...updatedApps, ...metadataOnlyApps].flatMap((app) => {
      const dbApp = dbAppsByUniqueId.get(this.resolveScannedAppKey(app))
      if (!dbApp) return []
      return [
        {
          fileId: dbApp.id,
          app,
          existingDisplayName: dbApp.displayName,
          existingDisplayNameQuality: normalizeAppDisplayNameQuality(
            dbApp.extensions[APP_DISPLAY_NAME_QUALITY_EXTENSION_KEY]
          ),
          existingExtensions: dbApp.extensions,
          existingName: dbApp.name
        }
      ]
    })
    if (mdlsUpdates.length > 0) {
      await this.persistScannedAppMetadataUpdates('app-provider.mdls-update', mdlsUpdates)
    }
    const t4 = performance.now()

    if (deletedApps.length > 0) {
      const deletedDbApps = deletedApps.flatMap((app) => {
        const dbApp = dbAppsByUniqueId.get(this.resolveScannedAppKey(app))
        return dbApp ? [dbApp] : []
      })
      const deletedIds = deletedDbApps.map((app) => app.id)
      if (deletedIds.length > 0) {
        logApp(
          `Deleting ${chalk.yellow(deletedIds.length)} missing apps from database`,
          LogStyle.process
        )
        await this.runDbMutation('app-provider.mdls-delete', async () => {
          if (typeof db.batch === 'function') {
            await this.executeAppBatch(db, [
              db.delete(fileExtensions).where(inArray(fileExtensions.fileId, deletedIds)),
              db.delete(filesSchema).where(inArray(filesSchema.id, deletedIds))
            ])
            return
          }
          await this.runAppTransaction(db, async (tx) => {
            await tx.delete(fileExtensions).where(inArray(fileExtensions.fileId, deletedIds))
            await tx.delete(filesSchema).where(inArray(filesSchema.id, deletedIds))
          })
        })
        logApp(`Deleted ${chalk.green(deletedIds.length)} missing apps`, LogStyle.success)
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
