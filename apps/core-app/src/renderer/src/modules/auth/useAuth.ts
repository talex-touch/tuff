import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { initializeClerk, getClerk, isClerkInitialized } from './clerk-provider'
import { clerkAccountStorage } from './clerk-account-storage'

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

// 全局状态
const authState = ref<ClerkAuthState>({
  isLoaded: false,
  isSignedIn: false,
  user: null,
  sessionId: null
})

let eventListenerCleanup: (() => void) | null = null
let isInitialized = false

// 计算属性
const isLoading = computed(() => !authState.value.isLoaded)
const isAuthenticated = computed(() => authState.value.isSignedIn)
const user = computed(() => authState.value.user)
const isLoggedIn = computed(() => authState.value.isSignedIn || clerkAccountStorage.isSignedIn())

const currentUser = computed((): CurrentUser | null => {
  if (authState.value.isSignedIn && authState.value.user) {
    const { firstName, lastName, username, imageUrl } = authState.value.user
    let name = ''
    if (firstName || lastName) {
      name = [firstName, lastName].filter(Boolean).join(' ')
    } else {
      name = username || ''
    }

    const email = authState.value.user.emailAddresses?.[0]?.emailAddress || ''

    return {
      id: authState.value.user.id,
      name,
      email,
      avatar: imageUrl,
      provider: 'clerk'
    }
  }
  return null
})

function updateAuthState(clerk: any) {
  authState.value = {
    isLoaded: true,
    isSignedIn: clerk.user !== null,
    user: clerk.user,
    sessionId: clerk.session?.id || null
  }

  clerkAccountStorage.updateFromClerkUser(clerk.user, clerk.session?.id || null)
}

function getDisplayName(): string {
  if (!authState.value.user) return ''

  const { firstName, lastName, username } = authState.value.user
  if (firstName || lastName) {
    return [firstName, lastName].filter(Boolean).join(' ')
  }
  return username || ''
}

function getPrimaryEmail(): string {
  if (!authState.value.user?.emailAddresses?.length) return ''
  return authState.value.user.emailAddresses[0].emailAddress
}

async function initializeAuth() {
  if (isInitialized) return

  try {
    const clerk = await initializeClerk()

    if (eventListenerCleanup) {
      eventListenerCleanup()
      eventListenerCleanup = null
    }

    eventListenerCleanup = clerk.addListener((event: any) => {
      console.log('Clerk auth event:', event)

      if (event.type === 'session:created' || event.type === 'session:updated') {
        updateAuthState(clerk)
      } else if (event.type === 'session:removed') {
        authState.value = {
          isLoaded: true,
          isSignedIn: false,
          user: null,
          sessionId: null
        }
      }
    })

    updateAuthState(clerk)
    isInitialized = true

  } catch (error) {
    console.error('Failed to initialize Clerk auth:', error)
    authState.value = {
      isLoaded: true,
      isSignedIn: false,
      user: null,
      sessionId: null
    }
  }
}

async function signIn() {
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
  const clerk = getClerk()
  if (!clerk) {
    throw new Error('Clerk not initialized')
  }

  try {
    await clerk.signOut()
    clerkAccountStorage.clear()
  } catch (error) {
    console.error('Sign out failed:', error)
    throw error
  }
}

function checkAuthStatus() {
  const clerk = getClerk()
  if (clerk) {
    updateAuthState(clerk)
  }
}

function cleanup() {
  if (eventListenerCleanup) {
    eventListenerCleanup()
    eventListenerCleanup = null
  }
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

export function useAuth(options: LoginOptions = {}) {
  onMounted(() => {
    if (!isClerkInitialized()) {
      initializeAuth()
    } else {
      checkAuthStatus()
    }
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
    getPrimaryEmail,
    getAccountStorage: () => clerkAccountStorage
  }
}
