import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { requirePilotDatabase } from './pilot-store'

const LOCAL_USER_TABLE = 'pilot_auth_users'
const PASSWORD_HASH_PREFIX = 'scrypt'
const DEFAULT_USER_STATUS = 1

export const PILOT_LOCAL_USER_ID_PREFIX = 'pilot_local_'

export interface PilotLocalUserRecord {
  userId: string
  email: string
  nickname: string
  status: number
  passwordHash: string
  createdAt: string
  updatedAt: string
  lastLoginAt: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

export function normalizePilotLocalEmail(email: unknown): string {
  return normalizeText(email).toLowerCase()
}

export function isPilotLocalEmail(email: string): boolean {
  const normalized = normalizePilotLocalEmail(email)
  if (!normalized || normalized.length > 120) {
    return false
  }

  const atIndex = normalized.indexOf('@')
  if (atIndex <= 0 || atIndex >= normalized.length - 1) {
    return false
  }

  const domain = normalized.slice(atIndex + 1)
  if (!domain || domain.startsWith('.') || domain.endsWith('.')) {
    return false
  }

  return domain.includes('.')
}

export function normalizePilotLocalNickname(nickname: unknown, email: string): string {
  const normalized = normalizeText(nickname)
  if (normalized) {
    return normalized.slice(0, 32)
  }

  const emailPrefix = normalizePilotLocalEmail(email).split('@')[0] || 'Pilot User'
  return emailPrefix.slice(0, 32)
}

export function isPilotLocalUserId(userId: string): boolean {
  return normalizeText(userId).startsWith(PILOT_LOCAL_USER_ID_PREFIX)
}

function createPilotLocalUserId(): string {
  return `${PILOT_LOCAL_USER_ID_PREFIX}${randomBytes(8).toString('hex')}`
}

function createPasswordDigest(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${PASSWORD_HASH_PREFIX}$${salt}$${hash}`
}

function verifyPasswordDigest(password: string, digest: string): boolean {
  const normalized = normalizeText(digest)
  if (!normalized) {
    return false
  }

  const [prefix, salt, hashHex] = normalized.split('$')
  if (prefix !== PASSWORD_HASH_PREFIX || !salt || !hashHex) {
    return false
  }

  const actual = Buffer.from(hashHex, 'hex')
  const expected = scryptSync(password, salt, actual.length)

  if (actual.length !== expected.length) {
    return false
  }

  return timingSafeEqual(actual, expected)
}

function mapUserRow(row: {
  user_id: string
  email: string
  nickname: string
  status: number | string
  password_hash: string
  created_at: string
  updated_at: string
  last_login_at: string
}): PilotLocalUserRecord {
  return {
    userId: String(row.user_id || ''),
    email: normalizePilotLocalEmail(row.email),
    nickname: String(row.nickname || ''),
    status: Number(row.status || DEFAULT_USER_STATUS),
    passwordHash: String(row.password_hash || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    lastLoginAt: String(row.last_login_at || ''),
  }
}

export async function ensurePilotLocalAuthSchema(event: H3Event): Promise<void> {
  const db = requirePilotDatabase(event)

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${LOCAL_USER_TABLE} (
      user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      nickname TEXT NOT NULL,
      status INTEGER NOT NULL DEFAULT 1,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pilot_auth_users_email
    ON ${LOCAL_USER_TABLE}(email);
  `).run()
}

export async function getPilotLocalUserByEmail(
  event: H3Event,
  email: string,
): Promise<PilotLocalUserRecord | null> {
  const db = requirePilotDatabase(event)
  const normalizedEmail = normalizePilotLocalEmail(email)
  if (!normalizedEmail) {
    return null
  }

  const row = await db.prepare(`
    SELECT user_id, email, nickname, status, password_hash, created_at, updated_at, last_login_at
    FROM ${LOCAL_USER_TABLE}
    WHERE email = ?1
    LIMIT 1
  `).bind(normalizedEmail).first<{
    user_id: string
    email: string
    nickname: string
    status: number | string
    password_hash: string
    created_at: string
    updated_at: string
    last_login_at: string
  }>()

  return row ? mapUserRow(row) : null
}

export async function getPilotLocalUserByUserId(
  event: H3Event,
  userId: string,
): Promise<PilotLocalUserRecord | null> {
  const db = requirePilotDatabase(event)
  const normalizedUserId = normalizeText(userId)
  if (!normalizedUserId) {
    return null
  }

  const row = await db.prepare(`
    SELECT user_id, email, nickname, status, password_hash, created_at, updated_at, last_login_at
    FROM ${LOCAL_USER_TABLE}
    WHERE user_id = ?1
    LIMIT 1
  `).bind(normalizedUserId).first<{
    user_id: string
    email: string
    nickname: string
    status: number | string
    password_hash: string
    created_at: string
    updated_at: string
    last_login_at: string
  }>()

  return row ? mapUserRow(row) : null
}

export async function createPilotLocalUser(
  event: H3Event,
  input: {
    email: string
    password: string
    nickname?: string
  },
): Promise<PilotLocalUserRecord> {
  const db = requirePilotDatabase(event)
  const email = normalizePilotLocalEmail(input.email)
  const nickname = normalizePilotLocalNickname(input.nickname, email)
  const now = nowIso()
  const userId = createPilotLocalUserId()
  const passwordHash = createPasswordDigest(input.password)

  await db.prepare(`
    INSERT INTO ${LOCAL_USER_TABLE}
      (user_id, email, nickname, status, password_hash, created_at, updated_at, last_login_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
  `).bind(
    userId,
    email,
    nickname,
    DEFAULT_USER_STATUS,
    passwordHash,
    now,
    now,
    now,
  ).run()

  return {
    userId,
    email,
    nickname,
    status: DEFAULT_USER_STATUS,
    passwordHash,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  }
}

export async function verifyPilotLocalUserLogin(
  event: H3Event,
  input: {
    email: string
    password: string
  },
): Promise<PilotLocalUserRecord | null> {
  const user = await getPilotLocalUserByEmail(event, input.email)
  if (!user) {
    return null
  }

  if (user.status !== DEFAULT_USER_STATUS) {
    return null
  }

  if (!verifyPasswordDigest(String(input.password || ''), user.passwordHash)) {
    return null
  }

  await touchPilotLocalUserLogin(event, user.userId)

  return {
    ...user,
    lastLoginAt: nowIso(),
  }
}

export async function touchPilotLocalUserLogin(event: H3Event, userId: string): Promise<void> {
  const db = requirePilotDatabase(event)
  const normalizedUserId = normalizeText(userId)
  if (!normalizedUserId) {
    return
  }

  const now = nowIso()
  await db.prepare(`
    UPDATE ${LOCAL_USER_TABLE}
    SET updated_at = ?2,
        last_login_at = ?2
    WHERE user_id = ?1
  `).bind(normalizedUserId, now).run()
}
