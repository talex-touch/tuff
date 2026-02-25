import { createError, readBody } from 'h3'
import { isDeviceAuthExpired, updateDeviceAuthBrowserState } from '../../../utils/authStore'

interface PresenceBody {
  code?: string
  state?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<PresenceBody>(event)
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  const state = typeof body?.state === 'string' ? body.state.trim().toLowerCase() : ''
  if (!code) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing user code',
    })
  }
  if (state !== 'opened' && state !== 'heartbeat' && state !== 'closed') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid presence state',
    })
  }

  const request = await updateDeviceAuthBrowserState(event, code, state)
  if (!request || isDeviceAuthExpired(request)) {
    return {
      ok: false,
      status: 'expired',
    }
  }

  return {
    ok: true,
    status: request.status,
    browserState: request.browserState ?? 'unknown',
    expiresAt: request.expiresAt,
  }
})
