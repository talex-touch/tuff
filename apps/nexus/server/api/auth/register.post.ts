import { createError, readBody } from 'h3'
import { useRuntimeConfig } from '#imports'
import { createUser, createVerificationToken, getUserByEmail, setUserPassword } from '../../utils/authStore'
import { ensurePersonalTeam } from '../../utils/creditsStore'
import { sendEmail } from '../../utils/email'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : null

  if (!email || !email.includes('@')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email.' })
  }
  if (password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Password too short.' })
  }

  const existing = await getUserByEmail(event, email)
  if (existing) {
    throw createError({ statusCode: 400, statusMessage: 'Email already registered.' })
  }

  const user = await createUser(event, { email, name })
  await setUserPassword(event, user.id, password)
  await ensurePersonalTeam(event, user.id)

  const token = await createVerificationToken(event, email, 1000 * 60 * 60 * 24)
  const origin = useRuntimeConfig().auth?.origin as string | undefined
  const verifyUrl = origin ? `${origin}/verify?email=${encodeURIComponent(email)}&token=${token}` : ''
  await sendEmail({
    to: email,
    subject: 'Verify your email',
    html: `<p>Click the link to verify your email:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`
  })

  return { success: true }
})
