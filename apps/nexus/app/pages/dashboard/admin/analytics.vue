<script setup lang="ts">
definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t, locale } = useI18n()
const { user } = useAuthUser()

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

interface TelemetryMessage {
  id: string
  source: string
  severity: 'info' | 'warn' | 'error'
  title: string
  message: string
  status: string
  createdAt: string
}

const analytics = ref<AnalyticsData | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const selectedDays = ref(30)
const messages = ref<TelemetryMessage[]>([])
const messagesLoading = ref(false)
const messagesError = ref<string | null>(null)
const activeSection = ref<'overview' | 'performance' | 'search' | 'usage' | 'messages'>('overview')
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

onMounted(() => {
  fetchAnalytics()
  fetchMessages()
})

watch(selectedDays, () => {
  fetchAnalytics()
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
      <TuffSelect v-model="selectedDays" class="w-44">
        <TuffSelectItem :value="7" :label="t('dashboard.sections.analytics.last7Days', 'Last 7 days')" />
        <TuffSelectItem :value="30" :label="t('dashboard.sections.analytics.last30Days', 'Last 30 days')" />
        <TuffSelectItem :value="90" :label="t('dashboard.sections.analytics.last90Days', 'Last 90 days')" />
      </TuffSelect>
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
        <TxButton
          variant="bare"
          native-type="button"
          class="rounded-full px-3 py-1 text-xs transition"
          :class="activeSection === 'overview'
            ? 'bg-black text-white dark:bg-white dark:text-black'
            : 'bg-black/[0.04] text-black/60 hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.1]'"
          @click="activeSection = 'overview'"
        >
          Overview
        </TxButton>
        <TxButton
          variant="bare"
          native-type="button"
          class="rounded-full px-3 py-1 text-xs transition"
          :class="activeSection === 'performance'
            ? 'bg-black text-white dark:bg-white dark:text-black'
            : 'bg-black/[0.04] text-black/60 hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.1]'"
          @click="activeSection = 'performance'"
        >
          Performance
        </TxButton>
        <TxButton
          variant="bare"
          native-type="button"
          class="rounded-full px-3 py-1 text-xs transition"
          :class="activeSection === 'search'
            ? 'bg-black text-white dark:bg-white dark:text-black'
            : 'bg-black/[0.04] text-black/60 hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.1]'"
          @click="activeSection = 'search'"
        >
          Search
        </TxButton>
        <TxButton
          variant="bare"
          native-type="button"
          class="rounded-full px-3 py-1 text-xs transition"
          :class="activeSection === 'usage'
            ? 'bg-black text-white dark:bg-white dark:text-black'
            : 'bg-black/[0.04] text-black/60 hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.1]'"
          @click="activeSection = 'usage'"
        >
          Usage
        </TxButton>
        <TxButton
          variant="bare"
          native-type="button"
          class="rounded-full px-3 py-1 text-xs transition"
          :class="activeSection === 'messages'
            ? 'bg-black text-white dark:bg-white dark:text-black'
            : 'bg-black/[0.04] text-black/60 hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.1]'"
          @click="activeSection = 'messages'"
        >
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
            <TxButton
              variant="bare"
              size="small"
              native-type="button"
              class="text-xs text-black/50 transition hover:text-black dark:text-white/50 dark:hover:text-light"
              @click="showBreakdown = true; activeBreakdownTab = 'search'"
            >
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
            <TxButton
              variant="bare"
              size="small"
              native-type="button"
              class="text-xs text-black/50 transition hover:text-black dark:text-white/50 dark:hover:text-light"
              @click="showBreakdown = true; activeBreakdownTab = 'search'"
            >
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
            <TxButton
              variant="bare"
              size="small"
              native-type="button"
              class="text-xs text-black/50 transition hover:text-black dark:text-white/50 dark:hover:text-light"
              @click="showBreakdown = true; activeBreakdownTab = 'usage'"
            >
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

      <!-- Telemetry Messages -->
      <div v-if="activeSection === 'messages'" class="rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="font-semibold text-black dark:text-white">
            Telemetry Messages
          </h3>
          <TxButton
            variant="bare"
            size="small"
            native-type="button"
            class="rounded-lg bg-black/[0.04] px-3 py-1 text-xs text-black/70 transition hover:bg-black/10 dark:bg-white/[0.04] dark:text-white/70"
            @click="fetchMessages"
          >
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
            <TxButton
              variant="bare"
              circle
              size="mini"
              native-type="button"
              class="rounded-full bg-black/[0.04] p-2 text-black/60 transition hover:bg-black/10 dark:bg-white/[0.08] dark:text-white/70"
              @click="showBreakdown = false"
            >
              <span class="i-carbon-close" />
            </TxButton>
          </div>

          <div class="mb-4 flex gap-2">
            <TxButton
              variant="bare"
              native-type="button"
              class="rounded-full px-3 py-1 text-xs"
              :class="activeBreakdownTab === 'search'
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'bg-black/[0.04] text-black/60 dark:bg-white/[0.08] dark:text-white/60'"
              @click="activeBreakdownTab = 'search'"
            >
              Search
            </TxButton>
            <TxButton
              variant="bare"
              native-type="button"
              class="rounded-full px-3 py-1 text-xs"
              :class="activeBreakdownTab === 'usage'
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'bg-black/[0.04] text-black/60 dark:bg-white/[0.08] dark:text-white/60'"
              @click="activeBreakdownTab = 'usage'"
            >
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
