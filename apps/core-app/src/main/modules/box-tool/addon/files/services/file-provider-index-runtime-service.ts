import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import type {
  FilePersistenceEntry,
  PersistEntriesSummary
} from '../../../search-engine/search-index-writer'
import {
  buildIndexedWriteFlushFailureSnapshot,
  buildIndexedWriteFlushFailureRetryMetadata,
  buildIndexedWriteFlushIdleSnapshot,
  buildIndexedWriteFlushResultSnapshot,
  IndexedWriteFlushRuntimeService,
  IndexedWriteFlushSnapshotService,
  resolveIndexedWriteFlushRuntimeConfig,
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

const INDEX_FLUSH_FAILURE_LOG_THROTTLE_MS = 30_000

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
    persistEntries: (entries: FilePersistenceEntry[]) => Promise<PersistEntriesSummary>
  }
  buildPersistEntries: (entries: IndexWorkerFileResult[]) => FilePersistenceEntry[]
  publishRecords: (entries: IndexWorkerFileResult[]) => Promise<number>
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  now?: () => number
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
  private readonly publishRecords: FileProviderIndexRuntimeServiceDeps['publishRecords']
  private readonly logDebug: FileProviderIndexRuntimeServiceDeps['logDebug']
  private readonly logWarn: FileProviderIndexRuntimeServiceDeps['logWarn']
  private readonly now: () => number
  private readonly config: Required<NonNullable<FileProviderIndexRuntimeServiceDeps['config']>>
  private explicitFlushNotBefore = 0
  private failureLogState: { signature: string; loggedAt: number; suppressed: number } | null = null
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
    this.publishRecords = deps.publishRecords
    this.logDebug = deps.logDebug
    this.logWarn = deps.logWarn
    this.now = deps.now ?? Date.now
    this.bufferService = new FileProviderIndexFlushBufferService(
      deps.getPendingResults(),
      deps.getInflightResults()
    )
    const config = resolveIndexedWriteFlushRuntimeConfig({
      baseDelayMs: deps.config?.baseDelayMs,
      backlogDelayMs: deps.config?.backlogDelayMs,
      flushDeferMs: deps.config?.flushDeferMs,
      backpressureMaxQueued: deps.config?.dbBackpressureMaxQueued,
      retryBaseMs: deps.config?.busyRetryBaseMs,
      retryMaxMs: deps.config?.busyRetryMaxMs
    })
    this.config = {
      baseDelayMs: config.baseDelayMs,
      backlogDelayMs: config.backlogDelayMs,
      flushDeferMs: config.flushDeferMs,
      dbBackpressureMaxQueued: config.backpressureMaxQueued,
      busyRetryBaseMs: config.retryBaseMs,
      busyRetryMaxMs: config.retryMaxMs
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
      publishRecords: this.publishRecords,
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
      recordIdle: (input) => this.recordFlushSnapshot(buildIndexedWriteFlushIdleSnapshot(input)),
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
    if (this.now() < this.explicitFlushNotBefore) return
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
    if (result.status === 'worker-not-ready') {
      this.explicitFlushNotBefore = this.now() + this.config.backlogDelayMs
    } else {
      this.explicitFlushNotBefore = 0
      this.failureLogState = null
    }
    this.recordFlushSnapshot(buildIndexedWriteFlushResultSnapshot(result))
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
    const now = this.now()
    this.explicitFlushNotBefore = Math.max(this.explicitFlushNotBefore, now + decision.delayMs)

    const errorMessage = error instanceof Error ? error.message : String(error)
    const signature = `${decision.reason}:${errorMessage}`
    const previousLog = this.failureLogState
    const shouldLog =
      !previousLog ||
      previousLog.signature !== signature ||
      now - previousLog.loggedAt >= INDEX_FLUSH_FAILURE_LOG_THROTTLE_MS

    if (shouldLog) {
      const suppressedFailures = previousLog?.signature === signature ? previousLog.suppressed : 0
      this.logWarn('Index worker flush failed, scheduling retry', error, {
        isBusy: decision.isBusy,
        delayMs: decision.delayMs,
        pending: this.bufferService.pendingSize,
        inflight: this.bufferService.inflightSize,
        ...(suppressedFailures > 0 ? { suppressedFailures } : {})
      })
      this.failureLogState = { signature, loggedAt: now, suppressed: 0 }
    } else {
      previousLog.suppressed += 1
    }

    this.recordFlushFailure(error, {
      ...buildIndexedWriteFlushFailureRetryMetadata({
        delayMs: decision.delayMs,
        retryReason: decision.reason,
        extra: {
          isBusy: decision.isBusy
        }
      })
    })
  }

  private recordFlushSnapshot(snapshot: Omit<FileProviderIndexFlushSnapshot, 'checkedAt'>): void {
    this.flushSnapshotService.record(snapshot)
  }
}
