import type { D1Database } from '@cloudflare/workers-types'
import { createHash, randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { recordTelemetryMessages } from './messageStore'

const AUDIT_TABLE = 'admin_breakglass_audit'

let schemaReady = false

export type AdminControlChannel = 'A' | 'B' | 'C'

interface BreakglassAuditRow {
  row_hash: string
}

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
    CREATE TABLE IF NOT EXISTS ${AUDIT_TABLE} (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      actor_admin_id TEXT,
      channel TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      scope TEXT,
      decision TEXT NOT NULL,
      evidence_ref TEXT,
      prev_hash TEXT,
      row_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_breakglass_audit_created
    ON ${AUDIT_TABLE}(created_at);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_breakglass_audit_actor_created
    ON ${AUDIT_TABLE}(actor_id, created_at);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_breakglass_audit_action_created
    ON ${AUDIT_TABLE}(action, created_at);
  `).run()

  schemaReady = true
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value)

  if (Array.isArray(value))
    return `[${value.map(stableSerialize).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function getLastHash(db: D1Database): Promise<string | null> {
  const row = await db.prepare(`
    SELECT row_hash
    FROM ${AUDIT_TABLE}
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 1;
  `).first<BreakglassAuditRow>()
  return row?.row_hash ?? null
}

async function maybeEmitAnchor(event: H3Event, latestHash: string) {
  const now = Date.now()
  const hourBucket = Math.floor(now / (60 * 60 * 1000))
  try {
    await recordTelemetryMessages(event, [{
      id: `admin-breakglass-anchor:${hourBucket}`,
      source: 'system',
      severity: 'info',
      title: 'Admin breakglass audit anchor',
      message: 'Latest admin breakglass audit hash anchor.',
      meta: {
        bucket: hourBucket,
        hash: latestHash,
      },
      status: 'unread',
      isAnonymous: false,
      createdAt: now,
    }])
  }
  catch {
    // noop
  }
}

export async function appendAdminBreakglassAudit(event: H3Event, input: {
  actorId: string
  actorAdminId?: string | null
  channel: AdminControlChannel
  action: string
  target?: string | null
  scope?: string | null
  decision: string
  evidenceRef?: string | null
}) {
  const db = requireDb(event)
  await ensureSchema(db)
  const createdAt = new Date().toISOString()
  const prevHash = await getLastHash(db)
  const id = randomUUID()

  const signedPayload = stableSerialize({
    id,
    actor_id: input.actorId,
    actor_admin_id: input.actorAdminId ?? null,
    channel: input.channel,
    action: input.action,
    target: input.target ?? null,
    scope: input.scope ?? null,
    decision: input.decision,
    evidence_ref: input.evidenceRef ?? null,
    prev_hash: prevHash,
    created_at: createdAt,
  })
  const rowHash = sha256Hex(signedPayload)

  await db.prepare(`
    INSERT INTO ${AUDIT_TABLE} (
      id, actor_id, actor_admin_id, channel, action, target, scope, decision,
      evidence_ref, prev_hash, row_hash, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12);
  `).bind(
    id,
    input.actorId,
    input.actorAdminId ?? null,
    input.channel,
    input.action,
    input.target ?? null,
    input.scope ?? null,
    input.decision,
    input.evidenceRef ?? null,
    prevHash,
    rowHash,
    createdAt,
  ).run()

  await maybeEmitAnchor(event, rowHash)
}

