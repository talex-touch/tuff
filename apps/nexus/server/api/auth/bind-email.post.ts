import { createError, readBody } from 'h3'
import { createVerificationToken, getUserByEmail, getUserById, setEmailState, setUserEmail  } from '../../utils/authStore'
import { sendEmail } from '../../utils/email'
import { requireSessionAuth } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const body = await readBody(event)
  const skip = Boolean(body?.skip)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  const user = await getUserById(event, userId)
  if (!user || user.status !== 'active') {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  if (skip) {
    if (user.emailState !== 'missing') {
      throw createError({ statusCode: 400, statusMessage: 'Email already set.' })
    }
    await setEmailState(event, userId, 'missing')
    return { success: true, skipped: true }
  }

  if (!email || !email.includes('@')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email.' })
  }

  const existing = await getUserByEmail(event, email)
  if (existing && existing.id !== userId) {
    throw createError({ statusCode: 409, statusMessage: 'Email already registered.' })
  }

  await setUserEmail(event, userId, email, 'unverified', null)

  const token = await createVerificationToken(event, email, 1000 * 60 * 60 * 24)
  const origin = useRuntimeConfig().auth?.origin as string | undefined
  const verifyUrl = origin ? `${origin}/verify?email=${encodeURIComponent(email)}&token=${token}` : ''
  await sendEmail({
    to: email,
    subject: 'Verify your email',
    html: `<p>Click the link to verify your email:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
  })

  return { success: true }
})
