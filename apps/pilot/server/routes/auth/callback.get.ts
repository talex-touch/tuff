import type { H3Event } from 'h3'
import { createError, getQuery, getRequestURL, sendRedirect } from 'h3'
import { resolvePilotConfigString, resolvePilotNexusOrigin } from '../../utils/pilot-config'
import { parsePilotOauthReturnTo, requirePilotOauthState } from '../../utils/pilot-oauth'
import { writePilotSessionCookie } from '../../utils/pilot-session'

interface TokenExchangeResponse {
  userId?: string
}

async function exchangeOauthCode(
  event: H3Event,
  code: string,
  redirectUri: string,
): Promise<string> {
  const nexusOrigin = resolvePilotNexusOrigin(event, { internal: true })
  const oauthClientId = resolvePilotConfigString(
    event,
    'nexusOauthClientId',
    ['PILOT_NEXUS_OAUTH_CLIENT_ID'],
  )
  const oauthClientSecret = resolvePilotConfigString(
    event,
    'nexusOauthClientSecret',
    ['PILOT_NEXUS_OAUTH_CLIENT_SECRET'],
  )

  if (!nexusOrigin || !oauthClientId || !oauthClientSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Pilot oauth configuration is incomplete.',
    })
  }

  let response: Response
  try {
    response = await fetch(`${nexusOrigin}/api/pilot/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: oauthClientId,
        client_secret: oauthClientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })
  }
  catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to exchange oauth code.',
    })
  }

  if (!response.ok) {
    throw createError({
      statusCode: response.status === 401 ? 401 : 502,
      statusMessage: 'Failed to exchange oauth code.',
    })
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  if (!contentType.includes('application/json')) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to exchange oauth code.',
    })
  }

  let payload: TokenExchangeResponse
  try {
    payload = await response.json() as TokenExchangeResponse
  }
  catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to exchange oauth code.',
    })
  }

  const userId = String(payload?.userId || '').trim()
  if (!userId) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Oauth token response missing userId.',
    })
  }

  return userId
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const oauthCode = String(query.code || '').trim()
  const oauthState = String(query.state || '').trim()
  if (!oauthCode || !oauthState) {
    throw createError({
      statusCode: 400,
      statusMessage: 'code and state are required.',
    })
  }

  requirePilotOauthState(event, oauthState)
  const returnTo = parsePilotOauthReturnTo(oauthState)
  const redirectUri = new URL('/auth/callback', getRequestURL(event).origin).toString()
  const userId = await exchangeOauthCode(event, oauthCode, redirectUri)

  writePilotSessionCookie(event, userId)

  return sendRedirect(event, returnTo, 302)
})
