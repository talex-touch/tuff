import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'

/**
 * Shared AES-256-GCM credential store.
 *
 * `provider_secure_store`, `notification_secure_store`, and `storage_secure_store` were three
 * copies of the same file: identical envelope, identical HKDF derivation, identical CRUD, differing
 * only in table name, HKDF namespace, and payload validation. They now share this core.
 *
 * Every string in a `SecureCredentialStoreDescriptor` marked NEVER CHANGE feeds key derivation.
 * Changing one does not rotate a key - it makes every existing row in that table permanently
 * undecryptable, with no error until a read returns null.
 */

const AES_256_KEY_BYTES = 32
const AES_GCM_NONCE_BYTES = 12
const AES_GCM_TAG_BYTES = 16

export interface SecureCredentialStoreDescriptor {
  /** D1 table name. */
  table: string
  /** Accepted `secure://<scope>/<slug>` shape. */
  authRefPattern: RegExp
  /** Shown to the caller when `authRef` is rejected. */
  authRefHint: string
  /** HKDF salt prefix, hashed with the authRef. NEVER CHANGE. */
  saltPrefix: string
  /** HKDF info string. NEVER CHANGE. */
  info: string
  /** Key-id domain separator. NEVER CHANGE. */
  kidDomain: string
  /** Extra key-id component, appended after the authRef. NEVER CHANGE. */
  kidExtra?: string
  /** Prefix for internal envelope/payload errors. Never reaches the client. */
  errorPrefix: string
  /** Named in the fail-closed 500 when no key is configured. */
  label: string
  /** Used only outside production, and reported as `degraded`. */
  devFallbackSecret: string
  /**
   * Ordered master-key candidates, first non-empty wins.
   *
   * Order is per-store and deliberately preserved from before this core existed: the three stores
   * disagreed on whether `process.env` outranks `runtimeConfig`. The values are identical in
   * practice (runtimeConfig is populated from the same variables), so reconciling them would be an
   * unobservable change with a non-zero chance of being observable in exactly one deployment.
   */
  readMasterKeyCandidates: (event: H3Event) => readonly (string | undefined)[]
}

export interface ResolvedMasterKey {
  secret: Buffer
  degraded: boolean
}

interface CredentialEnvelope {
  v: 1
  backend: 'd1-encrypted'
  alg: 'A256GCM'
  kid: string
  n: string
  c: string
  t: string
}

export interface SecureCredentialRow {
  auth_ref: string
  encrypted_value: string
  created_by: string
  created_at: string
  updated_at: string
}

export function getOptionalD1Database(event: H3Event): D1Database | null {
  return readCloudflareBindings(event)?.DB ?? null
}

/**
 * Named `require` rather than `get` because it throws: `docCommentsStore` also exports a
 * `getD1Database`, and that one returns null. Two same-named auto-importable exports with
 * opposite absent-database contracts would let a future caller turn a graceful null path into
 * a 500 by omitting an explicit import.
 */
export function requireD1Database(event: H3Event): D1Database {
  const db = getOptionalD1Database(event)
  if (!db)
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  return db
}

export function assertNonEmptyString(value: unknown, field: string, maxLength = 4096): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength)
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  return value.trim()
}

export function optionalString(value: unknown, field: string, maxLength = 4096): string | undefined {
  if (value == null)
    return undefined
  if (typeof value !== 'string' || value.trim().length > maxLength)
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  const trimmed = value.trim()
  return trimmed || undefined
}

export function assertCredentialObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw createError({ statusCode: 400, statusMessage: 'credentials must be a JSON object.' })
  return value as Record<string, unknown>
}

function toBase64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64')
}

function fromBase64(value: string): Buffer {
  return Buffer.from(value, 'base64')
}

/**
 * HKDF-SHA256 subkey derivation, domain-separated by `saltPrefix + authRef` and `info`.
 *
 * Exported because `intelligenceStore` shares the derivation but not the storage shape: its
 * ciphertext lives in a column with a packed-bytes envelope, not in a `secure_store` table.
 */
export function deriveSecureCredentialKey(
  masterSecret: Buffer,
  namespace: { saltPrefix: string, authRef: string, info: string },
): Buffer {
  const salt = createHash('sha256').update(`${namespace.saltPrefix}${namespace.authRef}`).digest()
  const info = Buffer.from(namespace.info, 'utf-8')
  return Buffer.from(hkdfSync('sha256', masterSecret, salt, info, AES_256_KEY_BYTES))
}

/**
 * Crypto and key handling bound to one store's namespace.
 */
export function createSecureCredentialCrypto(descriptor: SecureCredentialStoreDescriptor) {
  function normalizeAuthRef(value: unknown): string {
    if (typeof value !== 'string' || !descriptor.authRefPattern.test(value.trim())) {
      throw createError({
        statusCode: 400,
        statusMessage: `authRef must match ${descriptor.authRefHint}.`,
      })
    }
    return value.trim()
  }

  function resolveConfiguredMasterKey(event: H3Event): string {
    for (const candidate of descriptor.readMasterKeyCandidates(event)) {
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
        statusMessage: `${descriptor.label} is not configured.`,
      })
    }

    return {
      secret: createHash('sha256').update(descriptor.devFallbackSecret).digest(),
      degraded: true,
    }
  }

  function deriveValueKey(masterSecret: Buffer, authRef: string): Buffer {
    return deriveSecureCredentialKey(masterSecret, {
      saltPrefix: descriptor.saltPrefix,
      authRef,
      info: descriptor.info,
    })
  }

  function getKeyId(masterSecret: Buffer, authRef: string): string {
    const hash = createHash('sha256')
      .update(descriptor.kidDomain)
      .update(masterSecret)
      .update(authRef)
    if (descriptor.kidExtra !== undefined)
      hash.update(descriptor.kidExtra)
    return hash.digest('hex').slice(0, 32)
  }

  function encrypt(authRef: string, payload: unknown, masterKey: ResolvedMasterKey): string {
    const key = deriveValueKey(masterKey.secret, authRef)
    const nonce = randomBytes(AES_GCM_NONCE_BYTES)
    const cipher = createCipheriv('aes-256-gcm', key, nonce, {
      authTagLength: AES_GCM_TAG_BYTES,
    })
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf-8'), cipher.final()])
    const envelope: CredentialEnvelope = {
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

  function parseEnvelope(raw: string): CredentialEnvelope {
    const parsed = JSON.parse(raw) as Partial<CredentialEnvelope>
    if (
      parsed?.v !== 1
      || parsed.backend !== 'd1-encrypted'
      || parsed.alg !== 'A256GCM'
      || typeof parsed.kid !== 'string'
      || typeof parsed.n !== 'string'
      || typeof parsed.c !== 'string'
      || typeof parsed.t !== 'string'
    ) {
      throw new Error(`${descriptor.errorPrefix}_ENVELOPE_INVALID`)
    }
    return parsed as CredentialEnvelope
  }

  function decrypt<T>(authRef: string, encryptedValue: string, masterKey: ResolvedMasterKey): T {
    const envelope = parseEnvelope(encryptedValue)
    if (envelope.kid !== getKeyId(masterKey.secret, authRef))
      throw new Error(`${descriptor.errorPrefix}_KEY_ID_MISMATCH`)

    const nonce = fromBase64(envelope.n)
    const tag = fromBase64(envelope.t)
    if (nonce.byteLength !== AES_GCM_NONCE_BYTES || tag.byteLength !== AES_GCM_TAG_BYTES)
      throw new Error(`${descriptor.errorPrefix}_ENVELOPE_INVALID`)

    const key = deriveValueKey(masterKey.secret, authRef)
    const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
      authTagLength: AES_GCM_TAG_BYTES,
    })
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([
      decipher.update(fromBase64(envelope.c)),
      decipher.final(),
    ]).toString('utf-8')
    const parsed = JSON.parse(decrypted) as T
    if (!parsed || typeof parsed !== 'object')
      throw new Error(`${descriptor.errorPrefix}_PAYLOAD_INVALID`)
    return parsed
  }

  return { normalizeAuthRef, resolveMasterKey, encrypt, decrypt }
}

export interface TypedCredentialRecord<TType extends string> {
  authRef: string
  credentialType: TType
  backend: 'd1-encrypted'
  hasCredential: true
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface StoreTypedCredentialResult<TType extends string> {
  success: true
  authRef: string
  credentialType: TType
  backend: 'd1-encrypted'
  degraded: boolean
}

interface TypedCredentialRow extends SecureCredentialRow {
  credential_type: string
}

/**
 * CRUD for the `auth_ref` primary key + `credential_type` column shape, shared by the notification
 * and storage stores.
 */
export function createTypedCredentialStore<TType extends string, TPayload>(
  descriptor: SecureCredentialStoreDescriptor,
  normalize: {
    credentialType: (value: unknown) => TType
    credentialPayload: (credentialType: TType, value: unknown) => TPayload
  },
) {
  const crypto = createSecureCredentialCrypto(descriptor)
  const initializedSchemas = new WeakSet<D1Database>()
  const columns = 'auth_ref, credential_type, encrypted_value, created_by, created_at, updated_at'

  async function ensureSchema(db: D1Database) {
    if (initializedSchemas.has(db))
      return

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS ${descriptor.table} (
        auth_ref TEXT PRIMARY KEY,
        credential_type TEXT NOT NULL,
        encrypted_value TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `).run()

    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_${descriptor.table}_type ON ${descriptor.table}(credential_type);`).run()
    initializedSchemas.add(db)
  }

  function mapRow(row: TypedCredentialRow): TypedCredentialRecord<TType> {
    return {
      authRef: row.auth_ref,
      credentialType: row.credential_type as TType,
      backend: 'd1-encrypted',
      hasCredential: true,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  return {
    normalizeAuthRef: crypto.normalizeAuthRef,

    async store(
      event: H3Event,
      input: { authRef: unknown, credentialType: unknown, credentials: unknown },
      createdBy: string,
    ): Promise<StoreTypedCredentialResult<TType>> {
      const db = requireD1Database(event)
      await ensureSchema(db)

      const authRef = crypto.normalizeAuthRef(input.authRef)
      const credentialType = normalize.credentialType(input.credentialType)
      const credentials = normalize.credentialPayload(credentialType, input.credentials)
      const masterKey = crypto.resolveMasterKey(event)
      const encryptedValue = crypto.encrypt(authRef, credentials, masterKey)
      const safeCreatedBy = assertNonEmptyString(createdBy, 'createdBy', 120)
      const now = new Date().toISOString()

      await db.prepare(`
        INSERT INTO ${descriptor.table} (${columns})
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(auth_ref) DO UPDATE SET
          credential_type = excluded.credential_type,
          encrypted_value = excluded.encrypted_value,
          created_by = excluded.created_by,
          updated_at = excluded.updated_at;
      `).bind(authRef, credentialType, encryptedValue, safeCreatedBy, now, now).run()

      return {
        success: true,
        authRef,
        credentialType,
        backend: 'd1-encrypted',
        degraded: masterKey.degraded,
      }
    },

    async get(event: H3Event, authRef: string): Promise<TPayload | null> {
      const db = requireD1Database(event)
      await ensureSchema(db)

      const normalizedAuthRef = crypto.normalizeAuthRef(authRef)
      const row = await db.prepare(`
        SELECT ${columns}
        FROM ${descriptor.table}
        WHERE auth_ref = ?1;
      `).bind(normalizedAuthRef).first<TypedCredentialRow>()

      if (!row?.encrypted_value)
        return null

      const masterKey = crypto.resolveMasterKey(event)
      try {
        return crypto.decrypt<TPayload>(normalizedAuthRef, row.encrypted_value, masterKey)
      }
      catch {
        return null
      }
    },

    /** `null` means the platform binding is absent, which is not the same as "no credential". */
    async exists(event: H3Event, authRef: string): Promise<boolean | null> {
      const db = getOptionalD1Database(event)
      if (!db)
        return null

      await ensureSchema(db)
      const normalizedAuthRef = crypto.normalizeAuthRef(authRef)
      const row = await db.prepare(`
        SELECT auth_ref
        FROM ${descriptor.table}
        WHERE auth_ref = ?1;
      `).bind(normalizedAuthRef).first<{ auth_ref: string }>()

      return Boolean(row?.auth_ref)
    },

    async list(event: H3Event): Promise<TypedCredentialRecord<TType>[]> {
      const db = requireD1Database(event)
      await ensureSchema(db)

      const { results } = await db.prepare(`
        SELECT ${columns}
        FROM ${descriptor.table}
        ORDER BY updated_at DESC;
      `).all<TypedCredentialRow>()

      return (results ?? []).map(mapRow)
    },

    async delete(event: H3Event, authRef: string): Promise<boolean> {
      const db = requireD1Database(event)
      await ensureSchema(db)

      const normalizedAuthRef = crypto.normalizeAuthRef(authRef)
      const result = await db.prepare(`
        DELETE FROM ${descriptor.table}
        WHERE auth_ref = ?1;
      `).bind(normalizedAuthRef).run()

      return (result.meta?.changes ?? 0) > 0
    },
  }
}
