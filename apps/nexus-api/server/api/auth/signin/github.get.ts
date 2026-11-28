import { createError, defineEventHandler, getQuery, sendRedirect } from 'h3'
import {
  beginOAuthState,
  normalizeSafeCallbackUrl,
  resolveAuthBaseUrl,
  resolveAuthProviderConfig,
} from '../../../utils/authOAuth'

export default defineEventHandler(async (event) => {
  const { github } = resolveAuthProviderConfig(event)
  if (!github.clientId || !github.clientSecret) {
    throw createError({ statusCode: 503, statusMessage: 'GitHub OAuth is not configured.' })
  }

  const baseUrl = resolveAuthBaseUrl(event)
  const query = getQuery(event)
  const callbackUrl = normalizeSafeCallbackUrl(query.callbackUrl ?? query.redirect_url, baseUrl, '/dashboard')
  const { state } = await beginOAuthState(event, 'github', callbackUrl)

  const authorizeUrl = new URL('https://github.com/login/oauth/authorize')
  authorizeUrl.searchParams.set('client_id', github.clientId)
  authorizeUrl.searchParams.set('redirect_uri', `${baseUrl}/api/auth/callback/github`)
  authorizeUrl.searchParams.set('scope', 'read:user user:email')
  authorizeUrl.searchParams.set('state', state)

  return sendRedirect(event, authorizeUrl.toString(), 302)
})
