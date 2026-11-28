import { createError, readBody } from 'h3'
import { useRuntimeConfig } from '#imports'
import { enforceAdminRateLimit } from '../../utils/adminRateLimitStore'
import { createVerificationToken, getUserByEmail, getUserById, readRequestIp, setEmailState, setPendingUserEmail } from '../../utils/authStore'
import { sendEmail } from '../../utils/email'
import { requireSessionAuth } from '../../utils/auth'

const BIND_EMAIL_USER_LIMIT = { limit: 5, windowMs: 10 * 60_000, blockMs: 10 * 60_000 } as const
const BIND_EMAIL_IP_LIMIT = { limit: 10, windowMs: 10 * 60_000, blockMs: 10 * 60_000 } as const
const BIND_EMAIL_TARGET_LIMIT = { limit: 3, windowMs: 15 * 60_000, blockMs: 15 * 60_000 } as const

export default defineEventHandler(async (event) => {
  const auth = await requireSessionAuth(event)
  const { userId } = auth
  const body = await readBody(event)
  const skip = Boolean(body?.skip)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  const user = auth.user ?? await getUserById(event, userId)
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

  if (!email || !email.includes('@') || email.length > 320) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email.' })
  }

  await enforceAdminRateLimit(event, {
    key: `auth:bind-email:user:${userId}`,
    ...BIND_EMAIL_USER_LIMIT,
  })
  const requestIp = readRequestIp(event)
  if (requestIp) {
    await enforceAdminRateLimit(event, {
      key: `auth:bind-email:ip:${requestIp}`,
      ...BIND_EMAIL_IP_LIMIT,
    })
  }
  await enforceAdminRateLimit(event, {
    key: `auth:bind-email:target:${email}`,
    ...BIND_EMAIL_TARGET_LIMIT,
  })

  const existing = await getUserByEmail(event, email)
  if (existing && existing.id !== userId && existing.emailState === 'verified') {
    throw createError({ statusCode: 409, statusMessage: 'Email already registered.' })
  }

  // Keep `auth_users.email` untouched until mailbox ownership is verified through `/api/auth/verify`.
  // Storing the candidate in `pending_email` prevents pre-registration takeover and 409 denial of
  // service against the real mailbox owner.
  await setPendingUserEmail(event, userId, email)

  const token = await createVerificationToken(event, email, 1000 * 60 * 60 * 24, undefined, userId)
  const origin = useRuntimeConfig(event).auth?.origin as string | undefined
  const verifyUrl = origin ? `${origin}/verify?email=${encodeURIComponent(email)}&token=${token}` : ''
  await sendEmail({
    to: email,
    subject: 'Verify your email',
    html: `<p>Click the link to verify your email:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
    action: 'auth.email.bind.verify',
    resourceType: 'auth_user',
    resourceId: userId,
  }, event)

  return { success: true }
})
