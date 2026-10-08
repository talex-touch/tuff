import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { runTelemetryRetentionForDatabase, type TelemetryRetentionResult } from './telemetryRetentionCore'
import { ensureMaintenanceState, MAINTENANCE_STATE_TABLE } from './maintenanceLease'

const RETENTION_MAINTENANCE_KEY = 'telemetry_retention'
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000
const BACKLOG_RETRY_INTERVAL_MS = 5 * 60 * 1000
const FAILURE_RETRY_INTERVAL_MS = 15 * 60 * 1000
const LOCK_TTL_MS = 15 * 60 * 1000
const LOCAL_CHECK_THROTTLE_MS = 60 * 1000

let nextLocalCheckAt = 0
let scheduledInRuntime = false

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

function getWaitUntil(event: H3Event | undefined): ((promise: Promise<unknown>) => void) | null {
  const context = event?.context as any
  const waitUntil = context?.waitUntil
    ?? context?.cloudflare?.context?.waitUntil
    ?? context?._platform?.cloudflare?.context?.waitUntil
  return typeof waitUntil === 'function' ? waitUntil.bind(context) : null
}

interface MaintenanceClaim {
  claimed: boolean
  nextRunAt: string | null
}

/**
 * One round trip per check: the claim, which also creates the state row the first time, and a read of
 * the row so a skipped check can still say when the next run is due. A check used to be four
 * statements one after another (create the table, seed the row, claim, read), about 12k a week.
 */
async function claimMaintenance(db: D1Database, now: Date): Promise<MaintenanceClaim> {
  const nowIso = now.toISOString()
  const lockExpiresAt = addMs(now, LOCK_TTL_MS)
  const [claim, state] = await db.batch([
    db.prepare(`
      INSERT INTO ${MAINTENANCE_STATE_TABLE} (key, status, last_checked_at, last_run_at, lock_expires_at, updated_at)
      VALUES (?3, 'running', ?1, ?1, ?2, ?1)
      ON CONFLICT(key) DO UPDATE SET
        status = 'running',
        last_checked_at = ?1,
        last_run_at = ?1,
        lock_expires_at = ?2,
        last_error = NULL,
        updated_at = ?1
      WHERE (status <> 'running' OR lock_expires_at IS NULL OR lock_expires_at <= ?1)
        AND (next_run_at IS NULL OR next_run_at <= ?1 OR lock_expires_at IS NOT NULL AND lock_expires_at <= ?1)
      RETURNING key
    `).bind(nowIso, lockExpiresAt, RETENTION_MAINTENANCE_KEY),
    db.prepare(`
      SELECT next_run_at
      FROM ${MAINTENANCE_STATE_TABLE}
      WHERE key = ?1
    `).bind(RETENTION_MAINTENANCE_KEY),
  ])
  const nextRunAt = (state?.results?.[0] as { next_run_at?: string | null } | undefined)?.next_run_at ?? null
  return { claimed: (claim?.results?.length ?? 0) > 0, nextRunAt }
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

const GOVERNANCE_RETENTION_FLOOR_DAYS = 14

/**
 * How long governance events are kept: 14 days, or the longest window an enabled provider quota or
 * storage policy counts over. Those windows default to 30 days, so a 14-day retention deleted the
 * older half of what a quota was meant to count.
 */
async function resolveGovernanceRetentionDays(db: D1Database): Promise<number> {
  let rows: Array<{ config_type: string, limits_json: string | null }> = []
  try {
    const { results } = await db.prepare(`
      SELECT config_type, limits_json
      FROM platform_governance_configs
      WHERE enabled = 1 AND config_type IN ('intelligence_provider_quota', 'storage_channel')
    `).all<{ config_type: string, limits_json: string | null }>()
    rows = results ?? []
  }
  catch {
    // No configs table yet: nothing counts over a window.
    return GOVERNANCE_RETENTION_FLOOR_DAYS
  }

  let days = GOVERNANCE_RETENTION_FLOOR_DAYS
  for (const row of rows) {
    let limits: Record<string, unknown> = {}
    try {
      limits = JSON.parse(row.limits_json || '{}') as Record<string, unknown>
    }
    catch {}
    // As the checks read it: the first of `windowDays` / `periodDays` that is a number; none means the
    // config type's default, and 0 means the 30 days the event filter falls back to.
    const declared = ['windowDays', 'periodDays']
      .map(key => limits[key])
      .find((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000_000)
    const windowDays = declared === undefined
      ? row.config_type === 'intelligence_provider_quota' ? 30 : 1
      : Math.floor(declared) || 30
    days = Math.max(days, Math.min(windowDays, 366))
  }
  return days
}

export async function runTelemetryRetentionMaintenanceIfDue(
  db: D1Database,
  options: { now?: Date } = {},
): Promise<TelemetryRetentionMaintenanceResult> {
  const now = options.now ?? new Date()
  await ensureMaintenanceState(db)

  const claim = await claimMaintenance(db, now)
  if (!claim.claimed) {
    return {
      status: 'skipped',
      reason: 'not_due_or_locked',
      nextRunAt: claim.nextRunAt ?? undefined,
    }
  }

  try {
    const result = await runTelemetryRetentionForDatabase(db, {
      telemetryRetentionDays: 7,
      governanceRetentionDays: await resolveGovernanceRetentionDays(db),
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
    .then((result) => {
      // Not due again until the lease says so (six hours after a run): checking every minute in
      // every isolate cost a round trip each time for nothing.
      const dueAt = result.nextRunAt ? Date.parse(result.nextRunAt) : Number.NaN
      if (Number.isFinite(dueAt))
        nextLocalCheckAt = Math.max(nextLocalCheckAt, dueAt)
    })
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
