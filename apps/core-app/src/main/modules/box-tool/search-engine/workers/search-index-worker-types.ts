/**
 * Shared types for search-index-worker IPC protocol.
 * Main thread + worker both import from here to ensure type safety.
 */

import type {
  SearchIndexItem,
  SearchIndexProviderReplacementSummary
} from '../search-index-service'
import type {
  ExpectedFileRecord,
  ExpectedMissingFileSearchRecord,
  FilePersistenceEntry,
  UpsertFileRecord
} from '../file-index-persistence-repository'
import type { files } from '../../../../db/schema'
import type { SerializedSearchIndexWorkerError } from './search-index-worker-error'
import type { IndexMaintenanceNotification } from '../index-maintenance-context'

export type {
  FilePersistenceEntry,
  ExpectedFileRecord,
  ExpectedMissingFileSearchRecord,
  FileDeletionCommitReceipt,
  ListPendingFileDeletionCommitsResult,
  AcknowledgeFileDeletionCommitsResult,
  RemoveFileRecordsResult,
  RemoveMissingFileSearchRecordsResult,
  PersistEntriesSummary
} from '../file-index-persistence-repository'

// ============================================================================
// Existing message types (keep for reference, actual definitions in worker.ts)
// ============================================================================

export interface InitMessage {
  type: 'init'
  dbPath: string
  taskId: string
}

export interface ApplyProviderItemsMessage {
  type: 'applyProviderItems'
  providerId: string
  items: SearchIndexItem[]
  legacyItemIds: string[]
  taskId: string
}

export interface PersistAndApplyProviderItemsMessage {
  type: 'persistAndApplyProviderItems'
  providerId: string
  items: SearchIndexItem[]
  legacyItemIds: string[]
  records: UpsertFileRecord[]
  taskId: string
}
export interface PersistAndApplyProviderItemsMetrics {
  requestedRows: number
  persistedRows: number
  indexedItems: number
  removedItems: number
  legacyItemIds: number
  workerDurationMs: number
  persistDurationMs: number
  applyDurationMs: number
  /** Actual CPU consumed by this worker operation via threadCpuUsage(), with process fallback. */
  workerCpuMicros?: number
  roundTripDurationMs?: number
  visibilityDurationMs?: number
}

export interface PersistAndApplyProviderItemsResult {
  persistedCount: number
  summary: SearchIndexProviderReplacementSummary
  metrics?: PersistAndApplyProviderItemsMetrics
}

export interface BeginProviderReplacementMessage {
  type: 'beginProviderReplacement'
  providerId: string
  replacementId: string
  taskId: string
}

export interface StageProviderReplacementItemsMessage {
  type: 'stageProviderReplacementItems'
  providerId: string
  replacementId: string
  items: SearchIndexItem[]
  taskId: string
}

export interface CommitProviderReplacementMessage {
  type: 'commitProviderReplacement'
  providerId: string
  replacementId: string
  taskId: string
}

export interface AbortProviderReplacementMessage {
  type: 'abortProviderReplacement'
  providerId: string
  replacementId: string
  taskId: string
}

export interface GetProviderReplacementOutcomeMessage {
  type: 'getProviderReplacementOutcome'
  providerId: string
  replacementId: string
  taskId: string
}

export type ProviderReplacementOutcome = SearchIndexProviderReplacementSummary | null

export interface RemoveProviderItemsMessage {
  type: 'removeProviderItems'
  providerId: string
  itemIds: string[]
  taskId: string
}

export interface RemoveByProviderMessage {
  type: 'removeByProvider'
  providerId: string
  taskId: string
}

export interface CountByProviderMessage {
  type: 'countByProvider'
  providerId: string
  taskId: string
}

export interface PersistEntriesMessage {
  type: 'persistEntries'
  taskId: string
  entries: FilePersistenceEntry[]
}

// ============================================================================
// New message types for single-writer architecture (Phase 1)
// ============================================================================

/** One bounded, version-fenced file/FTS/keyword deletion transaction. */
export interface RemoveFileRecordsMessage {
  type: 'removeFileRecords'
  sourceId: string
  records: readonly ExpectedFileRecord[]
  /** Cancellation is checked only before starting a transaction, never during commit. */
  cancellation?: SharedArrayBuffer
  taskId: string
}

export interface RemoveMissingFileSearchRecordsMessage {
  type: 'removeMissingFileSearchRecords'
  sourceId: string
  records: readonly ExpectedMissingFileSearchRecord[]
  cancellation?: SharedArrayBuffer
  taskId: string
}

export interface ListPendingFileDeletionCommitsMessage {
  type: 'listPendingFileDeletionCommits'
  sourceId: string
  limit: number
  cancellation?: SharedArrayBuffer
  taskId: string
}

export interface AcknowledgeFileDeletionCommitsMessage {
  type: 'acknowledgeFileDeletionCommits'
  sourceId: string
  commitIds: readonly string[]
  cancellation?: SharedArrayBuffer
  taskId: string
}

/**
 * Remove specific file_extensions entries by fileId + keys.
 * Used for stale asset cache cleanup (thumbnail/icon gone).
 */
export interface RemoveFileExtensionsMessage {
  type: 'removeFileExtensions'
  fileId: number
  keys: string[]
  taskId: string
}

/**
 * Cleanup orphaned keyword_mappings entries (integrity check).
 * Deletes keywords whose item_id no longer exists in search_index.
 */
export interface CleanupOrphanKeywordsMessage {
  type: 'cleanupOrphanKeywords'
  sourceId: string
  taskId: string
}

export interface RunIndexMaintenanceSliceMessage {
  type: 'runIndexMaintenanceSlice'
  sourceId: string
  limit: number
  cancellation?: SharedArrayBuffer
  taskId: string
}

export interface AcknowledgeIndexMaintenanceCommitMessage {
  type: 'acknowledgeIndexMaintenanceCommit'
  notification: IndexMaintenanceNotification
  taskId: string
}

/**
 * Graceful shutdown request: the worker finalizes its WAL
 * (`wal_checkpoint(TRUNCATE)`) and closes its DB connection before the parent
 * terminates the thread. Runs through the serial queue, so any in-flight write
 * completes first — this is what prevents the abrupt-terminate corruption path.
 */
export interface ShutdownMessage {
  type: 'shutdown'
  taskId: string
}

export interface ExecWriteStatement {
  sql: string
  args: unknown[]
}

/**
 * Generic write forwarding. Runs one or more prepared statements on the worker's
 * connection — the sole writer of its DB file — so main-thread file-index writes
 * can be routed through the worker when the DB split is enabled (issue #295),
 * without a bespoke message per operation. `mode: 'transaction'` wraps the
 * statements in one atomic BEGIN/COMMIT.
 */
export interface ExecWriteMessage {
  type: 'execWrite'
  taskId: string
  statements: ExecWriteStatement[]
  mode: 'single' | 'transaction'
}

export interface ExecWriteResult {
  rowsAffected: number
  lastInsertRowid: string | null
  rows: Array<Record<string, unknown>>
}

/**
 * Union of all search-index-worker message types.
 */
export type SearchIndexWorkerMessage =
  | InitMessage
  | ApplyProviderItemsMessage
  | PersistAndApplyProviderItemsMessage
  | BeginProviderReplacementMessage
  | StageProviderReplacementItemsMessage
  | CommitProviderReplacementMessage
  | AbortProviderReplacementMessage
  | GetProviderReplacementOutcomeMessage
  | RemoveByProviderMessage
  | RemoveProviderItemsMessage
  | CountByProviderMessage
  | PersistEntriesMessage
  | RemoveFileRecordsMessage
  | RemoveMissingFileSearchRecordsMessage
  | ListPendingFileDeletionCommitsMessage
  | AcknowledgeFileDeletionCommitsMessage
  | RemoveFileExtensionsMessage
  | CleanupOrphanKeywordsMessage
  | RunIndexMaintenanceSliceMessage
  | AcknowledgeIndexMaintenanceCommitMessage
  | ShutdownMessage
  | ExecWriteMessage

// ============================================================================
// Shared result types
// ============================================================================

export interface WorkerResultMessage {
  type: 'result'
  taskId: string
  result?: unknown
}

export interface WorkerErrorMessage {
  type: 'error'
  taskId: string
  error: SerializedSearchIndexWorkerError
}

export type WorkerResponseMessage = WorkerResultMessage | WorkerErrorMessage

// ============================================================================
// Shared file-index types (re-export from schema for main + worker)
// ============================================================================

export type FilesRow = typeof files.$inferSelect
export type FilesInsert = typeof files.$inferInsert
