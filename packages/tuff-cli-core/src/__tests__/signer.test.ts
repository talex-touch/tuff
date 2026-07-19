import type { CreatePluginPublisherSignatureOptions } from '../plugin-signer'
import { Buffer } from 'node:buffer'
import { createHash, createPublicKey, generateKeyPairSync, verify } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import {
  serializePluginFileMap,
  serializePluginSigningPayload,
} from '@talex-touch/utils/plugin'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPluginPublisherSignature } from '../plugin-signer'

const TAR_BLOCK_SIZE = 512
const publisherKeyPair = generateKeyPairSync('ed25519')
const publisherPrivateKeyPem = publisherKeyPair.privateKey
  .export({ format: 'pem', type: 'pkcs8' })
  .toString()
const signingOptions: CreatePluginPublisherSignatureOptions = {
  privateKeyPem: publisherPrivateKeyPem,
  keyId: 'publisher-signer-2026',
  issuedAt: '2026-07-18T12:00:00Z',
  expiresAt: '2026-07-19T12:00:00Z',
  validFrom: '2026-07-17T12:00:00Z',
  validUntil: '2026-08-17T12:00:00Z',
}
const signingEnvironment = [
  'TUFF_PLUGIN_SIGNING_PRIVATE_KEY_PEM',
  'TUFF_PLUGIN_SIGNING_PRIVATE_KEY_FILE',
  'TUFF_PLUGIN_SIGNING_KEY_ID',
  'TUFF_PLUGIN_SIGNING_EXPIRES_AT',
  'TUFF_PLUGIN_SIGNING_VALID_FROM',
  'TUFF_PLUGIN_SIGNING_VALID_UNTIL',
] as const

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function writeOctal(buffer: Buffer, value: number, start: number, length: number) {
  buffer.write(`${value.toString(8).padStart(length - 1, '0')}\0`, start, length, 'ascii')
}

function tarEntry(name: string, content: string): Buffer {
  const data = Buffer.from(content, 'utf8')
  const header = Buffer.alloc(TAR_BLOCK_SIZE)
  header.write(name, 0, Math.min(Buffer.byteLength(name), 100), 'utf8')
  writeOctal(header, 0o644, 100, 8)
  writeOctal(header, data.length, 124, 12)
  header.fill(' ', 148, 156)
  header.write('0', 156, 1, 'ascii')
  header.write('ustar\0', 257, 6, 'ascii')
  header.write('00', 263, 2, 'ascii')
  let checksum = 0
  for (const byte of header)
    checksum += byte
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  const padding = Buffer.alloc((TAR_BLOCK_SIZE - (data.length % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE)
  return Buffer.concat([header, data, padding])
}

function writeFixture(
  root: string,
  source = 'export const trusted = true\n',
  identity: { id: string, name: string, version: string } = {
    id: 'com.tuffex.signing-fixture',
    name: 'signing-fixture',
    version: '1.2.3',
  },
): { packagePath: string, fileMap: Record<string, string> } {
  const fileMap = { 'index.js': `sha256-${sha256(source)}` }
  const manifest = {
    ...identity,
    sdkapi: 260428,
    category: 'utilities',
    permissions: { required: [], optional: [] },
    _files: fileMap,
    _signature: createHash('md5').update(JSON.stringify(fileMap)).digest('base64'),
  }
  const packagePath = path.join(root, `${identity.name}-${identity.version}.tpex`)
  const archive = Buffer.concat([
    tarEntry('index.js', source),
    tarEntry('key.talex', 'private-key-material-that-must-not-leak'),
    tarEntry('manifest.json', JSON.stringify(manifest)),
    Buffer.alloc(TAR_BLOCK_SIZE * 2),
  ])
  fs.writeFileSync(packagePath, archive)
  return { packagePath, fileMap }
}

function withFixture<T>(callback: (fixture: ReturnType<typeof writeFixture>) => T): T {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-plugin-signer-'))
  try {
    return callback(writeFixture(root))
  }
  finally {
    fs.removeSync(root)
  }
}

describe('plugin publisher signer', () => {
  const previousEnvironment = new Map<string, string | undefined>()

  beforeEach(() => {
    for (const name of signingEnvironment) {
      previousEnvironment.set(name, process.env[name])
      delete process.env[name]
    }
  })

  afterEach(() => {
    for (const name of signingEnvironment) {
      const value = previousEnvironment.get(name)
      if (value === undefined)
        delete process.env[name]
      else
        process.env[name] = value
    }
    previousEnvironment.clear()
  })

  it('creates a verifiable Ed25519 bundle that binds package bytes, file map, identity, channel, and timestamps', () => {
    withFixture(({ packagePath, fileMap }) => {
      const artifact = fs.readFileSync(packagePath)
      const bundle = createPluginPublisherSignature(packagePath, 'RELEASE', signingOptions)
      const payload = bundle.envelope.payload

      expect(verify(
        null,
        Buffer.from(serializePluginSigningPayload(payload), 'utf8'),
        createPublicKey(bundle.publicKeyPem),
        Buffer.from(bundle.envelope.signature, 'base64'),
      )).toBe(true)
      expect(payload).toMatchObject({
        pluginId: 'com.tuffex.signing-fixture',
        pluginName: 'signing-fixture',
        version: '1.2.3',
        channel: 'RELEASE',
        artifactSha256: sha256(artifact),
        artifactSize: artifact.length,
        fileMapSha256: sha256(serializePluginFileMap(fileMap)),
        issuedAt: '2026-07-18T12:00:00.000Z',
        expiresAt: '2026-07-19T12:00:00.000Z',
      })
      expect(bundle).toMatchObject({
        envelope: { algorithm: 'Ed25519', keyId: 'publisher-signer-2026' },
        validFrom: '2026-07-17T12:00:00.000Z',
        validUntil: '2026-08-17T12:00:00.000Z',
      })
    })
  })

  it('invalidates the original signature when a package byte changes and the altered artifact is re-signed', () => {
    const originalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-plugin-signer-original-'))
    const changedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-plugin-signer-tamper-'))
    try {
      const original = writeFixture(originalRoot)
      const changed = writeFixture(changedRoot, 'export const trusted = false\n')
      const originalBundle = createPluginPublisherSignature(original.packagePath, 'RELEASE', signingOptions)
      const changedBundle = createPluginPublisherSignature(changed.packagePath, 'RELEASE', signingOptions)

      expect(changedBundle.envelope.payload.artifactSha256).not.toBe(originalBundle.envelope.payload.artifactSha256)
      expect(verify(
        null,
        Buffer.from(serializePluginSigningPayload(changedBundle.envelope.payload), 'utf8'),
        createPublicKey(originalBundle.publicKeyPem),
        Buffer.from(originalBundle.envelope.signature, 'base64'),
      )).toBe(false)
    }
    finally {
      fs.removeSync(originalRoot)
      fs.removeSync(changedRoot)
    }
  })

  it('fails closed for missing, malformed, non-Ed25519, and unidentified signer configuration', () => {
    withFixture(({ packagePath }) => {
      expect(() => createPluginPublisherSignature(packagePath, 'RELEASE', {
        keyId: 'missing-private-key',
      })).toThrow('Plugin publisher signing key is required')
      expect(() => createPluginPublisherSignature(packagePath, 'RELEASE', {
        keyId: 'malformed-private-key',
        privateKeyPem: 'not-a-private-key',
      })).toThrow()
      const rsaPrivateKeyPem = generateKeyPairSync('rsa', { modulusLength: 2048 })
        .privateKey
        .export({ format: 'pem', type: 'pkcs8' })
        .toString()
      expect(() => createPluginPublisherSignature(packagePath, 'RELEASE', {
        keyId: 'rsa-private-key',
        privateKeyPem: rsaPrivateKeyPem,
      })).toThrow('Plugin publisher signing key must use Ed25519.')
      expect(() => createPluginPublisherSignature(packagePath, 'RELEASE', {
        privateKeyPem: publisherPrivateKeyPem,
      })).toThrow('TUFF_PLUGIN_SIGNING_KEY_ID must be a stable')
    })
  })

  it('returns a loggable envelope without private key or key.talex material', () => {
    withFixture(({ packagePath }) => {
      const bundle = createPluginPublisherSignature(packagePath, 'RELEASE', signingOptions)
      const loggableEnvelope = JSON.stringify(bundle)

      expect(loggableEnvelope).not.toContain('PRIVATE KEY')
      expect(loggableEnvelope).not.toContain('private-key-material-that-must-not-leak')
      expect(loggableEnvelope).not.toContain('key.talex')
    })
  })
})
