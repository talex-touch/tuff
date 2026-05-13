export const WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE = {
  minSamples: 200,
  maxFirstResultP95Ms: 800,
  maxSessionEndP95Ms: 1_200,
  maxSlowRatio: 0.1
} as const

export const WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE = {
  minDurationMs: 120_000,
  requireIntervals: [500, 250],
  maxP95SchedulerDelayMs: 100,
  maxSchedulerDelayMs: 300,
  maxRealtimeQueuedPeak: 2,
  maxDroppedCount: 0
} as const

export interface VerifierCommandRequirement {
  label: string
  fragments: string[]
}

export interface VerifierCommandRequirementGroup {
  label: string
  alternatives: VerifierCommandRequirement[]
}

export const WINDOWS_ACCEPTANCE_CASE_VERIFIER_COMMAND_REQUIREMENTS = {
  'windows-everything-file-search': [
    {
      label: 'Windows capability verifier command',
      alternatives: [
        {
          label: 'Windows capability verifier command',
          fragments: [
            'windows:capability:verify',
            '--input',
            '--requireEverything',
            '--requireEverythingTargets',
            '--strict'
          ]
        }
      ]
    },
    {
      label: 'Everything diagnostic verifier command',
      alternatives: [
        {
          label: 'Everything diagnostic verifier command',
          fragments: [
            'everything:diagnostic:verify',
            '--input',
            '--requireReady',
            '--requireEnabled',
            '--requireAvailable',
            '--requireHealthy',
            '--requireVersion',
            '--requireEsPath',
            '--requireFallbackChain',
            'sdk-napi,cli',
            '--requireCaseIds windows-everything-file-search'
          ]
        }
      ]
    }
  ],
  'windows-app-scan-uwp': [
    {
      label: 'Windows capability verifier command',
      alternatives: [
        {
          label: 'Windows capability verifier command',
          fragments: [
            'windows:capability:verify',
            '--input',
            '--requireTargets',
            '--requireUwp',
            '--requireRegistryFallback',
            '--requireShortcutMetadata',
            '--strict'
          ]
        }
      ]
    },
    {
      label: 'App Index diagnostic verifier command',
      alternatives: [
        {
          label: 'App Index diagnostic verifier command',
          fragments: [
            'app-index:diagnostic:verify',
            '--input',
            '--requireSuccess',
            '--requireQueryHit',
            '--requireLaunchKind uwp',
            '--requireLaunchTarget',
            '--requireBundleOrIdentity',
            '--requireCleanDisplayName',
            '--requireIcon',
            '--requireReindex',
            '--requireCaseIds windows-app-scan-uwp'
          ]
        }
      ]
    }
  ],
  'windows-copied-app-path-index': [
    {
      label: 'Windows capability verifier command',
      alternatives: [
        {
          label: 'Windows capability verifier command',
          fragments: [
            'windows:capability:verify',
            '--input',
            '--requireTargets',
            '--requireRegistryFallback',
            '--requireShortcutMetadata',
            '--strict'
          ]
        }
      ]
    },
    {
      label: 'App Index diagnostic verifier command',
      alternatives: [
        {
          label: 'App Index diagnostic verifier command',
          fragments: [
            'app-index:diagnostic:verify',
            '--input',
            '--requireSuccess',
            '--requireQueryHit',
            '--requireLaunchKind path,shortcut',
            '--requireLaunchTarget',
            '--requireCleanDisplayName',
            '--requireIcon',
            '--requireManagedEntry',
            '--requireReindex',
            '--requireCaseIds windows-copied-app-path-index'
          ]
        }
      ]
    }
  ],
  'windows-third-party-app-launch': [
    {
      label: 'Windows capability verifier command',
      alternatives: [
        {
          label: 'Windows capability verifier command',
          fragments: [
            'windows:capability:verify',
            '--input',
            '--requireTargets',
            '--requireRegistryFallback',
            '--requireShortcutMetadata',
            '--strict'
          ]
        }
      ]
    },
    {
      label: 'App Index diagnostic verifier command',
      alternatives: [
        {
          label: 'App Index diagnostic verifier command',
          fragments: [
            'app-index:diagnostic:verify',
            '--input',
            '--requireSuccess',
            '--requireQueryHit',
            '--requireLaunchKind path,shortcut,uwp',
            '--requireLaunchTarget',
            '--requireCleanDisplayName',
            '--requireIcon',
            '--requireReindex',
            '--requireCaseIds windows-third-party-app-launch'
          ]
        }
      ]
    }
  ],
  'windows-shortcut-launch-args': [
    {
      label: 'Windows capability verifier command',
      alternatives: [
        {
          label: 'Windows capability verifier command',
          fragments: [
            'windows:capability:verify',
            '--input',
            '--requireTargets',
            '--requireShortcutMetadata',
            '--requireShortcutArguments',
            '--requireShortcutWorkingDirectory',
            '--strict'
          ]
        }
      ]
    },
    {
      label: 'App Index diagnostic verifier command',
      alternatives: [
        {
          label: 'App Index diagnostic verifier command',
          fragments: [
            'app-index:diagnostic:verify',
            '--input',
            '--requireSuccess',
            '--requireQueryHit',
            '--requireLaunchKind shortcut',
            '--requireLaunchTarget',
            '--requireLaunchArgs',
            '--requireWorkingDirectory',
            '--requireCleanDisplayName',
            '--requireIcon',
            '--requireReindex',
            '--requireCaseIds windows-shortcut-launch-args'
          ]
        }
      ]
    }
  ],
  'windows-tray-update-plugin-install-exit': [
    {
      label: 'Windows capability verifier command',
      alternatives: [
        {
          label: 'Windows capability verifier command',
          fragments: [
            'windows:capability:verify',
            '--input',
            '--requireInstallerHandoff',
            '--strict'
          ]
        }
      ]
    },
    {
      label: 'Update diagnostic verifier command',
      alternatives: [
        {
          label: 'Update diagnostic verifier command',
          fragments: [
            'update:diagnostic:verify',
            '--input',
            '--requireAutoDownload',
            '--requireDownloadReady',
            '--requireReadyToInstall',
            '--requirePlatform win32',
            '--requireInstallMode windows-installer-handoff',
            '--requireUserConfirmation',
            '--requireUnattendedDisabled',
            '--requireMatchingAsset',
            '--requireChecksums',
            '--requireCaseIds windows-tray-update-plugin-install-exit'
          ]
        },
        {
          label: 'Update diagnostic verifier command',
          fragments: [
            'update:diagnostic:verify',
            '--input',
            '--requireAutoDownload',
            '--requireDownloadReady',
            '--requireReadyToInstall',
            '--requirePlatform win32',
            '--requireInstallMode windows-auto-installer-handoff',
            '--requireAutoInstallEnabled',
            '--requireUnattendedEnabled',
            '--requireInstalledVersionMatchesTarget',
            '--requireMatchingAsset',
            '--requireChecksums',
            '--requireCaseIds windows-tray-update-plugin-install-exit'
          ]
        }
      ]
    }
  ]
} satisfies Record<string, VerifierCommandRequirementGroup[]>

export const SEARCH_TRACE_VERIFIER_COMMAND_REQUIREMENT: VerifierCommandRequirement = {
  label: 'search trace verifier command',
  fragments: [
    'search:trace:verify',
    '--input',
    `--minSamples ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.minSamples}`,
    `--maxFirstResultP95Ms ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.maxFirstResultP95Ms}`,
    `--maxSessionEndP95Ms ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.maxSessionEndP95Ms}`,
    `--maxSlowRatio ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.maxSlowRatio}`,
    '--strict'
  ]
}

export const SEARCH_TRACE_STATS_COMMAND_REQUIREMENT: VerifierCommandRequirement = {
  label: 'search trace stats command',
  fragments: [
    'search:trace:stats',
    '--input',
    '--output',
    `--minSamples ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.minSamples}`,
    `--maxFirstResultP95Ms ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.maxFirstResultP95Ms}`,
    `--maxSessionEndP95Ms ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.maxSessionEndP95Ms}`,
    `--maxSlowRatio ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.maxSlowRatio}`,
    '--strict'
  ]
}

export const CLIPBOARD_STRESS_VERIFIER_COMMAND_REQUIREMENT: VerifierCommandRequirement = {
  label: 'clipboard stress verifier command',
  fragments: [
    'clipboard:stress:verify',
    '--input',
    `--minDurationMs ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.minDurationMs}`,
    `--requireIntervals ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.requireIntervals.join(',')}`,
    `--maxP95SchedulerDelayMs ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.maxP95SchedulerDelayMs}`,
    `--maxSchedulerDelayMs ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.maxSchedulerDelayMs}`,
    `--maxRealtimeQueuedPeak ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.maxRealtimeQueuedPeak}`,
    `--maxDroppedCount ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.maxDroppedCount}`,
    '--strict'
  ]
}

export const CLIPBOARD_STRESS_COMMAND_REQUIREMENT: VerifierCommandRequirement = {
  label: 'clipboard stress command',
  fragments: [
    'clipboard:stress',
    `--durationMs ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.minDurationMs}`,
    `--intervals ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.requireIntervals.join(',')}`,
    '--output'
  ]
}

export const ACCEPTANCE_RECOMMENDED_COMMAND_REQUIREMENT: VerifierCommandRequirement = {
  label: 'Windows acceptance recommended command',
  fragments: [
    'windows:acceptance:verify',
    '--input',
    '--strict',
    '--requireEvidencePath',
    '--requireExistingEvidenceFiles',
    '--requireNonEmptyEvidenceFiles',
    '--requireCompletedManualEvidence',
    '--requireEvidenceGatePassed',
    '--requireCaseEvidenceSchemas',
    '--requireVerifierCommand',
    '--requireVerifierCommandGateFlags',
    '--requireRecommendedCommandGateFlags',
    '--requireRecommendedCommandInputMatch',
    '--requireSearchTrace',
    '--requireClipboardStress',
    '--requireCommonAppLaunchDetails',
    '--requireCopiedAppPathManualChecks',
    '--requireUpdateInstallManualChecks',
    '--requireDivisionBoxDetachedWidgetManualChecks',
    '--requireTimeAwareRecommendationManualChecks',
    '--requireCommonAppTargets',
    'WeChat',
    'Codex',
    'Apple Music'
  ]
}
