import { createError, getQuery } from 'h3'
import { createAppTokenPair } from '../../../utils/auth'
import { claimApprovedDeviceAuthRequest, deleteDeviceAuthRequest, getDeviceAuthByDeviceCode, getUserById, isDeviceAuthExpired, logLoginAttempt } from '../../../utils/authStore'
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

  // Atomically claim the approved request so concurrent polls cannot mint
  // duplicate token pairs for the same device_code.
  const claimed = await claimApprovedDeviceAuthRequest(event, deviceCode)
  if (!claimed || !claimed.userId) {
    return { status: 'expired' }
  }

  const clientType = claimed.clientType ?? 'external'
  const user = await getUserById(event, claimed.userId)
  if (!user || user.status !== 'active') {
    await logLoginAttempt(event, {
      userId: claimed.userId,
      deviceId: claimed.deviceId,
      success: false,
      reason: 'account_inactive',
      clientType,
    }).catch(() => {})
    return {
      status: 'rejected',
      reason: 'account_inactive',
      message: 'Account is disabled.',
      requestIp: claimed.requestIp ?? null,
      currentIp: null,
      rejectedAt: new Date().toISOString(),
      expiresAt: claimed.expiresAt,
    }
  }

  const tokens = await createAppTokenPair(event, claimed.userId, {
    deviceId: claimed.deviceId,
    grantType: claimed.grantType,
    deviceMeta: {
      deviceName: claimed.deviceName ?? null,
      platform: claimed.devicePlatform ?? null,
      clientType,
      reactivateRevoked: true,
    },
  })
  await logLoginAttempt(event, {
    userId: claimed.userId,
    deviceId: claimed.deviceId,
    success: true,
    reason: 'device_auth',
    clientType,
  })
  return {
    status: 'approved',
    ...tokens,
    grantType: claimed.grantType,
    refreshable: true,
    // The same profile `/api/v1/auth/me` returns, so the app can sign in without another round trip.
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role,
      locale: normalizeLocaleCode(user.locale),
      emailVerified: Boolean(user.emailVerified),
    },
  }
})
