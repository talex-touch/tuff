import type { TuffContainerLayout, TuffItem } from '@talex-touch/utils'
import type { DbUtils } from '../../../../db/utils'
import type { ParsedItemTimeStats } from '../time-stats-aggregator'
import type { ContextSignal, TimePattern } from './context-provider'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { dbWriteScheduler } from '../../../../db/db-write-scheduler'
import { withSqliteRetry } from '../../../../db/sqlite-retry'
import { getSentryService } from '../../../sentry'
import * as schema from '../../../../db/schema'
import { ContextProvider } from './context-provider'
import { ItemRebuilder } from './item-rebuilder'

const DAY_MS = 86_400_000
const TREND_HISTORY_DAYS = 30
const TREND_RECENT_DAYS = 7
const TREND_BACKFILL_INTERVAL_SECONDS = 2
const RECOMMENDATION_PERF_WINDOW_MS = 60 * 60 * 1000
const RECOMMENDATION_PERF_SAMPLE_LIMIT = 2000
const RECOMMENDATION_TELEMETRY_INTERVAL_MS = 10 * 60 * 1000
const RECOMMENDATION_QUERY_BUDGET_MS = 50
const RECOMMENDATION_PERF_PLUGIN = 'core'

function toDayBucket(timestampMs: number): number {
  return Math.floor(timestampMs / DAY_MS)
}

export class RecommendationEngine {
  private contextProvider: ContextProvider
  private itemRebuilder: ItemRebuilder

  private recommendationCache: {
    items: TuffItem[]
    timestamp: number
    context: ContextSignal
  } | null = null

  private readonly CACHE_DURATION_MS = 30 * 60 * 1000
  private readonly REFRESH_INTERVAL_MS = 15 * 60 * 1000
  private readonly pollingService = PollingService.getInstance()
  private readonly refreshTaskId = 'recommendation.refresh'
  private readonly trendBackfillTaskId = 'recommendation.trend-backfill'
  private readonly telemetryTaskId = 'recommendation.telemetry-report'
  private trendBackfillQueue: number[] | null = null
  private trendBackfillCompleted = false

  constructor(private dbUtils: DbUtils) {
    this.contextProvider = new ContextProvider()
    this.itemRebuilder = new ItemRebuilder(dbUtils)

    this.startBackgroundRefresh()
    this.startTelemetryReport()
  }

  /** Start background refresh timer */
  private startBackgroundRefresh(): void {
    if (this.pollingService.isRegistered(this.refreshTaskId)) {
      this.pollingService.unregister(this.refreshTaskId)
    }
    this.pollingService.register(
      this.refreshTaskId,
      async () => {
        try {
          await this.recommend({ forceRefresh: true })
        } catch (error) {
          console.error('[RecommendationEngine] Background refresh failed', error)
        }
      },
      { interval: this.REFRESH_INTERVAL_MS, unit: 'milliseconds' }
    )
    this.pollingService.start()
  }

  private startTelemetryReport(): void {
    if (this.pollingService.isRegistered(this.telemetryTaskId)) {
      this.pollingService.unregister(this.telemetryTaskId)
    }
    this.pollingService.register(
      this.telemetryTaskId,
      async () => {
        try {
          await this.reportRecommendationTelemetry()
        } catch (error) {
          console.error('[RecommendationEngine] Telemetry report failed', error)
        }
      },
      { interval: RECOMMENDATION_TELEMETRY_INTERVAL_MS, unit: 'milliseconds' }
    )
    this.pollingService.start()
  }

  private recordRecommendationPerf(eventType: string, metadata: Record<string, unknown>): void {
    const db = this.dbUtils.getDb()
    const payload = {
      pluginName: RECOMMENDATION_PERF_PLUGIN,
      eventType,
      metadata: JSON.stringify(metadata),
      timestamp: Date.now()
    }

    void dbWriteScheduler
      .schedule('analytics.plugin', () =>
        withSqliteRetry(() => db.insert(schema.pluginAnalytics).values(payload), {
          label: 'recommendation.perf'
        })
      )
      .catch((error) => {
        console.error('[RecommendationEngine] Failed to record perf metrics', error)
      })
  }

  private async reportRecommendationTelemetry(): Promise<void> {
    const sentryService = getSentryService()
    if (!sentryService.isTelemetryEnabled()) return

    const db = this.dbUtils.getDb()
    const windowStart = Date.now() - RECOMMENDATION_PERF_WINDOW_MS

    const totalRows = await db
      .select({ metadata: schema.pluginAnalytics.metadata })
      .from(schema.pluginAnalytics)
      .where(
        and(
          eq(schema.pluginAnalytics.pluginName, RECOMMENDATION_PERF_PLUGIN),
          eq(schema.pluginAnalytics.eventType, 'recommendation.total'),
          gte(schema.pluginAnalytics.timestamp, windowStart)
        )
      )
      .orderBy(desc(schema.pluginAnalytics.timestamp))
      .limit(RECOMMENDATION_PERF_SAMPLE_LIMIT)

    const totalSamples = this.collectPerfSamples(totalRows)
    const totalStats = this.buildPerfStats(totalSamples.durationsByLayer.none ?? [])
    const totalAllStats = this.buildPerfStats(totalSamples.durations)
    const totalByCacheLayer = this.buildPerfStatsByLayer(totalSamples.durationsByLayer)

    const trendingRows = await db
      .select({ metadata: schema.pluginAnalytics.metadata })
      .from(schema.pluginAnalytics)
      .where(
        and(
          eq(schema.pluginAnalytics.pluginName, RECOMMENDATION_PERF_PLUGIN),
          eq(schema.pluginAnalytics.eventType, 'recommendation.trending'),
          gte(schema.pluginAnalytics.timestamp, windowStart)
        )
      )
      .orderBy(desc(schema.pluginAnalytics.timestamp))
      .limit(RECOMMENDATION_PERF_SAMPLE_LIMIT)

    const trendingSamples = this.collectPerfSamples(trendingRows)
    const trendingStats = this.buildPerfStats(trendingSamples.durations)

    if (!totalStats && !trendingStats) return

    sentryService.queueNexusTelemetry({
      eventType: 'performance',
      metadata: {
        kind: 'recommendation.aggregate',
        windowMs: RECOMMENDATION_PERF_WINDOW_MS,
        sampleLimit: RECOMMENDATION_PERF_SAMPLE_LIMIT,
        cacheLayerCounts: totalSamples.cacheLayers,
        total: totalStats ?? undefined,
        totalAll: totalAllStats ?? undefined,
        totalByCacheLayer:
          Object.keys(totalByCacheLayer).length > 0 ? totalByCacheLayer : undefined,
        trending: trendingStats ?? undefined
      }
    })
  }

  private collectPerfSamples(rows: Array<{ metadata: string | null }>): {
    durations: number[]
    cacheLayers: Record<string, number>
    durationsByLayer: Record<string, number[]>
  } {
    const durations: number[] = []
    const cacheLayers: Record<string, number> = { none: 0, memory: 0, db: 0, unknown: 0 }
    const durationsByLayer: Record<string, number[]> = {
      none: [],
      memory: [],
      db: [],
      unknown: []
    }

    for (const row of rows) {
      const parsed = this.parsePerfMetadata(row.metadata)
      if (!parsed) continue

      const cacheLayer = parsed.cacheLayer ?? 'unknown'
      cacheLayers[cacheLayer] = (cacheLayers[cacheLayer] ?? 0) + 1

      if (typeof parsed.durationMs !== 'number') continue
      durations.push(parsed.durationMs)
      if (!durationsByLayer[cacheLayer]) {
        durationsByLayer[cacheLayer] = []
      }
      durationsByLayer[cacheLayer].push(parsed.durationMs)
    }

    return { durations, cacheLayers, durationsByLayer }
  }

  private parsePerfMetadata(metadata: string | null): RecommendationPerfMetadata | null {
    if (!metadata) return null
    try {
      const parsed = JSON.parse(metadata) as Record<string, unknown>
      return {
        durationMs: this.toNumber(parsed.durationMs),
        cacheLayer: typeof parsed.cacheLayer === 'string' ? parsed.cacheLayer : undefined
      }
    } catch {
      return null
    }
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
    return null
  }

  private buildPerfStats(durations: number[]): PerfStats | null {
    if (durations.length === 0) return null
    const sorted = [...durations].sort((a, b) => a - b)
    const total = durations.reduce((sum, value) => sum + value, 0)
    const avg = total / durations.length
    const p50 = this.pickPercentile(sorted, 0.5)
    const p95 = this.pickPercentile(sorted, 0.95)
    const max = sorted[sorted.length - 1] ?? 0
    const overBudgetCount = durations.filter(
      (value) => value > RECOMMENDATION_QUERY_BUDGET_MS
    ).length

    return {
      samples: durations.length,
      avgMs: Math.round(avg),
      p50Ms: Math.round(p50),
      p95Ms: Math.round(p95),
      maxMs: Math.round(max),
      overBudgetMs: RECOMMENDATION_QUERY_BUDGET_MS,
      overBudgetCount
    }
  }

  private buildPerfStatsByLayer(
    durationsByLayer: Record<string, number[]>
  ): Record<string, PerfStats> {
    const result: Record<string, PerfStats> = {}
    for (const [layer, durations] of Object.entries(durationsByLayer)) {
      const stats = this.buildPerfStats(durations)
      if (stats) {
        result[layer] = stats
      }
    }
    return result
  }

  private pickPercentile(sorted: number[], percentile: number): number {
    if (sorted.length === 0) return 0
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(percentile * sorted.length) - 1)
    )
    return sorted[index]
  }

  private scheduleTrendBackfill(): void {
    if (this.trendBackfillQueue || this.trendBackfillCompleted) return

    const today = toDayBucket(Date.now())
    const startDay = today - (TREND_HISTORY_DAYS - 1)
    const days: number[] = []
    for (let day = startDay; day <= today; day++) {
      days.push(day)
    }

    this.trendBackfillQueue = days

    if (this.pollingService.isRegistered(this.trendBackfillTaskId)) {
      this.pollingService.unregister(this.trendBackfillTaskId)
    }

    this.pollingService.register(
      this.trendBackfillTaskId,
      async () => {
        await this.processTrendBackfillTick()
      },
      { interval: TREND_BACKFILL_INTERVAL_SECONDS, unit: 'seconds', runImmediately: true }
    )
    this.pollingService.start()
  }

  private async processTrendBackfillTick(): Promise<void> {
    if (!this.trendBackfillQueue || this.trendBackfillQueue.length === 0) {
      this.pollingService.unregister(this.trendBackfillTaskId)
      this.trendBackfillQueue = null
      this.trendBackfillCompleted = true
      return
    }

    const day = this.trendBackfillQueue.shift()
    if (day == null) return

    try {
      const hasData = await this.hasTrendDataForDay(day)
      if (!hasData) {
        await this.backfillTrendDay(day)
      }
    } catch (error) {
      console.error('[RecommendationEngine] Trend backfill failed', error)
    }
  }

  private async hasTrendDataForDay(day: number): Promise<boolean> {
    const db = this.dbUtils.getDb()
    const row = await db
      .select({ day: schema.usageTrendDaily.day })
      .from(schema.usageTrendDaily)
      .where(eq(schema.usageTrendDaily.day, day))
      .limit(1)
      .get()
    return Boolean(row)
  }

  private async backfillTrendDay(day: number): Promise<void> {
    const db = this.dbUtils.getDb()
    const dayStart = new Date(day * DAY_MS)
    const dayEnd = new Date((day + 1) * DAY_MS)
    const dayBucket = day

    const rows = await db
      .select({
        sourceId: schema.usageLogs.source,
        itemId: schema.usageLogs.itemId,
        executeCount: sql<number>`COUNT(*)`
      })
      .from(schema.usageLogs)
      .where(
        and(
          eq(schema.usageLogs.action, 'execute'),
          gte(schema.usageLogs.timestamp, dayStart),
          lt(schema.usageLogs.timestamp, dayEnd)
        )
      )
      .groupBy(schema.usageLogs.source, schema.usageLogs.itemId)

    if (rows.length === 0) return

    const now = new Date()
    const values = rows.map((row) => ({
      sourceId: row.sourceId,
      itemId: row.itemId,
      day: dayBucket,
      executeCount: Number(row.executeCount ?? 0),
      updatedAt: now
    }))

    const chunkSize = 500
    for (let i = 0; i < values.length; i += chunkSize) {
      const chunk = values.slice(i, i + chunkSize)
      await db
        .insert(schema.usageTrendDaily)
        .values(chunk)
        .onConflictDoUpdate({
          target: [
            schema.usageTrendDaily.sourceId,
            schema.usageTrendDaily.itemId,
            schema.usageTrendDaily.day
          ],
          set: {
            executeCount: sql`excluded.execute_count`,
            updatedAt: sql`excluded.updated_at`
          }
        })
    }
  }

  /** Stop background refresh timer */
  public stopBackgroundRefresh(): void {
    this.pollingService.unregister(this.refreshTaskId)
    this.pollingService.unregister(this.trendBackfillTaskId)
    this.pollingService.unregister(this.telemetryTaskId)
  }

  /** Generate recommendation list */
  async recommend(options: RecommendationOptions = {}): Promise<RecommendationResult> {
    const startTime = performance.now()
    this.scheduleTrendBackfill()

    const contextStartedAt = performance.now()
    const context = await this.contextProvider.getCurrentContext()
    const contextDuration = performance.now() - contextStartedAt

    if (!options.forceRefresh && this.recommendationCache) {
      const cacheAge = Date.now() - this.recommendationCache.timestamp
      if (cacheAge < this.CACHE_DURATION_MS) {
        console.debug('[RecommendationEngine] Cache hit, age:', (cacheAge / 1000).toFixed(1), 's')
        this.recordRecommendationPerf('recommendation.total', {
          cacheLayer: 'memory',
          durationMs: Math.round(performance.now() - startTime),
          contextMs: Math.round(contextDuration),
          itemsCount: this.recommendationCache.items.length
        })
        return {
          items: this.recommendationCache.items,
          context: this.recommendationCache.context,
          duration: performance.now() - startTime,
          fromCache: true,
          containerLayout: this.buildContainerLayout(options, this.recommendationCache.items)
        }
      }
    }

    const cached = await this.getCachedRecommendations(context)
    if (cached && !options.forceRefresh) {
      this.recordRecommendationPerf('recommendation.total', {
        cacheLayer: 'db',
        durationMs: Math.round(performance.now() - startTime),
        contextMs: Math.round(contextDuration),
        itemsCount: cached.items.length
      })
      return {
        items: cached.items,
        context,
        duration: performance.now() - startTime,
        fromCache: true
      }
    }

    const pinnedStartedAt = performance.now()
    const pinnedItems = await this.getPinnedItems()
    const pinnedDuration = performance.now() - pinnedStartedAt
    let pinnedTuffItems = await this.itemRebuilder.rebuildItems(
      pinnedItems.map((item) => ({
        ...item,
        source: 'pinned' as const,
        score: Number.MAX_SAFE_INTEGER
      }))
    )
    for (const item of pinnedTuffItems) {
      if (!item.meta) item.meta = {}
      item.meta.pinned = { isPinned: true, pinnedAt: Date.now() }
      item.meta.recommendation = { source: 'pinned' }
    }
    pinnedTuffItems = this.dedupeItems(pinnedTuffItems)

    const candidatesStartedAt = performance.now()
    const { items: candidates, perf: candidatePerf } = await this.getCandidates(context, options)
    const candidatesDuration = performance.now() - candidatesStartedAt

    if (candidates.length === 0) {
      const fallbackItems = await this.getFallbackRecommendations(options.limit || 10)
      const pinnedKeys = new Set(pinnedTuffItems.map((item) => this.getItemIdentity(item)))
      const filteredFallback = this.dedupeItems(fallbackItems).filter(
        (item) => !pinnedKeys.has(this.getItemIdentity(item))
      )
      const finalItems = this.dedupeItems([...filteredFallback, ...pinnedTuffItems]).slice(
        0,
        options.limit || 10
      )

      this.recommendationCache = {
        items: finalItems,
        timestamp: Date.now(),
        context
      }

      this.recordRecommendationPerf('recommendation.total', {
        cacheLayer: 'none',
        durationMs: Math.round(performance.now() - startTime),
        contextMs: Math.round(contextDuration),
        pinnedMs: Math.round(pinnedDuration),
        candidatesMs: Math.round(candidatesDuration),
        candidateCount: candidatePerf.totalCandidates,
        filteredCount: candidatePerf.filteredCount,
        itemsCount: finalItems.length,
        trendingMs: candidatePerf.trendingDurationMs,
        trendingRows: candidatePerf.trendingRows,
        trendingCandidates: candidatePerf.trendingCandidates,
        trendingReady: candidatePerf.trendingReady
      })

      return {
        items: finalItems,
        context,
        duration: performance.now() - startTime,
        fromCache: false,
        containerLayout: this.buildContainerLayout(options, finalItems)
      }
    }

    const scored = await this.scoreAndRank(candidates, context)
    const limit = options.limit || 10
    const diversified = this.applyDiversityFilter(scored, limit)
    const items = await this.itemRebuilder.rebuildItems(diversified)

    if (items.length === 0 && diversified.length > 0) {
      const fallbackItems = await this.getFallbackRecommendations(limit)
      const pinnedKeys = new Set(pinnedTuffItems.map((item) => this.getItemIdentity(item)))
      const filteredFallback = this.dedupeItems(fallbackItems).filter(
        (item) => !pinnedKeys.has(this.getItemIdentity(item))
      )
      const finalItems = this.dedupeItems([...filteredFallback, ...pinnedTuffItems]).slice(0, limit)

      this.recommendationCache = {
        items: finalItems,
        timestamp: Date.now(),
        context
      }

      this.recordRecommendationPerf('recommendation.total', {
        cacheLayer: 'none',
        durationMs: Math.round(performance.now() - startTime),
        contextMs: Math.round(contextDuration),
        pinnedMs: Math.round(pinnedDuration),
        candidatesMs: Math.round(candidatesDuration),
        candidateCount: candidatePerf.totalCandidates,
        filteredCount: candidatePerf.filteredCount,
        itemsCount: finalItems.length,
        trendingMs: candidatePerf.trendingDurationMs,
        trendingRows: candidatePerf.trendingRows,
        trendingCandidates: candidatePerf.trendingCandidates,
        trendingReady: candidatePerf.trendingReady
      })

      return {
        items: finalItems,
        context,
        duration: performance.now() - startTime,
        fromCache: false,
        containerLayout: this.buildContainerLayout(options, finalItems)
      }
    }

    const pinnedKeys = new Set(pinnedItems.map((p) => `${p.sourceId}:${p.itemId}`))
    const pinnedIdentityKeys = new Set(pinnedTuffItems.map((item) => this.getItemIdentity(item)))
    const filteredItems = this.dedupeItems(items).filter((item) => {
      const meta = item.meta as any
      const originalKey =
        meta?._originalSourceId && meta?._originalItemId
          ? `${meta._originalSourceId}:${meta._originalItemId}`
          : `${item.source.id}:${item.id}`
      const identityKey = this.getItemIdentity(item)
      return !pinnedKeys.has(originalKey) && !pinnedIdentityKeys.has(identityKey)
    })

    for (const item of filteredItems) {
      if (!item.meta) item.meta = {}
      if (!(item.meta as any).recommendation) {
        ;(item.meta as any).recommendation = { source: 'frequent' }
      }
    }

    const combinedItems = this.dedupeItems([...filteredItems, ...pinnedTuffItems]).slice(0, limit)

    await this.cacheRecommendations(context, combinedItems)
    const duration = performance.now() - startTime
    console.debug('[RecommendationEngine] Generated in', duration.toFixed(0), 'ms')

    this.recordRecommendationPerf('recommendation.total', {
      cacheLayer: 'none',
      durationMs: Math.round(duration),
      contextMs: Math.round(contextDuration),
      pinnedMs: Math.round(pinnedDuration),
      candidatesMs: Math.round(candidatesDuration),
      candidateCount: candidatePerf.totalCandidates,
      filteredCount: candidatePerf.filteredCount,
      itemsCount: combinedItems.length,
      trendingMs: candidatePerf.trendingDurationMs,
      trendingRows: candidatePerf.trendingRows,
      trendingCandidates: candidatePerf.trendingCandidates,
      trendingReady: candidatePerf.trendingReady
    })

    this.recommendationCache = {
      items: combinedItems,
      timestamp: Date.now(),
      context
    }

    const containerLayout = this.buildContainerLayout(options, combinedItems)

    return {
      items: combinedItems,
      context,
      duration,
      fromCache: false,
      containerLayout
    }
  }

  /** Build container layout: Recommend on top, Pinned at bottom (if exists) */
  private buildContainerLayout(
    _options: RecommendationOptions,
    items: TuffItem[]
  ): TuffContainerLayout {
    const pinnedItems = items.filter((item) => item.meta?.pinned?.isPinned)
    const recommendItems = items.filter((item) => !item.meta?.pinned?.isPinned)
    const totalCount = items.length

    const sections: TuffContainerLayout['sections'] = []

    // Recommend section on top
    if (recommendItems.length > 0) {
      sections.push({
        id: 'recommendations',
        title: 'Recommend',
        layout: 'grid',
        itemIds: recommendItems.map((item) => item.id),
        meta: { intelligence: true }
      })
    }

    // Pinned section at bottom (only if has pinned items)
    if (pinnedItems.length > 0) {
      sections.push({
        id: 'pinned',
        title: 'Pinned',
        layout: 'grid',
        itemIds: pinnedItems.map((item) => item.id),
        meta: { pinned: true }
      })
    }

    return {
      mode: 'grid',
      grid: {
        columns: Math.min(8, totalCount || 8),
        gap: 12,
        itemSize: 'medium'
      },
      sections
    }
  }

  /**
   * Get all pinned items from database
   */
  private async getPinnedItems(): Promise<ItemCandidate[]> {
    try {
      const pinnedRecords = await this.dbUtils.getAllPinnedItems()
      if (pinnedRecords.length === 0) return []

      const keys = pinnedRecords.map((p) => ({ sourceId: p.sourceId, itemId: p.itemId }))
      const usageStatsMap = new Map(
        (await this.dbUtils.getUsageStatsBatch(keys)).map((stat) => [
          `${stat.sourceId}:${stat.itemId}`,
          stat
        ])
      )

      return pinnedRecords.map((record) => {
        const key = `${record.sourceId}:${record.itemId}`
        const usageStats = usageStatsMap.get(key)
        return {
          sourceId: record.sourceId,
          itemId: record.itemId,
          sourceType: record.sourceType,
          usageStats: usageStats || {
            sourceId: record.sourceId,
            itemId: record.itemId,
            sourceType: record.sourceType,
            searchCount: 0,
            executeCount: 0,
            cancelCount: 0,
            lastSearched: null,
            lastExecuted: null,
            lastCancelled: null,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        }
      })
    } catch (error) {
      console.error('[RecommendationEngine] Failed to get pinned items:', error)
      return []
    }
  }

  /**
   * Fallback recommendation strategy: simple usage count ordering
   */
  private async getFallbackRecommendations(limit: number): Promise<TuffItem[]> {
    try {
      const frequentItems = await this.getFrequentItems(limit * 2) // Get more to ensure we have enough after rebuild

      if (frequentItems.length === 0) {
        console.debug('[DEBUG_REC_INIT] No frequent items found in database')
        return []
      }

      // 过滤掉文件类型的项目
      const filteredItems = frequentItems.filter(
        (item) => item.sourceId !== 'file-provider' && item.sourceType !== 'file'
      )

      const items = await this.itemRebuilder.rebuildItems(
        filteredItems.map((item) => ({
          ...item,
          source: 'frequent' as const,
          score: item.usageStats.executeCount
        }))
      )

      // Mark as recommendation (not pinned)
      for (const item of items) {
        if (!item.meta) item.meta = {}
        item.meta.recommendation = { source: 'frequent' }
      }

      return items.slice(0, limit)
    } catch (error) {
      console.error('[RecommendationEngine] Fallback recommendation failed:', error)
      return []
    }
  }

  /**
   * 获取候选项目池
   */
  private async getCandidates(
    context: ContextSignal,
    _options: RecommendationOptions
  ): Promise<CandidateResult> {
    const candidates: CandidateItem[] = []

    // 维度 1: 全局高频项目 (Top 30)
    const frequentItems = await this.getFrequentItems(30)
    console.debug(`[RecommendationEngine] Frequent items: ${frequentItems.length}`)
    candidates.push(
      ...frequentItems.map((item) => ({
        ...item,
        source: 'frequent' as const
      }))
    )

    // 维度 2: 最近使用 (Top 20)
    const recentItems = await this.getRecentItems(20)
    console.debug(`[RecommendationEngine] Recent items: ${recentItems.length}`)
    candidates.push(
      ...recentItems.map((item) => ({
        ...item,
        source: 'recent' as const
      }))
    )

    // 维度 3: 时段热门 (Top 20)
    const timeBasedItems = await this.getTimeBasedTopItems(context.time, 20)
    console.debug(`[RecommendationEngine] Time-based items: ${timeBasedItems.length}`)
    candidates.push(
      ...timeBasedItems.map((item) => ({
        ...item,
        source: 'time-based' as const
      }))
    )

    // 维度 4: 趋势项目 (Top 15)
    const trending = await this.getTrendingItems(15)
    const trendingItems = trending.items
    console.debug(`[RecommendationEngine] Trending items: ${trendingItems.length}`)
    candidates.push(
      ...trendingItems.map((item) => ({
        ...item,
        source: 'trending' as const
      }))
    )

    console.debug(`[RecommendationEngine] Total candidates before dedup: ${candidates.length}`)

    const totalCandidates = candidates.length

    // 去重(同一 sourceId + itemId 只保留第一次出现)
    const deduplicated = this.deduplicateCandidates(candidates)

    // 过滤掉文件类型的项目，推荐列表不展示文件
    const filtered = deduplicated.filter(
      (item) => item.sourceId !== 'file-provider' && item.sourceType !== 'file'
    )

    // 统计各 source 的分布
    const sourceDistribution = new Map<string, number>()
    for (const item of filtered) {
      const key = item.sourceId
      sourceDistribution.set(key, (sourceDistribution.get(key) || 0) + 1)
    }
    console.debug(
      `[DEBUG_REC_INIT] After dedup and filter: ${filtered.length} items, distribution:`,
      Object.fromEntries(sourceDistribution)
    )

    return {
      items: filtered,
      perf: {
        totalCandidates,
        filteredCount: filtered.length,
        trendingDurationMs: trending.perf.durationMs,
        trendingRows: trending.perf.rowCount,
        trendingCandidates: trendingItems.length,
        trendingReady: trending.perf.ready
      }
    }
  }

  /**
   * 获取全局高频项目
   */
  private async getFrequentItems(limit: number): Promise<ItemCandidate[]> {
    const db = this.dbUtils.getDb()

    const stats = await db
      .select()
      .from(schema.itemUsageStats)
      .orderBy(desc(schema.itemUsageStats.executeCount))
      .limit(limit)
      .all()

    return stats.map((stat) => ({
      sourceId: stat.sourceId,
      itemId: stat.itemId,
      sourceType: stat.sourceType,
      usageStats: stat
    }))
  }

  /**
   * 获取最近使用的项目
   */
  private async getRecentItems(limit: number): Promise<ItemCandidate[]> {
    const db = this.dbUtils.getDb()

    const stats = await db
      .select()
      .from(schema.itemUsageStats)
      .orderBy(desc(schema.itemUsageStats.lastExecuted))
      .limit(limit)
      .all()

    return stats
      .filter((stat) => stat.lastExecuted != null)
      .map((stat) => ({
        sourceId: stat.sourceId,
        itemId: stat.itemId,
        sourceType: stat.sourceType,
        usageStats: stat
      }))
  }

  /**
   * 获取当前时段的热门项目
   */
  private async getTimeBasedTopItems(
    timePattern: TimePattern,
    limit: number
  ): Promise<ItemCandidate[]> {
    const allTimeStats = await this.dbUtils.getAllItemTimeStats()
    const scored: Array<{ item: ItemCandidate; score: number }> = []

    // 获取对应的使用统计
    const keys = allTimeStats.map((stat) => ({
      sourceId: stat.sourceId,
      itemId: stat.itemId
    }))
    const usageStatsMap = new Map(
      (await this.dbUtils.getUsageStatsBatch(keys)).map((stat) => [
        `${stat.sourceId}:${stat.itemId}`,
        stat
      ])
    )

    for (const raw of allTimeStats) {
      const parsed: ParsedItemTimeStats = {
        sourceId: raw.sourceId,
        itemId: raw.itemId,
        hourDistribution: JSON.parse(raw.hourDistribution),
        dayOfWeekDistribution: JSON.parse(raw.dayOfWeekDistribution),
        timeSlotDistribution: JSON.parse(raw.timeSlotDistribution),
        lastUpdated: raw.lastUpdated
      }

      const timeScore = this.calculateTimeRelevance(parsed, timePattern)
      if (timeScore > 0) {
        const key = `${raw.sourceId}:${raw.itemId}`
        const usageStats = usageStatsMap.get(key)

        if (usageStats) {
          scored.push({
            item: {
              sourceId: raw.sourceId,
              itemId: raw.itemId,
              sourceType: usageStats.sourceType,
              usageStats,
              timeStats: parsed
            },
            score: timeScore
          })
        }
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ item }) => item)
  }

  /**
   * 获取趋势上升的项目
   * 比较最近 7 天 vs 过去 30 天的使用频率
   */
  private async getTrendingItems(limit: number): Promise<TrendingResult> {
    const db = this.dbUtils.getDb()
    this.scheduleTrendBackfill()

    const startedAt = performance.now()
    const today = toDayBucket(Date.now())
    const recentThreshold = today - (TREND_RECENT_DAYS - 1)
    const historyThreshold = today - (TREND_HISTORY_DAYS - 1)

    const rows = await db
      .select({
        sourceId: schema.usageTrendDaily.sourceId,
        itemId: schema.usageTrendDaily.itemId,
        recentCount: sql<number>`SUM(CASE WHEN ${schema.usageTrendDaily.day} >= ${recentThreshold} THEN ${schema.usageTrendDaily.executeCount} ELSE 0 END)`,
        historicalCount: sql<number>`SUM(${schema.usageTrendDaily.executeCount})`
      })
      .from(schema.usageTrendDaily)
      .where(gte(schema.usageTrendDaily.day, historyThreshold))
      .groupBy(schema.usageTrendDaily.sourceId, schema.usageTrendDaily.itemId)

    const durationMs = performance.now() - startedAt
    const rowCount = rows.length
    if (rowCount === 0) {
      this.recordRecommendationPerf('recommendation.trending', {
        durationMs: Math.round(durationMs),
        rows: rowCount,
        ready: false
      })
      return { items: [], perf: { durationMs, rowCount, ready: false } }
    }

    const candidates: Array<{ sourceId: string; itemId: string; growthScore: number }> = []

    for (const row of rows) {
      const recentCount = Number(row.recentCount ?? 0)
      const historicalCount = Number(row.historicalCount ?? 0)
      const avgWeeklyCount = historicalCount / 4

      let growthScore = 0
      if (avgWeeklyCount === 0 && recentCount > 0) {
        growthScore = recentCount * 10
      } else if (avgWeeklyCount > 0) {
        const growthRate = (recentCount - avgWeeklyCount) / avgWeeklyCount
        growthScore = growthRate * 100
      }

      if (growthScore > 0 && recentCount >= 2) {
        candidates.push({ sourceId: row.sourceId, itemId: row.itemId, growthScore })
      }
    }

    if (candidates.length === 0) {
      this.recordRecommendationPerf('recommendation.trending', {
        durationMs: Math.round(durationMs),
        rows: rowCount,
        candidates: 0,
        resultCount: 0,
        ready: true
      })
      return { items: [], perf: { durationMs, rowCount, ready: true } }
    }

    const sampleLimit = Math.max(limit * 2, limit)
    const topCandidates = candidates
      .sort((a, b) => b.growthScore - a.growthScore)
      .slice(0, sampleLimit)

    const usageStatsList = await this.dbUtils.getUsageStatsBatch(
      topCandidates.map((candidate) => ({
        sourceId: candidate.sourceId,
        itemId: candidate.itemId
      }))
    )
    const usageStatsMap = new Map(
      usageStatsList.map((stat) => [`${stat.sourceId}:${stat.itemId}`, stat])
    )

    const trending: ItemCandidate[] = []
    for (const candidate of topCandidates) {
      const usageStats = usageStatsMap.get(`${candidate.sourceId}:${candidate.itemId}`)
      if (!usageStats) continue
      trending.push({
        sourceId: candidate.sourceId,
        itemId: candidate.itemId,
        sourceType: usageStats.sourceType,
        usageStats
      })
      if (trending.length >= limit) break
    }

    this.recordRecommendationPerf('recommendation.trending', {
      durationMs: Math.round(durationMs),
      rows: rowCount,
      candidates: candidates.length,
      resultCount: trending.length,
      ready: true
    })

    return { items: trending, perf: { durationMs, rowCount, ready: true } }
  }

  /**
   * 计算时间相关性分数
   */
  private calculateTimeRelevance(
    itemTimeStats: ParsedItemTimeStats,
    currentTime: TimePattern
  ): number {
    const slotUsage = itemTimeStats.timeSlotDistribution[currentTime.timeSlot]
    const totalUsage = Object.values(itemTimeStats.timeSlotDistribution).reduce((a, b) => a + b, 0)

    if (totalUsage === 0) return 0

    // 当前时段的使用占比
    const slotRatio = slotUsage / totalUsage

    // 星期几的加权
    const dayUsage = itemTimeStats.dayOfWeekDistribution[currentTime.dayOfWeek]
    const avgDayUsage = itemTimeStats.dayOfWeekDistribution.reduce((a, b) => a + b, 0) / 7
    const dayFactor = dayUsage / (avgDayUsage || 1)

    return slotRatio * 100 * dayFactor
  }

  /**
   * 计算分数并排序
   */
  private async scoreAndRank(
    candidates: CandidateItem[],
    context: ContextSignal
  ): Promise<ScoredItem[]> {
    const scored: ScoredItem[] = []

    for (const candidate of candidates) {
      const score = await this.calculateRecommendationScore(candidate, context)
      scored.push({ ...candidate, score })
    }

    return scored.sort((a, b) => b.score - a.score)
  }

  /**
   * 计算推荐分数
   */
  private async calculateRecommendationScore(
    candidate: CandidateItem,
    context: ContextSignal
  ): Promise<number> {
    let score = 0

    // 1. 上下文匹配度 (最高权重)
    const contextMatch = this.calculateContextMatch(candidate, context)
    score += contextMatch * 1e6

    // 2. 时间相关性
    if (candidate.timeStats) {
      const timeRelevance = this.calculateTimeRelevance(candidate.timeStats, context.time)
      score += timeRelevance * 1e5
    }

    // 3. 频率分数(带时间衰减)
    const frequencyScore = this.calculateFrequencyScore(candidate.usageStats)
    score += frequencyScore * 1e4

    // 4. 最近使用加成
    const recencyBoost = this.calculateRecencyBoost(candidate.usageStats.lastExecuted)
    score += recencyBoost * 1e3

    return score
  }

  /**
   * 计算上下文匹配度
   */
  private calculateContextMatch(candidate: CandidateItem, context: ContextSignal): number {
    let score = 0

    // 剪贴板内容类型匹配
    if (context.clipboard) {
      score += this.matchClipboardContent(candidate, context.clipboard)
    }

    // 前台应用关联匹配
    if (context.foregroundApp) {
      score += this.matchForegroundApp(candidate, context.foregroundApp)
    }

    return score
  }

  /**
   * 匹配剪贴板内容与候选项
   */
  private matchClipboardContent(
    candidate: CandidateItem,
    clipboard: NonNullable<ContextSignal['clipboard']>
  ): number {
    const { sourceType, itemId } = candidate

    // 文件类型匹配逻辑(最高优先级)
    if (clipboard.meta?.fileType === 'code' && clipboard.meta.language) {
      const language = clipboard.meta.language

      // Java/Kotlin → JetBrains IDEA/Android Studio
      if (language === 'java' || language === 'kotlin') {
        if (sourceType === 'app' && this.isJetBrainsIDE(itemId, ['idea', 'android-studio'])) {
          return 100
        }
      }

      // Python → PyCharm/VS Code
      if (language === 'python') {
        if (sourceType === 'app' && this.isJetBrainsIDE(itemId, ['pycharm'])) {
          return 100
        }
        if (sourceType === 'app' && this.isVSCode(itemId)) {
          return 90
        }
      }

      // JavaScript/TypeScript → VS Code/WebStorm
      if (language === 'javascript' || language === 'typescript') {
        if (sourceType === 'app' && this.isVSCode(itemId)) {
          return 100
        }
        if (sourceType === 'app' && this.isJetBrainsIDE(itemId, ['webstorm'])) {
          return 95
        }
      }

      // 通用代码文件 → 任何 IDE
      if (sourceType === 'app' && this.isIDE(itemId)) {
        return 80
      }
    }

    // 文本文件 → 文本编辑器
    if (clipboard.meta?.fileType === 'text') {
      if (sourceType === 'app' && this.isTextEditor(itemId)) {
        return 85
      }
    }

    // 图像文件 → 图像编轑器
    if (clipboard.meta?.fileType === 'image') {
      if (sourceType === 'app' && this.isImageApp(itemId)) {
        return 100
      }
    }

    // URL/链接类型检测
    const isUrl = clipboard.contentType === 'url' || clipboard.meta?.isUrl === true

    if (clipboard.type === 'text') {
      // 文本剪贴板
      if (isUrl) {
        // 如果是链接,推荐浏览器相关
        if (sourceType === 'app' && this.isBrowserApp(itemId)) {
          return 100 // 强相关
        }
        // 下载工具
        if (itemId.includes('download') || itemId.includes('aria')) {
          return 80
        }
      } else {
        // 普通文本,推荐编辑器
        if (sourceType === 'app' && this.isEditorApp(itemId)) {
          return 70
        }
      }
    } else if (clipboard.type === 'image') {
      // 图片剪贴板,推荐图片处理工具
      if (sourceType === 'app' && this.isImageApp(itemId)) {
        return 100
      }
    } else if (clipboard.type === 'files') {
      // 文件剪贴板,推荐文件管理工具
      if (sourceType === 'app' && this.isFileManagerApp(itemId)) {
        return 80
      }
    }

    return 0
  }

  /**
   * 匹配前台应用与候选项
   */
  private matchForegroundApp(
    candidate: CandidateItem,
    foregroundApp: NonNullable<ContextSignal['foregroundApp']>
  ): number {
    const { sourceType, itemId } = candidate

    // 如果候选项就是当前前台应用,降低推荐权重(避免重复推荐已打开的应用)
    if (sourceType === 'app' && itemId.includes(foregroundApp.bundleId)) {
      return -50
    }

    // 根据前台应用推荐相关工具
    // IDE -> Terminal
    if (this.isIDE(foregroundApp.bundleId) && sourceType === 'app' && this.isTerminalApp(itemId)) {
      return 60
    }

    // 浏览器 -> 开发工具
    if (
      this.isBrowserApp(foregroundApp.bundleId) &&
      sourceType === 'app' &&
      this.isDeveloperTool(itemId)
    ) {
      return 50
    }

    return 0
  }

  /**
   * 判断是否为浏览器应用
   */
  private isBrowserApp(identifier: string): boolean {
    const browsers = [
      'com.google.Chrome',
      'com.apple.Safari',
      'org.mozilla.firefox',
      'com.microsoft.edgemac',
      'com.brave.Browser',
      'com.operasoftware.Opera'
    ]
    return browsers.some((browser) => identifier.includes(browser))
  }

  /**
   * 判断是否为编辑器应用
   */
  private isEditorApp(identifier: string): boolean {
    const editors = [
      'com.microsoft.VSCode',
      'com.sublimetext',
      'com.jetbrains',
      'com.barebones.bbedit',
      'com.vim',
      'com.neovim',
      'com.textmate'
    ]
    return editors.some((editor) => identifier.includes(editor))
  }

  /**
   * 判断是否为图片处理应用
   */
  private isImageApp(identifier: string): boolean {
    const imageApps = [
      'com.adobe.Photoshop',
      'com.adobe.illustrator',
      'com.adobe.AfterEffects',
      'com.bohemiancoding.sketch',
      'com.figma.Desktop',
      'com.pixelmatorteam.pixelmator',
      'com.apple.Preview',
      'com.gimp',
      'com.serif.affinity.photo', // Affinity Photo
      'com.serif.affinity.designer', // Affinity Designer
      'com.krita', // Krita
      'com.procreate', // Procreate
      'com.canva' // Canva
    ]
    return imageApps.some((app) => identifier.includes(app))
  }

  /**
   * 判断是否为 JetBrains IDE
   */
  private isJetBrainsIDE(identifier: string, products: string[]): boolean {
    const jetbrainsApps: Record<string, string> = {
      idea: 'com.jetbrains.intellij',
      pycharm: 'com.jetbrains.pycharm',
      webstorm: 'com.jetbrains.webstorm',
      'android-studio': 'com.google.android.studio',
      goland: 'com.jetbrains.goland',
      rider: 'com.jetbrains.rider'
    }

    return products.some((product) => {
      const bundleId = jetbrainsApps[product]
      return bundleId && identifier.includes(bundleId)
    })
  }

  /**
   * 判断是否为 VS Code
   */
  private isVSCode(identifier: string): boolean {
    return identifier.includes('com.microsoft.VSCode') || identifier.includes('VSCodium')
  }

  /**
   * 判断是否为文本编辑器
   */
  private isTextEditor(identifier: string): boolean {
    const editors = [
      'com.apple.TextEdit',
      'com.sublimetext',
      'com.barebones.bbedit',
      'com.coteditor.CotEditor',
      'com.typora'
    ]
    return editors.some((editor) => identifier.includes(editor))
  }

  /**
   * 判断是否为文件管理工具
   */
  private isFileManagerApp(identifier: string): boolean {
    const fileManagers = ['com.apple.finder', 'com.coderforart.MWeb', 'com.agilebits']
    return fileManagers.some((fm) => identifier.includes(fm))
  }

  /**
   * 判断是否为IDE
   */
  private isIDE(identifier: string): boolean {
    const ides = [
      'com.microsoft.VSCode',
      'com.jetbrains',
      'com.apple.dt.Xcode',
      'com.android.studio'
    ]
    return ides.some((ide) => identifier.includes(ide))
  }

  /**
   * 判断是否为终端应用
   */
  private isTerminalApp(identifier: string): boolean {
    const terminals = [
      'com.apple.Terminal',
      'com.googlecode.iterm2',
      'com.github.wez.wezterm',
      'io.alacritty',
      'net.kovidgoyal.kitty'
    ]
    return terminals.some((term) => identifier.includes(term))
  }

  /**
   * 判断是否为开发工具
   */
  private isDeveloperTool(identifier: string): boolean {
    return (
      this.isIDE(identifier) ||
      this.isTerminalApp(identifier) ||
      identifier.includes('postman') ||
      identifier.includes('insomnia')
    )
  }

  /**
   * 计算频率分数(带时间衰减)
   */
  private calculateFrequencyScore(stats: typeof schema.itemUsageStats.$inferSelect): number {
    const executeCount = stats.executeCount
    const searchCount = stats.searchCount
    const cancelCount = stats.cancelCount || 0

    const lastInteraction = Math.max(
      stats.lastExecuted?.getTime() || 0,
      stats.lastSearched?.getTime() || 0,
      stats.lastCancelled?.getTime() || 0
    )

    const daysSince = (Date.now() - lastInteraction) / (1000 * 60 * 60 * 24)
    const decayFactor = Math.exp(-0.1 * daysSince) // lambda = 0.1

    return (executeCount * 1.0 + searchCount * 0.3 + cancelCount * -0.5) * decayFactor
  }

  /**
   * 计算最近使用加成
   */
  private calculateRecencyBoost(lastUsed: Date | null): number {
    if (!lastUsed) return 0

    const hoursSince = (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60)

    // 1 小时内: 100 分
    // 24 小时:  50 分
    // 7 天:     10 分
    return Math.max(0, 100 * Math.exp(-0.1 * hoursSince))
  }

  /**
   * 应用多样性过滤
   */
  private applyDiversityFilter(scored: ScoredItem[], limit: number): ScoredItem[] {
    const result: ScoredItem[] = []
    const typeCount = new Map<string, number>()

    for (const item of scored) {
      if (result.length >= limit) break

      const currentCount = typeCount.get(item.sourceType) || 0

      // 同类型不超过总数的 40%
      const maxPerType = Math.ceil(limit * 0.4)
      if (currentCount >= maxPerType && result.length >= limit / 2) {
        continue
      }

      result.push(item)
      typeCount.set(item.sourceType, currentCount + 1)
    }

    return result
  }

  /**
   * 去重候选项
   */
  private deduplicateCandidates(candidates: CandidateItem[]): CandidateItem[] {
    const seen = new Set<string>()
    const result: CandidateItem[] = []

    for (const candidate of candidates) {
      const key = `${candidate.sourceId}:${candidate.itemId}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push(candidate)
      }
    }

    return result
  }

  private getItemIdentity(item: TuffItem): string {
    const meta = item.meta as Record<string, any> | null | undefined
    const sourceId = item.source?.id || 'unknown'
    const appMeta = meta?.app
    if (appMeta?.bundle_id) {
      return `${sourceId}:bundle:${appMeta.bundle_id}`
    }
    if (appMeta?.path) {
      return `${sourceId}:path:${appMeta.path}`
    }
    const systemActionId = meta?.raw?.systemActionId
    if (systemActionId) {
      return `${sourceId}:system:${systemActionId}`
    }
    if (meta?._originalSourceId && meta?._originalItemId) {
      return `${meta._originalSourceId}:${meta._originalItemId}`
    }
    if (item.id) {
      return `${sourceId}:${item.id}`
    }
    return sourceId
  }

  private dedupeItems(items: TuffItem[]): TuffItem[] {
    const seen = new Set<string>()
    const result: TuffItem[] = []

    for (const item of items) {
      const key = this.getItemIdentity(item)
      if (seen.has(key)) continue
      seen.add(key)
      result.push(item)
    }

    return result
  }

  /**
   * 获取缓存的推荐
   */
  private async getCachedRecommendations(
    context: ContextSignal
  ): Promise<{ items: TuffItem[] } | null> {
    const cacheKey = this.contextProvider.generateCacheKey(context)
    const cached = await this.dbUtils.getRecommendationCache(cacheKey)

    if (!cached) return null

    // 检查是否过期
    if (cached.expiresAt.getTime() < Date.now()) return null

    try {
      const items = JSON.parse(cached.recommendedItems)
      return { items: this.dedupeItems(items) }
    } catch (error) {
      console.error('[RecommendationEngine] Failed to parse cached recommendations:', error)
      return null
    }
  }

  /**
   * 缓存推荐结果
   */
  private async cacheRecommendations(context: ContextSignal, items: TuffItem[]): Promise<void> {
    const cacheKey = this.contextProvider.generateCacheKey(context)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    await this.dbUtils.setRecommendationCache(cacheKey, items, expiresAt)
  }
}

/** 推荐选项 */
export interface RecommendationOptions {
  limit?: number
  forceRefresh?: boolean
  includeTypes?: string[]
  excludeTypes?: string[]
  /** 布局模式 */
  layoutMode?: 'list' | 'grid'
}

/** 推荐结果 */
export interface RecommendationResult {
  items: TuffItem[]
  context: ContextSignal
  duration: number
  fromCache: boolean
  /** 容器布局配置 */
  containerLayout?: TuffContainerLayout
}

interface TrendingPerf {
  durationMs: number
  rowCount: number
  ready: boolean
}

interface TrendingResult {
  items: ItemCandidate[]
  perf: TrendingPerf
}

interface CandidateResult {
  items: CandidateItem[]
  perf: {
    totalCandidates: number
    filteredCount: number
    trendingDurationMs: number
    trendingRows: number
    trendingCandidates: number
    trendingReady: boolean
  }
}

interface RecommendationPerfMetadata {
  durationMs: number | null
  cacheLayer?: string
}

interface PerfStats {
  samples: number
  avgMs: number
  p50Ms: number
  p95Ms: number
  maxMs: number
  overBudgetMs: number
  overBudgetCount: number
}

/**
 * 项目候选
 */
interface ItemCandidate {
  sourceId: string
  itemId: string
  sourceType: string
  usageStats: typeof schema.itemUsageStats.$inferSelect
  timeStats?: ParsedItemTimeStats
}

/** 候选项(带来源标记) */
interface CandidateItem extends ItemCandidate {
  source: 'frequent' | 'recent' | 'time-based' | 'trending' | 'context' | 'pinned'
}

/**
 * 评分后的项目
 */
export interface ScoredItem extends CandidateItem {
  score: number
}
