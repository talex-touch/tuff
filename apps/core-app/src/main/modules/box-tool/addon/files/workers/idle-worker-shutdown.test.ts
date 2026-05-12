import { afterEach, describe, expect, it, vi } from 'vitest'
import { IdleWorkerShutdownController } from './idle-worker-shutdown'

describe('IdleWorkerShutdownController', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs shutdown after the idle timeout when the worker is still idle', () => {
    vi.useFakeTimers()
    const shutdown = vi.fn()
    const controller = new IdleWorkerShutdownController({
      timeoutMs: 100,
      shouldShutdown: () => true,
      shutdown
    })

    controller.schedule()
    vi.advanceTimersByTime(99)
    expect(shutdown).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(shutdown).toHaveBeenCalledTimes(1)
  })

  it('cancels the pending idle shutdown when new work arrives', () => {
    vi.useFakeTimers()
    const shutdown = vi.fn()
    const controller = new IdleWorkerShutdownController({
      timeoutMs: 100,
      shouldShutdown: () => true,
      shutdown
    })

    controller.schedule()
    controller.cancel()
    vi.advanceTimersByTime(100)

    expect(shutdown).not.toHaveBeenCalled()
  })

  it('keeps the worker alive when the idle predicate is false', () => {
    vi.useFakeTimers()
    const shutdown = vi.fn()
    const controller = new IdleWorkerShutdownController({
      timeoutMs: 100,
      shouldShutdown: () => false,
      shutdown
    })

    controller.schedule()
    vi.advanceTimersByTime(100)

    expect(shutdown).not.toHaveBeenCalled()
  })

  it('does not extend an existing idle shutdown window when scheduled again', () => {
    vi.useFakeTimers()
    const shutdown = vi.fn()
    const controller = new IdleWorkerShutdownController({
      timeoutMs: 100,
      shouldShutdown: () => true,
      shutdown
    })

    controller.schedule()
    vi.advanceTimersByTime(50)
    controller.schedule()
    vi.advanceTimersByTime(50)

    expect(shutdown).toHaveBeenCalledTimes(1)
  })
})
