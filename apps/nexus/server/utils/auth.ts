import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { useRuntimeConfig } from '#imports'
import { clerkClient } from '@clerk/nuxt/server'
import { createError, getHeader } from 'h3'

const APP_TOKEN_ISSUER = 'tuff-nexus'
const APP_TOKEN_AUDIENCE = 'tuff-app'
const APP_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7
const APP_SECRET_MIN_LENGTH = 16

let ephemeralJwtSecret: string | null = null
let appSecretWarned = false

interface AppTokenPayload {
  sub: string
  iat: number
  exp: number
  iss: string
  aud: string
  typ: 'app'
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

export function createAppToken(userId: string): string {
  const secret = getAppJwtSecret()

  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload: AppTokenPayload = {
    sub: userId,
    iat: now,
    exp: now + APP_TOKEN_TTL_SECONDS,
    iss: APP_TOKEN_ISSUER,
    aud: APP_TOKEN_AUDIENCE,
    typ: 'app',
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
}

export async function requireAuth(event: H3Event): Promise<AuthContext> {
  const bearerToken = parseBearerToken(event)
  if (bearerToken) {
    const payload = verifyAppToken(bearerToken)
    if (payload?.sub) {
      return { userId: payload.sub }
    }
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const authFn = event.context.auth
  if (!authFn)
    throw createError({ statusCode: 500, statusMessage: 'Clerk auth context is unavailable.' })

  let auth: any
  try {
    auth = await authFn()
  }
  catch (error: any) {
    throw createError({ statusCode: 500, statusMessage: error?.message || 'Clerk auth failed.' })
  }

  const userId = auth?.userId

  if (!userId)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  return { userId }
}

export async function requireAdmin(event: H3Event) {
  const { userId } = await requireAuth(event)

  let client: any
  try {
    client = clerkClient(event)
  }
  catch (error: any) {
    throw createError({ statusCode: 500, statusMessage: error?.message || 'Clerk client initialization failed.' })
  }

  let user: any
  try {
    user = await client.users.getUser(userId)
  }
  catch (error: any) {
    const status = typeof error?.status === 'number' ? error.status : undefined
    const statusCode = status === 404 ? 401 : status

    throw createError({
      statusCode: statusCode && statusCode >= 400 && statusCode < 600 ? statusCode : 500,
      statusMessage: error?.message || 'Failed to fetch user info.',
    })
  }

  const role = user.publicMetadata?.role

  if (role !== 'admin')
    throw createError({ statusCode: 403, statusMessage: 'Admin permission required.' })

  return { userId, user }
}
