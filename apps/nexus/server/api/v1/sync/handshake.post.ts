import type { paths } from '../../../../types/sync-api'
import { requireAppAuth } from '../../../utils/auth'
import {
  countActiveDevices,
  readDeviceId,
  upsertDevice,
  readDeviceMetadata,
  revokeInactiveDevices,
  revokeOldestDevices
} from '../../../utils/authStore'
import { createSyncError } from '../../../utils/syncErrors'
import { getOrInitQuota, handshakeSyncSession } from '../../../utils/syncStoreV1'

type HandshakeResponse = paths['/api/v1/sync/handshake']['post']['responses']['200']['content']['application/json']

const DEVICE_INACTIVE_DAYS = 30
const DEVICE_INACTIVE_MS = 1000 * 60 * 60 * 24 * DEVICE_INACTIVE_DAYS

export default defineEventHandler(async (event) => {
  const { userId, deviceId: tokenDeviceId } = await requireAppAuth(event)
  const deviceId = tokenDeviceId ?? readDeviceId(event)
  if (!deviceId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing device id')

  await upsertDevice(event, userId, deviceId, readDeviceMetadata(event))

  const quota = await getOrInitQuota(event, userId)
  const evictedDevices = [
    ...(await revokeInactiveDevices(event, userId, {
      inactiveBefore: new Date(Date.now() - DEVICE_INACTIVE_MS).toISOString(),
      keepDeviceId: deviceId
    })),
  ]
  const deviceCount = await countActiveDevices(event, userId)
  if (deviceCount > quota.limits.device_limit) {
    evictedDevices.push(
      ...(await revokeOldestDevices(event, userId, {
        limit: quota.limits.device_limit,
        keepDeviceId: deviceId
      }))
    )
  }
  const finalDeviceCount = await countActiveDevices(event, userId)
  if (finalDeviceCount > quota.limits.device_limit) {
    throw createSyncError('QUOTA_DEVICE_EXCEEDED', 403, 'Device limit exceeded')
  }

  const session = await handshakeSyncSession(event, userId, deviceId)

  const response: HandshakeResponse = {
    sync_token: session.syncToken,
    sync_token_expires_at: session.expiresAt,
    server_cursor: session.serverCursor,
    device_id: deviceId,
    quotas: quota,
    evicted_devices: evictedDevices.map((device) => ({
      device_id: device.id,
      device_name: device.deviceName,
      platform: device.platform,
      last_seen_at: device.lastSeenAt
    })),
  }
  return response
})
