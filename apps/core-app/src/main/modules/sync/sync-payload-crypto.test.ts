import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import {
  SyncPayloadCrypto,
  SyncPayloadCryptoError,
  SYNC_PAYLOAD_CRYPTO_VERSION,
  type SyncPayloadCryptoStore
} from './sync-payload-crypto'

function createMemoryStore(): SyncPayloadCryptoStore {
  const values = new Map<string, string>()
  return {
    isAvailable: () => true,
    getValue: async (key) => values.get(key) ?? null,
    setValue: async (key, value) => {
      if (value === null) {
        values.delete(key)
      } else {
        values.set(key, value)
      }
      return true
    },
    wrapValue: (value) => ({
      backend: 'test-backend',
      value: `wrapped:${Buffer.from(value, 'utf-8').toString('base64')}`
    })
  }
}

function decodeEnvelope(payloadEnc: string): Record<string, unknown> {
  const encoded = payloadEnc.slice(`${SYNC_PAYLOAD_CRYPTO_VERSION}:`.length)
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8')) as Record<string, unknown>
}

function encodeEnvelope(envelope: Record<string, unknown>): string {
  return `${SYNC_PAYLOAD_CRYPTO_VERSION}:${Buffer.from(JSON.stringify(envelope), 'utf-8').toString('base64')}`
}

async function expectDecryptFailure(crypto: SyncPayloadCrypto, payloadEnc: string): Promise<void> {
  await expect(crypto.decrypt(payloadEnc)).rejects.toMatchObject({
    code: expect.stringMatching(/^SYNC_PAYLOAD_/)
  })
}

describe('SyncPayloadCrypto', () => {
  it('encrypts payloads with non-deterministic enc:v1 envelopes', async () => {
    const crypto = new SyncPayloadCrypto(createMemoryStore())
    const rawText = JSON.stringify({ secret: 'business-json', count: 1 })

    const first = await crypto.encrypt(rawText)
    const second = await crypto.encrypt(rawText)

    expect(first.payloadEnc).toMatch(/^enc:v1:/)
    expect(second.payloadEnc).toMatch(/^enc:v1:/)
    expect(first.payloadEnc).not.toBe(second.payloadEnc)
    expect(first.payloadEnc).not.toContain('business-json')
    expect(second.payloadEnc).not.toContain('business-json')
  })

  it('decrypts encrypted and empty payloads', async () => {
    const crypto = new SyncPayloadCrypto(createMemoryStore())

    const encrypted = await crypto.encrypt('hello sync')
    await expect(crypto.decrypt(encrypted.payloadEnc)).resolves.toEqual({
      rawText: 'hello sync',
      requiresMigrationRewrite: false
    })

    const empty = await crypto.encrypt('')
    await expect(crypto.decrypt(empty.payloadEnc)).resolves.toEqual({
      rawText: '',
      requiresMigrationRewrite: false
    })
  })

  it('rejects ciphertext, nonce, and tag tampering', async () => {
    const crypto = new SyncPayloadCrypto(createMemoryStore())
    const encrypted = await crypto.encrypt(JSON.stringify({ secret: 'tamper-me' }))
    const envelope = decodeEnvelope(encrypted.payloadEnc)

    await expectDecryptFailure(
      crypto,
      encodeEnvelope({
        ...envelope,
        c: Buffer.from('tampered-ciphertext', 'utf-8').toString('base64')
      })
    )
    await expectDecryptFailure(
      crypto,
      encodeEnvelope({
        ...envelope,
        n: Buffer.from('bad-nonce', 'utf-8').toString('base64')
      })
    )
    await expectDecryptFailure(
      crypto,
      encodeEnvelope({
        ...envelope,
        t: Buffer.from('bad-tag', 'utf-8').toString('base64')
      })
    )
  })

  it('keeps b64 as a read-only migration fallback', async () => {
    const crypto = new SyncPayloadCrypto(createMemoryStore())
    const migrationPayload = `b64:${Buffer.from('migration text', 'utf-8').toString('base64')}`

    await expect(crypto.decrypt(migrationPayload)).resolves.toEqual({
      rawText: 'migration text',
      requiresMigrationRewrite: true
    })
  })

  it('rejects unsupported plain payload formats', async () => {
    const crypto = new SyncPayloadCrypto(createMemoryStore())

    await expect(crypto.decrypt('{"secret":"plain"}')).rejects.toBeInstanceOf(
      SyncPayloadCryptoError
    )
    await expect(crypto.decrypt('{"secret":"plain"}')).rejects.toMatchObject({
      code: 'SYNC_PAYLOAD_UNSUPPORTED_FORMAT'
    })
  })

  it('registers payload keys with the wrapping backend marker', async () => {
    const crypto = new SyncPayloadCrypto(createMemoryStore())

    const registration = await crypto.getRegistration()

    expect(registration).toMatchObject({
      keyType: 'sync-payload.v1',
      encryptedKey: expect.stringMatching(/^enc:v1:test-backend:wrapped:/)
    })
    await crypto.markRegistered(registration!.keyId)
    await expect(crypto.getRegistration()).resolves.toBeNull()
  })
})
