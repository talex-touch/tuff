import { createError, readBody } from 'h3'
import { createApiKey } from '../../utils/apiKeyStore'
import { isApiKeyScope } from '../../utils/apiKeyScopes'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)

  const body = await readBody(event)
  const { name, scopes, expiresInDays } = body

  if (!name || typeof name !== 'string' || name.length < 1 || name.length > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid key name' })
  }

  const keyScopes = Array.isArray(scopes)
    ? scopes.filter(isApiKeyScope)
    : ['plugin:publish']

  const expiryDays = typeof expiresInDays === 'number' && expiresInDays > 0
    ? Math.min(expiresInDays, 365)
    : undefined

  const apiKey = await createApiKey(event, userId, name.trim(), keyScopes, expiryDays)

  return {
    key: apiKey,
    message: 'API key created. Copy the secret key now - it will not be shown again.',
  }
})
