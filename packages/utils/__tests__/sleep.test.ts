import { afterEach, describe, expect, it, vi } from 'vitest'
import { sleep } from '../common/utils'

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('sleep', () => {
  it('settles only after the requested delay and returns that delay', async () => {
    vi.useFakeTimers()

    let settled = false
    const delayed = sleep(125).then((value) => {
      settled = true
      return value
    })

    await vi.advanceTimersByTimeAsync(124)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await expect(delayed).resolves.toBe(125)
  })
})
