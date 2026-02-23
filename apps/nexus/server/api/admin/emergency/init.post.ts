import { randomUUID } from 'node:crypto'
import { createError, readBody } from 'h3'
import { useRuntimeConfig } from '#imports'
import { getUserByEmail, getUserById } from '../../../utils/authStore'
import {
  createAdminEmergencySession,
  hashAdminHint,
  hashDeviceFingerprint,
  hashIpValue,
  recordEmergencyAttempt,
} from '../../../utils/adminEmergencyStore'
import { assertRiskControlEnabled } from '../../../utils/featureFlags'
import { enforceAdminRateLimit } from '../../../utils/adminRateLimitStore'
import { generateChallenge } from '../../../utils/webauthn'
import { resolveRequestIp } from '../../../utils/ipSecurityStore'

const SESSION_TTL_MS = 10 * 60_000
const RESPONSE_MIN_LATENCY_MS = 180

function normalizeHint(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

async function resolveAdminId(event: any, adminHint: string): Promise<string | null> {
  if (!adminHint)
    return null

  if (adminHint.includes('@')) {
    const user = await getUserByEmail(event, adminHint.toLowerCase())
    if (user?.status === 'active' && user.role === 'admin')
      return user.id
    return null
  }

  const user = await getUserById(event, adminHint)
  if (user?.status === 'active' && user.role === 'admin')
    return user.id
  return null
}

async function ensureMinLatency(startAt: number) {
  const elapsed = Date.now() - startAt
  if (elapsed >= RESPONSE_MIN_LATENCY_MS)
    return
  await new Promise(resolve => setTimeout(resolve, RESPONSE_MIN_LATENCY_MS - elapsed))
}

export default defineEventHandler(async (event) => {
  assertRiskControlEnabled(event)
  const config = useRuntimeConfig(event)
  if (config.adminControl?.breakglassEnabled === false || String(config.adminControl?.breakglassEnabled) === 'false') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin break-glass is disabled.',
    })
  }

  const startAt = Date.now()
  const body = await readBody<{
    admin_hint?: unknown
    device_fingerprint?: unknown
    client_nonce?: unknown
  }>(event)

  const adminHint = normalizeHint(body?.admin_hint).toLowerCase()
  const deviceFingerprint = normalizeHint(body?.device_fingerprint)
  const clientNonce = normalizeHint(body?.client_nonce)
  if (!deviceFingerprint || !clientNonce) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid emergency init payload.',
    })
  }

  const ip = resolveRequestIp(event)
  const dfpHash = hashDeviceFingerprint(event, deviceFingerprint)
  if (ip) {
    await enforceAdminRateLimit(event, {
      key: `admin-emergency-init:ip:${hashIpValue(event, ip)}`,
      limit: 5,
      windowMs: 10 * 60_000,
    })
  }

  let adminHintHash: string | null = null
  if (adminHint) {
    adminHintHash = hashAdminHint(event, adminHint)
    await enforceAdminRateLimit(event, {
      key: `admin-emergency-init:hint:${adminHintHash}`,
      limit: 3,
      windowMs: 10 * 60_000,
    })
  }

  await enforceAdminRateLimit(event, {
    key: `admin-emergency-init:dfp:${dfpHash}`,
    limit: 5,
    windowMs: 10 * 60_000,
  })

  const adminId = await resolveAdminId(event, adminHint)
  const sessionId = randomUUID()
  const challenge = generateChallenge()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  await createAdminEmergencySession(event, {
    sessionId,
    adminId,
    dfpHash,
    challenge,
    expiresAt,
  })

  await recordEmergencyAttempt(event, {
    sessionId,
    ipHash: ip ? hashIpValue(event, ip) : null,
    adminHintHash,
    dfpHash,
    action: 'init',
    success: true,
    reason: 'created',
  })

  await ensureMinLatency(startAt)

  return {
    session_id: sessionId,
    webauthn_challenge: challenge,
    expires_at: expiresAt,
  }
})
