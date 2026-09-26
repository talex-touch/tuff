import type { IExecuteArgs, TuffSearchResult, TuffQuery } from '@talex-touch/utils'
import type { FileFilterReason } from '@talex-touch/utils/common/file-filter-service'
import type { FileScanOptions } from '@talex-touch/utils/common/file-scan-constants'
import type { ProviderContext } from '../../search-engine/types'
import type { files as filesSchema } from '../../../../db/schema'
import type { ISearchProvider } from '@talex-touch/utils'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { StorageList, TuffInputType, TuffSearchResultBuilder } from '@talex-touch/utils'
import { fileFilterService } from '@talex-touch/utils/common/file-filter-service'
import { getLogger } from '@talex-touch/utils/common/logger'
import { resolveIndexedWatchRootSet } from '@talex-touch/utils/search'
import { app, shell } from 'electron'
import { normalizeTuffItemLocalAssets } from '../../../../utils/local-renderable-assets'
import { formatDuration } from '../../../../utils/logger'
import { getMainConfig } from '../../../storage'
import { searchLogger } from '../../search-engine/search-logger'
import type { FileIndexSettings } from './types'
import { EverythingIconCache } from './everything-icon-cache'
import { getFileAssetBridge, type IndexedFileAssets } from './file-asset-bridge'
import { getDirectoryLevelExclusionReason, mapFileToTuffItem } from './utils'

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
/**
 * Candidates examined per query before the result list is cut to its 50. The directory rule
 * below can drop most of a native backend's head — for "wx", mdfind's first 13 hits were one
 * build's `out/renderer/assets` — so the pool is wider than what is shown. It stays bounded
 * because each distinct parent directory costs a (cached) lookup.
 */
const NATIVE_SEARCH_CANDIDATE_POOL = 150
const NATIVE_SEARCH_DIRECTORY_CACHE_LIMIT = 2_048
/** A verdict can flip when a project marker appears beside a folder; re-read after this long. */
const NATIVE_SEARCH_DIRECTORY_CACHE_TTL_MS = 5 * 60_000
const NATIVE_ICON_WARMUP_LIMIT = 12
const MAC_SPOTLIGHT_DEFAULT_PATH_NAMES = ['home'] as const

interface MacSpotlightSearchRoot {
  path: string
  key: string
}

interface NativeSearchDirectoryVerdict {
  reason: Promise<FileFilterReason | null>
  expiresAt: number
}

/**
 * The file index's directory rule applied to native search results (D-b, 2026-09-26): a result
 * is hidden when its folder, or any folder between it and the search root, is one the index
 * never enters — build output beside a project marker, dependency folders, dot folders,
 * `~/Library`. Spotlight only used the file-level search rule, so a query like "wx" was answered
 * with `out/renderer/assets`, `dist/_nuxt`, `node_modules` and `~/Library/Application Support`
 * entries the index itself would never hold.
 *
 * Each level is judged by `getDirectoryLevelExclusionReason`, the same per-level rule the file
 * index applies to watched paths, and every directory's verdict (its own name plus everything
 * above it) is cached, so sibling results share one walk and a folder's entries are read at most
 * once per TTL. The search root itself is never judged: it is where the user asked to look.
 */
class NativeSearchDirectoryFilter {
  private readonly verdicts = new Map<string, NativeSearchDirectoryVerdict>()

  constructor(
    private readonly normalizeKey: (directoryPath: string) => string,
    private readonly readdir: (directoryPath: string) => Promise<string[]> = (target) =>
      fs.readdir(target),
    private readonly now: () => number = Date.now,
    /** Scan options for the levels under one root key; see `findMacICloudDriveRootKey`. */
    private readonly levelOptionsOf: (rootKey: string | null) => FileScanOptions | undefined = () =>
      undefined
  ) {}

  /** Candidates whose folders the index would enter, in their original order, up to `limit`. */
  async selectVisible(
    candidates: readonly string[],
    limit: number,
    rootKeyOf: (filePath: string) => string | null = () => null
  ): Promise<string[]> {
    const reasons = await Promise.all(
      candidates.map((candidate) =>
        this.getDirectoryReason(path.dirname(candidate), rootKeyOf(candidate))
      )
    )
    const visible: string[] = []
    for (let index = 0; index < candidates.length && visible.length < limit; index += 1) {
      if (reasons[index] === null) visible.push(candidates[index]!)
    }
    return visible
  }

  /** Drops directory results that are themselves folders the index never enters. */
  async dropExcludedDirectories(
    results: NativeFileSearchResult[],
    rootKeyOf: (filePath: string) => string | null = () => null
  ): Promise<NativeFileSearchResult[]> {
    const reasons = await Promise.all(
      results.map((result) =>
        result.isDir
          ? this.getDirectoryReason(result.path, rootKeyOf(result.path))
          : Promise.resolve(null)
      )
    )
    return results.filter((_result, index) => reasons[index] === null)
  }

  private getDirectoryReason(
    directoryPath: string,
    rootKey: string | null
  ): Promise<FileFilterReason | null> {
    const key = `${rootKey ?? ''}\u0000${directoryPath}`
    const now = this.now()
    const cached = this.verdicts.get(key)
    if (cached && cached.expiresAt > now) {
      // Refresh recency: Map order is the eviction order.
      this.verdicts.delete(key)
      this.verdicts.set(key, cached)
      return cached.reason
    }

    const reason = this.resolveDirectoryReason(directoryPath, rootKey)
    this.verdicts.delete(key)
    this.verdicts.set(key, {
      reason,
      expiresAt: now + NATIVE_SEARCH_DIRECTORY_CACHE_TTL_MS
    })
    while (this.verdicts.size > NATIVE_SEARCH_DIRECTORY_CACHE_LIMIT) {
      const oldest = this.verdicts.keys().next().value
      if (oldest === undefined) break
      this.verdicts.delete(oldest)
    }
    return reason
  }

  private async resolveDirectoryReason(
    directoryPath: string,
    rootKey: string | null
  ): Promise<FileFilterReason | null> {
    if (rootKey !== null && this.normalizeKey(directoryPath) === rootKey) return null
    // Ancestors first: inside an excluded tree nothing below needs its own (possibly readdir)
    // check.
    const parent = path.dirname(directoryPath)
    if (parent !== directoryPath) {
      const inherited = await this.getDirectoryReason(parent, rootKey)
      if (inherited) return inherited
    }
    return await getDirectoryLevelExclusionReason(
      directoryPath,
      this.readdir,
      this.levelOptionsOf(rootKey)
    )
  }
}

function normalizeMacSpotlightPathKey(filePath: string): string {
  const resolved = path.resolve(filePath.trim()).replace(/\\/g, '/')
  const withoutTrailingSlash = resolved.length > 1 ? resolved.replace(/\/+$/, '') : resolved
  return withoutTrailingSlash.toLowerCase()
}

function createMacSpotlightSearchRoots(candidates: string[]): MacSpotlightSearchRoot[] {
  const rootSet = resolveIndexedWatchRootSet({
    basePaths: candidates.map((candidate) =>
      typeof candidate === 'string' && candidate.trim() ? path.resolve(candidate.trim()) : ''
    ),
    normalizePath: normalizeMacSpotlightPathKey
  })
  return rootSet.paths.map((rootPath, index) => ({
    path: rootPath,
    key: rootSet.normalizedPaths[index]!
  }))
}

function readFileIndexExtraPaths(): string[] {
  try {
    const settings = getMainConfig(StorageList.FILE_INDEX_SETTINGS) as
      | Partial<FileIndexSettings>
      | undefined
    return Array.isArray(settings?.extraPaths)
      ? settings.extraPaths.filter((value): value is string => typeof value === 'string')
      : []
  } catch {
    return []
  }
}

function getDefaultMacSpotlightSearchPathCandidates(): string[] {
  const candidates: string[] = []

  for (const name of MAC_SPOTLIGHT_DEFAULT_PATH_NAMES) {
    try {
      const value = app.getPath(name)
      if (value) candidates.push(value)
    } catch {
      // Ignore unavailable Electron paths and continue with remaining roots.
    }
  }

  return candidates
}

function getMacSpotlightSearchRoots(): MacSpotlightSearchRoot[] {
  return createMacSpotlightSearchRoots([
    ...getDefaultMacSpotlightSearchPathCandidates(),
    ...readFileIndexExtraPaths()
  ])
}

function isWithinMacSpotlightSearchRoots(
  filePath: string,
  roots: readonly MacSpotlightSearchRoot[]
): boolean {
  return findMacSpotlightSearchRootKey(filePath, roots) !== null
}

function findMacSpotlightSearchRootKey(
  filePath: string,
  roots: readonly MacSpotlightSearchRoot[]
): string | null {
  const fileKey = normalizeMacSpotlightPathKey(filePath)
  return (
    roots.find((root) => fileKey === root.key || fileKey.startsWith(`${root.key}/`))?.key ?? null
  )
}

/**
 * iCloud Drive is the exception to the `~/Library` rule (user decision, 2026-09-26): the user's own
 * documents live in `~/Library/Mobile Documents` — `com~apple~CloudDocs` plus one container per
 * app (Pages, Numbers, ...). A result inside it is judged from that folder down, the way a search
 * root is, so `~/Library` above it never hides it while `node_modules` or build output below it
 * still do.
 */
function getMacICloudDriveRootKey(): string | null {
  try {
    const home = app.getPath('home')
    return home
      ? normalizeMacSpotlightPathKey(path.join(home, 'Library', 'Mobile Documents'))
      : null
  } catch {
    return null
  }
}

function findMacICloudDriveRootKey(filePath: string): string | null {
  const rootKey = getMacICloudDriveRootKey()
  if (!rootKey) return null
  return normalizeMacSpotlightPathKey(filePath).startsWith(`${rootKey}/`) ? rootKey : null
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

async function buildNativeSearchItems(
  provider: Pick<NativeFileSearchProvider, 'id' | 'name'>,
  query: TuffQuery,
  results: NativeFileSearchResult[],
  iconCache?: EverythingIconCache
): Promise<TuffSearchResult> {
  const searchText = query.text.trim()
  const now = Date.now()
  let scheduledIconWarmups = 0
  // Spotlight knows the path; the index knows the thumbnail. Without this lookup an image
  // result went out as its own path, which tfile refuses under ~/Pictures, and the row showed
  // the renderer's "image failed" square where the picture belonged.
  const bridge = getFileAssetBridge()
  const indexed = bridge
    ? await bridge.lookupIndexedFiles(results.map((result) => result.path))
    : new Map<string, IndexedFileAssets>()
  const items = results.flatMap((result, index) => {
    const known = indexed.get(result.path)
    const fileObj =
      known?.file ??
      ({
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
      } satisfies typeof filesSchema.$inferSelect)

    const iconSource = { mtimeMs: result.mtime.getTime(), size: result.size }
    const cachedIcon = iconCache?.get(result.path, iconSource)
    const extensions: Record<string, string> = { ...(known?.extensions ?? {}) }
    if (cachedIcon) {
      extensions.icon = cachedIcon
      delete extensions.iconMeta
    }
    const item = mapFileToTuffItem(
      fileObj,
      extensions,
      provider.id,
      provider.name || provider.id,
      cachedIcon || result.isDir || scheduledIconWarmups >= NATIVE_ICON_WARMUP_LIMIT
        ? undefined
        : (file) => {
            scheduledIconWarmups += 1
            void iconCache?.ensure(file.path, iconSource)
          },
      known && bridge
        ? (file) => {
            void bridge.ensureThumbnail(file, extensions).catch(() => undefined)
          }
        : undefined
    )
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
  // Deferred, not fast: a native lookup is a child process that takes hundreds of milliseconds
  // (Spotlight ~300-900ms on a real library), which can never fit the 80ms fast-layer window. As
  // a fast provider it only ever arrived as a late result, ~1s after the snapshot had already
  // shrunk the window - the bounce users saw on every pause while typing.
  readonly priority = 'deferred' as const
  private readonly iconCache = new EverythingIconCache()
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
      return await buildNativeSearchItems(this, query, results, this.iconCache)
    } catch (error) {
      if (!isAbortError(error)) {
        this.lastError = error instanceof Error ? error.message : String(error)
        nativeFileSearchLog.debug(`[${this.id}] search failed`, { error: this.lastError })
      }
      return emptyResult(query)
    }
  }

  async onExecute(args: IExecuteArgs): Promise<null> {
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
  private readonly directoryFilter = new NativeSearchDirectoryFilter(
    normalizeMacSpotlightPathKey,
    undefined,
    undefined,
    // Inside iCloud Drive the `~/Library` system-path pattern would still match every level, so
    // it is off there; name rules (dependencies, dot folders, build output) still apply.
    (rootKey) =>
      rootKey !== null && rootKey === getMacICloudDriveRootKey()
        ? { enableSystemPathFilter: false }
        : undefined
  )

  protected async detect(): Promise<boolean> {
    await execFileAsync('mdfind', ['-version'], { timeout: 1000 }).catch(() => undefined)
    return true
  }

  protected async searchNative(
    text: string,
    signal: AbortSignal
  ): Promise<NativeFileSearchResult[]> {
    const searchRoots = getMacSpotlightSearchRoots()
    if (searchRoots.length === 0) {
      return []
    }

    const escaped = text.replace(/["\\]/g, '\\$&')
    // File-name only. The display-name clause made mdfind ~3x slower for the same result set:
    // 900-1245ms vs 300-350ms on a 6GB-index library, with the paths returned being identical.
    const query = `kMDItemFSName == "*${escaped}*"cd`
    const scopeArgs = searchRoots.flatMap((root) => ['-onlyin', root.path])
    const { stdout } = await execFileAsync('mdfind', ['-0', ...scopeArgs, query], {
      timeout: 1200,
      maxBuffer: 1024 * 1024 * 5,
      signal
    })
    const candidates = Array.from(
      new Set(
        stdout
          .split('\0')
          .map((entry) => entry.trim())
          .filter(Boolean)
          .filter((entry) => isWithinMacSpotlightSearchRoots(entry, searchRoots))
          .filter((entry) => fileFilterService.getSearchExclusionReason({ path: entry }) === null)
      )
    ).slice(0, NATIVE_SEARCH_CANDIDATE_POOL)
    const rootKeyOf = (entry: string): string | null =>
      findMacICloudDriveRootKey(entry) ?? findMacSpotlightSearchRootKey(entry, searchRoots)
    const paths = await this.directoryFilter.selectVisible(
      candidates,
      NATIVE_SEARCH_MAX_RESULTS,
      rootKeyOf
    )
    if (signal.aborted) return []
    const results = await Promise.all(paths.map((filePath) => toNativeResult(filePath)))
    return await this.directoryFilter.dropExcludedDirectories(
      results.filter((result): result is NativeFileSearchResult => Boolean(result)),
      rootKeyOf
    )
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
  // No search roots here: the backends answer for the whole filesystem, so the walk runs to `/`.
  private readonly directoryFilter = new NativeSearchDirectoryFilter(
    (directoryPath) => directoryPath
  )

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
    const candidates = this.parseOutput(stdout)
      .filter((entry) => fileFilterService.getSearchExclusionReason({ path: entry }) === null)
      .slice(0, NATIVE_SEARCH_CANDIDATE_POOL)
    const paths = await this.directoryFilter.selectVisible(candidates, NATIVE_SEARCH_MAX_RESULTS)
    if (signal.aborted) return []
    const results = await Promise.all(paths.map((filePath) => toNativeResult(filePath)))
    return await this.directoryFilter.dropExcludedDirectories(
      results.filter((result): result is NativeFileSearchResult => Boolean(result))
    )
  }

  private buildSearchCommand(text: string): { command: string; args: string[] } {
    // Ask for the candidate pool, not the visible 50: the directory rule drops part of it.
    const limit = String(NATIVE_SEARCH_CANDIDATE_POOL)
    switch (this.backend) {
      case 'tracker3':
        return { command: 'tracker3', args: ['search', '--files', '--limit', limit, text] }
      case 'tracker':
        return { command: 'tracker', args: ['search', '--files', '--limit', limit, text] }
      case 'baloo':
        return { command: 'baloosearch', args: ['--limit', limit, text] }
      case 'locate':
      default:
        return { command: 'locate', args: ['-i', '-l', limit, text] }
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
  createMacSpotlightSearchRoots,
  isWithinMacSpotlightSearchRoots
}
