import { getHeader, readBody } from 'h3'
import type { paths } from '../../../../types/sync-api'
import { requireAppAuth } from '../../../utils/auth'
import { countActiveDevices, readDeviceId } from '../../../utils/authStore'
import { createSyncError } from '../../../utils/syncErrors'
import { applyQuotaDelta, ensureDeviceForSync, getOrInitQuota, getSyncSession, pushSyncItemsV1 } from '../../../utils/syncStoreV1'

type PushBody = paths['/api/v1/sync/push']['post']['requestBody']['content']['application/json']
type PushResponse = paths['/api/v1/sync/push']['post']['responses']['200']['content']['application/json']

export default defineEventHandler(async (event) => {
  const { userId, deviceId: tokenDeviceId } = await requireAppAuth(event)
  const deviceId = tokenDeviceId ?? readDeviceId(event)
  if (!deviceId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing device id')

  const syncToken = getHeader(event, 'x-sync-token')
  if (!syncToken)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing sync token')

  await getSyncSession(event, userId, deviceId, syncToken)
  await ensureDeviceForSync(event, userId)

  const quota = await getOrInitQuota(event, userId)
  const deviceCount = await countActiveDevices(event, userId)
  if (deviceCount > quota.limits.device_limit)
    throw createSyncError('QUOTA_DEVICE_EXCEEDED', 403, 'Device limit exceeded')

  const body = await readBody<PushBody>(event)
  const items = Array.isArray(body?.items) ? body.items : null
  if (!items)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Invalid payload')

  const result = await pushSyncItemsV1(event, userId, deviceId, items as any)
  if ('errorCode' in result && result.errorCode) {
    const statusCode = result.errorCode.startsWith('QUOTA_') ? 403 : 400
    const statusMessage = result.errorCode.startsWith('QUOTA_') ? 'Quota exceeded' : 'Invalid payload'
    throw createSyncError(result.errorCode, statusCode, statusMessage)
  }

  if (result.appliedStorageDelta || result.appliedObjectsDelta) {
    await applyQuotaDelta(event, userId, {
      storageDelta: result.appliedStorageDelta,
      objectsDelta: result.appliedObjectsDelta,
    })
  }

  const response: PushResponse = {
    ack_cursor: result.ackCursor,
    conflicts: result.conflicts,
  }
  return response
})
