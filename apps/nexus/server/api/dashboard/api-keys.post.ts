import { createApiKey } from '../../utils/apiKeyStore'
import { requireAuth } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)

  const body = await readBody(event)
  const { name, scopes, expiresInDays } = body

  if (!name || typeof name !== 'string' || name.length < 1 || name.length > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid key name' })
  }

  const validScopes = ['plugin:publish', 'plugin:read', 'account:read']
  const keyScopes = Array.isArray(scopes)
    ? scopes.filter(s => validScopes.includes(s))
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
