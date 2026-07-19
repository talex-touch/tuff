import type {
  PluginPublisherSignatureV1,
  PluginSigningPayloadV1,
} from '@talex-touch/utils/plugin'
import type { H3Event } from 'h3'
import type {
  CreateAdmissionAttestationInput,
  RegisterPublisherSigningKeyInput,
  VerifyPublisherSignatureInput,
} from './pluginSigning'
import { Buffer } from 'node:buffer'
import {
  createHash,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto'
import {
  PLUGIN_ATTESTATION_AUDIENCE,
  PLUGIN_ATTESTATION_ISSUER,
  PLUGIN_SIGNING_ALGORITHM,
  PLUGIN_SIGNING_CONTRACT,
  serializePluginAdmissionPayload,
  serializePluginFileMap,
  serializePluginSigningPayload,
} from '@talex-touch/utils/plugin'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPluginAdmissionAttestation,
  getPublisherSigningKey,
  listPublisherSigningKeys,
  registerPublisherSigningKey,
  resetPluginSigningStoreForTests,
  revokePublisherSigningKey,
  verifyPluginPublisherSignature,
} from './pluginSigning'

vi.mock('./platformGovernanceStore', () => ({
  recordPlatformGovernanceEvent: async () => ({}),
}))

const NOW = '2026-07-19T12:00:00.000Z'
const OWNER_ID = 'publisher-owner'
const ARTIFACT_SHA256 = 'a'.repeat(64)
const SCAN_REPORT_SHA256 = 'b'.repeat(64)
const KEY_ID = 'publisher-key-01'
const manifest = {
  _files: {
    'index.js': `sha256-${'c'.repeat(64)}`,
    'manifest.json': `sha256-${'d'.repeat(64)}`,
  },
}
const publisherKeys = generateKeyPairSync('ed25519')
const nexusKeys = generateKeyPairSync('ed25519')
const publisherPublicKeyPem = publisherKeys.publicKey.export({ format: 'pem', type: 'spki' }).toString()
const nexusPrivateKeyPem = nexusKeys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function createEvent(bindings: Record<string, unknown> = {}): H3Event {
  return {
    context: {
      cloudflare: { env: bindings },
    },
  } as H3Event
}

function signingKey(overrides: Partial<RegisterPublisherSigningKeyInput> = {}): RegisterPublisherSigningKeyInput {
  return {
    keyId: KEY_ID,
    publicKeyPem: publisherPublicKeyPem,
    validFrom: '2026-07-18T12:00:00.000Z',
    validUntil: '2026-07-20T12:00:00.000Z',
    ...overrides,
  }
}

function signingPayload(overrides: Partial<PluginSigningPayloadV1> = {}): PluginSigningPayloadV1 {
  return {
    contract: PLUGIN_SIGNING_CONTRACT,
    policyVersion: 'plugin-policy-2026-07',
    pluginId: 'focus-flow',
    pluginName: 'Focus Flow',
    version: '1.4.0',
    channel: 'RELEASE',
    artifactSha256: ARTIFACT_SHA256,
    artifactSize: 4096,
    fileMapSha256: sha256(serializePluginFileMap(manifest._files)),
    issuedAt: NOW,
    expiresAt: '2026-07-19T13:00:00.000Z',
    ...overrides,
  }
}

function publisherSignature(payloadOverrides: Partial<PluginSigningPayloadV1> = {}): PluginPublisherSignatureV1 {
  const payload = signingPayload(payloadOverrides)
  const bytes = Buffer.from(serializePluginSigningPayload(payload), 'utf8')
  return {
    algorithm: PLUGIN_SIGNING_ALGORITHM,
    keyId: KEY_ID,
    payload,
    payloadSha256: sha256(bytes),
    signature: sign(null, bytes, publisherKeys.privateKey).toString('base64'),
  }
}

function verificationInput(overrides: Partial<VerifyPublisherSignatureInput> = {}): VerifyPublisherSignatureInput {
  return {
    ownerId: OWNER_ID,
    publicKey: signingKey(),
    publisherSignature: publisherSignature(),
    artifactSha256: ARTIFACT_SHA256,
    artifactSize: 4096,
    pluginId: 'focus-flow',
    pluginName: 'Focus Flow',
    version: '1.4.0',
    channel: 'RELEASE',
    policyVersion: 'plugin-policy-2026-07',
    manifest,
    ...overrides,
  }
}

interface SigningKeyRow {
  key_id: string
  owner_id: string
  algorithm: string
  public_key_pem: string
  fingerprint_sha256: string
  status: 'active' | 'overlap' | 'revoked'
  valid_from: string
  valid_until: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

class MockStatement {
  private args: unknown[] = []

  constructor(
    private readonly db: MockD1Database,
    private readonly sql: string,
  ) {}

  bind(...args: unknown[]) {
    this.args = args
    return this
  }

  async run() {
    return this.db.run(this.sql, this.args)
  }

  async first<T>() {
    return this.db.first<T>(this.sql, this.args)
  }

  async all<T>() {
    return this.db.all<T>(this.sql, this.args)
  }
}

class MockD1Database {
  readonly rows = new Map<string, SigningKeyRow>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: unknown[]) {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX'))
      return { meta: { changes: 0 } }

    if (sql.includes('INSERT INTO plugin_publisher_signing_keys')) {
      const [
        keyId,
        ownerId,
        algorithm,
        publicKeyPem,
        fingerprintSha256,
        status,
        validFrom,
        validUntil,
        createdAt,
        updatedAt,
      ] = args as string[]
      this.rows.set(keyId, {
        key_id: keyId,
        owner_id: ownerId,
        algorithm,
        public_key_pem: publicKeyPem,
        fingerprint_sha256: fingerprintSha256,
        status: status as SigningKeyRow['status'],
        valid_from: validFrom,
        valid_until: validUntil ?? null,
        revoked_at: null,
        created_at: createdAt,
        updated_at: updatedAt,
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('SET status = \'revoked\'')) {
      const [revokedAt, updatedAt, keyId, ownerId] = args as string[]
      const row = this.rows.get(keyId)
      if (!row || row.owner_id !== ownerId)
        return { meta: { changes: 0 } }
      this.rows.set(keyId, {
        ...row,
        status: 'revoked',
        revoked_at: revokedAt,
        updated_at: updatedAt,
      })
      return { meta: { changes: 1 } }
    }

    return { meta: { changes: 0 } }
  }

  first<T>(sql: string, args: unknown[]): T | null {
    if (sql.includes('FROM plugin_publisher_signing_keys WHERE key_id'))
      return (this.rows.get(args[0] as string) ?? null) as T | null
    return null
  }

  all<T>(sql: string, args: unknown[]) {
    if (sql.includes('FROM plugin_publisher_signing_keys WHERE owner_id')) {
      const ownerId = args[0] as string
      const results = [...this.rows.values()]
        .filter(row => row.owner_id === ownerId)
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
      return { results: results as T[] }
    }
    return { results: [] as T[] }
  }
}

beforeEach(() => {
  resetPluginSigningStoreForTests()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(NOW))
})

afterEach(() => {
  resetPluginSigningStoreForTests()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('plugin publisher signing key store', () => {
  it('keeps memory registration, owner-scoped listing, owner enforcement, and revocation authoritative', async () => {
    const event = createEvent()
    const registered = await registerPublisherSigningKey(event, OWNER_ID, signingKey())

    expect(await listPublisherSigningKeys(event, OWNER_ID)).toEqual([
      expect.objectContaining({
        keyId: KEY_ID,
        ownerId: OWNER_ID,
        status: 'active',
        publicKeyPem: publisherPublicKeyPem.trim(),
      }),
    ])
    await expect(revokePublisherSigningKey(event, 'another-owner', KEY_ID)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'PLUGIN_SIGNING_KEY_OWNER_MISMATCH',
    })

    const revoked = await revokePublisherSigningKey(event, OWNER_ID, KEY_ID)
    expect(revoked).toMatchObject({ keyId: registered.keyId, status: 'revoked' })
    expect(revoked.revokedAt).toEqual(expect.any(String))
    await expect(registerPublisherSigningKey(event, OWNER_ID, signingKey())).rejects.toMatchObject({
      statusMessage: 'PLUGIN_SIGNING_KEY_REVOKED',
    })
  })

  it('preserves registration, list, and revocation results through the D1 store path', async () => {
    const db = new MockD1Database()
    const event = createEvent({ DB: db })

    const registered = await registerPublisherSigningKey(event, OWNER_ID, signingKey({ status: 'overlap' }))
    expect(await getPublisherSigningKey(event, KEY_ID)).toMatchObject({
      keyId: KEY_ID,
      ownerId: OWNER_ID,
      status: 'overlap',
      fingerprintSha256: registered.fingerprintSha256,
    })
    expect(await listPublisherSigningKeys(event, OWNER_ID)).toEqual([
      expect.objectContaining({ keyId: KEY_ID, status: 'overlap' }),
    ])

    await revokePublisherSigningKey(event, OWNER_ID, KEY_ID)
    expect(await getPublisherSigningKey(event, KEY_ID)).toMatchObject({
      status: 'revoked',
      revokedAt: expect.any(String),
    })
  })
})

describe('plugin publisher signature verification', () => {
  it.each([
    { name: 'active key', key: signingKey(), setup: async () => undefined, expected: 'active' },
    { name: 'rotation overlap key', key: signingKey({ status: 'overlap' }), setup: async () => undefined, expected: 'overlap' },
    {
      name: 'revoked key',
      key: signingKey(),
      setup: async (event: H3Event) => {
        await registerPublisherSigningKey(event, OWNER_ID, signingKey())
        await revokePublisherSigningKey(event, OWNER_ID, KEY_ID)
      },
      failure: 'PLUGIN_SIGNING_KEY_REVOKED',
    },
    {
      name: 'not-yet-valid key',
      key: signingKey({ validFrom: '2026-07-19T12:10:01.000Z' }),
      setup: async () => undefined,
      failure: 'PLUGIN_SIGNING_KEY_NOT_YET_VALID',
    },
    {
      name: 'expired key',
      key: signingKey({ validFrom: '2026-07-17T12:00:00.000Z', validUntil: '2026-07-19T11:49:59.000Z' }),
      setup: async () => undefined,
      failure: 'PLUGIN_SIGNING_KEY_EXPIRED',
    },
  ])('accepts $name only while it is valid for the payload', async ({ key, setup, expected, failure }) => {
    const event = createEvent()
    await setup(event)
    const operation = verifyPluginPublisherSignature(event, verificationInput({ publicKey: key }))

    if (failure) {
      await expect(operation).rejects.toMatchObject({ statusMessage: failure })
      return
    }

    await expect(operation).resolves.toMatchObject({
      key: { keyId: KEY_ID, ownerId: OWNER_ID, status: expected },
      envelope: { payload: expect.objectContaining({ artifactSha256: ARTIFACT_SHA256 }) },
    })
  })

  it.each([
    {
      name: 'a signed payload field changes without a new digest',
      input: () => verificationInput(),
      mutate: (input: VerifyPublisherSignatureInput) => {
        const envelope = input.publisherSignature as PluginPublisherSignatureV1
        return {
          ...input,
          publisherSignature: {
            ...envelope,
            payload: { ...envelope.payload, expiresAt: '2026-07-19T13:30:00.000Z' },
          },
        }
      },
      code: 'PLUGIN_SIGNING_PAYLOAD_DIGEST_MISMATCH',
    },
    {
      name: 'artifact digest differs from the signed artifact',
      input: () => verificationInput({ artifactSha256: 'e'.repeat(64) }),
      mutate: (input: VerifyPublisherSignatureInput) => input,
      code: 'PLUGIN_SIGNING_ARTIFACT_MISMATCH',
    },
    {
      name: 'the manifest file map differs from the signed file map',
      input: () => verificationInput({
        manifest: { _files: { ...manifest._files, 'index.js': `sha256-${'e'.repeat(64)}` } },
      }),
      mutate: (input: VerifyPublisherSignatureInput) => input,
      code: 'PLUGIN_SIGNING_FILE_MAP_MISMATCH',
    },
    {
      name: 'channel differs from the signed channel',
      input: () => verificationInput({ channel: 'BETA' }),
      mutate: (input: VerifyPublisherSignatureInput) => input,
      code: 'PLUGIN_SIGNING_CHANNEL_MISMATCH',
    },
  ])('rejects when $name', async ({ input, mutate, code }) => {
    const event = createEvent()
    await expect(verifyPluginPublisherSignature(event, mutate(input()))).rejects.toMatchObject({
      statusMessage: code,
    })
  })
})

describe('nexus admission attestations', () => {
  it('canonically signs issuer, audience, review, scan, and publisher bindings', async () => {
    const event = createEvent({
      PLUGIN_ATTESTATION_PRIVATE_KEY_PEM: nexusPrivateKeyPem,
      PLUGIN_ATTESTATION_KEY_ID: 'nexus-key-01',
    })
    const publisher = await verifyPluginPublisherSignature(event, verificationInput())
    const attestation = await createPluginAdmissionAttestation(event, {
      artifactSha256: ARTIFACT_SHA256,
      artifactSize: 4096,
      pluginId: 'focus-flow',
      pluginName: 'Focus Flow',
      version: '1.4.0',
      channel: 'RELEASE',
      policyVersion: 'plugin-policy-2026-07',
      manifest,
      scanReportSha256: SCAN_REPORT_SHA256,
      scanDecision: 'review-required',
      publisher,
      reviewActorId: 'reviewer-17',
      reviewedAt: '2026-07-19T11:59:00.000Z',
    })
    const payloadBytes = Buffer.from(serializePluginAdmissionPayload(attestation.payload), 'utf8')

    expect(attestation).toMatchObject({
      algorithm: PLUGIN_SIGNING_ALGORITHM,
      keyId: 'nexus-key-01',
      payloadSha256: sha256(payloadBytes),
      payload: {
        issuer: PLUGIN_ATTESTATION_ISSUER,
        audience: PLUGIN_ATTESTATION_AUDIENCE,
        scanReportSha256: SCAN_REPORT_SHA256,
        scanDecision: 'review-required',
        review: {
          decision: 'approved',
          actorId: 'reviewer-17',
          reviewedAt: '2026-07-19T11:59:00.000Z',
        },
        publisherSignature: publisher.envelope,
        publisherKey: expect.objectContaining({
          keyId: KEY_ID,
          ownerId: OWNER_ID,
          status: 'active',
        }),
      },
    })
    expect(verify(null, payloadBytes, nexusKeys.publicKey, Buffer.from(attestation.signature, 'base64'))).toBe(true)

    for (const alteredPayload of [
      { ...attestation.payload, issuer: 'untrusted-nexus' },
      { ...attestation.payload, audience: 'another-client' },
      { ...attestation.payload, scanDecision: 'passed' as const },
      { ...attestation.payload, review: { ...attestation.payload.review, actorId: 'other-reviewer' } },
    ]) {
      expect(verify(
        null,
        Buffer.from(serializePluginAdmissionPayload(alteredPayload as typeof attestation.payload), 'utf8'),
        nexusKeys.publicKey,
        Buffer.from(attestation.signature, 'base64'),
      )).toBe(false)
    }
  })

  it.each([
    {
      name: 'the publisher payload changes after verification',
      mutate: (input: CreateAdmissionAttestationInput) => {
        const envelope = input.publisher.envelope
        return {
          ...input,
          publisher: {
            ...input.publisher,
            envelope: {
              ...envelope,
              payload: { ...envelope.payload, expiresAt: '2026-07-19T13:30:00.000Z' },
            },
          },
        }
      },
      code: 'PLUGIN_SIGNING_PAYLOAD_DIGEST_MISMATCH',
    },
    {
      name: 'the admitted artifact changes after verification',
      mutate: (input: CreateAdmissionAttestationInput) => ({ ...input, artifactSha256: 'e'.repeat(64) }),
      code: 'PLUGIN_SIGNING_ARTIFACT_MISMATCH',
    },
    {
      name: 'the manifest file map changes after verification',
      mutate: (input: CreateAdmissionAttestationInput) => ({
        ...input,
        manifest: { _files: { ...manifest._files, 'index.js': `sha256-${'e'.repeat(64)}` } },
      }),
      code: 'PLUGIN_SIGNING_FILE_MAP_MISMATCH',
    },
    {
      name: 'the admitted channel changes after verification',
      mutate: (input: CreateAdmissionAttestationInput) => ({ ...input, channel: 'BETA' }),
      code: 'PLUGIN_SIGNING_CHANNEL_MISMATCH',
    },
  ])('fails closed during admission review when $name', async ({ mutate, code }) => {
    const event = createEvent({
      PLUGIN_ATTESTATION_PRIVATE_KEY_PEM: nexusPrivateKeyPem,
      PLUGIN_ATTESTATION_KEY_ID: 'nexus-key-01',
    })
    const publisher = await verifyPluginPublisherSignature(event, verificationInput())
    const input: CreateAdmissionAttestationInput = {
      artifactSha256: ARTIFACT_SHA256,
      artifactSize: 4096,
      pluginId: 'focus-flow',
      pluginName: 'Focus Flow',
      version: '1.4.0',
      channel: 'RELEASE',
      policyVersion: 'plugin-policy-2026-07',
      manifest,
      scanReportSha256: SCAN_REPORT_SHA256,
      scanDecision: 'passed',
      publisher,
      reviewActorId: 'reviewer-17',
      reviewedAt: '2026-07-19T11:59:00.000Z',
    }

    await expect(createPluginAdmissionAttestation(event, mutate(input))).rejects.toMatchObject({
      statusMessage: code,
    })
  })

  it('fails closed when Nexus signing secrets are missing or unusable', async () => {
    vi.stubEnv('PLUGIN_ATTESTATION_PRIVATE_KEY_PEM', '')
    vi.stubEnv('PLUGIN_ATTESTATION_KEY_ID', '')
    const publisher = await verifyPluginPublisherSignature(createEvent(), verificationInput())
    const input = {
      artifactSha256: ARTIFACT_SHA256,
      artifactSize: 4096,
      pluginId: 'focus-flow',
      pluginName: 'Focus Flow',
      version: '1.4.0',
      channel: 'RELEASE' as const,
      policyVersion: 'plugin-policy-2026-07',
      manifest,
      scanReportSha256: SCAN_REPORT_SHA256,
      scanDecision: 'passed' as const,
      publisher,
      reviewActorId: 'reviewer-17',
      reviewedAt: '2026-07-19T11:59:00.000Z',
    }

    await expect(createPluginAdmissionAttestation(createEvent(), input)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'PLUGIN_ATTESTATION_KEY_UNAVAILABLE',
    })
    await expect(createPluginAdmissionAttestation(createEvent({
      PLUGIN_ATTESTATION_PRIVATE_KEY_PEM: 'not-an-ed25519-private-key',
      PLUGIN_ATTESTATION_KEY_ID: 'nexus-key-01',
    }), input)).rejects.toThrow()
  })
})
