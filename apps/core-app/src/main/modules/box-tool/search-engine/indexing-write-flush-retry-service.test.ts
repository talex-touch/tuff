import { describe, expect, it } from 'vitest'
import {
  IndexedWriteFlushRetryService as SdkIndexedWriteFlushRetryService,
  getIndexedWriteFlushDelay as sdkGetIndexedWriteFlushDelay,
  getIndexedWriteFlushExponentialRetryDelay as sdkGetIndexedWriteFlushExponentialRetryDelay
} from '@talex-touch/utils/search'
import {
  getIndexedWriteFlushDelay,
  getIndexedWriteFlushExponentialRetryDelay,
  IndexedWriteFlushRetryService
} from './indexing-write-flush-retry-service'

describe('indexing-write-flush-retry-service', () => {
  it('re-exports public SDK flush retry helpers for legacy CoreApp imports', () => {
    expect(getIndexedWriteFlushDelay).toBe(sdkGetIndexedWriteFlushDelay)
    expect(getIndexedWriteFlushExponentialRetryDelay).toBe(
      sdkGetIndexedWriteFlushExponentialRetryDelay
    )
    expect(IndexedWriteFlushRetryService).toBe(SdkIndexedWriteFlushRetryService)
  })

  it('uses backlog delay after pending size crosses the configured threshold', () => {
    expect(getIndexedWriteFlushDelay(5, { baseDelayMs: 100, backlogDelayMs: 300 })).toBe(100)
    expect(getIndexedWriteFlushDelay(31, { baseDelayMs: 100, backlogDelayMs: 300 })).toBe(300)
    expect(
      getIndexedWriteFlushDelay(10, {
        baseDelayMs: 100,
        backlogDelayMs: 300,
        backlogThreshold: 10
      })
    ).toBe(100)
    expect(
      getIndexedWriteFlushDelay(11, {
        baseDelayMs: 100,
        backlogDelayMs: 300,
        backlogThreshold: 10
      })
    ).toBe(300)
  })

  it('builds capped exponential retry delays with jitter', () => {
    const first = getIndexedWriteFlushExponentialRetryDelay(0, {
      baseDelayMs: 200,
      maxDelayMs: 1000,
      random: () => 0.5
    })
    const second = getIndexedWriteFlushExponentialRetryDelay(first.nextRetryCount, {
      baseDelayMs: 200,
      maxDelayMs: 1000,
      random: () => 0.5
    })
    const capped = getIndexedWriteFlushExponentialRetryDelay(10, {
      baseDelayMs: 200,
      maxDelayMs: 1000,
      random: () => 0.5
    })

    expect(first).toEqual({ delayMs: 200, nextRetryCount: 1 })
    expect(second).toEqual({ delayMs: 400, nextRetryCount: 2 })
    expect(capped).toEqual({ delayMs: 1000, nextRetryCount: 11 })
  })

  it('resolves retryable failures with exponential retry decisions', () => {
    const service = new IndexedWriteFlushRetryService({
      retryBaseMs: 200,
      retryMaxMs: 1000,
      random: () => 0.5
    })

    expect(
      service.resolveFailure({
        pendingSize: 5,
        retryCount: 1,
        retryable: true,
        retryableReason: 'sqlite-busy-retry',
        fallbackReason: 'flush-failed'
      })
    ).toEqual({
      retryable: true,
      delayMs: 400,
      nextRetryCount: 2,
      reason: 'sqlite-busy-retry'
    })
  })

  it('resolves non-retryable failures with backlog delay without incrementing retry count', () => {
    const service = new IndexedWriteFlushRetryService({
      baseDelayMs: 100,
      backlogDelayMs: 300
    })

    expect(
      service.resolveFailure({
        pendingSize: 40,
        retryCount: 2,
        retryable: false,
        retryableReason: 'sqlite-busy-retry',
        fallbackReason: 'flush-failed'
      })
    ).toEqual({
      retryable: false,
      delayMs: 300,
      nextRetryCount: 2,
      reason: 'flush-failed'
    })
  })
})
