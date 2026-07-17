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
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
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
import { fileFilterService } from '@talex-touch/utils/common/file-filter-service'
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
  type EverythingInstallationStatus,
  type EverythingPathFilteringStatus
} from '../../../../../shared/events/everything'
import compressing from 'compressing'
import { normalizeTuffItemLocalAssets } from '../../../../utils/local-renderable-assets'
import { formatDuration } from '../../../../utils/logger'
import { getMainConfig, saveMainConfig } from '../../../storage'
import { downloadCenterModule } from '../../../download/download-center'
import { appTaskGate } from '../../../../service/app-task-gate'
import { searchLogger } from '../../search-engine/search-logger'
import { EverythingDiagnosticsTracker, toEverythingResultSample } from './everything-diagnostics'
import {
  EverythingSearchFallbackError,
  getErrorCode,
  getErrorMessage,
  isAbortError,
  isRecord,
  isSearchFallbackError,
  throwIfAborted
} from './everything-errors'
import { EverythingIconCache } from './everything-icon-cache'
import { buildEverythingQuery, type EverythingSearchResult } from './everything-parser'
import { EverythingBackendService, type EverythingSdkAddon } from './everything-backend-service'
import { EverythingInstallService } from './everything-install-service'
import { fileProvider } from './file-provider'
import { expandWindowsEnvironmentVariables } from '../apps/app-provider-path-utils'
import { mapFileToTuffItem } from './utils'

const execFileAsync = promisify(execFile)
const fileProviderLog = getLogger('file-provider')
const EVERYTHING_ICON_WARMUP_LIMIT = 12
const EVERYTHING_SEARCH_MAX_RESULTS = 50
const EVERYTHING_SEARCH_FETCH_LIMIT = EVERYTHING_SEARCH_MAX_RESULTS * 2
const EVERYTHING_STARTUP_READY_WAIT_MS = 3_000
const EVERYTHING_CLI_EMPTY_DB_THRESHOLD = 1
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

const EVERYTHING_APP_CANDIDATES = [
  'C:\\Program Files\\Everything\\Everything.exe',
  'C:\\Program Files (x86)\\Everything\\Everything.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Tuff', 'Everything', 'Everything.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Tuff', 'Everything', 'everything.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Everything', 'Everything.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Everything', 'Everything.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Everything', 'Everything.exe')
].filter((candidate): candidate is string => Boolean(candidate))

function uniqueCandidates(candidates: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const unique: string[] = []

  for (const candidate of candidates) {
    const normalized = typeof candidate === 'string' ? candidate.trim() : ''
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(normalized)
  }

  return unique
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

const EVERYTHING_TEST_QUERY = '*.txt'

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
  private installationStatus: EverythingInstallationStatus =
    this.createUnsupportedInstallationStatus()
  private pathFilteringStatus: EverythingPathFilteringStatus = {
    enabled: false,
    allowedRootCount: 0,
    lastRawResultCount: null,
    lastFilteredResultCount: null,
    lastDroppedResultCount: null,
    lastChecked: null,
    reason: 'everything-independent-backend'
  }
  private startupRefreshPromise: Promise<void> | null = null
  private portableIndexRepairAttempted = false
  private readonly diagnosticsTracker = new EverythingDiagnosticsTracker()
  private readonly iconCache = new EverythingIconCache()
  private installJob: EverythingInstallJobState | null = null
  private readonly backendService = new EverythingBackendService()
  private readonly installService = new EverythingInstallService()
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
      if (!this.isEnabled) {
        this.isAvailable = false
        this.backend = 'unavailable'
        this.initializationError = null
        this.lastBackendError = null
        this.lastBackendErrorCode = null
        this.lastChecked = Date.now()
        await this.refreshInstallationStatusSafe()
        return false
      }

      const initialized = await this.initializeSearchBackend()
      this.isAvailable = initialized
      this.lastChecked = Date.now()

      if (initialized) {
        this.initializationError = null
        await this.refreshInstallationStatusSafe()
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
      await this.refreshInstallationStatusSafe()
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
      await this.refreshInstallationStatusSafe()
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

  private createUnsupportedInstallationStatus(): EverythingInstallationStatus {
    return {
      supported: process.platform === 'win32',
      state: process.platform === 'win32' ? 'unknown' : 'unsupported',
      recommendation: process.platform === 'win32' ? 'check-manually' : 'unsupported',
      everythingInstalled: process.platform === 'win32' ? null : false,
      everythingRunning: process.platform === 'win32' ? null : false,
      serviceRunning: process.platform === 'win32' ? null : false,
      cliFound: false,
      appPath: null,
      cliPath: null,
      checkedAt: null,
      reason:
        process.platform === 'win32'
          ? 'Everything installation has not been checked yet.'
          : 'Everything is only available on Windows.'
    }
  }

  private async getCliCandidates(): Promise<string[]> {
    const registryCandidates = await this.getWindowsRegistryPathExecutableCandidates('es.exe')

    return uniqueCandidates([
      'es.exe',
      ...registryCandidates,
      'C:\\Program Files\\Everything\\es.exe',
      'C:\\Program Files (x86)\\Everything\\es.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Everything', 'es.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Everything', 'es.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Everything', 'es.exe')
    ])
  }

  private async isEverythingProcessRunning(): Promise<boolean | null> {
    try {
      const { stdout } = await execFileAsync(
        'tasklist',
        ['/FI', 'IMAGENAME eq Everything.exe', '/FO', 'CSV', '/NH'],
        { timeout: 2000, windowsHide: true }
      )
      return /"Everything\.exe"/i.test(String(stdout))
    } catch (error) {
      this.logDebug('Everything process probe failed', { error: getErrorMessage(error) })
      return null
    }
  }

  private async getEverythingServiceStatus(): Promise<{
    exists: boolean | null
    running: boolean | null
  }> {
    try {
      const { stdout } = await execFileAsync('sc.exe', ['query', 'Everything'], {
        timeout: 2000,
        windowsHide: true
      })
      const output = String(stdout)
      return {
        exists: true,
        running: /\bSTATE\s*:\s*\d+\s+RUNNING\b/i.test(output)
      }
    } catch (error) {
      const message = getErrorMessage(error)
      if (/1060|does not exist|does not exist as an installed service/i.test(message)) {
        return { exists: false, running: false }
      }

      if (isRecord(error)) {
        const output = [error.stdout, error.stderr]
          .filter((value): value is string => typeof value === 'string')
          .join('\n')
        if (/1060|does not exist|does not exist as an installed service/i.test(output)) {
          return { exists: false, running: false }
        }
      }

      this.logDebug('Everything service probe failed', { error: message })
      return { exists: null, running: null }
    }
  }

  private async refreshInstallationStatus(): Promise<void> {
    const checkedAt = Date.now()

    if (process.platform !== 'win32') {
      this.installationStatus = {
        ...this.createUnsupportedInstallationStatus(),
        checkedAt
      }
      return
    }

    const [appPath, processRunning, serviceStatus] = await Promise.all([
      this.installService.findExistingPath(EVERYTHING_APP_CANDIDATES),
      this.isEverythingProcessRunning(),
      this.getEverythingServiceStatus()
    ])

    const cliPath = this.backend === 'cli' ? this.esPath : null
    const cliFound = Boolean(cliPath)
    const everythingInstalled = Boolean(
      appPath || processRunning || serviceStatus.exists || cliPath || this.backend === 'sdk-napi'
    )
    const runningProbeKnown = processRunning !== null || serviceStatus.running !== null
    const everythingRunning =
      processRunning === true || serviceStatus.running === true
        ? true
        : runningProbeKnown
          ? false
          : null
    const serviceRunning = serviceStatus.running

    if (!this.isEnabled) {
      this.installationStatus = {
        supported: true,
        state: 'disabled',
        recommendation: 'enable-in-settings',
        everythingInstalled,
        everythingRunning,
        serviceRunning,
        cliFound,
        appPath,
        cliPath,
        checkedAt,
        reason: 'Everything search is disabled in Tuff settings.'
      }
      return
    }

    if (this.isAvailable && everythingRunning !== false) {
      this.installationStatus = {
        supported: true,
        state: 'ready',
        recommendation: 'ready',
        everythingInstalled,
        everythingRunning,
        serviceRunning,
        cliFound: this.backend === 'cli' ? cliFound : true,
        appPath,
        cliPath,
        checkedAt,
        reason: null
      }
      return
    }

    if (!everythingInstalled) {
      this.installationStatus = {
        supported: true,
        state: 'missing-everything',
        recommendation: 'install-everything',
        everythingInstalled: false,
        everythingRunning: false,
        serviceRunning,
        cliFound,
        appPath,
        cliPath,
        checkedAt,
        reason:
          'Everything app was not found in default locations and no running process/service was detected.'
      }
      return
    }

    if (everythingRunning === false) {
      this.installationStatus = {
        supported: true,
        state: 'not-running',
        recommendation: 'start-everything',
        everythingInstalled: true,
        everythingRunning: false,
        serviceRunning,
        cliFound,
        appPath,
        cliPath,
        checkedAt,
        reason: 'Everything appears to be installed, but the app or service is not running.'
      }
      return
    }

    if (!cliFound) {
      this.installationStatus = {
        supported: true,
        state: 'missing-cli',
        recommendation: 'install-cli',
        everythingInstalled: true,
        everythingRunning: true,
        serviceRunning,
        cliFound: false,
        appPath,
        cliPath: null,
        checkedAt,
        reason:
          'Everything is running, but es.exe was not found from PATH or default install directories.'
      }
      return
    }

    this.installationStatus = {
      supported: true,
      state: 'backend-failed',
      recommendation: 'check-diagnostics',
      everythingInstalled: true,
      everythingRunning: true,
      serviceRunning,
      cliFound,
      appPath,
      cliPath,
      checkedAt,
      reason:
        this.lastBackendError || this.initializationError?.message || 'Everything backend failed.'
    }
  }

  private async refreshInstallationStatusSafe(): Promise<void> {
    try {
      await this.refreshInstallationStatus()
    } catch (error) {
      this.logWarn('Everything installation probe failed', error)
      this.installationStatus = {
        supported: process.platform === 'win32',
        state: process.platform === 'win32' ? 'unknown' : 'unsupported',
        recommendation: process.platform === 'win32' ? 'check-manually' : 'unsupported',
        everythingInstalled: null,
        everythingRunning: null,
        serviceRunning: null,
        cliFound: Boolean(this.esPath),
        appPath: null,
        cliPath: this.esPath,
        checkedAt: Date.now(),
        reason: getErrorMessage(error)
      }
    }
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

  private getDownloadCenter(): DownloadCenterRuntime {
    return downloadCenterModule
  }

  private createInstallAssetDetails(
    assets: EverythingInstallAssetSpec[],
    paths = this.installService.resolvePaths()
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
    const paths = this.installService.resolvePaths()
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
    const paths = this.installService.resolvePaths()
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
    const paths = this.installService.resolvePaths()
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
    await this.backendService.probeCli(paths.cliPath)

    this.updateInstallJob(job, {
      phase: 'configuring-path',
      progress: 88,
      message: 'Configuring Everything CLI path.'
    })
    await this.installService.ensureUserPathContains(paths.cliDir)
    job.pathConfigured = true

    this.updateInstallJob(job, {
      phase: 'probing',
      progress: 94,
      message: 'Saving Everything CLI path and refreshing backend.'
    })
    this.configuredCliPath = paths.cliPath
    this.saveSettings()
    await this.installService.writePortableConfig(paths.configPath)
    const installedEverythingExe =
      (await this.installService.findExistingPath([
        paths.everythingExe,
        path.join(paths.installDir, 'everything.exe')
      ])) || paths.everythingExe
    await this.installService.startPortableAndWait(installedEverythingExe)

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
      const actualHash = await this.installService.calculateSha256(filePath)
      if (actualHash.toLowerCase() !== asset.sha256.toLowerCase()) {
        throw new Error(
          `Checksum mismatch for ${asset.filename}: expected ${asset.sha256}, got ${actualHash}`
        )
      }
    }
  }

  private async ensureEverythingAppRunning(): Promise<boolean> {
    if (process.platform !== 'win32') return false

    const running = await this.isEverythingProcessRunning()
    if (running === true) {
      return true
    }

    const appPath = await this.installService.findExistingPath(EVERYTHING_APP_CANDIDATES)
    if (!appPath) {
      return false
    }

    try {
      await this.installService.startPortableAndWait(appPath)
      await this.refreshInstallationStatusSafe()
      this.logInfo('Started Everything app for CLI IPC search', { appPath })
      return true
    } catch (error) {
      this.logWarn('Failed to start Everything app for CLI IPC search', error, { appPath })
      return false
    }
  }

  private isManagedPortableCliPath(esPath: string | null): boolean {
    if (!esPath) return false
    const paths = this.installService.resolvePaths()
    return (
      this.normalizeWindowsPathForFilter(esPath) ===
      this.normalizeWindowsPathForFilter(paths.cliPath)
    )
  }

  private async shouldRepairPortableEmptyDatabase(signal?: AbortSignal): Promise<boolean> {
    if (process.platform !== 'win32') return false
    if (this.portableIndexRepairAttempted) return false
    if (!this.isManagedPortableCliPath(this.esPath)) return false

    if (await this.installService.isPortableConfigStale()) {
      return true
    }

    try {
      const { stdout } = await execFileAsync(
        this.esPath!,
        ['-timeout', '2000', '-get-result-count', '*'],
        {
          timeout: 3500,
          signal,
          windowsHide: true
        }
      )
      const totalResults = Number.parseInt(String(stdout).trim(), 10)
      return Number.isFinite(totalResults) && totalResults <= EVERYTHING_CLI_EMPTY_DB_THRESHOLD
    } catch (error) {
      this.logDebug('Everything empty database probe failed', { error: getErrorMessage(error) })
      return false
    }
  }

  private async repairPortableEverythingIndexForCli(signal?: AbortSignal): Promise<boolean> {
    this.portableIndexRepairAttempted = true
    return await this.installService.repairPortableIndex({
      signal,
      findExistingPath: (candidates) => this.installService.findExistingPath(candidates),
      onDebug: (message, meta) => this.logDebug(message, meta),
      onInfo: (message, meta) => this.logInfo(message, meta)
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
      installation: this.installationStatus,
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
      } else {
        this.isAvailable = false
        this.backend = 'unavailable'
        this.lastChecked = Date.now()
        await this.refreshInstallationStatusSafe()
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
        await this.backendService.probeCli(nextCliPath)
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

    transport.on(everythingTestEvent, async (payload) => {
      const testQuery = payload?.query?.trim() || EVERYTHING_TEST_QUERY

      if (!this.isAvailable || !this.isEnabled) {
        return {
          success: false,
          backend: this.backend,
          health: this.getHealthStatus().health,
          query: testQuery,
          error: 'Everything is not available or disabled',
          pathFiltering: this.pathFilteringStatus,
          backendAttempts: this.diagnosticsTracker.snapshot(),
          durationByStage: this.diagnosticsTracker.durationByStage()
        }
      }

      const testStart = performance.now()
      try {
        const results =
          this.backend === 'sdk-napi'
            ? await this.searchEverythingWithSdk(testQuery, 10)
            : this.backend === 'cli'
              ? await this.searchEverythingWithCli(testQuery, 10)
              : []
        const duration = performance.now() - testStart

        return {
          success: true,
          backend: this.backend,
          health: this.getHealthStatus().health,
          query: testQuery,
          resultCount: results.length,
          duration: Math.round(duration),
          sample: toEverythingResultSample(results[0] ?? null),
          pathFiltering: this.pathFilteringStatus,
          backendAttempts: this.diagnosticsTracker.snapshot(),
          durationByStage: this.diagnosticsTracker.durationByStage()
        }
      } catch (error: unknown) {
        return {
          success: false,
          backend: this.backend,
          health: this.getHealthStatus().health,
          query: testQuery,
          errorCode: getErrorCode(error) || (isAbortError(error) ? 'ABORT_ERR' : null),
          error: getErrorMessage(error),
          pathFiltering: this.pathFilteringStatus,
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
    const candidates = this.backendService.sdkCandidates()

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
    const addon = await this.backendService.loadSdkAddon(candidate)
    if (!addon) {
      this.backendAttemptErrors[candidate] = 'Unable to load Everything SDK candidate'
    }
    return addon
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
    const discovered = await this.backendService.discoverCli({
      configuredPath: this.configuredCliPath?.trim() || null,
      candidates: () => this.getCliCandidates(),
      probe: (candidate) => this.backendService.probeCli(candidate),
      onCandidateFailure: (candidate, error) => {
        this.backendAttemptErrors[candidate] = getErrorMessage(error)
      }
    })
    this.esPath = discovered.path
    this.everythingVersion = discovered.version
    this.logInfo('Found Everything CLI', {
      path: discovered.path,
      version: discovered.version
    })
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

    const pathValues = await this.backendService.readRegistryPathValues((error) => {
      this.backendAttemptErrors['registry:PATH'] = getErrorMessage(error)
      this.logWarn('Failed to read Windows PATH registry entries', error)
    })
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
        return await this.searchEverythingWithSdk(query, maxResults, signal)
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
      return await this.searchEverythingWithCli(query, maxResults, signal)
    }

    return []
  }

  private normalizeWindowsPathForFilter(value: string): string {
    return path.win32
      .normalize(value.trim())
      .replace(/[\\/]+$/, '')
      .toLowerCase()
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
    try {
      const results = await this.backendService.searchSdk(this.sdkAddon, query, maxResults, signal)
      throwIfAborted(signal)
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

    const runCliSearch = async (): Promise<EverythingSearchResult[]> => {
      const results = await this.backendService.searchCli(this.esPath!, query, maxResults, signal)
      throwIfAborted(signal)
      return results
    }

    try {
      let results: EverythingSearchResult[]
      try {
        results = await runCliSearch()
      } catch (error) {
        if (isAbortError(error) || !this.backendService.isIpcUnavailable(error)) {
          throw error
        }

        const started = await this.ensureEverythingAppRunning()
        if (!started) {
          throw Object.assign(
            new Error(
              'Everything is not running. Tuff could not start Everything.exe automatically. Open Install and Repair or start Everything manually.'
            ),
            { code: 'EVERYTHING_IPC_UNAVAILABLE' }
          )
        }

        throwIfAborted(signal)
        try {
          results = await runCliSearch()
        } catch (retryError) {
          if (!this.backendService.isIpcUnavailable(retryError)) {
            throw retryError
          }
          throw Object.assign(
            new Error(
              'Everything is still not ready after starting. Wait a moment, then run the test again.'
            ),
            { code: 'EVERYTHING_IPC_UNAVAILABLE' }
          )
        }
      }

      if (results.length === 0 && (await this.shouldRepairPortableEmptyDatabase(signal))) {
        const repaired = await this.repairPortableEverythingIndexForCli(signal)
        if (repaired) {
          throwIfAborted(signal)
          results = await runCliSearch()
        }
      }

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
    const everythingQuery = buildEverythingQuery(searchText)

    try {
      const backendResults = await this.searchEverything(
        everythingQuery,
        EVERYTHING_SEARCH_FETCH_LIMIT,
        signal
      )
      const results = backendResults
        .filter(
          (result) =>
            fileFilterService.getSearchExclusionReason({
              path: result.path,
              name: result.name,
              extension: result.extension,
              isDirectory: result.isDir
            }) === null
        )
        .slice(0, EVERYTHING_SEARCH_MAX_RESULTS)
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
