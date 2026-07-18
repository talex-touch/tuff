import { describe, expect, it, vi } from 'vitest'
import { FileProviderReconciliationInsertService } from './file-provider-reconciliation-insert-service'
import type { UpsertFileRecord } from '../../../search-engine/workers/search-index-worker-client'

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
      shouldEmitRecordBatch: () => true,
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
    expect(emitRecordBatch).toHaveBeenCalledWith(
      {
        sourceId: 'file-provider',
        records: [
          expect.objectContaining({ recordId: '/tmp/a.txt', stableKey: '/tmp/a.txt' }),
          expect.objectContaining({ recordId: '/tmp/b.txt', stableKey: '/tmp/b.txt' })
        ]
      },
      context
    )
    expect(emitDelta).not.toHaveBeenCalled()
    expect(emitProgress).toHaveBeenNthCalledWith(1, 0, 2)
    expect(emitProgress).toHaveBeenLastCalledWith(2, 2)
    expect(result.inserted).toEqual(inserted)
    expect(result.insertedCount).toBe(2)
  })

  it('normalizes write dates before upserting records', async () => {
    const upsertFiles = vi.fn(async (_records: UpsertFileRecord[], _reason: string) => [])
    const service = new FileProviderReconciliationInsertService({
      sourceId: 'file-provider',
      waitForIdle: vi.fn(async () => {}),
      runQueue: vi.fn(
        async (
          chunks: UpsertFileRecord[][],
          handler: (chunk: UpsertFileRecord[], index: number) => Promise<void>
        ) => {
          await handler(chunks[0] ?? [], 0)
        }
      ),
      upsertFiles,
      shouldEmitRecordBatch: () => false,
      emitRecordBatch: vi.fn(async () => {}),
      emitDelta: vi.fn(async () => {}),
      mapRecord: (record: { path: string }) => ({
        sourceId: 'file-provider',
        recordId: record.path,
        stableKey: record.path,
        kind: 'file',
        title: record.path
      }),
      emitProgress: vi.fn(),
      now: () => 0,
      formatDuration: (durationMs) => `${durationMs}ms`,
      logDebug: vi.fn()
    })

    await service.execute(
      [
        {
          path: '/tmp/invalid.txt',
          name: 'invalid.txt',
          extension: '.txt',
          size: 1,
          mtime: 'invalid',
          ctime: null as unknown as string
        }
      ],
      {}
    )

    const records = upsertFiles.mock.calls[0]?.[0]
    expect(records?.[0]).toEqual(
      expect.objectContaining({
        path: '/tmp/invalid.txt',
        mtime: new Date(0),
        ctime: new Date(0)
      })
    )
  })

  it('returns empty result without work for empty input', async () => {
    const runQueue = vi.fn()
    const service = new FileProviderReconciliationInsertService({
      sourceId: 'file-provider',
      waitForIdle: vi.fn(),
      runQueue,
      upsertFiles: vi.fn(),
      shouldEmitRecordBatch: () => false,
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
