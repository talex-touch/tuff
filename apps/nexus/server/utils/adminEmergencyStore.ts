import type { D1Database } from '@cloudflare/workers-types'
import { createHash, randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import { hashPassword, verifyPassword } from './authCrypto'
import { readCloudflareBindings } from './cloudflare'

const SESSION_TABLE = 'admin_emergency_sessions'
const ATTEMPT_TABLE = 'admin_emergency_attempts'
const JTI_TABLE = 'admin_emergency_jti'
const RECOVERY_CODE_TABLE = 'admin_recovery_codes'

type EmergencySessionStatus = 'init' | 'verified' | 'expired' | 'revoked'
type EmergencyAction = 'init' | 'verify' | 'issue'

let schemaReady = false

export interface AdminEmergencySession {
  sessionId: string
  adminId: string | null
  status: EmergencySessionStatus
  dfpHash: string
  challenge: string
  verifyNonce: string | null
  failCount: number
  expiresAt: string
  verifiedAt: string | null
  createdAt: string
  revokedAt: string | null
}

interface EmergencySessionRow {
  session_id: string
  admin_id: string | null
  status: EmergencySessionStatus
  dfp_hash: string
  challenge: string
  verify_nonce: string | null
  fail_count: number
  expires_at: string
  verified_at: string | null
  created_at: string
  revoked_at: string | null
}

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
    CREATE TABLE IF NOT EXISTS ${SESSION_TABLE} (
      session_id TEXT PRIMARY KEY,
      admin_id TEXT,
      status TEXT NOT NULL,
      dfp_hash TEXT NOT NULL,
      challenge TEXT NOT NULL,
      verify_nonce TEXT,
      fail_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      verified_at TEXT,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_emergency_sessions_status_expires
    ON ${SESSION_TABLE}(status, expires_at);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_emergency_sessions_admin_created
    ON ${SESSION_TABLE}(admin_id, created_at);
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${ATTEMPT_TABLE} (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      ip_hash TEXT,
      admin_hint_hash TEXT,
      dfp_hash TEXT,
      action TEXT NOT NULL,
      success INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      created_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_emergency_attempts_session_action_created
    ON ${ATTEMPT_TABLE}(session_id, action, created_at);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_emergency_attempts_ip_created
    ON ${ATTEMPT_TABLE}(ip_hash, created_at);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_emergency_attempts_hint_created
    ON ${ATTEMPT_TABLE}(admin_hint_hash, created_at);
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${JTI_TABLE} (
      jti TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      used_at TEXT,
      expires_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_emergency_jti_expires
    ON ${JTI_TABLE}(expires_at);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_emergency_jti_used
    ON ${JTI_TABLE}(used_at);
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${RECOVERY_CODE_TABLE} (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_recovery_codes_admin_used
    ON ${RECOVERY_CODE_TABLE}(admin_id, used_at);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_admin_recovery_codes_expires
    ON ${RECOVERY_CODE_TABLE}(expires_at);
  `).run()

  schemaReady = true
}

function nowIso() {
  return new Date().toISOString()
}

function toSession(row: EmergencySessionRow | null): AdminEmergencySession | null {
  if (!row)
    return null
  return {
    sessionId: row.session_id,
    adminId: row.admin_id ?? null,
    status: row.status,
    dfpHash: row.dfp_hash,
    challenge: row.challenge,
    verifyNonce: row.verify_nonce ?? null,
    failCount: Number(row.fail_count ?? 0),
    expiresAt: row.expires_at,
    verifiedAt: row.verified_at ?? null,
    createdAt: row.created_at,
    revokedAt: row.revoked_at ?? null,
  }
}

async function expireOldSessions(db: D1Database) {
  const now = nowIso()
  await db.prepare(`
    UPDATE ${SESSION_TABLE}
    SET status = 'expired'
    WHERE status IN ('init', 'verified')
      AND expires_at <= ?1;
  `).bind(now).run()
}

function getPepper(event: H3Event): string {
  const config = useRuntimeConfig(event)
  const pepper = typeof config.adminControl?.pepper === 'string'
    ? config.adminControl.pepper.trim()
    : ''
  if (!pepper) {
    throw createError({
      statusCode: 500,
      statusMessage: 'ADMIN_CONTROL_PLANE_PEPPER is required.',
    })
  }
  return pepper
}

function hashWithPepper(event: H3Event, raw: string): string {
  const pepper = getPepper(event)
  return createHash('sha256').update(`${pepper}:${raw}`).digest('hex')
}

export function hashAdminHint(event: H3Event, hint: string): string {
  return hashWithPepper(event, hint.trim().toLowerCase())
}

export function hashIpValue(event: H3Event, ip: string): string {
  return hashWithPepper(event, ip.trim())
}

export function hashDeviceFingerprint(event: H3Event, fingerprint: string): string {
  return hashWithPepper(event, fingerprint.trim())
}

function normalizeRecoveryCode(event: H3Event, recoveryCode: string): string {
  return hashWithPepper(event, recoveryCode.trim())
}

export async function ensureAdminEmergencySchema(event: H3Event) {
  const db = requireDb(event)
  await ensureSchema(db)
}

export async function createAdminEmergencySession(
  event: H3Event,
  input: { sessionId: string, adminId: string | null, dfpHash: string, challenge: string, expiresAt: string },
): Promise<AdminEmergencySession> {
  const db = requireDb(event)
  await ensureSchema(db)
  await expireOldSessions(db)

  const createdAt = nowIso()
  await db.prepare(`
    INSERT INTO ${SESSION_TABLE} (
      session_id, admin_id, status, dfp_hash, challenge,
      verify_nonce, fail_count, expires_at, verified_at, created_at, revoked_at
    ) VALUES (?1, ?2, 'init', ?3, ?4, NULL, 0, ?5, NULL, ?6, NULL);
  `).bind(
    input.sessionId,
    input.adminId,
    input.dfpHash,
    input.challenge,
    input.expiresAt,
    createdAt,
  ).run()

  return {
    sessionId: input.sessionId,
    adminId: input.adminId,
    status: 'init',
    dfpHash: input.dfpHash,
    challenge: input.challenge,
    verifyNonce: null,
    failCount: 0,
    expiresAt: input.expiresAt,
    verifiedAt: null,
    createdAt,
    revokedAt: null,
  }
}

export async function getAdminEmergencySession(event: H3Event, sessionId: string): Promise<AdminEmergencySession | null> {
  const db = requireDb(event)
  await ensureSchema(db)
  await expireOldSessions(db)

  const row = await db.prepare(`
    SELECT
      session_id, admin_id, status, dfp_hash, challenge, verify_nonce, fail_count,
      expires_at, verified_at, created_at, revoked_at
    FROM ${SESSION_TABLE}
    WHERE session_id = ?1
    LIMIT 1;
  `).bind(sessionId).first<EmergencySessionRow>()

  return toSession(row ?? null)
}

export async function updateEmergencySessionVerified(
  event: H3Event,
  input: { sessionId: string, adminId: string, verifyNonce: string },
) {
  const db = requireDb(event)
  await ensureSchema(db)
  const now = nowIso()
  await db.prepare(`
    UPDATE ${SESSION_TABLE}
    SET status = 'verified',
        admin_id = ?2,
        verify_nonce = ?3,
        verified_at = ?4
    WHERE session_id = ?1
      AND status = 'init';
  `).bind(input.sessionId, input.adminId, input.verifyNonce, now).run()
}

export async function incrementEmergencySessionFailures(
  event: H3Event,
  sessionId: string,
  freezeThreshold = 3,
): Promise<number> {
  const db = requireDb(event)
  await ensureSchema(db)

  await db.prepare(`
    UPDATE ${SESSION_TABLE}
    SET fail_count = fail_count + 1
    WHERE session_id = ?1
      AND status = 'init';
  `).bind(sessionId).run()

  const row = await db.prepare(`
    SELECT fail_count
    FROM ${SESSION_TABLE}
    WHERE session_id = ?1
    LIMIT 1;
  `).bind(sessionId).first<{ fail_count: number }>()

  const failCount = Number(row?.fail_count ?? 0)
  if (failCount > freezeThreshold) {
    await db.prepare(`
      UPDATE ${SESSION_TABLE}
      SET status = 'revoked',
          revoked_at = ?2
      WHERE session_id = ?1
        AND status = 'init';
    `).bind(sessionId, nowIso()).run()
  }

  return failCount
}

export async function revokeAdminEmergencySession(event: H3Event, sessionId: string) {
  const db = requireDb(event)
  await ensureSchema(db)
  await db.prepare(`
    UPDATE ${SESSION_TABLE}
    SET status = 'revoked',
        revoked_at = ?2
    WHERE session_id = ?1
      AND status IN ('init', 'verified');
  `).bind(sessionId, nowIso()).run()
}

export async function createEmergencyJti(
  event: H3Event,
  input: { jti: string, sessionId: string, scope: string, expiresAt: string },
) {
  const db = requireDb(event)
  await ensureSchema(db)
  const issuedAt = nowIso()
  await db.prepare(`
    INSERT INTO ${JTI_TABLE} (jti, session_id, scope, issued_at, used_at, expires_at)
    VALUES (?1, ?2, ?3, ?4, NULL, ?5);
  `).bind(
    input.jti,
    input.sessionId,
    input.scope,
    issuedAt,
    input.expiresAt,
  ).run()
}

export async function consumeEmergencyJti(event: H3Event, jti: string): Promise<boolean> {
  const db = requireDb(event)
  await ensureSchema(db)
  const now = nowIso()
  const result = await db.prepare(`
    UPDATE ${JTI_TABLE}
    SET used_at = ?2
    WHERE jti = ?1
      AND used_at IS NULL
      AND expires_at > ?2;
  `).bind(jti, now).run()
  const changes = Number((result as any)?.meta?.changes ?? 0)
  return changes === 1
}

export async function recordEmergencyAttempt(event: H3Event, input: {
  sessionId: string
  ipHash?: string | null
  adminHintHash?: string | null
  dfpHash?: string | null
  action: EmergencyAction
  success: boolean
  reason?: string | null
}) {
  const db = requireDb(event)
  await ensureSchema(db)
  await db.prepare(`
    INSERT INTO ${ATTEMPT_TABLE} (
      id, session_id, ip_hash, admin_hint_hash, dfp_hash,
      action, success, reason, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9);
  `).bind(
    randomUUID(),
    input.sessionId,
    input.ipHash ?? null,
    input.adminHintHash ?? null,
    input.dfpHash ?? null,
    input.action,
    input.success ? 1 : 0,
    input.reason ?? null,
    nowIso(),
  ).run()
}

export async function createAdminRecoveryCode(event: H3Event, input: {
  adminId: string
  recoveryCode: string
  expiresAt?: string | null
}) {
  const db = requireDb(event)
  await ensureSchema(db)
  const saltedValue = normalizeRecoveryCode(event, input.recoveryCode)
  const salt = randomUUID().replace(/-/g, '').slice(0, 16)
  const codeHash = await hashPassword(saltedValue, salt)
  await db.prepare(`
    INSERT INTO ${RECOVERY_CODE_TABLE} (
      id, admin_id, code_hash, salt, used_at, created_at, expires_at
    ) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6);
  `).bind(
    randomUUID(),
    input.adminId,
    codeHash,
    salt,
    nowIso(),
    input.expiresAt ?? null,
  ).run()
}

export async function verifyAndConsumeAdminRecoveryCode(
  event: H3Event,
  input: { adminId: string, recoveryCode: string },
): Promise<boolean> {
  const db = requireDb(event)
  await ensureSchema(db)
  const now = nowIso()
  const rows = await db.prepare(`
    SELECT id, code_hash, salt
    FROM ${RECOVERY_CODE_TABLE}
    WHERE admin_id = ?1
      AND used_at IS NULL
      AND (expires_at IS NULL OR expires_at > ?2)
    ORDER BY created_at DESC
    LIMIT 50;
  `).bind(input.adminId, now).all<{ id: string, code_hash: string, salt: string }>()

  const normalized = normalizeRecoveryCode(event, input.recoveryCode)
  for (const row of rows.results ?? []) {
    const matched = await verifyPassword(normalized, row.salt, row.code_hash)
    if (!matched)
      continue

    const consumeResult = await db.prepare(`
      UPDATE ${RECOVERY_CODE_TABLE}
      SET used_at = ?2
      WHERE id = ?1
        AND used_at IS NULL;
    `).bind(row.id, now).run()
    const changes = Number((consumeResult as any)?.meta?.changes ?? 0)
    if (changes === 1)
      return true
  }

  return false
}

