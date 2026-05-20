<script setup lang="ts">
import { TuffInput, TxButton, TxSpinner, TxStatusBadge } from '@talex-touch/tuffex'
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

interface GovernanceAnalytics {
  days: number
  generatedAt: string
  visits: GovernanceScopedAnalytics & { growth: GovernanceGrowth }
  searches: GovernanceScopedAnalytics & {
    growth: GovernanceGrowth
    byQueryType: GovernanceMetric[]
    byScene: GovernanceMetric[]
    byInputType: GovernanceMetric[]
    byProvider: GovernanceMetric[]
  }
  plugins: GovernanceScopedAnalytics & {
    growth: GovernanceGrowth
    leaderboard: Array<{
      pluginId: string
      downloads: number
      invocations: number
      events: number
      uniqueActors: number
      topCountries: Array<{ countryCode: string, events: number }>
      topChannels: Array<{ channel: string, events: number }>
    }>
  }
  uploads: GovernanceScopedAnalytics & {
    completed: number
    failed: number
    bytes: number
    failureRate: number
    byExtension: GovernanceMetric[]
  }
  notifications: GovernanceScopedAnalytics
  storage: GovernanceScopedAnalytics
  providers: GovernanceScopedAnalytics & {
    growth: GovernanceGrowth
    leaderboard: Array<{
      providerId: string
      requests: number
      tokens: number
      quantity: number
      uniqueActors: number
      byUnit: Array<{ unit: string, quantity: number }>
      byChannel: Array<{ channel: string, quantity: number }>
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

interface StoragePoliciesResponse {
  policies: GovernanceConfig[]
  evaluations: StoragePolicyEvaluation[]
  generatedAt: string
}

const summaryDays = ref(30)
const saveError = ref('')
const saveMessage = ref('')
const saving = ref(false)

const analyticsForm = reactive({
  name: 'Default analytics collection',
  channel: 'app',
  warningThreshold: '80',
  limitsJson: '{\n  "retentionDays": 90,\n  "maxEventsPerDay": 1000000\n}',
  configJson: '{\n  "granularity": "hourly",\n  "collect": ["search", "plugin", "upload", "intelligence"],\n  "pii": "hashed-only"\n}',
})

const storageForm = reactive({
  name: 'Default R2 storage policy',
  channel: 'r2',
  provider: 'cloudflare-r2',
  warningThreshold: '80',
  limitsJson: '{\n  "maxBytes": 107374182400,\n  "trafficBytes": 1099511627776,\n  "maxOperationsPerDay": 100000,\n  "alertBytes": 85899345920\n}',
  configJson: '{\n  "credentialRef": "secure://storage/r2-default",\n  "region": "auto"\n}',
})

const notificationForm = reactive({
  name: 'Plugin review email',
  channel: 'email',
  provider: 'resend',
  warningThreshold: '85',
  limitsJson: '{\n  "maxMessagesPerDay": 5000,\n  "maxFailuresPerHour": 50\n}',
  configJson: '{\n  "credentialRef": "secure://notifications/resend-primary",\n  "from": "Tuff <noreply@example.com>",\n  "events": ["plugin.version.approved", "plugin.version.rejected"]\n}',
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
      searches: {
        ...emptyScopedAnalytics(),
        growth: { previousEvents: 0, currentEvents: 0, eventGrowthRate: 0 },
        byQueryType: [],
        byScene: [],
        byInputType: [],
        byProvider: [],
      },
      plugins: {
        ...emptyScopedAnalytics(),
        growth: { previousEvents: 0, currentEvents: 0, eventGrowthRate: 0 },
        leaderboard: [],
      },
      uploads: {
        ...emptyScopedAnalytics(),
        completed: 0,
        failed: 0,
        bytes: 0,
        failureRate: 0,
        byExtension: [],
      },
      notifications: emptyScopedAnalytics(),
      storage: emptyScopedAnalytics(),
      providers: {
        ...emptyScopedAnalytics(),
        growth: { previousEvents: 0, currentEvents: 0, eventGrowthRate: 0 },
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
      generatedAt: '',
    }),
    server: false,
  },
)

const configs = computed(() => configsData.value?.configs ?? [])
const storageEvaluations = computed(() => storagePoliciesData.value?.evaluations ?? [])
const groupedConfigs = computed(() => ({
  analytics: configs.value.filter(item => item.configType === 'analytics_collection'),
  storage: configs.value.filter(item => item.configType === 'storage_channel'),
  notifications: configs.value.filter(item => item.configType === 'notification_channel'),
  providerQuotas: configs.value.filter(item => item.configType === 'intelligence_provider_quota'),
}))

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
    await Promise.all([refreshConfigs(), refreshSummary(), refreshAnalytics(), refreshStoragePolicies()])
  }
  catch (error) {
    saveError.value = error instanceof Error ? error.message : t('dashboard.governance.saveFailed', 'Save failed.')
  }
  finally {
    saving.value = false
  }
}

async function refreshAll(): Promise<void> {
  await Promise.all([refreshSummary(), refreshConfigs(), refreshAnalytics(), refreshStoragePolicies()])
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
      <TxButton variant="secondary" size="small" :disabled="summaryPending || configsPending || analyticsPending || storagePoliciesPending" @click="refreshAll">
        <TxSpinner v-if="summaryPending || configsPending || analyticsPending || storagePoliciesPending" :size="14" />
        <span :class="summaryPending || configsPending || analyticsPending || storagePoliciesPending ? 'ml-2' : ''">{{ t('common.refresh', 'Refresh') }}</span>
      </TxButton>
    </header>

    <div v-if="!isAdmin" class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
      {{ t('dashboard.governance.adminOnly', 'Only administrators can manage data governance.') }}
    </div>

    <div v-if="summaryError || configsError || analyticsError || storagePoliciesError || saveError" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-200">
      {{ saveError || (summaryError as any)?.message || (configsError as any)?.message || (analyticsError as any)?.message || (storagePoliciesError as any)?.message }}
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

      <div class="mt-5 grid gap-3 md:grid-cols-4">
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
            <div v-for="item in analyticsData.searches.byHour.slice(0, 6)" :key="`hour:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ item.key }}:00 UTC</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
            <div v-for="item in analyticsData.searches.byProvider.slice(0, 6)" :key="`provider:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
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
                <span class="text-xs text-black/50 dark:text-white/50">{{ formatNumber(item.uniqueActors) }} actors</span>
              </div>
              <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                {{ formatNumber(item.downloads) }} downloads · {{ formatNumber(item.invocations) }} invokes · {{ item.topCountries[0]?.countryCode || 'unknown' }}
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
              <span class="text-black/60 dark:text-white/60">{{ t('dashboard.governance.analytics.uploadCompleted', 'Completed') }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.uploads.completed) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-black/60 dark:text-white/60">{{ t('dashboard.governance.analytics.uploadFailed', 'Failed') }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(analyticsData.uploads.failed) }}</span>
            </div>
            <div v-for="item in analyticsData.uploads.byExtension.slice(0, 5)" :key="`ext:${item.key}`" class="flex items-center justify-between gap-3">
              <span class="truncate text-black/60 dark:text-white/60">{{ item.key }}</span>
              <span class="font-medium text-black dark:text-white">{{ formatNumber(item.events) }}</span>
            </div>
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
                {{ formatNumber(item.tokens) }} tokens · {{ item.byChannel[0]?.channel || 'unknown' }}
              </p>
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
          <div class="mt-4 grid gap-3 md:grid-cols-4">
            <TuffInput v-model="storageForm.name" class="w-full" />
            <TuffInput v-model="storageForm.channel" class="w-full" />
            <TuffInput v-model="storageForm.provider" class="w-full" />
            <TuffInput v-model="storageForm.warningThreshold" class="w-full" />
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
                {{ t('dashboard.governance.forms.notificationTitle', 'Notification channel') }}
              </h2>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.governance.forms.notificationHint', 'Browser, Feishu, Resend, SMTP, and webhook channels use credentialRef only.') }}
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
