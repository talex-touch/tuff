import type {
  PluginPublisherSignatureV1,
  PluginSigningChannel,
  PluginSigningPayloadV1,
} from '@talex-touch/utils/plugin'
import { Buffer } from 'node:buffer'
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from 'node:crypto'
import process from 'node:process'
import {
  PLUGIN_SIGNING_ALGORITHM,
  PLUGIN_SIGNING_CONTRACT,
  serializePluginFileMap,
  serializePluginSigningPayload,
} from '@talex-touch/utils/plugin'
import fs from 'fs-extra'
import { readTpexSecurityScanInput } from './tpex-security-reader'

export interface PluginPublisherSigningBundle {
  envelope: PluginPublisherSignatureV1
  publicKeyPem: string
  validFrom: string
  validUntil?: string
}

export interface CreatePluginPublisherSignatureOptions {
  issuedAt?: string
  expiresAt?: string
  keyId?: string
  privateKeyPem?: string
  validFrom?: string
  validUntil?: string
}

const KEY_ID_RE = /^[A-Z0-9][\w.:-]{2,127}$/i

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeTimestamp(value: string | undefined, field: string): string | undefined {
  if (value === undefined)
    return undefined
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds))
    throw new Error(`${field} must be an ISO-8601 timestamp.`)
  return new Date(milliseconds).toISOString()
}

function resolvePrivateKeyPem(options: CreatePluginPublisherSignatureOptions): string {
  if (options.privateKeyPem?.trim())
    return options.privateKeyPem.trim()
  const configuredPem = process.env.TUFF_PLUGIN_SIGNING_PRIVATE_KEY_PEM?.trim()
  if (configuredPem)
    return configuredPem

  const keyPath = process.env.TUFF_PLUGIN_SIGNING_PRIVATE_KEY_FILE?.trim()
  if (keyPath) {
    const keyText = fs.readFileSync(keyPath, 'utf8').trim()
    if (keyText)
      return keyText
  }

  throw new Error(
    'Plugin publisher signing key is required. Configure TUFF_PLUGIN_SIGNING_PRIVATE_KEY_PEM or TUFF_PLUGIN_SIGNING_PRIVATE_KEY_FILE.',
  )
}

function resolveKeyId(options: CreatePluginPublisherSignatureOptions): string {
  const keyId = options.keyId?.trim() || process.env.TUFF_PLUGIN_SIGNING_KEY_ID?.trim()
  if (!keyId || !KEY_ID_RE.test(keyId)) {
    throw new Error('TUFF_PLUGIN_SIGNING_KEY_ID must be a stable 3-128 character key id.')
  }
  return keyId
}

function readManifestFileMap(manifest: unknown): Record<string, string> {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('TPEX manifest is unavailable for publisher signing.')
  }
  const fileMap = (manifest as Record<string, unknown>)._files
  if (!fileMap || typeof fileMap !== 'object' || Array.isArray(fileMap)) {
    throw new Error('TPEX manifest _files must be a SHA-256 file map before publisher signing.')
  }

  const normalized: Record<string, string> = {}
  for (const [path, digest] of Object.entries(fileMap)) {
    if (typeof digest !== 'string' || !digest.trim()) {
      throw new Error(`TPEX manifest _files contains an invalid digest for ${path}.`)
    }
    normalized[path] = digest.trim()
  }
  return normalized
}

function readManifestIdentity(manifest: unknown): { pluginId: string, pluginName: string, version: string } {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('TPEX manifest is unavailable for publisher signing.')
  }
  const record = manifest as Record<string, unknown>
  const pluginId = typeof record.id === 'string' ? record.id.trim() : ''
  const pluginName = typeof record.name === 'string' ? record.name.trim() : ''
  const version = typeof record.version === 'string' ? record.version.trim() : ''
  if (!pluginId || !pluginName || !version) {
    throw new Error('TPEX manifest id, name and version are required for publisher signing.')
  }
  return { pluginId, pluginName, version }
}

export function createPluginPublisherSignature(
  packagePath: string,
  channel: PluginSigningChannel,
  options: CreatePluginPublisherSignatureOptions = {},
): PluginPublisherSigningBundle {
  const archive = readTpexSecurityScanInput(packagePath)
  if (!archive.policy.ok || !archive.integrityPassed) {
    throw new Error('TPEX package must pass integrity and Package Policy before publisher signing.')
  }

  const packageBytes = fs.readFileSync(packagePath)
  const identity = readManifestIdentity(archive.manifest)
  const fileMap = readManifestFileMap(archive.manifest)
  const issuedAt = normalizeTimestamp(options.issuedAt, 'issuedAt') ?? new Date().toISOString()
  const expiresAt = normalizeTimestamp(
    options.expiresAt ?? process.env.TUFF_PLUGIN_SIGNING_EXPIRES_AT,
    'expiresAt',
  )
  if (expiresAt && Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new Error('Plugin publisher signature expiresAt must be later than issuedAt.')
  }

  const payload: PluginSigningPayloadV1 = {
    contract: PLUGIN_SIGNING_CONTRACT,
    policyVersion: archive.policy.policyVersion,
    pluginId: identity.pluginId,
    pluginName: identity.pluginName,
    version: identity.version,
    channel,
    artifactSha256: archive.artifactSha256,
    artifactSize: packageBytes.length,
    fileMapSha256: sha256(serializePluginFileMap(fileMap)),
    issuedAt,
    ...(expiresAt ? { expiresAt } : {}),
  }
  const payloadBytes = Buffer.from(serializePluginSigningPayload(payload), 'utf8')
  const privateKey = createPrivateKey(resolvePrivateKeyPem(options))
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('Plugin publisher signing key must use Ed25519.')
  }
  const publicKey = createPublicKey(privateKey)
  const signature = sign(null, payloadBytes, privateKey)
  if (!verify(null, payloadBytes, publicKey, signature)) {
    throw new Error('Plugin publisher signature self-check failed.')
  }

  const keyId = resolveKeyId(options)
  const validFrom = normalizeTimestamp(
    options.validFrom ?? process.env.TUFF_PLUGIN_SIGNING_VALID_FROM,
    'validFrom',
  ) ?? issuedAt
  const validUntil = normalizeTimestamp(
    options.validUntil ?? process.env.TUFF_PLUGIN_SIGNING_VALID_UNTIL,
    'validUntil',
  )
  if (validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) {
    throw new Error('Plugin publisher key validUntil must be later than validFrom.')
  }

  return {
    envelope: {
      algorithm: PLUGIN_SIGNING_ALGORITHM,
      keyId,
      payload,
      payloadSha256: sha256(payloadBytes),
      signature: signature.toString('base64'),
    },
    publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString().trim(),
    validFrom,
    ...(validUntil ? { validUntil } : {}),
  }
}
