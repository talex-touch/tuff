#!/usr/bin/env node
import { createHash, createPublicKey, verify } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { getArgValue } from './lib/argv-utils.mjs'
import {
  corePairKey,
  listCorePackageFileNames,
  normalizeSha256,
  REQUIRED_CORE_PAIRS,
} from './lib/release-artifacts.mjs'

function requirePlainFileName(value, label) {
  if (typeof value !== 'string' || !value || basename(value) !== value)
    throw new Error(`${label} must be a plain file name`)
  return value
}

function decodeDetachedSignature(payload, fileName) {
  const encoded = payload.toString('utf8').trim()
  if (!encoded || !/^[A-Z0-9+/]+={0,2}$/i.test(encoded))
    throw new Error(`Detached signature is not valid base64: ${fileName}`)
  const signature = Buffer.from(encoded, 'base64')
  if (signature.length === 0)
    throw new Error(`Detached signature is empty: ${fileName}`)
  return signature
}

function requireMacEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence))
    throw new Error('macOS signing evidence is missing or invalid')

  const mode = evidence.mode ?? (evidence.status === 'waived' ? 'waived' : 'developer-id')
  const checks = {
    codesign: evidence.checks?.codesign === true,
    gatekeeper: evidence.checks?.gatekeeper === true,
    notarization: evidence.checks?.notarization === true,
  }
  const common = {
    mode,
    signingKind: evidence.signingKind,
    teamIdentifier:
      typeof evidence.teamIdentifier === 'string' && evidence.teamIdentifier.trim()
        ? evidence.teamIdentifier
        : null,
    authorities: Array.isArray(evidence.authorities)
      ? evidence.authorities.filter(value => typeof value === 'string')
      : [],
    checks,
    checkedAt: typeof evidence.checkedAt === 'string' ? evidence.checkedAt : null,
  }

  if (mode === 'waived') {
    if (evidence.status !== 'waived')
      throw new Error('macOS waived evidence must have status waived')
    if (evidence.policyReason !== 'apple-developer-not-configured')
      throw new Error('macOS waived evidence has an invalid policy reason')
    return {
      ...common,
      status: 'waived',
      policyReason: 'apple-developer-not-configured',
    }
  }

  if (mode !== 'developer-id')
    throw new Error(`Unsupported macOS signing evidence mode: ${mode}`)
  if (evidence.status !== 'pass')
    throw new Error('macOS signing evidence did not pass')
  if (evidence.signingKind !== 'developer-id')
    throw new Error('macOS signing evidence is not Developer ID signing')
  if (!common.teamIdentifier)
    throw new Error('macOS signing evidence has no TeamIdentifier')

  for (const [check, passed] of Object.entries(checks)) {
    if (!passed)
      throw new Error(`macOS signing evidence check failed: ${check}`)
  }

  return {
    ...common,
    status: 'pass',
    policyReason: null,
  }
}

function renderMarkdown(summary) {
  if (summary.status !== 'pass') {
    const tag = summary.release?.tag ?? 'unknown'
    return [
      `# Tuff ${tag} 发布测试摘要 / Release Test Summary`,
      '',
      '- 总状态 / Overall: **FAIL**',
      `- 原因 / Reason: \`${summary.failure.reason}\``,
      '',
      '> GitHub Release was not created. Inspect the failed workflow step for bounded diagnostic details.',
      '',
    ].join('\n')
  }

  const lines = [
    `# Tuff ${summary.release.tag} 发布测试摘要 / Release Test Summary`,
    '',
    `- 总状态 / Overall: **${summary.status.toUpperCase()}**`,
    `- 渠道 / Channel: \`${summary.release.channel}\``,
    `- 首选资产 / Preferred assets: ${summary.artifacts.length}`,
    `- 已签名安装包 / Signed packages: ${summary.packageSignatures.length}`,
    '',
    '## 首选资产矩阵 / Preferred Asset Matrix',
    '',
    '| Platform | Arch | File | SHA-256 | Signature |',
    '|---|---|---|---|---|',
  ]

  for (const artifact of summary.artifacts) {
    lines.push(
      `| ${artifact.platform} | ${artifact.arch} | \`${artifact.name}\` | \`${artifact.sha256}\` | ${artifact.signatureValid ? 'pass' : 'fail'} |`,
    )
  }

  const macosWaived = summary.macos.mode === 'waived'
  const nativeCheckStatus = passed => (passed ? 'pass' : macosWaived ? 'waived' : 'fail')

  lines.push(
    '',
    '## macOS 原生可信链 / Native Trust',
    '',
    `- Mode: **${macosWaived ? 'WAIVED' : 'DEVELOPER-ID'}**`,
    `- Policy reason: \`${summary.macos.policyReason ?? 'none'}\``,
    `- Developer ID: **${summary.macos.signingKind === 'developer-id' ? 'pass' : macosWaived ? 'waived' : 'fail'}**`,
    `- TeamIdentifier: \`${summary.macos.teamIdentifier ?? 'not-configured'}\``,
    `- codesign deep/strict: **${nativeCheckStatus(summary.macos.checks.codesign)}**`,
    `- Gatekeeper: **${nativeCheckStatus(summary.macos.checks.gatekeeper)}**`,
    `- Notarization ticket: **${nativeCheckStatus(summary.macos.checks.notarization)}**`,
    '',
    '## 完整性检查 / Integrity Checks',
    '',
    '- Manifest platform/architecture pairs are unique and complete.',
    '- Every preferred artifact SHA-256 was recomputed from the released bytes.',
    '- Every published CoreApp package has a verified RSA-SHA256 detached signature.',
    '',
  )

  return lines.join('\n')
}

async function writeSummaryFiles(outputDir, summary) {
  await mkdir(outputDir, { recursive: true })
  const jsonPath = join(outputDir, 'release-test-summary.json')
  const markdownPath = join(outputDir, 'release-test-summary.md')
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8'),
    writeFile(markdownPath, renderMarkdown(summary), 'utf8'),
  ])
  return { jsonPath, markdownPath }
}

export async function generateReleaseTestSummary({
  releaseDir,
  manifestPath,
  publicKeyPath,
  macEvidencePath,
  outputDir = releaseDir,
}) {
  const [manifestText, publicKeyPem, macEvidenceText, releaseEntries]
    = await Promise.all([
      readFile(manifestPath, 'utf8'),
      readFile(publicKeyPath, 'utf8'),
      readFile(macEvidencePath, 'utf8'),
      readdir(releaseDir, { withFileTypes: true }),
    ])
  const manifest = JSON.parse(manifestText)
  const macEvidence = requireMacEvidence(JSON.parse(macEvidenceText))
  const publicKey = createPublicKey(publicKeyPem)
  const releaseFileNames = releaseEntries
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
  const packageFileNames = listCorePackageFileNames(releaseFileNames)

  if (!manifest.release || typeof manifest.release !== 'object')
    throw new Error('Manifest release metadata is missing')
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0)
    throw new Error('Manifest artifacts are missing')

  const pairs = new Set()
  const artifacts = []
  for (const [index, artifact] of manifest.artifacts.entries()) {
    if (!artifact || artifact.component !== 'core')
      continue

    const name = requirePlainFileName(
      artifact.name,
      `artifacts[${index}].name`,
    )
    const signatureName = requirePlainFileName(
      artifact.signature,
      `artifacts[${index}].signature`,
    )
    if (signatureName !== `${name}.sig`) {
      throw new Error(
        `Unexpected detached signature name for ${name}: ${signatureName}`,
      )
    }

    const pair = corePairKey(artifact.platform, artifact.arch)
    if (pairs.has(pair))
      throw new Error(`Duplicate manifest platform/arch pair: ${pair}`)
    pairs.add(pair)

    const [payload, signaturePayload] = await Promise.all([
      readFile(join(releaseDir, name)),
      readFile(join(releaseDir, signatureName)),
    ])
    const signature = decodeDetachedSignature(signaturePayload, signatureName)
    const sha256 = createHash('sha256').update(payload).digest('hex')
    const expectedSha256 = normalizeSha256(artifact.sha256)
    if (!expectedSha256 || sha256 !== expectedSha256)
      throw new Error(`SHA-256 mismatch for ${name}`)
    if (!verify('sha256', payload, publicKey, signature))
      throw new Error(`Detached signature verification failed for ${name}`)

    artifacts.push({
      name,
      platform: artifact.platform,
      arch: artifact.arch,
      size: payload.length,
      sha256,
      signature: signatureName,
      signatureValid: true,
    })
  }

  const missingPairs = REQUIRED_CORE_PAIRS.filter(pair => !pairs.has(pair))
  if (missingPairs.length > 0) {
    throw new Error(
      `Manifest is missing required platform/arch pairs: ${missingPairs.join(', ')}`,
    )
  }

  const packageSignatures = []
  for (const name of packageFileNames) {
    const signatureName = `${name}.sig`
    const [payload, signaturePayload] = await Promise.all([
      readFile(join(releaseDir, name)),
      readFile(join(releaseDir, signatureName)),
    ])
    const signature = decodeDetachedSignature(signaturePayload, signatureName)
    if (!verify('sha256', payload, publicKey, signature)) {
      throw new Error(
        `Published package signature verification failed for ${name}`,
      )
    }
    packageSignatures.push({
      name,
      signature: signatureName,
      size: payload.length,
      sha256: createHash('sha256').update(payload).digest('hex'),
      valid: true,
    })
  }

  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'pass',
    release: {
      tag: manifest.release.tag,
      version: manifest.release.version,
      channel: manifest.release.channel,
    },
    checks: {
      requiredPairsPresent: true,
      preferredPairsUnique: true,
      preferredDigestsMatch: true,
      preferredSignaturesValid: true,
      allPublishedPackagesSigned: true,
      macosNativeTrust: macEvidence.mode === 'waived' ? 'waived' : true,
    },
    artifacts,
    packageSignatures,
    macos: macEvidence,
  }

  return {
    summary,
    ...(await writeSummaryFiles(outputDir, summary)),
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const releaseDir = resolve(
    getArgValue(argv, '--release-dir', 'release-assets'),
  )
  const manifestPath = resolve(
    getArgValue(
      argv,
      '--manifest',
      join(releaseDir, 'tuff-release-manifest.json'),
    ),
  )
  const publicKeyPath = getArgValue(
    argv,
    '--public-key',
    'apps/core-app/resources/keys/release-signing-public.pem',
  )
  const macEvidencePath = getArgValue(argv, '--mac-evidence')
  const outputDir = resolve(getArgValue(argv, '--output-dir', releaseDir))

  if (!publicKeyPath || !macEvidencePath) {
    throw new Error(
      'Usage: node scripts/generate-release-test-summary.mjs --release-dir <dir> --manifest <json> --public-key <pem> --mac-evidence <json> [--output-dir <dir>]',
    )
  }

  try {
    const result = await generateReleaseTestSummary({
      releaseDir,
      manifestPath,
      publicKeyPath: resolve(publicKeyPath),
      macEvidencePath: resolve(macEvidencePath),
      outputDir,
    })
    console.log(
      JSON.stringify(
        {
          status: result.summary.status,
          jsonPath: result.jsonPath,
          markdownPath: result.markdownPath,
          preferredArtifacts: result.summary.artifacts.length,
          signedPackages: result.summary.packageSignatures.length,
        },
        null,
        2,
      ),
    )
  }
  catch (error) {
    let release = null
    try {
      release
        = JSON.parse(await readFile(manifestPath, 'utf8')).release ?? null
    }
    catch {
      // Preserve a bounded failure summary even when the manifest cannot be parsed.
    }
    const rawMessage = error instanceof Error ? error.message : String(error)
    const reason = rawMessage
      .replaceAll(releaseDir, '<release-assets>')
      .replaceAll(resolve('.'), '<workspace>')
    await writeSummaryFiles(outputDir, {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      status: 'fail',
      release,
      failure: {
        reason: reason || 'release-integrity-check-failed',
      },
    })
    throw error
  }
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (
  entryPath
  && basename(process.argv[1]) === 'generate-release-test-summary.mjs'
  && import.meta.url === entryPath
) {
  main().catch((error) => {
    console.error(
      `[generate-release-test-summary] ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  })
}
