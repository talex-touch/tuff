import type {
  AccountInfo,
  AccountSDKConfig,
  DeviceSession,
  FeatureFlag,
  PlanComparisonItem,
  PlanQuota,
  QuotaCheckResult,
  SocialConnection,
  Subscription,
  Team,
  UpgradeOption,
  UsageStats,
  UserProfile,
} from './types'
import {
  BillingCycle,
  SubscriptionPlan,
  SubscriptionStatus,
  TeamRole,
  VerificationStatus,
} from './types'

/**
 * Default plan quotas
 */
export const DEFAULT_PLAN_QUOTAS: Record<SubscriptionPlan, PlanQuota> = {
  [SubscriptionPlan.FREE]: {
    aiRequestsPerDay: 50,
    aiTokensPerMonth: 100000,
    maxPlugins: 5,
    maxStorageBytes: 100 * 1024 * 1024, // 100MB
    maxWorkspaces: 1,
    customModelAccess: false,
    prioritySupport: false,
    apiAccess: false,
    advancedAnalytics: false,
  },
  [SubscriptionPlan.PRO]: {
    aiRequestsPerDay: 500,
    aiTokensPerMonth: 1000000,
    maxPlugins: 20,
    maxStorageBytes: 1024 * 1024 * 1024, // 1GB
    maxWorkspaces: 5,
    customModelAccess: true,
    prioritySupport: false,
    apiAccess: true,
    advancedAnalytics: false,
  },
  [SubscriptionPlan.PLUS]: {
    aiRequestsPerDay: 2000,
    aiTokensPerMonth: 5000000,
    maxPlugins: 50,
    maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5GB
    maxWorkspaces: 20,
    customModelAccess: true,
    prioritySupport: true,
    apiAccess: true,
    advancedAnalytics: true,
  },
  [SubscriptionPlan.TEAM]: {
    aiRequestsPerDay: 10000,
    aiTokensPerMonth: 20000000,
    maxPlugins: 100,
    maxStorageBytes: 20 * 1024 * 1024 * 1024, // 20GB
    maxTeamMembers: 10,
    maxWorkspaces: 50,
    customModelAccess: true,
    prioritySupport: true,
    apiAccess: true,
    advancedAnalytics: true,
  },
  [SubscriptionPlan.ENTERPRISE]: {
    aiRequestsPerDay: -1, // Unlimited
    aiTokensPerMonth: -1, // Unlimited
    maxPlugins: -1, // Unlimited
    maxStorageBytes: -1, // Unlimited
    maxTeamMembers: -1, // Unlimited
    maxWorkspaces: -1, // Unlimited
    customModelAccess: true,
    prioritySupport: true,
    apiAccess: true,
    advancedAnalytics: true,
  },
}

/**
 * Upgrade options with pricing
 */
export const UPGRADE_OPTIONS: UpgradeOption[] = [
  {
    plan: SubscriptionPlan.PRO,
    name: 'Pro',
    description: 'For power users who need more AI capabilities',
    priceMonthly: 9.99,
    priceYearly: 99.99,
    currency: 'USD',
    features: [
      '500 AI requests/day',
      '1M tokens/month',
      '20 plugins',
      '1GB storage',
      'Custom model access',
      'API access',
    ],
  },
  {
    plan: SubscriptionPlan.PLUS,
    name: 'Plus',
    description: 'For professionals who demand the best',
    priceMonthly: 19.99,
    priceYearly: 199.99,
    currency: 'USD',
    features: [
      '2000 AI requests/day',
      '5M tokens/month',
      '50 plugins',
      '5GB storage',
      'Priority support',
      'Advanced analytics',
    ],
    recommended: true,
  },
  {
    plan: SubscriptionPlan.TEAM,
    name: 'Team',
    description: 'For teams that collaborate',
    priceMonthly: 49.99,
    priceYearly: 499.99,
    currency: 'USD',
    features: [
      '10000 AI requests/day',
      '20M tokens/month',
      'Unlimited plugins',
      '20GB storage',
      'Up to 10 team members',
      'Team management',
    ],
  },
]

/**
 * Account SDK for plugins and Prelude scripts
 */
export class AccountSDK {
  private config: AccountSDKConfig
  private cache: Map<string, { data: any, timestamp: number }> = new Map()
  private channelSend: ((event: string, data?: any) => Promise<any>) | null = null

  constructor(config: AccountSDKConfig = {}) {
    this.config = {
      cacheTTL: 60000, // 1 minute default
      offlineMode: false,
      ...config,
    }
  }

  /**
   * Set the channel send function for IPC communication
   */
  setChannelSend(send: (event: string, data?: any) => Promise<any>): void {
    this.channelSend = send
  }

  private async send<T>(event: string, data?: any): Promise<T> {
    if (!this.channelSend) {
      throw new Error('[AccountSDK] Channel not initialized. Call setChannelSend first.')
    }
    return this.channelSend(event, data)
  }

  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key)
    if (!cached)
      return null

    const ttl = this.config.cacheTTL || 60000
    if (Date.now() - cached.timestamp > ttl) {
      this.cache.delete(key)
      return null
    }

    return cached.data as T
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() })
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear()
  }

  // ============================================================================
  // Auth Token & Device
  // ============================================================================

  /**
   * Get auth token for API requests
   */
  async getAuthToken(): Promise<string | null> {
    const cached = this.getCached<string>('authToken')
    if (cached)
      return cached

    try {
      const token = await this.send<string | null>('account:get-auth-token')
      if (token) {
        this.setCache('authToken', token)
      }
      return token
    }
    catch {
      return null
    }
  }

  /**
   * Get current device id
   */
  async getDeviceId(): Promise<string | null> {
    const cached = this.getCached<string>('deviceId')
    if (cached)
      return cached

    try {
      const deviceId = await this.send<string | null>('account:get-device-id')
      if (deviceId) {
        this.setCache('deviceId', deviceId)
      }
      return deviceId
    }
    catch {
      return null
    }
  }

  /**
   * Get user sync preference switch from host app.
   * Defaults to true for backward compatibility when channel is not implemented.
   */
  async getSyncEnabled(): Promise<boolean> {
    try {
      const enabled = await this.send<boolean | null>('account:get-sync-enabled')
      return typeof enabled === 'boolean' ? enabled : true
    }
    catch {
      return true
    }
  }

  /**
   * Report sync activity to host app for status display.
   */
  async recordSyncActivity(kind: 'push' | 'pull'): Promise<void> {
    try {
      await this.send('account:record-sync-activity', { kind })
    }
    catch {
      // ignore, best-effort telemetry
    }
  }

  // ============================================================================
  // User Profile
  // ============================================================================

  /**
   * Get current user profile
   */
  async getProfile(): Promise<UserProfile | null> {
    const cached = this.getCached<UserProfile>('profile')
    if (cached)
      return cached

    try {
      const profile = await this.send<UserProfile | null>('account:get-profile')
      if (profile) {
        this.setCache('profile', profile)
      }
      return profile
    }
    catch {
      return null
    }
  }

  /**
   * Check if user is logged in
   */
  async isLoggedIn(): Promise<boolean> {
    const profile = await this.getProfile()
    return profile !== null
  }

  /**
   * Get user ID
   */
  async getUserId(): Promise<string | null> {
    const profile = await this.getProfile()
    return profile?.id ?? null
  }

  /**
   * Get display name
   */
  async getDisplayName(): Promise<string> {
    const profile = await this.getProfile()
    if (!profile)
      return ''
    const email = profile.email ?? ''
    const emailName = email ? email.split('@')[0] : ''
    return profile.displayName ?? profile.username ?? emailName
  }

  /**
   * Get user email
   */
  async getEmail(): Promise<string | null> {
    const profile = await this.getProfile()
    return profile?.email ?? null
  }

  /**
   * Get avatar URL
   */
  async getAvatarUrl(): Promise<string | null> {
    const profile = await this.getProfile()
    return profile?.avatarUrl ?? null
  }

  // ============================================================================
  // Subscription & Plan
  // ============================================================================

  /**
   * Get current subscription
   */
  async getSubscription(): Promise<Subscription | null> {
    const cached = this.getCached<Subscription>('subscription')
    if (cached)
      return cached

    try {
      const subscription = await this.send<Subscription | null>('account:get-subscription')
      if (subscription) {
        this.setCache('subscription', subscription)
      }
      return subscription
    }
    catch {
      return null
    }
  }

  /**
   * Get current plan
   */
  async getPlan(): Promise<SubscriptionPlan> {
    const subscription = await this.getSubscription()
    return subscription?.plan ?? SubscriptionPlan.FREE
  }

  /**
   * Check if user has a paid plan
   */
  async isPaidUser(): Promise<boolean> {
    const plan = await this.getPlan()
    return plan !== SubscriptionPlan.FREE
  }

  /**
   * Check if user is Pro or above
   */
  async isProOrAbove(): Promise<boolean> {
    const plan = await this.getPlan()
    return [
      SubscriptionPlan.PRO,
      SubscriptionPlan.PLUS,
      SubscriptionPlan.TEAM,
      SubscriptionPlan.ENTERPRISE,
    ].includes(plan)
  }

  /**
   * Check if user is Plus or above
   */
  async isPlusOrAbove(): Promise<boolean> {
    const plan = await this.getPlan()
    return [
      SubscriptionPlan.PLUS,
      SubscriptionPlan.TEAM,
      SubscriptionPlan.ENTERPRISE,
    ].includes(plan)
  }

  /**
   * Check if user is Team or above
   */
  async isTeamOrAbove(): Promise<boolean> {
    const plan = await this.getPlan()
    return [
      SubscriptionPlan.TEAM,
      SubscriptionPlan.ENTERPRISE,
    ].includes(plan)
  }

  /**
   * Check if user is Enterprise
   */
  async isEnterprise(): Promise<boolean> {
    const plan = await this.getPlan()
    return plan === SubscriptionPlan.ENTERPRISE
  }

  /**
   * Check if subscription is active
   */
  async isSubscriptionActive(): Promise<boolean> {
    const subscription = await this.getSubscription()
    if (!subscription)
      return false
    return [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.TRIALING,
    ].includes(subscription.status)
  }

  /**
   * Check if user is in trial period
   */
  async isTrialing(): Promise<boolean> {
    const subscription = await this.getSubscription()
    return subscription?.status === SubscriptionStatus.TRIALING
  }

  /**
   * Get days remaining in current period
   */
  async getDaysRemaining(): Promise<number> {
    const subscription = await this.getSubscription()
    if (!subscription)
      return 0

    const now = Date.now()
    const end = subscription.currentPeriodEnd
    const days = Math.ceil((end - now) / (1000 * 60 * 60 * 24))
    return Math.max(0, days)
  }

  /**
   * Get trial days remaining
   */
  async getTrialDaysRemaining(): Promise<number> {
    const subscription = await this.getSubscription()
    if (!subscription?.trialEndAt)
      return 0

    const now = Date.now()
    const days = Math.ceil((subscription.trialEndAt - now) / (1000 * 60 * 60 * 24))
    return Math.max(0, days)
  }

  // ============================================================================
  // Quota & Usage
  // ============================================================================

  /**
   * Get plan quota limits
   */
  async getQuota(): Promise<PlanQuota> {
    const subscription = await this.getSubscription()
    return subscription?.quota ?? DEFAULT_PLAN_QUOTAS[SubscriptionPlan.FREE]
  }

  /**
   * Get current usage stats
   */
  async getUsage(): Promise<UsageStats> {
    const cached = this.getCached<UsageStats>('usage')
    if (cached)
      return cached

    try {
      const usage = await this.send<UsageStats>('account:get-usage')
      this.setCache('usage', usage)
      return usage
    }
    catch {
      return {
        aiRequestsToday: 0,
        aiRequestsThisMonth: 0,
        aiTokensThisMonth: 0,
        storageUsedBytes: 0,
        pluginsInstalled: 0,
      }
    }
  }

  /**
   * Check if AI requests quota is available
   */
  async checkAiRequestQuota(): Promise<QuotaCheckResult> {
    const [quota, usage] = await Promise.all([this.getQuota(), this.getUsage()])

    if (quota.aiRequestsPerDay === -1) {
      return { allowed: true, remaining: -1 }
    }

    const remaining = quota.aiRequestsPerDay - usage.aiRequestsToday
    if (remaining <= 0) {
      const tomorrow = new Date()
      tomorrow.setHours(24, 0, 0, 0)
      return {
        allowed: false,
        reason: 'Daily AI request limit reached',
        remaining: 0,
        resetAt: tomorrow.getTime(),
      }
    }

    return { allowed: true, remaining }
  }

  /**
   * Check if AI tokens quota is available
   */
  async checkAiTokenQuota(estimatedTokens: number = 0): Promise<QuotaCheckResult> {
    const [quota, usage] = await Promise.all([this.getQuota(), this.getUsage()])

    if (quota.aiTokensPerMonth === -1) {
      return { allowed: true, remaining: -1 }
    }

    const remaining = quota.aiTokensPerMonth - usage.aiTokensThisMonth
    if (remaining < estimatedTokens) {
      const nextMonth = new Date()
      nextMonth.setMonth(nextMonth.getMonth() + 1, 1)
      nextMonth.setHours(0, 0, 0, 0)
      return {
        allowed: false,
        reason: 'Monthly AI token limit reached',
        remaining: Math.max(0, remaining),
        resetAt: nextMonth.getTime(),
      }
    }

    return { allowed: true, remaining }
  }

  /**
   * Check if storage quota is available
   */
  async checkStorageQuota(additionalBytes: number = 0): Promise<QuotaCheckResult> {
    const [quota, usage] = await Promise.all([this.getQuota(), this.getUsage()])

    if (quota.maxStorageBytes === -1) {
      return { allowed: true, remaining: -1 }
    }

    const remaining = quota.maxStorageBytes - usage.storageUsedBytes
    if (remaining < additionalBytes) {
      return {
        allowed: false,
        reason: 'Storage limit reached',
        remaining: Math.max(0, remaining),
      }
    }

    return { allowed: true, remaining }
  }

  /**
   * Check if plugin install quota is available
   */
  async checkPluginQuota(): Promise<QuotaCheckResult> {
    const [quota, usage] = await Promise.all([this.getQuota(), this.getUsage()])

    if (quota.maxPlugins === -1) {
      return { allowed: true, remaining: -1 }
    }

    const remaining = quota.maxPlugins - usage.pluginsInstalled
    if (remaining <= 0) {
      return {
        allowed: false,
        reason: 'Plugin limit reached',
        remaining: 0,
      }
    }

    return { allowed: true, remaining }
  }

  /**
   * Get usage percentage (0-100)
   */
  async getUsagePercentage(type: 'aiRequests' | 'aiTokens' | 'storage' | 'plugins'): Promise<number> {
    const [quota, usage] = await Promise.all([this.getQuota(), this.getUsage()])

    switch (type) {
      case 'aiRequests':
        if (quota.aiRequestsPerDay === -1)
          return 0
        return Math.min(100, (usage.aiRequestsToday / quota.aiRequestsPerDay) * 100)
      case 'aiTokens':
        if (quota.aiTokensPerMonth === -1)
          return 0
        return Math.min(100, (usage.aiTokensThisMonth / quota.aiTokensPerMonth) * 100)
      case 'storage':
        if (quota.maxStorageBytes === -1)
          return 0
        return Math.min(100, (usage.storageUsedBytes / quota.maxStorageBytes) * 100)
      case 'plugins':
        if (quota.maxPlugins === -1)
          return 0
        return Math.min(100, (usage.pluginsInstalled / quota.maxPlugins) * 100)
      default:
        return 0
    }
  }

  // ============================================================================
  // Features & Permissions
  // ============================================================================

  /**
   * Check if a feature is enabled for user
   */
  async hasFeature(featureId: string): Promise<boolean> {
    try {
      const features = await this.send<FeatureFlag[]>('account:get-features')
      const feature = features.find(f => f.id === featureId)
      return feature?.enabled ?? false
    }
    catch {
      return false
    }
  }

  /**
   * Get feature value
   */
  async getFeatureValue<T = any>(featureId: string): Promise<T | null> {
    try {
      const features = await this.send<FeatureFlag[]>('account:get-features')
      const feature = features.find(f => f.id === featureId)
      return (feature?.value as T) ?? null
    }
    catch {
      return null
    }
  }

  /**
   * Check if user has API access
   */
  async hasApiAccess(): Promise<boolean> {
    const quota = await this.getQuota()
    return quota.apiAccess
  }

  /**
   * Check if user has custom model access
   */
  async hasCustomModelAccess(): Promise<boolean> {
    const quota = await this.getQuota()
    return quota.customModelAccess
  }

  /**
   * Check if user has priority support
   */
  async hasPrioritySupport(): Promise<boolean> {
    const quota = await this.getQuota()
    return quota.prioritySupport
  }

  /**
   * Check if user has advanced analytics
   */
  async hasAdvancedAnalytics(): Promise<boolean> {
    const quota = await this.getQuota()
    return quota.advancedAnalytics
  }

  // ============================================================================
  // Team
  // ============================================================================

  /**
   * Get user's teams
   */
  async getTeams(): Promise<Team[]> {
    try {
      return await this.send<Team[]>('account:get-teams')
    }
    catch {
      return []
    }
  }

  /**
   * Check if user is in any team
   */
  async isInTeam(): Promise<boolean> {
    const teams = await this.getTeams()
    return teams.length > 0
  }

  /**
   * Check if user is team owner
   */
  async isTeamOwner(teamId?: string): Promise<boolean> {
    const teams = await this.getTeams()
    if (teamId) {
      const team = teams.find(t => t.id === teamId)
      return team?.role === TeamRole.OWNER
    }
    return teams.some(t => t.role === TeamRole.OWNER)
  }

  /**
   * Check if user is team admin
   */
  async isTeamAdmin(teamId?: string): Promise<boolean> {
    const teams = await this.getTeams()
    if (teamId) {
      const team = teams.find(t => t.id === teamId)
      return team?.role === TeamRole.OWNER || team?.role === TeamRole.ADMIN
    }
    return teams.some(t => t.role === TeamRole.OWNER || t.role === TeamRole.ADMIN)
  }

  // ============================================================================
  // Sessions
  // ============================================================================

  /**
   * Get active sessions
   */
  async getSessions(): Promise<DeviceSession[]> {
    try {
      return await this.send<DeviceSession[]>('account:get-sessions')
    }
    catch {
      return []
    }
  }

  /**
   * Get current session
   */
  async getCurrentSession(): Promise<DeviceSession | null> {
    const sessions = await this.getSessions()
    return sessions.find(s => s.isCurrent) ?? null
  }

  // ============================================================================
  // Full Account Info
  // ============================================================================

  /**
   * Get complete account info
   */
  async getAccountInfo(): Promise<AccountInfo | null> {
    const cached = this.getCached<AccountInfo>('accountInfo')
    if (cached)
      return cached

    try {
      const info = await this.send<AccountInfo | null>('account:get-info')
      if (info) {
        this.setCache('accountInfo', info)
      }
      return info
    }
    catch {
      return null
    }
  }

  /**
   * Check if user is beta tester
   */
  async isBetaTester(): Promise<boolean> {
    const info = await this.getAccountInfo()
    return info?.isBetaTester ?? false
  }

  /**
   * Get referral code
   */
  async getReferralCode(): Promise<string | null> {
    const info = await this.getAccountInfo()
    return info?.referralCode ?? null
  }

  /**
   * Get referral count
   */
  async getReferralCount(): Promise<number> {
    const info = await this.getAccountInfo()
    return info?.referralCount ?? 0
  }

  // ============================================================================
  // Upgrade & Billing
  // ============================================================================

  /**
   * Get available upgrade options
   */
  getUpgradeOptions(): UpgradeOption[] {
    return UPGRADE_OPTIONS
  }

  /**
   * Get plan comparison table
   */
  getPlanComparison(): PlanComparisonItem[] {
    return [
      { feature: 'AI Requests/Day', free: 50, pro: 500, plus: 2000, team: 10000, enterprise: 'Unlimited' },
      { feature: 'AI Tokens/Month', free: '100K', pro: '1M', plus: '5M', team: '20M', enterprise: 'Unlimited' },
      { feature: 'Plugins', free: 5, pro: 20, plus: 50, team: 100, enterprise: 'Unlimited' },
      { feature: 'Storage', free: '100MB', pro: '1GB', plus: '5GB', team: '20GB', enterprise: 'Unlimited' },
      { feature: 'Workspaces', free: 1, pro: 5, plus: 20, team: 50, enterprise: 'Unlimited' },
      { feature: 'Team Members', free: false, pro: false, plus: false, team: 10, enterprise: 'Unlimited' },
      { feature: 'Custom Models', free: false, pro: true, plus: true, team: true, enterprise: true },
      { feature: 'API Access', free: false, pro: true, plus: true, team: true, enterprise: true },
      { feature: 'Priority Support', free: false, pro: false, plus: true, team: true, enterprise: true },
      { feature: 'Advanced Analytics', free: false, pro: false, plus: true, team: true, enterprise: true },
    ]
  }

  /**
   * Open upgrade page
   */
  async openUpgradePage(plan?: SubscriptionPlan): Promise<void> {
    await this.send('account:open-upgrade', { plan })
  }

  /**
   * Open billing management page
   */
  async openBillingPage(): Promise<void> {
    await this.send('account:open-billing')
  }

  // ============================================================================
  // Account Actions
  // ============================================================================

  /**
   * Open account settings
   */
  async openAccountSettings(): Promise<void> {
    await this.send('account:open-settings')
  }

  /**
   * Open profile editor
   */
  async openProfileEditor(): Promise<void> {
    await this.send('account:open-profile')
  }

  /**
   * Request login (opens login dialog)
   */
  async requestLogin(): Promise<boolean> {
    return this.send<boolean>('account:request-login')
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    this.clearCache()
    await this.send('account:logout')
  }
}

/**
 * Singleton instance for easy import
 */
export const accountSDK = new AccountSDK()

// Re-export types and enums
export {
  BillingCycle,
  SubscriptionPlan,
  SubscriptionStatus,
  TeamRole,
  VerificationStatus,
}

export type {
  AccountInfo,
  AccountSDKConfig,
  DeviceSession,
  FeatureFlag,
  PlanComparisonItem,
  PlanQuota,
  QuotaCheckResult,
  SocialConnection,
  Subscription,
  Team,
  UpgradeOption,
  UsageStats,
  UserProfile,
}
