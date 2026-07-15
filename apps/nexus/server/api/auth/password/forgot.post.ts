import { createError, readBody } from 'h3'
import { useRuntimeConfig } from '#imports'
import { createPasswordResetToken, getUserByEmail, hasRecentPasswordResetToken } from '../../../utils/authStore'
import { sendEmail } from '../../../utils/email'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email.' })
  }

  const user = await getUserByEmail(event, email)
  if (user && user.status === 'active') {
    // Per-user cooldown: at most one reset email per window. Without this the
    // unauthenticated endpoint can be used to flood a victim's inbox.
    const recentlySent = await hasRecentPasswordResetToken(event, user.id, 1000 * 60 * 2)
    if (!recentlySent) {
      const token = await createPasswordResetToken(event, user.id, 1000 * 60 * 30)
      const origin = useRuntimeConfig(event).auth?.origin as string | undefined
      const resetUrl = origin ? `${origin}/reset-password?email=${encodeURIComponent(email)}&token=${token}` : ''
      await sendEmail({
        to: email,
        subject: 'Reset your password',
        html: `<p>Click the link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
        action: 'auth.password.reset',
        resourceType: 'auth_user',
        resourceId: user.id,
      }, event)
    }
  }

  return { success: true }
})
