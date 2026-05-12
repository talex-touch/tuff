import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { getRuntimeNexusBaseUrl, getRuntimeServerMode } from '~/modules/nexus/runtime-base'

const transport = useTuffTransport()

const AUTH_SECURE_KEYS = {
  token: 'auth.token',
  deviceId: 'auth.device-id',
  deviceName: 'auth.device-name'
} as const

export type AuthSensitiveKey = keyof typeof AUTH_SECURE_KEYS

export function isLocalAuthMode(): boolean {
  return getRuntimeServerMode() === 'local'
}

export function getAuthBaseUrl(): string {
  return getRuntimeNexusBaseUrl()
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
