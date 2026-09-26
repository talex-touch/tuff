import type { CoreBoxSearchIndexCommitPayload } from '@talex-touch/utils/transport/events/types'

/**
 * Trailing window for an index-commit notification while commits arrive at an ordinary rate —
 * a file saved, an app installed. Keeps a lone commit visible within about a second.
 */
export const INDEX_COMMIT_NOTIFY_WINDOW_MS = 1_000
/**
 * Trailing window during bulk indexing (D-a, 2026-09-26): "visible within a second of commit" is
 * relaxed to a few seconds while an index builds, because every notification makes an open
 * CoreBox rerun its whole query.
 */
export const INDEX_COMMIT_NOTIFY_BULK_WINDOW_MS = 3_000
/** How far back commits are counted when deciding whether they arrive densely. */
export const INDEX_COMMIT_DENSE_LOOKBACK_MS = 5_000
/** Commits inside the lookback, counting the one opening the window, that mark it bulk. */
export const INDEX_COMMIT_DENSE_THRESHOLD = 3

export interface SearchIndexCommitCoalescerOptions {
  emit: (payload: CoreBoxSearchIndexCommitPayload) => void
  /**
   * Advisory: whether a bulk index build is running right now (a full scan). A probe that throws
   * counts as "no" — bulk detection must never cost a notification.
   */
  isBulkIndexing?: () => boolean
  /** Called when `emit` throws; the flush runs on a timer, where nothing else would catch it. */
  onEmitError?: (error: unknown) => void
  now?: () => number
  windowMs?: number
  bulkWindowMs?: number
  denseLookbackMs?: number
  denseThreshold?: number
}

/**
 * Folds the index commits reaching one renderer stream into at most one notification per
 * trailing window.
 *
 * The hub still bumps its revision on every commit, and search-core still acts on each one
 * (recommendation invalidation, cache revision checks); only what is pushed to the renderer is
 * coalesced. That push was the storm: a non-empty CoreBox query reruns in full on every
 * notification, and during a scan the index commits every ~300ms, so the list re-searched
 * back-to-back for as long as the scan ran.
 *
 * The window opens on the first commit and does not extend, so a steady stream still produces
 * one notification per window instead of starving. It is bulk when a build is running or the
 * commits arrive densely, and a bulk notification carries `bulk: true`.
 */
export class SearchIndexCommitCoalescer {
  private pending: CoreBoxSearchIndexCommitPayload | null = null
  private pendingBulk = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private recentCommitAt: number[] = []
  private disposed = false

  private readonly now: () => number
  private readonly windowMs: number
  private readonly bulkWindowMs: number
  private readonly denseLookbackMs: number
  private readonly denseThreshold: number

  constructor(private readonly options: SearchIndexCommitCoalescerOptions) {
    this.now = options.now ?? Date.now
    this.windowMs = options.windowMs ?? INDEX_COMMIT_NOTIFY_WINDOW_MS
    this.bulkWindowMs = options.bulkWindowMs ?? INDEX_COMMIT_NOTIFY_BULK_WINDOW_MS
    this.denseLookbackMs = options.denseLookbackMs ?? INDEX_COMMIT_DENSE_LOOKBACK_MS
    this.denseThreshold = options.denseThreshold ?? INDEX_COMMIT_DENSE_THRESHOLD
  }

  push(payload: CoreBoxSearchIndexCommitPayload): void {
    if (this.disposed) return
    const now = this.now()
    this.recordCommit(now)
    this.pending = this.pending ? mergeIndexCommitPayloads(this.pending, payload) : payload
    if (this.timer !== null) return

    this.pendingBulk = this.isBulk()
    const timer = setTimeout(
      () => {
        if (this.timer === timer) this.timer = null
        this.flush()
      },
      this.pendingBulk ? this.bulkWindowMs : this.windowMs
    )
    timer.unref?.()
    this.timer = timer
  }

  /** Drops the open window and whatever it held; later pushes are ignored. */
  dispose(): void {
    this.disposed = true
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.pending = null
    this.recentCommitAt = []
  }

  private flush(): void {
    const payload = this.pending
    const bulk = this.pendingBulk
    this.pending = null
    this.pendingBulk = false
    if (!payload || this.disposed) return
    try {
      this.options.emit(bulk ? { ...payload, bulk: true } : payload)
    } catch (error) {
      this.options.onEmitError?.(error)
    }
  }

  private recordCommit(now: number): void {
    const cutoff = now - this.denseLookbackMs
    let firstRecent = 0
    while (firstRecent < this.recentCommitAt.length && this.recentCommitAt[firstRecent]! < cutoff) {
      firstRecent += 1
    }
    if (firstRecent > 0) this.recentCommitAt = this.recentCommitAt.slice(firstRecent)
    this.recentCommitAt.push(now)
    // The count only has to reach the threshold; nothing older is ever read.
    if (this.recentCommitAt.length > this.denseThreshold) {
      this.recentCommitAt = this.recentCommitAt.slice(-this.denseThreshold)
    }
  }

  private isBulk(): boolean {
    if (this.recentCommitAt.length >= this.denseThreshold) return true
    try {
      return this.options.isBulkIndexing?.() === true
    } catch {
      return false
    }
  }
}

/**
 * One payload standing for both commits: the latest revision and commit time, every provider
 * either touched (with its newest generation), and a recommendation refresh if either asked.
 */
export function mergeIndexCommitPayloads(
  previous: CoreBoxSearchIndexCommitPayload,
  next: CoreBoxSearchIndexCommitPayload
): CoreBoxSearchIndexCommitPayload {
  const sourceGenerations: Record<string, number> = { ...previous.sourceGenerations }
  for (const [sourceId, generation] of Object.entries(next.sourceGenerations)) {
    sourceGenerations[sourceId] = Math.max(sourceGenerations[sourceId] ?? 0, generation)
  }
  const merged: CoreBoxSearchIndexCommitPayload = {
    revision: Math.max(previous.revision, next.revision),
    providerIds: Array.from(new Set([...previous.providerIds, ...next.providerIds])).sort(),
    sourceGenerations,
    committedAt: Math.max(previous.committedAt, next.committedAt)
  }
  if (
    previous.recommendationsInvalidated !== undefined ||
    next.recommendationsInvalidated !== undefined
  ) {
    merged.recommendationsInvalidated =
      previous.recommendationsInvalidated === true || next.recommendationsInvalidated === true
  }
  return merged
}
