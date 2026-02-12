import { getHeader, getQuery } from 'h3'
import type { paths } from '../../../../types/sync-api'
import { requireAppAuth } from '../../../utils/auth'
import { readDeviceId } from '../../../utils/authStore'
import { createSyncError } from '../../../utils/syncErrors'
import { getSyncSession, markSyncSessionError, pullSyncItemsV1 } from '../../../utils/syncStoreV1'

type PullResponse = paths['/api/v1/sync/pull']['get']['responses']['200']['content']['application/json']

export default defineEventHandler(async (event) => {
  const { userId } = await requireAppAuth(event)
  const deviceId = readDeviceId(event)
  if (!deviceId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing device id')

  const syncToken = getHeader(event, 'x-sync-token')
  if (!syncToken)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing sync token')

  try {
    await getSyncSession(event, userId, deviceId, syncToken)

    const query = getQuery(event)
    const cursorValue = typeof query.cursor === 'string' ? Number(query.cursor) : 0
    const limitValue = typeof query.limit === 'string' ? Number(query.limit) : 200
    if (!Number.isFinite(cursorValue) || cursorValue < 0)
      throw createSyncError('SYNC_INVALID_CURSOR', 400, 'Invalid cursor')

    const result = await pullSyncItemsV1(event, userId, deviceId, cursorValue, limitValue)
    const response: PullResponse = {
      items: result.items,
      oplog: result.oplog,
      next_cursor: result.nextCursor,
    }
    return response
  } catch (error) {
    const errorCode =
      error && typeof error === 'object' && 'data' in error
        ? String((error as { data?: { errorCode?: unknown } }).data?.errorCode ?? '')
        : ''
    if (errorCode) {
      await markSyncSessionError(event, userId, deviceId, errorCode)
    }
    throw error
  }
})
