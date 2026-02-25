import { createError, getQuery } from 'h3'
import { requireSessionAuth } from '../../../utils/auth'
import { evaluateDeviceAuthLongTermPolicy, getDeviceAuthByUserCode, isDeviceAuthExpired, readRequestIp } from '../../../utils/authStore'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = typeof query.code === 'string' ? query.code.trim() : ''
  if (!code) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing user code',
    })
  }

  const request = await getDeviceAuthByUserCode(event, code)
  if (!request) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Authorization request not found',
    })
  }

  if (isDeviceAuthExpired(request)) {
    return { status: 'expired', expiresAt: request.expiresAt }
  }

  const { userId } = await requireSessionAuth(event)
  const policy = await evaluateDeviceAuthLongTermPolicy(event, userId, request.deviceId)
  const requestIp = request.requestIp
  const currentIp = readRequestIp(event)
  const ipMismatch = request.status === 'rejected'
    ? request.rejectReason === 'ip_mismatch'
    : Boolean(requestIp && currentIp && requestIp !== currentIp)

  return {
    status: request.status,
    grantType: request.grantType,
    deviceName: request.deviceName,
    devicePlatform: request.devicePlatform,
    expiresAt: request.expiresAt,
    longTermAllowed: policy.allowLongTerm,
    longTermReason: policy.reason,
    ipMismatch,
    rejectReason: request.rejectReason ?? null,
    rejectMessage: request.rejectMessage ?? null,
    requestIp: request.rejectRequestIp ?? requestIp ?? null,
    currentIp: request.rejectCurrentIp ?? currentIp ?? null,
  }
})
