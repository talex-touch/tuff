import { describe, expect, it, vi } from 'vitest'
import {
  buildIndexedWriteFlushBatchMetrics,
  IndexedWriteBufferService,
  IndexedWriteFlushExecutorService,
  mapIndexedWriteFlushExecutorResult
} from '../../search'

function createExecutor(options: {
  pending: Map<number, string>
  inflight?: Map<number, string>
  isAvailable?: () => boolean
  ensureReady?: () => Promise<boolean>
  persist?: (entries: string[]) => Promise<{ persisted: number } | void>
  nowValues?: number[]
}) {
  const inflight = options.inflight ?? new Map<number, string>()
  const buffer = new IndexedWriteBufferService(options.pending, inflight)
  const recordDuration = vi.fn()
  const waitForCapacity = vi.fn(async () => undefined)
  const persist = vi.fn(options.persist ?? (async () => undefined))
  const ensureReady = vi.fn(options.ensureReady ?? (async () => true))
  const onBatchTaken = vi.fn()
  const nowValues = options.nowValues ?? [10, 25]
  const now = vi.fn(() => nowValues.shift() ?? 25)

  return {
    inflight,
    recordDuration,
    waitForCapacity,
    persist,
    ensureReady,
    onBatchTaken,
    executor: new IndexedWriteFlushExecutorService({
      buffer,
      getBatchSize: () => 2,
      isAvailable: options.isAvailable ?? (() => true),
      ensureReady,
      buildPersistEntries: (entries) => entries.map((entry) => entry.toUpperCase()),
      persist,
      waitForCapacity,
      recordDuration,
      now,
      onBatchTaken,
      resolveBatchMetadata: (entries) => ({ firstEntry: entries[0] }),
      resolvePersistMetadata: (result) =>
        result && typeof result === 'object' ? { persisted: result.persisted } : undefined
    })
  }
}

describe('IndexedWriteFlushExecutorService', () => {
  it('persists a batch and commits inflight entries', async () => {
    const pending = new Map<number, string>([
      [1, 'one'],
      [2, 'two'],
      [3, 'three']
    ])
    const { executor, inflight, persist, waitForCapacity, recordDuration, onBatchTaken } =
      createExecutor({ pending })

    const result = await executor.execute()

    expect(result).toEqual({
      status: 'flushed',
      entries: 2,
      pending: 1,
      inflight: 0,
      reason: 'persisted',
      metadata: { firstEntry: 'one' },
      durationMs: 15
    })
    expect(onBatchTaken).toHaveBeenCalledWith(['one', 'two'])
    expect(waitForCapacity).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledWith(['ONE', 'TWO'])
    expect(recordDuration).toHaveBeenCalledWith(15)
    expect(pending.has(1)).toBe(false)
    expect(pending.has(2)).toBe(false)
    expect(pending.has(3)).toBe(true)
    expect(inflight.size).toBe(0)
  })

  it('merges persist result metadata into the flush result', async () => {
    const pending = new Map<number, string>([
      [1, 'one'],
      [2, 'two']
    ])
    const { executor } = createExecutor({
      pending,
      persist: async () => ({ persisted: 2 })
    })

    await expect(executor.execute()).resolves.toMatchObject({
      status: 'flushed',
      metadata: {
        firstEntry: 'one',
        persisted: 2
      }
    })
  })

  it('normalizes negative or malformed flush duration before recording evidence', async () => {
    const pending = new Map<number, string>([[1, 'one']])
    const { executor, recordDuration } = createExecutor({
      pending,
      nowValues: [25, 10]
    })

    const result = await executor.execute()

    expect(result.durationMs).toBe(0)
    expect(recordDuration).toHaveBeenCalledWith(0)
  })

  it('rolls back the batch when readiness fails', async () => {
    const pending = new Map<number, string>([[1, 'one']])
    const { executor, inflight, persist } = createExecutor({
      pending,
      ensureReady: async () => false
    })

    await expect(executor.execute()).resolves.toMatchObject({
      status: 'not-ready',
      entries: 1,
      pending: 1,
      inflight: 0,
      reason: 'not-ready',
      metadata: { firstEntry: 'one' }
    })
    expect(persist).not.toHaveBeenCalled()
    expect(pending.get(1)).toBe('one')
    expect(inflight.size).toBe(0)
  })

  it('rolls back the batch when persistence fails', async () => {
    const pending = new Map<number, string>([[1, 'one']])
    const { executor, inflight } = createExecutor({
      pending,
      persist: async () => {
        throw new Error('persist failed')
      }
    })

    await expect(executor.execute()).rejects.toMatchObject({
      message: 'persist failed',
      flushResult: {
        status: 'idle',
        entries: 1,
        pending: 1,
        inflight: 0,
        reason: 'persist-failed',
        error: 'persist failed',
        metadata: { firstEntry: 'one' }
      }
    })
    expect(pending.get(1)).toBe('one')
    expect(inflight.size).toBe(0)
  })

  it('returns idle when dependencies are unavailable', async () => {
    const pending = new Map<number, string>([[1, 'one']])
    const { executor, persist } = createExecutor({
      pending,
      isAvailable: () => false
    })

    await expect(executor.execute()).resolves.toMatchObject({
      status: 'idle',
      entries: 0,
      pending: 1,
      reason: 'unavailable'
    })
    expect(persist).not.toHaveBeenCalled()
  })

  it('maps executor results to adapter-specific status and numeric metadata fields', () => {
    const result = mapIndexedWriteFlushExecutorResult(
      {
        status: 'not-ready',
        entries: 2,
        pending: 2,
        inflight: 0,
        reason: 'not-ready',
        metadata: {
          withContent: 1,
          textOnly: 'ignored'
        }
      },
      {
        statusMap: {
          idle: 'idle',
          flushed: 'flushed',
          'not-ready': 'worker-not-ready'
        },
        numericMetadataKeys: ['withContent', 'missing']
      }
    )

    expect(result).toMatchObject({
      status: 'worker-not-ready',
      entries: 2,
      withContent: 1,
      missing: 0,
      metadata: {
        withContent: 1,
        textOnly: 'ignored'
      }
    })
  })

  it('drops malformed numeric metadata while mapping executor results', () => {
    const result = mapIndexedWriteFlushExecutorResult(
      {
        status: 'flushed',
        entries: 2,
        pending: 0,
        inflight: 0,
        metadata: {
          valid: 2,
          negative: -1,
          nan: Number.NaN,
          infinite: Number.POSITIVE_INFINITY
        }
      },
      {
        numericMetadataKeys: ['valid', 'negative', 'nan', 'infinite', 'missing']
      }
    )

    expect(result).toMatchObject({
      status: 'flushed',
      valid: 2,
      negative: 0,
      nan: 0,
      infinite: 0,
      missing: 0
    })
  })

  it('builds numeric metadata from batch metrics', () => {
    const result = buildIndexedWriteFlushBatchMetrics(
      [
        { content: 'one' },
        { content: '' },
        { content: 'three' }
      ],
      [
        {
          key: 'withContent',
          count: (entry) => entry.content.length > 0
        },
        {
          key: 'empty',
          count: (entry) => entry.content.length === 0
        }
      ]
    )

    expect(result).toEqual({
      withContent: 2,
      empty: 1
    })
  })
})
