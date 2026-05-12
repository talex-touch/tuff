import type { TuffSearchResult, TuffQuery } from '@talex-touch/utils'
import type { ProviderContext } from '../../search-engine/types'
import type { files as filesSchema } from '../../../../db/schema'
import type { ISearchProvider } from '@talex-touch/utils'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { TuffInputType, TuffSearchResultBuilder } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { shell } from 'electron'
import { normalizeTuffItemLocalAssets } from '../../../../utils/local-renderable-assets'
import { formatDuration } from '../../../../utils/logger'
import { searchLogger } from '../../search-engine/search-logger'
import { mapFileToTuffItem } from './utils'

export interface NativeFileSearchCapabilities {
  platform: NodeJS.Platform
  supportsRealtime: boolean
  supportsMetadata: boolean
  supportsContent: boolean
}

export interface NativeFileSearchProvider extends ISearchProvider<ProviderContext> {
  readonly capabilities: NativeFileSearchCapabilities
  isSearchReady(): boolean
}

interface NativeFileSearchResult {
  path: string
  name: string
  extension: string
  size: number
  mtime: Date
  ctime: Date
  isDir: boolean
}

type LinuxNativeSearchBackend = 'locate' | 'tracker3' | 'tracker' | 'baloo'

const nativeFileSearchLog = getLogger('file-provider').child('Native')
const execFileAsync = promisify(execFile)
const NATIVE_SEARCH_MAX_RESULTS = 50

function isMacApplicationBundlePath(filePath: string): boolean {
  return filePath
    .replace(/\\/g, '/')
    .split('/')
    .some((segment) => segment.toLowerCase().endsWith('.app'))
}

function emptyResult(query: TuffQuery): TuffSearchResult {
  return new TuffSearchResultBuilder(query).build()
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('name' in error || 'code' in error) &&
    ((error as { name?: string }).name === 'AbortError' ||
      (error as { code?: string }).code === 'ABORT_ERR')
  )
}

function normalizeExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase().replace(/^\./, '')
}

async function toNativeResult(filePath: string): Promise<NativeFileSearchResult | null> {
  try {
    const stats = await fs.stat(filePath)
    return {
      path: filePath,
      name: path.basename(filePath),
      extension: normalizeExtension(filePath),
      size: stats.size,
      mtime: stats.mtime,
      ctime: stats.ctime,
      isDir: stats.isDirectory()
    }
  } catch {
    return null
  }
}

function buildNativeSearchItems(
  provider: Pick<NativeFileSearchProvider, 'id' | 'name'>,
  query: TuffQuery,
  results: NativeFileSearchResult[]
): TuffSearchResult {
  const searchText = query.text.trim()
  const now = Date.now()
  const items = results.flatMap((result, index) => {
    const fileObj = {
      id: index,
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
    } satisfies typeof filesSchema.$inferSelect

    const item = mapFileToTuffItem(fileObj, {}, provider.id, provider.name || provider.id)
    const daysSinceModified = (now - result.mtime.getTime()) / (1000 * 3600 * 24)
    const recencyScore = Number.isFinite(daysSinceModified)
      ? Math.exp(-0.05 * Math.max(0, daysSinceModified))
      : 0
    const positionScore = results.length > 0 ? 1 - (index / results.length) * 0.5 : 1
    item.scoring = {
      final: positionScore * 0.7 + recencyScore * 0.3,
      match: 1,
      recency: recencyScore,
      frequency: 0,
      base: positionScore,
      match_details: { type: 'exact', query: searchText }
    }
    item.meta = {
      ...item.meta,
      file: {
        ...item.meta?.file,
        path: result.path,
        isDir: result.isDir
      },
      extension: {
        ...(item.meta?.extension ?? {}),
        nativeSearch: true
      }
    }

    const normalized = normalizeTuffItemLocalAssets(item, {
      dropMissingFile: false,
      fallbackKind: result.isDir ? 'folder' : 'file'
    })
    return normalized.item ? [normalized.item] : []
  })

  return new TuffSearchResultBuilder(query).setItems(items).build()
}

abstract class BaseNativeFileSearchProvider implements NativeFileSearchProvider {
  readonly type = 'file' as const
  readonly supportedInputTypes = [TuffInputType.Text, TuffInputType.Files]
  readonly priority = 'fast' as const
  readonly expectedDuration = 75
  protected available = false
  protected lastError: string | null = null

  abstract readonly id: string
  abstract readonly name: string
  abstract readonly capabilities: NativeFileSearchCapabilities
  protected abstract detect(): Promise<boolean>
  protected abstract searchNative(
    text: string,
    signal: AbortSignal
  ): Promise<NativeFileSearchResult[]>

  async onLoad(): Promise<void> {
    if (process.platform !== this.capabilities.platform) {
      this.available = false
      return
    }

    try {
      this.available = await this.detect()
      this.lastError = null
      nativeFileSearchLog.info(
        `[${this.id}] native file search ${this.available ? 'ready' : 'unavailable'}`
      )
    } catch (error) {
      this.available = false
      this.lastError = error instanceof Error ? error.message : String(error)
      nativeFileSearchLog.debug(`[${this.id}] native file search detection failed`, {
        error: this.lastError
      })
    }
  }

  isSearchReady(): boolean {
    return process.platform === this.capabilities.platform && this.available
  }

  async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult> {
    const searchText = query.text.trim()
    if (!searchText || !this.isSearchReady() || signal.aborted) {
      return emptyResult(query)
    }

    const startedAt = performance.now()
    searchLogger.logProviderSearch(this.id, searchText, this.name)

    try {
      const results = await this.searchNative(searchText, signal)
      if (signal.aborted || results.length === 0) {
        return emptyResult(query)
      }
      nativeFileSearchLog.debug(`[${this.id}] search completed`, {
        queryLength: searchText.length,
        results: results.length,
        duration: formatDuration(performance.now() - startedAt)
      })
      return buildNativeSearchItems(this, query, results)
    } catch (error) {
      if (!isAbortError(error)) {
        this.lastError = error instanceof Error ? error.message : String(error)
        nativeFileSearchLog.debug(`[${this.id}] search failed`, { error: this.lastError })
      }
      return emptyResult(query)
    }
  }

  async onExecute(args: { item: { meta?: { file?: { path?: string } } } }): Promise<null> {
    const filePath = args.item.meta?.file?.path
    if (!filePath) return null
    await shell.openPath(filePath)
    return null
  }
}

class MacSpotlightFileProvider extends BaseNativeFileSearchProvider {
  readonly id = 'macos-spotlight-provider'
  readonly name = 'Spotlight Search'
  readonly capabilities: NativeFileSearchCapabilities = {
    platform: 'darwin',
    supportsRealtime: true,
    supportsMetadata: true,
    supportsContent: true
  }

  protected async detect(): Promise<boolean> {
    await execFileAsync('mdfind', ['-version'], { timeout: 1000 }).catch(() => undefined)
    return true
  }

  protected async searchNative(
    text: string,
    signal: AbortSignal
  ): Promise<NativeFileSearchResult[]> {
    const escaped = text.replace(/["\\]/g, '\\$&')
    const query = `(kMDItemFSName == "*${escaped}*"cd || kMDItemDisplayName == "*${escaped}*"cd)`
    const { stdout } = await execFileAsync('mdfind', ['-0', query], {
      timeout: 1200,
      maxBuffer: 1024 * 1024 * 5,
      signal
    })
    const paths = Array.from(
      new Set(
        stdout
          .split('\0')
          .map((entry) => entry.trim())
          .filter(Boolean)
          .filter((entry) => !isMacApplicationBundlePath(entry))
      )
    ).slice(0, NATIVE_SEARCH_MAX_RESULTS)
    const results = await Promise.all(paths.map((filePath) => toNativeResult(filePath)))
    return results.filter((result): result is NativeFileSearchResult => Boolean(result))
  }
}

class LinuxNativeFileProvider extends BaseNativeFileSearchProvider {
  readonly id = 'linux-native-file-provider'
  readonly name = 'Linux Native File Search'
  readonly capabilities: NativeFileSearchCapabilities = {
    platform: 'linux',
    supportsRealtime: false,
    supportsMetadata: true,
    supportsContent: false
  }
  private backend: LinuxNativeSearchBackend | null = null

  protected async detect(): Promise<boolean> {
    const candidates: Array<{
      backend: LinuxNativeSearchBackend
      command: string
      args: string[]
    }> = [
      { backend: 'locate', command: 'locate', args: ['--version'] },
      { backend: 'tracker3', command: 'tracker3', args: ['--version'] },
      { backend: 'tracker', command: 'tracker', args: ['--version'] },
      { backend: 'baloo', command: 'baloosearch', args: ['--version'] }
    ]

    for (const candidate of candidates) {
      try {
        await execFileAsync(candidate.command, candidate.args, { timeout: 1000 })
        this.backend = candidate.backend
        return true
      } catch {
        // try next backend
      }
    }
    this.backend = null
    return false
  }

  protected async searchNative(
    text: string,
    signal: AbortSignal
  ): Promise<NativeFileSearchResult[]> {
    if (!this.backend) return []

    const { command, args } = this.buildSearchCommand(text)
    const { stdout } = await execFileAsync(command, args, {
      timeout: 1500,
      maxBuffer: 1024 * 1024 * 5,
      signal
    })
    const paths = this.parseOutput(stdout).slice(0, NATIVE_SEARCH_MAX_RESULTS)
    const results = await Promise.all(paths.map((filePath) => toNativeResult(filePath)))
    return results.filter((result): result is NativeFileSearchResult => Boolean(result))
  }

  private buildSearchCommand(text: string): { command: string; args: string[] } {
    switch (this.backend) {
      case 'tracker3':
        return { command: 'tracker3', args: ['search', '--files', '--limit', '50', text] }
      case 'tracker':
        return { command: 'tracker', args: ['search', '--files', '--limit', '50', text] }
      case 'baloo':
        return { command: 'baloosearch', args: ['--limit', '50', text] }
      case 'locate':
      default:
        return { command: 'locate', args: ['-i', '-l', '50', text] }
    }
  }

  private parseOutput(stdout: string): string[] {
    return Array.from(
      new Set(
        stdout
          .split(/\r?\n/)
          .map((line) => line.trim().replace(/^file:\/\//, ''))
          .filter((line) => line.startsWith('/'))
      )
    )
  }
}

export const macSpotlightFileProvider = new MacSpotlightFileProvider()
export const linuxNativeFileProvider = new LinuxNativeFileProvider()

export const __test__ = {
  isMacApplicationBundlePath
}
