<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxCard } from '@talex-touch/tuffex/card'
import { TxBarChart, TxBubbleMap, TxChoroplethMap, TxChartLegendItem, TxPieChart } from '@talex-touch/tuffex/charts'
import type { MapGeoJson } from '@talex-touch/tuffex/charts'
import { TxCheckbox } from '@talex-touch/tuffex/checkbox'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TxFlatRadio, TxFlatRadioItem } from '@talex-touch/tuffex/flat-radio'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxSelect, TxSelectItem } from '@talex-touch/tuffex/select'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { TxStatCard } from '@talex-touch/tuffex/stat-card'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import AdminPageShell from '~/components/admin/AdminPageShell.vue'
import { useAdminAnalyticsData } from '~/composables/useAdminAnalyticsData'
import type { GeoAnalyticsData } from '~/types/admin-analytics'
import {
  formatAnalyticsCategoryKey, formatAnalyticsCategoryLabel, formatAnalyticsDateTime, formatAnalyticsDuration,
  formatAnalyticsNumber, formatExchangeRate, formatPayloadPreview, toSortedAnalyticsList,
} from '~/utils/admin-analytics'
import { requestJson } from '~/utils/request'

definePageMeta({
  layout: 'admin',
  requiresAuth: true,
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
const { isAdmin } = useAccountRole()

watch(isAdmin, (admin) => {
  if (user.value && !admin) {
    navigateTo('/dashboard/overview')
  }
}, { immediate: true })


const selectedDays = ref(30)
const selectedGeoCountry = ref<string | null>(null)
/**
 * `TxSelect` values are `string | number`, so "every version" is a sentinel
 * rather than `null`; `versionScope` is the value the API and the map read.
 */
const ALL_VERSIONS = '__all__'
const selectedVersion = ref<string>(ALL_VERSIONS)
const versionScope = computed<string | null>(() => (selectedVersion.value === ALL_VERSIONS ? null : selectedVersion.value))
const exchangeTarget = ref('CNY')
const exchangeLimit = ref(20)
const exchangeView = ref<'history' | 'snapshots'>('history')
const exchangeIncludePayload = ref(false)
const docsPath = ref('')
const docsSource = ref<'all' | 'docs_page' | 'doc_comments_admin'>('all')
const loadedVersionDays = ref<number | null>(null)
const loadedGeoQueryKey = ref<string | null>(null)
const {
  analytics, loading, error, geoAnalytics, geoLoading, geoError, messages, messagesLoading, messagesError,
  versionAnalytics, versionLoading, versionError,
  docsAnalytics, docsLoading, docsError, intelligenceAnalytics, intelligenceLoading, intelligenceError,
  exchangeHistory, exchangeSnapshots, exchangeLoading, exchangeError,
  fetchAnalytics: loadAnalytics, fetchGeoAnalytics: loadGeoAnalytics, fetchVersionAnalytics: loadVersionAnalytics,
  fetchDocsAnalytics: loadDocsAnalytics,
  fetchIntelligenceAnalytics: loadIntelligenceAnalytics, fetchMessages: loadMessages, fetchExchangeHistory: loadExchangeHistory,
} = useAdminAnalyticsData({ request: requestJson })
/**
 * The section lives in the URL, not in local state: `route.query` is the single
 * source of truth, so back/forward work, a deep link lands on its panel, and the
 * tab strip below the header cannot disagree with the address bar.
 *
 * The seven panels are one page's worth of state over one payload, so the strip
 * switches panels instead of navigating somewhere else.
 */
type AnalyticsSection = 'overview' | 'performance' | 'search' | 'intelligence' | 'docs' | 'exchange' | 'messages'

const ANALYTICS_SECTIONS = ['overview', 'performance', 'search', 'intelligence', 'docs', 'exchange', 'messages'] as const

const activeSection = computed<AnalyticsSection>({
  get() {
    const requested = typeof route.query.section === 'string' ? route.query.section : ''
    return (ANALYTICS_SECTIONS as readonly string[]).includes(requested)
      ? requested as AnalyticsSection
      : 'overview'
  },
  set(value) {
    // `replace` so flipping sections does not stack history entries the Back
    // button then has to walk back through one panel at a time.
    navigateTo({ query: { ...route.query, section: value } }, { replace: true })
  },
})
/**
 * The radio emits `string | number` and, because the component also serves
 * multi-select callers, a possible array; the section union narrows the single
 * value and the array is ignored (this group is single-select). Unknown values
 * fall back to `overview` in the setter's `get`, so an out-of-range value cannot
 * put the page on a panel that does not exist.
 */
function setActiveSection(value: string | number | (string | number)[]): void {
  if (Array.isArray(value))
    return
  activeSection.value = value as AnalyticsSection
}

const showBreakdown = ref(false)
const activeBreakdownTab = ref<'search' | 'usage'>('search')
const versionPalette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']
const analyticsSections = [
  { id: 'overview', icon: 'i-carbon-dashboard' },
  { id: 'performance', icon: 'i-carbon-meter' },
  { id: 'search', icon: 'i-carbon-search' },
  { id: 'intelligence', icon: 'i-carbon-ai-status' },
  { id: 'docs', icon: 'i-carbon-document' },
  { id: 'exchange', icon: 'i-carbon-currency' },
  { id: 'messages', icon: 'i-carbon-warning' },
] as const

/**
 * One entry per panel for the header selector. The rail links this page once
 * (`/admin/analytics`) instead of per panel, and `AdminNav.routing.test.ts`
 * pins exactly that one entry, so a panel removed here cannot leave a rail
 * link pointing at a section the page no longer accepts.
 */
const analyticsTabs = computed(() => analyticsSections.map(section => ({
  value: section.id as AnalyticsSection,
  label: t(`dashboard.sections.analytics.sections.${section.id}`),
  icon: section.icon,
})))

/**
 * The heading names the panel you are on, next to the tab strip that switches
 * it. Both read the same key the rail uses, so the three cannot drift.
 */
const activeSectionLabel = computed(() => {
  const section = analyticsSections.find(entry => entry.id === activeSection.value)
  if (!section)
    return t('dashboard.sections.analytics.title')
  return t(`dashboard.sections.analytics.sections.${section.id}`)
})
const topModuleLoads = computed(() => analytics.value?.summary.moduleLoadMetrics.slice(0, 10) ?? [])
/**
 * One card per metric: the 24h figure is the headline and the rolling-window
 * total sits next to it. Eight tiles (four 24h + four 30d) said the same thing
 * twice and pushed the charts below the fold.
 */
const kpiCards = computed(() => {
  const realtime = analytics.value?.realtime
  const summary = analytics.value?.summary
  return [
    {
      key: 'active-users',
      label: t('dashboard.sections.analytics.kpi.activeUsers'),
      icon: 'i-carbon-user-multiple text-[var(--tx-color-info)]',
      value: formatNumber(realtime?.activeUsers ?? 0),
      total: t('dashboard.sections.analytics.kpi.totalUsers', { count: formatNumber(summary?.totalUsers ?? 0) }),
    },
    {
      key: 'visits',
      label: t('dashboard.sections.analytics.kpi.visits'),
      icon: 'i-carbon-view text-[var(--tx-color-success)]',
      value: formatNumber(realtime?.visitsLast24h ?? 0),
      total: t('dashboard.sections.analytics.kpi.uploadedEvents', { count: formatNumber(summary?.totalEvents ?? 0) }),
    },
    {
      key: 'searches',
      label: t('dashboard.sections.analytics.kpi.searches'),
      icon: 'i-carbon-search text-[var(--tx-color-warning)]',
      value: formatNumber(realtime?.searchesLast24h ?? 0),
      total: t('dashboard.sections.analytics.kpi.totalSearches', { count: formatNumber(summary?.totalSearches ?? 0) }),
    },
    {
      key: 'avg-latency',
      label: t('dashboard.sections.analytics.kpi.avgLatency'),
      icon: 'i-carbon-time text-[var(--tx-color-danger)]',
      value: `${realtime?.avgLatency ?? 0}ms`,
      total: t('dashboard.sections.analytics.kpi.avgSearch', { duration: summary?.avgSearchDuration ?? 0 }),
    },
  ]
})
const regionDisplayNames = computed(() => {
  try {
    return new Intl.DisplayNames([locale.value], { type: 'region' })
  }
  catch {
    return null
  }
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
  return { series }
})
const hasHourlyData = computed(() => hourlySeries.value.series.some(item => item.count > 0))
const versionSegments = computed(() => {
  const distribution = analytics.value?.summary.versionDistribution ?? {}
  const entries = Object.entries(distribution).filter(([, count]) => count > 0)
  const total = entries.reduce((sum, [, count]) => sum + count, 0)
  if (!total) {
    return { total: 0, segments: [] }
  }

  const maxSegments = 6
  const sorted = entries.sort((a, b) => b[1] - a[1])
  const main = sorted.slice(0, maxSegments)
  const remainder = sorted.slice(maxSegments).reduce((sum, [, count]) => sum + count, 0)
  const segments = remainder > 0 ? [...main, ['others', remainder] as [string, number]] : main

  const mapped = segments.map(([key, count], index) => ({
    key,
    count,
    ratio: count / total,
    color: versionPalette[index % versionPalette.length],
  }))

  return { total, segments: mapped }
})
const topProviderMetrics = computed(() => analytics.value?.summary.providerMetrics.slice(0, 12) ?? [])
const searchSlowRate = computed(() => {
  const searches = analytics.value?.summary.totalSearches ?? 0
  if (!searches)
    return 0
  return Number((((analytics.value?.summary.searchSlowCount ?? 0) / searches) * 100).toFixed(1))
})
/**
 * Chart inputs for the overview panels. Every panel below renders a tuffex
 * chart component, so the page owns data shaping and nothing else.
 */
const dailyActivityChart = computed(() => {
  // Charts read left→right, so oldest first — the list this replaced was newest first.
  const days = [...(analytics.value?.summary.dailyStats ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  return {
    categories: days.map(day => day.date.slice(5)),
    series: [
      { name: t('dashboard.sections.analytics.charts.visits'), data: days.map(day => day.visits), color: '#3b82f6' },
      { name: t('dashboard.sections.analytics.charts.searches'), data: days.map(day => day.searches), color: '#a855f7' },
    ],
  }
})
const versionChartData = computed(() =>
  versionSegments.value.segments.map(segment => ({ name: segment.key, value: segment.count })),
)
const hourlyChart = computed(() => ({
  categories: hourLabels,
  series: [{ name: t('dashboard.sections.analytics.charts.events'), data: hourlySeries.value.series.map(item => item.count) }],
}))

/**
 * The tuffex maps join regions on a GeoJSON feature property, and the vendored
 * collection (`public/geo`, so no third-party origin at render time) only
 * carries `name` — a country code therefore has to be resolved to that exact
 * spelling before it can colour a region.
 */
const worldGeoJson = shallowRef<MapGeoJson | null>(null)
const worldGeoJsonFailed = ref(false)
const geoJsonNameIndex = computed(() => {
  const index = new Map<string, string>()
  for (const feature of worldGeoJson.value?.features ?? []) {
    const name = feature.properties?.name
    if (typeof name === 'string')
      index.set(name.toLowerCase(), name)
  }
  return index
})
/** Codes whose `Intl.DisplayNames` label is not the GeoJSON spelling. */
const REGION_NAME_ALIASES: Record<string, string> = {
  US: 'United States of America',
  GB: 'United Kingdom',
  KR: 'South Korea',
  RU: 'Russia',
  CZ: 'Czechia',
  VN: 'Vietnam',
}
function resolveGeoJsonName(code: string): string | null {
  const upper = code.toUpperCase()
  let display: string | null = null
  try {
    display = new Intl.DisplayNames(['en'], { type: 'region' }).of(upper) ?? null
  }
  catch {
    display = null
  }
  for (const candidate of [REGION_NAME_ALIASES[upper], display, upper]) {
    if (!candidate)
      continue
    const hit = geoJsonNameIndex.value.get(candidate.toLowerCase())
    if (hit)
      return hit
  }
  return null
}
interface RegionMapRow {
  code: string
  label: string
  count: number
  geoName: string
}
interface CountryMapRow extends RegionMapRow {
  countryCode: string
}
const geoCountryMapRows = computed<CountryMapRow[]>(() =>
  geoCountries.value
    .map(country => ({
      countryCode: country.countryCode,
      code: country.countryCode.toUpperCase(),
      label: country.countryCode,
      count: country.count,
      geoName: resolveGeoJsonName(country.countryCode),
    }))
    .filter((row): row is CountryMapRow => Boolean(row.geoName)),
)
interface GeoMapPoint {
  id: string
  label: string
  countryCode: string
  latitude: number | null
  longitude: number | null
  value: number
}
interface PlacedGeoMapPoint extends GeoMapPoint {
  latitude: number
  longitude: number
}
const geoMapPoints = computed<PlacedGeoMapPoint[]>(() => {
  const points: GeoMapPoint[] = selectedGeoCountry.value
    ? geoSubdivisions.value.map(item => ({
        id: `${item.countryCode}:${item.regionCode || item.regionName || 'unknown'}`,
        label: resolveSubdivisionLabel(item),
        countryCode: item.countryCode,
        latitude: item.latitude,
        longitude: item.longitude,
        value: item.count,
      }))
    : geoCountries.value.map(item => ({
        id: item.countryCode,
        label: item.countryCode,
        countryCode: item.countryCode,
        latitude: item.latitude,
        longitude: item.longitude,
        value: item.count,
      }))
  // Bubbles with no coordinates cannot be placed; dropping them here keeps the
  // "no data" state honest instead of drawing an empty map.
  return points.filter((point): point is PlacedGeoMapPoint =>
    Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
  )
})
const geoCountries = computed(() => geoAnalytics.value?.countries ?? [])
const geoSubdivisions = computed(() => geoAnalytics.value?.subdivisions ?? [])
const geoTopIps = computed(() => geoAnalytics.value?.topIps.slice(0, 12) ?? [])
/**
 * The version panel's selector, chart and rows all read one response, so the
 * three cannot disagree about which versions exist.
 */
const versionOptions = computed(() => (versionAnalytics.value?.versions ?? []).map(row => ({
  value: row.version,
  label: `${row.version} · ${formatNumber(row.visits)}`,
})))
const versionScopeLabel = computed(() => versionScope.value ?? t('dashboard.sections.analytics.versions.allVersions'))
const allVersionsLabel = computed(() => t('dashboard.sections.analytics.versions.allVersionsCount', {
  count: formatNumber(versionAnalytics.value?.summary.versionCount ?? 0),
}))
const versionUsageChart = computed(() => {
  // Top slice only: past a dozen bars the labels stop being readable, and the
  // list below carries every version in range anyway.
  const rows = (versionAnalytics.value?.versions ?? []).slice(0, 12)
  return {
    categories: rows.map(row => row.version),
    series: [
      { name: t('dashboard.sections.analytics.charts.visits'), data: rows.map(row => row.visits), color: '#3b82f6' },
      { name: t('dashboard.sections.analytics.charts.searches'), data: rows.map(row => row.searches), color: '#a855f7' },
    ],
  }
})
/** Clicking the scoped row again clears the scope, the way a chip toggles. */
function selectVersion(version: string): void {
  selectedVersion.value = selectedVersion.value === version ? ALL_VERSIONS : version
}
function formatCompactDate(value: string | null): string {
  return value ? value.slice(0, 10) : '—'
}
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
    return t('dashboard.sections.analytics.common.unknown')
  }
  return regionDisplayNames.value?.of(countryCode) ?? countryCode
}

function resolveSubdivisionLabel(item: GeoAnalyticsData['subdivisions'][number]): string {
  return item.regionName || item.regionCode || t('dashboard.sections.analytics.common.unknown')
}

async function fetchAnalytics(): Promise<void> {
  await loadAnalytics(selectedDays.value)
}

function currentGeoAnalyticsKey(): string {
  return JSON.stringify([selectedDays.value, selectedGeoCountry.value, versionScope.value])
}

async function fetchGeoAnalytics(): Promise<void> {
  const queryKey = currentGeoAnalyticsKey()
  await loadGeoAnalytics(selectedDays.value, selectedGeoCountry.value, versionScope.value)
  if (!geoError.value && currentGeoAnalyticsKey() === queryKey)
    loadedGeoQueryKey.value = queryKey
  if (activeSection.value === 'overview' && currentGeoAnalyticsKey() !== queryKey)
    ensureOverviewAnalytics()
}

async function fetchVersionAnalytics(): Promise<void> {
  const days = selectedDays.value
  await loadVersionAnalytics(days)
  if (!versionError.value && selectedDays.value === days)
    loadedVersionDays.value = days
  if (activeSection.value === 'overview' && selectedDays.value !== days)
    ensureOverviewAnalytics()
}

function ensureOverviewAnalytics(): void {
  if (loadedVersionDays.value !== selectedDays.value && !versionLoading.value)
    void fetchVersionAnalytics()
  if (loadedGeoQueryKey.value !== currentGeoAnalyticsKey() && !geoLoading.value)
    void fetchGeoAnalytics()
  void fetchWorldGeoJson()
}

async function fetchDocsAnalytics(): Promise<void> {
  await loadDocsAnalytics(selectedDays.value, docsPath.value, docsSource.value)
}

async function fetchIntelligenceAnalytics(): Promise<void> {
  await loadIntelligenceAnalytics(selectedDays.value)
}

async function fetchMessages(): Promise<void> {
  await loadMessages()
}

async function fetchExchangeHistory(): Promise<void> {
  await loadExchangeHistory(exchangeView.value, exchangeTarget.value, exchangeLimit.value, exchangeIncludePayload.value)
}

onMounted(() => {
  // `section` is no longer seeded here — `activeSection` reads the query
  // directly, so a deep link is already on the right panel before mount.
  const initialPath = typeof route.query.path === 'string' ? route.query.path.trim() : ''
  if (initialPath)
    docsPath.value = initialPath.toLowerCase()

  const initialSource = typeof route.query.source === 'string' ? route.query.source : ''
  if (initialSource === 'docs_page' || initialSource === 'doc_comments_admin')
    docsSource.value = initialSource

  // The shared summary feeds all seven panels. Overview alone owns the
  // additional version, geography, and local map payloads.
  void fetchAnalytics()
  if (activeSection.value === 'overview')
    ensureOverviewAnalytics()
  if (activeSection.value === 'docs')
    void fetchDocsAnalytics()
  if (activeSection.value === 'intelligence')
    void fetchIntelligenceAnalytics()
  if (activeSection.value === 'messages')
    void fetchMessages()
  if (activeSection.value === 'exchange')
    void fetchExchangeHistory()
})

watch(selectedDays, () => {
  fetchAnalytics()
  if (activeSection.value === 'overview')
    ensureOverviewAnalytics()
  if (activeSection.value === 'docs')
    void fetchDocsAnalytics()
  if (activeSection.value === 'intelligence')
    void fetchIntelligenceAnalytics()
})

// Both scopes feed the same overview-only `geo` response. Hidden panels do not
// pay for a query they cannot render.
watch([selectedGeoCountry, selectedVersion], () => {
  if (activeSection.value === 'overview')
    ensureOverviewAnalytics()
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
  if (section === 'overview')
    ensureOverviewAnalytics()
  if (section === 'messages' && !messages.value?.length && !messagesLoading.value)
    fetchMessages()
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
const formatNumber = formatAnalyticsNumber
const toSortedList = toSortedAnalyticsList
const formatCategoryLabel = formatAnalyticsCategoryLabel
const formatCategoryKey = formatAnalyticsCategoryKey
const formatMessageTime = (value: string) => formatAnalyticsDateTime(value, locale.value, value)
const formatExchangeTime = (value: number | null | undefined) => value ? formatAnalyticsDateTime(value, locale.value) : '-'
const formatRate = formatExchangeRate
const formatDuration = formatAnalyticsDuration


function drilldownCountry(countryCode: string) {
  if (!countryCode || countryCode === 'Unknown') {
    return
  }
  selectedGeoCountry.value = countryCode
}

function resetGeoDrilldown() {
  selectedGeoCountry.value = null
}

function handleMapPointClick(point: { countryCode: string }) {
  // Country view drills in; subdivision view toggles back out.
  if (selectedGeoCountry.value && selectedGeoCountry.value === point.countryCode) {
    resetGeoDrilldown()
    return
  }
  drilldownCountry(point.countryCode)
}

// Plain-function view of `$fetch`: Nitro's typed-route inference explodes on
// arbitrary static assets (TS2589), and the GeoJSON is a plain file.
const fetchGeoJson = $fetch as (url: string) => Promise<MapGeoJson>
async function fetchWorldGeoJson() {
  // Section switches call this repeatedly; the file never changes at runtime.
  if (worldGeoJson.value || worldGeoJsonFailed.value)
    return
  try {
    worldGeoJson.value = await fetchGeoJson('/geo/world-countries.geo.json')
  }
  catch {
    worldGeoJsonFailed.value = true
  }
}


function openDocAnalyticsPath(path: string) {
  docsPath.value = path
  activeSection.value = 'docs'
}

const hourLabels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`)
</script>

<template>
  <AdminPageShell :title="activeSectionLabel">
    <template #actions>
      <ClientOnly>
        <TxSelect v-model="selectedDays" class="w-44">
          <TxSelectItem :value="7" :label="t('dashboard.sections.analytics.last7Days')" />
          <TxSelectItem :value="30" :label="t('dashboard.sections.analytics.last30Days')" />
          <TxSelectItem :value="90" :label="t('dashboard.sections.analytics.last90Days')" />
        </TxSelect>
        <template #fallback>
          <div class="w-full rounded-xl bg-black/[0.04] px-3 py-2 text-xs text-black/60 dark:bg-white/[0.08] dark:text-white/60 sm:w-44">
            {{ t('dashboard.sections.analytics.last30Days') }}
          </div>
        </template>
      </ClientOnly>
    </template>

    <div class="space-y-6">
    <!--
      One radio for all seven panels, over data this page already holds: the rail
      links into the page once, and once you are here this selector is the cheap
      move — the address stays on this page and back/forward still work because
      the section lives in `?section=`. The box scrolls rather than wraps at
      narrow widths, and its negative margins hand the thumb's shadow back the
      room `overflow-x` would otherwise clip.
    -->
    <div class="-mx-1 -my-2 overflow-x-auto px-1 py-2">
      <TxFlatRadio
        :model-value="activeSection"
        size="md"
        @update:model-value="setActiveSection"
      >
        <TxFlatRadioItem
          v-for="item in analyticsTabs"
          :key="item.value"
          :value="item.value"
          :label="item.label"
          :icon="item.icon"
        />
      </TxFlatRadio>
    </div>

    <div v-if="loading" class="space-y-5">
      <div v-if="activeSection === 'overview'" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TxCard
          v-for="card in 4"
          :key="`realtime-skeleton-${card}`"
          variant="plain"
          background="mask"
          :radius="16"
          :padding="16"
        >
          <TxSkeleton :loading="true" :lines="2" />
        </TxCard>
      </div>
      <TxCard variant="plain" background="mask" :radius="18" :padding="20">
        <TxSkeleton :loading="true" :lines="6" />
      </TxCard>
    </div>

    <TxCard v-else-if="error" variant="plain" background="mask" :radius="18" :padding="24" class="text-center">
      <TxEmptyState
        variant="error"
        :title="t('common.error')"
        :description="error"
      />
      <div class="mt-4 flex justify-center">
        <TxButton variant="secondary" size="sm" native-type="button" @click="fetchAnalytics">
          {{ t('common.retry') }}
        </TxButton>
      </div>
    </TxCard>

    <section v-else-if="analytics" class="space-y-6">
      <!-- KPI Cards: the 24h figure is the headline, the rolling total sits beside it -->
      <div v-if="activeSection === 'overview'" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TxStatCard
          v-for="card in kpiCards"
          :key="card.key"
          :label="card.label"
          :icon-class="card.icon"
          :value="card.value"
        >
          <template #value>
            <div class="flex flex-wrap items-baseline gap-x-2">
              <span>{{ card.value }}</span>
              <span class="text-xs font-medium text-black/45 dark:text-white/45">{{ card.total }}</span>
            </div>
          </template>
        </TxStatCard>
      </div>

      <div class="space-y-5">
      <!-- Search Quality -->
      <div v-if="activeSection === 'search'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TxCard variant="plain" background="mask" :radius="16" :padding="16">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
            {{ t('dashboard.sections.analytics.search.firstResult') }}
          </h3>
          <p class="mt-2 text-2xl font-bold text-black dark:text-white">
            {{ analytics.summary.avgFirstResultMs }}ms
          </p>
        </TxCard>
        <TxCard variant="plain" background="mask" :radius="16" :padding="16">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
            {{ t('dashboard.sections.analytics.search.slowSearches') }}
          </h3>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-2xl font-bold text-black dark:text-white">{{ formatNumber(analytics.summary.searchSlowCount) }}</span>
            <TxStatusBadge :text="`${searchSlowRate}%`" :status="searchSlowRate > 5 ? 'warning' : 'success'" size="sm" />
          </div>
        </TxCard>
        <TxCard variant="plain" background="mask" :radius="16" :padding="16">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
            {{ t('dashboard.sections.analytics.search.avgResults') }}
          </h3>
          <p class="mt-2 text-2xl font-bold text-black dark:text-white">
            {{ analytics.summary.avgResultCount }}
          </p>
        </TxCard>
        <TxCard variant="plain" background="mask" :radius="16" :padding="16">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
            {{ t('dashboard.sections.analytics.search.avgSorting') }}
          </h3>
          <p class="mt-2 text-2xl font-bold text-black dark:text-white">
            {{ analytics.summary.avgSortingDuration }}ms
          </p>
        </TxCard>
      </div>

      <!-- Daily Trend Chart -->
      <TxCard v-if="activeSection === 'overview'" variant="plain" background="mask" :radius="18" :padding="20">
        <div class="mb-4">
          <h3 class="font-semibold text-black dark:text-white">
            {{ t('dashboard.sections.analytics.overview.dailyActivity') }}
          </h3>
          <p class="text-xs text-black/45 dark:text-white/45">
            {{ t('dashboard.sections.analytics.overview.dailyActivityDescription') }}
          </p>
        </div>
        <TxBarChart
          :series="dailyActivityChart.series"
          :categories="dailyActivityChart.categories"
          :stacked="true"
          :show-legend="true"
          :height="320"
        />
      </TxCard>

      <!-- UI & Main Performance -->
      <div v-if="activeSection === 'performance'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TxCard variant="plain" background="mask" :radius="16" :padding="16">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-emerald-600 dark:text-emerald-400">{{ t('dashboard.sections.analytics.performance.longTasks') }}</span>
            <span class="i-carbon-time text-base text-emerald-500" />
          </div>
          <p class="mt-2 text-2xl font-bold text-black dark:text-white">
            {{ analytics.summary.performance.longTaskAvgMs }}ms
          </p>
          <p class="mt-1 text-xs text-black/45 dark:text-white/45">
            {{ t('dashboard.sections.analytics.performance.longTasksDetail', {
              max: analytics.summary.performance.longTaskMaxMs,
              count: formatNumber(analytics.summary.performance.longTaskCount),
            }) }}
          </p>
        </TxCard>

        <TxCard variant="plain" background="mask" :radius="16" :padding="16">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-blue-600 dark:text-blue-400">{{ t('dashboard.sections.analytics.performance.frameJank') }}</span>
            <span class="i-carbon-chart-line-smooth text-base text-blue-500" />
          </div>
          <p class="mt-2 text-2xl font-bold text-black dark:text-white">
            {{ analytics.summary.performance.rafJankAvgMs }}ms
          </p>
          <p class="mt-1 text-xs text-black/45 dark:text-white/45">
            {{ t('dashboard.sections.analytics.performance.frameJankDetail', {
              max: analytics.summary.performance.rafJankMaxMs,
              count: formatNumber(analytics.summary.performance.rafJankCount),
            }) }}
          </p>
        </TxCard>

        <TxCard variant="plain" background="mask" :radius="16" :padding="16">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-purple-600 dark:text-purple-400">{{ t('dashboard.sections.analytics.performance.mainLoopDelay') }}</span>
            <span class="i-carbon-activity text-base text-purple-500" />
          </div>
          <p class="mt-2 text-2xl font-bold text-black dark:text-white">
            {{ analytics.summary.performance.eventLoopDelayP95AvgMs }}ms
          </p>
          <p class="mt-1 text-xs text-black/45 dark:text-white/45">
            {{ t('dashboard.sections.analytics.performance.maxDuration', { max: analytics.summary.performance.eventLoopDelayMaxMs }) }}
          </p>
        </TxCard>

        <TxCard variant="plain" background="mask" :radius="16" :padding="16">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-amber-600 dark:text-amber-400">{{ t('dashboard.sections.analytics.performance.unresponsive') }}</span>
            <span class="i-carbon-warning-alt text-base text-amber-500" />
          </div>
          <p class="mt-2 text-2xl font-bold text-black dark:text-white">
            {{ analytics.summary.performance.unresponsiveAvgMs }}ms
          </p>
          <p class="mt-1 text-xs text-black/45 dark:text-white/45">
            {{ t('dashboard.sections.analytics.performance.unresponsiveDetail', {
              max: analytics.summary.performance.unresponsiveMaxMs,
              count: formatNumber(analytics.summary.performance.unresponsiveCount),
            }) }}
          </p>
        </TxCard>
      </div>

      <!-- Module Load Performance -->
      <TxCard v-if="activeSection === 'performance'" variant="plain" background="mask" :radius="18" :padding="20">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h3 class="font-semibold text-black dark:text-white">
              {{ t('dashboard.sections.analytics.performance.moduleLoad') }}
            </h3>
            <p class="text-xs text-black/45 dark:text-white/45">
              {{ t('dashboard.sections.analytics.performance.moduleLoadDescription') }}
            </p>
          </div>
          <span class="text-xs text-black/40 dark:text-white/40">{{ t('dashboard.sections.analytics.performance.moduleLoadLegend') }}</span>
        </div>
        <TxEmptyState
          v-if="topModuleLoads.length === 0"
          variant="no-data"
          size="small"
          :title="t('dashboard.sections.analytics.empty.title')"
          :description="t('dashboard.sections.analytics.empty.moduleLoad')"
        />
        <div v-else class="space-y-2.5">
          <div
            v-for="item in topModuleLoads"
            :key="item.module"
            class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/[0.04] bg-black/[0.02] px-4 py-3 text-sm dark:border-white/[0.05] dark:bg-white/[0.03]"
          >
            <div class="min-w-0">
              <p class="truncate font-medium text-black dark:text-white">
                {{ item.module }}
              </p>
              <p class="text-xs text-black/45 dark:text-white/45 font-mono">
                {{ t('dashboard.sections.analytics.performance.ratio', { ratio: item.ratio.toFixed(2) }) }}
              </p>
            </div>
            <div class="flex items-center gap-4 font-mono text-xs text-black/60 dark:text-white/60">
              <span>{{ t('dashboard.sections.analytics.performance.avg', { duration: item.avgDuration }) }}</span>
              <span>{{ t('dashboard.sections.analytics.performance.max', { duration: item.maxDuration }) }}</span>
              <span>{{ t('dashboard.sections.analytics.performance.min', { duration: item.minDuration }) }}</span>
            </div>
          </div>
        </div>
      </TxCard>

      <!-- Version Distribution -->
      <TxCard v-if="activeSection === 'overview'" variant="plain" background="mask" :radius="18" :padding="20">
        <h3 class="mb-4 font-semibold text-black dark:text-white">
          Version Distribution
        </h3>
        <TxEmptyState
          v-if="!versionSegments.total"
          variant="no-data"
          size="small"
          :title="t('dashboard.sections.analytics.empty.title')"
          :description="t('dashboard.sections.analytics.empty.versionData')"
        />
        <div v-else class="flex flex-col gap-6 sm:flex-row sm:items-center">
          <TxPieChart
            :data="versionChartData"
            :donut="true"
            :show-legend="false"
            center-label="Active users"
            :height="260"
            class="w-full sm:max-w-[360px]"
          />
          <div class="flex-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
            <TxChartLegendItem
              v-for="segment in versionSegments.segments"
              :key="segment.key"
              :name="segment.key"
              :color="segment.color"
              :value="`${segment.count} · ${(segment.ratio * 100).toFixed(1)}%`"
            />
          </div>
        </div>
      </TxCard>

      <!-- Hourly Distribution -->
      <TxCard v-if="activeSection === 'overview'" variant="plain" background="mask" :radius="18" :padding="20">
        <h3 class="mb-4 font-semibold text-black dark:text-white">
          {{ t('dashboard.sections.analytics.overview.hourlyDistribution') }}
        </h3>
        <TxEmptyState
          v-if="!hasHourlyData"
          variant="no-data"
          size="small"
          :title="t('dashboard.sections.analytics.empty.title')"
          :description="t('dashboard.sections.analytics.empty.hourlyData')"
        />
        <TxBarChart
          v-else
          :series="hourlyChart.series"
          :categories="hourlyChart.categories"
          :height="220"
        />
      </TxCard>

      <!-- Search Term Collection Disabled -->
      <TxCard v-if="activeSection === 'search'" variant="plain" background="mask" :radius="18" :padding="20">
        <div class="flex items-start gap-3">
          <span class="i-carbon-locked text-xl text-black/45 dark:text-white/45 mt-0.5" />
          <div>
            <h3 class="font-semibold text-black dark:text-white">
              {{ t('dashboard.sections.analytics.search.searchTerms') }}
            </h3>
            <p class="mt-1 text-sm text-black/50 dark:text-white/50">
              {{ t('dashboard.sections.analytics.search.searchTermsDescription') }}
            </p>
          </div>
        </div>
      </TxCard>

      <TxCard v-if="activeSection === 'search'" variant="plain" background="mask" :radius="18" :padding="20">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h3 class="font-semibold text-black dark:text-white">
              {{ t('dashboard.sections.analytics.search.providerPerformance') }}
            </h3>
            <p class="mt-1 text-xs text-black/45 dark:text-white/45">
              {{ t('dashboard.sections.analytics.search.providerPerformanceDescription') }}
            </p>
          </div>
          <TxStatusBadge :text="t('dashboard.sections.analytics.common.days', { count: selectedDays })" status="info" size="sm" />
        </div>
        <TxEmptyState
          v-if="topProviderMetrics.length === 0"
          variant="no-data"
          size="small"
          :title="t('dashboard.sections.analytics.empty.title')"
          :description="t('dashboard.sections.analytics.empty.providerTelemetry')"
        />
        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[760px] text-left text-sm">
            <thead class="text-xs uppercase text-black/40 dark:text-white/40">
              <tr>
                <th class="py-2 pr-4 font-medium">
{{ t('dashboard.sections.analytics.search.table.provider') }}
</th>
                <th class="py-2 pr-4 text-right font-medium">
{{ t('dashboard.sections.analytics.search.table.calls') }}
</th>
                <th class="py-2 pr-4 text-right font-medium">
{{ t('dashboard.sections.analytics.search.table.avg') }}
</th>
                <th class="py-2 pr-4 text-right font-medium">
P95
</th>
                <th class="py-2 pr-4 text-right font-medium">
{{ t('dashboard.sections.analytics.search.table.max') }}
</th>
                <th class="py-2 pr-4 text-right font-medium">
{{ t('dashboard.sections.analytics.search.table.results') }}
</th>
                <th class="py-2 pr-4 text-right font-medium">
{{ t('dashboard.sections.analytics.search.table.errors') }}
</th>
                <th class="py-2 pr-4 text-right font-medium">
{{ t('dashboard.sections.analytics.search.table.timeouts') }}
</th>
                <th class="py-2 text-right font-medium">
{{ t('dashboard.sections.analytics.search.table.slow') }}
</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="provider in topProviderMetrics"
                :key="provider.provider"
                class="border-t border-black/[0.06] text-black/70 dark:border-white/[0.08] dark:text-white/70"
              >
                <td class="max-w-[220px] truncate py-3 pr-4 font-medium text-black dark:text-white">
                  {{ provider.provider }}
                </td>
                <td class="py-3 pr-4 text-right">
{{ formatNumber(provider.calls) }}
</td>
                <td class="py-3 pr-4 text-right">
{{ provider.avgDuration }}ms
</td>
                <td class="py-3 pr-4 text-right" :class="provider.p95Duration > 300 ? 'text-amber-600 dark:text-amber-300' : ''">
                  {{ provider.p95Duration }}ms
                </td>
                <td class="py-3 pr-4 text-right">
{{ provider.maxDuration }}ms
</td>
                <td class="py-3 pr-4 text-right">
{{ formatNumber(provider.resultCount) }}
</td>
                <td class="py-3 pr-4 text-right" :class="provider.errorCount > 0 ? 'text-red-600 dark:text-red-300' : ''">
                  {{ formatNumber(provider.errorCount) }}
                </td>
                <td class="py-3 pr-4 text-right" :class="provider.timeoutCount > 0 ? 'text-red-600 dark:text-red-300' : ''">
                  {{ formatNumber(provider.timeoutCount) }}
                </td>
                <td class="py-3 text-right">
                  {{ formatNumber(provider.slowCount) }}
                  <span class="text-xs text-black/35 dark:text-white/35">{{ provider.slowRate }}%</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </TxCard>

      <!-- Secondary Insights -->
      <div v-if="activeSection === 'search' || activeSection === 'overview'" class="grid gap-4 lg:grid-cols-3">
        <TxCard v-if="activeSection === 'search'" variant="plain" background="mask" :radius="18" :padding="18">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="font-semibold text-black dark:text-white">
              {{ t('dashboard.sections.analytics.search.searchScenes') }}
            </h3>
            <TxButton variant="bare" size="sm" native-type="button" class="text-xs text-black/50 transition hover:text-black dark:text-white/50 dark:hover:text-light" @click="showBreakdown = true; activeBreakdownTab = 'search'">
              {{ t('dashboard.sections.analytics.common.viewDetails') }}
            </TxButton>
          </div>
          <div class="space-y-2 text-sm text-black/70 dark:text-white/70">
            <div v-for="item in toSortedList(analytics.summary.searchSceneDistribution, 5)" :key="item[0]" class="flex items-center justify-between">
              <span class="capitalize">{{ item[0].replace('-', ' ') }}</span>
              <span class="font-mono text-xs text-black/40 dark:text-white/40">{{ item[1] }}</span>
            </div>
          </div>
        </TxCard>
        <TxCard v-if="activeSection === 'search'" variant="plain" background="mask" :radius="18" :padding="18">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="font-semibold text-black dark:text-white">
              {{ t('dashboard.sections.analytics.search.resultCategories') }}
            </h3>
            <TxButton variant="bare" size="sm" native-type="button" class="text-xs text-black/50 transition hover:text-black dark:text-white/50 dark:hover:text-light" @click="showBreakdown = true; activeBreakdownTab = 'search'">
              {{ t('dashboard.sections.analytics.common.viewDetails') }}
            </TxButton>
          </div>
          <div class="space-y-2 text-sm text-black/70 dark:text-white/70">
            <div v-for="item in toSortedList(analytics.summary.searchResultCategoryDistribution, 5)" :key="item[0]" class="flex items-center justify-between">
              <span class="capitalize">{{ item[0] }}</span>
              <span class="font-mono text-xs text-black/40 dark:text-white/40">{{ item[1] }}</span>
            </div>
          </div>
        </TxCard>
        <TxCard v-if="activeSection === 'overview'" variant="plain" background="mask" :radius="18" :padding="18">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="font-semibold text-black dark:text-white">
              {{ t('dashboard.sections.analytics.usage.topCategories') }}
            </h3>
            <TxButton variant="bare" size="sm" native-type="button" class="text-xs text-black/50 transition hover:text-black dark:text-white/50 dark:hover:text-light" @click="showBreakdown = true; activeBreakdownTab = 'usage'">
              {{ t('dashboard.sections.analytics.common.viewDetails') }}
            </TxButton>
          </div>
          <div class="space-y-2 text-sm text-black/70 dark:text-white/70">
            <div v-for="item in toSortedList(analytics.summary.featureUseCategoryDistribution, 5)" :key="item[0]" class="flex items-center justify-between">
              <span class="truncate">
                {{ formatCategoryKey(item[0]).level1 }} · {{ formatCategoryKey(item[0]).level2 }}
              </span>
              <span class="font-mono text-xs text-black/40 dark:text-white/40">{{ item[1] }}</span>
            </div>
          </div>
        </TxCard>
        <TxCard v-if="activeSection === 'overview'" variant="plain" background="mask" :radius="18" :padding="18">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="font-semibold text-black dark:text-white">
              {{ t('dashboard.sections.analytics.usage.updateActions') }}
            </h3>
            <TxButton variant="bare" size="sm" native-type="button" class="text-xs text-black/50 transition hover:text-black dark:text-white/50 dark:hover:text-light" @click="showBreakdown = true; activeBreakdownTab = 'usage'">
              {{ t('dashboard.sections.analytics.common.viewDetails') }}
            </TxButton>
          </div>
          <div class="space-y-2 text-sm text-black/70 dark:text-white/70">
            <div v-for="item in toSortedList(analytics.summary.updateActionDistribution, 5)" :key="item[0]" class="flex items-center justify-between">
              <span class="capitalize">{{ formatCategoryLabel(item[0]) }}</span>
              <span class="font-mono text-xs text-black/40 dark:text-white/40">{{ item[1] }}</span>
            </div>
          </div>
        </TxCard>
        <TxCard v-if="activeSection === 'overview'" variant="plain" background="mask" :radius="18" :padding="18">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="font-semibold text-black dark:text-white">
              {{ t('dashboard.sections.analytics.usage.updateResults') }}
            </h3>
            <TxButton variant="bare" size="sm" native-type="button" class="text-xs text-black/50 transition hover:text-black dark:text-white/50 dark:hover:text-light" @click="showBreakdown = true; activeBreakdownTab = 'usage'">
              {{ t('dashboard.sections.analytics.common.viewDetails') }}
            </TxButton>
          </div>
          <div class="space-y-2 text-sm text-black/70 dark:text-white/70">
            <div v-for="item in toSortedList(analytics.summary.updateResultDistribution, 5)" :key="item[0]" class="flex items-center justify-between">
              <span class="capitalize">{{ formatCategoryLabel(item[0]) }}</span>
              <span class="font-mono text-xs text-black/40 dark:text-white/40">{{ item[1] }}</span>
            </div>
          </div>
        </TxCard>
        <TxCard v-if="activeSection === 'overview'" variant="plain" background="mask" :radius="18" :padding="18">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="font-semibold text-black dark:text-white">
              {{ t('dashboard.sections.analytics.usage.updateChannels') }}
            </h3>
            <TxButton variant="bare" size="sm" native-type="button" class="text-xs text-black/50 transition hover:text-black dark:text-white/50 dark:hover:text-light" @click="showBreakdown = true; activeBreakdownTab = 'usage'">
              {{ t('dashboard.sections.analytics.common.viewDetails') }}
            </TxButton>
          </div>
          <div class="space-y-2 text-sm text-black/70 dark:text-white/70">
            <div v-for="item in toSortedList(analytics.summary.updateChannelDistribution, 5)" :key="item[0]" class="flex items-center justify-between">
              <span class="capitalize">{{ item[0] }}</span>
              <span class="font-mono text-xs text-black/40 dark:text-white/40">{{ item[1] }}</span>
            </div>
          </div>
        </TxCard>
        <TxCard v-if="activeSection === 'overview'" variant="plain" background="mask" :radius="18" :padding="18">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="font-semibold text-black dark:text-white">
              {{ t('dashboard.sections.analytics.usage.updateSources') }}
            </h3>
            <TxButton variant="bare" size="sm" native-type="button" class="text-xs text-black/50 transition hover:text-black dark:text-white/50 dark:hover:text-light" @click="showBreakdown = true; activeBreakdownTab = 'usage'">
              {{ t('dashboard.sections.analytics.common.viewDetails') }}
            </TxButton>
          </div>
          <div class="space-y-2 text-sm text-black/70 dark:text-white/70">
            <div v-for="item in toSortedList(analytics.summary.updateSourceDistribution, 5)" :key="item[0]" class="flex items-center justify-between">
              <span class="capitalize">{{ item[0] }}</span>
              <span class="font-mono text-xs text-black/40 dark:text-white/40">{{ item[1] }}</span>
            </div>
          </div>
        </TxCard>
        <TxCard v-if="activeSection === 'overview'" variant="plain" background="mask" :radius="18" :padding="18">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="font-semibold text-black dark:text-white">
              {{ t('dashboard.sections.analytics.usage.updateTags') }}
            </h3>
            <TxButton variant="bare" size="sm" native-type="button" class="text-xs text-black/50 transition hover:text-black dark:text-white/50 dark:hover:text-light" @click="showBreakdown = true; activeBreakdownTab = 'usage'">
              {{ t('dashboard.sections.analytics.common.viewDetails') }}
            </TxButton>
          </div>
          <div class="space-y-2 text-sm text-black/70 dark:text-white/70">
            <div v-for="item in toSortedList(analytics.summary.updateTagDistribution, 5)" :key="item[0]" class="flex items-center justify-between">
              <span class="truncate">{{ item[0] }}</span>
              <span class="font-mono text-xs text-black/40 dark:text-white/40">{{ item[1] }}</span>
            </div>
          </div>
        </TxCard>
      </div>

      <!-- Intelligence / AI Analytics -->
      <div v-if="activeSection === 'intelligence'" class="space-y-5">
        <TxCard v-if="intelligenceLoading" variant="plain" background="mask" :radius="18" :padding="24" class="flex items-center justify-center">
          <TxSpinner :size="20" />
        </TxCard>
        <TxCard v-else-if="intelligenceError" variant="plain" background="mask" :radius="18" :padding="24">
          <TxEmptyState
            variant="error"
            :title="t('common.error')"
            :description="intelligenceError"
          />
        </TxCard>
        <template v-else-if="intelligenceAnalytics">
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TxCard variant="plain" background="mask" :radius="16" :padding="16">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
                {{ t('dashboard.sections.analytics.intelligence.runs') }}
              </h3>
              <p class="mt-2 text-2xl font-bold text-black dark:text-white">
                {{ formatNumber(intelligenceAnalytics.summary.totalRuns) }}
              </p>
              <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.sections.analytics.intelligence.successRate', { rate: intelligenceAnalytics.summary.successRate }) }}
              </p>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.sections.analytics.intelligence.disconnectPauseRate', { rate: intelligenceAnalytics.summary.disconnectPauseRate }) }}
              </p>
            </TxCard>
            <TxCard variant="plain" background="mask" :radius="16" :padding="16">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
                {{ t('dashboard.sections.analytics.intelligence.fallback') }}
              </h3>
              <p class="mt-2 text-2xl font-bold text-black dark:text-white">
                {{ intelligenceAnalytics.summary.fallbackRate }}%
              </p>
              <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.sections.analytics.intelligence.recoveryRate', { rate: intelligenceAnalytics.summary.recoveryRate }) }}
              </p>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.sections.analytics.intelligence.retryRunRate', { rate: intelligenceAnalytics.summary.retryRunRate }) }}
              </p>
            </TxCard>
            <TxCard variant="plain" background="mask" :radius="16" :padding="16">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
                {{ t('dashboard.sections.analytics.intelligence.approvalHit') }}
              </h3>
              <p class="mt-2 text-2xl font-bold text-black dark:text-white">
                {{ intelligenceAnalytics.summary.approvalHitRate }}%
              </p>
              <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.sections.analytics.intelligence.waitingApprovals', { count: intelligenceAnalytics.summary.waitingApprovals }) }}
              </p>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.sections.analytics.intelligence.checkpointLossRate', { rate: intelligenceAnalytics.summary.checkpointLossRate }) }}
              </p>
            </TxCard>
            <TxCard variant="plain" background="mask" :radius="16" :padding="16">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
                {{ t('dashboard.sections.analytics.intelligence.streamCoverage') }}
              </h3>
              <p class="mt-2 text-2xl font-bold text-black dark:text-white">
                {{ intelligenceAnalytics.summary.streamCoverageRate }}%
              </p>
              <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.sections.analytics.intelligence.p95Duration', { duration: intelligenceAnalytics.summary.p95DurationMs }) }}
              </p>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.sections.analytics.intelligence.avgDuration', { duration: intelligenceAnalytics.summary.avgDurationMs }) }}
              </p>
            </TxCard>
          </div>

          <div class="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <TxCard variant="plain" background="mask" :radius="18" :padding="20">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="font-semibold text-black dark:text-white">
                  {{ t('dashboard.sections.analytics.intelligence.statusDistribution') }}
                </h3>
                <span class="text-xs text-black/45 dark:text-white/45">
                  {{ t('dashboard.sections.analytics.intelligence.avgDuration', { duration: intelligenceAnalytics.summary.avgDurationMs }) }}
                </span>
              </div>
              <div class="space-y-2 text-sm text-black/70 dark:text-white/70">
                <div
                  v-for="item in Object.entries(intelligenceAnalytics.statusDistribution)"
                  :key="item[0]"
                  class="flex items-center justify-between rounded-xl border border-black/[0.04] bg-black/[0.02] px-3.5 py-2.5 dark:border-white/[0.05] dark:bg-white/[0.03]"
                >
                  <span class="capitalize">{{ item[0].replace('_', ' ') }}</span>
                  <span class="font-mono text-xs text-black/50 dark:text-white/50">{{ item[1] }}</span>
                </div>
              </div>
            </TxCard>

            <TxCard variant="plain" background="mask" :radius="18" :padding="20">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="font-semibold text-black dark:text-white">
                  {{ t('dashboard.sections.analytics.intelligence.toolFailures') }}
                </h3>
                <TxButton variant="bare" size="sm" native-type="button" class="text-xs text-black/45 dark:text-white/45" @click="fetchIntelligenceAnalytics">
                  {{ t('dashboard.sections.analytics.common.refresh') }}
                </TxButton>
              </div>
              <TxEmptyState
                v-if="intelligenceAnalytics.toolFailureDistribution.length === 0"
                variant="no-data"
                size="small"
                :title="t('dashboard.sections.analytics.empty.title')"
                :description="t('dashboard.sections.analytics.empty.toolFailures')"
              />
              <div v-else class="space-y-2 text-sm text-black/70 dark:text-white/70">
                <div
                  v-for="tool in intelligenceAnalytics.toolFailureDistribution.slice(0, 8)"
                  :key="tool.toolId"
                  class="flex items-center justify-between rounded-xl border border-black/[0.04] bg-black/[0.02] px-3.5 py-2.5 dark:border-white/[0.05] dark:bg-white/[0.03]"
                >
                  <span class="truncate font-mono">{{ tool.toolId }}</span>
                  <span class="font-mono text-xs text-black/50 dark:text-white/50">{{ tool.count }}</span>
                </div>
              </div>
            </TxCard>
          </div>

          <TxCard variant="plain" background="mask" :radius="18" :padding="20">
            <h3 class="mb-3 font-semibold text-black dark:text-white">
              {{ t('dashboard.sections.analytics.intelligence.recentRuns') }}
            </h3>
            <TxEmptyState
              v-if="intelligenceAnalytics.recentRuns.length === 0"
              variant="no-data"
              size="small"
              :title="t('dashboard.sections.analytics.empty.title')"
              :description="t('dashboard.sections.analytics.empty.runtimeRecords')"
            />
            <div v-else class="space-y-2 text-sm text-black/70 dark:text-white/70">
              <div
                v-for="run in intelligenceAnalytics.recentRuns"
                :key="run.sessionId + run.createdAt"
                class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/[0.04] bg-black/[0.02] px-3.5 py-2.5 dark:border-white/[0.05] dark:bg-white/[0.03]"
              >
                <div class="min-w-0">
                  <p class="truncate font-medium text-black dark:text-white">
                    {{ run.sessionId }}
                  </p>
                  <p class="text-xs text-black/45 dark:text-white/45">
                    {{ run.providerName || t('dashboard.sections.analytics.common.runtime') }} · {{ run.model }}
                  </p>
                </div>
                <div class="flex items-center gap-3 text-xs text-black/50 dark:text-white/50">
                  <TxStatusBadge
                    :text="run.status"
                    :status="run.status === 'success' ? 'success' : run.status === 'failed' ? 'danger' : 'info'"
                    size="sm"
                  />
                  <span class="font-mono">{{ run.durationMs }}ms</span>
                  <span>{{ t('dashboard.sections.analytics.intelligence.fallbackCount', { count: run.fallbackCount }) }}</span>
                  <span>{{ t('dashboard.sections.analytics.intelligence.approvalCount', { count: run.approvalHitCount }) }}</span>
                </div>
              </div>
            </div>
          </TxCard>
        </template>
      </div>

      <!-- Docs Analytics -->
      <div v-if="activeSection === 'docs'" class="space-y-5">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TxCard variant="plain" background="mask" :radius="16" :padding="16">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
              {{ t('dashboard.sections.analytics.docs.docs') }}
            </h3>
            <p class="mt-2 text-2xl font-bold text-black dark:text-white">
              {{ formatNumber(docsAnalytics?.overview.docCount || 0) }}
            </p>
          </TxCard>
          <TxCard variant="plain" background="mask" :radius="16" :padding="16">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
              {{ t('dashboard.sections.analytics.docs.views') }}
            </h3>
            <p class="mt-2 text-2xl font-bold text-black dark:text-white">
              {{ formatNumber(docsAnalytics?.overview.totalViews || 0) }}
            </p>
          </TxCard>
          <TxCard variant="plain" background="mask" :radius="16" :padding="16">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
              {{ t('dashboard.sections.analytics.docs.activeReadTime') }}
            </h3>
            <p class="mt-2 text-2xl font-bold text-black dark:text-white">
              {{ formatDuration(docsAnalytics?.overview.totalActiveMs || 0) }}
            </p>
          </TxCard>
          <TxCard variant="plain" background="mask" :radius="16" :padding="16">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
              {{ t('dashboard.sections.analytics.docs.copySelect') }}
            </h3>
            <p class="mt-2 text-2xl font-bold text-black dark:text-white">
              {{ formatNumber((docsAnalytics?.overview.totalCopyCount || 0) + (docsAnalytics?.overview.totalSelectCount || 0)) }}
            </p>
          </TxCard>
        </div>

        <TxCard variant="plain" background="mask" :radius="16" :padding="16">
          <div class="flex flex-wrap items-center gap-3">
            <TxInput
              v-model="docsPath"
              type="text"
              :placeholder="t('dashboard.sections.analytics.docs.pathPlaceholder')"
              class="w-72"
            />
            <TxSelect v-model="docsSource" class="w-44">
              <TxSelectItem value="all" :label="t('dashboard.sections.analytics.docs.sources.all')" />
              <TxSelectItem value="docs_page" :label="t('dashboard.sections.analytics.docs.sources.docsPage')" />
              <TxSelectItem value="doc_comments_admin" :label="t('dashboard.sections.analytics.docs.sources.docCommentsAdmin')" />
            </TxSelect>
            <TxButton variant="secondary" size="sm" native-type="button" @click="fetchDocsAnalytics">
              {{ t('dashboard.sections.analytics.common.refresh') }}
            </TxButton>
            <TxButton
              v-if="docsPath"
              variant="ghost"
              size="sm"
              native-type="button"
              @click="docsPath = ''"
            >
              {{ t('dashboard.sections.analytics.common.clear') }}
            </TxButton>
          </div>
        </TxCard>

        <TxCard v-if="docsLoading" variant="plain" background="mask" :radius="18" :padding="24" class="flex items-center justify-center gap-2 text-sm text-black/50 dark:text-white/50">
          <TxSpinner :size="16" />
          {{ t('dashboard.sections.analytics.docs.loading') }}
        </TxCard>
        <TxCard v-else-if="docsError" variant="plain" background="mask" :radius="18" :padding="24">
          <TxEmptyState
            variant="error"
            :title="t('common.error')"
            :description="docsError"
          />
        </TxCard>
        <template v-else-if="docsAnalytics">
          <div class="grid gap-4 lg:grid-cols-2">
            <TxCard variant="plain" background="mask" :radius="18" :padding="20">
              <h3 class="mb-3 font-semibold text-black dark:text-white">
                {{ t('dashboard.sections.analytics.docs.summary') }}
              </h3>
              <TxEmptyState
                v-if="docsSummaryRows.length === 0"
                variant="no-data"
                size="small"
                :title="t('dashboard.sections.analytics.empty.title')"
                :description="t('dashboard.sections.analytics.empty.docsSummary')"
              />
              <div v-else class="space-y-2">
                <TxButton
                  v-for="item in docsSummaryRows"
                  :key="item.path"
                  variant="bare"
                  block
                  native-type="button"
                  class="w-full flex items-center justify-between rounded-xl border border-black/[0.04] bg-black/[0.02] px-3.5 py-2.5 text-left text-sm transition hover:bg-black/[0.05] dark:border-white/[0.05] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                  @click="openDocAnalyticsPath(item.path)"
                >
                  <div class="min-w-0">
                    <p class="truncate font-medium text-black/80 dark:text-white/80">
                      {{ item.path }}
                    </p>
                    <p class="truncate text-xs text-black/45 dark:text-white/50">
                      {{ item.title || t('dashboard.sections.analytics.common.untitled') }}
                    </p>
                  </div>
                  <div class="text-right font-mono text-xs text-black/50 dark:text-white/50">
                    <p>{{ t('dashboard.sections.analytics.docs.viewCount', { count: formatNumber(item.views) }) }}</p>
                    <p>{{ formatDuration(item.activeMs) }}</p>
                  </div>
                </TxButton>
              </div>
            </TxCard>

            <TxCard variant="plain" background="mask" :radius="18" :padding="20">
              <h3 class="mb-3 font-semibold text-black dark:text-white">
                {{ t('dashboard.sections.analytics.docs.actionEvidence') }}
              </h3>
              <TxEmptyState
                v-if="!docsDetail || docsDetail.evidence.length === 0"
                variant="no-data"
                size="small"
                :title="t('dashboard.sections.analytics.empty.title')"
                :description="t('dashboard.sections.analytics.empty.actionEvidence')"
              />
              <div v-else class="space-y-2">
                <div
                  v-for="item in docsDetail.evidence.slice(0, 12)"
                  :key="`${item.sourceType}:${item.actionType}:${item.textHash}:${item.sectionId}:${item.anchorBucket}`"
                  class="rounded-xl border border-black/[0.04] bg-black/[0.02] px-3.5 py-2.5 text-xs dark:border-white/[0.05] dark:bg-white/[0.03]"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-medium text-black/80 dark:text-white/80">{{ item.actionType }} · {{ item.actionSource }}</span>
                    <span class="font-mono text-black/45 dark:text-white/50">{{ formatNumber(item.count) }}</span>
                  </div>
                  <p class="mt-1 truncate text-black/45 dark:text-white/50">
                    {{ item.sectionId }} · {{ t('dashboard.sections.analytics.docs.bucket', { bucket: item.anchorBucket }) }} · {{ item.sourceType }}
                  </p>
                  <p v-if="item.textHash" class="mt-1 truncate font-mono text-black/40 dark:text-white/45">
                    {{ item.textHash }}
                  </p>
                </div>
              </div>
            </TxCard>
          </div>

          <div v-if="docsDetail" class="grid gap-4 lg:grid-cols-2">
            <TxCard variant="plain" background="mask" :radius="18" :padding="20">
              <h3 class="mb-3 font-semibold text-black dark:text-white">
                {{ t('dashboard.sections.analytics.docs.sections') }} · {{ docsDetail.path }}
              </h3>
              <TxEmptyState
                v-if="docsDetail.sections.length === 0"
                variant="no-data"
                size="small"
                :title="t('dashboard.sections.analytics.empty.title')"
                :description="t('dashboard.sections.analytics.empty.sectionHeat')"
              />
              <div v-else class="space-y-2">
                <div
                  v-for="section in docsDetail.sections.slice(0, 20)"
                  :key="section.sectionId"
                  class="rounded-xl border border-black/[0.04] bg-black/[0.02] px-3.5 py-2.5 text-sm dark:border-white/[0.05] dark:bg-white/[0.03]"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="truncate font-medium text-black/80 dark:text-white/80">{{ section.sectionId }}</span>
                    <span class="font-mono text-xs text-black/45 dark:text-white/50">{{ formatDuration(section.activeMs) }}</span>
                  </div>
                  <p class="truncate text-xs text-black/45 dark:text-white/50">
                    {{ section.sectionTitle || '-' }}
                  </p>
                </div>
              </div>
            </TxCard>

            <TxCard variant="plain" background="mask" :radius="18" :padding="20">
              <h3 class="mb-3 font-semibold text-black dark:text-white">
                {{ t('dashboard.sections.analytics.docs.heatBuckets') }}
              </h3>
              <TxEmptyState
                v-if="!docsDetail || docsDetail.heatmap.length === 0"
                variant="no-data"
                size="small"
                :title="t('dashboard.sections.analytics.empty.title')"
                :description="t('dashboard.sections.analytics.empty.heatBuckets')"
              />
              <div v-else class="space-y-3">
                <div
                  v-for="section in docsDetail.sections.slice(0, 8)"
                  :key="`heat-${section.sectionId}`"
                  class="rounded-xl border border-black/[0.04] bg-black/[0.02] px-3.5 py-2.5 text-xs dark:border-white/[0.05] dark:bg-white/[0.03]"
                >
                  <p class="mb-2 truncate text-black/70 dark:text-white/70">
                    {{ section.sectionId }}
                  </p>
                  <div class="flex items-end gap-1">
                    <div
                      v-for="bucket in docsHeatmapBySection.get(section.sectionId) || []"
                      :key="`${section.sectionId}:${bucket.bucket}:${bucket.sourceType}`"
                      class="h-14 w-2 rounded bg-emerald-500/70"
                      :style="{ height: `${Math.max(8, (bucket.activeMs / maxHeatValue) * 56)}px` }"
                      :title="t('dashboard.sections.analytics.docs.bucketTooltip', {
                        bucket: bucket.bucket,
                        source: bucket.sourceType,
                        duration: bucket.activeMs,
                      })"
                    />
                  </div>
                </div>
              </div>
            </TxCard>
          </div>
        </template>
      </div>

      <!-- Overview version and geography detail: one scope, two readings -->
      <div v-if="activeSection === 'overview'" class="space-y-5">
        <TxCard variant="plain" background="mask" :radius="18" :padding="20">
          <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="font-semibold text-black dark:text-white">
                {{ t('dashboard.sections.analytics.versions.usage') }}
              </h3>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.sections.analytics.versions.usageDescription') }}
              </p>
            </div>
            <ClientOnly>
              <TxSelect v-model="selectedVersion" class="w-60">
                <TxSelectItem :value="ALL_VERSIONS" :label="allVersionsLabel" />
                <TxSelectItem
                  v-for="item in versionOptions"
                  :key="item.value"
                  :value="item.value"
                  :label="item.label"
                />
              </TxSelect>
              <template #fallback>
                <div class="w-full rounded-xl bg-black/[0.04] px-3 py-2 text-xs text-black/60 dark:bg-white/[0.08] dark:text-white/60 sm:w-60">
                  {{ versionScopeLabel }}
                </div>
              </template>
            </ClientOnly>
          </div>

          <div v-if="versionLoading" class="flex items-center justify-center gap-2 py-10 text-sm text-black/50 dark:text-white/50">
            <TxSpinner :size="16" />
            {{ t('dashboard.sections.analytics.versions.loading') }}
          </div>
          <TxEmptyState
            v-else-if="versionError"
            variant="error"
            :title="t('common.error')"
            :description="versionError"
          />
          <TxEmptyState
            v-else-if="!versionAnalytics?.versions.length"
            variant="no-data"
            size="small"
            :title="t('dashboard.sections.analytics.empty.title')"
            :description="t('dashboard.sections.analytics.empty.versionRange')"
          />
          <template v-else>
            <TxBarChart
              :series="versionUsageChart.series"
              :categories="versionUsageChart.categories"
              :horizontal="true"
              :height="Math.max(180, versionUsageChart.categories.length * 34)"
            />
            <!-- Every version in range, not just the chart's top slice: the rows
                 and the selector write the same scope, so a row is a shortcut
                 for scoping the map rather than a second kind of filter. -->
            <div class="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              <TxButton
                v-for="row in versionAnalytics.versions"
                :key="row.version"
                variant="bare"
                block
                native-type="button"
                class="w-full flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition"
                :class="row.version === versionScope
                  ? 'border-blue-500/40 bg-blue-500/10'
                  : 'border-black/[0.04] bg-black/[0.02] hover:bg-black/[0.05] dark:border-white/[0.05] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]'"
                @click="selectVersion(row.version)"
              >
                <span class="min-w-0 truncate font-medium text-black/80 dark:text-white/80">{{ row.version }}</span>
                <span class="flex shrink-0 items-center gap-3 font-mono text-xs text-black/45 dark:text-white/50">
                  <span>{{ t('dashboard.sections.analytics.versions.visitCount', { count: formatNumber(row.visits) }) }}</span>
                  <span>{{ t('dashboard.sections.analytics.versions.searchCount', { count: formatNumber(row.searches) }) }}</span>
                  <span>{{ t('dashboard.sections.analytics.versions.userCount', { count: formatNumber(row.users) }) }}</span>
                  <span>{{ row.avgSearchDuration }}ms</span>
                  <span>{{ formatCompactDate(row.lastSeenAt) }}</span>
                </span>
              </TxButton>
            </div>
          </template>
        </TxCard>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TxCard variant="plain" background="mask" :radius="16" :padding="16">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
              {{ t('dashboard.sections.analytics.versions.searches') }}
            </h3>
            <p class="mt-2 text-2xl font-bold text-black dark:text-white">
              {{ formatNumber(geoAnalytics?.summary.totalSearches || 0) }}
            </p>
          </TxCard>
          <TxCard variant="plain" background="mask" :radius="16" :padding="16">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
              {{ t('dashboard.sections.analytics.versions.uniqueIps') }}
            </h3>
            <p class="mt-2 text-2xl font-bold text-black dark:text-white">
              {{ formatNumber(geoAnalytics?.summary.uniqueIps || 0) }}
            </p>
          </TxCard>
          <TxCard variant="plain" background="mask" :radius="16" :padding="16">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
              {{ t('dashboard.sections.analytics.versions.countries') }}
            </h3>
            <p class="mt-2 text-2xl font-bold text-black dark:text-white">
              {{ formatNumber(geoAnalytics?.summary.countryCount || 0) }}
            </p>
          </TxCard>
          <TxCard variant="plain" background="mask" :radius="16" :padding="16">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
              {{ t('dashboard.sections.analytics.versions.subdivisions') }}
            </h3>
            <p class="mt-2 text-2xl font-bold text-black dark:text-white">
              {{ formatNumber(geoAnalytics?.summary.subdivisionCount || 0) }}
            </p>
          </TxCard>
        </div>

        <TxCard variant="plain" background="mask" :radius="16" :padding="14">
          <div class="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-black/60 dark:text-white/60">{{ t('dashboard.sections.analytics.versions.scope') }}</span>
              <span class="rounded-lg bg-black/[0.05] px-2 py-0.5 font-medium text-black dark:bg-white/[0.08] dark:text-white">
                {{ versionScopeLabel }}
              </span>
              <span class="text-black/40 dark:text-white/40">·</span>
              <span class="font-medium text-black dark:text-white">{{ t('dashboard.sections.analytics.versions.global') }}</span>
              <span v-if="selectedGeoCountry" class="text-black/40 dark:text-white/40">></span>
              <span v-if="selectedGeoCountry" class="font-medium text-black dark:text-white">{{ resolveCountryLabel(selectedGeoCountry) }}</span>
            </div>
            <TxButton
              v-if="selectedGeoCountry"
              variant="secondary"
              size="sm"
              native-type="button"
              @click="resetGeoDrilldown"
            >
              {{ t('dashboard.sections.analytics.versions.backToGlobal') }}
            </TxButton>
          </div>
        </TxCard>

        <TxCard v-if="geoLoading" variant="plain" background="mask" :radius="18" :padding="24" class="flex items-center justify-center gap-2 text-sm text-black/50 dark:text-white/50">
          <TxSpinner :size="16" />
          {{ t('dashboard.sections.analytics.versions.loadingGeo') }}
        </TxCard>
        <TxCard v-else-if="geoError" variant="plain" background="mask" :radius="18" :padding="24">
          <TxEmptyState
            variant="error"
            :title="t('common.error')"
            :description="geoError"
          />
        </TxCard>

        <template v-else-if="geoAnalytics">
          <TxCard variant="plain" background="mask" :radius="18" :padding="16">
            <TxEmptyState
              v-if="!worldGeoJson || (selectedGeoCountry ? geoMapPoints.length === 0 : geoCountryMapRows.length === 0)"
              variant="no-data"
              size="small"
              :title="t('dashboard.sections.analytics.empty.title')"
              :description="worldGeoJsonFailed
                ? t('dashboard.sections.analytics.empty.worldMap')
                : t('dashboard.sections.analytics.empty.geoRows')"
            />
            <TxChoroplethMap
              v-else-if="!selectedGeoCountry"
              :geo-json="worldGeoJson"
              :data="geoCountryMapRows"
              name="geoName"
              value="count"
              :value-format="formatNumber"
              show-legend
              :height="320"
              @region-click="handleMapPointClick($event)"
            />
            <TxBubbleMap
              v-else
              :geo-json="worldGeoJson"
              :data="geoMapPoints"
              lng="longitude"
              lat="latitude"
              value="value"
              name="label"
              :value-format="formatNumber"
              :height="320"
              @bubble-click="handleMapPointClick($event)"
            />
          </TxCard>

          <div class="grid gap-4 lg:grid-cols-2">
            <TxCard variant="plain" background="mask" :radius="18" :padding="20">
              <h3 class="mb-3 font-semibold text-black dark:text-white">
                {{ selectedGeoCountry
                  ? t('dashboard.sections.analytics.versions.subdivisionBreakdown')
                  : t('dashboard.sections.analytics.versions.countryBreakdown') }}
              </h3>
              <TxEmptyState
                v-if="selectedGeoCountry ? geoSubdivisions.length === 0 : geoCountries.length === 0"
                variant="no-data"
                size="small"
                :title="t('dashboard.sections.analytics.empty.title')"
                :description="t('dashboard.sections.analytics.empty.rangeData')"
              />
              <div v-else class="space-y-2">
                <template v-if="selectedGeoCountry">
                  <TxButton
                    v-for="item in geoSubdivisions.slice(0, 12)"
                    :key="`${item.countryCode}:${item.regionCode || item.regionName || 'unknown'}`"
                    variant="bare"
                    block
                    native-type="button"
                    class="w-full flex items-center justify-between rounded-xl border border-black/[0.04] bg-black/[0.02] px-3.5 py-2.5 text-left text-sm transition hover:bg-black/[0.05] dark:border-white/[0.05] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                  >
                    <span class="truncate font-medium text-black/75 dark:text-white/75">
                      {{ resolveSubdivisionLabel(item) }}
                    </span>
                    <span class="font-mono text-xs text-black/45 dark:text-white/50">
                      {{ formatNumber(item.count) }}
                    </span>
                  </TxButton>
                </template>
                <template v-else>
                  <TxButton
                    v-for="item in geoCountries.slice(0, 12)"
                    :key="item.countryCode"
                    variant="bare"
                    block
                    native-type="button"
                    class="w-full flex items-center justify-between rounded-xl border border-black/[0.04] bg-black/[0.02] px-3.5 py-2.5 text-left text-sm transition hover:bg-black/[0.05] dark:border-white/[0.05] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                    @click="drilldownCountry(item.countryCode)"
                  >
                    <span class="truncate font-medium text-black/75 dark:text-white/75">
                      {{ resolveCountryLabel(item.countryCode) }}
                    </span>
                    <span class="font-mono text-xs text-black/45 dark:text-white/50">
                      {{ formatNumber(item.count) }}
                    </span>
                  </TxButton>
                </template>
              </div>
            </TxCard>

            <TxCard variant="plain" background="mask" :radius="18" :padding="20">
              <h3 class="mb-3 font-semibold text-black dark:text-white">
                {{ t('dashboard.sections.analytics.versions.topIps') }}
              </h3>
              <TxEmptyState
                v-if="geoTopIps.length === 0"
                variant="no-data"
                size="small"
                :title="t('dashboard.sections.analytics.empty.title')"
                :description="t('dashboard.sections.analytics.empty.ipData')"
              />
              <div v-else class="space-y-2">
                <div
                  v-for="item in geoTopIps"
                  :key="`${item.ip}:${item.lastSeenAt}`"
                  class="rounded-xl border border-black/[0.04] bg-black/[0.02] px-3.5 py-2.5 text-sm dark:border-white/[0.05] dark:bg-white/[0.03]"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-mono font-medium text-black/80 dark:text-white/80">{{ item.ip }}</span>
                    <span class="font-mono text-xs text-black/45 dark:text-white/50">{{ formatNumber(item.count) }}</span>
                  </div>
                  <p class="mt-1 text-xs text-black/45 dark:text-white/50">
                    {{ resolveCountryLabel(item.countryCode) }} · {{ item.regionCode || '-' }} · {{ item.city || '-' }}
                  </p>
                </div>
              </div>
            </TxCard>
          </div>
        </template>
      </div>

      <!-- Telemetry Messages (告警) -->
      <TxCard v-if="activeSection === 'messages'" variant="plain" background="mask" :radius="18" :padding="20">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h3 class="font-semibold text-black dark:text-white">
              {{ t('dashboard.sections.analytics.messages.title') }}
            </h3>
            <p class="text-xs text-black/45 dark:text-white/45">
              {{ t('dashboard.sections.analytics.messages.description') }}
            </p>
          </div>
          <TxButton variant="secondary" size="sm" native-type="button" @click="fetchMessages">
            {{ t('dashboard.sections.analytics.common.refresh') }}
          </TxButton>
        </div>
        <div v-if="messagesLoading" class="flex items-center gap-2 py-8 justify-center text-sm text-black/40 dark:text-white/40">
          <TxSpinner :size="16" />
          {{ t('dashboard.sections.analytics.messages.loading') }}
        </div>
        <div v-else-if="messagesError" class="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
          {{ messagesError }}
        </div>
        <TxEmptyState
          v-else-if="messages.length === 0"
          variant="no-data"
          size="small"
          :title="t('dashboard.sections.analytics.empty.title')"
          :description="t('dashboard.sections.analytics.empty.messages')"
        />
        <div v-else class="space-y-3">
          <div
            v-for="item in messages"
            :key="item.id"
            class="rounded-xl border border-black/[0.04] bg-black/[0.02] p-4 text-sm dark:border-white/[0.06] dark:bg-white/[0.03]"
          >
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold uppercase text-black/40 dark:text-white/40">{{ item.source }}</span>
                  <TxStatusBadge
                    :text="item.severity"
                    :status="item.severity === 'error' ? 'danger' : item.severity === 'warn' ? 'warning' : 'info'"
                    size="sm"
                  />
                  <TxStatusBadge
                    v-if="item.status === 'unread'"
                    :text="t('dashboard.sections.analytics.messages.unread')"
                    status="warning"
                    size="sm"
                  />
                </div>
                <p class="mt-2 font-semibold text-black dark:text-white">
                  {{ item.title }}
                </p>
                <p class="mt-1 text-black/60 dark:text-white/60">
                  {{ item.message }}
                </p>
              </div>
              <span class="font-mono text-xs text-black/40 dark:text-white/40">{{ formatMessageTime(item.createdAt) }}</span>
            </div>
          </div>
        </div>
      </TxCard>

      <!-- Exchange Rate History -->
      <TxCard v-if="activeSection === 'exchange'" variant="plain" background="mask" :radius="18" :padding="20">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-semibold text-black dark:text-white">
              {{ t('dashboard.sections.analytics.exchange.title') }}
            </h3>
            <p class="text-xs text-black/45 dark:text-white/45">
              {{ t('dashboard.sections.analytics.exchangeHistoryHint') }}
            </p>
          </div>
          <TxButton variant="secondary" size="sm" native-type="button" @click="fetchExchangeHistory">
            {{ t('dashboard.sections.analytics.common.refresh') }}
          </TxButton>
        </div>
        <div class="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-black/[0.04] bg-black/[0.02] p-3 text-xs dark:border-white/[0.05] dark:bg-white/[0.03]">
          <TxSelect v-model="exchangeView" class="w-40">
            <TxSelectItem value="history" :label="t('dashboard.sections.analytics.exchange.targetHistory')" />
            <TxSelectItem value="snapshots" :label="t('dashboard.sections.analytics.exchange.snapshots')" />
          </TxSelect>
          <TxInput
            v-model="exchangeTarget"
            type="text"
            :placeholder="t('dashboard.sections.analytics.exchange.targetPlaceholder')"
            class="w-28 uppercase"
          />
          <TxInput
            v-model.number="exchangeLimit"
            type="number"
            min="1"
            max="200"
            class="w-20"
          />
          <label class="flex items-center gap-2 text-xs text-black/60 dark:text-white/60">
            <TxCheckbox v-model="exchangeIncludePayload" />
            {{ t('dashboard.sections.analytics.exchange.includePayload') }}
          </label>
        </div>
        <div v-if="exchangeLoading" class="flex items-center gap-2 py-6 justify-center text-sm text-black/40 dark:text-white/40">
          <TxSpinner :size="16" />
          {{ t('dashboard.sections.analytics.exchange.loading') }}
        </div>
        <div v-else-if="exchangeError" class="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
          {{ exchangeError }}
        </div>
        <TxEmptyState
          v-else-if="exchangeView === 'history' && exchangeHistory.length === 0"
          variant="no-data"
          size="small"
          :title="t('dashboard.sections.analytics.empty.title')"
          :description="t('dashboard.sections.analytics.empty.exchangeHistory')"
        />
        <TxEmptyState
          v-else-if="exchangeView === 'snapshots' && exchangeSnapshots.length === 0"
          variant="no-data"
          size="small"
          :title="t('dashboard.sections.analytics.empty.title')"
          :description="t('dashboard.sections.analytics.empty.exchangeSnapshots')"
        />
        <div v-else class="space-y-3">
          <template v-if="exchangeView === 'history'">
            <div
              v-for="item in exchangeHistory"
              :key="`${item.targetCurrency}:${item.fetchedAt}`"
              class="rounded-xl border border-black/[0.04] bg-black/[0.02] p-4 text-sm dark:border-white/[0.06] dark:bg-white/[0.03]"
            >
              <div class="flex items-center justify-between gap-4">
                <div class="font-semibold text-black dark:text-white">
                  USD → {{ item.targetCurrency }}
                </div>
                <div class="font-mono text-xs text-black/40 dark:text-white/40">
                  {{ formatExchangeTime(item.fetchedAt) }}
                </div>
              </div>
              <div class="mt-2 font-mono text-xs text-black/60 dark:text-white/60">
                {{ t('dashboard.sections.analytics.exchange.rate', { rate: formatRate(item.rate) }) }}
              </div>
            </div>
          </template>
          <template v-if="exchangeView === 'snapshots'">
            <div
              v-for="item in exchangeSnapshots"
              :key="item.id"
              class="rounded-xl border border-black/[0.04] bg-black/[0.02] p-4 text-sm dark:border-white/[0.06] dark:bg-white/[0.03]"
            >
              <div class="flex items-center justify-between gap-4">
                <div class="font-semibold text-black dark:text-white">
                  {{ t('dashboard.sections.analytics.exchange.snapshot') }} · {{ item.baseCurrency }}
                </div>
                <div class="font-mono text-xs text-black/40 dark:text-white/40">
                  {{ formatExchangeTime(item.fetchedAt) }}
                </div>
              </div>
              <div class="mt-2 text-xs text-black/60 dark:text-white/60">
                {{ t('dashboard.sections.analytics.exchange.providerUpdated', { time: formatExchangeTime(item.providerUpdatedAt) }) }}
              </div>
              <div v-if="item.payload" class="mt-2 rounded-lg bg-black/[0.03] p-3 font-mono text-[11px] text-black/60 dark:bg-white/[0.05] dark:text-white/60">
                {{ formatPayloadPreview(item.payload) }}
              </div>
            </div>
          </template>
        </div>
      </TxCard>

      <!-- Breakdown Drawer -->
      <div v-if="showBreakdown" class="fixed inset-0 z-40 flex justify-end bg-black/30 p-4" @click.self="showBreakdown = false">
        <div class="h-full w-full max-w-lg overflow-y-auto rounded-3xl bg-white/90 p-6 shadow-xl backdrop-blur-xl dark:bg-[#1c1c1e]">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-black dark:text-white">
                {{ t('dashboard.sections.analytics.breakdown.title') }}
              </h3>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.sections.analytics.breakdown.description') }}
              </p>
            </div>
            <TxButton variant="ghost" circle size="sm" native-type="button" @click="showBreakdown = false">
              <span class="i-carbon-close text-base" />
            </TxButton>
          </div>

          <div class="mb-5 flex gap-2">
            <TxButton
              :variant="activeBreakdownTab === 'search' ? 'primary' : 'secondary'"
              size="sm"
              native-type="button"
              @click="activeBreakdownTab = 'search'"
            >
              {{ t('dashboard.sections.analytics.sections.search') }}
            </TxButton>
            <TxButton
              :variant="activeBreakdownTab === 'usage' ? 'primary' : 'secondary'"
              size="sm"
              native-type="button"
              @click="activeBreakdownTab = 'usage'"
            >
              {{ t('dashboard.sections.analytics.sections.usage') }}
            </TxButton>
          </div>

          <div v-if="activeBreakdownTab === 'search'" class="space-y-6 text-sm">
            <div>
              <h4 class="mb-2 font-semibold text-black dark:text-white">
                {{ t('dashboard.sections.analytics.breakdown.searchInputTypes') }}
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
                {{ t('dashboard.sections.analytics.breakdown.providerUsage') }}
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
                {{ t('dashboard.sections.analytics.breakdown.providerResults') }}
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
                {{ t('dashboard.sections.analytics.breakdown.executedSources') }}
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
                {{ t('dashboard.sections.analytics.breakdown.itemKinds') }}
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
                {{ t('dashboard.sections.analytics.breakdown.plugins') }}
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
                {{ t('dashboard.sections.analytics.breakdown.usageCategories') }}
              </h4>
              <div class="space-y-2">
                <div v-for="item in toSortedList(analytics.summary.featureUseCategoryDistribution, 10)" :key="item[0]" class="flex items-center justify-between">
                  <span class="truncate">{{ formatCategoryKey(item[0]).level1 }} · {{ formatCategoryKey(item[0]).level2 }}</span>
                  <span class="text-black/40 dark:text-white/40">{{ item[1] }}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 class="mb-2 font-semibold text-black dark:text-white">
                {{ t('dashboard.sections.analytics.usage.updateActions') }}
              </h4>
              <div class="space-y-2">
                <div v-for="item in toSortedList(analytics.summary.updateActionDistribution, 10)" :key="item[0]" class="flex items-center justify-between">
                  <span class="capitalize">{{ formatCategoryLabel(item[0]) }}</span>
                  <span class="text-black/40 dark:text-white/40">{{ item[1] }}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 class="mb-2 font-semibold text-black dark:text-white">
                {{ t('dashboard.sections.analytics.breakdown.updateStages') }}
              </h4>
              <div class="space-y-2">
                <div v-for="item in toSortedList(analytics.summary.updateStageDistribution, 10)" :key="item[0]" class="flex items-center justify-between">
                  <span class="capitalize">{{ formatCategoryLabel(item[0]) }}</span>
                  <span class="text-black/40 dark:text-white/40">{{ item[1] }}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 class="mb-2 font-semibold text-black dark:text-white">
                {{ t('dashboard.sections.analytics.usage.updateResults') }}
              </h4>
              <div class="space-y-2">
                <div v-for="item in toSortedList(analytics.summary.updateResultDistribution, 10)" :key="item[0]" class="flex items-center justify-between">
                  <span class="capitalize">{{ formatCategoryLabel(item[0]) }}</span>
                  <span class="text-black/40 dark:text-white/40">{{ item[1] }}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 class="mb-2 font-semibold text-black dark:text-white">
                {{ t('dashboard.sections.analytics.usage.updateChannels') }}
              </h4>
              <div class="space-y-2">
                <div v-for="item in toSortedList(analytics.summary.updateChannelDistribution, 10)" :key="item[0]" class="flex items-center justify-between">
                  <span class="capitalize">{{ item[0] }}</span>
                  <span class="text-black/40 dark:text-white/40">{{ item[1] }}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 class="mb-2 font-semibold text-black dark:text-white">
                {{ t('dashboard.sections.analytics.usage.updateSources') }}
              </h4>
              <div class="space-y-2">
                <div v-for="item in toSortedList(analytics.summary.updateSourceDistribution, 10)" :key="item[0]" class="flex items-center justify-between">
                  <span class="capitalize">{{ item[0] }}</span>
                  <span class="text-black/40 dark:text-white/40">{{ item[1] }}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 class="mb-2 font-semibold text-black dark:text-white">
                {{ t('dashboard.sections.analytics.usage.updateTags') }}
              </h4>
              <div class="space-y-2">
                <div v-for="item in toSortedList(analytics.summary.updateTagDistribution, 10)" :key="item[0]" class="flex items-center justify-between">
                  <span class="truncate">{{ item[0] }}</span>
                  <span class="text-black/40 dark:text-white/40">{{ item[1] }}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 class="mb-2 font-semibold text-black dark:text-white">
                {{ t('dashboard.sections.analytics.breakdown.updateItemKinds') }}
              </h4>
              <div class="space-y-2">
                <div v-for="item in toSortedList(analytics.summary.updateItemKindDistribution, 10)" :key="item[0]" class="flex items-center justify-between">
                  <span class="capitalize">{{ item[0] }}</span>
                  <span class="text-black/40 dark:text-white/40">{{ item[1] }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </section>
    </div>
  </AdminPageShell>
</template>
