import { defineEventHandler, getQuery, sendRedirect } from 'h3'
import { networkClient } from '@talex-touch/utils/network'
import {
  buildSignInErrorRedirect,
  completeOAuthUserSignIn,
  consumeOAuthState,
  exchangeOAuthCode,
  resolveAuthBaseUrl,
  resolveAuthProviderConfig,
} from '../../../utils/authOAuth'

const ALL_HTTP_STATUS = Array.from({ length: 500 }, (_, index) => index + 100)

export default defineEventHandler(async (event) => {
  const baseUrl = resolveAuthBaseUrl(event)
  const { linuxdo } = resolveAuthProviderConfig(event)
  if (!linuxdo.clientId || !linuxdo.clientSecret)
    return sendRedirect(event, buildSignInErrorRedirect(baseUrl, 'OAuthNotConfigured'), 302)

  const query = getQuery(event)
  const code = typeof query.code === 'string' ? query.code.trim() : ''
  const state = typeof query.state === 'string' ? query.state.trim() : ''
  if (!code || !state)
    return sendRedirect(event, buildSignInErrorRedirect(baseUrl, 'OAuthCallback'), 302)

  const oauthState = await consumeOAuthState(event, 'linuxdo', state)
  if (!oauthState)
    return sendRedirect(event, buildSignInErrorRedirect(baseUrl, 'OAuthStateMismatch'), 302)

  try {
    const tokens = await exchangeOAuthCode({
      tokenUrl: `${linuxdo.issuer}/oauth2/token`,
      clientId: linuxdo.clientId,
      clientSecret: linuxdo.clientSecret,
      code,
      redirectUri: `${baseUrl}/api/auth/callback/linuxdo`,
      codeVerifier: oauthState.codeVerifier,
    })
    const accessToken = String(tokens.access_token)
    const profileRes = await networkClient.request<Record<string, unknown>>({
      method: 'GET',
      url: `${linuxdo.issuer}/api/user`,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      timeoutMs: 15000,
      validateStatus: ALL_HTTP_STATUS,
    })
    if (profileRes.status < 200 || profileRes.status >= 300 || !profileRes.data)
      return sendRedirect(event, buildSignInErrorRedirect(baseUrl, 'OAuthProfileError'), 302)

    const profile = profileRes.data
    const id = profile.sub ?? profile.id ?? profile.user_id ?? profile.uid
    const providerAccountId = id ? String(id).trim() : ''
    if (!providerAccountId)
      return sendRedirect(event, buildSignInErrorRedirect(baseUrl, 'OAuthProfileError'), 302)

    const avatarTemplate = typeof profile.avatar_template === 'string'
      ? profile.avatar_template.replace('{size}', '128')
      : null
    const image = (profile.avatar_url ?? avatarTemplate ?? profile.avatar ?? profile.picture ?? null) as string | null

    const user = await completeOAuthUserSignIn(event, {
      provider: 'linuxdo',
      providerAccountId,
      email: typeof profile.email === 'string' ? profile.email : null,
      name: typeof profile.name === 'string' ? profile.name : (typeof profile.username === 'string' ? profile.username : null),
      image,
      profile,
    })
    if (!user)
      return sendRedirect(event, buildSignInErrorRedirect(baseUrl, 'AccessDenied'), 302)

    return sendRedirect(event, oauthState.callbackUrl, 302)
  }
  catch {
    return sendRedirect(event, buildSignInErrorRedirect(baseUrl, 'OAuthCallback'), 302)
  }
})
