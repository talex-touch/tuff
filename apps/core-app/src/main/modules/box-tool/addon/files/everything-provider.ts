import type {
  DownloadTask,
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  TuffItem,
  TuffMeta,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { FileSearchContextCandidate } from '@talex-touch/utils/transport/events/types/core-box'
import type { ProviderContext } from '../../search-engine/types'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { promisify } from 'node:util'
import {
  DownloadModule,
  DownloadPriority,
  DownloadStatus,
  StorageList,
  TuffInputType,
  TuffItemBuilder,
  TuffSearchResultBuilder
} from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { shell } from 'electron'
import {
  everythingInstallStartEvent,
  everythingInstallStatusEvent,
  everythingSetCliPathEvent,
  everythingStatusEvent,
  everythingTestEvent,
  everythingToggleEvent,
  type EverythingInstallAssetDetail,
  type EverythingInstallStatusResponse,
  type EverythingStatusResponse,
  type EverythingBackendType,
  type EverythingPathFilteringStatus
} from '../../../../../shared/events/everything'
import compressing from 'compressing'
import { normalizeTuffItemLocalAssets } from '../../../../utils/local-renderable-assets'
import { formatDuration } from '../../../../utils/logger'
import { getMainConfig, saveMainConfig } from '../../../storage'
import { downloadCenterModule } from '../../../download/download-center'
import { appTaskGate } from '../../../../service/app-task-gate'
import { indexingRootPolicy } from '../../search-engine/indexing-root-policy'
import { searchLogger } from '../../search-engine/search-logger'
import { EverythingDiagnosticsTracker, toEverythingResultSample } from './everything-diagnostics'
import {
  createAbortPromise,
  EverythingSearchFallbackError,
  getErrorCode,
  getErrorMessage,
  isAbortError,
  isRecord,
  isSearchFallbackError,
  throwIfAborted
} from './everything-errors'
import { EverythingIconCache } from './everything-icon-cache'
import { fileProvider } from './file-provider'
import { expandWindowsEnvironmentVariables } from '../apps/app-provider-path-utils'
import { mapFileToTuffItem } from './utils'

const execFileAsync = promisify(execFile)
const requireFromCurrentModule = createRequire(import.meta.url)
const fileProviderLog = getLogger('file-provider')
const EVERYTHING_ICON_WARMUP_LIMIT = 12
const EVERYTHING_STARTUP_READY_WAIT_MS = 3_000
const EVERYTHING_INSTALL_POLL_MS = 500
const EVERYTHING_INSTALL_SOURCE = 'everything-install'

type EverythingInstallAssetType = 'everything' | 'cli'

interface EverythingInstallAssetSpec {
  type: EverythingInstallAssetType
  filename: string
  url: string
  sha256: string
}

interface EverythingInstallJobState extends EverythingInstallStatusResponse {
  promise?: Promise<void>
}

type DownloadCenterRuntime = {
  addTask: (request: {
    id?: string
    url: string
    destination: string
    filename?: string
    priority: DownloadPriority
    module: DownloadModule
    metadata?: Record<string, unknown>
    checksum?: string
  }) => Promise<string>
  getTaskStatus: (taskId: string) => DownloadTask | null
}

const EVERYTHING_INSTALL_HASHES: Record<string, string> = {
  'Everything-1.4.1.1032.x64.zip':
    '698df475ec44e638f66f1b6a32d28fea613cec78d3b6310e6abe53431eeb940c',
  'Everything-1.4.1.1032.x86.zip':
    '156db5beb747d69470518a7b9b55af11efc4d3285ddb7cc013c0cc13ced5f237',
  'Everything-1.4.1.1032.ARM64.zip':
    '23dca1a64574bf30c9988bbaf5f1d201a0ec7ee9a15e12270ae92a52183cccc8',
  'ES-1.1.0.30.x64.zip': '30147feadae528d4bbfb3bcb4597a4c7d9f52a0f9f708ea6577b6028bd8dd268',
  'ES-1.1.0.30.x86.zip': '7e9f04cb92e9eb0440655a395537b204e98e3accd5335e610649d323b15f5117',
  'ES-1.1.0.30.ARM64.zip': 'af5f02b29d6e91b7e70d3b6809bbfe931af671d981e060ecb4f015c30f9697b9'
}

function usesWindowsSeparators(filePath: string): boolean {
  return filePath.includes('\\')
}

function basenameForResult(filePath: string): string {
  return usesWindowsSeparators(filePath) ? path.win32.basename(filePath) : path.basename(filePath)
}

function extnameForResult(filePath: string): string {
  return usesWindowsSeparators(filePath) ? path.win32.extname(filePath) : path.extname(filePath)
}

function joinForResult(dirPath: string, name: string): string {
  return usesWindowsSeparators(dirPath) ? path.win32.join(dirPath, name) : path.join(dirPath, name)
}

function resolveWindowsNativeArch(): 'x64' | 'x86' | 'ARM64' {
  const nativeArch = process.env.PROCESSOR_ARCHITEW6432 || process.env.PROCESSOR_ARCHITECTURE
  if (nativeArch === 'ARM64') return 'ARM64'
  if (nativeArch === 'x86') return 'x86'
  return 'x64'
}

function buildEverythingInstallAssets(): EverythingInstallAssetSpec[] {
  const arch = resolveWindowsNativeArch()
  const everythingFilename =
    arch === 'ARM64'
      ? 'Everything-1.4.1.1032.ARM64.zip'
      : arch === 'x86'
        ? 'Everything-1.4.1.1032.x86.zip'
        : 'Everything-1.4.1.1032.x64.zip'
  const cliFilename =
    arch === 'ARM64'
      ? 'ES-1.1.0.30.ARM64.zip'
      : arch === 'x86'
        ? 'ES-1.1.0.30.x86.zip'
        : 'ES-1.1.0.30.x64.zip'

  return [
    {
      type: 'everything',
      filename: everythingFilename,
      url: `https://www.voidtools.com/${everythingFilename}`,
      sha256: EVERYTHING_INSTALL_HASHES[everythingFilename]
    },
    {
      type: 'cli',
      filename: cliFilename,
      url: `https://www.voidtools.com/${cliFilename}`,
      sha256: EVERYTHING_INSTALL_HASHES[cliFilename]
    }
  ]
}

interface EverythingSearchResult {
  path: string
  name: string
  extension: string
  size: number
  mtime: Date
  ctime: Date
  isDir: boolean
}

interface EverythingSdkAddon {
  search?: (query: string, options?: { maxResults?: number }) => unknown
  query?: (query: string, options?: { maxResults?: number }) => unknown
  getVersion?: () => string
}

const EVERYTHING_TEST_QUERY = '*.txt'

type WindowsRegistryPathRecord = {
  Path?: string
  path?: string
}

type EverythingFileSearchMeta = TuffMeta & {
  fileSearchContext?: FileSearchContextCandidate
}

/**
 * Everything Provider for Windows
 *
 * Integrates with Everything search engine (voidtools) for ultra-fast file searching on Windows.
 *
 * Requirements:
 * - Everything must be installed and running
 * - Everything Command-line Interface (es.exe) must be available
 *
 * Installation:
 * 1. Download Everything from https://www.voidtools.com/
 * 2. Download Everything Command-line Interface (es.exe)
 * 3. Place es.exe in Everything installation directory or system PATH
 */
class EverythingProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'everything-provider'
  readonly name = 'Everything Search'
  readonly type = 'file' as const
  readonly supportedInputTypes = [TuffInputType.Text, TuffInputType.Files]
  readonly priority = 'fast' as const
  readonly expectedDuration = 50

  private esPath: string | null = null
  private configuredCliPath: string | null = null
  private isAvailable = false
  private initializationError: Error | null = null
  private isEnabled = true
  private backend: EverythingBackendType = 'unavailable'
  private readonly fallbackChain: EverythingBackendType[] = ['sdk-napi', 'cli', 'unavailable']
  private lastBackendError: string | null = null
  private lastBackendErrorCode: string | null = null
  private backendAttemptErrors: Record<string, string> = {}
  private everythingVersion: string | null = null
  private sdkAddon: EverythingSdkAddon | null = null
  private lastChecked: number | null = null
  private pathFilteringStatus: EverythingPathFilteringStatus = {
    enabled: true,
    allowedRootCount: 0,
    lastRawResultCount: null,
    lastFilteredResultCount: null,
    lastDroppedResultCount: null,
    lastChecked: null,
    reason: null
  }
  private startupRefreshPromise: Promise<void> | null = null
  private readonly diagnosticsTracker = new EverythingDiagnosticsTracker()
  private readonly iconCache = new EverythingIconCache()
  private installJob: EverythingInstallJobState | null = null
  readonly iconExtractions = { clear: () => this.iconCache.clear() }

  get diagnostics() {
    return this.diagnosticsTracker.snapshot()
  }

  set diagnostics(value) {
    this.diagnosticsTracker.replace(value)
  }

  private logInfo(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      fileProviderLog.info(`[Everything] ${message}`, meta)
    } else {
      fileProviderLog.info(`[Everything] ${message}`)
    }
  }

  private logWarn(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    if (error && meta) {
      fileProviderLog.warn(`[Everything] ${message}`, { ...meta, error })
      return
    }
    if (meta) {
      fileProviderLog.warn(`[Everything] ${message}`, meta)
      return
    }
    if (error) {
      fileProviderLog.warn(`[Everything] ${message}`, error)
      return
    }
    fileProviderLog.warn(`[Everything] ${message}`)
  }

  private logDebug(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      fileProviderLog.debug(`[Everything] ${message}`, meta)
    } else {
      fileProviderLog.debug(`[Everything] ${message}`)
    }
  }

  private logError(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    if (error && meta) {
      fileProviderLog.error(`[Everything] ${message}`, { ...meta, error })
      return
    }
    if (meta) {
      fileProviderLog.error(`[Everything] ${message}`, meta)
      return
    }
    if (error) {
      fileProviderLog.error(`[Everything] ${message}`, error)
      return
    }
    fileProviderLog.error(`[Everything] ${message}`)
  }

  private async refreshBackendState(reason: 'startup' | 'manual-check' | 'toggle-enable') {
    const refreshStart = performance.now()

    try {
      const initialized = await this.initializeSearchBackend()
      this.isAvailable = initialized
      this.lastChecked = Date.now()

      if (initialized) {
        this.initializationError = null
        this.logInfo('Everything backend ready', {
          reason,
          duration: formatDuration(performance.now() - refreshStart),
          backend: this.backend,
          path: this.esPath || 'unknown',
          enabled: this.isEnabled
        })
        return true
      }

      this.backend = 'unavailable'
      this.initializationError = new Error('No available Everything backend (SDK/CLI)')
      this.logWarn('Everything backend is unavailable after refresh', undefined, {
        reason,
        duration: formatDuration(performance.now() - refreshStart),
        enabled: this.isEnabled
      })
      return false
    } catch (error) {
      this.initializationError = error as Error
      this.isAvailable = false
      this.backend = 'unavailable'
      this.lastChecked = Date.now()
      this.logWarn('Everything backend refresh failed', error, {
        reason,
        duration: formatDuration(performance.now() - refreshStart),
        enabled: this.isEnabled
      })
      return false
    }
  }

  private markBackendUnavailable(message: string, errorCode: string | null = null): void {
    this.backend = 'unavailable'
    this.isAvailable = false
    this.initializationError = new Error(message)
    this.lastBackendError = message
    this.lastBackendErrorCode = errorCode
    this.lastChecked = Date.now()
  }

  async onLoad(context: ProviderContext): Promise<void> {
    if (process.platform !== 'win32') {
      this.registerChannels(context)
      this.logInfo('Everything provider is Windows-only, skipping initialization')
      return
    }

    this.logInfo('Initializing Everything provider')

    await this.loadSettings(context)
    this.registerChannels(context)
    this.scheduleStartupBackendRefresh()
  }

  private scheduleStartupBackendRefresh(): void {
    if (this.startupRefreshPromise) return
    const startedAt = performance.now()

    this.startupRefreshPromise = new Promise<void>((resolve) => setImmediate(resolve))
      .then(async () => {
        const becameIdle = await appTaskGate.waitForIdle(EVERYTHING_STARTUP_READY_WAIT_MS)
        this.logDebug('Everything startup backend refresh running', { becameIdle })
        await this.refreshBackendState('startup')
      })
      .catch((error) => {
        this.logWarn('Everything startup backend refresh failed', error)
      })
      .finally(() => {
        this.logDebug('Everything startup backend refresh finished', {
          duration: formatDuration(performance.now() - startedAt)
        })
        this.startupRefreshPromise = null
      })
  }

  private async loadSettings(_context: ProviderContext): Promise<void> {
    try {
      const settings = getMainConfig(StorageList.EVERYTHING_SETTINGS) as
        | { enabled?: boolean; cliPath?: string | null }
        | undefined
      this.configuredCliPath = this.normalizeCliPath(settings?.cliPath)
      if (settings && typeof settings.enabled === 'boolean') {
        this.isEnabled = settings.enabled
      } else {
        this.isEnabled = true
        this.saveSettings()
      }
    } catch (error) {
      this.logWarn('Failed to load settings, using defaults', error)
      this.isEnabled = true
      this.configuredCliPath = null
    }
  }

  private saveSettings(): void {
    try {
      saveMainConfig(StorageList.EVERYTHING_SETTINGS, {
        enabled: this.isEnabled,
        cliPath: this.configuredCliPath
      })
    } catch (error) {
      this.logError('Failed to save settings', error)
    }
  }

  private normalizeCliPath(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed || null
  }

  private resolveInstallPaths(): {
    downloadDir: string
    installDir: string
    cliDir: string
    cliPath: string
    everythingExe: string
  } {
    const localAppData =
      process.env.LOCALAPPDATA ||
      (process.env.USERPROFILE
        ? path.join(process.env.USERPROFILE, 'AppData', 'Local')
        : process.cwd())
    const root = path.join(localAppData, 'Tuff')
    const cliDir = path.join(root, 'EverythingCLI')
    const installDir = path.join(root, 'Everything')

    return {
      downloadDir: path.join(root, 'Downloads', 'dependencies', 'everything'),
      installDir,
      cliDir,
      cliPath: path.join(cliDir, 'es.exe'),
      everythingExe: path.join(installDir, 'Everything.exe')
    }
  }

  private getDownloadCenter(): DownloadCenterRuntime {
    return downloadCenterModule
  }

  private createInstallAssetDetails(
    assets: EverythingInstallAssetSpec[],
    paths = this.resolveInstallPaths()
  ): EverythingInstallAssetDetail[] {
    return assets.map((asset) => ({
      type: asset.type,
      filename: asset.filename,
      url: asset.url,
      sha256: asset.sha256,
      destination: paths.downloadDir,
      taskId: null
    }))
  }

  private createInstallJob(): EverythingInstallJobState {
    const now = Date.now()
    const paths = this.resolveInstallPaths()
    const assets = this.createInstallAssetDetails(buildEverythingInstallAssets(), paths)

    return {
      jobId: randomUUID(),
      phase: 'queued',
      taskIds: {
        everything: null,
        cli: null
      },
      progress: 0,
      message: 'Queued Everything installer downloads.',
      error: null,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      installDir: paths.installDir,
      cliDir: paths.cliDir,
      cliPath: paths.cliPath,
      pathConfigured: false,
      assets
    }
  }

  private createIdleInstallStatus(): EverythingInstallStatusResponse {
    const paths = this.resolveInstallPaths()
    return {
      jobId: null,
      phase: process.platform === 'win32' ? 'idle' : 'unsupported',
      taskIds: {
        everything: null,
        cli: null
      },
      progress: null,
      message:
        process.platform === 'win32'
          ? null
          : 'Everything automatic install is only supported on Windows.',
      error: process.platform === 'win32' ? null : 'Everything install is Windows-only.',
      startedAt: null,
      updatedAt: null,
      completedAt: null,
      installDir: process.platform === 'win32' ? paths.installDir : null,
      cliDir: process.platform === 'win32' ? paths.cliDir : null,
      cliPath: process.platform === 'win32' ? paths.cliPath : null,
      pathConfigured: false,
      assets:
        process.platform === 'win32'
          ? this.createInstallAssetDetails(buildEverythingInstallAssets(), paths)
          : []
    }
  }

  private toInstallStatusResponse(job: EverythingInstallJobState): EverythingInstallStatusResponse {
    return {
      jobId: job.jobId,
      phase: job.phase,
      taskIds: {
        everything: job.taskIds.everything ?? null,
        cli: job.taskIds.cli ?? null
      },
      progress: job.progress,
      message: job.message,
      error: job.error,
      startedAt: job.startedAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
      installDir: job.installDir,
      cliDir: job.cliDir,
      cliPath: job.cliPath,
      pathConfigured: job.pathConfigured,
      assets: job.assets.map((asset) => ({ ...asset }))
    }
  }

  private updateInstallJob(
    job: EverythingInstallJobState,
    updates: Partial<Omit<EverythingInstallJobState, 'jobId' | 'startedAt' | 'assets'>>
  ): void {
    Object.assign(job, updates, {
      updatedAt: Date.now()
    })
  }

  private isInstallJobActive(
    job: EverythingInstallJobState | null
  ): job is EverythingInstallJobState {
    if (!job) return false
    return !['completed', 'failed', 'unsupported'].includes(job.phase)
  }

  private async startEverythingInstall(): Promise<{
    success: boolean
    status: EverythingInstallStatusResponse
  }> {
    if (process.platform !== 'win32') {
      const job: EverythingInstallJobState = {
        ...this.createIdleInstallStatus(),
        jobId: randomUUID(),
        phase: 'unsupported',
        startedAt: Date.now(),
        updatedAt: Date.now()
      }
      this.installJob = job
      return {
        success: false,
        status: this.toInstallStatusResponse(job)
      }
    }

    const activeInstallJob = this.installJob
    if (this.isInstallJobActive(activeInstallJob)) {
      return {
        success: true,
        status: this.toInstallStatusResponse(activeInstallJob)
      }
    }

    const job = this.createInstallJob()
    this.installJob = job
    job.promise = this.runEverythingInstallJob(job).catch((error) => {
      const message = getErrorMessage(error)
      this.updateInstallJob(job, {
        phase: 'failed',
        progress: null,
        message,
        error: message,
        completedAt: Date.now()
      })
      this.logError('Everything automatic install failed', error)
    })

    return {
      success: true,
      status: this.toInstallStatusResponse(job)
    }
  }

  private getInstallStatusSnapshot(): EverythingInstallStatusResponse {
    return this.installJob
      ? this.toInstallStatusResponse(this.installJob)
      : this.createIdleInstallStatus()
  }

  private async runEverythingInstallJob(job: EverythingInstallJobState): Promise<void> {
    const paths = this.resolveInstallPaths()
    const downloadCenter = this.getDownloadCenter()

    await fs.mkdir(paths.downloadDir, { recursive: true })

    const taskIds: Record<EverythingInstallAssetType, string> = {
      everything: '',
      cli: ''
    }

    for (const asset of job.assets) {
      const taskId = await downloadCenter.addTask({
        url: asset.url,
        destination: asset.destination,
        filename: asset.filename,
        priority: DownloadPriority.CRITICAL,
        module: DownloadModule.RESOURCE_DOWNLOAD,
        checksum: asset.sha256,
        metadata: {
          source: EVERYTHING_INSTALL_SOURCE,
          assetType: asset.type,
          sha256: asset.sha256,
          allowUnknownSize: true
        }
      })
      asset.taskId = taskId
      taskIds[asset.type] = taskId
    }

    this.updateInstallJob(job, {
      phase: 'downloading',
      taskIds: {
        everything: taskIds.everything,
        cli: taskIds.cli
      },
      progress: 0,
      message: 'Downloading Everything portable packages.'
    })

    await this.waitForInstallDownloads(job, downloadCenter)

    this.updateInstallJob(job, {
      phase: 'verifying',
      progress: 70,
      message: 'Verifying Everything package checksums.'
    })
    await this.verifyInstallAssets(job)

    this.updateInstallJob(job, {
      phase: 'extracting',
      progress: 80,
      message: 'Extracting Everything and es.exe.'
    })
    await fs.mkdir(paths.installDir, { recursive: true })
    await fs.mkdir(paths.cliDir, { recursive: true })
    for (const asset of job.assets) {
      const targetDir = asset.type === 'everything' ? paths.installDir : paths.cliDir
      await compressing.zip.uncompress(path.join(asset.destination, asset.filename), targetDir)
    }

    this.updateInstallJob(job, {
      phase: 'probing',
      progress: 86,
      message: 'Verifying es.exe.'
    })
    await this.probeEverythingCli(paths.cliPath)

    this.updateInstallJob(job, {
      phase: 'configuring-path',
      progress: 88,
      message: 'Configuring Everything CLI path.'
    })
    await this.ensureUserPathContains(paths.cliDir)
    job.pathConfigured = true

    this.updateInstallJob(job, {
      phase: 'probing',
      progress: 94,
      message: 'Saving Everything CLI path and refreshing backend.'
    })
    this.configuredCliPath = paths.cliPath
    this.saveSettings()
    this.startEverythingPortable(paths.everythingExe)

    if (this.isEnabled) {
      await this.refreshBackendState('manual-check')
    }

    this.updateInstallJob(job, {
      phase: 'completed',
      progress: 100,
      message: 'Everything is installed and ready.',
      error: null,
      completedAt: Date.now(),
      cliPath: paths.cliPath
    })
  }

  private async waitForInstallDownloads(
    job: EverythingInstallJobState,
    downloadCenter: DownloadCenterRuntime
  ): Promise<void> {
    const taskIds = job.assets
      .map((asset) => asset.taskId)
      .filter((taskId): taskId is string => Boolean(taskId))

    if (taskIds.length !== job.assets.length) {
      throw new Error('Everything install download tasks were not created')
    }

    while (true) {
      const tasks = taskIds.map((taskId) => {
        const task = downloadCenter.getTaskStatus(taskId)
        if (!task) {
          throw new Error(`Everything install download task not found: ${taskId}`)
        }
        return task
      })

      const failedTask = tasks.find((task) => task.status === DownloadStatus.FAILED)
      if (failedTask) {
        throw new Error(
          failedTask.error || `Everything install download failed: ${failedTask.filename}`
        )
      }

      const cancelledTask = tasks.find((task) => task.status === DownloadStatus.CANCELLED)
      if (cancelledTask) {
        throw new Error(`Everything install download was cancelled: ${cancelledTask.filename}`)
      }

      const averageProgress =
        tasks.reduce((sum, task) => sum + Math.max(0, task.progress?.percentage ?? 0), 0) /
        Math.max(1, tasks.length)
      this.updateInstallJob(job, {
        phase: 'downloading',
        progress: Math.min(69, Math.round(averageProgress * 0.69)),
        message: 'Downloading Everything portable packages.'
      })

      if (tasks.every((task) => task.status === DownloadStatus.COMPLETED)) {
        return
      }

      await new Promise((resolve) => setTimeout(resolve, EVERYTHING_INSTALL_POLL_MS))
    }
  }

  private async verifyInstallAssets(job: EverythingInstallJobState): Promise<void> {
    for (const asset of job.assets) {
      const filePath = path.join(asset.destination, asset.filename)
      const actualHash = await this.calculateFileSha256(filePath)
      if (actualHash.toLowerCase() !== asset.sha256.toLowerCase()) {
        throw new Error(
          `Checksum mismatch for ${asset.filename}: expected ${asset.sha256}, got ${actualHash}`
        )
      }
    }
  }

  private async calculateFileSha256(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath)
    return createHash('sha256').update(buffer).digest('hex')
  }

  private async ensureUserPathContains(cliDir: string): Promise<void> {
    const script = [
      "$ErrorActionPreference='Stop'",
      '$cliDir=$env:TUFF_EVERYTHING_CLI_DIR',
      "if(-not $cliDir){throw 'Missing Everything CLI directory'}",
      "$userPath=[Environment]::GetEnvironmentVariable('Path','User')",
      '$parts=@()',
      "if($userPath){$parts=$userPath -split ';' | Where-Object { $_ -and $_.Trim() }}",
      '$normalizedCli=$cliDir.Trim().TrimEnd("\\")',
      '$already=$false',
      'foreach($part in $parts){',
      '  if([string]::Equals($part.Trim().TrimEnd("\\"), $normalizedCli, [System.StringComparison]::OrdinalIgnoreCase)){',
      '    $already=$true',
      '    break',
      '  }',
      '}',
      'if(-not $already){',
      "  [Environment]::SetEnvironmentVariable('Path', (($parts + $cliDir) -join ';'), 'User')",
      '}',
      "if($already){'already'}else{'added'}"
    ].join('\n')

    await execFileAsync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        timeout: 5000,
        windowsHide: true,
        env: {
          ...process.env,
          TUFF_EVERYTHING_CLI_DIR: cliDir
        }
      }
    )

    const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'Path'
    const currentPath = process.env[pathKey] || ''
    const currentParts = currentPath.split(';').filter(Boolean)
    const hasCliDir = currentParts.some((part) => {
      return (
        part
          .trim()
          .replace(/[\\/]+$/, '')
          .toLowerCase() ===
        cliDir
          .trim()
          .replace(/[\\/]+$/, '')
          .toLowerCase()
      )
    })
    if (!hasCliDir) {
      process.env[pathKey] = [...currentParts, cliDir].join(';')
    }
  }

  private startEverythingPortable(everythingExe: string): void {
    execFile(everythingExe, ['-startup'], { windowsHide: true }, (error) => {
      if (error) {
        this.logWarn('Failed to start Everything portable after install', error)
      }
    })
  }

  private getHealthStatus(): {
    health: 'healthy' | 'degraded' | 'unsupported'
    reason: string | null
  } {
    if (process.platform !== 'win32') {
      return {
        health: 'unsupported',
        reason: 'Everything backend is only available on Windows.'
      }
    }

    if (this.isEnabled && this.isAvailable) {
      return { health: 'healthy', reason: null }
    }

    if (!this.isEnabled) {
      return {
        health: 'degraded',
        reason:
          'Windows file search is unavailable because Everything is disabled. Install or enable Everything to restore search results.'
      }
    }

    return {
      health: 'degraded',
      reason:
        this.initializationError?.message ||
        this.lastBackendError ||
        'Windows file search is unavailable because the Everything backend is not ready.'
    }
  }

  getStatusSnapshot(): EverythingStatusResponse {
    const healthStatus = this.getHealthStatus()
    return {
      enabled: this.isEnabled,
      available: this.isAvailable,
      backend: this.backend,
      health: healthStatus.health,
      healthReason: healthStatus.reason,
      version: this.everythingVersion,
      esPath: this.esPath,
      configuredCliPath: this.configuredCliPath,
      error: this.initializationError?.message || null,
      errorCode: this.lastBackendErrorCode,
      lastBackendError: this.lastBackendError,
      backendAttemptErrors: this.backendAttemptErrors,
      fallbackChain: this.fallbackChain,
      lastChecked: this.lastChecked,
      pathFiltering: this.pathFilteringStatus,
      diagnostics: this.diagnosticsTracker.snapshot()
    }
  }

  isSearchReady(): boolean {
    return process.platform === 'win32' && this.isEnabled && this.isAvailable
  }

  buildUnavailableNotice(query: TuffQuery): TuffItem | null {
    const searchText = query.text?.trim() ?? ''
    if (!searchText || this.isSearchReady() || process.platform !== 'win32') {
      return null
    }

    const reason =
      this.getHealthStatus().reason ||
      'Windows file search is unavailable because the Everything dependency is missing.'

    return new TuffItemBuilder(
      `everything-provider:unavailable:${encodeURIComponent(searchText).slice(0, 64)}`,
      this.type,
      this.id
    )
      .setKind('notification')
      .setTitle('Windows file search is not ready')
      .setSubtitle('Everything dependency missing or disabled')
      .setDescription(reason)
      .setAccessory('Everything')
      .setActions([
        {
          id: 'open-everything-settings',
          type: 'navigate',
          label: 'Open Everything settings',
          description: 'Check Everything backend, diagnostics, and install guidance.',
          icon: { type: 'class', value: 'i-ri-settings-3-line' },
          payload: {
            path: '/setting?section=everything',
            section: 'everything'
          }
        }
      ])
      .setFinalScore(1)
      .build()
  }

  private registerChannels(context: ProviderContext): void {
    const channel = context.touchApp.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    const transport = getTuffTransportMain(channel, keyManager)

    transport.on(everythingStatusEvent, async (payload) => {
      if (payload?.refresh && process.platform === 'win32') {
        await this.refreshBackendState('manual-check')
      }

      return this.getStatusSnapshot()
    })

    transport.on(everythingInstallStartEvent, async () => {
      return this.startEverythingInstall()
    })

    transport.on(everythingInstallStatusEvent, async () => {
      return this.getInstallStatusSnapshot()
    })

    transport.on(everythingToggleEvent, async (payload) => {
      if (typeof payload?.enabled !== 'boolean') {
        throw new TypeError('Invalid enabled value')
      }

      this.isEnabled = payload.enabled
      this.saveSettings()

      if (this.isEnabled) {
        await this.refreshBackendState('toggle-enable')
      }

      this.logInfo('Everything toggled', { enabled: this.isEnabled })
      return { success: true, enabled: this.isEnabled }
    })

    transport.on(everythingSetCliPathEvent, async (payload) => {
      const nextCliPath = this.normalizeCliPath(payload?.path)

      if (nextCliPath && process.platform !== 'win32') {
        throw new Error('Everything CLI path can only be configured on Windows')
      }

      if (nextCliPath) {
        await this.probeEverythingCli(nextCliPath)
      }

      this.configuredCliPath = nextCliPath
      this.saveSettings()

      if (this.isEnabled && process.platform === 'win32') {
        await this.refreshBackendState('manual-check')
      }

      return {
        success: true,
        cliPath: this.configuredCliPath,
        status: this.getStatusSnapshot()
      }
    })

    transport.on(everythingTestEvent, async () => {
      if (!this.isAvailable || !this.isEnabled) {
        return {
          success: false,
          backend: this.backend,
          health: this.getHealthStatus().health,
          query: EVERYTHING_TEST_QUERY,
          error: 'Everything is not available or disabled',
          backendAttempts: this.diagnosticsTracker.snapshot(),
          durationByStage: this.diagnosticsTracker.durationByStage()
        }
      }

      const testStart = performance.now()
      try {
        const results = await this.searchEverything(EVERYTHING_TEST_QUERY, 10)
        const duration = performance.now() - testStart

        return {
          success: true,
          backend: this.backend,
          health: this.getHealthStatus().health,
          query: EVERYTHING_TEST_QUERY,
          resultCount: results.length,
          duration: Math.round(duration),
          sample: toEverythingResultSample(results[0] ?? null),
          backendAttempts: this.diagnosticsTracker.snapshot(),
          durationByStage: this.diagnosticsTracker.durationByStage()
        }
      } catch (error: unknown) {
        return {
          success: false,
          backend: this.backend,
          health: this.getHealthStatus().health,
          query: EVERYTHING_TEST_QUERY,
          errorCode: getErrorCode(error) || (isAbortError(error) ? 'ABORT_ERR' : null),
          error: getErrorMessage(error),
          backendAttempts: this.diagnosticsTracker.snapshot(),
          durationByStage: this.diagnosticsTracker.durationByStage()
        }
      }
    })
  }

  private async initializeSearchBackend(): Promise<boolean> {
    this.backend = 'unavailable'
    this.initializationError = null
    this.lastBackendError = null
    this.lastBackendErrorCode = null
    this.backendAttemptErrors = {}
    this.diagnosticsTracker.reset()
    this.esPath = null
    this.everythingVersion = null
    this.sdkAddon = null

    if (await this.tryInitializeSdkBackend()) {
      return true
    }

    if (await this.tryInitializeCliBackend()) {
      return true
    }

    return false
  }

  private async tryInitializeSdkBackend(): Promise<boolean> {
    const startedAt = performance.now()
    const envPath = process.env.TALEX_EVERYTHING_SDK_PATH?.trim()
    const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : ''
    const candidates = [
      envPath,
      resourcesPath ? path.join(resourcesPath, 'native', 'everything.node') : null,
      resourcesPath ? path.join(resourcesPath, 'everything', 'everything.node') : null,
      path.join(process.cwd(), 'resources', 'native', 'everything.node'),
      path.join(process.cwd(), 'resources', 'everything.node'),
      '@talex-touch/tuff-native/everything',
      '@talex-touch/everything-sdk'
    ].filter((candidate): candidate is string => Boolean(candidate))

    for (const candidate of candidates) {
      const addon = await this.loadSdkAddon(candidate)
      if (!addon) {
        continue
      }

      const supportsSearch = typeof addon.search === 'function' || typeof addon.query === 'function'
      if (!supportsSearch) {
        this.diagnosticsTracker.record({
          stage: 'sdk-load',
          status: 'failed',
          backend: 'sdk-napi',
          startedAt,
          target: candidate,
          error: 'Everything SDK loaded but search method is missing',
          attempts: candidates.length
        })
        this.logWarn('Everything SDK loaded but search method is missing', undefined, {
          candidate
        })
        continue
      }

      this.sdkAddon = addon
      this.backend = 'sdk-napi'
      this.isAvailable = true
      this.esPath = candidate
      this.everythingVersion =
        typeof addon.getVersion === 'function' ? addon.getVersion() : this.everythingVersion
      this.diagnosticsTracker.record({
        stage: 'sdk-load',
        status: 'success',
        backend: 'sdk-napi',
        startedAt,
        target: candidate,
        attempts: candidates.length
      })

      this.logInfo('Everything SDK backend ready', {
        backend: this.backend,
        candidate,
        version: this.everythingVersion
      })
      return true
    }

    this.diagnosticsTracker.record({
      stage: 'sdk-load',
      status: 'failed',
      backend: 'sdk-napi',
      startedAt,
      error: this.lastBackendError || 'No loadable Everything SDK candidate found',
      errorCode: this.lastBackendErrorCode,
      attempts: candidates.length
    })
    return false
  }

  private async loadSdkAddon(candidate: string): Promise<EverythingSdkAddon | null> {
    const isPathLike =
      candidate.includes('\\') || candidate.includes('/') || candidate.endsWith('.node')

    if (isPathLike) {
      try {
        await fs.access(candidate)
      } catch {
        return null
      }
    }

    try {
      const loaded = requireFromCurrentModule(candidate) as unknown
      if (isRecord(loaded) && isRecord(loaded.default)) {
        return loaded.default as unknown as EverythingSdkAddon
      }
      if (isRecord(loaded)) {
        return loaded as EverythingSdkAddon
      }
      return null
    } catch (error) {
      this.lastBackendError = getErrorMessage(error)
      this.lastBackendErrorCode = getErrorCode(error) ?? null
      this.backendAttemptErrors[candidate] = this.lastBackendError
      this.logDebug('Everything SDK candidate load failed', {
        candidate,
        error: getErrorMessage(error)
      })
      return null
    }
  }

  private async tryInitializeCliBackend(): Promise<boolean> {
    const startedAt = performance.now()
    try {
      await this.detectEverything()
      this.backend = 'cli'
      this.isAvailable = true
      this.lastBackendError = null
      this.diagnosticsTracker.record({
        stage: 'cli-detect',
        status: 'success',
        backend: 'cli',
        startedAt,
        target: this.esPath
      })
      return true
    } catch (error) {
      this.lastBackendError = getErrorMessage(error)
      this.lastBackendErrorCode = getErrorCode(error) ?? null
      this.backendAttemptErrors.cli = this.lastBackendError
      this.diagnosticsTracker.record({
        stage: 'cli-detect',
        status: 'failed',
        backend: 'cli',
        startedAt,
        error: this.lastBackendError,
        errorCode: this.lastBackendErrorCode
      })
      this.logWarn('Everything CLI backend unavailable', error)
      return false
    }
  }

  /**
   * Detect Everything Command-line Interface (es.exe)
   */
  private async detectEverything(): Promise<void> {
    const configuredPath = this.configuredCliPath?.trim()
    if (configuredPath) {
      const configuredResolved = await this.tryProbeEverythingCli(configuredPath)
      if (configuredResolved) return
    }

    const possiblePaths = this.dedupeCliCandidates([
      'es.exe', // In current process PATH
      ...(await this.getWindowsRegistryPathExecutableCandidates('es.exe')),
      'C:\\Program Files\\Everything\\es.exe',
      'C:\\Program Files (x86)\\Everything\\es.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Everything', 'es.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Everything', 'es.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Everything', 'es.exe')
    ])

    for (const esPath of possiblePaths) {
      const resolved = await this.tryProbeEverythingCli(esPath)
      if (resolved) return
    }

    throw new Error(
      'Everything Command-line Interface (es.exe) not found. Please install Everything from https://www.voidtools.com/'
    )
  }

  private async tryProbeEverythingCli(esPath: string): Promise<boolean> {
    try {
      const { version } = await this.probeEverythingCli(esPath)
      this.esPath = esPath
      this.everythingVersion = version
      this.logInfo('Found Everything CLI', {
        path: esPath,
        version: this.everythingVersion
      })
      return true
    } catch (error) {
      this.backendAttemptErrors[esPath] = getErrorMessage(error)
      return false
    }
  }

  private dedupeCliCandidates(candidates: string[]): string[] {
    const seen = new Set<string>()
    const result: string[] = []
    for (const candidate of candidates) {
      const normalized = candidate?.trim()
      if (!normalized) continue
      const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized
      if (seen.has(key)) continue
      seen.add(key)
      result.push(normalized)
    }
    return result
  }

  private async getWindowsRegistryPathExecutableCandidates(
    executableName: string
  ): Promise<string[]> {
    if (process.platform !== 'win32') return []

    const pathValues = await this.readWindowsRegistryPathValues()
    const candidates: string[] = []

    for (const pathValue of pathValues) {
      for (const rawDir of pathValue.split(';')) {
        const dir = expandWindowsEnvironmentVariables(rawDir.trim().replace(/^["']|["']$/g, ''))
        if (!dir) continue
        candidates.push(path.win32.join(dir, executableName))
      }
    }

    return this.dedupeCliCandidates(candidates)
  }

  private async readWindowsRegistryPathValues(): Promise<string[]> {
    try {
      const script = [
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        '$values = @()',
        "$machine = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment' -Name Path -ErrorAction SilentlyContinue).Path",
        "$user = (Get-ItemProperty -Path 'HKCU:\\Environment' -Name Path -ErrorAction SilentlyContinue).Path",
        'foreach ($value in @($machine, $user)) {',
        '  if ($value) { $values += [PSCustomObject]@{ Path = [string]$value } }',
        '}',
        '$values | ConvertTo-Json -Compress'
      ].join('\n')

      const { stdout } = await execFileAsync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { timeout: 3000, windowsHide: true }
      )
      const raw = stdout.trim()
      if (!raw) return []

      const parsed = JSON.parse(raw) as WindowsRegistryPathRecord | WindowsRegistryPathRecord[]
      const records = Array.isArray(parsed) ? parsed : [parsed]
      return records
        .map((record) => record.Path || record.path || '')
        .filter((value): value is string => value.trim().length > 0)
    } catch (error) {
      this.backendAttemptErrors['registry:PATH'] = getErrorMessage(error)
      this.logWarn('Failed to read Windows PATH registry entries', error)
      return []
    }
  }

  private async probeEverythingCli(esPath: string): Promise<{ version: string | null }> {
    const { stdout } = await execFileAsync(esPath, ['-v'], {
      timeout: 3000,
      windowsHide: true
    })

    if (!stdout.includes('es') && !stdout.includes('Everything')) {
      throw new Error('Selected file is not Everything CLI (es.exe)')
    }

    return { version: this.parseVersion(stdout) }
  }

  private parseVersion(versionOutput: string): string | null {
    const match = versionOutput.match(/(\d+\.)+\d+/)
    return match ? match[0] : null
  }

  /**
   * Search files using active backend with fallback.
   */
  private async searchEverything(
    query: string,
    maxResults = 50,
    signal?: AbortSignal
  ): Promise<EverythingSearchResult[]> {
    throwIfAborted(signal)

    if (this.backend === 'sdk-napi') {
      try {
        const sdkResults = await this.searchEverythingWithSdk(query, maxResults, signal)
        return this.filterAuthorizedResults(sdkResults)
      } catch (error) {
        if (isAbortError(error) || isSearchFallbackError(error)) {
          throw error
        }
        this.lastBackendError = getErrorMessage(error)
        this.lastBackendErrorCode = getErrorCode(error) ?? null
        this.logWarn('Everything SDK search failed, falling back to CLI', error)
        await this.ensureCliFallback()
      }
    }

    if (this.backend === 'cli') {
      const cliResults = await this.searchEverythingWithCli(query, maxResults, signal)
      return this.filterAuthorizedResults(cliResults)
    }

    return []
  }

  private normalizeWindowsPathForFilter(value: string): string {
    return path.win32
      .normalize(value.trim())
      .replace(/[\\/]+$/, '')
      .toLowerCase()
  }

  private isWithinAllowedRoots(filePath: string, roots: string[]): boolean {
    const normalizedPath = this.normalizeWindowsPathForFilter(filePath)

    return roots.some((root) => {
      const normalizedRoot = this.normalizeWindowsPathForFilter(root)
      return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}\\`)
    })
  }

  private updatePathFilteringStatus(options: {
    allowedRootCount: number
    rawCount: number
    filteredCount: number
    reason: string | null
  }): void {
    this.pathFilteringStatus = {
      enabled: true,
      allowedRootCount: options.allowedRootCount,
      lastRawResultCount: options.rawCount,
      lastFilteredResultCount: options.filteredCount,
      lastDroppedResultCount: options.rawCount - options.filteredCount,
      lastChecked: Date.now(),
      reason: options.reason
    }
  }

  private filterAuthorizedResults(results: EverythingSearchResult[]): EverythingSearchResult[] {
    let roots: string[]
    try {
      roots = indexingRootPolicy.resolveFileSearchRoots().roots.map((root) => root.path)
    } catch (error) {
      this.logWarn('Everything path filtering could not read runtime file search roots', error)
      this.updatePathFilteringStatus({
        allowedRootCount: 0,
        rawCount: results.length,
        filteredCount: 0,
        reason: 'indexing-root-policy-file-roots-unavailable'
      })
      return []
    }

    const usableRoots = roots.filter((root) => typeof root === 'string' && root.trim().length > 0)
    if (usableRoots.length === 0) {
      this.updatePathFilteringStatus({
        allowedRootCount: 0,
        rawCount: results.length,
        filteredCount: 0,
        reason: 'indexing-root-policy-file-roots-empty'
      })
      return []
    }

    const filtered = results.filter((result) => this.isWithinAllowedRoots(result.path, usableRoots))
    this.updatePathFilteringStatus({
      allowedRootCount: usableRoots.length,
      rawCount: results.length,
      filteredCount: filtered.length,
      reason: filtered.length === results.length ? null : 'outside-indexing-root-policy-file-roots'
    })

    return filtered
  }

  private async ensureCliFallback(): Promise<void> {
    const ready = await this.tryInitializeCliBackend()
    if (!ready) {
      const message = this.lastBackendError || 'Everything backend unavailable'
      this.markBackendUnavailable(message, this.lastBackendErrorCode)
      throw new EverythingSearchFallbackError(message, this.lastBackendErrorCode)
    }
    this.initializationError = null
  }

  private async searchEverythingWithSdk(
    query: string,
    maxResults: number,
    signal?: AbortSignal
  ): Promise<EverythingSearchResult[]> {
    if (!this.sdkAddon) {
      throw new Error('Everything SDK not initialized')
    }
    throwIfAborted(signal)

    const searchStart = performance.now()
    const searchFn = this.sdkAddon.search ?? this.sdkAddon.query

    if (typeof searchFn !== 'function') {
      throw new TypeError('Everything SDK search method is not available')
    }

    let rawResults: unknown
    try {
      const searchPromise = Promise.resolve(
        searchFn.call(this.sdkAddon, query, {
          maxResults
        })
      )
      const abortPromise = createAbortPromise<unknown>(signal)
      rawResults = await (abortPromise
        ? Promise.race([searchPromise, abortPromise])
        : searchPromise)
    } catch (error) {
      if (!isAbortError(error)) {
        this.diagnosticsTracker.record({
          stage: 'sdk-query',
          status: 'failed',
          backend: 'sdk-napi',
          startedAt: searchStart,
          target: query,
          error: getErrorMessage(error),
          errorCode: getErrorCode(error) ?? null
        })
      }
      throw error
    }

    throwIfAborted(signal)

    const results = this.parseEverythingSdkOutput(rawResults)

    this.diagnosticsTracker.record({
      stage: 'sdk-query',
      status: 'success',
      backend: 'sdk-napi',
      startedAt: searchStart,
      target: query
    })
    this.logDebug('Everything SDK search completed', {
      query,
      results: results.length,
      duration: formatDuration(performance.now() - searchStart)
    })

    return results
  }

  private parseEverythingSdkOutput(rawResults: unknown): EverythingSearchResult[] {
    if (!Array.isArray(rawResults)) {
      return []
    }

    const normalized: EverythingSearchResult[] = []

    for (const entry of rawResults) {
      if (!isRecord(entry)) {
        continue
      }

      const pathValue =
        typeof entry.fullPath === 'string'
          ? entry.fullPath
          : typeof entry.path === 'string'
            ? entry.path
            : ''
      const nameValue =
        typeof entry.name === 'string'
          ? entry.name
          : typeof entry.filename === 'string'
            ? entry.filename
            : ''

      const filePath = pathValue
        ? nameValue && basenameForResult(pathValue).toLowerCase() !== nameValue.toLowerCase()
          ? joinForResult(pathValue, nameValue)
          : pathValue
        : nameValue

      if (!filePath) {
        continue
      }

      const name = nameValue || basenameForResult(filePath)
      const extensionValue =
        typeof entry.extension === 'string' ? entry.extension : extnameForResult(name)
      const sizeValue =
        typeof entry.size === 'number'
          ? entry.size
          : typeof entry.fileSize === 'number'
            ? entry.fileSize
            : 0
      const isDir =
        entry.isFolder === true ||
        entry.isDirectory === true ||
        entry.type === 'folder' ||
        entry.kind === 'folder'

      normalized.push({
        path: filePath,
        name,
        extension: extensionValue.toLowerCase().replace(/^\./, ''),
        size: sizeValue,
        mtime: this.toResultDate(entry.mtime ?? entry.dateModified ?? entry.modifiedAt),
        ctime: this.toResultDate(entry.ctime ?? entry.dateCreated ?? entry.createdAt),
        isDir
      })
    }

    return normalized
  }

  private toResultDate(value: unknown): Date {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      const timestamp = value > 1_000_000_000_000 ? value : value * 1000
      const date = new Date(timestamp)
      return Number.isNaN(date.getTime()) ? new Date(0) : date
    }

    if (typeof value === 'string') {
      const numericValue = Number(value)
      if (Number.isFinite(numericValue)) {
        const timestamp = numericValue > 1_000_000_000_000 ? numericValue : numericValue * 1000
        const numericDate = new Date(timestamp)
        if (!Number.isNaN(numericDate.getTime())) {
          return numericDate
        }
      }

      const parsed = new Date(value)
      if (!Number.isNaN(parsed.getTime())) {
        return parsed
      }
    }

    return new Date(0)
  }

  private async searchEverythingWithCli(
    query: string,
    maxResults = 50,
    signal?: AbortSignal
  ): Promise<EverythingSearchResult[]> {
    if (!this.esPath) {
      throw new Error('Everything CLI not initialized')
    }
    throwIfAborted(signal)

    const searchStart = performance.now()

    // Everything search options:
    // -n <num>: Maximum number of results
    // -s: Sort by path
    // -path: Show full path
    // -size: Show file size
    // -dm: Show date modified
    // -dc: Show date created
    const args = [query, '-n', maxResults.toString(), '-s', 'path', '-path', '-size', '-dm', '-dc']

    try {
      const { stdout } = await execFileAsync(this.esPath, args, {
        timeout: 5000,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        signal,
        windowsHide: true
      })

      throwIfAborted(signal)
      const results = this.parseEverythingOutput(stdout)

      this.diagnosticsTracker.record({
        stage: 'cli-query',
        status: 'success',
        backend: 'cli',
        startedAt: searchStart,
        target: query
      })
      this.logDebug('Everything CLI search completed', {
        query,
        results: results.length,
        duration: formatDuration(performance.now() - searchStart)
      })

      return results
    } catch (error: unknown) {
      if (isAbortError(error)) {
        throw error
      }
      const errorCode = getErrorCode(error) ?? null
      const errorMessage = getErrorMessage(error)

      this.lastBackendError = errorMessage
      this.lastBackendErrorCode = errorCode
      this.diagnosticsTracker.record({
        stage: 'cli-query',
        status: 'failed',
        backend: 'cli',
        startedAt: searchStart,
        target: query,
        error: errorMessage,
        errorCode
      })

      if (errorCode === 'ETIMEDOUT') {
        this.logWarn('Everything CLI search timed out', error, { query })
      } else {
        this.markBackendUnavailable(errorMessage, errorCode)
        this.logError('Everything CLI search failed', error, { query })
      }
      throw new EverythingSearchFallbackError(errorMessage, errorCode)
    }
  }

  /**
   * Parse Everything CLI output
   * Format: path,size,date_modified,date_created
   */
  private parseEverythingOutput(output: string): EverythingSearchResult[] {
    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    const results: EverythingSearchResult[] = []

    for (const line of lines) {
      try {
        const parts = this.parseCsvLine(line)

        if (parts.length < 4) {
          continue
        }

        const [filePath, sizeStr, mtimeStr, ctimeStr] = parts

        if (!filePath) {
          continue
        }

        const name = basenameForResult(filePath)
        const extension = extnameForResult(filePath).toLowerCase().replace(/^\./, '')
        const size = Number.parseInt(sizeStr, 10) || 0
        const mtime = this.toResultDate(mtimeStr)
        const ctime = this.toResultDate(ctimeStr)

        results.push({
          path: filePath,
          name,
          extension,
          size,
          mtime,
          ctime,
          isDir: false
        })
      } catch (error) {
        this.logWarn('Failed to parse Everything result line', error, { line })
      }
    }

    return results
  }

  private parseCsvLine(line: string): string[] {
    const parts: string[] = []
    let current = ''
    let inQuotes = false

    for (let index = 0; index < line.length; index++) {
      const char = line[index]
      if (char === '"') {
        const next = line[index + 1]
        if (inQuotes && next === '"') {
          current += '"'
          index++
        } else {
          inQuotes = !inQuotes
        }
        continue
      }

      if (char === ',' && !inQuotes) {
        parts.push(current.trim())
        current = ''
        continue
      }

      current += char
    }

    parts.push(current.trim())
    return parts
  }

  /**
   * Build Everything search query with filters
   */
  private buildEverythingQuery(searchText: string): string {
    // Everything search syntax:
    // - Use quotes for exact phrases
    // - Use wildcards: * (any characters), ? (single character)
    // - Use operators: AND, OR, NOT
    // - Use filters: ext:, size:, dm:, dc:, etc.

    const trimmed = searchText.trim()
    return trimmed
  }

  async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult> {
    if (process.platform !== 'win32') {
      return new TuffSearchResultBuilder(query).build()
    }

    if (!this.isEnabled) {
      this.logDebug('Everything is disabled, skipping search')
      return new TuffSearchResultBuilder(query).build()
    }

    if (!this.isAvailable) {
      if (this.initializationError) {
        this.logDebug('Everything not available, skipping search', {
          error: this.initializationError.message
        })
      }
      return new TuffSearchResultBuilder(query).build()
    }
    if (signal.aborted) {
      return new TuffSearchResultBuilder(query).build()
    }

    searchLogger.logProviderSearch('everything-provider', query.text, 'Everything')

    const searchText = query.text.trim()
    if (!searchText) {
      return new TuffSearchResultBuilder(query).build()
    }

    const searchStart = performance.now()
    const everythingQuery = this.buildEverythingQuery(searchText)

    try {
      const results = await this.searchEverything(everythingQuery, 50, signal)
      if (signal.aborted) {
        return new TuffSearchResultBuilder(query).build()
      }

      if (results.length === 0) {
        return new TuffSearchResultBuilder(query).build()
      }

      // Convert Everything results to TuffItems
      const now = Date.now()
      let scheduledIconWarmups = 0
      const items = results.map((result, index) => {
        // Create a file object compatible with mapFileToTuffItem
        const fileObj = {
          id: index, // Temporary ID
          path: result.path,
          name: result.name,
          displayName: null,
          extension: result.extension,
          size: result.size,
          mtime: result.mtime,
          ctime: result.ctime,
          lastIndexedAt: new Date(),
          isDir: result.isDir,
          type: result.isDir ? ('directory' as const) : ('file' as const),
          content: null,
          embeddingStatus: 'none' as const
        }
        const cachedIcon = this.iconCache.get(result.path)

        const tuffItem = mapFileToTuffItem(
          fileObj,
          cachedIcon ? { icon: cachedIcon } : {},
          this.id,
          this.name,
          cachedIcon || result.isDir || scheduledIconWarmups >= EVERYTHING_ICON_WARMUP_LIMIT
            ? undefined
            : (file) => {
                scheduledIconWarmups += 1
                void this.iconCache.ensure(file.path)
              }
        )
        tuffItem.meta = {
          ...tuffItem.meta,
          file: {
            ...tuffItem.meta?.file,
            path: result.path,
            isDir: result.isDir
          }
        }

        // Calculate scoring based on recency and position
        const daysSinceModified = (now - result.mtime.getTime()) / (1000 * 3600 * 24)
        const recencyScore = Math.exp(-0.05 * daysSinceModified)
        const positionScore = 1 - (index / results.length) * 0.5 // Higher score for earlier results
        const finalScore = recencyScore * 0.6 + positionScore * 0.4

        tuffItem.scoring = {
          final: finalScore,
          match: 1.0, // Everything provides exact matches
          recency: recencyScore,
          frequency: 0,
          base: positionScore,
          match_details: {
            type: 'exact',
            query: searchText
          }
        }
        const fileSearchMeta: EverythingFileSearchMeta = {
          ...(tuffItem.meta as EverythingFileSearchMeta | undefined),
          fileSearchContext: {
            path: result.path,
            name: result.name,
            extension: result.extension,
            size: result.size,
            mtime: result.mtime.toISOString(),
            isDir: result.isDir,
            source: 'everything',
            backend: this.backend,
            score: finalScore
          }
        }
        tuffItem.meta = fileSearchMeta as TuffMeta

        const normalized = normalizeTuffItemLocalAssets(tuffItem, {
          dropMissingFile: false,
          fallbackKind: result.isDir ? 'folder' : 'file'
        })
        if (cachedIcon && normalized.missingPaths.length > 0) {
          this.iconCache.delete(result.path)
          if (!result.isDir && scheduledIconWarmups < EVERYTHING_ICON_WARMUP_LIMIT) {
            scheduledIconWarmups += 1
            void this.iconCache.ensure(result.path)
          }
        }
        return normalized.item ?? tuffItem
      })

      const result = new TuffSearchResultBuilder(query).setItems(items).build()

      this.logDebug('Everything search completed', {
        query: searchText,
        items: items.length,
        duration: formatDuration(performance.now() - searchStart)
      })

      return result
    } catch (error) {
      if (isAbortError(error)) {
        this.logDebug('Everything search aborted', { query: searchText })
        return new TuffSearchResultBuilder(query).build()
      }
      if (isSearchFallbackError(error)) {
        this.logWarn('Everything search degraded to file-provider', error, {
          query: searchText,
          code: error.code
        })
        try {
          return await fileProvider.onSearch(query, signal)
        } catch (fallbackError) {
          this.logError('Everything file-provider fallback failed', fallbackError, {
            query: searchText
          })
          return new TuffSearchResultBuilder(query).build()
        }
      }
      this.logError('Everything search failed', error, { query: searchText })
      return new TuffSearchResultBuilder(query).build()
    }
  }

  async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    const filePath = args.item.meta?.file?.path
    if (!filePath) {
      this.logError('File path not found in TuffItem')
      return null
    }

    try {
      await fs.access(filePath)
      await shell.openPath(filePath)
      return null
    } catch (err: unknown) {
      if (getErrorCode(err) === 'ENOENT') {
        this.logError('File not found', new Error(`File does not exist: ${filePath}`), {
          path: filePath
        })
      } else {
        this.logError('Failed to open file', err, { path: filePath })
      }
      return null
    }
  }
}

export const everythingProvider = new EverythingProvider()
