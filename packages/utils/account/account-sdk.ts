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
import { AccountEvents } from '../transport/events'

/** The plans from the lowest tier to the highest; each includes everything in the ones before it. */
const PLAN_TIERS: readonly SubscriptionPlan[] = [
  SubscriptionPlan.FREE,
  SubscriptionPlan.PLUS,
  SubscriptionPlan.PRO,
  SubscriptionPlan.TEAM,
  SubscriptionPlan.ENTERPRISE,
]

/** Whether `plan` is `minimum` or a higher tier. A plan this SDK does not know ranks below all. */
function isPlanAtLeast(plan: SubscriptionPlan, minimum: SubscriptionPlan): boolean {
  const rank = PLAN_TIERS.indexOf(plan)
  return rank !== -1 && rank >= PLAN_TIERS.indexOf(minimum)
}

/**
 * Default plan quotas, lowest tier first. The AI limits are the weekly ones Nexus reports; the
 * deprecated day and month names carry the same numbers. The AI limits, the three flags Nexus
 * reports and the team members match its plan catalog (`apps/nexus/server/utils/planCatalog.ts`);
 * a signed-in host lays Nexus's own values over this table. The upgrade options and the plan
 * comparison below are written from it.
 */
export const DEFAULT_PLAN_QUOTAS: Record<SubscriptionPlan, PlanQuota> = {
  [SubscriptionPlan.FREE]: {
    aiRequestsPerWeek: 50,
    aiTokensPerWeek: 10000,
    aiRequestsPerDay: 50,
    aiTokensPerMonth: 10000,
    maxPlugins: 5,
    maxStorageBytes: 100 * 1024 * 1024, // 100MB
    maxWorkspaces: 1,
    customModelAccess: false,
    prioritySupport: false,
    apiAccess: false,
    advancedAnalytics: false,
  },
  [SubscriptionPlan.PLUS]: {
    aiRequestsPerWeek: 500,
    aiTokensPerWeek: 100000,
    aiRequestsPerDay: 500,
    aiTokensPerMonth: 100000,
    maxPlugins: 20,
    maxStorageBytes: 1024 * 1024 * 1024, // 1GB
    maxWorkspaces: 5,
    customModelAccess: true,
    prioritySupport: true,
    apiAccess: true,
    advancedAnalytics: false,
  },
  [SubscriptionPlan.PRO]: {
    aiRequestsPerWeek: 2000,
    aiTokensPerWeek: 500000,
    aiRequestsPerDay: 2000,
    aiTokensPerMonth: 500000,
    maxPlugins: 50,
    maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5GB
    maxWorkspaces: 20,
    customModelAccess: true,
    prioritySupport: true,
    apiAccess: true,
    advancedAnalytics: true,
  },
  [SubscriptionPlan.TEAM]: {
    aiRequestsPerWeek: 5000,
    aiTokensPerWeek: 1000000,
    aiRequestsPerDay: 5000,
    aiTokensPerMonth: 1000000,
    maxPlugins: 100,
    maxStorageBytes: 20 * 1024 * 1024 * 1024, // 20GB
    maxTeamMembers: 5,
    maxWorkspaces: 50,
    customModelAccess: true,
    prioritySupport: true,
    apiAccess: true,
    advancedAnalytics: true,
  },
  [SubscriptionPlan.ENTERPRISE]: {
    aiRequestsPerWeek: 50000,
    aiTokensPerWeek: 10000000,
    aiRequestsPerDay: 50000,
    aiTokensPerMonth: 10000000,
    maxPlugins: -1, // Unlimited
    maxStorageBytes: -1, // Unlimited
    maxTeamMembers: 10,
    maxWorkspaces: -1, // Unlimited
    customModelAccess: true,
    prioritySupport: true,
    apiAccess: true,
    advancedAnalytics: true,
  },
}

/** `500000` as `500K` and `1000000` as `1M`, the way the plan copy writes token counts. */
function formatCount(value: number): string {
  if (value >= 1_000_000)
    return `${value / 1_000_000}M`
  if (value >= 1000)
    return `${value / 1000}K`
  return String(value)
}

function formatStorage(bytes: number): string {
  const gigabyte = 1024 * 1024 * 1024
  return bytes >= gigabyte ? `${bytes / gigabyte}GB` : `${bytes / (1024 * 1024)}MB`
}

/** A limit as the copy shows it: `-1` is unlimited. */
function limitText<T>(value: number, format: (value: number) => T): T | 'Unlimited' {
  return value === -1 ? 'Unlimited' : format(value)
}

const PLAN_FLAG_LABELS = [
  ['customModelAccess', 'Custom model access'],
  ['apiAccess', 'API access'],
  ['prioritySupport', 'Priority support'],
  ['advancedAnalytics', 'Advanced analytics'],
] as const

/**
 * A plan's selling points: its limits, then the flags it adds over the plan below it, which it
 * includes in full.
 */
function upgradeFeatures(plan: SubscriptionPlan, extras: readonly string[] = []): string[] {
  const quota = DEFAULT_PLAN_QUOTAS[plan]
  const below = DEFAULT_PLAN_QUOTAS[PLAN_TIERS[PLAN_TIERS.indexOf(plan) - 1] ?? SubscriptionPlan.FREE]
  const features = [
    `${limitText(quota.aiRequestsPerWeek, String)} AI requests/week`,
    `${limitText(quota.aiTokensPerWeek, formatCount)} tokens/week`,
    `${limitText(quota.maxPlugins, String)} plugins`,
    `${limitText(quota.maxStorageBytes, formatStorage)} storage`,
  ]
  if (quota.maxTeamMembers !== undefined)
    features.push(`Up to ${quota.maxTeamMembers} team members`)
  for (const [flag, label] of PLAN_FLAG_LABELS) {
    if (quota[flag] && !below[flag])
      features.push(label)
  }
  return [...features, ...extras]
}

/**
 * Upgrade options. They carry no price: Tuff is free during its Pioneer period, and a price
 * appears here only once Nexus publishes one.
 */
export const UPGRADE_OPTIONS: UpgradeOption[] = [
  {
    plan: SubscriptionPlan.PLUS,
    name: 'Plus',
    description: 'For power users who need more AI capabilities',
    features: upgradeFeatures(SubscriptionPlan.PLUS),
  },
  {
    plan: SubscriptionPlan.PRO,
    name: 'Pro',
    description: 'For professionals who demand the best',
    features: upgradeFeatures(SubscriptionPlan.PRO),
    recommended: true,
  },
  {
    plan: SubscriptionPlan.TEAM,
    name: 'Team',
    description: 'For teams that collaborate',
    features: upgradeFeatures(SubscriptionPlan.TEAM, ['Team management']),
  },
]

/** The rows of `getPlanComparison()`, each read from `DEFAULT_PLAN_QUOTAS`. */
const PLAN_COMPARISON_ROWS: ReadonlyArray<{
  feature: string
  value: (quota: PlanQuota) => string | number | boolean
}> = [
  { feature: 'AI Requests/Week', value: quota => limitText(quota.aiRequestsPerWeek, value => value) },
  { feature: 'AI Tokens/Week', value: quota => limitText(quota.aiTokensPerWeek, formatCount) },
  { feature: 'Plugins', value: quota => limitText(quota.maxPlugins, value => value) },
  { feature: 'Storage', value: quota => limitText(quota.maxStorageBytes, formatStorage) },
  {
    feature: 'Workspaces',
    value: quota => quota.maxWorkspaces === undefined ? false : limitText(quota.maxWorkspaces, value => value),
  },
  { feature: 'Team Members', value: quota => quota.maxTeamMembers ?? false },
  { feature: 'Custom Models', value: quota => quota.customModelAccess },
  { feature: 'API Access', value: quota => quota.apiAccess },
  { feature: 'Priority Support', value: quota => quota.prioritySupport },
  { feature: 'Advanced Analytics', value: quota => quota.advancedAnalytics },
]

/** When Nexus starts counting a new week of AI usage: the next Monday, 00:00 UTC. */
function nextQuotaWeekStart(now: Date = new Date()): number {
  const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday)
}

/** This week's AI limits and usage. An older host sends only the deprecated names. */
function weeklyAiQuota(quota: PlanQuota, usage: UsageStats) {
  return {
    requestLimit: quota.aiRequestsPerWeek ?? quota.aiRequestsPerDay,
    tokenLimit: quota.aiTokensPerWeek ?? quota.aiTokensPerMonth,
    requestsUsed: usage.aiRequestsThisWeek ?? usage.aiRequestsToday,
    tokensUsed: usage.aiTokensThisWeek ?? usage.aiTokensThisMonth,
  }
}

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
      const token = await this.send<string | null>(AccountEvents.auth.getToken.toEventName())
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
      const deviceId = await this.send<string | null>(AccountEvents.device.getId.toEventName())
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
      const enabled = await this.send<boolean | null>(AccountEvents.sync.getEnabled.toEventName())
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
      await this.send(AccountEvents.sync.recordActivity.toEventName(), { kind })
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
      const profile = await this.send<UserProfile | null>(AccountEvents.account.getProfile.toEventName())
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
      const subscription = await this.send<Subscription | null>(AccountEvents.account.getSubscription.toEventName())
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
    return isPlanAtLeast(await this.getPlan(), SubscriptionPlan.PRO)
  }

  /**
   * Check if user is Plus or above
   */
  async isPlusOrAbove(): Promise<boolean> {
    return isPlanAtLeast(await this.getPlan(), SubscriptionPlan.PLUS)
  }

  /**
   * Check if user is Team or above
   */
  async isTeamOrAbove(): Promise<boolean> {
    return isPlanAtLeast(await this.getPlan(), SubscriptionPlan.TEAM)
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

    const emptyUsage: UsageStats = {
      aiRequestsThisWeek: 0,
      aiTokensThisWeek: 0,
      aiRequestsToday: 0,
      aiRequestsThisMonth: 0,
      aiTokensThisMonth: 0,
      storageUsedBytes: 0,
      pluginsInstalled: 0,
    }

    try {
      const usage = await this.send<UsageStats | null>(AccountEvents.account.getUsage.toEventName())
      if (!usage)
        return emptyUsage
      this.setCache('usage', usage)
      return usage
    }
    catch {
      return emptyUsage
    }
  }

  /**
   * Check if this week's AI request quota is available
   */
  async checkAiRequestQuota(): Promise<QuotaCheckResult> {
    const [quota, usage] = await Promise.all([this.getQuota(), this.getUsage()])
    const { requestLimit, requestsUsed } = weeklyAiQuota(quota, usage)

    if (requestLimit === -1) {
      return { allowed: true, remaining: -1 }
    }

    const remaining = requestLimit - requestsUsed
    if (remaining <= 0) {
      return {
        allowed: false,
        reason: 'Weekly AI request limit reached',
        remaining: 0,
        resetAt: nextQuotaWeekStart(),
      }
    }

    return { allowed: true, remaining }
  }

  /**
   * Check if this week's AI token quota is available
   */
  async checkAiTokenQuota(estimatedTokens: number = 0): Promise<QuotaCheckResult> {
    const [quota, usage] = await Promise.all([this.getQuota(), this.getUsage()])
    const { tokenLimit, tokensUsed } = weeklyAiQuota(quota, usage)

    if (tokenLimit === -1) {
      return { allowed: true, remaining: -1 }
    }

    const remaining = tokenLimit - tokensUsed
    if (remaining < estimatedTokens) {
      return {
        allowed: false,
        reason: 'Weekly AI token limit reached',
        remaining: Math.max(0, remaining),
        resetAt: nextQuotaWeekStart(),
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
    const weekly = weeklyAiQuota(quota, usage)

    switch (type) {
      case 'aiRequests':
        if (weekly.requestLimit === -1)
          return 0
        return Math.min(100, (weekly.requestsUsed / weekly.requestLimit) * 100)
      case 'aiTokens':
        if (weekly.tokenLimit === -1)
          return 0
        return Math.min(100, (weekly.tokensUsed / weekly.tokenLimit) * 100)
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
      const features = await this.send<FeatureFlag[]>(AccountEvents.account.getFeatures.toEventName())
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
      const features = await this.send<FeatureFlag[]>(AccountEvents.account.getFeatures.toEventName())
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
      return await this.send<Team[]>(AccountEvents.account.getTeams.toEventName())
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
      return await this.send<DeviceSession[]>(AccountEvents.account.getSessions.toEventName())
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
      const info = await this.send<AccountInfo | null>(AccountEvents.account.getInfo.toEventName())
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
    const quotas = DEFAULT_PLAN_QUOTAS
    return PLAN_COMPARISON_ROWS.map(({ feature, value }) => ({
      feature,
      free: value(quotas[SubscriptionPlan.FREE]),
      plus: value(quotas[SubscriptionPlan.PLUS]),
      pro: value(quotas[SubscriptionPlan.PRO]),
      team: value(quotas[SubscriptionPlan.TEAM]),
      enterprise: value(quotas[SubscriptionPlan.ENTERPRISE]),
    }))
  }

  /**
   * Open upgrade page
   */
  async openUpgradePage(plan?: SubscriptionPlan): Promise<void> {
    await this.send(AccountEvents.account.openUpgrade.toEventName(), { plan })
  }

  /**
   * Open billing management page
   */
  async openBillingPage(): Promise<void> {
    await this.send(AccountEvents.account.openBilling.toEventName())
  }

  // ============================================================================
  // Account Actions
  // ============================================================================

  /**
   * Open account settings
   */
  async openAccountSettings(): Promise<void> {
    await this.send(AccountEvents.account.openSettings.toEventName())
  }

  /**
   * Open profile editor
   */
  async openProfileEditor(): Promise<void> {
    await this.send(AccountEvents.account.openProfile.toEventName())
  }

  /**
   * Request login (opens login dialog)
   */
  async requestLogin(): Promise<boolean> {
    return this.send<boolean>(AccountEvents.account.requestLogin.toEventName())
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    this.clearCache()
    await this.send(AccountEvents.account.logout.toEventName())
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
