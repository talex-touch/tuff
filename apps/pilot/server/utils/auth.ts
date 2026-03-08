import type { H3Event } from 'h3'
import { createError, getCookie, getHeader } from 'h3'

export interface PilotAuthContext {
  userId: string
  source: 'header' | 'cookie' | 'token' | 'dev-bypass'
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return atob(`${normalized}${padding}`)
}

function parseJwtSub(token: string): string | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1] || '')) as { sub?: unknown }
    return typeof payload.sub === 'string' && payload.sub.trim() ? payload.sub.trim() : null
  }
  catch {
    return null
  }
}

function resolveTokenUserId(token: string): string {
  const sub = parseJwtSub(token)
  if (sub) {
    return sub
  }
  const normalized = token.trim()
  if (normalized.length >= 8) {
    return `token_${normalized.slice(0, 12)}`
  }
  return ''
}

function isLoopbackRequest(event: H3Event): boolean {
  const forwardedHost = String(getHeader(event, 'x-forwarded-host') || '').trim().toLowerCase()
  const host = String(getHeader(event, 'host') || '').trim().toLowerCase()
  const merged = forwardedHost || host
  if (!merged) {
    return false
  }

  const firstHostPart = merged.split(',')[0]
  if (!firstHostPart) {
    return false
  }

  const firstHost = firstHostPart.trim()
  const hostnamePart = firstHost
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(':')[0] ?? ''

  const hostname = hostnamePart.trim()

  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
}

function getPilotRuntimeConfig(event: H3Event): Record<string, unknown> {
  const runtimeConfig = (event.context as { runtimeConfig?: Record<string, unknown> }).runtimeConfig
  return runtimeConfig?.pilot && typeof runtimeConfig.pilot === 'object'
    ? (runtimeConfig.pilot as Record<string, unknown>)
    : {}
}

function shouldAllowDevBypass(event: H3Event): boolean {
  const pilotConfig = getPilotRuntimeConfig(event)
  const configured = pilotConfig.allowAnonymousDevAuth
  if (typeof configured === 'boolean') {
    return configured
  }
  return isLoopbackRequest(event)
}

export function requirePilotAuth(event: H3Event): PilotAuthContext {
  const explicit = String(
    getHeader(event, 'x-pilot-user-id')
    || getHeader(event, 'x-user-id')
    || '',
  ).trim()
  if (explicit) {
    return {
      userId: explicit,
      source: 'header',
    }
  }

  const cookieUser = String(getCookie(event, 'pilot_user_id') || '').trim()
  if (cookieUser) {
    return {
      userId: cookieUser,
      source: 'cookie',
    }
  }

  const authorization = String(getHeader(event, 'authorization') || '').trim()
  if (authorization.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim()
    const userId = resolveTokenUserId(token)
    if (userId) {
      return {
        userId,
        source: 'token',
      }
    }
  }

  if (shouldAllowDevBypass(event)) {
    return {
      userId: 'pilot_dev_user',
      source: 'dev-bypass',
    }
  }

  throw createError({
    statusCode: 401,
    statusMessage: 'Unauthorized',
  })
}
