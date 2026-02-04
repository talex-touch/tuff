import { getQuery } from 'h3'
import type { paths } from '../../../../types/sync-api'
import { requireAuth } from '../../../utils/auth'
import { readDeviceId } from '../../../utils/authStore'
import { createSyncError } from '../../../utils/syncErrors'
import { pullSyncItemsV1 } from '../../../utils/syncStoreV1'

type PullResponse = paths['/api/v1/sync/pull']['get']['responses']['200']['content']['application/json']

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const deviceId = readDeviceId(event)
  if (!deviceId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing device id')

  const query = getQuery(event)
  const cursorValue = typeof query.cursor === 'string' ? Number(query.cursor) : 0
  const limitValue = typeof query.limit === 'string' ? Number(query.limit) : 200
  if (!Number.isFinite(cursorValue) || cursorValue < 0)
    throw createSyncError('SYNC_INVALID_CURSOR', 400, 'Invalid cursor')

  const result = await pullSyncItemsV1(event, userId, cursorValue, limitValue)
  const response: PullResponse = {
    items: result.items,
    oplog: result.oplog,
    next_cursor: result.nextCursor,
  }
  return response
})
