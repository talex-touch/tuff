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
  type FileProviderIndexFlushExecutorResult,
  type FileProviderIndexFlushExecutorServiceDeps
} from './file-provider-index-flush-executor-service'
import {
  type FileProviderIndexFlushFailureDecision,
  FileProviderIndexFlushRetryService
} from './file-provider-index-flush-retry-service'
import { IndexMaintenanceDeferredError } from '../../../search-engine/index-maintenance-context'

const INDEX_FLUSH_FAILURE_LOG_THROTTLE_MS = 30_000
const FILE_INDEX_PERSIST_BARRIER_TIMEOUT_MS = 30_000
const FILE_INDEX_PERSIST_BARRIER_INTERVAL_MS = 10

export interface FileProviderIndexBufferSnapshot {
  pending: number
  inflight: number
  pendingBytes: number
  inflightBytes: number
}

export type FileProviderIndexFlushSnapshot = Omit<IndexedWriteFlushSnapshot, 'status'> & {
  status: 'idle' | 'flushed' | 'worker-not-ready' | 'failed' | 'foreground-deferred'
}

export interface FileProviderIndexRuntimeServiceDeps {
  checkContentCapacity?: () => Promise<boolean>
  isContentAdmissionEnabled?: () => boolean
  recordStorageFailure?: (error: unknown) => boolean
  /** Uses the existing source gate; idle waiting must occur before taking the lease. */
  resumeDeferredFlush: (
    operation: (leaseId: string) => Promise<void>,
    signal: AbortSignal
  ) => Promise<void>
  prepareDeferredEntries: (entries: IndexWorkerFileResult[], leaseId: string) => Promise<boolean>
  isMutationLeaseCancelled?: (leaseId: string) => boolean
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
  /** Optional embeddings writer; see `FileProviderIndexFlushExecutorServiceDeps.indexEmbeddings`. */
  indexEmbeddings?: FileProviderIndexFlushExecutorServiceDeps['indexEmbeddings']
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
  private readonly indexEmbeddings: FileProviderIndexRuntimeServiceDeps['indexEmbeddings']
  private readonly logDebug: FileProviderIndexRuntimeServiceDeps['logDebug']
  private readonly logWarn: FileProviderIndexRuntimeServiceDeps['logWarn']
  private readonly now: () => number
  private readonly config: Required<NonNullable<FileProviderIndexRuntimeServiceDeps['config']>>
  private readonly deps: FileProviderIndexRuntimeServiceDeps
  private disposed = false
  private explicitFlushNotBefore = 0
  private activeFlushes = 0
  private failureLogState: { signature: string; loggedAt: number; suppressed: number } | null = null
  private foregroundDeferred = false
  private deferredResumeController: AbortController | null = null
  private readonly detachedLeases = new Set<string>()
  private readonly revokedLeases = new Set<string>()
  private resumeLeaseId: string | null = null
  private cancellationInProgress = false
  private flushGeneration = 0
  private activeFlushGeneration = 0
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
    this.deps = deps
    this.flushBatchScheduler = deps.flushBatchScheduler
    this.getDbUtils = deps.getDbUtils
    this.getSearchIndex = deps.getSearchIndex
    this.ensureSearchIndexWorkerReady = deps.ensureSearchIndexWorkerReady
    this.getSearchIndexWorker = deps.getSearchIndexWorker
    this.buildPersistEntries = deps.buildPersistEntries
    this.publishRecords = deps.publishRecords
    this.indexEmbeddings = deps.indexEmbeddings
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
      checkContentCapacity: deps.checkContentCapacity,
      isAvailable: () =>
        !this.disposed &&
        this.activeFlushGeneration === this.flushGeneration &&
        (deps.isContentAdmissionEnabled?.() ?? true),
      flushBatchScheduler: this.flushBatchScheduler,
      getDbUtils: this.getDbUtils,
      getSearchIndex: this.getSearchIndex,
      buffer: this.bufferService,
      prepareBatch: async (entries) => {
        const leaseId = this.resumeLeaseId
        if (leaseId) {
          if (this.isLeaseCancelled(leaseId)) return false
          const ready = await deps.prepareDeferredEntries(entries, leaseId)
          if (ready && this.activeFlushGeneration === this.flushGeneration) {
            for (const entry of entries) entry.mutationLeaseId = leaseId
          }
          return ready
        }
        return !entries.some((entry) => this.isLeaseCancelled(entry.mutationLeaseId))
      },
      ensureSearchIndexWorkerReady: this.ensureSearchIndexWorkerReady,
      getSearchIndexWorker: this.getSearchIndexWorker,
      buildPersistEntries: this.buildPersistEntries,
      publishRecords: this.publishRecords,
      indexEmbeddings: this.indexEmbeddings,
      recordStorageFailure: deps.recordStorageFailure,
      logDebug: this.logDebug,
      config: {
        dbBackpressureMaxQueued: this.config.dbBackpressureMaxQueued
      }
    })
    this.flushRuntime = new IndexedWriteFlushRuntimeService({
      getPendingSize: () => this.bufferService.pendingSize,
      getInflightSize: () => this.bufferService.inflightSize,
      hasWork: () => this.hasBufferedWork(),
      isAvailable: () =>
        !this.disposed &&
        Boolean(this.getDbUtils() && this.getSearchIndex()) &&
        !this.foregroundDeferred &&
        (deps.isContentAdmissionEnabled?.() ?? true),
      executeFlush: () => this.executeFlush(),
      recordIdle: (input) => {
        if (!this.foregroundDeferred)
          this.recordFlushSnapshot(buildIndexedWriteFlushIdleSnapshot(input))
      },
      getFlushDelay: (pendingSize) => this.retryService.getFlushDelay(pendingSize),
      resolveFailure: (input) =>
        this.retryService.resolveFailure({
          error: input.error,
          pendingSize: input.pendingSize,
          retryCount: input.retryCount
        }),
      handleFailure: ({ error, decision }) => this.handleFlushFailure(error, decision),
      handleDeferredFailure: (error) => {
        if (
          this.disposed ||
          this.activeFlushGeneration !== this.flushGeneration ||
          this.deps.isContentAdmissionEnabled?.() === false
        ) {
          this.cancelDeferredFlush()
          return true
        }
        if (!(error instanceof IndexMaintenanceDeferredError)) return false
        this.markForegroundDeferred()
        this.startDeferredResume()
        return true
      },
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

  dispose(): void {
    this.disposed = true
    this.cancelDeferredFlush()
    this.flushRuntime.dispose()
  }

  /** Cleanup waits only for the bounded active writer, not paused parser payloads. */
  async waitForInFlight(timeoutMs = FILE_INDEX_PERSIST_BARRIER_TIMEOUT_MS): Promise<void> {
    const deadline = this.now() + timeoutMs
    while (this.activeFlushes > 0 && this.now() < deadline) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, FILE_INDEX_PERSIST_BARRIER_INTERVAL_MS)
      )
    }
    if (this.activeFlushes > 0) throw new Error('FILE_INDEX_PERSIST_BARRIER_TIMEOUT')
  }

  handleIndexWorkerFile(payload: IndexWorkerFileResult): void {
    if (!payload || typeof payload.fileId !== 'number') {
      return
    }
    if (
      this.disposed ||
      this.cancellationInProgress ||
      this.deps.isContentAdmissionEnabled?.() === false ||
      this.isLeaseCancelled(payload.mutationLeaseId)
    )
      return
    if (
      this.deps.getPendingResults().get(payload.fileId) === payload ||
      this.deps.getInflightResults().get(payload.fileId) === payload
    )
      return
    if (this.foregroundDeferred && payload.mutationLeaseId)
      this.detachedLeases.add(payload.mutationLeaseId)

    const pendingSize = this.bufferService.enqueue(payload)
    this.scheduleFlush(this.retryService.getFlushDelay(pendingSize), 'worker-payload')
  }

  getFlushSnapshot(): FileProviderIndexFlushSnapshot | null {
    return this.flushSnapshotService.getSnapshot()
  }

  /**
   * Current retained result ownership, including conservative byte totals.
   * Purely observational — never schedules or extends work.
   */
  getBufferSnapshot(): FileProviderIndexBufferSnapshot {
    return {
      pending: this.bufferService.pendingSize,
      inflight: this.bufferService.inflightSize,
      pendingBytes: this.bufferService.pendingBytes,
      inflightBytes: this.bufferService.inflightBytes
    }
  }

  /** Returns false on foreground handoff, after the active writer has actually settled.
   * Durable pending rows and retained payloads then belong to the idle resume, not this lease.
   */
  async waitForPersisted(timeoutMs = FILE_INDEX_PERSIST_BARRIER_TIMEOUT_MS): Promise<boolean> {
    const deadline = this.now() + timeoutMs
    while (
      this.activeFlushes > 0 ||
      this.bufferService.pendingSize > 0 ||
      this.bufferService.inflightSize > 0
    ) {
      if (this.disposed) throw new Error('FILE_INDEX_RUNTIME_DISPOSED')
      if (this.deps.isContentAdmissionEnabled?.() === false) {
        this.flushRuntime.cancelScheduledFlush()
        throw new Error('FILE_CONTENT_STORAGE_PAUSED')
      }
      if (this.foregroundDeferred && this.activeFlushes === 0) return false
      this.scheduleFlush(0, 'batch-completion-barrier')
      if (this.now() >= deadline) break
      await new Promise<void>((resolve) =>
        setTimeout(resolve, FILE_INDEX_PERSIST_BARRIER_INTERVAL_MS)
      )
    }
    if (
      this.activeFlushes > 0 ||
      this.bufferService.pendingSize > 0 ||
      this.bufferService.inflightSize > 0
    ) {
      throw new Error('FILE_INDEX_PERSIST_BARRIER_TIMEOUT')
    }
    return true
  }

  isMutationLeaseDetached(leaseId: string): boolean {
    return this.activeFlushes === 0 && this.detachedLeases.has(leaseId)
  }

  /** Capacity/settings cancellation leaves durable pending progress as the recovery source. */
  cancelDeferredFlush(): void {
    this.deferredResumeController?.abort(new Error('FILE_INDEX_DEFERRED_CANCELLED'))
    this.foregroundDeferred = false
    this.flushGeneration += 1
    this.cancellationInProgress = this.activeFlushes > 0
    this.flushRuntime.cancelScheduledFlush()
    for (const entry of [
      ...this.deps.getPendingResults().values(),
      ...this.deps.getInflightResults().values()
    ]) {
      if (entry.mutationLeaseId) this.revokedLeases.add(entry.mutationLeaseId)
    }
    this.deps.getPendingResults().clear()
    this.detachedLeases.clear()
    this.flushExecutor.discardRetainedBatch()
  }

  private isLeaseCancelled(leaseId?: string): boolean {
    return Boolean(
      leaseId && (this.revokedLeases.has(leaseId) || this.deps.isMutationLeaseCancelled?.(leaseId))
    )
  }

  private markForegroundDeferred(): void {
    this.foregroundDeferred = true
    this.flushRuntime.cancelScheduledFlush()
    for (const entry of [
      ...this.deps.getPendingResults().values(),
      ...this.deps.getInflightResults().values()
    ]) {
      if (entry.mutationLeaseId) this.detachedLeases.add(entry.mutationLeaseId)
    }
    this.recordFlushSnapshot({
      status: 'foreground-deferred',
      entries: this.flushExecutor.retainedEntries.length,
      pending: this.bufferService.pendingSize,
      inflight: this.bufferService.inflightSize,
      reason: 'foreground-deferred'
    })
  }

  private hasBufferedWork(): boolean {
    return this.bufferService.pendingSize > 0 || this.flushExecutor.retainedEntries.length > 0
  }

  private async waitForDeferredRetry(delayMs: number, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    await new Promise<void>((resolve, reject) => {
      const abort = (): void => {
        clearTimeout(timer)
        reject(signal.reason)
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort)
        resolve()
      }, delayMs)
      signal.addEventListener('abort', abort, { once: true })
    })
  }

  private startDeferredResume(): void {
    if (this.deferredResumeController || this.disposed) return
    const controller = new AbortController()
    const generation = this.flushGeneration
    this.deferredResumeController = controller
    void (async () => {
      let retryCount = 0
      try {
        while (
          this.foregroundDeferred &&
          !controller.signal.aborted &&
          generation === this.flushGeneration
        ) {
          if (this.deps.isContentAdmissionEnabled?.() === false) {
            this.cancelDeferredFlush()
            return
          }
          let retryDelayMs = 0
          try {
            await this.deps.resumeDeferredFlush(async (leaseId) => {
              controller.signal.throwIfAborted()
              if (this.disposed || this.deps.isContentAdmissionEnabled?.() === false) {
                this.cancelDeferredFlush()
                return
              }
              this.resumeLeaseId = leaseId
              try {
                // No timer may inherit this lease: every deferred attempt is awaited here.
                while (this.hasBufferedWork()) {
                  controller.signal.throwIfAborted()
                  const result = await this.executeFlush()
                  controller.signal.throwIfAborted()
                  if (result.status === 'worker-not-ready') {
                    retryDelayMs = this.config.backlogDelayMs
                    return
                  }
                  retryCount = 0
                }
                this.foregroundDeferred = false
                this.detachedLeases.clear()
              } finally {
                this.resumeLeaseId = null
              }
            }, controller.signal)
          } catch (error) {
            if (controller.signal.aborted || generation !== this.flushGeneration) throw error
            if (this.disposed || this.deps.isContentAdmissionEnabled?.() === false) {
              this.cancelDeferredFlush()
              return
            }
            if (error instanceof IndexMaintenanceDeferredError) {
              this.markForegroundDeferred()
            } else {
              const decision = this.retryService.resolveFailure({
                error,
                pendingSize:
                  this.bufferService.pendingSize + this.flushExecutor.retainedEntries.length,
                retryCount
              })
              retryCount = decision.nextRetryCount
              retryDelayMs = decision.delayMs
              this.handleFlushFailure(error, decision)
            }
          }
          // Worker readiness and SQL backoff both wait after releasing source ownership.
          if (this.foregroundDeferred && retryDelayMs > 0) {
            await this.waitForDeferredRetry(retryDelayMs, controller.signal)
          }
        }
      } catch (error) {
        if (!controller.signal.aborted && !this.disposed) {
          this.logWarn('Deferred index flush resume failed', error)
        }
      } finally {
        if (this.deferredResumeController === controller) {
          this.deferredResumeController = null
          if (
            this.foregroundDeferred &&
            !this.disposed &&
            this.deps.isContentAdmissionEnabled?.() !== false
          ) {
            this.startDeferredResume()
          }
        }
      }
    })()
  }

  scheduleFlush(delayMs: number, reason: string): void {
    if (
      this.disposed ||
      this.foregroundDeferred ||
      this.deps.isContentAdmissionEnabled?.() === false
    )
      return
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
    if (this.activeFlushes > 0) {
      return {
        status: 'idle',
        entries: 0,
        withContent: 0,
        pending: this.bufferService.pendingSize,
        inflight: this.bufferService.inflightSize,
        reason: 'flush-in-progress'
      }
    }
    this.activeFlushes += 1
    this.activeFlushGeneration = this.flushGeneration
    try {
      const result = await this.flushExecutor.execute()
      this.recordFlushExecutorResult(result)
      if (result.status === 'worker-not-ready') {
        this.logWarn('Index worker flush skipped: worker init unavailable', undefined, {
          pending: result.pending,
          inflight: result.inflight
        })
      }
      return result
    } catch (error) {
      const cancelled = error instanceof Error && error.message === 'INDEXED_WRITE_FLUSH_CANCELLED'
      if (!cancelled && !(error instanceof IndexMaintenanceDeferredError))
        this.deps.recordStorageFailure?.(error)
      if (
        this.deps.isContentAdmissionEnabled?.() === false ||
        this.activeFlushGeneration !== this.flushGeneration ||
        this.disposed
      ) {
        this.flushRuntime.cancelScheduledFlush()
        this.deps.getPendingResults().clear()
      }
      throw error
    } finally {
      this.activeFlushes -= 1
      this.cancellationInProgress = false
      if (
        this.disposed ||
        this.deps.isContentAdmissionEnabled?.() === false ||
        this.activeFlushGeneration !== this.flushGeneration
      ) {
        this.flushExecutor.discardRetainedBatch()
      }
    }
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
