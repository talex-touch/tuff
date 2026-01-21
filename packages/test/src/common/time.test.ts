import { createRetrier, TimeoutError, withTimeout } from '@talex-touch/utils/common/utils/time'
import { describe, expect, it, vi } from 'vitest'

describe('time utils', () => {
  it('resolves within timeout', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok')
  })

  it('rejects when timed out', async () => {
    const slow = new Promise(resolve => setTimeout(resolve, 20))
    await expect(withTimeout(slow, 1)).rejects.toBeInstanceOf(TimeoutError)
  })

  it('retries until success', async () => {
    let attempts = 0
    const task = vi.fn(async () => {
      attempts += 1
      if (attempts < 2) {
        throw new Error('fail')
      }
      return 'ok'
    })

    const retrier = createRetrier({ maxRetries: 1, timeoutMs: 50 })
    const wrapped = retrier(task)

    await expect(wrapped()).resolves.toBe('ok')
    expect(task).toHaveBeenCalledTimes(2)
  })
})
