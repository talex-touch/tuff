import {
  CATALOG_CLIENT_SDKAPI,
  CATALOG_ERROR_CODES,
  CATALOG_MAX_PACK_BYTES,
  CATALOG_PAYLOAD_KEY_BYTES,
  CatalogContractError,
  createCatalogManifestSigningPayload,
  createCatalogPayloadEncryptionAad,
  serializeCatalogEncryptedPayloadEnvelope,
  serializeVoiceProviderCatalogPack,
  type CatalogEncryptedPayloadEnvelopeV1,
  type CatalogErrorCode,
  type CatalogManifestV1,
  type CatalogPayloadEncryptionContext,
  type VoiceProviderPackV1
} from '@talex-touch/utils/i18n'
import { createCipheriv, createHash, generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { PinnedCatalogVerifier } from './catalog-verifier'

const encoder = new TextEncoder()
const createdAt = '2026-07-15T00:00:00.000Z'
const primaryKeys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 })

/** Deterministic test-only key material; the nonce is fixed so ciphertext bytes are reproducible. */
const PAYLOAD_KEY = Buffer.alloc(CATALOG_PAYLOAD_KEY_BYTES, 0x5a)
const PAYLOAD_KEY_ID = 'voice-key-v1'
const PAYLOAD_NONCE = Buffer.alloc(12, 0x3c)

function publicPem(keys = primaryKeys): string {
  return keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
}

function validVoicePack(overrides: Partial<VoiceProviderPackV1> = {}): VoiceProviderPackV1 {
  return {
    contractVersion: 1,
    type: 'voice-provider',
    packId: 'official.voice-provider',
    version: '20260701',
    schemaVersion: 1,
    createdAt,
    minSdkApi: CATALOG_CLIENT_SDKAPI,
    providers: [
      {
        id: 'bailian-paraformer',
        displayName: {
          default: 'Bailian Paraformer',
          locales: { 'zh-CN': '百炼 Paraformer', 'en-US': 'Bailian Paraformer' }
        },
        protocol: 'bailian-paraformer',
        transport: 'http-upload',
        endpoint: { baseUrl: 'https://asr.example.com', submitPath: '/v1/asr' },
        auth: { mode: 'nexus-session' },
        request: {
          body: 'multipart',
          contentTypePolicy: 'audio/*',
          headers: { accept: 'application/json' },
          idempotencyHeader: 'x-idempotency-key'
        },
        models: [{ id: 'paraformer-v2', label: 'Paraformer v2', languages: ['zh-CN'] }],
        limits: { maxBytes: 10_485_760, maxDurationSec: 300, timeoutMs: 30_000 }
      }
    ],
    ...overrides
  }
}

function encryptionContext(
  overrides: Partial<CatalogPayloadEncryptionContext> = {}
): CatalogPayloadEncryptionContext {
  return {
    contractVersion: 1,
    type: 'voice-provider',
    packId: 'official.voice-provider',
    version: '20260701',
    schemaVersion: 1,
    createdAt,
    payloadEncryption: { algorithm: 'aes-256-gcm', keyId: PAYLOAD_KEY_ID },
    ...overrides
  }
}

function sealEnvelope(
  plaintext: Uint8Array,
  context: CatalogPayloadEncryptionContext,
  options: { key?: Buffer; nonce?: Buffer } = {}
): CatalogEncryptedPayloadEnvelopeV1 {
  const key = options.key ?? PAYLOAD_KEY
  const nonce = options.nonce ?? PAYLOAD_NONCE
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 })
  cipher.setAAD(createCatalogPayloadEncryptionAad(context))
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    keyId: context.payloadEncryption.keyId,
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64')
  }
}

function flipFirstBase64Byte(value: string): string {
  const bytes = Buffer.from(value, 'base64')
  bytes[0] = bytes[0] ^ 0xff
  return bytes.toString('base64')
}

function signedVoiceFixture(
  options: {
    pack?: VoiceProviderPackV1
    manifest?: Partial<CatalogManifestV1>
    privateKey?: typeof primaryKeys.privateKey
    plaintextBytes?: Uint8Array
    payloadKey?: Buffer
    payloadNonce?: Buffer
    envelopeKeyId?: string
    encryptionIdentity?: Partial<CatalogPayloadEncryptionContext>
    tamperAuthTag?: boolean
  } = {}
): {
  manifest: CatalogManifestV1
  payloadBytes: Uint8Array
  plaintextBytes: Uint8Array
  payloadKey: Buffer
} {
  const pack = options.pack ?? validVoicePack()
  const plaintextBytes = options.plaintextBytes ?? serializeVoiceProviderCatalogPack(pack)
  const envelopeKeyId = options.envelopeKeyId ?? PAYLOAD_KEY_ID
  const context = encryptionContext({
    packId: pack.packId,
    version: pack.version,
    createdAt: pack.createdAt,
    payloadEncryption: { algorithm: 'aes-256-gcm', keyId: envelopeKeyId },
    ...options.encryptionIdentity
  })
  const sealed = sealEnvelope(plaintextBytes, context, {
    ...(options.payloadKey ? { key: options.payloadKey } : {}),
    ...(options.payloadNonce ? { nonce: options.payloadNonce } : {})
  })
  const envelope = options.tamperAuthTag
    ? { ...sealed, authTag: flipFirstBase64Byte(sealed.authTag) }
    : sealed
  const payloadBytes = serializeCatalogEncryptedPayloadEnvelope(envelope)
  const unsigned: CatalogManifestV1 = {
    contractVersion: 1,
    type: 'voice-provider',
    packId: pack.packId,
    version: pack.version,
    schemaVersion: 1,
    createdAt: pack.createdAt,
    minSdkapi: pack.minSdkApi,
    locales: ['zh-CN', 'en-US'],
    entryCount: pack.providers.length,
    payloadBytes: payloadBytes.byteLength,
    payloadSha256: createHash('sha256').update(payloadBytes).digest('hex'),
    payloadEncryption: { algorithm: 'aes-256-gcm', keyId: envelopeKeyId },
    signatureAlgorithm: 'rsa-sha256',
    keyId: 'release-v1',
    signature: 'AA==',
    ...options.manifest
  }
  const signature = sign(
    'RSA-SHA256',
    createCatalogManifestSigningPayload(unsigned),
    options.privateKey ?? primaryKeys.privateKey
  ).toString('base64')
  return {
    manifest: { ...unsigned, signature },
    payloadBytes,
    plaintextBytes,
    payloadKey: options.payloadKey ?? PAYLOAD_KEY
  }
}

function expectCode(action: () => unknown, code: CatalogErrorCode): void {
  try {
    action()
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(CatalogContractError)
    expect((error as CatalogContractError).code).toBe(code)
  }
}

describe('PinnedCatalogVerifier voice-provider', () => {
  it('verifies an encrypted signed voice-provider payload into an immutable registry', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    const { manifest, payloadBytes, payloadKey } = signedVoiceFixture()

    const verified = verifier.verifyVoiceProviderPack(manifest, payloadBytes, payloadKey)

    expect(verified.type).toBe('voice-provider')
    expect(verified.source).toBe('remote')
    expect(verified.signatureStatus).toBe('verified')
    expect(verified.pack.packId).toBe('official.voice-provider')
    expect(verified.providers).toHaveLength(1)
    expect(verified.registry.size).toBe(1)
    expect(verified.registry.get('bailian-paraformer')?.protocol).toBe('bailian-paraformer')
    expect(verified.manifest.payloadEncryption).toEqual({
      algorithm: 'aes-256-gcm',
      keyId: PAYLOAD_KEY_ID
    })
    expect(Object.isFrozen(verified)).toBe(true)
    expect(Object.isFrozen(verified.providers)).toBe(true)
  })

  it('rejects a same-length tampered envelope with hashMismatch', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    const { manifest, payloadBytes, payloadKey } = signedVoiceFixture()
    const tampered = Uint8Array.from(payloadBytes)
    // Flip one byte in place so the manifest byte-length check still passes.
    tampered[10] = tampered[10] ^ 0x20

    expectCode(
      () => verifier.verifyVoiceProviderPack(manifest, tampered, payloadKey),
      CATALOG_ERROR_CODES.hashMismatch
    )
  })

  it('rejects decryption with the wrong payload key with payloadDecryptFailed', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    const { manifest, payloadBytes } = signedVoiceFixture()
    const wrongKey = Buffer.alloc(CATALOG_PAYLOAD_KEY_BYTES, 0x11)

    expectCode(
      () => verifier.verifyVoiceProviderPack(manifest, payloadBytes, wrongKey),
      CATALOG_ERROR_CODES.payloadDecryptFailed
    )
  })

  it('rejects an invalid-length payload key with payloadKeyUnavailable', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    const { manifest, payloadBytes } = signedVoiceFixture()

    expectCode(
      () => verifier.verifyVoiceProviderPack(manifest, payloadBytes, Buffer.alloc(16)),
      CATALOG_ERROR_CODES.payloadKeyUnavailable
    )
  })

  it('rejects a tampered authentication tag that the manifest still commits to', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    // The tag is flipped before signing, so the digest and signature are valid and only AEAD fails.
    const { manifest, payloadBytes, payloadKey } = signedVoiceFixture({ tamperAuthTag: true })

    expectCode(
      () => verifier.verifyVoiceProviderPack(manifest, payloadBytes, payloadKey),
      CATALOG_ERROR_CODES.payloadDecryptFailed
    )
  })

  it('rejects an envelope whose key id disagrees with the signed manifest', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    const { manifest, payloadBytes, payloadKey } = signedVoiceFixture({
      manifest: { payloadEncryption: { algorithm: 'aes-256-gcm', keyId: 'voice-key-v2' } }
    })

    expectCode(
      () => verifier.verifyVoiceProviderPack(manifest, payloadBytes, payloadKey),
      CATALOG_ERROR_CODES.payloadEnvelopeInvalid
    )
  })

  it('rejects a payload encrypted under a different AAD identity than the signed manifest', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    // The AAD binds the manifest identity; encrypting under a different createdAt must not verify.
    const { manifest, payloadBytes, payloadKey } = signedVoiceFixture({
      encryptionIdentity: { createdAt: '2026-07-16T00:00:00.000Z' }
    })

    expectCode(
      () => verifier.verifyVoiceProviderPack(manifest, payloadBytes, payloadKey),
      CATALOG_ERROR_CODES.payloadDecryptFailed
    )
  })

  it('requires encryption metadata on a voice-provider manifest', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    const { manifest, payloadBytes, payloadKey } = signedVoiceFixture({
      manifest: { payloadEncryption: undefined }
    })

    expectCode(
      () => verifier.verifyVoiceProviderPack(manifest, payloadBytes, payloadKey),
      CATALOG_ERROR_CODES.payloadEncryptionRequired
    )
  })

  it('binds the encryption metadata into the manifest signature', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    const { manifest, payloadBytes, payloadKey } = signedVoiceFixture()
    // Re-keying the encryption metadata without re-signing must invalidate the signature.
    const rekeyed: CatalogManifestV1 = {
      ...manifest,
      payloadEncryption: { algorithm: 'aes-256-gcm', keyId: 'voice-key-v2' }
    }

    expectCode(
      () => verifier.verifyVoiceProviderPack(rekeyed, payloadBytes, payloadKey),
      CATALOG_ERROR_CODES.signatureInvalid
    )
  })

  it('rejects a manifest signed by an untrusted key with signatureInvalid', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    const fixture = signedVoiceFixture({ privateKey: otherKeys.privateKey })

    expectCode(
      () =>
        verifier.verifyVoiceProviderPack(
          fixture.manifest,
          fixture.payloadBytes,
          fixture.payloadKey
        ),
      CATALOG_ERROR_CODES.signatureInvalid
    )
  })

  it('rejects a manifest whose type is not voice-provider with typeUnsupported', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    // A non-voice-provider manifest cannot carry payload encryption metadata at all.
    const fixture = signedVoiceFixture({
      manifest: { type: 'domain-lexicon', payloadEncryption: undefined }
    })

    expectCode(
      () =>
        verifier.verifyVoiceProviderPack(
          fixture.manifest,
          fixture.payloadBytes,
          fixture.payloadKey
        ),
      CATALOG_ERROR_CODES.typeUnsupported
    )
  })

  it('rejects a provider count that disagrees with the signed manifest with packInvalid', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    const fixture = signedVoiceFixture({ manifest: { entryCount: 2 } })

    expectCode(
      () =>
        verifier.verifyVoiceProviderPack(
          fixture.manifest,
          fixture.payloadBytes,
          fixture.payloadKey
        ),
      CATALOG_ERROR_CODES.packInvalid
    )
  })

  it('rejects an expired pack with packExpired', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    // The canonical serializer refuses to emit an expired pack, so the sealed plaintext is raw JSON.
    const plaintextBytes = encoder.encode(
      JSON.stringify(validVoicePack({ expiry: '2020-01-01T00:00:00.000Z' }))
    )
    const fixture = signedVoiceFixture({ plaintextBytes })

    expectCode(
      () =>
        verifier.verifyVoiceProviderPack(
          fixture.manifest,
          fixture.payloadBytes,
          fixture.payloadKey
        ),
      CATALOG_ERROR_CODES.packExpired
    )
  })

  it('rejects a decrypted payload that is not a voice-provider document with packInvalid', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    const fixture = signedVoiceFixture({
      plaintextBytes: encoder.encode('{"not":"a voice provider pack"}')
    })

    expectCode(
      () =>
        verifier.verifyVoiceProviderPack(
          fixture.manifest,
          fixture.payloadBytes,
          fixture.payloadKey
        ),
      CATALOG_ERROR_CODES.packInvalid
    )
  })

  it('rejects an envelope over the supported byte bound with payloadTooLarge', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    const fixture = signedVoiceFixture()
    // The signed manifest cannot declare more than the bound, so hand the verifier an oversized
    // payload: the byte-length guard must fire before the length/digest comparison.
    const oversized = new Uint8Array(CATALOG_MAX_PACK_BYTES + 1)
    oversized.set(fixture.payloadBytes)
    oversized.fill(0x20, fixture.payloadBytes.byteLength)

    expectCode(
      () => verifier.verifyVoiceProviderPack(fixture.manifest, oversized, fixture.payloadKey),
      CATALOG_ERROR_CODES.payloadTooLarge
    )
  })
})
