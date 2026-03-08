import type { H3Event } from 'h3'
import { createError, getQuery, getRequestURL, sendRedirect, setCookie } from 'h3'
import { writePilotSessionCookie } from '../../utils/pilot-session'

interface BridgeConsumeResponse {
  userId?: string
}

function getPilotRuntimeConfig(event: H3Event): Record<string, unknown> {
  const runtimeConfig = (event.context as { runtimeConfig?: Record<string, unknown> }).runtimeConfig
  const pilotConfig = runtimeConfig?.pilot
  return runtimeConfig?.pilot && typeof runtimeConfig.pilot === 'object'
    ? (pilotConfig as Record<string, unknown>)
    : {}
}

function sanitizeReturnTo(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw || !raw.startsWith('/')) {
    return '/'
  }
  if (raw.startsWith('//')) {
    return '/'
  }
  return raw
}

function resolveSessionMaxAge(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 60 * 60 * 24
  }
  return Math.min(Math.max(Math.floor(parsed), 60), 60 * 60 * 24 * 30)
}

async function consumeBridgeTicket(event: H3Event, ticketId: string): Promise<string> {
  const pilotConfig = getPilotRuntimeConfig(event)
  const nexusOrigin = String(pilotConfig.nexusInternalOrigin || pilotConfig.nexusOrigin || '').trim()
  const bridgeSecret = String(pilotConfig.nexusBridgeSecret || '').trim()

  if (!nexusOrigin || !bridgeSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Pilot bridge configuration is incomplete.',
    })
  }

  const response = await fetch(`${nexusOrigin}/api/pilot/auth/bridge-consume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pilot-bridge-secret': bridgeSecret,
    },
    body: JSON.stringify({ ticketId }),
  })

  if (!response.ok) {
    throw createError({
      statusCode: response.status === 401 ? 401 : 502,
      statusMessage: 'Failed to consume bridge ticket.',
    })
  }

  const payload = await response.json() as BridgeConsumeResponse
  const userId = String(payload?.userId || '').trim()
  if (!userId) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Bridge response missing userId.',
    })
  }

  return userId
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const ticketId = String(query.ticket || '').trim()
  if (!ticketId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ticket is required.',
    })
  }

  const returnTo = sanitizeReturnTo(query.returnTo)
  const userId = await consumeBridgeTicket(event, ticketId)
  writePilotSessionCookie(event, userId)

  const pilotConfig = getPilotRuntimeConfig(event)
  const maxAge = resolveSessionMaxAge(pilotConfig.sessionCookieMaxAgeSec)
  const secure = getRequestURL(event).protocol === 'https:'

  // Keep legacy cookie writable for old clients during migration.
  setCookie(event, 'pilot_user_id', userId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge,
  })

  return sendRedirect(event, returnTo, 302)
})
