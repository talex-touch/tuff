import { createError, readBody } from 'h3'
import { getUserByEmail, setEmailVerified, useVerificationToken } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const token = typeof body?.token === 'string' ? body.token.trim() : ''

  if (!email || !token) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload.' })
  }

  const user = await getUserByEmail(event, email)
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  const verification = await useVerificationToken(event, email, token)
  if (!verification) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid or expired token.' })
  }

  await setEmailVerified(event, user.id)
  return { success: true }
})

