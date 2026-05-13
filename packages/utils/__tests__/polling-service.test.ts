import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PollingService } from '../common/utils/polling'

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
