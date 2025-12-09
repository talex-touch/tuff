import { useClerkProvider } from '@talex-touch/utils/renderer'

let cachedToken: string | null = null
let tokenExpiry: number = 0

/**
 * Get Clerk authentication token for API requests
 * Tokens are cached for 50 seconds (Clerk tokens expire after 60s)
 */
export async function getAuthToken(): Promise<string | null> {
  const now = Date.now()

  // Return cached token if still valid
  if (cachedToken && tokenExpiry > now) {
    return cachedToken
  }

  try {
    const { getToken } = useClerkProvider()
    const token = await getToken()

    if (token) {
      cachedToken = token
      // Cache for 50 seconds (tokens expire after 60s)
      tokenExpiry = now + 50 * 1000
    }

    return token
  }
  catch (error) {
    console.warn('[AuthTokenService] Failed to get token:', error)
    return null
  }
}

/**
 * Clear cached token (e.g., on logout)
 */
export function clearAuthToken(): void {
  cachedToken = null
  tokenExpiry = 0
}

/**
 * Check if user is authenticated (has valid token)
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthToken()
  return token !== null
}
