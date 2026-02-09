import type { AuthUser, LoginOptions, LoginResult } from '@talex-touch/utils/renderer'
import { useAppSdk, useAuthState, useCurrentUser } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { SentryEvents } from '@talex-touch/utils/transport/events'
import type { ElMessageBoxOptions } from 'element-plus'
import { ElButton, ElInput, ElMessageBox } from 'element-plus'
import { computed, h, onMounted, onUnmounted, reactive, ref } from 'vue'
import { toast } from 'vue-sonner'
import { isDevEnv } from '@talex-touch/utils/env'
import { appSetting } from '../channel/storage/index'
import {
  clearAppAuthToken,
  DEV_AUTH_STORAGE_KEY,
  getAppAuthToken,
  getAuthBaseUrl,
  getAppDeviceId,
  getAppDeviceName,
  getAppDevicePlatform,
  getDevAuthToken,
  isLocalAuthMode,
  setAppAuthToken
} from './auth-env'
import { attestCurrentDevice } from './device-attest'

let authCallbackCleanup: (() => void) | null = null
let stepUpCallbackCleanup: (() => void) | null = null
let focusPromptCleanup: (() => void) | null = null
let isInitialized = false
let activeConsumers = 0

const transport = useTuffTransport()
const appSdk = useAppSdk()
const BROWSER_LOGIN_TIMEOUT_MS = 5 * 60 * 1000

function buildLocalUser(token?: string): AuthUser {
  const now = new Date().toISOString()
  const tokenHint = token ? token.replace(/[^a-z0-9]/gi, '').slice(0, 8) : 'local'
  return {
    id: `dev-${tokenHint || 'local'}`,
    email: 'dev@local',
    name: 'Dev Local',
    avatar: '',
    role: 'dev',
    createdAt: now,
    updatedAt: now
  }
}

function readLocalAuthUser(): AuthUser | null {
  if (!isLocalAuthMode()) return null
  try {
    const raw = localStorage.getItem(DEV_AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.user?.id) return parsed.user as AuthUser
  } catch (error) {
    console.warn('[useAuth] Failed to read local auth cache', error)
  }
  return null
}

function writeLocalAuthUser(user: AuthUser, token?: string): void {
  if (!isLocalAuthMode()) return
  try {
    localStorage.setItem(DEV_AUTH_STORAGE_KEY, JSON.stringify({ user, token: token ?? null }))
  } catch (error) {
    console.warn('[useAuth] Failed to persist local auth cache', error)
  }
}

function clearLocalAuthUser(): void {
  if (!isLocalAuthMode()) return
  try {
    localStorage.removeItem(DEV_AUTH_STORAGE_KEY)
  } catch (error) {
    console.warn('[useAuth] Failed to clear local auth cache', error)
  }
}

function applyLocalAuth(token?: string): void {
  const user = buildLocalUser(token)
  updateAuthState(user, token ?? `dev-session-${user.id}`)
  writeLocalAuthUser(user, token)
}

async function fetchRemoteUser(token: string): Promise<AuthUser | null> {
  try {
    const url = new URL('/api/auth/me', getAuthBaseUrl()).toString()
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    if (!response.ok) {
      return null
    }
    const data = (await response.json()) as {
      id: string
      email: string
      name: string | null
      image: string | null
      role?: string | null
      locale?: string | null
      emailVerified?: boolean
    }
    return {
      id: data.id,
      email: data.email,
      name: data.name ?? data.email,
      avatar: data.image ?? null,
      role: data.role ?? null,
      locale: data.locale ?? null,
      emailVerified: data.emailVerified ?? false
    }
  } catch (error) {
    console.warn('[useAuth] Failed to fetch user profile', error)
    return null
  }
}

const pendingBrowserLogin = ref<{
  resolve: (result: LoginResult) => void
  reject: (error: Error) => void
  timeoutId: NodeJS.Timeout
} | null>(null)

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

  void (async () => {
    try {
      const safeUser = nextUser
        ? {
            id: nextUser.id,
            username: nextUser.name ?? null,
            emailAddresses: nextUser.email ? [{ emailAddress: nextUser.email }] : []
          }
        : null
      await transport.send(SentryEvents.api.updateUser, { user: safeUser })
      try {
        const { updateSentryUserContext } = await import('~/modules/sentry/sentry-renderer')
        updateSentryUserContext(nextUser as any)
      } catch {
        // ignore
      }
    } catch (error) {
      console.debug('[useAuth] Failed to update Sentry user context', error)
    }
  })()
}

function getDisplayName(): string {
  return authState.user?.name || ''
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

  if (isLocalAuthMode()) {
    const localUser = authState.user ?? buildLocalUser()
    const updatedUser: AuthUser = { ...localUser }
    if (payload.displayName !== undefined) {
      updatedUser.name = payload.displayName
    }
    if (payload.bio !== undefined) {
      updatedUser.bio = payload.bio
    }
    updatedUser.updatedAt = new Date().toISOString()
    updateAuthState(updatedUser, authState.sessionId)
    writeLocalAuthUser(updatedUser, authState.sessionId ?? undefined)
    return updatedUser
  }

  const token = getAppAuthToken()
  if (!token) {
    throw new Error('Not authenticated')
  }

  const url = new URL('/api/auth/profile', getAuthBaseUrl()).toString()
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      name: payload.displayName ?? authState.user?.name ?? null
    })
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
  const data = (await response.json()) as AuthUser
  const nextUser: AuthUser = {
    ...authState.user,
    ...data,
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
  if (isLocalAuthMode()) {
    const dataUrl = await fileToDataUrl(file)
    const localUser = authState.user ?? buildLocalUser()
    const updatedUser: AuthUser = {
      ...localUser,
      avatar: dataUrl,
      updatedAt: new Date().toISOString()
    }
    updateAuthState(updatedUser, authState.sessionId)
    writeLocalAuthUser(updatedUser, authState.sessionId ?? undefined)
    return updatedUser
  }

  const token = getAppAuthToken()
  if (!token) {
    throw new Error('Not authenticated')
  }
  const dataUrl = await fileToDataUrl(file)
  const url = new URL('/api/auth/profile', getAuthBaseUrl()).toString()
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ image: dataUrl })
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
  const data = (await response.json()) as AuthUser
  const nextUser: AuthUser = {
    ...authState.user,
    ...data,
    avatar: data.avatar ?? dataUrl
  }
  updateAuthState(nextUser, authState.sessionId)
  return nextUser
}

async function openLoginSettings(): Promise<boolean> {
  return false
}

async function requestStepUp(): Promise<void> {
  if (isLocalAuthMode()) {
    toast.info('本地模式无需二次验证')
    return
  }
  const url = `${getAuthBaseUrl()}/auth/stepup-callback`
  await appSdk.openExternal(url)
  toast.info('请在浏览器中完成二次验证')
}

async function initializeAuth() {
  if (isInitialized) return

  try {
    if (isLocalAuthMode()) {
      const cachedUser = readLocalAuthUser()
      if (cachedUser) {
        updateAuthState(cachedUser, `dev-session-${cachedUser.id}`)
      } else {
        updateAuthState(null)
      }
      isInitialized = true
      return
    }

    const appToken = getAppAuthToken() || getDevAuthToken()
    if (appToken) {
      const remoteUser = await fetchRemoteUser(appToken)
      if (remoteUser) {
        updateAuthState(remoteUser, appToken)
        void attestCurrentDevice(appToken, {
          getOS: appSdk.getOS,
          getSecureValue: appSdk.getSecureValue,
          setSecureValue: appSdk.setSecureValue
        }).catch((error) => {
          console.debug('[useAuth] Device attestation skipped:', error)
        })
      } else {
        clearAppAuthToken()
        updateAuthState(null)
      }
    } else {
      updateAuthState(null)
    }
    isInitialized = true
  } catch (error) {
    console.error('[useAuth] Failed to initialize auth:', error)
    updateAuthState(null)
    const errorMessage = getErrorMessage(error, 'INITIALIZATION_FAILED')
    toast.error(errorMessage)
  }
}

async function signIn(): Promise<void> {
  if (isLocalAuthMode()) {
    applyLocalAuth()
    return
  }
  authLoadingState.isSigningIn = true
  try {
    await loginWithBrowser()
  } finally {
    authLoadingState.isSigningIn = false
  }
}

async function signUp(): Promise<void> {
  if (isLocalAuthMode()) {
    applyLocalAuth()
    return
  }
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
    clearLocalAuthUser()
  } finally {
    authLoadingState.isSigningOut = false
  }
}

function checkAuthStatus() {
  if (isLocalAuthMode()) return
  void initializeAuth()
}

function cleanup() {
  if (activeConsumers > 0) {
    activeConsumers -= 1
  }
  if (activeConsumers > 0) {
    return
  }
  isInitialized = false
}

async function loginWithBrowser(mode: 'sign-in' | 'sign-up' = 'sign-in'): Promise<LoginResult> {
  authLoadingState.isLoggingIn = true
  authLoadingState.loginProgress = 0

  return new Promise((resolve) => {
    const timeoutId = createBrowserLoginTimeout(resolve)
    pendingBrowserLogin.value = { resolve, reject: () => {}, timeoutId }
    openBrowserLoginPage(mode).catch((err) => {
      console.error('[useAuth] Failed to open browser:', err)
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

  const result = isLocalAuthMode()
    ? await (async () => {
        authLoadingState.isLoggingIn = true
        authLoadingState.loginProgress = 0
        authLoadingState.loginTimeRemaining = 0
        try {
          applyLocalAuth()
          authLoadingState.loginProgress = 100
          return { success: true, user: currentUser.value }
        } catch (error) {
          return { success: false, error }
        } finally {
          authLoadingState.isLoggingIn = false
        }
      })()
    : await loginWithBrowser()

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
    console.error('Logout failed:', error)
    const errorMessage = getErrorMessage(error, 'SIGN_OUT_FAILED')
    toast.error(errorMessage)
  } finally {
    clearAppAuthToken()
  }
}

async function handleExternalAuthCallback(token: string, appToken?: string): Promise<void> {
  const resolvedToken = appToken || token
  if (!resolvedToken) {
    toast.error(getErrorMessage(new Error('Missing token'), 'AUTH_ERROR'))
    return
  }

  try {
    if (isLocalAuthMode()) {
      applyLocalAuth(resolvedToken)
      authLoadingState.loginProgress = 100
      toast.success('登录成功')
      if (pendingBrowserLogin.value) {
        clearTimeout(pendingBrowserLogin.value.timeoutId)
        pendingBrowserLogin.value.resolve({ success: true, user: currentUser.value })
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
    void attestCurrentDevice(resolvedToken, {
      getOS: appSdk.getOS,
      getSecureValue: appSdk.getSecureValue,
      setSecureValue: appSdk.setSecureValue
    }).catch((error) => {
      console.debug('[useAuth] Device attestation skipped:', error)
    })
    authLoadingState.loginProgress = 100
    toast.success('登录成功')

    if (pendingBrowserLogin.value) {
      clearTimeout(pendingBrowserLogin.value.timeoutId)
      pendingBrowserLogin.value.resolve({ success: true, user: currentUser.value })
      pendingBrowserLogin.value = null
    }
  } catch (error) {
    console.error('[useAuth] External auth callback failed:', error)
    const errorMessage = getErrorMessage(error, 'AUTH_ERROR')
    toast.error(errorMessage)

    if (pendingBrowserLogin.value) {
      clearTimeout(pendingBrowserLogin.value.timeoutId)
      pendingBrowserLogin.value.resolve({ success: false, error })
      pendingBrowserLogin.value = null
    }
  } finally {
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
  pendingBrowserLogin.value.timeoutId = createBrowserLoginTimeout(pendingBrowserLogin.value.resolve)
  try {
    await openBrowserLoginPage()
    toast.info('已重新打开登录页面')
  } catch (error) {
    console.error('[useAuth] Failed to retry browser login:', error)
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
  return new Promise((resolve) => {
    const tokenInput = ref('')
    let resolved = false

    const finish = (result: { action: 'manual' | 'retry' | 'cancel'; token?: string }) => {
      if (resolved) return
      resolved = true
      ElMessageBox.close()
      resolve(result)
    }

    const handleManual = () => {
      const token = tokenInput.value.trim()
      if (!token) {
        toast.error('请输入 token')
        return
      }
      finish({ action: 'manual', token })
    }

    const handleRetry = () => finish({ action: 'retry' })
    const handleCancel = () => finish({ action: 'cancel' })

    const options: ElMessageBoxOptions = {
      title: '登录确认',
      message: h('div', { style: 'display: flex; flex-direction: column; gap: 12px;' }, [
        h('p', { style: 'margin: 0;' }, '检测到你已返回应用，但未拿到登录信息。是否已完成登录？'),
        h(ElInput, {
          modelValue: tokenInput.value,
          'onUpdate:modelValue': (value: string) => {
            tokenInput.value = value
          },
          type: 'textarea',
          autosize: { minRows: 2, maxRows: 4 },
          placeholder: '粘贴登录 token（可选）'
        }),
        h(
          'div',
          { style: 'display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px;' },
          [
            h(ElButton, { type: 'primary', onClick: handleManual }, () => '手动填入 token'),
            h(ElButton, { onClick: handleRetry }, () => '重新获取'),
            h(ElButton, { type: 'danger', onClick: handleCancel }, () => '取消登录')
          ]
        )
      ]),
      showConfirmButton: false,
      showCancelButton: false,
      closeOnClickModal: false,
      closeOnPressEscape: false,
      showClose: false,
      beforeClose: (_action, _instance, done) => {
        if (!resolved) {
          resolved = true
          resolve({ action: 'cancel' })
        }
        done()
      }
    }
    ElMessageBox(options).catch(() => {
      if (!resolved) {
        resolved = true
        resolve({ action: 'cancel' })
      }
    })
  })
}

function setupAuthFocusPrompt(): void {
  if (focusPromptCleanup) return
  let promptActive = false

  const handleFocus = () => {
    if (!appSetting?.beginner?.init) return
    if (!pendingBrowserLogin.value) return
    if (authState.isSignedIn) return
    if (promptActive) return

    promptActive = true
    void (async () => {
      try {
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

  window.addEventListener('focus', handleFocus)
  focusPromptCleanup = () => window.removeEventListener('focus', handleFocus)
}

function cleanupAuthFocusPrompt(): void {
  if (focusPromptCleanup) {
    focusPromptCleanup()
    focusPromptCleanup = null
  }
}

export function useAuth() {
  onMounted(() => {
    activeConsumers += 1
    setupAuthCallbackListener()
    setupAuthFocusPrompt()

    if (!appSetting?.beginner?.init) {
      console.log('[useAuth] Skipping auth status check on first launch')
      return
    }

    if (!isInitialized) {
      initializeAuth()
      return
    }

    checkAuthStatus()
  })

  onUnmounted(() => {
    cleanup()
    cleanupAuthCallbackListener()
    cleanupAuthFocusPrompt()
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
    runWithStepUpToken,
    getStepUpToken,
    clearStepUpToken
  }
}
