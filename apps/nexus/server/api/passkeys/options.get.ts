import { createError, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { hashIpValue } from '../../utils/adminEmergencyStore'
import { enforceAdminRateLimit } from '../../utils/adminRateLimitStore'
import { resolveRequestIp } from '../../utils/ipSecurityStore'
import { createWebAuthnChallenge, getUserByEmail, listPasskeys } from '../../utils/authStore'

/**
 * Same account-existence oracle as /api/auth/email-status: passing an email returns 404 when no
 * active account has it, so this is enumerable too (#921 names both). Also pre-auth by nature,
 * so it gets the same throttle rather than a guard.
 */
const PASSKEY_OPTIONS_RATE_LIMIT = { limit: 20, windowMs: 10 * 60_000 } as const

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const email = typeof query.email === 'string' ? query.email.trim().toLowerCase() : ''

  // Only the email-carrying form is an oracle; an anonymous discovery call reveals nothing.
  if (email) {
    const ip = resolveRequestIp(event)
    if (ip) {
      await enforceAdminRateLimit(event, {
        key: `passkey-options:ip:${hashIpValue(event, ip)}`,
        ...PASSKEY_OPTIONS_RATE_LIMIT,
      })
    }
  }

  const user = email ? await getUserByEmail(event, email) : null
  if (email && (!user || user.status !== 'active')) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }
  const origin = useRuntimeConfig().auth?.origin as string | undefined
  if (!origin) {
    throw createError({ statusCode: 500, statusMessage: 'AUTH_ORIGIN missing.' })
  }
  const rpId = new URL(origin).hostname
  const challenge = await createWebAuthnChallenge(event, {
    userId: user?.id ?? null,
    type: 'login',
    ttlMs: 1000 * 60 * 5
  })
  const allowCredentials = user
    ? (await listPasskeys(event, user.id)).map(row => ({
        id: row.credential_id,
        type: 'public-key',
        transports: row.transports ? JSON.parse(row.transports as string) : undefined
      }))
    : undefined
  return {
    challenge,
    rpId,
    timeout: 60000,
    userVerification: 'preferred',
    ...(user ? { allowCredentials } : {})
  }
})
