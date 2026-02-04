import { createError } from 'h3'
import type { SyncErrorCode } from './syncStoreV1'

export function createSyncError(code: SyncErrorCode, statusCode = 400, statusMessage?: string) {
  return createError({
    statusCode,
    statusMessage: statusMessage ?? code,
    data: { errorCode: code },
  })
}
