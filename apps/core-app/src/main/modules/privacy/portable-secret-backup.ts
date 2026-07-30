import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt } from 'node:crypto'
import { TextDecoder, types as utilTypes } from 'node:util'
import {
  applySecureStoreBatch,
  getSecureStoreBatchSnapshot,
  type SecureStoreBatchEntry
} from '../../utils/secure-store'
import {
  resolvePortableSecretCatalogEntry,
  type PortableSecretCatalogIdentity
} from './portable-secret-catalog'

export const PORTABLE_SECRET_BACKUP_LIMITS = Object.freeze({
  maxFileBytes: 1024 * 1024,
  maxPayloadBytes: 768 * 1024,
  maxEntries: 128,
  maxKeyBytes: 160,
  maxOwnerIdBytes: 160,
  maxPurposeBytes: 160,
  maxValueBytes: 64 * 1024,
  maxPasswordBytes: 1024,
  minPasswordCodePoints: 12
})

const SECRET_BACKUP_FORMAT = 'talex.touch.secret-backup'
const SECRET_BACKUP_VERSION = 1
const SECRET_BACKUP_PAYLOAD_FORMAT = 'talex.touch.secret-backup-payload'
const SECRET_BACKUP_PAYLOAD_VERSION = 1
const SCRYPT_N = 32768
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_SALT_BYTES = 16
const SCRYPT_KEY_BYTES = 32
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024
const AES_GCM_IV_BYTES = 12
const AES_GCM_TAG_BYTES = 16
const capturedCreateCipheriv = createCipheriv
const capturedCreateDecipheriv = createDecipheriv
const capturedCreateHash = createHash
const capturedRandomBytes = randomBytes
const capturedScrypt = scrypt

type PortableSecretBackupErrorCode =
  | 'PRIVACY_SECRET_BACKUP_PASSWORD_INVALID'
  | 'PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED'
  | 'PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID'
  | 'PRIVACY_SECRET_BACKUP_VERSION_UNSUPPORTED'
  | 'PRIVACY_SECRET_BACKUP_KDF_INVALID'
  | 'PRIVACY_SECRET_BACKUP_AUTH_FAILED'
  | 'PRIVACY_SECRET_BACKUP_PAYLOAD_INVALID'
  | 'PRIVACY_SECRET_BACKUP_ENTRY_FORBIDDEN'
  | 'PRIVACY_SECRET_BACKUP_DUPLICATE_ENTRY'
  | 'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID'
  | 'PRIVACY_SECRET_BACKUP_STORE_UNAVAILABLE'
  | 'PRIVACY_SECRET_BACKUP_STORE_WRITE_FAILED'

export class PortableSecretBackupError extends Error {
  readonly code: PortableSecretBackupErrorCode

  constructor(code: PortableSecretBackupErrorCode) {
    super(code)
    this.name = 'PortableSecretBackupError'
    this.code = code
  }
}

export interface PortableSecretBackupEntry extends PortableSecretCatalogIdentity {
  readonly value: string
}

interface SecretBackupEnvelopeV1 {
  readonly format: typeof SECRET_BACKUP_FORMAT
  readonly version: typeof SECRET_BACKUP_VERSION
  readonly createdAt: string
  readonly kdf: {
    readonly name: 'scrypt'
    readonly N: typeof SCRYPT_N
    readonly r: typeof SCRYPT_R
    readonly p: typeof SCRYPT_P
    readonly salt: string
  }
  readonly cipher: {
    readonly name: 'AES-256-GCM'
    readonly iv: string
    readonly tag: string
  }
  readonly payload: string
}

export type PortableSecretRestoreConflictPolicy = 'skip' | 'overwrite'

const FORBIDDEN_RECORD_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

function fail(code: PortableSecretBackupErrorCode): never {
  throw new PortableSecretBackupError(code)
}

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf-8')
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  code: PortableSecretBackupErrorCode
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    fail(code)
  }

  let descriptors: PropertyDescriptorMap
  let prototype: object | null
  try {
    descriptors = Object.getOwnPropertyDescriptors(value)
    prototype = Object.getPrototypeOf(value)
  } catch {
    fail(code)
  }
  if (prototype !== Object.prototype && prototype !== null) fail(code)
  if (Reflect.ownKeys(descriptors).length !== keys.length) fail(code)

  const allowed = new Set(keys)
  const output: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key]
    if (
      typeof key !== 'string' ||
      FORBIDDEN_RECORD_KEYS.has(key) ||
      !allowed.has(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    ) {
      fail(code)
    }
    output[key] = descriptor.value
  }
  for (const key of keys) {
    if (!Object.hasOwn(descriptors, key)) fail(code)
  }
  try {
    structuredClone(value)
  } catch {
    fail(code)
  }
  return output
}

function exactArray(
  value: unknown,
  maxLength: number,
  code: PortableSecretBackupErrorCode
): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    fail(code)
  }
  if (value.length > maxLength) fail('PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED')

  let descriptors: Record<string, PropertyDescriptor>
  try {
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    fail(code)
  }
  const output: unknown[] = []
  const allowed = new Set<PropertyKey>(['length'])
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index)
    allowed.add(key)
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) fail(code)
    output.push(descriptor.value)
  }
  if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key))) fail(code)
  return output
}

function normalizePassword(password: unknown): Buffer {
  if (typeof password !== 'string') fail('PRIVACY_SECRET_BACKUP_PASSWORD_INVALID')
  const byteLength = Buffer.byteLength(password, 'utf-8')
  let codePointCount = 0
  for (let index = 0; index < password.length; index += 1) {
    const codeUnit = password.charCodeAt(index)
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = password.charCodeAt(index + 1)
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) {
        fail('PRIVACY_SECRET_BACKUP_PASSWORD_INVALID')
      }
      index += 1
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      fail('PRIVACY_SECRET_BACKUP_PASSWORD_INVALID')
    }
    codePointCount += 1
  }
  if (
    codePointCount < PORTABLE_SECRET_BACKUP_LIMITS.minPasswordCodePoints ||
    byteLength > PORTABLE_SECRET_BACKUP_LIMITS.maxPasswordBytes
  ) {
    fail('PRIVACY_SECRET_BACKUP_PASSWORD_INVALID')
  }
  return Buffer.from(password, 'utf-8')
}

function normalizeBoundedString(
  value: unknown,
  maxBytes: number,
  code: PortableSecretBackupErrorCode = 'PRIVACY_SECRET_BACKUP_PAYLOAD_INVALID'
): string {
  if (typeof value !== 'string' || value.length === 0) fail(code)
  if (utf8ByteLength(value) > maxBytes) fail('PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED')
  return value
}

function normalizeEntries(value: unknown): readonly PortableSecretBackupEntry[] {
  const input = exactArray(
    value,
    PORTABLE_SECRET_BACKUP_LIMITS.maxEntries,
    'PRIVACY_SECRET_BACKUP_PAYLOAD_INVALID'
  )
  const entries: PortableSecretBackupEntry[] = []
  const identities = new Set<string>()
  let payloadBytes = utf8ByteLength(
    JSON.stringify({
      format: SECRET_BACKUP_PAYLOAD_FORMAT,
      version: SECRET_BACKUP_PAYLOAD_VERSION,
      entries: []
    })
  )
  if (input.length === 0) fail('PRIVACY_SECRET_BACKUP_PAYLOAD_INVALID')

  for (const rawEntry of input) {
    const entry = exactRecord(
      rawEntry,
      ['ownerKind', 'ownerId', 'key', 'purpose', 'value'],
      'PRIVACY_SECRET_BACKUP_PAYLOAD_INVALID'
    )
    const normalized: PortableSecretBackupEntry = {
      ownerKind: normalizeBoundedString(
        entry.ownerKind,
        16
      ) as PortableSecretBackupEntry['ownerKind'],
      ownerId: normalizeBoundedString(entry.ownerId, PORTABLE_SECRET_BACKUP_LIMITS.maxOwnerIdBytes),
      key: normalizeBoundedString(entry.key, PORTABLE_SECRET_BACKUP_LIMITS.maxKeyBytes),
      purpose: normalizeBoundedString(entry.purpose, PORTABLE_SECRET_BACKUP_LIMITS.maxPurposeBytes),
      value: normalizeBoundedString(entry.value, PORTABLE_SECRET_BACKUP_LIMITS.maxValueBytes)
    }
    let catalog
    try {
      catalog = resolvePortableSecretCatalogEntry({
        ownerKind: normalized.ownerKind,
        ownerId: normalized.ownerId,
        key: normalized.key,
        purpose: normalized.purpose
      })
    } catch {
      fail('PRIVACY_SECRET_BACKUP_ENTRY_FORBIDDEN')
    }
    const identity = catalog.secureStoreKey
    if (identities.has(identity)) fail('PRIVACY_SECRET_BACKUP_DUPLICATE_ENTRY')
    identities.add(identity)
    payloadBytes += utf8ByteLength(JSON.stringify(normalized)) + (entries.length === 0 ? 0 : 1)
    if (payloadBytes > PORTABLE_SECRET_BACKUP_LIMITS.maxPayloadBytes) {
      fail('PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED')
    }
    entries.push(Object.freeze(normalized))
  }
  try {
    structuredClone(value)
  } catch {
    fail('PRIVACY_SECRET_BACKUP_PAYLOAD_INVALID')
  }
  return Object.freeze(entries)
}

function canonicalHeader(envelope: Omit<SecretBackupEnvelopeV1, 'payload'>): Buffer {
  return Buffer.from(
    JSON.stringify({
      format: envelope.format,
      version: envelope.version,
      createdAt: envelope.createdAt,
      kdf: {
        name: envelope.kdf.name,
        N: envelope.kdf.N,
        r: envelope.kdf.r,
        p: envelope.kdf.p,
        salt: envelope.kdf.salt
      },
      cipher: {
        name: envelope.cipher.name,
        iv: envelope.cipher.iv
      }
    }),
    'utf-8'
  )
}

function canonicalBase64(
  value: unknown,
  expectedBytes: number | null,
  code: PortableSecretBackupErrorCode
): Buffer {
  if (
    typeof value !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    fail(code)
  }
  const decoded = Buffer.from(value, 'base64')
  if (
    decoded.toString('base64') !== value ||
    (expectedBytes !== null && decoded.byteLength !== expectedBytes)
  ) {
    decoded.fill(0)
    fail(code)
  }
  return decoded
}

function deriveKey(password: Buffer, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    capturedScrypt(
      password,
      salt,
      SCRYPT_KEY_BYTES,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAX_MEMORY },
      (error, derivedKey) => {
        if (error) reject(error)
        else resolve(Buffer.from(derivedKey))
      }
    )
  })
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return new Date(value).toISOString() === value
  } catch {
    return false
  }
}

function parseEnvelope(raw: string): SecretBackupEnvelopeV1 {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    fail('PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID')
  }
  const envelope = exactRecord(
    parsed,
    ['format', 'version', 'createdAt', 'kdf', 'cipher', 'payload'],
    'PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID'
  )
  if (envelope.format !== SECRET_BACKUP_FORMAT) fail('PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID')
  if (envelope.version !== SECRET_BACKUP_VERSION) {
    fail('PRIVACY_SECRET_BACKUP_VERSION_UNSUPPORTED')
  }
  if (!isCanonicalIsoTimestamp(envelope.createdAt)) {
    fail('PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID')
  }

  const kdf = exactRecord(
    envelope.kdf,
    ['name', 'N', 'r', 'p', 'salt'],
    'PRIVACY_SECRET_BACKUP_KDF_INVALID'
  )
  if (kdf.name !== 'scrypt' || kdf.N !== SCRYPT_N || kdf.r !== SCRYPT_R || kdf.p !== SCRYPT_P) {
    fail('PRIVACY_SECRET_BACKUP_KDF_INVALID')
  }
  const salt = canonicalBase64(kdf.salt, SCRYPT_SALT_BYTES, 'PRIVACY_SECRET_BACKUP_KDF_INVALID')
  salt.fill(0)

  const cipher = exactRecord(
    envelope.cipher,
    ['name', 'iv', 'tag'],
    'PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID'
  )
  if (cipher.name !== 'AES-256-GCM') fail('PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID')
  const iv = canonicalBase64(cipher.iv, AES_GCM_IV_BYTES, 'PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID')
  const tag = canonicalBase64(
    cipher.tag,
    AES_GCM_TAG_BYTES,
    'PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID'
  )
  const payload = canonicalBase64(envelope.payload, null, 'PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID')
  if (
    payload.byteLength === 0 ||
    payload.byteLength > PORTABLE_SECRET_BACKUP_LIMITS.maxPayloadBytes
  ) {
    iv.fill(0)
    tag.fill(0)
    payload.fill(0)
    fail('PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED')
  }
  iv.fill(0)
  tag.fill(0)
  payload.fill(0)

  return {
    format: SECRET_BACKUP_FORMAT,
    version: SECRET_BACKUP_VERSION,
    createdAt: envelope.createdAt,
    kdf: {
      name: 'scrypt',
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      salt: kdf.salt as string
    },
    cipher: {
      name: 'AES-256-GCM',
      iv: cipher.iv as string,
      tag: cipher.tag as string
    },
    payload: envelope.payload as string
  }
}

function toBoundedBytes(value: string | Uint8Array): Buffer {
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf-8') > PORTABLE_SECRET_BACKUP_LIMITS.maxFileBytes) {
      fail('PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED')
    }
    return Buffer.from(value, 'utf-8')
  }
  if (
    !(value instanceof Uint8Array) ||
    utilTypes.isProxy(value) ||
    value.byteLength > PORTABLE_SECRET_BACKUP_LIMITS.maxFileBytes
  ) {
    fail('PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED')
  }
  return Buffer.from(value)
}

function toBoundedUtf8(value: string | Uint8Array): string {
  const bytes = toBoundedBytes(value)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    fail('PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID')
  } finally {
    bytes.fill(0)
  }
}

function getRestorePlanFingerprint(
  rawEnvelope: string | Uint8Array,
  storeRevision: string,
  conflictPolicy: PortableSecretRestoreConflictPolicy
): string {
  const envelopeBytes = toBoundedBytes(rawEnvelope)
  try {
    return capturedCreateHash('sha256')
      .update('talex.touch.secret-restore-plan/v1\0', 'utf-8')
      .update(storeRevision, 'utf-8')
      .update('\0', 'utf-8')
      .update(conflictPolicy, 'utf-8')
      .update('\0', 'utf-8')
      .update(envelopeBytes)
      .digest('hex')
  } finally {
    envelopeBytes.fill(0)
  }
}

function normalizeRestorePlanFingerprint(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID')
  }
  return value
}

export async function createPortableSecretBackup(
  rawEntries: unknown,
  password: unknown,
  options: { readonly now?: Date } = {}
): Promise<string> {
  const entries = normalizeEntries(rawEntries)
  const passwordBytes = normalizePassword(password)
  const plaintext = Buffer.from(
    JSON.stringify({
      format: SECRET_BACKUP_PAYLOAD_FORMAT,
      version: SECRET_BACKUP_PAYLOAD_VERSION,
      entries
    }),
    'utf-8'
  )
  if (plaintext.byteLength > PORTABLE_SECRET_BACKUP_LIMITS.maxPayloadBytes) {
    passwordBytes.fill(0)
    plaintext.fill(0)
    fail('PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED')
  }

  const now = options.now ?? new Date()
  if (!Number.isFinite(now.getTime())) {
    passwordBytes.fill(0)
    plaintext.fill(0)
    fail('PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID')
  }
  const salt = capturedRandomBytes(SCRYPT_SALT_BYTES)
  const iv = capturedRandomBytes(AES_GCM_IV_BYTES)
  let key: Buffer | undefined
  try {
    const header: Omit<SecretBackupEnvelopeV1, 'payload'> = {
      format: SECRET_BACKUP_FORMAT,
      version: SECRET_BACKUP_VERSION,
      createdAt: now.toISOString(),
      kdf: {
        name: 'scrypt' as const,
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        salt: salt.toString('base64')
      },
      cipher: {
        name: 'AES-256-GCM' as const,
        iv: iv.toString('base64'),
        tag: ''
      }
    }
    key = await deriveKey(passwordBytes, salt)
    const cipher = capturedCreateCipheriv('aes-256-gcm', key, iv, {
      authTagLength: AES_GCM_TAG_BYTES
    })
    const aad = canonicalHeader(header)
    try {
      cipher.setAAD(aad)
    } finally {
      aad.fill(0)
    }
    const payload = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const authTag = cipher.getAuthTag()
    try {
      const envelope: SecretBackupEnvelopeV1 = {
        ...header,
        cipher: { ...header.cipher, tag: authTag.toString('base64') },
        payload: payload.toString('base64')
      }
      const serialized = JSON.stringify(envelope)
      if (utf8ByteLength(serialized) > PORTABLE_SECRET_BACKUP_LIMITS.maxFileBytes) {
        fail('PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED')
      }
      return serialized
    } finally {
      payload.fill(0)
      authTag.fill(0)
    }
  } catch (error) {
    if (error instanceof PortableSecretBackupError) throw error
    throw new PortableSecretBackupError('PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID')
  } finally {
    passwordBytes.fill(0)
    plaintext.fill(0)
    salt.fill(0)
    iv.fill(0)
    key?.fill(0)
  }
}

export async function openPortableSecretBackup(
  rawEnvelope: string | Uint8Array,
  password: unknown
): Promise<{ readonly entries: readonly PortableSecretBackupEntry[] }> {
  const envelope = parseEnvelope(toBoundedUtf8(rawEnvelope))
  const passwordBytes = normalizePassword(password)
  const salt = canonicalBase64(
    envelope.kdf.salt,
    SCRYPT_SALT_BYTES,
    'PRIVACY_SECRET_BACKUP_KDF_INVALID'
  )
  const iv = canonicalBase64(
    envelope.cipher.iv,
    AES_GCM_IV_BYTES,
    'PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID'
  )
  const tag = canonicalBase64(
    envelope.cipher.tag,
    AES_GCM_TAG_BYTES,
    'PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID'
  )
  const ciphertext = canonicalBase64(
    envelope.payload,
    null,
    'PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID'
  )
  let key: Buffer | undefined
  let plaintextPrefix: Buffer | undefined
  let plaintextSuffix: Buffer | undefined
  let plaintext: Buffer | undefined
  try {
    key = await deriveKey(passwordBytes, salt)
    const decipher = capturedCreateDecipheriv('aes-256-gcm', key, iv, {
      authTagLength: AES_GCM_TAG_BYTES
    })
    const aad = canonicalHeader(envelope)
    try {
      decipher.setAAD(aad)
    } finally {
      aad.fill(0)
    }
    decipher.setAuthTag(tag)
    try {
      plaintextPrefix = decipher.update(ciphertext)
      plaintextSuffix = decipher.final()
      plaintext = Buffer.concat([plaintextPrefix, plaintextSuffix])
      plaintextPrefix.fill(0)
      plaintextSuffix.fill(0)
      plaintextPrefix = undefined
      plaintextSuffix = undefined
    } catch {
      fail('PRIVACY_SECRET_BACKUP_AUTH_FAILED')
    }
    if (plaintext.byteLength > PORTABLE_SECRET_BACKUP_LIMITS.maxPayloadBytes) {
      fail('PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED')
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(plaintext.toString('utf-8'))
    } catch {
      fail('PRIVACY_SECRET_BACKUP_PAYLOAD_INVALID')
    }
    const payload = exactRecord(
      parsed,
      ['format', 'version', 'entries'],
      'PRIVACY_SECRET_BACKUP_PAYLOAD_INVALID'
    )
    if (
      payload.format !== SECRET_BACKUP_PAYLOAD_FORMAT ||
      payload.version !== SECRET_BACKUP_PAYLOAD_VERSION
    ) {
      fail('PRIVACY_SECRET_BACKUP_PAYLOAD_INVALID')
    }
    return { entries: normalizeEntries(payload.entries) }
  } catch (error) {
    if (error instanceof PortableSecretBackupError) throw error
    throw new PortableSecretBackupError('PRIVACY_SECRET_BACKUP_AUTH_FAILED')
  } finally {
    passwordBytes.fill(0)
    salt.fill(0)
    iv.fill(0)
    tag.fill(0)
    ciphertext.fill(0)
    key?.fill(0)
    plaintextPrefix?.fill(0)
    plaintextSuffix?.fill(0)
    plaintext?.fill(0)
  }
}

async function resolveRestorePlan(
  rootPath: string,
  entries: readonly PortableSecretBackupEntry[]
): Promise<{
  readonly mutations: readonly SecureStoreBatchEntry[]
  readonly conflicts: readonly boolean[]
  readonly storeRevision: string
}> {
  const mutations: SecureStoreBatchEntry[] = []
  try {
    for (const entry of entries) {
      const catalog = resolvePortableSecretCatalogEntry(entry)
      mutations.push({
        key: catalog.secureStoreKey,
        value: entry.value,
        purpose: catalog.secureStorePurpose
      })
    }
    const snapshot = await getSecureStoreBatchSnapshot(rootPath, mutations)
    return {
      mutations,
      conflicts: snapshot.existing,
      storeRevision: snapshot.revision
    }
  } catch {
    fail('PRIVACY_SECRET_BACKUP_STORE_UNAVAILABLE')
  }
}

export async function previewPortableSecretRestore(
  rootPath: string,
  rawEnvelope: string | Uint8Array,
  password: unknown
): Promise<{
  readonly total: number
  readonly conflicts: number
  readonly newEntries: number
  readonly storeRevision: string
  readonly planFingerprints: Readonly<Record<PortableSecretRestoreConflictPolicy, string>>
}> {
  const backup = await openPortableSecretBackup(rawEnvelope, password)
  const plan = await resolveRestorePlan(rootPath, backup.entries)
  const conflicts = plan.conflicts.filter(Boolean).length
  return {
    total: backup.entries.length,
    conflicts,
    newEntries: backup.entries.length - conflicts,
    storeRevision: plan.storeRevision,
    planFingerprints: Object.freeze({
      skip: getRestorePlanFingerprint(rawEnvelope, plan.storeRevision, 'skip'),
      overwrite: getRestorePlanFingerprint(rawEnvelope, plan.storeRevision, 'overwrite')
    })
  }
}

export async function applyPortableSecretRestore(
  rootPath: string,
  rawEnvelope: string | Uint8Array,
  password: unknown,
  conflictPolicy: PortableSecretRestoreConflictPolicy,
  planFingerprint: unknown
): Promise<{ readonly imported: number; readonly overwritten: number; readonly skipped: number }> {
  if (conflictPolicy !== 'skip' && conflictPolicy !== 'overwrite') {
    fail('PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID')
  }
  const expectedPlanFingerprint = normalizeRestorePlanFingerprint(planFingerprint)
  const backup = await openPortableSecretBackup(rawEnvelope, password)
  const plan = await resolveRestorePlan(rootPath, backup.entries)
  if (
    getRestorePlanFingerprint(rawEnvelope, plan.storeRevision, conflictPolicy) !==
    expectedPlanFingerprint
  ) {
    fail('PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID')
  }
  let result
  try {
    result = await applySecureStoreBatch(rootPath, plan.mutations, {
      conflictPolicy,
      expectedRevision: plan.storeRevision
    })
  } catch {
    fail('PRIVACY_SECRET_BACKUP_STORE_WRITE_FAILED')
  }
  if (result.conflict) fail('PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID')
  if (!result.persisted) fail('PRIVACY_SECRET_BACKUP_STORE_WRITE_FAILED')
  return {
    imported: result.applied,
    overwritten: result.overwritten,
    skipped: result.skipped
  }
}
