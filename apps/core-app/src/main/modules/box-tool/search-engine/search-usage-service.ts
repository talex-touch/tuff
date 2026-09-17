import type { TuffItem, TuffQuery } from '@talex-touch/utils'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../db/schema'
import type { DbUtils } from '../../../db/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { getUsageStatsBatchCached, UsageStatsCache } from './usage-stats-cache'
import { UsageStatsQueue } from './usage-stats-queue'
import { recommendationExposureService } from './recommendation/recommendation-exposure-service'
import { resolvePreviousAppContext } from './app-launch-recorder'
import type { UsageEntryPoint } from './usage-entry-point'

const log = getLogger('search-engine')

export interface SearchUsageServiceDeps {
  getDbUtils: () => DbUtils | null
}

/**
 * Attribution a caller already holds for one execute.
 *
 * `previousApp` is the one field that cannot be derived here: it is a foreground read, and a
 * caller that schedules a launch on the next macrotask has to make it before that launch becomes
 * frontmost, or the transition records the launched app as having been launched from itself.
 */
export interface RecordExecuteOptions {
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

  constructor(private readonly deps: SearchUsageServiceDeps) {}

  initialize(db: LibSQLDatabase<typeof schema>): void {
    this.statsCache = new UsageStatsCache(10_000, 15 * 60 * 1_000)
    this.statsQueue = new UsageStatsQueue(db, {
      searchFlushIntervalMs: 30 * 60 * 1_000,
      actionFlushIntervalMs: 10 * 60 * 1_000,
      searchFlushEventThreshold: 2_000,
      actionFlushEventThreshold: 300
    })
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
      const keys = items.map((item) => ({ sourceId: item.source.id, itemId: item.id }))
      const stats = this.statsCache
        ? await getUsageStatsBatchCached(dbUtils, this.statsCache, keys)
        : await dbUtils.getUsageStatsBatch(keys)
      const statsByItem = new Map(stats.map((stat) => [`${stat.sourceId}:${stat.itemId}`, stat]))
      for (const item of items) {
        const stat = statsByItem.get(`${item.source.id}:${item.id}`)
        if (!stat) continue
        item.meta ??= {}
        item.meta.usageStats = {
          executeCount: stat.executeCount,
          searchCount: stat.searchCount,
          cancelCount: stat.cancelCount,
          lastExecuted: stat.lastExecuted?.toISOString() ?? null,
          lastSearched: stat.lastSearched?.toISOString() ?? null,
          lastCancelled: stat.lastCancelled?.toISOString() ?? null
        }
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
        const meta = item.meta
        const sourceId =
          meta &&
          typeof meta === 'object' &&
          '_originalSourceId' in meta &&
          typeof meta._originalSourceId === 'string'
            ? meta._originalSourceId
            : item.source.id
        const itemId =
          meta &&
          typeof meta === 'object' &&
          '_originalItemId' in meta &&
          typeof meta._originalItemId === 'string'
            ? meta._originalItemId
            : item.id
        if (this.pinnedCache.pinnedSet.has(`${sourceId}:${itemId}`)) {
          item.meta ??= {}
          item.meta.pinned = { isPinned: true, pinnedAt: now }
        }
      }
    } catch (error) {
      log.error('Failed to inject pinned state', { error })
    }
  }

  async recordDisplayedResults(items: TuffItem[]): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils || items.length === 0) return
    const queue = this.statsQueue
    try {
      await Promise.allSettled(
        items.slice(0, 10).map(async (item) => {
          if (queue) queue.enqueue(item.source.id, item.id, item.source.type, 'search')
          else
            await dbUtils.incrementUsageStats(item.source.id, item.id, item.source.type, 'search')
        })
      )
    } catch (error) {
      log.error('Failed to record search results', { error })
    }
  }

  /**
   * @param options.entryPoint Overrides the derived surface. Callers outside the search path pass
   * their own; a plain CoreBox execute leaves it unset and gets `recommendation` or `core-box`
   * decided from the exposure state below.
   * @param options.previousApp Foreground app captured before the launch was handed over. Read
   * here instead only when the caller had no chance to capture it first.
   */
  async recordExecute(
    sessionId: string,
    item: TuffItem,
    itemId: string,
    options?: RecordExecuteOptions
  ): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) return
    const now = new Date()

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

    await dbUtils.addUsageLog({
      sessionId,
      itemId,
      // `source.id`, not `source.type`: item_usage_stats, item_time_stats and
      // usage_trend_daily are all keyed by the id, and the time aggregator
      // copies this column straight into item_time_stats.sourceId. A type here
      // makes every id-keyed join miss (legacy rows are repaired by
      // usage-source-identity-migration).
      source: item.source.id,
      action: 'execute',
      keyword: '',
      // `ent` rides alongside the scoring snapshot rather than replacing it: the aggregates are
      // keyed by (source_id, item_id) and cannot carry an entry dimension without forking their
      // counts, so provenance lives in the log. `prevApp` is captured at the only moment it is
      // still true - read later, the foreground app is the one just launched.
      timestamp: now,
      context: JSON.stringify({
        scoring: item.scoring,
        ent: resolvedEntryPoint,
        ...(options?.previousApp
          ? { prevApp: options.previousApp }
          : await resolvePreviousAppContext())
      })
    })
    await dbUtils.incrementUsageSummary(itemId)
    if (this.statsQueue) {
      this.statsQueue.enqueue(item.source.id, itemId, item.source.type, 'execute')
    } else {
      await dbUtils.incrementUsageStats(item.source.id, itemId, item.source.type, 'execute')
    }
    void dbUtils.incrementUsageTrendDaily(item.source.id, itemId, now).catch((error) => {
      log.warn(`Failed to update trend stats for item ${itemId}`, { error })
    })
    // Click side of hit-rate@k: only counts when this id was actually shown as
    // a recommendation in this session (no-op for plain search executes).
    recommendationExposureService.recordClick(item.source.id, itemId)
    this.statsCache?.invalidate(item.source.id, itemId)
  }

  async flush(): Promise<void> {
    await this.statsQueue?.forceFlush()
  }
}
