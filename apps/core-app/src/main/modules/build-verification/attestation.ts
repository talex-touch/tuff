import crypto from 'node:crypto'
import type { ReadStream } from 'node:fs'
import * as nodeFs from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

export type BuildAttestationPlatform = 'darwin' | 'win32' | 'linux'
export type BuildAttestationArch = 'x64' | 'arm64' | 'universal'
export type BuildAttestationRuntimeArch = 'x64' | 'arm64'
export type BuildAttestationChannel = 'RELEASE' | 'BETA' | 'SNAPSHOT'

export interface BuildAttestationV1 {
  schemaVersion: 1
  appId: string
  version: string
  channel: BuildAttestationChannel
  platform: BuildAttestationPlatform
  arch: BuildAttestationArch
  commit: string | null
  keyFingerprint: string
  artifact: {
    path: 'app.asar'
    sha256: string
  }
}

export interface VerifyBuildAttestationOptions {
  appAsarPath: string
  attestationPath: string
  signaturePath: string
  publicKey: string
  expected: {
    appId: string
    version: string
    platform: BuildAttestationPlatform
    arch: BuildAttestationRuntimeArch
  }
}

export interface BuildAttestationVerificationResult {
  valid: boolean
  hasOfficialKey: boolean
  reason?:
    | 'attestation-not-available'
    | 'public-key-unavailable'
    | 'signature-invalid'
    | 'attestation-invalid'
    | 'identity-mismatch'
    | 'artifact-digest-mismatch'
    | 'verification-error'
  detail?: string
  attestation?: BuildAttestationV1
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const COMMIT_PATTERN = /^[a-f0-9]{7,64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function resolveChannel(version: string): BuildAttestationChannel {
  const lower = version.toLowerCase()
  if (lower.includes('snapshot')) return 'SNAPSHOT'
  if (lower.includes('beta')) return 'BETA'
  return 'RELEASE'
}

function decodeBase64Signature(payload: Buffer): Buffer | null {
  const encoded = payload.toString('utf8').trim()
  if (!encoded || !/^[A-Z0-9+/]+={0,2}$/i.test(encoded)) return null
  const signature = Buffer.from(encoded, 'base64')
  return signature.length > 0 ? signature : null
}

function publicKeyFingerprint(publicKey: crypto.KeyObject): string {
  const der = publicKey.export({ type: 'spki', format: 'der' })
  return crypto.createHash('sha256').update(der).digest('hex')
}

function parseAttestation(value: unknown): BuildAttestationV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.artifact)) return null
  if (
    typeof value.appId !== 'string' ||
    typeof value.version !== 'string' ||
    !['RELEASE', 'BETA', 'SNAPSHOT'].includes(String(value.channel)) ||
    !['darwin', 'win32', 'linux'].includes(String(value.platform)) ||
    !['x64', 'arm64', 'universal'].includes(String(value.arch)) ||
    (value.commit !== null &&
      (typeof value.commit !== 'string' || !COMMIT_PATTERN.test(value.commit))) ||
    typeof value.keyFingerprint !== 'string' ||
    !SHA256_PATTERN.test(value.keyFingerprint) ||
    value.artifact.path !== 'app.asar' ||
    typeof value.artifact.sha256 !== 'string' ||
    !SHA256_PATTERN.test(value.artifact.sha256)
  ) {
    return null
  }

  return value as unknown as BuildAttestationV1
}

const requireFromCurrentModule = createRequire(import.meta.url)
let physicalFs: typeof nodeFs | undefined

function resolvePhysicalFs(): typeof nodeFs {
  if (physicalFs) return physicalFs
  try {
    physicalFs = requireFromCurrentModule('original-fs') as typeof nodeFs
  } catch {
    physicalFs = nodeFs
  }
  return physicalFs
}

function createPhysicalReadStream(filePath: string): ReadStream {
  return resolvePhysicalFs().createReadStream(filePath)
}

function hashFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const input = createPhysicalReadStream(filePath)
    input.on('error', reject)
    input.on('data', (chunk) => hash.update(chunk))
    input.on('end', () => resolve(hash.digest('hex')))
  })
}

export async function verifyBuildAttestation(
  options: VerifyBuildAttestationOptions
): Promise<BuildAttestationVerificationResult> {
  let publicKey: crypto.KeyObject
  try {
    publicKey = crypto.createPublicKey(options.publicKey)
  } catch (error) {
    return {
      valid: false,
      hasOfficialKey: false,
      reason: 'public-key-unavailable',
      detail: error instanceof Error ? error.message : String(error)
    }
  }

  let attestationPayload: Buffer
  let signaturePayload: Buffer
  try {
    ;[attestationPayload, signaturePayload] = await Promise.all([
      readFile(options.attestationPath),
      readFile(options.signaturePath)
    ])
  } catch {
    return { valid: false, hasOfficialKey: false, reason: 'attestation-not-available' }
  }

  try {
    const signature = decodeBase64Signature(signaturePayload)
    if (!signature || !crypto.verify('sha256', attestationPayload, publicKey, signature)) {
      return { valid: false, hasOfficialKey: false, reason: 'signature-invalid' }
    }

    const attestation = parseAttestation(JSON.parse(attestationPayload.toString('utf8')))
    if (!attestation) {
      return { valid: false, hasOfficialKey: true, reason: 'attestation-invalid' }
    }

    const { expected } = options
    const identityMatches =
      attestation.appId === expected.appId &&
      attestation.version === expected.version &&
      attestation.channel === resolveChannel(expected.version) &&
      attestation.platform === expected.platform &&
      (attestation.arch === expected.arch || attestation.arch === 'universal') &&
      attestation.keyFingerprint === publicKeyFingerprint(publicKey)
    if (!identityMatches) {
      return {
        valid: false,
        hasOfficialKey: true,
        reason: 'identity-mismatch',
        attestation
      }
    }

    const actualSha256 = await hashFileSha256(options.appAsarPath)
    if (actualSha256 !== attestation.artifact.sha256) {
      return {
        valid: false,
        hasOfficialKey: true,
        reason: 'artifact-digest-mismatch',
        attestation
      }
    }

    return { valid: true, hasOfficialKey: true, attestation }
  } catch (error) {
    return {
      valid: false,
      hasOfficialKey: false,
      reason: 'verification-error',
      detail: error instanceof Error ? error.message : String(error)
    }
  }
}
