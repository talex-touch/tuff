import { AsyncLocalStorage } from 'node:async_hooks'
import { performance } from 'node:perf_hooks'
import type { CoreBoxSearchIndexCommitPayload } from '@talex-touch/utils/transport/events/types'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../db/schema'
import type {
  SearchIndexItem,
  SearchIndexProviderReplacementSummary,
  SearchIndexReadinessGate
} from './search-index-service'
import type { WorkerStatusSnapshot } from '../addon/files/workers/worker-status'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import { scheduleDbWrite } from '../../../db/db-write'
import { createLogger } from '../../../utils/logger'
import { searchIndexCommitHub, type SearchIndexCommitHub } from './search-index-commit-hub'
import { SearchIndexService } from './search-index-service'
import type {
  ExpectedFileRecord,
  ExpectedMissingFileSearchRecord,
  FileRecordRemovalOptions,
  RemoveFileRecordsResult,
  RemoveMissingFileSearchRecordsResult,
  ListPendingFileDeletionCommitsResult,
  AcknowledgeFileDeletionCommitsResult,
  FileMetadataUpdateRecord,
  FileMetadataUpdateSummary,
  FilePersistenceEntry,
  PersistEntriesSummary,
  UpsertFileRecord
} from './file-index-persistence-repository'
import {
  removeFileRecordsInTransaction,
  removeMissingFileSearchRecordsInTransaction,
  listPendingFileDeletionCommitsInHome,
  acknowledgeFileDeletionCommitsInHome
} from './file-index-persistence-repository'
import { isIndexMaintenanceIdle } from './search-activity'
import {
  IndexMaintenanceDeferredError,
  indexMaintenanceContext,
  type IndexMaintenanceNotification,
  type IndexMaintenanceSlice
} from './index-maintenance-context'
import type {
  ExecWriteResult,
  PersistAndApplyProviderItemsMetrics,
  VacuumResult
} from './workers/search-index-worker-types'
import { SearchIndexWorkerClient } from './workers/search-index-worker-client'

export type {
  ExpectedFileRecord,
  ExpectedMissingFileSearchRecord,
  FileDeletionCommitReceipt,
  FileRecordRemovalOptions,
  RemoveFileRecordsResult,
  RemoveMissingFileSearchRecordsResult,
  ListPendingFileDeletionCommitsResult,
  AcknowledgeFileDeletionCommitsResult,
  FileMetadataUpdateRecord,
  FileMetadataUpdateSummary,
  FilePersistenceEntry,
  PersistEntriesSummary,
  UpsertFileRecord
} from './file-index-persistence-repository'
export { FILE_INDEX_DELETE_MAX_BATCH } from './file-index-persistence-repository'

const searchIndexWriterLog = createLogger('SearchIndex').child('Writer')
/** Set for the duration of a `withPausedAdmission` operation, so its own writes bypass the gate. */
const pausedAdmissionScope = new AsyncLocalStorage<true>()
const VISIBILITY_RETRY_DELAYS_MS = [100, 500, 2_000] as const

export type SearchIndexAdmissionPriority = 'normal' | 'background'

interface QueuedAdmission {
  priority: SearchIndexAdmissionPriority
  resolve: () => void
  reject: (error: Error) => void
  signal?: AbortSignal
  abort?: () => void
}

interface AdmissionIdleWaiter {
  includeQueued: boolean
  resolve: () => void
}

const MAX_ACTIVE_ADMISSIONS = 1
const MAX_QUEUED_ADMISSIONS = 2
const MAX_BACKGROUND_QUEUED_ADMISSIONS = 1

export type SearchIndexWriterMode = 'runtime' | 'legacy'
export type SearchIndexMutationKind = 'index' | 'replace' | 'remove' | 'clear' | 'cleanup'
export type SearchIndexWriterReadiness =
  | { state: 'pending' }
  | { state: 'ready' }
  | { state: 'failed'; error: Error }
  | { state: 'closed' }

export interface SearchIndexVisibilityRequest {
  sourceId: string
  kind: SearchIndexMutationKind
  itemIds: readonly string[]
}

export interface SearchIndexVisibilityBarrier {
  waitUntilReadable(request: SearchIndexVisibilityRequest): Promise<void>
}

export interface SearchIndexWriterCommit {
  sourceId: string
  kind: SearchIndexMutationKind
  writer: SearchIndexWriterMode
  affectedItems: number
  committed: boolean
  revision: number
  generation: number
  committedAt: number | null
}

export interface SearchIndexPersistAndIndexResult {
  persistedCount: number
  commit: SearchIndexWriterCommit
  metrics?: PersistAndApplyProviderItemsMetrics
}

export interface SearchIndexPersistAndApplyResult {
  persistedCount: number
  affectedItems: number
  metrics?: PersistAndApplyProviderItemsMetrics
}

export type SearchIndexReplacementSummary = SearchIndexProviderReplacementSummary

export interface SearchIndexWriterStatus {
  readiness: SearchIndexWriterReadiness['state']
  admissionPaused: boolean
  activeAdmissions: number
  pending: number
  /** Requests admitted by the Writer but not yet submitted to the Worker. */
  waitingAdmissions?: number
  /** Producers waiting outside the bounded admission queue for a shared capacity pulse. */
  capacityWaiters?: number
}

export interface SearchIndexPhysicalWriter {
  readonly mode: SearchIndexWriterMode
  indexItems(
    sourceId: string,
    items: SearchIndexItem[],
    legacyItemIds?: readonly string[]
  ): Promise<number>
  persistAndApplyProviderItems?(
    records: UpsertFileRecord[],
    sourceId: string,
    items: SearchIndexItem[],
    legacyItemIds?: readonly string[]
  ): Promise<SearchIndexPersistAndApplyResult>

  beginSourceReplacement(sourceId: string, replacementId: string): Promise<void>
  stageSourceReplacement(
    sourceId: string,
    replacementId: string,
    items: SearchIndexItem[]
  ): Promise<number>
  commitSourceReplacement(
    sourceId: string,
    replacementId: string
  ): Promise<SearchIndexReplacementSummary>
  abortSourceReplacement(sourceId: string, replacementId: string): Promise<void>
  removeProviderItems(sourceId: string, itemIds: readonly string[]): Promise<number>
  clearSource(sourceId: string): Promise<number>
  cleanupSource(sourceId: string): Promise<number>
  /**
   * Reclaim pages freed by a bulk cleanup. Resolves `null` where no safe compaction exists:
   * the legacy writer shares the main thread, and a `VACUUM` there would freeze the UI.
   */
  compact?(reason: string): Promise<VacuumResult | null>
  countSource(sourceId: string): Promise<number>
  runIndexMaintenanceSlice?(
    sourceId: string,
    limit?: number,
    signal?: AbortSignal
  ): Promise<IndexMaintenanceSlice>
  acknowledgeIndexMaintenanceCommit?(
    notification: IndexMaintenanceNotification,
    signal?: AbortSignal
  ): Promise<void>
  drain(timeoutMs?: number): Promise<void>
  withPausedAdmission?<T>(
    reason: string,
    operation: (status: SearchIndexWriterStatus) => Promise<T>,
    timeoutMs?: number
  ): Promise<T>
}

export interface SearchIndexMutationWriter {
  indexItems(
    sourceId: string,
    items: SearchIndexItem[],
    options?: { legacyItemIds?: readonly string[] }
  ): Promise<SearchIndexWriterCommit>
  persistAndIndexFiles?(
    sourceId: string,
    records: UpsertFileRecord[],
    items: SearchIndexItem[],
    options?: { legacyItemIds?: readonly string[] }
  ): Promise<SearchIndexPersistAndIndexResult>
  beginSourceReplacement(sourceId: string, replacementId: string): Promise<void>
  stageSourceReplacement(
    sourceId: string,
    replacementId: string,
    items: SearchIndexItem[]
  ): Promise<number>
  commitSourceReplacement(
    sourceId: string,
    replacementId: string
  ): Promise<SearchIndexReplacementSummary>
  abortSourceReplacement(sourceId: string, replacementId: string): Promise<void>
  removeProviderItems(
    sourceId: string,
    itemIds: readonly string[]
  ): Promise<SearchIndexWriterCommit>
  clearSource(sourceId: string): Promise<SearchIndexWriterCommit>
  cleanupSource(sourceId: string): Promise<SearchIndexWriterCommit>
  countSource(sourceId: string): Promise<number>
  publishExternalCommit(
    sourceId: string,
    kind: SearchIndexMutationKind,
    affectedItems: number,
    itemIds?: readonly string[]
  ): Promise<SearchIndexWriterCommit>
}

export interface SearchIndexWriterOptions {
  client?: SearchIndexWorkerClient
}

export interface FilePersistencePort {
  waitUntilReady(): Promise<void>
  persistEntries(
    entries: FilePersistenceEntry[],
    priority?: SearchIndexAdmissionPriority
  ): Promise<PersistEntriesSummary>
  upsertFiles(
    records: UpsertFileRecord[],
    priority?: SearchIndexAdmissionPriority
  ): Promise<Array<Record<string, unknown>>>
  updateFileMetadata(records: FileMetadataUpdateRecord[]): Promise<FileMetadataUpdateSummary>
  upsertScanProgress(paths: string[], lastScanned: string, sourceId?: string): Promise<number>
  removeFileRecords(
    sourceId: string,
    records: readonly ExpectedFileRecord[],
    options?: FileRecordRemovalOptions
  ): Promise<RemoveFileRecordsResult>
  removeMissingFileSearchRecords(
    sourceId: string,
    records: readonly ExpectedMissingFileSearchRecord[],
    options?: FileRecordRemovalOptions
  ): Promise<RemoveMissingFileSearchRecordsResult>
  listPendingFileDeletionCommits(
    sourceId: string,
    limit?: number,
    options?: FileRecordRemovalOptions
  ): Promise<ListPendingFileDeletionCommitsResult>
  acknowledgeFileDeletionCommits(
    sourceId: string,
    commitIds: readonly string[],
    options?: FileRecordRemovalOptions
  ): Promise<AcknowledgeFileDeletionCommitsResult>
  removeFileExtensions(fileId: number, keys: string[]): Promise<void>
  getStatus(): Promise<WorkerStatusSnapshot>
  hasPendingWork(): boolean
  drain(timeoutMs?: number): Promise<void>
}

async function schedulePrimaryFileRemoval<T extends { deferred: boolean }>(
  label: string,
  options: FileRecordRemovalOptions,
  operation: () => Promise<T>,
  deferredResult: T
): Promise<T> {
  let started = false
  const scheduled = scheduleDbWrite(
    label,
    async () => {
      options.signal?.throwIfAborted()
      if (
        options.isStillCurrent?.() === false ||
        (options.maintenance && !isIndexMaintenanceIdle())
      ) {
        return deferredResult
      }
      started = true
      return await operation()
    },
    { priority: options.maintenance ? 'background' : 'interactive' }
  )
  const { signal } = options
  if (!signal) return await scheduled
  return await new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      // Once started, retain the real transaction outcome through result delivery.
      if (started) return
      signal.removeEventListener('abort', abort)
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    void scheduled.then(
      (result) => {
        signal.removeEventListener('abort', abort)
        resolve(result)
      },
      (error) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      }
    )
    if (signal.aborted) abort()
  })
}

/** The shared-file topology writes through its primary scheduler, never a worker connection. */
export async function removeFileRecordsInPrimaryHome(
  db: LibSQLDatabase<typeof schema>,
  service: SearchIndexService,
  sourceId: string,
  records: readonly ExpectedFileRecord[],
  options: FileRecordRemovalOptions = {}
): Promise<RemoveFileRecordsResult> {
  options.signal?.throwIfAborted()
  if (records.length === 0)
    return { deletedRecords: [], removedIndexedItems: 0, commitId: null, deferred: false }
  if (options.isStillCurrent?.() === false || (options.maintenance && !isIndexMaintenanceIdle())) {
    return { deletedRecords: [], removedIndexedItems: 0, commitId: null, deferred: true }
  }
  await service.warmup()
  return await schedulePrimaryFileRemoval(
    'file-index.remove-file-records',
    options,
    async () =>
      await db.transaction(
        async (tx) => await removeFileRecordsInTransaction(tx, service, sourceId, records),
        { behavior: 'immediate' }
      ),
    { deletedRecords: [], removedIndexedItems: 0, commitId: null, deferred: true }
  )
}

export async function removeMissingFileSearchRecordsInPrimaryHome(
  db: LibSQLDatabase<typeof schema>,
  service: SearchIndexService,
  sourceId: string,
  records: readonly ExpectedMissingFileSearchRecord[],
  options: FileRecordRemovalOptions = {}
): Promise<RemoveMissingFileSearchRecordsResult> {
  options.signal?.throwIfAborted()
  if (records.length === 0)
    return { deletedRecords: [], removedIndexedItems: 0, commitId: null, deferred: false }
  if (options.isStillCurrent?.() === false || (options.maintenance && !isIndexMaintenanceIdle())) {
    return { deletedRecords: [], removedIndexedItems: 0, commitId: null, deferred: true }
  }
  await service.warmup()
  return await schedulePrimaryFileRemoval(
    'file-index.remove-missing-search-records',
    options,
    async () =>
      await db.transaction(
        async (tx) =>
          await removeMissingFileSearchRecordsInTransaction(tx, service, sourceId, records),
        { behavior: 'immediate' }
      ),
    { deletedRecords: [], removedIndexedItems: 0, commitId: null, deferred: true }
  )
}

export async function listPendingFileDeletionCommitsInPrimaryHome(
  db: LibSQLDatabase<typeof schema>,
  sourceId: string,
  limit = 64,
  options: FileRecordRemovalOptions = {}
): Promise<ListPendingFileDeletionCommitsResult> {
  options.signal?.throwIfAborted()
  if (options.isStillCurrent?.() === false || (options.maintenance && !isIndexMaintenanceIdle())) {
    return { commits: [], deferred: true }
  }
  return await schedulePrimaryFileRemoval(
    'file-index.pending-deletions.list',
    options,
    async () => await listPendingFileDeletionCommitsInHome(db, sourceId, limit),
    { commits: [], deferred: true }
  )
}

export async function acknowledgeFileDeletionCommitsInPrimaryHome(
  db: LibSQLDatabase<typeof schema>,
  sourceId: string,
  commitIds: readonly string[],
  options: FileRecordRemovalOptions = {}
): Promise<AcknowledgeFileDeletionCommitsResult> {
  options.signal?.throwIfAborted()
  if (options.isStillCurrent?.() === false || (options.maintenance && !isIndexMaintenanceIdle())) {
    return { acknowledged: 0, deferred: true }
  }
  return await schedulePrimaryFileRemoval(
    'file-index.pending-deletions.acknowledge',
    options,
    async () => await acknowledgeFileDeletionCommitsInHome(db, sourceId, commitIds),
    { acknowledged: 0, deferred: true }
  )
}

export class SearchIndexWriter implements SearchIndexPhysicalWriter, SearchIndexReadinessGate {
  readonly mode = 'runtime' as const

  private readonly client: SearchIndexWorkerClient
  private readiness: SearchIndexWriterReadiness = { state: 'pending' }
  private initializationPromise: Promise<void> | null = null
  private closed = false
  private shutdownComplete = false
  private shutdownPromise: Promise<void> | null = null
  private admissionGate: Promise<void> | null = null
  private resumeAdmission: (() => void) | null = null
  private pauseQueue: Promise<void> = Promise.resolve()
  private activeAdmissions = 0
  private backgroundQueuedAdmissions = 0
  private capacityWaiters = 0
  private readonly admissionQueue: QueuedAdmission[] = []
  private capacityPulse: Promise<void> | null = null
  private resolveCapacityPulse: (() => void) | null = null
  private readonly admissionIdleWaiters = new Set<AdmissionIdleWaiter>()

  private readonly filePersistencePort: FilePersistencePort
  constructor(options: SearchIndexWriterOptions = {}) {
    this.client = options.client ?? new SearchIndexWorkerClient()
    this.filePersistencePort = {
      waitUntilReady: async () => await this.waitUntilReady(),
      persistEntries: async (entries, priority = 'background') =>
        await this.withAdmission(async () => await this.client.persistEntries(entries), priority),
      upsertFiles: async (records, priority = 'normal') =>
        await this.withAdmission(async () => await this.client.upsertFiles(records), priority),
      updateFileMetadata: async (records) =>
        await this.withAdmission(async () => await this.client.updateFileMetadata(records)),
      upsertScanProgress: async (paths, lastScanned, sourceId) =>
        await this.withAdmission(
          async () => await this.client.upsertScanProgress(paths, lastScanned, sourceId)
        ),
      removeFileRecords: async (sourceId, records, options) =>
        await this.removeFileRecords(sourceId, records, options),
      removeMissingFileSearchRecords: async (sourceId, records, options) =>
        await this.removeMissingFileSearchRecords(sourceId, records, options),
      listPendingFileDeletionCommits: async (sourceId, limit, options) =>
        await this.listPendingFileDeletionCommits(sourceId, limit, options),
      acknowledgeFileDeletionCommits: async (sourceId, commitIds, options) =>
        await this.acknowledgeFileDeletionCommits(sourceId, commitIds, options),
      removeFileExtensions: async (fileId, keys) =>
        await this.withAdmission(async () => await this.client.removeFileExtensions(fileId, keys)),
      getStatus: async () => await this.client.getStatus(),
      hasPendingWork: () =>
        this.activeAdmissions > 0 ||
        this.admissionQueue.length > 0 ||
        this.capacityWaiters > 0 ||
        this.client.hasPendingWork(),
      drain: async (timeoutMs) => await this.drain(timeoutMs)
    }
  }

  getFilePersistencePort(): FilePersistencePort {
    return this.filePersistencePort
  }

  initialize(dbPath: string): Promise<void> {
    if (this.closed) return Promise.reject(new Error('SEARCH_INDEX_WRITER_CLOSED'))
    if (this.initializationPromise) return this.initializationPromise

    this.readiness = { state: 'pending' }
    const initialization = this.client
      .init(dbPath)
      .then(() => {
        this.readiness = { state: 'ready' }
      })
      .catch((error) => {
        const normalized = error instanceof Error ? error : new Error(String(error))
        // Init failure marks the writer 'failed': every subsequent write fails
        // fast in waitUntilReady() with this error until a fresh initialize()
        // retries (the provider-load retry path). Deliberately NO fallback to
        // opening database.db when the split is on — a second writer on the
        // primary file would recreate the dual-writer SQLITE_BUSY topology the
        // search split exists to remove (issue #295).
        this.readiness = { state: 'failed', error: normalized }
        this.initializationPromise = null
        throw normalized
      })
    this.initializationPromise = initialization
    return initialization
  }

  async waitUntilReady(): Promise<void> {
    if (this.readiness.state === 'ready') return
    if (this.readiness.state === 'failed') throw this.readiness.error
    if (this.readiness.state === 'closed') throw new Error('SEARCH_INDEX_WRITER_CLOSED')
    if (!this.initializationPromise) throw new Error('SEARCH_INDEX_WRITER_NOT_INITIALIZED')
    await this.initializationPromise
  }

  getStatus(): SearchIndexWriterStatus {
    return {
      readiness: this.readiness.state,
      admissionPaused: this.admissionGate !== null,
      activeAdmissions: this.activeAdmissions,
      pending: this.client.getPendingCount(),
      waitingAdmissions: this.admissionQueue.length,
      capacityWaiters: this.capacityWaiters
    }
  }

  async indexItems(
    sourceId: string,
    items: SearchIndexItem[],
    legacyItemIds: readonly string[] = []
  ): Promise<number> {
    if (items.length === 0 && legacyItemIds.length === 0) return 0
    return await this.withAdmission(async () => {
      if (indexMaintenanceContext.getStore() === true && !isIndexMaintenanceIdle()) {
        throw new IndexMaintenanceDeferredError()
      }
      const summary = await this.client.applyProviderItems(sourceId, items, legacyItemIds)
      return summary.removedItems + summary.indexedItems
    })
  }
  async persistAndApplyProviderItems(
    records: UpsertFileRecord[],
    sourceId: string,
    items: SearchIndexItem[],
    legacyItemIds: readonly string[] = []
  ): Promise<SearchIndexPersistAndApplyResult> {
    if (records.length === 0 && items.length === 0 && legacyItemIds.length === 0) {
      return { persistedCount: 0, affectedItems: 0 }
    }
    return await this.withAdmission(async () => {
      if (indexMaintenanceContext.getStore() === true && !isIndexMaintenanceIdle()) {
        throw new IndexMaintenanceDeferredError()
      }
      const result = await this.client.persistAndApplyProviderItems(
        records,
        sourceId,
        items,
        legacyItemIds
      )
      return {
        persistedCount: result.persistedCount,
        affectedItems: result.summary.removedItems + result.summary.indexedItems,
        metrics: result.metrics
      }
    }, 'background')
  }

  async beginSourceReplacement(sourceId: string, replacementId: string): Promise<void> {
    await this.withAdmission(
      async () => await this.client.beginProviderReplacement(sourceId, replacementId)
    )
  }

  async stageSourceReplacement(
    sourceId: string,
    replacementId: string,
    items: SearchIndexItem[]
  ): Promise<number> {
    return await this.withAdmission(
      async () => await this.client.stageProviderReplacementItems(sourceId, replacementId, items)
    )
  }

  async commitSourceReplacement(
    sourceId: string,
    replacementId: string
  ): Promise<SearchIndexReplacementSummary> {
    return await this.withAdmission(
      async () => await this.client.commitProviderReplacement(sourceId, replacementId)
    )
  }

  async abortSourceReplacement(sourceId: string, replacementId: string): Promise<void> {
    await this.withAdmission(
      async () => await this.client.abortProviderReplacement(sourceId, replacementId)
    )
  }

  async removeProviderItems(sourceId: string, itemIds: readonly string[]): Promise<number> {
    if (itemIds.length === 0) return 0
    return await this.withAdmission(
      async () => await this.client.removeProviderItems(sourceId, [...itemIds])
    )
  }
  async removeFileRecords(
    sourceId: string,
    records: readonly ExpectedFileRecord[],
    options: FileRecordRemovalOptions = {}
  ): Promise<RemoveFileRecordsResult> {
    options.signal?.throwIfAborted()
    if (records.length === 0)
      return { deletedRecords: [], removedIndexedItems: 0, commitId: null, deferred: false }
    if (
      options.isStillCurrent?.() === false ||
      (options.maintenance && !isIndexMaintenanceIdle())
    ) {
      return { deletedRecords: [], removedIndexedItems: 0, commitId: null, deferred: true }
    }
    return await this.withAdmission(
      async () => {
        options.signal?.throwIfAborted()
        if (
          options.isStillCurrent?.() === false ||
          (options.maintenance && !isIndexMaintenanceIdle())
        ) {
          return { deletedRecords: [], removedIndexedItems: 0, commitId: null, deferred: true }
        }
        return await this.client.removeFileRecords(sourceId, records, options)
      },
      options.maintenance ? 'background' : 'normal',
      options.signal
    )
  }

  async removeMissingFileSearchRecords(
    sourceId: string,
    records: readonly ExpectedMissingFileSearchRecord[],
    options: FileRecordRemovalOptions = {}
  ): Promise<RemoveMissingFileSearchRecordsResult> {
    options.signal?.throwIfAborted()
    if (records.length === 0)
      return { deletedRecords: [], removedIndexedItems: 0, commitId: null, deferred: false }
    if (
      options.isStillCurrent?.() === false ||
      (options.maintenance && !isIndexMaintenanceIdle())
    ) {
      return { deletedRecords: [], removedIndexedItems: 0, commitId: null, deferred: true }
    }
    return await this.withAdmission(
      async () => {
        options.signal?.throwIfAborted()
        if (
          options.isStillCurrent?.() === false ||
          (options.maintenance && !isIndexMaintenanceIdle())
        ) {
          return { deletedRecords: [], removedIndexedItems: 0, commitId: null, deferred: true }
        }
        return await this.client.removeMissingFileSearchRecords(sourceId, records, options)
      },
      options.maintenance ? 'background' : 'normal',
      options.signal
    )
  }

  async listPendingFileDeletionCommits(
    sourceId: string,
    limit = 64,
    options: FileRecordRemovalOptions = {}
  ): Promise<ListPendingFileDeletionCommitsResult> {
    options.signal?.throwIfAborted()
    if (
      options.isStillCurrent?.() === false ||
      (options.maintenance && !isIndexMaintenanceIdle())
    ) {
      return { commits: [], deferred: true }
    }
    return await this.withAdmission(
      async () => {
        options.signal?.throwIfAborted()
        if (
          options.isStillCurrent?.() === false ||
          (options.maintenance && !isIndexMaintenanceIdle())
        ) {
          return { commits: [], deferred: true }
        }
        return await this.client.listPendingFileDeletionCommits(sourceId, limit, options)
      },
      options.maintenance ? 'background' : 'normal',
      options.signal
    )
  }

  async acknowledgeFileDeletionCommits(
    sourceId: string,
    commitIds: readonly string[],
    options: FileRecordRemovalOptions = {}
  ): Promise<AcknowledgeFileDeletionCommitsResult> {
    options.signal?.throwIfAborted()
    if (
      options.isStillCurrent?.() === false ||
      (options.maintenance && !isIndexMaintenanceIdle())
    ) {
      return { acknowledged: 0, deferred: true }
    }
    return await this.withAdmission(
      async () => {
        options.signal?.throwIfAborted()
        if (
          options.isStillCurrent?.() === false ||
          (options.maintenance && !isIndexMaintenanceIdle())
        ) {
          return { acknowledged: 0, deferred: true }
        }
        return await this.client.acknowledgeFileDeletionCommits(sourceId, commitIds, options)
      },
      options.maintenance ? 'background' : 'normal',
      options.signal
    )
  }

  async clearSource(sourceId: string): Promise<number> {
    return await this.withAdmission(async () => await this.client.removeByProvider(sourceId))
  }

  async cleanupSource(sourceId: string): Promise<number> {
    return await this.withAdmission(async () => {
      if (!isIndexMaintenanceIdle()) return 0
      return await this.client.cleanupOrphanKeywords(sourceId)
    }, 'background')
  }

  /**
   * Background admission: index writes queue behind the `VACUUM` for its duration, searches
   * keep reading the WAL snapshot. Skipped while index maintenance is busy, like cleanup.
   */
  async compact(reason: string): Promise<VacuumResult | null> {
    return await this.withAdmission(async () => {
      if (!isIndexMaintenanceIdle()) return null
      return await this.client.vacuum(reason)
    }, 'background')
  }

  async runIndexMaintenanceSlice(
    sourceId: string,
    limit = 64,
    signal?: AbortSignal
  ): Promise<IndexMaintenanceSlice> {
    signal?.throwIfAborted()
    if (!isIndexMaintenanceIdle())
      return { processed: 0, done: false, deferred: true, notifications: [] }
    return await this.withAdmission(
      async () => {
        signal?.throwIfAborted()
        if (!isIndexMaintenanceIdle())
          return { processed: 0, done: false, deferred: true, notifications: [] }
        return await this.client.runIndexMaintenanceSlice(sourceId, limit, signal)
      },
      'background',
      signal
    )
  }

  async acknowledgeIndexMaintenanceCommit(
    notification: IndexMaintenanceNotification,
    signal?: AbortSignal
  ): Promise<void> {
    await this.withAdmission(
      async () => {
        signal?.throwIfAborted()
        await this.client.acknowledgeIndexMaintenanceCommit(notification)
      },
      'normal',
      signal
    )
  }

  async countSource(sourceId: string): Promise<number> {
    return await this.withAdmission(async () => await this.client.countByProvider(sourceId))
  }

  /**
   * Route raw prepared statements to the worker's connection (the sole writer of
   * its DB file) through the admission gate. Used by the split-aware dbUtils to
   * forward main-thread file-index writes when DB_SEARCH_SPLIT is enabled.
   */
  async execWrite(
    statements: Array<{ sql: string; args: unknown[] }>,
    mode: 'single' | 'transaction' = 'single'
  ): Promise<ExecWriteResult[]> {
    if (statements.length === 0) return []
    return await this.withAdmission(async () => await this.client.execWrite(statements, mode))
  }

  async drain(timeoutMs = 5_000): Promise<void> {
    await this.waitForAdmissionsToIdle(timeoutMs, true)
    await this.client.drain(timeoutMs)
  }

  async withPausedAdmission<T>(
    _reason: string,
    operation: (status: SearchIndexWriterStatus) => Promise<T>,
    timeoutMs = 5_000
  ): Promise<T> {
    let releasePauseQueue!: () => void
    const previousPause = this.pauseQueue
    this.pauseQueue = new Promise<void>((resolve) => {
      releasePauseQueue = resolve
    })
    await previousPause

    this.admissionGate = new Promise<void>((resolve) => {
      this.resumeAdmission = resolve
    })
    try {
      await this.waitForAdmissionsToIdle(timeoutMs, false)
      await this.client.drain(timeoutMs)
      // The pause exists so that `operation` can mutate the index alone. Its own writes run in
      // this async scope, which `withAdmission` recognises and lets through; every other
      // context still waits at the gate. Without the scope the manual rebuild deadlocked: the
      // reset it runs clears scan_progress through this very writer, and that write sat behind
      // the gate its own caller was holding, so the rebuild never finished and the reset task
      // gate stayed running for the rest of the session.
      return await pausedAdmissionScope.run(true, async () => await operation(this.getStatus()))
    } finally {
      const resume = this.resumeAdmission
      this.admissionGate = null
      this.resumeAdmission = null
      this.dispatchNextAdmission()
      resume?.()
      this.pulseCapacity()
      releasePauseQueue()
    }
  }

  beginShutdown(): Promise<void> {
    if (this.shutdownComplete) return Promise.resolve()
    if (this.shutdownPromise) return this.shutdownPromise

    this.closed = true
    const resume = this.resumeAdmission
    this.admissionGate = null
    this.resumeAdmission = null
    resume?.()
    this.rejectQueuedAdmissions(new Error('SEARCH_INDEX_WRITER_CLOSED'))
    this.pulseCapacity()

    const shutdown = this.client
      .shutdown()
      .then(() => {
        this.readiness = { state: 'closed' }
        this.shutdownComplete = true
      })
      .catch((error) => {
        if (this.shutdownPromise === shutdown) this.shutdownPromise = null
        throw error
      })
    this.shutdownPromise = shutdown
    return shutdown
  }

  shutdown(): Promise<void> {
    return this.beginShutdown()
  }

  private async withAdmission<T>(
    operation: () => Promise<T>,
    priority: SearchIndexAdmissionPriority = 'normal',
    signal?: AbortSignal
  ): Promise<T> {
    if (this.closed) throw new Error('SEARCH_INDEX_WRITER_CLOSED')
    const ownsPausedAdmission = pausedAdmissionScope.getStore() === true
    await this.acquireAdmission(priority, ownsPausedAdmission, signal)

    try {
      await this.waitForAdmissionPulse(this.waitUntilReady(), signal)
      signal?.throwIfAborted()
      return await operation()
    } finally {
      this.releaseAdmission()
    }
  }

  private async acquireAdmission(
    priority: SearchIndexAdmissionPriority,
    bypassQueue: boolean,
    signal?: AbortSignal
  ): Promise<void> {
    while (true) {
      signal?.throwIfAborted()
      if (this.closed) throw new Error('SEARCH_INDEX_WRITER_CLOSED')
      if (!bypassQueue && this.admissionGate) {
        await this.waitForAdmissionPulse(this.admissionGate, signal)
        continue
      }

      if (
        this.activeAdmissions < MAX_ACTIVE_ADMISSIONS &&
        (bypassQueue || this.admissionQueue.length === 0)
      ) {
        this.activeAdmissions += 1
        return
      }

      if (this.canQueueAdmission(priority)) {
        await new Promise<void>((resolve, reject) => {
          const admission: QueuedAdmission = { priority, resolve, reject, signal }
          if (signal) {
            admission.abort = () => {
              const index = this.admissionQueue.indexOf(admission)
              if (index < 0) return
              this.admissionQueue.splice(index, 1)
              signal.removeEventListener('abort', admission.abort!)
              if (priority === 'background') this.backgroundQueuedAdmissions -= 1
              reject(signal.reason)
              this.dispatchNextAdmission()
              this.pulseCapacity()
              this.notifyAdmissionIdleWaiters()
            }
          }
          this.admissionQueue.push(admission)
          if (priority === 'background') this.backgroundQueuedAdmissions += 1
          this.notifyAdmissionIdleWaiters()
          if (admission.abort) {
            signal!.addEventListener('abort', admission.abort, { once: true })
            if (signal!.aborted) admission.abort()
          }
        })
        return
      }

      this.capacityWaiters += 1
      try {
        await this.waitForAdmissionPulse(this.getCapacityPulse(), signal)
      } finally {
        this.capacityWaiters -= 1
        this.notifyAdmissionIdleWaiters()
      }
    }
  }

  private async waitForAdmissionPulse(pulse: Promise<void>, signal?: AbortSignal): Promise<void> {
    if (!signal) return await pulse
    await new Promise<void>((resolve, reject) => {
      const abort = (): void => {
        signal.removeEventListener('abort', abort)
        reject(signal.reason)
      }
      signal.addEventListener('abort', abort, { once: true })
      void pulse.then(
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

  private canQueueAdmission(priority: SearchIndexAdmissionPriority): boolean {
    if (this.admissionQueue.length >= MAX_QUEUED_ADMISSIONS) return false
    if (
      priority === 'background' &&
      this.backgroundQueuedAdmissions >= MAX_BACKGROUND_QUEUED_ADMISSIONS
    ) {
      return false
    }
    return true
  }

  private releaseAdmission(): void {
    this.activeAdmissions = Math.max(0, this.activeAdmissions - 1)
    this.dispatchNextAdmission()
    this.pulseCapacity()
    this.notifyAdmissionIdleWaiters()
  }

  private dispatchNextAdmission(): void {
    if (this.closed || this.admissionGate || this.activeAdmissions >= MAX_ACTIVE_ADMISSIONS) return
    const normalIndex = this.admissionQueue.findIndex((entry) => entry.priority === 'normal')
    const index = normalIndex >= 0 ? normalIndex : 0
    const [next] = this.admissionQueue.splice(index, 1)
    if (!next) return
    if (next.abort) next.signal?.removeEventListener('abort', next.abort)
    if (next.priority === 'background') this.backgroundQueuedAdmissions -= 1
    this.activeAdmissions += 1
    next.resolve()
  }

  private rejectQueuedAdmissions(error: Error): void {
    const queued = this.admissionQueue.splice(0)
    this.backgroundQueuedAdmissions = 0
    for (const admission of queued) {
      if (admission.abort) admission.signal?.removeEventListener('abort', admission.abort)
      admission.reject(error)
    }
    this.notifyAdmissionIdleWaiters()
  }

  private getCapacityPulse(): Promise<void> {
    if (this.capacityPulse) return this.capacityPulse
    this.capacityPulse = new Promise<void>((resolve) => {
      this.resolveCapacityPulse = resolve
    })
    return this.capacityPulse
  }

  private pulseCapacity(): void {
    const resolve = this.resolveCapacityPulse
    this.capacityPulse = null
    this.resolveCapacityPulse = null
    resolve?.()
  }

  private async waitForAdmissionsToIdle(timeoutMs: number, includeQueued: boolean): Promise<void> {
    if (this.isAdmissionIdle(includeQueued)) return

    await new Promise<void>((resolve, reject) => {
      const waiter: AdmissionIdleWaiter = {
        includeQueued,
        resolve: () => {
          clearTimeout(timeout)
          this.admissionIdleWaiters.delete(waiter)
          resolve()
        }
      }
      const timeout: NodeJS.Timeout = setTimeout(() => {
        this.admissionIdleWaiters.delete(waiter)
        reject(new Error('SEARCH_INDEX_WRITER_ADMISSION_DRAIN_TIMEOUT'))
      }, timeoutMs)
      this.admissionIdleWaiters.add(waiter)
    })
  }

  private isAdmissionIdle(includeQueued: boolean): boolean {
    if (this.activeAdmissions > 0) return false
    return !includeQueued || (this.admissionQueue.length === 0 && this.capacityWaiters === 0)
  }

  private notifyAdmissionIdleWaiters(): void {
    for (const waiter of [...this.admissionIdleWaiters]) {
      if (this.isAdmissionIdle(waiter.includeQueued)) waiter.resolve()
    }
  }
}

export class LegacySearchIndexWriter implements SearchIndexPhysicalWriter {
  readonly mode = 'legacy' as const

  constructor(private readonly service: SearchIndexService) {}

  async indexItems(
    sourceId: string,
    items: SearchIndexItem[],
    legacyItemIds: readonly string[] = []
  ): Promise<number> {
    const summary = await this.service.applyProviderItems(sourceId, items, legacyItemIds)
    return summary.removedItems + summary.indexedItems
  }

  async persistAndApplyProviderItems(
    records: UpsertFileRecord[],
    sourceId: string,
    items: SearchIndexItem[],
    legacyItemIds: readonly string[] = []
  ): Promise<SearchIndexPersistAndApplyResult> {
    const summary = await this.service.persistAndApplyProviderItems(
      records,
      sourceId,
      items,
      legacyItemIds
    )
    return {
      persistedCount: summary.persistedCount,
      affectedItems: summary.removedItems + summary.indexedItems
    }
  }

  async runIndexMaintenanceSlice(
    sourceId: string,
    limit = 64,
    signal?: AbortSignal
  ): Promise<IndexMaintenanceSlice> {
    signal?.throwIfAborted()
    if (!isIndexMaintenanceIdle())
      return { processed: 0, done: false, deferred: true, notifications: [] }
    return await this.service.runIndexMaintenanceSlice(sourceId, limit)
  }

  async acknowledgeIndexMaintenanceCommit(
    notification: IndexMaintenanceNotification,
    signal?: AbortSignal
  ): Promise<void> {
    signal?.throwIfAborted()
    await this.service.acknowledgeIndexMaintenanceCommit(notification)
  }

  async beginSourceReplacement(sourceId: string, replacementId: string): Promise<void> {
    await this.service.beginProviderReplacement(sourceId, replacementId)
  }

  async stageSourceReplacement(
    sourceId: string,
    replacementId: string,
    items: SearchIndexItem[]
  ): Promise<number> {
    return await this.service.stageProviderReplacementItems(sourceId, replacementId, items)
  }

  async commitSourceReplacement(
    sourceId: string,
    replacementId: string
  ): Promise<SearchIndexReplacementSummary> {
    return await this.service.commitProviderReplacement(sourceId, replacementId)
  }

  async abortSourceReplacement(sourceId: string, replacementId: string): Promise<void> {
    await this.service.abortProviderReplacement(sourceId, replacementId)
  }

  async removeProviderItems(sourceId: string, itemIds: readonly string[]): Promise<number> {
    return await this.service.removeProviderItems(sourceId, [...itemIds])
  }

  async clearSource(sourceId: string): Promise<number> {
    return await this.service.removeByProvider(sourceId)
  }

  async cleanupSource(sourceId: string): Promise<number> {
    return await this.service.cleanupOrphanKeywords(sourceId)
  }

  /** The legacy service runs on the main thread; a `VACUUM` here would block the UI for minutes. */
  async compact(): Promise<VacuumResult | null> {
    return null
  }

  async countSource(sourceId: string): Promise<number> {
    return await this.service.countByProvider(sourceId)
  }

  async drain(): Promise<void> {
    await dbWriteScheduler.drain()
  }
}

export interface SourceScopedIndexWriterRouterOptions {
  runtime: SearchIndexPhysicalWriter
  legacy: SearchIndexPhysicalWriter
  visibilityBarrier: SearchIndexVisibilityBarrier
  commitHub?: SearchIndexCommitHub
  defaultMode?: SearchIndexWriterMode
}

export class SourceScopedIndexWriterRouter implements SearchIndexMutationWriter {
  private readonly modes = new Map<string, SearchIndexWriterMode>()
  private readonly commitHub: SearchIndexCommitHub
  private readonly visibilityRetries = new Map<string, Promise<void>>()

  constructor(private readonly options: SourceScopedIndexWriterRouterOptions) {
    this.commitHub = options.commitHub ?? searchIndexCommitHub
  }

  getMode(sourceId: string): SearchIndexWriterMode {
    return this.modes.get(sourceId) ?? this.options.defaultMode ?? 'runtime'
  }

  async publishExternalCommit(
    sourceId: string,
    kind: SearchIndexMutationKind,
    affectedItems: number,
    itemIds: readonly string[] = []
  ): Promise<SearchIndexWriterCommit> {
    const writer = this.resolveWriter(sourceId)
    return await this.publishCommit(sourceId, kind, writer.mode, affectedItems, itemIds)
  }

  setMode(sourceId: string, mode: SearchIndexWriterMode): void {
    this.modes.set(sourceId, mode)
  }

  async indexItems(
    sourceId: string,
    items: SearchIndexItem[],
    options: { legacyItemIds?: readonly string[] } = {}
  ): Promise<SearchIndexWriterCommit> {
    const writer = this.resolveWriter(sourceId)
    const affectedItems = await writer.indexItems(sourceId, items, options.legacyItemIds)
    return await this.publishCommit(sourceId, 'index', writer.mode, affectedItems, [
      ...items.map((item) => item.itemId),
      ...(options.legacyItemIds ?? [])
    ])
  }
  async persistAndIndexFiles(
    sourceId: string,
    records: UpsertFileRecord[],
    items: SearchIndexItem[],
    options: { legacyItemIds?: readonly string[] } = {}
  ): Promise<SearchIndexPersistAndIndexResult> {
    const writer = this.resolveWriter(sourceId)
    if (!writer.persistAndApplyProviderItems) {
      throw new Error(`SEARCH_INDEX_FUSED_FILE_WRITE_UNAVAILABLE:${sourceId}:${writer.mode}`)
    }
    const result = await writer.persistAndApplyProviderItems(
      records,
      sourceId,
      items,
      options.legacyItemIds
    )
    const visibilityStartedAt = performance.now()
    const commit = await this.publishCommit(sourceId, 'index', writer.mode, result.affectedItems, [
      ...items.map((item) => item.itemId),
      ...(options.legacyItemIds ?? [])
    ])
    return {
      persistedCount: result.persistedCount,
      commit,
      metrics: result.metrics
        ? {
            ...result.metrics,
            visibilityDurationMs: performance.now() - visibilityStartedAt
          }
        : undefined
    }
  }

  async beginSourceReplacement(sourceId: string, replacementId: string): Promise<void> {
    await this.resolveWriter(sourceId).beginSourceReplacement(sourceId, replacementId)
  }

  async stageSourceReplacement(
    sourceId: string,
    replacementId: string,
    items: SearchIndexItem[]
  ): Promise<number> {
    return await this.resolveWriter(sourceId).stageSourceReplacement(sourceId, replacementId, items)
  }

  async commitSourceReplacement(
    sourceId: string,
    replacementId: string
  ): Promise<SearchIndexReplacementSummary> {
    const writer = this.resolveWriter(sourceId)
    const summary = await writer.commitSourceReplacement(sourceId, replacementId)
    await this.publishCommit(
      sourceId,
      'replace',
      writer.mode,
      summary.removedItems + summary.indexedItems,
      []
    )
    return summary
  }

  async abortSourceReplacement(sourceId: string, replacementId: string): Promise<void> {
    await this.resolveWriter(sourceId).abortSourceReplacement(sourceId, replacementId)
  }

  async removeProviderItems(
    sourceId: string,
    itemIds: readonly string[]
  ): Promise<SearchIndexWriterCommit> {
    const writer = this.resolveWriter(sourceId)
    const affectedItems = await writer.removeProviderItems(sourceId, itemIds)
    return await this.publishCommit(sourceId, 'remove', writer.mode, affectedItems, itemIds)
  }

  async runIndexMaintenanceSlice(
    sourceId: string,
    limit = 64,
    signal?: AbortSignal
  ): Promise<IndexMaintenanceSlice> {
    const writer = this.resolveWriter(sourceId)
    if (!writer.runIndexMaintenanceSlice)
      throw new Error(`INDEX_MAINTENANCE_WRITER_UNAVAILABLE:${writer.mode}`)
    return await writer.runIndexMaintenanceSlice(sourceId, limit, signal)
  }

  async acknowledgeIndexMaintenanceCommit(
    ownerSourceId: string,
    notification: IndexMaintenanceNotification,
    signal?: AbortSignal
  ): Promise<void> {
    const writer = this.resolveWriter(ownerSourceId)
    if (!writer.acknowledgeIndexMaintenanceCommit)
      throw new Error(`INDEX_MAINTENANCE_ACK_UNAVAILABLE:${writer.mode}`)
    await writer.acknowledgeIndexMaintenanceCommit(notification, signal)
  }

  async clearSource(sourceId: string): Promise<SearchIndexWriterCommit> {
    const writer = this.resolveWriter(sourceId)
    const affectedItems = await writer.clearSource(sourceId)
    return await this.publishCommit(sourceId, 'clear', writer.mode, affectedItems, [])
  }

  async cleanupSource(sourceId: string): Promise<SearchIndexWriterCommit> {
    const writer = this.resolveWriter(sourceId)
    const affectedItems = await writer.cleanupSource(sourceId)
    return await this.publishCommit(sourceId, 'cleanup', writer.mode, affectedItems, [])
  }

  async countSource(sourceId: string): Promise<number> {
    return await this.resolveWriter(sourceId).countSource(sourceId)
  }

  async drainSelected(sourceId: string, timeoutMs = 5_000): Promise<void> {
    await this.resolveWriter(sourceId).drain(timeoutMs)
  }

  async withPausedSelectedAdmission<T>(
    sourceId: string,
    operation: () => Promise<T>,
    timeoutMs = 5_000
  ): Promise<T> {
    const writer = this.resolveWriter(sourceId)
    if (writer.withPausedAdmission) {
      return await writer.withPausedAdmission(
        `indexed-source.reset.${sourceId}`,
        async () => await operation(),
        timeoutMs
      )
    }
    await writer.drain(timeoutMs)
    return await operation()
  }

  private resolveWriter(sourceId: string): SearchIndexPhysicalWriter {
    return this.getMode(sourceId) === 'runtime' ? this.options.runtime : this.options.legacy
  }

  private async publishCommit(
    sourceId: string,
    kind: SearchIndexMutationKind,
    writer: SearchIndexWriterMode,
    affectedItems: number,
    itemIds: readonly string[]
  ): Promise<SearchIndexWriterCommit> {
    if (affectedItems <= 0) {
      return this.buildCommit(sourceId, kind, writer, affectedItems, null)
    }

    const request = { sourceId, kind, itemIds }
    try {
      await this.options.visibilityBarrier.waitUntilReadable(request)
      return this.buildCommit(
        sourceId,
        kind,
        writer,
        affectedItems,
        this.commitHub.markCommitted([sourceId])
      )
    } catch {
      const payload = this.commitHub.markCommitted([sourceId])
      searchIndexWriterLog.warn('Search index commit has degraded reader visibility', {
        meta: { sourceId, kind }
      })
      this.scheduleVisibilityRetry(request)
      return this.buildCommit(sourceId, kind, writer, affectedItems, payload)
    }
  }

  private scheduleVisibilityRetry(request: SearchIndexVisibilityRequest): void {
    if (this.visibilityRetries.has(request.sourceId)) return

    const retry = this.retryVisibility(request).finally(() => {
      this.visibilityRetries.delete(request.sourceId)
    })
    this.visibilityRetries.set(request.sourceId, retry)
  }

  private async retryVisibility(request: SearchIndexVisibilityRequest): Promise<void> {
    for (let attempt = 0; attempt < VISIBILITY_RETRY_DELAYS_MS.length; attempt += 1) {
      await this.waitForVisibilityRetry(VISIBILITY_RETRY_DELAYS_MS[attempt])
      try {
        await this.options.visibilityBarrier.waitUntilReadable(request)
        searchIndexWriterLog.info('Search index reader visibility recovered', {
          meta: { sourceId: request.sourceId, kind: request.kind, attempt: attempt + 1 }
        })
        return
      } catch {
        searchIndexWriterLog.warn('Search index reader visibility retry failed', {
          meta: { sourceId: request.sourceId, kind: request.kind, attempt: attempt + 1 }
        })
      }
    }
  }

  private async waitForVisibilityRetry(delayMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, delayMs)
      timer.unref?.()
    })
  }

  private buildCommit(
    sourceId: string,
    kind: SearchIndexMutationKind,
    writer: SearchIndexWriterMode,
    affectedItems: number,
    payload: CoreBoxSearchIndexCommitPayload | null
  ): SearchIndexWriterCommit {
    return {
      sourceId,
      kind,
      writer,
      affectedItems,
      committed: payload !== null,
      revision: payload?.revision ?? this.commitHub.getRevision(),
      generation:
        payload?.sourceGenerations[sourceId] ?? this.commitHub.getSourceGeneration(sourceId),
      committedAt: payload?.committedAt ?? null
    }
  }
}

export const searchIndexWriter = new SearchIndexWriter()
