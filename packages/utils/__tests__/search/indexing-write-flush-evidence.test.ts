import { describe, expect, it } from 'vitest'
import { IndexedWriteFlushEvidenceService } from '../../search'

const service = new IndexedWriteFlushEvidenceService()

describe('IndexedWriteFlushEvidenceService', () => {
  it('builds ready evidence from a successful flush snapshot', () => {
    expect(
      service.build({
        id: 'source:index-flush',
        label: 'Source index flush',
        snapshot: {
          status: 'flushed',
          entries: 5,
          pending: 2,
          inflight: 1,
          reason: 'flush-completed',
          metadata: {
            batchSize: 8
          },
          durationMs: 12,
          checkedAt: 123
        }
      })
    ).toEqual({
      id: 'source:index-flush',
      label: 'Source index flush',
      status: 'ready',
      itemCount: 5,
      lastCheckedAt: 123,
      reason: 'flush-completed',
      metadata: {
        batchSize: 8,
        status: 'flushed',
        entries: 5,
        pending: 2,
        inflight: 1,
        error: undefined,
        durationMs: 12
      }
    })
  })

  it('uses pending count when no entries were flushed', () => {
    expect(
      service.build({
        id: 'source:index-flush',
        label: 'Source index flush',
        snapshot: {
          status: 'idle',
          entries: 0,
          pending: 7,
          inflight: 0,
          checkedAt: 456
        }
      })
    ).toMatchObject({
      status: 'ready',
      itemCount: 7
    })
  })

  it.each(['failed', 'not-ready', 'worker-not-ready'])(
    'marks %s flush evidence as degraded',
    (status) => {
      expect(
        service.build({
          id: 'source:index-flush',
          label: 'Source index flush',
          snapshot: {
            status,
            entries: 0,
            pending: 3,
            inflight: 1,
            error: 'worker unavailable',
            checkedAt: 789
          }
        })
      ).toMatchObject({
        status: 'degraded',
        itemCount: 3,
        metadata: {
          status,
          error: 'worker unavailable'
        }
      })
    }
  )

  it('supports custom degraded statuses and caller metadata', () => {
    expect(
      service.build({
        id: 'source:index-flush',
        label: 'Source index flush',
        degradedStatuses: ['retrying'],
        metadata: {
          sourceId: 'source'
        },
        snapshot: {
          status: 'retrying',
          entries: 1,
          pending: 9,
          inflight: 2,
          metadata: {
            sourceId: 'from-snapshot',
            batchSize: 16
          },
          checkedAt: 1000
        }
      })
    ).toMatchObject({
      status: 'degraded',
      metadata: {
        sourceId: 'source',
        batchSize: 16,
        status: 'retrying',
        entries: 1,
        pending: 9,
        inflight: 2
      }
    })
  })

  it('normalizes malformed snapshot counters and timestamps before exposing evidence', () => {
    const evidence = service.build({
      id: 'source:index-flush',
      label: 'Source index flush',
      snapshot: {
        status: 'failed',
        entries: Number.POSITIVE_INFINITY,
        pending: -7,
        inflight: Number.NaN,
        durationMs: Number.NEGATIVE_INFINITY,
        checkedAt: Number.NaN
      }
    })

    expect(evidence).toMatchObject({
      status: 'degraded',
      itemCount: 0,
      metadata: {
        entries: 0,
        pending: 0,
        inflight: 0,
        durationMs: 0
      }
    })
    expect(evidence.lastCheckedAt).toBeGreaterThan(0)
  })
})
