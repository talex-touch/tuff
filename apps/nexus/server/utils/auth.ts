import type { H3Event } from 'h3'
import type { JWT } from 'next-auth/jwt'
import { Buffer } from 'node:buffer'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { useRuntimeConfig } from '#imports'
import { getToken } from '#auth'
import { createError, getHeader, getRequestProtocol } from 'h3'
import {
  consumeLoginToken,
  createUser,
  ensureDeviceForRequest,
  getDevice,
  getUserByEmail,
  getUserById,
  readDeviceId,
  readDeviceMetadata,
  upsertDevice,
} from './authStore'
import { validateApiKey } from './apiKeyStore'
import { hasRequiredScope, isAdminOnlyApiKeyScope } from './apiKeyScopes'
import { readCloudflareBindings } from './cloudflare'
import { ensurePersonalTeam } from './creditsStore'
import { assertRuntimeCredential, isLocalDevelopmentRuntime, selectRuntimeCredential } from './runtimeCredentialPolicy'
import { resolveSessionAuthSecret } from './sessionAuthSecret'

const APP_TOKEN_ISSUER = 'tuff-nexus'
const APP_TOKEN_AUDIENCE = 'tuff-app'
export const APP_ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24
export const APP_REFRESH_TOKEN_SHORT_TTL_SECONDS = 60 * 60 * 24 * 30
export const APP_REFRESH_TOKEN_LONG_TTL_SECONDS = 60 * 60 * 24 * 180
const APP_SECRET_MIN_LENGTH = 16

export type AppTokenGrantType = 'short' | 'long'
export type AppTokenKind = 'access' | 'refresh'

export interface AppTokenPair {
  appToken: string
  refreshToken: string
  ttlSeconds: number
  refreshTtlSeconds: number
}

interface AppTokenDeviceMeta {
  deviceName?: string | null
  platform?: string | null
  clientType?: 'app' | 'cli' | 'external' | null
  reactivateRevoked?: boolean | null
}

interface AppTokenDeviceClaims {
  deviceId: string | null
  deviceTokenVersion?: number
}

let ephemeralJwtSecret: string | null = null
let appSecretWarned = false

interface AppTokenPayload {
  sub: string
  deviceId?: string
  dv?: number
  gt?: AppTokenGrantType
  kind?: AppTokenKind
  iat: number
  exp: number
  iss: string
  aud: string
  typ: 'app'
}

function shouldDebugAuth() {
  return process.env.NUXT_AUTH_DEBUG === 'true'
}

function logSessionDebug(stage: string, event: H3Event, payload: Record<string, unknown>) {
  if (!shouldDebugAuth()) return
  const path = event.path || event.node.req.url || ''
  console.info('[auth][session]', stage, { path, ...payload })
}

async function resolveSessionUserByEmail(event: H3Event, email: string, name: string) {
  const existing = await getUserByEmail(event, email)
  if (existing) return existing

  try {
    const user = await createUser(event, {
      email,
      name: name || null,
      emailVerified: new Date().toISOString(),
      emailState: 'verified',
    })
    await ensurePersonalTeam(event, user.id)
    logSessionDebug('email-auto-provisioned', event, { email, userId: user.id })
    return user
  } catch {
    return await getUserByEmail(event, email)
  }
}

function getAppJwtSecret(event?: H3Event): string {
  const config = useRuntimeConfig(event)
  const bindings = event ? readCloudflareBindings(event) : undefined
  const localDevelopment = isLocalDevelopmentRuntime(bindings?.NEXUS_LOCAL_PAGES_PREVIEW, bindings)
  const primaryCredential = selectRuntimeCredential(bindings, bindings?.APP_AUTH_JWT_SECRET, [
    config.appAuthJwtSecret,
    process.env.APP_AUTH_JWT_SECRET,
  ])

  if (primaryCredential !== undefined && primaryCredential !== null) {
    return assertRuntimeCredential('APP_AUTH_JWT_SECRET', primaryCredential, {
      localDevelopment,
      minimumLength: APP_SECRET_MIN_LENGTH,
    })
  }

  const fallbackCredential = selectRuntimeCredential(bindings, bindings?.AUTH_SECRET, [
    config.auth?.secret,
    process.env.AUTH_SECRET,
  ])
  if (fallbackCredential !== undefined && fallbackCredential !== null) {
    return assertRuntimeCredential('AUTH_SECRET', fallbackCredential, {
      localDevelopment,
      minimumLength: APP_SECRET_MIN_LENGTH,
    })
  }

  if (!localDevelopment) {
    return assertRuntimeCredential('APP_AUTH_JWT_SECRET', undefined, {
      localDevelopment: false,
      minimumLength: APP_SECRET_MIN_LENGTH,
    })
  }

  if (!ephemeralJwtSecret) {
    ephemeralJwtSecret = base64UrlEncode(randomBytes(32))
    if (!appSecretWarned) {
      appSecretWarned = true
      console.warn(
        '[auth] APP_AUTH_JWT_SECRET/Auth secret missing or too short, using development-only ephemeral secret.',
      )
    }
  }
  return ephemeralJwtSecret
}

function base64UrlEncode(input: Buffer | string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(input: string): Buffer {
  let normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4 !== 0) {
    normalized += '='
  }
  return Buffer.from(normalized, 'base64')
}

function parseBearerToken(event: H3Event): string | null {
  const header = getHeader(event, 'authorization')
  if (!header) {
    return null
  }
  const [scheme, value] = header.split(' ')
  if (scheme !== 'Bearer' || !value) {
    return null
  }
  return value.trim()
}

export async function requireApiKey(event: H3Event, requiredScopes: string[] = []) {
  const token = parseBearerToken(event)
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const result = await validateApiKey(event, token)
  if (!result) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const { userId, scopes } = result
  const user = await getUserById(event, userId)
  if (!user || user.status !== 'active') {
    throw createError({ statusCode: 403, statusMessage: 'Account disabled.' })
  }

  if (requiredScopes.length > 0) {
    const hasScopes = requiredScopes.every(scope => hasRequiredScope(scopes, scope))
    if (!hasScopes) {
      throw createError({ statusCode: 403, statusMessage: 'Insufficient API key scopes.' })
    }
  }

  const requiresAdmin = requiredScopes.some(scope => isAdminOnlyApiKeyScope(scope))
  if (requiresAdmin && user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin permission required.' })
  }

  return { userId, scopes, user }
}

export async function requireAuthOrApiKey(event: H3Event, requiredScopes: string[] = []) {
  try {
    const auth = await requireAuth(event)
    return { ...auth, authType: auth.authSource as 'session' | 'app' }
  } catch (error: any) {
    if (error?.statusCode !== 401) throw error
    const apiKey = await requireApiKey(event, requiredScopes)
    return { ...apiKey, authType: 'apiKey' as const }
  }
}

export async function requireAdminOrApiKey(event: H3Event, requiredScopes: string[] = []) {
  try {
    const admin = await requireAdmin(event)
    return { ...admin, authType: 'admin' as const }
  } catch {
    const apiKey = await requireApiKey(event, requiredScopes)
    return { ...apiKey, authType: 'apiKey' as const }
  }
}

async function resolveAppTokenDeviceClaims(
  event: H3Event,
  userId: string,
  options?: { deviceId?: string | null; deviceMeta?: AppTokenDeviceMeta },
): Promise<AppTokenDeviceClaims> {
  const hasExplicitDeviceId = Boolean(options && Object.prototype.hasOwnProperty.call(options, 'deviceId'))
  const deviceId = hasExplicitDeviceId ? (options?.deviceId ?? null) : readDeviceId(event)
  if (!deviceId) {
    return { deviceId: null }
  }

  const metadata = options?.deviceMeta ?? readDeviceMetadata(event)
  const device = await upsertDevice(event, userId, deviceId, metadata)
  return { deviceId, deviceTokenVersion: device.tokenVersion }
}

function signAppToken(
  secret: string,
  userId: string,
  claims: AppTokenDeviceClaims,
  options: {
    ttlSeconds: number
    grantType?: AppTokenGrantType
    tokenKind: AppTokenKind
    issuedAt: number
  },
): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload: AppTokenPayload = {
    sub: userId,
    deviceId: claims.deviceId ?? undefined,
    dv: claims.deviceTokenVersion ?? undefined,
    gt: options.grantType,
    kind: options.tokenKind,
    iat: options.issuedAt,
    exp: options.issuedAt + options.ttlSeconds,
    iss: APP_TOKEN_ISSUER,
    aud: APP_TOKEN_AUDIENCE,
    typ: 'app',
  }
  const payloadPart = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${header}.${payloadPart}`
  const signature = createHmac('sha256', secret).update(signingInput).digest()
  return `${signingInput}.${base64UrlEncode(signature)}`
}

export async function createAppToken(
  event: H3Event,
  userId: string,
  options?: {
    deviceId?: string | null
    ttlSeconds?: number
    grantType?: AppTokenGrantType
    tokenKind?: AppTokenKind
    deviceMeta?: AppTokenDeviceMeta
  },
): Promise<string> {
  const ttlSeconds =
    typeof options?.ttlSeconds === 'number' && Number.isFinite(options.ttlSeconds) && options.ttlSeconds > 0
      ? Math.floor(options.ttlSeconds)
      : APP_ACCESS_TOKEN_TTL_SECONDS
  const claims = await resolveAppTokenDeviceClaims(event, userId, options)
  return signAppToken(getAppJwtSecret(event), userId, claims, {
    ttlSeconds,
    grantType: options?.grantType,
    tokenKind: options?.tokenKind ?? 'access',
    issuedAt: Math.floor(Date.now() / 1000),
  })
}

export async function createAppTokenPair(
  event: H3Event,
  userId: string,
  options: {
    deviceId?: string | null
    grantType: AppTokenGrantType
    deviceMeta?: AppTokenDeviceMeta
  },
): Promise<AppTokenPair> {
  const refreshTtlSeconds = options.grantType === 'long'
    ? APP_REFRESH_TOKEN_LONG_TTL_SECONDS
    : APP_REFRESH_TOKEN_SHORT_TTL_SECONDS
  const claims = await resolveAppTokenDeviceClaims(event, userId, options)
  const secret = getAppJwtSecret(event)
  const issuedAt = Math.floor(Date.now() / 1000)
  const appToken = signAppToken(secret, userId, claims, {
    tokenKind: 'access',
    grantType: options.grantType,
    ttlSeconds: APP_ACCESS_TOKEN_TTL_SECONDS,
    issuedAt,
  })
  const refreshToken = signAppToken(secret, userId, claims, {
    tokenKind: 'refresh',
    grantType: options.grantType,
    ttlSeconds: refreshTtlSeconds,
    issuedAt,
  })

  return {
    appToken,
    refreshToken,
    ttlSeconds: APP_ACCESS_TOKEN_TTL_SECONDS,
    refreshTtlSeconds,
  }
}

function verifyAppToken(
  event: H3Event,
  token: string,
  expectedKind: AppTokenKind = 'access',
): AppTokenPayload | null {
  const secret = getAppJwtSecret(event)

  const parts = token.split('.')
  if (parts.length !== 3) {
    return null
  }

  const [headerPart, payloadPart, signaturePart] = parts
  if (!headerPart || !payloadPart || !signaturePart) {
    return null
  }

  try {
    const signingInput = `${headerPart}.${payloadPart}`
    const expectedSignature = createHmac('sha256', secret).update(signingInput).digest()
    const signature = base64UrlDecode(signaturePart)
    if (signature.length !== expectedSignature.length) {
      return null
    }
    if (!timingSafeEqual(signature, expectedSignature)) {
      return null
    }

    const payload = JSON.parse(base64UrlDecode(payloadPart).toString('utf8')) as AppTokenPayload
    if (payload.typ !== 'app') {
      return null
    }
    if (payload.iss !== APP_TOKEN_ISSUER || payload.aud !== APP_TOKEN_AUDIENCE) {
      return null
    }
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null
    }
    if (typeof payload.sub !== 'string' || !payload.sub) {
      return null
    }

    const tokenKind = payload.kind ?? 'access'
    if ((tokenKind !== 'access' && tokenKind !== 'refresh') || tokenKind !== expectedKind) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

export interface AuthContext {
  userId: string
  deviceId?: string | null
  authSource: 'session' | 'app'
  tokenGrantType?: 'short' | 'long' | null
  sessionIssuedAt?: number | null
}

async function resolveAppTokenContext(event: H3Event, payload: AppTokenPayload): Promise<AuthContext> {
  const user = await getUserById(event, payload.sub)
  if (!user || user.status !== 'active') {
    throw createError({ statusCode: 403, statusMessage: 'Account disabled.' })
  }

  if (payload.deviceId) {
    const device = await getDevice(event, payload.sub, payload.deviceId)
    if (!device || device.revokedAt) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
    if (typeof payload.dv === 'number' && payload.dv !== device.tokenVersion) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
  }

  return {
    userId: payload.sub,
    deviceId: payload.deviceId ?? null,
    authSource: 'app',
    tokenGrantType: payload.gt ?? null,
  }
}

async function requireAppTokenKind(event: H3Event, expectedKind: AppTokenKind): Promise<AuthContext> {
  const bearerToken = parseBearerToken(event)
  if (!bearerToken) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const payload = verifyAppToken(event, bearerToken, expectedKind)
  if (!payload?.sub) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  return await resolveAppTokenContext(event, payload)
}

export async function requireAppAuth(event: H3Event): Promise<AuthContext> {
  return await requireAppTokenKind(event, 'access')
}

export async function requireAppRefreshAuth(event: H3Event): Promise<AuthContext> {
  const context = await requireAppTokenKind(event, 'refresh')
  if (!context.deviceId || (context.tokenGrantType !== 'short' && context.tokenGrantType !== 'long')) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return context
}

function isSecureSessionCookieRequest(event: H3Event) {
  const forwardedProtocol = getHeader(event, 'x-forwarded-proto')
    ?.split(',', 1)[0]
    ?.trim()
    .toLowerCase()

  if (forwardedProtocol === 'https') return true
  if (forwardedProtocol === 'http') return false
  return getRequestProtocol(event) === 'https'
}

function readSessionTokenString(token: JWT, key: string) {
  const value = token[key]
  return typeof value === 'string' ? value.trim() : ''
}

function isAppSessionToken(token: JWT) {
  const audience = token.aud
  return token.typ === 'app'
    || token.iss === APP_TOKEN_ISSUER
    || audience === APP_TOKEN_AUDIENCE
    || (Array.isArray(audience) && audience.includes(APP_TOKEN_AUDIENCE))
}

async function resolveBrowserSessionToken(event: H3Event): Promise<JWT | null> {
  const secret = resolveSessionAuthSecret(event)

  try {
    const token = await getToken({
      event,
      secret,
      secureCookie: isSecureSessionCookieRequest(event),
    })

    if (!token) return null
    if (isAppSessionToken(token)) {
      logSessionDebug('app-token-rejected', event, {
        hasAuthorization: Boolean(getHeader(event, 'authorization')),
      })
      return null
    }
    return token
  }
  catch {
    logSessionDebug('invalid-session-token', event, {
      hasAuthorization: Boolean(getHeader(event, 'authorization')),
      hasCookie: Boolean(getHeader(event, 'cookie')),
    })
    return null
  }
}

export async function requireSessionAuth(event: H3Event): Promise<AuthContext> {
  const token = await resolveBrowserSessionToken(event)
  const sessionIssuedAt = typeof token?.iat === 'number' ? token.iat : null
  const directUserId = token
    ? readSessionTokenString(token, 'userId') || readSessionTokenString(token, 'sub')
    : ''
  let user = directUserId ? await getUserById(event, directUserId) : null

  if (!user) {
    const email = token ? readSessionTokenString(token, 'email').toLowerCase() : ''
    if (!email) {
      logSessionDebug('missing-session-user', event, {
        hasToken: Boolean(token),
        hasUserId: Boolean(directUserId),
        hasEmail: Boolean(token && readSessionTokenString(token, 'email')),
        hasAuthorization: Boolean(getHeader(event, 'authorization')),
        hasCookie: Boolean(getHeader(event, 'cookie')),
      })
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    const name = token ? readSessionTokenString(token, 'name') : ''
    user = await resolveSessionUserByEmail(event, email, name)
    if (!user) {
      logSessionDebug('email-not-found', event, { email })
    }
  }

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (user.status !== 'active') {
    throw createError({ statusCode: 403, statusMessage: 'Account disabled.' })
  }

  logSessionDebug('resolved', event, { userId: user.id, via: directUserId ? 'id' : 'email' })
  const device = await ensureDeviceForRequest(event, user.id)
  return {
    userId: user.id,
    deviceId: device?.id ?? null,
    authSource: 'session',
    tokenGrantType: null,
    sessionIssuedAt,
  }
}

/**
 * 兼容入口：优先使用 session，其次回退 app token。
 * 新代码请显式使用 requireSessionAuth 或 requireAppAuth。
 */
export async function requireAuth(event: H3Event): Promise<AuthContext> {
  try {
    return await requireSessionAuth(event)
  } catch (error: any) {
    if (error?.statusCode !== 401) throw error

    const bearerToken = parseBearerToken(event)
    if (!bearerToken) throw error

    return await requireAppAuth(event)
  }
}

export async function requireVerifiedEmail(event: H3Event): Promise<AuthContext> {
  const context = await requireAuth(event)
  const user = await getUserById(event, context.userId)
  if (!user || user.status !== 'active') {
    throw createError({ statusCode: 403, statusMessage: 'Account disabled.' })
  }
  if (user.emailState !== 'verified') {
    throw createError({ statusCode: 403, statusMessage: 'Email not verified.' })
  }
  return context
}

export async function getOptionalAuth(event: H3Event): Promise<AuthContext | null> {
  try {
    return await requireSessionAuth(event)
  } catch {
    return null
  }
}

export async function requireAdmin(event: H3Event) {
  const { userId } = await requireSessionAuth(event)
  const user = await getUserById(event, userId)
  if (!user || user.status !== 'active' || user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin permission required.' })
  }
  return { userId, user }
}

export async function requireAdminStepUp(event: H3Event) {
  const { userId, user } = await requireAdmin(event)
  const loginToken = getHeader(event, 'x-login-token')
  if (!loginToken) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Passkey step-up required.',
    })
  }

  const stepUpUser = await consumeLoginToken(event, loginToken, 'passkey')
  if (!stepUpUser || stepUpUser.id !== userId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Passkey step-up required.',
    })
  }

  return { userId, user }
}
