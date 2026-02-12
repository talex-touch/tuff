import type { AuthUser, LoginOptions, LoginResult } from '@talex-touch/utils/renderer'
import type { AppContext } from 'vue'
import { useAppSdk, useAuthState, useCurrentUser } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { SentryEvents } from '@talex-touch/utils/transport/events'
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
import AuthLoginResumePrompt from '~/components/auth/AuthLoginResumePrompt.vue'
import { appSetting } from '../channel/storage/index'
import {
  clearAppAuthToken,
  getAppAuthToken,
  getAuthBaseUrl,
  getAppDeviceId,
  getAppDeviceName,
  getAppDevicePlatform,
  setAppAuthToken
} from './auth-env'
import { attestCurrentDevice } from './device-attest'
import { applyDefaultSyncOnLogin, getSyncPreferenceState } from './sync-preferences'
import { startAutoSync, stopAutoSync } from '~/modules/sync'

let authCallbackCleanup: (() => void) | null = null
let stepUpCallbackCleanup: (() => void) | null = null
let focusPromptCleanup: (() => void) | null = null
let isInitialized = false
let activeConsumers = 0

const transport = useTuffTransport()
const appSdk = useAppSdk()
const BROWSER_LOGIN_TIMEOUT_MS = 5 * 60 * 1000
const BROWSER_LOGIN_CALLBACK_GRACE_MS = 5000
const FOCUS_PROMPT_RECHECK_DELAY_MS = 400

interface RemoteUserProfilePayload {
  id: string
  email: string
  name: string | null
  image: string | null
  role?: string | null
  locale?: string | null
  emailVerified?: boolean
}

function toAuthUserProfile(data: RemoteUserProfilePayload): AuthUser {
  return {
    id: data.id,
    email: data.email,
    name: data.name ?? data.email,
    avatar: data.image ?? null,
    role: data.role ?? null,
    locale: data.locale ?? null,
    emailVerified: data.emailVerified ?? false
  }
}

async function patchRemoteUserProfile(
  token: string,
  payload: { name?: string | null; image?: string | null }
): Promise<RemoteUserProfilePayload> {
  const url = new URL('/api/v1/auth/profile', getAuthBaseUrl()).toString()
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
  return (await response.json()) as RemoteUserProfilePayload
}

async function fetchRemoteUser(token: string): Promise<AuthUser | null> {
  try {
    const url = new URL('/api/v1/auth/me', getAuthBaseUrl()).toString()
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    if (!response.ok) {
      return null
    }
    const data = (await response.json()) as RemoteUserProfilePayload
    return toAuthUserProfile(data)
  } catch {
    return null
  }
}

const pendingBrowserLogin = ref<{
  resolve: (result: LoginResult) => void
  reject: (error: Error) => void
  timeoutId: NodeJS.Timeout
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
  loginTimeRemaining: 0
})

const STEP_UP_TOKEN_TTL_MS = 1000 * 60 * 10
const stepUpToken = ref<string | null>(null)
const stepUpTokenExpiresAt = ref<number>(0)

function setStepUpToken(token: string): void {
  const trimmed = token.trim()
  if (!trimmed) return
  stepUpToken.value = trimmed
  stepUpTokenExpiresAt.value = Date.now() + STEP_UP_TOKEN_TTL_MS
}

function clearStepUpToken(): void {
  stepUpToken.value = null
  stepUpTokenExpiresAt.value = 0
}

function getStepUpToken(): string | null {
  if (!stepUpToken.value) return null
  if (stepUpTokenExpiresAt.value && stepUpTokenExpiresAt.value <= Date.now()) {
    clearStepUpToken()
    return null
  }
  return stepUpToken.value
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
  const existing = getStepUpToken()
  if (existing) {
    return existing
  }

  return await new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const token = getStepUpToken()
      if (!token) {
        return
      }
      clearInterval(timer)
      clearTimeout(timeout)
      resolve(token)
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
  const currentToken = getStepUpToken()
  try {
    return await executor(currentToken)
  } catch (error) {
    if (!isStepUpRequiredError(error)) {
      throw error
    }

    clearStepUpToken()
    await requestStepUp()
    const refreshedToken = await waitForStepUpToken()
    return await executor(refreshedToken)
  }
}

const ERROR_MESSAGES = {
  INITIALIZATION_FAILED: '认证系统初始化失败，请检查网络连接或稍后重试',
  SIGN_IN_FAILED: '登录失败，请检查网络连接或稍后重试',
  SIGN_UP_FAILED: '注册失败，请检查网络连接或稍后重试',
  SIGN_OUT_FAILED: '登出失败，请重试',
  LOGIN_TIMEOUT: '登录超时，请重试',
  NETWORK_ERROR: '网络连接失败，请检查网络设置',
  AUTH_ERROR: '认证失败，请重试',
  UNKNOWN_ERROR: '发生未知错误，请重试'
}

function getErrorMessage(error: unknown, defaultType: string): string {
  if (!error) return ERROR_MESSAGES[defaultType as keyof typeof ERROR_MESSAGES]
  const errorMessage = (error as Error).message || String(error)
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('timeout')
  ) {
    return ERROR_MESSAGES.NETWORK_ERROR
  }
  if (errorMessage.includes('timeout')) {
    return ERROR_MESSAGES.LOGIN_TIMEOUT
  }
  return ERROR_MESSAGES[defaultType as keyof typeof ERROR_MESSAGES] || ERROR_MESSAGES.UNKNOWN_ERROR
}

const { authState } = useAuthState()
const { currentUser } = useCurrentUser()

const isLoading = computed(() => !authState.isLoaded)
const isAuthenticated = computed(() => authState.isSignedIn)
const user = computed(() => authState.user)
const isLoggedIn = computed(() => authState.isSignedIn)

function updateAuthState(nextUser: AuthUser | null, sessionId?: string | null): void {
  authState.isLoaded = true
  authState.isSignedIn = Boolean(nextUser)
  authState.user = nextUser
  authState.sessionId = sessionId ?? null

  if (nextUser) {
    applyDefaultSyncOnLogin()
  }

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

  const token = getAppAuthToken()
  if (!token) {
    throw new Error('Not authenticated')
  }

  const data = await patchRemoteUserProfile(token, {
    name: payload.displayName ?? authState.user?.name ?? null
  })
  const nextUser: AuthUser = {
    ...authState.user,
    ...toAuthUserProfile(data),
    bio: payload.bio ?? authState.user?.bio ?? null
  }
  updateAuthState(nextUser, authState.sessionId)
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
  const token = getAppAuthToken()
  if (!token) {
    throw new Error('Not authenticated')
  }
  const dataUrl = await fileToDataUrl(file)
  const data = await patchRemoteUserProfile(token, { image: dataUrl })
  const nextUser: AuthUser = {
    ...authState.user,
    ...toAuthUserProfile(data),
    avatar: data.image ?? dataUrl
  }
  updateAuthState(nextUser, authState.sessionId)
  return nextUser
}

async function openLoginSettings(): Promise<boolean> {
  return false
}

async function requestStepUp(): Promise<void> {
  const url = `${getAuthBaseUrl()}/auth/stepup-callback`
  await appSdk.openExternal(url)
  toast.info('请在浏览器中完成二次验证')
}

async function runSyncBootstrap(token?: string): Promise<boolean> {
  if (!getSyncPreferenceState().enabled) {
    return false
  }

  const resolvedToken = token ?? getAppAuthToken()
  if (!resolvedToken) {
    return false
  }

  await attestCurrentDevice(resolvedToken, {
    getOS: appSdk.getOS,
    getSecureValue: appSdk.getSecureValue,
    setSecureValue: appSdk.setSecureValue
  })
  return true
}

async function initializeAuth() {
  if (isInitialized) return

  try {
    const appToken = getAppAuthToken()
    if (appToken) {
      const remoteUser = await fetchRemoteUser(appToken)
      if (remoteUser) {
        updateAuthState(remoteUser, appToken)
        void runSyncBootstrap(appToken)
          .then((bootstrapped) => {
            if (bootstrapped) {
              return startAutoSync()
            }
            return undefined
          })
          .catch(() => {
            // ignore sync bootstrap failure
          })
        isInitialized = true
        return
      }
      clearAppAuthToken()
    }

    updateAuthState(null)
    stopAutoSync('logout')
    isInitialized = true
  } catch (error) {
    updateAuthState(null)
    stopAutoSync('logout')
    isInitialized = true
    const errorMessage = getErrorMessage(error, 'INITIALIZATION_FAILED')
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
    updateAuthState(null)
    clearAppAuthToken()
    stopAutoSync('logout')
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
  authLoadingState.isLoggingIn = true
  authLoadingState.loginProgress = 0

  return new Promise((resolve) => {
    const openedAt = Date.now()
    const timeoutId = createBrowserLoginTimeout(resolve)
    pendingBrowserLogin.value = { resolve, reject: () => {}, timeoutId, openedAt }
    openBrowserLoginPage(mode).catch((err) => {
      clearTimeout(timeoutId)
      pendingBrowserLogin.value = null
      authLoadingState.isLoggingIn = false
      toast.error('无法打开浏览器')
      resolve({ success: false, error: err })
    })
    toast.info('请在浏览器中完成登录')
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
    const errorMessage = getErrorMessage(error, 'SIGN_OUT_FAILED')
    toast.error(errorMessage)
  } finally {
    clearAppAuthToken()
    stopAutoSync('logout')
  }
}

async function handleExternalAuthCallback(token: string, appToken?: string): Promise<void> {
  const resolvedToken = appToken || token
  isHandlingExternalAuthCallback.value = true
  try {
    if (!resolvedToken) {
      const error = new Error('Missing token')
      toast.error(getErrorMessage(error, 'AUTH_ERROR'))
      if (pendingBrowserLogin.value) {
        clearTimeout(pendingBrowserLogin.value.timeoutId)
        pendingBrowserLogin.value.resolve({ success: false, error })
        pendingBrowserLogin.value = null
      }
      return
    }

    setAppAuthToken(resolvedToken)
    const remoteUser = await fetchRemoteUser(resolvedToken)
    if (!remoteUser) {
      throw new Error('Failed to fetch user profile')
    }
    updateAuthState(remoteUser, resolvedToken)
    void runSyncBootstrap(resolvedToken)
      .then((bootstrapped) => {
        if (bootstrapped) {
          return startAutoSync()
        }
        return undefined
      })
      .catch(() => {
        // ignore sync bootstrap failure
      })
    authLoadingState.loginProgress = 100
    toast.success('登录成功')

    if (pendingBrowserLogin.value) {
      clearTimeout(pendingBrowserLogin.value.timeoutId)
      pendingBrowserLogin.value.resolve({ success: true, user: currentUser.value })
      pendingBrowserLogin.value = null
    }
  } catch (error) {
    const errorMessage = getErrorMessage(error, 'AUTH_ERROR')
    toast.error(errorMessage)

    if (pendingBrowserLogin.value) {
      clearTimeout(pendingBrowserLogin.value.timeoutId)
      pendingBrowserLogin.value.resolve({ success: false, error })
      pendingBrowserLogin.value = null
    }
  } finally {
    isHandlingExternalAuthCallback.value = false
    authLoadingState.isLoggingIn = false
  }
}

function setupAuthCallbackListener(): void {
  if (authCallbackCleanup && stepUpCallbackCleanup) return
  const authCallbackEvent = defineRawEvent<{ token?: string; appToken?: string }, void>(
    'auth:external-callback'
  )
  authCallbackCleanup = transport.on(authCallbackEvent, (payload) => {
    const token = payload?.token || ''
    const appToken = payload?.appToken || ''
    if (token || appToken) {
      handleExternalAuthCallback(token, appToken)
    }
  })

  const stepUpCallbackEvent = defineRawEvent<{ loginToken?: string }, void>('auth:stepup-callback')
  stepUpCallbackCleanup = transport.on(stepUpCallbackEvent, (payload) => {
    const loginToken = payload?.loginToken || ''
    if (!loginToken) return
    setStepUpToken(loginToken)
    toast.success('二次验证完成')
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
    window.__devStepUpToken = (token: string) => {
      setStepUpToken(token)
      toast.success('二次验证完成')
    }
  }
}

function cleanupAuthCallbackListener(): void {
  if (authCallbackCleanup) {
    authCallbackCleanup()
    authCallbackCleanup = null
  }
  if (stepUpCallbackCleanup) {
    stepUpCallbackCleanup()
    stepUpCallbackCleanup = null
  }
}

function buildSignInUrl(mode: 'sign-in' | 'sign-up' = 'sign-in'): string {
  const nexusUrl = getAuthBaseUrl()
  const deviceId = getAppDeviceId()
  const deviceName = getAppDeviceName()
  const devicePlatform = getAppDevicePlatform()
  const redirectUrl = new URL('/auth/app-callback', nexusUrl)
  if (deviceId) {
    redirectUrl.searchParams.set('device_id', deviceId)
  }
  if (deviceName) {
    redirectUrl.searchParams.set('device_name', deviceName)
  }
  if (devicePlatform) {
    redirectUrl.searchParams.set('device_platform', devicePlatform)
  }

  const entry = mode === 'sign-up' ? '/sign-up' : '/sign-in'
  const url = new URL(entry, nexusUrl)
  url.searchParams.set('redirect_url', redirectUrl.pathname + redirectUrl.search)
  return url.toString()
}

async function openBrowserLoginPage(mode: 'sign-in' | 'sign-up' = 'sign-in'): Promise<void> {
  const signInUrl = buildSignInUrl(mode)
  await appSdk.openExternal(signInUrl)
}

function createBrowserLoginTimeout(resolve: (result: LoginResult) => void): NodeJS.Timeout {
  return setTimeout(() => {
    if (pendingBrowserLogin.value) {
      pendingBrowserLogin.value = null
      authLoadingState.isLoggingIn = false
      authLoadingState.loginProgress = 0
      const error = new Error('Browser login timeout')
      toast.error(getErrorMessage(error, 'LOGIN_TIMEOUT'))
      resolve({ success: false, error })
    }
  }, BROWSER_LOGIN_TIMEOUT_MS)
}

function isJwtToken(token: string): boolean {
  const parts = token.split('.')
  return parts.length === 3 && parts.every(Boolean)
}

function cancelPendingBrowserLogin(reason = 'Login cancelled'): void {
  if (!pendingBrowserLogin.value) return
  clearTimeout(pendingBrowserLogin.value.timeoutId)
  pendingBrowserLogin.value.resolve({ success: false, error: new Error(reason) })
  pendingBrowserLogin.value = null
  authLoadingState.isLoggingIn = false
  authLoadingState.loginProgress = 0
  authLoadingState.loginTimeRemaining = 0
}

async function retryPendingBrowserLogin(): Promise<void> {
  if (!pendingBrowserLogin.value) return
  clearTimeout(pendingBrowserLogin.value.timeoutId)
  pendingBrowserLogin.value.openedAt = Date.now()
  pendingBrowserLogin.value.timeoutId = createBrowserLoginTimeout(pendingBrowserLogin.value.resolve)
  try {
    await openBrowserLoginPage()
    toast.info('已重新打开登录页面')
  } catch {
    toast.error('无法重新打开浏览器')
  }
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
    if (!appSetting?.beginner?.init) return false
    if (!pendingBrowserLogin.value) return false
    if (authState.isSignedIn) return false
    if (isHandlingExternalAuthCallback.value) return false
    if (promptActive) return false
    return true
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
    setupAuthCallbackListener()
    setupAuthFocusPrompt()

    if (!appSetting?.beginner?.init) {
      return
    }

    if (!isInitialized) {
      initializeAuth()
      return
    }

    checkAuthStatus()
  })

  onUnmounted(() => {
    const shouldCleanupGlobalResources = cleanup()
    if (shouldCleanupGlobalResources) {
      cleanupAuthCallbackListener()
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
    requestStepUp,
    runSyncBootstrap,
    runWithStepUpToken,
    getStepUpToken,
    clearStepUpToken
  }
}
