import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getMainConfigMock,
  saveMainConfigMock,
  subscribeMainConfigMock,
  getSecureStoreHealthMock,
  getSecureStoreValueMock,
  setSecureStoreValueMock,
  networkRequestMock,
  transportOnMock,
  transportBroadcastMock,
  openExternalMock,
  authLoggerMock
} = vi.hoisted(() => ({
  getMainConfigMock: vi.fn(),
  saveMainConfigMock: vi.fn(),
  subscribeMainConfigMock: vi.fn(() => vi.fn()),
  getSecureStoreHealthMock: vi.fn(),
  getSecureStoreValueMock: vi.fn(),
  setSecureStoreValueMock: vi.fn(),
  networkRequestMock: vi.fn(),
  transportOnMock: vi.fn(() => vi.fn()),
  transportBroadcastMock: vi.fn(),
  openExternalMock: vi.fn(),
  authLoggerMock: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@talex-touch/utils', () => ({
  StorageList: {
    APP_SETTING: 'app-setting'
  }
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: vi.fn(() => authLoggerMock)
}))

vi.mock('@talex-touch/utils/common/storage/entity/app-settings', () => ({
  appSettingOriginData: {
    sync: {
      enabled: false,
      userOverridden: false,
      autoEnabledAt: '',
      lastActivityAt: '',
      lastPushAt: '',
      lastPullAt: '',
      status: 'idle',
      lastSuccessAt: '',
      lastErrorAt: '',
      lastErrorCode: '',
      lastErrorMessage: '',
      consecutiveFailures: 0,
      queueDepth: 0,
      nextPullAt: '',
      cursor: 0,
      opSeq: 0,
      lastConflictAt: '',
      lastConflictCount: 0,
      blockedReason: ''
    }
  }
}))

vi.mock('@talex-touch/utils/env', () => ({
  getTuffBaseUrl: vi.fn(() => 'https://example.test'),
  isDevEnv: vi.fn(() => false)
}))

vi.mock('@talex-touch/utils/transport/event/builder', () => ({
  defineRawEvent: vi.fn((name: string) => ({
    toEventName: () => name
  }))
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    on: transportOnMock,
    broadcast: transportBroadcastMock
  }))
}))

vi.mock('electron', () => ({
  shell: {
    openExternal: openExternalMock
  }
}))

vi.mock('../../core/runtime-accessor', () => ({
  resolveMainRuntime: vi.fn()
}))

vi.mock('../../utils/secure-store', () => ({
  getSecureStoreHealth: getSecureStoreHealthMock,
  getSecureStoreValue: getSecureStoreValueMock,
  setSecureStoreValue: setSecureStoreValueMock
}))

vi.mock('../abstract-base-module', () => ({
  BaseModule: class BaseModule {
    constructor(..._args: unknown[]) {}
  }
}))

vi.mock('../network', () => ({
  getNetworkService: vi.fn(() => ({
    request: networkRequestMock
  }))
}))

vi.mock('../storage', () => ({
  getMainConfig: getMainConfigMock,
  saveMainConfig: saveMainConfigMock,
  subscribeMainConfig: subscribeMainConfigMock
}))

type MockAppSetting = {
  auth?: {
    deviceId: string
    deviceName: string
    devicePlatform: string
    useSecureStorage?: boolean
    secureStorageUserOverridden?: boolean
    secureStorageReminderShown: boolean
    secureStorageUnavailable: boolean
  }
  security: {
    machineCodeHash: string
    machineCodeAttestedAt: string
  }
  sync: {
    enabled: boolean
  }
  dev: {
    authServer: 'production' | 'local'
  }
}

function createAppSetting(): MockAppSetting {
  return {
    auth: {
      deviceId: '',
      deviceName: '',
      devicePlatform: '',
      useSecureStorage: true,
      secureStorageUserOverridden: false,
      secureStorageReminderShown: false,
      secureStorageUnavailable: false
    },
    security: {
      machineCodeHash: '',
      machineCodeAttestedAt: ''
    },
    sync: {
      enabled: false
    },
    dev: {
      authServer: 'production'
    }
  }
}

let appSettingState: MockAppSetting

describe('auth secure storage preference', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    appSettingState = createAppSetting()
    getMainConfigMock.mockImplementation(() => appSettingState)
    saveMainConfigMock.mockImplementation((_key: string, nextValue: MockAppSetting) => {
      appSettingState = nextValue
    })
    subscribeMainConfigMock.mockReturnValue(vi.fn())
    getSecureStoreHealthMock.mockResolvedValue({
      backend: 'safe-storage',
      available: true,
      degraded: false
    })
    getSecureStoreValueMock.mockResolvedValue(null)
    setSecureStoreValueMock.mockResolvedValue(true)
  })

  afterEach(async () => {
    const authModule = await import('./index')
    authModule.__test__.resetState()
  })

  it('defaults missing secure storage preference to persistent protection mode', async () => {
    delete appSettingState.auth?.useSecureStorage

    const authModule = await import('./index')
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.loadAuthToken()

    expect(getSecureStoreHealthMock).toHaveBeenCalledWith('/tmp/tuff')
    expect(getSecureStoreValueMock).toHaveBeenCalledWith(
      '/tmp/tuff',
      'auth.token',
      'auth-token',
      expect.any(Function)
    )
    expect(setSecureStoreValueMock).not.toHaveBeenCalled()
    expect(appSettingState.auth?.useSecureStorage).toBe(true)
    expect(authModule.getAuthToken()).toBeNull()
  })

  it('does not touch secure storage when clearing a session-only token', async () => {
    const authModule = await import('./index')
    authModule.__test__.resetState()
    authModule.__test__.setState({
      appRootPath: '/tmp/tuff',
      authToken: 'memory-token',
      authUseSecureStorage: false
    })

    await authModule.__test__.clearAuthToken()

    expect(setSecureStoreValueMock).not.toHaveBeenCalled()
    expect(authModule.getAuthToken()).toBeNull()
  })

  it('does not touch secure storage during cold startup when session-only mode is enabled', async () => {
    appSettingState.auth!.useSecureStorage = false
    appSettingState.auth!.secureStorageUserOverridden = true

    const authModule = await import('./index')
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.loadAuthToken()

    expect(getSecureStoreHealthMock).not.toHaveBeenCalled()
    expect(getSecureStoreValueMock).not.toHaveBeenCalled()
    expect(setSecureStoreValueMock).not.toHaveBeenCalled()
    expect(authModule.getAuthToken()).toBeNull()
  })

  it('restores persisted auth token when secure storage stays enabled', async () => {
    getSecureStoreValueMock.mockResolvedValue('persisted-token')

    const authModule = await import('./index')
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.loadAuthToken()

    expect(getSecureStoreHealthMock).toHaveBeenCalledTimes(1)
    expect(getSecureStoreValueMock).toHaveBeenCalledWith(
      '/tmp/tuff',
      'auth.token',
      'auth-token',
      expect.any(Function)
    )
    expect(authModule.getAuthToken()).toBe('persisted-token')
  })

  it('clears persisted auth token when user explicitly disables secure storage', async () => {
    const authModule = await import('./index')
    authModule.__test__.resetState()
    authModule.__test__.setState({
      appRootPath: '/tmp/tuff',
      authUseSecureStorage: true
    })

    await authModule.__test__.handleAuthStoragePreferenceChanged({
      ...appSettingState,
      auth: {
        ...appSettingState.auth!,
        useSecureStorage: false,
        secureStorageUserOverridden: true
      }
    } as any)

    expect(setSecureStoreValueMock).toHaveBeenCalledWith(
      '/tmp/tuff',
      'auth.token',
      null,
      'auth-token',
      expect.any(Function)
    )
    expect(getSecureStoreHealthMock).not.toHaveBeenCalled()
  })

  it('migrates old default-disabled secure storage to persistent protection', async () => {
    appSettingState.auth!.useSecureStorage = false
    appSettingState.auth!.secureStorageUserOverridden = false
    getSecureStoreValueMock.mockResolvedValue('migrated-token')

    const authModule = await import('./index')
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.loadAuthToken()

    expect(appSettingState.auth?.useSecureStorage).toBe(true)
    expect(authModule.getAuthToken()).toBe('migrated-token')
  })

  it('persists in-memory token when user explicitly re-enables secure storage', async () => {
    const authModule = await import('./index')
    authModule.__test__.resetState()
    authModule.__test__.setState({
      appRootPath: '/tmp/tuff',
      authToken: 'memory-token',
      authUseSecureStorage: false
    })

    await authModule.__test__.handleAuthStoragePreferenceChanged({
      ...appSettingState,
      auth: {
        ...appSettingState.auth!,
        useSecureStorage: true
      }
    } as any)

    expect(getSecureStoreHealthMock).toHaveBeenCalledTimes(1)
    expect(setSecureStoreValueMock).toHaveBeenCalledWith(
      '/tmp/tuff',
      'auth.token',
      'memory-token',
      'auth-token',
      expect.any(Function)
    )
  })

  it('does not persist anything when re-enabling secure storage without an in-memory token', async () => {
    const authModule = await import('./index')
    authModule.__test__.resetState()
    authModule.__test__.setState({
      appRootPath: '/tmp/tuff',
      authToken: null,
      authUseSecureStorage: false
    })

    await authModule.__test__.handleAuthStoragePreferenceChanged({
      ...appSettingState,
      auth: {
        ...appSettingState.auth!,
        useSecureStorage: true
      }
    } as any)

    expect(getSecureStoreHealthMock).toHaveBeenCalledTimes(1)
    expect(setSecureStoreValueMock).not.toHaveBeenCalled()
  })

  it('keeps persistent auth token when system safeStorage falls back to local secret', async () => {
    getSecureStoreHealthMock.mockResolvedValue({
      backend: 'local-secret',
      available: true,
      degraded: true,
      reason: 'System safeStorage is unavailable'
    })
    getSecureStoreValueMock.mockResolvedValue('fallback-token')

    const authModule = await import('./index')
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.loadAuthToken()

    expect(appSettingState.auth?.secureStorageUnavailable).toBe(false)
    expect(authModule.getAuthToken()).toBe('fallback-token')
  })
})
