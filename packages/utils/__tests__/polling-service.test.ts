import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_POLLING_TASK_TIMEOUT_MS, PollingService } from '../common/utils/polling'

type PollingServiceTestAccess = {
  stop: (reason?: string) => void
  unregister: (id: string) => void
  clearGlobalPressure: (reason: string) => void
  tasks: Map<string, unknown>
  laneStates: Map<string, { queue: unknown[]; inFlight: number; pendingByDedupe: Map<string, unknown> }>
  taskStats: Map<string, Record<string, number>>
  taskInFlightCount: Map<string, number>
  activeTasks: Map<string, unknown>
  pressureStates: Map<string, unknown>
}

function getService(): PollingServiceTestAccess {
  return PollingService.getInstance() as unknown as PollingServiceTestAccess
}

function resetServiceState(): void {
  const service = getService()
  service.stop('test reset')
  for (const key of Array.from(service.tasks.keys())) {
    service.unregister(key)
  }
  for (const reason of Array.from(service.pressureStates.keys())) {
    service.clearGlobalPressure(reason)
  }
  for (const state of service.laneStates.values()) {
    state.queue.length = 0
    state.inFlight = 0
    state.pendingByDedupe.clear()
  }
  service.taskInFlightCount.clear()
  service.activeTasks.clear()
}

describe('PollingService lanes and backpressure', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetServiceState()
  })

  afterEach(() => {
    resetServiceState()
    vi.useRealTimers()
  })

  it('keeps realtime lane running while io lane has slow tasks', async () => {
    const service = PollingService.getInstance()
    let ioRuns = 0
    let realtimeRuns = 0

    service.register(
      'test.io.slow',
      async () => {
        ioRuns += 1
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 80)
        })
      },
      {
        interval: 10,
        unit: 'milliseconds',
        runImmediately: true,
        lane: 'io',
        maxInFlight: 1
      }
    )

    service.register(
      'test.realtime.fast',
      () => {
        realtimeRuns += 1
      },
      {
        interval: 10,
        unit: 'milliseconds',
        runImmediately: true,
        lane: 'realtime',
        maxInFlight: 1
      }
    )

    service.start()
    await vi.advanceTimersByTimeAsync(220)

    expect(ioRuns).toBeGreaterThan(0)
    expect(realtimeRuns).toBeGreaterThan(5)
  })

  it('applies latest_wins backpressure and records dropped executions', async () => {
    const service = PollingService.getInstance()
    let runs = 0

    service.register(
      'test.latest.wins',
      async () => {
        runs += 1
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 70)
        })
      },
      {
        interval: 10,
        unit: 'milliseconds',
        runImmediately: true,
        lane: 'critical',
        backpressure: 'latest_wins',
        dedupeKey: 'same-key',
        maxInFlight: 1
      }
    )

    service.start()
    await vi.advanceTimersByTimeAsync(260)

    const diagnostics = service.getDiagnostics()
    const task = diagnostics.recentTasks.find((item) => item.id === 'test.latest.wins')

    expect(runs).toBeLessThan(6)
    expect(task).toBeTruthy()
    expect((task?.droppedCount ?? 0) + (task?.coalescedCount ?? 0)).toBeGreaterThan(0)
  })

  it('keeps default registration on serial lane', async () => {
    const service = PollingService.getInstance()
    let runs = 0

    service.register(
      'test.serial.default',
      () => {
        runs += 1
      },
      {
        interval: 20,
        unit: 'milliseconds',
        runImmediately: true
      }
    )

    service.start()
    await vi.advanceTimersByTimeAsync(80)

    const diagnostics = service.getDiagnostics()
    const task = diagnostics.recentTasks.find((item) => item.id === 'test.serial.default')

    expect(runs).toBeGreaterThan(0)
    expect(task?.lane).toBe('serial')
  })

  it('applies global pressure multipliers and expires them from diagnostics', async () => {
    const service = PollingService.getInstance()
    let runs = 0

    service.register(
      'test.pressure.interval',
      () => {
        runs += 1
      },
      {
        interval: 10,
        unit: 'milliseconds',
        runImmediately: true,
        lane: 'io'
      }
    )

    service.setGlobalPressure({
      reason: 'unit-test-pressure',
      until: Date.now() + 45,
      laneMultipliers: { io: 5 },
      concurrencyCaps: { io: 1 }
    })

    service.start()
    await vi.advanceTimersByTimeAsync(35)

    expect(runs).toBe(1)
    expect(service.getDiagnostics().pressures).toEqual([
      expect.objectContaining({
        reason: 'unit-test-pressure',
        laneMultipliers: { io: 5 },
        concurrencyCaps: { io: 1 }
      })
    ])

    await vi.advanceTimersByTimeAsync(25)

    expect(runs).toBeGreaterThan(1)
    expect(service.getDiagnostics().pressures).toEqual([])
  })

  it('caps lane concurrency while pressure is active', async () => {
    const service = PollingService.getInstance()
    let peakInFlight = 0
    let currentInFlight = 0

    for (let index = 0; index < 3; index += 1) {
      service.register(
        `test.pressure.concurrent.${index}`,
        async () => {
          currentInFlight += 1
          peakInFlight = Math.max(peakInFlight, currentInFlight)
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 50)
          })
          currentInFlight -= 1
        },
        {
          interval: 10,
          unit: 'milliseconds',
          runImmediately: true,
          lane: 'io'
        }
      )
    }

    service.setGlobalPressure({
      reason: 'unit-test-concurrency-cap',
      until: Date.now() + 100,
      concurrencyCaps: { io: 1 }
    })
    service.start()

    await vi.advanceTimersByTimeAsync(25)
    expect(peakInFlight).toBe(1)

    service.clearGlobalPressure('unit-test-concurrency-cap')
    await vi.advanceTimersByTimeAsync(60)
    expect(peakInFlight).toBeGreaterThan(1)
  })
})

describe('polling task default timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetServiceState()
  })

  afterEach(() => {
    resetServiceState()
    vi.useRealTimers()
  })

  function registeredTimeout(id: string): number | undefined {
    const task = getService().tasks.get(id) as { timeoutMs?: number } | undefined
    return task?.timeoutMs
  }

  it('applies the default bound when timeoutMs is omitted', () => {
    PollingService.getInstance().register('test.timeout.default', () => {}, {
      interval: 10,
      unit: 'milliseconds',
    })

    // Asserted against a literal, not against the imported constant: comparing
    // the two would have been vacuous, since an omitted timeout used to store
    // `undefined` and the constant would be `undefined` too on any build that
    // lacks it.
    expect(DEFAULT_POLLING_TASK_TIMEOUT_MS).toBe(30_000)
    expect(registeredTimeout('test.timeout.default')).toBe(30_000)
  })

  it('treats null as an explicit opt-out', () => {
    PollingService.getInstance().register('test.timeout.null', () => {}, {
      interval: 10,
      unit: 'milliseconds',
      timeoutMs: null,
    })

    expect(registeredTimeout('test.timeout.null')).toBeUndefined()
  })

  it('treats a non-positive timeout as an opt-out rather than a 1ms budget', () => {
    PollingService.getInstance().register('test.timeout.zero', () => {}, {
      interval: 10,
      unit: 'milliseconds',
      timeoutMs: 0,
    })

    expect(registeredTimeout('test.timeout.zero')).toBeUndefined()
  })

  it('keeps an explicit positive timeout', () => {
    PollingService.getInstance().register('test.timeout.explicit', () => {}, {
      interval: 10,
      unit: 'milliseconds',
      timeoutMs: 2500,
    })

    expect(registeredTimeout('test.timeout.explicit')).toBe(2500)
  })

  it('releases the lane slot for a task that overruns the default bound', async () => {
    const service = PollingService.getInstance()
    let blockerRuns = 0
    let followerRuns = 0

    // Both land on the `serial` lane (concurrency 1) by default -- the exact
    // shape that let temp-file.cleanup park 12 tasks behind it.
    service.register(
      'test.timeout.blocker',
      async () => {
        blockerRuns += 1
        await new Promise<void>((resolve) => {
          setTimeout(resolve, DEFAULT_POLLING_TASK_TIMEOUT_MS * 3)
        })
      },
      { interval: 10, unit: 'milliseconds', runImmediately: true },
    )
    service.register('test.timeout.follower', () => {
      followerRuns += 1
    }, { interval: 10, unit: 'milliseconds', runImmediately: true })

    service.start()

    await vi.advanceTimersByTimeAsync(50)
    expect(blockerRuns).toBe(1)
    expect(followerRuns).toBe(0)

    await vi.advanceTimersByTimeAsync(DEFAULT_POLLING_TASK_TIMEOUT_MS)
    expect(followerRuns).toBeGreaterThan(0)
    expect(getService().taskStats.get('test.timeout.blocker')?.timeoutCount).toBe(1)
  })
})
