import type { paths } from '../../../../types/sync-api'
import { requireAppAuth } from '../../../utils/auth'
import { readDeviceId } from '../../../utils/authStore'
import { createSyncError } from '../../../utils/syncErrors'
import { getOrInitQuota } from '../../../utils/syncStoreV1'

type QuotaResponse = paths['/api/v1/quotas']['get']['responses']['200']['content']['application/json']

export default defineEventHandler(async (event) => {
  const { userId } = await requireAppAuth(event)
  const deviceId = readDeviceId(event)
  if (!deviceId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing device id')

  const quota = await getOrInitQuota(event, userId)
  return quota as QuotaResponse
})
