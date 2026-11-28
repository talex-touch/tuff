import type { D1Database } from '@cloudflare/workers-types'
import { defineD1Schema, ensureD1Schema } from './d1Schema'

/**
 * Leases for maintenance that ordinary traffic triggers. A Pages Worker has no cron, so a request
 * schedules the work; the lease row makes one isolate run it instead of every isolate that sees
 * traffic.
 */
export const MAINTENANCE_STATE_TABLE = 'nexus_maintenance_state'

/**
 * The table the leases live on. It used to be created, and the retention lease's row seeded, on every
 * maintenance check — 13,036 `CREATE TABLE`s in a week of production. A claim creates its row now.
 */
const MAINTENANCE_STATE_SCHEMA = defineD1Schema('maintenance-state', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${MAINTENANCE_STATE_TABLE} (
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
      )`,
  ],
})

export async function ensureMaintenanceState(db: D1Database): Promise<void> {
  await ensureD1Schema(db, MAINTENANCE_STATE_SCHEMA)
}

export interface MaintenanceClaim {
  claimed: boolean
  /** When the next run is due, as the lease stands after this claim; null for a lease never claimed. */
  nextRunAt: string | null
}

/**
 * Claims the run of `key` that is due at `now`, for work that is safe to repeat and needs no lock:
 * one claimant gets it, and the next claim succeeds `intervalMs` later. One round trip, which writes
 * nothing for a claim that does not win and says when the next run is due either way, so a caller
 * can stay away until then (the scheduled maintenance Worker holds a lease far ahead).
 */
export async function claimMaintenanceRun(db: D1Database, key: string, now: Date, intervalMs: number): Promise<MaintenanceClaim> {
  await ensureMaintenanceState(db)
  const nowIso = now.toISOString()
  const [claim, state] = await db.batch([
    db.prepare(`
      INSERT INTO ${MAINTENANCE_STATE_TABLE} (key, status, last_checked_at, last_run_at, next_run_at, updated_at)
      VALUES (?1, 'claimed', ?2, ?2, ?3, ?2)
      ON CONFLICT(key) DO UPDATE SET
        status = 'claimed',
        last_checked_at = ?2,
        last_run_at = ?2,
        next_run_at = ?3,
        updated_at = ?2
      WHERE next_run_at IS NULL OR next_run_at <= ?2
      RETURNING key
    `).bind(key, nowIso, new Date(now.getTime() + intervalMs).toISOString()),
    db.prepare(`SELECT next_run_at FROM ${MAINTENANCE_STATE_TABLE} WHERE key = ?1`).bind(key),
  ])
  return {
    claimed: (claim?.results?.length ?? 0) > 0,
    nextRunAt: ((state?.results?.[0] as { next_run_at?: string | null } | undefined)?.next_run_at) ?? null,
  }
}

/**
 * Takes the run of `key` now, whatever the lease says, and keeps it for `holdMs`: the scheduled
 * maintenance Worker does the work on its own clock and keeps the traffic-triggered fallback away for
 * longer than its own period. Should it stop, the lease lapses and that fallback resumes.
 */
export async function holdMaintenanceRun(db: D1Database, key: string, now: Date, holdMs: number): Promise<void> {
  await ensureMaintenanceState(db)
  const nowIso = now.toISOString()
  await db.prepare(`
    INSERT INTO ${MAINTENANCE_STATE_TABLE} (key, status, last_checked_at, last_run_at, next_run_at, updated_at)
    VALUES (?1, 'scheduled', ?2, ?2, ?3, ?2)
    ON CONFLICT(key) DO UPDATE SET
      status = 'scheduled',
      last_checked_at = ?2,
      last_run_at = ?2,
      next_run_at = ?3,
      updated_at = ?2
  `).bind(key, nowIso, new Date(now.getTime() + holdMs).toISOString()).run()
}
