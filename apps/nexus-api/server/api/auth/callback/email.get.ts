import { defineEventHandler, getQuery, sendRedirect } from 'h3'
import {
  buildSignInErrorRedirect,
  issueBrowserSessionForUser,
  normalizeSafeCallbackUrl,
  resolveAuthBaseUrl,
} from '../../../utils/authOAuth'
import {
  createUser,
  getUserByEmail,
  restorePendingDeletionIfWithinWindow,
  useVerificationToken,
} from '../../../utils/authStore'

export default defineEventHandler(async (event) => {
  const baseUrl = resolveAuthBaseUrl(event)
  const query = getQuery(event)
  const email = typeof query.email === 'string' ? query.email.trim().toLowerCase() : ''
  const token = typeof query.token === 'string' ? query.token.trim() : ''
  const callbackUrl = normalizeSafeCallbackUrl(query.callbackUrl, baseUrl, '/dashboard')

  if (!email || !token)
    return sendRedirect(event, buildSignInErrorRedirect(baseUrl, 'Verification'), 302)

  const verified = await useVerificationToken(event, email, token)
  if (!verified)
    return sendRedirect(event, buildSignInErrorRedirect(baseUrl, 'Verification'), 302)

  let user = await getUserByEmail(event, email)
  if (user) {
    user = await restorePendingDeletionIfWithinWindow(event, user.id)
    if (!user || user.status !== 'active')
      return sendRedirect(event, buildSignInErrorRedirect(baseUrl, 'AccessDenied'), 302)
  }
  else {
    user = await createUser(event, {
      email,
      name: null,
      emailVerified: new Date().toISOString(),
      emailState: 'verified',
    })
  }

  await issueBrowserSessionForUser(event, user, 'email')
  return sendRedirect(event, callbackUrl, 302)
})
