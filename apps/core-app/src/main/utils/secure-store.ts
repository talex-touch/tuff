import { Buffer } from 'node:buffer'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes
} from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

export const SECURE_STORE_FILE = 'secure-store.json'
export const LOCAL_SECRET_FILE = 'local-secret.v1.key'
export const SECURE_STORE_KEY_PATTERN = /^[a-z0-9._-]{1,80}$/i

type WarnHandler = (message: string, error: unknown) => void
type ElectronSafeStorage = (typeof import('electron'))['safeStorage']
export type SecureStoreBackend = 'safe-storage' | 'local-secret' | 'unavailable'
export type SecureStorePurpose = 'auth-token' | 'sync-payload-key' | 'machine-seed' | string

export interface SecureStoreHealth {
  backend: SecureStoreBackend
  available: boolean
  degraded: boolean
  reason?: string
}

interface SecureStoreEnvelope {
  v: 1
  backend: Exclude<SecureStoreBackend, 'unavailable'>
  alg: 'A256GCM'
  kid: string
  n: string
  c: string
  t: string
}

interface ResolvedSecureStoreBackend {
  backend: Exclude<SecureStoreBackend, 'unavailable'>
  secret: Buffer
  degraded: boolean
}

const requireFromCurrentModule = createRequire(import.meta.url)
const AES_256_KEY_BYTES = 32
const AES_GCM_NONCE_BYTES = 12
const AES_GCM_TAG_BYTES = 16
const SAFE_STORAGE_ROOT_KEY = '__secure_store_root_v1'
const DEFAULT_PURPOSE: SecureStorePurpose = 'default'

function resolveSafeStorage(): ElectronSafeStorage | null {
  try {
    const electron = requireFromCurrentModule('electron') as typeof import('electron')
    return electron.safeStorage ?? null
  } catch {
    return null
  }
}

function normalizeSecureStoreKey(rawKey: string): string {
  const key = rawKey.trim()
  if (!SECURE_STORE_KEY_PATTERN.test(key)) {
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
  try {
    const raw = readFileSync(getSecureStorePath(rootPath), 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.values(parsed).some(
      (value) => typeof value === 'string' && tryParseEnvelope(value)?.backend === 'local-secret'
    )
  } catch {
    return false
  }
}

function normalizePurpose(purpose?: SecureStorePurpose): string {
  const normalized = purpose?.trim()
  return normalized || DEFAULT_PURPOSE
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
  warn?: WarnHandler
): Promise<Record<string, string>> {
  const storePath = getSecureStorePath(rootPath)
  try {
    const raw = await fs.readFile(storePath, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const store: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        store[key] = value
      }
    }
    return store
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return {}
    }
    warn?.('Failed to read secure store file', error)
    return {}
  }
}

async function writeSecureStoreFile(
  rootPath: string,
  store: Record<string, string>
): Promise<void> {
  const storePath = getSecureStorePath(rootPath)
  await fs.mkdir(path.dirname(storePath), { recursive: true })
  await fs.writeFile(storePath, JSON.stringify(store), 'utf-8')
  if (process.platform !== 'win32') {
    await fs.chmod(storePath, 0o600).catch(() => undefined)
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
      return await requireLocalSecret(rootPath)
    }
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

async function getSafeStorageRootSecret(
  safeStorage: ElectronSafeStorage,
  rootPath: string,
  warn?: WarnHandler
): Promise<Buffer> {
  const store = await readSecureStoreFile(rootPath, warn)
  const encrypted = store[SAFE_STORAGE_ROOT_KEY]

  if (encrypted) {
    const decrypted = safeStorage.decryptString(fromBase64(encrypted))
    const secret = fromBase64(decrypted)
    if (secret.byteLength !== AES_256_KEY_BYTES) {
      throw new Error('SAFE_STORAGE_ROOT_SECRET_INVALID')
    }
    return secret
  }

  const secret = randomBytes(AES_256_KEY_BYTES)
  store[SAFE_STORAGE_ROOT_KEY] = safeStorage.encryptString(toBase64(secret)).toString('base64')
  await writeSecureStoreFile(rootPath, store)
  return secret
}

async function resolveSecureStoreBackend(
  rootPath: string,
  preferredBackend?: SecureStoreBackend,
  warn?: WarnHandler
): Promise<ResolvedSecureStoreBackend> {
  const safeStorage = resolveSafeStorage()
  const canUseSafeStorage =
    safeStorage?.isEncryptionAvailable() === true && preferredBackend !== 'local-secret'

  if (canUseSafeStorage && safeStorage) {
    try {
      return {
        backend: 'safe-storage',
        secret: await getSafeStorageRootSecret(safeStorage, rootPath, warn),
        degraded: false
      }
    } catch (error) {
      if (preferredBackend === 'safe-storage') {
        throw error
      }
      warn?.('Safe storage backend failed, falling back to local secret', error)
    }
  }

  return {
    backend: 'local-secret',
    secret: await getOrCreateLocalSecret(rootPath),
    degraded: true
  }
}

async function resolveBackendForEnvelope(
  rootPath: string,
  backend: SecureStoreEnvelope['backend'],
  warn?: WarnHandler
): Promise<ResolvedSecureStoreBackend> {
  if (backend === 'local-secret') {
    return {
      backend: 'local-secret',
      secret: await requireLocalSecret(rootPath),
      degraded: true
    }
  }

  const safeStorage = resolveSafeStorage()
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    throw new Error('SAFE_STORAGE_UNAVAILABLE')
  }

  return {
    backend: 'safe-storage',
    secret: await getSafeStorageRootSecret(safeStorage, rootPath, warn),
    degraded: false
  }
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
  backend: Exclude<SecureStoreBackend, 'unavailable'>,
  secret: Buffer,
  rawKey: string,
  value: string,
  purpose?: SecureStorePurpose
): string {
  const key = deriveValueKey(secret, rawKey, purpose)
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
}

function tryParseEnvelope(raw: string): SecureStoreEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SecureStoreEnvelope>
    if (
      parsed?.v === 1 &&
      (parsed.backend === 'safe-storage' || parsed.backend === 'local-secret') &&
      parsed.alg === 'A256GCM' &&
      typeof parsed.kid === 'string' &&
      typeof parsed.n === 'string' &&
      typeof parsed.c === 'string' &&
      typeof parsed.t === 'string'
    ) {
      return parsed as SecureStoreEnvelope
    }
  } catch {
    // Previous safeStorage values are plain base64 strings, not JSON envelopes.
  }
  return null
}

async function hasLocalSecretEnvelope(rootPath: string, warn?: WarnHandler): Promise<boolean> {
  const store = await readSecureStoreFile(rootPath, warn)
  return Object.values(store).some((value) => tryParseEnvelope(value)?.backend === 'local-secret')
}

async function decryptEnvelope(
  rootPath: string,
  rawKey: string,
  envelope: SecureStoreEnvelope,
  purpose?: SecureStorePurpose,
  warn?: WarnHandler
): Promise<string> {
  const backend = await resolveBackendForEnvelope(rootPath, envelope.backend, warn)
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
  const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
    authTagLength: AES_GCM_TAG_BYTES
  })
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(fromBase64(envelope.c)), decipher.final()]).toString(
    'utf-8'
  )
}

export async function getSecureStoreHealth(rootPath?: string): Promise<SecureStoreHealth> {
  const safeStorage = resolveSafeStorage()
  if (safeStorage?.isEncryptionAvailable() === true) {
    if (!rootPath) {
      return { backend: 'safe-storage', available: true, degraded: false }
    }
    try {
      await getSafeStorageRootSecret(safeStorage, rootPath)
      return { backend: 'safe-storage', available: true, degraded: false }
    } catch (error) {
      try {
        await getOrCreateLocalSecret(rootPath)
        return {
          backend: 'local-secret',
          available: true,
          degraded: true,
          reason: error instanceof Error ? error.message : 'Safe storage backend failed'
        }
      } catch (fallbackError) {
        return {
          backend: 'unavailable',
          available: false,
          degraded: true,
          reason: fallbackError instanceof Error ? fallbackError.message : 'Secure store unavailable'
        }
      }
    }
  }

  if (!rootPath) {
    return {
      backend: 'unavailable',
      available: false,
      degraded: true,
      reason: 'Root path is required for local encrypted fallback'
    }
  }

  try {
    await getOrCreateLocalSecret(rootPath)
    return {
      backend: 'local-secret',
      available: true,
      degraded: true,
      reason: 'System safeStorage is unavailable'
    }
  } catch (error) {
    return {
      backend: 'unavailable',
      available: false,
      degraded: true,
      reason: error instanceof Error ? error.message : 'Local encrypted fallback unavailable'
    }
  }
}

export function isSecureStoreAvailable(rootPath?: string): boolean {
  const safeStorage = resolveSafeStorage()
  if (safeStorage?.isEncryptionAvailable() === true) {
    return true
  }
  if (!rootPath) {
    return false
  }
  if (existsSync(getLocalSecretPath(rootPath))) {
    return isValidLocalSecretFile(rootPath)
  }
  if (hasLocalSecretEnvelopeSync(rootPath)) {
    return false
  }
  return true
}

export async function wrapSecureStoreValue(
  rootPath: string,
  rawKey: string,
  value: string,
  purpose?: SecureStorePurpose,
  warn?: WarnHandler
): Promise<{ backend: Exclude<SecureStoreBackend, 'unavailable'>; value: string } | null> {
  try {
    const backend = await resolveSecureStoreBackend(rootPath, undefined, warn)
    return {
      backend: backend.backend,
      value: encodeEnvelope(backend.backend, backend.secret, rawKey, value, purpose)
    }
  } catch (error) {
    warn?.('Failed to wrap secure store value', error)
    return null
  }
}

export async function getSecureStoreValue(
  rootPath: string,
  rawKey: string,
  purposeOrWarn?: SecureStorePurpose | WarnHandler,
  maybeWarn?: WarnHandler
): Promise<string | null> {
  const key = normalizeSecureStoreKey(rawKey)
  const purpose = typeof purposeOrWarn === 'function' ? undefined : purposeOrWarn
  const warn = typeof purposeOrWarn === 'function' ? purposeOrWarn : maybeWarn
  const store = await readSecureStoreFile(rootPath, warn)
  const encrypted = store[key]
  if (!encrypted) {
    return null
  }

  const envelope = tryParseEnvelope(encrypted)
  if (envelope) {
    try {
      return await decryptEnvelope(rootPath, key, envelope, purpose, warn)
    } catch (error) {
      warn?.('Failed to decrypt secure store envelope', error)
      return null
    }
  }

  const safeStorage = resolveSafeStorage()
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    return null
  }

  try {
    return safeStorage.decryptString(fromBase64(encrypted))
  } catch (error) {
    warn?.('Failed to decrypt secure store value', error)
    return null
  }
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
  const store = await readSecureStoreFile(rootPath, warn)
  if (!value) {
    delete store[key]
    await writeSecureStoreFile(rootPath, store)
    return true
  }

  try {
    const backend = await resolveSecureStoreBackend(rootPath, undefined, warn)
    store[key] = encodeEnvelope(backend.backend, backend.secret, key, value, purpose)
    await writeSecureStoreFile(rootPath, store)
    return true
  } catch (error) {
    warn?.('Failed to write secure store value', error)
    return false
  }
}
