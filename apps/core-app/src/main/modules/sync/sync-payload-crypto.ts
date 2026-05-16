import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import {
  getSecureStoreValue,
  isSecureStoreAvailable,
  setSecureStoreValue,
  wrapSecureStoreValue,
  type SecureStoreBackend
} from '../../utils/secure-store'

export const SYNC_PAYLOAD_CRYPTO_VERSION = 'enc:v1'
export const SYNC_PAYLOAD_KEY_TYPE = 'sync-payload.v1'

const SYNC_PAYLOAD_KEY_SECURE_KEY = 'sync.payload-key.v1'
const SYNC_PAYLOAD_REGISTERED_KEY_SECURE_KEY = 'sync.payload-key.v1.registered'
const SYNC_PAYLOAD_KEY_PURPOSE = 'sync-payload-key'
const LEGACY_SYNC_PAYLOAD_PREFIX = 'b64:'
const AES_256_KEY_BYTES = 32
const AES_GCM_NONCE_BYTES = 12
const AES_GCM_TAG_BYTES = 16

export class SyncPayloadCryptoError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'SyncPayloadCryptoError'
  }
}

export interface SyncPayloadCryptoStore {
  isAvailable: () => boolean
  getValue: (key: string) => Promise<string | null>
  setValue: (key: string, value: string | null) => Promise<boolean>
  wrapValue?: (value: string) =>
    | { backend: Exclude<SecureStoreBackend, 'unavailable'> | string; value: string }
    | null
    | Promise<{
        backend: Exclude<SecureStoreBackend, 'unavailable'> | string
        value: string
      } | null>
}

export interface EncryptedSyncPayload {
  payloadEnc: string
  keyId: string
  cryptoVersion: typeof SYNC_PAYLOAD_CRYPTO_VERSION
}

export interface DecryptedSyncPayload {
  rawText: string
  requiresMigrationRewrite: boolean
}

export interface SyncPayloadKeyRegistration {
  keyType: typeof SYNC_PAYLOAD_KEY_TYPE
  keyId: string
  encryptedKey: string
}

interface SyncPayloadEnvelopeV1 {
  v: 1
  alg: 'A256GCM'
  kid: string
  n: string
  c: string
  t: string
}

function toBase64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64')
}

function fromBase64(value: string): Buffer {
  return Buffer.from(value, 'base64')
}

function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function parseEnvelope(payloadEnc: string): SyncPayloadEnvelopeV1 {
  const encoded = payloadEnc.slice(`${SYNC_PAYLOAD_CRYPTO_VERSION}:`.length)
  if (!encoded) {
    throw new SyncPayloadCryptoError('SYNC_PAYLOAD_INVALID_ENVELOPE', 'Missing payload envelope')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64(encoded).toString('utf-8'))
  } catch (error) {
    throw new SyncPayloadCryptoError(
      'SYNC_PAYLOAD_INVALID_ENVELOPE',
      error instanceof Error ? error.message : 'Invalid payload envelope'
    )
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new SyncPayloadCryptoError('SYNC_PAYLOAD_INVALID_ENVELOPE', 'Invalid payload envelope')
  }

  const envelope = parsed as Partial<SyncPayloadEnvelopeV1>
  if (
    envelope.v !== 1 ||
    envelope.alg !== 'A256GCM' ||
    typeof envelope.kid !== 'string' ||
    typeof envelope.n !== 'string' ||
    typeof envelope.c !== 'string' ||
    typeof envelope.t !== 'string'
  ) {
    throw new SyncPayloadCryptoError('SYNC_PAYLOAD_INVALID_ENVELOPE', 'Invalid payload envelope')
  }

  return envelope as SyncPayloadEnvelopeV1
}

function assertBase64DecodedLength(
  value: string,
  expectedLength: number,
  code: string,
  label: string
): Buffer {
  const decoded = fromBase64(value)
  if (decoded.byteLength !== expectedLength) {
    throw new SyncPayloadCryptoError(code, `${label} has invalid length`)
  }
  return decoded
}

export class SyncPayloadCrypto {
  constructor(private readonly store: SyncPayloadCryptoStore) {}

  private async requireKey(): Promise<{ key: Buffer; keyId: string; raw: string }> {
    if (!this.store.isAvailable()) {
      throw new SyncPayloadCryptoError(
        'SYNC_SECURE_STORE_UNAVAILABLE',
        'Secure storage is required for sync payload encryption'
      )
    }

    let raw = await this.store.getValue(SYNC_PAYLOAD_KEY_SECURE_KEY)
    if (!raw) {
      raw = toBase64(randomBytes(AES_256_KEY_BYTES))
      const persisted = await this.store.setValue(SYNC_PAYLOAD_KEY_SECURE_KEY, raw)
      if (!persisted) {
        throw new SyncPayloadCryptoError(
          'SYNC_SECURE_STORE_UNAVAILABLE',
          'Failed to persist sync payload key'
        )
      }
    }

    const key = fromBase64(raw)
    if (key.byteLength !== AES_256_KEY_BYTES) {
      throw new SyncPayloadCryptoError(
        'SYNC_PAYLOAD_KEY_INVALID',
        'Stored sync payload key is invalid'
      )
    }

    return {
      key,
      keyId: sha256Hex(key).slice(0, 32),
      raw
    }
  }

  async encrypt(rawText: string): Promise<EncryptedSyncPayload> {
    const { key, keyId } = await this.requireKey()
    const nonce = randomBytes(AES_GCM_NONCE_BYTES)
    const cipher = createCipheriv('aes-256-gcm', key, nonce, {
      authTagLength: AES_GCM_TAG_BYTES
    })
    const ciphertext = Buffer.concat([cipher.update(rawText, 'utf-8'), cipher.final()])
    const tag = cipher.getAuthTag()
    const envelope: SyncPayloadEnvelopeV1 = {
      v: 1,
      alg: 'A256GCM',
      kid: keyId,
      n: toBase64(nonce),
      c: toBase64(ciphertext),
      t: toBase64(tag)
    }
    return {
      payloadEnc: `${SYNC_PAYLOAD_CRYPTO_VERSION}:${toBase64(Buffer.from(JSON.stringify(envelope)))}`,
      keyId,
      cryptoVersion: SYNC_PAYLOAD_CRYPTO_VERSION
    }
  }

  async decrypt(payloadEnc: string): Promise<DecryptedSyncPayload> {
    const normalized = payloadEnc.trim()
    if (!normalized) {
      return { rawText: '', requiresMigrationRewrite: false }
    }

    if (normalized.startsWith(LEGACY_SYNC_PAYLOAD_PREFIX)) {
      const base64 = normalized.slice(LEGACY_SYNC_PAYLOAD_PREFIX.length)
      return { rawText: fromBase64(base64).toString('utf-8'), requiresMigrationRewrite: true }
    }

    if (!normalized.startsWith(`${SYNC_PAYLOAD_CRYPTO_VERSION}:`)) {
      throw new SyncPayloadCryptoError(
        'SYNC_PAYLOAD_UNSUPPORTED_FORMAT',
        'Unsupported sync payload format'
      )
    }

    const { key } = await this.requireKey()
    const envelope = parseEnvelope(normalized)
    try {
      const nonce = assertBase64DecodedLength(
        envelope.n,
        AES_GCM_NONCE_BYTES,
        'SYNC_PAYLOAD_INVALID_NONCE',
        'Sync payload nonce'
      )
      const tag = assertBase64DecodedLength(
        envelope.t,
        AES_GCM_TAG_BYTES,
        'SYNC_PAYLOAD_INVALID_TAG',
        'Sync payload tag'
      )
      const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
        authTagLength: AES_GCM_TAG_BYTES
      })
      decipher.setAuthTag(tag)
      return {
        rawText: Buffer.concat([
          decipher.update(fromBase64(envelope.c)),
          decipher.final()
        ]).toString('utf-8'),
        requiresMigrationRewrite: false
      }
    } catch (error) {
      throw new SyncPayloadCryptoError(
        'SYNC_PAYLOAD_DECRYPT_FAILED',
        error instanceof Error ? error.message : 'Failed to decrypt sync payload'
      )
    }
  }

  async getRegistration(): Promise<SyncPayloadKeyRegistration | null> {
    const { keyId, raw } = await this.requireKey()
    const registeredKeyId = await this.store.getValue(SYNC_PAYLOAD_REGISTERED_KEY_SECURE_KEY)
    if (registeredKeyId === keyId) {
      return null
    }

    const wrappedKey = await this.store.wrapValue?.(raw)
    if (!wrappedKey) {
      return null
    }

    return {
      keyType: SYNC_PAYLOAD_KEY_TYPE,
      keyId,
      encryptedKey: `${SYNC_PAYLOAD_CRYPTO_VERSION}:${wrappedKey.backend}:${wrappedKey.value}`
    }
  }

  async markRegistered(keyId: string): Promise<void> {
    await this.store.setValue(SYNC_PAYLOAD_REGISTERED_KEY_SECURE_KEY, keyId)
  }
}

let syncPayloadCryptoRootPath = ''

const runtimeSyncPayloadCrypto = new SyncPayloadCrypto({
  isAvailable: () =>
    Boolean(syncPayloadCryptoRootPath) && isSecureStoreAvailable(syncPayloadCryptoRootPath),
  getValue: async (key) => {
    if (!syncPayloadCryptoRootPath) {
      throw new SyncPayloadCryptoError(
        'SYNC_CRYPTO_ROOT_UNAVAILABLE',
        'Sync crypto root path is not ready'
      )
    }
    return getSecureStoreValue(syncPayloadCryptoRootPath, key, SYNC_PAYLOAD_KEY_PURPOSE)
  },
  setValue: async (key, value) => {
    if (!syncPayloadCryptoRootPath) {
      throw new SyncPayloadCryptoError(
        'SYNC_CRYPTO_ROOT_UNAVAILABLE',
        'Sync crypto root path is not ready'
      )
    }
    return setSecureStoreValue(syncPayloadCryptoRootPath, key, value, SYNC_PAYLOAD_KEY_PURPOSE)
  },
  wrapValue: async (value) => {
    if (!syncPayloadCryptoRootPath) {
      throw new SyncPayloadCryptoError(
        'SYNC_CRYPTO_ROOT_UNAVAILABLE',
        'Sync crypto root path is not ready'
      )
    }
    return await wrapSecureStoreValue(
      syncPayloadCryptoRootPath,
      SYNC_PAYLOAD_KEY_SECURE_KEY,
      value,
      SYNC_PAYLOAD_KEY_PURPOSE
    )
  }
})

export function setSyncPayloadCryptoRootPath(rootPath: string): void {
  syncPayloadCryptoRootPath = rootPath
}

export function encryptSyncPayload(rawText: string): Promise<EncryptedSyncPayload> {
  return runtimeSyncPayloadCrypto.encrypt(rawText)
}

export function decryptSyncPayload(payloadEnc: string): Promise<DecryptedSyncPayload> {
  return runtimeSyncPayloadCrypto.decrypt(payloadEnc)
}

export function getSyncPayloadKeyRegistration(): Promise<SyncPayloadKeyRegistration | null> {
  return runtimeSyncPayloadCrypto.getRegistration()
}

export async function markSyncPayloadKeyRegistered(keyId: string): Promise<void> {
  await runtimeSyncPayloadCrypto.markRegistered(keyId)
}
