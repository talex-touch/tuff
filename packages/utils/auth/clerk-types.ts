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
 * Clerk Auth Config
 */
export interface ClerkConfig {
  publishableKey: string
  domain?: string
  signInUrl?: string
  signUpUrl?: string
  afterSignInUrl?: string
  afterSignUpUrl?: string
}

export interface ClerkResourceSnapshot {
  user?: any | null
  session?: { id?: string | null } | null
}
