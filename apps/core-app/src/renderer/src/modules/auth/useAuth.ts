import type {
  ClerkResourceSnapshot,
  ClerkUser,
  LoginOptions,
  LoginResult
} from '@talex-touch/utils/renderer'
import {
  useAppSdk,
  useAuthState,
  useClerkProvider,
  useCurrentUser
} from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { SentryEvents } from '@talex-touch/utils/transport/events'
import type { ElMessageBoxOptions } from 'element-plus'
import { ElButton, ElInput, ElMessageBox } from 'element-plus'
import { computed, h, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { appSetting } from '../channel/storage/index'
import {
  clearAppAuthToken,
  DEV_AUTH_STORAGE_KEY,
  getAuthBaseUrl,
  isLocalAuthMode,
  setAppAuthToken
} from './auth-env'

let eventListenerCleanup: (() => void) | null = null
let authCallbackCleanup: (() => void) | null = null
let focusPromptCleanup: (() => void) | null = null
let isInitialized = false
let activeConsumers = 0
const transport = useTuffTransport()
const appSdk = useAppSdk()
const BROWSER_LOGIN_TIMEOUT_MS = 5 * 60 * 1000

function buildLocalUser(token?: string): ClerkUser {
  const now = new Date().toISOString()
  const tokenHint = token ? token.replace(/[^a-z0-9]/gi, '').slice(0, 8) : 'local'
  return {
    id: `dev-${tokenHint || 'local'}`,
    emailAddresses: [{ emailAddress: 'dev@local', id: 'dev-email' }],
    firstName: 'Dev',
    lastName: 'Local',
    username: 'dev-local',
    imageUrl: '',
    createdAt: now,
    updatedAt: now
  }
}

function readLocalAuthUser(): ClerkUser | null {
  if (!isLocalAuthMode()) return null
  try {
    const raw = localStorage.getItem(DEV_AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.user?.id) return parsed.user as ClerkUser
  } catch (error) {
    console.warn('[useAuth] Failed to read local auth cache', error)
  }
  return null
}

function writeLocalAuthUser(user: ClerkUser, token?: string): void {
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
  authState.isLoaded = true
  authState.isSignedIn = true
  authState.user = user
  authState.sessionId = token ?? `dev-session-${user.id}`
  writeLocalAuthUser(user, token)
}

// Pending browser login state
const pendingBrowserLogin = ref<{
  resolve: (result: LoginResult) => void
  reject: (error: Error) => void
  timeoutId: NodeJS.Timeout
} | null>(null)

// 认证操作加载状态
const authLoadingState = reactive({
  isSigningIn: false,
  isSigningUp: false,
  isSigningOut: false,
  isLoggingIn: false,
  loginProgress: 0, // 登录进度 0-100
  loginTimeRemaining: 0 // 剩余时间（秒）
})

// 错误消息映射
const ERROR_MESSAGES = {
  INITIALIZATION_FAILED: '认证系统初始化失败，请检查网络连接或稍后重试',
  CLERK_NOT_INITIALIZED: '认证服务未就绪，请稍后重试',
  SIGN_IN_FAILED: '登录失败，请检查网络连接或稍后重试',
  SIGN_UP_FAILED: '注册失败，请检查网络连接或稍后重试',
  SIGN_OUT_FAILED: '登出失败，请重试',
  LOGIN_TIMEOUT: '登录超时，请重试',
  NETWORK_ERROR: '网络连接失败，请检查网络设置',
  AUTH_ERROR: '认证失败，请重试',
  UNKNOWN_ERROR: '发生未知错误，请重试'
}

// 获取用户友好的错误消息
function getErrorMessage(error: unknown, defaultType: string): string {
  if (!error) return ERROR_MESSAGES[defaultType as keyof typeof ERROR_MESSAGES]

  const errorMessage = (error as Error).message || String(error)

  // 网络相关错误
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('timeout')
  ) {
    return ERROR_MESSAGES.NETWORK_ERROR
  }

  // Clerk 特定错误
  if (errorMessage.includes('Clerk') || errorMessage.includes('clerk')) {
    return ERROR_MESSAGES.AUTH_ERROR
  }

  // 超时错误
  if (errorMessage.includes('timeout') || errorMessage.includes('Login timeout')) {
    return ERROR_MESSAGES.LOGIN_TIMEOUT
  }

  // 返回默认错误消息
  return ERROR_MESSAGES[defaultType as keyof typeof ERROR_MESSAGES] || ERROR_MESSAGES.UNKNOWN_ERROR
}

const { authState } = useAuthState()
const { currentUser } = useCurrentUser()

const isLoading = computed(() => !authState.isLoaded)
const isAuthenticated = computed(() => authState.isSignedIn)
const user = computed(() => authState.user)
const isLoggedIn = computed(() => authState.isSignedIn)

function updateAuthState(snapshot?: ClerkResourceSnapshot | null) {
  const { getClerk } = useClerkProvider()
  const clerk = getClerk()
  const snapshotHasUser = snapshot ? Object.prototype.hasOwnProperty.call(snapshot, 'user') : false
  const snapshotHasSession = snapshot
    ? Object.prototype.hasOwnProperty.call(snapshot, 'session')
    : false

  const candidateUser = snapshotHasUser ? (snapshot?.user ?? null) : (clerk?.user ?? null)
  const candidateSession = snapshotHasSession
    ? (snapshot?.session ?? null)
    : (clerk?.session ?? null)

  const isUserValid =
    !!candidateUser &&
    typeof candidateUser === 'object' &&
    'id' in candidateUser &&
    !!candidateUser.id
  const isSessionValid =
    !!candidateSession &&
    typeof candidateSession === 'object' &&
    'id' in candidateSession &&
    !!candidateSession.id

  const resolvedSessionId = isSessionValid ? (candidateSession as { id: string }).id : null

  authState.isLoaded = true
  authState.isSignedIn = isUserValid && isSessionValid
  authState.user = isUserValid ? (candidateUser as ClerkUser) : null
  authState.sessionId = resolvedSessionId

  // Notify Sentry about user context change (async, don't block)
  void (async () => {
    try {
      // Notify main process Sentry - only send serializable data
      const safeUser = authState.user
        ? {
            id: authState.user.id,
            username: authState.user.username ?? null,
            emailAddresses: authState.user.emailAddresses?.map((e) => ({
              emailAddress: e.emailAddress
            }))
          }
        : null
      await transport.send(SentryEvents.api.updateUser, { user: safeUser })
      // Notify renderer process Sentry
      try {
        const { updateSentryUserContext } = await import('~/modules/sentry/sentry-renderer')
        updateSentryUserContext(authState.user)
      } catch {
        // Renderer Sentry not initialized yet
      }
    } catch (error) {
      // Silently fail if Sentry is not available
      console.debug('[useAuth] Failed to update Sentry user context', error)
    }
  })()
}

function getDisplayName(): string {
  if (!authState.user) return ''

  const { firstName, lastName, username } = authState.user
  if (firstName || lastName) {
    return [firstName, lastName].filter(Boolean).join(' ')
  }
  return username || ''
}

function getPrimaryEmail(): string {
  if (!authState.user?.emailAddresses?.length) return ''
  return authState.user.emailAddresses[0].emailAddress
}

type ProfileUpdateInput = {
  displayName?: string
  bio?: string
}

function splitDisplayName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim()
  if (!trimmed) return { firstName: '', lastName: '' }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

function getUserBio(): string {
  const metadata = authState.user?.publicMetadata
  return typeof metadata?.bio === 'string' ? metadata.bio : ''
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'))
    reader.readAsDataURL(file)
  })
}

async function updateUserProfile(payload: ProfileUpdateInput): Promise<ClerkUser | null> {
  if (!payload.displayName && payload.bio === undefined) {
    return authState.user
  }

  if (isLocalAuthMode()) {
    const localUser = authState.user ?? buildLocalUser()
    const updatedUser: ClerkUser = { ...localUser }

    if (payload.displayName !== undefined) {
      const { firstName, lastName } = splitDisplayName(payload.displayName)
      updatedUser.firstName = firstName || undefined
      updatedUser.lastName = lastName || undefined
    }

    if (payload.bio !== undefined) {
      const metadata = { ...(updatedUser.publicMetadata || {}) }
      metadata.bio = payload.bio
      updatedUser.publicMetadata = metadata
    }

    updatedUser.updatedAt = new Date().toISOString()
    authState.user = updatedUser
    writeLocalAuthUser(updatedUser, authState.sessionId ?? undefined)
    return updatedUser
  }

  const { getClerk, initializeClerk } = useClerkProvider()
  let clerk = getClerk()
  if (!clerk) {
    clerk = await initializeClerk()
  }

  if (!clerk?.user) {
    throw new Error('User not available')
  }

  const clerkUser = clerk.user as unknown as {
    update: (payload: Record<string, unknown>) => Promise<unknown>
    publicMetadata?: Record<string, unknown>
  }

  const updatePayload: Record<string, unknown> = {}
  if (payload.displayName !== undefined) {
    const { firstName, lastName } = splitDisplayName(payload.displayName)
    updatePayload.firstName = firstName
    updatePayload.lastName = lastName
  }
  if (payload.bio !== undefined) {
    const metadata = { ...(clerkUser.publicMetadata || {}) }
    metadata.bio = payload.bio
    updatePayload.publicMetadata = metadata
  }

  await clerkUser.update(updatePayload)
  updateAuthState(clerk)
  return authState.user
}

async function updateUserAvatar(file: File): Promise<ClerkUser | null> {
  if (isLocalAuthMode()) {
    const dataUrl = await fileToDataUrl(file)
    const localUser = authState.user ?? buildLocalUser()
    const updatedUser: ClerkUser = {
      ...localUser,
      imageUrl: dataUrl,
      updatedAt: new Date().toISOString()
    }
    authState.user = updatedUser
    writeLocalAuthUser(updatedUser, authState.sessionId ?? undefined)
    return updatedUser
  }

  const { getClerk, initializeClerk } = useClerkProvider()
  let clerk = getClerk()
  if (!clerk) {
    clerk = await initializeClerk()
  }

  if (!clerk?.user) {
    throw new Error('User not available')
  }

  const clerkUser = clerk.user as unknown as {
    setProfileImage?: (payload: { file: File }) => Promise<unknown>
  }
  if (typeof clerkUser.setProfileImage !== 'function') {
    throw new Error('Profile image update not supported')
  }

  await clerkUser.setProfileImage({ file })
  updateAuthState(clerk)
  return authState.user
}

async function openLoginSettings(): Promise<boolean> {
  if (isLocalAuthMode()) return false
  const { getClerk, initializeClerk } = useClerkProvider()
  let clerk = getClerk()
  if (!clerk) {
    clerk = await initializeClerk()
  }
  if (!clerk) return false
  const clerkWithProfile = clerk as unknown as { openUserProfile?: () => Promise<void> }
  if (typeof clerkWithProfile.openUserProfile === 'function') {
    await clerkWithProfile.openUserProfile()
    return true
  }
  return false
}

async function initializeAuth() {
  if (isInitialized) return

  try {
    if (isLocalAuthMode()) {
      const cachedUser = readLocalAuthUser()
      if (cachedUser) {
        authState.isLoaded = true
        authState.isSignedIn = true
        authState.user = cachedUser
        authState.sessionId = `dev-session-${cachedUser.id}`
      } else {
        authState.isLoaded = true
        authState.isSignedIn = false
        authState.user = null
        authState.sessionId = null
      }
      isInitialized = true
      return
    }

    const { initializeClerk } = useClerkProvider()
    const clerk = await initializeClerk()

    if (eventListenerCleanup) {
      eventListenerCleanup()
      eventListenerCleanup = null
    }

    eventListenerCleanup = clerk.addListener((resources: ClerkResourceSnapshot) => {
      updateAuthState(resources)
    })

    updateAuthState(clerk)
    isInitialized = true
  } catch (error) {
    console.error('Failed to initialize Clerk auth:', error)
    authState.isLoaded = true
    authState.isSignedIn = false
    authState.user = null
    authState.sessionId = null

    // 显示用户友好的错误消息
    const errorMessage = getErrorMessage(error, 'INITIALIZATION_FAILED')
    toast.error(errorMessage)
  }
}

async function signIn() {
  if (isLocalAuthMode()) {
    applyLocalAuth()
    return
  }

  const { getClerk } = useClerkProvider()
  const clerk = getClerk()
  if (!clerk) {
    const error = new Error('Clerk not initialized')
    const errorMessage = getErrorMessage(error, 'CLERK_NOT_INITIALIZED')
    toast.error(errorMessage)
    throw error
  }

  authLoadingState.isSigningIn = true
  try {
    await clerk.openSignIn()
  } catch (error) {
    console.error('Sign in failed:', error)
    const errorMessage = getErrorMessage(error, 'SIGN_IN_FAILED')
    toast.error(errorMessage)
    throw error
  } finally {
    authLoadingState.isSigningIn = false
  }
}

async function signUp() {
  if (isLocalAuthMode()) {
    applyLocalAuth()
    return
  }

  const { getClerk } = useClerkProvider()
  const clerk = getClerk()
  if (!clerk) {
    const error = new Error('Clerk not initialized')
    const errorMessage = getErrorMessage(error, 'CLERK_NOT_INITIALIZED')
    toast.error(errorMessage)
    throw error
  }

  authLoadingState.isSigningUp = true
  try {
    await clerk.openSignUp()
  } catch (error) {
    console.error('Sign up failed:', error)
    const errorMessage = getErrorMessage(error, 'SIGN_UP_FAILED')
    toast.error(errorMessage)
    throw error
  } finally {
    authLoadingState.isSigningUp = false
  }
}

async function signOut() {
  if (isLocalAuthMode()) {
    authState.isLoaded = true
    authState.isSignedIn = false
    authState.user = null
    authState.sessionId = null
    clearLocalAuthUser()
    clearAppAuthToken()
    return
  }

  const { getClerk } = useClerkProvider()
  const clerk = getClerk()
  if (!clerk) {
    const error = new Error('Clerk not initialized')
    const errorMessage = getErrorMessage(error, 'CLERK_NOT_INITIALIZED')
    toast.error(errorMessage)
    throw error
  }

  authLoadingState.isSigningOut = true
  try {
    await clerk.signOut()

    authState.isLoaded = true
    authState.isSignedIn = false
    authState.user = null
    authState.sessionId = null
    clearAppAuthToken()
  } catch (error) {
    console.error('Sign out failed:', error)
    const errorMessage = getErrorMessage(error, 'SIGN_OUT_FAILED')
    toast.error(errorMessage)
    throw error
  } finally {
    authLoadingState.isSigningOut = false
  }
}

function checkAuthStatus() {
  if (isLocalAuthMode()) return
  const { getClerk } = useClerkProvider()
  const clerk = getClerk()
  if (clerk) {
    updateAuthState(clerk)
  }
}

function cleanup() {
  if (activeConsumers > 0) {
    activeConsumers -= 1
  }

  if (activeConsumers > 0) {
    return
  }

  if (eventListenerCleanup) {
    eventListenerCleanup()
    eventListenerCleanup = null
  }
  isInitialized = false
}

async function loginWithClerk(): Promise<LoginResult> {
  authLoadingState.isLoggingIn = true
  authLoadingState.loginProgress = 0
  authLoadingState.loginTimeRemaining = 10

  try {
    await signIn()

    return new Promise((resolve) => {
      let timeoutId: NodeJS.Timeout | null = null
      let progressId: NodeJS.Timeout | null = null
      let isResolved = false

      // 启动进度更新
      const startTime = Date.now()
      const updateProgress = () => {
        if (isResolved) return

        const elapsed = (Date.now() - startTime) / 1000
        const progress = Math.min((elapsed / 10) * 100, 95) // 最多到95%，等待认证完成
        authLoadingState.loginProgress = progress
        authLoadingState.loginTimeRemaining = Math.max(0, 10 - elapsed)

        if (elapsed < 10) {
          progressId = setTimeout(updateProgress, 100)
        }
      }
      updateProgress()

      const stopWatcher = watch(isAuthenticated, (authenticated) => {
        if (authenticated && !isResolved) {
          isResolved = true
          stopWatcher()
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
          if (progressId) {
            clearTimeout(progressId)
          }

          // 登录成功，完成进度
          authLoadingState.loginProgress = 100
          authLoadingState.loginTimeRemaining = 0

          // 登录成功后，手动更新状态确保数据同步
          const { getClerk } = useClerkProvider()
          const clerk = getClerk()
          if (clerk) {
            updateAuthState(clerk)
          }

          const user = currentUser.value
          resolve({
            success: true,
            user
          })
        }
      })

      timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true
          stopWatcher()
          if (progressId) {
            clearTimeout(progressId)
          }
          const error = new Error('Login timeout')
          const errorMessage = getErrorMessage(error, 'LOGIN_TIMEOUT')
          toast.error(errorMessage)
          authLoadingState.loginProgress = 0
          authLoadingState.loginTimeRemaining = 0
          resolve({
            success: false,
            error
          })
        }
      }, 10000)
    })
  } catch (error) {
    authLoadingState.loginProgress = 0
    authLoadingState.loginTimeRemaining = 0
    return {
      success: false,
      error
    }
  } finally {
    authLoadingState.isLoggingIn = false
  }
}

async function login(options: LoginOptions = {}): Promise<LoginResult> {
  const { onSuccess, onError } = options

  if (isLoggedIn.value) {
    const user = currentUser.value
    onSuccess?.(user)
    return {
      success: true,
      user
    }
  }

  const result = isLocalAuthMode()
    ? await (async () => {
        authLoadingState.isLoggingIn = true
        authLoadingState.loginProgress = 0
        authLoadingState.loginTimeRemaining = 0
        try {
          applyLocalAuth()
          authLoadingState.loginProgress = 100
          return {
            success: true,
            user: currentUser.value
          }
        } catch (error) {
          return { success: false, error }
        } finally {
          authLoadingState.isLoggingIn = false
        }
      })()
    : await loginWithClerk()

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

/**
 * Login via external browser (opens Nexus sign-in page)
 * User completes auth in browser, then app receives callback via tuff:// protocol
 */
async function loginWithBrowser(): Promise<LoginResult> {
  authLoadingState.isLoggingIn = true
  authLoadingState.loginProgress = 0

  return new Promise((resolve) => {
    const timeoutId = createBrowserLoginTimeout(resolve)

    pendingBrowserLogin.value = { resolve, reject: () => {}, timeoutId }

    // Open browser to Nexus sign-in with app callback redirect
    openBrowserLoginPage().catch((err) => {
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

/**
 * Handle external auth callback from tuff:// protocol
 */
async function handleExternalAuthCallback(token: string, appToken?: string): Promise<void> {
  if (token) {
    console.log('[useAuth] Handling external auth callback, token length:', token.length)
  }
  if (appToken) {
    console.log('[useAuth] Handling external auth callback, app token length:', appToken.length)
  }

  if (!pendingBrowserLogin.value) {
    console.warn('[useAuth] Received auth callback but no pending login')
    // Still try to use the token
  }

  const resolvedAppToken = appToken && appToken.length > 0 ? appToken : null
  if (resolvedAppToken) {
    setAppAuthToken(resolvedAppToken)
  }

  try {
    if (isLocalAuthMode()) {
      applyLocalAuth(resolvedAppToken || token)
      authLoadingState.loginProgress = 100
      toast.success('登录成功')

      if (pendingBrowserLogin.value) {
        clearTimeout(pendingBrowserLogin.value.timeoutId)
        pendingBrowserLogin.value.resolve({
          success: true,
          user: currentUser.value
        })
        pendingBrowserLogin.value = null
      }
      return
    }

    if (!token) {
      throw new Error('Missing sign-in token')
    }

    // Use the token to authenticate with Clerk
    const { getClerk } = useClerkProvider()
    const clerk = getClerk()

    if (!clerk) {
      throw new Error('Clerk not initialized')
    }

    // Set the session token - Clerk will validate and create session
    // Note: This uses Clerk's signIn with ticket strategy
    if (!clerk.client) {
      throw new Error('Clerk client not available')
    }

    const signInAttempt = await clerk.client.signIn.create({
      strategy: 'ticket',
      ticket: token
    })

    console.log('[useAuth] Sign-in attempt status:', signInAttempt.status)

    // Activate the session after successful sign-in
    if (signInAttempt.status === 'complete' && signInAttempt.createdSessionId) {
      await clerk.setActive({ session: signInAttempt.createdSessionId })
      console.log('[useAuth] Session activated:', signInAttempt.createdSessionId)
    } else {
      console.warn('[useAuth] Sign-in not complete:', signInAttempt.status)
    }

    // Update auth state
    updateAuthState(clerk)

    authLoadingState.loginProgress = 100
    toast.success('登录成功')

    if (pendingBrowserLogin.value) {
      clearTimeout(pendingBrowserLogin.value.timeoutId)
      pendingBrowserLogin.value.resolve({
        success: true,
        user: currentUser.value
      })
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
  if (authCallbackCleanup) return

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

  // Dev mode: listen for manual token input via custom event
  if (import.meta.env.DEV) {
    const devTokenHandler = (e: CustomEvent<string>) => {
      if (e.detail) {
        console.log('[useAuth] Dev mode: received manual token')
        handleExternalAuthCallback(e.detail)
      }
    }
    window.addEventListener('dev-auth-token', devTokenHandler as EventListener)

    // Also expose a global helper for easier dev usage
    window.__devAuthToken = (token: string) => {
      console.log('[useAuth] Dev mode: __devAuthToken called')
      handleExternalAuthCallback(token)
    }
    console.log('[useAuth] Dev mode: Use window.__devAuthToken("token") to manually authenticate')
  }
}

function cleanupAuthCallbackListener(): void {
  if (authCallbackCleanup) {
    authCallbackCleanup()
    authCallbackCleanup = null
  }
}

function buildSignInUrl(): string {
  const nexusUrl = getAuthBaseUrl()
  return `${nexusUrl}/sign-in?redirect_url=/auth/app-callback`
}

async function openBrowserLoginPage(): Promise<void> {
  const signInUrl = buildSignInUrl()
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

/**
 * Authentication hook
 *
 * Note: Skip auth status check on first launch (before onboarding is complete) to avoid login prompts during onboarding
 */
export function useAuth() {
  onMounted(() => {
    activeConsumers += 1

    // Setup auth callback listener for browser login
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

    const { isClerkInitialized } = useClerkProvider()
    if (!isClerkInitialized()) {
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
    // 状态
    authState,
    isLoading,
    isAuthenticated,
    user,
    isLoggedIn,
    currentUser,

    // 加载状态
    authLoadingState,

    // 认证方法
    signIn,
    signUp,
    signOut,
    login,
    loginWithBrowser,
    logout,

    // 工具方法
    getUser: () => user.value,
    checkAuthStatus,
    initializeAuth,
    getDisplayName,
    getPrimaryEmail,
    getUserBio,
    updateUserProfile,
    updateUserAvatar,
    openLoginSettings
  }
}
