import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { useRuntimeConfig } from '#imports'
import { getServerSession } from '#auth'
import { createError, getHeader } from 'h3'
import { ensureDeviceForRequest, getDevice, getUserByEmail, getUserById, readDeviceId, readDeviceMetadata, upsertDevice } from './authStore'

const APP_TOKEN_ISSUER = 'tuff-nexus'
const APP_TOKEN_AUDIENCE = 'tuff-app'
const APP_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7
const APP_SECRET_MIN_LENGTH = 16

let ephemeralJwtSecret: string | null = null
let appSecretWarned = false

interface AppTokenPayload {
  sub: string
  deviceId?: string
  dv?: number
  iat: number
  exp: number
  iss: string
  aud: string
  typ: 'app'
}

function shouldDebugAuth() {
  return process.env.NODE_ENV !== 'production' || process.env.NUXT_AUTH_DEBUG === 'true'
}

function logSessionDebug(stage: string, event: H3Event, payload: Record<string, unknown>) {
  if (!shouldDebugAuth())
    return
  const path = event.path || event.node.req.url || ''
  console.info('[auth][session]', stage, { path, ...payload })
}

function getAppJwtSecret(): string {
  const config = useRuntimeConfig()
  const secret = config.appAuthJwtSecret
  if (typeof secret === 'string' && secret.length >= APP_SECRET_MIN_LENGTH) {
    return secret
  }

  if (!ephemeralJwtSecret) {
    ephemeralJwtSecret = base64UrlEncode(randomBytes(32))
    if (!appSecretWarned) {
      appSecretWarned = true
      console.warn('[auth] APP_AUTH_JWT_SECRET missing or too short, using ephemeral secret.')
    }
  }
  return ephemeralJwtSecret
}

function base64UrlEncode(input: Buffer | string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
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

export async function createAppToken(
  event: H3Event,
  userId: string,
  options?: { deviceId?: string | null }
): Promise<string> {
  const secret = getAppJwtSecret()
  const now = Math.floor(Date.now() / 1000)
  const deviceId = options?.deviceId ?? readDeviceId(event)
  let deviceTokenVersion: number | undefined

  if (deviceId) {
    const device = await upsertDevice(event, userId, deviceId, readDeviceMetadata(event))
    deviceTokenVersion = device.tokenVersion
  }

  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload: AppTokenPayload = {
    sub: userId,
    deviceId: deviceId ?? undefined,
    dv: deviceTokenVersion ?? undefined,
    iat: now,
    exp: now + APP_TOKEN_TTL_SECONDS,
    iss: APP_TOKEN_ISSUER,
    aud: APP_TOKEN_AUDIENCE,
    typ: 'app'
  }
  const payloadPart = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${header}.${payloadPart}`
  const signature = createHmac('sha256', secret).update(signingInput).digest()
  return `${signingInput}.${base64UrlEncode(signature)}`
}

function verifyAppToken(token: string): AppTokenPayload | null {
  const secret = getAppJwtSecret()

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

    return payload
  }
  catch {
    return null
  }
}

export interface AuthContext {
  userId: string
  deviceId?: string | null
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

  return { userId: payload.sub, deviceId: payload.deviceId ?? null }
}

export async function requireAppAuth(event: H3Event): Promise<AuthContext> {
  const bearerToken = parseBearerToken(event)
  if (!bearerToken) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const payload = verifyAppToken(bearerToken)
  if (!payload?.sub) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  return await resolveAppTokenContext(event, payload)
}

export async function requireSessionAuth(event: H3Event): Promise<AuthContext> {
  const session = await getServerSession(event)
  const sessionUser = session?.user as { id?: string, email?: string } | undefined

  const directUserId = typeof sessionUser?.id === 'string' ? sessionUser.id.trim() : ''
  let user = directUserId ? await getUserById(event, directUserId) : null

  if (!user) {
    const email = typeof sessionUser?.email === 'string' ? sessionUser.email.trim().toLowerCase() : ''
    if (!email) {
      logSessionDebug('missing-session-user', event, {
        hasSession: Boolean(session),
        hasUser: Boolean(sessionUser),
        hasUserId: Boolean(sessionUser?.id),
        hasEmail: Boolean(sessionUser?.email),
        hasAuthorization: Boolean(getHeader(event, 'authorization')),
        hasCookie: Boolean(getHeader(event, 'cookie'))
      })
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
    user = await getUserByEmail(event, email)
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
  await ensureDeviceForRequest(event, user.id)
  return { userId: user.id }
}

/**
 * 兼容入口：优先使用 session，其次回退 app token。
 * 新代码请显式使用 requireSessionAuth 或 requireAppAuth。
 */
export async function requireAuth(event: H3Event): Promise<AuthContext> {
  try {
    return await requireSessionAuth(event)
  }
  catch (error: any) {
    if (error?.statusCode !== 401)
      throw error

    const bearerToken = parseBearerToken(event)
    if (!bearerToken)
      throw error

    return await requireAppAuth(event)
  }
}

export async function requireVerifiedEmail(event: H3Event): Promise<AuthContext> {
  const context = await requireSessionAuth(event)
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
  }
  catch {
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
