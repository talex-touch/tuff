import type {
  GitHubRelease,
  UpdateSettings as SharedUpdateSettings,
  UpdateCheckResult,
  UpdateFrequency,
  UpdateUserAction
} from '@talex-touch/utils'
import type { ModuleInitContext } from '@talex-touch/utils/types/modules'
import fs from 'node:fs'
import path from 'node:path'
import { AppPreviewChannel, ChannelType, DataCode, UpdateProviderType } from '@talex-touch/utils'
import axios from 'axios'
import { TalexEvents, UpdateAvailableEvent } from '../../core/eventbus/touch-event'
import { getAppVersionSafe } from '../../utils/version-util'
import { createLogger } from '../../utils/logger'
/**
 * Update service for checking application updates in main process
 */
import { BaseModule } from '../abstract-base-module'
import { databaseModule } from '../database'
import { UpdateSystem } from './update-system'
import { UpdateRecordStatus, UpdateRepository, type UpdateRecordRow } from './update-repository'

const updateLog = createLogger('UpdateService')
const pollingLog = updateLog.child('Polling')

const HALF_DAY_IN_MS = 12 * 60 * 60 * 1000
const DAY_IN_MS = 24 * 60 * 60 * 1000
const REMIND_LATER_INTERVAL = 8 * 60 * 60 * 1000

/**
 * Update settings interface
 */
type UpdateSettings = SharedUpdateSettings & {
  cacheEnabled: boolean
  cacheTTL: number // Cache TTL in minutes
  rateLimitEnabled: boolean
  maxRetries: number
  retryDelay: number // Base retry delay in milliseconds
  lastCheckedAt: number | null
}

/**
 * Polling service for periodic update checks
 */
class PollingService {
  private intervalId: NodeJS.Timeout | null = null
  private isRunning = false

  /**
   * Start polling service
   * @param interval - Polling interval in milliseconds
   * @param callback - Callback function to execute
   */
  start(interval: number, callback: () => Promise<void>): void {
    if (this.isRunning) {
      pollingLog.warn('Already running')
      return
    }

    this.isRunning = true
    this.intervalId = setInterval(async () => {
      try {
        await callback()
      } catch (error) {
        pollingLog.error('Polling error', { error })
      }
    }, interval)

    pollingLog.info(`Started with interval: ${interval}ms`)
  }

  /**
   * Stop polling service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.isRunning = false
    pollingLog.info('Stopped')
  }

  /**
   * Check if polling service is running
   */
  isActive(): boolean {
    return this.isRunning
  }

  /**
   * Get current interval ID
   */
  getIntervalId(): NodeJS.Timeout | null {
    return this.intervalId
  }
}

/**
 * Update service module
 */
export class UpdateServiceModule extends BaseModule<TalexEvents> {
  private pollingService: PollingService
  private settings: UpdateSettings
  private currentVersion: string
  private currentChannel: AppPreviewChannel
  private cache: Map<string, any> = new Map()
  private initContext?: ModuleInitContext<TalexEvents>
  private updateSystem?: UpdateSystem
  private updateRepository: UpdateRepository | null = null
  private readonly channelPriority: Record<AppPreviewChannel, number> = {
    [AppPreviewChannel.RELEASE]: 0,
    [AppPreviewChannel.BETA]: 1,
    [AppPreviewChannel.SNAPSHOT]: 2
  }

  constructor() {
    super(Symbol.for('UpdateService'))
    this.pollingService = new PollingService()
    this.currentVersion = this.getCurrentVersion()
    this.currentChannel = this.getCurrentChannel()
    this.settings = this.getDefaultSettings()
  }

  /**
   * Initialize update service
   */
  async onInit(ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    this.initContext = ctx
    updateLog.info('Initializing update service')

    // Initialize UpdateSystem with DownloadCenter integration
    const downloadCenterModule = ctx.manager.getModule(Symbol.for('DownloadCenter'))
      if (downloadCenterModule) {
        this.updateSystem = new UpdateSystem(downloadCenterModule, {
          autoDownload: false,
          autoCheck: this.settings.enabled,
          checkFrequency: this.mapFrequencyToCheckFrequency(this.settings.frequency),
          ignoredVersions: this.settings.ignoredVersions,
          updateChannel: this.settings.updateChannel
        })
        updateLog.success('UpdateSystem initialized with DownloadCenter integration')
      } else {
        updateLog.warn('DownloadCenter module not found, UpdateSystem not initialized')
      }

      try {
        this.updateRepository = new UpdateRepository(databaseModule.getDb())
        updateLog.success('UpdateRepository initialized')
      } catch (error) {
        updateLog.warn('Failed to initialize UpdateRepository', { error })
      }

    // Register IPC channels
    this.registerIpcChannels()

    // Load settings
    this.loadSettings()

    // Start polling as soon as the app boots
    if (this.settings.enabled) {
      this.startPolling()

      if (this.settings.frequency !== 'never') {
        setTimeout(() => {
          void this.checkForUpdates(true)
        }, 5000) // Delay 5 seconds after startup
      }
    }
  }

  /**
   * Destroy update service
   */
  async onDestroy(): Promise<void> {
    updateLog.info('Destroying update service')

    // Stop polling service
    this.pollingService.stop()

    // Clear cache if needed
    if (!this.settings.cacheEnabled) {
      this.cache.clear()
    }
  }

  /**
   * Register IPC channels for communication with renderer process
   */
  private registerIpcChannels(): void {
    if (!this.initContext) {
      throw new Error('[UpdateService] Context not initialized')
    }
    const touchApp = this.initContext.app as any
    const appChannel = touchApp.channel

    // Check for updates
    appChannel.regChannel(ChannelType.MAIN, 'update:check', async ({ data, reply }) => {
      const force = data?.force ?? false
      try {
        const result = await this.checkForUpdates(force)
        reply(DataCode.SUCCESS, { success: true, data: result })
      } catch (error) {
        updateLog.error('Update check failed', { error })
        reply(DataCode.ERROR, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Get update settings
    appChannel.regChannel(ChannelType.MAIN, 'update:get-settings', async ({ reply }) => {
      reply(DataCode.SUCCESS, { success: true, data: this.settings })
    })

    // Update settings
    appChannel.regChannel(ChannelType.MAIN, 'update:update-settings', async ({ data, reply }) => {
      const newSettings = data as Partial<UpdateSettings>
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

        // Restart polling if settings changed
        if (this.pollingService.isActive()) {
          this.pollingService.stop()
        }

        if (this.settings.enabled) {
          this.startPolling()
        }

        reply(DataCode.SUCCESS, { success: true })
      } catch (error) {
        updateLog.error('Failed to update settings', { error })
        reply(DataCode.ERROR, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Get update status
    appChannel.regChannel(ChannelType.MAIN, 'update:get-status', async ({ reply }) => {
      reply(DataCode.SUCCESS, {
        success: true,
        data: {
          enabled: this.settings.enabled,
          frequency: this.settings.frequency,
          source: this.settings.source,
          channel: this.getEffectiveChannel(),
          polling: this.pollingService.isActive(),
          lastCheck: this.settings.lastCheckedAt ?? null
        }
      })
    })

    // Clear update cache
    appChannel.regChannel(ChannelType.MAIN, 'update:clear-cache', async ({ reply }) => {
      try {
        this.cache.clear()
        reply(DataCode.SUCCESS, { success: true })
      } catch (error) {
        updateLog.error('Failed to clear cache', { error })
        reply(DataCode.ERROR, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    appChannel.regChannel(ChannelType.MAIN, 'update:get-cached-release', async ({ data, reply }) => {
      try {
        const requestedChannel = data?.channel as AppPreviewChannel | undefined
        const targetChannel = requestedChannel ?? this.getEffectiveChannel()
        const record = this.updateRepository ? await this.updateRepository.getLatestRecord(targetChannel) : null
        if (record) {
          const release = this.deserializeRelease(record.payload)
          reply(DataCode.SUCCESS, {
            success: true,
            data: release
              ? {
                  release,
                  status: record.status,
                  snoozeUntil: record.snoozeUntil ?? null,
                  fetchedAt: record.fetchedAt,
                  channel: record.channel,
                  tag: record.tag,
                  source: record.source
                }
              : null
          })
        } else {
          reply(DataCode.SUCCESS, { success: true, data: null })
        }
      } catch (error) {
        updateLog.error('Failed to get cached release', { error })
        reply(DataCode.ERROR, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    appChannel.regChannel(ChannelType.MAIN, 'update:record-action', async ({ data, reply }) => {
      try {
        const actionPayload = data as { tag: string; action: UpdateUserAction }
        if (!actionPayload?.tag || !actionPayload?.action) {
          throw new Error('Invalid action payload')
        }
        await this.handleUserAction(actionPayload.tag, actionPayload.action)
        reply(DataCode.SUCCESS, { success: true })
      } catch (error) {
        updateLog.error('Failed to record update action', { error })
        reply(DataCode.ERROR, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Download update
    appChannel.regChannel(ChannelType.MAIN, 'update:download', async ({ data, reply }) => {
      try {
        if (!this.updateSystem) {
          throw new Error('UpdateSystem not initialized')
        }
        const release = data as GitHubRelease
        const taskId = await this.updateSystem.downloadUpdate(release)
        reply(DataCode.SUCCESS, { success: true, taskId })
      } catch (error) {
        updateLog.error('Failed to download update', { error })
        reply(DataCode.ERROR, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Install update
    appChannel.regChannel(ChannelType.MAIN, 'update:install', async ({ data, reply }) => {
      try {
        if (!this.updateSystem) {
          throw new Error('UpdateSystem not initialized')
        }
        const taskId = data as string
        await this.updateSystem.installUpdate(taskId)
        reply(DataCode.SUCCESS, { success: true })
      } catch (error) {
        updateLog.error('Failed to install update', { error })
        reply(DataCode.ERROR, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Ignore version
    appChannel.regChannel(ChannelType.MAIN, 'update:ignore-version', async ({ data, reply }) => {
      try {
        if (!this.updateSystem) {
          throw new Error('UpdateSystem not initialized')
        }
        const version = data as string
        this.updateSystem.ignoreVersion(version)
        this.settings.ignoredVersions.push(version)
        this.saveSettings()
        reply(DataCode.SUCCESS, { success: true })
      } catch (error) {
        updateLog.error('Failed to ignore version', { error })
        reply(DataCode.ERROR, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Set auto download
    appChannel.regChannel(ChannelType.MAIN, 'update:set-auto-download', async ({ data, reply }) => {
      try {
        if (!this.updateSystem) {
          throw new Error('UpdateSystem not initialized')
        }
        const enabled = data as boolean
        this.updateSystem.setAutoDownload(enabled)
        reply(DataCode.SUCCESS, { success: true })
      } catch (error) {
        updateLog.error('Failed to set auto download', { error })
        reply(DataCode.ERROR, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Set auto check
    appChannel.regChannel(ChannelType.MAIN, 'update:set-auto-check', async ({ data, reply }) => {
      try {
        if (!this.updateSystem) {
          throw new Error('UpdateSystem not initialized')
        }
        const enabled = data as boolean
        this.updateSystem.setAutoCheck(enabled)
        this.settings.enabled = enabled
        this.saveSettings()

        // Restart or stop polling based on setting
        if (this.pollingService.isActive()) {
          this.pollingService.stop()
        }
        if (enabled) {
          this.startPolling()
        }

        reply(DataCode.SUCCESS, { success: true })
      } catch (error) {
        updateLog.error('Failed to set auto check', { error })
        reply(DataCode.ERROR, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })
  }

  /**
   * Start polling service based on frequency settings
   */
  private startPolling(): void {
    const interval = this.getFrequencyIntervalMs(this.settings.frequency)

    if (!interval) {
      updateLog.info(`Polling disabled for frequency: ${this.settings.frequency}`)
      return
    }

    this.pollingService.start(interval, async () => {
      await this.checkForUpdates()
    })
    updateLog.info(`Started polling with interval: ${interval / (60 * 60 * 1000)}h`)
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

    let performedNetworkCheck = false

    try {
      performedNetworkCheck = true
      const result = await this.fetchLatestRelease(targetChannel)
      this.recordCheckTimestamp()

      if (result.hasUpdate && result.release) {
        await this.persistRelease(targetChannel, result.release, result.source)
        if (this.updateRepository) {
          const persistedForRelease = await this.updateRepository.getRecordByTag(result.release.tag_name)
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
          if (this.settings.ignoredVersions.includes(result.release.tag_name)) {
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
      if (performedNetworkCheck) {
        this.recordCheckTimestamp()
      }
      updateLog.error('Update check failed', { error })

      const errorResult = {
        hasUpdate: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'Unknown'
      }

      return errorResult
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
    // Send update notification to all renderer windows
    const touchApp = this.initContext.app as any

    touchApp.channel.sendMain('update:available', {
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
    return `releases:talex-touch/tuff:${channel}`
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
  private async fetchLatestRelease(channel: AppPreviewChannel): Promise<UpdateCheckResult> {
    try {
      const response = await axios.get('https://api.github.com/repos/talex-touch/tuff/releases', {
        timeout: 8000,
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'TalexTouch-Updater/1.0'
        }
      })

      const releases: GitHubRelease[] = response.data

      if (!releases || !Array.isArray(releases)) {
        return {
          hasUpdate: false,
          error: 'Invalid response format from GitHub API',
          source: 'GitHub'
        }
      }

      // Filter releases by channel
      const channelReleases = releases.filter((release) => {
        const version = this.parseVersion(release.tag_name)
        return version.channel === channel
      })

      if (channelReleases.length === 0) {
        return {
          hasUpdate: false,
          error: `No releases found for channel: ${channel}`,
          source: 'GitHub'
        }
      }

      // Get latest release (first one)
      const latestRelease = channelReleases[0]

      return {
        hasUpdate: true,
        release: latestRelease,
        source: 'GitHub'
      }
    } catch (error) {
      updateLog.error('Failed to fetch latest release', { error })
      return {
        hasUpdate: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'GitHub'
      }
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

  private async buildResultFromRecord(record: UpdateRecordRow | null): Promise<UpdateCheckResult | null> {
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
  } {
    const version = versionStr.replaceAll('v', '')
    const versionArr = version.split('-')
    const versionNum = versionArr[0]
    const channelLabel = versionArr.length >= 2 ? versionArr[1] : undefined

    const versionNumArr = versionNum.split('.')

    return {
      channel: this.parseChannelLabel(channelLabel),
      major: +versionNumArr[0],
      minor: Number.parseInt(versionNumArr[1]),
      patch: Number.parseInt(versionNumArr[2])
    }
  }

  /**
   * Normalize channel text to the enum.
   */
  private parseChannelLabel(label?: string): AppPreviewChannel {
    const normalized = (label || '').toUpperCase()

    if (normalized.startsWith(AppPreviewChannel.SNAPSHOT)) {
      return AppPreviewChannel.SNAPSHOT
    }
    if (normalized.startsWith(AppPreviewChannel.BETA)) {
      return AppPreviewChannel.BETA
    }
    if (normalized === 'MASTER' || normalized.startsWith(AppPreviewChannel.RELEASE)) {
      return AppPreviewChannel.RELEASE
    }

    return AppPreviewChannel.RELEASE
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
  }): boolean {
    const currentVersion = this.parseVersion(this.currentVersion)

    // Compare versions (prioritize: channel > major > minor > patch)
    if (currentVersion.channel !== newVersion.channel) {
      return (
        this.getChannelPriority(newVersion.channel) >
        this.getChannelPriority(currentVersion.channel)
      )
    }

    if (currentVersion.major === newVersion.major) {
      if (currentVersion.minor === newVersion.minor) {
        if (currentVersion.patch === newVersion.patch) {
          return false
        } else {
          return newVersion.patch > currentVersion.patch
        }
      } else {
        return newVersion.minor > currentVersion.minor
      }
    } else {
      return newVersion.major > currentVersion.major
    }
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
    const versionArr = version.split('-')
    const channelLabel = versionArr.length >= 2 ? versionArr[1] : undefined
    return this.parseChannelLabel(channelLabel)
  }

  private enforceChannelPreference(preferred?: AppPreviewChannel): AppPreviewChannel {
    if (this.currentChannel === AppPreviewChannel.SNAPSHOT) {
      return AppPreviewChannel.SNAPSHOT
    }
    if (!preferred) {
      return AppPreviewChannel.RELEASE
    }
    return preferred
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
        url: 'https://api.github.com/repos/talex-touch/tuff/releases',
        enabled: true,
        priority: 1
      },
      updateChannel: this.enforceChannelPreference(this.currentChannel),
      ignoredVersions: [],
      customSources: [],
      cacheEnabled: true,
      cacheTTL: 30, // 30 minutes cache TTL
      rateLimitEnabled: true,
      maxRetries: 3,
      retryDelay: 2000, // 2 seconds base retry delay
      lastCheckedAt: null
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
    try {
      const configDir = path.join(this.initContext.app.rootPath, 'config')
      const settingsFile = path.join(configDir, 'update-settings.json')

      // Ensure config directory exists
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      fs.writeFileSync(settingsFile, JSON.stringify(this.settings, null, 2))
      updateLog.success(`Settings saved to: ${settingsFile}`)
    } catch (error) {
      updateLog.error('Failed to save settings', { error })
    }
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
        const persisted = JSON.parse(settingsData)
        this.settings = {
          ...defaults,
          ...persisted,
          updateChannel: this.enforceChannelPreference(persisted.updateChannel)
        }
        this.settings.frequency = this.normalizeFrequency(this.settings.frequency)
        if (typeof this.settings.lastCheckedAt !== 'number') {
          this.settings.lastCheckedAt = defaults.lastCheckedAt
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
