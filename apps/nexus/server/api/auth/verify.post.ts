import { createError, readBody } from 'h3'
import {
  commitVerifiedPendingEmail,
  getUserByEmail,
  getUserById,
  setEmailVerified,
  useVerificationToken,
} from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const token = typeof body?.token === 'string' ? body.token.trim() : ''

  if (!email || !token) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload.' })
  }

  const verification = await useVerificationToken(event, email, token)
  if (!verification) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid or expired token.' })
  }

  if (verification.userId) {
    const user = await getUserById(event, verification.userId)
    if (!user || user.status !== 'active') {
      throw createError({ statusCode: 404, statusMessage: 'User not found.' })
    }
    if (user.pendingEmail !== email && user.email !== email) {
      throw createError({ statusCode: 400, statusMessage: 'Verification request is no longer current.' })
    }
    const committed = await commitVerifiedPendingEmail(event, user.id, email)
    if (!committed) {
      throw createError({ statusCode: 409, statusMessage: 'Email already registered.' })
    }
    return { success: true }
  }

  const user = await getUserByEmail(event, email)
  if (!user || user.status !== 'active') {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  await setEmailVerified(event, user.id)
  return { success: true }
})
