import { randomUUID } from 'node:crypto'
import { createError, readBody } from 'h3'
import { useRuntimeConfig } from '#imports'
import {
  consumeEmergencyVerifyNonce,
  createEmergencyJti,
  hashIpValue,
  recordEmergencyAttempt,
} from '../../../utils/adminEmergencyStore'
import type { AdminRiskScope } from '../../../utils/adminEmergencyToken'
import { signAdminEmergencyToken } from '../../../utils/adminEmergencyToken'
import { enforceAdminRateLimit } from '../../../utils/adminRateLimitStore'
import { getUserById } from '../../../utils/authStore'
import { resolveRequestIp } from '../../../utils/ipSecurityStore'

const TOKEN_TTL_SECONDS = 10 * 60
const ALLOWED_SCOPE: AdminRiskScope[] = [
  'risk.mode.override',
  'risk.actor.unblock',
  'risk.case.review',
]

function normalizeScopes(value: unknown): AdminRiskScope[] {
  if (!Array.isArray(value))
    return []
  const set = new Set<AdminRiskScope>()
  for (const item of value) {
    if (typeof item !== 'string')
      continue
    const scope = item.trim() as AdminRiskScope
    if (ALLOWED_SCOPE.includes(scope))
      set.add(scope)
  }
  return Array.from(set)
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (config.adminControl?.breakglassEnabled === false || String(config.adminControl?.breakglassEnabled) === 'false') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin break-glass is disabled.',
    })
  }

  const body = await readBody<{
    session_id?: unknown
    verify_nonce?: unknown
    scope_request?: unknown
  }>(event)
  const sessionId = typeof body?.session_id === 'string' ? body.session_id.trim() : ''
  const verifyNonce = typeof body?.verify_nonce === 'string' ? body.verify_nonce.trim() : ''
  const scopeRequest = normalizeScopes(body?.scope_request)
  if (!sessionId || !verifyNonce || scopeRequest.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid emergency issue payload.',
    })
  }

  await enforceAdminRateLimit(event, {
    key: `admin-emergency-issue:session:${sessionId}`,
    limit: 20,
    windowMs: 10 * 60_000,
  })

  const consumed = await consumeEmergencyVerifyNonce(event, sessionId, verifyNonce)
  if (!consumed.ok) {
    if (consumed.reason === 'mismatch') {
      throw createError({
        statusCode: 401,
        statusMessage: 'Emergency session verification mismatch.',
      })
    }
    throw createError({
      statusCode: 400,
      statusMessage: consumed.reason === 'expired'
        ? 'Emergency session expired.'
        : 'Emergency session not verified.',
    })
  }
  const { session } = consumed

  const adminUser = session.adminId ? await getUserById(event, session.adminId) : null
  if (!adminUser || adminUser.status !== 'active' || adminUser.role !== 'admin') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin account is no longer active.',
    })
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  const expiresAt = new Date((nowSeconds + TOKEN_TTL_SECONDS) * 1000).toISOString()
  const jti = randomUUID()
  const issuerVersion = typeof config.adminControl?.emergencyIssuerVersion === 'string'
    ? config.adminControl.emergencyIssuerVersion.trim()
    : 'v1'

  const token = signAdminEmergencyToken(event, {
    admin_id: adminUser.id,
    scope: scopeRequest,
    dfp_hash: session.dfpHash,
    nonce: randomUUID(),
    iv: issuerVersion || 'v1',
    jti,
    exp: nowSeconds + TOKEN_TTL_SECONDS,
  })

  await createEmergencyJti(event, {
    jti,
    sessionId,
    scope: JSON.stringify(scopeRequest),
    expiresAt,
  })

  const ip = resolveRequestIp(event)
  await recordEmergencyAttempt(event, {
    sessionId,
    ipHash: ip ? hashIpValue(event, ip) : null,
    dfpHash: session.dfpHash,
    action: 'issue',
    success: true,
    reason: 'issued',
  })

  return {
    admin_emergency_token: token,
    expires_at: expiresAt,
    scope: scopeRequest,
  }
})
