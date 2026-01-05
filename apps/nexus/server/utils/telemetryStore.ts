import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { resolveRequestIp } from './ipSecurityStore'

const TELEMETRY_TABLE = 'telemetry_events'
const DAILY_STATS_TABLE = 'daily_stats'

let telemetrySchemaInitialized = false

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

async function ensureTelemetrySchema(db: D1Database) {
  if (telemetrySchemaInitialized) return

  // Telemetry events table - stores individual events
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${TELEMETRY_TABLE} (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      user_id TEXT,
      device_fingerprint TEXT,
      platform TEXT,
      version TEXT,
      region TEXT,
      ip TEXT,
      search_query TEXT,
      search_duration_ms INTEGER,
      search_result_count INTEGER,
      provider_timings TEXT,
      input_types TEXT,
      metadata TEXT,
      is_anonymous INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `).run()

  // Daily aggregated stats table
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DAILY_STATS_TABLE} (
      date TEXT NOT NULL,
      stat_type TEXT NOT NULL,
      stat_key TEXT NOT NULL DEFAULT '',
      value INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, stat_type, stat_key)
    );
  `).run()

  await ensureTelemetryColumns(db)

  // Indexes for efficient queries
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON ${TELEMETRY_TABLE}(created_at);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_telemetry_event_type ON ${TELEMETRY_TABLE}(event_type);
  `).run()

  try {
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_ip_created_at ON ${TELEMETRY_TABLE}(ip, created_at);
    `).run()
  }
  catch {
    // ignore index creation failures for older schemas
  }

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON ${DAILY_STATS_TABLE}(date);
  `).run()

  telemetrySchemaInitialized = true
}

async function ensureTelemetryColumns(db: D1Database): Promise<void> {
  try {
    const { results } = await db.prepare(`PRAGMA table_info(${TELEMETRY_TABLE});`).all<{ name?: string }>()
    const columns = new Set((results ?? []).map(item => item.name).filter(Boolean) as string[])
    if (!columns.has('ip')) {
      await db.prepare(`ALTER TABLE ${TELEMETRY_TABLE} ADD COLUMN ip TEXT;`).run()
    }
  }
  catch {
    // ignore schema evolution failures
  }
}

export interface TelemetryEvent {
  id: string
  eventType: 'search' | 'visit' | 'error' | 'feature_use' | 'performance'
  userId?: string
  deviceFingerprint?: string
  platform?: string
  version?: string
  region?: string
  searchQuery?: string
  searchDurationMs?: number
  searchResultCount?: number
  providerTimings?: Record<string, number>
  inputTypes?: string[]
  metadata?: Record<string, unknown>
  isAnonymous: boolean
  createdAt: string
}

export interface DailyStats {
  date: string
  totalVisits: number
  uniqueUsers: number
  totalSearches: number
  avgSearchDuration: number
  deviceDistribution: Record<string, number>
  regionDistribution: Record<string, number>
  hourlyDistribution: Record<string, number>
}

/**
 * Record a telemetry event
 */
export async function recordTelemetryEvent(
  event: H3Event,
  telemetry: Omit<TelemetryEvent, 'id' | 'createdAt'>
): Promise<void> {
  const db = getD1Database(event)
  if (!db) {
    console.warn('Telemetry: Database not available')
    return
  }

  await ensureTelemetrySchema(db)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const today = now.split('T')[0]
  const safeSearchQuery = undefined
  const region = resolveRequestRegion(event) || telemetry.region
  const ip = resolveRequestIp(event)

  // Insert telemetry event
  await db.prepare(`
    INSERT INTO ${TELEMETRY_TABLE} (
      id, event_type, user_id, device_fingerprint, platform, version,
      region, ip, search_query, search_duration_ms, search_result_count,
      provider_timings, input_types, metadata, is_anonymous, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16);
  `).bind(
    id,
    telemetry.eventType,
    telemetry.userId || null,
    telemetry.deviceFingerprint || null,
    telemetry.platform || null,
    telemetry.version || null,
    region || null,
    ip || null,
    safeSearchQuery || null,
    telemetry.searchDurationMs || null,
    telemetry.searchResultCount || null,
    telemetry.providerTimings ? JSON.stringify(telemetry.providerTimings) : null,
    telemetry.inputTypes ? JSON.stringify(telemetry.inputTypes) : null,
    telemetry.metadata ? JSON.stringify(telemetry.metadata) : null,
    telemetry.isAnonymous ? 1 : 0,
    now
  ).run()

  // Update daily stats
  await incrementDailyStat(db, today, 'total_events', '', 1)

  if (telemetry.eventType === 'visit') {
    await incrementDailyStat(db, today, 'visits', '', 1)
    if (telemetry.userId) {
      await incrementDailyStat(db, today, 'unique_users', telemetry.userId, 1)
    }
    if (telemetry.platform) {
      await incrementDailyStat(db, today, 'platform', telemetry.platform, 1)
    }
    if (region) {
      await incrementDailyStat(db, today, 'region', region, 1)
    }
    if (telemetry.metadata && typeof telemetry.metadata === 'object') {
      const meta = telemetry.metadata as Record<string, unknown>
      if (meta.kind === 'startup') {
        const mainProcess = meta.mainProcess as { moduleDetails?: Array<{ name?: string; loadTime?: number }> } | undefined
        const moduleDetails = Array.isArray(mainProcess?.moduleDetails) ? mainProcess?.moduleDetails : []
        for (const detail of moduleDetails) {
          const moduleName = typeof detail.name === 'string' ? detail.name : 'unknown'
          const loadTime = typeof detail.loadTime === 'number' ? detail.loadTime : 0
          await incrementDailyStat(db, today, 'module_load_total', moduleName, loadTime)
          await incrementDailyStat(db, today, 'module_load_count', moduleName, 1)
          await updateDailyStatMax(db, today, 'module_load_max', moduleName, loadTime)
          await updateDailyStatMin(db, today, 'module_load_min', moduleName, loadTime)
        }
      }
    }
  }

  if (telemetry.eventType === 'search') {
    await incrementDailyStat(db, today, 'searches', '', 1)
    if (telemetry.searchDurationMs) {
      await incrementDailyStat(db, today, 'search_duration_total', '', telemetry.searchDurationMs)
    }
    if (typeof telemetry.searchResultCount === 'number') {
      await incrementDailyStat(db, today, 'search_result_total', '', telemetry.searchResultCount)
      await incrementDailyStat(db, today, 'search_result_count', '', 1)
    }
    // Track search terms (only first 50 chars, only if not anonymous)
    if (Array.isArray(telemetry.inputTypes)) {
      for (const inputType of telemetry.inputTypes) {
        await incrementDailyStat(db, today, 'search_input_type', inputType, 1)
      }
    }
    if (telemetry.providerTimings) {
      for (const providerId of Object.keys(telemetry.providerTimings)) {
        await incrementDailyStat(db, today, 'search_provider', providerId, 1)
      }
    }
    if (telemetry.metadata && typeof telemetry.metadata === 'object') {
      const meta = telemetry.metadata as Record<string, unknown>
      if (typeof meta.queryLength === 'number') {
        await incrementDailyStat(db, today, 'search_query_length_total', '', meta.queryLength)
        await incrementDailyStat(db, today, 'search_query_length_count', '', 1)
      }
      if (typeof meta.sortingDuration === 'number') {
        await incrementDailyStat(db, today, 'search_sorting_total', '', meta.sortingDuration)
      }
      if (typeof meta.queryType === 'string') {
        await incrementDailyStat(db, today, 'search_query_type', meta.queryType, 1)
      }
      if (typeof meta.searchScene === 'string') {
        await incrementDailyStat(db, today, 'search_scene', meta.searchScene, 1)
      }
      if (typeof meta.providerFilter === 'string') {
        await incrementDailyStat(db, today, 'search_provider_filter', meta.providerFilter, 1)
      }
      if (meta.resultCategories && typeof meta.resultCategories === 'object') {
        for (const [key, value] of Object.entries(meta.resultCategories as Record<string, unknown>)) {
          if (typeof value === 'number') {
            await incrementDailyStat(db, today, 'search_result_category', key, value)
          }
        }
      }
      if (meta.providerResults && typeof meta.providerResults === 'object') {
        for (const [key, value] of Object.entries(meta.providerResults as Record<string, unknown>)) {
          if (typeof value === 'number') {
            await incrementDailyStat(db, today, 'search_provider_result', key, value)
          }
        }
      }
    }
    // Track hourly distribution
    const hour = new Date(now).getUTCHours().toString().padStart(2, '0')
    await incrementDailyStat(db, today, 'hour', hour, 1)
  }

  if (telemetry.eventType === 'feature_use') {
    await incrementDailyStat(db, today, 'feature_use', '', 1)
    if (telemetry.metadata && typeof telemetry.metadata === 'object') {
      const meta = telemetry.metadata as Record<string, unknown>
      if (typeof meta.sourceType === 'string') {
        await incrementDailyStat(db, today, 'feature_use_source_type', meta.sourceType, 1)
      }
      if (typeof meta.itemKind === 'string') {
        await incrementDailyStat(db, today, 'feature_use_item_kind', meta.itemKind, 1)
      }
      if (typeof meta.pluginName === 'string') {
        await incrementDailyStat(db, today, 'feature_use_plugin', meta.pluginName, 1)
      }
      if (typeof meta.entityId === 'string') {
        const entityType = typeof meta.entityType === 'string' ? meta.entityType : 'entity'
        await incrementDailyStat(db, today, 'feature_use_entity', `${entityType}:${meta.entityId}`, 1)
      }
      if (typeof meta.executeLatencyMs === 'number') {
        await incrementDailyStat(db, today, 'execute_latency_total', '', meta.executeLatencyMs)
        await incrementDailyStat(db, today, 'execute_latency_count', '', 1)
      }
    }
  }

  if (telemetry.eventType === 'performance') {
    if (telemetry.metadata && typeof telemetry.metadata === 'object') {
      const meta = telemetry.metadata as Record<string, unknown>
      if (typeof meta.longTaskTotalMs === 'number') {
        await incrementDailyStat(db, today, 'perf_longtask_total_ms', '', meta.longTaskTotalMs)
      }
      if (typeof meta.longTaskCount === 'number') {
        await incrementDailyStat(db, today, 'perf_longtask_count', '', meta.longTaskCount)
      }
      if (typeof meta.longTaskMaxMs === 'number') {
        await updateDailyStatMax(db, today, 'perf_longtask_max_ms', '', meta.longTaskMaxMs)
      }
      if (typeof meta.rafJankTotalMs === 'number') {
        await incrementDailyStat(db, today, 'perf_raf_jank_total_ms', '', meta.rafJankTotalMs)
      }
      if (typeof meta.rafJankCount === 'number') {
        await incrementDailyStat(db, today, 'perf_raf_jank_count', '', meta.rafJankCount)
      }
      if (typeof meta.rafJankMaxMs === 'number') {
        await updateDailyStatMax(db, today, 'perf_raf_jank_max_ms', '', meta.rafJankMaxMs)
      }
      if (typeof meta.eventLoopDelayP95Ms === 'number') {
        await incrementDailyStat(db, today, 'perf_event_loop_delay_p95_total_ms', '', meta.eventLoopDelayP95Ms)
        await incrementDailyStat(db, today, 'perf_event_loop_delay_p95_count', '', 1)
      }
      if (typeof meta.eventLoopDelayMaxMs === 'number') {
        await updateDailyStatMax(db, today, 'perf_event_loop_delay_max_ms', '', meta.eventLoopDelayMaxMs)
      }
      if (typeof meta.unresponsiveTotalMs === 'number') {
        await incrementDailyStat(db, today, 'perf_unresponsive_total_ms', '', meta.unresponsiveTotalMs)
      }
      if (typeof meta.unresponsiveCount === 'number') {
        await incrementDailyStat(db, today, 'perf_unresponsive_count', '', meta.unresponsiveCount)
      }
      if (typeof meta.unresponsiveMaxMs === 'number') {
        await updateDailyStatMax(db, today, 'perf_unresponsive_max_ms', '', meta.unresponsiveMaxMs)
      }
    }
  }
}

function resolveRequestRegion(event: H3Event): string | undefined {
  const raw
    = getHeader(event, 'cf-ipcountry')
      || getHeader(event, 'CF-IPCountry')
      || getHeader(event, 'x-vercel-ip-country')
      || getHeader(event, 'x-nf-country')
      || undefined

  if (!raw)
    return undefined

  const normalized = raw.trim().toUpperCase()
  if (!normalized || normalized === 'XX')
    return undefined
  if (!/^[A-Z]{2}$/.test(normalized))
    return undefined
  return normalized
}

async function incrementDailyStat(
  db: D1Database,
  date: string,
  statType: string,
  statKey: string,
  increment: number
): Promise<void> {
  await db.prepare(`
    INSERT INTO ${DAILY_STATS_TABLE} (date, stat_type, stat_key, value)
    VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(date, stat_type, stat_key) DO UPDATE SET value = value + ?4;
  `).bind(date, statType, statKey, increment).run()
}

async function updateDailyStatMax(
  db: D1Database,
  date: string,
  statType: string,
  statKey: string,
  value: number
): Promise<void> {
  await db.prepare(`
    INSERT INTO ${DAILY_STATS_TABLE} (date, stat_type, stat_key, value)
    VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(date, stat_type, stat_key) DO UPDATE SET value = MAX(value, ?4);
  `).bind(date, statType, statKey, value).run()
}

async function updateDailyStatMin(
  db: D1Database,
  date: string,
  statType: string,
  statKey: string,
  value: number
): Promise<void> {
  await db.prepare(`
    INSERT INTO ${DAILY_STATS_TABLE} (date, stat_type, stat_key, value)
    VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(date, stat_type, stat_key) DO UPDATE SET value = MIN(value, ?4);
  `).bind(date, statType, statKey, value).run()
}

/**
 * Get analytics summary for admin dashboard
 */
export async function getAnalyticsSummary(
  event: H3Event,
  options: { days?: number } = {}
): Promise<{
  totalEvents: number
  totalUsers: number
  totalSearches: number
  avgSearchDuration: number
  avgQueryLength: number
  avgSortingDuration: number
  avgResultCount: number
  avgExecuteLatency: number
  performance: {
    longTaskCount: number
    longTaskTotalMs: number
    longTaskMaxMs: number
    longTaskAvgMs: number
    rafJankCount: number
    rafJankTotalMs: number
    rafJankMaxMs: number
    rafJankAvgMs: number
    eventLoopDelayP95AvgMs: number
    eventLoopDelayMaxMs: number
    unresponsiveCount: number
    unresponsiveTotalMs: number
    unresponsiveMaxMs: number
    unresponsiveAvgMs: number
  }
  dailyStats: Array<{
    date: string
    visits: number
    searches: number
    avgDuration: number
  }>
  deviceDistribution: Record<string, number>
  regionDistribution: Record<string, number>
  hourlyDistribution: Record<string, number>
  searchSceneDistribution: Record<string, number>
  searchInputTypeDistribution: Record<string, number>
  searchProviderDistribution: Record<string, number>
  searchProviderResultDistribution: Record<string, number>
  searchResultCategoryDistribution: Record<string, number>
  featureUseSourceTypeDistribution: Record<string, number>
  featureUseItemKindDistribution: Record<string, number>
  featureUsePluginDistribution: Record<string, number>
  featureUseEntityDistribution: Record<string, number>
  moduleLoadMetrics: Array<{
    module: string
    avgDuration: number
    maxDuration: number
    minDuration: number
    ratio: number
  }>
}> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTelemetrySchema(db)

  const days = options.days || 30
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  const startDateStr = startDate.toISOString().split('T')[0]

  // Get daily stats
  const { results: dailyResults } = await db.prepare(`
    SELECT date, stat_type, stat_key, value
    FROM ${DAILY_STATS_TABLE}
    WHERE date >= ?1
    ORDER BY date DESC;
  `).bind(startDateStr).all<{ date: string; stat_type: string; stat_key: string; value: number }>()

  // Aggregate stats
  const dailyMap = new Map<string, { visits: number; searches: number; durationTotal: number }>()
  const deviceDist: Record<string, number> = {}
  const regionDist: Record<string, number> = {}
  const hourlyDist: Record<string, number> = {}
  const searchSceneDist: Record<string, number> = {}
  const searchInputDist: Record<string, number> = {}
  const searchProviderDist: Record<string, number> = {}
  const searchProviderResultDist: Record<string, number> = {}
  const searchResultCategoryDist: Record<string, number> = {}
  const featureUseSourceTypeDist: Record<string, number> = {}
  const featureUseItemKindDist: Record<string, number> = {}
  const featureUsePluginDist: Record<string, number> = {}
  const featureUseEntityDist: Record<string, number> = {}
  const moduleLoadTotals: Record<string, number> = {}
  const moduleLoadCounts: Record<string, number> = {}
  const moduleLoadMax: Record<string, number> = {}
  const moduleLoadMin: Record<string, number> = {}
  let totalEvents = 0
  let totalUsers = 0
  let totalSearches = 0
  let totalDuration = 0
  let queryLengthTotal = 0
  let queryLengthCount = 0
  let sortingTotal = 0
  let resultTotal = 0
  let resultCount = 0
  let executeLatencyTotal = 0
  let executeLatencyCount = 0
  let perfLongTaskTotalMs = 0
  let perfLongTaskCount = 0
  let perfLongTaskMaxMs = 0
  let perfRafJankTotalMs = 0
  let perfRafJankCount = 0
  let perfRafJankMaxMs = 0
  let perfEventLoopDelayP95TotalMs = 0
  let perfEventLoopDelayP95Count = 0
  let perfEventLoopDelayMaxMs = 0
  let perfUnresponsiveTotalMs = 0
  let perfUnresponsiveCount = 0
  let perfUnresponsiveMaxMs = 0

  for (const row of dailyResults ?? []) {
    if (!dailyMap.has(row.date)) {
      dailyMap.set(row.date, { visits: 0, searches: 0, durationTotal: 0 })
    }
    const day = dailyMap.get(row.date)!

    switch (row.stat_type) {
      case 'visits':
        day.visits += row.value
        break
      case 'total_events':
        totalEvents += row.value
        break
      case 'searches':
        day.searches += row.value
        totalSearches += row.value
        break
      case 'search_duration_total':
        day.durationTotal += row.value
        totalDuration += row.value
        break
      case 'search_query_length_total':
        queryLengthTotal += row.value
        break
      case 'search_query_length_count':
        queryLengthCount += row.value
        break
      case 'search_sorting_total':
        sortingTotal += row.value
        break
      case 'search_result_total':
        resultTotal += row.value
        break
      case 'search_result_count':
        resultCount += row.value
        break
      case 'unique_users':
        totalUsers += 1 // Count distinct keys
        break
      case 'platform':
        deviceDist[row.stat_key] = (deviceDist[row.stat_key] || 0) + row.value
        break
      case 'region':
        regionDist[row.stat_key] = (regionDist[row.stat_key] || 0) + row.value
        break
      case 'hour':
        hourlyDist[row.stat_key] = (hourlyDist[row.stat_key] || 0) + row.value
        break
      case 'search_scene':
        searchSceneDist[row.stat_key] = (searchSceneDist[row.stat_key] || 0) + row.value
        break
      case 'search_input_type':
        searchInputDist[row.stat_key] = (searchInputDist[row.stat_key] || 0) + row.value
        break
      case 'search_provider':
        searchProviderDist[row.stat_key] = (searchProviderDist[row.stat_key] || 0) + row.value
        break
      case 'search_provider_result':
        searchProviderResultDist[row.stat_key] = (searchProviderResultDist[row.stat_key] || 0) + row.value
        break
      case 'search_result_category':
        searchResultCategoryDist[row.stat_key] = (searchResultCategoryDist[row.stat_key] || 0) + row.value
        break
      case 'feature_use_source_type':
        featureUseSourceTypeDist[row.stat_key] = (featureUseSourceTypeDist[row.stat_key] || 0) + row.value
        break
      case 'feature_use_item_kind':
        featureUseItemKindDist[row.stat_key] = (featureUseItemKindDist[row.stat_key] || 0) + row.value
        break
      case 'feature_use_plugin':
        featureUsePluginDist[row.stat_key] = (featureUsePluginDist[row.stat_key] || 0) + row.value
        break
      case 'feature_use_entity':
        featureUseEntityDist[row.stat_key] = (featureUseEntityDist[row.stat_key] || 0) + row.value
        break
      case 'module_load_total':
        moduleLoadTotals[row.stat_key] = (moduleLoadTotals[row.stat_key] || 0) + row.value
        break
      case 'module_load_count':
        moduleLoadCounts[row.stat_key] = (moduleLoadCounts[row.stat_key] || 0) + row.value
        break
      case 'module_load_max':
        moduleLoadMax[row.stat_key] = Math.max(moduleLoadMax[row.stat_key] || 0, row.value)
        break
      case 'module_load_min':
        moduleLoadMin[row.stat_key] = Math.min(moduleLoadMin[row.stat_key] ?? row.value, row.value)
        break
      case 'execute_latency_total':
        executeLatencyTotal += row.value
        break
      case 'execute_latency_count':
        executeLatencyCount += row.value
        break
      case 'perf_longtask_total_ms':
        perfLongTaskTotalMs += row.value
        break
      case 'perf_longtask_count':
        perfLongTaskCount += row.value
        break
      case 'perf_longtask_max_ms':
        perfLongTaskMaxMs = Math.max(perfLongTaskMaxMs, row.value)
        break
      case 'perf_raf_jank_total_ms':
        perfRafJankTotalMs += row.value
        break
      case 'perf_raf_jank_count':
        perfRafJankCount += row.value
        break
      case 'perf_raf_jank_max_ms':
        perfRafJankMaxMs = Math.max(perfRafJankMaxMs, row.value)
        break
      case 'perf_event_loop_delay_p95_total_ms':
        perfEventLoopDelayP95TotalMs += row.value
        break
      case 'perf_event_loop_delay_p95_count':
        perfEventLoopDelayP95Count += row.value
        break
      case 'perf_event_loop_delay_max_ms':
        perfEventLoopDelayMaxMs = Math.max(perfEventLoopDelayMaxMs, row.value)
        break
      case 'perf_unresponsive_total_ms':
        perfUnresponsiveTotalMs += row.value
        break
      case 'perf_unresponsive_count':
        perfUnresponsiveCount += row.value
        break
      case 'perf_unresponsive_max_ms':
        perfUnresponsiveMaxMs = Math.max(perfUnresponsiveMaxMs, row.value)
        break
    }
  }

  // Convert to arrays
  const dailyStats = Array.from(dailyMap.entries())
    .map(([date, stats]) => ({
      date,
      visits: stats.visits,
      searches: stats.searches,
      avgDuration: stats.searches > 0 ? Math.round(stats.durationTotal / stats.searches) : 0,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))

  const moduleLoadMetrics = Object.keys({
    ...moduleLoadTotals,
    ...moduleLoadCounts,
    ...moduleLoadMax,
    ...moduleLoadMin,
  }).map((moduleName) => {
    const total = moduleLoadTotals[moduleName] || 0
    const count = moduleLoadCounts[moduleName] || 0
    const max = moduleLoadMax[moduleName] || 0
    const min = moduleLoadMin[moduleName] || 0
    const avg = count > 0 ? total / count : 0
    const ratio = min > 0 ? max / min : 0
    return {
      module: moduleName,
      avgDuration: Math.round(avg),
      maxDuration: Math.round(max),
      minDuration: Math.round(min),
      ratio: Number.isFinite(ratio) ? Number(ratio.toFixed(2)) : 0,
    }
  }).sort((a, b) => b.avgDuration - a.avgDuration)

  return {
    totalEvents,
    totalUsers,
    totalSearches,
    avgSearchDuration: totalSearches > 0 ? Math.round(totalDuration / totalSearches) : 0,
    avgQueryLength: queryLengthCount > 0 ? Math.round(queryLengthTotal / queryLengthCount) : 0,
    avgSortingDuration: totalSearches > 0 ? Math.round(sortingTotal / totalSearches) : 0,
    avgResultCount: resultCount > 0 ? Math.round(resultTotal / resultCount) : 0,
    avgExecuteLatency: executeLatencyCount > 0 ? Math.round(executeLatencyTotal / executeLatencyCount) : 0,
    performance: {
      longTaskCount: perfLongTaskCount,
      longTaskTotalMs: perfLongTaskTotalMs,
      longTaskMaxMs: perfLongTaskMaxMs,
      longTaskAvgMs: perfLongTaskCount > 0 ? Math.round(perfLongTaskTotalMs / perfLongTaskCount) : 0,
      rafJankCount: perfRafJankCount,
      rafJankTotalMs: perfRafJankTotalMs,
      rafJankMaxMs: perfRafJankMaxMs,
      rafJankAvgMs: perfRafJankCount > 0 ? Math.round(perfRafJankTotalMs / perfRafJankCount) : 0,
      eventLoopDelayP95AvgMs: perfEventLoopDelayP95Count > 0 ? Math.round(perfEventLoopDelayP95TotalMs / perfEventLoopDelayP95Count) : 0,
      eventLoopDelayMaxMs: perfEventLoopDelayMaxMs,
      unresponsiveCount: perfUnresponsiveCount,
      unresponsiveTotalMs: perfUnresponsiveTotalMs,
      unresponsiveMaxMs: perfUnresponsiveMaxMs,
      unresponsiveAvgMs: perfUnresponsiveCount > 0 ? Math.round(perfUnresponsiveTotalMs / perfUnresponsiveCount) : 0,
    },
    dailyStats,
    deviceDistribution: deviceDist,
    regionDistribution: regionDist,
    hourlyDistribution: hourlyDist,
    searchSceneDistribution: searchSceneDist,
    searchInputTypeDistribution: searchInputDist,
    searchProviderDistribution: searchProviderDist,
    searchProviderResultDistribution: searchProviderResultDist,
    searchResultCategoryDistribution: searchResultCategoryDist,
    featureUseSourceTypeDistribution: featureUseSourceTypeDist,
    featureUseItemKindDistribution: featureUseItemKindDist,
    featureUsePluginDistribution: featureUsePluginDist,
    featureUseEntityDistribution: featureUseEntityDist,
    moduleLoadMetrics,
  }
}

/**
 * Get real-time stats (last 24 hours)
 */
export async function getRealTimeStats(event: H3Event): Promise<{
  searchesLast24h: number
  visitsLast24h: number
  activeUsers: number
  avgLatency: number
}> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTelemetrySchema(db)

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString()

  // Count recent events
  const { results } = await db.prepare(`
    SELECT 
      event_type,
      COUNT(*) as count,
      AVG(search_duration_ms) as avg_duration
    FROM ${TELEMETRY_TABLE}
    WHERE created_at >= ?1
    GROUP BY event_type;
  `).bind(yesterdayStr).all<{ event_type: string; count: number; avg_duration: number | null }>()

  let searchesLast24h = 0
  let visitsLast24h = 0
  let avgLatency = 0

  for (const row of results ?? []) {
    if (row.event_type === 'search') {
      searchesLast24h = row.count
      avgLatency = row.avg_duration ? Math.round(row.avg_duration) : 0
    } else if (row.event_type === 'visit') {
      visitsLast24h = row.count
    }
  }

  // Count unique users in last 24h
  const { results: userResults } = await db.prepare(`
    SELECT COUNT(DISTINCT user_id) as count
    FROM ${TELEMETRY_TABLE}
    WHERE created_at >= ?1 AND user_id IS NOT NULL;
  `).bind(yesterdayStr).all<{ count: number }>()

  const activeUsers = userResults?.[0]?.count || 0

  return {
    searchesLast24h,
    visitsLast24h,
    activeUsers,
    avgLatency,
  }
}
