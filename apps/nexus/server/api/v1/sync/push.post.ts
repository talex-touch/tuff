import { readBody } from 'h3'
import type { paths } from '../../../../types/sync-api'
import { requireAuth } from '../../../utils/auth'
import { countActiveDevices, readDeviceId } from '../../../utils/authStore'
import { createSyncError } from '../../../utils/syncErrors'
import { applyQuotaDelta, getOrInitQuota, pushSyncItemsV1, validateQuota } from '../../../utils/syncStoreV1'

type PushBody = paths['/api/v1/sync/push']['post']['requestBody']['content']['application/json']
type PushResponse = paths['/api/v1/sync/push']['post']['responses']['200']['content']['application/json']

export default defineEventHandler(async (event) => {
  const { userId, deviceId: tokenDeviceId } = await requireAuth(event)
  const deviceId = tokenDeviceId ?? readDeviceId(event)
  if (!deviceId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing device id')

  const quota = await getOrInitQuota(event, userId)
  const deviceCount = await countActiveDevices(event, userId)
  if (deviceCount > quota.limits.device_limit)
    throw createSyncError('QUOTA_DEVICE_EXCEEDED', 403, 'Device limit exceeded')

  const body = await readBody<PushBody>(event)
  const items = Array.isArray(body?.items) ? body.items : null
  if (!items)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Invalid payload')

  const activeItems = items.filter(item => item?.op_type !== 'delete')
  const storageDelta = activeItems.reduce((sum, item) => sum + Number(item?.payload_size ?? 0), 0)
  const objectsDelta = activeItems.length
  const itemSize = activeItems.reduce((max, item) => Math.max(max, Number(item?.payload_size ?? 0)), 0)
  const quotaCheck = await validateQuota(event, userId, { storageDelta, objectsDelta, itemSize })
  if (!quotaCheck.ok)
    throw createSyncError(quotaCheck.code!, 403, 'Quota exceeded')

  const result = await pushSyncItemsV1(event, userId, deviceId, items as any)
  if ('errorCode' in result && result.errorCode)
    throw createSyncError(result.errorCode, 400, 'Invalid payload')

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
