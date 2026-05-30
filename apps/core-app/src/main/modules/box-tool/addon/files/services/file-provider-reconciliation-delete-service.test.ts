import { describe, expect, it, vi } from 'vitest'
import { FileProviderReconciliationDeleteService } from './file-provider-reconciliation-delete-service'

describe('file-provider-reconciliation-delete-service', () => {
  it('deletes reconciled records and emits delete deltas', async () => {
    const records = [
      { id: 1, path: '/tmp/a.txt' },
      { id: 2, path: '/tmp/b.txt' }
    ]
    const deleteRecords = vi.fn(async () => ({
      deleted: records,
      deletedIds: [1, 2],
      deletedPaths: ['/tmp/a.txt', '/tmp/b.txt']
    }))
    const emitDelta = vi.fn(async () => {})
    const service = new FileProviderReconciliationDeleteService({
      sourceId: 'file-provider',
      deleteRecords,
      emitDelta
    })
    const context = { runId: 'reconcile' }

    const result = await service.execute(records, context)

    expect(deleteRecords).toHaveBeenCalledWith(records)
    expect(emitDelta).toHaveBeenCalledTimes(2)
    expect(emitDelta).toHaveBeenNthCalledWith(
      1,
      {
        sourceId: 'file-provider',
        action: 'delete',
        stableKey: '/tmp/a.txt',
        path: '/tmp/a.txt',
        reason: 'file-provider-reconciliation-delete'
      },
      context
    )
    expect(result).toEqual({
      deleted: records,
      deletedCount: 2,
      deletedPaths: ['/tmp/a.txt', '/tmp/b.txt']
    })
  })

  it('returns empty result without work for empty input', async () => {
    const deleteRecords = vi.fn()
    const service = new FileProviderReconciliationDeleteService({
      sourceId: 'file-provider',
      deleteRecords,
      emitDelta: vi.fn()
    })

    await expect(service.execute([], {})).resolves.toEqual({
      deleted: [],
      deletedCount: 0,
      deletedPaths: []
    })
    expect(deleteRecords).not.toHaveBeenCalled()
  })
})
