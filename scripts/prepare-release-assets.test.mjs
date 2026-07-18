import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'vitest'

import {
  serializeCanonicalUpdateDowngradeEvidence,
  UPDATE_DOWNGRADE_EVIDENCE_SCHEMA,
  UPDATE_DOWNGRADE_EVIDENCE_SCHEMA_VERSION,
} from './lib/update-downgrade-evidence.mjs'
import { prepareReleaseAssets } from './prepare-release-assets.mjs'

const temporaryDirectories = []

async function createReleaseFixture() {
  const releaseDir = await mkdtemp(
    path.join(os.tmpdir(), 'tuff-prepare-release-assets-'),
  )
  temporaryDirectories.push(releaseDir)
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })
  const privateKeyPath = path.join(releaseDir, 'release-private-key.pem')
  const publicKeyPath = path.join(releaseDir, 'release-public-key.pem')

  await Promise.all([
    writeFile(
      privateKeyPath,
      privateKey.export({ format: 'pem', type: 'pkcs1' }),
    ),
    writeFile(publicKeyPath, publicKey.export({ format: 'pem', type: 'spki' })),
    writeFile(
      path.join(releaseDir, 'tuff-core-2.4.10-win32-x64-setup.exe'),
      'windows',
    ),
    writeFile(
      path.join(releaseDir, 'tuff-core-2.4.10-darwin-arm64.dmg'),
      'macos',
    ),
    writeFile(
      path.join(releaseDir, 'tuff-core-2.4.10-linux-x64.AppImage'),
      'linux',
    ),
  ])

  return {
    releaseDir,
    privateKey,
    privateKeyPath,
    publicKeyPath,
  }
}

function releaseOptions(fixture, overrides = {}) {
  return {
    releaseDir: fixture.releaseDir,
    tag: 'v2.4.10',
    channel: 'RELEASE',
    privateKeyPath: fixture.privateKeyPath,
    publicKeyPath: fixture.publicKeyPath,
    rollbackFromVersion: '2.4.9',
    expectedRollbackFromVersion: '2.4.9',
    rollbackCompatible: true,
    ...overrides,
  }
}

function downgradeEvidence(overrides = {}) {
  return {
    schema: UPDATE_DOWNGRADE_EVIDENCE_SCHEMA,
    schemaVersion: UPDATE_DOWNGRADE_EVIDENCE_SCHEMA_VERSION,
    evidence: [
      {
        platform: 'win32',
        arch: 'x64',
        currentVersion: '2.4.9',
        targetVersion: '2.4.10',
        rollbackFromVersion: '2.4.9',
        result: 'static-only',
        executionMode: 'static-only',
        nativeTrust: 'not-applicable',
      },
      {
        platform: 'darwin',
        arch: 'arm64',
        currentVersion: '2.4.9',
        targetVersion: '2.4.10',
        rollbackFromVersion: '2.4.9',
        result: 'static-only',
        executionMode: 'static-only',
        nativeTrust: 'not-applicable',
      },
      {
        platform: 'linux',
        arch: 'x64',
        currentVersion: '2.4.9',
        targetVersion: '2.4.10',
        rollbackFromVersion: '2.4.9',
        result: 'static-only',
        executionMode: 'static-only',
        nativeTrust: 'not-applicable',
      },
    ],
    ...overrides,
  }
}

async function writeSignedEvidence(fixture, payload, signature = null) {
  const evidencePath = path.join(fixture.releaseDir, 'rollback-evidence.json')
  const signaturePath = path.join(
    fixture.releaseDir,
    'rollback-evidence.json.sig',
  )
  const evidence = serializeCanonicalUpdateDowngradeEvidence(payload)
  const encodedSignature
    = signature
      ?? sign('sha256', Buffer.from(evidence), fixture.privateKey).toString(
        'base64',
      )

  await writeFile(evidencePath, evidence)
  await writeFile(signaturePath, `${encodedSignature}\n`)
  return { evidencePath, signaturePath }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true })),
  )
})

describe('prepareReleaseAssets rollback evidence gate', () => {
  it('publishes a rollback-incompatible release without downgrade evidence', async () => {
    const fixture = await createReleaseFixture()
    const result = await prepareReleaseAssets(
      releaseOptions(fixture, { rollbackCompatible: false }),
    )
    const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'))

    assert.deepEqual(manifest.release, {
      version: '2.4.10',
      channel: 'RELEASE',
      tag: 'v2.4.10',
      rollbackFromVersion: '2.4.9',
      rollbackCompatible: false,
    })
    assert.equal(result.preferredArtifacts.length, 3)
  })

  it('rejects rollback-compatible releases without evidence paths', async () => {
    const fixture = await createReleaseFixture()

    await assert.rejects(
      prepareReleaseAssets(releaseOptions(fixture)),
      /requires --rollback-evidence and a detached --rollback-evidence-signature/,
    )
  })

  it('rejects rollback-compatible releases with no detached evidence signature', async () => {
    const fixture = await createReleaseFixture()
    const evidencePath = path.join(
      fixture.releaseDir,
      'rollback-evidence.json',
    )
    await writeFile(
      evidencePath,
      serializeCanonicalUpdateDowngradeEvidence(downgradeEvidence()),
    )

    await assert.rejects(
      prepareReleaseAssets(
        releaseOptions(fixture, { rollbackEvidencePath: evidencePath }),
      ),
      /requires --rollback-evidence and a detached --rollback-evidence-signature/,
    )
  })

  it('rejects rollback evidence whose detached signature does not verify', async () => {
    const fixture = await createReleaseFixture()
    const evidence = await writeSignedEvidence(
      fixture,
      downgradeEvidence(),
      'not-a-valid-signature',
    )

    await assert.rejects(
      prepareReleaseAssets(
        releaseOptions(fixture, {
          rollbackEvidencePath: evidence.evidencePath,
          rollbackEvidenceSignaturePath: evidence.signaturePath,
        }),
      ),
      /detached signature does not verify/,
    )
  })

  it.each([
    { field: 'currentVersion', value: '2.4.8' },
    { field: 'targetVersion', value: '2.4.11' },
  ])(
    'rejects signed evidence whose $field does not bind the release pair',
    async ({ field, value }) => {
      const fixture = await createReleaseFixture()
      const evidence = await writeSignedEvidence(
        fixture,
        downgradeEvidence({
          evidence: downgradeEvidence().evidence.map(record => ({
            ...record,
            [field]: value,
          })),
        }),
      )

      await assert.rejects(
        prepareReleaseAssets(
          releaseOptions(fixture, {
            rollbackEvidencePath: evidence.evidencePath,
            rollbackEvidenceSignaturePath: evidence.signaturePath,
          }),
        ),
        new RegExp(`${field} must match`),
      )
    },
  )

  it('rejects a validly signed evidence payload that is not canonical JSON', async () => {
    const fixture = await createReleaseFixture()
    const payload = downgradeEvidence()
    const evidencePath = path.join(
      fixture.releaseDir,
      'rollback-evidence.json',
    )
    const signaturePath = path.join(
      fixture.releaseDir,
      'rollback-evidence.json.sig',
    )
    const nonCanonicalEvidence = JSON.stringify(payload, null, 2)
    await writeFile(evidencePath, nonCanonicalEvidence)
    await writeFile(
      signaturePath,
      `${sign('sha256', Buffer.from(nonCanonicalEvidence), fixture.privateKey).toString('base64')}\n`,
    )

    await assert.rejects(
      prepareReleaseAssets(
        releaseOptions(fixture, {
          rollbackEvidencePath: evidencePath,
          rollbackEvidenceSignaturePath: signaturePath,
        }),
      ),
      /must use canonical JSON bytes/,
    )
  })

  it('publishes a rollback-compatible release only with canonical evidence and a valid pinned-key signature', async () => {
    const fixture = await createReleaseFixture()
    const evidence = await writeSignedEvidence(fixture, downgradeEvidence())
    const result = await prepareReleaseAssets(
      releaseOptions(fixture, {
        rollbackEvidencePath: evidence.evidencePath,
        rollbackEvidenceSignaturePath: evidence.signaturePath,
      }),
    )
    const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'))

    assert.equal(manifest.schemaVersion, 2)
    assert.equal(manifest.release.rollbackCompatible, true)
    assert.equal(manifest.release.rollbackFromVersion, '2.4.9')
  })
})
