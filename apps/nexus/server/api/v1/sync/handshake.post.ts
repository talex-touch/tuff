import type { paths } from '../../../../types/sync-api'
import { requireAuth } from '../../../utils/auth'
import { countActiveDevices, readDeviceId, upsertDevice, readDeviceMetadata } from '../../../utils/authStore'
import { createSyncError } from '../../../utils/syncErrors'
import { getOrInitQuota, handshakeSyncSession } from '../../../utils/syncStoreV1'

type HandshakeResponse = paths['/api/v1/sync/handshake']['post']['responses']['200']['content']['application/json']

export default defineEventHandler(async (event) => {
  const { userId, deviceId: tokenDeviceId } = await requireAuth(event)
  const deviceId = tokenDeviceId ?? readDeviceId(event)
  if (!deviceId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing device id')

  await upsertDevice(event, userId, deviceId, readDeviceMetadata(event))

  const quota = await getOrInitQuota(event, userId)
  const deviceCount = await countActiveDevices(event, userId)
  if (deviceCount > quota.limits.device_limit)
    throw createSyncError('QUOTA_DEVICE_EXCEEDED', 403, 'Device limit exceeded')

  const session = await handshakeSyncSession(event, userId, deviceId)

  const response: HandshakeResponse = {
    sync_token: session.syncToken,
    sync_token_expires_at: session.expiresAt,
    server_cursor: session.serverCursor,
    device_id: deviceId,
    quotas: quota,
  }
  return response
})
