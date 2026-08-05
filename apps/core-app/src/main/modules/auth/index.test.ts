import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as AuthModule from './index'

const {
  getMainConfigMock,
  saveMainConfigMock,
  saveMainConfigDurableMock,
  subscribeMainConfigMock,
  getSecureStoreHealthMock,
  getSecureStoreValueStrictMock,
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
  saveMainConfigDurableMock: vi.fn(),
  subscribeMainConfigMock: vi.fn(() => vi.fn()),
  getSecureStoreHealthMock: vi.fn(),
  getSecureStoreValueStrictMock: vi.fn(),
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
      devicePlatform: ''
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
  getSecureStoreValueStrict: getSecureStoreValueStrictMock,
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

vi.mock('../nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: vi.fn(() => 'https://example.test'),
  getRuntimeServerMode: vi.fn(() => 'production')
}))

vi.mock('../storage', () => ({
  getMainConfig: getMainConfigMock,
  saveMainConfig: saveMainConfigMock,
  saveMainConfigDurable: saveMainConfigDurableMock,
  subscribeMainConfig: subscribeMainConfigMock
}))

type MockAppSetting = {
  auth?: {
    deviceId: string
    deviceName: string
    devicePlatform: string
    requiresReauthenticationOnNextStartup?: boolean
    cachedUser?: unknown
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
      devicePlatform: ''
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

async function importAuthModule(): Promise<typeof AuthModule> {
  // Dynamic import is intentional: each test resets modules so auth state is rebuilt from current mocks.
  return await import('./index')
}

describe('forced auth credential persistence', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resolveMainRuntimeMock.mockImplementation((ctx: unknown) => ctx)

    appSettingState = createAppSetting()
    getMainConfigMock.mockImplementation(() => appSettingState)
    saveMainConfigMock.mockImplementation((_key: string, nextValue: MockAppSetting) => {
      appSettingState = nextValue
    })
    saveMainConfigDurableMock.mockImplementation(
      async (_key: string, nextValue: MockAppSetting) => {
        appSettingState = nextValue
        return { success: true, version: 1 }
      }
    )
    subscribeMainConfigMock.mockReturnValue(vi.fn())
    getSecureStoreHealthMock.mockResolvedValue({
      backend: 'local-secret',
      available: true,
      degraded: false,
      reason: 'Using local encrypted root secret; system credential storage is disabled'
    })
    getSecureStoreValueStrictMock.mockResolvedValue(null)
    setSecureStoreValueMock.mockResolvedValue(true)
  })

  afterEach(async () => {
    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    delete process.env.TUFF_VISIBLE_EVIDENCE_AUTH
    delete process.env.TUFF_STARTUP_BENCHMARK_ONCE
    delete process.env.TUFF_VISIBLE_EVIDENCE_AUTH_BROWSER_OPEN_FAIL
    delete process.env.TUFF_VISIBLE_EVIDENCE_AUTH_DEVICE_START_JSON
    delete process.env.TUFF_VISIBLE_EVIDENCE_AUTH_POLL_STATUS
    delete process.env.TUFF_VISIBLE_EVIDENCE_AUTH_POLL_DELAY_MS
  })

  it('normalizes legacy credential preference fields and restores only the protected token', async () => {
    Object.assign(appSettingState.auth as Record<string, unknown>, {
      useSecureStorage: false,
      secureStorageUserOverridden: true,
      secureStorageReminderShown: true,
      secureStorageUnavailable: true
    })
    getSecureStoreValueStrictMock.mockResolvedValue('persisted-token')

    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.loadAuthToken()

    expect(appSettingState.auth).not.toHaveProperty('useSecureStorage')
    expect(appSettingState.auth).not.toHaveProperty('secureStorageUserOverridden')
    expect(appSettingState.auth).not.toHaveProperty('secureStorageReminderShown')
    expect(appSettingState.auth).not.toHaveProperty('secureStorageUnavailable')
    expect(saveMainConfigMock).toHaveBeenCalledWith('app-setting', appSettingState)
    expect(getSecureStoreValueStrictMock).toHaveBeenCalledWith(
      '/tmp/tuff',
      'auth.token',
      'auth-token',
      expect.any(Function)
    )
    expect(authModule.getAuthToken()).toBe('persisted-token')
  })

  it('does not read or restore an auth token when protected storage is unavailable', async () => {
    getSecureStoreHealthMock.mockResolvedValue({
      backend: 'unavailable',
      available: false,
      degraded: true,
      reason: 'Local encrypted storage is unavailable'
    })
    getSecureStoreValueStrictMock.mockResolvedValue('must-not-restore')

    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.loadAuthToken()

    expect(getSecureStoreValueStrictMock).not.toHaveBeenCalled()
    expect(appSettingState.auth?.requiresReauthenticationOnNextStartup).toBe(true)
    expect(authModule.getAuthToken()).toBeNull()
  })

  it('keeps a newly authenticated token in memory only when protected storage cannot write', async () => {
    setSecureStoreValueMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.setAuthToken('memory-token')
    expect(authModule.getAuthToken()).toBe('memory-token')
    expect(appSettingState.auth?.requiresReauthenticationOnNextStartup).toBe(true)
    expect(saveMainConfigDurableMock).toHaveBeenNthCalledWith(
      1,
      'app-setting',
      expect.objectContaining({
        auth: expect.objectContaining({ requiresReauthenticationOnNextStartup: true })
      }),
      { force: true }
    )
    expect(setSecureStoreValueMock).toHaveBeenNthCalledWith(
      1,
      '/tmp/tuff',
      'auth.token',
      'memory-token',
      'auth-token',
      expect.any(Function)
    )
    expect(setSecureStoreValueMock).toHaveBeenNthCalledWith(
      2,
      '/tmp/tuff',
      'auth.token',
      null,
      'auth-token',
      expect.any(Function)
    )

    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })
    getSecureStoreValueStrictMock.mockResolvedValue(null)

    await authModule.__test__.loadAuthToken()

    expect(getSecureStoreValueStrictMock).not.toHaveBeenCalled()
    expect(appSettingState.auth?.requiresReauthenticationOnNextStartup).toBe(false)
    expect(authModule.getAuthToken()).toBeNull()
  })

  it('persists the fail-closed marker before a protected token write and clears it only after success', async () => {
    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.setAuthToken('persisted-token')

    expect(saveMainConfigDurableMock).toHaveBeenNthCalledWith(
      1,
      'app-setting',
      expect.objectContaining({
        auth: expect.objectContaining({ requiresReauthenticationOnNextStartup: true })
      }),
      { force: true }
    )
    expect(setSecureStoreValueMock).toHaveBeenCalledWith(
      '/tmp/tuff',
      'auth.token',
      'persisted-token',
      'auth-token',
      expect.any(Function)
    )
    expect(saveMainConfigDurableMock).toHaveBeenNthCalledWith(
      2,
      'app-setting',
      expect.objectContaining({
        auth: expect.objectContaining({ requiresReauthenticationOnNextStartup: false })
      }),
      { force: true }
    )
    expect(appSettingState.auth?.requiresReauthenticationOnNextStartup).toBe(false)
  })

  it('does not write a new token when the fail-closed marker cannot persist', async () => {
    saveMainConfigDurableMock.mockResolvedValue({ success: false, version: 1 })

    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.setAuthToken('memory-token')

    expect(authModule.getAuthToken()).toBe('memory-token')
    expect(setSecureStoreValueMock).not.toHaveBeenCalledWith(
      '/tmp/tuff',
      'auth.token',
      'memory-token',
      'auth-token',
      expect.any(Function)
    )
    expect(setSecureStoreValueMock).toHaveBeenCalledWith(
      '/tmp/tuff',
      'auth.token',
      null,
      'auth-token',
      expect.any(Function)
    )
  })

  it('does not restore a stale protected token after a failed write leaves its cleanup incomplete', async () => {
    setSecureStoreValueMock.mockResolvedValueOnce(false).mockResolvedValueOnce(false)

    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.setAuthToken('memory-token')

    expect(appSettingState.auth?.requiresReauthenticationOnNextStartup).toBe(true)

    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })
    getSecureStoreValueStrictMock.mockResolvedValue('stale-token')
    setSecureStoreValueMock.mockResolvedValue(false)

    await authModule.__test__.loadAuthToken()

    expect(getSecureStoreValueStrictMock).not.toHaveBeenCalled()
    expect(authModule.getAuthToken()).toBeNull()
    expect(appSettingState.auth?.requiresReauthenticationOnNextStartup).toBe(true)
  })

  it('keeps the fail-closed marker when startup cleanup cannot remove a stale token', async () => {
    appSettingState.auth!.requiresReauthenticationOnNextStartup = true
    getSecureStoreValueStrictMock.mockResolvedValue('stale-token')
    setSecureStoreValueMock.mockResolvedValue(false)

    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.loadAuthToken()

    expect(getSecureStoreValueStrictMock).not.toHaveBeenCalled()
    expect(appSettingState.auth?.requiresReauthenticationOnNextStartup).toBe(true)
    expect(authModule.getAuthToken()).toBeNull()
  })

  it('keeps a written token session-only when clearing the fail-closed marker fails', async () => {
    saveMainConfigDurableMock.mockImplementation(
      async (_key: string, nextValue: MockAppSetting) => {
        if (nextValue.auth?.requiresReauthenticationOnNextStartup === false) {
          return { success: false, version: 1 }
        }
        appSettingState = nextValue
        return { success: true, version: 1 }
      }
    )

    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.setAuthToken('memory-token')

    expect(authModule.getAuthToken()).toBe('memory-token')
    expect(setSecureStoreValueMock).toHaveBeenCalledWith(
      '/tmp/tuff',
      'auth.token',
      'memory-token',
      'auth-token',
      expect.any(Function)
    )
    expect(appSettingState.auth?.requiresReauthenticationOnNextStartup).toBe(true)

    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })
    getSecureStoreValueStrictMock.mockResolvedValue('persisted-token')

    await authModule.__test__.loadAuthToken()

    expect(getSecureStoreValueStrictMock).not.toHaveBeenCalled()
    expect(authModule.getAuthToken()).toBeNull()
    expect(appSettingState.auth?.requiresReauthenticationOnNextStartup).toBe(true)
  })

  it('keeps cold-start auth state empty when protected storage is corrupted or unreadable', async () => {
    getSecureStoreValueStrictMock.mockRejectedValueOnce(new Error('synthetic read failure'))

    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await expect(authModule.__test__.loadAuthToken()).resolves.toBeUndefined()

    expect(authModule.getAuthToken()).toBeNull()
    expect(appSettingState.auth?.requiresReauthenticationOnNextStartup).toBe(true)
    expect(authLoggerMock.warn).toHaveBeenCalledWith(
      'Secure auth persistence unreadable; login state can only remain in memory',
      expect.objectContaining({ meta: { reason: 'secure-store-read-failed' } })
    )
  })

  it('keeps cold-start auth state empty when the protected-store health check fails', async () => {
    getSecureStoreHealthMock.mockRejectedValueOnce(new Error('synthetic health failure'))
    getSecureStoreValueStrictMock.mockResolvedValue('must-not-restore')

    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await expect(authModule.__test__.loadAuthToken()).resolves.toBeUndefined()

    expect(getSecureStoreValueStrictMock).not.toHaveBeenCalled()
    expect(authModule.getAuthToken()).toBeNull()
    expect(appSettingState.auth?.requiresReauthenticationOnNextStartup).toBe(true)
    expect(authLoggerMock.warn).toHaveBeenCalledWith(
      'Secure auth persistence health check failed; login state can only remain in memory',
      expect.objectContaining({ meta: { reason: 'secure-store-health-check-failed' } })
    )
  })

  it('restores an auth token from the protected local-secret store when it is healthy', async () => {
    getSecureStoreValueStrictMock.mockResolvedValue('persisted-token')

    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.loadAuthToken()

    expect(authModule.getAuthToken()).toBe('persisted-token')
  })

  it('clears the protected persisted auth token on sign-out', async () => {
    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({
      appRootPath: '/tmp/tuff',
      authToken: 'memory-token'
    })

    await authModule.__test__.clearAuthToken()

    expect(saveMainConfigDurableMock).toHaveBeenNthCalledWith(
      1,
      'app-setting',
      expect.objectContaining({
        auth: expect.objectContaining({ requiresReauthenticationOnNextStartup: true })
      }),
      { force: true }
    )
    expect(setSecureStoreValueMock).toHaveBeenCalledWith(
      '/tmp/tuff',
      'auth.token',
      null,
      'auth-token',
      expect.any(Function)
    )
    expect(saveMainConfigDurableMock).toHaveBeenNthCalledWith(
      2,
      'app-setting',
      expect.objectContaining({
        auth: expect.objectContaining({ requiresReauthenticationOnNextStartup: false })
      }),
      { force: true }
    )
    expect(appSettingState.auth?.requiresReauthenticationOnNextStartup).toBe(false)
    expect(authModule.getAuthToken()).toBeNull()
  })

  it('keeps the fail-closed marker after sign-out cannot clear the protected token', async () => {
    setSecureStoreValueMock.mockResolvedValue(false)

    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({
      appRootPath: '/tmp/tuff',
      authToken: 'memory-token'
    })

    await authModule.__test__.clearAuthToken()

    expect(appSettingState.auth?.requiresReauthenticationOnNextStartup).toBe(true)
    expect(authModule.getAuthToken()).toBeNull()
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

    const authModule = await importAuthModule()
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

    const authModule = await importAuthModule()
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

  it('keeps cached signed-in state during visible auth evidence startup', async () => {
    process.env.TUFF_VISIBLE_EVIDENCE_AUTH = '1'
    process.env.TUFF_STARTUP_BENCHMARK_ONCE = '1'
    appSettingState.auth!.cachedUser = {
      id: 'visible-user',
      email: 'visible@example.test',
      name: 'Visible User',
      avatar: null,
      role: null,
      locale: null,
      emailVerified: true,
      bio: null,
      createdAt: null,
      updatedAt: null
    }

    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({
      appRootPath: '/tmp/tuff',
      authToken: 'visible-evidence-token'
    })
    expect(authModule.__test__.getCachedAuthUser()).toMatchObject({
      id: 'visible-user',
      email: 'visible@example.test'
    })

    await authModule.__test__.initializeAuthState()

    expect(
      networkRequestMock.mock.calls.some(([request]) =>
        String((request as { url?: unknown })?.url ?? '').includes('/api/v1/auth/me')
      )
    ).toBe(false)
    expect(authModule.__test__.getState()).toMatchObject({
      isLoaded: true,
      isSignedIn: true,
      user: expect.objectContaining({
        id: 'visible-user',
        email: 'visible@example.test'
      })
    })
    expect(authLoggerMock.info).toHaveBeenCalledWith(
      'Keeping visible auth evidence cached auth state without startup refresh',
      expect.objectContaining({
        meta: expect.objectContaining({ userId: 'visible-user' })
      })
    )
  })
})
