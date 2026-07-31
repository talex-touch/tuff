import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { types as utilTypes } from 'node:util'

export const SECURE_STORE_FILE = 'secure-store.json'
export const LOCAL_SECRET_FILE = 'local-secret.v1.key'
export const SECURE_STORE_KEY_PATTERN = /^[a-z0-9._-]{1,80}$/i

type WarnHandler = (message: string, error: unknown) => void
export type SecureStoreBackend = 'local-secret' | 'unavailable'
export type SecureStorePurpose = 'auth-token' | 'sync-payload-key' | 'machine-seed' | string

export interface SecureStoreBatchEntry {
  key: string
  value: string | null
  purpose?: SecureStorePurpose
}

export interface SecureStoreBatchConflictOptions {
  conflictPolicy: 'skip' | 'overwrite'
  expectedRevision?: string
}

export interface SecureStoreBatchResult {
  persisted: boolean
  conflict: boolean
  applied: number
  overwritten: number
  skipped: number
}

export interface SecureStoreBatchSnapshot {
  readonly revision: string
  readonly existing: readonly boolean[]
}

type WritableSecureStoreBackend = Exclude<SecureStoreBackend, 'unavailable'>
type SecureStoreEnvelopeBackend = WritableSecureStoreBackend | 'safe-storage'

export interface SecureStoreHealth {
  backend: SecureStoreBackend
  available: boolean
  degraded: boolean
  reason?: string
}

interface SecureStoreEnvelope {
  v: 1
  backend: SecureStoreEnvelopeBackend
  alg: 'A256GCM'
  kid: string
  n: string
  c: string
  t: string
}

interface ResolvedSecureStoreBackend {
  backend: WritableSecureStoreBackend
  secret: Buffer
}

const secureStoreMutationTails = new Map<string, Promise<void>>()

async function runSecureStoreMutation<T>(
  rootPath: string,
  operation: () => Promise<T>
): Promise<T> {
  const queueKey = path.resolve(rootPath)
  const previous = secureStoreMutationTails.get(queueKey) ?? Promise.resolve()
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.catch(() => undefined).then(() => gate)
  secureStoreMutationTails.set(queueKey, queued)

  await previous.catch(() => undefined)
  try {
    return await operation()
  } finally {
    release?.()
    if (secureStoreMutationTails.get(queueKey) === queued) {
      secureStoreMutationTails.delete(queueKey)
    }
  }
}

const AES_256_KEY_BYTES = 32
const AES_GCM_NONCE_BYTES = 12
const AES_GCM_TAG_BYTES = 16
const DEFAULT_PURPOSE: SecureStorePurpose = 'default'
const SECURE_STORE_BATCH_MAX_ENTRIES = 256
const SECURE_STORE_BATCH_MAX_VALUE_BYTES = 1024 * 1024
const SECURE_STORE_BATCH_MAX_PURPOSE_BYTES = 128
const SECURE_STORE_REVISION_PATTERN = /^[a-f0-9]{64}$/
const SECURE_STORE_FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

function normalizeSecureStoreKey(rawKey: string): string {
  const key = rawKey.trim()
  if (!SECURE_STORE_KEY_PATTERN.test(key) || SECURE_STORE_FORBIDDEN_KEYS.has(key)) {
    throw new Error('INVALID_SECURE_STORE_KEY')
  }
  return key
}

function toBase64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64')
}

function fromBase64(value: string): Buffer {
  return Buffer.from(value, 'base64')
}

function isValidLocalSecretFile(rootPath: string): boolean {
  try {
    return (
      fromBase64(readFileSync(getLocalSecretPath(rootPath), 'utf-8').trim()).byteLength ===
      AES_256_KEY_BYTES
    )
  } catch {
    return false
  }
}

function hasLocalSecretEnvelopeSync(rootPath: string): boolean {
  return hasEnvelopeSync(rootPath, 'local-secret')
}

function hasEnvelopeSync(rootPath: string, backend: SecureStoreEnvelopeBackend): boolean {
  try {
    const raw = readFileSync(getSecureStorePath(rootPath), 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.values(parsed).some(
      (value) => typeof value === 'string' && tryParseEnvelope(value)?.backend === backend
    )
  } catch {
    return false
  }
}

function normalizePurpose(purpose?: SecureStorePurpose): string {
  const normalized = purpose?.trim()
  return normalized || DEFAULT_PURPOSE
}

function normalizeSecureStoreBatch(value: unknown): SecureStoreBatchEntry[] {
  if (
    !Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length === 0 ||
    value.length > SECURE_STORE_BATCH_MAX_ENTRIES
  ) {
    throw new Error('INVALID_SECURE_STORE_BATCH')
  }

  const arrayDescriptors = Object.getOwnPropertyDescriptors(value)
  const allowedArrayKeys = new Set<PropertyKey>(['length'])
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index)
    allowedArrayKeys.add(key)
    const descriptor = arrayDescriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) {
      throw new Error('INVALID_SECURE_STORE_BATCH')
    }
  }
  if (Reflect.ownKeys(arrayDescriptors).some((key) => !allowedArrayKeys.has(key))) {
    throw new Error('INVALID_SECURE_STORE_BATCH')
  }

  const normalized: SecureStoreBatchEntry[] = []
  const seen = new Set<string>()
  for (const candidate of value) {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate) ||
      utilTypes.isProxy(candidate)
    ) {
      throw new Error('INVALID_SECURE_STORE_BATCH_ENTRY')
    }

    const prototype = Object.getPrototypeOf(candidate)
    const descriptors = Object.getOwnPropertyDescriptors(candidate)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('INVALID_SECURE_STORE_BATCH_ENTRY')
    }
    const keys = Reflect.ownKeys(descriptors)
    if (
      keys.some(
        (key) =>
          typeof key !== 'string' ||
          !['key', 'value', 'purpose'].includes(key) ||
          !descriptors[key]?.enumerable ||
          !('value' in descriptors[key])
      ) ||
      !Object.hasOwn(descriptors, 'key') ||
      !Object.hasOwn(descriptors, 'value')
    ) {
      throw new Error('INVALID_SECURE_STORE_BATCH_ENTRY')
    }

    try {
      structuredClone(candidate)
    } catch {
      throw new Error('INVALID_SECURE_STORE_BATCH_ENTRY')
    }

    const keyValue = descriptors.key
    const valueValue = descriptors.value
    const purposeValue = descriptors.purpose
    const key = normalizeSecureStoreKey(
      keyValue && 'value' in keyValue && typeof keyValue.value === 'string' ? keyValue.value : ''
    )
    const entryValue = valueValue && 'value' in valueValue ? valueValue.value : undefined
    const purpose = purposeValue && 'value' in purposeValue ? purposeValue.value : undefined
    if (
      (entryValue !== null &&
        (typeof entryValue !== 'string' ||
          !entryValue ||
          Buffer.byteLength(entryValue, 'utf-8') > SECURE_STORE_BATCH_MAX_VALUE_BYTES)) ||
      (purpose !== undefined &&
        (typeof purpose !== 'string' ||
          !purpose.trim() ||
          Buffer.byteLength(purpose, 'utf-8') > SECURE_STORE_BATCH_MAX_PURPOSE_BYTES)) ||
      seen.has(key)
    ) {
      throw new Error('INVALID_SECURE_STORE_BATCH_ENTRY')
    }
    seen.add(key)
    normalized.push({
      key,
      value: entryValue,
      ...(purpose === undefined ? {} : { purpose: normalizePurpose(purpose) })
    })
  }
  try {
    structuredClone(value)
  } catch {
    throw new Error('INVALID_SECURE_STORE_BATCH')
  }
  return normalized
}

function normalizeSecureStoreBatchConflictOptions(
  value: unknown
): SecureStoreBatchConflictOptions | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    throw new Error('INVALID_SECURE_STORE_BATCH_OPTIONS')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys = Reflect.ownKeys(descriptors)
  const policy = descriptors.conflictPolicy
  const expectedRevision = descriptors.expectedRevision
  if (
    Object.getPrototypeOf(value) !== Object.prototype ||
    keys.some((key) => key !== 'conflictPolicy' && key !== 'expectedRevision') ||
    keys.length < 1 ||
    keys.length > 2 ||
    !policy?.enumerable ||
    !('value' in policy) ||
    (policy.value !== 'skip' && policy.value !== 'overwrite') ||
    (expectedRevision !== undefined &&
      (!expectedRevision.enumerable ||
        !('value' in expectedRevision) ||
        typeof expectedRevision.value !== 'string' ||
        !SECURE_STORE_REVISION_PATTERN.test(expectedRevision.value)))
  ) {
    throw new Error('INVALID_SECURE_STORE_BATCH_OPTIONS')
  }
  try {
    structuredClone(value)
  } catch {
    throw new Error('INVALID_SECURE_STORE_BATCH_OPTIONS')
  }
  return {
    conflictPolicy: policy.value,
    ...(expectedRevision && 'value' in expectedRevision
      ? { expectedRevision: expectedRevision.value as string }
      : {})
  }
}

function getSecureStoreRevision(store: Readonly<Record<string, string>>): string {
  const canonicalStore = Object.fromEntries(
    Object.keys(store)
      .sort()
      .map((key) => [key, store[key]])
  )
  return createHash('sha256').update(JSON.stringify(canonicalStore), 'utf-8').digest('hex')
}

function getConfigDir(rootPath: string): string {
  return path.join(rootPath, 'config')
}

function getSecureStorePath(rootPath: string): string {
  return path.join(getConfigDir(rootPath), SECURE_STORE_FILE)
}

function getLocalSecretPath(rootPath: string): string {
  return path.join(getConfigDir(rootPath), LOCAL_SECRET_FILE)
}

async function readSecureStoreFile(
  rootPath: string,
  warn?: WarnHandler,
  failOnCorrupt = false
): Promise<Record<string, string>> {
  const storePath = getSecureStorePath(rootPath)
  try {
    const raw = await fs.readFile(storePath, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('SECURE_STORE_INVALID_DOCUMENT')
    }
    const store: Record<string, string> = Object.create(null)
    for (const [key, value] of Object.entries(parsed)) {
      let normalizedKey: string
      try {
        normalizedKey = normalizeSecureStoreKey(key)
      } catch {
        if (failOnCorrupt) throw new Error('SECURE_STORE_INVALID_KEY')
        continue
      }
      if (normalizedKey !== key || typeof value !== 'string') {
        if (failOnCorrupt) throw new Error('SECURE_STORE_INVALID_ENTRY')
        continue
      }
      store[key] = value
    }
    return store
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return {}
    }
    warn?.('Failed to read secure store file', error)
    if (failOnCorrupt) throw error
    return {}
  }
}

async function writeSecureStoreFile(
  rootPath: string,
  store: Record<string, string>
): Promise<void> {
  const storePath = getSecureStorePath(rootPath)
  const directoryPath = path.dirname(storePath)
  const temporaryPath = `${storePath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`
  await fs.mkdir(directoryPath, { recursive: true })

  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    handle = await fs.open(temporaryPath, 'wx', 0o600)
    await handle.writeFile(JSON.stringify(store), 'utf-8')
    await handle.sync()
    await handle.close()
    handle = undefined
    await fs.rename(temporaryPath, storePath)
    if (process.platform !== 'win32') {
      await fs.chmod(storePath, 0o600).catch(() => undefined)
      const directoryHandle = await fs.open(directoryPath, 'r').catch(() => null)
      if (directoryHandle) {
        await directoryHandle.sync().catch(() => undefined)
        await directoryHandle.close().catch(() => undefined)
      }
    }
  } finally {
    await handle?.close().catch(() => undefined)
    await fs.unlink(temporaryPath).catch(() => undefined)
  }
}

async function readLocalSecret(rootPath: string): Promise<Buffer | null> {
  const secretPath = getLocalSecretPath(rootPath)
  try {
    const raw = (await fs.readFile(secretPath, 'utf-8')).trim()
    const secret = fromBase64(raw)
    if (secret.byteLength !== AES_256_KEY_BYTES) {
      throw new Error('LOCAL_SECRET_INVALID_LENGTH')
    }
    return secret
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

async function hasLocalSecretEnvelope(rootPath: string, warn?: WarnHandler): Promise<boolean> {
  return hasEnvelope(rootPath, 'local-secret', warn)
}

async function hasEnvelope(
  rootPath: string,
  backend: SecureStoreEnvelopeBackend,
  warn?: WarnHandler
): Promise<boolean> {
  const store = await readSecureStoreFile(rootPath, warn)
  return Object.values(store).some((value) => tryParseEnvelope(value)?.backend === backend)
}

async function getOrCreateLocalSecret(rootPath: string, warn?: WarnHandler): Promise<Buffer> {
  const existing = await readLocalSecret(rootPath)
  if (existing) {
    return existing
  }
  if (await hasLocalSecretEnvelope(rootPath, warn)) {
    throw new Error('LOCAL_SECRET_MISSING_FOR_EXISTING_STORE')
  }

  const secret = randomBytes(AES_256_KEY_BYTES)
  const secretPath = getLocalSecretPath(rootPath)
  await fs.mkdir(path.dirname(secretPath), { recursive: true })
  try {
    await fs.writeFile(secretPath, toBase64(secret), {
      encoding: 'utf-8',
      mode: 0o600,
      flag: 'wx'
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
      secret.fill(0)
      return await requireLocalSecret(rootPath)
    }
    secret.fill(0)
    throw error
  }
  if (process.platform !== 'win32') {
    await fs.chmod(secretPath, 0o600).catch(() => undefined)
  }
  return secret
}

async function requireLocalSecret(rootPath: string): Promise<Buffer> {
  const secret = await readLocalSecret(rootPath)
  if (!secret) {
    throw new Error('LOCAL_SECRET_MISSING')
  }
  return secret
}

async function assertReadableExistingEnvelopeBackends(
  rootPath: string,
  warn?: WarnHandler,
  strict = false
): Promise<void> {
  const store = await readSecureStoreFile(rootPath, warn, strict)
  const needsLocalSecret = Object.values(store).some(
    (value) => tryParseEnvelope(value)?.backend === 'local-secret'
  )
  if (needsLocalSecret) {
    const secret = await requireLocalSecret(rootPath)
    secret.fill(0)
  }
}

async function resolveSecureStoreBackend(
  rootPath: string,
  warn?: WarnHandler
): Promise<ResolvedSecureStoreBackend> {
  await assertReadableExistingEnvelopeBackends(rootPath, warn)

  return {
    backend: 'local-secret',
    secret: await getOrCreateLocalSecret(rootPath, warn)
  }
}

async function resolveBackendForEnvelope(
  rootPath: string,
  backend: SecureStoreEnvelope['backend']
): Promise<ResolvedSecureStoreBackend> {
  if (backend === 'local-secret') {
    return {
      backend: 'local-secret',
      secret: await requireLocalSecret(rootPath)
    }
  }

  throw new Error('SECURE_STORE_BACKEND_REMOVED')
}

function deriveValueKey(secret: Buffer, rawKey: string, purpose?: SecureStorePurpose): Buffer {
  const key = normalizeSecureStoreKey(rawKey)
  const salt = createHash('sha256').update(`tuff-secure-store:${key}`).digest()
  const info = Buffer.from(`secure-store:v1:${normalizePurpose(purpose)}`, 'utf-8')
  return Buffer.from(hkdfSync('sha256', secret, salt, info, AES_256_KEY_BYTES))
}

function getKeyId(secret: Buffer, rawKey: string, purpose?: SecureStorePurpose): string {
  return createHash('sha256')
    .update('secure-store-kid:v1')
    .update(secret)
    .update(normalizeSecureStoreKey(rawKey))
    .update(normalizePurpose(purpose))
    .digest('hex')
    .slice(0, 32)
}

function encodeEnvelope(
  backend: WritableSecureStoreBackend,
  secret: Buffer,
  rawKey: string,
  value: string,
  purpose?: SecureStorePurpose
): string {
  const key = deriveValueKey(secret, rawKey, purpose)
  try {
    const nonce = randomBytes(AES_GCM_NONCE_BYTES)
    const cipher = createCipheriv('aes-256-gcm', key, nonce, {
      authTagLength: AES_GCM_TAG_BYTES
    })
    const ciphertext = Buffer.concat([cipher.update(value, 'utf-8'), cipher.final()])
    const envelope: SecureStoreEnvelope = {
      v: 1,
      backend,
      alg: 'A256GCM',
      kid: getKeyId(secret, rawKey, purpose),
      n: toBase64(nonce),
      c: toBase64(ciphertext),
      t: toBase64(cipher.getAuthTag())
    }
    return JSON.stringify(envelope)
  } finally {
    key.fill(0)
  }
}

function tryParseEnvelope(raw: string): SecureStoreEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SecureStoreEnvelope>
    if (
      parsed?.v === 1 &&
      (parsed.backend === 'local-secret' || parsed.backend === 'safe-storage') &&
      parsed.alg === 'A256GCM' &&
      typeof parsed.kid === 'string' &&
      typeof parsed.n === 'string' &&
      typeof parsed.c === 'string' &&
      typeof parsed.t === 'string'
    ) {
      return parsed as SecureStoreEnvelope
    }
  } catch {
    // Previous values may not be JSON envelopes.
  }
  return null
}

async function decryptEnvelope(
  rootPath: string,
  rawKey: string,
  envelope: SecureStoreEnvelope,
  purpose?: SecureStorePurpose,
  exposePlaintext = true
): Promise<string | null> {
  const backend = await resolveBackendForEnvelope(rootPath, envelope.backend)
  try {
    const keyId = getKeyId(backend.secret, rawKey, purpose)
    if (envelope.kid !== keyId) {
      throw new Error('SECURE_STORE_KEY_ID_MISMATCH')
    }

    const nonce = fromBase64(envelope.n)
    const tag = fromBase64(envelope.t)
    if (nonce.byteLength !== AES_GCM_NONCE_BYTES || tag.byteLength !== AES_GCM_TAG_BYTES) {
      throw new Error('SECURE_STORE_ENVELOPE_INVALID')
    }

    const key = deriveValueKey(backend.secret, rawKey, purpose)
    const ciphertext = fromBase64(envelope.c)
    let plaintext: Buffer | undefined
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
        authTagLength: AES_GCM_TAG_BYTES
      })
      decipher.setAuthTag(tag)
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
      return exposePlaintext ? plaintext.toString('utf-8') : null
    } finally {
      key.fill(0)
      nonce.fill(0)
      tag.fill(0)
      ciphertext.fill(0)
      plaintext?.fill(0)
    }
  } finally {
    backend.secret.fill(0)
  }
}

export async function getSecureStoreHealth(rootPath?: string): Promise<SecureStoreHealth> {
  if (!rootPath) {
    return {
      backend: 'unavailable',
      available: false,
      degraded: true,
      reason: 'Root path is required for local encrypted storage'
    }
  }

  try {
    await assertReadableExistingEnvelopeBackends(rootPath, undefined, true)
    const secret = await getOrCreateLocalSecret(rootPath)
    secret.fill(0)
    return {
      backend: 'local-secret',
      available: true,
      degraded: false,
      reason: 'Using local encrypted root secret; system credential storage is disabled'
    }
  } catch {
    return {
      backend: 'unavailable',
      available: false,
      degraded: true,
      reason: 'Local encrypted storage is unavailable'
    }
  }
}

export function isSecureStoreAvailable(rootPath?: string): boolean {
  if (!rootPath) {
    return false
  }
  if (hasLocalSecretEnvelopeSync(rootPath) && !isValidLocalSecretFile(rootPath)) {
    return false
  }
  if (existsSync(getLocalSecretPath(rootPath))) {
    return isValidLocalSecretFile(rootPath)
  }
  return true
}

export async function wrapSecureStoreValue(
  rootPath: string,
  rawKey: string,
  value: string,
  purpose?: SecureStorePurpose,
  warn?: WarnHandler
): Promise<{ backend: WritableSecureStoreBackend; value: string } | null> {
  try {
    const backend = await resolveSecureStoreBackend(rootPath, warn)
    try {
      return {
        backend: backend.backend,
        value: encodeEnvelope(backend.backend, backend.secret, rawKey, value, purpose)
      }
    } finally {
      backend.secret.fill(0)
    }
  } catch (error) {
    warn?.('Failed to wrap secure store value', error)
    return null
  }
}

async function getSecureStoreValueInternal(
  rootPath: string,
  rawKey: string,
  purposeOrWarn: SecureStorePurpose | WarnHandler | undefined,
  maybeWarn: WarnHandler | undefined,
  strict: boolean
): Promise<string | null> {
  const key = normalizeSecureStoreKey(rawKey)
  const purpose = typeof purposeOrWarn === 'function' ? undefined : purposeOrWarn
  const warn = typeof purposeOrWarn === 'function' ? purposeOrWarn : maybeWarn
  const store = await readSecureStoreFile(rootPath, warn, strict)
  const encrypted = store[key]
  if (!encrypted) {
    return null
  }

  const envelope = tryParseEnvelope(encrypted)
  if (!envelope) {
    if (strict) throw new Error('SECURE_STORE_ENVELOPE_INVALID')
    return null
  }

  try {
    return await decryptEnvelope(rootPath, key, envelope, purpose)
  } catch (error) {
    warn?.('Failed to decrypt secure store envelope', error)
    if (strict) throw error
    return null
  }
}

export async function getSecureStoreValue(
  rootPath: string,
  rawKey: string,
  purposeOrWarn?: SecureStorePurpose | WarnHandler,
  maybeWarn?: WarnHandler
): Promise<string | null> {
  return getSecureStoreValueInternal(rootPath, rawKey, purposeOrWarn, maybeWarn, false)
}

export async function getSecureStoreValueStrict(
  rootPath: string,
  rawKey: string,
  purposeOrWarn?: SecureStorePurpose | WarnHandler,
  maybeWarn?: WarnHandler
): Promise<string | null> {
  return getSecureStoreValueInternal(rootPath, rawKey, purposeOrWarn, maybeWarn, true)
}

export async function setSecureStoreValue(
  rootPath: string,
  rawKey: string,
  value: string | null,
  purposeOrWarn?: SecureStorePurpose | WarnHandler,
  maybeWarn?: WarnHandler
): Promise<boolean> {
  const key = normalizeSecureStoreKey(rawKey)
  const purpose = typeof purposeOrWarn === 'function' ? undefined : purposeOrWarn
  const warn = typeof purposeOrWarn === 'function' ? purposeOrWarn : maybeWarn

  return runSecureStoreMutation(rootPath, async () => {
    try {
      const store = await readSecureStoreFile(rootPath, warn, true)
      if (!value) {
        delete store[key]
        await writeSecureStoreFile(rootPath, store)
        return true
      }

      const backend = await resolveSecureStoreBackend(rootPath, warn)
      try {
        store[key] = encodeEnvelope(backend.backend, backend.secret, key, value, purpose)
      } finally {
        backend.secret.fill(0)
      }
      await writeSecureStoreFile(rootPath, store)
      return true
    } catch (error) {
      warn?.('Failed to write secure store value', error)
      return false
    }
  })
}

export async function getSecureStoreBatchSnapshot(
  rootPath: string,
  entries: readonly SecureStoreBatchEntry[],
  warn?: WarnHandler
): Promise<SecureStoreBatchSnapshot> {
  const normalized = normalizeSecureStoreBatch(entries)
  return runSecureStoreMutation(rootPath, async () => {
    const store = await readSecureStoreFile(rootPath, warn, true)
    const existing: boolean[] = []
    for (const entry of normalized) {
      const encrypted = store[entry.key]
      if (!encrypted) {
        existing.push(false)
        continue
      }
      const envelope = tryParseEnvelope(encrypted)
      if (!envelope) throw new Error('SECURE_STORE_ENVELOPE_INVALID')
      await decryptEnvelope(rootPath, entry.key, envelope, entry.purpose, false)
      existing.push(true)
    }
    return Object.freeze({
      revision: getSecureStoreRevision(store),
      existing: Object.freeze(existing)
    })
  })
}

export function applySecureStoreBatch(
  rootPath: string,
  entries: readonly SecureStoreBatchEntry[],
  options: SecureStoreBatchConflictOptions,
  warn?: WarnHandler
): Promise<SecureStoreBatchResult>
export function applySecureStoreBatch(
  rootPath: string,
  entries: readonly SecureStoreBatchEntry[],
  warn?: WarnHandler
): Promise<boolean>
export async function applySecureStoreBatch(
  rootPath: string,
  entries: readonly SecureStoreBatchEntry[],
  optionsOrWarn?: SecureStoreBatchConflictOptions | WarnHandler,
  maybeWarn?: WarnHandler
): Promise<boolean | SecureStoreBatchResult> {
  const normalized = normalizeSecureStoreBatch(entries)
  const options =
    typeof optionsOrWarn === 'function'
      ? undefined
      : normalizeSecureStoreBatchConflictOptions(optionsOrWarn)
  const warn = typeof optionsOrWarn === 'function' ? optionsOrWarn : maybeWarn

  return runSecureStoreMutation(rootPath, async () => {
    let skipped = 0
    let overwritten = 0
    try {
      const store = await readSecureStoreFile(rootPath, warn, true)
      if (
        options?.expectedRevision !== undefined &&
        options.expectedRevision !== getSecureStoreRevision(store)
      ) {
        return {
          persisted: false,
          conflict: true,
          applied: 0,
          overwritten: 0,
          skipped: 0
        }
      }
      const admitted = normalized.filter((entry) => {
        const exists = Object.hasOwn(store, entry.key)
        if (options?.conflictPolicy === 'skip' && exists) {
          skipped += 1
          return false
        }
        if (exists) overwritten += 1
        return true
      })

      const valuesToWrite = admitted.filter(
        (entry): entry is SecureStoreBatchEntry & { value: string } => entry.value !== null
      )
      const backend = valuesToWrite.length
        ? await resolveSecureStoreBackend(rootPath, warn)
        : undefined
      try {
        for (const entry of admitted) {
          if (entry.value === null) {
            delete store[entry.key]
          } else if (backend) {
            store[entry.key] = encodeEnvelope(
              backend.backend,
              backend.secret,
              entry.key,
              entry.value,
              entry.purpose
            )
          }
        }
      } finally {
        backend?.secret.fill(0)
      }

      if (admitted.length > 0) {
        await writeSecureStoreFile(rootPath, store)
      }
      if (!options) return true
      return {
        persisted: true,
        conflict: false,
        applied: admitted.length,
        overwritten,
        skipped
      }
    } catch (error) {
      warn?.('Failed to apply secure store batch', error)
      if (!options) return false
      return {
        persisted: false,
        conflict: false,
        applied: 0,
        overwritten: 0,
        skipped
      }
    }
  })
}

export async function countSecureStoreValuesByPrefixes(
  rootPath: string,
  rawPrefixes: readonly string[],
  warn?: WarnHandler
): Promise<number> {
  const prefixes = [...new Set(rawPrefixes.map((prefix) => normalizeSecureStoreKey(prefix)))]
  return runSecureStoreMutation(rootPath, async () => {
    const store = await readSecureStoreFile(rootPath, warn, true)
    return Object.keys(store).filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
      .length
  })
}

export async function deleteSecureStoreValuesByPrefixes(
  rootPath: string,
  rawPrefixes: readonly string[],
  warn?: WarnHandler
): Promise<number> {
  const prefixes = [...new Set(rawPrefixes.map((prefix) => normalizeSecureStoreKey(prefix)))]
  return runSecureStoreMutation(rootPath, async () => {
    const store = await readSecureStoreFile(rootPath, warn, true)
    const matchingKeys = Object.keys(store).filter((key) =>
      prefixes.some((prefix) => key.startsWith(prefix))
    )
    if (matchingKeys.length === 0) return 0
    for (const key of matchingKeys) delete store[key]
    await writeSecureStoreFile(rootPath, store)
    return matchingKeys.length
  })
}

export async function deleteSecureStoreValuesByPrefix(
  rootPath: string,
  rawPrefix: string,
  warn?: WarnHandler
): Promise<number> {
  return deleteSecureStoreValuesByPrefixes(rootPath, [rawPrefix], warn)
}
