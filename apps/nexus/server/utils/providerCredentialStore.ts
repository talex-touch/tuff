import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCloudflareBindings } from './cloudflare'

const CREDENTIALS_TABLE = 'provider_secure_store'
const PROVIDER_CREDENTIAL_PURPOSE = 'provider-credential'
const AUTH_REF_PATTERN = /^secure:\/\/providers\/[a-z0-9][a-z0-9._-]{0,79}$/i
const AES_256_KEY_BYTES = 32
const AES_GCM_NONCE_BYTES = 12
const AES_GCM_TAG_BYTES = 16
const DEV_FALLBACK_SECRET = 'tuff-nexus-provider-registry-dev-secure-store-key'

const initializedSchemas = new WeakSet<D1Database>()

type ProviderCredentialAuthType = 'api_key' | 'secret_pair' | 'oauth' | 'none'

interface ProviderCredentialEnvelope {
  v: 1
  backend: 'd1-encrypted'
  alg: 'A256GCM'
  kid: string
  n: string
  c: string
  t: string
}

interface ProviderCredentialRow {
  auth_ref: string
  purpose: string
  encrypted_value: string
  created_by: string
  created_at: string
  updated_at: string
}

interface ResolvedMasterKey {
  secret: Buffer
  degraded: boolean
}

export interface ProviderSecretPairCredential {
  secretId: string
  secretKey: string
}

export interface ProviderApiKeyCredential {
  apiKey: string
}

export type ProviderCredentialPayload = ProviderSecretPairCredential | ProviderApiKeyCredential

export interface StoreProviderCredentialInput {
  authRef: unknown
  authType: unknown
  credentials: unknown
}

export interface StoreProviderCredentialResult {
  success: true
  authRef: string
  backend: 'd1-encrypted'
  degraded: boolean
}

function getD1Database(event: H3Event): D1Database {
  const db = readCloudflareBindings(event)?.DB
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }
  return db
}

async function ensureProviderCredentialSchema(db: D1Database) {
  if (initializedSchemas.has(db))
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${CREDENTIALS_TABLE} (
      auth_ref TEXT NOT NULL,
      purpose TEXT NOT NULL,
      encrypted_value TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (auth_ref, purpose)
    );
  `).run()

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_provider_secure_store_auth_ref ON ${CREDENTIALS_TABLE}(auth_ref);`).run()
  initializedSchemas.add(db)
}

function toBase64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64')
}

function fromBase64(value: string): Buffer {
  return Buffer.from(value, 'base64')
}

function normalizeAuthRef(value: unknown): string {
  if (typeof value !== 'string' || !AUTH_REF_PATTERN.test(value.trim())) {
    throw createError({
      statusCode: 400,
      statusMessage: 'authRef must match secure://providers/<slug>.',
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

function normalizeAuthType(value: unknown): ProviderCredentialAuthType {
  if (value === 'secret_pair' || value === 'api_key' || value === 'oauth' || value === 'none')
    return value
  throw createError({ statusCode: 400, statusMessage: 'authType is invalid.' })
}

function normalizeProviderCredential(authType: ProviderCredentialAuthType, value: unknown): ProviderCredentialPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'credentials must be a JSON object.' })
  }

  const credentials = value as Record<string, unknown>
  if (authType === 'secret_pair') {
    return {
      secretId: assertNonEmptyString(credentials.secretId, 'credentials.secretId', 256),
      secretKey: assertNonEmptyString(credentials.secretKey, 'credentials.secretKey', 1024),
    }
  }

  if (authType === 'api_key') {
    return {
      apiKey: assertNonEmptyString(credentials.apiKey, 'credentials.apiKey', 4096),
    }
  }

  throw createError({ statusCode: 400, statusMessage: `${authType} credentials are not supported.` })
}

function resolveConfiguredMasterKey(event: H3Event): string {
  const bindings = readCloudflareBindings(event)
  const runtimeConfig = useRuntimeConfig(event) as {
    providerRegistry?: {
      secureStoreKey?: string
    }
  }

  const candidates = [
    bindings?.PROVIDER_REGISTRY_SECURE_STORE_KEY,
    runtimeConfig.providerRegistry?.secureStoreKey,
    process.env.PROVIDER_REGISTRY_SECURE_STORE_KEY,
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
      statusMessage: 'Provider registry secure store key is not configured.',
    })
  }

  return {
    secret: createHash('sha256').update(DEV_FALLBACK_SECRET).digest(),
    degraded: true,
  }
}

function deriveValueKey(masterSecret: Buffer, authRef: string, purpose = PROVIDER_CREDENTIAL_PURPOSE): Buffer {
  const salt = createHash('sha256').update(`tuff-provider-secure-store:${authRef}`).digest()
  const info = Buffer.from(`provider-secure-store:v1:${purpose}`, 'utf-8')
  return Buffer.from(hkdfSync('sha256', masterSecret, salt, info, AES_256_KEY_BYTES))
}

function getKeyId(masterSecret: Buffer, authRef: string, purpose = PROVIDER_CREDENTIAL_PURPOSE): string {
  return createHash('sha256')
    .update('provider-secure-store-kid:v1')
    .update(masterSecret)
    .update(authRef)
    .update(purpose)
    .digest('hex')
    .slice(0, 32)
}

function encryptCredential(authRef: string, payload: ProviderCredentialPayload, masterKey: ResolvedMasterKey): string {
  const key = deriveValueKey(masterKey.secret, authRef)
  const nonce = randomBytes(AES_GCM_NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, nonce, {
    authTagLength: AES_GCM_TAG_BYTES,
  })
  const value = JSON.stringify(payload)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf-8'), cipher.final()])
  const envelope: ProviderCredentialEnvelope = {
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

function parseEnvelope(raw: string): ProviderCredentialEnvelope {
  const parsed = JSON.parse(raw) as Partial<ProviderCredentialEnvelope>
  if (
    parsed?.v !== 1 ||
    parsed.backend !== 'd1-encrypted' ||
    parsed.alg !== 'A256GCM' ||
    typeof parsed.kid !== 'string' ||
    typeof parsed.n !== 'string' ||
    typeof parsed.c !== 'string' ||
    typeof parsed.t !== 'string'
  ) {
    throw new Error('PROVIDER_CREDENTIAL_ENVELOPE_INVALID')
  }
  return parsed as ProviderCredentialEnvelope
}

function decryptCredential(authRef: string, encryptedValue: string, masterKey: ResolvedMasterKey): ProviderCredentialPayload {
  const envelope = parseEnvelope(encryptedValue)
  const expectedKid = getKeyId(masterKey.secret, authRef)
  if (envelope.kid !== expectedKid)
    throw new Error('PROVIDER_CREDENTIAL_KEY_ID_MISMATCH')

  const nonce = fromBase64(envelope.n)
  const tag = fromBase64(envelope.t)
  if (nonce.byteLength !== AES_GCM_NONCE_BYTES || tag.byteLength !== AES_GCM_TAG_BYTES)
    throw new Error('PROVIDER_CREDENTIAL_ENVELOPE_INVALID')

  const key = deriveValueKey(masterKey.secret, authRef)
  const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
    authTagLength: AES_GCM_TAG_BYTES,
  })
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(fromBase64(envelope.c)), decipher.final()]).toString('utf-8')
  const parsed = JSON.parse(decrypted) as ProviderCredentialPayload
  if (!parsed || typeof parsed !== 'object')
    throw new Error('PROVIDER_CREDENTIAL_PAYLOAD_INVALID')
  return parsed
}

export function normalizeProviderAuthRef(value: unknown): string {
  return normalizeAuthRef(value)
}

export async function storeProviderCredential(
  event: H3Event,
  input: StoreProviderCredentialInput,
  createdBy: string,
): Promise<StoreProviderCredentialResult> {
  const db = getD1Database(event)
  await ensureProviderCredentialSchema(db)

  const authRef = normalizeAuthRef(input.authRef)
  const authType = normalizeAuthType(input.authType)
  const credentials = normalizeProviderCredential(authType, input.credentials)
  const masterKey = resolveMasterKey(event)
  const encryptedValue = encryptCredential(authRef, credentials, masterKey)
  const now = new Date().toISOString()
  const safeCreatedBy = assertNonEmptyString(createdBy, 'createdBy', 120)

  await db.prepare(`
    INSERT INTO ${CREDENTIALS_TABLE} (auth_ref, purpose, encrypted_value, created_by, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(auth_ref, purpose) DO UPDATE SET
      encrypted_value = excluded.encrypted_value,
      created_by = excluded.created_by,
      updated_at = excluded.updated_at;
  `).bind(
    authRef,
    PROVIDER_CREDENTIAL_PURPOSE,
    encryptedValue,
    safeCreatedBy,
    now,
    now,
  ).run()

  return {
    success: true,
    authRef,
    backend: 'd1-encrypted',
    degraded: masterKey.degraded,
  }
}

export async function getProviderCredential(
  event: H3Event,
  authRef: string,
): Promise<ProviderCredentialPayload | null> {
  const db = getD1Database(event)
  await ensureProviderCredentialSchema(db)

  const normalizedAuthRef = normalizeAuthRef(authRef)
  const row = await db.prepare(`
    SELECT auth_ref, purpose, encrypted_value, created_by, created_at, updated_at
    FROM ${CREDENTIALS_TABLE}
    WHERE auth_ref = ? AND purpose = ?;
  `).bind(normalizedAuthRef, PROVIDER_CREDENTIAL_PURPOSE).first<ProviderCredentialRow>()

  if (!row?.encrypted_value)
    return null

  try {
    return decryptCredential(normalizedAuthRef, row.encrypted_value, resolveMasterKey(event))
  }
  catch {
    return null
  }
}

export function assertSecretPairCredential(value: ProviderCredentialPayload | null): ProviderSecretPairCredential {
  if (!value || !('secretId' in value) || !('secretKey' in value)) {
    throw createError({ statusCode: 400, statusMessage: 'Provider secret_pair credential is missing.' })
  }
  return value
}
