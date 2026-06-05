<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TuffSelect, TuffSelectItem } from '@talex-touch/tuffex/select'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import type { EvidenceSource as PlatformGovernanceReportEvidenceStatus } from '~/types/docs-engagement'
import { isFallbackEvidenceSource, isProductionEvidenceSource } from '~/types/docs-engagement'
import { requestJson } from '~/utils/request'

definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t, te } = useI18n()
const tt = (key: string, fallback: string) => te(key) ? t(key) : fallback
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})
const { user } = useAuthUser()

const isAdmin = computed(() => user.value?.role === 'admin')

watch(isAdmin, (admin) => {
  if (user.value && !admin) {
    navigateTo('/dashboard/overview')
  }
}, { immediate: true })

type GovernanceConfigType =
  | 'analytics_collection'
  | 'storage_channel'
  | 'notification_channel'
  | 'intelligence_provider_quota'
type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'muted'
type StoragePolicyEvaluationStatus = 'ok' | 'warning' | 'blocked' | 'disabled'
type StorageChannelPressureStatus = StoragePolicyEvaluationStatus | 'unmanaged'
type StorageActionQueuePriority = 'critical' | 'high' | 'medium' | 'low'
type StorageActionQueueSuggestedAction =
  | 'configure-policy'
  | 'increase-storage-limit'
  | 'increase-traffic-limit'
  | 'increase-operation-limit'
  | 'review-burn-rate'
  | 'monitor-channel'
type StorageSmokeEvidenceMode = 'dry-run' | 'write' | 'unknown'
type StorageSmokeEvidenceStatus = 'ready' | 'sent' | 'failed'
type ProviderQuotaStatus = 'ok' | 'warning' | 'blocked' | 'disabled'
type ProviderQuotaRiskReason = 'blocked' | 'warning-threshold' | 'overage' | 'low-remaining' | 'projected-exhaustion'
type ProviderQuotaActionQueuePriority = 'critical' | 'high' | 'medium' | 'low'
type ProviderQuotaActionQueueSuggestedAction =
  | 'increase-token-limit'
  | 'increase-request-limit'
  | 'reduce-provider-traffic'
  | 'split-provider-channel'
  | 'enable-provider-quota'
  | 'set-provider-limit'
  | 'monitor-burn-rate'
type ProviderQuotaActionQueueReason =
  | 'token-overage'
  | 'request-overage'
  | 'token-exhausted'
  | 'request-exhausted'
  | 'warning-threshold'
  | 'projected-exhaustion'
  | 'quota-disabled'
  | 'missing-hard-limit'
type ProviderQuotaSmokeMode = 'dry-run' | 'consume'
type ProviderQuotaSmokeStatus = 'allowed' | 'blocked' | 'consumed' | 'failed'
type StorageAlertMetric = 'storedBytes' | 'trafficBytes' | 'operations'
type StorageAlertLimitKey = 'maxBytes' | 'trafficBytes' | 'maxOperations' | 'alertBytes'
type PlatformGovernanceD1ReadinessStatus = 'ready' | 'warning' | 'blocked'
type PlatformGovernanceReportStatus = 'ok' | 'watch' | 'critical'
type PlatformGovernanceReportPriority = 'critical' | 'high' | 'medium' | 'low'

interface GovernanceSummary {
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

interface GovernanceMetric {
  key: string
  events: number
  quantity: number
  uniqueActors: number
}

interface GovernanceSearchPluginPreferenceByTimeSlot {
  slot: string
  plugins: GovernanceMetric[]
  selectedPlugins: GovernanceMetric[]
}

interface GovernanceSearchPluginPreferenceByContext {
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

interface GovernanceSearchContextSelectionMatrixItem {
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

interface GovernanceSearchJourneySegment {
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

interface GovernanceSearchJourney {
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

interface GovernanceSearchFrequencyCohort {
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

interface GovernanceTrendPoint {
  date: string
  events: number
  quantity: number
  uniqueActors: number
}

interface GovernanceGrowthTrendPoint extends GovernanceTrendPoint {
  cumulative: number
  growthRate: number
}

interface GovernanceHeatmapPoint {
  dayOfWeek: number
  hour: string
  events: number
  quantity: number
  uniqueActors: number
}

interface GovernanceSearchTimeHeatmapPoint extends GovernanceHeatmapPoint {
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

interface GovernanceNumberStat {
  count: number
  average: number
  max: number
}

interface StorageUsageBreakdown {
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

interface UploadSceneAssetHealthItem {
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

interface StorageUsageTrendPoint {
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

interface StorageSmokeEvidenceItem {
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

interface StorageChannelPressure {
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

interface StorageActionQueueItem {
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

interface ProviderQuotaRiskItem {
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

interface ProviderQuotaActionQueueItem {
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

interface ProviderQuotaSmokeEvidenceItem {
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

interface GovernanceScopedAnalytics {
  totalEvents: number
  totalQuantity: number
  uniqueActors: number
  byHour: GovernanceMetric[]
  byChannel: GovernanceMetric[]
  byResource: GovernanceMetric[]
  timeline: Array<{ date: string, events: number, quantity: number }>
}

interface GovernanceGrowth {
  previousEvents: number
  currentEvents: number
  eventGrowthRate: number
}

type NotificationChannelRiskStatus = 'ok' | 'warning' | 'disabled'
type NotificationChannelReadinessStatus = 'ready' | 'warning' | 'disabled'
type NotificationChannelDisplayStatus = NotificationChannelRiskStatus | NotificationChannelReadinessStatus
type NotificationDeliveryStatus = 'planned' | 'sent' | 'skipped' | 'failed'
type NotificationActionQueuePriority = 'critical' | 'high' | 'medium' | 'low'
type NotificationActionQueueSource = 'channel-config' | 'delivery-health'
type NotificationActionQueueSuggestedAction =
  | 'enable-channel'
  | 'fix-channel-config'
  | 'bind-credential-ref'
  | 'configure-runtime'
  | 'configure-relay'
  | 'enable-send-mode'
  | 'investigate-failures'
  | 'review-skipped-deliveries'
  | 'monitor-provider'

interface NotificationActionQueueItem {
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

interface NotificationTestEvidenceItem {
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

interface NotificationDeliveryEvidenceItem {
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

interface NotificationDeliveryAnalytics {
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

interface PluginLeaderboardItem {
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

interface ProviderModelDistributionItem {
  model: string
  requests: number
  tokens: number
  quantity: number
  uniqueActors: number
  byProvider: Array<{ providerId: string, quantity: number }>
  byChannel: Array<{ channel: string, quantity: number }>
  byProviderType: Array<{ providerType: string, quantity: number }>
}

interface ProviderLeaderboardItem {
  providerId: string
  requests: number
  tokens: number
  quantity: number
  uniqueActors: number
  byUnit: Array<{ unit: string, quantity: number }>
  byChannel: Array<{ channel: string, quantity: number }>
  byModel: Array<{ model: string, tokens: number }>
}

interface ProviderChannelDistributionItem {
  providerId: string
  channel: string
  requests: number
  tokens: number
  quantity: number
  uniqueActors: number
  byModel: Array<{ model: string, tokens: number }>
  byProviderType: Array<{ providerType: string, quantity: number }>
}

interface ProviderModelChannelDistributionItem {
  model: string
  channel: string
  requests: number
  tokens: number
  quantity: number
  uniqueActors: number
  byProvider: Array<{ providerId: string, quantity: number }>
  byProviderType: Array<{ providerType: string, quantity: number }>
}

interface GovernanceOperationsTimelinePoint {
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

interface GovernanceAnalytics {
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

interface GovernanceConfig {
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

interface ConfigListResponse {
  configs: GovernanceConfig[]
  generatedAt: string
}

interface PlatformGovernanceD1ReadinessCheck {
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

interface PlatformGovernanceD1Readiness {
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

interface PlatformGovernanceReportScorecard {
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

interface PlatformGovernanceReportRiskQueueItem {
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

interface PlatformGovernanceReportEvidenceItem {
  key: string
  label: string
  status: PlatformGovernanceReportEvidenceStatus
  evidenceCount: number
  blocker: string | null
}

interface PlatformGovernanceReportSnapshot {
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

interface StoragePolicyEvaluation {
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

interface StorageChannelProfile {
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

interface StoragePoliciesResponse {
  policies: GovernanceConfig[]
  evaluations: StoragePolicyEvaluation[]
  alerts: StoragePolicyAlert[]
  profiles: StorageChannelProfile[]
  generatedAt: string
}

type StorageChannelPolicySummary = Omit<GovernanceConfig, 'config' | 'createdBy' | 'ownerId'>

type StorageChannelAnalyticsResponse = GovernanceAnalytics['storage'] & {
  days: number
  channel: string | null
  provider: string | null
  policies: StorageChannelPolicySummary[]
  evaluations: StoragePolicyEvaluation[]
  alerts: StoragePolicyAlert[]
  generatedAt: string
}

interface StoragePolicyAlert {
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

interface StorageCredentialRecord {
  authRef: string
  credentialType: 'access_key'
  backend: 'd1-encrypted'
  hasCredential: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface StorageCredentialsResponse {
  credentials: StorageCredentialRecord[]
  generatedAt: string
}

type StorageChannelSmokeMode = 'dry-run' | 'write'
type StorageChannelSmokeStatus = 'ready' | 'sent' | 'failed'

interface StorageChannelSmokeResponse {
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

interface NotificationCredentialRecord {
  authRef: string
  credentialType: 'api_key' | 'smtp' | 'webhook' | 'bot_token'
  backend: 'd1-encrypted'
  hasCredential: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface NotificationCredentialsResponse {
  credentials: NotificationCredentialRecord[]
  generatedAt: string
}

type NotificationCredentialType = 'api_key' | 'smtp' | 'webhook' | 'bot_token'

interface NotificationChannelResolvedProfile {
  channel: string
  provider: string | null
  providerType: string | null
  adapter: string
  credentialRef: string | null
  credentialRequired: boolean
  supported: boolean
}

interface NotificationChannelReadiness {
  status: NotificationChannelReadinessStatus
  productionReady: boolean
  reasons: string[]
  sendMode: boolean
  requiresPublicRuntime: boolean
  hasPublicRuntime: boolean
  requiresRelayEndpoint: boolean
  hasRelayEndpoint: boolean
}

interface NotificationChannelProfileTemplate {
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

interface NotificationChannelEvaluation {
  configId: string
  profile: NotificationChannelResolvedProfile
  readiness: NotificationChannelReadiness
}

interface NotificationChannelsResponse {
  channels: GovernanceConfig[]
  evaluations: NotificationChannelEvaluation[]
  profiles: NotificationChannelProfileTemplate[]
  generatedAt: string
}

interface NotificationDeliveryRecord {
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

interface NotificationChannelTestResponse {
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

interface StorageAlertNotifyResponse {
  mode: 'plan' | 'send'
  days: number
  alerts: StoragePolicyAlert[]
  dispatches: Array<{
    alert: StoragePolicyAlert
    deliveries: NotificationDeliveryRecord[]
  }>
  generatedAt: string
}

const summaryDays = ref(30)
const saveError = ref('')
const saveMessage = ref('')
const saving = ref(false)
const notificationTesting = ref(false)
const notificationTestError = ref('')
const notificationTestResult = ref<NotificationChannelTestResponse | null>(null)
const storageAlertNotifying = ref(false)
const storageAlertNotifyError = ref('')
const storageAlertNotifyResult = ref<StorageAlertNotifyResponse | null>(null)
const storageSmokeRunning = ref(false)
const storageSmokeError = ref('')
const storageSmokeResult = ref<StorageChannelSmokeResponse | null>(null)

const analyticsForm = reactive({
  name: 'Default analytics collection',
  channel: 'app',
  warningThreshold: '80',
  limitsJson: '{\n  "retentionDays": 90,\n  "maxEventsPerDay": 1000000\n}',
  configJson: '{\n  "granularity": "hourly",\n  "collect": ["search", "plugin", "upload", "intelligence"],\n  "pii": "hashed-only"\n}',
})

const storageForm = reactive({
  profileId: 'cloudflare-r2',
  name: 'Default R2 storage policy',
  channel: 'r2',
  provider: 'cloudflare-r2',
  warningThreshold: '80',
  limitsJson: '{\n  "maxBytes": 107374182400,\n  "trafficBytes": 900000000000,\n  "maxOperationsPerDay": 100000,\n  "alertBytes": 85899345920\n}',
  configJson: '{\n  "credentialRef": "secure://storage/r2-default",\n  "region": "auto"\n}',
})

const notificationForm = reactive({
  profileId: 'resend-email',
  name: 'Plugin review email',
  channel: 'email',
  provider: 'resend-primary',
  warningThreshold: '85',
  limitsJson: '{\n  "maxMessagesPerDay": 5000,\n  "maxFailuresPerHour": 50\n}',
  configJson: '{\n  "mode": "send",\n  "providerType": "resend",\n  "credentialRef": "secure://notifications/resend-primary",\n  "from": "Tuff <noreply@example.com>",\n  "events": ["plugin.version.approved", "plugin.version.rejected"]\n}',
})

const notificationCredentialForm = reactive({
  authRef: 'secure://notifications/resend-primary',
  credentialType: 'api_key',
  credentialsJson: '',
})

const notificationTestForm = reactive({
  configId: '',
  action: 'system.notification.test',
  resourceId: '',
  metadataJson: '{\n  "source": "dashboard-governance"\n}',
})

const storageCredentialForm = reactive({
  authRef: 'secure://storage/s3-default',
  credentialType: 'access_key',
  credentialsJson: '',
})

const providerQuotaForm = reactive({
  name: 'Provider quota',
  targetId: '',
  provider: 'openai',
  channel: 'chat.completion',
  warningThreshold: '80',
  limitsJson: '{\n  "windowDays": 30,\n  "maxRequests": 10000,\n  "maxTokens": 10000000\n}',
  configJson: '{\n  "mode": "hard-limit"\n}',
})

function emptyD1Readiness(): PlatformGovernanceD1Readiness {
  return {
    status: 'blocked',
    database: {
      present: false,
      binding: null,
    },
    summary: {
      total: 0,
      ready: 0,
      warning: 0,
      blocked: 0,
      missingTables: 0,
      missingIndexes: 0,
      backfillRequired: 0,
    },
    checks: [],
    generatedAt: '',
  }
}

const { data: summaryData, pending: summaryPending, error: summaryError, refresh: refreshSummary } = await useAsyncData<GovernanceSummary>(
  'dashboard-governance-summary',
  async () => await requestJson<GovernanceSummary>('/api/dashboard/governance/summary', {
    query: {
      days: summaryDays.value,
      limit: 5000,
      topLimit: 12,
    },
  }),
  {
    default: () => ({
      totalEvents: 0,
      totalQuantity: 0,
      uniqueActors: 0,
      byAction: [],
      byChannel: [],
      byUnit: [],
      timeline: [],
      topResources: [],
      generatedAt: '',
    }),
    server: false,
  },
)

const { data: configsData, pending: configsPending, error: configsError, refresh: refreshConfigs } = await useAsyncData<ConfigListResponse>(
  'dashboard-governance-configs',
  async () => await requestJson<ConfigListResponse>('/api/dashboard/governance/configs'),
  {
    default: () => ({ configs: [], generatedAt: '' }),
    server: false,
  },
)

const { data: d1ReadinessData, pending: d1ReadinessPending, error: d1ReadinessError, refresh: refreshD1Readiness } = await useAsyncData<PlatformGovernanceD1Readiness>(
  'dashboard-governance-d1-readiness',
  async () => await requestJson<PlatformGovernanceD1Readiness>('/api/dashboard/governance/d1-readiness'),
  {
    default: emptyD1Readiness,
    server: false,
  },
)

function emptyScopedAnalytics(): GovernanceScopedAnalytics {
  return {
    totalEvents: 0,
    totalQuantity: 0,
    uniqueActors: 0,
    byHour: [],
    byChannel: [],
    byResource: [],
    timeline: [],
  }
}

function emptyNumberStat(): GovernanceNumberStat {
  return {
    count: 0,
    average: 0,
    max: 0,
  }
}

function emptyStorageAnalytics(): GovernanceAnalytics['storage'] {
  return {
    ...emptyScopedAnalytics(),
    storedBytes: 0,
    trafficBytes: 0,
    operations: 0,
    writes: 0,
    reads: 0,
    deletes: 0,
    byChannelUsage: [],
    byProviderUsage: [],
    byResourceTypeUsage: [],
    byActionUsage: [],
    channelPressure: [],
    actionQueue: [],
    smokeEvidence: [],
    trend: [],
    policySummary: {
      total: 0,
      active: 0,
      ok: 0,
      warning: 0,
      blocked: 0,
      disabled: 0,
      alerts: 0,
      highestStoredUtilization: 0,
      highestTrafficUtilization: 0,
      highestOperationUtilization: 0,
    },
    policyRisks: [],
  }
}

function emptyStorageChannelAnalytics(): StorageChannelAnalyticsResponse {
  return {
    days: summaryDays.value,
    channel: null,
    provider: null,
    generatedAt: '',
    ...emptyStorageAnalytics(),
    policies: [],
    evaluations: [],
    alerts: [],
  }
}

const { data: analyticsData, pending: analyticsPending, error: analyticsError, refresh: refreshAnalytics } = await useAsyncData<GovernanceAnalytics>(
  'dashboard-governance-analytics',
  async () => await requestJson<GovernanceAnalytics>('/api/dashboard/governance/analytics', {
    query: {
      days: summaryDays.value,
      limit: 5000,
      topLimit: 12,
    },
  }),
  {
    default: () => ({
      days: summaryDays.value,
      generatedAt: '',
      dashboard: {
        growth: {
          userSignups: {
            total: 0,
            latestDate: null,
            latestQuantity: 0,
            cumulative: 0,
            growthRate: 0,
          },
          searches: {
            total: 0,
            latestDate: null,
            latestQuantity: 0,
            growthRate: 0,
            zeroResultRate: 0,
            problemRate: 0,
            selectionRate: 0,
          },
          pluginInstalls: {
            total: 0,
            latestDate: null,
            latestQuantity: 0,
            growthRate: 0,
          },
          providerUsage: {
            requests: 0,
            tokens: 0,
            latestDate: null,
            latestRequests: 0,
            latestTokens: 0,
          },
          uploads: {
            latestDate: null,
            latestStarted: 0,
            latestCompleted: 0,
            latestFailed: 0,
            failureRate: 0,
            stuckRate: 0,
          },
        },
        leaderboards: {
          hotPlugins: [],
          topModels: [],
          topProviders: [],
        },
        riskSummary: {
          uploadProblems: 0,
          storageAlerts: 0,
          storageBlockedPolicies: 0,
          notificationRisks: 0,
          notificationFailedDeliveries: 0,
          providerQuotaBlocked: 0,
          providerQuotaWarning: 0,
        },
        trends: {
          userGrowth: [],
          searches: [],
          pluginInstalls: [],
          providerUsage: [],
          uploadStatus: [],
          operationsTimeline: [],
        },
      },
      visits: {
        ...emptyScopedAnalytics(),
        growth: { previousEvents: 0, currentEvents: 0, eventGrowthRate: 0 },
        trend: [],
        heatmap: [],
        byRoute: [],
        byPage: [],
        bySurface: [],
        byReferrer: [],
        byLocalHour: [],
        byLocalTimeSlot: [],
        byLocalDayOfWeek: [],
        byCountry: [],
        byRegion: [],
        byTimezone: [],
      },
      users: {
        ...emptyScopedAnalytics(),
        growth: { previousEvents: 0, currentEvents: 0, eventGrowthRate: 0 },
        signups: 0,
        signupGrowth: { previousEvents: 0, currentEvents: 0, eventGrowthRate: 0 },
        signupTrend: [],
        signupGrowthTrend: [],
        heatmap: [],
        byAction: [],
        bySource: [],
        byCountry: [],
        byRegion: [],
        byTimezone: [],
      },
      searches: {
        ...emptyScopedAnalytics(),
        growth: { previousEvents: 0, currentEvents: 0, eventGrowthRate: 0 },
        trend: [],
        heatmap: [],
        timeHeatmap: [],
        frequencyCohorts: [],
        byQueryType: [],
        byScene: [],
        byInputType: [],
        byProvider: [],
        byProviderLatency: [],
        byProviderResults: [],
        byResultCategory: [],
        byProviderStatus: [],
        byFilterKind: [],
        byFilterSource: [],
        byContextAppCategory: [],
        byContextSource: [],
        byEntryPoint: [],
        byTriggerType: [],
        byUserPreferenceMode: [],
        bySessionBucket: [],
        byPluginId: [],
        byPluginCategory: [],
        byContextTag: [],
        byLocalHour: [],
        byLocalDayOfWeek: [],
        byLocalTimeSlot: [],
        bySelectedProvider: [],
        bySelectedCategory: [],
        bySelectedPluginId: [],
        bySelectedRankBucket: [],
        byQueryLengthBucket: [],
        byResultCountBucket: [],
        byFirstResultLatencyBucket: [],
        byTotalDurationBucket: [],
        byCountry: [],
        byRegion: [],
        byTimezone: [],
        pluginPreferenceByTimeSlot: [],
        pluginPreferenceByContext: [],
        contextSelectionMatrix: [],
        journey: {
          total: 0,
          withFilters: 0,
          withResults: 0,
          selected: 0,
          zeroResult: 0,
          providerProblem: 0,
          providerErrors: 0,
          providerTimeouts: 0,
          filterRate: 0,
          withResultsRate: 0,
          selectionRate: 0,
          zeroResultRate: 0,
          problemRate: 0,
          segments: [],
        },
        filterUsage: {
          withFilters: 0,
          withoutFilters: 0,
          filterRate: 0,
        },
        selectionSummary: {
          selected: 0,
          selectionRate: 0,
        },
        reliabilitySummary: {
          total: 0,
          zeroResult: 0,
          providerErrors: 0,
          providerTimeouts: 0,
          problemSearches: 0,
          zeroResultRate: 0,
          problemRate: 0,
        },
        reliabilityTrend: [],
        latency: {
          firstResultMs: emptyNumberStat(),
          totalDurationMs: emptyNumberStat(),
        },
        resultStats: {
          queryLength: emptyNumberStat(),
          resultCount: emptyNumberStat(),
          firstResultCount: emptyNumberStat(),
          providerErrorCount: emptyNumberStat(),
          providerTimeoutCount: emptyNumberStat(),
        },
      },
      plugins: {
        ...emptyScopedAnalytics(),
        growth: { previousEvents: 0, currentEvents: 0, eventGrowthRate: 0 },
        trend: [],
        installTrend: [],
        heatmap: [],
        leaderboard: [],
      },
      uploads: {
        ...emptyScopedAnalytics(),
        started: 0,
        completed: 0,
        failed: 0,
        attempts: 0,
        stuckAttempts: 0,
        stuckAttemptAgeMs: 0,
        bytes: 0,
        failureRate: 0,
        stuckRate: 0,
        byExtension: [],
        byResourceType: [],
        byContentType: [],
        byStorageChannel: [],
        byStorageProvider: [],
        byFailureReason: [],
        byStatusCode: [],
        bySurface: [],
        sceneAssetHealth: [],
        pipelineSummary: [],
        failureMatrix: [],
        actionQueue: [],
        retrySummary: {
          retryableFailures: 0,
          nonRetryableFailures: 0,
          scheduledRetries: 0,
          exhaustedFailures: 0,
          recoveredUploads: 0,
          recoveredRetryCount: 0,
          recoveredRetryRate: 0,
          calibratedFailureSamples: 0,
          verifiedFailureSamples: 0,
          liveFailureSamples: 0,
          manualFailureSamples: 0,
          calibrationCoverageRate: 0,
          retryCount: emptyNumberStat(),
          nextRetryDelayMs: emptyNumberStat(),
          recoveredAttempts: emptyNumberStat(),
        },
        byRetryDisposition: [],
        statusTrend: [],
        retryTrend: [],
        uploadSize: emptyNumberStat(),
        uploadDurationMs: emptyNumberStat(),
        recoveredEvidence: [],
        problemAttempts: [],
      },
      notifications: {
        ...emptyScopedAnalytics(),
        channelSummary: {
          total: 0,
          enabled: 0,
          disabled: 0,
          unsupported: 0,
          credentialMissing: 0,
          credentialed: 0,
          productionReady: 0,
          runtimeMissing: 0,
          relayMissing: 0,
          sendModeMissing: 0,
        },
        providerMix: [],
        channelRisks: [],
        actionQueue: [],
        deliveries: {
          total: 0,
          planned: 0,
          sent: 0,
          skipped: 0,
          failed: 0,
          plannedRate: 0,
          sentRate: 0,
          failureRate: 0,
          durationMs: emptyNumberStat(),
        },
        byDeliveryStatus: [],
        byProvider: [],
        byAdapter: [],
        byReason: [],
        byStatusCode: [],
        byNotificationAction: [],
        deliveryTrend: [],
        providerHealth: [],
        deliveryEvidence: [],
        testEvidence: [],
        browserPushSubscriptions: {
          total: 0,
          registered: 0,
          deleted: 0,
          byAction: [],
          byEndpointHost: [],
          trend: [],
        },
      },
      storage: emptyStorageAnalytics(),
      providers: {
        ...emptyScopedAnalytics(),
        growth: { previousEvents: 0, currentEvents: 0, eventGrowthRate: 0 },
        usageSummary: {
          events: 0,
          requests: 0,
          tokens: 0,
        },
        trend: [],
        byModel: [],
        byProviderType: [],
        channelDistribution: [],
        modelDistribution: [],
        modelChannelDistribution: [],
        quotaSummary: {
          total: 0,
          active: 0,
          blocked: 0,
          warning: 0,
          disabled: 0,
          highestRequestUtilization: 0,
          highestTokenUtilization: 0,
          requestOverage: 0,
          tokenOverage: 0,
          lowestRemainingRequests: null,
          lowestRemainingTokens: null,
          nearestRequestExhaustionDays: null,
          nearestTokenExhaustionDays: null,
        },
        quotaActionQueue: [],
        quotaRiskItems: [],
        quotaSmokeEvidence: [],
        quotas: [],
        leaderboard: [],
      },
    }),
    server: false,
  },
)

function emptyGovernanceReportSnapshot(): PlatformGovernanceReportSnapshot {
  return {
    days: summaryDays.value,
    generatedAt: '',
    report: {
      status: 'ok',
      riskScore: 0,
      scorecards: [],
      evidenceStatus: [],
      riskQueue: [],
      leaderboards: {
        hotPlugins: [],
        topModels: [],
        topProviders: [],
      },
      trendSummary: {
        latestDate: null,
        operationsDays: 0,
        peakSearches: 0,
        peakPluginInstalls: 0,
        peakProviderTokens: 0,
        peakRiskScore: 0,
      },
    },
  }
}

const { data: reportData, pending: reportPending, error: reportError, refresh: refreshReport } = await useAsyncData<PlatformGovernanceReportSnapshot>(
  'dashboard-governance-report',
  async () => await requestJson<PlatformGovernanceReportSnapshot>('/api/dashboard/governance/report', {
    query: {
      days: summaryDays.value,
      limit: 5000,
      topLimit: 12,
    },
  }),
  {
    default: emptyGovernanceReportSnapshot,
    server: false,
  },
)

const { data: storagePoliciesData, pending: storagePoliciesPending, error: storagePoliciesError, refresh: refreshStoragePolicies } = await useAsyncData<StoragePoliciesResponse>(
  'dashboard-governance-storage-policies',
  async () => await requestJson<StoragePoliciesResponse>('/api/dashboard/storage/policies', {
    query: {
      days: summaryDays.value,
      limit: 5000,
    },
  }),
  {
    default: () => ({
      policies: [],
      evaluations: [],
      alerts: [],
      profiles: [],
      generatedAt: '',
    }),
    server: false,
  },
)

const { data: storageCredentialsData, pending: storageCredentialsPending, error: storageCredentialsError, refresh: refreshStorageCredentials } = await useAsyncData<StorageCredentialsResponse>(
  'dashboard-governance-storage-credentials',
  async () => await requestJson<StorageCredentialsResponse>('/api/dashboard/storage/credentials'),
  {
    default: () => ({
      credentials: [],
      generatedAt: '',
    }),
    server: false,
  },
)

const { data: notificationCredentialsData, pending: notificationCredentialsPending, error: notificationCredentialsError, refresh: refreshNotificationCredentials } = await useAsyncData<NotificationCredentialsResponse>(
  'dashboard-governance-notification-credentials',
  async () => await requestJson<NotificationCredentialsResponse>('/api/dashboard/notifications/credentials'),
  {
    default: () => ({
      credentials: [],
      generatedAt: '',
    }),
    server: false,
  },
)

const { data: notificationChannelsData, pending: notificationChannelsPending, error: notificationChannelsError, refresh: refreshNotificationChannels } = await useAsyncData<NotificationChannelsResponse>(
  'dashboard-governance-notification-channels',
  async () => await requestJson<NotificationChannelsResponse>('/api/dashboard/notifications/channels'),
  {
    default: () => ({
      channels: [],
      evaluations: [],
      profiles: [],
      generatedAt: '',
    }),
    server: false,
  },
)

const configs = computed(() => configsData.value?.configs ?? [])
const storageEvaluations = computed(() => storagePoliciesData.value?.evaluations ?? [])
const derivedStoragePolicyAlerts = computed<StoragePolicyAlert[]>(() => {
  const alerts: StoragePolicyAlert[] = []
  const specs: Array<{
    metric: StorageAlertMetric
    limitKey: StorageAlertLimitKey
    usageKey: keyof StoragePolicyEvaluation['usage']
    utilizationKey: keyof StoragePolicyEvaluation['utilization']
    reasonCodes: string[]
  }> = [
    {
      metric: 'storedBytes',
      limitKey: 'maxBytes',
      usageKey: 'storedBytes',
      utilizationKey: 'storedBytes',
      reasonCodes: ['max-bytes-exceeded', 'max-bytes-warning'],
    },
    {
      metric: 'trafficBytes',
      limitKey: 'trafficBytes',
      usageKey: 'trafficBytes',
      utilizationKey: 'trafficBytes',
      reasonCodes: ['traffic-bytes-exceeded', 'traffic-bytes-warning'],
    },
    {
      metric: 'operations',
      limitKey: 'maxOperations',
      usageKey: 'operations',
      utilizationKey: 'operations',
      reasonCodes: ['operation-limit-exceeded', 'operation-limit-warning'],
    },
    {
      metric: 'storedBytes',
      limitKey: 'alertBytes',
      usageKey: 'storedBytes',
      utilizationKey: 'storedBytes',
      reasonCodes: ['alert-bytes-reached'],
    },
  ]

  for (const item of storageEvaluations.value) {
    if (item.status !== 'warning' && item.status !== 'blocked')
      continue

    for (const spec of specs) {
      const reasons = item.reasons.filter(reason => spec.reasonCodes.includes(reason))
      if (!reasons.length)
        continue

      alerts.push({
        policyId: item.policyId,
        name: item.name,
        channel: item.channel,
        provider: item.provider,
        status: item.status,
        metric: spec.metric,
        limitKey: spec.limitKey,
        usage: Number(item.usage[spec.usageKey] ?? 0),
        limit: item.limits[spec.limitKey],
        utilization: spec.limitKey === 'alertBytes' ? null : item.utilization[spec.utilizationKey],
        reasons,
      })
    }
  }

  return alerts.sort((left, right) => {
    if (left.status !== right.status)
      return left.status === 'blocked' ? -1 : 1
    return (right.utilization ?? 0) - (left.utilization ?? 0)
  })
})
const storagePolicyAlerts = computed(() => storagePoliciesData.value?.alerts ?? derivedStoragePolicyAlerts.value)
const storageProfiles = computed(() => storagePoliciesData.value?.profiles ?? [])
const selectedStorageProfile = computed(() => storageProfiles.value.find(profile => profile.id === storageForm.profileId) ?? null)
const storageChannelAnalyticsQuery = computed(() => ({
  days: summaryDays.value,
  limit: 5000,
  topLimit: 8,
  channel: selectedStorageProfile.value?.channel || storageForm.channel || undefined,
  provider: selectedStorageProfile.value?.provider || storageForm.provider || undefined,
}))
const { data: storageChannelAnalyticsData, pending: storageChannelAnalyticsPending, error: storageChannelAnalyticsError, refresh: refreshStorageChannelAnalytics } = await useAsyncData<StorageChannelAnalyticsResponse>(
  'dashboard-governance-storage-channel-analytics',
  async () => await requestJson<StorageChannelAnalyticsResponse>('/api/dashboard/storage/channels/analytics', {
    query: storageChannelAnalyticsQuery.value,
  }),
  {
    watch: [storageChannelAnalyticsQuery],
    default: emptyStorageChannelAnalytics,
    server: false,
  },
)
const selectedStorageChannelAnalytics = computed(() => storageChannelAnalyticsData.value ?? emptyStorageChannelAnalytics())
const governancePagePending = computed(() => mounted.value && (summaryPending.value || configsPending.value || analyticsPending.value || reportPending.value || storagePoliciesPending.value || storageChannelAnalyticsPending.value || storageCredentialsPending.value || notificationCredentialsPending.value || notificationChannelsPending.value || d1ReadinessPending.value))
const reportHydratedPending = computed(() => mounted.value && reportPending.value)
const storageChannelAnalyticsHydratedPending = computed(() => mounted.value && storageChannelAnalyticsPending.value)
const storageCredentials = computed(() => storageCredentialsData.value?.credentials ?? [])
const storagePolicies = computed(() => storagePoliciesData.value?.policies ?? [])
const notificationCredentials = computed(() => notificationCredentialsData.value?.credentials ?? [])
const d1Readiness = computed(() => d1ReadinessData.value ?? emptyD1Readiness())
const d1ReadinessGaps = computed(() => d1Readiness.value.checks.filter(item => item.status !== 'ready'))
const analytics = computed(() => analyticsData.value!)
const governanceReport = computed(() => reportData.value ?? emptyGovernanceReportSnapshot())
const storagePolicyPeakUtilization = computed(() => Math.max(
  analytics.value.storage.policySummary.highestStoredUtilization,
  analytics.value.storage.policySummary.highestTrafficUtilization,
  analytics.value.storage.policySummary.highestOperationUtilization,
))
const providerQuotaPeakUtilization = computed(() => Math.max(
  analytics.value.providers.quotaSummary.highestRequestUtilization,
  analytics.value.providers.quotaSummary.highestTokenUtilization,
))
const providerQuotaNearestExhaustionDays = computed(() => {
  const values = [
    analytics.value.providers.quotaSummary.nearestRequestExhaustionDays,
    analytics.value.providers.quotaSummary.nearestTokenExhaustionDays,
  ].filter((value): value is number => value != null)
  return values.length ? Math.min(...values) : null
})
const dashboardRiskTotal = computed(() => {
  const risk = analytics.value.dashboard.riskSummary
  return risk.uploadProblems
    + risk.storageAlerts
    + risk.storageBlockedPolicies
    + risk.notificationRisks
    + risk.notificationFailedDeliveries
    + risk.providerQuotaBlocked
    + risk.providerQuotaWarning
})
const dashboardOperationsTimeline = computed(() => analytics.value.dashboard.trends.operationsTimeline)
const dashboardOperationsLatest = computed(() => dashboardOperationsTimeline.value.at(-1) ?? null)
const dashboardOperationsPeaks = computed(() => {
  const timeline = dashboardOperationsTimeline.value
  return {
    searches: Math.max(1, ...timeline.map(item => item.searches)),
    pluginInstalls: Math.max(1, ...timeline.map(item => item.pluginInstalls)),
    providerTokens: Math.max(1, ...timeline.map(item => item.providerTokens)),
    riskScore: Math.max(1, ...timeline.map(item => item.riskScore)),
  }
})
const searchTimeHeatmap = computed(() => analytics.value.searches.timeHeatmap)
const searchTimeHeatmapPeak = computed(() => Math.max(1, ...searchTimeHeatmap.value.map(item => item.events)))
const searchTimeHeatmapHours = computed(() => {
  const hours = Array.from(new Set(searchTimeHeatmap.value.map(item => item.hour))).sort()
  return hours.length ? hours : ['00', '06', '12', '18']
})
const searchTimeHeatmapRows = computed(() => {
  const cells = new Map(searchTimeHeatmap.value.map(item => [`${item.dayOfWeek}:${item.hour}`, item]))
  return [0, 1, 2, 3, 4, 5, 6]
    .map(dayOfWeek => ({
      dayOfWeek,
      label: formatWeekdayLabel(dayOfWeek),
      cells: searchTimeHeatmapHours.value.map(hour => cells.get(`${dayOfWeek}:${hour}`) ?? null),
    }))
    .filter(row => row.cells.some(Boolean))
})
const searchTimeHeatmapTop = computed(() => [...searchTimeHeatmap.value]
  .sort((left, right) => right.events - left.events || right.selectionRate - left.selectionRate || right.problemRate - left.problemRate)
  .slice(0, 6))
const groupedConfigs = computed(() => ({
  analytics: configs.value.filter(item => item.configType === 'analytics_collection'),
  storage: configs.value.filter(item => item.configType === 'storage_channel'),
  notifications: configs.value.filter(item => item.configType === 'notification_channel'),
  providerQuotas: configs.value.filter(item => item.configType === 'intelligence_provider_quota'),
}))
const notificationProfiles = computed(() => notificationChannelsData.value?.profiles ?? [])
const selectedNotificationProfile = computed(() => notificationProfiles.value.find(profile => profile.id === notificationForm.profileId) ?? null)
const notificationChannelEvaluations = computed(() => notificationChannelsData.value?.evaluations ?? [])
const selectedNotificationChannelEvaluation = computed(() => notificationChannelEvaluations.value.find(item => item.configId === notificationTestForm.configId) ?? null)
const notificationConfigs = computed(() => notificationChannelsData.value?.channels?.length ? notificationChannelsData.value.channels : groupedConfigs.value.notifications)

watch(notificationConfigs, (items) => {
  if (!items.length) {
    notificationTestForm.configId = ''
    return
  }
  if (!notificationTestForm.configId || !items.some(item => item.id === notificationTestForm.configId))
    notificationTestForm.configId = items[0]?.id ?? ''
}, { immediate: true })

function parseJsonObject(value: string, label: string): Record<string, unknown> | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  try {
    const parsed = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON object.`)
    }
    return parsed as Record<string, unknown>
  }
  catch (error) {
    throw new Error(error instanceof Error ? error.message : `${label} is invalid JSON.`)
  }
}

function readNumber(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function stringifyJsonObject(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2)
}

function applyStorageProfile(profileId: string | number): void {
  const profile = storageProfiles.value.find(item => item.id === String(profileId))
  if (!profile) {
    return
  }

  storageForm.profileId = profile.id
  storageForm.name = `${profile.label} storage policy`
  storageForm.channel = profile.channel
  storageForm.provider = profile.provider
  storageForm.limitsJson = stringifyJsonObject(profile.defaultLimits)
  storageForm.configJson = stringifyJsonObject(profile.defaultConfig)
}

function createNotificationCredentialTemplate(profile: NotificationChannelProfileTemplate): Record<string, unknown> | null {
  if (profile.credentialType === 'api_key') {
    return {
      apiKey: '<api-key>',
    }
  }
  if (profile.credentialType === 'smtp') {
    return {
      host: 'smtp.example.com',
      port: 587,
      username: 'user@example.com',
      password: '<smtp-password>',
      secure: false,
      from: 'Tuff <noreply@example.com>',
    }
  }
  if (profile.credentialType === 'webhook') {
    return {
      url: 'https://example.com/webhook',
      signingSecret: '<optional-signing-secret>',
    }
  }
  if (profile.credentialType === 'bot_token') {
    return {
      token: '<bot-token>',
    }
  }
  return null
}

function applyNotificationProfile(profileId: string | number): void {
  const profile = notificationProfiles.value.find(item => item.id === String(profileId))
  if (!profile) {
    return
  }

  notificationForm.profileId = profile.id
  notificationForm.name = `${profile.label} notification`
  notificationForm.channel = profile.channel
  notificationForm.provider = profile.provider
  notificationForm.limitsJson = stringifyJsonObject(profile.defaultLimits)
  notificationForm.configJson = stringifyJsonObject(profile.defaultConfig)
  if (profile.credentialType)
    notificationCredentialForm.credentialType = profile.credentialType
  if (profile.credentialRefPrefix)
    notificationCredentialForm.authRef = `${profile.credentialRefPrefix}${profile.provider}`
  notificationCredentialForm.credentialsJson = stringifyJsonObject(createNotificationCredentialTemplate(profile) ?? {})
}

async function saveConfig(
  configType: GovernanceConfigType,
  form: {
    name: string
    channel?: string
    provider?: string
    targetId?: string
    warningThreshold: string
    limitsJson: string
    configJson: string
  },
): Promise<void> {
  if (saving.value) {
    return
  }

  saveError.value = ''
  saveMessage.value = ''
  saving.value = true

  try {
    await requestJson('/api/dashboard/governance/configs', {
      method: 'POST',
      body: {
        configType,
        name: form.name,
        ownerScope: 'system',
        targetId: form.targetId || undefined,
        channel: form.channel || undefined,
        provider: form.provider || undefined,
        warningThreshold: readNumber(form.warningThreshold),
        limits: parseJsonObject(form.limitsJson, 'limits'),
        config: parseJsonObject(form.configJson, 'config'),
      },
    })
    saveMessage.value = tt('dashboard.governance.saved', 'Saved.')
    await Promise.all([refreshConfigs(), refreshSummary(), refreshAnalytics(), refreshReport(), refreshStoragePolicies(), refreshStorageChannelAnalytics(), refreshStorageCredentials(), refreshNotificationCredentials(), refreshNotificationChannels(), refreshD1Readiness()])
  }
  catch (error) {
    saveError.value = error instanceof Error ? error.message : tt('dashboard.governance.saveFailed', 'Save failed.')
  }
  finally {
    saving.value = false
  }
}

async function saveStorageCredential(): Promise<void> {
  if (saving.value) {
    return
  }

  saveError.value = ''
  saveMessage.value = ''
  saving.value = true

  try {
    await requestJson('/api/dashboard/storage/credentials', {
      method: 'POST',
      body: {
        authRef: storageCredentialForm.authRef,
        credentialType: storageCredentialForm.credentialType,
        credentials: parseJsonObject(storageCredentialForm.credentialsJson, 'credentials'),
      },
    })
    storageCredentialForm.credentialsJson = ''
    saveMessage.value = tt('dashboard.governance.storageCredentials.saved', 'Storage credential saved.')
    await refreshStorageCredentials()
  }
  catch (error) {
    saveError.value = error instanceof Error ? error.message : tt('dashboard.governance.storageCredentials.saveFailed', 'Storage credential save failed.')
  }
  finally {
    saving.value = false
  }
}

async function saveNotificationCredential(): Promise<void> {
  if (saving.value) {
    return
  }

  saveError.value = ''
  saveMessage.value = ''
  saving.value = true

  try {
    await requestJson('/api/dashboard/notifications/credentials', {
      method: 'POST',
      body: {
        authRef: notificationCredentialForm.authRef,
        credentialType: notificationCredentialForm.credentialType,
        credentials: parseJsonObject(notificationCredentialForm.credentialsJson, 'credentials'),
      },
    })
    notificationCredentialForm.credentialsJson = ''
    saveMessage.value = tt('dashboard.governance.credentials.saved', 'Credential saved.')
    await refreshNotificationCredentials()
  }
  catch (error) {
    saveError.value = error instanceof Error ? error.message : tt('dashboard.governance.credentials.saveFailed', 'Credential save failed.')
  }
  finally {
    saving.value = false
  }
}

async function testNotificationChannel(mode: 'plan' | 'send'): Promise<void> {
  if (notificationTesting.value || !notificationTestForm.configId) {
    return
  }

  notificationTestError.value = ''
  notificationTestResult.value = null
  saveError.value = ''
  saveMessage.value = ''
  notificationTesting.value = true

  try {
    const result = await requestJson<NotificationChannelTestResponse>('/api/dashboard/notifications/channels/test', {
      method: 'POST',
      body: {
        configId: notificationTestForm.configId,
        action: notificationTestForm.action,
        mode,
        resourceId: notificationTestForm.resourceId || undefined,
        metadata: parseJsonObject(notificationTestForm.metadataJson, 'metadata'),
      },
    })
    notificationTestResult.value = result
    saveMessage.value = mode === 'send'
      ? tt('dashboard.governance.notificationTest.sent', 'Notification channel test sent.')
      : tt('dashboard.governance.notificationTest.planned', 'Notification channel dry-run recorded.')
    await Promise.all([refreshSummary(), refreshAnalytics(), refreshReport(), refreshD1Readiness()])
  }
  catch (error) {
    notificationTestError.value = error instanceof Error ? error.message : tt('dashboard.governance.notificationTest.failed', 'Notification channel test failed.')
    saveMessage.value = ''
  }
  finally {
    notificationTesting.value = false
  }
}

async function notifyStorageAlerts(mode: 'plan' | 'send'): Promise<void> {
  if (storageAlertNotifying.value || storagePolicyAlerts.value.length === 0) {
    return
  }

  storageAlertNotifyError.value = ''
  storageAlertNotifyResult.value = null
  saveError.value = ''
  saveMessage.value = ''
  storageAlertNotifying.value = true

  try {
    const result = await requestJson<StorageAlertNotifyResponse>('/api/dashboard/storage/alerts/notify', {
      method: 'POST',
      body: {
        mode,
        days: summaryDays.value,
      },
    })
    storageAlertNotifyResult.value = result
    saveMessage.value = mode === 'send'
      ? tt('dashboard.governance.storageAlerts.sent', 'Storage alert notifications sent.')
      : tt('dashboard.governance.storageAlerts.planned', 'Storage alert notification dry-run recorded.')
    await Promise.all([refreshSummary(), refreshAnalytics(), refreshReport(), refreshStoragePolicies(), refreshStorageChannelAnalytics(), refreshD1Readiness()])
  }
  catch (error) {
    storageAlertNotifyError.value = error instanceof Error ? error.message : tt('dashboard.governance.storageAlerts.failed', 'Storage alert notification failed.')
    saveMessage.value = ''
  }
  finally {
    storageAlertNotifying.value = false
  }
}

async function smokeStoragePolicy(policyId: string, mode: StorageChannelSmokeMode): Promise<void> {
  if (storageSmokeRunning.value) {
    return
  }

  storageSmokeError.value = ''
  storageSmokeResult.value = null
  saveError.value = ''
  saveMessage.value = ''
  storageSmokeRunning.value = true

  try {
    const result = await requestJson<StorageChannelSmokeResponse>('/api/dashboard/storage/channels/smoke', {
      method: 'POST',
      body: {
        policyId,
        mode,
      },
    })
    storageSmokeResult.value = result
    saveMessage.value = result.status === 'failed'
      ? tt('dashboard.governance.storageSmoke.failed', 'Storage smoke failed.')
      : mode === 'write'
        ? tt('dashboard.governance.storageSmoke.sent', 'Storage write/read/delete smoke completed.')
        : tt('dashboard.governance.storageSmoke.ready', 'Storage channel dry-run completed.')
    await Promise.all([refreshSummary(), refreshAnalytics(), refreshReport(), refreshStoragePolicies(), refreshStorageChannelAnalytics(), refreshD1Readiness()])
  }
  catch (error) {
    storageSmokeError.value = error instanceof Error ? error.message : tt('dashboard.governance.storageSmoke.error', 'Storage smoke failed.')
    saveMessage.value = ''
  }
  finally {
    storageSmokeRunning.value = false
  }
}

async function refreshAll(): Promise<void> {
  await Promise.all([refreshSummary(), refreshConfigs(), refreshAnalytics(), refreshReport(), refreshStoragePolicies(), refreshStorageChannelAnalytics(), refreshStorageCredentials(), refreshNotificationCredentials(), refreshNotificationChannels(), refreshD1Readiness()])
}

function exportGovernanceReport(): void {
  const params = new URLSearchParams({
    days: String(summaryDays.value),
    limit: '5000',
    topLimit: '12',
    format: 'markdown',
  })
  window.open(`/api/dashboard/governance/report?${params.toString()}`, '_blank')
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.round(value))
}

function formatBytes(value: number): string {
  if (value <= 0)
    return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  const amount = value / 1024 ** index
  return `${amount >= 10 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`
}

function formatDurationMs(value: number): string {
  if (!Number.isFinite(value) || value <= 0)
    return '0 ms'
  if (value < 1000)
    return `${formatNumber(value)} ms`
  if (value < 60_000)
    return `${Math.round(value / 100) / 10} s`
  return `${Math.round(value / 6000) / 10} min`
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100) / 100}%`
}

function formatDelta(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatPercent(value)}`
}

function formatTrendWidth(value: number, peak: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(peak) || value <= 0 || peak <= 0)
    return '0%'
  return `${Math.min(100, Math.max(4, Math.round((value / peak) * 100)))}%`
}

function formatHeatmapCellOpacity(value: number, peak: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(peak) || value <= 0 || peak <= 0)
    return '0.08'
  return String(Math.min(0.96, Math.max(0.18, Math.round((value / peak) * 100) / 100)))
}

function formatWeekdayLabel(dayOfWeek: number): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek] ?? String(dayOfWeek)
}

function formatDate(value: string): string {
  if (!value) {
    return '-'
  }
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value
}

function formatShortDate(value: string): string {
  if (!value)
    return '-'
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString() : value
}

function configTypeLabel(type: GovernanceConfigType): string {
  if (type === 'analytics_collection')
    return tt('dashboard.governance.types.analytics', 'Analytics')
  if (type === 'storage_channel')
    return tt('dashboard.governance.types.storage', 'Storage')
  if (type === 'notification_channel')
    return tt('dashboard.governance.types.notification', 'Notification')
  return tt('dashboard.governance.types.providerQuota', 'Provider quota')
}

function storageEvaluationTone(status: StoragePolicyEvaluationStatus): StatusTone {
  if (status === 'ok')
    return 'success'
  if (status === 'warning')
    return 'warning'
  if (status === 'blocked')
    return 'danger'
  return 'muted'
}

function storageEvaluationLabel(status: StoragePolicyEvaluationStatus): string {
  if (status === 'ok')
    return tt('dashboard.governance.storagePolicy.ok', 'OK')
  if (status === 'warning')
    return tt('dashboard.governance.storagePolicy.warning', 'Warning')
  if (status === 'blocked')
    return tt('dashboard.governance.storagePolicy.blocked', 'Blocked')
  return tt('dashboard.governance.storagePolicy.disabled', 'Disabled')
}

function storageChannelPressureTone(status: StorageChannelPressureStatus): StatusTone {
  return status === 'unmanaged' ? 'info' : storageEvaluationTone(status)
}

function storageChannelPressureLabel(status: StorageChannelPressureStatus): string {
  if (status === 'unmanaged')
    return tt('dashboard.governance.analytics.storageChannelUnmanaged', 'Unmanaged')
  return storageEvaluationLabel(status)
}

function storageSmokeEvidenceTone(status: StorageSmokeEvidenceStatus): StatusTone {
  if (status === 'failed')
    return 'danger'
  if (status === 'sent' || status === 'ready')
    return 'success'
  return 'info'
}

function storageSmokeEvidenceLabel(status: StorageSmokeEvidenceStatus): string {
  if (status === 'ready')
    return tt('dashboard.governance.storageSmoke.readyStatus', 'Ready')
  if (status === 'sent')
    return tt('dashboard.governance.storageSmoke.sentStatus', 'Sent')
  return tt('dashboard.governance.storageSmoke.failedStatus', 'Failed')
}

function providerQuotaTone(status: ProviderQuotaStatus): StatusTone {
  return storageEvaluationTone(status)
}

function providerQuotaLabel(status: ProviderQuotaStatus): string {
  if (status === 'ok')
    return tt('dashboard.governance.providerQuota.ok', 'OK')
  if (status === 'warning')
    return tt('dashboard.governance.providerQuota.warning', 'Warning')
  if (status === 'blocked')
    return tt('dashboard.governance.providerQuota.blocked', 'Blocked')
  return tt('dashboard.governance.providerQuota.disabled', 'Disabled')
}

function providerQuotaSmokeTone(status: ProviderQuotaSmokeStatus): StatusTone {
  if (status === 'blocked')
    return 'danger'
  if (status === 'failed')
    return 'warning'
  if (status === 'consumed' || status === 'allowed')
    return 'success'
  return 'info'
}

function providerQuotaSmokeLabel(status: ProviderQuotaSmokeStatus): string {
  if (status === 'allowed')
    return tt('dashboard.governance.providerQuotaSmoke.allowed', 'Allowed')
  if (status === 'consumed')
    return tt('dashboard.governance.providerQuotaSmoke.consumed', 'Consumed')
  if (status === 'blocked')
    return tt('dashboard.governance.providerQuotaSmoke.blocked', 'Blocked')
  return tt('dashboard.governance.providerQuotaSmoke.failed', 'Failed')
}

function providerQuotaRiskReasonLabel(reason: ProviderQuotaRiskReason): string {
  if (reason === 'overage')
    return tt('dashboard.governance.analytics.providerQuotaRiskOverage', 'Over limit')
  if (reason === 'low-remaining')
    return tt('dashboard.governance.analytics.providerQuotaRiskLowRemaining', 'Low remaining')
  if (reason === 'projected-exhaustion')
    return tt('dashboard.governance.analytics.providerQuotaRiskProjected', 'Projected exhaustion')
  if (reason === 'blocked')
    return tt('dashboard.governance.analytics.providerQuotaRiskBlocked', 'Blocked')
  return tt('dashboard.governance.analytics.providerQuotaRiskWarning', 'Warning threshold')
}

function providerQuotaActionTone(priority: ProviderQuotaActionQueuePriority): StatusTone {
  if (priority === 'critical')
    return 'danger'
  if (priority === 'high')
    return 'warning'
  if (priority === 'medium')
    return 'info'
  return 'muted'
}

function providerQuotaActionReasonLabel(reason: ProviderQuotaActionQueueReason): string {
  if (reason === 'token-overage')
    return tt('dashboard.governance.analytics.providerQuotaActionTokenOverage', 'Token overage')
  if (reason === 'request-overage')
    return tt('dashboard.governance.analytics.providerQuotaActionRequestOverage', 'Request overage')
  if (reason === 'token-exhausted')
    return tt('dashboard.governance.analytics.providerQuotaActionTokenExhausted', 'Tokens exhausted')
  if (reason === 'request-exhausted')
    return tt('dashboard.governance.analytics.providerQuotaActionRequestExhausted', 'Requests exhausted')
  if (reason === 'projected-exhaustion')
    return tt('dashboard.governance.analytics.providerQuotaActionProjected', 'Projected exhaustion')
  if (reason === 'quota-disabled')
    return tt('dashboard.governance.analytics.providerQuotaActionDisabled', 'Quota disabled')
  if (reason === 'missing-hard-limit')
    return tt('dashboard.governance.analytics.providerQuotaActionMissingLimit', 'Missing hard limit')
  return tt('dashboard.governance.analytics.providerQuotaActionWarning', 'Warning threshold')
}

function reportStatusTone(status: PlatformGovernanceReportStatus): StatusTone {
  if (status === 'critical')
    return 'danger'
  if (status === 'watch')
    return 'warning'
  return 'success'
}

function reportStatusLabel(status: PlatformGovernanceReportStatus): string {
  if (status === 'critical')
    return tt('dashboard.governance.report.critical', 'Critical')
  if (status === 'watch')
    return tt('dashboard.governance.report.watch', 'Watch')
  return tt('dashboard.governance.report.ok', 'OK')
}

function reportEvidenceTone(status: PlatformGovernanceReportEvidenceStatus): StatusTone {
  if (isProductionEvidenceSource(status))
    return 'success'
  if (isFallbackEvidenceSource(status))
    return 'warning'
  return 'muted'
}

function reportEvidenceLabel(status: PlatformGovernanceReportEvidenceStatus): string {
  if (status === 'live')
    return tt('dashboard.governance.report.evidenceLive', 'Live')
  if (status === 'd1')
    return tt('dashboard.governance.report.evidenceD1', 'D1')
  if (status === 'r2')
    return tt('dashboard.governance.report.evidenceR2', 'R2')
  if (status === 'local-only')
    return tt('dashboard.governance.report.evidenceLocalOnly', 'Local only')
  if (status === 'memory')
    return tt('dashboard.governance.report.evidenceMemory', 'Memory')
  return tt('dashboard.governance.report.evidenceOpen', 'Open')
}

function reportPriorityTone(priority: PlatformGovernanceReportPriority): StatusTone {
  if (priority === 'critical')
    return 'danger'
  if (priority === 'high')
    return 'warning'
  if (priority === 'medium')
    return 'info'
  return 'muted'
}

function storageAlertMetricLabel(metric: StorageAlertMetric): string {
  if (metric === 'storedBytes')
    return tt('dashboard.governance.storageAlerts.storedBytes', 'Stored bytes')
  if (metric === 'trafficBytes')
    return tt('dashboard.governance.storageAlerts.trafficBytes', 'Traffic bytes')
  return tt('dashboard.governance.storageAlerts.operations', 'Operations')
}

function formatStorageAlertValue(alert: StoragePolicyAlert, value: number | null): string {
  if (value == null)
    return '-'
  return alert.metric === 'operations' ? formatNumber(value) : formatBytes(value)
}

function formatStorageBudgetValue(value: number | null, unit: 'bytes' | 'operations'): string {
  if (value == null)
    return '-'
  return unit === 'operations' ? formatNumber(value) : formatBytes(value)
}

function formatProjectedDays(value: number | null): string {
  return value == null ? '-' : `${formatNumber(value)}d`
}

function notificationDeliveryTone(status: NotificationDeliveryStatus): StatusTone {
  if (status === 'sent')
    return 'success'
  if (status === 'failed')
    return 'danger'
  if (status === 'skipped')
    return 'warning'
  return 'info'
}

function notificationChannelTone(status: NotificationChannelDisplayStatus): StatusTone {
  if (status === 'warning')
    return 'warning'
  if (status === 'disabled')
    return 'muted'
  return 'success'
}

function notificationChannelLabel(status: NotificationChannelDisplayStatus): string {
  if (status === 'warning')
    return tt('dashboard.governance.analytics.notificationChannelWarning', 'Warning')
  if (status === 'disabled')
    return tt('dashboard.governance.analytics.notificationChannelDisabled', 'Disabled')
  return tt('dashboard.governance.analytics.notificationChannelOk', 'OK')
}

function notificationActionQueueStatusLabel(item: NotificationActionQueueItem): string {
  if (item.source === 'delivery-health')
    return tt('dashboard.governance.analytics.notificationDeliveryRisk', 'Delivery risk')
  return notificationChannelLabel(item.status as NotificationChannelRiskStatus)
}

function notificationChannelCredentialLabel(channel: { credentialRequired: boolean, hasCredentialRef?: boolean, credentialRef?: string | null }): string {
  if (!channel.credentialRequired)
    return tt('dashboard.governance.analytics.notificationChannelCredentialNotRequired', 'no credential required')
  return (channel.hasCredentialRef ?? Boolean(channel.credentialRef))
    ? tt('dashboard.governance.analytics.notificationChannelCredentialBound', 'credentialRef bound')
    : tt('dashboard.governance.analytics.notificationChannelCredentialMissing', 'credentialRef missing')
}

function notificationChannelReadinessLabel(channel: { readiness: { productionReady: boolean, reasons: string[] } }): string {
  if (channel.readiness.productionReady)
    return tt('dashboard.governance.analytics.notificationChannelProductionReady', 'production ready')
  return channel.readiness.reasons.join(', ') || tt('dashboard.governance.analytics.notificationChannelReadinessPending', 'readiness pending')
}

function formatRatio(value: number | null): string {
  return value == null ? '-' : formatPercent(value)
}

function d1ReadinessTone(status: PlatformGovernanceD1ReadinessStatus): StatusTone {
  if (status === 'ready')
    return 'success'
  if (status === 'warning')
    return 'warning'
  return 'danger'
}

function d1ReadinessLabel(status: PlatformGovernanceD1ReadinessStatus): string {
  if (status === 'ready')
    return tt('dashboard.governance.d1Readiness.ready', 'Ready')
  if (status === 'warning')
    return tt('dashboard.governance.d1Readiness.warning', 'Needs backfill')
  return tt('dashboard.governance.d1Readiness.blocked', 'Blocked')
}

function formatD1MissingObjects(check: PlatformGovernanceD1ReadinessCheck): string {
  return [...check.missingTables, ...check.missingIndexes].join(', ')
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="apple-heading-md">
          {{ tt('dashboard.governance.title', 'Data Governance') }}
        </h1>
        <p class="mt-2 max-w-3xl text-sm text-black/50 dark:text-white/50">
          {{ tt('dashboard.governance.subtitle', 'Manage anonymized analytics, upload health, storage limits, notification channels, and provider quotas from one control surface.') }}
        </p>
      </div>
      <TxButton variant="secondary" size="small" :disabled="governancePagePending" @click="refreshAll">
        <TxSpinner v-if="governancePagePending" :size="14" />
        <span :class="governancePagePending ? 'ml-2' : ''">{{ t('common.refresh', 'Refresh') }}</span>
      </TxButton>
    </header>

    <div v-if="!isAdmin" class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
      {{ tt('dashboard.governance.adminOnly', 'Only administrators can manage data governance.') }}
    </div>

    <div v-if="summaryError || configsError || analyticsError || reportError || storagePoliciesError || storageChannelAnalyticsError || storageCredentialsError || notificationCredentialsError || notificationChannelsError || d1ReadinessError || saveError || notificationTestError" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-200">
      {{ saveError || notificationTestError || storageAlertNotifyError || (summaryError as any)?.message || (configsError as any)?.message || (analyticsError as any)?.message || (reportError as any)?.message || (storagePoliciesError as any)?.message || (storageChannelAnalyticsError as any)?.message || (storageCredentialsError as any)?.message || (notificationCredentialsError as any)?.message || (notificationChannelsError as any)?.message || (d1ReadinessError as any)?.message }}
    </div>

    <div v-if="saveMessage" class="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
      {{ saveMessage }}
    </div>

    <section class="apple-card-lg p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-black dark:text-white">
            {{ tt('dashboard.governance.report.title', 'Operations report snapshot') }}
          </h2>
          <p class="mt-1 text-xs text-black/50 dark:text-white/50">
            {{ tt('dashboard.governance.report.subtitle', 'Read-only executive snapshot built from anonymized governance aggregates.') }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <TxButton variant="secondary" size="small" :disabled="reportHydratedPending" @click="exportGovernanceReport">
            {{ tt('dashboard.governance.report.exportMarkdown', 'Export Markdown') }}
          </TxButton>
          <TxStatusBadge :text="reportStatusLabel(governanceReport.report.status)" size="sm" :status="reportStatusTone(governanceReport.report.status)" />
          <span class="text-xs text-black/45 dark:text-white/45">{{ formatDate(governanceReport.generatedAt) }}</span>
        </div>
      </div>

      <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div v-for="item in governanceReport.report.scorecards" :key="`governance-report-score:${item.key}`" class="rounded-lg bg-white/70 p-3 text-xs dark:bg-white/[0.03]">
          <div class="flex items-center justify-between gap-2">
            <p class="font-semibold text-black/70 dark:text-white/70">
              {{ item.label }}
            </p>
            <TxStatusBadge :text="reportStatusLabel(item.status)" size="sm" :status="reportStatusTone(item.status)" />
          </div>
          <p class="mt-2 text-xl font-semibold text-black dark:text-white">
            {{ formatNumber(item.value) }}
            <span class="text-xs font-normal text-black/40 dark:text-white/40">{{ item.unit }}</span>
          </p>
          <p class="mt-1 truncate text-black/45 dark:text-white/45">
            <span v-if="item.total !== null">{{ formatNumber(item.total) }} total</span>
            <span v-if="item.delta !== null"> · {{ formatDelta(item.delta) }}</span>
            <span v-if="item.rate !== null"> · {{ formatPercent(item.rate) }}</span>
          </p>
          <p v-if="item.reason" class="mt-1 truncate text-black/40 dark:text-white/40">
            {{ item.reason }}
          </p>
        </div>
      </div>

      <div class="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div class="rounded-lg bg-white/70 p-3 text-xs dark:bg-white/[0.03]">
          <div class="flex items-center justify-between gap-3">
            <p class="font-semibold text-black dark:text-white">
              {{ tt('dashboard.governance.report.evidence', 'Evidence status') }}
            </p>
            <span class="text-black/40 dark:text-white/40">{{ formatNumber(governanceReport.report.evidenceStatus.length) }}</span>
          </div>
          <div class="mt-3 grid gap-2">
            <div v-for="item in governanceReport.report.evidenceStatus" :key="`governance-report-evidence:${item.key}`" class="flex items-center justify-between gap-3 rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
              <div class="min-w-0">
                <p class="truncate font-medium text-black/70 dark:text-white/70">
                  {{ item.label }}
                </p>
                <p class="truncate text-black/40 dark:text-white/40">
                  {{ formatNumber(item.evidenceCount) }} evidence · {{ item.blocker || '-' }}
                </p>
              </div>
              <TxStatusBadge :text="reportEvidenceLabel(item.status)" size="sm" :status="reportEvidenceTone(item.status)" />
            </div>
          </div>
        </div>

        <div class="rounded-lg bg-white/70 p-3 text-xs dark:bg-white/[0.03]">
          <div class="flex items-center justify-between gap-3">
            <p class="font-semibold text-black dark:text-white">
              {{ tt('dashboard.governance.report.riskQueue', 'Report risk queue') }}
            </p>
            <span class="text-black/40 dark:text-white/40">{{ formatNumber(governanceReport.report.riskQueue.length) }}</span>
          </div>
          <div v-if="governanceReport.report.riskQueue.length" class="mt-3 grid gap-2">
            <div v-for="item in governanceReport.report.riskQueue.slice(0, 6)" :key="`governance-report-risk:${item.key}`" class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
              <div class="flex items-center justify-between gap-2">
                <p class="truncate font-medium text-black/70 dark:text-white/70">
                  {{ item.area }} · {{ item.suggestedAction }}
                </p>
                <TxStatusBadge :text="item.priority" size="sm" :status="reportPriorityTone(item.priority)" />
              </div>
              <p class="mt-1 truncate text-black/45 dark:text-white/45">
                {{ item.reason }} · {{ item.status }} · {{ formatNumber(item.metric) }}
              </p>
            </div>
          </div>
          <p v-else class="mt-3 text-black/45 dark:text-white/45">
            {{ tt('dashboard.governance.report.riskQueueEmpty', 'No report risks in the current window.') }}
          </p>
        </div>
      </div>

      <div class="mt-4 grid gap-3 md:grid-cols-4">
        <div class="rounded-lg border border-black/[0.05] p-3 text-xs dark:border-white/[0.06]">
          <p class="text-black/45 dark:text-white/45">
            {{ tt('dashboard.governance.report.riskScore', 'Risk score') }}
          </p>
          <p class="mt-1 text-lg font-semibold text-black dark:text-white">
            {{ formatNumber(governanceReport.report.riskScore) }}
          </p>
        </div>
        <div class="rounded-lg border border-black/[0.05] p-3 text-xs dark:border-white/[0.06]">
          <p class="text-black/45 dark:text-white/45">
            {{ tt('dashboard.governance.report.operationsDays', 'Timeline days') }}
          </p>
          <p class="mt-1 text-lg font-semibold text-black dark:text-white">
            {{ formatNumber(governanceReport.report.trendSummary.operationsDays) }}
          </p>
        </div>
        <div class="rounded-lg border border-black/[0.05] p-3 text-xs dark:border-white/[0.06]">
          <p class="text-black/45 dark:text-white/45">
            {{ tt('dashboard.governance.report.peakTokens', 'Peak tokens') }}
          </p>
          <p class="mt-1 text-lg font-semibold text-black dark:text-white">
            {{ formatNumber(governanceReport.report.trendSummary.peakProviderTokens) }}
          </p>
        </div>
        <div class="rounded-lg border border-black/[0.05] p-3 text-xs dark:border-white/[0.06]">
          <p class="text-black/45 dark:text-white/45">
            {{ tt('dashboard.governance.report.latestDate', 'Latest date') }}
          </p>
          <p class="mt-1 text-lg font-semibold text-black dark:text-white">
            {{ formatShortDate(governanceReport.report.trendSummary.latestDate || '') }}
          </p>
        </div>
      </div>
    </section>

    <section class="grid gap-4 md:grid-cols-4">
      <div class="apple-card-lg p-5">
        <p class="apple-section-title">
          {{ tt('dashboard.governance.summary.events', 'Events') }}
        </p>
        <p class="mt-2 text-3xl font-semibold text-black dark:text-white">
          {{ formatNumber(summaryData.totalEvents) }}
        </p>
      </div>
      <div class="apple-card-lg p-5">
        <p class="apple-section-title">
          {{ tt('dashboard.governance.summary.quantity', 'Quantity') }}
        </p>
        <p class="mt-2 text-3xl font-semibold text-black dark:text-white">
          {{ formatNumber(summaryData.totalQuantity) }}
        </p>
      </div>
      <div class="apple-card-lg p-5">
        <p class="apple-section-title">
          {{ tt('dashboard.governance.summary.actors', 'Unique actors') }}
        </p>
        <p class="mt-2 text-3xl font-semibold text-black dark:text-white">
          {{ formatNumber(summaryData.uniqueActors) }}
        </p>
      </div>
      <div class="apple-card-lg p-5">
        <p class="apple-section-title">
          {{ tt('dashboard.governance.summary.policies', 'Policies') }}
        </p>
        <p class="mt-2 text-3xl font-semibold text-black dark:text-white">
          {{ formatNumber(configs.length) }}
        </p>
      </div>
    </section>

    <section class="apple-card-lg p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-black dark:text-white">
            {{ tt('dashboard.governance.d1Readiness.title', 'D1 migration readiness') }}
          </h2>
          <p class="mt-1 text-xs text-black/50 dark:text-white/50">
            {{ tt('dashboard.governance.d1Readiness.subtitle', 'Read-only production schema, index, seed, and backfill checks for Data Governance.') }}
          </p>
        </div>
        <TxStatusBadge
          :text="d1ReadinessLabel(d1Readiness.status)"
          size="sm"
          :status="d1ReadinessTone(d1Readiness.status)"
        />
      </div>

      <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div class="rounded-xl border border-black/[0.06] bg-black/[0.015] p-3 dark:border-white/[0.08] dark:bg-white/[0.025]">
          <p class="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40">
            {{ tt('dashboard.governance.d1Readiness.database', 'Database') }}
          </p>
          <p class="mt-1 text-sm font-semibold text-black dark:text-white">
            {{ d1Readiness.database.present ? (d1Readiness.database.binding || 'DB') : tt('dashboard.governance.d1Readiness.missing', 'Missing') }}
          </p>
        </div>
        <div class="rounded-xl border border-black/[0.06] bg-black/[0.015] p-3 dark:border-white/[0.08] dark:bg-white/[0.025]">
          <p class="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40">
            {{ tt('dashboard.governance.d1Readiness.checks', 'Checks') }}
          </p>
          <p class="mt-1 text-sm font-semibold text-black dark:text-white">
            {{ formatNumber(d1Readiness.summary.ready) }} / {{ formatNumber(d1Readiness.summary.total) }}
          </p>
        </div>
        <div class="rounded-xl border border-black/[0.06] bg-black/[0.015] p-3 dark:border-white/[0.08] dark:bg-white/[0.025]">
          <p class="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40">
            {{ tt('dashboard.governance.d1Readiness.tables', 'Missing tables') }}
          </p>
          <p class="mt-1 text-sm font-semibold text-black dark:text-white">
            {{ formatNumber(d1Readiness.summary.missingTables) }}
          </p>
        </div>
        <div class="rounded-xl border border-black/[0.06] bg-black/[0.015] p-3 dark:border-white/[0.08] dark:bg-white/[0.025]">
          <p class="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40">
            {{ tt('dashboard.governance.d1Readiness.indexes', 'Missing indexes') }}
          </p>
          <p class="mt-1 text-sm font-semibold text-black dark:text-white">
            {{ formatNumber(d1Readiness.summary.missingIndexes) }}
          </p>
        </div>
        <div class="rounded-xl border border-black/[0.06] bg-black/[0.015] p-3 dark:border-white/[0.08] dark:bg-white/[0.025]">
          <p class="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40">
            {{ tt('dashboard.governance.d1Readiness.backfill', 'Backfill') }}
          </p>
          <p class="mt-1 text-sm font-semibold text-black dark:text-white">
            {{ formatNumber(d1Readiness.summary.backfillRequired) }}
          </p>
        </div>
      </div>

      <div v-if="d1ReadinessGaps.length" class="mt-4 space-y-2">
        <div v-for="check in d1ReadinessGaps.slice(0, 8)" :key="check.id" class="rounded-xl border border-black/[0.06] bg-black/[0.015] p-3 dark:border-white/[0.08] dark:bg-white/[0.025]">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-sm font-medium text-black dark:text-white">
                {{ check.label }}
              </p>
              <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                {{ check.reasons.join(', ') || '-' }}
              </p>
            </div>
            <TxStatusBadge :text="d1ReadinessLabel(check.status)" size="sm" :status="d1ReadinessTone(check.status)" />
          </div>
          <p v-if="check.missingTables.length || check.missingIndexes.length" class="mt-2 text-xs text-black/45 dark:text-white/45">
            {{ tt('dashboard.governance.d1Readiness.missingObjects', 'Missing') }}:
            {{ formatD1MissingObjects(check) }}
          </p>
          <p v-if="check.minimumCount !== null" class="mt-1 text-xs text-black/40 dark:text-white/40">
            {{ tt('dashboard.governance.d1Readiness.observed', 'Observed') }}:
            {{ formatNumber(check.observedCount ?? 0) }} / {{ formatNumber(check.minimumCount) }}
          </p>
        </div>
      </div>
      <p v-else class="mt-4 text-xs text-black/45 dark:text-white/45">
        {{ tt('dashboard.governance.d1Readiness.empty', 'All required D1 checks are ready.') }}
      </p>
    </section>

    <section class="apple-card-lg p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-black dark:text-white">
            {{ tt('dashboard.governance.analytics.title', 'Analytics cockpit') }}
          </h2>
          <p class="mt-1 text-xs text-black/50 dark:text-white/50">
            {{ tt('dashboard.governance.analytics.subtitle', 'Aggregated from hashed governance events; query text and raw actor identifiers stay out of the report.') }}
          </p>
        </div>
        <span class="text-xs text-black/45 dark:text-white/45">
          {{ formatDate(analyticsData.generatedAt) }}
        </span>
      </div>

      <div class="mt-5 rounded-xl border border-black/[0.06] bg-black/[0.015] p-4 dark:border-white/[0.08] dark:bg-white/[0.025]">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-black dark:text-white">
              {{ tt('dashboard.governance.analytics.operationsDashboard', 'Operations dashboard') }}
            </h3>
            <p class="mt-1 text-xs text-black/45 dark:text-white/45">
              {{ tt('dashboard.governance.analytics.operationsDashboardHint', 'Growth, leaderboard, risk, token, and model distribution signals for daily review.') }}
            </p>
          </div>
          <TxStatusBadge
            :text="dashboardRiskTotal ? tt('dashboard.governance.analytics.dashboardRiskWatch', 'Risk watch') : tt('dashboard.governance.analytics.dashboardRiskClear', 'Clear')"
            size="sm"
            :status="dashboardRiskTotal ? 'warning' : 'success'"
          />
        </div>

        <div
          v-if="dashboardOperationsLatest"
          class="mt-4 rounded-lg bg-white/70 p-4 text-xs dark:bg-white/[0.03]"
        >
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="font-semibold text-black dark:text-white">
                {{ tt('dashboard.governance.analytics.dashboardOperationsCommandBoard', 'Operations command board') }}
              </p>
              <p class="mt-1 text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.dashboardOperationsCommandBoardHint', 'Latest daily posture for growth, demand, model cost, and risk.') }}
              </p>
            </div>
            <div class="text-right">
              <p class="text-black/40 dark:text-white/40">
                {{ tt('dashboard.governance.analytics.dashboardOperationsLatestSample', 'Latest sample') }}
              </p>
              <p class="mt-1 font-semibold text-black dark:text-white">
                {{ formatShortDate(dashboardOperationsLatest.date) }}
              </p>
            </div>
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-4">
            <div>
              <p class="text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.dashboardOperationsLatestSearches', 'Searches') }}
              </p>
              <p class="mt-1 text-xl font-semibold text-black dark:text-white">
                {{ formatNumber(dashboardOperationsLatest.searches) }}
              </p>
              <p class="mt-1 text-black/45 dark:text-white/45">
                {{ formatPercent(dashboardOperationsLatest.searchSelectionRate) }} selected
              </p>
            </div>
            <div>
              <p class="text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.dashboardOperationsLatestPlugins', 'Plugin installs') }}
              </p>
              <p class="mt-1 text-xl font-semibold text-black dark:text-white">
                {{ formatNumber(dashboardOperationsLatest.pluginInstalls) }}
              </p>
              <p class="mt-1 text-black/45 dark:text-white/45">
                {{ formatNumber(dashboardOperationsLatest.pluginInvocations) }} calls
              </p>
            </div>
            <div>
              <p class="text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.dashboardOperationsLatestTokens', 'Provider tokens') }}
              </p>
              <p class="mt-1 text-xl font-semibold text-black dark:text-white">
                {{ formatNumber(dashboardOperationsLatest.providerTokens) }}
              </p>
              <p class="mt-1 text-black/45 dark:text-white/45">
                {{ formatNumber(dashboardOperationsLatest.providerRequests) }} req
              </p>
            </div>
            <div>
              <p class="text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.dashboardOperationsLatestRisk', 'Risk score') }}
              </p>
              <p class="mt-1 text-xl font-semibold text-black dark:text-white">
                {{ formatNumber(dashboardOperationsLatest.riskScore) }}
              </p>
              <p class="mt-1 text-black/45 dark:text-white/45">
                {{ formatNumber(dashboardOperationsLatest.searchProblems) }} search · {{ formatNumber(dashboardOperationsLatest.uploadFailed) }} upload
              </p>
            </div>
          </div>

          <div class="mt-4 grid gap-3 lg:grid-cols-4">
            <div
              v-for="item in dashboardOperationsTimeline.slice(-8)"
              :key="`dashboard-operations-command:${item.date}`"
              class="grid gap-2 border-t border-black/[0.06] pt-3 dark:border-white/[0.08]"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium text-black/70 dark:text-white/70">{{ formatShortDate(item.date) }}</span>
                <span class="text-black/40 dark:text-white/40">{{ formatNumber(item.riskScore) }} risk</span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                <div class="h-full rounded-full bg-emerald-500/70" :style="{ width: formatTrendWidth(item.searches, dashboardOperationsPeaks.searches) }" />
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                <div class="h-full rounded-full bg-sky-500/70" :style="{ width: formatTrendWidth(item.pluginInstalls, dashboardOperationsPeaks.pluginInstalls) }" />
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                <div class="h-full rounded-full bg-violet-500/70" :style="{ width: formatTrendWidth(item.providerTokens, dashboardOperationsPeaks.providerTokens) }" />
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                <div class="h-full rounded-full bg-amber-500/70" :style="{ width: formatTrendWidth(item.riskScore, dashboardOperationsPeaks.riskScore) }" />
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div class="rounded-lg bg-white/70 p-3 text-xs dark:bg-white/[0.03]">
              <p class="text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.dashboardUserGrowth', 'User growth') }}
              </p>
              <p class="mt-1 text-lg font-semibold text-black dark:text-white">
                +{{ formatNumber(analyticsData.dashboard.growth.userSignups.latestQuantity) }}
              </p>
              <p class="mt-1 truncate text-black/45 dark:text-white/45">
                {{ formatNumber(analyticsData.dashboard.growth.userSignups.cumulative) }} total · {{ formatDelta(analyticsData.dashboard.growth.userSignups.growthRate) }} · {{ formatShortDate(analyticsData.dashboard.growth.userSignups.latestDate || '') }}
              </p>
            </div>
            <div class="rounded-lg bg-white/70 p-3 text-xs dark:bg-white/[0.03]">
              <p class="text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.dashboardSearchTrend', 'Search trend') }}
              </p>
              <p class="mt-1 text-lg font-semibold text-black dark:text-white">
                {{ formatNumber(analyticsData.dashboard.growth.searches.latestQuantity) }}
              </p>
              <p class="mt-1 truncate text-black/45 dark:text-white/45">
                {{ formatPercent(analyticsData.dashboard.growth.searches.selectionRate) }} selected · {{ formatPercent(analyticsData.dashboard.growth.searches.problemRate) }} problem
              </p>
            </div>
            <div class="rounded-lg bg-white/70 p-3 text-xs dark:bg-white/[0.03]">
              <p class="text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.dashboardPluginInstalls', 'Plugin installs') }}
              </p>
              <p class="mt-1 text-lg font-semibold text-black dark:text-white">
                {{ formatNumber(analyticsData.dashboard.growth.pluginInstalls.latestQuantity) }}
              </p>
              <p class="mt-1 truncate text-black/45 dark:text-white/45">
                {{ formatNumber(analyticsData.dashboard.growth.pluginInstalls.total) }} total · {{ formatDelta(analyticsData.dashboard.growth.pluginInstalls.growthRate) }}
              </p>
            </div>
            <div class="rounded-lg bg-white/70 p-3 text-xs dark:bg-white/[0.03]">
              <p class="text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.dashboardTokens', 'Tokens') }}
              </p>
              <p class="mt-1 text-lg font-semibold text-black dark:text-white">
                {{ formatNumber(analyticsData.dashboard.growth.providerUsage.tokens) }}
              </p>
              <p class="mt-1 truncate text-black/45 dark:text-white/45">
                {{ formatNumber(analyticsData.dashboard.growth.providerUsage.requests) }} req · {{ formatNumber(analyticsData.dashboard.growth.providerUsage.latestTokens) }} latest
              </p>
            </div>
            <div class="rounded-lg bg-white/70 p-3 text-xs dark:bg-white/[0.03]">
              <p class="text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.dashboardUploadStatus', 'Upload status') }}
              </p>
              <p class="mt-1 text-lg font-semibold text-black dark:text-white">
                {{ formatNumber(analyticsData.dashboard.growth.uploads.latestCompleted) }}/{{ formatNumber(analyticsData.dashboard.growth.uploads.latestStarted) }}
              </p>
              <p class="mt-1 truncate text-black/45 dark:text-white/45">
                {{ formatPercent(analyticsData.dashboard.growth.uploads.failureRate) }} failed · {{ formatPercent(analyticsData.dashboard.growth.uploads.stuckRate) }} stuck
              </p>
            </div>
            <div class="rounded-lg bg-white/70 p-3 text-xs dark:bg-white/[0.03]">
              <p class="text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.dashboardRiskTotal', 'Risk total') }}
              </p>
              <p class="mt-1 text-lg font-semibold text-black dark:text-white">
                {{ formatNumber(dashboardRiskTotal) }}
              </p>
              <p class="mt-1 truncate text-black/45 dark:text-white/45">
                {{ formatNumber(analyticsData.dashboard.riskSummary.storageAlerts) }} storage · {{ formatNumber(analyticsData.dashboard.riskSummary.providerQuotaWarning + analyticsData.dashboard.riskSummary.providerQuotaBlocked) }} quota
              </p>
            </div>
          </div>

          <div class="grid gap-3">
            <div class="rounded-lg bg-white/70 p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <p class="font-semibold text-black dark:text-white">
                  {{ tt('dashboard.governance.analytics.dashboardHotPlugins', 'Hot dashboard') }}
                </p>
                <span class="text-black/40 dark:text-white/40">{{ formatNumber(analyticsData.dashboard.leaderboards.hotPlugins.length) }}</span>
              </div>
              <div class="mt-2 grid gap-2">
                <div v-for="item in analyticsData.dashboard.leaderboards.hotPlugins.slice(0, 3)" :key="`dashboard-plugin:${item.pluginId}`" class="flex items-center justify-between gap-3">
                  <span class="truncate text-black/60 dark:text-white/60">{{ item.pluginId }}</span>
                  <span class="font-medium text-black dark:text-white">{{ formatNumber(item.hotScore) }} hot</span>
                </div>
                <p v-if="analyticsData.dashboard.leaderboards.hotPlugins.length === 0" class="text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.dashboardHotPluginsEmpty', 'No plugin leaderboard yet.') }}
                </p>
              </div>
            </div>
            <div class="rounded-lg bg-white/70 p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <p class="font-semibold text-black dark:text-white">
                  {{ tt('dashboard.governance.analytics.dashboardModelDistribution', 'Model distribution') }}
                </p>
                <span class="text-black/40 dark:text-white/40">{{ formatNumber(analyticsData.dashboard.leaderboards.topModels.length) }}</span>
              </div>
              <div class="mt-2 grid gap-2">
                <div v-for="item in analyticsData.dashboard.leaderboards.topModels.slice(0, 3)" :key="`dashboard-model:${item.model}`" class="flex items-center justify-between gap-3">
                  <span class="truncate text-black/60 dark:text-white/60">{{ item.model }}</span>
                  <span class="font-medium text-black dark:text-white">{{ formatNumber(item.tokens) }} tok</span>
                </div>
                <p v-if="analyticsData.dashboard.leaderboards.topModels.length === 0" class="text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.dashboardModelDistributionEmpty', 'No model usage yet.') }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-3 rounded-lg bg-white/70 p-3 text-xs dark:bg-white/[0.03]">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="font-semibold text-black dark:text-white">
                {{ tt('dashboard.governance.analytics.dashboardOperationsTimeline', 'Daily operations timeline') }}
              </p>
              <p class="mt-1 text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.dashboardOperationsTimelineHint', 'Daily aggregate of growth, search, plugin, provider, upload, and storage signals.') }}
              </p>
            </div>
            <span class="text-black/40 dark:text-white/40">
              {{ formatNumber(analyticsData.dashboard.trends.operationsTimeline.length) }}
            </span>
          </div>

          <div class="mt-3 grid gap-2">
            <div
              v-for="item in dashboardOperationsTimeline.slice(-6)"
              :key="`dashboard-operations-timeline:${item.date}`"
              class="rounded-lg border border-black/[0.05] p-3 dark:border-white/[0.06]"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="font-semibold text-black dark:text-white">
                  {{ formatShortDate(item.date) }}
                </p>
                <span
                  class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  :class="item.riskScore ? 'bg-amber-500/10 text-amber-700 dark:text-amber-200' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'"
                >
                  {{ item.riskScore ? `${formatNumber(item.riskScore)} risk` : tt('dashboard.governance.analytics.dashboardOperationsTimelineClear', 'clear') }}
                </span>
              </div>
              <div class="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <p class="truncate text-black/55 dark:text-white/55">
                  {{ tt('dashboard.governance.analytics.dashboardOperationsTimelineGrowth', 'Growth') }}:
                  <span class="font-medium text-black/75 dark:text-white/75">{{ formatNumber(item.userSignups) }} users · {{ formatDelta(item.userSignupGrowthRate) }}</span>
                </p>
                <p class="truncate text-black/55 dark:text-white/55">
                  {{ tt('dashboard.governance.analytics.dashboardOperationsTimelineSearch', 'Search') }}:
                  <span class="font-medium text-black/75 dark:text-white/75">{{ formatNumber(item.searches) }} · {{ formatPercent(item.searchSelectionRate) }} selected · {{ formatPercent(item.searchProblemRate) }} problem</span>
                </p>
                <p class="truncate text-black/55 dark:text-white/55">
                  {{ tt('dashboard.governance.analytics.dashboardOperationsTimelinePlugins', 'Plugins') }}:
                  <span class="font-medium text-black/75 dark:text-white/75">{{ formatNumber(item.pluginInstalls) }} installs · {{ formatNumber(item.pluginInvocations) }} calls</span>
                </p>
                <p class="truncate text-black/55 dark:text-white/55">
                  {{ tt('dashboard.governance.analytics.dashboardOperationsTimelineProvider', 'Provider') }}:
                  <span class="font-medium text-black/75 dark:text-white/75">{{ formatNumber(item.providerRequests) }} req · {{ formatNumber(item.providerTokens) }} tok</span>
                </p>
                <p class="truncate text-black/55 dark:text-white/55">
                  {{ tt('dashboard.governance.analytics.dashboardOperationsTimelineUpload', 'Upload') }}:
                  <span class="font-medium text-black/75 dark:text-white/75">{{ formatNumber(item.uploadCompleted) }}/{{ formatNumber(item.uploadStarted) }} ok · {{ formatNumber(item.uploadFailed) }} failed · {{ formatPercent(item.uploadFailureRate) }} · {{ formatBytes(item.uploadBytes) }}</span>
                </p>
                <p class="truncate text-black/55 dark:text-white/55">
                  {{ tt('dashboard.governance.analytics.dashboardOperationsTimelineStorage', 'Storage') }}:
                  <span class="font-medium text-black/75 dark:text-white/75">{{ formatBytes(item.storageBytes) }} · {{ formatNumber(item.storageOperations) }} ops</span>
                </p>
              </div>
            </div>
            <p v-if="dashboardOperationsTimeline.length === 0" class="text-black/45 dark:text-white/45">
              {{ tt('dashboard.governance.analytics.dashboardOperationsTimelineEmpty', 'No daily operations samples yet.') }}
            </p>
          </div>
        </div>
      </div>

      <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <p class="apple-section-title">
            {{ tt('dashboard.governance.analytics.searches', 'Searches') }}
          </p>
          <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
            {{ formatNumber(analyticsData.searches.totalEvents) }}
          </p>
          <p class="mt-1 text-xs text-black/45 dark:text-white/45">
            {{ formatDelta(analyticsData.searches.growth.eventGrowthRate) }}
          </p>
        </div>
        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <p class="apple-section-title">
            {{ tt('dashboard.governance.analytics.userSignups', 'User signups') }}
          </p>
          <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
            {{ formatNumber(analyticsData.users.signups) }}
          </p>
          <p class="mt-1 text-xs text-black/45 dark:text-white/45">
            {{ formatDelta(analyticsData.users.signupGrowth.eventGrowthRate) }}
          </p>
        </div>
        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <p class="apple-section-title">
            {{ tt('dashboard.governance.analytics.userGrowthTrend', 'User growth trend') }}
          </p>
          <div v-if="analyticsData.users.signupGrowthTrend.length" class="mt-3 space-y-2">
            <div
              v-for="item in analyticsData.users.signupGrowthTrend.slice(-3)"
              :key="`user-growth:${item.date}`"
              class="flex items-center justify-between gap-3 text-xs"
            >
              <span class="text-black/45 dark:text-white/45">{{ formatShortDate(item.date) }}</span>
              <span class="font-medium text-black dark:text-white">
                +{{ formatNumber(item.quantity) }} · {{ tt('dashboard.governance.analytics.userGrowthTotal', 'total') }} {{ formatNumber(item.cumulative) }} · {{ formatDelta(item.growthRate) }}
              </span>
            </div>
          </div>
          <p v-else class="mt-3 text-xs text-black/45 dark:text-white/45">
            {{ tt('dashboard.governance.analytics.userGrowthEmpty', 'No signup growth trend yet.') }}
          </p>
        </div>
        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <p class="apple-section-title">
            {{ tt('dashboard.governance.analytics.pluginInvokes', 'Plugin invokes') }}
          </p>
          <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
            {{ formatNumber(analyticsData.plugins.leaderboard.reduce((sum, item) => sum + item.invocations, 0)) }}
          </p>
          <p class="mt-1 text-xs text-black/45 dark:text-white/45">
            {{ formatNumber(analyticsData.plugins.uniqueActors) }} actors
          </p>
        </div>
        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <p class="apple-section-title">
            {{ tt('dashboard.governance.analytics.uploadHealth', 'Upload health') }}
          </p>
          <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
            {{ formatPercent(analyticsData.uploads.failureRate) }}
          </p>
          <p class="mt-1 text-xs text-black/45 dark:text-white/45">
            {{ formatBytes(analyticsData.uploads.bytes) }}
          </p>
        </div>
        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <p class="apple-section-title">
            {{ tt('dashboard.governance.analytics.notificationHealth', 'Notification health') }}
          </p>
          <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
            {{ formatPercent(analyticsData.notifications.deliveries.plannedRate) }}
          </p>
          <p class="mt-1 text-xs text-black/45 dark:text-white/45">
            {{ formatNumber(analyticsData.notifications.deliveries.sent) }} sent · {{ formatNumber(analyticsData.notifications.deliveries.failed) }} failed · {{ formatNumber(analyticsData.notifications.deliveries.skipped) }} skipped
          </p>
          <p class="mt-1 text-xs text-black/45 dark:text-white/45">
            {{ tt('dashboard.governance.analytics.notificationAvgDuration', 'Avg duration') }} · {{ formatDurationMs(analyticsData.notifications.deliveries.durationMs.average) }}
          </p>
        </div>
        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <p class="apple-section-title">
            {{ tt('dashboard.governance.analytics.providerTokens', 'Provider tokens') }}
          </p>
          <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
            {{ formatNumber(analyticsData.providers.usageSummary.tokens) }}
          </p>
          <p class="mt-1 text-xs text-black/45 dark:text-white/45">
            {{ formatNumber(analyticsData.providers.usageSummary.requests) }} req · {{ formatDelta(analyticsData.providers.growth.eventGrowthRate) }}
          </p>
        </div>
      </div>

      <div class="mt-5 grid gap-4 lg:grid-cols-2">
        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ tt('dashboard.governance.analytics.visitHotspot', 'Visit hotspot') }}
          </h3>
          <div class="mt-3 grid gap-2 text-sm">
            <div class="grid gap-2 rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.visitTotal', 'Visits') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.visits.totalEvents) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.visitActors', 'Actors') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.visits.uniqueActors) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.visitGrowth', 'Growth') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatDelta(analyticsData.visits.growth.eventGrowthRate) }}</span>
              </div>
            </div>
            <div v-for="item in analyticsData.visits.byRoute.slice(0, 5)" :key="`visit-route:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.visitRoute', 'Route') }} · {{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.visits.bySurface.slice(0, 4)" :key="`visit-surface:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ tt('dashboard.governance.analytics.visitSurface', 'Surface') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.visits.byLocalTimeSlot.slice(0, 4)" :key="`visit-slot:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ tt('dashboard.governance.analytics.visitLocalTimeSlot', 'Local time') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.visits.byLocalDayOfWeek.slice(0, 7)" :key="`visit-weekday:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ tt('dashboard.governance.analytics.visitLocalWeekday', 'Local weekday') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.visits.byCountry.slice(0, 4)" :key="`visit-country:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ tt('dashboard.governance.analytics.visitCountry', 'Country') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <p class="truncate text-xs text-black/45 dark:text-white/45">
              {{ tt('dashboard.governance.analytics.visitRegionTimezone', 'Region / timezone') }} · {{ analyticsData.visits.byRegion[0]?.key || 'unknown' }} · {{ analyticsData.visits.byTimezone[0]?.key || 'unknown' }}
            </p>
            <div v-for="item in analyticsData.visits.trend.slice(-3)" :key="`visit-trend:${item.date}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ formatShortDate(item.date) }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }} visits · {{ formatNumber(item.uniqueActors) }} actors</span>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ tt('dashboard.governance.analytics.searchBreakdown', 'Search context') }}
          </h3>
          <div class="mt-3 grid gap-2 text-sm">
            <div class="grid gap-2 rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchFilterRate', 'Filter rate') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatPercent(analyticsData.searches.filterUsage.filterRate) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchFirstResult', 'Avg first result') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.searches.latency.firstResultMs.average) }} ms</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchTotalDuration', 'Avg total duration') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.searches.latency.totalDurationMs.average) }} ms</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchResults', 'Avg results') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.searches.resultStats.resultCount.average) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchZeroResultRate', 'Zero-result rate') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatPercent(analyticsData.searches.reliabilitySummary.zeroResultRate) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchProblemRate', 'Problem rate') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatPercent(analyticsData.searches.reliabilitySummary.problemRate) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchSelectionRate', 'Selection rate') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatPercent(analyticsData.searches.selectionSummary.selectionRate) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchProviderProblems', 'Provider problems') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.searches.reliabilitySummary.providerErrors) }} err · {{ formatNumber(analyticsData.searches.reliabilitySummary.providerTimeouts) }} timeout</span>
              </div>
            </div>
            <div class="grid gap-2 rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchJourneyFunnel', 'Search journey funnel') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.searches.journey.total) }}</span>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div class="rounded-md bg-white/70 p-2 dark:bg-black/20">
                  <p class="text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.searchJourneyWithResults', 'With results') }}
                  </p>
                  <p class="mt-1 font-medium text-black dark:text-white">
                    {{ formatPercent(analyticsData.searches.journey.withResultsRate) }}
                  </p>
                </div>
                <div class="rounded-md bg-white/70 p-2 dark:bg-black/20">
                  <p class="text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.searchJourneySelected', 'Selected') }}
                  </p>
                  <p class="mt-1 font-medium text-black dark:text-white">
                    {{ formatPercent(analyticsData.searches.journey.selectionRate) }}
                  </p>
                </div>
                <div class="rounded-md bg-white/70 p-2 dark:bg-black/20">
                  <p class="text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.searchJourneyZeroResult', 'Zero result') }}
                  </p>
                  <p class="mt-1 font-medium text-black dark:text-white">
                    {{ formatPercent(analyticsData.searches.journey.zeroResultRate) }}
                  </p>
                </div>
                <div class="rounded-md bg-white/70 p-2 dark:bg-black/20">
                  <p class="text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.searchJourneyProviderProblem', 'Provider problem') }}
                  </p>
                  <p class="mt-1 font-medium text-black dark:text-white">
                    {{ formatPercent(analyticsData.searches.journey.problemRate) }}
                  </p>
                </div>
              </div>
            </div>
            <div
              v-for="item in analyticsData.searches.journey.segments.slice(0, 4)"
              :key="`search-journey:${item.key}`"
              class="grid gap-1 rounded-lg bg-black/[0.02] p-2 text-xs dark:bg-white/[0.03]"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="truncate text-black/60 dark:text-white/60">
                  {{ tt('dashboard.governance.analytics.searchJourneySegment', 'Journey segment') }} · {{ item.contextAppCategory }} · {{ item.localTimeSlot }}
                </span>
                <span class="font-medium text-black dark:text-white">{{ formatPercent(item.selectionRate) }}</span>
              </div>
              <div class="truncate text-black/45 dark:text-white/45">
                {{ item.contextSource }} · {{ item.entryPoint }} · {{ item.triggerType }} · {{ item.userPreferenceMode }}
              </div>
              <div class="truncate text-black/45 dark:text-white/45">
                {{ formatNumber(item.withResults) }} results · {{ formatNumber(item.selected) }} selected · {{ formatNumber(item.zeroResult) }} zero · {{ formatNumber(item.providerProblem) }} provider
              </div>
              <div class="truncate text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.searchPluginSelected', 'Selected') }} · {{ item.selectedPlugins.slice(0, 3).map(plugin => `${plugin.key} ${formatNumber(plugin.events)}`).join(' · ') || '—' }}
              </div>
            </div>
            <div v-for="item in analyticsData.searches.reliabilityTrend.slice(-3)" :key="`search-reliability:${item.date}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ item.date }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.zeroResult) }} zero · {{ formatNumber(item.providerErrors + item.providerTimeouts) }} provider</span>
            </div>
            <div
              v-for="item in analyticsData.searches.frequencyCohorts.slice(0, 4)"
              :key="`search-frequency-cohort:${item.cohort}`"
              class="grid gap-1 rounded-lg bg-black/[0.02] p-2 text-xs dark:bg-white/[0.03]"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="truncate text-black/60 dark:text-white/60">
                  {{ tt('dashboard.governance.analytics.searchFrequencyCohorts', 'Search frequency cohort') }} · {{ item.cohort }}
                </span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(item.users) }} users</span>
              </div>
              <div class="truncate text-black/45 dark:text-white/45">
                {{ formatNumber(item.searches) }} searches · {{ formatNumber(item.quantity) }} qty · {{ formatNumber(item.activeDays) }} active days
              </div>
              <div class="truncate text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.searchFrequencyAverage', 'Average') }} · {{ formatNumber(item.avgSearchesPerUser) }} searches/user · {{ formatNumber(item.avgActiveDaysPerUser) }} days/user
              </div>
              <div class="truncate text-black/45 dark:text-white/45">
                {{ formatPercent(item.selectionRate) }} selected · {{ formatPercent(item.zeroResultRate) }} zero · {{ formatPercent(item.problemRate) }} problem
              </div>
              <div class="truncate text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.searchLocalTimeSlot', 'Local time slot') }} · {{ item.topLocalTimeSlots.slice(0, 2).map(slot => `${slot.key} ${formatNumber(slot.events)}`).join(' · ') || '—' }}
              </div>
              <div class="truncate text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.searchPreference', 'Preference') }} · {{ item.topUserPreferenceModes.slice(0, 2).map(mode => `${mode.key} ${formatNumber(mode.events)}`).join(' · ') || '—' }}
              </div>
              <div class="truncate text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.searchPluginSelected', 'Selected') }} · {{ item.selectedPlugins.slice(0, 2).map(plugin => `${plugin.key} ${formatNumber(plugin.events)}`).join(' · ') || '—' }}
              </div>
            </div>
            <div class="grid gap-3 rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchTimeHeatmap', 'Search heatmap') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(searchTimeHeatmap.length) }}</span>
              </div>
              <div v-if="searchTimeHeatmapRows.length" class="overflow-x-auto">
                <div class="grid min-w-[360px] gap-1" :style="{ gridTemplateColumns: `48px repeat(${searchTimeHeatmapHours.length}, minmax(36px, 1fr))` }">
                  <div />
                  <div v-for="hour in searchTimeHeatmapHours" :key="`search-heatmap-hour:${hour}`" class="text-center text-[10px] text-black/45 dark:text-white/45">
                    {{ hour }}
                  </div>
                  <template v-for="row in searchTimeHeatmapRows" :key="`search-heatmap-row:${row.dayOfWeek}`">
                    <div class="flex h-8 items-center text-[10px] text-black/45 dark:text-white/45">
                      {{ row.label }}
                    </div>
                    <div
                      v-for="(cell, index) in row.cells"
                      :key="`search-heatmap-cell:${row.dayOfWeek}:${searchTimeHeatmapHours[index]}`"
                      class="flex h-8 items-center justify-center rounded-md border border-black/[0.03] text-[10px] font-medium text-black dark:border-white/[0.04] dark:text-white"
                      :class="cell ? '' : 'bg-black/[0.02] text-black/30 dark:bg-white/[0.02] dark:text-white/25'"
                      :style="cell ? { backgroundColor: `rgba(16, 185, 129, ${formatHeatmapCellOpacity(cell.events, searchTimeHeatmapPeak)})` } : undefined"
                      :title="cell ? `${row.label} ${cell.hour}:00 · ${formatNumber(cell.events)} searches · ${formatPercent(cell.selectionRate)} selected · ${formatPercent(cell.problemRate)} problem` : `${row.label} ${searchTimeHeatmapHours[index]}:00`"
                    >
                      {{ cell ? formatNumber(cell.events) : '0' }}
                    </div>
                  </template>
                </div>
              </div>
              <p v-else class="text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.searchTimeHeatmapEmpty', 'No local-time search heatmap yet.') }}
              </p>
              <div v-for="item in searchTimeHeatmapTop" :key="`search-heatmap-top:${item.dayOfWeek}:${item.hour}`" class="grid gap-1 rounded-md bg-white/70 p-2 dark:bg-black/20">
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate text-black/60 dark:text-white/60">{{ formatWeekdayLabel(item.dayOfWeek) }} · {{ item.hour }}:00 · {{ item.timeSlot }}</span>
                  <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
                </div>
                <div class="truncate text-black/45 dark:text-white/45">
                  {{ formatPercent(item.selectionRate) }} selected · {{ formatPercent(item.zeroResultRate) }} zero · {{ formatPercent(item.problemRate) }} problem
                </div>
                <div class="truncate text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.searchContextApp', 'Context app') }} · {{ item.topContextAppCategories.slice(0, 2).map(context => `${context.key} ${formatNumber(context.events)}`).join(' · ') || '—' }}
                </div>
                <div class="truncate text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.searchPluginSelected', 'Selected') }} · {{ item.selectedPlugins.slice(0, 2).map(plugin => `${plugin.key} ${formatNumber(plugin.events)}`).join(' · ') || '—' }}
                </div>
              </div>
            </div>
            <div v-for="item in analyticsData.searches.byHour.slice(0, 6)" :key="`hour:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ item.key }}:00 UTC</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byLocalHour.slice(0, 6)" :key="`local-hour:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchLocalHour', 'Local') }} {{ item.key }}:00</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byLocalTimeSlot.slice(0, 4)" :key="`local-slot:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchLocalTimeSlot', 'Local time slot') }} · {{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byLocalDayOfWeek.slice(0, 7)" :key="`local-weekday:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchLocalWeekday', 'Local weekday') }} · {{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byContextAppCategory.slice(0, 4)" :key="`context-app:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchContextApp', 'Context app') }} · {{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byTriggerType.slice(0, 4)" :key="`trigger:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchTrigger', 'Trigger') }} · {{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byUserPreferenceMode.slice(0, 4)" :key="`preference:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchPreference', 'Preference') }} · {{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.bySelectedRankBucket.slice(0, 4)" :key="`selected-rank:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchSelectedRank', 'Selected rank') }} · {{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byQueryLengthBucket.slice(0, 5)" :key="`query-length-bucket:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchQueryLengthBuckets', 'Query length') }} · {{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byResultCountBucket.slice(0, 4)" :key="`result-count-bucket:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchResultBuckets', 'Result count') }} · {{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byFirstResultLatencyBucket.slice(0, 4)" :key="`first-result-latency:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchFirstResultLatency', 'First result') }} · {{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byTotalDurationBucket.slice(0, 4)" :key="`total-duration:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchTotalDuration', 'Total duration') }} · {{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.bySelectedProvider.slice(0, 4)" :key="`selected-provider:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ tt('dashboard.governance.analytics.searchSelectedProvider', 'Selected provider') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.bySelectedCategory.slice(0, 4)" :key="`selected-category:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ tt('dashboard.governance.analytics.searchSelectedCategory', 'Selected category') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.bySelectedPluginId.slice(0, 4)" :key="`selected-plugin:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ tt('dashboard.governance.analytics.searchSelectedPlugin', 'Selected plugin') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byPluginId.slice(0, 4)" :key="`search-plugin:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ tt('dashboard.governance.analytics.searchPlugins', 'Plugin') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byPluginCategory.slice(0, 4)" :key="`search-plugin-category:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ tt('dashboard.governance.analytics.searchPluginCategories', 'Plugin category') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <div
              v-for="item in analyticsData.searches.pluginPreferenceByTimeSlot.slice(0, 4)"
              :key="`search-plugin-slot:${item.slot}`"
              class="grid gap-1 rounded-lg bg-black/[0.02] p-2 text-xs dark:bg-white/[0.03]"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="truncate text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.searchPluginTimeSlot', 'Plugin preference') }} · {{ item.slot }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(item.plugins[0]?.events ?? 0) }}</span>
              </div>
              <div class="truncate text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.searchPluginSeen', 'Seen') }} · {{ item.plugins.slice(0, 3).map(plugin => `${plugin.key} ${formatNumber(plugin.events)}`).join(' · ') || '—' }}
              </div>
              <div class="truncate text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.searchPluginSelected', 'Selected') }} · {{ item.selectedPlugins.slice(0, 3).map(plugin => `${plugin.key} ${formatNumber(plugin.events)}`).join(' · ') || '—' }}
              </div>
            </div>
            <div
              v-for="item in analyticsData.searches.pluginPreferenceByContext.slice(0, 4)"
              :key="`search-plugin-context:${item.key}`"
              class="grid gap-1 rounded-lg bg-black/[0.02] p-2 text-xs dark:bg-white/[0.03]"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="truncate text-black/60 dark:text-white/60">
                  {{ tt('dashboard.governance.analytics.searchPluginContext', 'Context plugin preference') }} · {{ item.contextAppCategory }} · {{ item.localTimeSlot }}
                </span>
                <span class="font-medium text-black dark:text-white">{{ formatPercent(item.selectionRate) }}</span>
              </div>
              <div class="truncate text-black/45 dark:text-white/45">
                {{ item.contextSource }} · {{ formatNumber(item.events) }} events · {{ formatNumber(item.uniqueActors) }} actors
              </div>
              <div class="truncate text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.searchPluginSeen', 'Seen') }} · {{ item.plugins.slice(0, 3).map(plugin => `${plugin.key} ${formatNumber(plugin.events)}`).join(' · ') || '—' }}
              </div>
              <div class="truncate text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.searchPluginSelected', 'Selected') }} · {{ item.selectedPlugins.slice(0, 3).map(plugin => `${plugin.key} ${formatNumber(plugin.events)}`).join(' · ') || '—' }}
              </div>
            </div>
            <div
              v-for="item in analyticsData.searches.contextSelectionMatrix.slice(0, 4)"
              :key="`search-context-selection:${item.key}`"
              class="grid gap-1 rounded-lg bg-black/[0.02] p-2 text-xs dark:bg-white/[0.03]"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="truncate text-black/60 dark:text-white/60">
                  {{ tt('dashboard.governance.analytics.searchContextSelectionMatrix', 'Context selection') }} · {{ item.contextAppCategory }} · {{ item.localTimeSlot }}
                </span>
                <span class="font-medium text-black dark:text-white">{{ formatPercent(item.selectionRate) }}</span>
              </div>
              <div class="truncate text-black/45 dark:text-white/45">
                {{ item.contextSource }} · {{ item.selectedCategory }} · {{ formatNumber(item.events) }} events · {{ formatNumber(item.uniqueActors) }} actors
              </div>
              <div class="truncate text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.searchPluginSeen', 'Seen') }} · {{ item.plugins.slice(0, 3).map(plugin => `${plugin.key} ${formatNumber(plugin.events)}`).join(' · ') || '—' }}
              </div>
              <div class="truncate text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.searchPluginSelected', 'Selected') }} · {{ item.selectedPlugins.slice(0, 3).map(plugin => `${plugin.key} ${formatNumber(plugin.events)}`).join(' · ') || '—' }}
              </div>
            </div>
            <div v-for="item in analyticsData.searches.byProvider.slice(0, 6)" :key="`provider:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byResultCategory.slice(0, 4)" :key="`result-category:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.quantity) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byProviderStatus.slice(0, 4)" :key="`provider-status:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byFilterKind.slice(0, 3)" :key="`filter-kind:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <p class="truncate text-xs text-black/45 dark:text-white/45">
              {{ analyticsData.searches.byCountry[0]?.key || 'unknown' }} · {{ analyticsData.searches.byTimezone[0]?.key || 'unknown' }}
            </p>
          </div>
        </div>

        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ tt('dashboard.governance.analytics.pluginLeaderboard', 'Plugin leaderboard') }}
          </h3>
          <div class="mt-3 space-y-2">
            <div v-for="item in analyticsData.plugins.leaderboard.slice(0, 6)" :key="item.pluginId" class="rounded-lg bg-black/[0.02] p-3 text-sm dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="truncate font-medium text-black dark:text-white">{{ item.pluginId }}</span>
                <span class="text-xs text-black/50 dark:text-white/50">{{ formatNumber(item.hotScore) }} hot · {{ formatDelta(item.growth.growthRate) }}</span>
              </div>
              <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                {{ formatNumber(item.downloads) }} downloads · {{ formatNumber(item.installs) }} installs · {{ formatNumber(item.invocations) }} invokes · {{ formatNumber(item.uniqueActors) }} actors
              </p>
              <p class="mt-1 truncate text-xs text-black/40 dark:text-white/40">
                {{ item.byAction.slice(0, 3).map(action => `${action.action}:${formatNumber(action.quantity)}`).join(' · ') || 'no actions' }}
              </p>
              <p class="mt-1 truncate text-xs text-black/40 dark:text-white/40">
                {{ item.topCountries[0]?.countryCode || 'unknown' }} · {{ item.topRegions[0]?.regionCode || 'unknown' }} · {{ item.topChannels[0]?.channel || 'unknown' }}
              </p>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ tt('dashboard.governance.analytics.uploadBreakdown', 'Upload breakdown') }}
          </h3>
          <div class="mt-3 grid gap-2 text-sm">
            <div class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.uploadStarted', 'Started') }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.uploads.started) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.uploadCompleted', 'Completed') }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.uploads.completed) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.uploadFailed', 'Failed') }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.uploads.failed) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.uploadAvgSize', 'Avg size') }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatBytes(analyticsData.uploads.uploadSize.average) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.uploadStuckAttempts', 'Stuck attempts') }} · {{ formatDurationMs(analyticsData.uploads.stuckAttemptAgeMs) }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.uploads.stuckAttempts) }} · {{ formatPercent(analyticsData.uploads.stuckRate) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.uploadAvgDuration', 'Avg duration') }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatDurationMs(analyticsData.uploads.uploadDurationMs.average) }}</span>
            </div>
            <div class="grid gap-2 rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.uploadRetryableFailures', 'Retryable failures') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.uploads.retrySummary.retryableFailures) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.uploadScheduledRetries', 'Scheduled retries') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.uploads.retrySummary.scheduledRetries) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.uploadRetryExhausted', 'Retry exhausted') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.uploads.retrySummary.exhaustedFailures) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.uploadRecoveredRetries', 'Recovered retries') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.uploads.retrySummary.recoveredUploads) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.uploadRecoveredRetryCount', 'Recovered retry count') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.uploads.retrySummary.recoveredRetryCount) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.uploadRecoveredRetryRate', 'Recovered retry rate') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatPercent(analyticsData.uploads.retrySummary.recoveredRetryRate) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.uploadRecoveredAttempts', 'Avg recovered attempts') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.uploads.retrySummary.recoveredAttempts.average) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.uploadNextRetryDelay', 'Avg next retry') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatDurationMs(analyticsData.uploads.retrySummary.nextRetryDelayMs.average) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.uploadFailureCalibration', 'Failure calibration') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatPercent(analyticsData.uploads.retrySummary.calibrationCoverageRate) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.uploadFailureSamples', 'Failure samples') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.uploads.retrySummary.liveFailureSamples) }} live · {{ formatNumber(analyticsData.uploads.retrySummary.manualFailureSamples) }} manual</span>
              </div>
            </div>
            <div v-if="analyticsData.uploads.pipelineSummary.length" class="grid gap-2 rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.uploadPipelineSummary', 'Upload pipeline') }}
                </span>
                <span class="text-black/45 dark:text-white/45">
                  {{ formatNumber(analyticsData.uploads.pipelineSummary.length) }}
                </span>
              </div>
              <div v-for="item in analyticsData.uploads.pipelineSummary.slice(0, 5)" :key="`upload-pipeline:${item.key}`" class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate font-medium text-black/70 dark:text-white/70">
                    {{ item.resourceType }} · {{ item.surface || 'unknown' }}
                  </span>
                  <span class="text-black/45 dark:text-white/45">
                    {{ formatPercent(item.completionRate) }} ok
                  </span>
                </div>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ item.storageProvider || item.storageChannel || 'unknown' }} · {{ formatNumber(item.started) }} started · {{ formatNumber(item.completed) }} completed · {{ formatNumber(item.failed) }} failed
                </p>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ formatNumber(item.stuck) }} stuck · {{ formatNumber(item.pending) }} pending · {{ formatPercent(item.failureRate) }} failed · {{ formatDurationMs(item.avgDurationMs) }} avg
                </p>
              </div>
            </div>
            <div v-for="item in analyticsData.uploads.byExtension.slice(0, 5)" :key="`ext:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.uploads.byStorageChannel.slice(0, 4)" :key="`upload-storage:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.quantity) }}</span>
            </div>
            <div v-for="item in analyticsData.uploads.byStorageProvider.slice(0, 4)" :key="`upload-storage-provider:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ tt('dashboard.governance.analytics.uploadStorageProvider', 'Provider') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.quantity) }}</span>
            </div>
            <div v-for="item in analyticsData.uploads.bySurface.slice(0, 4)" :key="`upload-surface:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ tt('dashboard.governance.analytics.uploadSurface', 'Surface') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-if="analyticsData.uploads.sceneAssetHealth.length" class="grid gap-2 rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.uploadSceneAssetHealth', 'Scene asset upload health') }}
                </span>
                <span class="text-black/45 dark:text-white/45">
                  {{ formatNumber(analyticsData.uploads.sceneAssetHealth.length) }}
                </span>
              </div>
              <div v-for="item in analyticsData.uploads.sceneAssetHealth.slice(0, 5)" :key="`upload-scene-asset:${item.key}`" class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate font-medium text-black/70 dark:text-white/70">
                    {{ item.sceneId || 'unknown' }} · {{ item.capability || 'unknown' }}
                  </span>
                  <span class="text-black/45 dark:text-white/45">
                    {{ formatPercent(item.failureRate) }} failed
                  </span>
                </div>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ item.providerId || 'unknown' }} · {{ item.assetKind || 'unknown' }} · {{ item.resourceType }} · {{ item.storageProvider || item.storageChannel || 'unknown' }}
                </p>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ formatNumber(item.started) }} started · {{ formatNumber(item.completed) }} completed · {{ formatNumber(item.failed) }} failed · {{ formatBytes(item.bytes) }}
                </p>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ formatDurationMs(item.avgDurationMs) }} avg · {{ formatBytes(item.avgSize) }} avg size · {{ item.latestAt }}
                </p>
                <p v-if="item.failureReasons.length || item.statusCodes.length" class="mt-1 truncate text-red-500/80 dark:text-red-200/80">
                  {{ item.failureReasons[0]?.key || '-' }} · {{ item.statusCodes[0]?.key || '-' }}
                </p>
              </div>
            </div>
            <div v-for="item in analyticsData.uploads.byStatusCode.slice(0, 4)" :key="`upload-status:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-red-500/80 dark:text-red-200/80">{{ tt('dashboard.governance.analytics.uploadStatusCode', 'Status') }} · {{ item.key }}</span>
              <span class="font-medium text-red-600 dark:text-red-100">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.uploads.byFailureReason.slice(0, 4)" :key="`upload-failure:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-red-500/80 dark:text-red-200/80">{{ item.key }}</span>
              <span class="font-medium text-red-600 dark:text-red-100">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.uploads.byRetryDisposition.slice(0, 4)" :key="`upload-retry:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ tt('dashboard.governance.analytics.uploadRetryDisposition', 'Retry') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-if="analyticsData.uploads.actionQueue.length" class="grid gap-2 rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.uploadActionQueue', 'Upload action queue') }}
                </span>
                <span class="text-black/45 dark:text-white/45">
                  {{ formatNumber(analyticsData.uploads.actionQueue.length) }}
                </span>
              </div>
              <div v-for="item in analyticsData.uploads.actionQueue.slice(0, 5)" :key="`upload-action-queue:${item.key}`" class="rounded-lg border border-red-500/10 p-2 dark:border-red-200/10">
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate font-medium text-red-600 dark:text-red-100">
                    {{ item.priority }} · {{ item.suggestedAction }}
                  </span>
                  <span class="text-red-500/80 dark:text-red-200/80">
                    {{ formatNumber(item.failedAttempts) }} failed · {{ formatNumber(item.stuckAttempts) }} stuck
                  </span>
                </div>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ item.reason }} · {{ item.resourceType }} · {{ item.surface || 'unknown' }} · {{ item.storageProvider || item.storageChannel || 'unknown' }} · {{ item.statusCode ?? '-' }}
                </p>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.uploadRetryState', 'Retry state') }} · {{ formatNumber(item.retryableFailures) }} retryable · {{ formatNumber(item.scheduledRetries) }} scheduled · {{ formatNumber(item.exhaustedRetries) }} exhausted
                </p>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.uploadFailureCalibration', 'Failure calibration') }} · {{ item.calibrationStatus }} · {{ item.sampleSource }} · {{ formatNumber(item.sampleCount) }} samples
                </p>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.uploadActionEvidence', 'Evidence') }} · {{ formatNumber(item.evidenceAttemptHashes.length) }} attempts · {{ formatNumber(item.evidenceResourceHashes.length) }} resources · {{ item.oldestAgeMs == null ? '-' : formatDurationMs(item.oldestAgeMs) }} oldest · {{ item.nextRetryDelayMs == null ? '-' : formatDurationMs(item.nextRetryDelayMs) }} next
                </p>
              </div>
            </div>
            <div v-if="analyticsData.uploads.failureMatrix.length" class="grid gap-2 rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.uploadFailureMatrix', 'Failure matrix') }}
                </span>
                <span class="text-black/45 dark:text-white/45">
                  {{ formatNumber(analyticsData.uploads.failureMatrix.length) }}
                </span>
              </div>
              <div v-for="item in analyticsData.uploads.failureMatrix.slice(0, 5)" :key="`upload-failure-matrix:${item.key}`" class="rounded-lg border border-red-500/10 p-2 dark:border-red-200/10">
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate font-medium text-red-600 dark:text-red-100">
                    {{ item.reason }} · {{ item.disposition }}
                  </span>
                  <span class="text-red-500/80 dark:text-red-200/80">
                    {{ formatNumber(item.events) }} events
                  </span>
                </div>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ item.resourceType }} · {{ item.surface || 'unknown' }} · {{ item.storageProvider || item.storageChannel || 'unknown' }} · {{ item.statusCode ?? '-' }}
                </p>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.uploadSuggestedAction', 'Action') }} · {{ item.suggestedAction }} · {{ formatNumber(item.scheduled) }} scheduled · {{ formatNumber(item.exhausted) }} exhausted
                </p>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.uploadFailureCalibration', 'Failure calibration') }} · {{ item.calibrationStatus }} · {{ item.sampleSource }} · {{ formatNumber(item.sampleCount) }} samples
                </p>
              </div>
            </div>
            <div v-for="item in analyticsData.uploads.statusTrend.slice(-3)" :key="`upload-trend:${item.date}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ item.date }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.completed) }}/{{ formatNumber(item.started) }} ok · {{ formatNumber(item.failed) }} failed · {{ formatBytes(item.bytes) }}</span>
            </div>
            <div v-for="item in analyticsData.uploads.retryTrend.slice(-3)" :key="`upload-retry-trend:${item.date}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ item.date }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.scheduled) }} scheduled · {{ formatNumber(item.exhausted) }} exhausted · {{ formatNumber(item.retryable) }} retryable · {{ formatNumber(item.recovered) }} recovered</span>
            </div>
            <div v-if="analyticsData.uploads.recoveredEvidence.length" class="grid gap-2 rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.uploadRecoveredEvidence', 'Recovered evidence') }}
                </span>
                <span class="text-black/45 dark:text-white/45">
                  {{ formatNumber(analyticsData.uploads.recoveredEvidence.length) }}
                </span>
              </div>
              <div v-for="item in analyticsData.uploads.recoveredEvidence.slice(0, 5)" :key="`upload-recovered:${item.attemptHash}`" class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate font-medium text-black/70 dark:text-white/70">
                    {{ item.resourceType }} · {{ item.attemptHash }}
                  </span>
                  <span class="text-black/45 dark:text-white/45">
                    {{ formatNumber(item.retryCount ?? 0) }}/{{ item.maxRetries ?? '-' }}
                  </span>
                </div>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ item.surface || 'unknown' }} · {{ item.storageProvider || item.storageChannel || 'unknown' }} · {{ item.contentType || 'unknown' }}
                </p>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ item.storageOperation || 'storage.write' }} · {{ item.storageStatusCode ?? '-' }} · {{ formatDurationMs(item.durationMs ?? 0) }} · {{ item.size == null ? '-' : formatBytes(item.size) }} · {{ formatDate(item.latestAt) }}
                </p>
              </div>
            </div>
            <div class="mt-4 rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03]">
              <h4 class="text-xs font-semibold text-black/70 dark:text-white/70">
                {{ tt('dashboard.governance.analytics.uploadProblemAttempts', 'Problem attempts') }}
              </h4>
              <div class="mt-2 grid gap-2">
                <div v-for="attempt in (analyticsData.uploads.problemAttempts ?? []).slice(0, 5)" :key="attempt.attemptHash" class="rounded-lg border border-black/[0.05] p-2 text-xs dark:border-white/[0.06]">
                  <div class="flex items-center justify-between gap-3">
                    <span class="truncate font-medium text-black/70 dark:text-white/70">{{ attempt.status }} · {{ attempt.attemptHash }}</span>
                    <span class="text-black/45 dark:text-white/45">{{ attempt.statusCode == null ? '-' : attempt.statusCode }}</span>
                  </div>
                  <p class="mt-1 truncate text-black/45 dark:text-white/45">
                    {{ attempt.resourceType }} · {{ attempt.surface || 'unknown' }} · {{ attempt.storageProvider || attempt.storageChannel || 'unknown' }}
                  </p>
                  <p class="mt-1 truncate text-red-600 dark:text-red-100">
                    {{ attempt.reason || attempt.contentType || 'pending' }} · {{ attempt.durationMs == null ? formatDurationMs(attempt.ageMs ?? 0) : formatDurationMs(attempt.durationMs) }}
                  </p>
                  <p class="mt-1 truncate text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.uploadRetryState', 'Retry state') }} · {{ attempt.retryable === null ? 'unknown' : attempt.retryable ? 'retryable' : 'not-retryable' }} · {{ attempt.retryCount ?? '-' }}/{{ attempt.maxRetries ?? '-' }} · {{ attempt.nextRetryDelayMs == null ? '-' : formatDurationMs(attempt.nextRetryDelayMs) }}
                  </p>
                </div>
                <p v-if="(analyticsData.uploads.problemAttempts ?? []).length === 0" class="text-xs text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.uploadProblemAttemptsEmpty', 'No failed or stuck upload attempts yet.') }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ tt('dashboard.governance.analytics.storageUsage', 'Storage usage') }}
          </h3>
          <div class="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.storageStored', 'Stored') }}
              </p>
              <p class="mt-1 text-lg font-semibold text-black dark:text-white">
                {{ formatBytes(analyticsData.storage.storedBytes) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.storageTraffic', 'Traffic') }}
              </p>
              <p class="mt-1 text-lg font-semibold text-black dark:text-white">
                {{ formatBytes(analyticsData.storage.trafficBytes) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.storageOperations', 'Ops') }}
              </p>
              <p class="mt-1 text-lg font-semibold text-black dark:text-white">
                {{ formatNumber(analyticsData.storage.operations) }}
              </p>
            </div>
          </div>
          <p class="mt-3 text-xs text-black/45 dark:text-white/45">
            {{ formatNumber(analyticsData.storage.writes) }} writes · {{ formatNumber(analyticsData.storage.reads) }} reads · {{ formatNumber(analyticsData.storage.deletes) }} deletes
          </p>
          <div v-if="analyticsData.storage.smokeEvidence.length" class="mt-4 grid gap-2 text-sm">
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.storageSmokeEvidence', 'Storage smoke evidence') }}
              </p>
              <span class="text-xs text-black/45 dark:text-white/45">
                {{ formatNumber(analyticsData.storage.smokeEvidence.length) }}
              </span>
            </div>
            <div v-for="item in analyticsData.storage.smokeEvidence.slice(0, 5)" :key="`storage-smoke:${item.key}`" class="rounded-lg border border-black/[0.05] p-3 text-xs dark:border-white/[0.06]">
              <div class="flex items-center justify-between gap-3">
                <span class="truncate font-medium text-black dark:text-white">
                  {{ item.policyName || item.policyId || 'unknown' }} · {{ item.mode }}
                </span>
                <TxStatusBadge :text="storageSmokeEvidenceLabel(item.status)" size="sm" :status="storageSmokeEvidenceTone(item.status)" />
              </div>
              <p class="mt-1 truncate text-black/45 dark:text-white/45">
                {{ item.channel || 'unknown' }} · {{ item.provider || 'default' }} · {{ item.reason || '-' }}
              </p>
              <p class="mt-2 truncate text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.storageSmokeOperations', 'Operations') }} · {{ item.operations.join(', ') || '-' }} · {{ formatBytes(item.bytesWritten) }} written · {{ formatBytes(item.bytesRead) }} read
              </p>
              <p class="mt-1 truncate text-black/40 dark:text-white/40">
                {{ tt('dashboard.governance.analytics.storageSmokeCredential', 'Credential') }} · {{ item.credentialRequired ? 'required' : 'optional' }} · {{ item.hasCredentialRef ? 'ref' : 'no-ref' }} · {{ item.hasCredential === null ? 'unknown' : item.hasCredential ? 'bound' : 'missing' }} · {{ formatDate(item.latestAt) }}
              </p>
              <p class="mt-1 truncate text-black/40 dark:text-white/40">
                {{ formatNumber(item.events) }} events · {{ formatNumber(item.ready) }} ready · {{ formatNumber(item.sent) }} sent · {{ formatNumber(item.failed) }} failed · {{ formatNumber(item.uniqueActors) }} actors
              </p>
            </div>
          </div>
          <div v-if="analyticsData.storage.actionQueue.length" class="mt-4 grid gap-2 text-sm">
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.storageActionQueue', 'Storage action queue') }}
              </p>
              <span class="text-xs text-black/45 dark:text-white/45">
                {{ formatNumber(analyticsData.storage.actionQueue.length) }}
              </span>
            </div>
            <div v-for="item in analyticsData.storage.actionQueue.slice(0, 5)" :key="`storage-action-queue:${item.key}`" class="rounded-lg border border-black/[0.05] p-3 text-xs dark:border-white/[0.06]">
              <div class="flex items-center justify-between gap-3">
                <span class="truncate font-medium text-black dark:text-white">
                  {{ item.priority }} · {{ item.suggestedAction }}
                </span>
                <TxStatusBadge :text="storageChannelPressureLabel(item.pressureStatus)" size="sm" :status="storageChannelPressureTone(item.pressureStatus)" />
              </div>
              <p class="mt-1 truncate text-black/45 dark:text-white/45">
                {{ item.reason }} · {{ item.channel }} · {{ item.provider || 'default' }} · {{ item.policyName || tt('dashboard.governance.analytics.storageChannelNoPolicy', 'No matched policy') }}
              </p>
              <div class="mt-2 grid grid-cols-3 gap-2 text-black/50 dark:text-white/50">
                <span>{{ formatBytes(item.storedBytes) }} stored</span>
                <span>{{ formatBytes(item.trafficBytes) }} traffic</span>
                <span>{{ formatNumber(item.operations) }} ops</span>
              </div>
              <p class="mt-2 truncate text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.storageActionQueueRemaining', 'Remaining') }} · {{ formatStorageBudgetValue(item.remaining.storedBytes, 'bytes') }} stored · {{ formatStorageBudgetValue(item.remaining.trafficBytes, 'bytes') }} traffic · {{ formatStorageBudgetValue(item.remaining.operations, 'operations') }} ops
              </p>
              <p class="mt-1 truncate text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.storageActionQueueOverage', 'Overage') }} · {{ formatStorageBudgetValue(item.overage.storedBytes, 'bytes') }} stored · {{ formatStorageBudgetValue(item.overage.trafficBytes, 'bytes') }} traffic · {{ formatStorageBudgetValue(item.overage.operations, 'operations') }} ops
              </p>
              <p class="mt-1 truncate text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.storageActionQueueBurnRate', 'Burn/day') }} · {{ formatBytes(item.burnRate.storedBytesPerDay) }} stored · {{ formatBytes(item.burnRate.trafficBytesPerDay) }} traffic · {{ formatNumber(item.burnRate.operationsPerDay) }} ops
              </p>
              <p class="mt-1 truncate text-black/40 dark:text-white/40">
                {{ formatRatio(item.highestUtilization) }} peak · {{ formatNumber(item.policyAlerts) }} alerts · {{ item.latestTrendDate || '-' }}
              </p>
            </div>
          </div>
          <div v-if="analyticsData.storage.channelPressure.length" class="mt-4 grid gap-2 text-sm">
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.storageChannelPressure', 'Channel pressure') }}
              </p>
              <span class="text-xs text-black/45 dark:text-white/45">
                {{ formatNumber(analyticsData.storage.channelPressure.length) }} channels
              </span>
            </div>
            <div v-for="item in analyticsData.storage.channelPressure.slice(0, 4)" :key="`storage-pressure:${item.channel}:${item.provider || 'default'}`" class="rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="truncate font-medium text-black dark:text-white">
                  {{ item.channel }} · {{ item.provider || 'default' }}
                </span>
                <TxStatusBadge :text="storageChannelPressureLabel(item.pressureStatus)" size="sm" :status="storageChannelPressureTone(item.pressureStatus)" />
              </div>
              <p class="mt-1 truncate text-xs text-black/45 dark:text-white/45">
                {{ item.policyName || tt('dashboard.governance.analytics.storageChannelNoPolicy', 'No matched policy') }} · {{ formatRatio(item.highestUtilization) }} · {{ formatNumber(item.policyAlerts) }} alerts
              </p>
              <div class="mt-2 grid grid-cols-3 gap-2 text-xs text-black/50 dark:text-white/50">
                <span>{{ formatBytes(item.storedBytes) }} stored</span>
                <span>{{ formatBytes(item.trafficBytes) }} traffic</span>
                <span>{{ formatNumber(item.operations) }} ops</span>
              </div>
              <p class="mt-2 truncate text-xs text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.storageChannelRemaining', 'Remaining') }} · {{ formatStorageBudgetValue(item.remaining.storedBytes, 'bytes') }} stored · {{ formatStorageBudgetValue(item.remaining.trafficBytes, 'bytes') }} traffic · {{ formatStorageBudgetValue(item.remaining.operations, 'operations') }} ops
              </p>
              <p class="mt-1 truncate text-xs text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.storageChannelBurnRate', 'Burn/day') }} · {{ formatBytes(item.burnRate.storedBytesPerDay) }} stored · {{ formatBytes(item.burnRate.trafficBytesPerDay) }} traffic · {{ formatNumber(item.burnRate.operationsPerDay) }} ops
              </p>
              <p class="mt-1 truncate text-xs text-black/40 dark:text-white/40">
                {{ tt('dashboard.governance.analytics.storageChannelProjectedExhaustion', 'Projected exhaustion') }} · {{ formatProjectedDays(item.projectedExhaustionDays.storedBytes) }} stored · {{ formatProjectedDays(item.projectedExhaustionDays.trafficBytes) }} traffic · {{ formatProjectedDays(item.projectedExhaustionDays.operations) }} ops
              </p>
              <p v-if="item.trend.length" class="mt-1 truncate text-xs text-black/40 dark:text-white/40">
                {{ item.trend.at(-1)?.date }} · {{ formatBytes((item.trend.at(-1)?.storedBytes ?? 0) + (item.trend.at(-1)?.trafficBytes ?? 0)) }} · {{ formatNumber(item.trend.at(-1)?.operations ?? 0) }} ops
              </p>
            </div>
          </div>
          <div class="mt-4 rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03]">
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.storagePolicyUtilization', 'Policy utilization') }}
              </p>
              <span class="text-xs font-medium text-black/70 dark:text-white/70">{{ formatRatio(storagePolicyPeakUtilization) }}</span>
            </div>
            <div class="mt-3 grid grid-cols-4 gap-2 text-xs">
              <div>
                <p class="text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.storagePolicyActive', 'Active') }}
                </p>
                <p class="mt-1 font-semibold text-black dark:text-white">
                  {{ formatNumber(analyticsData.storage.policySummary.active) }}
                </p>
              </div>
              <div>
                <p class="text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.storagePolicyBlocked', 'Blocked') }}
                </p>
                <p class="mt-1 font-semibold text-black dark:text-white">
                  {{ formatNumber(analyticsData.storage.policySummary.blocked) }}
                </p>
              </div>
              <div>
                <p class="text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.storagePolicyWarning', 'Warning') }}
                </p>
                <p class="mt-1 font-semibold text-black dark:text-white">
                  {{ formatNumber(analyticsData.storage.policySummary.warning) }}
                </p>
              </div>
              <div>
                <p class="text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.storagePolicyAlerts', 'Alerts') }}
                </p>
                <p class="mt-1 font-semibold text-black dark:text-white">
                  {{ formatNumber(analyticsData.storage.policySummary.alerts) }}
                </p>
              </div>
            </div>
          </div>
          <div class="mt-4 grid gap-2 text-sm">
            <div v-for="item in analyticsData.storage.byChannelUsage.slice(0, 5)" :key="`storage-channel:${item.key}`" class="rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="truncate font-medium text-black dark:text-white">{{ item.key }}</span>
                <span class="text-xs text-black/45 dark:text-white/45">{{ formatNumber(item.operations) }} ops</span>
              </div>
              <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                {{ formatBytes(item.storedBytes) }} stored · {{ formatBytes(item.trafficBytes) }} traffic · {{ formatNumber(item.uniqueActors) }} actors
              </p>
            </div>
            <div v-for="item in analyticsData.storage.byProviderUsage.slice(0, 4)" :key="`storage-provider:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ tt('dashboard.governance.analytics.storageProvider', 'Provider') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatBytes(item.storedBytes + item.trafficBytes) }}</span>
            </div>
            <div v-for="item in analyticsData.storage.byResourceTypeUsage.slice(0, 4)" :key="`storage-resource:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ tt('dashboard.governance.analytics.storageResourceType', 'Resource') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.operations) }}</span>
            </div>
            <div v-for="item in analyticsData.storage.byActionUsage.slice(0, 3)" :key="`storage-action:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ tt('dashboard.governance.analytics.storageAction', 'Action') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.operations) }}</span>
            </div>
            <div v-for="item in analyticsData.storage.trend.slice(-3)" :key="`storage-trend:${item.date}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ item.date }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatBytes(item.storedBytes + item.trafficBytes) }} · {{ formatNumber(item.operations) }} ops</span>
            </div>
            <div v-for="policy in analyticsData.storage.policyRisks.slice(0, 4)" :key="`storage-policy-risk:${policy.policyId}`" class="rounded-lg border border-black/[0.05] p-2 text-xs dark:border-white/[0.06]">
              <div class="flex items-center justify-between gap-2">
                <span class="truncate font-medium text-black/70 dark:text-white/70">{{ policy.name }}</span>
                <TxStatusBadge :text="storageEvaluationLabel(policy.status)" size="sm" :status="storageEvaluationTone(policy.status)" />
              </div>
              <p class="mt-1 truncate text-black/45 dark:text-white/45">
                {{ policy.channel }} · {{ policy.provider || 'unknown' }} · {{ policy.reasons.join(', ') || '-' }}
              </p>
              <div class="mt-2 grid grid-cols-3 gap-2 text-black/50 dark:text-white/50">
                <span>{{ tt('dashboard.governance.analytics.storagePolicyStored', 'Stored') }}: {{ formatRatio(policy.utilization.storedBytes) }}</span>
                <span>{{ tt('dashboard.governance.analytics.storagePolicyTraffic', 'Traffic') }}: {{ formatRatio(policy.utilization.trafficBytes) }}</span>
                <span>{{ tt('dashboard.governance.analytics.storagePolicyOps', 'Ops') }}: {{ formatRatio(policy.utilization.operations) }}</span>
              </div>
              <div class="mt-2 grid grid-cols-3 gap-2 text-black/50 dark:text-white/50">
                <span>{{ tt('dashboard.governance.analytics.storagePolicyRemainingStored', 'Remaining stored') }}: {{ formatStorageBudgetValue(policy.remaining.storedBytes, 'bytes') }}</span>
                <span>{{ tt('dashboard.governance.analytics.storagePolicyRemainingTraffic', 'Remaining traffic') }}: {{ formatStorageBudgetValue(policy.remaining.trafficBytes, 'bytes') }}</span>
                <span>{{ tt('dashboard.governance.analytics.storagePolicyRemainingOps', 'Remaining ops') }}: {{ formatStorageBudgetValue(policy.remaining.operations, 'operations') }}</span>
              </div>
              <div class="mt-2 grid grid-cols-3 gap-2 text-black/50 dark:text-white/50">
                <span>{{ tt('dashboard.governance.analytics.storagePolicyBurnStored', 'Burn stored/day') }}: {{ formatBytes(policy.burnRate.storedBytesPerDay) }}</span>
                <span>{{ tt('dashboard.governance.analytics.storagePolicyBurnTraffic', 'Burn traffic/day') }}: {{ formatBytes(policy.burnRate.trafficBytesPerDay) }}</span>
                <span>{{ tt('dashboard.governance.analytics.storagePolicyProjectedOps', 'Ops exhaustion') }}: {{ formatProjectedDays(policy.projectedExhaustionDays.operations) }}</span>
              </div>
            </div>
            <p v-if="analyticsData.storage.totalEvents === 0" class="text-sm text-black/45 dark:text-white/45">
              {{ tt('dashboard.governance.analytics.storageEmpty', 'No storage usage yet.') }}
            </p>
          </div>
        </div>

        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ tt('dashboard.governance.analytics.notificationDelivery', 'Notification delivery') }}
          </h3>
          <div class="mt-3 grid gap-2 text-sm">
            <div class="grid gap-2 rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.notificationChannelsEnabled', 'Enabled channels') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.notifications.channelSummary.enabled) }} / {{ formatNumber(analyticsData.notifications.channelSummary.total) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.notificationChannelsCredentialMissing', 'Missing credential refs') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.notifications.channelSummary.credentialMissing) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.notificationChannelsUnsupported', 'Unsupported adapters') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.notifications.channelSummary.unsupported) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.notificationChannelsProductionReady', 'Production-ready channels') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.notifications.channelSummary.productionReady) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ tt('dashboard.governance.analytics.notificationChannelsRuntimeMissing', 'Runtime config gaps') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.notifications.channelSummary.runtimeMissing + analyticsData.notifications.channelSummary.relayMissing + analyticsData.notifications.channelSummary.sendModeMissing) }}</span>
              </div>
            </div>
            <div v-for="item in analyticsData.notifications.byDeliveryStatus.slice(0, 3)" :key="`delivery:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.notifications.byProvider.slice(0, 4)" :key="`notification-provider:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.notifications.byAdapter.slice(0, 4)" :key="`notification-adapter:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.notifications.deliveryTrend.slice(-3)" :key="`notification-trend:${item.date}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ item.date }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.sent) }} sent · {{ formatNumber(item.failed) }} failed · {{ formatNumber(item.skipped) }} skipped</span>
            </div>
            <div v-if="analyticsData.notifications.deliveryEvidence.length" class="grid gap-2 rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.notificationDeliveryEvidence', 'Delivery evidence') }}
                </span>
                <span class="text-black/45 dark:text-white/45">
                  {{ formatNumber(analyticsData.notifications.deliveryEvidence.length) }}
                </span>
              </div>
              <div v-for="item in analyticsData.notifications.deliveryEvidence.slice(0, 5)" :key="`notification-delivery-evidence:${item.key}`" class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate font-medium text-black/70 dark:text-white/70">
                    {{ item.configName || item.configId || item.provider || item.channel || 'notification' }}
                  </span>
                  <TxStatusBadge :text="item.status" size="sm" :status="notificationDeliveryTone(item.status)" />
                </div>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ item.notificationAction || 'notification' }} · {{ item.resourceType || 'resource' }} · {{ item.channel || 'unknown' }} · {{ item.providerType || item.adapter || 'generic' }}
                </p>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ item.reason || '-' }} · {{ formatNumber(item.sent) }} sent · {{ formatNumber(item.failed) }} failed · {{ formatNumber(item.skipped) }} skipped · {{ formatNumber(item.planned) }} planned
                </p>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ formatDurationMs(item.durationMs ?? 0) }} · {{ item.statusCode ?? '-' }} · {{ formatDate(item.latestAt) }} · {{ formatNumber(item.uniqueActors) }} actors
                </p>
              </div>
            </div>
            <div v-if="analyticsData.notifications.testEvidence.length" class="grid gap-2 rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.notificationTestEvidence', 'Notification test evidence') }}
                </span>
                <span class="text-black/45 dark:text-white/45">
                  {{ formatNumber(analyticsData.notifications.testEvidence.length) }}
                </span>
              </div>
              <div v-for="item in analyticsData.notifications.testEvidence.slice(0, 5)" :key="`notification-test-evidence:${item.key}`" class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate font-medium text-black/70 dark:text-white/70">
                    {{ item.configName || item.configId }}
                  </span>
                  <TxStatusBadge :text="item.status" size="sm" :status="notificationDeliveryTone(item.status)" />
                </div>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ item.notificationAction || 'system.notification.test' }} · {{ item.channel || 'unknown' }} · {{ item.provider || 'default' }} · {{ item.providerType || item.adapter || 'generic' }}
                </p>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ item.reason || '-' }} · {{ formatNumber(item.sent) }} sent · {{ formatNumber(item.failed) }} failed · {{ formatNumber(item.skipped) }} skipped · {{ formatNumber(item.planned) }} planned
                </p>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ formatDurationMs(item.durationMs ?? 0) }} · {{ item.statusCode ?? '-' }} · {{ formatDate(item.latestAt) }} · {{ formatNumber(item.uniqueActors) }} actors
                </p>
              </div>
            </div>
            <div v-if="analyticsData.notifications.actionQueue.length" class="grid gap-2 rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.notificationActionQueue', 'Notification action queue') }}
                </span>
                <span class="text-black/45 dark:text-white/45">
                  {{ formatNumber(analyticsData.notifications.actionQueue.length) }}
                </span>
              </div>
              <div v-for="item in analyticsData.notifications.actionQueue.slice(0, 5)" :key="`notification-action-queue:${item.key}`" class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate font-medium text-black/70 dark:text-white/70">
                    {{ item.priority }} · {{ item.suggestedAction }}
                  </span>
                  <TxStatusBadge
                    :text="notificationActionQueueStatusLabel(item)"
                    size="sm"
                    :status="item.priority === 'critical' ? 'danger' : item.priority === 'high' ? 'warning' : 'info'"
                  />
                </div>
                <p class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ item.reason }} · {{ item.channel || 'unknown' }} · {{ item.provider || item.name || 'default' }} · {{ item.providerType || item.adapter || 'generic' }}
                </p>
                <p v-if="item.source === 'channel-config'" class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ item.reasons.join(', ') || '-' }} · {{ notificationChannelCredentialLabel(item) }} · {{ item.productionReady ? tt('dashboard.governance.analytics.notificationChannelReady', 'production ready') : tt('dashboard.governance.analytics.notificationChannelNotReady', 'not production ready') }}
                </p>
                <p v-else class="mt-1 truncate text-black/45 dark:text-white/45">
                  {{ formatNumber(item.sent) }} sent · {{ formatNumber(item.failed) }} failed · {{ formatNumber(item.skipped) }} skipped · {{ formatPercent(item.failureRate) }} failed · {{ formatDurationMs(item.durationMs.average) }} avg
                </p>
                <p v-if="item.latestFailureReason" class="mt-1 truncate text-red-600 dark:text-red-100">
                  {{ item.latestFailureReason }} · {{ item.latestFailureStatusCode ?? '-' }} · {{ item.latestFailureAt ? formatDate(item.latestFailureAt) : '-' }}
                </p>
              </div>
            </div>
            <div v-if="analyticsData.notifications.providerMix.length" class="grid gap-2 rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.notificationProviderMix', 'Provider mix') }}
                </span>
                <span class="text-black/45 dark:text-white/45">
                  {{ formatNumber(analyticsData.notifications.providerMix.length) }}
                </span>
              </div>
              <div v-for="item in analyticsData.notifications.providerMix.slice(0, 5)" :key="`notification-provider-mix:${item.key}`" class="flex items-center justify-between gap-3">
                <span class="truncate text-black/60 dark:text-white/60">
                  {{ item.providerType || item.channel }} · {{ item.adapter }}
                </span>
                <span class="font-medium text-black dark:text-white">
                  {{ formatNumber(item.productionReady) }} ready · {{ formatNumber(item.warning) }} warning · {{ formatNumber(item.disabled) }} disabled
                </span>
              </div>
            </div>
            <div v-for="channel in analyticsData.notifications.channelRisks.slice(0, 4)" :key="`notification-channel-risk:${channel.configId}`" class="rounded-lg border border-black/[0.05] p-2 text-xs dark:border-white/[0.06]">
              <div class="flex items-center justify-between gap-2">
                <span class="truncate font-medium text-black/70 dark:text-white/70">{{ channel.name }}</span>
                <TxStatusBadge :text="notificationChannelLabel(channel.status)" size="sm" :status="notificationChannelTone(channel.status)" />
              </div>
              <p class="mt-1 truncate text-black/45 dark:text-white/45">
                {{ channel.channel }} · {{ channel.provider || 'default' }} · {{ channel.providerType || channel.adapter }}
              </p>
              <p class="mt-1 truncate text-black/45 dark:text-white/45">
                {{ channel.reasons.join(', ') || '-' }} · {{ notificationChannelCredentialLabel(channel) }}
              </p>
              <p class="mt-1 truncate text-black/45 dark:text-white/45">
                {{ notificationChannelReadinessLabel(channel) }}
              </p>
            </div>
            <p v-if="analyticsData.notifications.deliveries.total === 0" class="text-sm text-black/45 dark:text-white/45">
              {{ tt('dashboard.governance.analytics.notificationEmpty', 'No notification delivery audit yet.') }}
            </p>
          </div>
        </div>

        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ tt('dashboard.governance.analytics.notificationReasons', 'Notification reasons') }}
          </h3>
          <div class="mt-3 grid gap-2 text-sm">
            <div v-for="item in analyticsData.notifications.byReason.slice(0, 6)" :key="`notification-reason:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.notifications.byStatusCode.slice(0, 4)" :key="`notification-status-code:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ tt('dashboard.governance.analytics.notificationStatusCode', 'Status code') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.notifications.byNotificationAction.slice(0, 4)" :key="`notification-action:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <p v-if="analyticsData.notifications.byReason.length === 0" class="text-sm text-black/45 dark:text-white/45">
              {{ tt('dashboard.governance.analytics.notificationReasonEmpty', 'No delivery reason data yet.') }}
            </p>
          </div>
        </div>

        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ tt('dashboard.governance.analytics.notificationProviderHealth', 'Notification provider health') }}
          </h3>
          <div class="mt-3 grid gap-2">
            <div v-for="item in analyticsData.notifications.providerHealth.slice(0, 6)" :key="`notification-health:${item.provider}`" class="rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="truncate font-medium text-black dark:text-white">{{ item.provider }}</span>
                <TxStatusBadge
                  :text="item.failed ? tt('dashboard.governance.analytics.notificationProviderFailed', 'Failed') : item.sent ? tt('dashboard.governance.analytics.notificationProviderSent', 'Sent') : tt('dashboard.governance.analytics.notificationProviderPlanned', 'Planned')"
                  size="sm"
                  :status="item.failed ? 'danger' : item.sent ? 'success' : 'info'"
                />
              </div>
              <p class="mt-1 text-black/45 dark:text-white/45">
                {{ item.channel || 'unknown' }} · {{ item.providerType || item.adapter || 'generic' }}
              </p>
              <div class="mt-2 grid grid-cols-2 gap-2 text-black/60 dark:text-white/60">
                <span>{{ tt('dashboard.governance.analytics.notificationProviderSentRate', 'Sent rate') }}: {{ formatPercent(item.sentRate) }}</span>
                <span>{{ tt('dashboard.governance.analytics.notificationProviderFailureRate', 'Failure rate') }}: {{ formatPercent(item.failureRate) }}</span>
                <span>{{ formatNumber(item.sent) }} sent / {{ formatNumber(item.failed) }} failed</span>
                <span>{{ formatNumber(item.skipped) }} skipped / {{ formatNumber(item.planned) }} planned</span>
                <span>{{ tt('dashboard.governance.analytics.notificationAvgDuration', 'Avg duration') }}: {{ formatDurationMs(item.durationMs.average) }}</span>
                <span>{{ tt('dashboard.governance.analytics.notificationMaxDuration', 'Max duration') }}: {{ formatDurationMs(item.durationMs.max) }}</span>
              </div>
              <p v-if="item.latestFailureReason" class="mt-2 truncate text-red-600 dark:text-red-100">
                {{ item.latestFailureReason }} · {{ item.latestFailureStatusCode ?? '-' }} · {{ item.latestFailureAt ? formatDate(item.latestFailureAt) : '-' }}
              </p>
            </div>
            <p v-if="analyticsData.notifications.providerHealth.length === 0" class="text-sm text-black/45 dark:text-white/45">
              {{ tt('dashboard.governance.analytics.notificationProviderHealthEmpty', 'No provider delivery health yet.') }}
            </p>
          </div>
        </div>

        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ tt('dashboard.governance.analytics.browserPushSubscriptions', 'Browser push subscriptions') }}
          </h3>
          <div class="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.pushTotal', 'Total') }}
              </p>
              <p class="mt-1 text-lg font-semibold text-black dark:text-white">
                {{ formatNumber(analyticsData.notifications.browserPushSubscriptions.total) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.pushRegistered', 'Registered') }}
              </p>
              <p class="mt-1 text-lg font-semibold text-black dark:text-white">
                {{ formatNumber(analyticsData.notifications.browserPushSubscriptions.registered) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.pushDeleted', 'Removed') }}
              </p>
              <p class="mt-1 text-lg font-semibold text-black dark:text-white">
                {{ formatNumber(analyticsData.notifications.browserPushSubscriptions.deleted) }}
              </p>
            </div>
          </div>
          <div class="mt-4 grid gap-2 text-sm">
            <div v-for="item in analyticsData.notifications.browserPushSubscriptions.byEndpointHost.slice(0, 4)" :key="`push-host:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.notifications.browserPushSubscriptions.byAction.slice(0, 3)" :key="`push-action:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <p v-if="analyticsData.notifications.browserPushSubscriptions.total === 0" class="text-sm text-black/45 dark:text-white/45">
              {{ tt('dashboard.governance.analytics.browserPushEmpty', 'No browser push subscription activity yet.') }}
            </p>
          </div>
        </div>

        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ tt('dashboard.governance.analytics.providerLeaderboard', 'Provider quota usage') }}
          </h3>
          <div class="mt-3 space-y-2">
            <div v-for="item in analyticsData.providers.leaderboard.slice(0, 6)" :key="item.providerId" class="rounded-lg bg-black/[0.02] p-3 text-sm dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="truncate font-medium text-black dark:text-white">{{ item.providerId }}</span>
                <span class="text-xs text-black/50 dark:text-white/50">{{ formatNumber(item.requests) }} req</span>
              </div>
              <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                {{ formatNumber(item.tokens) }} tokens · {{ item.byChannel[0]?.channel || 'unknown' }} · {{ item.byModel[0]?.model || 'unknown' }}
              </p>
            </div>
            <div class="mt-4 rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03]">
              <h4 class="text-xs font-semibold text-black/70 dark:text-white/70">
                {{ tt('dashboard.governance.analytics.providerQuotaUtilization', 'Quota utilization') }}
              </h4>
              <div class="mt-3 grid gap-2 sm:grid-cols-4">
                <div class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
                  <p class="text-[11px] text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.providerQuotaActive', 'Active') }}
                  </p>
                  <p class="mt-1 text-sm font-semibold text-black dark:text-white">
                    {{ formatNumber(analyticsData.providers.quotaSummary.active) }}
                  </p>
                </div>
                <div class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
                  <p class="text-[11px] text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.providerQuotaBlocked', 'Blocked') }}
                  </p>
                  <p class="mt-1 text-sm font-semibold text-red-600 dark:text-red-100">
                    {{ formatNumber(analyticsData.providers.quotaSummary.blocked) }}
                  </p>
                </div>
                <div class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
                  <p class="text-[11px] text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.providerQuotaWarning', 'Warning') }}
                  </p>
                  <p class="mt-1 text-sm font-semibold text-amber-600 dark:text-amber-100">
                    {{ formatNumber(analyticsData.providers.quotaSummary.warning) }}
                  </p>
                </div>
                <div class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
                  <p class="text-[11px] text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.providerQuotaPeak', 'Peak') }}
                  </p>
                  <p class="mt-1 text-sm font-semibold text-black dark:text-white">
                    {{ formatRatio(providerQuotaPeakUtilization) }}
                  </p>
                </div>
              </div>
              <div class="mt-3 grid gap-2 sm:grid-cols-3">
                <div class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
                  <p class="text-[11px] text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.providerQuotaLowestRemaining', 'Lowest remaining') }}
                  </p>
                  <p class="mt-1 text-sm font-semibold text-black dark:text-white">
                    {{ analyticsData.providers.quotaSummary.lowestRemainingRequests == null ? '-' : `${formatNumber(analyticsData.providers.quotaSummary.lowestRemainingRequests)} req` }}
                    ·
                    {{ analyticsData.providers.quotaSummary.lowestRemainingTokens == null ? '-' : `${formatNumber(analyticsData.providers.quotaSummary.lowestRemainingTokens)} tok` }}
                  </p>
                </div>
                <div class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
                  <p class="text-[11px] text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.providerQuotaOverage', 'Overage') }}
                  </p>
                  <p class="mt-1 text-sm font-semibold text-red-600 dark:text-red-100">
                    {{ formatNumber(analyticsData.providers.quotaSummary.requestOverage) }} req · {{ formatNumber(analyticsData.providers.quotaSummary.tokenOverage) }} tok
                  </p>
                </div>
                <div class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
                  <p class="text-[11px] text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.providerQuotaNearestExhaustion', 'Nearest exhaustion') }}
                  </p>
                  <p class="mt-1 text-sm font-semibold text-black dark:text-white">
                    {{ formatProjectedDays(providerQuotaNearestExhaustionDays) }}
                  </p>
                </div>
              </div>
              <div v-if="analyticsData.providers.quotaActionQueue.length" class="mt-3 grid gap-2">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-xs font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.providerQuotaActionQueue', 'Provider quota action queue') }}
                  </p>
                  <span class="text-xs text-black/45 dark:text-white/45">
                    {{ formatNumber(analyticsData.providers.quotaActionQueue.length) }}
                  </span>
                </div>
                <div v-for="item in analyticsData.providers.quotaActionQueue.slice(0, 5)" :key="`provider-quota-action:${item.key}`" class="rounded-lg border border-black/[0.05] p-2 text-xs dark:border-white/[0.06]">
                  <div class="flex items-center justify-between gap-3">
                    <span class="truncate font-medium text-black/70 dark:text-white/70">
                      {{ item.priority }} · {{ item.suggestedAction }}
                    </span>
                    <TxStatusBadge :text="providerQuotaActionReasonLabel(item.reason)" size="sm" :status="providerQuotaActionTone(item.priority)" />
                  </div>
                  <p class="mt-1 truncate text-black/45 dark:text-white/45">
                    {{ item.name || item.providerId }} · {{ item.channel || item.provider || 'global' }} · {{ item.windowDays }}d
                  </p>
                  <div class="mt-2 grid gap-1 text-black/55 dark:text-white/55 sm:grid-cols-2">
                    <span>{{ tt('dashboard.governance.analytics.providerQuotaActionUsage', 'Usage') }}: {{ formatNumber(item.requests) }} req · {{ formatNumber(item.tokens) }} tok</span>
                    <span>{{ tt('dashboard.governance.analytics.providerQuotaActionUtilization', 'Utilization') }}: {{ formatRatio(Math.max(item.requestUtilization ?? 0, item.tokenUtilization ?? 0)) }}</span>
                    <span>{{ tt('dashboard.governance.analytics.providerQuotaActionRemaining', 'Remaining') }}: {{ item.remainingRequests == null ? '-' : `${formatNumber(item.remainingRequests)} req` }} · {{ item.remainingTokens == null ? '-' : `${formatNumber(item.remainingTokens)} tok` }}</span>
                    <span>{{ tt('dashboard.governance.analytics.providerQuotaActionOverage', 'Overage') }}: {{ formatNumber(item.requestOverage) }} req · {{ formatNumber(item.tokenOverage) }} tok</span>
                  </div>
                  <p class="mt-1 truncate text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.providerQuotaActionBurnRate', 'Burn/day') }}: {{ formatNumber(item.requestsPerDay) }} req · {{ formatNumber(item.tokensPerDay) }} tok ·
                    {{ tt('dashboard.governance.analytics.providerQuotaActionExhaustion', 'Exhaustion') }}:
                    {{ formatProjectedDays(item.projectedRequestExhaustionDays) }} /
                    {{ formatProjectedDays(item.projectedTokenExhaustionDays) }}
                  </p>
                </div>
              </div>
              <div v-if="analyticsData.providers.quotaSmokeEvidence.length" class="mt-3 grid gap-2">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-xs font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.providerQuotaSmokeEvidence', 'Provider quota smoke evidence') }}
                  </p>
                  <span class="text-xs text-black/45 dark:text-white/45">
                    {{ formatNumber(analyticsData.providers.quotaSmokeEvidence.length) }}
                  </span>
                </div>
                <div v-for="item in analyticsData.providers.quotaSmokeEvidence.slice(0, 5)" :key="`provider-quota-smoke:${item.key}`" class="rounded-lg border border-black/[0.05] p-2 text-xs dark:border-white/[0.06]">
                  <div class="flex items-center justify-between gap-3">
                    <span class="truncate font-medium text-black/70 dark:text-white/70">
                      {{ item.providerId }} · {{ item.channel || 'global' }} · {{ item.mode }}
                    </span>
                    <TxStatusBadge :text="providerQuotaSmokeLabel(item.status)" size="sm" :status="providerQuotaSmokeTone(item.status)" />
                  </div>
                  <p class="mt-1 truncate text-black/45 dark:text-white/45">
                    {{ item.reason || '-' }} · {{ item.requestRecorded ? 'request recorded' : 'dry-run' }} · {{ formatNumber(item.tokensRecorded) }} tokens · {{ formatDate(item.latestAt) }}
                  </p>
                  <p class="mt-1 truncate text-black/40 dark:text-white/40">
                    {{ formatNumber(item.events) }} events · {{ formatNumber(item.allowed) }} allowed · {{ formatNumber(item.consumed) }} consumed · {{ formatNumber(item.blocked) }} blocked · {{ formatNumber(item.failed) }} failed · {{ formatNumber(item.uniqueActors) }} actors
                  </p>
                </div>
              </div>
              <div class="mt-3 grid gap-2">
                <div v-for="item in analyticsData.providers.quotaRiskItems.slice(0, 4)" :key="`provider-quota-risk:${item.configId}`" class="rounded-lg border border-black/[0.05] p-2 text-xs dark:border-white/[0.06]">
                  <div class="flex items-center justify-between gap-3">
                    <span class="truncate font-medium text-black/70 dark:text-white/70">{{ item.name || item.providerId }}</span>
                    <TxStatusBadge :text="providerQuotaRiskReasonLabel(item.riskReason)" size="sm" :status="providerQuotaTone(item.status)" />
                  </div>
                  <p class="mt-1 text-black/45 dark:text-white/45">
                    {{ item.providerId }} · {{ item.channel || item.provider || 'global' }} · {{ formatRatio(item.highestUtilization) }}
                  </p>
                  <p class="mt-1 text-black/55 dark:text-white/55">
                    {{ tt('dashboard.governance.analytics.providerQuotaRiskBudget', 'Remaining') }}:
                    {{ item.remaining.requests == null ? '-' : `${formatNumber(item.remaining.requests)} req` }}
                    ·
                    {{ item.remaining.tokens == null ? '-' : `${formatNumber(item.remaining.tokens)} tok` }}
                    ·
                    {{ tt('dashboard.governance.analytics.providerQuotaRiskExhaustion', 'Exhaustion') }}:
                    {{ formatProjectedDays(item.projectedExhaustionDays.requests) }}
                    /
                    {{ formatProjectedDays(item.projectedExhaustionDays.tokens) }}
                  </p>
                </div>
                <p v-if="analyticsData.providers.quotaRiskItems.length === 0" class="text-xs text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.providerQuotaRiskEmpty', 'No quota risk right now.') }}
                </p>
              </div>
              <div class="mt-2 grid gap-2">
                <div v-for="quota in analyticsData.providers.quotas.slice(0, 6)" :key="quota.configId" class="rounded-lg border border-black/[0.05] p-2 text-xs dark:border-white/[0.06]">
                  <div class="flex items-center justify-between gap-3">
                    <span class="truncate font-medium text-black/70 dark:text-white/70">{{ quota.providerId }}</span>
                    <TxStatusBadge :text="providerQuotaLabel(quota.status)" size="sm" :status="providerQuotaTone(quota.status)" />
                  </div>
                  <p class="mt-1 text-black/45 dark:text-white/45">
                    {{ quota.channel || quota.provider || 'global' }} · {{ quota.windowDays }}d
                  </p>
                  <div class="mt-2 grid gap-1 text-black/60 dark:text-white/60">
                    <div class="flex items-center justify-between gap-3">
                      <span>{{ tt('dashboard.governance.analytics.providerQuotaRequests', 'Requests') }}</span>
                      <span class="font-medium text-black dark:text-white">{{ formatNumber(quota.usage.requests) }} / {{ quota.limits.maxRequests == null ? '-' : formatNumber(quota.limits.maxRequests) }} · {{ formatRatio(quota.utilization.requests) }}</span>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                      <span>{{ tt('dashboard.governance.analytics.providerQuotaRemainingRequests', 'Remaining requests') }}</span>
                      <span class="font-medium text-black dark:text-white">{{ quota.remaining.requests == null ? '-' : formatNumber(quota.remaining.requests) }}</span>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                      <span>{{ tt('dashboard.governance.analytics.providerQuotaTokens', 'Tokens') }}</span>
                      <span class="font-medium text-black dark:text-white">{{ formatNumber(quota.usage.tokens) }} / {{ quota.limits.maxTokens == null ? '-' : formatNumber(quota.limits.maxTokens) }} · {{ formatRatio(quota.utilization.tokens) }}</span>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                      <span>{{ tt('dashboard.governance.analytics.providerQuotaRemainingTokens', 'Remaining tokens') }}</span>
                      <span class="font-medium text-black dark:text-white">{{ quota.remaining.tokens == null ? '-' : formatNumber(quota.remaining.tokens) }}</span>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                      <span>{{ tt('dashboard.governance.analytics.providerQuotaBurnRate', 'Burn / day') }}</span>
                      <span class="font-medium text-black dark:text-white">{{ formatNumber(quota.burnRate.requestsPerDay) }} req · {{ formatNumber(quota.burnRate.tokensPerDay) }} tok</span>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                      <span>{{ tt('dashboard.governance.analytics.providerQuotaProjectedExhaustion', 'Projected exhaustion') }}</span>
                      <span class="font-medium text-black dark:text-white">{{ quota.projectedExhaustionDays.requests == null ? '-' : `${formatNumber(quota.projectedExhaustionDays.requests)}d` }} · {{ quota.projectedExhaustionDays.tokens == null ? '-' : `${formatNumber(quota.projectedExhaustionDays.tokens)}d` }}</span>
                    </div>
                  </div>
                </div>
                <p v-if="analyticsData.providers.quotas.length === 0" class="text-xs text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.providerQuotaEmpty', 'No provider quota policy yet.') }}
                </p>
              </div>
            </div>
            <div class="mt-4 grid gap-3 md:grid-cols-2">
              <div class="rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03]">
                <h4 class="text-xs font-semibold text-black/70 dark:text-white/70">
                  {{ tt('dashboard.governance.analytics.providerTrend', 'Provider trend') }}
                </h4>
                <div class="mt-2 grid gap-2">
                  <div v-for="item in analyticsData.providers.trend.slice(-3)" :key="`provider-trend:${item.date}`" class="flex items-center justify-between gap-3 text-xs">
                    <span class="truncate text-black/55 dark:text-white/55">{{ item.date }}</span>
                    <span class="font-medium text-black dark:text-white">{{ formatNumber(item.requests) }} req · {{ formatNumber(item.tokens) }} tok</span>
                  </div>
                  <p v-if="analyticsData.providers.trend.length === 0" class="text-xs text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.providerTrendEmpty', 'No provider usage trend yet.') }}
                  </p>
                </div>
              </div>
              <div class="rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03]">
                <h4 class="text-xs font-semibold text-black/70 dark:text-white/70">
                  {{ tt('dashboard.governance.analytics.providerModels', 'Model distribution') }}
                </h4>
                <div class="mt-2 grid gap-2">
                  <div v-for="item in analyticsData.providers.byModel.slice(0, 6)" :key="`provider-model:${item.key}`" class="flex items-center justify-between gap-3 text-xs">
                    <span class="truncate text-black/55 dark:text-white/55">{{ item.key }}</span>
                    <span class="font-medium text-black dark:text-white">{{ formatNumber(item.quantity) }}</span>
                  </div>
                  <p v-if="analyticsData.providers.byModel.length === 0" class="text-xs text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.providerModelsEmpty', 'No model usage yet.') }}
                  </p>
                </div>
              </div>
              <div class="rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03] md:col-span-2">
                <h4 class="text-xs font-semibold text-black/70 dark:text-white/70">
                  {{ tt('dashboard.governance.analytics.providerChannelBreakdown', 'Provider channel usage') }}
                </h4>
                <div class="mt-2 grid gap-2">
                  <div
                    v-for="item in analyticsData.providers.channelDistribution.slice(0, 6)"
                    :key="`provider-channel:${item.providerId}:${item.channel}`"
                    class="rounded-lg border border-black/[0.05] p-2 text-xs dark:border-white/[0.06]"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <span class="truncate font-medium text-black dark:text-white">{{ item.providerId }} · {{ item.channel }}</span>
                      <span class="shrink-0 text-black/55 dark:text-white/55">{{ formatNumber(item.tokens) }} tok · {{ formatNumber(item.requests) }} req</span>
                    </div>
                    <p class="mt-1 truncate text-black/45 dark:text-white/45">
                      {{ tt('dashboard.governance.analytics.providerModelActors', 'Actors') }} {{ formatNumber(item.uniqueActors) }} · {{ item.byModel[0]?.model || 'unknown' }}
                    </p>
                    <p class="mt-1 truncate text-black/40 dark:text-white/40">
                      {{ item.byProviderType.slice(0, 2).map(provider => `${provider.providerType}:${formatNumber(provider.quantity)}`).join(' · ') || 'unknown' }}
                    </p>
                  </div>
                  <p v-if="analyticsData.providers.channelDistribution.length === 0" class="text-xs text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.providerChannelBreakdownEmpty', 'No provider channel usage yet.') }}
                  </p>
                </div>
              </div>
              <div class="rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03] md:col-span-2">
                <h4 class="text-xs font-semibold text-black/70 dark:text-white/70">
                  {{ tt('dashboard.governance.analytics.providerModelBreakdown', 'Model usage breakdown') }}
                </h4>
                <div class="mt-2 grid gap-2">
                  <div
                    v-for="item in analyticsData.providers.modelDistribution.slice(0, 5)"
                    :key="`provider-model-breakdown:${item.model}`"
                    class="rounded-lg border border-black/[0.05] p-2 text-xs dark:border-white/[0.06]"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <span class="truncate font-medium text-black dark:text-white">{{ item.model }}</span>
                      <span class="shrink-0 text-black/55 dark:text-white/55">{{ formatNumber(item.tokens) }} tok · {{ formatNumber(item.requests) }} req</span>
                    </div>
                    <p class="mt-1 truncate text-black/45 dark:text-white/45">
                      {{ tt('dashboard.governance.analytics.providerModelActors', 'Actors') }} {{ formatNumber(item.uniqueActors) }} · {{ item.byProvider[0]?.providerId || 'unknown' }} · {{ item.byChannel[0]?.channel || 'unknown' }}
                    </p>
                    <p class="mt-1 truncate text-black/40 dark:text-white/40">
                      {{ item.byProviderType.slice(0, 2).map(provider => `${provider.providerType}:${formatNumber(provider.quantity)}`).join(' · ') || 'unknown' }}
                    </p>
                  </div>
                  <p v-if="analyticsData.providers.modelDistribution.length === 0" class="text-xs text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.providerModelBreakdownEmpty', 'No model usage breakdown yet.') }}
                  </p>
                </div>
              </div>
              <div class="rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03] md:col-span-2">
                <h4 class="text-xs font-semibold text-black/70 dark:text-white/70">
                  {{ tt('dashboard.governance.analytics.providerModelChannelBreakdown', 'Model by channel usage') }}
                </h4>
                <div class="mt-2 grid gap-2">
                  <div
                    v-for="item in analyticsData.providers.modelChannelDistribution.slice(0, 6)"
                    :key="`provider-model-channel:${item.model}:${item.channel}`"
                    class="rounded-lg border border-black/[0.05] p-2 text-xs dark:border-white/[0.06]"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <span class="truncate font-medium text-black dark:text-white">{{ item.model }} · {{ item.channel }}</span>
                      <span class="shrink-0 text-black/55 dark:text-white/55">{{ formatNumber(item.tokens) }} tok · {{ formatNumber(item.requests) }} req</span>
                    </div>
                    <p class="mt-1 truncate text-black/45 dark:text-white/45">
                      {{ tt('dashboard.governance.analytics.providerModelActors', 'Actors') }} {{ formatNumber(item.uniqueActors) }} · {{ item.byProvider[0]?.providerId || 'unknown' }}
                    </p>
                    <p class="mt-1 truncate text-black/40 dark:text-white/40">
                      {{ item.byProviderType.slice(0, 2).map(provider => `${provider.providerType}:${formatNumber(provider.quantity)}`).join(' · ') || 'unknown' }}
                    </p>
                  </div>
                  <p v-if="analyticsData.providers.modelChannelDistribution.length === 0" class="text-xs text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.providerModelChannelBreakdownEmpty', 'No model/channel usage breakdown yet.') }}
                  </p>
                </div>
              </div>
              <div class="rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03] md:col-span-2">
                <h4 class="text-xs font-semibold text-black/70 dark:text-white/70">
                  {{ tt('dashboard.governance.analytics.providerTypes', 'Provider types') }}
                </h4>
                <div class="mt-2 grid gap-2">
                  <div v-for="item in analyticsData.providers.byProviderType.slice(0, 6)" :key="`provider-type:${item.key}`" class="flex items-center justify-between gap-3 text-xs">
                    <span class="truncate text-black/55 dark:text-white/55">{{ item.key }}</span>
                    <span class="font-medium text-black dark:text-white">{{ formatNumber(item.quantity) }}</span>
                  </div>
                  <p v-if="analyticsData.providers.byProviderType.length === 0" class="text-xs text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.providerTypesEmpty', 'No provider type usage yet.') }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <div class="space-y-4">
        <section class="apple-card-lg p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-black dark:text-white">
                {{ tt('dashboard.governance.forms.analyticsTitle', 'Analytics collection') }}
              </h2>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ tt('dashboard.governance.forms.analyticsHint', 'Keep event collection granular but hashed and metadata-bounded.') }}
              </p>
            </div>
            <TxButton size="small" :disabled="saving" @click="saveConfig('analytics_collection', analyticsForm)">
              {{ t('common.save', 'Save') }}
            </TxButton>
          </div>
          <div class="mt-4 grid gap-3 md:grid-cols-3">
            <TuffInput v-model="analyticsForm.name" class="w-full" />
            <TuffInput v-model="analyticsForm.channel" class="w-full" />
            <TuffInput v-model="analyticsForm.warningThreshold" class="w-full" />
          </div>
          <div class="mt-3 grid gap-3 md:grid-cols-2">
            <textarea v-model="analyticsForm.limitsJson" class="GovernanceTextarea" spellcheck="false" />
            <textarea v-model="analyticsForm.configJson" class="GovernanceTextarea" spellcheck="false" />
          </div>
        </section>

        <section class="apple-card-lg p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-black dark:text-white">
                {{ tt('dashboard.governance.notificationTest.title', 'Notification channel test') }}
              </h2>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ tt('dashboard.governance.notificationTest.hint', 'Dry-run records sanitized delivery audit; send follows the selected channel config and runtime metadata.') }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <TxButton variant="secondary" size="small" :disabled="notificationTesting || !notificationTestForm.configId" @click="testNotificationChannel('plan')">
                <TxSpinner v-if="notificationTesting" :size="14" />
                <span :class="notificationTesting ? 'ml-2' : ''">{{ tt('dashboard.governance.notificationTest.dryRun', 'Dry run') }}</span>
              </TxButton>
              <TxButton size="small" :disabled="notificationTesting || !notificationTestForm.configId" @click="testNotificationChannel('send')">
                {{ tt('dashboard.governance.notificationTest.send', 'Send using config') }}
              </TxButton>
            </div>
          </div>
          <div class="mt-4 grid gap-3 md:grid-cols-[1.5fr_1fr_1fr]">
            <TuffSelect v-model="notificationTestForm.configId" class="w-full">
              <TuffSelectItem
                v-for="channel in notificationConfigs"
                :key="channel.id"
                :value="channel.id"
                :label="`${channel.name} · ${channel.channel || 'unknown'} / ${channel.provider || 'default'}`"
              />
            </TuffSelect>
            <TuffInput v-model="notificationTestForm.action" class="w-full" />
            <TuffInput v-model="notificationTestForm.resourceId" class="w-full" placeholder="optional resource id" />
          </div>
          <div v-if="selectedNotificationChannelEvaluation" class="mt-3 rounded-xl border border-black/[0.06] bg-black/[0.02] p-3 text-xs text-black/55 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/55">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="truncate font-medium text-black/70 dark:text-white/70">
                {{ selectedNotificationChannelEvaluation.profile.adapter }} · {{ notificationChannelCredentialLabel(selectedNotificationChannelEvaluation.profile) }}
              </span>
              <TxStatusBadge
                :text="notificationChannelLabel(selectedNotificationChannelEvaluation.readiness.status)"
                size="sm"
                :status="notificationChannelTone(selectedNotificationChannelEvaluation.readiness.status)"
              />
            </div>
            <p class="mt-2 truncate">
              {{ notificationChannelReadinessLabel(selectedNotificationChannelEvaluation) }}
            </p>
          </div>
          <textarea v-model="notificationTestForm.metadataJson" class="GovernanceTextarea mt-3" spellcheck="false" />
          <div v-if="notificationTestResult" class="mt-4 rounded-xl border border-black/[0.06] p-3 text-sm dark:border-white/[0.08]">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate font-medium text-black dark:text-white">
                  {{ notificationTestResult.channel.name }}
                </p>
                <p class="text-xs text-black/45 dark:text-white/45">
                  {{ notificationTestResult.action }} · {{ notificationTestResult.mode }} · {{ formatDate(notificationTestResult.generatedAt) }}
                </p>
              </div>
              <TxStatusBadge
                :text="notificationTestResult.channel.enabled ? t('common.enabled', 'Enabled') : t('common.disabled', 'Disabled')"
                size="sm"
                :status="notificationTestResult.channel.enabled ? 'success' : 'warning'"
              />
            </div>
            <div class="mt-3 grid gap-2">
              <div v-for="delivery in notificationTestResult.deliveries" :key="`${delivery.configId}:${delivery.adapter}:${delivery.status}`" class="rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03]">
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate font-medium text-black dark:text-white">{{ delivery.configName }}</span>
                  <TxStatusBadge :text="delivery.status" size="sm" :status="notificationDeliveryTone(delivery.status)" />
                </div>
                <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                  {{ delivery.channel }} · {{ delivery.provider || 'default' }} · {{ delivery.providerType || delivery.adapter }} · {{ delivery.reason }}
                </p>
                <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.notificationAvgDuration', 'Duration') }} · {{ formatDurationMs(delivery.durationMs) }}
                </p>
                <p v-if="delivery.statusCode != null" class="mt-1 text-xs text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.notificationStatusCode', 'Status code') }} · {{ delivery.statusCode }}
                </p>
                <p class="mt-1 text-xs text-black/40 dark:text-white/40">
                  {{ delivery.credentialRequired ? tt('dashboard.governance.notificationTest.credentialRequired', 'Credential required') : tt('dashboard.governance.notificationTest.credentialOptional', 'No credential required') }} · {{ delivery.hasCredentialRef ? tt('dashboard.governance.notificationTest.credentialRefBound', 'credentialRef bound') : tt('dashboard.governance.notificationTest.credentialRefMissing', 'credentialRef missing') }}
                </p>
              </div>
              <p v-if="notificationTestResult.deliveries.length === 0" class="text-sm text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.notificationTest.empty', 'No delivery matched the selected channel.') }}
              </p>
            </div>
          </div>
        </section>

        <section class="apple-card-lg p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-black dark:text-white">
                {{ tt('dashboard.governance.forms.storageTitle', 'Storage channel policy') }}
              </h2>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ tt('dashboard.governance.forms.storageHint', 'Configure local/R2/S3/OSS ceilings, traffic limits, and warning thresholds.') }}
              </p>
            </div>
            <TxButton size="small" :disabled="saving" @click="saveConfig('storage_channel', storageForm)">
              {{ t('common.save', 'Save') }}
            </TxButton>
          </div>
          <div class="mt-4 grid gap-3 md:grid-cols-5">
            <TuffSelect v-model="storageForm.profileId" class="w-full" @change="applyStorageProfile">
              <TuffSelectItem
                v-for="profile in storageProfiles"
                :key="profile.id"
                :value="profile.id"
                :label="profile.label"
              />
            </TuffSelect>
            <TuffInput v-model="storageForm.name" class="w-full" />
            <TuffInput v-model="storageForm.channel" class="w-full" />
            <TuffInput v-model="storageForm.provider" class="w-full" />
            <TuffInput v-model="storageForm.warningThreshold" class="w-full" />
          </div>
          <div v-if="selectedStorageProfile" class="mt-3 rounded-xl border border-black/[0.06] bg-black/[0.02] p-3 text-xs text-black/55 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/55">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="font-medium text-black/70 dark:text-white/70">{{ selectedStorageProfile.description }}</span>
              <TxStatusBadge
                size="sm"
                :text="selectedStorageProfile.status === 'active' ? tt('dashboard.governance.storageProfiles.active', 'Active') : tt('dashboard.governance.storageProfiles.policyReady', 'Policy ready')"
                :status="selectedStorageProfile.status === 'active' ? 'success' : 'info'"
              />
            </div>
            <p class="mt-2">
              {{ tt('dashboard.governance.storageProfiles.configKeys', 'Config keys') }}:
              {{ [...selectedStorageProfile.requiredConfigKeys, ...selectedStorageProfile.optionalConfigKeys].join(', ') || '-' }}
            </p>
            <p class="mt-1">
              {{ tt('dashboard.governance.storageProfiles.limitKeys', 'Limit keys') }}:
              {{ selectedStorageProfile.limitKeys.slice(0, 8).join(', ') }}
            </p>
          </div>
          <div class="mt-3 rounded-xl border border-black/[0.06] bg-black/[0.02] p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-xs font-semibold uppercase tracking-wide text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.storageChannelDetail', 'Selected channel') }}
                </p>
                <p class="mt-1 truncate text-sm font-medium text-black dark:text-white">
                  {{ selectedStorageChannelAnalytics.channel || storageForm.channel || 'unknown' }} · {{ selectedStorageChannelAnalytics.provider || storageForm.provider || 'default' }}
                </p>
              </div>
              <TxStatusBadge
                size="sm"
                :text="storageChannelAnalyticsHydratedPending ? t('common.loading', 'Loading') : storageChannelPressureLabel(selectedStorageChannelAnalytics.channelPressure[0]?.pressureStatus ?? 'unmanaged')"
                :status="storageChannelAnalyticsHydratedPending ? 'muted' : storageChannelPressureTone(selectedStorageChannelAnalytics.channelPressure[0]?.pressureStatus ?? 'unmanaged')"
              />
            </div>
            <div class="mt-3 grid gap-2 text-xs md:grid-cols-4">
              <div>
                <p class="text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.storageStored', 'Stored') }}
                </p>
                <p class="mt-1 font-semibold text-black dark:text-white">
                  {{ formatBytes(selectedStorageChannelAnalytics.storedBytes) }}
                </p>
              </div>
              <div>
                <p class="text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.storageTraffic', 'Traffic') }}
                </p>
                <p class="mt-1 font-semibold text-black dark:text-white">
                  {{ formatBytes(selectedStorageChannelAnalytics.trafficBytes) }}
                </p>
              </div>
              <div>
                <p class="text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.storageOperations', 'Ops') }}
                </p>
                <p class="mt-1 font-semibold text-black dark:text-white">
                  {{ formatNumber(selectedStorageChannelAnalytics.operations) }}
                </p>
              </div>
              <div>
                <p class="text-black/45 dark:text-white/45">
                  {{ tt('dashboard.governance.analytics.storagePolicyAlerts', 'Alerts') }}
                </p>
                <p class="mt-1 font-semibold text-black dark:text-white">
                  {{ formatNumber(selectedStorageChannelAnalytics.alerts.length) }}
                </p>
              </div>
            </div>
            <p class="mt-3 text-xs text-black/45 dark:text-white/45">
              {{ formatNumber(selectedStorageChannelAnalytics.writes) }} writes · {{ formatNumber(selectedStorageChannelAnalytics.reads) }} reads · {{ formatNumber(selectedStorageChannelAnalytics.deletes) }} deletes
            </p>
            <div class="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p class="text-xs font-medium text-black/55 dark:text-white/55">
                  {{ tt('dashboard.governance.analytics.storageResourceType', 'Resource') }}
                </p>
                <div class="mt-2 grid gap-1">
                  <div v-for="item in storageChannelAnalyticsData.byResourceTypeUsage.slice(0, 3)" :key="`selected-storage-resource:${item.key}`" class="flex items-center justify-between gap-3 text-xs">
                    <span class="truncate text-black/50 dark:text-white/50">{{ item.key }}</span>
                    <span class="shrink-0 font-medium text-black dark:text-white">{{ formatBytes(item.storedBytes + item.trafficBytes) }}</span>
                  </div>
                  <p v-if="storageChannelAnalyticsData.byResourceTypeUsage.length === 0" class="text-xs text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.storageChannelDetailEmpty', 'No usage yet.') }}
                  </p>
                </div>
              </div>
              <div>
                <p class="text-xs font-medium text-black/55 dark:text-white/55">
                  {{ tt('dashboard.governance.analytics.storageAction', 'Action') }}
                </p>
                <div class="mt-2 grid gap-1">
                  <div v-for="item in storageChannelAnalyticsData.byActionUsage.slice(0, 3)" :key="`selected-storage-action:${item.key}`" class="flex items-center justify-between gap-3 text-xs">
                    <span class="truncate text-black/50 dark:text-white/50">{{ item.key }}</span>
                    <span class="shrink-0 font-medium text-black dark:text-white">{{ formatNumber(item.operations) }} ops</span>
                  </div>
                  <p v-if="storageChannelAnalyticsData.byActionUsage.length === 0" class="text-xs text-black/45 dark:text-white/45">
                    {{ tt('dashboard.governance.analytics.storageChannelDetailEmpty', 'No usage yet.') }}
                  </p>
                </div>
              </div>
            </div>
            <div v-if="selectedStorageChannelAnalytics.trend.at(-1) || selectedStorageChannelAnalytics.evaluations[0]" class="mt-3 grid gap-2 text-xs md:grid-cols-2">
              <p v-if="selectedStorageChannelAnalytics.trend.at(-1)" class="truncate text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.storageChannelLatestTrend', 'Latest trend') }} · {{ selectedStorageChannelAnalytics.trend.at(-1)?.date }} · {{ formatBytes((selectedStorageChannelAnalytics.trend.at(-1)?.storedBytes ?? 0) + (selectedStorageChannelAnalytics.trend.at(-1)?.trafficBytes ?? 0)) }} · {{ formatNumber(selectedStorageChannelAnalytics.trend.at(-1)?.operations ?? 0) }} ops
              </p>
              <p v-if="selectedStorageChannelAnalytics.evaluations[0]" class="truncate text-black/45 dark:text-white/45">
                {{ tt('dashboard.governance.analytics.storageChannelPolicyState', 'Policy state') }} · {{ selectedStorageChannelAnalytics.evaluations[0].name }} · {{ storageEvaluationLabel(selectedStorageChannelAnalytics.evaluations[0].status) }} · {{ selectedStorageChannelAnalytics.evaluations[0].reasons.join(', ') || '-' }}
              </p>
            </div>
          </div>
          <div class="mt-3 grid gap-3 md:grid-cols-2">
            <textarea v-model="storageForm.limitsJson" class="GovernanceTextarea" spellcheck="false" />
            <textarea v-model="storageForm.configJson" class="GovernanceTextarea" spellcheck="false" />
          </div>
        </section>

        <section class="apple-card-lg p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-black dark:text-white">
                {{ tt('dashboard.governance.storageCredentials.title', 'Storage credential') }}
              </h2>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ tt('dashboard.governance.storageCredentials.hint', 'Bind secure://storage/* refs to encrypted D1 access keys for S3-compatible and OSS executors.') }}
              </p>
            </div>
            <TxButton size="small" :disabled="saving" @click="saveStorageCredential">
              {{ t('common.save', 'Save') }}
            </TxButton>
          </div>
          <div class="mt-4 grid gap-3 md:grid-cols-[1.5fr_0.75fr]">
            <TuffInput v-model="storageCredentialForm.authRef" class="w-full" />
            <TuffInput v-model="storageCredentialForm.credentialType" class="w-full" />
          </div>
          <textarea v-model="storageCredentialForm.credentialsJson" class="GovernanceTextarea mt-3" spellcheck="false" />
          <div class="mt-4 grid gap-2 text-sm">
            <div v-for="credential in storageCredentials.slice(0, 5)" :key="credential.authRef" class="flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] px-3 py-2 dark:border-white/[0.08]">
              <div class="min-w-0">
                <p class="truncate font-medium text-black dark:text-white">
                  {{ credential.authRef }}
                </p>
                <p class="text-xs text-black/45 dark:text-white/45">
                  {{ credential.credentialType }} · {{ credential.backend }} · {{ formatDate(credential.updatedAt) }}
                </p>
              </div>
              <TxStatusBadge :text="credential.hasCredential ? tt('dashboard.governance.storageCredentials.bound', 'Bound') : tt('dashboard.governance.storageCredentials.missing', 'Missing')" size="sm" :status="credential.hasCredential ? 'success' : 'warning'" />
            </div>
            <p v-if="storageCredentials.length === 0" class="text-sm text-black/45 dark:text-white/45">
              {{ tt('dashboard.governance.storageCredentials.empty', 'No storage credentials bound yet.') }}
            </p>
          </div>
        </section>

        <section class="apple-card-lg p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-black dark:text-white">
                {{ tt('dashboard.governance.forms.notificationTitle', 'Notification channel') }}
              </h2>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ tt('dashboard.governance.forms.notificationHint', 'Use provider for the channel instance and config.providerType for browser, Feishu/Lark, Resend, SendGrid, Mailgun, Postmark, SMTP relay, webhook, or Web Push adapters. Credentialed adapters use credentialRef only.') }}
              </p>
            </div>
            <TxButton size="small" :disabled="saving" @click="saveConfig('notification_channel', notificationForm)">
              {{ t('common.save', 'Save') }}
            </TxButton>
          </div>
          <div class="mt-4 grid gap-3 md:grid-cols-5">
            <TuffSelect v-model="notificationForm.profileId" class="w-full" @change="applyNotificationProfile">
              <TuffSelectItem
                v-for="profile in notificationProfiles"
                :key="profile.id"
                :value="profile.id"
                :label="profile.label"
              />
            </TuffSelect>
            <TuffInput v-model="notificationForm.name" class="w-full" />
            <TuffInput v-model="notificationForm.channel" class="w-full" />
            <TuffInput v-model="notificationForm.provider" class="w-full" />
            <TuffInput v-model="notificationForm.warningThreshold" class="w-full" />
          </div>
          <div v-if="selectedNotificationProfile" class="mt-3 rounded-xl border border-black/[0.06] bg-black/[0.02] p-3 text-xs text-black/55 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/55">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="font-medium text-black/70 dark:text-white/70">{{ selectedNotificationProfile.description }}</span>
              <TxStatusBadge
                size="sm"
                :text="selectedNotificationProfile.adapter"
                :status="selectedNotificationProfile.credentialType ? 'info' : 'success'"
              />
            </div>
            <p class="mt-2">
              {{ tt('dashboard.governance.notificationProfiles.credential', 'Credential') }}:
              {{ selectedNotificationProfile.credentialType || tt('dashboard.governance.notificationProfiles.none', 'None') }}
              · {{ selectedNotificationProfile.credentialRefPrefix || '-' }}
            </p>
            <p class="mt-1">
              {{ tt('dashboard.governance.notificationProfiles.configKeys', 'Config keys') }}:
              {{ [...selectedNotificationProfile.requiredConfigKeys, ...selectedNotificationProfile.optionalConfigKeys].join(', ') || '-' }}
            </p>
          </div>
          <div class="mt-3 grid gap-3 md:grid-cols-2">
            <textarea v-model="notificationForm.limitsJson" class="GovernanceTextarea" spellcheck="false" />
            <textarea v-model="notificationForm.configJson" class="GovernanceTextarea" spellcheck="false" />
          </div>
        </section>

        <section class="apple-card-lg p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-black dark:text-white">
                {{ tt('dashboard.governance.credentials.title', 'Notification credential') }}
              </h2>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ tt('dashboard.governance.credentials.hint', 'Bind secure://notifications/* refs to encrypted D1 credentials. Governance configs only keep credentialRef.') }}
              </p>
            </div>
            <TxButton size="small" :disabled="saving" @click="saveNotificationCredential">
              {{ t('common.save', 'Save') }}
            </TxButton>
          </div>
          <div class="mt-4 grid gap-3 md:grid-cols-[1.5fr_0.75fr]">
            <TuffInput v-model="notificationCredentialForm.authRef" class="w-full" />
            <TuffInput v-model="notificationCredentialForm.credentialType" class="w-full" />
          </div>
          <textarea v-model="notificationCredentialForm.credentialsJson" class="GovernanceTextarea mt-3" spellcheck="false" />
          <div class="mt-4 grid gap-2 text-sm">
            <div v-for="credential in notificationCredentials.slice(0, 5)" :key="credential.authRef" class="flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] px-3 py-2 dark:border-white/[0.08]">
              <div class="min-w-0">
                <p class="truncate font-medium text-black dark:text-white">
                  {{ credential.authRef }}
                </p>
                <p class="text-xs text-black/45 dark:text-white/45">
                  {{ credential.credentialType }} · {{ credential.backend }} · {{ formatDate(credential.updatedAt) }}
                </p>
              </div>
              <TxStatusBadge :text="credential.hasCredential ? tt('dashboard.governance.credentials.bound', 'Bound') : tt('dashboard.governance.credentials.missing', 'Missing')" size="sm" :status="credential.hasCredential ? 'success' : 'warning'" />
            </div>
            <p v-if="notificationCredentials.length === 0" class="text-sm text-black/45 dark:text-white/45">
              {{ tt('dashboard.governance.credentials.empty', 'No notification credentials bound yet.') }}
            </p>
          </div>
        </section>

        <section class="apple-card-lg p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-black dark:text-white">
                {{ tt('dashboard.governance.forms.providerQuotaTitle', 'Provider quota') }}
              </h2>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ tt('dashboard.governance.forms.providerQuotaHint', 'Limit Intelligence provider requests and token budgets by channel.') }}
              </p>
            </div>
            <TxButton size="small" :disabled="saving" @click="saveConfig('intelligence_provider_quota', providerQuotaForm)">
              {{ t('common.save', 'Save') }}
            </TxButton>
          </div>
          <div class="mt-4 grid gap-3 md:grid-cols-5">
            <TuffInput v-model="providerQuotaForm.name" class="w-full" />
            <TuffInput v-model="providerQuotaForm.targetId" class="w-full" placeholder="provider id" />
            <TuffInput v-model="providerQuotaForm.provider" class="w-full" />
            <TuffInput v-model="providerQuotaForm.channel" class="w-full" />
            <TuffInput v-model="providerQuotaForm.warningThreshold" class="w-full" />
          </div>
          <div class="mt-3 grid gap-3 md:grid-cols-2">
            <textarea v-model="providerQuotaForm.limitsJson" class="GovernanceTextarea" spellcheck="false" />
            <textarea v-model="providerQuotaForm.configJson" class="GovernanceTextarea" spellcheck="false" />
          </div>
        </section>
      </div>

      <aside class="space-y-4">
        <section class="apple-card-lg p-5">
          <h2 class="text-base font-semibold text-black dark:text-white">
            {{ tt('dashboard.governance.breakdown.actions', 'Event actions') }}
          </h2>
          <div class="mt-4 space-y-3">
            <div v-for="item in summaryData.byAction.slice(0, 8)" :key="item.action" class="flex items-center justify-between gap-3 text-sm">
              <span class="truncate text-black/70 dark:text-white/70">{{ item.action }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
          </div>
        </section>

        <section class="apple-card-lg p-5">
          <h2 class="text-base font-semibold text-black dark:text-white">
            {{ tt('dashboard.governance.breakdown.resources', 'Hot resources') }}
          </h2>
          <div class="mt-4 space-y-3">
            <div v-for="item in summaryData.topResources" :key="`${item.resourceType}:${item.resourceId}:${item.action}`" class="rounded-xl bg-black/[0.02] p-3 text-sm dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="truncate font-medium text-black dark:text-white">{{ item.resourceId }}</span>
                <TxStatusBadge :text="item.action" size="sm" status="info" />
              </div>
              <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                {{ item.resourceType }} · {{ formatNumber(item.events) }} events · {{ formatNumber(item.uniqueActors) }} actors
              </p>
            </div>
          </div>
        </section>

        <section class="apple-card-lg p-5">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-base font-semibold text-black dark:text-white">
              {{ tt('dashboard.governance.storageAlerts.title', 'Storage alerts') }}
            </h2>
            <div class="flex items-center gap-2">
              <TxButton size="small" :disabled="storageAlertNotifying || storagePolicyAlerts.length === 0" @click="notifyStorageAlerts('plan')">
                {{ tt('dashboard.governance.storageAlerts.dryRun', 'Dry run') }}
              </TxButton>
              <TxButton size="small" :disabled="storageAlertNotifying || storagePolicyAlerts.length === 0" @click="notifyStorageAlerts('send')">
                {{ tt('dashboard.governance.storageAlerts.send', 'Send') }}
              </TxButton>
              <TxStatusBadge
                size="sm"
                :text="formatNumber(storagePolicyAlerts.length)"
                :status="storagePolicyAlerts.some(item => item.status === 'blocked') ? 'danger' : storagePolicyAlerts.length ? 'warning' : 'success'"
              />
            </div>
          </div>
          <p v-if="storageAlertNotifyResult" class="mt-2 text-xs text-black/50 dark:text-white/50">
            {{ tt('dashboard.governance.storageAlerts.dispatched', 'Dispatches') }}:
            {{ formatNumber(storageAlertNotifyResult.dispatches.reduce((sum, item) => sum + item.deliveries.length, 0)) }}
            · {{ storageAlertNotifyResult.mode }}
          </p>
          <div class="mt-4 space-y-3">
            <div v-for="alert in storagePolicyAlerts.slice(0, 6)" :key="`${alert.policyId}:${alert.metric}:${alert.limit ?? 'alert'}`" class="rounded-xl border border-black/[0.06] p-3 text-sm dark:border-white/[0.08]">
              <div class="flex items-center justify-between gap-3">
                <span class="truncate font-medium text-black dark:text-white">{{ alert.name }}</span>
                <TxStatusBadge :text="storageEvaluationLabel(alert.status)" size="sm" :status="storageEvaluationTone(alert.status)" />
              </div>
              <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                {{ alert.channel }} · {{ alert.provider || 'unknown' }} · {{ storageAlertMetricLabel(alert.metric) }}
              </p>
              <div class="mt-3 flex items-center justify-between gap-3 text-xs">
                <span class="text-black/55 dark:text-white/55">
                  {{ formatStorageAlertValue(alert, alert.usage) }} / {{ formatStorageAlertValue(alert, alert.limit) }}
                </span>
                <span class="font-medium text-black dark:text-white">{{ formatRatio(alert.utilization) }}</span>
              </div>
              <p v-if="alert.reasons.length" class="mt-2 truncate text-xs text-amber-600 dark:text-amber-200">
                {{ alert.reasons.join(', ') }}
              </p>
            </div>
            <p v-if="storagePolicyAlerts.length === 0" class="text-sm text-black/45 dark:text-white/45">
              {{ tt('dashboard.governance.storageAlerts.empty', 'No storage alerts right now.') }}
            </p>
          </div>
        </section>

        <section class="apple-card-lg p-5">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-base font-semibold text-black dark:text-white">
              {{ tt('dashboard.governance.storagePolicy.title', 'Storage policy health') }}
            </h2>
            <span class="text-xs text-black/45 dark:text-white/45">
              {{ formatDate(storagePoliciesData.generatedAt) }}
            </span>
          </div>
          <p v-if="storageSmokeError" class="mt-2 text-xs text-red-600 dark:text-red-200">
            {{ storageSmokeError }}
          </p>
          <p v-if="storageSmokeResult" class="mt-2 text-xs text-black/50 dark:text-white/50">
            {{ tt('dashboard.governance.storageSmoke.result', 'Storage smoke') }}:
            {{ storageSmokeResult.policyName }} · {{ storageSmokeResult.mode }} · {{ storageSmokeResult.status }} · {{ storageSmokeResult.reason }}
          </p>
          <div class="mt-4 space-y-3">
            <div v-for="item in storageEvaluations.slice(0, 6)" :key="item.policyId" class="rounded-xl border border-black/[0.06] p-3 text-sm dark:border-white/[0.08]">
              <div class="flex items-center justify-between gap-3">
                <span class="truncate font-medium text-black dark:text-white">{{ item.name }}</span>
                <div class="flex shrink-0 items-center gap-2">
                  <TxButton size="small" variant="secondary" :disabled="storageSmokeRunning" @click="smokeStoragePolicy(item.policyId, 'dry-run')">
                    {{ tt('dashboard.governance.storageSmoke.dryRun', 'Smoke') }}
                  </TxButton>
                  <TxButton size="small" :disabled="storageSmokeRunning" @click="smokeStoragePolicy(item.policyId, 'write')">
                    {{ tt('dashboard.governance.storageSmoke.write', 'Write smoke') }}
                  </TxButton>
                  <TxStatusBadge
                    :text="storageEvaluationLabel(item.status)"
                    size="sm"
                    :status="storageEvaluationTone(item.status)"
                  />
                </div>
              </div>
              <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                {{ item.channel }} · {{ item.provider || 'unknown' }} · {{ item.days }}d
              </p>
              <div class="mt-3 grid gap-2 text-xs text-black/55 dark:text-white/55">
                <div class="flex items-center justify-between gap-3">
                  <span>{{ tt('dashboard.governance.storagePolicy.stored', 'Stored') }}</span>
                  <span class="font-medium text-black dark:text-white">{{ formatBytes(item.usage.storedBytes) }} · {{ formatRatio(item.utilization.storedBytes) }} · {{ formatStorageBudgetValue(item.remaining.storedBytes, 'bytes') }}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span>{{ tt('dashboard.governance.storagePolicy.traffic', 'Traffic') }}</span>
                  <span class="font-medium text-black dark:text-white">{{ formatBytes(item.usage.trafficBytes) }} · {{ formatRatio(item.utilization.trafficBytes) }} · {{ formatStorageBudgetValue(item.remaining.trafficBytes, 'bytes') }}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span>{{ tt('dashboard.governance.storagePolicy.operations', 'Operations') }}</span>
                  <span class="font-medium text-black dark:text-white">{{ formatNumber(item.usage.operations) }} · {{ formatRatio(item.utilization.operations) }} · {{ formatStorageBudgetValue(item.remaining.operations, 'operations') }}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span>{{ tt('dashboard.governance.storagePolicy.burnRate', 'Burn/day') }}</span>
                  <span class="font-medium text-black dark:text-white">{{ formatBytes(item.burnRate.storedBytesPerDay) }} · {{ formatBytes(item.burnRate.trafficBytesPerDay) }} · {{ formatNumber(item.burnRate.operationsPerDay) }} ops</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span>{{ tt('dashboard.governance.storagePolicy.projectedExhaustion', 'Projected exhaustion') }}</span>
                  <span class="font-medium text-black dark:text-white">{{ formatProjectedDays(item.projectedExhaustionDays.storedBytes) }} · {{ formatProjectedDays(item.projectedExhaustionDays.trafficBytes) }} · {{ formatProjectedDays(item.projectedExhaustionDays.operations) }}</span>
                </div>
                <div v-if="item.overage.alertBytes > 0" class="flex items-center justify-between gap-3 text-amber-600 dark:text-amber-200">
                  <span>{{ tt('dashboard.governance.storagePolicy.alertOverage', 'Alert overage') }}</span>
                  <span class="font-medium">{{ formatBytes(item.overage.alertBytes) }}</span>
                </div>
              </div>
              <p v-if="item.reasons.length" class="mt-2 truncate text-xs text-amber-600 dark:text-amber-200">
                {{ item.reasons.join(', ') }}
              </p>
            </div>
            <p v-if="storageEvaluations.length === 0" class="text-sm text-black/45 dark:text-white/45">
              {{ tt('dashboard.governance.storagePolicy.empty', 'No storage policy evaluation yet.') }}
            </p>
          </div>
        </section>

        <section class="apple-card-lg p-5">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-base font-semibold text-black dark:text-white">
              {{ tt('dashboard.governance.policies.title', 'Policies') }}
            </h2>
            <span class="text-xs text-black/45 dark:text-white/45">
              {{ formatDate(configsData.generatedAt) }}
            </span>
          </div>
          <div class="mt-4 space-y-3">
            <div v-for="item in configs.slice(0, 10)" :key="item.id" class="rounded-xl border border-black/[0.06] p-3 text-sm dark:border-white/[0.08]">
              <div class="flex items-center justify-between gap-3">
                <span class="truncate font-medium text-black dark:text-white">{{ item.name }}</span>
                <TxStatusBadge
                  :text="item.enabled ? t('common.enabled', 'Enabled') : t('common.disabled', 'Disabled')"
                  size="sm"
                  :status="item.enabled ? 'success' : 'warning'"
                />
              </div>
              <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                {{ configTypeLabel(item.configType) }} · {{ item.channel || item.provider || item.targetId || 'global' }}
              </p>
            </div>
          </div>
          <div class="mt-4 grid gap-2 text-xs text-black/50 dark:text-white/50">
            <span>{{ tt('dashboard.governance.policies.analytics', 'Analytics') }}: {{ groupedConfigs.analytics.length }}</span>
            <span>{{ tt('dashboard.governance.policies.storage', 'Storage') }}: {{ groupedConfigs.storage.length }}</span>
            <span>{{ tt('dashboard.governance.policies.notifications', 'Notifications') }}: {{ groupedConfigs.notifications.length }}</span>
            <span>{{ tt('dashboard.governance.policies.providerQuotas', 'Provider quotas') }}: {{ groupedConfigs.providerQuotas.length }}</span>
          </div>
        </section>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.GovernanceTextarea {
  min-height: 132px;
  width: 100%;
  resize: vertical;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.72);
  padding: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--tx-text-color-primary, #111827);
  outline: none;
}

.GovernanceTextarea:focus {
  border-color: rgba(37, 99, 235, 0.45);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

:root.dark .GovernanceTextarea {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.9);
}
</style>
