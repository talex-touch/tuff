import { createError, getQuery } from 'h3'
import { getUserByEmail } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const email = typeof query.email === 'string' ? query.email.trim().toLowerCase() : ''
  if (!email || !email.includes('@')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email.' })
  }

  const user = await getUserByEmail(event, email)
  return {
    exists: Boolean(user),
    status: user?.status ?? 'active',
  }
})
