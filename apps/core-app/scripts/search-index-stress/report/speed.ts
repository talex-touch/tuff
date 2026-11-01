import type { Distribution } from '../eval-types'
import { censoredDistribution, distribution } from '../monitor/stats'
import { metricOf, type Prepared } from './results'

export const STEADY_PHASE = 'steady'

export interface IndexingStats {
  /** Created images whose searchability was decided: found plus never found. */
  decided: number
  found: number
  /** Hard present checks that never saw the file before their deadline; they count as infinite. */
  neverSearchable: number
  /** Soft present checks that missed: a fuzzy query can miss an indexed file, so these say nothing about speed. */
  softMissesExcluded: number
  /** Present checks that found the file, but below the requested rank: indexed, so not a speed problem. */
  rankMissesExcluded: number
  undecidedExcluded: number
  /** Time from the last file step to the file being found, over the ones found. */
  sinceStepsMs: Distribution
  /** Same, with `neverSearchable` as +Infinity; `Infinity` means the percentile is beyond the deadline. */
  censored: { p50: number; p95: number; p99: number }
  /** p95 of the longest gap between two answers of a passing check: how coarse the figures above are. */
  resolutionP95Ms: number | null
}

export function indexingStats(prepared: Prepared): IndexingStats {
  const found: number[] = []
  const gaps: number[] = []
  let never = 0
  let softMisses = 0
  let rankMisses = 0
  let undecided = 0
  for (const item of prepared.byClass.get('create-image') ?? []) {
    if (item.kind === 'present-pass') {
      const since = metricOf(item, 'sinceStepsMs')
      if (since === null) {
        undecided++
        continue
      }
      found.push(since)
      if (typeof item.r.maxPollGapMs === 'number') gaps.push(item.r.maxPollGapMs)
    } else if (item.kind === 'present-fail') {
      if (item.r.rank !== null) rankMisses++
      else if (item.r.tier === 'hard') never++
      else softMisses++
    } else if (item.kind === 'error') {
      undecided++
    }
  }
  const censored = censoredDistribution([...found, ...new Array<number>(never).fill(Infinity)])
  return {
    decided: found.length + never,
    found: found.length,
    neverSearchable: never,
    softMissesExcluded: softMisses,
    rankMissesExcluded: rankMisses,
    undecidedExcluded: undecided,
    sinceStepsMs: distribution(found),
    censored: { p50: censored.p50, p95: censored.p95, p99: censored.p99 },
    resolutionP95Ms: gaps.length > 0 ? distribution(gaps).p95 : null
  }
}

export interface AnswerStats {
  /** `steady` when checks carry a phase tag and some are `steady`; otherwise every phase is pooled. */
  scope: 'steady' | 'all'
  answerMs: Distribution
  /** One entry per phase tag, when checks carry any. */
  byPhase: Array<{ phase: string; answerMs: Distribution }>
}

export function answerStats(prepared: Prepared): AnswerStats {
  const answered = prepared.obs.filter((item) => metricOf(item, 'answerMs') !== null)
  const tagged = answered.filter((item) => item.r.phase !== undefined)
  const steady = answered.filter((item) => item.r.phase === STEADY_PHASE)
  const scope = steady.length > 0 ? 'steady' : 'all'
  const pooled = scope === 'steady' ? steady : answered

  const phases = new Map<string, number[]>()
  for (const item of tagged) {
    const list = phases.get(item.r.phase as string)
    const value = metricOf(item, 'answerMs') as number
    if (list) list.push(value)
    else phases.set(item.r.phase as string, [value])
  }
  return {
    scope,
    answerMs: distribution(pooled.map((item) => metricOf(item, 'answerMs') as number)),
    byPhase: [...phases.keys()]
      .sort()
      .map((phase) => ({ phase, answerMs: distribution(phases.get(phase) ?? []) }))
  }
}
