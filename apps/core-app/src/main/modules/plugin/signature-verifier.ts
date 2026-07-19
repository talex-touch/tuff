import type {
  PluginAdmissionAttestationV1,
  PluginTrustRootV1,
  PluginTrustVerificationResult
} from '@talex-touch/utils/plugin'
import { Buffer } from 'node:buffer'
import { createHash, createPublicKey, verify } from 'node:crypto'
import process from 'node:process'
import {
  normalizePluginAdmissionAttestation,
  normalizePluginTrustRoots,
  PLUGIN_ATTESTATION_AUDIENCE,
  PLUGIN_ATTESTATION_ISSUER,
  PLUGIN_SIGNING_ALGORITHM,
  serializePluginAdmissionPayload,
  serializePluginSigningPayload
} from '@talex-touch/utils/plugin'
import fse from 'fs-extra'

export interface PluginPackageTrustMetadata {
  sourceType: 'registry'
  pluginId: string
  pluginName: string
  version: string
  channel: 'SNAPSHOT' | 'BETA' | 'RELEASE'
  artifactSha256: string
  packageSize: number
  nexusAttestation: PluginAdmissionAttestationV1
}

export interface PluginPackageTrustOptions {
  trustRoots?: readonly PluginTrustRootV1[]
  revokedPublisherKeyIds?: readonly string[]
  now?: number
}

/**
 * Verify plugin package signature
 * Uses SHA-256 hash of file content compared against expected signature
 */
const SHA256_RE = /^[a-f0-9]{64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function failure(
  code: Exclude<PluginTrustVerificationResult, { ok: true }>['code'],
  detail?: string
): PluginTrustVerificationResult {
  return { ok: false, code, ...(detail ? { detail } : {}) }
}

function readConfiguredTrustRoots(): PluginTrustRootV1[] {
  const raw = process.env.TUFF_PLUGIN_TRUST_ROOTS_JSON?.trim()
  if (!raw) return []
  try {
    return normalizePluginTrustRoots(JSON.parse(raw))
  } catch {
    return []
  }
}

function readRevokedPublisherKeyIds(): string[] {
  const raw = process.env.TUFF_PLUGIN_REVOKED_PUBLISHER_KEYS_JSON?.trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter(
          (value): value is string => typeof value === 'string' && Boolean(value.trim())
        )
      : []
  } catch {
    return []
  }
}

function keyTimeFailure(
  root: PluginTrustRootV1,
  issuedAt: string,
  now: number
): PluginTrustVerificationResult | null {
  if (root.revokedAt && now >= Date.parse(root.revokedAt))
    return failure('PLUGIN_TRUST_KEY_REVOKED')
  if (Date.parse(issuedAt) < Date.parse(root.validFrom))
    return failure('PLUGIN_TRUST_KEY_NOT_YET_VALID')
  if (
    root.validUntil &&
    (Date.parse(issuedAt) > Date.parse(root.validUntil) || now > Date.parse(root.validUntil))
  )
    return failure('PLUGIN_TRUST_KEY_EXPIRED')
  return null
}

export async function verifyPluginPackageTrust(
  filePath: string,
  metadata: PluginPackageTrustMetadata,
  options: PluginPackageTrustOptions = {}
): Promise<PluginTrustVerificationResult> {
  if (!(await fse.pathExists(filePath)))
    return failure('PLUGIN_TRUST_METADATA_INVALID', 'Package file not found.')

  let fileBuffer: Buffer
  try {
    fileBuffer = await fse.readFile(filePath)
  } catch {
    return failure('PLUGIN_TRUST_METADATA_INVALID', 'Package file cannot be read.')
  }
  if (fileBuffer.length !== metadata.packageSize)
    return failure('PLUGIN_TRUST_ARTIFACT_SIZE_MISMATCH')
  const artifactSha256 = sha256(fileBuffer)
  if (artifactSha256 !== metadata.artifactSha256)
    return failure('PLUGIN_TRUST_ARTIFACT_DIGEST_MISMATCH')

  const rawAttestation: unknown = metadata.nexusAttestation
  if (!isRecord(rawAttestation)) return failure('PLUGIN_TRUST_METADATA_INVALID')
  if (rawAttestation.algorithm !== PLUGIN_SIGNING_ALGORITHM)
    return failure('PLUGIN_TRUST_ALGORITHM_DENIED')
  const rawPayload = rawAttestation.payload
  if (!isRecord(rawPayload)) return failure('PLUGIN_TRUST_METADATA_INVALID')
  if (rawPayload.issuer !== PLUGIN_ATTESTATION_ISSUER) return failure('PLUGIN_TRUST_ISSUER_INVALID')
  if (rawPayload.audience !== PLUGIN_ATTESTATION_AUDIENCE)
    return failure('PLUGIN_TRUST_AUDIENCE_INVALID')
  if (rawPayload.admission !== 'eligible') return failure('PLUGIN_TRUST_ADMISSION_REJECTED')
  if (rawPayload.policyDecision !== 'passed') return failure('PLUGIN_TRUST_POLICY_REJECTED')
  if (rawPayload.scanDecision !== 'passed' && rawPayload.scanDecision !== 'review-required')
    return failure('PLUGIN_TRUST_SCAN_REJECTED')
  const rawReview = rawPayload.review
  if (!isRecord(rawReview) || rawReview.decision !== 'approved')
    return failure('PLUGIN_TRUST_REVIEW_REQUIRED')
  const rawPublisherSignature = rawPayload.publisherSignature
  const rawPublisherKey = rawPayload.publisherKey
  if (
    !isRecord(rawPublisherSignature) ||
    !isRecord(rawPublisherKey) ||
    rawPublisherSignature.algorithm !== PLUGIN_SIGNING_ALGORITHM ||
    rawPublisherKey.algorithm !== PLUGIN_SIGNING_ALGORITHM
  ) {
    return failure('PLUGIN_TRUST_ALGORITHM_DENIED')
  }

  const attestation = normalizePluginAdmissionAttestation(metadata.nexusAttestation)
  if (!attestation) return failure('PLUGIN_TRUST_METADATA_INVALID')
  const payload = attestation.payload

  if (payload.artifactSha256 !== artifactSha256 || payload.artifactSize !== fileBuffer.length)
    return failure('PLUGIN_TRUST_ARTIFACT_DIGEST_MISMATCH')
  if (
    payload.pluginId !== metadata.pluginId ||
    payload.pluginName !== metadata.pluginName ||
    payload.version !== metadata.version
  ) {
    return failure('PLUGIN_TRUST_IDENTITY_MISMATCH')
  }
  if (payload.channel !== metadata.channel) return failure('PLUGIN_TRUST_CHANNEL_MISMATCH')

  const now = options.now ?? Date.now()
  if (payload.expiresAt && now > Date.parse(payload.expiresAt))
    return failure('PLUGIN_TRUST_KEY_EXPIRED')
  const roots = options.trustRoots
    ? normalizePluginTrustRoots(options.trustRoots)
    : readConfiguredTrustRoots()
  const root = roots.find((candidate) => candidate.keyId === attestation.keyId)
  if (!root) return failure('PLUGIN_TRUST_KEY_UNKNOWN')
  if (root.algorithm !== PLUGIN_SIGNING_ALGORITHM) return failure('PLUGIN_TRUST_ALGORITHM_DENIED')
  const rootFailure = keyTimeFailure(root, payload.issuedAt, now)
  if (rootFailure) return rootFailure

  const attestationPayloadBytes = Buffer.from(serializePluginAdmissionPayload(payload), 'utf8')
  if (sha256(attestationPayloadBytes) !== attestation.payloadSha256)
    return failure('PLUGIN_TRUST_PAYLOAD_DIGEST_MISMATCH')
  let attestationValid = false
  try {
    const publicKey = createPublicKey(root.publicKeyPem)
    attestationValid =
      publicKey.asymmetricKeyType === 'ed25519' &&
      verify(null, attestationPayloadBytes, publicKey, Buffer.from(attestation.signature, 'base64'))
  } catch {
    attestationValid = false
  }
  if (!attestationValid) return failure('PLUGIN_TRUST_ATTESTATION_SIGNATURE_INVALID')

  const publisherSignature = payload.publisherSignature
  const publisherKey = payload.publisherKey
  if (
    publisherSignature.algorithm !== PLUGIN_SIGNING_ALGORITHM ||
    publisherKey.algorithm !== PLUGIN_SIGNING_ALGORITHM
  ) {
    return failure('PLUGIN_TRUST_ALGORITHM_DENIED')
  }
  if (publisherSignature.keyId !== publisherKey.keyId)
    return failure('PLUGIN_TRUST_IDENTITY_MISMATCH')
  const revokedPublisherKeyIds = new Set(
    options.revokedPublisherKeyIds ?? readRevokedPublisherKeyIds()
  )
  if (revokedPublisherKeyIds.has(publisherKey.keyId)) return failure('PLUGIN_TRUST_KEY_REVOKED')
  if (Date.parse(publisherSignature.payload.issuedAt) < Date.parse(publisherKey.validFrom))
    return failure('PLUGIN_TRUST_KEY_NOT_YET_VALID')
  if (
    publisherKey.validUntil &&
    (Date.parse(publisherSignature.payload.issuedAt) > Date.parse(publisherKey.validUntil) ||
      now > Date.parse(publisherKey.validUntil))
  ) {
    return failure('PLUGIN_TRUST_KEY_EXPIRED')
  }
  if (
    publisherSignature.payload.expiresAt &&
    now > Date.parse(publisherSignature.payload.expiresAt)
  )
    return failure('PLUGIN_TRUST_KEY_EXPIRED')

  const signedPayload = publisherSignature.payload
  if (
    signedPayload.artifactSha256 !== artifactSha256 ||
    signedPayload.artifactSize !== fileBuffer.length ||
    signedPayload.pluginId !== payload.pluginId ||
    signedPayload.pluginName !== payload.pluginName ||
    signedPayload.version !== payload.version ||
    signedPayload.channel !== payload.channel ||
    signedPayload.policyVersion !== payload.policyVersion
  ) {
    return failure('PLUGIN_TRUST_IDENTITY_MISMATCH')
  }
  const publisherPayloadBytes = Buffer.from(serializePluginSigningPayload(signedPayload), 'utf8')
  if (sha256(publisherPayloadBytes) !== publisherSignature.payloadSha256)
    return failure('PLUGIN_TRUST_PAYLOAD_DIGEST_MISMATCH')
  let publisherValid = false
  try {
    const publicKey = createPublicKey(publisherKey.publicKeyPem)
    publisherValid =
      publicKey.asymmetricKeyType === 'ed25519' &&
      verify(
        null,
        publisherPayloadBytes,
        publicKey,
        Buffer.from(publisherSignature.signature, 'base64')
      )
  } catch {
    publisherValid = false
  }
  if (!publisherValid) return failure('PLUGIN_TRUST_PUBLISHER_SIGNATURE_INVALID')

  return {
    ok: true,
    code: 'PLUGIN_TRUST_VERIFIED',
    artifactSha256,
    publisherKeyId: publisherKey.keyId,
    nexusKeyId: root.keyId
  }
}

/**
 * Extract signature info from API version metadata
 */
export function extractPluginTrustMetadata(
  metadata?: Record<string, unknown>
): PluginPackageTrustMetadata | undefined {
  if (!metadata || metadata.sourceType !== 'registry') return undefined
  const pluginId = typeof metadata.pluginId === 'string' ? metadata.pluginId.trim() : ''
  const pluginName = typeof metadata.pluginName === 'string' ? metadata.pluginName.trim() : ''
  const version = typeof metadata.version === 'string' ? metadata.version.trim() : ''
  const channel = metadata.channel
  const artifactSha256 =
    typeof metadata.artifactSha256 === 'string' ? metadata.artifactSha256.trim().toLowerCase() : ''
  const packageSize = metadata.packageSize
  const nexusAttestation = normalizePluginAdmissionAttestation(metadata.nexusAttestation)
  if (
    !pluginId ||
    !pluginName ||
    !version ||
    (channel !== 'SNAPSHOT' && channel !== 'BETA' && channel !== 'RELEASE') ||
    !SHA256_RE.test(artifactSha256) ||
    !Number.isSafeInteger(packageSize) ||
    (packageSize as number) <= 0 ||
    !nexusAttestation
  ) {
    return undefined
  }

  return {
    sourceType: 'registry',
    pluginId,
    pluginName,
    version,
    channel,
    artifactSha256,
    packageSize: packageSize as number,
    nexusAttestation
  }
}
