/**
 * Clerk 账户存储管理
 */
import { touchChannel } from '~/modules/channel/channel-core'
import type { User } from '@clerk/types'

export interface ClerkUserData {
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

export interface ClerkAccountData {
  user: ClerkUserData | null
  sessionId: string | null
  isSignedIn: boolean
  provider: 'clerk'
}

export class ClerkAccountStorage {
  private data: ClerkAccountData = {
    user: null,
    sessionId: null,
    isSignedIn: false,
    provider: 'clerk'
  }

  constructor() {
    this.loadFromStorage()
  }

  /**
   * 从 Clerk User 对象更新账户数据
   */
  updateFromClerkUser(user: User | null, sessionId: string | null = null): void {
    if (user) {
      this.data = {
        user: {
          id: user.id,
          emailAddresses: user.emailAddresses.map(email => ({
            emailAddress: email.emailAddress,
            id: email.id
          })),
          firstName: user.firstName || undefined,
          lastName: user.lastName || undefined,
          username: user.username || undefined,
          imageUrl: user.imageUrl || undefined,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString()
        },
        sessionId,
        isSignedIn: true,
        provider: 'clerk'
      }
    } else {
      this.data = {
        user: null,
        sessionId: null,
        isSignedIn: false,
        provider: 'clerk'
      }
    }

    this.saveToStorage()
  }

  /**
   * 获取用户数据
   */
  getUser(): ClerkUserData | null {
    return this.data.user
  }

  /**
   * 获取主要邮箱地址
   */
  getPrimaryEmail(): string | null {
    return this.data.user?.emailAddresses?.[0]?.emailAddress || null
  }

  /**
   * 获取用户显示名称
   */
  getDisplayName(): string {
    if (!this.data.user) return ''

    const { firstName, lastName, username } = this.data.user

    if (firstName && lastName) {
      return `${firstName} ${lastName}`
    }

    if (firstName) return firstName
    if (username) return username

    return this.getPrimaryEmail() || 'Unknown User'
  }

  /**
   * 检查是否已登录
   */
  isSignedIn(): boolean {
    return this.data.isSignedIn
  }

  /**
   * 获取会话 ID
   */
  getSessionId(): string | null {
    return this.data.sessionId
  }

  /**
   * 清除账户数据
   */
  clear(): void {
    this.data = {
      user: null,
      sessionId: null,
      isSignedIn: false,
      provider: 'clerk'
    }
    this.saveToStorage()
  }

  /**
   * 从存储加载数据
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('clerk-account-data')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.provider === 'clerk') {
          this.data = parsed
        }
      }
    } catch (error) {
      console.error('Failed to load Clerk account data:', error)
    }
  }

  /**
   * 保存数据到存储
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem('clerk-account-data', JSON.stringify(this.data))

      // 同时保存到主进程存储
      touchChannel.send('storage:save', {
        key: 'clerk-account.ini',
        content: JSON.stringify(this.data),
        clear: false
      })
    } catch (error) {
      console.error('Failed to save Clerk account data:', error)
    }
  }

  /**
   * 获取完整的账户数据
   */
  getAccountData(): ClerkAccountData {
    return { ...this.data }
  }
}

// 创建全局实例
export const clerkAccountStorage = new ClerkAccountStorage()
