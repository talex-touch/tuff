import { describe, expect, it, vi } from 'vitest'
import { IndexedWriteFlushExecutorService as SdkIndexedWriteFlushExecutorService } from '@talex-touch/utils/search'
import { IndexedWriteBufferService } from './indexing-write-buffer-service'
import { IndexedWriteFlushExecutorService } from './indexing-write-flush-executor-service'

function createExecutor(options: {
  pending: Map<number, string>
  inflight?: Map<number, string>
  isAvailable?: () => boolean
  ensureReady?: () => Promise<boolean>
  persist?: (entries: string[]) => Promise<void>
}) {
  const inflight = options.inflight ?? new Map<number, string>()
  const buffer = new IndexedWriteBufferService(options.pending, inflight)
  const recordDuration = vi.fn()
  const waitForCapacity = vi.fn(async () => undefined)
  const persist = vi.fn(options.persist ?? (async () => undefined))
  const ensureReady = vi.fn(options.ensureReady ?? (async () => true))
  const onBatchTaken = vi.fn()
  const nowValues = [10, 25]
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
      resolveBatchMetadata: (entries) => ({ firstEntry: entries[0] })
    })
  }
}

describe('indexing-write-flush-executor-service', () => {
  it('re-exports the public SDK executor for legacy CoreApp imports', () => {
    expect(IndexedWriteFlushExecutorService).toBe(SdkIndexedWriteFlushExecutorService)
  })

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
})
