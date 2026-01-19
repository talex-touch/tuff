import { getTuffBaseUrl } from '@talex-touch/utils/env'
import { appSetting } from '~/modules/channel/storage'

export const DEV_AUTH_STORAGE_KEY = 'tuff-dev-auth-user'
export const APP_AUTH_STORAGE_KEY = 'tuff-app-auth-token'
const LOCAL_AUTH_BASE_URL = 'http://localhost:3200'

export function isLocalAuthMode(): boolean {
  return import.meta.env.DEV && appSetting?.dev?.authServer === 'local'
}

export function getAuthBaseUrl(): string {
  return isLocalAuthMode() ? LOCAL_AUTH_BASE_URL : getTuffBaseUrl()
}

function decodeJwtPayload(token: string): { exp?: number } | null {
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
    return JSON.parse(raw) as { exp?: number }
  } catch (error) {
    console.warn('[auth-env] Failed to decode app auth token', error)
    return null
  }
}

export function getAppAuthToken(): string | null {
  if (typeof localStorage === 'undefined') {
    return null
  }
  const raw = localStorage.getItem(APP_AUTH_STORAGE_KEY)
  if (!raw) {
    return null
  }
  const payload = decodeJwtPayload(raw)
  if (payload?.exp && payload.exp * 1000 <= Date.now()) {
    localStorage.removeItem(APP_AUTH_STORAGE_KEY)
    return null
  }
  return raw
}

export function setAppAuthToken(token: string): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.setItem(APP_AUTH_STORAGE_KEY, token)
}

export function clearAppAuthToken(): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.removeItem(APP_AUTH_STORAGE_KEY)
}

export function clearDevAuthUser(): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.removeItem(DEV_AUTH_STORAGE_KEY)
}

export function getDevAuthToken(): string | null {
  if (!isLocalAuthMode()) {
    return null
  }

  if (typeof localStorage === 'undefined') {
    return null
  }

  try {
    const raw = localStorage.getItem(DEV_AUTH_STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw)
    return typeof parsed?.token === 'string' ? parsed.token : null
  } catch (error) {
    console.warn('[auth-env] Failed to read local auth token', error)
    return null
  }
}
