import type { ScenarioClass } from '../types'
import { truncate } from './format'
import type { Dims, Obs, Prepared } from './results'

export interface FailureRow {
  scenarioId: string
  checkIndex: number
  class: ScenarioClass
  tier: 'hard' | 'soft'
  outcome: 'fail' | 'error' | 'skipped'
  detail?: string
  dims: Dims
}

export interface FailureList {
  /** Checks matching, however many rows are kept. */
  total: number
  /** Distinct scenarios among them. */
  scenarios: number
  rows: FailureRow[]
  omitted: number
}

export interface Failures {
  /** Hard checks that gave a wrong answer. */
  hardFailed: FailureList
  /** Hard checks that could not be decided: driver error or skipped. */
  hardUndecided: FailureList
  /** A sample of soft misses; the per-class counts are in the class table. */
  softFailed: FailureList
}

export const FAILURE_ROW_CAPS = { hardFailed: 200, hardUndecided: 100, softFailed: 50 } as const

const DETAIL_MAX = 240

function row(item: Obs): FailureRow {
  const { r } = item
  return {
    scenarioId: r.scenarioId,
    checkIndex: r.checkIndex,
    class: r.class,
    tier: r.tier,
    outcome: r.outcome as FailureRow['outcome'],
    ...(r.detail ? { detail: truncate(r.detail, DETAIL_MAX) } : {}),
    dims: item.dims ?? {}
  }
}

function collect(prepared: Prepared, keep: (item: Obs) => boolean, cap: number): FailureList {
  const ids = new Set<string>()
  const rows: FailureRow[] = []
  let total = 0
  for (const item of prepared.obs) {
    if (!keep(item)) continue
    total++
    ids.add(item.r.scenarioId)
    if (rows.length < cap) rows.push(row(item))
  }
  return { total, scenarios: ids.size, rows, omitted: total - rows.length }
}

export function collectFailures(prepared: Prepared): Failures {
  return {
    hardFailed: collect(
      prepared,
      (item) => item.r.tier === 'hard' && item.r.outcome === 'fail',
      FAILURE_ROW_CAPS.hardFailed
    ),
    hardUndecided: collect(
      prepared,
      (item) =>
        item.r.tier === 'hard' && (item.r.outcome === 'error' || item.r.outcome === 'skipped'),
      FAILURE_ROW_CAPS.hardUndecided
    ),
    softFailed: collect(
      prepared,
      (item) => item.r.tier === 'soft' && item.r.outcome === 'fail',
      FAILURE_ROW_CAPS.softFailed
    )
  }
}

/** Distinct scenario ids of the rows, first seen first. */
export function scenarioIds(rows: readonly FailureRow[], max: number): string[] {
  const ids: string[] = []
  for (const failure of rows) {
    if (ids.length >= max) break
    if (!ids.includes(failure.scenarioId)) ids.push(failure.scenarioId)
  }
  return ids
}
