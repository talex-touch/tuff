import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PollingService } from '../common/utils/polling'

type PollingServiceTestAccess = {
  stop: (reason?: string) => void
  unregister: (id: string) => void
  tasks: Map<string, unknown>
  laneStates: Map<string, { queue: unknown[]; inFlight: number }>
  taskStats: Map<string, Record<string, number>>
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

  it('keeps default registration on legacy_serial lane for compatibility', async () => {
    const service = PollingService.getInstance()
    let runs = 0

    service.register(
      'test.legacy.default',
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
    const task = diagnostics.recentTasks.find((item) => item.id === 'test.legacy.default')

    expect(runs).toBeGreaterThan(0)
    expect(task?.lane).toBe('legacy_serial')
  })
})
