import { describe, expect, it } from 'vitest'
import { AppPreviewChannel, UpdateProviderType } from '@talex-touch/utils'
import {
  validateWindowsAcceptanceCaseEvidence,
  validateWindowsAcceptancePerformanceEvidence
} from './windows-acceptance-manifest-verifier'
import type { AppIndexDiagnosticEvidencePayload } from './app-index-diagnostic-verifier'
import type { UpdateDiagnosticEvidencePayload } from './update-diagnostic-verifier'
import type { WindowsCapabilityEvidence } from './windows-capability-evidence'

describe('windows-acceptance-evidence-verifier', () => {
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
      'windows-copied-app-path-index',
      weakEvidence
    )

    expect(result).toMatchObject({
      schemaKey: 'app-index-diagnostic',
      schemaMismatch: false,
      embeddedGatePassed: true,
      recomputedGatePassed: false
    })
    expect(result.gateFailures).toEqual([
      'diagnostic query stage evidence is missing',
      'diagnostic launchKind mismatch: expected path, shortcut, got uwp',
      'diagnostic icon is missing',
      'diagnostic managed entry source mismatch: expected manual, got missing',
      'diagnostic reusable case ids missing: windows-copied-app-path-index'
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

  it('accepts automatic Windows update handoff evidence during case gate recompute', () => {
    const evidence: UpdateDiagnosticEvidencePayload & { gate: { passed: true } } = {
      schemaVersion: 1,
      kind: 'update-diagnostic-evidence',
      createdAt: '2026-05-10T10:00:00.000Z',
      settings: {
        enabled: true,
        sourceType: UpdateProviderType.GITHUB,
        sourceName: 'GitHub Releases',
        sourceEnabled: true,
        channel: AppPreviewChannel.RELEASE,
        frequency: 'everyday',
        autoDownload: true,
        autoInstallDownloadedUpdates: true,
        rendererOverrideEnabled: false
      },
      status: {
        lastCheck: 1_700_000_000_000,
        downloadReady: true,
        downloadReadyVersion: 'v2.4.10',
        downloadTaskId: 'task-update-1'
      },
      installedVersion: {
        current: '2.4.10',
        expected: 'v2.4.10',
        matchesExpected: true
      },
      runtimeTarget: {
        platform: 'win32',
        arch: 'x64',
        isMacAutoInstallPlatform: false
      },
      cachedRelease: {
        tag: 'v2.4.10',
        name: 'Tuff 2.4.10',
        channel: AppPreviewChannel.RELEASE,
        status: 'pending',
        fetchedAt: 1_700_000_000_000,
        source: 'github',
        totalAssetCount: 1,
        matchingAssetCount: 1,
        matchingAssets: [
          {
            name: 'Tuff-2.4.10-setup.exe',
            platform: 'win32',
            arch: 'x64',
            size: 128_000_000,
            hasChecksum: true
          }
        ]
      },
      verdict: {
        downloadReady: true,
        readyToInstall: true,
        installMode: 'windows-auto-installer-handoff',
        requiresUserConfirmation: false,
        autoInstallDownloadedUpdates: true,
        unattendedAutoInstallEnabled: true
      },
      manualRegression: {
        reusableCaseIds: ['windows-tray-update-plugin-install-exit'],
        suggestedEvidenceFields: {
          channel: AppPreviewChannel.RELEASE,
          autoDownload: true,
          autoInstallDownloadedUpdates: true,
          downloadReadyVersion: 'v2.4.10',
          downloadTaskId: 'task-update-1',
          platform: 'win32',
          arch: 'x64',
          installMode: 'windows-auto-installer-handoff',
          cachedReleaseTag: 'v2.4.10',
          matchingAssetNames: ['Tuff-2.4.10-setup.exe']
        }
      },
      gate: {
        passed: true
      }
    }

    const result = validateWindowsAcceptanceCaseEvidence(
      'windows-tray-update-plugin-install-exit',
      evidence
    )

    expect(result).toMatchObject({
      schemaKey: 'update-diagnostic',
      schemaMismatch: false,
      embeddedGatePassed: true,
      recomputedGatePassed: true,
      gateFailures: []
    })
  })

  it('requires post-install version evidence for automatic Windows update handoff case recompute', () => {
    const evidence: UpdateDiagnosticEvidencePayload & { gate: { passed: true } } = {
      schemaVersion: 1,
      kind: 'update-diagnostic-evidence',
      createdAt: '2026-05-10T10:00:00.000Z',
      settings: {
        enabled: true,
        sourceType: UpdateProviderType.GITHUB,
        sourceName: 'GitHub Releases',
        sourceEnabled: true,
        channel: AppPreviewChannel.RELEASE,
        frequency: 'everyday',
        autoDownload: true,
        autoInstallDownloadedUpdates: true,
        rendererOverrideEnabled: false
      },
      status: {
        lastCheck: 1_700_000_000_000,
        downloadReady: true,
        downloadReadyVersion: 'v2.4.10',
        downloadTaskId: 'task-update-1'
      },
      runtimeTarget: {
        platform: 'win32',
        arch: 'x64',
        isMacAutoInstallPlatform: false
      },
      cachedRelease: {
        tag: 'v2.4.10',
        name: 'Tuff 2.4.10',
        channel: AppPreviewChannel.RELEASE,
        status: 'pending',
        fetchedAt: 1_700_000_000_000,
        source: 'github',
        totalAssetCount: 1,
        matchingAssetCount: 1,
        matchingAssets: [
          {
            name: 'Tuff-2.4.10-setup.exe',
            platform: 'win32',
            arch: 'x64',
            size: 128_000_000,
            hasChecksum: true
          }
        ]
      },
      verdict: {
        downloadReady: true,
        readyToInstall: true,
        installMode: 'windows-auto-installer-handoff',
        requiresUserConfirmation: false,
        autoInstallDownloadedUpdates: true,
        unattendedAutoInstallEnabled: true
      },
      manualRegression: {
        reusableCaseIds: ['windows-tray-update-plugin-install-exit'],
        suggestedEvidenceFields: {
          channel: AppPreviewChannel.RELEASE,
          autoDownload: true,
          autoInstallDownloadedUpdates: true,
          downloadReadyVersion: 'v2.4.10',
          downloadTaskId: 'task-update-1',
          platform: 'win32',
          arch: 'x64',
          installMode: 'windows-auto-installer-handoff',
          cachedReleaseTag: 'v2.4.10',
          matchingAssetNames: ['Tuff-2.4.10-setup.exe']
        }
      },
      gate: {
        passed: true
      }
    }

    const result = validateWindowsAcceptanceCaseEvidence(
      'windows-tray-update-plugin-install-exit',
      evidence
    )

    expect(result).toMatchObject({
      schemaKey: 'update-diagnostic',
      schemaMismatch: false,
      embeddedGatePassed: true,
      recomputedGatePassed: false
    })
    expect(result.gateFailures).toEqual(['update installed version match evidence is missing'])
  })

  it('requires automatic download task id for automatic Windows update handoff case recompute', () => {
    const evidence: UpdateDiagnosticEvidencePayload & { gate: { passed: true } } = {
      schemaVersion: 1,
      kind: 'update-diagnostic-evidence',
      createdAt: '2026-05-10T10:00:00.000Z',
      settings: {
        enabled: true,
        sourceType: UpdateProviderType.GITHUB,
        sourceName: 'GitHub Releases',
        sourceEnabled: true,
        channel: AppPreviewChannel.RELEASE,
        frequency: 'everyday',
        autoDownload: true,
        autoInstallDownloadedUpdates: true,
        rendererOverrideEnabled: false
      },
      status: {
        lastCheck: 1_700_000_000_000,
        downloadReady: true,
        downloadReadyVersion: 'v2.4.10',
        downloadTaskId: null
      },
      installedVersion: {
        current: '2.4.10',
        expected: 'v2.4.10',
        matchesExpected: true
      },
      runtimeTarget: {
        platform: 'win32',
        arch: 'x64',
        isMacAutoInstallPlatform: false
      },
      cachedRelease: {
        tag: 'v2.4.10',
        name: 'Tuff 2.4.10',
        channel: AppPreviewChannel.RELEASE,
        status: 'pending',
        fetchedAt: 1_700_000_000_000,
        source: 'github',
        totalAssetCount: 1,
        matchingAssetCount: 1,
        matchingAssets: [
          {
            name: 'Tuff-2.4.10-setup.exe',
            platform: 'win32',
            arch: 'x64',
            size: 128_000_000,
            hasChecksum: true
          }
        ]
      },
      verdict: {
        downloadReady: true,
        readyToInstall: true,
        installMode: 'windows-auto-installer-handoff',
        requiresUserConfirmation: false,
        autoInstallDownloadedUpdates: true,
        unattendedAutoInstallEnabled: true
      },
      manualRegression: {
        reusableCaseIds: ['windows-tray-update-plugin-install-exit'],
        suggestedEvidenceFields: {
          channel: AppPreviewChannel.RELEASE,
          autoDownload: true,
          autoInstallDownloadedUpdates: true,
          downloadReadyVersion: 'v2.4.10',
          downloadTaskId: null,
          platform: 'win32',
          arch: 'x64',
          installMode: 'windows-auto-installer-handoff',
          cachedReleaseTag: 'v2.4.10',
          matchingAssetNames: ['Tuff-2.4.10-setup.exe']
        }
      },
      gate: {
        passed: true
      }
    }

    const result = validateWindowsAcceptanceCaseEvidence(
      'windows-tray-update-plugin-install-exit',
      evidence
    )

    expect(result).toMatchObject({
      schemaKey: 'update-diagnostic',
      schemaMismatch: false,
      embeddedGatePassed: true,
      recomputedGatePassed: false
    })
    expect(result.gateFailures).toEqual([
      'update automatic installer handoff mode requires automatic download task id'
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

  it('rejects search trace performance evidence with inconsistent counters', () => {
    const result = validateWindowsAcceptancePerformanceEvidence('search-trace-stats', {
      schema: 'search-trace-stats/v1',
      minSamples: 200,
      slowThresholdMs: 800,
      enoughSamples: true,
      sessionCount: 1,
      pairedSessionCount: 200,
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

    expect(result.recomputedGatePassed).toBe(false)
    expect(result.gateFailures).toEqual([
      'search trace paired sessions exceed session count',
      'search trace paired sessions exceed first.result samples',
      'search trace paired sessions exceed session.end samples',
      'search trace session count 1 does not match paired/missing sessions 200'
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

  it('rejects clipboard stress evidence with inconsistent counters', () => {
    const result = validateWindowsAcceptancePerformanceEvidence('clipboard-stress-summary', {
      schema: 'clipboard-stress-summary/v1',
      generatedAt: '2026-05-10T10:00:00.000Z',
      results: [
        {
          intervalMs: 500,
          durationMs: 120_000,
          queueDepthPeak: {
            realtime: { queued: 1, inFlight: 1 }
          },
          clipboard: {
            count: 0,
            schedulerDelaySampleCount: 0,
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
            schedulerDelaySampleCount: 481,
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
      'interval 500ms clipboard count is zero',
      'interval 500ms scheduler delay sample count is zero',
      'interval 250ms scheduler delay samples exceed clipboard count'
    ])
  })
})
