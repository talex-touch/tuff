import { createError, defineEventHandler, readBody } from 'h3'
import { issueBrowserSessionForUser, normalizeSafeCallbackUrl, resolveAuthBaseUrl } from '../../../utils/authOAuth'
import { consumeLoginToken, logLoginAttempt, restorePendingDeletionIfWithinWindow } from '../../../utils/authStore'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ loginToken?: string, callbackUrl?: string }>(event).catch(() => null)
  const loginToken = typeof body?.loginToken === 'string' ? body.loginToken.trim() : ''
  const baseUrl = resolveAuthBaseUrl(event)

  if (!loginToken) {
    await logLoginAttempt(event, {
      userId: null,
      deviceId: null,
      success: false,
      reason: 'login_token_missing',
      clientType: 'web',
    }).catch(() => {})
    throw createError({ statusCode: 401, statusMessage: 'Login token is required.' })
  }

  const user = await consumeLoginToken(event, loginToken)
  if (!user) {
    await logLoginAttempt(event, {
      userId: null,
      deviceId: null,
      success: false,
      reason: 'login_token_invalid',
      clientType: 'web',
    }).catch(() => {})
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired login token.' })
  }

  const activeUser = await restorePendingDeletionIfWithinWindow(event, user.id)
  if (!activeUser || activeUser.status !== 'active') {
    throw createError({ statusCode: 403, statusMessage: 'Account disabled.' })
  }

  await issueBrowserSessionForUser(event, activeUser, 'credentials')
  const url = normalizeSafeCallbackUrl(body?.callbackUrl, baseUrl, '/dashboard')

  return {
    ok: true,
    url,
    user: {
      id: activeUser.id,
      email: activeUser.email,
      name: activeUser.name,
      image: activeUser.image,
      role: activeUser.role,
    },
  }
})
