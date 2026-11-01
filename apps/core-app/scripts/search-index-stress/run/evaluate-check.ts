import type { CheckResult, ScenarioClass, SearchCheck } from '../types'
import type { Clock } from './clock'
import { sleepUntil } from './clock'
import type { SearchAnswer, SearchDriver } from './driver-types'
import { describeError, RunAbort, throwIfAborted } from './errors'
import { createMatcher, findRank } from './matching'
import type { RateLimiter } from './rate-limiter'

export interface PollPolicy {
  /** Wait between the starts of consecutive polls; the last value repeats. */
  backoffMs: readonly number[]
  /** Extra attempts after a driver error before the poll counts as failed. */
  retries: number
  retryDelayMs: number
}

export const DEFAULT_POLL_POLICY: PollPolicy = {
  backoffMs: [150, 300, 600, 1000],
  retries: 2,
  retryDelayMs: 200
}

export interface DriverHealthOptions {
  window: number
  minSamples: number
  maxErrorRatio: number
}

/** Counts driver calls over a sliding window and trips for good once too many of them failed. */
export class DriverHealth {
  private readonly ring: boolean[] = []
  private cursor = 0
  private errorsInWindow = 0
  private trippedWith: string | null = null
  attempts = 0
  errors = 0

  constructor(
    private readonly options: DriverHealthOptions = {
      window: 200,
      minSamples: 40,
      maxErrorRatio: 0.05
    }
  ) {}

  record(ok: boolean, detail?: string): void {
    this.attempts += 1
    if (!ok) this.errors += 1
    const failed = !ok
    if (this.ring.length < this.options.window) {
      this.ring.push(failed)
    } else {
      if (this.ring[this.cursor]) this.errorsInWindow -= 1
      this.ring[this.cursor] = failed
      this.cursor = (this.cursor + 1) % this.options.window
    }
    if (failed) this.errorsInWindow += 1
    if (this.trippedWith === null && this.ring.length >= this.options.minSamples) {
      if (this.errorsInWindow / this.ring.length > this.options.maxErrorRatio) {
        this.trippedWith = `${this.errorsInWindow} of the last ${this.ring.length} searches failed (last: ${detail ?? 'driver error'})`
      }
    }
  }

  /** The reason once tripped, else null. */
  get tripped(): string | null {
    return this.trippedWith
  }
}

export interface CheckEnv {
  driver: SearchDriver
  clock: Clock
  limiter: RateLimiter
  health: DriverHealth
  /** Every spelling of the corpus root the app may report. */
  corpusRoots: readonly string[]
  searchTimeoutMs: number
  policy?: PollPolicy
  signal?: AbortSignal
}

type Observation = { startedAt: number; endedAt: number } & (
  | { answer: SearchAnswer }
  | { answer: null; error: unknown }
)

async function observe(env: CheckEnv, policy: PollPolicy, query: string): Promise<Observation> {
  const startedAt = env.clock.now()
  let lastError: unknown = null
  for (let attempt = 0; attempt <= policy.retries; attempt += 1) {
    await env.limiter.acquire(env.signal)
    throwIfAborted(env.signal)
    try {
      const answer = await env.driver.search(query, {
        timeoutMs: env.searchTimeoutMs,
        signal: env.signal
      })
      env.health.record(true)
      return { startedAt, endedAt: env.clock.now(), answer }
    } catch (error) {
      throwIfAborted(env.signal)
      env.health.record(false, describeError(error))
      lastError = error
      if (env.health.tripped) throw new RunAbort('driver-unhealthy', env.health.tripped)
      if (attempt < policy.retries) await env.clock.sleep(policy.retryDelayMs, env.signal)
    }
  }
  return { startedAt, endedAt: env.clock.now(), answer: null, error: lastError }
}

/**
 * Evaluates one check. The clock starts at `stepsDoneAt + startAfterMs`; `latencyMs` is measured
 * from there to the moment an answer proved the check, so it includes that search's own time.
 * A poll that starts by the deadline may finish after it and still counts.
 */
export async function evaluateCheck(
  env: CheckEnv,
  scenario: { id: string; class: ScenarioClass },
  checkIndex: number,
  check: SearchCheck,
  stepsDoneAt: number
): Promise<CheckResult> {
  const { clock, signal } = env
  const policy = env.policy ?? DEFAULT_POLL_POLICY
  const matcher = createMatcher(check.target, env.corpusRoots)
  const checkStart = stepsDoneAt + (check.startAfterMs ?? 0)
  const deadlineAt = checkStart + check.deadlineMs

  // One object, so control-flow narrowing cannot pin these to their initial values across awaits.
  const state = {
    polls: 0,
    lastEndedAt: null as number | null,
    maxGap: 0,
    lastAnswer: null as SearchAnswer | null,
    lastRank: null as number | null,
    lastError: null as unknown,
    lastPollFailed: false
  }

  const poll = async (): Promise<Observation> => {
    const observation = await observe(env, policy, check.query)
    if (observation.answer) {
      state.polls += 1
      if (state.lastEndedAt !== null)
        state.maxGap = Math.max(state.maxGap, observation.endedAt - state.lastEndedAt)
      state.lastEndedAt = observation.endedAt
      state.lastAnswer = observation.answer
      state.lastRank = findRank(observation.answer.rows, matcher)
      state.lastPollFailed = false
    } else {
      state.lastError = observation.error
      state.lastPollFailed = true
    }
    return observation
  }

  const result = (
    outcome: CheckResult['outcome'],
    provedAt: number | null,
    detail?: string
  ): CheckResult => ({
    scenarioId: scenario.id,
    checkIndex,
    class: scenario.class,
    tier: check.tier,
    outcome,
    latencyMs: provedAt === null ? null : provedAt - checkStart,
    sinceStepsMs: provedAt === null ? null : provedAt - stepsDoneAt,
    polls: state.polls,
    rank: outcome === 'pass' && check.expect === 'absent' ? null : state.lastRank,
    resultCount: state.lastAnswer ? state.lastAnswer.rows.length : null,
    answerMs: state.lastAnswer ? state.lastAnswer.answerMs : null,
    ...(state.maxGap > 0 ? { maxPollGapMs: state.maxGap } : {}),
    ...(detail ? { detail } : {})
  })

  await sleepUntil(clock, checkStart, signal)
  throwIfAborted(signal)

  if (check.expect === 'absent') {
    const first = await poll()
    if (!first.answer)
      return result('error', null, `could not confirm absence: ${describeError(state.lastError)}`)
    if (state.lastRank !== null) {
      return result(
        'fail',
        null,
        `appeared at rank ${state.lastRank} on the first check, ${first.endedAt - checkStart} ms in`
      )
    }
    if (!first.answer.endSignalSeen)
      return result('error', null, 'the answer was cut at the timeout, absence cannot be confirmed')
    await sleepUntil(clock, deadlineAt, signal)
    throwIfAborted(signal)
    const second = await poll()
    if (!second.answer)
      return result(
        'error',
        null,
        `could not re-confirm absence: ${describeError(state.lastError)}`
      )
    if (state.lastRank !== null) {
      return result(
        'fail',
        null,
        `absent at first, then appeared at rank ${state.lastRank} ${second.endedAt - checkStart} ms in (late indexing)`
      )
    }
    if (!second.answer.endSignalSeen)
      return result('error', null, 'the re-check answer was cut at the timeout')
    return result('pass', second.endedAt)
  }

  for (let pollIndex = 0; ; pollIndex += 1) {
    const observation = await poll()
    if (observation.answer && state.lastRank !== null && state.lastRank <= check.topK)
      return result('pass', observation.endedAt)
    if (observation.startedAt >= deadlineAt || observation.endedAt >= deadlineAt) break
    const wait = policy.backoffMs[Math.min(pollIndex, policy.backoffMs.length - 1)]
    // The last poll lands exactly on the deadline instead of overshooting it.
    await sleepUntil(
      clock,
      Math.min(Math.max(observation.startedAt + wait, observation.endedAt), deadlineAt),
      signal
    )
    throwIfAborted(signal)
  }

  if (state.polls === 0)
    return result('error', null, `no search completed: ${describeError(state.lastError)}`)
  if (state.lastPollFailed)
    return result('error', null, `the last search failed: ${describeError(state.lastError)}`)
  const seen =
    state.lastRank === null
      ? 'not found'
      : `found at rank ${state.lastRank}, beyond top ${check.topK}`
  return result('fail', null, `${seen} within ${check.deadlineMs} ms (${state.polls} polls)`)
}
