import { createError, getQuery, getRequestURL, sendRedirect } from 'h3'
import { resolvePilotConfigString, resolvePilotNexusOrigin } from '../../utils/pilot-config'
import { createPilotOauthState, writePilotOauthStateCookie } from '../../utils/pilot-oauth'

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
  const nexusOrigin = resolvePilotNexusOrigin(event)
  const clientId = resolvePilotConfigString(
    event,
    'nexusOauthClientId',
    ['PILOT_NEXUS_OAUTH_CLIENT_ID'],
  )

  if (!nexusOrigin || !clientId) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Pilot oauth configuration is incomplete.',
    })
  }

  const requestUrl = getRequestURL(event)
  const redirectUri = new URL('/auth/callback', requestUrl.origin).toString()
  const state = createPilotOauthState(returnTo)
  writePilotOauthStateCookie(event, state)

  const authorizeUrl = new URL('/api/pilot/oauth/authorize', nexusOrigin)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('state', state)

  return sendRedirect(event, authorizeUrl.toString(), 302)
})
