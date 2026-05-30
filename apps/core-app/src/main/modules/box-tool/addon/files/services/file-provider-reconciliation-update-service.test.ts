import { describe, expect, it, vi } from 'vitest'
import { FileProviderReconciliationUpdateService } from './file-provider-reconciliation-update-service'

describe('file-provider-reconciliation-update-service', () => {
  it('updates reconciled records and emits change deltas', async () => {
    const updates = [
      {
        id: 1,
        path: '/tmp/a.txt',
        name: 'a.txt'
      }
    ]
    const updated = updates.map((record) => ({ ...record, extension: '.txt' }))
    const updateRecords = vi.fn(async () => updated)
    const emitDelta = vi.fn(async () => {})
    const service = new FileProviderReconciliationUpdateService({
      sourceId: 'file-provider',
      updateRecords,
      emitDelta,
      mapRecord: (record) => ({
        sourceId: 'file-provider',
        recordId: record.path,
        stableKey: record.path,
        kind: 'file',
        title: record.name,
        path: record.path
      })
    })
    const context = { runId: 'reconcile' }

    const result = await service.execute(updates, context)

    expect(updateRecords).toHaveBeenCalledWith(updates)
    expect(emitDelta).toHaveBeenCalledWith(
      {
        sourceId: 'file-provider',
        action: 'change',
        record: expect.objectContaining({
          recordId: '/tmp/a.txt',
          stableKey: '/tmp/a.txt',
          kind: 'file'
        }),
        path: '/tmp/a.txt',
        reason: 'file-provider-reconciliation-update'
      },
      context
    )
    expect(result).toEqual({
      updated,
      updatedCount: 1
    })
  })

  it('returns empty result without work for empty input', async () => {
    const updateRecords = vi.fn()
    const service = new FileProviderReconciliationUpdateService({
      sourceId: 'file-provider',
      updateRecords,
      emitDelta: vi.fn(),
      mapRecord: vi.fn()
    })

    await expect(service.execute([], {})).resolves.toEqual({
      updated: [],
      updatedCount: 0
    })
    expect(updateRecords).not.toHaveBeenCalled()
  })
})
