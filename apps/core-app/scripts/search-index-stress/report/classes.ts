import type { Distribution } from '../eval-types'
import { distribution } from '../monitor/stats'
import type { CheckResult, ScenarioClass } from '../types'
import {
  CLASS_ORDER,
  classOfId,
  metricOf,
  type MetricKey,
  type Obs,
  type Prepared
} from './results'

export interface Tally {
  total: number
  pass: number
  fail: number
  error: number
  skipped: number
}

export interface ClassReport {
  class: ScenarioClass
  /** `null` when the inputs' plan did not list the class. */
  planned: number | null
  /** Scenarios with at least one check that actually ran. */
  executed: number
  /** Scenarios whose every check was skipped (a required scenario failed). */
  skippedOnly: number
  /** Scenarios the runner reported as never started. */
  notRun: number
  /** Planned scenarios that neither ran, were skipped nor were reported as not run. */
  unaccounted: number
  checks: number
  hard: Tally
  soft: Tally
  presentPass: number
  /** Present checks that were decided and missed; with `presentPass` they make the found rate. */
  presentFail: number
  absentPass: number
  absentFail: number
  /** Present checks that passed; absent checks measure a deadline, not a speed. */
  sinceStepsMs: Distribution
  latencyMs: Distribution
  /** Present checks that were answered, pass or fail. */
  answerMs: Distribution
  /** Longest gap between two answers of a passing present check: how coarse the latencies above are. */
  pollGapMs: Distribution
}

export const emptyTally = (): Tally => ({ total: 0, pass: 0, fail: 0, error: 0, skipped: 0 })

export function addOutcome(tally: Tally, outcome: CheckResult['outcome']): void {
  tally.total++
  tally[outcome]++
}

export function sumTallies(tallies: readonly Tally[]): Tally {
  const sum = emptyTally()
  for (const tally of tallies) {
    sum.total += tally.total
    sum.pass += tally.pass
    sum.fail += tally.fail
    sum.error += tally.error
    sum.skipped += tally.skipped
  }
  return sum
}

export const passRate = (tally: Tally): number => (tally.total === 0 ? 0 : tally.pass / tally.total)

function values(obs: readonly Obs[], metric: MetricKey): number[] {
  const out: number[] = []
  for (const item of obs) {
    const value = metricOf(item, metric)
    if (value !== null) out.push(value)
  }
  return out
}

function classReport(
  cls: ScenarioClass,
  obs: readonly Obs[],
  planned: number | null,
  notRun: number
): ClassReport {
  const hard = emptyTally()
  const soft = emptyTally()
  const ran = new Map<string, boolean>()
  let presentPass = 0
  let presentFail = 0
  let absentPass = 0
  let absentFail = 0
  const gaps: number[] = []
  for (const item of obs) {
    addOutcome(item.r.tier === 'hard' ? hard : soft, item.r.outcome)
    ran.set(
      item.r.scenarioId,
      (ran.get(item.r.scenarioId) ?? false) || item.r.outcome !== 'skipped'
    )
    if (item.kind === 'present-pass') {
      presentPass++
      if (typeof item.r.maxPollGapMs === 'number') gaps.push(item.r.maxPollGapMs)
    } else if (item.kind === 'present-fail') {
      presentFail++
    } else if (item.kind === 'absent-pass') {
      absentPass++
    } else if (item.kind === 'absent-fail') {
      absentFail++
    }
  }
  let executed = 0
  for (const didRun of ran.values()) if (didRun) executed++
  const skippedOnly = ran.size - executed
  return {
    class: cls,
    planned,
    executed,
    skippedOnly,
    notRun,
    unaccounted: planned === null ? 0 : Math.max(0, planned - executed - skippedOnly - notRun),
    checks: obs.length,
    hard,
    soft,
    presentPass,
    presentFail,
    absentPass,
    absentFail,
    sinceStepsMs: distribution(values(obs, 'sinceStepsMs')),
    latencyMs: distribution(values(obs, 'latencyMs')),
    answerMs: distribution(values(obs, 'answerMs')),
    pollGapMs: distribution(gaps)
  }
}

export function buildClassReports(
  prepared: Prepared,
  planned: Partial<Record<ScenarioClass, number>>,
  notRun: readonly string[]
): ClassReport[] {
  const notRunByClass = new Map<ScenarioClass, number>()
  for (const id of notRun) {
    const cls = classOfId(id)
    if (cls) notRunByClass.set(cls, (notRunByClass.get(cls) ?? 0) + 1)
  }
  const reports: ClassReport[] = []
  for (const cls of CLASS_ORDER) {
    const obs = prepared.byClass.get(cls) ?? []
    const plan = planned[cls]
    const missed = notRunByClass.get(cls) ?? 0
    if (obs.length === 0 && plan === undefined && missed === 0) continue
    reports.push(classReport(cls, obs, plan ?? null, missed))
  }
  return reports
}
