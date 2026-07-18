import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import type {
  PersistEntriesSummary,
  FilePersistenceEntry
} from '../../../search-engine/workers/search-index-worker-client'
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

function toPersistEntries(entries: IndexWorkerFileResult[]): FilePersistenceEntry[] {
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
    }
  }))
}

function createPersistSummary(entries: FilePersistenceEntry[]): PersistEntriesSummary {
  return {
    entries: entries.length,
    chunks: entries.length > 0 ? 1 : 0,
    persistedRows: entries.length,
    fileUpdates: 0,
    progressRows: entries.length,
    embeddings: 0
  }
}

function createExecutor(options: {
  pending: Map<number, IndexWorkerFileResult>
  inflight?: Map<number, IndexWorkerFileResult>
  dbUtils?: unknown | null
  searchIndex?: unknown | null
  ensureSearchIndexWorkerReady?: (reason: string) => Promise<boolean>
  persistEntries?: (entries: FilePersistenceEntry[]) => Promise<PersistEntriesSummary>
  publishRecords?: (entries: IndexWorkerFileResult[]) => Promise<number>
}) {
  const inflight = options.inflight ?? new Map<number, IndexWorkerFileResult>()
  const buffer = new FileProviderIndexFlushBufferService(options.pending, inflight)
  const recordDuration = vi.fn()
  const waitForCapacity = vi.fn(async () => undefined)
  const persistEntries = vi.fn(
    options.persistEntries ?? (async (entries) => createPersistSummary(entries))
  )
  const ensureSearchIndexWorkerReady = vi.fn(
    options.ensureSearchIndexWorkerReady ?? (async () => true)
  )
  const publishRecords = vi.fn(options.publishRecords ?? (async (entries) => entries.length))
  const nowValues = [100, 145]
  const now = vi.fn(() => nowValues.shift() ?? 145)

  return {
    inflight,
    recordDuration,
    waitForCapacity,
    persistEntries,
    publishRecords,
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
      getSearchIndexWorker: () => ({ persistEntries }),
      buildPersistEntries: toPersistEntries,
      publishRecords,
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
    const { executor, inflight, persistEntries, publishRecords, waitForCapacity, recordDuration } =
      createExecutor({
        pending
      })

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
    expect(result.metadata).toMatchObject({
      persistedRows: 2,
      indexedItems: 2,
      progressRows: 2,
      chunks: 1
    })
    expect(waitForCapacity).toHaveBeenCalledWith(3)
    expect(persistEntries).toHaveBeenCalledTimes(1)
    expect(persistEntries.mock.calls[0][0][0]).not.toHaveProperty('indexItem')
    expect(publishRecords).toHaveBeenCalledWith([
      expect.objectContaining({ indexItem: expect.objectContaining({ itemId: '1' }) }),
      expect.objectContaining({ indexItem: expect.objectContaining({ itemId: '2' }) })
    ])
    expect(recordDuration).toHaveBeenCalledWith(45)
    expect(pending.has(1)).toBe(false)
    expect(pending.has(2)).toBe(false)
    expect(pending.has(3)).toBe(true)
    expect(inflight.size).toBe(0)
  })

  it('publishes only committed records when persistence marks a file stale', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([
      [1, createResult(1)],
      [2, createResult(2)]
    ])
    const { executor, publishRecords } = createExecutor({
      pending,
      persistEntries: async (entries) => ({
        ...createPersistSummary(entries),
        persistedRows: 1,
        progressRows: 1,
        staleFileIds: [2]
      })
    })

    const result = await executor.execute()

    expect(publishRecords).toHaveBeenCalledWith([
      expect.objectContaining({ indexItem: expect.objectContaining({ itemId: '1' }) })
    ])
    expect(result.metadata).toMatchObject({
      persistedRows: 1,
      progressRows: 1,
      indexedItems: 1,
      staleEntries: 1
    })
  })

  it('rolls back the batch when the worker is not ready', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const { executor, inflight, persistEntries } = createExecutor({
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
    expect(persistEntries).not.toHaveBeenCalled()
    expect(pending.has(1)).toBe(true)
    expect(inflight.size).toBe(0)
  })

  it('rolls back the batch when persist fails', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const persistError = new Error('persist failed')
    const { executor, inflight } = createExecutor({
      pending,
      persistEntries: async () => {
        throw persistError
      }
    })

    await expect(executor.execute()).rejects.toThrow('persist failed')

    expect(pending.has(1)).toBe(true)
    expect(inflight.size).toBe(0)
  })

  it('keeps the local batch retryable when runtime publication fails after persistence', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const publishError = new Error('runtime publish failed')
    const { executor, inflight, persistEntries, publishRecords } = createExecutor({
      pending,
      publishRecords: async () => {
        throw publishError
      }
    })

    await expect(executor.execute()).rejects.toThrow('runtime publish failed')

    expect(persistEntries).toHaveBeenCalledTimes(1)
    expect(publishRecords).toHaveBeenCalledTimes(1)
    expect(pending.get(1)).toMatchObject({ fileId: 1 })
    expect(inflight.size).toBe(0)
  })

  it('returns idle when storage dependencies are unavailable', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const { executor, persistEntries, waitForCapacity, ensureSearchIndexWorkerReady, inflight } =
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
    expect(persistEntries).not.toHaveBeenCalled()
  })
})
