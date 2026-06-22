import type { D1Database, R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import crypto from 'uncrypto'
import { createError } from 'h3'
import {
  clearUserAuthEphemeralTokens,
  getUserById,
  listDevices,
  listLoginHistory,
  listPasskeys,
  listUserLinkedAccounts,
  requestUserDeletion,
  revokeAllDevicesForUser,
} from './authStore'
import { deleteApiKeysForUser, listApiKeys } from './apiKeyStore'
import { readCloudflareBindings } from './cloudflare'
import { listCreditLedger, listUserTeams } from './creditsStore'
import {
  getStorageObject,
  putStorageObject,
  type StorageObjectMemory,
} from './storageObjectStore'

const EXPORT_JOBS_TABLE = 'privacy_export_jobs'
const DELETION_TERMS_TABLE = 'account_deletion_terms_sessions'
const EXPORT_RESULT_PREFIX = 'privacy-exports'
const EXPORT_TTL_MS = 24 * 60 * 60 * 1000
const TERMS_SESSION_TTL_MS = 10 * 60 * 1000
export const ACCOUNT_DELETION_CONFIRM_PHRASE = 'DELETE_MY_DATA'
export const ACCOUNT_DELETION_TERMS_VERSION = '2026-06-22'
export const ACCOUNT_DELETION_TERMS_MIN_READ_SECONDS = 30
const PRIVATE_EXPORT_FIELD_PATTERN = /(secret|token|hash|password|credential)/i

const memoryStorage: StorageObjectMemory = new Map()
let privacyDataSchemaInitialized = false

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
  const bindings = readCloudflareBindings(event)
  return bindings?.ASSETS ?? bindings?.R2 ?? null
}

async function ensurePrivacyDataSchema(db: D1Database) {
  if (privacyDataSchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${EXPORT_JOBS_TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      result_key TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_privacy_export_jobs_user
    ON ${EXPORT_JOBS_TABLE}(user_id, created_at DESC);
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DELETION_TERMS_TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      terms_version TEXT NOT NULL,
      started_at TEXT NOT NULL,
      earliest_confirm_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_account_deletion_terms_user
    ON ${DELETION_TERMS_TABLE}(user_id, started_at DESC);
  `).run()

  privacyDataSchemaInitialized = true
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

async function buildUserPrivacyExport(event: H3Event, userId: string) {
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
  ] = await Promise.all([
    listDevices(event, userId),
    listLoginHistory(event, userId),
    listPasskeys(event, userId),
    listApiKeys(event, userId),
    listUserLinkedAccounts(event, userId),
    listUserTeams(event, userId),
    listCreditLedger(event, userId),
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
    devices,
    loginHistory: sanitizeLoginHistory(loginHistory),
    passkeys: sanitizePasskeys(passkeys as any[]),
    apiKeys,
    linkedAccounts,
    teams,
    creditLedger,
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

export async function submitAccountDeletion(event: H3Event, userId: string, sessionId: string, confirm: string) {
  if (confirm !== ACCOUNT_DELETION_CONFIRM_PHRASE) {
    throw createError({ statusCode: 400, statusMessage: 'Confirmation phrase does not match.' })
  }

  const db = getD1Database(event)
  await ensurePrivacyDataSchema(db)
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

  const consumed = await db.prepare(`
    UPDATE ${DELETION_TERMS_TABLE}
    SET consumed_at = ?
    WHERE id = ? AND user_id = ? AND consumed_at IS NULL
  `).bind(nowIso(), sessionId, userId).run()
  if (Number(consumed.meta?.changes ?? 0) <= 0)
    throw createError({ statusCode: 409, statusMessage: 'Terms session has already been used.' })

  const user = await requestUserDeletion(event, userId, session.termsVersion)
  await clearUserAuthEphemeralTokens(event, userId)
  const revokedDevices = await revokeAllDevicesForUser(event, userId)
  const deletedApiKeys = await deleteApiKeysForUser(event, userId)

  return {
    success: true,
    user,
    revokedDevices,
    deletedApiKeys,
  }
}
