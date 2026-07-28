import type { PluginStorageErrorCode } from '@talex-touch/utils/transport/events/types'

export const PLUGIN_SQLITE_MAX_ROWS = 1_000
export const PLUGIN_SQLITE_MAX_RESULT_BYTES = 4 * 1024 * 1024
export const PLUGIN_SQLITE_MAX_DATABASE_BYTES = 64 * 1024 * 1024
export const PLUGIN_SQLITE_MAX_JOURNAL_BYTES = 16 * 1024 * 1024
export const PLUGIN_SQLITE_MAX_HEAP_BYTES = 16 * 1024 * 1024
export const PLUGIN_SQLITE_MAX_QUEUE_DEPTH = 8
export const PLUGIN_SQLITE_QUERY_TIMEOUT_MS = 2_000
export const PLUGIN_SQLITE_WRITE_TIMEOUT_MS = 5_000
export const PLUGIN_SQLITE_MAX_WORKERS = 16
export const PLUGIN_SQLITE_MAX_ACTIVE_OPERATIONS = 4

export interface PluginSqliteExecuteResult {
  rowsAffected: number
  lastInsertRowId: number | null
}

export interface PluginSqliteQueryResult {
  rows: Array<Record<string, unknown>>
  columns: string[]
}

export interface PluginSqliteTransactionResult {
  results: PluginSqliteExecuteResult[]
}

export type PluginSqliteWorkerOperation =
  | { type: 'execute'; sql: string; params: unknown[] }
  | { type: 'query'; sql: string; params: unknown[] }
  | {
      type: 'transaction'
      statements: Array<{ sql: string; params: unknown[] }>
    }

export interface PluginSqliteWorkerRequest {
  requestId: string
  operation: PluginSqliteWorkerOperation
}

export type PluginSqliteWorkerResult =
  | PluginSqliteExecuteResult
  | PluginSqliteQueryResult
  | PluginSqliteTransactionResult

export type PluginSqliteWorkerResponse =
  | { type: 'result'; requestId: string; result: PluginSqliteWorkerResult }
  | {
      type: 'error'
      requestId: string
      code: PluginStorageErrorCode
      error: string
    }
