import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'vitest'
import {
  serializeCanonicalUpdateDowngradeEvidence,
  UPDATE_DOWNGRADE_EVIDENCE_SCHEMA,
  UPDATE_DOWNGRADE_EVIDENCE_SCHEMA_VERSION,
  validateUpdateDowngradeEvidence,
} from './lib/update-downgrade-evidence.mjs'
import { validateUpdateDowngradeEvidenceFile } from './validate-update-downgrade-evidence.mjs'

const tempDirs = []
const versions = {
  currentVersion: '2.4.12-beta.7',
  targetVersion: '2.4.12-beta.8',
  rollbackFromVersion: '2.4.12-beta.7',
}

function buildEvidence(overrides = {}) {
  const record = (platform, arch, values = {}) => ({
    currentVersion: versions.currentVersion,
    targetVersion: versions.targetVersion,
    rollbackFromVersion: versions.rollbackFromVersion,
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
      record('win32', 'x64', overrides.win32),
      record('darwin', 'arm64', overrides.darwin),
      record('linux', 'x64', overrides.linux),
    ],
  }
}

async function createEvidenceFile(payload, { canonical = true } = {}) {
  const directory = await mkdtemp(
    join(tmpdir(), 'tuff-update-downgrade-evidence-'),
  )
  tempDirs.push(directory)
  const evidencePath = join(directory, 'evidence.json')
  const content = canonical
    ? serializeCanonicalUpdateDowngradeEvidence(payload)
    : `${JSON.stringify(payload, null, 2)}\n`
  await writeFile(evidencePath, content, 'utf8')
  return evidencePath
}

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true })),
  )
})

describe('validate-update-downgrade-evidence', () => {
  it('accepts canonical evidence with static-only non-host pairs and a waived macOS trust record', async () => {
    const payload = buildEvidence()
    const evidencePath = await createEvidenceFile(payload)

    const result = await validateUpdateDowngradeEvidenceFile({
      evidencePath,
      ...versions,
    })

    assert.equal(result.valid, true)
    assert.deepEqual(
      result.evidence.map(
        item => `${item.platform}/${item.arch}:${item.executionMode}`,
      ),
      [
        'win32/x64:static-only',
        'darwin/arm64:static-only',
        'linux/x64:static-only',
      ],
    )
  })

  it('accepts the local darwin arm64 runtime only with a packaged isolated profile', () => {
    const result = validateUpdateDowngradeEvidence(
      buildEvidence({
        darwin: {
          result: 'pass',
          executionMode: 'runtime',
          hostPlatform: 'darwin',
          hostArch: 'arm64',
          packagedIsolatedProfile: true,
          nativeTrust: 'pass',
        },
      }),
      versions,
    )

    assert.equal(result.valid, true)
    assert.equal(result.byPair.get('darwin/arm64')?.executionMode, 'runtime')
  })

  it('rejects pretty-printed evidence because the CLI consumes canonical JSON bytes only', async () => {
    const evidencePath = await createEvidenceFile(buildEvidence(), {
      canonical: false,
    })

    await assert.rejects(
      () => validateUpdateDowngradeEvidenceFile({ evidencePath, ...versions }),
      /canonical JSON bytes/,
    )
  })

  it.each([
    {
      name: 'a fake Windows runtime pass',
      overrides: {
        win32: {
          result: 'pass',
          executionMode: 'runtime',
          hostPlatform: 'win32',
          hostArch: 'x64',
          packagedIsolatedProfile: true,
          nativeTrust: 'pass',
        },
      },
      issue:
        'evidence[0].win32/x64 must be static-only on this release acceptance host',
    },
    {
      name: 'a fake Linux runtime pass',
      overrides: {
        linux: {
          result: 'pass',
          executionMode: 'runtime',
          hostPlatform: 'linux',
          hostArch: 'x64',
          packagedIsolatedProfile: true,
          nativeTrust: 'pass',
        },
      },
      issue:
        'evidence[2].linux/x64 must be static-only on this release acceptance host',
    },
    {
      name: 'a macOS runtime without a packaged isolated profile',
      overrides: {
        darwin: {
          result: 'pass',
          executionMode: 'runtime',
          hostPlatform: 'darwin',
          hostArch: 'arm64',
          packagedIsolatedProfile: false,
          nativeTrust: 'pass',
        },
      },
      issue:
        'evidence[1].runtime evidence requires packagedIsolatedProfile=true',
    },
    {
      name: 'an imprecise Apple Developer waiver token',
      overrides: {
        darwin: { nativeTrust: 'waived' },
      },
      issue: 'evidence[1].nativeTrust is invalid',
    },
    {
      name: 'a macOS runtime that labels the Apple Developer waiver as a pass',
      overrides: {
        darwin: {
          result: 'pass',
          executionMode: 'runtime',
          hostPlatform: 'darwin',
          hostArch: 'arm64',
          packagedIsolatedProfile: true,
          nativeTrust: 'waived:apple-developer-not-configured',
        },
      },
      issue: 'evidence[1].Apple Developer waiver cannot produce a pass',
    },
  ])('rejects $name', ({ overrides, issue }) => {
    const result = validateUpdateDowngradeEvidence(
      buildEvidence(overrides),
      versions,
    )

    assert.equal(result.valid, false)
    assert.ok(result.issues.includes(issue))
  })
})
