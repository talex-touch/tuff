import { createError, getQuery } from 'h3'
import { createAppToken } from '../../../utils/auth'
import { deleteDeviceAuthRequest, getDeviceAuthByDeviceCode, isDeviceAuthExpired, logLoginAttempt } from '../../../utils/authStore'

const SHORT_TERM_TTL_SECONDS = 60 * 60 * 24
const LONG_TERM_TTL_SECONDS = 60 * 60 * 24 * 30

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

  const ttlSeconds = request.grantType === 'long' ? LONG_TERM_TTL_SECONDS : SHORT_TERM_TTL_SECONDS
  const clientType = request.clientType ?? 'external'
  const appToken = await createAppToken(event, request.userId, {
    deviceId: request.deviceId,
    ttlSeconds,
    grantType: request.grantType,
    deviceMeta: {
      deviceName: request.deviceName ?? null,
      platform: request.devicePlatform ?? null,
      clientType,
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
    appToken,
    grantType: request.grantType,
    ttlSeconds,
    refreshable: request.grantType === 'long',
  }
})
