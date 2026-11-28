import { createError } from 'h3'

export default defineEventHandler(async (event) => {
  throw createError({
    statusCode: 410,
    statusMessage: 'Retired sync read endpoint. Use /api/v1/sync/pull.',
    data: {
      errorCode: 'SYNC_RETIRED_READ_DISABLED',
      message: 'Retired /api/sync/pull is disabled. Use /api/v1/sync/pull.'
    }
  })
})
