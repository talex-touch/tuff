import { readBody } from 'h3'
import type { paths } from '../../../../types/sync-api'
import { requireAppAuth } from '../../../utils/auth'
import { resolveBoundAppDeviceId } from '../../../utils/syncDeviceAuth'
import { createSyncError } from '../../../utils/syncErrors'
import { registerKey } from '../../../utils/syncStoreV1'

type RegisterBody = paths['/api/v1/keys/register']['post']['requestBody']['content']['application/json']
type RegisterResponse = paths['/api/v1/keys/register']['post']['responses']['200']['content']['application/json']

export default defineEventHandler(async (event) => {
  const { userId, deviceId: tokenDeviceId } = await requireAppAuth(event)
  const deviceId = resolveBoundAppDeviceId(event, tokenDeviceId)

  const body = await readBody<RegisterBody>(event)
  const keyType = typeof body?.key_type === 'string' ? body.key_type.trim() : ''
  const encryptedKey = typeof body?.encrypted_key === 'string' ? body.encrypted_key.trim() : ''
  const recoveryCodeHash = typeof body?.recovery_code_hash === 'string' ? body.recovery_code_hash.trim() : null
  if (!keyType || !encryptedKey)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Invalid payload')

  const result = await registerKey(event, userId, deviceId, {
    keyType,
    encryptedKey,
    recoveryCodeHash,
  })

  const response: RegisterResponse = { keyring_id: result.keyringId }
  return response
})
