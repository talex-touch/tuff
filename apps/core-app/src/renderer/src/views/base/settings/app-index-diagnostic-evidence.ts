import type {
  AppIndexDiagnoseResult,
  AppIndexDiagnosticMatch,
  AppIndexDiagnosticStage,
  AppIndexReindexResult
} from '@talex-touch/utils/transport/events/types'

export const APP_INDEX_DIAGNOSTIC_STAGE_KEYS = [
  'precise',
  'phrase',
  'prefix',
  'fts',
  'ngram',
  'subsequence'
] as const

export type AppIndexDiagnosticStageKey = (typeof APP_INDEX_DIAGNOSTIC_STAGE_KEYS)[number]

export const APP_INDEX_DIAGNOSTIC_REGRESSION_CASE_IDS = [
  'windows-app-scan-uwp',
  'windows-third-party-app-launch'
] as const

export interface AppIndexDiagnosticEvidenceStage {
  ran: boolean
  targetHit: boolean
  reason?: string
  matchCount: number
  matches: AppIndexDiagnosticMatch[]
}

export interface AppIndexDiagnosticEvidencePayload {
  schemaVersion: 1
  kind: 'app-index-diagnostic-evidence'
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
    reusableCaseIds: typeof APP_INDEX_DIAGNOSTIC_REGRESSION_CASE_IDS
    suggestedEvidenceFields: {
      target: string
      query: string | null
      launchKind?: string
      launchTarget?: string
      bundleOrIdentity?: string
      matchedStages: AppIndexDiagnosticStageKey[]
      reindexStatus?: AppIndexReindexResult['status']
    }
  }
}

export function buildAppIndexDiagnosticEvidencePayload(options: {
  target: string
  query?: string | null
  diagnosis: AppIndexDiagnoseResult
  reindex?: AppIndexReindexResult | null
  createdAt?: string
}): AppIndexDiagnosticEvidencePayload {
  const inputTarget = options.target.trim()
  const inputQuery = options.query?.trim() || null
  const stages = buildEvidenceStages(options.diagnosis)
  const matchedStages = getMatchedStages(stages)

  return {
    schemaVersion: 1,
    kind: 'app-index-diagnostic-evidence',
    createdAt: options.createdAt || new Date().toISOString(),
    input: {
      target: inputTarget,
      query: inputQuery
    },
    diagnosis: {
      success: options.diagnosis.success,
      status: options.diagnosis.status,
      target: options.diagnosis.target,
      reason: options.diagnosis.reason,
      matchedStages
    },
    app: options.diagnosis.app,
    index: options.diagnosis.index,
    query: options.diagnosis.query,
    stages,
    reindex: summarizeReindexResult(options.reindex),
    manualRegression: {
      reusableCaseIds: APP_INDEX_DIAGNOSTIC_REGRESSION_CASE_IDS,
      suggestedEvidenceFields: {
        target: inputTarget,
        query: inputQuery,
        launchKind: options.diagnosis.app?.launchKind,
        launchTarget: options.diagnosis.app?.launchTarget,
        bundleOrIdentity: options.diagnosis.app?.bundleId || options.diagnosis.app?.appIdentity,
        matchedStages,
        reindexStatus: options.reindex?.status
      }
    }
  }
}

export function formatAppIndexDiagnosticEvidenceJson(
  payload: AppIndexDiagnosticEvidencePayload
): string {
  return JSON.stringify(payload, null, 2)
}

export function buildAppIndexDiagnosticEvidenceFilename(
  payload: AppIndexDiagnosticEvidencePayload
): string {
  const rawName = payload.app?.displayName || payload.app?.name || payload.input.target || 'app'
  const safeName = rawName
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const safeTimestamp = payload.createdAt.replace(/[:.]/g, '-')

  return `app-index-diagnostic-${safeName || 'app'}-${safeTimestamp}.json`
}

function buildEvidenceStages(
  diagnosis: AppIndexDiagnoseResult
): Record<AppIndexDiagnosticStageKey, AppIndexDiagnosticEvidenceStage> | undefined {
  if (!diagnosis.query) return undefined

  return APP_INDEX_DIAGNOSTIC_STAGE_KEYS.reduce(
    (result, stageKey) => {
      const stage = diagnosis.query?.stages[stageKey]
      result[stageKey] = summarizeStage(stage)
      return result
    },
    {} as Record<AppIndexDiagnosticStageKey, AppIndexDiagnosticEvidenceStage>
  )
}

function summarizeStage(
  stage: AppIndexDiagnosticStage | undefined
): AppIndexDiagnosticEvidenceStage {
  return {
    ran: stage?.ran === true,
    targetHit: stage?.targetHit === true,
    reason: stage?.reason,
    matchCount: stage?.matches.length ?? 0,
    matches: stage?.matches ?? []
  }
}

function getMatchedStages(
  stages: Record<AppIndexDiagnosticStageKey, AppIndexDiagnosticEvidenceStage> | undefined
): AppIndexDiagnosticStageKey[] {
  if (!stages) return []

  return APP_INDEX_DIAGNOSTIC_STAGE_KEYS.filter((stageKey) => stages[stageKey].targetHit)
}

function summarizeReindexResult(
  reindex: AppIndexReindexResult | null | undefined
): Omit<AppIndexReindexResult, 'diagnostic'> | undefined {
  if (!reindex) return undefined

  const { diagnostic: _diagnostic, ...summary } = reindex
  return summary
}
