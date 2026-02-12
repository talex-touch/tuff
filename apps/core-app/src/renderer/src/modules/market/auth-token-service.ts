import { useAuthState } from '@talex-touch/utils/renderer'
import {
  clearAppAuthToken,
  getAppAuthToken,
  getAppDeviceId,
  getAppDeviceName,
  getAppDevicePlatform,
  getAuthBaseUrl,
  setAppAuthToken
} from '../auth/auth-env'

let cachedToken: string | null = null
let tokenExpiry: number = 0
let unauthorizedHandling = false

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
  const url = new URL('/api/app-auth/sign-in-token', getAuthBaseUrl()).toString()
  try {
    const deviceId = getAppDeviceId()
    const deviceName = getAppDeviceName()
    const devicePlatform = getAppDevicePlatform()
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appToken}`,
        ...(deviceId ? { 'x-device-id': deviceId } : {}),
        ...(deviceName ? { 'x-device-name': deviceName } : {}),
        ...(devicePlatform ? { 'x-device-platform': devicePlatform } : {})
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
 * Get app authentication token for API requests
 * Tokens are cached for 50 seconds
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

  return null
}

/**
 * Clear cached token (e.g., on logout)
 */
export function clearAuthToken(): void {
  cachedToken = null
  tokenExpiry = 0
  clearAppAuthToken()
}

export async function handleUnauthorized(_context?: string): Promise<void> {
  if (unauthorizedHandling) {
    return
  }

  unauthorizedHandling = true
  try {
    clearAuthToken()

    const { authState } = useAuthState()
    authState.isLoaded = true
    authState.isSignedIn = false
    authState.user = null
    authState.sessionId = null
  } finally {
    unauthorizedHandling = false
  }
}

/**
 * Check if user is authenticated (has valid token)
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthToken()
  return token !== null
}
