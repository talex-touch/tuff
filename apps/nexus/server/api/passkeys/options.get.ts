import { createError, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { createWebAuthnChallenge, getUserByEmail, listPasskeys } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const email = typeof query.email === 'string' ? query.email.trim().toLowerCase() : ''
  if (!email) {
    throw createError({ statusCode: 400, statusMessage: 'Email required.' })
  }
  const user = await getUserByEmail(event, email)
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }
  const origin = useRuntimeConfig().auth?.origin as string | undefined
  if (!origin) {
    throw createError({ statusCode: 500, statusMessage: 'AUTH_ORIGIN missing.' })
  }
  const rpId = new URL(origin).hostname
  const challenge = await createWebAuthnChallenge(event, { userId: user.id, type: 'login', ttlMs: 1000 * 60 * 5 })
  const passkeys = await listPasskeys(event, user.id)
  const allowCredentials = passkeys.map(row => ({
    id: row.credential_id,
    type: 'public-key',
    transports: row.transports ? JSON.parse(row.transports as string) : undefined
  }))
  return {
    challenge,
    rpId,
    allowCredentials,
    timeout: 60000,
    userVerification: 'preferred'
  }
})

