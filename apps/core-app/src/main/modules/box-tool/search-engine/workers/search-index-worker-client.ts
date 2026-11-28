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
  ExecWriteResult,
  PersistAndApplyProviderItemsResult,
  ProviderReplacementOutcome,
  RemoveFileRecordsMessage,
  RemoveFileRecordsResult,
  RemoveMissingFileSearchRecordsMessage,
  RemoveMissingFileSearchRecordsResult,
  ListPendingFileDeletionCommitsMessage,
  ListPendingFileDeletionCommitsResult,
  AcknowledgeFileDeletionCommitsMessage,
  AcknowledgeFileDeletionCommitsResult,
  RunIndexMaintenanceSliceMessage,
  WorkerErrorMessage as SearchIndexWorkerErrorMessage,
  WorkerResultMessage,
  VacuumResult
} from './search-index-worker-types'
import type {
  ExpectedFileRecord,
  ExpectedMissingFileSearchRecord,
  FileRecordRemovalOptions,
  FileMetadataUpdateRecord,
  FileMetadataUpdateSummary,
  UpsertFileRecord
} from '../file-index-persistence-repository'
import { existsSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { trackWorkerThread } from '../../../../core/worker-thread-registry'
import { getLogger } from '@talex-touch/utils/common/logger'
import {
  FILE_WORKER_IDLE_SHUTDOWN_MS,
  IdleWorkerShutdownController
} from '../../addon/files/workers/idle-worker-shutdown'
import { deserializeSearchIndexWorkerError } from './search-index-worker-error'
import { normalizeScanProgressUpsert } from './search-index-worker-scan-progress'
import { operationalErrorService } from '../../../observability'
import { isIndexMaintenanceIdle } from '../search-activity'
import {
  SEARCH_KERNEL_ERROR_CODES,
  SEARCH_KERNEL_TASKS,
  SearchKernelClientError,
  getSharedSearchKernelClient,
  isSearchKernelUtilityProcessEnabled,
  type SearchKernelClient,
  type SearchKernelMemorySnapshot
} from '../kernel'
import type {
  IndexMaintenanceNotification,
  IndexMaintenanceSlice
} from '../index-maintenance-context'

const log = getLogger('search-index-worker')
const DEFAULT_COMMIT_RESPONSE_TIMEOUT_MS = 60_000
const DEFAULT_OUTCOME_LOOKUP_TIMEOUT_MS = 5_000
const DEFAULT_OUTCOME_LOOKUP_ATTEMPTS = 2
const DEFAULT_TERMINATION_TIMEOUT_MS = 1_000
const KERNEL_DEFAULT_WRITER_TASK_TIMEOUT_MS = 10 * 60_000
const KERNEL_VACUUM_TASK_TIMEOUT_MS = 60 * 60_000
const KERNEL_METRICS_TIMEOUT_MS = 300
// Bound the wait for the worker to checkpoint + close its DB before we hard
// terminate it. Always falls through to terminate() so teardown can't hang.
const GRACEFUL_CLOSE_TIMEOUT_MS = 2_000
const SHUTDOWN_GRACEFUL_CLOSE_TIMEOUT_MS = 500
// An idle maintenance slice wakes on the same 60 s anchor as the idle-worker retirement, so it
// can land inside that graceful-close window. Waiting the window out is cheaper than a rejected
// request plus a 250 ms re-dispatch, and it keeps the slice off the retiring worker.
const MAINTENANCE_RETIREMENT_WAIT_MS = GRACEFUL_CLOSE_TIMEOUT_MS + DEFAULT_TERMINATION_TIMEOUT_MS

function resolveSearchIndexWorkerPath(): string {
  const candidates = new Set<string>([
    path.join(__dirname, 'search-index-worker.js'),
    path.resolve(__dirname, '..', 'search-index-worker.js'),
    path.resolve(process.cwd(), 'out', 'main', 'search-index-worker.js')
  ])
  if (process.resourcesPath) {
    candidates.add(
      path.join(process.resourcesPath, 'app.asar.unpacked', 'out', 'main', 'search-index-worker.js')
    )
    candidates.add(
      path.join(process.resourcesPath, 'app.asar', 'out', 'main', 'search-index-worker.js')
    )
    candidates.add(path.join(process.resourcesPath, 'out', 'main', 'search-index-worker.js'))
  }

  const workerPath = Array.from(candidates).find((candidate) => existsSync(candidate))
  if (!workerPath) {
    throw new Error(`Search index worker not found: ${Array.from(candidates).join(', ')}`)
  }
  return workerPath
}

function resolveTaskOperation(taskId: string): string {
  const separator = taskId.indexOf('-')
  return separator > 0 ? taskId.slice(0, separator) : 'unknown'
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback
}

export type {
  FileMetadataUpdateRecord,
  FileMetadataUpdateSummary,
  UpsertFileRecord
} from '../file-index-persistence-repository'
export type { FilePersistenceEntry, PersistEntriesSummary } from './search-index-worker-types'

export interface SearchIndexWorkerClientOptions {
  commitResponseTimeoutMs?: number
  outcomeLookupTimeoutMs?: number
  outcomeLookupAttempts?: number
  terminationTimeoutMs?: number
  kernelClient?: SearchKernelClient
  useKernelProcess?: boolean
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
  abort?: () => void
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
  private readonly useKernelProcess: boolean
  private readonly kernelClient: SearchKernelClient | null
  private kernelWriterActive = false
  private kernelInitInFlight = false
  private kernelInitGeneration = 0
  private initAttemptSeq = 0
  private terminationBarrier: Promise<void> | null = null
  private retiringForIdle = false
  private terminationSeq = 0
  private terminationFailure: Error | null = null
  private readonly idleShutdown = new IdleWorkerShutdownController({
    timeoutMs: FILE_WORKER_IDLE_SHUTDOWN_MS,
    shouldShutdown: () =>
      this.pending.size === 0 &&
      this.metricsPending.size === 0 &&
      this.replacementSessions.size === 0 &&
      this.activeCommitOperations === 0,
    shutdown: () => {
      // Graceful path detaches this.worker synchronously, so a write during idle
      // teardown re-inits a fresh worker instead of failing on the closing one.
      void this.beginWorkerTermination({ keepInitState: true, graceful: true }).catch(
        () => undefined
      )
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
    this.useKernelProcess =
      options.useKernelProcess ??
      (Boolean(options.kernelClient) || isSearchKernelUtilityProcessEnabled())
    this.kernelClient = this.useKernelProcess
      ? (options.kernelClient ?? getSharedSearchKernelClient())
      : null
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
    const attemptId = ++this.initAttemptSeq
    const attempt = this.doInit(dbPath, attemptId).catch((error) => {
      if (this.initAttemptSeq === attemptId) {
        this.initPromise = null
      }
      throw error
    })
    this.initPromise = attempt
    return attempt
  }

  private async doInit(dbPath: string, attemptId: number): Promise<void> {
    if (this.useKernelProcess) {
      await this.doInitKernel(dbPath, attemptId)
      return
    }
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

  private async doInitKernel(dbPath: string, attemptId: number): Promise<void> {
    const kernelClient = this.kernelClient!
    this.assertTerminationConfirmed()
    this.idleShutdown.cancel()
    this.kernelInitInFlight = true
    try {
      await kernelClient.ensureStarted()
      if (this.initAttemptSeq !== attemptId) return
      const generation =
        typeof kernelClient.getSpawnGeneration === 'function'
          ? kernelClient.getSpawnGeneration()
          : 1
      const taskId = this.generateTaskId('init')
      this.kernelWriterActive = true
      if (this.workerStartedAt === null) {
        this.workerStartedAt = Date.now()
      }
      await this.sendKernelMessage(taskId, { type: 'init', taskId, dbPath })
      if (this.initAttemptSeq === attemptId) {
        this.kernelInitGeneration = generation
      }
    } catch (error) {
      if (this.initAttemptSeq === attemptId) {
        this.kernelInitGeneration = 0
        this.kernelWriterActive = false
      }
      throw error
    } finally {
      if (this.initAttemptSeq === attemptId) {
        this.kernelInitInFlight = false
      }
    }
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
  async persistAndApplyProviderItems(
    records: UpsertFileRecord[],
    providerId: string,
    items: SearchIndexItem[],
    legacyItemIds: readonly string[]
  ): Promise<PersistAndApplyProviderItemsResult> {
    await this.ensureInitialized()
    const taskId = this.generateTaskId('persistAndApplyProviderItems')
    const roundTripStartedAt = performance.now()
    const result = await this.sendAndWaitWithResult<PersistAndApplyProviderItemsResult>(taskId, {
      type: 'persistAndApplyProviderItems',
      taskId,
      records,
      providerId,
      items,
      legacyItemIds: [...legacyItemIds]
    })
    if (!result) {
      return {
        persistedCount: 0,
        summary: { removedItems: 0, indexedItems: items.length }
      }
    }
    if (!result.metrics) return result
    return {
      ...result,
      metrics: {
        ...result.metrics,
        roundTripDurationMs: performance.now() - roundTripStartedAt
      }
    }
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

  async updateFileMetadata(
    records: FileMetadataUpdateRecord[]
  ): Promise<FileMetadataUpdateSummary> {
    if (records.length === 0) return { requested: 0, updated: 0, missingFileIds: [] }
    await this.ensureInitialized()
    const taskId = this.generateTaskId('updateFileMetadata')
    const result = await this.sendAndWaitWithResult<FileMetadataUpdateSummary>(taskId, {
      type: 'updateFileMetadata',
      taskId,
      records
    })
    return result ?? { requested: records.length, updated: 0, missingFileIds: [] }
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

  async removeFileRecords(
    sourceId: string,
    records: readonly ExpectedFileRecord[],
    options: FileRecordRemovalOptions = {}
  ): Promise<RemoveFileRecordsResult> {
    options.signal?.throwIfAborted()
    if (records.length === 0) {
      return { deletedRecords: [], removedIndexedItems: 0, commitId: null, deferred: false }
    }
    const result = await this.sendCancellableRequest<RemoveFileRecordsResult>(
      {
        type: 'removeFileRecords',
        taskId: this.generateTaskId('removeFileRecords'),
        sourceId,
        records
      },
      options
    )
    return result ?? { deletedRecords: [], removedIndexedItems: 0, commitId: null, deferred: true }
  }

  async removeMissingFileSearchRecords(
    sourceId: string,
    records: readonly ExpectedMissingFileSearchRecord[],
    options: FileRecordRemovalOptions = {}
  ): Promise<RemoveMissingFileSearchRecordsResult> {
    options.signal?.throwIfAborted()
    if (records.length === 0) {
      return { deletedRecords: [], removedIndexedItems: 0, commitId: null, deferred: false }
    }
    const result = await this.sendCancellableRequest<RemoveMissingFileSearchRecordsResult>(
      {
        type: 'removeMissingFileSearchRecords',
        taskId: this.generateTaskId('removeMissingFileSearchRecords'),
        sourceId,
        records
      },
      options
    )
    return result ?? { deletedRecords: [], removedIndexedItems: 0, commitId: null, deferred: true }
  }

  async listPendingFileDeletionCommits(
    sourceId: string,
    limit = 64,
    options: FileRecordRemovalOptions = {}
  ): Promise<ListPendingFileDeletionCommitsResult> {
    const result = await this.sendCancellableRequest<ListPendingFileDeletionCommitsResult>(
      {
        type: 'listPendingFileDeletionCommits',
        taskId: this.generateTaskId('listPendingFileDeletionCommits'),
        sourceId,
        limit
      },
      options
    )
    return result ?? { commits: [], deferred: true }
  }

  async acknowledgeFileDeletionCommits(
    sourceId: string,
    commitIds: readonly string[],
    options: FileRecordRemovalOptions = {}
  ): Promise<AcknowledgeFileDeletionCommitsResult> {
    const result = await this.sendCancellableRequest<AcknowledgeFileDeletionCommitsResult>(
      {
        type: 'acknowledgeFileDeletionCommits',
        taskId: this.generateTaskId('acknowledgeFileDeletionCommits'),
        sourceId,
        commitIds
      },
      options
    )
    return result ?? { acknowledged: 0, deferred: true }
  }

  private async sendCancellableRequest<T>(
    message:
      | RemoveFileRecordsMessage
      | RemoveMissingFileSearchRecordsMessage
      | ListPendingFileDeletionCommitsMessage
      | AcknowledgeFileDeletionCommitsMessage
      | RunIndexMaintenanceSliceMessage,
    options: FileRecordRemovalOptions
  ): Promise<T | null> {
    const { signal } = options
    signal?.throwIfAborted()
    if (options.maintenance && this.terminationBarrier) {
      await this.awaitRetirementBeforeMaintenance(signal)
    }
    await this.ensureInitialized(signal)
    signal?.throwIfAborted()
    // Initialization/respawn may have outlived the writer's earlier idle check.
    if (
      options.isStillCurrent?.() === false ||
      (options.maintenance && !isIndexMaintenanceIdle())
    ) {
      return null
    }

    const cancellation =
      signal && !this.useKernelProcess
        ? new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
        : undefined
    const cancellationState = cancellation ? new Int32Array(cancellation) : null
    const abort = (): void => {
      if (cancellationState) Atomics.store(cancellationState, 0, 1)
    }
    signal?.addEventListener('abort', abort, { once: true })
    try {
      signal?.throwIfAborted()
      const payload = cancellation ? { ...message, cancellation } : { ...message }
      const result = await this.sendAndWaitWithResult<T>(message.taskId, payload)
      if (result === undefined || result === null)
        throw new Error(
          message.type === 'runIndexMaintenanceSlice'
            ? 'INDEX_MAINTENANCE_RESULT_MISSING'
            : 'FILE_INDEX_DELETE_RESULT_MISSING'
        )
      return result
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'FileIndexDeleteCancelledError' &&
        signal?.aborted
      ) {
        throw signal.reason
      }
      throw error
    } finally {
      signal?.removeEventListener('abort', abort)
    }
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

  /** No timeout on purpose: a `VACUUM` of a multi-GB file legitimately takes minutes. */
  async vacuum(reason: string): Promise<VacuumResult | null> {
    await this.ensureInitialized()
    const taskId = this.generateTaskId('vacuum')
    const result = await this.sendAndWaitWithResult<VacuumResult>(taskId, {
      type: 'vacuum',
      taskId,
      reason
    })
    return result ?? null
  }

  async runIndexMaintenanceSlice(
    sourceId: string,
    limit = 64,
    signal?: AbortSignal
  ): Promise<IndexMaintenanceSlice> {
    const result = await this.sendCancellableRequest<IndexMaintenanceSlice>(
      {
        type: 'runIndexMaintenanceSlice',
        taskId: this.generateTaskId('runIndexMaintenanceSlice'),
        sourceId,
        limit
      },
      { maintenance: true, signal }
    )
    return result ?? { processed: 0, done: false, deferred: true, notifications: [] }
  }

  async acknowledgeIndexMaintenanceCommit(
    notification: IndexMaintenanceNotification
  ): Promise<void> {
    await this.ensureInitialized()
    const taskId = this.generateTaskId('acknowledgeIndexMaintenanceCommit')
    await this.sendAndWaitWithResult(taskId, {
      type: 'acknowledgeIndexMaintenanceCommit',
      taskId,
      notification
    })
  }

  /**
   * Generic write forwarding: run prepared statements on the worker's connection
   * (the sole writer of its DB file). Used to route main-thread file-index writes
   * through the worker when the DB split is enabled (issue #295). `mode:
   * 'transaction'` runs them atomically. Returns per-statement affected-row
   * counts + rows (for RETURNING).
   */
  async execWrite(
    statements: Array<{ sql: string; args: unknown[] }>,
    mode: 'single' | 'transaction' = 'single'
  ): Promise<ExecWriteResult[]> {
    if (statements.length === 0) return []
    await this.ensureInitialized()
    const taskId = this.generateTaskId('execWrite')
    const result = await this.sendAndWaitWithResult<ExecWriteResult[]>(taskId, {
      type: 'execWrite',
      taskId,
      statements,
      mode
    })
    return result ?? []
  }

  async getMetrics(): Promise<WorkerMetricsPayload | null> {
    return await this.requestMetrics()
  }

  async getStatus(): Promise<WorkerStatusSnapshot> {
    if (this.useKernelProcess && this.kernelClient) {
      const pendingCount = this.pending.size
      const kernelState = this.kernelClient.getState()
      const kernelPid = this.kernelClient.getPid()
      const isOnline = this.kernelWriterActive && kernelState === 'ready'
      const metrics = isOnline ? await this.requestMetrics() : null
      this.scheduleIdleShutdown()
      return {
        name: 'search-index',
        threadId: isOnline ? kernelPid : null,
        state: !isOnline ? 'offline' : pendingCount > 0 ? 'busy' : 'idle',
        pending: pendingCount,
        lastTask: this.lastTask,
        lastError: this.lastError,
        uptimeMs: isOnline && this.workerStartedAt ? Date.now() - this.workerStartedAt : null,
        metrics:
          this.toStatusMetrics(metrics) ??
          (isOnline ? await this.readKernelMemoryFallback() : null),
        executionMode: 'utility-process',
        kernelState,
        kernelPid
      }
    }

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
      metrics:
        this.toStatusMetrics(metrics) ?? (worker ? await this.readHeapStatistics(worker) : null)
    }
  }

  private async readKernelMemoryFallback(): Promise<WorkerStatusSnapshot['metrics']> {
    if (!this.kernelClient || this.kernelClient.getState() !== 'ready') return null
    try {
      const snapshot: SearchKernelMemorySnapshot = await this.kernelClient.memory({
        timeoutMs: KERNEL_METRICS_TIMEOUT_MS
      })
      return {
        capturedAt: snapshot.capturedAt,
        memory: {
          rss: snapshot.rssBytes,
          heapUsed: snapshot.heapUsedBytes,
          heapTotal: snapshot.heapTotalBytes,
          external: snapshot.externalBytes,
          arrayBuffers: snapshot.arrayBuffersBytes
        },
        cpu: { user: 0, system: 0, percent: null },
        eventLoop: null
      }
    } catch {
      return null
    }
  }

  /**
   * Heap figures read from the parent side when the worker cannot answer a metrics message.
   *
   * The writer's event loop sits inside synchronous libSQL calls for most of a bulk index, which
   * is exactly when its heap matters and exactly when the 300ms metrics round-trip times out —
   * the memory snapshot showed this worker as `null` while the process held gigabytes of V8
   * pages. `Worker#getHeapStatistics` is served by a V8 interrupt, so it answers regardless.
   */
  private async readHeapStatistics(worker: Worker): Promise<WorkerStatusSnapshot['metrics']> {
    const readHeap = (
      worker as Worker & {
        getHeapStatistics?: () => Promise<{
          total_heap_size: number
          used_heap_size: number
          heap_size_limit: number
          external_memory?: number
        }>
      }
    ).getHeapStatistics
    if (typeof readHeap !== 'function') return null
    try {
      const heap = await Promise.race([
        readHeap.call(worker),
        new Promise<null>((resolve) => {
          const timer = setTimeout(() => resolve(null), 300)
          timer.unref?.()
        })
      ])
      if (!heap) return null
      return {
        capturedAt: Date.now(),
        memory: {
          rss: process.memoryUsage().rss,
          heapUsed: heap.used_heap_size,
          heapTotal: heap.total_heap_size,
          heapLimit: heap.heap_size_limit,
          external: heap.external_memory ?? 0,
          arrayBuffers: 0
        },
        cpu: { user: 0, system: 0, percent: null },
        eventLoop: null
      }
    } catch {
      return null
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
    this.retiringForIdle = false
    if (this.useKernelProcess) {
      const termination = this.beginWorkerTermination({
        keepInitState: false,
        graceful: true,
        gracefulTimeoutMs: SHUTDOWN_GRACEFUL_CLOSE_TIMEOUT_MS
      })
      this.rejectPendingTasks(new Error('SEARCH_INDEX_WRITER_CLOSED'))
      this.resolvePendingMetrics()
      this.replacementSessions.clear()
      await Promise.race([
        termination.catch((error) => {
          log.warn('[SearchIndexWorkerClient] Kernel writer close did not settle after shutdown', {
            error
          })
        }),
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, SHUTDOWN_GRACEFUL_CLOSE_TIMEOUT_MS)
          timer.unref?.()
        })
      ])
      return
    }
    // A native libSQL call cannot process the close message until it returns. Detach first so an
    // uninterruptible SQLite wait cannot keep Electron alive, then give healthy writes a short
    // grace period before requesting termination.
    const worker = this.worker
    worker?.unref()
    if (worker) {
      await this.requestWorkerGracefulClose(worker, SHUTDOWN_GRACEFUL_CLOSE_TIMEOUT_MS)
    }
    const termination = this.beginWorkerTermination({ keepInitState: false })
    this.rejectPendingTasks(new Error('SEARCH_INDEX_WRITER_CLOSED'))
    this.resolvePendingMetrics()
    this.replacementSessions.clear()
    void this.awaitWorkerTermination(termination).catch((error) => {
      log.warn('[SearchIndexWorkerClient] Writer termination did not settle after shutdown', {
        error
      })
    })
    // Dispatch `worker.terminate()` before reporting shutdown complete; do not await confirmation.
    await Promise.resolve()
  }

  // ---------- Internal ----------

  private assertTerminationConfirmed(): void {
    if (this.terminationFailure) throw this.terminationFailure
    if (this.shuttingDown) throw new Error('SEARCH_INDEX_WRITER_CLOSED')
    if (this.terminationBarrier) {
      throw new SearchIndexWorkerTerminationUnconfirmedError('pending')
    }
  }

  private async ensureInitialized(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    if (!this.shuttingDown && this.retiringForIdle && this.terminationBarrier) {
      await this.awaitRetirementBeforeMaintenance(signal)
      signal?.throwIfAborted()
    }
    this.assertTerminationConfirmed()
    if (
      this.useKernelProcess &&
      this.kernelClient &&
      this.initPromise &&
      !this.kernelInitInFlight
    ) {
      const currentGeneration =
        typeof this.kernelClient.getSpawnGeneration === 'function'
          ? this.kernelClient.getSpawnGeneration()
          : this.kernelInitGeneration
      const kernelState = this.kernelClient.getState()
      if (
        !this.kernelWriterActive ||
        kernelState !== 'ready' ||
        (this.kernelInitGeneration > 0 && currentGeneration !== this.kernelInitGeneration)
      ) {
        this.initAttemptSeq += 1
        this.initPromise = null
        this.kernelInitGeneration = 0
        this.kernelWriterActive = false
      }
    }
    const initialization = this.initPromise ?? (this.dbPath ? this.init(this.dbPath) : null)
    if (!initialization) {
      throw new Error('SearchIndexWorkerClient not initialized — call init(dbPath) first')
    }
    if (!signal) return await initialization
    await new Promise<void>((resolve, reject) => {
      const abort = (): void => {
        signal.removeEventListener('abort', abort)
        reject(signal.reason)
      }
      signal.addEventListener('abort', abort, { once: true })
      void initialization.then(
        () => {
          signal.removeEventListener('abort', abort)
          resolve()
        },
        (error) => {
          signal.removeEventListener('abort', abort)
          reject(error)
        }
      )
      if (signal.aborted) abort()
    })
  }

  private ensureWorker(): Worker {
    this.assertTerminationConfirmed()
    this.idleShutdown.cancel()
    if (this.worker) return this.worker

    const workerPath = resolveSearchIndexWorkerPath()
    const worker = new Worker(workerPath)
    trackWorkerThread(worker, 'search-index-writer')

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
    if (this.useKernelProcess) {
      return this.sendKernelMessage<void>(taskId, message as Record<string, unknown>).then(
        () => undefined
      )
    }
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
    if (this.useKernelProcess) {
      return this.sendKernelMessage<T>(taskId, message as Record<string, unknown>, timeoutMs)
    }
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

  private sendKernelMessage<T>(
    taskId: string,
    message: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<T | undefined> {
    this.assertTerminationConfirmed()
    this.idleShutdown.cancel()
    const kernelClient = this.kernelClient!
    const startedAt = Date.now()
    const abortController = new AbortController()
    const kernelTimeoutMs =
      timeoutMs !== undefined
        ? timeoutMs
        : message.type === 'vacuum'
          ? KERNEL_VACUUM_TASK_TIMEOUT_MS
          : KERNEL_DEFAULT_WRITER_TASK_TIMEOUT_MS

    return new Promise<T | undefined>((resolve, reject) => {
      const pending: PendingTask = {
        resolve: (value) => resolve(value as T | undefined),
        reject,
        startedAt,
        abort: () => abortController.abort()
      }
      if (timeoutMs !== undefined) {
        pending.timeout = setTimeout(() => {
          if (this.pending.get(taskId) !== pending) return
          this.pending.delete(taskId)
          abortController.abort()
          this.resolveDrainWaitersIfIdle()
          pending.reject(new SearchIndexWorkerTaskTimeoutError(taskId, timeoutMs))
        }, timeoutMs)
        pending.timeout.unref?.()
      }
      this.pending.set(taskId, pending)

      void kernelClient
        .invokeTask<WorkerMessage>(
          SEARCH_KERNEL_TASKS.WRITER_REQUEST,
          { message },
          { timeoutMs: kernelTimeoutMs, signal: abortController.signal }
        )
        .then(
          (response) => {
            if (this.pending.get(taskId) !== pending) return
            this.handleKernelWriterResponse(taskId, pending, response)
          },
          (error: unknown) => {
            if (this.pending.get(taskId) !== pending) return
            this.pending.delete(taskId)
            if (pending.timeout) clearTimeout(pending.timeout)
            this.resolveDrainWaitersIfIdle()
            const mapped = this.mapKernelWriterError(taskId, timeoutMs, error)
            const report = operationalErrorService.report({
              domain: 'search-index-worker',
              operation: resolveTaskOperation(taskId),
              error: mapped,
              severity: 'error',
              userImpact: 'degraded',
              captureDetail: false
            })
            this.lastError = report.publicMessage
            this.lastTask = {
              id: taskId,
              startedAt: new Date(pending.startedAt).toISOString(),
              finishedAt: new Date().toISOString(),
              durationMs: Date.now() - pending.startedAt,
              error: report.publicMessage
            }
            pending.reject(mapped)
            this.scheduleIdleShutdown()
          }
        )
    })
  }

  private handleKernelWriterResponse(
    taskId: string,
    pending: PendingTask,
    response: unknown
  ): void {
    this.pending.delete(taskId)
    if (pending.timeout) clearTimeout(pending.timeout)
    this.resolveDrainWaitersIfIdle()

    if (
      response &&
      typeof response === 'object' &&
      'type' in response &&
      (response.type === 'done' || response.type === 'result')
    ) {
      this.lastTask = {
        id: taskId,
        startedAt: new Date(pending.startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - pending.startedAt,
        error: null
      }
      pending.resolve((response as DoneMessage | WorkerResultMessage).result)
      this.scheduleIdleShutdown()
      return
    }

    if (
      response &&
      typeof response === 'object' &&
      'type' in response &&
      response.type === 'error'
    ) {
      const errorPayload = (response as LegacyErrorMessage | SearchIndexWorkerErrorMessage).error
      const remoteError = deserializeSearchIndexWorkerError(errorPayload)
      if (remoteError.message.includes('Worker not initialized')) {
        this.initPromise = null
        this.kernelInitGeneration = 0
        this.kernelWriterActive = false
      }
      const report = operationalErrorService.report({
        domain: 'search-index-worker',
        operation: resolveTaskOperation(taskId),
        error: remoteError,
        severity: 'error',
        userImpact: 'degraded',
        captureDetail: false
      })
      this.lastError = report.publicMessage
      this.lastTask = {
        id: taskId,
        startedAt: new Date(pending.startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - pending.startedAt,
        error: report.publicMessage
      }
      pending.reject(remoteError)
      this.scheduleIdleShutdown()
      return
    }

    pending.reject(new Error('SEARCH_INDEX_KERNEL_INVALID_WRITER_RESPONSE'))
    this.scheduleIdleShutdown()
  }

  private mapKernelWriterError(
    taskId: string,
    timeoutMs: number | undefined,
    error: unknown
  ): Error {
    if (error instanceof SearchKernelClientError) {
      if (error.code === SEARCH_KERNEL_ERROR_CODES.TIMEOUT && timeoutMs !== undefined) {
        return new SearchIndexWorkerTaskTimeoutError(taskId, timeoutMs)
      }
      if (
        error.code === SEARCH_KERNEL_ERROR_CODES.EXITED ||
        error.code === SEARCH_KERNEL_ERROR_CODES.NOT_READY ||
        error.code === SEARCH_KERNEL_ERROR_CODES.SHUTTING_DOWN ||
        error.code === SEARCH_KERNEL_ERROR_CODES.DEGRADED ||
        error.code === 'SEARCH_INDEX_WRITER_EXITED'
      ) {
        this.initPromise = null
        this.kernelInitGeneration = 0
        this.kernelWriterActive = false
      }
      return error
    }
    return error instanceof Error ? error : new Error(String(error))
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

  /**
   * Idle maintenance shares its 60 s anchor with the idle-worker retirement, so the slice can
   * arrive while the previous worker is still closing. `assertTerminationConfirmed` would reject
   * it as `pending` and the runner would only re-dispatch 250 ms later; waiting for the barrier
   * instead lets the slice reach the fresh worker on its first attempt. Bounded and abort-aware:
   * a barrier that never settles keeps the previous `pending` rejection.
   */
  private async awaitRetirementBeforeMaintenance(signal?: AbortSignal): Promise<void> {
    if (this.terminationFailure) throw this.terminationFailure
    const termination = this.terminationBarrier
    if (!termination) return
    await new Promise<void>((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined
      const settle = (finish: () => void): void => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        finish()
      }
      const abort = (): void => settle(() => reject(signal?.reason))
      timer = setTimeout(
        () =>
          settle(() =>
            reject(
              this.terminationFailure ?? new SearchIndexWorkerTerminationUnconfirmedError('pending')
            )
          ),
        MAINTENANCE_RETIREMENT_WAIT_MS
      )
      timer.unref?.()
      signal?.addEventListener('abort', abort, { once: true })
      void termination.then(
        () => settle(resolve),
        (error: unknown) =>
          settle(() =>
            reject(
              error instanceof Error
                ? error
                : new SearchIndexWorkerTerminationUnconfirmedError('rejected')
            )
          )
      )
    })
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
      pending.abort?.()
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
    if (this.useKernelProcess) {
      if (
        !this.kernelWriterActive ||
        !this.kernelClient ||
        this.kernelClient.getState() !== 'ready'
      ) {
        return null
      }
      const kernelClient = this.kernelClient
      const requestId = `metrics-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const abortController = new AbortController()
      return new Promise((resolve) => {
        const settle = (value: WorkerMetricsPayload | null): void => {
          const entry = this.metricsPending.get(requestId)
          if (!entry) return
          this.metricsPending.delete(requestId)
          clearTimeout(entry.timeout)
          resolve(value)
          this.scheduleIdleShutdown()
        }
        const timeout = setTimeout(() => {
          abortController.abort()
          settle(null)
        }, KERNEL_METRICS_TIMEOUT_MS)
        timeout.unref?.()
        this.metricsPending.set(requestId, { resolve, timeout })
        void kernelClient
          .invokeTask<
            WorkerMetricsResponse | { type: 'metrics'; requestId: string; metrics: null }
          >(SEARCH_KERNEL_TASKS.WRITER_REQUEST, { message: { type: 'metrics', requestId } }, { timeoutMs: KERNEL_METRICS_TIMEOUT_MS, signal: abortController.signal })
          .then(
            (response) => {
              const payload =
                response &&
                typeof response === 'object' &&
                response.type === 'metrics' &&
                response.metrics &&
                typeof response.metrics === 'object'
                  ? response.metrics
                  : null
              settle(payload)
            },
            () => {
              settle(null)
            }
          )
      })
    }

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
    const hasActiveWorker = this.useKernelProcess ? this.kernelWriterActive : this.worker !== null
    if (
      !hasActiveWorker ||
      this.pending.size > 0 ||
      this.metricsPending.size > 0 ||
      this.replacementSessions.size > 0 ||
      this.activeCommitOperations > 0
    ) {
      return
    }

    this.idleShutdown.schedule()
  }

  /**
   * Ask the worker to checkpoint + close its DB connection before we terminate
   * the thread, so the shared database.db is never left mid-write (the confirmed
   * corruption trigger). The request is queued behind any in-flight write in the
   * worker. Always resolves within GRACEFUL_CLOSE_TIMEOUT_MS — a slow or already
   * dead worker just falls through to the hard terminate() that follows. Uses a
   * dedicated listener so it never disturbs the pending-task map.
   */
  private requestWorkerGracefulClose(
    worker: Worker,
    timeoutMs = GRACEFUL_CLOSE_TIMEOUT_MS
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const taskId = this.generateTaskId('shutdown')
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        worker.off('message', onMessage)
        resolve()
      }
      const onMessage = (message: unknown): void => {
        if (
          message &&
          typeof message === 'object' &&
          (message as { taskId?: unknown }).taskId === taskId
        ) {
          finish()
        }
      }
      const timer = setTimeout(finish, timeoutMs)
      timer.unref?.()
      worker.on('message', onMessage)
      try {
        worker.postMessage({ type: 'shutdown', taskId })
      } catch {
        finish()
      }
    })
  }

  private beginWorkerTermination(options: {
    keepInitState: boolean
    graceful?: boolean
    gracefulTimeoutMs?: number
  }): Promise<void> {
    this.idleShutdown.cancel()
    if (!options.keepInitState) this.dbPath = null
    if (this.terminationFailure) return Promise.reject(this.terminationFailure)
    if (this.terminationBarrier) return this.terminationBarrier

    if (this.useKernelProcess) {
      const wasActive = this.kernelWriterActive
      this.initAttemptSeq += 1
      this.kernelInitInFlight = false
      this.kernelWriterActive = false
      this.workerStartedAt = null
      this.lastMetricsSample = null
      this.initPromise = null
      this.kernelInitGeneration = 0

      if (!wasActive || !this.kernelClient || this.kernelClient.getState() !== 'ready') {
        return Promise.resolve()
      }

      const graceful = options.graceful === true
      const gracefulTimeoutMs = options.gracefulTimeoutMs ?? GRACEFUL_CLOSE_TIMEOUT_MS
      const kernelClient = this.kernelClient
      const termId = ++this.terminationSeq
      // Close ONLY the writer worker inside the kernel process — never shut down the shared
      // kernel process itself because reader lanes share the same utilityProcess.
      // Mirror the direct worker_threads contract: do NOT bound the underlying confirmation
      // promise with the short caller deadline (`this.terminationTimeoutMs`), so a slow close
      // keeps writes fail-closed (`pending`) until confirmed and recovers cleanly once exited
      // instead of permanently latching `terminationFailure`.
      const termination = (async (): Promise<void> => {
        for (let attempt = 0; ; attempt += 1) {
          if (kernelClient.getState() !== 'ready') return
          try {
            await kernelClient.invokeTask(
              SEARCH_KERNEL_TASKS.WRITER_CLOSE,
              { graceful: attempt === 0 ? graceful : false, timeoutMs: gracefulTimeoutMs },
              { timeoutMs: KERNEL_DEFAULT_WRITER_TASK_TIMEOUT_MS }
            )
            return
          } catch (error) {
            if (error instanceof SearchKernelClientError) {
              if (
                error.code === SEARCH_KERNEL_ERROR_CODES.EXITED ||
                error.code === SEARCH_KERNEL_ERROR_CODES.SHUTTING_DOWN ||
                error.code === SEARCH_KERNEL_ERROR_CODES.NOT_READY ||
                error.code === SEARCH_KERNEL_ERROR_CODES.DEGRADED
              ) {
                return
              }
              if (error.code === SEARCH_KERNEL_ERROR_CODES.TIMEOUT) {
                // Re-query the kernel's in-flight close promise rather than latching failure.
                continue
              }
            }
            throw error
          }
        }
      })()
      this.retiringForIdle = Boolean(
        options.keepInitState && options.graceful && !this.shuttingDown
      )
      this.terminationBarrier = termination
      void termination.then(
        () => {
          if (this.terminationSeq !== termId) return
          this.terminationBarrier = null
          this.retiringForIdle = false
          this.resolveDrainWaitersIfIdle()
        },
        () => {
          if (this.terminationSeq !== termId) return
          this.retiringForIdle = false
          this.terminationFailure = new SearchIndexWorkerTerminationUnconfirmedError('rejected')
          this.resolveDrainWaitersIfIdle()
        }
      )
      return termination
    }

    const worker = this.worker
    this.worker = null
    this.workerStartedAt = null
    this.lastMetricsSample = null
    this.initPromise = null
    if (!worker) return Promise.resolve()

    // Detaching this.worker/initPromise above is synchronous, so a write arriving
    // during a graceful close waits for retirement to finish, then spins a FRESH
    // worker instead of failing with SEARCH_INDEX_WORKER_TERMINATION_UNCONFIRMED.
    const termination = Promise.resolve()
      .then(() => (options.graceful ? this.requestWorkerGracefulClose(worker) : undefined))
      .then(() => worker.terminate())
      .then(() => undefined)
    this.retiringForIdle = Boolean(options.keepInitState && options.graceful && !this.shuttingDown)
    this.terminationBarrier = termination
    void termination.then(
      () => {
        if (this.terminationBarrier !== termination) return
        this.terminationBarrier = null
        this.retiringForIdle = false
        this.resolveDrainWaitersIfIdle()
      },
      () => {
        if (this.terminationBarrier !== termination) return
        this.retiringForIdle = false
        this.terminationFailure = new SearchIndexWorkerTerminationUnconfirmedError('rejected')
        this.resolveDrainWaitersIfIdle()
      }
    )
    return termination
  }
}
