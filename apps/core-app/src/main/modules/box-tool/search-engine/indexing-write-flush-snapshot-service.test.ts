import { afterEach, describe, expect, it, vi } from 'vitest'
import { IndexedWriteFlushSnapshotService as SdkIndexedWriteFlushSnapshotService } from '@talex-touch/utils/search'
import { IndexedWriteFlushSnapshotService } from './indexing-write-flush-snapshot-service'

describe('IndexedWriteFlushSnapshotService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('records the latest flush snapshot with checkedAt', () => {
    expect(IndexedWriteFlushSnapshotService).toBe(SdkIndexedWriteFlushSnapshotService)

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
})
