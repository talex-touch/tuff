#!/usr/bin/env node
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { getArgValue } from './lib/argv-utils.mjs'
import {
  corePairKey,
  listCorePackageFileNames,
  REQUIRED_CORE_PAIRS,
  selectPreferredCoreArtifacts,
} from './lib/release-artifacts.mjs'
import {
  serializeCanonicalUpdateDowngradeEvidence,
  validateUpdateDowngradeEvidence,
} from './lib/update-downgrade-evidence.mjs'
import {
  normalizeManifestChannel,
  parseRollbackCompatible,
  validateRollbackContract,
} from './lib/update-rollback-contract.mjs'

function keyFingerprint(key) {
  const publicKey = key.type === 'public' ? key : createPublicKey(key)
  const der = publicKey.export({ format: 'der', type: 'spki' })
  return createHash('sha256').update(der).digest('hex')
}

function getReleaseVersion(tag) {
  const version = String(tag ?? '')
    .trim()
    .replace(/^v/i, '')
  if (!version)
    throw new Error('Release tag must contain a version')
  return version
}

async function readReleaseDirectory(releaseDir) {
  const entries = await readdir(releaseDir, { withFileTypes: true })
  return entries.filter(entry => entry.isFile()).map(entry => entry.name)
}

function assertRequiredPairs(selected) {
  const selectedPairs = new Set(
    selected.map(item => corePairKey(item.platform, item.arch)),
  )
  const missingPairs = REQUIRED_CORE_PAIRS.filter(
    pair => !selectedPairs.has(pair),
  )
  if (missingPairs.length > 0) {
    throw new Error(
      `Missing required release artifact pairs: ${missingPairs.join(', ')}`,
    )
  }
}

async function validateRollbackEvidence({
  evidencePath,
  evidenceSignaturePath,
  publicKey,
  rollbackFromVersion,
  version,
}) {
  if (!evidencePath || !evidenceSignaturePath) {
    throw new Error(
      'rollbackCompatible=true requires --rollback-evidence and a detached --rollback-evidence-signature',
    )
  }

  const [evidence, encodedSignature] = await Promise.all([
    readFile(evidencePath),
    readFile(evidenceSignaturePath, 'utf8'),
  ])
  const signature = Buffer.from(encodedSignature.trim(), 'base64')
  if (
    !encodedSignature.trim()
    || !verify('sha256', evidence, publicKey, signature)
  ) {
    throw new Error(
      'Rollback evidence detached signature does not verify with the pinned release public key',
    )
  }

  let payload
  try {
    payload = JSON.parse(evidence.toString('utf8'))
  }
  catch {
    throw new Error('Rollback evidence must be valid UTF-8 JSON')
  }
  if (
    !evidence.equals(
      Buffer.from(serializeCanonicalUpdateDowngradeEvidence(payload), 'utf8'),
    )
  ) {
    throw new Error('Rollback evidence must use canonical JSON bytes')
  }

  const evidenceResult = validateUpdateDowngradeEvidence(payload, {
    currentVersion: rollbackFromVersion,
    targetVersion: version,
    rollbackFromVersion,
  })
  if (!evidenceResult.valid) {
    throw new Error(
      `Invalid rollback evidence: ${evidenceResult.issues.join('; ')}`,
    )
  }
}

export async function prepareReleaseAssets({
  releaseDir,
  tag,
  channel,
  privateKeyPath,
  rollbackFromVersion,
  expectedRollbackFromVersion,
  rollbackEvidencePath,
  rollbackEvidenceSignaturePath,
  rollbackCompatible = false,
  publicKeyPath,
  manifestPath = join(releaseDir, 'tuff-release-manifest.json'),
}) {
  const normalizedChannel = normalizeManifestChannel(channel)
  if (!normalizedChannel)
    throw new Error(`Unsupported release channel: ${channel}`)
  if (
    typeof expectedRollbackFromVersion !== 'string'
    || !expectedRollbackFromVersion.trim()
  ) {
    throw new Error(
      'expectedRollbackFromVersion is required for release asset preparation',
    )
  }

  const version = getReleaseVersion(tag)
  const normalizedRollbackCompatible
    = parseRollbackCompatible(rollbackCompatible)
  const rollbackIssues = validateRollbackContract({
    version,
    channel: normalizedChannel,
    rollbackFromVersion,
    rollbackCompatible: normalizedRollbackCompatible,
    expectedRollbackFromVersion,
  })
  if (rollbackIssues.length > 0)
    throw new Error(`Invalid rollback contract: ${rollbackIssues.join('; ')}`)
  const [privateKeyPem, publicKeyPem, releaseFileNames] = await Promise.all([
    readFile(privateKeyPath, 'utf8'),
    readFile(publicKeyPath, 'utf8'),
    readReleaseDirectory(releaseDir),
  ])

  const privateKey = createPrivateKey(privateKeyPem)
  const configuredPublicKey = createPublicKey(publicKeyPem)
  const privateKeyPublicFingerprint = keyFingerprint(privateKey)
  const configuredPublicFingerprint = keyFingerprint(configuredPublicKey)

  if (privateKeyPublicFingerprint !== configuredPublicFingerprint) {
    throw new Error(
      `Release signing private key does not match the pinned public key (${privateKeyPublicFingerprint} != ${configuredPublicFingerprint})`,
    )
  }

  if (normalizedRollbackCompatible) {
    await validateRollbackEvidence({
      evidencePath: rollbackEvidencePath,
      evidenceSignaturePath: rollbackEvidenceSignaturePath,
      publicKey: configuredPublicKey,
      rollbackFromVersion,
      version,
    })
  }

  const packageFileNames = listCorePackageFileNames(releaseFileNames)
  if (packageFileNames.length === 0)
    throw new Error(`No release package files found in ${releaseDir}`)

  const selected = selectPreferredCoreArtifacts(packageFileNames)
  assertRequiredPairs(selected)

  const signedFiles = []
  for (const fileName of packageFileNames) {
    const filePath = join(releaseDir, fileName)
    const signatureName = `${fileName}.sig`
    const signaturePath = join(releaseDir, signatureName)
    const payload = await readFile(filePath)
    const signature = sign('sha256', payload, privateKey)

    if (!verify('sha256', payload, configuredPublicKey, signature)) {
      throw new Error(
        `Detached signature verification failed immediately after signing: ${fileName}`,
      )
    }

    await writeFile(signaturePath, `${signature.toString('base64')}\n`, 'utf8')
    signedFiles.push({
      name: fileName,
      signature: signatureName,
      sha256: createHash('sha256').update(payload).digest('hex'),
      size: payload.length,
    })
  }

  const signedByName = new Map(signedFiles.map(item => [item.name, item]))
  const artifacts = selected.map((item) => {
    const signed = signedByName.get(item.name)
    if (!signed)
      throw new Error(`Selected release artifact was not signed: ${item.name}`)
    return {
      component: 'core',
      name: item.name,
      platform: item.platform,
      arch: item.arch,
      sha256: signed.sha256,
      signature: signed.signature,
    }
  })

  const manifest = {
    schemaVersion: 2,
    release: {
      version,
      channel: normalizedChannel,
      tag,
      rollbackFromVersion,
      rollbackCompatible: normalizedRollbackCompatible,
    },
    artifacts,
  }

  await mkdir(dirname(manifestPath), { recursive: true })
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )

  return {
    manifestPath,
    publicKeyFingerprint: configuredPublicFingerprint,
    packageCount: packageFileNames.length,
    signedFiles,
    preferredArtifacts: artifacts,
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const releaseDir = resolve(
    getArgValue(argv, '--release-dir', 'release-assets'),
  )
  const tag = getArgValue(argv, '--tag', process.env.GITHUB_REF_NAME)
  const channel = getArgValue(argv, '--channel', 'RELEASE')
  const privateKeyPath = getArgValue(argv, '--private-key')
  const rollbackFromVersion = getArgValue(argv, '--rollback-from-version')
  const rollbackCompatible = getArgValue(
    argv,
    '--rollback-compatible',
    'false',
  )
  const expectedRollbackFromVersion = getArgValue(
    argv,
    '--expected-rollback-from-version',
  )
  const rollbackEvidencePath = getArgValue(argv, '--rollback-evidence')
  const rollbackEvidenceSignaturePath
    = getArgValue(argv, '--rollback-evidence-signature')
      ?? (rollbackEvidencePath ? `${rollbackEvidencePath}.sig` : undefined)
  const publicKeyPath = getArgValue(
    argv,
    '--public-key',
    'apps/core-app/resources/keys/release-signing-public.pem',
  )
  const manifestPath = resolve(
    getArgValue(
      argv,
      '--manifest',
      join(releaseDir, 'tuff-release-manifest.json'),
    ),
  )

  if (
    !tag
    || !privateKeyPath
    || !publicKeyPath
    || !rollbackFromVersion
    || !expectedRollbackFromVersion
  ) {
    throw new Error(
      'Usage: node scripts/prepare-release-assets.mjs --tag <tag> --channel <channel> --rollback-from-version <version> --expected-rollback-from-version <version> --rollback-compatible <true|false> [--rollback-evidence <json> --rollback-evidence-signature <sig>] --release-dir <dir> --private-key <pem> [--public-key <pem>] [--manifest <json>]',
    )
  }

  const result = await prepareReleaseAssets({
    releaseDir,
    tag,
    channel,
    rollbackFromVersion,
    expectedRollbackFromVersion,
    rollbackEvidencePath: rollbackEvidencePath && resolve(rollbackEvidencePath),
    rollbackEvidenceSignaturePath:
      rollbackEvidenceSignaturePath && resolve(rollbackEvidenceSignaturePath),
    rollbackCompatible,
    privateKeyPath: resolve(privateKeyPath),
    publicKeyPath: resolve(publicKeyPath),
    manifestPath,
  })
  console.log(JSON.stringify(result, null, 2))
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (
  entryPath
  && basename(process.argv[1]) === 'prepare-release-assets.mjs'
  && import.meta.url === entryPath
) {
  main().catch((error) => {
    console.error(
      `[prepare-release-assets] ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  })
}
