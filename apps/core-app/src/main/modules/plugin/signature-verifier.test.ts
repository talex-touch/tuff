import type {
  PluginAdmissionAttestationPayloadV1,
  PluginAdmissionAttestationV1,
  PluginSigningPayloadV1,
  PluginTrustRootV1
} from '@talex-touch/utils/plugin'
import type { KeyObject } from 'node:crypto'
import type { PluginPackageTrustMetadata } from './signature-verifier'
import { Buffer } from 'node:buffer'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  PLUGIN_ATTESTATION_AUDIENCE,
  PLUGIN_ATTESTATION_CONTRACT,
  PLUGIN_ATTESTATION_ISSUER,
  PLUGIN_SIGNING_ALGORITHM,
  PLUGIN_SIGNING_CONTRACT,
  serializePluginAdmissionPayload,
  serializePluginFileMap,
  serializePluginSigningPayload
} from '@talex-touch/utils/plugin'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyPluginPackageTrust } from './signature-verifier'

const NOW = Date.parse('2026-07-19T12:00:00.000Z')
const ISSUED_AT = '2026-07-01T12:00:00.000Z'
const EXPIRES_AT = '2026-08-01T12:00:00.000Z'
const temporaryDirectories: string[] = []

interface SignedFixture {
  filePath: string
  metadata: PluginPackageTrustMetadata
  trustRoot: PluginTrustRootV1
  publisherKeyId: string
  nexusPrivateKey: KeyObject
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function publicKeyPem(key: KeyObject): string {
  return key.export({ type: 'spki', format: 'pem' }).toString().trim()
}

function signBase64(payload: string, privateKey: KeyObject): string {
  return sign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64')
}

function resignNexusAttestation(fixture: SignedFixture): void {
  const payload = serializePluginAdmissionPayload(fixture.metadata.nexusAttestation.payload)
  fixture.metadata.nexusAttestation.payloadSha256 = sha256(payload)
  fixture.metadata.nexusAttestation.signature = signBase64(payload, fixture.nexusPrivateKey)
}

async function createSignedFixture(): Promise<SignedFixture> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'core-app-plugin-trust-'))
  temporaryDirectories.push(directory)
  const artifact = Buffer.from('real signed plugin archive bytes', 'utf8')
  const filePath = path.join(directory, 'trusted-plugin.tpex')
  await writeFile(filePath, artifact)

  const publisherKeys = generateKeyPairSync('ed25519')
  const nexusKeys = generateKeyPairSync('ed25519')
  const artifactSha256 = sha256(artifact)
  const fileMapSha256 = sha256(
    serializePluginFileMap({
      'manifest.json': '1a'.repeat(32),
      'dist/index.js': '2b'.repeat(32)
    })
  )
  const publisherKeyId = 'publisher-key-2026'
  const publisherPayload: PluginSigningPayloadV1 = {
    contract: PLUGIN_SIGNING_CONTRACT,
    policyVersion: 'plugin-policy/v7',
    pluginId: 'plugin-clipboard-history',
    pluginName: 'clipboard-history',
    version: '4.2.0',
    channel: 'RELEASE',
    artifactSha256,
    artifactSize: artifact.length,
    fileMapSha256,
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT
  }
  const publisherPayloadBytes = serializePluginSigningPayload(publisherPayload)
  const publisherSignature = {
    algorithm: PLUGIN_SIGNING_ALGORITHM,
    keyId: publisherKeyId,
    payload: publisherPayload,
    payloadSha256: sha256(publisherPayloadBytes),
    signature: signBase64(publisherPayloadBytes, publisherKeys.privateKey)
  } as const
  const attestationPayload: PluginAdmissionAttestationPayloadV1 = {
    contract: PLUGIN_ATTESTATION_CONTRACT,
    issuer: PLUGIN_ATTESTATION_ISSUER,
    audience: PLUGIN_ATTESTATION_AUDIENCE,
    artifactSha256,
    artifactSize: artifact.length,
    pluginId: publisherPayload.pluginId,
    pluginName: publisherPayload.pluginName,
    version: publisherPayload.version,
    channel: publisherPayload.channel,
    policyVersion: publisherPayload.policyVersion,
    policyDecision: 'passed',
    scanReportSha256: '3c'.repeat(32),
    scanDecision: 'passed',
    publisherSignature,
    publisherKey: {
      algorithm: PLUGIN_SIGNING_ALGORITHM,
      keyId: publisherKeyId,
      ownerId: 'publisher-account-42',
      publicKeyPem: publicKeyPem(publisherKeys.publicKey),
      status: 'active',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2026-12-31T23:59:59.999Z'
    },
    review: {
      decision: 'approved',
      actorId: 'nexus-reviewer-17',
      reviewedAt: '2026-07-02T12:00:00.000Z'
    },
    admission: 'eligible',
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT
  }
  const attestationPayloadBytes = serializePluginAdmissionPayload(attestationPayload)
  const attestation: PluginAdmissionAttestationV1 = {
    algorithm: PLUGIN_SIGNING_ALGORITHM,
    keyId: 'nexus-root-2026',
    payload: attestationPayload,
    payloadSha256: sha256(attestationPayloadBytes),
    signature: signBase64(attestationPayloadBytes, nexusKeys.privateKey)
  }

  return {
    filePath,
    metadata: {
      sourceType: 'registry',
      pluginId: publisherPayload.pluginId,
      pluginName: publisherPayload.pluginName,
      version: publisherPayload.version,
      channel: publisherPayload.channel,
      artifactSha256,
      packageSize: artifact.length,
      nexusAttestation: attestation
    },
    trustRoot: {
      algorithm: PLUGIN_SIGNING_ALGORITHM,
      keyId: attestation.keyId,
      publicKeyPem: publicKeyPem(nexusKeys.publicKey),
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2026-12-31T23:59:59.999Z'
    },
    publisherKeyId,
    nexusPrivateKey: nexusKeys.privateKey
  }
}

async function verifyFixture(
  fixture: SignedFixture,
  options: Parameters<typeof verifyPluginPackageTrust>[2] = {}
) {
  return verifyPluginPackageTrust(fixture.filePath, fixture.metadata, {
    now: NOW,
    trustRoots: [fixture.trustRoot],
    ...options
  })
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('verifyPluginPackageTrust', () => {
  it('accepts real Ed25519 publisher and Nexus signatures over canonical artifact metadata', async () => {
    const fixture = await createSignedFixture()

    await expect(verifyFixture(fixture)).resolves.toEqual({
      ok: true,
      code: 'PLUGIN_TRUST_VERIFIED',
      artifactSha256: fixture.metadata.artifactSha256,
      publisherKeyId: fixture.publisherKeyId,
      nexusKeyId: fixture.trustRoot.keyId
    })
  })

  it.each([
    {
      name: 'the downloaded artifact size',
      alter: (fixture: SignedFixture) => {
        fixture.metadata.packageSize += 1
      },
      code: 'PLUGIN_TRUST_ARTIFACT_SIZE_MISMATCH'
    },
    {
      name: 'the downloaded artifact digest',
      alter: (fixture: SignedFixture) => {
        fixture.metadata.artifactSha256 = '00'.repeat(32)
      },
      code: 'PLUGIN_TRUST_ARTIFACT_DIGEST_MISMATCH'
    },
    {
      name: 'the Nexus canonical payload digest',
      alter: (fixture: SignedFixture) => {
        fixture.metadata.nexusAttestation.payloadSha256 = '00'.repeat(32)
      },
      code: 'PLUGIN_TRUST_PAYLOAD_DIGEST_MISMATCH'
    },
    {
      name: 'the registry plugin identity and version',
      alter: (fixture: SignedFixture) => {
        fixture.metadata.version = '4.2.1'
      },
      code: 'PLUGIN_TRUST_IDENTITY_MISMATCH'
    },
    {
      name: 'the registry release channel',
      alter: (fixture: SignedFixture) => {
        fixture.metadata.channel = 'BETA'
      },
      code: 'PLUGIN_TRUST_CHANNEL_MISMATCH'
    }
  ])('rejects when $name differs from the signed value', async ({ alter, code }) => {
    const fixture = await createSignedFixture()
    alter(fixture)

    await expect(verifyFixture(fixture)).resolves.toMatchObject({ ok: false, code })
  })

  it.each([
    {
      name: 'a policy decision other than passed',
      alter: (fixture: SignedFixture) => {
        ;(fixture.metadata.nexusAttestation.payload as { policyDecision: string }).policyDecision =
          'blocked'
      },
      code: 'PLUGIN_TRUST_POLICY_REJECTED'
    },
    {
      name: 'a rejected scan decision',
      alter: (fixture: SignedFixture) => {
        ;(fixture.metadata.nexusAttestation.payload as { scanDecision: string }).scanDecision =
          'failed'
      },
      code: 'PLUGIN_TRUST_SCAN_REJECTED'
    },
    {
      name: 'an unapproved review',
      alter: (fixture: SignedFixture) => {
        ;(fixture.metadata.nexusAttestation.payload.review as { decision: string }).decision =
          'rejected'
      },
      code: 'PLUGIN_TRUST_REVIEW_REQUIRED'
    },
    {
      name: 'a blocked Nexus admission',
      alter: (fixture: SignedFixture) => {
        ;(fixture.metadata.nexusAttestation.payload as { admission: string }).admission = 'blocked'
      },
      code: 'PLUGIN_TRUST_ADMISSION_REJECTED'
    },
    {
      name: 'a wrong Nexus issuer',
      alter: (fixture: SignedFixture) => {
        ;(fixture.metadata.nexusAttestation.payload as { issuer: string }).issuer =
          'untrusted-nexus'
      },
      code: 'PLUGIN_TRUST_ISSUER_INVALID'
    },
    {
      name: 'a wrong CoreApp audience',
      alter: (fixture: SignedFixture) => {
        ;(fixture.metadata.nexusAttestation.payload as { audience: string }).audience =
          'another-client'
      },
      code: 'PLUGIN_TRUST_AUDIENCE_INVALID'
    },
    {
      name: 'an algorithm downgrade',
      alter: (fixture: SignedFixture) => {
        ;(fixture.metadata.nexusAttestation as { algorithm: string }).algorithm = 'RSA-SHA256'
      },
      code: 'PLUGIN_TRUST_ALGORITHM_DENIED'
    },
    {
      name: 'a revoked publisher-key status',
      alter: (fixture: SignedFixture) => {
        ;(fixture.metadata.nexusAttestation.payload.publisherKey as { status: string }).status =
          'revoked'
      },
      code: 'PLUGIN_TRUST_METADATA_INVALID'
    }
  ])('fails closed before cryptographic verification for $name', async ({ alter, code }) => {
    const fixture = await createSignedFixture()
    alter(fixture)

    await expect(verifyFixture(fixture)).resolves.toMatchObject({ ok: false, code })
  })

  it.each([
    {
      name: 'an unknown Nexus root',
      roots: (fixture: SignedFixture) => [{ ...fixture.trustRoot, keyId: 'other-root' }],
      code: 'PLUGIN_TRUST_KEY_UNKNOWN'
    },
    {
      name: 'an invalid Nexus root public key',
      roots: (fixture: SignedFixture) => [
        { ...fixture.trustRoot, publicKeyPem: 'not a public key' }
      ],
      code: 'PLUGIN_TRUST_ATTESTATION_SIGNATURE_INVALID'
    },
    {
      name: 'an expired Nexus root',
      roots: (fixture: SignedFixture) => [
        { ...fixture.trustRoot, validUntil: '2026-07-10T00:00:00.000Z' }
      ],
      code: 'PLUGIN_TRUST_KEY_EXPIRED'
    },
    {
      name: 'a revoked Nexus root',
      roots: (fixture: SignedFixture) => [
        { ...fixture.trustRoot, revokedAt: '2026-07-10T00:00:00.000Z' }
      ],
      code: 'PLUGIN_TRUST_KEY_REVOKED'
    }
  ])('rejects $name', async ({ roots, code }) => {
    const fixture = await createSignedFixture()

    await expect(verifyFixture(fixture, { trustRoots: roots(fixture) })).resolves.toMatchObject({
      ok: false,
      code
    })
  })

  it.each([
    {
      name: 'a corrupted publisher signature',
      alter: (fixture: SignedFixture) => {
        fixture.metadata.nexusAttestation.payload.publisherSignature.signature = 'A'.repeat(88)
      },
      code: 'PLUGIN_TRUST_PUBLISHER_SIGNATURE_INVALID'
    },
    {
      name: 'a publisher key not valid when the payload was issued',
      alter: (fixture: SignedFixture) => {
        fixture.metadata.nexusAttestation.payload.publisherKey.validFrom =
          '2026-07-15T00:00:00.000Z'
      },
      code: 'PLUGIN_TRUST_KEY_NOT_YET_VALID'
    },
    {
      name: 'an expired publisher key',
      alter: (fixture: SignedFixture) => {
        fixture.metadata.nexusAttestation.payload.publisherKey.validUntil =
          '2026-07-10T00:00:00.000Z'
      },
      code: 'PLUGIN_TRUST_KEY_EXPIRED'
    }
  ])('rejects $name', async ({ alter, code }) => {
    const fixture = await createSignedFixture()
    alter(fixture)
    resignNexusAttestation(fixture)

    await expect(verifyFixture(fixture)).resolves.toMatchObject({ ok: false, code })
  })

  it('rejects a publisher key listed in the current revocation set', async () => {
    const fixture = await createSignedFixture()

    await expect(
      verifyFixture(fixture, {
        revokedPublisherKeyIds: [fixture.publisherKeyId]
      })
    ).resolves.toMatchObject({ ok: false, code: 'PLUGIN_TRUST_KEY_REVOKED' })
  })

  it('uses only valid JSON trust roots explicitly supplied through the environment', async () => {
    const fixture = await createSignedFixture()
    const previous = process.env.TUFF_PLUGIN_TRUST_ROOTS_JSON

    try {
      process.env.TUFF_PLUGIN_TRUST_ROOTS_JSON = JSON.stringify([fixture.trustRoot])
      await expect(
        verifyPluginPackageTrust(fixture.filePath, fixture.metadata, { now: NOW })
      ).resolves.toMatchObject({ ok: true, code: 'PLUGIN_TRUST_VERIFIED' })

      process.env.TUFF_PLUGIN_TRUST_ROOTS_JSON = '{invalid json'
      await expect(
        verifyPluginPackageTrust(fixture.filePath, fixture.metadata, { now: NOW })
      ).resolves.toMatchObject({ ok: false, code: 'PLUGIN_TRUST_KEY_UNKNOWN' })
    } finally {
      if (previous === undefined) delete process.env.TUFF_PLUGIN_TRUST_ROOTS_JSON
      else process.env.TUFF_PLUGIN_TRUST_ROOTS_JSON = previous
    }
  })
})
