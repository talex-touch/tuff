import { describe, expect, it } from 'vitest'
import type { SearchCheck } from '../types'
import type { SearchAnswer, SearchDriver, SearchRow } from './driver-types'
import type { CheckEnv } from './evaluate-check'
import { DEFAULT_POLL_POLICY, DriverHealth, evaluateCheck } from './evaluate-check'
import { DriverError, RunAbort } from './errors'
import { createRateLimiter } from './rate-limiter'
import type { VirtualClock } from './test-support/virtual-clock'
import { createVirtualClock } from './test-support/virtual-clock'

const ROOT = '/Users/Shared/tuff-stress/r/corpus'
const scenario = { id: 'create-image-0123456789ab', class: 'create-image' as const }

const fileRow = (name: string, rel = name): SearchRow => ({
  id: `${ROOT}/${rel}`,
  kind: 'file',
  name,
  path: `${ROOT}/${rel}`,
  sourceId: 'file-provider',
  score: 1
})

type World = (query: string, startedAt: number, call: number) => SearchRow[] | Error | 'cut'

class FakeDriver implements SearchDriver {
  readonly calls: Array<{ query: string; at: number }> = []
  constructor(
    private readonly clock: VirtualClock,
    private readonly world: World,
    private readonly latencyMs = 40
  ) {}

  async search(
    query: string,
    options: { timeoutMs: number; signal?: AbortSignal }
  ): Promise<SearchAnswer> {
    const at = this.clock.now()
    this.calls.push({ query, at })
    await this.clock.sleep(this.latencyMs, options.signal)
    if (options.signal?.aborted) throw new Error('search cancelled')
    const outcome = this.world(query, at, this.calls.length)
    if (outcome instanceof Error) throw outcome
    return {
      rows: outcome === 'cut' ? [] : outcome,
      answerMs: this.latencyMs,
      endSignalSeen: outcome !== 'cut'
    }
  }
}

function setup(world: World, overrides: Partial<CheckEnv> = {}) {
  const clock = createVirtualClock()
  const driver = new FakeDriver(clock, world)
  const limiter = createRateLimiter(Number.POSITIVE_INFINITY, clock)
  const health = new DriverHealth()
  const env: CheckEnv = {
    driver,
    clock,
    limiter,
    health,
    corpusRoots: [ROOT],
    searchTimeoutMs: 8000,
    ...overrides
  }
  const t0 = clock.now()
  const offsets = (): number[] => driver.calls.map((call) => call.at - t0)
  return { clock, driver, limiter, health, env, t0, offsets }
}

const present = (extra: Partial<SearchCheck> = {}): SearchCheck => ({
  query: 'sunset',
  target: { kind: 'file', name: 'sunset.png', path: 'sunset.png' },
  expect: 'present',
  topK: 5,
  tier: 'hard',
  deadlineMs: 10_000,
  ...extra
})

const absent = (extra: Partial<SearchCheck> = {}): SearchCheck =>
  present({ expect: 'absent', deadlineMs: 2000, ...extra })

describe('present checks', () => {
  it('passes on the first poll when the file is already searchable', async () => {
    const t = setup(() => [fileRow('sunset.png')])
    const result = await t.clock.runUntil(evaluateCheck(t.env, scenario, 3, present(), t.t0))
    expect(result).toMatchObject({
      scenarioId: scenario.id,
      checkIndex: 3,
      class: 'create-image',
      tier: 'hard',
      outcome: 'pass',
      latencyMs: 40,
      sinceStepsMs: 40,
      polls: 1,
      rank: 1,
      resultCount: 1,
      answerMs: 40
    })
    expect(result.maxPollGapMs).toBeUndefined()
  })

  it('polls 150, 300, 600, 1000 ms apart and records the coarseness of the latency', async () => {
    const t = setup((_query, startedAt) =>
      startedAt - t.t0 >= 1200
        ? [fileRow('other.png'), fileRow('sunset.png')]
        : [fileRow('other.png')]
    )
    const result = await t.clock.runUntil(evaluateCheck(t.env, scenario, 0, present(), t.t0))
    expect(t.offsets()).toEqual([0, 150, 450, 1050, 2050])
    expect(result).toMatchObject({
      outcome: 'pass',
      polls: 5,
      rank: 2,
      latencyMs: 2090,
      sinceStepsMs: 2090,
      maxPollGapMs: 1000,
      resultCount: 2
    })
  })

  it('measures from stepsDoneAt + startAfterMs but reports sinceStepsMs from stepsDoneAt', async () => {
    const t = setup(() => [fileRow('sunset.png')])
    const result = await t.clock.runUntil(
      evaluateCheck(t.env, scenario, 0, present({ startAfterMs: 500 }), t.t0)
    )
    expect(t.offsets()).toEqual([500])
    expect(result).toMatchObject({ outcome: 'pass', latencyMs: 40, sinceStepsMs: 540 })
  })

  it('makes the final poll exactly on the deadline and then fails with the poll count', async () => {
    const t = setup(() => [fileRow('other.png')])
    const result = await t.clock.runUntil(
      evaluateCheck(t.env, scenario, 0, present({ deadlineMs: 1000 }), t.t0)
    )
    expect(t.offsets()).toEqual([0, 150, 450, 1000])
    expect(result).toMatchObject({
      outcome: 'fail',
      polls: 4,
      rank: null,
      latencyMs: null,
      sinceStepsMs: null,
      resultCount: 1
    })
    expect(result.detail).toBe('not found within 1000 ms (4 polls)')
  })

  it('counts a poll that starts by the deadline and finishes after it', async () => {
    const t = setup((_q, startedAt) => (startedAt - t.t0 >= 1000 ? [fileRow('sunset.png')] : []))
    const result = await t.clock.runUntil(
      evaluateCheck(t.env, scenario, 0, present({ deadlineMs: 1000 }), t.t0)
    )
    expect(result).toMatchObject({ outcome: 'pass', latencyMs: 1040 })
  })

  it('keeps polling while the target is beyond topK and passes once it ranks high enough', async () => {
    const crowd = Array.from({ length: 6 }, (_, i) => fileRow(`filler-${i}.png`))
    const t = setup((_q, startedAt) =>
      startedAt - t.t0 >= 300
        ? [fileRow('sunset.png'), ...crowd]
        : [...crowd, fileRow('sunset.png')]
    )
    const result = await t.clock.runUntil(
      evaluateCheck(t.env, scenario, 0, present({ topK: 3 }), t.t0)
    )
    expect(result).toMatchObject({ outcome: 'pass', rank: 1 })
    expect(result.polls).toBeGreaterThan(1)
  })

  it('fails with the rank it was stuck at when it never reaches topK', async () => {
    const crowd = Array.from({ length: 6 }, (_, i) => fileRow(`filler-${i}.png`))
    const t = setup(() => [...crowd, fileRow('sunset.png')])
    const result = await t.clock.runUntil(
      evaluateCheck(t.env, scenario, 0, present({ topK: 3, deadlineMs: 600 }), t.t0)
    )
    expect(result).toMatchObject({ outcome: 'fail', rank: 7 })
    expect(result.detail).toMatch(/found at rank 7, beyond top 3 within 600 ms/)
  })

  it('does not count a same-named file in another folder', async () => {
    const t = setup(() => [fileRow('sunset.png', 'real/sunset.png')])
    const result = await t.clock.runUntil(
      evaluateCheck(t.env, scenario, 0, present({ deadlineMs: 300 }), t.t0)
    )
    expect(result.outcome).toBe('fail')
  })

  it('goes through the rate limiter once per attempt', async () => {
    const t = setup(() => [])
    const limiter = createRateLimiter(2, t.clock)
    t.env.limiter = limiter
    await t.clock.runUntil(evaluateCheck(t.env, scenario, 0, present({ deadlineMs: 1500 }), t.t0))
    expect(limiter.issued).toBe(t.driver.calls.length)
    const gaps = t
      .offsets()
      .slice(1)
      .map((at, i) => at - t.offsets()[i])
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(500)
  })
})

describe('absent checks', () => {
  it('confirms absence now and again after the deadline', async () => {
    const t = setup(() => [fileRow('other.png')])
    const result = await t.clock.runUntil(evaluateCheck(t.env, scenario, 1, absent(), t.t0))
    expect(t.offsets()).toEqual([0, 2000])
    expect(result).toMatchObject({
      outcome: 'pass',
      polls: 2,
      rank: null,
      latencyMs: 2040,
      resultCount: 1
    })
  })

  it('fails at once when the target is already there', async () => {
    const t = setup(() => [fileRow('other.png'), fileRow('sunset.png')])
    const result = await t.clock.runUntil(evaluateCheck(t.env, scenario, 1, absent(), t.t0))
    expect(t.offsets()).toEqual([0])
    expect(result).toMatchObject({ outcome: 'fail', rank: 2, latencyMs: null })
    expect(result.detail).toMatch(/appeared at rank 2 on the first check/)
  })

  it('fails when the target shows up between the two confirmations (late indexing)', async () => {
    const t = setup((_q, startedAt) => (startedAt - t.t0 >= 1500 ? [fileRow('sunset.png')] : []))
    const result = await t.clock.runUntil(evaluateCheck(t.env, scenario, 1, absent(), t.t0))
    expect(result.outcome).toBe('fail')
    expect(result.detail).toMatch(/late indexing/)
  })

  it('is an error, not a pass, when the answer was cut before the end signal', async () => {
    const t = setup(() => 'cut')
    const result = await t.clock.runUntil(evaluateCheck(t.env, scenario, 1, absent(), t.t0))
    expect(result.outcome).toBe('error')
    expect(result.detail).toMatch(/absence cannot be confirmed/)
  })
})

describe('driver failures', () => {
  it('retries a failed search and passes when a retry answers', async () => {
    const t = setup((_q, _at, call) =>
      call <= 2 ? new DriverError('cdp', 'socket closed') : [fileRow('sunset.png')]
    )
    const result = await t.clock.runUntil(evaluateCheck(t.env, scenario, 0, present(), t.t0))
    expect(result.outcome).toBe('pass')
    expect(t.offsets()).toEqual([0, 240, 480])
    expect(t.health.attempts).toBe(3)
    expect(t.health.errors).toBe(2)
  })

  it('reports error, not fail, when no search ever completes', async () => {
    const t = setup(() => new DriverError('timeout', 'no answer'))
    const result = await t.clock.runUntil(
      evaluateCheck(t.env, scenario, 0, present({ deadlineMs: 500 }), t.t0)
    )
    expect(result).toMatchObject({ outcome: 'error', polls: 0, rank: null, resultCount: null })
    expect(result.detail).toMatch(/no search completed: no answer/)
  })

  it('reports error when the decisive last poll failed after earlier misses', async () => {
    const t = setup((_q, startedAt) =>
      startedAt - t.t0 >= 400 ? new DriverError('cdp', 'gone') : []
    )
    const result = await t.clock.runUntil(
      evaluateCheck(t.env, scenario, 0, present({ deadlineMs: 1000 }), t.t0)
    )
    expect(result.outcome).toBe('error')
    expect(result.detail).toMatch(/the last search failed: gone/)
  })

  it('aborts the run with driver-unhealthy once the error ratio trips', async () => {
    const health = new DriverHealth({ window: 10, minSamples: 5, maxErrorRatio: 0.05 })
    const t = setup(() => new DriverError('cdp', 'gone'), { health })
    const outcome = await t.clock
      .runUntil(evaluateCheck(t.env, scenario, 0, present(), t.t0))
      .catch((e) => e)
    expect(outcome).toBeInstanceOf(RunAbort)
    expect(outcome.reason).toBe('driver-unhealthy')
    expect(outcome.message).toMatch(/of the last 5 searches failed/)
  })

  it('throws an abort instead of recording a result when the run is stopped mid-wait', async () => {
    const controller = new AbortController()
    const t = setup(() => [], { signal: controller.signal })
    const pending = evaluateCheck(t.env, scenario, 0, present(), t.t0).catch((e) => e)
    await t.clock.advance(100)
    controller.abort()
    const outcome = await t.clock.runUntil(pending)
    expect(outcome).toBeInstanceOf(RunAbort)
    expect(outcome.reason).toBe('aborted')
  })

  it('treats a search cancelled by the abort as an abort, not as a driver failure', async () => {
    const controller = new AbortController()
    const t = setup(() => [], { signal: controller.signal })
    const pending = evaluateCheck(t.env, scenario, 0, present(), t.t0).catch((e) => e)
    await t.clock.advance(10)
    controller.abort()
    const outcome = await t.clock.runUntil(pending)
    expect(outcome).toBeInstanceOf(RunAbort)
    expect(t.health.errors).toBe(0)
  })
})

describe('DriverHealth', () => {
  it('stays quiet below the minimum sample count and trips for good above the ratio', () => {
    const health = new DriverHealth({ window: 20, minSamples: 10, maxErrorRatio: 0.05 })
    for (let i = 0; i < 5; i += 1) health.record(false, 'x')
    expect(health.tripped).toBeNull()
    for (let i = 0; i < 4; i += 1) health.record(true)
    expect(health.tripped).toBeNull()
    health.record(true)
    expect(health.tripped).toMatch(/5 of the last 10 searches failed/)
    for (let i = 0; i < 40; i += 1) health.record(true)
    expect(health.tripped).not.toBeNull()
  })

  it('forgets old errors as the window slides, so scattered failures never trip it', () => {
    const health = new DriverHealth({ window: 100, minSamples: 40, maxErrorRatio: 0.05 })
    for (let i = 0; i < 1000; i += 1) health.record(i % 25 !== 24)
    expect(health.errors).toBe(40)
    expect(health.tripped).toBeNull()
  })

  it('ships the documented defaults', () => {
    expect(DEFAULT_POLL_POLICY.backoffMs).toEqual([150, 300, 600, 1000])
  })
})
