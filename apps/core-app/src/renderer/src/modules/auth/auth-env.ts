import { getTuffBaseUrl, hasWindow, isDevEnv } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { appSetting } from '~/modules/channel/storage'

const LOCAL_AUTH_BASE_URL = 'http://localhost:3200'
const transport = useTuffTransport()

const AUTH_SECURE_KEYS = {
  token: 'auth.token',
  deviceId: 'auth.device-id',
  deviceName: 'auth.device-name'
} as const

const AUTH_LEGACY_LOCAL_KEYS: Record<AuthSensitiveKey, string[]> = {
  token: ['auth.token', 'auth_token', 'authToken'],
  deviceId: ['auth.deviceId', 'auth.device-id', 'auth_device_id'],
  deviceName: ['auth.deviceName', 'auth.device-name', 'auth_device_name']
}

let legacyAuthMigrated = false

export type AuthSensitiveKey = keyof typeof AUTH_SECURE_KEYS

export function isLocalAuthMode(): boolean {
  return isDevEnv() && appSetting?.dev?.authServer === 'local'
}

export function getAuthBaseUrl(): string {
  return isLocalAuthMode() ? LOCAL_AUTH_BASE_URL : getTuffBaseUrl()
}

function getSafeLocalStorage(): Storage | null {
  if (!hasWindow()) {
    return null
  }
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function normalizeSecureValue(rawValue: string | null | undefined): string | null {
  if (typeof rawValue !== 'string') {
    return null
  }
  const value = rawValue.trim()
  return value.length > 0 ? value : null
}

export async function getAuthSensitiveValue(key: AuthSensitiveKey): Promise<string | null> {
  try {
    const value = await transport.send(AppEvents.system.getSecureValue, {
      key: AUTH_SECURE_KEYS[key]
    })
    return normalizeSecureValue(typeof value === 'string' ? value : null)
  } catch {
    return null
  }
}

export async function setAuthSensitiveValue(
  key: AuthSensitiveKey,
  value: string | null
): Promise<void> {
  await transport.send(AppEvents.system.setSecureValue, {
    key: AUTH_SECURE_KEYS[key],
    value: normalizeSecureValue(value)
  })
}

export async function migrateLegacyAuthEnvToSecureStorage(): Promise<void> {
  if (legacyAuthMigrated) {
    return
  }

  const localStorage = getSafeLocalStorage()
  if (!localStorage) {
    legacyAuthMigrated = true
    return
  }

  for (const key of Object.keys(AUTH_SECURE_KEYS) as AuthSensitiveKey[]) {
    const secureValue = await getAuthSensitiveValue(key)
    if (secureValue) {
      for (const legacyKey of AUTH_LEGACY_LOCAL_KEYS[key]) {
        localStorage.removeItem(legacyKey)
      }
      continue
    }

    let migratedValue: string | null = null
    for (const legacyKey of AUTH_LEGACY_LOCAL_KEYS[key]) {
      const value = normalizeSecureValue(localStorage.getItem(legacyKey))
      if (!value) {
        continue
      }
      migratedValue = value
      break
    }

    if (migratedValue) {
      await setAuthSensitiveValue(key, migratedValue)
    }

    for (const legacyKey of AUTH_LEGACY_LOCAL_KEYS[key]) {
      localStorage.removeItem(legacyKey)
    }
  }

  legacyAuthMigrated = true
}
