<script setup lang="ts">
import { TuffInput, TuffSelect, TuffSelectItem, TxButton, TxSpinner, TxStatusBadge } from '@talex-touch/tuffex'
import { computed, reactive, ref, watch } from 'vue'
import { requestJson } from '~/utils/request'

definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t } = useI18n()
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
type ProviderQuotaStatus = 'ok' | 'warning' | 'blocked' | 'disabled'
type StorageAlertMetric = 'storedBytes' | 'trafficBytes' | 'operations'
type StorageAlertLimitKey = 'maxBytes' | 'trafficBytes' | 'maxOperations' | 'alertBytes'

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

interface GovernanceTrendPoint {
  date: string
  events: number
  quantity: number
  uniqueActors: number
}

interface GovernanceHeatmapPoint {
  dayOfWeek: number
  hour: string
  events: number
  quantity: number
  uniqueActors: number
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

interface NotificationDeliveryAnalytics {
  deliveries: {
    total: number
    planned: number
    sent: number
    skipped: number
    failed: number
    plannedRate: number
    sentRate: number
    failureRate: number
  }
  byDeliveryStatus: GovernanceMetric[]
  byProvider: GovernanceMetric[]
  byAdapter: GovernanceMetric[]
  byReason: GovernanceMetric[]
  byNotificationAction: GovernanceMetric[]
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
    latestFailureReason: string | null
    latestFailureAt: string | null
  }>
  browserPushSubscriptions: {
    total: number
    registered: number
    deleted: number
    byAction: GovernanceMetric[]
    byEndpointHost: GovernanceMetric[]
    trend: GovernanceTrendPoint[]
  }
}

interface GovernanceAnalytics {
  days: number
  generatedAt: string
  visits: GovernanceScopedAnalytics & { growth: GovernanceGrowth }
  users: GovernanceScopedAnalytics & {
    growth: GovernanceGrowth
    signups: number
    signupGrowth: GovernanceGrowth
    signupTrend: GovernanceTrendPoint[]
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
    byCountry: GovernanceMetric[]
    byRegion: GovernanceMetric[]
    byTimezone: GovernanceMetric[]
    filterUsage: {
      withFilters: number
      withoutFilters: number
      filterRate: number
    }
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
    leaderboard: Array<{
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
    }>
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
    uploadSize: GovernanceNumberStat
    uploadDurationMs: GovernanceNumberStat
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
    trend: StorageUsageTrendPoint[]
  }
  providers: GovernanceScopedAnalytics & {
    growth: GovernanceGrowth
    byModel: GovernanceMetric[]
    byProviderType: GovernanceMetric[]
    quotaSummary: {
      total: number
      active: number
      blocked: number
      warning: number
      disabled: number
      highestRequestUtilization: number
      highestTokenUtilization: number
    }
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
    }>
    leaderboard: Array<{
      providerId: string
      requests: number
      tokens: number
      quantity: number
      uniqueActors: number
      byUnit: Array<{ unit: string, quantity: number }>
      byChannel: Array<{ channel: string, quantity: number }>
      byModel: Array<{ model: string, tokens: number }>
    }>
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
  updatedAt: string
}

interface ConfigListResponse {
  configs: GovernanceConfig[]
  generatedAt: string
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

type NotificationDeliveryStatus = 'planned' | 'sent' | 'skipped' | 'failed'

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
  name: 'Plugin review email',
  channel: 'email',
  provider: 'resend-primary',
  warningThreshold: '85',
  limitsJson: '{\n  "maxMessagesPerDay": 5000,\n  "maxFailuresPerHour": 50\n}',
  configJson: '{\n  "providerType": "resend",\n  "credentialRef": "secure://notifications/resend-primary",\n  "from": "Tuff <noreply@example.com>",\n  "events": ["plugin.version.approved", "plugin.version.rejected"]\n}',
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
    trend: [],
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
      visits: { ...emptyScopedAnalytics(), growth: { previousEvents: 0, currentEvents: 0, eventGrowthRate: 0 } },
      users: {
        ...emptyScopedAnalytics(),
        growth: { previousEvents: 0, currentEvents: 0, eventGrowthRate: 0 },
        signups: 0,
        signupGrowth: { previousEvents: 0, currentEvents: 0, eventGrowthRate: 0 },
        signupTrend: [],
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
        byCountry: [],
        byRegion: [],
        byTimezone: [],
        filterUsage: {
          withFilters: 0,
          withoutFilters: 0,
          filterRate: 0,
        },
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
        uploadSize: emptyNumberStat(),
        uploadDurationMs: emptyNumberStat(),
        problemAttempts: [],
      },
      notifications: {
        ...emptyScopedAnalytics(),
        deliveries: {
          total: 0,
          planned: 0,
          sent: 0,
          skipped: 0,
          failed: 0,
          plannedRate: 0,
          sentRate: 0,
          failureRate: 0,
        },
        byDeliveryStatus: [],
        byProvider: [],
        byAdapter: [],
        byReason: [],
        byNotificationAction: [],
        providerHealth: [],
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
        byModel: [],
        byProviderType: [],
        quotaSummary: {
          total: 0,
          active: 0,
          blocked: 0,
          warning: 0,
          disabled: 0,
          highestRequestUtilization: 0,
          highestTokenUtilization: 0,
        },
        quotas: [],
        leaderboard: [],
      },
    }),
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
const storageCredentials = computed(() => storageCredentialsData.value?.credentials ?? [])
const notificationCredentials = computed(() => notificationCredentialsData.value?.credentials ?? [])
const providerQuotaPeakUtilization = computed(() => Math.max(
  analyticsData.value.providers.quotaSummary.highestRequestUtilization,
  analyticsData.value.providers.quotaSummary.highestTokenUtilization,
))
const groupedConfigs = computed(() => ({
  analytics: configs.value.filter(item => item.configType === 'analytics_collection'),
  storage: configs.value.filter(item => item.configType === 'storage_channel'),
  notifications: configs.value.filter(item => item.configType === 'notification_channel'),
  providerQuotas: configs.value.filter(item => item.configType === 'intelligence_provider_quota'),
}))
const notificationConfigs = computed(() => groupedConfigs.value.notifications)

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
    saveMessage.value = t('dashboard.governance.saved', 'Saved.')
    await Promise.all([refreshConfigs(), refreshSummary(), refreshAnalytics(), refreshStoragePolicies(), refreshStorageCredentials(), refreshNotificationCredentials()])
  }
  catch (error) {
    saveError.value = error instanceof Error ? error.message : t('dashboard.governance.saveFailed', 'Save failed.')
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
    saveMessage.value = t('dashboard.governance.storageCredentials.saved', 'Storage credential saved.')
    await refreshStorageCredentials()
  }
  catch (error) {
    saveError.value = error instanceof Error ? error.message : t('dashboard.governance.storageCredentials.saveFailed', 'Storage credential save failed.')
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
    saveMessage.value = t('dashboard.governance.credentials.saved', 'Credential saved.')
    await refreshNotificationCredentials()
  }
  catch (error) {
    saveError.value = error instanceof Error ? error.message : t('dashboard.governance.credentials.saveFailed', 'Credential save failed.')
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
      ? t('dashboard.governance.notificationTest.sent', 'Notification channel test sent.')
      : t('dashboard.governance.notificationTest.planned', 'Notification channel dry-run recorded.')
    await Promise.all([refreshSummary(), refreshAnalytics()])
  }
  catch (error) {
    notificationTestError.value = error instanceof Error ? error.message : t('dashboard.governance.notificationTest.failed', 'Notification channel test failed.')
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
      ? t('dashboard.governance.storageAlerts.sent', 'Storage alert notifications sent.')
      : t('dashboard.governance.storageAlerts.planned', 'Storage alert notification dry-run recorded.')
    await Promise.all([refreshSummary(), refreshAnalytics(), refreshStoragePolicies()])
  }
  catch (error) {
    storageAlertNotifyError.value = error instanceof Error ? error.message : t('dashboard.governance.storageAlerts.failed', 'Storage alert notification failed.')
    saveMessage.value = ''
  }
  finally {
    storageAlertNotifying.value = false
  }
}

async function refreshAll(): Promise<void> {
  await Promise.all([refreshSummary(), refreshConfigs(), refreshAnalytics(), refreshStoragePolicies(), refreshStorageCredentials(), refreshNotificationCredentials()])
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

function formatDate(value: string): string {
  if (!value) {
    return '-'
  }
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value
}

function configTypeLabel(type: GovernanceConfigType): string {
  if (type === 'analytics_collection')
    return t('dashboard.governance.types.analytics', 'Analytics')
  if (type === 'storage_channel')
    return t('dashboard.governance.types.storage', 'Storage')
  if (type === 'notification_channel')
    return t('dashboard.governance.types.notification', 'Notification')
  return t('dashboard.governance.types.providerQuota', 'Provider quota')
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
    return t('dashboard.governance.storagePolicy.ok', 'OK')
  if (status === 'warning')
    return t('dashboard.governance.storagePolicy.warning', 'Warning')
  if (status === 'blocked')
    return t('dashboard.governance.storagePolicy.blocked', 'Blocked')
  return t('dashboard.governance.storagePolicy.disabled', 'Disabled')
}

function providerQuotaTone(status: ProviderQuotaStatus): StatusTone {
  return storageEvaluationTone(status)
}

function providerQuotaLabel(status: ProviderQuotaStatus): string {
  if (status === 'ok')
    return t('dashboard.governance.providerQuota.ok', 'OK')
  if (status === 'warning')
    return t('dashboard.governance.providerQuota.warning', 'Warning')
  if (status === 'blocked')
    return t('dashboard.governance.providerQuota.blocked', 'Blocked')
  return t('dashboard.governance.providerQuota.disabled', 'Disabled')
}

function storageAlertMetricLabel(metric: StorageAlertMetric): string {
  if (metric === 'storedBytes')
    return t('dashboard.governance.storageAlerts.storedBytes', 'Stored bytes')
  if (metric === 'trafficBytes')
    return t('dashboard.governance.storageAlerts.trafficBytes', 'Traffic bytes')
  return t('dashboard.governance.storageAlerts.operations', 'Operations')
}

function formatStorageAlertValue(alert: StoragePolicyAlert, value: number | null): string {
  if (value == null)
    return '-'
  return alert.metric === 'operations' ? formatNumber(value) : formatBytes(value)
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

function formatRatio(value: number | null): string {
  return value == null ? '-' : formatPercent(value)
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="apple-heading-md">
          {{ t('dashboard.governance.title', 'Data Governance') }}
        </h1>
        <p class="mt-2 max-w-3xl text-sm text-black/50 dark:text-white/50">
          {{ t('dashboard.governance.subtitle', 'Manage anonymized analytics, upload health, storage limits, notification channels, and provider quotas from one control surface.') }}
        </p>
      </div>
      <TxButton variant="secondary" size="small" :disabled="summaryPending || configsPending || analyticsPending || storagePoliciesPending || storageCredentialsPending || notificationCredentialsPending" @click="refreshAll">
        <TxSpinner v-if="summaryPending || configsPending || analyticsPending || storagePoliciesPending || storageCredentialsPending || notificationCredentialsPending" :size="14" />
        <span :class="summaryPending || configsPending || analyticsPending || storagePoliciesPending || storageCredentialsPending || notificationCredentialsPending ? 'ml-2' : ''">{{ t('common.refresh', 'Refresh') }}</span>
      </TxButton>
    </header>

    <div v-if="!isAdmin" class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
      {{ t('dashboard.governance.adminOnly', 'Only administrators can manage data governance.') }}
    </div>

    <div v-if="summaryError || configsError || analyticsError || storagePoliciesError || storageCredentialsError || notificationCredentialsError || saveError || notificationTestError" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-200">
      {{ saveError || notificationTestError || storageAlertNotifyError || (summaryError as any)?.message || (configsError as any)?.message || (analyticsError as any)?.message || (storagePoliciesError as any)?.message || (storageCredentialsError as any)?.message || (notificationCredentialsError as any)?.message }}
    </div>

    <div v-if="saveMessage" class="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
      {{ saveMessage }}
    </div>

    <section class="grid gap-4 md:grid-cols-4">
      <div class="apple-card-lg p-5">
        <p class="apple-section-title">
          {{ t('dashboard.governance.summary.events', 'Events') }}
        </p>
        <p class="mt-2 text-3xl font-semibold text-black dark:text-white">
          {{ formatNumber(summaryData.totalEvents) }}
        </p>
      </div>
      <div class="apple-card-lg p-5">
        <p class="apple-section-title">
          {{ t('dashboard.governance.summary.quantity', 'Quantity') }}
        </p>
        <p class="mt-2 text-3xl font-semibold text-black dark:text-white">
          {{ formatNumber(summaryData.totalQuantity) }}
        </p>
      </div>
      <div class="apple-card-lg p-5">
        <p class="apple-section-title">
          {{ t('dashboard.governance.summary.actors', 'Unique actors') }}
        </p>
        <p class="mt-2 text-3xl font-semibold text-black dark:text-white">
          {{ formatNumber(summaryData.uniqueActors) }}
        </p>
      </div>
      <div class="apple-card-lg p-5">
        <p class="apple-section-title">
          {{ t('dashboard.governance.summary.policies', 'Policies') }}
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
            {{ t('dashboard.governance.analytics.title', 'Analytics cockpit') }}
          </h2>
          <p class="mt-1 text-xs text-black/50 dark:text-white/50">
            {{ t('dashboard.governance.analytics.subtitle', 'Aggregated from hashed governance events; query text and raw actor identifiers stay out of the report.') }}
          </p>
        </div>
        <span class="text-xs text-black/45 dark:text-white/45">
          {{ formatDate(analyticsData.generatedAt) }}
        </span>
      </div>

      <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <p class="apple-section-title">
            {{ t('dashboard.governance.analytics.searches', 'Searches') }}
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
            {{ t('dashboard.governance.analytics.userSignups', 'User signups') }}
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
            {{ t('dashboard.governance.analytics.pluginInvokes', 'Plugin invokes') }}
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
            {{ t('dashboard.governance.analytics.uploadHealth', 'Upload health') }}
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
            {{ t('dashboard.governance.analytics.notificationHealth', 'Notification health') }}
          </p>
          <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
            {{ formatPercent(analyticsData.notifications.deliveries.plannedRate) }}
          </p>
          <p class="mt-1 text-xs text-black/45 dark:text-white/45">
            {{ formatNumber(analyticsData.notifications.deliveries.sent) }} sent · {{ formatNumber(analyticsData.notifications.deliveries.failed) }} failed · {{ formatNumber(analyticsData.notifications.deliveries.skipped) }} skipped
          </p>
        </div>
        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <p class="apple-section-title">
            {{ t('dashboard.governance.analytics.providerTokens', 'Provider tokens') }}
          </p>
          <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
            {{ formatNumber(analyticsData.providers.leaderboard.reduce((sum, item) => sum + item.tokens, 0)) }}
          </p>
          <p class="mt-1 text-xs text-black/45 dark:text-white/45">
            {{ formatDelta(analyticsData.providers.growth.eventGrowthRate) }}
          </p>
        </div>
      </div>

      <div class="mt-5 grid gap-4 lg:grid-cols-2">
        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ t('dashboard.governance.analytics.searchBreakdown', 'Search context') }}
          </h3>
          <div class="mt-3 grid gap-2 text-sm">
            <div class="grid gap-2 rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ t('dashboard.governance.analytics.searchFilterRate', 'Filter rate') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatPercent(analyticsData.searches.filterUsage.filterRate) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ t('dashboard.governance.analytics.searchFirstResult', 'Avg first result') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.searches.latency.firstResultMs.average) }} ms</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ t('dashboard.governance.analytics.searchTotalDuration', 'Avg total duration') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.searches.latency.totalDurationMs.average) }} ms</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-black/60 dark:text-white/60">{{ t('dashboard.governance.analytics.searchResults', 'Avg results') }}</span>
                <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.searches.resultStats.resultCount.average) }}</span>
              </div>
            </div>
            <div v-for="item in analyticsData.searches.byHour.slice(0, 6)" :key="`hour:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ item.key }}:00 UTC</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byLocalHour.slice(0, 6)" :key="`local-hour:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ t('dashboard.governance.analytics.searchLocalHour', 'Local') }} {{ item.key }}:00</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byContextAppCategory.slice(0, 4)" :key="`context-app:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ t('dashboard.governance.analytics.searchContextApp', 'Context app') }} · {{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byTriggerType.slice(0, 4)" :key="`trigger:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ t('dashboard.governance.analytics.searchTrigger', 'Trigger') }} · {{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byUserPreferenceMode.slice(0, 4)" :key="`preference:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ t('dashboard.governance.analytics.searchPreference', 'Preference') }} · {{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byPluginId.slice(0, 4)" :key="`search-plugin:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ t('dashboard.governance.analytics.searchPlugins', 'Plugin') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byPluginCategory.slice(0, 4)" :key="`search-plugin-category:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ t('dashboard.governance.analytics.searchPluginCategories', 'Plugin category') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
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
            {{ t('dashboard.governance.analytics.pluginLeaderboard', 'Plugin leaderboard') }}
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
            {{ t('dashboard.governance.analytics.uploadBreakdown', 'Upload breakdown') }}
          </h3>
          <div class="mt-3 grid gap-2 text-sm">
            <div class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ t('dashboard.governance.analytics.uploadStarted', 'Started') }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.uploads.started) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ t('dashboard.governance.analytics.uploadCompleted', 'Completed') }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.uploads.completed) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ t('dashboard.governance.analytics.uploadFailed', 'Failed') }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.uploads.failed) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ t('dashboard.governance.analytics.uploadAvgSize', 'Avg size') }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatBytes(analyticsData.uploads.uploadSize.average) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ t('dashboard.governance.analytics.uploadStuckAttempts', 'Stuck attempts') }} · {{ formatDurationMs(analyticsData.uploads.stuckAttemptAgeMs) }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.uploads.stuckAttempts) }} · {{ formatPercent(analyticsData.uploads.stuckRate) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ t('dashboard.governance.analytics.uploadAvgDuration', 'Avg duration') }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatDurationMs(analyticsData.uploads.uploadDurationMs.average) }}</span>
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
              <span class="truncate text-black/45 dark:text-white/45">{{ t('dashboard.governance.analytics.uploadStorageProvider', 'Provider') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.quantity) }}</span>
            </div>
            <div v-for="item in analyticsData.uploads.bySurface.slice(0, 4)" :key="`upload-surface:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ t('dashboard.governance.analytics.uploadSurface', 'Surface') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.uploads.byStatusCode.slice(0, 4)" :key="`upload-status:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-red-500/80 dark:text-red-200/80">{{ t('dashboard.governance.analytics.uploadStatusCode', 'Status') }} · {{ item.key }}</span>
              <span class="font-medium text-red-600 dark:text-red-100">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.uploads.byFailureReason.slice(0, 4)" :key="`upload-failure:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-red-500/80 dark:text-red-200/80">{{ item.key }}</span>
              <span class="font-medium text-red-600 dark:text-red-100">{{ formatNumber(item.events) }}</span>
            </div>
            <div class="mt-4 rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03]">
              <h4 class="text-xs font-semibold text-black/70 dark:text-white/70">
                {{ t('dashboard.governance.analytics.uploadProblemAttempts', 'Problem attempts') }}
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
                </div>
                <p v-if="(analyticsData.uploads.problemAttempts ?? []).length === 0" class="text-xs text-black/45 dark:text-white/45">
                  {{ t('dashboard.governance.analytics.uploadProblemAttemptsEmpty', 'No failed or stuck upload attempts yet.') }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ t('dashboard.governance.analytics.storageUsage', 'Storage usage') }}
          </h3>
          <div class="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.governance.analytics.storageStored', 'Stored') }}
              </p>
              <p class="mt-1 text-lg font-semibold text-black dark:text-white">
                {{ formatBytes(analyticsData.storage.storedBytes) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.governance.analytics.storageTraffic', 'Traffic') }}
              </p>
              <p class="mt-1 text-lg font-semibold text-black dark:text-white">
                {{ formatBytes(analyticsData.storage.trafficBytes) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.governance.analytics.storageOperations', 'Ops') }}
              </p>
              <p class="mt-1 text-lg font-semibold text-black dark:text-white">
                {{ formatNumber(analyticsData.storage.operations) }}
              </p>
            </div>
          </div>
          <p class="mt-3 text-xs text-black/45 dark:text-white/45">
            {{ formatNumber(analyticsData.storage.writes) }} writes · {{ formatNumber(analyticsData.storage.reads) }} reads · {{ formatNumber(analyticsData.storage.deletes) }} deletes
          </p>
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
              <span class="truncate text-black/45 dark:text-white/45">{{ t('dashboard.governance.analytics.storageProvider', 'Provider') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatBytes(item.storedBytes + item.trafficBytes) }}</span>
            </div>
            <div v-for="item in analyticsData.storage.byResourceTypeUsage.slice(0, 4)" :key="`storage-resource:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ t('dashboard.governance.analytics.storageResourceType', 'Resource') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.operations) }}</span>
            </div>
            <div v-for="item in analyticsData.storage.byActionUsage.slice(0, 3)" :key="`storage-action:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ t('dashboard.governance.analytics.storageAction', 'Action') }} · {{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.operations) }}</span>
            </div>
            <div v-for="item in analyticsData.storage.trend.slice(-3)" :key="`storage-trend:${item.date}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ item.date }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatBytes(item.storedBytes + item.trafficBytes) }} · {{ formatNumber(item.operations) }} ops</span>
            </div>
            <p v-if="analyticsData.storage.totalEvents === 0" class="text-sm text-black/45 dark:text-white/45">
              {{ t('dashboard.governance.analytics.storageEmpty', 'No storage usage yet.') }}
            </p>
          </div>
        </div>

        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ t('dashboard.governance.analytics.notificationDelivery', 'Notification delivery') }}
          </h3>
          <div class="mt-3 grid gap-2 text-sm">
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
            <p v-if="analyticsData.notifications.deliveries.total === 0" class="text-sm text-black/45 dark:text-white/45">
              {{ t('dashboard.governance.analytics.notificationEmpty', 'No notification delivery audit yet.') }}
            </p>
          </div>
        </div>

        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ t('dashboard.governance.analytics.notificationReasons', 'Notification reasons') }}
          </h3>
          <div class="mt-3 grid gap-2 text-sm">
            <div v-for="item in analyticsData.notifications.byReason.slice(0, 6)" :key="`notification-reason:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.notifications.byNotificationAction.slice(0, 4)" :key="`notification-action:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/45 dark:text-white/45">{{ item.key }}</span>
              <span class="font-medium text-black/70 dark:text-white/70">{{ formatNumber(item.events) }}</span>
            </div>
            <p v-if="analyticsData.notifications.byReason.length === 0" class="text-sm text-black/45 dark:text-white/45">
              {{ t('dashboard.governance.analytics.notificationReasonEmpty', 'No delivery reason data yet.') }}
            </p>
          </div>
        </div>

        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ t('dashboard.governance.analytics.notificationProviderHealth', 'Notification provider health') }}
          </h3>
          <div class="mt-3 grid gap-2">
            <div v-for="item in analyticsData.notifications.providerHealth.slice(0, 6)" :key="`notification-health:${item.provider}`" class="rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
              <div class="flex items-center justify-between gap-3">
                <span class="truncate font-medium text-black dark:text-white">{{ item.provider }}</span>
                <TxStatusBadge
                  :text="item.failed ? t('dashboard.governance.analytics.notificationProviderFailed', 'Failed') : item.sent ? t('dashboard.governance.analytics.notificationProviderSent', 'Sent') : t('dashboard.governance.analytics.notificationProviderPlanned', 'Planned')"
                  size="sm"
                  :status="item.failed ? 'danger' : item.sent ? 'success' : 'info'"
                />
              </div>
              <p class="mt-1 text-black/45 dark:text-white/45">
                {{ item.channel || 'unknown' }} · {{ item.providerType || item.adapter || 'generic' }}
              </p>
              <div class="mt-2 grid grid-cols-2 gap-2 text-black/60 dark:text-white/60">
                <span>{{ t('dashboard.governance.analytics.notificationProviderSentRate', 'Sent rate') }}: {{ formatPercent(item.sentRate) }}</span>
                <span>{{ t('dashboard.governance.analytics.notificationProviderFailureRate', 'Failure rate') }}: {{ formatPercent(item.failureRate) }}</span>
                <span>{{ formatNumber(item.sent) }} sent / {{ formatNumber(item.failed) }} failed</span>
                <span>{{ formatNumber(item.skipped) }} skipped / {{ formatNumber(item.planned) }} planned</span>
              </div>
              <p v-if="item.latestFailureReason" class="mt-2 truncate text-red-600 dark:text-red-100">
                {{ item.latestFailureReason }} · {{ item.latestFailureAt ? formatDate(item.latestFailureAt) : '-' }}
              </p>
            </div>
            <p v-if="analyticsData.notifications.providerHealth.length === 0" class="text-sm text-black/45 dark:text-white/45">
              {{ t('dashboard.governance.analytics.notificationProviderHealthEmpty', 'No provider delivery health yet.') }}
            </p>
          </div>
        </div>

        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ t('dashboard.governance.analytics.browserPushSubscriptions', 'Browser push subscriptions') }}
          </h3>
          <div class="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.governance.analytics.pushTotal', 'Total') }}
              </p>
              <p class="mt-1 text-lg font-semibold text-black dark:text-white">
                {{ formatNumber(analyticsData.notifications.browserPushSubscriptions.total) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.governance.analytics.pushRegistered', 'Registered') }}
              </p>
              <p class="mt-1 text-lg font-semibold text-black dark:text-white">
                {{ formatNumber(analyticsData.notifications.browserPushSubscriptions.registered) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.governance.analytics.pushDeleted', 'Removed') }}
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
              {{ t('dashboard.governance.analytics.browserPushEmpty', 'No browser push subscription activity yet.') }}
            </p>
          </div>
        </div>

        <div class="rounded-xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ t('dashboard.governance.analytics.providerLeaderboard', 'Provider quota usage') }}
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
                {{ t('dashboard.governance.analytics.providerQuotaUtilization', 'Quota utilization') }}
              </h4>
              <div class="mt-3 grid gap-2 sm:grid-cols-4">
                <div class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
                  <p class="text-[11px] text-black/45 dark:text-white/45">
                    {{ t('dashboard.governance.analytics.providerQuotaActive', 'Active') }}
                  </p>
                  <p class="mt-1 text-sm font-semibold text-black dark:text-white">
                    {{ formatNumber(analyticsData.providers.quotaSummary.active) }}
                  </p>
                </div>
                <div class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
                  <p class="text-[11px] text-black/45 dark:text-white/45">
                    {{ t('dashboard.governance.analytics.providerQuotaBlocked', 'Blocked') }}
                  </p>
                  <p class="mt-1 text-sm font-semibold text-red-600 dark:text-red-100">
                    {{ formatNumber(analyticsData.providers.quotaSummary.blocked) }}
                  </p>
                </div>
                <div class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
                  <p class="text-[11px] text-black/45 dark:text-white/45">
                    {{ t('dashboard.governance.analytics.providerQuotaWarning', 'Warning') }}
                  </p>
                  <p class="mt-1 text-sm font-semibold text-amber-600 dark:text-amber-100">
                    {{ formatNumber(analyticsData.providers.quotaSummary.warning) }}
                  </p>
                </div>
                <div class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]">
                  <p class="text-[11px] text-black/45 dark:text-white/45">
                    {{ t('dashboard.governance.analytics.providerQuotaPeak', 'Peak') }}
                  </p>
                  <p class="mt-1 text-sm font-semibold text-black dark:text-white">
                    {{ formatRatio(providerQuotaPeakUtilization) }}
                  </p>
                </div>
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
                      <span>{{ t('dashboard.governance.analytics.providerQuotaRequests', 'Requests') }}</span>
                      <span class="font-medium text-black dark:text-white">{{ formatNumber(quota.usage.requests) }} / {{ quota.limits.maxRequests == null ? '-' : formatNumber(quota.limits.maxRequests) }} · {{ formatRatio(quota.utilization.requests) }}</span>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                      <span>{{ t('dashboard.governance.analytics.providerQuotaTokens', 'Tokens') }}</span>
                      <span class="font-medium text-black dark:text-white">{{ formatNumber(quota.usage.tokens) }} / {{ quota.limits.maxTokens == null ? '-' : formatNumber(quota.limits.maxTokens) }} · {{ formatRatio(quota.utilization.tokens) }}</span>
                    </div>
                  </div>
                </div>
                <p v-if="analyticsData.providers.quotas.length === 0" class="text-xs text-black/45 dark:text-white/45">
                  {{ t('dashboard.governance.analytics.providerQuotaEmpty', 'No provider quota policy yet.') }}
                </p>
              </div>
            </div>
            <div class="mt-4 grid gap-3 md:grid-cols-2">
              <div class="rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03]">
                <h4 class="text-xs font-semibold text-black/70 dark:text-white/70">
                  {{ t('dashboard.governance.analytics.providerModels', 'Model distribution') }}
                </h4>
                <div class="mt-2 grid gap-2">
                  <div v-for="item in analyticsData.providers.byModel.slice(0, 6)" :key="`provider-model:${item.key}`" class="flex items-center justify-between gap-3 text-xs">
                    <span class="truncate text-black/55 dark:text-white/55">{{ item.key }}</span>
                    <span class="font-medium text-black dark:text-white">{{ formatNumber(item.quantity) }}</span>
                  </div>
                  <p v-if="analyticsData.providers.byModel.length === 0" class="text-xs text-black/45 dark:text-white/45">
                    {{ t('dashboard.governance.analytics.providerModelsEmpty', 'No model usage yet.') }}
                  </p>
                </div>
              </div>
              <div class="rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03]">
                <h4 class="text-xs font-semibold text-black/70 dark:text-white/70">
                  {{ t('dashboard.governance.analytics.providerTypes', 'Provider types') }}
                </h4>
                <div class="mt-2 grid gap-2">
                  <div v-for="item in analyticsData.providers.byProviderType.slice(0, 6)" :key="`provider-type:${item.key}`" class="flex items-center justify-between gap-3 text-xs">
                    <span class="truncate text-black/55 dark:text-white/55">{{ item.key }}</span>
                    <span class="font-medium text-black dark:text-white">{{ formatNumber(item.quantity) }}</span>
                  </div>
                  <p v-if="analyticsData.providers.byProviderType.length === 0" class="text-xs text-black/45 dark:text-white/45">
                    {{ t('dashboard.governance.analytics.providerTypesEmpty', 'No provider type usage yet.') }}
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
                {{ t('dashboard.governance.forms.analyticsTitle', 'Analytics collection') }}
              </h2>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.governance.forms.analyticsHint', 'Keep event collection granular but hashed and metadata-bounded.') }}
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
                {{ t('dashboard.governance.notificationTest.title', 'Notification channel test') }}
              </h2>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.governance.notificationTest.hint', 'Dry-run records sanitized delivery audit; send follows the selected channel config and runtime metadata.') }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <TxButton variant="secondary" size="small" :disabled="notificationTesting || !notificationTestForm.configId" @click="testNotificationChannel('plan')">
                <TxSpinner v-if="notificationTesting" :size="14" />
                <span :class="notificationTesting ? 'ml-2' : ''">{{ t('dashboard.governance.notificationTest.dryRun', 'Dry run') }}</span>
              </TxButton>
              <TxButton size="small" :disabled="notificationTesting || !notificationTestForm.configId" @click="testNotificationChannel('send')">
                {{ t('dashboard.governance.notificationTest.send', 'Send using config') }}
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
                <p class="mt-1 text-xs text-black/40 dark:text-white/40">
                  {{ delivery.credentialRequired ? t('dashboard.governance.notificationTest.credentialRequired', 'Credential required') : t('dashboard.governance.notificationTest.credentialOptional', 'No credential required') }} · {{ delivery.hasCredentialRef ? t('dashboard.governance.notificationTest.credentialRefBound', 'credentialRef bound') : t('dashboard.governance.notificationTest.credentialRefMissing', 'credentialRef missing') }}
                </p>
              </div>
              <p v-if="notificationTestResult.deliveries.length === 0" class="text-sm text-black/45 dark:text-white/45">
                {{ t('dashboard.governance.notificationTest.empty', 'No delivery matched the selected channel.') }}
              </p>
            </div>
          </div>
        </section>

        <section class="apple-card-lg p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-black dark:text-white">
                {{ t('dashboard.governance.forms.storageTitle', 'Storage channel policy') }}
              </h2>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.governance.forms.storageHint', 'Configure local/R2/S3/OSS ceilings, traffic limits, and warning thresholds.') }}
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
                :text="selectedStorageProfile.status === 'active' ? t('dashboard.governance.storageProfiles.active', 'Active') : t('dashboard.governance.storageProfiles.policyReady', 'Policy ready')"
                :status="selectedStorageProfile.status === 'active' ? 'success' : 'info'"
              />
            </div>
            <p class="mt-2">
              {{ t('dashboard.governance.storageProfiles.configKeys', 'Config keys') }}:
              {{ [...selectedStorageProfile.requiredConfigKeys, ...selectedStorageProfile.optionalConfigKeys].join(', ') || '-' }}
            </p>
            <p class="mt-1">
              {{ t('dashboard.governance.storageProfiles.limitKeys', 'Limit keys') }}:
              {{ selectedStorageProfile.limitKeys.slice(0, 8).join(', ') }}
            </p>
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
                {{ t('dashboard.governance.storageCredentials.title', 'Storage credential') }}
              </h2>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.governance.storageCredentials.hint', 'Bind secure://storage/* refs to encrypted D1 access keys for S3-compatible and OSS executors.') }}
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
              <TxStatusBadge :text="credential.hasCredential ? t('dashboard.governance.storageCredentials.bound', 'Bound') : t('dashboard.governance.storageCredentials.missing', 'Missing')" size="sm" :status="credential.hasCredential ? 'success' : 'warning'" />
            </div>
            <p v-if="storageCredentials.length === 0" class="text-sm text-black/45 dark:text-white/45">
              {{ t('dashboard.governance.storageCredentials.empty', 'No storage credentials bound yet.') }}
            </p>
          </div>
        </section>

        <section class="apple-card-lg p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-black dark:text-white">
                {{ t('dashboard.governance.forms.notificationTitle', 'Notification channel') }}
              </h2>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.governance.forms.notificationHint', 'Use provider for the channel instance and config.providerType for browser, Feishu, Resend, SMTP, or webhook adapters. Credentialed adapters use credentialRef only.') }}
              </p>
            </div>
            <TxButton size="small" :disabled="saving" @click="saveConfig('notification_channel', notificationForm)">
              {{ t('common.save', 'Save') }}
            </TxButton>
          </div>
          <div class="mt-4 grid gap-3 md:grid-cols-4">
            <TuffInput v-model="notificationForm.name" class="w-full" />
            <TuffInput v-model="notificationForm.channel" class="w-full" />
            <TuffInput v-model="notificationForm.provider" class="w-full" />
            <TuffInput v-model="notificationForm.warningThreshold" class="w-full" />
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
                {{ t('dashboard.governance.credentials.title', 'Notification credential') }}
              </h2>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.governance.credentials.hint', 'Bind secure://notifications/* refs to encrypted D1 credentials. Governance configs only keep credentialRef.') }}
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
              <TxStatusBadge :text="credential.hasCredential ? t('dashboard.governance.credentials.bound', 'Bound') : t('dashboard.governance.credentials.missing', 'Missing')" size="sm" :status="credential.hasCredential ? 'success' : 'warning'" />
            </div>
            <p v-if="notificationCredentials.length === 0" class="text-sm text-black/45 dark:text-white/45">
              {{ t('dashboard.governance.credentials.empty', 'No notification credentials bound yet.') }}
            </p>
          </div>
        </section>

        <section class="apple-card-lg p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-black dark:text-white">
                {{ t('dashboard.governance.forms.providerQuotaTitle', 'Provider quota') }}
              </h2>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.governance.forms.providerQuotaHint', 'Limit Intelligence provider requests and token budgets by channel.') }}
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
            {{ t('dashboard.governance.breakdown.actions', 'Event actions') }}
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
            {{ t('dashboard.governance.breakdown.resources', 'Hot resources') }}
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
              {{ t('dashboard.governance.storageAlerts.title', 'Storage alerts') }}
            </h2>
            <div class="flex items-center gap-2">
              <TxButton size="small" :disabled="storageAlertNotifying || storagePolicyAlerts.length === 0" @click="notifyStorageAlerts('plan')">
                {{ t('dashboard.governance.storageAlerts.dryRun', 'Dry run') }}
              </TxButton>
              <TxButton size="small" :disabled="storageAlertNotifying || storagePolicyAlerts.length === 0" @click="notifyStorageAlerts('send')">
                {{ t('dashboard.governance.storageAlerts.send', 'Send') }}
              </TxButton>
              <TxStatusBadge
                size="sm"
                :text="formatNumber(storagePolicyAlerts.length)"
                :status="storagePolicyAlerts.some(item => item.status === 'blocked') ? 'danger' : storagePolicyAlerts.length ? 'warning' : 'success'"
              />
            </div>
          </div>
          <p v-if="storageAlertNotifyResult" class="mt-2 text-xs text-black/50 dark:text-white/50">
            {{ t('dashboard.governance.storageAlerts.dispatched', 'Dispatches') }}:
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
              {{ t('dashboard.governance.storageAlerts.empty', 'No storage alerts right now.') }}
            </p>
          </div>
        </section>

        <section class="apple-card-lg p-5">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-base font-semibold text-black dark:text-white">
              {{ t('dashboard.governance.storagePolicy.title', 'Storage policy health') }}
            </h2>
            <span class="text-xs text-black/45 dark:text-white/45">
              {{ formatDate(storagePoliciesData.generatedAt) }}
            </span>
          </div>
          <div class="mt-4 space-y-3">
            <div v-for="item in storageEvaluations.slice(0, 6)" :key="item.policyId" class="rounded-xl border border-black/[0.06] p-3 text-sm dark:border-white/[0.08]">
              <div class="flex items-center justify-between gap-3">
                <span class="truncate font-medium text-black dark:text-white">{{ item.name }}</span>
                <TxStatusBadge
                  :text="storageEvaluationLabel(item.status)"
                  size="sm"
                  :status="storageEvaluationTone(item.status)"
                />
              </div>
              <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                {{ item.channel }} · {{ item.provider || 'unknown' }} · {{ item.days }}d
              </p>
              <div class="mt-3 grid gap-2 text-xs text-black/55 dark:text-white/55">
                <div class="flex items-center justify-between gap-3">
                  <span>{{ t('dashboard.governance.storagePolicy.stored', 'Stored') }}</span>
                  <span class="font-medium text-black dark:text-white">{{ formatBytes(item.usage.storedBytes) }} · {{ formatRatio(item.utilization.storedBytes) }}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span>{{ t('dashboard.governance.storagePolicy.traffic', 'Traffic') }}</span>
                  <span class="font-medium text-black dark:text-white">{{ formatBytes(item.usage.trafficBytes) }} · {{ formatRatio(item.utilization.trafficBytes) }}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span>{{ t('dashboard.governance.storagePolicy.operations', 'Operations') }}</span>
                  <span class="font-medium text-black dark:text-white">{{ formatNumber(item.usage.operations) }} · {{ formatRatio(item.utilization.operations) }}</span>
                </div>
              </div>
              <p v-if="item.reasons.length" class="mt-2 truncate text-xs text-amber-600 dark:text-amber-200">
                {{ item.reasons.join(', ') }}
              </p>
            </div>
            <p v-if="storageEvaluations.length === 0" class="text-sm text-black/45 dark:text-white/45">
              {{ t('dashboard.governance.storagePolicy.empty', 'No storage policy evaluation yet.') }}
            </p>
          </div>
        </section>

        <section class="apple-card-lg p-5">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-base font-semibold text-black dark:text-white">
              {{ t('dashboard.governance.policies.title', 'Policies') }}
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
            <span>{{ t('dashboard.governance.policies.analytics', 'Analytics') }}: {{ groupedConfigs.analytics.length }}</span>
            <span>{{ t('dashboard.governance.policies.storage', 'Storage') }}: {{ groupedConfigs.storage.length }}</span>
            <span>{{ t('dashboard.governance.policies.notifications', 'Notifications') }}: {{ groupedConfigs.notifications.length }}</span>
            <span>{{ t('dashboard.governance.policies.providerQuotas', 'Provider quotas') }}: {{ groupedConfigs.providerQuotas.length }}</span>
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
