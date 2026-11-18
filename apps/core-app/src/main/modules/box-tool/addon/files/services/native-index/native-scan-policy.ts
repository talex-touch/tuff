import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { NativeScanFilterOptions } from '@talex-touch/tuff-native/file-index'
import {
  fileFilterService,
  holdsProjectMarker,
  isLinkedWorktreeGitFile,
  isProjectMarker
} from '@talex-touch/utils/common/file-filter-service'
import {
  BLACKLISTED_BUNDLE_SUFFIXES,
  BLACKLISTED_EXTENSIONS,
  CONTEXT_DEPENDENT_BLACKLISTED_DIRS,
  DEV_BLACKLISTED_DIRS,
  FILE_SCAN_MAX_DEPTH,
  LINUX_SYSTEM_DIRS,
  MACOS_SYSTEM_DIRS,
  PLATFORM,
  PROJECT_MARKER_ENTRIES,
  SYSTEM_METADATA_FILE_NAMES,
  SYSTEM_METADATA_FILE_PREFIXES,
  TEMP_BLACKLISTED_DIRS,
  WINDOWS_SYSTEM_DIRS
} from '@talex-touch/utils/common/file-scan-constants'
import { normalizeFsPath } from '@talex-touch/utils/common/file-scan-utils'

export const NATIVE_ANCESTOR_CACHE_LIMIT = 2_048
export const NATIVE_ANCESTOR_CACHE_TTL_MS = 60_000

/**
 * Forward-compatible scan filter options supporting optional native suffixes/hidden flags
 * without breaking compilation before or after `@talex-touch/tuff-native` declaration updates.
 */
export type CompatibleNativeScanFilterOptions = NativeScanFilterOptions & {
  excludeDirSuffixes?: string[]
  excludeHidden?: boolean
}

const LOWERCASE_CONTEXT_DEPENDENT_DIRS = new Set(
  Array.from(CONTEXT_DEPENDENT_BLACKLISTED_DIRS, (name) => name.toLowerCase())
)

const LOWERCASE_UNCONDITIONAL_DEV_TEMP_DIRS = new Set(
  [...DEV_BLACKLISTED_DIRS, ...TEMP_BLACKLISTED_DIRS]
    .map((name) => name.toLowerCase())
    .filter(
      (name) =>
        !LOWERCASE_CONTEXT_DEPENDENT_DIRS.has(name) && !name.includes('/') && !name.includes('\\')
    )
)

const LOWERCASE_BUNDLE_SUFFIXES = Array.from(BLACKLISTED_BUNDLE_SUFFIXES, (suffix) =>
  suffix.toLowerCase()
)

const LOWERCASE_PROJECT_MARKERS = new Set(
  Array.from(PROJECT_MARKER_ENTRIES, (name) => name.toLowerCase())
)

const CANONICAL_CAPITALIZED_PROJECT_MARKERS = [
  'Build.gradle',
  'Build.gradle.kts',
  'Build.sbt',
  'Cargo.toml',
  'CMakeLists.txt',
  'Gemfile',
  'Makefile',
  'Mix.exs',
  'Package.swift'
] as const

const NATIVE_PROJECT_MARKERS = Array.from(
  new Set([...PROJECT_MARKER_ENTRIES, ...CANONICAL_CAPITALIZED_PROJECT_MARKERS])
)

const HOME_ANCHORED_TOOLCHAIN_SEGMENTS: ReadonlyArray<readonly string[]> = [
  ['go', 'pkg'],
  ['OrbStack'],
  ['orbstack']
]

interface TimedCacheEntry<T> {
  value: T
  expiresAt: number
}

export interface NativeScanPolicyOptions {
  ttlMs?: number
  maxEntries?: number
  readdir?: (directoryPath: string) => Promise<string[]>
  readFile?: (filePath: string) => Promise<string>
  now?: () => number
}

function getSystemRootDirsForCurrentPlatform(): ReadonlySet<string> {
  if (PLATFORM.IS_MACOS) return MACOS_SYSTEM_DIRS
  if (PLATFORM.IS_WINDOWS) return WINDOWS_SYSTEM_DIRS
  return LINUX_SYSTEM_DIRS
}

export function resolveMacICloudDriveRoot(): string | null {
  if (!PLATFORM.IS_MACOS) return null
  return normalizeFsPath(path.join(os.homedir(), 'Library', 'Mobile Documents'))
}

export function isBlacklistedBundleName(name: string): boolean {
  const lower = name.toLowerCase()
  for (const suffix of LOWERCASE_BUNDLE_SUFFIXES) {
    if (lower.endsWith(suffix)) return true
  }
  return false
}

function isWithinOrEqualPrefix(candidate: string, prefix: string): boolean {
  if (prefix === '/' || prefix === '\\') {
    return candidate.startsWith(prefix)
  }
  return candidate === prefix || candidate.startsWith(`${prefix}${path.sep}`)
}

/**
 * Normalizes and sorts watch roots longest-first so nested roots (e.g. an explicitly added
 * `~/Library/Mobile Documents` inside `~`) match the deepest configured root first.
 */
export function sortWatchRootsLongestFirst(watchRoots: readonly string[]): string[] {
  const normalized = new Set<string>()
  for (const root of watchRoots) {
    const clean = normalizeFsPath(root)
    if (clean) normalized.add(clean)
  }
  return Array.from(normalized).sort((a, b) => b.length - a.length)
}

export function resolveWatchRootBase(
  normalizedPath: string,
  watchRoots: readonly string[]
): string | null {
  let best: string | null = null
  for (const root of watchRoots) {
    if (!root) continue
    if (
      root === '/'
        ? normalizedPath.startsWith('/')
        : normalizedPath === root || normalizedPath.startsWith(`${root}${path.sep}`)
    ) {
      if (best === null || root.length > best.length) {
        best = root
      }
    }
  }
  return best
}

function isProjectSearchBoundary(directoryPath: string): boolean {
  const normalized = directoryPath.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length === 0) return true
  if (segments.length === 1 && /^[a-z]:$/i.test(segments[0] ?? '')) return true
  if (
    normalized.startsWith('/') &&
    segments.length === 2 &&
    /^(?:users|home)$/i.test(segments[0] ?? '')
  ) {
    return true
  }
  if (
    segments.length === 3 &&
    /^[a-z]:$/i.test(segments[0] ?? '') &&
    /^users$/i.test(segments[1] ?? '')
  ) {
    return true
  }
  return false
}

function isMacHomeNonICloudLibraryPath(
  normalizedPath: string,
  watchRoots: readonly string[]
): boolean {
  if (!PLATFORM.IS_MACOS) return false
  const home = normalizeFsPath(os.homedir())
  const libraryRoot = normalizeFsPath(path.join(home, 'Library'))
  if (!isWithinOrEqualPrefix(normalizedPath, libraryRoot)) return false
  if (
    watchRoots.some(
      (root) =>
        isWithinOrEqualPrefix(root, libraryRoot) && isWithinOrEqualPrefix(normalizedPath, root)
    )
  ) {
    return false
  }
  return true
}

function isHomeAnchoredToolchainExcluded(
  normalizedPath: string,
  watchRoots: readonly string[]
): boolean {
  const home = normalizeFsPath(os.homedir())
  for (const segments of HOME_ANCHORED_TOOLCHAIN_SEGMENTS) {
    const target = normalizeFsPath(path.join(home, ...segments))
    if (
      isWithinOrEqualPrefix(normalizedPath, target) &&
      !watchRoots.some((root) => isWithinOrEqualPrefix(root, target))
    ) {
      return true
    }
  }
  return false
}

export function resolveRelativeSearchPathNormalized(
  normalizedPath: string,
  watchRoots: readonly string[]
): string {
  const matchedRoot = resolveWatchRootBase(normalizedPath, watchRoots)
  if (!matchedRoot) return normalizedPath
  if (matchedRoot === '/') return normalizedPath
  const relative = normalizedPath.slice(matchedRoot.length)
  if (!relative) return path.sep
  return relative.startsWith(path.sep) ? relative : `${path.sep}${relative}`
}

export function resolveRelativeSearchPath(
  candidatePath: string,
  watchRoots: readonly string[]
): string {
  return resolveRelativeSearchPathNormalized(normalizeFsPath(candidatePath), watchRoots)
}

export function hasExcludedPathSegmentNormalized(
  normalizedPath: string,
  watchRoots: readonly string[],
  isDir = false
): boolean {
  if (!normalizedPath) return true
  if (isMacHomeNonICloudLibraryPath(normalizedPath, watchRoots)) return true
  if (isHomeAnchoredToolchainExcluded(normalizedPath, watchRoots)) return true

  const matchedRoot = resolveWatchRootBase(normalizedPath, watchRoots)
  const relative = matchedRoot
    ? matchedRoot === '/'
      ? normalizedPath
      : normalizedPath.slice(matchedRoot.length)
    : normalizedPath
  const segments = relative.split(path.sep).filter(Boolean)

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]!
    if (seg.startsWith('.')) return true
    if (isBlacklistedBundleName(seg)) return true
    const lower = seg.toLowerCase()
    if (
      (i < segments.length - 1 || isDir) &&
      !LOWERCASE_CONTEXT_DEPENDENT_DIRS.has(lower) &&
      LOWERCASE_UNCONDITIONAL_DEV_TEMP_DIRS.has(lower)
    ) {
      return true
    }
  }
  return false
}

export function hasExcludedPathSegment(
  filePath: string,
  watchRoots: readonly string[],
  isDir = false
): boolean {
  return hasExcludedPathSegmentNormalized(normalizeFsPath(filePath), watchRoots, isDir)
}

export function isSearchableNativeEntry(
  candidatePath: string,
  name: string,
  isDir: boolean,
  watchRoots: readonly string[]
): boolean {
  if (!name) return false
  if (SYSTEM_METADATA_FILE_NAMES.has(name)) return false
  for (const prefix of SYSTEM_METADATA_FILE_PREFIXES) {
    if (name.startsWith(prefix)) return false
  }
  if (!isDir) {
    const ext = path.extname(name).toLowerCase()
    if (ext && BLACKLISTED_EXTENSIONS.has(ext)) return false
  }

  const normalized = normalizeFsPath(candidatePath)
  if (hasExcludedPathSegmentNormalized(normalized, watchRoots, isDir)) return false

  const relativePath = resolveRelativeSearchPathNormalized(normalized, watchRoots)
  return (
    fileFilterService.getSearchExclusionReason({
      path: relativePath,
      name,
      isDirectory: isDir
    }) === null
  )
}

/**
 * Builds native bulk-scanner filter rules matching `FileFilterService`.
 *
 * Intentionally keeps `CONTEXT_DEPENDENT_BLACKLISTED_DIRS` out of `excludeNames` (evaluated with
 * sibling project markers instead) and anchors OS system directories via `excludePathPrefixes`
 * rather than polluting global `excludeNames` (so `~/Projects/foo/dev` and `~/Documents/Library`
 * remain searchable).
 */
export function buildNativeScanFilterOptions(
  watchPaths: readonly string[]
): CompatibleNativeScanFilterOptions {
  const normalizedWatchRoots = sortWatchRootsLongestFirst(watchPaths)
  const excludeNames = new Set<string>(LOWERCASE_UNCONDITIONAL_DEV_TEMP_DIRS)
  const excludePathPrefixes: string[] = []
  const allowPathPrefixes: string[] = []

  const home = normalizeFsPath(os.homedir())
  if (PLATFORM.IS_MACOS) {
    const libraryRoot = normalizeFsPath(path.join(home, 'Library'))
    const icloudRoot = resolveMacICloudDriveRoot()
    const hasExplicitNonICloudLibraryRoot = normalizedWatchRoots.some(
      (root) =>
        isWithinOrEqualPrefix(root, libraryRoot) &&
        (!icloudRoot || !isWithinOrEqualPrefix(root, icloudRoot))
    )
    if (!hasExplicitNonICloudLibraryRoot) {
      excludePathPrefixes.push(libraryRoot)
    }
    if (
      icloudRoot &&
      normalizedWatchRoots.some((root) => isWithinOrEqualPrefix(root, icloudRoot))
    ) {
      allowPathPrefixes.push(icloudRoot)
    }
  }

  for (const segments of HOME_ANCHORED_TOOLCHAIN_SEGMENTS) {
    const toolchainPrefix = normalizeFsPath(path.join(home, ...segments))
    if (!normalizedWatchRoots.some((root) => isWithinOrEqualPrefix(root, toolchainPrefix))) {
      excludePathPrefixes.push(toolchainPrefix)
    }
  }

  if (PLATFORM.IS_UNIX) {
    for (const dirName of getSystemRootDirsForCurrentPlatform()) {
      if (dirName === 'Library' && PLATFORM.IS_MACOS) {
        // Root `/Library` is still a system folder when scanning `/`, distinct from `~/Library`.
      }
      const rootSysPrefix = normalizeFsPath(path.posix.join('/', dirName))
      const coveredByWatchRoot = normalizedWatchRoots.some((root) =>
        isWithinOrEqualPrefix(rootSysPrefix, root)
      )
      const containsWatchRoot = normalizedWatchRoots.some((root) =>
        isWithinOrEqualPrefix(root, rootSysPrefix)
      )
      if (coveredByWatchRoot && !containsWatchRoot) {
        excludePathPrefixes.push(rootSysPrefix)
      }
    }
  }

  return {
    excludeNames: Array.from(excludeNames),
    contextDependentNames: Array.from(CONTEXT_DEPENDENT_BLACKLISTED_DIRS),
    projectMarkers: NATIVE_PROJECT_MARKERS,
    excludePathPrefixes,
    allowPathPrefixes,
    excludeDirSuffixes: Array.from(BLACKLISTED_BUNDLE_SUFFIXES),
    excludeHidden: true,
    maxDepth: FILE_SCAN_MAX_DEPTH,
    includeDirs: true,
    skipLinkedWorktrees: true
  }
}

function maybeProjectMarkerName(name: string): boolean {
  const lower = name.toLowerCase()
  if (lower === '.git') return true
  if (LOWERCASE_PROJECT_MARKERS.has(lower)) return true
  return isProjectMarker(name)
}

/**
 * Stateful ancestor-exclusion evaluator with bounded LRU + TTL caching for live FSEvents and
 * search queries so repeated hits inside a directory never re-stat `project_markers` or `.git`.
 */
export class NativeScanPolicy {
  private readonly ttlMs: number
  private readonly maxEntries: number
  private readonly readdirFn: (directoryPath: string) => Promise<string[]>
  private readonly readFileFn: (filePath: string) => Promise<string>
  private readonly now: () => number

  private readonly ancestorVerdicts = new Map<string, TimedCacheEntry<Promise<boolean>>>()
  private readonly readdirCache = new Map<string, TimedCacheEntry<Promise<string[] | null>>>()

  constructor(options: NativeScanPolicyOptions = {}) {
    this.ttlMs = options.ttlMs ?? NATIVE_ANCESTOR_CACHE_TTL_MS
    this.maxEntries = options.maxEntries ?? NATIVE_ANCESTOR_CACHE_LIMIT
    this.readdirFn = options.readdir ?? ((target) => fs.readdir(target))
    this.readFileFn = options.readFile ?? ((target) => fs.readFile(target, 'utf8'))
    this.now = options.now ?? Date.now
  }

  public clear(): void {
    this.ancestorVerdicts.clear()
    this.readdirCache.clear()
  }

  public invalidatePaths(paths: readonly string[]): void {
    if (paths.length === 0 || (this.ancestorVerdicts.size === 0 && this.readdirCache.size === 0)) {
      return
    }
    const invalidatedPrefixes = new Set<string>()
    for (const raw of paths) {
      const normalized = normalizeFsPath(raw)
      if (!normalized) continue
      const base = path.basename(normalized)
      const parent = path.dirname(normalized)
      this.readdirCache.delete(parent)
      this.readdirCache.delete(normalized)
      if (maybeProjectMarkerName(base)) {
        invalidatedPrefixes.add(parent)
      } else {
        invalidatedPrefixes.add(normalized)
      }
    }

    if (invalidatedPrefixes.size === 0) return

    for (const key of this.ancestorVerdicts.keys()) {
      const sepIdx = key.indexOf('\u0000')
      const dirPath = sepIdx >= 0 ? key.slice(sepIdx + 1) : key
      for (const prefix of invalidatedPrefixes) {
        if (isWithinOrEqualPrefix(dirPath, prefix) || isWithinOrEqualPrefix(prefix, dirPath)) {
          this.ancestorVerdicts.delete(key)
          break
        }
      }
    }
  }

  public async hasExcludedAncestorDirectory(
    candidatePath: string,
    watchRoots: readonly string[],
    isDir = false
  ): Promise<boolean> {
    const normalized = normalizeFsPath(candidatePath)
    const matchedRoot = resolveWatchRootBase(normalized, watchRoots)
    if (!matchedRoot) return false

    const startDir = isDir ? normalized : path.dirname(normalized)
    if (
      startDir.length <= matchedRoot.length ||
      (matchedRoot !== '/' && !startDir.startsWith(`${matchedRoot}${path.sep}`))
    ) {
      return false
    }

    return await this.isDirectoryExcludedCached(startDir, matchedRoot)
  }

  private getDirectoryVerdictKey(matchedRoot: string, directoryPath: string): string {
    return `${matchedRoot}\u0000${directoryPath}`
  }

  private trimMap<T>(map: Map<string, T>): void {
    while (map.size > this.maxEntries) {
      const oldest = map.keys().next().value
      if (oldest === undefined) break
      map.delete(oldest)
    }
  }

  private isDirectoryExcludedCached(directoryPath: string, matchedRoot: string): Promise<boolean> {
    if (
      directoryPath.length <= matchedRoot.length ||
      (matchedRoot !== '/' && !directoryPath.startsWith(`${matchedRoot}${path.sep}`))
    ) {
      return Promise.resolve(false)
    }

    const key = this.getDirectoryVerdictKey(matchedRoot, directoryPath)
    const now = this.now()
    const cached = this.ancestorVerdicts.get(key)
    if (cached && cached.expiresAt > now) {
      this.ancestorVerdicts.delete(key)
      this.ancestorVerdicts.set(key, cached)
      return cached.value
    }

    const pending = this.evaluateDirectoryExcluded(directoryPath, matchedRoot).catch(() => false)
    this.ancestorVerdicts.delete(key)
    this.ancestorVerdicts.set(key, {
      value: pending,
      expiresAt: now + this.ttlMs
    })
    this.trimMap(this.ancestorVerdicts)
    return pending
  }

  private async evaluateDirectoryExcluded(
    directoryPath: string,
    matchedRoot: string
  ): Promise<boolean> {
    const parentDir = path.dirname(directoryPath)
    if (
      parentDir !== directoryPath &&
      parentDir.length > matchedRoot.length &&
      (matchedRoot === '/' || parentDir.startsWith(`${matchedRoot}${path.sep}`))
    ) {
      if (await this.isDirectoryExcludedCached(parentDir, matchedRoot)) {
        return true
      }
    }

    if (await this.isLinkedWorktree(directoryPath)) {
      return true
    }

    const dirNameLower = path.basename(directoryPath).toLowerCase()
    if (!LOWERCASE_CONTEXT_DEPENDENT_DIRS.has(dirNameLower)) {
      return false
    }

    const siblings = await this.readDirectoryCached(parentDir)
    if (siblings === null) {
      // Matches FileFilterService: unreadable parent falls back to strict exclusion.
      return true
    }
    if (siblings.some(isProjectMarker)) {
      return true
    }

    return await this.isAncestorHoldingProjectMarker(path.dirname(parentDir))
  }

  private async isLinkedWorktree(directoryPath: string): Promise<boolean> {
    try {
      const gitContents = await this.readFileFn(path.join(directoryPath, '.git'))
      return isLinkedWorktreeGitFile(gitContents)
    } catch {
      return false
    }
  }

  private async isAncestorHoldingProjectMarker(startDir: string): Promise<boolean> {
    let current = startDir
    while (!isProjectSearchBoundary(current)) {
      const names = await this.readDirectoryCached(current)
      if (names && holdsProjectMarker(current, names)) {
        return true
      }
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
    return false
  }

  private readDirectoryCached(directoryPath: string): Promise<string[] | null> {
    const now = this.now()
    const cached = this.readdirCache.get(directoryPath)
    if (cached && cached.expiresAt > now) {
      this.readdirCache.delete(directoryPath)
      this.readdirCache.set(directoryPath, cached)
      return cached.value
    }

    const pending = this.readdirFn(directoryPath).catch(() => null)
    this.readdirCache.delete(directoryPath)
    this.readdirCache.set(directoryPath, {
      value: pending,
      expiresAt: now + this.ttlMs
    })
    this.trimMap(this.readdirCache)
    return pending
  }
}
