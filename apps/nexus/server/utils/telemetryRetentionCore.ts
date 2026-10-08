import type { D1Database } from '@cloudflare/workers-types'
import { defineD1Schema, ensureD1Schema } from './d1Schema'

const TELEMETRY_TABLE = 'telemetry_events'
const DAILY_STATS_TABLE = 'daily_stats'
const GOVERNANCE_EVENTS_TABLE = 'platform_governance_events'
const DEFAULT_TELEMETRY_RETENTION_DAYS = 7
const DEFAULT_GOVERNANCE_RETENTION_DAYS = 14
const DEFAULT_BATCH_LIMIT = 10000
const MAX_RETENTION_DAYS = 366
const MAX_BATCH_LIMIT = 50000

export interface TelemetryRetentionInput {
  telemetryRetentionDays?: number
  governanceRetentionDays?: number
  batchLimit?: number
  dryRun?: boolean
  now?: Date
}

export interface RetentionTableResult {
  table: 'telemetry_events' | 'platform_governance_events'
  cutoff: string
  matched: number
  deleted: number
  remainingAfterBatch: number
}

export interface TelemetryRetentionResult {
  dryRun: boolean
  generatedAt: string
  telemetryRetentionDays: number
  governanceRetentionDays: number
  batchLimit: number
  tables: RetentionTableResult[]
}

function normalizePositiveInteger(value: unknown, fallback: number, max: number): number {
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numberValue) || numberValue <= 0)
    return fallback
  return Math.min(Math.floor(numberValue), max)
}

function resolveCutoff(now: Date, retentionDays: number): string {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
}

const DAILY_STATS_SCHEMA = defineD1Schema('telemetry-daily-stats', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${DAILY_STATS_TABLE} (
        date TEXT NOT NULL,
        stat_type TEXT NOT NULL,
        stat_key TEXT NOT NULL DEFAULT '',
        value INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (date, stat_type, stat_key)
      )`,
  ],
})

async function ensureDailyStatsSchema(db: D1Database) {
  await ensureD1Schema(db, DAILY_STATS_SCHEMA)
}

/**
 * Rolls one table's expiring rows into `daily_stats`. Each statement reads the expiring rows once and
 * derives every daily stat from that pass; the governance rollup was four statements, each a full
 * scan (`platform_governance_events` had no index leading with `occurred_at`), about 48k rows read
 * apiece in production. `DO NOTHING` keeps a day's first rollup, as before.
 *
 * The outer `SELECT … WHERE true` is SQLite's required disambiguation between `ON CONFLICT` and a join
 * constraint after a compound select.
 */
const TELEMETRY_ROLLUP_SQL = `
  INSERT INTO ${DAILY_STATS_TABLE} (date, stat_type, stat_key, value)
  SELECT date, stat_type, stat_key, value FROM (
    WITH per_type AS (
      SELECT substr(created_at, 1, 10) AS date, event_type, COUNT(*) AS total
      FROM ${TELEMETRY_TABLE}
      WHERE created_at < ?1
      GROUP BY date, event_type
    )
    SELECT date, 'total_events' AS stat_type, '' AS stat_key, SUM(total) AS value FROM per_type GROUP BY date
    UNION ALL
    SELECT date, 'events_by_type', event_type, total FROM per_type
  )
  WHERE true
  ON CONFLICT(date, stat_type, stat_key) DO NOTHING
`

const GOVERNANCE_ROLLUP_SQL = `
  INSERT INTO ${DAILY_STATS_TABLE} (date, stat_type, stat_key, value)
  SELECT date, stat_type, stat_key, value FROM (
    WITH per_pair AS (
      SELECT substr(occurred_at, 1, 10) AS date, scope, action, COUNT(*) AS total
      FROM ${GOVERNANCE_EVENTS_TABLE}
      WHERE occurred_at < ?1
      GROUP BY date, scope, action
    )
    SELECT date, 'governance_total_events' AS stat_type, '' AS stat_key, SUM(total) AS value FROM per_pair GROUP BY date
    UNION ALL
    SELECT date, 'governance_scope', scope, SUM(total) FROM per_pair GROUP BY date, scope
    UNION ALL
    SELECT date, 'governance_action', action, SUM(total) FROM per_pair GROUP BY date, action
    UNION ALL
    SELECT date, 'governance_scope_action', scope || ':' || action, total FROM per_pair
  )
  WHERE true
  ON CONFLICT(date, stat_type, stat_key) DO NOTHING
`

const ROLLUP_SQL: Record<RetentionTableResult['table'], string> = {
  [TELEMETRY_TABLE]: TELEMETRY_ROLLUP_SQL,
  [GOVERNANCE_EVENTS_TABLE]: GOVERNANCE_ROLLUP_SQL,
}

/**
 * One table's retention pass in one round trip: rollup, count, delete, as a single transaction, so
 * rows are never deleted without having been rolled up. A dry run only counts. It was up to six
 * round trips per table, each statement on its own.
 */
async function cleanupTable(
  db: D1Database,
  table: RetentionTableResult['table'],
  timestampColumn: 'created_at' | 'occurred_at',
  cutoff: string,
  batchLimit: number,
  dryRun: boolean,
): Promise<RetentionTableResult> {
  const count = db.prepare(`
    SELECT COUNT(*) AS count
    FROM ${table}
    WHERE ${timestampColumn} < ?1
  `).bind(cutoff)

  if (dryRun) {
    const row = await count.first<{ count?: number }>()
    const matched = Number(row?.count ?? 0)
    return { table, cutoff, matched, deleted: 0, remainingAfterBatch: matched }
  }

  await ensureDailyStatsSchema(db)
  const [, counted, removed] = await db.batch([
    db.prepare(ROLLUP_SQL[table]).bind(cutoff),
    count,
    db.prepare(`
      DELETE FROM ${table}
      WHERE id IN (
        SELECT id
        FROM ${table}
        WHERE ${timestampColumn} < ?1
        ORDER BY ${timestampColumn} ASC
        LIMIT ?2
      )
    `).bind(cutoff, batchLimit),
  ])
  const matched = Number((counted?.results?.[0] as { count?: number } | undefined)?.count ?? 0)
  const deleted = Number((removed?.meta as { changes?: number } | undefined)?.changes ?? 0)

  return {
    table,
    cutoff,
    matched,
    deleted,
    remainingAfterBatch: Math.max(0, matched - deleted),
  }
}

export async function runTelemetryRetentionForDatabase(
  db: D1Database,
  input: TelemetryRetentionInput = {},
): Promise<TelemetryRetentionResult> {
  const now = input.now ?? new Date()
  const telemetryRetentionDays = normalizePositiveInteger(
    input.telemetryRetentionDays,
    DEFAULT_TELEMETRY_RETENTION_DAYS,
    MAX_RETENTION_DAYS,
  )
  const governanceRetentionDays = normalizePositiveInteger(
    input.governanceRetentionDays,
    DEFAULT_GOVERNANCE_RETENTION_DAYS,
    MAX_RETENTION_DAYS,
  )
  const batchLimit = normalizePositiveInteger(input.batchLimit, DEFAULT_BATCH_LIMIT, MAX_BATCH_LIMIT)
  const dryRun = input.dryRun !== false
  const telemetryCutoff = resolveCutoff(now, telemetryRetentionDays)
  const governanceCutoff = resolveCutoff(now, governanceRetentionDays)

  const tables = [
    await cleanupTable(db, TELEMETRY_TABLE, 'created_at', telemetryCutoff, batchLimit, dryRun),
    await cleanupTable(db, GOVERNANCE_EVENTS_TABLE, 'occurred_at', governanceCutoff, batchLimit, dryRun),
  ]

  return {
    dryRun,
    generatedAt: now.toISOString(),
    telemetryRetentionDays,
    governanceRetentionDays,
    batchLimit,
    tables,
  }
}
