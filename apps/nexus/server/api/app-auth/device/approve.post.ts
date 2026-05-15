import { createError, readBody } from 'h3'
import { requireSessionAuth } from '../../../utils/auth'
import { approveDeviceAuthRequest, evaluateDeviceAuthLongTermPolicy, evaluateDeviceAuthRateLimit, getDeviceAuthByUserCode, getUserById, isDeviceAuthExpired, readRequestIp, recordDeviceAuthAudit, rejectDeviceAuthRequest } from '../../../utils/authStore'

interface ApproveBody {
  code?: string
  grantType?: string
}

export default defineEventHandler(async (event) => {
  const { userId, sessionIssuedAt } = await requireSessionAuth(event)
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

  const rateLimit = await evaluateDeviceAuthRateLimit(event, { deviceId: request.deviceId, userId })
  if (!rateLimit.allowed) {
    await rejectDeviceAuthRequest(event, code, {
      reason: rateLimit.reason === 'cooldown' ? 'cooldown' : 'rate_limited',
      message: rateLimit.reason === 'cooldown'
        ? 'Device authorization is temporarily cooled down'
        : 'Device authorization rate limit exceeded',
      requestIp: request.requestIp ?? null,
      currentIp: readRequestIp(event),
    })
    await recordDeviceAuthAudit(event, {
      action: 'reject',
      status: 'blocked',
      userId,
      deviceId: request.deviceId,
      deviceCode: request.deviceCode,
      userCode: request.userCode,
      clientType: request.clientType ?? null,
      actorUserId: userId,
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

  const requestIp = request.requestIp
  const currentIp = readRequestIp(event)
  const ipMismatch = Boolean(requestIp && currentIp && requestIp !== currentIp)
  const user = ipMismatch ? await getUserById(event, userId) : null
  const allowCliIpMismatch = request.clientType === 'cli' && Boolean(user?.allowCliIpMismatch)
  if (ipMismatch && !allowCliIpMismatch) {
    await rejectDeviceAuthRequest(event, code, {
      reason: 'ip_mismatch',
      message: 'Device authorization IP mismatch',
      requestIp,
      currentIp,
    })
    await recordDeviceAuthAudit(event, {
      action: 'reject',
      status: 'blocked',
      userId,
      deviceId: request.deviceId,
      deviceCode: request.deviceCode,
      userCode: request.userCode,
      clientType: request.clientType ?? null,
      actorUserId: userId,
      reason: 'ip_mismatch',
      metadata: {
        requestIp,
        currentIp,
      },
    })
    throw createError({
      statusCode: 403,
      statusMessage: 'Device authorization IP mismatch',
    })
  }

  if (grantType === 'long') {
    const policy = await evaluateDeviceAuthLongTermPolicy(event, userId, request.deviceId, { sessionIssuedAt })
    if (!policy.allowLongTerm) {
      await recordDeviceAuthAudit(event, {
        action: 'reject',
        status: 'blocked',
        userId,
        deviceId: request.deviceId,
        deviceCode: request.deviceCode,
        userCode: request.userCode,
        clientType: request.clientType ?? null,
        actorUserId: userId,
        reason: 'long_term_not_allowed',
        metadata: {
          deviceTrusted: policy.deviceTrusted,
          locationTrusted: policy.locationTrusted,
          sessionFresh: policy.sessionFresh,
          sessionWindowSeconds: policy.sessionWindowSeconds,
          policyReason: policy.reason,
        },
      })
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

  await recordDeviceAuthAudit(event, {
    action: 'approve',
    status: 'success',
    userId,
    deviceId: approved.deviceId,
    deviceCode: approved.deviceCode,
    userCode: approved.userCode,
    clientType: approved.clientType ?? null,
    actorUserId: userId,
    reason: grantType,
    metadata: {
      grantType,
      ipMismatchAllowed: ipMismatch && allowCliIpMismatch,
      requestIp: ipMismatch && allowCliIpMismatch ? requestIp : undefined,
      currentIp: ipMismatch && allowCliIpMismatch ? currentIp : undefined,
    },
  })

  return { ok: true }
})
