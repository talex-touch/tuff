import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'

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

  // Indexes for efficient queries
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON ${TELEMETRY_TABLE}(created_at);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_telemetry_event_type ON ${TELEMETRY_TABLE}(event_type);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON ${DAILY_STATS_TABLE}(date);
  `).run()

  telemetrySchemaInitialized = true
}

export interface TelemetryEvent {
  id: string
  eventType: 'search' | 'visit' | 'error' | 'feature_use'
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
  searchTerms: Array<{ term: string; count: number }>
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

  // Insert telemetry event
  await db.prepare(`
    INSERT INTO ${TELEMETRY_TABLE} (
      id, event_type, user_id, device_fingerprint, platform, version,
      region, search_query, search_duration_ms, search_result_count,
      provider_timings, input_types, metadata, is_anonymous, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15);
  `).bind(
    id,
    telemetry.eventType,
    telemetry.userId || null,
    telemetry.deviceFingerprint || null,
    telemetry.platform || null,
    telemetry.version || null,
    telemetry.region || null,
    telemetry.searchQuery || null,
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
    if (telemetry.region && !telemetry.isAnonymous) {
      await incrementDailyStat(db, today, 'region', telemetry.region, 1)
    }
  }

  if (telemetry.eventType === 'search') {
    await incrementDailyStat(db, today, 'searches', '', 1)
    if (telemetry.searchDurationMs) {
      await incrementDailyStat(db, today, 'search_duration_total', '', telemetry.searchDurationMs)
    }
    // Track search terms (only first 50 chars, only if not anonymous)
    if (telemetry.searchQuery && !telemetry.isAnonymous) {
      const term = telemetry.searchQuery.substring(0, 50).toLowerCase().trim()
      if (term) {
        await incrementDailyStat(db, today, 'search_term', term, 1)
      }
    }
    // Track hourly distribution
    const hour = new Date(now).getUTCHours().toString().padStart(2, '0')
    await incrementDailyStat(db, today, 'hour', hour, 1)
  }
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

/**
 * Get analytics summary for admin dashboard
 */
export async function getAnalyticsSummary(
  event: H3Event,
  options: { days?: number } = {}
): Promise<{
  totalUsers: number
  totalSearches: number
  avgSearchDuration: number
  dailyStats: Array<{
    date: string
    visits: number
    searches: number
    avgDuration: number
  }>
  deviceDistribution: Record<string, number>
  regionDistribution: Record<string, number>
  topSearchTerms: Array<{ term: string; count: number }>
  hourlyDistribution: Record<string, number>
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
  const searchTerms: Record<string, number> = {}
  const hourlyDist: Record<string, number> = {}
  let totalUsers = 0
  let totalSearches = 0
  let totalDuration = 0

  for (const row of dailyResults ?? []) {
    if (!dailyMap.has(row.date)) {
      dailyMap.set(row.date, { visits: 0, searches: 0, durationTotal: 0 })
    }
    const day = dailyMap.get(row.date)!

    switch (row.stat_type) {
      case 'visits':
        day.visits += row.value
        break
      case 'searches':
        day.searches += row.value
        totalSearches += row.value
        break
      case 'search_duration_total':
        day.durationTotal += row.value
        totalDuration += row.value
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
      case 'search_term':
        searchTerms[row.stat_key] = (searchTerms[row.stat_key] || 0) + row.value
        break
      case 'hour':
        hourlyDist[row.stat_key] = (hourlyDist[row.stat_key] || 0) + row.value
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

  const topSearchTerms = Object.entries(searchTerms)
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50)

  return {
    totalUsers,
    totalSearches,
    avgSearchDuration: totalSearches > 0 ? Math.round(totalDuration / totalSearches) : 0,
    dailyStats,
    deviceDistribution: deviceDist,
    regionDistribution: regionDist,
    topSearchTerms,
    hourlyDistribution: hourlyDist,
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
