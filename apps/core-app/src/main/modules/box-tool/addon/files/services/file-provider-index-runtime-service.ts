import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import type { PersistEntry } from '../../../search-engine/workers/search-index-worker-client'
import { FileProviderIndexFlushBufferService } from './file-provider-index-flush-service'
import {
  FileProviderIndexFlushExecutorService,
  type FileProviderIndexFlushExecutorResult
} from './file-provider-index-flush-executor-service'
import { FileProviderIndexFlushRetryService } from './file-provider-index-flush-retry-service'

export interface FileProviderIndexFlushSnapshot {
  status: 'idle' | 'flushed' | 'worker-not-ready' | 'failed'
  entries: number
  pending: number
  inflight: number
  reason?: string
  error?: string
  metadata?: Record<string, unknown>
  durationMs?: number
  checkedAt: number
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

  private indexWorkerFlushTimer: NodeJS.Timeout | null = null
  private indexWorkerFlushing = false
  private indexWorkerFlushBusyRetryCount = 0
  private lastFlushSnapshot: FileProviderIndexFlushSnapshot | null = null

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
    return this.lastFlushSnapshot
  }

  scheduleFlush(delayMs: number, reason: string): void {
    if (this.indexWorkerFlushTimer) {
      return
    }
    const safeDelay = Math.max(0, Math.round(delayMs))
    this.indexWorkerFlushTimer = setTimeout(() => {
      this.indexWorkerFlushTimer = null
      void this.flush().catch((error) => {
        this.logWarn('flushIndexWorkerResults rejected unexpectedly', error, { reason })
      })
    }, safeDelay)
  }

  async flush(): Promise<void> {
    if (!this.getDbUtils() || !this.getSearchIndex()) {
      this.recordFlushSnapshot({
        status: 'idle',
        entries: 0,
        pending: this.bufferService.pendingSize,
        inflight: this.bufferService.inflightSize,
        reason: 'unavailable'
      })
      return
    }

    if (this.bufferService.pendingSize === 0) {
      this.recordFlushSnapshot({
        status: 'idle',
        entries: 0,
        pending: 0,
        inflight: this.bufferService.inflightSize,
        reason: 'no-pending'
      })
      return
    }

    if (this.indexWorkerFlushing) {
      this.recordFlushSnapshot({
        status: 'idle',
        entries: 0,
        pending: this.bufferService.pendingSize,
        inflight: this.bufferService.inflightSize,
        reason: 'flush-in-progress'
      })
      this.scheduleFlush(this.config.flushDeferMs, 'flush-in-progress')
      return
    }

    this.indexWorkerFlushing = true
    let flushSucceeded = false
    try {
      await this.doFlush()
      this.indexWorkerFlushBusyRetryCount = 0
      flushSucceeded = true
    } catch (error) {
      const decision = this.retryService.resolveFailure({
        error,
        pendingSize: this.bufferService.pendingSize,
        retryCount: this.indexWorkerFlushBusyRetryCount
      })
      this.indexWorkerFlushBusyRetryCount = decision.nextRetryCount

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
      this.scheduleFlush(decision.delayMs, decision.reason)
    } finally {
      this.indexWorkerFlushing = false
    }

    if (flushSucceeded && this.bufferService.pendingSize > 0) {
      this.scheduleFlush(
        this.retryService.getFlushDelay(this.bufferService.pendingSize),
        'drain-remaining'
      )
    }
  }

  async doFlush(): Promise<void> {
    const result = await this.flushExecutor.execute()
    this.recordFlushExecutorResult(result)
    if (result.status === 'worker-not-ready') {
      this.logWarn('Index worker flush skipped: worker init unavailable', undefined, {
        pending: result.pending,
        inflight: result.inflight
      })
      this.scheduleFlush(this.config.backlogDelayMs, 'worker-not-ready')
    }
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
    const flushResult = this.getFlushResultFromError(error)
    this.recordFlushSnapshot({
      status: 'failed',
      entries: flushResult?.entries ?? 0,
      pending: flushResult?.pending ?? this.bufferService.pendingSize,
      inflight: flushResult?.inflight ?? this.bufferService.inflightSize,
      reason: flushResult?.reason ?? 'flush-failed',
      error: flushResult?.error ?? this.stringifyError(error),
      metadata: {
        ...(flushResult?.metadata ?? {}),
        ...metadata
      },
      durationMs: flushResult?.durationMs
    })
  }

  private recordFlushSnapshot(snapshot: Omit<FileProviderIndexFlushSnapshot, 'checkedAt'>): void {
    this.lastFlushSnapshot = {
      ...snapshot,
      checkedAt: Date.now()
    }
  }

  private getFlushResultFromError(error: unknown): FileProviderIndexFlushExecutorResult | null {
    if (!error || typeof error !== 'object' || !('flushResult' in error)) {
      return null
    }
    const result = (error as { flushResult?: unknown }).flushResult
    if (!result || typeof result !== 'object') {
      return null
    }
    return result as FileProviderIndexFlushExecutorResult
  }

  private stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
