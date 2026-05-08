import { createError, getRequestURL, readBody } from 'h3'
import { createDeviceAuthRequest, evaluateDeviceAuthRateLimit, recordDeviceAuthAudit } from '../../../utils/authStore'

interface StartBody {
  deviceId?: string
  deviceName?: string
  devicePlatform?: string
  clientType?: string
}

const DEVICE_AUTH_TTL_MS = 2 * 60 * 1000
const POLL_INTERVAL_SECONDS = 3

export default defineEventHandler(async (event) => {
  const body = await readBody<StartBody>(event)
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : ''
  if (!deviceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing device id',
    })
  }

  const deviceName = typeof body?.deviceName === 'string' ? body.deviceName.trim() : undefined
  const devicePlatform = typeof body?.devicePlatform === 'string' ? body.devicePlatform.trim() : undefined
  const clientType = typeof body?.clientType === 'string' ? body.clientType.trim() : undefined
  const normalizedClientType = clientType === 'app' || clientType === 'cli' || clientType === 'external' ? clientType : 'external'

  const rateLimit = await evaluateDeviceAuthRateLimit(event, { deviceId })
  if (!rateLimit.allowed) {
    await recordDeviceAuthAudit(event, {
      action: 'request',
      status: 'blocked',
      deviceId,
      clientType: normalizedClientType,
      reason: rateLimit.reason ?? 'rate_limited',
      metadata: {
        scope: rateLimit.scope,
        limit: rateLimit.limit,
        count: rateLimit.count,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    })
    throw createError({
      statusCode: 429,
      statusMessage: rateLimit.reason === 'cooldown'
        ? 'Device authorization is temporarily cooled down'
        : 'Device authorization rate limit exceeded',
      data: {
        reason: rateLimit.reason,
        scope: rateLimit.scope,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    })
  }

  const request = await createDeviceAuthRequest(event, {
    deviceId,
    deviceName,
    devicePlatform,
    clientType: normalizedClientType,
    ttlMs: DEVICE_AUTH_TTL_MS,
  })

  await recordDeviceAuthAudit(event, {
    action: 'request',
    status: 'success',
    deviceId,
    deviceCode: request.deviceCode,
    userCode: request.userCode,
    clientType: normalizedClientType,
    metadata: {
      devicePlatform: devicePlatform ?? null,
      ttlMs: DEVICE_AUTH_TTL_MS,
    },
  })

  const origin = getRequestURL(event).origin
  const redirectTarget = `/device-auth?code=${request.userCode}`
  const authorizeParams = new URLSearchParams({
    redirect_url: redirectTarget,
  })
  const authorizeUrl = `${origin}/sign-in?${authorizeParams.toString()}`

  return {
    deviceCode: request.deviceCode,
    userCode: request.userCode,
    authorizeUrl,
    expiresAt: request.expiresAt,
    intervalSeconds: POLL_INTERVAL_SECONDS,
  }
})
