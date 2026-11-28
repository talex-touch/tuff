import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createDecipheriv, createHmac, timingSafeEqual } from 'node:crypto'
import hkdf from '@panva/hkdf'
import { getCookie, getHeader, getRequestProtocol, setCookie } from 'h3'
import {
  SESSION_HINT_COOKIE,
  SESSION_HINT_MAX_AGE_SECONDS,
  SESSION_HINT_VALUE,
  SESSION_TOKEN_COOKIE_NAMES,
} from '#shared/utils/session-hint'

export const SESSION_DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60
const SESSION_TOKEN_ISSUER = 'tuff-nexus-session'
const APP_TOKEN_ISSUER = 'tuff-nexus'
const APP_TOKEN_AUDIENCE = 'tuff-app'

export interface BrowserSessionToken {
  sub?: string
  userId?: string
  email?: string | null
  name?: string | null
  image?: string | null
  role?: string | null
  authTime?: number
  iat?: number
  exp?: number
  iss?: string
  aud?: string | string[]
  typ?: string
  [key: string]: unknown
}

function base64UrlEncode(input: Buffer | Uint8Array | string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(input: string): Buffer {
  let normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4 !== 0)
    normalized += '='
  return Buffer.from(normalized, 'base64')
}

export function isSecureSessionCookieRequest(event: H3Event): boolean {
  const forwardedProtocol = getHeader(event, 'x-forwarded-proto')
    ?.split(',', 1)[0]
    ?.trim()
    .toLowerCase()

  if (forwardedProtocol === 'https')
    return true
  if (forwardedProtocol === 'http')
    return false
  return getRequestProtocol(event) === 'https'
}

export function isAppSessionToken(token: BrowserSessionToken): boolean {
  const audience = token.aud
  return token.typ === 'app'
    || token.iss === APP_TOKEN_ISSUER
    || audience === APP_TOKEN_AUDIENCE
    || (Array.isArray(audience) && audience.includes(APP_TOKEN_AUDIENCE))
}

async function deriveSessionSigningKey(secret: string): Promise<Buffer> {
  const key = await hkdf('sha256', secret, '', 'tuff-nexus-session-jwt:v1', 32)
  return Buffer.from(key)
}

async function deriveLegacyNextAuthEncryptionKey(secret: string): Promise<Buffer> {
  const key = await hkdf('sha256', secret, '', 'NextAuth.js Generated Encryption Key', 32)
  return Buffer.from(key)
}

export async function signBrowserSessionToken(
  secret: string,
  payload: {
    userId: string
    email?: string | null
    name?: string | null
    image?: string | null
    role?: string | null
    authTime?: number
  },
  ttlSeconds = SESSION_DEFAULT_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const key = await deriveSessionSigningKey(secret)
  const headerPart = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body: BrowserSessionToken = {
    sub: payload.userId,
    userId: payload.userId,
    email: payload.email ?? null,
    name: payload.name ?? null,
    image: payload.image ?? null,
    role: payload.role ?? null,
    authTime: payload.authTime ?? now,
    iat: now,
    exp: now + ttlSeconds,
    iss: SESSION_TOKEN_ISSUER,
    typ: 'session',
  }
  const payloadPart = base64UrlEncode(JSON.stringify(body))
  const signingInput = `${headerPart}.${payloadPart}`
  const signature = createHmac('sha256', key).update(signingInput).digest()
  return `${signingInput}.${base64UrlEncode(signature)}`
}

async function verifySignedSessionJwt(secret: string, token: string): Promise<BrowserSessionToken | null> {
  const parts = token.split('.')
  if (parts.length !== 3)
    return null
  const [headerPart, payloadPart, signaturePart] = parts
  if (!headerPart || !payloadPart || !signaturePart)
    return null

  const key = await deriveSessionSigningKey(secret)
  const signingInput = `${headerPart}.${payloadPart}`
  const expected = createHmac('sha256', key).update(signingInput).digest()
  const actual = base64UrlDecode(signaturePart)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null

  const payload = JSON.parse(base64UrlDecode(payloadPart).toString('utf8')) as BrowserSessionToken
  if (!payload || typeof payload !== 'object')
    return null
  if (isAppSessionToken(payload))
    return null
  if (typeof payload.exp === 'number' && payload.exp <= Math.floor(Date.now() / 1000))
    return null
  return payload
}

/**
 * Decodes legacy NextAuth v4 A256GCM JWE session cookies (`dir` + `A256GCM`)
 * so existing signed-in browser sessions survive cutover without forced logout.
 */
async function decryptLegacyNextAuthJwe(secret: string, token: string): Promise<BrowserSessionToken | null> {
  const parts = token.split('.')
  if (parts.length !== 5)
    return null
  const [protectedHeader, encryptedKey, ivPart, ciphertextPart, tagPart] = parts
  if (!protectedHeader || encryptedKey || !ivPart || !ciphertextPart || !tagPart)
    return null

  const header = JSON.parse(base64UrlDecode(protectedHeader).toString('utf8')) as { alg?: string, enc?: string }
  if (header.alg !== 'dir' || header.enc !== 'A256GCM')
    return null

  const key = await deriveLegacyNextAuthEncryptionKey(secret)
  const iv = base64UrlDecode(ivPart)
  const ciphertext = base64UrlDecode(ciphertextPart)
  const authTag = base64UrlDecode(tagPart)

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAAD(Buffer.from(protectedHeader, 'ascii'))
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  const payload = JSON.parse(plaintext.toString('utf8')) as BrowserSessionToken
  if (!payload || typeof payload !== 'object')
    return null
  if (isAppSessionToken(payload))
    return null
  if (typeof payload.exp === 'number' && payload.exp <= Math.floor(Date.now() / 1000))
    return null
  return payload
}

export async function decodeBrowserSessionToken(secret: string, rawToken: string): Promise<BrowserSessionToken | null> {
  const trimmed = rawToken.trim()
  if (!trimmed)
    return null

  try {
    const dotCount = trimmed.split('.').length
    if (dotCount === 3)
      return await verifySignedSessionJwt(secret, trimmed)
    if (dotCount === 5)
      return await decryptLegacyNextAuthJwe(secret, trimmed)
    return null
  }
  catch {
    return null
  }
}

export function readSessionTokenFromCookies(event: H3Event): string | null {
  const secure = isSecureSessionCookieRequest(event)
  const orderedNames = secure
    ? [
        '__Secure-next-auth.session-token',
        '__Secure-authjs.session-token',
        'next-auth.session-token',
        'authjs.session-token',
      ]
    : [
        'next-auth.session-token',
        'authjs.session-token',
        '__Secure-next-auth.session-token',
        '__Secure-authjs.session-token',
      ]

  for (const name of orderedNames) {
    const value = getCookie(event, name)
    if (value && value.trim())
      return value.trim()
  }
  return null
}

export function setBrowserSessionCookies(
  event: H3Event,
  token: string,
  maxAgeSeconds = SESSION_DEFAULT_TTL_SECONDS,
): void {
  const secure = isSecureSessionCookieRequest(event)
  const cookieName = secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token'
  setCookie(event, cookieName, token, {
    path: '/',
    maxAge: maxAgeSeconds,
    httpOnly: true,
    sameSite: 'lax',
    secure,
  })
  setCookie(event, SESSION_HINT_COOKIE, SESSION_HINT_VALUE, {
    path: '/',
    maxAge: Math.min(maxAgeSeconds, SESSION_HINT_MAX_AGE_SECONDS),
    httpOnly: false,
    sameSite: 'lax',
    secure,
  })
}

export function clearBrowserSessionCookies(event: H3Event): void {
  const secure = isSecureSessionCookieRequest(event)
  for (const name of SESSION_TOKEN_COOKIE_NAMES) {
    const isSecurePrefix = name.startsWith('__Secure-') || name.startsWith('__Host-')
    setCookie(event, name, '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecurePrefix || secure,
    })
  }
  setCookie(event, SESSION_HINT_COOKIE, '', {
    path: '/',
    maxAge: 0,
    httpOnly: false,
    sameSite: 'lax',
    secure,
  })
}

export async function signTransientCookiePayload(
  secret: string,
  purpose: string,
  payload: Record<string, unknown>,
  ttlSeconds = 600,
): Promise<string> {
  const key = Buffer.from(await hkdf('sha256', secret, '', `tuff-nexus-cookie:${purpose}`, 32))
  const now = Math.floor(Date.now() / 1000)
  const encoded = base64UrlEncode(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }))
  const sig = base64UrlEncode(createHmac('sha256', key).update(encoded).digest())
  return `${encoded}.${sig}`
}

export async function verifyTransientCookiePayload<T extends Record<string, unknown>>(
  secret: string,
  purpose: string,
  rawValue: string | undefined | null,
): Promise<T | null> {
  if (!rawValue)
    return null
  const [encoded, sigPart] = rawValue.split('.')
  if (!encoded || !sigPart)
    return null
  try {
    const key = Buffer.from(await hkdf('sha256', secret, '', `tuff-nexus-cookie:${purpose}`, 32))
    const expected = createHmac('sha256', key).update(encoded).digest()
    const actual = base64UrlDecode(sigPart)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null
    const parsed = JSON.parse(base64UrlDecode(encoded).toString('utf8')) as T & { exp?: number }
    if (typeof parsed.exp === 'number' && parsed.exp <= Math.floor(Date.now() / 1000))
      return null
    return parsed
  }
  catch {
    return null
  }
}
