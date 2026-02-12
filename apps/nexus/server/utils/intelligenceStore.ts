import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import crypto from 'uncrypto'
import { readCloudflareBindings } from './cloudflare'

const PROVIDERS_TABLE = 'intelligence_providers'
const SETTINGS_TABLE = 'intelligence_settings'

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

// ---------- Simple encryption for API keys ----------

function getEncryptionKey(): string {
  return process.env.NUXT_INTELLIGENCE_ENCRYPT_KEY || 'tuff-intelligence-default-key-change-me'
}

function encryptApiKey(apiKey: string): string {
  const key = getEncryptionKey()
  const bytes = new TextEncoder().encode(apiKey)
  const keyBytes = new TextEncoder().encode(key)
  const encrypted = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    encrypted[i] = bytes[i] ^ keyBytes[i % keyBytes.length]
  }
  return btoa(String.fromCharCode(...encrypted))
}

function decryptApiKey(encrypted: string): string {
  const key = getEncryptionKey()
  const bytes = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))
  const keyBytes = new TextEncoder().encode(key)
  const decrypted = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    decrypted[i] = bytes[i] ^ keyBytes[i % keyBytes.length]
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
