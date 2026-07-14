import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CONTEXT_ENTRYPOINT_EVIDENCE_SCHEMA,
  type ContextEntrypointEvidenceCase,
  type ContextEntrypointEvidenceManifest,
  verifyContextEntrypointEvidence
} from './context-entrypoint-evidence'

const temporaryRoots: string[] = []

function createCase(
  overrides: Partial<ContextEntrypointEvidenceCase> = {}
): ContextEntrypointEvidenceCase {
  return {
    id: 'unit-corebox',
    entrypoint: 'corebox',
    level: 'unit',
    status: 'passed',
    source: 'vitest',
    timestamp: '2026-07-11T12:00:00.000Z',
    buildVersion: '2.4.13-beta.4',
    runtimeVersion: 'vitest-3.2.4',
    expected: { mode: 'new', sourceCount: 1 },
    observed: { mode: 'new', sourceCount: 1 },
    redaction: {
      status: 'passed',
      scanner: 'context-entrypoint-evidence-v1'
    },
    artifactPaths: ['artifacts/unit.json'],
    ...overrides
  }
}

function createManifest(): ContextEntrypointEvidenceManifest {
  return {
    schema: CONTEXT_ENTRYPOINT_EVIDENCE_SCHEMA,
    generatedAt: '2026-07-11T12:10:00.000Z',
    cases: [
      createCase(),
      createCase({
        id: 'controlled-workflow',
        entrypoint: 'workflow',
        level: 'controlled',
        source: 'controlled-harness',
        runtimeVersion: 'node-24',
        artifactPaths: ['artifacts/controlled.json']
      }),
      createCase({
        id: 'packaged-corebox',
        level: 'packaged',
        source: 'packaged-electron',
        runtimeVersion: 'electron-40',
        artifactPaths: ['artifacts/packaged-corebox.json']
      }),
      createCase({
        id: 'packaged-assistant',
        entrypoint: 'assistant',
        level: 'packaged',
        source: 'packaged-electron',
        runtimeVersion: 'electron-40',
        artifactPaths: ['artifacts/packaged-assistant.json']
      }),
      createCase({
        id: 'real-profile-open',
        entrypoint: 'cross-entrypoint',
        level: 'real-profile',
        status: 'open',
        source: 'not-collected',
        runtimeVersion: 'not-collected',
        redaction: {
          status: 'not-run',
          scanner: 'context-entrypoint-evidence-v1'
        },
        artifactPaths: []
      })
    ]
  }
}

async function createEvidenceRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'context-entrypoint-evidence-'))
  temporaryRoots.push(root)
  const artifactDir = path.join(root, 'artifacts')
  await mkdir(artifactDir, { recursive: true })
  await Promise.all(
    ['unit.json', 'controlled.json', 'packaged-corebox.json', 'packaged-assistant.json'].map(
      (name) => writeFile(path.join(artifactDir, name), '{}')
    )
  )
  return root
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe('context entrypoint evidence verifier', () => {
  it('accepts level-separated metadata-only evidence with packaged non-CoreBox coverage', async () => {
    const root = await createEvidenceRoot()

    await expect(verifyContextEntrypointEvidence(createManifest(), root)).resolves.toMatchObject({
      caseCount: 5,
      passedCount: 4,
      packagedEntrypoints: ['corebox', 'assistant'],
      privacyScan: 'passed'
    })
  })

  it('rejects raw interaction fields even when redaction is marked passed', async () => {
    const root = await createEvidenceRoot()
    const manifest = createManifest()
    manifest.cases[0].observed = { prompt: 'raw interaction data' }

    await expect(verifyContextEntrypointEvidence(manifest, root)).rejects.toThrow(
      'forbidden in metadata-only evidence'
    )
  })

  it('rejects packaged evidence without a non-CoreBox entrypoint', async () => {
    const root = await createEvidenceRoot()
    const manifest = createManifest()
    manifest.cases = manifest.cases.filter((item) => item.id !== 'packaged-assistant')

    await expect(verifyContextEntrypointEvidence(manifest, root)).rejects.toThrow(
      'at least one non-CoreBox entrypoint'
    )
  })

  it('scans metadata artifact contents instead of trusting the manifest flag', async () => {
    const root = await createEvidenceRoot()
    await writeFile(
      path.join(root, 'artifacts', 'unit.json'),
      JSON.stringify({ content: 'raw interaction data' })
    )

    await expect(verifyContextEntrypointEvidence(createManifest(), root)).rejects.toThrow(
      'forbidden in metadata-only evidence'
    )
  })

  it('rejects passed cases whose artifact is missing', async () => {
    const root = await createEvidenceRoot()
    const manifest = createManifest()
    manifest.cases[0].artifactPaths = ['artifacts/missing.json']

    await expect(verifyContextEntrypointEvidence(manifest, root)).rejects.toThrow()
  })
})
