<script setup lang="ts">
import { computed } from 'vue'
import DashboardSparklineChart from '~/components/dashboard/DashboardSparklineChart.client.vue'
import GeoLeafletMap from '~/components/dashboard/GeoLeafletMap.client.vue'
import { formatCompactAccountLabel } from '~/utils/account-display'
import { useTypedFetch } from '~/utils/request'

defineI18nRoute(false)

interface LoginHistoryItem {
  id: string
  success: boolean
  ipMasked?: string | null
  reason?: string | null
  clientType?: string | null
  created_at: string
  location?: {
    countryCode: string | null
    regionCode: string | null
    regionName: string | null
    city: string | null
    latitude: number | null
    longitude: number | null
  } | null
}

interface DeviceItem {
  id: string
  deviceName: string | null
  platform: string | null
  clientType?: string | null
  lastSeenAt: string | null
  lastSeenIpMasked?: string | null
  createdAt: string
  revokedAt?: string | null
  lastLocation?: {
    countryCode: string | null
    regionCode: string | null
    regionName: string | null
    city: string | null
    latitude: number | null
    longitude: number | null
    updatedAt: string | null
  } | null
  lastLoginIpMasked?: string | null
  lastLoginAt?: string | null
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
  recentActivities: RecentActivityItem[]
  devices: DeviceItem[]
}

interface RecentActivityItem {
  id: string
  kind: 'login' | 'device'
  success: boolean
  title: string
  time: string
  meta: string
  location: string
}

const { t, locale } = useI18n()
const { user, pending: userPending } = useAuthUser()
const { deviceId: currentDeviceId } = useDeviceIdentity()

const rangeDays = 7

const { data: telemetryData, pending: telemetryPending, error: telemetryError, refresh: refreshTelemetry } = useTypedFetch<TelemetryOverviewResponse>('/api/dashboard/telemetry/me?days=7')
const { data: loginHistoryData, pending: historyPending, error: historyError, refresh: refreshHistory } = useTypedFetch<LoginHistoryItem[]>('/api/login-history')
const { data: devicesData, pending: devicesPending, error: devicesError, refresh: refreshDevices } = useTypedFetch<DeviceItem[]>('/api/devices')

const fallbackName = computed(() => t('dashboard.header.defaultName'))
const greetingName = computed(() => {
  if (userPending.value || !user.value)
    return fallbackName.value
  const name = user.value.name?.trim()
  return name ? t('dashboard.header.namedName', { name: formatCompactAccountLabel(name) }) : fallbackName.value
})
const greetingLine = computed(() => t('dashboard.header.greeting', { name: greetingName.value }))

const localeTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const dayFormatter = computed(() => new Intl.DateTimeFormat(localeTag.value, { month: 'numeric', day: 'numeric' }))
const regionNames = computed(() => {
  try {
    return new Intl.DisplayNames([localeTag.value], { type: 'region' })
  }
  catch {
    return null
  }
})

const allTelemetryPoints = computed<TelemetryDailyPoint[]>(() => telemetryData.value?.daily ?? [])
const currentTelemetryPoints = computed<TelemetryDailyPoint[]>(() => allTelemetryPoints.value.slice(-rangeDays))

const historyItems = computed(() => loginHistoryData.value ?? [])
const deviceItems = computed(() => devicesData.value ?? [])

const sevenDayStart = computed(() => Date.now() - 7 * 24 * 60 * 60 * 1000)
const recentSevenDayHistory = computed(() => historyItems.value.filter((item) => {
  const ts = new Date(item.created_at).getTime()
  return Number.isFinite(ts) && ts >= sevenDayStart.value
}))

const recentActivities = computed<RecentActivityItem[]>(() => {
  const loginActivities = historyItems.value.map(item => ({
    id: `login-${item.id}`,
    kind: 'login' as const,
    success: item.success,
    title: item.success ? t('dashboard.overview.stream.success') : t('dashboard.overview.stream.failed'),
    time: item.created_at,
    meta: [
      formatLoginClient(item.clientType),
      item.ipMasked || t('dashboard.overview.ipUnknown'),
    ].filter(Boolean).join(' · '),
    location: formatLoginLocation(item),
  }))

  const deviceActivities = deviceItems.value
    .filter(device => toDateValue(device.lastSeenAt || device.createdAt) > 0)
    .map(device => ({
      id: `device-${device.id}`,
      kind: 'device' as const,
      success: !device.revokedAt,
      title: t('dashboard.overview.stream.deviceAccess'),
      time: device.lastSeenAt || device.createdAt,
      meta: [
        device.deviceName || t('dashboard.devices.unnamed'),
        formatDevicePlatform(device.platform),
        device.lastSeenIpMasked || device.lastLoginIpMasked || t('dashboard.overview.ipUnknown'),
      ].filter(Boolean).join(' · '),
      location: formatDeviceLocation(device),
    }))

  return [...loginActivities, ...deviceActivities]
    .sort((a, b) => toDateValue(b.time) - toDateValue(a.time))
    .slice(0, 5)
})

const recentLoginMapPoints = computed(() => {
  return historyItems.value
    .filter(item => item.success && Number.isFinite(item.location?.latitude) && Number.isFinite(item.location?.longitude))
    .slice(0, 30)
    .map(item => ({
      id: item.id,
      label: formatLoginLocation(item),
      latitude: item.location?.latitude ?? null,
      longitude: item.location?.longitude ?? null,
      value: 1,
    }))
})

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

const latencyTrendMax = computed(() => {
  const values = currentTelemetryPoints.value.map(point => point.avgLatency)
  return Math.max(1, ...values)
})

const searchTrendValues = computed(() => currentTelemetryPoints.value.map(point => point.searches))

const rangeLabels = computed<string[]>(() => {
  const keys = currentTelemetryPoints.value.map(point => point.date)
  if (!keys.length)
    return []

  const first = keys[0] ?? ''
  const middle = keys[Math.floor((keys.length - 1) / 2)] ?? first
  const last = keys[keys.length - 1] ?? middle

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
  recentActivities: recentActivities.value,
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

function formatLoginClient(value: string | null | undefined): string {
  const normalized = typeof value === 'string' ? value.toLowerCase() : ''
  if (normalized === 'cli')
    return t('dashboard.account.clientTypes.cli', 'CLI')
  if (normalized === 'external')
    return t('dashboard.account.clientTypes.external', 'External')
  if (normalized === 'web')
    return t('dashboard.account.clientTypes.web', 'Web')
  if (normalized === 'app')
    return t('dashboard.account.clientTypes.app', 'App')
  return t('dashboard.account.clientTypes.unknown', '未知来源')
}

function formatDevicePlatform(value: string | null | undefined): string {
  if (!value)
    return t('dashboard.overview.deviceUnknown')

  return value
}

function formatDevicePreviewName(device: DeviceItem): string {
  return device.deviceName || t('dashboard.devices.unnamed')
}

function getDeviceBrandIcon(device: DeviceItem): string {
  const value = `${device.platform || ''} ${device.deviceName || ''} ${device.clientType || ''}`.toLowerCase()
  if (value.includes('mac') || value.includes('darwin') || value.includes('iphone') || value.includes('ipad') || value.includes('ios'))
    return 'i-cib-apple'
  if (value.includes('win'))
    return 'i-cib-windows'
  if (value.includes('linux'))
    return 'i-cib-linux'
  if (value.includes('android'))
    return 'i-cib-android'
  if (value.includes('safari'))
    return 'i-cib-safari'
  if (value.includes('edge'))
    return 'i-cib-microsoft-edge'
  if (value.includes('web'))
    return 'i-carbon-application-web'
  return 'i-carbon-devices'
}

function formatLoginLocation(item: LoginHistoryItem): string {
  const location = item.location
  if (!location) {
    return t('dashboard.devices.locationUnknown', '位置未知')
  }
  const country = location.countryCode ? regionNames.value?.of(location.countryCode) || location.countryCode : null
  const pieces = [country, location.regionName || location.regionCode, location.city].filter(Boolean)
  return pieces.length ? pieces.join(' · ') : t('dashboard.devices.locationUnknown', '位置未知')
}

function formatDeviceLocation(device: DeviceItem): string {
  const location = device.lastLocation
  if (!location) {
    return t('dashboard.devices.locationUnknown', '位置未知')
  }
  const country = location.countryCode ? regionNames.value?.of(location.countryCode) || location.countryCode : null
  const pieces = [country, location.regionName || location.regionCode, location.city].filter(Boolean)
  return pieces.length ? pieces.join(' · ') : t('dashboard.devices.locationUnknown', '位置未知')
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
  <div class="space-y-5">
    <header class="space-y-2">
      <h1 class="DashboardOverview-Heading apple-heading-lg">
        {{ greetingLine }}
      </h1>
      <p class="max-w-2xl apple-body text-black/60 dark:text-white/60">
        {{ t('dashboard.overview.subtitle') }}
      </p>
    </header>

    <section v-if="showInitialLoading" class="apple-card-lg p-4 space-y-3">
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
        <TxStatCard
          :value="formatNumber(viewModel.kpis.searches)"
          :label="t('dashboard.overview.kpis.searchCount')"
          icon-class="i-carbon-search text-5xl text-[var(--tx-color-primary)] sm:text-6xl"
        >
          <template #label>
            <div class="space-y-1">
              <span class="block">{{ t('dashboard.overview.kpis.searchCount') }}</span>
              <span class="block text-[11px] text-black/45 dark:text-white/45">
                {{ t('dashboard.overview.range.last7Days') }}
              </span>
            </div>
          </template>
        </TxStatCard>

        <TxStatCard
          :value="`${formatNumber(viewModel.kpis.avgLatency)} ms`"
          :label="t('dashboard.overview.kpis.searchEfficiency')"
          icon-class="i-carbon-meter text-5xl text-[var(--tx-color-success)] sm:text-6xl"
        >
          <template #label>
            <div class="space-y-1">
              <span class="block">{{ t('dashboard.overview.kpis.searchEfficiency') }}</span>
              <span class="block text-[11px] text-black/45 dark:text-white/45">
                {{ t('dashboard.overview.kpis.avgResultsHint', { n: formatNumber(viewModel.kpis.avgResults) }) }}
              </span>
            </div>
          </template>
        </TxStatCard>

        <TxStatCard
          :value="`${viewModel.kpis.login.successRate}%`"
          :label="t('dashboard.overview.kpis.loginHealth')"
          icon-class="i-carbon-security text-5xl text-[var(--tx-color-warning)] sm:text-6xl"
        >
          <template #label>
            <div class="space-y-1">
              <span class="block">{{ t('dashboard.overview.kpis.loginHealth') }}</span>
              <span class="block text-[11px] text-black/45 dark:text-white/45">
                {{ t('dashboard.overview.kpis.loginSplit', { success: viewModel.kpis.login.success, failed: viewModel.kpis.login.failed }) }}
              </span>
            </div>
          </template>
        </TxStatCard>

        <TxStatCard
          :value="formatNumber(viewModel.kpis.devices.active)"
          :label="t('dashboard.overview.kpis.activeDevices')"
          icon-class="i-carbon-devices text-5xl text-[var(--tx-color-info)] sm:text-6xl"
        >
          <template #label>
            <div class="space-y-1">
              <span class="block">{{ t('dashboard.overview.kpis.activeDevices') }}</span>
              <span class="block text-[11px] text-black/45 dark:text-white/45">
                {{ t('dashboard.overview.kpis.activeNow', { active: viewModel.kpis.devices.active, total: viewModel.kpis.devices.total }) }}
              </span>
            </div>
          </template>
        </TxStatCard>
      </section>

      <section class="grid gap-3 xl:grid-cols-12">
        <div class="apple-card-lg p-4 xl:col-span-8">
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

            <div class="mt-3 overflow-hidden rounded-2xl border border-black/[0.05] bg-black/[0.02] p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
              <DashboardSparklineChart
                :values="searchTrendValues"
                :labels="rangeLabels"
                :height="152"
                color="var(--tx-color-primary, #409eff)"
                :aria-label="t('dashboard.overview.trends.searchTitle')"
                show-grid
              />
            </div>

            <div class="mt-3 flex items-center justify-between text-xs text-black/45 dark:text-white/45">
              <span>{{ rangeLabels[0] }}</span>
              <span>{{ rangeLabels[1] }}</span>
              <span>{{ rangeLabels[2] }}</span>
            </div>
          </template>
        </div>

        <div class="apple-card-lg p-4 xl:col-span-4">
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
                <div class="h-32 flex items-end gap-1.5">
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
        <div class="apple-card-lg p-4 space-y-3 xl:col-span-8">
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

          <div v-else-if="!viewModel.recentActivities.length" class="rounded-2xl border border-dashed border-black/[0.08] py-10 text-center text-sm text-black/50 dark:border-white/[0.08] dark:text-white/50">
            {{ t('dashboard.overview.stream.empty') }}
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="item in viewModel.recentActivities"
              :key="item.id"
              class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/[0.02] px-4 py-3 text-sm dark:bg-white/[0.03]"
            >
              <div>
                <p class="text-black dark:text-white">
                  {{ item.title }}
                </p>
                <p class="text-xs text-black/50 dark:text-white/50">
                  {{ formatDateTime(item.time) }} · {{ item.meta }}
                </p>
                <p class="text-xs text-black/45 dark:text-white/45">
                  {{ item.location }}
                </p>
              </div>
              <span
                class="rounded-full px-2 py-0.5 text-xs"
                :class="item.success ? 'bg-green-500/20 text-green-600 dark:text-green-300' : 'bg-red-500/20 text-red-600 dark:text-red-300'"
              >
                {{ item.kind === 'device' ? t('dashboard.overview.stream.device') : item.success ? t('dashboard.account.statusSuccess') : t('dashboard.account.statusFailed') }}
              </span>
            </div>
          </div>

          <div v-if="recentLoginMapPoints.length" class="rounded-2xl border border-black/[0.05] bg-black/[0.03] p-2 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <GeoLeafletMap
              :height="220"
              :points="recentLoginMapPoints"
            />
          </div>
        </div>

        <div class="apple-card-lg p-4 space-y-3 xl:col-span-4">
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
              class="DashboardOverviewDevice"
            >
              <div class="DashboardOverviewDevice-Brand">
                <div class="DashboardOverviewDevice-Icon">
                  <span :class="getDeviceBrandIcon(device)" aria-hidden="true" />
                </div>
              </div>

              <div class="DashboardOverviewDevice-Content">
                <div class="DashboardOverviewDevice-TitleRow">
                  <p class="DashboardOverviewDevice-Title">
                    <span class="DashboardOverviewDevice-TitleName truncate">{{ formatDevicePreviewName(device) }}</span>
                  </p>
                  <div class="DashboardOverviewDevice-Meta">
                    <span
                      v-if="isCurrentDevice(device)"
                      class="DashboardOverviewDevice-Badge"
                    >
                      {{ t('dashboard.overview.devices.current') }}
                    </span>
                    <span class="DashboardOverviewDevice-Time">
                      {{ formatRelativeTime(device.lastSeenAt || device.createdAt) }}
                    </span>
                  </div>
                </div>
                <p class="DashboardOverviewDevice-Platform">
                  {{ formatDevicePlatform(device.platform) }}
                </p>
                <p class="DashboardOverviewDevice-Subtle">
                  {{ formatDeviceLocation(device) }}
                  <span v-if="device.lastSeenIpMasked || device.lastLoginIpMasked"> · {{ device.lastSeenIpMasked || device.lastLoginIpMasked }}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.DashboardOverview-Heading {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.DashboardOverviewDevice {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 12px;
  border: 1px solid rgb(0 0 0 / 0.05);
  border-radius: 12px;
  background: rgb(0 0 0 / 0.02);
  padding: 12px;
  font-size: 14px;
}

.dark .DashboardOverviewDevice {
  border-color: rgb(255 255 255 / 0.08);
  background: rgb(255 255 255 / 0.03);
}

.DashboardOverviewDevice-Brand {
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.DashboardOverviewDevice-Icon {
  display: flex;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgb(0 0 0 / 0.04);
  color: rgb(0 0 0 / 0.7);
  font-size: 22px;
}

.dark .DashboardOverviewDevice-Icon {
  background: rgb(255 255 255 / 0.06);
  color: rgb(255 255 255 / 0.75);
}

.DashboardOverviewDevice-Content {
  min-width: 0;
}

.DashboardOverviewDevice-TitleRow {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.DashboardOverviewDevice-Title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: rgb(0 0 0);
  font-weight: 600;
  line-height: 1.35;
}

.dark .DashboardOverviewDevice-Title {
  color: rgb(255 255 255);
}

.DashboardOverviewDevice-TitleName {
  display: block;
  min-width: 0;
  max-width: 100%;
}

.DashboardOverviewDevice-Meta {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  max-width: 44%;
}

.DashboardOverviewDevice-Badge {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  border-radius: 999px;
  background: rgb(34 197 94 / 0.2);
  padding: 2px 8px;
  color: rgb(22 163 74);
  font-size: 12px;
  line-height: 1.25;
  white-space: nowrap;
}

.dark .DashboardOverviewDevice-Badge {
  color: rgb(134 239 172);
}

.DashboardOverviewDevice-Time {
  flex: 0 0 auto;
  color: rgb(0 0 0 / 0.5);
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
}

.dark .DashboardOverviewDevice-Time {
  color: rgb(255 255 255 / 0.5);
}

.DashboardOverviewDevice-Platform,
.DashboardOverviewDevice-Subtle {
  margin: 4px 0 0;
  color: rgb(0 0 0 / 0.5);
  font-size: 12px;
  line-height: 1.45;
}

.DashboardOverviewDevice-Subtle {
  color: rgb(0 0 0 / 0.45);
  overflow-wrap: anywhere;
}

.dark .DashboardOverviewDevice-Platform {
  color: rgb(255 255 255 / 0.5);
}

.dark .DashboardOverviewDevice-Subtle {
  color: rgb(255 255 255 / 0.45);
}

@media (max-width: 420px) {
  .DashboardOverviewDevice {
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 10px;
    padding: 12px;
  }

  .DashboardOverviewDevice-Icon {
    width: 38px;
    height: 38px;
    font-size: 20px;
  }

  .DashboardOverviewDevice-TitleRow {
    flex-direction: column;
    gap: 6px;
  }

  .DashboardOverviewDevice-Meta {
    justify-content: flex-start;
    max-width: 100%;
  }
}
</style>
