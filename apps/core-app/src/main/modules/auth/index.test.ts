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
  authLoggerMock,
  resolveMainRuntimeMock
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
    debug: vi.fn(),
    error: vi.fn()
  },
  resolveMainRuntimeMock: vi.fn((ctx: unknown) => ctx)
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
    auth: {
      deviceId: '',
      deviceName: '',
      devicePlatform: '',
      useSecureStorage: false,
      secureStorageUserOverridden: false,
      secureStorageReminderShown: false,
      secureStorageUnavailable: false
    },
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

vi.mock('@talex-touch/utils/transport/event/builder', () => ({
  defineEvent: vi.fn((domain: string) => ({
    module(moduleName: string) {
      return {
        event(eventName: string) {
          return {
            define: vi.fn(() => ({
              toEventName: () => `${domain}:${moduleName}:${eventName}`
            }))
          }
        }
      }
    }
  })),
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
  resolveMainRuntime: resolveMainRuntimeMock
}))

vi.mock('../../utils/secure-store', () => ({
  getSecureStoreHealth: getSecureStoreHealthMock,
  getSecureStoreValue: getSecureStoreValueMock,
  setSecureStoreValue: setSecureStoreValueMock
}))

vi.mock('../../utils/legacy-alias-telemetry', () => ({
  withLegacyAliasTelemetry: vi.fn((handler) => handler)
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

vi.mock('../nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: vi.fn(() => 'https://example.test'),
  getRuntimeServerMode: vi.fn(() => 'production')
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
    runtimeServer: 'production' | 'local'
  }
}

function createAppSetting(): MockAppSetting {
  return {
    auth: {
      deviceId: '',
      deviceName: '',
      devicePlatform: '',
      useSecureStorage: false,
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
      runtimeServer: 'production'
    }
  }
}

let appSettingState: MockAppSetting
type AuthModuleTestApi = Awaited<typeof import('./index')>['__test__']
type AuthStoragePreferenceInput = Parameters<
  AuthModuleTestApi['handleAuthStoragePreferenceChanged']
>[0]

describe('auth secure storage preference', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resolveMainRuntimeMock.mockImplementation((ctx: unknown) => ctx)

    appSettingState = createAppSetting()
    getMainConfigMock.mockImplementation(() => appSettingState)
    saveMainConfigMock.mockImplementation((_key: string, nextValue: MockAppSetting) => {
      appSettingState = nextValue
    })
    subscribeMainConfigMock.mockReturnValue(vi.fn())
    getSecureStoreHealthMock.mockResolvedValue({
      backend: 'local-secret',
      available: true,
      degraded: false,
      reason: 'Using local encrypted root secret; system credential storage is disabled'
    })
    getSecureStoreValueMock.mockResolvedValue(null)
    setSecureStoreValueMock.mockResolvedValue(true)
  })

  afterEach(async () => {
    const authModule = await import('./index')
    authModule.__test__.resetState()
    delete process.env.TUFF_VISIBLE_EVIDENCE_AUTH
    delete process.env.TUFF_STARTUP_BENCHMARK_ONCE
    delete process.env.TUFF_VISIBLE_EVIDENCE_AUTH_BROWSER_OPEN_FAIL
    delete process.env.TUFF_VISIBLE_EVIDENCE_AUTH_DEVICE_START_JSON
    delete process.env.TUFF_VISIBLE_EVIDENCE_AUTH_POLL_STATUS
    delete process.env.TUFF_VISIBLE_EVIDENCE_AUTH_POLL_DELAY_MS
  })

  it('defaults missing secure storage preference to session-only mode', async () => {
    delete appSettingState.auth?.useSecureStorage

    const authModule = await import('./index')
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.loadAuthToken()

    expect(getSecureStoreHealthMock).not.toHaveBeenCalled()
    expect(getSecureStoreValueMock).not.toHaveBeenCalled()
    expect(setSecureStoreValueMock).not.toHaveBeenCalled()
    expect(appSettingState.auth?.useSecureStorage).toBe(false)
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
    appSettingState.auth!.useSecureStorage = true
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
    } as AuthStoragePreferenceInput)

    expect(setSecureStoreValueMock).toHaveBeenCalledWith(
      '/tmp/tuff',
      'auth.token',
      null,
      'auth-token',
      expect.any(Function)
    )
    expect(getSecureStoreHealthMock).not.toHaveBeenCalled()
  })

  it('keeps old default-disabled secure storage in session-only mode', async () => {
    appSettingState.auth!.useSecureStorage = false
    appSettingState.auth!.secureStorageUserOverridden = false
    getSecureStoreValueMock.mockResolvedValue('migrated-token')

    const authModule = await import('./index')
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.loadAuthToken()

    expect(getSecureStoreHealthMock).not.toHaveBeenCalled()
    expect(getSecureStoreValueMock).not.toHaveBeenCalled()
    expect(appSettingState.auth?.useSecureStorage).toBe(false)
    expect(authModule.getAuthToken()).toBeNull()
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
    } as AuthStoragePreferenceInput)

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
    } as AuthStoragePreferenceInput)

    expect(getSecureStoreHealthMock).toHaveBeenCalledTimes(1)
    expect(setSecureStoreValueMock).not.toHaveBeenCalled()
  })

  it('keeps persistent auth token with local root secret storage', async () => {
    appSettingState.auth!.useSecureStorage = true
    getSecureStoreHealthMock.mockResolvedValue({
      backend: 'local-secret',
      available: true,
      degraded: false,
      reason: 'Using local encrypted root secret; system credential storage is disabled'
    })
    getSecureStoreValueMock.mockResolvedValue('fallback-token')

    const authModule = await import('./index')
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.loadAuthToken()

    expect(appSettingState.auth?.secureStorageUnavailable).toBe(false)
    expect(authModule.getAuthToken()).toBe('fallback-token')
  })

  it('returns device auth recovery details when the browser cannot open', async () => {
    openExternalMock.mockRejectedValueOnce(new Error('open failed'))
    networkRequestMock
      .mockResolvedValueOnce({
        status: 200,
        data: {
          deviceCode: 'device-code-1',
          userCode: 'ABC123',
          authorizeUrl: 'https://example.test/sign-in?redirect_url=%2Fdevice-auth%3Fcode%3DABC123',
          expiresAt: '2026-05-17T05:00:00.000Z',
          intervalSeconds: 3
        }
      })
      .mockResolvedValue({
        status: 400,
        data: { status: 'pending' }
      })

    const authModule = await import('./index')
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    const module = new authModule.AuthModule()
    module.onInit({
      app: {
        rootPath: '/tmp/tuff'
      },
      channel: {
        keyManager: {},
        sendMain: vi.fn()
      }
    } as unknown as Parameters<typeof module.onInit>[0])

    const loginHandler = (
      transportOnMock.mock.calls as unknown as Array<
        [{ toEventName?: () => string }, (payload: unknown) => Promise<unknown>]
      >
    ).find(([event]) => event?.toEventName?.() === 'auth:session:login')?.[1]

    expect(loginHandler).toBeTypeOf('function')
    if (!loginHandler) throw new Error('login handler was not registered')

    const response = await loginHandler({ mode: 'sign-in' })

    expect(response).toMatchObject({
      initiated: true,
      authorizeUrl: 'https://example.test/sign-in?redirect_url=%2Fdevice-auth%3Fcode%3DABC123',
      userCode: 'ABC123',
      expiresAt: '2026-05-17T05:00:00.000Z',
      browserOpenFailed: true
    })
    expect(openExternalMock).toHaveBeenCalledWith(
      'https://example.test/sign-in?redirect_url=%2Fdevice-auth%3Fcode%3DABC123'
    )
    expect(authLoggerMock.warn).toHaveBeenCalledWith(
      'Failed to open browser login page',
      expect.objectContaining({ error: expect.any(Error) })
    )
  })

  it('uses visible auth evidence device flow only in benchmark evidence mode', async () => {
    process.env.TUFF_VISIBLE_EVIDENCE_AUTH = '1'
    process.env.TUFF_STARTUP_BENCHMARK_ONCE = '1'
    process.env.TUFF_VISIBLE_EVIDENCE_AUTH_BROWSER_OPEN_FAIL = '1'
    process.env.TUFF_VISIBLE_EVIDENCE_AUTH_POLL_STATUS = 'timeout'
    process.env.TUFF_VISIBLE_EVIDENCE_AUTH_POLL_DELAY_MS = '1'

    const authModule = await import('./index')
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    const module = new authModule.AuthModule()
    module.onInit({
      app: {
        rootPath: '/tmp/tuff'
      },
      channel: {
        keyManager: {},
        sendMain: vi.fn()
      }
    } as unknown as Parameters<typeof module.onInit>[0])

    const loginHandler = (
      transportOnMock.mock.calls as unknown as Array<
        [{ toEventName?: () => string }, (payload: unknown) => Promise<unknown>]
      >
    ).find(([event]) => event?.toEventName?.() === 'auth:session:login')?.[1]

    expect(loginHandler).toBeTypeOf('function')
    if (!loginHandler) throw new Error('login handler was not registered')

    const response = await loginHandler({ mode: 'sign-in' })

    expect(networkRequestMock).not.toHaveBeenCalled()
    expect(openExternalMock).not.toHaveBeenCalled()
    expect(response).toMatchObject({
      initiated: true,
      authorizeUrl: 'https://example.test/device-auth?code=TUFF26',
      userCode: 'TUFF26',
      browserOpenFailed: true
    })
  })
})
