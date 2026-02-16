import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'

const AUDITS_TABLE = 'admin_audits'

let adminAuditSchemaInitialized = false

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

async function ensureSchema(db: D1Database) {
  if (adminAuditSchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${AUDITS_TABLE} (
      id TEXT PRIMARY KEY,
      admin_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      target_label TEXT,
      metadata TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_audits_admin_id
    ON ${AUDITS_TABLE}(admin_user_id);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_audits_action
    ON ${AUDITS_TABLE}(action);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_audits_target
    ON ${AUDITS_TABLE}(target_type, target_id);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_audits_created_at
    ON ${AUDITS_TABLE}(created_at);
  `).run()

  adminAuditSchemaInitialized = true
}

function readRequestIp(event: H3Event): string | null {
  const header = event.node.req.headers
  const forwarded = header['x-forwarded-for']
  if (typeof forwarded === 'string')
    return forwarded.split(',')[0]?.trim() || null
  const cfConnecting = header['cf-connecting-ip']
  if (typeof cfConnecting === 'string')
    return cfConnecting
  return null
}

function readUserAgent(event: H3Event): string | null {
  const ua = event.node.req.headers['user-agent']
  return typeof ua === 'string' ? ua : null
}

export interface AdminAuditRecord {
  id: string
  adminUserId: string
  adminName: string | null
  adminEmail: string | null
  action: string
  targetType: string | null
  targetId: string | null
  targetLabel: string | null
  metadata: Record<string, any> | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}

export async function logAdminAudit(event: H3Event, input: {
  adminUserId: string
  action: string
  targetType?: string | null
  targetId?: string | null
  targetLabel?: string | null
  metadata?: Record<string, any> | null
}) {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureSchema(db)

  const now = new Date().toISOString()
  const metadata = input.metadata ? JSON.stringify(input.metadata) : null

  await db.prepare(`
    INSERT INTO ${AUDITS_TABLE} (
      id, admin_user_id, action, target_type, target_id, target_label,
      metadata, ip, user_agent, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10);
  `).bind(
    randomUUID(),
    input.adminUserId,
    input.action,
    input.targetType ?? null,
    input.targetId ?? null,
    input.targetLabel ?? null,
    metadata,
    readRequestIp(event),
    readUserAgent(event),
    now
  ).run()
}

export async function listAdminAudits(event: H3Event, options: {
  page: number
  limit: number
  search?: string
  action?: string
  targetType?: string
  adminUserId?: string
}) {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureSchema(db)

  const conditions: string[] = []
  const params: Array<string | number> = []

  const addParam = (value: string | number) => {
    params.push(value)
    return `?${params.length}`
  }

  if (options.action) {
    const actionParam = addParam(options.action)
    conditions.push(`a.action = ${actionParam}`)
  }

  if (options.targetType) {
    const targetParam = addParam(options.targetType)
    conditions.push(`a.target_type = ${targetParam}`)
  }

  if (options.adminUserId) {
    const adminParam = addParam(options.adminUserId)
    conditions.push(`a.admin_user_id = ${adminParam}`)
  }

  if (options.search) {
    const term = `%${options.search.toLowerCase()}%`
    const emailParam = addParam(term)
    const nameParam = addParam(term)
    const targetParam = addParam(term)
    conditions.push(`(LOWER(u.email) LIKE ${emailParam} OR LOWER(u.name) LIKE ${nameParam} OR LOWER(a.target_label) LIKE ${targetParam} OR LOWER(a.target_id) LIKE ${targetParam})`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countResult = await db.prepare(`
    SELECT COUNT(*) as count
    FROM ${AUDITS_TABLE} a
    LEFT JOIN auth_users u ON u.id = a.admin_user_id
    ${whereClause};
  `).bind(...params).first<{ count: number }>()

  const total = countResult?.count || 0
  const limitParam = `?${params.length + 1}`
  const offsetParam = `?${params.length + 2}`

  const { results } = await db.prepare(`
    SELECT
      a.id as id,
      a.admin_user_id as admin_user_id,
      u.name as admin_name,
      u.email as admin_email,
      a.action as action,
      a.target_type as target_type,
      a.target_id as target_id,
      a.target_label as target_label,
      a.metadata as metadata,
      a.ip as ip,
      a.user_agent as user_agent,
      a.created_at as created_at
    FROM ${AUDITS_TABLE} a
    LEFT JOIN auth_users u ON u.id = a.admin_user_id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `).bind(...params, options.limit, (options.page - 1) * options.limit).all<Record<string, any>>()

  const audits: AdminAuditRecord[] = (results ?? []).map(row => ({
    id: row.id,
    adminUserId: row.admin_user_id,
    adminName: row.admin_name ?? null,
    adminEmail: row.admin_email ?? null,
    action: row.action,
    targetType: row.target_type ?? null,
    targetId: row.target_id ?? null,
    targetLabel: row.target_label ?? null,
    metadata: row.metadata ? safeParseMetadata(row.metadata) : null,
    ip: row.ip ?? null,
    userAgent: row.user_agent ?? null,
    createdAt: row.created_at,
  }))

  return {
    audits,
    total,
  }
}

function safeParseMetadata(raw: string): Record<string, any> | null {
  try {
    return JSON.parse(raw)
  }
  catch {
    return null
  }
}
