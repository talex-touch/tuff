import { createError, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { createWebAuthnChallenge, getUserByEmail, listPasskeys } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const email = typeof query.email === 'string' ? query.email.trim().toLowerCase() : ''
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
