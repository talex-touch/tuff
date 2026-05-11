import type { WindowsAcceptanceManifest } from './windows-acceptance-manifest-verifier'
import { WINDOWS_REQUIRED_CASE_IDS } from './windows-acceptance-manifest-verifier'

export function buildManifest(
  overrides: Partial<WindowsAcceptanceManifest> = {}
): WindowsAcceptanceManifest {
  return {
    schema: 'windows-acceptance-manifest/v1',
    generatedAt: '2026-05-10T10:00:00.000Z',
    platform: 'win32',
    verification: {
      recommendedCommand:
        'pnpm -C "apps/core-app" run windows:acceptance:verify -- --input "evidence/windows-acceptance.json" --strict --requireEvidencePath --requireExistingEvidenceFiles --requireNonEmptyEvidenceFiles --requireCompletedManualEvidence --requireEvidenceGatePassed --requireCaseEvidenceSchemas --requireVerifierCommand --requireVerifierCommandGateFlags --requireRecommendedCommandGateFlags --requireRecommendedCommandInputMatch --requireSearchTrace --requireClipboardStress --requireCommonAppLaunchDetails --requireCopiedAppPathManualChecks --requireUpdateInstallManualChecks --requireDivisionBoxDetachedWidgetManualChecks --requireTimeAwareRecommendationManualChecks --requireCommonAppTargets WeChat,Codex,"Apple Music"'
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
      searchTraceStatsCommand:
        'pnpm -C "apps/core-app" run search:trace:stats -- --input evidence/search.log --output evidence/search-trace-stats.json --minSamples 200 --maxFirstResultP95Ms 800 --maxSessionEndP95Ms 1200 --maxSlowRatio 0.1 --strict',
      searchTraceVerifierCommand:
        'pnpm -C "apps/core-app" run search:trace:verify -- --input evidence/search-trace-stats.json --minSamples 200 --strict',
      clipboardStressSummaryPath: 'evidence/clipboard-stress-summary.json',
      clipboardStressCommand:
        'pnpm -C "apps/core-app" run clipboard:stress -- --durationMs 120000 --intervals 500,250 --output evidence/clipboard-stress-summary.json',
      clipboardStressVerifierCommand:
        'pnpm -C "apps/core-app" run clipboard:stress:verify -- --input evidence/clipboard-stress-summary.json'
    },
    manualChecks: {
      commonAppLaunch: {
        targets: ['WeChat', 'Codex', 'Apple Music'],
        passedTargets: ['WeChat', 'Codex', 'Apple Music'],
        checks: ['WeChat', 'Codex', 'Apple Music'].map((target) => ({
          target,
          searchQuery: target,
          searchHit: true,
          displayNameCorrect: true,
          observedDisplayName: target,
          iconCorrect: true,
          iconEvidence: `evidence/icons/${target}.png`,
          launchSucceeded: true,
          observedLaunchTarget: `launch-target:${target}`,
          coreBoxHiddenAfterLaunch: true,
          coreBoxHiddenEvidence: `evidence/corebox-hidden/${target}.png`,
          evidencePath: `evidence/manual/common-app-${target.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`
        }))
      },
      copiedAppPath: {
        copiedPathCaptured: true,
        copiedSource: '"C:\\\\Tools\\\\Demo Tool.exe" --profile work',
        normalizedAppPath: 'C:\\Tools\\Demo Tool.exe',
        addToLocalLaunchAreaTriggered: true,
        addToLocalLaunchAreaAction: 'app-index:add-by-path',
        localLaunchEntryCreated: true,
        localLaunchEntryEvidence: 'entrySource=manual entryEnabled=true',
        reindexCompleted: true,
        appIndexDiagnosticEvidencePath: 'evidence/windows-copied-app-path-index-app-index.json',
        searchHitAfterReindex: true,
        searchQueryAfterReindex: 'Demo Tool',
        indexedSearchResultEvidence: 'app-index result itemId=demo-tool',
        launchSucceededFromIndexedResult: true,
        indexedResultLaunchEvidence: 'launched from app-index itemId=demo-tool',
        evidencePath: 'evidence/manual/copied-app-path-index.md'
      },
      updateInstall: {
        updateDiagnosticEvidencePath:
          'evidence/windows-tray-update-plugin-install-exit-update.json',
        installerPath: 'C:\\Users\\demo\\Downloads\\Tuff-Setup.exe',
        installerMode: 'windows-installer-handoff',
        uacPromptObserved: true,
        uacPromptEvidence: 'UAC prompt observed',
        installerLaunched: true,
        appExitedForInstall: true,
        appExitEvidence: 'Tuff process exited before handoff',
        installerExited: true,
        installerExitEvidence: 'installer exit code 0',
        installedVersionVerified: true,
        installedVersionEvidence: 'installedVersion=2.4.10-beta.18',
        appRelaunchSucceeded: true,
        appRelaunchEvidence: 'Tuff relaunched after install',
        failureRollbackVerified: true,
        failureRollbackEvidence: 'failed installer left previous version runnable',
        evidencePath: 'evidence/manual/windows-update-install.md'
      },
      divisionBoxDetachedWidget: {
        pluginFeatureSearchHit: true,
        detachedWindowOpened: true,
        pluginIdMatchesFeaturePlugin: true,
        expectedFeaturePluginId: 'demo-plugin',
        observedSessionPluginId: 'demo-plugin',
        detachedUrlSource: 'demo-plugin',
        detachedUrlProviderSource: 'plugin-features',
        initialStateHydrated: true,
        detachedPayloadRestored: true,
        widgetSurfaceRendered: true,
        originalQueryPreserved: true,
        noFallbackSearchMismatch: true,
        evidencePath: 'evidence/manual/division-box-detached-widget.md'
      },
      timeAwareRecommendation: {
        emptyQueryRecommendationsShown: true,
        morningRecommendationCaptured: true,
        morningTimeSlot: 'morning',
        morningTopItemId: 'app-calendar',
        morningTopSourceId: 'app-provider',
        morningRecommendationSource: 'time-based',
        afternoonRecommendationCaptured: true,
        afternoonTimeSlot: 'afternoon',
        afternoonTopItemId: 'app-music',
        afternoonTopSourceId: 'app-provider',
        afternoonRecommendationSource: 'time-based',
        dayOfWeek: 1,
        topRecommendationDiffersByTimeSlot: true,
        frequencySignalRetained: true,
        frequentComparisonItemId: 'app-terminal',
        frequentComparisonSourceId: 'app-provider',
        frequentComparisonRecommendationSource: 'frequent',
        timeSlotCacheSeparated: true,
        evidencePath: 'evidence/manual/time-aware-recommendation.md'
      }
    },
    ...overrides
  }
}
