<script setup lang="ts">
import { computed } from 'vue'

defineI18nRoute(false)

interface LoginHistoryItem {
  id: string
  success: boolean
  ip: string | null
  created_at: string
}

interface DeviceItem {
  id: string
  deviceName: string | null
  platform: string | null
  lastSeenAt: string | null
  createdAt: string
  revokedAt?: string | null
}

interface TelemetryDailyPoint {
  date: string
  searches: number
  avgLatency: number
  avgResultCount: number
}

interface TelemetryOverviewResponse {
  summary: {
    searches: number
    avgLatency: number
    avgResultCount: number
    lastSearchAt: string | null
  }
  daily: TelemetryDailyPoint[]
}

interface OverviewKpis {
  searches: number
  avgLatency: number
  avgResults: number
  login: {
    success: number
    failed: number
    successRate: number
  }
  devices: {
    active: number
    total: number
  }
}

interface OverviewViewModel {
  kpis: OverviewKpis
  searchTrend: {
    points: TelemetryDailyPoint[]
    hasData: boolean
  }
  recentLogins: LoginHistoryItem[]
  devices: DeviceItem[]
}

const { t, locale } = useI18n()
const { user, pending: userPending } = useAuthUser()
const { deviceId: currentDeviceId } = useDeviceIdentity()

const rangeDays = 7

const { data: telemetryData, pending: telemetryPending, error: telemetryError, refresh: refreshTelemetry } = useFetch<TelemetryOverviewResponse>('/api/dashboard/telemetry/me?days=7')
const { data: loginHistoryData, pending: historyPending, error: historyError, refresh: refreshHistory } = useFetch<LoginHistoryItem[]>('/api/login-history')
const { data: devicesData, pending: devicesPending, error: devicesError, refresh: refreshDevices } = useFetch<DeviceItem[]>('/api/devices')

const fallbackName = computed(() => t('dashboard.header.defaultName'))
const greetingName = computed(() => {
  if (userPending.value || !user.value)
    return fallbackName.value
  return user.value.name || user.value.email || fallbackName.value
})
const greetingLine = computed(() => t('dashboard.header.greeting', { name: greetingName.value }))

const localeTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const dayFormatter = computed(() => new Intl.DateTimeFormat(localeTag.value, { month: 'numeric', day: 'numeric' }))

const allTelemetryPoints = computed(() => telemetryData.value?.daily ?? [])
const currentTelemetryPoints = computed(() => allTelemetryPoints.value.slice(-rangeDays))

const historyItems = computed(() => loginHistoryData.value ?? [])
const deviceItems = computed(() => devicesData.value ?? [])

const sevenDayStart = computed(() => Date.now() - 7 * 24 * 60 * 60 * 1000)
const recentSevenDayHistory = computed(() => historyItems.value.filter((item) => {
  const ts = new Date(item.created_at).getTime()
  return Number.isFinite(ts) && ts >= sevenDayStart.value
}))

const recentLoginPreview = computed(() => historyItems.value.slice(0, 5))

const recentDevicePreview = computed(() => {
  return [...deviceItems.value]
    .sort((a, b) => {
      const left = toDateValue(a.lastSeenAt || a.createdAt)
      const right = toDateValue(b.lastSeenAt || b.createdAt)
      return right - left
    })
    .slice(0, 3)
})

const activeDeviceCount = computed(() => deviceItems.value.filter(item => !item.revokedAt).length)

const searchTotal = computed(() => currentTelemetryPoints.value.reduce((sum, point) => sum + point.searches, 0))

const avgLatency = computed(() => {
  const weightedTotal = currentTelemetryPoints.value.reduce((sum, point) => sum + point.avgLatency * point.searches, 0)
  return searchTotal.value > 0 ? Math.round(weightedTotal / searchTotal.value) : 0
})

const avgResults = computed(() => {
  const weightedTotal = currentTelemetryPoints.value.reduce((sum, point) => sum + point.avgResultCount * point.searches, 0)
  return searchTotal.value > 0 ? Math.round(weightedTotal / searchTotal.value) : 0
})

const successfulRecentLogins = computed(() => recentSevenDayHistory.value.filter(item => item.success).length)
const failedRecentLogins = computed(() => recentSevenDayHistory.value.filter(item => !item.success).length)

const overviewKpis = computed<OverviewKpis>(() => {
  const success = successfulRecentLogins.value
  const failed = failedRecentLogins.value
  const total = success + failed

  return {
    searches: searchTotal.value,
    avgLatency: avgLatency.value,
    avgResults: avgResults.value,
    login: {
      success,
      failed,
      successRate: total ? Math.round((success / total) * 100) : 0,
    },
    devices: {
      active: activeDeviceCount.value,
      total: deviceItems.value.length,
    },
  }
})

const searchTrendHasData = computed(() => currentTelemetryPoints.value.some(point => point.searches > 0))

const searchTrendMax = computed(() => {
  const values = currentTelemetryPoints.value.map(point => point.searches)
  return Math.max(1, ...values)
})

const latencyTrendMax = computed(() => {
  const values = currentTelemetryPoints.value.map(point => point.avgLatency)
  return Math.max(1, ...values)
})

const searchLinePoints = computed(() => {
  return buildLinePoints(currentTelemetryPoints.value.map(point => point.searches), searchTrendMax.value)
})

const rangeLabels = computed(() => {
  const keys = currentTelemetryPoints.value.map(point => point.date)
  if (!keys.length)
    return []

  const first = keys[0]
  const middle = keys[Math.floor((keys.length - 1) / 2)]
  const last = keys[keys.length - 1]

  return [first, middle, last].map((value) => {
    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime()))
      return value
    return dayFormatter.value.format(date)
  })
})

const viewModel = computed<OverviewViewModel>(() => ({
  kpis: overviewKpis.value,
  searchTrend: {
    points: currentTelemetryPoints.value,
    hasData: searchTrendHasData.value,
  },
  recentLogins: recentLoginPreview.value,
  devices: recentDevicePreview.value,
}))

const primaryDataReady = computed(() => Boolean(
  telemetryData.value || loginHistoryData.value || devicesData.value,
))

const showInitialLoading = computed(() => {
  const pendingAny = telemetryPending.value || historyPending.value || devicesPending.value
  return !primaryDataReady.value && pendingAny
})

const telemetryErrorText = computed(() => resolveErrorMessage(
  telemetryError.value,
  t('dashboard.overview.errors.loadFailed'),
))

const historyErrorText = computed(() => resolveErrorMessage(
  historyError.value,
  t('dashboard.overview.errors.loadFailed'),
))

const devicesErrorText = computed(() => resolveErrorMessage(
  devicesError.value,
  t('dashboard.overview.errors.loadFailed'),
))

async function refreshOverview() {
  await Promise.allSettled([
    refreshTelemetry(),
    refreshHistory(),
    refreshDevices(),
  ])
}

function toDateValue(value: string | null | undefined): number {
  if (!value)
    return 0
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function buildLinePoints(values: number[], max: number): string {
  if (!values.length)
    return ''

  const safeMax = max > 0 ? max : 1

  return values
    .map((value, index) => {
      const x = values.length === 1 ? 50 : 4 + (index / (values.length - 1)) * 92
      const y = 34 - (Math.max(0, value) / safeMax) * 28
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

function getLatencyBarHeight(value: number) {
  if (!value)
    return 4
  return Math.max(8, Math.round((value / latencyTrendMax.value) * 100))
}

function formatDateTime(value: string | null) {
  if (!value)
    return t('dashboard.overview.noData')

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(localeTag.value)
}

function formatRelativeTime(value: string | null) {
  if (!value)
    return t('dashboard.overview.noData')

  const date = new Date(value)
  const diff = Date.now() - date.getTime()

  if (!Number.isFinite(diff) || diff < 0)
    return formatDateTime(value)

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1)
    return t('dashboard.devices.justNow')
  if (minutes < 60)
    return t('dashboard.devices.minutesAgo', { n: minutes })
  if (hours < 24)
    return t('dashboard.devices.hoursAgo', { n: hours })
  return t('dashboard.devices.daysAgo', { n: days })
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(localeTag.value).format(value)
}

function resolveErrorMessage(error: any, fallback: string) {
  if (!error)
    return ''

  const source = error?.value ?? error
  return source?.data?.statusMessage || source?.statusMessage || source?.message || fallback
}

function isCurrentDevice(device: DeviceItem) {
  return device.id === currentDeviceId.value
}
</script>

<template>
  <div class="space-y-6">
    <header class="space-y-3">
      <p class="apple-section-title">
        {{ t('dashboard.header.badge') }}
      </p>
      <h1 class="apple-heading-lg">
        {{ greetingLine }}
      </h1>
      <p class="max-w-2xl apple-body text-black/60 dark:text-white/60">
        {{ t('dashboard.overview.subtitle') }}
      </p>
    </header>

    <section v-if="showInitialLoading" class="apple-card-lg p-5 space-y-3">
      <div class="flex items-center gap-2 text-sm text-black/50 dark:text-white/50">
        <TxSpinner :size="16" />
        {{ t('dashboard.overview.loading') }}
      </div>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div v-for="item in 4" :key="`overview-skeleton-${item}`" class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
      </div>
    </section>

    <template v-else>
      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="apple-card p-4">
          <p class="apple-section-title">
            {{ t('dashboard.overview.kpis.searchCount') }}
          </p>
          <p class="mt-2 text-xl font-semibold text-black dark:text-white sm:text-2xl">
            {{ formatNumber(viewModel.kpis.searches) }}
          </p>
          <p class="mt-1 text-xs text-black/50 dark:text-white/50">
            {{ t('dashboard.overview.range.last7Days') }}
          </p>
        </div>

        <div class="apple-card p-4">
          <p class="apple-section-title">
            {{ t('dashboard.overview.kpis.searchEfficiency') }}
          </p>
          <p class="mt-2 text-xl font-semibold text-black dark:text-white sm:text-2xl">
            {{ formatNumber(viewModel.kpis.avgLatency) }} ms
          </p>
          <p class="mt-1 text-xs text-black/50 dark:text-white/50">
            {{ t('dashboard.overview.kpis.avgResultsHint', { n: formatNumber(viewModel.kpis.avgResults) }) }}
          </p>
        </div>

        <div class="apple-card p-4">
          <p class="apple-section-title">
            {{ t('dashboard.overview.kpis.loginHealth') }}
          </p>
          <p class="mt-2 text-xl font-semibold text-black dark:text-white sm:text-2xl">
            {{ viewModel.kpis.login.successRate }}%
          </p>
          <p class="mt-1 text-xs text-black/50 dark:text-white/50">
            {{ t('dashboard.overview.kpis.loginSplit', { success: viewModel.kpis.login.success, failed: viewModel.kpis.login.failed }) }}
          </p>
        </div>

        <div class="apple-card p-4">
          <p class="apple-section-title">
            {{ t('dashboard.overview.kpis.activeDevices') }}
          </p>
          <p class="mt-2 text-xl font-semibold text-black dark:text-white sm:text-2xl">
            {{ formatNumber(viewModel.kpis.devices.active) }}
          </p>
          <p class="mt-1 text-xs text-black/50 dark:text-white/50">
            {{ t('dashboard.overview.kpis.activeNow', { active: viewModel.kpis.devices.active, total: viewModel.kpis.devices.total }) }}
          </p>
        </div>
      </section>

      <section class="grid gap-3 xl:grid-cols-12">
        <div class="apple-card-lg p-5 xl:col-span-8">
          <h2 class="apple-heading-sm">
            {{ t('dashboard.overview.trends.searchTitle') }}
          </h2>
          <p class="mt-1 text-xs text-black/50 dark:text-white/50">
            {{ t('dashboard.overview.trends.searchSubtitle') }}
          </p>

          <div v-if="telemetryErrorText" class="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
            <div>{{ telemetryErrorText }}</div>
            <TxButton class="mt-2" size="small" variant="secondary" @click="refreshOverview">
              {{ t('dashboard.overview.errors.retry') }}
            </TxButton>
          </div>

          <div v-else-if="!viewModel.searchTrend.hasData" class="mt-4 rounded-2xl border border-dashed border-black/[0.08] py-12 text-center text-sm text-black/50 dark:border-white/[0.08] dark:text-white/50">
            {{ t('dashboard.overview.trends.noSearchData') }}
          </div>

          <template v-else>
            <div class="mt-4 flex items-end justify-between gap-3">
              <div>
                <p class="text-3xl font-semibold text-black dark:text-white">
                  {{ formatNumber(viewModel.kpis.searches) }}
                </p>
                <p class="text-xs text-black/50 dark:text-white/50">
                  {{ t('dashboard.overview.trends.searchLegend') }}
                </p>
              </div>
            </div>

            <div class="relative mt-3 h-52 overflow-hidden rounded-2xl border border-black/[0.05] bg-black/[0.02] p-2 dark:border-white/[0.08] dark:bg-white/[0.03]">
              <div class="pointer-events-none absolute inset-0 grid grid-rows-4 px-3 py-2">
                <div v-for="line in 4" :key="`search-grid-${line}`" class="border-b border-black/[0.05] dark:border-white/[0.07]" />
              </div>
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" class="absolute inset-0 h-full w-full p-3">
                <polyline
                  :points="searchLinePoints"
                  fill="none"
                  stroke="currentColor"
                  class="text-primary"
                  stroke-width="1.7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>

            <div class="mt-3 flex items-center justify-between text-xs text-black/45 dark:text-white/45">
              <span>{{ rangeLabels[0] }}</span>
              <span>{{ rangeLabels[1] }}</span>
              <span>{{ rangeLabels[2] }}</span>
            </div>
          </template>
        </div>

        <div class="apple-card-lg p-5 xl:col-span-4">
          <h2 class="apple-heading-sm">
            {{ t('dashboard.overview.trends.latencyTitle') }}
          </h2>
          <p class="mt-1 text-xs text-black/50 dark:text-white/50">
            {{ t('dashboard.overview.trends.latencySubtitle') }}
          </p>

          <div v-if="telemetryErrorText" class="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
            {{ telemetryErrorText }}
          </div>

          <div v-else-if="!viewModel.searchTrend.hasData" class="mt-4 rounded-2xl border border-dashed border-black/[0.08] py-12 text-center text-sm text-black/50 dark:border-white/[0.08] dark:text-white/50">
            {{ t('dashboard.overview.trends.noLatencyData') }}
          </div>

          <template v-else>
            <div class="mt-4 overflow-x-auto pb-1">
              <div class="min-w-[260px]">
                <div class="h-40 flex items-end gap-1.5">
                  <div
                    v-for="point in viewModel.searchTrend.points"
                    :key="`latency-bar-${point.date}`"
                    class="flex-1 rounded-t bg-primary/80"
                    :style="{ height: `${getLatencyBarHeight(point.avgLatency)}%` }"
                    :title="`${point.date}: ${formatNumber(point.avgLatency)} ms`"
                  />
                </div>
              </div>
            </div>

            <p class="mt-3 text-xs text-black/50 dark:text-white/50">
              {{ t('dashboard.overview.trends.latencyLegend') }}
            </p>
          </template>
        </div>
      </section>

      <section class="grid gap-3 xl:grid-cols-12">
        <div class="apple-card-lg p-5 space-y-3 xl:col-span-7">
          <h2 class="apple-heading-sm">
            {{ t('dashboard.overview.stream.title') }}
          </h2>
          <p class="text-xs text-black/50 dark:text-white/50">
            {{ t('dashboard.overview.stream.subtitle') }}
          </p>

          <div v-if="historyErrorText" class="rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
            <div>{{ historyErrorText }}</div>
            <TxButton class="mt-2" size="small" variant="secondary" @click="refreshOverview">
              {{ t('dashboard.overview.errors.retry') }}
            </TxButton>
          </div>

          <div v-else-if="!viewModel.recentLogins.length" class="rounded-2xl border border-dashed border-black/[0.08] py-10 text-center text-sm text-black/50 dark:border-white/[0.08] dark:text-white/50">
            {{ t('dashboard.overview.stream.empty') }}
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="item in viewModel.recentLogins"
              :key="item.id"
              class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/[0.02] px-4 py-3 text-sm dark:bg-white/[0.03]"
            >
              <div>
                <p class="text-black dark:text-white">
                  {{ item.success ? t('dashboard.overview.stream.success') : t('dashboard.overview.stream.failed') }}
                </p>
                <p class="text-xs text-black/50 dark:text-white/50">
                  {{ formatDateTime(item.created_at) }} · {{ item.ip || t('dashboard.overview.ipUnknown') }}
                </p>
              </div>
              <span
                class="rounded-full px-2 py-0.5 text-xs"
                :class="item.success ? 'bg-green-500/20 text-green-600 dark:text-green-300' : 'bg-red-500/20 text-red-600 dark:text-red-300'"
              >
                {{ item.success ? t('dashboard.account.statusSuccess') : t('dashboard.account.statusFailed') }}
              </span>
            </div>
          </div>
        </div>

        <div class="apple-card-lg p-5 space-y-3 xl:col-span-5">
          <h2 class="apple-heading-sm">
            {{ t('dashboard.overview.devices.title') }}
          </h2>
          <p class="text-xs text-black/50 dark:text-white/50">
            {{ t('dashboard.overview.devices.subtitle') }}
          </p>

          <div v-if="devicesErrorText" class="rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
            <div>{{ devicesErrorText }}</div>
            <TxButton class="mt-2" size="small" variant="secondary" @click="refreshOverview">
              {{ t('dashboard.overview.errors.retry') }}
            </TxButton>
          </div>

          <div v-else-if="!viewModel.devices.length" class="rounded-2xl border border-dashed border-black/[0.08] py-10 text-center text-sm text-black/50 dark:border-white/[0.08] dark:text-white/50">
            {{ t('dashboard.overview.devices.empty') }}
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="device in viewModel.devices"
              :key="device.id"
              class="rounded-xl border border-black/[0.05] bg-black/[0.02] px-4 py-3 text-sm dark:border-white/[0.08] dark:bg-white/[0.03]"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-black dark:text-white">
                  {{ device.deviceName || t('dashboard.devices.unnamed') }}
                  <span
                    v-if="isCurrentDevice(device)"
                    class="ml-2 rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-600 dark:text-green-300"
                  >
                    {{ t('dashboard.overview.devices.current') }}
                  </span>
                </p>
                <p class="text-xs text-black/50 dark:text-white/50">
                  {{ formatRelativeTime(device.lastSeenAt || device.createdAt) }}
                </p>
              </div>
              <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                {{ device.platform || t('dashboard.overview.deviceUnknown') }}
              </p>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
