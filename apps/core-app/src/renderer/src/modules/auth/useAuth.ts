import type { AuthState, AuthUser, LoginOptions, LoginResult } from '@talex-touch/utils/renderer'
import type { AuthInitiatedResponse } from '@talex-touch/utils/transport/events/auth'
import type { AppContext } from 'vue'
import { useAuthState, useCurrentUser } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AuthEvents, SentryEvents } from '@talex-touch/utils/transport/events'
import {
  computed,
  createVNode,
  getCurrentInstance,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  render
} from 'vue'
import { toast } from 'vue-sonner'
import { isDevEnv } from '@talex-touch/utils/env'
import { appSettingOriginData } from '@talex-touch/utils/common/storage/entity/app-settings'
import AuthLoginResumePrompt from '~/components/auth/AuthLoginResumePrompt.vue'
import { appSetting } from '../storage/app-storage'
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

const pendingBrowserLogin = ref<{
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
  const existing = await getStepUpToken()
  if (existing) {
    return existing
  }

  return await new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      void getStepUpToken().then((token) => {
        if (!token) {
          return
        }
        clearInterval(timer)
        clearTimeout(timeout)
        resolve(token)
      })
    }, 250)

    const timeout = setTimeout(() => {
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

function ensureAuthPreferenceSettings(): void {
  if (!appSetting.auth) {
    appSetting.auth = { ...appSettingOriginData.auth }
    return
  }
  if (typeof appSetting.auth.secureStorageUserOverridden !== 'boolean') {
    appSetting.auth.secureStorageUserOverridden = false
  }
  if (typeof appSetting.auth.useSecureStorage !== 'boolean') {
    appSetting.auth.useSecureStorage = appSettingOriginData.auth.useSecureStorage
  } else if (!appSetting.auth.secureStorageUserOverridden && !appSetting.auth.useSecureStorage) {
    appSetting.auth.useSecureStorage = appSettingOriginData.auth.useSecureStorage
  }
  if (typeof appSetting.auth.secureStorageReminderShown !== 'boolean') {
    appSetting.auth.secureStorageReminderShown = false
  }
  if (typeof appSetting.auth.secureStorageUnavailable !== 'boolean') {
    appSetting.auth.secureStorageUnavailable = false
  }
}

function remindSecureStoragePreferenceOnce(): void {
  ensureAuthPreferenceSettings()
  if (appSetting.auth.useSecureStorage) {
    return
  }
  if (appSetting.auth.secureStorageReminderShown) {
    return
  }
  appSetting.auth.secureStorageReminderShown = true
  toast.info('当前登录凭证为会话模式。可在“用户设置”中启用登录凭证持久保护。')
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
    remindSecureStoragePreferenceOnce()
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
  toast.info('请在浏览器中完成二次验证')
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
    const errorMessage = resolveAuthErrorMessage(error, 'INITIALIZATION_FAILED')
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
  const timeoutMs = resolveBrowserLoginTimeoutMs()
  authLoadingState.isLoggingIn = true
  authLoadingState.loginProgress = 0
  authLoadingState.loginStage = 'preparing'
  authLoadingState.loginTimeRemaining = Math.ceil(timeoutMs / 1000)

  return new Promise((resolve) => {
    const openedAt = Date.now()
    const timeoutId = createBrowserLoginTimeout(resolve, timeoutMs)
    const countdownId = createBrowserLoginCountdown(openedAt, timeoutMs)
    pendingBrowserLogin.value = { resolve, reject: () => {}, timeoutId, countdownId, openedAt }
    openBrowserLoginPage(mode)
      .then((loginStart) => {
        authLoadingState.loginAuthorizeUrl = loginStart.authorizeUrl || ''
        authLoadingState.loginUserCode = loginStart.userCode || ''
        authLoadingState.loginExpiresAt = loginStart.expiresAt || ''
        authLoadingState.loginBrowserOpenFailed = loginStart.browserOpenFailed === true
        if (pendingBrowserLogin.value) {
          authLoadingState.loginStage = 'waiting'
        }
        toast.info(
          authLoadingState.loginBrowserOpenFailed
            ? '浏览器未自动打开，请手动复制登录链接继续'
            : '请在浏览器中完成登录'
        )
      })
      .catch((err) => {
        clearBrowserLoginLoading()
        authLoadingState.loginStage = 'failed'
        authLoadingState.loginProgress = 0
        toast.error(resolveAuthErrorMessage(err, 'BROWSER_OPEN_FAILED'))
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
    toast.success('已登出')
  } catch (error) {
    const errorMessage = resolveAuthErrorMessage(error, 'SIGN_OUT_FAILED')
    toast.error(errorMessage)
  }
}

async function handleExternalAuthCallback(token: string, appToken?: string): Promise<void> {
  const resolvedToken = appToken || token
  isHandlingExternalAuthCallback.value = true
  try {
    if (!resolvedToken) {
      const error = new Error('Missing token')
      toast.error(resolveAuthErrorMessage(error, 'AUTH_ERROR'))
      if (pendingBrowserLogin.value) {
        resolvePendingBrowserLogin({ success: false, error })
      }
      return
    }

    const result = (await transport.send(AuthEvents.token.manual, {
      token: resolvedToken,
      appToken
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
    toast.success('登录成功')
  } catch (error) {
    const errorMessage = resolveAuthErrorMessage(error, 'AUTH_ERROR')
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
        toast.success('登录成功')
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
  timeoutMs: number
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    if (pendingBrowserLogin.value) {
      const error = new Error('Browser login timeout')
      authLoadingState.loginStage = 'failed'
      authLoadingState.loginProgress = 0
      authLoadingState.isLoggingIn = false
      authLoadingState.loginTimeRemaining = 0
      window.clearInterval(pendingBrowserLogin.value.countdownId)
      clearTimeout(pendingBrowserLogin.value.timeoutId)
      pendingBrowserLogin.value = null
      toast.error(resolveAuthErrorMessage(error, 'LOGIN_TIMEOUT'))
      resolve({ success: false, error })
    }
  }, timeoutMs)
}

function isJwtToken(token: string): boolean {
  const parts = token.split('.')
  return parts.length === 3 && parts.every(Boolean)
}

function cancelPendingBrowserLogin(reason = 'Login cancelled'): void {
  if (!pendingBrowserLogin.value) return
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
  if (!pendingBrowserLogin.value) return
  clearTimeout(pendingBrowserLogin.value.timeoutId)
  window.clearInterval(pendingBrowserLogin.value.countdownId)
  const timeoutMs = resolveBrowserLoginTimeoutMs()
  pendingBrowserLogin.value.openedAt = Date.now()
  pendingBrowserLogin.value.timeoutId = createBrowserLoginTimeout(
    pendingBrowserLogin.value.resolve,
    timeoutMs
  )
  pendingBrowserLogin.value.countdownId = createBrowserLoginCountdown(
    pendingBrowserLogin.value.openedAt,
    timeoutMs
  )
  try {
    authLoadingState.loginStage = 'preparing'
    const loginStart = await openBrowserLoginPage()
    authLoadingState.loginAuthorizeUrl = loginStart.authorizeUrl || ''
    authLoadingState.loginUserCode = loginStart.userCode || ''
    authLoadingState.loginExpiresAt = loginStart.expiresAt || ''
    authLoadingState.loginBrowserOpenFailed = loginStart.browserOpenFailed === true
    authLoadingState.loginStage = 'waiting'
    toast.info(
      authLoadingState.loginBrowserOpenFailed
        ? '浏览器未自动打开，请手动复制登录链接继续'
        : '已重新打开登录页面'
    )
  } catch (error) {
    const errorMessage = resolveAuthErrorMessage(error, 'BROWSER_OPEN_FAILED')
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
    toast.error('请输入 token')
    return
  }
  if (isJwtToken(token)) {
    await handleExternalAuthCallback('', token)
    return
  }
  await handleExternalAuthCallback(token)
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

    const finish = (result: { action: 'manual' | 'retry' | 'cancel'; token?: string }) => {
      if (resolved) return
      resolved = true
      render(null, root)
      root.remove()
      resolve(result)
    }

    const vnode = createVNode(AuthLoginResumePrompt, {
      onAction: (result: { action: 'manual' | 'retry' | 'cancel'; token?: string }) => {
        if (result.action === 'manual' && !result.token) {
          toast.error('请输入 token')
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

  const canPrompt = () => {
    return canShowLoginResumePrompt({
      beginnerInit: appSetting?.beginner?.init,
      hasPendingBrowserLogin: Boolean(pendingBrowserLogin.value),
      isSignedIn: authState.isSignedIn,
      isHandlingExternalAuthCallback: isHandlingExternalAuthCallback.value,
      promptActive
    })
  }

  const runPrompt = () => {
    if (!canPrompt()) return

    promptActive = true
    void (async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, FOCUS_PROMPT_RECHECK_DELAY_MS))
        if (!canPrompt()) return
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
    if (!document.hasFocus()) return
    schedulePromptIfNeeded()
  }

  const pendingPromptPollerId = window.setInterval(() => {
    if (!document.hasFocus()) return
    schedulePromptIfNeeded()
  }, 1000)

  window.addEventListener('focus', handleFocus)
  focusPromptCleanup = () => {
    clearDelayedPromptTimer()
    window.clearInterval(pendingPromptPollerId)
    window.removeEventListener('focus', handleFocus)
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
