import { Buffer } from 'node:buffer'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import { requireSessionAuth } from '../../utils/auth'
import { createWebAuthnChallenge, getUserById } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const user = await getUserById(event, userId)
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  const origin = useRuntimeConfig().auth?.origin as string | undefined
  if (!origin) {
    throw createError({ statusCode: 500, statusMessage: 'AUTH_ORIGIN missing.' })
  }
  const rpId = new URL(origin).hostname
  const challenge = await createWebAuthnChallenge(event, { userId, type: 'register', ttlMs: 1000 * 60 * 5 })

  return {
    challenge,
    rp: {
      name: 'Tuff',
      id: rpId
    },
    user: {
      id: Buffer.from(user.id).toString('base64url'),
      name: user.email,
      displayName: user.name || user.email
    },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    attestation: 'none',
    timeout: 60000,
    authenticatorSelection: {
      userVerification: 'preferred'
    }
  }
})
