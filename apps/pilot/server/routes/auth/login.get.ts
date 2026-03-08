import type { H3Event } from 'h3'
import { createError, getQuery, getRequestURL, sendRedirect } from 'h3'

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

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const returnTo = sanitizeReturnTo(query.returnTo)
  const pilotConfig = getPilotRuntimeConfig(event)
  const nexusOrigin = String(pilotConfig.nexusOrigin || '').trim()

  if (!nexusOrigin) {
    throw createError({
      statusCode: 500,
      statusMessage: 'NUXT_PUBLIC_NEXUS_ORIGIN is not configured.',
    })
  }

  const requestUrl = getRequestURL(event)
  const callbackUrl = new URL('/auth/callback', requestUrl.origin)
  callbackUrl.searchParams.set('returnTo', returnTo)

  const bridgeStart = new URL('/api/pilot/auth/bridge-start', nexusOrigin)
  bridgeStart.searchParams.set('callback', callbackUrl.toString())
  bridgeStart.searchParams.set('returnTo', returnTo)

  return sendRedirect(event, bridgeStart.toString(), 302)
})
