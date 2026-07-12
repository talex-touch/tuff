import type { TuffItem, TuffQuery } from '@talex-touch/utils'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../db/schema'
import type { DbUtils } from '../../../db/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { getUsageStatsBatchCached, UsageStatsCache } from './usage-stats-cache'
import { UsageStatsQueue } from './usage-stats-queue'

const log = getLogger('search-engine')

export interface SearchUsageServiceDeps {
  getDbUtils: () => DbUtils | null
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

  async recordExecute(sessionId: string, item: TuffItem, itemId: string): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) return
    const now = new Date()
    await dbUtils.addUsageLog({
      sessionId,
      itemId,
      source: item.source.type,
      action: 'execute',
      keyword: '',
      timestamp: now,
      context: JSON.stringify({ scoring: item.scoring })
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
    this.statsCache?.invalidate(item.source.id, itemId)
  }

  async flush(): Promise<void> {
    await this.statsQueue?.forceFlush()
  }
}
