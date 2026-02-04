import { createAppToken, requireAuth } from '../../utils/auth'

/**
 * Create a sign-in token for the current user
 * This allows the desktop app to authenticate using the browser session
 */
export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)

  try {
    let appToken: string | null = null
    try {
      appToken = await createAppToken(event, userId)
    }
    catch (error) {
      console.warn('[SignInToken] App token disabled:', error)
    }

    return {
      appToken,
    }
  }
  catch (error) {
    console.error('[SignInToken] Failed to create sign-in token:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to create sign-in token',
    })
  }
})
