import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppEvents } from '@talex-touch/utils/transport/events'

const sendMock = vi.hoisted(() => vi.fn())

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: sendMock
  })
}))

vi.mock('~/modules/channel/storage', () => ({
  appSetting: {
    dev: {
      authServer: 'production'
    }
  }
}))

function createStorageMock(initial: Record<string, string> = {}): Storage {
  const data = new Map<string, string>(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    clear() {
      data.clear()
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null
    },
    removeItem(key: string) {
      data.delete(key)
    },
    setItem(key: string, value: string) {
      data.set(key, value)
    }
  }
}

describe('auth-env legacy cleanup', () => {
  const secureStore = new Map<string, string>()

  beforeEach(() => {
    secureStore.clear()
    sendMock.mockReset()
    sendMock.mockImplementation(async (event, payload) => {
      const eventName =
        event &&
        typeof event === 'object' &&
        typeof (event as { toEventName?: () => string }).toEventName === 'function'
          ? (event as { toEventName: () => string }).toEventName()
          : String(event)
      if (eventName === AppEvents.system.getSecureValue.toEventName()) {
        const key = payload?.key as string
        return secureStore.get(key) ?? null
      }
      if (eventName === AppEvents.system.setSecureValue.toEventName()) {
        const key = payload?.key as string
        const value = payload?.value as string | null
        if (typeof value === 'string' && value.length > 0) {
          secureStore.set(key, value)
        } else {
          secureStore.delete(key)
        }
      }
      return null
    })
  })

  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('clears legacy localStorage values without importing them into secure storage', async () => {
    vi.stubGlobal('window', {
      localStorage: createStorageMock({
        'auth.token': 'token-v1',
        'auth.deviceId': 'device-1',
        'auth.deviceName': 'MacBook'
      })
    })

    const { cleanupLegacyAuthEnvStorage, getAuthSensitiveValue } = await import('./auth-env')
    await cleanupLegacyAuthEnvStorage()

    expect(await getAuthSensitiveValue('token')).toBeNull()
    expect(await getAuthSensitiveValue('deviceId')).toBeNull()
    expect(await getAuthSensitiveValue('deviceName')).toBeNull()
    expect(window.localStorage.getItem('auth.token')).toBeNull()
    expect(window.localStorage.getItem('auth.deviceId')).toBeNull()
    expect(window.localStorage.getItem('auth.deviceName')).toBeNull()
  })

  it('keeps existing secure values and still clears local legacy keys', async () => {
    secureStore.set('auth.token', 'secure-token')
    vi.stubGlobal('window', {
      localStorage: createStorageMock({
        auth_token: 'legacy-token'
      })
    })

    const { cleanupLegacyAuthEnvStorage, getAuthSensitiveValue } = await import('./auth-env')
    await cleanupLegacyAuthEnvStorage()

    expect(await getAuthSensitiveValue('token')).toBe('secure-token')
    expect(window.localStorage.getItem('auth_token')).toBeNull()
  })
})
