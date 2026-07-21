/**
 * Main-thread proxy for SearchIndexService write operations.
 *
 * Delegates FTS mutations and file-domain persistence to a dedicated Worker
 * thread so SQLite writes never block the Electron main-thread event loop.
 *
 * Read operations (search, lookupByKeywords, etc.) are NOT proxied —
 * they remain on the main-thread SearchIndexService for low latency.
 */
import type {
  SearchIndexItem,
  SearchIndexProviderReplacementSummary
} from '../search-index-service'
import type {
  WorkerMetricsPayload,
  WorkerMetricsResponse,
  WorkerStatusSnapshot,
  WorkerTaskSnapshot
} from '../../addon/files/workers/worker-status'
import type {
  FilePersistenceEntry,
  PersistEntriesSummary,
  ProviderReplacementOutcome,
  WorkerErrorMessage as SearchIndexWorkerErrorMessage,
  WorkerResultMessage
} from './search-index-worker-types'
import type { UpsertFileRecord } from '../file-index-persistence-repository'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { getLogger } from '@talex-touch/utils/common/logger'
import {
  FILE_WORKER_IDLE_SHUTDOWN_MS,
  IdleWorkerShutdownController
} from '../../addon/files/workers/idle-worker-shutdown'
import { deserializeSearchIndexWorkerError } from './search-index-worker-error'
import { normalizeScanProgressUpsert } from './search-index-worker-scan-progress'
import { operationalErrorService } from '../../../observability'

const log = getLogger('search-index-worker')
const DEFAULT_COMMIT_RESPONSE_TIMEOUT_MS = 60_000
const DEFAULT_OUTCOME_LOOKUP_TIMEOUT_MS = 5_000
const DEFAULT_OUTCOME_LOOKUP_ATTEMPTS = 2
const DEFAULT_TERMINATION_TIMEOUT_MS = 1_000

function resolveTaskOperation(taskId: string): string {
  const separator = taskId.indexOf('-')
  return separator > 0 ? taskId.slice(0, separator) : 'unknown'
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback
}

export type { UpsertFileRecord } from '../file-index-persistence-repository'
export type { FilePersistenceEntry, PersistEntriesSummary } from './search-index-worker-types'

export interface SearchIndexWorkerClientOptions {
  commitResponseTimeoutMs?: number
  outcomeLookupTimeoutMs?: number
  outcomeLookupAttempts?: number
  terminationTimeoutMs?: number
}

// ---------- Message Types (mirrors worker) ----------

interface DoneMessage {
  type: 'done'
  taskId: string
  result?: unknown
}

interface LegacyErrorMessage {
  type: 'error'
  taskId: string
  error: string
}

type WorkerMessage =
  | DoneMessage
  | WorkerResultMessage
  | LegacyErrorMessage
  | SearchIndexWorkerErrorMessage
  | WorkerMetricsResponse

interface PendingTask {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  startedAt: number
  timeout?: ReturnType<typeof setTimeout>
}

class SearchIndexWorkerTaskTimeoutError extends Error {
  constructor(taskId: string, timeoutMs: number) {
    super(`SEARCH_INDEX_WORKER_TASK_TIMEOUT:${taskId}:${String(timeoutMs)}`)
    this.name = 'SearchIndexWorkerTaskTimeoutError'
  }
}

class SearchIndexWorkerTerminationUnconfirmedError extends Error {
  constructor(detail: string) {
    super(`SEARCH_INDEX_WORKER_TERMINATION_UNCONFIRMED:${detail}`)
    this.name = 'SearchIndexWorkerTerminationUnconfirmedError'
  }
}

interface PendingMetrics {
  resolve: (value: WorkerMetricsPayload | null) => void
  timeout: ReturnType<typeof setTimeout>
}

interface DrainWaiter {
  resolve: () => void
  timeout: ReturnType<typeof setTimeout>
  reject: (error: Error) => void
}

// ---------- Client ----------

export class SearchIndexWorkerClient {
  private worker: Worker | null = null
  private pending = new Map<string, PendingTask>()
  private metricsPending = new Map<string, PendingMetrics>()
  private readonly drainWaiters = new Set<DrainWaiter>()
  private readonly replacementSessions = new Set<string>()
  private shuttingDown = false
  private activeCommitOperations = 0
  private lastError: string | null = null
  private lastTask: WorkerTaskSnapshot | null = null
  private workerStartedAt: number | null = null
  private lastMetricsSample: { at: number; cpuUsage: WorkerMetricsPayload['cpuUsage'] } | null =
    null
  private initPromise: Promise<void> | null = null
  private dbPath: string | null = null
  private readonly commitResponseTimeoutMs: number
  private readonly outcomeLookupTimeoutMs: number
  private readonly outcomeLookupAttempts: number
  private readonly terminationTimeoutMs: number
  private terminationBarrier: Promise<void> | null = null
  private terminationFailure: Error | null = null
  private readonly idleShutdown = new IdleWorkerShutdownController({
    timeoutMs: FILE_WORKER_IDLE_SHUTDOWN_MS,
    shouldShutdown: () =>
      this.pending.size === 0 &&
      this.metricsPending.size === 0 &&
      this.replacementSessions.size === 0 &&
      this.activeCommitOperations === 0,
    shutdown: () => {
      void this.beginWorkerTermination({ keepInitState: true }).catch(() => undefined)
    }
  })

  constructor(options: SearchIndexWorkerClientOptions = {}) {
    this.commitResponseTimeoutMs = positiveInteger(
      options.commitResponseTimeoutMs,
      DEFAULT_COMMIT_RESPONSE_TIMEOUT_MS
    )
    this.outcomeLookupTimeoutMs = positiveInteger(
      options.outcomeLookupTimeoutMs,
      DEFAULT_OUTCOME_LOOKUP_TIMEOUT_MS
    )
    this.outcomeLookupAttempts = positiveInteger(
      options.outcomeLookupAttempts,
      DEFAULT_OUTCOME_LOOKUP_ATTEMPTS
    )
    this.terminationTimeoutMs = positiveInteger(
      options.terminationTimeoutMs,
      DEFAULT_TERMINATION_TIMEOUT_MS
    )
  }

  /**
   * Initialize the worker with a database path.
   * Must be called before any write operations.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  async init(dbPath: string): Promise<void> {
    this.assertTerminationConfirmed()
    this.dbPath = dbPath
    if (this.initPromise) {
      return this.initPromise
    }
    this.initPromise = this.doInit(dbPath).catch((error) => {
      this.initPromise = null
      throw error
    })
    return this.initPromise
  }

  private async doInit(dbPath: string): Promise<void> {
    const worker = this.ensureWorker()
    const taskId = this.generateTaskId('init')

    return new Promise<void>((resolve, reject) => {
      this.pending.set(taskId, {
        resolve: () => resolve(),
        reject,
        startedAt: Date.now()
      })
      worker.postMessage({ type: 'init', taskId, dbPath })
    })
  }

  /** Atomically retire legacy IDs and upsert provider items in the worker. */

  async applyProviderItems(
    providerId: string,
    items: SearchIndexItem[],
    legacyItemIds: readonly string[]
  ): Promise<SearchIndexProviderReplacementSummary> {
    await this.ensureInitialized()
    const taskId = this.generateTaskId('applyProviderItems')
    const result = await this.sendAndWaitWithResult<SearchIndexProviderReplacementSummary>(taskId, {
      type: 'applyProviderItems',
      taskId,
      providerId,
      items,
      legacyItemIds: [...legacyItemIds]
    })
    return result ?? { removedItems: 0, indexedItems: items.length }
  }

  async beginProviderReplacement(providerId: string, replacementId: string): Promise<void> {
    await this.ensureInitialized()
    const taskId = this.generateTaskId('beginProviderReplacement')
    await this.sendAndWait(taskId, {
      type: 'beginProviderReplacement',
      taskId,
      providerId,
      replacementId
    })
    this.replacementSessions.add(this.replacementSessionKey(providerId, replacementId))
  }

  async stageProviderReplacementItems(
    providerId: string,
    replacementId: string,
    items: SearchIndexItem[]
  ): Promise<number> {
    if (items.length === 0) return 0
    await this.ensureInitialized()
    const taskId = this.generateTaskId('stageProviderReplacementItems')
    return (
      (await this.sendAndWaitWithResult<number>(taskId, {
        type: 'stageProviderReplacementItems',
        taskId,
        providerId,
        replacementId,
        items
      })) ?? 0
    )
  }

  async commitProviderReplacement(
    providerId: string,
    replacementId: string
  ): Promise<SearchIndexProviderReplacementSummary> {
    this.activeCommitOperations += 1
    try {
      await this.ensureInitialized()
      const taskId = this.generateTaskId('commitProviderReplacement')
      try {
        const result = await this.sendAndWaitWithResult<SearchIndexProviderReplacementSummary>(
          taskId,
          { type: 'commitProviderReplacement', taskId, providerId, replacementId },
          this.commitResponseTimeoutMs
        )
        return result ?? { removedItems: 0, indexedItems: 0 }
      } catch (error) {
        if (error instanceof SearchIndexWorkerTaskTimeoutError) {
          await this.teardownAmbiguousWorker(error)
        }
        const recovered = await this.getProviderReplacementOutcome(providerId, replacementId)
        if (recovered) return recovered
        throw error
      }
    } finally {
      this.replacementSessions.delete(this.replacementSessionKey(providerId, replacementId))
      this.activeCommitOperations -= 1
      this.resolveDrainWaitersIfIdle()
      this.scheduleIdleShutdown()
    }
  }

  private async getProviderReplacementOutcome(
    providerId: string,
    replacementId: string
  ): Promise<ProviderReplacementOutcome> {
    await this.awaitTerminationConfirmation()
    for (let attempt = 0; attempt < this.outcomeLookupAttempts; attempt += 1) {
      try {
        await this.awaitWithDeadline(
          this.ensureInitialized(),
          this.outcomeLookupTimeoutMs,
          `getProviderReplacementOutcome.init.${String(attempt)}`
        )
        const taskId = this.generateTaskId('getProviderReplacementOutcome')
        return (
          (await this.sendAndWaitWithResult<ProviderReplacementOutcome>(
            taskId,
            { type: 'getProviderReplacementOutcome', taskId, providerId, replacementId },
            this.outcomeLookupTimeoutMs
          )) ?? null
        )
      } catch (error) {
        await this.teardownAmbiguousWorker(
          error instanceof Error ? error : new Error('SEARCH_INDEX_OUTCOME_LOOKUP_FAILED')
        )
      }
    }
    return null
  }

  async abortProviderReplacement(providerId: string, replacementId: string): Promise<void> {
    await this.ensureInitialized()
    const taskId = this.generateTaskId('abortProviderReplacement')
    try {
      await this.sendAndWait(taskId, {
        type: 'abortProviderReplacement',
        taskId,
        providerId,
        replacementId
      })
    } finally {
      this.replacementSessions.delete(this.replacementSessionKey(providerId, replacementId))
      this.scheduleIdleShutdown()
    }
  }

  async removeProviderItems(providerId: string, itemIds: string[]): Promise<number> {
    if (itemIds.length === 0) return 0
    await this.ensureInitialized()
    const taskId = this.generateTaskId('removeProviderItems')
    const result =
      (await this.sendAndWaitWithResult<number>(taskId, {
        type: 'removeProviderItems',
        taskId,
        providerId,
        itemIds
      })) ?? 0
    return result
  }

  /**
   * Remove all items for a provider from FTS5 + keyword_mappings (runs in worker thread).
   */
  async removeByProvider(providerId: string): Promise<number> {
    await this.ensureInitialized()
    const taskId = this.generateTaskId('removeByProvider')
    const result =
      (await this.sendAndWaitWithResult<number>(taskId, {
        type: 'removeByProvider',
        taskId,
        providerId
      })) ?? 0
    return result
  }

  /**
   * Count rows for a provider in FTS5 (runs in worker thread).
   */
  async countByProvider(providerId: string): Promise<number> {
    await this.ensureInitialized()
    const taskId = this.generateTaskId('countByProvider')
    const result = await this.sendAndWaitWithResult<number>(taskId, {
      type: 'countByProvider',
      taskId,
      providerId
    })
    return result ?? 0
  }

  /** Persist file, embedding, and progress rows without mutating the search index. */
  async persistEntries(entries: FilePersistenceEntry[]): Promise<PersistEntriesSummary> {
    if (entries.length === 0) {
      return {
        entries: 0,
        chunks: 0,
        persistedRows: 0,
        fileUpdates: 0,
        progressRows: 0,
        embeddings: 0
      }
    }
    await this.ensureInitialized()
    const taskId = this.generateTaskId('persistEntries')
    const summary = (await this.sendAndWaitWithResult<PersistEntriesSummary>(taskId, {
      type: 'persistEntries',
      taskId,
      entries
    })) ?? {
      entries: entries.length,
      chunks: 0,
      persistedRows: 0,
      fileUpdates: 0,
      progressRows: 0,
      embeddings: 0
    }
    return summary
  }

  async upsertFiles(records: UpsertFileRecord[]): Promise<Array<Record<string, unknown>>> {
    if (records.length === 0) return []
    await this.ensureInitialized()
    const taskId = this.generateTaskId('upsertFiles')
    const result = await this.sendAndWaitWithResult<Array<Record<string, unknown>>>(taskId, {
      type: 'upsertFiles',
      taskId,
      records
    })
    return result ?? []
  }

  async upsertScanProgress(
    paths: string[],
    lastScanned: string,
    sourceId?: string
  ): Promise<number> {
    const normalizedUpsert = normalizeScanProgressUpsert(paths, lastScanned)
    if (!normalizedUpsert) return 0
    await this.ensureInitialized()
    const taskId = this.generateTaskId('upsertScanProgress')
    const result = await this.sendAndWaitWithResult<number>(taskId, {
      type: 'upsertScanProgress',
      taskId,
      paths: normalizedUpsert.paths,
      lastScanned: normalizedUpsert.lastScanned.toISOString(),
      sourceId
    })
    return typeof result === 'number' && Number.isFinite(result)
      ? Math.max(0, Math.trunc(result))
      : normalizedUpsert.paths.length
  }

  /**
   * Phase 1: Remove a file record (single-writer architecture).
   * Main thread delegates file-index writes to the worker to eliminate SQLITE_BUSY.
   */
  async removeFile(path: string): Promise<void> {
    await this.ensureInitialized()
    const taskId = this.generateTaskId('removeFile')
    await this.sendAndWait(taskId, {
      type: 'removeFile',
      taskId,
      path
    })
  }

  /**
   * Phase 1: Remove file_extensions entries (stale asset cache cleanup).
   * Delegates thumbnail/icon cleanup writes to the worker.
   */
  async removeFileExtensions(fileId: number, keys: string[]): Promise<void> {
    if (keys.length === 0) return
    await this.ensureInitialized()
    const taskId = this.generateTaskId('removeFileExtensions')
    await this.sendAndWait(taskId, {
      type: 'removeFileExtensions',
      taskId,
      fileId,
      keys
    })
  }

  /**
   * Phase 1: Cleanup orphaned keyword_mappings (integrity check).
   * Returns the number of deleted rows.
   */
  async cleanupOrphanKeywords(sourceId: string): Promise<number> {
    await this.ensureInitialized()
    const taskId = this.generateTaskId('cleanupOrphanKeywords')
    const result = await this.sendAndWaitWithResult<number>(taskId, {
      type: 'cleanupOrphanKeywords',
      taskId,
      sourceId
    })
    return result ?? 0
  }

  async getStatus(): Promise<WorkerStatusSnapshot> {
    this.idleShutdown.cancel()
    const worker = this.worker
    const pendingCount = this.pending.size
    const metrics = worker ? await this.requestMetrics() : null
    this.scheduleIdleShutdown()
    return {
      name: 'search-index',
      threadId: worker?.threadId ?? null,
      state: !worker ? 'offline' : pendingCount > 0 ? 'busy' : 'idle',
      pending: pendingCount,
      lastTask: this.lastTask,
      lastError: this.lastError,
      uptimeMs: worker && this.workerStartedAt ? Date.now() - this.workerStartedAt : null,
      metrics: this.toStatusMetrics(metrics)
    }
  }

  hasPendingWork(): boolean {
    return (
      this.pending.size > 0 || this.activeCommitOperations > 0 || this.terminationBarrier !== null
    )
  }

  async drain(timeoutMs = 5_000): Promise<void> {
    if (this.terminationFailure) throw this.terminationFailure
    if (!this.hasPendingWork()) return

    await new Promise<void>((resolve, reject) => {
      const waiter: DrainWaiter = {
        resolve: () => {
          clearTimeout(waiter.timeout)
          this.drainWaiters.delete(waiter)
          resolve()
        },
        reject: (error) => {
          clearTimeout(waiter.timeout)
          this.drainWaiters.delete(waiter)
          reject(error)
        },
        timeout: setTimeout(() => {
          this.drainWaiters.delete(waiter)
          reject(new Error('SEARCH_INDEX_WRITER_DRAIN_TIMEOUT'))
        }, timeoutMs)
      }
      waiter.timeout.unref?.()
      this.drainWaiters.add(waiter)
      this.resolveDrainWaitersIfIdle()
    })
  }

  getPendingCount(): number {
    return this.pending.size
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true
    const termination = this.beginWorkerTermination({ keepInitState: false })
    this.rejectPendingTasks(new Error('SEARCH_INDEX_WRITER_CLOSED'))
    this.resolvePendingMetrics()
    this.replacementSessions.clear()
    await this.awaitWorkerTermination(termination)
  }

  // ---------- Internal ----------

  private assertTerminationConfirmed(): void {
    if (this.terminationFailure) throw this.terminationFailure
    if (this.shuttingDown) throw new Error('SEARCH_INDEX_WRITER_CLOSED')
    if (this.terminationBarrier) {
      throw new SearchIndexWorkerTerminationUnconfirmedError('pending')
    }
  }

  private async ensureInitialized(): Promise<void> {
    this.assertTerminationConfirmed()
    if (!this.initPromise && this.dbPath) {
      await this.init(this.dbPath)
    }
    if (!this.initPromise) {
      throw new Error('SearchIndexWorkerClient not initialized — call init(dbPath) first')
    }
    await this.initPromise
  }

  private ensureWorker(): Worker {
    this.assertTerminationConfirmed()
    this.idleShutdown.cancel()
    if (this.worker) return this.worker

    const workerPath = path.join(__dirname, 'search-index-worker.js')
    const worker = new Worker(workerPath)

    worker.on('message', (message: WorkerMessage) => this.handleMessage(message))
    worker.on('error', (error) => {
      if (this.worker === worker) this.handleWorkerError(error)
    })
    worker.on('exit', (code) => {
      if (this.worker === worker && code !== 0) {
        this.handleWorkerError(new Error(`SearchIndexWorker exited with code ${code}`))
      }
    })

    this.worker = worker
    this.workerStartedAt = Date.now()
    log.info('[SearchIndexWorkerClient] Worker spawned')
    return worker
  }

  private async awaitWithDeadline<T>(
    operation: Promise<T>,
    timeoutMs: number,
    label: string
  ): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new SearchIndexWorkerTaskTimeoutError(label, timeoutMs))
      }, timeoutMs)
      timeout.unref?.()
      void operation.then(
        (value) => {
          clearTimeout(timeout)
          resolve(value)
        },
        (error) => {
          clearTimeout(timeout)
          reject(error)
        }
      )
    })
  }

  private sendAndWait(taskId: string, message: unknown): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.pending.set(taskId, {
        resolve: () => resolve(),
        reject,
        startedAt: Date.now()
      })
      this.ensureWorker().postMessage(message)
    })
  }

  private sendAndWaitWithResult<T>(
    taskId: string,
    message: unknown,
    timeoutMs?: number
  ): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve, reject) => {
      const pending: PendingTask = {
        resolve: (value) => resolve(value as T | undefined),
        reject,
        startedAt: Date.now()
      }
      if (timeoutMs !== undefined) {
        pending.timeout = setTimeout(() => {
          if (this.pending.get(taskId) !== pending) return
          this.pending.delete(taskId)
          this.resolveDrainWaitersIfIdle()
          pending.reject(new SearchIndexWorkerTaskTimeoutError(taskId, timeoutMs))
        }, timeoutMs)
        pending.timeout.unref?.()
      }
      this.pending.set(taskId, pending)
      this.ensureWorker().postMessage(message)
    })
  }

  private handleMessage(message: WorkerMessage): void {
    if (message.type === 'metrics') {
      const pending = this.metricsPending.get(message.requestId)
      if (!pending) return
      clearTimeout(pending.timeout)
      pending.resolve(message.metrics)
      this.metricsPending.delete(message.requestId)
      this.scheduleIdleShutdown()
      return
    }

    const pending = this.pending.get(message.taskId)
    if (!pending) return

    if (message.type === 'done' || message.type === 'result') {
      this.pending.delete(message.taskId)
      if (pending.timeout) clearTimeout(pending.timeout)
      this.resolveDrainWaitersIfIdle()
      this.lastTask = {
        id: message.taskId,
        startedAt: new Date(pending.startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - pending.startedAt,
        error: null
      }
      pending.resolve(message.result)
      this.scheduleIdleShutdown()
      return
    }

    if (message.type === 'error') {
      this.pending.delete(message.taskId)
      if (pending.timeout) clearTimeout(pending.timeout)
      this.resolveDrainWaitersIfIdle()
      const remoteError = deserializeSearchIndexWorkerError(message.error)
      const report = operationalErrorService.report({
        domain: 'search-index-worker',
        operation: resolveTaskOperation(message.taskId),
        error: remoteError,
        severity: 'error',
        userImpact: 'degraded',
        captureDetail: false
      })
      this.lastError = report.publicMessage
      this.lastTask = {
        id: message.taskId,
        startedAt: new Date(pending.startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - pending.startedAt,
        error: report.publicMessage
      }
      pending.reject(remoteError)
      this.scheduleIdleShutdown()
    }
  }

  private async teardownAmbiguousWorker(error: Error): Promise<void> {
    const report = operationalErrorService.report({
      domain: 'search-index-worker',
      operation: 'task-timeout',
      error,
      code: 'SEARCH_INDEX_WORKER_TIMEOUT',
      retryable: true,
      userImpact: 'degraded'
    })
    this.rejectPendingTasks(error)
    this.resolvePendingMetrics()
    this.replacementSessions.clear()
    this.lastError = report.publicMessage
    log.warn('[SearchIndexWorkerClient] Worker response timed out, restarting for recovery', {
      error
    })
    const termination = this.beginWorkerTermination({ keepInitState: true })
    await this.awaitWorkerTermination(termination)
  }

  private async awaitTerminationConfirmation(): Promise<void> {
    if (this.terminationFailure) throw this.terminationFailure
    const termination = this.terminationBarrier
    if (!termination) return
    await this.awaitWorkerTermination(termination)
  }

  private async awaitWorkerTermination(termination: Promise<void>): Promise<void> {
    try {
      await this.awaitWithDeadline(termination, this.terminationTimeoutMs, 'worker.terminate')
    } catch (error) {
      if (error instanceof SearchIndexWorkerTerminationUnconfirmedError) throw error
      throw new SearchIndexWorkerTerminationUnconfirmedError(
        error instanceof SearchIndexWorkerTaskTimeoutError ? 'timeout' : 'rejected'
      )
    }
  }

  private handleWorkerError(error: Error): void {
    const report = operationalErrorService.report({
      domain: 'search-index-worker',
      operation: 'runtime',
      error,
      code: 'SEARCH_INDEX_WORKER_CRASH',
      userImpact: 'blocked'
    })
    void this.beginWorkerTermination({ keepInitState: true }).catch(() => undefined)
    this.rejectPendingTasks(error)
    this.resolvePendingMetrics()
    this.replacementSessions.clear()
    this.lastError = report.publicMessage
    log.warn('[SearchIndexWorkerClient] Worker failed, will restart on demand', { error })
  }

  private rejectPendingTasks(error: Error): void {
    for (const pending of this.pending.values()) {
      if (pending.timeout) clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
    this.resolveDrainWaitersIfIdle()
  }

  private resolvePendingMetrics(): void {
    for (const pending of this.metricsPending.values()) {
      clearTimeout(pending.timeout)
      pending.resolve(null)
    }
    this.metricsPending.clear()
  }

  private resolveDrainWaitersIfIdle(): void {
    if (this.terminationFailure) {
      for (const waiter of [...this.drainWaiters]) waiter.reject(this.terminationFailure)
      return
    }
    if (this.hasPendingWork()) return
    for (const waiter of [...this.drainWaiters]) waiter.resolve()
  }

  private generateTaskId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  private async requestMetrics(): Promise<WorkerMetricsPayload | null> {
    const worker = this.worker
    if (!worker) return null

    const requestId = `metrics-${Date.now()}-${Math.random().toString(16).slice(2)}`
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.metricsPending.delete(requestId)
        resolve(null)
        this.scheduleIdleShutdown()
      }, 300)
      this.metricsPending.set(requestId, { resolve, timeout })
      worker.postMessage({ type: 'metrics', requestId })
    })
  }

  private toStatusMetrics(metrics: WorkerMetricsPayload | null): WorkerStatusSnapshot['metrics'] {
    if (!metrics) return null
    const percent = this.computeCpuPercent(metrics)
    return {
      capturedAt: metrics.timestamp,
      memory: metrics.memory,
      cpu: {
        user: metrics.cpuUsage.user,
        system: metrics.cpuUsage.system,
        percent
      },
      eventLoop: metrics.eventLoop
    }
  }

  private computeCpuPercent(metrics: WorkerMetricsPayload): number | null {
    if (!this.lastMetricsSample) {
      this.lastMetricsSample = { at: metrics.timestamp, cpuUsage: metrics.cpuUsage }
      return null
    }
    const elapsedMs = metrics.timestamp - this.lastMetricsSample.at
    const deltaUser = metrics.cpuUsage.user - this.lastMetricsSample.cpuUsage.user
    const deltaSystem = metrics.cpuUsage.system - this.lastMetricsSample.cpuUsage.system
    this.lastMetricsSample = { at: metrics.timestamp, cpuUsage: metrics.cpuUsage }
    if (elapsedMs <= 0) return null
    const deltaMs = (deltaUser + deltaSystem) / 1000
    const percent = (deltaMs / elapsedMs) * 100
    return Number.isFinite(percent) ? Math.max(0, percent) : null
  }

  private replacementSessionKey(providerId: string, replacementId: string): string {
    return `${providerId}\u0000${replacementId}`
  }

  private scheduleIdleShutdown(): void {
    if (
      !this.worker ||
      this.pending.size > 0 ||
      this.metricsPending.size > 0 ||
      this.replacementSessions.size > 0 ||
      this.activeCommitOperations > 0
    ) {
      return
    }

    this.idleShutdown.schedule()
  }

  private beginWorkerTermination(options: { keepInitState: boolean }): Promise<void> {
    this.idleShutdown.cancel()
    if (!options.keepInitState) this.dbPath = null
    if (this.terminationFailure) return Promise.reject(this.terminationFailure)
    if (this.terminationBarrier) return this.terminationBarrier

    const worker = this.worker
    this.worker = null
    this.workerStartedAt = null
    this.lastMetricsSample = null
    this.initPromise = null
    if (!worker) return Promise.resolve()

    const termination = Promise.resolve()
      .then(() => worker.terminate())
      .then(() => undefined)
    this.terminationBarrier = termination
    void termination.then(
      () => {
        if (this.terminationBarrier !== termination) return
        this.terminationBarrier = null
        this.resolveDrainWaitersIfIdle()
      },
      () => {
        if (this.terminationBarrier !== termination) return
        this.terminationFailure = new SearchIndexWorkerTerminationUnconfirmedError('rejected')
        this.resolveDrainWaitersIfIdle()
      }
    )
    return termination
  }
}
