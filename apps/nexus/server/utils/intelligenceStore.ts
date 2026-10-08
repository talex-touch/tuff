import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import crypto from 'uncrypto'
import { readCloudflareBindings } from './cloudflare'
import { defineD1Schema, ensureD1Schema } from './d1Schema'

const PROVIDER_REGISTRY_TABLE = 'provider_registry'
const AUDITS_TABLE = 'intelligence_audits'
const IP_BANS_TABLE = 'intelligence_ip_bans'

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

function requireDatabase(event: H3Event): D1Database {
  const db = getD1Database(event)
  if (!db) throw new Error('Cloudflare D1 database is not available.')
  return db
}

const INTELLIGENCE_SCHEMA = defineD1Schema('intelligence', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${AUDITS_TABLE} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        provider_type TEXT NOT NULL,
        model TEXT NOT NULL,
        endpoint TEXT,
        status INTEGER,
        latency INTEGER,
        success INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        trace_id TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL
      )`,
    `CREATE TABLE IF NOT EXISTS ${IP_BANS_TABLE} (
        id TEXT PRIMARY KEY,
        ip TEXT NOT NULL,
        reason TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_audits_user_id
      ON ${AUDITS_TABLE}(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_audits_provider_id
      ON ${AUDITS_TABLE}(provider_id)`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_audits_created_at
      ON ${AUDITS_TABLE}(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_ip_bans_ip
      ON ${IP_BANS_TABLE}(ip)`,
  ],
  columns: [
    {
      table: AUDITS_TABLE,
      columns: [
        { name: 'metadata', ddl: 'metadata TEXT' },
      ],
    },
  ],
})

async function ensureSchema(db: D1Database) {
  await ensureD1Schema(db, INTELLIGENCE_SCHEMA)
}

// ---------- Types ----------

export interface IntelligenceAuditRow {
  id: string
  user_id: string
  provider_id: string
  provider_type: string
  model: string
  endpoint: string | null
  status: number | null
  latency: number | null
  success: number
  error_message: string | null
  trace_id: string | null
  metadata: string | null
  created_at: string
  provider_name?: string | null
}

export interface IntelligenceAuditRecord {
  id: string
  userId: string
  providerId: string
  providerType: string
  providerName: string | null
  model: string
  endpoint: string | null
  status: number | null
  latency: number | null
  success: boolean
  errorMessage: string | null
  traceId: string | null
  metadata: Record<string, any> | null
  createdAt: string
}

function mapAuditRow(row: IntelligenceAuditRow): IntelligenceAuditRecord {
  let metadata: Record<string, any> | null = null
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata)
    } catch {
      metadata = null
    }
  }
  return {
    id: row.id,
    userId: row.user_id,
    providerId: row.provider_id,
    providerType: row.provider_type,
    providerName: row.provider_name ?? null,
    model: row.model,
    endpoint: row.endpoint,
    status: typeof row.status === 'number' ? row.status : null,
    latency: typeof row.latency === 'number' ? row.latency : null,
    success: row.success === 1,
    errorMessage: row.error_message,
    traceId: row.trace_id,
    metadata,
    createdAt: row.created_at,
  }
}

function normalizeAuditMetadata(value?: Record<string, any> | null): string | null {
  if (!value) return null
  try {
    const json = JSON.stringify(value)
    return json.length > 2000 ? json.slice(0, 2000) : json
  } catch {
    return null
  }
}


// ---------- Audit logs ----------

export async function createAudit(
  event: H3Event,
  data: {
    userId: string
    providerId: string
    providerType: string
    model: string
    endpoint?: string | null
    status?: number | null
    latency?: number | null
    success: boolean
    errorMessage?: string | null
    traceId?: string | null
    metadata?: Record<string, any> | null
  },
): Promise<void> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  const id = `ia_${Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')}`
  const now = new Date().toISOString()

  const metadata = normalizeAuditMetadata(data.metadata)

  await db
    .prepare(
      `
    INSERT INTO ${AUDITS_TABLE}
      (id, user_id, provider_id, provider_type, model, endpoint, status, latency, success, error_message, trace_id, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .bind(
      id,
      data.userId,
      data.providerId,
      data.providerType,
      data.model,
      data.endpoint || null,
      data.status ?? null,
      data.latency ?? null,
      data.success ? 1 : 0,
      data.errorMessage ? data.errorMessage.slice(0, 600) : null,
      data.traceId ?? null,
      metadata,
      now,
    )
    .run()
}

export async function listAudits(
  event: H3Event,
  options?: {
    limit?: number
    offset?: number
    providerId?: string | null
    userId?: string | null
  },
): Promise<{ audits: IntelligenceAuditRecord[]; total: number }> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200)
  const offset = Math.max(options?.offset ?? 0, 0)
  const conditions: string[] = []
  const values: any[] = []

  if (options?.userId) {
    conditions.push('a.user_id = ?')
    values.push(options.userId)
  }

  if (options?.providerId) {
    conditions.push('a.provider_id = ?')
    values.push(options.providerId)
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const totalRow = await db
    .prepare(
      `
    SELECT COUNT(1) AS total
    FROM ${AUDITS_TABLE} a
    ${whereClause}
  `,
    )
    .bind(...values)
    .first<{ total?: number }>()

  const total = Number(totalRow?.total ?? 0)

  const { results } = await db
    .prepare(
      `
    SELECT a.*, p.name AS provider_name
    FROM ${AUDITS_TABLE} a
    LEFT JOIN ${PROVIDER_REGISTRY_TABLE} p ON a.provider_id = p.id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `,
    )
    .bind(...values, limit, offset)
    .all<IntelligenceAuditRow>()

  return {
    audits: (results || []).map(mapAuditRow),
    total,
  }
}

export interface IntelligenceIpBanRecord {
  id: string
  ip: string
  reason: string | null
  enabled: boolean
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export async function listIpBans(event: H3Event, options?: { limit?: number }): Promise<IntelligenceIpBanRecord[]> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200)
  const { results } = await db
    .prepare(
      `
    SELECT * FROM ${IP_BANS_TABLE}
    ORDER BY created_at DESC
    LIMIT ?
  `,
    )
    .bind(limit)
    .all<{ [key: string]: any }>()

  return (results || []).map(row => ({
    id: row.id,
    ip: row.ip,
    reason: row.reason ?? null,
    enabled: row.enabled === 1,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export async function upsertIpBan(
  event: H3Event,
  data: { ip: string; reason?: string | null; enabled?: boolean; expiresAt?: string | null },
): Promise<IntelligenceIpBanRecord> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const now = new Date().toISOString()
  const normalizedIp = data.ip.trim()
  const existing = await db
    .prepare(
      `
    SELECT * FROM ${IP_BANS_TABLE}
    WHERE ip = ?
    LIMIT 1
  `,
    )
    .bind(normalizedIp)
    .first<{ [key: string]: any }>()

  if (existing?.id) {
    await db
      .prepare(
        `
      UPDATE ${IP_BANS_TABLE}
      SET reason = ?, enabled = ?, expires_at = ?, updated_at = ?
      WHERE id = ?
    `,
      )
      .bind(
        data.reason ?? existing.reason ?? null,
        data.enabled === false ? 0 : 1,
        data.expiresAt ?? existing.expires_at ?? null,
        now,
        existing.id,
      )
      .run()

    return {
      id: existing.id,
      ip: normalizedIp,
      reason: data.reason ?? existing.reason ?? null,
      enabled: data.enabled !== false,
      expiresAt: data.expiresAt ?? existing.expires_at ?? null,
      createdAt: existing.created_at,
      updatedAt: now,
    }
  }

  const id = `ipb_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
  await db
    .prepare(
      `
    INSERT INTO ${IP_BANS_TABLE} (id, ip, reason, enabled, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .bind(id, normalizedIp, data.reason ?? null, data.enabled === false ? 0 : 1, data.expiresAt ?? null, now, now)
    .run()

  return {
    id,
    ip: normalizedIp,
    reason: data.reason ?? null,
    enabled: data.enabled !== false,
    expiresAt: data.expiresAt ?? null,
    createdAt: now,
    updatedAt: now,
  }
}

export async function setIpBanEnabled(event: H3Event, id: string, enabled: boolean): Promise<void> {
  const db = requireDatabase(event)
  await ensureSchema(db)
  const now = new Date().toISOString()
  await db
    .prepare(
      `
    UPDATE ${IP_BANS_TABLE}
    SET enabled = ?, updated_at = ?
    WHERE id = ?
  `,
    )
    .bind(enabled ? 1 : 0, now, id)
    .run()
}

export async function deleteIpBan(event: H3Event, id: string): Promise<void> {
  const db = requireDatabase(event)
  await ensureSchema(db)
  await db
    .prepare(
      `
    DELETE FROM ${IP_BANS_TABLE}
    WHERE id = ?
  `,
    )
    .bind(id)
    .run()
}

export async function isIpBanned(event: H3Event, ip: string): Promise<boolean> {
  const db = requireDatabase(event)
  await ensureSchema(db)
  const now = new Date().toISOString()
  const row = await db
    .prepare(
      `
    SELECT id FROM ${IP_BANS_TABLE}
    WHERE ip = ?
      AND enabled = 1
      AND (expires_at IS NULL OR expires_at > ?)
    LIMIT 1
  `,
    )
    .bind(ip, now)
    .first<{ id?: string }>()
  return Boolean(row?.id)
}
