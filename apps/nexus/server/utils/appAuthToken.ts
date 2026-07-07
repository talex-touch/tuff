import { createError } from 'h3'
import { createAppToken, requireAuth } from './auth'

const LONG_TERM_APP_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30
const LONG_TERM_APP_TOKEN_OPTIONS = {
  ttlSeconds: LONG_TERM_APP_TOKEN_TTL_SECONDS,
  grantType: 'long' as const,
}

function resolveErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message)
    return error.message
  if (typeof error === 'string' && error.trim().length > 0)
    return error
  return fallback
}

export async function issueAppSignInToken(event: Parameters<typeof requireAuth>[0]) {
  const { userId, deviceId, authSource, tokenGrantType } = await requireAuth(event)

  if (authSource === 'app' && tokenGrantType === 'short') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Short-term app token cannot be refreshed. Please sign in again.',
    })
  }

  let appToken: string | null = null

  try {
    if (deviceId !== undefined) {
      appToken = await createAppToken(event, userId, {
        deviceId,
        ...LONG_TERM_APP_TOKEN_OPTIONS,
      })
    }
    else {
      appToken = await createAppToken(event, userId, LONG_TERM_APP_TOKEN_OPTIONS)
    }
  }
  catch {
  }

  if (!appToken) {
    try {
      appToken = await createAppToken(event, userId, {
        deviceId: null,
        ...LONG_TERM_APP_TOKEN_OPTIONS,
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
}
