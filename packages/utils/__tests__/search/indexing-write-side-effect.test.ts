import { describe, expect, it, vi } from 'vitest'
import { IndexedWriteSideEffectService } from '../../search'

async function settleMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve()
  }
}

describe('indexing-write-side-effect-service', () => {
  it('skips empty record batches', async () => {
    const processExtensions = vi.fn(async () => undefined)
    const scheduleIndexing = vi.fn()
    const logWarn = vi.fn()
    const service = new IndexedWriteSideEffectService({
      processExtensions,
      scheduleIndexing,
      logWarn,
    })

    await service.dispatch([], {
      extensionContext: 'incremental',
      indexReason: 'incremental-insert',
    })

    expect(processExtensions).not.toHaveBeenCalled()
    expect(scheduleIndexing).not.toHaveBeenCalled()
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('awaits indexing scheduling before running extension processing', async () => {
    const records = [{ id: 1, path: '/tmp/a.txt' }]
    const order: string[] = []
    const scheduleGate = Promise.withResolvers<void>()
    const scheduleIndexing = vi.fn(async () => {
      order.push('schedule-indexing')
      await scheduleGate.promise
    })
    const processExtensions = vi.fn(async () => {
      order.push('process-extensions')
    })
    const logWarn = vi.fn()
    const service = new IndexedWriteSideEffectService({
      processExtensions,
      scheduleIndexing,
      logWarn,
    })

    let settled = false
    const dispatch = service
      .dispatch(records, {
        extensionContext: 'file-update',
        indexReason: 'file-update',
        mutationLeaseId: 'lease-1',
      })
      .then(() => {
        settled = true
      })
    await settleMicrotasks()

    // The side effect must be waited on, not fired-and-forgotten.
    expect(order).toEqual(['schedule-indexing'])
    expect(settled).toBe(false)

    scheduleGate.resolve(undefined)
    await dispatch

    expect(order).toEqual(['schedule-indexing', 'process-extensions'])
  })

  it('logs an extension processing failure without rejecting the dispatch', async () => {
    const records = [{ id: 1, path: '/tmp/a.txt' }]
    const error = new Error('extension failed')
    const processExtensions = vi.fn(async () => {
      throw error
    })
    const scheduleIndexing = vi.fn()
    const logWarn = vi.fn()
    const service = new IndexedWriteSideEffectService({
      processExtensions,
      scheduleIndexing,
      logWarn,
      formatExtensionFailureMessage: context => `processFileExtensions failed (${context})`,
    })

    await expect(
      service.dispatch(records, {
        extensionContext: 'reconciliation',
        indexReason: 'reconciliation-insert',
      }),
    ).resolves.toBeUndefined()

    expect(logWarn).toHaveBeenCalledWith('processFileExtensions failed (reconciliation)', error)
  })
  it('processes extensions for the whole batch while scheduling only the candidate subset', async () => {
    const records = [
      { id: 1, path: '/tmp/re-admitted.txt' },
      { id: 2, path: '/tmp/completed.txt' },
      { id: 3, path: '/tmp/skipped.txt' },
    ]
    const candidates = records.slice(0, 1)
    const scheduledCalls: Array<{
      ids: number[]
      reason: string
      mutationLeaseId?: string
    }> = []
    const extensionBatches: number[][] = []
    const scheduleIndexing = vi.fn(async (batch: typeof records, reason: string, mutationLeaseId?: string) => {
      scheduledCalls.push({
        ids: batch.map(record => record.id),
        reason,
        mutationLeaseId,
      })
    })
    const processExtensions = vi.fn(async (batch: typeof records) => {
      extensionBatches.push(batch.map(record => record.id))
    })
    const logWarn = vi.fn()
    const service = new IndexedWriteSideEffectService({
      processExtensions,
      scheduleIndexing,
      logWarn,
    })

    await service.dispatch(
      records,
      {
        extensionContext: 'runtime-writer-ack',
        indexReason: 'runtime-writer-ack',
        mutationLeaseId: 'lease-ack',
      },
      candidates,
    )

    // Only the candidate subset may be re-admitted for content indexing...
    expect(scheduledCalls).toEqual([{ ids: [1], reason: 'runtime-writer-ack', mutationLeaseId: 'lease-ack' }])
    // ...while the extension refresh stays a batch-wide side effect.
    expect(extensionBatches).toEqual([[1, 2, 3]])
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('schedules every record when no candidate subset is provided', async () => {
    const records = [
      { id: 1, path: '/tmp/a.txt' },
      { id: 2, path: '/tmp/b.txt' },
    ]
    const scheduledBatches: number[][] = []
    const scheduleIndexing = vi.fn(async (batch: typeof records) => {
      scheduledBatches.push(batch.map(record => record.id))
    })
    const processExtensions = vi.fn(async () => undefined)
    const logWarn = vi.fn()
    const service = new IndexedWriteSideEffectService({
      processExtensions,
      scheduleIndexing,
      logWarn,
    })

    await service.dispatch(records, {
      extensionContext: 'file-update',
      indexReason: 'file-update',
    })

    expect(scheduledBatches).toEqual([[1, 2]])
    expect(processExtensions).toHaveBeenCalledTimes(1)
  })

  it('refreshes extensions without scheduling when no record is a candidate', async () => {
    const records = [
      { id: 1, path: '/tmp/completed.txt' },
      { id: 2, path: '/tmp/failed.txt' },
    ]
    const extensionBatches: number[][] = []
    const scheduleIndexing = vi.fn(async () => undefined)
    const processExtensions = vi.fn(async (batch: typeof records) => {
      extensionBatches.push(batch.map(record => record.id))
    })
    const logWarn = vi.fn()
    const service = new IndexedWriteSideEffectService({
      processExtensions,
      scheduleIndexing,
      logWarn,
    })

    await service.dispatch(
      records,
      {
        extensionContext: 'runtime-writer-ack',
        indexReason: 'runtime-writer-ack',
      },
      [],
    )

    // An all-terminal batch must not be re-admitted for content indexing...
    expect(scheduleIndexing).not.toHaveBeenCalled()
    // ...but its rows still need their extension refresh.
    expect(extensionBatches).toEqual([[1, 2]])
  })
})
