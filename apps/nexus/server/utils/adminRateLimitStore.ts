import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'

const RATE_LIMIT_TABLE = 'admin_rate_limits'

let schemaReady = false

function getDb(event: H3Event): D1Database | null {
  return readCloudflareBindings(event)?.DB ?? null
}

function requireDb(event: H3Event): D1Database {
  const db = getDb(event)
  if (!db) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Database not available',
    })
  }
  return db
}

async function ensureSchema(db: D1Database) {
  if (schemaReady)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${RATE_LIMIT_TABLE} (
      key TEXT PRIMARY KEY,
      window_start INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      blocked_until INTEGER,
      updated_at INTEGER NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_rate_limits_updated
    ON ${RATE_LIMIT_TABLE}(updated_at);
  `).run()

  schemaReady = true
}

function setRateLimitHeaders(event: H3Event, retryAfterSeconds: number) {
  event.node.res.setHeader('Retry-After', String(Math.max(1, retryAfterSeconds)))
  event.node.res.setHeader('Cache-Control', 'no-store')
}

export async function enforceAdminRateLimit(
  event: H3Event,
  input: { key: string, limit: number, windowMs: number, blockMs?: number },
) {
  const db = requireDb(event)
  await ensureSchema(db)
  if (!Number.isInteger(input.limit) || input.limit <= 0 || !Number.isFinite(input.windowMs) || input.windowMs <= 0)
    throw new Error('Invalid rate limit configuration.')

  const now = Date.now()
  const windowStart = Math.floor(now / input.windowMs) * input.windowMs
  const blockMs = input.blockMs ?? input.windowMs
  if (!Number.isFinite(blockMs) || blockMs <= 0) throw new Error('Invalid rate limit configuration.')
  const blockedUntil = now + blockMs
  const row = await db.prepare(`
    INSERT INTO ${RATE_LIMIT_TABLE} (
      key, window_start, count, blocked_until, updated_at
    ) VALUES (?1, ?2, 1, NULL, ?3)
    ON CONFLICT(key) DO UPDATE SET
      window_start = CASE
        WHEN ${RATE_LIMIT_TABLE}.blocked_until > ?3 THEN ${RATE_LIMIT_TABLE}.window_start
        ELSE ?2
      END,
      count = CASE
        WHEN ${RATE_LIMIT_TABLE}.blocked_until > ?3 THEN ${RATE_LIMIT_TABLE}.count
        WHEN ${RATE_LIMIT_TABLE}.window_start = ?2 THEN ${RATE_LIMIT_TABLE}.count + 1
        ELSE 1
      END,
      blocked_until = CASE
        WHEN ${RATE_LIMIT_TABLE}.blocked_until > ?3 THEN ${RATE_LIMIT_TABLE}.blocked_until
        WHEN (
          CASE
            WHEN ${RATE_LIMIT_TABLE}.window_start = ?2 THEN ${RATE_LIMIT_TABLE}.count + 1
            ELSE 1
          END
        ) > ?4 THEN ?5
        ELSE NULL
      END,
      updated_at = ?3
    RETURNING key, window_start, count, blocked_until;
  `).bind(input.key, windowStart, now, input.limit, blockedUntil).first<{
    key: string
    window_start: number
    count: number
    blocked_until: number | null
  }>()
  if (!row) throw new Error('Rate limit update failed.')
  if (row.blocked_until && row.blocked_until > now) {
    const retryAfterSeconds = Math.ceil((row.blocked_until - now) / 1000)
    setRateLimitHeaders(event, retryAfterSeconds)
    throw createError({ statusCode: 429, statusMessage: 'Rate limited' })
  }
}
