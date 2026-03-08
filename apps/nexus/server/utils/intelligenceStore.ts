import type { D1Database } from '@cloudflare/workers-types'
import type {
  IntelligencePromptBinding,
  IntelligencePromptRecord,
} from '@talex-touch/tuff-intelligence'
import type { H3Event } from 'h3'
import crypto from 'uncrypto'
import { readCloudflareBindings } from './cloudflare'

const PROVIDERS_TABLE = 'intelligence_providers'
const SETTINGS_TABLE = 'intelligence_settings'
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
  if (!db)
    throw new Error('Cloudflare D1 database is not available.')
  return db
}

async function ensureSchema(db: D1Database) {
  if (schemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${PROVIDERS_TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      api_key_encrypted TEXT,
      base_url TEXT,
      models TEXT,
      default_model TEXT,
      instructions TEXT,
      timeout INTEGER DEFAULT 30000,
      priority INTEGER DEFAULT 1,
      rate_limit TEXT,
      capabilities TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_intelligence_providers_user_id
    ON ${PROVIDERS_TABLE}(user_id);
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${SETTINGS_TABLE} (
      user_id TEXT PRIMARY KEY,
      default_strategy TEXT NOT NULL DEFAULT 'adaptive-default',
      enable_audit INTEGER NOT NULL DEFAULT 0,
      enable_cache INTEGER NOT NULL DEFAULT 1,
      cache_expiration INTEGER DEFAULT 3600,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
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
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_intelligence_prompt_registry_scope
    ON ${PROMPT_REGISTRY_TABLE}(user_id, scope, status, updated_at);
  `).run()

  await db.prepare(`
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
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_intelligence_prompt_bindings_prompt
    ON ${PROMPT_BINDINGS_TABLE}(user_id, prompt_id, prompt_version);
  `).run()

  await db.prepare(`
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
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${IP_BANS_TABLE} (
      id TEXT PRIMARY KEY,
      ip TEXT NOT NULL,
      reason TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_intelligence_audits_user_id
    ON ${AUDITS_TABLE}(user_id);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_intelligence_audits_provider_id
    ON ${AUDITS_TABLE}(provider_id);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_intelligence_audits_created_at
    ON ${AUDITS_TABLE}(created_at);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_intelligence_ip_bans_ip
    ON ${IP_BANS_TABLE}(ip);
  `).run()

  try {
    await db.prepare(`ALTER TABLE ${AUDITS_TABLE} ADD COLUMN metadata TEXT;`).run()
  } catch {}

  schemaInitialized = true
}

// ---------- Types ----------

export interface IntelligenceProviderRow {
  id: string
  user_id: string
  type: string
  name: string
  enabled: number
  api_key_encrypted: string | null
  base_url: string | null
  models: string | null
  default_model: string | null
  instructions: string | null
  timeout: number
  priority: number
  rate_limit: string | null
  capabilities: string | null
  metadata: string | null
  created_at: string
  updated_at: string
}

export interface IntelligenceProviderRecord {
  id: string
  userId: string
  type: string
  name: string
  enabled: boolean
  hasApiKey: boolean
  baseUrl: string | null
  models: string[]
  defaultModel: string | null
  instructions: string | null
  timeout: number
  priority: number
  rateLimit: Record<string, number> | null
  capabilities: string[] | null
  metadata: Record<string, any> | null
  createdAt: string
  updatedAt: string
}

export interface IntelligenceSettingsRecord {
  userId: string
  defaultStrategy: string
  enableAudit: boolean
  enableCache: boolean
  cacheExpiration: number
  updatedAt: string
}

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

// ---------- Mapping ----------

function mapProviderRow(row: IntelligenceProviderRow): IntelligenceProviderRecord {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    name: row.name,
    enabled: row.enabled === 1,
    hasApiKey: Boolean(row.api_key_encrypted),
    baseUrl: row.base_url,
    models: row.models ? JSON.parse(row.models) : [],
    defaultModel: row.default_model,
    instructions: row.instructions,
    timeout: row.timeout,
    priority: row.priority,
    rateLimit: row.rate_limit ? JSON.parse(row.rate_limit) : null,
    capabilities: row.capabilities ? JSON.parse(row.capabilities) : null,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
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
    variablesSchema: row.variables_schema
      ? safeParseJson(row.variables_schema, [])
      : undefined,
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
  if (!value)
    return null
  try {
    const json = JSON.stringify(value)
    return json.length > 2000 ? json.slice(0, 2000) : json
  } catch {
    return null
  }
}

// ---------- Simple encryption for API keys ----------

function getEncryptionKey(): string {
  return process.env.NUXT_INTELLIGENCE_ENCRYPT_KEY || 'tuff-intelligence-default-key-change-me'
}

function encryptApiKey(apiKey: string): string {
  const key = getEncryptionKey()
  const bytes = new TextEncoder().encode(apiKey)
  const keyBytes = new TextEncoder().encode(key)
  const keyLength = keyBytes.length || 1
  const encrypted = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    const keyByte = keyBytes[i % keyLength] ?? 0
    const plainByte = bytes[i] ?? 0
    encrypted[i] = plainByte ^ keyByte
  }
  return btoa(String.fromCharCode(...encrypted))
}

function decryptApiKey(encrypted: string): string {
  const key = getEncryptionKey()
  const bytes = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))
  const keyBytes = new TextEncoder().encode(key)
  const keyLength = keyBytes.length || 1
  const decrypted = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    const keyByte = keyBytes[i % keyLength] ?? 0
    const cipherByte = bytes[i] ?? 0
    decrypted[i] = cipherByte ^ keyByte
  }
  return new TextDecoder().decode(decrypted)
}

// ---------- Provider CRUD ----------

export async function listProviders(event: H3Event, userId: string): Promise<IntelligenceProviderRecord[]> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const { results } = await db.prepare(
    `SELECT * FROM ${PROVIDERS_TABLE} WHERE user_id = ? ORDER BY priority ASC, created_at ASC`,
  ).bind(userId).all<IntelligenceProviderRow>()

  return (results || []).map(mapProviderRow)
}

export async function getProvider(event: H3Event, userId: string, providerId: string): Promise<IntelligenceProviderRecord | null> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const row = await db.prepare(
    `SELECT * FROM ${PROVIDERS_TABLE} WHERE id = ? AND user_id = ?`,
  ).bind(providerId, userId).first<IntelligenceProviderRow>()

  return row ? mapProviderRow(row) : null
}

export async function createProvider(
  event: H3Event,
  userId: string,
  data: {
    type: string
    name: string
    enabled?: boolean
    apiKey?: string
    baseUrl?: string
    models?: string[]
    defaultModel?: string
    instructions?: string
    timeout?: number
    priority?: number
    rateLimit?: Record<string, number>
    capabilities?: string[]
    metadata?: Record<string, any>
  },
): Promise<IntelligenceProviderRecord> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const id = `ip_${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`
  const now = new Date().toISOString()

  await db.prepare(`
    INSERT INTO ${PROVIDERS_TABLE}
      (id, user_id, type, name, enabled, api_key_encrypted, base_url, models, default_model, instructions, timeout, priority, rate_limit, capabilities, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    userId,
    data.type,
    data.name,
    data.enabled ? 1 : 0,
    data.apiKey ? encryptApiKey(data.apiKey) : null,
    data.baseUrl || null,
    data.models ? JSON.stringify(data.models) : null,
    data.defaultModel || null,
    data.instructions || null,
    data.timeout ?? 30000,
    data.priority ?? 1,
    data.rateLimit ? JSON.stringify(data.rateLimit) : null,
    data.capabilities ? JSON.stringify(data.capabilities) : null,
    data.metadata ? JSON.stringify(data.metadata) : null,
    now,
    now,
  ).run()

  return (await getProvider(event, userId, id))!
}

export async function updateProvider(
  event: H3Event,
  userId: string,
  providerId: string,
  data: {
    name?: string
    enabled?: boolean
    apiKey?: string | null
    baseUrl?: string | null
    models?: string[]
    defaultModel?: string | null
    instructions?: string | null
    timeout?: number
    priority?: number
    rateLimit?: Record<string, number> | null
    capabilities?: string[] | null
    metadata?: Record<string, any> | null
  },
): Promise<IntelligenceProviderRecord | null> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const sets: string[] = []
  const values: any[] = []

  if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name) }
  if (data.enabled !== undefined) { sets.push('enabled = ?'); values.push(data.enabled ? 1 : 0) }
  if (data.apiKey !== undefined) {
    sets.push('api_key_encrypted = ?')
    values.push(data.apiKey ? encryptApiKey(data.apiKey) : null)
  }
  if (data.baseUrl !== undefined) { sets.push('base_url = ?'); values.push(data.baseUrl) }
  if (data.models !== undefined) { sets.push('models = ?'); values.push(JSON.stringify(data.models)) }
  if (data.defaultModel !== undefined) { sets.push('default_model = ?'); values.push(data.defaultModel) }
  if (data.instructions !== undefined) { sets.push('instructions = ?'); values.push(data.instructions) }
  if (data.timeout !== undefined) { sets.push('timeout = ?'); values.push(data.timeout) }
  if (data.priority !== undefined) { sets.push('priority = ?'); values.push(data.priority) }
  if (data.rateLimit !== undefined) { sets.push('rate_limit = ?'); values.push(data.rateLimit ? JSON.stringify(data.rateLimit) : null) }
  if (data.capabilities !== undefined) { sets.push('capabilities = ?'); values.push(data.capabilities ? JSON.stringify(data.capabilities) : null) }
  if (data.metadata !== undefined) { sets.push('metadata = ?'); values.push(data.metadata ? JSON.stringify(data.metadata) : null) }

  if (sets.length === 0)
    return getProvider(event, userId, providerId)

  sets.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(providerId, userId)

  await db.prepare(
    `UPDATE ${PROVIDERS_TABLE} SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
  ).bind(...values).run()

  return getProvider(event, userId, providerId)
}

export async function deleteProvider(event: H3Event, userId: string, providerId: string): Promise<boolean> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const result = await db.prepare(
    `DELETE FROM ${PROVIDERS_TABLE} WHERE id = ? AND user_id = ?`,
  ).bind(providerId, userId).run()

  return (result.meta?.changes ?? 0) > 0
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
  const id = `ia_${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`
  const now = new Date().toISOString()

  const metadata = normalizeAuditMetadata(data.metadata)

  await db.prepare(`
    INSERT INTO ${AUDITS_TABLE}
      (id, user_id, provider_id, provider_type, model, endpoint, status, latency, success, error_message, trace_id, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
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
  ).run()
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

  const totalRow = await db.prepare(`
    SELECT COUNT(1) AS total
    FROM ${AUDITS_TABLE} a
    ${whereClause}
  `).bind(...values).first<{ total?: number }>()

  const total = Number(totalRow?.total ?? 0)

  const { results } = await db.prepare(`
    SELECT a.*, p.name AS provider_name
    FROM ${AUDITS_TABLE} a
    LEFT JOIN ${PROVIDERS_TABLE} p ON a.provider_id = p.id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...values, limit, offset).all<IntelligenceAuditRow>()

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
  const sourceLike = '%"source":"intelligence-lab-runtime"%'

  const { results } = await db.prepare(`
    SELECT a.*, p.name AS provider_name
    FROM ${AUDITS_TABLE} a
    LEFT JOIN ${PROVIDERS_TABLE} p ON a.provider_id = p.id
    WHERE a.created_at >= ?
      AND a.metadata LIKE ?
    ORDER BY a.created_at DESC
    LIMIT ?
  `).bind(createdAfter, sourceLike, limit).all<IntelligenceAuditRow>()

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

export async function listIpBans(
  event: H3Event,
  options?: { limit?: number },
): Promise<IntelligenceIpBanRecord[]> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200)
  const { results } = await db.prepare(`
    SELECT * FROM ${IP_BANS_TABLE}
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(limit).all<{ [key: string]: any }>()

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
  const existing = await db.prepare(`
    SELECT * FROM ${IP_BANS_TABLE}
    WHERE ip = ?
    LIMIT 1
  `).bind(normalizedIp).first<{ [key: string]: any }>()

  if (existing?.id) {
    await db.prepare(`
      UPDATE ${IP_BANS_TABLE}
      SET reason = ?, enabled = ?, expires_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      data.reason ?? existing.reason ?? null,
      data.enabled === false ? 0 : 1,
      data.expiresAt ?? existing.expires_at ?? null,
      now,
      existing.id,
    ).run()

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
  await db.prepare(`
    INSERT INTO ${IP_BANS_TABLE} (id, ip, reason, enabled, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    normalizedIp,
    data.reason ?? null,
    data.enabled === false ? 0 : 1,
    data.expiresAt ?? null,
    now,
    now,
  ).run()

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
  await db.prepare(`
    UPDATE ${IP_BANS_TABLE}
    SET enabled = ?, updated_at = ?
    WHERE id = ?
  `).bind(enabled ? 1 : 0, now, id).run()
}

export async function deleteIpBan(event: H3Event, id: string): Promise<void> {
  const db = requireDatabase(event)
  await ensureSchema(db)
  await db.prepare(`
    DELETE FROM ${IP_BANS_TABLE}
    WHERE id = ?
  `).bind(id).run()
}

export async function isIpBanned(event: H3Event, ip: string): Promise<boolean> {
  const db = requireDatabase(event)
  await ensureSchema(db)
  const now = new Date().toISOString()
  const row = await db.prepare(`
    SELECT id FROM ${IP_BANS_TABLE}
    WHERE ip = ?
      AND enabled = 1
      AND (expires_at IS NULL OR expires_at > ?)
    LIMIT 1
  `).bind(ip, now).first<{ id?: string }>()
  return Boolean(row?.id)
}

// ---------- Provider API key (decrypted, for test only) ----------

export async function getProviderApiKey(event: H3Event, userId: string, providerId: string): Promise<string | null> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const row = await db.prepare(
    `SELECT api_key_encrypted FROM ${PROVIDERS_TABLE} WHERE id = ? AND user_id = ?`,
  ).bind(providerId, userId).first<{ api_key_encrypted: string | null }>()

  if (!row?.api_key_encrypted)
    return null

  return decryptApiKey(row.api_key_encrypted)
}

// ---------- Settings CRUD ----------

export async function getSettings(event: H3Event, userId: string): Promise<IntelligenceSettingsRecord> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const row = await db.prepare(
    `SELECT * FROM ${SETTINGS_TABLE} WHERE user_id = ?`,
  ).bind(userId).first<{
    user_id: string
    default_strategy: string
    enable_audit: number
    enable_cache: number
    cache_expiration: number
    updated_at: string
  }>()

  if (!row) {
    return {
      userId,
      defaultStrategy: 'adaptive-default',
      enableAudit: false,
      enableCache: true,
      cacheExpiration: 3600,
      updatedAt: new Date().toISOString(),
    }
  }

  return {
    userId: row.user_id,
    defaultStrategy: row.default_strategy,
    enableAudit: row.enable_audit === 1,
    enableCache: row.enable_cache === 1,
    cacheExpiration: row.cache_expiration,
    updatedAt: row.updated_at,
  }
}

export async function updateSettings(
  event: H3Event,
  userId: string,
  data: {
    defaultStrategy?: string
    enableAudit?: boolean
    enableCache?: boolean
    cacheExpiration?: number
  },
): Promise<IntelligenceSettingsRecord> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const now = new Date().toISOString()
  const current = await getSettings(event, userId)

  const strategy = data.defaultStrategy ?? current.defaultStrategy
  const audit = data.enableAudit ?? current.enableAudit
  const cache = data.enableCache ?? current.enableCache
  const expiration = data.cacheExpiration ?? current.cacheExpiration

  await db.prepare(`
    INSERT INTO ${SETTINGS_TABLE} (user_id, default_strategy, enable_audit, enable_cache, cache_expiration, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      default_strategy = excluded.default_strategy,
      enable_audit = excluded.enable_audit,
      enable_cache = excluded.enable_cache,
      cache_expiration = excluded.cache_expiration,
      updated_at = excluded.updated_at
  `).bind(
    userId,
    strategy,
    audit ? 1 : 0,
    cache ? 1 : 0,
    expiration,
    now,
  ).run()

  return {
    userId,
    defaultStrategy: strategy,
    enableAudit: audit,
    enableCache: cache,
    cacheExpiration: expiration,
    updatedAt: now,
  }
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

  const { results } = await db.prepare(`
    SELECT *
    FROM ${PROMPT_REGISTRY_TABLE}
    WHERE ${whereClause}
    ORDER BY updated_at DESC
    LIMIT ?
  `).bind(...values, limit).all<IntelligencePromptRecordRow>()

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

  await db.prepare(`
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
  `).bind(
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
  ).run()

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
    await db.prepare(`
      DELETE FROM ${PROMPT_REGISTRY_TABLE}
      WHERE user_id = ? AND id = ? AND version = ?
    `).bind(userId, promptId, version).run()
    return
  }

  await db.prepare(`
    DELETE FROM ${PROMPT_REGISTRY_TABLE}
    WHERE user_id = ? AND id = ?
  `).bind(userId, promptId).run()
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

  const { results } = await db.prepare(`
    SELECT *
    FROM ${PROMPT_BINDINGS_TABLE}
    WHERE ${conditions.join(' AND ')}
    ORDER BY updated_at DESC
  `).bind(...values).all<IntelligencePromptBindingRow>()

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
  await db.prepare(`
    INSERT INTO ${PROMPT_BINDINGS_TABLE}
      (user_id, capability_id, provider_id, prompt_id, prompt_version, channel, metadata, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, capability_id, provider_id) DO UPDATE SET
      prompt_id = excluded.prompt_id,
      prompt_version = excluded.prompt_version,
      channel = excluded.channel,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at
  `).bind(
    userId,
    binding.capabilityId,
    binding.providerId ?? null,
    binding.promptId,
    binding.promptVersion ?? null,
    binding.channel ?? null,
    binding.metadata ? JSON.stringify(binding.metadata) : null,
    nowIso,
  ).run()

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
    await db.prepare(`
      DELETE FROM ${PROMPT_BINDINGS_TABLE}
      WHERE user_id = ? AND capability_id = ? AND provider_id = ?
    `).bind(userId, capabilityId, providerId).run()
    return
  }

  await db.prepare(`
    DELETE FROM ${PROMPT_BINDINGS_TABLE}
    WHERE user_id = ? AND capability_id = ?
  `).bind(userId, capabilityId).run()
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

  const orderedBindings = [
    ...bindings.filter(item => item.providerId === providerId),
    ...bindings.filter(item => !item.providerId),
  ]

  for (const binding of orderedBindings) {
    const candidates = records.filter(item => {
      if (item.id !== binding.promptId) return false
      if (binding.promptVersion && item.version !== binding.promptVersion) return false
      if (providerId && item.providerId && item.providerId !== providerId) return false
      return true
    })

    if (candidates.length <= 0) {
      continue
    }

    const selected = [...candidates].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0]
    if (selected?.template) {
      return selected.template
    }
  }

  return null
}
