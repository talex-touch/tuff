import { describe, expect, it } from 'vitest'
import type { WindowsAcceptanceManifest } from './windows-acceptance-manifest-verifier'
import {
  WINDOWS_REQUIRED_CASE_IDS,
  evaluateWindowsAcceptanceManifest,
  validateWindowsAcceptanceCaseEvidence,
  validateWindowsAcceptancePerformanceEvidence,
  verifyWindowsAcceptanceManifest
} from './windows-acceptance-manifest-verifier'
import type { AppIndexDiagnosticEvidencePayload } from './app-index-diagnostic-verifier'
import type { WindowsCapabilityEvidence } from './windows-capability-evidence'

function buildManifest(
  overrides: Partial<WindowsAcceptanceManifest> = {}
): WindowsAcceptanceManifest {
  return {
    schema: 'windows-acceptance-manifest/v1',
    generatedAt: '2026-05-10T10:00:00.000Z',
    platform: 'win32',
    verification: {
      recommendedCommand:
        'pnpm -C "apps/core-app" run windows:acceptance:verify -- --input "evidence/windows-acceptance.json" --strict --requireEvidencePath --requireExistingEvidenceFiles --requireEvidenceGatePassed --requireCaseEvidenceSchemas --requireVerifierCommand --requireVerifierCommandGateFlags --requireRecommendedCommandGateFlags --requireSearchTrace --requireClipboardStress --requireCommonAppLaunchDetails --requireCommonAppTargets WeChat,Codex,"Apple Music"'
    },
    cases: WINDOWS_REQUIRED_CASE_IDS.map((caseId) => ({
      caseId,
      status: 'passed',
      requiredForRelease: true,
      evidence: [
        {
          path: `evidence/${caseId}.json`,
          verifierCommand: `pnpm -C "apps/core-app" run verify -- --case ${caseId}`
        }
      ]
    })),
    performance: {
      searchTraceStatsPath: 'evidence/search-trace-stats.json',
      searchTraceVerifierCommand:
        'pnpm -C "apps/core-app" run search:trace:verify -- --input evidence/search-trace-stats.json --minSamples 200 --strict',
      clipboardStressSummaryPath: 'evidence/clipboard-stress-summary.json',
      clipboardStressVerifierCommand:
        'pnpm -C "apps/core-app" run clipboard:stress:verify -- --input evidence/clipboard-stress-summary.json'
    },
    manualChecks: {
      commonAppLaunch: {
        targets: ['WeChat', 'Codex', 'Apple Music'],
        passedTargets: ['WeChat', 'Codex', 'Apple Music'],
        checks: ['WeChat', 'Codex', 'Apple Music'].map((target) => ({
          target,
          searchHit: true,
          displayNameCorrect: true,
          iconCorrect: true,
          launchSucceeded: true,
          coreBoxHiddenAfterLaunch: true
        }))
      }
    },
    ...overrides
  }
}

describe('windows-acceptance-manifest-verifier', () => {
  it('passes a complete Windows acceptance manifest', () => {
    const gate = evaluateWindowsAcceptanceManifest(buildManifest(), {
      requireEvidencePath: true,
      requireVerifierCommand: true,
      requireSearchTrace: true,
      requireClipboardStress: true,
      requireCommonAppLaunchDetails: true,
      requireCommonAppTargets: ['WeChat', 'Codex', 'Apple Music']
    })

    expect(gate).toEqual({
      passed: true,
      failures: [],
      warnings: []
    })
  })

  it('fails when required cases or evidence fields are missing', () => {
    const manifest = buildManifest({
      cases: [
        {
          caseId: 'windows-everything-file-search',
          status: 'failed',
          requiredForRelease: true,
          evidence: []
        },
        {
          caseId: 'windows-app-scan-uwp',
          status: 'passed',
          requiredForRelease: false
        }
      ],
      performance: {},
      manualChecks: {
        commonAppLaunch: {
          targets: ['WeChat', 'Codex', 'Apple Music'],
          passedTargets: ['WeChat']
        }
      }
    })

    expect(
      evaluateWindowsAcceptanceManifest(manifest, {
        requireEvidencePath: true,
        requireVerifierCommand: true,
        requireSearchTrace: true,
        requireClipboardStress: true,
        requireCommonAppTargets: ['WeChat', 'Codex', 'Apple Music']
      }).failures
    ).toEqual([
      'required Windows case did not pass: windows-everything-file-search (failed)',
      'required Windows case evidence path is missing: windows-everything-file-search',
      'required Windows case verifier command is missing: windows-everything-file-search',
      'required Windows case is not marked requiredForRelease: windows-app-scan-uwp',
      'required Windows case evidence path is missing: windows-app-scan-uwp',
      'required Windows case verifier command is missing: windows-app-scan-uwp',
      'required Windows case is missing: windows-third-party-app-launch',
      'required Windows case is missing: windows-shortcut-launch-args',
      'required Windows case is missing: windows-tray-update-plugin-install-exit',
      'search trace stats path is missing',
      'search trace verifier command is missing',
      'clipboard stress summary path is missing',
      'clipboard stress verifier command is missing',
      'common app launch targets missing: Codex, Apple Music'
    ])
  })

  it('warns for non-Windows manifests unless strict is requested', () => {
    const gate = evaluateWindowsAcceptanceManifest(buildManifest({ platform: 'darwin' }))

    expect(gate).toEqual({
      passed: true,
      failures: [],
      warnings: ['Windows acceptance manifest platform is not win32: darwin']
    })
  })

  it('returns a manifest with a recomputed gate', () => {
    const verified = verifyWindowsAcceptanceManifest(buildManifest(), {
      requireEvidencePath: true
    })

    expect(verified.gate.passed).toBe(true)
    expect(verified.schema).toBe('windows-acceptance-manifest/v1')
  })

  it('requires verifier commands to carry release gate flags when requested', () => {
    const manifest = buildManifest({
      cases: WINDOWS_REQUIRED_CASE_IDS.map((caseId) => {
        if (caseId !== 'windows-app-scan-uwp') {
          return {
            caseId,
            status: 'passed',
            requiredForRelease: true,
            evidence: [
              {
                path: `evidence/${caseId}.json`,
                verifierCommand: `pnpm -C "apps/core-app" run verify -- --case ${caseId}`
              }
            ]
          }
        }

        return {
          caseId,
          status: 'passed',
          requiredForRelease: true,
          evidence: [
            {
              path: 'evidence/windows-app-scan-uwp-capability.json',
              verifierCommand:
                'pnpm -C "apps/core-app" run windows:capability:verify -- --input evidence/windows-app-scan-uwp-capability.json --requireTargets --requireUwp --requireRegistryFallback --requireShortcutMetadata --strict'
            },
            {
              path: 'evidence/windows-app-scan-uwp-app-index.json',
              verifierCommand:
                'pnpm -C "apps/core-app" run app-index:diagnostic:verify -- --input evidence/windows-app-scan-uwp-app-index.json --requireSuccess --requireQueryHit --requireLaunchKind uwp --requireLaunchTarget --requireBundleOrIdentity --requireCleanDisplayName --requireReindex --requireCaseIds windows-app-scan-uwp'
            }
          ]
        }
      })
    })

    const gate = evaluateWindowsAcceptanceManifest(manifest, {
      requireVerifierCommand: true,
      requireVerifierCommandGateFlags: true
    })

    expect(gate.failures).toContain(
      'required Windows case Windows capability verifier command is missing release gate flags: windows-everything-file-search'
    )
    expect(gate.failures).toContain(
      'required Windows case Everything diagnostic verifier command is missing release gate flags: windows-everything-file-search'
    )
    expect(gate.failures).not.toContain(
      'required Windows case Windows capability verifier command is missing release gate flags: windows-app-scan-uwp'
    )
    expect(gate.failures).not.toContain(
      'required Windows case App Index diagnostic verifier command is missing release gate flags: windows-app-scan-uwp'
    )
  })

  it('requires performance verifier commands to carry release budgets when requested', () => {
    const gate = evaluateWindowsAcceptanceManifest(buildManifest(), {
      requireSearchTrace: true,
      requireClipboardStress: true,
      requireVerifierCommandGateFlags: true
    })

    expect(gate.failures).toContain('search trace verifier command is missing release gate flags')
    expect(gate.failures).toContain(
      'clipboard stress verifier command is missing release gate flags'
    )
  })

  it('requires clipboard stress verifier commands to enforce schema strictness', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        performance: {
          searchTraceStatsPath: 'evidence/search-trace-stats.json',
          searchTraceVerifierCommand:
            'pnpm -C "apps/core-app" run search:trace:verify -- --input evidence/search-trace-stats.json --minSamples 200 --maxFirstResultP95Ms 800 --maxSessionEndP95Ms 1200 --maxSlowRatio 0.1 --strict',
          clipboardStressSummaryPath: 'evidence/clipboard-stress-summary.json',
          clipboardStressVerifierCommand:
            'pnpm -C "apps/core-app" run clipboard:stress:verify -- --input evidence/clipboard-stress-summary.json --minDurationMs 120000 --requireIntervals 500,250 --maxP95SchedulerDelayMs 100 --maxSchedulerDelayMs 300 --maxRealtimeQueuedPeak 2 --maxDroppedCount 0'
        }
      }),
      {
        requireSearchTrace: true,
        requireClipboardStress: true,
        requireVerifierCommandGateFlags: true
      }
    )

    expect(gate.failures).toContain(
      'clipboard stress verifier command is missing release gate flags'
    )
  })

  it('requires verifier commands to be replayable through explicit input files', () => {
    const manifest = buildManifest({
      cases: [
        ...WINDOWS_REQUIRED_CASE_IDS.map((caseId) => ({
          caseId,
          status: 'passed' as const,
          requiredForRelease: true,
          evidence: [
            {
              path: `evidence/${caseId}.json`,
              verifierCommand:
                caseId === 'windows-everything-file-search'
                  ? 'pnpm -C "apps/core-app" run windows:capability:verify -- --requireEverything --requireEverythingTargets --strict'
                  : 'pnpm -C "apps/core-app" run verify -- --case placeholder'
            }
          ]
        }))
      ]
    })

    const gate = evaluateWindowsAcceptanceManifest(manifest, {
      requireVerifierCommandGateFlags: true
    })

    expect(gate.failures).toContain(
      'required Windows case Windows capability verifier command is missing release gate flags: windows-everything-file-search'
    )
  })

  it('requires the recommended acceptance command to carry release gate flags when requested', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        verification: {
          recommendedCommand:
            'pnpm -C "apps/core-app" run windows:acceptance:verify -- --input evidence/windows-acceptance.json --strict'
        }
      }),
      {
        requireRecommendedCommandGateFlags: true
      }
    )

    expect(gate.failures).toEqual([
      'Windows acceptance recommended command is missing release gate flags'
    ])
  })

  it('accepts a recommended acceptance command with release gate flags', () => {
    const gate = evaluateWindowsAcceptanceManifest(buildManifest(), {
      requireRecommendedCommandGateFlags: true
    })

    expect(gate.failures).toEqual([])
  })

  it('requires common app launch details when requested', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: {
            targets: ['WeChat', 'Codex', 'Apple Music'],
            passedTargets: ['WeChat', 'Codex', 'Apple Music'],
            checks: [
              {
                target: 'WeChat',
                searchHit: true,
                displayNameCorrect: false,
                iconCorrect: true,
                launchSucceeded: true,
                coreBoxHiddenAfterLaunch: false
              }
            ]
          }
        }
      }),
      {
        requireCommonAppLaunchDetails: true,
        requireCommonAppTargets: ['WeChat', 'Codex', 'Apple Music']
      }
    )

    expect(gate.failures).toEqual([
      'common app launch display name not verified: WeChat',
      'common app launch did not hide CoreBox: WeChat',
      'common app launch detail is missing: Codex',
      'common app launch detail is missing: Apple Music'
    ])
  })

  it('recomputes case-specific app-index gates instead of trusting embedded gate status', () => {
    const weakEvidence: AppIndexDiagnosticEvidencePayload & { gate: { passed: true } } = {
      schemaVersion: 1,
      kind: 'app-index-diagnostic-evidence',
      createdAt: '2026-05-10T10:00:00.000Z',
      input: {
        target: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
        query: 'calc'
      },
      diagnosis: {
        success: true,
        status: 'found',
        target: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
        matchedStages: ['phrase']
      },
      app: {
        id: 42,
        path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
        name: 'Calculator',
        displayName: 'Calculator',
        rawDisplayName: 'Calculator',
        displayNameStatus: 'clean',
        bundleId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe',
        appIdentity: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
        launchKind: 'uwp',
        launchTarget: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
        alternateNames: ['Calculator'],
        entryEnabled: true
      },
      reindex: {
        success: true,
        status: 'updated',
        path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
      },
      manualRegression: {
        reusableCaseIds: ['windows-app-scan-uwp'],
        suggestedEvidenceFields: {
          target: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
          query: 'calc',
          launchKind: 'uwp',
          launchTarget: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
          bundleOrIdentity: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe',
          matchedStages: ['phrase'],
          reindexStatus: 'updated'
        }
      },
      gate: {
        passed: true
      }
    }

    const result = validateWindowsAcceptanceCaseEvidence(
      'windows-shortcut-launch-args',
      weakEvidence
    )

    expect(result).toMatchObject({
      schemaKey: 'app-index-diagnostic',
      schemaMismatch: false,
      embeddedGatePassed: true,
      recomputedGatePassed: false
    })
    expect(result.gateFailures).toEqual([
      'diagnostic launchKind mismatch: expected shortcut, got uwp',
      'diagnostic launchArgs are missing',
      'diagnostic workingDirectory is missing',
      'diagnostic reusable case ids missing: windows-shortcut-launch-args'
    ])
  })

  it('recomputes Windows capability gates per required case', () => {
    const evidence: WindowsCapabilityEvidence = {
      schema: 'windows-capability-evidence/v1',
      generatedAt: '2026-05-10T10:00:00.000Z',
      platform: 'win32',
      arch: 'x64',
      status: 'passed',
      targets: ['WeChat'],
      checks: {
        powershell: {
          command: 'powershell',
          available: true,
          exitCode: 0,
          durationMs: 10
        },
        everything: {
          cliPaths: ['C:\\Program Files\\Everything\\es.exe'],
          where: {
            command: 'where es.exe',
            available: true,
            exitCode: 0,
            durationMs: 10
          },
          targets: [{ target: 'WeChat', found: true, matchCount: 1, samples: ['WeChat'] }]
        },
        startApps: {
          count: 1,
          uwpCount: 1,
          desktopPathCount: 0,
          targets: [{ target: 'WeChat', found: true, matchCount: 1, samples: ['WeChat'] }]
        },
        registry: {
          count: 1,
          executableCandidateCount: 1,
          skippedSystemComponentCount: 0,
          targets: [{ target: 'WeChat', found: true, matchCount: 1, samples: ['WeChat'] }]
        },
        startMenu: {
          directoryCount: 1,
          entryCount: 1,
          lnkCount: 1,
          apprefMsCount: 0,
          exeCount: 0,
          shortcutMetadataCount: 1,
          shortcutWithArgumentsCount: 0,
          shortcutWithWorkingDirectoryCount: 0,
          uwpShortcutCount: 0,
          targets: [{ target: 'WeChat', found: true, matchCount: 1, samples: ['WeChat'] }]
        }
      },
      gate: {
        passed: true,
        failures: [],
        warnings: []
      }
    }

    const result = validateWindowsAcceptanceCaseEvidence('windows-shortcut-launch-args', evidence)

    expect(result.schemaKey).toBe('windows-capability')
    expect(result.recomputedGatePassed).toBe(false)
    expect(result.gateFailures).toEqual([
      'Start Menu shortcut arguments were not resolved',
      'Start Menu shortcut workingDirectory was not resolved'
    ])
  })

  it('recomputes performance gates with release thresholds', () => {
    const result = validateWindowsAcceptancePerformanceEvidence('search-trace-stats', {
      schema: 'search-trace-stats/v1',
      minSamples: 1,
      slowThresholdMs: 800,
      enoughSamples: true,
      sessionCount: 1,
      pairedSessionCount: 1,
      missingFirstResultSessionCount: 0,
      missingSessionEndSessionCount: 0,
      firstResult: {
        event: 'first.result',
        sampleCount: 1,
        avgMs: 20,
        p50Ms: 20,
        p95Ms: 20,
        p99Ms: 20,
        maxMs: 20,
        slowCount: 0,
        slowRatio: 0
      },
      sessionEnd: {
        event: 'session.end',
        sampleCount: 1,
        avgMs: 30,
        p50Ms: 30,
        p95Ms: 30,
        p99Ms: 30,
        maxMs: 30,
        slowCount: 0,
        slowRatio: 0
      },
      providerSlow: [],
      gate: {
        passed: true,
        failures: []
      }
    })

    expect(result.schemaKey).toBe('search-trace-stats')
    expect(result.embeddedGatePassed).toBe(true)
    expect(result.recomputedGatePassed).toBe(false)
    expect(result.gateFailures).toEqual(['paired sessions 1 < minSamples 200'])
  })

  it('rejects search trace performance evidence that only satisfies sample count', () => {
    const result = validateWindowsAcceptancePerformanceEvidence('search-trace-stats', {
      schema: 'search-trace-stats/v1',
      minSamples: 200,
      slowThresholdMs: 800,
      enoughSamples: true,
      sessionCount: 200,
      pairedSessionCount: 200,
      missingFirstResultSessionCount: 0,
      missingSessionEndSessionCount: 0,
      firstResult: {
        event: 'first.result',
        sampleCount: 200,
        avgMs: 900,
        p50Ms: 700,
        p95Ms: 950,
        p99Ms: 1_200,
        maxMs: 1_500,
        slowCount: 30,
        slowRatio: 0.15
      },
      sessionEnd: {
        event: 'session.end',
        sampleCount: 200,
        avgMs: 1_200,
        p50Ms: 900,
        p95Ms: 1_400,
        p99Ms: 1_800,
        maxMs: 2_000,
        slowCount: 40,
        slowRatio: 0.2
      },
      providerSlow: [],
      gate: {
        passed: true,
        failures: []
      }
    })

    expect(result.recomputedGatePassed).toBe(false)
    expect(result.gateFailures).toEqual([
      'first.result p95 950 > 800',
      'session.end p95 1400 > 1200',
      'first.result slowRatio 0.15 > 0.1',
      'session.end slowRatio 0.2 > 0.1'
    ])
  })

  it('rejects clipboard stress evidence that only satisfies duration and interval coverage', () => {
    const result = validateWindowsAcceptancePerformanceEvidence('clipboard-stress-summary', {
      schema: 'clipboard-stress-summary/v1',
      generatedAt: '2026-05-10T10:00:00.000Z',
      results: [
        {
          intervalMs: 500,
          durationMs: 120_000,
          queueDepthPeak: {
            realtime: { queued: 3, inFlight: 1 }
          },
          clipboard: {
            count: 240,
            schedulerDelaySampleCount: 240,
            avgSchedulerDelayMs: 80,
            p95SchedulerDelayMs: 130,
            lastSchedulerDelayMs: 20,
            maxSchedulerDelayMs: 350,
            lastDurationMs: 20,
            maxDurationMs: 80,
            droppedCount: 1,
            coalescedCount: 0,
            timeoutCount: 0,
            errorCount: 0
          }
        },
        {
          intervalMs: 250,
          durationMs: 120_000,
          queueDepthPeak: {
            realtime: { queued: 1, inFlight: 1 }
          },
          clipboard: {
            count: 480,
            schedulerDelaySampleCount: 480,
            avgSchedulerDelayMs: 20,
            p95SchedulerDelayMs: 60,
            lastSchedulerDelayMs: 10,
            maxSchedulerDelayMs: 100,
            lastDurationMs: 10,
            maxDurationMs: 40,
            droppedCount: 0,
            coalescedCount: 0,
            timeoutCount: 0,
            errorCount: 0
          }
        }
      ],
      gate: {
        passed: true,
        failures: []
      }
    })

    expect(result.recomputedGatePassed).toBe(false)
    expect(result.gateFailures).toEqual([
      'interval 500ms p95 scheduler delay 130 > 100',
      'interval 500ms max scheduler delay 350 > 300',
      'interval 500ms realtime queue peak 3 > 2',
      'interval 500ms dropped count 1 > 0'
    ])
  })

  it('rejects clipboard stress evidence without the strict schema marker', () => {
    const result = validateWindowsAcceptancePerformanceEvidence('clipboard-stress-summary', {
      generatedAt: '2026-05-10T10:00:00.000Z',
      results: [
        {
          intervalMs: 500,
          durationMs: 120_000,
          queueDepthPeak: {
            realtime: { queued: 1, inFlight: 1 }
          },
          clipboard: {
            count: 240,
            schedulerDelaySampleCount: 240,
            avgSchedulerDelayMs: 20,
            p95SchedulerDelayMs: 60,
            lastSchedulerDelayMs: 10,
            maxSchedulerDelayMs: 100,
            lastDurationMs: 10,
            maxDurationMs: 40,
            droppedCount: 0,
            coalescedCount: 0,
            timeoutCount: 0,
            errorCount: 0
          }
        },
        {
          intervalMs: 250,
          durationMs: 120_000,
          queueDepthPeak: {
            realtime: { queued: 1, inFlight: 1 }
          },
          clipboard: {
            count: 480,
            schedulerDelaySampleCount: 480,
            avgSchedulerDelayMs: 20,
            p95SchedulerDelayMs: 60,
            lastSchedulerDelayMs: 10,
            maxSchedulerDelayMs: 100,
            lastDurationMs: 10,
            maxDurationMs: 40,
            droppedCount: 0,
            coalescedCount: 0,
            timeoutCount: 0,
            errorCount: 0
          }
        }
      ],
      gate: {
        passed: true,
        failures: []
      }
    })

    expect(result).toMatchObject({
      schemaKey: null,
      schemaMismatch: true,
      embeddedGatePassed: true,
      recomputedGatePassed: true,
      gateFailures: []
    })
  })
})
