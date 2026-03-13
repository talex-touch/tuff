import type { H3Event } from 'h3'
import { networkClient } from '@talex-touch/utils/network'
import { createError, getQuery, getRequestURL, sendRedirect } from 'h3'
import { resolvePilotConfigString, resolvePilotNexusOrigin } from '../../utils/pilot-config'
import { mergePilotGuestDataAfterAuth } from '../../utils/pilot-guest-merge'
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

  let response: { status: number, headers: Record<string, string>, data: unknown }
  try {
    response = await networkClient.request({
      method: 'POST',
      url: `${nexusOrigin}/api/pilot/oauth/token`,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: {
        grant_type: 'authorization_code',
        client_id: oauthClientId,
        client_secret: oauthClientSecret,
        code,
        redirect_uri: redirectUri,
      },
      validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
    })
  }
  catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to exchange oauth code.',
    })
  }

  if (response.status < 200 || response.status >= 300) {
    throw createError({
      statusCode: response.status === 401 ? 401 : 502,
      statusMessage: 'Failed to exchange oauth code.',
    })
  }

  const contentType = String(response.headers['content-type'] || '').toLowerCase()
  if (!contentType.includes('application/json')) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to exchange oauth code.',
    })
  }

  const payload = response.data as TokenExchangeResponse

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

  await writePilotSessionCookie(event, userId)
  await mergePilotGuestDataAfterAuth(event, userId, 'login')

  return sendRedirect(event, returnTo, 302)
})
