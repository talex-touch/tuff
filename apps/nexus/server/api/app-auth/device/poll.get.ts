import { createError, getQuery } from 'h3'
import { createAppTokenPair } from '../../../utils/auth'
import { deleteDeviceAuthRequest, getDeviceAuthByDeviceCode, isDeviceAuthExpired, logLoginAttempt } from '../../../utils/authStore'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const deviceCode = typeof query.device_code === 'string' ? query.device_code.trim() : ''
  if (!deviceCode) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing device code',
    })
  }

  const request = await getDeviceAuthByDeviceCode(event, deviceCode)
  if (!request) {
    return { status: 'expired' }
  }

  if (isDeviceAuthExpired(request)) {
    await deleteDeviceAuthRequest(event, deviceCode)
    return { status: 'expired' }
  }

  if (request.status === 'cancelled') {
    await deleteDeviceAuthRequest(event, deviceCode)
    return { status: 'cancelled' }
  }

  if (request.status === 'rejected') {
    return {
      status: 'rejected',
      reason: request.rejectReason ?? 'unknown',
      message: request.rejectMessage ?? null,
      requestIp: request.rejectRequestIp ?? request.requestIp ?? null,
      currentIp: request.rejectCurrentIp ?? null,
      rejectedAt: request.rejectedAt ?? null,
      expiresAt: request.expiresAt,
    }
  }

  if (request.status === 'pending') {
    if (request.browserState === 'closed') {
      return {
        status: 'browser_closed',
        browserClosedAt: request.browserClosedAt ?? null,
        expiresAt: request.expiresAt,
      }
    }
    return {
      status: 'pending',
      browserState: request.browserState ?? 'unknown',
      expiresAt: request.expiresAt,
    }
  }

  if (request.status !== 'approved' || !request.userId) {
    return { status: 'pending', expiresAt: request.expiresAt }
  }

  const clientType = request.clientType ?? 'external'
  const tokens = await createAppTokenPair(event, request.userId, {
    deviceId: request.deviceId,
    grantType: request.grantType,
    deviceMeta: {
      deviceName: request.deviceName ?? null,
      platform: request.devicePlatform ?? null,
      clientType,
      reactivateRevoked: true,
    },
  })
  await logLoginAttempt(event, {
    userId: request.userId,
    deviceId: request.deviceId,
    success: true,
    reason: 'device_auth',
    clientType,
  })
  await deleteDeviceAuthRequest(event, deviceCode)
  return {
    status: 'approved',
    ...tokens,
    grantType: request.grantType,
    refreshable: true,
  }
})
