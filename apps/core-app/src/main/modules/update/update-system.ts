import type {
  DownloadRequest,
  GitHubRelease,
  UpdateCheckResult,
  UpdateArtifactComponent
} from '@talex-touch/utils'
import type { DownloadCenterModule } from '../download/download-center'
import type { NotificationService } from '../download/notification-service'
import { spawn } from 'node:child_process'
import * as crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import {
  AppPreviewChannel,
  DownloadModule,
  DownloadPriority,
  DownloadStatus,
  UPDATE_GITHUB_RELEASES_API,
  UPDATE_RELEASE_MANIFEST_NAME,
  type UpdateReleaseArtifact,
  type UpdateReleaseManifest,
  resolveUpdateChannelLabel,
  splitUpdateTag
} from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import axios from 'axios'
import compressing from 'compressing'
import { and, eq } from 'drizzle-orm'
import { app, shell } from 'electron'
import fse from 'fs-extra'
import { downloadTasks } from '../../db/schema'
import { SignatureVerifier } from '../../utils/release-signature'
import { getAppVersionSafe } from '../../utils/version-util'
import { databaseModule } from '../database'

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
  storageRoot?: string
}

const RENDERER_OVERRIDE_STATE_FILE = 'renderer-override.json'
const RENDERER_OVERRIDE_DIR = 'renderer-override'
const ENABLE_RENDERER_OVERRIDE = process.env.TUFF_ENABLE_RENDERER_OVERRIDE === '1'

interface RendererOverrideState {
  version: string
  path: string
  coreRange?: string
  enabled: boolean
  updatedAt: number
  lastError?: string
  sourceTag?: string
  sha256?: string
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
  browser_download_url?: string
  sha256?: string
  signatureUrl?: string
  signatureKeyUrl?: string
  component?: UpdateArtifactComponent
  coreRange?: string
}

/**
 * UpdateSystem - Application update management system
 *
 * Manages application updates by integrating with the DownloadCenter module.
 * Provides automatic update detection, download, and installation capabilities.
 *
 * Key Features:
 * - GitHub Releases API integration
 * - Multi-channel support (RELEASE, BETA; SNAPSHOT falls back to BETA)
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
  private downloadCenterModule: DownloadCenterModule
  private notificationService: NotificationService
  private readonly pollingService = PollingService.getInstance()
  private readonly signatureVerifier = new SignatureVerifier()
  private readonly storageRoot: string

  /** Channel priority for version comparison (lower = more stable) */
  private readonly channelPriority: Record<AppPreviewChannel, number> = {
    [AppPreviewChannel.RELEASE]: 0,
    [AppPreviewChannel.BETA]: 1,
    [AppPreviewChannel.SNAPSHOT]: 1
  }

  /**
   * Create UpdateSystem instance
   * @param downloadCenterModule - DownloadCenter module instance for download management
   * @param config - Optional configuration overrides
   */
  constructor(downloadCenterModule: DownloadCenterModule, config?: Partial<UpdateSystemConfig>) {
    this.downloadCenterModule = downloadCenterModule
    this.notificationService = downloadCenterModule.getNotificationService()
    this.currentVersion = this.parseVersion(getAppVersionSafe())
    this.storageRoot = config?.storageRoot ?? app.getPath('userData')
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
      const { release: resolvedRelease, manifest } = await this.attachReleaseManifest(release)

      const reusableTaskId = await this.findReusableUpdateTaskId(resolvedRelease.tag_name)
      if (reusableTaskId) {
        this.setupDownloadCompletionListener(reusableTaskId, resolvedRelease.tag_name)
        console.log(`[UpdateSystem] Reusing existing update task: ${reusableTaskId}`)
        return reusableTaskId
      }

      // Find appropriate asset for current platform
      const asset = this.findAssetForPlatform(resolvedRelease.assets)

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
          version: resolvedRelease.tag_name,
          releaseDate: resolvedRelease.published_at,
          checksum: asset.checksum,
          signatureUrl: asset.signatureUrl,
          signatureKeyUrl: asset.signatureKeyUrl
        },
        checksum: asset.checksum
      }

      // Add download task to DownloadCenter
      const taskId = await this.downloadCenterModule.addTask(request)

      // Set up listener for download completion
      this.setupDownloadCompletionListener(taskId, resolvedRelease.tag_name)

      void this.maybeScheduleRendererOverrideDownload(resolvedRelease, manifest).catch((error) => {
        console.warn('[UpdateSystem] Renderer override scheduling failed:', error)
      })

      console.log(`[UpdateSystem] Update download started: ${taskId}`)
      return taskId
    } catch (error) {
      console.error('[UpdateSystem] Failed to download update:', error)
      throw error
    }
  }

  private async findReusableUpdateTaskId(tag: string): Promise<string | null> {
    const tasks = this.downloadCenterModule.getAllTasks()

    for (const task of tasks) {
      if (task.module !== DownloadModule.APP_UPDATE) {
        continue
      }

      const version = typeof task.metadata?.version === 'string' ? task.metadata.version : ''
      if (version !== tag) {
        continue
      }

      if (task.status === DownloadStatus.COMPLETED) {
        const filePath = path.join(task.destination, task.filename)
        if (await this.fileExists(filePath)) {
          return task.id
        }
        continue
      }

      if (
        task.status === DownloadStatus.PENDING ||
        task.status === DownloadStatus.DOWNLOADING ||
        task.status === DownloadStatus.PAUSED
      ) {
        return task.id
      }
    }

    return null
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.stat(filePath)
      return true
    } catch {
      return false
    }
  }

  async scheduleRendererOverride(release: GitHubRelease): Promise<void> {
    if (!ENABLE_RENDERER_OVERRIDE) {
      return
    }

    try {
      const { release: resolvedRelease, manifest } = await this.attachReleaseManifest(release)
      await this.maybeScheduleRendererOverrideDownload(resolvedRelease, manifest)
    } catch (error) {
      console.warn('[UpdateSystem] Failed to schedule renderer override:', error)
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

  private async maybeScheduleRendererOverrideDownload(
    release: GitHubRelease,
    manifest: UpdateReleaseManifest | null
  ): Promise<void> {
    if (!ENABLE_RENDERER_OVERRIDE) {
      return
    }

    const artifact = this.resolveManifestArtifact(manifest, 'renderer')
    if (!artifact) {
      return
    }

    if (!artifact.coreRange) {
      console.warn('[UpdateSystem] Renderer artifact missing coreRange, skipping.')
      return
    }
    if (!artifact.sha256) {
      console.warn('[UpdateSystem] Renderer artifact missing sha256, skipping.')
      return
    }

    if (!this.isCoreRangeCompatible(artifact.coreRange)) {
      console.info(
        `[UpdateSystem] Renderer coreRange "${artifact.coreRange}" not satisfied by current core, skipping.`
      )
      return
    }

    const asset = this.resolveAssetByName(release.assets as ReleaseAsset[], artifact.name)
    if (!asset) {
      console.warn('[UpdateSystem] Renderer asset not found in release:', artifact.name)
      return
    }

    const url = this.resolveAssetUrl(asset)
    if (!url) {
      console.warn('[UpdateSystem] Renderer asset missing download url:', artifact.name)
      return
    }

    const versionToken = this.resolveReleaseVersionToken(release, manifest)
    const currentOverride = await this.readRendererOverrideState()
    if (
      currentOverride?.enabled &&
      currentOverride.version === versionToken &&
      currentOverride.coreRange === artifact.coreRange
    ) {
      console.log('[UpdateSystem] Renderer override already active, skipping download.')
      return
    }

    const request: DownloadRequest = {
      url,
      destination: await this.getUpdateDownloadPath(),
      filename: asset.name,
      priority: DownloadPriority.NORMAL,
      module: DownloadModule.RESOURCE_DOWNLOAD,
      metadata: {
        component: 'renderer',
        version: versionToken,
        releaseTag: release.tag_name,
        coreRange: artifact.coreRange,
        checksum: artifact.sha256,
        signatureUrl: asset.signatureUrl,
        signatureKeyUrl: asset.signatureKeyUrl
      },
      checksum: artifact.sha256
    }

    const taskId = await this.downloadCenterModule.addTask(request)
    this.setupAuxDownloadListener(taskId, async (task) => {
      await this.installRendererOverride(task, artifact, release, manifest)
    })
  }

  private resolveManifestArtifact(
    manifest: UpdateReleaseManifest | null,
    component: UpdateArtifactComponent
  ): UpdateReleaseArtifact | null {
    if (!manifest?.artifacts?.length) {
      return null
    }

    return manifest.artifacts.find((artifact) => artifact?.component === component) ?? null
  }

  private resolveAssetByName(assets: ReleaseAsset[], name: string): ReleaseAsset | null {
    const key = this.normalizeAssetKey(name)
    return assets.find((asset) => this.normalizeAssetKey(String(asset?.name || '')) === key) ?? null
  }

  private resolveAssetUrl(asset: ReleaseAsset): string | null {
    return asset.browser_download_url || asset.url || null
  }

  private setupAuxDownloadListener(
    taskId: string,
    onCompleted: (task: {
      destination: string
      filename: string
      metadata?: Record<string, unknown>
    }) => Promise<void>
  ): void {
    const pollTaskId = `update-system.aux.${taskId}`
    if (this.pollingService.isRegistered(pollTaskId)) {
      this.pollingService.unregister(pollTaskId)
    }

    this.pollingService.register(
      pollTaskId,
      () => {
        const task = this.downloadCenterModule.getTaskStatus(taskId) as
          | {
              status?: string
              destination: string
              filename: string
              metadata?: Record<string, unknown>
            }
          | undefined

        if (!task) {
          this.pollingService.unregister(pollTaskId)
          return
        }

        if (task.status === 'completed') {
          this.pollingService.unregister(pollTaskId)
          void onCompleted(task).catch((error) => {
            console.warn('[UpdateSystem] Auxiliary install failed:', error)
          })
        } else if (task.status === 'failed' || task.status === 'cancelled') {
          this.pollingService.unregister(pollTaskId)
        }
      },
      { interval: 1, unit: 'seconds' }
    )
    this.pollingService.start()
  }

  private async installRendererOverride(
    task: { destination: string; filename: string; metadata?: Record<string, unknown> },
    artifact: UpdateReleaseArtifact,
    release: GitHubRelease,
    manifest: UpdateReleaseManifest | null
  ): Promise<void> {
    const filePath = path.join(task.destination, task.filename)

    if (artifact.sha256) {
      const valid = await this.verifyChecksum(filePath, artifact.sha256)
      if (!valid) {
        throw new Error('Renderer override checksum verification failed')
      }
    }

    const signatureUrl = task.metadata?.signatureUrl
    if (typeof signatureUrl === 'string' && signatureUrl.length > 0) {
      const verifyResult = await this.signatureVerifier.verifyFileSignature(
        filePath,
        signatureUrl,
        typeof task.metadata?.signatureKeyUrl === 'string'
          ? task.metadata?.signatureKeyUrl
          : undefined
      )
      if (!verifyResult.valid) {
        console.warn('[UpdateSystem] Renderer override signature verification failed:', {
          reason: verifyResult.reason
        })
      }
    }

    const tempDir = path.join(os.tmpdir(), `talex-touch-renderer-${Date.now()}`)
    try {
      await fse.ensureDir(tempDir)
      await compressing.zip.uncompress(filePath, tempDir)

      const bundleRoot = await this.resolveRendererBundleRoot(tempDir)
      if (!bundleRoot) {
        throw new Error('Renderer override bundle missing index.html')
      }

      const versionToken = this.resolveReleaseVersionToken(release, manifest)
      const targetDir = path.join(
        this.resolveRendererOverrideRoot(),
        `${versionToken}-${Date.now()}`
      )

      await fse.ensureDir(targetDir)
      await fse.copy(bundleRoot, targetDir, { overwrite: true })

      await this.writeRendererOverrideState({
        version: versionToken,
        path: targetDir,
        coreRange: artifact.coreRange,
        enabled: true,
        updatedAt: Date.now(),
        sourceTag: release.tag_name,
        sha256: artifact.sha256
      })

      console.log('[UpdateSystem] Renderer override installed', {
        version: versionToken,
        path: targetDir
      })
    } finally {
      await fse.remove(tempDir).catch(() => null)
    }
  }

  private resolveReleaseVersionToken(
    release: GitHubRelease,
    manifest?: UpdateReleaseManifest | null
  ): string {
    const raw =
      manifest?.release?.version || splitUpdateTag(release.tag_name).version || release.tag_name
    return String(raw)
      .replace(/^v/, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
  }

  private resolveRendererOverrideRoot(): string {
    return path.join(this.storageRoot, 'modules', RENDERER_OVERRIDE_DIR)
  }

  private resolveRendererOverrideStatePath(): string {
    return path.join(this.storageRoot, 'config', RENDERER_OVERRIDE_STATE_FILE)
  }

  private async readRendererOverrideState(): Promise<RendererOverrideState | null> {
    const statePath = this.resolveRendererOverrideStatePath()
    try {
      const content = await fs.readFile(statePath, 'utf8')
      const parsed = JSON.parse(content) as RendererOverrideState
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
      return null
    } catch {
      return null
    }
  }

  private async writeRendererOverrideState(state: RendererOverrideState): Promise<void> {
    const statePath = this.resolveRendererOverrideStatePath()
    await fs.mkdir(path.dirname(statePath), { recursive: true })
    await fs.writeFile(statePath, JSON.stringify(state, null, 2))
  }

  private async resolveRendererBundleRoot(tempDir: string): Promise<string | null> {
    const directIndex = path.join(tempDir, 'index.html')
    if (await fse.pathExists(directIndex)) {
      return tempDir
    }

    const entries = await fse.readdir(tempDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const candidate = path.join(tempDir, entry.name)
      if (await fse.pathExists(path.join(candidate, 'index.html'))) {
        return candidate
      }
    }

    return null
  }

  /**
   * Install update package
   * @param taskId - Download task ID
   */
  async installUpdate(taskId: string): Promise<void> {
    try {
      const task = await this.resolveInstallTask(taskId)

      if (!task) {
        throw new Error(`Task ${taskId} not found`)
      }

      if (task.status !== DownloadStatus.COMPLETED) {
        throw new Error(`Task ${taskId} is not completed`)
      }

      const filePath = path.join(task.destination, task.filename)
      if (!(await this.fileExists(filePath))) {
        throw new Error(`Update package not found: ${filePath}`)
      }

      const checksum = typeof task.metadata?.checksum === 'string' ? task.metadata.checksum : null
      if (checksum) {
        const isValid = await this.verifyChecksum(filePath, checksum)

        if (!isValid) {
          throw new Error('Checksum verification failed')
        }
      }

      const signatureUrl =
        typeof task.metadata?.signatureUrl === 'string' ? task.metadata.signatureUrl : undefined
      if (signatureUrl) {
        const verifyResult = await this.signatureVerifier.verifyFileSignature(
          filePath,
          signatureUrl,
          typeof task.metadata?.signatureKeyUrl === 'string'
            ? task.metadata.signatureKeyUrl
            : undefined
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

  private async resolveInstallTask(taskId: string): Promise<{
    status: string
    destination: string
    filename: string
    metadata?: Record<string, unknown>
  } | null> {
    const runtimeTask = this.downloadCenterModule.getTaskStatus(taskId)
    if (runtimeTask) {
      return {
        status: runtimeTask.status,
        destination: runtimeTask.destination,
        filename: runtimeTask.filename,
        metadata: this.parseUpdateTaskMetadata(runtimeTask.metadata)
      }
    }

    try {
      const db = databaseModule.getDb()
      const records = await db
        .select({
          status: downloadTasks.status,
          destination: downloadTasks.destination,
          filename: downloadTasks.filename,
          metadata: downloadTasks.metadata
        })
        .from(downloadTasks)
        .where(
          and(eq(downloadTasks.id, taskId), eq(downloadTasks.module, DownloadModule.APP_UPDATE))
        )
        .limit(1)

      const record = records[0]
      if (!record) {
        return null
      }

      return {
        status: record.status,
        destination: record.destination,
        filename: record.filename,
        metadata: this.parseUpdateTaskMetadata(record.metadata)
      }
    } catch (error) {
      console.warn('[UpdateSystem] Failed to query update task from database:', error)
      return null
    }
  }

  private parseUpdateTaskMetadata(metadata: unknown): Record<string, unknown> | undefined {
    if (!metadata) {
      return undefined
    }

    if (typeof metadata === 'object' && !Array.isArray(metadata)) {
      return metadata as Record<string, unknown>
    }

    if (typeof metadata !== 'string') {
      return undefined
    }

    try {
      const parsed = JSON.parse(metadata)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch (error) {
      console.warn('[UpdateSystem] Failed to parse update task metadata:', error)
    }

    return undefined
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
      const response = await axios.get(UPDATE_GITHUB_RELEASES_API, {
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

  private async attachReleaseManifest(
    release: GitHubRelease
  ): Promise<{ release: GitHubRelease; manifest: UpdateReleaseManifest | null }> {
    const manifest = await this.fetchReleaseManifest(release.assets)
    if (!manifest) {
      return { release, manifest: null }
    }

    const assetMap = new Map<string, ReleaseAsset>()
    for (const asset of release.assets as ReleaseAsset[]) {
      const name = String(asset?.name || '')
      if (name) {
        assetMap.set(this.normalizeAssetKey(name), asset)
      }
    }

    const manifestMap = new Map<string, UpdateReleaseArtifact>()
    for (const artifact of manifest.artifacts) {
      if (artifact?.name) {
        manifestMap.set(this.normalizeAssetKey(artifact.name), artifact)
      }
    }

    for (const asset of release.assets as ReleaseAsset[]) {
      const name = String(asset?.name || '')
      if (!name) {
        continue
      }
      const manifestEntry = manifestMap.get(this.normalizeAssetKey(name))
      if (!manifestEntry) {
        continue
      }

      asset.sha256 = manifestEntry.sha256
      asset.checksum = manifestEntry.sha256
      asset.component = manifestEntry.component
      asset.coreRange = manifestEntry.coreRange

      if (manifestEntry.signature) {
        const signatureAsset = assetMap.get(this.normalizeAssetKey(manifestEntry.signature))
        const signatureUrl = signatureAsset?.browser_download_url || signatureAsset?.url
        if (signatureUrl) {
          asset.signatureUrl = signatureUrl
        }
      }

      if (manifestEntry.signatureKey) {
        const signatureKeyAsset = assetMap.get(this.normalizeAssetKey(manifestEntry.signatureKey))
        const signatureKeyUrl = signatureKeyAsset?.browser_download_url || signatureKeyAsset?.url
        if (signatureKeyUrl) {
          asset.signatureKeyUrl = signatureKeyUrl
        }
      }
    }

    return { release, manifest }
  }

  private async fetchReleaseManifest(
    assets: ReleaseAsset[]
  ): Promise<UpdateReleaseManifest | null> {
    const manifestAsset = assets.find(
      (asset) => this.normalizeAssetKey(String(asset?.name || '')) === UPDATE_RELEASE_MANIFEST_NAME
    )
    if (!manifestAsset) {
      return null
    }

    const manifestUrl = manifestAsset.browser_download_url || manifestAsset.url
    if (!manifestUrl) {
      return null
    }

    try {
      const response = await axios.get(manifestUrl, { timeout: 8000 })
      const manifest = response.data

      if (!this.isReleaseManifest(manifest)) {
        console.warn('[UpdateSystem] Invalid release manifest format')
        return null
      }

      return manifest
    } catch (error) {
      console.warn('[UpdateSystem] Failed to fetch release manifest:', error)
      return null
    }
  }

  private isReleaseManifest(payload: unknown): payload is UpdateReleaseManifest {
    if (!payload || typeof payload !== 'object') {
      return false
    }

    const candidate = payload as { schemaVersion?: unknown; artifacts?: unknown }
    if (candidate.schemaVersion !== 1) {
      return false
    }

    return Array.isArray(candidate.artifacts)
  }

  /**
   * Parse version string to version object
   */
  private parseVersion(versionStr: string): VersionInfo {
    const { version, channelLabel } = splitUpdateTag(versionStr)
    const versionNum = version

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
    return resolveUpdateChannelLabel(label)
  }

  private isCoreRangeCompatible(coreRange?: string): boolean {
    if (!coreRange || !coreRange.trim()) {
      return false
    }
    return this.satisfiesVersionRange(this.currentVersion.raw, coreRange)
  }

  private satisfiesVersionRange(version: string, range: string): boolean {
    const normalized = range.trim()
    if (!normalized) return false

    const orGroups = normalized
      .split('||')
      .map((part) => part.trim())
      .filter(Boolean)

    if (!orGroups.length) return false

    return orGroups.some((group) => {
      const tokens = group.split(/\s+/).filter(Boolean)
      if (!tokens.length) return false
      return tokens.every((token) => this.evaluateRangeToken(version, token))
    })
  }

  private evaluateRangeToken(version: string, token: string): boolean {
    const match = token.match(/^(>=|<=|>|<|=)?\s*(.+)$/)
    if (!match) return false

    const operator = match[1] ?? '='
    const target = match[2]?.trim()
    if (!target) return false

    const comparison = this.compareSemverVersions(version, target)

    switch (operator) {
      case '>':
        return comparison === 1
      case '>=':
        return comparison === 1 || comparison === 0
      case '<':
        return comparison === -1
      case '<=':
        return comparison === -1 || comparison === 0
      case '=':
      default:
        return comparison === 0
    }
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

    return this.compareSemverVersions(newVersion.raw, this.currentVersion.raw) === 1
  }

  /**
   * Get effective update channel
   */
  private getEffectiveChannel(): AppPreviewChannel {
    // Snapshot channel is currently disabled; fallback to beta.
    if (this.currentVersion.channel === AppPreviewChannel.SNAPSHOT) {
      return AppPreviewChannel.BETA
    }

    if (this.config.updateChannel === AppPreviewChannel.SNAPSHOT) {
      return AppPreviewChannel.BETA
    }

    // Otherwise use configured channel
    return this.config.updateChannel || AppPreviewChannel.RELEASE
  }

  /**
   * Find appropriate asset for current platform
   */
  private findAssetForPlatform(assets: ReleaseAsset[]): ReleaseAsset | null {
    const platform = process.platform
    const arch: 'x64' | 'arm64' = process.arch === 'arm64' ? 'arm64' : 'x64'

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

    const candidates: Array<{ asset: ReleaseAsset; score: number }> = []

    for (const asset of assets) {
      const name = String(asset?.name || '')
      if (!name) {
        continue
      }

      if (
        this.isSignatureAsset(name) ||
        this.isChecksumAsset(name) ||
        this.isManifestAsset(name) ||
        this.isMetadataAsset(name)
      ) {
        continue
      }

      const normalizedName = name.toLowerCase()

      if (asset.component && asset.component !== 'core') {
        continue
      }

      if (!asset.component && this.isAuxiliaryComponentAsset(normalizedName)) {
        continue
      }

      if (!this.matchesPlatform(normalizedName, platform)) {
        continue
      }

      if (!this.matchesArch(normalizedName, arch)) {
        continue
      }

      const downloadUrl = asset.browser_download_url || asset.url
      if (!downloadUrl) {
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

      const candidate: ReleaseAsset = {
        name: asset.name,
        url: downloadUrl,
        size: asset.size,
        platform,
        arch,
        checksum,
        signatureUrl,
        signatureKeyUrl,
        component: asset.component,
        coreRange: asset.coreRange
      }

      candidates.push({
        asset: candidate,
        score: this.calculateAssetScore(normalizedName, asset, platform)
      })
    }

    if (!candidates.length) {
      return null
    }

    candidates.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      return (right.asset.size || 0) - (left.asset.size || 0)
    })

    return candidates[0].asset
  }

  private matchesPlatform(filename: string, platform: string): boolean {
    const platformTokensMap: Record<string, string[]> = {
      darwin: ['darwin', 'macos', 'mac', 'osx'],
      win32: ['win32', 'windows', 'win'],
      linux: ['linux', 'ubuntu', 'debian']
    }

    const tokens = platformTokensMap[platform] || [platform]
    return tokens.some((token) => filename.includes(token))
  }

  private matchesArch(filename: string, arch: 'x64' | 'arm64'): boolean {
    const hasArm64Token = filename.includes('arm64') || filename.includes('aarch64')
    const hasX64Token =
      filename.includes('x64') || filename.includes('amd64') || filename.includes('x86_64')

    if (!hasArm64Token && !hasX64Token) {
      return true
    }

    if (arch === 'arm64') {
      return hasArm64Token
    }

    return hasX64Token && !hasArm64Token
  }

  private calculateAssetScore(filename: string, asset: ReleaseAsset, platform: string): number {
    let score = 0

    if (asset.component === 'core') {
      score += 200
    }

    if (filename.includes('tuff')) {
      score += 20
    }

    if (filename.includes('latest-release')) {
      score += 10
    }

    score += this.getInstallerExtensionScore(filename, platform)

    return score
  }

  private getInstallerExtensionScore(filename: string, platform: string): number {
    if (platform === 'darwin') {
      if (filename.endsWith('.app.zip')) return 180
      if (filename.endsWith('.dmg')) return 140
      if (filename.endsWith('.pkg')) return 130
      if (filename.endsWith('.zip')) return 90
      return 0
    }

    if (platform === 'win32') {
      if (filename.endsWith('.exe')) return 140
      if (filename.endsWith('.msi')) return 130
      if (filename.endsWith('.zip')) return 90
      if (filename.endsWith('.7z')) return 80
      return 0
    }

    if (filename.endsWith('.appimage')) return 140
    if (filename.endsWith('.deb')) return 130
    if (filename.endsWith('.rpm')) return 120
    if (filename.endsWith('.tar.gz') || filename.endsWith('.tgz')) return 100
    if (filename.endsWith('.zip')) return 80
    return 0
  }

  private isManifestAsset(filename: string): boolean {
    return this.normalizeAssetKey(filename) === UPDATE_RELEASE_MANIFEST_NAME
  }

  private isMetadataAsset(filename: string): boolean {
    const lower = filename.toLowerCase()

    return (
      lower.endsWith('.yml') ||
      lower.endsWith('.yaml') ||
      lower.endsWith('.json') ||
      lower.endsWith('.blockmap') ||
      lower.includes('builder-debug')
    )
  }

  private isAuxiliaryComponentAsset(filename: string): boolean {
    return (
      filename.includes('renderer') ||
      filename.includes('extensions') ||
      filename.includes('extension')
    )
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
    const downloadPath = path.join(this.storageRoot, 'modules', 'update-packages')

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
    if (process.platform === 'darwin' && (await this.tryInstallMacAppBundle(filePath))) {
      return
    }
    await shell.openPath(filePath)
    console.log(`[UpdateSystem] Opened installer: ${filePath}`)
  }

  private async tryInstallMacAppBundle(packagePath: string): Promise<boolean> {
    const lower = packagePath.toLowerCase()
    if (!app.isPackaged || (!lower.endsWith('.app') && !lower.endsWith('.zip'))) {
      return false
    }

    const targetAppPath = this.resolveCurrentMacAppBundlePath()
    if (!targetAppPath) {
      return false
    }

    const stageRoot = path.join(
      this.storageRoot,
      'modules',
      'update-packages',
      '.mac-install-stage',
      `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
    )

    try {
      await fse.ensureDir(stageRoot)

      const scriptPath = path.join(stageRoot, 'apply-update.sh')
      const logPath = path.join(stageRoot, 'apply-update.log')
      const scriptContent = [
        '#!/bin/bash',
        `SRC_PACKAGE=${JSON.stringify(packagePath)}`,
        `DEST_APP=${JSON.stringify(targetAppPath)}`,
        `STAGE_ROOT=${JSON.stringify(stageRoot)}`,
        `PID=${process.pid}`,
        `LOG_FILE=${JSON.stringify(logPath)}`,
        'WORK_APP="$STAGE_ROOT/new.app"',
        'EXTRACT_DIR="$STAGE_ROOT/extract"',
        '',
        'echo "[self-update] started" > "$LOG_FILE"',
        'mkdir -p "$STAGE_ROOT" >> "$LOG_FILE" 2>&1 || exit 0',
        'for i in {1..90}; do',
        '  if ! kill -0 "$PID" >/dev/null 2>&1; then',
        '    break',
        '  fi',
        '  sleep 1',
        'done',
        '',
        'prepare_source() {',
        '  rm -rf "$WORK_APP" >> "$LOG_FILE" 2>&1 || true',
        '  if [[ "$SRC_PACKAGE" == *.app ]]; then',
        '    ditto "$SRC_PACKAGE" "$WORK_APP" >> "$LOG_FILE" 2>&1',
        '    return $?',
        '  fi',
        '',
        '  rm -rf "$EXTRACT_DIR" >> "$LOG_FILE" 2>&1 || true',
        '  mkdir -p "$EXTRACT_DIR" >> "$LOG_FILE" 2>&1 || return 1',
        '  ditto -x -k "$SRC_PACKAGE" "$EXTRACT_DIR" >> "$LOG_FILE" 2>&1 || return 1',
        '  APP_CANDIDATE="$(/usr/bin/find "$EXTRACT_DIR" -maxdepth 6 -type d -name "*.app" | /usr/bin/head -n 1)"',
        '  if [ -z "$APP_CANDIDATE" ]; then',
        '    echo "[self-update] cannot find .app in archive: $SRC_PACKAGE" >> "$LOG_FILE"',
        '    return 1',
        '  fi',
        '  ditto "$APP_CANDIDATE" "$WORK_APP" >> "$LOG_FILE" 2>&1',
        '}',
        '',
        'if prepare_source && rm -rf "$DEST_APP" >> "$LOG_FILE" 2>&1 && ditto "$WORK_APP" "$DEST_APP" >> "$LOG_FILE" 2>&1; then',
        '  xattr -dr com.apple.quarantine "$DEST_APP" >> "$LOG_FILE" 2>&1 || true',
        '  open "$DEST_APP" >> "$LOG_FILE" 2>&1 || true',
        '  rm -rf "$STAGE_ROOT" >/dev/null 2>&1 || true',
        'else',
        '  open "$DEST_APP" >> "$LOG_FILE" 2>&1 || open "$SRC_PACKAGE" >> "$LOG_FILE" 2>&1 || true',
        'fi',
        'exit 0',
        ''
      ].join('\n')

      await fs.writeFile(scriptPath, scriptContent, { mode: 0o755 })

      const installerProcess = spawn('/bin/bash', [scriptPath], {
        detached: true,
        stdio: 'ignore'
      })
      installerProcess.unref()

      setTimeout(() => {
        app.quit()
      }, 1200)
      console.log('[UpdateSystem] Scheduled macOS app replacement install', {
        from: packagePath,
        to: targetAppPath
      })
      return true
    } catch (error) {
      await fse.remove(stageRoot).catch(() => null)
      console.warn('[UpdateSystem] Failed to run macOS app replacement install:', error)
      return false
    }
  }

  private resolveCurrentMacAppBundlePath(): string | null {
    if (process.platform !== 'darwin') {
      return null
    }
    const exePath = app.getPath('exe')
    const appBundlePath = path.resolve(exePath, '..', '..', '..')
    if (!appBundlePath.toLowerCase().endsWith('.app')) {
      return null
    }
    return appBundlePath
  }
}
