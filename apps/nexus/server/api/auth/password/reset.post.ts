import { createError, readBody } from 'h3'
import { consumePasswordResetToken, getUserById, setUserPassword } from '../../../utils/authStore'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!token || password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload.' })
  }

  const userId = await consumePasswordResetToken(event, token)
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid or expired token.' })
  }

  const user = await getUserById(event, userId)
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  await setUserPassword(event, userId, password)
  return { success: true }
})

