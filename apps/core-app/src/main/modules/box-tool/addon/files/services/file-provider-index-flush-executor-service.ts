import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import type {
  FilePersistenceEntry,
  PersistEntriesSummary
} from '../../../search-engine/search-index-writer'
import { performance } from 'node:perf_hooks'
import { dbWriteScheduler } from '../../../../../db/db-write-scheduler'
import {
  buildIndexedWriteFlushBatchMetrics,
  IndexedWriteFlushExecutorService,
  mapIndexedWriteFlushExecutorResult
} from '@talex-touch/utils/search'
import { FileProviderIndexFlushBufferService } from './file-provider-index-flush-service'
import type { FileProviderEmbeddingIndexOutcome } from './file-provider-embedding-index-service'
import {
  IndexMaintenanceDeferredError,
  indexMaintenanceContext
} from '../../../search-engine/index-maintenance-context'
import { isIndexMaintenanceIdle } from '../../../search-engine/search-activity'

export type FileProviderIndexFlushExecutorStatus = 'idle' | 'flushed' | 'worker-not-ready'

export interface FileProviderIndexFlushExecutorResult {
  status: FileProviderIndexFlushExecutorStatus
  entries: number
  withContent: number
  pending: number
  inflight: number
  reason?: string
  error?: string
  metadata?: Record<string, unknown>
  durationMs?: number
}

export interface FileProviderIndexFlushExecutorServiceDeps {
  checkContentCapacity?: () => Promise<boolean>
  isAvailable?: () => boolean
  recordStorageFailure?: (error: unknown) => boolean
  prepareBatch?: (entries: IndexWorkerFileResult[]) => Promise<boolean>
  flushBatchScheduler: { currentSize: number; recordDuration: (durationMs: number) => void }
  getDbUtils: () => unknown | null
  getSearchIndex: () => unknown | null
  buffer: FileProviderIndexFlushBufferService
  ensureSearchIndexWorkerReady: (reason: string) => Promise<boolean>
  getSearchIndexWorker: () => {
    persistEntries: (entries: FilePersistenceEntry[]) => Promise<PersistEntriesSummary>
  }
  buildPersistEntries: (entries: IndexWorkerFileResult[]) => FilePersistenceEntry[]
  publishRecords: (entries: IndexWorkerFileResult[]) => Promise<number>
  /**
   * Generates semantic embeddings for the files a flush just committed.
   *
   * Optional on purpose. `EmbeddingService.generate` bills a metered provider per token, so a
   * build without a configured embedding provider must keep indexing files without ever
   * reaching for one -- omitting this dep leaves the flush path byte-identical to before.
   *
   * Called after the rows are durable, never before: a file that fails to persist must not
   * produce an embedding row pointing at an id the files table does not have.
   *
   * A file listed in `retryFileIds` keeps its pending progress row instead of being completed, so
   * the enrichment retry lane re-reads it; without a capacity check the first persist already
   * completes the row and there is nothing left to keep.
   */
  indexEmbeddings?: (
    entries: IndexWorkerFileResult[]
  ) => Promise<FileProviderEmbeddingIndexOutcome | void>
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  waitForCapacity?: (maxQueued: number) => Promise<void>
  now?: () => number
  config?: {
    dbBackpressureMaxQueued?: number
  }
}

export class FileProviderIndexFlushExecutorService {
  private readonly flushBatchScheduler: FileProviderIndexFlushExecutorServiceDeps['flushBatchScheduler']
  private readonly getDbUtils: FileProviderIndexFlushExecutorServiceDeps['getDbUtils']
  private readonly getSearchIndex: FileProviderIndexFlushExecutorServiceDeps['getSearchIndex']
  private readonly buffer: FileProviderIndexFlushBufferService
  private readonly ensureSearchIndexWorkerReady: FileProviderIndexFlushExecutorServiceDeps['ensureSearchIndexWorkerReady']
  private readonly getSearchIndexWorker: FileProviderIndexFlushExecutorServiceDeps['getSearchIndexWorker']
  private readonly buildPersistEntries: FileProviderIndexFlushExecutorServiceDeps['buildPersistEntries']
  private readonly publishRecords: FileProviderIndexFlushExecutorServiceDeps['publishRecords']
  private readonly indexEmbeddings: FileProviderIndexFlushExecutorServiceDeps['indexEmbeddings']
  private readonly logDebug: FileProviderIndexFlushExecutorServiceDeps['logDebug']
  private readonly waitForCapacity: NonNullable<
    FileProviderIndexFlushExecutorServiceDeps['waitForCapacity']
  >
  private readonly now: NonNullable<FileProviderIndexFlushExecutorServiceDeps['now']>
  private readonly dbBackpressureMaxQueued: number
  private readonly executor: IndexedWriteFlushExecutorService<
    number,
    IndexWorkerFileResult,
    FilePersistenceEntry,
    PersistEntriesSummary
  >
  private readonly publicationStages = new WeakMap<
    IndexWorkerFileResult[],
    {
      indexedItems: number | null
      embeddingsComplete: boolean
      completionsComplete: boolean
      retryFileIds: ReadonlySet<number>
    }
  >()

  constructor(deps: FileProviderIndexFlushExecutorServiceDeps) {
    this.flushBatchScheduler = deps.flushBatchScheduler
    this.getDbUtils = deps.getDbUtils
    this.getSearchIndex = deps.getSearchIndex
    this.buffer = deps.buffer
    this.ensureSearchIndexWorkerReady = deps.ensureSearchIndexWorkerReady
    this.getSearchIndexWorker = deps.getSearchIndexWorker
    this.buildPersistEntries = deps.buildPersistEntries
    this.publishRecords = deps.publishRecords
    const assertFlushAllowed = (): void => {
      if (deps.isAvailable?.() === false) throw new Error('FILE_CONTENT_STORAGE_PAUSED')
      if (indexMaintenanceContext.getStore() === true && !isIndexMaintenanceIdle()) {
        throw new IndexMaintenanceDeferredError()
      }
    }
    this.indexEmbeddings = deps.indexEmbeddings
    this.logDebug = deps.logDebug
    this.waitForCapacity =
      deps.waitForCapacity ?? ((maxQueued) => dbWriteScheduler.waitForCapacity(maxQueued))
    this.now = deps.now ?? (() => performance.now())
    this.dbBackpressureMaxQueued = deps.config?.dbBackpressureMaxQueued ?? 10
    this.executor = new IndexedWriteFlushExecutorService({
      buffer: this.buffer,
      getBatchSize: () => this.flushBatchScheduler.currentSize,
      isAvailable: () =>
        Boolean(this.getDbUtils() && this.getSearchIndex()) && (deps.isAvailable?.() ?? true),
      ensureReady: () => this.ensureSearchIndexWorkerReady('index-runtime.flush'),
      prepareBatch: deps.prepareBatch,
      buildPersistEntries: this.buildPersistEntries,
      shouldRetainBatch: (error) => error instanceof IndexMaintenanceDeferredError,
      persist: async (entries) => {
        assertFlushAllowed()
        if (deps.checkContentCapacity && !(await deps.checkContentCapacity())) {
          throw new Error('FILE_CONTENT_STORAGE_PAUSED')
        }
        assertFlushAllowed()
        // A parser result is not complete until publication and the final capacity fence.
        // Keeping this durable row pending avoids a repair write on an already-full volume.
        const pendingEntries = deps.checkContentCapacity
          ? entries.map((entry) => ({
              ...entry,
              progress: { ...entry.progress, status: 'pending' }
            }))
          : entries
        return await this.getSearchIndexWorker().persistEntries(pendingEntries)
      },
      waitForCapacity: async () => {
        await this.waitForCapacity(this.dbBackpressureMaxQueued)
        assertFlushAllowed()
      },
      recordDuration: (durationMs) => this.flushBatchScheduler.recordDuration(durationMs),
      now: this.now,
      onBatchTaken: (entries) => this.logBatchTaken(entries),
      resolveBatchMetadata: (entries) => this.resolveBatchMetadata(entries),
      resolvePersistMetadata: (result) => this.resolvePersistMetadata(result),
      afterPersist: async ({ entries, persistEntries, result }) => {
        assertFlushAllowed()
        if (deps.checkContentCapacity && !(await deps.checkContentCapacity())) {
          throw new Error('FILE_CONTENT_STORAGE_PAUSED')
        }
        assertFlushAllowed()
        const skippedFileIds = new Set([
          ...(result.staleFileIds ?? []),
          ...(result.supersededFileIds ?? [])
        ])
        const committedEntries =
          skippedFileIds.size === 0
            ? entries
            : entries.filter((entry) => !skippedFileIds.has(entry.fileId))
        let stage = this.publicationStages.get(entries)
        if (!stage) {
          stage = {
            indexedItems: null,
            embeddingsComplete: false,
            completionsComplete: false,
            retryFileIds: new Set()
          }
          this.publicationStages.set(entries, stage)
        }
        if (stage.indexedItems === null)
          stage.indexedItems = await this.publishRecords(committedEntries)
        const indexedItems = stage.indexedItems
        assertFlushAllowed()
        // Embeddings are generated only for rows that actually committed, and only after
        // publishing: a metered provider call must never block the results reaching the UI,
        // and a failure here must not fail an otherwise-good flush.
        if (!stage.embeddingsComplete && this.indexEmbeddings && committedEntries.length > 0) {
          try {
            const outcome = await this.indexEmbeddings(committedEntries)
            if (outcome) stage.retryFileIds = new Set(outcome.retryFileIds)
          } catch (error) {
            if (error instanceof IndexMaintenanceDeferredError) throw error
            deps.recordStorageFailure?.(error)
            this.logDebug('Embedding indexing failed for flushed batch', {
              error: error instanceof Error ? error.message : String(error)
            })
          }
        }
        stage.embeddingsComplete = true
        assertFlushAllowed()
        if (deps.checkContentCapacity && !stage.completionsComplete) {
          if (!(await deps.checkContentCapacity())) throw new Error('FILE_CONTENT_STORAGE_PAUSED')
          assertFlushAllowed()
          // Image embedding owns its completion transaction. A worker's original
          // pending/processing state must not overwrite that committed outcome.
          const { retryFileIds } = stage
          const completions = persistEntries
            .filter(
              (entry) =>
                !skippedFileIds.has(entry.fileId) &&
                !retryFileIds.has(entry.fileId) &&
                (entry.progress.status === 'completed' ||
                  entry.progress.status === 'truncated' ||
                  entry.progress.status === 'skipped' ||
                  entry.progress.status === 'failed')
            )
            .map((entry) => ({ ...entry, fileUpdate: null }))
          if (completions.length > 0) await this.getSearchIndexWorker().persistEntries(completions)
          stage.completionsComplete = true
          assertFlushAllowed()
        }
        return {
          indexedItems,
          staleEntries: result.staleFileIds?.length ?? 0,
          supersededEntries: result.supersededFileIds?.length ?? 0
        }
      }
    })
  }

  /** The exact batch remains accounted as inflight while its old lease is detached. */
  get retainedEntries(): IndexWorkerFileResult[] {
    return this.executor.retainedEntries
  }

  discardRetainedBatch(): void {
    this.executor.discardRetainedBatch()
  }

  async execute(): Promise<FileProviderIndexFlushExecutorResult> {
    const result = await this.executor.execute()
    return mapIndexedWriteFlushExecutorResult(result, {
      statusMap: {
        idle: 'idle',
        flushed: 'flushed',
        'not-ready': 'worker-not-ready'
      },
      numericMetadataKeys: ['withContent'] as const
    })
  }

  private logBatchTaken(entries: IndexWorkerFileResult[]): void {
    const { withContent } = this.resolveBatchMetadata(entries)
    if (withContent > 0) {
      this.logDebug(`Flushing ${entries.length} worker results (${withContent} with content)`)
    }
  }

  private resolveBatchMetadata(entries: IndexWorkerFileResult[]): {
    storeBoundary: 'indexed-write-flush'
    withContent: number
  } {
    return {
      storeBoundary: 'indexed-write-flush',
      ...buildIndexedWriteFlushBatchMetrics(entries, [
        {
          key: 'withContent',
          count: (entry) => Boolean(entry.indexItem.content && entry.indexItem.content.length > 0)
        }
      ])
    }
  }

  private resolvePersistMetadata(summary: PersistEntriesSummary): {
    persistedRows: number
    fileUpdates: number
    progressRows: number
    embeddings: number
    chunks: number
    staleEntries: number
    supersededEntries: number
  } {
    return {
      persistedRows: summary.persistedRows,
      fileUpdates: summary.fileUpdates,
      progressRows: summary.progressRows,
      embeddings: summary.embeddings,
      chunks: summary.chunks,
      staleEntries: summary.staleFileIds?.length ?? 0,
      supersededEntries: summary.supersededFileIds?.length ?? 0
    }
  }
}
