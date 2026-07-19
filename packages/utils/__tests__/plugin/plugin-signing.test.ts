import type { PluginSigningPayloadV1 } from '../../plugin/signing'
import { Buffer } from 'node:buffer'
import { generateKeyPairSync, sign, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  normalizePluginPublisherSignature,
  normalizePluginSigningPayload,
  PLUGIN_SIGNING_ALGORITHM,
  PLUGIN_SIGNING_CONTRACT,
  serializePluginFileMap,
  serializePluginSigningPayload,
  serializePluginSigningValue,
} from '../../plugin/signing'

const ARTIFACT_SHA256 = 'a'.repeat(64)
const FILE_MAP_SHA256 = 'b'.repeat(64)

function payload(overrides: Partial<PluginSigningPayloadV1> = {}): PluginSigningPayloadV1 {
  return {
    contract: PLUGIN_SIGNING_CONTRACT,
    policyVersion: '2026-07-18',
    pluginId: 'com.tuffex.signing-vector',
    pluginName: 'signing-vector',
    version: '1.2.3',
    channel: 'RELEASE',
    artifactSha256: ARTIFACT_SHA256,
    artifactSize: 512,
    fileMapSha256: FILE_MAP_SHA256,
    issuedAt: '2026-07-18T12:00:00.000Z',
    expiresAt: '2026-07-19T12:00:00.000Z',
    ...overrides,
  }
}

function tamperPayload(field: keyof PluginSigningPayloadV1): PluginSigningPayloadV1 {
  const original = payload()
  switch (field) {
    case 'contract': return { ...original, contract: 'talex.plugin-signing/v2' as PluginSigningPayloadV1['contract'] }
    case 'policyVersion': return { ...original, policyVersion: '2026-07-19' }
    case 'pluginId': return { ...original, pluginId: 'com.tuffex.other' }
    case 'pluginName': return { ...original, pluginName: 'other-plugin' }
    case 'version': return { ...original, version: '1.2.4' }
    case 'channel': return { ...original, channel: 'BETA' }
    case 'artifactSha256': return { ...original, artifactSha256: 'c'.repeat(64) }
    case 'artifactSize': return { ...original, artifactSize: 513 }
    case 'fileMapSha256': return { ...original, fileMapSha256: 'd'.repeat(64) }
    case 'issuedAt': return { ...original, issuedAt: '2026-07-18T12:00:01.000Z' }
    case 'expiresAt': return { ...original, expiresAt: '2026-07-19T12:00:01.000Z' }
  }
}

describe('plugin signing contract', () => {
  it('canonicalizes nested values, payloads, and file maps independently of insertion order', () => {
    const unordered = {
      version: '1.2.3',
      metadata: { z: 3, a: 1 },
      files: { 'z-last.js': 'z', 'a-first.js': 'a' },
    }
    const reordered = {
      files: { 'a-first.js': 'a', 'z-last.js': 'z' },
      metadata: { a: 1, z: 3 },
      version: '1.2.3',
    }

    expect(serializePluginSigningValue(unordered)).toBe('{"files":{"a-first.js":"a","z-last.js":"z"},"metadata":{"a":1,"z":3},"version":"1.2.3"}')
    expect(serializePluginSigningValue(unordered)).toBe(serializePluginSigningValue(reordered))
    expect(serializePluginSigningPayload(payload())).toBe(serializePluginSigningPayload({
      artifactSize: 512,
      expiresAt: '2026-07-19T12:00:00.000Z',
      artifactSha256: ARTIFACT_SHA256,
      channel: 'RELEASE',
      contract: PLUGIN_SIGNING_CONTRACT,
      fileMapSha256: FILE_MAP_SHA256,
      issuedAt: '2026-07-18T12:00:00.000Z',
      pluginId: 'com.tuffex.signing-vector',
      pluginName: 'signing-vector',
      policyVersion: '2026-07-18',
      version: '1.2.3',
    }))
    expect(serializePluginFileMap({ 'z-last.js': 'z', 'a-first.js': 'a' }))
      .toBe('{"a-first.js":"a","z-last.js":"z"}')
  })

  it('normalizes only exact, well-formed payload and publisher-signature envelopes', () => {
    const validPayload = payload({ artifactSha256: ARTIFACT_SHA256.toUpperCase() })
    const validEnvelope = {
      algorithm: PLUGIN_SIGNING_ALGORITHM,
      keyId: 'publisher-key-2026',
      payload: validPayload,
      payloadSha256: 'c'.repeat(64),
      signature: Buffer.from('publisher-signature-vector').toString('base64'),
    }

    expect(normalizePluginSigningPayload(validPayload)).toEqual(payload())
    expect(normalizePluginPublisherSignature(validEnvelope)).toEqual({
      ...validEnvelope,
      payload: payload(),
    })

    const { policyVersion: _missingPolicyVersion, ...payloadMissingRequiredField } = validPayload
    const { signature: _missingSignature, ...envelopeMissingRequiredField } = validEnvelope

    expect(normalizePluginSigningPayload(payloadMissingRequiredField)).toBeNull()
    expect(normalizePluginSigningPayload({ ...validPayload, unexpected: true })).toBeNull()
    expect(normalizePluginSigningPayload({ ...validPayload, artifactSize: 0 })).toBeNull()
    expect(normalizePluginSigningPayload({ ...validPayload, issuedAt: 'not-a-timestamp' })).toBeNull()
    expect(normalizePluginSigningPayload({ ...validPayload, channel: 'CANARY' })).toBeNull()
    expect(normalizePluginPublisherSignature(envelopeMissingRequiredField)).toBeNull()
    expect(normalizePluginPublisherSignature({ ...validEnvelope, algorithm: 'RSA-PSS' })).toBeNull()
    expect(normalizePluginPublisherSignature({ ...validEnvelope, payloadSha256: 'not-a-digest' })).toBeNull()
    expect(normalizePluginPublisherSignature({ ...validEnvelope, signature: 'not base64!' })).toBeNull()
    expect(normalizePluginPublisherSignature({ ...validEnvelope, extra: 'rejected' })).toBeNull()
  })

  it.each([
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
    'expiresAt',
  ] as const)('rejects an Ed25519 signature when signed payload field %s changes', (field) => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const original = payload()
    const signature = sign(null, Buffer.from(serializePluginSigningPayload(original), 'utf8'), privateKey)

    expect(verify(
      null,
      Buffer.from(serializePluginSigningPayload(tamperPayload(field)), 'utf8'),
      publicKey,
      signature,
    )).toBe(false)
  })
})
