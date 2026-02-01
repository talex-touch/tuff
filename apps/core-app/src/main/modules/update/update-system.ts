import type {
  DownloadRequest,
  GitHubRelease,
  UpdateCheckResult,
  UpdateArtifactComponent
} from '@talex-touch/utils'
import type { DownloadCenterModule } from '../download/download-center'
import type { NotificationService } from '../download/notification-service'
import * as crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import * as path from 'node:path'
import {
  AppPreviewChannel,
  DownloadModule,
  DownloadPriority,
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
import { app, shell } from 'electron'
import fse from 'fs-extra'
import { pluginModule } from '../plugin/plugin-module'
import { SignatureVerifier } from '../../utils/release-signature'
import { getAppVersionSafe } from '../../utils/version-util'

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
const EXTENSIONS_BACKUP_DIR = 'extensions-backup'

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
  private downloadCenterModule: DownloadCenterModule
  private notificationService: NotificationService
  private readonly pollingService = PollingService.getInstance()
  private readonly signatureVerifier = new SignatureVerifier()
  private readonly storageRoot: string

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
      void this.maybeScheduleExtensionsDownload(resolvedRelease, manifest).catch((error) => {
        console.warn('[UpdateSystem] Extensions update scheduling failed:', error)
      })

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

  private async maybeScheduleRendererOverrideDownload(
    release: GitHubRelease,
    manifest: UpdateReleaseManifest | null
  ): Promise<void> {
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

  private async maybeScheduleExtensionsDownload(
    release: GitHubRelease,
    manifest: UpdateReleaseManifest | null
  ): Promise<void> {
    const artifact = this.resolveManifestArtifact(manifest, 'extensions')
    if (!artifact) {
      return
    }

    if (!artifact.coreRange) {
      console.warn('[UpdateSystem] Extensions artifact missing coreRange, skipping.')
      return
    }
    if (!artifact.sha256) {
      console.warn('[UpdateSystem] Extensions artifact missing sha256, skipping.')
      return
    }

    if (!this.isCoreRangeCompatible(artifact.coreRange)) {
      console.info(
        `[UpdateSystem] Extensions coreRange "${artifact.coreRange}" not satisfied by current core, skipping.`
      )
      return
    }

    const asset = this.resolveAssetByName(release.assets as ReleaseAsset[], artifact.name)
    if (!asset) {
      console.warn('[UpdateSystem] Extensions asset not found in release:', artifact.name)
      return
    }

    const url = this.resolveAssetUrl(asset)
    if (!url) {
      console.warn('[UpdateSystem] Extensions asset missing download url:', artifact.name)
      return
    }

    const request: DownloadRequest = {
      url,
      destination: await this.getUpdateDownloadPath(),
      filename: asset.name,
      priority: DownloadPriority.HIGH,
      module: DownloadModule.PLUGIN_INSTALL,
      metadata: {
        component: 'extensions',
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
      await this.installExtensionsBundle(task, artifact, release, manifest)
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

  private async installExtensionsBundle(
    task: { destination: string; filename: string; metadata?: Record<string, unknown> },
    artifact: UpdateReleaseArtifact,
    release: GitHubRelease,
    manifest: UpdateReleaseManifest | null
  ): Promise<void> {
    const filePath = path.join(task.destination, task.filename)

    if (artifact.sha256) {
      const valid = await this.verifyChecksum(filePath, artifact.sha256)
      if (!valid) {
        throw new Error('Extensions bundle checksum verification failed')
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
        console.warn('[UpdateSystem] Extensions bundle signature verification failed:', {
          reason: verifyResult.reason
        })
      }
    }

    const tempDir = path.join(os.tmpdir(), `talex-touch-extensions-${Date.now()}`)
    try {
      await fse.ensureDir(tempDir)
      await compressing.zip.uncompress(filePath, tempDir)

      const bundleRoot = await this.resolveExtensionsRoot(tempDir)
      if (!bundleRoot) {
        throw new Error('Extensions bundle missing plugins directory')
      }

      const updated = await this.applyExtensionsUpdate(bundleRoot)
      console.log('[UpdateSystem] Extensions updated', {
        count: updated.length,
        version: this.resolveReleaseVersionToken(release, manifest)
      })
    } finally {
      await fse.remove(tempDir).catch(() => null)
    }
  }

  private async applyExtensionsUpdate(sourceRoot: string): Promise<string[]> {
    const targetRoot = this.resolvePluginRoot()
    await fse.ensureDir(targetRoot)

    const entries = await fse.readdir(sourceRoot, { withFileTypes: true })
    const pluginDirs = entries.filter((entry) => entry.isDirectory())
    if (!pluginDirs.length) {
      throw new Error('No plugin directories found in extensions bundle')
    }

    const updatedPlugins: string[] = []
    const createdPlugins: string[] = []
    const backupRoot = path.join(
      this.storageRoot,
      'modules',
      EXTENSIONS_BACKUP_DIR,
      `${Date.now()}`
    )
    let backupReady = false

    try {
      for (const entry of pluginDirs) {
        const sourcePath = path.join(sourceRoot, entry.name)
        const manifestPath = path.join(sourcePath, 'manifest.json')
        if (!(await fse.pathExists(manifestPath))) {
          console.warn('[UpdateSystem] Skip extensions entry without manifest:', entry.name)
          continue
        }

        let pluginName = entry.name
        try {
          const manifest = await fse.readJson(manifestPath)
          if (manifest?.name) {
            pluginName = String(manifest.name)
          }
        } catch (error) {
          console.warn('[UpdateSystem] Failed to parse plugin manifest:', {
            plugin: entry.name,
            error
          })
        }

        const targetPath = path.join(targetRoot, pluginName)
        const exists = await fse.pathExists(targetPath)

        if (exists) {
          if (!backupReady) {
            await fse.ensureDir(backupRoot)
            backupReady = true
          }
          await fse.copy(targetPath, path.join(backupRoot, pluginName))
        } else {
          createdPlugins.push(pluginName)
        }

        await fse.copy(sourcePath, targetPath, { overwrite: true })
        updatedPlugins.push(pluginName)
      }

      if (pluginModule.pluginManager) {
        for (const pluginName of updatedPlugins) {
          if (pluginModule.pluginManager.getPluginByName(pluginName)) {
            await pluginModule.pluginManager.reloadPlugin(pluginName)
          } else {
            await pluginModule.pluginManager.loadPlugin(pluginName)
          }
        }
      }

      return updatedPlugins
    } catch (error) {
      await this.rollbackExtensionsUpdate({
        backupRoot,
        updatedPlugins,
        createdPlugins,
        targetRoot
      })
      throw error
    }
  }

  private async rollbackExtensionsUpdate({
    backupRoot,
    updatedPlugins,
    createdPlugins,
    targetRoot
  }: {
    backupRoot: string
    updatedPlugins: string[]
    createdPlugins: string[]
    targetRoot: string
  }): Promise<void> {
    const hasBackup = await fse.pathExists(backupRoot)
    if (hasBackup) {
      for (const pluginName of updatedPlugins) {
        const backupPath = path.join(backupRoot, pluginName)
        const targetPath = path.join(targetRoot, pluginName)
        if (await fse.pathExists(backupPath)) {
          await fse.copy(backupPath, targetPath, { overwrite: true }).catch(() => null)
        }
      }
    }

    for (const pluginName of createdPlugins) {
      const targetPath = path.join(targetRoot, pluginName)
      if (await fse.pathExists(targetPath)) {
        await fse.remove(targetPath).catch(() => null)
      }
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

  private resolvePluginRoot(): string {
    return pluginModule.filePath ?? path.join(this.storageRoot, 'modules', 'plugins')
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

  private async resolveExtensionsRoot(tempDir: string): Promise<string | null> {
    const pluginsDir = path.join(tempDir, 'plugins')
    if (await fse.pathExists(pluginsDir)) {
      return pluginsDir
    }

    const entries = await fse.readdir(tempDir, { withFileTypes: true })
    const hasManifest = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => fse.pathExists(path.join(tempDir, entry.name, 'manifest.json')))
    )

    if (hasManifest.some(Boolean)) {
      return tempDir
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const candidate = path.join(tempDir, entry.name, 'plugins')
      if (await fse.pathExists(candidate)) {
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
  private findAssetForPlatform(assets: ReleaseAsset[]): ReleaseAsset | null {
    const platform = process.platform
    const arch = process.arch

    const platformTokensMap: Record<string, string[]> = {
      darwin: ['darwin', 'mac', 'macos'],
      win32: ['win32', 'win', 'windows'],
      linux: ['linux']
    }

    const platformTokens = platformTokensMap[platform] || [platform]
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
      if (!platformTokens.some((token) => normalizedName.includes(token))) {
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
        platform,
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
