import { normalizeFsPath } from '@talex-touch/utils/common/file-scan-utils'

/**
 * One-time repair for index rows written before NFC normalization existed at
 * the ingress (see normalizeFsPath). macOS handed the scanner decomposed
 * paths, so the same file could hold two rows — one NFD, one NFC — and the NFD
 * one was invisible to every NFC-keyed lookup.
 *
 * The pass is idempotent: normalizing an already-normalized path is a no-op, so
 * a re-run finds nothing to do.
 */
export const FILE_PATH_NORMALIZATION_VERSION = 1

/**
 * The repair is darwin-only, and the planner says so explicitly rather than
 * reading the running platform: these rows exist because an Apple filesystem
 * handed us both unicode forms for one file, and only there does rewriting the
 * id keep resolving to the same file. On byte-exact filesystems the two forms
 * are two different files, so nothing may be merged.
 */
const PATH_NORMALIZATION_PLATFORM = 'darwin'

export function shouldRunPathNormalizationOnPlatform(platform: string): boolean {
  return platform === PATH_NORMALIZATION_PLATFORM
}

/**
 * Whether reconciliation must stand down for this round.
 *
 * A reconcile that beats the repair to the punch rebuilds every legacy NFD row
 * as insert-NFC + delete-NFD and leaves the old ids as index orphans. So the
 * window between arming the repair and its first attempt defers reconcile —
 * but only that window: once the pass has tried, even unsuccessfully,
 * reconcile resumes, because a permanently deferred reconcile is worse than
 * the rebuild churn.
 */
export function shouldDeferReconciliationForPathNormalization(state: {
  scheduled: boolean
  attempted: boolean
}): boolean {
  return state.scheduled && !state.attempted
}

export interface FilePathNormalizationRow {
  id: number
  path: string
  lastIndexedAt: Date | number | string | null
}

export interface FilePathNormalizationRewrite {
  id: number
  fromPath: string
  toPath: string
}

export interface FilePathNormalizationDeletion {
  id: number
  path: string
  /** The row that survives for this path — kept for the log trail. */
  keptId: number
}

export interface FilePathNormalizationPlan {
  rewrites: FilePathNormalizationRewrite[]
  deletions: FilePathNormalizationDeletion[]
}

function toTimestamp(value: Date | number | string | null): number {
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? time : 0
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const time = new Date(value).getTime()
    return Number.isFinite(time) ? time : 0
  }
  return 0
}

/**
 * Decide, per NFC target path, which row survives.
 *
 * Winner = newest `lastIndexedAt`; ties go to the row already stored under the
 * NFC path (no write at all), then to the lowest id so the plan is stable
 * across runs. Everything else is deleted, and a winner that is not yet stored
 * under its NFC path is rewritten.
 *
 * `input.rows` are the rows whose stored path is not its own NFC form;
 * `input.existingNormalizedRows` are the rows already stored under those NFC
 * paths.
 */
export function planFilePathNormalization(input: {
  rows: FilePathNormalizationRow[]
  existingNormalizedRows: FilePathNormalizationRow[]
}): FilePathNormalizationPlan {
  const twinsByPath = new Map<string, FilePathNormalizationRow>()
  for (const row of input.existingNormalizedRows) twinsByPath.set(row.path, row)

  const groups = new Map<string, FilePathNormalizationRow[]>()
  for (const row of input.rows) {
    const target = normalizeFsPath(row.path, PATH_NORMALIZATION_PLATFORM)
    if (target === row.path) continue
    const group = groups.get(target)
    if (group) group.push(row)
    else groups.set(target, [row])
  }

  const rewrites: FilePathNormalizationRewrite[] = []
  const deletions: FilePathNormalizationDeletion[] = []

  for (const [targetPath, group] of groups) {
    const twin = twinsByPath.get(targetPath)
    const candidates = twin ? [twin, ...group] : [...group]
    const winner = candidates.reduce((best, candidate) => {
      const bestTime = toTimestamp(best.lastIndexedAt)
      const candidateTime = toTimestamp(candidate.lastIndexedAt)
      if (candidateTime !== bestTime) return candidateTime > bestTime ? candidate : best
      if (best.path === targetPath) return best
      if (candidate.path === targetPath) return candidate
      return candidate.id < best.id ? candidate : best
    })

    for (const candidate of candidates) {
      if (candidate.id === winner.id) continue
      deletions.push({ id: candidate.id, path: candidate.path, keptId: winner.id })
    }

    if (winner.path !== targetPath) {
      rewrites.push({ id: winner.id, fromPath: winner.path, toPath: targetPath })
    }
  }

  return { rewrites, deletions }
}

export interface FileProviderPathNormalizationResult {
  status: 'skipped' | 'completed'
  reason?: 'already-applied' | 'unavailable'
  scanned: number
  rewritten: number
  deleted: number
  /** Rows whose repair threw; a non-zero count leaves the pass unrecorded. */
  failed: number
}

export interface FileProviderPathNormalizationDeps {
  /** Version already recorded as applied, or null when the pass never ran. */
  getAppliedVersion: () => Promise<number | null>
  setAppliedVersion: (version: number) => Promise<void>
  /**
   * One id-ordered page of file rows. SQLite cannot compare unicode forms, so
   * the pass reads every row once and filters in JS.
   */
  loadRowsPage: (afterId: number, limit: number) => Promise<FilePathNormalizationRow[]>
  loadRowsByPaths: (paths: string[]) => Promise<FilePathNormalizationRow[]>
  /** UPDATE files SET path — must route to whichever home owns the table. */
  rewritePath: (rewrite: FilePathNormalizationRewrite) => Promise<void>
  /** Existing removal API (item id = path): drops the row and its index entry. */
  removeIndexedFile: (path: string) => Promise<void>
  /** Drops the index entry keyed by a path that no longer identifies the row. */
  removeIndexEntry: (path: string) => Promise<void>
  /** Re-index the rewritten rows so they get an index entry under the new id. */
  reindexRows: (ids: number[]) => Promise<void>
  /** Keeps a full-table pass off the event loop's back. */
  yieldBetweenPages: () => Promise<void>
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

const PAGE_SIZE = 500

export class FileProviderPathNormalizationService {
  constructor(private readonly deps: FileProviderPathNormalizationDeps) {}

  async run(): Promise<FileProviderPathNormalizationResult> {
    const applied = await this.deps.getAppliedVersion()
    if (applied !== null && applied >= FILE_PATH_NORMALIZATION_VERSION) {
      return {
        status: 'skipped',
        reason: 'already-applied',
        scanned: 0,
        rewritten: 0,
        deleted: 0,
        failed: 0
      }
    }

    let scanned = 0
    let rewritten = 0
    let deleted = 0
    let failed = 0
    let afterId = 0

    while (true) {
      const page = await this.deps.loadRowsPage(afterId, PAGE_SIZE)
      if (page.length === 0) break
      afterId = page[page.length - 1]!.id
      scanned += page.length

      const rows = page.filter(
        (row) => normalizeFsPath(row.path, PATH_NORMALIZATION_PLATFORM) !== row.path
      )
      if (rows.length === 0) {
        await this.deps.yieldBetweenPages()
        continue
      }

      const targetPaths = [
        ...new Set(rows.map((row) => normalizeFsPath(row.path, PATH_NORMALIZATION_PLATFORM)))
      ]
      const plan = planFilePathNormalization({
        rows,
        existingNormalizedRows: await this.deps.loadRowsByPaths(targetPaths)
      })

      // Deletions first: the surviving row may need the freed path, and
      // `files.path` is unique.
      for (const deletion of plan.deletions) {
        try {
          await this.deps.removeIndexedFile(deletion.path)
          deleted += 1
        } catch (error) {
          failed += 1
          this.deps.logWarn('Failed to merge a duplicate path row', error, {
            id: deletion.id,
            keptId: deletion.keptId
          })
        }
      }
      const rewrittenIds: number[] = []
      for (const rewrite of plan.rewrites) {
        try {
          await this.deps.rewritePath(rewrite)
          // The index entry is keyed by the old path; the row now answers to
          // the new one, so drop the orphan and re-index under the NFC id.
          await this.deps.removeIndexEntry(rewrite.fromPath)
          rewrittenIds.push(rewrite.id)
          rewritten += 1
        } catch (error) {
          failed += 1
          this.deps.logWarn('Failed to rewrite a path to its normalized form', error, {
            id: rewrite.id
          })
        }
      }
      if (rewrittenIds.length > 0) {
        try {
          await this.deps.reindexRows(rewrittenIds)
        } catch (error) {
          // A rewritten row already lost the index entry keyed by its old path,
          // and a later pass skips it (its path is normalized now) — so a failed
          // reindex leaves it unsearchable until its next mtime change. Counting
          // it as failed keeps the version unrecorded and the failure visible;
          // it does not by itself restore the entry.
          failed += rewrittenIds.length
          this.deps.logWarn('Failed to re-index rows rewritten to normalized paths', error, {
            ids: rewrittenIds
          })
        }
      }
      await this.deps.yieldBetweenPages()
    }

    // Only a clean pass is recorded as applied — otherwise the next boot
    // retries, which the idempotent plan makes safe.
    if (failed === 0) {
      await this.deps.setAppliedVersion(FILE_PATH_NORMALIZATION_VERSION)
    }
    this.deps.logInfo('File path normalization migration completed', {
      scanned,
      rewritten,
      deleted,
      failed
    })
    return { status: 'completed', scanned, rewritten, deleted, failed }
  }
}
