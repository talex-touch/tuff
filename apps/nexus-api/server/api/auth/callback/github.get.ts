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
import { selectVerifiedGitHubEmail } from '../../../utils/oauthEmailTrust'

const ALL_HTTP_STATUS = Array.from({ length: 500 }, (_, index) => index + 100)

export default defineEventHandler(async (event) => {
  const baseUrl = resolveAuthBaseUrl(event)
  const { github } = resolveAuthProviderConfig(event)
  if (!github.clientId || !github.clientSecret)
    return sendRedirect(event, buildSignInErrorRedirect(baseUrl, 'OAuthNotConfigured'), 302)

  const query = getQuery(event)
  const code = typeof query.code === 'string' ? query.code.trim() : ''
  const state = typeof query.state === 'string' ? query.state.trim() : ''
  if (!code || !state)
    return sendRedirect(event, buildSignInErrorRedirect(baseUrl, 'OAuthCallback'), 302)

  const oauthState = await consumeOAuthState(event, 'github', state)
  if (!oauthState)
    return sendRedirect(event, buildSignInErrorRedirect(baseUrl, 'OAuthStateMismatch'), 302)

  try {
    const tokens = await exchangeOAuthCode({
      tokenUrl: 'https://github.com/login/oauth/access_token',
      clientId: github.clientId,
      clientSecret: github.clientSecret,
      code,
    })
    const accessToken = String(tokens.access_token)
    const headers = {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${accessToken}`,
      'user-agent': 'tuff-nexus-auth',
    }
    const profileRes = await networkClient.request<Record<string, unknown>>({
      method: 'GET',
      url: 'https://api.github.com/user',
      headers,
      timeoutMs: 15000,
      validateStatus: ALL_HTTP_STATUS,
    })
    if (profileRes.status < 200 || profileRes.status >= 300 || !profileRes.data)
      return sendRedirect(event, buildSignInErrorRedirect(baseUrl, 'OAuthProfileError'), 302)

    const profile = profileRes.data
    let email = typeof profile.email === 'string' ? profile.email : undefined
    if (!email) {
      const emailRes = await networkClient.request<Array<Record<string, unknown>>>({
        method: 'GET',
        url: 'https://api.github.com/user/emails',
        headers,
        timeoutMs: 15000,
        validateStatus: ALL_HTTP_STATUS,
      })
      if (emailRes.status >= 200 && emailRes.status < 300)
        email = selectVerifiedGitHubEmail(emailRes.data)
    }

    const providerAccountId = String(profile.id ?? '').trim()
    if (!providerAccountId)
      return sendRedirect(event, buildSignInErrorRedirect(baseUrl, 'OAuthProfileError'), 302)

    const user = await completeOAuthUserSignIn(event, {
      provider: 'github',
      providerAccountId,
      email: email ?? null,
      name: typeof profile.name === 'string' ? profile.name : (typeof profile.login === 'string' ? profile.login : null),
      image: typeof profile.avatar_url === 'string' ? profile.avatar_url : null,
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
