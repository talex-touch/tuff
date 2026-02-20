import { createError } from 'h3'

export default defineEventHandler(async (event) => {
  throw createError({
    statusCode: 410,
    statusMessage: 'Legacy sync read disabled. Use /api/v1/sync/pull.',
    data: {
      errorCode: 'SYNC_LEGACY_READ_DISABLED',
      message: 'Legacy /api/sync/pull is disabled. Use /api/v1/sync/pull.'
    }
  })
})
