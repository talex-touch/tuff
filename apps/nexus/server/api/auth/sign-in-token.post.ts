import { createAppToken, requireAuth } from '../../utils/auth'

function resolveErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message)
    return error.message
  if (typeof error === 'string' && error.trim().length > 0)
    return error
  return fallback
}

/**
 * Create a sign-in token for the current user
 * This allows the desktop app to authenticate using browser session or app bearer token.
 */
export default defineEventHandler(async (event) => {
  const { userId, deviceId, authSource, tokenGrantType } = await requireAuth(event)

  if (authSource === 'app' && tokenGrantType === 'short') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Short-term app token cannot be refreshed. Please sign in again.',
    })
  }

  const refreshTokenOptions = authSource === 'app'
    ? { ttlSeconds: 60 * 60 * 24, grantType: 'short' as const }
    : {}

  let appToken: string | null = null

  try {
    if (deviceId !== undefined) {
      appToken = await createAppToken(event, userId, {
        deviceId,
        ...refreshTokenOptions,
      })
    }
    else {
      appToken = await createAppToken(event, userId, refreshTokenOptions)
    }
  }
  catch {
  }

  if (!appToken) {
    try {
      appToken = await createAppToken(event, userId, {
        deviceId: null,
        ...refreshTokenOptions,
      })
    }
    catch (fallbackError) {
      const detail = resolveErrorMessage(fallbackError, 'Failed to create app sign-in token.')
      throw createError({
        statusCode: 500,
        statusMessage: detail,
      })
    }
  }

  return {
    appToken,
  }
})
