import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import type {
  PersistAndIndexSummary,
  PersistEntry
} from '../../../search-engine/workers/search-index-worker-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FileProviderIndexRuntimeService,
  type FileProviderIndexRuntimeServiceDeps
} from './file-provider-index-runtime-service'

function createResult(fileId: number): IndexWorkerFileResult {
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
      content: `content-${fileId}`
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

function createPersistSummary(entries: PersistEntry[]): PersistAndIndexSummary {
  return {
    entries: entries.length,
    chunks: entries.length > 0 ? 1 : 0,
    persistedRows: entries.length,
    indexedItems: entries.length,
    fileUpdates: 0,
    progressRows: entries.length,
    embeddings: 0
  }
}

function createService(options: {
  pending: Map<number, IndexWorkerFileResult>
  inflight: Map<number, IndexWorkerFileResult>
  ensureSearchIndexWorkerReady: (reason: string) => Promise<boolean>
  persistAndIndex?: (entries: PersistEntry[]) => Promise<PersistAndIndexSummary>
  logWarn?: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  config?: FileProviderIndexRuntimeServiceDeps['config']
}) {
  const persistAndIndex = vi.fn(
    options.persistAndIndex ?? (async (entries) => createPersistSummary(entries))
  )
  const logWarn = vi.fn(options.logWarn ?? (() => undefined))

  return {
    persistAndIndex,
    logWarn,
    service: new FileProviderIndexRuntimeService({
      flushBatchScheduler: {
        currentSize: 10,
        recordDuration: vi.fn()
      },
      getDbUtils: () => ({}),
      getSearchIndex: () => ({}),
      getPendingResults: () => options.pending,
      getInflightResults: () => options.inflight,
      ensureSearchIndexWorkerReady: options.ensureSearchIndexWorkerReady,
      getSearchIndexWorker: () => ({ persistAndIndex }),
      buildPersistEntries: toPersistEntries,
      logDebug: vi.fn(),
      logWarn,
      config: {
        backlogDelayMs: 1_000,
        ...options.config
      }
    })
  }
}

describe('FileProviderIndexRuntimeService worker readiness', () => {
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('flush waits for the shared search index worker readiness gate', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const inflight = new Map<number, IndexWorkerFileResult>()
    let resolveReady!: (ready: boolean) => void
    const ready = new Promise<boolean>((resolve) => {
      resolveReady = resolve
    })
    const ensureSearchIndexWorkerReady = vi.fn(() => ready)
    const { service, persistAndIndex } = createService({
      pending,
      inflight,
      ensureSearchIndexWorkerReady
    })

    const flush = service.doFlush()
    await Promise.resolve()

    expect(ensureSearchIndexWorkerReady).toHaveBeenCalledWith('index-runtime.flush')
    expect(persistAndIndex).not.toHaveBeenCalled()

    resolveReady(true)
    await flush

    expect(persistAndIndex).toHaveBeenCalledTimes(1)
    expect(pending.size).toBe(0)
    expect(inflight.size).toBe(0)
    expect(service.getFlushSnapshot()).toMatchObject({
      status: 'flushed',
      entries: 1,
      pending: 0,
      inflight: 0,
      reason: 'persisted',
      metadata: {
        withContent: 1,
        persistedRows: 1,
        indexedItems: 1,
        progressRows: 1,
        chunks: 1
      }
    })
  })

  it('records idle flush snapshot when no pending worker results exist', async () => {
    const pending = new Map<number, IndexWorkerFileResult>()
    const inflight = new Map<number, IndexWorkerFileResult>()
    const ensureSearchIndexWorkerReady = vi.fn(async () => true)
    const { service, persistAndIndex } = createService({
      pending,
      inflight,
      ensureSearchIndexWorkerReady
    })

    await service.flush()

    expect(ensureSearchIndexWorkerReady).not.toHaveBeenCalled()
    expect(persistAndIndex).not.toHaveBeenCalled()
    expect(service.getFlushSnapshot()).toMatchObject({
      status: 'idle',
      entries: 0,
      pending: 0,
      inflight: 0,
      reason: 'no-pending'
    })
  })

  it('rolls back the flush batch when worker readiness fails', async () => {
    vi.useFakeTimers()
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const inflight = new Map<number, IndexWorkerFileResult>()
    const { service, persistAndIndex, logWarn } = createService({
      pending,
      inflight,
      ensureSearchIndexWorkerReady: vi.fn(async () => false)
    })

    await service.doFlush()

    expect(persistAndIndex).not.toHaveBeenCalled()
    expect(pending.has(1)).toBe(true)
    expect(inflight.size).toBe(0)
    expect(logWarn).toHaveBeenCalledWith(
      'Index worker flush skipped: worker init unavailable',
      undefined,
      expect.objectContaining({ pending: 1, inflight: 0 })
    )
    expect(service.getFlushSnapshot()).toMatchObject({
      status: 'worker-not-ready',
      entries: 1,
      pending: 1,
      inflight: 0,
      reason: 'not-ready',
      metadata: {
        withContent: 1
      }
    })
  })

  it('records failed flush snapshot with retry metadata', async () => {
    vi.useFakeTimers()
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const inflight = new Map<number, IndexWorkerFileResult>()
    const { service, logWarn } = createService({
      pending,
      inflight,
      ensureSearchIndexWorkerReady: vi.fn(async () => true),
      persistAndIndex: async () => {
        throw new Error('persist exploded')
      }
    })

    await service.flush()

    expect(pending.has(1)).toBe(true)
    expect(inflight.size).toBe(0)
    expect(logWarn).toHaveBeenCalledWith(
      'Index worker flush failed, scheduling retry',
      expect.any(Error),
      expect.objectContaining({
        isBusy: false,
        pending: 1,
        inflight: 0
      })
    )
    expect(service.getFlushSnapshot()).toMatchObject({
      status: 'failed',
      entries: 1,
      pending: 1,
      inflight: 0,
      reason: 'persist-failed',
      error: 'persist exploded',
      metadata: {
        withContent: 1,
        isBusy: false,
        retryReason: 'flush-failed'
      }
    })
  })

  it('uses shared flush runtime config without losing explicit adapter overrides', () => {
    vi.useFakeTimers()
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const inflight = new Map<number, IndexWorkerFileResult>()
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const { service } = createService({
      pending,
      inflight,
      ensureSearchIndexWorkerReady: vi.fn(async () => true),
      config: {
        baseDelayMs: 0
      }
    })

    service.handleIndexWorkerFile(createResult(2))

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0)
  })
})
