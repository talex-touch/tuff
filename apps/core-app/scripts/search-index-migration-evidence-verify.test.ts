import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  verifySearchIndexMigrationEvidence,
  type SearchIndexMigrationSettingsVisibleArtifactEvidence
} from './search-index-migration-evidence-verify'

const repoRoot = path.resolve(__dirname, '../../..')
const scriptPath = path.join(__dirname, 'search-index-migration-evidence-verify.ts')
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x52, 0x33])

function createPreflight(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    destructiveActions: false,
    gate: { passed: true, failedChecks: [] },
    evidenceSource: {
      scope: 'real-profile',
      dbPathClass: 'non-temporary',
      realProfileRequired: true
    },
    migrationReadiness: {
      sqliteFtsOwnership: 'needs-confirmation',
      scanProgressSourceScope: 'ready'
    },
    snapshot: {
      sqliteRuntime: {
        queryOnly: true
      }
    },
    checks: [
      {
        id: 'task-history-store',
        status: 'passed',
        evidence: {
          rows: 1,
          evidence: 'durable-history-present'
        }
      }
    ],
    ...overrides
  }
}

function createProductionReadiness(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    kind: 'search-index-production-migration-readiness',
    mode: 'source-read-only',
    destructiveActions: false,
    migrationJournal: {
      journalEntriesWithoutSql: [],
      sqlFilesWithoutJournalEntry: []
    },
    checks: {
      legacyFileFtsMigrationPolicy: {
        status: 'retained'
      }
    },
    readiness: {
      status: 'ready',
      blockers: []
    },
    ...overrides
  }
}

function createFtsSimulation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'search-index-fts-ownership-simulation',
    destructiveActions: false,
    simulationMutatesCopy: true,
    sourceMutationPolicy: 'source-not-mutated-copy-execute',
    sourceSnapshotUnchanged: true,
    evidenceSource: {
      scope: 'real-profile',
      dbPathClass: 'non-temporary',
      realProfileRequired: true
    },
    gate: {
      passed: true,
      blockers: []
    },
    ...overrides
  }
}

function createScanProgressSimulation(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    kind: 'scan-progress-source-scope-simulation',
    destructiveActions: false,
    sourceMutationPolicy: 'source-not-mutated-copy-execute',
    sourceSnapshotUnchanged: true,
    evidenceSource: {
      scope: 'real-profile',
      dbPathClass: 'non-temporary',
      realProfileRequired: true
    },
    execution: {
      executed: true
    },
    gate: {
      passed: true,
      blockers: []
    },
    ...overrides
  }
}

function createScanProgressPlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mode: 'plan',
    executed: false,
    queryOnly: true,
    evidenceSource: {
      scope: 'real-profile',
      dbPathClass: 'non-temporary',
      realProfileRequired: true
    },
    plan: {
      mode: 'read-only',
      destructiveActions: false,
      requiresApproval: true,
      blockers: []
    },
    ...overrides
  }
}

function createSettingsVerification(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schema: 'settings-indexing-diagnostics-evidence-verification/v1',
    gate: {
      passed: true,
      failures: []
    },
    options: {
      sourceId: 'file-provider',
      minRecentTasks: 1,
      requiredAuditFields: ['duration', 'trigger', 'reason', 'attempt', 'errorCode'],
      requireReadOnlyEnvelope: true,
      requireNaturalRecentTaskEvidence: true
    },
    ...overrides
  }
}

function createSettingsProbe(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ok: true,
    mode: 'attach-only',
    profileMutationPolicy: 'read-only',
    sourceId: 'file-provider',
    verification: createSettingsVerification(),
    artifactPaths: {
      verification: 'settings-verification.json',
      settingsScreenshot: 'settings.png',
      detailScreenshot: 'detail.png',
      settingsDom: 'settings-dom.json',
      detailDom: 'detail-dom.json'
    },
    ...overrides
  }
}

function createSettingsVisibleArtifacts(
  overrides: Partial<SearchIndexMigrationSettingsVisibleArtifactEvidence> = {}
): SearchIndexMigrationSettingsVisibleArtifactEvidence {
  return {
    settingsVerification: 'settings-verification.json',
    probeVerification: 'settings-verification.json',
    verificationPathMatchesProbe: true,
    verificationMatchesProbeEnvelope: true,
    settingsScreenshot: 'settings.png',
    detailScreenshot: 'detail.png',
    settingsDom: 'settings-dom.json',
    detailDom: 'detail-dom.json',
    settingsScreenshotExists: true,
    settingsScreenshotNonEmpty: true,
    settingsScreenshotPng: true,
    detailScreenshotExists: true,
    detailScreenshotNonEmpty: true,
    detailScreenshotPng: true,
    settingsDomExists: true,
    settingsDomNonEmpty: true,
    settingsDomHasSourceDiagnosticsGroup: true,
    detailDomExists: true,
    detailDomNonEmpty: true,
    detailDomDialogVisible: true,
    detailDomHasRecentTasks: true,
    ...overrides
  }
}

function writeJsonArtifact(dir: string, fileName: string, value: unknown): string {
  const filePath = path.join(dir, fileName)
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
  return filePath
}

function runCli(args: string[]): string {
  return execFileSync('corepack', ['pnpm', 'exec', 'tsx', scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

const strictRequirements = {
  requireRealProfilePreflight: true,
  requireSourceScopedScanProgress: true,
  requireProductionReadiness: true,
  requireFtsSimulation: true,
  requireScanProgressSimulation: true,
  requireScanProgressPlan: true,
  requireNaturalSettingsEvidence: true,
  requireSettingsVisibleArtifacts: true
}

describe('search index migration evidence verifier', () => {
  it('rejects isolated preflight and missing natural settings evidence in strict mode', () => {
    const result = verifySearchIndexMigrationEvidence(
      {
        preflight: createPreflight({
          evidenceSource: {
            scope: 'isolated-controlled',
            dbPathClass: 'temporary',
            realProfileRequired: false
          },
          migrationReadiness: {
            sqliteFtsOwnership: 'needs-confirmation',
            scanProgressSourceScope: 'needs-migration'
          }
        }),
        productionReadiness: createProductionReadiness(),
        ftsSimulation: createFtsSimulation(),
        scanProgressSimulation: createScanProgressSimulation(),
        scanProgressPlan: createScanProgressPlan()
      },
      strictRequirements
    )

    expect(result.gate.passed).toBe(false)
    expect(result.gate.failures).toContain('Preflight evidenceSource.scope must be real-profile')
    expect(result.gate.failures).toContain(
      'Preflight evidenceSource.dbPathClass must be non-temporary'
    )
    expect(result.gate.failures).toContain(
      'Preflight evidenceSource.realProfileRequired must be true'
    )
    expect(result.gate.failures).toContain('Preflight scanProgressSourceScope must be ready')
    expect(result.gate.failures).toContain('settings-natural-recent-task evidence is required')
    expect(result.gate.failures).toContain('settings-visible-artifacts evidence is required')
  })

  it('passes a strict real-profile evidence packet', () => {
    const result = verifySearchIndexMigrationEvidence(
      {
        preflight: createPreflight(),
        productionReadiness: createProductionReadiness(),
        ftsSimulation: createFtsSimulation(),
        scanProgressSimulation: createScanProgressSimulation(),
        scanProgressPlan: createScanProgressPlan(),
        settingsVerification: createSettingsVerification(),
        settingsProbe: createSettingsProbe(),
        settingsVisibleArtifacts: createSettingsVisibleArtifacts()
      },
      strictRequirements
    )

    expect(result.gate).toEqual({
      passed: true,
      failures: []
    })
    expect(result.checks.every((check) => check.status === 'passed')).toBe(true)
  })

  it('rejects isolated scan progress plan evidence in strict mode', () => {
    const result = verifySearchIndexMigrationEvidence(
      {
        preflight: createPreflight(),
        productionReadiness: createProductionReadiness(),
        ftsSimulation: createFtsSimulation(),
        scanProgressSimulation: createScanProgressSimulation(),
        scanProgressPlan: createScanProgressPlan({
          evidenceSource: {
            scope: 'isolated-controlled',
            dbPathClass: 'temporary',
            realProfileRequired: false
          }
        }),
        settingsVerification: createSettingsVerification(),
        settingsProbe: createSettingsProbe(),
        settingsVisibleArtifacts: createSettingsVisibleArtifacts()
      },
      strictRequirements
    )

    expect(result.gate.passed).toBe(false)
    expect(result.gate.failures).toContain(
      'scan_progress plan evidenceSource.scope must be real-profile'
    )
    expect(result.gate.failures).toContain(
      'scan_progress plan evidenceSource.dbPathClass must be non-temporary'
    )
    expect(result.gate.failures).toContain(
      'scan_progress plan evidenceSource.realProfileRequired must be true'
    )
  })

  it('rejects isolated copy simulation evidence in strict mode', () => {
    const result = verifySearchIndexMigrationEvidence(
      {
        preflight: createPreflight(),
        productionReadiness: createProductionReadiness(),
        ftsSimulation: createFtsSimulation({
          evidenceSource: {
            scope: 'isolated-controlled',
            dbPathClass: 'temporary',
            realProfileRequired: false
          }
        }),
        scanProgressSimulation: createScanProgressSimulation({
          evidenceSource: {
            scope: 'isolated-controlled',
            dbPathClass: 'temporary',
            realProfileRequired: false
          }
        }),
        scanProgressPlan: createScanProgressPlan(),
        settingsVerification: createSettingsVerification(),
        settingsProbe: createSettingsProbe(),
        settingsVisibleArtifacts: createSettingsVisibleArtifacts()
      },
      strictRequirements
    )

    expect(result.gate.passed).toBe(false)
    expect(result.gate.failures).toContain(
      'FTS simulation evidenceSource.scope must be real-profile'
    )
    expect(result.gate.failures).toContain(
      'scan_progress simulation evidenceSource.scope must be real-profile'
    )
    expect(result.nextActions).toContain(
      'Collect real-profile FTS copy simulation with --evidenceScope real-profile --requireRealProfileEvidence.'
    )
    expect(result.nextActions).toContain(
      'Collect real-profile scan_progress copy simulation with --evidenceScope real-profile --requireRealProfileEvidence.'
    )
  })

  it('rejects empty durable task history in strict mode', () => {
    const result = verifySearchIndexMigrationEvidence(
      {
        preflight: createPreflight({
          checks: [
            {
              id: 'task-history-store',
              status: 'warning',
              evidence: {
                rows: 0,
                evidence: 'durable-history-empty'
              }
            }
          ]
        }),
        productionReadiness: createProductionReadiness(),
        ftsSimulation: createFtsSimulation(),
        scanProgressSimulation: createScanProgressSimulation(),
        scanProgressPlan: createScanProgressPlan(),
        settingsVerification: createSettingsVerification(),
        settingsProbe: createSettingsProbe(),
        settingsVisibleArtifacts: createSettingsVisibleArtifacts()
      },
      strictRequirements
    )

    expect(result.gate.passed).toBe(false)
    expect(result.gate.failures).toContain(
      'Preflight task-history-store evidence must be durable-history-present'
    )
    expect(result.gate.failures).toContain('Preflight task-history-store rows must be at least 1')
  })

  it('allows isolated scan progress plan evidence outside the strict closure gate', () => {
    const result = verifySearchIndexMigrationEvidence(
      {
        scanProgressPlan: createScanProgressPlan({
          evidenceSource: {
            scope: 'isolated-controlled',
            dbPathClass: 'temporary',
            realProfileRequired: false
          }
        })
      },
      { requireScanProgressPlan: false }
    )

    expect(result.gate).toEqual({ passed: true, failures: [] })
    expect(result.checks.find((check) => check.id === 'scan-progress-plan')?.status).toBe('passed')
  })

  it('passes strict CLI verification with PNG screenshots and DOM artifacts', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'search-index-migration-evidence-'))
    try {
      writeFileSync(path.join(dir, 'settings.png'), pngBytes)
      writeFileSync(path.join(dir, 'detail.png'), pngBytes)
      writeJsonArtifact(dir, 'settings-dom.json', {
        hasSourceDiagnosticsGroup: true
      })
      writeJsonArtifact(dir, 'detail-dom.json', {
        dialog: {
          visible: true,
          hasRecentTasks: true
        }
      })

      const stdout = runCli([
        '--strict',
        '--compact',
        '--preflight',
        writeJsonArtifact(dir, 'preflight.json', createPreflight()),
        '--productionReadiness',
        writeJsonArtifact(dir, 'production-readiness.json', createProductionReadiness()),
        '--ftsSimulation',
        writeJsonArtifact(dir, 'fts-simulation.json', createFtsSimulation()),
        '--scanProgressSimulation',
        writeJsonArtifact(dir, 'scan-progress-simulation.json', createScanProgressSimulation()),
        '--scanProgressPlan',
        writeJsonArtifact(dir, 'scan-progress-plan.json', createScanProgressPlan()),
        '--settingsVerification',
        writeJsonArtifact(dir, 'settings-verification.json', createSettingsVerification()),
        '--settingsProbe',
        writeJsonArtifact(dir, 'settings-probe.json', createSettingsProbe())
      ])
      const result = JSON.parse(stdout) as {
        gate: { passed: boolean; failures: string[] }
        checks: Array<{ id: string; evidence?: Record<string, unknown> }>
      }
      const visibleArtifacts = result.checks.find(
        (check) => check.id === 'settings-visible-artifacts'
      )

      expect(result.gate).toEqual({ passed: true, failures: [] })
      expect(visibleArtifacts?.evidence).toMatchObject({
        settingsScreenshotPng: true,
        detailScreenshotPng: true,
        settingsDomHasSourceDiagnosticsGroup: true,
        detailDomDialogVisible: true,
        detailDomHasRecentTasks: true
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects CLI Settings verification artifact paths that do not match the probe envelope', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'search-index-migration-evidence-'))
    try {
      writeFileSync(path.join(dir, 'settings.png'), pngBytes)
      writeFileSync(path.join(dir, 'detail.png'), pngBytes)
      writeJsonArtifact(dir, 'settings-dom.json', {
        hasSourceDiagnosticsGroup: true
      })
      writeJsonArtifact(dir, 'detail-dom.json', {
        dialog: {
          visible: true,
          hasRecentTasks: true
        }
      })

      let stdout = ''
      try {
        stdout = runCli([
          '--strict',
          '--compact',
          '--preflight',
          writeJsonArtifact(dir, 'preflight.json', createPreflight()),
          '--productionReadiness',
          writeJsonArtifact(dir, 'production-readiness.json', createProductionReadiness()),
          '--ftsSimulation',
          writeJsonArtifact(dir, 'fts-simulation.json', createFtsSimulation()),
          '--scanProgressSimulation',
          writeJsonArtifact(dir, 'scan-progress-simulation.json', createScanProgressSimulation()),
          '--scanProgressPlan',
          writeJsonArtifact(dir, 'scan-progress-plan.json', createScanProgressPlan()),
          '--settingsVerification',
          writeJsonArtifact(dir, 'settings-verification.json', createSettingsVerification()),
          '--settingsProbe',
          writeJsonArtifact(
            dir,
            'settings-probe.json',
            createSettingsProbe({
              artifactPaths: {
                verification: 'other-settings-verification.json',
                settingsScreenshot: 'settings.png',
                detailScreenshot: 'detail.png',
                settingsDom: 'settings-dom.json',
                detailDom: 'detail-dom.json'
              }
            })
          )
        ])
      } catch (error) {
        stdout = String((error as { stdout?: unknown }).stdout ?? '')
      }

      const result = JSON.parse(stdout) as { gate: { passed: boolean; failures: string[] } }
      expect(result.gate.passed).toBe(false)
      expect(result.gate.failures).toContain(
        'Settings diagnostics verification artifact path must match the probe envelope'
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects CLI Settings verification JSON that does not match the probe envelope', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'search-index-migration-evidence-'))
    try {
      writeFileSync(path.join(dir, 'settings.png'), pngBytes)
      writeFileSync(path.join(dir, 'detail.png'), pngBytes)
      writeJsonArtifact(dir, 'settings-dom.json', {
        hasSourceDiagnosticsGroup: true
      })
      writeJsonArtifact(dir, 'detail-dom.json', {
        dialog: {
          visible: true,
          hasRecentTasks: true
        }
      })

      let stdout = ''
      try {
        stdout = runCli([
          '--strict',
          '--compact',
          '--preflight',
          writeJsonArtifact(dir, 'preflight.json', createPreflight()),
          '--productionReadiness',
          writeJsonArtifact(dir, 'production-readiness.json', createProductionReadiness()),
          '--ftsSimulation',
          writeJsonArtifact(dir, 'fts-simulation.json', createFtsSimulation()),
          '--scanProgressSimulation',
          writeJsonArtifact(dir, 'scan-progress-simulation.json', createScanProgressSimulation()),
          '--scanProgressPlan',
          writeJsonArtifact(dir, 'scan-progress-plan.json', createScanProgressPlan()),
          '--settingsVerification',
          writeJsonArtifact(dir, 'settings-verification.json', createSettingsVerification()),
          '--settingsProbe',
          writeJsonArtifact(
            dir,
            'settings-probe.json',
            createSettingsProbe({
              verification: createSettingsVerification({
                gate: {
                  passed: true,
                  failures: ['probe envelope mismatch']
                }
              })
            })
          )
        ])
      } catch (error) {
        stdout = String((error as { stdout?: unknown }).stdout ?? '')
      }

      const result = JSON.parse(stdout) as { gate: { passed: boolean; failures: string[] } }
      expect(result.gate.passed).toBe(false)
      expect(result.gate.failures).toContain(
        'Settings diagnostics verification JSON must match the probe envelope'
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects missing visible screenshot files when a probe envelope is provided', () => {
    const result = verifySearchIndexMigrationEvidence(
      {
        preflight: createPreflight(),
        productionReadiness: createProductionReadiness(),
        ftsSimulation: createFtsSimulation(),
        scanProgressSimulation: createScanProgressSimulation(),
        scanProgressPlan: createScanProgressPlan(),
        settingsVerification: createSettingsVerification(),
        settingsProbe: createSettingsProbe(),
        settingsVisibleArtifacts: createSettingsVisibleArtifacts({
          settingsScreenshotExists: false,
          settingsScreenshotNonEmpty: false,
          settingsScreenshotPng: false,
          detailScreenshotExists: false,
          detailScreenshotNonEmpty: false,
          detailScreenshotPng: false
        })
      },
      strictRequirements
    )

    expect(result.gate.passed).toBe(false)
    expect(result.gate.failures).toContain('Settings screenshot artifact file must exist')
    expect(result.gate.failures).toContain('Source detail screenshot artifact file must exist')
  })

  it('rejects placeholder screenshots and weak DOM artifacts', () => {
    const result = verifySearchIndexMigrationEvidence(
      {
        preflight: createPreflight(),
        productionReadiness: createProductionReadiness(),
        ftsSimulation: createFtsSimulation(),
        scanProgressSimulation: createScanProgressSimulation(),
        scanProgressPlan: createScanProgressPlan(),
        settingsVerification: createSettingsVerification(),
        settingsProbe: createSettingsProbe(),
        settingsVisibleArtifacts: createSettingsVisibleArtifacts({
          settingsScreenshotPng: false,
          detailScreenshotPng: false,
          settingsDomHasSourceDiagnosticsGroup: false,
          detailDomDialogVisible: false,
          detailDomHasRecentTasks: false
        })
      },
      strictRequirements
    )

    expect(result.gate.passed).toBe(false)
    expect(result.gate.failures).toContain('Settings screenshot artifact file must be a PNG image')
    expect(result.gate.failures).toContain(
      'Source detail screenshot artifact file must be a PNG image'
    )
    expect(result.gate.failures).toContain(
      'Settings DOM artifact must include the source diagnostics group'
    )
    expect(result.gate.failures).toContain('Source detail DOM artifact must show the detail dialog')
    expect(result.gate.failures).toContain('Source detail DOM artifact must include recent tasks')
  })

  it('rejects Settings probe envelopes without DOM artifact paths', () => {
    const result = verifySearchIndexMigrationEvidence(
      {
        preflight: createPreflight(),
        productionReadiness: createProductionReadiness(),
        ftsSimulation: createFtsSimulation(),
        scanProgressSimulation: createScanProgressSimulation(),
        scanProgressPlan: createScanProgressPlan(),
        settingsVerification: createSettingsVerification(),
        settingsProbe: createSettingsProbe({
          artifactPaths: {
            settingsScreenshot: 'settings.png',
            detailScreenshot: 'detail.png'
          }
        }),
        settingsVisibleArtifacts: createSettingsVisibleArtifacts()
      },
      strictRequirements
    )

    expect(result.gate.passed).toBe(false)
    expect(result.gate.failures).toContain(
      'Settings probe must include a Settings DOM artifact path'
    )
    expect(result.gate.failures).toContain(
      'Settings probe must include a source detail DOM artifact path'
    )
  })

  it('rejects controlled Settings probe markers in strict mode', () => {
    const result = verifySearchIndexMigrationEvidence(
      {
        preflight: createPreflight(),
        productionReadiness: createProductionReadiness(),
        ftsSimulation: createFtsSimulation(),
        scanProgressSimulation: createScanProgressSimulation(),
        scanProgressPlan: createScanProgressPlan(),
        settingsVerification: createSettingsVerification(),
        settingsProbe: createSettingsProbe({
          seededRecentTaskEvidence: true,
          maintenanceAction: 'scan',
          fixtureRoot: '/tmp/r3-fixture'
        }),
        settingsVisibleArtifacts: createSettingsVisibleArtifacts()
      },
      strictRequirements
    )

    expect(result.gate.passed).toBe(false)
    expect(result.gate.failures).toContain(
      'Settings probe must not use seeded recent task evidence'
    )
    expect(result.gate.failures).toContain('Settings probe must not use maintenanceAction evidence')
    expect(result.gate.failures).toContain('Settings probe must not use fixtureRoot evidence')
  })

  it('rejects Settings probe envelopes for a different source in strict mode', () => {
    const result = verifySearchIndexMigrationEvidence(
      {
        preflight: createPreflight(),
        productionReadiness: createProductionReadiness(),
        ftsSimulation: createFtsSimulation(),
        scanProgressSimulation: createScanProgressSimulation(),
        scanProgressPlan: createScanProgressPlan(),
        settingsVerification: createSettingsVerification(),
        settingsProbe: createSettingsProbe({
          sourceId: 'browser-bookmarks'
        }),
        settingsVisibleArtifacts: createSettingsVisibleArtifacts()
      },
      strictRequirements
    )

    expect(result.gate.passed).toBe(false)
    expect(result.gate.failures).toContain('Settings probe sourceId must be file-provider')
  })

  it('rejects weak Settings verification audit field requirements', () => {
    const result = verifySearchIndexMigrationEvidence(
      {
        preflight: createPreflight(),
        productionReadiness: createProductionReadiness(),
        ftsSimulation: createFtsSimulation(),
        scanProgressSimulation: createScanProgressSimulation(),
        scanProgressPlan: createScanProgressPlan(),
        settingsVerification: createSettingsVerification({
          options: {
            sourceId: 'other-source',
            minRecentTasks: 0,
            requiredAuditFields: ['duration', 'trigger'],
            requireReadOnlyEnvelope: true,
            requireNaturalRecentTaskEvidence: true
          }
        }),
        settingsProbe: createSettingsProbe(),
        settingsVisibleArtifacts: createSettingsVisibleArtifacts()
      },
      strictRequirements
    )

    expect(result.gate.passed).toBe(false)
    expect(result.gate.failures).toContain(
      'Settings diagnostics verification sourceId must be file-provider'
    )
    expect(result.gate.failures).toContain(
      'Settings diagnostics verification minRecentTasks must be at least 1'
    )
    expect(result.gate.failures).toContain('Settings diagnostics verification must require reason')
    expect(result.gate.failures).toContain('Settings diagnostics verification must require attempt')
    expect(result.gate.failures).toContain(
      'Settings diagnostics verification must require errorCode'
    )
  })
})
