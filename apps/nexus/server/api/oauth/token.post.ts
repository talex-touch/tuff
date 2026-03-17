import { createError, readBody } from 'h3'
import { consumePilotOauthCode, getUserById } from '../../utils/authStore'
import { verifyOauthClientSecret } from '../../utils/oauthClientStore'

interface OauthTokenBody {
  grant_type?: string
  code?: string
  client_id?: string
  client_secret?: string
  redirect_uri?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<OauthTokenBody>(event)
  const grantType = String(body?.grant_type || '').trim()
  const code = String(body?.code || '').trim()
  const clientId = String(body?.client_id || '').trim()
  const clientSecret = String(body?.client_secret || '').trim()
  const redirectUri = String(body?.redirect_uri || '').trim()

  if (grantType !== 'authorization_code') {
    throw createError({
      statusCode: 400,
      statusMessage: 'grant_type must be authorization_code.',
    })
  }
  if (!code || !clientId || !redirectUri) {
    throw createError({
      statusCode: 400,
      statusMessage: 'code, client_id and redirect_uri are required.',
    })
  }
  if (!clientSecret) {
    throw createError({
      statusCode: 400,
      statusMessage: 'client_secret is required.',
    })
  }

  const verified = await verifyOauthClientSecret(event, {
    clientId,
    clientSecret,
  })
  if (!verified) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized.',
    })
  }

  const oauthCode = await consumePilotOauthCode(event, {
    code,
    clientId,
    redirectUri,
  })
  if (!oauthCode) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid or expired oauth code.',
    })
  }

  const user = await getUserById(event, oauthCode.userId)
  if (!user || user.status !== 'active') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Account disabled.',
    })
  }

  return {
    token_type: 'Bearer',
    expires_in: 60,
    client_id: oauthCode.clientId,
    userId: user.id,
  }
})
