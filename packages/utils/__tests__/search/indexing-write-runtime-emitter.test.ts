import { describe, expect, it, vi } from 'vitest'
import { IndexedWriteRuntimeEmitterService } from '../../search'

interface TestRecord {
  id: string
  path: string
  title: string
}

const mapRecord = (record: TestRecord) => ({
  sourceId: 'test-source',
  recordId: record.id,
  stableKey: record.path,
  kind: 'file' as const,
  title: record.title,
  path: record.path
})

describe('IndexedWriteRuntimeEmitterService', () => {
  it('emits mapped record batches for runtime store adapters', async () => {
    const emitRecordBatch = vi.fn(async () => {})
    const service = new IndexedWriteRuntimeEmitterService<TestRecord, { runId: string }>({
      sourceId: 'test-source',
      mapRecord,
      emitRecordBatch
    })
    const context = { runId: 'scan' }

    await service.emitBatch([{ id: '1', path: '/tmp/a.txt', title: 'A' }], context)

    expect(emitRecordBatch).toHaveBeenCalledWith(
      {
        sourceId: 'test-source',
        records: [
          expect.objectContaining({
            recordId: '1',
            stableKey: '/tmp/a.txt',
            title: 'A'
          })
        ]
      },
      context
    )
  })

  it('emits add/change deltas with mapped records and explicit reasons', async () => {
    const emitDelta = vi.fn(async () => {})
    const service = new IndexedWriteRuntimeEmitterService<TestRecord, { runId: string }>({
      sourceId: 'test-source',
      mapRecord,
      emitDelta
    })
    const context = { runId: 'reconcile' }

    await service.emitDeltas(
      [
        { id: '1', path: '/tmp/a.txt', title: 'A' },
        { id: '2', path: '/tmp/b.txt', title: 'B' }
      ],
      context,
      { action: 'add', reason: 'test-reconcile-add' }
    )

    expect(emitDelta).toHaveBeenCalledTimes(2)
    expect(emitDelta).toHaveBeenNthCalledWith(
      1,
      {
        sourceId: 'test-source',
        action: 'add',
        record: expect.objectContaining({ recordId: '1', stableKey: '/tmp/a.txt' }),
        path: '/tmp/a.txt',
        reason: 'test-reconcile-add'
      },
      context
    )
  })

  it('builds add/change deltas without requiring an emit sink', () => {
    const service = new IndexedWriteRuntimeEmitterService<TestRecord>({
      sourceId: 'test-source',
      mapRecord
    })

    expect(
      service.buildDelta({ id: '1', path: '/tmp/a.txt', title: 'A' }, {
        action: 'change',
        reason: 'watch-event'
      })
    ).toEqual({
      sourceId: 'test-source',
      action: 'change',
      record: expect.objectContaining({ recordId: '1', stableKey: '/tmp/a.txt' }),
      path: '/tmp/a.txt',
      reason: 'watch-event'
    })
  })

  it('skips optional sinks for empty batches and emits progress snapshots', async () => {
    const emitRecordBatch = vi.fn()
    const emitDelta = vi.fn()
    const emitProgress = vi.fn()
    const service = new IndexedWriteRuntimeEmitterService<TestRecord>({
      sourceId: 'test-source',
      mapRecord,
      emitRecordBatch,
      emitDelta,
      emitProgress
    })

    await service.emitBatch([], undefined)
    await service.emitDeltas([], undefined, { action: 'change' })
    await service.emitDeleteDeltas([], undefined)
    service.emitProgressSnapshot({ current: 3, total: 5 })

    expect(emitRecordBatch).not.toHaveBeenCalled()
    expect(emitDelta).not.toHaveBeenCalled()
    expect(emitProgress).toHaveBeenCalledWith(3, 5)
  })

  it('builds delete deltas without requiring mapped records or emit sinks', () => {
    const service = new IndexedWriteRuntimeEmitterService<TestRecord>({
      sourceId: 'test-source'
    })

    expect(service.buildDeleteDelta('/tmp/a.txt', { reason: 'watch-delete' })).toEqual({
      sourceId: 'test-source',
      action: 'delete',
      stableKey: '/tmp/a.txt',
      path: '/tmp/a.txt',
      reason: 'watch-delete'
    })
  })

  it('emits delete deltas from removed paths without requiring mapped records', async () => {
    const emitDelta = vi.fn(async () => {})
    const service = new IndexedWriteRuntimeEmitterService<TestRecord, { runId: string }>({
      sourceId: 'test-source',
      emitDelta
    })
    const context = { runId: 'reconcile' }

    await service.emitDeleteDeltas(['/tmp/a.txt', '/tmp/b.txt'], context, {
      reason: 'test-reconcile-delete'
    })

    expect(emitDelta).toHaveBeenCalledTimes(2)
    expect(emitDelta).toHaveBeenNthCalledWith(
      1,
      {
        sourceId: 'test-source',
        action: 'delete',
        stableKey: '/tmp/a.txt',
        path: '/tmp/a.txt',
        reason: 'test-reconcile-delete'
      },
      context
    )
  })
})
