import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useDeferredLoading } from '../src/use-deferred-loading'

describe('useDeferredLoading', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function run<T>(body: () => T): { result: T, stop: () => void } {
    const scope = effectScope()
    const result = scope.run(body) as T
    return { result, stop: () => scope.stop() }
  }

  it('never shows the skeleton when the data arrives inside the delay', async () => {
    const loading = ref(true)
    const { result: visible, stop } = run(() => useDeferredLoading(loading, { delay: 150 }))

    await vi.advanceTimersByTimeAsync(100)
    loading.value = false
    await vi.advanceTimersByTimeAsync(1000)

    expect(visible.value).toBe(false)
    stop()
  })

  it('shows the skeleton once loading outlasts the delay', async () => {
    const loading = ref(true)
    const { result: visible, stop } = run(() => useDeferredLoading(loading, { delay: 150 }))

    await vi.advanceTimersByTimeAsync(149)
    expect(visible.value).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(visible.value).toBe(true)

    stop()
  })

  it('holds the skeleton for the minimum duration once it is up', async () => {
    const loading = ref(true)
    const { result: visible, stop } = run(() =>
      useDeferredLoading(loading, { delay: 150, minDuration: 400 }),
    )

    await vi.advanceTimersByTimeAsync(150)
    expect(visible.value).toBe(true)

    // Data lands almost immediately after the skeleton appeared.
    await vi.advanceTimersByTimeAsync(50)
    loading.value = false
    await vi.advanceTimersByTimeAsync(0)

    // Still up: hiding here would flash it for a single frame.
    expect(visible.value).toBe(true)

    await vi.advanceTimersByTimeAsync(349)
    expect(visible.value).toBe(true)

    await vi.advanceTimersByTimeAsync(1)
    expect(visible.value).toBe(false)

    stop()
  })

  it('hides immediately when the minimum duration has already elapsed', async () => {
    const loading = ref(true)
    const { result: visible, stop } = run(() =>
      useDeferredLoading(loading, { delay: 150, minDuration: 400 }),
    )

    await vi.advanceTimersByTimeAsync(150 + 400)
    expect(visible.value).toBe(true)

    loading.value = false
    await vi.advanceTimersByTimeAsync(0)
    expect(visible.value).toBe(false)

    stop()
  })

  it('does not restart the delay while the skeleton is already on screen', async () => {
    const loading = ref(true)
    const { result: visible, stop } = run(() =>
      useDeferredLoading(loading, { delay: 150, minDuration: 0 }),
    )

    await vi.advanceTimersByTimeAsync(150)
    expect(visible.value).toBe(true)

    // A second load starting while the first is still showing must not blink.
    loading.value = false
    loading.value = true
    await vi.advanceTimersByTimeAsync(0)
    expect(visible.value).toBe(true)

    stop()
  })

  it('drops pending timers when the scope is disposed', async () => {
    const loading = ref(true)
    const { result: visible, stop } = run(() => useDeferredLoading(loading, { delay: 150 }))

    stop()
    await vi.advanceTimersByTimeAsync(1000)

    expect(visible.value).toBe(false)
  })
})
