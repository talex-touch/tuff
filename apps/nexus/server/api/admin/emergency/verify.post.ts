import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { createError, readBody } from 'h3'
import { useRuntimeConfig } from '#imports'
import {
  getAdminEmergencySession,
  hashIpValue,
  incrementEmergencySessionFailures,
  recordEmergencyAttempt,
  updateEmergencySessionVerified,
  verifyAndConsumeAdminRecoveryCode,
} from '../../../utils/adminEmergencyStore'
import { assertRiskControlEnabled } from '../../../utils/featureFlags'
import { enforceAdminRateLimit } from '../../../utils/adminRateLimitStore'
import { getPasskeyByCredentialId, getUserById, updatePasskeyCounter } from '../../../utils/authStore'
import { verifyAssertionResponse } from '../../../utils/webauthn'
import { resolveRequestIp } from '../../../utils/ipSecurityStore'

const RESPONSE_MIN_LATENCY_MS = 220

function decodeBase64Url(input: string): string {
  let normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4 !== 0)
    normalized += '='
  return Buffer.from(normalized, 'base64').toString('utf8')
}

function extractChallenge(credential: any): string {
  const clientDataJSON = credential?.response?.clientDataJSON
  if (!clientDataJSON || typeof clientDataJSON !== 'string')
    return ''
  try {
    const parsed = JSON.parse(decodeBase64Url(clientDataJSON))
    return typeof parsed?.challenge === 'string' ? parsed.challenge : ''
  }
  catch {
    return ''
  }
}

async function ensureMinLatency(startAt: number) {
  const elapsed = Date.now() - startAt
  if (elapsed >= RESPONSE_MIN_LATENCY_MS)
    return
  await new Promise(resolve => setTimeout(resolve, RESPONSE_MIN_LATENCY_MS - elapsed))
}

export default defineEventHandler(async (event) => {
  assertRiskControlEnabled(event)
  const runtimeConfig = useRuntimeConfig(event)
  if (runtimeConfig.adminControl?.breakglassEnabled === false || String(runtimeConfig.adminControl?.breakglassEnabled) === 'false') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin break-glass is disabled.',
    })
  }

  const startAt = Date.now()
  const body = await readBody<{
    session_id?: unknown
    passkey_assertion?: unknown
    recovery_code?: unknown
  }>(event)

  const sessionId = typeof body?.session_id === 'string' ? body.session_id.trim() : ''
  const credential = body?.passkey_assertion as any
  const recoveryCode = typeof body?.recovery_code === 'string' ? body.recovery_code.trim() : ''
  if (!sessionId || !credential?.id || !recoveryCode) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid emergency verify payload.',
    })
  }

  await enforceAdminRateLimit(event, {
    key: `admin-emergency-verify:session:${sessionId}`,
    limit: 5,
    windowMs: 10 * 60_000,
  })

  const session = await getAdminEmergencySession(event, sessionId)
  if (!session || session.status !== 'init') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Emergency session not available.',
    })
  }

  const now = Date.now()
  if (Date.parse(session.expiresAt) <= now) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Emergency session expired.',
    })
  }

  const ip = resolveRequestIp(event)
  const ipHash = ip ? hashIpValue(event, ip) : null
  const challenge = extractChallenge(credential)
  const origin = typeof runtimeConfig.auth?.origin === 'string' ? runtimeConfig.auth.origin.trim() : ''
  if (!origin) {
    throw createError({
      statusCode: 500,
      statusMessage: 'AUTH_ORIGIN missing.',
    })
  }

  const failAndThrow = async (): Promise<never> => {
    await incrementEmergencySessionFailures(event, sessionId)
    await recordEmergencyAttempt(event, {
      sessionId,
      ipHash,
      dfpHash: session.dfpHash,
      action: 'verify',
      success: false,
      reason: 'verification_failed',
    })
    await ensureMinLatency(startAt)
    throw createError({
      statusCode: 401,
      statusMessage: 'Emergency verification failed.',
    })
  }

  if (!challenge || challenge !== session.challenge)
    return await failAndThrow()

  const passkey = await getPasskeyByCredentialId(event, credential.id)
  if (!passkey)
    return await failAndThrow()

  const user = await getUserById(event, passkey.user_id as string)
  if (!user || user.status !== 'active' || user.role !== 'admin')
    return await failAndThrow()

  try {
    const verifyResult = await verifyAssertionResponse({
      authenticatorData: credential.response.authenticatorData,
      clientDataJSON: credential.response.clientDataJSON,
      signature: credential.response.signature,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRpId: new URL(origin).hostname,
      publicKeyJwk: JSON.parse(passkey.public_key as string),
      previousCounter: Number(passkey.counter ?? 0),
    })
    await updatePasskeyCounter(event, credential.id, verifyResult.counter)
  }
  catch {
    return await failAndThrow()
  }

  const recoveryVerified = await verifyAndConsumeAdminRecoveryCode(event, {
    adminId: user.id,
    recoveryCode,
  })
  if (!recoveryVerified)
    return await failAndThrow()

  const verifyNonce = randomUUID()
  await updateEmergencySessionVerified(event, {
    sessionId,
    adminId: user.id,
    verifyNonce,
  })
  await recordEmergencyAttempt(event, {
    sessionId,
    ipHash,
    dfpHash: session.dfpHash,
    action: 'verify',
    success: true,
    reason: 'verified',
  })

  await ensureMinLatency(startAt)

  return {
    verified: true,
    admin_id: user.id,
    verify_nonce: verifyNonce,
  }
})
