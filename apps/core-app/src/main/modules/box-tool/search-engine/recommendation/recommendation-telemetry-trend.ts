import type { DbUtils } from '../../../../db/utils'
import type { ItemCandidate } from './recommendation-catalog-candidates'
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { scheduleAuxWrite, scheduleDbWrite } from '../../../../db/db-write'
import * as schema from '../../../../db/schema'
import { enterPerfContext } from '../../../../utils/perf-context'
import { getSentryService } from '../../../sentry'
import {
  UsageSourceIdentityMigration,
  USAGE_SOURCE_IDENTITY_CONFIG_KEY,
  type ItemTimeStatsKey,
  type ItemTimeStatsMigrationPlan,
  type ItemTimeStatsRow,
  type UsageTrendKey,
  type UsageTrendMigrationPlan,
  type UsageTrendRow
} from '../usage-source-identity-migration'
import { recommendationExposureService } from './recommendation-exposure-service'
import { DAY_MS, toDayBucket, toErrorMeta, toPrimitive, type LogMeta } from './recommendation-utils'

export const TREND_HISTORY_DAYS = 30
export const TREND_RECENT_DAYS = 7
export const TREND_BACKFILL_INTERVAL_SECONDS = 2
export const RECOMMENDATION_PERF_WINDOW_MS = 60 * 60 * 1000
export const RECOMMENDATION_PERF_SAMPLE_LIMIT = 2000
export const RECOMMENDATION_TELEMETRY_INTERVAL_MS = 10 * 60 * 1000
export const RECOMMENDATION_QUERY_BUDGET_MS = 50
export const RECOMMENDATION_PERF_PLUGIN = 'core'
export const USAGE_IDENTITY_MIGRATION_INITIAL_DELAY_MS = 20_000

export interface RecommendationPerfMetadata {
  durationMs: number | null
  cacheLayer?: string
}

export interface PerfStats {
  samples: number
  avgMs: number
  p50Ms: number
  p95Ms: number
  maxMs: number
  overBudgetMs: number
  overBudgetCount: number
}

export interface PerfSampleCollection {
  durations: number[]
  cacheLayers: Record<string, number>
  durationsByLayer: Record<string, number[]>
}

export interface TrendingPerf {
  durationMs: number
  rowCount: number
  ready: boolean
}

export interface TrendingResult {
  items: ItemCandidate[]
  perf: TrendingPerf
}

export interface RecommendationTelemetryLogger {
  debug(message: string, options?: { meta?: LogMeta }): void
  info(message: string, options?: { meta?: LogMeta }): void
  warn(message: string, options?: { meta?: LogMeta }): void
}

function toLogMeta(meta?: Record<string, unknown>): LogMeta | undefined {
  if (!meta) return undefined
  return Object.fromEntries(Object.entries(meta).map(([key, value]) => [key, toPrimitive(value)]))
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function pickPercentile(sorted: readonly number[], percentile: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentile * sorted.length) - 1))
  return sorted[index]!
}

export function parsePerfMetadata(metadata: string | null): RecommendationPerfMetadata | null {
  if (!metadata) return null
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>
    return {
      durationMs: toFiniteNumber(parsed.durationMs),
      cacheLayer: typeof parsed.cacheLayer === 'string' ? parsed.cacheLayer : undefined
    }
  } catch {
    return null
  }
}

export function collectPerfSamples(rows: Array<{ metadata: string | null }>): PerfSampleCollection {
  const durations: number[] = []
  const cacheLayers: Record<string, number> = { none: 0, memory: 0, db: 0, unknown: 0 }
  const durationsByLayer: Record<string, number[]> = {
    none: [],
    memory: [],
    db: [],
    unknown: []
  }

  for (const row of rows) {
    const parsed = parsePerfMetadata(row.metadata)
    if (!parsed) continue

    const cacheLayer = parsed.cacheLayer ?? 'unknown'
    cacheLayers[cacheLayer] = (cacheLayers[cacheLayer] ?? 0) + 1

    if (typeof parsed.durationMs !== 'number') continue
    durations.push(parsed.durationMs)
    if (!durationsByLayer[cacheLayer]) {
      durationsByLayer[cacheLayer] = []
    }
    durationsByLayer[cacheLayer]!.push(parsed.durationMs)
  }

  return { durations, cacheLayers, durationsByLayer }
}

export function buildPerfStats(
  durations: readonly number[],
  budgetMs = RECOMMENDATION_QUERY_BUDGET_MS
): PerfStats | null {
  if (durations.length === 0) return null
  const sorted = [...durations].sort((a, b) => a - b)
  const total = durations.reduce((sum, value) => sum + value, 0)
  const avg = total / durations.length
  const p50 = pickPercentile(sorted, 0.5)
  const p95 = pickPercentile(sorted, 0.95)
  const max = sorted[sorted.length - 1] ?? 0
  const overBudgetCount = durations.filter((value) => value > budgetMs).length

  return {
    samples: durations.length,
    avgMs: Math.round(avg),
    p50Ms: Math.round(p50),
    p95Ms: Math.round(p95),
    maxMs: Math.round(max),
    overBudgetMs: budgetMs,
    overBudgetCount
  }
}

export function buildPerfStatsByLayer(
  durationsByLayer: Record<string, number[]>,
  budgetMs = RECOMMENDATION_QUERY_BUDGET_MS
): Record<string, PerfStats> {
  const result: Record<string, PerfStats> = {}
  for (const [layer, durations] of Object.entries(durationsByLayer)) {
    const stats = buildPerfStats(durations, budgetMs)
    if (stats) {
      result[layer] = stats
    }
  }
  return result
}

export function recordRecommendationPerfMetric(
  eventType: string,
  metadata: Record<string, unknown>,
  log: RecommendationTelemetryLogger
): void {
  const payload = {
    pluginName: RECOMMENDATION_PERF_PLUGIN,
    eventType,
    metadata: JSON.stringify(metadata),
    timestamp: Date.now()
  }

  void scheduleAuxWrite(
    'analytics.plugin',
    (db) => db.insert(schema.pluginAnalytics).values(payload),
    { priority: 'best_effort', dropPolicy: 'latest_wins', budgetKey: 'recommendation.perf' }
  ).catch((error) => {
    log.debug('Failed to record perf metrics', { meta: toErrorMeta(error) })
  })
}

export async function recordExposureDiagnostics(
  recordPerf: (eventType: string, metadata: Record<string, unknown>) => void
): Promise<void> {
  const buckets = await recommendationExposureService.getHitRate()
  if (buckets.length === 0) return

  recordPerf('recommendation.exposure', {
    windowDays: 7,
    buckets: buckets.map((bucket) => ({
      k: bucket.k,
      impressions: bucket.impressions,
      clicks: bucket.clicks,
      hitRate: Number(bucket.hitRate.toFixed(4))
    }))
  })
}

export async function reportRecommendationTelemetrySnapshot(
  dbUtils: DbUtils,
  recordPerf: (eventType: string, metadata: Record<string, unknown>) => void
): Promise<void> {
  await recordExposureDiagnostics(recordPerf)

  const sentryService = getSentryService()
  if (!sentryService.isTelemetryEnabled()) return

  const db = dbUtils.getAuxDb()
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

  const totalSamples = collectPerfSamples(totalRows)
  const totalStats = buildPerfStats(totalSamples.durationsByLayer.none ?? [])
  const totalAllStats = buildPerfStats(totalSamples.durations)
  const totalByCacheLayer = buildPerfStatsByLayer(totalSamples.durationsByLayer)

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

  const trendingSamples = collectPerfSamples(trendingRows)
  const trendingStats = buildPerfStats(trendingSamples.durations)

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
      totalByCacheLayer: Object.keys(totalByCacheLayer).length > 0 ? totalByCacheLayer : undefined,
      trending: trendingStats ?? undefined
    }
  })
}

export function buildTrendBackfillDays(nowMs = Date.now()): number[] {
  const today = toDayBucket(nowMs)
  const startDay = today - (TREND_HISTORY_DAYS - 1)
  const days: number[] = []
  for (let day = startDay; day <= today; day += 1) {
    days.push(day)
  }
  return days
}

export async function hasTrendDataForDay(dbUtils: DbUtils, day: number): Promise<boolean> {
  const db = dbUtils.getDb()
  const row = await db
    .select({ day: schema.usageTrendDaily.day })
    .from(schema.usageTrendDaily)
    .where(eq(schema.usageTrendDaily.day, day))
    .limit(1)
    .get()
  return Boolean(row)
}

export async function backfillTrendDay(dbUtils: DbUtils, day: number): Promise<void> {
  const db = dbUtils.getDb()
  const dayStart = new Date(day * DAY_MS)
  const dayEnd = new Date((day + 1) * DAY_MS)
  const dayBucket = day

  let rows: Array<{ sourceId: string; itemId: string; executeCount: number }> = []
  const disposeQuery = enterPerfContext('Recommendation.trendBackfill.query', { day })
  try {
    rows = await db
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
  } finally {
    disposeQuery()
  }

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
  const disposeUpsert = enterPerfContext('Recommendation.trendBackfill.upsert', {
    day,
    rows: values.length
  })
  try {
    for (let i = 0; i < values.length; i += chunkSize) {
      const chunk = values.slice(i, i + chunkSize)
      await scheduleDbWrite(
        'recommendation.trend-backfill',
        () =>
          db
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
            }),
        { priority: 'background', dropPolicy: 'none' }
      )
      if (i + chunkSize < values.length) {
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
    }
  } finally {
    disposeUpsert()
  }
}

export async function queryTrendingItems(
  dbUtils: DbUtils,
  limit: number,
  recordPerf: (eventType: string, metadata: Record<string, unknown>) => void
): Promise<TrendingResult> {
  const db = dbUtils.getDb()
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
    recordPerf('recommendation.trending', {
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
    recordPerf('recommendation.trending', {
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

  const usageStatsList = await dbUtils.getUsageStatsBatch(
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

  recordPerf('recommendation.trending', {
    durationMs: Math.round(durationMs),
    rows: rowCount,
    candidates: candidates.length,
    resultCount: trending.length,
    ready: true
  })

  return { items: trending, perf: { durationMs, rowCount, ready: true } }
}

function trendRowFilter(key: UsageTrendKey) {
  return and(
    eq(schema.usageTrendDaily.sourceId, key.sourceId),
    eq(schema.usageTrendDaily.itemId, key.itemId),
    eq(schema.usageTrendDaily.day, key.day)
  )
}

function timeStatsRowFilter(key: ItemTimeStatsKey) {
  return and(
    eq(schema.itemTimeStats.sourceId, key.sourceId),
    eq(schema.itemTimeStats.itemId, key.itemId)
  )
}

export function createRecommendationUsageIdentityMigration(
  dbUtils: DbUtils,
  log: RecommendationTelemetryLogger
): UsageSourceIdentityMigration {
  const db = dbUtils.getDb()

  const loadTrendRowsByKeys = async (keys: UsageTrendKey[]): Promise<UsageTrendRow[]> => {
    if (keys.length === 0) return []
    const wanted = new Set(keys.map((key) => `${key.sourceId} ${key.itemId} ${key.day}`))

    const rows = await db
      .select({
        sourceId: schema.usageTrendDaily.sourceId,
        itemId: schema.usageTrendDaily.itemId,
        day: schema.usageTrendDaily.day,
        executeCount: schema.usageTrendDaily.executeCount
      })
      .from(schema.usageTrendDaily)
      .where(
        and(
          inArray(schema.usageTrendDaily.sourceId, [...new Set(keys.map((key) => key.sourceId))]),
          inArray(schema.usageTrendDaily.itemId, [...new Set(keys.map((key) => key.itemId))])
        )
      )

    return rows.filter((row) => wanted.has(`${row.sourceId} ${row.itemId} ${row.day}`))
  }

  const loadTimeStatsRowsByKeys = async (keys: ItemTimeStatsKey[]): Promise<ItemTimeStatsRow[]> => {
    if (keys.length === 0) return []
    const wanted = new Set(keys.map((key) => `${key.sourceId} ${key.itemId}`))

    const rows = await db
      .select({
        sourceId: schema.itemTimeStats.sourceId,
        itemId: schema.itemTimeStats.itemId,
        hourDistribution: schema.itemTimeStats.hourDistribution,
        dayOfWeekDistribution: schema.itemTimeStats.dayOfWeekDistribution,
        timeSlotDistribution: schema.itemTimeStats.timeSlotDistribution
      })
      .from(schema.itemTimeStats)
      .where(
        and(
          inArray(schema.itemTimeStats.sourceId, [...new Set(keys.map((key) => key.sourceId))]),
          inArray(schema.itemTimeStats.itemId, [...new Set(keys.map((key) => key.itemId))])
        )
      )

    return rows.filter((row) => wanted.has(`${row.sourceId} ${row.itemId}`))
  }

  const applyTrendMigration = async (plan: UsageTrendMigrationPlan): Promise<void> => {
    if (plan.rewrites.length === 0 && plan.merges.length === 0) return

    await scheduleDbWrite(
      'usage.source-identity.trend',
      () =>
        db.transaction(async (tx) => {
          for (const rewrite of plan.rewrites) {
            await tx
              .update(schema.usageTrendDaily)
              .set({ sourceId: rewrite.toSourceId })
              .where(trendRowFilter(rewrite.from))
          }
          for (const merge of plan.merges) {
            await tx
              .update(schema.usageTrendDaily)
              .set({ executeCount: merge.executeCount })
              .where(trendRowFilter(merge.into))
            await tx.delete(schema.usageTrendDaily).where(trendRowFilter(merge.from))
          }
        }),
      { priority: 'background', dropPolicy: 'none' }
    )
  }

  const applyTimeStatsMigration = async (plan: ItemTimeStatsMigrationPlan): Promise<void> => {
    if (plan.rewrites.length === 0 && plan.merges.length === 0) return
    const now = new Date()

    await scheduleDbWrite(
      'usage.source-identity.time-stats',
      () =>
        db.transaction(async (tx) => {
          for (const rewrite of plan.rewrites) {
            await tx
              .update(schema.itemTimeStats)
              .set({ sourceId: rewrite.toSourceId })
              .where(timeStatsRowFilter(rewrite.from))
          }
          for (const merge of plan.merges) {
            await tx
              .update(schema.itemTimeStats)
              .set({
                hourDistribution: merge.hourDistribution,
                dayOfWeekDistribution: merge.dayOfWeekDistribution,
                timeSlotDistribution: merge.timeSlotDistribution,
                lastUpdated: now
              })
              .where(timeStatsRowFilter(merge.into))
            await tx.delete(schema.itemTimeStats).where(timeStatsRowFilter(merge.from))
          }
        }),
      { priority: 'background', dropPolicy: 'none' }
    )
  }

  return new UsageSourceIdentityMigration({
    getAppliedVersion: async () => {
      const row = await db
        .select({ value: schema.config.value })
        .from(schema.config)
        .where(eq(schema.config.key, USAGE_SOURCE_IDENTITY_CONFIG_KEY))
        .get()
      if (!row?.value) return null
      const parsed = Number.parseInt(row.value, 10)
      return Number.isNaN(parsed) ? null : parsed
    },
    setAppliedVersion: async (version) => {
      await scheduleDbWrite(
        'usage.source-identity.version',
        async () => {
          await db
            .insert(schema.config)
            .values({ key: USAGE_SOURCE_IDENTITY_CONFIG_KEY, value: String(version) })
            .onConflictDoUpdate({
              target: schema.config.key,
              set: { value: String(version) }
            })
        },
        { priority: 'background', dropPolicy: 'none' }
      )
    },
    rewriteUsageLogSource: async (from, to) => {
      await scheduleDbWrite(
        'usage.source-identity.logs',
        async () => {
          await db
            .update(schema.usageLogs)
            .set({ source: to })
            .where(eq(schema.usageLogs.source, from))
        },
        { priority: 'background', dropPolicy: 'none' }
      )
    },
    loadLegacyTrendRows: async (legacySources) =>
      await db
        .select({
          sourceId: schema.usageTrendDaily.sourceId,
          itemId: schema.usageTrendDaily.itemId,
          day: schema.usageTrendDaily.day,
          executeCount: schema.usageTrendDaily.executeCount
        })
        .from(schema.usageTrendDaily)
        .where(inArray(schema.usageTrendDaily.sourceId, legacySources)),
    loadTrendRowsByKeys,
    applyTrendMigration,
    loadLegacyTimeStatsRows: async (legacySources) =>
      await db
        .select({
          sourceId: schema.itemTimeStats.sourceId,
          itemId: schema.itemTimeStats.itemId,
          hourDistribution: schema.itemTimeStats.hourDistribution,
          dayOfWeekDistribution: schema.itemTimeStats.dayOfWeekDistribution,
          timeSlotDistribution: schema.itemTimeStats.timeSlotDistribution
        })
        .from(schema.itemTimeStats)
        .where(inArray(schema.itemTimeStats.sourceId, legacySources)),
    loadTimeStatsRowsByKeys,
    applyTimeStatsMigration,
    logInfo: (message, meta) => log.info(message, { meta: toLogMeta(meta) }),
    logWarn: (message, error, meta) =>
      log.warn(message, { meta: { ...toLogMeta(meta), ...toErrorMeta(error) } })
  })
}
