import type {
  PluginAdmissionAttestationV1,
  PluginSigningPayloadV1
} from '@talex-touch/utils/plugin'
import type { PluginInstallRequest } from '@talex-touch/utils/plugin/providers/types'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { PluginInstaller, PreparedPluginInstall } from './plugin-installer'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'
import { PluginInstallQueue } from './install-queue'

vi.mock('./plugin-ui-utils', () => ({
  checkPluginActiveUI: async () => ({
    hasActiveUI: false,
    coreBox: false,
    divisionBoxSessions: []
  })
}))

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function trustMetadata(artifact: Buffer): Record<string, unknown> {
  const artifactSha256 = sha256(artifact)
  const publisherPayload: PluginSigningPayloadV1 = {
    contract: 'talex.plugin-signing/v1',
    policyVersion: 'plugin-policy/v7',
    pluginId: 'plugin-clipboard-history',
    pluginName: 'clipboard-history',
    version: '4.2.0',
    channel: 'RELEASE',
    artifactSha256,
    artifactSize: artifact.length,
    fileMapSha256: '1a'.repeat(32),
    issuedAt: '2026-07-01T12:00:00.000Z'
  }
  const attestation: PluginAdmissionAttestationV1 = {
    algorithm: 'Ed25519',
    keyId: 'untrusted-nexus-root',
    payload: {
      contract: 'talex.plugin-attestation/v1',
      issuer: 'tuff-nexus',
      audience: 'talex-touch-core-app',
      artifactSha256,
      artifactSize: artifact.length,
      pluginId: publisherPayload.pluginId,
      pluginName: publisherPayload.pluginName,
      version: publisherPayload.version,
      channel: publisherPayload.channel,
      policyVersion: publisherPayload.policyVersion,
      policyDecision: 'passed',
      scanReportSha256: '2b'.repeat(32),
      scanDecision: 'passed',
      publisherSignature: {
        algorithm: 'Ed25519',
        keyId: 'publisher-key-2026',
        payload: publisherPayload,
        payloadSha256: '3c'.repeat(32),
        signature: 'AA=='
      },
      publisherKey: {
        algorithm: 'Ed25519',
        keyId: 'publisher-key-2026',
        ownerId: 'publisher-account-42',
        publicKeyPem: 'not reached because the Nexus root is unknown',
        status: 'active',
        validFrom: '2026-01-01T00:00:00.000Z'
      },
      review: {
        decision: 'approved',
        actorId: 'nexus-reviewer-17',
        reviewedAt: '2026-07-02T12:00:00.000Z'
      },
      admission: 'eligible',
      issuedAt: '2026-07-01T12:00:00.000Z'
    },
    payloadSha256: '4d'.repeat(32),
    signature: 'AA=='
  }

  return {
    sourceType: 'registry',
    pluginId: publisherPayload.pluginId,
    pluginName: publisherPayload.pluginName,
    version: publisherPayload.version,
    channel: publisherPayload.channel,
    artifactSha256,
    packageSize: artifact.length,
    nexusAttestation: attestation
  }
}

describe('pluginInstallQueue registry trust gate', () => {
  it('rejects an untrusted registry artifact before the downstream extractor can mutate disk', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'core-app-trust-ordering-'))
    const artifact = Buffer.from('untrusted but shape-valid registry plugin bytes', 'utf8')
    const artifactPath = path.join(directory, 'plugin.tpex')
    const extractionMarker = path.join(directory, 'extracted.marker')
    await writeFile(artifactPath, artifact)

    const request: PluginInstallRequest = { source: 'https://registry.example/plugin.tpex' }
    const prepared = {
      request,
      providerResult: {
        filePath: artifactPath,
        provider: 'tpex',
        official: true,
        metadata: trustMetadata(artifact)
      },
      manifest: {
        name: 'clipboard-history',
        version: '4.2.0'
      }
    } as unknown as PreparedPluginInstall
    const installer = {
      prepareInstall: async () => prepared,
      finalizeInstall: async () => {
        await writeFile(extractionMarker, 'extraction started')
        return { manifest: prepared.manifest, providerResult: prepared.providerResult }
      },
      discardPrepared: async () => undefined
    } as unknown as PluginInstaller
    const transport = {
      sendToWindow: async () => undefined
    } as unknown as ITuffTransportMain
    const queue = new PluginInstallQueue(installer, transport, 1)
    const previousRoots = process.env.TUFF_PLUGIN_TRUST_ROOTS_JSON

    try {
      process.env.TUFF_PLUGIN_TRUST_ROOTS_JSON = '[]'
      await expect(queue.enqueue(request)).resolves.toEqual({
        status: 'error',
        message: 'PLUGIN_TRUST_KEY_UNKNOWN'
      })
      await expect(
        import('node:fs/promises').then(({ access }) => access(extractionMarker))
      ).rejects.toThrow()
    } finally {
      if (previousRoots === undefined) delete process.env.TUFF_PLUGIN_TRUST_ROOTS_JSON
      else process.env.TUFF_PLUGIN_TRUST_ROOTS_JSON = previousRoots
      await rm(directory, { recursive: true, force: true })
    }
  })
})
