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
 * 注意：在生产环境中，这些配置应该从环境变量中读取
 */
export const defaultClerkConfig: ClerkConfig = {
  // 这里需要替换为您的 Clerk publishable key
  publishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || 'pk_test_your-publishable-key-here',
  domain: import.meta.env.VITE_CLERK_DOMAIN,
  signInUrl: '/sign-in',
  signUpUrl: '/sign-up',
  afterSignInUrl: '/home',
  afterSignUpUrl: '/home'
}

/**
 * 获取 Clerk 配置
 */
export function getClerkConfig(): ClerkConfig {
  return {
    ...defaultClerkConfig,
    // 可以从本地存储或服务器获取配置
    publishableKey: localStorage.getItem('clerk-publishable-key') || defaultClerkConfig.publishableKey
  }
}

/**
 * 设置 Clerk 配置
 */
export function setClerkConfig(config: Partial<ClerkConfig>): void {
  if (config.publishableKey) {
    localStorage.setItem('clerk-publishable-key', config.publishableKey)
  }
}


