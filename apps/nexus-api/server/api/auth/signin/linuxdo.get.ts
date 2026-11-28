import { createError, defineEventHandler, getQuery, sendRedirect } from 'h3'
import {
  beginOAuthState,
  normalizeSafeCallbackUrl,
  resolveAuthBaseUrl,
  resolveAuthProviderConfig,
} from '../../../utils/authOAuth'

export default defineEventHandler(async (event) => {
  const { linuxdo } = resolveAuthProviderConfig(event)
  if (!linuxdo.clientId || !linuxdo.clientSecret) {
    throw createError({ statusCode: 503, statusMessage: 'LinuxDO OAuth is not configured.' })
  }

  const baseUrl = resolveAuthBaseUrl(event)
  const query = getQuery(event)
  const callbackUrl = normalizeSafeCallbackUrl(query.callbackUrl ?? query.redirect_url, baseUrl, '/dashboard')
  const { state, codeChallenge } = await beginOAuthState(event, 'linuxdo', callbackUrl)

  const authorizeUrl = new URL(`${linuxdo.issuer}/oauth2/authorize`)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', linuxdo.clientId)
  authorizeUrl.searchParams.set('redirect_uri', `${baseUrl}/api/auth/callback/linuxdo`)
  authorizeUrl.searchParams.set('scope', 'profile email')
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')

  return sendRedirect(event, authorizeUrl.toString(), 302)
})
