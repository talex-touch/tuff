export interface AuthUser {
  id: string
  email: string
  name?: string | null
  avatar?: string | null
  role?: string | null
  locale?: string | null
  emailVerified?: boolean
  bio?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface AuthState {
  isLoaded: boolean
  isSignedIn: boolean
  user: AuthUser | null
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
