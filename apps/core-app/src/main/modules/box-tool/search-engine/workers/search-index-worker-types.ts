/**
 * Shared types for search-index-worker IPC protocol.
 * Main thread + worker both import from here to ensure type safety.
 */

import type { SearchIndexItem } from '../search-index-service'
import type { files } from '../../../../db/schema'

// ============================================================================
// Existing message types (keep for reference, actual definitions in worker.ts)
// ============================================================================

export interface InitMessage {
  type: 'init'
  dbPath: string
  taskId: string
}

export interface IndexItemsMessage {
  type: 'indexItems'
  items: SearchIndexItem[]
  taskId: string
}

export interface RemoveItemsMessage {
  type: 'removeItems'
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
 * Union of all search-index-worker message types.
 */
export type SearchIndexWorkerMessage =
  | InitMessage
  | IndexItemsMessage
  | RemoveItemsMessage
  | RemoveByProviderMessage
  | CountByProviderMessage
  | RemoveFileMessage
  | RemoveFileExtensionsMessage
  | CleanupOrphanKeywordsMessage

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
  error: { message: string; stack?: string; code?: string }
}

export type WorkerResponseMessage = WorkerResultMessage | WorkerErrorMessage

// ============================================================================
// Shared file-index types (re-export from schema for main + worker)
// ============================================================================

export type FilesRow = typeof files.$inferSelect
export type FilesInsert = typeof files.$inferInsert
