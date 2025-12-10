/**
 * Account subscription plan types
 */
export enum SubscriptionPlan {
  FREE = 'free',
  PRO = 'pro',
  PLUS = 'plus',
  TEAM = 'team',
  ENTERPRISE = 'enterprise',
}

/**
 * Subscription billing cycle
 */
export enum BillingCycle {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  LIFETIME = 'lifetime',
}

/**
 * Subscription status
 */
export enum SubscriptionStatus {
  ACTIVE = 'active',
  TRIALING = 'trialing',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  EXPIRED = 'expired',
  PAUSED = 'paused',
}

/**
 * Account verification status
 */
export enum VerificationStatus {
  UNVERIFIED = 'unverified',
  PENDING = 'pending',
  VERIFIED = 'verified',
}

/**
 * User role in organization/team
 */
export enum TeamRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  GUEST = 'guest',
}

/**
 * Feature flag for gated features
 */
export interface FeatureFlag {
  id: string
  enabled: boolean
  value?: string | number | boolean
}

/**
 * Plan quota limits
 */
export interface PlanQuota {
  /** AI requests per day */
  aiRequestsPerDay: number
  /** AI tokens per month */
  aiTokensPerMonth: number
  /** Max plugins allowed */
  maxPlugins: number
  /** Max storage in bytes */
  maxStorageBytes: number
  /** Max team members (for team/enterprise) */
  maxTeamMembers?: number
  /** Max workspaces */
  maxWorkspaces?: number
  /** Custom model access */
  customModelAccess: boolean
  /** Priority support */
  prioritySupport: boolean
  /** API access */
  apiAccess: boolean
  /** Advanced analytics */
  advancedAnalytics: boolean
}

/**
 * Current usage statistics
 */
export interface UsageStats {
  /** AI requests used today */
  aiRequestsToday: number
  /** AI requests used this month */
  aiRequestsThisMonth: number
  /** AI tokens used this month */
  aiTokensThisMonth: number
  /** Storage used in bytes */
  storageUsedBytes: number
  /** Plugins installed count */
  pluginsInstalled: number
  /** Last activity timestamp */
  lastActivityAt?: number
}

/**
 * Subscription details
 */
export interface Subscription {
  /** Subscription ID */
  id: string
  /** Current plan */
  plan: SubscriptionPlan
  /** Subscription status */
  status: SubscriptionStatus
  /** Billing cycle */
  billingCycle: BillingCycle
  /** Plan quota limits */
  quota: PlanQuota
  /** Current usage */
  usage: UsageStats
  /** Start date */
  startedAt: number
  /** Current period end date */
  currentPeriodEnd: number
  /** Trial end date (if trialing) */
  trialEndAt?: number
  /** Cancellation date (if canceled) */
  canceledAt?: number
  /** Cancel at period end */
  cancelAtPeriodEnd: boolean
  /** Auto-renew enabled */
  autoRenew: boolean
  /** Payment method on file */
  hasPaymentMethod: boolean
  /** Price in cents */
  priceInCents?: number
  /** Currency code */
  currency?: string
}

/**
 * Social connection info
 */
export interface SocialConnection {
  provider: 'google' | 'github' | 'apple' | 'microsoft' | 'discord' | 'twitter'
  providerId: string
  email?: string
  username?: string
  avatarUrl?: string
  connectedAt: number
}

/**
 * User profile
 */
export interface UserProfile {
  /** User ID */
  id: string
  /** Display name */
  displayName: string
  /** Username (unique) */
  username?: string
  /** First name */
  firstName?: string
  /** Last name */
  lastName?: string
  /** Primary email */
  email: string
  /** Email verified */
  emailVerified: boolean
  /** Avatar URL */
  avatarUrl?: string
  /** Phone number */
  phone?: string
  /** Phone verified */
  phoneVerified?: boolean
  /** Bio/description */
  bio?: string
  /** Locale/language preference */
  locale?: string
  /** Timezone */
  timezone?: string
  /** Account created at */
  createdAt: number
  /** Last updated at */
  updatedAt: number
  /** Last sign in at */
  lastSignInAt?: number
  /** Two-factor enabled */
  twoFactorEnabled: boolean
  /** Connected social accounts */
  socialConnections: SocialConnection[]
}

/**
 * Team/Organization info
 */
export interface Team {
  /** Team ID */
  id: string
  /** Team name */
  name: string
  /** Team slug (URL-safe) */
  slug: string
  /** Team logo URL */
  logoUrl?: string
  /** Team description */
  description?: string
  /** User's role in team */
  role: TeamRole
  /** Member count */
  memberCount: number
  /** Team created at */
  createdAt: number
  /** Team subscription (if separate from user) */
  subscription?: Subscription
}

/**
 * Device session info
 */
export interface DeviceSession {
  /** Session ID */
  id: string
  /** Device name/type */
  deviceName: string
  /** Device type */
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown'
  /** Operating system */
  os?: string
  /** Browser/client */
  client?: string
  /** IP address */
  ipAddress?: string
  /** Location (city, country) */
  location?: string
  /** Is current session */
  isCurrent: boolean
  /** Last active at */
  lastActiveAt: number
  /** Created at */
  createdAt: number
}

/**
 * Complete account info
 */
export interface AccountInfo {
  /** User profile */
  profile: UserProfile
  /** Subscription details */
  subscription: Subscription
  /** Teams user belongs to */
  teams: Team[]
  /** Active sessions */
  sessions: DeviceSession[]
  /** Feature flags */
  features: FeatureFlag[]
  /** Account verification status */
  verificationStatus: VerificationStatus
  /** Is beta tester */
  isBetaTester: boolean
  /** Referral code */
  referralCode?: string
  /** Referred by user ID */
  referredBy?: string
  /** Referral count */
  referralCount: number
}

/**
 * Account SDK configuration
 */
export interface AccountSDKConfig {
  /** API base URL */
  apiBaseUrl?: string
  /** Cache TTL in milliseconds */
  cacheTTL?: number
  /** Enable offline mode */
  offlineMode?: boolean
}

/**
 * Quota check result
 */
export interface QuotaCheckResult {
  /** Is allowed */
  allowed: boolean
  /** Reason if not allowed */
  reason?: string
  /** Remaining quota */
  remaining?: number
  /** Reset time */
  resetAt?: number
}

/**
 * Plan comparison item
 */
export interface PlanComparisonItem {
  feature: string
  free: string | boolean | number
  pro: string | boolean | number
  plus: string | boolean | number
  team: string | boolean | number
  enterprise: string | boolean | number
}

/**
 * Upgrade options
 */
export interface UpgradeOption {
  plan: SubscriptionPlan
  name: string
  description: string
  priceMonthly: number
  priceYearly: number
  currency: string
  features: string[]
  recommended?: boolean
}
