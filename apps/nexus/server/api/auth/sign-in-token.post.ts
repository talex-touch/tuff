import { clerkClient } from '@clerk/nuxt/server'
import { createAppToken, requireAuth } from '../../utils/auth'

/**
 * Create a sign-in token for the current user
 * This allows the desktop app to authenticate using the browser session
 */
export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)

  try {
    // Create a sign-in token that can be used by the desktop app
    const signInToken = await clerkClient(event).signInTokens.createSignInToken({
      userId,
      expiresInSeconds: 60, // Short expiry for security
    })

    let appToken: string | null = null
    try {
      appToken = createAppToken(userId)
    }
    catch (error) {
      console.warn('[SignInToken] App token disabled:', error)
    }

    return {
      token: signInToken.token,
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
