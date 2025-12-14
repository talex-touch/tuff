<script setup lang="ts">
definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t } = useI18n()
const { user } = useUser()

// Admin check - redirect if not admin
const isAdmin = computed(() => {
  const metadata = (user.value?.publicMetadata ?? {}) as Record<string, unknown>
  return metadata?.role === 'admin'
})

watch(isAdmin, (admin) => {
  if (user.value && !admin) {
    navigateTo('/dashboard/overview')
  }
}, { immediate: true })

interface AnalyticsData {
  summary: {
    totalUsers: number
    totalSearches: number
    avgSearchDuration: number
    dailyStats: Array<{
      date: string
      visits: number
      searches: number
      avgDuration: number
    }>
    deviceDistribution: Record<string, number>
    regionDistribution: Record<string, number>
    topSearchTerms: Array<{ term: string; count: number }>
    hourlyDistribution: Record<string, number>
  }
  realtime: {
    searchesLast24h: number
    visitsLast24h: number
    activeUsers: number
    avgLatency: number
  }
}

const analytics = ref<AnalyticsData | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const selectedDays = ref(30)

async function fetchAnalytics() {
  loading.value = true
  error.value = null
  try {
    const data = await $fetch<AnalyticsData>(`/api/admin/analytics?days=${selectedDays.value}`)
    analytics.value = data
  } catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to load analytics'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchAnalytics()
})

watch(selectedDays, () => {
  fetchAnalytics()
})

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

const deviceColors: Record<string, string> = {
  darwin: 'bg-blue-500',
  win32: 'bg-green-500',
  linux: 'bg-orange-500',
}

const hourLabels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`)
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-black dark:text-light">{{ t('dashboard.sections.analytics.title', 'Analytics Dashboard') }}</h1>
        <p class="text-sm text-black/50 dark:text-light/50">{{ t('dashboard.sections.analytics.subtitle', 'Usage statistics and insights') }}</p>
      </div>
      <select
        v-model="selectedDays"
        class="rounded-lg border-0 bg-black/5 px-3 py-2 text-sm text-black outline-none dark:bg-light/5 dark:text-light"
      >
        <option :value="7">{{ t('dashboard.sections.analytics.last7Days', 'Last 7 days') }}</option>
        <option :value="30">{{ t('dashboard.sections.analytics.last30Days', 'Last 30 days') }}</option>
        <option :value="90">{{ t('dashboard.sections.analytics.last90Days', 'Last 90 days') }}</option>
      </select>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <span class="i-carbon-circle-dash animate-spin text-2xl text-black/30 dark:text-light/30" />
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
          <p class="mt-2 text-2xl font-bold text-black dark:text-light">
            {{ formatNumber(analytics.realtime.activeUsers) }}
          </p>
        </div>

        <div class="rounded-2xl bg-gradient-to-br from-green-500/10 to-green-600/5 p-4">
          <div class="flex items-center gap-2 text-green-600 dark:text-green-400">
            <span class="i-carbon-view text-lg" />
            <span class="text-xs font-medium">Visits (24h)</span>
          </div>
          <p class="mt-2 text-2xl font-bold text-black dark:text-light">
            {{ formatNumber(analytics.realtime.visitsLast24h) }}
          </p>
        </div>

        <div class="rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 p-4">
          <div class="flex items-center gap-2 text-purple-600 dark:text-purple-400">
            <span class="i-carbon-search text-lg" />
            <span class="text-xs font-medium">Searches (24h)</span>
          </div>
          <p class="mt-2 text-2xl font-bold text-black dark:text-light">
            {{ formatNumber(analytics.realtime.searchesLast24h) }}
          </p>
        </div>

        <div class="rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-4">
          <div class="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <span class="i-carbon-time text-lg" />
            <span class="text-xs font-medium">Avg Latency</span>
          </div>
          <p class="mt-2 text-2xl font-bold text-black dark:text-light">
            {{ analytics.realtime.avgLatency }}ms
          </p>
        </div>
      </div>

      <!-- Summary Stats -->
      <div class="grid gap-4 lg:grid-cols-3">
        <div class="rounded-2xl bg-white/60 p-4 dark:bg-dark/40">
          <h3 class="text-sm font-medium text-black/60 dark:text-light/60">Total Users</h3>
          <p class="mt-1 text-3xl font-bold text-black dark:text-light">
            {{ formatNumber(analytics.summary.totalUsers) }}
          </p>
        </div>
        <div class="rounded-2xl bg-white/60 p-4 dark:bg-dark/40">
          <h3 class="text-sm font-medium text-black/60 dark:text-light/60">Total Searches</h3>
          <p class="mt-1 text-3xl font-bold text-black dark:text-light">
            {{ formatNumber(analytics.summary.totalSearches) }}
          </p>
        </div>
        <div class="rounded-2xl bg-white/60 p-4 dark:bg-dark/40">
          <h3 class="text-sm font-medium text-black/60 dark:text-light/60">Avg Search Duration</h3>
          <p class="mt-1 text-3xl font-bold text-black dark:text-light">
            {{ analytics.summary.avgSearchDuration }}ms
          </p>
        </div>
      </div>

      <!-- Daily Trend Chart (simplified bar representation) -->
      <div class="rounded-2xl bg-white/60 p-5 dark:bg-dark/40">
        <h3 class="mb-4 font-semibold text-black dark:text-light">Daily Activity</h3>
        <div class="space-y-2">
          <div
            v-for="day in analytics.summary.dailyStats.slice(0, 14)"
            :key="day.date"
            class="flex items-center gap-3"
          >
            <span class="w-20 text-xs text-black/50 dark:text-light/50">{{ day.date.slice(5) }}</span>
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
            <span class="w-16 text-right text-xs text-black/40 dark:text-light/40">
              {{ day.avgDuration }}ms
            </span>
          </div>
        </div>
        <div class="mt-3 flex gap-4 text-xs text-black/50 dark:text-light/50">
          <span class="flex items-center gap-1">
            <span class="h-2 w-2 rounded bg-blue-500/60" /> Visits
          </span>
          <span class="flex items-center gap-1">
            <span class="h-2 w-2 rounded bg-purple-500/60" /> Searches
          </span>
        </div>
      </div>

      <!-- Device & Region Distribution -->
      <div class="grid gap-4 lg:grid-cols-2">
        <!-- Device Distribution -->
        <div class="rounded-2xl bg-white/60 p-5 dark:bg-dark/40">
          <h3 class="mb-4 font-semibold text-black dark:text-light">Device Distribution</h3>
          <div class="space-y-3">
            <div
              v-for="(count, device) in analytics.summary.deviceDistribution"
              :key="device"
              class="flex items-center gap-3"
            >
              <span class="w-16 text-xs font-medium text-black/60 dark:text-light/60">
                {{ device === 'darwin' ? 'macOS' : device === 'win32' ? 'Windows' : device }}
              </span>
              <div class="flex-1">
                <div class="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-light/10">
                  <div
                    :class="[deviceColors[device] || 'bg-gray-500', 'h-full rounded-full']"
                    :style="{ width: `${(count / Object.values(analytics.summary.deviceDistribution).reduce((a, b) => a + b, 0)) * 100}%` }"
                  />
                </div>
              </div>
              <span class="w-12 text-right text-xs text-black/40 dark:text-light/40">
                {{ count }}
              </span>
            </div>
          </div>
        </div>

        <!-- Region Distribution -->
        <div class="rounded-2xl bg-white/60 p-5 dark:bg-dark/40">
          <h3 class="mb-4 font-semibold text-black dark:text-light">Region Distribution</h3>
          <div v-if="Object.keys(analytics.summary.regionDistribution).length === 0" class="py-4 text-center text-sm text-black/40 dark:text-light/40">
            No region data (anonymous mode)
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="(count, region) in Object.fromEntries(Object.entries(analytics.summary.regionDistribution).slice(0, 10))"
              :key="region"
              class="flex items-center gap-3"
            >
              <span class="w-20 truncate text-xs font-medium text-black/60 dark:text-light/60">
                {{ region }}
              </span>
              <div class="flex-1">
                <div class="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-light/10">
                  <div
                    class="h-full rounded-full bg-emerald-500"
                    :style="{ width: `${(count / Object.values(analytics.summary.regionDistribution).reduce((a, b) => a + b, 0)) * 100}%` }"
                  />
                </div>
              </div>
              <span class="w-12 text-right text-xs text-black/40 dark:text-light/40">
                {{ count }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Hourly Distribution -->
      <div class="rounded-2xl bg-white/60 p-5 dark:bg-dark/40">
        <h3 class="mb-4 font-semibold text-black dark:text-light">Hourly Distribution (UTC)</h3>
        <div class="flex items-end gap-1" style="height: 100px">
          <div
            v-for="hour in 24"
            :key="hour"
            class="flex-1"
          >
            <div
              class="w-full rounded-t bg-blue-500/60 transition-all"
              :style="{
                height: `${Math.max(4, (analytics.summary.hourlyDistribution[(hour - 1).toString().padStart(2, '0')] || 0) / Math.max(...Object.values(analytics.summary.hourlyDistribution), 1) * 100)}%`
              }"
              :title="`${(hour - 1).toString().padStart(2, '0')}:00 - ${analytics.summary.hourlyDistribution[(hour - 1).toString().padStart(2, '0')] || 0} searches`"
            />
          </div>
        </div>
        <div class="mt-2 flex justify-between text-[10px] text-black/40 dark:text-light/40">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </div>

      <!-- Top Search Terms -->
      <div class="rounded-2xl bg-white/60 p-5 dark:bg-dark/40">
        <h3 class="mb-4 font-semibold text-black dark:text-light">Top Search Terms</h3>
        <div v-if="analytics.summary.topSearchTerms.length === 0" class="py-4 text-center text-sm text-black/40 dark:text-light/40">
          No search term data (anonymous mode)
        </div>
        <div v-else class="flex flex-wrap gap-2">
          <span
            v-for="item in analytics.summary.topSearchTerms.slice(0, 30)"
            :key="item.term"
            class="rounded-full bg-black/5 px-3 py-1 text-xs text-black/70 dark:bg-light/5 dark:text-light/70"
          >
            {{ item.term }}
            <span class="ml-1 text-black/40 dark:text-light/40">({{ item.count }})</span>
          </span>
        </div>
      </div>
    </template>
  </div>
</template>
