#!/usr/bin/env -S npx tsx
/**
 * Build, encrypt, and sign one `voice-provider` catalog artifact set.
 *
 * Output is a versioned signed manifest plus a content-addressed payload, laid out under
 * `<out>/catalogs/voice-provider/...` so the directory can be uploaded verbatim to the object
 * storage the read-only Nexus routes project over:
 *
 *   catalogs/voice-provider/latest.json                                  (the manifest bytes)
 *   catalogs/voice-provider/<packId>/<version>/<payloadSha256>.json      (the payload bytes)
 *
 * The manifest is signed with the release RSA key whose public half is pinned by the client at
 * `apps/core-app/resources/keys/release-signing-public.pem`. The signing input is the shared
 * `createCatalogManifestSigningPayload()` — the same function `PinnedCatalogVerifier` calls —
 * so the payload cannot drift from the client's verification.
 *
 * The private key never lives in the repository. It is read from `--private-key <path>`,
 * `TUFF_CATALOG_SIGNING_PRIVATE_KEY_PATH`, or `TUFF_CATALOG_SIGNING_PRIVATE_KEY` (PEM), and the
 * build fails closed when it is absent or does not match the pinned public key.
 * The AES-256-GCM payload key is supplied independently through `--payload-key <path>`,
 * `TUFF_CATALOG_PAYLOAD_KEY_PATH`, or `TUFF_CATALOG_PAYLOAD_KEY`. Only its id and SHA-256
 * fingerprint are printed; the key must be provisioned separately into the authenticated Nexus
 * key route and never written beside the public artifact tree.
 *
 * Authoring and production storage are deferred: this step only produces bytes on disk.
 */
import type {
  CatalogManifestV1,
  CatalogPayloadEncryptionContext,
} from '../packages/utils/i18n/catalog.ts'
import type { AppLocale } from '../packages/utils/i18n/locale.ts'
import type { VoiceProviderPackV1 } from '../packages/utils/i18n/voice-provider-catalog.ts'
import { Buffer } from 'node:buffer'
import {
  createCipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign as signBytes,
  verify as verifyBytes,
} from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import * as catalogModule from '../packages/utils/i18n/catalog.ts'
import * as localeModule from '../packages/utils/i18n/locale.ts'
import * as voiceProviderModule from '../packages/utils/i18n/voice-provider-catalog.ts'
import { getArgValue } from './lib/argv-utils.mjs'

// Raw workspace TypeScript may load through `tsx` as either ESM or a CommonJS default namespace.
function runtimeModule<T>(value: unknown): T {
  const module = value as { default?: unknown }
  return (module.default ?? value) as T
}
const {
  CATALOG_CONTRACT_VERSION,
  CATALOG_PAYLOAD_AUTH_TAG_BYTES,
  CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM,
  CATALOG_PAYLOAD_ENVELOPE_VERSION,
  CATALOG_PAYLOAD_KEY_BYTES,
  CATALOG_PAYLOAD_NONCE_BYTES,
  createCatalogManifestSigningPayload,
  createCatalogPayloadEncryptionAad,
  normalizeCatalogPayloadKey,
  serializeCatalogEncryptedPayloadEnvelope,
} = runtimeModule<{
  CATALOG_CONTRACT_VERSION: 1
  CATALOG_PAYLOAD_AUTH_TAG_BYTES: number
  CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM: 'aes-256-gcm'
  CATALOG_PAYLOAD_ENVELOPE_VERSION: 1
  CATALOG_PAYLOAD_KEY_BYTES: number
  CATALOG_PAYLOAD_NONCE_BYTES: number
  createCatalogManifestSigningPayload: (manifest: CatalogManifestV1) => Uint8Array
  createCatalogPayloadEncryptionAad: (input: CatalogPayloadEncryptionContext) => Uint8Array
  normalizeCatalogPayloadKey: (value: unknown) => { key: string; keyId: string }
  serializeCatalogEncryptedPayloadEnvelope: (input: {
    version: 1
    algorithm: 'aes-256-gcm'
    keyId: string
    nonce: string
    ciphertext: string
    authTag: string
  }) => Uint8Array
}>(catalogModule)
const { APP_LOCALES } = runtimeModule<{ APP_LOCALES: readonly AppLocale[] }>(localeModule)
const { parseVoiceProviderCatalogPackBytes, serializeVoiceProviderCatalogPack } = runtimeModule<{
  parseVoiceProviderCatalogPackBytes: (bytes: Uint8Array) => VoiceProviderPackV1
  serializeVoiceProviderCatalogPack: (pack: VoiceProviderPackV1) => Uint8Array
}>(voiceProviderModule)

export const DEFAULT_CATALOG_PUBLIC_KEY_PATH = 'apps/core-app/resources/keys/release-signing-public.pem'

const PRIVATE_KEY_PATH_ENV = 'TUFF_CATALOG_SIGNING_PRIVATE_KEY_PATH'
const PRIVATE_KEY_PEM_ENV = 'TUFF_CATALOG_SIGNING_PRIVATE_KEY'
const PAYLOAD_KEY_PATH_ENV = 'TUFF_CATALOG_PAYLOAD_KEY_PATH'
const PAYLOAD_KEY_BASE64_ENV = 'TUFF_CATALOG_PAYLOAD_KEY'
const PAYLOAD_KEY_ID_ENV = 'TUFF_CATALOG_PAYLOAD_KEY_ID'

/**
 * The signing input excludes `signature`, but the shared normalizer still validates the field,
 * so it must hold syntactically valid base64 while the real signature is computed.
 */
const MANIFEST_SIGNATURE_PLACEHOLDER = 'AA=='

export interface BuildVoiceProviderCatalogInput {
  pack: unknown
  privateKeyPem: string
  publicKeyPem: string
  /** ISO-8601 ms override; defaults to the pack's own `createdAt`. */
  createdAt?: string
  encryptionKey: Uint8Array
  encryptionKeyId: string
  /** Deterministic test seam. Production must omit this and use a random nonce. */
  nonce?: Uint8Array
}

export interface BuiltVoiceProviderCatalog {
  manifest: CatalogManifestV1
  manifestBytes: Uint8Array
  payloadBytes: Uint8Array
  payloadSha256: string
  publicKeyFingerprint: string
  payloadEncryptionKeyFingerprint: string
}

function publicKeyFingerprint(pem: string): string {
  const der = createPublicKey(pem).export({ type: 'spki', format: 'der' })
  return createHash('sha256').update(der).digest('hex')
}

/**
 * Build the signed artifact set. Pure: no filesystem writes, no environment reads.
 */
export function buildVoiceProviderCatalog(
  input: BuildVoiceProviderCatalogInput,
): BuiltVoiceProviderCatalog {
  const privateKey = createPrivateKey(input.privateKeyPem)
  const publicKey = createPublicKey(input.publicKeyPem)
  const privateKeyFingerprint = publicKeyFingerprint(input.privateKeyPem)
  const pinnedFingerprint = publicKeyFingerprint(input.publicKeyPem)

  if (privateKeyFingerprint !== pinnedFingerprint) {
    throw new Error(
      `Catalog signing private key does not match the pinned public key (${privateKeyFingerprint} != ${pinnedFingerprint})`,
    )
  }

  const authored = input.pack as VoiceProviderPackV1
  const packInput: VoiceProviderPackV1
    = input.createdAt === undefined ? authored : { ...authored, createdAt: input.createdAt }
  const plaintextBytes = serializeVoiceProviderCatalogPack(packInput)
  const pack = parseVoiceProviderCatalogPackBytes(plaintextBytes)
  const key = Buffer.from(input.encryptionKey)
  const nonce = input.nonce
    ? Buffer.from(input.nonce)
    : randomBytes(CATALOG_PAYLOAD_NONCE_BYTES)
  let ciphertext: Buffer | null = null
  let authTag: Buffer | null = null

  try {
    const normalizedKey = normalizeCatalogPayloadKey({
      version: CATALOG_PAYLOAD_ENVELOPE_VERSION,
      algorithm: CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM,
      keyId: input.encryptionKeyId,
      key: key.toString('base64'),
    })
    if (key.byteLength !== CATALOG_PAYLOAD_KEY_BYTES) {
      throw new Error(`Catalog payload key must be ${CATALOG_PAYLOAD_KEY_BYTES} bytes`)
    }
    if (nonce.byteLength !== CATALOG_PAYLOAD_NONCE_BYTES) {
      throw new Error(`Catalog payload nonce must be ${CATALOG_PAYLOAD_NONCE_BYTES} bytes`)
    }

    const payloadEncryption = {
      algorithm: CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM,
      keyId: normalizedKey.keyId,
    } as const
    const encryptionContext: CatalogPayloadEncryptionContext = {
      contractVersion: CATALOG_CONTRACT_VERSION,
      type: 'voice-provider',
      packId: pack.packId,
      version: pack.version,
      schemaVersion: pack.schemaVersion,
      createdAt: pack.createdAt,
      payloadEncryption,
    }
    const cipher = createCipheriv('aes-256-gcm', key, nonce, {
      authTagLength: CATALOG_PAYLOAD_AUTH_TAG_BYTES,
    })
    cipher.setAAD(createCatalogPayloadEncryptionAad(encryptionContext))
    ciphertext = Buffer.concat([cipher.update(plaintextBytes), cipher.final()])
    authTag = cipher.getAuthTag()
    const payloadBytes = serializeCatalogEncryptedPayloadEnvelope({
      version: CATALOG_PAYLOAD_ENVELOPE_VERSION,
      algorithm: CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM,
      keyId: normalizedKey.keyId,
      nonce: nonce.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      authTag: authTag.toString('base64'),
    })

    const manifest: CatalogManifestV1 = {
      contractVersion: CATALOG_CONTRACT_VERSION,
      type: 'voice-provider',
      packId: pack.packId,
      version: pack.version,
      schemaVersion: pack.schemaVersion,
      createdAt: pack.createdAt,
      minSdkapi: pack.minSdkApi,
      locales: [...APP_LOCALES],
      entryCount: pack.providers.length,
      payloadBytes: payloadBytes.byteLength,
      payloadSha256: createHash('sha256').update(payloadBytes).digest('hex'),
      payloadEncryption,
      signatureAlgorithm: 'rsa-sha256',
      keyId: 'release-v1',
      signature: MANIFEST_SIGNATURE_PLACEHOLDER,
    }

    const signature = signBytes(
      'RSA-SHA256',
      createCatalogManifestSigningPayload(manifest),
      privateKey,
    )
    const signed: CatalogManifestV1 = { ...manifest, signature: signature.toString('base64') }

    if (
      !verifyBytes(
        'RSA-SHA256',
        createCatalogManifestSigningPayload(signed),
        publicKey,
        signature,
      )
    ) {
      throw new Error('Catalog manifest signature failed verification immediately after signing')
    }

    return {
      manifest: signed,
      manifestBytes: new TextEncoder().encode(JSON.stringify(signed)),
      payloadBytes,
      payloadSha256: manifest.payloadSha256,
      publicKeyFingerprint: pinnedFingerprint,
      payloadEncryptionKeyFingerprint: createHash('sha256').update(key).digest('hex'),
    }
  } finally {
    key.fill(0)
    nonce.fill(0)
    plaintextBytes.fill(0)
    ciphertext?.fill(0)
    authTag?.fill(0)
  }
}

/**
 * Write the artifact set into the storage-key layout the read-only routes serve.
 */
export async function writeVoiceProviderCatalog(
  outDir: string,
  built: BuiltVoiceProviderCatalog,
): Promise<{ manifestPath: string, payloadPath: string, manifestObjectKey: string, payloadObjectKey: string }> {
  const { packId, version } = built.manifest
  const relativeManifest = join('catalogs', 'voice-provider', 'latest.json')
  const relativePayload = join('catalogs', 'voice-provider', packId, version, `${built.payloadSha256}.json`)
  const manifestPath = join(outDir, relativeManifest)
  const payloadPath = join(outDir, relativePayload)

  await mkdir(dirname(payloadPath), { recursive: true })
  await writeFile(manifestPath, built.manifestBytes)
  await writeFile(payloadPath, built.payloadBytes)

  return {
    manifestPath,
    payloadPath,
    manifestObjectKey: relativeManifest.split('\\').join('/'),
    payloadObjectKey: relativePayload.split('\\').join('/'),
  }
}

export async function readSigningPrivateKeyPem(privateKeyPath: string | null): Promise<string> {
  if (privateKeyPath)
    return readFile(resolve(privateKeyPath), 'utf8')

  const envPath = process.env[PRIVATE_KEY_PATH_ENV]?.trim()
  if (envPath)
    return readFile(resolve(envPath), 'utf8')

  const envPem = process.env[PRIVATE_KEY_PEM_ENV]?.trim()
  if (envPem)
    return envPem

  throw new Error(
    `Catalog signing private key is required (--private-key <pem>, ${PRIVATE_KEY_PATH_ENV}, or ${PRIVATE_KEY_PEM_ENV})`,
  )
}

export async function readPayloadEncryptionKey(payloadKeyPath: string | null): Promise<Buffer> {
  let raw: string | undefined
  if (payloadKeyPath) {
    raw = await readFile(resolve(payloadKeyPath), 'utf8')
  } else {
    const envPath = process.env[PAYLOAD_KEY_PATH_ENV]?.trim()
    raw = envPath
      ? await readFile(resolve(envPath), 'utf8')
      : process.env[PAYLOAD_KEY_BASE64_ENV]?.trim()
  }
  if (!raw) {
    throw new Error(
      `Catalog payload encryption key is required (--payload-key <base64-file>, ${PAYLOAD_KEY_PATH_ENV}, or ${PAYLOAD_KEY_BASE64_ENV})`,
    )
  }
  const normalized = normalizeCatalogPayloadKey({
    version: CATALOG_PAYLOAD_ENVELOPE_VERSION,
    algorithm: CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM,
    keyId: 'validation-key',
    key: raw.trim(),
  })
  return Buffer.from(normalized.key, 'base64')
}

async function main() {
  const argv = process.argv.slice(2)
  const packPath = getArgValue(argv, '--pack')
  const outDir = resolve(
    getArgValue(argv, '--out') ?? 'release-assets/voice-provider-catalog',
  )
  const publicKeyPath = resolve(
    getArgValue(argv, '--public-key') ?? DEFAULT_CATALOG_PUBLIC_KEY_PATH,
  )
  const privateKeyPath = getArgValue(argv, '--private-key')
  const createdAt = getArgValue(argv, '--created-at')
  const payloadKeyPath = getArgValue(argv, '--payload-key')
  const payloadKeyId =
    getArgValue(argv, '--payload-key-id') || process.env[PAYLOAD_KEY_ID_ENV]?.trim()

  if (!packPath || !payloadKeyId) {
    throw new Error(
      'Usage: npx tsx scripts/build-voice-provider-catalog.ts --pack <pack.json> --out <dir> --payload-key <base64-file> --payload-key-id <id> [--created-at <ISO-8601 ms>] [--private-key <pem>] [--public-key <pem>]',
    )
  }

  const [packSource, privateKeyPem, publicKeyPem, payloadKey] = await Promise.all([
    readFile(resolve(packPath), 'utf8'),
    readSigningPrivateKeyPem(privateKeyPath),
    readFile(publicKeyPath, 'utf8'),
    readPayloadEncryptionKey(payloadKeyPath),
  ])

  let built: BuiltVoiceProviderCatalog
  try {
    built = buildVoiceProviderCatalog({
      pack: JSON.parse(packSource) as unknown,
      privateKeyPem,
      publicKeyPem,
      encryptionKey: payloadKey,
      encryptionKeyId: payloadKeyId,
      ...(createdAt ? { createdAt } : {}),
    })
  } finally {
    payloadKey.fill(0)
  }
  const written = await writeVoiceProviderCatalog(outDir, built)
  const payloadEncryption = built.manifest.payloadEncryption
  if (!payloadEncryption) {
    throw new Error('Encrypted voice provider manifest is missing payload encryption metadata')
  }

  console.log(JSON.stringify({
    packId: built.manifest.packId,
    version: built.manifest.version,
    schemaVersion: built.manifest.schemaVersion,
    entryCount: built.manifest.entryCount,
    payloadBytes: built.manifest.payloadBytes,
    payloadSha256: built.payloadSha256,
    keyId: built.manifest.keyId,
    payloadKeySecretBinding: 'VOICE_PROVIDER_CATALOG_KEYS',
    payloadKeyLookupId: [
      built.manifest.type,
      built.manifest.packId,
      built.manifest.version,
      payloadEncryption.keyId
    ].join('/'),
    publicKeyFingerprint: built.publicKeyFingerprint,
    payloadEncryption: built.manifest.payloadEncryption,
    payloadEncryptionKeyFingerprint: built.payloadEncryptionKeyFingerprint,
    ...written,
  }, null, 2))
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (entryPath && import.meta.url === entryPath) {
  main().catch((error) => {
    console.error(
      `[build-voice-provider-catalog] ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  })
}
