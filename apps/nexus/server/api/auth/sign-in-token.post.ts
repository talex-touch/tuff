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
  const { userId, deviceId } = await requireAuth(event)

  let appToken: string | null = null

  try {
    if (deviceId !== undefined) {
      appToken = await createAppToken(event, userId, { deviceId })
    }
    else {
      appToken = await createAppToken(event, userId)
    }
  }
  catch {
  }

  if (!appToken) {
    try {
      appToken = await createAppToken(event, userId, { deviceId: null })
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
