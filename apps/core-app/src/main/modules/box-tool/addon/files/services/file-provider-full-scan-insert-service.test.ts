import { describe, expect, it, vi } from 'vitest'
import { FileProviderFullScanInsertService } from './file-provider-full-scan-insert-service'

describe('file-provider-full-scan-insert-service', () => {
  it('upserts full-scan records with adaptive batches, side effects, batches, progress, and pacing', async () => {
    const records = [
      {
        path: '/tmp/a.txt',
        name: 'a.txt',
        extension: '.txt',
        size: 1,
        mtime: new Date(1000),
        ctime: new Date(1000),
        lastIndexedAt: new Date(1000),
        isDir: false,
        type: 'file'
      },
      {
        path: '/tmp/b.txt',
        name: 'b.txt',
        extension: '.txt',
        size: 2,
        mtime: new Date(2000),
        ctime: new Date(2000),
        lastIndexedAt: new Date(2000),
        isDir: false,
        type: 'file'
      }
    ]
    const inserted = records.map((record, index) => ({ ...record, id: index + 1 }))
    const upsertFiles = vi.fn(async (chunk) =>
      inserted.filter((record) => chunk.some((item) => item.path === record.path))
    )
    const dispatchSideEffects = vi.fn()
    const emitRecordBatch = vi.fn(async () => {})
    const emitProgress = vi.fn()
    const sleep = vi.fn(async () => {})
    const recordBatchDuration = vi.fn()
    let now = 0
    const service = new FileProviderFullScanInsertService({
      sourceId: 'file-provider',
      getBatchSize: () => 1,
      recordBatchDuration,
      waitForIdle: vi.fn(async () => {}),
      upsertFiles,
      dispatchSideEffects,
      emitRecordBatch,
      mapRecord: (record) => ({
        sourceId: 'file-provider',
        recordId: record.path,
        stableKey: record.path,
        kind: 'file',
        title: record.name,
        path: record.path
      }),
      emitProgress,
      sleep,
      now: () => {
        now += 30
        return now
      },
      formatDuration: (durationMs) => `${durationMs}ms`,
      logInfo: vi.fn(),
      logDebug: vi.fn()
    })

    const context = { runId: 'full-scan' }
    const result = await service.execute('/tmp', records, context)

    expect(upsertFiles).toHaveBeenNthCalledWith(1, [records[0]], 'full-scan.upsert')
    expect(upsertFiles).toHaveBeenNthCalledWith(2, [records[1]], 'full-scan.upsert')
    expect(recordBatchDuration).toHaveBeenCalledWith(30)
    expect(dispatchSideEffects).toHaveBeenCalledTimes(2)
    expect(emitRecordBatch).toHaveBeenNthCalledWith(
      1,
      {
        sourceId: 'file-provider',
        records: [expect.objectContaining({ recordId: '/tmp/a.txt', stableKey: '/tmp/a.txt' })]
      },
      context
    )
    expect(emitRecordBatch).toHaveBeenNthCalledWith(
      2,
      {
        sourceId: 'file-provider',
        records: [expect.objectContaining({ recordId: '/tmp/b.txt', stableKey: '/tmp/b.txt' })]
      },
      context
    )
    expect(emitProgress).toHaveBeenNthCalledWith(1, 0, 2)
    expect(emitProgress).toHaveBeenLastCalledWith(2, 2)
    expect(sleep).toHaveBeenCalledWith(100)
    expect(result).toEqual({
      inserted,
      insertedCount: 2
    })
  })

  it('returns empty result without work for empty input', async () => {
    const upsertFiles = vi.fn()
    const service = new FileProviderFullScanInsertService({
      sourceId: 'file-provider',
      getBatchSize: () => 1,
      recordBatchDuration: vi.fn(),
      waitForIdle: vi.fn(),
      upsertFiles,
      dispatchSideEffects: vi.fn(),
      emitRecordBatch: vi.fn(),
      mapRecord: vi.fn(),
      emitProgress: vi.fn(),
      sleep: vi.fn(),
      now: () => 0,
      formatDuration: (durationMs) => `${durationMs}ms`,
      logInfo: vi.fn(),
      logDebug: vi.fn()
    })

    await expect(service.execute('/tmp', [], {})).resolves.toEqual({
      inserted: [],
      insertedCount: 0
    })
    expect(upsertFiles).not.toHaveBeenCalled()
  })
})
