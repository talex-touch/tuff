import { describe, expect, it, vi } from 'vitest'
import { FileProviderReconciliationInsertService } from './file-provider-reconciliation-insert-service'

describe('file-provider-reconciliation-insert-service', () => {
  it('upserts reconciliation files and emits side effects, batches, deltas, and progress', async () => {
    const filesToAdd = [
      {
        path: '/tmp/a.txt',
        name: 'a.txt',
        extension: '.txt',
        size: 1,
        mtime: 1000,
        ctime: 1000
      },
      {
        path: '/tmp/b.txt',
        name: 'b.txt',
        extension: '.txt',
        size: 2,
        mtime: 2000,
        ctime: 2000
      }
    ]
    const inserted = filesToAdd.map((file, index) => ({ ...file, id: index + 1 }))
    const upsertFiles = vi.fn(async () => inserted)
    const dispatchSideEffects = vi.fn()
    const emitRecordBatch = vi.fn(async () => {})
    const emitDelta = vi.fn(async () => {})
    const emitProgress = vi.fn()
    const runQueue = vi.fn(async (chunks, handler) => {
      for (let index = 0; index < chunks.length; index += 1) {
        await handler(chunks[index]!, index)
      }
    })
    let now = 0
    const service = new FileProviderReconciliationInsertService({
      sourceId: 'file-provider',
      waitForIdle: vi.fn(async () => {}),
      runQueue,
      upsertFiles,
      dispatchSideEffects,
      emitRecordBatch,
      emitDelta,
      mapRecord: (record) => ({
        sourceId: 'file-provider',
        recordId: record.path,
        stableKey: record.path,
        kind: 'file',
        title: record.name,
        path: record.path
      }),
      emitProgress,
      now: () => {
        now += 5
        return now
      },
      formatDuration: (durationMs) => `${durationMs}ms`,
      logDebug: vi.fn()
    })

    const context = { runId: 'test-run' }
    const result = await service.execute(filesToAdd, context)

    expect(runQueue).toHaveBeenCalledWith(
      [
        [
          expect.objectContaining({ path: '/tmp/a.txt', lastIndexedAt: expect.any(Date) }),
          expect.objectContaining({ path: '/tmp/b.txt', lastIndexedAt: expect.any(Date) })
        ]
      ],
      expect.any(Function),
      {
        estimatedTaskTimeMs: 20,
        label: 'FileProvider::reconciliationInsert'
      }
    )
    expect(upsertFiles).toHaveBeenCalledWith(expect.any(Array), 'reconciliation.upsert')
    expect(dispatchSideEffects).toHaveBeenCalledWith(inserted)
    expect(emitRecordBatch).toHaveBeenCalledWith(inserted, context)
    expect(emitDelta).toHaveBeenCalledTimes(2)
    expect(emitDelta).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'file-provider',
        action: 'add',
        path: '/tmp/a.txt',
        reason: 'file-provider-reconciliation-add'
      }),
      context
    )
    expect(emitProgress).toHaveBeenNthCalledWith(1, 0, 2)
    expect(emitProgress).toHaveBeenLastCalledWith(2, 2)
    expect(result.inserted).toEqual(inserted)
    expect(result.insertedCount).toBe(2)
  })

  it('returns empty result without work for empty input', async () => {
    const runQueue = vi.fn()
    const service = new FileProviderReconciliationInsertService({
      sourceId: 'file-provider',
      waitForIdle: vi.fn(),
      runQueue,
      upsertFiles: vi.fn(),
      dispatchSideEffects: vi.fn(),
      emitRecordBatch: vi.fn(),
      emitDelta: vi.fn(),
      mapRecord: vi.fn(),
      emitProgress: vi.fn(),
      now: () => 0,
      formatDuration: (durationMs) => `${durationMs}ms`,
      logDebug: vi.fn()
    })

    await expect(service.execute([], {})).resolves.toEqual({ inserted: [], insertedCount: 0 })
    expect(runQueue).not.toHaveBeenCalled()
  })
})
