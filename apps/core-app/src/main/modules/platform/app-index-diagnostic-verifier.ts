import type {
  AppIndexDiagnosticMatch,
  AppIndexDiagnoseResult,
  AppIndexEntryLaunchKind,
  AppIndexReindexResult
} from '@talex-touch/utils/transport/events/types'

export const APP_INDEX_DIAGNOSTIC_EVIDENCE_KIND = 'app-index-diagnostic-evidence'
export const APP_INDEX_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION = 1

export type AppIndexDiagnosticStageKey =
  | 'precise'
  | 'phrase'
  | 'prefix'
  | 'fts'
  | 'ngram'
  | 'subsequence'

const APP_INDEX_DIAGNOSTIC_STAGE_KEYS: AppIndexDiagnosticStageKey[] = [
  'precise',
  'phrase',
  'prefix',
  'fts',
  'ngram',
  'subsequence'
]

const APP_INDEX_DIAGNOSTIC_STAGE_KEY_SET = new Set<string>(APP_INDEX_DIAGNOSTIC_STAGE_KEYS)

export interface AppIndexDiagnosticEvidenceStage {
  ran: boolean
  targetHit: boolean
  reason?: string
  matchCount: number
  matches: AppIndexDiagnosticMatch[]
}

export interface AppIndexDiagnosticEvidencePayload {
  schemaVersion: typeof APP_INDEX_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION
  kind: typeof APP_INDEX_DIAGNOSTIC_EVIDENCE_KIND
  createdAt: string
  input: {
    target: string
    query: string | null
  }
  diagnosis: {
    success: boolean
    status: AppIndexDiagnoseResult['status']
    target: string
    reason?: string
    matchedStages: AppIndexDiagnosticStageKey[]
  }
  app?: AppIndexDiagnoseResult['app']
  index?: AppIndexDiagnoseResult['index']
  query?: AppIndexDiagnoseResult['query']
  stages?: Record<AppIndexDiagnosticStageKey, AppIndexDiagnosticEvidenceStage>
  reindex?: Omit<AppIndexReindexResult, 'diagnostic'>
  manualRegression: {
    reusableCaseIds: readonly string[]
    suggestedEvidenceFields: {
      target: string
      query: string | null
      launchKind?: string
      launchTarget?: string
      launchArgs?: string
      workingDirectory?: string
      bundleOrIdentity?: string
      displayNameStatus?: string
      iconPresent?: boolean
      matchedStages: AppIndexDiagnosticStageKey[]
      reindexStatus?: AppIndexReindexResult['status']
    }
  }
}

export interface AppIndexDiagnosticGateOptions {
  requireSuccess?: boolean
  requireQueryHit?: boolean
  requireLaunchKind?: AppIndexEntryLaunchKind[]
  requireLaunchTarget?: boolean
  requireLaunchArgs?: boolean
  requireWorkingDirectory?: boolean
  requireBundleOrIdentity?: boolean
  requireCleanDisplayName?: boolean
  requireIcon?: boolean
  requireManagedEntry?: boolean
  requireReindex?: boolean
  requireCaseIds?: string[]
}

export interface AppIndexDiagnosticGate {
  passed: boolean
  failures: string[]
  warnings: string[]
}

export interface AppIndexDiagnosticVerifiedEvidence extends AppIndexDiagnosticEvidencePayload {
  gate: AppIndexDiagnosticGate
}

export function evaluateAppIndexDiagnosticEvidence(
  evidence: AppIndexDiagnosticEvidencePayload,
  options: AppIndexDiagnosticGateOptions = {}
): AppIndexDiagnosticGate {
  const failures: string[] = []
  const warnings: string[] = []

  if (
    evidence.schemaVersion !== APP_INDEX_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION ||
    evidence.kind !== APP_INDEX_DIAGNOSTIC_EVIDENCE_KIND
  ) {
    failures.push('unsupported app index diagnostic evidence schema')
    return { passed: false, failures, warnings }
  }

  if (!evidence.input.target) {
    failures.push('diagnostic target is missing')
  }

  const diagnosisClaimsFound = evidence.diagnosis.success || evidence.diagnosis.status === 'found'

  if (
    (diagnosisClaimsFound || options.requireSuccess) &&
    !sameText(evidence.input.target, evidence.diagnosis.target)
  ) {
    failures.push('diagnostic input target does not match diagnosis target')
  }

  if (!evidence.diagnosis.success || evidence.diagnosis.status !== 'found') {
    const message = `diagnostic target was not found: ${evidence.diagnosis.reason || evidence.diagnosis.status}`
    if (options.requireSuccess) failures.push(message)
    else warnings.push(message)
  }

  failures.push(...findStageConsistencyFailures(evidence, options))
  if (
    diagnosisClaimsFound ||
    evidence.app ||
    evidence.index ||
    evidence.stages ||
    evidence.reindex
  ) {
    failures.push(...findSuggestedFieldConsistencyFailures(evidence))
  }
  failures.push(...findReindexConsistencyFailures(evidence, options))

  if (options.requireQueryHit && evidence.diagnosis.matchedStages.length === 0) {
    failures.push('diagnostic query did not hit the target app')
  }

  if (options.requireLaunchKind?.length) {
    const launchKind = evidence.app?.launchKind
    if (!launchKind || !options.requireLaunchKind.includes(launchKind)) {
      failures.push(
        `diagnostic launchKind mismatch: expected ${options.requireLaunchKind.join(', ')}, got ${launchKind || 'missing'}`
      )
    }
  }

  if (options.requireLaunchTarget && !evidence.app?.launchTarget) {
    failures.push('diagnostic launchTarget is missing')
  }

  if (options.requireLaunchArgs && !evidence.app?.launchArgs) {
    failures.push('diagnostic launchArgs are missing')
  }

  if (options.requireWorkingDirectory && !evidence.app?.workingDirectory) {
    failures.push('diagnostic workingDirectory is missing')
  }

  if (options.requireBundleOrIdentity && !evidence.app?.bundleId && !evidence.app?.appIdentity) {
    failures.push('diagnostic bundleId/appIdentity is missing')
  }

  if (
    options.requireCleanDisplayName &&
    evidence.app?.displayNameStatus !== 'clean' &&
    evidence.app?.displayNameStatus !== 'fallback'
  ) {
    failures.push(
      `diagnostic displayName is not clean: ${evidence.app?.displayNameStatus || 'missing'}`
    )
  }

  if (options.requireIcon && evidence.app?.iconPresent !== true) {
    failures.push('diagnostic icon is missing')
  }

  if (options.requireManagedEntry) {
    if (evidence.app?.entrySource !== 'manual') {
      failures.push(
        `diagnostic managed entry source mismatch: expected manual, got ${evidence.app?.entrySource || 'missing'}`
      )
    }
    if (evidence.app?.entryEnabled !== true) {
      failures.push('diagnostic managed entry is not enabled')
    }
  }

  if (options.requireReindex && !evidence.reindex?.success) {
    failures.push(`diagnostic reindex did not succeed: ${evidence.reindex?.status || 'missing'}`)
  }

  const availableCaseIds = new Set(evidence.manualRegression.reusableCaseIds)
  const missingCaseIds =
    options.requireCaseIds?.filter((caseId) => !availableCaseIds.has(caseId as never)) ?? []
  if (missingCaseIds.length > 0) {
    failures.push(`diagnostic reusable case ids missing: ${missingCaseIds.join(', ')}`)
  }

  return { passed: failures.length === 0, failures, warnings }
}

function findStageConsistencyFailures(
  evidence: AppIndexDiagnosticEvidencePayload,
  options: AppIndexDiagnosticGateOptions
): string[] {
  const failures: string[] = []
  const matchedStages = normalizeStageList(evidence.diagnosis.matchedStages)
  const targetItemIds = new Set(
    [evidence.index?.itemId, ...(evidence.index?.itemIds ?? [])].filter(Boolean)
  )

  if (matchedStages.invalid.length > 0) {
    failures.push(`diagnostic matched stages are invalid: ${matchedStages.invalid.join(', ')}`)
  }

  if (!evidence.stages) {
    if (options.requireQueryHit && matchedStages.valid.length > 0) {
      failures.push('diagnostic query stage evidence is missing')
    }
    return failures
  }

  const targetHitStages: AppIndexDiagnosticStageKey[] = []
  for (const stageKey of APP_INDEX_DIAGNOSTIC_STAGE_KEYS) {
    const stage = evidence.stages[stageKey]
    if (!stage) continue

    const matches = Array.isArray(stage.matches) ? stage.matches : []
    if (!Number.isInteger(stage.matchCount) || stage.matchCount < 0) {
      failures.push(`diagnostic ${stageKey} matchCount is invalid`)
    } else if (stage.matchCount !== matches.length) {
      failures.push(
        `diagnostic ${stageKey} matchCount mismatch: expected ${matches.length}, got ${stage.matchCount}`
      )
    }

    if (!stage.ran && (stage.targetHit || stage.matchCount > 0 || matches.length > 0)) {
      failures.push(`diagnostic ${stageKey} has results without running`)
    }

    if (!stage.targetHit && (stage.matchCount > 0 || matches.length > 0)) {
      failures.push(`diagnostic ${stageKey} has matches without target hit`)
    }

    if (!stage.targetHit) continue

    targetHitStages.push(stageKey)
    if (stage.matchCount <= 0) {
      failures.push(`diagnostic ${stageKey} target hit has no matches`)
    }
    if (targetItemIds.size === 0) {
      failures.push(`diagnostic ${stageKey} target hit cannot be verified without target item ids`)
      continue
    }
    if (!matches.some((match) => targetItemIds.has(match.itemId))) {
      failures.push(`diagnostic ${stageKey} target hit does not include the target item id`)
    }
  }

  if (!sameStageList(targetHitStages, matchedStages.valid)) {
    failures.push(
      `diagnostic matchedStages do not match stage target hits: expected ${formatStageList(targetHitStages)}, got ${formatStageList(matchedStages.valid)}`
    )
  }

  if (options.requireQueryHit && targetHitStages.length === 0) {
    failures.push('diagnostic query stages did not hit the target app')
  }

  return failures
}

function findSuggestedFieldConsistencyFailures(
  evidence: AppIndexDiagnosticEvidencePayload
): string[] {
  const suggested = evidence.manualRegression.suggestedEvidenceFields
  const failures: string[] = []

  if (!sameText(suggested.target, evidence.input.target)) {
    failures.push('diagnostic suggested target does not match input target')
  }
  if (!sameNullableText(suggested.query, evidence.input.query)) {
    failures.push('diagnostic suggested query does not match input query')
  }
  if (!sameStageList(suggested.matchedStages, evidence.diagnosis.matchedStages)) {
    failures.push('diagnostic suggested matchedStages do not match diagnosis')
  }

  const app = evidence.app
  if (suggested.launchKind !== undefined && suggested.launchKind !== app?.launchKind) {
    failures.push('diagnostic suggested launchKind does not match app')
  }
  if (
    suggested.launchTarget !== undefined &&
    !sameText(suggested.launchTarget, app?.launchTarget)
  ) {
    failures.push('diagnostic suggested launchTarget does not match app')
  }
  if (suggested.launchArgs !== undefined && !sameText(suggested.launchArgs, app?.launchArgs)) {
    failures.push('diagnostic suggested launchArgs do not match app')
  }
  if (
    suggested.workingDirectory !== undefined &&
    !sameText(suggested.workingDirectory, app?.workingDirectory)
  ) {
    failures.push('diagnostic suggested workingDirectory does not match app')
  }
  if (
    suggested.displayNameStatus !== undefined &&
    suggested.displayNameStatus !== app?.displayNameStatus
  ) {
    failures.push('diagnostic suggested displayNameStatus does not match app')
  }
  if (suggested.iconPresent !== undefined && suggested.iconPresent !== app?.iconPresent) {
    failures.push('diagnostic suggested iconPresent does not match app')
  }
  if (
    suggested.bundleOrIdentity !== undefined &&
    suggested.bundleOrIdentity !== app?.bundleId &&
    suggested.bundleOrIdentity !== app?.appIdentity
  ) {
    failures.push('diagnostic suggested bundleOrIdentity does not match app')
  }
  if (
    suggested.reindexStatus !== undefined &&
    suggested.reindexStatus !== evidence.reindex?.status
  ) {
    failures.push('diagnostic suggested reindexStatus does not match reindex')
  }

  return failures
}

function findReindexConsistencyFailures(
  evidence: AppIndexDiagnosticEvidencePayload,
  options: AppIndexDiagnosticGateOptions
): string[] {
  if (!evidence.reindex?.success) return []

  const appEntityAliases = [
    evidence.app?.path,
    evidence.app?.launchTarget,
    evidence.app?.appIdentity,
    evidence.app?.bundleId
  ].filter((value): value is string => Boolean(value?.trim()))
  const aliases =
    evidence.app && appEntityAliases.length > 0
      ? appEntityAliases
      : [evidence.input.target, evidence.diagnosis.target].filter((value): value is string =>
          Boolean(value?.trim())
        )

  if (!evidence.reindex.path) {
    return options.requireReindex ? ['diagnostic reindex path is missing'] : []
  }
  if (!aliases.some((alias) => sameText(alias, evidence.reindex?.path))) {
    return ['diagnostic reindex path does not match target app']
  }

  return []
}

function normalizeStageList(stages: readonly string[] | undefined): {
  valid: AppIndexDiagnosticStageKey[]
  invalid: string[]
} {
  if (!Array.isArray(stages)) return { valid: [], invalid: [] }

  const valid: AppIndexDiagnosticStageKey[] = []
  const invalid: string[] = []
  for (const stage of stages) {
    if (APP_INDEX_DIAGNOSTIC_STAGE_KEY_SET.has(stage)) {
      valid.push(stage as AppIndexDiagnosticStageKey)
    } else {
      invalid.push(stage)
    }
  }
  return { valid, invalid }
}

function sameStageList(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined
): boolean {
  const leftStages = normalizeStageList(left).valid
  const rightStages = normalizeStageList(right).valid
  return (
    leftStages.length === rightStages.length &&
    leftStages.every((stage, index) => stage === rightStages[index])
  )
}

function formatStageList(stages: readonly string[]): string {
  return stages.length > 0 ? stages.join(', ') : 'none'
}

function sameText(left: string | null | undefined, right: string | null | undefined): boolean {
  return normalizeText(left) === normalizeText(right)
}

function sameNullableText(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  return left == null && right == null ? true : sameText(left, right)
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export function verifyAppIndexDiagnosticEvidence(
  evidence: AppIndexDiagnosticEvidencePayload,
  options: AppIndexDiagnosticGateOptions = {}
): AppIndexDiagnosticVerifiedEvidence {
  return {
    ...evidence,
    gate: evaluateAppIndexDiagnosticEvidence(evidence, options)
  }
}
