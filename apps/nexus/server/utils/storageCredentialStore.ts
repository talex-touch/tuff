import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCloudflareBindings } from './cloudflare'

const CREDENTIALS_TABLE = 'storage_secure_store'
const AUTH_REF_PATTERN = /^secure:\/\/storage\/[a-z0-9][a-z0-9._-]{0,79}$/i
const AES_256_KEY_BYTES = 32
const AES_GCM_NONCE_BYTES = 12
const AES_GCM_TAG_BYTES = 16
const DEV_FALLBACK_SECRET = 'tuff-nexus-storage-dev-secure-store-key'

const initializedSchemas = new WeakSet<D1Database>()

export type StorageCredentialType = 'access_key'

export interface StorageAccessKeyCredential {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

export type StorageCredentialPayload = StorageAccessKeyCredential

export interface StoreStorageCredentialInput {
  authRef: unknown
  credentialType: unknown
  credentials: unknown
}

export interface StoreStorageCredentialResult {
  success: true
  authRef: string
  credentialType: StorageCredentialType
  backend: 'd1-encrypted'
  degraded: boolean
}

export interface StorageCredentialRecord {
  authRef: string
  credentialType: StorageCredentialType
  backend: 'd1-encrypted'
  hasCredential: true
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface StorageCredentialEnvelope {
  v: 1
  backend: 'd1-encrypted'
  alg: 'A256GCM'
  kid: string
  n: string
  c: string
  t: string
}

interface StorageCredentialRow {
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
  if (!db)
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  return db
}

async function ensureStorageCredentialSchema(db: D1Database) {
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

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_storage_secure_store_type ON ${CREDENTIALS_TABLE}(credential_type);`).run()
  initializedSchemas.add(db)
}

function normalizeAuthRef(value: unknown): string {
  if (typeof value !== 'string' || !AUTH_REF_PATTERN.test(value.trim())) {
    throw createError({
      statusCode: 400,
      statusMessage: 'authRef must match secure://storage/<slug>.',
    })
  }
  return value.trim()
}

function assertNonEmptyString(value: unknown, field: string, maxLength = 4096): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength)
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  return value.trim()
}

function optionalString(value: unknown, field: string, maxLength = 4096): string | undefined {
  if (value == null)
    return undefined
  if (typeof value !== 'string' || value.trim().length > maxLength)
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeCredentialType(value: unknown): StorageCredentialType {
  if (value === 'access_key')
    return value
  throw createError({ statusCode: 400, statusMessage: 'credentialType is invalid.' })
}

function normalizeCredentialPayload(
  credentialType: StorageCredentialType,
  value: unknown,
): StorageCredentialPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw createError({ statusCode: 400, statusMessage: 'credentials must be a JSON object.' })

  const credentials = value as Record<string, unknown>
  if (credentialType === 'access_key') {
    return {
      accessKeyId: assertNonEmptyString(credentials.accessKeyId, 'credentials.accessKeyId', 512),
      secretAccessKey: assertNonEmptyString(credentials.secretAccessKey, 'credentials.secretAccessKey', 4096),
      sessionToken: optionalString(credentials.sessionToken, 'credentials.sessionToken', 4096),
    }
  }

  throw createError({ statusCode: 400, statusMessage: 'credentialType is invalid.' })
}

function resolveConfiguredMasterKey(event: H3Event): string {
  const bindings = readCloudflareBindings(event)
  const runtimeConfig = useRuntimeConfig(event) as {
    storageCredentials?: {
      secureStoreKey?: string
    }
  }

  const candidates = [
    bindings?.STORAGE_SECURE_STORE_KEY,
    runtimeConfig.storageCredentials?.secureStoreKey,
    process.env.STORAGE_SECURE_STORE_KEY,
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
      statusMessage: 'Storage secure store key is not configured.',
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
  const salt = createHash('sha256').update(`tuff-storage-secure-store:${authRef}`).digest()
  const info = Buffer.from('storage-secure-store:v1', 'utf-8')
  return Buffer.from(hkdfSync('sha256', masterSecret, salt, info, AES_256_KEY_BYTES))
}

function getKeyId(masterSecret: Buffer, authRef: string): string {
  return createHash('sha256')
    .update('storage-secure-store-kid:v1')
    .update(masterSecret)
    .update(authRef)
    .digest('hex')
    .slice(0, 32)
}

function encryptCredential(authRef: string, payload: StorageCredentialPayload, masterKey: ResolvedMasterKey): string {
  const key = deriveValueKey(masterKey.secret, authRef)
  const nonce = randomBytes(AES_GCM_NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, nonce, {
    authTagLength: AES_GCM_TAG_BYTES,
  })
  const value = JSON.stringify(payload)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf-8'), cipher.final()])
  const envelope: StorageCredentialEnvelope = {
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

function parseEnvelope(raw: string): StorageCredentialEnvelope {
  const parsed = JSON.parse(raw) as Partial<StorageCredentialEnvelope>
  if (
    parsed?.v !== 1
    || parsed.backend !== 'd1-encrypted'
    || parsed.alg !== 'A256GCM'
    || typeof parsed.kid !== 'string'
    || typeof parsed.n !== 'string'
    || typeof parsed.c !== 'string'
    || typeof parsed.t !== 'string'
  ) {
    throw new Error('STORAGE_CREDENTIAL_ENVELOPE_INVALID')
  }
  return parsed as StorageCredentialEnvelope
}

function decryptCredential(
  authRef: string,
  encryptedValue: string,
  masterKey: ResolvedMasterKey,
): StorageCredentialPayload {
  const envelope = parseEnvelope(encryptedValue)
  const expectedKid = getKeyId(masterKey.secret, authRef)
  if (envelope.kid !== expectedKid)
    throw new Error('STORAGE_CREDENTIAL_KEY_ID_MISMATCH')

  const nonce = fromBase64(envelope.n)
  const tag = fromBase64(envelope.t)
  if (nonce.byteLength !== AES_GCM_NONCE_BYTES || tag.byteLength !== AES_GCM_TAG_BYTES)
    throw new Error('STORAGE_CREDENTIAL_ENVELOPE_INVALID')

  const key = deriveValueKey(masterKey.secret, authRef)
  const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
    authTagLength: AES_GCM_TAG_BYTES,
  })
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(fromBase64(envelope.c)), decipher.final()]).toString('utf-8')
  const parsed = JSON.parse(decrypted) as StorageCredentialPayload
  if (!parsed || typeof parsed !== 'object')
    throw new Error('STORAGE_CREDENTIAL_PAYLOAD_INVALID')
  return parsed
}

function mapCredentialRow(row: StorageCredentialRow): StorageCredentialRecord {
  return {
    authRef: row.auth_ref,
    credentialType: row.credential_type as StorageCredentialType,
    backend: 'd1-encrypted',
    hasCredential: true,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function normalizeStorageAuthRef(value: unknown): string {
  return normalizeAuthRef(value)
}

export async function storeStorageCredential(
  event: H3Event,
  input: StoreStorageCredentialInput,
  createdBy: string,
): Promise<StoreStorageCredentialResult> {
  const db = getD1Database(event)
  await ensureStorageCredentialSchema(db)

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

export async function getStorageCredential(
  event: H3Event,
  authRef: string,
): Promise<StorageCredentialPayload | null> {
  const db = getD1Database(event)
  await ensureStorageCredentialSchema(db)

  const normalizedAuthRef = normalizeAuthRef(authRef)
  const row = await db.prepare(`
    SELECT auth_ref, credential_type, encrypted_value, created_by, created_at, updated_at
    FROM ${CREDENTIALS_TABLE}
    WHERE auth_ref = ?1;
  `).bind(normalizedAuthRef).first<StorageCredentialRow>()

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

export async function storageCredentialExists(
  event: H3Event,
  authRef: string,
): Promise<boolean | null> {
  const db = getOptionalD1Database(event)
  if (!db)
    return null

  await ensureStorageCredentialSchema(db)
  const normalizedAuthRef = normalizeAuthRef(authRef)
  const row = await db.prepare(`
    SELECT auth_ref
    FROM ${CREDENTIALS_TABLE}
    WHERE auth_ref = ?1;
  `).bind(normalizedAuthRef).first<{ auth_ref: string }>()

  return Boolean(row?.auth_ref)
}

export async function listStorageCredentials(event: H3Event): Promise<StorageCredentialRecord[]> {
  const db = getD1Database(event)
  await ensureStorageCredentialSchema(db)

  const { results } = await db.prepare(`
    SELECT auth_ref, credential_type, encrypted_value, created_by, created_at, updated_at
    FROM ${CREDENTIALS_TABLE}
    ORDER BY updated_at DESC;
  `).all<StorageCredentialRow>()

  return (results ?? []).map(mapCredentialRow)
}

export async function deleteStorageCredential(event: H3Event, authRef: string): Promise<boolean> {
  const db = getD1Database(event)
  await ensureStorageCredentialSchema(db)

  const normalizedAuthRef = normalizeAuthRef(authRef)
  const result = await db.prepare(`
    DELETE FROM ${CREDENTIALS_TABLE}
    WHERE auth_ref = ?1;
  `).bind(normalizedAuthRef).run()

  return (result.meta?.changes ?? 0) > 0
}
