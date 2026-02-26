import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import crypto from 'uncrypto'
import { readCloudflareBindings } from './cloudflare'
import { generatePasswordSalt, hashPassword, verifyPassword } from './authCrypto'
import { normalizeLocaleCode, type SupportedLocaleCode } from './locale'
import { resolveRequestGeo } from './requestGeo'

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
const DEVICE_AUTH_TABLE = 'auth_device_auth_requests'

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
    CREATE TABLE IF NOT EXISTS ${DEVICE_AUTH_TABLE} (
      device_code TEXT PRIMARY KEY,
      user_code TEXT NOT NULL UNIQUE,
      device_id TEXT NOT NULL,
      device_name TEXT,
      device_platform TEXT,
      client_type TEXT,
      request_ip TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      grant_type TEXT NOT NULL DEFAULT 'short',
      reject_reason TEXT,
      reject_message TEXT,
      reject_request_ip TEXT,
      reject_current_ip TEXT,
      rejected_at TEXT,
      browser_state TEXT NOT NULL DEFAULT 'unknown',
      browser_seen_at TEXT,
      browser_closed_at TEXT,
      user_id TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      approved_at TEXT,
      cancelled_at TEXT
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
      client_type TEXT,
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
      country_code TEXT,
      region_code TEXT,
      region_name TEXT,
      city TEXT,
      latitude REAL,
      longitude REAL,
      timezone TEXT,
      geo_source TEXT,
      client_type TEXT,
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

  const deviceAuthColumns = await db.prepare(`PRAGMA table_info(${DEVICE_AUTH_TABLE});`).all<{ name: string }>()
  const addDeviceAuthColumnIfMissing = async (column: string, ddl: string) => {
    if (!deviceAuthColumns.results?.some(item => item.name === column)) {
      await db.prepare(`ALTER TABLE ${DEVICE_AUTH_TABLE} ADD COLUMN ${ddl};`).run()
    }
  }

  await addDeviceAuthColumnIfMissing('grant_type', "grant_type TEXT NOT NULL DEFAULT 'short'")
  await addDeviceAuthColumnIfMissing('cancelled_at', 'cancelled_at TEXT')
  await addDeviceAuthColumnIfMissing('client_type', 'client_type TEXT')
  await addDeviceAuthColumnIfMissing('request_ip', 'request_ip TEXT')
  await addDeviceAuthColumnIfMissing('reject_reason', 'reject_reason TEXT')
  await addDeviceAuthColumnIfMissing('reject_message', 'reject_message TEXT')
  await addDeviceAuthColumnIfMissing('reject_request_ip', 'reject_request_ip TEXT')
  await addDeviceAuthColumnIfMissing('reject_current_ip', 'reject_current_ip TEXT')
  await addDeviceAuthColumnIfMissing('rejected_at', 'rejected_at TEXT')
  await addDeviceAuthColumnIfMissing('browser_state', "browser_state TEXT NOT NULL DEFAULT 'unknown'")
  await addDeviceAuthColumnIfMissing('browser_seen_at', 'browser_seen_at TEXT')
  await addDeviceAuthColumnIfMissing('browser_closed_at', 'browser_closed_at TEXT')

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

  const deviceColumns = await db.prepare(`PRAGMA table_info(${DEVICES_TABLE});`).all<{ name: string }>()
  const addDeviceColumnIfMissing = async (column: string, ddl: string) => {
    if (!deviceColumns.results?.some(item => item.name === column)) {
      await db.prepare(`ALTER TABLE ${DEVICES_TABLE} ADD COLUMN ${ddl};`).run()
    }
  }

  await addDeviceColumnIfMissing('client_type', 'client_type TEXT')

  const loginHistoryColumns = await db.prepare(`PRAGMA table_info(${LOGIN_HISTORY_TABLE});`).all<{ name: string }>()
  const addLoginHistoryColumnIfMissing = async (column: string, ddl: string) => {
    if (!loginHistoryColumns.results?.some(item => item.name === column)) {
      await db.prepare(`ALTER TABLE ${LOGIN_HISTORY_TABLE} ADD COLUMN ${ddl};`).run()
    }
  }

  await addLoginHistoryColumnIfMissing('country_code', 'country_code TEXT')
  await addLoginHistoryColumnIfMissing('region_code', 'region_code TEXT')
  await addLoginHistoryColumnIfMissing('region_name', 'region_name TEXT')
  await addLoginHistoryColumnIfMissing('city', 'city TEXT')
  await addLoginHistoryColumnIfMissing('latitude', 'latitude REAL')
  await addLoginHistoryColumnIfMissing('longitude', 'longitude REAL')
  await addLoginHistoryColumnIfMissing('timezone', 'timezone TEXT')
  await addLoginHistoryColumnIfMissing('geo_source', 'geo_source TEXT')
  await addLoginHistoryColumnIfMissing('client_type', 'client_type TEXT')

  authSchemaInitialized = true
}

export type UserStatus = 'active' | 'merged' | 'disabled'
export type EmailState = 'verified' | 'unverified' | 'missing'
export type AuthClientType = 'app' | 'cli' | 'external'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  image: string | null
  emailVerified: string | null
  emailState: EmailState
  role: string
  locale: SupportedLocaleCode | null
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
  clientType: AuthClientType | null
  userAgent: string | null
  lastSeenAt: string | null
  createdAt: string
  revokedAt: string | null
  tokenVersion: number
  lastLocation?: AuthGeoLocation | null
  lastLoginIpMasked?: string | null
  lastLoginAt?: string | null
}

export interface EvictedDeviceSummary {
  id: string
  deviceName: string | null
  platform: string | null
  lastSeenAt: string | null
}

export interface AuthGeoLocation {
  countryCode: string | null
  regionCode: string | null
  regionName: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  timezone: string | null
  updatedAt: string | null
}

export interface AuthLoginHistoryRecord {
  id: string
  user_id: string | null
  device_id: string | null
  ip: string | null
  ip_masked: string | null
  user_agent: string | null
  success: boolean
  reason: string | null
  client_type: AuthClientType | null
  created_at: string
  country_code: string | null
  region_code: string | null
  region_name: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  timezone: string | null
  geo_source: string | null
}

export interface DeviceAuthLongTermPolicy {
  allowLongTerm: boolean
  deviceTrusted: boolean
  locationTrusted: boolean
  reason: 'device' | 'location' | 'unknown' | null
}

export type DeviceAuthStatus = 'pending' | 'approved' | 'cancelled' | 'rejected'
export type DeviceAuthGrantType = 'short' | 'long'
export type DeviceAuthRejectReason = 'ip_mismatch' | 'permission_denied' | 'unknown'
export type DeviceAuthBrowserState = 'unknown' | 'opened' | 'closed'

function toNullableNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : null
}

function resolveLocationFromRow(row: Record<string, any>): AuthGeoLocation | null {
  const countryCode = row.country_code ?? null
  const regionCode = row.region_code ?? null
  const regionName = row.region_name ?? null
  const city = row.city ?? null
  const latitude = toNullableNumber(row.latitude)
  const longitude = toNullableNumber(row.longitude)
  const timezone = row.timezone ?? null
  const updatedAt = row.last_login_at ?? row.created_at ?? null

  if (!countryCode && !regionCode && !regionName && !city && latitude == null && longitude == null && !timezone) {
    return null
  }

  return {
    countryCode,
    regionCode,
    regionName,
    city,
    latitude,
    longitude,
    timezone,
    updatedAt,
  }
}

export function maskIpAddress(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  if (normalized.includes('.')) {
    const parts = normalized.split('.')
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.*.*`
    }
  }

  if (normalized.includes(':')) {
    const parts = normalized.split(':').filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}:*:*`
    }
    return `${normalized.slice(0, 4)}:*:*`
  }

  return '***'
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
    locale: normalizeLocaleCode(row.locale ?? null),
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
  const lastLocation = resolveLocationFromRow(row)
  const lastLoginIpMasked = maskIpAddress(row.last_login_ip ?? row.ip ?? null)
  return {
    id: row.id,
    userId: row.user_id,
    deviceName: row.device_name ?? null,
    platform: row.platform ?? null,
    clientType: normalizeClientType(row.client_type),
    userAgent: row.user_agent ?? null,
    lastSeenAt: row.last_seen_at ?? null,
    createdAt: row.created_at,
    revokedAt: row.revoked_at ?? null,
    tokenVersion: Number(row.token_version ?? 0),
    lastLocation,
    lastLoginIpMasked,
    lastLoginAt: row.last_login_at ?? null,
  }
}

function mapEvictedDeviceSummary(row: Record<string, any> | null): EvictedDeviceSummary | null {
  if (!row)
    return null
  return {
    id: row.id,
    deviceName: row.device_name ?? null,
    platform: row.platform ?? null,
    lastSeenAt: row.last_seen_at ?? null
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
  const locale = normalizeLocaleCode(data.locale ?? null)
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
    locale,
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
    locale,
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
  const hasName = Object.prototype.hasOwnProperty.call(payload, 'name')
  const hasImage = Object.prototype.hasOwnProperty.call(payload, 'image')
  const hasLocale = Object.prototype.hasOwnProperty.call(payload, 'locale')
  const locale = hasLocale ? normalizeLocaleCode(payload.locale ?? null) : null

  await db.prepare(`
    UPDATE ${USERS_TABLE}
    SET name = CASE WHEN ? = 1 THEN ? ELSE name END,
        image = CASE WHEN ? = 1 THEN ? ELSE image END,
        locale = CASE WHEN ? = 1 THEN ? ELSE locale END
    WHERE id = ?
  `).bind(
    hasName ? 1 : 0,
    hasName ? payload.name ?? null : null,
    hasImage ? 1 : 0,
    hasImage ? payload.image ?? null : null,
    hasLocale ? 1 : 0,
    hasLocale ? locale : null,
    userId,
  ).run()
  return getUserById(event, userId)
}

export async function setUserRole(event: H3Event, userId: string, role: string): Promise<AuthUser | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  await db.prepare(`UPDATE ${USERS_TABLE} SET role = ? WHERE id = ?`).bind(role, userId).run()
  return getUserById(event, userId)
}

export interface AdminBootstrapState {
  adminCount: number
  adminExists: boolean
  firstUserId: string | null
  isFirstUser: boolean
  requiresBootstrap: boolean
}

function toSafeInteger(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function hasMutationChanges(result: any): boolean {
  const changes = toSafeInteger(result?.meta?.changes ?? result?.changes ?? 0)
  return changes > 0
}

export async function getAdminBootstrapState(event: H3Event, userId?: string | null): Promise<AdminBootstrapState> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)

  const row = await db.prepare(`
    WITH admin_count AS (
      SELECT COUNT(*) AS total
      FROM ${USERS_TABLE}
      WHERE status = 'active' AND LOWER(role) = 'admin'
    ),
    first_user AS (
      SELECT id
      FROM ${USERS_TABLE}
      WHERE status = 'active'
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    )
    SELECT
      (SELECT total FROM admin_count) AS admin_count,
      (SELECT id FROM first_user) AS first_user_id;
  `).first<{ admin_count?: number | string, first_user_id?: string | null }>()

  const adminCount = toSafeInteger(row?.admin_count)
  const firstUserId = typeof row?.first_user_id === 'string' ? row.first_user_id : null
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : ''
  const isFirstUser = Boolean(firstUserId && normalizedUserId && firstUserId === normalizedUserId)
  const adminExists = adminCount > 0

  return {
    adminCount,
    adminExists,
    firstUserId,
    isFirstUser,
    requiresBootstrap: !adminExists,
  }
}

export async function promoteFirstUserToAdmin(event: H3Event, userId: string): Promise<boolean> {
  const normalizedUserId = userId.trim()
  if (!normalizedUserId)
    return false

  const db = requireDatabase(event)
  await ensureAuthSchema(db)

  const result = await db.prepare(`
    UPDATE ${USERS_TABLE}
    SET role = 'admin'
    WHERE id = ?1
      AND status = 'active'
      AND LOWER(role) != 'admin'
      AND id = (
        SELECT id
        FROM ${USERS_TABLE}
        WHERE status = 'active'
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      )
      AND NOT EXISTS (
        SELECT 1
        FROM ${USERS_TABLE}
        WHERE status = 'active' AND LOWER(role) = 'admin'
      );
  `).bind(normalizedUserId).run()

  return hasMutationChanges(result)
}

export async function setUserStatus(event: H3Event, userId: string, status: UserStatus): Promise<AuthUser | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const disabledAt = status === 'disabled' ? new Date().toISOString() : null
  await db.prepare(`
    UPDATE ${USERS_TABLE}
    SET status = ?, disabled_at = ?
    WHERE id = ?
  `).bind(status, disabledAt, userId).run()
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

export async function hasUserPasswordCredential(event: H3Event, userId: string): Promise<boolean> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`SELECT user_id FROM ${CREDENTIALS_TABLE} WHERE user_id = ? LIMIT 1`).bind(userId).first()
  return Boolean(row?.user_id)
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

export interface DeviceAuthRequest {
  deviceCode: string
  userCode: string
  deviceId: string
  deviceName?: string | null
  devicePlatform?: string | null
  status: DeviceAuthStatus
  grantType: DeviceAuthGrantType
  clientType?: AuthClientType | null
  requestIp?: string | null
  rejectReason?: DeviceAuthRejectReason | null
  rejectMessage?: string | null
  rejectRequestIp?: string | null
  rejectCurrentIp?: string | null
  rejectedAt?: string | null
  browserState?: DeviceAuthBrowserState
  browserSeenAt?: string | null
  browserClosedAt?: string | null
  userId?: string | null
  createdAt: string
  expiresAt: string
  approvedAt?: string | null
  cancelledAt?: string | null
}

function normalizeDeviceAuthStatus(value: unknown): DeviceAuthStatus {
  if (typeof value !== 'string')
    return 'pending'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'pending' || normalized === 'approved' || normalized === 'cancelled' || normalized === 'rejected')
    return normalized
  return 'pending'
}

function normalizeDeviceAuthGrantType(value: unknown): DeviceAuthGrantType {
  return value === 'long' ? 'long' : 'short'
}

function normalizeDeviceAuthRejectReason(value: unknown): DeviceAuthRejectReason | null {
  if (typeof value !== 'string')
    return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'ip_mismatch' || normalized === 'permission_denied' || normalized === 'unknown')
    return normalized
  return null
}

function normalizeDeviceAuthBrowserState(value: unknown): DeviceAuthBrowserState {
  if (typeof value !== 'string')
    return 'unknown'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'opened' || normalized === 'closed' || normalized === 'unknown')
    return normalized
  return 'unknown'
}

function mapDeviceAuthRow(row: Record<string, any>): DeviceAuthRequest {
  return {
    deviceCode: row.device_code as string,
    userCode: row.user_code as string,
    deviceId: row.device_id as string,
    deviceName: (row.device_name as string | null) ?? null,
    devicePlatform: (row.device_platform as string | null) ?? null,
    status: normalizeDeviceAuthStatus(row.status),
    grantType: normalizeDeviceAuthGrantType(row.grant_type),
    clientType: normalizeClientType(row.client_type),
    requestIp: row.request_ip ?? null,
    rejectReason: normalizeDeviceAuthRejectReason(row.reject_reason),
    rejectMessage: row.reject_message ?? null,
    rejectRequestIp: row.reject_request_ip ?? null,
    rejectCurrentIp: row.reject_current_ip ?? null,
    rejectedAt: row.rejected_at ?? null,
    browserState: normalizeDeviceAuthBrowserState(row.browser_state),
    browserSeenAt: row.browser_seen_at ?? null,
    browserClosedAt: row.browser_closed_at ?? null,
    userId: (row.user_id as string | null) ?? null,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    approvedAt: (row.approved_at as string | null) ?? null,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
  }
}

function isExpiredAt(expiresAt: string): boolean {
  const expires = Date.parse(expiresAt)
  return Number.isNaN(expires) || expires <= Date.now()
}

export async function createDeviceAuthRequest(
  event: H3Event,
  payload: {
    deviceId: string
    deviceName?: string | null
    devicePlatform?: string | null
    clientType?: AuthClientType | null
    ttlMs: number
  }
): Promise<DeviceAuthRequest> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const deviceCode = generateToken(16)
  const userCode = generateToken(6)
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + payload.ttlMs).toISOString()

  await db.prepare(`
    INSERT INTO ${DEVICE_AUTH_TABLE} (
      device_code,
      user_code,
      device_id,
      device_name,
      device_platform,
      client_type,
      request_ip,
      status,
      grant_type,
      reject_reason,
      reject_message,
      reject_request_ip,
      reject_current_ip,
      rejected_at,
      browser_state,
      browser_seen_at,
      browser_closed_at,
      user_id,
      created_at,
      expires_at,
      approved_at,
      cancelled_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    deviceCode,
    userCode,
    payload.deviceId,
    payload.deviceName ?? null,
    payload.devicePlatform ?? null,
    payload.clientType ?? null,
    getRequestIp(event),
    'pending',
    'short',
    null,
    null,
    null,
    null,
    null,
    'unknown',
    null,
    null,
    null,
    now,
    expiresAt,
    null,
    null,
  ).run()

  return {
    deviceCode,
    userCode,
    deviceId: payload.deviceId,
    deviceName: payload.deviceName ?? null,
    devicePlatform: payload.devicePlatform ?? null,
    status: 'pending',
    grantType: 'short',
    clientType: payload.clientType ?? null,
    requestIp: getRequestIp(event),
    rejectReason: null,
    rejectMessage: null,
    rejectRequestIp: null,
    rejectCurrentIp: null,
    rejectedAt: null,
    browserState: 'unknown',
    browserSeenAt: null,
    browserClosedAt: null,
    userId: null,
    createdAt: now,
    expiresAt,
    approvedAt: null,
    cancelledAt: null,
  }
}

export async function getDeviceAuthByDeviceCode(event: H3Event, deviceCode: string): Promise<DeviceAuthRequest | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`
    SELECT * FROM ${DEVICE_AUTH_TABLE} WHERE device_code = ? LIMIT 1
  `).bind(deviceCode).first()
  if (!row)
    return null
  return mapDeviceAuthRow(row as Record<string, any>)
}

export async function getDeviceAuthByUserCode(event: H3Event, userCode: string): Promise<DeviceAuthRequest | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`
    SELECT * FROM ${DEVICE_AUTH_TABLE} WHERE user_code = ? LIMIT 1
  `).bind(userCode).first()
  if (!row)
    return null
  return mapDeviceAuthRow(row as Record<string, any>)
}

export async function approveDeviceAuthRequest(
  event: H3Event,
  userCode: string,
  userId: string,
  grantType: 'short' | 'long'
): Promise<DeviceAuthRequest | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`
    SELECT * FROM ${DEVICE_AUTH_TABLE} WHERE user_code = ? LIMIT 1
  `).bind(userCode).first()
  if (!row)
    return null
  const request = mapDeviceAuthRow(row as Record<string, any>)
  if (request.status !== 'pending' || isExpiredAt(request.expiresAt))
    return null
  const approvedAt = new Date().toISOString()
  await db.prepare(`
    UPDATE ${DEVICE_AUTH_TABLE}
    SET status = ?, user_id = ?, approved_at = ?, grant_type = ?, cancelled_at = NULL,
        reject_reason = NULL, reject_message = NULL, reject_request_ip = NULL, reject_current_ip = NULL, rejected_at = NULL
    WHERE user_code = ?
  `).bind('approved', userId, approvedAt, grantType, userCode).run()
  return {
    ...request,
    status: 'approved',
    userId,
    approvedAt,
    grantType,
    rejectReason: null,
    rejectMessage: null,
    rejectRequestIp: null,
    rejectCurrentIp: null,
    rejectedAt: null,
  }
}

export async function deleteDeviceAuthRequest(event: H3Event, deviceCode: string): Promise<void> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  await db.prepare(`DELETE FROM ${DEVICE_AUTH_TABLE} WHERE device_code = ?`).bind(deviceCode).run()
}

export async function cancelDeviceAuthRequest(event: H3Event, userCode: string): Promise<DeviceAuthRequest | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`
    SELECT * FROM ${DEVICE_AUTH_TABLE} WHERE user_code = ? LIMIT 1
  `).bind(userCode).first()
  if (!row)
    return null
  const request = mapDeviceAuthRow(row as Record<string, any>)
  if (request.status !== 'pending' || isExpiredAt(request.expiresAt))
    return null
  const cancelledAt = new Date().toISOString()
  await db.prepare(`
    UPDATE ${DEVICE_AUTH_TABLE}
    SET status = ?, cancelled_at = ?
    WHERE user_code = ?
  `).bind('cancelled', cancelledAt, userCode).run()
  return { ...request, status: 'cancelled', cancelledAt }
}

export async function cancelDeviceAuthRequestByDeviceCode(event: H3Event, deviceCode: string): Promise<DeviceAuthRequest | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`
    SELECT * FROM ${DEVICE_AUTH_TABLE} WHERE device_code = ? LIMIT 1
  `).bind(deviceCode).first()
  if (!row)
    return null
  const request = mapDeviceAuthRow(row as Record<string, any>)
  if (request.status !== 'pending' || isExpiredAt(request.expiresAt))
    return null
  const cancelledAt = new Date().toISOString()
  await db.prepare(`
    UPDATE ${DEVICE_AUTH_TABLE}
    SET status = ?, cancelled_at = ?
    WHERE device_code = ?
  `).bind('cancelled', cancelledAt, deviceCode).run()
  return { ...request, status: 'cancelled', cancelledAt }
}

export async function rejectDeviceAuthRequest(
  event: H3Event,
  userCode: string,
  payload: {
    reason: DeviceAuthRejectReason
    message?: string | null
    requestIp?: string | null
    currentIp?: string | null
  },
): Promise<DeviceAuthRequest | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`
    SELECT * FROM ${DEVICE_AUTH_TABLE} WHERE user_code = ? LIMIT 1
  `).bind(userCode).first()
  if (!row)
    return null
  const request = mapDeviceAuthRow(row as Record<string, any>)
  if (request.status !== 'pending' || isExpiredAt(request.expiresAt))
    return null
  const rejectedAt = new Date().toISOString()
  await db.prepare(`
    UPDATE ${DEVICE_AUTH_TABLE}
    SET status = ?, reject_reason = ?, reject_message = ?, reject_request_ip = ?, reject_current_ip = ?, rejected_at = ?
    WHERE user_code = ?
  `).bind(
    'rejected',
    payload.reason,
    payload.message ?? null,
    payload.requestIp ?? null,
    payload.currentIp ?? null,
    rejectedAt,
    userCode,
  ).run()
  return {
    ...request,
    status: 'rejected',
    rejectReason: payload.reason,
    rejectMessage: payload.message ?? null,
    rejectRequestIp: payload.requestIp ?? null,
    rejectCurrentIp: payload.currentIp ?? null,
    rejectedAt,
  }
}

export async function updateDeviceAuthBrowserState(
  event: H3Event,
  userCode: string,
  state: 'opened' | 'heartbeat' | 'closed',
): Promise<DeviceAuthRequest | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`
    SELECT * FROM ${DEVICE_AUTH_TABLE} WHERE user_code = ? LIMIT 1
  `).bind(userCode).first()
  if (!row)
    return null
  const request = mapDeviceAuthRow(row as Record<string, any>)
  if (request.status !== 'pending' || isExpiredAt(request.expiresAt))
    return request

  const now = new Date().toISOString()
  if (state === 'closed') {
    await db.prepare(`
      UPDATE ${DEVICE_AUTH_TABLE}
      SET browser_state = ?, browser_seen_at = ?, browser_closed_at = ?
      WHERE user_code = ?
    `).bind('closed', now, now, userCode).run()
    return { ...request, browserState: 'closed', browserSeenAt: now, browserClosedAt: now }
  }

  await db.prepare(`
    UPDATE ${DEVICE_AUTH_TABLE}
    SET browser_state = ?, browser_seen_at = ?, browser_closed_at = NULL
    WHERE user_code = ?
  `).bind('opened', now, userCode).run()
  return { ...request, browserState: 'opened', browserSeenAt: now, browserClosedAt: null }
}

export function isDeviceAuthExpired(request: DeviceAuthRequest): boolean {
  return isExpiredAt(request.expiresAt)
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
  const existing = await db.prepare(`
    SELECT user_id FROM ${ACCOUNTS_TABLE}
    WHERE provider = ? AND provider_account_id = ?
    LIMIT 1
  `).bind(provider, providerAccountId).first() as { user_id?: string } | null

  if (existing?.user_id && existing.user_id !== userId) {
    throw new Error(`OAuth account already linked to another user (${provider}:${providerAccountId})`)
  }
  if (existing?.user_id === userId) {
    return
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const result = await db.prepare(`
    INSERT INTO ${ACCOUNTS_TABLE} (id, user_id, provider, provider_account_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, userId, provider, providerAccountId, now).run()

  const changes = Number((result as any)?.meta?.changes ?? 0)
  if (changes < 1) {
    throw new Error(`OAuth account link insert affected no rows (${provider}:${providerAccountId})`)
  }
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

export function readRequestIp(event: H3Event): string | null {
  return getRequestIp(event)
}

function getUserAgent(event: H3Event): string | null {
  const ua = event.node.req.headers['user-agent']
  return typeof ua === 'string' ? ua : null
}

export async function upsertDevice(
  event: H3Event,
  userId: string,
  deviceId: string,
  data?: { deviceName?: string | null, platform?: string | null, clientType?: AuthClientType | null }
): Promise<AuthDevice> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const now = new Date().toISOString()
  const existing = await db.prepare(`SELECT * FROM ${DEVICES_TABLE} WHERE id = ? AND user_id = ?`).bind(deviceId, userId).first()
  if (existing) {
    await db.prepare(`
      UPDATE ${DEVICES_TABLE}
      SET device_name = COALESCE(?, device_name),
          platform = COALESCE(?, platform),
          client_type = COALESCE(?, client_type),
          user_agent = COALESCE(?, user_agent),
          last_seen_at = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      data?.deviceName ?? null,
      data?.platform ?? null,
      data?.clientType ?? null,
      getUserAgent(event),
      now,
      deviceId,
      userId
    ).run()
  }
  else {
    await db.prepare(`
      INSERT INTO ${DEVICES_TABLE} (id, user_id, device_name, platform, client_type, user_agent, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      deviceId,
      userId,
      data?.deviceName ?? null,
      data?.platform ?? null,
      data?.clientType ?? null,
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

  const result = await db.prepare(`
    SELECT
      d.*,
      h.ip AS last_login_ip,
      h.created_at AS last_login_at,
      h.country_code,
      h.region_code,
      h.region_name,
      h.city,
      h.latitude,
      h.longitude,
      h.timezone
    FROM ${DEVICES_TABLE} d
    LEFT JOIN ${LOGIN_HISTORY_TABLE} h
      ON h.id = (
        SELECT lh.id
        FROM ${LOGIN_HISTORY_TABLE} lh
        WHERE lh.user_id = d.user_id
          AND lh.device_id = d.id
        ORDER BY lh.created_at DESC
        LIMIT 1
      )
    WHERE d.user_id = ?
    ORDER BY d.created_at DESC
  `).bind(userId).all()

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

export async function revokeOldestDevices(
  event: H3Event,
  userId: string,
  options: { limit: number; keepDeviceId?: string | null }
): Promise<EvictedDeviceSummary[]> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const limit = Math.max(0, Math.floor(options.limit))
  if (!Number.isFinite(limit) || limit <= 0) {
    return []
  }

  const totalRow = await db.prepare(`
    SELECT COUNT(*) as total
    FROM ${DEVICES_TABLE}
    WHERE user_id = ? AND revoked_at IS NULL
  `).bind(userId).first<{ total: number }>()
  const total = Number(totalRow?.total ?? 0)
  if (total <= limit) {
    return []
  }

  const toRevoke = total - limit
  const params: Array<string | number> = [userId]
  const keepDeviceId = options.keepDeviceId ?? null
  const keepCondition = keepDeviceId ? ' AND id != ?' : ''
  if (keepDeviceId) {
    params.push(keepDeviceId)
  }

  const candidates = await db.prepare(`
    SELECT id, device_name, platform, last_seen_at
    FROM ${DEVICES_TABLE}
    WHERE user_id = ? AND revoked_at IS NULL${keepCondition}
    ORDER BY COALESCE(last_seen_at, created_at) ASC, created_at ASC
    LIMIT ?
  `).bind(...params, toRevoke).all<Record<string, any>>()

  const summaries = (candidates.results ?? [])
    .map(row => mapEvictedDeviceSummary(row))
    .filter((item): item is EvictedDeviceSummary => Boolean(item))

  const ids = summaries.map(item => item.id)
  if (!ids.length) {
    return []
  }

  const now = new Date().toISOString()
  const placeholders = ids.map(() => '?').join(', ')
  await db.prepare(`
    UPDATE ${DEVICES_TABLE}
    SET revoked_at = ?, token_version = token_version + 1
    WHERE user_id = ? AND id IN (${placeholders})
  `).bind(now, userId, ...ids).run()

  return summaries
}

export async function revokeInactiveDevices(
  event: H3Event,
  userId: string,
  options: { inactiveBefore: string; keepDeviceId?: string | null }
): Promise<EvictedDeviceSummary[]> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const inactiveBefore = options.inactiveBefore
  if (!inactiveBefore) {
    return []
  }

  const params: Array<string | number> = [userId, inactiveBefore]
  const keepDeviceId = options.keepDeviceId ?? null
  const keepCondition = keepDeviceId ? ' AND id != ?' : ''
  if (keepDeviceId) {
    params.push(keepDeviceId)
  }

  const candidates = await db.prepare(`
    SELECT id, device_name, platform, last_seen_at
    FROM ${DEVICES_TABLE}
    WHERE user_id = ? AND revoked_at IS NULL
      AND COALESCE(last_seen_at, created_at) < ?${keepCondition}
    ORDER BY COALESCE(last_seen_at, created_at) ASC, created_at ASC
  `).bind(...params).all<Record<string, any>>()

  const summaries = (candidates.results ?? [])
    .map(row => mapEvictedDeviceSummary(row))
    .filter((item): item is EvictedDeviceSummary => Boolean(item))

  const ids = summaries.map(item => item.id)
  if (!ids.length) {
    return []
  }

  const now = new Date().toISOString()
  const placeholders = ids.map(() => '?').join(', ')
  await db.prepare(`
    UPDATE ${DEVICES_TABLE}
    SET revoked_at = ?, token_version = token_version + 1
    WHERE user_id = ? AND id IN (${placeholders})
  `).bind(now, userId, ...ids).run()

  return summaries
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

export async function logLoginAttempt(event: H3Event, payload: {
  userId?: string | null
  deviceId?: string | null
  success: boolean
  reason?: string | null
  clientType?: AuthClientType | null
}): Promise<void> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const geo = resolveRequestGeo(event)
  const clientType = payload.clientType ?? normalizeClientType(event.node.req.headers['x-device-client'])
  await db.prepare(`
    INSERT INTO ${LOGIN_HISTORY_TABLE} (
      id, user_id, device_id, ip,
      country_code, region_code, region_name, city, latitude, longitude, timezone, geo_source,
      client_type, user_agent, success, reason, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    payload.userId ?? null,
    payload.deviceId ?? null,
    getRequestIp(event),
    geo.countryCode,
    geo.regionCode,
    geo.regionName,
    geo.city,
    geo.latitude,
    geo.longitude,
    geo.timezone,
    geo.source,
    clientType ?? null,
    getUserAgent(event),
    payload.success ? 1 : 0,
    payload.reason ?? null,
    now
  ).run()
}

export async function listLoginHistory(event: H3Event, userId: string, days = 90): Promise<AuthLoginHistoryRecord[]> {
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
  return (result.results as Record<string, any>[]).map((row) => {
    const location = resolveLocationFromRow(row)
    return {
      id: row.id,
      user_id: row.user_id ?? null,
      device_id: row.device_id ?? null,
      ip: row.ip ?? null,
      ip_masked: maskIpAddress(row.ip ?? null),
      user_agent: row.user_agent ?? null,
      success: Number(row.success ?? 0) === 1,
      reason: row.reason ?? null,
      client_type: normalizeClientType(row.client_type),
      created_at: row.created_at,
      country_code: location?.countryCode ?? null,
      region_code: location?.regionCode ?? null,
      region_name: location?.regionName ?? null,
      city: location?.city ?? null,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      timezone: location?.timezone ?? null,
      geo_source: row.geo_source ?? null,
    }
  })
}

export async function evaluateDeviceAuthLongTermPolicy(
  event: H3Event,
  userId: string,
  deviceId: string
): Promise<DeviceAuthLongTermPolicy> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const deviceRow = await db.prepare(`
    SELECT revoked_at
    FROM ${DEVICES_TABLE}
    WHERE id = ? AND user_id = ?
    LIMIT 1
  `).bind(deviceId, userId).first<{ revoked_at?: string | null }>()

  const deviceTrusted = Boolean(deviceRow && !deviceRow.revoked_at)
  const geo = resolveRequestGeo(event)
  const hasGeo = Boolean(geo.countryCode || geo.regionCode || geo.city)
  if (!hasGeo) {
    return {
      allowLongTerm: false,
      deviceTrusted,
      locationTrusted: false,
      reason: deviceTrusted ? 'location' : 'device',
    }
  }

  const result = await db.prepare(`
    SELECT country_code, region_code, city
    FROM ${LOGIN_HISTORY_TABLE}
    WHERE user_id = ? AND success = 1
    ORDER BY created_at DESC
    LIMIT 80
  `).bind(userId).all<Record<string, any>>()

  const rows = result.results ?? []
  const locationTrusted = rows.some((row) => {
    if (row.country_code && row.country_code !== geo.countryCode)
      return false
    if (geo.regionCode && row.region_code && row.region_code !== geo.regionCode)
      return false
    if (geo.city && row.city && row.city !== geo.city)
      return false
    return Boolean(row.country_code || row.region_code || row.city)
  })

  const allowLongTerm = deviceTrusted && locationTrusted
  let reason: DeviceAuthLongTermPolicy['reason'] = null
  if (!deviceTrusted)
    reason = 'device'
  else if (!locationTrusted)
    reason = 'location'

  return {
    allowLongTerm,
    deviceTrusted,
    locationTrusted,
    reason,
  }
}

export function readDeviceId(event: H3Event): string | null {
  const header = event.node.req.headers['x-device-id']
  return typeof header === 'string' && header.trim().length > 0 ? header.trim() : null
}

export function normalizeClientType(value: unknown): AuthClientType | null {
  if (typeof value !== 'string')
    return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'app' || normalized === 'cli' || normalized === 'external')
    return normalized
  return null
}

export function readDeviceMetadata(event: H3Event): { deviceName?: string | null, platform?: string | null, clientType?: AuthClientType | null } {
  const deviceName = typeof event.node.req.headers['x-device-name'] === 'string'
    ? event.node.req.headers['x-device-name'] as string
    : null
  const platform = typeof event.node.req.headers['x-device-platform'] === 'string'
    ? event.node.req.headers['x-device-platform'] as string
    : null
  const clientType = normalizeClientType(event.node.req.headers['x-device-client'])
  return { deviceName, platform, clientType }
}

export async function ensureDeviceForRequest(event: H3Event, userId: string): Promise<AuthDevice | null> {
  const deviceId = readDeviceId(event)
  if (!deviceId)
    return null
  return upsertDevice(event, userId, deviceId, readDeviceMetadata(event))
}
