import { createError, getRequestURL, readBody } from 'h3'
import { createDeviceAuthRequest } from '../../../utils/authStore'

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

  const request = await createDeviceAuthRequest(event, {
    deviceId,
    deviceName,
    devicePlatform,
    clientType: clientType === 'app' || clientType === 'cli' || clientType === 'external' ? clientType : 'external',
    ttlMs: DEVICE_AUTH_TTL_MS,
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
