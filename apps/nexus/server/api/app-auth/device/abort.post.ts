import { createError, readBody } from 'h3'
import { cancelDeviceAuthRequestByDeviceCode, getDeviceAuthByDeviceCode, isDeviceAuthExpired } from '../../../utils/authStore'

interface AbortBody {
  deviceCode?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<AbortBody>(event)
  const deviceCode = typeof body?.deviceCode === 'string' ? body.deviceCode.trim() : ''
  if (!deviceCode) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing device code',
    })
  }

  const request = await getDeviceAuthByDeviceCode(event, deviceCode)
  if (!request || isDeviceAuthExpired(request)) {
    return {
      ok: false,
      status: 'expired',
    }
  }
  if (request.status !== 'pending') {
    return {
      ok: false,
      status: request.status,
    }
  }

  const cancelled = await cancelDeviceAuthRequestByDeviceCode(event, deviceCode)
  if (!cancelled) {
    return {
      ok: false,
      status: 'expired',
    }
  }

  return {
    ok: true,
    status: 'cancelled',
  }
})
