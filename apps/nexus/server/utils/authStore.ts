import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import crypto from 'uncrypto'
import { readCloudflareBindings } from './cloudflare'
import { generatePasswordSalt, hashPassword, verifyPassword } from './authCrypto'

const USERS_TABLE = 'auth_users'
const CREDENTIALS_TABLE = 'auth_credentials'
const ACCOUNTS_TABLE = 'auth_accounts'
const VERIFICATION_TABLE = 'auth_verification_tokens'
const LOGIN_TOKEN_TABLE = 'auth_login_tokens'
const PASSWORD_RESET_TABLE = 'auth_password_reset_tokens'
const PASSKEYS_TABLE = 'auth_passkeys'
const WEBAUTHN_CHALLENGE_TABLE = 'auth_webauthn_challenges'
const DEVICES_TABLE = 'auth_devices'
const LOGIN_HISTORY_TABLE = 'auth_login_history'
const MERGE_LOGS_TABLE = 'auth_user_merges'

let authSchemaInitialized = false

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

function requireDatabase(event: H3Event): D1Database {
  const db = getD1Database(event)
  if (!db) {
    throw new Error('Cloudflare D1 database is not available.')
  }
  return db
}

async function ensureAuthSchema(db: D1Database) {
  if (authSchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${USERS_TABLE} (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      image TEXT,
      email_verified TEXT,
      email_state TEXT NOT NULL DEFAULT 'unverified',
      role TEXT NOT NULL DEFAULT 'user',
      locale TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      merged_to_user_id TEXT,
      merged_at TEXT,
      merged_by_user_id TEXT,
      disabled_at TEXT,
      created_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${CREDENTIALS_TABLE} (
      user_id TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${ACCOUNTS_TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(provider, provider_account_id),
      FOREIGN KEY (user_id) REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${VERIFICATION_TABLE} (
      identifier TEXT NOT NULL,
      token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (identifier, token)
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${LOGIN_TOKEN_TABLE} (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      reason TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${PASSWORD_RESET_TABLE} (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${PASSKEYS_TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      FOREIGN KEY (user_id) REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${WEBAUTHN_CHALLENGE_TABLE} (
      challenge TEXT PRIMARY KEY,
      user_id TEXT,
      type TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DEVICES_TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_name TEXT,
      platform TEXT,
      user_agent TEXT,
      last_seen_at TEXT,
      created_at TEXT NOT NULL,
      revoked_at TEXT,
      token_version INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${LOGIN_HISTORY_TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      device_id TEXT,
      ip TEXT,
      user_agent TEXT,
      success INTEGER NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_auth_users_email ON ${USERS_TABLE}(email);
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${MERGE_LOGS_TABLE} (
      id TEXT PRIMARY KEY,
      source_user_id TEXT NOT NULL,
      target_user_id TEXT NOT NULL,
      merged_by_user_id TEXT,
      reason TEXT,
      metadata TEXT,
      merged_at TEXT NOT NULL,
      FOREIGN KEY (source_user_id) REFERENCES ${USERS_TABLE}(id) ON DELETE SET NULL,
      FOREIGN KEY (target_user_id) REFERENCES ${USERS_TABLE}(id) ON DELETE SET NULL,
      FOREIGN KEY (merged_by_user_id) REFERENCES ${USERS_TABLE}(id) ON DELETE SET NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_auth_merges_source ON ${MERGE_LOGS_TABLE}(source_user_id);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_auth_merges_target ON ${MERGE_LOGS_TABLE}(target_user_id);
  `).run()

  const userColumns = await db.prepare(`PRAGMA table_info(${USERS_TABLE});`).all<{ name: string }>()
  const addUserColumnIfMissing = async (column: string, ddl: string) => {
    if (!userColumns.results?.some(item => item.name === column)) {
      await db.prepare(`ALTER TABLE ${USERS_TABLE} ADD COLUMN ${ddl};`).run()
    }
  }

  await addUserColumnIfMissing('status', "status TEXT NOT NULL DEFAULT 'active'")
  await addUserColumnIfMissing('email_state', "email_state TEXT NOT NULL DEFAULT 'unverified'")
  await addUserColumnIfMissing('merged_to_user_id', 'merged_to_user_id TEXT')
  await addUserColumnIfMissing('merged_at', 'merged_at TEXT')
  await addUserColumnIfMissing('merged_by_user_id', 'merged_by_user_id TEXT')
  await addUserColumnIfMissing('disabled_at', 'disabled_at TEXT')

  await db.prepare(`
    UPDATE ${USERS_TABLE}
    SET email_state = 'verified'
    WHERE email_verified IS NOT NULL AND email_state != 'verified'
  `).run()
  await db.prepare(`
    UPDATE ${USERS_TABLE}
    SET email_state = 'unverified'
    WHERE email_state IS NULL
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_auth_accounts_user ON ${ACCOUNTS_TABLE}(user_id);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_auth_devices_user ON ${DEVICES_TABLE}(user_id);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_auth_login_history_user ON ${LOGIN_HISTORY_TABLE}(user_id);
  `).run()

  authSchemaInitialized = true
}

export type UserStatus = 'active' | 'merged' | 'disabled'
export type EmailState = 'verified' | 'unverified' | 'missing'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  image: string | null
  emailVerified: string | null
  emailState: EmailState
  role: string
  locale: string | null
  status: UserStatus
  mergedToUserId: string | null
  mergedAt: string | null
  mergedByUserId: string | null
  disabledAt: string | null
  createdAt: string
}

export interface AuthDevice {
  id: string
  userId: string
  deviceName: string | null
  platform: string | null
  userAgent: string | null
  lastSeenAt: string | null
  createdAt: string
  revokedAt: string | null
  tokenVersion: number
}

export interface LinkedAccount {
  provider: string
  providerAccountId: string
}

function mapUser(row: Record<string, any> | null): AuthUser | null {
  if (!row)
    return null
  const emailState = (row.email_state as EmailState | null) ?? (row.email_verified ? 'verified' : 'unverified')
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? null,
    image: row.image ?? null,
    emailVerified: row.email_verified ?? null,
    emailState,
    role: row.role ?? 'user',
    locale: row.locale ?? null,
    status: (row.status as UserStatus) || 'active',
    mergedToUserId: row.merged_to_user_id ?? null,
    mergedAt: row.merged_at ?? null,
    mergedByUserId: row.merged_by_user_id ?? null,
    disabledAt: row.disabled_at ?? null,
    createdAt: row.created_at
  }
}

function mapDevice(row: Record<string, any> | null): AuthDevice | null {
  if (!row)
    return null
  return {
    id: row.id,
    userId: row.user_id,
    deviceName: row.device_name ?? null,
    platform: row.platform ?? null,
    userAgent: row.user_agent ?? null,
    lastSeenAt: row.last_seen_at ?? null,
    createdAt: row.created_at,
    revokedAt: row.revoked_at ?? null,
    tokenVersion: Number(row.token_version ?? 0)
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isUserActive(user: AuthUser | null): user is AuthUser {
  return Boolean(user && user.status === 'active')
}

export async function createUser(
  event: H3Event,
  data: {
    email: string
    name?: string | null
    image?: string | null
    locale?: string | null
    emailVerified?: string | null
    emailState?: EmailState
    status?: UserStatus
  },
): Promise<AuthUser> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const email = normalizeEmail(data.email)
  const status: UserStatus = data.status ?? 'active'
  const emailVerified = data.emailVerified ?? null
  const emailState: EmailState = data.emailState ?? (emailVerified ? 'verified' : 'unverified')
  await db.prepare(`
    INSERT INTO ${USERS_TABLE} (id, email, name, image, email_verified, email_state, role, locale, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'user', ?, ?, ?)
  `).bind(
    id,
    email,
    data.name ?? null,
    data.image ?? null,
    emailVerified,
    emailState,
    data.locale ?? null,
    status,
    now
  ).run()
  return {
    id,
    email,
    name: data.name ?? null,
    image: data.image ?? null,
    emailVerified,
    emailState,
    role: 'user',
    locale: data.locale ?? null,
    status,
    mergedToUserId: null,
    mergedAt: null,
    mergedByUserId: null,
    disabledAt: null,
    createdAt: now
  }
}

export async function getUserByEmail(event: H3Event, email: string): Promise<AuthUser | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`SELECT * FROM ${USERS_TABLE} WHERE email = ?`).bind(normalizeEmail(email)).first()
  return mapUser(row as Record<string, any> | null)
}

export async function getUserById(event: H3Event, userId: string): Promise<AuthUser | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`SELECT * FROM ${USERS_TABLE} WHERE id = ?`).bind(userId).first()
  return mapUser(row as Record<string, any> | null)
}

export async function setEmailVerified(event: H3Event, userId: string): Promise<void> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const now = new Date().toISOString()
  await db.prepare(`UPDATE ${USERS_TABLE} SET email_verified = ?, email_state = 'verified' WHERE id = ?`).bind(now, userId).run()
}

export async function setEmailState(event: H3Event, userId: string, emailState: EmailState): Promise<AuthUser | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  await db.prepare(`UPDATE ${USERS_TABLE} SET email_state = ? WHERE id = ?`).bind(emailState, userId).run()
  return getUserById(event, userId)
}

export async function setUserEmail(event: H3Event, userId: string, email: string, emailState: EmailState, emailVerified: string | null = null): Promise<AuthUser | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  await db.prepare(`UPDATE ${USERS_TABLE} SET email = ?, email_verified = ?, email_state = ? WHERE id = ?`)
    .bind(normalizeEmail(email), emailVerified, emailState, userId)
    .run()
  return getUserById(event, userId)
}

export async function updateUserProfile(event: H3Event, userId: string, payload: { name?: string | null, image?: string | null, locale?: string | null }): Promise<AuthUser | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  await db.prepare(`
    UPDATE ${USERS_TABLE}
    SET name = COALESCE(?, name),
        image = COALESCE(?, image),
        locale = COALESCE(?, locale)
    WHERE id = ?
  `).bind(payload.name ?? null, payload.image ?? null, payload.locale ?? null, userId).run()
  return getUserById(event, userId)
}

export async function setUserPassword(event: H3Event, userId: string, password: string): Promise<void> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const salt = generatePasswordSalt()
  const hash = await hashPassword(password, salt)
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO ${CREDENTIALS_TABLE} (user_id, password_hash, password_salt, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, password_salt = excluded.password_salt, updated_at = excluded.updated_at
  `).bind(userId, hash, salt, now).run()
}

export async function verifyUserPassword(event: H3Event, email: string, password: string): Promise<AuthUser | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const user = await getUserByEmail(event, email)
  if (!user || user.status !== 'active')
    return null
  const row = await db.prepare(`SELECT password_hash, password_salt FROM ${CREDENTIALS_TABLE} WHERE user_id = ?`).bind(user.id).first()
  if (!row)
    return null
  const ok = await verifyPassword(password, row.password_salt as string, row.password_hash as string)
  return ok ? user : null
}

function generateToken(bytes = 32): string {
  const data = new Uint8Array(bytes)
  crypto.getRandomValues(data)
  return Buffer.from(data).toString('hex')
}

function base64UrlEncode(input: Uint8Array | Buffer): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function generateWebAuthnChallenge(bytes = 32): string {
  const data = new Uint8Array(bytes)
  crypto.getRandomValues(data)
  return base64UrlEncode(data)
}

export async function createVerificationToken(event: H3Event, email: string, ttlMs: number, tokenValue?: string): Promise<string> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const token = tokenValue ?? generateToken(32)
  const expiresAt = new Date(Date.now() + ttlMs).toISOString()
  await db.prepare(`
    INSERT INTO ${VERIFICATION_TABLE} (identifier, token, expires_at)
    VALUES (?, ?, ?)
  `).bind(normalizeEmail(email), token, expiresAt).run()
  return token
}

export async function useVerificationToken(event: H3Event, email: string, token: string): Promise<{ identifier: string, token: string, expiresAt: string } | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`
    SELECT expires_at FROM ${VERIFICATION_TABLE}
    WHERE identifier = ? AND token = ?
  `).bind(normalizeEmail(email), token).first()
  if (!row)
    return null
  const expires = Date.parse(row.expires_at as string)
  if (Number.isNaN(expires) || expires <= Date.now())
    return null
  await db.prepare(`
    DELETE FROM ${VERIFICATION_TABLE}
    WHERE identifier = ? AND token = ?
  `).bind(normalizeEmail(email), token).run()
  return { identifier: normalizeEmail(email), token, expiresAt: row.expires_at as string }
}

export async function createLoginToken(event: H3Event, userId: string, reason: string | null, ttlMs: number): Promise<string> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const token = generateToken(32)
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + ttlMs).toISOString()
  await db.prepare(`
    INSERT INTO ${LOGIN_TOKEN_TABLE} (token, user_id, reason, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(token, userId, reason, expiresAt, now).run()
  return token
}

export async function createWebAuthnChallenge(event: H3Event, payload: { userId?: string | null, type: 'register' | 'login', ttlMs: number }): Promise<string> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const token = generateWebAuthnChallenge(32)
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + payload.ttlMs).toISOString()
  await db.prepare(`
    INSERT INTO ${WEBAUTHN_CHALLENGE_TABLE} (challenge, user_id, type, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(token, payload.userId ?? null, payload.type, expiresAt, now).run()
  return token
}

export async function consumeWebAuthnChallenge(event: H3Event, challenge: string, type: 'register' | 'login'): Promise<{ userId: string | null } | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`
    SELECT user_id, expires_at FROM ${WEBAUTHN_CHALLENGE_TABLE}
    WHERE challenge = ? AND type = ?
  `).bind(challenge, type).first()
  if (!row)
    return null
  const expires = Date.parse(row.expires_at as string)
  if (Number.isNaN(expires) || expires <= Date.now())
    return null
  await db.prepare(`DELETE FROM ${WEBAUTHN_CHALLENGE_TABLE} WHERE challenge = ?`).bind(challenge).run()
  return { userId: (row.user_id as string | null) ?? null }
}

export async function consumeLoginToken(event: H3Event, token: string, reason?: string | null): Promise<AuthUser | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`
    SELECT user_id, expires_at, reason FROM ${LOGIN_TOKEN_TABLE} WHERE token = ?
  `).bind(token).first()
  if (!row)
    return null
  if (reason && row.reason !== reason)
    return null
  const expires = Date.parse(row.expires_at as string)
  if (Number.isNaN(expires) || expires <= Date.now())
    return null
  await db.prepare(`DELETE FROM ${LOGIN_TOKEN_TABLE} WHERE token = ?`).bind(token).run()
  return getUserById(event, row.user_id as string)
}

export async function createPasswordResetToken(event: H3Event, userId: string, ttlMs: number): Promise<string> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const token = generateToken(32)
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + ttlMs).toISOString()
  await db.prepare(`
    INSERT INTO ${PASSWORD_RESET_TABLE} (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(token, userId, expiresAt, now).run()
  return token
}

export async function consumePasswordResetToken(event: H3Event, token: string): Promise<string | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`
    SELECT user_id, expires_at FROM ${PASSWORD_RESET_TABLE} WHERE token = ?
  `).bind(token).first()
  if (!row)
    return null
  const expires = Date.parse(row.expires_at as string)
  if (Number.isNaN(expires) || expires <= Date.now())
    return null
  await db.prepare(`DELETE FROM ${PASSWORD_RESET_TABLE} WHERE token = ?`).bind(token).run()
  return row.user_id as string
}

export async function getUserByAccount(event: H3Event, provider: string, providerAccountId: string): Promise<AuthUser | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`
    SELECT u.* FROM ${ACCOUNTS_TABLE} a
    JOIN ${USERS_TABLE} u ON u.id = a.user_id
    WHERE a.provider = ? AND a.provider_account_id = ?
  `).bind(provider, providerAccountId).first()
  return mapUser(row as Record<string, any> | null)
}

export async function listUserLinkedAccounts(event: H3Event, userId: string): Promise<LinkedAccount[]> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const result = await db.prepare(`
    SELECT provider, provider_account_id
    FROM ${ACCOUNTS_TABLE}
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).bind(userId).all()

  const rows = (result.results ?? []) as Array<{ provider?: string, provider_account_id?: string }>
  return rows
    .filter(row => typeof row.provider === 'string' && typeof row.provider_account_id === 'string')
    .map(row => ({
      provider: row.provider as string,
      providerAccountId: row.provider_account_id as string,
    }))
}

export async function listPasskeys(event: H3Event, userId: string) {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const result = await db.prepare(`
    SELECT * FROM ${PASSKEYS_TABLE} WHERE user_id = ? ORDER BY created_at DESC
  `).bind(userId).all()
  return result.results
}

export async function getPasskeyByCredentialId(event: H3Event, credentialId: string) {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  return db.prepare(`SELECT * FROM ${PASSKEYS_TABLE} WHERE credential_id = ?`).bind(credentialId).first()
}

export async function createPasskey(event: H3Event, payload: { userId: string, credentialId: string, publicKeyJwk: JsonWebKey, counter: number, transports?: string[] | null }) {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO ${PASSKEYS_TABLE} (id, user_id, credential_id, public_key, counter, transports, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    payload.userId,
    payload.credentialId,
    JSON.stringify(payload.publicKeyJwk),
    payload.counter,
    payload.transports ? JSON.stringify(payload.transports) : null,
    now
  ).run()
}

export async function updatePasskeyCounter(event: H3Event, credentialId: string, counter: number) {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const now = new Date().toISOString()
  await db.prepare(`
    UPDATE ${PASSKEYS_TABLE}
    SET counter = ?, last_used_at = ?
    WHERE credential_id = ?
  `).bind(counter, now, credentialId).run()
}

export async function linkAccount(event: H3Event, userId: string, provider: string, providerAccountId: string): Promise<void> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT OR IGNORE INTO ${ACCOUNTS_TABLE} (id, user_id, provider, provider_account_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, userId, provider, providerAccountId, now).run()
}

export async function unlinkAccount(event: H3Event, userId: string, provider: string): Promise<void> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  await db.prepare(`
    DELETE FROM ${ACCOUNTS_TABLE} WHERE user_id = ? AND provider = ?
  `).bind(userId, provider).run()
}

async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  const row = await db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?
  `).bind(tableName).first()
  return Boolean(row?.name)
}

export interface MergeUserInput {
  sourceUserId: string
  targetUserId: string
  mergedByUserId?: string | null
  reason?: string | null
  metadata?: Record<string, any> | null
}

export async function mergeUsers(event: H3Event, input: MergeUserInput): Promise<void> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)

  if (input.sourceUserId === input.targetUserId) {
    throw new Error('Source and target users must be different.')
  }

  const source = await getUserById(event, input.sourceUserId)
  const target = await getUserById(event, input.targetUserId)
  if (!source || !target) {
    throw new Error('User not found.')
  }
  if (source.status === 'merged') {
    throw new Error('Source user already merged.')
  }
  if (target.status !== 'active') {
    throw new Error('Target user is not active.')
  }

  const now = new Date().toISOString()
  const mergedBy = input.mergedByUserId ?? null

  await db.prepare(`
    INSERT OR IGNORE INTO ${CREDENTIALS_TABLE} (user_id, password_hash, password_salt, updated_at)
    SELECT ?, password_hash, password_salt, updated_at
    FROM ${CREDENTIALS_TABLE}
    WHERE user_id = ?
  `).bind(input.targetUserId, input.sourceUserId).run()

  await db.prepare(`DELETE FROM ${CREDENTIALS_TABLE} WHERE user_id = ?`).bind(input.sourceUserId).run()

  await db.prepare(`
    UPDATE ${ACCOUNTS_TABLE}
    SET user_id = ?
    WHERE user_id = ?
  `).bind(input.targetUserId, input.sourceUserId).run()

  await db.prepare(`
    UPDATE ${PASSKEYS_TABLE}
    SET user_id = ?
    WHERE user_id = ?
  `).bind(input.targetUserId, input.sourceUserId).run()

  await db.prepare(`
    UPDATE ${DEVICES_TABLE}
    SET user_id = ?
    WHERE user_id = ?
  `).bind(input.targetUserId, input.sourceUserId).run()

  await db.prepare(`
    UPDATE ${LOGIN_HISTORY_TABLE}
    SET user_id = ?
    WHERE user_id = ?
  `).bind(input.targetUserId, input.sourceUserId).run()

  await db.prepare(`DELETE FROM ${LOGIN_TOKEN_TABLE} WHERE user_id = ?`).bind(input.sourceUserId).run()
  await db.prepare(`DELETE FROM ${PASSWORD_RESET_TABLE} WHERE user_id = ?`).bind(input.sourceUserId).run()
  await db.prepare(`DELETE FROM ${WEBAUTHN_CHALLENGE_TABLE} WHERE user_id = ?`).bind(input.sourceUserId).run()

  if (await tableExists(db, 'sync_items')) {
    await db.prepare(`
      INSERT INTO sync_items (user_id, namespace, key, value_json, updated_at, updated_by_device_id)
      SELECT ?, namespace, key, value_json, updated_at, updated_by_device_id
      FROM sync_items
      WHERE user_id = ?
      ON CONFLICT(user_id, namespace, key) DO UPDATE SET
        value_json = CASE WHEN excluded.updated_at > sync_items.updated_at THEN excluded.value_json ELSE sync_items.value_json END,
        updated_at = CASE WHEN excluded.updated_at > sync_items.updated_at THEN excluded.updated_at ELSE sync_items.updated_at END,
        updated_by_device_id = CASE WHEN excluded.updated_at > sync_items.updated_at THEN excluded.updated_by_device_id ELSE sync_items.updated_by_device_id END
    `).bind(input.targetUserId, input.sourceUserId).run()

    await db.prepare(`DELETE FROM sync_items WHERE user_id = ?`).bind(input.sourceUserId).run()
  }

  if (await tableExists(db, 'api_keys')) {
    await db.prepare(`
      UPDATE api_keys
      SET user_id = ?1
      WHERE user_id = ?2
    `).bind(input.targetUserId, input.sourceUserId).run()
  }

  if (await tableExists(db, 'plugins')) {
    await db.prepare(`
      UPDATE plugins
      SET user_id = ?1
      WHERE user_id = ?2
    `).bind(input.targetUserId, input.sourceUserId).run()
  }

  if (await tableExists(db, 'plugin_reviews')) {
    await db.prepare(`
      DELETE FROM plugin_reviews
      WHERE user_id = ?1
        AND plugin_id IN (SELECT plugin_id FROM plugin_reviews WHERE user_id = ?2)
    `).bind(input.sourceUserId, input.targetUserId).run()

    await db.prepare(`
      UPDATE plugin_reviews
      SET user_id = ?1
      WHERE user_id = ?2
    `).bind(input.targetUserId, input.sourceUserId).run()
  }

  if (await tableExists(db, 'plugin_ratings')) {
    await db.prepare(`
      DELETE FROM plugin_ratings
      WHERE user_id = ?1
        AND plugin_id IN (SELECT plugin_id FROM plugin_ratings WHERE user_id = ?2)
    `).bind(input.sourceUserId, input.targetUserId).run()

    await db.prepare(`
      UPDATE plugin_ratings
      SET user_id = ?1
      WHERE user_id = ?2
    `).bind(input.targetUserId, input.sourceUserId).run()
  }

  if (await tableExists(db, 'activation_logs')) {
    await db.prepare(`
      UPDATE activation_logs
      SET user_id = ?1
      WHERE user_id = ?2
    `).bind(input.targetUserId, input.sourceUserId).run()
  }

  if (await tableExists(db, 'telemetry_events')) {
    await db.prepare(`
      UPDATE telemetry_events
      SET user_id = ?1
      WHERE user_id = ?2
    `).bind(input.targetUserId, input.sourceUserId).run()
  }

  await db.prepare(`
    UPDATE ${USERS_TABLE}
    SET status = 'merged',
        merged_to_user_id = ?,
        merged_at = ?,
        merged_by_user_id = ?,
        disabled_at = COALESCE(disabled_at, ?)
    WHERE id = ?
  `).bind(input.targetUserId, now, mergedBy, now, input.sourceUserId).run()

  await db.prepare(`
    INSERT INTO ${MERGE_LOGS_TABLE} (id, source_user_id, target_user_id, merged_by_user_id, reason, metadata, merged_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    input.sourceUserId,
    input.targetUserId,
    mergedBy,
    input.reason ?? null,
    input.metadata ? JSON.stringify(input.metadata) : null,
    now
  ).run()
}

function getRequestIp(event: H3Event): string | null {
  const header = event.node.req.headers
  const forwarded = header['x-forwarded-for']
  if (typeof forwarded === 'string')
    return forwarded.split(',')[0]?.trim() || null
  const cfConnecting = header['cf-connecting-ip']
  if (typeof cfConnecting === 'string')
    return cfConnecting
  return null
}

function getUserAgent(event: H3Event): string | null {
  const ua = event.node.req.headers['user-agent']
  return typeof ua === 'string' ? ua : null
}

export async function upsertDevice(event: H3Event, userId: string, deviceId: string, data?: { deviceName?: string | null, platform?: string | null }): Promise<AuthDevice> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const now = new Date().toISOString()
  const existing = await db.prepare(`SELECT * FROM ${DEVICES_TABLE} WHERE id = ? AND user_id = ?`).bind(deviceId, userId).first()
  if (existing) {
    await db.prepare(`
      UPDATE ${DEVICES_TABLE}
      SET device_name = COALESCE(?, device_name),
          platform = COALESCE(?, platform),
          user_agent = COALESCE(?, user_agent),
          last_seen_at = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      data?.deviceName ?? null,
      data?.platform ?? null,
      getUserAgent(event),
      now,
      deviceId,
      userId
    ).run()
  }
  else {
    await db.prepare(`
      INSERT INTO ${DEVICES_TABLE} (id, user_id, device_name, platform, user_agent, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      deviceId,
      userId,
      data?.deviceName ?? null,
      data?.platform ?? null,
      getUserAgent(event),
      now,
      now
    ).run()
  }
  const row = await db.prepare(`SELECT * FROM ${DEVICES_TABLE} WHERE id = ? AND user_id = ?`).bind(deviceId, userId).first()
  const device = mapDevice(row as Record<string, any> | null)
  if (!device) {
    throw new Error('Failed to upsert device.')
  }
  return device
}

export async function getDevice(event: H3Event, userId: string, deviceId: string): Promise<AuthDevice | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`SELECT * FROM ${DEVICES_TABLE} WHERE id = ? AND user_id = ?`).bind(deviceId, userId).first()
  return mapDevice(row as Record<string, any> | null)
}

export async function listDevices(event: H3Event, userId: string): Promise<AuthDevice[]> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const result = await db.prepare(`SELECT * FROM ${DEVICES_TABLE} WHERE user_id = ? ORDER BY created_at DESC`).bind(userId).all()
  return result.results.map(row => mapDevice(row as Record<string, any>)!).filter(Boolean)
}

export async function countActiveDevices(event: H3Event, userId: string): Promise<number> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`
    SELECT COUNT(*) as total
    FROM ${DEVICES_TABLE}
    WHERE user_id = ? AND revoked_at IS NULL
  `).bind(userId).first<{ total: number }>()
  return Number(row?.total ?? 0)
}

export async function revokeDevice(event: H3Event, userId: string, deviceId: string): Promise<void> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const now = new Date().toISOString()
  await db.prepare(`
    UPDATE ${DEVICES_TABLE}
    SET revoked_at = ?,
        token_version = token_version + 1
    WHERE id = ? AND user_id = ?
  `).bind(now, deviceId, userId).run()
}

export async function logLoginAttempt(event: H3Event, payload: { userId?: string | null, deviceId?: string | null, success: boolean, reason?: string | null }): Promise<void> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO ${LOGIN_HISTORY_TABLE} (id, user_id, device_id, ip, user_agent, success, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    payload.userId ?? null,
    payload.deviceId ?? null,
    getRequestIp(event),
    getUserAgent(event),
    payload.success ? 1 : 0,
    payload.reason ?? null,
    now
  ).run()
}

export async function listLoginHistory(event: H3Event, userId: string, days = 90) {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  await db.prepare(`DELETE FROM ${LOGIN_HISTORY_TABLE} WHERE created_at < ?`).bind(cutoff).run()
  const result = await db.prepare(`
    SELECT * FROM ${LOGIN_HISTORY_TABLE}
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 200
  `).bind(userId).all()
  return result.results
}

export function readDeviceId(event: H3Event): string | null {
  const header = event.node.req.headers['x-device-id']
  return typeof header === 'string' && header.trim().length > 0 ? header.trim() : null
}

export function readDeviceMetadata(event: H3Event): { deviceName?: string | null, platform?: string | null } {
  const deviceName = typeof event.node.req.headers['x-device-name'] === 'string'
    ? event.node.req.headers['x-device-name'] as string
    : null
  const platform = typeof event.node.req.headers['x-device-platform'] === 'string'
    ? event.node.req.headers['x-device-platform'] as string
    : null
  return { deviceName, platform }
}

export async function ensureDeviceForRequest(event: H3Event, userId: string): Promise<AuthDevice | null> {
  const deviceId = readDeviceId(event)
  if (!deviceId)
    return null
  return upsertDevice(event, userId, deviceId, readDeviceMetadata(event))
}
