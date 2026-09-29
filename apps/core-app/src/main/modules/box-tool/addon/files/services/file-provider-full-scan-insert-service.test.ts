import { describe, expect, it, vi } from 'vitest'
import type { IndexedSourceRecordBatch } from '@talex-touch/utils/search'
import {
  FileProviderFullScanInsertService,
  resolveFullScanPacingMs
} from './file-provider-full-scan-insert-service'

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
    // Only the count survives the run; the per-chunk rows handed back by `upsertFiles`
    // (still needed for the legacy publication below) must not be retained on the result.
    expect(result).toEqual({
      insertedCount: 2
    })
  })

  it('sums the fused batch counts across chunks without retaining rows or republishing them', async () => {
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
      },
      {
        path: '/tmp/d.txt',
        name: 'd.txt',
        extension: '.txt',
        size: 4,
        mtime: new Date(4000),
        ctime: new Date(4000),
        lastIndexedAt: new Date(4000),
        isDir: false,
        type: 'file'
      },
      {
        path: '/tmp/e.txt',
        name: 'e.txt',
        extension: '.txt',
        size: 5,
        mtime: new Date(5000),
        ctime: new Date(5000),
        lastIndexedAt: new Date(5000),
        isDir: false,
        type: 'file'
      }
    ]

    // Chunks are [a,b] [c,d] [e]; the per-chunk counts are deliberately neither the chunk
    // sizes (2, 2, 1) nor the scanned record count (5). Only a service that accumulates the
    // number the fused dependency returns can land on 4, so a regression that reports the
    // scanned row count instead -- or that drops a chunk's count -- reddens here.
    const fusedCounts = [2, 1, 1]

    const events: string[] = []
    let releaseFirstFused = () => {}
    const firstFusedGate = new Promise<void>((resolve) => {
      releaseFirstFused = resolve
    })

    let fusedCall = 0
    const persistAndEmitBatch = vi.fn(async (_chunk: Array<{ path: string }>) => {
      fusedCall += 1
      const current = fusedCall
      events.push(`fused:start:${current}`)
      if (current === 1) {
        await firstFusedGate
      }
      events.push(`fused:end:${current}`)
      return { insertedCount: fusedCounts[current - 1] ?? 0 }
    })
    // The fused dependency owns persistence *and* publication, so the row-returning upsert
    // and the separate batch emitter must never be reached: a regression that keeps them
    // would double-write and double-publish every chunk. The mock still declares the
    // persisted-row shape (what `mapRecord` reads) because that is `TInserted` here.
    const upsertFiles = vi.fn(async () => [] as Array<(typeof records)[number]>)
    const emitRecordBatch = vi.fn(async () => {})
    const emitProgress = vi.fn()
    const service = new FileProviderFullScanInsertService({
      sourceId: 'file-provider',
      getBatchSize: () => 2,
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
    const execution = service.execute('/tmp', records, context)

    await flushMicrotasks()

    // The first chunk's fused persistence/publication is admitted but gated. Because the
    // fused path carries no rows between chunks, each chunk must fully settle before the
    // next one starts -- so exactly one fused call is observed here, in chunk order.
    expect(events).toEqual(['fused:start:1'])
    expect(upsertFiles).not.toHaveBeenCalled()
    expect(emitRecordBatch).not.toHaveBeenCalled()

    releaseFirstFused()
    const result = await execution

    expect(events).toEqual([
      'fused:start:1',
      'fused:end:1',
      'fused:start:2',
      'fused:end:2',
      'fused:start:3',
      'fused:end:3'
    ])
    // Each chunk is handed to the fused dependency exactly once, in source order, with the
    // original rows -- the count-only contract must not perturb chunking.
    expect(persistAndEmitBatch).toHaveBeenNthCalledWith(1, [records[0], records[1]], context)
    expect(persistAndEmitBatch).toHaveBeenNthCalledWith(2, [records[2], records[3]], context)
    expect(persistAndEmitBatch).toHaveBeenNthCalledWith(3, [records[4]], context)
    expect(upsertFiles).not.toHaveBeenCalled()
    expect(emitRecordBatch).not.toHaveBeenCalled()
    // The result exposes the summed count and nothing else: no row array is accumulated.
    expect(result).toEqual({ insertedCount: 4 })
    expect(emitProgress).toHaveBeenNthCalledWith(1, 0, 5)
    expect(emitProgress).toHaveBeenLastCalledWith(5, 5)
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
      insertedCount: 2
    })
    expect(emitProgress).toHaveBeenLastCalledWith(2, 2)
  })

  it('parks long enough to hold the reported worker CPU to the 35% duty cycle', async () => {
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
      }
    ]
    const sleep = vi.fn(async () => {})
    const recordBatchDuration = vi.fn()
    // The fused path never calls this, but its declared row shape is what types `mapRecord`.
    const upsertFiles = vi.fn(async () => [] as typeof records)
    // `now` is called as [waitStart, waitEnd, chunkStart, chunkEnd], so the chunk's own wall
    // time is 100ms while its worker reported 140ms of CPU inside that window.
    const ticks = [0, 0, 100, 200]
    let tickIndex = 0
    const service = new FileProviderFullScanInsertService({
      sourceId: 'file-provider',
      getBatchSize: () => 1,
      recordBatchDuration,
      waitForIdle: vi.fn(async () => {}),
      upsertFiles,
      persistAndEmitBatch: vi.fn(async () => ({
        insertedCount: 1,
        workerCpuMicros: 140_000
      })),
      emitRecordBatch: vi.fn(async () => {}),
      mapRecord: (record) => ({
        sourceId: 'file-provider',
        recordId: record.path,
        stableKey: record.path,
        kind: 'file',
        title: record.name,
        path: record.path
      }),
      emitProgress: vi.fn(),
      sleep,
      now: () => ticks[Math.min(tickIndex++, ticks.length - 1)] ?? 0,
      formatDuration: (durationMs) => `${durationMs}ms`,
      logInfo: vi.fn(),
      logDebug: vi.fn()
    })

    await expect(service.execute('/tmp', records, { runId: 'full-scan' })).resolves.toEqual({
      insertedCount: 1
    })

    expect(recordBatchDuration).toHaveBeenCalledWith(100)
    // required period = 140ms / 0.35 = 400ms, minus the 100ms the chunk already spent. The
    // 300ms park is above the cooperative floor, so only the reported CPU can produce it.
    expect(sleep).toHaveBeenCalledWith(300)
  })

  it('paces by the cooperative window, the proportional backoff or the CPU budget, whichever is largest', () => {
    const cases: Array<{
      name: string
      batchMs: number
      workerCpuMicros?: number
      expected: number
    }> = [
      {
        name: 'a fast chunk with no worker CPU metrics still yields the cooperative window',
        batchMs: 10,
        expected: 250
      },
      {
        name: 'a chunk one millisecond under the slow threshold still yields the cooperative window',
        batchMs: 249,
        workerCpuMicros: 0,
        expected: 250
      },
      {
        name: 'a chunk at the slow threshold backs off by its own duration',
        batchMs: 250,
        expected: 250
      },
      {
        name: 'a very slow chunk is clamped at the backoff ceiling',
        batchMs: 2_600,
        expected: 1_000
      },
      {
        name: 'worker CPU whose duty cycle fits inside the cooperative window keeps the window',
        batchMs: 100,
        workerCpuMicros: 100_000,
        expected: 250
      },
      {
        name: 'worker CPU beyond the cooperative window extends the park (140ms CPU in a 100ms chunk -> 300ms)',
        batchMs: 100,
        workerCpuMicros: 140_000,
        expected: 300
      },
      {
        name: 'worker CPU exactly at the 35% budget adds nothing to the slow-chunk backoff',
        batchMs: 1_000,
        workerCpuMicros: 350_000,
        expected: 1_000
      },
      {
        name: 'a negligible CPU reading cannot shorten the cooperative window',
        batchMs: 100,
        workerCpuMicros: 1_000,
        expected: 250
      },
      {
        name: 'a non-numeric CPU reading cannot lengthen the park',
        batchMs: 250,
        workerCpuMicros: Number.NaN,
        expected: 250
      }
    ]

    for (const testCase of cases) {
      expect(
        resolveFullScanPacingMs(testCase.batchMs, testCase.workerCpuMicros),
        testCase.name
      ).toBe(testCase.expected)
    }
  })
})
