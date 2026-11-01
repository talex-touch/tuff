import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LeadingTrailingThrottle } from './leading-trailing-throttle'

const INTERVAL_MS = 60_000

function createThrottle(
  overrides: { onTrailing?: () => void; onError?: (error: unknown) => void } = {}
): { throttle: LeadingTrailingThrottle; onTrailing: ReturnType<typeof vi.fn> } {
  const onTrailing = vi.fn(overrides.onTrailing)
  const throttle = new LeadingTrailingThrottle({
    intervalMs: INTERVAL_MS,
    onTrailing,
    onError: overrides.onError
  })
  return { throttle, onTrailing }
}

describe('LeadingTrailingThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lets the first trigger through and schedules nothing when nothing else arrives', () => {
    const { throttle, onTrailing } = createThrottle()

    expect(throttle.trigger()).toBe(true)
    vi.advanceTimersByTime(INTERVAL_MS * 10)

    expect(onTrailing).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('holds a trigger inside the window and runs it once, when the window closes', () => {
    const { throttle, onTrailing } = createThrottle()

    throttle.trigger()
    vi.advanceTimersByTime(10_000)
    expect(throttle.trigger()).toBe(false)

    vi.advanceTimersByTime(INTERVAL_MS - 10_000 - 1)
    expect(onTrailing).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onTrailing).toHaveBeenCalledTimes(1)
  })

  it('folds a burst held inside one window into a single trailing run', () => {
    const { throttle, onTrailing } = createThrottle()

    throttle.trigger()
    for (let index = 0; index < 500; index += 1) {
      expect(throttle.trigger()).toBe(false)
      vi.advanceTimersByTime(50)
    }
    vi.advanceTimersByTime(INTERVAL_MS)

    expect(onTrailing).toHaveBeenCalledTimes(1)
  })

  it('opens a new window with the trailing run, so a steady stream stays at one run per interval', () => {
    const { throttle, onTrailing } = createThrottle()

    let leading = 0
    for (let second = 0; second < 300; second += 1) {
      if (throttle.trigger()) leading += 1
      vi.advanceTimersByTime(1_000)
    }

    expect(leading).toBe(1)
    expect(onTrailing).toHaveBeenCalledTimes(5)
  })

  it('treats a trigger right after the trailing run as held, not as a new leading edge', () => {
    const { throttle, onTrailing } = createThrottle()

    throttle.trigger()
    throttle.trigger()
    vi.advanceTimersByTime(INTERVAL_MS)
    expect(onTrailing).toHaveBeenCalledTimes(1)

    expect(throttle.trigger()).toBe(false)
    vi.advanceTimersByTime(INTERVAL_MS - 1)
    expect(onTrailing).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(onTrailing).toHaveBeenCalledTimes(2)
  })

  it('is a leading edge again once a window closes with nothing held', () => {
    const { throttle, onTrailing } = createThrottle()

    throttle.trigger()
    vi.advanceTimersByTime(INTERVAL_MS)

    expect(throttle.trigger()).toBe(true)
    expect(onTrailing).not.toHaveBeenCalled()
  })

  it('is a leading edge again once the trailing window has also passed quietly', () => {
    const { throttle, onTrailing } = createThrottle()

    throttle.trigger()
    throttle.trigger()
    vi.advanceTimersByTime(INTERVAL_MS * 2)

    expect(onTrailing).toHaveBeenCalledTimes(1)
    expect(throttle.trigger()).toBe(true)
  })

  it('clears its timer on dispose and ignores later triggers', () => {
    const { throttle, onTrailing } = createThrottle()

    throttle.trigger()
    throttle.trigger()
    expect(vi.getTimerCount()).toBe(1)

    throttle.dispose()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(INTERVAL_MS * 3)
    expect(onTrailing).not.toHaveBeenCalled()

    expect(throttle.trigger()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not run a trailing callback that was disposed from inside the window', () => {
    const { throttle, onTrailing } = createThrottle()

    throttle.trigger()
    throttle.trigger()
    vi.advanceTimersByTime(INTERVAL_MS - 1)
    throttle.dispose()
    vi.advanceTimersByTime(1)

    expect(onTrailing).not.toHaveBeenCalled()
  })

  it('does not hold the process open', () => {
    const timeout = vi.spyOn(globalThis, 'setTimeout')
    const { throttle } = createThrottle()

    throttle.trigger()

    const timer = timeout.mock.results[0]?.value as NodeJS.Timeout
    expect(timer.hasRef()).toBe(false)
    throttle.dispose()
  })

  it('reports a throwing trailing callback and keeps the next window open', () => {
    const failure = new Error('invalidate failed')
    const onError = vi.fn()
    const { throttle, onTrailing } = createThrottle({
      onTrailing: () => {
        throw failure
      },
      onError
    })

    throttle.trigger()
    throttle.trigger()
    expect(() => vi.advanceTimersByTime(INTERVAL_MS)).not.toThrow()

    expect(onError).toHaveBeenCalledWith(failure)
    expect(throttle.trigger()).toBe(false)
    vi.advanceTimersByTime(INTERVAL_MS)
    expect(onTrailing).toHaveBeenCalledTimes(2)
  })

  it('swallows a throwing trailing callback when no error handler was given', () => {
    const { throttle } = createThrottle({
      onTrailing: () => {
        throw new Error('invalidate failed')
      }
    })

    throttle.trigger()
    throttle.trigger()

    expect(() => vi.advanceTimersByTime(INTERVAL_MS)).not.toThrow()
  })
})
