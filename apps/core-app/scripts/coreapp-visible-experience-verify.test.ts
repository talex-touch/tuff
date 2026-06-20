import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  COREAPP_VISIBLE_EXPERIENCE_EVIDENCE_SCHEMA,
  buildCoreAppVisibleExperienceManifest
} from '../src/main/modules/platform/coreapp-visible-experience-evidence'

const repoRoot = path.resolve(__dirname, '../../..')
const scriptPath = path.join(__dirname, 'coreapp-visible-experience-verify.ts')

function runVerifier(manifestPath: string): string {
  return execFileSync(
    'pnpm',
    [
      'exec',
      'tsx',
      scriptPath,
      '--input',
      manifestPath,
      '--requireEvidenceTags',
      '--requireExistingArtifacts',
      '--compact'
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
}

function captureVerifierFailure(manifestPath: string): string {
  try {
    runVerifier(manifestPath)
    return ''
  } catch (error) {
    const childProcessError = error as Partial<{
      message: string
      stderr: Buffer | string
      stdout: Buffer | string
    }>

    return [
      childProcessError.message,
      childProcessError.stdout?.toString(),
      childProcessError.stderr?.toString()
    ]
      .filter(Boolean)
      .join('\n')
  }
}

describe('coreapp visible experience verifier cli', () => {
  it('checks files referenced only by evidenceTagArtifacts', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'coreapp-visible-verify-'))
    const attachedArtifact = 'attached.png'
    writeFileSync(path.join(dir, attachedArtifact), 'png')

    const manifest = buildCoreAppVisibleExperienceManifest({
      baselineVersion: '2.4.12-beta.8',
      generatedAt: '2026-06-20T00:00:00.000Z',
      evidenceDir: '.'
    })
    const coreboxAiAsk = manifest.surfaces.find((item) => item.id === 'corebox-ai-ask')
    expect(coreboxAiAsk).toBeDefined()
    if (!coreboxAiAsk) return

    coreboxAiAsk.artifactPaths = [attachedArtifact]
    coreboxAiAsk.evidenceTags = ['AI-STABLE-06']
    coreboxAiAsk.evidenceTagArtifacts = {
      'AI-STABLE-06': ['tag-only-missing.png']
    }

    const manifestPath = path.join(dir, 'manifest.json')
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          ...manifest,
          schema: COREAPP_VISIBLE_EXPERIENCE_EVIDENCE_SCHEMA
        },
        null,
        2
      )
    )

    expect(captureVerifierFailure(manifestPath)).toMatch(/tag-only-missing\.png/)
  })
})
