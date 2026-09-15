import { createClient, type Client } from '@libsql/client'
import {
  CATALOG_CLIENT_SDKAPI,
  CATALOG_ERROR_CODES,
  CATALOG_PAYLOAD_KEY_BYTES,
  CatalogContractError,
  DomainLexiconRegistry,
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
import { NetworkHttpStatusError } from '@talex-touch/utils/network'
import { createCipheriv, createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import * as schema from '../../db/schema'
import { DefaultCatalogService, type CatalogServiceLogger } from './catalog-service'
import { SqliteCatalogRepository, type BuiltinCatalogPack } from './catalog-repository'
import {
  NexusCatalogRemote,
  type CatalogPayloadKeyMaterial,
  type CatalogRemote,
  type VoiceProviderCatalogRemote
} from './catalog-remote'
import { PinnedCatalogVerifier } from './catalog-verifier'

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const verifier = new PinnedCatalogVerifier({
  publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
})
const createdAt = '2026-07-15T00:00:00.000Z'
const encoder = new TextEncoder()

let directory: string
let client: Client
let db: LibSQLDatabase<typeof schema>
let repository: SqliteCatalogRepository
let clock: number

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tuff-catalog-voice-'))
  client = createClient({ url: `file:${join(directory, 'catalog.sqlite')}` })
  await client.execute('PRAGMA foreign_keys = ON')
  await applyMigration('0026_catalog_service.sql')
  await applyMigration('0046_voice_provider_entries.sql')
  db = drizzle(client, { schema })
  clock = 1_784_077_200_000
  repository = new SqliteCatalogRepository(db, { now: () => clock++ })
})

afterEach(async () => {
  await dbWriteScheduler.drain()
  client.close()
  await rm(directory, { recursive: true, force: true })
})

async function applyMigration(file: string): Promise<void> {
  const sql = await readFile(
    new URL(`../../../../resources/db/migrations/${file}`, import.meta.url),
    'utf8'
  )
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.execute(statement)
  }
}

function voicePack(version: string): VoiceProviderPackV1 {
  return {
    contractVersion: 1,
    type: 'voice-provider',
    packId: 'official.voice-provider',
    version,
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
    ]
  }
}

const PAYLOAD_KEY = Buffer.alloc(CATALOG_PAYLOAD_KEY_BYTES, 0x5a)
const PAYLOAD_KEY_ID = 'voice-key-v1'
const PAYLOAD_NONCE = Buffer.alloc(12, 0x3c)

/** Fixed key material so ciphertext bytes, and therefore the signed digest, are reproducible. */
function payloadKeyMaterial(
  key: Buffer = PAYLOAD_KEY,
  keyId: string = PAYLOAD_KEY_ID
): CatalogPayloadKeyMaterial {
  return { keyId, keyBytes: Buffer.from(key) }
}

function sealVoiceEnvelope(
  plaintext: Uint8Array,
  context: CatalogPayloadEncryptionContext,
  key: Buffer
): CatalogEncryptedPayloadEnvelopeV1 {
  const cipher = createCipheriv('aes-256-gcm', key, PAYLOAD_NONCE, { authTagLength: 16 })
  cipher.setAAD(createCatalogPayloadEncryptionAad(context))
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    keyId: context.payloadEncryption.keyId,
    nonce: PAYLOAD_NONCE.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64')
  }
}

function signedVoiceFixture(
  pack: VoiceProviderPackV1 = voicePack('20260701'),
  privateKey: typeof keys.privateKey = keys.privateKey,
  key: Buffer = PAYLOAD_KEY
): {
  manifest: CatalogManifestV1
  payloadBytes: Uint8Array
  plaintextBytes: Uint8Array
  keyBytes: Buffer
} {
  const plaintextBytes = serializeVoiceProviderCatalogPack(pack)
  const payloadEncryption = { algorithm: 'aes-256-gcm' as const, keyId: PAYLOAD_KEY_ID }
  const envelope = sealVoiceEnvelope(
    plaintextBytes,
    {
      contractVersion: 1,
      type: 'voice-provider',
      packId: pack.packId,
      version: pack.version,
      schemaVersion: 1,
      createdAt: pack.createdAt,
      payloadEncryption
    },
    key
  )
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
    payloadEncryption,
    signatureAlgorithm: 'rsa-sha256',
    keyId: 'release-v1',
    signature: 'AA=='
  }
  return {
    manifest: {
      ...unsigned,
      signature: sign(
        'RSA-SHA256',
        createCatalogManifestSigningPayload(unsigned),
        privateKey
      ).toString('base64')
    },
    payloadBytes,
    plaintextBytes,
    keyBytes: Buffer.from(key)
  }
}

function verifyFixture(fixture: {
  manifest: CatalogManifestV1
  payloadBytes: Uint8Array
  keyBytes: Buffer
}) {
  return verifier.verifyVoiceProviderPack(fixture.manifest, fixture.payloadBytes, fixture.keyBytes)
}

function verifiedVoicePack(version: string) {
  return verifyFixture(signedVoiceFixture(voicePack(version)))
}

function signedLexiconManifestBytes(): Uint8Array {
  const payloadBytes = new Uint8Array([1])
  const unsigned: CatalogManifestV1 = {
    contractVersion: 1,
    type: 'domain-lexicon',
    packId: 'official.domain-lexicon',
    version: '20260701',
    schemaVersion: 1,
    createdAt,
    minSdkapi: CATALOG_CLIENT_SDKAPI,
    locales: ['zh-CN', 'en-US'],
    entryCount: 0,
    payloadBytes: payloadBytes.byteLength,
    payloadSha256: createHash('sha256').update(payloadBytes).digest('hex'),
    signatureAlgorithm: 'rsa-sha256',
    keyId: 'release-v1',
    signature: 'AA=='
  }
  const manifest: CatalogManifestV1 = {
    ...unsigned,
    signature: sign(
      'RSA-SHA256',
      createCatalogManifestSigningPayload(unsigned),
      keys.privateKey
    ).toString('base64')
  }
  return encoder.encode(JSON.stringify(manifest))
}

function builtinPack(): BuiltinCatalogPack {
  return {
    manifest: {
      type: 'domain-lexicon',
      packId: 'builtin.domain-lexicon',
      version: '260000',
      schemaVersion: 1,
      createdAt,
      minSdkapi: CATALOG_CLIENT_SDKAPI,
      locales: ['zh-CN', 'en-US'],
      entryCount: 0,
      payloadBytes: 0,
      payloadSha256: createHash('sha256').update('').digest('hex')
    },
    source: 'builtin',
    signatureStatus: 'builtin',
    entries: [],
    registry: new DomainLexiconRegistry([])
  }
}

async function expectCode(promise: Promise<unknown>, code: CatalogErrorCode): Promise<void> {
  try {
    await promise
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(CatalogContractError)
    expect((error as CatalogContractError).code).toBe(code)
  }
}

async function scalar(sql: string): Promise<number> {
  const result = await client.execute(sql)
  const row = result.rows[0]
  return row ? Number(Object.values(row)[0]) : -1
}

describe('SqliteCatalogRepository voice-provider', () => {
  it('imports and activates a signed pack without persisting credential headers', async () => {
    const stored = await repository.importVoiceProviderPack(verifiedVoicePack('20260701'))
    expect(stored.type).toBe('voice-provider')
    expect(stored.entryCount).toBe(1)
    expect(stored.status).toBe('ready')

    const snapshot = await repository.activateVoiceProviderPack({
      type: 'voice-provider',
      packId: stored.packId,
      version: stored.version
    })

    expect(snapshot.active.version).toBe('20260701')
    expect(snapshot.active.status).toBe('active')
    expect(snapshot.pack.providers).toHaveLength(1)
    expect(snapshot.registry.size).toBe(1)
    expect(snapshot.registry.get('bailian-paraformer')?.endpoint.baseUrl).toBe(
      'https://asr.example.com'
    )

    const rows = await client.execute('SELECT * FROM voice_provider_entries')
    expect(rows.rows).toHaveLength(1)
    const row = rows.rows[0] as Record<string, unknown>
    expect(row.headers_json).toBe('{"accept":"application/json"}')
    expect(row.auth_mode).toBe('nexus-session')
    expect(row.auth_ref).toBeNull()
    expect(JSON.stringify(rows.rows)).not.toContain('authorization')
    expect(await scalar('SELECT COUNT(*) FROM catalog_domain_lexicon_entries')).toBe(0)
  })

  it('is idempotent when the active pack is activated again', async () => {
    await repository.importVoiceProviderPack(verifiedVoicePack('20260701'))
    const ref = {
      type: 'voice-provider' as const,
      packId: 'official.voice-provider',
      version: '20260701'
    }

    const first = await repository.activateVoiceProviderPack(ref)
    const second = await repository.activateVoiceProviderPack(ref)

    expect(second.active.version).toBe(first.active.version)
    expect(second.previous).toBeNull()
    expect(await scalar("SELECT COUNT(*) FROM catalog_state WHERE type = 'voice-provider'")).toBe(1)
  })

  it('rejects an older version replay and keeps the active pack unchanged', async () => {
    await repository.importVoiceProviderPack(verifiedVoicePack('20260701'))
    await repository.importVoiceProviderPack(verifiedVoicePack('20260702'))
    const active = { type: 'voice-provider' as const, packId: 'official.voice-provider' }
    await repository.activateVoiceProviderPack({ ...active, version: '20260702' })

    await expectCode(
      repository.activateVoiceProviderPack({ ...active, version: '20260701' }),
      CATALOG_ERROR_CODES.versionConflict
    )

    const snapshot = await repository.loadVoiceProviderSnapshot()
    expect(snapshot?.active.version).toBe('20260702')
    expect(snapshot?.registry.size).toBe(1)
    expect((await repository.getVoiceProviderStatus()).active?.version).toBe('20260702')
  })

  it('rolls back to the previous voice pack and records the reason', async () => {
    await repository.importVoiceProviderPack(verifiedVoicePack('20260701'))
    await repository.importVoiceProviderPack(verifiedVoicePack('20260702'))
    const active = { type: 'voice-provider' as const, packId: 'official.voice-provider' }
    await repository.activateVoiceProviderPack({ ...active, version: '20260701' })
    await repository.activateVoiceProviderPack({ ...active, version: '20260702' })

    const rolled = await repository.rollbackVoiceProvider('manual')

    expect(rolled.active.version).toBe('20260701')
    expect(rolled.previous?.version).toBe('20260702')
    expect(rolled.rollbackReason).toBe('manual')
    expect(rolled.registry.get('bailian-paraformer')).toBeDefined()
  })

  it('refuses to roll back without a previous pack', async () => {
    await repository.importVoiceProviderPack(verifiedVoicePack('20260701'))
    await repository.activateVoiceProviderPack({
      type: 'voice-provider',
      packId: 'official.voice-provider',
      version: '20260701'
    })

    await expectCode(repository.rollbackVoiceProvider('manual'), CATALOG_ERROR_CODES.noPrevious)
  })

  it('leaves no partial rows when the provider insert fails mid-transaction', async () => {
    await client.execute(
      `CREATE TRIGGER fail_voice_entry BEFORE INSERT ON voice_provider_entries
       BEGIN SELECT RAISE(ABORT, 'boom'); END`
    )

    await expectCode(
      repository.importVoiceProviderPack(verifiedVoicePack('20260701')),
      CATALOG_ERROR_CODES.importFailed
    )

    expect(await scalar('SELECT COUNT(*) FROM catalog_packs')).toBe(0)
    expect(await scalar('SELECT COUNT(*) FROM voice_provider_entries')).toBe(0)
  })
})

describe('DefaultCatalogService voice-provider', () => {
  function createService(
    remote: CatalogRemote,
    options: { voiceRemote?: VoiceProviderCatalogRemote; logger?: CatalogServiceLogger } = {}
  ) {
    const fixture = signedVoiceFixture()
    return new DefaultCatalogService({
      repository,
      remote,
      verifier,
      baseline: builtinPack(),
      voiceRepository: repository,
      voiceVerifier: verifier,
      voiceRemote: options.voiceRemote ?? {
        fetchVoiceProviderPayloadKey: async () => payloadKeyMaterial(fixture.keyBytes)
      },
      clock: () => clock++,
      ...(options.logger ? { logger: options.logger } : {})
    })
  }

  it('keeps the active registry when a tampered or forged download is rejected', async () => {
    const fixture = signedVoiceFixture()
    const good = verifyFixture(fixture)
    const pack = voicePack('20260701')
    let bytes = Uint8Array.from(fixture.payloadBytes)
    const service = createService({
      fetchLatestManifest: async () => null,
      fetchPack: async () => bytes
    })
    const ref = { type: 'voice-provider' as const, packId: pack.packId, version: pack.version }

    await service.importVoiceProviderPack(good)
    await service.activateVoiceProviderPack(ref)
    const activeRegistry = service.getVoiceProviderRegistry()
    expect(activeRegistry?.get('bailian-paraformer')).toBeDefined()

    // Same-length tamper: the digest no longer matches the signed manifest.
    bytes = Uint8Array.from(bytes)
    bytes[10] = bytes[10] ^ 0x20
    await expectCode(
      service.downloadVoiceProviderPack(fixture.manifest),
      CATALOG_ERROR_CODES.hashMismatch
    )
    expect(service.getVoiceProviderRegistry()).toBe(activeRegistry)
    expect(service.getVoiceProviderStatus().active?.version).toBe('20260701')
    expect(service.getVoiceProviderStatus().lastErrorCode).toBe(CATALOG_ERROR_CODES.hashMismatch)

    // A manifest signed by an untrusted key is refused before any byte is trusted.
    const forged = signedVoiceFixture(pack, otherKeys.privateKey)
    await expectCode(
      service.downloadVoiceProviderPack(forged.manifest),
      CATALOG_ERROR_CODES.signatureInvalid
    )
    expect(service.getVoiceProviderRegistry()).toBe(activeRegistry)
    expect(activeRegistry?.get('bailian-paraformer')?.models[0]?.id).toBe('paraformer-v2')
  })

  it('fails the download when the content-addressed artifact is withdrawn and keeps the active identity', async () => {
    const fixture = signedVoiceFixture()
    const good = verifyFixture(fixture)
    const remote = new NexusCatalogRemote({
      network: {
        requestStream: async () => {
          throw new NetworkHttpStatusError(404, 'Not Found', 'https://nexus.example.test/withdrawn')
        }
      },
      resolveBaseUrl: () => 'https://nexus.example.test'
    })
    const service = createService(remote)
    const ref = {
      type: 'voice-provider' as const,
      packId: 'official.voice-provider',
      version: '20260701'
    }
    await service.importVoiceProviderPack(good)
    await service.activateVoiceProviderPack(ref)
    const activeRegistry = service.getVoiceProviderRegistry()
    const stateBefore = await client.execute(
      "SELECT * FROM catalog_state WHERE type = 'voice-provider'"
    )

    await expectCode(
      service.downloadVoiceProviderPack(fixture.manifest),
      CATALOG_ERROR_CODES.remoteMissing
    )

    expect(service.getVoiceProviderRegistry()).toBe(activeRegistry)
    expect(service.getVoiceProviderStatus().active?.version).toBe('20260701')
    expect(service.getVoiceProviderStatus().lastErrorCode).toBe(CATALOG_ERROR_CODES.remoteMissing)
    const stored = await repository.getVoiceProviderStatus()
    expect(stored.active?.version).toBe('20260701')
    expect(stored.previous).toBeNull()
    expect(
      (await client.execute("SELECT * FROM catalog_state WHERE type = 'voice-provider'")).rows
    ).toEqual(stateBefore.rows)
    expect(await scalar('SELECT COUNT(*) FROM voice_provider_entries')).toBe(1)
  })

  it('rejects a latest manifest typed for another catalog before downloading any payload', async () => {
    const lexiconManifestBytes = signedLexiconManifestBytes()
    let packCalls = 0
    const service = createService({
      fetchLatestManifest: async () => lexiconManifestBytes,
      fetchPack: async () => {
        packCalls += 1
        return new Uint8Array()
      }
    })
    const fixture = signedVoiceFixture()
    const good = verifyFixture(fixture)
    const ref = {
      type: 'voice-provider' as const,
      packId: 'official.voice-provider',
      version: '20260701'
    }
    await service.importVoiceProviderPack(good)
    await service.activateVoiceProviderPack(ref)
    const activeRegistry = service.getVoiceProviderRegistry()

    await expectCode(service.checkUpdates('voice-provider'), CATALOG_ERROR_CODES.typeUnsupported)

    expect(packCalls).toBe(0)
    expect(service.getVoiceProviderRegistry()).toBe(activeRegistry)
    expect(service.getVoiceProviderStatus().active?.version).toBe('20260701')
    expect(service.getVoiceProviderStatus().lastErrorCode).toBe(CATALOG_ERROR_CODES.typeUnsupported)
    expect((await repository.getVoiceProviderStatus()).active?.version).toBe('20260701')
  })

  it('refuses an untrusted-key replacement of a newer version and persists no signing material', async () => {
    const fixture = signedVoiceFixture()
    const good = verifyFixture(fixture)
    const logs: string[] = []
    const logger: CatalogServiceLogger = {
      info: (message, context) => logs.push(`${message} ${JSON.stringify(context)}`),
      warn: (message, context) => logs.push(`${message} ${JSON.stringify(context)}`)
    }
    const service = createService(
      { fetchLatestManifest: async () => null, fetchPack: async () => fixture.payloadBytes },
      { logger }
    )
    const ref = {
      type: 'voice-provider' as const,
      packId: 'official.voice-provider',
      version: '20260701'
    }
    await service.importVoiceProviderPack(good)
    await service.activateVoiceProviderPack(ref)
    const activeRegistry = service.getVoiceProviderRegistry()

    const replacement = signedVoiceFixture(voicePack('20260702'), otherKeys.privateKey)
    await expectCode(
      service.downloadVoiceProviderPack(replacement.manifest),
      CATALOG_ERROR_CODES.signatureInvalid
    )

    expect(service.getVoiceProviderRegistry()).toBe(activeRegistry)
    expect(service.getVoiceProviderStatus().active?.version).toBe('20260701')
    expect(service.getVoiceProviderStatus().lastErrorCode).toBe(
      CATALOG_ERROR_CODES.signatureInvalid
    )
    const stored = await repository.getVoiceProviderStatus()
    expect(stored.active?.version).toBe('20260701')
    expect(stored.previous).toBeNull()
    expect(await scalar("SELECT COUNT(*) FROM catalog_packs WHERE version = '20260702'")).toBe(0)

    const persistence = JSON.stringify({
      packs: (await client.execute('SELECT * FROM catalog_packs')).rows,
      entries: (await client.execute('SELECT * FROM voice_provider_entries')).rows,
      state: (await client.execute("SELECT * FROM catalog_state WHERE type = 'voice-provider'"))
        .rows
    })
    const diagnostics = logs.join('\n')
    for (const secret of [
      replacement.manifest.signature,
      new TextDecoder().decode(replacement.payloadBytes),
      new TextDecoder().decode(replacement.plaintextBytes)
    ]) {
      expect(diagnostics).not.toContain(secret)
      expect(persistence).not.toContain(secret)
    }
  })

  it('zeroizes the fetched payload key after a successful download', async () => {
    const fixture = signedVoiceFixture()
    const keyBytes = Buffer.from(fixture.keyBytes)
    const voiceRemote: VoiceProviderCatalogRemote = {
      fetchVoiceProviderPayloadKey: async () => ({ keyId: PAYLOAD_KEY_ID, keyBytes })
    }
    const service = createService(
      { fetchLatestManifest: async () => null, fetchPack: async () => fixture.payloadBytes },
      { voiceRemote }
    )

    await service.downloadVoiceProviderPack(fixture.manifest)

    expect(keyBytes.equals(Buffer.alloc(CATALOG_PAYLOAD_KEY_BYTES))).toBe(true)
  })

  it('zeroizes the fetched payload key when verification fails', async () => {
    const fixture = signedVoiceFixture()
    const keyBytes = Buffer.from(fixture.keyBytes)
    const tampered = Uint8Array.from(fixture.payloadBytes)
    tampered[10] = tampered[10] ^ 0x20
    const voiceRemote: VoiceProviderCatalogRemote = {
      fetchVoiceProviderPayloadKey: async () => ({ keyId: PAYLOAD_KEY_ID, keyBytes })
    }
    const service = createService(
      { fetchLatestManifest: async () => null, fetchPack: async () => tampered },
      { voiceRemote }
    )

    await expectCode(
      service.downloadVoiceProviderPack(fixture.manifest),
      CATALOG_ERROR_CODES.hashMismatch
    )
    expect(keyBytes.equals(Buffer.alloc(CATALOG_PAYLOAD_KEY_BYTES))).toBe(true)
  })

  it('surfaces an unavailable authenticated key endpoint as payloadKeyUnavailable', async () => {
    const fixture = signedVoiceFixture()
    const good = verifyFixture(fixture)
    const service = createService(
      { fetchLatestManifest: async () => null, fetchPack: async () => fixture.payloadBytes },
      {
        voiceRemote: {
          fetchVoiceProviderPayloadKey: async () => {
            throw new CatalogContractError(CATALOG_ERROR_CODES.payloadKeyUnavailable, 'denied')
          }
        }
      }
    )
    const ref = {
      type: 'voice-provider' as const,
      packId: 'official.voice-provider',
      version: '20260701'
    }
    await service.importVoiceProviderPack(good)
    await service.activateVoiceProviderPack(ref)
    const activeRegistry = service.getVoiceProviderRegistry()

    await expectCode(
      service.downloadVoiceProviderPack(fixture.manifest),
      CATALOG_ERROR_CODES.payloadKeyUnavailable
    )

    expect(service.getVoiceProviderRegistry()).toBe(activeRegistry)
    expect(service.getVoiceProviderStatus().active?.version).toBe('20260701')
    expect(service.getVoiceProviderStatus().lastErrorCode).toBe(
      CATALOG_ERROR_CODES.payloadKeyUnavailable
    )
  })

  it('rejects a key returned under the wrong key id and leaves the active pack untouched', async () => {
    const fixture = signedVoiceFixture()
    const good = verifyFixture(fixture)
    const keyBytes = Buffer.from(fixture.keyBytes)
    const service = createService(
      { fetchLatestManifest: async () => null, fetchPack: async () => fixture.payloadBytes },
      {
        voiceRemote: {
          fetchVoiceProviderPayloadKey: async () => ({ keyId: 'wrong-key-v2', keyBytes })
        }
      }
    )
    const ref = {
      type: 'voice-provider' as const,
      packId: 'official.voice-provider',
      version: '20260701'
    }
    await service.importVoiceProviderPack(good)
    await service.activateVoiceProviderPack(ref)
    const activeRegistry = service.getVoiceProviderRegistry()
    const stateBefore = await client.execute(
      "SELECT * FROM catalog_state WHERE type = 'voice-provider'"
    )
    const importSpy = vi.spyOn(repository, 'importVoiceProviderPack')
    const activateSpy = vi.spyOn(repository, 'activateVoiceProviderPack')

    await expectCode(
      service.downloadVoiceProviderPack(fixture.manifest),
      CATALOG_ERROR_CODES.payloadKeyUnavailable
    )

    expect(keyBytes.equals(Buffer.alloc(CATALOG_PAYLOAD_KEY_BYTES))).toBe(true)
    expect(importSpy).not.toHaveBeenCalled()
    expect(activateSpy).not.toHaveBeenCalled()
    expect(service.getVoiceProviderRegistry()).toBe(activeRegistry)
    expect(service.getVoiceProviderStatus().active?.version).toBe('20260701')
    expect(service.getVoiceProviderStatus().lastErrorCode).toBe(
      CATALOG_ERROR_CODES.payloadKeyUnavailable
    )
    const stored = await repository.getVoiceProviderStatus()
    expect(stored.active?.version).toBe('20260701')
    expect(stored.previous).toBeNull()
    expect(
      (await client.execute("SELECT * FROM catalog_state WHERE type = 'voice-provider'")).rows
    ).toEqual(stateBefore.rows)
    expect(await scalar('SELECT COUNT(*) FROM voice_provider_entries')).toBe(1)

    importSpy.mockRestore()
    activateSpy.mockRestore()
  })
})
