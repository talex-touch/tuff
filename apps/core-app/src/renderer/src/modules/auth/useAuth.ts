import type {
  ClerkResourceSnapshot,
  ClerkUser,
  LoginOptions,
  LoginResult,
} from '@talex-touch/utils/renderer'
import {
  useAuthState,
  useClerkProvider,
  useCurrentUser,
} from '@talex-touch/utils/renderer'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { appSetting } from '../channel/storage/index'
import { touchChannel } from '../channel/channel-core'

let eventListenerCleanup: (() => void) | null = null
let authCallbackCleanup: (() => void) | null = null
let isInitialized = false
let activeConsumers = 0

// Nexus URL for browser auth
const NEXUS_URL_PRODUCTION = 'https://tuff.quotawish.com'
const NEXUS_URL_LOCAL = 'http://localhost:3200'

function getNexusUrl(): string {
  // In dev mode, check appSetting for auth server preference
  if (import.meta.env.DEV && appSetting?.dev?.authServer === 'local') {
    return NEXUS_URL_LOCAL
  }
  return import.meta.env.VITE_NEXUS_URL || NEXUS_URL_PRODUCTION
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
  loginTimeRemaining: 0, // 剩余时间（秒）
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
  UNKNOWN_ERROR: '发生未知错误，请重试',
}

// 获取用户友好的错误消息
function getErrorMessage(error: unknown, defaultType: string): string {
  if (!error)
    return ERROR_MESSAGES[defaultType as keyof typeof ERROR_MESSAGES]

  const errorMessage = (error as Error).message || String(error)

  // 网络相关错误
  if (
    errorMessage.includes('network')
    || errorMessage.includes('fetch')
    || errorMessage.includes('timeout')
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

  const isUserValid
    = !!candidateUser
      && typeof candidateUser === 'object'
      && 'id' in candidateUser
      && !!candidateUser.id
  const isSessionValid
    = !!candidateSession
      && typeof candidateSession === 'object'
      && 'id' in candidateSession
      && !!candidateSession.id

  console.log('updateAuthState resolved state:', {
    user: candidateUser,
    session: candidateSession,
    isUserValid,
    isSessionValid,
  })

  const resolvedSessionId = isSessionValid ? (candidateSession as { id: string }).id : null

  authState.isLoaded = true
  authState.isSignedIn = isUserValid && isSessionValid
  authState.user = isUserValid ? (candidateUser as ClerkUser) : null
  authState.sessionId = resolvedSessionId

  // Notify Sentry about user context change (async, don't block)
  void (async () => {
    try {
      const { touchChannel } = await import('~/modules/channel/channel-core')
      // Notify main process Sentry - only send serializable data
      const safeUser = authState.user
        ? {
            id: authState.user.id,
            username: authState.user.username ?? null,
            emailAddresses: authState.user.emailAddresses?.map(e => ({
              emailAddress: e.emailAddress,
            })),
          }
        : null
      await touchChannel.send('sentry:update-user', { user: safeUser })
      // Notify renderer process Sentry
      try {
        const { updateSentryUserContext } = await import('~/modules/sentry/sentry-renderer')
        updateSentryUserContext(authState.user)
      }
      catch {
        // Renderer Sentry not initialized yet
      }
    }
    catch (error) {
      // Silently fail if Sentry is not available
      console.debug('[useAuth] Failed to update Sentry user context', error)
    }
  })()
}

function getDisplayName(): string {
  if (!authState.user)
    return ''

  const { firstName, lastName, username } = authState.user
  if (firstName || lastName) {
    return [firstName, lastName].filter(Boolean).join(' ')
  }
  return username || ''
}

function getPrimaryEmail(): string {
  if (!authState.user?.emailAddresses?.length)
    return ''
  return authState.user.emailAddresses[0].emailAddress
}

async function initializeAuth() {
  if (isInitialized)
    return

  try {
    const { initializeClerk } = useClerkProvider()
    const clerk = await initializeClerk()

    if (eventListenerCleanup) {
      eventListenerCleanup()
      eventListenerCleanup = null
    }

    eventListenerCleanup = clerk.addListener((resources: ClerkResourceSnapshot) => {
      console.log('Clerk auth resources emitted:', resources)
      console.log('Clerk object structure:', {
        hasUser: 'user' in clerk,
        hasSession: 'session' in clerk,
        userType: typeof clerk.user,
        sessionType: typeof clerk.session,
        clerkKeys: Object.keys(clerk),
      })

      updateAuthState(resources)
    })

    updateAuthState(clerk)
    isInitialized = true
  }
  catch (error) {
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
  }
  catch (error) {
    console.error('Sign in failed:', error)
    const errorMessage = getErrorMessage(error, 'SIGN_IN_FAILED')
    toast.error(errorMessage)
    throw error
  }
  finally {
    authLoadingState.isSigningIn = false
  }
}

async function signUp() {
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
  }
  catch (error) {
    console.error('Sign up failed:', error)
    const errorMessage = getErrorMessage(error, 'SIGN_UP_FAILED')
    toast.error(errorMessage)
    throw error
  }
  finally {
    authLoadingState.isSigningUp = false
  }
}

async function signOut() {
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
  }
  catch (error) {
    console.error('Sign out failed:', error)
    const errorMessage = getErrorMessage(error, 'SIGN_OUT_FAILED')
    toast.error(errorMessage)
    throw error
  }
  finally {
    authLoadingState.isSigningOut = false
  }
}

function checkAuthStatus() {
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
        if (isResolved)
          return

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
            user,
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
            error,
          })
        }
      }, 10000)
    })
  }
  catch (error) {
    authLoadingState.loginProgress = 0
    authLoadingState.loginTimeRemaining = 0
    return {
      success: false,
      error,
    }
  }
  finally {
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
      user,
    }
  }

  const result = await loginWithClerk()

  if (result.success) {
    onSuccess?.(result.user)
  }
  else {
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
  }
  catch (error) {
    console.error('Logout failed:', error)
    const errorMessage = getErrorMessage(error, 'SIGN_OUT_FAILED')
    toast.error(errorMessage)
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
    const timeoutMs = 5 * 60 * 1000 // 5 minutes timeout

    const timeoutId = setTimeout(() => {
      if (pendingBrowserLogin.value) {
        pendingBrowserLogin.value = null
        authLoadingState.isLoggingIn = false
        authLoadingState.loginProgress = 0
        const error = new Error('Browser login timeout')
        toast.error(getErrorMessage(error, 'LOGIN_TIMEOUT'))
        resolve({ success: false, error })
      }
    }, timeoutMs)

    pendingBrowserLogin.value = { resolve, reject: () => {}, timeoutId }

    // Open browser to Nexus sign-in with app callback redirect
    const nexusUrl = getNexusUrl()
    const signInUrl = `${nexusUrl}/sign-in?redirect_url=/auth/app-callback`
    touchChannel.send('open-external', { url: signInUrl }).catch((err) => {
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
async function handleExternalAuthCallback(token: string): Promise<void> {
  console.log('[useAuth] Handling external auth callback, token length:', token.length)

  if (!pendingBrowserLogin.value) {
    console.warn('[useAuth] Received auth callback but no pending login')
    // Still try to use the token
  }

  try {
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
      ticket: token,
    })

    console.log('[useAuth] Sign-in attempt status:', signInAttempt.status)

    // Activate the session after successful sign-in
    if (signInAttempt.status === 'complete' && signInAttempt.createdSessionId) {
      await clerk.setActive({ session: signInAttempt.createdSessionId })
      console.log('[useAuth] Session activated:', signInAttempt.createdSessionId)
    }
    else {
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
        user: currentUser.value,
      })
      pendingBrowserLogin.value = null
    }
  }
  catch (error) {
    console.error('[useAuth] External auth callback failed:', error)
    const errorMessage = getErrorMessage(error, 'AUTH_ERROR')
    toast.error(errorMessage)

    if (pendingBrowserLogin.value) {
      clearTimeout(pendingBrowserLogin.value.timeoutId)
      pendingBrowserLogin.value.resolve({ success: false, error })
      pendingBrowserLogin.value = null
    }
  }
  finally {
    authLoadingState.isLoggingIn = false
  }
}

function setupAuthCallbackListener(): void {
  if (authCallbackCleanup) return

  authCallbackCleanup = touchChannel.regChannel('auth:external-callback', ({ data }) => {
    if (data?.token) {
      handleExternalAuthCallback(data.token)
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
    ;(window as any).__devAuthToken = (token: string) => {
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
  }
}
