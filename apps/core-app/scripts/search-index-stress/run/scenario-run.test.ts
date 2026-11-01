import { describe, expect, it } from 'vitest'
import type { CheckResult, FsStep, Scenario, SearchCheck } from '../types'
import type { SearchAnswer, SearchDriver, SearchRow } from './driver-types'
import { DriverError, RunAbort } from './errors'
import { DriverHealth } from './evaluate-check'
import { createRateLimiter } from './rate-limiter'
import type { ResultsStore, ScenarioDoneRecord } from './results-store'
import { runScenario, skipScenario } from './scenario-run'
import { createVirtualClock } from './test-support/virtual-clock'

const ROOT = '/Users/Shared/tuff-stress/run/corpus'

function memoryStore() {
  const checks: CheckResult[] = []
  const done: Array<Omit<ScenarioDoneRecord, 'kind' | 'at'>> = []
  const events: Array<[string, string | undefined]> = []
  const store: ResultsStore = {
    appendCheck: (result) => void checks.push(result),
    appendScenarioDone: (record) => void done.push(record),
    appendEvent: (event, detail) => void events.push([event, detail]),
    close: () => undefined
  }
  return { store, checks, done, events }
}

const row = (name: string, filePath?: string): SearchRow => ({
  id: `${name}-id`,
  kind: 'file',
  name,
  sourceId: 'file-provider',
  score: 1,
  ...(filePath ? { path: filePath } : {})
})
const answer = (rows: SearchRow[]): SearchAnswer => ({ rows, answerMs: 12, endSignalSeen: true })

function present(name: string, extra: Partial<SearchCheck> = {}): SearchCheck {
  return {
    query: name,
    target: { kind: 'file', name, path: `images/${name}` },
    expect: 'present',
    topK: 10,
    tier: 'hard',
    deadlineMs: 2_000,
    ...extra
  }
}

function scenario(
  checks: SearchCheck[],
  steps: FsStep[] = [{ op: 'mkdir', path: 'images' }]
): Scenario {
  return { id: 'create-image-abc123', index: 0, class: 'create-image', dims: {}, steps, checks }
}

function rig(
  options: {
    driver?: SearchDriver
    fsRun?: (steps: readonly FsStep[], signal?: AbortSignal) => Promise<void>
    health?: DriverHealth
  } = {}
) {
  const clock = createVirtualClock()
  const controller = new AbortController()
  const memory = memoryStore()
  const searches: string[] = []
  const driver: SearchDriver = options.driver ?? {
    search: async (query) => {
      searches.push(query)
      return answer([row(query, `${ROOT}/images/${query}`)])
    }
  }
  const ctx = {
    clock,
    fs: { run: options.fsRun ?? (async () => undefined) },
    store: memory.store,
    phase: () => 'steady',
    checkEnv: {
      driver,
      clock,
      limiter: createRateLimiter(1_000, clock),
      health: options.health ?? new DriverHealth(),
      corpusRoots: [ROOT],
      searchTimeoutMs: 1_000,
      signal: controller.signal
    }
  }
  return { clock, controller, ctx, searches, ...memory }
}

describe('runScenario', () => {
  it('runs the steps, then every check, and records each result with its expectation and phase', async () => {
    const r = rig()
    const ok = await r.clock.runUntil(
      runScenario(r.ctx, scenario([present('a.png'), present('b.png')]))
    )

    expect(ok).toBe(true)
    expect(r.checks.map((c) => [c.checkIndex, c.outcome, c.expect, c.phase])).toEqual([
      [0, 'pass', 'present', 'steady'],
      [1, 'pass', 'present', 'steady']
    ])
    expect(r.done).toEqual([
      expect.objectContaining({ scenarioId: 'create-image-abc123', stepsOk: true })
    ])
    expect(r.events).toEqual([])
  })

  it('stamps the phase the check finished in', async () => {
    let phase = 'steady'
    const r = rig()
    r.ctx.phase = () => phase
    r.ctx.fs.run = async () => {
      phase = 'burst'
    }
    await r.clock.runUntil(runScenario(r.ctx, scenario([present('a.png')])))
    expect(r.checks[0].phase).toBe('burst')
  })

  it('records every check as an error and skips the searches when a step fails', async () => {
    const r = rig({
      fsRun: async () => {
        throw new Error('ENOSPC: no space left on device')
      }
    })
    const ok = await r.clock.runUntil(
      runScenario(r.ctx, scenario([present('a.png'), present('b.png')]))
    )

    expect(ok).toBe(false)
    expect(r.searches).toEqual([])
    expect(r.checks.every((c) => c.outcome === 'error' && c.detail?.includes('ENOSPC'))).toBe(true)
    expect(r.done[0]).toMatchObject({
      stepsOk: false,
      error: expect.stringContaining('filesystem step failed')
    })
  })

  it('turns a check that crashes into an error result without losing the others', async () => {
    const r = rig()
    const broken = { ...present('b.png'), target: null } as unknown as SearchCheck
    const ok = await r.clock.runUntil(runScenario(r.ctx, scenario([present('a.png'), broken])))

    expect(ok).toBe(true)
    expect(r.checks.find((c) => c.checkIndex === 0)?.outcome).toBe('pass')
    expect(r.checks.find((c) => c.checkIndex === 1)).toMatchObject({
      outcome: 'error',
      detail: expect.stringContaining('the check crashed')
    })
  })

  it('lets a driver that keeps failing end the run, and leaves a note that this scenario was cut short', async () => {
    const health = new DriverHealth({ window: 10, minSamples: 4, maxErrorRatio: 0.2 })
    const r = rig({
      health,
      driver: {
        search: async () => {
          throw new DriverError('cdp', 'socket closed')
        }
      }
    })

    const failure = await r.clock
      .runUntil(runScenario(r.ctx, scenario([present('a.png'), present('b.png')])))
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(RunAbort)
    expect((failure as RunAbort).reason).toBe('driver-unhealthy')
    expect(r.events).toEqual([['scenario-interrupted', 'create-image-abc123']])
    expect(r.done).toEqual([])
  })

  it('stops on the abort signal in the middle of the steps', async () => {
    const r = rig({
      fsRun: async (_steps, signal) => {
        await r.clock.sleep(1_000, signal)
        if (signal?.aborted) throw new RunAbort('aborted', 'run aborted')
      }
    })
    const running = runScenario(r.ctx, scenario([present('a.png')]))
    void r.clock.sleep(200).then(() => r.controller.abort())

    await expect(r.clock.runUntil(running)).rejects.toMatchObject({ reason: 'aborted' })
    expect(r.events).toEqual([['scenario-interrupted', 'create-image-abc123']])
    expect(r.searches).toEqual([])
  })

  it('keeps the results of checks that finished before the abort', async () => {
    const r = rig({
      driver: {
        search: async (query, { signal }) => {
          if (query === 'slow.png') {
            await r.clock.sleep(5_000, signal)
            throw new RunAbort('aborted', 'run aborted')
          }
          return answer([row(query, `${ROOT}/images/${query}`)])
        }
      }
    })
    const running = runScenario(r.ctx, scenario([present('fast.png'), present('slow.png')]))
    void r.clock.sleep(300).then(() => r.controller.abort())

    await expect(r.clock.runUntil(running)).rejects.toMatchObject({ reason: 'aborted' })
    expect(r.checks.map((c) => [c.checkIndex, c.outcome])).toEqual([[0, 'pass']])
  })
})

describe('skipScenario', () => {
  it('marks every check skipped with the reason and finishes the scenario as not ok', () => {
    const memory = memoryStore()
    skipScenario(
      memory.store,
      scenario([present('a.png'), present('b.png')]),
      'burst',
      'required scenario x did not complete its steps'
    )

    expect(memory.checks.map((c) => [c.outcome, c.detail, c.phase, c.expect])).toEqual([
      ['skipped', 'required scenario x did not complete its steps', 'burst', 'present'],
      ['skipped', 'required scenario x did not complete its steps', 'burst', 'present']
    ])
    expect(memory.done).toEqual([
      expect.objectContaining({
        stepsOk: false,
        error: 'required scenario x did not complete its steps'
      })
    ])
  })

  it('can limit itself to the checks that have no result yet', () => {
    const memory = memoryStore()
    skipScenario(
      memory.store,
      scenario([present('a.png'), present('b.png')]),
      'steady',
      'interrupted',
      new Set([1])
    )
    expect(memory.checks.map((c) => c.checkIndex)).toEqual([1])
  })
})
