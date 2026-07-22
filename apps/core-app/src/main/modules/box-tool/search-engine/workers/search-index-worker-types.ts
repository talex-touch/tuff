/**
 * Shared types for search-index-worker IPC protocol.
 * Main thread + worker both import from here to ensure type safety.
 */

import type {
  SearchIndexItem,
  SearchIndexProviderReplacementSummary
} from '../search-index-service'
import type { files } from '../../../../db/schema'
import type { FilePersistenceEntry } from '../file-index-persistence-repository'
import type { SerializedSearchIndexWorkerError } from './search-index-worker-error'

export type {
  FilePersistenceEntry,
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

/**
 * Remove a file record from the files table.
 * Worker becomes the single writer for file-index domain.
 */
export interface RemoveFileMessage {
  type: 'removeFile'
  path: string
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

/**
 * Union of all search-index-worker message types.
 */
export type SearchIndexWorkerMessage =
  | InitMessage
  | ApplyProviderItemsMessage
  | RemoveProviderItemsMessage
  | BeginProviderReplacementMessage
  | StageProviderReplacementItemsMessage
  | CommitProviderReplacementMessage
  | AbortProviderReplacementMessage
  | GetProviderReplacementOutcomeMessage
  | RemoveByProviderMessage
  | CountByProviderMessage
  | PersistEntriesMessage
  | RemoveFileMessage
  | RemoveFileExtensionsMessage
  | CleanupOrphanKeywordsMessage
  | ShutdownMessage

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
