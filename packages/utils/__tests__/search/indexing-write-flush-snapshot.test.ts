import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildIndexedWriteFlushFailureSnapshot,
  buildIndexedWriteFlushFailureRetryMetadata,
  buildIndexedWriteFlushIdleSnapshot,
  buildIndexedWriteFlushResultSnapshot,
  getIndexedWriteFlushResultFromError,
  IndexedWriteFlushSnapshotService
} from '../../search'

describe('IndexedWriteFlushSnapshotService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('records the latest flush snapshot with checkedAt', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    const service = new IndexedWriteFlushSnapshotService()

    expect(service.record({ status: 'flushed', entries: 2, pending: 1, inflight: 0 })).toEqual({
      status: 'flushed',
      entries: 2,
      pending: 1,
      inflight: 0,
      checkedAt: 1700000000000
    })
    expect(service.getSnapshot()).toMatchObject({
      status: 'flushed',
      checkedAt: 1700000000000
    })
  })

  it('isolates recorded flush snapshots from caller mutation', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    const service = new IndexedWriteFlushSnapshotService()
    const input = {
      status: 'failed' as const,
      entries: 2,
      pending: 1,
      inflight: 0,
      metadata: {
        retryReason: 'flush-failed',
        counters: {
          withContent: 2
        }
      }
    }

    const recorded = service.record(input)
    input.metadata.retryReason = 'mutated-input'
    input.metadata.counters.withContent = 99
    recorded.metadata = {
      retryReason: 'mutated-return'
    }
    recorded.entries = 99

    expect(service.getSnapshot()).toEqual({
      status: 'failed',
      entries: 2,
      pending: 1,
      inflight: 0,
      metadata: {
        retryReason: 'flush-failed',
        counters: {
          withContent: 2
        }
      },
      checkedAt: 1700000000000
    })
  })

  it('isolates returned flush snapshots from cache mutation', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    const service = new IndexedWriteFlushSnapshotService()

    service.record({
      status: 'failed',
      entries: 2,
      pending: 1,
      inflight: 0,
      metadata: {
        retryReason: 'flush-failed',
        counters: {
          withContent: 2
        }
      }
    })

    const firstSnapshot = service.getSnapshot()
    expect(firstSnapshot).not.toBeNull()
    firstSnapshot!.entries = 99
    const counters = firstSnapshot!.metadata!.counters as { withContent: number }
    counters.withContent = 99

    expect(service.getSnapshot()).toEqual({
      status: 'failed',
      entries: 2,
      pending: 1,
      inflight: 0,
      metadata: {
        retryReason: 'flush-failed',
        counters: {
          withContent: 2
        }
      },
      checkedAt: 1700000000000
    })
  })

  it('isolates nested flush metadata when structuredClone is unavailable', () => {
    vi.stubGlobal('structuredClone', undefined)
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    const service = new IndexedWriteFlushSnapshotService()
    const input = {
      status: 'failed' as const,
      entries: 2,
      pending: 1,
      inflight: 0,
      metadata: {
        counters: {
          withContent: 2
        }
      }
    }

    const recorded = service.record(input)
    input.metadata.counters.withContent = 99
    const counters = recorded.metadata!.counters as { withContent: number }
    counters.withContent = 100

    expect(service.getSnapshot()).toEqual({
      status: 'failed',
      entries: 2,
      pending: 1,
      inflight: 0,
      metadata: {
        counters: {
          withContent: 2
        }
      },
      checkedAt: 1700000000000
    })
  })

  it('builds an adapter-safe snapshot from a flush result', () => {
    expect(
      buildIndexedWriteFlushResultSnapshot({
        status: 'worker-not-ready',
        entries: 3,
        pending: 4,
        inflight: 5,
        reason: 'not-ready',
        metadata: {
          withContent: 2
        },
        durationMs: 12
      })
    ).toEqual({
      status: 'worker-not-ready',
      entries: 3,
      pending: 4,
      inflight: 5,
      reason: 'not-ready',
      error: undefined,
      metadata: {
        withContent: 2
      },
      durationMs: 12
    })
  })

  it('isolates result snapshot metadata from caller mutation', () => {
    const metadata = {
      counters: {
        withContent: 2
      }
    }
    const snapshot = buildIndexedWriteFlushResultSnapshot({
      status: 'flushed',
      entries: 2,
      pending: 0,
      inflight: 0,
      metadata
    })

    metadata.counters.withContent = 99
    const counters = snapshot.metadata?.counters as { withContent: number }
    counters.withContent = 100

    expect(metadata.counters.withContent).toBe(99)
    expect(
      buildIndexedWriteFlushResultSnapshot({
        status: 'flushed',
        entries: 2,
        pending: 0,
        inflight: 0,
        metadata
      }).metadata
    ).toEqual({
      counters: {
        withContent: 99
      }
    })
  })

  it('normalizes malformed numeric fields from flush results', () => {
    expect(
      buildIndexedWriteFlushResultSnapshot({
        status: 'flushed',
        entries: -1,
        pending: Number.NaN,
        inflight: 2.8,
        durationMs: Number.POSITIVE_INFINITY
      })
    ).toMatchObject({
      entries: 0,
      pending: 0,
      inflight: 2,
      durationMs: 0
    })
  })

  it('builds an idle snapshot from runtime idle state', () => {
    expect(
      buildIndexedWriteFlushIdleSnapshot({
        pending: 4,
        inflight: 5,
        reason: 'flush-in-progress'
      })
    ).toEqual({
      status: 'idle',
      entries: 0,
      pending: 4,
      inflight: 5,
      reason: 'flush-in-progress'
    })
  })

  it('normalizes idle snapshot buffer sizes', () => {
    expect(
      buildIndexedWriteFlushIdleSnapshot({
        pending: -4,
        inflight: Number.NaN,
        reason: 'flush-in-progress'
      })
    ).toMatchObject({
      entries: 0,
      pending: 0,
      inflight: 0
    })
  })

  it('builds a failed snapshot from an attached flush result', () => {
    const error = {
      flushResult: {
        status: 'not-ready',
        entries: 3,
        pending: 4,
        inflight: 5,
        reason: 'worker-not-ready',
        error: 'worker init unavailable',
        metadata: {
          withContent: 2
        },
        durationMs: 12
      }
    }

    expect(
      buildIndexedWriteFlushFailureSnapshot({
        error,
        pendingSize: 10,
        inflightSize: 11,
        metadata: {
          retryReason: 'flush-failed'
        }
      })
    ).toEqual({
      status: 'failed',
      entries: 3,
      pending: 4,
      inflight: 5,
      reason: 'worker-not-ready',
      error: 'worker init unavailable',
      metadata: {
        withContent: 2,
        retryReason: 'flush-failed'
      },
      durationMs: 12
    })
  })

  it('normalizes malformed numeric fields from attached failure flush results', () => {
    const error = {
      flushResult: {
        status: 'idle',
        entries: -1,
        pending: Number.NaN,
        inflight: Number.POSITIVE_INFINITY,
        durationMs: -12
      }
    }

    expect(
      buildIndexedWriteFlushFailureSnapshot({
        error,
        pendingSize: 10,
        inflightSize: 11
      })
    ).toMatchObject({
      status: 'failed',
      entries: 0,
      pending: 0,
      inflight: 0,
      durationMs: 0
    })
  })

  it('builds retry metadata for failed flush snapshots', () => {
    expect(
      buildIndexedWriteFlushFailureRetryMetadata({
        delayMs: 400,
        retryReason: 'sqlite-busy-retry',
        extra: {
          isBusy: true
        }
      })
    ).toEqual({
      isBusy: true,
      delayMs: 400,
      retryReason: 'sqlite-busy-retry'
    })
  })

  it('isolates retry metadata extras from caller mutation', () => {
    const extra = {
      retry: {
        isBusy: true
      }
    }
    const metadata = buildIndexedWriteFlushFailureRetryMetadata({
      delayMs: 400,
      retryReason: 'sqlite-busy-retry',
      extra
    })

    extra.retry.isBusy = false
    const retry = metadata.retry as { isBusy: boolean }
    retry.isBusy = false

    expect(extra.retry.isBusy).toBe(false)
    expect(
      buildIndexedWriteFlushFailureRetryMetadata({
        delayMs: 400,
        retryReason: 'sqlite-busy-retry',
        extra: {
          retry: {
            isBusy: true
          }
        }
      }).retry
    ).toEqual({
      isBusy: true
    })
  })

  it('normalizes malformed retry delay metadata', () => {
    expect(
      buildIndexedWriteFlushFailureRetryMetadata({
        delayMs: Number.NaN,
        retryReason: 'sqlite-busy-retry'
      })
    ).toMatchObject({
      delayMs: 0,
      retryReason: 'sqlite-busy-retry'
    })
  })

  it('falls back to buffer sizes and stringified error without a flush result', () => {
    expect(
      buildIndexedWriteFlushFailureSnapshot({
        error: new Error('sqlite busy'),
        pendingSize: 7,
        inflightSize: 8,
        metadata: {
          retryReason: 'sqlite-busy-retry'
        }
      })
    ).toEqual({
      status: 'failed',
      entries: 0,
      pending: 7,
      inflight: 8,
      reason: 'flush-failed',
      error: 'sqlite busy',
      metadata: {
        retryReason: 'sqlite-busy-retry'
      },
      durationMs: undefined
    })
  })

  it('isolates failure snapshot metadata from flush result and caller mutation', () => {
    const flushMetadata = {
      counters: {
        withContent: 2
      }
    }
    const callerMetadata = {
      retry: {
        reason: 'flush-failed'
      }
    }
    const snapshot = buildIndexedWriteFlushFailureSnapshot({
      error: new Error('sqlite busy'),
      flushResult: {
        metadata: flushMetadata
      },
      pendingSize: 7,
      inflightSize: 8,
      metadata: callerMetadata
    })

    flushMetadata.counters.withContent = 99
    callerMetadata.retry.reason = 'mutated'
    const counters = snapshot.metadata?.counters as { withContent: number }
    const retry = snapshot.metadata?.retry as { reason: string }

    expect(counters.withContent).toBe(2)
    expect(retry.reason).toBe('flush-failed')

    counters.withContent = 100
    retry.reason = 'mutated-return'

    expect(flushMetadata.counters.withContent).toBe(99)
    expect(callerMetadata.retry.reason).toBe('mutated')
  })

  it('extracts flush results from error-like objects only', () => {
    const flushResult = { status: 'flushed', entries: 1, pending: 0, inflight: 0 }

    expect(getIndexedWriteFlushResultFromError({ flushResult })).toBe(flushResult)
    expect(getIndexedWriteFlushResultFromError({ flushResult: null })).toBeNull()
    expect(getIndexedWriteFlushResultFromError(new Error('plain'))).toBeNull()
  })
})
