import { createError, readBody } from 'h3'
import { requireSessionAuth } from '../../../utils/auth'
import { cancelDeviceAuthRequest, getDeviceAuthByUserCode, isDeviceAuthExpired, recordDeviceAuthAudit } from '../../../utils/authStore'

interface CancelBody {
  code?: string
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const body = await readBody<CancelBody>(event)
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  if (!code) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing user code',
    })
  }

  const request = await getDeviceAuthByUserCode(event, code)
  if (!request || isDeviceAuthExpired(request)) {
    throw createError({
      statusCode: 410,
      statusMessage: 'Device authorization expired',
    })
  }

  if (request.status !== 'pending') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Device authorization already processed',
    })
  }

  const cancelled = await cancelDeviceAuthRequest(event, code)
  if (!cancelled) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Device authorization already processed',
    })
  }

  await recordDeviceAuthAudit(event, {
    action: 'cancel',
    status: 'success',
    userId,
    deviceId: cancelled.deviceId,
    deviceCode: cancelled.deviceCode,
    userCode: cancelled.userCode,
    clientType: cancelled.clientType ?? null,
    actorUserId: userId,
    reason: 'user_cancelled',
  })

  return { ok: true }
})
