import { createError, getQuery } from 'h3'
import { requireSessionAuth } from '../../../utils/auth'
import { evaluateDeviceAuthLongTermPolicy, getDeviceAuthByUserCode, getUserById, isDeviceAuthExpired, readRequestIp } from '../../../utils/authStore'

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

  const { userId, sessionIssuedAt } = await requireSessionAuth(event)
  const [policy, user] = await Promise.all([
    evaluateDeviceAuthLongTermPolicy(event, userId, request.deviceId, { sessionIssuedAt }),
    getUserById(event, userId),
  ])
  const requestIp = request.requestIp
  const currentIp = readRequestIp(event)
  const rawIpMismatch = request.status === 'rejected'
    ? request.rejectReason === 'ip_mismatch'
    : Boolean(requestIp && currentIp && requestIp !== currentIp)
  const allowCliIpMismatch = request.clientType === 'cli' && Boolean(user?.allowCliIpMismatch)
  const ipMismatch = rawIpMismatch && !allowCliIpMismatch
  const ipMismatchWarning = rawIpMismatch && allowCliIpMismatch

  return {
    status: request.status,
    grantType: request.grantType,
    deviceName: request.deviceName,
    devicePlatform: request.devicePlatform,
    expiresAt: request.expiresAt,
    longTermAllowed: policy.allowLongTerm,
    longTermReason: policy.reason,
    longTermSessionFresh: policy.sessionFresh,
    longTermSessionWindowSeconds: policy.sessionWindowSeconds,
    ipMismatch,
    ipMismatchWarning,
    allowCliIpMismatch,
    rejectReason: request.rejectReason ?? null,
    rejectMessage: request.rejectMessage ?? null,
    requestIp: request.rejectRequestIp ?? requestIp ?? null,
    currentIp: request.rejectCurrentIp ?? currentIp ?? null,
  }
})
