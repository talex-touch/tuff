import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import crypto from 'uncrypto'
import { readCloudflareBindings } from './cloudflare'
import { runAfterResponse } from './afterResponse'
import { defineD1Schema, ensureD1Schema } from './d1Schema'
import { normalizeLocaleCode, type SupportedLocaleCode } from './locale'
import { resolveRequestGeo } from './requestGeo'

const USERS_TABLE = 'auth_users'
const ACCOUNTS_TABLE = 'auth_accounts'
const VERIFICATION_TABLE = 'auth_verification_tokens'
const LOGIN_TOKEN_TABLE = 'auth_login_tokens'
const PASSKEYS_TABLE = 'auth_passkeys'
const WEBAUTHN_CHALLENGE_TABLE = 'auth_webauthn_challenges'
const DEVICES_TABLE = 'auth_devices'
const LOGIN_HISTORY_TABLE = 'auth_login_history'
const MERGE_LOGS_TABLE = 'auth_user_merges'
const DEVICE_AUTH_TABLE = 'auth_device_auth_requests'
const DEVICE_AUTH_AUDIT_TABLE = 'auth_device_auth_audits'
const OAUTH_CODE_TABLE = 'auth_oauth_codes'

const DEVICE_AUTH_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const DEVICE_AUTH_RATE_LIMIT_MAX_BY_DEVICE = 6
const DEVICE_AUTH_RATE_LIMIT_MAX_BY_IP = 12
const DEVICE_AUTH_RATE_LIMIT_MAX_BY_USER = 20
const DEVICE_AUTH_COOLDOWN_WINDOW_MS = 10 * 60 * 1000
const DEVICE_AUTH_COOLDOWN_THRESHOLD = 3
const DEVICE_AUTH_LONG_TERM_SESSION_WINDOW_MS = 10 * 60 * 1000
const ACCOUNT_DELETION_RECOVERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export interface UserPrivacySettings {
  analytics: boolean
  crashReports: boolean
  usageData: boolean
  personalization: boolean
}

export const DEFAULT_USER_PRIVACY_SETTINGS: UserPrivacySettings = {
  analytics: true,
  crashReports: true,
  usageData: false,
  personalization: true,
}

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

/**
 * Applied by `ensureD1Schema` only when the database has not recorded this definition.
 *
 * The backfill repairs users written before `email_state` existed; every writer sets both columns now
 * (`createUser`, `setEmailVerified`, the adapter's `updateUser`). Its old companion
 * (`SET email_state = 'unverified' WHERE email_state IS NULL`) is gone: the column is NOT NULL with a
 * default, so it could never match a row.
 */
const AUTH_SCHEMA = defineD1Schema('auth', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${USERS_TABLE} (
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
        privacy_analytics INTEGER NOT NULL DEFAULT 1,
        privacy_crash_reports INTEGER NOT NULL DEFAULT 1,
        privacy_usage_data INTEGER NOT NULL DEFAULT 0,
        privacy_personalization INTEGER NOT NULL DEFAULT 1,
        allow_cli_ip_mismatch INTEGER NOT NULL DEFAULT 0,
        deletion_requested_at TEXT,
        deletion_scheduled_at TEXT,
        deletion_cancelled_at TEXT,
        deletion_terms_version TEXT,
        created_at TEXT NOT NULL
      )`,
    `CREATE TABLE IF NOT EXISTS ${ACCOUNTS_TABLE} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_account_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(provider, provider_account_id),
        FOREIGN KEY (user_id) REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE
      )`,
    `CREATE TABLE IF NOT EXISTS ${VERIFICATION_TABLE} (
        identifier TEXT NOT NULL,
        token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        PRIMARY KEY (identifier, token)
      )`,
    `CREATE TABLE IF NOT EXISTS ${LOGIN_TOKEN_TABLE} (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        reason TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE
      )`,
    `CREATE TABLE IF NOT EXISTS ${PASSKEYS_TABLE} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        credential_id TEXT NOT NULL UNIQUE,
        public_key TEXT NOT NULL,
        counter INTEGER NOT NULL DEFAULT 0,
        transports TEXT,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        FOREIGN KEY (user_id) REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE
      )`,
    `CREATE TABLE IF NOT EXISTS ${DEVICE_AUTH_TABLE} (
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
      )`,
    `CREATE TABLE IF NOT EXISTS ${DEVICE_AUTH_AUDIT_TABLE} (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        user_id TEXT,
        device_id TEXT,
        device_code TEXT,
        user_code TEXT,
        client_type TEXT,
        actor_user_id TEXT,
        reason TEXT,
        ip TEXT,
        user_agent TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL
      )`,
    `CREATE TABLE IF NOT EXISTS ${WEBAUTHN_CHALLENGE_TABLE} (
        challenge TEXT PRIMARY KEY,
        user_id TEXT,
        type TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
    `CREATE TABLE IF NOT EXISTS ${DEVICES_TABLE} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_name TEXT,
        platform TEXT,
        client_type TEXT,
        trusted_at TEXT,
        user_agent TEXT,
        last_seen_at TEXT,
        last_seen_ip TEXT,
        last_seen_country_code TEXT,
        last_seen_region_code TEXT,
        last_seen_region_name TEXT,
        last_seen_city TEXT,
        last_seen_latitude REAL,
        last_seen_longitude REAL,
        last_seen_timezone TEXT,
        last_seen_geo_source TEXT,
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        token_version INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE
      )`,
    `CREATE TABLE IF NOT EXISTS ${LOGIN_HISTORY_TABLE} (
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
      )`,
    `CREATE TABLE IF NOT EXISTS ${OAUTH_CODE_TABLE} (
        code TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE
      )`,
    `CREATE INDEX IF NOT EXISTS idx_auth_users_email ON ${USERS_TABLE}(email)`,
    `CREATE TABLE IF NOT EXISTS ${MERGE_LOGS_TABLE} (
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
      )`,
    `CREATE INDEX IF NOT EXISTS idx_auth_merges_source ON ${MERGE_LOGS_TABLE}(source_user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_merges_target ON ${MERGE_LOGS_TABLE}(target_user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_accounts_user ON ${ACCOUNTS_TABLE}(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_devices_user ON ${DEVICES_TABLE}(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_device_auth_audits_device
      ON ${DEVICE_AUTH_AUDIT_TABLE}(device_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_device_auth_audits_user
      ON ${DEVICE_AUTH_AUDIT_TABLE}(user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_device_auth_audits_ip
      ON ${DEVICE_AUTH_AUDIT_TABLE}(ip, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_device_auth_audits_action_status
      ON ${DEVICE_AUTH_AUDIT_TABLE}(action, status, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_login_history_user ON ${LOGIN_HISTORY_TABLE}(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_oauth_codes_client_user
      ON ${OAUTH_CODE_TABLE}(client_id, user_id, created_at DESC)`,
    // Per-user reads that used to scan: passkeys (`/api/user/me`, the FREE boost check), login
    // history (dashboard, device list), the bootstrap check (`/api/user/me`), and the retention
    // delete by age.
    `CREATE INDEX IF NOT EXISTS idx_auth_passkeys_user ON ${PASSKEYS_TABLE}(user_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_login_history_user_created ON ${LOGIN_HISTORY_TABLE}(user_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_login_history_user_device ON ${LOGIN_HISTORY_TABLE}(user_id, device_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_login_history_created ON ${LOGIN_HISTORY_TABLE}(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_users_status_role ON ${USERS_TABLE}(status, role)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_users_status_created ON ${USERS_TABLE}(status, created_at, id)`,
  ],
  columns: [
    {
      table: USERS_TABLE,
      columns: [
        { name: 'status', ddl: "status TEXT NOT NULL DEFAULT 'active'" },
        { name: 'email_state', ddl: "email_state TEXT NOT NULL DEFAULT 'unverified'" },
        { name: 'merged_to_user_id', ddl: 'merged_to_user_id TEXT' },
        { name: 'merged_at', ddl: 'merged_at TEXT' },
        { name: 'merged_by_user_id', ddl: 'merged_by_user_id TEXT' },
        { name: 'disabled_at', ddl: 'disabled_at TEXT' },
        { name: 'privacy_analytics', ddl: 'privacy_analytics INTEGER NOT NULL DEFAULT 1' },
        { name: 'privacy_crash_reports', ddl: 'privacy_crash_reports INTEGER NOT NULL DEFAULT 1' },
        { name: 'privacy_usage_data', ddl: 'privacy_usage_data INTEGER NOT NULL DEFAULT 0' },
        { name: 'privacy_personalization', ddl: 'privacy_personalization INTEGER NOT NULL DEFAULT 1' },
        { name: 'allow_cli_ip_mismatch', ddl: 'allow_cli_ip_mismatch INTEGER NOT NULL DEFAULT 0' },
        { name: 'deletion_requested_at', ddl: 'deletion_requested_at TEXT' },
        { name: 'deletion_scheduled_at', ddl: 'deletion_scheduled_at TEXT' },
        { name: 'deletion_cancelled_at', ddl: 'deletion_cancelled_at TEXT' },
        { name: 'deletion_terms_version', ddl: 'deletion_terms_version TEXT' },
      ],
    },
    {
      table: DEVICE_AUTH_TABLE,
      columns: [
        { name: 'grant_type', ddl: "grant_type TEXT NOT NULL DEFAULT 'short'" },
        { name: 'cancelled_at', ddl: 'cancelled_at TEXT' },
        { name: 'client_type', ddl: 'client_type TEXT' },
        { name: 'request_ip', ddl: 'request_ip TEXT' },
        { name: 'reject_reason', ddl: 'reject_reason TEXT' },
        { name: 'reject_message', ddl: 'reject_message TEXT' },
        { name: 'reject_request_ip', ddl: 'reject_request_ip TEXT' },
        { name: 'reject_current_ip', ddl: 'reject_current_ip TEXT' },
        { name: 'rejected_at', ddl: 'rejected_at TEXT' },
        { name: 'browser_state', ddl: "browser_state TEXT NOT NULL DEFAULT 'unknown'" },
        { name: 'browser_seen_at', ddl: 'browser_seen_at TEXT' },
        { name: 'browser_closed_at', ddl: 'browser_closed_at TEXT' },
      ],
    },
    {
      table: DEVICES_TABLE,
      columns: [
        { name: 'client_type', ddl: 'client_type TEXT' },
        { name: 'trusted_at', ddl: 'trusted_at TEXT' },
        { name: 'last_seen_ip', ddl: 'last_seen_ip TEXT' },
        { name: 'last_seen_country_code', ddl: 'last_seen_country_code TEXT' },
        { name: 'last_seen_region_code', ddl: 'last_seen_region_code TEXT' },
        { name: 'last_seen_region_name', ddl: 'last_seen_region_name TEXT' },
        { name: 'last_seen_city', ddl: 'last_seen_city TEXT' },
        { name: 'last_seen_latitude', ddl: 'last_seen_latitude REAL' },
        { name: 'last_seen_longitude', ddl: 'last_seen_longitude REAL' },
        { name: 'last_seen_timezone', ddl: 'last_seen_timezone TEXT' },
        { name: 'last_seen_geo_source', ddl: 'last_seen_geo_source TEXT' },
      ],
    },
    {
      table: LOGIN_HISTORY_TABLE,
      columns: [
        { name: 'country_code', ddl: 'country_code TEXT' },
        { name: 'region_code', ddl: 'region_code TEXT' },
        { name: 'region_name', ddl: 'region_name TEXT' },
        { name: 'city', ddl: 'city TEXT' },
        { name: 'latitude', ddl: 'latitude REAL' },
        { name: 'longitude', ddl: 'longitude REAL' },
        { name: 'timezone', ddl: 'timezone TEXT' },
        { name: 'geo_source', ddl: 'geo_source TEXT' },
        { name: 'client_type', ddl: 'client_type TEXT' },
      ],
    },
  ],
  backfills: [
    `UPDATE ${USERS_TABLE}
      SET email_state = 'verified'
      WHERE email_verified IS NOT NULL AND email_state != 'verified'`,
    // Roles are written lower-case (createUser, the role PATCH, the bootstrap promotion) and
    // `requireAdmin` compares exactly; this makes old rows agree, so the bootstrap check can match
    // `role = 'admin'` on its index instead of scanning every user for `LOWER(role)`.
    `UPDATE ${USERS_TABLE} SET role = LOWER(role) WHERE role <> LOWER(role)`,
  ],
})

async function ensureAuthSchema(db: D1Database) {
  await ensureD1Schema(db, AUTH_SCHEMA)
}

export type UserStatus = 'active' | 'merged' | 'disabled' | 'deletion_pending'
export type EmailState = 'verified' | 'unverified' | 'missing'
export type AuthClientType = 'app' | 'cli' | 'external'
export type AuthLoginClientType = AuthClientType | 'web'

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
  deletionRequestedAt: string | null
  deletionScheduledAt: string | null
  deletionCancelledAt: string | null
  deletionTermsVersion: string | null
  privacySettings: UserPrivacySettings
  allowCliIpMismatch: boolean
  createdAt: string
}

export interface AuthDevice {
  id: string
  userId: string
  deviceName: string | null
  platform: string | null
  clientType: AuthClientType | null
  trustedAt: string | null
  trusted: boolean
  userAgent: string | null
  lastSeenAt: string | null
  lastSeenIp?: string | null
  lastSeenIpMasked?: string | null
  createdAt: string
  revokedAt: string | null
  tokenVersion: number
  lastLocation?: AuthGeoLocation | null
  lastLoginIp?: string | null
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
  client_type: AuthLoginClientType | null
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

export interface OAuthCode {
  code: string
  clientId: string
  userId: string
  redirectUri: string
  expiresAt: string
  consumedAt: string | null
  createdAt: string
}

export interface DeviceAuthLongTermPolicy {
  allowLongTerm: boolean
  deviceTrusted: boolean
  locationTrusted: boolean
  sessionFresh: boolean
  sessionWindowSeconds: number
  reason: 'device' | 'location' | 'session_window' | 'unknown' | null
}

export type DeviceAuthStatus = 'pending' | 'approved' | 'cancelled' | 'rejected'
export type DeviceAuthGrantType = 'short' | 'long'
export type DeviceAuthRejectReason = 'ip_mismatch' | 'permission_denied' | 'rate_limited' | 'cooldown' | 'unknown'
export type DeviceAuthBrowserState = 'unknown' | 'opened' | 'closed'
export type DeviceAuthAuditAction = 'request' | 'approve' | 'reject' | 'cancel' | 'revoke' | 'trust' | 'untrust' | 'recover'
export type DeviceAuthAuditStatus = 'success' | 'blocked' | 'failed'

export interface DeviceAuthAuditRecord {
  id: string
  action: DeviceAuthAuditAction
  status: DeviceAuthAuditStatus
  userId: string | null
  deviceId: string | null
  deviceCode: string | null
  userCode: string | null
  clientType: AuthClientType | null
  actorUserId: string | null
  reason: string | null
  ip: string | null
  ipMasked: string | null
  userAgent: string | null
  metadata: Record<string, any> | null
  createdAt: string
}

export interface DeviceAuthRateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
  reason: 'rate_limited' | 'cooldown' | null
  scope: 'device' | 'ip' | 'user' | 'device_cooldown' | 'ip_cooldown' | 'user_cooldown' | null
  limit: number
  count: number
}

function toNullableNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : null
}

function resolveLocationFromRow(row: Record<string, any>): AuthGeoLocation | null {
  const countryCode = row.country_code ?? row.last_seen_country_code ?? null
  const regionCode = row.region_code ?? row.last_seen_region_code ?? null
  const regionName = row.region_name ?? row.last_seen_region_name ?? null
  const city = row.city ?? row.last_seen_city ?? null
  const latitude = toNullableNumber(row.latitude ?? row.last_seen_latitude)
  const longitude = toNullableNumber(row.longitude ?? row.last_seen_longitude)
  const timezone = row.timezone ?? row.last_seen_timezone ?? null
  const updatedAt = row.last_login_at ?? row.last_seen_at ?? row.created_at ?? null

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

export interface UserAccountActivitySummary {
  updatedAt: string | null
}

function readBooleanColumn(value: unknown, fallback: boolean): boolean {
  if (value === 1 || value === true || value === '1')
    return true
  if (value === 0 || value === false || value === '0')
    return false
  return fallback
}

function mapUser(row: Record<string, any> | null): AuthUser | null {
  if (!row)
    return null
  const emailState = (row.email_state as EmailState | null) ?? (row.email_verified ? 'verified' : 'unverified')
  const privacySettings: UserPrivacySettings = {
    analytics: readBooleanColumn(row.privacy_analytics, DEFAULT_USER_PRIVACY_SETTINGS.analytics),
    crashReports: readBooleanColumn(row.privacy_crash_reports, DEFAULT_USER_PRIVACY_SETTINGS.crashReports),
    usageData: readBooleanColumn(row.privacy_usage_data, DEFAULT_USER_PRIVACY_SETTINGS.usageData),
    personalization: readBooleanColumn(row.privacy_personalization, DEFAULT_USER_PRIVACY_SETTINGS.personalization),
  }
  const allowCliIpMismatch = readBooleanColumn(row.allow_cli_ip_mismatch, false)
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
    deletionRequestedAt: row.deletion_requested_at ?? null,
    deletionScheduledAt: row.deletion_scheduled_at ?? null,
    deletionCancelledAt: row.deletion_cancelled_at ?? null,
    deletionTermsVersion: row.deletion_terms_version ?? null,
    privacySettings,
    allowCliIpMismatch,
    createdAt: row.created_at
  }
}

function mapDevice(row: Record<string, any> | null): AuthDevice | null {
  if (!row)
    return null
  const lastLocation = resolveLocationFromRow(row)
  const lastSeenIp = row.last_seen_ip ?? null
  const lastLoginIp = row.last_login_ip ?? row.ip ?? null
  const lastSeenIpMasked = maskIpAddress(row.last_seen_ip ?? null)
  const lastLoginIpMasked = maskIpAddress(row.last_login_ip ?? row.ip ?? null)
  return {
    id: row.id,
    userId: row.user_id,
    deviceName: row.device_name ?? null,
    platform: row.platform ?? null,
    clientType: normalizeClientType(row.client_type),
    trustedAt: row.trusted_at ?? null,
    trusted: Boolean(row.trusted_at),
    userAgent: row.user_agent ?? null,
    lastSeenAt: row.last_seen_at ?? null,
    lastSeenIp,
    lastSeenIpMasked,
    createdAt: row.created_at,
    revokedAt: row.revoked_at ?? null,
    tokenVersion: Number(row.token_version ?? 0),
    lastLocation,
    lastLoginIp,
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
    now,
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
    deletionRequestedAt: null,
    deletionScheduledAt: null,
    deletionCancelledAt: null,
    deletionTermsVersion: null,
    privacySettings: { ...DEFAULT_USER_PRIVACY_SETTINGS },
    allowCliIpMismatch: false,
    createdAt: now,
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
  const row = await db.prepare(`UPDATE ${USERS_TABLE} SET email_state = ? WHERE id = ? RETURNING *`).bind(emailState, userId).first()
  return mapUser(row as Record<string, any> | null)
}

export async function setAllowCliIpMismatch(event: H3Event, userId: string, allowed: boolean): Promise<AuthUser | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`UPDATE ${USERS_TABLE} SET allow_cli_ip_mismatch = ? WHERE id = ? RETURNING *`).bind(allowed ? 1 : 0, userId).first()
  return mapUser(row as Record<string, any> | null)
}

export async function setUserPrivacySettings(
  event: H3Event,
  userId: string,
  settings: Partial<UserPrivacySettings>,
): Promise<AuthUser | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)

  const sets: string[] = []
  const values: number[] = []
  const append = (column: string, value: boolean | undefined) => {
    if (typeof value !== 'boolean')
      return
    sets.push(`${column} = ?`)
    values.push(value ? 1 : 0)
  }

  append('privacy_analytics', settings.analytics)
  append('privacy_crash_reports', settings.crashReports)
  append('privacy_usage_data', settings.usageData)
  append('privacy_personalization', settings.personalization)

  if (!sets.length)
    return getUserById(event, userId)

  const row = await db.prepare(`UPDATE ${USERS_TABLE} SET ${sets.join(', ')} WHERE id = ? RETURNING *`).bind(...values, userId).first()
  return mapUser(row as Record<string, any> | null)
}

export async function setUserEmail(event: H3Event, userId: string, email: string, emailState: EmailState, emailVerified: string | null = null): Promise<AuthUser | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`UPDATE ${USERS_TABLE} SET email = ?, email_verified = ?, email_state = ? WHERE id = ? RETURNING *`)
    .bind(normalizeEmail(email), emailVerified, emailState, userId).first()
  return mapUser(row as Record<string, any> | null)
}

export async function updateUserProfile(event: H3Event, userId: string, payload: { name?: string | null, image?: string | null, locale?: string | null }): Promise<AuthUser | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const hasName = Object.prototype.hasOwnProperty.call(payload, 'name')
  const hasImage = Object.prototype.hasOwnProperty.call(payload, 'image')
  const hasLocale = Object.prototype.hasOwnProperty.call(payload, 'locale')
  const locale = hasLocale ? normalizeLocaleCode(payload.locale ?? null) : null

  const row = await db.prepare(`
    UPDATE ${USERS_TABLE}
    SET name = CASE WHEN ? = 1 THEN ? ELSE name END,
        image = CASE WHEN ? = 1 THEN ? ELSE image END,
        locale = CASE WHEN ? = 1 THEN ? ELSE locale END
    WHERE id = ?
    RETURNING *
  `).bind(
    hasName ? 1 : 0,
    hasName ? payload.name ?? null : null,
    hasImage ? 1 : 0,
    hasImage ? payload.image ?? null : null,
    hasLocale ? 1 : 0,
    hasLocale ? locale : null,
    userId,
  ).first()
  return mapUser(row as Record<string, any> | null)
}

export async function setUserRole(event: H3Event, userId: string, role: string): Promise<AuthUser | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(`UPDATE ${USERS_TABLE} SET role = ? WHERE id = ? RETURNING *`).bind(role, userId).first()
  return mapUser(row as Record<string, any> | null)
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

/**
 * Whether an admin exists and who the first active user is. Both answers come from indexes
 * (`status, role` and `status, created_at, id`): it used to filter on `LOWER(role)` and sort every
 * user, a full scan of `auth_users` on each `/api/user/me`.
 */
const ADMIN_BOOTSTRAP_SQL = `
  SELECT
    (SELECT COUNT(*) FROM ${USERS_TABLE} WHERE status = 'active' AND role = 'admin') AS admin_count,
    (SELECT id FROM ${USERS_TABLE} WHERE status = 'active' ORDER BY created_at ASC, id ASC LIMIT 1) AS first_user_id
`

function mapAdminBootstrapState(
  row: { admin_count?: number | string, first_user_id?: string | null } | null | undefined,
  userId?: string | null,
): AdminBootstrapState {
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

export async function getAdminBootstrapState(event: H3Event, userId?: string | null): Promise<AdminBootstrapState> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await db.prepare(ADMIN_BOOTSTRAP_SQL).first<{ admin_count?: number | string, first_user_id?: string | null }>()
  return mapAdminBootstrapState(row, userId)
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
  const row = await db.prepare(`
    UPDATE ${USERS_TABLE}
    SET status = ?, disabled_at = ?
    WHERE id = ?
    RETURNING *
  `).bind(status, disabledAt, userId).first()
  return mapUser(row as Record<string, any> | null)
}

export async function requestUserDeletion(
  event: H3Event,
  userId: string,
  termsVersion: string,
): Promise<AuthUser | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const now = new Date()
  const requestedAt = now.toISOString()
  const scheduledAt = new Date(now.getTime() + ACCOUNT_DELETION_RECOVERY_WINDOW_MS).toISOString()

  await db.prepare(`
    UPDATE ${USERS_TABLE}
    SET status = 'deletion_pending',
        disabled_at = NULL,
        deletion_requested_at = ?,
        deletion_scheduled_at = ?,
        deletion_cancelled_at = NULL,
        deletion_terms_version = ?
    WHERE id = ? AND status = 'active'
  `).bind(requestedAt, scheduledAt, termsVersion, userId).run()

  return getUserById(event, userId)
}

export async function restorePendingDeletionIfWithinWindow(
  event: H3Event,
  userId: string,
): Promise<AuthUser | null> {
  const user = await getUserById(event, userId)
  if (!user || user.status !== 'deletion_pending')
    return user

  const scheduledAtMs = user.deletionScheduledAt ? Date.parse(user.deletionScheduledAt) : Number.NaN
  if (!Number.isFinite(scheduledAtMs) || scheduledAtMs <= Date.now())
    return user

  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const cancelledAt = new Date().toISOString()
  await db.prepare(`
    UPDATE ${USERS_TABLE}
    SET status = 'active',
        deletion_requested_at = NULL,
        deletion_scheduled_at = NULL,
        deletion_cancelled_at = ?,
        deletion_terms_version = NULL
    WHERE id = ? AND status = 'deletion_pending'
  `).bind(cancelledAt, userId).run()

  return getUserById(event, userId)
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
  if (normalized === 'ip_mismatch' || normalized === 'permission_denied' || normalized === 'rate_limited' || normalized === 'cooldown' || normalized === 'unknown')
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

function normalizeDeviceAuthAuditAction(value: unknown): DeviceAuthAuditAction {
  if (typeof value !== 'string')
    return 'request'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'request' || normalized === 'approve' || normalized === 'reject' || normalized === 'cancel' || normalized === 'revoke' || normalized === 'trust' || normalized === 'untrust' || normalized === 'recover')
    return normalized
  return 'request'
}

function normalizeDeviceAuthAuditStatus(value: unknown): DeviceAuthAuditStatus {
  if (typeof value !== 'string')
    return 'failed'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'success' || normalized === 'blocked' || normalized === 'failed')
    return normalized
  return 'failed'
}

function safeParseAuditMetadata(value: unknown): Record<string, any> | null {
  if (typeof value !== 'string' || !value.trim())
    return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  }
  catch {
    return null
  }
}

function mapDeviceAuthAuditRow(row: Record<string, any>): DeviceAuthAuditRecord {
  return {
    id: row.id as string,
    action: normalizeDeviceAuthAuditAction(row.action),
    status: normalizeDeviceAuthAuditStatus(row.status),
    userId: row.user_id ?? null,
    deviceId: row.device_id ?? null,
    deviceCode: row.device_code ?? null,
    userCode: row.user_code ?? null,
    clientType: normalizeClientType(row.client_type),
    actorUserId: row.actor_user_id ?? null,
    reason: row.reason ?? null,
    ip: row.ip ?? null,
    ipMasked: maskIpAddress(row.ip ?? null),
    userAgent: row.user_agent ?? null,
    metadata: safeParseAuditMetadata(row.metadata),
    createdAt: row.created_at as string,
  }
}

function isExpiredAt(expiresAt: string): boolean {
  const expires = Date.parse(expiresAt)
  return Number.isNaN(expires) || expires <= Date.now()
}

function secondsUntil(targetMs: number): number {
  const remainingMs = targetMs - Date.now()
  return Math.max(1, Math.ceil(remainingMs / 1000))
}

function newestAuditMs(row: { created_at?: string | null } | null | undefined): number | null {
  if (!row?.created_at)
    return null
  const parsed = Date.parse(row.created_at)
  return Number.isFinite(parsed) ? parsed : null
}

function blockedDeviceAuthActions(): DeviceAuthAuditAction[] {
  return ['reject', 'cancel']
}

interface AuditCountCheck {
  whereSql: string
  params: Array<string | number | null>
}

/** D1 refuses a compound SELECT of more than five terms ("too many terms in compound SELECT"). */
const D1_MAX_COMPOUND_SELECT_TERMS = 5

/**
 * Counts device-auth audits for several limit scopes at once — each check's count and newest
 * timestamp — in one round trip. The limiters used to count scope after scope, and look the newest
 * row up again when one tripped: up to seven round trips before a device code was issued or approved.
 *
 * Each check is one term of a compound SELECT, so it keeps its own index; the terms go five to a
 * statement and the statements into one batch, because D1 refuses a sixth term.
 */
async function countDeviceAuthAuditsBatch(
  db: D1Database,
  checks: AuditCountCheck[],
): Promise<Array<{ total: number, newestMs: number | null }>> {
  if (checks.length === 0)
    return []
  const statements: D1PreparedStatement[] = []
  for (let start = 0; start < checks.length; start += D1_MAX_COMPOUND_SELECT_TERMS) {
    const chunk = checks.slice(start, start + D1_MAX_COMPOUND_SELECT_TERMS)
    const sql = chunk.map((check, offset) => `
      SELECT ${start + offset} AS idx, COUNT(*) AS total, MAX(created_at) AS created_at
      FROM ${DEVICE_AUTH_AUDIT_TABLE}
      WHERE ${check.whereSql}
    `).join(' UNION ALL ')
    statements.push(db.prepare(sql).bind(...chunk.flatMap(check => check.params)))
  }
  const batches = await db.batch<{ idx: number, total?: number | string, created_at?: string | null }>(statements)
  const byIndex = new Map(batches.flatMap(batch => batch.results ?? []).map(row => [Number(row.idx), row]))
  return checks.map((_, index) => {
    const row = byIndex.get(index)
    return { total: toSafeInteger(row?.total), newestMs: newestAuditMs(row) }
  })
}

export async function recordDeviceAuthAudit(event: H3Event, payload: {
  action: DeviceAuthAuditAction
  status: DeviceAuthAuditStatus
  userId?: string | null
  deviceId?: string | null
  deviceCode?: string | null
  userCode?: string | null
  clientType?: AuthClientType | null
  actorUserId?: string | null
  reason?: string | null
  metadata?: Record<string, any> | null
}): Promise<DeviceAuthAuditRecord> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const record: DeviceAuthAuditRecord = {
    id: crypto.randomUUID(),
    action: payload.action,
    status: payload.status,
    userId: payload.userId ?? null,
    deviceId: payload.deviceId ?? null,
    deviceCode: payload.deviceCode ?? null,
    userCode: payload.userCode ?? null,
    clientType: payload.clientType ?? null,
    actorUserId: payload.actorUserId ?? null,
    reason: payload.reason ?? null,
    ip: getRequestIp(event),
    ipMasked: maskIpAddress(getRequestIp(event)),
    userAgent: getUserAgent(event),
    metadata: payload.metadata ?? null,
    createdAt: new Date().toISOString(),
  }

  await db.prepare(`
    INSERT INTO ${DEVICE_AUTH_AUDIT_TABLE} (
      id, action, status, user_id, device_id, device_code, user_code,
      client_type, actor_user_id, reason, ip, user_agent, metadata, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    record.id,
    record.action,
    record.status,
    record.userId,
    record.deviceId,
    record.deviceCode,
    record.userCode,
    record.clientType,
    record.actorUserId,
    record.reason,
    record.ip,
    record.userAgent,
    record.metadata ? JSON.stringify(record.metadata) : null,
    record.createdAt,
  ).run()

  return record
}

export async function listDeviceAuthAudits(
  event: H3Event,
  options: {
    userId?: string | null
    deviceId?: string | null
    limit?: number
  } = {},
): Promise<DeviceAuthAuditRecord[]> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const clauses: string[] = []
  const params: Array<string | number> = []
  if (options.userId) {
    clauses.push('user_id = ?')
    params.push(options.userId)
  }
  if (options.deviceId) {
    clauses.push('device_id = ?')
    params.push(options.deviceId)
  }
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 50)))
  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const result = await db.prepare(`
    SELECT *
    FROM ${DEVICE_AUTH_AUDIT_TABLE}
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(...params, limit).all<Record<string, any>>()
  return (result.results ?? []).map(row => mapDeviceAuthAuditRow(row))
}

/** Failed recovery attempts tolerated per device, then per user, inside the window. */
const RECOVERY_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const RECOVERY_RATE_LIMIT_MAX_BY_DEVICE = 5
const RECOVERY_RATE_LIMIT_MAX_BY_USER = 10

export interface RecoveryRateLimitDecision {
  allowed: boolean
  scope?: 'device' | 'user'
  retryAfterMs?: number
}

/**
 * Bounds guessing of a device recovery code.
 *
 * Nothing counted attempts before: the recovery route called recoverKeyrings on every
 * request, so anyone holding an app token for the account could submit codes indefinitely,
 * and the step-up in that route demands nothing when the device is already trusted or the
 * user has no passkeys registered (#904).
 *
 * Counts only failures, so a legitimate recovery does not consume anyone's budget, and counts
 * per device before per user, so one noisy device cannot lock the account out of every other
 * device it owns.
 */
export async function evaluateRecoveryRateLimit(event: H3Event, payload: {
  userId: string
  deviceId?: string | null
}): Promise<RecoveryRateLimitDecision> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const since = new Date(Date.now() - RECOVERY_RATE_LIMIT_WINDOW_MS).toISOString()

  const checks: Array<{ scope: 'device' | 'user', limit: number, whereSql: string, params: Array<string | number | null> }> = []
  if (payload.deviceId) {
    checks.push({
      scope: 'device',
      limit: RECOVERY_RATE_LIMIT_MAX_BY_DEVICE,
      whereSql: 'action = ? AND status = ? AND device_id = ? AND created_at >= ?',
      params: ['recover', 'failed', payload.deviceId, since],
    })
  }
  checks.push({
    scope: 'user',
    limit: RECOVERY_RATE_LIMIT_MAX_BY_USER,
    whereSql: 'action = ? AND status = ? AND user_id = ? AND created_at >= ?',
    params: ['recover', 'failed', payload.userId, since],
  })

  const counts = await countDeviceAuthAuditsBatch(db, checks)
  for (const [index, check] of checks.entries()) {
    if (counts[index]!.total >= check.limit) {
      return { allowed: false, scope: check.scope, retryAfterMs: RECOVERY_RATE_LIMIT_WINDOW_MS }
    }
  }

  return { allowed: true }
}

export async function evaluateDeviceAuthRateLimit(event: H3Event, payload: {
  deviceId?: string | null
  userId?: string | null
}): Promise<DeviceAuthRateLimitDecision> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const ip = getRequestIp(event)
  const since = new Date(Date.now() - DEVICE_AUTH_RATE_LIMIT_WINDOW_MS).toISOString()
  const cooldownSince = new Date(Date.now() - DEVICE_AUTH_COOLDOWN_WINDOW_MS).toISOString()
  const blockedActions = blockedDeviceAuthActions()
  const actionParams = blockedActions.map(() => '?').join(', ')

  const rateChecks: Array<{
    scope: DeviceAuthRateLimitDecision['scope']
    limit: number
    whereSql: string
    params: Array<string | number | null>
  }> = []
  if (payload.deviceId) {
    rateChecks.push({
      scope: 'device',
      limit: DEVICE_AUTH_RATE_LIMIT_MAX_BY_DEVICE,
      whereSql: 'action = ? AND device_id = ? AND created_at >= ?',
      params: ['request', payload.deviceId, since],
    })
  }
  if (ip) {
    rateChecks.push({
      scope: 'ip',
      limit: DEVICE_AUTH_RATE_LIMIT_MAX_BY_IP,
      whereSql: 'action = ? AND ip = ? AND created_at >= ?',
      params: ['request', ip, since],
    })
  }
  if (payload.userId) {
    rateChecks.push({
      scope: 'user',
      limit: DEVICE_AUTH_RATE_LIMIT_MAX_BY_USER,
      whereSql: 'action = ? AND user_id = ? AND created_at >= ?',
      params: ['request', payload.userId, since],
    })
  }

  const cooldownChecks: Array<{
    scope: DeviceAuthRateLimitDecision['scope']
    whereSql: string
    params: Array<string | number | null>
  }> = []
  if (payload.deviceId) {
    cooldownChecks.push({
      scope: 'device_cooldown',
      whereSql: `action IN (${actionParams}) AND status IN ('blocked', 'success') AND device_id = ? AND created_at >= ?`,
      params: [...blockedActions, payload.deviceId, cooldownSince],
    })
  }
  if (ip) {
    cooldownChecks.push({
      scope: 'ip_cooldown',
      whereSql: `action IN (${actionParams}) AND status IN ('blocked', 'success') AND ip = ? AND created_at >= ?`,
      params: [...blockedActions, ip, cooldownSince],
    })
  }
  if (payload.userId) {
    cooldownChecks.push({
      scope: 'user_cooldown',
      whereSql: `action IN (${actionParams}) AND status IN ('blocked', 'success') AND user_id = ? AND created_at >= ?`,
      params: [...blockedActions, payload.userId, cooldownSince],
    })
  }

  // Every scope in one query; the first that trips decides, in the order the checks were listed.
  const counts = await countDeviceAuthAuditsBatch(db, [...rateChecks, ...cooldownChecks])
  for (const [index, check] of rateChecks.entries()) {
    const { total: count, newestMs } = counts[index]!
    if (count >= check.limit) {
      return {
        allowed: false,
        retryAfterSeconds: secondsUntil((newestMs ?? Date.now()) + DEVICE_AUTH_RATE_LIMIT_WINDOW_MS),
        reason: 'rate_limited',
        scope: check.scope,
        limit: check.limit,
        count,
      }
    }
  }

  for (const [index, check] of cooldownChecks.entries()) {
    const { total: count, newestMs } = counts[rateChecks.length + index]!
    if (count >= DEVICE_AUTH_COOLDOWN_THRESHOLD) {
      return {
        allowed: false,
        retryAfterSeconds: secondsUntil((newestMs ?? Date.now()) + DEVICE_AUTH_COOLDOWN_WINDOW_MS),
        reason: 'cooldown',
        scope: check.scope,
        limit: DEVICE_AUTH_COOLDOWN_THRESHOLD,
        count,
      }
    }
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    reason: null,
    scope: null,
    limit: 0,
    count: 0,
  }
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
  const grantType: DeviceAuthGrantType = payload.clientType === 'app' ? 'long' : 'short'
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
    grantType,
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
    grantType,
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

/**
 * Moves a pending, unexpired device-auth request to another state in one statement and returns the
 * updated row, or null when it was not pending (or had expired) at that moment. Approve, cancel and
 * reject each read the row and then updated it unconditionally, so a request cancelled between the
 * two could still be approved; the guard in the UPDATE closes that, and saves the read.
 */
async function transitionPendingDeviceAuth(
  db: D1Database,
  match: { column: 'user_code' | 'device_code', value: string },
  setSql: string,
  values: Array<string | null>,
): Promise<DeviceAuthRequest | null> {
  const row = await db.prepare(`
    UPDATE ${DEVICE_AUTH_TABLE}
    SET ${setSql}
    WHERE ${match.column} = ? AND status = 'pending' AND expires_at > ?
    RETURNING *
  `).bind(...values, match.value, new Date().toISOString()).first()
  return row ? mapDeviceAuthRow(row as Record<string, any>) : null
}

export async function approveDeviceAuthRequest(
  event: H3Event,
  userCode: string,
  userId: string,
  grantType: 'short' | 'long'
): Promise<DeviceAuthRequest | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  return transitionPendingDeviceAuth(db, { column: 'user_code', value: userCode }, `
    status = 'approved', user_id = ?, approved_at = ?, grant_type = ?, cancelled_at = NULL,
    reject_reason = NULL, reject_message = NULL, reject_request_ip = NULL, reject_current_ip = NULL, rejected_at = NULL
  `, [userId, new Date().toISOString(), grantType])
}

export async function deleteDeviceAuthRequest(event: H3Event, deviceCode: string): Promise<void> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  await db.prepare(`DELETE FROM ${DEVICE_AUTH_TABLE} WHERE device_code = ?`).bind(deviceCode).run()
}

export async function cancelDeviceAuthRequest(event: H3Event, userCode: string): Promise<DeviceAuthRequest | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  return transitionPendingDeviceAuth(db, { column: 'user_code', value: userCode },
    `status = 'cancelled', cancelled_at = ?`, [new Date().toISOString()])
}

export async function cancelDeviceAuthRequestByDeviceCode(event: H3Event, deviceCode: string): Promise<DeviceAuthRequest | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  return transitionPendingDeviceAuth(db, { column: 'device_code', value: deviceCode },
    `status = 'cancelled', cancelled_at = ?`, [new Date().toISOString()])
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
  return transitionPendingDeviceAuth(db, { column: 'user_code', value: userCode }, `
    status = 'rejected', reject_reason = ?, reject_message = ?, reject_request_ip = ?, reject_current_ip = ?, rejected_at = ?
  `, [payload.reason, payload.message ?? null, payload.requestIp ?? null, payload.currentIp ?? null, new Date().toISOString()])
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

  // The sign-in page beats every five seconds while it is open. Only a change of state is worth a
  // write: nothing reads `browser_seen_at`, and every heartbeat used to rewrite it.
  const nextState = state === 'closed' ? 'closed' : 'opened'
  if (request.browserState === nextState)
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

export async function createOAuthCode(
  event: H3Event,
  payload: {
    clientId: string
    userId: string
    redirectUri: string
    ttlMs: number
  },
): Promise<OAuthCode> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + payload.ttlMs).toISOString()
  const code = generateToken(24)

  await db.prepare(`
    INSERT INTO ${OAUTH_CODE_TABLE} (code, client_id, user_id, redirect_uri, expires_at, consumed_at, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6)
  `).bind(code, payload.clientId, payload.userId, payload.redirectUri, expiresAt, now).run()

  return {
    code,
    clientId: payload.clientId,
    userId: payload.userId,
    redirectUri: payload.redirectUri,
    expiresAt,
    consumedAt: null,
    createdAt: now,
  }
}

export async function consumeOAuthCode(
  event: H3Event,
  payload: {
    code: string
    clientId: string
    redirectUri: string
  },
): Promise<OAuthCode | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)

  // One statement consumes the code only if it is unused, unexpired and presented by its own client
  // for its own redirect; anything else leaves it untouched, as the read-then-update did.
  const consumedAt = new Date().toISOString()
  const row = await db.prepare(`
    UPDATE ${OAUTH_CODE_TABLE}
    SET consumed_at = ?1
    WHERE code = ?2
      AND consumed_at IS NULL
      AND expires_at > ?1
      AND client_id = ?3
      AND redirect_uri = ?4
    RETURNING code, client_id, user_id, redirect_uri, expires_at, created_at
  `).bind(consumedAt, payload.code, payload.clientId, payload.redirectUri).first<{
    code: string
    client_id: string
    user_id: string
    redirect_uri: string
    expires_at: string
    created_at: string
  }>()

  if (!row) {
    return null
  }

  return {
    code: row.code,
    clientId: row.client_id,
    userId: row.user_id,
    redirectUri: row.redirect_uri,
    expiresAt: row.expires_at,
    consumedAt,
    createdAt: row.created_at,
  }
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
  // Read-then-delete let two concurrent verifications both accept one challenge; the delete itself
  // is the check now. An expired challenge is left in place, as before.
  const row = await db.prepare(`
    DELETE FROM ${WEBAUTHN_CHALLENGE_TABLE}
    WHERE challenge = ? AND type = ? AND expires_at > ?
    RETURNING user_id
  `).bind(challenge, type, new Date().toISOString()).first<{ user_id: string | null }>()
  if (!row)
    return null
  return { userId: row.user_id ?? null }
}

export async function consumeLoginToken(event: H3Event, token: string, reason?: string | null): Promise<AuthUser | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  // One transaction: read the token's user while the token still exists, then delete the token.
  // The delete decides — if it removed nothing (wrong reason, expired, or another request consumed
  // it first) the user read is discarded. It was a read, a delete and a user read, and two requests
  // could both pass the read before either deleted.
  const now = new Date().toISOString()
  const [userResult, deleted] = await db.batch([
    db.prepare(`
      SELECT u.* FROM ${USERS_TABLE} u
      JOIN ${LOGIN_TOKEN_TABLE} t ON t.user_id = u.id
      WHERE t.token = ?1
    `).bind(token),
    db.prepare(`
      DELETE FROM ${LOGIN_TOKEN_TABLE}
      WHERE token = ?1 AND (?2 IS NULL OR reason = ?2) AND expires_at > ?3
      RETURNING user_id
    `).bind(token, reason || null, now),
  ])
  if (!deleted?.results?.length)
    return null
  return mapUser((userResult?.results?.[0] ?? null) as Record<string, any> | null)
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

export async function getUserAccountActivitySummary(event: H3Event, userId: string): Promise<UserAccountActivitySummary> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)

  const row = await db.prepare(`
    SELECT MAX(value) AS updated_at
    FROM (
      SELECT created_at AS value
      FROM ${USERS_TABLE}
      WHERE id = ?

      UNION ALL


      SELECT created_at AS value
      FROM ${ACCOUNTS_TABLE}
      WHERE user_id = ?

      UNION ALL

      SELECT created_at AS value
      FROM ${PASSKEYS_TABLE}
      WHERE user_id = ?

      UNION ALL

      SELECT last_used_at AS value
      FROM ${PASSKEYS_TABLE}
      WHERE user_id = ? AND last_used_at IS NOT NULL
    )
    WHERE value IS NOT NULL
  `).bind(userId, userId, userId, userId).first<{ updated_at?: string | null }>()

  return {
    updatedAt: row?.updated_at ?? null,
  }
}

export interface UserAccountOverview {
  passkeyCount: number
  linkedAccounts: LinkedAccount[]
  /** Latest of the user's creation, a linked account's creation, a passkey's creation or last use. */
  updatedAt: string | null
  bootstrap: AdminBootstrapState
}

/**
 * What `/api/user/me` adds to the user row, in one round trip: it was four (passkeys, linked
 * accounts, a UNION over three tables for the activity time, and the bootstrap check). The activity
 * time is derived from rows this batch already returns.
 */
export async function getUserAccountOverview(event: H3Event, user: AuthUser): Promise<UserAccountOverview> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const [passkeyResult, accountResult, bootstrapResult] = await db.batch([
    db.prepare(`
      SELECT COUNT(*) AS total, MAX(created_at) AS latest_created_at, MAX(last_used_at) AS latest_used_at
      FROM ${PASSKEYS_TABLE}
      WHERE user_id = ?
    `).bind(user.id),
    db.prepare(`
      SELECT provider, provider_account_id, created_at
      FROM ${ACCOUNTS_TABLE}
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).bind(user.id),
    db.prepare(ADMIN_BOOTSTRAP_SQL),
  ])

  const passkeys = (passkeyResult?.results?.[0] ?? {}) as { total?: number, latest_created_at?: string | null, latest_used_at?: string | null }
  const accountRows = (accountResult?.results ?? []) as Array<{ provider?: string, provider_account_id?: string, created_at?: string | null }>
  const linkedAccounts = accountRows
    .filter(row => typeof row.provider === 'string' && typeof row.provider_account_id === 'string')
    .map(row => ({ provider: row.provider as string, providerAccountId: row.provider_account_id as string }))

  // The same answer as SQLite's MAX over TEXT: the greatest non-null string.
  const candidates = [user.createdAt, passkeys.latest_created_at, passkeys.latest_used_at, ...accountRows.map(row => row.created_at)]
    .filter((value): value is string => typeof value === 'string')
  const updatedAt = candidates.reduce<string | null>((latest, value) => (latest === null || value > latest ? value : latest), null)

  return {
    passkeyCount: Number(passkeys.total ?? 0),
    linkedAccounts,
    updatedAt,
    bootstrap: mapAdminBootstrapState(bootstrapResult?.results?.[0] as { admin_count?: number, first_user_id?: string | null } | undefined, user.id),
  }
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

function buildLegacySyncItemsMergeStatements(
  db: D1Database,
  sourceUserId: string,
  targetUserId: string
): D1PreparedStatement[] {
  return [
    db.prepare(`
    DELETE FROM sync_items
    WHERE user_id = ?1
      AND EXISTS (
        SELECT 1
        FROM sync_items AS target
        WHERE target.user_id = ?2
          AND target.namespace = sync_items.namespace
          AND target.key = sync_items.key
          AND target.updated_at >= sync_items.updated_at
      )
  `).bind(sourceUserId, targetUserId),
    db.prepare(`
    DELETE FROM sync_items
    WHERE user_id = ?2
      AND EXISTS (
        SELECT 1
        FROM sync_items AS source
        WHERE source.user_id = ?1
          AND source.namespace = sync_items.namespace
          AND source.key = sync_items.key
          AND source.updated_at > sync_items.updated_at
      )
  `).bind(sourceUserId, targetUserId),
    db.prepare(`
    UPDATE sync_items
    SET user_id = ?2
    WHERE user_id = ?1
  `).bind(sourceUserId, targetUserId),
  ]
}

export async function mergeLegacySyncItemsForUsers(
  db: D1Database,
  sourceUserId: string,
  targetUserId: string
): Promise<void> {
  if (!(await tableExists(db, 'sync_items'))) {
    return
  }

  await db.batch(buildLegacySyncItemsMergeStatements(db, sourceUserId, targetUserId))
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

  // D1 has no interactive transaction, so run the whole account re-parent as a
  // single db.batch(): every write commits together or none do, preventing a
  // half-merged account if a statement (or the Worker) fails mid-sequence.
  // Optional-table existence is read up front since the batch is a fixed list.
  const [hasSyncItems, hasApiKeys, hasPlugins, hasPluginReviews, hasPluginRatings, hasActivationLogs, hasTelemetryEvents] = await Promise.all([
    tableExists(db, 'sync_items'),
    tableExists(db, 'api_keys'),
    tableExists(db, 'plugins'),
    tableExists(db, 'plugin_reviews'),
    tableExists(db, 'plugin_ratings'),
    tableExists(db, 'activation_logs'),
    tableExists(db, 'telemetry_events'),
  ])

  const statements: D1PreparedStatement[] = [
    db.prepare(`
    UPDATE ${ACCOUNTS_TABLE}
    SET user_id = ?
    WHERE user_id = ?
  `).bind(input.targetUserId, input.sourceUserId),
    db.prepare(`
    UPDATE ${PASSKEYS_TABLE}
    SET user_id = ?
    WHERE user_id = ?
  `).bind(input.targetUserId, input.sourceUserId),
    db.prepare(`
    UPDATE ${DEVICES_TABLE}
    SET user_id = ?
    WHERE user_id = ?
  `).bind(input.targetUserId, input.sourceUserId),
    db.prepare(`
    UPDATE ${LOGIN_HISTORY_TABLE}
    SET user_id = ?
    WHERE user_id = ?
  `).bind(input.targetUserId, input.sourceUserId),
    db.prepare(`DELETE FROM ${LOGIN_TOKEN_TABLE} WHERE user_id = ?`).bind(input.sourceUserId),
    db.prepare(`DELETE FROM ${WEBAUTHN_CHALLENGE_TABLE} WHERE user_id = ?`).bind(input.sourceUserId),
  ]

  if (hasSyncItems)
    statements.push(...buildLegacySyncItemsMergeStatements(db, input.sourceUserId, input.targetUserId))

  if (hasApiKeys) {
    statements.push(db.prepare(`
      UPDATE api_keys
      SET user_id = ?1
      WHERE user_id = ?2
    `).bind(input.targetUserId, input.sourceUserId))
  }

  if (hasPlugins) {
    statements.push(db.prepare(`
      UPDATE plugins
      SET user_id = ?1
      WHERE user_id = ?2
    `).bind(input.targetUserId, input.sourceUserId))
  }

  if (hasPluginReviews) {
    statements.push(
      db.prepare(`
      DELETE FROM plugin_reviews
      WHERE user_id = ?1
        AND plugin_id IN (SELECT plugin_id FROM plugin_reviews WHERE user_id = ?2)
    `).bind(input.sourceUserId, input.targetUserId),
      db.prepare(`
      UPDATE plugin_reviews
      SET user_id = ?1
      WHERE user_id = ?2
    `).bind(input.targetUserId, input.sourceUserId),
    )
  }

  if (hasPluginRatings) {
    statements.push(
      db.prepare(`
      DELETE FROM plugin_ratings
      WHERE user_id = ?1
        AND plugin_id IN (SELECT plugin_id FROM plugin_ratings WHERE user_id = ?2)
    `).bind(input.sourceUserId, input.targetUserId),
      db.prepare(`
      UPDATE plugin_ratings
      SET user_id = ?1
      WHERE user_id = ?2
    `).bind(input.targetUserId, input.sourceUserId),
    )
  }

  if (hasActivationLogs) {
    statements.push(db.prepare(`
      UPDATE activation_logs
      SET user_id = ?1
      WHERE user_id = ?2
    `).bind(input.targetUserId, input.sourceUserId))
  }

  if (hasTelemetryEvents) {
    statements.push(db.prepare(`
      UPDATE telemetry_events
      SET user_id = ?1
      WHERE user_id = ?2
    `).bind(input.targetUserId, input.sourceUserId))
  }

  statements.push(
    db.prepare(`
    UPDATE ${USERS_TABLE}
    SET status = 'merged',
        merged_to_user_id = ?,
        merged_at = ?,
        merged_by_user_id = ?,
        disabled_at = COALESCE(disabled_at, ?)
    WHERE id = ?
  `).bind(input.targetUserId, now, mergedBy, now, input.sourceUserId),
    db.prepare(`
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
    ),
  )

  await db.batch(statements)
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

interface DeviceMetadata {
  deviceName?: string | null
  platform?: string | null
  clientType?: AuthClientType | null
  reactivateRevoked?: boolean | null
}

/** How long a device's `last_seen_*` may lag before an ordinary request refreshes it. */
const DEVICE_TOUCH_INTERVAL_MS = 5 * 60 * 1000

/**
 * One statement that records the request's device, whatever the row's state: insert it, refresh it
 * for the same owner, or hand it to a new owner. It replaces a SELECT, an UPDATE or INSERT, a COUNT
 * of active devices, an UPDATE of `trusted_at` and a re-read — five round trips on every signed-in
 * request, since the web client sends `x-device-id` on each one.
 *
 * What it keeps:
 * - Same owner: metadata the request omits is kept (`COALESCE`); `last_seen_*` is overwritten,
 *   geo included. `reactivateRevoked` clears `revoked_at` and, if the device was revoked, bumps
 *   `token_version`.
 * - New owner (the row exists under another user): the metadata is replaced, `created_at` restarts,
 *   `revoked_at` clears, `trusted_at` clears and `token_version` bumps, so the old owner's app tokens
 *   for this device stop working.
 * - The only active device of its user is trusted: `trusted_at` is set when no other active device
 *   exists — on insert, on a hand-over, and on any later request that finds it alone, as the COUNT
 *   step did.
 * - Nothing is written for a user that does not exist or is not active (the request is rejected
 *   right after).
 *
 * Unless `force` is set, a row with the same owner is left alone when nothing about it would change:
 * `last_seen_at` is younger than `DEVICE_TOUCH_INTERVAL_MS`, the IP and the metadata are the same,
 * and trust would not change. `RETURNING` then yields no row. Callers that need the row (its
 * `token_version` goes into app tokens) force the write.
 */
function prepareDeviceUpsert(
  db: D1Database,
  event: H3Event,
  userId: string,
  deviceId: string,
  data: DeviceMetadata | undefined,
  options: { force: boolean },
): D1PreparedStatement {
  const now = new Date()
  const geo = resolveRequestGeo(event)
  return db.prepare(`
    INSERT INTO ${DEVICES_TABLE} (
      id, user_id, device_name, platform, client_type, user_agent,
      last_seen_at, last_seen_ip, last_seen_country_code, last_seen_region_code,
      last_seen_region_name, last_seen_city, last_seen_latitude, last_seen_longitude,
      last_seen_timezone, last_seen_geo_source, created_at, trusted_at
    )
    SELECT
      ?1, ?2, ?3, ?4, ?5, ?6,
      ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?7,
      CASE WHEN NOT EXISTS (
        SELECT 1 FROM ${DEVICES_TABLE} other
        WHERE other.user_id = ?2 AND other.revoked_at IS NULL AND other.id <> ?1
      ) THEN ?7 END
    WHERE EXISTS (SELECT 1 FROM ${USERS_TABLE} WHERE id = ?2 AND status = 'active')
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      device_name = CASE WHEN ${DEVICES_TABLE}.user_id = excluded.user_id
        THEN COALESCE(excluded.device_name, ${DEVICES_TABLE}.device_name) ELSE excluded.device_name END,
      platform = CASE WHEN ${DEVICES_TABLE}.user_id = excluded.user_id
        THEN COALESCE(excluded.platform, ${DEVICES_TABLE}.platform) ELSE excluded.platform END,
      client_type = CASE WHEN ${DEVICES_TABLE}.user_id = excluded.user_id
        THEN COALESCE(excluded.client_type, ${DEVICES_TABLE}.client_type) ELSE excluded.client_type END,
      user_agent = CASE WHEN ${DEVICES_TABLE}.user_id = excluded.user_id
        THEN COALESCE(excluded.user_agent, ${DEVICES_TABLE}.user_agent) ELSE excluded.user_agent END,
      last_seen_at = excluded.last_seen_at,
      last_seen_ip = excluded.last_seen_ip,
      last_seen_country_code = excluded.last_seen_country_code,
      last_seen_region_code = excluded.last_seen_region_code,
      last_seen_region_name = excluded.last_seen_region_name,
      last_seen_city = excluded.last_seen_city,
      last_seen_latitude = excluded.last_seen_latitude,
      last_seen_longitude = excluded.last_seen_longitude,
      last_seen_timezone = excluded.last_seen_timezone,
      last_seen_geo_source = excluded.last_seen_geo_source,
      created_at = CASE WHEN ${DEVICES_TABLE}.user_id = excluded.user_id
        THEN ${DEVICES_TABLE}.created_at ELSE excluded.created_at END,
      revoked_at = CASE
        WHEN ${DEVICES_TABLE}.user_id <> excluded.user_id THEN NULL
        WHEN ?17 THEN NULL
        ELSE ${DEVICES_TABLE}.revoked_at
      END,
      token_version = CASE
        WHEN ${DEVICES_TABLE}.user_id <> excluded.user_id THEN ${DEVICES_TABLE}.token_version + 1
        WHEN ?17 AND ${DEVICES_TABLE}.revoked_at IS NOT NULL THEN ${DEVICES_TABLE}.token_version + 1
        ELSE ${DEVICES_TABLE}.token_version
      END,
      trusted_at = CASE
        WHEN ${DEVICES_TABLE}.user_id <> excluded.user_id THEN excluded.trusted_at
        WHEN (?17 OR ${DEVICES_TABLE}.revoked_at IS NULL) AND excluded.trusted_at IS NOT NULL
          THEN COALESCE(${DEVICES_TABLE}.trusted_at, excluded.trusted_at)
        ELSE ${DEVICES_TABLE}.trusted_at
      END
    WHERE ?18
      OR ${DEVICES_TABLE}.user_id <> excluded.user_id
      OR (?17 AND ${DEVICES_TABLE}.revoked_at IS NOT NULL)
      OR ${DEVICES_TABLE}.last_seen_at IS NULL
      OR ${DEVICES_TABLE}.last_seen_at < ?19
      OR ${DEVICES_TABLE}.last_seen_ip IS NOT excluded.last_seen_ip
      OR (excluded.device_name IS NOT NULL AND excluded.device_name IS NOT ${DEVICES_TABLE}.device_name)
      OR (excluded.platform IS NOT NULL AND excluded.platform IS NOT ${DEVICES_TABLE}.platform)
      OR (excluded.client_type IS NOT NULL AND excluded.client_type IS NOT ${DEVICES_TABLE}.client_type)
      OR (excluded.user_agent IS NOT NULL AND excluded.user_agent IS NOT ${DEVICES_TABLE}.user_agent)
      OR (${DEVICES_TABLE}.trusted_at IS NULL AND ${DEVICES_TABLE}.revoked_at IS NULL AND excluded.trusted_at IS NOT NULL)
    RETURNING *
  `).bind(
    deviceId,
    userId,
    data?.deviceName ?? null,
    data?.platform ?? null,
    data?.clientType ?? null,
    getUserAgent(event),
    now.toISOString(),
    getRequestIp(event),
    geo.countryCode,
    geo.regionCode,
    geo.regionName,
    geo.city,
    geo.latitude,
    geo.longitude,
    geo.timezone,
    geo.source,
    data?.reactivateRevoked ? 1 : 0,
    options.force ? 1 : 0,
    new Date(now.getTime() - DEVICE_TOUCH_INTERVAL_MS).toISOString(),
  )
}

/**
 * Records the device and returns its row, always writing: the caller needs the current
 * `token_version` (it goes into the app tokens being issued). One round trip.
 */
export async function upsertDevice(
  event: H3Event,
  userId: string,
  deviceId: string,
  data?: DeviceMetadata,
): Promise<AuthDevice> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await prepareDeviceUpsert(db, event, userId, deviceId, data, { force: true }).first()
  const device = mapDevice(row as Record<string, any> | null)
  if (!device) {
    throw new Error('Failed to upsert device.')
  }
  return device
}

/**
 * Records the device of an ordinary request, writing only when something changed or `last_seen_at`
 * is older than `DEVICE_TOUCH_INTERVAL_MS`. Resolves to the device id, which belongs to `userId`
 * afterwards whether or not a write happened.
 */
export async function touchDevice(
  event: H3Event,
  userId: string,
  deviceId: string,
  data?: DeviceMetadata,
): Promise<string> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  await prepareDeviceUpsert(db, event, userId, deviceId, data, { force: false }).run()
  return deviceId
}

/**
 * The user row, and the request's device recorded for that user, in one round trip: what every
 * signed-in request needs before its handler runs. The device statement writes only for an active
 * user, so `deviceId` is returned only then.
 */
export async function getUserAndTouchRequestDevice(
  event: H3Event,
  userId: string,
): Promise<{ user: AuthUser | null, deviceId: string | null }> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const userStatement = db.prepare(`SELECT * FROM ${USERS_TABLE} WHERE id = ?`).bind(userId)
  const deviceId = readDeviceId(event)
  if (!deviceId) {
    const row = await userStatement.first()
    return { user: mapUser(row as Record<string, any> | null), deviceId: null }
  }

  const [userResult] = await db.batch([
    userStatement,
    prepareDeviceUpsert(db, event, userId, deviceId, readDeviceMetadata(event), { force: false }),
  ])
  const user = mapUser((userResult?.results?.[0] ?? null) as Record<string, any> | null)
  return { user, deviceId: user?.status === 'active' ? deviceId : null }
}

/** The user and one of their devices, in one round trip (app-token requests check both). */
export async function getUserWithDevice(
  event: H3Event,
  userId: string,
  deviceId: string,
): Promise<{ user: AuthUser | null, device: AuthDevice | null }> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const [userResult, deviceResult] = await db.batch([
    db.prepare(`SELECT * FROM ${USERS_TABLE} WHERE id = ?`).bind(userId),
    db.prepare(`SELECT * FROM ${DEVICES_TABLE} WHERE id = ? AND user_id = ?`).bind(deviceId, userId),
  ])
  return {
    user: mapUser((userResult?.results?.[0] ?? null) as Record<string, any> | null),
    device: mapDevice((deviceResult?.results?.[0] ?? null) as Record<string, any> | null),
  }
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
      COALESCE(d.last_seen_country_code, h.country_code) AS country_code,
      COALESCE(d.last_seen_region_code, h.region_code) AS region_code,
      COALESCE(d.last_seen_region_name, h.region_name) AS region_name,
      COALESCE(d.last_seen_city, h.city) AS city,
      COALESCE(d.last_seen_latitude, h.latitude) AS latitude,
      COALESCE(d.last_seen_longitude, h.longitude) AS longitude,
      COALESCE(d.last_seen_timezone, h.timezone) AS timezone
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

/** The user's active devices, as `{ total }`: for callers batching it. */
export function prepareActiveDeviceCount(db: D1Database, userId: string): D1PreparedStatement {
  return db.prepare(`
    SELECT COUNT(*) as total
    FROM ${DEVICES_TABLE}
    WHERE user_id = ? AND revoked_at IS NULL
  `).bind(userId)
}

export async function countActiveDevices(event: H3Event, userId: string): Promise<number> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const row = await prepareActiveDeviceCount(db, userId).first<{ total: number }>()
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
  await db.prepare(`
    UPDATE ${DEVICES_TABLE}
    SET revoked_at = ?1, token_version = token_version + 1
    WHERE user_id = ?2 AND id IN (SELECT value FROM json_each(?3))
  `).bind(now, userId, JSON.stringify(ids)).run()

  return summaries
}

/**
 * Revokes the user's devices not seen since `inactiveBefore` (all but `keepDeviceId`) and counts the
 * active devices left, in one round trip: the revocation answers with the rows it revoked, which a
 * read and an update by id (an `IN` list of every inactive device) used to take, and the count was a
 * third.
 */
export async function revokeInactiveDevicesAndCountActive(
  event: H3Event,
  userId: string,
  options: { inactiveBefore: string; keepDeviceId?: string | null }
): Promise<{ evicted: EvictedDeviceSummary[], activeCount: number }> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const statements: D1PreparedStatement[] = []
  if (options.inactiveBefore) {
    const keepDeviceId = options.keepDeviceId ?? null
    statements.push(db.prepare(`
      UPDATE ${DEVICES_TABLE}
      SET revoked_at = ?1, token_version = token_version + 1
      WHERE user_id = ?2 AND revoked_at IS NULL
        AND COALESCE(last_seen_at, created_at) < ?3${keepDeviceId ? ' AND id != ?4' : ''}
      RETURNING id, device_name, platform, last_seen_at, created_at
    `).bind(new Date().toISOString(), userId, options.inactiveBefore, ...(keepDeviceId ? [keepDeviceId] : [])))
  }
  statements.push(prepareActiveDeviceCount(db, userId))

  const results = await db.batch(statements)
  const countResult = results.at(-1)
  // Longest unseen first, as the read before the update ordered them.
  const revoked = (statements.length > 1 ? (results[0]?.results ?? []) : []) as Array<Record<string, any>>
  const evicted = [...revoked]
    .sort((left, right) => {
      const leftSeen = String(left.last_seen_at ?? left.created_at ?? '')
      const rightSeen = String(right.last_seen_at ?? right.created_at ?? '')
      if (leftSeen !== rightSeen)
        return leftSeen < rightSeen ? -1 : 1
      return String(left.created_at ?? '') < String(right.created_at ?? '') ? -1 : String(left.created_at ?? '') > String(right.created_at ?? '') ? 1 : 0
    })
    .map(row => mapEvictedDeviceSummary(row))
    .filter((item): item is EvictedDeviceSummary => Boolean(item))
  return { evicted, activeCount: Number((countResult?.results?.[0] as { total?: number } | undefined)?.total ?? 0) }
}

export async function renameDevice(
  event: H3Event,
  userId: string,
  deviceId: string,
  deviceName: string
): Promise<AuthDevice | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  // Owner-scoped update only. Unlike upsertDevice, this never re-parents a
  // device owned by another user, so a rename can't hijack someone else's
  // device or bump their token_version.
  const result = await db.prepare(`
    UPDATE ${DEVICES_TABLE}
    SET device_name = ?
    WHERE id = ? AND user_id = ?
  `).bind(deviceName, deviceId, userId).run()
  if (Number((result as any)?.meta?.changes ?? 0) < 1)
    return null
  return getDevice(event, userId, deviceId)
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

export async function revokeAllDevicesForUser(event: H3Event, userId: string): Promise<number> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const now = new Date().toISOString()
  const result = await db.prepare(`
    UPDATE ${DEVICES_TABLE}
    SET revoked_at = ?,
        token_version = token_version + 1
    WHERE user_id = ? AND revoked_at IS NULL
  `).bind(now, userId).run()
  return Number(result.meta?.changes ?? 0)
}

export async function clearUserAuthEphemeralTokens(event: H3Event, userId: string): Promise<void> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  await db.prepare(`DELETE FROM ${LOGIN_TOKEN_TABLE} WHERE user_id = ?`).bind(userId).run()
  await db.prepare(`DELETE FROM ${WEBAUTHN_CHALLENGE_TABLE} WHERE user_id = ?`).bind(userId).run()
  await db.prepare(`DELETE FROM ${DEVICE_AUTH_TABLE} WHERE user_id = ?`).bind(userId).run()
  await db.prepare(`DELETE FROM ${OAUTH_CODE_TABLE} WHERE user_id = ? AND consumed_at IS NULL`).bind(userId).run()
}

export async function setDeviceTrusted(event: H3Event, userId: string, deviceId: string, trusted: boolean): Promise<AuthDevice | null> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  await db.prepare(`
    UPDATE ${DEVICES_TABLE}
    SET trusted_at = ?
    WHERE id = ? AND user_id = ? AND revoked_at IS NULL
  `).bind(trusted ? new Date().toISOString() : null, deviceId, userId).run()
  return getDevice(event, userId, deviceId)
}


export async function logLoginAttempt(event: H3Event, payload: {
  userId?: string | null
  deviceId?: string | null
  success: boolean
  reason?: string | null
  clientType?: AuthLoginClientType | null
}): Promise<void> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const geo = resolveRequestGeo(event)
  const clientType = payload.clientType ?? normalizeLoginClientType(event.node.req.headers['x-device-client'])
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

const LOGIN_HISTORY_RETENTION_DAYS = 90
const LOGIN_HISTORY_PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000
let nextLoginHistoryPruneAt = 0

/**
 * Retention for every user's login history used to run inside this read: a DELETE across the whole
 * table, before the SELECT, on each dashboard overview and account page. It runs at most every six
 * hours per isolate now, after the response, and the read applies its own cutoff.
 */
function scheduleLoginHistoryRetention(event: H3Event, db: D1Database): void {
  const now = Date.now()
  if (now < nextLoginHistoryPruneAt)
    return
  nextLoginHistoryPruneAt = now + LOGIN_HISTORY_PRUNE_INTERVAL_MS
  const cutoff = new Date(now - LOGIN_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  runAfterResponse(event, 'login history retention', () =>
    db.prepare(`DELETE FROM ${LOGIN_HISTORY_TABLE} WHERE created_at < ?`).bind(cutoff).run())
}

export async function listLoginHistory(event: H3Event, userId: string, days = LOGIN_HISTORY_RETENTION_DAYS): Promise<AuthLoginHistoryRecord[]> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  scheduleLoginHistoryRetention(event, db)
  const result = await db.prepare(`
    SELECT * FROM ${LOGIN_HISTORY_TABLE}
    WHERE user_id = ? AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT 200
  `).bind(userId, cutoff).all()
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
      client_type: normalizeLoginClientType(row.client_type),
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
  deviceId: string,
  options: { sessionIssuedAt?: number | null } = {},
): Promise<DeviceAuthLongTermPolicy> {
  const db = requireDatabase(event)
  await ensureAuthSchema(db)
  const sessionIssuedAtMs = typeof options.sessionIssuedAt === 'number' && Number.isFinite(options.sessionIssuedAt)
    ? options.sessionIssuedAt * 1000
    : null
  const sessionFresh = Boolean(sessionIssuedAtMs && Date.now() - sessionIssuedAtMs <= DEVICE_AUTH_LONG_TERM_SESSION_WINDOW_MS)
  const sessionWindowSeconds = Math.floor(DEVICE_AUTH_LONG_TERM_SESSION_WINDOW_MS / 1000)
  const deviceRow = await db.prepare(`
    SELECT revoked_at, trusted_at
    FROM ${DEVICES_TABLE}
    WHERE id = ? AND user_id = ?
    LIMIT 1
  `).bind(deviceId, userId).first<{ revoked_at?: string | null, trusted_at?: string | null }>()

  const deviceTrusted = Boolean(deviceRow && !deviceRow.revoked_at && deviceRow.trusted_at)
  const geo = resolveRequestGeo(event)
  const hasGeo = Boolean(geo.countryCode || geo.regionCode || geo.city)
  if (!hasGeo) {
    return {
      allowLongTerm: false,
      deviceTrusted,
      locationTrusted: false,
      sessionFresh,
      sessionWindowSeconds,
      reason: !deviceTrusted ? 'device' : !sessionFresh ? 'session_window' : 'location',
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

  const allowLongTerm = deviceTrusted && locationTrusted && sessionFresh
  let reason: DeviceAuthLongTermPolicy['reason'] = null
  if (!deviceTrusted)
    reason = 'device'
  else if (!locationTrusted)
    reason = 'location'
  else if (!sessionFresh)
    reason = 'session_window'

  return {
    allowLongTerm,
    deviceTrusted,
    locationTrusted,
    sessionFresh,
    sessionWindowSeconds,
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

export function normalizeLoginClientType(value: unknown): AuthLoginClientType | null {
  const normalized = normalizeClientType(value)
  if (normalized)
    return normalized
  return typeof value === 'string' && value.trim().toLowerCase() === 'web' ? 'web' : null
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

/** Records the request's device for `userId` (throttled, see `touchDevice`); resolves to its id. */
export async function ensureDeviceForRequest(event: H3Event, userId: string): Promise<string | null> {
  const deviceId = readDeviceId(event)
  if (!deviceId)
    return null
  return touchDevice(event, userId, deviceId, readDeviceMetadata(event))
}
