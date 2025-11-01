import { computed, watch, onMounted, onUnmounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import {
  ClerkUser,
  ClerkResourceSnapshot,
  useClerkProvider,
  useAuthState,
  useCurrentUser,
  LoginResult,
  LoginOptions
} from '@talex-touch/utils/renderer'
import { appSetting } from '../channel/storage/index'

let eventListenerCleanup: (() => void) | null = null
let isInitialized = false
let activeConsumers = 0

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

  console.log('updateAuthState resolved state:', {
    user: candidateUser,
    session: candidateSession,
    isUserValid,
    isSessionValid
  })

  const resolvedSessionId = isSessionValid ? (candidateSession as { id: string }).id : null

  authState.isLoaded = true
  authState.isSignedIn = isUserValid && isSessionValid
  authState.user = isUserValid ? (candidateUser as ClerkUser) : null
  authState.sessionId = resolvedSessionId
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

async function initializeAuth() {
  if (isInitialized) return

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
        clerkKeys: Object.keys(clerk)
      })

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
    ElMessage.error(errorMessage)
  }
}

async function signIn() {
  const { getClerk } = useClerkProvider()
  const clerk = getClerk()
  if (!clerk) {
    const error = new Error('Clerk not initialized')
    const errorMessage = getErrorMessage(error, 'CLERK_NOT_INITIALIZED')
    ElMessage.error(errorMessage)
    throw error
  }

  authLoadingState.isSigningIn = true
  try {
    await clerk.openSignIn()
  } catch (error) {
    console.error('Sign in failed:', error)
    const errorMessage = getErrorMessage(error, 'SIGN_IN_FAILED')
    ElMessage.error(errorMessage)
    throw error
  } finally {
    authLoadingState.isSigningIn = false
  }
}

async function signUp() {
  const { getClerk } = useClerkProvider()
  const clerk = getClerk()
  if (!clerk) {
    const error = new Error('Clerk not initialized')
    const errorMessage = getErrorMessage(error, 'CLERK_NOT_INITIALIZED')
    ElMessage.error(errorMessage)
    throw error
  }

  authLoadingState.isSigningUp = true
  try {
    await clerk.openSignUp()
  } catch (error) {
    console.error('Sign up failed:', error)
    const errorMessage = getErrorMessage(error, 'SIGN_UP_FAILED')
    ElMessage.error(errorMessage)
    throw error
  } finally {
    authLoadingState.isSigningUp = false
  }
}

async function signOut() {
  const { getClerk } = useClerkProvider()
  const clerk = getClerk()
  if (!clerk) {
    const error = new Error('Clerk not initialized')
    const errorMessage = getErrorMessage(error, 'CLERK_NOT_INITIALIZED')
    ElMessage.error(errorMessage)
    throw error
  }

  authLoadingState.isSigningOut = true
  try {
    await clerk.signOut()

    authState.isLoaded = true
    authState.isSignedIn = false
    authState.user = null
    authState.sessionId = null
  } catch (error) {
    console.error('Sign out failed:', error)
    const errorMessage = getErrorMessage(error, 'SIGN_OUT_FAILED')
    ElMessage.error(errorMessage)
    throw error
  } finally {
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
          ElMessage.error(errorMessage)
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

  const result = await loginWithClerk()

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

    ElMessage.success('已登出')
  } catch (error) {
    console.error('Logout failed:', error)
    const errorMessage = getErrorMessage(error, 'SIGN_OUT_FAILED')
    ElMessage.error(errorMessage)
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
    logout,

    // 工具方法
    getUser: () => user.value,
    checkAuthStatus,
    initializeAuth,
    getDisplayName,
    getPrimaryEmail
  }
}
