import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHmac, randomBytes } from 'node:crypto'
import process from 'node:process'
import { createError, getCookie, getRequestURL, setCookie } from 'h3'
import { deletePilotRedisValue, getPilotRedisValue, setPilotRedisValue } from './pilot-redis'

const DEFAULT_ACCESS_MAX_AGE_SECONDS = 2 * 60 * 60
const DEFAULT_REFRESH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
const MIN_SECRET_LENGTH = 16

export const PILOT_SESSION_COOKIE_NAME = 'pilot_auth_session'
export const PILOT_REFRESH_COOKIE_NAME = 'pilot_auth_refresh'

interface PilotJwtPayload {
  sub: string
  typ: 'access' | 'refresh'
  jti: string
  iat: number
  exp: number
}

export interface PilotSessionTokenSet {
  accessToken: string
  refreshToken: string
  expiresIn: number
  refreshExpiresIn: number
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

function signToken(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

function randomTokenId(): string {
  return randomBytes(16).toString('hex')
}

function getJwtAccessSecret(): string {
  const secret = String(process.env.PILOT_JWT_ACCESS_SECRET || '').trim()
  if (secret.length < MIN_SECRET_LENGTH) {
    throw createError({
      statusCode: 500,
      statusMessage: 'PILOT_JWT_ACCESS_SECRET is not configured.',
    })
  }
  return secret
}

function getJwtRefreshSecret(): string {
  const secret = String(process.env.PILOT_JWT_REFRESH_SECRET || '').trim()
  if (secret.length < MIN_SECRET_LENGTH) {
    throw createError({
      statusCode: 500,
      statusMessage: 'PILOT_JWT_REFRESH_SECRET is not configured.',
    })
  }
  return secret
}

function getAccessTtlSeconds(): number {
  return DEFAULT_ACCESS_MAX_AGE_SECONDS
}

function getRefreshTtlSeconds(): number {
  return DEFAULT_REFRESH_MAX_AGE_SECONDS
}

function createToken(payload: PilotJwtPayload, secret: string): string {
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signature = signToken(payloadB64, secret)
  return `${payloadB64}.${signature}`
}

function verifyToken(raw: string, secret: string, typ: PilotJwtPayload['typ']): PilotJwtPayload | null {
  const [payloadB64, signature] = String(raw || '').trim().split('.')
  if (!payloadB64 || !signature) {
    return null
  }

  const expected = signToken(payloadB64, secret)
  if (expected !== signature) {
    return null
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as PilotJwtPayload
    const sub = String(payload.sub || '').trim()
    if (!sub || payload.typ !== typ) {
      return null
    }
    const exp = Number(payload.exp)
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
      return null
    }
    const iat = Number(payload.iat)
    if (!Number.isFinite(iat)) {
      return null
    }
    return {
      sub,
      typ,
      jti: String(payload.jti || ''),
      iat: Math.floor(iat),
      exp: Math.floor(exp),
    }
  }
  catch {
    return null
  }
}

function redisRefreshKey(jti: string): string {
  return `pilot:auth:refresh:${jti}`
}

function setTokenCookie(event: H3Event, cookieName: string, value: string, maxAge: number): void {
  const secure = getRequestURL(event).protocol === 'https:'
  setCookie(event, cookieName, value, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge,
  })
}

function issueAccessToken(userId: string): { token: string, payload: PilotJwtPayload, ttlSeconds: number } {
  const ttlSeconds = getAccessTtlSeconds()
  const now = Math.floor(Date.now() / 1000)
  const payload: PilotJwtPayload = {
    sub: userId,
    typ: 'access',
    jti: randomTokenId(),
    iat: now,
    exp: now + ttlSeconds,
  }
  return {
    token: createToken(payload, getJwtAccessSecret()),
    payload,
    ttlSeconds,
  }
}

function issueRefreshToken(userId: string): { token: string, payload: PilotJwtPayload, ttlSeconds: number } {
  const ttlSeconds = getRefreshTtlSeconds()
  const now = Math.floor(Date.now() / 1000)
  const payload: PilotJwtPayload = {
    sub: userId,
    typ: 'refresh',
    jti: randomTokenId(),
    iat: now,
    exp: now + ttlSeconds,
  }
  return {
    token: createToken(payload, getJwtRefreshSecret()),
    payload,
    ttlSeconds,
  }
}

function writeAccessCookie(event: H3Event, userId: string): { accessToken: string, expiresIn: number } {
  const access = issueAccessToken(userId)
  setTokenCookie(event, PILOT_SESSION_COOKIE_NAME, access.token, access.ttlSeconds)
  return {
    accessToken: access.token,
    expiresIn: access.ttlSeconds,
  }
}

async function writeRefreshCookie(event: H3Event, userId: string): Promise<{ refreshToken: string, refreshExpiresIn: number }> {
  const refresh = issueRefreshToken(userId)
  await setPilotRedisValue(redisRefreshKey(refresh.payload.jti), userId, refresh.ttlSeconds)
  setTokenCookie(event, PILOT_REFRESH_COOKIE_NAME, refresh.token, refresh.ttlSeconds)
  return {
    refreshToken: refresh.token,
    refreshExpiresIn: refresh.ttlSeconds,
  }
}

export function readPilotSessionUserId(event: H3Event): string | null {
  const accessRaw = String(getCookie(event, PILOT_SESSION_COOKIE_NAME) || '').trim()
  if (accessRaw) {
    try {
      const accessPayload = verifyToken(accessRaw, getJwtAccessSecret(), 'access')
      if (accessPayload?.sub) {
        return accessPayload.sub
      }
    }
    catch {
      // ignore parse errors
    }
  }

  // Fallback to refresh token for seamless login continuity.
  const refreshRaw = String(getCookie(event, PILOT_REFRESH_COOKIE_NAME) || '').trim()
  if (!refreshRaw) {
    return null
  }

  try {
    const refreshPayload = verifyToken(refreshRaw, getJwtRefreshSecret(), 'refresh')
    if (!refreshPayload?.sub) {
      return null
    }
    writeAccessCookie(event, refreshPayload.sub)
    return refreshPayload.sub
  }
  catch {
    return null
  }
}

export async function writePilotSessionCookie(event: H3Event, userId: string): Promise<PilotSessionTokenSet> {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'userId is required.',
    })
  }

  const access = writeAccessCookie(event, normalizedUserId)
  const refresh = await writeRefreshCookie(event, normalizedUserId)

  return {
    accessToken: access.accessToken,
    refreshToken: refresh.refreshToken,
    expiresIn: access.expiresIn,
    refreshExpiresIn: refresh.refreshExpiresIn,
  }
}

export async function renewPilotSessionCookie(event: H3Event, refreshTokenHint?: string): Promise<PilotSessionTokenSet | null> {
  const refreshRaw = String(refreshTokenHint || getCookie(event, PILOT_REFRESH_COOKIE_NAME) || '').trim()
  if (!refreshRaw) {
    return null
  }

  let refreshPayload: PilotJwtPayload | null = null
  try {
    refreshPayload = verifyToken(refreshRaw, getJwtRefreshSecret(), 'refresh')
  }
  catch {
    refreshPayload = null
  }

  if (!refreshPayload?.sub || !refreshPayload.jti) {
    return null
  }

  const redisUserId = await getPilotRedisValue(redisRefreshKey(refreshPayload.jti))
  if (!redisUserId || redisUserId !== refreshPayload.sub) {
    return null
  }

  await deletePilotRedisValue(redisRefreshKey(refreshPayload.jti))
  return await writePilotSessionCookie(event, refreshPayload.sub)
}

export async function clearPilotSessionCookie(event: H3Event): Promise<void> {
  const refreshRaw = String(getCookie(event, PILOT_REFRESH_COOKIE_NAME) || '').trim()
  if (refreshRaw) {
    try {
      const payload = verifyToken(refreshRaw, getJwtRefreshSecret(), 'refresh')
      if (payload?.jti) {
        await deletePilotRedisValue(redisRefreshKey(payload.jti))
      }
    }
    catch {
      // ignore invalid token
    }
  }

  const secure = getRequestURL(event).protocol === 'https:'
  setCookie(event, PILOT_SESSION_COOKIE_NAME, '', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 0,
  })
  setCookie(event, PILOT_REFRESH_COOKIE_NAME, '', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 0,
  })
}
