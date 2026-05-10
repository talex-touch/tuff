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

  if (!evidence.diagnosis.success || evidence.diagnosis.status !== 'found') {
    const message = `diagnostic target was not found: ${evidence.diagnosis.reason || evidence.diagnosis.status}`
    if (options.requireSuccess) failures.push(message)
    else warnings.push(message)
  }

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

export function verifyAppIndexDiagnosticEvidence(
  evidence: AppIndexDiagnosticEvidencePayload,
  options: AppIndexDiagnosticGateOptions = {}
): AppIndexDiagnosticVerifiedEvidence {
  return {
    ...evidence,
    gate: evaluateAppIndexDiagnosticEvidence(evidence, options)
  }
}
