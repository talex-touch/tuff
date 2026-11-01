import type { CheckResult, FsStep, Scenario } from '../types'
import type { Clock } from './clock'
import { describeError, RunAbort } from './errors'
import type { CheckEnv } from './evaluate-check'
import { evaluateCheck } from './evaluate-check'
import type { ResultsStore } from './results-store'

export interface ScenarioRunContext {
  clock: Clock
  fs: { run: (steps: readonly FsStep[], signal?: AbortSignal) => Promise<void> }
  checkEnv: CheckEnv
  store: ResultsStore
  /** The monitor phase a result belongs to is the one it finished in. */
  phase: () => string
}

function undecided(
  scenario: Scenario,
  index: number,
  outcome: 'error' | 'skipped',
  detail: string,
  phase: string
): CheckResult {
  const check = scenario.checks[index]
  return {
    scenarioId: scenario.id,
    checkIndex: index,
    class: scenario.class,
    tier: check.tier,
    outcome,
    latencyMs: null,
    sinceStepsMs: null,
    polls: 0,
    rank: null,
    resultCount: null,
    answerMs: null,
    detail,
    expect: check.expect,
    phase
  }
}

/**
 * Records the scenario as not run: its checks are `skipped` and later scenarios that require it
 * are blocked. `only` limits it to the checks that have no result yet.
 */
export function skipScenario(
  store: ResultsStore,
  scenario: Scenario,
  phase: string,
  reason: string,
  only?: ReadonlySet<number>
): void {
  scenario.checks.forEach((_, index) => {
    if (!only || only.has(index))
      store.appendCheck(undecided(scenario, index, 'skipped', reason, phase))
  })
  store.appendScenarioDone({
    scenarioId: scenario.id,
    stepsOk: false,
    stepsMs: null,
    totalMs: 0,
    error: reason
  })
}

/**
 * Applies the scenario's filesystem steps, then evaluates its checks side by side. Resolves with
 * whether the steps completed; only an abort of the run rejects.
 */
export async function runScenario(ctx: ScenarioRunContext, scenario: Scenario): Promise<boolean> {
  const { clock, store } = ctx
  const signal = ctx.checkEnv.signal
  const startedAt = clock.now()
  const interrupted = (cause: RunAbort): RunAbort => {
    store.appendEvent('scenario-interrupted', scenario.id)
    return cause
  }

  let stepsDoneAt: number
  try {
    await ctx.fs.run(scenario.steps, signal)
    stepsDoneAt = clock.now()
  } catch (error) {
    if (error instanceof RunAbort || signal?.aborted) {
      throw interrupted(error instanceof RunAbort ? error : new RunAbort('aborted', 'run aborted'))
    }
    const detail = `filesystem step failed: ${describeError(error)}`
    scenario.checks.forEach((_, index) =>
      store.appendCheck(undecided(scenario, index, 'error', detail, ctx.phase()))
    )
    store.appendScenarioDone({
      scenarioId: scenario.id,
      stepsOk: false,
      stepsMs: null,
      totalMs: clock.now() - startedAt,
      error: detail
    })
    return false
  }

  const settled = await Promise.allSettled(
    scenario.checks.map(async (check, index) => {
      const result = await evaluateCheck(ctx.checkEnv, scenario, index, check, stepsDoneAt)
      store.appendCheck({ ...result, expect: check.expect, phase: ctx.phase() })
    })
  )
  let abort: RunAbort | null = null
  for (const [index, outcome] of settled.entries()) {
    if (outcome.status === 'fulfilled') continue
    if (outcome.reason instanceof RunAbort) abort ??= outcome.reason
    else
      store.appendCheck(
        undecided(
          scenario,
          index,
          'error',
          `the check crashed: ${describeError(outcome.reason)}`,
          ctx.phase()
        )
      )
  }
  if (abort) throw interrupted(abort)

  store.appendScenarioDone({
    scenarioId: scenario.id,
    stepsOk: true,
    stepsMs: stepsDoneAt - startedAt,
    totalMs: clock.now() - startedAt
  })
  return true
}
