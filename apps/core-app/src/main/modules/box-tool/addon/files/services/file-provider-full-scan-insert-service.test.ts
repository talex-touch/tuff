import { describe, expect, it, vi } from 'vitest'
import type { IndexedSourceRecordBatch } from '@talex-touch/utils/search'
import { FileProviderFullScanInsertService } from './file-provider-full-scan-insert-service'

/**
 * Yield microtask turns so the persistence/publication chain can run up to the point
 * where it parks on a pending publication. The chain contains no timers, so a prefetch
 * that is going to start has already started well inside this budget -- which is what
 * gives the "must not prefetch" assertion its teeth: a regression that prefetches would
 * show up here, while a pending publication keeps the pipeline parked.
 */
const flushMicrotasks = async (turns = 50): Promise<void> => {
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve()
  }
}

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
    const upsertFiles = vi.fn(async (chunk: Array<{ path: string }>) =>
      inserted.filter((record) => chunk.some((item) => item.path === record.path))
    )
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
    expect(result).toEqual({
      inserted,
      insertedCount: 2
    })
  })

  it('returns the rows persisted by the fused batch callback and never touches the normal emit path', async () => {
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
    const persisted = records.map((record, index) => ({ ...record, id: index + 1 }))
    // The fused callback owns persistence *and* publication, so the non-fused pair must
    // never be reached: a regression that keeps emitting would double-publish the chunk,
    // and one that keeps upserting would double-write the file rows.
    const upsertFiles = vi.fn(async () => [] as typeof persisted)
    const emitRecordBatch = vi.fn(async () => {})
    const persistAndEmitBatch = vi.fn(async (chunk: Array<{ path: string }>) =>
      persisted.filter((record) => chunk.some((item) => item.path === record.path))
    )
    const emitProgress = vi.fn()
    const service = new FileProviderFullScanInsertService({
      sourceId: 'file-provider',
      getBatchSize: () => 1,
      recordBatchDuration: vi.fn(),
      waitForIdle: vi.fn(async () => {}),
      upsertFiles,
      persistAndEmitBatch,
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
      sleep: vi.fn(async () => {}),
      now: () => 0,
      formatDuration: (durationMs) => `${durationMs}ms`,
      logInfo: vi.fn(),
      logDebug: vi.fn()
    })

    const context = { runId: 'full-scan' }
    const result = await service.execute('/tmp', records, context)

    expect(persistAndEmitBatch).toHaveBeenNthCalledWith(1, [records[0]], context)
    expect(persistAndEmitBatch).toHaveBeenNthCalledWith(2, [records[1]], context)
    expect(upsertFiles).not.toHaveBeenCalled()
    expect(emitRecordBatch).not.toHaveBeenCalled()
    expect(result).toEqual({
      inserted: persisted,
      insertedCount: 2
    })
    expect(emitProgress).toHaveBeenLastCalledWith(2, 2)
  })

  it('returns empty result without work for empty input', async () => {
    const upsertFiles = vi.fn()
    const service = new FileProviderFullScanInsertService({
      sourceId: 'file-provider',
      getBatchSize: () => 1,
      recordBatchDuration: vi.fn(),
      waitForIdle: vi.fn(),
      upsertFiles,
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

  it('starts the next chunk persistence while the previous batch publication is still in flight, without running two ahead', async () => {
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
      },
      {
        path: '/tmp/c.txt',
        name: 'c.txt',
        extension: '.txt',
        size: 3,
        mtime: new Date(3000),
        ctime: new Date(3000),
        lastIndexedAt: new Date(3000),
        isDir: false,
        type: 'file'
      }
    ]
    const inserted = records.map((record, index) => ({ ...record, id: index + 1 }))

    // Explicit interleaving log: every push is an externally observable edge of the
    // persistence/publication pipeline, so ordering assertions read as the contract.
    const events: string[] = []
    let releaseFirstEmit = () => {}
    const firstEmitGate = new Promise<void>((resolve) => {
      releaseFirstEmit = resolve
    })
    let firstEmitSettled = false

    let upsertCall = 0
    const upsertFiles = vi.fn(async (chunk: Array<{ path: string }>) => {
      upsertCall += 1
      const current = upsertCall
      events.push(`upsert:start:${current}`)
      const batch = inserted.filter((record) => chunk.some((item) => item.path === record.path))
      events.push(`upsert:end:${current}`)
      return batch
    })

    let emitCall = 0
    const emitRecordBatch = vi.fn(async (_batch: IndexedSourceRecordBatch) => {
      emitCall += 1
      const current = emitCall
      events.push(`emit:start:${current}`)
      if (current === 1) {
        await firstEmitGate
        firstEmitSettled = true
      }
      events.push(`emit:end:${current}`)
    })
    const emitProgress = vi.fn()
    let now = 0
    const service = new FileProviderFullScanInsertService({
      sourceId: 'file-provider',
      getBatchSize: () => 1,
      recordBatchDuration: vi.fn(),
      waitForIdle: vi.fn(async () => {}),
      upsertFiles,
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
      sleep: vi.fn(async () => {}),
      now: () => {
        now += 10
        return now
      },
      formatDuration: (durationMs) => `${durationMs}ms`,
      logInfo: vi.fn(),
      logDebug: vi.fn()
    })

    const context = { runId: 'full-scan' }
    const execution = service.execute('/tmp', records, context)

    await flushMicrotasks()

    // The first publication has been admitted but cannot resolve until the gate opens,
    // and the next chunk is already persisting behind it.
    expect(events).toContain('emit:start:1')
    expect(events).toContain('upsert:start:2')
    expect(events).not.toContain('emit:end:1')
    expect(firstEmitSettled).toBe(false)
    // Only one chunk may run ahead while that publication is outstanding.
    expect(events).not.toContain('upsert:start:3')

    releaseFirstEmit()
    const result = await execution

    // The gate really was awaited, so the ordering above was measured against a
    // genuinely in-flight publication rather than a fake that resolved immediately.
    expect(firstEmitSettled).toBe(true)
    // Prefetch starts after admission and finishes while the first publication is pending.
    expect(events.indexOf('upsert:start:2')).toBeGreaterThan(events.indexOf('emit:start:1'))
    expect(events.indexOf('upsert:start:2')).toBeLessThan(events.indexOf('emit:end:1'))
    // Never more than one ahead: the third chunk waits for the first publication.
    expect(events.indexOf('upsert:start:3')).toBeGreaterThan(events.indexOf('emit:end:1'))

    // Batches are still published in source order, one per chunk.
    expect(events.indexOf('emit:start:1')).toBeLessThan(events.indexOf('emit:start:2'))
    expect(events.indexOf('emit:start:2')).toBeLessThan(events.indexOf('emit:start:3'))
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
    expect(emitRecordBatch).toHaveBeenNthCalledWith(
      3,
      {
        sourceId: 'file-provider',
        records: [expect.objectContaining({ recordId: '/tmp/c.txt', stableKey: '/tmp/c.txt' })]
      },
      context
    )

    expect(result).toEqual({
      inserted,
      insertedCount: 3
    })
    expect(emitProgress).toHaveBeenLastCalledWith(3, 3)
  })

  it('holds the next chunk persistence until publication resolves when the batch ran slow', async () => {
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

    const events: string[] = []
    let releaseFirstEmit = () => {}
    const firstEmitGate = new Promise<void>((resolve) => {
      releaseFirstEmit = resolve
    })
    let firstEmitSettled = false

    let upsertCall = 0
    const upsertFiles = vi.fn(async (chunk: Array<{ path: string }>) => {
      upsertCall += 1
      const current = upsertCall
      events.push(`upsert:start:${current}`)
      const batch = inserted.filter((record) => chunk.some((item) => item.path === record.path))
      events.push(`upsert:end:${current}`)
      return batch
    })

    let emitCall = 0
    const emitRecordBatch = vi.fn(async (_batch: IndexedSourceRecordBatch) => {
      emitCall += 1
      const current = emitCall
      events.push(`emit:start:${current}`)
      if (current === 1) {
        await firstEmitGate
        firstEmitSettled = true
      }
      events.push(`emit:end:${current}`)
    })
    const emitProgress = vi.fn()
    const sleep = vi.fn(async () => {})
    let now = 0
    const service = new FileProviderFullScanInsertService({
      sourceId: 'file-provider',
      getBatchSize: () => 1,
      recordBatchDuration: vi.fn(),
      waitForIdle: vi.fn(async () => {}),
      upsertFiles,
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
      // Every chunk measures exactly the 250ms slow-chunk boundary, so both batches
      // take the no-look-ahead branch.
      now: () => {
        now += 250
        return now
      },
      formatDuration: (durationMs) => `${durationMs}ms`,
      logInfo: vi.fn(),
      logDebug: vi.fn()
    })

    const context = { runId: 'full-scan' }
    const execution = service.execute('/tmp', records, context)

    await flushMicrotasks()

    // The slow batch's publication is still outstanding, and nothing may have started
    // persisting behind it.
    expect(events).toContain('emit:start:1')
    expect(events).not.toContain('emit:end:1')
    expect(firstEmitSettled).toBe(false)
    expect(events).not.toContain('upsert:start:2')

    releaseFirstEmit()
    const result = await execution

    expect(firstEmitSettled).toBe(true)
    // The next chunk persists only once the slow publication has resolved.
    expect(events.indexOf('upsert:start:2')).toBeGreaterThan(events.indexOf('emit:end:1'))
    // A chunk at the boundary also takes the single backoff park.
    expect(sleep).toHaveBeenCalledWith(250)

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
    expect(result).toEqual({
      inserted,
      insertedCount: 2
    })
    expect(emitProgress).toHaveBeenLastCalledWith(2, 2)
  })
})
