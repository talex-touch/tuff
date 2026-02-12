import { getTuffBaseUrl, hasNavigator, isDevEnv } from '@talex-touch/utils/env'
import { appSetting } from '~/modules/channel/storage'

export const APP_AUTH_STORAGE_KEY = 'tuff-app-auth-token'
export const APP_DEVICE_ID_KEY = 'tuff-app-device-id'
export const APP_DEVICE_NAME_KEY = 'tuff-app-device-name'
const LOCAL_AUTH_BASE_URL = 'http://localhost:3200'

export function isLocalAuthMode(): boolean {
  return isDevEnv() && appSetting?.dev?.authServer === 'local'
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
  } catch {
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

export function getAppDeviceId(): string | null {
  if (typeof localStorage === 'undefined') {
    return null
  }
  let deviceId = localStorage.getItem(APP_DEVICE_ID_KEY)
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem(APP_DEVICE_ID_KEY, deviceId)
  }
  return deviceId
}

export function getAppDevicePlatform(): string {
  if (!hasNavigator()) {
    return 'desktop'
  }
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  return nav.userAgentData?.platform || navigator.platform || 'desktop'
}

export function getAppDeviceName(): string | null {
  if (typeof localStorage === 'undefined') {
    return null
  }
  let name = localStorage.getItem(APP_DEVICE_NAME_KEY)
  if (!name) {
    name = `Desktop-${getAppDevicePlatform()}`
    localStorage.setItem(APP_DEVICE_NAME_KEY, name)
  }
  return name
}

export function setAppDeviceName(name: string): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.setItem(APP_DEVICE_NAME_KEY, name)
}
