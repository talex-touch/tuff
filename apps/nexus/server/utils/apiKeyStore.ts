import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import crypto from 'uncrypto'
import { readCloudflareBindings } from './cloudflare'

const API_KEYS_TABLE = 'user_api_keys'

let apiKeySchemaInitialized = false

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

async function ensureApiKeySchema(db: D1Database) {
  if (apiKeySchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${API_KEYS_TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT '["plugin:publish"]',
      last_used_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON ${API_KEYS_TABLE}(user_id);
  `).run()

  apiKeySchemaInitialized = true
}

export interface ApiKey {
  id: string
  userId: string
  name: string
  keyPrefix: string
  scopes: string[]
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

export interface ApiKeyWithSecret extends ApiKey {
  secretKey: string // Only returned on creation
}

function generateApiKey(): { key: string, prefix: string, hash: string } {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const key = `tuff_${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`
  const prefix = `${key.substring(0, 12)}...`

  // Simple hash for storage (in production, use proper hashing)
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  let hash = 0
  for (const byte of data) {
    hash = ((hash << 5) - hash) + byte
    hash = hash & hash
  }
  const hashStr = Math.abs(hash).toString(16)

  return { key, prefix, hash: hashStr }
}

/**
 * Create a new API key for a user
 */
export async function createApiKey(
  event: H3Event,
  userId: string,
  name: string,
  scopes: string[] = ['plugin:publish'],
  expiresInDays?: number,
): Promise<ApiKeyWithSecret> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureApiKeySchema(db)

  const id = crypto.randomUUID()
  const { key, prefix, hash } = generateApiKey()
  const now = new Date().toISOString()
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null

  await db.prepare(`
    INSERT INTO ${API_KEYS_TABLE} (id, user_id, name, key_prefix, key_hash, scopes, expires_at, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8);
  `).bind(id, userId, name, prefix, hash, JSON.stringify(scopes), expiresAt, now).run()

  return {
    id,
    userId,
    name,
    keyPrefix: prefix,
    secretKey: key,
    scopes,
    lastUsedAt: null,
    expiresAt,
    createdAt: now,
  }
}

/**
 * List all API keys for a user (without secrets)
 */
export async function listApiKeys(event: H3Event, userId: string): Promise<ApiKey[]> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureApiKeySchema(db)

  const { results } = await db.prepare(`
    SELECT id, user_id, name, key_prefix, scopes, last_used_at, expires_at, created_at
    FROM ${API_KEYS_TABLE}
    WHERE user_id = ?1
    ORDER BY created_at DESC;
  `).bind(userId).all<{
    id: string
    user_id: string
    name: string
    key_prefix: string
    scopes: string
    last_used_at: string | null
    expires_at: string | null
    created_at: string
  }>()

  return (results ?? []).map(row => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: JSON.parse(row.scopes),
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }))
}

/**
 * Delete an API key
 */
export async function deleteApiKey(event: H3Event, userId: string, keyId: string): Promise<boolean> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureApiKeySchema(db)

  const result = await db.prepare(`
    DELETE FROM ${API_KEYS_TABLE}
    WHERE id = ?1 AND user_id = ?2;
  `).bind(keyId, userId).run()

  return (result.meta?.changes ?? 0) > 0
}

/**
 * Validate an API key and return the user ID if valid
 */
export async function validateApiKey(event: H3Event, key: string): Promise<{ userId: string, scopes: string[] } | null> {
  if (!key.startsWith('tuff_')) {
    return null
  }

  const db = getD1Database(event)
  if (!db) {
    return null
  }

  await ensureApiKeySchema(db)

  const prefix = `${key.substring(0, 12)}...`

  // Simple hash matching
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  let hash = 0
  for (const byte of data) {
    hash = ((hash << 5) - hash) + byte
    hash = hash & hash
  }
  const hashStr = Math.abs(hash).toString(16)

  const { results } = await db.prepare(`
    SELECT id, user_id, scopes, expires_at
    FROM ${API_KEYS_TABLE}
    WHERE key_prefix = ?1 AND key_hash = ?2;
  `).bind(prefix, hashStr).all<{
    id: string
    user_id: string
    scopes: string
    expires_at: string | null
  }>()

  if (!results || results.length === 0) {
    return null
  }

  const row = results[0]
  if (!row)
    return null

  // Check expiration
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return null
  }

  // Update last used
  await db.prepare(`
    UPDATE ${API_KEYS_TABLE}
    SET last_used_at = ?1
    WHERE id = ?2;
  `).bind(new Date().toISOString(), row.id).run()

  return {
    userId: row.user_id,
    scopes: JSON.parse(row.scopes),
  }
}
