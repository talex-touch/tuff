import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { runTelemetryRetentionForDatabase, type TelemetryRetentionResult } from './telemetryRetentionCore'

const MAINTENANCE_STATE_TABLE = 'nexus_maintenance_state'
const RETENTION_MAINTENANCE_KEY = 'telemetry_retention'
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000
const BACKLOG_RETRY_INTERVAL_MS = 5 * 60 * 1000
const FAILURE_RETRY_INTERVAL_MS = 15 * 60 * 1000
const LOCK_TTL_MS = 15 * 60 * 1000
const LOCAL_CHECK_THROTTLE_MS = 60 * 1000

let nextLocalCheckAt = 0
let scheduledInRuntime = false

interface MaintenanceStateRow {
  key: string
  status: string
  next_run_at: string | null
  lock_expires_at: string | null
}

export interface TelemetryRetentionMaintenanceResult {
  status: 'completed' | 'skipped' | 'failed'
  reason?: 'not_due_or_locked'
  result?: TelemetryRetentionResult
  nextRunAt?: string
  error?: string
}

function addMs(now: Date, ms: number): string {
  return new Date(now.getTime() + ms).toISOString()
}

function hasBacklog(result: TelemetryRetentionResult): boolean {
  return result.tables.some(table => table.remainingAfterBatch > 0)
}

function readChanges(result: unknown): number {
  return Number((result as { meta?: { changes?: number } } | undefined)?.meta?.changes ?? 0)
}

function getWaitUntil(event: H3Event | undefined): ((promise: Promise<unknown>) => void) | null {
  const context = event?.context as any
  const waitUntil = context?.waitUntil
    ?? context?.cloudflare?.context?.waitUntil
    ?? context?._platform?.cloudflare?.context?.waitUntil
  return typeof waitUntil === 'function' ? waitUntil.bind(context) : null
}

async function ensureMaintenanceState(db: D1Database, now: Date) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${MAINTENANCE_STATE_TABLE} (
      key TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      last_checked_at TEXT,
      last_run_at TEXT,
      last_success_at TEXT,
      next_run_at TEXT,
      lock_expires_at TEXT,
      last_result_json TEXT,
      last_error TEXT,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    INSERT INTO ${MAINTENANCE_STATE_TABLE} (key, status, next_run_at, updated_at)
    VALUES (?1, 'idle', ?2, ?3)
    ON CONFLICT(key) DO NOTHING;
  `).bind(RETENTION_MAINTENANCE_KEY, '1970-01-01T00:00:00.000Z', now.toISOString()).run()
}

async function readMaintenanceState(db: D1Database): Promise<MaintenanceStateRow | null> {
  return await db.prepare(`
    SELECT key, status, next_run_at, lock_expires_at
    FROM ${MAINTENANCE_STATE_TABLE}
    WHERE key = ?1;
  `).bind(RETENTION_MAINTENANCE_KEY).first<MaintenanceStateRow>()
}

async function claimMaintenance(db: D1Database, now: Date): Promise<boolean> {
  const nowIso = now.toISOString()
  const lockExpiresAt = addMs(now, LOCK_TTL_MS)
  const result = await db.prepare(`
    UPDATE ${MAINTENANCE_STATE_TABLE}
    SET status = 'running',
      last_checked_at = ?1,
      last_run_at = ?1,
      lock_expires_at = ?2,
      last_error = NULL,
      updated_at = ?1
    WHERE key = ?3
      AND (status <> 'running' OR lock_expires_at IS NULL OR lock_expires_at <= ?1)
      AND (next_run_at IS NULL OR next_run_at <= ?1 OR lock_expires_at IS NOT NULL AND lock_expires_at <= ?1);
  `).bind(nowIso, lockExpiresAt, RETENTION_MAINTENANCE_KEY).run()
  return readChanges(result) > 0
}

async function completeMaintenance(db: D1Database, now: Date, result: TelemetryRetentionResult) {
  const nowIso = now.toISOString()
  const nextRunAt = addMs(now, hasBacklog(result) ? BACKLOG_RETRY_INTERVAL_MS : DEFAULT_INTERVAL_MS)
  await db.prepare(`
    UPDATE ${MAINTENANCE_STATE_TABLE}
    SET status = 'succeeded',
      last_success_at = ?1,
      next_run_at = ?2,
      lock_expires_at = NULL,
      last_result_json = ?3,
      last_error = NULL,
      updated_at = ?1
    WHERE key = ?4;
  `).bind(nowIso, nextRunAt, JSON.stringify(result), RETENTION_MAINTENANCE_KEY).run()
  return nextRunAt
}

async function failMaintenance(db: D1Database, now: Date, error: unknown) {
  const nowIso = now.toISOString()
  const nextRunAt = addMs(now, FAILURE_RETRY_INTERVAL_MS)
  const message = error instanceof Error ? error.message : String(error)
  await db.prepare(`
    UPDATE ${MAINTENANCE_STATE_TABLE}
    SET status = 'failed',
      next_run_at = ?1,
      lock_expires_at = NULL,
      last_error = ?2,
      updated_at = ?3
    WHERE key = ?4;
  `).bind(nextRunAt, message.slice(0, 500), nowIso, RETENTION_MAINTENANCE_KEY).run()
  return { nextRunAt, message }
}

export async function runTelemetryRetentionMaintenanceIfDue(
  db: D1Database,
  options: { now?: Date } = {},
): Promise<TelemetryRetentionMaintenanceResult> {
  const now = options.now ?? new Date()
  await ensureMaintenanceState(db, now)

  const claimed = await claimMaintenance(db, now)
  if (!claimed) {
    const state = await readMaintenanceState(db)
    return {
      status: 'skipped',
      reason: 'not_due_or_locked',
      nextRunAt: state?.next_run_at ?? undefined,
    }
  }

  try {
    const result = await runTelemetryRetentionForDatabase(db, {
      telemetryRetentionDays: 7,
      governanceRetentionDays: 14,
      batchLimit: 10000,
      dryRun: false,
      now,
    })
    const nextRunAt = await completeMaintenance(db, now, result)
    return { status: 'completed', result, nextRunAt }
  }
  catch (error) {
    const failed = await failMaintenance(db, now, error)
    console.error('[telemetry-retention] upload-triggered maintenance failed', error)
    return { status: 'failed', nextRunAt: failed.nextRunAt, error: failed.message }
  }
}

export function scheduleTelemetryRetentionMaintenance(event: H3Event | undefined, db: D1Database) {
  const nowMs = Date.now()
  if (scheduledInRuntime || nowMs < nextLocalCheckAt)
    return

  scheduledInRuntime = true
  nextLocalCheckAt = nowMs + LOCAL_CHECK_THROTTLE_MS

  const promise = runTelemetryRetentionMaintenanceIfDue(db)
    .catch((error) => {
      console.error('[telemetry-retention] upload-triggered maintenance scheduling failed', error)
    })
    .finally(() => {
      scheduledInRuntime = false
    })

  const waitUntil = getWaitUntil(event)
  if (waitUntil) {
    waitUntil(promise)
    return
  }

  void promise
}
