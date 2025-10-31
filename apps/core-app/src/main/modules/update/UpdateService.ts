/**
 * Update service for checking application updates in main process
 */
import { BaseModule } from '../abstract-base-module'
import { ModuleInitContext, ModuleDestroyContext } from '@talex-touch/utils/types/modules'
import { TouchEventBus, TalexEvents } from '../../core/eventbus/touch-event'
import { ChannelType } from '@talex-touch/utils'
import {
  UpdateSourceConfig,
  AppPreviewChannel,
  GitHubRelease,
  UpdateCheckResult,
  UpdateProviderType
} from '@talex-touch/utils'
import { getAppVersionSafe } from '../../utils/version-util'
import axios from 'axios'
import fs from 'fs'
import path from 'path'

/**
 * Update settings interface
 */
interface UpdateSettings {
  enabled: boolean
  frequency: 'startup' | 'daily' | 'weekly' | 'monthly' | 'never'
  source: UpdateSourceConfig
  crossChannel: boolean
  ignoredVersions: string[]
  cacheEnabled: boolean
  cacheTTL: number // Cache TTL in minutes
  rateLimitEnabled: boolean
  maxRetries: number
  retryDelay: number // Base retry delay in milliseconds
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
      console.warn('[PollingService] Already running')
      return
    }

    this.isRunning = true
    this.intervalId = setInterval(async () => {
      try {
        await callback()
      } catch (error) {
        console.error('[PollingService] Polling error:', error)
      }
    }, interval)

    console.log(`[PollingService] Started with interval: ${interval}ms`)
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
    console.log('[PollingService] Stopped')
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
export class UpdateServiceModule extends BaseModule {
  private pollingService: PollingService
  private settings: UpdateSettings
  private currentVersion: string
  private currentChannel: AppPreviewChannel
  private cache: Map<string, any> = new Map()
  private lastCheckTimes: Map<string, number> = new Map()

  constructor() {
    super()
    this.pollingService = new PollingService()
    this.settings = this.getDefaultSettings()
    this.currentVersion = this.getCurrentVersion()
    this.currentChannel = this.getCurrentChannel()
  }

  /**
   * Initialize update service
   */
  async onInit(ctx: ModuleInitContext): Promise<void> {
    console.log('[UpdateService] Initializing update service')

    // Register IPC channels
    this.registerIpcChannels()

    // Start polling if enabled
    if (this.settings.enabled && this.settings.frequency !== 'never') {
      this.startPolling()
    }

    // Check for updates on startup if frequency is 'startup'
    if (this.settings.enabled && this.settings.frequency === 'startup') {
      setTimeout(() => this.checkForUpdates(), 5000) // Delay 5 seconds after startup
    }
  }

  /**
   * Destroy update service
   */
  async onDestroy(ctx: ModuleDestroyContext): Promise<void> {
    console.log('[UpdateService] Destroying update service')

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
    const { regChannel } = this.touchChannel

    // Check for updates
    regChannel(ChannelType.MAIN, 'update:check', async (force = false) => {
      try {
        const result = await this.checkForUpdates(force)
        return { success: true, data: result }
      } catch (error) {
        console.error('[UpdateService] Update check failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    })

    // Get update settings
    regChannel(ChannelType.MAIN, 'update:get-settings', async () => {
      return { success: true, data: this.settings }
    })

    // Update settings
    regChannel(
      ChannelType.MAIN,
      'update:update-settings',
      async (newSettings: Partial<UpdateSettings>) => {
        try {
          this.settings = { ...this.settings, ...newSettings }
          this.saveSettings()

          // Restart polling if settings changed
          if (this.pollingService.isActive()) {
            this.pollingService.stop()
          }

          if (this.settings.enabled && this.settings.frequency !== 'never') {
            this.startPolling()
          }

          return { success: true }
        } catch (error) {
          console.error('[UpdateService] Failed to update settings:', error)
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      }
    )

    // Get update status
    regChannel(ChannelType.MAIN, 'update:get-status', async () => {
      return {
        success: true,
        data: {
          enabled: this.settings.enabled,
          frequency: this.settings.frequency,
          source: this.settings.source,
          polling: this.pollingService.isActive(),
          lastCheck: this.lastCheckTimes.get('github-releases') || null
        }
      }
    })

    // Clear update cache
    regChannel(ChannelType.MAIN, 'update:clear-cache', async () => {
      try {
        this.cache.clear()
        return { success: true }
      } catch (error) {
        console.error('[UpdateService] Failed to clear cache:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    })
  }

  /**
   * Start polling service based on frequency settings
   */
  private startPolling(): void {
    const intervals = {
      daily: 24 * 60 * 60 * 1000, // 24 hours
      weekly: 7 * 24 * 60 * 60 * 1000, // 7 days
      monthly: 30 * 24 * 60 * 60 * 1000 // 30 days
    }

    const interval = intervals[this.settings.frequency]
    if (interval) {
      this.pollingService.start(interval, () => this.checkForUpdates())
      console.log(`[UpdateService] Started polling with frequency: ${this.settings.frequency}`)
    }
  }

  /**
   * Check for updates
   * @param force - Force check regardless of frequency settings
   * @returns Update check result
   */
  private async checkForUpdates(force = false): Promise<UpdateCheckResult> {
    try {
      // Check frequency settings
      if (!force && !this.shouldCheck('github-releases', this.settings.frequency)) {
        const cachedResult = this.getCachedResult()
        if (cachedResult) {
          console.log('[UpdateService] Using cached result due to frequency settings')
          return cachedResult
        }
      }

      // Check cache first
      if (this.settings.cacheEnabled && !force) {
        const cachedResult = this.getCachedResult()
        if (cachedResult) {
          console.log('[UpdateService] Using cached result')
          return cachedResult
        }
      }

      // Perform actual update check
      const result = await this.fetchLatestRelease()

      if (result.hasUpdate && result.release) {
        const newVersion = this.parseVersion(result.release.tag_name)

        // Check if update is needed
        if (this.isUpdateNeeded(newVersion)) {
          // Check if version is ignored
          if (this.settings.ignoredVersions.includes(result.release.tag_name)) {
            const ignoredResult = {
              hasUpdate: false,
              error: 'Version ignored by user',
              source: result.source
            }

            // Cache the result
            if (this.settings.cacheEnabled) {
              this.setCachedResult(ignoredResult)
            }

            return ignoredResult
          }

          // Cache the result
          if (this.settings.cacheEnabled) {
            this.setCachedResult(result)
          }

          // Record the check
          this.recordCheck('github-releases')

          // Notify renderer process about available update
          this.notifyRendererAboutUpdate(result)

          return result
        }
      }

      const noUpdateResult = {
        hasUpdate: false,
        error: 'No update available',
        source: result.source
      }

      // Cache the result
      if (this.settings.cacheEnabled) {
        this.setCachedResult(noUpdateResult)
      }

      // Record the check
      this.recordCheck('github-releases')

      return noUpdateResult
    } catch (error) {
      console.error('[UpdateService] Update check failed:', error)

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
  private notifyRendererAboutUpdate(result: UpdateCheckResult): void {
    // Send update notification to all renderer windows
    const { sendToAllWindows } = this.touchChannel

    sendToAllWindows('update:available', {
      hasUpdate: true,
      release: result.release,
      source: result.source
    })

    // Emit event for other modules
    TouchEventBus.emit(TalexEvents.APP_UPDATE_AVAILABLE, result)
  }

  /**
   * Check if update check should be performed based on frequency settings
   * @param key - Unique key for the check
   * @param frequency - Frequency type
   * @returns True if check should be performed
   */
  private shouldCheck(
    key: string,
    frequency: keyof typeof UpdateServiceModule.prototype.frequencyTypes
  ): boolean {
    const lastCheckTime = this.lastCheckTimes.get(key) || 0
    const now = Date.now()
    const interval = this.frequencyTypes[frequency]

    // For startup frequency, only check if never checked before
    if (frequency === 'startup') {
      return lastCheckTime === 0
    }

    return now - lastCheckTime >= interval
  }

  /**
   * Record that a check was performed
   * @param key - Unique key for the check
   */
  private recordCheck(key: string): void {
    this.lastCheckTimes.set(key, Date.now())
  }

  /**
   * Get cached result
   */
  private getCachedResult(): UpdateCheckResult | null {
    const cacheKey = this.getCacheKey()
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
  private setCachedResult(data: UpdateCheckResult): void {
    const cacheKey = this.getCacheKey()
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
  private getCacheKey(): string {
    return `releases:talex-touch/tuff:${this.currentChannel}`
  }

  /**
   * Fetch latest release from GitHub API
   */
  private async fetchLatestRelease(): Promise<UpdateCheckResult> {
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
        return version.channel === this.currentChannel
      })

      if (channelReleases.length === 0) {
        return {
          hasUpdate: false,
          error: `No releases found for channel: ${this.currentChannel}`,
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
      console.error('[UpdateService] Failed to fetch latest release:', error)
      return {
        hasUpdate: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'GitHub'
      }
    }
  }

  /**
   * Frequency types and their intervals in milliseconds
   */
  private readonly frequencyTypes = {
    startup: 0, // Only on startup
    daily: 24 * 60 * 60 * 1000, // 24 hours
    weekly: 7 * 24 * 60 * 60 * 1000, // 7 days
    monthly: 30 * 24 * 60 * 60 * 1000, // 30 days
    never: Number.MAX_SAFE_INTEGER // Never
  } as const

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
    const channel =
      versionArr.length === 2 ? versionArr[1] || AppPreviewChannel.MASTER : AppPreviewChannel.MASTER

    const versionNumArr = versionNum.split('.')

    return {
      channel: channel as AppPreviewChannel,
      major: +versionNumArr[0],
      minor: parseInt(versionNumArr[1]),
      patch: parseInt(versionNumArr[2])
    }
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
      return newVersion.channel > currentVersion.channel
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
    return versionArr.length === 2
      ? (versionArr[1] as AppPreviewChannel) || AppPreviewChannel.MASTER
      : AppPreviewChannel.MASTER
  }

  /**
   * Get default update settings
   */
  private getDefaultSettings(): UpdateSettings {
    return {
      enabled: true,
      frequency: 'weekly', // Changed from 'startup' to 'weekly' to reduce API calls
      source: {
        type: UpdateProviderType.GITHUB,
        name: 'GitHub Releases',
        url: 'https://api.github.com/repos/talex-touch/tuff/releases',
        enabled: true,
        priority: 1
      },
      crossChannel: false,
      ignoredVersions: [],
      cacheEnabled: true,
      cacheTTL: 30, // 30 minutes cache TTL
      rateLimitEnabled: true,
      maxRetries: 3,
      retryDelay: 2000 // 2 seconds base retry delay
    }
  }

  /**
   * Save settings to file
   */
  private saveSettings(): void {
    try {
      const configDir = path.join(this.appDataPath, 'config')
      const settingsFile = path.join(configDir, 'update-settings.json')

      // Ensure config directory exists
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      fs.writeFileSync(settingsFile, JSON.stringify(this.settings, null, 2))
      console.log('[UpdateService] Settings saved to:', settingsFile)
    } catch (error) {
      console.error('[UpdateService] Failed to save settings:', error)
    }
  }

  /**
   * Load settings from file
   */
  private loadSettings(): void {
    try {
      const configDir = path.join(this.appDataPath, 'config')
      const settingsFile = path.join(configDir, 'update-settings.json')

      if (fs.existsSync(settingsFile)) {
        const settingsData = fs.readFileSync(settingsFile, 'utf8')
        this.settings = { ...this.getDefaultSettings(), ...JSON.parse(settingsData) }
        console.log('[UpdateService] Settings loaded from:', settingsFile)
      }
    } catch (error) {
      console.error('[UpdateService] Failed to load settings:', error)
      this.settings = this.getDefaultSettings()
    }
  }
}

// Export module instance
export const updateServiceModule = new UpdateServiceModule()
