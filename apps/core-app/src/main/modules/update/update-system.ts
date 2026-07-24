import type {
  DownloadRequest,
  GitHubRelease,
  NormalizedUpdateCandidate,
  UpdateArtifactComponent
} from '@talex-touch/utils'
import type { DownloadCenterModule } from '../download/download-center'
import * as crypto from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import {
  AppPreviewChannel,
  DownloadModule,
  DownloadPriority,
  DownloadStatus,
  UPDATE_RELEASE_MANIFEST_NAME,
  type UpdateReleaseArtifact,
  type UpdateReleaseManifest,
  splitUpdateTag,
  validateUpdateReleaseManifest
} from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import compressing from 'compressing'
import { and, eq } from 'drizzle-orm'
import { app } from 'electron'
import fse from 'fs-extra'
import { downloadTasks } from '../../db/schema'
import { normalizeSupportedUpdateChannel } from '../../../shared/update/channel'
import { compareUpdateVersions, parseComparableUpdateVersion } from '../../../shared/update/version'
import { createLogger } from '../../utils/logger'
import { SignatureVerifier } from '../../utils/release-signature'
import { getAppVersionSafe } from '../../utils/version-util'
import { databaseModule } from '../database'
import { getAnalyticsMessageStore } from '../analytics/message-store'
import { getNetworkService } from '../network'
import { normalizeUpdateAssetKey } from './update-asset-utils'

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
  rendererOverrideEnabled?: boolean
  storageRoot?: string
}

const RENDERER_OVERRIDE_STATE_FILE = 'renderer-override.json'
const RENDERER_OVERRIDE_DIR = 'renderer-override'
const ENABLE_RENDERER_OVERRIDE = process.env.TUFF_ENABLE_RENDERER_OVERRIDE === '1'
const updateSystemLog = createLogger('UpdateSystem')

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
  platform?: string
  arch?: string
  checksum?: string
  browser_download_url?: string
  sha256?: string
  signatureUrl?: string
  component?: UpdateArtifactComponent
  coreRange?: string
}

export interface VerifiedUpdatePackage {
  taskId: string
  filePath: string
  destination: string
  filename: string
  sha256: string
  signatureUrl: string
}

export interface UpdateDownloadStartResult {
  taskId: string
  rollbackFromVersion: string
  rollbackCompatible: boolean
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
  private readonly pollingService = PollingService.getInstance()
  private readonly signatureVerifier = new SignatureVerifier()
  private readonly storageRoot: string
  private readonly messageStore = getAnalyticsMessageStore()

  /** Channel priority for version comparison (lower = more stable) */
  /**
   * Create UpdateSystem instance
   * @param downloadCenterModule - DownloadCenter module instance for download management
   * @param config - Optional configuration overrides
   */
  constructor(downloadCenterModule: DownloadCenterModule, config?: Partial<UpdateSystemConfig>) {
    this.downloadCenterModule = downloadCenterModule
    this.currentVersion = this.parseVersion(getAppVersionSafe())
    this.storageRoot = config?.storageRoot ?? app.getPath('userData')
    this.config = {
      autoDownload: true,
      autoCheck: true,
      checkFrequency: 'startup',
      ignoredVersions: [],
      updateChannel: normalizeSupportedUpdateChannel(this.currentVersion.channel),
      rendererOverrideEnabled: false,
      ...config
    }
    this.config.updateChannel = normalizeSupportedUpdateChannel(this.config.updateChannel)
  }

  /**
   * Check for available updates
   * @returns Update check result with release information
   */
  /**
   * Download update package
   * @param release - GitHub release to download
   * @returns Task ID of the download
   */
  async downloadUpdate(release: GitHubRelease): Promise<UpdateDownloadStartResult> {
    try {
      const candidate = await this.resolveUpdateCandidate(release)
      const resolvedRelease = candidate.release
      const rollbackCompatible =
        candidate.manifest.release.rollbackCompatible &&
        candidate.manifest.release.rollbackFromVersion ===
          this.currentVersion.raw.trim().replace(/^v/i, '')

      const reusableTaskId = await this.findReusableUpdateTaskId(resolvedRelease.tag_name)
      if (reusableTaskId) {
        updateSystemLog.info('Reusing existing update task', {
          meta: {
            tag: resolvedRelease.tag_name,
            taskId: reusableTaskId
          }
        })
        return {
          taskId: reusableTaskId,
          rollbackFromVersion: candidate.manifest.release.rollbackFromVersion,
          rollbackCompatible
        }
      }

      const asset = candidate.asset
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
          rollbackFromVersion: candidate.manifest.release.rollbackFromVersion,
          rollbackCompatible
        },
        checksum: asset.checksum
      }

      const taskId = await this.downloadCenterModule.addTask(request)

      void this.maybeScheduleRendererOverrideDownload(resolvedRelease, candidate.manifest).catch(
        (error) => {
          updateSystemLog.warn('Renderer override background scheduling failed', {
            error,
            meta: { tag: resolvedRelease.tag_name }
          })
        }
      )

      updateSystemLog.info('Update download started', {
        meta: {
          tag: resolvedRelease.tag_name,
          taskId,
          asset: asset.name
        }
      })
      return {
        taskId,
        rollbackFromVersion: candidate.manifest.release.rollbackFromVersion,
        rollbackCompatible
      }
    } catch (error) {
      updateSystemLog.error('Failed to download update', {
        error,
        meta: { tag: release.tag_name }
      })
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
    if (!this.isRendererOverrideEnabled()) {
      return
    }

    try {
      const { release: resolvedRelease, manifest } = await this.attachReleaseManifest(release)
      await this.maybeScheduleRendererOverrideDownload(resolvedRelease, manifest)
    } catch (error) {
      updateSystemLog.warn('Failed to schedule renderer override', {
        error,
        meta: { tag: release.tag_name }
      })
      const message = error instanceof Error ? error.message : String(error)
      this.reportRendererOverrideIssue('error', 'Renderer override schedule failed', message, {
        tag: release.tag_name
      })
    }
  }

  /**
   * Set up listener for download completion to show notification
   * @private
   */
  private async maybeScheduleRendererOverrideDownload(
    release: GitHubRelease,
    manifest: UpdateReleaseManifest | null
  ): Promise<void> {
    if (!this.isRendererOverrideEnabled()) {
      return
    }

    const artifact = this.resolveManifestArtifact(manifest, 'renderer')
    if (!artifact) {
      return
    }

    if (!artifact.coreRange) {
      updateSystemLog.warn('Renderer artifact missing coreRange, skip scheduling', {
        meta: {
          tag: release.tag_name,
          asset: artifact.name
        }
      })
      this.reportRendererOverrideIssue(
        'warn',
        'Renderer override skipped',
        'Renderer artifact missing coreRange',
        { tag: release.tag_name }
      )
      return
    }
    if (!artifact.sha256) {
      updateSystemLog.warn('Renderer artifact missing sha256, skip scheduling', {
        meta: {
          tag: release.tag_name,
          asset: artifact.name
        }
      })
      this.reportRendererOverrideIssue(
        'warn',
        'Renderer override skipped',
        'Renderer artifact missing sha256',
        { tag: release.tag_name }
      )
      return
    }

    if (!this.isCoreRangeCompatible(artifact.coreRange)) {
      updateSystemLog.info('Renderer coreRange not satisfied by current core, skip scheduling', {
        meta: {
          tag: release.tag_name,
          asset: artifact.name,
          coreRange: artifact.coreRange,
          current: this.currentVersion.raw
        }
      })
      this.reportRendererOverrideIssue(
        'warn',
        'Renderer override skipped',
        `coreRange mismatch: ${artifact.coreRange}`,
        { tag: release.tag_name }
      )
      return
    }

    const asset = this.resolveAssetByName(release.assets as ReleaseAsset[], artifact.name)
    if (!asset) {
      updateSystemLog.warn('Renderer asset not found in release', {
        meta: {
          tag: release.tag_name,
          asset: artifact.name
        }
      })
      this.reportRendererOverrideIssue(
        'warn',
        'Renderer override skipped',
        'Renderer asset not found in release',
        { tag: release.tag_name, asset: artifact.name }
      )
      return
    }

    const url = this.resolveAssetUrl(asset)
    if (!url) {
      updateSystemLog.warn('Renderer asset missing download url', {
        meta: {
          tag: release.tag_name,
          asset: artifact.name
        }
      })
      this.reportRendererOverrideIssue(
        'warn',
        'Renderer override skipped',
        'Renderer asset missing download url',
        { tag: release.tag_name, asset: artifact.name }
      )
      return
    }

    const versionToken = this.resolveReleaseVersionToken(release, manifest)
    const currentOverride = await this.readRendererOverrideState()
    if (
      currentOverride?.enabled &&
      currentOverride.version === versionToken &&
      currentOverride.coreRange === artifact.coreRange
    ) {
      updateSystemLog.debug('Renderer override already active, skip download', {
        meta: {
          version: versionToken,
          coreRange: artifact.coreRange,
          tag: release.tag_name
        }
      })
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
        signatureUrl: asset.signatureUrl
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
    const key = normalizeUpdateAssetKey(name)
    return (
      assets.find((asset) => normalizeUpdateAssetKey(String(asset?.name || '')) === key) ?? null
    )
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
            updateSystemLog.warn('Auxiliary install failed', {
              error,
              meta: { taskId }
            })
            const message = error instanceof Error ? error.message : String(error)
            this.reportRendererOverrideIssue('error', 'Renderer override install failed', message)
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
    if (!this.isRendererOverrideEnabled()) {
      updateSystemLog.debug('Renderer override disabled, skip install')
      return
    }
    const filePath = path.join(task.destination, task.filename)

    if (artifact.sha256) {
      const valid = await this.verifyChecksum(filePath, artifact.sha256)
      if (!valid) {
        this.reportRendererOverrideIssue(
          'error',
          'Renderer override checksum failed',
          'Checksum verification failed',
          { tag: release.tag_name }
        )
        throw new Error('Renderer override checksum verification failed')
      }
    }

    const signatureUrl = task.metadata?.signatureUrl
    if (typeof signatureUrl === 'string' && signatureUrl.length > 0) {
      const verifyResult = await this.signatureVerifier.verifyFileSignature(filePath, signatureUrl)
      if (!verifyResult.valid) {
        updateSystemLog.warn('Renderer override signature verification failed', {
          meta: {
            tag: release.tag_name,
            reason: verifyResult.reason
          }
        })
        this.reportRendererOverrideIssue(
          'warn',
          'Renderer override signature invalid',
          verifyResult.reason || 'Signature verification failed',
          { tag: release.tag_name }
        )
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

      updateSystemLog.info('Renderer override installed', {
        meta: {
          version: versionToken,
          path: targetDir,
          tag: release.tag_name
        }
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

  async disableRendererOverride(reason: string): Promise<void> {
    const current = await this.readRendererOverrideState()
    if (!current?.enabled) {
      return
    }
    await this.writeRendererOverrideState({
      ...current,
      enabled: false,
      lastError: reason,
      updatedAt: Date.now()
    })
    this.reportRendererOverrideIssue('warn', 'Renderer override disabled', reason, {
      version: current.version,
      tag: current.sourceTag
    })
  }

  private reportRendererOverrideIssue(
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
  async verifyDownloadedUpdate(taskId: string): Promise<void> {
    await this.resolveVerifiedInstallTask(taskId)
  }

  async prepareInstallHandoff(taskId: string): Promise<VerifiedUpdatePackage> {
    return await this.resolveVerifiedInstallTask(taskId)
  }

  private async resolveVerifiedInstallTask(taskId: string): Promise<VerifiedUpdatePackage> {
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
    if (!checksum) {
      throw new Error('Update package checksum is required but missing')
    }
    if (!(await this.verifyChecksum(filePath, checksum))) {
      throw new Error('Checksum verification failed')
    }

    const signatureUrl =
      typeof task.metadata?.signatureUrl === 'string' ? task.metadata.signatureUrl : undefined
    if (!signatureUrl) {
      throw new Error('Update package signature is required but missing')
    }
    const verifyResult = await this.signatureVerifier.verifyFileSignatureWithCache(
      filePath,
      signatureUrl,
      `${filePath}.sig`
    )
    if (!verifyResult.valid) {
      updateSystemLog.error('Update package signature verification failed', {
        meta: { taskId, reason: verifyResult.reason }
      })
      throw new Error(
        `Update package signature verification failed: ${verifyResult.reason ?? 'unknown'}`
      )
    }

    return {
      taskId,
      filePath,
      destination: task.destination,
      filename: task.filename,
      sha256: checksum,
      signatureUrl
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
      updateSystemLog.warn('Failed to query update task from database', {
        error,
        meta: { taskId }
      })
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
      updateSystemLog.warn('Failed to parse update task metadata', { error })
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
    return compareUpdateVersions(v1, v2)
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
    this.config.updateChannel = normalizeSupportedUpdateChannel(this.config.updateChannel)
  }

  private isRendererOverrideEnabled(): boolean {
    return ENABLE_RENDERER_OVERRIDE && this.config.rendererOverrideEnabled === true
  }

  // Private helper methods

  /**
   * Fetch releases from GitHub API
   */
  private async attachReleaseManifest(release: GitHubRelease): Promise<{
    release: GitHubRelease
    manifest: UpdateReleaseManifest | null
    artifact: UpdateReleaseArtifact | null
  }> {
    const resolvedManifest = await this.fetchReleaseManifest(release)
    if (!resolvedManifest) {
      return { release, manifest: null, artifact: null }
    }
    const { manifest, artifact } = resolvedManifest

    const assetMap = new Map<string, ReleaseAsset>()
    for (const asset of release.assets as ReleaseAsset[]) {
      const name = String(asset?.name || '')
      if (name) {
        assetMap.set(normalizeUpdateAssetKey(name), asset)
      }
    }

    const manifestMap = new Map<string, UpdateReleaseArtifact>()
    for (const entry of manifest.artifacts) {
      manifestMap.set(normalizeUpdateAssetKey(entry.name), entry)
    }

    for (const asset of release.assets as ReleaseAsset[]) {
      const manifestEntry = manifestMap.get(normalizeUpdateAssetKey(String(asset?.name || '')))
      if (!manifestEntry) {
        continue
      }
      asset.sha256 = manifestEntry.sha256
      asset.checksum = manifestEntry.sha256
      asset.component = manifestEntry.component
      asset.coreRange = manifestEntry.coreRange

      if (manifestEntry.signature && !asset.signatureUrl) {
        const signatureAsset = assetMap.get(normalizeUpdateAssetKey(manifestEntry.signature))
        const signatureUrl = signatureAsset?.browser_download_url || signatureAsset?.url
        if (signatureUrl) {
          asset.signatureUrl = signatureUrl
        }
      }
    }

    return { release, manifest, artifact }
  }

  private async resolveUpdateCandidate(release: GitHubRelease): Promise<NormalizedUpdateCandidate> {
    if (release.source !== 'nexus' && release.source !== 'github') {
      throw new Error('Update release source is missing')
    }

    const platform = process.platform
    if (platform !== 'win32' && platform !== 'darwin' && platform !== 'linux') {
      throw new Error(`Unsupported update platform: ${platform}`)
    }
    const arch: 'x64' | 'arm64' = process.arch === 'arm64' ? 'arm64' : 'x64'
    const {
      release: resolvedRelease,
      manifest,
      artifact
    } = await this.attachReleaseManifest(release)
    if (!manifest || !artifact) {
      throw new Error('Update release manifest is required and must match this platform')
    }

    const releaseAsset = this.resolveAssetByName(
      resolvedRelease.assets as ReleaseAsset[],
      artifact.name
    )
    const url = releaseAsset?.browser_download_url || releaseAsset?.url
    if (!releaseAsset || !url) {
      throw new Error('Manifest update asset is missing from the release')
    }
    if (!releaseAsset.signatureUrl) {
      throw new Error('Update package signature is required but missing')
    }

    return {
      source: release.source,
      channel: manifest.release.channel,
      release: resolvedRelease,
      manifest,
      asset: {
        name: releaseAsset.name,
        url,
        size: releaseAsset.size,
        platform,
        arch,
        checksum: artifact.sha256,
        signatureUrl: releaseAsset.signatureUrl
      }
    }
  }

  private async fetchReleaseManifest(
    release: GitHubRelease
  ): Promise<{ manifest: UpdateReleaseManifest; artifact: UpdateReleaseArtifact } | null> {
    const assets = release.assets as ReleaseAsset[]
    const manifestAsset = assets.find(
      (asset) => normalizeUpdateAssetKey(String(asset?.name || '')) === UPDATE_RELEASE_MANIFEST_NAME
    )
    if (!manifestAsset) {
      return null
    }

    const manifestUrl = manifestAsset.browser_download_url || manifestAsset.url
    if (!manifestUrl) {
      return null
    }

    const platform = process.platform
    if (platform !== 'win32' && platform !== 'darwin' && platform !== 'linux') {
      return null
    }
    const arch: 'x64' | 'arm64' = process.arch === 'arm64' ? 'arm64' : 'x64'

    try {
      const response = await getNetworkService().request<unknown>({
        method: 'GET',
        url: manifestUrl,
        timeoutMs: 8000,
        responseType: 'json'
      })
      const validation = validateUpdateReleaseManifest(response.data, {
        tag: release.tag_name,
        channel: this.parseVersion(release.tag_name).channel,
        platform,
        arch
      })
      if (!validation.valid) {
        updateSystemLog.warn('Invalid release manifest', {
          meta: { asset: manifestAsset.name, reason: validation.reason }
        })
        return null
      }
      return { manifest: validation.manifest, artifact: validation.artifact }
    } catch (error) {
      updateSystemLog.warn('Failed to fetch release manifest', {
        error,
        meta: { asset: manifestAsset.name }
      })
      return null
    }
  }

  /**
   * Parse version string to version object
   */
  private parseVersion(versionStr: string): VersionInfo {
    return parseComparableUpdateVersion(versionStr)
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
    return compareUpdateVersions(a, b)
  }

  /**
   * Check if update is needed
   */
  /**
   * Get effective update channel
   */
  /**
   * Find appropriate asset for current platform
   */
  /**
   * Get update download path
   */
  private async getUpdateDownloadPath(): Promise<string> {
    const downloadPath = path.join(this.storageRoot, 'modules', 'update-packages')

    try {
      await fs.mkdir(downloadPath, { recursive: true })
    } catch (error) {
      updateSystemLog.error('Failed to create update download directory', {
        error,
        meta: { path: downloadPath }
      })
    }

    return downloadPath
  }

  /**
   * Verify file checksum
   */
  private async verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
    try {
      const hash = crypto.createHash('sha256')
      for await (const chunk of createReadStream(filePath)) {
        hash.update(chunk)
      }
      const actualChecksum = hash.digest('hex')

      return actualChecksum.toLowerCase() === expectedChecksum.toLowerCase()
    } catch (error) {
      updateSystemLog.error('Failed to verify checksum', {
        error,
        meta: { path: filePath }
      })
      return false
    }
  }
}
