import type { EvidenceSource as PlatformGovernanceReportEvidenceStatus } from '~/types/docs-engagement'

export type GovernanceConfigType =
  | 'analytics_collection'
  | 'storage_channel'
  | 'notification_channel'
  | 'intelligence_provider_quota'
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'muted'
export type StoragePolicyEvaluationStatus = 'ok' | 'warning' | 'blocked' | 'disabled'
export type StorageChannelPressureStatus = StoragePolicyEvaluationStatus | 'unmanaged'
export type StorageActionQueuePriority = 'critical' | 'high' | 'medium' | 'low'
export type StorageActionQueueSuggestedAction =
  | 'configure-policy'
  | 'increase-storage-limit'
  | 'increase-traffic-limit'
  | 'increase-operation-limit'
  | 'review-burn-rate'
  | 'monitor-channel'
export type StorageSmokeEvidenceMode = 'dry-run' | 'write' | 'unknown'
export type StorageSmokeEvidenceStatus = 'ready' | 'sent' | 'failed'
export type ProviderQuotaStatus = 'ok' | 'warning' | 'blocked' | 'disabled'
export type ProviderQuotaRiskReason = 'blocked' | 'warning-threshold' | 'overage' | 'low-remaining' | 'projected-exhaustion'
export type ProviderQuotaActionQueuePriority = 'critical' | 'high' | 'medium' | 'low'
export type ProviderQuotaActionQueueSuggestedAction =
  | 'increase-token-limit'
  | 'increase-request-limit'
  | 'reduce-provider-traffic'
  | 'split-provider-channel'
  | 'enable-provider-quota'
  | 'set-provider-limit'
  | 'monitor-burn-rate'
export type ProviderQuotaActionQueueReason =
  | 'token-overage'
  | 'request-overage'
  | 'token-exhausted'
  | 'request-exhausted'
  | 'warning-threshold'
  | 'projected-exhaustion'
  | 'quota-disabled'
  | 'missing-hard-limit'
export type ProviderQuotaSmokeMode = 'dry-run' | 'consume'
export type ProviderQuotaSmokeStatus = 'allowed' | 'blocked' | 'consumed' | 'failed'
export type StorageAlertMetric = 'storedBytes' | 'trafficBytes' | 'operations'
export type StorageAlertLimitKey = 'maxBytes' | 'trafficBytes' | 'maxOperations' | 'alertBytes'
export type PlatformGovernanceD1ReadinessStatus = 'ready' | 'warning' | 'blocked'
export type PlatformGovernanceReportStatus = 'ok' | 'watch' | 'critical'
export type PlatformGovernanceReportPriority = 'critical' | 'high' | 'medium' | 'low'

export interface GovernanceSummary {
  totalEvents: number
  totalQuantity: number
  uniqueActors: number
  byAction: Array<{ action: string, events: number, quantity: number, uniqueActors: number }>
  byChannel: Array<{ channel: string, events: number, quantity: number }>
  byUnit: Array<{ unit: string, quantity: number }>
  timeline: Array<{ date: string, events: number, quantity: number }>
  topResources: Array<{
    resourceType: string
    resourceId: string
    action: string
    events: number
    quantity: number
    uniqueActors: number
  }>
  generatedAt: string
}

export interface GovernanceMetric {
  key: string
  events: number
  quantity: number
  uniqueActors: number
}

export interface GovernanceSearchPluginPreferenceByTimeSlot {
  slot: string
  plugins: GovernanceMetric[]
  selectedPlugins: GovernanceMetric[]
}

export interface GovernanceSearchPluginPreferenceByContext {
  key: string
  contextAppCategory: string
  contextSource: string
  localTimeSlot: string
  events: number
  selected: number
  selectionRate: number
  uniqueActors: number
  plugins: GovernanceMetric[]
  selectedPlugins: GovernanceMetric[]
}

export interface GovernanceSearchContextSelectionMatrixItem {
  key: string
  contextAppCategory: string
  contextSource: string
  localTimeSlot: string
  selectedCategory: string
  events: number
  selected: number
  selectionRate: number
  uniqueActors: number
  plugins: GovernanceMetric[]
  selectedPlugins: GovernanceMetric[]
}

export interface GovernanceSearchJourneySegment {
  key: string
  contextAppCategory: string
  contextSource: string
  localTimeSlot: string
  sessionBucket: string
  userPreferenceMode: string
  entryPoint: string
  triggerType: string
  events: number
  withFilters: number
  withResults: number
  selected: number
  zeroResult: number
  providerProblem: number
  providerErrors: number
  providerTimeouts: number
  filterRate: number
  withResultsRate: number
  selectionRate: number
  zeroResultRate: number
  problemRate: number
  uniqueActors: number
  scenes: GovernanceMetric[]
  providers: GovernanceMetric[]
  plugins: GovernanceMetric[]
  selectedPlugins: GovernanceMetric[]
}

export interface GovernanceSearchJourney {
  total: number
  withFilters: number
  withResults: number
  selected: number
  zeroResult: number
  providerProblem: number
  providerErrors: number
  providerTimeouts: number
  filterRate: number
  withResultsRate: number
  selectionRate: number
  zeroResultRate: number
  problemRate: number
  segments: GovernanceSearchJourneySegment[]
}

export interface GovernanceSearchFrequencyCohort {
  cohort: string
  users: number
  searches: number
  quantity: number
  activeDays: number
  avgSearchesPerUser: number
  avgActiveDaysPerUser: number
  selectionRate: number
  zeroResultRate: number
  problemRate: number
  topLocalTimeSlots: GovernanceMetric[]
  topUserPreferenceModes: GovernanceMetric[]
  topContextAppCategories: GovernanceMetric[]
  topPlugins: GovernanceMetric[]
  selectedPlugins: GovernanceMetric[]
}

export interface GovernanceTrendPoint {
  date: string
  events: number
  quantity: number
  uniqueActors: number
}

export interface GovernanceGrowthTrendPoint extends GovernanceTrendPoint {
  cumulative: number
  growthRate: number
}

export interface GovernanceHeatmapPoint {
  dayOfWeek: number
  hour: string
  events: number
  quantity: number
  uniqueActors: number
}

export interface GovernanceSearchTimeHeatmapPoint extends GovernanceHeatmapPoint {
  timeSlot: string
  selected: number
  selectionRate: number
  zeroResult: number
  zeroResultRate: number
  providerProblem: number
  problemRate: number
  providerErrors: number
  providerTimeouts: number
  topContextAppCategories: GovernanceMetric[]
  topContextSources: GovernanceMetric[]
  topPlugins: GovernanceMetric[]
  selectedPlugins: GovernanceMetric[]
}

export interface GovernanceNumberStat {
  count: number
  average: number
  max: number
}

export interface StorageUsageBreakdown {
  key: string
  events: number
  storedBytes: number
  trafficBytes: number
  operations: number
  writes: number
  reads: number
  deletes: number
  uniqueActors: number
}

export interface UploadSceneAssetHealthItem {
  key: string
  sceneId: string | null
  capability: string | null
  providerId: string | null
  assetKind: string | null
  resourceType: string
  storageChannel: string | null
  storageProvider: string | null
  surface: string
  started: number
  completed: number
  failed: number
  bytes: number
  failureRate: number
  avgDurationMs: number
  avgSize: number
  latestAt: string
  failureReasons: Array<{ key: string, events: number }>
  statusCodes: Array<{ key: string, events: number }>
}

export interface StorageUsageTrendPoint {
  date: string
  events: number
  storedBytes: number
  trafficBytes: number
  operations: number
  writes: number
  reads: number
  deletes: number
  uniqueActors: number
}

export interface StorageSmokeEvidenceItem {
  key: string
  policyId: string | null
  policyName: string | null
  channel: string | null
  provider: string | null
  mode: StorageSmokeEvidenceMode
  status: StorageSmokeEvidenceStatus
  reason: string | null
  operations: string[]
  bytesWritten: number
  bytesRead: number
  credentialRequired: boolean | null
  hasCredentialRef: boolean | null
  hasCredential: boolean | null
  latestAt: string
  events: number
  ready: number
  sent: number
  failed: number
  uniqueActors: number
}

export interface StorageChannelPressure {
  channel: string
  provider: string | null
  events: number
  storedBytes: number
  trafficBytes: number
  operations: number
  writes: number
  reads: number
  deletes: number
  uniqueActors: number
  pressureStatus: StorageChannelPressureStatus
  policyId: string | null
  policyName: string | null
  matchedPolicies: number
  policyAlerts: number
  policyReasons: string[]
  highestUtilization: number
  remaining: {
    storedBytes: number | null
    trafficBytes: number | null
    operations: number | null
    alertBytes: number | null
  }
  overage: {
    storedBytes: number
    trafficBytes: number
    operations: number
    alertBytes: number
  }
  burnRate: {
    storedBytesPerDay: number
    trafficBytesPerDay: number
    operationsPerDay: number
  }
  projectedExhaustionDays: {
    storedBytes: number | null
    trafficBytes: number | null
    operations: number | null
    alertBytes: number | null
  }
  trend: StorageUsageTrendPoint[]
}

export interface StorageActionQueueItem {
  key: string
  priority: StorageActionQueuePriority
  suggestedAction: StorageActionQueueSuggestedAction
  reason: string
  channel: string
  provider: string | null
  policyId: string | null
  policyName: string | null
  pressureStatus: StorageChannelPressureStatus
  events: number
  storedBytes: number
  trafficBytes: number
  operations: number
  writes: number
  reads: number
  deletes: number
  uniqueActors: number
  highestUtilization: number
  policyAlerts: number
  policyReasons: string[]
  remaining: {
    storedBytes: number | null
    trafficBytes: number | null
    operations: number | null
    alertBytes: number | null
  }
  overage: {
    storedBytes: number
    trafficBytes: number
    operations: number
    alertBytes: number
  }
  burnRate: {
    storedBytesPerDay: number
    trafficBytesPerDay: number
    operationsPerDay: number
  }
  projectedExhaustionDays: {
    storedBytes: number | null
    trafficBytes: number | null
    operations: number | null
    alertBytes: number | null
  }
  latestTrendDate: string | null
}

export interface ProviderQuotaRiskItem {
  configId: string
  providerId: string
  name: string
  channel: string | null
  provider: string | null
  status: ProviderQuotaStatus
  highestUtilization: number
  riskReason: ProviderQuotaRiskReason
  usage: {
    requests: number
    tokens: number
  }
  limits: {
    maxRequests: number | null
    maxTokens: number | null
  }
  remaining: {
    requests: number | null
    tokens: number | null
  }
  overage: {
    requests: number
    tokens: number
  }
  projectedExhaustionDays: {
    requests: number | null
    tokens: number | null
  }
}

export interface ProviderQuotaActionQueueItem {
  key: string
  priority: ProviderQuotaActionQueuePriority
  suggestedAction: ProviderQuotaActionQueueSuggestedAction
  reason: ProviderQuotaActionQueueReason
  configId: string
  providerId: string
  name: string
  channel: string | null
  provider: string | null
  status: ProviderQuotaStatus
  windowDays: number
  requests: number
  tokens: number
  maxRequests: number | null
  maxTokens: number | null
  requestUtilization: number | null
  tokenUtilization: number | null
  remainingRequests: number | null
  remainingTokens: number | null
  requestOverage: number
  tokenOverage: number
  requestsPerDay: number
  tokensPerDay: number
  projectedRequestExhaustionDays: number | null
  projectedTokenExhaustionDays: number | null
}

export interface ProviderQuotaSmokeEvidenceItem {
  key: string
  providerId: string
  channel: string | null
  mode: ProviderQuotaSmokeMode
  status: ProviderQuotaSmokeStatus
  reason: string | null
  requestRecorded: boolean
  tokensRecorded: number
  latestAt: string
  events: number
  allowed: number
  blocked: number
  consumed: number
  failed: number
  uniqueActors: number
}

export interface GovernanceScopedAnalytics {
  totalEvents: number
  totalQuantity: number
  uniqueActors: number
  byHour: GovernanceMetric[]
  byChannel: GovernanceMetric[]
  byResource: GovernanceMetric[]
  timeline: Array<{ date: string, events: number, quantity: number }>
}

export interface GovernanceGrowth {
  previousEvents: number
  currentEvents: number
  eventGrowthRate: number
}

export type NotificationChannelRiskStatus = 'ok' | 'warning' | 'disabled'
export type NotificationChannelReadinessStatus = 'ready' | 'warning' | 'disabled'
export type NotificationChannelDisplayStatus = NotificationChannelRiskStatus | NotificationChannelReadinessStatus
export type NotificationDeliveryStatus = 'planned' | 'sent' | 'skipped' | 'failed'
export type NotificationActionQueuePriority = 'critical' | 'high' | 'medium' | 'low'
export type NotificationActionQueueSource = 'channel-config' | 'delivery-health'
export type NotificationActionQueueSuggestedAction =
  | 'enable-channel'
  | 'fix-channel-config'
  | 'bind-credential-ref'
  | 'configure-runtime'
  | 'configure-relay'
  | 'enable-send-mode'
  | 'investigate-failures'
  | 'review-skipped-deliveries'
  | 'monitor-provider'

export interface NotificationActionQueueItem {
  key: string
  source: NotificationActionQueueSource
  priority: NotificationActionQueuePriority
  suggestedAction: NotificationActionQueueSuggestedAction
  reason: string
  configId: string | null
  name: string | null
  channel: string | null
  provider: string | null
  providerType: string | null
  adapter: string | null
  status: NotificationChannelRiskStatus | 'delivery-risk'
  reasons: string[]
  enabled: boolean | null
  credentialRequired: boolean
  hasCredentialRef: boolean
  productionReady: boolean | null
  total: number
  planned: number
  sent: number
  skipped: number
  failed: number
  sentRate: number
  failureRate: number
  durationMs: GovernanceNumberStat
  latestFailureReason: string | null
  latestFailureStatusCode: number | null
  latestFailureAt: string | null
}

export interface NotificationTestEvidenceItem {
  key: string
  configId: string
  configName: string | null
  notificationAction: string | null
  channel: string | null
  provider: string | null
  providerType: string | null
  adapter: string | null
  status: NotificationDeliveryStatus
  reason: string | null
  durationMs: number | null
  statusCode: number | null
  latestAt: string
  events: number
  planned: number
  sent: number
  skipped: number
  failed: number
  uniqueActors: number
}

export interface NotificationDeliveryEvidenceItem {
  key: string
  configId: string | null
  configName: string | null
  notificationAction: string | null
  resourceType: string | null
  channel: string | null
  provider: string | null
  providerType: string | null
  adapter: string | null
  status: NotificationDeliveryStatus
  reason: string | null
  durationMs: number | null
  statusCode: number | null
  latestAt: string
  events: number
  planned: number
  sent: number
  skipped: number
  failed: number
  uniqueActors: number
}

export interface NotificationDeliveryAnalytics {
  channelSummary: {
    total: number
    enabled: number
    disabled: number
    unsupported: number
    credentialMissing: number
    credentialed: number
    productionReady: number
    runtimeMissing: number
    relayMissing: number
    sendModeMissing: number
  }
  providerMix: Array<{
    key: string
    channel: string
    providerType: string | null
    adapter: string
    total: number
    enabled: number
    productionReady: number
    warning: number
    disabled: number
    credentialMissing: number
    sendModeMissing: number
    relayMissing: number
    runtimeMissing: number
  }>
  channelRisks: Array<{
    configId: string
    name: string
    channel: string
    provider: string | null
    providerType: string | null
    adapter: string
    enabled: boolean
    status: NotificationChannelRiskStatus
    reasons: string[]
    credentialRequired: boolean
    hasCredentialRef: boolean
    readiness: {
      status: NotificationChannelReadinessStatus
      productionReady: boolean
      reasons: string[]
      sendMode: boolean
      requiresPublicRuntime: boolean
      hasPublicRuntime: boolean
      requiresRelayEndpoint: boolean
      hasRelayEndpoint: boolean
    }
  }>
  actionQueue: NotificationActionQueueItem[]
  deliveries: {
    total: number
    planned: number
    sent: number
    skipped: number
    failed: number
    plannedRate: number
    sentRate: number
    failureRate: number
    durationMs: GovernanceNumberStat
  }
  byDeliveryStatus: GovernanceMetric[]
  byProvider: GovernanceMetric[]
  byAdapter: GovernanceMetric[]
  byReason: GovernanceMetric[]
  byStatusCode: GovernanceMetric[]
  byNotificationAction: GovernanceMetric[]
  deliveryTrend: Array<GovernanceTrendPoint & {
    planned: number
    sent: number
    skipped: number
    failed: number
  }>
  providerHealth: Array<{
    provider: string
    providerType: string | null
    adapter: string | null
    channel: string | null
    total: number
    planned: number
    sent: number
    skipped: number
    failed: number
    sentRate: number
    failureRate: number
    durationMs: GovernanceNumberStat
    latestFailureReason: string | null
    latestFailureStatusCode: number | null
    latestFailureAt: string | null
  }>
  deliveryEvidence: NotificationDeliveryEvidenceItem[]
  testEvidence: NotificationTestEvidenceItem[]
  browserPushSubscriptions: {
    total: number
    registered: number
    deleted: number
    byAction: GovernanceMetric[]
    byEndpointHost: GovernanceMetric[]
    trend: GovernanceTrendPoint[]
  }
}

export interface PluginLeaderboardItem {
  pluginId: string
  downloads: number
  installs: number
  invocations: number
  hotScore: number
  growth: {
    previousScore: number
    currentScore: number
    growthRate: number
  }
  events: number
  uniqueActors: number
  topCountries: Array<{ countryCode: string, events: number }>
  topRegions: Array<{ regionCode: string, events: number }>
  topChannels: Array<{ channel: string, events: number }>
  byAction: Array<{ action: string, events: number, quantity: number }>
}

export interface ProviderModelDistributionItem {
  model: string
  requests: number
  tokens: number
  quantity: number
  uniqueActors: number
  byProvider: Array<{ providerId: string, quantity: number }>
  byChannel: Array<{ channel: string, quantity: number }>
  byProviderType: Array<{ providerType: string, quantity: number }>
}

export interface ProviderLeaderboardItem {
  providerId: string
  requests: number
  tokens: number
  quantity: number
  uniqueActors: number
  byUnit: Array<{ unit: string, quantity: number }>
  byChannel: Array<{ channel: string, quantity: number }>
  byModel: Array<{ model: string, tokens: number }>
}

export interface ProviderChannelDistributionItem {
  providerId: string
  channel: string
  requests: number
  tokens: number
  quantity: number
  uniqueActors: number
  byModel: Array<{ model: string, tokens: number }>
  byProviderType: Array<{ providerType: string, quantity: number }>
}

export interface ProviderModelChannelDistributionItem {
  model: string
  channel: string
  requests: number
  tokens: number
  quantity: number
  uniqueActors: number
  byProvider: Array<{ providerId: string, quantity: number }>
  byProviderType: Array<{ providerType: string, quantity: number }>
}

export interface GovernanceOperationsTimelinePoint {
  date: string
  userSignups: number
  userSignupGrowthRate: number
  userCumulative: number
  searches: number
  searchSelected: number
  searchSelectionRate: number
  searchProblems: number
  searchProblemRate: number
  searchZeroResultRate: number
  pluginDownloads: number
  pluginInstalls: number
  pluginInvocations: number
  providerRequests: number
  providerTokens: number
  uploadStarted: number
  uploadCompleted: number
  uploadFailed: number
  uploadFailureRate: number
  uploadBytes: number
  storageOperations: number
  storageBytes: number
  riskScore: number
}

export interface GovernanceAnalytics {
  days: number
  generatedAt: string
  dashboard: {
    growth: {
      userSignups: {
        total: number
        latestDate: string | null
        latestQuantity: number
        cumulative: number
        growthRate: number
      }
      searches: {
        total: number
        latestDate: string | null
        latestQuantity: number
        growthRate: number
        zeroResultRate: number
        problemRate: number
        selectionRate: number
      }
      pluginInstalls: {
        total: number
        latestDate: string | null
        latestQuantity: number
        growthRate: number
      }
      providerUsage: {
        requests: number
        tokens: number
        latestDate: string | null
        latestRequests: number
        latestTokens: number
      }
      uploads: {
        latestDate: string | null
        latestStarted: number
        latestCompleted: number
        latestFailed: number
        failureRate: number
        stuckRate: number
      }
    }
    leaderboards: {
      hotPlugins: PluginLeaderboardItem[]
      topModels: ProviderModelDistributionItem[]
      topProviders: ProviderLeaderboardItem[]
    }
    riskSummary: {
      uploadProblems: number
      storageAlerts: number
      storageBlockedPolicies: number
      notificationRisks: number
      notificationFailedDeliveries: number
      providerQuotaBlocked: number
      providerQuotaWarning: number
    }
    trends: {
      userGrowth: GovernanceGrowthTrendPoint[]
      searches: GovernanceTrendPoint[]
      pluginInstalls: Array<GovernanceTrendPoint & { downloads: number, installs: number, invocations: number }>
      providerUsage: Array<GovernanceTrendPoint & { requests: number, tokens: number }>
      uploadStatus: Array<GovernanceTrendPoint & { started: number, completed: number, failed: number, bytes: number }>
      operationsTimeline: GovernanceOperationsTimelinePoint[]
    }
  }
  visits: GovernanceScopedAnalytics & {
    growth: GovernanceGrowth
    trend: GovernanceTrendPoint[]
    heatmap: GovernanceHeatmapPoint[]
    byRoute: GovernanceMetric[]
    byPage: GovernanceMetric[]
    bySurface: GovernanceMetric[]
    byReferrer: GovernanceMetric[]
    byLocalHour: GovernanceMetric[]
    byLocalTimeSlot: GovernanceMetric[]
    byLocalDayOfWeek: GovernanceMetric[]
    byCountry: GovernanceMetric[]
    byRegion: GovernanceMetric[]
    byTimezone: GovernanceMetric[]
  }
  users: GovernanceScopedAnalytics & {
    growth: GovernanceGrowth
    signups: number
    signupGrowth: GovernanceGrowth
    signupTrend: GovernanceTrendPoint[]
    signupGrowthTrend: GovernanceGrowthTrendPoint[]
    heatmap: GovernanceHeatmapPoint[]
    byAction: GovernanceMetric[]
    bySource: GovernanceMetric[]
    byCountry: GovernanceMetric[]
    byRegion: GovernanceMetric[]
    byTimezone: GovernanceMetric[]
  }
  searches: GovernanceScopedAnalytics & {
    growth: GovernanceGrowth
    trend: GovernanceTrendPoint[]
    heatmap: GovernanceHeatmapPoint[]
    timeHeatmap: GovernanceSearchTimeHeatmapPoint[]
    frequencyCohorts: GovernanceSearchFrequencyCohort[]
    byQueryType: GovernanceMetric[]
    byScene: GovernanceMetric[]
    byInputType: GovernanceMetric[]
    byProvider: GovernanceMetric[]
    byProviderLatency: GovernanceMetric[]
    byProviderResults: GovernanceMetric[]
    byResultCategory: GovernanceMetric[]
    byProviderStatus: GovernanceMetric[]
    byFilterKind: GovernanceMetric[]
    byFilterSource: GovernanceMetric[]
    byContextAppCategory: GovernanceMetric[]
    byContextSource: GovernanceMetric[]
    byEntryPoint: GovernanceMetric[]
    byTriggerType: GovernanceMetric[]
    byUserPreferenceMode: GovernanceMetric[]
    bySessionBucket: GovernanceMetric[]
    byPluginId: GovernanceMetric[]
    byPluginCategory: GovernanceMetric[]
    byContextTag: GovernanceMetric[]
    byLocalHour: GovernanceMetric[]
    byLocalDayOfWeek: GovernanceMetric[]
    byLocalTimeSlot: GovernanceMetric[]
    bySelectedProvider: GovernanceMetric[]
    bySelectedCategory: GovernanceMetric[]
    bySelectedPluginId: GovernanceMetric[]
    bySelectedRankBucket: GovernanceMetric[]
    byQueryLengthBucket: GovernanceMetric[]
    byResultCountBucket: GovernanceMetric[]
    byFirstResultLatencyBucket: GovernanceMetric[]
    byTotalDurationBucket: GovernanceMetric[]
    byCountry: GovernanceMetric[]
    byRegion: GovernanceMetric[]
    byTimezone: GovernanceMetric[]
    pluginPreferenceByTimeSlot: GovernanceSearchPluginPreferenceByTimeSlot[]
    pluginPreferenceByContext: GovernanceSearchPluginPreferenceByContext[]
    contextSelectionMatrix: GovernanceSearchContextSelectionMatrixItem[]
    journey: GovernanceSearchJourney
    filterUsage: {
      withFilters: number
      withoutFilters: number
      filterRate: number
    }
    selectionSummary: {
      selected: number
      selectionRate: number
    }
    reliabilitySummary: {
      total: number
      zeroResult: number
      providerErrors: number
      providerTimeouts: number
      problemSearches: number
      zeroResultRate: number
      problemRate: number
    }
    reliabilityTrend: Array<GovernanceTrendPoint & {
      selected: number
      selectionRate: number
      zeroResult: number
      providerErrors: number
      providerTimeouts: number
      problemSearches: number
    }>
    latency: {
      firstResultMs: GovernanceNumberStat
      totalDurationMs: GovernanceNumberStat
    }
    resultStats: {
      queryLength: GovernanceNumberStat
      resultCount: GovernanceNumberStat
      firstResultCount: GovernanceNumberStat
      providerErrorCount: GovernanceNumberStat
      providerTimeoutCount: GovernanceNumberStat
    }
  }
  plugins: GovernanceScopedAnalytics & {
    growth: GovernanceGrowth
    trend: Array<GovernanceTrendPoint & { downloads: number, installs: number, invocations: number }>
    installTrend: Array<GovernanceTrendPoint & { downloads: number, installs: number, invocations: number }>
    heatmap: GovernanceHeatmapPoint[]
    leaderboard: PluginLeaderboardItem[]
  }
  uploads: GovernanceScopedAnalytics & {
    started: number
    completed: number
    failed: number
    attempts: number
    stuckAttempts: number
    stuckAttemptAgeMs: number
    bytes: number
    failureRate: number
    stuckRate: number
    byExtension: GovernanceMetric[]
    byResourceType: GovernanceMetric[]
    byContentType: GovernanceMetric[]
    byStorageChannel: GovernanceMetric[]
    byStorageProvider: GovernanceMetric[]
    byFailureReason: GovernanceMetric[]
    byStatusCode: GovernanceMetric[]
    bySurface: GovernanceMetric[]
    sceneAssetHealth: UploadSceneAssetHealthItem[]
    pipelineSummary: Array<{
      key: string
      resourceType: string
      surface: string | null
      storageChannel: string | null
      storageProvider: string | null
      attempts: number
      started: number
      completed: number
      failed: number
      stuck: number
      pending: number
      completionRate: number
      failureRate: number
      stuckRate: number
      avgDurationMs: number
      avgSize: number
      latestAt: string
    }>
    failureMatrix: Array<{
      key: string
      resourceType: string
      surface: string | null
      storageChannel: string | null
      storageProvider: string | null
      reason: string
      disposition: 'retry-scheduled' | 'retry-exhausted' | 'retryable' | 'not-retryable' | 'unknown'
      statusCode: number | null
      events: number
      quantity: number
      uniqueActors: number
      latestAt: string
      retryable: number
      scheduled: number
      exhausted: number
      totalRetryCount: number
      nextRetryDelayMs: number | null
      calibrationStatus: 'verified' | 'sampled' | 'needs-calibration'
      sampleSource: 'live' | 'manual' | 'synthetic' | 'unknown'
      sampleCount: number
      latestSampleAt: string | null
      suggestedAction: 'retry-monitor' | 'storage-provider-check' | 'quota-policy-check' | 'payload-validation' | 'manual-investigation'
    }>
    actionQueue: Array<{
      key: string
      priority: 'critical' | 'high' | 'medium' | 'low'
      suggestedAction: 'retry-monitor' | 'storage-provider-check' | 'quota-policy-check' | 'payload-validation' | 'manual-investigation' | 'stuck-attempt-check'
      reason: string
      resourceType: string
      surface: string | null
      storageChannel: string | null
      storageProvider: string | null
      statusCode: number | null
      events: number
      failedAttempts: number
      stuckAttempts: number
      retryableFailures: number
      scheduledRetries: number
      exhaustedRetries: number
      sampleCount: number
      calibrationStatus: 'verified' | 'sampled' | 'needs-calibration' | 'unknown'
      sampleSource: 'live' | 'manual' | 'synthetic' | 'unknown'
      latestAt: string
      oldestAgeMs: number | null
      nextRetryDelayMs: number | null
      evidenceAttemptHashes: string[]
      evidenceResourceHashes: string[]
    }>
    retrySummary: {
      retryableFailures: number
      nonRetryableFailures: number
      scheduledRetries: number
      exhaustedFailures: number
      recoveredUploads: number
      recoveredRetryCount: number
      recoveredRetryRate: number
      calibratedFailureSamples: number
      verifiedFailureSamples: number
      liveFailureSamples: number
      manualFailureSamples: number
      calibrationCoverageRate: number
      retryCount: GovernanceNumberStat
      nextRetryDelayMs: GovernanceNumberStat
      recoveredAttempts: GovernanceNumberStat
    }
    byRetryDisposition: GovernanceMetric[]
    statusTrend: Array<GovernanceTrendPoint & {
      started: number
      completed: number
      failed: number
      bytes: number
    }>
    retryTrend: Array<GovernanceTrendPoint & {
      failed: number
      retryable: number
      scheduled: number
      exhausted: number
      recovered: number
    }>
    uploadSize: GovernanceNumberStat
    uploadDurationMs: GovernanceNumberStat
    recoveredEvidence: Array<{
      attemptHash: string
      resourceHash: string
      resourceType: string
      surface: string | null
      storageChannel: string | null
      storageProvider: string | null
      contentType: string | null
      durationMs: number | null
      size: number | null
      retryCount: number | null
      maxRetries: number | null
      attempts: number | null
      storageOperation: string | null
      storageStatusCode: number | null
      latestAt: string
    }>
    problemAttempts: Array<{
      attemptHash: string
      resourceHash: string
      status: 'failed' | 'stuck'
      resourceType: string
      surface: string | null
      storageChannel: string | null
      storageProvider: string | null
      contentType: string | null
      reason: string | null
      statusCode: number | null
      durationMs: number | null
      size: number | null
      retryable: boolean | null
      retryCount: number | null
      maxRetries: number | null
      nextRetryDelayMs: number | null
      latestAt: string
      ageMs: number | null
    }>
  }
  notifications: GovernanceScopedAnalytics & NotificationDeliveryAnalytics
  storage: GovernanceScopedAnalytics & {
    storedBytes: number
    trafficBytes: number
    operations: number
    writes: number
    reads: number
    deletes: number
    byChannelUsage: StorageUsageBreakdown[]
    byProviderUsage: StorageUsageBreakdown[]
    byResourceTypeUsage: StorageUsageBreakdown[]
    byActionUsage: StorageUsageBreakdown[]
    channelPressure: StorageChannelPressure[]
    actionQueue: StorageActionQueueItem[]
    smokeEvidence: StorageSmokeEvidenceItem[]
    trend: StorageUsageTrendPoint[]
    policySummary: {
      total: number
      active: number
      ok: number
      warning: number
      blocked: number
      disabled: number
      alerts: number
      highestStoredUtilization: number
      highestTrafficUtilization: number
      highestOperationUtilization: number
    }
    policyRisks: StoragePolicyEvaluation[]
  }
  providers: GovernanceScopedAnalytics & {
    growth: GovernanceGrowth
    usageSummary: {
      events: number
      requests: number
      tokens: number
    }
    trend: Array<GovernanceTrendPoint & {
      requests: number
      tokens: number
    }>
    byModel: GovernanceMetric[]
    byProviderType: GovernanceMetric[]
    channelDistribution: ProviderChannelDistributionItem[]
    modelDistribution: ProviderModelDistributionItem[]
    modelChannelDistribution: ProviderModelChannelDistributionItem[]
    quotaSummary: {
      total: number
      active: number
      blocked: number
      warning: number
      disabled: number
      highestRequestUtilization: number
      highestTokenUtilization: number
      requestOverage: number
      tokenOverage: number
      lowestRemainingRequests: number | null
      lowestRemainingTokens: number | null
      nearestRequestExhaustionDays: number | null
      nearestTokenExhaustionDays: number | null
    }
    quotaActionQueue: ProviderQuotaActionQueueItem[]
    quotaRiskItems: ProviderQuotaRiskItem[]
    quotaSmokeEvidence: ProviderQuotaSmokeEvidenceItem[]
    quotas: Array<{
      configId: string
      providerId: string
      name: string
      channel: string | null
      provider: string | null
      enabled: boolean
      windowDays: number
      status: ProviderQuotaStatus
      usage: {
        requests: number
        tokens: number
      }
      limits: {
        maxRequests: number | null
        maxTokens: number | null
        warningThreshold: number | null
      }
      utilization: {
        requests: number | null
        tokens: number | null
      }
      remaining: {
        requests: number | null
        tokens: number | null
      }
      overage: {
        requests: number
        tokens: number
      }
      burnRate: {
        requestsPerDay: number
        tokensPerDay: number
      }
      projectedExhaustionDays: {
        requests: number | null
        tokens: number | null
      }
    }>
    leaderboard: ProviderLeaderboardItem[]
  }
}

export interface GovernanceConfig {
  id: string
  configType: GovernanceConfigType
  name: string
  ownerScope: 'system' | 'workspace' | 'user'
  ownerId: string | null
  targetId: string | null
  channel: string | null
  provider: string | null
  enabled: boolean
  limits: Record<string, unknown> | null
  warningThreshold: number | null
  config: Record<string, unknown> | null
  createdBy?: string
  createdAt?: string
  updatedAt: string
}

export interface ConfigListResponse {
  configs: GovernanceConfig[]
  generatedAt: string
}

export interface PlatformGovernanceD1ReadinessCheck {
  id: string
  label: string
  status: PlatformGovernanceD1ReadinessStatus
  required: boolean
  reasons: string[]
  tables: string[]
  indexes: string[]
  missingTables: string[]
  missingIndexes: string[]
  observedCount: number | null
  minimumCount: number | null
}

export interface PlatformGovernanceD1Readiness {
  status: PlatformGovernanceD1ReadinessStatus
  database: {
    present: boolean
    binding: 'DB' | null
  }
  summary: {
    total: number
    ready: number
    warning: number
    blocked: number
    missingTables: number
    missingIndexes: number
    backfillRequired: number
  }
  checks: PlatformGovernanceD1ReadinessCheck[]
  generatedAt: string
}

export interface PlatformGovernanceReportScorecard {
  key: string
  label: string
  value: number
  total: number | null
  unit: string
  delta: number | null
  rate: number | null
  status: PlatformGovernanceReportStatus
  reason: string | null
}

export interface PlatformGovernanceReportRiskQueueItem {
  key: string
  area: 'search' | 'upload' | 'storage' | 'notification' | 'provider-quota'
  priority: PlatformGovernanceReportPriority
  suggestedAction: string
  reason: string
  status: string
  metric: number
  latestAt: string | null
  details: Record<string, string | number | boolean | null>
}

export interface PlatformGovernanceReportEvidenceItem {
  key: string
  label: string
  status: PlatformGovernanceReportEvidenceStatus
  evidenceCount: number
  blocker: string | null
}

export interface PlatformGovernanceReportSnapshot {
  days: number
  generatedAt: string
  report: {
    status: PlatformGovernanceReportStatus
    riskScore: number
    scorecards: PlatformGovernanceReportScorecard[]
    evidenceStatus: PlatformGovernanceReportEvidenceItem[]
    riskQueue: PlatformGovernanceReportRiskQueueItem[]
    leaderboards: {
      hotPlugins: PluginLeaderboardItem[]
      topModels: ProviderModelDistributionItem[]
      topProviders: ProviderLeaderboardItem[]
    }
    trendSummary: {
      latestDate: string | null
      operationsDays: number
      peakSearches: number
      peakPluginInstalls: number
      peakProviderTokens: number
      peakRiskScore: number
    }
  }
}

export interface StoragePolicyEvaluation {
  policyId: string
  name: string
  channel: string
  provider: string | null
  enabled: boolean
  days: number
  status: StoragePolicyEvaluationStatus
  reasons: string[]
  usage: {
    storedBytes: number
    trafficBytes: number
    operations: number
    writes: number
    reads: number
    deletes: number
  }
  limits: {
    maxBytes: number | null
    trafficBytes: number | null
    maxOperations: number | null
    alertBytes: number | null
    warningThreshold: number | null
  }
  utilization: {
    storedBytes: number | null
    trafficBytes: number | null
    operations: number | null
  }
  remaining: {
    storedBytes: number | null
    trafficBytes: number | null
    operations: number | null
    alertBytes: number | null
  }
  overage: {
    storedBytes: number
    trafficBytes: number
    operations: number
    alertBytes: number
  }
  burnRate: {
    storedBytesPerDay: number
    trafficBytesPerDay: number
    operationsPerDay: number
  }
  projectedExhaustionDays: {
    storedBytes: number | null
    trafficBytes: number | null
    operations: number | null
    alertBytes: number | null
  }
}

export interface StorageChannelProfile {
  id: string
  channel: string
  provider: string
  label: string
  description: string
  status: 'active' | 'policy-ready'
  credentialRefPrefix: string | null
  requiredConfigKeys: string[]
  optionalConfigKeys: string[]
  limitKeys: string[]
  defaultLimits: Record<string, unknown>
  defaultConfig: Record<string, unknown>
}

export interface StoragePoliciesResponse {
  policies: GovernanceConfig[]
  evaluations: StoragePolicyEvaluation[]
  alerts: StoragePolicyAlert[]
  profiles: StorageChannelProfile[]
  generatedAt: string
}

export type StorageChannelPolicySummary = Omit<GovernanceConfig, 'config' | 'createdBy' | 'ownerId'>

export type StorageChannelAnalyticsResponse = GovernanceAnalytics['storage'] & {
  days: number
  channel: string | null
  provider: string | null
  policies: StorageChannelPolicySummary[]
  evaluations: StoragePolicyEvaluation[]
  alerts: StoragePolicyAlert[]
  generatedAt: string
}

export interface StoragePolicyAlert {
  policyId: string
  name: string
  channel: string
  provider: string | null
  status: 'warning' | 'blocked'
  metric: StorageAlertMetric
  limitKey: StorageAlertLimitKey
  usage: number
  limit: number | null
  utilization: number | null
  reasons: string[]
}

export interface StorageCredentialRecord {
  authRef: string
  credentialType: 'access_key'
  backend: 'd1-encrypted'
  hasCredential: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface StorageCredentialsResponse {
  credentials: StorageCredentialRecord[]
  generatedAt: string
}

export type StorageChannelSmokeMode = 'dry-run' | 'write'
export type StorageChannelSmokeStatus = 'ready' | 'sent' | 'failed'

export interface StorageChannelSmokeResponse {
  policyId: string
  policyName: string
  mode: StorageChannelSmokeMode
  status: StorageChannelSmokeStatus
  reason: string
  channel: string
  provider: string | null
  resourceType: string
  operations: Array<'resolve' | 'write' | 'read' | 'delete'>
  bytesWritten: number
  bytesRead: number
  credentialRequired: boolean
  hasCredentialRef: boolean
  hasCredential: boolean | null
  generatedAt: string
}

export interface NotificationCredentialRecord {
  authRef: string
  credentialType: 'api_key' | 'smtp' | 'webhook' | 'bot_token'
  backend: 'd1-encrypted'
  hasCredential: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface NotificationCredentialsResponse {
  credentials: NotificationCredentialRecord[]
  generatedAt: string
}

export type NotificationCredentialType = 'api_key' | 'smtp' | 'webhook' | 'bot_token'

export interface NotificationChannelResolvedProfile {
  channel: string
  provider: string | null
  providerType: string | null
  adapter: string
  credentialRef: string | null
  credentialRequired: boolean
  supported: boolean
}

export interface NotificationChannelReadiness {
  status: NotificationChannelReadinessStatus
  productionReady: boolean
  reasons: string[]
  sendMode: boolean
  requiresPublicRuntime: boolean
  hasPublicRuntime: boolean
  requiresRelayEndpoint: boolean
  hasRelayEndpoint: boolean
}

export interface NotificationChannelProfileTemplate {
  id: string
  channel: string
  provider: string
  providerType: string
  adapter: string
  label: string
  description: string
  credentialType: NotificationCredentialType | null
  credentialRefPrefix: string | null
  requiredConfigKeys: string[]
  optionalConfigKeys: string[]
  defaultConfig: Record<string, unknown>
  defaultLimits: Record<string, unknown>
}

export interface NotificationChannelEvaluation {
  configId: string
  profile: NotificationChannelResolvedProfile
  readiness: NotificationChannelReadiness
}

export interface NotificationChannelsResponse {
  channels: GovernanceConfig[]
  evaluations: NotificationChannelEvaluation[]
  profiles: NotificationChannelProfileTemplate[]
  generatedAt: string
}

export interface NotificationDeliveryRecord {
  configId: string
  configName: string
  action: string
  channel: string
  provider: string | null
  providerType: string | null
  adapter: string
  status: NotificationDeliveryStatus
  reason: string
  credentialRequired: boolean
  hasCredentialRef: boolean
  resourceType: string | null
  resourceId: string | null
  durationMs: number
  statusCode: number | null
}

export interface NotificationChannelTestResponse {
  channel: {
    id: string
    name: string
    channel: string | null
    provider: string | null
    enabled: boolean
  }
  action: string
  mode: 'plan' | 'send'
  deliveries: NotificationDeliveryRecord[]
  generatedAt: string
}

export interface StorageAlertNotifyResponse {
  mode: 'plan' | 'send'
  days: number
  alerts: StoragePolicyAlert[]
  dispatches: Array<{
    alert: StoragePolicyAlert
    deliveries: NotificationDeliveryRecord[]
  }>
  generatedAt: string
}

