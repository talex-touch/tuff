import { describe, expect, it } from 'vitest'
import { resolveIndexedSourceTaskRetryDecision } from '../../search'

describe('indexed source task retry policy', () => {
  it('allows tasks with no recent failures', () => {
    expect(resolveIndexedSourceTaskRetryDecision([], 'scan', { now: 10_000 })).toEqual({
      allowed: true,
      reason: 'allowed',
      failedAttempts: 0
    })
  })

  it('blocks repeated automatic retries until the backoff window expires', () => {
    expect(
      resolveIndexedSourceTaskRetryDecision(
        [
          {
            kind: 'scan',
            status: 'failed',
            completedAt: 100_000,
            error: 'sqlite busy'
          }
        ],
        'scan',
        {
          now: 110_000,
          baseDelayMs: 30_000
        }
      )
    ).toEqual({
      allowed: false,
      reason: 'retry-window',
      failedAttempts: 1,
      lastFailedAt: 100_000,
      nextRetryAt: 130_000
    })
  })

  it('uses exponential delay for multiple recent failures', () => {
    expect(
      resolveIndexedSourceTaskRetryDecision(
        [
          {
            kind: 'reconcile',
            status: 'failed',
            completedAt: 200_000
          },
          {
            kind: 'reconcile',
            status: 'failed',
            completedAt: 180_000
          }
        ],
        'reconcile',
        {
          now: 230_000,
          baseDelayMs: 30_000,
          maxDelayMs: 120_000
        }
      )
    ).toMatchObject({
      allowed: false,
      failedAttempts: 2,
      nextRetryAt: 260_000
    })
  })

  it('uses the latest failed task even when persisted history is not sorted', () => {
    expect(
      resolveIndexedSourceTaskRetryDecision(
        [
          {
            kind: 'scan',
            status: 'failed',
            completedAt: 100_000
          },
          {
            kind: 'scan',
            status: 'failed',
            completedAt: 140_000
          }
        ],
        'scan',
        {
          now: 150_000,
          baseDelayMs: 30_000
        }
      )
    ).toEqual({
      allowed: false,
      reason: 'retry-window',
      failedAttempts: 2,
      lastFailedAt: 140_000,
      nextRetryAt: 200_000
    })
  })

  it('does not extend the retry window from retry-window skips', () => {
    expect(
      resolveIndexedSourceTaskRetryDecision(
        [
          {
            kind: 'scan',
            status: 'skipped',
            completedAt: 130_000,
            error: 'skipped:retry-window:scan:130000'
          },
          {
            kind: 'scan',
            status: 'failed',
            completedAt: 100_000,
            error: 'scanner crashed'
          }
        ],
        'scan',
        {
          now: 130_000,
          baseDelayMs: 30_000
        }
      )
    ).toEqual({
      allowed: true,
      reason: 'allowed',
      failedAttempts: 1,
      lastFailedAt: 100_000,
      nextRetryAt: 130_000
    })
  })

  it('ignores stale failures outside the failure window', () => {
    expect(
      resolveIndexedSourceTaskRetryDecision(
        [
          {
            kind: 'scan',
            status: 'failed',
            completedAt: 1
          }
        ],
        'scan',
        {
          now: 3_600_002,
          failureWindowMs: 3_600_000
        }
      )
    ).toEqual({
      allowed: true,
      reason: 'allowed',
      failedAttempts: 0
    })
  })

  it('ignores future or invalid completedAt values from persisted task history', () => {
    expect(
      resolveIndexedSourceTaskRetryDecision(
        [
          {
            kind: 'scan',
            status: 'failed',
            completedAt: 150_000
          },
          {
            kind: 'scan',
            status: 'failed',
            completedAt: Number.POSITIVE_INFINITY
          },
          {
            kind: 'scan',
            status: 'failed',
            completedAt: 90_000
          }
        ],
        'scan',
        {
          now: 130_000,
          baseDelayMs: 30_000
        }
      )
    ).toEqual({
      allowed: true,
      reason: 'allowed',
      failedAttempts: 1,
      lastFailedAt: 90_000,
      nextRetryAt: 120_000
    })
  })

  it('normalizes invalid policy clock values instead of extending retry windows', () => {
    expect(
      resolveIndexedSourceTaskRetryDecision(
        [
          {
            kind: 'scan',
            status: 'failed',
            completedAt: 10_000
          }
        ],
        'scan',
        {
          now: Number.NaN,
          baseDelayMs: 30_000
        }
      )
    ).toEqual({
      allowed: true,
      reason: 'allowed',
      failedAttempts: 0
    })

    expect(
      resolveIndexedSourceTaskRetryDecision(
        [
          {
            kind: 'scan',
            status: 'failed',
            completedAt: 0
          }
        ],
        'scan',
        {
          now: -1,
          baseDelayMs: 30_000
        }
      )
    ).toEqual({
      allowed: false,
      reason: 'retry-window',
      failedAttempts: 1,
      lastFailedAt: 0,
      nextRetryAt: 30_000
    })
  })
})
