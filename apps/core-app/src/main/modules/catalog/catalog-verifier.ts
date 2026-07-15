import {
  CATALOG_ERROR_CODES,
  CATALOG_MAX_PACK_BYTES,
  CatalogContractError,
  createCatalogManifestSigningPayload,
  DomainLexiconRegistry,
  normalizeCatalogManifest,
  parseCatalogManifestBytes,
  parseDomainLexiconCatalogPackBytes,
  type AppLocale,
  type CatalogManifestV1,
  type DomainLexiconEntry
} from '@talex-touch/utils/i18n'
import {
  createHash,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
  type KeyObject
} from 'node:crypto'

const verifiedPackBrand: unique symbol = Symbol('VerifiedDomainLexiconPack')

export type VerifiedCatalogManifest = Omit<CatalogManifestV1, 'signature'>

export interface VerifiedDomainLexiconPack {
  readonly [verifiedPackBrand]: true
  readonly manifest: VerifiedCatalogManifest
  readonly source: 'remote'
  readonly signatureStatus: 'verified'
  readonly entries: readonly DomainLexiconEntry[]
  readonly registry: DomainLexiconRegistry
}

export interface CatalogVerifierDependencies {
  publicKeyPem: string | Buffer
}

export interface CatalogVerifier {
  verifyManifest(manifestBytes: Uint8Array): CatalogManifestV1
  verifyPack(manifest: CatalogManifestV1, payloadBytes: Uint8Array): VerifiedDomainLexiconPack
}

export class PinnedCatalogVerifier implements CatalogVerifier {
  private readonly publicKey: KeyObject

  constructor(dependencies: CatalogVerifierDependencies) {
    try {
      this.publicKey = createPublicKey(dependencies.publicKeyPem)
      if (this.publicKey.asymmetricKeyType !== 'rsa') {
        throw new Error('Catalog trust root must be RSA')
      }
    } catch {
      throw new CatalogContractError(
        CATALOG_ERROR_CODES.trustRootUnavailable,
        'Catalog trust root is unavailable'
      )
    }
  }

  verifyManifest(manifestBytes: Uint8Array): CatalogManifestV1 {
    const manifest = parseCatalogManifestBytes(manifestBytes)
    this.verifyNormalizedManifestSignature(manifest)
    return manifest
  }

  verifyPack(manifest: CatalogManifestV1, payloadBytes: Uint8Array): VerifiedDomainLexiconPack {
    const normalizedManifest = normalizeCatalogManifest(manifest)
    this.verifyNormalizedManifestSignature(normalizedManifest)

    if (payloadBytes.byteLength > CATALOG_MAX_PACK_BYTES) {
      throw new CatalogContractError(
        CATALOG_ERROR_CODES.payloadTooLarge,
        'Catalog payload exceeds the supported byte limit'
      )
    }
    if (payloadBytes.byteLength !== normalizedManifest.payloadBytes) {
      throw new CatalogContractError(
        CATALOG_ERROR_CODES.hashMismatch,
        'Catalog payload byte length does not match its manifest'
      )
    }

    this.verifyPayloadDigest(normalizedManifest.payloadSha256, payloadBytes)
    const pack = parseDomainLexiconCatalogPackBytes(payloadBytes)
    this.assertManifestMatchesPack(normalizedManifest, pack)

    const provenance: DomainLexiconEntry['source'] = `catalog:${normalizedManifest.packId}@${normalizedManifest.version}`
    const entries = Object.freeze(
      pack.entries.map((entry) =>
        Object.freeze({
          ...entry,
          source: provenance,
          version: normalizedManifest.version
        })
      )
    )

    let registry: DomainLexiconRegistry
    try {
      registry = new DomainLexiconRegistry(entries)
    } catch {
      throw new CatalogContractError(
        CATALOG_ERROR_CODES.packInvalid,
        'Catalog entries failed registry validation'
      )
    }

    return Object.freeze({
      [verifiedPackBrand]: true as const,
      manifest: toVerifiedManifest(normalizedManifest),
      source: 'remote' as const,
      signatureStatus: 'verified' as const,
      entries,
      registry
    })
  }

  private verifyNormalizedManifestSignature(manifest: CatalogManifestV1): void {
    let valid = false
    try {
      valid = verifySignature(
        'RSA-SHA256',
        createCatalogManifestSigningPayload(manifest),
        this.publicKey,
        Buffer.from(manifest.signature, 'base64')
      )
    } catch {
      valid = false
    }

    if (!valid) {
      throw new CatalogContractError(
        CATALOG_ERROR_CODES.signatureInvalid,
        'Catalog manifest signature is invalid'
      )
    }
  }

  private verifyPayloadDigest(expectedHex: string, payloadBytes: Uint8Array): void {
    const actual = createHash('sha256').update(payloadBytes).digest()
    const expected = Buffer.from(expectedHex, 'hex')
    if (!timingSafeEqual(actual, expected)) {
      throw new CatalogContractError(
        CATALOG_ERROR_CODES.hashMismatch,
        'Catalog payload digest does not match its manifest'
      )
    }
  }

  private assertManifestMatchesPack(
    manifest: CatalogManifestV1,
    pack: ReturnType<typeof parseDomainLexiconCatalogPackBytes>
  ): void {
    if (
      pack.contractVersion !== manifest.contractVersion ||
      pack.type !== manifest.type ||
      pack.packId !== manifest.packId ||
      pack.version !== manifest.version ||
      pack.schemaVersion !== manifest.schemaVersion ||
      pack.createdAt !== manifest.createdAt ||
      pack.entries.length !== manifest.entryCount ||
      !sameLocales(pack.locales, manifest.locales)
    ) {
      throw new CatalogContractError(
        CATALOG_ERROR_CODES.packInvalid,
        'Catalog pack does not match its signed manifest'
      )
    }
  }
}

function sameLocales(left: readonly AppLocale[], right: readonly AppLocale[]): boolean {
  return left.length === right.length && left.every((locale, index) => locale === right[index])
}

function toVerifiedManifest(manifest: CatalogManifestV1): VerifiedCatalogManifest {
  return Object.freeze({
    contractVersion: manifest.contractVersion,
    type: manifest.type,
    packId: manifest.packId,
    version: manifest.version,
    schemaVersion: manifest.schemaVersion,
    createdAt: manifest.createdAt,
    minSdkapi: manifest.minSdkapi,
    locales: manifest.locales,
    entryCount: manifest.entryCount,
    payloadBytes: manifest.payloadBytes,
    payloadSha256: manifest.payloadSha256,
    signatureAlgorithm: manifest.signatureAlgorithm,
    keyId: manifest.keyId
  })
}
