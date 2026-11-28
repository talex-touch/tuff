import type { paths } from '../../../../types/sync-api'
import { requireAppAuth } from '../../../utils/auth'
import { resolveBoundAppDeviceId } from '../../../utils/syncDeviceAuth'
import { listKeyrings } from '../../../utils/syncStoreV1'

type ListResponse = paths['/api/v1/keys/list']['get']['responses']['200']['content']['application/json']

export default defineEventHandler(async (event) => {
  const { userId, deviceId: tokenDeviceId } = await requireAppAuth(event)
  resolveBoundAppDeviceId(event, tokenDeviceId)

  const keyrings = await listKeyrings(event, userId)
  const response: ListResponse = { keyrings }
  return response
})

