import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './http'
import type {
  ActivationCodeItem,
  AdminAiProvider,
  AdminAiScene,
  AdminAiSceneBinding,
  AdminAiUsageResponse,
  AdminStoreReviewItem,
  AdminSubscriptionItem,
  AdminUsageResponse,
  AdminUserItem,
  ApiKeyItem,
  AuthUser,
  ConnectedDevice,
  CreditLedgerEntry,
  CreditPricingRule,
  CreditSummaryResponse,
  DashboardPluginItem,
  DashboardTeamResponse,
  DeviceAuthInfoResponse,
  ExchangeLatestResponse,
  NotificationsListResponse,
  PaginationMeta,
  PrivacySettings,
  PushSubscriptionItem,
  ReceivedTeamInvitation,
  ReleaseItem,
  SecuritySettings,
  SigningKeyItem,
  StorageStatusResponse,
  SubscriptionStatusResponse,
  SyncSessionItem,
  TeamInviteItem,
  UpdateAnnouncementItem,
} from './types'

/**
 * Single source of truth for every same-origin /api/* endpoint consumed by apps/nexus-console.
 * Strictly aligned with apps/nexus-api (zero governance/checkin/oauth-idp/docs-runtime endpoints).
 */
export const API_ROUTES = {
  auth: {
    me: '/api/auth/me',
    profile: '/api/auth/profile',
    verify: '/api/auth/verify',
    bindEmail: '/api/auth/bind-email',
    signInToken: '/api/auth/sign-in-token',
    oauthGitHub: '/api/auth/signin/github',
    oauthLinuxDo: '/api/auth/signin/linuxdo',
    emailSignIn: '/api/auth/signin/email',
    credentialsSignIn: '/api/auth/signin/credentials',
    signOut: '/api/auth/signout',
  },
  passkeys: {
    options: '/api/passkeys/options',
    verify: '/api/passkeys/verify',
    registerOptions: '/api/passkeys/register-options',
    registerVerify: '/api/passkeys/register-verify',
  },
  deviceAuth: {
    info: '/api/app-auth/device/info',
    approve: '/api/app-auth/device/approve',
    cancel: '/api/app-auth/device/cancel',
    presence: '/api/app-auth/device/presence',
  },
  account: {
    exportData: '/api/user/me/export',
    deleteMe: '/api/user/me',
    privacySettings: '/api/dashboard/privacy-settings',
    securitySettings: '/api/dashboard/security-settings',
    apiKeys: '/api/dashboard/api-keys',
    apiKeyById: (id: string) => `/api/dashboard/api-keys/${encodeURIComponent(id)}`,
  },
  devices: {
    list: '/api/devices',
    rename: '/api/devices/rename',
    trust: '/api/devices/trust',
    revoke: '/api/devices/revoke',
  },
  storage: {
    status: '/api/dashboard/storage',
    sessions: '/api/dashboard/storage/sessions',
  },
  plugins: {
    list: '/api/dashboard/plugins',
    create: '/api/dashboard/plugins',
    byId: (id: string) => `/api/dashboard/plugins/${encodeURIComponent(id)}`,
    status: (id: string) => `/api/dashboard/plugins/${encodeURIComponent(id)}/status`,
    versions: (id: string) => `/api/dashboard/plugins/${encodeURIComponent(id)}/versions`,
    versionById: (id: string, versionId: string) =>
      `/api/dashboard/plugins/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`,
    signingKeys: '/api/dashboard/plugin-signing-keys',
    signingKeyById: (keyId: string) => `/api/dashboard/plugin-signing-keys/${encodeURIComponent(keyId)}`,
  },
  team: {
    overview: '/api/dashboard/team',
    create: '/api/dashboard/team/create',
    disband: '/api/dashboard/team/disband',
    quota: '/api/dashboard/team/quota',
    creditsUsage: '/api/dashboard/team/credits/usage',
    invites: '/api/dashboard/team/invites',
    inviteById: (id: string) => `/api/dashboard/team/invites/${encodeURIComponent(id)}`,
    invitations: '/api/team/invitations',
    invitationById: (id: string) => `/api/team/invitations/${encodeURIComponent(id)}`,
    acceptInvitation: (id: string) => `/api/team/invitations/${encodeURIComponent(id)}/accept`,
  },
  credits: {
    subscriptionStatus: '/api/subscription/status',
    subscriptionActivate: '/api/subscription/activate',
    summary: '/api/credits/summary',
    ledger: '/api/credits/ledger',
    pricing: '/api/credits/pricing',
    models: '/api/credits/models',
    claim: '/api/credits/claim',
  },
  notifications: {
    list: '/api/notifications',
    read: '/api/notifications/read',
    push: '/api/notifications/push',
    pushById: (id: string) => `/api/notifications/push/${encodeURIComponent(id)}`,
  },
  admin: {
    usage: '/api/admin/usage',
    users: '/api/admin/users',
    userRole: (id: string) => `/api/admin/users/${encodeURIComponent(id)}/role`,
    userStatus: (id: string) => `/api/admin/users/${encodeURIComponent(id)}/status`,
    pendingPlugins: '/api/admin/plugins/pending',
    storePlugins: '/api/admin/store/plugins',
    storePluginStatus: (id: string) => `/api/admin/store/plugins/${encodeURIComponent(id)}/status`,
    pendingReviews: '/api/admin/store/reviews/pending',
    reviewStatus: (id: string) => `/api/admin/store/reviews/${encodeURIComponent(id)}/status`,
    releases: '/api/releases',
    releaseByTag: (tag: string) => `/api/releases/${encodeURIComponent(tag)}`,
    publishRelease: (tag: string) => `/api/releases/${encodeURIComponent(tag)}/publish`,
    updates: '/api/updates',
    updateById: (id: string) => `/api/updates/${encodeURIComponent(id)}`,
    exchangeLatest: '/api/exchange/latest',
    exchangeRefresh: '/api/admin/exchange/refresh',
    aiProviders: '/api/admin/ai/providers',
    aiProviderById: (id: string) => `/api/admin/ai/providers/${encodeURIComponent(id)}`,
    aiProviderCheck: (id: string) => `/api/admin/ai/providers/${encodeURIComponent(id)}/check`,
    aiScenes: '/api/admin/ai/scenes',
    aiSceneById: (id: string) => `/api/admin/ai/scenes/${encodeURIComponent(id)}`,
    aiUsage: '/api/admin/ai/usage',
    creditsPricing: '/api/admin/credits/pricing',
    creditsLedger: '/api/admin/credits/ledger',
    codes: '/api/admin/codes',
    generateCodes: '/api/admin/codes/generate',
    codeById: (id: string) => `/api/admin/codes/${encodeURIComponent(id)}`,
    subscriptions: '/api/admin/subscriptions',
    grantSubscription: '/api/admin/subscriptions/grant',
  },
} as const

export const consoleApi = {
  // ─── Auth & Passkeys ──────────────────────────────────────────────────────
  getMe: () => apiGet<AuthUser | null>(API_ROUTES.auth.me),
  updateProfile: (payload: { name?: string | null, image?: string | null, locale?: 'en' | 'zh' | null }) =>
    apiPatch<AuthUser>(API_ROUTES.auth.profile, payload),
  verifyEmail: (payload: { email: string, token: string }) =>
    apiPost<{ success: boolean }>(API_ROUTES.auth.verify, payload),
  bindEmail: (payload: { email: string }) =>
    apiPost<{ success: boolean }>(API_ROUTES.auth.bindEmail, payload),
  requestEmailSignIn: (payload: { email: string, callbackUrl?: string }) =>
    apiPost<{ ok?: boolean, url?: string }>(API_ROUTES.auth.emailSignIn, payload),
  signInWithLoginToken: (payload: { loginToken: string, callbackUrl?: string }) =>
    apiPost<{ ok?: boolean, url?: string, user?: AuthUser }>(API_ROUTES.auth.credentialsSignIn, payload),
  signOut: () => apiPost<{ ok?: boolean }>(API_ROUTES.auth.signOut, {}),
  getPasskeyOptions: (email?: string) =>
    apiGet<Record<string, unknown>>(API_ROUTES.passkeys.options, email ? { email } : undefined),
  verifyPasskey: (credential: Record<string, unknown>) =>
    apiPost<{ token: string, userVerified?: boolean }>(API_ROUTES.passkeys.verify, { credential }),
  getPasskeyRegisterOptions: () =>
    apiPost<Record<string, unknown>>(API_ROUTES.passkeys.registerOptions, {}),
  verifyPasskeyRegistration: (credential: Record<string, unknown>) =>
    apiPost<{ success: boolean }>(API_ROUTES.passkeys.registerVerify, { credential }),

  // ─── Device Auth ──────────────────────────────────────────────────────────
  getDeviceAuthInfo: (code: string) =>
    apiGet<DeviceAuthInfoResponse>(API_ROUTES.deviceAuth.info, { code }),
  approveDeviceAuth: (payload: { code: string, grantType?: 'short' | 'long' }) =>
    apiPost<{ ok: boolean }>(API_ROUTES.deviceAuth.approve, payload),
  cancelDeviceAuth: (payload: { code: string }) =>
    apiPost<{ ok: boolean }>(API_ROUTES.deviceAuth.cancel, payload),
  sendDeviceAuthPresence: (payload: { code: string, state: 'opened' | 'heartbeat' | 'closed' }) =>
    apiPost<{ ok: boolean, status?: string }>(API_ROUTES.deviceAuth.presence, payload),

  // ─── Account, Security, Privacy, PATs ─────────────────────────────────────
  exportMyData: () => apiGet<Record<string, unknown>>(API_ROUTES.account.exportData),
  deleteMyAccount: (payload: { confirm: string }) =>
    apiDelete<{ deleted?: boolean, success?: boolean }>(API_ROUTES.account.deleteMe, payload),
  getPrivacySettings: () => apiGet<{ settings: PrivacySettings }>(API_ROUTES.account.privacySettings),
  updatePrivacySettings: (settings: PrivacySettings) =>
    apiPatch<{ settings: PrivacySettings }>(API_ROUTES.account.privacySettings, settings),
  getSecuritySettings: () => apiGet<{ settings: SecuritySettings }>(API_ROUTES.account.securitySettings),
  updateSecuritySettings: (settings: Partial<SecuritySettings>) =>
    apiPatch<{ settings: SecuritySettings }>(API_ROUTES.account.securitySettings, settings),
  listApiKeys: () => apiGet<{ keys: ApiKeyItem[] }>(API_ROUTES.account.apiKeys),
  createApiKey: (payload: { name: string, scopes: string[], expiresInDays?: number }) =>
    apiPost<{ key: ApiKeyItem, message?: string }>(API_ROUTES.account.apiKeys, payload),
  deleteApiKey: (id: string) =>
    apiDelete<{ success?: boolean }>(API_ROUTES.account.apiKeyById(id)),

  // ─── Devices & Sync Storage ───────────────────────────────────────────────
  listDevices: () => apiGet<ConnectedDevice[] | { devices: ConnectedDevice[] }>(API_ROUTES.devices.list),
  renameDevice: (payload: { deviceId: string, name: string }) =>
    apiPost<{ success?: boolean }>(API_ROUTES.devices.rename, payload),
  trustDevice: (payload: { deviceId: string, trusted: boolean }) =>
    apiPost<{ success?: boolean }>(API_ROUTES.devices.trust, payload),
  revokeDevice: (payload: { deviceId: string }) =>
    apiPost<{ success?: boolean }>(API_ROUTES.devices.revoke, payload),
  getStorageStatus: () => apiGet<StorageStatusResponse>(API_ROUTES.storage.status),
  listStorageSessions: (params?: { page?: number, limit?: number }) =>
    apiGet<{ sessions?: SyncSessionItem[], items?: SyncSessionItem[], pagination?: PaginationMeta, total?: number }>(
      API_ROUTES.storage.sessions,
      params,
    ),

  // ─── Plugins & Signing Keys ───────────────────────────────────────────────
  listMyPlugins: (params?: { status?: string }) =>
    apiGet<{ plugins: DashboardPluginItem[], total?: number }>(API_ROUTES.plugins.list, params),
  createPlugin: (formData: FormData) =>
    apiPost<{ plugin: DashboardPluginItem }>(API_ROUTES.plugins.create, formData),
  updatePlugin: (id: string, formData: FormData) =>
    apiPatch<{ plugin: DashboardPluginItem }>(API_ROUTES.plugins.byId(id), formData),
  deletePlugin: (id: string) =>
    apiDelete<{ success?: boolean }>(API_ROUTES.plugins.byId(id)),
  setPluginStatus: (id: string, payload: { status: string, reason?: string }) =>
    apiPatch<{ plugin: DashboardPluginItem }>(API_ROUTES.plugins.status(id), payload),
  publishPluginVersion: (id: string, formData: FormData) =>
    apiPost<{ version: unknown }>(API_ROUTES.plugins.versions(id), formData),
  deletePluginVersion: (id: string, versionId: string) =>
    apiDelete<{ success?: boolean }>(API_ROUTES.plugins.versionById(id, versionId)),
  listSigningKeys: () =>
    apiGet<{ keys?: SigningKeyItem[], items?: SigningKeyItem[] }>(API_ROUTES.plugins.signingKeys),
  registerSigningKey: (payload: { keyId: string, publicKeyPem: string, validFrom: string, validUntil?: string }) =>
    apiPost<{ key?: SigningKeyItem }>(API_ROUTES.plugins.signingKeys, payload),
  revokeSigningKey: (keyId: string) =>
    apiDelete<{ key?: SigningKeyItem }>(API_ROUTES.plugins.signingKeyById(keyId)),

  // ─── Team & Invitations ───────────────────────────────────────────────────
  getTeamOverview: () => apiGet<DashboardTeamResponse>(API_ROUTES.team.overview),
  createTeam: (payload: { name: string }) =>
    apiPost<DashboardTeamResponse>(API_ROUTES.team.create, payload),
  disbandTeam: () => apiPost<{ disbanded?: boolean, success?: boolean }>(API_ROUTES.team.disband, {}),
  listTeamInvites: () => apiGet<{ invites: TeamInviteItem[] }>(API_ROUTES.team.invites),
  createTeamInvite: (payload: { target: string, role: 'admin' | 'member', expiresInDays?: number }) =>
    apiPost<{ invite: TeamInviteItem }>(API_ROUTES.team.invites, payload),
  revokeTeamInvite: (id: string) =>
    apiDelete<{ success?: boolean }>(API_ROUTES.team.inviteById(id)),
  getTeamCreditsUsage: () =>
    apiGet<{
      scope?: string
      month?: string
      totalUsed?: number
      totalQuota?: number
      used?: number
      totalCredits?: number
      users?: Array<Record<string, unknown>>
    }>(
      API_ROUTES.team.creditsUsage,
    ),
  listMyInvitations: () =>
    apiGet<{ invitations?: ReceivedTeamInvitation[], invites?: ReceivedTeamInvitation[] }>(API_ROUTES.team.invitations),
  getInvitationDetail: (id: string) =>
    apiGet<{ invitation?: ReceivedTeamInvitation, invite?: ReceivedTeamInvitation }>(API_ROUTES.team.invitationById(id)),
  acceptInvitation: (id: string, loginToken?: string) =>
    apiPost<{ joined: boolean, team?: { id: string, name: string, role: string } }>(
      API_ROUTES.team.acceptInvitation(id),
      {},
      loginToken ? { 'x-login-token': loginToken } : undefined,
    ),

  // ─── Credits & Subscriptions (ZERO checkin!) ──────────────────────────────
  getSubscriptionStatus: () => apiGet<SubscriptionStatusResponse>(API_ROUTES.credits.subscriptionStatus),
  activateSubscriptionCode: (payload: { code: string }) =>
    apiPost<{ plan?: string, expiresAt?: string | null }>(API_ROUTES.credits.subscriptionActivate, payload),
  getCreditSummary: () => apiGet<CreditSummaryResponse>(API_ROUTES.credits.summary),
  listCreditLedger: (params?: { page?: number, limit?: number }) =>
    apiGet<{ entries?: CreditLedgerEntry[], items?: CreditLedgerEntry[], pagination?: PaginationMeta, total?: number }>(
      API_ROUTES.credits.ledger,
      params,
    ),
  getCreditPricing: () => apiGet<{ unit?: string, rules?: CreditPricingRule[], pricing?: CreditPricingRule[] }>(
    API_ROUTES.credits.pricing,
  ),
  claimCreditCode: (payload?: { code?: string }) =>
    apiPost<{ claimed?: boolean, delta?: number, summary?: CreditSummaryResponse }>(
      API_ROUTES.credits.claim,
      payload ?? {},
    ),

  // ─── Slim Notifications & WebPush (4 endpoints) ───────────────────────────
  listNotifications: (params?: { page?: number, limit?: number, status?: 'all' | 'unread' | 'read' }) =>
    apiGet<NotificationsListResponse>(API_ROUTES.notifications.list, params),
  markNotificationsRead: (payload: { ids?: string[], all?: boolean }) =>
    apiPost<{ ok?: boolean, updated?: number, unreadCount?: number }>(API_ROUTES.notifications.read, payload),
  listPushSubscriptions: () =>
    apiGet<{ subscriptions?: PushSubscriptionItem[], items?: PushSubscriptionItem[], vapidPublicKey?: string | null, enabled?: boolean }>(API_ROUTES.notifications.push),
  subscribePush: (payload: { endpoint: string, keys: { p256dh: string, auth: string }, deviceLabel?: string }) =>
    apiPost<{ ok?: boolean, subscription?: PushSubscriptionItem }>(API_ROUTES.notifications.push, payload),
  unsubscribePush: (id: string) =>
    apiDelete<{ success?: boolean, ok?: boolean }>(API_ROUTES.notifications.pushById(id)),

  // ─── Admin: Usage Analytics (6 dimensions) ────────────────────────────────
  getAdminUsage: (days = 30) => apiGet<AdminUsageResponse>(API_ROUTES.admin.usage, { days }),

  // ─── Admin: Users ─────────────────────────────────────────────────────────
  listAdminUsers: (params: { page?: number, limit?: number, q?: string, role?: string, status?: string }) =>
    apiGet<{ users: AdminUserItem[], pagination: PaginationMeta }>(API_ROUTES.admin.users, params),
  updateAdminUserRole: (id: string, role: 'admin' | 'user') =>
    apiPatch<{ user: AdminUserItem }>(API_ROUTES.admin.userRole(id), { role }),
  updateAdminUserStatus: (id: string, status: 'active' | 'disabled') =>
    apiPatch<{ user: AdminUserItem }>(API_ROUTES.admin.userStatus(id), { status }),

  // ─── Admin: Store & Plugin Review ─────────────────────────────────────────
  listPendingPlugins: () =>
    apiGet<{ pendingPlugins: DashboardPluginItem[], pluginsWithPendingVersions: DashboardPluginItem[] }>(
      API_ROUTES.admin.pendingPlugins,
    ),
  listAdminStorePlugins: (params?: { page?: number, limit?: number, q?: string, status?: string }) =>
    apiGet<{ plugins: DashboardPluginItem[], pagination: PaginationMeta }>(API_ROUTES.admin.storePlugins, params),
  updateAdminStorePluginStatus: (id: string, payload: { status: string, reason?: string }) =>
    apiPatch<{ plugin: DashboardPluginItem }>(API_ROUTES.admin.storePluginStatus(id), payload),
  listPendingStoreReviews: (params?: { limit?: number, offset?: number }) =>
    apiGet<{ reviews: AdminStoreReviewItem[], total: number, limit: number, offset: number }>(
      API_ROUTES.admin.pendingReviews,
      params,
    ),
  updateStoreReviewStatus: (id: string, status: 'approved' | 'rejected') =>
    apiPatch<{ review: AdminStoreReviewItem }>(API_ROUTES.admin.reviewStatus(id), { status }),

  // ─── Admin: Releases, Updates & Exchange ──────────────────────────────────
  listReleases: (params?: { channel?: string, status?: string, limit?: number, assets?: string }) =>
    apiGet<{ releases: ReleaseItem[], pageInfo?: { hasMore: boolean, nextCursor: string | null } }>(
      API_ROUTES.admin.releases,
      params,
    ),
  createRelease: (payload: {
    tag: string
    name: string
    version: string
    channel: string
    rollbackFromVersion: string
    rollbackCompatible: boolean
    notes: { en: string, zh: string }
  }) => apiPost<{ release: ReleaseItem }>(API_ROUTES.admin.releases, payload),
  updateRelease: (tag: string, payload: {
    name?: string
    channel?: string
    notes?: { en: string, zh: string }
    status?: string
  }) => apiPatch<{ release: ReleaseItem }>(API_ROUTES.admin.releaseByTag(tag), payload),
  publishRelease: (tag: string) =>
    apiPost<{ release: ReleaseItem, message?: string }>(API_ROUTES.admin.publishRelease(tag), {}),
  deleteRelease: (tag: string) =>
    apiDelete<{ success?: boolean }>(API_ROUTES.admin.releaseByTag(tag)),
  listUpdates: (params?: { scope?: string, channel?: string }) =>
    apiGet<{ updates: UpdateAnnouncementItem[] }>(API_ROUTES.admin.updates, params),
  createUpdate: (payload: {
    type: 'news' | 'announcement'
    scope: 'web' | 'system' | 'both'
    channels: string[]
    releaseTag: string | null
    title: { en: string, zh: string }
    summary: { en: string, zh: string }
    timestamp: string
    link: string
    tags: string[]
  }) => apiPost<{ update: UpdateAnnouncementItem }>(API_ROUTES.admin.updates, payload),
  updateAnnouncement: (id: string, payload: {
    type?: 'news' | 'announcement'
    scope?: 'web' | 'system' | 'both'
    channels?: string[]
    title?: { en: string, zh: string }
    summary?: { en: string, zh: string }
    timestamp?: string
    link?: string
    tags?: string[]
  }) => apiPatch<{ update: UpdateAnnouncementItem }>(API_ROUTES.admin.updateById(id), payload),
  deleteAnnouncement: (id: string) =>
    apiDelete<{ success?: boolean }>(API_ROUTES.admin.updateById(id)),
  getExchangeLatest: () => apiGet<ExchangeLatestResponse>(API_ROUTES.admin.exchangeLatest),
  refreshExchangeRates: () => apiPost<{ ok: boolean, source?: string, snapshot?: Record<string, unknown> }>(
    API_ROUTES.admin.exchangeRefresh,
    {},
  ),

  // ─── Admin: Unified AI Gateway ────────────────────────────────────────────
  listAiProviders: (params?: { vendor?: string, status?: string, ownerScope?: string }) =>
    apiGet<{ providers: AdminAiProvider[], adapters?: unknown[] }>(API_ROUTES.admin.aiProviders, params),
  createAiProvider: (payload: {
    name: string
    displayName?: string
    vendor: string
    endpoint?: string
    authType?: string
    status?: 'enabled' | 'disabled'
    capabilities: Array<{ capability: string }>
    metadata?: Record<string, unknown>
    quota?: Record<string, unknown> | null
    credentials?: Record<string, unknown>
  }) => apiPost<{ provider: AdminAiProvider }>(API_ROUTES.admin.aiProviders, payload),
  updateAiProvider: (id: string, payload: {
    name?: string
    displayName?: string
    vendor?: string
    endpoint?: string | null
    authType?: string
    status?: 'enabled' | 'disabled'
    capabilities?: Array<{ capability: string }>
    metadata?: Record<string, unknown>
    quota?: Record<string, unknown> | null
    credentials?: Record<string, unknown>
  }) => apiPatch<{ provider: AdminAiProvider }>(API_ROUTES.admin.aiProviderById(id), payload),
  deleteAiProvider: (id: string) =>
    apiDelete<{ success?: boolean }>(API_ROUTES.admin.aiProviderById(id)),
  checkAiProvider: (id: string) =>
    apiPost<{ success?: boolean, ok?: boolean, latency?: number, latencyMs?: number, message?: string, error?: { code?: string, message?: string } | string }>(
      API_ROUTES.admin.aiProviderCheck(id),
      {},
    ),
  listAiScenes: () => apiGet<{ scenes: AdminAiScene[] }>(API_ROUTES.admin.aiScenes),
  upsertAiScene: (payload: {
    id: string
    displayName?: string
    owner?: string
    ownerScope?: string
    status: 'enabled' | 'disabled'
    requiredCapabilities: string[]
    fallback?: 'enabled' | 'disabled'
    bindings: AdminAiSceneBinding[]
  }) => apiPut<{ scene: AdminAiScene }>(API_ROUTES.admin.aiScenes, payload),
  deleteAiScene: (id: string) =>
    apiDelete<{ success?: boolean }>(API_ROUTES.admin.aiSceneById(id)),
  getAiUsage: (params?: { days?: number, providerId?: string }) =>
    apiGet<AdminAiUsageResponse>(API_ROUTES.admin.aiUsage, params),

  // ─── Admin: Credits, Codes & Subscriptions ────────────────────────────────
  listAdminCreditPricing: () =>
    apiGet<{ unit: string, rules: CreditPricingRule[] }>(API_ROUTES.admin.creditsPricing),
  updateAdminCreditPricing: (payload: {
    capability: string
    creditsPerUnit?: number
    minCredits?: number
    reserveMultiplier?: number
    upstreamCostUsdPerUnit?: number | null
    active?: boolean
  }) => apiPatch<{ rule: CreditPricingRule }>(API_ROUTES.admin.creditsPricing, payload),
  listAdminCreditLedger: (params: { page?: number, limit?: number, q?: string }) =>
    apiGet<{ entries: CreditLedgerEntry[], pagination: PaginationMeta }>(API_ROUTES.admin.creditsLedger, params),
  listAdminCodes: (params: { page?: number, limit?: number, q?: string, plan?: string, status?: string }) =>
    apiGet<{ codes: ActivationCodeItem[], pagination: PaginationMeta }>(API_ROUTES.admin.codes, params),
  generateAdminCodes: (payload: {
    plan: string
    durationDays: number
    maxUses?: number
    expiresInDays?: number
    count: number
  }) => apiPost<{ success: boolean, codes: ActivationCodeItem[] }>(API_ROUTES.admin.generateCodes, payload),
  updateAdminCodeStatus: (id: string, status: 'active' | 'revoked') =>
    apiPatch<{ code: ActivationCodeItem }>(API_ROUTES.admin.codeById(id), { status }),
  listAdminSubscriptions: (params: { page?: number, limit?: number, q?: string, status?: string, role?: string }) =>
    apiGet<{ subscriptions: AdminSubscriptionItem[], pagination: PaginationMeta }>(
      API_ROUTES.admin.subscriptions,
      params,
    ),
  grantAdminSubscription: (payload: { email?: string, userId?: string, plan: string, durationDays: number }) =>
    apiPost<{ userId: string, plan: string, expiresAt: string | null }>(API_ROUTES.admin.grantSubscription, payload),
}
