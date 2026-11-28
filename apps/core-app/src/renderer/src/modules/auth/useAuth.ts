import type { AuthState, AuthUser, LoginOptions, LoginResult } from '@talex-touch/utils/renderer'
import type {
  AuthInitiatedResponse,
  AuthPendingLoginResponse,
  AuthPendingLoginStatus
} from '@talex-touch/utils/transport/events/auth'
import type { AppContext } from 'vue'
import { useAuthState, useCurrentUser } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AuthEvents, SentryEvents } from '@talex-touch/utils/transport/events'
import {
  computed,
  createVNode,
  effectScope,
  getCurrentInstance,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  render,
  shallowRef,
  watch
} from 'vue'
import { toast } from 'vue-sonner'
import { isDevEnv } from '@talex-touch/utils/env'
import AuthLoginResumePrompt from '~/components/auth/AuthLoginResumePrompt.vue'
import { appSetting } from '../storage/app-storage'
import { getGlobalI18nInstance } from '../lang/i18n'
import { resolveAuthErrorMessage } from './auth-error-message'
import { attestCurrentDevice } from './device-attest'
import { applyDefaultSyncOnLogin, getSyncPreferenceState } from './sync-preferences'
import { canShowLoginResumePrompt, resolveAuthMountAction } from './use-auth-policies'

let authStateCleanup: (() => void) | null = null
let focusPromptCleanup: (() => void) | null = null
let devTokenCleanup: (() => void) | null = null
let isInitialized = false
let activeConsumers = 0

const transport = useTuffTransport()
const BROWSER_LOGIN_TIMEOUT_MS = 2 * 60 * 1000
const BROWSER_LOGIN_CALLBACK_GRACE_MS = 5000
const BROWSER_LOGIN_COUNTDOWN_TICK_MS = 1000
const FOCUS_PROMPT_RECHECK_DELAY_MS = 400

type BrowserIntervalId = number

let nextBrowserLoginAttemptId = 0

const pendingBrowserLogin = shallowRef<{
  attemptId: number
  resolve: (result: LoginResult) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
  countdownId: BrowserIntervalId
  openedAt: number
} | null>(null)
const isHandlingExternalAuthCallback = ref(false)
let authPromptAppContext: AppContext | null = null

const authLoadingState = reactive({
  isSigningIn: false,
  isSigningUp: false,
  isSigningOut: false,
  isLoggingIn: false,
  loginProgress: 0,
  loginTimeRemaining: 0,
  loginStage: 'idle' as 'idle' | 'preparing' | 'waiting' | 'success' | 'failed',
  loginAuthorizeUrl: '',
  loginUserCode: '',
  loginExpiresAt: '',
  loginBrowserOpenFailed: false
})

function resolveBrowserLoginTimeoutMs(): number {
  const value = window.api?.getVisibleEvidenceConfig?.().authLoginTimeoutMs
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : BROWSER_LOGIN_TIMEOUT_MS
}

async function clearStepUpToken(): Promise<void> {
  await transport.send(AuthEvents.stepUp.clearToken)
}

async function getStepUpToken(): Promise<string | null> {
  return (await transport.send(AuthEvents.stepUp.getToken)) as string | null
}

function isStepUpRequiredError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as {
    errorCode?: unknown
    message?: unknown
    data?: unknown
  }
  const errorCode = typeof candidate.errorCode === 'string' ? candidate.errorCode : ''
  if (errorCode !== 'DEVICE_NOT_AUTHORIZED') {
    return false
  }

  const message = typeof candidate.message === 'string' ? candidate.message : ''
  const detail =
    candidate.data && typeof candidate.data === 'object' && 'message' in candidate.data
      ? typeof (candidate.data as { message?: unknown }).message === 'string'
        ? (candidate.data as { message: string }).message
        : ''
      : ''

  return /mf2a|step[-\s]?up|required/i.test(String(message) + ' ' + String(detail))
}

async function waitForStepUpToken(timeoutMs = 2 * 60 * 1000): Promise<string> {
  const existing = await getStepUpToken().catch(() => null)
  if (existing) {
    return existing
  }

  return await new Promise((resolve, reject) => {
    let settled = false
    const timer = setInterval(() => {
      void getStepUpToken()
        .then((token) => {
          if (settled || !token) {
            return
          }
          settled = true
          clearInterval(timer)
          clearTimeout(timeout)
          resolve(token)
        })
        .catch(() => {})
    }, 250)

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      clearInterval(timer)
      reject(new Error('Step-up verification timeout'))
    }, timeoutMs)
  })
}

async function runWithStepUpToken<T>(
  executor: (stepUpToken: string | null) => Promise<T>
): Promise<T> {
  const currentToken = await getStepUpToken()
  try {
    return await executor(currentToken)
  } catch (error) {
    if (!isStepUpRequiredError(error)) {
      throw error
    }

    await clearStepUpToken()
    await requestStepUp()
    const refreshedToken = await waitForStepUpToken()
    return await executor(refreshedToken)
  }
}

const { authState } = useAuthState()
const { currentUser } = useCurrentUser()

const isLoading = computed(() => !authState.isLoaded)
const isAuthenticated = computed(() => authState.isSignedIn)
const user = computed(() => authState.user)
const isLoggedIn = computed(() => authState.isSignedIn)

function resolveAuthUiMessage(key: string, fallback: string): string {
  const translated = getGlobalI18nInstance()?.global.t(key)
  return typeof translated === 'string' && translated !== key ? translated : fallback
}

// resolveAuthErrorMessage always passes its own message as the fallback.
function translateAuthError(key: string, fallback?: string | Record<string, unknown>): string {
  return resolveAuthUiMessage(key, typeof fallback === 'string' ? fallback : key)
}

function syncSentryUser(nextUser: AuthUser | null): void {
  void (async () => {
    try {
      const safeUser = nextUser
        ? {
            id: nextUser.id,
            username: nextUser.name ?? undefined,
            emailAddresses: nextUser.email ? [{ emailAddress: nextUser.email }] : []
          }
        : null
      await transport.send(SentryEvents.api.updateUser, { user: safeUser })
      try {
        const { updateSentryUserContext } = await import('~/modules/sentry/sentry-renderer')
        updateSentryUserContext(safeUser)
      } catch {
        // ignore
      }
    } catch {
      // ignore sentry sync failure
    }
  })()
}

function applyAuthState(nextState: AuthState): void {
  const wasSignedIn = authState.isSignedIn
  authState.isLoaded = nextState.isLoaded ?? true
  authState.isSignedIn = Boolean(nextState.isSignedIn)
  authState.user = nextState.user ?? null
  authState.sessionId = nextState.sessionId ?? null

  if (authState.user) {
    applyDefaultSyncOnLogin()
  }

  syncSentryUser(authState.user)

  if (authState.isSignedIn && !wasSignedIn) {
    void runSyncBootstrap().catch(() => {
      // ignore sync bootstrap failure
    })
  }
}

function updateAuthState(nextUser: AuthUser | null, sessionId?: string | null): void {
  applyAuthState({
    isLoaded: true,
    isSignedIn: Boolean(nextUser),
    user: nextUser,
    sessionId: sessionId ?? null
  })
}

function clearBrowserLoginLoading(): void {
  if (pendingBrowserLogin.value) {
    clearTimeout(pendingBrowserLogin.value.timeoutId)
    window.clearInterval(pendingBrowserLogin.value.countdownId)
    pendingBrowserLogin.value = null
  }
  authLoadingState.isLoggingIn = false
  authLoadingState.loginTimeRemaining = 0
  authLoadingState.loginStage = 'idle'
  authLoadingState.loginAuthorizeUrl = ''
  authLoadingState.loginUserCode = ''
  authLoadingState.loginExpiresAt = ''
  authLoadingState.loginBrowserOpenFailed = false
}

function finishPendingBrowserLogin(result: LoginResult): void {
  pendingBrowserLogin.value?.resolve(result)
  clearBrowserLoginLoading()
}

function resolvePendingBrowserLogin(result: LoginResult): void {
  if (!pendingBrowserLogin.value) return
  const pending = pendingBrowserLogin.value
  clearTimeout(pending.timeoutId)
  window.clearInterval(pending.countdownId)
  pending.resolve(result)
  pendingBrowserLogin.value = null
}

function getDisplayName(): string {
  const name = authState.user?.name?.trim()
  if (name) {
    return name
  }
  const email = authState.user?.email?.trim()
  if (email) {
    const alias = email.split('@')[0]?.trim()
    return alias || email
  }
  return ''
}

function getPrimaryEmail(): string {
  return authState.user?.email || ''
}

function getUserBio(): string {
  return authState.user?.bio || ''
}

async function updateUserProfile(payload: {
  displayName?: string
  bio?: string
}): Promise<AuthUser | null> {
  if (!payload.displayName && payload.bio === undefined) {
    return authState.user
  }

  const nextUser = (await transport.send(AuthEvents.profile.update, {
    displayName: payload.displayName,
    bio: payload.bio
  })) as AuthUser | null
  if (nextUser) {
    updateAuthState(nextUser, authState.sessionId)
  }
  return nextUser
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'))
    reader.readAsDataURL(file)
  })
}

async function updateUserAvatar(file: File): Promise<AuthUser | null> {
  const dataUrl = await fileToDataUrl(file)
  const nextUser = (await transport.send(AuthEvents.profile.updateAvatar, {
    dataUrl
  })) as AuthUser | null
  if (nextUser) {
    updateAuthState(nextUser, authState.sessionId)
  }
  return nextUser
}

async function openLoginSettings(): Promise<boolean> {
  return false
}

async function requestStepUp(): Promise<void> {
  await transport.send(AuthEvents.stepUp.request)
  toast.info(
    resolveAuthUiMessage(
      'settingUser.stepUpPrompt',
      'Complete secondary verification in your browser.'
    )
  )
}

async function runSyncBootstrap(): Promise<boolean> {
  if (!getSyncPreferenceState().enabled) {
    return false
  }
  await attestCurrentDevice()
  return true
}

async function initializeAuth() {
  if (isInitialized) return

  try {
    const state = (await transport.send(AuthEvents.session.getState)) as AuthState
    if (state) {
      applyAuthState(state)
    } else {
      updateAuthState(null)
    }
    isInitialized = true
  } catch (error) {
    updateAuthState(null)
    isInitialized = true
    const errorMessage = resolveAuthErrorMessage(error, 'INITIALIZATION_FAILED', translateAuthError)
    toast.error(errorMessage)
  }
}

async function signIn(): Promise<void> {
  authLoadingState.isSigningIn = true
  try {
    await loginWithBrowser()
  } finally {
    authLoadingState.isSigningIn = false
  }
}

async function signUp(): Promise<void> {
  authLoadingState.isSigningUp = true
  try {
    await loginWithBrowser('sign-up')
  } finally {
    authLoadingState.isSigningUp = false
  }
}

async function signOut(): Promise<void> {
  authLoadingState.isSigningOut = true
  try {
    await transport.send(AuthEvents.session.logout)
  } finally {
    authLoadingState.isSigningOut = false
  }
}

function checkAuthStatus() {
  void initializeAuth()
}

function cleanup(): boolean {
  if (activeConsumers > 0) {
    activeConsumers -= 1
  }
  if (activeConsumers > 0) {
    return false
  }
  isInitialized = false
  return true
}

async function loginWithBrowser(mode: 'sign-in' | 'sign-up' = 'sign-in'): Promise<LoginResult> {
  if (pendingBrowserLogin.value) {
    const previous = pendingBrowserLogin.value
    clearTimeout(previous.timeoutId)
    window.clearInterval(previous.countdownId)
    pendingBrowserLogin.value = null
    previous.resolve({ success: false, error: new Error('Superseded by new login') })
  }

  const timeoutMs = resolveBrowserLoginTimeoutMs()
  authLoadingState.isLoggingIn = true
  authLoadingState.loginProgress = 0
  authLoadingState.loginStage = 'preparing'
  authLoadingState.loginTimeRemaining = Math.ceil(timeoutMs / 1000)

  return new Promise((resolve) => {
    const openedAt = Date.now()
    const attemptId = ++nextBrowserLoginAttemptId
    const timeoutId = createBrowserLoginTimeout(resolve, timeoutMs, attemptId)
    const countdownId = createBrowserLoginCountdown(openedAt, timeoutMs)
    const loginEntry = { attemptId, resolve, reject: () => {}, timeoutId, countdownId, openedAt }
    pendingBrowserLogin.value = loginEntry
    openBrowserLoginPage(mode)
      .then((loginStart) => {
        if (pendingBrowserLogin.value !== loginEntry) return
        // The login already in flight was approved and applied instead; the state broadcast
        // finishes this one.
        if (!loginStart.initiated) return
        authLoadingState.loginAuthorizeUrl = loginStart.authorizeUrl || ''
        authLoadingState.loginUserCode = loginStart.userCode || ''
        authLoadingState.loginExpiresAt = loginStart.expiresAt || ''
        authLoadingState.loginBrowserOpenFailed = loginStart.browserOpenFailed === true
        if (pendingBrowserLogin.value === loginEntry) {
          authLoadingState.loginStage = 'waiting'
        }
        toast.info(
          authLoadingState.loginBrowserOpenFailed
            ? resolveAuthUiMessage(
                'settingUser.browserOpenManualToast',
                'The browser did not open automatically. Copy the sign-in link to continue.'
              )
            : resolveAuthUiMessage(
                'settingUser.completeBrowserLoginToast',
                'Complete sign-in in your browser.'
              )
        )
      })
      .catch((err) => {
        if (pendingBrowserLogin.value !== loginEntry) return
        clearBrowserLoginLoading()
        authLoadingState.loginStage = 'failed'
        authLoadingState.loginProgress = 0
        toast.error(resolveAuthErrorMessage(err, 'BROWSER_OPEN_FAILED', translateAuthError))
        resolve({ success: false, error: err })
      })
  })
}

async function login(options: LoginOptions = {}): Promise<LoginResult> {
  const { onSuccess, onError } = options
  if (isLoggedIn.value) {
    const user = currentUser.value
    onSuccess?.(user)
    return { success: true, user }
  }

  const result = await loginWithBrowser()

  if (result.success) {
    onSuccess?.(result.user)
  } else {
    onError?.(result.error)
  }
  return result
}

async function logout(): Promise<void> {
  try {
    if (isAuthenticated.value) {
      await signOut()
    }
    toast.success(resolveAuthUiMessage('settingUser.logoutSuccess', 'Signed out'))
  } catch (error) {
    const errorMessage = resolveAuthErrorMessage(error, 'SIGN_OUT_FAILED', translateAuthError)
    toast.error(errorMessage)
  }
}

async function handleExternalAuthCallback(
  token: string,
  appToken?: string,
  refreshToken?: string,
  ttlSeconds?: number
): Promise<void> {
  const resolvedToken = appToken || token
  isHandlingExternalAuthCallback.value = true
  try {
    if (!resolvedToken) {
      const error = new Error('Missing token')
      toast.error(resolveAuthErrorMessage(error, 'AUTH_ERROR', translateAuthError))
      if (pendingBrowserLogin.value) {
        resolvePendingBrowserLogin({ success: false, error })
      }
      return
    }

    const result = (await transport.send(AuthEvents.token.manual, {
      token: resolvedToken,
      appToken,
      refreshToken,
      ttlSeconds
    })) as { success?: boolean } | null
    if (!result?.success) {
      throw new Error('Auth callback failed')
    }

    const state = (await transport.send(AuthEvents.session.getState)) as AuthState | null
    if (state) {
      applyAuthState(state)
    } else {
      await initializeAuth()
    }
    if (!authState.isSignedIn) {
      throw new Error('Auth callback completed but profile is unavailable')
    }

    if (pendingBrowserLogin.value) {
      resolvePendingBrowserLogin({ success: true, user: currentUser.value })
    }
    authLoadingState.loginStage = 'success'
    authLoadingState.isLoggingIn = false
    authLoadingState.loginProgress = 100
    toast.success(resolveAuthUiMessage('settingUser.loginSuccessToast', 'Signed in'))
  } catch (error) {
    const errorMessage = resolveAuthErrorMessage(error, 'AUTH_ERROR', translateAuthError)
    toast.error(errorMessage)

    if (pendingBrowserLogin.value) {
      resolvePendingBrowserLogin({ success: false, error })
    }
    authLoadingState.loginStage = 'failed'
  } finally {
    isHandlingExternalAuthCallback.value = false
    authLoadingState.isLoggingIn = false
  }
}

function setupAuthStateListener(): void {
  if (authStateCleanup) return
  authStateCleanup = transport.on(AuthEvents.session.stateChanged, (payload) => {
    if (!payload) {
      return
    }
    applyAuthState(payload)
    if (payload.isSignedIn) {
      if (pendingBrowserLogin.value) {
        finishPendingBrowserLogin({ success: true, user: currentUser.value })
        authLoadingState.loginStage = 'success'
        authLoadingState.loginProgress = 100
        toast.success(resolveAuthUiMessage('settingUser.loginSuccessToast', 'Signed in'))
        return
      }
      if (authLoadingState.isLoggingIn) {
        authLoadingState.loginStage = 'success'
        clearBrowserLoginLoading()
        authLoadingState.loginProgress = 100
      }
      return
    }

    if (authLoadingState.isLoggingIn) {
      finishPendingBrowserLogin({
        success: false,
        error: new Error('Login state changed without session')
      })
      authLoadingState.loginStage = 'failed'
      authLoadingState.loginProgress = 0
    }
  })

  if (isDevEnv()) {
    const devTokenHandler = (e: CustomEvent<string>) => {
      if (e.detail) {
        handleExternalAuthCallback(e.detail)
      }
    }
    window.addEventListener('dev-auth-token', devTokenHandler as EventListener)
    window.__devAuthToken = (token: string) => {
      handleExternalAuthCallback(token)
    }
    devTokenCleanup = () => {
      window.removeEventListener('dev-auth-token', devTokenHandler as EventListener)
      window.__devAuthToken = undefined
    }
  }
}

function cleanupAuthStateListener(): void {
  if (authStateCleanup) {
    authStateCleanup()
    authStateCleanup = null
  }
  if (devTokenCleanup) {
    devTokenCleanup()
    devTokenCleanup = null
  }
}

async function openBrowserLoginPage(
  mode: 'sign-in' | 'sign-up' = 'sign-in'
): Promise<AuthInitiatedResponse> {
  return (await transport.send(AuthEvents.session.login, { mode })) as AuthInitiatedResponse
}

async function checkPendingBrowserLogin(): Promise<AuthPendingLoginStatus> {
  try {
    const response = (await transport.send(
      AuthEvents.session.checkPendingLogin
    )) as AuthPendingLoginResponse | null
    return response?.status ?? 'waiting'
  } catch {
    return 'waiting'
  }
}

function updateBrowserLoginCountdown(openedAt: number, timeoutMs: number): void {
  const elapsedMs = Date.now() - openedAt
  const remainingMs = Math.max(0, timeoutMs - elapsedMs)
  authLoadingState.loginTimeRemaining = Math.ceil(remainingMs / 1000)
}

function createBrowserLoginCountdown(openedAt: number, timeoutMs: number): BrowserIntervalId {
  updateBrowserLoginCountdown(openedAt, timeoutMs)
  return window.setInterval(() => {
    updateBrowserLoginCountdown(openedAt, timeoutMs)
  }, BROWSER_LOGIN_COUNTDOWN_TICK_MS) as BrowserIntervalId
}

function createBrowserLoginTimeout(
  resolve: (result: LoginResult) => void,
  timeoutMs: number,
  attemptId: number
): ReturnType<typeof setTimeout> {
  const timeoutId = setTimeout(() => {
    const current = pendingBrowserLogin.value
    if (current && current.attemptId === attemptId) {
      const error = new Error('Browser login timeout')
      authLoadingState.loginStage = 'failed'
      authLoadingState.loginProgress = 0
      authLoadingState.isLoggingIn = false
      authLoadingState.loginTimeRemaining = 0
      window.clearInterval(current.countdownId)
      clearTimeout(current.timeoutId)
      pendingBrowserLogin.value = null
      toast.error(resolveAuthErrorMessage(error, 'LOGIN_TIMEOUT', translateAuthError))
      resolve({ success: false, error })
    }
  }, timeoutMs)
  return timeoutId
}

function isJwtToken(token: string): boolean {
  const parts = token.split('.')
  return parts.length === 3 && parts.every(Boolean)
}

function cancelPendingBrowserLogin(reason = 'Login cancelled'): void {
  if (!pendingBrowserLogin.value) return
  // Main polls on its own; left running, a later approval in the browser would still sign in.
  void transport.send(AuthEvents.session.cancelLogin).catch(() => {})
  clearTimeout(pendingBrowserLogin.value.timeoutId)
  window.clearInterval(pendingBrowserLogin.value.countdownId)
  pendingBrowserLogin.value.resolve({ success: false, error: new Error(reason) })
  pendingBrowserLogin.value = null
  authLoadingState.isLoggingIn = false
  authLoadingState.loginProgress = 0
  authLoadingState.loginTimeRemaining = 0
  authLoadingState.loginStage = 'idle'
  authLoadingState.loginAuthorizeUrl = ''
  authLoadingState.loginUserCode = ''
  authLoadingState.loginExpiresAt = ''
  authLoadingState.loginBrowserOpenFailed = false
}

async function retryPendingBrowserLogin(): Promise<void> {
  const current = pendingBrowserLogin.value
  if (!current) return
  clearTimeout(current.timeoutId)
  window.clearInterval(current.countdownId)
  const timeoutMs = resolveBrowserLoginTimeoutMs()
  const openedAt = Date.now()
  const nextAttemptId = ++nextBrowserLoginAttemptId
  const nextTimeoutId = createBrowserLoginTimeout(current.resolve, timeoutMs, nextAttemptId)
  const nextCountdownId = createBrowserLoginCountdown(openedAt, timeoutMs)
  current.attemptId = nextAttemptId
  current.openedAt = openedAt
  current.timeoutId = nextTimeoutId
  current.countdownId = nextCountdownId
  try {
    authLoadingState.loginStage = 'preparing'
    const loginStart = await openBrowserLoginPage()
    if (pendingBrowserLogin.value !== current || current.attemptId !== nextAttemptId) return
    // The browser had approved the login after all: main applied it rather than reopening.
    if (!loginStart.initiated) return
    authLoadingState.loginAuthorizeUrl = loginStart.authorizeUrl || ''
    authLoadingState.loginUserCode = loginStart.userCode || ''
    authLoadingState.loginExpiresAt = loginStart.expiresAt || ''
    authLoadingState.loginBrowserOpenFailed = loginStart.browserOpenFailed === true
    authLoadingState.loginStage = 'waiting'
    toast.info(
      authLoadingState.loginBrowserOpenFailed
        ? resolveAuthUiMessage(
            'settingUser.browserOpenManualToast',
            'The browser did not open automatically. Copy the sign-in link to continue.'
          )
        : resolveAuthUiMessage('settingUser.loginPageReopenedToast', 'Sign-in page reopened.')
    )
  } catch (error) {
    if (pendingBrowserLogin.value === current && current.attemptId === nextAttemptId) {
      clearTimeout(nextTimeoutId)
      window.clearInterval(nextCountdownId)
      pendingBrowserLogin.value = null
      current.resolve({ success: false, error })
    } else {
      clearTimeout(nextTimeoutId)
      window.clearInterval(nextCountdownId)
      return
    }
    const errorMessage = resolveAuthErrorMessage(error, 'BROWSER_OPEN_FAILED', translateAuthError)
    authLoadingState.loginStage = 'failed'
    authLoadingState.isLoggingIn = false
    authLoadingState.loginProgress = 0
    authLoadingState.loginTimeRemaining = 0
    toast.error(errorMessage)
  }
}

async function reopenBrowserLogin(): Promise<void> {
  if (pendingBrowserLogin.value) {
    await retryPendingBrowserLogin()
    return
  }
  await loginWithBrowser()
}

async function handleManualTokenLogin(rawToken: string): Promise<void> {
  const token = rawToken.trim()
  if (!token) {
    toast.error(resolveAuthUiMessage('settingUser.tokenRequired', 'Enter a token'))
    return
  }
  if (isJwtToken(token)) {
    await handleExternalAuthCallback('', token)
    return
  }
  await handleExternalAuthCallback(token)
}

/**
 * Whether the browser login in flight still calls for the resume prompt. A prompt run sets
 * `promptActive` itself, so the checks it makes afterwards pass false.
 */
function loginResumePromptAllowed(promptActive: boolean): boolean {
  return canShowLoginResumePrompt({
    beginnerInit: appSetting?.beginner?.init,
    hasPendingBrowserLogin: Boolean(pendingBrowserLogin.value),
    isSignedIn: authState.isSignedIn,
    isHandlingExternalAuthCallback: isHandlingExternalAuthCallback.value,
    promptActive
  })
}

async function showLoginResumePrompt(): Promise<{
  action: 'manual' | 'retry' | 'cancel'
  token?: string
} | null> {
  const appContext = authPromptAppContext
  if (!appContext) {
    return { action: 'cancel' }
  }

  return new Promise((resolve) => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    let resolved = false
    let stopWatchingLogin: (() => void) | null = null

    const finish = (result: { action: 'manual' | 'retry' | 'cancel'; token?: string } | null) => {
      if (resolved) return
      resolved = true
      stopWatchingLogin?.()
      render(null, root)
      root.remove()
      resolve(result)
    }
    // Nothing is left to resume once the login lands, ends, or a callback starts applying it.
    stopWatchingLogin = watch(
      () => loginResumePromptAllowed(false),
      (allowed) => {
        if (!allowed) finish(null)
      }
    )

    const vnode = createVNode(AuthLoginResumePrompt, {
      onAction: (result: { action: 'manual' | 'retry' | 'cancel'; token?: string }) => {
        if (result.action === 'manual' && !result.token) {
          toast.error(resolveAuthUiMessage('settingUser.tokenRequired', 'Enter a token'))
          return
        }
        finish(result)
      }
    })
    vnode.appContext = appContext
    render(vnode, root)
  })
}

function setupAuthFocusPrompt(): void {
  if (focusPromptCleanup) return
  let promptActive = false
  let delayedPromptTimer: number | null = null

  const clearDelayedPromptTimer = () => {
    if (delayedPromptTimer == null) return
    window.clearTimeout(delayedPromptTimer)
    delayedPromptTimer = null
  }

  const canPrompt = () => loginResumePromptAllowed(promptActive)

  const runPrompt = () => {
    if (!canPrompt()) return

    promptActive = true
    void (async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, FOCUS_PROMPT_RECHECK_DELAY_MS))
        if (!loginResumePromptAllowed(false)) return
        // Main may not have polled since the browser approved. A login about to land must not get
        // a prompt offering to restart it.
        if ((await checkPendingBrowserLogin()) === 'signed-in') return
        if (!loginResumePromptAllowed(false)) return
        const result = await showLoginResumePrompt()
        if (!result) return
        if (result.action === 'manual' && result.token) {
          await handleManualTokenLogin(result.token)
          return
        }
        if (result.action === 'retry') {
          await retryPendingBrowserLogin()
          return
        }
        cancelPendingBrowserLogin()
      } finally {
        promptActive = false
      }
    })()
  }

  const schedulePromptIfNeeded = () => {
    if (!canPrompt()) return

    const openedAt = pendingBrowserLogin.value?.openedAt || Date.now()
    const elapsed = Date.now() - openedAt
    if (elapsed < BROWSER_LOGIN_CALLBACK_GRACE_MS) {
      clearDelayedPromptTimer()
      delayedPromptTimer = window.setTimeout(() => {
        delayedPromptTimer = null
        if (!document.hasFocus()) return
        runPrompt()
      }, BROWSER_LOGIN_CALLBACK_GRACE_MS - elapsed)
      return
    }

    runPrompt()
  }

  const handleFocus = () => {
    if (!pendingBrowserLogin.value || !document.hasFocus()) return
    schedulePromptIfNeeded()
  }

  let pendingPromptPollerId: number | null = null
  let focusListenerAttached = false

  const stopPendingPromptWatchers = () => {
    if (pendingPromptPollerId != null) {
      window.clearInterval(pendingPromptPollerId)
      pendingPromptPollerId = null
    }
    if (focusListenerAttached) {
      window.removeEventListener('focus', handleFocus)
      focusListenerAttached = false
    }
    clearDelayedPromptTimer()
  }

  const startPendingPromptWatchers = () => {
    if (!focusListenerAttached) {
      window.addEventListener('focus', handleFocus)
      focusListenerAttached = true
    }
    if (pendingPromptPollerId == null) {
      pendingPromptPollerId = window.setInterval(() => {
        if (!pendingBrowserLogin.value) {
          stopPendingPromptWatchers()
          return
        }
        if (!document.hasFocus()) return
        schedulePromptIfNeeded()
      }, 1000)
    }
  }

  const watcherScope = effectScope(true)
  watcherScope.run(() => {
    watch(
      () => pendingBrowserLogin.value !== null,
      (hasPending) => {
        if (hasPending) {
          startPendingPromptWatchers()
        } else {
          stopPendingPromptWatchers()
        }
      },
      { immediate: true, flush: 'sync' }
    )
  })

  focusPromptCleanup = () => {
    watcherScope.stop()
    stopPendingPromptWatchers()
  }
}

function cleanupAuthFocusPrompt(): void {
  if (focusPromptCleanup) {
    focusPromptCleanup()
    focusPromptCleanup = null
  }
}

export function useAuth() {
  const instance = getCurrentInstance()
  if (instance?.appContext) {
    authPromptAppContext = instance.appContext
  }

  onMounted(() => {
    activeConsumers += 1
    setupAuthStateListener()
    setupAuthFocusPrompt()

    const mountAction = resolveAuthMountAction(isInitialized)

    if (mountAction === 'initialize') {
      initializeAuth()
      return
    }

    checkAuthStatus()
  })

  onUnmounted(() => {
    const shouldCleanupGlobalResources = cleanup()
    if (shouldCleanupGlobalResources) {
      cleanupAuthStateListener()
      cleanupAuthFocusPrompt()
      authPromptAppContext = null
    }
  })

  return {
    authState,
    isLoading,
    isAuthenticated,
    user,
    isLoggedIn,
    currentUser,
    authLoadingState,
    signIn,
    signUp,
    signOut,
    login,
    loginWithBrowser,
    logout,
    getUser: () => user.value,
    checkAuthStatus,
    initializeAuth,
    getDisplayName,
    getPrimaryEmail,
    getUserBio,
    updateUserProfile,
    updateUserAvatar,
    openLoginSettings,
    reopenBrowserLogin,
    cancelPendingBrowserLogin,
    requestStepUp,
    runSyncBootstrap,
    runWithStepUpToken,
    getStepUpToken,
    clearStepUpToken
  }
}

export const __test = {
  resolveAuthErrorMessage
}
