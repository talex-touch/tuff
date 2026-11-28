import { SdkApi } from '@talex-touch/utils/plugin'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_TOKEN_BASE_URL_FIELD,
  omitMainOwnedAuthSettings,
  preserveMainOwnedAuthSettings
} from '../storage/main-storage-registry'
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
  transportOnStreamMock,
  transportBroadcastMock,
  openExternalMock,
  authLoggerMock,
  resolveMainRuntimeMock,
  runtimeBaseUrlState,
  getPermissionModuleMock,
  getPluginByNameMock
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
  transportOnStreamMock: vi.fn(() => vi.fn()),
  transportBroadcastMock: vi.fn(),
  openExternalMock: vi.fn(),
  authLoggerMock: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  },
  resolveMainRuntimeMock: vi.fn((ctx: unknown) => ctx),
  /** Nexus origin the module resolves; mutable so a case can change it mid-flight. */
  runtimeBaseUrlState: { baseUrl: 'https://example.test' },
  getPermissionModuleMock: vi.fn((): unknown => null),
  getPluginByNameMock: vi.fn()
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
    onStream: transportOnStreamMock,
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
    request: networkRequestMock,
    requestNoRedirect: networkRequestMock
  }))
}))

vi.mock('../nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: vi.fn(() => runtimeBaseUrlState.baseUrl),
  getRuntimeServerMode: vi.fn(() => 'production')
}))

vi.mock('../permission/permission-module-ref', () => ({
  getPermissionModule: getPermissionModuleMock
}))

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      getPluginByName: getPluginByNameMock
    }
  }
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
    nexusTokenBaseUrl?: string
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
    runtimeBaseUrlState.baseUrl = 'https://example.test'

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
    networkRequestMock.mockReset()
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

  it('reads a historical plain access token as a non-refreshable credential', async () => {
    getSecureStoreValueStrictMock.mockResolvedValue('persisted-legacy-access-token')

    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.loadAuthToken()

    expect(authModule.__test__.getCredentialState()).toEqual({
      accessToken: 'persisted-legacy-access-token',
      refreshToken: null,
      accessTokenExpiresAt: null
    })
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

    const state = authModule.__test__.getActiveCallbackState()
    expect(state).toBeTruthy()
    const expectedAuthorizeUrl = `https://example.test/sign-in?redirect_url=%2Fdevice-auth%3Fcode%3DABC123&state=${encodeURIComponent(state!)}`
    expect(response).toMatchObject({
      initiated: true,
      authorizeUrl: expectedAuthorizeUrl,
      userCode: 'ABC123',
      expiresAt: '2026-05-17T05:00:00.000Z',
      browserOpenFailed: true
    })
    expect(openExternalMock).toHaveBeenCalledWith(expectedAuthorizeUrl)
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
    const state = authModule.__test__.getActiveCallbackState()
    expect(state).toBeTruthy()
    expect(response).toMatchObject({
      initiated: true,
      authorizeUrl: `https://example.test/device-auth?code=TUFF26&state=${encodeURIComponent(state!)}`,
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
  it('persists an access and refresh pair as an exact version-1 encrypted credential envelope', async () => {
    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

    await authModule.__test__.setAuthToken('access-token-v1', {
      refreshToken: 'refresh-token-v1',
      ttlSeconds: 60 * 60
    })

    const credential = authModule.__test__.getCredentialState()
    expect(credential.accessTokenExpiresAt).toBeGreaterThan(Date.now())
    expect(setSecureStoreValueMock).toHaveBeenCalledWith(
      '/tmp/tuff',
      'auth.token',
      JSON.stringify({
        version: 1,
        accessToken: 'access-token-v1',
        refreshToken: 'refresh-token-v1',
        accessTokenExpiresAt: credential.accessTokenExpiresAt
      }),
      'auth-token',
      expect.any(Function)
    )
  })

  it('coalesces a pre-expiry access refresh for concurrent Nexus requests', async () => {
    const refreshResponse = Promise.withResolvers<unknown>()
    networkRequestMock.mockReset()
    networkRequestMock.mockImplementation(
      (request: { url?: string; headers?: Record<string, string> }) => {
        if (request.url === 'https://example.test/api/app-auth/refresh')
          return refreshResponse.promise
        return Promise.resolve({
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          url: request.url ?? '',
          data: 'business-ok',
          ok: true
        })
      }
    )

    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({
      appRootPath: '/tmp/tuff',
      authToken: 'nearly-expired-access-token',
      authRefreshToken: 'refresh-token-v1',
      authAccessTokenExpiresAt: Date.now() + 1
    })

    const first = authModule.__test__.performNexusRequest({
      method: 'GET',
      path: '/api/business/first',
      context: 'plugin-business'
    })
    const second = authModule.__test__.performNexusRequest({
      method: 'GET',
      path: '/api/business/second',
      context: 'plugin-business'
    })

    const initialRequests = networkRequestMock.mock.calls.map(
      ([request]) => request as { url?: string }
    )
    expect(
      initialRequests.filter(
        (request) => request.url === 'https://example.test/api/app-auth/refresh'
      )
    ).toHaveLength(1)
    refreshResponse.resolve({
      status: 200,
      data: { appToken: 'refreshed-access-token', ttlSeconds: 60 * 60 }
    })

    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult).toMatchObject({ status: 200, body: 'business-ok' })
    expect(secondResult).toMatchObject({ status: 200, body: 'business-ok' })

    const requests = networkRequestMock.mock.calls.map(
      ([request]) =>
        request as {
          url?: string
          headers?: Record<string, string>
        }
    )
    const businessRequests = requests.filter((request) =>
      request.url?.startsWith('https://example.test/api/business/')
    )
    expect(businessRequests).toHaveLength(2)
    expect(businessRequests.map((request) => request.headers?.authorization)).toEqual([
      'Bearer refreshed-access-token',
      'Bearer refreshed-access-token'
    ])
  })

  it('refreshes once after a business 401 and retries with the renewed access token', async () => {
    networkRequestMock.mockReset()
    networkRequestMock
      .mockResolvedValueOnce({
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        url: 'https://example.test/api/business',
        data: 'unauthorized',
        ok: false
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { appToken: 'renewed-access-token', ttlSeconds: 60 * 60 }
      })
      .mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'text/plain' }),
        url: 'https://example.test/api/business',
        data: 'business-ok',
        ok: true
      })

    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({
      appRootPath: '/tmp/tuff',
      authToken: 'access-token-before-refresh',
      authRefreshToken: 'refresh-token-v1',
      authAccessTokenExpiresAt: Date.now() + 60 * 60 * 1000
    })

    await expect(
      authModule.__test__.performNexusRequest({
        method: 'GET',
        path: '/api/business',
        context: 'plugin-business'
      })
    ).resolves.toMatchObject({ status: 200, body: 'business-ok' })

    const requests = networkRequestMock.mock.calls.map(
      ([request]) =>
        request as {
          url?: string
          headers?: Record<string, string>
        }
    )
    const businessRequests = requests.filter(
      (request) => request.url === 'https://example.test/api/business'
    )
    const refreshRequests = requests.filter(
      (request) => request.url === 'https://example.test/api/app-auth/refresh'
    )

    expect(businessRequests).toHaveLength(2)
    expect(businessRequests.map((request) => request.headers?.authorization)).toEqual([
      'Bearer access-token-before-refresh',
      'Bearer renewed-access-token'
    ])
    expect(refreshRequests).toHaveLength(1)
    expect(refreshRequests[0]?.headers).toEqual({ Authorization: 'Bearer refresh-token-v1' })
  })

  it('clears the complete credential bundle when the refresh credential is rejected', async () => {
    networkRequestMock.mockReset()
    networkRequestMock.mockResolvedValueOnce({ status: 401, data: null })

    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({
      appRootPath: '/tmp/tuff',
      authToken: 'access-token-before-rejection',
      authRefreshToken: 'rejected-refresh-token',
      authAccessTokenExpiresAt: Date.now() + 60 * 60 * 1000
    })

    await expect(authModule.__test__.refreshAccessToken('test-rejection')).resolves.toEqual({
      kind: 'unauthorized'
    })
    expect(authModule.__test__.getCredentialState()).toEqual({
      accessToken: '',
      refreshToken: null,
      accessTokenExpiresAt: null
    })
    expect(authModule.getAuthToken()).toBeNull()
  })

  describe('Nexus origin binding for the stored credential', () => {
    it('discards the stored credential when the app restarts against another Nexus origin', async () => {
      runtimeBaseUrlState.baseUrl = 'https://origin-a.test'

      const authModule = await importAuthModule()
      authModule.__test__.resetState()
      authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

      await authModule.__test__.setAuthToken('origin-a-token')
      const persistedCredential = setSecureStoreValueMock.mock.calls.at(-1)?.[2]
      expect(persistedCredential).toBeTypeOf('string')

      // Restart: memory is empty, the protected credential is still on disk.
      authModule.__test__.resetState()
      authModule.__test__.setState({ appRootPath: '/tmp/tuff' })
      runtimeBaseUrlState.baseUrl = 'https://origin-b.test'
      getSecureStoreValueStrictMock.mockResolvedValue(persistedCredential)
      setSecureStoreValueMock.mockClear()

      await authModule.__test__.loadAuthToken()

      expect(authModule.getAuthToken()).toBeNull()
      expect(setSecureStoreValueMock).toHaveBeenCalledWith(
        '/tmp/tuff',
        'auth.token',
        null,
        'auth-token',
        expect.any(Function)
      )
      expect(appSettingState.auth?.nexusTokenBaseUrl).toBe('https://origin-b.test')
    })

    it('keeps the credential when the resolved origin still matches', async () => {
      runtimeBaseUrlState.baseUrl = 'https://origin-a.test'
      appSettingState.auth![AUTH_TOKEN_BASE_URL_FIELD] = '  https://origin-a.test/ '
      getSecureStoreValueStrictMock.mockResolvedValue('persisted-token')

      const authModule = await importAuthModule()
      authModule.__test__.resetState()
      authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

      await authModule.__test__.loadAuthToken()

      expect(authModule.getAuthToken()).toBe('persisted-token')
      expect(setSecureStoreValueMock).not.toHaveBeenCalled()

      // Same origin again with the trailing slash on the other side of the comparison.
      authModule.__test__.resetState()
      authModule.__test__.setState({ appRootPath: '/tmp/tuff' })
      runtimeBaseUrlState.baseUrl = 'https://origin-a.test/'
      appSettingState.auth![AUTH_TOKEN_BASE_URL_FIELD] = 'https://origin-a.test'

      await authModule.__test__.loadAuthToken()

      expect(authModule.getAuthToken()).toBe('persisted-token')
      expect(setSecureStoreValueMock).not.toHaveBeenCalled()
    })

    it('adopts a credential with no recorded origin and catches a later origin change', async () => {
      runtimeBaseUrlState.baseUrl = 'https://origin-a.test'
      getSecureStoreValueStrictMock.mockResolvedValue('legacy-token')

      const authModule = await importAuthModule()
      authModule.__test__.resetState()
      authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

      await authModule.__test__.loadAuthToken()

      expect(authModule.getAuthToken()).toBe('legacy-token')
      expect(appSettingState.auth?.nexusTokenBaseUrl).toBe('https://origin-a.test')

      runtimeBaseUrlState.baseUrl = 'https://origin-b.test'

      expect(authModule.getAuthToken()).toBeNull()
      await vi.waitFor(() => {
        expect(appSettingState.auth?.nexusTokenBaseUrl).toBe('https://origin-b.test')
      })
      expect(setSecureStoreValueMock).toHaveBeenCalledWith(
        '/tmp/tuff',
        'auth.token',
        null,
        'auth-token',
        expect.any(Function)
      )
    })

    it('records the issuing origin and refuses the credential at any other origin', async () => {
      runtimeBaseUrlState.baseUrl = 'https://origin-b.test'

      const authModule = await importAuthModule()
      authModule.__test__.resetState()
      authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

      await authModule.__test__.setAuthToken('origin-b-token')

      expect(appSettingState.auth?.nexusTokenBaseUrl).toBe('https://origin-b.test')
      expect(authModule.getAuthToken()).toBe('origin-b-token')

      runtimeBaseUrlState.baseUrl = 'https://origin-a.test'
      setSecureStoreValueMock.mockClear()

      expect(authModule.getAuthToken()).toBeNull()
      await vi.waitFor(() => {
        expect(setSecureStoreValueMock).toHaveBeenCalledWith(
          '/tmp/tuff',
          'auth.token',
          null,
          'auth-token',
          expect.any(Function)
        )
        expect(appSettingState.auth?.nexusTokenBaseUrl).toBe('https://origin-a.test')
      })
      expect(authModule.__test__.getCredentialState()).toEqual({
        accessToken: '',
        refreshToken: null,
        accessTokenExpiresAt: null
      })
    })

    it('never sends the credential to a Nexus origin that did not issue it', async () => {
      runtimeBaseUrlState.baseUrl = 'https://origin-a.test'

      const authModule = await importAuthModule()
      authModule.__test__.resetState()
      authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

      await authModule.__test__.setAuthToken('origin-a-token')

      runtimeBaseUrlState.baseUrl = 'https://origin-b.test'
      networkRequestMock.mockClear()

      await expect(
        authModule.__test__.performNexusRequest({
          method: 'GET',
          path: '/api/business',
          context: 'plugin-business'
        })
      ).resolves.toBeNull()

      expect(networkRequestMock).not.toHaveBeenCalled()
    })

    it('keeps the recorded origin out of renderer and sync projections and survives an external write', async () => {
      runtimeBaseUrlState.baseUrl = 'https://origin-a.test'

      const authModule = await importAuthModule()
      authModule.__test__.resetState()
      authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

      await authModule.__test__.setAuthToken('origin-a-token')

      const projection = omitMainOwnedAuthSettings(appSettingState) as {
        auth?: Record<string, unknown>
      }
      expect(projection.auth).toHaveProperty('deviceId')
      expect(projection.auth).not.toHaveProperty(AUTH_TOKEN_BASE_URL_FIELD)

      // A remote-sync document arrives without the main-owned field.
      appSettingState = preserveMainOwnedAuthSettings(
        { ...appSettingState, auth: { deviceId: 'device-from-sync' } },
        appSettingState
      ) as MockAppSetting
      expect(appSettingState.auth?.nexusTokenBaseUrl).toBe('https://origin-a.test')

      runtimeBaseUrlState.baseUrl = 'https://origin-b.test'

      expect(authModule.getAuthToken()).toBeNull()
      await vi.waitFor(() => {
        expect(appSettingState.auth?.nexusTokenBaseUrl).toBe('https://origin-b.test')
      })
    })

    it('never sends a memory-only credential to a Nexus origin that did not issue it', async () => {
      runtimeBaseUrlState.baseUrl = 'https://origin-a.test'
      // Protected storage cannot write, so this credential only ever lives in memory and the
      // durable origin record is never written.
      setSecureStoreValueMock.mockResolvedValue(false)

      const authModule = await importAuthModule()
      authModule.__test__.resetState()
      authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

      await authModule.__test__.setAuthToken('memory-only-token')
      expect(authModule.getAuthToken()).toBe('memory-only-token')
      expect(appSettingState.auth?.nexusTokenBaseUrl).toBeUndefined()

      // The user points the app at another Nexus origin while the token is still in memory.
      runtimeBaseUrlState.baseUrl = 'https://origin-b.test'
      networkRequestMock.mockClear()

      expect(authModule.getAuthToken()).toBeNull()
      await expect(
        authModule.__test__.performNexusRequest({
          method: 'GET',
          path: '/api/business',
          context: 'plugin-business'
        })
      ).resolves.toBeNull()

      expect(networkRequestMock).not.toHaveBeenCalled()
    })

    it('keeps a credential that a login wrote while the origin cleanup was awaiting storage', async () => {
      runtimeBaseUrlState.baseUrl = 'https://origin-a.test'

      const authModule = await importAuthModule()
      authModule.__test__.resetState()
      authModule.__test__.setState({ appRootPath: '/tmp/tuff' })

      await authModule.__test__.setAuthToken('origin-a-token')

      // Park the cleanup inside its first durable write: this is the window a login can land in.
      let releaseCleanup!: () => void
      const cleanupGate = new Promise<void>((resolve) => {
        releaseCleanup = resolve
      })
      saveMainConfigDurableMock.mockImplementationOnce(async () => {
        await cleanupGate
        return { success: true, version: 1 }
      })
      runtimeBaseUrlState.baseUrl = 'https://origin-b.test'
      setSecureStoreValueMock.mockClear()

      // The cleanup `getAuthToken()` triggers for the now-foreign credential, awaited directly so
      // the assertion below is not racing it.
      const cleanup = authModule.__test__.dropCredentialIssuedByAnotherOrigin()

      await authModule.__test__.setAuthToken('origin-b-fresh-token')
      releaseCleanup()
      await cleanup

      // The cleanup was aimed at the credential it replaced, so it deletes nothing.
      expect(authModule.getAuthToken()).toBe('origin-b-fresh-token')
      expect(setSecureStoreValueMock).not.toHaveBeenCalledWith(
        '/tmp/tuff',
        'auth.token',
        null,
        'auth-token',
        expect.any(Function)
      )
    })
  })
})

describe('tuff://auth/callback deep link', () => {
  beforeEach(() => {
    setSecureStoreValueMock.mockClear()
  })
  it('refuses a callback when no login is in flight', async () => {
    // The drive-by case: a page navigates the user's browser to
    // tuff://auth/callback?token=… with nothing pending in the app (#695).
    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setActiveDeviceAuthCode(null)

    await expect(authModule.applyExternalAuthCallback('attacker-token')).resolves.toBe(false)
    expect(setSecureStoreValueMock).not.toHaveBeenCalled()
  })

  it('refuses an app_token just the same', async () => {
    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setActiveDeviceAuthCode(null)

    await expect(authModule.applyExternalAuthCallback('', 'attacker-app-token')).resolves.toBe(
      false
    )
    expect(setSecureStoreValueMock).not.toHaveBeenCalled()
  })

  it('requires a matching one-time state nonce and consumes the in-flight login on callback', async () => {
    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setActiveDeviceAuthCode('device-code-in-flight', 'nonce-123')
    authLoggerMock.warn.mockClear()

    // Missing or wrong state nonce rejected even while a login is pending
    await expect(authModule.applyExternalAuthCallback('', 'attacker-app-token')).resolves.toBe(
      false
    )
    await expect(
      authModule.applyExternalAuthCallback('', 'attacker-app-token', undefined, undefined, 'wrong')
    ).resolves.toBe(false)
    expect(setSecureStoreValueMock).not.toHaveBeenCalled()

    // Matching state nonce passes the gate and consumes the login so replay is denied
    await authModule.applyExternalAuthCallback(
      '',
      'legitimate-app-token',
      undefined,
      undefined,
      'nonce-123'
    )
    expect(authModule.__test__.getActiveCallbackState()).toBeNull()
    await expect(
      authModule.applyExternalAuthCallback(
        '',
        'replayed-app-token',
        undefined,
        undefined,
        'nonce-123'
      )
    ).resolves.toBe(false)
  })

  it('rejects cross-origin and protocol-relative URLs in performNexusRequest and performNexusUpload', async () => {
    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    authModule.__test__.setState({ authToken: 'secret-bearer' })
    networkRequestMock.mockClear()

    await expect(
      authModule.__test__.performNexusRequest({ url: 'https://evil.example/steal' })
    ).rejects.toThrow('NEXUS_INVALID_REQUEST')
    await expect(
      authModule.__test__.performNexusRequest({ path: '//evil.example/steal' })
    ).rejects.toThrow('NEXUS_INVALID_REQUEST')
    await expect(
      authModule.__test__.performNexusUpload({
        url: 'https://evil.example/upload',
        files: []
      })
    ).rejects.toThrow('NEXUS_INVALID_REQUEST')
    expect(networkRequestMock).not.toHaveBeenCalled()
  })

  it('binds tuff://auth/stepup to a one-time state nonce from requestStepUp', async () => {
    const authModule = await importAuthModule()
    authModule.__test__.resetState()

    // Unsolicited step-up callback rejected
    expect(authModule.applyStepUpToken('forged-stepup', 'any-state')).toBe(false)
    expect(authModule.__test__.getStepUpToken()).toBeNull()

    openExternalMock.mockResolvedValueOnce(undefined)
    await authModule.__test__.requestStepUp()
    const issuedState = authModule.__test__.getActiveStepUpState()
    expect(issuedState).toBeTruthy()
    expect(openExternalMock).toHaveBeenCalledWith(
      expect.stringContaining(`state=${encodeURIComponent(issuedState!)}`)
    )

    // Wrong state rejected without consuming the active request
    expect(authModule.applyStepUpToken('forged-stepup', 'wrong-state')).toBe(false)
    expect(authModule.__test__.getStepUpToken()).toBeNull()

    // Exact nonce accepted once and consumed
    expect(authModule.applyStepUpToken('valid-stepup', issuedState!)).toBe(true)
    expect(authModule.__test__.getStepUpToken()).toBe('valid-stepup')
    expect(authModule.applyStepUpToken('replayed-stepup', issuedState!)).toBe(false)
    expect(authModule.__test__.getStepUpToken()).toBe('valid-stepup')
  })
})

describe('plugin account access', () => {
  type RegisteredHandler = (payload: unknown, context?: unknown) => Promise<unknown>
  type StreamHandler = (payload: unknown, context: unknown) => Promise<void>

  const DEVICE_START = {
    status: 200,
    data: {
      deviceCode: 'device-code-1',
      userCode: 'ABC123',
      authorizeUrl: 'https://example.test/device-auth?code=ABC123',
      expiresAt: '2026-10-24T05:00:00.000Z',
      intervalSeconds: 3
    }
  }

  /** Nexus by path: the device start and a pending poll unless a case answers a path itself. */
  function answerNexus(answers: Record<string, () => unknown> = {}): void {
    networkRequestMock.mockImplementation(async (request: { url?: string }) => {
      const path = new URL(request?.url ?? '/', 'https://example.test').pathname
      if (answers[path]) return await answers[path]()
      if (path === '/api/app-auth/device/start') return DEVICE_START
      return { status: 400, data: { status: 'pending' } }
    })
  }

  function requestsTo(path: string): number {
    return networkRequestMock.mock.calls.filter(([request]) =>
      String((request as { url?: unknown })?.url ?? '').endsWith(path)
    ).length
  }

  function allowAccountRead(allowed: boolean): ReturnType<typeof vi.fn> {
    const checkPermission = vi.fn(() =>
      allowed
        ? { allowed: true }
        : { allowed: false, reason: 'Permission not granted', showRequest: true }
    )
    getPermissionModuleMock.mockReturnValue({ checkPermission })
    return checkPermission
  }

  async function startAuth() {
    const authModule = await importAuthModule()
    const { registerPermissionPluginBridge } = await import('../permission/permission-ports')
    registerPermissionPluginBridge({
      resolvePluginDeclaredSdkApi: (pluginId) => {
        const plugin = getPluginByNameMock(pluginId) as { sdkapi?: number } | undefined
        return typeof plugin?.sdkapi === 'number' ? plugin.sdkapi : undefined
      }
    })
    authModule.__test__.resetState()
    authModule.__test__.setState({ appRootPath: '/tmp/tuff' })
    const module = new authModule.AuthModule()
    module.onInit({
      app: { rootPath: '/tmp/tuff' },
      channel: { keyManager: {}, sendMain: vi.fn() }
    } as unknown as Parameters<typeof module.onInit>[0])

    const find = <T>(calls: unknown, eventName: string): T => {
      const found = (calls as Array<[{ toEventName?: () => string }, T]>).find(
        ([event]) => event?.toEventName?.() === eventName
      )?.[1]
      if (!found) throw new Error(`${eventName} was not registered`)
      return found
    }
    return {
      authModule,
      handler: (eventName: string) =>
        find<RegisteredHandler>(transportOnMock.mock.calls, eventName),
      stream: (eventName: string) =>
        find<StreamHandler>(transportOnStreamMock.mock.calls, eventName),
      settled: () => vi.waitFor(() => expect(authModule.__test__.getState().isSettled).toBe(true))
    }
  }

  /** Issued after the auth module loads, by the same identity registry its guard checks. */
  async function trustedPlugin(): Promise<{ plugin: unknown }> {
    const { createTrustedTestPluginContext } =
      await import('@talex-touch/utils/transport/security/plugin-identity')
    return { plugin: createTrustedTestPluginContext({ name: 'plugin-a' }) }
  }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resolveMainRuntimeMock.mockImplementation((ctx: unknown) => ctx)
    runtimeBaseUrlState.baseUrl = 'https://example.test'
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
      reason: ''
    })
    getSecureStoreValueStrictMock.mockResolvedValue(null)
    setSecureStoreValueMock.mockResolvedValue(true)
    getPermissionModuleMock.mockReturnValue(null)
    getPluginByNameMock.mockReturnValue({ sdkapi: SdkApi.V260713 })
    networkRequestMock.mockReset()
    answerNexus()
  })

  afterEach(async () => {
    const authModule = await importAuthModule()
    authModule.__test__.resetState()
    networkRequestMock.mockReset()
  })

  it('opens a single sign-in page for plugins that ask at the same time', async () => {
    let releaseStart: () => void = () => {}
    const started = new Promise<void>((resolve) => {
      releaseStart = resolve
    })
    answerNexus({
      '/api/app-auth/device/start': async () => {
        await started
        return DEVICE_START
      }
    })
    const { handler, settled } = await startAuth()
    await settled()
    const requestLogin = handler('account:session:request-login')

    const asked = [requestLogin(undefined), requestLogin(undefined)]
    releaseStart()

    await expect(Promise.all(asked)).resolves.toEqual([true, true])
    expect(requestsTo('/api/app-auth/device/start')).toBe(1)
    expect(openExternalMock).toHaveBeenCalledTimes(1)
    expect(openExternalMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/example\.test\/device-auth\?code=ABC123&state=[A-Za-z0-9_-]+$/
      )
    )
  })

  it('joins the sign-in under way instead of voiding its code', async () => {
    const { handler, settled } = await startAuth()
    await settled()
    await handler('auth:session:login')({ mode: 'sign-in' })

    await expect(handler('account:session:request-login')(undefined)).resolves.toBe(true)

    expect(requestsTo('/api/app-auth/device/start')).toBe(1)
    expect(requestsTo('/api/app-auth/device/abort')).toBe(0)
    expect(openExternalMock).toHaveBeenCalledTimes(1)
  })

  it('opens nothing while the stored sign-in loads at startup, nor once it is in', async () => {
    getSecureStoreValueStrictMock.mockResolvedValue('persisted-legacy-access-token')
    appSettingState.auth!.cachedUser = {
      id: 'user-1',
      email: 'user@example.test',
      name: 'User',
      avatar: null,
      role: null,
      locale: null,
      emailVerified: true,
      bio: null,
      createdAt: null,
      updatedAt: null
    }
    const { authModule, handler } = await startAuth()
    const requestLogin = handler('account:session:request-login')

    await expect(requestLogin(undefined)).resolves.toBe(true)
    await vi.waitFor(() => expect(authModule.__test__.getState().isSignedIn).toBe(true))
    await expect(requestLogin(undefined)).resolves.toBe(true)

    expect(requestsTo('/api/app-auth/device/start')).toBe(0)
    expect(openExternalMock).not.toHaveBeenCalled()
  })

  it('answers false when the sign-in page cannot open', async () => {
    openExternalMock.mockRejectedValueOnce(new Error('open failed'))
    const { handler, settled } = await startAuth()
    await settled()

    await expect(handler('account:session:request-login')(undefined)).resolves.toBe(false)
  })

  it('refuses a plugin without account.read before reading the account or opening a page', async () => {
    const checkPermission = allowAccountRead(false)
    const { handler, settled } = await startAuth()
    const plugin = await trustedPlugin()
    await settled()
    const denied = {
      code: 'ACCOUNT_PERMISSION_DENIED',
      permissionId: 'account.read',
      pluginId: 'plugin-a'
    }

    await expect(handler('account:profile:get')(undefined, plugin)).rejects.toMatchObject(denied)
    await expect(handler('account:session:request-login')(undefined, plugin)).rejects.toMatchObject(
      denied
    )
    await expect(handler('account:upgrade:open')({ plan: 'pro' }, plugin)).rejects.toMatchObject(
      denied
    )

    expect(checkPermission).toHaveBeenCalledWith('plugin-a', 'account.read', SdkApi.V260713)
    expect(requestsTo('/api/app-auth/device/start')).toBe(0)
    expect(openExternalMock).not.toHaveBeenCalled()
  })

  it('serves a plugin holding account.read, and the app without asking', async () => {
    const checkPermission = allowAccountRead(true)
    const { handler, settled } = await startAuth()
    const plugin = await trustedPlugin()
    await settled()

    await expect(handler('account:profile:get')(undefined, plugin)).resolves.toBeNull()
    expect(checkPermission).toHaveBeenCalledTimes(1)
    await expect(
      handler('account:profile:get')(undefined, { eventName: 'account:profile:get' })
    ).resolves.toBeNull()
    expect(checkPermission).toHaveBeenCalledTimes(1)
  })

  it('refuses a plugin context the host did not issue', async () => {
    allowAccountRead(true)
    const { handler, settled } = await startAuth()
    await settled()

    await expect(
      handler('account:profile:get')(undefined, {
        plugin: { name: 'plugin-a', uniqueKey: 'forged-key' }
      })
    ).rejects.toMatchObject({ code: 'ACCOUNT_PERMISSION_DENIED' })
  })

  it('ends the session stream with the refusal for a plugin without account.read', async () => {
    allowAccountRead(false)
    const { stream } = await startAuth()
    const plugin = await trustedPlugin()
    const emit = vi.fn()
    const error = vi.fn()

    await stream('account:session:changed')(undefined, {
      ...plugin,
      emit,
      error,
      end: vi.fn(),
      isCancelled: () => false,
      signal: new AbortController().signal
    })

    expect(emit).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0]?.[0]).toBeInstanceOf(Error)
    expect(error.mock.calls[0]?.[0]).toMatchObject({ code: 'ACCOUNT_PERMISSION_DENIED' })
  })

  it("reads the plan's features, limits and organization from Nexus", async () => {
    answerNexus({
      '/api/subscription/status': () => ({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        url: 'https://example.test/api/subscription/status',
        ok: true,
        data: {
          plan: 'pro',
          isActive: true,
          activatedAt: null,
          expiresAt: null,
          features: {
            aiRequests: { limit: 1000, used: 12 },
            aiTokens: { limit: -1, used: 3400 },
            customModels: true,
            prioritySupport: false,
            apiAccess: true
          },
          team: {
            id: 'team-1',
            name: 'Acme',
            type: 'organization',
            role: 'admin',
            seats: { used: 4, total: 10 }
          }
        }
      })
    })
    const { authModule, handler, settled } = await startAuth()
    await settled()
    authModule.__test__.setState({ authToken: 'access-token' })

    await expect(handler('account:features:get')(undefined)).resolves.toEqual([
      { id: 'aiRequests', enabled: true, value: 1000 },
      { id: 'aiTokens', enabled: true, value: -1 },
      { id: 'customModels', enabled: true },
      { id: 'prioritySupport', enabled: false },
      { id: 'apiAccess', enabled: true }
    ])
    await expect(handler('account:teams:get')(undefined)).resolves.toEqual([
      { id: 'team-1', name: 'Acme', slug: 'team-1', role: 'admin', memberCount: 4, createdAt: 0 }
    ])
    await expect(handler('account:subscription:get')(undefined)).resolves.toMatchObject({
      plan: 'pro',
      quota: {
        aiRequestsPerWeek: 1000,
        aiTokensPerWeek: -1,
        aiRequestsPerDay: 1000,
        aiTokensPerMonth: -1,
        customModelAccess: true,
        prioritySupport: false,
        apiAccess: true
      },
      usage: {
        aiRequestsThisWeek: 12,
        aiTokensThisWeek: 3400,
        aiRequestsToday: 12,
        aiTokensThisMonth: 3400
      }
    })
  })

  it('opens the pricing page on the plan asked for, and account pages that exist', async () => {
    const { handler } = await startAuth()

    await handler('account:upgrade:open')({ plan: 'pro' })
    await handler('account:upgrade:open')({ plan: 'gold' })
    await handler('account:billing:open')(undefined)
    await handler('account:settings:open')(undefined)

    expect(openExternalMock.mock.calls.map(([url]) => url)).toEqual([
      'https://example.test/pricing?plan=pro',
      'https://example.test/pricing',
      'https://example.test/dashboard/team',
      'https://example.test/dashboard/account'
    ])
  })
})
