#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE,
  WINDOWS_ACCEPTANCE_MANIFEST_SCHEMA,
  WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE,
  WINDOWS_REQUIRED_CASE_IDS
} from '../src/main/modules/platform/windows-acceptance-manifest-verifier'
import { renderWindowsAcceptanceManualEvidenceFields } from './windows-acceptance-manual-evidence'
import type {
  WindowsAcceptanceCaseStatus,
  WindowsAcceptanceManifest,
  WindowsRequiredCaseId
} from '../src/main/modules/platform/windows-acceptance-manifest-verifier'

interface CliOptions {
  evidenceDir: string
  output?: string
  status: WindowsAcceptanceCaseStatus
  updateInstallMode: 'manual' | 'auto'
  writeManualEvidenceTemplates: boolean
  writeCollectionPlan: boolean
  pretty: boolean
}

interface CaseTemplate {
  capabilityEvidencePath: string
  diagnosticEvidencePath: string
  capabilityVerifierCommand: string
  diagnosticVerifierCommand: string
}

const DEFAULT_EVIDENCE_DIR = 'evidence/windows'

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run windows:acceptance:template -- [options]

Options:
  --evidenceDir <dir>     Evidence directory used in manifest paths. Default: evidence/windows.
  --output <path>         Write manifest JSON to a file in addition to stdout.
  --status <status>       Initial case status: blocked, skipped, failed, passed. Default: blocked.
  --updateInstallMode <mode>
                          Update verifier mode: manual or auto. Default: manual.
  --writeManualEvidenceTemplates
                          Write non-overwriting Markdown templates for manual evidence paths.
  --writeCollectionPlan  Write a non-overwriting Markdown collection plan next to the manifest.
  --compact               Print single-line JSON.
  --help                  Show this help.
`)
}

function parseStatus(value: string | undefined): WindowsAcceptanceCaseStatus {
  if (value === 'passed' || value === 'failed' || value === 'blocked' || value === 'skipped') {
    return value
  }
  return 'blocked'
}

function parseUpdateInstallMode(value: string | undefined): CliOptions['updateInstallMode'] {
  if (value === 'auto') return 'auto'
  return 'manual'
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    status: 'blocked',
    updateInstallMode: 'manual',
    writeManualEvidenceTemplates: false,
    writeCollectionPlan: false,
    pretty: true
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue

    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--evidenceDir' && argv[i + 1]) {
      options.evidenceDir = argv[++i]
      continue
    }
    if (arg === '--output' && argv[i + 1]) {
      options.output = argv[++i]
      continue
    }
    if (arg === '--status' && argv[i + 1]) {
      options.status = parseStatus(argv[++i])
      continue
    }
    if (arg === '--updateInstallMode' && argv[i + 1]) {
      options.updateInstallMode = parseUpdateInstallMode(argv[++i])
      continue
    }
    if (arg === '--compact') {
      options.pretty = false
      continue
    }
    if (arg === '--writeManualEvidenceTemplates') {
      options.writeManualEvidenceTemplates = true
      continue
    }
    if (arg === '--writeCollectionPlan') {
      options.writeCollectionPlan = true
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function normalizeEvidenceDir(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '') || DEFAULT_EVIDENCE_DIR
}

function joinEvidencePath(evidenceDir: string, fileName: string): string {
  return `${normalizeEvidenceDir(evidenceDir)}/${fileName}`
}

function joinManualEvidencePath(evidenceDir: string, fileName: string): string {
  return joinEvidencePath(evidenceDir, `manual/${fileName}`)
}

function buildCaseTemplate(
  caseId: WindowsRequiredCaseId,
  evidenceDir: string,
  options: Pick<CliOptions, 'updateInstallMode'>
): CaseTemplate {
  const capabilityEvidencePath = joinEvidencePath(evidenceDir, `${caseId}-capability.json`)

  if (caseId === 'windows-everything-file-search') {
    const diagnosticEvidencePath = joinEvidencePath(evidenceDir, `${caseId}-everything.json`)
    return {
      capabilityEvidencePath,
      diagnosticEvidencePath,
      capabilityVerifierCommand:
        'pnpm -C "apps/core-app" run windows:capability:verify -- --input "<capability-evidence.json>" --requireEverything --requireEverythingTargets --strict',
      diagnosticVerifierCommand:
        'pnpm -C "apps/core-app" run everything:diagnostic:verify -- --input "<everything-evidence.json>" --requireReady --requireEnabled --requireAvailable --requireHealthy --requireVersion --requireEsPath --requireFallbackChain sdk-napi,cli --requireCaseIds windows-everything-file-search'
    }
  }

  if (caseId === 'windows-tray-update-plugin-install-exit') {
    const diagnosticEvidencePath = joinEvidencePath(evidenceDir, `${caseId}-update.json`)
    return {
      capabilityEvidencePath,
      diagnosticEvidencePath,
      capabilityVerifierCommand:
        'pnpm -C "apps/core-app" run windows:capability:verify -- --input "<capability-evidence.json>" --requireInstallerHandoff --strict',
      diagnosticVerifierCommand: buildUpdateVerifierCommand(options.updateInstallMode)
    }
  }

  const diagnosticEvidencePath = joinEvidencePath(evidenceDir, `${caseId}-app-index.json`)
  const appIndexVerifierCommand = buildAppIndexVerifierCommand(caseId)
  const capabilityVerifierCommand = buildAppIndexCapabilityVerifierCommand(caseId)

  return {
    capabilityEvidencePath,
    diagnosticEvidencePath,
    capabilityVerifierCommand,
    diagnosticVerifierCommand: appIndexVerifierCommand
  }
}

function buildUpdateVerifierCommand(updateInstallMode: CliOptions['updateInstallMode']): string {
  const handoffFlags =
    updateInstallMode === 'auto'
      ? [
          '--requireInstallMode windows-auto-installer-handoff',
          '--requireAutoInstallEnabled',
          '--requireUnattendedEnabled',
          '--requireInstalledVersionMatchesTarget'
        ]
      : [
          '--requireInstallMode windows-installer-handoff',
          '--requireUserConfirmation',
          '--requireUnattendedDisabled'
        ]

  return [
    'pnpm -C "apps/core-app" run update:diagnostic:verify -- --input "<update-evidence.json>"',
    '--requireAutoDownload',
    '--requireDownloadReady',
    '--requireReadyToInstall',
    '--requirePlatform win32',
    ...handoffFlags,
    '--requireMatchingAsset',
    '--requireChecksums',
    '--requireCaseIds windows-tray-update-plugin-install-exit'
  ].join(' ')
}

function buildAppIndexVerifierCommand(caseId: WindowsRequiredCaseId): string {
  if (caseId === 'windows-app-scan-uwp') {
    return 'pnpm -C "apps/core-app" run app-index:diagnostic:verify -- --input "<app-index-evidence.json>" --requireSuccess --requireQueryHit --requireLaunchKind uwp --requireLaunchTarget --requireBundleOrIdentity --requireCleanDisplayName --requireIcon --requireReindex --requireCaseIds windows-app-scan-uwp'
  }

  if (caseId === 'windows-copied-app-path-index') {
    return 'pnpm -C "apps/core-app" run app-index:diagnostic:verify -- --input "<app-index-evidence.json>" --requireSuccess --requireQueryHit --requireLaunchKind path,shortcut --requireLaunchTarget --requireCleanDisplayName --requireIcon --requireManagedEntry --requireReindex --requireCaseIds windows-copied-app-path-index'
  }

  if (caseId === 'windows-shortcut-launch-args') {
    return 'pnpm -C "apps/core-app" run app-index:diagnostic:verify -- --input "<app-index-evidence.json>" --requireSuccess --requireQueryHit --requireLaunchKind shortcut --requireLaunchTarget --requireLaunchArgs --requireWorkingDirectory --requireCleanDisplayName --requireIcon --requireReindex --requireCaseIds windows-shortcut-launch-args'
  }

  return 'pnpm -C "apps/core-app" run app-index:diagnostic:verify -- --input "<app-index-evidence.json>" --requireSuccess --requireQueryHit --requireLaunchKind path,shortcut,uwp --requireLaunchTarget --requireCleanDisplayName --requireIcon --requireReindex --requireCaseIds windows-third-party-app-launch'
}

function buildAppIndexCapabilityVerifierCommand(caseId: WindowsRequiredCaseId): string {
  if (caseId === 'windows-shortcut-launch-args') {
    return 'pnpm -C "apps/core-app" run windows:capability:verify -- --input "<capability-evidence.json>" --requireTargets --requireShortcutMetadata --requireShortcutArguments --requireShortcutWorkingDirectory --strict'
  }

  if (caseId === 'windows-third-party-app-launch' || caseId === 'windows-copied-app-path-index') {
    return 'pnpm -C "apps/core-app" run windows:capability:verify -- --input "<capability-evidence.json>" --requireTargets --requireRegistryFallback --requireShortcutMetadata --strict'
  }

  return 'pnpm -C "apps/core-app" run windows:capability:verify -- --input "<capability-evidence.json>" --requireTargets --requireUwp --requireRegistryFallback --requireShortcutMetadata --strict'
}

function buildManifest(options: CliOptions): WindowsAcceptanceManifest {
  const evidenceDir = normalizeEvidenceDir(options.evidenceDir)
  const manifestPath = options.output || '<windows-acceptance-manifest.json>'

  return {
    schema: WINDOWS_ACCEPTANCE_MANIFEST_SCHEMA,
    generatedAt: new Date().toISOString(),
    platform: 'win32',
    verification: {
      recommendedCommand: `pnpm -C "apps/core-app" run windows:acceptance:verify -- --input "${manifestPath}" --strict --requireEvidencePath --requireExistingEvidenceFiles --requireNonEmptyEvidenceFiles --requireCompletedManualEvidence --requireEvidenceGatePassed --requireCaseEvidenceSchemas --requireVerifierCommand --requireVerifierCommandGateFlags --requireRecommendedCommandGateFlags --requireRecommendedCommandInputMatch --requireSearchTrace --requireClipboardStress --requireCommonAppLaunchDetails --requireCopiedAppPathManualChecks --requireUpdateInstallManualChecks --requireDivisionBoxDetachedWidgetManualChecks --requireTimeAwareRecommendationManualChecks --requireCommonAppTargets WeChat,Codex,"Apple Music"`
    },
    cases: WINDOWS_REQUIRED_CASE_IDS.map((caseId) => {
      const template = buildCaseTemplate(caseId, evidenceDir, {
        updateInstallMode: options.updateInstallMode
      })
      return {
        caseId,
        status: options.status,
        requiredForRelease: true,
        evidence: [
          {
            path: template.capabilityEvidencePath,
            verifierCommand: template.capabilityVerifierCommand,
            notes:
              'Replace the placeholder input path after running windows:capability:evidence on a Windows device.'
          },
          {
            path: template.diagnosticEvidencePath,
            verifierCommand: template.diagnosticVerifierCommand,
            notes:
              'Replace the placeholder input path after exporting the matching Settings diagnostic evidence on a Windows device.'
          }
        ]
      }
    }),
    performance: {
      searchTraceStatsPath: joinEvidencePath(evidenceDir, 'search-trace-stats.json'),
      searchTraceStatsCommand: buildSearchTraceStatsCommand(evidenceDir),
      searchTraceVerifierCommand: buildSearchTraceVerifierCommand(),
      clipboardStressSummaryPath: joinEvidencePath(evidenceDir, 'clipboard-stress-summary.json'),
      clipboardStressCommand: buildClipboardStressCommand(evidenceDir),
      clipboardStressVerifierCommand: buildClipboardStressVerifierCommand()
    },
    manualChecks: {
      commonAppLaunch: {
        targets: ['WeChat', 'Codex', 'Apple Music'],
        passedTargets: [],
        checks: ['WeChat', 'Codex', 'Apple Music'].map((target) => ({
          target,
          searchQuery: target,
          searchHit: false,
          displayNameCorrect: false,
          observedDisplayName: '<observed-display-name>',
          iconCorrect: false,
          iconEvidence: '<icon-evidence>',
          launchSucceeded: false,
          observedLaunchTarget: '<observed-launch-target>',
          coreBoxHiddenAfterLaunch: false,
          coreBoxHiddenEvidence: '<corebox-hidden-evidence>',
          evidencePath: joinManualEvidencePath(
            evidenceDir,
            `common-app-${target.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`
          ),
          notes:
            'Set all booleans to true only after verifying the app is searchable, has the expected display name and icon, launches successfully, and hides CoreBox immediately after launch.'
        }))
      },
      copiedAppPath: {
        copiedPathCaptured: false,
        copiedSource: '<copied-source-path-or-command>',
        normalizedAppPath: '<normalized-app-path>',
        addToLocalLaunchAreaTriggered: false,
        addToLocalLaunchAreaAction: '<add-to-local-launch-area-action>',
        localLaunchEntryCreated: false,
        localLaunchEntryEvidence: '<local-launch-entry-evidence>',
        reindexCompleted: false,
        appIndexDiagnosticEvidencePath: '<app-index-diagnostic-evidence-path>',
        searchHitAfterReindex: false,
        searchQueryAfterReindex: '<search-query-after-reindex>',
        indexedSearchResultEvidence: '<indexed-search-result-evidence>',
        launchSucceededFromIndexedResult: false,
        indexedResultLaunchEvidence: '<indexed-result-launch-evidence>',
        evidencePath: joinManualEvidencePath(evidenceDir, 'copied-app-path-index.md'),
        notes:
          'Set all booleans to true only after copying a real Windows .exe/.lnk/.appref-ms path or command line, triggering add-to-local-launch-area, confirming the local launch entry was created, reindex completed, the app appears in search, and launching from the indexed result succeeds.'
      },
      updateInstall: {
        updateDiagnosticEvidencePath: '<update-diagnostic-evidence-path>',
        installerPath: '<installer-path>',
        installerMode: '<windows-installer-handoff-or-windows-auto-installer-handoff>',
        uacPromptObserved: false,
        uacPromptEvidence: '<uac-prompt-evidence>',
        installerLaunched: false,
        appExitedForInstall: false,
        appExitEvidence: '<app-exit-evidence>',
        installerExited: false,
        installerExitEvidence: '<installer-exit-evidence>',
        installedVersionVerified: false,
        installedVersionEvidence: '<installed-version-evidence>',
        appRelaunchSucceeded: false,
        appRelaunchEvidence: '<app-relaunch-evidence>',
        failureRollbackVerified: false,
        failureRollbackEvidence: '<failure-rollback-evidence>',
        evidencePath: joinManualEvidencePath(evidenceDir, 'windows-update-install.md'),
        notes:
          'Set all booleans to true only after Windows update install handoff was verified on a real Windows device, including UAC, installer exit, app relaunch, installed version, and rollback/failure behavior.'
      },
      divisionBoxDetachedWidget: {
        pluginFeatureSearchHit: false,
        detachedWindowOpened: false,
        pluginIdMatchesFeaturePlugin: false,
        expectedFeaturePluginId: '<feature-plugin-id>',
        observedSessionPluginId: '<observed-session-plugin-id>',
        detachedUrlSource: '<detached-url-source-plugin-id>',
        detachedUrlProviderSource: 'plugin-features',
        initialStateHydrated: false,
        detachedPayloadRestored: false,
        widgetSurfaceRendered: false,
        originalQueryPreserved: false,
        noFallbackSearchMismatch: false,
        evidencePath: joinManualEvidencePath(evidenceDir, 'division-box-detached-widget.md'),
        notes:
          'Set all booleans to true only after detaching a plugin widget feature on a real device and confirming the DivisionBox session uses the real feature pluginId, detached URL source equals the pluginId, providerSource remains plugin-features, initialState.detachedPayload hydrates before first render, the widget surface restores for the original query, and no unrelated search result fallback occurs.'
      },
      timeAwareRecommendation: {
        emptyQueryRecommendationsShown: false,
        morningRecommendationCaptured: false,
        morningTimeSlot: '<morning-time-slot>',
        morningTopItemId: '<morning-top-item-id>',
        morningTopSourceId: '<morning-top-source-id>',
        afternoonRecommendationCaptured: false,
        afternoonTimeSlot: '<afternoon-time-slot>',
        afternoonTopItemId: '<afternoon-top-item-id>',
        afternoonTopSourceId: '<afternoon-top-source-id>',
        dayOfWeek: -1,
        topRecommendationDiffersByTimeSlot: false,
        frequencySignalRetained: false,
        frequentComparisonItemId: '<frequent-comparison-item-id>',
        frequentComparisonSourceId: '<frequent-comparison-source-id>',
        timeSlotCacheSeparated: false,
        evidencePath: joinManualEvidencePath(evidenceDir, 'time-aware-recommendation.md'),
        notes:
          'Set all booleans to true only after capturing empty-query recommendations on a real Windows device for at least two time slots, filling morning/afternoon timeSlot, dayOfWeek, top item/source IDs, confirming the top recommendation changes with time context while frequent apps remain eligible and cached recommendations are not reused across timeSlot/dayOfWeek boundaries.'
      }
    }
  }
}

function buildSearchTraceStatsCommand(evidenceDir: string): string {
  return [
    'pnpm -C "apps/core-app" run search:trace:stats -- --input "<core-app-log-file>"',
    `--output "${joinEvidencePath(evidenceDir, 'search-trace-stats.json')}"`,
    `--minSamples ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.minSamples}`,
    `--maxFirstResultP95Ms ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.maxFirstResultP95Ms}`,
    `--maxSessionEndP95Ms ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.maxSessionEndP95Ms}`,
    `--maxSlowRatio ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.maxSlowRatio}`,
    '--strict'
  ].join(' ')
}

function buildSearchTraceVerifierCommand(): string {
  return [
    'pnpm -C "apps/core-app" run search:trace:verify -- --input "<search-trace-stats.json>"',
    `--minSamples ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.minSamples}`,
    `--maxFirstResultP95Ms ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.maxFirstResultP95Ms}`,
    `--maxSessionEndP95Ms ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.maxSessionEndP95Ms}`,
    `--maxSlowRatio ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.maxSlowRatio}`,
    '--strict'
  ].join(' ')
}

function buildClipboardStressVerifierCommand(): string {
  return [
    'pnpm -C "apps/core-app" run clipboard:stress:verify -- --input "<clipboard-stress-summary.json>"',
    `--minDurationMs ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.minDurationMs}`,
    `--requireIntervals ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.requireIntervals.join(',')}`,
    `--maxP95SchedulerDelayMs ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.maxP95SchedulerDelayMs}`,
    `--maxSchedulerDelayMs ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.maxSchedulerDelayMs}`,
    `--maxRealtimeQueuedPeak ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.maxRealtimeQueuedPeak}`,
    `--maxDroppedCount ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.maxDroppedCount}`,
    '--strict'
  ].join(' ')
}

function buildClipboardStressCommand(evidenceDir: string): string {
  return [
    'pnpm -C "apps/core-app" run clipboard:stress --',
    `--durationMs ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.minDurationMs}`,
    `--intervals ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.requireIntervals.join(',')}`,
    `--output "${joinEvidencePath(evidenceDir, 'clipboard-stress-summary.json')}"`
  ].join(' ')
}

interface ManualEvidenceTemplate {
  evidencePath: string
  content: string
}

function resolveEvidenceBaseDir(options: CliOptions): string {
  return options.output ? path.dirname(path.resolve(options.output)) : process.cwd()
}

function resolveEvidencePath(evidencePath: string, baseDir: string): string {
  return path.isAbsolute(evidencePath) ? evidencePath : path.resolve(baseDir, evidencePath)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

async function writeFileIfMissing(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })

  try {
    await writeFile(filePath, content, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if (isNodeError(error) && error.code === 'EEXIST') return
    throw error
  }
}

function buildCommonAppLaunchTemplate(target: string): string {
  return `# Windows Common App Launch Evidence: ${target}

- Target: ${target}
- Captured at:
- Device:
- Windows version:
- Tuff build:
- Search query:
- Observed display name:
- Icon evidence:
- Observed launch target:
- CoreBox hidden evidence:
- Manifest field: manualChecks.commonAppLaunch.checks[target="${target}"]

## Required Checks

- [ ] Search result appears for the target app.
- [ ] Display name is correct.
- [ ] Icon is correct.
- [ ] Launch succeeds.
- [ ] CoreBox hides immediately after launch.

## Evidence

${renderWindowsAcceptanceManualEvidenceFields('commonAppLaunch')}
- Notes:
`
}

function buildCopiedAppPathTemplate(): string {
  return `# Copied App Path Index Evidence

- Captured at:
- Device:
- Windows version:
- Tuff build:
- Copied source:
- Normalized app path:
- Add-to-local-launch-area action:
- Local launch entry:
- App Index diagnostic evidence path:
- Search query after reindex:
- Indexed search result:
- Indexed result launch evidence:
- Manifest field: manualChecks.copiedAppPath

## Required Checks

- [ ] Copied source path or command line is recorded.
- [ ] Add-to-local-launch-area action is triggered from the copied app path.
- [ ] Local launch entry is created.
- [ ] Reindex completes.
- [ ] Search result appears after reindex.
- [ ] Launch succeeds from the indexed result.

## Evidence

${renderWindowsAcceptanceManualEvidenceFields('copiedAppPath')}
- Notes:
`
}

function buildUpdateInstallTemplate(): string {
  return `# Windows Update Install Evidence

- Captured at:
- Device:
- Windows version:
- Current Tuff build:
- Target Tuff version:
- Update diagnostic evidence path:
- Installer path:
- Installer mode:
- UAC prompt evidence:
- App exit evidence:
- Installer exit evidence:
- Installed version evidence:
- App relaunch evidence:
- Failure rollback evidence:
- Manifest field: manualChecks.updateInstall

## Required Checks

- [ ] UAC prompt was observed when required.
- [ ] Installer launched.
- [ ] App exited before install handoff.
- [ ] Installer exited.
- [ ] Installed version matches the target version.
- [ ] App relaunch succeeded after install.
- [ ] Failure rollback behavior was verified.

## Evidence

${renderWindowsAcceptanceManualEvidenceFields('updateInstall')}
- Notes:
`
}

function buildDivisionBoxDetachedWidgetTemplate(): string {
  return `# DivisionBox Detached Widget Evidence

- Captured at:
- Device:
- Windows version:
- Tuff build:
- Plugin:
- Feature:
- Feature pluginId:
- Observed session pluginId:
- Detached URL source:
- Detached URL providerSource:
- Manifest field: manualChecks.divisionBoxDetachedWidget

## Required Checks

- [ ] Plugin widget feature is searchable.
- [ ] Detached window opens.
- [ ] Session pluginId matches the real feature plugin.
- [ ] initialState is hydrated before first render.
- [ ] detachedPayload is restored.
- [ ] Widget surface renders successfully.
- [ ] Original query is preserved.
- [ ] No fallback search mismatch occurs.

## Evidence

${renderWindowsAcceptanceManualEvidenceFields('divisionBoxDetachedWidget')}
- Notes:
`
}

function buildTimeAwareRecommendationTemplate(): string {
  return `# Time-Aware Recommendation Evidence

- Captured at:
- Device:
- Windows version:
- Tuff build:
- Morning time slot:
- Morning top item/source:
- Afternoon time slot:
- Afternoon top item/source:
- dayOfWeek:
- Frequent comparison item/source:
- Manifest field: manualChecks.timeAwareRecommendation

## Required Checks

- [ ] Empty query recommendations are shown.
- [ ] Morning recommendation sample is captured.
- [ ] Afternoon recommendation sample is captured.
- [ ] Top recommendation differs by time slot.
- [ ] Frequency signal is retained for frequent apps.
- [ ] timeSlot/dayOfWeek cache separation is verified.

## Evidence

${renderWindowsAcceptanceManualEvidenceFields('timeAwareRecommendation')}
- Notes:
`
}

function buildManualEvidenceTemplates(
  manifest: WindowsAcceptanceManifest
): ManualEvidenceTemplate[] {
  const templates: ManualEvidenceTemplate[] = []

  for (const check of manifest.manualChecks?.commonAppLaunch?.checks ?? []) {
    if (!check.evidencePath) continue
    templates.push({
      evidencePath: check.evidencePath,
      content: buildCommonAppLaunchTemplate(check.target)
    })
  }

  const copiedAppPath = manifest.manualChecks?.copiedAppPath?.evidencePath
  if (copiedAppPath) {
    templates.push({
      evidencePath: copiedAppPath,
      content: buildCopiedAppPathTemplate()
    })
  }

  const updateInstallPath = manifest.manualChecks?.updateInstall?.evidencePath
  if (updateInstallPath) {
    templates.push({
      evidencePath: updateInstallPath,
      content: buildUpdateInstallTemplate()
    })
  }

  const divisionBoxPath = manifest.manualChecks?.divisionBoxDetachedWidget?.evidencePath
  if (divisionBoxPath) {
    templates.push({
      evidencePath: divisionBoxPath,
      content: buildDivisionBoxDetachedWidgetTemplate()
    })
  }

  const timeAwareRecommendationPath = manifest.manualChecks?.timeAwareRecommendation?.evidencePath
  if (timeAwareRecommendationPath) {
    templates.push({
      evidencePath: timeAwareRecommendationPath,
      content: buildTimeAwareRecommendationTemplate()
    })
  }

  return templates
}

function buildCollectionPlan(manifest: WindowsAcceptanceManifest): string {
  const lines = [
    '# Windows Acceptance Evidence Collection Plan',
    '',
    '## Scope',
    '',
    `- Manifest schema: ${manifest.schema}`,
    `- Platform: ${manifest.platform}`,
    `- Generated at: ${manifest.generatedAt}`,
    '',
    '## 1. Case Evidence',
    ''
  ]

  for (const testCase of manifest.cases) {
    lines.push(`### ${testCase.caseId}`, '')

    for (const evidence of testCase.evidence ?? []) {
      if (!evidence.path) continue
      lines.push(`- Evidence path: \`${evidence.path}\``)
      if (evidence.notes) {
        lines.push(`- Notes: ${evidence.notes}`)
      }
      const caseId = toWindowsRequiredCaseId(testCase.caseId)
      const collectionCommand = caseId ? buildCollectionCommand(caseId, evidence.path) : undefined
      if (collectionCommand) {
        lines.push('- Collect:')
        lines.push('')
        lines.push('```bash')
        lines.push(collectionCommand)
        lines.push('```')
      }
      if (evidence.verifierCommand) {
        lines.push('- Verify:')
        lines.push('')
        lines.push('```bash')
        lines.push(renderCollectionCommand(evidence.verifierCommand, evidence.path))
        lines.push('```')
      }
      lines.push('')
    }
  }

  lines.push('## 2. Performance Evidence', '')
  if (manifest.performance?.searchTraceStatsCommand) {
    lines.push(`- Search trace stats path: \`${manifest.performance.searchTraceStatsPath}\``)
    lines.push('')
    lines.push('```bash')
    lines.push(manifest.performance.searchTraceStatsCommand)
    lines.push('```')
    lines.push('')
  }
  if (manifest.performance?.searchTraceVerifierCommand) {
    const statsPath = manifest.performance.searchTraceStatsPath
    lines.push('```bash')
    lines.push(
      statsPath
        ? renderCollectionCommand(manifest.performance.searchTraceVerifierCommand, statsPath)
        : manifest.performance.searchTraceVerifierCommand
    )
    lines.push('```')
    lines.push('')
  }
  if (manifest.performance?.clipboardStressCommand) {
    lines.push(
      `- Clipboard stress summary path: \`${manifest.performance.clipboardStressSummaryPath}\``
    )
    lines.push('')
    lines.push('```bash')
    lines.push(manifest.performance.clipboardStressCommand)
    lines.push('```')
    lines.push('')
  }
  if (manifest.performance?.clipboardStressVerifierCommand) {
    const summaryPath = manifest.performance.clipboardStressSummaryPath
    lines.push('```bash')
    lines.push(
      summaryPath
        ? renderCollectionCommand(manifest.performance.clipboardStressVerifierCommand, summaryPath)
        : manifest.performance.clipboardStressVerifierCommand
    )
    lines.push('```')
    lines.push('')
  }

  lines.push('## 3. Manual Evidence', '')
  for (const check of manifest.manualChecks?.commonAppLaunch?.checks ?? []) {
    lines.push(`- Common app ${check.target}: \`${check.evidencePath}\``)
  }
  if (manifest.manualChecks?.copiedAppPath?.evidencePath) {
    lines.push(`- Copied app path: \`${manifest.manualChecks.copiedAppPath.evidencePath}\``)
  }
  if (manifest.manualChecks?.updateInstall?.evidencePath) {
    lines.push(`- Windows update install: \`${manifest.manualChecks.updateInstall.evidencePath}\``)
  }
  if (manifest.manualChecks?.divisionBoxDetachedWidget?.evidencePath) {
    lines.push(
      `- DivisionBox detached widget: \`${manifest.manualChecks.divisionBoxDetachedWidget.evidencePath}\``
    )
  }
  if (manifest.manualChecks?.timeAwareRecommendation?.evidencePath) {
    lines.push(
      `- Time-aware recommendation: \`${manifest.manualChecks.timeAwareRecommendation.evidencePath}\``
    )
  }

  lines.push('', '## 4. Final Gate', '', '```bash')
  lines.push(manifest.verification?.recommendedCommand ?? '')
  lines.push('```', '')

  return `${lines.join('\n').trimEnd()}\n`
}

function toWindowsRequiredCaseId(value: string): WindowsRequiredCaseId | null {
  return WINDOWS_REQUIRED_CASE_IDS.includes(value as WindowsRequiredCaseId)
    ? (value as WindowsRequiredCaseId)
    : null
}

function renderCollectionCommand(command: string, evidencePath: string): string {
  return command
    .replace(/"<capability-evidence\.json>"/g, `"${evidencePath}"`)
    .replace(/"<everything-evidence\.json>"/g, `"${evidencePath}"`)
    .replace(/"<app-index-evidence\.json>"/g, `"${evidencePath}"`)
    .replace(/"<update-evidence\.json>"/g, `"${evidencePath}"`)
    .replace(/"<search-trace-stats\.json>"/g, `"${evidencePath}"`)
    .replace(/"<clipboard-stress-summary\.json>"/g, `"${evidencePath}"`)
}

function buildCollectionCommand(
  caseId: WindowsRequiredCaseId,
  evidencePath: string
): string | undefined {
  if (!evidencePath.endsWith('-capability.json')) return undefined

  const command = [
    'pnpm -C "apps/core-app" run windows:capability:evidence --',
    '--target WeChat',
    '--target Codex',
    '--target "Apple Music"',
    `--output "${evidencePath}"`
  ]

  if (caseId === 'windows-tray-update-plugin-install-exit') {
    command.push('--installer "<downloaded-installer-path>"')
  }

  return command.join(' ')
}

async function writeCollectionPlan(
  manifest: WindowsAcceptanceManifest,
  options: CliOptions
): Promise<void> {
  const baseDir = resolveEvidenceBaseDir(options)
  const collectionPlanPath = resolveEvidencePath(
    joinEvidencePath(options.evidenceDir, 'WINDOWS_ACCEPTANCE_COLLECTION_PLAN.md'),
    baseDir
  )

  await writeFileIfMissing(collectionPlanPath, buildCollectionPlan(manifest))
}

async function writeManualEvidenceTemplates(
  manifest: WindowsAcceptanceManifest,
  options: CliOptions
): Promise<void> {
  const baseDir = resolveEvidenceBaseDir(options)
  const templates = buildManualEvidenceTemplates(manifest)

  for (const template of templates) {
    await writeFileIfMissing(
      resolveEvidencePath(template.evidencePath, baseDir),
      `${template.content.trimEnd()}\n`
    )
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const manifest = buildManifest(options)
  const output = `${JSON.stringify(manifest, null, options.pretty ? 2 : 0)}\n`

  if (options.output) {
    await mkdir(path.dirname(path.resolve(options.output)), { recursive: true })
    await writeFile(options.output, output, 'utf8')
  }

  if (options.writeManualEvidenceTemplates) {
    await writeManualEvidenceTemplates(manifest, options)
  }

  if (options.writeCollectionPlan) {
    await writeCollectionPlan(manifest, options)
  }

  process.stdout.write(output)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
