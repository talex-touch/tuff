import type { SerializedSearchIndexWorkerError } from './search-index-worker-error'

/**
 * IPC between the main-process read executor and its dedicated SQLite reader.
 * SQL is compiled by the parent; the worker receives only the statement text
 * and its positional arguments.
 */
export interface SearchIndexReadWorkerQueryMessage {
  type: 'query'
  requestId: string
  sql: string
  args: unknown[]
}

export interface SearchIndexReadWorkerResultMessage {
  type: 'result'
  requestId: string
  rows: Record<string, unknown>[]
}

export interface SearchIndexReadWorkerErrorMessage {
  type: 'error'
  requestId: string
  error: SerializedSearchIndexWorkerError
}

export type SearchIndexReadWorkerRequest = SearchIndexReadWorkerQueryMessage
export type SearchIndexReadWorkerResponse =
  | SearchIndexReadWorkerResultMessage
  | SearchIndexReadWorkerErrorMessage
