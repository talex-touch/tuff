/**
 * FileRecommendationBridgeImpl — concrete implementation of `FileRecommendationBridge` that
 * is instantiated by `FileProvider` and registered via `registerFileRecommendationBridge`.
 *
 * Dependencies are injected so this file imports nothing from `FileProvider` or
 * `RecommendationEngine`; the registration function (`registerFileRecommendationBridge`) is the
 * only outward coupling, keeping `import-direction.test.ts` green.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileFilterService } from '@talex-touch/utils/common/file-filter-service'
import type {
  ContextualSemanticFileHit,
  FileRecommendationBridge,
  NativeRecommendedFileRecord
} from '../file-recommendation-bridge'
import type { FileProviderNativeIndexService } from './native-index/file-provider-native-index-service'
import type { EmbeddingService } from '../embedding-service'
import type { DbUtils } from '../../../../../db/utils'

// ---------------------------------------------------------------------------
// Dep interface (keeps this module decoupled from full FileProvider type)
// ---------------------------------------------------------------------------

export interface FileRecommendationBridgeImplDeps {
  /** Active native index service (may be null before startup). */
  getNativeIndexService: () => FileProviderNativeIndexService | null
  /** Active embedding service (may be null/undefined when disabled). */
  getEmbeddingService: () => EmbeddingService | null | undefined
  /** Active DB utils (may be null before database is ready). */
  getDbUtils: () => DbUtils | null
  /** Provider-level path admission check (watch-roots + filter policy). */
  isPathAdmitted: (filePath: string) => boolean
  /** Provider-level path normalizer. */
  normalizePath: (rawPath: string) => string
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default minimum cosine similarity score for semantic hits. */
const DEFAULT_MIN_SCORE = 0.42

/** Max concurrent `fs.lstat` calls per lookup batch. */
const LSTAT_CONCURRENCY = 8

// ---------------------------------------------------------------------------
// Helper: bounded concurrent execution of async tasks
// ---------------------------------------------------------------------------

async function runConcurrent<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let index = 0
  async function worker() {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
  return results
}

// ---------------------------------------------------------------------------
// Helper: stat a single path → NativeRecommendedFileRecord | null
// ---------------------------------------------------------------------------

async function statToRecord(fullPath: string): Promise<NativeRecommendedFileRecord | null> {
  try {
    const stat = await fs.lstat(fullPath)
    if (stat.isSymbolicLink()) return null
    return {
      path: fullPath,
      name: path.basename(fullPath),
      extension: path.extname(fullPath).replace(/^\./, ''),
      size: stat.isDirectory() ? null : stat.size,
      mtime: stat.mtime,
      ctime: stat.birthtime ?? stat.ctime,
      isDir: stat.isDirectory()
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class FileRecommendationBridgeImpl implements FileRecommendationBridge {
  constructor(private readonly deps: FileRecommendationBridgeImplDeps) {}

  // -------------------------------------------------------------------------
  // lookupFilesByPaths
  // -------------------------------------------------------------------------

  async lookupFilesByPaths(
    paths: readonly string[]
  ): Promise<Map<string, NativeRecommendedFileRecord>> {
    const result = new Map<string, NativeRecommendedFileRecord>()
    if (paths.length === 0) return result

    const admitted = paths
      .map((p) => this.deps.normalizePath(p))
      .filter((p) => {
        if (!p || !this.deps.isPathAdmitted(p)) return false
        const name = path.basename(p)
        const extension = path.extname(p).replace(/^\./, '')
        return (
          fileFilterService.getManualIndexExclusionReason({ path: p, name, extension }) === null
        )
      })

    // Bounded concurrent lstat
    const records = await runConcurrent(
      admitted.map((p) => () => statToRecord(p)),
      LSTAT_CONCURRENCY
    )

    for (let i = 0; i < admitted.length; i++) {
      const record = records[i]
      if (record) result.set(admitted[i], record)
    }

    return result
  }

  // -------------------------------------------------------------------------
  // listRecentFiles
  // -------------------------------------------------------------------------

  async listRecentFiles(options: {
    createdAfterMs?: number
    modifiedAfterMs?: number
    limit: number
  }): Promise<NativeRecommendedFileRecord[]> {
    const { limit, createdAfterMs, modifiedAfterMs } = options
    if (limit <= 0) return []

    const nativeService = this.deps.getNativeIndexService()

    // Fast path: use native arena search("") with mtime filtering (< 0.5 ms, no lstat).
    // The arena returns items sorted by recency when query is empty.
    if (nativeService?.isReady()) {
      try {
        // We fetch a larger set so we can filter and still fill `limit`.
        const arena =
          (
            nativeService as unknown as {
              arena?: {
                search: (
                  q: string,
                  opts: object
                ) => Promise<{
                  items: Array<{
                    path: string
                    mtimeSec?: number
                    mtimeMs?: number
                    isDir: boolean
                  }>
                }>
              } | null
            }
          ).arena ?? null
        if (arena) {
          const fetchLimit = Math.min(limit * 4, 2000)
          const outcome = await arena.search('', { limit: fetchLimit, typeFilter: 'file' })
          const candidates: Array<{ path: string; mtimeEpoch: number | undefined }> = []

          for (const item of outcome.items) {
            if (item.isDir) continue
            // Use mtimeMs when available (from @rust-engine), fall back to mtimeSec * 1000.
            const mtimeEpoch =
              item.mtimeMs ?? (item.mtimeSec != null ? item.mtimeSec * 1000 : undefined)
            if (modifiedAfterMs != null && mtimeEpoch != null && mtimeEpoch < modifiedAfterMs)
              continue
            const normalizedPath = this.deps.normalizePath(item.path)
            if (!normalizedPath || !this.deps.isPathAdmitted(normalizedPath)) continue
            candidates.push({ path: normalizedPath, mtimeEpoch })
          }

          // If createdAfterMs is requested, we need real ctime → bounded lstat on top candidates.
          if (createdAfterMs != null && candidates.length > 0) {
            const lstatResults = await runConcurrent(
              candidates
                .slice(0, Math.min(candidates.length, limit * 2))
                .map((c) => () => statToRecord(c.path)),
              LSTAT_CONCURRENCY
            )
            const records: NativeRecommendedFileRecord[] = []
            for (const record of lstatResults) {
              if (!record) continue
              if (record.ctime.getTime() < createdAfterMs) continue
              records.push(record)
              if (records.length >= limit) break
            }
            if (records.length > 0) return records
            // Fall through to DB if arena+lstat produced nothing.
          } else {
            // No ctime filter — return directly from arena without lstat.
            const records: NativeRecommendedFileRecord[] = []
            for (const c of candidates) {
              const mtime = c.mtimeEpoch != null ? new Date(c.mtimeEpoch) : new Date(0)
              records.push({
                path: c.path,
                name: path.basename(c.path),
                extension: path.extname(c.path).replace(/^\./, ''),
                size: null, // arena doesn't carry size; use lookupFilesByPaths when needed
                mtime,
                ctime: new Date(0), // not available without lstat
                isDir: false
              })
              if (records.length >= limit) break
            }
            return records
          }
        }
      } catch (error) {
        this.deps.logWarn('FileRecommendationBridge: arena recent-files lookup failed', error)
      }
    }

    // Fallback: query the SQLite index (available when content indexing is active).
    const dbUtils = this.deps.getDbUtils()
    if (dbUtils) {
      try {
        const createdAfter = createdAfterMs ? new Date(createdAfterMs) : new Date(0)
        const rows = await dbUtils.getRecentlyCreatedFiles(createdAfter, limit * 2)
        const records: NativeRecommendedFileRecord[] = []
        for (const row of rows) {
          const normalizedPath = this.deps.normalizePath(row.path)
          if (!normalizedPath || !this.deps.isPathAdmitted(normalizedPath)) continue

          const ctimeEpoch =
            row.ctime instanceof Date ? row.ctime.getTime() : Number(row.ctime ?? 0)
          if (createdAfterMs && ctimeEpoch < createdAfterMs) continue

          const rowRecord = row as unknown as { size?: number | null; isDir?: boolean }
          records.push({
            path: normalizedPath,
            name: path.basename(normalizedPath),
            extension: path.extname(normalizedPath).replace(/^\./, ''),
            size: rowRecord.size ?? null,
            mtime: new Date(0), // mtime not in this query projection
            ctime: new Date(ctimeEpoch),
            isDir: rowRecord.isDir ?? false
          })

          if (records.length >= limit) break
        }
        return records
      } catch (error) {
        this.deps.logWarn('FileRecommendationBridge: DB recent-files lookup failed', error)
      }
    }

    return []
  }

  // -------------------------------------------------------------------------
  // recallSemanticFiles
  // -------------------------------------------------------------------------

  async recallSemanticFiles(
    queryText: string,
    options: { limit: number; minScore?: number; signal?: AbortSignal }
  ): Promise<ContextualSemanticFileHit[]> {
    const { limit, minScore = DEFAULT_MIN_SCORE, signal } = options

    if (!queryText.trim() || limit <= 0 || signal?.aborted) return []

    const embeddingService = this.deps.getEmbeddingService()
    // Return empty immediately when unavailable — no cold model downloads.
    if (!embeddingService) return []

    // EmbeddingService.semanticSearch already guards: closed, getUsageLimitPause, etc.
    let rawResults: Array<{ sourceId: string; score: number; contentHash?: string | null }>
    try {
      rawResults = await embeddingService.semanticSearch(queryText, limit, signal)
    } catch (error) {
      if (!signal?.aborted) {
        this.deps.logWarn('FileRecommendationBridge: semantic search failed', error)
      }
      return []
    }

    if (signal?.aborted || rawResults.length === 0) return []

    // Filter by minScore.
    const qualifying = rawResults.filter((r) => r.score >= minScore)
    if (qualifying.length === 0) return []

    // Resolve sourceId (numeric file id string) → live file path via DB.
    // Use getFilesByPaths is not applicable here (we have IDs not paths). Instead, resolve
    // paths from the embedding results by matching them against getFilesByBundleIds or inline.
    // Since DbUtils doesn't expose getFilesByIds directly, we resolve via path hints when
    // available, or fall back to returning hits with path=sourceId for callers to resolve.
    const dbUtils = this.deps.getDbUtils()
    const hits: ContextualSemanticFileHit[] = []

    // Best-effort: use getDbUtils internal read db for ID→path resolution via getFilesByBundleIds
    // pattern. We access the underlying read db via (dbUtils as any).
    if (dbUtils) {
      try {
        const dbLike = dbUtils as unknown as {
          getFileIndexReadDb?: () => ReturnType<DbUtils['getFileIndexReadDb']>
          _readDb?: ReturnType<DbUtils['getFileIndexReadDb']>
        }
        const resolveDb = dbLike.getFileIndexReadDb?.() ?? dbLike._readDb
        if (resolveDb) {
          const { inArray: inArr } = await import('drizzle-orm')
          const { files: filesSchema } = await import('../../../../../db/schema')
          const fileIds = qualifying
            .map((r) => Number(r.sourceId))
            .filter((id) => !isNaN(id) && id > 0)
          if (fileIds.length > 0) {
            const rows: Array<{ id: number; path: string }> = await resolveDb
              .select({ id: filesSchema.id, path: filesSchema.path })
              .from(filesSchema)
              .where(inArr(filesSchema.id, fileIds))
            const idToPath = new Map<number, string>(rows.map((r) => [r.id, r.path]))
            for (const item of qualifying) {
              const fileId = Number(item.sourceId)
              const filePath = idToPath.get(fileId)
              if (!filePath) continue
              const normalizedPath = this.deps.normalizePath(filePath)
              if (!normalizedPath || !this.deps.isPathAdmitted(normalizedPath)) continue
              hits.push({ path: normalizedPath, score: item.score, contentHash: item.contentHash })
            }
          }
        }
      } catch (error) {
        if (!signal?.aborted) {
          this.deps.logWarn('FileRecommendationBridge: DB path resolution failed', error)
        }
      }
    }

    return hits
  }
}
