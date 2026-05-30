import { describe, expect, it, vi } from 'vitest'
import { FileProviderIndexFlushRetryService } from './file-provider-index-flush-retry-service'

describe('file-provider-index-flush-retry-service', () => {
  it('uses normal flush delay for pending backlog size', () => {
    const service = new FileProviderIndexFlushRetryService({
      baseDelayMs: 100,
      backlogDelayMs: 300
    })

    expect(service.getFlushDelay(5)).toBe(100)
    expect(service.getFlushDelay(31)).toBe(300)
  })

  it('uses sqlite busy exponential retry decisions', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const service = new FileProviderIndexFlushRetryService({
      busyRetryBaseMs: 200,
      busyRetryMaxMs: 1000
    })

    const decision = service.resolveFailure({
      error: new Error('SQLITE_BUSY: database is locked'),
      pendingSize: 5,
      retryCount: 1
    })

    expect(decision).toEqual({
      isBusy: true,
      delayMs: 400,
      nextRetryCount: 2,
      reason: 'sqlite-busy-retry'
    })
  })

  it('uses backlog flush delay for non-busy failures without changing retry count', () => {
    const service = new FileProviderIndexFlushRetryService({
      baseDelayMs: 100,
      backlogDelayMs: 300
    })

    const decision = service.resolveFailure({
      error: new Error('worker failed'),
      pendingSize: 40,
      retryCount: 2
    })

    expect(decision).toEqual({
      isBusy: false,
      delayMs: 300,
      nextRetryCount: 2,
      reason: 'flush-failed'
    })
  })
})
