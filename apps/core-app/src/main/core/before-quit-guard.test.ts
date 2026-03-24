import { describe, expect, it } from 'vitest'
import { runWithBeforeQuitTimeout } from './before-quit-guard'

describe('before-quit-guard', () => {
  it('completes without timeout when handler finishes in time', async () => {
    const result = await runWithBeforeQuitTimeout(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }, 50)

    expect(result.timedOut).toBe(false)
    expect(result.durationMs).toBeGreaterThanOrEqual(10)
  })

  it('returns timeout when handler blocks beyond threshold', async () => {
    const result = await runWithBeforeQuitTimeout(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }, 10)

    expect(result.timedOut).toBe(true)
  })
})
