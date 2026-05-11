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

export const WINDOWS_ACCEPTANCE_MANIFEST_SCHEMA = 'windows-acceptance-manifest/v1'

export const WINDOWS_REQUIRED_CASE_IDS = [
  'windows-everything-file-search',
  'windows-app-scan-uwp',
  'windows-third-party-app-launch',
  'windows-shortcut-launch-args',
  'windows-tray-update-plugin-install-exit'
] as const

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
  searchHit: boolean
  displayNameCorrect: boolean
  iconCorrect: boolean
  launchSucceeded: boolean
  coreBoxHiddenAfterLaunch: boolean
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
    searchTraceVerifierCommand?: string
    clipboardStressSummaryPath?: string
    clipboardStressVerifierCommand?: string
  }
  manualChecks?: {
    commonAppLaunch?: {
      targets: string[]
      passedTargets: string[]
      checks?: WindowsAcceptanceCommonAppLaunchCheck[]
    }
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

interface VerifierCommandRequirement {
  label: string
  fragments: string[]
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
  requireInstallMode: ['windows-installer-handoff'],
  requireUserConfirmation: true,
  requireUnattendedDisabled: true,
  requireMatchingAsset: true,
  requireChecksums: true,
  requireCaseIds: ['windows-tray-update-plugin-install-exit']
}

const WINDOWS_ACCEPTANCE_CASE_VERIFIER_COMMAND_REQUIREMENTS: Record<
  WindowsRequiredCaseId,
  VerifierCommandRequirement[]
> = {
  'windows-everything-file-search': [
    {
      label: 'Windows capability verifier command',
      fragments: [
        'windows:capability:verify',
        '--input',
        '--requireEverything',
        '--requireEverythingTargets',
        '--strict'
      ]
    },
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
  ],
  'windows-app-scan-uwp': [
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
    },
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
  ],
  'windows-third-party-app-launch': [
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
    },
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
  ],
  'windows-shortcut-launch-args': [
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
    },
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
  ],
  'windows-tray-update-plugin-install-exit': [
    {
      label: 'Windows capability verifier command',
      fragments: ['windows:capability:verify', '--input', '--requireInstallerHandoff', '--strict']
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
        '--requireInstallMode windows-installer-handoff',
        '--requireUserConfirmation',
        '--requireUnattendedDisabled',
        '--requireMatchingAsset',
        '--requireChecksums',
        '--requireCaseIds windows-tray-update-plugin-install-exit'
      ]
    }
  ]
}

const SEARCH_TRACE_VERIFIER_COMMAND_REQUIREMENT: VerifierCommandRequirement = {
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

const CLIPBOARD_STRESS_VERIFIER_COMMAND_REQUIREMENT: VerifierCommandRequirement = {
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

const ACCEPTANCE_RECOMMENDED_COMMAND_REQUIREMENT: VerifierCommandRequirement = {
  label: 'Windows acceptance recommended command',
  fragments: [
    'windows:acceptance:verify',
    '--input',
    '--strict',
    '--requireEvidencePath',
    '--requireExistingEvidenceFiles',
    '--requireEvidenceGatePassed',
    '--requireCaseEvidenceSchemas',
    '--requireVerifierCommand',
    '--requireVerifierCommandGateFlags',
    '--requireRecommendedCommandGateFlags',
    '--requireSearchTrace',
    '--requireClipboardStress',
    '--requireCommonAppLaunchDetails',
    '--requireCommonAppTargets',
    'WeChat',
    'Codex',
    'Apple Music'
  ]
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

function verifierCommandMatchesRequirement(
  command: string,
  requirement: VerifierCommandRequirement
): boolean {
  const normalizedCommand = normalizeVerifierCommand(command)
  return requirement.fragments.every((fragment) => normalizedCommand.includes(fragment))
}

function findMissingVerifierCommandRequirements(
  commands: string[],
  requirements: VerifierCommandRequirement[]
): string[] {
  return requirements.flatMap((requirement) =>
    commands.some((command) => verifierCommandMatchesRequirement(command, requirement))
      ? []
      : [requirement.label]
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

    if (check.searchHit !== true) {
      failures.push(`common app launch search hit missing: ${target}`)
    }
    if (check.displayNameCorrect !== true) {
      failures.push(`common app launch display name not verified: ${target}`)
    }
    if (check.iconCorrect !== true) {
      failures.push(`common app launch icon not verified: ${target}`)
    }
    if (check.launchSucceeded !== true) {
      failures.push(`common app launch did not succeed: ${target}`)
    }
    if (check.coreBoxHiddenAfterLaunch !== true) {
      failures.push(`common app launch did not hide CoreBox: ${target}`)
    }
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
      UPDATE_GATE_OPTIONS
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
    if (!manifest.performance?.searchTraceVerifierCommand) {
      failures.push('search trace verifier command is missing')
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
    if (!manifest.performance?.clipboardStressVerifierCommand) {
      failures.push('clipboard stress verifier command is missing')
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
