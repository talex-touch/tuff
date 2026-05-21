import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCloudflareBindings } from './cloudflare'

const CREDENTIALS_TABLE = 'notification_secure_store'
const AUTH_REF_PATTERN = /^secure:\/\/notifications\/[a-z0-9][a-z0-9._-]{0,79}$/i
const AES_256_KEY_BYTES = 32
const AES_GCM_NONCE_BYTES = 12
const AES_GCM_TAG_BYTES = 16
const DEV_FALLBACK_SECRET = 'tuff-nexus-notification-dev-secure-store-key'

const initializedSchemas = new WeakSet<D1Database>()

export type NotificationCredentialType = 'api_key' | 'smtp' | 'webhook' | 'bot_token'

export interface NotificationApiKeyCredential {
  apiKey: string
}

export interface NotificationSmtpCredential {
  host: string
  port?: number
  username?: string
  password: string
  secure?: boolean
  from?: string
}

export interface NotificationWebhookCredential {
  url: string
  signingSecret?: string
}

export interface NotificationBotTokenCredential {
  token: string
}

export type NotificationCredentialPayload =
  | NotificationApiKeyCredential
  | NotificationSmtpCredential
  | NotificationWebhookCredential
  | NotificationBotTokenCredential

export interface StoreNotificationCredentialInput {
  authRef: unknown
  credentialType: unknown
  credentials: unknown
}

export interface StoreNotificationCredentialResult {
  success: true
  authRef: string
  credentialType: NotificationCredentialType
  backend: 'd1-encrypted'
  degraded: boolean
}

export interface NotificationCredentialRecord {
  authRef: string
  credentialType: NotificationCredentialType
  backend: 'd1-encrypted'
  hasCredential: true
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface NotificationCredentialEnvelope {
  v: 1
  backend: 'd1-encrypted'
  alg: 'A256GCM'
  kid: string
  n: string
  c: string
  t: string
}

interface NotificationCredentialRow {
  auth_ref: string
  credential_type: string
  encrypted_value: string
  created_by: string
  created_at: string
  updated_at: string
}

interface ResolvedMasterKey {
  secret: Buffer
  degraded: boolean
}

function getOptionalD1Database(event: H3Event): D1Database | null {
  return readCloudflareBindings(event)?.DB ?? null
}

function getD1Database(event: H3Event): D1Database {
  const db = getOptionalD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }
  return db
}

async function ensureNotificationCredentialSchema(db: D1Database) {
  if (initializedSchemas.has(db))
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${CREDENTIALS_TABLE} (
      auth_ref TEXT PRIMARY KEY,
      credential_type TEXT NOT NULL,
      encrypted_value TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_notification_secure_store_type ON ${CREDENTIALS_TABLE}(credential_type);`).run()
  initializedSchemas.add(db)
}

function normalizeAuthRef(value: unknown): string {
  if (typeof value !== 'string' || !AUTH_REF_PATTERN.test(value.trim())) {
    throw createError({
      statusCode: 400,
      statusMessage: 'authRef must match secure://notifications/<slug>.',
    })
  }
  return value.trim()
}

function assertNonEmptyString(value: unknown, field: string, maxLength = 4096): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  }
  return value.trim()
}

function normalizeCredentialType(value: unknown): NotificationCredentialType {
  if (value === 'api_key' || value === 'smtp' || value === 'webhook' || value === 'bot_token')
    return value
  throw createError({ statusCode: 400, statusMessage: 'credentialType is invalid.' })
}

function optionalString(value: unknown, field: string, maxLength = 512): string | undefined {
  if (value == null)
    return undefined
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  }
  const trimmed = value.trim()
  return trimmed || undefined
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value == null)
    return undefined
  if (typeof value !== 'boolean')
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  return value
}

function optionalPort(value: unknown): number | undefined {
  if (value == null)
    return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535)
    throw createError({ statusCode: 400, statusMessage: 'credentials.port is invalid.' })
  return value
}

function normalizeCredentialPayload(
  credentialType: NotificationCredentialType,
  value: unknown,
): NotificationCredentialPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'credentials must be a JSON object.' })
  }

  const credentials = value as Record<string, unknown>
  if (credentialType === 'api_key') {
    return {
      apiKey: assertNonEmptyString(credentials.apiKey, 'credentials.apiKey', 4096),
    }
  }

  if (credentialType === 'smtp') {
    return {
      host: assertNonEmptyString(credentials.host, 'credentials.host', 255),
      port: optionalPort(credentials.port),
      username: optionalString(credentials.username, 'credentials.username', 255),
      password: assertNonEmptyString(credentials.password, 'credentials.password', 4096),
      secure: optionalBoolean(credentials.secure, 'credentials.secure'),
      from: optionalString(credentials.from, 'credentials.from', 255),
    }
  }

  if (credentialType === 'webhook') {
    return {
      url: assertNonEmptyString(credentials.url, 'credentials.url', 2048),
      signingSecret: optionalString(credentials.signingSecret, 'credentials.signingSecret', 4096),
    }
  }

  return {
    token: assertNonEmptyString(credentials.token, 'credentials.token', 4096),
  }
}

function resolveConfiguredMasterKey(event: H3Event): string {
  const bindings = readCloudflareBindings(event)
  const runtimeConfig = useRuntimeConfig(event) as {
    notificationCredentials?: {
      secureStoreKey?: string
    }
  }

  const candidates = [
    bindings?.NOTIFICATION_SECURE_STORE_KEY,
    runtimeConfig.notificationCredentials?.secureStoreKey,
    process.env.NOTIFICATION_SECURE_STORE_KEY,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0)
      return candidate.trim()
  }

  return ''
}

function resolveMasterKey(event: H3Event): ResolvedMasterKey {
  const configured = resolveConfiguredMasterKey(event)
  if (configured) {
    return {
      secret: createHash('sha256').update(configured).digest(),
      degraded: false,
    }
  }

  if (process.env.NODE_ENV === 'production') {
    throw createError({
      statusCode: 500,
      statusMessage: 'Notification secure store key is not configured.',
    })
  }

  return {
    secret: createHash('sha256').update(DEV_FALLBACK_SECRET).digest(),
    degraded: true,
  }
}

function toBase64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64')
}

function fromBase64(value: string): Buffer {
  return Buffer.from(value, 'base64')
}

function deriveValueKey(masterSecret: Buffer, authRef: string): Buffer {
  const salt = createHash('sha256').update(`tuff-notification-secure-store:${authRef}`).digest()
  const info = Buffer.from('notification-secure-store:v1', 'utf-8')
  return Buffer.from(hkdfSync('sha256', masterSecret, salt, info, AES_256_KEY_BYTES))
}

function getKeyId(masterSecret: Buffer, authRef: string): string {
  return createHash('sha256')
    .update('notification-secure-store-kid:v1')
    .update(masterSecret)
    .update(authRef)
    .digest('hex')
    .slice(0, 32)
}

function encryptCredential(authRef: string, payload: NotificationCredentialPayload, masterKey: ResolvedMasterKey): string {
  const key = deriveValueKey(masterKey.secret, authRef)
  const nonce = randomBytes(AES_GCM_NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, nonce, {
    authTagLength: AES_GCM_TAG_BYTES,
  })
  const value = JSON.stringify(payload)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf-8'), cipher.final()])
  const envelope: NotificationCredentialEnvelope = {
    v: 1,
    backend: 'd1-encrypted',
    alg: 'A256GCM',
    kid: getKeyId(masterKey.secret, authRef),
    n: toBase64(nonce),
    c: toBase64(ciphertext),
    t: toBase64(cipher.getAuthTag()),
  }
  return JSON.stringify(envelope)
}

function parseEnvelope(raw: string): NotificationCredentialEnvelope {
  const parsed = JSON.parse(raw) as Partial<NotificationCredentialEnvelope>
  if (
    parsed?.v !== 1 ||
    parsed.backend !== 'd1-encrypted' ||
    parsed.alg !== 'A256GCM' ||
    typeof parsed.kid !== 'string' ||
    typeof parsed.n !== 'string' ||
    typeof parsed.c !== 'string' ||
    typeof parsed.t !== 'string'
  ) {
    throw new Error('NOTIFICATION_CREDENTIAL_ENVELOPE_INVALID')
  }
  return parsed as NotificationCredentialEnvelope
}

function decryptCredential(
  authRef: string,
  encryptedValue: string,
  masterKey: ResolvedMasterKey,
): NotificationCredentialPayload {
  const envelope = parseEnvelope(encryptedValue)
  const expectedKid = getKeyId(masterKey.secret, authRef)
  if (envelope.kid !== expectedKid)
    throw new Error('NOTIFICATION_CREDENTIAL_KEY_ID_MISMATCH')

  const nonce = fromBase64(envelope.n)
  const tag = fromBase64(envelope.t)
  if (nonce.byteLength !== AES_GCM_NONCE_BYTES || tag.byteLength !== AES_GCM_TAG_BYTES)
    throw new Error('NOTIFICATION_CREDENTIAL_ENVELOPE_INVALID')

  const key = deriveValueKey(masterKey.secret, authRef)
  const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
    authTagLength: AES_GCM_TAG_BYTES,
  })
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(fromBase64(envelope.c)), decipher.final()]).toString('utf-8')
  const parsed = JSON.parse(decrypted) as NotificationCredentialPayload
  if (!parsed || typeof parsed !== 'object')
    throw new Error('NOTIFICATION_CREDENTIAL_PAYLOAD_INVALID')
  return parsed
}

function mapCredentialRow(row: NotificationCredentialRow): NotificationCredentialRecord {
  return {
    authRef: row.auth_ref,
    credentialType: row.credential_type as NotificationCredentialType,
    backend: 'd1-encrypted',
    hasCredential: true,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function normalizeNotificationAuthRef(value: unknown): string {
  return normalizeAuthRef(value)
}

export async function storeNotificationCredential(
  event: H3Event,
  input: StoreNotificationCredentialInput,
  createdBy: string,
): Promise<StoreNotificationCredentialResult> {
  const db = getD1Database(event)
  await ensureNotificationCredentialSchema(db)

  const authRef = normalizeAuthRef(input.authRef)
  const credentialType = normalizeCredentialType(input.credentialType)
  const credentials = normalizeCredentialPayload(credentialType, input.credentials)
  const masterKey = resolveMasterKey(event)
  const encryptedValue = encryptCredential(authRef, credentials, masterKey)
  const safeCreatedBy = assertNonEmptyString(createdBy, 'createdBy', 120)
  const now = new Date().toISOString()

  await db.prepare(`
    INSERT INTO ${CREDENTIALS_TABLE} (auth_ref, credential_type, encrypted_value, created_by, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(auth_ref) DO UPDATE SET
      credential_type = excluded.credential_type,
      encrypted_value = excluded.encrypted_value,
      created_by = excluded.created_by,
      updated_at = excluded.updated_at;
  `).bind(
    authRef,
    credentialType,
    encryptedValue,
    safeCreatedBy,
    now,
    now,
  ).run()

  return {
    success: true,
    authRef,
    credentialType,
    backend: 'd1-encrypted',
    degraded: masterKey.degraded,
  }
}

export async function getNotificationCredential(
  event: H3Event,
  authRef: string,
): Promise<NotificationCredentialPayload | null> {
  const db = getD1Database(event)
  await ensureNotificationCredentialSchema(db)

  const normalizedAuthRef = normalizeAuthRef(authRef)
  const row = await db.prepare(`
    SELECT auth_ref, credential_type, encrypted_value, created_by, created_at, updated_at
    FROM ${CREDENTIALS_TABLE}
    WHERE auth_ref = ?1;
  `).bind(normalizedAuthRef).first<NotificationCredentialRow>()

  if (!row?.encrypted_value)
    return null

  const masterKey = resolveMasterKey(event)
  try {
    return decryptCredential(normalizedAuthRef, row.encrypted_value, masterKey)
  }
  catch {
    return null
  }
}

export async function notificationCredentialExists(
  event: H3Event,
  authRef: string,
): Promise<boolean | null> {
  const db = getOptionalD1Database(event)
  if (!db)
    return null

  await ensureNotificationCredentialSchema(db)
  const normalizedAuthRef = normalizeAuthRef(authRef)
  const row = await db.prepare(`
    SELECT auth_ref
    FROM ${CREDENTIALS_TABLE}
    WHERE auth_ref = ?1;
  `).bind(normalizedAuthRef).first<{ auth_ref: string }>()

  return Boolean(row?.auth_ref)
}

export async function listNotificationCredentials(event: H3Event): Promise<NotificationCredentialRecord[]> {
  const db = getD1Database(event)
  await ensureNotificationCredentialSchema(db)

  const { results } = await db.prepare(`
    SELECT auth_ref, credential_type, encrypted_value, created_by, created_at, updated_at
    FROM ${CREDENTIALS_TABLE}
    ORDER BY updated_at DESC;
  `).all<NotificationCredentialRow>()

  return (results ?? []).map(mapCredentialRow)
}

export async function deleteNotificationCredential(event: H3Event, authRef: string): Promise<boolean> {
  const db = getD1Database(event)
  await ensureNotificationCredentialSchema(db)

  const normalizedAuthRef = normalizeAuthRef(authRef)
  const result = await db.prepare(`
    DELETE FROM ${CREDENTIALS_TABLE}
    WHERE auth_ref = ?1;
  `).bind(normalizedAuthRef).run()

  return (result.meta?.changes ?? 0) > 0
}
