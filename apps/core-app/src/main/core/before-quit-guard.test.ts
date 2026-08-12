import { describe, expect, it } from 'vitest'
import { runWithBeforeQuitTimeout } from './before-quit-guard'

describe('before-quit-guard', () => {
  it('completes without timeout when handler finishes in time', async () => {
    let completed = false
    const result = await runWithBeforeQuitTimeout(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      completed = true
    }, 50)

    // Assert that the handler ran to completion rather than that the clock
    // advanced a specific amount. durationMs comes from Date.now() deltas and a
    // 10ms setTimeout can land on a 9ms delta, which failed this on CI.
    expect(completed).toBe(true)
    expect(result.timedOut).toBe(false)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(result.durationMs)).toBe(true)
  })

  it('returns timeout when handler blocks beyond threshold', async () => {
    const result = await runWithBeforeQuitTimeout(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }, 10)

    expect(result.timedOut).toBe(true)
  })

  it('captures a timeout hint when handler blocks', async () => {
    const result = await runWithBeforeQuitTimeout(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
      },
      10,
      () => ({ module: 'DownloadCenter', phase: 'destroy' })
    )

    expect(result.timedOut).toBe(true)
    expect(result.timeoutHint).toEqual({ module: 'DownloadCenter', phase: 'destroy' })
  })
})
