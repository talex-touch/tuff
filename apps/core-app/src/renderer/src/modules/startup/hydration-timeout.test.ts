import { describe, expect, it, vi } from 'vitest'
import { waitForHydrationSoftTimeout, type HydrationWaitTarget } from './hydration-timeout'

function createHydrationTarget(hydrated: boolean, promise: Promise<void>): HydrationWaitTarget {
  return {
    isHydrated: () => hydrated,
    whenHydrated: () => promise
  }
}

describe('waitForHydrationSoftTimeout', () => {
  it('returns immediately when storage is already hydrated', async () => {
    const whenHydrated = vi.fn(async () => undefined)
    const result = await waitForHydrationSoftTimeout(
      {
        isHydrated: () => true,
        whenHydrated
      },
      { timeoutMs: 10 }
    )

    expect(result).toBe('hydrated')
    expect(whenHydrated).not.toHaveBeenCalled()
  })

  it('returns hydrated and clears the soft timeout when hydration wins', async () => {
    const timeoutHandlers: Array<() => void> = []
    const clearTimeoutFn = vi.fn()
    const result = await waitForHydrationSoftTimeout(
      createHydrationTarget(false, Promise.resolve()),
      {
        timeoutMs: 10,
        setTimeoutFn: (handler) => {
          timeoutHandlers.push(handler)
          return 1
        },
        clearTimeoutFn
      }
    )

    expect(result).toBe('hydrated')
    expect(timeoutHandlers).toHaveLength(1)
    expect(clearTimeoutFn).toHaveBeenCalledWith(1)
  })

  it('returns timeout and calls onTimeout when hydration is slow', async () => {
    const timeoutHandlers: Array<() => void> = []
    const onTimeout = vi.fn()
    const resultPromise = waitForHydrationSoftTimeout(
      createHydrationTarget(false, new Promise(() => {})),
      {
        timeoutMs: 10,
        setTimeoutFn: (handler) => {
          timeoutHandlers.push(handler)
          return 2
        },
        onTimeout
      }
    )

    timeoutHandlers[0]?.()
    await expect(resultPromise).resolves.toBe('timeout')
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })
})
