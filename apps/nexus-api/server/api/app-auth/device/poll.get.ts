import { createError, getQuery } from 'h3'
import { createAppTokenPair } from '../../../utils/auth'
import { deleteDeviceAuthRequest, getDeviceAuthByDeviceCode, getUserById, isDeviceAuthExpired, logLoginAttempt } from '../../../utils/authStore'
import { normalizeLocaleCode } from '../../../utils/locale'

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
  // Independent statements: one round trip of latency instead of three.
  const [, , user] = await Promise.all([
    logLoginAttempt(event, {
      userId: request.userId,
      deviceId: request.deviceId,
      success: true,
      reason: 'device_auth',
      clientType,
    }),
    deleteDeviceAuthRequest(event, deviceCode),
    // Optional: once the delete commits this poll is the only way the tokens reach the app, so a failed read
    // must not fail it. A null profile sends the app to `/me`.
    getUserById(event, request.userId).catch(() => null),
  ])
  return {
    status: 'approved',
    ...tokens,
    grantType: request.grantType,
    refreshable: true,
    // The same profile `/api/v1/auth/me` returns, so the app can sign in without another round trip.
    // Null when the account is not active; the app then asks `/me`, which refuses it.
    user: user?.status === 'active'
      ? {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          locale: normalizeLocaleCode(user.locale),
          emailVerified: Boolean(user.emailVerified),
        }
      : null,
  }
})
