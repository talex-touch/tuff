import type { SerializedSearchIndexWorkerError } from './search-index-worker-error'

/**
 * IPC between the main-process read executor and its dedicated SQLite reader.
 *
 * `shutdown` is the only way the parent may end a reader: see
 * `SearchIndexReadWorkerClient.retireWorker` for why terminating the thread is not an option.
 */

/** Asks the reader to close its connection and leave the thread, instead of being terminated. */
export interface SearchIndexReadWorkerShutdownMessage {
  type: 'shutdown'
}

/**
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

export type SearchIndexReadWorkerRequest =
  | SearchIndexReadWorkerQueryMessage
  | SearchIndexReadWorkerShutdownMessage
export type SearchIndexReadWorkerResponse =
  | SearchIndexReadWorkerResultMessage
  | SearchIndexReadWorkerErrorMessage
