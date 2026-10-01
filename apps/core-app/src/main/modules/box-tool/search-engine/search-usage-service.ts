import type { TuffItem, TuffQuery } from '@talex-touch/utils'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../db/schema'
import type { DbUtils, ExecuteRecordResult } from '../../../db/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { getUsageStatsBatchCached, UsageStatsCache } from './usage-stats-cache'
import { UsageStatsQueue } from './usage-stats-queue'
import { recommendationExposureService } from './recommendation/recommendation-exposure-service'
import { recommendationSourceRegistry } from './recommendation/recommendation-source-registry'
import { resolvePreviousAppContext } from './app-launch-recorder'
import { resolveUsageIdentity } from './usage-identity'
import type { UsageEntryPoint } from './usage-entry-point'

const log = getLogger('search-engine')

/** Ceiling on distinct display keys one session may contribute, mirroring the exposure cap. */
const VISIBLE_RESULTS_MAX_PER_REPORT = 100
/** Bounded session-key-set map; evicted least-recently-reported first. */
const VISIBLE_SESSION_MAX_ENTRIES = 20

export interface SearchUsageServiceDeps {
  getDbUtils: () => DbUtils | null
}

/**
 * One visible item reported by the renderer. The renderer sends the identity it rendered; the
 * service maps it onto the statistical identity before recording anything.
 */
export interface VisibleResultIdentity {
  sourceId: string
  itemId: string
  sourceType?: string
}

/** The row metadata a renderer reads for a count, plus the reliable behaviour facts when any. */
export interface UsageStatsSnapshot {
  executeCount: number
  searchCount: number
  cancelCount?: number
  lastExecuted: string | null
  lastSearched: string | null
  lastCancelled?: string | null
  executeCount30?: number
  executeCount7?: number
  activeDays30?: number
  activeDays7?: number
  lastExecutedAt?: number | null
  decayedExecuteScore30?: number
  hourDistribution30?: number[]
  dayOfWeekDistribution30?: number[]
  timeSlotDistribution30?: {
    morning: number
    afternoon: number
    evening: number
    night: number
  }
}

/** Payload of an accepted-execute notification (see {@link SearchUsageService.onExecuteAccepted}). */
export interface UsageExecuteAcceptedEvent {
  sourceId: string
  itemId: string
  eventId: string
  /** The committed row metadata; null on the pre-commit notification. */
  usageStats: UsageStatsSnapshot | null
}

export type UsageExecuteAcceptedListener = (event: UsageExecuteAcceptedEvent) => void

/**
 * Attribution a caller already holds for one execute.
 *
 * `previousApp` is the one field that cannot be derived here: it is a foreground read, and a
 * caller that schedules a launch on the next macrotask has to make it before that launch becomes
 * frontmost, or the transition records the launched app as having been launched from itself.
 */
export interface RecordExecuteOptions {
  /**
   * Identifier of this user action. REQUIRED from the action layer: a retry or a duplicate
   * notification reuses it and the write is deduped, while a genuinely new user action gets a new
   * one. The database owns the dedupe (`usage_execute_events.event_id`).
   */
  eventId: string
  /** Surface that executed. Derived from the exposure state when omitted. */
  entryPoint?: UsageEntryPoint
  /** Foreground app captured by the caller before it handed the item to a launch boundary. */
  previousApp?: string | null
}

/** DB-backed search usage and pin enrichment, independent of SearchEngineCore. */
export class SearchUsageService {
  private pinnedCache: { fetchedAt: number; pinnedSet: Set<string> } | null = null
  private statsCache: UsageStatsCache | null = null
  private statsQueue: UsageStatsQueue | null = null
  private readonly executeAcceptedListeners = new Set<UsageExecuteAcceptedListener>()
  /**
   * Display-session → the canonical keys already counted as visible in it.
   *
   * Bounded and LRU-evicted (see {@link SearchUsageService.pruneVisibleSessions}); the worst case
   * after eviction is one duplicate `searchCount`, never an unbounded map.
   */
  private readonly visibleSessions = new Map<string, Set<string>>()

  /**
   * In-flight execute acceptances, so `flush()` can wait for every admitted write to settle.
   *
   * The execute path no longer goes through `usage-stats-queue` (R7: the log + counters commit in
   * one interactive transaction), so `forceFlush()` alone would let a recommendation read slip
   * past a commit that is still queued on the db-write scheduler. That would serve the pre-execute
   * snapshot to the first read after an execute.
   */
  private readonly pendingExecutes = new Set<Promise<void>>()

  constructor(private readonly deps: SearchUsageServiceDeps) {}

  initialize(db: LibSQLDatabase<typeof schema>): void {
    this.statsCache = new UsageStatsCache(10_000, 15 * 60 * 1_000)
    this.statsQueue = new UsageStatsQueue(db, {
      searchFlushIntervalMs: 30 * 60 * 1_000,
      searchFlushEventThreshold: 2_000
    })
  }

  /**
   * Subscribe to accepted executes. Fires twice per admitted action, on purpose:
   *
   * 1. synchronously, BEFORE the write is durable, with `usageStats: null` — the earliest moment a
   *    consumer can drop a stale recommendation generation without waiting on the database;
   * 2. after the transaction commits, with the committed row — for row-metadata pushes.
   *
   * A duplicate `eventId` fires neither: nothing changed, so nothing needs invalidating. Returning
   * the unsubscribe is the whole lifecycle; a listener must not throw (it would break the write
   * path) so exceptions are caught and logged.
   */
  onExecuteAccepted(listener: UsageExecuteAcceptedListener): () => void {
    this.executeAcceptedListeners.add(listener)
    return () => {
      this.executeAcceptedListeners.delete(listener)
    }
  }

  private notifyExecuteAccepted(event: UsageExecuteAcceptedEvent): void {
    for (const listener of this.executeAcceptedListeners) {
      try {
        listener(event)
      } catch (error) {
        log.error('Usage execute-accepted listener failed', { error })
      }
    }
  }

  invalidatePinnedCache(): void {
    this.pinnedCache = null
  }

  invalidateRetentionCaches(): void {
    this.statsCache?.clear()
    this.invalidatePinnedCache()
  }

  async recordSearch(sessionId: string, query: TuffQuery): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) return
    try {
      await dbUtils.addUsageLog({
        sessionId,
        itemId: 'search_session',
        source: 'system',
        action: 'search',
        keyword: query.text,
        timestamp: new Date(),
        context: JSON.stringify(query.context || {})
      })
    } catch (error) {
      log.error('Failed to record search usage', { error })
    }
  }

  async injectUsageStats(items: TuffItem[]): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils || items.length === 0) return
    try {
      const keys = items.map((item) => resolveUsageIdentity(item))
      const stats = this.statsCache
        ? await getUsageStatsBatchCached(dbUtils, this.statsCache, keys)
        : await dbUtils.getUsageStatsBatch(keys)
      // One batched behaviour read for the same keys — the reliable dated facts. No per-key query.
      const behaviors = await dbUtils.getUsageBehaviorBatch(keys)
      const behaviorByKey = new Map(behaviors.map((row) => [`${row.sourceId}:${row.itemId}`, row]))
      const statsByItem = new Map(stats.map((stat) => [`${stat.sourceId}:${stat.itemId}`, stat]))
      for (const item of items) {
        const key = resolveUsageIdentity(item)
        const meta = (item.meta ??= {})
        // Always stamp the statistical identity, even with no stored row: the renderer echoes the
        // facts it was handed, and a reader that has to guess would be free to mint a second
        // count under a rebuilt display id.
        meta._originalSourceId = key.sourceId
        meta._originalItemId = key.itemId
        const stat = statsByItem.get(`${key.sourceId}:${key.itemId}`)
        const behavior = behaviorByKey.get(`${key.sourceId}:${key.itemId}`)
        if (!stat && !behavior) continue
        const usageStats: UsageStatsSnapshot = {
          executeCount: stat?.executeCount ?? 0,
          searchCount: stat?.searchCount ?? 0,
          cancelCount: stat?.cancelCount ?? 0,
          lastExecuted: stat?.lastExecuted?.toISOString() ?? null,
          lastSearched: stat?.lastSearched?.toISOString() ?? null,
          lastCancelled: stat?.lastCancelled?.toISOString() ?? null
        }
        // Reliable dated facts, projected from the behaviour row. The tuple/zero fields are
        // always present so the search-side scorer can never silently fall back to the lifetime
        // count for an item that has no dated evidence (R2/R9): zero here + null
        // `lastExecutedAt` means "no reliable acceptance", not "reuse executeCount30 as
        // executeCount".
        if (behavior) {
          usageStats.executeCount30 = behavior.executeCount30
          usageStats.executeCount7 = behavior.executeCount7
          usageStats.activeDays30 = behavior.activeDays30
          usageStats.activeDays7 = behavior.activeDays7
          usageStats.lastExecutedAt = behavior.lastExecutedAt
          usageStats.decayedExecuteScore30 = behavior.decayedExecuteScore30
          usageStats.hourDistribution30 = behavior.hourDistribution30
          usageStats.dayOfWeekDistribution30 = behavior.dayOfWeekDistribution30
          usageStats.timeSlotDistribution30 = behavior.timeSlotDistribution30
        }
        meta.usageStats = usageStats
      }
    } catch (error) {
      log.error('Failed to inject usage stats', { error })
    }
  }

  async injectPinnedState(items: TuffItem[]): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils || items.length === 0) return
    try {
      const now = Date.now()
      if (!this.pinnedCache || now - this.pinnedCache.fetchedAt >= 10_000) {
        this.pinnedCache = {
          fetchedAt: now,
          pinnedSet: new Set(
            (await dbUtils.getAllPinnedItems()).map((pin) => `${pin.sourceId}:${pin.itemId}`)
          )
        }
      }
      for (const item of items) {
        const key = resolveUsageIdentity(item)
        if (this.pinnedCache.pinnedSet.has(`${key.sourceId}:${key.itemId}`)) {
          item.meta ??= {}
          item.meta.pinned = { isPinned: true, pinnedAt: now }
        }
      }
    } catch (error) {
      log.error('Failed to inject pinned state', { error })
    }
  }

  /**
   * Record display-only visibility of items the renderer actually put in front of the user.
   *
   * This is the `search_count` half of `item_usage_stats` and nothing else: it never touches
   * `execute_count`, never refreshes the execution expiry, and is not hit-rate (that stays in
   * `recommendationExposureService`).
   *
   * Dedupe is per display session, not per call: virtual scrolling and row-metadata repaints can
   * report the same item in several RPCs, and each of them is still the same one display (R3).
   * The session key set is bounded and evicted oldest-first, so a long-lived process cannot grow
   * it without limit; a `null` session (internal callers with no display session) keeps only the
   * single-call dedupe, because there is no session to remember it under.
   *
   * Display may keep batching: batching only delays visibility of a display number, which no
   * product rule reads back synchronously.
   */
  async recordVisibleResults(
    items: VisibleResultIdentity[],
    sessionId: string | null
  ): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils || items.length === 0) return
    const queue = this.statsQueue
    const seenKeys = sessionId ? this.getVisibleSessionKeys(sessionId) : new Set<string>()
    try {
      const pending: VisibleResultIdentity[] = []
      for (const item of items) {
        if (pending.length >= VISIBLE_RESULTS_MAX_PER_REPORT) break
        const sourceId = recommendationSourceRegistry.canonicalize(item.sourceId)
        const dedupe = `${sourceId}\u0000${item.itemId}`
        if (seenKeys.has(dedupe)) continue
        seenKeys.add(dedupe)
        pending.push({ ...item, sourceId })
      }
      await Promise.allSettled(
        pending.map(async (item) => {
          if (queue) queue.enqueueSearch(item.sourceId, item.itemId, item.sourceType ?? '')
          else
            await dbUtils.incrementUsageStats(
              item.sourceId,
              item.itemId,
              item.sourceType ?? '',
              'search'
            )
        })
      )
    } catch (error) {
      log.error('Failed to record visible results', { error })
    }
    if (sessionId) this.pruneVisibleSessions()
  }

  /**
   * The display-session key set, created on first report and refreshed (LRU) on reuse.
   *
   * Re-inserting moves a session to the tail so the evicted entry is the least-recently-reported
   * one, which is what keeps a bounded map correct while a user works through many sessions.
   */
  private getVisibleSessionKeys(sessionId: string): Set<string> {
    const existing = this.visibleSessions.get(sessionId)
    if (existing) {
      this.visibleSessions.delete(sessionId)
      this.visibleSessions.set(sessionId, existing)
      return existing
    }
    const created = new Set<string>()
    this.visibleSessions.set(sessionId, created)
    this.pruneVisibleSessions()
    return created
  }

  private pruneVisibleSessions(): void {
    if (this.visibleSessions.size <= VISIBLE_SESSION_MAX_ENTRIES) return
    const overflow = this.visibleSessions.size - VISIBLE_SESSION_MAX_ENTRIES
    let dropped = 0
    for (const key of this.visibleSessions.keys()) {
      if (dropped >= overflow) break
      this.visibleSessions.delete(key)
      dropped++
    }
  }

  /**
   * @param options.eventId Identifier of this user action; reused verbatim for retries/duplicate
   * notifications so the write is accepted exactly once.
   * @param options.entryPoint Overrides the derived surface. Callers outside the search path pass
   * their own; a plain CoreBox execute leaves it unset and gets `recommendation` or `core-box`
   * decided from the exposure state below.
   * @param options.previousApp Foreground app captured before the launch was handed over. Read
   * here instead only when the caller had no chance to capture it first.
   *
   * The service is the single writer for effective usage: the log row, the cumulative counters,
   * the summary and the daily trend commit in one interactive transaction, deduped on `eventId`.
   * It never reports success it did not persist — a failed commit rejects, and the caller keeps the
   * user's already-accepted action while dropping the statistics.
   */
  async recordExecute(
    sessionId: string | null,
    item: TuffItem,
    itemId: string,
    options: RecordExecuteOptions
  ): Promise<void> {
    // Track the in-flight acceptance so `flush()` can act as a write barrier for the first
    // recommendation snapshot after an execute (R7). The caller still awaits (and sees) this
    // promise; the tracking copy only observes settlement.
    const pending = this.performExecuteRecord(sessionId, item, itemId, options)
    this.pendingExecutes.add(pending)
    const release = () => {
      this.pendingExecutes.delete(pending)
    }
    pending.then(release, release)
    return pending
  }

  private async performExecuteRecord(
    sessionId: string | null,
    item: TuffItem,
    itemId: string,
    options: RecordExecuteOptions
  ): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) return
    const now = new Date()
    const eventId = options.eventId

    // Derived rather than passed by the caller: the execute path is shared by the typed-query
    // list and the recommendation grid, and a parameter threaded through every call site is one
    // missed argument away from silently mislabelling a whole surface.
    //
    // MUST be read before `recordClick` below, which consumes the exposure entry — asking
    // afterwards always answers "not a recommendation".
    const resolvedEntryPoint: UsageEntryPoint =
      options?.entryPoint ??
      (recommendationExposureService.isExposed(item.source.id, itemId)
        ? 'recommendation'
        : 'core-box')

    const context = JSON.stringify({
      scoring: item.scoring,
      ent: resolvedEntryPoint,
      eventId,
      ...(options?.previousApp
        ? { prevApp: options.previousApp }
        : await resolvePreviousAppContext())
    })

    // Notify before the write: consumers drop their caches now, so the next read cannot serve a
    // pre-execute snapshot even if the commit is still queued behind other writes.
    this.notifyExecuteAccepted({
      sourceId: item.source.id,
      itemId,
      eventId,
      usageStats: null
    })

    let result: ExecuteRecordResult
    try {
      result = await dbUtils.recordExecuteTransaction({
        eventId,
        sourceId: item.source.id,
        itemId,
        sourceType: item.source.type,
        sessionId,
        timestamp: now,
        context
      })
    } catch (error) {
      log.error(`Failed to persist execute for item ${itemId}`, { error, meta: { eventId } })
      throw error
    }

    if (!result.accepted) {
      // Duplicate event id: the action was already counted. Not an error, and nothing changed.
      return
    }

    // Statistics caches are invalidated only for a write that actually changed the row.
    this.statsCache?.invalidate(item.source.id, itemId)
    // Click side of hit-rate@k: only counts when this id was actually shown as
    // a recommendation in this session (no-op for plain search executes).
    recommendationExposureService.recordClick(item.source.id, itemId)

    if (result.usageStats) {
      const committed = result.usageStats
      this.notifyExecuteAccepted({
        sourceId: committed.sourceId,
        itemId: committed.itemId,
        eventId,
        usageStats: {
          executeCount: committed.executeCount,
          searchCount: committed.searchCount,
          cancelCount: committed.cancelCount,
          lastExecuted: committed.lastExecuted?.toISOString() ?? null,
          lastSearched: committed.lastSearched?.toISOString() ?? null,
          lastCancelled: committed.lastCancelled?.toISOString() ?? null
        }
      })
    }
  }

  /**
   * Flush pending usage work and act as a write barrier for reads that must not see a stale
   * snapshot.
   *
   * Order matters: drain the display queue first, then wait for every in-flight execute
   * acceptance to settle. A read that awaits this therefore observes every execute admitted
   * before the call, so the first recommendation snapshot after an execute cannot be built from
   * the pre-execute database. Settlement is awaited, not success — a failed execute must not
   * block recommendations (its statistics are simply absent).
   */
  async flush(): Promise<void> {
    await this.statsQueue?.forceFlush()
    while (this.pendingExecutes.size > 0) {
      await Promise.allSettled([...this.pendingExecutes])
    }
  }
}
