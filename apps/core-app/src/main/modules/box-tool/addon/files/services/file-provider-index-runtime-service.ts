import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import type { PersistEntry } from '../../../search-engine/workers/search-index-worker-client'
import {
  buildIndexedWriteFlushFailureSnapshot,
  IndexedWriteFlushRuntimeService,
  IndexedWriteFlushSnapshotService,
  type IndexedWriteFlushSnapshot
} from '@talex-touch/utils/search'
import { FileProviderIndexFlushBufferService } from './file-provider-index-flush-service'
import {
  FileProviderIndexFlushExecutorService,
  type FileProviderIndexFlushExecutorResult
} from './file-provider-index-flush-executor-service'
import {
  type FileProviderIndexFlushFailureDecision,
  FileProviderIndexFlushRetryService
} from './file-provider-index-flush-retry-service'

export type FileProviderIndexFlushSnapshot = Omit<IndexedWriteFlushSnapshot, 'status'> & {
  status: 'idle' | 'flushed' | 'worker-not-ready' | 'failed'
}

export interface FileProviderIndexRuntimeServiceDeps {
  flushBatchScheduler: { currentSize: number; recordDuration: (durationMs: number) => void }
  getDbUtils: () => unknown | null
  getSearchIndex: () => unknown | null
  getPendingResults: () => Map<number, IndexWorkerFileResult>
  getInflightResults: () => Map<number, IndexWorkerFileResult>
  ensureSearchIndexWorkerReady: (reason: string) => Promise<boolean>
  getSearchIndexWorker: () => {
    persistAndIndex: (entries: PersistEntry[]) => Promise<void>
  }
  buildPersistEntries: (entries: IndexWorkerFileResult[]) => PersistEntry[]
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  config?: {
    baseDelayMs?: number
    backlogDelayMs?: number
    flushDeferMs?: number
    dbBackpressureMaxQueued?: number
    busyRetryBaseMs?: number
    busyRetryMaxMs?: number
  }
}

export class FileProviderIndexRuntimeService {
  private readonly flushBatchScheduler: FileProviderIndexRuntimeServiceDeps['flushBatchScheduler']
  private readonly getDbUtils: FileProviderIndexRuntimeServiceDeps['getDbUtils']
  private readonly getSearchIndex: FileProviderIndexRuntimeServiceDeps['getSearchIndex']
  private readonly ensureSearchIndexWorkerReady: FileProviderIndexRuntimeServiceDeps['ensureSearchIndexWorkerReady']
  private readonly getSearchIndexWorker: FileProviderIndexRuntimeServiceDeps['getSearchIndexWorker']
  private readonly buildPersistEntries: FileProviderIndexRuntimeServiceDeps['buildPersistEntries']
  private readonly logDebug: FileProviderIndexRuntimeServiceDeps['logDebug']
  private readonly logWarn: FileProviderIndexRuntimeServiceDeps['logWarn']
  private readonly config: Required<NonNullable<FileProviderIndexRuntimeServiceDeps['config']>>
  private readonly bufferService: FileProviderIndexFlushBufferService
  private readonly retryService: FileProviderIndexFlushRetryService
  private readonly flushExecutor: FileProviderIndexFlushExecutorService
  private readonly flushRuntime: IndexedWriteFlushRuntimeService<
    FileProviderIndexFlushExecutorResult,
    FileProviderIndexFlushFailureDecision['reason'],
    FileProviderIndexFlushFailureDecision
  >

  private readonly flushSnapshotService =
    new IndexedWriteFlushSnapshotService<FileProviderIndexFlushSnapshot>()

  constructor(deps: FileProviderIndexRuntimeServiceDeps) {
    this.flushBatchScheduler = deps.flushBatchScheduler
    this.getDbUtils = deps.getDbUtils
    this.getSearchIndex = deps.getSearchIndex
    this.ensureSearchIndexWorkerReady = deps.ensureSearchIndexWorkerReady
    this.getSearchIndexWorker = deps.getSearchIndexWorker
    this.buildPersistEntries = deps.buildPersistEntries
    this.logDebug = deps.logDebug
    this.logWarn = deps.logWarn
    this.bufferService = new FileProviderIndexFlushBufferService(
      deps.getPendingResults(),
      deps.getInflightResults()
    )
    this.config = {
      baseDelayMs: deps.config?.baseDelayMs ?? 250,
      backlogDelayMs: deps.config?.backlogDelayMs ?? 500,
      flushDeferMs: deps.config?.flushDeferMs ?? 300,
      dbBackpressureMaxQueued: deps.config?.dbBackpressureMaxQueued ?? 10,
      busyRetryBaseMs: deps.config?.busyRetryBaseMs ?? 250,
      busyRetryMaxMs: deps.config?.busyRetryMaxMs ?? 5000
    }
    this.retryService = new FileProviderIndexFlushRetryService({
      baseDelayMs: this.config.baseDelayMs,
      backlogDelayMs: this.config.backlogDelayMs,
      busyRetryBaseMs: this.config.busyRetryBaseMs,
      busyRetryMaxMs: this.config.busyRetryMaxMs
    })
    this.flushExecutor = new FileProviderIndexFlushExecutorService({
      flushBatchScheduler: this.flushBatchScheduler,
      getDbUtils: this.getDbUtils,
      getSearchIndex: this.getSearchIndex,
      buffer: this.bufferService,
      ensureSearchIndexWorkerReady: this.ensureSearchIndexWorkerReady,
      getSearchIndexWorker: this.getSearchIndexWorker,
      buildPersistEntries: this.buildPersistEntries,
      logDebug: this.logDebug,
      config: {
        dbBackpressureMaxQueued: this.config.dbBackpressureMaxQueued
      }
    })
    this.flushRuntime = new IndexedWriteFlushRuntimeService({
      getPendingSize: () => this.bufferService.pendingSize,
      getInflightSize: () => this.bufferService.inflightSize,
      isAvailable: () => Boolean(this.getDbUtils() && this.getSearchIndex()),
      executeFlush: () => this.executeFlush(),
      recordIdle: (input) =>
        this.recordFlushSnapshot({
          status: 'idle',
          entries: 0,
          pending: input.pending,
          inflight: input.inflight,
          reason: input.reason
        }),
      getFlushDelay: (pendingSize) => this.retryService.getFlushDelay(pendingSize),
      resolveFailure: (input) =>
        this.retryService.resolveFailure({
          error: input.error,
          pendingSize: input.pendingSize,
          retryCount: input.retryCount
        }),
      handleFailure: ({ error, decision }) => this.handleFlushFailure(error, decision),
      shouldRescheduleAfterResult: (result) =>
        result.status === 'worker-not-ready'
          ? { delayMs: this.config.backlogDelayMs, reason: 'worker-not-ready' }
          : null,
      onUnexpectedFlushError: (error, reason) => {
        this.logWarn('flushIndexWorkerResults rejected unexpectedly', error, { reason })
      },
      config: {
        flushDeferMs: this.config.flushDeferMs
      }
    })
  }

  async initWorker(): Promise<void> {
    await this.ensureSearchIndexWorkerReady('index-runtime.init')
  }

  handleIndexWorkerFile(payload: IndexWorkerFileResult): void {
    if (!payload || typeof payload.fileId !== 'number') {
      return
    }

    const pendingSize = this.bufferService.enqueue(payload)
    this.scheduleFlush(this.retryService.getFlushDelay(pendingSize), 'worker-payload')
  }

  getFlushSnapshot(): FileProviderIndexFlushSnapshot | null {
    return this.flushSnapshotService.getSnapshot()
  }

  scheduleFlush(delayMs: number, reason: string): void {
    this.flushRuntime.scheduleFlush(delayMs, reason)
  }

  async flush(): Promise<void> {
    await this.flushRuntime.flush()
  }

  async doFlush(): Promise<void> {
    await this.executeFlush()
  }

  private async executeFlush(): Promise<FileProviderIndexFlushExecutorResult> {
    const result = await this.flushExecutor.execute()
    this.recordFlushExecutorResult(result)
    if (result.status === 'worker-not-ready') {
      this.logWarn('Index worker flush skipped: worker init unavailable', undefined, {
        pending: result.pending,
        inflight: result.inflight
      })
    }
    return result
  }

  private recordFlushExecutorResult(result: FileProviderIndexFlushExecutorResult): void {
    this.recordFlushSnapshot({
      status: result.status,
      entries: result.entries,
      pending: result.pending,
      inflight: result.inflight,
      reason: result.reason,
      error: result.error,
      metadata: result.metadata,
      durationMs: result.durationMs
    })
  }

  private recordFlushFailure(error: unknown, metadata: Record<string, unknown>): void {
    this.recordFlushSnapshot(
      buildIndexedWriteFlushFailureSnapshot<FileProviderIndexFlushSnapshot>({
        error,
        pendingSize: this.bufferService.pendingSize,
        inflightSize: this.bufferService.inflightSize,
        metadata
      })
    )
  }

  private handleFlushFailure(
    error: unknown,
    decision: FileProviderIndexFlushFailureDecision
  ): void {
    this.logWarn('Index worker flush failed, scheduling retry', error, {
      isBusy: decision.isBusy,
      delayMs: decision.delayMs,
      pending: this.bufferService.pendingSize,
      inflight: this.bufferService.inflightSize
    })
    this.recordFlushFailure(error, {
      isBusy: decision.isBusy,
      delayMs: decision.delayMs,
      retryReason: decision.reason
    })
  }

  private recordFlushSnapshot(snapshot: Omit<FileProviderIndexFlushSnapshot, 'checkedAt'>): void {
    this.flushSnapshotService.record(snapshot)
  }
}
