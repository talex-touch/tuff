import type { CatalogManifestV1, CatalogPayloadEncryptionContext } from '../packages/utils/i18n/catalog.ts'
import type { VoiceProviderPackV1 } from '../packages/utils/i18n/voice-provider-catalog.ts'
import type { BuiltVoiceProviderCatalog } from './build-voice-provider-catalog.ts'
import {
  createDecipheriv,
  createHash,
  generateKeyPairSync,
  verify as verifyBytes,
} from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createCatalogManifestSigningPayload,
  createCatalogPayloadEncryptionAad,
  parseCatalogEncryptedPayloadEnvelopeBytes,
  parseCatalogManifestBytes,
} from '../packages/utils/i18n/catalog.ts'
import {
  parseVoiceProviderCatalogPackBytes,
  serializeVoiceProviderCatalogPack,
} from '../packages/utils/i18n/voice-provider-catalog.ts'
import {
  buildVoiceProviderCatalog,

  readPayloadEncryptionKey,
  writeVoiceProviderCatalog,
} from './build-voice-provider-catalog.ts'

/**
 * The builder signs with a release RSA key whose public half is pinned by the client. Tests generate
 * a throwaway pair instead of committing key material, and a fixed AES key + nonce so the ciphertext
 * is reproducible enough to assert on.
 */
const { privateKey: pinnedPrivateKey, publicKey: pinnedPublicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
})
const PRIVATE_KEY_PEM = pinnedPrivateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const PUBLIC_KEY_PEM = pinnedPublicKey.export({ type: 'spki', format: 'pem' }) as string
const PRIVATE_KEY_BODY = PRIVATE_KEY_PEM.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')

const AES_KEY = new Uint8Array(32).fill(0x2A)
const AES_KEY_BASE64 = Buffer.from(AES_KEY).toString('base64')
const AES_KEY_HEX = Buffer.from(AES_KEY).toString('hex')
const NONCE = new Uint8Array(12).fill(0x5C)
const KEY_ID = 'payload-2026-07'
const CREATED_AT = '2026-07-15T00:00:00.000Z'
const CANARY = 'canary-b9134f'

const decoder = new TextDecoder()

function voicePack(overrides: Record<string, unknown> = {}): unknown {
  return {
    contractVersion: 1,
    type: 'voice-provider',
    packId: 'official.voice-provider',
    version: '1',
    schemaVersion: 1,
    createdAt: CREATED_AT,
    minSdkApi: 260713,
    providers: [
      {
        id: 'nexus.default',
        displayName: {
          default: 'Nexus',
          locales: { 'zh-CN': 'Nexus 语音', 'en-US': 'Nexus' },
        },
        protocol: 'dashscope-qwen-asr-realtime',
        transport: 'http-upload',
        endpoint: {
          baseUrl: `https://${CANARY}.example.test`,
          submitPath: '/api/v1/ai/audio/transcribe',
          pollPath: '/api/v1/ai/audio/transcriptions/:requestId',
        },
        auth: { mode: 'nexus-session' },
        request: {
          body: 'raw-bytes',
          contentTypePolicy: 'audio/*',
          headers: { 'x-idempotency-key': 'true' },
          idempotencyHeader: 'x-idempotency-key',
        },
        models: [{ id: 'nexus.audio.transcribe', label: 'Nexus ASR', languages: ['zh-CN'] }],
        limits: { maxBytes: 20 * 1024 * 1024, maxDurationSec: 600, timeoutMs: 600_000 },
      },
    ],
    ...overrides,
  }
}

function canonicalPackBytes(pack: unknown): Uint8Array {
  return serializeVoiceProviderCatalogPack(pack as VoiceProviderPackV1)
}

function buildFixture(
  overrides: Partial<Parameters<typeof buildVoiceProviderCatalog>[0]> = {},
): BuiltVoiceProviderCatalog {
  return buildVoiceProviderCatalog({
    pack: voicePack(),
    privateKeyPem: PRIVATE_KEY_PEM,
    publicKeyPem: PUBLIC_KEY_PEM,
    encryptionKey: AES_KEY,
    encryptionKeyId: KEY_ID,
    nonce: NONCE,
    ...overrides,
  })
}

function manifestAad(
  built: BuiltVoiceProviderCatalog,
  overrides: Partial<CatalogPayloadEncryptionContext> = {},
): Uint8Array {
  const payloadEncryption = built.manifest.payloadEncryption
  if (!payloadEncryption)
    throw new Error('built manifest is missing payloadEncryption')
  return createCatalogPayloadEncryptionAad({
    contractVersion: 1,
    type: 'voice-provider',
    packId: built.manifest.packId,
    version: built.manifest.version,
    schemaVersion: 1,
    createdAt: built.manifest.createdAt,
    payloadEncryption,
    ...overrides,
  })
}

function decryptPayload(
  built: BuiltVoiceProviderCatalog,
  options: { key?: Uint8Array, aad?: Uint8Array, authTag?: Uint8Array } = {},
): string {
  const envelope = parseCatalogEncryptedPayloadEnvelopeBytes(built.payloadBytes)
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(options.key ?? AES_KEY),
    Buffer.from(envelope.nonce, 'base64'),
    { authTagLength: 16 },
  )
  decipher.setAAD(options.aad ?? manifestAad(built))
  decipher.setAuthTag(Buffer.from(options.authTag ?? Buffer.from(envelope.authTag, 'base64')))
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

const temporaryDirectories: string[] = []

async function makeTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('voice provider catalog builder', () => {
  it('emits only an envelope whose ciphertext never carries the plaintext pack, endpoint, or canary', () => {
    const built = buildFixture()
    const payloadText = decoder.decode(built.payloadBytes)
    const envelope = parseCatalogEncryptedPayloadEnvelopeBytes(built.payloadBytes)

    expect(Object.keys(JSON.parse(payloadText) as object).sort()).toEqual([
      'algorithm',
      'authTag',
      'ciphertext',
      'keyId',
      'nonce',
      'version',
    ])

    const ciphertext = Buffer.from(envelope.ciphertext, 'base64')
    for (const marker of [CANARY, 'api/v1/ai/audio/transcribe', 'x-idempotency-key', 'Nexus ASR']) {
      expect(ciphertext.includes(Buffer.from(marker)), `${marker} must stay encrypted`).toBe(false)
    }
  })

  it('decrypts with the shared AAD back to the canonical voice pack projection', () => {
    const built = buildFixture()

    expect(decryptPayload(built)).toBe(decoder.decode(canonicalPackBytes(voicePack())))
    expect(parseVoiceProviderCatalogPackBytes(new TextEncoder().encode(decryptPayload(built)))).toEqual(
      parseVoiceProviderCatalogPackBytes(canonicalPackBytes(voicePack())),
    )
  })

  it('honors the createdAt override and binds it into the AAD and plaintext', () => {
    const override = '2026-08-01T00:00:00.000Z'
    const built = buildFixture({ createdAt: override })

    expect(built.manifest.createdAt).toBe(override)
    expect(decryptPayload(built)).toBe(
      decoder.decode(canonicalPackBytes(voicePack({ createdAt: override }))),
    )
  })

  it('fails closed on a wrong key, wrong AAD, and a tampered authentication tag', () => {
    const built = buildFixture()
    const envelope = parseCatalogEncryptedPayloadEnvelopeBytes(built.payloadBytes)

    expect(() => decryptPayload(built, { key: new Uint8Array(32).fill(0x2B) })).toThrow()
    expect(() =>
      decryptPayload(built, { aad: manifestAad(built, { packId: 'official.voice-provider.alt' }) }),
    ).toThrow()
    expect(() =>
      decryptPayload(built, { aad: manifestAad(built, { version: '2' }) }),
    ).toThrow()
    expect(() =>
      decryptPayload(built, {
        authTag: Buffer.from(envelope.authTag, 'base64').reverse(),
      }),
    ).toThrow()
  })

  it('binds the ciphertext digest and encryption metadata into the signed manifest', () => {
    const built = buildFixture()

    expect(built.manifest.payloadSha256).toBe(
      createHash('sha256').update(built.payloadBytes).digest('hex'),
    )
    expect(built.manifest.payloadBytes).toBe(built.payloadBytes.byteLength)
    expect(built.manifest.payloadEncryption).toEqual({ algorithm: 'aes-256-gcm', keyId: KEY_ID })

    const payloadEncryption = built.manifest.payloadEncryption
    if (!payloadEncryption)
      throw new Error('built manifest is missing payloadEncryption')
    const envelope = parseCatalogEncryptedPayloadEnvelopeBytes(built.payloadBytes)
    expect(envelope.keyId).toBe(payloadEncryption.keyId)

    const signature = Buffer.from(built.manifest.signature, 'base64')
    expect(
      verifyBytes(
        'RSA-SHA256',
        createCatalogManifestSigningPayload(built.manifest),
        PUBLIC_KEY_PEM,
        signature,
      ),
    ).toBe(true)

    const reparsed = parseCatalogManifestBytes(built.manifestBytes)
    expect(reparsed.signature).toBe(built.manifest.signature)
    expect(
      verifyBytes(
        'RSA-SHA256',
        createCatalogManifestSigningPayload(reparsed),
        PUBLIC_KEY_PEM,
        Buffer.from(reparsed.signature, 'base64'),
      ),
    ).toBe(true)

    const mutations: Array<[string, CatalogManifestV1]> = [
      [
        'key id',
        {
          ...built.manifest,
          payloadEncryption: { algorithm: 'aes-256-gcm', keyId: 'payload-2026-08' },
        },
      ],
      ['payload digest', { ...built.manifest, payloadSha256: 'f'.repeat(64) }],
      ['entry count', { ...built.manifest, entryCount: built.manifest.entryCount + 1 }],
    ]
    for (const [label, mutated] of mutations) {
      expect(
        verifyBytes(
          'RSA-SHA256',
          createCatalogManifestSigningPayload(mutated),
          PUBLIC_KEY_PEM,
          signature,
        ),
        `${label} must invalidate the signature`,
      ).toBe(false)
    }
  })

  it('refuses to sign with a private key that does not match the pinned public key', () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 })

    expect(() =>
      buildFixture({
        privateKeyPem: other.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
      }),
    ).toThrow(/does not match the pinned public key/)
  })

  it('produces identical artifacts for a fixed key and nonce, and a fresh nonce when omitted', () => {
    const first = buildFixture()
    const second = buildFixture()
    expect(first.payloadBytes).toEqual(second.payloadBytes)
    expect(first.manifest.signature).toBe(second.manifest.signature)

    const randomA = buildFixture({ nonce: undefined })
    const randomB = buildFixture({ nonce: undefined })
    const envelopeA = parseCatalogEncryptedPayloadEnvelopeBytes(randomA.payloadBytes)
    const envelopeB = parseCatalogEncryptedPayloadEnvelopeBytes(randomB.payloadBytes)
    expect(envelopeA.nonce).not.toBe(envelopeB.nonce)
    expect(envelopeA.ciphertext).not.toBe(envelopeB.ciphertext)
    expect(decryptPayload(randomA)).toBe(decryptPayload(randomB))
  })

  it('fails closed when the payload key is missing, malformed, or the wrong length', async () => {
    const directory = await makeTemporaryDirectory('voice-provider-key-')
    const malformedPath = join(directory, 'malformed.b64')
    const shortPath = join(directory, 'short.b64')
    const validPath = join(directory, 'valid.b64')
    await writeFile(malformedPath, 'not-base64!')
    await writeFile(shortPath, Buffer.alloc(16).toString('base64'))
    await writeFile(validPath, Buffer.from(AES_KEY).toString('base64'))

    const envVars = ['TUFF_CATALOG_PAYLOAD_KEY_PATH', 'TUFF_CATALOG_PAYLOAD_KEY'] as const
    const saved = envVars.map(name => [name, process.env[name]] as const)
    for (const name of envVars) delete process.env[name]
    try {
      await expect(readPayloadEncryptionKey(null)).rejects.toThrow(/is required/)
    }
    finally {
      for (const [name, value] of saved) {
        if (value === undefined)
          delete process.env[name]
        else process.env[name] = value
      }
    }

    await expect(readPayloadEncryptionKey(malformedPath)).rejects.toThrow(/Catalog payload key/)
    await expect(readPayloadEncryptionKey(shortPath)).rejects.toThrow(/Catalog payload key/)

    const key = await readPayloadEncryptionKey(validPath)
    expect(key.byteLength).toBe(32)
    expect(new Uint8Array(key)).toEqual(AES_KEY)

    expect(() => buildFixture({ encryptionKey: new Uint8Array(16) })).toThrow(/Catalog payload key/)
  })

  it('never exposes the raw AES or signing private key in the built artifacts', () => {
    const built = buildFixture()
    const combined = `${decoder.decode(built.manifestBytes)}\n${decoder.decode(built.payloadBytes)}`

    expect(combined).not.toContain(AES_KEY_BASE64)
    expect(combined).not.toContain(AES_KEY_HEX)
    expect(combined).not.toContain('PRIVATE KEY')
    expect(combined).not.toContain(PRIVATE_KEY_BODY.slice(0, 64))
    expect(combined).toContain(
      `"payloadEncryption":{"algorithm":"aes-256-gcm","keyId":"${KEY_ID}"}`,
    )

    expect(built.payloadEncryptionKeyFingerprint).toBe(
      createHash('sha256').update(AES_KEY).digest('hex'),
    )
    expect(built.publicKeyFingerprint).toBe(
      createHash('sha256')
        .update(pinnedPublicKey.export({ type: 'spki', format: 'der' }))
        .digest('hex'),
    )
    expect(built.publicKeyFingerprint).not.toBe(built.payloadEncryptionKeyFingerprint)
  })

  it('writes exactly the manifest and the key-addressed envelope, and no key material', async () => {
    const built = buildFixture()
    const outDir = await makeTemporaryDirectory('voice-provider-out-')
    const written = await writeVoiceProviderCatalog(outDir, built)

    expect(written.manifestObjectKey).toBe('catalogs/voice-provider/latest.json')
    expect(written.payloadObjectKey).toBe(
      `catalogs/voice-provider/${built.manifest.packId}/${built.manifest.version}/${built.payloadSha256}.json`,
    )

    const manifestOnDisk = await readFile(written.manifestPath)
    const payloadOnDisk = await readFile(written.payloadPath)
    expect(new Uint8Array(manifestOnDisk)).toEqual(built.manifestBytes)
    expect(new Uint8Array(payloadOnDisk)).toEqual(built.payloadBytes)

    const combined = `${manifestOnDisk.toString('utf8')}\n${payloadOnDisk.toString('utf8')}`
    expect(combined).not.toContain(AES_KEY_BASE64)
    expect(combined).not.toContain('PRIVATE KEY')
    expect(combined).not.toContain(CANARY)

    const entries = (await readdir(outDir, { recursive: true, withFileTypes: true }))
      .filter(entry => entry.isFile())
      .map(entry => join(entry.parentPath, entry.name).slice(outDir.length + 1).split('\\').join('/'))
    expect(entries.sort()).toEqual([
      'catalogs/voice-provider/latest.json',
      `catalogs/voice-provider/${built.manifest.packId}/${built.manifest.version}/${built.payloadSha256}.json`,
    ])
  })
})
