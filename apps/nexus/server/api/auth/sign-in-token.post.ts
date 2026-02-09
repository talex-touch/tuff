import { createAppToken, requireSessionAuth } from '../../utils/auth'

function resolveErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message)
    return error.message
  if (typeof error === 'string' && error.trim().length > 0)
    return error
  return fallback
}

/**
 * Create a sign-in token for the current user
 * This allows the desktop app to authenticate using the browser session
 */
export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)

  let appToken: string | null = null
  let primaryError: unknown = null

  try {
    appToken = await createAppToken(event, userId)
  }
  catch (error) {
    primaryError = error
    console.warn('[SignInToken] Create token with device binding failed, fallback to session-only token.', error)
  }

  if (!appToken) {
    try {
      appToken = await createAppToken(event, userId, { deviceId: null })
    }
    catch (fallbackError) {
      const detail = resolveErrorMessage(fallbackError, 'Failed to create app sign-in token.')
      console.error('[SignInToken] Failed to create sign-in token (fallback failed):', {
        primaryError: resolveErrorMessage(primaryError, 'unknown'),
        fallbackError: detail,
      })
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
