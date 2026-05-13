import {
  SEARCH_TRACE_STATS_SCHEMA,
  evaluateSearchTracePerformance
} from '../box-tool/search-engine/search-trace-stats'
import type { SearchTracePerformanceSummary } from '../box-tool/search-engine/search-trace-stats'
import {
  APP_INDEX_DIAGNOSTIC_EVIDENCE_KIND,
  APP_INDEX_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION,
  evaluateAppIndexDiagnosticEvidence
} from './app-index-diagnostic-verifier'
import type {
  AppIndexDiagnosticEvidencePayload,
  AppIndexDiagnosticGateOptions
} from './app-index-diagnostic-verifier'
import {
  CLIPBOARD_STRESS_SCHEMA,
  evaluateClipboardStressSummary
} from './clipboard-stress-verifier'
import type { ClipboardStressSummary } from './clipboard-stress-verifier'
import {
  EVERYTHING_DIAGNOSTIC_EVIDENCE_KIND,
  EVERYTHING_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION,
  evaluateEverythingDiagnosticEvidence
} from './everything-diagnostic-verifier'
import type {
  EverythingDiagnosticEvidencePayload,
  EverythingDiagnosticGateOptions
} from './everything-diagnostic-verifier'
import {
  UPDATE_DIAGNOSTIC_EVIDENCE_KIND,
  UPDATE_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION,
  evaluateUpdateDiagnosticEvidence
} from './update-diagnostic-verifier'
import type {
  UpdateDiagnosticEvidencePayload,
  UpdateDiagnosticGateOptions
} from './update-diagnostic-verifier'
import {
  WINDOWS_CAPABILITY_EVIDENCE_SCHEMA,
  evaluateWindowsCapabilityEvidence
} from './windows-capability-evidence'
import type {
  WindowsCapabilityEvidence,
  WindowsCapabilityGateOptions
} from './windows-capability-evidence'
import {
  ACCEPTANCE_RECOMMENDED_COMMAND_REQUIREMENT,
  CLIPBOARD_STRESS_COMMAND_REQUIREMENT,
  CLIPBOARD_STRESS_VERIFIER_COMMAND_REQUIREMENT,
  SEARCH_TRACE_STATS_COMMAND_REQUIREMENT,
  SEARCH_TRACE_VERIFIER_COMMAND_REQUIREMENT,
  WINDOWS_ACCEPTANCE_CASE_VERIFIER_COMMAND_REQUIREMENTS,
  WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE,
  WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE
} from './windows-acceptance-command-requirements'
import type {
  VerifierCommandRequirement,
  VerifierCommandRequirementGroup
} from './windows-acceptance-command-requirements'

export {
  WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE,
  WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE
} from './windows-acceptance-command-requirements'

export const WINDOWS_ACCEPTANCE_MANIFEST_SCHEMA = 'windows-acceptance-manifest/v1'

export const WINDOWS_REQUIRED_CASE_IDS = [
  'windows-everything-file-search',
  'windows-app-scan-uwp',
  'windows-copied-app-path-index',
  'windows-third-party-app-launch',
  'windows-shortcut-launch-args',
  'windows-tray-update-plugin-install-exit'
] as const

export type WindowsRequiredCaseId = (typeof WINDOWS_REQUIRED_CASE_IDS)[number]
export type WindowsAcceptanceCaseStatus = 'passed' | 'failed' | 'blocked' | 'skipped'
export type WindowsAcceptanceEvidenceSchemaKey =
  | 'windows-capability'
  | 'app-index-diagnostic'
  | 'everything-diagnostic'
  | 'update-diagnostic'
  | 'search-trace-stats'
  | 'clipboard-stress-summary'

export interface WindowsAcceptanceEvidenceRef {
  path?: string
  verifierCommand?: string
  notes?: string
}

export interface WindowsAcceptanceCase {
  caseId: string
  status: WindowsAcceptanceCaseStatus
  requiredForRelease: boolean
  evidence?: WindowsAcceptanceEvidenceRef[]
}

export interface WindowsAcceptanceCommonAppLaunchCheck {
  target: string
  searchQuery?: string
  searchHit: boolean
  displayNameCorrect: boolean
  observedDisplayName?: string
  iconCorrect: boolean
  iconEvidence?: string
  launchSucceeded: boolean
  observedLaunchTarget?: string
  coreBoxHiddenAfterLaunch: boolean
  coreBoxHiddenEvidence?: string
  evidencePath?: string
  notes?: string
}

export interface WindowsAcceptanceUpdateInstallManualCheck {
  updateDiagnosticEvidencePath?: string
  installerPath?: string
  installerMode?: string
  uacPromptObserved: boolean
  uacPromptEvidence?: string
  installerLaunched: boolean
  appExitedForInstall: boolean
  appExitEvidence?: string
  installerExited: boolean
  installerExitEvidence?: string
  installedVersionVerified: boolean
  installedVersionEvidence?: string
  appRelaunchSucceeded: boolean
  appRelaunchEvidence?: string
  failureRollbackVerified: boolean
  failureRollbackEvidence?: string
  evidencePath?: string
  notes?: string
}

export interface WindowsAcceptanceCopiedAppPathManualCheck {
  copiedPathCaptured: boolean
  copiedSource?: string
  normalizedAppPath?: string
  addToLocalLaunchAreaTriggered: boolean
  addToLocalLaunchAreaAction?: string
  localLaunchEntryCreated: boolean
  localLaunchEntryEvidence?: string
  reindexCompleted: boolean
  appIndexDiagnosticEvidencePath?: string
  searchHitAfterReindex: boolean
  searchQueryAfterReindex?: string
  indexedSearchResultEvidence?: string
  launchSucceededFromIndexedResult: boolean
  indexedResultLaunchEvidence?: string
  evidencePath?: string
  notes?: string
}

export interface WindowsAcceptanceDivisionBoxDetachedWidgetManualCheck {
  pluginFeatureSearchHit: boolean
  detachedWindowOpened: boolean
  pluginIdMatchesFeaturePlugin: boolean
  expectedFeaturePluginId?: string
  observedSessionPluginId?: string
  detachedUrlSource?: string
  detachedUrlProviderSource?: string
  initialStateHydrated: boolean
  detachedPayloadRestored: boolean
  widgetSurfaceRendered: boolean
  originalQueryPreserved: boolean
  noFallbackSearchMismatch: boolean
  evidencePath?: string
  notes?: string
}

export interface WindowsAcceptanceTimeAwareRecommendationManualCheck {
  emptyQueryRecommendationsShown: boolean
  morningRecommendationCaptured: boolean
  morningTimeSlot?: string
  morningTopItemId?: string
  morningTopSourceId?: string
  morningRecommendationSource?: string
  afternoonRecommendationCaptured: boolean
  afternoonTimeSlot?: string
  afternoonTopItemId?: string
  afternoonTopSourceId?: string
  afternoonRecommendationSource?: string
  dayOfWeek?: number
  topRecommendationDiffersByTimeSlot: boolean
  frequencySignalRetained: boolean
  frequentComparisonItemId?: string
  frequentComparisonSourceId?: string
  frequentComparisonRecommendationSource?: string
  timeSlotCacheSeparated: boolean
  evidencePath?: string
  notes?: string
}

export interface WindowsAcceptanceManifest {
  schema: typeof WINDOWS_ACCEPTANCE_MANIFEST_SCHEMA
  generatedAt: string
  platform: 'win32' | string
  verification?: {
    recommendedCommand?: string
  }
  cases: WindowsAcceptanceCase[]
  performance?: {
    searchTraceStatsPath?: string
    searchTraceStatsCommand?: string
    searchTraceVerifierCommand?: string
    clipboardStressSummaryPath?: string
    clipboardStressCommand?: string
    clipboardStressVerifierCommand?: string
  }
  manualChecks?: {
    commonAppLaunch?: {
      targets: string[]
      passedTargets: string[]
      checks?: WindowsAcceptanceCommonAppLaunchCheck[]
    }
    copiedAppPath?: WindowsAcceptanceCopiedAppPathManualCheck
    updateInstall?: WindowsAcceptanceUpdateInstallManualCheck
    divisionBoxDetachedWidget?: WindowsAcceptanceDivisionBoxDetachedWidgetManualCheck
    timeAwareRecommendation?: WindowsAcceptanceTimeAwareRecommendationManualCheck
  }
}

export interface WindowsAcceptanceGateOptions {
  strict?: boolean
  requireEvidencePath?: boolean
  requireVerifierCommand?: boolean
  requireVerifierCommandGateFlags?: boolean
  requireRecommendedCommandGateFlags?: boolean
  requireSearchTrace?: boolean
  requireClipboardStress?: boolean
  requireCommonAppTargets?: string[]
  requireCommonAppLaunchDetails?: boolean
  requireCopiedAppPathManualChecks?: boolean
  requireUpdateInstallManualChecks?: boolean
  requireDivisionBoxDetachedWidgetManualChecks?: boolean
  requireTimeAwareRecommendationManualChecks?: boolean
}

export interface WindowsAcceptanceGate {
  passed: boolean
  failures: string[]
  warnings: string[]
}

export interface WindowsAcceptanceVerifiedManifest extends WindowsAcceptanceManifest {
  gate: WindowsAcceptanceGate
}

export interface WindowsAcceptanceEvidenceValidationResult {
  schemaKey: WindowsAcceptanceEvidenceSchemaKey | null
  schemaMismatch: boolean
  embeddedGatePassed: boolean
  recomputedGatePassed: boolean
  gateFailures: string[]
}

export const WINDOWS_ACCEPTANCE_CASE_EVIDENCE_SCHEMA_BY_CASE_ID: Partial<
  Record<WindowsRequiredCaseId, WindowsAcceptanceEvidenceSchemaKey[]>
> = {
  'windows-everything-file-search': ['windows-capability', 'everything-diagnostic'],
  'windows-app-scan-uwp': ['windows-capability', 'app-index-diagnostic'],
  'windows-copied-app-path-index': ['windows-capability', 'app-index-diagnostic'],
  'windows-third-party-app-launch': ['windows-capability', 'app-index-diagnostic'],
  'windows-shortcut-launch-args': ['windows-capability', 'app-index-diagnostic'],
  'windows-tray-update-plugin-install-exit': ['windows-capability', 'update-diagnostic']
}

export const WINDOWS_ACCEPTANCE_EVIDENCE_SCHEMA_DESCRIPTIONS: Record<
  WindowsAcceptanceEvidenceSchemaKey,
  string
> = {
  'windows-capability': WINDOWS_CAPABILITY_EVIDENCE_SCHEMA,
  'app-index-diagnostic': `${APP_INDEX_DIAGNOSTIC_EVIDENCE_KIND}@${APP_INDEX_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION}`,
  'everything-diagnostic': `${EVERYTHING_DIAGNOSTIC_EVIDENCE_KIND}@${EVERYTHING_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION}`,
  'update-diagnostic': `${UPDATE_DIAGNOSTIC_EVIDENCE_KIND}@${UPDATE_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION}`,
  'search-trace-stats': SEARCH_TRACE_STATS_SCHEMA,
  'clipboard-stress-summary': CLIPBOARD_STRESS_SCHEMA
}

const WINDOWS_CAPABILITY_GATE_OPTIONS_BY_CASE_ID: Record<
  WindowsRequiredCaseId,
  WindowsCapabilityGateOptions
> = {
  'windows-everything-file-search': {
    strict: true,
    requireEverything: true,
    requireEverythingTargets: true
  },
  'windows-app-scan-uwp': {
    strict: true,
    requireTargets: true,
    requireUwp: true,
    requireRegistryFallback: true,
    requireShortcutMetadata: true
  },
  'windows-copied-app-path-index': {
    strict: true,
    requireTargets: true,
    requireRegistryFallback: true,
    requireShortcutMetadata: true
  },
  'windows-third-party-app-launch': {
    strict: true,
    requireTargets: true,
    requireRegistryFallback: true,
    requireShortcutMetadata: true
  },
  'windows-shortcut-launch-args': {
    strict: true,
    requireTargets: true,
    requireShortcutMetadata: true,
    requireShortcutArguments: true,
    requireShortcutWorkingDirectory: true
  },
  'windows-tray-update-plugin-install-exit': {
    strict: true,
    requireInstallerHandoff: true
  }
}

const APP_INDEX_GATE_OPTIONS_BY_CASE_ID: Partial<
  Record<WindowsRequiredCaseId, AppIndexDiagnosticGateOptions>
> = {
  'windows-app-scan-uwp': {
    requireSuccess: true,
    requireQueryHit: true,
    requireLaunchKind: ['uwp'],
    requireLaunchTarget: true,
    requireBundleOrIdentity: true,
    requireCleanDisplayName: true,
    requireIcon: true,
    requireReindex: true,
    requireCaseIds: ['windows-app-scan-uwp']
  },
  'windows-copied-app-path-index': {
    requireSuccess: true,
    requireQueryHit: true,
    requireLaunchKind: ['path', 'shortcut'],
    requireLaunchTarget: true,
    requireCleanDisplayName: true,
    requireIcon: true,
    requireManagedEntry: true,
    requireReindex: true,
    requireCaseIds: ['windows-copied-app-path-index']
  },
  'windows-third-party-app-launch': {
    requireSuccess: true,
    requireQueryHit: true,
    requireLaunchKind: ['path', 'shortcut', 'uwp'],
    requireLaunchTarget: true,
    requireCleanDisplayName: true,
    requireIcon: true,
    requireReindex: true,
    requireCaseIds: ['windows-third-party-app-launch']
  },
  'windows-shortcut-launch-args': {
    requireSuccess: true,
    requireQueryHit: true,
    requireLaunchKind: ['shortcut'],
    requireLaunchTarget: true,
    requireLaunchArgs: true,
    requireWorkingDirectory: true,
    requireCleanDisplayName: true,
    requireIcon: true,
    requireReindex: true,
    requireCaseIds: ['windows-shortcut-launch-args']
  }
}

const EVERYTHING_GATE_OPTIONS: EverythingDiagnosticGateOptions = {
  requireReady: true,
  requireEnabled: true,
  requireAvailable: true,
  requireHealthy: true,
  requireVersion: true,
  requireEsPath: true,
  requireFallbackChain: ['sdk-napi', 'cli'],
  requireCaseIds: ['windows-everything-file-search']
}

const UPDATE_GATE_OPTIONS: UpdateDiagnosticGateOptions = {
  requireAutoDownload: true,
  requireDownloadReady: true,
  requireReadyToInstall: true,
  requirePlatform: ['win32'],
  requireInstallMode: ['windows-installer-handoff', 'windows-auto-installer-handoff'],
  requireMatchingAsset: true,
  requireChecksums: true,
  requireCaseIds: ['windows-tray-update-plugin-install-exit']
}

function getUpdateGateOptionsForEvidence(evidence: unknown): UpdateDiagnosticGateOptions {
  if (!isRecord(evidence) || !isRecord(evidence.verdict)) {
    return UPDATE_GATE_OPTIONS
  }

  if (evidence.verdict.installMode === 'windows-auto-installer-handoff') {
    return {
      ...UPDATE_GATE_OPTIONS,
      requireAutoInstallEnabled: true,
      requireUnattendedEnabled: true,
      requireInstalledVersionMatchesTarget: true
    }
  }

  if (evidence.verdict.installMode === 'windows-installer-handoff') {
    return {
      ...UPDATE_GATE_OPTIONS,
      requireUserConfirmation: true,
      requireUnattendedDisabled: true
    }
  }

  return UPDATE_GATE_OPTIONS
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function hasEvidencePath(testCase: WindowsAcceptanceCase): boolean {
  return Boolean(testCase.evidence?.some((item) => item.path))
}

function hasVerifierCommand(testCase: WindowsAcceptanceCase): boolean {
  return Boolean(testCase.evidence?.some((item) => item.verifierCommand))
}

function normalizeVerifierCommand(command: string): string {
  return command.replace(/\s+/g, ' ').trim()
}

function isFilledManualField(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/^<[^<>]+>$/.test(trimmed)) return false
  return !/^(n\/a|na|none|todo|tbd|-|待补|无)$/i.test(trimmed)
}

function verifierCommandMatchesRequirement(
  command: string,
  requirement: VerifierCommandRequirement
): boolean {
  const normalizedCommand = normalizeVerifierCommand(command)
  return requirement.fragments.every((fragment) => normalizedCommand.includes(fragment))
}

function findMissingVerifierCommandRequirements(
  commands: string[],
  requirements: VerifierCommandRequirementGroup[]
): string[] {
  return requirements.flatMap((requirementGroup) =>
    requirementGroup.alternatives.some((requirement) =>
      commands.some((command) => verifierCommandMatchesRequirement(command, requirement))
    )
      ? []
      : [requirementGroup.label]
  )
}

function findMissingCaseVerifierCommandRequirements(testCase: WindowsAcceptanceCase): string[] {
  const requirements =
    WINDOWS_ACCEPTANCE_CASE_VERIFIER_COMMAND_REQUIREMENTS[testCase.caseId as WindowsRequiredCaseId]
  if (!requirements) return []

  const commands = (testCase.evidence ?? []).flatMap((item) =>
    item.verifierCommand ? [item.verifierCommand] : []
  )
  return findMissingVerifierCommandRequirements(commands, requirements)
}

function findCommonAppLaunchDetailFailures(
  manifest: WindowsAcceptanceManifest,
  requiredTargets: string[] = []
): string[] {
  const commonAppLaunch = manifest.manualChecks?.commonAppLaunch
  const targets = requiredTargets.length > 0 ? requiredTargets : (commonAppLaunch?.targets ?? [])
  const checksByTarget = new Map(
    (commonAppLaunch?.checks ?? []).map((check) => [check.target, check])
  )
  const failures: string[] = []

  for (const target of targets) {
    const check = checksByTarget.get(target)
    if (!check) {
      failures.push(`common app launch detail is missing: ${target}`)
      continue
    }

    if (!isFilledManualField(check.searchQuery)) {
      failures.push(`common app launch search query is missing: ${target}`)
    }
    if (check.searchHit !== true) {
      failures.push(`common app launch search hit missing: ${target}`)
    }
    if (check.displayNameCorrect !== true) {
      failures.push(`common app launch display name not verified: ${target}`)
    }
    if (!isFilledManualField(check.observedDisplayName)) {
      failures.push(`common app launch observed display name is missing: ${target}`)
    }
    if (check.iconCorrect !== true) {
      failures.push(`common app launch icon not verified: ${target}`)
    }
    if (!isFilledManualField(check.iconEvidence)) {
      failures.push(`common app launch icon evidence is missing: ${target}`)
    }
    if (check.launchSucceeded !== true) {
      failures.push(`common app launch did not succeed: ${target}`)
    }
    if (!isFilledManualField(check.observedLaunchTarget)) {
      failures.push(`common app launch observed launch target is missing: ${target}`)
    }
    if (check.coreBoxHiddenAfterLaunch !== true) {
      failures.push(`common app launch did not hide CoreBox: ${target}`)
    }
    if (!isFilledManualField(check.coreBoxHiddenEvidence)) {
      failures.push(`common app launch CoreBox hidden evidence is missing: ${target}`)
    }
    if (!isFilledManualField(check.evidencePath)) {
      failures.push(`common app launch evidence path is missing: ${target}`)
    }
  }

  return failures
}

function findCopiedAppPathManualCheckFailures(manifest: WindowsAcceptanceManifest): string[] {
  const check = manifest.manualChecks?.copiedAppPath
  if (!check) {
    return ['copied app path manual check is missing']
  }

  const requiredChecks: Array<[keyof WindowsAcceptanceCopiedAppPathManualCheck, string]> = [
    ['copiedPathCaptured', 'copied app path source was not captured'],
    [
      'addToLocalLaunchAreaTriggered',
      'copied app path add-to-local-launch-area action was not verified'
    ],
    ['localLaunchEntryCreated', 'copied app path local launch entry was not verified'],
    ['reindexCompleted', 'copied app path reindex was not verified'],
    ['searchHitAfterReindex', 'copied app path search hit after reindex was not verified'],
    [
      'launchSucceededFromIndexedResult',
      'copied app path launch from indexed result was not verified'
    ]
  ]

  const failures = requiredChecks.flatMap(([field, message]) =>
    check[field] === true ? [] : [message]
  )
  const requiredEvidence: Array<[keyof WindowsAcceptanceCopiedAppPathManualCheck, string]> = [
    ['copiedSource', 'copied app path copied source is missing'],
    ['normalizedAppPath', 'copied app path normalized app path is missing'],
    [
      'addToLocalLaunchAreaAction',
      'copied app path add-to-local-launch-area action evidence is missing'
    ],
    ['localLaunchEntryEvidence', 'copied app path local launch entry evidence is missing'],
    [
      'appIndexDiagnosticEvidencePath',
      'copied app path App Index diagnostic evidence path is missing'
    ],
    ['searchQueryAfterReindex', 'copied app path search query after reindex is missing'],
    ['indexedSearchResultEvidence', 'copied app path indexed search result evidence is missing'],
    ['indexedResultLaunchEvidence', 'copied app path indexed result launch evidence is missing']
  ]

  for (const [field, message] of requiredEvidence) {
    const value = check[field]
    if (!isFilledManualField(value)) {
      failures.push(message)
    }
  }
  if (!isFilledManualField(check.evidencePath)) {
    failures.push('copied app path manual evidence path is missing')
  }

  return failures
}

function findUpdateInstallManualCheckFailures(manifest: WindowsAcceptanceManifest): string[] {
  const check = manifest.manualChecks?.updateInstall
  if (!check) {
    return ['Windows update install manual check is missing']
  }

  const requiredChecks: Array<[keyof WindowsAcceptanceUpdateInstallManualCheck, string]> = [
    ['uacPromptObserved', 'Windows update UAC prompt was not verified'],
    ['installerLaunched', 'Windows update installer launch was not verified'],
    ['appExitedForInstall', 'Windows update app exit before install was not verified'],
    ['installerExited', 'Windows update installer exit was not verified'],
    ['installedVersionVerified', 'Windows update installed version was not verified'],
    ['appRelaunchSucceeded', 'Windows update app relaunch was not verified'],
    ['failureRollbackVerified', 'Windows update failure rollback was not verified']
  ]

  const failures = requiredChecks.flatMap(([field, message]) =>
    check[field] === true ? [] : [message]
  )
  const requiredEvidence: Array<[keyof WindowsAcceptanceUpdateInstallManualCheck, string]> = [
    ['updateDiagnosticEvidencePath', 'Windows update diagnostic evidence path is missing'],
    ['installerPath', 'Windows update installer path is missing'],
    ['installerMode', 'Windows update installer mode is missing'],
    ['uacPromptEvidence', 'Windows update UAC prompt evidence is missing'],
    ['appExitEvidence', 'Windows update app exit evidence is missing'],
    ['installerExitEvidence', 'Windows update installer exit evidence is missing'],
    ['installedVersionEvidence', 'Windows update installed version evidence is missing'],
    ['appRelaunchEvidence', 'Windows update app relaunch evidence is missing'],
    ['failureRollbackEvidence', 'Windows update failure rollback evidence is missing']
  ]

  for (const [field, message] of requiredEvidence) {
    const value = check[field]
    if (!isFilledManualField(value)) {
      failures.push(message)
    }
  }
  if (!isFilledManualField(check.evidencePath)) {
    failures.push('Windows update install manual evidence path is missing')
  }

  return failures
}

function findDivisionBoxDetachedWidgetManualCheckFailures(
  manifest: WindowsAcceptanceManifest
): string[] {
  const check = manifest.manualChecks?.divisionBoxDetachedWidget
  if (!check) {
    return ['DivisionBox detached widget manual check is missing']
  }

  const requiredChecks: Array<
    [keyof WindowsAcceptanceDivisionBoxDetachedWidgetManualCheck, string]
  > = [
    ['pluginFeatureSearchHit', 'DivisionBox detached widget plugin feature search hit missing'],
    ['detachedWindowOpened', 'DivisionBox detached widget window open was not verified'],
    [
      'pluginIdMatchesFeaturePlugin',
      'DivisionBox detached widget pluginId did not match feature plugin'
    ],
    [
      'initialStateHydrated',
      'DivisionBox detached widget initial state hydration was not verified'
    ],
    ['detachedPayloadRestored', 'DivisionBox detached widget payload restore was not verified'],
    ['widgetSurfaceRendered', 'DivisionBox detached widget surface render was not verified'],
    ['originalQueryPreserved', 'DivisionBox detached widget original query was not preserved'],
    [
      'noFallbackSearchMismatch',
      'DivisionBox detached widget fallback search mismatch was not ruled out'
    ]
  ]

  const failures = requiredChecks.flatMap(([field, message]) =>
    check[field] === true ? [] : [message]
  )
  const expectedFeaturePluginId = isFilledManualField(check.expectedFeaturePluginId)
    ? check.expectedFeaturePluginId.trim()
    : ''
  const observedSessionPluginId = isFilledManualField(check.observedSessionPluginId)
    ? check.observedSessionPluginId.trim()
    : ''
  const detachedUrlSource = isFilledManualField(check.detachedUrlSource)
    ? check.detachedUrlSource.trim()
    : ''
  const detachedUrlProviderSource = isFilledManualField(check.detachedUrlProviderSource)
    ? check.detachedUrlProviderSource.trim()
    : ''

  if (!expectedFeaturePluginId) {
    failures.push('DivisionBox detached widget expected feature pluginId is missing')
  }
  if (!observedSessionPluginId) {
    failures.push('DivisionBox detached widget observed session pluginId is missing')
  }
  if (expectedFeaturePluginId && observedSessionPluginId !== expectedFeaturePluginId) {
    failures.push('DivisionBox detached widget observed session pluginId does not match expected')
  }
  if (!detachedUrlSource) {
    failures.push('DivisionBox detached widget detached URL source pluginId is missing')
  }
  if (expectedFeaturePluginId && detachedUrlSource !== expectedFeaturePluginId) {
    failures.push(
      'DivisionBox detached widget detached URL source does not match expected pluginId'
    )
  }
  if (!detachedUrlProviderSource) {
    failures.push('DivisionBox detached widget detached URL providerSource is missing')
  }
  if (detachedUrlProviderSource && detachedUrlProviderSource !== 'plugin-features') {
    failures.push('DivisionBox detached widget detached URL providerSource is not plugin-features')
  }
  if (!isFilledManualField(check.evidencePath)) {
    failures.push('DivisionBox detached widget manual evidence path is missing')
  }

  return failures
}

function findTimeAwareRecommendationManualCheckFailures(
  manifest: WindowsAcceptanceManifest
): string[] {
  const check = manifest.manualChecks?.timeAwareRecommendation
  if (!check) {
    return ['time-aware recommendation manual check is missing']
  }

  const requiredChecks: Array<[keyof WindowsAcceptanceTimeAwareRecommendationManualCheck, string]> =
    [
      ['emptyQueryRecommendationsShown', 'time-aware recommendation empty query results missing'],
      [
        'morningRecommendationCaptured',
        'time-aware recommendation morning sample was not captured'
      ],
      [
        'afternoonRecommendationCaptured',
        'time-aware recommendation afternoon sample was not captured'
      ],
      [
        'topRecommendationDiffersByTimeSlot',
        'time-aware recommendation top result did not differ by time slot'
      ],
      ['frequencySignalRetained', 'time-aware recommendation frequency signal was not retained'],
      ['timeSlotCacheSeparated', 'time-aware recommendation cache separation was not verified']
    ]

  const failures = requiredChecks.flatMap(([field, message]) =>
    check[field] === true ? [] : [message]
  )
  const morningTimeSlot = isFilledManualField(check.morningTimeSlot)
    ? check.morningTimeSlot.trim()
    : ''
  const afternoonTimeSlot = isFilledManualField(check.afternoonTimeSlot)
    ? check.afternoonTimeSlot.trim()
    : ''
  const morningTopItemId = isFilledManualField(check.morningTopItemId)
    ? check.morningTopItemId.trim()
    : ''
  const morningTopSourceId = isFilledManualField(check.morningTopSourceId)
    ? check.morningTopSourceId.trim()
    : ''
  const afternoonTopItemId = isFilledManualField(check.afternoonTopItemId)
    ? check.afternoonTopItemId.trim()
    : ''
  const afternoonTopSourceId = isFilledManualField(check.afternoonTopSourceId)
    ? check.afternoonTopSourceId.trim()
    : ''
  const frequentComparisonItemId = isFilledManualField(check.frequentComparisonItemId)
    ? check.frequentComparisonItemId.trim()
    : ''
  const frequentComparisonSourceId = isFilledManualField(check.frequentComparisonSourceId)
    ? check.frequentComparisonSourceId.trim()
    : ''
  const morningRecommendationSource = isFilledManualField(check.morningRecommendationSource)
    ? check.morningRecommendationSource.trim()
    : ''
  const afternoonRecommendationSource = isFilledManualField(check.afternoonRecommendationSource)
    ? check.afternoonRecommendationSource.trim()
    : ''
  const frequentComparisonRecommendationSource = isFilledManualField(
    check.frequentComparisonRecommendationSource
  )
    ? check.frequentComparisonRecommendationSource.trim()
    : ''

  if (!morningTimeSlot) {
    failures.push('time-aware recommendation morning timeSlot is missing')
  }
  if (!afternoonTimeSlot) {
    failures.push('time-aware recommendation afternoon timeSlot is missing')
  }
  if (morningTimeSlot && afternoonTimeSlot && morningTimeSlot === afternoonTimeSlot) {
    failures.push('time-aware recommendation morning and afternoon timeSlot are identical')
  }
  if (!Number.isInteger(check.dayOfWeek) || check.dayOfWeek! < 0 || check.dayOfWeek! > 6) {
    failures.push('time-aware recommendation dayOfWeek is missing or invalid')
  }
  if (!morningTopItemId) {
    failures.push('time-aware recommendation morning top itemId is missing')
  }
  if (!morningTopSourceId) {
    failures.push('time-aware recommendation morning top sourceId is missing')
  }
  if (!afternoonTopItemId) {
    failures.push('time-aware recommendation afternoon top itemId is missing')
  }
  if (!afternoonTopSourceId) {
    failures.push('time-aware recommendation afternoon top sourceId is missing')
  }
  if (
    morningTopItemId &&
    morningTopSourceId &&
    afternoonTopItemId &&
    afternoonTopSourceId &&
    morningTopItemId === afternoonTopItemId &&
    morningTopSourceId === afternoonTopSourceId
  ) {
    failures.push(
      'time-aware recommendation morning and afternoon top recommendation are identical'
    )
  }
  if (!frequentComparisonItemId) {
    failures.push('time-aware recommendation frequent comparison itemId is missing')
  }
  if (!frequentComparisonSourceId) {
    failures.push('time-aware recommendation frequent comparison sourceId is missing')
  }
  if (!morningRecommendationSource) {
    failures.push('time-aware recommendation morning recommendation source is missing')
  } else if (morningRecommendationSource !== 'time-based') {
    failures.push('time-aware recommendation morning source is not time-based')
  }
  if (!afternoonRecommendationSource) {
    failures.push('time-aware recommendation afternoon recommendation source is missing')
  } else if (afternoonRecommendationSource !== 'time-based') {
    failures.push('time-aware recommendation afternoon source is not time-based')
  }
  if (!frequentComparisonRecommendationSource) {
    failures.push('time-aware recommendation frequent comparison source is missing')
  } else if (frequentComparisonRecommendationSource !== 'frequent') {
    failures.push('time-aware recommendation frequent comparison source is not frequent')
  }
  if (!isFilledManualField(check.evidencePath)) {
    failures.push('time-aware recommendation manual evidence path is missing')
  }

  return failures
}

export function getWindowsAcceptanceEvidenceSchemaKey(
  evidence: unknown
): WindowsAcceptanceEvidenceSchemaKey | null {
  if (!isRecord(evidence)) return null

  if (evidence.schema === WINDOWS_CAPABILITY_EVIDENCE_SCHEMA) {
    return 'windows-capability'
  }
  if (evidence.schema === SEARCH_TRACE_STATS_SCHEMA) {
    return 'search-trace-stats'
  }
  if (evidence.schema === CLIPBOARD_STRESS_SCHEMA) {
    return 'clipboard-stress-summary'
  }

  if (evidence.schemaVersion !== APP_INDEX_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION) {
    return null
  }
  if (evidence.kind === APP_INDEX_DIAGNOSTIC_EVIDENCE_KIND) {
    return 'app-index-diagnostic'
  }
  if (evidence.kind === EVERYTHING_DIAGNOSTIC_EVIDENCE_KIND) {
    return 'everything-diagnostic'
  }
  if (evidence.kind === UPDATE_DIAGNOSTIC_EVIDENCE_KIND) {
    return 'update-diagnostic'
  }

  return null
}

function hasEmbeddedPassedGate(evidence: unknown): boolean {
  if (!isRecord(evidence) || !isRecord(evidence.gate)) return false
  return evidence.gate.passed === true
}

function buildValidationResult(
  evidence: unknown,
  schemaKey: WindowsAcceptanceEvidenceSchemaKey | null,
  schemaMismatch: boolean,
  gateFailures: string[]
): WindowsAcceptanceEvidenceValidationResult {
  const embeddedGatePassed = hasEmbeddedPassedGate(evidence)
  const embeddedGateFailures = embeddedGatePassed ? [] : ['embedded evidence gate did not pass']
  const allGateFailures = [...embeddedGateFailures, ...gateFailures]

  return {
    schemaKey,
    schemaMismatch,
    embeddedGatePassed,
    recomputedGatePassed: gateFailures.length === 0,
    gateFailures: allGateFailures
  }
}

function evaluateWindowsAcceptanceCaseEvidenceGate(
  caseId: WindowsRequiredCaseId,
  schemaKey: WindowsAcceptanceEvidenceSchemaKey,
  evidence: unknown
): string[] {
  if (schemaKey === 'windows-capability') {
    return evaluateWindowsCapabilityEvidence(
      evidence as WindowsCapabilityEvidence,
      WINDOWS_CAPABILITY_GATE_OPTIONS_BY_CASE_ID[caseId]
    ).failures
  }

  if (schemaKey === 'app-index-diagnostic') {
    const options = APP_INDEX_GATE_OPTIONS_BY_CASE_ID[caseId]
    if (!options) return [`app-index diagnostic is not expected for ${caseId}`]
    return evaluateAppIndexDiagnosticEvidence(
      evidence as AppIndexDiagnosticEvidencePayload,
      options
    ).failures
  }

  if (schemaKey === 'everything-diagnostic') {
    return evaluateEverythingDiagnosticEvidence(
      evidence as EverythingDiagnosticEvidencePayload,
      EVERYTHING_GATE_OPTIONS
    ).failures
  }

  if (schemaKey === 'update-diagnostic') {
    return evaluateUpdateDiagnosticEvidence(
      evidence as UpdateDiagnosticEvidencePayload,
      getUpdateGateOptionsForEvidence(evidence)
    ).failures
  }

  return [`${schemaKey} evidence is not valid case evidence`]
}

export function validateWindowsAcceptanceCaseEvidence(
  caseId: string,
  evidence: unknown
): WindowsAcceptanceEvidenceValidationResult {
  const schemaKey = getWindowsAcceptanceEvidenceSchemaKey(evidence)
  const expectedSchemas =
    WINDOWS_ACCEPTANCE_CASE_EVIDENCE_SCHEMA_BY_CASE_ID[caseId as WindowsRequiredCaseId]

  if (!schemaKey || !expectedSchemas?.includes(schemaKey)) {
    return buildValidationResult(evidence, schemaKey, true, [])
  }

  const gateFailures = evaluateWindowsAcceptanceCaseEvidenceGate(
    caseId as WindowsRequiredCaseId,
    schemaKey,
    evidence
  )
  return buildValidationResult(evidence, schemaKey, false, gateFailures)
}

export function validateWindowsAcceptancePerformanceEvidence(
  expectedSchemaKey: 'search-trace-stats' | 'clipboard-stress-summary',
  evidence: unknown
): WindowsAcceptanceEvidenceValidationResult {
  const schemaKey = getWindowsAcceptanceEvidenceSchemaKey(evidence)
  if (schemaKey !== expectedSchemaKey) {
    return buildValidationResult(evidence, schemaKey, true, [])
  }

  const gateFailures =
    expectedSchemaKey === 'search-trace-stats'
      ? evaluateSearchTracePerformance(evidence as SearchTracePerformanceSummary, {
          strict: true,
          ...WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE
        }).failures
      : evaluateClipboardStressSummary(evidence as ClipboardStressSummary, {
          strict: true,
          ...WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE,
          requireIntervals: [...WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.requireIntervals]
        }).failures

  return buildValidationResult(evidence, schemaKey, false, gateFailures)
}

export function evaluateWindowsAcceptanceManifest(
  manifest: WindowsAcceptanceManifest,
  options: WindowsAcceptanceGateOptions = {}
): WindowsAcceptanceGate {
  const failures: string[] = []
  const warnings: string[] = []

  if (manifest.schema !== WINDOWS_ACCEPTANCE_MANIFEST_SCHEMA) {
    failures.push(`unsupported Windows acceptance manifest schema: ${String(manifest.schema)}`)
    return { passed: false, failures, warnings }
  }

  if (manifest.platform !== 'win32') {
    const message = `Windows acceptance manifest platform is not win32: ${manifest.platform}`
    if (options.strict) failures.push(message)
    else warnings.push(message)
  }

  if (options.requireRecommendedCommandGateFlags) {
    const recommendedCommand = manifest.verification?.recommendedCommand
    if (!recommendedCommand) {
      failures.push('Windows acceptance recommended command is missing')
    } else if (
      !verifierCommandMatchesRequirement(
        recommendedCommand,
        ACCEPTANCE_RECOMMENDED_COMMAND_REQUIREMENT
      )
    ) {
      failures.push('Windows acceptance recommended command is missing release gate flags')
    }
  }

  const caseMap = new Map(manifest.cases.map((testCase) => [testCase.caseId, testCase]))
  for (const caseId of WINDOWS_REQUIRED_CASE_IDS) {
    const testCase = caseMap.get(caseId)
    if (!testCase) {
      failures.push(`required Windows case is missing: ${caseId}`)
      continue
    }

    if (!testCase.requiredForRelease) {
      failures.push(`required Windows case is not marked requiredForRelease: ${caseId}`)
    }
    if (testCase.status !== 'passed') {
      failures.push(`required Windows case did not pass: ${caseId} (${testCase.status})`)
    }
    if (options.requireEvidencePath && !hasEvidencePath(testCase)) {
      failures.push(`required Windows case evidence path is missing: ${caseId}`)
    }
    if (options.requireVerifierCommand && !hasVerifierCommand(testCase)) {
      failures.push(`required Windows case verifier command is missing: ${caseId}`)
    }
    if (options.requireVerifierCommandGateFlags) {
      for (const label of findMissingCaseVerifierCommandRequirements(testCase)) {
        failures.push(`required Windows case ${label} is missing release gate flags: ${caseId}`)
      }
    }
  }

  if (options.requireSearchTrace) {
    if (!manifest.performance?.searchTraceStatsPath) {
      failures.push('search trace stats path is missing')
    }
    if (!manifest.performance?.searchTraceStatsCommand) {
      failures.push('search trace stats command is missing')
    }
    if (!manifest.performance?.searchTraceVerifierCommand) {
      failures.push('search trace verifier command is missing')
    }
    if (
      options.requireVerifierCommandGateFlags &&
      manifest.performance?.searchTraceStatsCommand &&
      !verifierCommandMatchesRequirement(
        manifest.performance.searchTraceStatsCommand,
        SEARCH_TRACE_STATS_COMMAND_REQUIREMENT
      )
    ) {
      failures.push('search trace stats command is missing release gate flags')
    }
    if (
      options.requireVerifierCommandGateFlags &&
      manifest.performance?.searchTraceVerifierCommand &&
      !verifierCommandMatchesRequirement(
        manifest.performance.searchTraceVerifierCommand,
        SEARCH_TRACE_VERIFIER_COMMAND_REQUIREMENT
      )
    ) {
      failures.push('search trace verifier command is missing release gate flags')
    }
  }

  if (options.requireClipboardStress) {
    if (!manifest.performance?.clipboardStressSummaryPath) {
      failures.push('clipboard stress summary path is missing')
    }
    if (!manifest.performance?.clipboardStressCommand) {
      failures.push('clipboard stress command is missing')
    }
    if (!manifest.performance?.clipboardStressVerifierCommand) {
      failures.push('clipboard stress verifier command is missing')
    }
    if (
      options.requireVerifierCommandGateFlags &&
      manifest.performance?.clipboardStressCommand &&
      !verifierCommandMatchesRequirement(
        manifest.performance.clipboardStressCommand,
        CLIPBOARD_STRESS_COMMAND_REQUIREMENT
      )
    ) {
      failures.push('clipboard stress command is missing release gate flags')
    }
    if (
      options.requireVerifierCommandGateFlags &&
      manifest.performance?.clipboardStressVerifierCommand &&
      !verifierCommandMatchesRequirement(
        manifest.performance.clipboardStressVerifierCommand,
        CLIPBOARD_STRESS_VERIFIER_COMMAND_REQUIREMENT
      )
    ) {
      failures.push('clipboard stress verifier command is missing release gate flags')
    }
  }

  if (options.requireCommonAppTargets?.length) {
    const passedTargets = new Set(manifest.manualChecks?.commonAppLaunch?.passedTargets ?? [])
    const missingTargets = options.requireCommonAppTargets.filter(
      (target) => !passedTargets.has(target)
    )
    if (missingTargets.length > 0) {
      failures.push(`common app launch targets missing: ${missingTargets.join(', ')}`)
    }
  }

  if (options.requireCommonAppLaunchDetails) {
    failures.push(...findCommonAppLaunchDetailFailures(manifest, options.requireCommonAppTargets))
  }

  if (options.requireCopiedAppPathManualChecks) {
    failures.push(...findCopiedAppPathManualCheckFailures(manifest))
  }

  if (options.requireUpdateInstallManualChecks) {
    failures.push(...findUpdateInstallManualCheckFailures(manifest))
  }

  if (options.requireDivisionBoxDetachedWidgetManualChecks) {
    failures.push(...findDivisionBoxDetachedWidgetManualCheckFailures(manifest))
  }

  if (options.requireTimeAwareRecommendationManualChecks) {
    failures.push(...findTimeAwareRecommendationManualCheckFailures(manifest))
  }

  return { passed: failures.length === 0, failures, warnings }
}

export function verifyWindowsAcceptanceManifest(
  manifest: WindowsAcceptanceManifest,
  options: WindowsAcceptanceGateOptions = {}
): WindowsAcceptanceVerifiedManifest {
  return {
    ...manifest,
    gate: evaluateWindowsAcceptanceManifest(manifest, options)
  }
}
