import { isSqliteBusyError, isSqliteStorageFullError } from '../../../../../db/sqlite-retry'

export const FILE_INDEX_STORAGE_FULL = 'FILE_INDEX_STORAGE_FULL'

export interface FileIndexRunFailure {
  code: string
  retryable: boolean
  /**
   * Whether the file source stops. Its health turns `error`, and the indexing runtime then skips
   * every watch event and scan for it until the next successful run.
   */
  halts: boolean
}

/**
 * Classifies a scan/reconciliation run failure into its public error code and source-halt policy.
 *
 * Neither a full index (`SQLITE_FULL` / `ENOSPC`) nor a transient lock (`SQLITE_BUSY`) may set
 * `halts: true`: turning the source's health to `error` causes `IndexingRuntime` to skip all
 * subsequent watch events, retry scans, and manual rebuilds for the rest of the session. Keeping
 * `halts: false` reports `FILE_INDEX_DATABASE_BUSY` as `degraded` (`retryable: true`) while
 * genuine non-retryable scan failures still halt with `FILE_INDEX_SCAN_FAILED`.
 */
export function classifyRunFailure(error: unknown): FileIndexRunFailure {
  if (isSqliteStorageFullError(error)) {
    return { code: FILE_INDEX_STORAGE_FULL, retryable: false, halts: false }
  }
  const busy = isSqliteBusyError(error)
  return {
    code: busy ? 'FILE_INDEX_DATABASE_BUSY' : 'FILE_INDEX_SCAN_FAILED',
    retryable: busy,
    halts: !busy
  }
}

/** A full index stays full until deletions free pages, so rescanning it walks every root for nothing. */
export function isIndexFullFailure(failure: { code: string } | null): boolean {
  return failure?.code === FILE_INDEX_STORAGE_FULL
}
