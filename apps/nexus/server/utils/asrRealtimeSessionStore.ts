import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import {
  parseCreditPricingRuleSnapshot,
  serializeCreditPricingRule,
  type CreditPricingRule,
} from './creditPricingStore'
import { defineD1Schema, ensureD1Schema } from './d1Schema'

const ASR_REALTIME_SESSIONS_TABLE = 'asr_realtime_sessions'

// DashScope ephemeral tokens cannot be revoked once minted; use DashScope's 60s minimum TTL
// so upfront non-refundable reservations stay tightly bounded while still covering cached client reuse.
export const REALTIME_ASR_TTL_SECONDS = 60
export const REALTIME_ASR_MAX_CONCURRENT_SESSIONS = 2
export const REALTIME_ASR_SETTLE_GRACE_MS = 60_000

export type RealtimeAsrSessionStatus = 'active' | 'settled' | 'expired' | 'released'

export interface RealtimeAsrSessionRecord {
  id: string
  userId: string
  providerId: string
  status: RealtimeAsrSessionStatus
  ttlSeconds: number
  reservedCredits: number
  reservationLedgerId: string
  chargedCredits: number | null
  durationMs: number | null
  transcriptUnits: number | null
  pricing: CreditPricingRule | null
  expiresAt: string
  settledAt: string | null
  creditsReleasedAt: string | null
  createdAt: string
  updatedAt: string
}

interface RealtimeAsrSessionRow {
  id: string
  user_id: string
  provider_id: string
  status: string
  ttl_seconds: number
  reserved_credits: number
  reservation_ledger_id: string
  charged_credits: number | null
  duration_ms: number | null
  transcript_units: number | null
  pricing_snapshot: string | null
  expires_at: string
  settled_at: string | null
  credits_released_at: string | null
  created_at: string
  updated_at: string
}

const ASR_REALTIME_SCHEMA = defineD1Schema('asr-realtime-sessions', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${ASR_REALTIME_SESSIONS_TABLE} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        status TEXT NOT NULL,
        ttl_seconds INTEGER NOT NULL,
        reserved_credits INTEGER NOT NULL,
        reservation_ledger_id TEXT NOT NULL,
        charged_credits INTEGER,
        duration_ms INTEGER,
        transcript_units INTEGER,
        pricing_snapshot TEXT,
        expires_at TEXT NOT NULL,
        settled_at TEXT,
        credits_released_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    `CREATE INDEX IF NOT EXISTS idx_asr_realtime_user_status
      ON ${ASR_REALTIME_SESSIONS_TABLE}(user_id, status, expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_asr_realtime_expires
      ON ${ASR_REALTIME_SESSIONS_TABLE}(status, expires_at)`,
  ],
})

function requireDb(event: H3Event): D1Database {
  const db = readCloudflareBindings(event)?.DB
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'ASR realtime session storage is unavailable.' })
  }
  return db
}

async function ensureRealtimeAsrSchema(db: D1Database): Promise<void> {
  await ensureD1Schema(db, ASR_REALTIME_SCHEMA)
}

function mapSessionRow(row: RealtimeAsrSessionRow): RealtimeAsrSessionRecord {
  const status = row.status
  if (status !== 'active' && status !== 'settled' && status !== 'expired' && status !== 'released') {
    throw new Error('ASR_REALTIME_SESSION_STATE_INVALID')
  }
  return {
    id: row.id,
    userId: row.user_id,
    providerId: row.provider_id,
    status,
    ttlSeconds: Number(row.ttl_seconds),
    reservedCredits: Number(row.reserved_credits),
    reservationLedgerId: row.reservation_ledger_id,
    chargedCredits: row.charged_credits == null ? null : Number(row.charged_credits),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    transcriptUnits: row.transcript_units == null ? null : Number(row.transcript_units),
    pricing: parseCreditPricingRuleSnapshot(row.pricing_snapshot),
    expiresAt: row.expires_at,
    settledAt: row.settled_at,
    creditsReleasedAt: row.credits_released_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Marks active realtime ASR sessions whose TTL + settlement grace window have elapsed as `expired`.
 * Their full upfront credit reservation remains consumed (no refund for abandoning settlement).
 */
export async function expireStaleRealtimeAsrSessions(
  event: H3Event,
  userId?: string,
): Promise<number> {
  const db = requireDb(event)
  await ensureRealtimeAsrSchema(db)
  const nowIso = new Date().toISOString()
  const cutoffIso = new Date(Date.now() - REALTIME_ASR_SETTLE_GRACE_MS).toISOString()

  const stmt = userId
    ? db.prepare(`
        UPDATE ${ASR_REALTIME_SESSIONS_TABLE}
        SET status = 'expired',
            charged_credits = COALESCE(charged_credits, reserved_credits),
            settled_at = COALESCE(settled_at, ?1),
            updated_at = ?1
        WHERE user_id = ?2 AND status = 'active' AND expires_at <= ?3
      `).bind(nowIso, userId, cutoffIso)
    : db.prepare(`
        UPDATE ${ASR_REALTIME_SESSIONS_TABLE}
        SET status = 'expired',
            charged_credits = COALESCE(charged_credits, reserved_credits),
            settled_at = COALESCE(settled_at, ?1),
            updated_at = ?1
        WHERE status = 'active' AND expires_at <= ?2
      `).bind(nowIso, cutoffIso)

  const result = await stmt.run()
  return Number((result.meta as { changes?: number } | undefined)?.changes ?? 0)
}

export async function countActiveRealtimeAsrSessions(
  event: H3Event,
  userId: string,
): Promise<number> {
  const db = requireDb(event)
  await ensureRealtimeAsrSchema(db)
  const nowIso = new Date().toISOString()
  // Minted DashScope ephemeral tokens cannot be revoked early, so settled sessions
  // continue occupying their concurrency slot until expires_at passes.
  const row = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM ${ASR_REALTIME_SESSIONS_TABLE}
    WHERE user_id = ?1 AND status IN ('active', 'settled') AND expires_at > ?2
  `).bind(userId, nowIso).first<{ total?: number | string }>()
  return Number(row?.total ?? 0)
}

export async function createRealtimeAsrSession(
  event: H3Event,
  input: {
    sessionId: string
    userId: string
    providerId: string
    ttlSeconds: number
    reservedCredits: number
    reservationLedgerId: string
    pricing: CreditPricingRule
    maxConcurrent?: number
  },
): Promise<{ created: boolean, session: RealtimeAsrSessionRecord | null }> {
  const db = requireDb(event)
  await ensureRealtimeAsrSchema(db)
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const expiresAtIso = new Date(now + input.ttlSeconds * 1000).toISOString()
  const maxConcurrent = input.maxConcurrent ?? REALTIME_ASR_MAX_CONCURRENT_SESSIONS

  const result = await db.prepare(`
    INSERT INTO ${ASR_REALTIME_SESSIONS_TABLE} (
      id, user_id, provider_id, status, ttl_seconds, reserved_credits, reservation_ledger_id,
      charged_credits, duration_ms, transcript_units, pricing_snapshot,
      expires_at, settled_at, credits_released_at, created_at, updated_at
    )
    SELECT ?1, ?2, ?3, 'active', ?4, ?5, ?6, NULL, NULL, NULL, ?7, ?8, NULL, NULL, ?9, ?9
    WHERE (
      SELECT COUNT(*) FROM ${ASR_REALTIME_SESSIONS_TABLE}
      WHERE user_id = ?2 AND status IN ('active', 'settled') AND expires_at > ?9
    ) < ?10
  `).bind(
    input.sessionId,
    input.userId,
    input.providerId,
    input.ttlSeconds,
    input.reservedCredits,
    input.reservationLedgerId,
    serializeCreditPricingRule(input.pricing),
    expiresAtIso,
    nowIso,
    maxConcurrent,
  ).run()

  const changes = Number((result.meta as { changes?: number } | undefined)?.changes ?? 0)
  if (changes < 1) {
    return { created: false, session: null }
  }

  return {
    created: true,
    session: {
      id: input.sessionId,
      userId: input.userId,
      providerId: input.providerId,
      status: 'active',
      ttlSeconds: input.ttlSeconds,
      reservedCredits: input.reservedCredits,
      reservationLedgerId: input.reservationLedgerId,
      chargedCredits: null,
      durationMs: null,
      transcriptUnits: null,
      pricing: input.pricing,
      expiresAt: expiresAtIso,
      settledAt: null,
      creditsReleasedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  }
}

export async function getRealtimeAsrSession(
  event: H3Event,
  userId: string,
  sessionId: string,
): Promise<RealtimeAsrSessionRecord | null> {
  const db = requireDb(event)
  await ensureRealtimeAsrSchema(db)
  const row = await db.prepare(`
    SELECT * FROM ${ASR_REALTIME_SESSIONS_TABLE}
    WHERE id = ?1 AND user_id = ?2
    LIMIT 1
  `).bind(sessionId, userId).first<RealtimeAsrSessionRow>()
  return row ? mapSessionRow(row) : null
}

export async function claimRealtimeAsrSessionForSettlement(
  event: H3Event,
  userId: string,
  sessionId: string,
  update: {
    expectedChargedCredits: number | null
    chargedCredits: number
    durationMs: number
    transcriptUnits: number
  },
): Promise<RealtimeAsrSessionRecord | null> {
  const db = requireDb(event)
  await ensureRealtimeAsrSchema(db)
  const nowIso = new Date().toISOString()
  const row = await db.prepare(`
    UPDATE ${ASR_REALTIME_SESSIONS_TABLE}
    SET status = 'settled',
        charged_credits = MAX(reserved_credits, COALESCE(charged_credits, reserved_credits), ?1),
        duration_ms = ?2,
        transcript_units = ?3,
        settled_at = COALESCE(settled_at, ?4),
        updated_at = ?4
    WHERE id = ?5
      AND user_id = ?6
      AND status IN ('active', 'settled')
      AND ((?7 IS NULL AND charged_credits IS NULL) OR charged_credits = ?7)
    RETURNING *
  `).bind(
    update.chargedCredits,
    update.durationMs,
    update.transcriptUnits,
    nowIso,
    sessionId,
    userId,
    update.expectedChargedCredits,
  ).first<RealtimeAsrSessionRow>()
  return row ? mapSessionRow(row) : null
}

export async function markRealtimeAsrSessionCreditsReleased(
  event: H3Event,
  sessionId: string,
): Promise<void> {
  const db = requireDb(event)
  await ensureRealtimeAsrSchema(db)
  const nowIso = new Date().toISOString()
  await db.prepare(`
    UPDATE ${ASR_REALTIME_SESSIONS_TABLE}
    SET credits_released_at = COALESCE(credits_released_at, ?1),
        updated_at = ?1
    WHERE id = ?2
  `).bind(nowIso, sessionId).run()
}

export async function markRealtimeAsrSessionReleased(
  event: H3Event,
  sessionId: string,
): Promise<void> {
  const db = requireDb(event)
  await ensureRealtimeAsrSchema(db)
  const nowIso = new Date().toISOString()
  await db.prepare(`
    UPDATE ${ASR_REALTIME_SESSIONS_TABLE}
    SET status = 'released',
        charged_credits = 0,
        credits_released_at = COALESCE(credits_released_at, ?1),
        updated_at = ?1
    WHERE id = ?2 AND status = 'active'
  `).bind(nowIso, sessionId).run()
}

export async function markRealtimeAsrSessionExpired(
  event: H3Event,
  userId: string,
  sessionId: string,
): Promise<RealtimeAsrSessionRecord | null> {
  const db = requireDb(event)
  await ensureRealtimeAsrSchema(db)
  const nowIso = new Date().toISOString()
  const row = await db.prepare(`
    UPDATE ${ASR_REALTIME_SESSIONS_TABLE}
    SET status = 'expired',
        charged_credits = COALESCE(charged_credits, reserved_credits),
        settled_at = COALESCE(settled_at, ?1),
        updated_at = ?1
    WHERE id = ?2 AND user_id = ?3 AND status = 'active'
    RETURNING *
  `).bind(nowIso, sessionId, userId).first<RealtimeAsrSessionRow>()
  return row ? mapSessionRow(row) : null
}
