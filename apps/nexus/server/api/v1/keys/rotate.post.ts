import { readBody } from 'h3'
import type { paths } from '../../../../types/sync-api'
import { requireAppAuth } from '../../../utils/auth'
import { resolveBoundAppDeviceId } from '../../../utils/syncDeviceAuth'
import { createSyncError } from '../../../utils/syncErrors'
import { rotateKey } from '../../../utils/syncStoreV1'

type RotateBody = paths['/api/v1/keys/rotate']['post']['requestBody']['content']['application/json']
type RotateResponse = paths['/api/v1/keys/rotate']['post']['responses']['200']['content']['application/json']

export default defineEventHandler(async (event) => {
  const { userId, deviceId: tokenDeviceId } = await requireAppAuth(event)
  const deviceId = resolveBoundAppDeviceId(event, tokenDeviceId)

  const body = await readBody<RotateBody>(event)
  const keyType = typeof body?.key_type === 'string' ? body.key_type.trim() : ''
  const encryptedKey = typeof body?.encrypted_key === 'string' ? body.encrypted_key.trim() : ''
  if (!keyType || !encryptedKey)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Invalid payload')

  const result = await rotateKey(event, userId, deviceId, { keyType, encryptedKey })
  const response: RotateResponse = { rotated_at: result.rotatedAt }
  return response
})
