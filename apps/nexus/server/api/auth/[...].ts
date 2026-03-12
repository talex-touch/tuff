import type { H3Event } from 'h3'
import { networkClient } from '@talex-touch/utils/network'
import { defineEventHandler, getRequestURL, setCookie, setResponseStatus } from 'h3'
import { NuxtAuthHandler } from '#auth'
import { useRuntimeConfig } from '#imports'
import type { Account, AuthOptions, Profile, Session, User } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import type { OAuthConfig } from 'next-auth/providers/oauth'
import Credentials from 'next-auth/providers/credentials'
import GitHub from 'next-auth/providers/github'
import { createD1Adapter } from '../../utils/authAdapter'
import { consumeLoginToken, getUserByAccount, getUserByEmail, logLoginAttempt, verifyUserPassword } from '../../utils/authStore'
import { sendEmail } from '../../utils/email'

const CredentialsProvider = (Credentials as any).default ?? Credentials
const GitHubProvider = (GitHub as any).default ?? GitHub
const ALL_HTTP_STATUS = Array.from({ length: 500 }, (_, index) => index + 100)

type AuthRequestHeaders = Record<string, string | string[] | undefined>
interface OAuthTokenRequestContext {
  provider: { callbackUrl: string }
  params: unknown
  checks?: unknown
}
interface OAuthUserInfoRequestContext {
  tokens: Record<string, unknown>
}
interface EmailVerificationRequestContext {
  identifier: string
  url: string
}

function createEmailProvider(server: string, from: string) {
  return {
    id: 'email',
    type: 'email',
    name: 'Email',
    server,
    from,
    maxAge: 24 * 60 * 60,
    async sendVerificationRequest({ identifier, url }: EmailVerificationRequestContext) {
      await sendEmail({
        to: identifier,
        subject: 'Sign in to Tuff',
        html: `<p>Click the link to sign in:</p><p><a href="${url}">${url}</a></p>`
      })
    },
  } as any
}

function resolveAuthHeaders(req?: { headers?: Headers | AuthRequestHeaders } | Request | null): AuthRequestHeaders | undefined {
  if (!req)
    return undefined
  const headers = 'headers' in req ? req.headers : undefined
  if (!headers)
    return undefined
  if (headers instanceof Headers) {
    const record: AuthRequestHeaders = {}
    headers.forEach((value, key) => {
      record[key] = value
    })
    return record
  }
  return headers as AuthRequestHeaders
}

function getRuntimeBindings() {
  const bindings = (globalThis as { __env__?: { DB?: unknown } }).__env__
  if (!bindings?.DB) {
    throw new Error('[Auth] Cloudflare bindings are not available.')
  }
  return bindings
}

function createAuthEvent(headers?: AuthRequestHeaders): H3Event {
  return {
    context: {
      cloudflare: {
        env: getRuntimeBindings(),
      },
    },
    node: {
      req: {
        headers: headers ?? {},
      },
    },
  } as unknown as H3Event
}

function parseUrlWithBase(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl)
  }
  catch {
    return null
  }
}

function safeDecodeUriComponent(value: string) {
  try {
    const decoded = decodeURIComponent(value)
    return decoded === value ? null : decoded
  }
  catch {
    return null
  }
}

function buildSignInErrorUrl(baseUrl: string, source: URL | null) {
  const signInUrl = new URL('/sign-in', baseUrl)
  if (!source)
    return signInUrl.toString()

  const error = source.searchParams.get('error')
  const description = source.searchParams.get('error_description')
  if (error)
    signInUrl.searchParams.set('error', error)
  if (description)
    signInUrl.searchParams.set('error_description', description)
  return signInUrl.toString()
}

function normalizeAuthFallbackUrl(url: string, baseUrl: string) {
  const base = parseUrlWithBase(baseUrl, baseUrl)
  const parsed = parseUrlWithBase(url, baseUrl)
  if (!base || !parsed)
    return url
  if (parsed.origin !== base.origin)
    return url

  const callbackUrlRaw = parsed.searchParams.get('callbackUrl') ?? parsed.searchParams.get('callback_url')
  if (parsed.pathname !== '/' || !callbackUrlRaw)
    return parsed.toString()

  const callbackCandidates = [callbackUrlRaw, safeDecodeUriComponent(callbackUrlRaw)].filter((value): value is string => Boolean(value))
  for (const candidate of callbackCandidates) {
    const nested = parseUrlWithBase(candidate, baseUrl)
    if (!nested || nested.origin !== base.origin)
      continue

    if (nested.pathname.startsWith('/sign-in') || nested.pathname.startsWith('/api/auth/signin'))
      return buildSignInErrorUrl(baseUrl, parsed)

    return nested.toString()
  }

  return buildSignInErrorUrl(baseUrl, parsed)
}

function normalizeAuthRedirectUrl(url: string, baseUrl: string) {
  const base = parseUrlWithBase(baseUrl, baseUrl)
  const parsed = parseUrlWithBase(url, baseUrl)
  if (!base || !parsed)
    return baseUrl
  if (parsed.origin !== base.origin)
    return baseUrl

  return normalizeAuthFallbackUrl(parsed.toString(), baseUrl)
}

function normalizeAuthResponseUrl(url: string, baseUrl: string) {
  return normalizeAuthFallbackUrl(url, baseUrl)
}

function resolveAuthBaseUrl(event: H3Event) {
  const configuredOrigin = useRuntimeConfig().auth?.origin
  if (typeof configuredOrigin === 'string' && configuredOrigin.trim().length > 0)
    return configuredOrigin.trim()
  return getRequestURL(event).origin
}

function withResponseLocation(response: Response, location: string) {
  const headers = new Headers(response.headers)
  headers.set('location', location)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function isSigninActionRequest(event: H3Event) {
  const method = (event.node.req.method || '').toUpperCase()
  const path = event.path || event.node.req.url || ''
  return method === 'POST' && path.includes('/api/auth/signin/')
}

function isJsonResponse(response: Response) {
  const contentType = response.headers.get('content-type') || ''
  return contentType.toLowerCase().includes('application/json')
}

async function normalizeAuthResponseResult(result: unknown, event: H3Event, baseUrl: string) {
  if (result instanceof Response) {
    const location = result.headers.get('location')
    let normalizedResponse = result

    if (location) {
      const normalizedLocation = normalizeAuthResponseUrl(location, baseUrl)
      if (normalizedLocation !== location)
        normalizedResponse = withResponseLocation(normalizedResponse, normalizedLocation)
    }

    if (isSigninActionRequest(event) && isJsonResponse(normalizedResponse)) {
      try {
        const payload = await normalizedResponse.clone().json() as Record<string, unknown>
        const url = typeof payload?.url === 'string' ? payload.url : ''
        if (url) {
          const normalizedUrl = normalizeAuthResponseUrl(url, baseUrl)
          if (normalizedUrl !== url) {
            const headers = new Headers(normalizedResponse.headers)
            headers.delete('content-length')
            headers.set('content-type', 'application/json; charset=utf-8')
            return new Response(JSON.stringify({ ...payload, url: normalizedUrl }), {
              status: normalizedResponse.status,
              statusText: normalizedResponse.statusText,
              headers,
            })
          }
        }
      }
      catch {
        // Ignore JSON parse errors and keep original response.
      }
    }

    return normalizedResponse
  }

  if (result && typeof result === 'object' && 'url' in result && typeof (result as { url?: unknown }).url === 'string') {
    const currentUrl = (result as { url: string }).url
    const normalizedUrl = normalizeAuthResponseUrl(currentUrl, baseUrl)
    if (normalizedUrl !== currentUrl)
      return { ...(result as Record<string, unknown>), url: normalizedUrl }
  }

  return result
}

function toRecord(value: unknown) {
  if (value && typeof value === 'object')
    return value as Record<string, unknown>
  return {}
}

async function parseOauthPayload(text: string) {
  if (!text)
    return {}

  try {
    return toRecord(JSON.parse(text))
  }
  catch {
    const params = new URLSearchParams(text)
    const payload: Record<string, string> = {}
    params.forEach((value, key) => {
      payload[key] = value
    })
    return payload
  }
}

function normalizeOauthTokenPayload(payload: Record<string, unknown>) {
  const normalized: Record<string, unknown> = { ...payload }
  const expiresIn = normalized.expires_in
  if (typeof expiresIn === 'string') {
    const parsed = Number.parseInt(expiresIn, 10)
    if (!Number.isNaN(parsed))
      normalized.expires_in = parsed
  }

  const scope = normalized.scope
  if (typeof scope === 'string' && scope.includes(',')) {
    normalized.scope = scope
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .join(' ')
  }

  return normalized
}

function buildOauthTokenRequestBody(
  params: unknown,
  checks: unknown,
  callbackUrl: string,
  clientId: string,
  clientSecret: string,
  includeRedirectUri: boolean,
) {
  const paramsRecord = toRecord(params)
  const body = new URLSearchParams()
  const code = typeof paramsRecord.code === 'string' ? paramsRecord.code : ''
  if (code)
    body.set('code', code)

  const checksRecord = toRecord(checks)
  const codeVerifierFromParams = typeof paramsRecord.code_verifier === 'string' ? paramsRecord.code_verifier : ''
  const codeVerifierFromChecks = typeof checksRecord.code_verifier === 'string' ? checksRecord.code_verifier : ''
  const codeVerifier = codeVerifierFromParams || codeVerifierFromChecks
  if (codeVerifier)
    body.set('code_verifier', codeVerifier)

  const redirectUriFromParams = typeof paramsRecord.redirect_uri === 'string' ? paramsRecord.redirect_uri : ''
  const redirectUri = redirectUriFromParams || callbackUrl
  if (includeRedirectUri && redirectUri)
    body.set('redirect_uri', redirectUri)

  const grantType = typeof paramsRecord.grant_type === 'string' ? paramsRecord.grant_type : 'authorization_code'
  body.set('grant_type', grantType)
  body.set('client_id', clientId)
  body.set('client_secret', clientSecret)
  return body
}

function formatOauthError(prefix: string, payload: Record<string, unknown>, status: number) {
  const error = typeof payload.error === 'string' ? payload.error : ''
  const description = typeof payload.error_description === 'string' ? payload.error_description : ''
  const details = [error, description].filter(Boolean).join(': ')
  return `${prefix}: ${details || `http_${status}`}`
}

async function requestOauthTokenByFetch(input: {
  tokenUrl: string
  callbackUrl: string
  clientId: string
  clientSecret: string
  params: unknown
  checks?: unknown
  headers?: Record<string, string>
  providerName: string
  includeRedirectUri?: boolean
}) {
  const requestBody = buildOauthTokenRequestBody(
    input.params,
    input.checks,
    input.callbackUrl,
    input.clientId,
    input.clientSecret,
    input.includeRedirectUri !== false,
  )

  const response = await networkClient.request<string>({
    method: 'POST',
    url: input.tokenUrl,
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      ...input.headers,
    },
    body: requestBody.toString(),
    responseType: 'text',
    validateStatus: ALL_HTTP_STATUS
  })

  const payload = normalizeOauthTokenPayload(await parseOauthPayload(response.data))
  if (response.status < 200 || response.status >= 300 || typeof payload.error === 'string') {
    throw new Error(formatOauthError(`${input.providerName}_token_exchange_failed`, payload, response.status))
  }

  if (typeof payload.access_token !== 'string' || payload.access_token.length === 0) {
    throw new Error(`${input.providerName}_token_exchange_failed: missing_access_token`)
  }

  return payload
}

async function requestOauthProfileByFetch(input: {
  userInfoUrl: string
  accessToken: string
  providerName: string
  headers?: Record<string, string>
}) {
  const response = await networkClient.request<Record<string, unknown>>({
    method: 'GET',
    url: input.userInfoUrl,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${input.accessToken}`,
      ...input.headers,
    },
    validateStatus: ALL_HTTP_STATUS
  })

  const payload = toRecord(response.data)
  if (response.status < 200 || response.status >= 300) {
    throw new Error(formatOauthError(`${input.providerName}_userinfo_failed`, payload, response.status))
  }

  return payload
}

function getAuthOptions(): AuthOptions {
  const config = useRuntimeConfig()
  const linuxdoIssuer = config.auth?.linuxdo?.issuer || 'https://connect.linux.do'
  const linuxdoClientId = config.auth?.linuxdo?.clientId
  const linuxdoClientSecret = config.auth?.linuxdo?.clientSecret
  const providers: AuthOptions['providers'] = [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        loginToken: { label: 'Login Token', type: 'text' }
      },
      async authorize(credentials: Record<string, unknown> | undefined, req: { headers?: Headers | AuthRequestHeaders } | Request | null) {
        const authEvent = createAuthEvent(resolveAuthHeaders(req))
        const email = credentials?.email?.toString().trim().toLowerCase() ?? ''
        const password = credentials?.password?.toString() ?? ''
        const loginToken = credentials?.loginToken?.toString() ?? ''

        if (loginToken) {
          const user = await consumeLoginToken(authEvent, loginToken)
          if (user) {
            await logLoginAttempt(authEvent, { userId: user.id, deviceId: null, success: true, reason: 'login_token', clientType: 'app' })
            return { id: user.id, email: user.email, name: user.name, image: user.image }
          }
          await logLoginAttempt(authEvent, { userId: null, deviceId: null, success: false, reason: 'login_token_invalid', clientType: 'app' })
          return null
        }

        if (!email || !password) {
          await logLoginAttempt(authEvent, { userId: null, deviceId: null, success: false, reason: 'missing_credentials', clientType: 'app' })
          return null
        }

        const user = await verifyUserPassword(authEvent, email, password)
        if (!user) {
          await logLoginAttempt(authEvent, { userId: null, deviceId: null, success: false, reason: 'invalid_password', clientType: 'app' })
          return null
        }
        await logLoginAttempt(authEvent, { userId: user.id, deviceId: null, success: true, reason: 'password', clientType: 'app' })
        return { id: user.id, email: user.email, name: user.name, image: user.image }
      }
    }),
  ]

  const githubClientId = config.auth?.github?.clientId
  const githubClientSecret = config.auth?.github?.clientSecret
  if (githubClientId && githubClientSecret) {
    providers.push(GitHubProvider({
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      allowDangerousEmailAccountLinking: true,
      token: {
        async request(context: OAuthTokenRequestContext) {
          const tokens = await requestOauthTokenByFetch({
            tokenUrl: 'https://github.com/login/oauth/access_token',
            callbackUrl: context.provider.callbackUrl,
            clientId: githubClientId,
            clientSecret: githubClientSecret,
            params: context.params,
            checks: context.checks,
            headers: {
              accept: 'application/json',
            },
            providerName: 'github',
            includeRedirectUri: false,
          })
          return { tokens }
        },
      },
      userinfo: {
        async request(context: OAuthUserInfoRequestContext) {
          const accessToken = typeof context.tokens.access_token === 'string'
            ? context.tokens.access_token
            : ''
          if (!accessToken)
            throw new Error('github_userinfo_failed: missing_access_token')

          const headers = {
            accept: 'application/vnd.github+json',
            'user-agent': 'tuff-nexus-auth',
          }
          const profile = await requestOauthProfileByFetch({
            userInfoUrl: 'https://api.github.com/user',
            accessToken,
            providerName: 'github',
            headers,
          })

          if (!profile.email) {
            const emailResponse = await networkClient.request<Array<Record<string, unknown>>>({
              method: 'GET',
              url: 'https://api.github.com/user/emails',
              headers: {
                ...headers,
                authorization: `Bearer ${accessToken}`,
              },
              validateStatus: ALL_HTTP_STATUS
            })

            if (emailResponse.status >= 200 && emailResponse.status < 300) {
              const emails = Array.isArray(emailResponse.data) ? emailResponse.data : []
              if (Array.isArray(emails)) {
                const primary = emails.find((item) => {
                  return item
                    && typeof item.email === 'string'
                    && item.email.length > 0
                    && item.verified === true
                    && item.primary === true
                }) ?? emails.find((item) => {
                  return item
                    && typeof item.email === 'string'
                    && item.email.length > 0
                    && item.verified === true
                }) ?? emails.find((item) => {
                  return item
                    && typeof item.email === 'string'
                    && item.email.length > 0
                })

                if (primary && typeof primary.email === 'string')
                  profile.email = primary.email
              }
            }
          }

          return profile
        },
      },
    }))
  }

  if (linuxdoClientId && linuxdoClientSecret) {
    const linuxdoProvider: OAuthConfig<Record<string, any>> = {
      id: 'linuxdo',
      name: 'LinuxDO',
      // Use OAuth-only flow to avoid LinuxDO returning id_token.
      // When scope includes `openid`, openid-client throws:
      // "id_token detected in the response, you must use client.callback()".
      type: 'oauth',
      clientId: linuxdoClientId,
      clientSecret: linuxdoClientSecret,
      // Keep LinuxDO behavior consistent with GitHub: when OAuth email matches an existing
      // local account, allow linking instead of returning without creating provider linkage.
      allowDangerousEmailAccountLinking: true,
      authorization: {
        url: `${linuxdoIssuer}/oauth2/authorize`,
        params: { scope: 'profile email' },
      },
      token: {
        url: `${linuxdoIssuer}/oauth2/token`,
        async request(context: OAuthTokenRequestContext) {
          const tokens = await requestOauthTokenByFetch({
            tokenUrl: `${linuxdoIssuer}/oauth2/token`,
            callbackUrl: context.provider.callbackUrl,
            clientId: linuxdoClientId,
            clientSecret: linuxdoClientSecret,
            params: context.params,
            checks: context.checks,
            providerName: 'linuxdo',
          })
          return { tokens }
        },
      },
      userinfo: {
        url: `${linuxdoIssuer}/api/user`,
        async request(context: OAuthUserInfoRequestContext) {
          const accessToken = typeof context.tokens.access_token === 'string'
            ? context.tokens.access_token
            : ''
          if (!accessToken)
            throw new Error('linuxdo_userinfo_failed: missing_access_token')

          return await requestOauthProfileByFetch({
            userInfoUrl: `${linuxdoIssuer}/api/user`,
            accessToken,
            providerName: 'linuxdo',
          })
        },
      },
      idToken: false,
      profile(profile: Record<string, any>) {
        const id = profile.sub ?? profile.id ?? profile.user_id ?? profile.uid
        const avatarTemplate = typeof profile.avatar_template === 'string'
          ? profile.avatar_template.replace('{size}', '128')
          : null
        const image = profile.avatar_url ?? avatarTemplate ?? profile.avatar ?? profile.picture ?? null
        return {
          id: id ? String(id) : '',
          name: profile.name ?? profile.username ?? null,
          email: profile.email ?? null,
          image,
        }
      }
    }
    providers.push(linuxdoProvider as any)
  }

  const emailServer = config.auth?.email?.server
  const emailFrom = config.auth?.email?.from
  if (emailServer && emailFrom) {
    providers.push(createEmailProvider(emailServer, emailFrom))
  }

  return {
    secret: config.auth?.secret,
    session: { strategy: 'jwt' },
    adapter: createD1Adapter(() => createAuthEvent()) as AuthOptions['adapter'],
    pages: {
      signIn: '/sign-in',
      error: '/sign-in',
      verifyRequest: '/verify-waiting',
    },
    providers,
    callbacks: {
      async redirect({ url, baseUrl }: { url: string, baseUrl: string }) {
        return normalizeAuthRedirectUrl(url, baseUrl)
      },
      async signIn({ user, account, profile }: { user: User, account: Account | null, profile?: Profile | undefined }) {
        const authEvent = createAuthEvent()
        if (!account)
          return false
        if (account.type === 'oauth') {
          if (account.provider && account.providerAccountId) {
            const existingByAccount = await getUserByAccount(authEvent, account.provider, account.providerAccountId)
            if (existingByAccount)
              return existingByAccount.status === 'active'
          }
          const email = user?.email ?? (profile as any)?.email
          if (!email)
            return true
          const existing = await getUserByEmail(authEvent, email)
          if (!existing)
            return true
          return existing.status === 'active'
        }
        if (account.provider === 'email') {
          const email = user?.email
          if (!email)
            return false
          const existing = await getUserByEmail(authEvent, email)
          return Boolean(existing && existing.status === 'active')
        }
        return true
      },
      async jwt({ token, user }: { token: JWT, user?: User | null }) {
        if (user) {
          token.userId = (user as { id?: string }).id
        }
        if (!token.userId && typeof token.sub === 'string') {
          token.userId = token.sub
        }
        return token
      },
      async session({ session, token }: { session: Session, token: JWT }) {
        if (session.user) {
          const resolvedUserId =
            typeof token.userId === 'string' && token.userId
              ? token.userId
              : typeof token.sub === 'string'
                ? token.sub
                : ''
          if (resolvedUserId) {
            ;(session.user as { id?: string }).id = resolvedUserId
          }
          else if (process.env.NUXT_AUTH_DEBUG === 'true') {
            console.info('[auth][session-callback] missing user id in token', {
              hasTokenUserId: Boolean(token.userId),
              hasTokenSub: Boolean(token.sub)
            })
          }
        }
        return session
      }
    }
  }
}

const SESSION_ERROR_COOKIE = 'nexus_auth_error'
const SESSION_ERROR_VALUE = 'jwt_session_error'
const SESSION_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
  'authjs.session-token',
  '__Secure-authjs.session-token',
]

function isJwtSessionError(error: unknown) {
  if (error instanceof Error) {
    return error.message.includes('JWT_SESSION_ERROR')
      || error.message.includes('decryption operation failed')
  }
  return String(error).includes('JWT_SESSION_ERROR')
    || String(error).includes('decryption operation failed')
}

function isSessionRequest(event: H3Event) {
  const url = event.path || event.node.req.url || ''
  return url.includes('/api/auth/session')
}

function clearAuthCookies(event: H3Event) {
  SESSION_COOKIE_NAMES.forEach((name) => {
    const secure = name.startsWith('__Secure-') || name.startsWith('__Host-')
    setCookie(event, name, '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
      secure,
    })
  })
}

function markSessionError(event: H3Event) {
  setCookie(event, SESSION_ERROR_COOKIE, SESSION_ERROR_VALUE, {
    path: '/',
    maxAge: 60,
    sameSite: 'lax',
  })
}

const authHandler = NuxtAuthHandler(getAuthOptions())

export default defineEventHandler(async (event) => {
  const baseUrl = resolveAuthBaseUrl(event)
  try {
    const result = await authHandler(event)
    return await normalizeAuthResponseResult(result, event, baseUrl)
  }
  catch (error) {
    if (isJwtSessionError(error) && isSessionRequest(event)) {
      clearAuthCookies(event)
      markSessionError(event)
      setResponseStatus(event, 401)
      return { error: SESSION_ERROR_VALUE }
    }
    throw error
  }
})
