import type {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { ProviderContext } from '../../search-engine/types'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { promisify } from 'node:util'
import { StorageList, TuffInputType, TuffSearchResultBuilder } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { shell } from 'electron'
import { formatDuration } from '../../../../utils/logger'
import { getMainConfig, saveMainConfig } from '../../../storage'
import { searchLogger } from '../../search-engine/search-logger'
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

interface EverythingSearchResult {
  path: string
  name: string
  extension: string
  size: number
  mtime: Date
  ctime: Date
}

type EverythingBackendType = 'sdk-napi' | 'cli' | 'unavailable'

interface EverythingSdkAddon {
  search?: (query: string, options?: { maxResults?: number }) => unknown
  query?: (query: string, options?: { maxResults?: number }) => unknown
  getVersion?: () => string
}

const everythingStatusEvent = defineRawEvent<
  void,
  {
    enabled: boolean
    available: boolean
    backend: EverythingBackendType
    version: string | null
    esPath: string | null
    error: string | null
    lastBackendError: string | null
    fallbackChain: EverythingBackendType[]
    lastChecked: number | null
  }
>('everything:status')
const everythingToggleEvent = defineRawEvent<
  { enabled: boolean },
  { success: boolean; enabled: boolean }
>('everything:toggle')
const everythingTestEvent = defineRawEvent<
  void,
  {
    success: boolean
    backend?: EverythingBackendType
    error?: string
    resultCount?: number
    duration?: number
  }
>('everything:test')

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
  private everythingVersion: string | null = null
  private sdkAddon: EverythingSdkAddon | null = null
  private lastChecked: number | null = null

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

  async onLoad(context: ProviderContext): Promise<void> {
    if (process.platform !== 'win32') {
      this.logInfo('Everything provider is Windows-only, skipping initialization')
      return
    }

    const loadStart = performance.now()
    this.logInfo('Initializing Everything provider')

    await this.loadSettings(context)

    try {
      const initialized = await this.initializeSearchBackend()
      this.isAvailable = initialized
      this.lastChecked = Date.now()

      if (initialized) {
        this.logInfo('Everything provider initialized successfully', {
          duration: formatDuration(performance.now() - loadStart),
          backend: this.backend,
          path: this.esPath || 'unknown',
          enabled: this.isEnabled
        })
      } else {
        throw new Error('No available Everything backend (SDK/CLI)')
      }
    } catch (error) {
      this.initializationError = error as Error
      this.isAvailable = false
      this.backend = 'unavailable'
      this.lastChecked = Date.now()
      this.logWarn('Everything not available', error, {
        duration: formatDuration(performance.now() - loadStart)
      })
    }

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

  private registerChannels(context: ProviderContext): void {
    const channel = context.touchApp.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    const transport = getTuffTransportMain(channel, keyManager)

    transport.on(everythingStatusEvent, async () => {
      return {
        enabled: this.isEnabled,
        available: this.isAvailable,
        backend: this.backend,
        version: this.everythingVersion,
        esPath: this.esPath,
        error: this.initializationError?.message || null,
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
          resultCount: results.length,
          duration: Math.round(duration)
        }
      } catch (error: unknown) {
        return {
          success: false,
          backend: this.backend,
          error: getErrorMessage(error)
        }
      }
    })
  }

  private async initializeSearchBackend(): Promise<boolean> {
    this.backend = 'unavailable'
    this.initializationError = null
    this.lastBackendError = null
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
    const candidates = [
      envPath,
      path.join(process.resourcesPath, 'native', 'everything.node'),
      path.join(process.resourcesPath, 'everything', 'everything.node'),
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
    maxResults = 50
  ): Promise<EverythingSearchResult[]> {
    if (this.backend === 'sdk-napi') {
      try {
        return await this.searchEverythingWithSdk(query, maxResults)
      } catch (error) {
        this.lastBackendError = getErrorMessage(error)
        this.logWarn('Everything SDK search failed, falling back to CLI', error)
        const cliReady = await this.ensureCliFallback()
        if (!cliReady) {
          return []
        }
      }
    }

    if (this.backend === 'cli') {
      return this.searchEverythingWithCli(query, maxResults)
    }

    return []
  }

  private async ensureCliFallback(): Promise<boolean> {
    const ready = await this.tryInitializeCliBackend()
    if (!ready) {
      this.backend = 'unavailable'
      this.isAvailable = false
      this.initializationError = new Error(
        this.lastBackendError || 'Everything backend unavailable'
      )
      return false
    }
    this.initializationError = null
    return true
  }

  private async searchEverythingWithSdk(
    query: string,
    maxResults: number
  ): Promise<EverythingSearchResult[]> {
    if (!this.sdkAddon) {
      throw new Error('Everything SDK not initialized')
    }

    const searchStart = performance.now()
    const searchFn = this.sdkAddon.search ?? this.sdkAddon.query

    if (typeof searchFn !== 'function') {
      throw new TypeError('Everything SDK search method is not available')
    }

    const rawResults = await Promise.resolve(
      searchFn.call(this.sdkAddon, query, {
        maxResults
      })
    )

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
        ? nameValue && path.basename(pathValue).toLowerCase() !== nameValue.toLowerCase()
          ? path.join(pathValue, nameValue)
          : pathValue
        : nameValue

      if (!filePath) {
        continue
      }

      const name = nameValue || path.basename(filePath)
      const extensionValue =
        typeof entry.extension === 'string' ? entry.extension : path.extname(name)
      const sizeValue =
        typeof entry.size === 'number'
          ? entry.size
          : typeof entry.fileSize === 'number'
            ? entry.fileSize
            : 0

      normalized.push({
        path: filePath,
        name,
        extension: extensionValue.toLowerCase().replace(/^\./, ''),
        size: sizeValue,
        mtime: this.toResultDate(entry.mtime ?? entry.dateModified ?? entry.modifiedAt),
        ctime: this.toResultDate(entry.ctime ?? entry.dateCreated ?? entry.createdAt)
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
      return Number.isNaN(date.getTime()) ? new Date() : date
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

    return new Date()
  }

  private async searchEverythingWithCli(
    query: string,
    maxResults = 50
  ): Promise<EverythingSearchResult[]> {
    if (!this.esPath) {
      throw new Error('Everything CLI not initialized')
    }

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
        windowsHide: true
      })

      const results = this.parseEverythingOutput(stdout)

      this.logDebug('Everything CLI search completed', {
        query,
        results: results.length,
        duration: formatDuration(performance.now() - searchStart)
      })

      return results
    } catch (error: unknown) {
      if (getErrorCode(error) === 'ETIMEDOUT') {
        this.logWarn('Everything CLI search timed out', error, { query })
      } else {
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
    const lines = output.trim().split('\n').filter(Boolean)
    const results: EverythingSearchResult[] = []

    for (const line of lines) {
      try {
        // Everything output format: "path","size","date_modified","date_created"
        const parts = line.split(',').map((part) => part.trim().replace(/^"|"$/g, ''))

        if (parts.length < 4) {
          continue
        }

        const [filePath, sizeStr, mtimeStr, ctimeStr] = parts

        if (!filePath) {
          continue
        }

        const name = path.basename(filePath)
        const extension = path.extname(filePath).toLowerCase().replace(/^\./, '')
        const size = Number.parseInt(sizeStr, 10) || 0
        const mtime = new Date(mtimeStr || Date.now())
        const ctime = new Date(ctimeStr || Date.now())

        results.push({
          path: filePath,
          name,
          extension,
          size,
          mtime,
          ctime
        })
      } catch (error) {
        this.logWarn('Failed to parse Everything result line', error, { line })
      }
    }

    return results
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

    // If query contains spaces, treat as phrase search
    if (trimmed.includes(' ') && !trimmed.includes('"')) {
      return `"${trimmed}"`
    }

    return trimmed
  }

  async onSearch(query: TuffQuery, _signal: AbortSignal): Promise<TuffSearchResult> {
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

    searchLogger.logProviderSearch('everything-provider', query.text, 'Everything')

    const searchText = query.text.trim()
    if (!searchText) {
      return new TuffSearchResultBuilder(query).build()
    }

    const searchStart = performance.now()
    const everythingQuery = this.buildEverythingQuery(searchText)

    try {
      const results = await this.searchEverything(everythingQuery, 50)

      if (results.length === 0) {
        return new TuffSearchResultBuilder(query).build()
      }

      // Convert Everything results to TuffItems
      const now = Date.now()
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
          isDir: false,
          type: 'file' as const,
          content: null,
          embeddingStatus: 'none' as const
        }

        const tuffItem = mapFileToTuffItem(
          fileObj,
          {}, // No extensions metadata for Everything results
          this.id,
          this.name,
          () => {} // No icon loading for now
        )

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
