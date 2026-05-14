import { describe, expect, it } from 'vitest'
import { buildManifest } from './windows-acceptance-manifest-test-utils'
import {
  WINDOWS_REQUIRED_CASE_IDS,
  evaluateWindowsAcceptanceManifest,
  verifyWindowsAcceptanceManifest
} from './windows-acceptance-manifest-verifier'
describe('windows-acceptance-manifest-verifier', () => {
  it('passes a complete Windows acceptance manifest', () => {
    const gate = evaluateWindowsAcceptanceManifest(buildManifest(), {
      requireEvidencePath: true,
      requireVerifierCommand: true,
      requireSearchTrace: true,
      requireClipboardStress: true,
      requireCommonAppLaunchDetails: true,
      requireCopiedAppPathManualChecks: true,
      requireUpdateInstallManualChecks: true,
      requireDivisionBoxDetachedWidgetManualChecks: true,
      requireTimeAwareRecommendationManualChecks: true,
      requireCommonAppTargets: ['ChatApp', 'Codex', 'Apple Music']
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
          targets: ['ChatApp', 'Codex', 'Apple Music'],
          passedTargets: ['ChatApp']
        }
      }
    })

    expect(
      evaluateWindowsAcceptanceManifest(manifest, {
        requireEvidencePath: true,
        requireVerifierCommand: true,
        requireSearchTrace: true,
        requireClipboardStress: true,
        requireCommonAppTargets: ['ChatApp', 'Codex', 'Apple Music']
      }).failures
    ).toEqual([
      'required Windows case did not pass: windows-everything-file-search (failed)',
      'required Windows case evidence path is missing: windows-everything-file-search',
      'required Windows case verifier command is missing: windows-everything-file-search',
      'required Windows case is not marked requiredForRelease: windows-app-scan-uwp',
      'required Windows case evidence path is missing: windows-app-scan-uwp',
      'required Windows case verifier command is missing: windows-app-scan-uwp',
      'required Windows case is missing: windows-copied-app-path-index',
      'required Windows case is missing: windows-third-party-app-launch',
      'required Windows case is missing: windows-shortcut-launch-args',
      'required Windows case is missing: windows-tray-update-plugin-install-exit',
      'search trace stats path is missing',
      'search trace stats command is missing',
      'search trace verifier command is missing',
      'clipboard stress summary path is missing',
      'clipboard stress command is missing',
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
                'pnpm -C "apps/core-app" run app-index:diagnostic:verify -- --input evidence/windows-app-scan-uwp-app-index.json --requireSuccess --requireQueryHit --requireLaunchKind uwp --requireLaunchTarget --requireBundleOrIdentity --requireCleanDisplayName --requireIcon --requireReindex --requireCaseIds windows-app-scan-uwp'
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

  it('accepts automatic Windows update verifier command gate flags', () => {
    const manifest = buildManifest({
      cases: WINDOWS_REQUIRED_CASE_IDS.map((caseId) => {
        if (caseId !== 'windows-tray-update-plugin-install-exit') {
          return {
            caseId,
            status: 'passed' as const,
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
          status: 'passed' as const,
          requiredForRelease: true,
          evidence: [
            {
              path: 'evidence/windows-tray-update-plugin-install-exit-capability.json',
              verifierCommand:
                'pnpm -C "apps/core-app" run windows:capability:verify -- --input evidence/windows-tray-update-plugin-install-exit-capability.json --requireInstallerHandoff --strict'
            },
            {
              path: 'evidence/windows-tray-update-plugin-install-exit-update.json',
              verifierCommand:
                'pnpm -C "apps/core-app" run update:diagnostic:verify -- --input evidence/windows-tray-update-plugin-install-exit-update.json --requireAutoDownload --requireDownloadReady --requireReadyToInstall --requirePlatform win32 --requireInstallMode windows-auto-installer-handoff --requireAutoInstallEnabled --requireUnattendedEnabled --requireInstalledVersionMatchesTarget --requireMatchingAsset --requireChecksums --requireCaseIds windows-tray-update-plugin-install-exit'
            }
          ]
        }
      })
    })

    const gate = evaluateWindowsAcceptanceManifest(manifest, {
      requireVerifierCommand: true,
      requireVerifierCommandGateFlags: true
    })

    expect(gate.failures).not.toContain(
      'required Windows case Update diagnostic verifier command is missing release gate flags: windows-tray-update-plugin-install-exit'
    )
  })

  it('accepts copied app path index verifier command gate flags', () => {
    const manifest = buildManifest({
      cases: WINDOWS_REQUIRED_CASE_IDS.map((caseId) => {
        if (caseId !== 'windows-copied-app-path-index') {
          return {
            caseId,
            status: 'passed' as const,
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
          status: 'passed' as const,
          requiredForRelease: true,
          evidence: [
            {
              path: 'evidence/windows-copied-app-path-index-capability.json',
              verifierCommand:
                'pnpm -C "apps/core-app" run windows:capability:verify -- --input evidence/windows-copied-app-path-index-capability.json --requireTargets --requireRegistryFallback --requireShortcutMetadata --strict'
            },
            {
              path: 'evidence/windows-copied-app-path-index-app-index.json',
              verifierCommand:
                'pnpm -C "apps/core-app" run app-index:diagnostic:verify -- --input evidence/windows-copied-app-path-index-app-index.json --requireSuccess --requireQueryHit --requireLaunchKind path,shortcut --requireLaunchTarget --requireCleanDisplayName --requireIcon --requireManagedEntry --requireReindex --requireCaseIds windows-copied-app-path-index'
            }
          ]
        }
      })
    })

    const gate = evaluateWindowsAcceptanceManifest(manifest, {
      requireVerifierCommand: true,
      requireVerifierCommandGateFlags: true
    })

    expect(gate.failures).not.toContain(
      'required Windows case Windows capability verifier command is missing release gate flags: windows-copied-app-path-index'
    )
    expect(gate.failures).not.toContain(
      'required Windows case App Index diagnostic verifier command is missing release gate flags: windows-copied-app-path-index'
    )
  })

  it('requires performance verifier commands to carry release budgets when requested', () => {
    const gate = evaluateWindowsAcceptanceManifest(buildManifest(), {
      requireSearchTrace: true,
      requireClipboardStress: true,
      requireVerifierCommandGateFlags: true
    })

    expect(gate.failures).toContain('search trace verifier command is missing release gate flags')
    expect(gate.failures).not.toContain('search trace stats command is missing release gate flags')
    expect(gate.failures).toContain(
      'clipboard stress verifier command is missing release gate flags'
    )
    expect(gate.failures).not.toContain('clipboard stress command is missing release gate flags')
  })

  it('requires performance sampling commands to carry release budgets when present', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        performance: {
          searchTraceStatsPath: 'evidence/search-trace-stats.json',
          searchTraceStatsCommand:
            'pnpm -C "apps/core-app" run search:trace:stats -- --input evidence/search.log --output evidence/search-trace-stats.json --strict',
          searchTraceVerifierCommand:
            'pnpm -C "apps/core-app" run search:trace:verify -- --input evidence/search-trace-stats.json --minSamples 200 --maxFirstResultP95Ms 800 --maxSessionEndP95Ms 1200 --maxSlowRatio 0.1 --strict',
          clipboardStressSummaryPath: 'evidence/clipboard-stress-summary.json',
          clipboardStressCommand:
            'pnpm -C "apps/core-app" run clipboard:stress -- --durationMs 10000 --intervals 500 --output evidence/clipboard-stress-summary.json',
          clipboardStressVerifierCommand:
            'pnpm -C "apps/core-app" run clipboard:stress:verify -- --input evidence/clipboard-stress-summary.json --minDurationMs 120000 --requireIntervals 500,250 --maxP95SchedulerDelayMs 100 --maxSchedulerDelayMs 300 --maxRealtimeQueuedPeak 2 --maxDroppedCount 0 --strict'
        }
      }),
      {
        requireSearchTrace: true,
        requireClipboardStress: true,
        requireVerifierCommandGateFlags: true
      }
    )

    expect(gate.failures).toContain('search trace stats command is missing release gate flags')
    expect(gate.failures).toContain('clipboard stress command is missing release gate flags')
  })

  it('requires clipboard stress verifier commands to enforce schema strictness', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        performance: {
          searchTraceStatsPath: 'evidence/search-trace-stats.json',
          searchTraceStatsCommand:
            'pnpm -C "apps/core-app" run search:trace:stats -- --input evidence/search.log --output evidence/search-trace-stats.json --minSamples 200 --maxFirstResultP95Ms 800 --maxSessionEndP95Ms 1200 --maxSlowRatio 0.1 --strict',
          searchTraceVerifierCommand:
            'pnpm -C "apps/core-app" run search:trace:verify -- --input evidence/search-trace-stats.json --minSamples 200 --maxFirstResultP95Ms 800 --maxSessionEndP95Ms 1200 --maxSlowRatio 0.1 --strict',
          clipboardStressSummaryPath: 'evidence/clipboard-stress-summary.json',
          clipboardStressCommand:
            'pnpm -C "apps/core-app" run clipboard:stress -- --durationMs 120000 --intervals 500,250 --output evidence/clipboard-stress-summary.json',
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

  it('requires the recommended acceptance command to enforce input path matching', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        verification: {
          recommendedCommand:
            'pnpm -C "apps/core-app" run windows:acceptance:verify -- --input evidence/windows-acceptance.json --strict --requireEvidencePath --requireExistingEvidenceFiles --requireEvidenceGatePassed --requireCaseEvidenceSchemas --requireVerifierCommand --requireVerifierCommandGateFlags --requireRecommendedCommandGateFlags --requireSearchTrace --requireClipboardStress --requireCommonAppLaunchDetails --requireCopiedAppPathManualChecks --requireUpdateInstallManualChecks --requireDivisionBoxDetachedWidgetManualChecks --requireCommonAppTargets ChatApp,Codex,"Apple Music"'
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

  it('requires the recommended acceptance command to reject empty evidence files', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        verification: {
          recommendedCommand:
            'pnpm -C "apps/core-app" run windows:acceptance:verify -- --input evidence/windows-acceptance.json --strict --requireEvidencePath --requireExistingEvidenceFiles --requireEvidenceGatePassed --requireCaseEvidenceSchemas --requireVerifierCommand --requireVerifierCommandGateFlags --requireRecommendedCommandGateFlags --requireRecommendedCommandInputMatch --requireSearchTrace --requireClipboardStress --requireCommonAppLaunchDetails --requireCopiedAppPathManualChecks --requireUpdateInstallManualChecks --requireDivisionBoxDetachedWidgetManualChecks --requireTimeAwareRecommendationManualChecks --requireCommonAppTargets ChatApp,Codex,"Apple Music"'
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

  it('requires the recommended acceptance command to reject incomplete manual evidence', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        verification: {
          recommendedCommand:
            'pnpm -C "apps/core-app" run windows:acceptance:verify -- --input evidence/windows-acceptance.json --strict --requireEvidencePath --requireExistingEvidenceFiles --requireNonEmptyEvidenceFiles --requireEvidenceGatePassed --requireCaseEvidenceSchemas --requireVerifierCommand --requireVerifierCommandGateFlags --requireRecommendedCommandGateFlags --requireRecommendedCommandInputMatch --requireSearchTrace --requireClipboardStress --requireCommonAppLaunchDetails --requireCopiedAppPathManualChecks --requireUpdateInstallManualChecks --requireDivisionBoxDetachedWidgetManualChecks --requireTimeAwareRecommendationManualChecks --requireCommonAppTargets ChatApp,Codex,"Apple Music"'
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

  it('requires Windows update install manual checks when requested', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: buildManifest().manualChecks?.commonAppLaunch,
          updateInstall: {
            updateDiagnosticEvidencePath: '',
            installerPath: '',
            installerMode: '',
            uacPromptObserved: true,
            uacPromptEvidence: '',
            installerLaunched: true,
            appExitedForInstall: false,
            appExitEvidence: '',
            installerExited: false,
            installerExitEvidence: '',
            installedVersionVerified: true,
            installedVersionEvidence: '',
            appRelaunchSucceeded: true,
            appRelaunchEvidence: '',
            failureRollbackVerified: false,
            failureRollbackEvidence: '',
            evidencePath: 'evidence/manual/windows-update-install.md'
          }
        }
      }),
      {
        requireUpdateInstallManualChecks: true
      }
    )

    expect(gate.failures).toEqual([
      'Windows update app exit before install was not verified',
      'Windows update installer exit was not verified',
      'Windows update failure rollback was not verified',
      'Windows update diagnostic evidence path is missing',
      'Windows update installer path is missing',
      'Windows update installer mode is missing',
      'Windows update UAC prompt evidence is missing',
      'Windows update app exit evidence is missing',
      'Windows update installer exit evidence is missing',
      'Windows update installed version evidence is missing',
      'Windows update app relaunch evidence is missing',
      'Windows update failure rollback evidence is missing'
    ])
  })

  it('requires Windows update install structured evidence even when booleans pass', () => {
    const completeCheck = buildManifest().manualChecks!.updateInstall!
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: buildManifest().manualChecks?.commonAppLaunch,
          updateInstall: {
            ...completeCheck,
            updateDiagnosticEvidencePath: '',
            installerPath: '',
            installerMode: '',
            uacPromptEvidence: '',
            appExitEvidence: '',
            installerExitEvidence: '',
            installedVersionEvidence: '',
            appRelaunchEvidence: '',
            failureRollbackEvidence: ''
          }
        }
      }),
      {
        requireUpdateInstallManualChecks: true
      }
    )

    expect(gate.failures).toEqual([
      'Windows update diagnostic evidence path is missing',
      'Windows update installer path is missing',
      'Windows update installer mode is missing',
      'Windows update UAC prompt evidence is missing',
      'Windows update app exit evidence is missing',
      'Windows update installer exit evidence is missing',
      'Windows update installed version evidence is missing',
      'Windows update app relaunch evidence is missing',
      'Windows update failure rollback evidence is missing'
    ])
  })

  it('rejects generated placeholder values in structured manual evidence fields', () => {
    const manifest = buildManifest({
      manualChecks: {
        ...buildManifest().manualChecks,
        commonAppLaunch: {
          targets: ['ChatApp'],
          passedTargets: ['ChatApp'],
          checks: [
            {
              target: 'ChatApp',
              searchQuery: '<search-query>',
              searchHit: true,
              displayNameCorrect: true,
              observedDisplayName: '<observed-display-name>',
              iconCorrect: true,
              iconEvidence: '<icon-evidence>',
              launchSucceeded: true,
              observedLaunchTarget: '<observed-launch-target>',
              coreBoxHiddenAfterLaunch: true,
              coreBoxHiddenEvidence: '<corebox-hidden-evidence>',
              evidencePath: 'evidence/manual/common-app-chatapp.md'
            }
          ]
        },
        copiedAppPath: {
          ...buildManifest().manualChecks!.copiedAppPath!,
          copiedSource: '<copied-source-path-or-command>',
          normalizedAppPath: '<normalized-app-path>',
          addToLocalLaunchAreaAction: '<add-to-local-launch-area-action>',
          localLaunchEntryEvidence: '<local-launch-entry-evidence>',
          appIndexDiagnosticEvidencePath: '<app-index-diagnostic-evidence-path>',
          searchQueryAfterReindex: '<search-query-after-reindex>',
          indexedSearchResultEvidence: '<indexed-search-result-evidence>',
          indexedResultLaunchEvidence: '<indexed-result-launch-evidence>'
        },
        updateInstall: {
          ...buildManifest().manualChecks!.updateInstall!,
          updateDiagnosticEvidencePath: '<update-diagnostic-evidence-path>',
          installerPath: '<installer-path>',
          installerMode: '<windows-installer-handoff-or-windows-auto-installer-handoff>',
          uacPromptEvidence: '<uac-prompt-evidence>',
          appExitEvidence: '<app-exit-evidence>',
          installerExitEvidence: '<installer-exit-evidence>',
          installedVersionEvidence: '<installed-version-evidence>',
          appRelaunchEvidence: '<app-relaunch-evidence>',
          failureRollbackEvidence: '<failure-rollback-evidence>'
        },
        divisionBoxDetachedWidget: {
          ...buildManifest().manualChecks!.divisionBoxDetachedWidget!,
          expectedFeaturePluginId: '<feature-plugin-id>',
          observedSessionPluginId: '<observed-session-plugin-id>',
          detachedUrlSource: '<detached-url-source-plugin-id>',
          detachedUrlProviderSource: '<detached-url-provider-source>'
        },
        timeAwareRecommendation: {
          ...buildManifest().manualChecks!.timeAwareRecommendation!,
          morningTimeSlot: '<morning-time-slot>',
          morningTopItemId: '<morning-top-item-id>',
          morningTopSourceId: '<morning-top-source-id>',
          morningRecommendationSource: '<morning-recommendation-source>',
          afternoonTimeSlot: '<afternoon-time-slot>',
          afternoonTopItemId: '<afternoon-top-item-id>',
          afternoonTopSourceId: '<afternoon-top-source-id>',
          afternoonRecommendationSource: '<afternoon-recommendation-source>',
          dayOfWeek: -1,
          frequentComparisonItemId: '<frequent-comparison-item-id>',
          frequentComparisonSourceId: '<frequent-comparison-source-id>',
          frequentComparisonRecommendationSource: '<frequent-comparison-recommendation-source>'
        }
      }
    })

    const gate = evaluateWindowsAcceptanceManifest(manifest, {
      requireCommonAppLaunchDetails: true,
      requireCopiedAppPathManualChecks: true,
      requireUpdateInstallManualChecks: true,
      requireDivisionBoxDetachedWidgetManualChecks: true,
      requireTimeAwareRecommendationManualChecks: true,
      requireCommonAppTargets: ['ChatApp']
    })

    expect(gate.failures).toEqual([
      'common app launch search query is missing: ChatApp',
      'common app launch observed display name is missing: ChatApp',
      'common app launch icon evidence is missing: ChatApp',
      'common app launch observed launch target is missing: ChatApp',
      'common app launch CoreBox hidden evidence is missing: ChatApp',
      'copied app path copied source is missing',
      'copied app path normalized app path is missing',
      'copied app path add-to-local-launch-area action evidence is missing',
      'copied app path local launch entry evidence is missing',
      'copied app path App Index diagnostic evidence path is missing',
      'copied app path search query after reindex is missing',
      'copied app path indexed search result evidence is missing',
      'copied app path indexed result launch evidence is missing',
      'Windows update diagnostic evidence path is missing',
      'Windows update installer path is missing',
      'Windows update installer mode is missing',
      'Windows update UAC prompt evidence is missing',
      'Windows update app exit evidence is missing',
      'Windows update installer exit evidence is missing',
      'Windows update installed version evidence is missing',
      'Windows update app relaunch evidence is missing',
      'Windows update failure rollback evidence is missing',
      'DivisionBox detached widget expected feature pluginId is missing',
      'DivisionBox detached widget observed session pluginId is missing',
      'DivisionBox detached widget detached URL source pluginId is missing',
      'DivisionBox detached widget detached URL providerSource is missing',
      'time-aware recommendation morning timeSlot is missing',
      'time-aware recommendation afternoon timeSlot is missing',
      'time-aware recommendation dayOfWeek is missing or invalid',
      'time-aware recommendation morning top itemId is missing',
      'time-aware recommendation morning top sourceId is missing',
      'time-aware recommendation afternoon top itemId is missing',
      'time-aware recommendation afternoon top sourceId is missing',
      'time-aware recommendation frequent comparison itemId is missing',
      'time-aware recommendation frequent comparison sourceId is missing',
      'time-aware recommendation morning recommendation source is missing',
      'time-aware recommendation afternoon recommendation source is missing',
      'time-aware recommendation frequent comparison source is missing'
    ])
  })

  it('fails when Windows update install manual checks are missing', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: buildManifest().manualChecks?.commonAppLaunch
        }
      }),
      {
        requireUpdateInstallManualChecks: true
      }
    )

    expect(gate.failures).toEqual(['Windows update install manual check is missing'])
  })

  it('requires manual acceptance checks to include evidence paths', () => {
    const completeManualChecks = buildManifest().manualChecks
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: {
            targets: ['ChatApp'],
            passedTargets: ['ChatApp'],
            checks: [
              {
                ...completeManualChecks!.commonAppLaunch!.checks![0],
                evidencePath: undefined
              }
            ]
          },
          copiedAppPath: {
            ...completeManualChecks!.copiedAppPath!,
            evidencePath: undefined
          },
          updateInstall: {
            ...completeManualChecks!.updateInstall!,
            evidencePath: undefined
          },
          divisionBoxDetachedWidget: {
            ...completeManualChecks!.divisionBoxDetachedWidget!,
            evidencePath: undefined
          },
          timeAwareRecommendation: {
            ...completeManualChecks!.timeAwareRecommendation!,
            evidencePath: undefined
          }
        }
      }),
      {
        requireCommonAppLaunchDetails: true,
        requireCommonAppTargets: ['ChatApp'],
        requireCopiedAppPathManualChecks: true,
        requireUpdateInstallManualChecks: true,
        requireDivisionBoxDetachedWidgetManualChecks: true,
        requireTimeAwareRecommendationManualChecks: true
      }
    )

    expect(gate.failures).toEqual([
      'common app launch evidence path is missing: ChatApp',
      'copied app path manual evidence path is missing',
      'Windows update install manual evidence path is missing',
      'DivisionBox detached widget manual evidence path is missing',
      'time-aware recommendation manual evidence path is missing'
    ])
  })

  it('rejects generated placeholder values in manual evidence paths', () => {
    const completeManualChecks = buildManifest().manualChecks
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: {
            targets: ['ChatApp'],
            passedTargets: ['ChatApp'],
            checks: [
              {
                ...completeManualChecks!.commonAppLaunch!.checks![0],
                evidencePath: '<common-app-evidence-path>'
              }
            ]
          },
          copiedAppPath: {
            ...completeManualChecks!.copiedAppPath!,
            evidencePath: 'TODO'
          },
          updateInstall: {
            ...completeManualChecks!.updateInstall!,
            evidencePath: 'N/A'
          },
          divisionBoxDetachedWidget: {
            ...completeManualChecks!.divisionBoxDetachedWidget!,
            evidencePath: '-'
          },
          timeAwareRecommendation: {
            ...completeManualChecks!.timeAwareRecommendation!,
            evidencePath: '待补'
          }
        }
      }),
      {
        requireCommonAppLaunchDetails: true,
        requireCommonAppTargets: ['ChatApp'],
        requireCopiedAppPathManualChecks: true,
        requireUpdateInstallManualChecks: true,
        requireDivisionBoxDetachedWidgetManualChecks: true,
        requireTimeAwareRecommendationManualChecks: true
      }
    )

    expect(gate.failures).toEqual([
      'common app launch evidence path is missing: ChatApp',
      'copied app path manual evidence path is missing',
      'Windows update install manual evidence path is missing',
      'DivisionBox detached widget manual evidence path is missing',
      'time-aware recommendation manual evidence path is missing'
    ])
  })

  it('requires copied app path manual checks when requested', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: buildManifest().manualChecks?.commonAppLaunch,
          copiedAppPath: {
            copiedPathCaptured: true,
            copiedSource: '',
            normalizedAppPath: '',
            addToLocalLaunchAreaTriggered: false,
            addToLocalLaunchAreaAction: '',
            localLaunchEntryCreated: false,
            localLaunchEntryEvidence: '',
            reindexCompleted: true,
            appIndexDiagnosticEvidencePath: '',
            searchHitAfterReindex: false,
            searchQueryAfterReindex: '',
            indexedSearchResultEvidence: '',
            launchSucceededFromIndexedResult: false,
            indexedResultLaunchEvidence: '',
            evidencePath: 'evidence/manual/copied-app-path-index.md'
          }
        }
      }),
      {
        requireCopiedAppPathManualChecks: true
      }
    )

    expect(gate.failures).toEqual([
      'copied app path add-to-local-launch-area action was not verified',
      'copied app path local launch entry was not verified',
      'copied app path search hit after reindex was not verified',
      'copied app path launch from indexed result was not verified',
      'copied app path copied source is missing',
      'copied app path normalized app path is missing',
      'copied app path add-to-local-launch-area action evidence is missing',
      'copied app path local launch entry evidence is missing',
      'copied app path App Index diagnostic evidence path is missing',
      'copied app path search query after reindex is missing',
      'copied app path indexed search result evidence is missing',
      'copied app path indexed result launch evidence is missing'
    ])
  })

  it('requires copied app path structured evidence even when booleans pass', () => {
    const completeCheck = buildManifest().manualChecks!.copiedAppPath!
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: buildManifest().manualChecks?.commonAppLaunch,
          copiedAppPath: {
            ...completeCheck,
            copiedSource: '',
            normalizedAppPath: '',
            addToLocalLaunchAreaAction: '',
            localLaunchEntryEvidence: '',
            appIndexDiagnosticEvidencePath: '',
            searchQueryAfterReindex: '',
            indexedSearchResultEvidence: '',
            indexedResultLaunchEvidence: ''
          }
        }
      }),
      {
        requireCopiedAppPathManualChecks: true
      }
    )

    expect(gate.failures).toEqual([
      'copied app path copied source is missing',
      'copied app path normalized app path is missing',
      'copied app path add-to-local-launch-area action evidence is missing',
      'copied app path local launch entry evidence is missing',
      'copied app path App Index diagnostic evidence path is missing',
      'copied app path search query after reindex is missing',
      'copied app path indexed search result evidence is missing',
      'copied app path indexed result launch evidence is missing'
    ])
  })

  it('fails when copied app path manual checks are missing', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: buildManifest().manualChecks?.commonAppLaunch
        }
      }),
      {
        requireCopiedAppPathManualChecks: true
      }
    )

    expect(gate.failures).toEqual(['copied app path manual check is missing'])
  })

  it('requires DivisionBox detached widget manual checks when requested', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: buildManifest().manualChecks?.commonAppLaunch,
          updateInstall: buildManifest().manualChecks?.updateInstall,
          divisionBoxDetachedWidget: {
            pluginFeatureSearchHit: true,
            detachedWindowOpened: true,
            pluginIdMatchesFeaturePlugin: false,
            expectedFeaturePluginId: 'demo-plugin',
            observedSessionPluginId: 'plugin-features',
            detachedUrlSource: 'plugin-features',
            detachedUrlProviderSource: 'demo-plugin',
            initialStateHydrated: false,
            detachedPayloadRestored: true,
            widgetSurfaceRendered: true,
            originalQueryPreserved: false,
            noFallbackSearchMismatch: false,
            evidencePath: 'evidence/manual/division-box-detached-widget.md'
          }
        }
      }),
      {
        requireDivisionBoxDetachedWidgetManualChecks: true
      }
    )

    expect(gate.failures).toEqual([
      'DivisionBox detached widget pluginId did not match feature plugin',
      'DivisionBox detached widget initial state hydration was not verified',
      'DivisionBox detached widget original query was not preserved',
      'DivisionBox detached widget fallback search mismatch was not ruled out',
      'DivisionBox detached widget observed session pluginId does not match expected',
      'DivisionBox detached widget detached URL source does not match expected pluginId',
      'DivisionBox detached widget detached URL providerSource is not plugin-features'
    ])
  })

  it('fails when DivisionBox detached widget manual checks are missing', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: buildManifest().manualChecks?.commonAppLaunch,
          updateInstall: buildManifest().manualChecks?.updateInstall
        }
      }),
      {
        requireDivisionBoxDetachedWidgetManualChecks: true
      }
    )

    expect(gate.failures).toEqual(['DivisionBox detached widget manual check is missing'])
  })

  it('requires DivisionBox detached widget identity fields even when booleans pass', () => {
    const completeCheck = buildManifest().manualChecks!.divisionBoxDetachedWidget!
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: buildManifest().manualChecks?.commonAppLaunch,
          updateInstall: buildManifest().manualChecks?.updateInstall,
          divisionBoxDetachedWidget: {
            ...completeCheck,
            expectedFeaturePluginId: '',
            observedSessionPluginId: '',
            detachedUrlSource: '',
            detachedUrlProviderSource: ''
          }
        }
      }),
      {
        requireDivisionBoxDetachedWidgetManualChecks: true
      }
    )

    expect(gate.failures).toEqual([
      'DivisionBox detached widget expected feature pluginId is missing',
      'DivisionBox detached widget observed session pluginId is missing',
      'DivisionBox detached widget detached URL source pluginId is missing',
      'DivisionBox detached widget detached URL providerSource is missing'
    ])
  })

  it('requires time-aware recommendation manual checks when requested', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: buildManifest().manualChecks?.commonAppLaunch,
          updateInstall: buildManifest().manualChecks?.updateInstall,
          divisionBoxDetachedWidget: buildManifest().manualChecks?.divisionBoxDetachedWidget,
          timeAwareRecommendation: {
            emptyQueryRecommendationsShown: true,
            morningRecommendationCaptured: true,
            morningTimeSlot: 'morning',
            morningTopItemId: 'app-calendar',
            morningTopSourceId: 'app-provider',
            morningRecommendationSource: 'frequent',
            afternoonRecommendationCaptured: false,
            afternoonTimeSlot: 'morning',
            afternoonTopItemId: 'app-calendar',
            afternoonTopSourceId: 'app-provider',
            afternoonRecommendationSource: 'context',
            dayOfWeek: 8,
            topRecommendationDiffersByTimeSlot: false,
            frequencySignalRetained: true,
            frequentComparisonItemId: '',
            frequentComparisonSourceId: '',
            frequentComparisonRecommendationSource: 'time-based',
            timeSlotCacheSeparated: false,
            evidencePath: 'evidence/manual/time-aware-recommendation.md'
          }
        }
      }),
      {
        requireTimeAwareRecommendationManualChecks: true
      }
    )

    expect(gate.failures).toEqual([
      'time-aware recommendation afternoon sample was not captured',
      'time-aware recommendation top result did not differ by time slot',
      'time-aware recommendation cache separation was not verified',
      'time-aware recommendation morning and afternoon timeSlot are identical',
      'time-aware recommendation dayOfWeek is missing or invalid',
      'time-aware recommendation morning and afternoon top recommendation are identical',
      'time-aware recommendation frequent comparison itemId is missing',
      'time-aware recommendation frequent comparison sourceId is missing',
      'time-aware recommendation morning source is not time-based',
      'time-aware recommendation afternoon source is not time-based',
      'time-aware recommendation frequent comparison source is not frequent'
    ])
  })

  it('requires time-aware recommendation structured sample fields even when booleans pass', () => {
    const completeCheck = buildManifest().manualChecks!.timeAwareRecommendation!
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: buildManifest().manualChecks?.commonAppLaunch,
          updateInstall: buildManifest().manualChecks?.updateInstall,
          divisionBoxDetachedWidget: buildManifest().manualChecks?.divisionBoxDetachedWidget,
          timeAwareRecommendation: {
            ...completeCheck,
            morningTimeSlot: '',
            morningTopItemId: '',
            morningTopSourceId: '',
            morningRecommendationSource: '',
            afternoonTimeSlot: '',
            afternoonTopItemId: '',
            afternoonTopSourceId: '',
            afternoonRecommendationSource: '',
            dayOfWeek: undefined,
            frequentComparisonItemId: '',
            frequentComparisonSourceId: '',
            frequentComparisonRecommendationSource: ''
          }
        }
      }),
      {
        requireTimeAwareRecommendationManualChecks: true
      }
    )

    expect(gate.failures).toEqual([
      'time-aware recommendation morning timeSlot is missing',
      'time-aware recommendation afternoon timeSlot is missing',
      'time-aware recommendation dayOfWeek is missing or invalid',
      'time-aware recommendation morning top itemId is missing',
      'time-aware recommendation morning top sourceId is missing',
      'time-aware recommendation afternoon top itemId is missing',
      'time-aware recommendation afternoon top sourceId is missing',
      'time-aware recommendation frequent comparison itemId is missing',
      'time-aware recommendation frequent comparison sourceId is missing',
      'time-aware recommendation morning recommendation source is missing',
      'time-aware recommendation afternoon recommendation source is missing',
      'time-aware recommendation frequent comparison source is missing'
    ])
  })

  it('requires time-aware recommendation manual evidence path when requested', () => {
    const completeCheck = buildManifest().manualChecks!.timeAwareRecommendation!
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: buildManifest().manualChecks?.commonAppLaunch,
          updateInstall: buildManifest().manualChecks?.updateInstall,
          divisionBoxDetachedWidget: buildManifest().manualChecks?.divisionBoxDetachedWidget,
          timeAwareRecommendation: {
            ...completeCheck,
            evidencePath: ''
          }
        }
      }),
      {
        requireTimeAwareRecommendationManualChecks: true
      }
    )

    expect(gate.failures).toEqual(['time-aware recommendation manual evidence path is missing'])
  })

  it('fails when time-aware recommendation manual checks are missing', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: buildManifest().manualChecks?.commonAppLaunch,
          updateInstall: buildManifest().manualChecks?.updateInstall,
          divisionBoxDetachedWidget: buildManifest().manualChecks?.divisionBoxDetachedWidget
        }
      }),
      {
        requireTimeAwareRecommendationManualChecks: true
      }
    )

    expect(gate.failures).toEqual(['time-aware recommendation manual check is missing'])
  })

  it('requires common app launch details when requested', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: {
            targets: ['ChatApp', 'Codex', 'Apple Music'],
            passedTargets: ['ChatApp', 'Codex', 'Apple Music'],
            checks: [
              {
                target: 'ChatApp',
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
        requireCommonAppTargets: ['ChatApp', 'Codex', 'Apple Music']
      }
    )

    expect(gate.failures).toEqual([
      'common app launch search query is missing: ChatApp',
      'common app launch display name not verified: ChatApp',
      'common app launch observed display name is missing: ChatApp',
      'common app launch icon evidence is missing: ChatApp',
      'common app launch observed launch target is missing: ChatApp',
      'common app launch did not hide CoreBox: ChatApp',
      'common app launch CoreBox hidden evidence is missing: ChatApp',
      'common app launch evidence path is missing: ChatApp',
      'common app launch detail is missing: Codex',
      'common app launch detail is missing: Apple Music'
    ])
  })

  it('requires common app launch structured evidence even when booleans pass', () => {
    const gate = evaluateWindowsAcceptanceManifest(
      buildManifest({
        manualChecks: {
          commonAppLaunch: {
            targets: ['ChatApp'],
            passedTargets: ['ChatApp'],
            checks: [
              {
                target: 'ChatApp',
                searchQuery: '',
                searchHit: true,
                displayNameCorrect: true,
                observedDisplayName: '',
                iconCorrect: true,
                iconEvidence: '',
                launchSucceeded: true,
                observedLaunchTarget: '',
                coreBoxHiddenAfterLaunch: true,
                coreBoxHiddenEvidence: '',
                evidencePath: 'evidence/manual/common-app-chatapp.md'
              }
            ]
          }
        }
      }),
      {
        requireCommonAppLaunchDetails: true,
        requireCommonAppTargets: ['ChatApp']
      }
    )

    expect(gate.failures).toEqual([
      'common app launch search query is missing: ChatApp',
      'common app launch observed display name is missing: ChatApp',
      'common app launch icon evidence is missing: ChatApp',
      'common app launch observed launch target is missing: ChatApp',
      'common app launch CoreBox hidden evidence is missing: ChatApp'
    ])
  })
})
