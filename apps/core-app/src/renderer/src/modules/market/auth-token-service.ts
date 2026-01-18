import { useClerkProvider } from '@talex-touch/utils/renderer'
import {
  clearAppAuthToken,
  getAppAuthToken,
  getAuthBaseUrl,
  getDevAuthToken,
  isLocalAuthMode,
  setAppAuthToken
} from '../auth/auth-env'

let cachedToken: string | null = null
let tokenExpiry: number = 0

const APP_TOKEN_REFRESH_WINDOW_MS = 12 * 60 * 60 * 1000

function getJwtExpiryMs(token: string): number | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }
  try {
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')
    const raw = atob(payload)
    const parsed = JSON.parse(raw) as { exp?: number }
    if (typeof parsed.exp === 'number') {
      return parsed.exp * 1000
    }
  } catch {
    return null
  }
  return null
}

async function refreshAppToken(appToken: string): Promise<string | null> {
  const url = new URL('/api/auth/sign-in-token', getAuthBaseUrl()).toString()
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appToken}`
      }
    })
    if (!response.ok) {
      return null
    }
    const data = (await response.json()) as { appToken?: string | null }
    if (data?.appToken) {
      setAppAuthToken(data.appToken)
      return data.appToken
    }
  } catch {
    return null
  }
  return null
}

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

  const appToken = getAppAuthToken()
  if (appToken) {
    const expiry = getJwtExpiryMs(appToken)
    if (expiry && expiry - now <= APP_TOKEN_REFRESH_WINDOW_MS) {
      const refreshed = await refreshAppToken(appToken)
      if (refreshed) {
        cachedToken = refreshed
        tokenExpiry = getJwtExpiryMs(refreshed) ?? now + 50 * 1000
        return refreshed
      }
    }

    cachedToken = appToken
    tokenExpiry = expiry ?? now + 50 * 1000
    return appToken
  }

  const devToken = getDevAuthToken()
  if (devToken) {
    cachedToken = devToken
    tokenExpiry = now + 50 * 1000
    return devToken
  }

  if (isLocalAuthMode()) {
    return null
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
  } catch (error) {
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
  clearAppAuthToken()
}

/**
 * Check if user is authenticated (has valid token)
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthToken()
  return token !== null
}
