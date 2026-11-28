import { createError } from 'h3'

export default defineEventHandler(async (event) => {
  throw createError({
    statusCode: 410,
    statusMessage: 'Retired sync write endpoint. Use /api/v1/sync/push.',
    data: {
      errorCode: 'SYNC_RETIRED_WRITE_DISABLED',
      message: 'Retired /api/sync/push is disabled. Use /api/v1/sync/push.'
    }
  })
})
