import { ClerkConfig } from "./clerk-types"

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const clerkDomain = import.meta.env.VITE_CLERK_DOMAIN

if (!clerkPublishableKey?.length) {
  throw new Error('VITE_CLERK_PUBLISHABLE_KEY is not set')
}

export const CLERK_PUBLISHABLE_KEY_KEY = 'clerk-publishable-key'

export const defaultClerkConfig: ClerkConfig = {
  publishableKey: clerkPublishableKey,
  domain: clerkDomain,
  signInUrl: '/sign-in',
  signUpUrl: '/sign-up',
  afterSignInUrl: '/home',
  afterSignUpUrl: '/home'
}

export function useClerkConfig() {
  const getClerkConfig = (): ClerkConfig => {
    return {
      ...defaultClerkConfig,
      publishableKey:
        localStorage.getItem(CLERK_PUBLISHABLE_KEY_KEY) || defaultClerkConfig.publishableKey
    }
  }

  const setClerkConfig = (config: Partial<ClerkConfig>): void => {
    if (config.publishableKey) {
      localStorage.setItem(CLERK_PUBLISHABLE_KEY_KEY, config.publishableKey)
    }
  }

  return {
    getClerkConfig,
    setClerkConfig
  }
}
