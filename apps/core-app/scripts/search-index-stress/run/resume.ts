import type { Scenario, ScenarioPlan } from '../types'
import type { LoadedResults } from './results-store'
import type { ItemState } from './scheduler'

export interface InterruptedScenario {
  scenario: Scenario
  /** Check indexes with no result yet. */
  missing: Set<number>
}

export interface ResumePlan {
  /** Scenarios with a finished record: `ok` when their steps completed, else `failed`; dependents read this. */
  settled: Map<string, ItemState>
  /** Started and never finished, and their steps changed the corpus: recorded as skipped, not repeated. */
  interrupted: InterruptedScenario[]
  pending: Scenario[]
}

/** Sorts the plan into what an earlier segment finished, what it left half done, and what is still to run. */
export function planResume(
  plan: ScenarioPlan,
  loaded: Pick<LoadedResults, 'checks' | 'done' | 'events'>
): ResumePlan {
  const checked = new Map<string, Set<number>>()
  for (const result of loaded.checks) {
    const indexes = checked.get(result.scenarioId) ?? new Set<number>()
    indexes.add(result.checkIndex)
    checked.set(result.scenarioId, indexes)
  }
  const cutShort = new Set(
    loaded.events
      .filter((event) => event.event === 'scenario-interrupted' && event.detail)
      .map((event) => event.detail as string)
  )

  const resume: ResumePlan = { settled: new Map(), interrupted: [], pending: [] }
  for (const scenario of plan.scenarios) {
    const done = loaded.done.get(scenario.id)
    if (done) {
      resume.settled.set(scenario.id, done.stepsOk ? 'ok' : 'failed')
    } else if (
      (checked.has(scenario.id) || cutShort.has(scenario.id)) &&
      scenario.steps.length > 0
    ) {
      const have = checked.get(scenario.id) ?? new Set<number>()
      const missing = new Set(
        scenario.checks.map((_, index) => index).filter((index) => !have.has(index))
      )
      resume.interrupted.push({ scenario, missing })
      resume.settled.set(scenario.id, 'failed')
    } else {
      resume.pending.push(scenario)
    }
  }
  return resume
}
