import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { recordTelemetryMessages } from './messageStore'

const SECURITY_TABLE = 'telemetry_ip_security'

const WINDOW_MS = 60_000
const MAX_EVENTS_PER_WINDOW = 1_000
const BASE_BLOCK_MS = 10 * 60_000
const MAX_BLOCK_MS = 24 * 60 * 60_000

let securitySchemaInitialized = false

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

async function ensureSecuritySchema(db: D1Database) {
  if (securitySchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${SECURITY_TABLE} (
      ip TEXT PRIMARY KEY,
      window_start INTEGER NOT NULL,
      window_count INTEGER NOT NULL DEFAULT 0,
      violation_count INTEGER NOT NULL DEFAULT 0,
      blocked_until INTEGER,
      block_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_ip_security_blocked_until ON ${SECURITY_TABLE}(blocked_until);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_ip_security_updated_at ON ${SECURITY_TABLE}(updated_at);
  `).run()

  securitySchemaInitialized = true
}

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

  await ensureSecuritySchema(db)

  const now = Date.now()
  const { results } = await db.prepare(`
      SELECT ip, window_start, window_count, violation_count, blocked_until, block_reason
      FROM ${SECURITY_TABLE}
      WHERE ip = ?1;
    `).bind(ip).all<{
      ip: string
      window_start: number
      window_count: number
      violation_count: number
      blocked_until: number | null
      block_reason: string | null
    }>()
  const row = results?.[0]

  if (row?.blocked_until && row.blocked_until > now) {
    throw createError({
      statusCode: 403,
      statusMessage: 'IP blocked',
    })
  }

  const normalizedWeight = Math.max(0, Math.min(Math.round(options.weight), 10_000))
  const lastWindowStart = row?.window_start ?? now
  const isNewWindow = now - lastWindowStart >= WINDOW_MS
  const nextWindowStart = isNewWindow ? now : lastWindowStart
  const nextWindowCount = Math.max(0, (isNewWindow ? 0 : (row?.window_count ?? 0)) + normalizedWeight)

  const prevViolationCount = row?.violation_count ?? 0
  const exceeded = nextWindowCount > MAX_EVENTS_PER_WINDOW
  const nextViolationCount = exceeded ? prevViolationCount + 1 : prevViolationCount
  const exp = Math.min(10, Math.max(0, nextViolationCount - 1))
  const blockMs = exceeded
    ? Math.min(BASE_BLOCK_MS * 2 ** exp, MAX_BLOCK_MS)
    : 0
  const blockedUntil = exceeded ? now + blockMs : null
  const blockReason = exceeded ? `rate_limit:${nextWindowCount}/${WINDOW_MS} (${options.action})` : null

  await db.prepare(`
      INSERT INTO ${SECURITY_TABLE} (
        ip, window_start, window_count, violation_count, blocked_until, block_reason, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(ip) DO UPDATE SET
        window_start = excluded.window_start,
        window_count = excluded.window_count,
        violation_count = excluded.violation_count,
        blocked_until = excluded.blocked_until,
        block_reason = excluded.block_reason,
        updated_at = excluded.updated_at;
    `).bind(
    ip,
    nextWindowStart,
    nextWindowCount,
    nextViolationCount,
    blockedUntil,
    blockReason,
    now,
    now,
  ).run()

  if (exceeded) {
    const bucket = Math.floor(now / (60 * 60_000))
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
        windowCount: nextWindowCount,
        threshold: MAX_EVENTS_PER_WINDOW,
        violationCount: nextViolationCount,
        blockedUntil,
        blockMs,
        reason: blockReason,
      },
      status: 'unread',
      isAnonymous: false,
      createdAt: now,
    }])

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

export async function unblockIp(event: H3Event, ip: string): Promise<boolean> {
  const db = getD1Database(event)
  if (!db) {
    console.warn('IP security: Database not available')
    return false
  }

  await ensureSecuritySchema(db)

  const now = Date.now()
  const normalized = String(ip || '').trim()
  if (!normalized)
    return false

  await db.prepare(`
    UPDATE ${SECURITY_TABLE}
    SET blocked_until = NULL, block_reason = NULL, updated_at = ?2
    WHERE ip = ?1;
  `).bind(normalized, now).run()

  return true
}
