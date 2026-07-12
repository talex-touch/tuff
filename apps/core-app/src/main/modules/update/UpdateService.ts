import type {
  GitHubRelease,
  UpdateSettings as SharedUpdateSettings,
  UpdateCheckResult,
  UpdateFrequency,
  UpdateUserAction
} from '@talex-touch/utils'
import type { ModuleInitContext } from '@talex-touch/utils/types/modules'
import type { UpdateRecordRow } from './update-repository'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import fs from 'node:fs'
import path from 'node:path'
import {
  AppPreviewChannel,
  UpdateProviderType,
  UPDATE_GITHUB_REPO,
  resolveUpdateChannelLabel,
  splitUpdateTag
} from '@talex-touch/utils'
import { NEXUS_BASE_URL } from '@talex-touch/utils/env'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { UpdateEvents } from '@talex-touch/utils/transport/events'
import { app } from 'electron'
import { TalexEvents, touchEventBus, UpdateAvailableEvent } from '../../core/eventbus/touch-event'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { createLogger } from '../../utils/logger'
import { getAppVersionSafe } from '../../utils/version-util'
import { getAnalyticsMessageStore } from '../analytics/message-store'
import { getSentryService } from '../sentry'
/**
 * Update service for checking application updates in main process
 */
import { BaseModule } from '../abstract-base-module'
import { databaseModule } from '../database'
import {
  normalizeStoredUpdateChannel,
  normalizeSupportedUpdateChannel
} from '../../../shared/update/channel'
import { compareUpdateVersions, parseComparableUpdateVersion } from '../../../shared/update/version'
import { UpdateRecordStatus, UpdateRepository } from './update-repository'
import { MacAutoUpdaterAdapter } from './services/mac-auto-updater-adapter'
import { ReleaseFetchService } from './services/release-fetch-service'
import { UpdateActionController } from './services/update-action-controller'
import { UpdateDownloadAdapter } from './services/update-download-adapter'
import { UpdateSystem } from './update-system'
import type { DownloadCenterModule } from '../download/download-center'

const updateLog = createLogger('UpdateService')

const HALF_DAY_IN_MS = 12 * 60 * 60 * 1000
const DAY_IN_MS = 24 * 60 * 60 * 1000
const REMIND_LATER_INTERVAL = 8 * 60 * 60 * 1000
const UPDATE_POLL_TASK_ID = 'update-service.check'

/**
 * Update settings interface
 */
type UpdateSettings = SharedUpdateSettings & {
  autoDownload: boolean
  autoInstallDownloadedUpdates: boolean
  cacheEnabled: boolean
  cacheTTL: number // Cache TTL in minutes
  rateLimitEnabled: boolean
  maxRetries: number
  retryDelay: number // Base retry delay in milliseconds
  lastCheckedAt: number | null
  pendingInstallVersion: string | null
}

/**
 * Update service module
 */
export class UpdateServiceModule extends BaseModule<TalexEvents> {
  private pollingService: PollingService
  private settings: UpdateSettings
  private currentVersion: string
  private currentChannel: AppPreviewChannel
  private cache: Map<string, { data: UpdateCheckResult; timestamp: number; ttl: number }> =
    new Map()
  private checkInFlight: Promise<UpdateCheckResult> | null = null
  private settingsSaveTimer: NodeJS.Timeout | null = null
  private releaseCacheSaveTimer: NodeJS.Timeout | null = null
  private initContext?: ModuleInitContext<TalexEvents>
  private updateSystem?: UpdateSystem
  private updateRepository: UpdateRepository | null = null
  private releaseFetchService: ReleaseFetchService
  private releaseCacheLoadPromise: Promise<void> | null = null
  private startupBackgroundTimer: NodeJS.Timeout | null = null
  private startupAutoCheckTimer: NodeJS.Timeout | null = null
  private startupBackgroundListener: (() => void) | null = null
  private updateSystemInitListener: (() => void) | null = null
  private autoDownloadTasks: Map<string, string> = new Map()
  private transport: ITuffTransportMain | null = null
  private transportDisposers: Array<() => void> = []
  private macAutoUpdater: MacAutoUpdaterAdapter
  private downloadAdapter: UpdateDownloadAdapter
  private actionController: UpdateActionController | null = null
  private readonly messageStore = getAnalyticsMessageStore()
  private readonly channelPriority: Record<AppPreviewChannel, number> = {
    [AppPreviewChannel.RELEASE]: 0,
    [AppPreviewChannel.BETA]: 1,
    [AppPreviewChannel.SNAPSHOT]: 1
  }

  constructor() {
    super(Symbol.for('UpdateService'))
    this.pollingService = PollingService.getInstance()
    this.currentVersion = this.getCurrentVersion()
    this.currentChannel = this.getCurrentChannel()
    this.settings = this.getDefaultSettings()
    this.releaseFetchService = new ReleaseFetchService({
      getSettings: () => this.settings,
      log: { warn: (message, details) => updateLog.warn(message, details) }
    })
    this.macAutoUpdater = new MacAutoUpdaterAdapter({
      getChannel: () => this.getEffectiveChannel(),
      isUpdateCandidate: (version) => this.isUpdateCandidate(version),
      getPendingInstallVersion: () => this.settings.pendingInstallVersion,
      setPendingInstallVersion: (version) => {
        this.settings.pendingInstallVersion = version
      },
      saveSettings: () => this.saveSettings(),
      flushSettings: () => this.flushSettingsToDisk(),
      log: {
        info: (message, details) => updateLog.info(message, details),
        warn: (message, details) => updateLog.warn(message, details),
        error: (message, details) => updateLog.error(message, details)
      }
    })
    this.downloadAdapter = new UpdateDownloadAdapter({
      isPackaged: () => app.isPackaged,
      isMacAutoUpdaterEnabled: () => this.macAutoUpdater.isEnabled(),
      downloadMacUpdate: (release) => this.macAutoUpdater.download(release),
      getUpdateSystem: () => this.updateSystem,
      getEffectiveChannel: () => this.getEffectiveChannel(),
      getSourceName: () => this.settings.source?.name ?? 'Unknown',
      shouldAutoInstall: () => this.shouldAutoInstallDownloadedUpdate(),
      isUpdateCandidate: (version) => this.isUpdateCandidate(version),
      reportTelemetry: (action, meta) => this.reportUpdateTelemetry(action, meta),
      log: {
        info: (message, details) => updateLog.info(message, details),
        warn: (message, details) => updateLog.warn(message, details)
      }
    })
  }

  private tryInitUpdateSystem(ctx: ModuleInitContext<TalexEvents>): boolean {
    if (this.updateSystem) {
      return true
    }

    const downloadCenterModule = ctx.manager.getModule(Symbol.for('DownloadCenter'))
    if (
      !downloadCenterModule ||
      typeof (downloadCenterModule as { getNotificationService?: unknown })
        .getNotificationService !== 'function'
    ) {
      return false
    }

    this.updateSystem = new UpdateSystem(downloadCenterModule as DownloadCenterModule, {
      autoDownload: this.settings.autoDownload,
      autoInstallDownloadedUpdates: this.settings.autoInstallDownloadedUpdates,
      autoCheck: this.settings.enabled,
      checkFrequency: this.mapFrequencyToCheckFrequency(this.settings.frequency),
      ignoredVersions: this.settings.ignoredVersions,
      updateChannel: this.settings.updateChannel,
      rendererOverrideEnabled: this.settings.rendererOverrideEnabled,
      storageRoot: ctx.app.rootPath
    })
    updateLog.success('UpdateSystem initialized with DownloadCenter integration')
    return true
  }

  private scheduleStartupBackgroundTasks(): void {
    if (this.startupBackgroundListener || this.startupBackgroundTimer) {
      return
    }

    this.startupBackgroundListener = () => {
      this.startupBackgroundListener = null
      this.startupBackgroundTimer = setTimeout(() => {
        this.startupBackgroundTimer = null
        this.runStartupBackgroundTasks()
      }, 0)
    }
    touchEventBus.once(TalexEvents.ALL_MODULES_LOADED, this.startupBackgroundListener)
  }

  private runStartupBackgroundTasks(): void {
    this.scheduleReleaseCacheLoad()
    this.macAutoUpdater.setup()
    this.macAutoUpdater.restorePendingInstallVersion()

    if (!app.isPackaged) {
      updateLog.info('Development mode detected, skipping automatic update checks')
      return
    }

    if (this.settings.enabled && this.settings.frequency !== 'never') {
      this.startPolling()
      this.startupAutoCheckTimer = setTimeout(() => {
        this.startupAutoCheckTimer = null
        void this.checkForUpdates(false)
      }, 5000)
    }
  }

  private clearStartupBackgroundTasks(): void {
    if (this.startupBackgroundListener) {
      touchEventBus.off(TalexEvents.ALL_MODULES_LOADED, this.startupBackgroundListener)
      this.startupBackgroundListener = null
    }

    if (this.startupBackgroundTimer) {
      clearTimeout(this.startupBackgroundTimer)
      this.startupBackgroundTimer = null
    }

    if (this.startupAutoCheckTimer) {
      clearTimeout(this.startupAutoCheckTimer)
      this.startupAutoCheckTimer = null
    }

    if (this.updateSystemInitListener) {
      touchEventBus.off(TalexEvents.ALL_MODULES_LOADED, this.updateSystemInitListener)
      this.updateSystemInitListener = null
    }
  }

  /**
   * Initialize update service
   */
  async onInit(ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    this.initContext = ctx
    updateLog.info('Initializing update service')

    try {
      this.updateRepository = new UpdateRepository(databaseModule.getDb())
      updateLog.success('UpdateRepository initialized')
    } catch (error) {
      updateLog.warn('Failed to initialize UpdateRepository', { error })
    }

    const runtime = resolveMainRuntime(ctx, 'UpdateService.onInit')
    this.transport = runtime.transport
    this.registerTransportHandlers()

    // Load settings
    this.loadSettings()

    if (!this.tryInitUpdateSystem(ctx)) {
      this.updateSystemInitListener = () => {
        this.updateSystemInitListener = null
        if (!this.initContext) {
          return
        }

        if (!this.tryInitUpdateSystem(this.initContext)) {
          updateLog.warn('DownloadCenter module not found, UpdateSystem not initialized')
        }
      }
      touchEventBus.once(TalexEvents.ALL_MODULES_LOADED, this.updateSystemInitListener)
    }

    this.scheduleStartupBackgroundTasks()
  }

  /**
   * Destroy update service
   */
  async onDestroy(): Promise<void> {
    updateLog.info('Destroying update service')

    this.clearStartupBackgroundTasks()

    // Unregister polling task
    this.pollingService.unregister(UPDATE_POLL_TASK_ID)

    // Clear scheduled save
    if (this.settingsSaveTimer) {
      clearTimeout(this.settingsSaveTimer)
      this.settingsSaveTimer = null
      await this.flushSettingsToDisk()
    }

    if (this.releaseCacheSaveTimer) {
      clearTimeout(this.releaseCacheSaveTimer)
      this.releaseCacheSaveTimer = null
      await this.waitForReleaseCacheLoad()
      await this.flushReleaseCacheToDisk()
    }

    for (const dispose of this.transportDisposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.transportDisposers = []
    this.transport = null
    this.actionController = null
    this.macAutoUpdater.dispose()

    // Clear cache if needed
    if (!this.settings.cacheEnabled) {
      this.cache.clear()
    }
  }

  private getActionController(): UpdateActionController {
    if (this.actionController) {
      return this.actionController
    }

    this.actionController = new UpdateActionController({
      isPackaged: () => app.isPackaged,
      getEffectiveChannel: () => this.getEffectiveChannel(),
      getQuickUpdateCheckResult: (channel) => this.getQuickUpdateCheckResult(channel),
      queueBackgroundUpdateCheck: () => this.queueBackgroundUpdateCheck(),
      checkForUpdates: (force) => this.checkForUpdates(force),
      isMacAutoUpdaterEnabled: () => this.macAutoUpdater.isEnabled(),
      withDownloadCenterDownload: (release) => this.downloadAdapter.downloadWithCenter(release),
      withMacDownload: (release) => this.downloadAdapter.downloadWithMacAutoUpdater(release),
      withDownloadCenterInstall: (taskId) => this.downloadAdapter.installWithCenter(taskId),
      withMacInstall: () => this.macAutoUpdater.install(),
      reportUpdateMessage: (level, title, message, meta) =>
        this.reportUpdateMessage(level, title, message, meta),
      reportUpdateTelemetry: (action, meta) => this.reportUpdateTelemetry(action, meta),
      reportUpdateError: (action, error, meta) => this.reportUpdateError(action, error, meta),
      getSourceName: () => this.settings.source?.name ?? 'Unknown',
      logError: (message, error) => updateLog.error(message, { error })
    })

    return this.actionController
  }

  /**
   * Register transport handlers for communication with renderer process
   */
  private registerTransportHandlers(): void {
    if (!this.transport) {
      return
    }

    const tx = this.transport

    this.transportDisposers.push(
      tx.on(UpdateEvents.check, async (payload) => {
        const force = payload?.force ?? false
        return this.getActionController().handleCheck(force)
      }),

      tx.on(UpdateEvents.getSettings, async () => {
        return { success: true, data: this.settings }
      }),

      tx.on(
        UpdateEvents.updateSettings,
        async (payload: { settings?: Partial<UpdateSettings> }) => {
          const newSettings = payload?.settings ?? {}
          try {
            const previousSource = this.settings.source
            const sanitizedSettings: Partial<UpdateSettings> = { ...newSettings }

            if ('updateChannel' in sanitizedSettings) {
              sanitizedSettings.updateChannel = this.enforceChannelPreference(
                sanitizedSettings.updateChannel
              )
            }

            if ('frequency' in sanitizedSettings && sanitizedSettings.frequency) {
              sanitizedSettings.frequency = this.normalizeFrequency(sanitizedSettings.frequency)
            }

            if ('lastCheckedAt' in sanitizedSettings) {
              delete (sanitizedSettings as Record<string, unknown>).lastCheckedAt
            }

            this.settings = { ...this.settings, ...sanitizedSettings }
            this.saveSettings()
            this.macAutoUpdater.setup()

            if (this.updateSystem) {
              if (typeof sanitizedSettings.autoDownload === 'boolean') {
                this.updateSystem.setAutoDownload(sanitizedSettings.autoDownload)
              }
              if (typeof sanitizedSettings.autoInstallDownloadedUpdates === 'boolean') {
                this.updateSystem.updateConfig({
                  autoInstallDownloadedUpdates: sanitizedSettings.autoInstallDownloadedUpdates
                })
              }
              if (typeof sanitizedSettings.enabled === 'boolean') {
                this.updateSystem.setAutoCheck(sanitizedSettings.enabled)
              }
              if (sanitizedSettings.frequency) {
                this.updateSystem.setCheckFrequency(
                  this.mapFrequencyToCheckFrequency(sanitizedSettings.frequency)
                )
              }
              if (sanitizedSettings.updateChannel) {
                this.updateSystem.updateConfig({ updateChannel: sanitizedSettings.updateChannel })
                this.macAutoUpdater.syncChannel()
              }
              if (typeof sanitizedSettings.rendererOverrideEnabled === 'boolean') {
                const enabled = sanitizedSettings.rendererOverrideEnabled
                this.updateSystem.updateConfig({ rendererOverrideEnabled: enabled })
                if (!enabled) {
                  await this.updateSystem.disableRendererOverride(
                    'renderer override disabled via settings'
                  )
                }
                this.reportUpdateMessage(
                  'info',
                  'Renderer override setting',
                  enabled ? 'Renderer override enabled' : 'Renderer override disabled',
                  { enabled }
                )
              }
            }

            if (this.pollingService.isRegistered(UPDATE_POLL_TASK_ID)) {
              this.pollingService.unregister(UPDATE_POLL_TASK_ID)
            }
            if (this.settings.enabled) {
              this.startPolling()
            }

            if (
              previousSource?.type !== this.settings.source?.type ||
              previousSource?.url !== this.settings.source?.url
            ) {
              this.cache.clear()
              this.clearReleaseCache()
            }

            return { success: true }
          } catch (error) {
            updateLog.error('Failed to update settings', { error })
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          }
        }
      ),

      tx.on(UpdateEvents.getStatus, async () => {
        const readyStatus = await this.downloadAdapter.resolveReadyUpdateStatus(
          this.macAutoUpdater.getReadyVersion()
        )

        return {
          success: true,
          data: {
            enabled: this.settings.enabled,
            frequency: this.settings.frequency,
            source: this.settings.source,
            channel: this.getEffectiveChannel(),
            polling: this.pollingService.isRegistered(UPDATE_POLL_TASK_ID),
            lastCheck: this.settings.lastCheckedAt ?? null,
            downloadReady: readyStatus.downloadReady,
            downloadReadyVersion: readyStatus.version,
            downloadTaskId: readyStatus.taskId,
            autoInstallDownloadedUpdates: this.settings.autoInstallDownloadedUpdates
          }
        }
      }),

      tx.on(UpdateEvents.clearCache, async () => {
        try {
          this.cache.clear()
          this.clearReleaseCache()
          await this.updateRepository?.clearAllRecords()
          this.macAutoUpdater.clearPendingInstallVersion()
          this.saveSettings()
          return { success: true }
        } catch (error) {
          updateLog.error('Failed to clear cache', { error })
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      }),

      tx.on(UpdateEvents.getCachedRelease, async (payload) => {
        try {
          const requestedChannel = this.normalizeStoredChannel(payload?.channel)
          const targetChannel = requestedChannel
            ? this.enforceChannelPreference(requestedChannel)
            : this.getEffectiveChannel()
          const record = this.updateRepository
            ? await this.updateRepository.getLatestRecord(targetChannel)
            : null
          if (record) {
            const release = this.deserializeRelease(record.payload)
            if (release && !this.isUpdateCandidate(release.tag_name)) {
              return { success: true, data: null }
            }
            return {
              success: true,
              data: release
                ? {
                    release,
                    status: record.status,
                    snoozeUntil: record.snoozeUntil ?? null,
                    fetchedAt: record.fetchedAt,
                    channel: this.enforceChannelPreference(record.channel),
                    tag: record.tag,
                    source: record.source
                  }
                : null
            }
          }
          return { success: true, data: null }
        } catch (error) {
          updateLog.error('Failed to get cached release', { error })
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      }),

      tx.on(UpdateEvents.recordAction, async (payload) => {
        try {
          if (!payload?.tag || !payload?.action) {
            throw new Error('Invalid action payload')
          }
          await this.handleUserAction(payload.tag, payload.action)
          return { success: true }
        } catch (error) {
          updateLog.error('Failed to record update action', { error })
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      }),

      tx.on(UpdateEvents.download, async (release) => {
        return this.getActionController().handleDownload(release)
      }),

      tx.on(UpdateEvents.install, async (payload) => {
        return this.getActionController().handleInstall(payload)
      }),

      tx.on(UpdateEvents.ignoreVersion, async (payload) => {
        try {
          if (!this.updateSystem) {
            throw new Error('UpdateSystem not initialized')
          }
          this.updateSystem.ignoreVersion(payload.version)
          this.settings.ignoredVersions.push(payload.version)
          this.saveSettings()
          return { success: true }
        } catch (error) {
          updateLog.error('Failed to ignore version', { error })
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      }),

      tx.on(UpdateEvents.setAutoDownload, async (payload) => {
        try {
          if (!this.updateSystem) {
            throw new Error('UpdateSystem not initialized')
          }
          this.updateSystem.setAutoDownload(payload.enabled)
          this.settings.autoDownload = payload.enabled
          this.saveSettings()
          return { success: true }
        } catch (error) {
          updateLog.error('Failed to set auto download', { error })
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      }),

      tx.on(UpdateEvents.setAutoCheck, async (payload) => {
        try {
          if (!this.updateSystem) {
            throw new Error('UpdateSystem not initialized')
          }
          this.updateSystem.setAutoCheck(payload.enabled)
          this.settings.enabled = payload.enabled
          this.saveSettings()

          if (this.pollingService.isRegistered(UPDATE_POLL_TASK_ID)) {
            this.pollingService.unregister(UPDATE_POLL_TASK_ID)
          }
          if (payload.enabled) {
            this.startPolling()
          }

          return { success: true }
        } catch (error) {
          updateLog.error('Failed to set auto check', { error })
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      })
    )
  }

  /**
   * Start polling service based on frequency settings
   */
  private startPolling(): void {
    const interval = this.getFrequencyIntervalMs(this.settings.frequency)

    if (!interval) {
      updateLog.info(`Polling disabled for frequency: ${this.settings.frequency}`)
      this.pollingService.unregister(UPDATE_POLL_TASK_ID)
      return
    }

    const intervalHours = interval / (60 * 60 * 1000)

    this.pollingService.register(
      UPDATE_POLL_TASK_ID,
      async () => {
        await this.checkForUpdates()
      },
      { interval: intervalHours, unit: 'hours' }
    )
    this.pollingService.start()
    updateLog.info(`Started polling with interval: ${intervalHours}h`)
  }

  /**
   * Check for updates
   * @param force - Force check regardless of frequency settings
   * @returns Update check result
   */
  private async checkForUpdates(force = false): Promise<UpdateCheckResult> {
    const targetChannel = this.getEffectiveChannel()
    const checkKind = force ? 'manual' : 'auto'
    const ttlMs = this.settings.cacheTTL * 60 * 1000
    const now = Date.now()

    let persistedRecord: UpdateRecordRow | null = null
    let persistedResult: UpdateCheckResult | null = null

    if (this.updateRepository) {
      persistedRecord = await this.updateRepository.getLatestRecord(targetChannel)
      if (persistedRecord) {
        persistedResult = await this.buildResultFromRecord(persistedRecord)
        if (
          persistedResult &&
          !force &&
          persistedRecord.fetchedAt &&
          now - persistedRecord.fetchedAt <= ttlMs
        ) {
          updateLog.debug(`Using persisted update record for channel ${targetChannel}`)
          return persistedResult
        }
      }
    }

    if (!this.shouldPerformCheck(force)) {
      const cachedResult = this.getCachedResult(targetChannel)
      if (cachedResult) {
        updateLog.debug('Using cached result due to frequency settings')
        return cachedResult
      }

      if (persistedResult) {
        updateLog.debug('Using persisted record due to frequency throttle')
        return persistedResult
      }
    }

    if (!app.isPackaged && !force) {
      const cachedResult = this.getCachedResult(targetChannel)
      if (cachedResult) {
        return cachedResult
      }
      if (persistedResult) {
        return persistedResult
      }
      return { hasUpdate: false, source: this.settings.source?.name ?? 'Unknown' }
    }

    try {
      await this.waitForReleaseCacheLoad()
      const { result, usedNetwork } = await this.releaseFetchService.fetch(targetChannel, force)
      this.scheduleReleaseCacheSave()
      if (usedNetwork) {
        this.recordCheckTimestamp()
      }
      updateLog.info('Update check fetched', {
        meta: {
          source: result.source,
          channel: targetChannel,
          hasUpdate: result.hasUpdate,
          tag: result.release?.tag_name ?? null
        }
      })
      this.reportUpdateTelemetry(result.hasUpdate ? 'check_found' : 'check_none', {
        channel: targetChannel,
        source: result.source,
        tag: result.release?.tag_name ?? null,
        itemKind: checkKind
      })
      if (result.hasUpdate && result.release) {
        this.reportUpdateMessage(
          'info',
          'Update available',
          `Found update ${result.release.tag_name}`,
          {
            channel: targetChannel,
            source: result.source
          }
        )
      }

      if (result.hasUpdate && result.release) {
        await this.persistRelease(targetChannel, result.release, result.source)
        if (!force && this.updateRepository) {
          const persistedForRelease = await this.updateRepository.getRecordByTag(
            result.release.tag_name
          )
          const persistedDecision = await this.buildResultFromRecord(persistedForRelease)
          if (persistedDecision && !persistedDecision.hasUpdate) {
            if (this.settings.cacheEnabled) {
              this.setCachedResult(targetChannel, persistedDecision)
            }
            return persistedDecision
          }
        }
        const newVersion = this.parseVersion(result.release.tag_name)

        if (this.isUpdateNeeded(newVersion)) {
          if (!force && this.settings.ignoredVersions.includes(result.release.tag_name)) {
            const ignoredResult = {
              hasUpdate: false,
              error: 'Version ignored by user',
              source: result.source
            }

            if (this.settings.cacheEnabled) {
              this.setCachedResult(targetChannel, ignoredResult)
            }

            return ignoredResult
          }

          if (this.settings.cacheEnabled) {
            this.setCachedResult(targetChannel, result)
          }

          this.notifyRendererAboutUpdate(result, targetChannel)
          void this.downloadAdapter.maybeAutoDownload(result.release, this.autoDownloadTasks)

          return result
        }
      }

      const noUpdateResult: UpdateCheckResult = {
        hasUpdate: false,
        source: result.source
      }

      if (this.settings.cacheEnabled) {
        this.setCachedResult(targetChannel, noUpdateResult)
      }

      return noUpdateResult
    } catch (error) {
      this.recordCheckTimestamp()
      this.scheduleReleaseCacheSave()
      const expectedFailure = this.releaseFetchService.describeExpectedFailure(error)
      if (expectedFailure) {
        updateLog.warn(expectedFailure.message, { meta: expectedFailure.meta })
        this.reportUpdateTelemetry('check_deferred', {
          channel: targetChannel,
          source: this.settings.source?.name ?? 'Unknown',
          itemKind: checkKind
        })

        return {
          hasUpdate: false,
          error: expectedFailure.message,
          source: this.settings.source?.name ?? 'Unknown'
        }
      }

      updateLog.error('Update check failed', { error })
      this.reportUpdateError('check', error, { channel: targetChannel })
      this.reportUpdateTelemetry('check_error', {
        channel: targetChannel,
        source: this.settings.source?.name ?? 'Unknown',
        itemKind: checkKind
      })

      const errorResult = {
        hasUpdate: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'Unknown'
      }

      return errorResult
    }
  }

  private shouldAutoInstallDownloadedUpdate(): boolean {
    return (
      app.isPackaged &&
      process.platform === 'win32' &&
      this.settings.autoDownload === true &&
      this.settings.autoInstallDownloadedUpdates === true
    )
  }

  /**
   * Notify renderer process about available update
   * @param result - Update check result
   */
  private notifyRendererAboutUpdate(result: UpdateCheckResult, channel: AppPreviewChannel): void {
    if (!this.initContext) {
      updateLog.warn('Context not initialized, cannot notify renderer')
      return
    }

    if (!result.release) {
      return
    }

    this.transport?.broadcast(UpdateEvents.available, {
      hasUpdate: true,
      release: result.release,
      source: result.source,
      channel
    })

    // Emit event for other modules
    if (this.initContext?.events && result.release) {
      this.initContext.events.emit(
        TalexEvents.UPDATE_AVAILABLE,
        new UpdateAvailableEvent(result.release.tag_name, channel)
      )
    }
  }

  /**
   * Determine whether a scheduled check is allowed to hit the network.
   */
  private shouldPerformCheck(force: boolean): boolean {
    if (force) return true
    if (!this.settings.enabled) return false

    const interval = this.getFrequencyIntervalMs(this.settings.frequency)
    if (interval === null) {
      return false
    }

    if (!this.settings.lastCheckedAt) {
      return true
    }

    return Date.now() - this.settings.lastCheckedAt >= interval
  }

  /**
   * Persist the timestamp of the last attempt.
   */
  private recordCheckTimestamp(): void {
    this.settings.lastCheckedAt = Date.now()
    this.saveSettings()
  }

  private reportUpdateTelemetry(
    action: string,
    options: {
      channel?: AppPreviewChannel
      source?: string
      tag?: string | null
      taskId?: string | null
      itemKind?: 'manual' | 'auto'
    }
  ): void {
    try {
      const sentryService = getSentryService()
      if (!sentryService.isTelemetryEnabled()) {
        return
      }

      const [stage, ...rest] = action.split('_')
      const result = rest.length ? rest.join('_') : undefined

      sentryService.queueNexusTelemetry({
        eventType: 'feature_use',
        metadata: {
          action,
          stage: stage || undefined,
          result,
          sourceType: 'update',
          sourceId: options.channel,
          sourceName: options.source,
          sourceVersion: options.tag ?? undefined,
          itemKind: options.itemKind,
          featureId: options.taskId ?? undefined
        }
      })
    } catch {
      // ignore telemetry errors
    }
  }

  private reportUpdateMessage(
    severity: 'info' | 'warn' | 'error',
    title: string,
    message: string,
    meta?: Record<string, unknown>
  ): void {
    this.messageStore.add({
      source: 'update',
      severity,
      title,
      message,
      meta
    })
  }

  private reportUpdateError(action: string, error: unknown, meta?: Record<string, unknown>): void {
    const message = error instanceof Error ? error.message : String(error)
    this.reportUpdateMessage('error', `Update ${action} failed`, message, meta)
  }

  /**
   * Get cached result
   */
  private getCachedResult(channel: AppPreviewChannel): UpdateCheckResult | null {
    const cacheKey = this.getCacheKey(channel)
    const entry = this.cache.get(cacheKey)

    if (!entry) {
      return null
    }

    const now = Date.now()
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(cacheKey)
      return null
    }

    if (entry.data.release && !this.isUpdateCandidate(entry.data.release.tag_name)) {
      this.cache.delete(cacheKey)
      return null
    }

    return entry.data
  }

  /**
   * Set cached result
   * @param data - Data to cache
   */
  private setCachedResult(channel: AppPreviewChannel, data: UpdateCheckResult): void {
    const cacheKey = this.getCacheKey(channel)
    const now = Date.now()
    const ttl = this.settings.cacheTTL * 60 * 1000 // Convert minutes to milliseconds

    this.cache.set(cacheKey, {
      data,
      timestamp: now,
      ttl
    })
  }
  private getCacheKey(channel: AppPreviewChannel): string {
    const providerType = this.settings.source?.type ?? UpdateProviderType.GITHUB
    const providerKey =
      this.settings.source?.url ??
      (providerType === UpdateProviderType.OFFICIAL ? NEXUS_BASE_URL : UPDATE_GITHUB_REPO)
    return `releases:${providerType}:${providerKey}:${channel}`
  }

  private async handleUserAction(tag: string, action: UpdateUserAction): Promise<void> {
    if (!this.updateRepository) {
      return
    }

    switch (action) {
      case 'skip': {
        await this.updateRepository.markStatus(tag, UpdateRecordStatus.SKIPPED)
        if (!this.settings.ignoredVersions.includes(tag)) {
          this.settings.ignoredVersions.push(tag)
          this.saveSettings()
        }
        this.updateSystem?.ignoreVersion(tag)
        break
      }
      case 'remind-later':
        await this.updateRepository.markStatus(tag, UpdateRecordStatus.SNOOZED, {
          snoozeUntil: Date.now() + REMIND_LATER_INTERVAL
        })
        break
      case 'update-now':
      default:
        await this.updateRepository.markStatus(tag, UpdateRecordStatus.ACKNOWLEDGED)
        break
    }
  }

  private async persistRelease(
    channel: AppPreviewChannel,
    release: GitHubRelease,
    source: string
  ): Promise<void> {
    if (!this.updateRepository) {
      return
    }
    try {
      await this.updateRepository.saveRelease(release, channel, source)
    } catch (error) {
      updateLog.warn('Failed to persist release record', { error })
    }
  }

  private async buildResultFromRecord(
    record: UpdateRecordRow | null
  ): Promise<UpdateCheckResult | null> {
    if (!record) {
      return null
    }
    const release = this.deserializeRelease(record.payload)
    if (!release) {
      return null
    }

    if (!this.isUpdateCandidate(release.tag_name)) {
      return {
        hasUpdate: false,
        source: record.source
      }
    }

    if (record.status === UpdateRecordStatus.SKIPPED) {
      return {
        hasUpdate: false,
        source: record.source
      }
    }

    if (record.status === UpdateRecordStatus.SNOOZED) {
      if (record.snoozeUntil && record.snoozeUntil > Date.now()) {
        return {
          hasUpdate: false,
          source: record.source
        }
      }
      await this.updateRepository?.markStatus(record.tag, UpdateRecordStatus.PENDING)
    }

    return {
      hasUpdate: true,
      release,
      source: record.source
    }
  }

  private deserializeRelease(payload: string): GitHubRelease | null {
    try {
      return JSON.parse(payload) as GitHubRelease
    } catch (error) {
      updateLog.warn('Failed to parse release payload', { error })
      return null
    }
  }

  /**
   * Resolve the interval for a given frequency preset.
   */
  private getFrequencyIntervalMs(frequency: UpdateFrequency): number | null {
    switch (frequency) {
      case 'everyday':
        return HALF_DAY_IN_MS
      case '1day':
        return DAY_IN_MS
      case '3day':
        return 3 * DAY_IN_MS
      case '7day':
        return 7 * DAY_IN_MS
      case '1month':
        return 30 * DAY_IN_MS
      case 'never':
        return null
      default:
        return HALF_DAY_IN_MS
    }
  }

  /**
   * Parse version string to version object
   * @param versionStr - Version string
   * @returns Parsed version object
   */
  private parseVersion(versionStr: string): {
    channel: AppPreviewChannel
    major: number
    minor: number
    patch: number
    raw: string
  } {
    return parseComparableUpdateVersion(versionStr)
  }

  /**
   * Normalize channel text to the enum.
   */
  private parseChannelLabel(label?: string): AppPreviewChannel {
    return resolveUpdateChannelLabel(label)
  }

  private getChannelPriority(channel: AppPreviewChannel): number {
    return this.channelPriority[channel] ?? 0
  }

  /**
   * Check if update is needed
   * @param newVersion - New version to compare
   * @returns True if update is needed
   */
  private isUpdateNeeded(newVersion: {
    channel: AppPreviewChannel
    major: number
    minor: number
    patch: number
    raw: string
  }): boolean {
    const currentVersion = this.parseVersion(this.currentVersion)

    // Compare versions (prioritize: channel > semantic version)
    if (currentVersion.channel !== newVersion.channel) {
      return (
        this.getChannelPriority(newVersion.channel) >
        this.getChannelPriority(currentVersion.channel)
      )
    }

    return this.compareSemverVersions(newVersion.raw, currentVersion.raw) === 1
  }

  private isUpdateCandidate(version: string): boolean {
    const trimmed = version.trim()
    if (!trimmed) {
      return false
    }
    const parsed = this.parseVersion(trimmed)
    const targetChannel = this.getEffectiveChannel()
    if (parsed.channel !== targetChannel) {
      return false
    }
    return this.isUpdateNeeded(parsed)
  }

  /**
   * Get current version from package.json or environment variable
   * Uses version-util for consistent version reading across the app
   */
  private getCurrentVersion(): string {
    return getAppVersionSafe()
  }

  /**
   * Get current channel from version
   */
  private getCurrentChannel(): AppPreviewChannel {
    const version = this.getCurrentVersion()
    const { channelLabel } = splitUpdateTag(version)
    return this.parseChannelLabel(channelLabel)
  }

  private normalizeStoredChannel(channel: unknown): AppPreviewChannel | undefined {
    return normalizeStoredUpdateChannel(channel)
  }

  private enforceChannelPreference(preferred?: unknown): AppPreviewChannel {
    const normalizedPreferred = this.normalizeStoredChannel(preferred)
    const currentChannel = normalizeSupportedUpdateChannel(this.currentChannel)
    if (!normalizedPreferred) {
      return currentChannel
    }
    return normalizedPreferred
  }

  private compareSemverVersions(a: string | undefined, b: string | undefined): -1 | 0 | 1 {
    return compareUpdateVersions(a, b)
  }

  private getEffectiveChannel(): AppPreviewChannel {
    return this.enforceChannelPreference(this.settings.updateChannel)
  }

  private normalizeFrequency(value?: string): UpdateFrequency {
    switch (value) {
      case 'everyday':
      case '1day':
      case '3day':
      case '7day':
      case '1month':
      case 'never':
        return value
      case 'daily':
        return '1day'
      case 'weekly':
        return '7day'
      case 'monthly':
        return '1month'
      case 'startup':
        return 'everyday'
      default:
        return 'everyday'
    }
  }

  /**
   * Get default update settings
   */
  private getDefaultSettings(): UpdateSettings {
    return {
      enabled: true,
      frequency: 'everyday',
      source: {
        type: UpdateProviderType.OFFICIAL,
        name: 'Nexus Releases',
        url: NEXUS_BASE_URL,
        enabled: true,
        priority: 1
      },
      updateChannel: this.enforceChannelPreference(this.currentChannel),
      ignoredVersions: [],
      customSources: [],
      autoDownload: true,
      autoInstallDownloadedUpdates: false,
      rendererOverrideEnabled: false,
      cacheEnabled: true,
      cacheTTL: 30, // 30 minutes cache TTL
      rateLimitEnabled: true,
      maxRetries: 3,
      retryDelay: 2000, // 2 seconds base retry delay
      lastCheckedAt: null,
      pendingInstallVersion: null
    }
  }

  /**
   * Save settings to file
   */
  private saveSettings(): void {
    if (!this.initContext) {
      updateLog.warn('Context not initialized, cannot save settings')
      return
    }
    if (this.settingsSaveTimer) {
      clearTimeout(this.settingsSaveTimer)
    }
    this.settingsSaveTimer = setTimeout(() => {
      this.settingsSaveTimer = null
      void this.flushSettingsToDisk()
    }, 300)
  }

  private async flushSettingsToDisk(): Promise<void> {
    if (!this.initContext) {
      return
    }
    try {
      const configDir = path.join(this.initContext.app.rootPath, 'config')
      const settingsFile = path.join(configDir, 'update-settings.json')
      await fs.promises.mkdir(configDir, { recursive: true })
      await fs.promises.writeFile(settingsFile, JSON.stringify(this.settings, null, 2))
      updateLog.success(`Settings saved to: ${settingsFile}`)
    } catch (error) {
      updateLog.error('Failed to save settings', { error })
    }
  }

  private async loadReleaseCache(): Promise<void> {
    if (this.initContext) {
      await this.releaseFetchService.load(this.initContext.app.rootPath)
    }
  }

  private scheduleReleaseCacheLoad(): void {
    if (this.releaseCacheLoadPromise) return
    const startedAt = performance.now()
    this.releaseCacheLoadPromise = this.loadReleaseCache().finally(() => {
      updateLog.debug('Update release cache load finished', {
        meta: { durationMs: Math.round(performance.now() - startedAt) }
      })
    })
  }

  private async waitForReleaseCacheLoad(): Promise<void> {
    this.scheduleReleaseCacheLoad()
    if (!this.releaseCacheLoadPromise) return
    try {
      await this.releaseCacheLoadPromise
    } catch {
      // loadReleaseCache logs failures internally.
    }
  }

  private scheduleReleaseCacheSave(): void {
    if (this.releaseCacheSaveTimer) {
      clearTimeout(this.releaseCacheSaveTimer)
    }
    this.releaseCacheSaveTimer = setTimeout(() => {
      this.releaseCacheSaveTimer = null
      void this.flushReleaseCacheToDisk()
    }, 300)
  }

  private async flushReleaseCacheToDisk(): Promise<void> {
    if (this.initContext) {
      await this.releaseFetchService.flush(this.initContext.app.rootPath)
    }
  }

  private clearReleaseCache(): void {
    this.releaseFetchService.clear()
    this.scheduleReleaseCacheSave()
  }

  private async getQuickUpdateCheckResult(channel: AppPreviewChannel): Promise<UpdateCheckResult> {
    const cached = this.getCachedResult(channel)
    if (cached) {
      return cached
    }

    if (this.updateRepository) {
      const record = await this.updateRepository.getLatestRecord(channel)
      const persisted = await this.buildResultFromRecord(record)
      if (persisted) {
        return persisted
      }
    }

    return { hasUpdate: false, source: this.settings.source?.name ?? 'Unknown' }
  }

  private queueBackgroundUpdateCheck(): void {
    if (this.checkInFlight) {
      return
    }

    this.checkInFlight = this.checkForUpdates(false)
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error)
        updateLog.warn('Background update check failed', { error: errorMessage })
        return {
          hasUpdate: false,
          error: errorMessage,
          source: this.settings.source?.name ?? 'Unknown'
        }
      })
      .finally(() => {
        this.checkInFlight = null
      })
  }

  /**
   * Map UpdateFrequency to check frequency
   */
  private mapFrequencyToCheckFrequency(
    frequency: UpdateFrequency
  ): 'startup' | 'daily' | 'weekly' | 'never' {
    switch (frequency) {
      case 'everyday':
      case '1day':
        return 'daily'
      case '7day':
        return 'weekly'
      case 'never':
        return 'never'
      default:
        return 'startup'
    }
  }

  /**
   * Load settings from file
   */
  private loadSettings(): void {
    if (!this.initContext) {
      updateLog.warn('Context not initialized, using default settings')
      return
    }
    try {
      const configDir = path.join(this.initContext.app.rootPath, 'config')
      const settingsFile = path.join(configDir, 'update-settings.json')
      const defaults = this.getDefaultSettings()

      if (fs.existsSync(settingsFile)) {
        const settingsData = fs.readFileSync(settingsFile, 'utf8')
        const persisted = JSON.parse(settingsData) as Record<string, unknown>
        const normalizedChannel = this.enforceChannelPreference(persisted.updateChannel)

        this.settings = {
          ...defaults,
          ...(persisted as Partial<UpdateSettings>),
          updateChannel: normalizedChannel
        }
        this.settings.frequency = this.normalizeFrequency(this.settings.frequency)

        if (typeof this.settings.lastCheckedAt !== 'number') {
          this.settings.lastCheckedAt = defaults.lastCheckedAt
        }
        if (typeof this.settings.autoDownload !== 'boolean') {
          this.settings.autoDownload = defaults.autoDownload
        }
        if (typeof this.settings.autoInstallDownloadedUpdates !== 'boolean') {
          this.settings.autoInstallDownloadedUpdates = defaults.autoInstallDownloadedUpdates
        }
        if (typeof this.settings.rendererOverrideEnabled !== 'boolean') {
          this.settings.rendererOverrideEnabled = defaults.rendererOverrideEnabled
        }
        if (typeof this.settings.pendingInstallVersion !== 'string') {
          this.settings.pendingInstallVersion = defaults.pendingInstallVersion
        }

        let shouldSaveSettings = persisted.updateChannel !== normalizedChannel

        const pendingVersion = (this.settings.pendingInstallVersion ?? '').trim()
        if (pendingVersion.length > 0) {
          if (!this.isUpdateCandidate(pendingVersion)) {
            this.settings.pendingInstallVersion = null
            shouldSaveSettings = true
          }
        }

        if (shouldSaveSettings) {
          this.saveSettings()
        }

        updateLog.info(`Settings loaded from: ${settingsFile}`)
      } else {
        this.settings = defaults
      }
    } catch (error) {
      updateLog.error('Failed to load settings', { error })
      this.settings = this.getDefaultSettings()
    }
  }
}

// Export module instance
export const updateServiceModule = new UpdateServiceModule()
