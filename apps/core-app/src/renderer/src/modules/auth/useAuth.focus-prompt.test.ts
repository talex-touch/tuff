// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- test doubles and mount harness */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive } from 'vue'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  on: vi.fn(() => () => {}),
  authState: {
    isLoaded: false,
    isSignedIn: false,
    user: null as unknown,
    sessionId: null as string | null
  },
  appSetting: {
    beginner: { init: true }
  }
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: mocks.send,
    on: mocks.on
  })
}))

vi.mock('@talex-touch/utils/transport/events', () => ({
  AuthEvents: {
    session: {
      getState: 'auth:session:getState',
      stateChanged: 'auth:session:stateChanged',
      login: 'auth:session:login',
      logout: 'auth:session:logout',
      cancelLogin: 'auth:session:cancelLogin',
      checkPendingLogin: 'auth:session:checkPendingLogin'
    },
    token: { manual: 'auth:token:manual' },
    profile: { update: 'auth:profile:update', updateAvatar: 'auth:profile:updateAvatar' },
    stepUp: {
      request: 'auth:stepUp:request',
      getToken: 'auth:stepUp:getToken',
      clearToken: 'auth:stepUp:clearToken'
    }
  },
  SentryEvents: {
    api: { updateUser: 'sentry:updateUser' }
  }
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useAuthState: () => ({ authState: reactive(mocks.authState) }),
  useCurrentUser: () => ({ currentUser: reactive({ value: null }) })
}))

vi.mock('@talex-touch/utils/env', () => ({
  isDevEnv: () => false
}))

vi.mock('vue-sonner', () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  }
}))

vi.mock('~/components/auth/AuthLoginResumePrompt.vue', () => ({
  default: defineComponent({
    name: 'AuthLoginResumePrompt',
    render() {
      return h('div')
    }
  })
}))

vi.mock('../storage/app-storage', () => ({
  appSetting: mocks.appSetting
}))

vi.mock('../lang/i18n', () => ({
  getGlobalI18nInstance: () => null
}))

vi.mock('./device-attest', () => ({
  attestCurrentDevice: vi.fn(async () => {})
}))

vi.mock('./sync-preferences', () => ({
  applyDefaultSyncOnLogin: vi.fn(),
  getSyncPreferenceState: () => ({ enabled: false })
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetModules()
  mocks.send.mockReset()
  mocks.on.mockReset().mockReturnValue(() => {})
  mocks.authState.isLoaded = false
  mocks.authState.isSignedIn = false
  mocks.authState.user = null
  mocks.authState.sessionId = null
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useAuth focus-prompt interval lifecycle', () => {
  it('registers zero setIntervals when mounted with no pending browser login, and clears intervals on cancel/unmount', async () => {
    mocks.send.mockImplementation(async (event: string) => {
      if (event === 'auth:session:getState') {
        return { isLoaded: true, isSignedIn: false, user: null, sessionId: null }
      }
      if (event === 'auth:session:login') {
        return { initiated: true, authorizeUrl: 'https://example.test/auth', userCode: 'CODE' }
      }
      if (event === 'auth:session:cancelLogin') {
        return { cancelled: true }
      }
      return null
    })

    const setIntervalSpy = vi.spyOn(window, 'setInterval')
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')

    const { useAuth } = await import('./useAuth')
    let auth!: ReturnType<typeof useAuth>

    const wrapper = mount(
      defineComponent({
        setup() {
          auth = useAuth()
          return () => h('div')
        }
      })
    )
    await flushPromises()

    // Idle mount with pendingBrowserLogin === null must start ZERO intervals
    expect(setIntervalSpy).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)

    // Starting browser login activates both countdown + focus-prompt intervals
    const loginPromise = auth.loginWithBrowser()
    await flushPromises()
    expect(setIntervalSpy).toHaveBeenCalledTimes(2)

    // Cancelling immediately clears both intervals and leaves zero active timers
    auth.cancelPendingBrowserLogin()
    const loginResult = await loginPromise
    expect(loginResult.success).toBe(false)
    expect(clearIntervalSpy).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)

    // Starting another login and unmounting cleans up the focus-prompt interval cleanly
    setIntervalSpy.mockClear()
    clearIntervalSpy.mockClear()
    void auth.loginWithBrowser()
    await flushPromises()
    expect(setIntervalSpy).toHaveBeenCalledTimes(2)

    wrapper.unmount()
    // Focus-prompt poller is cleared on unmount even if login was in flight
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
    auth.cancelPendingBrowserLogin()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears prior pending timers on re-entrant loginWithBrowser and cleans up on retryPendingBrowserLogin error', async () => {
    let loginCalls = 0
    mocks.send.mockImplementation(async (event: string) => {
      if (event === 'auth:session:getState') {
        return { isLoaded: true, isSignedIn: false, user: null, sessionId: null }
      }
      if (event === 'auth:session:login') {
        loginCalls += 1
        if (loginCalls === 3) {
          throw new Error('browser open failed')
        }
        return {
          initiated: true,
          authorizeUrl: `https://example.test/auth/${loginCalls}`,
          userCode: `CODE-${loginCalls}`
        }
      }
      if (event === 'auth:session:cancelLogin') {
        return { cancelled: true }
      }
      return null
    })

    const { useAuth } = await import('./useAuth')
    let auth!: ReturnType<typeof useAuth>

    const wrapper = mount(
      defineComponent({
        setup() {
          auth = useAuth()
          return () => h('div')
        }
      })
    )
    await flushPromises()

    const firstLogin = auth.loginWithBrowser()
    await flushPromises()

    // Re-entering loginWithBrowser supersedes and cleanly resolves the first attempt without timer leaks
    const secondLogin = auth.loginWithBrowser()
    await flushPromises()
    const firstResult = await firstLogin
    expect(firstResult.success).toBe(false)

    // Retrying when transport throws settles pending login and leaves zero orphaned timers
    await auth.reopenBrowserLogin()
    const secondResult = await secondLogin
    expect(secondResult.success).toBe(false)
    expect(vi.getTimerCount()).toBe(0)

    wrapper.unmount()
  })

  it('does not clobber a newer login UI state or show a spurious toast when a superseded retry rejects late', async () => {
    const staleRetry = Promise.withResolvers<unknown>()
    let loginCalls = 0
    mocks.send.mockImplementation(async (event: string) => {
      if (event === 'auth:session:getState') {
        return { isLoaded: true, isSignedIn: false, user: null, sessionId: null }
      }
      if (event === 'auth:session:login') {
        loginCalls += 1
        if (loginCalls === 2) {
          return staleRetry.promise
        }
        return {
          initiated: true,
          authorizeUrl: `https://example.test/auth/${loginCalls}`,
          userCode: `CODE-${loginCalls}`
        }
      }
      if (event === 'auth:session:cancelLogin') {
        return { cancelled: true }
      }
      return null
    })

    const { toast } = await import('vue-sonner')
    const { useAuth } = await import('./useAuth')
    let auth!: ReturnType<typeof useAuth>

    const wrapper = mount(
      defineComponent({
        setup() {
          auth = useAuth()
          return () => h('div')
        }
      })
    )
    await flushPromises()

    // Start login #1, then trigger a retry (#2) that hangs in flight
    const firstLogin = auth.loginWithBrowser()
    await flushPromises()
    const pendingRetry = auth.reopenBrowserLogin()

    // Supersede with a fresh login (#3) that settles into 'waiting'
    const newerLogin = auth.loginWithBrowser()
    await flushPromises()
    expect((await firstLogin).success).toBe(false)
    expect(auth.authLoadingState.isLoggingIn).toBe(true)
    expect(auth.authLoadingState.loginStage).toBe('waiting')

    vi.mocked(toast.error).mockClear()

    // Now the stale retry (#2) rejects late: active login #3 UI state must remain intact
    staleRetry.reject(new Error('stale retry failed'))
    await pendingRetry
    await flushPromises()

    expect(auth.authLoadingState.isLoggingIn).toBe(true)
    expect(auth.authLoadingState.loginStage).toBe('waiting')
    expect(toast.error).not.toHaveBeenCalled()

    auth.cancelPendingBrowserLogin()
    await newerLogin
    expect(vi.getTimerCount()).toBe(0)
    wrapper.unmount()
  })
})
