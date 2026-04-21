import type {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { ProviderContext } from '../../search-engine/types'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { promisify } from 'node:util'
import {
  StorageList,
  TuffInputType,
  TuffItemBuilder,
  TuffSearchResultBuilder
} from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { shell } from 'electron'
import {
  everythingStatusEvent,
  everythingTestEvent,
  everythingToggleEvent,
  type EverythingBackendType
} from '../../../../../shared/events/everything'
import { appTaskGate } from '../../../../service/app-task-gate'
import { formatDuration } from '../../../../utils/logger'
import { getMainConfig, saveMainConfig } from '../../../storage'
import { searchLogger } from '../../search-engine/search-logger'
import { IconWorkerClient } from './workers/icon-worker-client'
import { mapFileToTuffItem } from './utils'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const getErrorCode = (error: unknown): string | undefined => {
  if (!isRecord(error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const execFileAsync = promisify(execFile)
const requireFromCurrentModule = createRequire(import.meta.url)
const fileProviderLog = getLogger('file-provider')
const EVERYTHING_ICON_CACHE_LIMIT = 256
const EVERYTHING_ICON_WARMUP_LIMIT = 12

class EverythingSearchAbortedError extends Error {
  readonly code = 'ABORT_ERR'

  constructor() {
    super('Everything search aborted')
    this.name = 'AbortError'
  }
}

function isAbortError(error: unknown): boolean {
  if (error instanceof EverythingSearchAbortedError) {
    return true
  }
  if (!isRecord(error)) {
    return false
  }
  return error.name === 'AbortError' || error.code === 'ABORT_ERR' || error.code === 'ABORTED'
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new EverythingSearchAbortedError()
  }
}

function createAbortPromise<T = never>(signal?: AbortSignal): Promise<T> | null {
  if (!signal) {
    return null
  }
  if (signal.aborted) {
    return Promise.reject(new EverythingSearchAbortedError())
  }
  return new Promise<T>((_, reject) => {
    signal.addEventListener('abort', () => reject(new EverythingSearchAbortedError()), {
      once: true
    })
  })
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
  private isAvailable = false
  private initializationError: Error | null = null
  private isEnabled = true
  private backend: EverythingBackendType = 'unavailable'
  private readonly fallbackChain: EverythingBackendType[] = ['sdk-napi', 'cli', 'unavailable']
  private lastBackendError: string | null = null
  private lastBackendErrorCode: string | null = null
  private everythingVersion: string | null = null
  private sdkAddon: EverythingSdkAddon | null = null
  private lastChecked: number | null = null
  private readonly iconWorker = new IconWorkerClient()
  private readonly iconCache = new Map<string, string>()
  private readonly iconExtractions = new Map<string, Promise<string | null>>()

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

  private getCachedIcon(filePath: string): string | null {
    const cached = this.iconCache.get(filePath)
    if (!cached) {
      return null
    }

    this.iconCache.delete(filePath)
    this.iconCache.set(filePath, cached)
    return cached
  }

  private setCachedIcon(filePath: string, iconValue: string): void {
    if (this.iconCache.has(filePath)) {
      this.iconCache.delete(filePath)
    }

    this.iconCache.set(filePath, iconValue)

    while (this.iconCache.size > EVERYTHING_ICON_CACHE_LIMIT) {
      const oldestKey = this.iconCache.keys().next().value
      if (!oldestKey) {
        break
      }
      this.iconCache.delete(oldestKey)
    }
  }

  private async extractResultIcon(filePath: string): Promise<string | null> {
    await appTaskGate.waitForIdle()

    const icon = await this.iconWorker.extract(filePath)
    if (!icon || icon.length === 0) {
      return null
    }

    return `data:image/png;base64,${Buffer.from(icon).toString('base64')}`
  }

  private async ensureResultIcon(filePath: string): Promise<string | null> {
    const cached = this.getCachedIcon(filePath)
    if (cached) {
      return cached
    }

    const pending = this.iconExtractions.get(filePath)
    if (pending) {
      return pending
    }

    const task = this.extractResultIcon(filePath)
      .then((iconValue) => {
        if (iconValue) {
          this.setCachedIcon(filePath, iconValue)
        }
        return iconValue
      })
      .catch((error) => {
        this.logWarn('Failed to warm icon for Everything result', error, { path: filePath })
        return null
      })
      .finally(() => {
        this.iconExtractions.delete(filePath)
      })

    this.iconExtractions.set(filePath, task)
    return task
  }

  async onLoad(context: ProviderContext): Promise<void> {
    if (process.platform !== 'win32') {
      this.logInfo('Everything provider is Windows-only, skipping initialization')
      return
    }

    this.logInfo('Initializing Everything provider')

    await this.loadSettings(context)
    await this.refreshBackendState('startup')

    this.registerChannels(context)
  }

  private async loadSettings(_context: ProviderContext): Promise<void> {
    try {
      const settings = getMainConfig(StorageList.EVERYTHING_SETTINGS) as
        | { enabled?: boolean }
        | undefined
      if (settings && typeof settings.enabled === 'boolean') {
        this.isEnabled = settings.enabled
      } else {
        this.isEnabled = true
        this.saveSettings()
      }
    } catch (error) {
      this.logWarn('Failed to load settings, using defaults', error)
      this.isEnabled = true
    }
  }

  private saveSettings(): void {
    try {
      saveMainConfig(StorageList.EVERYTHING_SETTINGS, {
        enabled: this.isEnabled
      })
    } catch (error) {
      this.logError('Failed to save settings', error)
    }
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
      .setFinalScore(1)
      .build()
  }

  private registerChannels(context: ProviderContext): void {
    const channel = context.touchApp.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    const transport = getTuffTransportMain(channel, keyManager)

    transport.on(everythingStatusEvent, async (payload) => {
      if (payload?.refresh) {
        await this.refreshBackendState('manual-check')
      }

      const healthStatus = this.getHealthStatus()
      return {
        enabled: this.isEnabled,
        available: this.isAvailable,
        backend: this.backend,
        health: healthStatus.health,
        healthReason: healthStatus.reason,
        version: this.everythingVersion,
        esPath: this.esPath,
        error: this.initializationError?.message || null,
        errorCode: this.lastBackendErrorCode,
        lastBackendError: this.lastBackendError,
        fallbackChain: this.fallbackChain,
        lastChecked: this.lastChecked
      }
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

    transport.on(everythingTestEvent, async () => {
      if (!this.isAvailable || !this.isEnabled) {
        return {
          success: false,
          backend: this.backend,
          error: 'Everything is not available or disabled'
        }
      }

      const testStart = performance.now()
      try {
        const results = await this.searchEverything('*.txt', 10)
        const duration = performance.now() - testStart

        return {
          success: true,
          backend: this.backend,
          health: this.getHealthStatus().health,
          resultCount: results.length,
          duration: Math.round(duration)
        }
      } catch (error: unknown) {
        return {
          success: false,
          backend: this.backend,
          health: this.getHealthStatus().health,
          errorCode: getErrorCode(error) || (isAbortError(error) ? 'ABORT_ERR' : null),
          error: getErrorMessage(error)
        }
      }
    })
  }

  private async initializeSearchBackend(): Promise<boolean> {
    this.backend = 'unavailable'
    this.initializationError = null
    this.lastBackendError = null
    this.lastBackendErrorCode = null
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

      this.logInfo('Everything SDK backend ready', {
        backend: this.backend,
        candidate,
        version: this.everythingVersion
      })
      return true
    }

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
      this.logDebug('Everything SDK candidate load failed', {
        candidate,
        error: getErrorMessage(error)
      })
      return null
    }
  }

  private async tryInitializeCliBackend(): Promise<boolean> {
    try {
      await this.detectEverything()
      this.backend = 'cli'
      this.isAvailable = true
      this.lastBackendError = null
      return true
    } catch (error) {
      this.lastBackendError = getErrorMessage(error)
      this.lastBackendErrorCode = getErrorCode(error) ?? null
      this.logWarn('Everything CLI backend unavailable', error)
      return false
    }
  }

  /**
   * Detect Everything Command-line Interface (es.exe)
   */
  private async detectEverything(): Promise<void> {
    const possiblePaths = [
      'es.exe', // In PATH
      'C:\\Program Files\\Everything\\es.exe',
      'C:\\Program Files (x86)\\Everything\\es.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Everything', 'es.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Everything', 'es.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Everything', 'es.exe')
    ]

    for (const esPath of possiblePaths) {
      try {
        const { stdout } = await execFileAsync(esPath, ['-v'], { timeout: 3000 })
        if (stdout.includes('es') || stdout.includes('Everything')) {
          this.esPath = esPath
          this.everythingVersion = this.parseVersion(stdout)
          this.logInfo('Found Everything CLI', {
            path: esPath,
            version: this.everythingVersion
          })
          return
        }
      } catch (_error) {
        // Continue to next path
      }
    }

    throw new Error(
      'Everything Command-line Interface (es.exe) not found. Please install Everything from https://www.voidtools.com/'
    )
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
        return await this.searchEverythingWithSdk(query, maxResults, signal)
      } catch (error) {
        if (isAbortError(error)) {
          throw error
        }
        this.lastBackendError = getErrorMessage(error)
        this.lastBackendErrorCode = getErrorCode(error) ?? null
        this.logWarn('Everything SDK search failed, falling back to CLI', error)
        const cliReady = await this.ensureCliFallback()
        if (!cliReady) {
          return []
        }
      }
    }

    if (this.backend === 'cli') {
      return this.searchEverythingWithCli(query, maxResults, signal)
    }

    return []
  }

  private async ensureCliFallback(): Promise<boolean> {
    const ready = await this.tryInitializeCliBackend()
    if (!ready) {
      this.markBackendUnavailable(this.lastBackendError || 'Everything backend unavailable')
      return false
    }
    this.initializationError = null
    return true
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

    const searchPromise = Promise.resolve(
      searchFn.call(this.sdkAddon, query, {
        maxResults
      })
    )
    const abortPromise = createAbortPromise<unknown>(signal)
    const rawResults = await (abortPromise
      ? Promise.race([searchPromise, abortPromise])
      : searchPromise)

    throwIfAborted(signal)

    const results = this.parseEverythingSdkOutput(rawResults)

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

      if (errorCode === 'ETIMEDOUT') {
        this.logWarn('Everything CLI search timed out', error, { query })
      } else {
        this.markBackendUnavailable(errorMessage, errorCode)
        this.logError('Everything CLI search failed', error, { query })
      }
      return []
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
        const cachedIcon = this.getCachedIcon(result.path)

        const tuffItem = mapFileToTuffItem(
          fileObj,
          cachedIcon ? { icon: cachedIcon } : {},
          this.id,
          this.name,
          cachedIcon || result.isDir || scheduledIconWarmups >= EVERYTHING_ICON_WARMUP_LIMIT
            ? undefined
            : (file) => {
                scheduledIconWarmups += 1
                void this.ensureResultIcon(file.path)
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

        return tuffItem
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
