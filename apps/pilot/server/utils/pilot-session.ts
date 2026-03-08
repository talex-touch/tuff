import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createError, getCookie, getRequestURL, setCookie } from 'h3'

const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24
const MIN_SECRET_LENGTH = 16

export const PILOT_SESSION_COOKIE_NAME = 'pilot_auth_session'

interface PilotSessionPayload {
  userId: string
  iat: number
  exp: number
}

function getPilotRuntimeConfig(event: H3Event): Record<string, unknown> {
  const runtimeConfig = (event.context as { runtimeConfig?: Record<string, unknown> }).runtimeConfig
  return runtimeConfig?.pilot && typeof runtimeConfig.pilot === 'object'
    ? (runtimeConfig.pilot as Record<string, unknown>)
    : {}
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8')
}

function signPayload(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('hex')
}

function getSessionSecret(event: H3Event): string {
  const pilotConfig = getPilotRuntimeConfig(event)
  const secret = String(pilotConfig.cookieSecret || '').trim()
  if (secret.length < MIN_SECRET_LENGTH) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Pilot cookie secret is not configured.',
    })
  }
  return secret
}

function getSessionMaxAgeSeconds(event: H3Event): number {
  const pilotConfig = getPilotRuntimeConfig(event)
  const parsed = Number(pilotConfig.sessionCookieMaxAgeSec)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SESSION_MAX_AGE_SECONDS
  }
  return Math.min(Math.max(Math.floor(parsed), 60), DEFAULT_SESSION_MAX_AGE_SECONDS * 30)
}

function parseSessionCookie(raw: string, secret: string): PilotSessionPayload | null {
  const [payloadB64, signature] = raw.split('.')
  if (!payloadB64 || !signature) {
    return null
  }

  const expected = signPayload(payloadB64, secret)
  const signatureBuffer = Buffer.from(signature, 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payloadB64)) as PilotSessionPayload
    const userId = String(parsed.userId || '').trim()
    const exp = Number(parsed.exp)
    const iat = Number(parsed.iat)
    if (!userId || !Number.isFinite(exp) || !Number.isFinite(iat)) {
      return null
    }
    if (exp <= Math.floor(Date.now() / 1000)) {
      return null
    }
    return {
      userId,
      exp: Math.floor(exp),
      iat: Math.floor(iat),
    }
  }
  catch {
    return null
  }
}

export function readPilotSessionUserId(event: H3Event): string | null {
  const raw = String(getCookie(event, PILOT_SESSION_COOKIE_NAME) || '').trim()
  if (!raw) {
    return null
  }

  try {
    const secret = getSessionSecret(event)
    const payload = parseSessionCookie(raw, secret)
    return payload?.userId || null
  }
  catch {
    return null
  }
}

export function writePilotSessionCookie(event: H3Event, userId: string): void {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'userId is required.',
    })
  }

  const secret = getSessionSecret(event)
  const maxAge = getSessionMaxAgeSeconds(event)
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + maxAge
  const payloadB64 = base64UrlEncode(JSON.stringify({ userId: normalizedUserId, iat, exp }))
  const signed = `${payloadB64}.${signPayload(payloadB64, secret)}`
  const secure = getRequestURL(event).protocol === 'https:'

  setCookie(event, PILOT_SESSION_COOKIE_NAME, signed, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge,
  })
}
