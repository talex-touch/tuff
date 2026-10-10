import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import {
  MAX_SEARCH_DURATION_MS,
  MAX_SEARCH_RESULT_COUNT,
  PROVIDER_STATUS_VALUES,
  TELEMETRY_EVENT_TYPES_SQL,
} from './telemetrySanitizer'
import { runAfterResponse } from './afterResponse'
import { claimMaintenanceRun, holdMaintenanceRun } from './maintenanceLease'

const TELEMETRY_TABLE = 'telemetry_events'
const DAILY_STATS_TABLE = 'daily_stats'

/** One row per derived day; bump the key when a derivation changes so every retained day is derived again. */
const ROLLUP_MARKER_TYPE = 'telemetry_rollup'
const ROLLUP_MARKER_KEY = 'v1'
/**
 * Retention keeps seven days and deletes what is older, so the day seven days back can be losing
 * events while it is read; the oldest day rolled up is the one after it.
 */
const MAX_ROLLUP_DAYS_BACK = 6
/**
 * The first day whose counters only the rollup writes: from 2026-10-09 ingestion keeps the rows and
 * no longer upserts the counters. Earlier days keep what ingestion wrote; deriving them again would
 * read all their events for numbers already stored.
 */
const ROLLUP_FIRST_DAY = '2026-10-09'
const ROLLUP_CHECK_THROTTLE_MS = 10 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
/** One isolate in the fleet rolls up, at most one day per interval. */
const ROLLUP_LEASE_KEY = 'telemetry-daily-rollup'
const ROLLUP_INTERVAL_MS = 60 * 60 * 1000
/**
 * How long a failed run holds the lease. A statement D1 refuses fails the day's whole batch, its
 * marker included, and every attempt reads the day's events again first: once an hour, that spends
 * the free plan's daily read allowance again.
 */
const ROLLUP_FAILURE_HOLD_MS = DAY_MS

/**
 * On again, bounded (2026-10-09). The first release ran on every isolate every ten minutes, rolled
 * up every pending day in one go and retried a failing day each time; with D1 refusing one of its
 * statements (a compound SELECT over five terms) that spent the free plan's five-million-row daily
 * read allowance within an hour. Now one isolate in the fleet runs it per hour (maintenance lease),
 * a run rolls up one day, and a failure holds the lease for a day. A day's run reads its events about
 * once per statement through `idx_telemetry_event_geo`: 79,836 rows for 2026-10-08's 21,161 events,
 * the heaviest retained day (measured before the shared CTEs were materialized). During the incident
 * D1 Insights showed about 257,000 rows a run, roughly the whole table four times over; that was while
 * production still had an `event_type`-only index (since dropped), and the plan behind it was never
 * captured, so the cause is unconfirmed.
 */
let dailyRollupEnabled = true
/**
 * Today and yesterday derived from their events for the analytics summary, on every view: the same
 * statements over two days, up to about 160,000 rows a view at the 2026-10-08 volume, where the free
 * plan allows five million a day for everything. Off; the summary shows the days the rollup stored.
 */
let liveDaysEnabled = false

export function setTelemetryDailyRollupEnabledForTest(enabled: boolean): void {
  dailyRollupEnabled = enabled
  liveDaysEnabled = enabled
}

const SEARCH_FIRST_RESULT_SLOW_THRESHOLD_MS = 300
const SEARCH_TOTAL_SLOW_THRESHOLD_MS = 800

export interface TelemetryDailyStatRow {
  date: string
  stat_type: string
  stat_key: string
  value: number
}

/** `normalizeNumber(<json>.<field>, { min: 0, max })`: the value when it is a number in range, else NULL. */
function jsonNumber(column: string, field: string, max: number): string {
  const path = `'$.${field}'`
  return `CASE WHEN json_type(${column}, ${path}) IN ('integer', 'real') AND json_extract(${column}, ${path}) BETWEEN 0 AND ${max} THEN json_extract(${column}, ${path}) END`
}

/** `typeof <json>.<field> === 'string'`: the string, else NULL. */
function jsonText(column: string, field: string): string {
  const path = `'$.${field}'`
  return `CASE WHEN json_type(${column}, ${path}) = 'text' THEN json_extract(${column}, ${path}) END`
}

const DAY_RANGE = 'created_at >= ?1 AND created_at < ?2'
const EVENT_DAY_RANGE = 'event.created_at >= ?1 AND event.created_at < ?2'
const PROVIDER_STATUSES = [...PROVIDER_STATUS_VALUES].map(status => `'${status}'`).join(', ')

/**
 * The daily counters ingestion used to upsert once per event, as `SELECT`s over one day of
 * `telemetry_events` (`?1` <= created_at < `?2`). Each returns `stat_type, stat_key, value` and the
 * same rows, keys and values the per-event upserts produced: a counter with no matching event has
 * no row (NULL `value`), a maximum is the day's maximum. Feature-use counters are not here: their
 * keys need the category normalisation SQLite cannot express, and they are rare enough to keep
 * upserting at ingest.
 *
 * One aggregation, two uses: the daily rollup writes a finished day's rows, and the analytics
 * summary reads today's directly, so what the dashboard shows for today is what the rollup stores.
 *
 * D1 refuses a compound SELECT of more than five terms ("too many terms in compound SELECT"), far
 * under SQLite's 500, and documents a cap of 32 arguments per function call (a 34-argument
 * json_object still ran there on 2026-10-09; staying under the documented cap costs nothing). The
 * test database applies both (`test/helpers/d1-sqlite.ts`). Measures taken from one scan are therefore
 * unpivoted through `json_each(json_object(...))`, not a `UNION ALL` per measure, and a set of more
 * than 16 measures is split into several objects inside one `json_array`. A NULL measure becomes a
 * JSON null and is dropped with the other NULLs.
 */
const DAILY_AGGREGATES: readonly string[] = [
  `
    SELECT 'total_events' AS stat_type, '' AS stat_key, NULLIF(COUNT(*), 0) AS value
    FROM ${TELEMETRY_TABLE}
    WHERE event_type IN (${TELEMETRY_EVENT_TYPES_SQL}) AND ${DAY_RANGE}
    UNION ALL
    SELECT 'hour', substr(created_at, 12, 2), COUNT(*)
    FROM ${TELEMETRY_TABLE}
    WHERE event_type IN ('search', 'visit') AND ${DAY_RANGE}
    GROUP BY substr(created_at, 12, 2)
  `,
  `
    WITH visit AS MATERIALIZED (
      SELECT
        COALESCE(NULLIF(client_id, ''), NULLIF(user_id, ''), NULLIF(device_fingerprint, '')) AS actor,
        platform,
        region
      FROM ${TELEMETRY_TABLE}
      WHERE event_type = 'visit' AND ${DAY_RANGE}
    )
    SELECT 'visits' AS stat_type, '' AS stat_key, NULLIF(COUNT(*), 0) AS value FROM visit
    UNION ALL
    SELECT 'unique_users', actor, COUNT(*) FROM visit WHERE actor IS NOT NULL GROUP BY actor
    UNION ALL
    SELECT 'platform', platform, COUNT(*) FROM visit WHERE platform <> '' GROUP BY platform
    UNION ALL
    SELECT 'region', region, COUNT(*) FROM visit WHERE region <> '' GROUP BY region
  `,
  // Startup visits carry each module's load time; a detail that is not an object counts as an
  // `unknown` module that loaded in 0 ms, as it did when ingestion read it.
  `
    WITH module AS MATERIALIZED (
      SELECT
        CASE WHEN detail.type = 'object'
          THEN COALESCE(${jsonText('detail.value', 'name')}, 'unknown')
          ELSE 'unknown'
        END AS name,
        CASE WHEN detail.type = 'object'
          THEN COALESCE(${jsonNumber('detail.value', 'loadTime', MAX_SEARCH_DURATION_MS)}, 0)
          ELSE 0
        END AS load_time
      FROM ${TELEMETRY_TABLE} AS event, json_each(event.metadata, '$.mainProcess.moduleDetails') AS detail
      WHERE event.event_type = 'visit' AND ${EVENT_DAY_RANGE}
        AND json_extract(event.metadata, '$.kind') = 'startup'
        AND json_type(event.metadata, '$.mainProcess.moduleDetails') = 'array'
    )
    SELECT 'module_load_total' AS stat_type, name AS stat_key, SUM(load_time) AS value FROM module GROUP BY name
    UNION ALL
    SELECT 'module_load_count', name, COUNT(*) FROM module GROUP BY name
    UNION ALL
    SELECT 'module_load_max', name, MAX(load_time) FROM module GROUP BY name
    UNION ALL
    SELECT 'module_load_min', name, MIN(load_time) FROM module GROUP BY name
  `,
  `
    WITH search AS (
      SELECT
        search_duration_ms AS duration,
        search_result_count AS result_count,
        ${jsonNumber('metadata', 'queryLength', 2048)} AS query_length,
        ${jsonNumber('metadata', 'sortingDuration', MAX_SEARCH_DURATION_MS)} AS sorting,
        ${jsonNumber('metadata', 'firstResultMs', MAX_SEARCH_DURATION_MS)} AS first_result,
        metadata IS NOT NULL AS has_metadata
      FROM ${TELEMETRY_TABLE}
      WHERE event_type = 'search' AND ${DAY_RANGE}
    ),
    totals AS (
      SELECT
        COUNT(*) AS searches,
        SUM(duration) AS duration_total,
        MAX(duration) AS duration_max,
        MIN(duration) AS duration_min,
        SUM(result_count) AS result_total,
        COUNT(result_count) AS result_count,
        SUM(query_length) AS query_length_total,
        COUNT(query_length) AS query_length_count,
        SUM(sorting) AS sorting_total,
        COUNT(sorting) AS sorting_count,
        MAX(sorting) AS sorting_max,
        MIN(sorting) AS sorting_min,
        SUM(first_result) AS first_result_total,
        COUNT(first_result) AS first_result_count,
        MAX(first_result) AS first_result_max,
        MIN(first_result) AS first_result_min,
        SUM(has_metadata AND (
          first_result > ${SEARCH_FIRST_RESULT_SLOW_THRESHOLD_MS}
          OR duration > ${SEARCH_TOTAL_SLOW_THRESHOLD_MS}
        )) AS slow
      FROM search
    )
    SELECT measure.key AS stat_type, '' AS stat_key, measure.value AS value
    FROM totals, json_each(json_array(
      json_object(
        'searches', NULLIF(searches, 0),
        'search_duration_total', duration_total,
        'search_duration_max', duration_max,
        'search_duration_min', duration_min,
        'search_result_total', result_total,
        'search_result_count', NULLIF(result_count, 0),
        'search_query_length_total', query_length_total,
        'search_query_length_count', NULLIF(query_length_count, 0),
        'search_slow_count', NULLIF(slow, 0)
      ),
      json_object(
        'search_sorting_total', sorting_total,
        'search_sorting_count', NULLIF(sorting_count, 0),
        'search_sorting_max', sorting_max,
        'search_sorting_min', sorting_min,
        'search_first_result_total', first_result_total,
        'search_first_result_count', NULLIF(first_result_count, 0),
        'search_first_result_max', first_result_max,
        'search_first_result_min', first_result_min
      )
    )) AS part, json_each(part.value) AS measure
  `,
  `
    WITH search AS MATERIALIZED (
      SELECT
        COALESCE(NULLIF(country_code, ''), 'Unknown') AS country,
        COALESCE(NULLIF(region_code, ''), NULLIF(region_name, ''), 'Unknown') AS subdivision,
        ${jsonText('metadata', 'queryType')} AS query_type,
        ${jsonText('metadata', 'searchScene')} AS scene,
        ${jsonText('metadata', 'providerFilter')} AS provider_filter
      FROM ${TELEMETRY_TABLE}
      WHERE event_type = 'search' AND ${DAY_RANGE}
    )
    SELECT 'search_geo_country' AS stat_type, country AS stat_key, COUNT(*) AS value FROM search GROUP BY country
    UNION ALL
    SELECT 'search_geo_subdivision', country || ':' || subdivision, COUNT(*) FROM search GROUP BY country, subdivision
    UNION ALL
    SELECT 'search_query_type', query_type, COUNT(*) FROM search WHERE query_type IS NOT NULL GROUP BY query_type
    UNION ALL
    SELECT 'search_scene', scene, COUNT(*) FROM search WHERE scene IS NOT NULL GROUP BY scene
    UNION ALL
    SELECT 'search_provider_filter', provider_filter, COUNT(*) FROM search WHERE provider_filter IS NOT NULL GROUP BY provider_filter
  `,
  `
    WITH timing AS (
      SELECT
        provider.key AS provider,
        provider.value AS duration,
        provider.type AS kind,
        event.metadata IS NOT NULL AND (
          ${jsonNumber('event.metadata', 'firstResultMs', MAX_SEARCH_DURATION_MS)} > ${SEARCH_FIRST_RESULT_SLOW_THRESHOLD_MS}
          OR event.search_duration_ms > ${SEARCH_TOTAL_SLOW_THRESHOLD_MS}
        ) AS slow_search
      FROM ${TELEMETRY_TABLE} AS event, json_each(event.provider_timings) AS provider
      WHERE event.event_type = 'search' AND ${EVENT_DAY_RANGE}
        AND json_type(event.provider_timings) = 'object'
    ),
    per_provider AS (
      SELECT
        provider,
        COUNT(*) AS calls,
        SUM(CASE WHEN kind IN ('integer', 'real') THEN duration END) AS time_total,
        COUNT(CASE WHEN kind IN ('integer', 'real') THEN 1 END) AS time_count,
        MAX(CASE WHEN kind IN ('integer', 'real') THEN duration END) AS time_max,
        MIN(CASE WHEN kind IN ('integer', 'real') THEN duration END) AS time_min,
        COUNT(CASE WHEN slow_search AND duration > ${SEARCH_FIRST_RESULT_SLOW_THRESHOLD_MS} THEN 1 END) AS slow
      FROM timing
      GROUP BY provider
    )
    SELECT measure.key AS stat_type, per_provider.provider AS stat_key, measure.value AS value
    FROM per_provider, json_each(json_object(
      'search_provider', calls,
      'search_provider_time_total', time_total,
      'search_provider_time_count', NULLIF(time_count, 0),
      'search_provider_time_max', time_max,
      'search_provider_time_min', time_min,
      'search_provider_slow', NULLIF(slow, 0)
    )) AS measure
  `,
  `
    SELECT 'search_input_type' AS stat_type, input.value AS stat_key, COUNT(*) AS value
    FROM ${TELEMETRY_TABLE} AS event, json_each(event.input_types) AS input
    WHERE event.event_type = 'search' AND ${EVENT_DAY_RANGE}
      AND json_type(event.input_types) = 'array'
    GROUP BY input.value
  `,
  // Array entries are keyed by index; `Object.entries` turned that into the text '0', '1', …
  `
    SELECT 'search_result_category' AS stat_type, CAST(entry.key AS TEXT) AS stat_key, SUM(entry.value) AS value
    FROM ${TELEMETRY_TABLE} AS event, json_each(event.metadata, '$.resultCategories') AS entry
    WHERE event.event_type = 'search' AND ${EVENT_DAY_RANGE}
      AND json_type(event.metadata, '$.resultCategories') IN ('object', 'array')
      AND entry.type IN ('integer', 'real') AND entry.value BETWEEN 0 AND ${MAX_SEARCH_RESULT_COUNT}
    GROUP BY CAST(entry.key AS TEXT)
    UNION ALL
    SELECT 'search_provider_result', CAST(entry.key AS TEXT), SUM(entry.value)
    FROM ${TELEMETRY_TABLE} AS event, json_each(event.metadata, '$.providerResults') AS entry
    WHERE event.event_type = 'search' AND ${EVENT_DAY_RANGE}
      AND json_type(event.metadata, '$.providerResults') IN ('object', 'array')
      AND entry.type IN ('integer', 'real') AND entry.value BETWEEN 0 AND ${MAX_SEARCH_RESULT_COUNT}
    GROUP BY CAST(entry.key AS TEXT)
  `,
  `
    WITH provider_status AS MATERIALIZED (
      SELECT entry.key AS provider, entry.value AS state
      FROM ${TELEMETRY_TABLE} AS event, json_each(event.metadata, '$.providerStatus') AS entry
      WHERE event.event_type = 'search' AND ${EVENT_DAY_RANGE}
        AND json_type(event.metadata, '$.providerStatus') IN ('object', 'array')
        AND entry.type = 'text' AND entry.value IN (${PROVIDER_STATUSES})
    )
    SELECT 'search_provider_status' AS stat_type, provider || ':' || state AS stat_key, COUNT(*) AS value
    FROM provider_status GROUP BY provider, state
    UNION ALL
    SELECT 'search_provider_error', provider, COUNT(*) FROM provider_status WHERE state = 'error' GROUP BY provider
    UNION ALL
    SELECT 'search_provider_timeout', provider, COUNT(*) FROM provider_status WHERE state = 'timeout' GROUP BY provider
  `,
  `
    WITH perf AS (
      SELECT
        SUM(${jsonNumber('metadata', 'longTaskTotalMs', MAX_SEARCH_DURATION_MS)}) AS longtask_total,
        SUM(${jsonNumber('metadata', 'longTaskCount', MAX_SEARCH_RESULT_COUNT)}) AS longtask_count,
        MAX(${jsonNumber('metadata', 'longTaskMaxMs', MAX_SEARCH_DURATION_MS)}) AS longtask_max,
        SUM(${jsonNumber('metadata', 'rafJankTotalMs', MAX_SEARCH_DURATION_MS)}) AS raf_jank_total,
        SUM(${jsonNumber('metadata', 'rafJankCount', MAX_SEARCH_RESULT_COUNT)}) AS raf_jank_count,
        MAX(${jsonNumber('metadata', 'rafJankMaxMs', MAX_SEARCH_DURATION_MS)}) AS raf_jank_max,
        SUM(${jsonNumber('metadata', 'eventLoopDelayP95Ms', MAX_SEARCH_DURATION_MS)}) AS event_loop_p95_total,
        COUNT(${jsonNumber('metadata', 'eventLoopDelayP95Ms', MAX_SEARCH_DURATION_MS)}) AS event_loop_p95_count,
        MAX(${jsonNumber('metadata', 'eventLoopDelayMaxMs', MAX_SEARCH_DURATION_MS)}) AS event_loop_max,
        SUM(${jsonNumber('metadata', 'unresponsiveTotalMs', MAX_SEARCH_DURATION_MS)}) AS unresponsive_total,
        SUM(${jsonNumber('metadata', 'unresponsiveCount', MAX_SEARCH_RESULT_COUNT)}) AS unresponsive_count,
        MAX(${jsonNumber('metadata', 'unresponsiveMaxMs', MAX_SEARCH_DURATION_MS)}) AS unresponsive_max
      FROM ${TELEMETRY_TABLE}
      WHERE event_type = 'performance' AND ${DAY_RANGE}
    )
    SELECT measure.key AS stat_type, '' AS stat_key, measure.value AS value
    FROM perf, json_each(json_object(
      'perf_longtask_total_ms', longtask_total,
      'perf_longtask_count', longtask_count,
      'perf_longtask_max_ms', longtask_max,
      'perf_raf_jank_total_ms', raf_jank_total,
      'perf_raf_jank_count', raf_jank_count,
      'perf_raf_jank_max_ms', raf_jank_max,
      'perf_event_loop_delay_p95_total_ms', event_loop_p95_total,
      'perf_event_loop_delay_p95_count', NULLIF(event_loop_p95_count, 0),
      'perf_event_loop_delay_max_ms', event_loop_max,
      'perf_unresponsive_total_ms', unresponsive_total,
      'perf_unresponsive_count', unresponsive_count,
      'perf_unresponsive_max_ms', unresponsive_max
    )) AS measure
  `,
]

/** Every `stat_type` the aggregation produces: for a day not yet rolled up, stored rows of these are stale. */
export const TELEMETRY_ROLLUP_STAT_TYPES: ReadonlySet<string> = new Set([
  'total_events',
  'hour',
  'visits',
  'unique_users',
  'platform',
  'region',
  'module_load_total',
  'module_load_count',
  'module_load_max',
  'module_load_min',
  'searches',
  'search_duration_total',
  'search_duration_max',
  'search_duration_min',
  'search_result_total',
  'search_result_count',
  'search_query_length_total',
  'search_query_length_count',
  'search_sorting_total',
  'search_sorting_count',
  'search_sorting_max',
  'search_sorting_min',
  'search_first_result_total',
  'search_first_result_count',
  'search_first_result_max',
  'search_first_result_min',
  'search_slow_count',
  'search_geo_country',
  'search_geo_subdivision',
  'search_query_type',
  'search_scene',
  'search_provider_filter',
  'search_provider',
  'search_provider_time_total',
  'search_provider_time_count',
  'search_provider_time_max',
  'search_provider_time_min',
  'search_provider_slow',
  'search_input_type',
  'search_result_category',
  'search_provider_result',
  'search_provider_status',
  'search_provider_error',
  'search_provider_timeout',
  'perf_longtask_total_ms',
  'perf_longtask_count',
  'perf_longtask_max_ms',
  'perf_raf_jank_total_ms',
  'perf_raf_jank_count',
  'perf_raf_jank_max_ms',
  'perf_event_loop_delay_p95_total_ms',
  'perf_event_loop_delay_p95_count',
  'perf_event_loop_delay_max_ms',
  'perf_unresponsive_total_ms',
  'perf_unresponsive_count',
  'perf_unresponsive_max_ms',
])

function toDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function dayBounds(date: string): [string, string] {
  const start = Date.parse(`${date}T00:00:00.000Z`)
  return [new Date(start).toISOString(), new Date(start + DAY_MS).toISOString()]
}

/**
 * Writes one finished day's counters, recomputed from all of its events. A counter is replaced,
 * not incremented, so a day whose counters ingestion had already been upserting (the day this
 * shipped) and a day rolled up twice both end with the counts of their events. The marker is part
 * of the same batch: a day is marked exactly when its counters are in.
 */
export async function rollupTelemetryDay(db: D1Database, date: string): Promise<void> {
  const [start, end] = dayBounds(date)
  const statements: D1PreparedStatement[] = DAILY_AGGREGATES.map(aggregate => db.prepare(`
    INSERT INTO ${DAILY_STATS_TABLE} (date, stat_type, stat_key, value)
    SELECT ?3, stat_type, stat_key, value FROM (${aggregate})
    WHERE value IS NOT NULL
    ON CONFLICT(date, stat_type, stat_key) DO UPDATE SET value = excluded.value;
  `).bind(start, end, date))
  statements.push(db.prepare(`
    INSERT INTO ${DAILY_STATS_TABLE} (date, stat_type, stat_key, value)
    VALUES (?1, ?2, ?3, 1)
    ON CONFLICT(date, stat_type, stat_key) DO UPDATE SET value = excluded.value;
  `).bind(date, ROLLUP_MARKER_TYPE, ROLLUP_MARKER_KEY))
  await db.batch(statements)
}

/**
 * Finished days that still need rolling up. Retention deletes the oldest events first, so every day
 * after the one holding the oldest remaining event still has all of its events; that day itself
 * may have lost some and is left alone.
 */
export async function listTelemetryDaysToRollUp(db: D1Database, now = new Date()): Promise<string[]> {
  const today = toDate(now.getTime())
  const daysBack = toDate(now.getTime() - MAX_ROLLUP_DAYS_BACK * DAY_MS)
  const earliestCandidate = daysBack > ROLLUP_FIRST_DAY ? daysBack : ROLLUP_FIRST_DAY
  // The oldest event is the oldest of each type's oldest, one index row apiece. With no index on
  // `created_at` alone, a bare `MIN(created_at)` reads the whole table, once an hour.
  const row = await db.prepare(`
    SELECT
      (
        SELECT MIN((SELECT MIN(created_at) FROM ${TELEMETRY_TABLE} WHERE event_type = type.value))
        FROM json_each(json_array(${TELEMETRY_EVENT_TYPES_SQL})) AS type
      ) AS earliest_event,
      (
        SELECT group_concat(date)
        FROM ${DAILY_STATS_TABLE}
        WHERE stat_type = ?1 AND stat_key = ?2 AND date >= ?3 AND date < ?4
      ) AS rolled_up;
  `).bind(ROLLUP_MARKER_TYPE, ROLLUP_MARKER_KEY, earliestCandidate, today).first<{
    earliest_event: string | null
    rolled_up: string | null
  }>()
  if (!row?.earliest_event)
    return []

  const rolledUp = new Set(String(row.rolled_up ?? '').split(',').filter(Boolean))
  const firstCompleteDay = Date.parse(`${row.earliest_event.slice(0, 10)}T00:00:00.000Z`) + DAY_MS
  const days: string[] = []
  for (
    let dayStart = Math.max(firstCompleteDay, Date.parse(`${earliestCandidate}T00:00:00.000Z`));
    toDate(dayStart) < today;
    dayStart += DAY_MS
  ) {
    const date = toDate(dayStart)
    if (!rolledUp.has(date))
      days.push(date)
  }
  return days
}

/**
 * Rolls up the oldest finished day still to do, when this isolate wins the hour's lease. Resolves to
 * that day, or null when another isolate holds the lease or no day is waiting.
 */
export async function runTelemetryDailyRollupIfDue(db: D1Database, now = new Date()): Promise<string | null> {
  const claim = await claimMaintenanceRun(db, ROLLUP_LEASE_KEY, now, ROLLUP_INTERVAL_MS)
  if (!claim.claimed)
    return null

  try {
    const [date] = await listTelemetryDaysToRollUp(db, now)
    if (!date)
      return null
    await rollupTelemetryDay(db, date)
    return date
  }
  catch (error) {
    await holdMaintenanceRun(db, ROLLUP_LEASE_KEY, now, ROLLUP_FAILURE_HOLD_MS).catch(() => {})
    throw error
  }
}

/**
 * The summary's `daily_stats` rows with the days the rollup has not reached -- today, and
 * yesterday until it runs -- recomputed from their events. Older days are read as stored: either
 * rolled up, or from before the rollup existed, when ingestion kept their counters current.
 */
export async function withUnrolledTelemetryDays(
  db: D1Database,
  rows: TelemetryDailyStatRow[],
  options: { from: string, now?: Date },
): Promise<TelemetryDailyStatRow[]> {
  if (!liveDaysEnabled)
    return rows

  const nowMs = (options.now ?? new Date()).getTime()
  const candidates = [toDate(nowMs - DAY_MS), toDate(nowMs)].filter(date => date >= options.from)
  if (!candidates.length)
    return rows

  const { results: markers } = await db.prepare(`
    SELECT date
    FROM ${DAILY_STATS_TABLE}
    WHERE stat_type = ?1 AND stat_key = ?2 AND date IN (?3, ?4);
  `).bind(ROLLUP_MARKER_TYPE, ROLLUP_MARKER_KEY, candidates[0], candidates.at(-1)).all<{ date: string }>()
  const rolledUp = new Set((markers ?? []).map(marker => marker.date))
  const liveDays = candidates.filter(date => !rolledUp.has(date))
  if (!liveDays.length)
    return rows

  const statements = liveDays.flatMap((date) => {
    const [start, end] = dayBounds(date)
    return DAILY_AGGREGATES.map(aggregate => db.prepare(`
      SELECT ?3 AS date, stat_type, stat_key, value FROM (${aggregate})
      WHERE value IS NOT NULL;
    `).bind(start, end, date))
  })
  const results = await db.batch<TelemetryDailyStatRow>(statements)
  const live = new Set(liveDays)
  return [
    ...rows.filter(row => !(live.has(row.date) && TELEMETRY_ROLLUP_STAT_TYPES.has(row.stat_type))),
    ...results.flatMap(result => result.results ?? []),
  ]
}

let nextRollupCheckAt = 0

/**
 * Called after each telemetry commit. An isolate checks at most every ten minutes, and a check is one
 * lease claim unless the hour's run falls to it (`runTelemetryDailyRollupIfDue`).
 */
export function scheduleTelemetryDailyRollup(event: H3Event | undefined, db: D1Database) {
  const nowMs = Date.now()
  if (!dailyRollupEnabled || nowMs < nextRollupCheckAt)
    return

  nextRollupCheckAt = nowMs + ROLLUP_CHECK_THROTTLE_MS
  runAfterResponse(event, 'telemetry daily rollup', () => runTelemetryDailyRollupIfDue(db, new Date(nowMs)))
}
