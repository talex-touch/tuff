import { Clerk } from '@clerk/clerk-js'
import { useClerkConfig } from './useClerkConfig'

let clerkInstance: Clerk | null = null

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
    }
    catch (error) {
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

  const getToken = async (): Promise<string | null> => {
    if (!clerkInstance?.session) {
      return null
    }
    try {
      return await clerkInstance.session.getToken()
    }
    catch (error) {
      console.error('Failed to get Clerk token:', error)
      return null
    }
  }

  return {
    initializeClerk,
    getClerk,
    isClerkInitialized,
    cleanupClerk,
    getToken,
  }
}
