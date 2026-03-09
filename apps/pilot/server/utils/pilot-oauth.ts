import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import { createError, getCookie, getRequestURL, setCookie } from 'h3'

const OAUTH_STATE_COOKIE_NAME = 'pilot_oauth_state'
const OAUTH_STATE_MAX_AGE_SECONDS = 5 * 60

function sanitizeReturnTo(value: string): string {
  if (!value || !value.startsWith('/')) {
    return '/'
  }
  if (value.startsWith('//')) {
    return '/'
  }
  return value
}

function encodeReturnTo(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function decodeReturnTo(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8')
}

export function createPilotOauthState(returnTo: string): string {
  const nonce = randomBytes(12).toString('hex')
  const safeReturnTo = sanitizeReturnTo(returnTo)
  return `${nonce}.${encodeReturnTo(safeReturnTo)}`
}

export function parsePilotOauthReturnTo(state: string): string {
  const raw = String(state || '').trim()
  const dotIndex = raw.indexOf('.')
  if (dotIndex <= 0 || dotIndex >= raw.length - 1) {
    return '/'
  }
  const encodedReturnTo = raw.slice(dotIndex + 1)
  try {
    return sanitizeReturnTo(decodeReturnTo(encodedReturnTo))
  }
  catch {
    return '/'
  }
}

export function writePilotOauthStateCookie(event: H3Event, state: string): void {
  const secure = getRequestURL(event).protocol === 'https:'
  setCookie(event, OAUTH_STATE_COOKIE_NAME, state, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  })
}

export function clearPilotOauthStateCookie(event: H3Event): void {
  const secure = getRequestURL(event).protocol === 'https:'
  setCookie(event, OAUTH_STATE_COOKIE_NAME, '', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 0,
  })
}

export function requirePilotOauthState(event: H3Event, providedState: string): void {
  const expectedState = String(getCookie(event, OAUTH_STATE_COOKIE_NAME) || '').trim()
  if (!providedState || !expectedState || providedState !== expectedState) {
    clearPilotOauthStateCookie(event)
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid oauth state.',
    })
  }
  clearPilotOauthStateCookie(event)
}
