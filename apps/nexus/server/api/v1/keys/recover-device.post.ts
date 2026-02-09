import { getHeader, readBody } from 'h3'
import type { H3Event } from 'h3'
import type { paths } from '../../../../types/sync-api'
import { requireAuth } from '../../../utils/auth'
import { consumeLoginToken, listPasskeys, readDeviceId } from '../../../utils/authStore'
import { createSyncError } from '../../../utils/syncErrors'
import { recoverKeyrings } from '../../../utils/syncStoreV1'

type RecoverBody = paths['/api/v1/keys/recover-device']['post']['requestBody']['content']['application/json']
type RecoverResponse = paths['/api/v1/keys/recover-device']['post']['responses']['200']['content']['application/json']

async function requireStepUpIfPasskeyEnabled(event: H3Event, userId: string) {
  const passkeys = await listPasskeys(event, userId)
  if (!passkeys || passkeys.length === 0)
    return

  const token = getHeader(event, 'x-login-token')
  if (!token)
    throw createSyncError('DEVICE_NOT_AUTHORIZED', 403, 'MF2A required')

  const user = await consumeLoginToken(event, token, 'passkey')
  if (!user || user.id !== userId)
    throw createSyncError('DEVICE_NOT_AUTHORIZED', 403, 'MF2A required')
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const deviceId = readDeviceId(event)
  if (!deviceId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing device id')

  await requireStepUpIfPasskeyEnabled(event, userId)

  const body = await readBody<RecoverBody>(event)
  const recoveryCode = typeof body?.recovery_code === 'string' ? body.recovery_code.trim() : ''
  if (!recoveryCode)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Invalid payload')

  const keyrings = await recoverKeyrings(event, userId, { recoveryCode })
  const response: RecoverResponse = { keyrings }
  return response
})
