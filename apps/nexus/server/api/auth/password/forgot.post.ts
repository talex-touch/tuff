import { createError, readBody } from 'h3'
import { useRuntimeConfig } from '#imports'
import { createPasswordResetToken, getUserByEmail } from '../../../utils/authStore'
import { sendEmail } from '../../../utils/email'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email.' })
  }

  const user = await getUserByEmail(event, email)
  if (user && user.status === 'active') {
    const token = await createPasswordResetToken(event, user.id, 1000 * 60 * 30)
    const origin = useRuntimeConfig().auth?.origin as string | undefined
    const resetUrl = origin ? `${origin}/reset-password?email=${encodeURIComponent(email)}&token=${token}` : ''
    await sendEmail({
      to: email,
      subject: 'Reset your password',
      html: `<p>Click the link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
    })
  }

  return { success: true }
})
