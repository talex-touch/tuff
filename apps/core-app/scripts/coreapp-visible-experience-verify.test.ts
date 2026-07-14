import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  COREAPP_VISIBLE_EXPERIENCE_EVIDENCE_SCHEMA,
  buildCoreAppVisibleExperienceManifest
} from '../src/main/modules/platform/coreapp-visible-experience-evidence'

const repoRoot = path.resolve(__dirname, '../../..')
const scriptPath = path.join(__dirname, 'coreapp-visible-experience-verify.ts')

interface RunVerifierOptions {
  requireCurrentVersion?: boolean
  requireEvidenceTags?: boolean
  requireExistingArtifacts?: boolean
}

interface VerifierFailure {
  status?: number
  output: string
}

function runVerifier(manifestPath: string, options: RunVerifierOptions = {}): string {
  return execFileSync(
    'corepack',
    [
      'pnpm',
      'exec',
      'tsx',
      scriptPath,
      '--input',
      manifestPath,
      ...(options.requireEvidenceTags !== false ? ['--requireEvidenceTags'] : []),
      ...(options.requireExistingArtifacts !== false ? ['--requireExistingArtifacts'] : []),
      ...(options.requireCurrentVersion ? ['--requireCurrentVersion'] : []),
      '--compact'
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
}

function captureVerifierFailure(manifestPath: string, options?: RunVerifierOptions): string {
  try {
    runVerifier(manifestPath, options)
    return ''
  } catch (error) {
    return formatVerifierFailure(error).output
  }
}

function captureVerifierFailureDetails(
  manifestPath: string,
  options?: RunVerifierOptions
): VerifierFailure | null {
  try {
    runVerifier(manifestPath, options)
    return null
  } catch (error) {
    return formatVerifierFailure(error)
  }
}

function formatVerifierFailure(error: unknown): VerifierFailure {
  const message = error instanceof Error ? error.message : String(error)
  if (!error || typeof error !== 'object') return { output: message }

  const stdout =
    'stdout' in error && (typeof error.stdout === 'string' || Buffer.isBuffer(error.stdout))
      ? error.stdout.toString()
      : undefined
  const stderr =
    'stderr' in error && (typeof error.stderr === 'string' || Buffer.isBuffer(error.stderr))
      ? error.stderr.toString()
      : undefined

  return {
    status: 'status' in error && typeof error.status === 'number' ? error.status : undefined,
    output: [message, stdout, stderr].filter(Boolean).join('\n')
  }
}

function currentCoreAppVersion(): string {
  const packageJson: unknown = JSON.parse(
    readFileSync(path.join(repoRoot, 'apps/core-app/package.json'), 'utf8')
  )
  if (
    !packageJson ||
    typeof packageJson !== 'object' ||
    !('version' in packageJson) ||
    typeof packageJson.version !== 'string'
  ) {
    throw new Error('CoreApp package version is unavailable')
  }

  return packageJson.version
}

function writeManifest(dir: string, baselineVersion: string): string {
  const manifestPath = path.join(dir, 'manifest.json')
  writeFileSync(
    manifestPath,
    JSON.stringify(
      buildCoreAppVisibleExperienceManifest({
        baselineVersion,
        generatedAt: '2026-07-13T00:00:00.000Z',
        evidenceDir: '.'
      }),
      null,
      2
    )
  )
  return manifestPath
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

  it('accepts a manifest whose baseline matches the current package version when required', () => {
    const currentVersion = currentCoreAppVersion()
    const dir = mkdtempSync(path.join(os.tmpdir(), 'coreapp-visible-verify-'))
    const manifestPath = writeManifest(dir, currentVersion)

    expect(
      JSON.parse(
        runVerifier(manifestPath, {
          requireCurrentVersion: true,
          requireEvidenceTags: false,
          requireExistingArtifacts: false
        })
      )
    ).toMatchObject({
      baselineVersion: currentVersion,
      gate: { passed: true, failures: [] }
    })
  })

  it('fails the current-version gate for a stale manifest and reports both versions', () => {
    const currentVersion = currentCoreAppVersion()
    const staleVersion = `${currentVersion}-stale-baseline`
    const dir = mkdtempSync(path.join(os.tmpdir(), 'coreapp-visible-verify-'))
    const manifestPath = writeManifest(dir, staleVersion)

    const failure = captureVerifierFailureDetails(manifestPath, {
      requireCurrentVersion: true,
      requireEvidenceTags: false,
      requireExistingArtifacts: false
    })

    expect(failure?.status).toBe(1)
    expect(failure?.output).toContain(
      `Visible experience baseline version mismatch: manifest=${staleVersion}, current=${currentVersion}`
    )
  })

  it('continues to verify historical baselines when the current-version flag is absent', () => {
    const staleVersion = `${currentCoreAppVersion()}-historical-baseline`
    const dir = mkdtempSync(path.join(os.tmpdir(), 'coreapp-visible-verify-'))
    const manifestPath = writeManifest(dir, staleVersion)

    expect(
      JSON.parse(
        runVerifier(manifestPath, {
          requireEvidenceTags: false,
          requireExistingArtifacts: false
        })
      )
    ).toMatchObject({
      baselineVersion: staleVersion,
      gate: { passed: true, failures: [] }
    })
  })
})
