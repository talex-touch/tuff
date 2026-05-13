import type { AppSetting, MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type {
  ClipboardActionResult,
  ClipboardApplyRequest,
  ClipboardCaptureSource,
  ClipboardChangePayload,
  ClipboardCopyAndPasteRequest,
  ClipboardDeleteRequest,
  ClipboardGetImageUrlRequest,
  ClipboardGetImageUrlResponse,
  ClipboardItem,
  ClipboardMetaQueryRequest,
  ClipboardQueryRequest,
  ClipboardReadImageRequest,
  ClipboardReadImageResponse,
  ClipboardReadResponse,
  ClipboardSetFavoriteRequest,
  ClipboardWriteRequest
} from '@talex-touch/utils/transport/events/types'
import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { NativeImage } from 'electron'
import type * as schema from '../db/schema'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { CAPABILITY_AUTH_MIN_VERSION } from '@talex-touch/utils/plugin'
import { TuffInputType } from '@talex-touch/utils/transport/events/types'
import { clipboard, powerMonitor } from 'electron'
import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import { dbWriteScheduler } from '../db/db-write-scheduler'
import { isStartupDegradeActive } from '../db/startup-degrade'
import { clipboardHistory } from '../db/schema'
import { appTaskGate } from '../service/app-task-gate'
import { normalizeRenderableSource } from '../utils/local-renderable-assets'
import { createLogger, type LogOptions } from '../utils/logger'
import { perfMonitor } from '../utils/perf-monitor'
import { BaseModule } from './abstract-base-module'
import { databaseModule } from './database'
import { ocrService } from './ocr/ocr-service'
import { getPermissionModule } from './permission'
import { pluginModule } from './plugin/plugin-module'
import { getMainConfig, isMainStorageReady, subscribeMainConfig } from './storage'
import { activeAppService } from './system/active-app'
import {
  createIneligibleClipboardFreshnessState,
  type ClipboardFreshnessState
} from './clipboard/clipboard-freshness'
import { ClipboardFreshnessStore, ClipboardHelper } from './clipboard/clipboard-capture-freshness'
import { ClipboardCapturePipeline } from './clipboard/clipboard-capture-pipeline'
import {
  normalizeClipboardWritePayload,
  type ClipboardHistoryQueryInput
} from './clipboard/clipboard-request-normalizer'
import {
  ClipboardTransportHandlersRegistry,
  type ClipboardWritePayload
} from './clipboard/clipboard-transport-handlers'
import {
  ClipboardHistoryPersistence,
  mergeClipboardMetadataString,
  type IClipboardItem
} from './clipboard/clipboard-history-persistence'
import { ClipboardImagePersistence } from './clipboard/clipboard-image-persistence'
import { ClipboardAutopasteAutomation } from './clipboard/clipboard-autopaste-automation'
import { ClipboardNativeWatcher } from './clipboard/clipboard-native-watcher'
import {
  ClipboardMetaPersistence,
  type ClipboardMetaEntry
} from './clipboard/clipboard-meta-persistence'
import {
  resolveClipboardPollingSettings,
  resolveClipboardTargetPollingIntervalMs,
  type ClipboardPollingSettings
} from './clipboard/clipboard-polling-policy'
import {
  ClipboardStageBEnrichment,
  type ClipboardStageBJob
} from './clipboard/clipboard-stage-b-enrichment'

export type { IClipboardItem } from './clipboard/clipboard-history-persistence'

const clipboardLog = createLogger('Clipboard')
const CLIPBOARD_POLL_TASK_ID = 'clipboard.monitor'
const CLIPBOARD_ACTIVE_APP_REFRESH_TASK_ID = 'clipboard.active-app.refresh'
const CLIPBOARD_ACTIVE_APP_REFRESH_INTERVAL_MS = 1500
const CLIPBOARD_DEFAULT_POLL_INTERVAL_MS = 3000
const CLIPBOARD_LAG_ADAPT_WINDOW_MS = 8000
const CLIPBOARD_LAG_ADAPT_ERROR_MS = 1000
const CLIPBOARD_LAG_SKIP_LOG_THROTTLE_MS = 5000
const pollingService = PollingService.getInstance()

interface ClipboardMonitorOptions {
  bypassCooldown?: boolean
  source?: ClipboardCaptureSource
}

interface ClipboardCheckOptions {
  bypassCooldown?: boolean
  source: ClipboardCaptureSource
}

function isOnBatteryPowerSafe(): boolean {
  try {
    if (typeof powerMonitor.isOnBatteryPower === 'function') {
      return powerMonitor.isOnBatteryPower()
    }
    const monitor = powerMonitor as { onBatteryPower?: boolean }
    return monitor.onBatteryPower ?? false
  } catch {
    return false
  }
}

const CLIPBOARD_META_QUEUE_LIMIT = 6
const CLIPBOARD_META_LOG_THROTTLE_MS = 5_000
const CLIPBOARD_STAGE_B_LOG_THROTTLE_MS = 5_000

export class ClipboardModule extends BaseModule {
  private transport: ITuffTransportMain | null = null
  private readonly transportHandlers = new ClipboardTransportHandlersRegistry()
  private clipboardFreshness = new ClipboardFreshnessStore()
  private readonly autopasteAutomation = new ClipboardAutopasteAutomation({
    hasDatabase: () => Boolean(this.db),
    getItemById: async (id) => await this.getItemById(id),
    rememberFreshness: (item) => {
      this.rememberClipboardFreshness(
        item,
        createIneligibleClipboardFreshnessState('history-apply')
      )
    },
    primeImage: (image) => {
      this.clipboardHelper?.primeImage(image)
    },
    primeFiles: (files) => {
      this.clipboardHelper?.primeFiles(files)
    },
    markText: (text) => {
      this.clipboardHelper?.markText(text)
    },
    logWarn: (message, data?: LogOptions) => {
      clipboardLog.warn(message, data)
    },
    logError: (message, data?: LogOptions) => {
      clipboardLog.error(message, data)
    },
    logDebug: (message, data?: LogOptions) => {
      clipboardLog.debug(message, data)
    }
  })
  private readonly imagePersistence = new ClipboardImagePersistence({
    getDatabase: () => this.db,
    logInfo: (message, data?: LogOptions) => {
      clipboardLog.info(message, data)
    },
    logWarn: (message, data?: LogOptions) => {
      clipboardLog.warn(message, data)
    }
  })
  private readonly nativeWatcher = new ClipboardNativeWatcher({
    isDestroyed: () => this.isDestroyed,
    scheduleMonitor: (options) => {
      void this.runClipboardMonitor(options)
    },
    logInfo: (message, data?: LogOptions) => {
      clipboardLog.info(message, data)
    },
    logWarn: (message, data?: LogOptions) => {
      clipboardLog.warn(message, data)
    },
    logDebug: (message, data?: LogOptions) => {
      clipboardLog.debug(message, data)
    }
  })
  private readonly metaPersistence = new ClipboardMetaPersistence({
    getDatabase: () => this.db,
    isDestroyed: () => this.isDestroyed,
    logDebug: (message, data?: LogOptions) => {
      clipboardLog.debug(message, data)
    },
    logWarn: (message, data?: LogOptions) => {
      clipboardLog.warn(message, data)
    }
  })
  private historyPersistence = new ClipboardHistoryPersistence({
    onForgetFreshness: (id) => {
      this.clipboardFreshness.delete(id)
    },
    onChange: () => {
      this.notifyTransportChange()
    },
    deleteImageFile: (filePath) => {
      void this.imagePersistence.deleteImageFile(filePath)
    },
    isWithinTempBaseDir: (filePath) => this.imagePersistence.isWithinTempBaseDir(filePath),
    normalizeRenderableSource: (source) => {
      return normalizeRenderableSource(source)
    }
  })
  private readonly stageBEnrichment = new ClipboardStageBEnrichment({
    getDatabase: () => this.db,
    getCachedItemById: (clipboardId) => this.historyPersistence.getCachedItemById(clipboardId),
    getActiveAppSnapshot: () => this.getActiveAppSnapshot(),
    getLatestGeneration: () => this.clipboardStageBGeneration,
    enqueueOcr: async (job) => {
      await ocrService.enqueueFromClipboard(job)
    },
    patchCachedMeta: (clipboardId, patch) => {
      this.handleMetaPatch(clipboardId, patch)
    },
    updateCachedSource: (clipboardId, sourceApp) => {
      this.historyPersistence.updateCachedSource(clipboardId, sourceApp)
    },
    metaPersistence: this.metaPersistence,
    logWarn: (message, data?: LogOptions) => {
      clipboardLog.warn(message, data)
    },
    logDebug: (message, data?: LogOptions) => {
      clipboardLog.debug(message, data)
    }
  })
  private readonly capturePipeline = new ClipboardCapturePipeline({
    getDatabase: () => this.db,
    getClipboardHelper: () => this.clipboardHelper,
    getLastSuccessfulScanAt: () => this.lastSuccessfulClipboardScanAt,
    getLastImagePersistAt: () => this.lastImagePersistAt,
    getTransport: () => this.transport,
    imagePersistence: this.imagePersistence,
    metaPersistence: this.metaPersistence,
    rememberFreshness: (item, freshness) => {
      this.rememberClipboardFreshness(item, freshness)
    },
    updateMemoryCache: (item) => {
      this.updateMemoryCache(item)
    },
    notifyTransportChange: () => {
      this.notifyTransportChange()
    },
    enqueueStageB: (job) => {
      this.enqueueClipboardStageB(job)
    },
    shouldLogMetaQueuePressure: (now) => this.shouldLogMetaQueuePressure(now),
    setLastSuccessfulScanAt: (value) => {
      this.lastSuccessfulClipboardScanAt = value
    },
    setLastImagePersistAt: (value) => {
      this.lastImagePersistAt = value
    },
    setCooldownUntil: (value) => {
      this.clipboardCheckCooldownUntil = value
    },
    setTaskMeta: (meta) => {
      pollingService.setTaskMeta(CLIPBOARD_POLL_TASK_ID, meta)
    },
    logInfo: (message, data?: LogOptions) => {
      clipboardLog.info(message, data)
    },
    logWarn: (message, data?: LogOptions) => {
      clipboardLog.warn(message, data)
    }
  })

  private isDestroyed = false
  private clipboardHelper?: ClipboardHelper
  private db?: LibSQLDatabase<typeof schema>
  private monitoringStarted = false
  private clipboardCheckCooldownUntil = 0
  private clipboardCheckInFlight = false
  private clipboardCheckPending = false
  private clipboardStageBJob: ClipboardStageBJob | null = null
  private clipboardStageBInFlight = false
  private clipboardStageBGeneration = 0
  private activeAppRefreshInFlight = false
  private lastStageBLogAt = 0
  private lastMetaQueuePressureLogAt = 0
  private coreBoxVisible = false
  private currentPollIntervalMs = CLIPBOARD_DEFAULT_POLL_INTERVAL_MS
  private lastSuccessfulClipboardScanAt: number | null = null
  private appSettingSnapshot: AppSetting | null = null
  private unsubscribeAppSetting: (() => void) | null = null
  private pollingSubscriptionsSetup = false
  private powerListenersSetup = false
  private lastImagePersistAt = 0
  private lastLagSkipLogAt = 0
  private readonly handlePowerStateChanged = (): void => {
    if (this.coreBoxVisible) return
    this.updateClipboardPolling()
  }

  private readonly handleAppSettingChange = (value: AppSetting): void => {
    this.appSettingSnapshot = value
    this.updateClipboardPolling()
  }

  private readonly handleCoreBoxShown = (): void => {
    this.coreBoxVisible = true
    this.updateClipboardPolling()
    setImmediate(() => {
      void this.runClipboardMonitor({ source: 'corebox-show-baseline' })
    })
  }

  private readonly handleCoreBoxHidden = (): void => {
    this.coreBoxVisible = false
    this.updateClipboardPolling()
  }

  private readonly handleAllModulesLoaded = (): void => {
    this.ensureAppSettingSubscription()
    this.updateClipboardPolling()
  }

  private activeAppCache: {
    value: Awaited<ReturnType<typeof activeAppService.getActiveApp>> | null
    fetchedAt: number
  } | null = null
  private transportChannel: unknown = null

  private readonly activeAppCacheTtlMs = 5000

  static key: symbol = Symbol.for('Clipboard')
  name: ModuleKey = ClipboardModule.key

  constructor() {
    super(ClipboardModule.key, {
      create: true,
      dirName: 'clipboard'
    })
  }

  private resolvePollingSettings(): ClipboardPollingSettings {
    const appSetting = this.appSettingSnapshot
    const raw = appSetting?.tools?.clipboardPolling
    return resolveClipboardPollingSettings(raw)
  }

  private isLowBatteryState(): boolean {
    return isOnBatteryPowerSafe()
  }

  private resolveTargetPollingIntervalMs(): number {
    return resolveClipboardTargetPollingIntervalMs({
      settings: this.resolvePollingSettings(),
      coreBoxVisible: this.coreBoxVisible,
      onBattery: this.isLowBatteryState(),
      startupDegradeActive: isStartupDegradeActive(),
      queueStats: dbWriteScheduler.getStats(),
      lagSnapshot: perfMonitor.getRecentEventLoopLagSnapshot()
    })
  }

  private restartClipboardPolling(intervalMs: number): void {
    if (this.isDestroyed) return
    if (!this.clipboardHelper) return

    if (pollingService.isRegistered(CLIPBOARD_POLL_TASK_ID)) {
      pollingService.unregister(CLIPBOARD_POLL_TASK_ID)
    }

    this.currentPollIntervalMs = intervalMs

    if (intervalMs < 0) {
      return
    }

    const initialDelayMs = this.coreBoxVisible ? 500 : 1000
    pollingService.register(
      CLIPBOARD_POLL_TASK_ID,
      () => {
        setImmediate(() => {
          void this.runClipboardMonitor({
            source: this.coreBoxVisible ? 'visible-poll' : 'background-poll'
          })
        })
      },
      {
        interval: intervalMs,
        unit: 'milliseconds',
        initialDelayMs,
        lane: 'realtime',
        backpressure: 'latest_wins',
        dedupeKey: CLIPBOARD_POLL_TASK_ID,
        maxInFlight: 1,
        timeoutMs: 5000,
        jitterMs: 50
      }
    )
    pollingService.start()
  }

  private updateClipboardPolling(force = false): void {
    const targetIntervalMs = this.resolveTargetPollingIntervalMs()
    if (!force && this.currentPollIntervalMs === targetIntervalMs) {
      return
    }
    this.restartClipboardPolling(targetIntervalMs)
  }

  private async startNativeClipboardWatcher(): Promise<void> {
    await this.nativeWatcher.start()
  }

  private stopNativeClipboardWatcher(): void {
    this.nativeWatcher.stop()
  }

  private ensureAppSettingSubscription(): void {
    if (this.unsubscribeAppSetting) return
    if (!isMainStorageReady()) return

    this.appSettingSnapshot = getMainConfig(StorageList.APP_SETTING)
    this.unsubscribeAppSetting = subscribeMainConfig(StorageList.APP_SETTING, (value) => {
      this.handleAppSettingChange(value as AppSetting)
    })
  }

  private setupPollingSubscriptions(): void {
    if (this.pollingSubscriptionsSetup) return
    this.pollingSubscriptionsSetup = true

    this.ensureAppSettingSubscription()

    touchEventBus.on(TalexEvents.COREBOX_WINDOW_SHOWN, this.handleCoreBoxShown)
    touchEventBus.on(TalexEvents.COREBOX_WINDOW_HIDDEN, this.handleCoreBoxHidden)
    touchEventBus.on(TalexEvents.ALL_MODULES_LOADED, this.handleAllModulesLoaded)
  }

  private setupPowerListeners(): void {
    if (this.powerListenersSetup) return
    this.powerListenersSetup = true

    powerMonitor.on('on-ac', this.handlePowerStateChanged)
    powerMonitor.on('on-battery', this.handlePowerStateChanged)
  }

  private async ensureInitialCacheLoaded(): Promise<void> {
    await this.historyPersistence.ensureInitialCacheLoaded()
  }

  private updateMemoryCache(item: IClipboardItem) {
    this.historyPersistence.updateMemoryCache(item)
  }

  public getLatestItem(): IClipboardItem | undefined {
    return this.historyPersistence.getLatestItem()
  }

  private rememberClipboardFreshness(
    item: IClipboardItem,
    freshness: ClipboardFreshnessState
  ): void {
    if (typeof item.id !== 'number') return
    this.clipboardFreshness.remember(item, freshness)
  }

  private resolveClipboardFreshness(item: IClipboardItem): ClipboardFreshnessState {
    return this.clipboardFreshness.resolve(item)
  }

  public async getItemById(id: number): Promise<IClipboardItem | null> {
    return await this.historyPersistence.getItemById(id)
  }

  public async queryHistoryByMeta(
    request: ClipboardMetaQueryRequest = {}
  ): Promise<IClipboardItem[]> {
    return await this.historyPersistence.queryHistoryByMeta(request)
  }

  public getCacheStats(): { memoryItems: number; activeAppCached: boolean } {
    return {
      memoryItems: this.historyPersistence.getMemoryItemsCount(),
      activeAppCached: Boolean(this.activeAppCache?.value)
    }
  }

  private extractTags(item: IClipboardItem): string[] | undefined {
    return this.historyPersistence.extractTags(item)
  }

  public async cleanupHistory(options?: {
    beforeDays?: number
    type?: 'all' | 'text' | 'image' | 'files'
  }): Promise<{ removedCount: number }> {
    return await this.historyPersistence.cleanupHistory(options)
  }

  private toTransportItem(item: IClipboardItem): ClipboardItem | null {
    if (!item || typeof item.id !== 'number') return null

    const clientItem = item.type === 'image' ? (this.toClientItem(item) ?? item) : item
    const freshness = this.resolveClipboardFreshness(item)

    const createdAt = item.timestamp
      ? item.timestamp instanceof Date
        ? item.timestamp.getTime()
        : new Date(item.timestamp).getTime()
      : Date.now()

    const type: TuffInputType =
      item.type === 'image'
        ? TuffInputType.Image
        : item.type === 'files'
          ? TuffInputType.Files
          : TuffInputType.Text

    const value = item.type === 'image' ? (clientItem.content ?? '') : (item.content ?? '')
    const tags = this.extractTags(item)
    const meta: Record<string, unknown> = {}
    if (clientItem.meta && typeof clientItem.meta === 'object') {
      for (const key of [
        'image_original_url',
        'image_preview_url',
        'image_content_kind',
        'image_size',
        'image_file_size'
      ]) {
        const value = (clientItem.meta as Record<string, unknown>)[key]
        if (value !== undefined && value !== null) {
          meta[key] = value
        }
      }
    }

    return {
      id: item.id,
      type,
      value,
      thumbnail: item.thumbnail ?? undefined,
      html: item.type === 'text' ? (item.rawContent ?? undefined) : undefined,
      source: item.sourceApp ?? undefined,
      createdAt,
      captureSource: freshness.captureSource,
      observedAt: freshness.observedAt,
      freshnessBaseAt: freshness.freshnessBaseAt,
      autoPasteEligible: freshness.eligible,
      isFavorite: item.isFavorite ?? undefined,
      tags,
      meta: Object.keys(meta).length > 0 ? meta : undefined
    }
  }

  private toClientItem(item: IClipboardItem | null): IClipboardItem | null {
    return this.historyPersistence.toClientItem(item)
  }

  private async queryClipboardHistory(
    request: ClipboardQueryRequest | ClipboardHistoryQueryInput | null | undefined
  ): Promise<{
    rows: IClipboardItem[]
    total: number
    page: number
    limit: number
  }> {
    return await this.historyPersistence.queryClipboardHistory(request)
  }

  private readClipboardSnapshot(): ClipboardReadResponse {
    const formats = clipboard.availableFormats()
    const text = clipboard.readText()
    const html = clipboard.readHTML()
    const image = clipboard.readImage()
    const hasImage = !image.isEmpty()
    const files = this.clipboardHelper?.readClipboardFiles() ?? []
    const hasFiles = files.length > 0
    return { text, html, hasImage, hasFiles, formats }
  }

  private async readClipboardImage(
    request: ClipboardReadImageRequest
  ): Promise<ClipboardReadImageResponse | null> {
    return await this.imagePersistence.readClipboardImage(request)
  }

  private buildTransportChangePayload(): ClipboardChangePayload {
    const history = this.historyPersistence
      .getCachedItems()
      .map((item) => this.toTransportItem(item))
      .filter((item): item is ClipboardItem => !!item)
    const latest = history.length > 0 ? history[0] : null
    return { latest, history }
  }

  private notifyTransportChange(): void {
    this.transportHandlers.notifyChange()
  }

  private createNativeImageFromSource(source: string): NativeImage {
    return this.imagePersistence.createNativeImageFromSource(source)
  }

  private startTempCleanupTasks(): void {
    this.imagePersistence.startTempCleanupTasks()
  }

  private getActiveAppSnapshot(): Awaited<ReturnType<typeof activeAppService.getActiveApp>> | null {
    const now = Date.now()
    if (this.activeAppCache && now - this.activeAppCache.fetchedAt < this.activeAppCacheTtlMs) {
      return this.activeAppCache.value
    }
    this.scheduleActiveAppRefresh()
    return this.activeAppCache?.value ?? null
  }

  private scheduleActiveAppRefresh(): void {
    if (this.activeAppRefreshInFlight || this.isDestroyed) return
    this.activeAppRefreshInFlight = true
    setImmediate(() => {
      void this.refreshActiveAppSnapshot().finally(() => {
        this.activeAppRefreshInFlight = false
      })
    })
  }

  private async refreshActiveAppSnapshot(): Promise<void> {
    if (this.isDestroyed) return
    const now = Date.now()
    try {
      const activeApp = await activeAppService.getActiveApp({
        includeIcon: false
      })
      this.activeAppCache = { value: activeApp, fetchedAt: now }
    } catch (error) {
      clipboardLog.debug('Failed to refresh active app info', { error })
      this.activeAppCache = { value: null, fetchedAt: now }
    }
  }

  private handleMetaPatch = (clipboardId: number, patch: Record<string, unknown>): void => {
    this.historyPersistence.patchCachedMeta(clipboardId, patch)
  }

  private shouldLogStageB(now: number): boolean {
    if (now - this.lastStageBLogAt < CLIPBOARD_STAGE_B_LOG_THROTTLE_MS) return false
    this.lastStageBLogAt = now
    return true
  }

  private enqueueClipboardStageB(job: Omit<ClipboardStageBJob, 'generation'>): void {
    this.clipboardStageBGeneration += 1
    this.clipboardStageBJob = {
      ...job,
      generation: this.clipboardStageBGeneration
    }

    if (this.clipboardStageBInFlight) {
      const now = Date.now()
      if (this.shouldLogStageB(now)) {
        clipboardLog.debug('Clipboard stage-b coalesced by latest generation', {
          meta: { generation: this.clipboardStageBGeneration, clipboardId: job.clipboardId }
        })
      }
      return
    }

    setImmediate(() => {
      void this.runClipboardStageBLoop()
    })
  }

  private async runClipboardStageBLoop(): Promise<void> {
    if (this.clipboardStageBInFlight) return
    this.clipboardStageBInFlight = true
    try {
      while (this.clipboardStageBJob && !this.isDestroyed) {
        const job = this.clipboardStageBJob
        this.clipboardStageBJob = null
        await this.processClipboardStageBJob(job)
      }
    } finally {
      this.clipboardStageBInFlight = false
    }
  }

  private async processClipboardStageBJob(job: ClipboardStageBJob): Promise<void> {
    await this.stageBEnrichment.process(job)
  }

  private shouldLogMetaQueuePressure(now: number): boolean {
    if (now - this.lastMetaQueuePressureLogAt < CLIPBOARD_META_LOG_THROTTLE_MS) return false
    this.lastMetaQueuePressureLogAt = now
    return true
  }

  /**
   * Save custom (non-clipboard) entry to clipboard history
   * Used by AI chat, preview, and other features
   * @param category - Entry category: 'ai-chat' | 'preview' | 'custom'
   */
  public async saveCustomEntry({
    content,
    rawContent,
    category = 'custom',
    meta
  }: {
    content: string
    rawContent?: string | null
    category?: 'ai-chat' | 'preview' | 'custom'
    meta?: Record<string, unknown>
  }): Promise<IClipboardItem | null> {
    if (!this.db) return null

    const metaEntries: ClipboardMetaEntry[] = [
      { key: 'source', value: 'custom' },
      { key: 'category', value: category }
    ]
    if (meta) {
      for (const [key, value] of Object.entries(meta)) {
        metaEntries.push({ key, value })
      }
    }

    const mergedMeta: Record<string, unknown> = {}
    for (const entry of metaEntries) {
      mergedMeta[entry.key] = entry.value
    }

    const metadata = mergeClipboardMetadataString(null, mergedMeta)
    const record = {
      type: 'text' as const,
      content,
      rawContent: rawContent ?? null,
      thumbnail: null,
      timestamp: new Date(),
      sourceApp: 'Talex Touch',
      isFavorite: false,
      metadata
    }

    const inserted = await this.metaPersistence.withDbWrite('clipboard.custom.persist', () =>
      this.db!.insert(clipboardHistory).values(record).returning()
    )
    if (inserted.length === 0) {
      return null
    }

    const persisted = inserted[0] as IClipboardItem
    persisted.meta = mergedMeta
    this.rememberClipboardFreshness(
      persisted,
      createIneligibleClipboardFreshnessState('manual-write')
    )

    if (persisted.id) {
      const queueStats = dbWriteScheduler.getStats()
      if (queueStats.queued >= CLIPBOARD_META_QUEUE_LIMIT) {
        const now = Date.now()
        if (this.shouldLogMetaQueuePressure(now)) {
          clipboardLog.warn('Clipboard meta skipped (queue pressure)', {
            meta: { queued: queueStats.queued }
          })
        }
      } else {
        this.metaPersistence.persistMetaEntriesSafely(persisted.id, mergedMeta, undefined, {
          dropPolicy: 'drop',
          maxQueueWaitMs: 10_000
        })
      }
    }

    this.updateMemoryCache(persisted)
    this.notifyTransportChange()

    return persisted
  }

  private startClipboardMonitoring(): void {
    if (!this.clipboardHelper) {
      return
    }
    if (!this.monitoringStarted) {
      this.clipboardHelper.bootstrap()
      this.monitoringStarted = true
    }

    this.updateClipboardPolling(true)
    this.ensureActiveAppRefreshTask()
    this.scheduleActiveAppRefresh()
    void this.startNativeClipboardWatcher()
  }

  private ensureActiveAppRefreshTask(): void {
    if (pollingService.isRegistered(CLIPBOARD_ACTIVE_APP_REFRESH_TASK_ID)) {
      return
    }

    pollingService.register(
      CLIPBOARD_ACTIVE_APP_REFRESH_TASK_ID,
      () => {
        this.scheduleActiveAppRefresh()
      },
      {
        interval: CLIPBOARD_ACTIVE_APP_REFRESH_INTERVAL_MS,
        unit: 'milliseconds',
        lane: 'realtime',
        backpressure: 'latest_wins',
        dedupeKey: CLIPBOARD_ACTIVE_APP_REFRESH_TASK_ID,
        maxInFlight: 1,
        timeoutMs: 2000,
        jitterMs: 120
      }
    )
    pollingService.start()
  }

  private async runClipboardMonitor(options?: ClipboardMonitorOptions): Promise<void> {
    if (this.clipboardCheckInFlight) {
      this.clipboardCheckPending = true
      return
    }
    this.clipboardCheckInFlight = true
    let bypassCooldown = options?.bypassCooldown ?? false
    const source = options?.source ?? (this.coreBoxVisible ? 'visible-poll' : 'background-poll')
    try {
      do {
        this.clipboardCheckPending = false
        try {
          await this.checkClipboard({ bypassCooldown, source })
        } catch (error) {
          clipboardLog.warn('Clipboard check failed', { error })
        }
        bypassCooldown = bypassCooldown || this.clipboardCheckPending
      } while (this.clipboardCheckPending && !this.isDestroyed)
    } finally {
      this.clipboardCheckInFlight = false
      this.clipboardCheckPending = false
    }
  }

  private async checkClipboard(options: ClipboardCheckOptions): Promise<void> {
    if (this.isDestroyed || !this.clipboardHelper || !this.db) {
      return
    }
    if (appTaskGate.isActive()) {
      return
    }
    const now = Date.now()
    const lagSnapshot = perfMonitor.getRecentEventLoopLagSnapshot()
    if (
      lagSnapshot &&
      lagSnapshot.lagMs >= CLIPBOARD_LAG_ADAPT_ERROR_MS &&
      now - lagSnapshot.at <= CLIPBOARD_LAG_ADAPT_WINDOW_MS
    ) {
      if (now - this.lastLagSkipLogAt >= CLIPBOARD_LAG_SKIP_LOG_THROTTLE_MS) {
        this.lastLagSkipLogAt = now
        clipboardLog.warn('Clipboard check skipped due to recent severe event loop lag', {
          meta: {
            lagMs: lagSnapshot.lagMs,
            lagAgeMs: now - lagSnapshot.at
          }
        })
      }
      return
    }
    if (!options.bypassCooldown && now < this.clipboardCheckCooldownUntil) {
      return
    }
    await this.checkClipboardInternal(options.source)
  }

  private async checkClipboardInternal(source: ClipboardCaptureSource): Promise<void> {
    if (this.isDestroyed || !this.clipboardHelper || !this.db) {
      return
    }

    await this.capturePipeline.process(source)
  }

  private extractPayloadSdkApi(payload: unknown): number | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined
    }
    const sdkapi = (payload as { _sdkapi?: number })._sdkapi
    return typeof sdkapi === 'number' ? sdkapi : undefined
  }

  private resolveSdkApiForPluginCall(pluginId: string, payload: unknown): number | undefined {
    const payloadSdkApi = this.extractPayloadSdkApi(payload)
    const plugin = pluginModule.pluginManager?.getPluginByName(pluginId) as
      | { sdkapi?: number }
      | undefined
    const declaredSdkApi = typeof plugin?.sdkapi === 'number' ? plugin.sdkapi : undefined

    if (
      typeof declaredSdkApi === 'number' &&
      declaredSdkApi >= CAPABILITY_AUTH_MIN_VERSION &&
      typeof payloadSdkApi === 'number' &&
      payloadSdkApi !== declaredSdkApi
    ) {
      const error = new Error(
        `Plugin sdkapi mismatch: payload=${payloadSdkApi}, declared=${declaredSdkApi}`
      ) as Error & { code?: string; pluginId?: string }
      error.code = 'SDKAPI_MISMATCH'
      error.pluginId = pluginId
      throw error
    }

    return declaredSdkApi ?? payloadSdkApi
  }

  private enforceClipboardPermission(
    pluginId: string | undefined,
    permissionId: 'clipboard:read' | 'clipboard:write',
    payload: unknown
  ): void {
    if (!pluginId) {
      return
    }

    const permModule = getPermissionModule()
    if (!permModule) {
      return
    }

    const sdkapi = this.resolveSdkApiForPluginCall(pluginId, payload)
    try {
      permModule.enforcePermission(pluginId, permissionId, sdkapi)
    } catch (error) {
      const permissionError = error as Error & {
        code?: string
        permissionId?: string
        pluginId?: string
        showRequest?: boolean
      }
      if (permissionError.code === 'PERMISSION_DENIED') {
        const wrappedError = new Error(
          `[CLIPBOARD_CAPABILITY_UNAVAILABLE] ${permissionError.message}`
        ) as Error & {
          code?: string
          permissionId?: string
          pluginId?: string
          showRequest?: boolean
        }
        wrappedError.code = 'CLIPBOARD_CAPABILITY_UNAVAILABLE'
        wrappedError.permissionId = permissionId
        wrappedError.pluginId = pluginId
        wrappedError.showRequest = permissionError.showRequest
        throw wrappedError
      }
      throw error
    }
  }

  private async handleSetFavoriteRequest(request: ClipboardSetFavoriteRequest): Promise<void> {
    await this.historyPersistence.setFavorite(request)
  }

  private async handleDeleteRequest(request: ClipboardDeleteRequest): Promise<void> {
    await this.historyPersistence.deleteItem(request)
  }

  private async handleGetImageUrlRequest(
    request: ClipboardGetImageUrlRequest
  ): Promise<ClipboardGetImageUrlResponse> {
    return await this.historyPersistence.getImageUrl(request)
  }

  private async handleApplyRequest(
    request: ClipboardApplyRequest,
    context: HandlerContext
  ): Promise<ClipboardActionResult> {
    return await this.autopasteAutomation.handleApplyRequest(request, context)
  }

  private async handleCopyAndPasteRequest(
    request: ClipboardCopyAndPasteRequest,
    context: HandlerContext
  ): Promise<ClipboardActionResult> {
    return await this.autopasteAutomation.handleCopyAndPasteRequest(request, context)
  }

  private async handleWriteRequest(
    request: ClipboardWriteRequest,
    writePayload: (payload: ClipboardWritePayload) => Promise<void>
  ): Promise<void> {
    const payload = normalizeClipboardWritePayload(request)
    if (!payload) return
    await writePayload(payload)
  }

  private registerTransportHandlers(): void {
    const channel = this.transportChannel
    if (!channel) {
      clipboardLog.warn('Clipboard transport channel unavailable during init')
      return
    }

    const writePayload = async (payload: ClipboardWritePayload): Promise<void> => {
      const { text, html, image, files } = payload ?? {}

      if (image) {
        const img = this.createNativeImageFromSource(image)
        if (!img.isEmpty()) {
          clipboard.writeImage(img)
          this.clipboardHelper?.primeImage(img)
          this.lastSuccessfulClipboardScanAt = Date.now()
        }
        return
      }

      if (files && files.length > 0) {
        const resolvedPaths = files.map((filePath) => {
          try {
            return path.isAbsolute(filePath) ? filePath : path.resolve(filePath)
          } catch {
            return filePath
          }
        })
        const fileUrlContent = resolvedPaths
          .map((filePath) => pathToFileURL(filePath).toString())
          .join('\n')
        const buffer = Buffer.from(fileUrlContent, 'utf8')
        for (const format of ['public.file-url', 'public.file-url-multiple', 'text/uri-list']) {
          clipboard.writeBuffer(format, buffer)
        }
        clipboard.write({ text: resolvedPaths[0] ?? '' })
        this.clipboardHelper?.primeFiles(resolvedPaths)
        this.lastSuccessfulClipboardScanAt = Date.now()
        return
      }

      clipboard.write({ text: text ?? '', html: html ?? undefined })
      this.clipboardHelper?.markText(text ?? '')
      this.lastSuccessfulClipboardScanAt = Date.now()
    }

    this.transport = this.transportHandlers.register(channel, {
      enforcePermission: (pluginName, permission, payload) => {
        this.enforceClipboardPermission(pluginName, permission, payload)
      },
      ensureInitialCacheLoaded: async () => {
        await this.ensureInitialCacheLoaded()
      },
      getLatestItem: () => this.getLatestItem(),
      toTransportItem: (item) => this.toTransportItem(item),
      queryClipboardHistory: async (request) => await this.queryClipboardHistory(request),
      getImageUrl: async (request) => await this.handleGetImageUrlRequest(request),
      queryHistoryByMeta: async (request) => await this.queryHistoryByMeta(request),
      apply: async (request, context) => await this.handleApplyRequest(request, context),
      deleteItem: async (request) => {
        await this.handleDeleteRequest(request)
      },
      setFavorite: async (request) => {
        await this.handleSetFavoriteRequest(request)
      },
      clearHistory: async () => {
        await this.cleanupHistory({ type: 'all' })
      },
      write: async (request) => {
        await this.handleWriteRequest(request, writePayload)
      },
      clearClipboard: () => {
        clipboard.clear()
      },
      copyAndPaste: async (request, context) =>
        await this.handleCopyAndPasteRequest(request, context),
      readClipboard: () => this.readClipboardSnapshot(),
      readImage: async (request) => await this.readClipboardImage(request),
      readFiles: () => this.clipboardHelper?.readClipboardFiles() ?? [],
      buildChangePayload: () => this.buildTransportChangePayload()
    })
  }

  public destroy(): void {
    this.isDestroyed = true
    pollingService.unregister(CLIPBOARD_POLL_TASK_ID)
    pollingService.unregister(CLIPBOARD_ACTIVE_APP_REFRESH_TASK_ID)
    this.stopNativeClipboardWatcher()

    if (this.unsubscribeAppSetting) {
      try {
        this.unsubscribeAppSetting()
      } catch {
        // ignore unsubscribe errors
      }
      this.unsubscribeAppSetting = null
    }

    touchEventBus.off(TalexEvents.COREBOX_WINDOW_SHOWN, this.handleCoreBoxShown)
    touchEventBus.off(TalexEvents.COREBOX_WINDOW_HIDDEN, this.handleCoreBoxHidden)
    touchEventBus.off(TalexEvents.ALL_MODULES_LOADED, this.handleAllModulesLoaded)
    this.pollingSubscriptionsSetup = false

    if (this.powerListenersSetup) {
      powerMonitor.off('on-ac', this.handlePowerStateChanged)
      powerMonitor.off('on-battery', this.handlePowerStateChanged)
      this.powerListenersSetup = false
    }

    this.transportHandlers.dispose()
    this.clipboardFreshness.clear()
    this.transport = null
    this.monitoringStarted = false
    this.activeAppCache = null
    this.appSettingSnapshot = null
    this.clipboardCheckInFlight = false
    this.clipboardCheckPending = false
    this.clipboardStageBJob = null
    this.clipboardStageBInFlight = false
    this.clipboardStageBGeneration = 0
    this.activeAppRefreshInFlight = false
    this.clipboardCheckCooldownUntil = 0
    this.nativeWatcher.reset()
    this.historyPersistence.reset()
    this.lastLagSkipLogAt = 0
    this.lastSuccessfulClipboardScanAt = null
    this.coreBoxVisible = false
    this.currentPollIntervalMs = CLIPBOARD_DEFAULT_POLL_INTERVAL_MS
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    this.db = databaseModule.getAuxDb()
    this.historyPersistence.setDatabase(this.db)
    this.transportChannel =
      ctx.runtime?.channel ?? (ctx.app as { channel?: unknown } | null | undefined)?.channel
    ocrService.setTransportChannel(this.transportChannel)
    this.clipboardHelper = new ClipboardHelper()
    this.setupPollingSubscriptions()
    this.setupPowerListeners()
    this.registerTransportHandlers()
    this.startTempCleanupTasks()
    setImmediate(() => {
      this.startClipboardMonitoring()
    })
    setImmediate(() => {
      appTaskGate
        .waitForIdle()
        .then(() => ocrService.start())
        .catch((error) => clipboardLog.error('Failed to start OCR service', { error }))
    })
    ocrService.registerClipboardMetaListener(this.handleMetaPatch)
  }

  onDestroy(): MaybePromise<void> {
    this?.destroy()
  }
}

const clipboardModule = new ClipboardModule()

export default clipboardModule
export { clipboardModule }
