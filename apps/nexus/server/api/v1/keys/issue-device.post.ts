import { readBody } from 'h3'
import type { paths } from '../../../../types/sync-api'
import { requireAuth } from '../../../utils/auth'
import { readDeviceId } from '../../../utils/authStore'
import { createSyncError } from '../../../utils/syncErrors'
import { issueDeviceKey } from '../../../utils/syncStoreV1'

type IssueBody = paths['/api/v1/keys/issue-device']['post']['requestBody']['content']['application/json']
type IssueResponse = paths['/api/v1/keys/issue-device']['post']['responses']['200']['content']['application/json']

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const deviceId = readDeviceId(event)
  if (!deviceId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing device id')

  const body = await readBody<IssueBody>(event)
  const targetDeviceId = typeof body?.target_device_id === 'string' ? body.target_device_id.trim() : ''
  const keyType = typeof body?.key_type === 'string' ? body.key_type.trim() : ''
  const encryptedKey = typeof body?.encrypted_key === 'string' ? body.encrypted_key.trim() : ''
  const recoveryCodeHash = typeof body?.recovery_code_hash === 'string' ? body.recovery_code_hash.trim() : null
  if (!targetDeviceId || !keyType || !encryptedKey)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Invalid payload')

  const result = await issueDeviceKey(event, userId, {
    targetDeviceId,
    keyType,
    encryptedKey,
    recoveryCodeHash,
  })

  const response: IssueResponse = { keyring_id: result.keyringId }
  return response
})

