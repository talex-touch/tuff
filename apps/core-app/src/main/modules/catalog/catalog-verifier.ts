import {
  CATALOG_ERROR_CODES,
  CATALOG_MAX_PACK_BYTES,
  CatalogContractError,
  CATALOG_PAYLOAD_KEY_BYTES,
  createCatalogManifestSigningPayload,
  createCatalogPayloadEncryptionAad,
  DomainLexiconRegistry,
  normalizeCatalogManifest,
  parseCatalogManifestBytes,
  parseDomainLexiconCatalogPackBytes,
  parseCatalogEncryptedPayloadEnvelopeBytes,
  parseVoiceProviderCatalogPackBytes,
  VoiceProviderRegistry,
  type AppLocale,
  type CatalogManifestV1,
  type CatalogPayloadEncryptionContext,
  type DomainLexiconEntry,
  type VoiceProviderDescriptorV1,
  type VoiceProviderPackV1
} from '@talex-touch/utils/i18n'
import { Buffer } from 'node:buffer'
import {
  createDecipheriv,
  createHash,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
  type KeyObject
} from 'node:crypto'

const verifiedPackBrand: unique symbol = Symbol('VerifiedDomainLexiconPack')
const verifiedVoiceProviderBrand: unique symbol = Symbol('VerifiedVoiceProviderPack')

export type VerifiedCatalogManifest = Omit<CatalogManifestV1, 'signature'>

export interface VerifiedDomainLexiconPack {
  readonly [verifiedPackBrand]: true
  readonly manifest: VerifiedCatalogManifest
  readonly source: 'remote'
  readonly signatureStatus: 'verified'
  readonly entries: readonly DomainLexiconEntry[]
  readonly registry: DomainLexiconRegistry
}

export interface VerifiedVoiceProviderPack {
  readonly [verifiedVoiceProviderBrand]: true
  readonly type: 'voice-provider'
  readonly manifest: VerifiedCatalogManifest
  readonly source: 'remote'
  readonly signatureStatus: 'verified'
  readonly pack: VoiceProviderPackV1
  readonly providers: readonly VoiceProviderDescriptorV1[]
  readonly registry: VoiceProviderRegistry
}

export type VerifiedCatalogPack = VerifiedDomainLexiconPack | VerifiedVoiceProviderPack

export interface CatalogVerifierDependencies {
  publicKeyPem: string | Buffer
}

export interface CatalogVerifier {
  verifyManifest(manifestBytes: Uint8Array): CatalogManifestV1
  verifyPack(manifest: CatalogManifestV1, payloadBytes: Uint8Array): VerifiedDomainLexiconPack
}

export interface VoiceProviderCatalogVerifier {
  verifyVoiceProviderPack(
    manifest: CatalogManifestV1,
    payloadBytes: Uint8Array,
    payloadKey: Uint8Array
  ): VerifiedVoiceProviderPack
}

export class PinnedCatalogVerifier implements CatalogVerifier, VoiceProviderCatalogVerifier {
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
    const normalizedManifest = this.verifySignedPayload(manifest, payloadBytes)
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

  verifyVoiceProviderPack(
    manifest: CatalogManifestV1,
    payloadBytes: Uint8Array,
    payloadKey: Uint8Array
  ): VerifiedVoiceProviderPack {
    const normalizedManifest = this.verifySignedPayload(manifest, payloadBytes)
    if (normalizedManifest.type !== 'voice-provider') {
      throw new CatalogContractError(
        CATALOG_ERROR_CODES.typeUnsupported,
        'Catalog manifest is not a voice provider pack'
      )
    }
    const payloadEncryption = normalizedManifest.payloadEncryption
    if (!payloadEncryption) {
      throw new CatalogContractError(
        CATALOG_ERROR_CODES.payloadEncryptionRequired,
        'Voice provider catalog payload must be encrypted'
      )
    }

    const envelope = parseCatalogEncryptedPayloadEnvelopeBytes(payloadBytes)
    if (
      envelope.algorithm !== payloadEncryption.algorithm ||
      envelope.keyId !== payloadEncryption.keyId
    ) {
      throw new CatalogContractError(
        CATALOG_ERROR_CODES.payloadEnvelopeInvalid,
        'Catalog payload envelope does not match its manifest'
      )
    }

    const key = Buffer.from(payloadKey)
    const nonce = Buffer.from(envelope.nonce, 'base64')
    const authTag = Buffer.from(envelope.authTag, 'base64')
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64')
    let plaintext: Buffer | null = null
    try {
      if (key.byteLength !== CATALOG_PAYLOAD_KEY_BYTES) {
        throw new CatalogContractError(
          CATALOG_ERROR_CODES.payloadKeyUnavailable,
          'Catalog payload key is invalid'
        )
      }
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
          authTagLength: authTag.byteLength
        })
        const encryptionContext: CatalogPayloadEncryptionContext = {
          contractVersion: normalizedManifest.contractVersion,
          type: normalizedManifest.type,
          packId: normalizedManifest.packId,
          version: normalizedManifest.version,
          schemaVersion: normalizedManifest.schemaVersion,
          createdAt: normalizedManifest.createdAt,
          payloadEncryption
        }
        decipher.setAAD(createCatalogPayloadEncryptionAad(encryptionContext))
        decipher.setAuthTag(authTag)
        plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
      } catch (error) {
        if (error instanceof CatalogContractError) throw error
        throw new CatalogContractError(
          CATALOG_ERROR_CODES.payloadDecryptFailed,
          'Catalog payload decryption failed'
        )
      }
      if (plaintext.byteLength > CATALOG_MAX_PACK_BYTES) {
        throw new CatalogContractError(
          CATALOG_ERROR_CODES.payloadTooLarge,
          'Catalog decrypted payload exceeds the supported byte limit'
        )
      }

      const pack = parseVoiceProviderCatalogPackBytes(plaintext)
      if (
        pack.contractVersion !== normalizedManifest.contractVersion ||
        pack.type !== normalizedManifest.type ||
        pack.packId !== normalizedManifest.packId ||
        pack.version !== normalizedManifest.version ||
        pack.schemaVersion !== normalizedManifest.schemaVersion ||
        pack.createdAt !== normalizedManifest.createdAt ||
        pack.providers.length !== normalizedManifest.entryCount
      ) {
        throw new CatalogContractError(
          CATALOG_ERROR_CODES.packInvalid,
          'Catalog pack does not match its signed manifest'
        )
      }

      const providers = Object.freeze([...pack.providers])
      let registry: VoiceProviderRegistry
      try {
        registry = new VoiceProviderRegistry(pack)
      } catch {
        throw new CatalogContractError(
          CATALOG_ERROR_CODES.packInvalid,
          'Catalog voice providers failed registry validation'
        )
      }

      return Object.freeze({
        [verifiedVoiceProviderBrand]: true as const,
        type: 'voice-provider' as const,
        manifest: toVerifiedManifest(normalizedManifest),
        source: 'remote' as const,
        signatureStatus: 'verified' as const,
        pack,
        providers,
        registry
      })
    } finally {
      key.fill(0)
      nonce.fill(0)
      authTag.fill(0)
      ciphertext.fill(0)
      plaintext?.fill(0)
    }
  }

  private verifySignedPayload(
    manifest: CatalogManifestV1,
    payloadBytes: Uint8Array
  ): CatalogManifestV1 {
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
    return normalizedManifest
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
    ...(manifest.payloadEncryption ? { payloadEncryption: manifest.payloadEncryption } : {}),
    signatureAlgorithm: manifest.signatureAlgorithm,
    keyId: manifest.keyId
  })
}
