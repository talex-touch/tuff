import { hasWindow } from '@talex-touch/utils/env'

export type AuthFlow = 'login' | 'bind'
export type OauthProvider = 'github' | 'linuxdo'

export interface OauthContext {
  flow: AuthFlow
  provider: OauthProvider
  redirect: string
  ts: number
  ver: 1
}

interface BuildOauthCallbackInput {
  flow: AuthFlow
  provider: OauthProvider
  redirect: string
  lang?: string | null
}

interface RequestOauthAuthorizationInput {
  provider: OauthProvider
  callbackUrl: string
}

interface ResolveOauthContextInput {
  query?: {
    flow?: string | null
    provider?: string | null
    redirect?: string | null
  }
  stored?: OauthContext | null
  fallbackFlow?: AuthFlow
  fallbackRedirect?: string
}

const OAUTH_STATE_KEY = 'tuff_oauth_state'
export const OAUTH_CONTEXT_TTL_MS = 10 * 60 * 1000

function isAuthFlow(value: unknown): value is AuthFlow {
  return value === 'login' || value === 'bind'
}

function isOauthProvider(value: unknown): value is OauthProvider {
  return value === 'github' || value === 'linuxdo'
}

function defaultRedirectByFlow(flow: AuthFlow) {
  return flow === 'bind' ? '/dashboard/account' : '/dashboard'
}

export function sanitizeRedirect(redirect: string | null | undefined, fallback = '/dashboard') {
  if (!redirect)
    return fallback

  const normalized = redirect.trim()
  if (!normalized.startsWith('/') || normalized.startsWith('//'))
    return fallback

  return normalized
}

export function buildOauthCallbackUrl(input: BuildOauthCallbackInput) {
  const redirect = sanitizeRedirect(input.redirect, defaultRedirectByFlow(input.flow))
  const params = new URLSearchParams({
    oauth: '1',
    flow: input.flow,
    provider: input.provider,
    redirect_url: redirect,
  })

  if (input.lang)
    params.set('lang', input.lang)

  return `/sign-in?${params.toString()}`
}

function parseUrlLike(value: string) {
  try {
    const base = hasWindow() ? window.location.origin : 'http://localhost'
    return value.startsWith('/') ? new URL(value, base) : new URL(value)
  }
  catch {
    return null
  }
}

function isOauthFallbackUrl(value: string, callbackUrl: string) {
  if (value === callbackUrl)
    return true

  const parsed = parseUrlLike(value)
  if (!parsed)
    return false

  if (parsed.pathname.startsWith('/api/auth/signin') || parsed.pathname.startsWith('/sign-in'))
    return true

  return false
}

function resolveOauthRedirectErrorHint(value: string) {
  const parsed = parseUrlLike(value)
  if (!parsed)
    return ''
  return parsed.searchParams.get('error') ?? ''
}

export async function requestOauthAuthorizationUrl(input: RequestOauthAuthorizationInput) {
  const csrfData = await $fetch<{ csrfToken?: string }>('/api/auth/csrf', {
    credentials: 'include',
  })
  const csrfToken = csrfData?.csrfToken
  if (!csrfToken)
    throw new Error('oauth_csrf_unavailable')

  const body = new URLSearchParams({
    csrfToken,
    callbackUrl: input.callbackUrl,
    json: 'true',
  })

  const response = await $fetch<{ url?: string }>(`/api/auth/signin/${input.provider}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  const redirectUrl = typeof response?.url === 'string' ? response.url.trim() : ''
  if (!redirectUrl)
    throw new Error('oauth_redirect_missing')

  if (isOauthFallbackUrl(redirectUrl, input.callbackUrl)) {
    const errorHint = resolveOauthRedirectErrorHint(redirectUrl)
    if (errorHint)
      throw new Error(`oauth_redirect_fallback:${errorHint}`)
    throw new Error('oauth_redirect_fallback')
  }

  return redirectUrl
}

export function persistOauthContext(input: Omit<OauthContext, 'ts' | 'ver'> & { ts?: number }) {
  if (!hasWindow())
    return

  const redirect = sanitizeRedirect(input.redirect, defaultRedirectByFlow(input.flow))
  const payload: OauthContext = {
    flow: input.flow,
    provider: input.provider,
    redirect,
    ts: input.ts ?? Date.now(),
    ver: 1,
  }

  window.localStorage.setItem(OAUTH_STATE_KEY, JSON.stringify(payload))
}

export function readOauthContext(now = Date.now()): OauthContext | null {
  if (!hasWindow())
    return null

  const raw = window.localStorage.getItem(OAUTH_STATE_KEY)
  if (!raw)
    return null

  try {
    const parsed = JSON.parse(raw) as Partial<OauthContext>
    if (parsed.ver !== 1 || !isAuthFlow(parsed.flow) || !isOauthProvider(parsed.provider) || typeof parsed.ts !== 'number') {
      clearOauthContext()
      return null
    }

    if (now - parsed.ts > OAUTH_CONTEXT_TTL_MS) {
      clearOauthContext()
      return null
    }

    return {
      flow: parsed.flow,
      provider: parsed.provider,
      redirect: sanitizeRedirect(parsed.redirect, defaultRedirectByFlow(parsed.flow)),
      ts: parsed.ts,
      ver: 1,
    }
  }
  catch {
    clearOauthContext()
    return null
  }
}

export function clearOauthContext() {
  if (!hasWindow())
    return

  window.localStorage.removeItem(OAUTH_STATE_KEY)
}

export function resolveOauthContext(input: ResolveOauthContextInput) {
  const fallbackFlow = input.fallbackFlow ?? 'login'
  const queryFlow = isAuthFlow(input.query?.flow) ? input.query?.flow : null
  const flow = queryFlow ?? input.stored?.flow ?? fallbackFlow

  const queryProvider = isOauthProvider(input.query?.provider) ? input.query.provider : null
  const provider = queryProvider ?? input.stored?.provider ?? null

  const fallbackRedirect = sanitizeRedirect(input.fallbackRedirect, defaultRedirectByFlow(flow))
  const redirect = sanitizeRedirect(input.query?.redirect ?? input.stored?.redirect, fallbackRedirect)

  return {
    flow,
    provider,
    redirect,
  }
}
