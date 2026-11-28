import type { paths } from '../../../../types/sync-api'
import { requireAppAuth } from '../../../utils/auth'
import { resolveBoundAppDeviceId } from '../../../utils/syncDeviceAuth'
import { getOrInitQuota } from '../../../utils/syncStoreV1'

type QuotaResponse = paths['/api/v1/quotas']['get']['responses']['200']['content']['application/json']

export default defineEventHandler(async (event) => {
  const { userId, deviceId: tokenDeviceId } = await requireAppAuth(event)
  resolveBoundAppDeviceId(event, tokenDeviceId)

  const quota = await getOrInitQuota(event, userId)
  return quota as QuotaResponse
})
