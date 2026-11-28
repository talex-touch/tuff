import { createError, defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { createWebAuthnChallenge, getUserByEmail, listPasskeys } from '../../utils/authStore'
import { enforceRateLimit } from '../../utils/rateLimit'
import { hashIpForRateLimit, resolveRequestIp } from '../../utils/requestIp'

const PASSKEY_OPTIONS_RATE_LIMIT = { limit: 20, windowMs: 10 * 60_000 } as const

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const email = typeof query.email === 'string' ? query.email.trim().toLowerCase() : ''

  if (email) {
    const ip = resolveRequestIp(event)
    if (ip) {
      await enforceRateLimit(event, {
        key: `passkey-options:ip:${hashIpForRateLimit(ip)}`,
        ...PASSKEY_OPTIONS_RATE_LIMIT,
      })
    }
  }

  const user = email ? await getUserByEmail(event, email) : null
  if (email && (!user || user.status !== 'active')) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }
  const config = useRuntimeConfig(event) as { auth?: { origin?: string } }
  const origin = config.auth?.origin
  if (!origin) {
    throw createError({ statusCode: 500, statusMessage: 'AUTH_ORIGIN missing.' })
  }
  const rpId = new URL(origin).hostname
  const challenge = await createWebAuthnChallenge(event, {
    userId: user?.id ?? null,
    type: 'login',
    ttlMs: 1000 * 60 * 5,
  })
  const allowCredentials = user
    ? (await listPasskeys(event, user.id)).map(row => ({
        id: row.credential_id,
        type: 'public-key',
        transports: row.transports ? JSON.parse(row.transports as string) : undefined,
      }))
    : undefined
  return {
    challenge,
    rpId,
    timeout: 60000,
    userVerification: 'preferred',
    ...(user ? { allowCredentials } : {}),
  }
})
