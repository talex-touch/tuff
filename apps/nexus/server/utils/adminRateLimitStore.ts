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

  const now = Date.now()
  const windowStart = Math.floor(now / input.windowMs) * input.windowMs
  const blockMs = input.blockMs ?? input.windowMs

  const row = await db.prepare(`
    SELECT key, window_start, count, blocked_until
    FROM ${RATE_LIMIT_TABLE}
    WHERE key = ?1
    LIMIT 1;
  `).bind(input.key).first<{
    key: string
    window_start: number
    count: number
    blocked_until: number | null
  }>()

  if (row?.blocked_until && row.blocked_until > now) {
    const retryAfterSeconds = Math.ceil((row.blocked_until - now) / 1000)
    setRateLimitHeaders(event, retryAfterSeconds)
    throw createError({
      statusCode: 429,
      statusMessage: 'Rate limited',
    })
  }

  const sameWindow = row?.window_start === windowStart
  const nextCount = sameWindow ? Number(row?.count ?? 0) + 1 : 1

  if (nextCount > input.limit) {
    const blockedUntil = now + blockMs
    await db.prepare(`
      INSERT INTO ${RATE_LIMIT_TABLE} (
        key, window_start, count, blocked_until, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(key) DO UPDATE SET
        window_start = excluded.window_start,
        count = excluded.count,
        blocked_until = excluded.blocked_until,
        updated_at = excluded.updated_at;
    `).bind(input.key, windowStart, nextCount, blockedUntil, now).run()

    const retryAfterSeconds = Math.ceil(blockMs / 1000)
    setRateLimitHeaders(event, retryAfterSeconds)
    throw createError({
      statusCode: 429,
      statusMessage: 'Rate limited',
    })
  }

  await db.prepare(`
    INSERT INTO ${RATE_LIMIT_TABLE} (
      key, window_start, count, blocked_until, updated_at
    ) VALUES (?1, ?2, ?3, NULL, ?4)
    ON CONFLICT(key) DO UPDATE SET
      window_start = excluded.window_start,
      count = excluded.count,
      blocked_until = NULL,
      updated_at = excluded.updated_at;
  `).bind(input.key, windowStart, nextCount, now).run()
}
