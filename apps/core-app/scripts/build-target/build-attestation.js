const crypto = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const BUILD_ATTESTATION_FILE = 'build-attestation.json'
const BUILD_ATTESTATION_SIGNATURE_FILE = `${BUILD_ATTESTATION_FILE}.sig`
const RELEASE_PUBLIC_KEY = path.join('resources', 'keys', 'release-signing-public.pem')

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(
    String(value || '')
      .trim()
      .toLowerCase()
  )
}

function decodePrivateKey(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('-----BEGIN')) return trimmed
  return Buffer.from(trimmed, 'base64').toString('utf8').trim()
}

function publicKeyFingerprint(key) {
  const publicKey = key.type === 'public' ? key : crypto.createPublicKey(key)
  const der = publicKey.export({ type: 'spki', format: 'der' })
  return crypto.createHash('sha256').update(der).digest('hex')
}

function hashFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const input = fs.createReadStream(filePath)
    input.on('error', reject)
    input.on('data', (chunk) => hash.update(chunk))
    input.on('end', () => resolve(hash.digest('hex')))
  })
}

function resolveChannel(version) {
  const lower = String(version || '').toLowerCase()
  if (lower.includes('snapshot')) return 'SNAPSHOT'
  if (lower.includes('beta')) return 'BETA'
  return 'RELEASE'
}

async function removeStaleAttestation(resourcesDir) {
  await Promise.all([
    fsp.rm(path.join(resourcesDir, BUILD_ATTESTATION_FILE), { force: true }),
    fsp.rm(path.join(resourcesDir, BUILD_ATTESTATION_SIGNATURE_FILE), { force: true })
  ])
}

async function createPackagedBuildAttestation(options) {
  const {
    resourcesDir,
    projectDir,
    appId,
    version,
    platform,
    arch,
    commit = '',
    privateKeyValue = process.env.RELEASE_SIGNING_PRIVATE_KEY,
    required = isEnabled(process.env.TUFF_RELEASE_ATTESTATION_REQUIRED)
  } = options

  await removeStaleAttestation(resourcesDir)

  const privateKeyText = decodePrivateKey(privateKeyValue)
  if (!privateKeyText) {
    if (required) {
      throw new Error('[build-attestation] RELEASE_SIGNING_PRIVATE_KEY is required')
    }
    return { created: false, reason: 'signing-key-unavailable' }
  }

  const appAsarPath = path.join(resourcesDir, 'app.asar')
  const publicKeyPath = path.join(projectDir, RELEASE_PUBLIC_KEY)
  const [publicKeyText, appAsarSha256] = await Promise.all([
    fsp.readFile(publicKeyPath, 'utf8'),
    hashFileSha256(appAsarPath)
  ])

  const privateKey = crypto.createPrivateKey(privateKeyText)
  const publicKey = crypto.createPublicKey(publicKeyText)
  const privateFingerprint = publicKeyFingerprint(privateKey)
  const publicFingerprint = publicKeyFingerprint(publicKey)
  if (privateFingerprint !== publicFingerprint) {
    throw new Error('[build-attestation] Private key does not match the pinned public key')
  }

  const normalizedCommit = /^[a-f0-9]{7,64}$/i.test(String(commit || '').trim())
    ? String(commit).trim().toLowerCase()
    : null
  const payload = {
    schemaVersion: 1,
    appId,
    version,
    channel: resolveChannel(version),
    platform,
    arch,
    commit: normalizedCommit,
    keyFingerprint: publicFingerprint,
    artifact: {
      path: 'app.asar',
      sha256: appAsarSha256
    }
  }
  const payloadBytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  const signature = crypto.sign('sha256', payloadBytes, privateKey)
  if (!crypto.verify('sha256', payloadBytes, publicKey, signature)) {
    throw new Error('[build-attestation] Signature self-check failed')
  }

  await Promise.all([
    fsp.writeFile(path.join(resourcesDir, BUILD_ATTESTATION_FILE), payloadBytes, { mode: 0o644 }),
    fsp.writeFile(
      path.join(resourcesDir, BUILD_ATTESTATION_SIGNATURE_FILE),
      `${signature.toString('base64')}\n`,
      { encoding: 'utf8', mode: 0o644 }
    )
  ])

  return {
    created: true,
    appAsarSha256,
    keyFingerprint: publicFingerprint,
    attestationPath: path.join(resourcesDir, BUILD_ATTESTATION_FILE),
    signaturePath: path.join(resourcesDir, BUILD_ATTESTATION_SIGNATURE_FILE)
  }
}

module.exports = {
  BUILD_ATTESTATION_FILE,
  BUILD_ATTESTATION_SIGNATURE_FILE,
  createPackagedBuildAttestation,
  decodePrivateKey,
  publicKeyFingerprint,
  resolveChannel
}
