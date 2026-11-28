import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { recordTelemetryMessages } from './messageStore'
import { defineD1Schema, ensureD1Schema } from './d1Schema'

const SECURITY_TABLE = 'telemetry_ip_security'

const WINDOW_MS = 60_000
const MAX_EVENTS_PER_WINDOW = 1_000
const BASE_BLOCK_MS = 10 * 60_000
const MAX_BLOCK_MS = 24 * 60 * 60_000

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

const IP_SECURITY_SCHEMA = defineD1Schema('telemetry-ip-security', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${SECURITY_TABLE} (
        ip TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        window_count INTEGER NOT NULL DEFAULT 0,
        violation_count INTEGER NOT NULL DEFAULT 0,
        blocked_until INTEGER,
        block_reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    `CREATE INDEX IF NOT EXISTS idx_ip_security_blocked_until ON ${SECURITY_TABLE}(blocked_until)`,
    `CREATE INDEX IF NOT EXISTS idx_ip_security_updated_at ON ${SECURITY_TABLE}(updated_at)`,
  ],
})

async function ensureSecuritySchema(db: D1Database) {
  await ensureD1Schema(db, IP_SECURITY_SCHEMA)
}

// CF-Connecting-IP first: Cloudflare sets it itself, replacing anything the client sent.
// X-Forwarded-For it does not replace: a value the client sent is kept and the real address
// appended, so its first entry is whatever the client wrote. The forwarded headers below are
// only for requests that never crossed Cloudflare (local dev, tests).
export function resolveRequestIp(event: H3Event): string | undefined {
  const cfRequest = (event.context.cloudflare as any)?.request as any
  const cfHeaderValue = (name: string) => {
    try {
      return cfRequest?.headers?.get?.(name) || undefined
    }
    catch {
      return undefined
    }
  }

  const remoteAddress
    = (event as any)?.node?.req?.socket?.remoteAddress
      || (event as any)?.node?.req?.connection?.remoteAddress
      || undefined

  const raw
    = cfHeaderValue('CF-Connecting-IP')
      || cfHeaderValue('cf-connecting-ip')
      || getHeader(event, 'cf-connecting-ip')
      || getHeader(event, 'CF-Connecting-IP')
      || getHeader(event, 'x-forwarded-for')
      || getHeader(event, 'x-real-ip')
      || getHeader(event, 'true-client-ip')
      || remoteAddress
      || undefined

  if (!raw)
    return undefined

  const first = raw.split(',')[0]?.trim()
  if (!first)
    return undefined

  return first.length > 128 ? first.slice(0, 128) : first
}

export async function guardTelemetryIp(
  event: H3Event,
  options: { weight: number, action: string },
): Promise<{ ip?: string }> {
  const ip = resolveRequestIp(event)
  if (!ip)
    return { ip: undefined }

  const db = getD1Database(event)
  if (!db)
    return { ip }

  const now = Date.now()
  const normalizedWeight = Math.max(0, Math.min(Math.round(options.weight), 10_000))
  const actionLabel = String(options.action || 'telemetry').slice(0, 64)

  let row: {
    window_count: number
    violation_count: number
    blocked_until: number | null
    block_reason: string | null
    updated_at: number
  } | null = null

  try {
    await ensureSecuritySchema(db)

    // Atomic single-statement upsert prevents concurrent read-modify-write races on window_count
    // and enforces exponential backoff directly in SQLite. Fails closed on D1 error.
    // The `WHERE` predicate on `DO UPDATE` skips already-blocked rows without modifying them,
    // returning `null` deterministically (even within the same millisecond) to signal 403 IP blocked.
    row = await db.prepare(`
      INSERT INTO ${SECURITY_TABLE} (
        ip, window_start, window_count, violation_count, blocked_until, block_reason, created_at, updated_at
      ) VALUES (
        ?1,
        ?2,
        ?3,
        CASE WHEN ?3 > ?4 THEN 1 ELSE 0 END,
        CASE WHEN ?3 > ?4 THEN ?2 + ?5 ELSE NULL END,
        CASE WHEN ?3 > ?4 THEN 'rate_limit:' || ?3 || '/' || ?6 || ' (' || ?7 || ')' ELSE NULL END,
        ?2,
        ?2
      )
      ON CONFLICT(ip) DO UPDATE SET
        window_start = CASE
          WHEN (?2 - ${SECURITY_TABLE}.window_start) >= ?6 THEN ?2
          ELSE ${SECURITY_TABLE}.window_start
        END,
        window_count = CASE
          WHEN (?2 - ${SECURITY_TABLE}.window_start) >= ?6 THEN ?3
          ELSE ${SECURITY_TABLE}.window_count + ?3
        END,
        violation_count = CASE
          WHEN (
            CASE
              WHEN (?2 - ${SECURITY_TABLE}.window_start) >= ?6 THEN ?3
              ELSE ${SECURITY_TABLE}.window_count + ?3
            END
          ) > ?4
            THEN ${SECURITY_TABLE}.violation_count + 1
          ELSE ${SECURITY_TABLE}.violation_count
        END,
        blocked_until = CASE
          WHEN (
            CASE
              WHEN (?2 - ${SECURITY_TABLE}.window_start) >= ?6 THEN ?3
              ELSE ${SECURITY_TABLE}.window_count + ?3
            END
          ) > ?4
            THEN ?2 + MIN(
              ?5 * (1 << MIN(10, MAX(0, ${SECURITY_TABLE}.violation_count))),
              ?8
            )
          ELSE NULL
        END,
        block_reason = CASE
          WHEN (
            CASE
              WHEN (?2 - ${SECURITY_TABLE}.window_start) >= ?6 THEN ?3
              ELSE ${SECURITY_TABLE}.window_count + ?3
            END
          ) > ?4
            THEN 'rate_limit:' || (
              CASE
                WHEN (?2 - ${SECURITY_TABLE}.window_start) >= ?6 THEN ?3
                ELSE ${SECURITY_TABLE}.window_count + ?3
              END
            ) || '/' || ?6 || ' (' || ?7 || ')'
          ELSE NULL
        END,
        updated_at = ?2
      WHERE ${SECURITY_TABLE}.blocked_until IS NULL OR ${SECURITY_TABLE}.blocked_until <= ?2
      RETURNING
        window_count,
        violation_count,
        blocked_until,
        block_reason,
        updated_at;
    `).bind(
      ip,
      now,
      normalizedWeight,
      MAX_EVENTS_PER_WINDOW,
      BASE_BLOCK_MS,
      WINDOW_MS,
      actionLabel,
      MAX_BLOCK_MS,
    ).first<{
      window_count: number
      violation_count: number
      blocked_until: number | null
      block_reason: string | null
      updated_at: number
    }>()
  }
  catch (error) {
    console.warn('IP security: D1 error', error)
    throw createError({
      statusCode: 503,
      statusMessage: 'Telemetry security check unavailable',
    })
  }

  // `ON CONFLICT ... DO UPDATE ... WHERE blocked_until IS NULL OR blocked_until <= ?2`
  // yields zero rows only when the IP is already actively blocked.
  if (!row) {
    throw createError({
      statusCode: 403,
      statusMessage: 'IP blocked',
    })
  }

  if (row.blocked_until && row.blocked_until > now) {
    const bucket = Math.floor(now / (60 * 60_000))
    const blockMs = Math.max(0, row.blocked_until - now)
    try {
      await recordTelemetryMessages(event, [{
        id: `ip-ban:${ip}:${bucket}`,
        source: 'system',
        severity: 'warn',
        title: 'IP auto blocked',
        message: 'Telemetry traffic exceeded threshold and was automatically blocked.',
        meta: {
          ip,
          action: options.action,
          windowMs: WINDOW_MS,
          windowCount: row.window_count,
          threshold: MAX_EVENTS_PER_WINDOW,
          violationCount: row.violation_count,
          blockedUntil: row.blocked_until,
          blockMs,
          reason: row.block_reason,
        },
        status: 'unread',
        isAnonymous: false,
        createdAt: now,
      }], { trustedSystem: true })
    }
    catch (error) {
      console.warn('Telemetry messages: D1 error', error)
    }

    throw createError({
      statusCode: 429,
      statusMessage: 'Rate limited',
    })
  }

  return { ip }
}

export async function listBlockedIps(
  event: H3Event,
  options: { limit?: number } = {},
): Promise<Array<{
  ip: string
  blockedUntil: number
  blockReason?: string
  violationCount: number
  updatedAt: number
}>> {
  const db = getD1Database(event)
  if (!db) {
    console.warn('IP security: Database not available')
    return []
  }

  try {
    await ensureSecuritySchema(db)

    const now = Date.now()
    const limit = Math.min(Math.max(1, Math.round(options.limit ?? 50)), 200)

    const { results } = await db.prepare(`
      SELECT ip, blocked_until, block_reason, violation_count, updated_at
      FROM ${SECURITY_TABLE}
      WHERE blocked_until IS NOT NULL AND blocked_until > ?1
      ORDER BY blocked_until DESC
      LIMIT ?2;
    `).bind(now, limit).all<{
      ip: string
      blocked_until: number
      block_reason: string | null
      violation_count: number
      updated_at: number
    }>()

    return (results ?? []).map(row => ({
      ip: row.ip,
      blockedUntil: row.blocked_until,
      blockReason: row.block_reason || undefined,
      violationCount: row.violation_count || 0,
      updatedAt: row.updated_at,
    }))
  }
  catch (error) {
    console.warn('IP security: D1 error', error)
    return []
  }
}

export async function unblockIp(event: H3Event, ip: string): Promise<boolean> {
  const db = getD1Database(event)
  if (!db) {
    console.warn('IP security: Database not available')
    return false
  }

  const now = Date.now()
  const normalized = String(ip || '').trim()
  if (!normalized)
    return false

  try {
    await ensureSecuritySchema(db)

    await db.prepare(`
      UPDATE ${SECURITY_TABLE}
      SET blocked_until = NULL, block_reason = NULL, updated_at = ?2
      WHERE ip = ?1;
    `).bind(normalized, now).run()

    return true
  }
  catch (error) {
    console.warn('IP security: D1 error', error)
    return false
  }
}
