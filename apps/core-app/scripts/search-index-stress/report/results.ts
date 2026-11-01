import type { CheckResult, ScenarioClass } from '../types'

export type Dims = Record<string, string | number | boolean>

export const CLASS_ORDER: readonly ScenarioClass[] = [
  'search-app',
  'search-file',
  'search-image',
  'create-image',
  'change-image',
  'ignore-image',
  'search-created'
]

export type CheckKind =
  | 'present-pass'
  | 'absent-pass'
  | 'present-fail'
  | 'absent-fail'
  | 'error'
  | 'skipped'

export interface Obs {
  r: CheckResult
  kind: CheckKind
  dims: Dims | undefined
}

export interface Prepared {
  obs: Obs[]
  byClass: Map<ScenarioClass, Obs[]>
  /** Results repeated for the same scenario and check index; the last one is kept. */
  duplicates: number
  /** Results whose scenario has no entry in `dims`; they count everywhere except in the case comparison. */
  withoutDims: number
}

export type MetricKey = 'sinceStepsMs' | 'latencyMs' | 'answerMs'

// Fallback for results that do not carry `expect`: the wording `run/evaluate-check.ts` gives absent failures.
const ABSENT_DETAIL = /\babsen|appeared|late indexing/i

/** A passing check with a rank found its target; a passing check without one confirmed absence. */
export function expectOf(r: CheckResult): 'present' | 'absent' {
  if (r.expect) return r.expect
  if (r.outcome === 'pass') return r.rank === null ? 'absent' : 'present'
  return ABSENT_DETAIL.test(r.detail ?? '') ? 'absent' : 'present'
}

export function kindOf(r: CheckResult): CheckKind {
  if (r.outcome === 'error' || r.outcome === 'skipped') return r.outcome
  const prefix = expectOf(r)
  return `${prefix}-${r.outcome}` as CheckKind
}

export function classOfId(id: string): ScenarioClass | null {
  return CLASS_ORDER.find((cls) => id.startsWith(`${cls}-`)) ?? null
}

export function prepare(
  results: readonly CheckResult[],
  dims: Readonly<Record<string, Dims>>
): Prepared {
  const latest = new Map<string, CheckResult>()
  let duplicates = 0
  for (const r of results) {
    const key = `${r.scenarioId}#${r.checkIndex}`
    if (latest.has(key)) duplicates++
    latest.set(key, r)
  }
  const prepared: Prepared = { obs: [], byClass: new Map(), duplicates, withoutDims: 0 }
  for (const r of latest.values()) {
    const scenarioDims = dims[r.scenarioId]
    if (!scenarioDims) prepared.withoutDims++
    const obs: Obs = { r, kind: kindOf(r), dims: scenarioDims }
    prepared.obs.push(obs)
    const bucket = prepared.byClass.get(r.class)
    if (bucket) bucket.push(obs)
    else prepared.byClass.set(r.class, [obs])
  }
  return prepared
}

/** The value of `metric` for a check, or null when that check does not measure it. */
export function metricOf(obs: Obs, metric: MetricKey): number | null {
  const value = obs.r[metric]
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  if (metric === 'answerMs')
    return obs.kind === 'present-pass' || obs.kind === 'present-fail' ? value : null
  return obs.kind === 'present-pass' ? value : null
}

export function dimsLabel(dims: Dims | undefined): string {
  if (!dims) return ''
  return Object.entries(dims)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
}
