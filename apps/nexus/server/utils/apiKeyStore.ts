import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import crypto from 'uncrypto'
import { createHash } from 'node:crypto'
import { readCloudflareBindings } from './cloudflare'
import { runAfterResponse } from './afterResponse'
import { defineD1Schema, ensureD1Schema } from './d1Schema'

const API_KEYS_TABLE = 'user_api_keys'

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

const API_KEY_SCHEMA = defineD1Schema('api-keys', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${API_KEYS_TABLE} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        scopes TEXT NOT NULL DEFAULT '["plugin:publish"]',
        last_used_at TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL
      )`,
    `CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON ${API_KEYS_TABLE}(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON ${API_KEYS_TABLE}(key_hash)`,
  ],
})

async function ensureApiKeySchema(db: D1Database) {
  await ensureD1Schema(db, API_KEY_SCHEMA)
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

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

// Legacy 32-bit hash retained ONLY to validate keys created before the SHA-256
// migration; never used for new keys.
function legacyHash(key: string): string {
  const data = new TextEncoder().encode(key)
  let hash = 0
  for (const byte of data) {
    hash = ((hash << 5) - hash) + byte
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}

function generateApiKey(): { key: string, prefix: string, hash: string } {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const key = `tuff_${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`
  const prefix = `${key.substring(0, 12)}...`

  return { key, prefix, hash: sha256Hex(key) }
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

export async function deleteApiKeysForUser(event: H3Event, userId: string): Promise<number> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureApiKeySchema(db)

  const result = await db.prepare(`
    DELETE FROM ${API_KEYS_TABLE}
    WHERE user_id = ?1;
  `).bind(userId).run()

  return Number(result.meta?.changes ?? 0)
}

/**
 * Validate an API key and return the user ID if valid
 */
interface ApiKeyRow {
  id: string
  user_id: string
  scopes: string
  expires_at: string | null
  last_used_at: string | null
  key_hash: string
}

/** How stale `last_used_at` may get before a request refreshes it. */
const API_KEY_TOUCH_INTERVAL_MS = 5 * 60 * 1000

/**
 * The key's row, by the SHA-256 hash or, for keys created before the migration, the legacy 32-bit
 * hash — one query for both (it was up to two). A hash that matches more than one row is never
 * resolved: on a collision the SHA-256 match is required to be unique, then the legacy one, so a
 * collision can never pick the wrong user.
 */
async function lookupApiKeyRow(db: D1Database, prefix: string, key: string): Promise<ApiKeyRow | null> {
  const sha = sha256Hex(key)
  const legacy = legacyHash(key)
  const { results } = await db.prepare(`
    SELECT id, user_id, scopes, expires_at, last_used_at, key_hash
    FROM ${API_KEYS_TABLE}
    WHERE key_prefix = ?1 AND key_hash IN (?2, ?3);
  `).bind(prefix, sha, legacy).all<ApiKeyRow>()
  const rows = results ?? []
  const shaRows = rows.filter(row => row.key_hash === sha)
  if (shaRows.length === 1)
    return shaRows[0]!
  const legacyRows = rows.filter(row => row.key_hash === legacy)
  return legacyRows.length === 1 ? legacyRows[0]! : null
}

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
  const row = await lookupApiKeyRow(db, prefix, key)
  if (!row) {
    return null
  }

  // Check expiration
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return null
  }

  // "Last used" is a dashboard hint: refreshed at most every few minutes, after the response.
  // It was an awaited write on every API-key request.
  const now = new Date()
  if (!row.last_used_at || row.last_used_at < new Date(now.getTime() - API_KEY_TOUCH_INTERVAL_MS).toISOString()) {
    runAfterResponse(event, 'api key last_used_at', () => db.prepare(`
      UPDATE ${API_KEYS_TABLE}
      SET last_used_at = ?1
      WHERE id = ?2;
    `).bind(now.toISOString(), row.id).run())
  }

  return {
    userId: row.user_id,
    scopes: JSON.parse(row.scopes),
  }
}
