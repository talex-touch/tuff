import type {
  GitHubRelease,
  UpdateSettings as SharedUpdateSettings,
  UpdateCheckResult,
  UpdateFrequency,
  UpdateUserAction
} from '@talex-touch/utils'
import type { ModuleInitContext } from '@talex-touch/utils/types/modules'
import type { UpdateRecordRow } from './update-repository'
import fs from 'node:fs'
import path from 'node:path'
import {
  AppPreviewChannel,
  DownloadModule,
  DownloadStatus,
  UpdateProviderType,
  UPDATE_GITHUB_RELEASES_API,
  UPDATE_GITHUB_REPO,
  resolveUpdateChannelLabel,
  splitUpdateTag
} from '@talex-touch/utils'
import { getTuffBaseUrl } from '@talex-touch/utils/env'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { UpdateEvents } from '@talex-touch/utils/transport/events'
import { and, desc, eq } from 'drizzle-orm'
import { app, Notification } from 'electron'
import { autoUpdater } from 'electron-updater'
import { TalexEvents, touchEventBus, UpdateAvailableEvent } from '../../core/eventbus/touch-event'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { downloadChunks, downloadTasks } from '../../db/schema'
import { createLogger } from '../../utils/logger'
import { shouldDowngradeRemoteFailure } from '../../utils/network-log-noise'
import { getAppVersionSafe } from '../../utils/version-util'
import { getAnalyticsMessageStore } from '../analytics/message-store'
import { getSentryService } from '../sentry'
/**
 * Update service for checking application updates in main process
 */
import { BaseModule } from '../abstract-base-module'
import { databaseModule } from '../database'
import { getNetworkService } from '../network'
import {
  normalizeStoredUpdateChannel,
  normalizeSupportedUpdateChannel
} from '../../../shared/update/channel'
import {
  compareUpdateVersions,
  parseComparableUpdateVersion,
  selectLatestUpdateRelease
} from '../../../shared/update/version'
import { UpdateRecordStatus, UpdateRepository } from './update-repository'
import { UpdateActionController } from './services/update-action-controller'
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
  cacheEnabled: boolean
  cacheTTL: number // Cache TTL in minutes
  rateLimitEnabled: boolean
  maxRetries: number
  retryDelay: number // Base retry delay in milliseconds
  lastCheckedAt: number | null
  pendingInstallVersion: string | null
}

interface ReleaseCacheRateLimit {
  remaining?: number
  resetAt?: number
}

interface ReleaseCacheEntry {
  releases: GitHubRelease[]
  fetchedAt: number
  ttlMinutes: number
  etag?: string
  lastModified?: string
  rateLimit?: ReleaseCacheRateLimit
  cooldownUntil?: number
  failureCount?: number
}

interface ReleaseCacheStore {
  version: 1
  providerType?: UpdateProviderType
  providerKey?: string
  entries: Partial<Record<AppPreviewChannel, ReleaseCacheEntry>>
}

interface UpdateFetchResult {
  result: UpdateCheckResult
  usedNetwork: boolean
}

interface OfficialReleaseAsset {
  filename: string
  downloadUrl: string
  size: number
  platform: 'darwin' | 'win32' | 'linux'
  arch: 'x64' | 'arm64' | 'universal'
  sha256?: string | null
  signatureUrl?: string | null
}

interface OfficialRelease {
  tag: string
  name: string
  channel: AppPreviewChannel
  version: string
  notes: { zh: string; en: string }
  notesHtml?: { zh: string; en: string } | null
  status: string
  publishedAt?: string | null
  createdAt: string
  assets?: OfficialReleaseAsset[]
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
  private releaseCacheStore: ReleaseCacheStore = { version: 1, entries: {} }
  private autoDownloadTasks: Map<string, string> = new Map()
  private transport: ReturnType<typeof getTuffTransportMain> | null = null
  private transportDisposers: Array<() => void> = []
  private macAutoUpdaterInitialized = false
  private macAutoUpdaterDownloadInFlight = false
  private macUpdateDownloadedVersion: string | null = null
  private macUpdateReadyNotifiedVersion: string | null = null
  private macAutoUpdaterConfigMissingLogged = false
  private actionController: UpdateActionController | null = null
  private readonly messageStore = getAnalyticsMessageStore()
  private readonly channelPriority: Record<AppPreviewChannel, number> = {
    [AppPreviewChannel.RELEASE]: 0,
    [AppPreviewChannel.BETA]: 1,
    [AppPreviewChannel.SNAPSHOT]: 1
  }
  private readonly onMacUpdateDownloaded = (info: { version?: string }): void => {
    const version = (info?.version || '').trim()
    if (!version) {
      updateLog.warn('macOS update downloaded without version info')
      return
    }
    if (!this.isUpdateCandidate(version)) {
      updateLog.warn('macOS update ignored (version/channel mismatch)', {
        meta: {
          version,
          current: this.currentVersion,
          channel: this.getEffectiveChannel()
        }
      })
      this.macUpdateDownloadedVersion = null
      this.macUpdateReadyNotifiedVersion = null
      this.settings.pendingInstallVersion = null
      this.saveSettings()
      return
    }
    this.macUpdateDownloadedVersion = version
    this.macUpdateReadyNotifiedVersion = null
    this.settings.pendingInstallVersion = version
    this.saveSettings()
    this.showMacUpdateReadyNotification(version)
  }
  private readonly onMacUpdaterError = (error: unknown): void => {
    updateLog.error('Mac autoUpdater error', { error })
  }

  constructor() {
    super(Symbol.for('UpdateService'))
    this.pollingService = PollingService.getInstance()
    this.currentVersion = this.getCurrentVersion()
    this.currentChannel = this.getCurrentChannel()
    this.settings = this.getDefaultSettings()
    this.releaseCacheStore = this.buildReleaseCacheStore()
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
    await this.loadReleaseCache()
    this.setupMacAutoUpdater()

    if (!this.tryInitUpdateSystem(ctx)) {
      touchEventBus.once(TalexEvents.ALL_MODULES_LOADED, () => {
        if (!this.initContext) {
          return
        }

        if (!this.tryInitUpdateSystem(this.initContext)) {
          updateLog.warn('DownloadCenter module not found, UpdateSystem not initialized')
        }
      })
    }

    if (!app.isPackaged) {
      updateLog.info('Development mode detected, skipping automatic update checks')
      return
    }

    if (this.settings.enabled && this.settings.frequency !== 'never') {
      this.startPolling()

      setTimeout(() => {
        void this.checkForUpdates(false)
      }, 5000)
    }
  }

  /**
   * Destroy update service
   */
  async onDestroy(): Promise<void> {
    updateLog.info('Destroying update service')

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
    if (this.macAutoUpdaterInitialized) {
      autoUpdater.removeListener('update-downloaded', this.onMacUpdateDownloaded)
      autoUpdater.removeListener('error', this.onMacUpdaterError)
      this.macAutoUpdaterInitialized = false
    }

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
      isMacAutoUpdaterEnabled: () => this.isMacAutoUpdaterEnabled(),
      withDownloadCenterDownload: async (release) => {
        if (!this.updateSystem) {
          throw new Error('UpdateSystem not initialized')
        }
        const taskId = await this.updateSystem.downloadUpdate(release)
        return { taskId }
      },
      withMacDownload: async (release) => {
        if (this.updateSystem) {
          await this.updateSystem.scheduleRendererOverride(release)
        }
        await this.downloadMacUpdate(release)
      },
      withDownloadCenterInstall: async (taskId) => {
        if (!this.updateSystem) {
          throw new Error('UpdateSystem not initialized')
        }
        await this.updateSystem.installUpdate(taskId)
      },
      withMacInstall: async () => this.installMacUpdate(),
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
            const previousProvider = this.resolveReleaseCacheProvider(this.settings.source)
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
            this.setupMacAutoUpdater()

            if (this.updateSystem) {
              if (typeof sanitizedSettings.autoDownload === 'boolean') {
                this.updateSystem.setAutoDownload(sanitizedSettings.autoDownload)
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
                this.syncMacAutoUpdaterChannel()
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

            const nextProvider = this.resolveReleaseCacheProvider(this.settings.source)
            if (
              previousProvider.type !== nextProvider.type ||
              previousProvider.key !== nextProvider.key
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
        const readyStatus = await this.resolveReadyUpdateStatus()

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
            downloadTaskId: readyStatus.taskId
          }
        }
      }),

      tx.on(UpdateEvents.clearCache, async () => {
        try {
          this.cache.clear()
          this.clearReleaseCache()
          await this.updateRepository?.clearAllRecords()
          this.macUpdateDownloadedVersion = null
          this.macUpdateReadyNotifiedVersion = null
          this.settings.pendingInstallVersion = null
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

  private getMacAutoUpdaterConfigPath(): string {
    return path.join(process.resourcesPath, 'app-update.yml')
  }

  private isMacAutoUpdaterEnabled(): boolean {
    if (!app.isPackaged || process.platform !== 'darwin') {
      return false
    }

    const configPath = this.getMacAutoUpdaterConfigPath()
    if (fs.existsSync(configPath)) {
      return true
    }

    if (!this.macAutoUpdaterConfigMissingLogged) {
      this.macAutoUpdaterConfigMissingLogged = true
      updateLog.warn('macOS autoUpdater disabled because app-update.yml is missing', {
        meta: { configPath }
      })
    }

    return false
  }

  private setupMacAutoUpdater(): void {
    if (this.macAutoUpdaterInitialized || !this.isMacAutoUpdaterEnabled()) {
      return
    }
    this.macAutoUpdaterInitialized = true
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = this.getEffectiveChannel() !== AppPreviewChannel.RELEASE
    autoUpdater.on('update-downloaded', this.onMacUpdateDownloaded)
    autoUpdater.on('error', this.onMacUpdaterError)
  }

  private syncMacAutoUpdaterChannel(): void {
    if (!this.isMacAutoUpdaterEnabled() || !this.macAutoUpdaterInitialized) {
      return
    }
    autoUpdater.allowPrerelease = this.getEffectiveChannel() !== AppPreviewChannel.RELEASE
  }

  private async downloadMacUpdate(release: GitHubRelease): Promise<void> {
    this.setupMacAutoUpdater()
    if (this.macUpdateDownloadedVersion) {
      updateLog.info('macOS update already downloaded', {
        meta: { version: this.macUpdateDownloadedVersion }
      })
      return
    }
    if (this.macAutoUpdaterDownloadInFlight) {
      return
    }
    this.macAutoUpdaterDownloadInFlight = true
    try {
      this.syncMacAutoUpdaterChannel()
      updateLog.info('macOS autoUpdater checking for updates', {
        meta: { tag: release.tag_name }
      })
      await autoUpdater.checkForUpdates()
      await autoUpdater.downloadUpdate()
      updateLog.info('macOS autoUpdater download started', {
        meta: { tag: release.tag_name }
      })
    } catch (error) {
      updateLog.error('macOS autoUpdater download failed', { error })
      throw error
    } finally {
      this.macAutoUpdaterDownloadInFlight = false
    }
  }

  private async installMacUpdate(): Promise<void> {
    const pendingVersion = this.macUpdateDownloadedVersion
    if (!pendingVersion) {
      throw new Error('macOS update has not been downloaded')
    }

    this.macUpdateDownloadedVersion = null
    this.macUpdateReadyNotifiedVersion = null
    this.settings.pendingInstallVersion = null

    try {
      await this.flushSettingsToDisk()
    } catch (error) {
      updateLog.warn('Failed to persist macOS pending update state before install', { error })
    }

    autoUpdater.quitAndInstall()
  }

  private showMacUpdateReadyNotification(version: string): void {
    if (!this.isMacAutoUpdaterEnabled()) {
      return
    }
    if (this.macUpdateReadyNotifiedVersion === version) {
      return
    }
    this.macUpdateReadyNotifiedVersion = version
    const notification = new Notification({
      title: 'Update Ready',
      body: `Version ${version} is ready. Click to restart and finish updating.`,
      silent: false,
      urgency: 'critical',
      timeoutType: 'never'
    })
    notification.on('click', () => {
      void this.installMacUpdate().catch((error) => {
        updateLog.error('Failed to install macOS update', { error })
      })
    })
    notification.show()
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
      const { result, usedNetwork } = await this.fetchLatestRelease(targetChannel, { force })
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
          void this.maybeAutoDownload(result.release)

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
      const expectedFailure = this.describeExpectedUpdateCheckFailure(error)
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

  private async maybeAutoDownload(release: GitHubRelease): Promise<void> {
    if (!this.settings.autoDownload) {
      return
    }
    if (!app.isPackaged) {
      return
    }

    const tag = release.tag_name
    if (this.autoDownloadTasks.has(tag)) {
      return
    }

    if (this.isMacAutoUpdaterEnabled()) {
      try {
        if (this.updateSystem) {
          await this.updateSystem.scheduleRendererOverride(release)
        }
        await this.downloadMacUpdate(release)
        this.autoDownloadTasks.set(tag, 'macos-auto-updater')
        updateLog.info(`Auto download started for ${tag} (macOS autoUpdater)`)
        this.reportUpdateTelemetry('download_started', {
          channel: this.getEffectiveChannel(),
          source: 'mac-auto-updater',
          tag,
          itemKind: 'auto'
        })
      } catch (error) {
        updateLog.warn('Auto download failed (macOS autoUpdater)', { error, meta: { tag } })
        this.reportUpdateTelemetry('download_error', {
          channel: this.getEffectiveChannel(),
          source: 'mac-auto-updater',
          tag,
          itemKind: 'auto'
        })
      }
      return
    }

    if (!this.updateSystem) {
      return
    }

    const existingTaskId = await this.getExistingDownloadedUpdateTaskId(tag)
    if (existingTaskId) {
      this.autoDownloadTasks.set(tag, existingTaskId)
      updateLog.info(`Update ${tag} already downloaded, skipping auto download`, {
        meta: { taskId: existingTaskId }
      })
      return
    }

    try {
      const taskId = await this.updateSystem.downloadUpdate(release)
      this.autoDownloadTasks.set(tag, taskId)
      updateLog.info(`Auto download started for ${tag}`, { meta: { taskId } })
      this.reportUpdateTelemetry('download_started', {
        channel: this.getEffectiveChannel(),
        source: this.settings.source?.name ?? 'Unknown',
        tag,
        taskId,
        itemKind: 'auto'
      })
    } catch (error) {
      updateLog.warn('Auto download failed', { error, meta: { tag } })
      this.reportUpdateTelemetry('download_error', {
        channel: this.getEffectiveChannel(),
        source: this.settings.source?.name ?? 'Unknown',
        tag,
        itemKind: 'auto'
      })
    }
  }

  private async getExistingDownloadedUpdateTaskId(tag: string): Promise<string | null> {
    try {
      const db = databaseModule.getDb()
      const tasks = await db
        .select({
          id: downloadTasks.id,
          destination: downloadTasks.destination,
          filename: downloadTasks.filename,
          metadata: downloadTasks.metadata
        })
        .from(downloadTasks)
        .where(
          and(
            eq(downloadTasks.module, DownloadModule.APP_UPDATE),
            eq(downloadTasks.status, DownloadStatus.COMPLETED)
          )
        )
        .orderBy(desc(downloadTasks.completedAt))
        .limit(20)

      for (const task of tasks) {
        const metadata = this.parseDownloadTaskMetadata(task.metadata)
        if (metadata?.version !== tag) {
          continue
        }

        const filePath = path.join(task.destination, task.filename)
        if (await this.fileExists(filePath)) {
          return task.id
        }
      }
    } catch (error) {
      updateLog.warn('Failed to check existing update downloads', { error, meta: { tag } })
    }

    return null
  }

  private async resolveReadyUpdateStatus(): Promise<{
    downloadReady: boolean
    version: string | null
    taskId: string | null
  }> {
    if (this.isMacAutoUpdaterEnabled() && this.macUpdateDownloadedVersion) {
      const pendingVersion = this.macUpdateDownloadedVersion
      if (!this.isUpdateCandidate(pendingVersion)) {
        updateLog.warn('Ignoring stale macOS pending update', {
          meta: { version: pendingVersion, channel: this.getEffectiveChannel() }
        })
        this.macUpdateDownloadedVersion = null
        this.macUpdateReadyNotifiedVersion = null
        this.settings.pendingInstallVersion = null
        this.saveSettings()
      } else {
        return {
          downloadReady: true,
          version: pendingVersion,
          taskId: null
        }
      }
    }

    try {
      const db = databaseModule.getDb()
      const tasks = await db
        .select({
          id: downloadTasks.id,
          destination: downloadTasks.destination,
          filename: downloadTasks.filename,
          metadata: downloadTasks.metadata
        })
        .from(downloadTasks)
        .where(
          and(
            eq(downloadTasks.module, DownloadModule.APP_UPDATE),
            eq(downloadTasks.status, DownloadStatus.COMPLETED)
          )
        )
        .orderBy(desc(downloadTasks.completedAt))
        .limit(20)

      for (const task of tasks) {
        const filePath = path.join(task.destination, task.filename)
        if (!(await this.fileExists(filePath))) {
          continue
        }

        const metadata = this.parseDownloadTaskMetadata(task.metadata)
        const version = typeof metadata?.version === 'string' ? metadata.version : null

        if (version && !this.isUpdateCandidate(version)) {
          await this.cleanupOutdatedUpdateTask(task.id, filePath, version)
          continue
        }

        return {
          downloadReady: true,
          version,
          taskId: task.id
        }
      }
    } catch (error) {
      updateLog.warn('Failed to resolve ready update status', { error })
    }

    return {
      downloadReady: false,
      version: null,
      taskId: null
    }
  }

  private async cleanupOutdatedUpdateTask(
    taskId: string,
    filePath: string,
    version: string
  ): Promise<void> {
    try {
      await fs.promises.unlink(filePath)
    } catch (error) {
      updateLog.warn('Failed to delete outdated update file', {
        error,
        meta: { taskId, filePath, version }
      })
    }

    try {
      const db = databaseModule.getDb()
      await db.delete(downloadChunks).where(eq(downloadChunks.taskId, taskId))
      await db.delete(downloadTasks).where(eq(downloadTasks.id, taskId))
      updateLog.info('Outdated update package cleaned', {
        meta: { taskId, version }
      })
    } catch (error) {
      updateLog.warn('Failed to delete outdated update task record', {
        error,
        meta: { taskId, version }
      })
    }
  }

  private parseDownloadTaskMetadata(metadata?: string | null): Record<string, unknown> | null {
    if (!metadata) {
      return null
    }
    try {
      return JSON.parse(metadata) as Record<string, unknown>
    } catch (error) {
      updateLog.warn('Failed to parse download task metadata', { error })
      return null
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.stat(filePath)
      return true
    } catch {
      return false
    }
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

  /**
   * Get cache key for current configuration
   */
  private getCacheKey(channel: AppPreviewChannel): string {
    const providerType = this.settings.source?.type ?? UpdateProviderType.GITHUB
    const providerKey =
      providerType === UpdateProviderType.OFFICIAL
        ? this.resolveOfficialBaseUrl()
        : (this.settings.source?.url ?? UPDATE_GITHUB_REPO)
    return `releases:${providerType}:${providerKey}:${channel}`
  }

  private resolveReleaseCacheProvider(source: UpdateSettings['source'] | undefined): {
    type: UpdateProviderType
    key: string
  } {
    const providerType = source?.type ?? UpdateProviderType.GITHUB
    const providerKey =
      providerType === UpdateProviderType.OFFICIAL
        ? this.resolveOfficialBaseUrl()
        : (source?.url ?? UPDATE_GITHUB_REPO)
    return { type: providerType, key: providerKey }
  }

  private buildReleaseCacheStore(entries: ReleaseCacheStore['entries'] = {}): ReleaseCacheStore {
    const provider = this.resolveReleaseCacheProvider(this.settings.source)
    return {
      version: 1,
      entries,
      providerType: provider.type,
      providerKey: provider.key
    }
  }

  private isReleaseCacheCompatible(store: ReleaseCacheStore): boolean {
    const provider = this.resolveReleaseCacheProvider(this.settings.source)
    if (!store.providerType && !store.providerKey) {
      return (
        provider.type === UpdateProviderType.GITHUB &&
        provider.key === (this.settings.source?.url ?? UPDATE_GITHUB_REPO)
      )
    }
    return store.providerType === provider.type && store.providerKey === provider.key
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

  /**
   * Fetch latest release from GitHub API
   */
  private async fetchLatestRelease(
    channel: AppPreviewChannel,
    options?: { force?: boolean }
  ): Promise<UpdateFetchResult> {
    if (this.settings.source?.type === UpdateProviderType.OFFICIAL) {
      try {
        const officialResult = await this.fetchLatestReleaseFromOfficial(channel, options)
        if (officialResult.result.hasUpdate || !officialResult.result.error) {
          return officialResult
        }
      } catch (error) {
        updateLog.warn('Official update source failed, falling back to GitHub', { error })
      }
      return this.fetchLatestReleaseFromGitHub(channel, options)
    }

    return this.fetchLatestReleaseFromGitHub(channel, options)
  }

  private async fetchLatestReleaseFromGitHub(
    channel: AppPreviewChannel,
    options?: { force?: boolean }
  ): Promise<UpdateFetchResult> {
    const source =
      this.settings.source?.type === UpdateProviderType.GITHUB
        ? (this.settings.source?.name ?? 'GitHub')
        : 'GitHub'
    const force = options?.force ?? false
    const cacheEntry = this.getReleaseCacheEntry(channel)
    const now = Date.now()
    const resolveCachedRelease = (): GitHubRelease | null =>
      selectLatestUpdateRelease(cacheEntry?.releases ?? [])

    if (!force && this.settings.cacheEnabled && cacheEntry?.releases?.length) {
      const ttlMs = this.settings.cacheTTL * 60 * 1000
      if (now - cacheEntry.fetchedAt <= ttlMs) {
        const cachedRelease = resolveCachedRelease()
        if (!cachedRelease) {
          return {
            usedNetwork: false,
            result: {
              hasUpdate: false,
              error: 'No cached release available',
              source
            }
          }
        }
        return {
          usedNetwork: false,
          result: {
            hasUpdate: true,
            release: cachedRelease,
            source
          }
        }
      }
    }

    if (
      this.settings.rateLimitEnabled &&
      cacheEntry?.cooldownUntil &&
      now < cacheEntry.cooldownUntil
    ) {
      if (cacheEntry.releases?.length) {
        const cachedRelease = resolveCachedRelease()
        if (!cachedRelease) {
          return {
            usedNetwork: false,
            result: {
              hasUpdate: false,
              error: 'No cached release available',
              source
            }
          }
        }
        return {
          usedNetwork: false,
          result: {
            hasUpdate: true,
            release: cachedRelease,
            source
          }
        }
      }
      return {
        usedNetwork: false,
        result: {
          hasUpdate: false,
          error: 'Rate limit cooldown in effect',
          source
        }
      }
    }

    const maxRetries = Math.max(1, this.settings.maxRetries || 1)
    const baseDelay = this.settings.retryDelay || 2000
    const ttlMinutes = this.settings.cacheTTL

    let lastError: unknown
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'TalexTouch-Updater/1.0'
        }

        if (this.settings.cacheEnabled && cacheEntry?.etag) {
          headers['If-None-Match'] = cacheEntry.etag
        }
        if (this.settings.cacheEnabled && cacheEntry?.lastModified) {
          headers['If-Modified-Since'] = cacheEntry.lastModified
        }

        const response = await getNetworkService().request<GitHubRelease[]>({
          method: 'GET',
          url: UPDATE_GITHUB_RELEASES_API,
          timeoutMs: 8000,
          headers,
          responseType: 'json',
          validateStatus: [200, 304, 403, 429]
        })

        if (response.status === 403 || response.status === 429) {
          const statusError = new Error(`NETWORK_HTTP_STATUS_${response.status}`) as Error & {
            headers?: Record<string, string>
          }
          statusError.headers = response.headers
          throw statusError
        }

        const rateLimit = this.extractRateLimitInfo(response.headers)
        const etag = this.getHeaderValue(response.headers, 'etag')
        const lastModified = this.getHeaderValue(response.headers, 'last-modified')

        if (response.status === 304) {
          if (cacheEntry?.releases?.length) {
            const cachedRelease = resolveCachedRelease()
            if (!cachedRelease) {
              return {
                usedNetwork: true,
                result: {
                  hasUpdate: false,
                  error: 'No cached release available',
                  source
                }
              }
            }
            this.setReleaseCacheEntry(channel, {
              ...cacheEntry,
              fetchedAt: now,
              ttlMinutes,
              rateLimit: rateLimit ?? cacheEntry.rateLimit,
              etag: etag ?? cacheEntry.etag,
              lastModified: lastModified ?? cacheEntry.lastModified,
              cooldownUntil: this.resolveCooldownUntil(rateLimit),
              failureCount: 0
            })
            return {
              usedNetwork: true,
              result: {
                hasUpdate: true,
                release: cachedRelease,
                source
              }
            }
          }
          return {
            usedNetwork: true,
            result: {
              hasUpdate: false,
              error: 'No cached release available',
              source
            }
          }
        }

        const releases: GitHubRelease[] = response.data

        if (!releases || !Array.isArray(releases)) {
          return {
            usedNetwork: true,
            result: {
              hasUpdate: false,
              error: 'Invalid response format from GitHub API',
              source
            }
          }
        }

        const channelReleases = releases.filter((release) => {
          const version = this.parseVersion(release.tag_name)
          return version.channel === channel
        })

        if (channelReleases.length === 0) {
          return {
            usedNetwork: true,
            result: {
              hasUpdate: false,
              error: `No releases found for channel: ${channel}`,
              source
            }
          }
        }

        channelReleases.sort((a, b) => compareUpdateVersions(b.tag_name, a.tag_name))
        const latestRelease = channelReleases[0]

        const updatedEntry: ReleaseCacheEntry = {
          releases: channelReleases,
          fetchedAt: now,
          ttlMinutes,
          etag: etag ?? cacheEntry?.etag,
          lastModified: lastModified ?? cacheEntry?.lastModified,
          rateLimit,
          cooldownUntil: this.resolveCooldownUntil(rateLimit),
          failureCount: 0
        }

        this.setReleaseCacheEntry(channel, updatedEntry)

        return {
          usedNetwork: true,
          result: {
            hasUpdate: true,
            release: latestRelease,
            source
          }
        }
      } catch (error) {
        lastError = error

        if (!this.isRetryableError(error) || attempt >= maxRetries - 1) {
          break
        }

        const delay = this.calculateRetryDelay(attempt, baseDelay)
        await this.sleep(delay)
      }
    }

    if (lastError) {
      this.recordFetchFailure(channel, lastError)
    }

    if (cacheEntry?.releases?.length) {
      const cachedRelease = resolveCachedRelease()
      if (!cachedRelease) {
        throw new Error('Failed to fetch latest release')
      }
      return {
        usedNetwork: false,
        result: {
          hasUpdate: true,
          release: cachedRelease,
          source
        }
      }
    }

    if (lastError instanceof Error) {
      throw lastError
    }

    throw new Error('Failed to fetch latest release')
  }

  private async fetchLatestReleaseFromOfficial(
    channel: AppPreviewChannel,
    options?: { force?: boolean }
  ): Promise<UpdateFetchResult> {
    const source = this.settings.source?.name ?? 'Official Releases'
    const force = options?.force ?? false
    const cacheEntry = this.getReleaseCacheEntry(channel)
    const now = Date.now()
    const resolveCachedRelease = (): GitHubRelease | null =>
      selectLatestUpdateRelease(cacheEntry?.releases ?? [])

    if (!force && this.settings.cacheEnabled && cacheEntry?.releases?.length) {
      const ttlMs = this.settings.cacheTTL * 60 * 1000
      if (now - cacheEntry.fetchedAt <= ttlMs) {
        const cachedRelease = resolveCachedRelease()
        if (!cachedRelease) {
          return {
            usedNetwork: false,
            result: {
              hasUpdate: false,
              error: 'No cached release available',
              source
            }
          }
        }
        return {
          usedNetwork: false,
          result: {
            hasUpdate: true,
            release: cachedRelease,
            source
          }
        }
      }
    }

    try {
      const url = new URL('/api/releases/latest', this.resolveOfficialBaseUrl())
      url.searchParams.set('channel', channel)
      const response = await getNetworkService().request<{
        release?: OfficialRelease | null
        message?: string
      }>({
        method: 'GET',
        url: url.toString(),
        timeoutMs: 8000,
        responseType: 'json'
      })
      const release = response.data?.release as OfficialRelease | null

      if (!release) {
        return {
          usedNetwork: true,
          result: {
            hasUpdate: false,
            error: response.data?.message ?? 'No official release available',
            source
          }
        }
      }

      const mapped = this.mapOfficialRelease(release)
      const updatedEntry: ReleaseCacheEntry = {
        releases: [mapped],
        fetchedAt: now,
        ttlMinutes: this.settings.cacheTTL,
        failureCount: 0
      }

      this.setReleaseCacheEntry(channel, updatedEntry)

      return {
        usedNetwork: true,
        result: {
          hasUpdate: true,
          release: mapped,
          source
        }
      }
    } catch (error) {
      this.recordFetchFailure(channel, error)

      if (cacheEntry?.releases?.length) {
        const cachedRelease = resolveCachedRelease()
        if (!cachedRelease) {
          throw new Error('Failed to fetch official release')
        }
        return {
          usedNetwork: false,
          result: {
            hasUpdate: true,
            release: cachedRelease,
            source
          }
        }
      }

      if (error instanceof Error) {
        throw error
      }

      throw new Error('Failed to fetch official release')
    }
  }

  private mapOfficialRelease(release: OfficialRelease): GitHubRelease {
    const notesHtml = release.notesHtml
    const body = notesHtml?.en || release.notes?.en || notesHtml?.zh || release.notes?.zh || ''

    const assets = (release.assets ?? [])
      .map((asset) => {
        const downloadUrl = this.resolveOfficialAssetUrl(asset.downloadUrl)
        if (!downloadUrl) return null
        const signatureUrl = this.resolveOfficialAssetUrl(asset.signatureUrl ?? undefined)
        const arch = asset.arch === 'arm64' ? 'arm64' : 'x64'
        return {
          name: asset.filename,
          url: downloadUrl,
          size: asset.size,
          platform: asset.platform,
          arch,
          checksum: asset.sha256 ?? undefined,
          signatureUrl
        } as GitHubRelease['assets'][number]
      })
      .filter(Boolean) as GitHubRelease['assets']

    return {
      tag_name: release.tag,
      name: release.name || release.tag,
      published_at: release.publishedAt ?? release.createdAt,
      body,
      assets
    }
  }

  private resolveOfficialAssetUrl(path?: string | null): string | null {
    if (!path) return null
    if (/^https?:\/\//i.test(path)) return path
    const normalized = path.startsWith('/') ? path : `/${path}`
    return `${this.resolveOfficialBaseUrl()}${normalized}`
  }

  private resolveOfficialBaseUrl(): string {
    const configured = this.settings.source?.url
    if (configured) {
      return configured.replace(/\/$/, '')
    }
    return getTuffBaseUrl()
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
        type: UpdateProviderType.GITHUB,
        name: 'GitHub Releases',
        url: UPDATE_GITHUB_RELEASES_API,
        enabled: true,
        priority: 1
      },
      updateChannel: this.enforceChannelPreference(this.currentChannel),
      ignoredVersions: [],
      customSources: [],
      autoDownload: false,
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

  private getReleaseCacheFilePath(): string | null {
    if (!this.initContext) {
      return null
    }
    return path.join(this.initContext.app.rootPath, 'config', 'update-cache.json')
  }

  private async loadReleaseCache(): Promise<void> {
    const cacheFile = this.getReleaseCacheFilePath()
    if (!cacheFile) {
      return
    }
    try {
      if (!fs.existsSync(cacheFile)) {
        return
      }
      const raw = await fs.promises.readFile(cacheFile, 'utf8')
      const parsed = JSON.parse(raw)
      if (
        parsed &&
        typeof parsed === 'object' &&
        parsed.entries &&
        typeof parsed.entries === 'object'
      ) {
        const parsedStore: ReleaseCacheStore = {
          version: 1,
          entries: parsed.entries as ReleaseCacheStore['entries'],
          providerType: (parsed as ReleaseCacheStore).providerType,
          providerKey: (parsed as ReleaseCacheStore).providerKey
        }

        if (this.isReleaseCacheCompatible(parsedStore)) {
          this.releaseCacheStore = this.buildReleaseCacheStore(parsedStore.entries)
        } else {
          this.releaseCacheStore = this.buildReleaseCacheStore()
        }
      }
    } catch (error) {
      updateLog.warn('Failed to load update cache', { error })
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
    const cacheFile = this.getReleaseCacheFilePath()
    if (!cacheFile) {
      return
    }
    try {
      await fs.promises.mkdir(path.dirname(cacheFile), { recursive: true })
      await fs.promises.writeFile(cacheFile, JSON.stringify(this.releaseCacheStore, null, 2))
    } catch (error) {
      updateLog.warn('Failed to save update cache', { error })
    }
  }

  private clearReleaseCache(): void {
    this.releaseCacheStore = this.buildReleaseCacheStore()
    this.scheduleReleaseCacheSave()
  }

  private getReleaseCacheEntry(channel: AppPreviewChannel): ReleaseCacheEntry | null {
    return this.releaseCacheStore.entries[channel] ?? null
  }

  private setReleaseCacheEntry(channel: AppPreviewChannel, entry: ReleaseCacheEntry): void {
    if (!this.isReleaseCacheCompatible(this.releaseCacheStore)) {
      this.releaseCacheStore = this.buildReleaseCacheStore()
    }
    this.releaseCacheStore.entries[channel] = entry
    this.scheduleReleaseCacheSave()
  }

  private resolveCooldownUntil(rateLimit?: ReleaseCacheRateLimit): number | undefined {
    if (!this.settings.rateLimitEnabled) {
      return undefined
    }
    if (rateLimit?.remaining !== undefined && rateLimit.remaining <= 0 && rateLimit.resetAt) {
      return rateLimit.resetAt
    }
    return undefined
  }

  private extractRateLimitInfo(
    headers: Record<string, unknown>
  ): ReleaseCacheRateLimit | undefined {
    const remaining = this.getHeaderNumber(headers, 'x-ratelimit-remaining')
    const resetRaw = this.getHeaderNumber(headers, 'x-ratelimit-reset')
    if (remaining === undefined && resetRaw === undefined) {
      return undefined
    }
    return {
      remaining,
      resetAt: resetRaw ? resetRaw * 1000 : undefined
    }
  }

  private getHeaderValue(headers: Record<string, unknown>, key: string): string | undefined {
    const value = headers[key.toLowerCase()]
    if (Array.isArray(value)) {
      return typeof value[0] === 'string' ? value[0] : undefined
    }
    return typeof value === 'string' ? value : undefined
  }

  private getHeaderNumber(headers: Record<string, unknown>, key: string): number | undefined {
    const value = this.getHeaderValue(headers, key)
    if (!value) {
      return undefined
    }
    const parsed = Number.parseInt(value, 10)
    return Number.isNaN(parsed) ? undefined : parsed
  }

  private getErrorStatus(error: unknown): number | undefined {
    if (!(error instanceof Error)) {
      return undefined
    }
    const matched = error.message.match(/NETWORK_HTTP_STATUS_(\d{3})/)
    if (!matched) {
      return undefined
    }
    const status = Number.parseInt(matched[1], 10)
    return Number.isInteger(status) ? status : undefined
  }

  private getErrorHeaders(error: unknown): Record<string, unknown> | undefined {
    if (!error || typeof error !== 'object') {
      return undefined
    }
    const headers = (error as { headers?: unknown }).headers
    if (!headers || typeof headers !== 'object') {
      return undefined
    }
    return headers as Record<string, unknown>
  }

  private describeExpectedUpdateCheckFailure(error: unknown): {
    message: string
    meta: Record<string, string | number | boolean | null | undefined>
  } | null {
    const status = this.getErrorStatus(error)
    const headers = this.getErrorHeaders(error)
    const rateLimit = headers ? this.extractRateLimitInfo(headers) : undefined
    const retryAt = rateLimit?.resetAt ? new Date(rateLimit.resetAt).toISOString() : undefined

    if (status === 403 || status === 429) {
      return {
        message: 'Update check deferred by upstream rate limit',
        meta: {
          status,
          remaining: rateLimit?.remaining,
          retryAt
        }
      }
    }

    if (!(error instanceof Error) || !shouldDowngradeRemoteFailure(error.message)) {
      return null
    }

    return {
      message: 'Update check deferred by remote service availability',
      meta: {
        error: error.message
      }
    }
  }

  private isRetryableError(error: unknown): boolean {
    const status = this.getErrorStatus(error)
    if (status && (status >= 500 || status === 403 || status === 429)) {
      return true
    }

    if (!(error instanceof Error)) {
      return false
    }

    if (/NETWORK_TIMEOUT|timeout|etimedout/i.test(error.message)) {
      return true
    }

    if (/enotfound|econnreset|eai_again|network/i.test(error.message)) {
      return true
    }

    return false
  }

  private calculateRetryDelay(attempt: number, baseDelay: number): number {
    const delay = Math.min(baseDelay * 2 ** attempt, 60000)
    const jitter = Math.random() * 0.1 * delay
    return delay + jitter
  }

  private async sleep(delay: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  private recordFetchFailure(channel: AppPreviewChannel, error: unknown): void {
    if (this.settings.rateLimitEnabled) {
      const status = this.getErrorStatus(error)
      const headers = this.getErrorHeaders(error)
      if (status === 403 || status === 429) {
        const rateLimit = headers ? this.extractRateLimitInfo(headers) : undefined
        const cooldownUntil = rateLimit?.resetAt ?? Date.now() + 60 * 60 * 1000
        const fallbackEntry = this.getReleaseCacheEntry(channel) ?? {
          releases: [],
          fetchedAt: 0,
          ttlMinutes: this.settings.cacheTTL
        }
        this.setReleaseCacheEntry(channel, {
          ...fallbackEntry,
          rateLimit: rateLimit ?? fallbackEntry.rateLimit,
          cooldownUntil,
          failureCount: (fallbackEntry.failureCount ?? 0) + 1
        })
        return
      }
    }

    const fallbackEntry = this.getReleaseCacheEntry(channel) ?? {
      releases: [],
      fetchedAt: 0,
      ttlMinutes: this.settings.cacheTTL
    }
    const nextCount = Math.min((fallbackEntry.failureCount ?? 0) + 1, 4)
    const delays = [60_000, 300_000, 900_000, 3_600_000]
    const cooldownUntil = Date.now() + delays[nextCount - 1]
    this.setReleaseCacheEntry(channel, {
      ...fallbackEntry,
      failureCount: nextCount,
      cooldownUntil
    })
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
        if (typeof this.settings.rendererOverrideEnabled !== 'boolean') {
          this.settings.rendererOverrideEnabled = defaults.rendererOverrideEnabled
        }
        if (typeof this.settings.pendingInstallVersion !== 'string') {
          this.settings.pendingInstallVersion = defaults.pendingInstallVersion
        }

        this.macUpdateDownloadedVersion = null
        let shouldSaveSettings = persisted.updateChannel !== normalizedChannel

        const pendingVersion = (this.settings.pendingInstallVersion ?? '').trim()
        if (pendingVersion.length > 0) {
          if (!this.isUpdateCandidate(pendingVersion)) {
            this.settings.pendingInstallVersion = null
            shouldSaveSettings = true
          } else if (this.isMacAutoUpdaterEnabled()) {
            this.macUpdateDownloadedVersion = pendingVersion
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
