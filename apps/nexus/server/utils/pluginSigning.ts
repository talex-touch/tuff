import type { D1Database } from '@cloudflare/workers-types'
import type {
  PluginAdmissionAttestationPayloadV1,
  PluginAdmissionAttestationV1,
  PluginPublisherSignatureV1,
  PluginSecurityScanDecision,
  PluginSigningChannel,
} from '@talex-touch/utils/plugin'
import type { H3Event } from 'h3'
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
  normalizePluginPublisherSignature,
  PLUGIN_ATTESTATION_AUDIENCE,
  PLUGIN_ATTESTATION_CONTRACT,
  PLUGIN_ATTESTATION_ISSUER,
  PLUGIN_SIGNING_ALGORITHM,
  serializePluginAdmissionPayload,
  serializePluginFileMap,
  serializePluginSigningPayload,
} from '@talex-touch/utils/plugin'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { recordPlatformGovernanceEvent } from './platformGovernanceStore'

const TABLE_NAME = 'plugin_publisher_signing_keys'
const KEY_ID_RE = /^[A-Z0-9][\w.:-]{2,127}$/i
const CLOCK_SKEW_MS = 5 * 60 * 1000

export type PublisherSigningKeyStatus = 'active' | 'overlap' | 'revoked'

export interface PublisherSigningKeyRecord {
  keyId: string
  ownerId: string
  algorithm: typeof PLUGIN_SIGNING_ALGORITHM
  publicKeyPem: string
  fingerprintSha256: string
  status: PublisherSigningKeyStatus
  validFrom: string
  validUntil: string | null
  revokedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface RegisterPublisherSigningKeyInput {
  keyId: string
  publicKeyPem: string
  validFrom: string
  validUntil?: string
  status?: 'active' | 'overlap'
}

export interface VerifyPublisherSignatureInput {
  ownerId: string
  publicKey: RegisterPublisherSigningKeyInput
  publisherSignature: unknown
  artifactSha256: string
  artifactSize: number
  pluginId: string
  pluginName: string
  version: string
  channel: PluginSigningChannel
  policyVersion: string
  manifest: Record<string, unknown>
}

export interface VerifiedPublisherSignature {
  envelope: PluginPublisherSignatureV1
  key: PublisherSigningKeyRecord
  verifiedAt: string
}

export interface CreateAdmissionAttestationInput {
  artifactSha256: string
  artifactSize: number
  pluginId: string
  pluginName: string
  version: string
  channel: PluginSigningChannel
  policyVersion: string
  manifest: Record<string, unknown>
  scanReportSha256: string
  scanDecision: PluginSecurityScanDecision
  publisher: VerifiedPublisherSignature
  reviewActorId: string
  reviewedAt: string
}

interface PublisherSigningKeyRow {
  key_id: string
  owner_id: string
  algorithm: string
  public_key_pem: string
  fingerprint_sha256: string
  status: PublisherSigningKeyStatus
  valid_from: string
  valid_until: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

const memoryKeys = new Map<string, PublisherSigningKeyRecord>()
let schemaInitialized = false

function getD1Database(event: H3Event): D1Database | null {
  return readCloudflareBindings(event)?.DB ?? null
}

async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaInitialized)
    return
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      key_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      algorithm TEXT NOT NULL,
      public_key_pem TEXT NOT NULL,
      fingerprint_sha256 TEXT NOT NULL,
      status TEXT NOT NULL,
      valid_from TEXT NOT NULL,
      valid_until TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_plugin_publisher_keys_owner_status
    ON ${TABLE_NAME}(owner_id, status, valid_from);
  `).run()
  schemaInitialized = true
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function signingError(code: string, detail?: string, statusCode = 400): never {
  throw createError({
    statusCode,
    statusMessage: detail ? `${code}: ${detail}` : code,
  })
}

function normalizeTimestamp(value: unknown, field: string): string {
  const milliseconds = Date.parse(String(value ?? ''))
  if (!Number.isFinite(milliseconds))
    signingError('PLUGIN_SIGNING_KEY_INVALID', `${field} must be ISO-8601.`)
  return new Date(milliseconds).toISOString()
}

function normalizeKeyInput(raw: RegisterPublisherSigningKeyInput): RegisterPublisherSigningKeyInput & {
  fingerprintSha256: string
} {
  const keyId = String(raw.keyId ?? '').trim()
  if (!KEY_ID_RE.test(keyId))
    signingError('PLUGIN_SIGNING_KEY_ID_INVALID')
  const publicKeyPem = String(raw.publicKeyPem ?? '').trim()
  let publicKey
  try {
    publicKey = createPublicKey(publicKeyPem)
  }
  catch {
    signingError('PLUGIN_SIGNING_PUBLIC_KEY_INVALID')
  }
  if (publicKey.asymmetricKeyType !== 'ed25519')
    signingError('PLUGIN_SIGNING_ALGORITHM_DENIED')
  const validFrom = normalizeTimestamp(raw.validFrom, 'validFrom')
  const validUntil = raw.validUntil ? normalizeTimestamp(raw.validUntil, 'validUntil') : undefined
  if (validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) {
    signingError('PLUGIN_SIGNING_KEY_INVALID', 'validUntil must be later than validFrom.')
  }
  const der = publicKey.export({ format: 'der', type: 'spki' })
  return {
    keyId,
    publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString().trim(),
    validFrom,
    ...(validUntil ? { validUntil } : {}),
    status: raw.status === 'overlap' ? 'overlap' : 'active',
    fingerprintSha256: sha256(Buffer.from(der)),
  }
}

function fromRow(row: PublisherSigningKeyRow): PublisherSigningKeyRecord {
  return {
    keyId: row.key_id,
    ownerId: row.owner_id,
    algorithm: PLUGIN_SIGNING_ALGORITHM,
    publicKeyPem: row.public_key_pem,
    fingerprintSha256: row.fingerprint_sha256,
    status: row.status,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getPublisherSigningKey(
  event: H3Event,
  keyId: string,
): Promise<PublisherSigningKeyRecord | null> {
  const db = getD1Database(event)
  if (!db)
    return memoryKeys.get(keyId) ?? null
  await ensureSchema(db)
  const row = await db.prepare(`
    SELECT * FROM ${TABLE_NAME} WHERE key_id = ?1;
  `).bind(keyId).first<PublisherSigningKeyRow>()
  return row ? fromRow(row) : null
}

export async function listPublisherSigningKeys(
  event: H3Event,
  ownerId: string,
): Promise<PublisherSigningKeyRecord[]> {
  const db = getD1Database(event)
  if (!db) {
    return [...memoryKeys.values()]
      .filter(key => key.ownerId === ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }
  await ensureSchema(db)
  const result = await db.prepare(`
    SELECT * FROM ${TABLE_NAME} WHERE owner_id = ?1 ORDER BY created_at DESC;
  `).bind(ownerId).all<PublisherSigningKeyRow>()
  return (result.results ?? []).map(fromRow)
}

export async function registerPublisherSigningKey(
  event: H3Event,
  ownerId: string,
  rawInput: RegisterPublisherSigningKeyInput,
): Promise<PublisherSigningKeyRecord> {
  const input = normalizeKeyInput(rawInput)
  const normalizedOwner = String(ownerId ?? '').trim()
  if (!normalizedOwner)
    signingError('PLUGIN_SIGNING_OWNER_REQUIRED')
  const existing = await getPublisherSigningKey(event, input.keyId)
  if (existing) {
    if (existing.ownerId !== normalizedOwner || existing.fingerprintSha256 !== input.fingerprintSha256) {
      signingError('PLUGIN_SIGNING_KEY_CONFLICT', undefined, 409)
    }
    if (existing.status === 'revoked' || existing.revokedAt)
      signingError('PLUGIN_SIGNING_KEY_REVOKED')
    return existing
  }

  const now = new Date().toISOString()
  const record: PublisherSigningKeyRecord = {
    keyId: input.keyId,
    ownerId: normalizedOwner,
    algorithm: PLUGIN_SIGNING_ALGORITHM,
    publicKeyPem: input.publicKeyPem,
    fingerprintSha256: input.fingerprintSha256,
    status: input.status ?? 'active',
    validFrom: input.validFrom,
    validUntil: input.validUntil ?? null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  const db = getD1Database(event)
  if (!db) {
    memoryKeys.set(record.keyId, record)
  }
  else {
    await ensureSchema(db)
    await db.prepare(`
      INSERT INTO ${TABLE_NAME} (
        key_id, owner_id, algorithm, public_key_pem, fingerprint_sha256,
        status, valid_from, valid_until, revoked_at, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9, ?10);
    `).bind(
      record.keyId,
      record.ownerId,
      record.algorithm,
      record.publicKeyPem,
      record.fingerprintSha256,
      record.status,
      record.validFrom,
      record.validUntil,
      record.createdAt,
      record.updatedAt,
    ).run()
  }
  await recordPlatformGovernanceEvent(event, {
    scope: 'plugin-signing',
    action: 'publisher-key.registered',
    actorId: normalizedOwner,
    resourceType: 'plugin-publisher-key',
    resourceId: record.keyId,
    metadata: {
      keyId: record.keyId,
      fingerprintSha256: record.fingerprintSha256,
      validFrom: record.validFrom,
      validUntil: record.validUntil,
      status: record.status,
    },
  })
  return record
}

export async function revokePublisherSigningKey(
  event: H3Event,
  ownerId: string,
  keyId: string,
): Promise<PublisherSigningKeyRecord> {
  const existing = await getPublisherSigningKey(event, keyId)
  if (!existing)
    signingError('PLUGIN_SIGNING_KEY_UNKNOWN', undefined, 404)
  if (existing.ownerId !== ownerId)
    signingError('PLUGIN_SIGNING_KEY_OWNER_MISMATCH', undefined, 403)
  if (existing.status === 'revoked')
    return existing

  const now = new Date().toISOString()
  const updated: PublisherSigningKeyRecord = {
    ...existing,
    status: 'revoked',
    revokedAt: now,
    updatedAt: now,
  }
  const db = getD1Database(event)
  if (!db) {
    memoryKeys.set(keyId, updated)
  }
  else {
    await ensureSchema(db)
    await db.prepare(`
      UPDATE ${TABLE_NAME}
      SET status = 'revoked', revoked_at = ?1, updated_at = ?2
      WHERE key_id = ?3 AND owner_id = ?4;
    `).bind(now, now, keyId, ownerId).run()
  }
  await recordPlatformGovernanceEvent(event, {
    scope: 'plugin-signing',
    action: 'publisher-key.revoked',
    actorId: ownerId,
    resourceType: 'plugin-publisher-key',
    resourceId: keyId,
    metadata: { keyId, revokedAt: now },
  })
  return updated
}

function assertKeyUsable(key: PublisherSigningKeyRecord, issuedAt: string, now: number): void {
  if (key.status === 'revoked' || key.revokedAt)
    signingError('PLUGIN_SIGNING_KEY_REVOKED')
  const issuedAtMs = Date.parse(issuedAt)
  if (issuedAtMs + CLOCK_SKEW_MS < Date.parse(key.validFrom))
    signingError('PLUGIN_SIGNING_KEY_NOT_YET_VALID')
  if (key.validUntil && issuedAtMs - CLOCK_SKEW_MS > Date.parse(key.validUntil)) {
    signingError('PLUGIN_SIGNING_KEY_EXPIRED')
  }
  if (key.validUntil && now - CLOCK_SKEW_MS > Date.parse(key.validUntil)) {
    signingError('PLUGIN_SIGNING_KEY_EXPIRED')
  }
}

function manifestFileMapSha256(manifest: Record<string, unknown>): string {
  const fileMap = manifest._files
  if (!fileMap || typeof fileMap !== 'object' || Array.isArray(fileMap)) {
    signingError('PLUGIN_SIGNING_FILE_MAP_INVALID')
  }
  const normalized: Record<string, string> = {}
  for (const [path, digest] of Object.entries(fileMap)) {
    if (typeof digest !== 'string' || !digest.trim())
      signingError('PLUGIN_SIGNING_FILE_MAP_INVALID')
    normalized[path] = digest.trim()
  }
  return sha256(serializePluginFileMap(normalized))
}

export async function verifyPluginPublisherSignature(
  event: H3Event,
  input: VerifyPublisherSignatureInput,
): Promise<VerifiedPublisherSignature> {
  let rawSignature = input.publisherSignature
  if (typeof rawSignature === 'string') {
    try {
      rawSignature = JSON.parse(rawSignature)
    }
    catch {
      signingError('PLUGIN_SIGNING_ENVELOPE_INVALID')
    }
  }
  const envelope = normalizePluginPublisherSignature(rawSignature)
  if (!envelope)
    signingError('PLUGIN_SIGNING_ENVELOPE_INVALID')
  if (envelope.algorithm !== PLUGIN_SIGNING_ALGORITHM)
    signingError('PLUGIN_SIGNING_ALGORITHM_DENIED')
  if (envelope.keyId !== input.publicKey.keyId)
    signingError('PLUGIN_SIGNING_KEY_ID_MISMATCH')

  const key = await registerPublisherSigningKey(event, input.ownerId, input.publicKey)
  if (key.keyId !== envelope.keyId || key.ownerId !== input.ownerId) {
    signingError('PLUGIN_SIGNING_KEY_OWNER_MISMATCH')
  }
  const now = Date.now()
  assertKeyUsable(key, envelope.payload.issuedAt, now)
  if (envelope.payload.expiresAt && now - CLOCK_SKEW_MS > Date.parse(envelope.payload.expiresAt)) {
    signingError('PLUGIN_SIGNING_PAYLOAD_EXPIRED')
  }

  const payload = envelope.payload
  if (
    payload.artifactSha256 !== input.artifactSha256
    || payload.artifactSize !== input.artifactSize
  ) {
    signingError('PLUGIN_SIGNING_ARTIFACT_MISMATCH')
  }
  if (
    payload.pluginId !== input.pluginId
    || payload.pluginName !== input.pluginName
    || payload.version !== input.version
  ) {
    signingError('PLUGIN_SIGNING_IDENTITY_MISMATCH')
  }
  if (payload.channel !== input.channel)
    signingError('PLUGIN_SIGNING_CHANNEL_MISMATCH')
  if (payload.policyVersion !== input.policyVersion)
    signingError('PLUGIN_SIGNING_POLICY_VERSION_MISMATCH')
  if (payload.fileMapSha256 !== manifestFileMapSha256(input.manifest)) {
    signingError('PLUGIN_SIGNING_FILE_MAP_MISMATCH')
  }

  const payloadBytes = Buffer.from(serializePluginSigningPayload(payload), 'utf8')
  if (sha256(payloadBytes) !== envelope.payloadSha256)
    signingError('PLUGIN_SIGNING_PAYLOAD_DIGEST_MISMATCH')
  let valid = false
  try {
    valid = verify(
      null,
      payloadBytes,
      createPublicKey(key.publicKeyPem),
      Buffer.from(envelope.signature, 'base64'),
    )
  }
  catch {
    valid = false
  }
  if (!valid)
    signingError('PLUGIN_SIGNING_SIGNATURE_INVALID')

  const verifiedAt = new Date().toISOString()
  await recordPlatformGovernanceEvent(event, {
    scope: 'plugin-signing',
    action: 'publisher-signature.verified',
    actorId: input.ownerId,
    resourceType: 'plugin-package',
    resourceId: input.artifactSha256,
    metadata: {
      artifactSha256: input.artifactSha256,
      keyId: key.keyId,
      payloadSha256: envelope.payloadSha256,
      verifiedAt,
    },
  })
  return { envelope, key, verifiedAt }
}

function readAttestationSecret(event: H3Event, name: string): string {
  const bindings = readCloudflareBindings(event) as unknown as Record<string, unknown> | undefined
  const fromBinding = typeof bindings?.[name] === 'string' ? String(bindings[name]).trim() : ''
  const fromEnvironment = process.env[name]?.trim() ?? ''
  const value = fromBinding || fromEnvironment
  if (!value)
    signingError('PLUGIN_ATTESTATION_KEY_UNAVAILABLE', undefined, 503)
  return value
}

export async function createPluginAdmissionAttestation(
  event: H3Event,
  input: CreateAdmissionAttestationInput,
): Promise<PluginAdmissionAttestationV1> {
  if (input.scanDecision !== 'passed' && input.scanDecision !== 'review-required') {
    signingError('PLUGIN_ATTESTATION_SCAN_REJECTED')
  }
  const currentKey = await getPublisherSigningKey(event, input.publisher.key.keyId)
  if (!currentKey || currentKey.ownerId !== input.publisher.key.ownerId) {
    signingError('PLUGIN_SIGNING_KEY_UNKNOWN')
  }
  const publisher = await verifyPluginPublisherSignature(event, {
    ownerId: currentKey.ownerId,
    publicKey: {
      keyId: currentKey.keyId,
      publicKeyPem: currentKey.publicKeyPem,
      validFrom: currentKey.validFrom,
      ...(currentKey.validUntil ? { validUntil: currentKey.validUntil } : {}),
      status: currentKey.status === 'overlap' ? 'overlap' : 'active',
    },
    publisherSignature: input.publisher.envelope,
    artifactSha256: input.artifactSha256,
    artifactSize: input.artifactSize,
    pluginId: input.pluginId,
    pluginName: input.pluginName,
    version: input.version,
    channel: input.channel,
    policyVersion: input.policyVersion,
    manifest: input.manifest,
  })

  const reviewedAt = normalizeTimestamp(input.reviewedAt, 'reviewedAt')
  const issuedAt = new Date().toISOString()
  const payload: PluginAdmissionAttestationPayloadV1 = {
    contract: PLUGIN_ATTESTATION_CONTRACT,
    issuer: PLUGIN_ATTESTATION_ISSUER,
    audience: PLUGIN_ATTESTATION_AUDIENCE,
    artifactSha256: input.artifactSha256,
    artifactSize: input.artifactSize,
    pluginId: input.pluginId,
    pluginName: input.pluginName,
    version: input.version,
    channel: input.channel,
    policyVersion: input.policyVersion,
    policyDecision: 'passed',
    scanReportSha256: input.scanReportSha256,
    scanDecision: input.scanDecision,
    publisherSignature: publisher.envelope,
    publisherKey: {
      algorithm: PLUGIN_SIGNING_ALGORITHM,
      keyId: currentKey.keyId,
      ownerId: currentKey.ownerId,
      publicKeyPem: currentKey.publicKeyPem,
      status: currentKey.status === 'overlap' ? 'overlap' : 'active',
      validFrom: currentKey.validFrom,
      ...(currentKey.validUntil ? { validUntil: currentKey.validUntil } : {}),
    },
    review: {
      decision: 'approved',
      actorId: input.reviewActorId,
      reviewedAt,
    },
    admission: 'eligible',
    issuedAt,
  }
  const payloadBytes = Buffer.from(serializePluginAdmissionPayload(payload), 'utf8')
  const privateKey = createPrivateKey(readAttestationSecret(event, 'PLUGIN_ATTESTATION_PRIVATE_KEY_PEM'))
  if (privateKey.asymmetricKeyType !== 'ed25519')
    signingError('PLUGIN_ATTESTATION_ALGORITHM_DENIED', undefined, 503)
  const keyId = readAttestationSecret(event, 'PLUGIN_ATTESTATION_KEY_ID')
  if (!KEY_ID_RE.test(keyId))
    signingError('PLUGIN_ATTESTATION_KEY_ID_INVALID', undefined, 503)
  const signature = sign(null, payloadBytes, privateKey)
  if (!verify(null, payloadBytes, createPublicKey(privateKey), signature)) {
    signingError('PLUGIN_ATTESTATION_SELF_CHECK_FAILED', undefined, 503)
  }

  const attestation: PluginAdmissionAttestationV1 = {
    algorithm: PLUGIN_SIGNING_ALGORITHM,
    keyId,
    payload,
    payloadSha256: sha256(payloadBytes),
    signature: signature.toString('base64'),
  }
  await recordPlatformGovernanceEvent(event, {
    scope: 'plugin-signing',
    action: 'admission-attestation.issued',
    actorId: input.reviewActorId,
    resourceType: 'plugin-package',
    resourceId: input.artifactSha256,
    metadata: {
      artifactSha256: input.artifactSha256,
      publisherKeyId: currentKey.keyId,
      nexusKeyId: keyId,
      payloadSha256: attestation.payloadSha256,
      reviewedAt,
    },
  })
  return attestation
}

export function resetPluginSigningStoreForTests(): void {
  memoryKeys.clear()
  schemaInitialized = false
}
