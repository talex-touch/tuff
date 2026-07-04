import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../../..')
const scriptPath = path.join(__dirname, 'settings-indexing-diagnostics-verify.ts')

function buildDiagnostics(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sources: [
      {
        descriptor: {
          id: 'file-provider',
          kind: 'file',
          displayName: 'File Index',
          platforms: ['darwin', 'win32', 'linux'],
          priority: 'deferred',
          storage: 'sqlite-index',
          privacy: 'medium',
          capabilities: {
            scan: true,
            watch: true,
            reconcile: true,
            reset: true,
            clear: true,
            open: true
          },
          admission: {
            owner: 'core',
            permissionScopes: ['file-system'],
            defaultState: 'enabled',
            clearable: true,
            rebuildable: true
          }
        },
        health: {
          status: 'ready',
          permissionState: 'granted',
          itemCount: 10,
          watchState: 'active',
          reconcileState: 'idle',
          lastIndexedAt: 1700000000000
        },
        roots: [{ sourceId: 'file-provider', path: '/tmp/a', permissionState: 'granted' }],
        recentTasks: [
          {
            kind: 'scan',
            status: 'failed',
            completedAt: 1700000000400,
            jobId: 'file-provider:scan:3',
            durationMs: 1234,
            trigger: 'manual',
            reason: 'manual-rebuild',
            attempt: 2,
            errorCode: 'SQLITE_BUSY',
            error: 'sqlite busy',
            summary: {
              batches: 2,
              records: 18,
              indexedRecords: 8,
              phase: 'store'
            }
          }
        ],
        ...overrides
      }
    ]
  }
}

function withTempJson(value: unknown, callback: (inputPath: string) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'settings-indexing-diagnostics-'))
  try {
    const inputPath = path.join(dir, 'diagnostics.json')
    writeFileSync(inputPath, JSON.stringify(value, null, 2), 'utf8')
    callback(inputPath)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function runVerifier(inputPath: string, args: string[] = []): string {
  return execFileSync(
    'corepack',
    ['pnpm', 'exec', 'tsx', scriptPath, '--input', inputPath, '--compact', ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
}

function captureVerifierFailure(inputPath: string, args: string[] = []): string {
  try {
    runVerifier(inputPath, args)
    return ''
  } catch (error) {
    const processError = error as Partial<{
      message: string
      stderr: Buffer | string
      stdout: Buffer | string
    }>
    return [processError.message, processError.stdout?.toString(), processError.stderr?.toString()]
      .filter(Boolean)
      .join('\n')
  }
}

describe('settings indexing diagnostics verifier cli', () => {
  it('passes when recent task chips expose durable audit fields', () => {
    withTempJson(buildDiagnostics(), (inputPath) => {
      const result = JSON.parse(runVerifier(inputPath, ['--sourceId', 'file-provider']))
      expect(result).toMatchObject({
        schema: 'settings-indexing-diagnostics-evidence-verification/v1',
        gate: {
          passed: true,
          failures: []
        },
        summary: {
          sourceCount: 1,
          checkedSourceCount: 1,
          passingSourceCount: 1
        },
        sources: [
          {
            sourceId: 'file-provider',
            recentTaskChipCount: 1,
            visibleRecentTaskChipCount: 1,
            visibleAuditFields: {
              duration: true,
              trigger: true,
              reason: true,
              attempt: true,
              errorCode: true
            },
            missingAuditFields: []
          }
        ]
      })
    })
  })

  it('fails when a required audit field is not visible in Settings recent task chips', () => {
    const diagnostics = buildDiagnostics({
      recentTasks: [
        {
          kind: 'scan',
          status: 'failed',
          completedAt: 1700000000400,
          jobId: 'file-provider:scan:3',
          durationMs: 1234,
          trigger: 'manual',
          reason: 'manual-rebuild',
          attempt: 2,
          error: 'sqlite busy',
          summary: {
            batches: 2,
            records: 18,
            indexedRecords: 8,
            phase: 'store'
          }
        }
      ]
    })

    withTempJson(diagnostics, (inputPath) => {
      expect(captureVerifierFailure(inputPath, ['--sourceId', 'file-provider'])).toContain(
        'Source file-provider is missing visible audit fields: errorCode'
      )
    })
  })

  it('accepts packaged probe envelopes with diagnostics.sources', () => {
    withTempJson({ diagnostics: buildDiagnostics() }, (inputPath) => {
      const result = JSON.parse(runVerifier(inputPath, ['--requireAuditFields', 'duration']))
      expect(result.gate.passed).toBe(true)
      expect(result.sources[0].visibleAuditFields.duration).toBe(true)
    })
  })

  it('accepts read-only packaged probe envelopes when required', () => {
    withTempJson(
      {
        mode: 'attach-only',
        profileMutationPolicy: 'read-only',
        diagnostics: buildDiagnostics()
      },
      (inputPath) => {
        const result = JSON.parse(
          runVerifier(inputPath, ['--requireReadOnlyEnvelope', '--requireAuditFields', 'duration'])
        )
        expect(result.gate.passed).toBe(true)
        expect(result.options.requireReadOnlyEnvelope).toBe(true)
      }
    )
  })

  it('accepts natural recent task evidence when the envelope has no controlled markers', () => {
    withTempJson(
      {
        mode: 'attach-only',
        profileMutationPolicy: 'read-only',
        seededRecentTaskEvidence: false,
        diagnostics: buildDiagnostics()
      },
      (inputPath) => {
        const result = JSON.parse(runVerifier(inputPath, ['--requireNaturalRecentTaskEvidence']))
        expect(result.gate.passed).toBe(true)
        expect(result.options.requireReadOnlyEnvelope).toBe(true)
        expect(result.options.requireNaturalRecentTaskEvidence).toBe(true)
      }
    )
  })

  it('rejects controlled probe markers for natural recent task evidence', () => {
    withTempJson(
      {
        mode: 'attach-only',
        profileMutationPolicy: 'read-only',
        seededRecentTaskEvidence: true,
        maintenanceAction: 'scan',
        fixtureRoot: '/tmp/tuff-r3-fixture',
        diagnostics: buildDiagnostics()
      },
      (inputPath) => {
        const output = captureVerifierFailure(inputPath, ['--requireNaturalRecentTaskEvidence'])
        expect(output).toContain('Probe envelope must not use seeded recent task evidence')
        expect(output).toContain('Probe envelope must not use maintenanceAction')
        expect(output).toContain('Probe envelope must not use fixtureRoot')
      }
    )
  })

  it('rejects isolated probe envelopes for read-only evidence', () => {
    withTempJson(
      {
        mode: 'isolated-launch',
        profileMutationPolicy: 'isolated-controlled',
        diagnostics: buildDiagnostics()
      },
      (inputPath) => {
        const output = captureVerifierFailure(inputPath, ['--requireReadOnlyEnvelope'])
        expect(output).toContain('Probe envelope mode must be attach-only')
        expect(output).toContain('Probe envelope profileMutationPolicy must be read-only')
      }
    )
  })
})
