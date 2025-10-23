import { computed, watch, onMounted, onUnmounted, shallowReactive } from 'vue'
import { ElMessage } from 'element-plus'
import { createGlobalState } from '@vueuse/core'
import { Clerk } from '@clerk/clerk-js'

export interface ClerkUser {
  id: string
  emailAddresses: Array<{
    emailAddress: string
    id: string
  }>
  firstName?: string
  lastName?: string
  username?: string
  imageUrl?: string
  createdAt: string
  updatedAt: string
}

export interface ClerkAuthState {
  isLoaded: boolean
  isSignedIn: boolean
  user: ClerkUser | null
  sessionId: string | null
}

export interface LoginOptions {
  onSuccess?: (user: any) => void
  onError?: (error: any) => void
}

export interface LoginResult {
  success: boolean
  user?: any
  error?: any
}

export interface CurrentUser {
  id: string
  name: string
  email: string
  avatar?: string
  provider: string
}

/**
 * Clerk 认证配置
 */
export interface ClerkConfig {
  publishableKey: string
  domain?: string
  signInUrl?: string
  signUpUrl?: string
  afterSignInUrl?: string
  afterSignUpUrl?: string
}

/**
 * 默认 Clerk 配置
 */
export const defaultClerkConfig: ClerkConfig = {
  publishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || 'pk_test_your-publishable-key-here',
  domain: import.meta.env.VITE_CLERK_DOMAIN,
  signInUrl: '/sign-in',
  signUpUrl: '/sign-up',
  afterSignInUrl: '/home',
  afterSignUpUrl: '/home'
}

// Clerk 实例管理
let clerkInstance: Clerk | null = null

/**
 * Clerk 配置 Hook
 */
export function useClerkConfig() {
  const getClerkConfig = (): ClerkConfig => {
    return {
      ...defaultClerkConfig,
      publishableKey:
        localStorage.getItem('clerk-publishable-key') || defaultClerkConfig.publishableKey
    }
  }

  const setClerkConfig = (config: Partial<ClerkConfig>): void => {
    if (config.publishableKey) {
      localStorage.setItem('clerk-publishable-key', config.publishableKey)
    }
  }

  return {
    getClerkConfig,
    setClerkConfig
  }
}

/**
 * Clerk 提供者 Hook
 */
export function useClerkProvider() {
  const initializeClerk = async (): Promise<Clerk> => {
    if (clerkInstance) {
      return clerkInstance
    }

    const { getClerkConfig } = useClerkConfig()
    const config = getClerkConfig()

    if (!config.publishableKey) {
      throw new Error('Clerk publishable key is required')
    }

    try {
      clerkInstance = new Clerk(config.publishableKey)
      await clerkInstance.load()

      console.log('Clerk initialized successfully')
      return clerkInstance
    } catch (error) {
      console.error('Failed to initialize Clerk:', error)
      throw error
    }
  }

  const getClerk = (): Clerk | null => {
    return clerkInstance
  }

  const isClerkInitialized = (): boolean => {
    return clerkInstance !== null
  }

  const cleanupClerk = (): void => {
    if (clerkInstance) {
      clerkInstance = null
    }
  }

  return {
    initializeClerk,
    getClerk,
    isClerkInitialized,
    cleanupClerk
  }
}

// 使用 createGlobalState 创建全局认证状态，参考 useAppState 模式
export const useAuthState = createGlobalState(() => {
  const authState = shallowReactive<ClerkAuthState>({
    isLoaded: false,
    isSignedIn: false,
    user: null,
    sessionId: null
  })

  return { authState }
})

let eventListenerCleanup: (() => void) | null = null
let isInitialized = false
let activeConsumers = 0

// 获取全局认证状态
const { authState } = useAuthState()

const isLoading = computed(() => !authState.isLoaded)
const isAuthenticated = computed(() => authState.isSignedIn)
const user = computed(() => authState.user)
const isLoggedIn = computed(() => authState.isSignedIn)

const currentUser = computed((): CurrentUser | null => {
  if (!authState.isSignedIn || !authState.user) {
    return null
  }

  const { firstName, lastName, username, imageUrl } = authState.user
  let name = ''
  if (firstName || lastName) {
    name = [firstName, lastName].filter(Boolean).join(' ')
  } else {
    name = username || ''
  }

  const email = authState.user.emailAddresses?.[0]?.emailAddress || ''

  return {
    id: authState.user.id,
    name,
    email,
    avatar: imageUrl,
    provider: 'clerk'
  }
})

type ClerkResourceSnapshot = {
  user?: any | null
  session?: { id?: string | null } | null
}

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
  }
}

async function signIn() {
  const { getClerk } = useClerkProvider()
  const clerk = getClerk()
  if (!clerk) {
    throw new Error('Clerk not initialized')
  }

  try {
    await clerk.openSignIn()
  } catch (error) {
    console.error('Sign in failed:', error)
    throw error
  }
}

async function signUp() {
  const { getClerk } = useClerkProvider()
  const clerk = getClerk()
  if (!clerk) {
    throw new Error('Clerk not initialized')
  }

  try {
    await clerk.openSignUp()
  } catch (error) {
    console.error('Sign up failed:', error)
    throw error
  }
}

async function signOut() {
  const { getClerk } = useClerkProvider()
  const clerk = getClerk()
  if (!clerk) {
    throw new Error('Clerk not initialized')
  }

  try {
    await clerk.signOut()

    authState.isLoaded = true
    authState.isSignedIn = false
    authState.user = null
    authState.sessionId = null
  } catch (error) {
    console.error('Sign out failed:', error)
    throw error
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
  try {
    await signIn()

    return new Promise((resolve) => {
      let timeoutId: NodeJS.Timeout | null = null
      let isResolved = false

      const stopWatcher = watch(isAuthenticated, (authenticated) => {
        if (authenticated && !isResolved) {
          isResolved = true
          stopWatcher()
          if (timeoutId) {
            clearTimeout(timeoutId)
          }

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
          const error = new Error('Login timeout')
          resolve({
            success: false,
            error
          })
        }
      }, 10000)
    })
  } catch (error) {
    return {
      success: false,
      error
    }
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
    ElMessage.error('登出失败')
  }
}

export function useAuth() {
  onMounted(() => {
    activeConsumers += 1

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
