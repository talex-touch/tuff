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
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { promisify } from 'node:util'
import { StorageList, TuffInputType, TuffSearchResultBuilder } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
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
const fileProviderLog = getLogger('file-provider')

interface EverythingSearchResult {
  path: string
  name: string
  extension: string
  size: number
  mtime: Date
  ctime: Date
}

const everythingStatusEvent = defineRawEvent<
  void,
  {
    enabled: boolean
    available: boolean
    version: string | null
    esPath: string | null
    error: string | null
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
  private everythingVersion: string | null = null
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

    try {
      await this.detectEverything()
      await this.loadSettings(context)
      this.isAvailable = true
      this.lastChecked = Date.now()
      this.logInfo('Everything provider initialized successfully', {
        duration: formatDuration(performance.now() - loadStart),
        esPath: this.esPath || 'unknown',
        enabled: this.isEnabled
      })
    } catch (error) {
      this.initializationError = error as Error
      this.isAvailable = false
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
        version: this.everythingVersion,
        esPath: this.esPath,
        error: this.initializationError?.message || null,
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
          error: 'Everything is not available or disabled'
        }
      }

      const testStart = performance.now()
      try {
        const results = await this.searchEverything('*.txt', 10)
        const duration = performance.now() - testStart

        return {
          success: true,
          resultCount: results.length,
          duration: Math.round(duration)
        }
      } catch (error: unknown) {
        return {
          success: false,
          error: getErrorMessage(error)
        }
      }
    })
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
   * Search files using Everything
   */
  private async searchEverything(
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

      this.logDebug('Everything search completed', {
        query,
        results: results.length,
        duration: formatDuration(performance.now() - searchStart)
      })

      return results
    } catch (error: unknown) {
      if (getErrorCode(error) === 'ETIMEDOUT') {
        this.logWarn('Everything search timed out', error, { query })
      } else {
        this.logError('Everything search failed', error, { query })
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
