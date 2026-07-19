export const PLUGIN_SIGNING_CONTRACT = 'talex.plugin-signing/v1' as const
export const PLUGIN_ATTESTATION_CONTRACT = 'talex.plugin-attestation/v1' as const
export const PLUGIN_SIGNING_ALGORITHM = 'Ed25519' as const
export const PLUGIN_ATTESTATION_ISSUER = 'tuff-nexus' as const
export const PLUGIN_ATTESTATION_AUDIENCE = 'talex-touch-core-app' as const

export type PluginSigningChannel = 'SNAPSHOT' | 'BETA' | 'RELEASE'
export type PluginSigningKeyStatus = 'active' | 'overlap' | 'revoked' | 'expired'
export type PluginAdmissionDecision = 'eligible' | 'blocked'

export interface PluginSigningPayloadV1 {
  contract: typeof PLUGIN_SIGNING_CONTRACT
  policyVersion: string
  pluginId: string
  pluginName: string
  version: string
  channel: PluginSigningChannel
  artifactSha256: string
  artifactSize: number
  fileMapSha256: string
  issuedAt: string
  expiresAt?: string
}

export interface PluginPublisherSignatureV1 {
  algorithm: typeof PLUGIN_SIGNING_ALGORITHM
  keyId: string
  payload: PluginSigningPayloadV1
  payloadSha256: string
  signature: string
}

export interface PluginAttestedPublisherKeyV1 {
  algorithm: typeof PLUGIN_SIGNING_ALGORITHM
  keyId: string
  ownerId: string
  publicKeyPem: string
  status: Exclude<PluginSigningKeyStatus, 'revoked' | 'expired'>
  validFrom: string
  validUntil?: string
}

export interface PluginAdmissionAttestationPayloadV1 {
  contract: typeof PLUGIN_ATTESTATION_CONTRACT
  issuer: typeof PLUGIN_ATTESTATION_ISSUER
  audience: typeof PLUGIN_ATTESTATION_AUDIENCE
  artifactSha256: string
  artifactSize: number
  pluginId: string
  pluginName: string
  version: string
  channel: PluginSigningChannel
  policyVersion: string
  policyDecision: 'passed'
  scanReportSha256: string
  scanDecision: 'passed' | 'review-required'
  publisherSignature: PluginPublisherSignatureV1
  publisherKey: PluginAttestedPublisherKeyV1
  review: {
    decision: 'approved'
    actorId: string
    reviewedAt: string
  }
  admission: PluginAdmissionDecision
  issuedAt: string
  expiresAt?: string
}

export interface PluginAdmissionAttestationV1 {
  algorithm: typeof PLUGIN_SIGNING_ALGORITHM
  keyId: string
  payload: PluginAdmissionAttestationPayloadV1
  payloadSha256: string
  signature: string
}

export interface PluginTrustRootV1 {
  algorithm: typeof PLUGIN_SIGNING_ALGORITHM
  keyId: string
  publicKeyPem: string
  validFrom: string
  validUntil?: string
  revokedAt?: string
}

export type PluginTrustFailureCode
  = | 'PLUGIN_TRUST_METADATA_REQUIRED'
    | 'PLUGIN_TRUST_METADATA_INVALID'
    | 'PLUGIN_TRUST_ARTIFACT_SIZE_MISMATCH'
    | 'PLUGIN_TRUST_ARTIFACT_DIGEST_MISMATCH'
    | 'PLUGIN_TRUST_PAYLOAD_DIGEST_MISMATCH'
    | 'PLUGIN_TRUST_IDENTITY_MISMATCH'
    | 'PLUGIN_TRUST_CHANNEL_MISMATCH'
    | 'PLUGIN_TRUST_POLICY_REJECTED'
    | 'PLUGIN_TRUST_SCAN_REJECTED'
    | 'PLUGIN_TRUST_REVIEW_REQUIRED'
    | 'PLUGIN_TRUST_ADMISSION_REJECTED'
    | 'PLUGIN_TRUST_KEY_UNKNOWN'
    | 'PLUGIN_TRUST_KEY_NOT_YET_VALID'
    | 'PLUGIN_TRUST_KEY_EXPIRED'
    | 'PLUGIN_TRUST_KEY_REVOKED'
    | 'PLUGIN_TRUST_ALGORITHM_DENIED'
    | 'PLUGIN_TRUST_PUBLISHER_SIGNATURE_INVALID'
    | 'PLUGIN_TRUST_ATTESTATION_SIGNATURE_INVALID'
    | 'PLUGIN_TRUST_ISSUER_INVALID'
    | 'PLUGIN_TRUST_AUDIENCE_INVALID'

export type PluginTrustVerificationResult
  = | {
    ok: true
    code: 'PLUGIN_TRUST_VERIFIED'
    artifactSha256: string
    publisherKeyId: string
    nexusKeyId: string
  }
  | {
    ok: false
    code: PluginTrustFailureCode
    detail?: string
  }

const SHA256_RE = /^[a-f0-9]{64}$/
const BASE64_RE = /^(?:[A-Z0-9+/]{4})*(?:[A-Z0-9+/]{2}==|[A-Z0-9+/]{3}=)?$/i
const CHANNELS = new Set<PluginSigningChannel>(['SNAPSHOT', 'BETA', 'RELEASE'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional])
  return required.every(key => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every(key => allowed.has(key))
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readSha256(value: unknown): string | null {
  const normalized = readString(value)?.toLowerCase() ?? null
  return normalized && SHA256_RE.test(normalized) ? normalized : null
}

function readBase64(value: unknown): string | null {
  const normalized = readString(value)
  return normalized && BASE64_RE.test(normalized) ? normalized : null
}

function readTimestamp(value: unknown): string | null {
  const normalized = readString(value)
  if (!normalized)
    return null
  const milliseconds = Date.parse(normalized)
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null
}

function readChannel(value: unknown): PluginSigningChannel | null {
  return typeof value === 'string' && CHANNELS.has(value as PluginSigningChannel)
    ? value as PluginSigningChannel
    : null
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('Canonical plugin signing JSON rejects non-finite numbers.')
    return value
  }
  if (Array.isArray(value))
    return value.map(item => canonicalize(item))
  if (isRecord(value)) {
    const normalized: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right, 'en'))) {
      const child = value[key]
      if (child === undefined)
        continue
      normalized[key] = canonicalize(child)
    }
    return normalized
  }
  throw new TypeError('Canonical plugin signing JSON accepts only JSON-compatible values.')
}

export function serializePluginSigningValue(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

export function serializePluginSigningPayload(payload: PluginSigningPayloadV1): string {
  return serializePluginSigningValue(payload)
}

export function serializePluginAdmissionPayload(
  payload: PluginAdmissionAttestationPayloadV1,
): string {
  return serializePluginSigningValue(payload)
}

export function serializePluginFileMap(fileMap: Record<string, string>): string {
  return serializePluginSigningValue(fileMap)
}

export function normalizePluginSigningPayload(value: unknown): PluginSigningPayloadV1 | null {
  if (!isRecord(value) || !requireExactKeys(value, [
    'contract',
    'policyVersion',
    'pluginId',
    'pluginName',
    'version',
    'channel',
    'artifactSha256',
    'artifactSize',
    'fileMapSha256',
    'issuedAt',
  ], ['expiresAt'])) {
    return null
  }

  const policyVersion = readString(value.policyVersion)
  const pluginId = readString(value.pluginId)
  const pluginName = readString(value.pluginName)
  const version = readString(value.version)
  const channel = readChannel(value.channel)
  const artifactSha256 = readSha256(value.artifactSha256)
  const fileMapSha256 = readSha256(value.fileMapSha256)
  const issuedAt = readTimestamp(value.issuedAt)
  const expiresAt = value.expiresAt === undefined ? undefined : readTimestamp(value.expiresAt)
  const artifactSize = value.artifactSize

  if (
    value.contract !== PLUGIN_SIGNING_CONTRACT
    || !policyVersion
    || !pluginId
    || !pluginName
    || !version
    || !channel
    || !artifactSha256
    || !fileMapSha256
    || !issuedAt
    || (value.expiresAt !== undefined && !expiresAt)
    || !Number.isSafeInteger(artifactSize)
    || (artifactSize as number) <= 0
  ) {
    return null
  }

  return {
    contract: PLUGIN_SIGNING_CONTRACT,
    policyVersion,
    pluginId,
    pluginName,
    version,
    channel,
    artifactSha256,
    artifactSize: artifactSize as number,
    fileMapSha256,
    issuedAt,
    ...(expiresAt ? { expiresAt } : {}),
  }
}

export function normalizePluginPublisherSignature(value: unknown): PluginPublisherSignatureV1 | null {
  if (!isRecord(value) || !requireExactKeys(value, [
    'algorithm',
    'keyId',
    'payload',
    'payloadSha256',
    'signature',
  ])) {
    return null
  }

  const keyId = readString(value.keyId)
  const payload = normalizePluginSigningPayload(value.payload)
  const payloadSha256 = readSha256(value.payloadSha256)
  const signature = readBase64(value.signature)
  if (
    value.algorithm !== PLUGIN_SIGNING_ALGORITHM
    || !keyId
    || !payload
    || !payloadSha256
    || !signature
  ) {
    return null
  }

  return {
    algorithm: PLUGIN_SIGNING_ALGORITHM,
    keyId,
    payload,
    payloadSha256,
    signature,
  }
}

function normalizeAttestedPublisherKey(value: unknown): PluginAttestedPublisherKeyV1 | null {
  if (!isRecord(value) || !requireExactKeys(value, [
    'algorithm',
    'keyId',
    'ownerId',
    'publicKeyPem',
    'status',
    'validFrom',
  ], ['validUntil'])) {
    return null
  }

  const keyId = readString(value.keyId)
  const ownerId = readString(value.ownerId)
  const publicKeyPem = readString(value.publicKeyPem)
  const validFrom = readTimestamp(value.validFrom)
  const validUntil = value.validUntil === undefined ? undefined : readTimestamp(value.validUntil)
  const status = value.status
  if (
    value.algorithm !== PLUGIN_SIGNING_ALGORITHM
    || !keyId
    || !ownerId
    || !publicKeyPem
    || !validFrom
    || (value.validUntil !== undefined && !validUntil)
    || (status !== 'active' && status !== 'overlap')
  ) {
    return null
  }

  return {
    algorithm: PLUGIN_SIGNING_ALGORITHM,
    keyId,
    ownerId,
    publicKeyPem,
    status,
    validFrom,
    ...(validUntil ? { validUntil } : {}),
  }
}

function normalizeReview(value: unknown): PluginAdmissionAttestationPayloadV1['review'] | null {
  if (!isRecord(value) || !requireExactKeys(value, ['decision', 'actorId', 'reviewedAt']))
    return null
  const actorId = readString(value.actorId)
  const reviewedAt = readTimestamp(value.reviewedAt)
  if (value.decision !== 'approved' || !actorId || !reviewedAt)
    return null
  return { decision: 'approved', actorId, reviewedAt }
}

export function normalizePluginAdmissionPayload(
  value: unknown,
): PluginAdmissionAttestationPayloadV1 | null {
  if (!isRecord(value) || !requireExactKeys(value, [
    'contract',
    'issuer',
    'audience',
    'artifactSha256',
    'artifactSize',
    'pluginId',
    'pluginName',
    'version',
    'channel',
    'policyVersion',
    'policyDecision',
    'scanReportSha256',
    'scanDecision',
    'publisherSignature',
    'publisherKey',
    'review',
    'admission',
    'issuedAt',
  ], ['expiresAt'])) {
    return null
  }

  const artifactSha256 = readSha256(value.artifactSha256)
  const pluginId = readString(value.pluginId)
  const pluginName = readString(value.pluginName)
  const version = readString(value.version)
  const channel = readChannel(value.channel)
  const policyVersion = readString(value.policyVersion)
  const scanReportSha256 = readSha256(value.scanReportSha256)
  const publisherSignature = normalizePluginPublisherSignature(value.publisherSignature)
  const publisherKey = normalizeAttestedPublisherKey(value.publisherKey)
  const review = normalizeReview(value.review)
  const issuedAt = readTimestamp(value.issuedAt)
  const expiresAt = value.expiresAt === undefined ? undefined : readTimestamp(value.expiresAt)
  const artifactSize = value.artifactSize

  if (
    value.contract !== PLUGIN_ATTESTATION_CONTRACT
    || value.issuer !== PLUGIN_ATTESTATION_ISSUER
    || value.audience !== PLUGIN_ATTESTATION_AUDIENCE
    || !artifactSha256
    || !pluginId
    || !pluginName
    || !version
    || !channel
    || !policyVersion
    || value.policyDecision !== 'passed'
    || !scanReportSha256
    || (value.scanDecision !== 'passed' && value.scanDecision !== 'review-required')
    || !publisherSignature
    || !publisherKey
    || !review
    || value.admission !== 'eligible'
    || !issuedAt
    || (value.expiresAt !== undefined && !expiresAt)
    || !Number.isSafeInteger(artifactSize)
    || (artifactSize as number) <= 0
  ) {
    return null
  }

  return {
    contract: PLUGIN_ATTESTATION_CONTRACT,
    issuer: PLUGIN_ATTESTATION_ISSUER,
    audience: PLUGIN_ATTESTATION_AUDIENCE,
    artifactSha256,
    artifactSize: artifactSize as number,
    pluginId,
    pluginName,
    version,
    channel,
    policyVersion,
    policyDecision: 'passed',
    scanReportSha256,
    scanDecision: value.scanDecision,
    publisherSignature,
    publisherKey,
    review,
    admission: 'eligible',
    issuedAt,
    ...(expiresAt ? { expiresAt } : {}),
  }
}

export function normalizePluginAdmissionAttestation(
  value: unknown,
): PluginAdmissionAttestationV1 | null {
  if (!isRecord(value) || !requireExactKeys(value, [
    'algorithm',
    'keyId',
    'payload',
    'payloadSha256',
    'signature',
  ])) {
    return null
  }

  const keyId = readString(value.keyId)
  const payload = normalizePluginAdmissionPayload(value.payload)
  const payloadSha256 = readSha256(value.payloadSha256)
  const signature = readBase64(value.signature)
  if (
    value.algorithm !== PLUGIN_SIGNING_ALGORITHM
    || !keyId
    || !payload
    || !payloadSha256
    || !signature
  ) {
    return null
  }

  return {
    algorithm: PLUGIN_SIGNING_ALGORITHM,
    keyId,
    payload,
    payloadSha256,
    signature,
  }
}

export function normalizePluginTrustRoots(value: unknown): PluginTrustRootV1[] {
  if (!Array.isArray(value))
    return []
  const roots: PluginTrustRootV1[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (!isRecord(entry) || !requireExactKeys(entry, [
      'algorithm',
      'keyId',
      'publicKeyPem',
      'validFrom',
    ], ['validUntil', 'revokedAt'])) {
      continue
    }
    const keyId = readString(entry.keyId)
    const publicKeyPem = readString(entry.publicKeyPem)
    const validFrom = readTimestamp(entry.validFrom)
    const validUntil = entry.validUntil === undefined ? undefined : readTimestamp(entry.validUntil)
    const revokedAt = entry.revokedAt === undefined ? undefined : readTimestamp(entry.revokedAt)
    if (
      entry.algorithm !== PLUGIN_SIGNING_ALGORITHM
      || !keyId
      || !publicKeyPem
      || !validFrom
      || (entry.validUntil !== undefined && !validUntil)
      || (entry.revokedAt !== undefined && !revokedAt)
      || seen.has(keyId)
    ) {
      continue
    }
    seen.add(keyId)
    roots.push({
      algorithm: PLUGIN_SIGNING_ALGORITHM,
      keyId,
      publicKeyPem,
      validFrom,
      ...(validUntil ? { validUntil } : {}),
      ...(revokedAt ? { revokedAt } : {}),
    })
  }
  return roots.sort((left, right) => left.keyId.localeCompare(right.keyId, 'en'))
}
