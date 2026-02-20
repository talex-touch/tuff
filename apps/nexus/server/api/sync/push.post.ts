import { createError } from 'h3'
import { requireVerifiedEmail } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireVerifiedEmail(event)
  throw createError({
    statusCode: 410,
    statusMessage: 'Legacy sync write disabled. Use /api/v1/sync/push.',
    data: {
      errorCode: 'SYNC_LEGACY_WRITE_DISABLED',
      message: 'Legacy /api/sync/push is disabled. Use /api/v1/sync/push.'
    }
  })
})
