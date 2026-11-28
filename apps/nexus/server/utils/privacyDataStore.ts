import type { D1Database, D1PreparedStatement, R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import crypto from 'uncrypto'
import { createError } from 'h3'
import {
  AUTH_DELETION_RECOVERY_WINDOW_MS,
  ensureAuthSchema,
  getUserById,
  listDevices,
  listLoginHistory,
  listPasskeys,
  listUserLinkedAccounts,
} from './authStore'
import { ensureApiKeySchema, listApiKeys } from './apiKeyStore'
import { readCloudflareBindings, resolveObjectBucket } from './cloudflare'
import { listCreditLedger, listUserTeams } from './creditsStore'
import {
  deleteStorageObject,
  getStorageObject,
  listStorageObjectKeys,
  putStorageObject,
  type StorageObjectMemory,
} from './storageObjectStore'
import { defineD1Schema, ensureD1Schema } from './d1Schema'

const EXPORT_JOBS_TABLE = 'privacy_export_jobs'
const DELETION_TERMS_TABLE = 'account_deletion_terms_sessions'
const DELETION_AUDITS_TABLE = 'privacy_deletion_audits'
const EXPORT_RESULT_PREFIX = 'privacy-exports'
const EXPORT_TTL_MS = 24 * 60 * 60 * 1000
const TERMS_SESSION_TTL_MS = 10 * 60 * 1000
export const ACCOUNT_DELETION_CONFIRM_PHRASE = 'DELETE_MY_DATA'
export const ACCOUNT_DELETION_TERMS_VERSION = '2026-06-22'
export const ACCOUNT_DELETION_TERMS_MIN_READ_SECONDS = 30
const PRIVATE_EXPORT_FIELD_PATTERN = /(secret|token|hash|password|credential)/i

const FINALIZATION_DELETE_TABLES = [
  'auth_accounts',
  'auth_passkeys',
  'auth_devices',
  'auth_login_history',
  'auth_login_tokens',
  'auth_webauthn_challenges',
  'auth_device_auth_requests',
  'auth_oauth_codes',
  'user_api_keys',
  'account_deletion_terms_sessions',
  'privacy_export_jobs',
  'browser_push_subscriptions',
  'browser_notification_inbox',
  'telemetry_events',
  'intelligence_audits',
  'asr_transcription_requests',
  'sync_items_v1',
  'sync_oplog_v1',
  'sync_blobs_v1',
  'sync_keyrings_v1',
  'sync_quotas_v1',
  'sync_blob_chunks_v1',
  'sync_blob_chunk_refs_v1',
  'sync_blob_upload_sessions_v1',
  'sync_blob_upload_refs_v1',
  'sync_sessions_v1',
] as const

const memoryStorage: StorageObjectMemory = new Map()
export type PrivacyExportJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'expired'

export interface PrivacyExportJob {
  id: string
  userId: string
  status: PrivacyExportJobStatus
  resultKey: string | null
  error: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string
}

export interface AccountDeletionTermsSession {
  id: string
  userId: string
  termsVersion: string
  startedAt: string
  earliestConfirmAt: string
  expiresAt: string
  consumedAt: string | null
}

function getD1Database(event: H3Event): D1Database {
  const db = readCloudflareBindings(event)?.DB
  if (!db)
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  return db
}

function getExportBucket(event: H3Event): R2Bucket | null {
  return resolveObjectBucket(event)
}

const PRIVACY_DATA_SCHEMA = defineD1Schema('privacy-data', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${EXPORT_JOBS_TABLE} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        result_key TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )`,
    `CREATE INDEX IF NOT EXISTS idx_privacy_export_jobs_user
      ON ${EXPORT_JOBS_TABLE}(user_id, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS ${DELETION_TERMS_TABLE} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        terms_version TEXT NOT NULL,
        started_at TEXT NOT NULL,
        earliest_confirm_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT
      )`,
    `CREATE INDEX IF NOT EXISTS idx_account_deletion_terms_user
      ON ${DELETION_TERMS_TABLE}(user_id, started_at DESC)`,
    `CREATE TABLE IF NOT EXISTS ${DELETION_AUDITS_TABLE} (
        user_id TEXT PRIMARY KEY,
        user_id_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_at TEXT,
        scheduled_at TEXT,
        finalized_at TEXT NOT NULL,
        summary_json TEXT NOT NULL
      )`,
    `CREATE INDEX IF NOT EXISTS idx_privacy_deletion_audits_finalized
      ON ${DELETION_AUDITS_TABLE}(finalized_at DESC)`,
  ],
})

async function ensurePrivacyDataSchema(db: D1Database) {
  await ensureD1Schema(db, PRIVACY_DATA_SCHEMA)
}

function mapExportJob(row: Record<string, any> | null | undefined): PrivacyExportJob | null {
  if (!row)
    return null
  return {
    id: row.id,
    userId: row.user_id,
    status: normalizeExportStatus(row.status),
    resultKey: row.result_key ?? null,
    error: row.error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  }
}

function mapTermsSession(row: Record<string, any> | null | undefined): AccountDeletionTermsSession | null {
  if (!row)
    return null
  return {
    id: row.id,
    userId: row.user_id,
    termsVersion: row.terms_version,
    startedAt: row.started_at,
    earliestConfirmAt: row.earliest_confirm_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at ?? null,
  }
}

function normalizeExportStatus(value: unknown): PrivacyExportJobStatus {
  if (value === 'queued' || value === 'running' || value === 'succeeded' || value === 'failed' || value === 'expired')
    return value
  return 'failed'
}

function nowIso() {
  return new Date().toISOString()
}

function toJsonBuffer(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value, null, 2), 'utf8')
}

function sanitizePasskeys(rows: any[]) {
  return rows.map(row => ({
    id: row.id,
    transports: safeJsonParse(row.transports, []),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? null,
  }))
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

function sanitizeLoginHistory(rows: Awaited<ReturnType<typeof listLoginHistory>>) {
  return rows.map(row => ({
    id: row.id,
    deviceId: row.device_id,
    ipMasked: row.ip_masked,
    userAgent: row.user_agent,
    success: row.success,
    reason: row.reason,
    clientType: row.client_type,
    createdAt: row.created_at,
    location: {
      countryCode: row.country_code,
      regionCode: row.region_code,
      regionName: row.region_name,
      city: row.city,
      timezone: row.timezone,
      geoSource: row.geo_source,
    },
  }))
}

function redactPrivateExportFields(value: unknown): unknown {
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

function isMissingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /no such table/i.test(message)
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /UNIQUE constraint failed|PRIMARY KEY constraint failed|SQLITE_CONSTRAINT/i.test(message)
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function listExistingTables(db: D1Database, tableNames: readonly string[]): Promise<Set<string>> {
  if (!tableNames.length)
    return new Set()
  const placeholders = tableNames.map((_, index) => `?${index + 1}`).join(', ')
  const { results } = await db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name IN (${placeholders})
  `).bind(...tableNames).all<{ name?: string }>()
  return new Set((results ?? []).map(row => row.name).filter((name): name is string => Boolean(name)))
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
        SELECT id, event_type, platform, version, region, is_anonymous, created_at
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
        region: row.region,
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
      SELECT id, provider_id, capability, status, duration_seconds, billed_seconds, charged_credits, created_at, updated_at
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
      charged_credits: number | null
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
      chargedCredits: row.charged_credits,
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

async function readUserSyncExportSummary(db: D1Database, userId: string) {
  const existing = await listExistingTables(db, ['sync_quotas_v1', 'sync_items_v1', 'sync_blobs_v1', 'sync_sessions_v1'])
  const readCount = async (table: string) => {
    if (!existing.has(table))
      return 0
    const row = await db.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE user_id = ?1`).bind(userId).first<{ total?: number }>()
    return Number(row?.total ?? 0)
  }

  const quotaRow = existing.has('sync_quotas_v1')
    ? await db.prepare(`
        SELECT plan_tier, storage_limit_bytes, used_storage_bytes, object_limit, used_objects, item_limit, device_limit, updated_at
        FROM sync_quotas_v1
        WHERE user_id = ?1
        LIMIT 1
      `).bind(userId).first<Record<string, unknown>>()
    : null

  const [itemCount, blobCount, sessionCount] = await Promise.all([
    readCount('sync_items_v1'),
    readCount('sync_blobs_v1'),
    readCount('sync_sessions_v1'),
  ])

  return {
    quota: quotaRow
      ? {
          planTier: quotaRow.plan_tier ?? null,
          storageLimitBytes: Number(quotaRow.storage_limit_bytes ?? 0),
          usedStorageBytes: Number(quotaRow.used_storage_bytes ?? 0),
          objectLimit: Number(quotaRow.object_limit ?? 0),
          usedObjects: Number(quotaRow.used_objects ?? 0),
          itemLimit: Number(quotaRow.item_limit ?? 0),
          deviceLimit: Number(quotaRow.device_limit ?? 0),
          updatedAt: quotaRow.updated_at ?? null,
        }
      : null,
    itemCount,
    blobCount,
    sessionCount,
  }
}

async function buildUserPrivacyExport(event: H3Event, userId: string) {
  const db = getD1Database(event)
  const user = await getUserById(event, userId)
  if (!user)
    throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const [
    devices,
    loginHistory,
    passkeys,
    apiKeys,
    linkedAccounts,
    teams,
    creditLedger,
    telemetry,
    providerUsage,
    syncSummary,
  ] = await Promise.all([
    listDevices(event, userId),
    listLoginHistory(event, userId),
    listPasskeys(event, userId),
    listApiKeys(event, userId),
    listUserLinkedAccounts(event, userId),
    listUserTeams(event, userId),
    listCreditLedger(event, userId),
    readUserTelemetryExport(db, userId),
    readUserProviderUsageExport(db, userId),
    readUserSyncExportSummary(db, userId),
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
    loginHistory: sanitizeLoginHistory(loginHistory),
    passkeys: sanitizePasskeys(passkeys as any[]),
    apiKeys,
    linkedAccounts,
    teams,
    creditLedger,
    telemetry,
    providerUsage,
    syncSummary,
  })
}

export async function createPrivacyExportJob(event: H3Event, userId: string): Promise<PrivacyExportJob> {
  const db = getD1Database(event)
  await ensurePrivacyDataSchema(db)
  const id = crypto.randomUUID()
  const now = new Date()
  const createdAt = now.toISOString()
  const expiresAt = new Date(now.getTime() + EXPORT_TTL_MS).toISOString()

  await db.prepare(`
    INSERT INTO ${EXPORT_JOBS_TABLE} (id, user_id, status, result_key, error, created_at, updated_at, expires_at)
    VALUES (?, ?, 'queued', NULL, NULL, ?, ?, ?)
  `).bind(id, userId, createdAt, createdAt, expiresAt).run()

  return (await getPrivacyExportJob(event, userId, id))!
}

export async function getPrivacyExportJob(event: H3Event, userId: string, jobId: string): Promise<PrivacyExportJob | null> {
  const db = getD1Database(event)
  await ensurePrivacyDataSchema(db)
  const row = await db.prepare(`
    SELECT *
    FROM ${EXPORT_JOBS_TABLE}
    WHERE id = ? AND user_id = ?
    LIMIT 1
  `).bind(jobId, userId).first<Record<string, any>>()
  return mapExportJob(row)
}

export async function advancePrivacyExportJob(event: H3Event, userId: string, jobId: string): Promise<PrivacyExportJob | null> {
  const db = getD1Database(event)
  await ensurePrivacyDataSchema(db)
  const job = await getPrivacyExportJob(event, userId, jobId)
  if (!job)
    return null
  if (Date.parse(job.expiresAt) <= Date.now() && job.status !== 'expired') {
    const expiredAt = nowIso()
    await db.prepare(`
      UPDATE ${EXPORT_JOBS_TABLE}
      SET status = 'expired', updated_at = ?
      WHERE id = ? AND user_id = ?
    `).bind(expiredAt, jobId, userId).run()
    return getPrivacyExportJob(event, userId, jobId)
  }
  if (job.status !== 'queued')
    return job

  const runningAt = nowIso()
  const claim = await db.prepare(`
    UPDATE ${EXPORT_JOBS_TABLE}
    SET status = 'running', updated_at = ?
    WHERE id = ? AND user_id = ? AND status = 'queued'
  `).bind(runningAt, jobId, userId).run()
  if (Number(claim.meta?.changes ?? 0) <= 0)
    return getPrivacyExportJob(event, userId, jobId)

  try {
    const payload = await buildUserPrivacyExport(event, userId)
    const key = `${EXPORT_RESULT_PREFIX}/${userId}/${jobId}.json`
    await putStorageObject({
      event,
      bucket: getExportBucket(event),
      memoryStorage,
      externalStorage: null,
      key,
      data: toJsonBuffer(payload),
      contentType: 'application/json; charset=utf-8',
      actorId: userId,
      resourceType: 'privacy-export',
      defaultContentType: 'application/json; charset=utf-8',
    })
    const completedAt = nowIso()
    await db.prepare(`
      UPDATE ${EXPORT_JOBS_TABLE}
      SET status = 'succeeded', result_key = ?, error = NULL, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).bind(key, completedAt, jobId, userId).run()
  }
  catch (error) {
    const failedAt = nowIso()
    const message = error instanceof Error ? error.message : 'Export failed'
    await db.prepare(`
      UPDATE ${EXPORT_JOBS_TABLE}
      SET status = 'failed', error = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).bind(message, failedAt, jobId, userId).run()
  }

  return getPrivacyExportJob(event, userId, jobId)
}

export async function getPrivacyExportPayload(event: H3Event, userId: string, jobId: string): Promise<{ data: Buffer, contentType: string, filename: string }> {
  const job = await getPrivacyExportJob(event, userId, jobId)
  if (!job)
    throw createError({ statusCode: 404, statusMessage: 'Export job not found' })
  if (job.status !== 'succeeded' || !job.resultKey)
    throw createError({ statusCode: 409, statusMessage: 'Export job is not ready' })

  const object = await getStorageObject({
    event,
    bucket: getExportBucket(event),
    memoryStorage,
    externalStorage: null,
    key: job.resultKey,
    resourceType: 'privacy-export',
    defaultContentType: 'application/json; charset=utf-8',
  })
  if (!object)
    throw createError({ statusCode: 404, statusMessage: 'Export payload not found' })

  const date = new Date().toISOString().slice(0, 10)
  return {
    data: object.data,
    contentType: object.contentType,
    filename: `tuff-account-data-${date}.json`,
  }
}

export async function createAccountDeletionTermsSession(event: H3Event, userId: string): Promise<AccountDeletionTermsSession> {
  const db = getD1Database(event)
  await ensurePrivacyDataSchema(db)
  const id = crypto.randomUUID()
  const now = Date.now()
  const startedAt = new Date(now).toISOString()
  const earliestConfirmAt = new Date(now + ACCOUNT_DELETION_TERMS_MIN_READ_SECONDS * 1000).toISOString()
  const expiresAt = new Date(now + TERMS_SESSION_TTL_MS).toISOString()

  await db.prepare(`
    INSERT INTO ${DELETION_TERMS_TABLE} (id, user_id, terms_version, started_at, earliest_confirm_at, expires_at, consumed_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `).bind(id, userId, ACCOUNT_DELETION_TERMS_VERSION, startedAt, earliestConfirmAt, expiresAt).run()

  return (await getAccountDeletionTermsSession(event, userId, id))!
}

async function getAccountDeletionTermsSession(event: H3Event, userId: string, sessionId: string): Promise<AccountDeletionTermsSession | null> {
  const db = getD1Database(event)
  await ensurePrivacyDataSchema(db)
  const row = await db.prepare(`
    SELECT *
    FROM ${DELETION_TERMS_TABLE}
    WHERE id = ? AND user_id = ?
    LIMIT 1
  `).bind(sessionId, userId).first<Record<string, any>>()
  return mapTermsSession(row)
}

export interface AccountDeletionFinalizationAudit {
  userId: string
  userIdHash: string
  status: 'finalized'
  requestedAt: string | null
  scheduledAt: string | null
  finalizedAt: string
  summary: {
    financialRecordsPreserved: true
    coveredTables: string[]
  }
}

export interface AccountDeletionFinalizationResult {
  userId: string
  status: 'finalized' | 'already_finalized'
  finalizedAt: string
  audit: AccountDeletionFinalizationAudit
  counts: Record<string, number>
}

export interface ExpiredAccountDeletionBatchResult {
  scanned: number
  finalized: number
  alreadyFinalized: number
  failed: number
  errors: Array<{ userIdHash: string, message: string }>
}

function buildPendingDeletionTransitionGuardSql(userIdParam: string, requestedAtParam: string): string {
  return `EXISTS (
    SELECT 1 FROM auth_users
    WHERE id = ${userIdParam}
      AND status = 'deletion_pending'
      AND deletion_requested_at = ${requestedAtParam}
  )`
}

function buildAtomicAccountDeletionStatements(
  db: D1Database,
  input: {
    userId: string
    termsVersion: string
    requestedAt: string
    scheduledAt: string
    termsSessionId?: string
  },
): D1PreparedStatement[] {
  const transitionGuard = buildPendingDeletionTransitionGuardSql('?2', '?1')
  const transitionGuardReversed = buildPendingDeletionTransitionGuardSql('?1', '?2')

  const userUpdate = input.termsSessionId
    ? db.prepare(`
        UPDATE auth_users
        SET status = 'deletion_pending',
            disabled_at = NULL,
            deletion_requested_at = ?1,
            deletion_scheduled_at = ?2,
            deletion_cancelled_at = NULL,
            deletion_terms_version = ?3
        WHERE id = ?4
          AND status = 'active'
          AND EXISTS (
            SELECT 1 FROM ${DELETION_TERMS_TABLE}
            WHERE id = ?5 AND user_id = ?4 AND consumed_at IS NULL
          )
      `).bind(input.requestedAt, input.scheduledAt, input.termsVersion, input.userId, input.termsSessionId)
    : db.prepare(`
        UPDATE auth_users
        SET status = 'deletion_pending',
            disabled_at = NULL,
            deletion_requested_at = ?1,
            deletion_scheduled_at = ?2,
            deletion_cancelled_at = NULL,
            deletion_terms_version = ?3
        WHERE id = ?4 AND status = 'active'
      `).bind(input.requestedAt, input.scheduledAt, input.termsVersion, input.userId)

  const statements: D1PreparedStatement[] = [userUpdate]

  if (input.termsSessionId) {
    statements.push(db.prepare(`
      UPDATE ${DELETION_TERMS_TABLE}
      SET consumed_at = ?1
      WHERE id = ?3
        AND user_id = ?2
        AND consumed_at IS NULL
        AND ${transitionGuard}
    `).bind(input.requestedAt, input.userId, input.termsSessionId))
  }

  statements.push(
    db.prepare(`
      DELETE FROM auth_login_tokens
      WHERE user_id = ?1 AND ${transitionGuardReversed}
    `).bind(input.userId, input.requestedAt),
    db.prepare(`
      DELETE FROM auth_webauthn_challenges
      WHERE user_id = ?1 AND ${transitionGuardReversed}
    `).bind(input.userId, input.requestedAt),
    db.prepare(`
      DELETE FROM auth_device_auth_requests
      WHERE user_id = ?1 AND ${transitionGuardReversed}
    `).bind(input.userId, input.requestedAt),
    db.prepare(`
      DELETE FROM auth_oauth_codes
      WHERE user_id = ?1 AND consumed_at IS NULL AND ${transitionGuardReversed}
    `).bind(input.userId, input.requestedAt),
    db.prepare(`
      UPDATE auth_devices
      SET revoked_at = ?1,
          token_version = token_version + 1
      WHERE user_id = ?2
        AND revoked_at IS NULL
        AND ${transitionGuard}
    `).bind(input.requestedAt, input.userId),
    db.prepare(`
      DELETE FROM user_api_keys
      WHERE user_id = ?1 AND ${transitionGuardReversed}
    `).bind(input.userId, input.requestedAt),
  )

  return statements
}

export async function submitAccountDeletion(event: H3Event, userId: string, sessionId: string, confirm: string) {
  if (confirm !== ACCOUNT_DELETION_CONFIRM_PHRASE) {
    throw createError({ statusCode: 400, statusMessage: 'Confirmation phrase does not match.' })
  }

  const db = getD1Database(event)
  await Promise.all([
    ensurePrivacyDataSchema(db),
    ensureAuthSchema(db),
    ensureApiKeySchema(db),
  ])
  const session = await getAccountDeletionTermsSession(event, userId, sessionId)
  if (!session)
    throw createError({ statusCode: 404, statusMessage: 'Terms session not found.' })
  if (session.consumedAt)
    throw createError({ statusCode: 409, statusMessage: 'Terms session has already been used.' })
  if (Date.parse(session.expiresAt) <= Date.now())
    throw createError({ statusCode: 410, statusMessage: 'Terms session expired.' })

  const earliestConfirmAtMs = Date.parse(session.earliestConfirmAt)
  if (!Number.isFinite(earliestConfirmAtMs) || earliestConfirmAtMs > Date.now()) {
    const remainingSeconds = Math.max(1, Math.ceil((earliestConfirmAtMs - Date.now()) / 1000))
    throw createError({
      statusCode: 409,
      statusMessage: 'Deletion terms reading time is not complete.',
      data: { remainingSeconds },
    })
  }

  const now = new Date()
  const requestedAt = now.toISOString()
  const scheduledAt = new Date(now.getTime() + AUTH_DELETION_RECOVERY_WINDOW_MS).toISOString()

  // Consume the terms session, transition the user, clear ephemeral auth tokens, revoke all
  // devices, and delete API keys in one atomic D1 batch. Any mid-batch failure rolls back
  // everything so a user never loses credentials without entering deletion_pending, and never
  // enters deletion_pending with live credentials still active.
  const results = await db.batch(buildAtomicAccountDeletionStatements(db, {
    userId,
    termsVersion: session.termsVersion,
    requestedAt,
    scheduledAt,
    termsSessionId: sessionId,
  }))

  const userUpdated = Number((results[0]?.meta as { changes?: number } | undefined)?.changes ?? 0)
  const sessionConsumed = Number((results[1]?.meta as { changes?: number } | undefined)?.changes ?? 0)
  if (userUpdated < 1 || sessionConsumed < 1) {
    const latestSession = await getAccountDeletionTermsSession(event, userId, sessionId)
    if (latestSession?.consumedAt)
      throw createError({ statusCode: 409, statusMessage: 'Terms session has already been used.' })
    throw createError({ statusCode: 409, statusMessage: 'User deletion request could not be started.' })
  }

  const revokedDevices = Number((results[results.length - 2]?.meta as { changes?: number } | undefined)?.changes ?? 0)
  const deletedApiKeys = Number((results[results.length - 1]?.meta as { changes?: number } | undefined)?.changes ?? 0)
  const user = await getUserById(event, userId)

  return {
    success: true,
    user,
    revokedDevices,
    deletedApiKeys,
  }
}

/**
 * Starts the native recoverable deletion lifecycle and revokes credentials that
 * could otherwise keep an account usable while it is pending deletion.
 * Runs in one atomic D1 batch; durable financial records (including credits and
 * billing history) are preserved.
 */
export async function requestAccountDeletionWithCleanup(
  event: H3Event,
  userId: string,
  termsVersion: string,
) {
  const db = getD1Database(event)
  await Promise.all([
    ensurePrivacyDataSchema(db),
    ensureAuthSchema(db),
    ensureApiKeySchema(db),
  ])

  const now = new Date()
  const requestedAt = now.toISOString()
  const scheduledAt = new Date(now.getTime() + AUTH_DELETION_RECOVERY_WINDOW_MS).toISOString()

  const results = await db.batch(buildAtomicAccountDeletionStatements(db, {
    userId,
    termsVersion,
    requestedAt,
    scheduledAt,
  }))

  const userUpdated = Number((results[0]?.meta as { changes?: number } | undefined)?.changes ?? 0)
  const revokedDevices = userUpdated >= 1
    ? Number((results[results.length - 2]?.meta as { changes?: number } | undefined)?.changes ?? 0)
    : 0
  const deletedApiKeys = userUpdated >= 1
    ? Number((results[results.length - 1]?.meta as { changes?: number } | undefined)?.changes ?? 0)
    : 0
  const user = await getUserById(event, userId)

  if (userUpdated < 1 || !user || user.status !== 'deletion_pending') {
    return {
      success: false,
      user,
      revokedDevices: 0,
      deletedApiKeys: 0,
    }
  }

  return {
    success: true,
    user,
    revokedDevices,
    deletedApiKeys,
  }
}

function mapDeletionAudit(row: Record<string, any> | null | undefined): AccountDeletionFinalizationAudit | null {
  if (!row)
    return null
  const parsed = safeJsonParse(row.summary_json, { financialRecordsPreserved: true, coveredTables: [] }) as {
    financialRecordsPreserved?: boolean
    coveredTables?: string[]
  }
  return {
    userId: String(row.user_id),
    userIdHash: String(row.user_id_hash),
    status: 'finalized',
    requestedAt: row.requested_at ?? null,
    scheduledAt: row.scheduled_at ?? null,
    finalizedAt: String(row.finalized_at),
    summary: {
      financialRecordsPreserved: true,
      coveredTables: Array.isArray(parsed.coveredTables) ? parsed.coveredTables.map(String) : [],
    },
  }
}

export async function getAccountDeletionAudit(
  event: H3Event,
  userId: string,
): Promise<AccountDeletionFinalizationAudit | null> {
  const db = getD1Database(event)
  await ensurePrivacyDataSchema(db)
  const row = await db.prepare(`
    SELECT user_id, user_id_hash, status, requested_at, scheduled_at, finalized_at, summary_json
    FROM ${DELETION_AUDITS_TABLE}
    WHERE user_id = ?1
    LIMIT 1
  `).bind(userId).first<Record<string, any>>()
  return mapDeletionAudit(row)
}

/**
 * Atomically and idempotently finalizes an expired `deletion_pending` account once its 30-day
 * recovery window has elapsed.
 *
 * - Anonymizes `auth_users` and transitions status to `disabled`.
 * - Removes user-owned auth credentials, API keys, privacy exports, user-attributed telemetry,
 *   provider usage records (`intelligence_audits`, `asr_transcription_requests`), and sync tables.
 * - Preserves financial accounting records (`credit_ledger` / `credit_balances`).
 * - Records a bounded, redacted audit entry in `privacy_deletion_audits` inside the same D1 batch.
 */
export async function finalizeAccountDeletion(
  event: H3Event,
  userId: string,
  options: { now?: Date } = {},
): Promise<AccountDeletionFinalizationResult> {
  const db = getD1Database(event)
  await Promise.all([
    ensurePrivacyDataSchema(db),
    ensureAuthSchema(db),
    ensureApiKeySchema(db),
  ])

  const existingAudit = await getAccountDeletionAudit(event, userId)
  if (existingAudit) {
    return {
      userId,
      status: 'already_finalized',
      finalizedAt: existingAudit.finalizedAt,
      audit: existingAudit,
      counts: {},
    }
  }

  const nowIsoString = (options.now ?? new Date()).toISOString()
  const user = await getUserById(event, userId)
  if (!user)
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  if (user.status !== 'deletion_pending')
    throw createError({ statusCode: 409, statusMessage: 'User is not pending deletion.' })
  if (!user.deletionScheduledAt || Date.parse(user.deletionScheduledAt) > Date.parse(nowIsoString))
    throw createError({ statusCode: 409, statusMessage: 'Account deletion recovery window has not elapsed.' })

  const existingTables = await listExistingTables(db, [
    ...FINALIZATION_DELETE_TABLES,
    'auth_device_auth_audits',
  ])

  const storageKeysToClean: Array<{ key: string, resourceType: string }> = []
  if (existingTables.has(EXPORT_JOBS_TABLE)) {
    const { results } = await db.prepare(`
      SELECT result_key FROM ${EXPORT_JOBS_TABLE}
      WHERE user_id = ?1 AND result_key IS NOT NULL
    `).bind(userId).all<{ result_key?: string | null }>()
    for (const row of results ?? []) {
      if (row.result_key)
        storageKeysToClean.push({ key: row.result_key, resourceType: 'privacy-export' })
    }
  }
  if (existingTables.has('sync_blobs_v1')) {
    const { results } = await db.prepare(`
      SELECT object_key FROM sync_blobs_v1
      WHERE user_id = ?1 AND object_key IS NOT NULL
    `).bind(userId).all<{ object_key?: string | null }>()
    for (const row of results ?? []) {
      if (row.object_key && !row.object_key.startsWith('chunks:'))
        storageKeysToClean.push({ key: row.object_key, resourceType: 'sync-blob' })
    }
  }
  if (existingTables.has('sync_blob_chunks_v1')) {
    const { results } = await db.prepare(`
      SELECT object_key, sha256 FROM sync_blob_chunks_v1
      WHERE user_id = ?1
    `).bind(userId).all<{ object_key?: string | null, sha256?: string | null }>()
    for (const row of results ?? []) {
      const chunkKey = row.object_key || (row.sha256 ? `${userId}/sync-chunks/${row.sha256}` : null)
      if (chunkKey)
        storageKeysToClean.push({ key: chunkKey, resourceType: 'sync-blob-chunk' })
    }
  }

  const userIdHash = sha256Hex(userId)
  const anonymizedEmail = `deleted+${userIdHash.slice(0, 24)}@deleted.invalid`
  const deleteTables = FINALIZATION_DELETE_TABLES.filter(table => existingTables.has(table))
  const hasDeviceAudits = existingTables.has('auth_device_auth_audits')
  const coveredTables = [
    'auth_users',
    ...deleteTables,
    ...(hasDeviceAudits ? ['auth_device_auth_audits'] : []),
  ]
  const summary = {
    financialRecordsPreserved: true as const,
    coveredTables,
  }
  const auditGuard = `EXISTS (
    SELECT 1 FROM ${DELETION_AUDITS_TABLE}
    WHERE user_id = ?1 AND finalized_at = ?2
  )`

  const statements: D1PreparedStatement[] = [
    db.prepare(`
      UPDATE auth_users
      SET status = 'disabled',
          disabled_at = ?1,
          email = ?2,
          name = NULL,
          image = NULL,
          email_verified = NULL,
          email_state = 'missing',
          locale = NULL,
          privacy_analytics = 0,
          privacy_crash_reports = 0,
          privacy_usage_data = 0,
          privacy_personalization = 0,
          allow_cli_ip_mismatch = 0,
          deletion_cancelled_at = NULL
      WHERE id = ?3
        AND status = 'deletion_pending'
        AND deletion_scheduled_at IS NOT NULL
        AND deletion_scheduled_at <= ?1
    `).bind(nowIsoString, anonymizedEmail, userId),
    db.prepare(`
      INSERT INTO ${DELETION_AUDITS_TABLE} (
        user_id, user_id_hash, status, requested_at, scheduled_at, finalized_at, summary_json
      )
      SELECT id, ?1, 'finalized', deletion_requested_at, deletion_scheduled_at, ?2, ?3
      FROM auth_users
      WHERE id = ?4 AND status = 'disabled' AND disabled_at = ?2
    `).bind(userIdHash, nowIsoString, JSON.stringify(summary), userId),
  ]

  const trackedLabels: string[] = ['auth_users', DELETION_AUDITS_TABLE]
  for (const table of deleteTables) {
    statements.push(db.prepare(`
      DELETE FROM ${table}
      WHERE user_id = ?1 AND ${auditGuard}
    `).bind(userId, nowIsoString))
    trackedLabels.push(table)
  }

  if (hasDeviceAudits) {
    statements.push(db.prepare(`
      UPDATE auth_device_auth_audits
      SET user_id = NULL,
          actor_user_id = CASE WHEN actor_user_id = ?1 THEN NULL ELSE actor_user_id END,
          ip = NULL,
          user_agent = NULL
      WHERE (user_id = ?1 OR actor_user_id = ?1) AND ${auditGuard}
    `).bind(userId, nowIsoString))
    trackedLabels.push('auth_device_auth_audits')
  }

  let batchResults: Awaited<ReturnType<D1Database['batch']>>
  try {
    batchResults = await db.batch(statements)
  }
  catch (error) {
    if (isUniqueConstraintError(error)) {
      const winner = await getAccountDeletionAudit(event, userId)
      if (winner) {
        return {
          userId,
          status: 'already_finalized',
          finalizedAt: winner.finalizedAt,
          audit: winner,
          counts: {},
        }
      }
    }
    throw error
  }

  const userChanged = Number((batchResults[0]?.meta as { changes?: number } | undefined)?.changes ?? 0)
  const auditInserted = Number((batchResults[1]?.meta as { changes?: number } | undefined)?.changes ?? 0)
  if (userChanged < 1 || auditInserted < 1) {
    const winner = await getAccountDeletionAudit(event, userId)
    if (winner) {
      return {
        userId,
        status: 'already_finalized',
        finalizedAt: winner.finalizedAt,
        audit: winner,
        counts: {},
      }
    }
    throw createError({ statusCode: 409, statusMessage: 'Account deletion could not be finalized.' })
  }

  const bucket = getExportBucket(event)
  const deletedKeys = new Set<string>()
  for (const target of storageKeysToClean) {
    if (deletedKeys.has(target.key))
      continue
    deletedKeys.add(target.key)
    await deleteStorageObject({
      event,
      bucket,
      memoryStorage,
      externalStorage: null,
      key: target.key,
      resourceType: target.resourceType,
    }).catch(() => {})
  }

  // Also sweep any orphaned or uncommitted chunk objects under `${userId}/sync-chunks/`.
  const chunkPrefix = `${userId}/sync-chunks/`
  const deleteChunkKey = async (key: string) => {
    if (!key.startsWith(chunkPrefix) || deletedKeys.has(key))
      return
    deletedKeys.add(key)
    await deleteStorageObject({
      event,
      bucket,
      memoryStorage,
      externalStorage: null,
      key,
      resourceType: 'sync-blob-chunk',
    }).catch(() => {})
  }

  if (bucket) {
    let cursor: string | undefined
    for (let page = 0; page < 50; page += 1) {
      const listed = await bucket.list(cursor
        ? { prefix: chunkPrefix, limit: 500, cursor }
        : { prefix: chunkPrefix, limit: 500 },
      ).catch(() => null)
      if (!listed)
        break
      for (const object of listed.objects) {
        await deleteChunkKey(object.key)
      }
      if (!listed.truncated || !('cursor' in listed) || !listed.cursor)
        break
      cursor = listed.cursor
    }
  }
  else {
    const keys = await listStorageObjectKeys(null, memoryStorage, {
      event,
      resourceType: 'sync-blob-chunk',
      prefix: chunkPrefix,
    }).catch(() => [] as string[])
    for (const key of keys) {
      await deleteChunkKey(key)
    }
  }

  const counts: Record<string, number> = {}
  for (let index = 0; index < trackedLabels.length; index += 1) {
    counts[trackedLabels[index]!] = Number((batchResults[index]?.meta as { changes?: number } | undefined)?.changes ?? 0)
  }

  const audit: AccountDeletionFinalizationAudit = {
    userId,
    userIdHash,
    status: 'finalized',
    requestedAt: user.deletionRequestedAt,
    scheduledAt: user.deletionScheduledAt,
    finalizedAt: nowIsoString,
    summary,
  }

  return {
    userId,
    status: 'finalized',
    finalizedAt: nowIsoString,
    audit,
    counts,
  }
}

/**
 * Processes due `deletion_pending` accounts whose 30-day recovery window has expired.
 * Never claims failed users as finalized; surfaces per-user hashed failure entries so the
 * maintenance worker fails closed and retries cleanly.
 */
export async function finalizeExpiredAccountDeletions(
  event: H3Event,
  options: { now?: Date, limit?: number } = {},
): Promise<ExpiredAccountDeletionBatchResult> {
  const db = getD1Database(event)
  await Promise.all([
    ensurePrivacyDataSchema(db),
    ensureAuthSchema(db),
    ensureApiKeySchema(db),
  ])

  const now = options.now ?? new Date()
  const nowIsoString = now.toISOString()
  const limit = Number.isFinite(options.limit) && options.limit && options.limit > 0
    ? Math.min(Math.floor(options.limit), 200)
    : 50

  const { results } = await db.prepare(`
    SELECT id
    FROM auth_users
    WHERE status = 'deletion_pending'
      AND deletion_scheduled_at IS NOT NULL
      AND deletion_scheduled_at <= ?1
    ORDER BY deletion_scheduled_at ASC
    LIMIT ?2
  `).bind(nowIsoString, limit).all<{ id?: string }>()

  const dueUserIds = (results ?? []).map(row => row.id).filter((id): id is string => Boolean(id))
  const summary: ExpiredAccountDeletionBatchResult = {
    scanned: dueUserIds.length,
    finalized: 0,
    alreadyFinalized: 0,
    failed: 0,
    errors: [],
  }

  for (const userId of dueUserIds) {
    try {
      const outcome = await finalizeAccountDeletion(event, userId, { now })
      if (outcome.status === 'finalized')
        summary.finalized += 1
      else
        summary.alreadyFinalized += 1
    }
    catch (error) {
      summary.failed += 1
      summary.errors.push({
        userIdHash: sha256Hex(userId).slice(0, 16),
        message: error instanceof Error ? error.message : 'Account deletion finalization failed.',
      })
    }
  }

  return summary
}
