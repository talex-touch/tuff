import { createError, getQuery } from 'h3'
import { hashIpValue } from '../../utils/adminEmergencyStore'
import { enforceAdminRateLimit } from '../../utils/adminRateLimitStore'
import { resolveRequestIp } from '../../utils/ipSecurityStore'
import { getUserByEmail } from '../../utils/authStore'

/**
 * This endpoint answers "is this address registered, and what is its status" to anyone, which
 * is exactly an account-existence oracle: scripted over a breach list it confirms which
 * addresses have accounts here and which are disabled or pending deletion (#921).
 *
 * It cannot require auth -- the sign-in flow calls it before the user is authenticated
 * (app/composables/useSignIn.ts) to decide whether to show sign-in or sign-up. So the answer is
 * to make enumeration expensive rather than to remove it: a person types a handful of addresses
 * while signing in, a scripted sweep does thousands.
 */
const EMAIL_STATUS_RATE_LIMIT = { limit: 20, windowMs: 10 * 60_000 } as const

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const email = typeof query.email === 'string' ? query.email.trim().toLowerCase() : ''
  if (!email || !email.includes('@')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email.' })
  }

  // Before the lookup: a throttled caller must learn nothing.
  const ip = resolveRequestIp(event)
  if (ip) {
    await enforceAdminRateLimit(event, {
      key: `auth-email-status:ip:${hashIpValue(event, ip)}`,
      ...EMAIL_STATUS_RATE_LIMIT,
    })
  }

  const user = await getUserByEmail(event, email)
  return {
    exists: Boolean(user),
    status: user?.status ?? 'active',
  }
})
