import type { H3Event } from 'h3'
import { createError, getQuery, getRequestURL, sendRedirect } from 'h3'
import { requireSessionAuth } from '../../../utils/auth'
import { createPilotOauthCode } from '../../../utils/authStore'
import { getActiveOauthClientByClientId } from '../../../utils/oauthClientStore'

const DEFAULT_CODE_TTL_MS = 60_000

function parseRedirectUri(rawValue: unknown): string {
  const raw = String(rawValue || '').trim()
  if (!raw) {
    throw createError({
      statusCode: 400,
      statusMessage: 'redirect_uri is required.',
    })
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  }
  catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'redirect_uri must be absolute.',
    })
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw createError({
      statusCode: 400,
      statusMessage: 'redirect_uri protocol is invalid.',
    })
  }

  return parsed.toString()
}

async function assertClientAndRedirectAllowed(
  event: H3Event,
  clientId: string,
  redirectUri: string,
): Promise<void> {
  const client = await getActiveOauthClientByClientId(event, clientId)
  if (!client) {
    throw createError({
      statusCode: 400,
      statusMessage: 'client_id is invalid.',
    })
  }

  if (!client.redirectUris.includes(redirectUri)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'redirect_uri is not allowed.',
    })
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const responseType = String(query.response_type || '').trim()
  const clientId = String(query.client_id || '').trim()
  const redirectUri = parseRedirectUri(query.redirect_uri)
  const state = String(query.state || '').trim()

  if (responseType !== 'code') {
    throw createError({
      statusCode: 400,
      statusMessage: 'response_type must be code.',
    })
  }

  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'client_id is invalid.',
    })
  }
  await assertClientAndRedirectAllowed(event, clientId, redirectUri)

  let userId = ''
  try {
    const auth = await requireSessionAuth(event)
    userId = auth.userId
  }
  catch (error) {
    const statusCode = (error as { statusCode?: number } | null)?.statusCode
    if (statusCode === 401) {
      const requestUrl = getRequestURL(event)
      const signinUrl = new URL('/api/auth/signin', requestUrl.origin)
      signinUrl.searchParams.set('callbackUrl', requestUrl.toString())
      return sendRedirect(event, signinUrl.toString(), 302)
    }
    throw error
  }

  const oauthCode = await createPilotOauthCode(event, {
    clientId,
    userId,
    redirectUri,
    ttlMs: DEFAULT_CODE_TTL_MS,
  })

  const redirectTarget = new URL(redirectUri)
  redirectTarget.searchParams.set('code', oauthCode.code)
  if (state) {
    redirectTarget.searchParams.set('state', state)
  }

  return sendRedirect(event, redirectTarget.toString(), 302)
})
