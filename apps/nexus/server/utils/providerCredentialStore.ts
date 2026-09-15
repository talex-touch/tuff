import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCloudflareBindings } from './cloudflare'
import {
  assertCredentialObject,
  assertNonEmptyString,
  createSecureCredentialCrypto,
  getD1Database,
  type SecureCredentialRow,
} from './secureCredentialStore'

const CREDENTIALS_TABLE = 'provider_secure_store'

/**
 * This store's primary key is `(auth_ref, purpose)`, so it cannot use the shared typed-credential
 * CRUD the notification and storage stores share. Only one purpose exists today; the column is the
 * seam for a second one. The crypto and key handling are shared.
 */
const PROVIDER_CREDENTIAL_PURPOSE = 'provider-credential'

type ProviderCredentialAuthType = 'api_key' | 'secret_pair' | 'oauth' | 'none'

interface ProviderCredentialRow extends SecureCredentialRow {
  purpose: string
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

const crypto = createSecureCredentialCrypto({
  table: CREDENTIALS_TABLE,
  authRefPattern: /^secure:\/\/providers\/[a-z0-9][a-z0-9._-]{0,79}$/i,
  authRefHint: 'secure://providers/<slug>',
  saltPrefix: 'tuff-provider-secure-store:',
  info: `provider-secure-store:v1:${PROVIDER_CREDENTIAL_PURPOSE}`,
  kidDomain: 'provider-secure-store-kid:v1',
  kidExtra: PROVIDER_CREDENTIAL_PURPOSE,
  errorPrefix: 'PROVIDER_CREDENTIAL',
  label: 'Provider registry secure store key',
  devFallbackSecret: 'tuff-nexus-provider-registry-dev-secure-store-key',
  readMasterKeyCandidates: (event) => {
    const runtimeConfig = useRuntimeConfig(event) as {
      providerRegistry?: { secureStoreKey?: string }
    }
    return [
      readCloudflareBindings(event)?.PROVIDER_REGISTRY_SECURE_STORE_KEY,
      runtimeConfig.providerRegistry?.secureStoreKey,
      process.env.PROVIDER_REGISTRY_SECURE_STORE_KEY,
    ]
  },
})

const initializedSchemas = new WeakSet<D1Database>()

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

function normalizeAuthType(value: unknown): ProviderCredentialAuthType {
  if (value === 'secret_pair' || value === 'api_key' || value === 'oauth' || value === 'none')
    return value
  throw createError({ statusCode: 400, statusMessage: 'authType is invalid.' })
}

function normalizeProviderCredential(
  authType: ProviderCredentialAuthType,
  value: unknown,
): ProviderCredentialPayload {
  const credentials = assertCredentialObject(value)

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

export function normalizeProviderAuthRef(value: unknown): string {
  return crypto.normalizeAuthRef(value)
}

export async function storeProviderCredential(
  event: H3Event,
  input: StoreProviderCredentialInput,
  createdBy: string,
): Promise<StoreProviderCredentialResult> {
  const db = getD1Database(event)
  await ensureProviderCredentialSchema(db)

  const authRef = crypto.normalizeAuthRef(input.authRef)
  const authType = normalizeAuthType(input.authType)
  const credentials = normalizeProviderCredential(authType, input.credentials)
  const masterKey = crypto.resolveMasterKey(event)
  const encryptedValue = crypto.encrypt(authRef, credentials, masterKey)
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

  const normalizedAuthRef = crypto.normalizeAuthRef(authRef)
  const row = await db.prepare(`
    SELECT auth_ref, purpose, encrypted_value, created_by, created_at, updated_at
    FROM ${CREDENTIALS_TABLE}
    WHERE auth_ref = ? AND purpose = ?;
  `).bind(normalizedAuthRef, PROVIDER_CREDENTIAL_PURPOSE).first<ProviderCredentialRow>()

  if (!row?.encrypted_value)
    return null

  const masterKey = crypto.resolveMasterKey(event)
  try {
    return crypto.decrypt<ProviderCredentialPayload>(normalizedAuthRef, row.encrypted_value, masterKey)
  }
  catch {
    return null
  }
}

export async function deleteProviderCredential(
  event: H3Event,
  authRef: string,
): Promise<boolean> {
  const db = getD1Database(event)
  await ensureProviderCredentialSchema(db)

  const normalizedAuthRef = crypto.normalizeAuthRef(authRef)
  const result = await db.prepare(`
    DELETE FROM ${CREDENTIALS_TABLE}
    WHERE auth_ref = ? AND purpose = ?;
  `).bind(normalizedAuthRef, PROVIDER_CREDENTIAL_PURPOSE).run()

  return (result.meta?.changes ?? 0) > 0
}

export function assertSecretPairCredential(value: ProviderCredentialPayload | null): ProviderSecretPairCredential {
  if (!value || !('secretId' in value) || !('secretKey' in value)) {
    throw createError({ statusCode: 400, statusMessage: 'Provider secret_pair credential is missing.' })
  }
  return value
}
