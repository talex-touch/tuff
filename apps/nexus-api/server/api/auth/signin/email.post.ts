import { createError, defineEventHandler, readBody } from 'h3'
import { normalizeSafeCallbackUrl, resolveAuthBaseUrl } from '../../../utils/authOAuth'
import { createVerificationToken, getUserByEmail } from '../../../utils/authStore'
import { sendEmail } from '../../../utils/email'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string, callbackUrl?: string }>(event).catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid email is required.' })
  }

  const existing = await getUserByEmail(event, email)
  if (existing && existing.status !== 'active' && existing.status !== 'deletion_pending') {
    throw createError({ statusCode: 403, statusMessage: 'Account disabled.' })
  }

  const baseUrl = resolveAuthBaseUrl(event)
  const callbackUrl = normalizeSafeCallbackUrl(body?.callbackUrl, baseUrl, '/dashboard')
  const token = await createVerificationToken(event, email, 24 * 60 * 60 * 1000)

  const magicUrl = new URL('/api/auth/callback/email', baseUrl)
  magicUrl.searchParams.set('email', email)
  magicUrl.searchParams.set('token', token)
  magicUrl.searchParams.set('callbackUrl', callbackUrl)

  await sendEmail(
    {
      to: email,
      subject: 'Sign in to Tuff',
      html: `<p>Click the link to sign in:</p><p><a href="${magicUrl.toString()}">${magicUrl.toString()}</a></p>`,
      action: 'auth.email.magic_link',
      resourceType: 'auth_session',
    },
    event,
  )

  return {
    ok: true,
    url: `${baseUrl}/verify-waiting`,
  }
})
