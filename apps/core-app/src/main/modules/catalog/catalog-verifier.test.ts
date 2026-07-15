import {
  CATALOG_CLIENT_SDKAPI,
  CATALOG_ERROR_CODES,
  CATALOG_MAX_MANIFEST_BYTES,
  CATALOG_MAX_PACK_BYTES,
  CatalogContractError,
  createCatalogManifestSigningPayload,
  serializeDomainLexiconCatalogPack,
  type CatalogErrorCode,
  type CatalogManifestV1,
  type DomainLexiconCatalogPackV1
} from '@talex-touch/utils/i18n'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { PinnedCatalogVerifier } from './catalog-verifier'

const encoder = new TextEncoder()
const createdAt = '2026-07-15T00:00:00.000Z'
const primaryKeys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 })

function publicPem(keys = primaryKeys): string {
  return keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
}

function validPack(
  overrides: Partial<DomainLexiconCatalogPackV1> = {}
): DomainLexiconCatalogPackV1 {
  return {
    contractVersion: 1,
    type: 'domain-lexicon',
    packId: 'official.domain-lexicon',
    version: '2026.07.15',
    schemaVersion: 1,
    createdAt,
    locales: ['zh-CN', 'en-US'],
    entries: [
      {
        id: 'unit.length.catalog-meter',
        domain: 'unit',
        labels: {
          default: 'catalog meter',
          locales: { 'zh-CN': '目录米', 'en-US': 'catalog meter' }
        },
        aliases: {
          default: ['catalog-m'],
          locales: { 'zh-CN': ['目录米'], 'en-US': ['catalog-m'] }
        },
        metadata: { category: 'length', symbol: 'cm' }
      }
    ],
    ...overrides
  }
}

function signedFixture(
  options: {
    pack?: DomainLexiconCatalogPackV1
    manifest?: Partial<CatalogManifestV1>
    privateKey?: typeof primaryKeys.privateKey
    payloadBytes?: Uint8Array
  } = {}
): {
  manifest: CatalogManifestV1
  manifestBytes: Uint8Array
  payloadBytes: Uint8Array
} {
  const pack = options.pack ?? validPack()
  const payloadBytes = options.payloadBytes ?? serializeDomainLexiconCatalogPack(pack)
  const unsigned: CatalogManifestV1 = {
    contractVersion: 1,
    type: 'domain-lexicon',
    packId: pack.packId,
    version: pack.version,
    schemaVersion: 1,
    createdAt: pack.createdAt,
    minSdkapi: CATALOG_CLIENT_SDKAPI,
    locales: ['zh-CN', 'en-US'],
    entryCount: pack.entries.length,
    payloadBytes: payloadBytes.byteLength,
    payloadSha256: createHash('sha256').update(payloadBytes).digest('hex'),
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
  const manifest = { ...unsigned, signature }
  return {
    manifest,
    manifestBytes: encoder.encode(JSON.stringify(manifest)),
    payloadBytes
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

describe('PinnedCatalogVerifier', () => {
  it('verifies a signed manifest and exact pack bytes into an opaque immutable snapshot', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    const fixture = signedFixture()

    const manifest = verifier.verifyManifest(fixture.manifestBytes)
    const verified = verifier.verifyPack(manifest, fixture.payloadBytes)

    expect(verified.source).toBe('remote')
    expect(verified.signatureStatus).toBe('verified')
    expect('signature' in verified.manifest).toBe(false)
    expect(verified.manifest.payloadSha256).toBe(fixture.manifest.payloadSha256)
    expect(verified.entries).toHaveLength(1)
    expect(verified.entries[0]).toMatchObject({
      id: 'unit.length.catalog-meter',
      source: 'catalog:official.domain-lexicon@2026.07.15',
      version: '2026.07.15'
    })
    expect(verified.registry.resolve('unit.length.catalog-meter', 'zh-CN')?.label).toBe('目录米')
    expect(Object.isFrozen(verified)).toBe(true)
    expect(Object.isFrozen(verified.entries)).toBe(true)
  })

  it('maps an invalid or non-RSA pinned trust root to a stable unavailable code', () => {
    expectCode(
      () => new PinnedCatalogVerifier({ publicKeyPem: 'not a pem' }),
      CATALOG_ERROR_CODES.trustRootUnavailable
    )

    const ed25519 = generateKeyPairSync('ed25519')
    expectCode(
      () => new PinnedCatalogVerifier({ publicKeyPem: publicPem(ed25519) }),
      CATALOG_ERROR_CODES.trustRootUnavailable
    )
  })

  it('rejects an over-limit manifest before JSON parsing', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    expectCode(
      () => verifier.verifyManifest(new Uint8Array(CATALOG_MAX_MANIFEST_BYTES + 1)),
      CATALOG_ERROR_CODES.manifestTooLarge
    )
  })

  it('rejects an altered signed field and a signature made by another key', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    const fixture = signedFixture()
    const altered = { ...fixture.manifest, version: '2026.07.16' }

    expectCode(
      () => verifier.verifyManifest(encoder.encode(JSON.stringify(altered))),
      CATALOG_ERROR_CODES.signatureInvalid
    )

    const wrongKeyFixture = signedFixture({ privateKey: otherKeys.privateKey })
    expectCode(
      () => verifier.verifyManifest(wrongKeyFixture.manifestBytes),
      CATALOG_ERROR_CODES.signatureInvalid
    )
  })

  it('re-verifies the manifest when pack verification is called directly', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    const fixture = signedFixture()

    expectCode(
      () =>
        verifier.verifyPack(
          { ...fixture.manifest, payloadSha256: '0'.repeat(64) },
          fixture.payloadBytes
        ),
      CATALOG_ERROR_CODES.signatureInvalid
    )
  })

  it('rejects over-limit, truncated, and same-size altered payload bytes before parsing', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    const fixture = signedFixture()

    expectCode(
      () => verifier.verifyPack(fixture.manifest, new Uint8Array(CATALOG_MAX_PACK_BYTES + 1)),
      CATALOG_ERROR_CODES.payloadTooLarge
    )
    expectCode(
      () => verifier.verifyPack(fixture.manifest, fixture.payloadBytes.slice(0, -1)),
      CATALOG_ERROR_CODES.hashMismatch
    )

    const altered = fixture.payloadBytes.slice()
    altered[altered.length - 2] ^= 1
    expectCode(
      () => verifier.verifyPack(fixture.manifest, altered),
      CATALOG_ERROR_CODES.hashMismatch
    )
  })

  it('rejects a hash-valid pack whose signed identity or entry count does not match', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    const identityMismatch = signedFixture({
      manifest: { packId: 'official.other-domain-lexicon' }
    })
    expectCode(
      () => verifier.verifyPack(identityMismatch.manifest, identityMismatch.payloadBytes),
      CATALOG_ERROR_CODES.packInvalid
    )

    const countMismatch = signedFixture({ manifest: { entryCount: 2 } })
    expectCode(
      () => verifier.verifyPack(countMismatch.manifest, countMismatch.payloadBytes),
      CATALOG_ERROR_CODES.packInvalid
    )
  })

  it('rejects hash-valid malformed JSON and incomplete locale coverage', () => {
    const verifier = new PinnedCatalogVerifier({ publicKeyPem: publicPem() })
    const malformed = signedFixture({ payloadBytes: encoder.encode('{') })
    expectCode(
      () => verifier.verifyPack(malformed.manifest, malformed.payloadBytes),
      CATALOG_ERROR_CODES.packInvalid
    )

    const invalidLocalePack = {
      ...validPack(),
      entries: [
        {
          ...validPack().entries[0],
          labels: {
            default: 'catalog meter',
            locales: { 'zh-CN': '目录米' }
          }
        }
      ]
    }
    const invalidLocaleBytes = encoder.encode(JSON.stringify(invalidLocalePack))
    const invalidLocale = signedFixture({ payloadBytes: invalidLocaleBytes })
    expectCode(
      () => verifier.verifyPack(invalidLocale.manifest, invalidLocale.payloadBytes),
      CATALOG_ERROR_CODES.localeUnsupported
    )
  })
})
