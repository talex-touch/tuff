import type { D1Database } from '@cloudflare/workers-types'
import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'

const TABLE_NAME = 'admin_dual_control_operations'

type DualControlStatus = 'pending' | 'confirmed' | 'rejected' | 'expired'

interface DualControlRow {
  id: string
  action: string
  payload_json: string
  payload_digest: string
  scope: string
  submitter_actor_id: string
  submitter_admin_id: string | null
  confirmer_actor_id: string | null
  confirmer_admin_id: string | null
  status: DualControlStatus
  expires_at: string
  created_at: string
  confirmed_at: string | null
  reason: string | null
}

export interface DualControlOperation {
  id: string
  action: string
  payloadJson: string
  payloadDigest: string
  scope: string
  submitterActorId: string
  submitterAdminId: string | null
  confirmerActorId: string | null
  confirmerAdminId: string | null
  status: DualControlStatus
  expiresAt: string
  createdAt: string
  confirmedAt: string | null
  reason: string | null
}

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
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      payload_digest TEXT NOT NULL,
      scope TEXT NOT NULL,
      submitter_actor_id TEXT NOT NULL,
      submitter_admin_id TEXT,
      confirmer_actor_id TEXT,
      confirmer_admin_id TEXT,
      status TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      confirmed_at TEXT,
      reason TEXT
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_dual_control_status_expires
    ON ${TABLE_NAME}(status, expires_at);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_dual_control_action_created
    ON ${TABLE_NAME}(action, created_at);
  `).run()

  schemaReady = true
}

function toOperation(row: DualControlRow | null): DualControlOperation | null {
  if (!row)
    return null
  return {
    id: row.id,
    action: row.action,
    payloadJson: row.payload_json,
    payloadDigest: row.payload_digest,
    scope: row.scope,
    submitterActorId: row.submitter_actor_id,
    submitterAdminId: row.submitter_admin_id ?? null,
    confirmerActorId: row.confirmer_actor_id ?? null,
    confirmerAdminId: row.confirmer_admin_id ?? null,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at ?? null,
    reason: row.reason ?? null,
  }
}

async function expireOldOperations(db: D1Database) {
  const now = new Date().toISOString()
  await db.prepare(`
    UPDATE ${TABLE_NAME}
    SET status = 'expired'
    WHERE status = 'pending'
      AND expires_at <= ?1;
  `).bind(now).run()
}

export async function createPendingDualControlOperation(event: H3Event, input: {
  action: string
  payloadJson: string
  payloadDigest: string
  scope: string
  submitterActorId: string
  submitterAdminId?: string | null
  ttlMs: number
}): Promise<DualControlOperation> {
  const db = requireDb(event)
  await ensureSchema(db)
  await expireOldOperations(db)
  const id = randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + input.ttlMs).toISOString()
  const createdAt = now.toISOString()

  await db.prepare(`
    INSERT INTO ${TABLE_NAME} (
      id, action, payload_json, payload_digest, scope,
      submitter_actor_id, submitter_admin_id, confirmer_actor_id, confirmer_admin_id,
      status, expires_at, created_at, confirmed_at, reason
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL, 'pending', ?8, ?9, NULL, NULL);
  `).bind(
    id,
    input.action,
    input.payloadJson,
    input.payloadDigest,
    input.scope,
    input.submitterActorId,
    input.submitterAdminId ?? null,
    expiresAt,
    createdAt,
  ).run()

  return {
    id,
    action: input.action,
    payloadJson: input.payloadJson,
    payloadDigest: input.payloadDigest,
    scope: input.scope,
    submitterActorId: input.submitterActorId,
    submitterAdminId: input.submitterAdminId ?? null,
    confirmerActorId: null,
    confirmerAdminId: null,
    status: 'pending',
    expiresAt,
    createdAt,
    confirmedAt: null,
    reason: null,
  }
}

export async function getDualControlOperation(event: H3Event, operationId: string): Promise<DualControlOperation | null> {
  const db = requireDb(event)
  await ensureSchema(db)
  await expireOldOperations(db)
  const row = await db.prepare(`
    SELECT *
    FROM ${TABLE_NAME}
    WHERE id = ?1
    LIMIT 1;
  `).bind(operationId).first<DualControlRow>()
  return toOperation(row ?? null)
}

export async function confirmDualControlOperation(event: H3Event, input: {
  operationId: string
  confirmerActorId: string
  confirmerAdminId?: string | null
  reason?: string | null
}): Promise<boolean> {
  const db = requireDb(event)
  await ensureSchema(db)
  await expireOldOperations(db)
  const now = new Date().toISOString()
  const result = await db.prepare(`
    UPDATE ${TABLE_NAME}
    SET status = 'confirmed',
        confirmer_actor_id = ?2,
        confirmer_admin_id = ?3,
        confirmed_at = ?4,
        reason = ?5
    WHERE id = ?1
      AND status = 'pending'
      AND expires_at > ?4;
  `).bind(
    input.operationId,
    input.confirmerActorId,
    input.confirmerAdminId ?? null,
    now,
    input.reason ?? null,
  ).run()
  return Number((result as any)?.meta?.changes ?? 0) === 1
}

export async function rejectDualControlOperation(event: H3Event, input: {
  operationId: string
  confirmerActorId: string
  confirmerAdminId?: string | null
  reason?: string | null
}): Promise<boolean> {
  const db = requireDb(event)
  await ensureSchema(db)
  await expireOldOperations(db)
  const now = new Date().toISOString()
  const result = await db.prepare(`
    UPDATE ${TABLE_NAME}
    SET status = 'rejected',
        confirmer_actor_id = ?2,
        confirmer_admin_id = ?3,
        confirmed_at = ?4,
        reason = ?5
    WHERE id = ?1
      AND status = 'pending'
      AND expires_at > ?4;
  `).bind(
    input.operationId,
    input.confirmerActorId,
    input.confirmerAdminId ?? null,
    now,
    input.reason ?? null,
  ).run()
  return Number((result as any)?.meta?.changes ?? 0) === 1
}

