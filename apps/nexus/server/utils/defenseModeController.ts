import type { D1Database } from '@cloudflare/workers-types'
import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCloudflareBindings } from './cloudflare'

const STATE_TABLE = 'admin_defense_mode_state'
const HISTORY_TABLE = 'admin_defense_mode_history'
const PRIMARY_STATE_ID = 'global'

export type DefenseMode = 'NORMAL' | 'ELEVATED' | 'EXTREME'

let schemaReady = false

function getDb(event: H3Event): D1Database | null {
  return readCloudflareBindings(event)?.DB ?? null
}

function requireDb(event: H3Event): D1Database {
  const db = getDb(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }
  return db
}

async function ensureSchema(db: D1Database) {
  if (schemaReady)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${STATE_TABLE} (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      updated_by TEXT,
      reason TEXT,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${HISTORY_TABLE} (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      updated_by TEXT,
      reason TEXT,
      created_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_defense_mode_history_created
    ON ${HISTORY_TABLE}(created_at);
  `).run()

  schemaReady = true
}

function resolveDefaultMode(event: H3Event): DefenseMode {
  const config = useRuntimeConfig(event)
  const rawMode = typeof config.adminControl?.defaultDefenseMode === 'string'
    ? config.adminControl.defaultDefenseMode.trim().toUpperCase()
    : 'NORMAL'
  if (rawMode === 'EXTREME' || rawMode === 'ELEVATED' || rawMode === 'NORMAL')
    return rawMode
  return 'NORMAL'
}

export async function ensureDefenseModeSchema(event: H3Event) {
  const db = requireDb(event)
  await ensureSchema(db)
}

export async function getCurrentDefenseMode(event: H3Event): Promise<DefenseMode> {
  const db = requireDb(event)
  await ensureSchema(db)
  const row = await db.prepare(`
    SELECT mode
    FROM ${STATE_TABLE}
    WHERE id = ?1
    LIMIT 1;
  `).bind(PRIMARY_STATE_ID).first<{ mode: string }>()

  const mode = (row?.mode || resolveDefaultMode(event)).toUpperCase()
  if (mode === 'EXTREME' || mode === 'ELEVATED' || mode === 'NORMAL')
    return mode
  return 'NORMAL'
}

export async function overrideDefenseMode(event: H3Event, input: {
  mode: DefenseMode
  actorId?: string | null
  reason?: string | null
}) {
  const db = requireDb(event)
  await ensureSchema(db)
  const now = new Date().toISOString()

  await db.prepare(`
    INSERT INTO ${STATE_TABLE} (id, mode, updated_by, reason, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(id) DO UPDATE SET
      mode = excluded.mode,
      updated_by = excluded.updated_by,
      reason = excluded.reason,
      updated_at = excluded.updated_at;
  `).bind(
    PRIMARY_STATE_ID,
    input.mode,
    input.actorId ?? null,
    input.reason ?? null,
    now,
  ).run()

  await db.prepare(`
    INSERT INTO ${HISTORY_TABLE} (id, mode, updated_by, reason, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5);
  `).bind(
    randomUUID(),
    input.mode,
    input.actorId ?? null,
    input.reason ?? null,
    now,
  ).run()
}

export async function isExtremeMode(event: H3Event): Promise<boolean> {
  return (await getCurrentDefenseMode(event)) === 'EXTREME'
}

export function isControlPlanePreservedPath(path: string): boolean {
  if (!path)
    return false
  return path.startsWith('/api/admin/emergency/')
    || path.startsWith('/api/admin/risk/')
    || path.startsWith('/api/admin/oob/risk/')
    || path.startsWith('/api/admin/telemetry/ip-blocks/unblock')
    || path.startsWith('/api/dashboard/intelligence/ip-bans')
}
