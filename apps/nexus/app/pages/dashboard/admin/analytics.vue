<script setup lang="ts">
import GeoLeafletMap from '~/components/dashboard/GeoLeafletMap.client.vue'
import type { DocAnalyticsResponse } from '~/types/docs-engagement'

definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t, locale } = useI18n()
const { user } = useAuthUser()
const route = useRoute()

// Admin check - redirect if not admin
const isAdmin = computed(() => {
  return user.value?.role === 'admin'
})

watch(isAdmin, (admin) => {
  if (user.value && !admin) {
    navigateTo('/dashboard/overview')
  }
}, { immediate: true })

interface AnalyticsData {
  summary: {
    totalEvents: number
    totalUsers: number
    totalSearches: number
    avgSearchDuration: number
    avgQueryLength: number
    avgSortingDuration: number
    avgResultCount: number
    avgExecuteLatency: number
    performance: {
      longTaskCount: number
      longTaskTotalMs: number
      longTaskMaxMs: number
      longTaskAvgMs: number
      rafJankCount: number
      rafJankTotalMs: number
      rafJankMaxMs: number
      rafJankAvgMs: number
      eventLoopDelayP95AvgMs: number
      eventLoopDelayMaxMs: number
      unresponsiveCount: number
      unresponsiveTotalMs: number
      unresponsiveMaxMs: number
      unresponsiveAvgMs: number
    }
    dailyStats: Array<{
      date: string
      visits: number
      searches: number
      avgDuration: number
    }>
    deviceDistribution: Record<string, number>
    regionDistribution: Record<string, number>
    hourlyDistribution: Record<string, number>
    searchSceneDistribution: Record<string, number>
    searchInputTypeDistribution: Record<string, number>
    searchProviderDistribution: Record<string, number>
    searchProviderResultDistribution: Record<string, number>
    searchResultCategoryDistribution: Record<string, number>
    featureUseSourceTypeDistribution: Record<string, number>
    featureUseItemKindDistribution: Record<string, number>
    featureUsePluginDistribution: Record<string, number>
    featureUseCategoryDistribution: Record<string, number>
    moduleLoadMetrics: Array<{
      module: string
      avgDuration: number
      maxDuration: number
      minDuration: number
      ratio: number
    }>
  }
  realtime: {
    searchesLast24h: number
    visitsLast24h: number
    activeUsers: number
    avgLatency: number
  }
}

interface GeoAnalyticsData {
  summary: {
    totalSearches: number
    uniqueIps: number
    countryCount: number
    subdivisionCount: number
  }
  countries: Array<{
    countryCode: string
    count: number
    latitude: number | null
    longitude: number | null
  }>
  subdivisions: Array<{
    countryCode: string
    regionCode: string | null
    regionName: string | null
    count: number
    latitude: number | null
    longitude: number | null
  }>
  topIps: Array<{
    ip: string
    count: number
    lastSeenAt: string
    countryCode: string | null
    regionCode: string | null
    city: string | null
  }>
  generatedAt: string
}

interface ExchangeRateHistoryItem {
  baseCurrency: string
  targetCurrency: string
  rate: number
  fetchedAt: number
  providerUpdatedAt?: number | null
}

interface ExchangeRateSnapshotSummary {
  id: string
  baseCurrency: string
  fetchedAt: number
  providerUpdatedAt?: number | null
  providerNextUpdateAt?: number | null
  payload?: Record<string, unknown>
}

interface GeoMapPoint {
  id: string
  label: string
  latitude: number | null
  longitude: number | null
  value: number
}

interface TelemetryMessage {
  id: string
  source: string
  severity: 'info' | 'warn' | 'error'
  title: string
  message: string
  status: string
  createdAt: string
}

interface IntelligenceAnalyticsData {
  summary: {
    days: number
    totalRuns: number
    successRuns: number
    failureRuns: number
    successRate: number
    fallbackRate: number
    approvalHitRate: number
    recoveryRate: number
    streamCoverageRate: number
    retryRunRate: number
    disconnectPauseRate: number
    checkpointLossRate: number
    totalActions: number
    completedActions: number
    failedActions: number
    waitingApprovals: number
    avgDurationMs: number
    p95DurationMs: number
  }
  statusDistribution: Record<string, number>
  toolFailureDistribution: Array<{ toolId: string, count: number }>
  recentRuns: Array<{
    sessionId: string
    status: string
    providerName: string | null
    model: string
    fallbackCount: number
    approvalHitCount: number
    durationMs: number
    createdAt: string
  }>
}

const analytics = ref<AnalyticsData | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const selectedDays = ref(30)
const geoAnalytics = ref<GeoAnalyticsData | null>(null)
const geoLoading = ref(false)
const geoError = ref<string | null>(null)
const selectedGeoCountry = ref<string | null>(null)
const messages = ref<TelemetryMessage[]>([])
const messagesLoading = ref(false)
const messagesError = ref<string | null>(null)
const docsAnalytics = ref<DocAnalyticsResponse | null>(null)
const docsLoading = ref(false)
const docsError = ref<string | null>(null)
const intelligenceAnalytics = ref<IntelligenceAnalyticsData | null>(null)
const intelligenceLoading = ref(false)
const intelligenceError = ref<string | null>(null)
const exchangeHistory = ref<ExchangeRateHistoryItem[]>([])
const exchangeSnapshots = ref<ExchangeRateSnapshotSummary[]>([])
const exchangeLoading = ref(false)
const exchangeError = ref<string | null>(null)
const exchangeTarget = ref('CNY')
const exchangeLimit = ref(20)
const exchangeView = ref<'history' | 'snapshots'>('history')
const exchangeIncludePayload = ref(false)
const docsPath = ref('')
const docsSource = ref<'all' | 'docs_page' | 'doc_comments_admin'>('all')
const activeSection = ref<'overview' | 'performance' | 'search' | 'usage' | 'intelligence' | 'docs' | 'geo' | 'messages' | 'exchange'>('overview')
const showBreakdown = ref(false)
const activeBreakdownTab = ref<'search' | 'usage'>('search')
const topModuleLoads = computed(() => analytics.value?.summary.moduleLoadMetrics.slice(0, 10) ?? [])
const regionTotal = computed(() =>
  Object.values(analytics.value?.summary.regionDistribution ?? {}).reduce((sum, count) => sum + count, 0),
)
const regionDisplayNames = computed(() => {
  try {
    return new Intl.DisplayNames([locale.value], { type: 'region' })
  }
  catch {
    return null
  }
})
const topRegions = computed(() => {
  const distribution = analytics.value?.summary.regionDistribution ?? {}
  return Object.entries(distribution)
    .map(([code, count]) => ({
      code,
      count,
      label: regionDisplayNames.value?.of(code.toUpperCase()) ?? code,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
})
const hourlySeries = computed(() => {
  const distribution = analytics.value?.summary.hourlyDistribution ?? {}
  const series = hourLabels.map((label) => {
    const key = label.slice(0, 2)
    return {
      key,
      label,
      count: Number(distribution[key] || 0),
    }
  })
  const max = Math.max(0, ...series.map(item => item.count))
  return { series, max }
})
const hasHourlyData = computed(() => hourlySeries.value.series.some(item => item.count > 0))
const geoMapPoints = computed<GeoMapPoint[]>(() => {
  if (!geoAnalytics.value) {
    return []
  }
  if (selectedGeoCountry.value) {
    return geoAnalytics.value.subdivisions.map(item => ({
      id: `${item.countryCode}:${item.regionCode || item.regionName || 'unknown'}`,
      label: [item.countryCode, item.regionName || item.regionCode || 'Unknown'].join(' · '),
      latitude: item.latitude,
      longitude: item.longitude,
      value: item.count,
    }))
  }

  return geoAnalytics.value.countries.map(item => ({
    id: item.countryCode,
    label: item.countryCode,
    latitude: item.latitude,
    longitude: item.longitude,
    value: item.count,
  }))
})
const geoCountries = computed(() => geoAnalytics.value?.countries ?? [])
const geoSubdivisions = computed(() => geoAnalytics.value?.subdivisions ?? [])
const geoTopIps = computed(() => geoAnalytics.value?.topIps.slice(0, 12) ?? [])
const docsSummaryRows = computed(() => docsAnalytics.value?.docs ?? [])
const docsDetail = computed(() => docsAnalytics.value?.detail ?? null)
const docsHeatmapBySection = computed(() => {
  const bucket = new Map<string, Array<{ bucket: number, activeMs: number, sourceType: string }>>()
  for (const item of docsDetail.value?.heatmap ?? []) {
    const key = item.sectionId || 'root'
    const list = bucket.get(key) ?? []
    list.push({
      bucket: item.bucket,
      activeMs: item.activeMs,
      sourceType: item.sourceType,
    })
    bucket.set(key, list)
  }
  for (const [key, list] of bucket.entries())
    bucket.set(key, list.sort((a, b) => a.bucket - b.bucket))
  return bucket
})
const maxHeatValue = computed(() => {
  const values = docsDetail.value?.heatmap.map(item => item.activeMs) ?? []
  return values.length ? Math.max(...values, 1) : 1
})

function resolveCountryLabel(countryCode: string | null): string {
  if (!countryCode || countryCode === 'Unknown') {
    return 'Unknown'
  }
  return regionDisplayNames.value?.of(countryCode) ?? countryCode
}

function resolveSubdivisionLabel(item: GeoAnalyticsData['subdivisions'][number]): string {
  return item.regionName || item.regionCode || 'Unknown'
}

async function fetchAnalytics() {
  loading.value = true
  error.value = null
  try {
    const data = await $fetch<AnalyticsData>(`/api/admin/analytics?days=${selectedDays.value}`)
    analytics.value = data
  }
  catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to load analytics'
  }
  finally {
    loading.value = false
  }
}

async function fetchGeoAnalytics() {
  geoLoading.value = true
  geoError.value = null
  try {
    const data = await $fetch<GeoAnalyticsData>('/api/admin/analytics/geo', {
      query: {
        days: selectedDays.value,
        country: selectedGeoCountry.value || undefined,
        limit: 240,
      },
    })
    geoAnalytics.value = data
  }
  catch (e: any) {
    geoError.value = e.data?.message || e.message || 'Failed to load geo analytics'
  }
  finally {
    geoLoading.value = false
  }
}

async function fetchDocsAnalytics() {
  docsLoading.value = true
  docsError.value = null
  try {
    const data = await $fetch<DocAnalyticsResponse>('/api/admin/analytics/docs', {
      query: {
        days: selectedDays.value,
        path: docsPath.value.trim() || undefined,
        source: docsSource.value !== 'all' ? docsSource.value : undefined,
      },
    })
    docsAnalytics.value = data
  }
  catch (e: any) {
    docsError.value = e.data?.message || e.message || 'Failed to load docs analytics'
    docsAnalytics.value = null
  }
  finally {
    docsLoading.value = false
  }
}

async function fetchIntelligenceAnalytics() {
  intelligenceLoading.value = true
  intelligenceError.value = null
  try {
    const data = await $fetch<IntelligenceAnalyticsData>('/api/admin/analytics/intelligence', {
      query: {
        days: selectedDays.value,
      },
    })
    intelligenceAnalytics.value = data
  }
  catch (e: any) {
    intelligenceError.value = e.data?.message || e.message || 'Failed to load intelligence analytics'
    intelligenceAnalytics.value = null
  }
  finally {
    intelligenceLoading.value = false
  }
}

async function fetchMessages() {
  messagesLoading.value = true
  messagesError.value = null
  try {
    const data = await $fetch<{ messages: TelemetryMessage[] }>('/api/telemetry/messages?limit=12')
    messages.value = data.messages ?? []
  }
  catch (e: any) {
    messagesError.value = e.data?.message || e.message || 'Failed to load messages'
    messages.value = []
  }
  finally {
    messagesLoading.value = false
  }
}

async function fetchExchangeHistory() {
  exchangeLoading.value = true
  exchangeError.value = null
  try {
    if (exchangeView.value === 'history') {
      const normalizedTarget = exchangeTarget.value.trim().toUpperCase()
      if (!/^[A-Z]{3}$/.test(normalizedTarget)) {
        throw new Error('Invalid target currency code.')
      }
      const data = await $fetch<{ items?: ExchangeRateHistoryItem[] }>('/api/exchange/history', {
        query: {
          target: normalizedTarget,
          limit: exchangeLimit.value,
        },
      })
      exchangeHistory.value = data.items ?? []
      exchangeSnapshots.value = []
    }
    else {
      const data = await $fetch<{ items?: ExchangeRateSnapshotSummary[] }>('/api/exchange/history', {
        query: {
          limit: exchangeLimit.value,
          includePayload: exchangeIncludePayload.value ? 'true' : undefined,
        },
      })
      exchangeSnapshots.value = data.items ?? []
      exchangeHistory.value = []
    }
  }
  catch (e: any) {
    exchangeError.value = e.data?.message || e.message || 'Failed to load exchange history'
    exchangeHistory.value = []
    exchangeSnapshots.value = []
  }
  finally {
    exchangeLoading.value = false
  }
}

onMounted(() => {
  const initialSection = typeof route.query.section === 'string' ? route.query.section : ''
  if (initialSection === 'docs')
    activeSection.value = 'docs'

  const initialPath = typeof route.query.path === 'string' ? route.query.path.trim() : ''
  if (initialPath)
    docsPath.value = initialPath.toLowerCase()

  const initialSource = typeof route.query.source === 'string' ? route.query.source : ''
  if (initialSource === 'docs_page' || initialSource === 'doc_comments_admin')
    docsSource.value = initialSource

  fetchAnalytics()
  fetchGeoAnalytics()
  fetchDocsAnalytics()
  fetchIntelligenceAnalytics()
  fetchMessages()
})

watch(selectedDays, () => {
  fetchAnalytics()
  fetchGeoAnalytics()
  fetchDocsAnalytics()
  fetchIntelligenceAnalytics()
})

watch(selectedGeoCountry, () => {
  fetchGeoAnalytics()
})

let docsQueryTimer: ReturnType<typeof setTimeout> | null = null
watch([docsPath, docsSource], () => {
  if (docsQueryTimer)
    clearTimeout(docsQueryTimer)
  docsQueryTimer = setTimeout(() => {
    fetchDocsAnalytics()
  }, 240)
})

watch(activeSection, (section) => {
  if (section === 'docs' && !docsAnalytics.value && !docsLoading.value)
    fetchDocsAnalytics()
  if (section === 'intelligence' && !intelligenceAnalytics.value && !intelligenceLoading.value)
    fetchIntelligenceAnalytics()
  if (section === 'exchange' && !exchangeLoading.value)
    fetchExchangeHistory()
})

watch([exchangeView, exchangeTarget, exchangeLimit, exchangeIncludePayload], () => {
  if (activeSection.value === 'exchange') {
    fetchExchangeHistory()
  }
})

onBeforeUnmount(() => {
  if (docsQueryTimer)
    clearTimeout(docsQueryTimer)
})

function formatNumber(num: number): string {
  if (num >= 1000000)
    return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000)
    return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

function toSortedList(source?: Record<string, number>, limit = 6) {
  return Object.entries(source || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
}

function formatCategoryLabel(value: string) {
  return value
    .split('_')
    .filter(Boolean)
    .map(part => part[0] ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ')
}

function formatCategoryKey(key: string) {
  const [level1, level2] = key.split(':')
  return {
    level1: formatCategoryLabel(level1 || 'others'),
    level2: formatCategoryLabel(level2 || 'others'),
  }
}

function formatMessageTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function formatExchangeTime(value: number | null | undefined) {
  if (!value)
    return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

function formatRate(value: number) {
  if (!Number.isFinite(value))
    return '-'
  return value >= 1 ? value.toFixed(4) : value.toFixed(6)
}

function formatPayloadPreview(payload?: Record<string, unknown>) {
  if (!payload)
    return ''
  const raw = JSON.stringify(payload)
  return raw.length > 180 ? `${raw.slice(0, 180)}...` : raw
}

function drilldownCountry(countryCode: string) {
  if (!countryCode || countryCode === 'Unknown') {
    return
  }
  selectedGeoCountry.value = countryCode
}

function resetGeoDrilldown() {
  selectedGeoCountry.value = null
}

function handleMapPointClick(point: { id: string }) {
  if (!selectedGeoCountry.value) {
    drilldownCountry(point.id)
  }
}

function formatDuration(ms: number) {
  if (!ms)
    return '0s'
  const totalSeconds = Math.floor(ms / 1000)
  if (totalSeconds < 60)
    return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

function openDocAnalyticsPath(path: string) {
  docsPath.value = path
  activeSection.value = 'docs'
}

const deviceColors: Record<string, string> = {
  darwin: 'bg-blue-500',
  win32: 'bg-green-500',
  linux: 'bg-orange-500',
}

const hourLabels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`)
</script>

<template>
  <div class="space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="apple-heading-md">
          {{ t('dashboard.sections.analytics.title', 'Analytics Dashboard') }}
        </h1>
        <p class="mt-2 text-sm text-black/50 dark:text-white/50">
          {{ t('dashboard.sections.analytics.subtitle', 'Usage statistics and insights') }}
        </p>
      </div>
      <ClientOnly>
        <TuffSelect v-model="selectedDays" class="w-44">
          <TuffSelectItem :value="7" :label="t('dashboard.sections.analytics.last7Days', 'Last 7 days')" />
          <TuffSelectItem :value="30" :label="t('dashboard.sections.analytics.last30Days', 'Last 30 days')" />
          <TuffSelectItem :value="90" :label="t('dashboard.sections.analytics.last90Days', 'Last 90 days')" />
        </TuffSelect>
        <template #fallback>
          <div class="w-44 rounded-xl bg-black/[0.04] px-3 py-2 text-xs text-black/60 dark:bg-white/[0.08] dark:text-white/60">
            {{ t('dashboard.sections.analytics.last30Days', 'Last 30 days') }}
          </div>
        </template>
      </ClientOnly>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <TxSpinner :size="22" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="rounded-xl bg-red-500/10 p-4 text-center text-red-500">
      {{ error }}
    </div>

    <!-- Analytics Content -->
    <template v-else-if="analytics">
      <!-- Real-time Stats Cards -->
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div class="rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-4">
          <div class="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <span class="i-carbon-user-multiple text-lg" />
            <span class="text-xs font-medium">Active Users (24h)</span>
          </div>
          <p class="mt-2 text-2xl font-bold text-black dark:text-white">
            {{ formatNumber(analytics.realtime.activeUsers) }}
          </p>
        </div>

        <div class="rounded-2xl bg-gradient-to-br from-green-500/10 to-green-600/5 p-4">
          <div class="flex items-center gap-2 text-green-600 dark:text-green-400">
            <span class="i-carbon-view text-lg" />
            <span class="text-xs font-medium">Visits (24h)</span>
          </div>
          <p class="mt-2 text-2xl font-bold text-black dark:text-white">
            {{ formatNumber(analytics.realtime.visitsLast24h) }}
          </p>
        </div>

        <div class="rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 p-4">
          <div class="flex items-center gap-2 text-purple-600 dark:text-purple-400">
            <span class="i-carbon-search text-lg" />
            <span class="text-xs font-medium">Searches (24h)</span>
          </div>
          <p class="mt-2 text-2xl font-bold text-black dark:text-white">
            {{ formatNumber(analytics.realtime.searchesLast24h) }}
          </p>
        </div>

        <div class="rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-4">
          <div class="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <span class="i-carbon-time text-lg" />
            <span class="text-xs font-medium">Avg Latency</span>
          </div>
          <p class="mt-2 text-2xl font-bold text-black dark:text-white">
            {{ analytics.realtime.avgLatency }}ms
          </p>
        </div>
      </div>

      <!-- Sections -->
      <div class="flex flex-wrap items-center gap-2 rounded-2xl bg-black/[0.02] p-2 text-sm dark:bg-white/[0.04]">
        <TxButton variant="bare" native-type="button" class="text-xs transition" :class="activeSection === 'overview' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/[0.04] text-black/60 hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.1]'" @click="activeSection = 'overview'">
          Overview
        </TxButton>
        <TxButton variant="bare" native-type="button" class="text-xs transition" :class="activeSection === 'performance' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/[0.04] text-black/60 hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.1]'" @click="activeSection = 'performance'">
          Performance
        </TxButton>
        <TxButton variant="bare" native-type="button" class="text-xs transition" :class="activeSection === 'search' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/[0.04] text-black/60 hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.1]'" @click="activeSection = 'search'">
          Search
        </TxButton>
        <TxButton variant="bare" native-type="button" class="text-xs transition" :class="activeSection === 'usage' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/[0.04] text-black/60 hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.1]'" @click="activeSection = 'usage'">
          Usage
        </TxButton>
        <TxButton variant="bare" native-type="button" class="text-xs transition" :class="activeSection === 'intelligence' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/[0.04] text-black/60 hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.1]'" @click="activeSection = 'intelligence'">
          Intelligence
        </TxButton>
        <TxButton variant="bare" native-type="button" class="text-xs transition" :class="activeSection === 'docs' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/[0.04] text-black/60 hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.1]'" @click="activeSection = 'docs'">
          Docs
        </TxButton>
        <TxButton variant="bare" native-type="button" class="text-xs transition" :class="activeSection === 'geo' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/[0.04] text-black/60 hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.1]'" @click="activeSection = 'geo'">
          Geo
        </TxButton>
        <TxButton variant="bare" native-type="button" class="text-xs transition" :class="activeSection === 'exchange' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/[0.04] text-black/60 hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.1]'" @click="activeSection = 'exchange'">
          Exchange
        </TxButton>
        <TxButton variant="bare" native-type="button" class="text-xs transition" :class="activeSection === 'messages' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/[0.04] text-black/60 hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.1]'" @click="activeSection = 'messages'">
          Alerts
        </TxButton>
      </div>

      <!-- Summary Stats -->
      <div v-if="activeSection === 'overview'" class="grid gap-4 lg:grid-cols-4">
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <h3 class="text-sm font-medium text-black/60 dark:text-white/60">
            Uploaded Events
          </h3>
          <p class="mt-1 text-3xl font-bold text-black dark:text-white">
            {{ formatNumber(analytics.summary.totalEvents) }}
          </p>
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <h3 class="text-sm font-medium text-black/60 dark:text-white/60">
            Total Users
          </h3>
          <p class="mt-1 text-3xl font-bold text-black dark:text-white">
            {{ formatNumber(analytics.summary.totalUsers) }}
          </p>
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <h3 class="text-sm font-medium text-black/60 dark:text-white/60">
            Total Searches
          </h3>
          <p class="mt-1 text-3xl font-bold text-black dark:text-white">
            {{ formatNumber(analytics.summary.totalSearches) }}
          </p>
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <h3 class="text-sm font-medium text-black/60 dark:text-white/60">
            Avg Search Duration
          </h3>
          <p class="mt-1 text-3xl font-bold text-black dark:text-white">
            {{ analytics.summary.avgSearchDuration }}ms
          </p>
        </div>
      </div>

      <!-- Search Quality -->
      <div v-if="activeSection === 'search'" class="grid gap-4 lg:grid-cols-4">
        <div class="rounded-2xl bg-gradient-to-br from-slate-200/70 to-white/40 p-4 dark:from-slate-900/70 dark:to-dark/30">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
            Avg Query Length
          </h3>
          <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
            {{ analytics.summary.avgQueryLength }}
          </p>
        </div>
        <div class="rounded-2xl bg-gradient-to-br from-slate-200/70 to-white/40 p-4 dark:from-slate-900/70 dark:to-dark/30">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
            Avg Sorting
          </h3>
          <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
            {{ analytics.summary.avgSortingDuration }}ms
          </p>
        </div>
        <div class="rounded-2xl bg-gradient-to-br from-slate-200/70 to-white/40 p-4 dark:from-slate-900/70 dark:to-dark/30">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
            Avg Results
          </h3>
          <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
            {{ analytics.summary.avgResultCount }}
          </p>
        </div>
        <div class="rounded-2xl bg-gradient-to-br from-slate-200/70 to-white/40 p-4 dark:from-slate-900/70 dark:to-dark/30">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
            Avg Execute Latency
          </h3>
          <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
            {{ analytics.summary.avgExecuteLatency }}ms
          </p>
        </div>
      </div>

      <!-- Daily Trend Chart (simplified bar representation) -->
      <div v-if="activeSection === 'overview'" class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
        <h3 class="mb-4 font-semibold text-black dark:text-white">
          Daily Activity
        </h3>
        <div class="space-y-2">
          <div
            v-for="day in analytics.summary.dailyStats.slice(0, 14)"
            :key="day.date"
            class="flex items-center gap-3"
          >
            <span class="w-20 text-xs text-black/50 dark:text-white/50">{{ day.date.slice(5) }}</span>
            <div class="flex-1">
              <div class="flex gap-1">
                <div
                  class="h-4 rounded bg-blue-500/60"
                  :style="{ width: `${Math.min(100, (day.visits / Math.max(...analytics.summary.dailyStats.map(d => d.visits), 1)) * 50)}%` }"
                  :title="`${day.visits} visits`"
                />
                <div
                  class="h-4 rounded bg-purple-500/60"
                  :style="{ width: `${Math.min(100, (day.searches / Math.max(...analytics.summary.dailyStats.map(d => d.searches), 1)) * 50)}%` }"
                  :title="`${day.searches} searches`"
                />
              </div>
            </div>
            <span class="w-16 text-right text-xs text-black/40 dark:text-white/40">
              {{ day.avgDuration }}ms
            </span>
          </div>
        </div>
        <div class="mt-3 flex gap-4 text-xs text-black/50 dark:text-white/50">
          <span class="flex items-center gap-1">
            <span class="h-2 w-2 rounded bg-blue-500/60" /> Visits
          </span>
          <span class="flex items-center gap-1">
            <span class="h-2 w-2 rounded bg-purple-500/60" /> Searches
          </span>
        </div>
      </div>

      <!-- UI & Main Performance -->
      <div v-if="activeSection === 'performance'" class="grid gap-4 lg:grid-cols-4">
        <div class="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-4">
          <div class="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <span class="i-carbon-time text-lg" />
            <span class="text-xs font-medium">Long Tasks</span>
          </div>
          <p class="mt-2 text-2xl font-bold text-black dark:text-white">
            {{ analytics.summary.performance.longTaskAvgMs }}ms
          </p>
          <p class="mt-1 text-xs text-black/50 dark:text-white/50">
            max {{ analytics.summary.performance.longTaskMaxMs }}ms · {{ formatNumber(analytics.summary.performance.longTaskCount) }} tasks
          </p>
        </div>

        <div class="rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-4">
          <div class="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <span class="i-carbon-chart-line-smooth text-lg" />
            <span class="text-xs font-medium">Frame Jank</span>
          </div>
          <p class="mt-2 text-2xl font-bold text-black dark:text-white">
            {{ analytics.summary.performance.rafJankAvgMs }}ms
          </p>
          <p class="mt-1 text-xs text-black/50 dark:text-white/50">
            max {{ analytics.summary.performance.rafJankMaxMs }}ms · {{ formatNumber(analytics.summary.performance.rafJankCount) }} frames
          </p>
        </div>

        <div class="rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 p-4">
          <div class="flex items-center gap-2 text-purple-600 dark:text-purple-400">
            <span class="i-carbon-activity text-lg" />
            <span class="text-xs font-medium">Main Loop Delay (p95)</span>
          </div>
          <p class="mt-2 text-2xl font-bold text-black dark:text-white">
            {{ analytics.summary.performance.eventLoopDelayP95AvgMs }}ms
          </p>
          <p class="mt-1 text-xs text-black/50 dark:text-white/50">
            max {{ analytics.summary.performance.eventLoopDelayMaxMs }}ms
          </p>
        </div>

        <div class="rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-4">
          <div class="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <span class="i-carbon-warning-alt text-lg" />
            <span class="text-xs font-medium">Unresponsive</span>
          </div>
          <p class="mt-2 text-2xl font-bold text-black dark:text-white">
            {{ analytics.summary.performance.unresponsiveAvgMs }}ms
          </p>
          <p class="mt-1 text-xs text-black/50 dark:text-white/50">
            max {{ analytics.summary.performance.unresponsiveMaxMs }}ms · {{ formatNumber(analytics.summary.performance.unresponsiveCount) }} times
          </p>
        </div>
      </div>

      <!-- Module Load Performance -->
      <div v-if="activeSection === 'performance'" class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="font-semibold text-black dark:text-white">
            Module Load Performance
          </h3>
          <span class="text-xs text-black/40 dark:text-white/40">avg / max / min / ratio</span>
        </div>
        <div v-if="topModuleLoads.length === 0" class="text-sm text-black/40 dark:text-white/40">
          No module load metrics yet
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="item in topModuleLoads"
            :key="item.module"
            class="flex items-center justify-between gap-4 rounded-xl bg-black/[0.04] px-4 py-3 text-sm dark:bg-white/[0.04]"
          >
            <div class="min-w-0">
              <p class="truncate font-medium text-black dark:text-white">
                {{ item.module }}
              </p>
              <p class="text-xs text-black/40 dark:text-white/40">
                ratio {{ item.ratio.toFixed(2) }}x
              </p>
            </div>
            <div class="flex items-center gap-4 text-xs text-black/60 dark:text-white/60">
              <span>avg {{ item.avgDuration }}ms</span>
              <span>max {{ item.maxDuration }}ms</span>
              <span>min {{ item.minDuration }}ms</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Device & Region Distribution -->
      <div v-if="activeSection === 'overview'" class="grid gap-4 lg:grid-cols-2">
        <!-- Device Distribution -->
        <div class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
          <h3 class="mb-4 font-semibold text-black dark:text-white">
            Device Distribution
          </h3>
          <div class="space-y-3">
            <div
              v-for="(count, device) in analytics.summary.deviceDistribution"
              :key="device"
              class="flex items-center gap-3"
            >
              <span class="w-16 text-xs font-medium text-black/60 dark:text-white/60">
                {{ device === 'darwin' ? 'macOS' : device === 'win32' ? 'Windows' : device }}
              </span>
              <div class="flex-1">
                <div class="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/[0.08]">
                  <div
                    class="h-full rounded-full" :class="[deviceColors[device] || 'bg-black/40']"
                    :style="{ width: `${(count / Object.values(analytics.summary.deviceDistribution).reduce((a, b) => a + b, 0)) * 100}%` }"
                  />
                </div>
              </div>
              <span class="w-12 text-right text-xs text-black/40 dark:text-white/40">
                {{ count }}
              </span>
            </div>
          </div>
        </div>

        <!-- Region Distribution -->
        <div class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
          <h3 class="mb-4 font-semibold text-black dark:text-white">
            Region Distribution
          </h3>
          <div v-if="Object.keys(analytics.summary.regionDistribution).length === 0" class="py-4 text-center text-sm text-black/40 dark:text-white/40">
            No region data yet
          </div>
          <div v-else class="space-y-4">
            <WorldBubbleMap :distribution="analytics.summary.regionDistribution" />
            <div
              v-for="region in topRegions"
              :key="region.code"
              class="flex items-center gap-3"
            >
              <span class="w-20 truncate text-xs font-medium text-black/60 dark:text-white/60">
                {{ region.label }}
              </span>
              <div class="flex-1">
                <div class="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/[0.08]">
                  <div
                    class="h-full rounded-full bg-emerald-500"
                    :style="{ width: `${regionTotal ? (region.count / regionTotal) * 100 : 0}%` }"
                  />
                </div>
              </div>
              <span class="w-12 text-right text-xs text-black/40 dark:text-white/40">
                {{ regionTotal ? ((region.count / regionTotal) * 100).toFixed(1) : '0.0' }}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Hourly Distribution -->
      <div v-if="activeSection === 'overview'" class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
        <h3 class="mb-4 font-semibold text-black dark:text-white">
          Hourly Distribution (UTC)
        </h3>
        <div v-if="!hasHourlyData" class="py-4 text-center text-sm text-black/40 dark:text-white/40">
          No hourly data yet
        </div>
        <div v-else>
          <div class="flex items-end gap-1" style="height: 100px">
            <div
              v-for="hour in hourlySeries.series"
              :key="hour.key"
              class="flex-1"
            >
              <div
                class="w-full rounded-t bg-blue-500/60 transition-all"
                :style="{
                  height: `${Math.max(4, hourlySeries.max ? (hour.count / hourlySeries.max) * 100 : 0)}%`,
                }"
                :title="`${hour.label} - ${hour.count}`"
              />
            </div>
          </div>
          <div class="mt-2 flex justify-between text-[10px] text-black/40 dark:text-white/40">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </div>
      </div>

      <!-- Search Term Collection Disabled -->
      <div v-if="activeSection === 'search'" class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
        <h3 class="mb-2 font-semibold text-black dark:text-white">
          Search Terms
        </h3>
        <p class="text-sm text-black/50 dark:text-white/50">
          Disabled by privacy policy. Only length, type, and timing metrics are recorded.
        </p>
      </div>

      <!-- Secondary Insights -->
      <div v-if="activeSection === 'search' || activeSection === 'usage'" class="grid gap-4 lg:grid-cols-3">
        <div v-if="activeSection === 'search'" class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="font-semibold text-black dark:text-white">
              Search Scenes
            </h3>
            <TxButton variant="bare" size="small" native-type="button" class="text-xs text-black/50 transition hover:text-black dark:text-white/50 dark:hover:text-light" @click="showBreakdown = true; activeBreakdownTab = 'search'">
              View details
            </TxButton>
          </div>
          <div class="space-y-2 text-sm text-black/70 dark:text-white/70">
            <div v-for="item in toSortedList(analytics.summary.searchSceneDistribution, 5)" :key="item[0]" class="flex items-center justify-between">
              <span class="capitalize">{{ item[0].replace('-', ' ') }}</span>
              <span class="text-xs text-black/40 dark:text-white/40">{{ item[1] }}</span>
            </div>
          </div>
        </div>
        <div v-if="activeSection === 'search'" class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="font-semibold text-black dark:text-white">
              Result Categories
            </h3>
            <TxButton variant="bare" size="small" native-type="button" class="text-xs text-black/50 transition hover:text-black dark:text-white/50 dark:hover:text-light" @click="showBreakdown = true; activeBreakdownTab = 'search'">
              View details
            </TxButton>
          </div>
          <div class="space-y-2 text-sm text-black/70 dark:text-white/70">
            <div v-for="item in toSortedList(analytics.summary.searchResultCategoryDistribution, 5)" :key="item[0]" class="flex items-center justify-between">
              <span class="capitalize">{{ item[0] }}</span>
              <span class="text-xs text-black/40 dark:text-white/40">{{ item[1] }}</span>
            </div>
          </div>
        </div>
        <div v-if="activeSection === 'usage'" class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="font-semibold text-black dark:text-white">
              Top Categories
            </h3>
            <TxButton variant="bare" size="small" native-type="button" class="text-xs text-black/50 transition hover:text-black dark:text-white/50 dark:hover:text-light" @click="showBreakdown = true; activeBreakdownTab = 'usage'">
              View details
            </TxButton>
          </div>
          <div class="space-y-2 text-sm text-black/70 dark:text-white/70">
            <div v-for="item in toSortedList(analytics.summary.featureUseCategoryDistribution, 5)" :key="item[0]" class="flex items-center justify-between">
              <span class="truncate">
                {{ formatCategoryKey(item[0]).level1 }} · {{ formatCategoryKey(item[0]).level2 }}
              </span>
              <span class="text-xs text-black/40 dark:text-white/40">{{ item[1] }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="activeSection === 'intelligence'" class="space-y-4">
        <div v-if="intelligenceLoading" class="flex items-center justify-center rounded-2xl bg-black/[0.02] py-10 dark:bg-white/[0.03]">
          <TxSpinner :size="18" />
        </div>
        <div v-else-if="intelligenceError" class="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {{ intelligenceError }}
        </div>
        <template v-else-if="intelligenceAnalytics">
          <div class="grid gap-4 lg:grid-cols-4">
            <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
                Runs
              </h3>
              <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                {{ formatNumber(intelligenceAnalytics.summary.totalRuns) }}
              </p>
              <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                success {{ intelligenceAnalytics.summary.successRate }}%
              </p>
              <p class="text-xs text-black/45 dark:text-white/45">
                disconnect pause {{ intelligenceAnalytics.summary.disconnectPauseRate }}%
              </p>
            </div>
            <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
                Fallback
              </h3>
              <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                {{ intelligenceAnalytics.summary.fallbackRate }}%
              </p>
              <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                recovery {{ intelligenceAnalytics.summary.recoveryRate }}%
              </p>
              <p class="text-xs text-black/45 dark:text-white/45">
                retry run {{ intelligenceAnalytics.summary.retryRunRate }}%
              </p>
            </div>
            <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
                Approval Hit
              </h3>
              <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                {{ intelligenceAnalytics.summary.approvalHitRate }}%
              </p>
              <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                waiting {{ intelligenceAnalytics.summary.waitingApprovals }}
              </p>
              <p class="text-xs text-black/45 dark:text-white/45">
                checkpoint loss {{ intelligenceAnalytics.summary.checkpointLossRate }}%
              </p>
            </div>
            <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
                Stream Coverage
              </h3>
              <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                {{ intelligenceAnalytics.summary.streamCoverageRate }}%
              </p>
              <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                p95 {{ intelligenceAnalytics.summary.p95DurationMs }}ms
              </p>
              <p class="text-xs text-black/45 dark:text-white/45">
                avg {{ intelligenceAnalytics.summary.avgDurationMs }}ms
              </p>
            </div>
          </div>

          <div class="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="font-semibold text-black dark:text-white">
                  Runtime Status Distribution
                </h3>
                <span class="text-xs text-black/45 dark:text-white/45">
                  avg {{ intelligenceAnalytics.summary.avgDurationMs }}ms
                </span>
              </div>
              <div class="space-y-2 text-sm text-black/70 dark:text-white/70">
                <div v-for="item in Object.entries(intelligenceAnalytics.statusDistribution)" :key="item[0]" class="flex items-center justify-between rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
                  <span class="capitalize">{{ item[0].replace('_', ' ') }}</span>
                  <span class="text-xs text-black/45 dark:text-white/45">{{ item[1] }}</span>
                </div>
              </div>
            </div>

            <div class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="font-semibold text-black dark:text-white">
                  Tool Failures
                </h3>
                <TxButton variant="bare" size="small" native-type="button" class="text-xs text-black/45 dark:text-white/45" @click="fetchIntelligenceAnalytics">
                  Refresh
                </TxButton>
              </div>
              <div v-if="intelligenceAnalytics.toolFailureDistribution.length === 0" class="text-sm text-black/45 dark:text-white/45">
                No tool failures in selected period.
              </div>
              <div v-else class="space-y-2 text-sm text-black/70 dark:text-white/70">
                <div v-for="tool in intelligenceAnalytics.toolFailureDistribution.slice(0, 8)" :key="tool.toolId" class="flex items-center justify-between rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
                  <span class="truncate">{{ tool.toolId }}</span>
                  <span class="text-xs text-black/45 dark:text-white/45">{{ tool.count }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
            <h3 class="mb-3 font-semibold text-black dark:text-white">
              Recent Intelligence Runs
            </h3>
            <div v-if="intelligenceAnalytics.recentRuns.length === 0" class="text-sm text-black/45 dark:text-white/45">
              No runtime records.
            </div>
            <div v-else class="space-y-2 text-sm text-black/70 dark:text-white/70">
              <div v-for="run in intelligenceAnalytics.recentRuns" :key="run.sessionId + run.createdAt" class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
                <div class="min-w-0">
                  <p class="truncate font-medium text-black dark:text-white">
                    {{ run.sessionId }}
                  </p>
                  <p class="text-xs text-black/45 dark:text-white/45">
                    {{ run.providerName || 'runtime' }} · {{ run.model }}
                  </p>
                </div>
                <div class="flex items-center gap-3 text-xs text-black/45 dark:text-white/45">
                  <span class="capitalize">{{ run.status }}</span>
                  <span>{{ run.durationMs }}ms</span>
                  <span>fallback {{ run.fallbackCount }}</span>
                  <span>approval {{ run.approvalHitCount }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div v-if="activeSection === 'docs'" class="space-y-4">
        <div class="grid gap-4 lg:grid-cols-4">
          <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              Docs
            </h3>
            <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
              {{ formatNumber(docsAnalytics?.overview.docCount || 0) }}
            </p>
          </div>
          <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              Views
            </h3>
            <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
              {{ formatNumber(docsAnalytics?.overview.totalViews || 0) }}
            </p>
          </div>
          <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              Active Read Time
            </h3>
            <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
              {{ formatDuration(docsAnalytics?.overview.totalActiveMs || 0) }}
            </p>
          </div>
          <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              Copy / Select
            </h3>
            <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
              {{ formatNumber((docsAnalytics?.overview.totalCopyCount || 0) + (docsAnalytics?.overview.totalSelectCount || 0)) }}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3 rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <input
            v-model="docsPath"
            type="text"
            placeholder="Filter path (e.g. docs/dev/components/button)"
            class="h-8 w-72 rounded-lg border border-black/10 bg-transparent px-3 text-xs text-black outline-none transition focus:border-primary/50 dark:border-white/10 dark:text-white"
          >
          <select
            v-model="docsSource"
            class="h-8 rounded-lg border border-black/10 bg-transparent px-3 text-xs text-black outline-none transition focus:border-primary/50 dark:border-white/10 dark:text-white"
          >
            <option value="all">
              All sources
            </option>
            <option value="docs_page">
              Docs page
            </option>
            <option value="doc_comments_admin">
              Doc comments admin
            </option>
          </select>
          <TxButton variant="bare" size="small" native-type="button" class="rounded-lg bg-black/[0.04] text-xs text-black/70 transition hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/70" @click="fetchDocsAnalytics">
            Refresh
          </TxButton>
          <TxButton
            v-if="docsPath"
            variant="bare"
            size="small"
            native-type="button"
            class="rounded-lg bg-black/[0.04] text-xs text-black/70 transition hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/70"
            @click="docsPath = ''"
          >
            Clear
          </TxButton>
        </div>

        <div v-if="docsLoading" class="flex items-center gap-2 rounded-2xl bg-black/[0.02] p-4 text-sm text-black/45 dark:bg-white/[0.03] dark:text-white/50">
          <TxSpinner :size="16" />
          Loading docs analytics...
        </div>
        <div v-else-if="docsError" class="rounded-2xl bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">
          {{ docsError }}
        </div>
        <template v-else-if="docsAnalytics">
          <div class="grid gap-4 lg:grid-cols-2">
            <div class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
              <h3 class="mb-3 font-semibold text-black dark:text-white">
                Docs summary
              </h3>
              <div v-if="docsSummaryRows.length === 0" class="text-sm text-black/45 dark:text-white/50">
                No docs data in current range.
              </div>
              <div v-else class="space-y-2">
                <button
                  v-for="item in docsSummaryRows"
                  :key="item.path"
                  type="button"
                  class="w-full flex items-center justify-between rounded-xl bg-black/[0.04] px-3 py-2 text-left text-sm transition hover:bg-black/[0.08] dark:bg-white/[0.05] dark:hover:bg-white/[0.09]"
                  @click="openDocAnalyticsPath(item.path)"
                >
                  <div class="min-w-0">
                    <p class="truncate text-black/75 dark:text-white/75">
                      {{ item.path }}
                    </p>
                    <p class="truncate text-xs text-black/45 dark:text-white/50">
                      {{ item.title || 'Untitled' }}
                    </p>
                  </div>
                  <div class="text-right text-xs text-black/45 dark:text-white/50">
                    <p>{{ formatNumber(item.views) }} views</p>
                    <p>{{ formatDuration(item.activeMs) }}</p>
                  </div>
                </button>
              </div>
            </div>

            <div class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
              <h3 class="mb-3 font-semibold text-black dark:text-white">
                Action evidence
              </h3>
              <div v-if="!docsDetail || docsDetail.evidence.length === 0" class="text-sm text-black/45 dark:text-white/50">
                No action evidence in current range.
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="item in docsDetail.evidence.slice(0, 12)"
                  :key="`${item.sourceType}:${item.actionType}:${item.textHash}:${item.sectionId}:${item.anchorBucket}`"
                  class="rounded-xl bg-black/[0.04] px-3 py-2 text-xs dark:bg-white/[0.05]"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-black/75 dark:text-white/75">{{ item.actionType }} · {{ item.actionSource }}</span>
                    <span class="text-black/45 dark:text-white/50">{{ formatNumber(item.count) }}</span>
                  </div>
                  <p class="mt-1 truncate text-black/45 dark:text-white/50">
                    {{ item.sectionId }} · bucket {{ item.anchorBucket }} · {{ item.sourceType }}
                  </p>
                  <p v-if="item.textHash" class="mt-1 truncate text-black/40 dark:text-white/45">
                    {{ item.textHash }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div v-if="docsDetail" class="grid gap-4 lg:grid-cols-2">
            <div class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
              <h3 class="mb-3 font-semibold text-black dark:text-white">
                Sections · {{ docsDetail.path }}
              </h3>
              <div v-if="docsDetail.sections.length === 0" class="text-sm text-black/45 dark:text-white/50">
                No section heat data.
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="section in docsDetail.sections.slice(0, 20)"
                  :key="section.sectionId"
                  class="rounded-xl bg-black/[0.04] px-3 py-2 text-sm dark:bg-white/[0.05]"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="truncate text-black/75 dark:text-white/75">{{ section.sectionId }}</span>
                    <span class="text-xs text-black/45 dark:text-white/50">{{ formatDuration(section.activeMs) }}</span>
                  </div>
                  <p class="truncate text-xs text-black/45 dark:text-white/50">
                    {{ section.sectionTitle || '-' }}
                  </p>
                </div>
              </div>
            </div>

            <div class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
              <h3 class="mb-3 font-semibold text-black dark:text-white">
                Heat buckets (0-19)
              </h3>
              <div v-if="!docsDetail || docsDetail.heatmap.length === 0" class="text-sm text-black/45 dark:text-white/50">
                No heat buckets yet.
              </div>
              <div v-else class="space-y-3">
                <div
                  v-for="section in docsDetail.sections.slice(0, 8)"
                  :key="`heat-${section.sectionId}`"
                  class="rounded-xl bg-black/[0.04] px-3 py-3 text-xs dark:bg-white/[0.05]"
                >
                  <p class="mb-2 truncate text-black/70 dark:text-white/70">
                    {{ section.sectionId }}
                  </p>
                  <div class="flex items-end gap-1">
                    <div
                      v-for="bucket in docsHeatmapBySection.get(section.sectionId) || []"
                      :key="`${section.sectionId}:${bucket.bucket}:${bucket.sourceType}`"
                      class="h-14 w-2 rounded bg-emerald-500/60"
                      :style="{ height: `${Math.max(8, (bucket.activeMs / maxHeatValue) * 56)}px` }"
                      :title="`bucket ${bucket.bucket} · ${bucket.sourceType} · ${bucket.activeMs}ms`"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Geo Analytics -->
      <div v-if="activeSection === 'geo'" class="space-y-4">
        <div class="grid gap-4 lg:grid-cols-4">
          <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              Searches
            </h3>
            <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
              {{ formatNumber(geoAnalytics?.summary.totalSearches || 0) }}
            </p>
          </div>
          <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              Unique IPs
            </h3>
            <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
              {{ formatNumber(geoAnalytics?.summary.uniqueIps || 0) }}
            </p>
          </div>
          <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              Countries
            </h3>
            <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
              {{ formatNumber(geoAnalytics?.summary.countryCount || 0) }}
            </p>
          </div>
          <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              Subdivisions
            </h3>
            <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
              {{ formatNumber(geoAnalytics?.summary.subdivisionCount || 0) }}
            </p>
          </div>
        </div>

        <div class="flex items-center justify-between rounded-2xl bg-black/[0.02] px-4 py-3 text-sm dark:bg-white/[0.03]">
          <div class="flex items-center gap-2">
            <span class="text-black/60 dark:text-white/60">Scope:</span>
            <span class="font-medium text-black dark:text-white">Global</span>
            <span v-if="selectedGeoCountry" class="text-black/40 dark:text-white/40">></span>
            <span v-if="selectedGeoCountry" class="font-medium text-black dark:text-white">{{ resolveCountryLabel(selectedGeoCountry) }}</span>
          </div>
          <TxButton
            v-if="selectedGeoCountry"
            variant="bare"
            size="small"
            native-type="button"
            class="rounded-lg bg-black/[0.04] text-xs text-black/70 transition hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/70"
            @click="resetGeoDrilldown"
          >
            Back to Global
          </TxButton>
        </div>

        <div v-if="geoLoading" class="flex items-center gap-2 rounded-2xl bg-black/[0.02] p-4 text-sm text-black/45 dark:bg-white/[0.03] dark:text-white/50">
          <TxSpinner :size="16" />
          Loading geo analytics...
        </div>
        <div v-else-if="geoError" class="rounded-2xl bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">
          {{ geoError }}
        </div>

        <template v-else-if="geoAnalytics">
          <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
            <GeoLeafletMap
              :points="geoMapPoints"
              :height="320"
              @point-click="handleMapPointClick"
            />
          </div>

          <div class="grid gap-4 lg:grid-cols-2">
            <div class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
              <h3 class="mb-3 font-semibold text-black dark:text-white">
                {{ selectedGeoCountry ? 'State / Province Breakdown' : 'Country Breakdown' }}
              </h3>
              <div v-if="selectedGeoCountry ? geoSubdivisions.length === 0 : geoCountries.length === 0" class="text-sm text-black/45 dark:text-white/50">
                No data in current range
              </div>
              <div v-else class="space-y-2">
                <template v-if="selectedGeoCountry">
                  <button
                    v-for="item in geoSubdivisions.slice(0, 12)"
                    :key="`${item.countryCode}:${item.regionCode || item.regionName || 'unknown'}`"
                    type="button"
                    class="w-full flex items-center justify-between rounded-xl bg-black/[0.04] px-3 py-2 text-left text-sm transition hover:bg-black/[0.08] dark:bg-white/[0.05] dark:hover:bg-white/[0.09]"
                  >
                    <span class="truncate text-black/75 dark:text-white/75">
                      {{ resolveSubdivisionLabel(item) }}
                    </span>
                    <span class="text-xs text-black/45 dark:text-white/50">
                      {{ formatNumber(item.count) }}
                    </span>
                  </button>
                </template>
                <template v-else>
                  <button
                    v-for="item in geoCountries.slice(0, 12)"
                    :key="item.countryCode"
                    type="button"
                    class="w-full flex items-center justify-between rounded-xl bg-black/[0.04] px-3 py-2 text-left text-sm transition hover:bg-black/[0.08] dark:bg-white/[0.05] dark:hover:bg-white/[0.09]"
                    @click="drilldownCountry(item.countryCode)"
                  >
                    <span class="truncate text-black/75 dark:text-white/75">
                      {{ resolveCountryLabel(item.countryCode) }}
                    </span>
                    <span class="text-xs text-black/45 dark:text-white/50">
                      {{ formatNumber(item.count) }}
                    </span>
                  </button>
                </template>
              </div>
            </div>

            <div class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
              <h3 class="mb-3 font-semibold text-black dark:text-white">
                Top IPs
              </h3>
              <div v-if="geoTopIps.length === 0" class="text-sm text-black/45 dark:text-white/50">
                No IP data in current range
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="item in geoTopIps"
                  :key="`${item.ip}:${item.lastSeenAt}`"
                  class="rounded-xl bg-black/[0.04] px-3 py-2 text-sm dark:bg-white/[0.05]"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-medium text-black/80 dark:text-white/80">{{ item.ip }}</span>
                    <span class="text-xs text-black/45 dark:text-white/50">{{ formatNumber(item.count) }}</span>
                  </div>
                  <p class="mt-1 text-xs text-black/45 dark:text-white/50">
                    {{ resolveCountryLabel(item.countryCode) }} · {{ item.regionCode || '-' }} · {{ item.city || '-' }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Telemetry Messages -->
      <div v-if="activeSection === 'messages'" class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="font-semibold text-black dark:text-white">
            Telemetry Messages
          </h3>
          <TxButton variant="bare" size="small" native-type="button" class="rounded-lg bg-black/[0.04] text-xs text-black/70 transition hover:bg-black/10 dark:bg-white/[0.04] dark:text-white/70" @click="fetchMessages">
            Refresh
          </TxButton>
        </div>
        <div v-if="messagesLoading" class="flex items-center gap-2 text-sm text-black/40 dark:text-white/40">
          <TxSpinner :size="16" />
          Loading messages...
        </div>
        <div v-else-if="messagesError" class="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
          {{ messagesError }}
        </div>
        <div v-else-if="messages.length === 0" class="text-sm text-black/40 dark:text-white/40">
          No messages yet
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="item in messages"
            :key="item.id"
            class="rounded-xl border border-black/[0.04] bg-black/[0.02] p-4 text-sm dark:border-white/[0.06] dark:bg-white/[0.04]"
          >
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold uppercase text-black/40 dark:text-white/40">{{ item.source }}</span>
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    :class="item.severity === 'error'
                      ? 'bg-red-500/15 text-red-500'
                      : item.severity === 'warn'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        : 'bg-blue-500/15 text-blue-500'"
                  >
                    {{ item.severity }}
                  </span>
                  <span v-if="item.status === 'unread'" class="rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] text-black/60 dark:bg-white/[0.08] dark:text-white/60">
                    unread
                  </span>
                </div>
                <p class="mt-2 font-semibold text-black dark:text-white">
                  {{ item.title }}
                </p>
                <p class="mt-1 text-black/60 dark:text-white/60">
                  {{ item.message }}
                </p>
              </div>
              <span class="text-xs text-black/40 dark:text-white/40">{{ formatMessageTime(item.createdAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Exchange Rate History -->
      <div v-if="activeSection === 'exchange'" class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-semibold text-black dark:text-white">
              Exchange Rate History
            </h3>
            <p class="text-xs text-black/45 dark:text-white/45">
              Non-free users only. USD base.
            </p>
          </div>
          <TxButton variant="bare" size="small" native-type="button" class="rounded-lg bg-black/[0.04] text-xs text-black/70 transition hover:bg-black/10 dark:bg-white/[0.04] dark:text-white/70" @click="fetchExchangeHistory">
            Refresh
          </TxButton>
        </div>
        <div class="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-black/[0.02] p-4 text-xs dark:bg-white/[0.03]">
          <select v-model="exchangeView" class="h-8 rounded-lg border border-black/10 bg-transparent px-3 text-xs text-black outline-none transition focus:border-primary/50 dark:border-white/10 dark:text-white">
            <option value="history">
              Target history
            </option>
            <option value="snapshots">
              Snapshots
            </option>
          </select>
          <input
            v-model="exchangeTarget"
            type="text"
            placeholder="Target (e.g. CNY)"
            class="h-8 w-28 rounded-lg border border-black/10 bg-transparent px-3 text-xs uppercase text-black outline-none transition focus:border-primary/50 dark:border-white/10 dark:text-white"
          >
          <input
            v-model.number="exchangeLimit"
            type="number"
            min="1"
            max="200"
            class="h-8 w-20 rounded-lg border border-black/10 bg-transparent px-3 text-xs text-black outline-none transition focus:border-primary/50 dark:border-white/10 dark:text-white"
          >
          <label class="flex items-center gap-2 text-xs text-black/60 dark:text-white/60">
            <input v-model="exchangeIncludePayload" type="checkbox" class="h-3 w-3 rounded border-black/20">
            Include payload (admin)
          </label>
        </div>
        <div v-if="exchangeLoading" class="flex items-center gap-2 text-sm text-black/40 dark:text-white/40">
          <TxSpinner :size="16" />
          Loading exchange history...
        </div>
        <div v-else-if="exchangeError" class="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
          {{ exchangeError }}
        </div>
        <div v-else-if="exchangeView === 'history' && exchangeHistory.length === 0" class="text-sm text-black/40 dark:text-white/40">
          No history data
        </div>
        <div v-else-if="exchangeView === 'snapshots' && exchangeSnapshots.length === 0" class="text-sm text-black/40 dark:text-white/40">
          No snapshot data
        </div>
        <div v-else class="space-y-3">
          <template v-if="exchangeView === 'history'">
            <div
              v-for="item in exchangeHistory"
              :key="`${item.targetCurrency}:${item.fetchedAt}`"
              class="rounded-xl border border-black/[0.04] bg-black/[0.02] p-4 text-sm dark:border-white/[0.06] dark:bg-white/[0.04]"
            >
              <div class="flex items-center justify-between gap-4">
                <div class="font-semibold text-black dark:text-white">
                  USD → {{ item.targetCurrency }}
                </div>
                <div class="text-xs text-black/40 dark:text-white/40">
                  {{ formatExchangeTime(item.fetchedAt) }}
                </div>
              </div>
              <div class="mt-2 text-xs text-black/60 dark:text-white/60">
                Rate: {{ formatRate(item.rate) }}
              </div>
            </div>
          </template>
          <template v-if="exchangeView === 'snapshots'">
            <div
              v-for="item in exchangeSnapshots"
              :key="item.id"
              class="rounded-xl border border-black/[0.04] bg-black/[0.02] p-4 text-sm dark:border-white/[0.06] dark:bg-white/[0.04]"
            >
              <div class="flex items-center justify-between gap-4">
                <div class="font-semibold text-black dark:text-white">
                  Snapshot · {{ item.baseCurrency }}
                </div>
                <div class="text-xs text-black/40 dark:text-white/40">
                  {{ formatExchangeTime(item.fetchedAt) }}
                </div>
              </div>
              <div class="mt-2 text-xs text-black/60 dark:text-white/60">
                Provider updated: {{ formatExchangeTime(item.providerUpdatedAt) }}
              </div>
              <div v-if="item.payload" class="mt-2 rounded-lg bg-black/[0.03] p-3 text-[11px] text-black/60 dark:bg-white/[0.05] dark:text-white/60">
                {{ formatPayloadPreview(item.payload) }}
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- Breakdown Drawer -->
      <div v-if="showBreakdown" class="fixed inset-0 z-40 flex justify-end bg-black/30 p-4" @click.self="showBreakdown = false">
        <div class="h-full w-full max-w-lg overflow-y-auto rounded-3xl bg-white/90 p-6 shadow-xl backdrop-blur-xl dark:bg-[#1c1c1e]">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-black dark:text-white">
                Analytics Breakdown
              </h3>
              <p class="text-xs text-black/50 dark:text-white/50">
                Secondary distributions and deep-dive signals
              </p>
            </div>
            <TxButton variant="bare" circle size="mini" native-type="button" class="bg-black/[0.04] text-black/60 transition hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/70" @click="showBreakdown = false">
              <span class="i-carbon-close" />
            </TxButton>
          </div>

          <div class="mb-4 flex gap-2">
            <TxButton variant="bare" native-type="button" class="text-xs" :class="activeBreakdownTab === 'search' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/[0.04] text-black/60 dark:bg-white/[0.08] dark:text-white/60'" @click="activeBreakdownTab = 'search'">
              Search
            </TxButton>
            <TxButton variant="bare" native-type="button" class="text-xs" :class="activeBreakdownTab === 'usage' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/[0.04] text-black/60 dark:bg-white/[0.08] dark:text-white/60'" @click="activeBreakdownTab = 'usage'">
              Usage
            </TxButton>
          </div>

          <div v-if="activeBreakdownTab === 'search'" class="space-y-6 text-sm">
            <div>
              <h4 class="mb-2 font-semibold text-black dark:text-white">
                Search Input Types
              </h4>
              <div class="space-y-2">
                <div v-for="item in toSortedList(analytics.summary.searchInputTypeDistribution, 10)" :key="item[0]" class="flex items-center justify-between">
                  <span>{{ item[0] }}</span>
                  <span class="text-black/40 dark:text-white/40">{{ item[1] }}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 class="mb-2 font-semibold text-black dark:text-white">
                Provider Usage
              </h4>
              <div class="space-y-2">
                <div v-for="item in toSortedList(analytics.summary.searchProviderDistribution, 10)" :key="item[0]" class="flex items-center justify-between">
                  <span>{{ item[0] }}</span>
                  <span class="text-black/40 dark:text-white/40">{{ item[1] }}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 class="mb-2 font-semibold text-black dark:text-white">
                Provider Results
              </h4>
              <div class="space-y-2">
                <div v-for="item in toSortedList(analytics.summary.searchProviderResultDistribution, 10)" :key="item[0]" class="flex items-center justify-between">
                  <span>{{ item[0] }}</span>
                  <span class="text-black/40 dark:text-white/40">{{ item[1] }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="space-y-6 text-sm">
            <div>
              <h4 class="mb-2 font-semibold text-black dark:text-white">
                Executed Sources
              </h4>
              <div class="space-y-2">
                <div v-for="item in toSortedList(analytics.summary.featureUseSourceTypeDistribution, 10)" :key="item[0]" class="flex items-center justify-between">
                  <span class="capitalize">{{ item[0] }}</span>
                  <span class="text-black/40 dark:text-white/40">{{ item[1] }}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 class="mb-2 font-semibold text-black dark:text-white">
                Item Kinds
              </h4>
              <div class="space-y-2">
                <div v-for="item in toSortedList(analytics.summary.featureUseItemKindDistribution, 10)" :key="item[0]" class="flex items-center justify-between">
                  <span class="capitalize">{{ item[0] }}</span>
                  <span class="text-black/40 dark:text-white/40">{{ item[1] }}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 class="mb-2 font-semibold text-black dark:text-white">
                Plugins
              </h4>
              <div class="space-y-2">
                <div v-for="item in toSortedList(analytics.summary.featureUsePluginDistribution, 10)" :key="item[0]" class="flex items-center justify-between">
                  <span class="truncate">{{ item[0] }}</span>
                  <span class="text-black/40 dark:text-white/40">{{ item[1] }}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 class="mb-2 font-semibold text-black dark:text-white">
                Usage Categories
              </h4>
              <div class="space-y-2">
                <div v-for="item in toSortedList(analytics.summary.featureUseCategoryDistribution, 10)" :key="item[0]" class="flex items-center justify-between">
                  <span class="truncate">{{ formatCategoryKey(item[0]).level1 }} · {{ formatCategoryKey(item[0]).level2 }}</span>
                  <span class="text-black/40 dark:text-white/40">{{ item[1] }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
