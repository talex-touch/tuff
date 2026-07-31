/**
 * File Index failure copy helpers (issue #476).
 *
 * The only inputs are a stable `errorCode` and an optional `reportId`; raw
 * exception text can never flow into toast / status popover / clipboard copy
 * through these helpers.
 */

export interface FileIndexFailureCopyMessages {
  databaseBusy: string
  writerBusy: string
  generic: string
}

/** Map a stable File Index error code to localized copy. */
export function resolveFileIndexFailureCopy(
  errorCode: string | null | undefined,
  messages: FileIndexFailureCopyMessages
): string {
  if (errorCode === 'FILE_INDEX_DATABASE_BUSY' || errorCode === 'INDEXED_SOURCE_DATABASE_BUSY') {
    return messages.databaseBusy
  }
  if (errorCode === 'FILE_INDEX_WRITER_DRAIN_TIMEOUT') {
    return messages.writerBusy
  }
  return messages.generic
}

/** Append a localized report-ID suffix when a report ID exists. */
export function appendFileIndexReportId(
  message: string,
  reportId: string | null | undefined,
  formatSuffix: (reportId: string) => string
): string {
  if (!reportId) return message
  return `${message} ${formatSuffix(reportId)}`
}
