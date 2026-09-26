import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import type {
  PersistEntriesSummary,
  FilePersistenceEntry
} from '../../../search-engine/workers/search-index-worker-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

function createService(options: {
  pending: Map<number, IndexWorkerFileResult>
  inflight: Map<number, IndexWorkerFileResult>
  ensureSearchIndexWorkerReady: (reason: string) => Promise<boolean>
  persistEntries?: (entries: FilePersistenceEntry[]) => Promise<PersistEntriesSummary>
  publishRecords?: (entries: IndexWorkerFileResult[]) => Promise<number>
  logWarn?: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  config?: FileProviderIndexRuntimeServiceDeps['config']
}) {
  const persistEntries = vi.fn(
    options.persistEntries ?? (async (entries) => createPersistSummary(entries))
  )
  const logWarn = vi.fn(options.logWarn ?? (() => undefined))
  const publishRecords = vi.fn(options.publishRecords ?? (async (entries) => entries.length))

  return {
    persistEntries,
    publishRecords,
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
      getSearchIndexWorker: () => ({ persistEntries }),
      buildPersistEntries: toPersistEntries,
      publishRecords,
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
  beforeEach(() => {
    // Start every case from a clean timer/spy state: restore spies BEFORE dropping the clock, so
    // a stale setTimeout spy can never reinstall a dead fake clock into globalThis.
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    // Restore spies BEFORE dropping the fake clock: a `spyOn(globalThis, 'setTimeout')` captured
    // while fake timers were installed would otherwise be reinstalled into globalThis, leaving
    // every later real timer in this file permanently dead.
    vi.clearAllTimers()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('flush waits for the shared search index worker readiness gate', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const inflight = new Map<number, IndexWorkerFileResult>()
    let resolveReady!: (ready: boolean) => void
    const ready = new Promise<boolean>((resolve) => {
      resolveReady = resolve
    })
    const ensureSearchIndexWorkerReady = vi.fn(() => ready)
    const { service, persistEntries } = createService({
      pending,
      inflight,
      ensureSearchIndexWorkerReady
    })

    const flush = service.doFlush()
    await Promise.resolve()

    expect(ensureSearchIndexWorkerReady).toHaveBeenCalledWith('index-runtime.flush')
    expect(persistEntries).not.toHaveBeenCalled()

    resolveReady(true)
    await flush

    expect(persistEntries).toHaveBeenCalledTimes(1)
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
    const { service, persistEntries } = createService({
      pending,
      inflight,
      ensureSearchIndexWorkerReady
    })

    await service.flush()

    expect(ensureSearchIndexWorkerReady).not.toHaveBeenCalled()
    expect(persistEntries).not.toHaveBeenCalled()
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
    const { service, persistEntries, logWarn } = createService({
      pending,
      inflight,
      ensureSearchIndexWorkerReady: vi.fn(async () => false)
    })

    await service.doFlush()

    expect(persistEntries).not.toHaveBeenCalled()
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

  it('retains the local batch for retry when runtime publication fails after persistence', async () => {
    vi.useFakeTimers()
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const inflight = new Map<number, IndexWorkerFileResult>()
    const { service, persistEntries, publishRecords, logWarn } = createService({
      pending,
      inflight,
      ensureSearchIndexWorkerReady: vi.fn(async () => true),
      publishRecords: async () => {
        throw new Error('runtime publish exploded')
      }
    })

    await service.flush()

    expect(persistEntries).toHaveBeenCalledTimes(1)
    expect(publishRecords).toHaveBeenCalledTimes(1)
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
      error: 'runtime publish exploded',
      metadata: {
        withContent: 1,
        isBusy: false,
        retryReason: 'flush-failed'
      }
    })
  })

  it('keeps explicit flushes behind an active SQLite busy retry', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const inflight = new Map<number, IndexWorkerFileResult>()
    const busyError = Object.assign(new Error('database is locked'), {
      code: 'SQLITE_BUSY',
      rawCode: 5
    })
    const persistEntries = vi
      .fn<(entries: FilePersistenceEntry[]) => Promise<PersistEntriesSummary>>()
      .mockRejectedValueOnce(busyError)
      .mockImplementation(async (entries) => createPersistSummary(entries))
    const { service } = createService({
      pending,
      inflight,
      ensureSearchIndexWorkerReady: vi.fn(async () => true),
      persistEntries
    })

    await service.flush()
    await service.flush()
    await service.flush()

    expect(persistEntries).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(249)
    expect(persistEntries).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(persistEntries).toHaveBeenCalledTimes(2)
  })
})

describe('FileProviderIndexRuntimeService buffer byte ownership', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function resultWithContent(fileId: number, content: string): IndexWorkerFileResult {
    const base = createResult(fileId)
    return {
      ...base,
      fileUpdate: { content, embeddingStatus: 'completed', contentHash: null },
      indexItem: { ...base.indexItem, content }
    }
  }

  it('reports pending and inflight bytes and returns them to zero after commit', async () => {
    vi.useFakeTimers()
    const pending = new Map<number, IndexWorkerFileResult>()
    const inflight = new Map<number, IndexWorkerFileResult>()
    const persistGate = Promise.withResolvers<PersistEntriesSummary>()
    const { service } = createService({
      pending,
      inflight,
      ensureSearchIndexWorkerReady: vi.fn(async () => true),
      persistEntries: () => persistGate.promise
    })

    expect(service.getBufferSnapshot()).toMatchObject({
      pending: 0,
      inflight: 0,
      pendingBytes: 0,
      inflightBytes: 0
    })

    service.handleIndexWorkerFile(resultWithContent(1, 'a'.repeat(64)))
    const afterSmall = service.getBufferSnapshot()
    service.handleIndexWorkerFile(resultWithContent(2, 'b'.repeat(4_096)))
    const afterLarge = service.getBufferSnapshot()

    expect(afterSmall).toMatchObject({ pending: 1, inflight: 0 })
    expect(afterSmall.pendingBytes).toBeGreaterThan(0)
    expect(afterLarge.pending).toBe(2)
    // Byte ownership must scale with retained payload, not be a constant sample.
    expect(afterLarge.pendingBytes).toBeGreaterThan(afterSmall.pendingBytes)

    const flush = service.doFlush()
    const duringFlush = service.getBufferSnapshot()
    expect(duringFlush).toMatchObject({ pending: 0, inflight: 2, pendingBytes: 0 })
    expect(duringFlush.inflightBytes).toBeGreaterThan(0)

    persistGate.resolve(createPersistSummary([]))
    await flush
    expect(service.getBufferSnapshot()).toMatchObject({
      pending: 0,
      inflight: 0,
      pendingBytes: 0,
      inflightBytes: 0
    })
  })
})

describe('FileProviderIndexRuntimeService persist barrier', () => {
  beforeEach(() => {
    // Sibling describes in this file install fake timers and spies; start the barrier cases from
    // a known-clean state so no earlier case can leave a dead clock behind for the polls below.
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('keeps the barrier open while a flush is still persisting', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const inflight = new Map<number, IndexWorkerFileResult>()
    const persistGate = Promise.withResolvers<void>()
    const { service, persistEntries } = createService({
      pending,
      inflight,
      ensureSearchIndexWorkerReady: vi.fn(async () => true),
      persistEntries: async (entries) => {
        await persistGate.promise
        return createPersistSummary(entries)
      }
    })

    let settled = false
    const barrier = service.waitForPersisted(5_000).then(() => {
      settled = true
    })

    // A flush is genuinely in flight and its persistence has not completed yet.
    await vi.waitFor(() => expect(persistEntries).toHaveBeenCalledTimes(1))
    expect(settled).toBe(false)

    persistGate.resolve(undefined)
    await barrier

    expect(settled).toBe(true)
    expect(persistEntries).toHaveBeenCalledTimes(1)
    expect(service.getBufferSnapshot()).toMatchObject({ pending: 0, inflight: 0 })
  })

  it('does not treat a cancelled flush as released while its publish is still pending', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const inflight = new Map<number, IndexWorkerFileResult>()
    const publishGate = Promise.withResolvers<number>()
    const { service, publishRecords } = createService({
      pending,
      inflight,
      ensureSearchIndexWorkerReady: vi.fn(async () => true),
      publishRecords: async () => publishGate.promise
    })

    // An explicit flush is already in flight: it owns the batch and is suspending in publish.
    const flush = service.doFlush()
    await vi.waitFor(() => expect(publishRecords).toHaveBeenCalledTimes(1))
    expect(inflight.size).toBe(1)

    // Cancellation clears local ownership while that publish is still outstanding.
    pending.clear()
    inflight.clear()
    expect(service.getBufferSnapshot()).toMatchObject({ pending: 0, inflight: 0 })

    let settled = false
    const barrier = service.waitForPersisted(5_000).then(() => {
      settled = true
    })

    // One tick is already enough for a barrier that only consulted pending/inflight to claim
    // completion, so the in-flight flush must be what keeps it closed.
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)

    publishGate.resolve(1)
    await flush
    await vi.waitFor(() => expect(settled).toBe(true))
    // Consume the real promise so a barrier rejection (e.g. PERSIST_BARRIER_TIMEOUT) surfaces
    // here instead of as an unhandled rejection.
    await barrier
    expect(service.getBufferSnapshot()).toMatchObject({ pending: 0, inflight: 0 })
  })
})
