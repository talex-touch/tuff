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
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { UpdateEvents } from '@talex-touch/utils/transport/events'
import axios from 'axios'
import { and, desc, eq } from 'drizzle-orm'
import { app, Notification } from 'electron'
import { autoUpdater } from 'electron-updater'
import { TalexEvents, touchEventBus, UpdateAvailableEvent } from '../../core/eventbus/touch-event'
import { downloadTasks } from '../../db/schema'
import { createLogger } from '../../utils/logger'
import { getAppVersionSafe } from '../../utils/version-util'
/**
 * Update service for checking application updates in main process
 */
import { BaseModule } from '../abstract-base-module'
import { databaseModule } from '../database'
import { UpdateRecordStatus, UpdateRepository } from './update-repository'
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
  entries: Partial<Record<AppPreviewChannel, ReleaseCacheEntry>>
}

interface UpdateFetchResult {
  result: UpdateCheckResult
  usedNetwork: boolean
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
  private readonly channelPriority: Record<AppPreviewChannel, number> = {
    [AppPreviewChannel.RELEASE]: 0,
    [AppPreviewChannel.BETA]: 1,
    [AppPreviewChannel.SNAPSHOT]: 1
  }
  private readonly onMacUpdateDownloaded = (info: { version?: string }): void => {
    const version = info?.version || 'unknown'
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

    const channel =
      (ctx.app as { channel?: unknown } | null | undefined)?.channel ??
      ($app as { channel?: unknown } | null | undefined)?.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    this.transport = getTuffTransportMain(channel, keyManager)
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
        try {
          const channel = this.getEffectiveChannel()

          if (!force) {
            const quickResult = await this.getQuickUpdateCheckResult(channel)

            if (app.isPackaged) {
              this.queueBackgroundUpdateCheck()
            }

            return { success: true, data: quickResult }
          }

          const result = await this.checkForUpdates(true)
          return { success: true, data: result }
        } catch (error) {
          updateLog.error('Update check failed', { error })
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      }),

      tx.on(UpdateEvents.getSettings, async () => {
        return { success: true, data: this.settings }
      }),

      tx.on(
        UpdateEvents.updateSettings,
        async (payload: { settings?: Partial<UpdateSettings> }) => {
          const newSettings = payload?.settings ?? {}
          try {
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
            }

            if (this.pollingService.isRegistered(UPDATE_POLL_TASK_ID)) {
              this.pollingService.unregister(UPDATE_POLL_TASK_ID)
            }
            if (this.settings.enabled) {
              this.startPolling()
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
        try {
          if (this.isMacAutoUpdaterEnabled()) {
            if (this.updateSystem) {
              await this.updateSystem.scheduleRendererOverride(release)
            }
            await this.downloadMacUpdate(release)
            return { success: true }
          }
          if (!this.updateSystem) {
            throw new Error('UpdateSystem not initialized')
          }
          const taskId = await this.updateSystem.downloadUpdate(release)
          return { success: true, data: { taskId } }
        } catch (error) {
          updateLog.error('Failed to download update', { error })
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      }),

      tx.on(UpdateEvents.install, async (payload) => {
        try {
          if (this.isMacAutoUpdaterEnabled()) {
            await this.installMacUpdate()
            return { success: true }
          }
          if (!this.updateSystem) {
            throw new Error('UpdateSystem not initialized')
          }
          if (!payload?.taskId) {
            throw new Error('Missing update task id')
          }
          await this.updateSystem.installUpdate(payload.taskId)
          return { success: true }
        } catch (error) {
          updateLog.error('Failed to install update', { error })
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
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
        error: 'No update available',
        source: result.source
      }

      if (this.settings.cacheEnabled) {
        this.setCachedResult(targetChannel, noUpdateResult)
      }

      return noUpdateResult
    } catch (error) {
      this.recordCheckTimestamp()
      updateLog.error('Update check failed', { error })

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
      } catch (error) {
        updateLog.warn('Auto download failed (macOS autoUpdater)', { error, meta: { tag } })
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
    } catch (error) {
      updateLog.warn('Auto download failed', { error, meta: { tag } })
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
      return {
        downloadReady: true,
        version: this.macUpdateDownloadedVersion,
        taskId: null
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

  private isSameVersionToken(versionA: string, versionB: string): boolean {
    const normalize = (value: string): string => value.trim().replace(/^v/i, '').toLowerCase()
    return normalize(versionA) === normalize(versionB)
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
    return `releases:${UPDATE_GITHUB_REPO}:${channel}`
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
    const source = this.settings.source?.name ?? 'GitHub'
    const force = options?.force ?? false
    const cacheEntry = this.getReleaseCacheEntry(channel)
    const now = Date.now()

    if (!force && this.settings.cacheEnabled && cacheEntry?.releases?.length) {
      const ttlMs = this.settings.cacheTTL * 60 * 1000
      if (now - cacheEntry.fetchedAt <= ttlMs) {
        return {
          usedNetwork: false,
          result: {
            hasUpdate: true,
            release: cacheEntry.releases[0],
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
        return {
          usedNetwork: false,
          result: {
            hasUpdate: true,
            release: cacheEntry.releases[0],
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

        const response = await axios.get(UPDATE_GITHUB_RELEASES_API, {
          timeout: 8000,
          headers,
          validateStatus: (status) => status === 200 || status === 304
        })

        const rateLimit = this.extractRateLimitInfo(response.headers)
        const etag = this.getHeaderValue(response.headers, 'etag')
        const lastModified = this.getHeaderValue(response.headers, 'last-modified')

        if (response.status === 304) {
          if (cacheEntry?.releases?.length) {
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
                release: cacheEntry.releases[0],
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
            release: channelReleases[0],
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
      return {
        usedNetwork: false,
        result: {
          hasUpdate: true,
          release: cacheEntry.releases[0],
          source
        }
      }
    }

    if (lastError instanceof Error) {
      throw lastError
    }

    throw new Error('Failed to fetch latest release')
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
    const { version, channelLabel } = splitUpdateTag(versionStr)
    const versionNum = version

    const versionNumArr = versionNum.split('.')

    return {
      channel: this.parseChannelLabel(channelLabel),
      major: +versionNumArr[0],
      minor: Number.parseInt(versionNumArr[1]),
      patch: Number.parseInt(versionNumArr[2]),
      raw: versionStr
    }
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
    if (channel === null || channel === undefined) {
      return undefined
    }

    if (typeof channel === 'number') {
      switch (channel) {
        case 0:
          return AppPreviewChannel.RELEASE
        case 1:
        case 2:
          return AppPreviewChannel.BETA
        default:
          return undefined
      }
    }

    if (typeof channel === 'string') {
      const trimmed = channel.trim()
      if (!trimmed) {
        return undefined
      }

      if (/^\d+$/.test(trimmed)) {
        return this.normalizeStoredChannel(Number.parseInt(trimmed, 10))
      }

      return resolveUpdateChannelLabel(trimmed)
    }

    return undefined
  }

  private enforceChannelPreference(preferred?: unknown): AppPreviewChannel {
    const normalizedPreferred = this.normalizeStoredChannel(preferred)

    // Snapshot channel is currently disabled; fallback to beta.
    if (this.currentChannel === AppPreviewChannel.SNAPSHOT) {
      return AppPreviewChannel.BETA
    }
    if (!normalizedPreferred) {
      return AppPreviewChannel.RELEASE
    }
    if (normalizedPreferred === AppPreviewChannel.SNAPSHOT) {
      return AppPreviewChannel.BETA
    }
    return normalizedPreferred
  }

  private compareSemverVersions(a: string | undefined, b: string | undefined): -1 | 0 | 1 {
    if (!a && !b) return 0
    if (!a) return -1
    if (!b) return 1

    const parsedA = this.parseSemverVersion(a)
    const parsedB = this.parseSemverVersion(b)

    if (parsedA.major !== parsedB.major) {
      return parsedA.major < parsedB.major ? -1 : 1
    }
    if (parsedA.minor !== parsedB.minor) {
      return parsedA.minor < parsedB.minor ? -1 : 1
    }
    if (parsedA.patch !== parsedB.patch) {
      return parsedA.patch < parsedB.patch ? -1 : 1
    }

    return this.comparePrereleases(parsedA.prerelease, parsedB.prerelease)
  }

  private parseSemverVersion(version: string): {
    major: number
    minor: number
    patch: number
    prerelease: string[]
  } {
    const cleaned = version.replace(/^v/i, '').trim()
    const [main, prerelease] = cleaned.split('-', 2)
    const [major = 0, minor = 0, patch = 0] = (main || '')
      .split('.')
      .map((value) => Number.parseInt(value, 10) || 0)

    return {
      major,
      minor,
      patch,
      prerelease: prerelease ? prerelease.split('.') : []
    }
  }

  private comparePrereleases(a: string[], b: string[]): -1 | 0 | 1 {
    if (a.length === 0 && b.length > 0) return 1
    if (a.length > 0 && b.length === 0) return -1
    if (a.length === 0 && b.length === 0) return 0

    const maxLen = Math.max(a.length, b.length)
    for (let index = 0; index < maxLen; index += 1) {
      const aPart = a[index]
      const bPart = b[index]

      if (aPart === undefined) return -1
      if (bPart === undefined) return 1

      const aNum = Number.parseInt(aPart, 10)
      const bNum = Number.parseInt(bPart, 10)
      const aIsNum = !Number.isNaN(aNum)
      const bIsNum = !Number.isNaN(bNum)

      if (aIsNum && !bIsNum) return -1
      if (!aIsNum && bIsNum) return 1

      if (aIsNum && bIsNum) {
        if (aNum < bNum) return -1
        if (aNum > bNum) return 1
        continue
      }

      if (aPart < bPart) return -1
      if (aPart > bPart) return 1
    }

    return 0
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
        this.releaseCacheStore = {
          version: 1,
          entries: parsed.entries as ReleaseCacheStore['entries']
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
    this.releaseCacheStore = { version: 1, entries: {} }
    this.scheduleReleaseCacheSave()
  }

  private getReleaseCacheEntry(channel: AppPreviewChannel): ReleaseCacheEntry | null {
    return this.releaseCacheStore.entries[channel] ?? null
  }

  private setReleaseCacheEntry(channel: AppPreviewChannel, entry: ReleaseCacheEntry): void {
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

  private isRetryableError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false
    }
    const status = error.response?.status
    if (status && status >= 500) {
      return true
    }
    if (status === 403 || status === 429) {
      return true
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return true
    }
    if (error.request && !error.response) {
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
    if (this.settings.rateLimitEnabled && axios.isAxiosError(error)) {
      const status = error.response?.status
      const headers = error.response?.headers as Record<string, unknown> | undefined
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
        if (typeof this.settings.pendingInstallVersion !== 'string') {
          this.settings.pendingInstallVersion = defaults.pendingInstallVersion
        }

        this.macUpdateDownloadedVersion = null
        let shouldSaveSettings = persisted.updateChannel !== normalizedChannel

        const pendingVersion = (this.settings.pendingInstallVersion ?? '').trim()
        if (pendingVersion.length > 0) {
          if (this.isSameVersionToken(pendingVersion, this.currentVersion)) {
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
