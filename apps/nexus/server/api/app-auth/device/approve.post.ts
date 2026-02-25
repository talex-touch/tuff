import { createError, readBody } from 'h3'
import { requireSessionAuth } from '../../../utils/auth'
import { approveDeviceAuthRequest, evaluateDeviceAuthLongTermPolicy, getDeviceAuthByUserCode, isDeviceAuthExpired, readRequestIp, rejectDeviceAuthRequest } from '../../../utils/authStore'

interface ApproveBody {
  code?: string
  grantType?: string
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const body = await readBody<ApproveBody>(event)
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  const grantType = body?.grantType === 'long' ? 'long' : 'short'
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

  const requestIp = request.requestIp
  const currentIp = readRequestIp(event)
  if (requestIp && currentIp && requestIp !== currentIp) {
    await rejectDeviceAuthRequest(event, code, {
      reason: 'ip_mismatch',
      message: 'Device authorization IP mismatch',
      requestIp,
      currentIp,
    })
    throw createError({
      statusCode: 403,
      statusMessage: 'Device authorization IP mismatch',
    })
  }

  if (grantType === 'long') {
    const policy = await evaluateDeviceAuthLongTermPolicy(event, userId, request.deviceId)
    if (!policy.allowLongTerm) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Long-term authorization is not allowed on untrusted device or location',
      })
    }
  }

  const approved = await approveDeviceAuthRequest(event, code, userId, grantType)
  if (!approved) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Device authorization already processed',
    })
  }

  return { ok: true }
})
