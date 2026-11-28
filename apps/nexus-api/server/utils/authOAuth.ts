import type { H3Event } from 'h3'
import { createHash, randomBytes } from 'node:crypto'
import { getCookie, getRequestURL, setCookie } from 'h3'
import { networkClient } from '@talex-touch/utils/network'
import { useRuntimeConfig } from 'nitropack/runtime'
import { normalizeAuthOrigin, shouldTrustForwardedAuthHost } from './authOrigin'
import { readCloudflareBindings } from './cloudflare'
import {
  type AuthUser,
  createUser,
  getUserByAccount,
  getUserByEmail,
  linkAccount,
  logLoginAttempt,
  restorePendingDeletionIfWithinWindow,
} from './authStore'
import { ensurePersonalTeam } from './creditsStore'
import { oauthEmailProvesMailboxControl } from './oauthEmailTrust'
import { resolveSessionAuthSecret } from './sessionAuthSecret'
import {
  isSecureSessionCookieRequest,
  setBrowserSessionCookies,
  signBrowserSessionToken,
  signTransientCookiePayload,
  verifyTransientCookiePayload,
} from './sessionJwt'

const ALL_HTTP_STATUS = Array.from({ length: 500 }, (_, index) => index + 100)
const OAUTH_STATE_COOKIE = 'nexus_oauth_state'

export interface OAuthProviderCredentials {
  github: { clientId: string, clientSecret: string }
  linuxdo: { clientId: string, clientSecret: string, issuer: string }
  email: { from: string, resendApiKey: string }
}

export function resolveAuthProviderConfig(event: H3Event): OAuthProviderCredentials {
  const bindings = readCloudflareBindings(event)
  const config = useRuntimeConfig(event) as {
    auth?: {
      github?: { clientId?: string, clientSecret?: string }
      linuxdo?: { clientId?: string, clientSecret?: string, issuer?: string }
      email?: { from?: string, resendApiKey?: string }
    }
  }
  return {
    github: {
      clientId: (bindings?.GITHUB_CLIENT_ID || config.auth?.github?.clientId || '').trim(),
      clientSecret: (bindings?.GITHUB_CLIENT_SECRET || config.auth?.github?.clientSecret || '').trim(),
    },
    linuxdo: {
      clientId: (bindings?.LINUXDO_CLIENT_ID || config.auth?.linuxdo?.clientId || '').trim(),
      clientSecret: (bindings?.LINUXDO_CLIENT_SECRET || config.auth?.linuxdo?.clientSecret || '').trim(),
      issuer: (bindings?.LINUXDO_ISSUER || config.auth?.linuxdo?.issuer || 'https://connect.linux.do').trim().replace(/\/+$/, ''),
    },
    email: {
      from: (bindings?.AUTH_EMAIL_FROM || config.auth?.email?.from || '').trim(),
      resendApiKey: (bindings?.RESEND_API_KEY || config.auth?.email?.resendApiKey || '').trim(),
    },
  }
}

export function resolveAuthBaseUrl(event: H3Event): string {
  const bindings = readCloudflareBindings(event)
  const config = useRuntimeConfig(event) as { auth?: { origin?: string } }
  const configuredOrigin = normalizeAuthOrigin(bindings?.AUTH_ORIGIN || config.auth?.origin)
  if (configuredOrigin && !shouldTrustForwardedAuthHost(configuredOrigin))
    return configuredOrigin
  return getRequestURL(event).origin
}

export function normalizeSafeCallbackUrl(rawUrl: unknown, baseUrl: string, fallbackPath = '/dashboard'): string {
  const fallback = new URL(fallbackPath, baseUrl).toString()
  if (typeof rawUrl !== 'string' || !rawUrl.trim())
    return fallback
  try {
    const base = new URL(baseUrl)
    const parsed = new URL(rawUrl.trim(), base)
    if (parsed.origin !== base.origin)
      return fallback
    if (parsed.pathname.startsWith('/sign-in') || parsed.pathname.startsWith('/api/auth/signin'))
      return fallback
    return parsed.toString()
  }
  catch {
    return fallback
  }
}

export function buildSignInErrorRedirect(baseUrl: string, errorCode: string): string {
  const url = new URL('/sign-in', baseUrl)
  url.searchParams.set('error', errorCode)
  return url.toString()
}

export async function beginOAuthState(
  event: H3Event,
  provider: 'github' | 'linuxdo',
  callbackUrl: string,
): Promise<{ state: string, codeChallenge: string }> {
  const secret = resolveSessionAuthSecret(event)
  const state = randomBytes(24).toString('base64url')
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  const signed = await signTransientCookiePayload(secret, 'oauth-state', {
    provider,
    state,
    codeVerifier,
    callbackUrl,
  }, 600)

  setCookie(event, OAUTH_STATE_COOKIE, signed, {
    path: '/api/auth',
    maxAge: 600,
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureSessionCookieRequest(event),
  })

  return { state, codeChallenge }
}

export async function consumeOAuthState(
  event: H3Event,
  expectedProvider: 'github' | 'linuxdo',
  returnedState: string,
): Promise<{ codeVerifier: string, callbackUrl: string } | null> {
  const secret = resolveSessionAuthSecret(event)
  const raw = getCookie(event, OAUTH_STATE_COOKIE)
  setCookie(event, OAUTH_STATE_COOKIE, '', {
    path: '/api/auth',
    maxAge: 0,
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureSessionCookieRequest(event),
  })

  const payload = await verifyTransientCookiePayload<{
    provider?: string
    state?: string
    codeVerifier?: string
    callbackUrl?: string
  }>(secret, 'oauth-state', raw)

  if (!payload || payload.provider !== expectedProvider || payload.state !== returnedState || !payload.codeVerifier)
    return null

  return {
    codeVerifier: payload.codeVerifier,
    callbackUrl: payload.callbackUrl || '/dashboard',
  }
}

export async function exchangeOAuthCode(input: {
  tokenUrl: string
  clientId: string
  clientSecret: string
  code: string
  redirectUri?: string
  codeVerifier?: string
}): Promise<Record<string, unknown>> {
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('client_id', input.clientId)
  body.set('client_secret', input.clientSecret)
  body.set('code', input.code)
  if (input.redirectUri)
    body.set('redirect_uri', input.redirectUri)
  if (input.codeVerifier)
    body.set('code_verifier', input.codeVerifier)

  const response = await networkClient.request<string>({
    method: 'POST',
    url: input.tokenUrl,
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    responseType: 'text',
    timeoutMs: 15000,
    validateStatus: ALL_HTTP_STATUS,
  })

  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(response.data || '{}') as Record<string, unknown>
  }
  catch {
    const params = new URLSearchParams(response.data || '')
    params.forEach((v, k) => {
      parsed[k] = v
    })
  }

  if (response.status < 200 || response.status >= 300 || typeof parsed.access_token !== 'string' || !parsed.access_token) {
    throw new Error(`OAuth token exchange failed (${response.status}).`)
  }
  return parsed
}

export async function completeOAuthUserSignIn(
  event: H3Event,
  input: {
    provider: 'github' | 'linuxdo'
    providerAccountId: string
    email?: string | null
    name?: string | null
    image?: string | null
    profile?: Record<string, unknown>
  },
): Promise<AuthUser | null> {
  const existingByAccount = await getUserByAccount(event, input.provider, input.providerAccountId)
  if (existingByAccount) {
    const restored = await restorePendingDeletionIfWithinWindow(event, existingByAccount.id)
    if (!restored || restored.status !== 'active')
      return null
    await issueBrowserSessionForUser(event, restored, input.provider)
    return restored
  }

  const normalizedEmail = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (normalizedEmail) {
    const existingByEmail = await getUserByEmail(event, normalizedEmail)
    if (existingByEmail) {
      if (!oauthEmailProvesMailboxControl(input.provider, input.profile))
        return null
      const restored = await restorePendingDeletionIfWithinWindow(event, existingByEmail.id)
      if (!restored || restored.status !== 'active')
        return null
      await linkAccount(event, restored.id, input.provider, input.providerAccountId)
      await issueBrowserSessionForUser(event, restored, input.provider)
      return restored
    }
  }

  const emailToStore = normalizedEmail || `missing+${crypto.randomUUID()}@tuff.local`
  const hasRealEmail = Boolean(normalizedEmail)
  const user = await createUser(event, {
    email: emailToStore,
    name: input.name ?? null,
    image: input.image ?? null,
    emailVerified: hasRealEmail ? new Date().toISOString() : null,
    emailState: hasRealEmail ? 'verified' : 'missing',
  })
  await ensurePersonalTeam(event, user.id)
  await linkAccount(event, user.id, input.provider, input.providerAccountId)
  await issueBrowserSessionForUser(event, user, input.provider)
  return user
}

export async function issueBrowserSessionForUser(
  event: H3Event,
  user: AuthUser,
  reason: string,
): Promise<string> {
  const secret = resolveSessionAuthSecret(event)
  const token = await signBrowserSessionToken(secret, {
    userId: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: user.role,
  })
  setBrowserSessionCookies(event, token)
  await logLoginAttempt(event, {
    userId: user.id,
    deviceId: null,
    success: true,
    reason,
    clientType: 'web',
  }).catch(() => {})
  return token
}
