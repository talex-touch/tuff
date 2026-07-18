import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'vitest'
import { generateReleaseTestSummary } from './generate-release-test-summary.mjs'
import {
  serializeCanonicalUpdateDowngradeEvidence,
  UPDATE_DOWNGRADE_EVIDENCE_SCHEMA,
  UPDATE_DOWNGRADE_EVIDENCE_SCHEMA_VERSION,
} from './lib/update-downgrade-evidence.mjs'

const tempDirs = []
const version = '2.4.12-beta.8'
const rollbackFromVersion = '2.4.12-beta.7'

function buildEvidence({ runtime = false } = {}) {
  const entry = (platform, arch, values = {}) => ({
    currentVersion: rollbackFromVersion,
    targetVersion: version,
    rollbackFromVersion,
    platform,
    arch,
    result: 'static-only',
    executionMode: 'static-only',
    nativeTrust:
      platform === 'darwin'
        ? 'waived:apple-developer-not-configured'
        : 'not-assessed',
    ...values,
  })

  return {
    schema: UPDATE_DOWNGRADE_EVIDENCE_SCHEMA,
    schemaVersion: UPDATE_DOWNGRADE_EVIDENCE_SCHEMA_VERSION,
    evidence: [
      entry('win32', 'x64'),
      entry(
        'darwin',
        'arm64',
        runtime
          ? {
              result: 'pass',
              executionMode: 'runtime',
              nativeTrust: 'pass',
              hostPlatform: 'darwin',
              hostArch: 'arm64',
              packagedIsolatedProfile: true,
            }
          : {},
      ),
      entry('linux', 'x64'),
    ],
  }
}

function buildMacEvidence({ developerId = false } = {}) {
  if (developerId) {
    return {
      mode: 'developer-id',
      status: 'pass',
      signingKind: 'developer-id',
      teamIdentifier: 'TEAMID1234',
      checks: { codesign: true, gatekeeper: true, notarization: true },
    }
  }
  return {
    mode: 'waived',
    status: 'waived',
    policyReason: 'apple-developer-not-configured',
    signingKind: 'ad-hoc-or-missing',
    checks: { codesign: false, gatekeeper: false, notarization: false },
  }
}

async function createReleaseFixture({
  rollbackCompatible = false,
  includeEvidence = true,
  runtimeEvidence = false,
  corruptSignature = false,
} = {}) {
  const releaseDir = await mkdtemp(join(tmpdir(), 'tuff-release-summary-'))
  tempDirs.push(releaseDir)
  const outputDir = join(releaseDir, 'summary')
  const manifestPath = join(releaseDir, 'tuff-release-manifest.json')
  const publicKeyPath = join(releaseDir, 'release-public.pem')
  const macEvidencePath = join(releaseDir, 'mac-evidence.json')
  const downgradeEvidencePath = join(releaseDir, 'downgrade-evidence.json')
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })
  const artifacts = [
    ['win32', 'x64', `tuff-core-${version}-win32-x64-setup.exe`],
    ['darwin', 'arm64', `tuff-core-${version}-darwin-arm64.dmg`],
    ['linux', 'x64', `tuff-core-${version}-linux-x64.AppImage`],
  ]
  const manifestArtifacts = []

  for (const [platform, arch, name] of artifacts) {
    const payload = Buffer.from(`release payload ${platform}/${arch}`)
    const signature
      = corruptSignature && platform === 'win32'
        ? Buffer.from('not-a-valid-signature').toString('base64')
        : sign('sha256', payload, privateKey).toString('base64')
    await Promise.all([
      writeFile(join(releaseDir, name), payload),
      writeFile(join(releaseDir, `${name}.sig`), `${signature}\n`, 'utf8'),
    ])
    manifestArtifacts.push({
      component: 'core',
      name,
      platform,
      arch,
      sha256: createHash('sha256').update(payload).digest('hex'),
      signature: `${name}.sig`,
    })
  }

  await Promise.all([
    writeFile(
      publicKeyPath,
      publicKey.export({ type: 'spki', format: 'pem' }),
      'utf8',
    ),
    writeFile(
      macEvidencePath,
      JSON.stringify(buildMacEvidence({ developerId: runtimeEvidence })),
      'utf8',
    ),
    writeFile(
      manifestPath,
      JSON.stringify({
        schemaVersion: 2,
        release: {
          tag: `v${version}`,
          version,
          channel: 'BETA',
          rollbackFromVersion,
          rollbackCompatible,
        },
        artifacts: manifestArtifacts,
      }),
      'utf8',
    ),
  ])
  if (includeEvidence) {
    await writeFile(
      downgradeEvidencePath,
      serializeCanonicalUpdateDowngradeEvidence(
        buildEvidence({ runtime: runtimeEvidence }),
      ),
      'utf8',
    )
  }

  return {
    releaseDir,
    manifestPath,
    publicKeyPath,
    macEvidencePath,
    downgradeEvidencePath: includeEvidence ? downgradeEvidencePath : undefined,
    outputDir,
  }
}

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true })),
  )
})

describe('generate-release-test-summary', () => {
  it('passes a release summary only with canonical, version-bound downgrade evidence', async () => {
    const fixture = await createReleaseFixture()

    const result = await generateReleaseTestSummary(fixture)

    assert.equal(result.summary.status, 'pass')
    assert.equal(result.summary.checks.downgradeEvidenceValidated, true)
    assert.equal(result.summary.checks.macosNativeTrust, 'waived')
    assert.deepEqual(
      result.summary.downgradeEvidence.entries.map(item => item.result),
      ['static-only', 'static-only', 'static-only'],
    )
  })

  it('rejects rollbackCompatible=true when no downgrade evidence is supplied', async () => {
    const fixture = await createReleaseFixture({
      rollbackCompatible: true,
      includeEvidence: false,
    })

    await assert.rejects(
      () => generateReleaseTestSummary(fixture),
      /rollbackCompatible=true requires validated downgrade evidence/,
    )
  })

  it('rejects rollbackCompatible=true when signed release bytes do not verify', async () => {
    const fixture = await createReleaseFixture({
      rollbackCompatible: true,
      runtimeEvidence: true,
      corruptSignature: true,
    })

    await assert.rejects(
      () => generateReleaseTestSummary(fixture),
      /Detached signature verification failed/,
    )
  })
})
