import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'vitest'
import {
  PLUGIN_RELEASE_EVIDENCE_CONTRACT,
  PLUGIN_RELEASE_REQUIRED_RECORDS,
  serializeCanonicalPluginReleaseEvidence,
  validatePluginReleaseEvidence,
  verifyPluginReleaseEvidenceFile,
} from './lib/plugin-release-evidence.mjs'

const tempDirectories = []
const requiredRecordIds = Object.keys(PLUGIN_RELEASE_REQUIRED_RECORDS)
const sourceRevision = '0123456789abcdef0123456789abcdef01234567'
const identity = Object.freeze({
  id: 'touch-quickops',
  name: 'Touch QuickOps',
  version: '1.2.3-beta.1',
  channel: 'BETA',
})

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function recordFacts(id, artifact, nexus, deploymentId) {
  switch (id) {
    case 'source-build':
      return { auditId: 'build-audit-20260718', cleanBuild: true, testsPassed: true }
    case 'package-policy':
      return { decision: 'passed', policyVersion: 'plugin-package-policy/v1' }
    case 'security-scan':
      return { decision: 'passed', findingCount: 0, reportSha256: 'a'.repeat(64) }
    case 'publisher-signature':
      return { decision: 'verified', algorithm: 'Ed25519', keyId: 'publisher-key-2026' }
    case 'real-upload':
      return {
        dryRun: false,
        database: 'd1',
        objectStorage: 'r2',
        pluginId: nexus.pluginId,
        versionId: nexus.versionId,
        packageKey: nexus.packageKey,
        requestAuditId: 'upload-audit-20260718',
      }
    case 'store-eligibility':
      return { status: 'approved', admission: 'eligible', publicVisible: false, betaVisible: true }
    case 'nexus-attestation':
      return { decision: 'verified', keyId: 'nexus-key-2026', deploymentId }
    case 'artifact-download':
      return { statusCode: 200, sha256: artifact.sha256, size: artifact.size, objectStorage: 'r2' }
    case 'coreapp-install':
      return { provider: 'tpex', installed: true, featureResult: true, logsSanitized: true }
    case 'duplicate-upload':
      return { rejected: true, statusCode: 409, versionRowCount: 1, targetObjectCount: 1, orphanCount: 0 }
    case 'retention':
      return { policy: 'retained-beta-evidence', versionExists: true, objectExists: true }
    default:
      throw new Error(`Unknown required record: ${id}`)
  }
}

function recordDependencies(id) {
  return {
    'source-build': [],
    'package-policy': ['source-build'],
    'security-scan': ['package-policy'],
    'publisher-signature': ['security-scan'],
    'real-upload': ['publisher-signature'],
    'store-eligibility': ['real-upload'],
    'nexus-attestation': ['real-upload'],
    'artifact-download': ['real-upload', 'nexus-attestation'],
    'coreapp-install': ['artifact-download'],
    'duplicate-upload': ['real-upload'],
    'retention': ['artifact-download'],
  }[id]
}

function recordTimestamp(index, milliseconds) {
  return new Date(Date.UTC(2026, 6, 18, 10, index, 0, milliseconds)).toISOString()
}

function findRecord(manifest, id) {
  const record = manifest.records.find(item => item.id === id)
  assert.ok(record, `Expected ${id} record in fixture`)
  return record
}

async function createReportFixture() {
  const reportDir = await mkdtemp(join(tmpdir(), 'tuff-plugin-release-evidence-'))
  tempDirectories.push(reportDir)

  const artifactBytes = Buffer.from('tpex release artifact fixture\n', 'utf8')
  const artifact = {
    pathRef: 'artifacts/touch-quickops-1.2.3-beta.1.tpex',
    sha256: sha256(artifactBytes),
    size: artifactBytes.byteLength,
  }
  const nexus = {
    packageKey: 'plugins/touch-quickops/1.2.3-beta.1/touch-quickops.tpex',
    pluginId: 'plugin-quickops-42',
    reviewAuditEventId: 'review-audit-20260718',
    uploadAuditEventId: 'upload-audit-20260718',
    versionId: 'version-quickops-123',
  }
  const deploymentId = 'nexus-production-20260718'
  const records = requiredRecordIds.map((id, index) => ({
    id,
    kind: PLUGIN_RELEASE_REQUIRED_RECORDS[id].kind,
    level: PLUGIN_RELEASE_REQUIRED_RECORDS[id].minimumLevel,
    status: 'passed',
    startedAt: recordTimestamp(index, 0),
    completedAt: recordTimestamp(index, 30_000),
    dependencies: recordDependencies(id),
    artifactSha256: artifact.sha256,
    sourceRevision,
    identity: { ...identity },
    facts: recordFacts(id, artifact, nexus, deploymentId),
    refs: [`projections/${id}.json`],
  }))
  const manifest = {
    contractVersion: PLUGIN_RELEASE_EVIDENCE_CONTRACT,
    generatedAt: '2026-07-18T11:00:00.000Z',
    environment: {
      kind: 'production',
      deploymentId,
      deploymentUrl: 'https://nexus.example.test',
      publicBaseUrl: 'https://nexus.example.test/store',
      database: {
        kind: 'd1',
        binding: 'NEXUS_DB',
        databaseId: 'd1-production-42',
        servedBy: 'cloudflare',
        region: 'weur',
        colo: 'AMS',
      },
      objectStorage: {
        kind: 'r2',
        provider: 'cloudflare-r2',
        binding: 'PLUGIN_ARTIFACTS',
        bucket: 'nexus-plugin-artifacts-production',
      },
    },
    source: {
      revision: sourceRevision,
      dirty: false,
      repository: 'talex-touch',
      pluginSource: 'plugins/touch-quickops',
    },
    plugin: { ...identity },
    artifact,
    nexus,
    gate: { passed: true, failures: [], checkedAt: '2026-07-18T11:00:00.000Z' },
    documents: {
      checklistRef: 'PLUGIN_RELEASE_EVIDENCE_CHECKLIST.md',
      summaryRef: 'README.md',
      strictOutputRef: 'plugin-release-strict-output.json',
      exitCodeRef: 'plugin-release-strict-exit-code.txt',
    },
    records,
  }

  await Promise.all([
    mkdir(join(reportDir, 'artifacts')),
    mkdir(join(reportDir, 'projections')),
  ])
  await writeFile(join(reportDir, artifact.pathRef), artifactBytes)
  await Promise.all(records.map(record => writeFile(
    join(reportDir, record.refs[0]),
    serializeCanonicalPluginReleaseEvidence({
      recordId: record.id,
      identity: record.identity,
      artifact: { sha256: artifact.sha256, size: artifact.size },
      sourceRevision,
    }),
    'utf8',
  )))
  await Promise.all([
    writeFile(join(reportDir, manifest.documents.checklistRef), '# Plugin release evidence\n', 'utf8'),
    writeFile(join(reportDir, manifest.documents.summaryRef), '# Release evidence summary\n', 'utf8'),
  ])

  const provisional = await validatePluginReleaseEvidence(manifest, {
    reportDir,
    skipStrictOutput: true,
  })
  if (!provisional.valid || !provisional.summary) {
    throw new Error(`Fixture must be valid before strict-output capture: ${provisional.issues.join('; ')}`)
  }

  await Promise.all([
    writeFile(
      join(reportDir, manifest.documents.strictOutputRef),
      serializeCanonicalPluginReleaseEvidence(provisional.summary),
      'utf8',
    ),
    writeFile(join(reportDir, manifest.documents.exitCodeRef), '0\n', 'utf8'),
  ])
  const manifestPath = join(reportDir, 'plugin-release-evidence-manifest.json')
  await writeFile(manifestPath, serializeCanonicalPluginReleaseEvidence(manifest), 'utf8')

  return { artifactBytes, manifest, manifestPath, reportDir }
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('plugin release evidence strict verifier', () => {
  it('accepts one canonical production report bound to its artifact, projections, and deterministic captures', async () => {
    const fixture = await createReportFixture()
    const result = await verifyPluginReleaseEvidenceFile(fixture.manifestPath)

    assert.equal(result.valid, true)
    assert.deepEqual(result.summary?.records.map(record => record.id), requiredRecordIds)
    assert.equal(
      await readFile(join(fixture.reportDir, fixture.manifest.documents.strictOutputRef), 'utf8'),
      serializeCanonicalPluginReleaseEvidence(result.summary),
    )
    assert.equal(
      await readFile(join(fixture.reportDir, fixture.manifest.documents.exitCodeRef), 'utf8'),
      '0\n',
    )
  })

  it.each([
    {
      name: 'a missing real upload record',
      mutate: (fixture) => {
        fixture.manifest.records = fixture.manifest.records.filter(record => record.id !== 'real-upload')
      },
      issue: 'required record real-upload is missing',
    },
    {
      name: 'another missing required record',
      mutate: (fixture) => {
        fixture.manifest.records = fixture.manifest.records.filter(record => record.id !== 'retention')
      },
      issue: 'required record retention is missing',
    },
    {
      name: 'artifact bytes that no longer match the manifest digest',
      mutate: async (fixture) => {
        await writeFile(join(fixture.reportDir, fixture.manifest.artifact.pathRef), 'tampered artifact bytes\n', 'utf8')
      },
      issue: 'artifact.pathRef SHA-256 does not match artifact.sha256',
    },
    {
      name: 'a record identity version from another plugin release',
      mutate: (fixture) => {
        findRecord(fixture.manifest, 'source-build').identity.version = '9.9.9'
      },
      issue: 'records[0].identity.version must match plugin.version',
    },
    {
      name: 'an invalid evidence level',
      mutate: (fixture) => {
        findRecord(fixture.manifest, 'source-build').level = 'production'
      },
      issue: 'records[0].level is invalid',
    },
    {
      name: 'evidence below the required level',
      mutate: (fixture) => {
        findRecord(fixture.manifest, 'real-upload').level = 'deployed'
      },
      issue: 'record real-upload requires real-upload evidence',
    },
    {
      name: 'a missing projection reference',
      mutate: (fixture) => {
        findRecord(fixture.manifest, 'source-build').refs = ['projections/missing.json']
      },
      issue: 'reference projections/missing.json does not exist',
    },
    {
      name: 'a reference escaping the report directory',
      mutate: (fixture) => {
        findRecord(fixture.manifest, 'source-build').refs = ['../outside.json']
      },
      issue: 'records.source-build.refs[0] must be a report-relative POSIX path',
    },
    {
      name: 'an absolute projection reference',
      mutate: (fixture) => {
        findRecord(fixture.manifest, 'source-build').refs = ['/tmp/outside.json']
      },
      issue: 'records.source-build.refs[0] must be a report-relative POSIX path',
    },
    {
      name: 'a malformed JSON projection',
      mutate: async (fixture) => {
        await writeFile(join(fixture.reportDir, findRecord(fixture.manifest, 'source-build').refs[0]), '{', 'utf8')
      },
      issue: 'reference projections/source-build.json is not valid JSON',
    },
    {
      name: 'a dependency that starts before its prerequisite completes',
      mutate: (fixture) => {
        const upload = findRecord(fixture.manifest, 'real-upload')
        const download = findRecord(fixture.manifest, 'artifact-download')
        upload.completedAt = '2026-07-18T10:05:00.000Z'
        download.dependencies = ['real-upload']
        download.startedAt = '2026-07-18T10:04:45.000Z'
      },
      issue: 'records.artifact-download starts before dependency real-upload completed',
    },
    {
      name: 'a failed security scan decision',
      mutate: (fixture) => {
        findRecord(fixture.manifest, 'security-scan').facts.decision = 'failed'
      },
      issue: 'records.security-scan.facts.decision must equal "passed"',
    },
    {
      name: 'a failed CoreApp install feature result',
      mutate: (fixture) => {
        findRecord(fixture.manifest, 'coreapp-install').facts.featureResult = false
      },
      issue: 'records.coreapp-install.facts.featureResult must equal true',
    },
    {
      name: 'a private key in the curated manifest',
      mutate: (fixture) => {
        fixture.manifest.source.repository = '-----BEGIN PRIVATE KEY-----'
      },
      issue: 'manifest.source.repository contains forbidden private key',
    },
    {
      name: 'an authorization secret in a record projection',
      mutate: (fixture) => {
        findRecord(fixture.manifest, 'source-build').facts.auditId = 'authorization: Bearer release-secret'
      },
      issue: 'manifest.records[0].facts.auditId contains forbidden authorization header',
    },
    {
      name: 'a release token in the curated manifest',
      mutate: (fixture) => {
        fixture.manifest.source.repository = 'tuff_abcdefghijklmnop'
      },
      issue: 'manifest.source.repository contains forbidden Tuff credential',
    },
    {
      name: 'an absolute user path in the curated manifest',
      mutate: (fixture) => {
        fixture.manifest.source.pluginSource = '/Users/alice/private-plugin-source'
      },
      issue: 'manifest.source.pluginSource contains forbidden absolute user path',
    },
    {
      name: 'a strict output capture that drifts from the deterministic summary',
      mutate: async (fixture) => {
        await writeFile(
          join(fixture.reportDir, fixture.manifest.documents.strictOutputRef),
          '{"status":"passed"}\n',
          'utf8',
        )
      },
      issue: 'strict output does not match the deterministic summary',
    },
  ])('rejects $name', async ({ mutate, issue }) => {
    const fixture = await createReportFixture()
    await mutate(fixture)

    const result = await validatePluginReleaseEvidence(fixture.manifest, { reportDir: fixture.reportDir })

    assert.equal(result.valid, false)
    assert.ok(result.issues.includes(issue), result.issues.join('\n'))
  })

  it('returns the same lexicographically ordered issue list for repeated strict validation', async () => {
    const fixture = await createReportFixture()
    fixture.manifest.source.dirty = true
    fixture.manifest.environment.kind = 'preview'
    findRecord(fixture.manifest, 'security-scan').facts.findingCount = 1

    const [first, second] = await Promise.all([
      validatePluginReleaseEvidence(fixture.manifest, { reportDir: fixture.reportDir }),
      validatePluginReleaseEvidence(fixture.manifest, { reportDir: fixture.reportDir }),
    ])

    assert.equal(first.valid, false)
    assert.deepEqual(first.issues, second.issues)
    assert.deepEqual(first.issues, [...first.issues].sort((left, right) => left.localeCompare(right)))
  })
})
