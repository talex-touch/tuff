export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface AuthUser {
  id: string
  email: string
  name: string | null
  image: string | null
  role: 'admin' | 'user' | string
  locale: 'en' | 'zh' | null
  emailVerified: boolean
  emailState: string
  isRestricted: boolean
  passkeyCount: number
}

export interface DeviceAuthInfoResponse {
  status: 'pending' | 'approved' | 'cancelled' | 'rejected' | 'expired' | string
  grantType?: 'short' | 'long'
  deviceName?: string | null
  devicePlatform?: string | null
  expiresAt?: string | number
  longTermAllowed?: boolean
  longTermReason?: string | null
  longTermSessionFresh?: boolean
  longTermSessionWindowSeconds?: number
  ipMismatch?: boolean
  ipMismatchWarning?: boolean
  allowCliIpMismatch?: boolean
  rejectReason?: string | null
  rejectMessage?: string | null
  requestIp?: string | null
  currentIp?: string | null
}

export interface SubscriptionStatusResponse {
  plan: string
  expiresAt: string | null
  activatedAt: string | null
  isActive: boolean
  features: {
    aiRequests: { limit: number, used: number }
    aiTokens: { limit: number, used: number }
    customModels: boolean
    prioritySupport: boolean
    apiAccess: boolean
  }
  team: {
    id: string
    name: string
    type: 'personal' | 'organization' | string
    role: string
    collaborationEnabled: boolean
    seats: { used: number, total: number }
    permissions: {
      canInvite: boolean
      canManageMembers: boolean
      canDisband: boolean
      canCreateTeam: boolean
    }
  }
}

export interface LocalizedText {
  en: string
  zh: string
}

export interface CreditSummaryResponse {
  month?: string
  balance?: number
  quota?: number
  used?: number
  remaining?: number
  user?: {
    quota: number
    used: number
  }
  personal?: {
    balance?: number
    quota?: number
    used?: number
  }
  team?: {
    balance?: number
    quota?: number
    used?: number
  }
  teamContext?: {
    id: string
    name: string
    type: string
    hasTeamPool: boolean
  } | null
  boost?: {
    eligible?: boolean
    claimed?: boolean
    claimedThisMonth?: boolean
    canClaimNow?: boolean
    amount?: number
  } | null
}

export interface CreditLedgerEntry {
  id: string
  userId?: string
  user_id?: string
  userEmail?: string | null
  scope?: string
  scope_id?: string
  delta: number
  balanceAfter?: number | null
  balance_after?: number | null
  reason: string
  action?: string | null
  model?: string | null
  createdAt?: string
  created_at?: string
}

export interface CreditPricingRule {
  capability: string
  creditsPerUnit: number
  minCredits: number
  reserveMultiplier: number
  upstreamCostUsdPerUnit?: number | null
  unit?: string
  active: boolean
  updatedAt?: string | null
}

export interface ApiKeyItem {
  id: string
  name: string
  prefix?: string
  keyPrefix?: string
  scopes: string[]
  lastUsedAt?: string | null
  expiresAt?: string | null
  createdAt: string
  secret?: string
  key?: string
}

export interface PrivacySettings {
  analytics: boolean
  crashReports: boolean
  usageData: boolean
  personalization: boolean
}

export interface SecuritySettings {
  allowCliIpMismatch: boolean
}

export interface ConnectedDevice {
  id: string
  deviceId?: string
  name?: string | null
  deviceName?: string | null
  platform?: string | null
  trusted?: boolean
  revokedAt?: string | null
  lastSeenAt?: string | null
  createdAt?: string | null
  ip?: string | null
}

export interface SyncSessionItem {
  device_id: string
  expires_at: string
  last_cursor: number
  last_push_at: string | null
  last_pull_at: string | null
  last_error_code: string | null
}

export interface StorageStatusResponse {
  quota?: {
    plan_tier?: string
    limits?: {
      storage_limit_bytes?: number
      object_limit?: number
      item_limit?: number
      device_limit?: number
    }
    usage?: {
      used_storage_bytes?: number
      used_objects?: number
      used_devices?: number
    }
    usedBytes?: number
    limitBytes?: number
  }
  usedBytes?: number
  limitBytes?: number
  keyrings?: Array<{
    id?: string
    keyring_id?: string
    device_id?: string
    deviceId?: string
    version?: number
    status?: string
    created_at?: string
    createdAt?: string
  }>
  keyringCount?: number
  latestSession?: SyncSessionItem | null
  generatedAt?: string
}

export interface PluginVersionItem {
  id: string
  version: string
  channel: 'RELEASE' | 'BETA' | 'SNAPSHOT' | string
  status: string
  changelog?: string | null
  createdAt?: string | null
}

export interface DashboardPluginItem {
  id: string
  slug: string
  name: string
  summary: string
  category: string
  artifactType?: string
  status: 'draft' | 'pending' | 'approved' | 'rejected' | string
  homepage?: string | null
  iconUrl?: string | null
  isOfficial?: boolean
  badges?: string[]
  ownerName?: string | null
  author?: { name?: string | null }
  latestVersion?: PluginVersionItem | null
  versions?: PluginVersionItem[]
  updatedAt?: string | null
  createdAt?: string | null
}

export interface SigningKeyItem {
  id?: string
  keyId: string
  algorithm?: string
  fingerprintSha256?: string
  fingerprint?: string
  publicKeyPem?: string
  status?: 'active' | 'overlap' | 'revoked' | string
  validFrom?: string | null
  validUntil?: string | null
  createdAt?: string | null
}

export interface TeamMemberItem {
  id: string
  userId: string
  name: string
  email: string
  role: string
  status: string
  joinedAt?: string | null
}

export interface TeamInviteItem {
  id: string
  email: string
  role: string
  status: string
  expiresAt?: string | null
  createdAt?: string | null
}

export interface ReceivedTeamInvitation {
  id: string
  teamId?: string
  teamName?: string
  organizationId?: string
  organizationName?: string
  role: string
  status: string
  expiresAt?: string | null
  createdAt?: string | null
}

export interface DashboardTeamResponse {
  team: {
    id: string
    name: string
    type: 'personal' | 'organization' | string
    role: string
    plan?: string
    collaborationEnabled: boolean
    seats: { used: number, total: number }
    quota?: {
      aiRequests: { used: number, limit: number }
      aiTokens: { used: number, limit: number }
      weekStartDate?: string
    }
    permissions: {
      canInvite: boolean
      canManageMembers: boolean
      canDisband: boolean
      canCreateTeam: boolean
    }
    members: TeamMemberItem[]
    invites: TeamInviteItem[]
    receivedInvites: ReceivedTeamInvitation[]
    pendingInvites?: number
  }
}

export interface NotificationItem {
  id: string
  title: string
  body?: string | null
  message?: string | null
  action?: string | null
  resourceType?: string | null
  category?: string | null
  level?: string | null
  status?: 'unread' | 'read' | string
  read?: boolean
  readAt?: string | null
  occurredAt?: string | null
  createdAt: string
}

export interface NotificationsListResponse {
  notifications?: NotificationItem[]
  items?: NotificationItem[]
  unreadCount: number
  pagination?: PaginationMeta
  total?: number
}

export interface PushSubscriptionItem {
  id: string
  endpoint: string
  userAgent?: string | null
  deviceLabel?: string | null
  createdAt?: string | null
}

export interface AdminUsageResponse {
  days: number
  since?: string
  generatedAt?: string
  activeUsers: {
    dau: number
    wau: number
    mau: number
    activeDevices: number
    totalRegisteredUsers?: number
    dailySeries?: Array<{ date: string, dau: number, launches?: number, errors?: number }>
  }
  distribution?: {
    versions: Array<{
      version: string
      channel?: string
      count: number
      uniqueClients?: number
    }>
    platforms: Array<{
      platform: string
      arch?: string
      count: number
      uniqueClients?: number
    }>
  }
  regions: Array<{
    countryCode: string
    count: number
    uniqueClients?: number
  }>
  topFeatures: Array<{
    feature: string
    count: number
    uniqueClients?: number
  }>
  ecosystem: {
    topPlugins: Array<{ pluginId: string, name?: string, installs: number, actions?: number }>
    aiGateway: {
      totalRequests: number
      successCount?: number
      errorCount?: number
      successRate: number
      avgLatencyMs: number
      totalTokens: number
    }
  }
  stability?: {
    totalErrors: number
    totalLaunches: number
    errorRate: number
    byVersion: Array<{
      version: string
      errors: number
      launches?: number
      errorRate: number
    }>
  }
}

export interface AdminUserItem {
  id: string
  email: string
  name: string | null
  image: string | null
  role: 'admin' | 'user' | string
  status: 'active' | 'disabled' | 'merged' | 'deletion_pending' | string
  emailState: string
  locale: string | null
  disabledAt?: string | null
  createdAt: string
}

export interface AdminStoreReviewItem {
  id: string
  pluginId: string
  userId: string
  rating: number
  comment?: string | null
  status: string
  createdAt: string
  plugin?: { id: string, slug: string, name: string } | null
}

export interface ReleaseItem {
  id: string
  tag: string
  name?: string | null
  version?: string | null
  channel: 'RELEASE' | 'BETA' | 'SNAPSHOT' | string
  status: 'draft' | 'published' | 'archived' | string
  rollbackFromVersion?: string | null
  rollbackCompatible?: boolean
  notes?: string | LocalizedText | null
  publishedAt?: string | null
  createdAt?: string | null
  assets?: Array<{ id: string, platform: string, arch: string, filename?: string }>
}

export interface UpdateAnnouncementItem {
  id: string
  title: string | LocalizedText
  summary?: string | LocalizedText | null
  type?: 'news' | 'release' | 'announcement' | 'config' | 'data' | string
  scope?: 'web' | 'system' | 'both' | string
  channels?: string[]
  channel?: string | null
  releaseTag?: string | null
  tags?: string[]
  link?: string | null
  timestamp?: string | null
  publishedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface ExchangeLatestResponse {
  base: string
  asOf?: string | null
  fetchedAt?: string | null
  providerUpdatedAt?: string | null
  source?: string
  rates: Record<string, number>
}

export interface AdminAiProviderCapability {
  id?: string
  capability: string
}

export interface AdminAiProvider {
  id: string
  name: string
  displayName?: string
  vendor?: string
  endpoint?: string | null
  authType?: 'api_key' | 'secret_pair' | 'oauth' | 'none' | string
  ownerScope?: 'system' | 'user' | 'workspace' | string
  status?: 'enabled' | 'disabled' | 'degraded' | string
  metadata?: {
    adapterKey?: string
    models?: string[]
    defaultModel?: string
    quota?: Record<string, unknown>
    [key: string]: unknown
  } | null
  capabilities: Array<string | AdminAiProviderCapability>
  hasCredential?: boolean
  credentialConfigured?: boolean
  quota?: {
    requestsPerDay?: number
    tokensPerDay?: number
    [key: string]: unknown
  } | null
  latestHealth?: {
    success?: boolean
    latency?: number
    checkedAt?: string
  } | null
  updatedAt?: string | null
}

export interface AdminAiSceneBinding {
  providerId: string
  capability: string
  model?: string | null
  priority: number
  status: 'enabled' | 'disabled'
}

export interface AdminAiSceneReadiness {
  status: 'ready' | 'degraded' | 'disabled' | string
  missingCapabilities?: string[]
}

export interface AdminAiScene {
  id: string
  displayName?: string
  name?: string
  owner?: string
  ownerScope?: string
  status?: 'enabled' | 'disabled' | string
  requiredCapabilities?: string[]
  strategyMode?: string
  fallback?: 'enabled' | 'disabled' | string
  readiness?: AdminAiSceneReadiness | 'ready' | 'degraded' | 'disabled' | string
  bindings: AdminAiSceneBinding[]
  updatedAt?: string | null
}

export interface AdminAiUsageRow {
  providerId?: string
  providerName?: string
  model?: string
  requests: number
  successRate?: number
  avgLatencyMs: number
  totalTokens: number
}

export interface AdminAiUsageResponse {
  window?: { days: number, since: string, until: string }
  summary: {
    totalRequests?: number
    requests?: number
    successCount?: number
    failureCount?: number
    successRate: number
    avgLatencyMs: number
    totalTokens: number
  }
  byProvider?: AdminAiUsageRow[]
  byModel?: AdminAiUsageRow[]
  rows?: AdminAiUsageRow[]
}

export interface ActivationCodeItem {
  id: string
  code: string
  plan: string
  duration_days?: number
  durationDays?: number
  max_uses?: number
  maxUses?: number
  uses?: number
  used_count?: number
  status: 'active' | 'exhausted' | 'expired' | 'revoked' | string
  expires_at?: string | null
  expiresAt?: string | null
  created_at?: string | null
  createdAt?: string | null
}

export interface AdminSubscriptionItem {
  user: {
    id: string
    email: string
    name: string | null
    role: string
    status: string
    createdAt: string
  }
  subscription: {
    plan: string
    activatedAt: string | null
    expiresAt: string | null
    isActive: boolean
  }
}
