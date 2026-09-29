import type { D1Database } from '@cloudflare/workers-types'
import {
  resolveIntelligencePromptTemplate,
  type IntelligencePromptBinding,
  type IntelligencePromptRecord,
} from '@talex-touch/tuff-intelligence/light'
import type { H3Event } from 'h3'
import crypto from 'uncrypto'
import { readCloudflareBindings } from './cloudflare'

const PROVIDER_REGISTRY_TABLE = 'provider_registry'
const AUDITS_TABLE = 'intelligence_audits'
const IP_BANS_TABLE = 'intelligence_ip_bans'
const PROMPT_REGISTRY_TABLE = 'intelligence_prompt_registry'
const PROMPT_BINDINGS_TABLE = 'intelligence_prompt_bindings'

let schemaInitialized = false

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

function requireDatabase(event: H3Event): D1Database {
  const db = getD1Database(event)
  if (!db) throw new Error('Cloudflare D1 database is not available.')
  return db
}

async function ensureSchema(db: D1Database) {
  if (schemaInitialized) return



  await db
    .prepare(
      `
    CREATE TABLE IF NOT EXISTS ${PROMPT_REGISTRY_TABLE} (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      version TEXT NOT NULL,
      template TEXT NOT NULL,
      name TEXT,
      description TEXT,
      variables_schema TEXT,
      scope TEXT NOT NULL,
      status TEXT NOT NULL,
      capability_id TEXT,
      provider_id TEXT,
      channel TEXT,
      tags TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, id, version)
    );
  `,
    )
    .run()

  await db
    .prepare(
      `
    CREATE INDEX IF NOT EXISTS idx_intelligence_prompt_registry_scope
    ON ${PROMPT_REGISTRY_TABLE}(user_id, scope, status, updated_at);
  `,
    )
    .run()

  await db
    .prepare(
      `
    CREATE TABLE IF NOT EXISTS ${PROMPT_BINDINGS_TABLE} (
      user_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      provider_id TEXT,
      prompt_id TEXT NOT NULL,
      prompt_version TEXT,
      channel TEXT,
      metadata TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, capability_id, provider_id)
    );
  `,
    )
    .run()

  await db
    .prepare(
      `
    CREATE INDEX IF NOT EXISTS idx_intelligence_prompt_bindings_prompt
    ON ${PROMPT_BINDINGS_TABLE}(user_id, prompt_id, prompt_version);
  `,
    )
    .run()

  await db
    .prepare(
      `
    CREATE TABLE IF NOT EXISTS ${AUDITS_TABLE} (
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
    );
  `,
    )
    .run()

  await db
    .prepare(
      `
    CREATE TABLE IF NOT EXISTS ${IP_BANS_TABLE} (
      id TEXT PRIMARY KEY,
      ip TEXT NOT NULL,
      reason TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `,
    )
    .run()

  await db
    .prepare(
      `
    CREATE INDEX IF NOT EXISTS idx_intelligence_audits_user_id
    ON ${AUDITS_TABLE}(user_id);
  `,
    )
    .run()

  await db
    .prepare(
      `
    CREATE INDEX IF NOT EXISTS idx_intelligence_audits_provider_id
    ON ${AUDITS_TABLE}(provider_id);
  `,
    )
    .run()

  await db
    .prepare(
      `
    CREATE INDEX IF NOT EXISTS idx_intelligence_audits_created_at
    ON ${AUDITS_TABLE}(created_at);
  `,
    )
    .run()

  await db
    .prepare(
      `
    CREATE INDEX IF NOT EXISTS idx_intelligence_ip_bans_ip
    ON ${IP_BANS_TABLE}(ip);
  `,
    )
    .run()

  try {
    await db.prepare(`ALTER TABLE ${AUDITS_TABLE} ADD COLUMN metadata TEXT;`).run()
  } catch {}

  schemaInitialized = true
}

// ---------- Types ----------



interface IntelligencePromptRecordRow {
  user_id: string
  id: string
  version: string
  template: string
  name: string | null
  description: string | null
  variables_schema: string | null
  scope: string
  status: string
  capability_id: string | null
  provider_id: string | null
  channel: string | null
  tags: string | null
  metadata: string | null
  created_at: string
  updated_at: string
}

interface IntelligencePromptBindingRow {
  user_id: string
  capability_id: string
  provider_id: string | null
  prompt_id: string
  prompt_version: string | null
  channel: string | null
  metadata: string | null
  updated_at: string
}

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


function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback
  }
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
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

function mapPromptRecordRow(row: IntelligencePromptRecordRow): IntelligencePromptRecord {
  return {
    id: row.id,
    version: row.version,
    template: row.template,
    name: row.name ?? undefined,
    description: row.description ?? undefined,
    variablesSchema: row.variables_schema ? safeParseJson(row.variables_schema, []) : undefined,
    scope: (row.scope as IntelligencePromptRecord['scope']) || 'global',
    status: (row.status as IntelligencePromptRecord['status']) || 'active',
    capabilityId: row.capability_id ?? undefined,
    providerId: row.provider_id ?? undefined,
    channel: (row.channel as IntelligencePromptRecord['channel']) ?? undefined,
    tags: row.tags ? safeParseJson(row.tags, []) : undefined,
    metadata: row.metadata ? safeParseJson(row.metadata, {}) : undefined,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : undefined,
  }
}

function mapPromptBindingRow(row: IntelligencePromptBindingRow): IntelligencePromptBinding {
  return {
    capabilityId: row.capability_id,
    providerId: row.provider_id ?? undefined,
    promptId: row.prompt_id,
    promptVersion: row.prompt_version ?? undefined,
    channel: (row.channel as IntelligencePromptBinding['channel']) ?? undefined,
    metadata: row.metadata ? safeParseJson(row.metadata, {}) : undefined,
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

export async function listRuntimeAudits(
  event: H3Event,
  options?: {
    days?: number
    limit?: number
  },
): Promise<IntelligenceAuditRecord[]> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const days = Math.min(Math.max(options?.days ?? 30, 1), 365)
  const limit = Math.min(Math.max(options?.limit ?? 1200, 1), 5000)
  const createdAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const currentSourceLike = '%"source":"intelligence-agent-runtime"%'
  const legacySourceLike = '%"source":"intelligence-lab-runtime"%'

  const { results } = await db
    .prepare(
      `
    SELECT a.*, p.name AS provider_name
    FROM ${AUDITS_TABLE} a
    LEFT JOIN ${PROVIDER_REGISTRY_TABLE} p ON a.provider_id = p.id
    WHERE a.created_at >= ?
      AND (a.metadata LIKE ? OR a.metadata LIKE ?)
    ORDER BY a.created_at DESC
    LIMIT ?
  `,
    )
    .bind(createdAfter, currentSourceLike, legacySourceLike, limit)
    .all<IntelligenceAuditRow>()

  return (results || []).map(mapAuditRow)
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


// ---------- Prompt Registry ----------

export async function listPromptRegistry(
  event: H3Event,
  userId: string,
  options?: {
    scope?: IntelligencePromptRecord['scope']
    capabilityId?: string
    providerId?: string
    status?: IntelligencePromptRecord['status']
    limit?: number
  },
): Promise<IntelligencePromptRecord[]> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const conditions = ['user_id = ?']
  const values: Array<string | number> = [userId]

  if (options?.scope) {
    conditions.push('scope = ?')
    values.push(options.scope)
  }
  if (options?.capabilityId) {
    conditions.push('capability_id = ?')
    values.push(options.capabilityId)
  }
  if (options?.providerId) {
    conditions.push('provider_id = ?')
    values.push(options.providerId)
  }
  if (options?.status) {
    conditions.push('status = ?')
    values.push(options.status)
  }

  const limit = Math.min(Math.max(options?.limit ?? 300, 1), 1000)
  const whereClause = conditions.join(' AND ')

  const { results } = await db
    .prepare(
      `
    SELECT *
    FROM ${PROMPT_REGISTRY_TABLE}
    WHERE ${whereClause}
    ORDER BY updated_at DESC
    LIMIT ?
  `,
    )
    .bind(...values, limit)
    .all<IntelligencePromptRecordRow>()

  return (results || []).map(mapPromptRecordRow)
}

export async function savePromptRecord(
  event: H3Event,
  userId: string,
  record: IntelligencePromptRecord,
): Promise<IntelligencePromptRecord> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const nowIso = new Date().toISOString()
  const createdAtIso = record.createdAt ? new Date(record.createdAt).toISOString() : nowIso
  const updatedAtIso = record.updatedAt ? new Date(record.updatedAt).toISOString() : nowIso

  await db
    .prepare(
      `
    INSERT INTO ${PROMPT_REGISTRY_TABLE}
      (user_id, id, version, template, name, description, variables_schema, scope, status, capability_id, provider_id, channel, tags, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, id, version) DO UPDATE SET
      template = excluded.template,
      name = excluded.name,
      description = excluded.description,
      variables_schema = excluded.variables_schema,
      scope = excluded.scope,
      status = excluded.status,
      capability_id = excluded.capability_id,
      provider_id = excluded.provider_id,
      channel = excluded.channel,
      tags = excluded.tags,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at
  `,
    )
    .bind(
      userId,
      record.id,
      record.version,
      record.template,
      record.name ?? null,
      record.description ?? null,
      record.variablesSchema ? JSON.stringify(record.variablesSchema) : null,
      record.scope,
      record.status,
      record.capabilityId ?? null,
      record.providerId ?? null,
      record.channel ?? null,
      record.tags ? JSON.stringify(record.tags) : null,
      record.metadata ? JSON.stringify(record.metadata) : null,
      createdAtIso,
      updatedAtIso,
    )
    .run()

  const rows = await listPromptRegistry(event, userId, {
    capabilityId: record.capabilityId,
    providerId: record.providerId,
    limit: 500,
  })
  return (
    rows.find(item => item.id === record.id && item.version === record.version) ?? {
      ...record,
      createdAt: new Date(createdAtIso).getTime(),
      updatedAt: new Date(updatedAtIso).getTime(),
    }
  )
}

export async function deletePromptRecord(
  event: H3Event,
  userId: string,
  promptId: string,
  version?: string,
): Promise<void> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  if (version) {
    await db
      .prepare(
        `
      DELETE FROM ${PROMPT_REGISTRY_TABLE}
      WHERE user_id = ? AND id = ? AND version = ?
    `,
      )
      .bind(userId, promptId, version)
      .run()
    return
  }

  await db
    .prepare(
      `
    DELETE FROM ${PROMPT_REGISTRY_TABLE}
    WHERE user_id = ? AND id = ?
  `,
    )
    .bind(userId, promptId)
    .run()
}

export async function listPromptBindings(
  event: H3Event,
  userId: string,
  options?: { capabilityId?: string },
): Promise<IntelligencePromptBinding[]> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const conditions = ['user_id = ?']
  const values: Array<string | number> = [userId]

  if (options?.capabilityId) {
    conditions.push('capability_id = ?')
    values.push(options.capabilityId)
  }

  const { results } = await db
    .prepare(
      `
    SELECT *
    FROM ${PROMPT_BINDINGS_TABLE}
    WHERE ${conditions.join(' AND ')}
    ORDER BY updated_at DESC
  `,
    )
    .bind(...values)
    .all<IntelligencePromptBindingRow>()

  return (results || []).map(mapPromptBindingRow)
}

export async function savePromptBinding(
  event: H3Event,
  userId: string,
  binding: IntelligencePromptBinding,
): Promise<IntelligencePromptBinding> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const nowIso = new Date().toISOString()
  await db
    .prepare(
      `
    INSERT INTO ${PROMPT_BINDINGS_TABLE}
      (user_id, capability_id, provider_id, prompt_id, prompt_version, channel, metadata, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, capability_id, provider_id) DO UPDATE SET
      prompt_id = excluded.prompt_id,
      prompt_version = excluded.prompt_version,
      channel = excluded.channel,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at
  `,
    )
    .bind(
      userId,
      binding.capabilityId,
      binding.providerId ?? null,
      binding.promptId,
      binding.promptVersion ?? null,
      binding.channel ?? null,
      binding.metadata ? JSON.stringify(binding.metadata) : null,
      nowIso,
    )
    .run()

  return binding
}

export async function deletePromptBinding(
  event: H3Event,
  userId: string,
  capabilityId: string,
  providerId?: string,
): Promise<void> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  if (providerId) {
    await db
      .prepare(
        `
      DELETE FROM ${PROMPT_BINDINGS_TABLE}
      WHERE user_id = ? AND capability_id = ? AND provider_id = ?
    `,
      )
      .bind(userId, capabilityId, providerId)
      .run()
    return
  }

  await db
    .prepare(
      `
    DELETE FROM ${PROMPT_BINDINGS_TABLE}
    WHERE user_id = ? AND capability_id = ?
  `,
    )
    .bind(userId, capabilityId)
    .run()
}

export async function resolveCapabilityPromptTemplate(
  event: H3Event,
  userId: string,
  capabilityId: string,
  providerId?: string,
): Promise<string | null> {
  const [bindings, records] = await Promise.all([
    listPromptBindings(event, userId, { capabilityId }),
    listPromptRegistry(event, userId, {
      capabilityId,
      status: 'active',
      limit: 1000,
    }),
  ])

  return (
    resolveIntelligencePromptTemplate({
      capabilityId,
      providerId,
      promptBindings: bindings,
      promptRegistry: records,
    }) ?? null
  )
}
