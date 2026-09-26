/**
 * Read failures the file-index worker does not count as failures.
 *
 * A file that is gone, or that the OS refuses to read, will fail the same way
 * on every retry until the file itself changes. The worker records these as a
 * terminal `skipped` status with one of the reasons below: enrichment resume
 * only re-selects `pending`/`processing` rows, and a changed file is marked
 * pending again by the write path.
 */

/** ENOENT / ENOTDIR: nothing exists at the indexed path any more. */
export const INDEX_WORKER_FILE_MISSING = 'file-missing'

/** EACCES / EPERM: the file exists but may not be read. */
export const INDEX_WORKER_PERMISSION_DENIED = 'permission-denied'

export type IndexWorkerReadSkipReason =
  | typeof INDEX_WORKER_FILE_MISSING
  | typeof INDEX_WORKER_PERMISSION_DENIED

export function classifyIndexWorkerReadFailure(
  errorCode: string | null | undefined
): IndexWorkerReadSkipReason | null {
  switch (errorCode) {
    case 'ENOENT':
    case 'ENOTDIR':
      return INDEX_WORKER_FILE_MISSING
    case 'EACCES':
    case 'EPERM':
      return INDEX_WORKER_PERMISSION_DENIED
    default:
      return null
  }
}

/** True for a worker result recording that its file no longer exists. */
export function isIndexWorkerFileMissing(progress: {
  status: string
  lastError?: string | null
}): boolean {
  return progress.status === 'skipped' && progress.lastError === INDEX_WORKER_FILE_MISSING
}

/** A batch's `done` message carries at most this many `lastError` samples. */
export const INDEX_WORKER_FAILURE_SAMPLE_LIMIT = 3

const INDEX_WORKER_FAILURE_SAMPLE_MAX_LENGTH = 240

/** Records one failure's `lastError` while the sample list has room. */
export function pushIndexWorkerFailureSample(
  samples: string[],
  lastError: string | null | undefined
): void {
  if (samples.length >= INDEX_WORKER_FAILURE_SAMPLE_LIMIT) return
  const text = lastError?.trim() || 'unknown-error'
  samples.push(
    text.length > INDEX_WORKER_FAILURE_SAMPLE_MAX_LENGTH
      ? `${text.slice(0, INDEX_WORKER_FAILURE_SAMPLE_MAX_LENGTH)}…`
      : text
  )
}
