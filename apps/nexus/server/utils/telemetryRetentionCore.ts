import type { D1Database } from '@cloudflare/workers-types'

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

async function ensureDailyStatsSchema(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DAILY_STATS_TABLE} (
      date TEXT NOT NULL,
      stat_type TEXT NOT NULL,
      stat_key TEXT NOT NULL DEFAULT '',
      value INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, stat_type, stat_key)
    );
  `).run()
}

async function countRows(db: D1Database, table: string, timestampColumn: string, cutoff: string): Promise<number> {
  const row = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM ${table}
    WHERE ${timestampColumn} < ?1;
  `).bind(cutoff).first<{ count?: number }>()
  return Number(row?.count ?? 0)
}

async function deleteRows(db: D1Database, table: string, timestampColumn: string, cutoff: string, limit: number): Promise<number> {
  const result = await db.prepare(`
    DELETE FROM ${table}
    WHERE id IN (
      SELECT id
      FROM ${table}
      WHERE ${timestampColumn} < ?1
      ORDER BY ${timestampColumn} ASC
      LIMIT ?2
    );
  `).bind(cutoff, limit).run()
  return Number((result.meta as { changes?: number } | undefined)?.changes ?? 0)
}

async function backfillTelemetryDailyStats(db: D1Database, cutoff: string) {
  await ensureDailyStatsSchema(db)
  await db.prepare(`
    INSERT INTO ${DAILY_STATS_TABLE} (date, stat_type, stat_key, value)
    SELECT substr(created_at, 1, 10), 'total_events', '', COUNT(*)
    FROM ${TELEMETRY_TABLE}
    WHERE created_at < ?1
    GROUP BY substr(created_at, 1, 10)
    ON CONFLICT(date, stat_type, stat_key) DO NOTHING;
  `).bind(cutoff).run()

  await db.prepare(`
    INSERT INTO ${DAILY_STATS_TABLE} (date, stat_type, stat_key, value)
    SELECT substr(created_at, 1, 10), 'events_by_type', event_type, COUNT(*)
    FROM ${TELEMETRY_TABLE}
    WHERE created_at < ?1
    GROUP BY substr(created_at, 1, 10), event_type
    ON CONFLICT(date, stat_type, stat_key) DO NOTHING;
  `).bind(cutoff).run()
}

async function cleanupTable(
  db: D1Database,
  table: RetentionTableResult['table'],
  timestampColumn: 'created_at' | 'occurred_at',
  cutoff: string,
  batchLimit: number,
  dryRun: boolean,
): Promise<RetentionTableResult> {
  const matched = await countRows(db, table, timestampColumn, cutoff)
  const deleted = dryRun || matched === 0
    ? 0
    : await deleteRows(db, table, timestampColumn, cutoff, batchLimit)
  const remainingAfterBatch = dryRun
    ? matched
    : Math.max(0, matched - deleted)

  return {
    table,
    cutoff,
    matched,
    deleted,
    remainingAfterBatch,
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

  if (!dryRun)
    await backfillTelemetryDailyStats(db, telemetryCutoff)

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
