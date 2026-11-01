import path from 'node:path'
import process from 'node:process'
import { isIndexedSourcePathInsideRoot } from '@talex-touch/utils/search/indexing-source'
import type { HotSubtreeLane } from '../../../search-engine/indexed-source-event-router'

/** Folders people drop files into; a folder that is itself a watch root is not a hot scope. */
export const HOT_CATCHUP_KNOWN_FOLDER_NAMES = ['Desktop', 'Downloads', 'Documents', 'Pictures']
export const HOT_CATCHUP_RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
export const HOT_CATCHUP_RECENT_FILE_LIMIT = 200
export const HOT_CATCHUP_MAX_SCOPES = 12
export const HOT_CATCHUP_TOTAL_BUDGET_MS = 20_000
export const HOT_CATCHUP_SCOPE_BUDGET_MS = 8_000
/** Pause before each repeat of the scopes a pass left unfinished; its length is the repeat limit. */
export const HOT_CATCHUP_RETRY_DELAYS_MS: readonly number[] = [60_000, 300_000]
const SHUTDOWN_POLL_MS = 250
/** Admission may read `.git` files, so the examined tail is bounded as well. */
const ADMISSION_EXAMINE_FACTOR = 3

export interface HotCatchupFile {
  path: string
  createdAtMs: number
}

export interface FileProviderHotCatchupDeps {
  isShuttingDown: () => boolean
  getWatchPaths: () => readonly string[]
  /**
   * A direct child of this folder that nobody named (`~/Workspace`, `~/Library`) holds too much to
   * be hot evidence, so only the known folders may stand for one.
   */
  getHomeDirectory: () => string
  getKnownFolders: () => readonly string[]
  /** Newest-first rows of the index whose birth time is at or after `sinceMs`. */
  readRecentFiles: (sinceMs: number, limit: number) => Promise<readonly HotCatchupFile[]>
  /** Null when the path is missing, a symlink or not a directory. */
  readDirectoryMtimeMs: (directoryPath: string) => Promise<number | null>
  /** The reconcile re-checks roots, exclusions and linked worktrees; this keeps them out of the cap. */
  isAdmitted: (directoryPath: string) => Promise<boolean>
  withLane: <T>(run: (lane: HotSubtreeLane) => Promise<T>) => Promise<T>
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  now?: () => number
  limits?: Partial<HotCatchupLimits>
}

export interface HotCatchupLimits {
  recentWindowMs: number
  recentFileLimit: number
  maxScopes: number
  totalBudgetMs: number
  scopeBudgetMs: number
}

export interface HotCatchupOutcome {
  planned: number
  reconciled: number
  declined: number
  failed: number
  timedOut: number
  added: number
  changed: number
  deleted: number
  elapsedMs: number
  stoppedBy: 'complete' | 'budget' | 'shutdown'
  /** Planned scopes that neither reconciled nor were declined: failed, timed out or never reached. */
  unfinished: string[]
}

interface Candidate {
  dir: string
  recencyMs: number
  known: boolean
}

/**
 * Brings the directories most likely to have changed while the app was down up to date before the
 * broad scan gets to them (or instead of it, when it never runs).
 *
 * FSEvents delivers nothing for the time the app was not running, and the boot never forces a
 * scan, so a screenshot taken meanwhile stays unsearchable until a whole-home reconcile happens to
 * reach it. The candidates are small and ordered by evidence: the folders that held the newest
 * indexed files, and the well-known drop folders, each ranked by when something last appeared.
 * Each one is an ordinary scoped reconcile through the router's hot lane, so admission, linked
 * worktree and exclusion rules are the ones live watcher events already obey.
 */
export class FileProviderHotCatchupService {
  constructor(private readonly deps: FileProviderHotCatchupDeps) {}

  /**
   * Plans and runs one pass. `retryScopes` repeats the `unfinished` scopes of an earlier pass as
   * they were planned: what is hot is decided once, at launch, so a repeat neither re-ranks nor
   * re-admits them (the reconcile itself still refuses what no longer belongs to the source).
   */
  async run(retryScopes?: readonly string[]): Promise<HotCatchupOutcome> {
    const now = this.deps.now ?? Date.now
    const overrides = this.deps.limits
    const limits: HotCatchupLimits = {
      recentWindowMs: overrides?.recentWindowMs ?? HOT_CATCHUP_RECENT_WINDOW_MS,
      recentFileLimit: overrides?.recentFileLimit ?? HOT_CATCHUP_RECENT_FILE_LIMIT,
      maxScopes: overrides?.maxScopes ?? HOT_CATCHUP_MAX_SCOPES,
      totalBudgetMs: overrides?.totalBudgetMs ?? HOT_CATCHUP_TOTAL_BUDGET_MS,
      scopeBudgetMs: overrides?.scopeBudgetMs ?? HOT_CATCHUP_SCOPE_BUDGET_MS
    }
    const plan = retryScopes
      ? retryScopes.map((dir): Candidate => ({ dir, recencyMs: 0, known: false }))
      : await this.plan(now(), limits)
    if (plan.length === 0) {
      this.deps.logDebug('Hot-directory catch-up has nothing to reconcile')
      return emptyOutcome()
    }
    this.deps.logDebug('Hot-directory catch-up planned', {
      scopes: plan.map((candidate) => candidate.dir),
      retry: retryScopes !== undefined
    })
    const outcome = await this.deps.withLane((lane) => this.execute(lane, plan, limits, now))
    // Counts only: the scopes are folder names of the user's.
    this.deps.logInfo('Hot-directory catch-up finished', {
      ...outcome,
      unfinished: outcome.unfinished.length,
      retry: retryScopes !== undefined
    })
    return outcome
  }

  private async plan(nowMs: number, limits: HotCatchupLimits): Promise<Candidate[]> {
    const roots = this.deps.getWatchPaths()
    if (roots.length === 0) return []
    const platform = process.platform
    const inside = (target: string, root: string): boolean =>
      isIndexedSourcePathInsideRoot(target, root, { platform })
    // A root is walked by the broad scan; only what lies strictly below one is a hot scope.
    const belowRoot = (dir: string): boolean =>
      roots.some((root) => inside(dir, root) && !inside(root, dir))
    const home = path.resolve(this.deps.getHomeDirectory())
    const isHomeChild = (dir: string): boolean => {
      const parent = path.dirname(dir)
      return inside(parent, home) && inside(home, parent)
    }

    const merged = new Map<string, Candidate>()
    const note = (dir: string, recencyMs: number, known: boolean): void => {
      const existing = merged.get(dir)
      if (!existing) {
        merged.set(dir, { dir, recencyMs, known })
        return
      }
      existing.recencyMs = Math.max(existing.recencyMs, recencyMs)
      existing.known ||= known
    }

    for (const folder of this.deps.getKnownFolders()) {
      const dir = path.resolve(folder)
      if (!belowRoot(dir)) continue
      const mtimeMs = await this.deps.readDirectoryMtimeMs(dir)
      if (mtimeMs !== null) note(dir, mtimeMs, true)
    }
    const recent = await this.deps.readRecentFiles(
      nowMs - limits.recentWindowMs,
      limits.recentFileLimit
    )
    for (const file of recent) {
      const dir = path.dirname(path.resolve(file.path))
      if (!belowRoot(dir) || (isHomeChild(dir) && !merged.get(dir)?.known)) continue
      note(dir, file.createdAtMs, false)
    }

    const byRecency = (a: Candidate, b: Candidate): number => b.recencyMs - a.recencyMs
    const candidates = [...merged.values()]
    const accepted: Candidate[] = []
    for (const candidate of candidates.filter((item) => item.known).sort(byRecency)) {
      if (await this.deps.isAdmitted(candidate.dir)) accepted.push(candidate)
    }
    const room = Math.max(0, limits.maxScopes - accepted.length)
    const others = candidates
      .filter((item) => !item.known)
      .sort(byRecency)
      .slice(0, limits.maxScopes * ADMISSION_EXAMINE_FACTOR)
    let taken = 0
    for (const candidate of others) {
      if (taken >= room) break
      if (!(await this.deps.isAdmitted(candidate.dir))) continue
      accepted.push(candidate)
      taken += 1
    }
    return descendantsFirst(accepted.sort(byRecency).slice(0, limits.maxScopes), inside)
  }

  private async execute(
    lane: HotSubtreeLane,
    plan: readonly Candidate[],
    limits: HotCatchupLimits,
    now: () => number
  ): Promise<HotCatchupOutcome> {
    const startedAt = now()
    const outcome: HotCatchupOutcome = { ...emptyOutcome(), planned: plan.length }
    const settled = new Set<string>()
    const total = new AbortController()
    const stop = (reason: 'budget' | 'shutdown'): void => {
      if (total.signal.aborted) return
      outcome.stoppedBy = reason
      total.abort(new Error(`HOT_CATCHUP_${reason.toUpperCase()}`))
    }
    const budgetTimer = setTimeout(() => stop('budget'), limits.totalBudgetMs)
    const shutdownPoll = setInterval(() => {
      if (this.deps.isShuttingDown()) stop('shutdown')
    }, SHUTDOWN_POLL_MS)
    budgetTimer.unref?.()
    shutdownPoll.unref?.()
    try {
      for (const candidate of plan) {
        if (this.deps.isShuttingDown()) stop('shutdown')
        if (total.signal.aborted) break
        const scope = new AbortController()
        const scopeTimer = setTimeout(
          () => scope.abort(new Error('HOT_CATCHUP_SCOPE_BUDGET')),
          limits.scopeBudgetMs
        )
        scopeTimer.unref?.()
        try {
          const result = await lane.reconcile(
            candidate.dir,
            AbortSignal.any([total.signal, scope.signal])
          )
          settled.add(candidate.dir)
          if (!result) {
            outcome.declined += 1
          } else {
            outcome.reconciled += 1
            outcome.added += result.added
            outcome.changed += result.changed
            outcome.deleted += result.deleted
          }
        } catch (error) {
          if (total.signal.aborted) break
          if (scope.signal.aborted) {
            outcome.timedOut += 1
          } else {
            outcome.failed += 1
            this.deps.logDebug('Hot-directory catch-up scope failed', {
              scope: candidate.dir,
              error: error instanceof Error ? error.message : String(error)
            })
          }
        } finally {
          clearTimeout(scopeTimer)
        }
      }
    } finally {
      clearTimeout(budgetTimer)
      clearInterval(shutdownPoll)
    }
    outcome.unfinished = plan.filter((item) => !settled.has(item.dir)).map((item) => item.dir)
    outcome.elapsedMs = Math.max(0, now() - startedAt)
    return outcome
  }
}

/**
 * A scope is recursive, so an ancestor walks everything below it again, yet the folder below runs
 * first. The newest evidence usually sits in a small folder (a screenshot folder), while the
 * ancestor (Pictures, Documents) can be large enough to spend its whole time budget; a descendant
 * left to the ancestor's walk would then not be caught up at all. Within that, recency order holds.
 */
function descendantsFirst(
  ordered: readonly Candidate[],
  inside: (target: string, root: string) => boolean
): Candidate[] {
  const placed = new Set<Candidate>()
  const result: Candidate[] = []
  const place = (candidate: Candidate): void => {
    if (placed.has(candidate)) return
    placed.add(candidate)
    for (const other of ordered) {
      if (other !== candidate && inside(other.dir, candidate.dir)) place(other)
    }
    result.push(candidate)
  }
  for (const candidate of ordered) place(candidate)
  return result
}

function emptyOutcome(): HotCatchupOutcome {
  return {
    planned: 0,
    reconciled: 0,
    declined: 0,
    failed: 0,
    timedOut: 0,
    added: 0,
    changed: 0,
    deleted: 0,
    elapsedMs: 0,
    stoppedBy: 'complete',
    unfinished: []
  }
}
