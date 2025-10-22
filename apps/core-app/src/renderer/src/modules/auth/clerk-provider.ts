/**
 * Clerk 认证提供者
 */
import { Clerk } from '@clerk/clerk-js'
import { getClerkConfig } from './clerk-config'

let clerkInstance: Clerk | null = null

/**
 * 初始化 Clerk 实例
 */
export async function initializeClerk(): Promise<Clerk> {
  if (clerkInstance) {
    return clerkInstance
  }

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

/**
 * 获取 Clerk 实例
 */
export function getClerk(): Clerk | null {
  return clerkInstance
}

/**
 * 检查 Clerk 是否已初始化
 */
export function isClerkInitialized(): boolean {
  return clerkInstance !== null
}

/**
 * 清理 Clerk 实例
 */
export function cleanupClerk(): void {
  if (clerkInstance) {
    clerkInstance = null
  }
}
