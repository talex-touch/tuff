import type { DownloadRequest, GitHubRelease, UpdateCheckResult } from '@talex-touch/utils'
import * as crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { AppPreviewChannel, DownloadModule, DownloadPriority } from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import axios from 'axios'
import { app, shell } from 'electron'
import { getAppVersionSafe } from '../../utils/version-util'
import { SignatureVerifier } from '../../utils/release-signature'

/**
 * Version information interface
 */
interface VersionInfo {
  channel: AppPreviewChannel
  major: number
  minor: number
  patch: number
  raw: string
}

/**
 * Update system configuration
 */
interface UpdateSystemConfig {
  autoDownload: boolean
  autoCheck: boolean
  checkFrequency: 'startup' | 'daily' | 'weekly' | 'never'
  ignoredVersions: string[]
  updateChannel: AppPreviewChannel
}

/**
 * Release asset with platform information
 */
interface ReleaseAsset {
  name: string
  url: string
  size: number
  platform: string
  arch: string
  checksum?: string
  signatureUrl?: string
  signatureKeyUrl?: string
}

/**
 * UpdateSystem - Application update management system
 *
 * Manages application updates by integrating with the DownloadCenter module.
 * Provides automatic update detection, download, and installation capabilities.
 *
 * Key Features:
 * - GitHub Releases API integration
 * - Multi-channel support (RELEASE, BETA, SNAPSHOT)
 * - Semantic version comparison
 * - SHA256 checksum verification
 * - Platform-specific installer detection
 * - High-priority download queue integration
 * - Automatic and manual update modes
 *
 * Update Flow:
 * 1. Check for updates via GitHub API
 * 2. Compare versions and filter by channel
 * 3. Download update package via DownloadCenter (high priority)
 * 4. Verify checksum
 * 5. Notify user and trigger installation
 *
 * @see README.md for usage examples
 * @see ../download/API.md for DownloadCenter integration
 */
export class UpdateSystem {
  private config: UpdateSystemConfig
  private currentVersion: VersionInfo
  private downloadCenterModule: any
  private notificationService: any
  private readonly pollingService = PollingService.getInstance()
  private readonly signatureVerifier = new SignatureVerifier()

  /** Channel priority for version comparison (lower = more stable) */
  private readonly channelPriority: Record<AppPreviewChannel, number> = {
    [AppPreviewChannel.RELEASE]: 0,
    [AppPreviewChannel.BETA]: 1,
    [AppPreviewChannel.SNAPSHOT]: 2
  }

  /**
   * Create UpdateSystem instance
   * @param downloadCenterModule - DownloadCenter module instance for download management
   * @param config - Optional configuration overrides
   */
  constructor(downloadCenterModule: any, config?: Partial<UpdateSystemConfig>) {
    this.downloadCenterModule = downloadCenterModule
    this.notificationService = downloadCenterModule.getNotificationService()
    this.currentVersion = this.parseVersion(getAppVersionSafe())
    this.config = {
      autoDownload: false,
      autoCheck: true,
      checkFrequency: 'startup',
      ignoredVersions: [],
      updateChannel: this.currentVersion.channel,
      ...config
    }
  }

  /**
   * Check for available updates
   * @returns Update check result with release information
   */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    try {
      const targetChannel = this.getEffectiveChannel()
      const releases = await this.fetchGitHubReleases()

      // Filter releases by channel
      const channelReleases = releases.filter((release) => {
        const version = this.parseVersion(release.tag_name)
        return version.channel === targetChannel
      })

      if (channelReleases.length === 0) {
        return {
          hasUpdate: false,
          error: `No releases found for channel: ${targetChannel}`,
          source: 'GitHub'
        }
      }

      // Get latest release
      const latestRelease = channelReleases[0]
      const latestVersion = this.parseVersion(latestRelease.tag_name)

      // Check if update is needed
      if (this.isUpdateNeeded(latestVersion)) {
        // Check if version is ignored
        if (this.config.ignoredVersions.includes(latestRelease.tag_name)) {
          return {
            hasUpdate: false,
            error: 'Version ignored by user',
            source: 'GitHub'
          }
        }

        // Show update available notification
        if (this.notificationService) {
          this.notificationService.showUpdateAvailableNotification(
            latestRelease.tag_name,
            latestRelease.body
          )
        }

        return {
          hasUpdate: true,
          release: latestRelease,
          source: 'GitHub'
        }
      }

      return {
        hasUpdate: false,
        error: 'No update available',
        source: 'GitHub'
      }
    } catch (error) {
      console.error('[UpdateSystem] Failed to check for updates:', error)
      return {
        hasUpdate: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'GitHub'
      }
    }
  }

  /**
   * Download update package
   * @param release - GitHub release to download
   * @returns Task ID of the download
   */
  async downloadUpdate(release: GitHubRelease): Promise<string> {
    try {
      // Find appropriate asset for current platform
      const asset = this.findAssetForPlatform(release.assets)

      if (!asset) {
        throw new Error('No compatible asset found for current platform')
      }

      // Create download request with high priority
      const request: DownloadRequest = {
        url: asset.url,
        destination: await this.getUpdateDownloadPath(),
        filename: asset.name,
        priority: DownloadPriority.CRITICAL,
        module: DownloadModule.APP_UPDATE,
        metadata: {
          version: release.tag_name,
          releaseDate: release.published_at,
          checksum: asset.checksum,
          signatureUrl: asset.signatureUrl,
          signatureKeyUrl: asset.signatureKeyUrl
        },
        checksum: asset.checksum
      }

      // Add download task to DownloadCenter
      const taskId = await this.downloadCenterModule.addTask(request)

      // Set up listener for download completion
      this.setupDownloadCompletionListener(taskId, release.tag_name)

      console.log(`[UpdateSystem] Update download started: ${taskId}`)
      return taskId
    } catch (error) {
      console.error('[UpdateSystem] Failed to download update:', error)
      throw error
    }
  }

  /**
   * Set up listener for download completion to show notification
   * @private
   */
  private setupDownloadCompletionListener(taskId: string, version: string): void {
    // Listen for download completion event
    const pollTaskId = `update-system.download.${taskId}`
    if (this.pollingService.isRegistered(pollTaskId)) {
      this.pollingService.unregister(pollTaskId)
    }

    this.pollingService.register(
      pollTaskId,
      () => {
        const task = this.downloadCenterModule.getTaskStatus(taskId)

        if (!task) {
          this.pollingService.unregister(pollTaskId)
          return
        }

        if (task.status === 'completed') {
          this.pollingService.unregister(pollTaskId)

          // Show update download complete notification
          if (this.notificationService) {
            this.notificationService.showUpdateDownloadCompleteNotification(version, taskId)
          }
        } else if (task.status === 'failed' || task.status === 'cancelled') {
          this.pollingService.unregister(pollTaskId)
        }
      },
      { interval: 1, unit: 'seconds' }
    )
    this.pollingService.start()
  }

  /**
   * Install update package
   * @param taskId - Download task ID
   */
  async installUpdate(taskId: string): Promise<void> {
    try {
      const task = this.downloadCenterModule.getTaskStatus(taskId)

      if (!task) {
        throw new Error(`Task ${taskId} not found`)
      }

      if (task.status !== 'completed') {
        throw new Error(`Task ${taskId} is not completed`)
      }

      // Verify checksum if available
      if (task.metadata?.checksum) {
        const filePath = path.join(task.destination, task.filename)
        const isValid = await this.verifyChecksum(filePath, task.metadata.checksum)

        if (!isValid) {
          throw new Error('Checksum verification failed')
        }
      }

      const signatureUrl = task.metadata?.signatureUrl
      if (signatureUrl) {
        const filePath = path.join(task.destination, task.filename)
        const verifyResult = await this.signatureVerifier.verifyFileSignature(
          filePath,
          signatureUrl,
          task.metadata?.signatureKeyUrl
        )

        if (!verifyResult.valid) {
          console.warn('[UpdateSystem] Signature verification failed:', verifyResult.reason)
        }
      }

      // Trigger installation (platform-specific)
      await this.triggerInstallation(task.destination, task.filename)

      console.log(`[UpdateSystem] Update installation triggered for task: ${taskId}`)
    } catch (error) {
      console.error('[UpdateSystem] Failed to install update:', error)
      throw error
    }
  }

  /**
   * Set auto download preference
   */
  setAutoDownload(enabled: boolean): void {
    this.config.autoDownload = enabled
  }

  /**
   * Set auto check preference
   */
  setAutoCheck(enabled: boolean): void {
    this.config.autoCheck = enabled
  }

  /**
   * Set check frequency
   */
  setCheckFrequency(frequency: 'startup' | 'daily' | 'weekly' | 'never'): void {
    this.config.checkFrequency = frequency
  }

  /**
   * Get current version
   */
  getCurrentVersion(): string {
    return this.currentVersion.raw
  }

  /**
   * Compare two versions
   * @returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  compareVersions(v1: string, v2: string): number {
    const version1 = this.parseVersion(v1)
    const version2 = this.parseVersion(v2)

    // Compare channel priority first
    const channelDiff =
      this.channelPriority[version1.channel] - this.channelPriority[version2.channel]
    if (channelDiff !== 0) {
      return channelDiff > 0 ? 1 : -1
    }

    // Compare major version
    if (version1.major !== version2.major) {
      return version1.major > version2.major ? 1 : -1
    }

    // Compare minor version
    if (version1.minor !== version2.minor) {
      return version1.minor > version2.minor ? 1 : -1
    }

    // Compare patch version
    if (version1.patch !== version2.patch) {
      return version1.patch > version2.patch ? 1 : -1
    }

    return 0
  }

  /**
   * Ignore a specific version
   */
  ignoreVersion(version: string): void {
    if (!this.config.ignoredVersions.includes(version)) {
      this.config.ignoredVersions.push(version)
    }
  }

  /**
   * Get configuration
   */
  getConfig(): UpdateSystemConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<UpdateSystemConfig>): void {
    this.config = { ...this.config, ...config }
  }

  // Private helper methods

  /**
   * Fetch releases from GitHub API
   */
  private async fetchGitHubReleases(): Promise<GitHubRelease[]> {
    try {
      const response = await axios.get('https://api.github.com/repos/talex-touch/tuff/releases', {
        timeout: 10000,
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'TalexTouch-Updater/2.0'
        }
      })

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid response format from GitHub API')
      }

      return response.data
    } catch (error) {
      console.error('[UpdateSystem] Failed to fetch GitHub releases:', error)
      throw error
    }
  }

  /**
   * Parse version string to version object
   */
  private parseVersion(versionStr: string): VersionInfo {
    const version = versionStr.replace(/^v/, '')
    const parts = version.split('-')
    const versionNum = parts[0]
    const channelLabel = parts.length >= 2 ? parts[1] : undefined

    const [major, minor, patch] = versionNum.split('.').map((n) => Number.parseInt(n, 10))

    return {
      channel: this.parseChannelLabel(channelLabel),
      major: major || 0,
      minor: minor || 0,
      patch: patch || 0,
      raw: versionStr
    }
  }

  /**
   * Parse channel label to enum
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

  /**
   * Check if update is needed
   */
  private isUpdateNeeded(newVersion: VersionInfo): boolean {
    // Compare channel priority
    const currentChannelPriority = this.channelPriority[this.currentVersion.channel]
    const newChannelPriority = this.channelPriority[newVersion.channel]

    if (currentChannelPriority !== newChannelPriority) {
      return newChannelPriority > currentChannelPriority
    }

    // Compare version numbers
    if (this.currentVersion.major !== newVersion.major) {
      return newVersion.major > this.currentVersion.major
    }

    if (this.currentVersion.minor !== newVersion.minor) {
      return newVersion.minor > this.currentVersion.minor
    }

    if (this.currentVersion.patch !== newVersion.patch) {
      return newVersion.patch > this.currentVersion.patch
    }

    return false
  }

  /**
   * Get effective update channel
   */
  private getEffectiveChannel(): AppPreviewChannel {
    // If current version is SNAPSHOT, always check SNAPSHOT channel
    if (this.currentVersion.channel === AppPreviewChannel.SNAPSHOT) {
      return AppPreviewChannel.SNAPSHOT
    }

    // Otherwise use configured channel
    return this.config.updateChannel || AppPreviewChannel.RELEASE
  }

  /**
   * Find appropriate asset for current platform
   */
  private findAssetForPlatform(assets: any[]): ReleaseAsset | null {
    const platform = process.platform
    const arch = process.arch

    // Map platform names
    const platformMap: Record<string, string> = {
      darwin: 'mac',
      win32: 'win',
      linux: 'linux'
    }

    const platformName = platformMap[platform] || platform
    const signatureMap = new Map<string, string>()

    for (const asset of assets) {
      const name = String(asset?.name || '')
      if (!name) {
        continue
      }

      if (this.isSignatureAsset(name)) {
        const url = asset.browser_download_url || asset.url
        if (url) {
          signatureMap.set(this.normalizeAssetKey(this.stripSignatureSuffix(name)), url)
        }
      }
    }

    // Find matching asset
    for (const asset of assets) {
      const name = String(asset?.name || '')
      if (!name) {
        continue
      }

      if (this.isSignatureAsset(name) || this.isChecksumAsset(name)) {
        continue
      }

      const normalizedName = name.toLowerCase()

      // Check platform match
      if (!normalizedName.includes(platformName)) {
        continue
      }

      // Check architecture match (if specified)
      if (arch === 'arm64' && !normalizedName.includes('arm64')) {
        continue
      }
      if (arch === 'x64' && normalizedName.includes('arm64')) {
        continue
      }

      const signatureUrl = asset.signatureUrl || signatureMap.get(this.normalizeAssetKey(name))
      const signatureKeyUrl = asset.signatureKeyUrl
      const checksum =
        typeof asset.sha256 === 'string'
          ? asset.sha256
          : typeof asset.checksum === 'string'
            ? asset.checksum
            : undefined

      return {
        name: asset.name,
        url: asset.browser_download_url || asset.url,
        size: asset.size,
        platform: platformName,
        arch,
        checksum,
        signatureUrl,
        signatureKeyUrl
      }
    }

    return null
  }

  private isSignatureAsset(filename: string): boolean {
    const lower = filename.toLowerCase()
    return lower.endsWith('.sig') || lower.endsWith('.sig.txt') || lower.endsWith('.asc')
  }

  private stripSignatureSuffix(filename: string): string {
    return filename.replace(/\.(sig|asc)(\.txt)?$/i, '')
  }

  private isChecksumAsset(filename: string): boolean {
    const lower = filename.toLowerCase()
    return (
      lower.endsWith('.sha256') ||
      lower.endsWith('.sha1') ||
      lower.endsWith('.md5') ||
      lower.endsWith('.sha256.txt') ||
      lower.endsWith('.sha1.txt') ||
      lower.endsWith('.md5.txt') ||
      lower.endsWith('.sha256sum') ||
      lower.endsWith('.sha1sum') ||
      lower.endsWith('.md5sum')
    )
  }

  private normalizeAssetKey(filename: string): string {
    return filename.toLowerCase()
  }

  /**
   * Get update download path
   */
  private async getUpdateDownloadPath(): Promise<string> {
    const downloadPath = path.join(app.getPath('downloads'), 'tuff-updates')

    try {
      await fs.mkdir(downloadPath, { recursive: true })
    } catch (error) {
      console.error('[UpdateSystem] Failed to create download directory:', error)
    }

    return downloadPath
  }

  /**
   * Verify file checksum
   */
  private async verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
    try {
      const fileBuffer = await fs.readFile(filePath)
      const hash = crypto.createHash('sha256')
      hash.update(fileBuffer)
      const actualChecksum = hash.digest('hex')

      return actualChecksum.toLowerCase() === expectedChecksum.toLowerCase()
    } catch (error) {
      console.error('[UpdateSystem] Failed to verify checksum:', error)
      return false
    }
  }

  /**
   * Trigger installation (platform-specific)
   */
  private async triggerInstallation(destination: string, filename: string): Promise<void> {
    const filePath = path.join(destination, filename)
    await shell.openPath(filePath)
    console.log(`[UpdateSystem] Opened installer: ${filePath}`)
  }
}
