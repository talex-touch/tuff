import fs from 'node:fs/promises'
import path from 'node:path'
import type { TuffItem, TuffQuery, TuffSearchResult } from '@talex-touch/utils'
import { TuffSearchResultBuilder } from '@talex-touch/utils'
import { toTfileUrl } from '@talex-touch/utils/network'
import type {
  NativeArenaSearchMatchItem,
  NativeFileArenaHandle
} from '@talex-touch/tuff-native/file-index'
import type { files as filesSchema } from '../../../../../../db/schema'
import { normalizeTuffItemLocalAssets } from '../../../../../../utils/local-renderable-assets'
import type { FileTypeTag } from '../../constants'
import type { FileProviderSearchFilters } from '../file-provider-search-result-service'
import { NativeScanPolicy, isSearchableNativeEntry } from './native-scan-policy'

type FileRecord = typeof filesSchema.$inferSelect

export const NATIVE_SEARCH_RESULT_LIMIT = 50
export const NATIVE_SEARCH_CANDIDATE_POOL = 120
export const NATIVE_SEARCH_LSTAT_CONCURRENCY = 16

export interface NativeIndexSearchDeps {
  arena: NativeFileArenaHandle
  watchRoots: readonly string[]
  scanPolicy: NativeScanPolicy
  isPathAdmitted: (filePath: string) => boolean
  buildItem: (file: FileRecord, extensions: Record<string, string>) => TuffItem
  extractFilters: (rawText: string) => FileProviderSearchFilters
  resolveExtensionsForTypeFilters: (typeFilters: Set<FileTypeTag>) => string[]
  onStalePathsDetected: (stalePaths: string[]) => void
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  lstat?: (filePath: string) => Promise<{
    size: number
    mtime: Date
    mtimeMs: number
    ctime: Date
    isDirectory: () => boolean
    isSymbolicLink: () => boolean
  }>
}

function isMissingPathError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

function normalizeExtensionWithoutDot(ext: string): string {
  return ext.trim().replace(/^\./, '').toLowerCase()
}

function buildSyntheticFileRecord(
  match: NativeArenaSearchMatchItem,
  stat: { size: number; mtime: Date; ctime: Date; isDirectory: () => boolean },
  idxSeed: number
): FileRecord {
  const isDir = stat.isDirectory() || match.isDir
  return {
    id: -(idxSeed + 1),
    path: match.path,
    name: match.name,
    displayName: null,
    extension: isDir ? null : match.extension || path.extname(match.name).toLowerCase() || null,
    size: isDir ? 0 : stat.size,
    mtime: stat.mtime,
    ctime: stat.ctime,
    lastIndexedAt: stat.mtime,
    isDir,
    type: isDir ? 'directory' : 'file',
    content: null,
    embeddingStatus: 'none'
  }
}

function normalizeVerifiedNativeItem(baseItem: TuffItem, record: FileRecord): TuffItem | null {
  const basicIcon = baseItem.render.basic?.icon
  const hasPreviewImage = Boolean(baseItem.render.preview?.image)

  // Async `fs.lstat` already verified existence; avoid synchronous `fs.existsSync` in
  // `normalizeTuffItemLocalAssets` for standard icon classes or direct image paths.
  if (!hasPreviewImage && basicIcon) {
    if (basicIcon.type === 'class') {
      return baseItem
    }
    if (basicIcon.type === 'file' && basicIcon.value === record.path) {
      return {
        ...baseItem,
        render: {
          ...baseItem.render,
          basic: {
            ...baseItem.render.basic!,
            icon: {
              ...basicIcon,
              type: 'url',
              value: toTfileUrl(record.path)
            }
          }
        }
      }
    }
  }

  return normalizeTuffItemLocalAssets(baseItem, {
    dropMissingFile: false,
    fallbackKind: record.isDir ? 'folder' : 'file'
  }).item
}

interface VerifiedCandidate {
  item: TuffItem
  finalScore: number
}

/**
 * Inspects ranked candidates with a bounded concurrency pool in demand-sized windows so healthy
 * indexes `lstat` at most 50 entries without wave stalls, while stale hits trigger targeted backfill
 * and `ENOENT`/symlink eviction.
 */
export async function verifyCandidatesWithLazyLstat(
  candidates: readonly NativeArenaSearchMatchItem[],
  rawText: string,
  filters: FileProviderSearchFilters,
  signal: AbortSignal,
  deps: Pick<NativeIndexSearchDeps, 'watchRoots' | 'scanPolicy' | 'buildItem' | 'lstat'>
): Promise<{ liveItems: TuffItem[]; stalePaths: string[] }> {
  const stalePaths: string[] = []
  const verifiedInOrder: VerifiedCandidate[] = []
  const now = Date.now()
  const lstatFn = deps.lstat ?? ((target: string) => fs.lstat(target))
  const hasTypeBoost = filters.typeFilters.size > 0 ? 0.08 : 0

  const inspectCandidate = async (
    candidate: NativeArenaSearchMatchItem,
    idxSeed: number
  ): Promise<VerifiedCandidate | null> => {
    if (signal.aborted) return null
    try {
      const stat = await lstatFn(candidate.path)
      if (stat.isSymbolicLink()) {
        stalePaths.push(candidate.path)
        return null
      }
      const isDir = stat.isDirectory() || candidate.isDir
      if (
        await deps.scanPolicy.hasExcludedAncestorDirectory(candidate.path, deps.watchRoots, isDir)
      ) {
        return null
      }

      const record = buildSyntheticFileRecord(candidate, stat, idxSeed)
      const baseItem = deps.buildItem(record, {})
      const ageDays = Math.max(0, (now - stat.mtime.getTime()) / 86_400_000)
      const recencyScore = Math.exp(-0.05 * ageDays)
      const finalScore = Math.min(1, candidate.score * 0.85 + recencyScore * 0.15 + hasTypeBoost)

      baseItem.scoring = {
        final: finalScore,
        match: candidate.score,
        recency: recencyScore,
        frequency: 0,
        base: recencyScore,
        match_details:
          candidate.matchKind === 'exact' || candidate.matchKind === 'prefix'
            ? { type: 'exact', query: rawText }
            : { type: 'fuzzy', query: rawText, confidence: candidate.score }
      }
      const matchRanges = candidate.matchedRanges.map(([start, end]) => ({ start, end }))
      baseItem.meta ??= {}
      baseItem.meta.usage = { clickCount: 0 }
      baseItem.meta.extension = {
        ...(baseItem.meta.extension ?? {}),
        matchResult: matchRanges,
        search: {
          keywordMatch: candidate.matchKind === 'exact' || candidate.matchKind === 'prefix',
          ftsScore: 0,
          fuzzyScore: candidate.score,
          semanticScore: 0,
          matchKind: candidate.matchKind
        }
      }

      const normalizedItem = normalizeVerifiedNativeItem(baseItem, record)
      if (!normalizedItem) return null
      return { item: normalizedItem, finalScore }
    } catch (error) {
      if (isMissingPathError(error)) {
        stalePaths.push(candidate.path)
      }
      return null
    }
  }

  let cursor = 0
  while (cursor < candidates.length && verifiedInOrder.length < NATIVE_SEARCH_RESULT_LIMIT) {
    if (signal.aborted) break
    const remaining = NATIVE_SEARCH_RESULT_LIMIT - verifiedInOrder.length
    const windowSize =
      cursor === 0
        ? Math.min(candidates.length, remaining)
        : Math.min(candidates.length - cursor, Math.max(remaining, 4))
    const sliceStart = cursor
    const sliceEnd = cursor + windowSize
    cursor = sliceEnd

    const slotResults = new Array<VerifiedCandidate | null>(windowSize).fill(null)
    let localOffset = 0
    const poolSize = Math.min(NATIVE_SEARCH_LSTAT_CONCURRENCY, windowSize)

    await Promise.all(
      Array.from({ length: poolSize }, async () => {
        while (!signal.aborted) {
          const offset = localOffset
          localOffset += 1
          if (offset >= windowSize) break
          const globalIndex = sliceStart + offset
          slotResults[offset] = await inspectCandidate(candidates[globalIndex]!, globalIndex)
        }
      })
    )

    for (const entry of slotResults) {
      if (entry && verifiedInOrder.length < NATIVE_SEARCH_RESULT_LIMIT) {
        verifiedInOrder.push(entry)
      }
    }
  }

  verifiedInOrder.sort((a, b) => b.finalScore - a.finalScore)
  return {
    liveItems: verifiedInOrder.map((entry) => entry.item),
    stalePaths
  }
}

export async function executeNativeArenaSearch(
  query: TuffQuery,
  signal: AbortSignal,
  deps: NativeIndexSearchDeps
): Promise<TuffSearchResult> {
  const rawText = query.text.trim()
  if (!rawText || signal.aborted) {
    return new TuffSearchResultBuilder(query).build()
  }

  const filters = deps.extractFilters(rawText)
  const rawExtensions =
    filters.extensionFilters.length > 0
      ? filters.extensionFilters.map((ext) => ext.toLowerCase())
      : filters.typeFilters.size > 0
        ? deps.resolveExtensionsForTypeFilters(filters.typeFilters).map((ext) => ext.toLowerCase())
        : []

  const allowedExtensionSet = new Set(
    rawExtensions.map(normalizeExtensionWithoutDot).filter(Boolean)
  )
  const hasFolderFilter = filters.typeFilters.has('folder')
  const hasMixedFolderAndExtensions = hasFolderFilter && allowedExtensionSet.size > 0

  let typeFilter: 'file' | 'folder' | undefined
  if (filters.typeFilters.size === 1 && hasFolderFilter && filters.extensionFilters.length === 0) {
    typeFilter = 'folder'
  } else if (filters.typeFilters.size > 0 && !hasFolderFilter) {
    typeFilter = 'file'
  }

  if (!filters.text && filters.typeFilters.size === 0 && rawExtensions.length === 0) {
    return new TuffSearchResultBuilder(query).build()
  }

  const arenaExtensions =
    hasMixedFolderAndExtensions || rawExtensions.length === 0 ? undefined : rawExtensions

  const outcome = await deps.arena.search(filters.text, {
    limit: NATIVE_SEARCH_CANDIDATE_POOL,
    extensions: arenaExtensions,
    typeFilter
  })

  if (signal.aborted) {
    return new TuffSearchResultBuilder(query).build()
  }

  const filteredCandidates: NativeArenaSearchMatchItem[] = []
  for (const item of outcome.items) {
    if (!deps.isPathAdmitted(item.path)) continue
    if (!isSearchableNativeEntry(item.path, item.name, item.isDir, deps.watchRoots)) continue
    if (hasMixedFolderAndExtensions) {
      if (!item.isDir && !allowedExtensionSet.has(normalizeExtensionWithoutDot(item.extension))) {
        continue
      }
    }
    filteredCandidates.push(item)
  }

  const { liveItems, stalePaths } = await verifyCandidatesWithLazyLstat(
    filteredCandidates,
    rawText,
    filters,
    signal,
    deps
  )

  if (stalePaths.length > 0) {
    deps.onStalePathsDetected(stalePaths)
  }

  if (signal.aborted) {
    return new TuffSearchResultBuilder(query).build()
  }

  deps.logDebug('Native file arena search completed', {
    query: rawText,
    hits: liveItems.length,
    evaluated: outcome.evaluatedCandidates,
    bitmapRejected: outcome.bitmapRejected,
    arenaMs: Number(outcome.durationMs.toFixed(2))
  })

  return new TuffSearchResultBuilder(query).setItems(liveItems).build()
}
