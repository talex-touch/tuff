import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import type { PersistEntry } from '../../../search-engine/workers/search-index-worker-client'
import { describe, expect, it, vi } from 'vitest'
import { FileProviderIndexFlushBufferService } from './file-provider-index-flush-service'
import { FileProviderIndexFlushExecutorService } from './file-provider-index-flush-executor-service'

function createResult(fileId: number, content = `content-${fileId}`): IndexWorkerFileResult {
  return {
    type: 'file',
    taskId: `task-${fileId}`,
    fileId,
    progress: {
      status: 'completed',
      progress: 100,
      processedBytes: 1,
      totalBytes: 1,
      lastError: null,
      updatedAt: new Date().toISOString()
    },
    fileUpdate: null,
    indexItem: {
      itemId: String(fileId),
      providerId: 'file-provider',
      type: 'file',
      name: `file-${fileId}`,
      content
    }
  }
}

function toPersistEntries(entries: IndexWorkerFileResult[]): PersistEntry[] {
  return entries.map((entry) => ({
    fileId: entry.fileId,
    fileUpdate: null,
    progress: {
      status: entry.progress.status,
      progress: entry.progress.progress,
      processedBytes: entry.progress.processedBytes,
      totalBytes: entry.progress.totalBytes,
      lastError: entry.progress.lastError,
      startedAt: entry.progress.startedAt ?? null,
      updatedAt: entry.progress.updatedAt ?? null
    },
    indexItem: entry.indexItem
  }))
}

function createExecutor(options: {
  pending: Map<number, IndexWorkerFileResult>
  inflight?: Map<number, IndexWorkerFileResult>
  dbUtils?: unknown | null
  searchIndex?: unknown | null
  ensureSearchIndexWorkerReady?: (reason: string) => Promise<boolean>
  persistAndIndex?: (entries: PersistEntry[]) => Promise<void>
}) {
  const inflight = options.inflight ?? new Map<number, IndexWorkerFileResult>()
  const buffer = new FileProviderIndexFlushBufferService(options.pending, inflight)
  const recordDuration = vi.fn()
  const waitForCapacity = vi.fn(async () => undefined)
  const persistAndIndex = vi.fn(options.persistAndIndex ?? (async () => undefined))
  const ensureSearchIndexWorkerReady = vi.fn(
    options.ensureSearchIndexWorkerReady ?? (async () => true)
  )
  const nowValues = [100, 145]
  const now = vi.fn(() => nowValues.shift() ?? 145)

  return {
    inflight,
    recordDuration,
    waitForCapacity,
    persistAndIndex,
    ensureSearchIndexWorkerReady,
    executor: new FileProviderIndexFlushExecutorService({
      flushBatchScheduler: {
        currentSize: 2,
        recordDuration
      },
      getDbUtils: () => ('dbUtils' in options ? options.dbUtils : {}),
      getSearchIndex: () => ('searchIndex' in options ? options.searchIndex : {}),
      buffer,
      ensureSearchIndexWorkerReady,
      getSearchIndexWorker: () => ({ persistAndIndex }),
      buildPersistEntries: toPersistEntries,
      logDebug: vi.fn(),
      waitForCapacity,
      now,
      config: {
        dbBackpressureMaxQueued: 3
      }
    })
  }
}

describe('file-provider-index-flush-executor-service', () => {
  it('persists a batch and commits inflight entries', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([
      [1, createResult(1)],
      [2, createResult(2)],
      [3, createResult(3)]
    ])
    const { executor, inflight, persistAndIndex, waitForCapacity, recordDuration } = createExecutor(
      {
        pending
      }
    )

    const result = await executor.execute()

    expect(result).toMatchObject({
      status: 'flushed',
      entries: 2,
      withContent: 2,
      pending: 1,
      inflight: 0,
      reason: 'persisted',
      metadata: { storeBoundary: 'indexed-write-flush', withContent: 2 },
      durationMs: 45
    })
    expect(waitForCapacity).toHaveBeenCalledWith(3)
    expect(persistAndIndex).toHaveBeenCalledTimes(1)
    expect(recordDuration).toHaveBeenCalledWith(45)
    expect(pending.has(1)).toBe(false)
    expect(pending.has(2)).toBe(false)
    expect(pending.has(3)).toBe(true)
    expect(inflight.size).toBe(0)
  })

  it('rolls back the batch when the worker is not ready', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const { executor, inflight, persistAndIndex } = createExecutor({
      pending,
      ensureSearchIndexWorkerReady: async () => false
    })

    const result = await executor.execute()

    expect(result).toMatchObject({
      status: 'worker-not-ready',
      entries: 1,
      pending: 1,
      inflight: 0,
      reason: 'not-ready',
      metadata: { storeBoundary: 'indexed-write-flush', withContent: 1 }
    })
    expect(persistAndIndex).not.toHaveBeenCalled()
    expect(pending.has(1)).toBe(true)
    expect(inflight.size).toBe(0)
  })

  it('rolls back the batch when persist fails', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const persistError = new Error('persist failed')
    const { executor, inflight } = createExecutor({
      pending,
      persistAndIndex: async () => {
        throw persistError
      }
    })

    await expect(executor.execute()).rejects.toThrow('persist failed')

    expect(pending.has(1)).toBe(true)
    expect(inflight.size).toBe(0)
  })

  it('returns idle when storage dependencies are unavailable', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const { executor, persistAndIndex, waitForCapacity, ensureSearchIndexWorkerReady, inflight } =
      createExecutor({
        pending,
        dbUtils: null
      })

    await expect(executor.execute()).resolves.toMatchObject({
      status: 'idle',
      entries: 0,
      pending: 1,
      reason: 'unavailable'
    })
    expect(pending.has(1)).toBe(true)
    expect(inflight.size).toBe(0)
    expect(ensureSearchIndexWorkerReady).not.toHaveBeenCalled()
    expect(waitForCapacity).not.toHaveBeenCalled()
    expect(persistAndIndex).not.toHaveBeenCalled()
  })
})
