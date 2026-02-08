import { readBody } from 'h3'
import type { paths } from '../../../../types/sync-api'
import { requireAuth } from '../../../utils/auth'
import { readDeviceId } from '../../../utils/authStore'
import { createSyncError } from '../../../utils/syncErrors'
import { recoverKeyrings } from '../../../utils/syncStoreV1'

type RecoverBody = paths['/api/v1/keys/recover-device']['post']['requestBody']['content']['application/json']
type RecoverResponse = paths['/api/v1/keys/recover-device']['post']['responses']['200']['content']['application/json']

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const deviceId = readDeviceId(event)
  if (!deviceId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing device id')

  const body = await readBody<RecoverBody>(event)
  const recoveryCode = typeof body?.recovery_code === 'string' ? body.recovery_code.trim() : ''
  if (!recoveryCode)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Invalid payload')

  const keyrings = await recoverKeyrings(event, userId, { recoveryCode })
  const response: RecoverResponse = { keyrings }
  return response
})

