import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { ensureApiKeySchema, listApiKeys } from './apiKeyStore'
import {
  AUTH_DELETION_RECOVERY_WINDOW_MS,
  ensureAuthSchema,
  getUserById,
  listDevices,
  listPasskeys,
  listUserLinkedAccounts,
} from './authStore'
import { readCloudflareBindings } from './cloudflare'

export const ACCOUNT_DELETION_CONFIRM_PHRASE = 'DELETE_MY_DATA'
export const ACCOUNT_DELETION_TERMS_VERSION = '2026-11-28'
export const ACCOUNT_DELETION_RECENT_AUTH_WINDOW_SECONDS = 15 * 60

const PRIVATE_EXPORT_FIELD_PATTERN = /(secret|token|hash|password|credential)/i

function getD1Database(event: H3Event): D1Database {
  const db = readCloudflareBindings(event)?.DB
  if (!db)
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  return db
}

function nowIso(): string {
  return new Date().toISOString()
}

function safeJsonParse(value: unknown, fallback: unknown) {
  if (typeof value !== 'string')
    return fallback
  try {
    return JSON.parse(value)
  }
  catch {
    return fallback
  }
}

function isMissingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /no such table/i.test(message)
}

export function redactPrivateExportFields(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(item => redactPrivateExportFields(item))

  if (!value || typeof value !== 'object')
    return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !PRIVATE_EXPORT_FIELD_PATTERN.test(key))
      .map(([key, item]) => [key, redactPrivateExportFields(item)]),
  )
}

function sanitizePasskeys(rows: any[]) {
  return rows.map(row => ({
    id: row.id,
    transports: safeJsonParse(row.transports, []),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? null,
  }))
}

function sanitizeDevices(rows: Awaited<ReturnType<typeof listDevices>>) {
  return rows.map(row => ({
    id: row.id,
    userId: row.userId,
    deviceName: row.deviceName,
    platform: row.platform,
    clientType: row.clientType,
    trustedAt: row.trustedAt,
    trusted: row.trusted,
    userAgent: row.userAgent,
    lastSeenAt: row.lastSeenAt,
    lastSeenIpMasked: row.lastSeenIpMasked,
    lastLoginIpMasked: row.lastLoginIpMasked,
    lastLoginAt: row.lastLoginAt,
    lastLocation: row.lastLocation,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  }))
}

async function readUserTelemetryExport(db: D1Database, userId: string) {
  try {
    const [countRow, rows] = await Promise.all([
      db.prepare(`
        SELECT COUNT(*) AS total
        FROM telemetry_events
        WHERE user_id = ?1
      `).bind(userId).first<{ total?: number }>(),
      db.prepare(`
        SELECT id, event_type, platform, version, region, country_code, is_anonymous, created_at
        FROM telemetry_events
        WHERE user_id = ?1
        ORDER BY created_at DESC
        LIMIT 200
      `).bind(userId).all<{
        id: string
        event_type: string
        platform: string | null
        version: string | null
        region: string | null
        country_code: string | null
        is_anonymous: number
        created_at: string
      }>(),
    ])
    return {
      totalCount: Number(countRow?.total ?? 0),
      recentEvents: (rows.results ?? []).map(row => ({
        id: row.id,
        eventType: row.event_type,
        platform: row.platform,
        version: row.version,
        region: row.country_code || row.region,
        isAnonymous: row.is_anonymous === 1,
        createdAt: row.created_at,
      })),
    }
  }
  catch (error) {
    if (isMissingTableError(error))
      return { totalCount: 0, recentEvents: [] }
    throw error
  }
}

async function readUserProviderUsageExport(db: D1Database, userId: string) {
  let intelligenceAudits: Array<Record<string, unknown>> = []
  let asrRequests: Array<Record<string, unknown>> = []

  try {
    const { results } = await db.prepare(`
      SELECT id, provider_id, provider_type, model, status, latency, success, trace_id, created_at
      FROM intelligence_audits
      WHERE user_id = ?1
      ORDER BY created_at DESC
      LIMIT 200
    `).bind(userId).all<{
      id: string
      provider_id: string
      provider_type: string
      model: string
      status: number | null
      latency: number | null
      success: number
      trace_id: string | null
      created_at: string
    }>()
    intelligenceAudits = (results ?? []).map(row => ({
      id: row.id,
      providerId: row.provider_id,
      providerType: row.provider_type,
      model: row.model,
      status: row.status,
      latency: row.latency,
      success: row.success === 1,
      traceId: row.trace_id,
      createdAt: row.created_at,
    }))
  }
  catch (error) {
    if (!isMissingTableError(error))
      throw error
  }

  try {
    const { results } = await db.prepare(`
      SELECT id, provider_id, capability, status, duration_seconds, billed_seconds, created_at, updated_at
      FROM asr_transcription_requests
      WHERE user_id = ?1
      ORDER BY created_at DESC
      LIMIT 200
    `).bind(userId).all<{
      id: string
      provider_id: string
      capability: string
      status: string
      duration_seconds: number
      billed_seconds: number | null
      created_at: string
      updated_at: string
    }>()
    asrRequests = (results ?? []).map(row => ({
      id: row.id,
      providerId: row.provider_id,
      capability: row.capability,
      status: row.status,
      durationSeconds: row.duration_seconds,
      billedSeconds: row.billed_seconds,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }
  catch (error) {
    if (!isMissingTableError(error))
      throw error
  }

  return { intelligenceAudits, asrRequests }
}

export async function buildUserPrivacyExport(event: H3Event, userId: string): Promise<Record<string, unknown>> {
  const db = getD1Database(event)
  const user = await getUserById(event, userId)
  if (!user)
    throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const [
    devices,
    passkeys,
    apiKeys,
    linkedAccounts,
    telemetry,
    providerUsage,
  ] = await Promise.all([
    listDevices(event, userId),
    listPasskeys(event, userId),
    listApiKeys(event, userId),
    listUserLinkedAccounts(event, userId),
    readUserTelemetryExport(db, userId),
    readUserProviderUsageExport(db, userId),
  ])

  return redactPrivateExportFields({
    exportedAt: nowIso(),
    account: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: user.emailVerified,
      emailState: user.emailState,
      role: user.role,
      locale: user.locale,
      status: user.status,
      createdAt: user.createdAt,
      deletionRequestedAt: user.deletionRequestedAt,
      deletionScheduledAt: user.deletionScheduledAt,
      deletionCancelledAt: user.deletionCancelledAt,
    },
    privacySettings: user.privacySettings,
    securitySettings: {
      allowCliIpMismatch: user.allowCliIpMismatch,
    },
    devices: sanitizeDevices(devices),
    passkeys: sanitizePasskeys(passkeys as any[]),
    apiKeys,
    linkedAccounts,
    telemetry,
    providerUsage,
  }) as Record<string, unknown>
}

export interface SingleStepAccountDeletionResult {
  ok: true
  status: 'deletion_pending'
  deletionRequestedAt: string
  deletionScheduledAt: string
}

function buildPendingDeletionGuardSql(userIdParam: string, requestedAtParam: string): string {
  return `EXISTS (
    SELECT 1 FROM auth_users
    WHERE id = ${userIdParam}
      AND status = 'deletion_pending'
      AND deletion_requested_at = ${requestedAtParam}
  )`
}

/**
 * Single-step account deletion transition (replaces legacy 2-step terms-session flow).
 * Atomically transitions the user to `deletion_pending`, revokes all active devices,
 * and deletes login tokens, WebAuthn challenges, device auth requests, and personal API keys.
 */
export async function deleteUserAccountSingleStep(
  event: H3Event,
  input: {
    userId: string
    confirm: string
  },
): Promise<SingleStepAccountDeletionResult> {
  if (input.confirm !== ACCOUNT_DELETION_CONFIRM_PHRASE) {
    throw createError({
      statusCode: 400,
      statusMessage: `Confirmation phrase must equal ${ACCOUNT_DELETION_CONFIRM_PHRASE}.`,
    })
  }

  const db = getD1Database(event)
  await Promise.all([
    ensureAuthSchema(db),
    ensureApiKeySchema(db),
  ])

  const existing = await getUserById(event, input.userId)
  if (!existing)
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  if (existing.status === 'deletion_pending') {
    return {
      ok: true,
      status: 'deletion_pending',
      deletionRequestedAt: existing.deletionRequestedAt ?? nowIso(),
      deletionScheduledAt: existing.deletionScheduledAt ?? new Date(Date.now() + AUTH_DELETION_RECOVERY_WINDOW_MS).toISOString(),
    }
  }
  if (existing.status !== 'active')
    throw createError({ statusCode: 409, statusMessage: 'Account is not active.' })

  const nowMs = Date.now()
  const requestedAt = new Date(nowMs).toISOString()
  const scheduledAt = new Date(nowMs + AUTH_DELETION_RECOVERY_WINDOW_MS).toISOString()
  const guardUserFirst = buildPendingDeletionGuardSql('?1', '?2')
  const guardTimeFirst = buildPendingDeletionGuardSql('?2', '?1')

  const statements: D1PreparedStatement[] = [
    db.prepare(`
      UPDATE auth_users
      SET status = 'deletion_pending',
          disabled_at = NULL,
          deletion_requested_at = ?1,
          deletion_scheduled_at = ?2,
          deletion_cancelled_at = NULL,
          deletion_terms_version = ?3
      WHERE id = ?4 AND status = 'active'
    `).bind(requestedAt, scheduledAt, ACCOUNT_DELETION_TERMS_VERSION, input.userId),
    db.prepare(`
      DELETE FROM auth_login_tokens
      WHERE user_id = ?1 AND ${guardUserFirst}
    `).bind(input.userId, requestedAt),
    db.prepare(`
      DELETE FROM auth_webauthn_challenges
      WHERE user_id = ?1 AND ${guardUserFirst}
    `).bind(input.userId, requestedAt),
    db.prepare(`
      DELETE FROM auth_device_auth_requests
      WHERE user_id = ?1 AND ${guardUserFirst}
    `).bind(input.userId, requestedAt),
    db.prepare(`
      UPDATE auth_devices
      SET revoked_at = ?1,
          token_version = token_version + 1
      WHERE user_id = ?2
        AND revoked_at IS NULL
        AND ${guardTimeFirst}
    `).bind(requestedAt, input.userId),
    db.prepare(`
      DELETE FROM user_api_keys
      WHERE user_id = ?1 AND ${guardUserFirst}
    `).bind(input.userId, requestedAt),
  ]

  const results = await db.batch(statements)
  const changed = Number(results[0]?.meta?.changes ?? 0)
  if (changed <= 0) {
    const refreshed = await getUserById(event, input.userId)
    if (refreshed?.status === 'deletion_pending') {
      return {
        ok: true,
        status: 'deletion_pending',
        deletionRequestedAt: refreshed.deletionRequestedAt ?? requestedAt,
        deletionScheduledAt: refreshed.deletionScheduledAt ?? scheduledAt,
      }
    }
    throw createError({ statusCode: 409, statusMessage: 'Account state changed; deletion could not be completed.' })
  }

  return {
    ok: true,
    status: 'deletion_pending',
    deletionRequestedAt: requestedAt,
    deletionScheduledAt: scheduledAt,
  }
}
