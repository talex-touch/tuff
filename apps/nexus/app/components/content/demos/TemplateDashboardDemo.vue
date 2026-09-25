<script setup lang="ts">
// Dashboard template: "Tuff Pulse", the analytics board a launcher team keeps
// open. Every figure on it is read off one deterministic daily history, so the
// range switch, the date picker, a brushed zoom and a hidden platform all
// recompute the KPIs, legend, share bar and plugin table from the same numbers
// rather than swapping between canned states.
//
// The chart's pixel height and the table's column set come from the frame's
// measured width/height, because no container query reaches a numeric prop;
// everything else is laid out with `@container template`. The board is an
// interactive template, so there is no scripted playback — `@enter` only holds
// the charts back until the reader can see them draw.
import type { AllocationSegment } from '@talex-touch/tuffex/allocation-bar'
import type { TimeseriesData, TimeseriesMarker } from '@talex-touch/tuffex/charts'
import type { DataTableColumn, DataTableSortState } from '@talex-touch/tuffex/data-table'
import type { InsightPage } from '@talex-touch/tuffex/insight-cards'
import type { ChartTooltipRow, SparkPoint, SparkSeries } from '@talex-touch/tuffex/spark-chart'
import type { StatCardInsight } from '@talex-touch/tuffex/stat-card'
import { ChartPalette } from '@talex-touch/tuffex/charts'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type Layout = 'narrow' | 'column' | 'wide'
type RangeKey = '7d' | '30d' | '90d' | 'custom'
/** Inclusive pair of day indices into the history. */
type DayWindow = [number, number]

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const localeTag = computed(() => (zh.value ? 'zh-CN' : 'en-US'))

// ── History ──────────────────────────────────────────────────────────────────

const DAY = 86_400_000
const HOUR = 3_600_000
/** The board's "today", 2026-09-23 UTC. Data has arrived up to 14:00. */
const TODAY = Date.UTC(2026, 8, 23)
const NOW_HOUR = 14
const HISTORY_DAYS = 180
const LAST = HISTORY_DAYS - 1
const FIRST_DAY = TODAY - LAST * DAY

function dayIndex(timestamp: number): number {
  return Math.floor((timestamp - FIRST_DAY) / DAY)
}

function dayStart(index: number): number {
  return FIRST_DAY + index * DAY
}

function isoDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Deterministic 0–1 jitter; `Math.random()` would make screenshots unverifiable. */
function noise(index: number, seed: number): number {
  const value = Math.sin(index * 12.9898 + seed * 78.233) * 43_758.5453
  return value - Math.floor(value)
}

/** Share of a day's traffic that lands in UTC hour `hour`; peaks mid-afternoon. */
function hourShare(hour: number): number {
  return (1 + 0.75 * Math.sin((2 * Math.PI * (hour - 9)) / 24)) / 24
}

/** How much of today has happened by NOW_HOUR, so today's counts read as partial. */
const TODAY_SHARE = Array.from({ length: NOW_HOUR }, (_, hour) => hourShare(hour))
  .reduce((sum, share) => sum + share, hourShare(NOW_HOUR) / 2)

const V24 = dayIndex(Date.UTC(2026, 8, 5))
const MARKET_REFRESH = dayIndex(Date.UTC(2026, 8, 14))
const CRASH_SPIKE = dayIndex(Date.UTC(2026, 8, 18))

interface DailyShape {
  /** Full-day value on the last day. */
  level: number
  /** Change over 30 days: 0.11 is +11%. */
  growth: number
  /** How much quieter a weekend day is. */
  weekend: number
  jitter: number
  seed: number
  bump?: (index: number) => number
}

/** Full-day values, oldest first. Readers apply today's partial share themselves. */
function daily(shape: DailyShape): number[] {
  const perDay = (1 + shape.growth) ** (1 / 30)
  return Array.from({ length: HISTORY_DAYS }, (_, index) => {
    const weekday = new Date(dayStart(index)).getUTCDay()
    const weekend = weekday === 0 || weekday === 6 ? 1 - shape.weekend : 1
    const wobble = 1 + (noise(index, shape.seed) - 0.5) * 2 * shape.jitter
    return shape.level * perDay ** (index - LAST) * weekend * wobble * (shape.bump?.(index) ?? 1)
  })
}

const afterRelease = (index: number): number => (index >= V24 ? 1.05 : 1)

const PLATFORMS = [
  { key: 'mac', name: 'macOS', short: 'MAC', searches: daily({ level: 812_000, growth: 0.11, weekend: 0.2, jitter: 0.035, seed: 11, bump: afterRelease }) },
  { key: 'win', name: 'Windows', short: 'WIN', searches: daily({ level: 476_000, growth: 0.142, weekend: 0.16, jitter: 0.04, seed: 23, bump: afterRelease }) },
  { key: 'linux', name: 'Linux', short: 'LNX', searches: daily({ level: 108_000, growth: 0.218, weekend: 0.08, jitter: 0.05, seed: 37, bump: afterRelease }) },
]

const SEARCH_TOTAL = PLATFORMS[0]!.searches.map((_, index) =>
  PLATFORMS.reduce((sum, platform) => sum + platform.searches[index]!, 0))
const DAU = daily({ level: 19_400, growth: 0.082, weekend: 0.12, jitter: 0.018, seed: 5 })
const AI_REQUESTS = daily({ level: 3_350, growth: 0.31, weekend: 0.22, jitter: 0.05, seed: 7, bump: index => (index >= V24 ? 1.06 : 1) })
const INSTALLS = daily({
  level: 226,
  growth: 0.18,
  weekend: 0.3,
  jitter: 0.09,
  seed: 13,
  // The plugin market refresh sends a wave of installs that decays over days.
  bump: index => (index >= MARKET_REFRESH ? 1 + 0.85 * Math.exp(-(index - MARKET_REFRESH) / 2.2) : 1),
})
/** Crashes per 10k sessions — a rate, so today is never partial. */
const CRASH_RATE = daily({ level: 3.5, growth: -0.13, weekend: 0, jitter: 0.07, seed: 17, bump: index => (index === CRASH_SPIKE ? 1.95 : index === CRASH_SPIKE + 1 ? 1.3 : 1) })
const WINDOWS_CRASH_RATE = daily({ level: 3.9, growth: -0.08, weekend: 0, jitter: 0.1, seed: 19, bump: index => (index === CRASH_SPIKE ? 2.5 : index === CRASH_SPIKE + 1 ? 1.4 : 1) })

/**
 * Sum over a window. When the window ends today, that day only counts as far
 * as it has got — and a previous window compared against it passes the same
 * flag, so both sides cover the same elapsed time.
 */
function total(values: number[], [start, end]: DayWindow, partialEnd = end === LAST): number {
  let sum = 0
  for (let index = start; index <= end; index++)
    sum += index === end && partialEnd ? values[index]! * TODAY_SHARE : values[index]!
  return sum
}

/** Mean over complete days: today's partial day is skipped unless it is all there is. */
function average(values: number[], [start, end]: DayWindow): number {
  const last = end === LAST && end > start ? end - 1 : end
  let sum = 0
  for (let index = start; index <= last; index++)
    sum += values[index]!
  return sum / (last - start + 1)
}

function previousWindow([start, end]: DayWindow): DayWindow | null {
  const length = end - start + 1
  return start - length >= 0 ? [start - length, start - 1] : null
}

// ── Copy ─────────────────────────────────────────────────────────────────────

const copy = computed(() => zh.value
  ? {
      frameTitle: 'Dashboard 数据看板',
      subtitle: '全平台 · 14:00 UTC 更新',
      degraded: '1 项服务降级',
      rangeLabel: '时间范围',
      ranges: { '7d': '7 天', '30d': '30 天', '90d': '90 天' },
      dateTitle: '选择日期范围',
      kpiLabel: '关键指标',
      kpi: {
        dau: '日活用户',
        searches: 'CoreBox 日均搜索',
        ai: 'AI 请求',
        installs: '插件安装',
        crash: '崩溃率',
        crashUnit: '/ 万次会话',
      },
      trendTitle: 'CoreBox 搜索',
      byDay: '按平台 · 每日',
      byHour: '按平台 · 每小时',
      perDay: '/ 日',
      brushHint: '在图上拖选可放大',
      zoomed: '已放大',
      resetZoom: '恢复完整时间范围',
      chartDescription: 'CoreBox 搜索量，macOS、Windows、Linux 三条折线；今天的数据尚未完整，以虚线表示。',
      cluster: (count: number) => `${count} 个事件`,
      share: '平台占比',
      shareLabel: '各平台搜索占比',
      health: '服务健康',
      services: { index: '搜索索引', sync: '云同步', gateway: 'AI 网关', cdn: '更新 CDN' },
      syncSlow: '1 个区域延迟',
      healthy: '运行正常',
      slow: '延迟升高',
      quota: 'AI 用量 · 9 月',
      quotaLabel: 'AI token 用量，按调用路径',
      routes: { local: '端侧', nexus: 'Nexus AI', keys: '自有密钥' },
      insights: '洞察',
      previousInsight: '上一条洞察',
      nextInsight: '下一条洞察',
      last30: '近 30 天',
      sentTo: '已交给 Tuff Intelligence',
      tableTitle: '热门插件',
      tableSub: (range: string) => `按安装量 · ${range}`,
      tableMeta: (count: number, installs: string) => `${count} 个插件 · 共 ${installs} 次安装`,
      custom: '自定义范围',
      zoomRange: '所选区间',
      table: {
        plugin: '插件',
        category: '分类',
        version: '版本',
        installs: '安装量',
        trend: '趋势',
        crashFree: '无崩溃率',
        rating: '评分',
        status: '状态',
        empty: '该时间段没有安装数据',
      },
      status: { stable: '稳定', beta: '测试版', watch: '需关注' },
      trendLabel: (name: string) => `${name} 安装趋势`,
      crashLabel: (value: string) => `无崩溃率 ${value}`,
    }
  : {
      frameTitle: 'Dashboard',
      subtitle: 'All platforms · updated 14:00 UTC',
      degraded: '1 service degraded',
      rangeLabel: 'Time range',
      ranges: { '7d': '7d', '30d': '30d', '90d': '90d' },
      dateTitle: 'Pick a date range',
      kpiLabel: 'Key metrics',
      kpi: {
        dau: 'Daily active users',
        searches: 'CoreBox searches / day',
        ai: 'AI requests',
        installs: 'Plugin installs',
        crash: 'Crash rate',
        crashUnit: 'per 10k',
      },
      trendTitle: 'CoreBox searches',
      byDay: 'By platform · daily',
      byHour: 'By platform · hourly',
      perDay: '/ day',
      brushHint: 'Drag across the chart to zoom',
      zoomed: 'Zoomed',
      resetZoom: 'Show the full range again',
      chartDescription: 'CoreBox searches as three lines for macOS, Windows and Linux; today is still incomplete and drawn dashed.',
      cluster: (count: number) => `${count} events`,
      share: 'Platform share',
      shareLabel: 'Search share by platform',
      health: 'Service health',
      services: { index: 'Search index', sync: 'Cloud sync', gateway: 'AI gateway', cdn: 'Update CDN' },
      syncSlow: '1 region slow',
      healthy: 'Healthy',
      slow: 'Latency up',
      quota: 'AI usage · Sep',
      quotaLabel: 'AI token usage by route',
      routes: { local: 'On-device', nexus: 'Nexus AI', keys: 'Own keys' },
      insights: 'Insights',
      previousInsight: 'Previous insight',
      nextInsight: 'Next insight',
      last30: 'Last 30 days',
      sentTo: 'Sent to Tuff Intelligence',
      tableTitle: 'Top plugins',
      tableSub: (range: string) => `By installs · ${range}`,
      tableMeta: (count: number, installs: string) => `${count} plugins · ${installs} installs`,
      custom: 'Custom range',
      zoomRange: 'Selection',
      table: {
        plugin: 'Plugin',
        category: 'Category',
        version: 'Version',
        installs: 'Installs',
        trend: 'Trend',
        crashFree: 'Crash-free',
        rating: 'Rating',
        status: 'Status',
        empty: 'No installs in this period',
      },
      status: { stable: 'Stable', beta: 'Beta', watch: 'Watch' },
      trendLabel: (name: string) => `${name} install trend`,
      crashLabel: (value: string) => `Crash-free ${value}`,
    })

// ── Formatting ───────────────────────────────────────────────────────────────

const compactFormat = computed(() => new Intl.NumberFormat(localeTag.value, {
  notation: 'compact',
  // 万 already carries four digits of scale, so one decimal is enough there.
  maximumFractionDigits: zh.value ? 1 : 2,
}))
const integerFormat = computed(() => new Intl.NumberFormat(localeTag.value, { maximumFractionDigits: 0 }))
const dayFormat = computed(() => new Intl.DateTimeFormat(localeTag.value, { month: 'short', day: 'numeric', timeZone: 'UTC' }))
const dayLongFormat = computed(() => new Intl.DateTimeFormat(localeTag.value, { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' }))
const hourFormat = computed(() => new Intl.DateTimeFormat(localeTag.value, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }))

function compact(value: number): string {
  return compactFormat.value.format(value)
}

/** Signed percentage with a real minus sign, so signed columns line up. */
function signedPercent(value: number, digits = 1): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(digits)}%`
}

// ── Range, zoom and the chart ────────────────────────────────────────────────

const entered = ref(false)
const range = ref<RangeKey>('30d')
const customWindow = ref<DayWindow | null>(null)
/** Brushed time span in ms; null shows the whole range. */
const zoom = ref<[number, number] | null>(null)
const hiddenSeries = ref<string[]>([])
const legendHover = ref<string | null>(null)

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const

const baseWindow = computed<DayWindow>(() => {
  if (range.value === 'custom' && customWindow.value)
    return customWindow.value
  const days = range.value === 'custom' ? 30 : RANGE_DAYS[range.value]
  return [LAST - days + 1, LAST]
})

/** A week or less reads better by the hour than as seven points. */
const hourly = computed(() => baseWindow.value[1] - baseWindow.value[0] < 7)

function selectRange(value: string | number | Array<string | number>): void {
  if (value !== '7d' && value !== '30d' && value !== '90d')
    return
  range.value = value
  customWindow.value = null
  zoom.value = null
}

const dateValue = computed<[string, string]>(() => [
  isoDate(dayStart(baseWindow.value[0])),
  isoDate(dayStart(baseWindow.value[1])),
])

function pickDates(value: string | [string, string]): void {
  if (!Array.isArray(value))
    return
  const start = clamp(dayIndex(Date.parse(value[0])), 0, LAST)
  const end = clamp(dayIndex(Date.parse(value[1])), start, LAST)
  customWindow.value = [start, end]
  range.value = 'custom'
  zoom.value = null
}

function platformPoints(values: number[], seed: number): Array<[number, number]> {
  const [start, end] = baseWindow.value
  const points: Array<[number, number]> = []
  for (let index = start; index <= end; index++) {
    if (!hourly.value) {
      points.push([dayStart(index), Math.round(index === LAST ? values[index]! * TODAY_SHARE : values[index]!)])
      continue
    }
    const lastHour = index === LAST ? NOW_HOUR : 23
    for (let hour = 0; hour <= lastHour; hour++) {
      // The current hour is only half in.
      const partial = index === LAST && hour === NOW_HOUR ? 0.5 : 1
      const wobble = 1 + (noise(index * 24 + hour, seed) - 0.5) * 0.14
      points.push([dayStart(index) + hour * HOUR, Math.round(values[index]! * hourShare(hour) * wobble * partial)])
    }
  }
  return points
}

const fullSeries = computed(() => PLATFORMS.map((platform, index) => platformPoints(platform.searches, 41 + index)))

const chartData = computed<TimeseriesData[]>(() => PLATFORMS.map((platform, index) => {
  const points = fullSeries.value[index] ?? []
  const span = zoom.value
  return {
    name: platform.name,
    color: ChartPalette.categoricalVar(index),
    data: span ? points.filter(([time]) => time >= span[0] && time <= span[1]) : points,
  }
}))

/** Today's point is partial: dash the segment that leads into it. */
const incomplete = computed(() => {
  const points = chartData.value[0]?.data ?? []
  const last = points.at(-1)
  const previous = points.at(-2)
  if (!last || !previous)
    return undefined
  const now = hourly.value ? dayStart(LAST) + NOW_HOUR * HOUR : dayStart(LAST)
  return last[0] === now ? { after: previous[0] } : undefined
})

const RELEASES = [
  { at: Date.UTC(2026, 5, 10), label: { zh: 'v2.2', en: 'v2.2' }, zh: '插件市场上线', en: 'Plugin market launches' },
  { at: Date.UTC(2026, 6, 18), label: { zh: 'v2.3', en: 'v2.3' }, zh: '语音听写', en: 'Voice dictation' },
  { at: Date.UTC(2026, 8, 5), label: { zh: 'v2.4', en: 'v2.4' }, zh: '剪贴板 OCR', en: 'Clipboard OCR' },
  { at: Date.UTC(2026, 8, 14), label: { zh: '市场', en: 'Market' }, zh: '插件市场改版', en: 'Plugin market refresh' },
  { at: Date.UTC(2026, 8, 19, 12), label: { zh: 'v2.4.2', en: 'v2.4.2' }, zh: 'Windows 崩溃热修复', en: 'Windows crash hotfix' },
]

/**
 * Only markers inside the visible span: the chart folds marker timestamps
 * into its x domain, so one outside it would stretch the axis.
 */
const markers = computed<TimeseriesMarker[]>(() => {
  const points = chartData.value[0]?.data ?? []
  const first = points[0]?.[0]
  const last = points.at(-1)?.[0]
  if (first === undefined || last === undefined)
    return []
  return RELEASES
    .filter(release => release.at >= first && release.at <= last)
    .map(release => ({
      timestamp: release.at,
      label: zh.value ? release.label.zh : release.label.en,
      description: zh.value ? release.zh : release.en,
    }))
})

function onZoom(from: number, to: number): void {
  // A sliver with fewer than two samples would leave the chart nothing to draw.
  const inside = (fullSeries.value[0] ?? []).filter(([time]) => time >= from && time <= to)
  if (inside.length < 2)
    return
  zoom.value = [inside[0]![0], inside.at(-1)![0]]
}

function formatTick(timestamp: number): string {
  if (hourly.value && new Date(timestamp).getUTCHours() !== 0)
    return hourFormat.value.format(timestamp)
  return dayFormat.value.format(timestamp)
}

function formatStamp(timestamp: number): string {
  const day = dayLongFormat.value.format(timestamp)
  return hourly.value ? `${day} ${hourFormat.value.format(timestamp)}` : day
}

const zoomLabel = computed(() => {
  const span = zoom.value
  if (!span)
    return ''
  const format = (time: number): string => (hourly.value
    ? `${dayFormat.value.format(time)} ${hourFormat.value.format(time)}`
    : dayFormat.value.format(time))
  return `${format(span[0])} – ${format(span[1])}`
})

function toggleSeries(name: string): void {
  hiddenSeries.value = hiddenSeries.value.includes(name)
    ? hiddenSeries.value.filter(entry => entry !== name)
    : [...hiddenSeries.value, name]
}

// ── Figures for the visible window ───────────────────────────────────────────

/** Days the figures cover: the range, narrowed to the brushed span if any. */
const kpiWindow = computed<DayWindow>(() => {
  const [start, end] = baseWindow.value
  const span = zoom.value
  if (!span)
    return [start, end]
  const from = clamp(dayIndex(span[0]), start, end)
  return [from, clamp(dayIndex(span[1]), from, end)]
})

const windowLabel = computed(() => {
  if (zoom.value)
    return copy.value.zoomRange
  if (range.value === 'custom')
    return copy.value.custom
  return copy.value.ranges[range.value]
})

interface Kpi {
  key: string
  label: string
  value: string
  unit?: string
  iconClass: string
  insight?: StatCardInsight
}

function insightOf(current: number, previous: number | undefined, options: { lowerIsBetter?: boolean, delta?: boolean } = {}): StatCardInsight | undefined {
  if (previous === undefined || !Number.isFinite(previous) || previous === 0)
    return undefined
  const rising = current >= previous
  return {
    from: previous,
    to: current,
    type: options.delta ? 'delta' : 'percent',
    precision: 1,
    color: rising !== Boolean(options.lowerIsBetter) ? 'success' : 'danger',
    // Passed explicitly: the card's own trend glyph is not something the host
    // gets to recolour or check against the icon collections it ships.
    iconClass: rising ? 'i-carbon-arrow-up-right' : 'i-carbon-arrow-down-right',
  }
}

const kpis = computed<Kpi[]>(() => {
  const window = kpiWindow.value
  const prior = previousWindow(window) ?? undefined
  const partial = window[1] === LAST
  const k = copy.value.kpi
  const dau = average(DAU, window)
  const searches = average(SEARCH_TOTAL, window)
  const requests = total(AI_REQUESTS, window)
  const installs = total(INSTALLS, window)
  const crashes = average(CRASH_RATE, window)
  return [
    {
      key: 'dau',
      label: k.dau,
      value: integerFormat.value.format(dau),
      iconClass: 'i-carbon-user-multiple text-[var(--tx-color-primary)]',
      insight: insightOf(dau, prior && average(DAU, prior)),
    },
    {
      key: 'searches',
      label: k.searches,
      value: compact(searches),
      iconClass: 'i-carbon-search text-[var(--tx-chart-categorical-5)]',
      insight: insightOf(searches, prior && average(SEARCH_TOTAL, prior)),
    },
    {
      key: 'ai',
      label: k.ai,
      value: compact(requests),
      iconClass: 'i-carbon-machine-learning-model text-[var(--tx-chart-categorical-4)]',
      insight: insightOf(requests, prior && total(AI_REQUESTS, prior, partial)),
    },
    {
      key: 'installs',
      label: k.installs,
      value: integerFormat.value.format(installs),
      iconClass: 'i-carbon-download text-[var(--tx-color-success)]',
      insight: insightOf(installs, prior && total(INSTALLS, prior, partial)),
    },
    {
      key: 'crash',
      label: k.crash,
      value: crashes.toFixed(1),
      unit: k.crashUnit,
      iconClass: 'i-carbon-debug text-[var(--tx-color-warning)]',
      insight: insightOf(crashes, prior && average(CRASH_RATE, prior), { lowerIsBetter: true, delta: true }),
    },
  ]
})

/** Five cards are too tight below the wide breakpoint; the crash rate waits for room. */
function visibleKpis(layout: Layout): Kpi[] {
  return layout === 'wide' ? kpis.value : kpis.value.slice(0, 4)
}

const legend = computed(() => PLATFORMS.map((platform, index) => ({
  name: platform.name,
  color: ChartPalette.categoricalVar(index),
  value: compact(average(platform.searches, kpiWindow.value)),
})))

// ── Platform share, health, AI usage ─────────────────────────────────────────

const platformKey = ref('mac')
/** Pointer or focus inside the share block: the chart follows its selection. */
const shareActive = ref(false)

const shareSegments = computed<AllocationSegment[]>(() => {
  const totals = PLATFORMS.map(platform => total(platform.searches, kpiWindow.value))
  const sum = totals.reduce((acc, value) => acc + value, 0)
  const percents = totals.map(value => Math.round((value / sum) * 1000) / 10)
  // Rounding must not leave the bar short of (or past) the whole.
  percents[0] = Math.round((percents[0]! + 100 - percents.reduce((acc, value) => acc + value, 0)) * 10) / 10
  return PLATFORMS.map((platform, index) => ({
    key: platform.key,
    label: platform.name,
    short: platform.short,
    percent: percents[index]!,
    amount: legend.value[index]!.value,
    color: ChartPalette.categoricalVar(index),
  }))
})

const activeShare = computed(() => shareSegments.value.find(segment => segment.key === platformKey.value) ?? shareSegments.value[0]!)

const highlighted = computed(() => legendHover.value ?? (shareActive.value ? activeShare.value.label : null))

function onShareFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null
  if (!next || !(event.currentTarget as HTMLElement).contains(next))
    shareActive.value = false
}

const GREEN = 'var(--tx-bui-green, #189a4d)'
const ORANGE = 'var(--tx-bui-orange, #ef720c)'
const RED = 'var(--tx-bui-red, #e3474c)'

const services = computed(() => {
  const s = copy.value.services
  return [
    { key: 'index', name: s.index, level: 3, tone: GREEN, meta: '12 ms', state: copy.value.healthy },
    { key: 'sync', name: s.sync, level: 2, tone: ORANGE, meta: copy.value.syncSlow, state: copy.value.slow },
    { key: 'gateway', name: s.gateway, level: 3, tone: GREEN, meta: '180 ms', state: copy.value.healthy },
    { key: 'cdn', name: s.cdn, level: 3, tone: GREEN, meta: '99.99%', state: copy.value.healthy },
  ]
})

const usage = computed(() => {
  const r = copy.value.routes
  return [
    { key: 'local', label: r.local, value: 22, color: ChartPalette.categoricalVar(4) },
    { key: 'nexus', label: r.nexus, value: 38, color: ChartPalette.categoricalVar(3) },
    { key: 'keys', label: r.keys, value: 8, color: ChartPalette.categoricalVar(5) },
  ]
})

// ── Insights (wide only; always the last 30 days) ────────────────────────────

const INSIGHT_WINDOW: DayWindow = [LAST - 29, LAST]

/** Change since the window opened, on a 7-day mean so weekends do not saw the line. */
function indexedChange(values: number[]): SparkPoint[] {
  const rolling = (index: number): number => {
    let sum = 0
    for (let offset = 0; offset < 7; offset++)
      sum += values[index - offset]!
    return sum / 7
  }
  const origin = rolling(INSIGHT_WINDOW[0])
  return Array.from({ length: LAST - INSIGHT_WINDOW[0] }, (_, step) => ({
    time: step,
    value: (rolling(INSIGHT_WINDOW[0] + step) / origin - 1) * 100,
  }))
}

const LINUX_CHANGE = indexedChange(PLATFORMS[2]!.searches)
const WINDOWS_CHANGE = indexedChange(PLATFORMS[1]!.searches)
const LINUX_GROWTH = LINUX_CHANGE.at(-1)!.value
const WINDOWS_GROWTH = WINDOWS_CHANGE.at(-1)!.value
const LINUX_DAILY = average(PLATFORMS[2]!.searches, INSIGHT_WINDOW)
const WINDOWS_DAILY = average(PLATFORMS[1]!.searches, INSIGHT_WINDOW)
const WINDOWS_CRASHES: SparkPoint[] = Array.from({ length: 30 }, (_, step) => ({
  time: step,
  value: Math.round(WINDOWS_CRASH_RATE[INSIGHT_WINDOW[0] + step]! * 10) / 10,
}))
const CRASH_PEAK = WINDOWS_CRASHES[CRASH_SPIKE - INSIGHT_WINDOW[0]]!.value
const CRASH_MEAN = WINDOWS_CRASHES.reduce((sum, point) => sum + point.value, 0) / WINDOWS_CRASHES.length
const CRASH_EXCESS = `+${(CRASH_PEAK - CRASH_MEAN).toFixed(1)}`

const insightIndex = ref(0)
const compareHover = ref<number | null>(null)
const anomalyHover = ref<number | null>(null)
const aiRoute = ref('local')

const compareSeries: SparkSeries[] = [
  { id: 'linux', data: LINUX_CHANGE, color: ChartPalette.categoricalVar(2) },
  { id: 'windows', data: WINDOWS_CHANGE, color: ChartPalette.categoricalVar(1) },
]
const anomalySeries: SparkSeries[] = [
  { id: 'windows-crashes', data: WINDOWS_CRASHES, color: RED },
]

const insightPages = computed<InsightPage[]>(() => {
  const linux = LINUX_GROWTH
  const peakDate = dayFormat.value.format(dayStart(CRASH_SPIKE))
  const ratio = (CRASH_PEAK / CRASH_MEAN).toFixed(1)
  return zh.value
    ? [
        { key: 'compare', prose: `Linux 端搜索量近 30 天增长 ${linux.toFixed(1)}%，是三个平台里最快的。`, suggestion: '按发行版拆分 Linux 用户' },
        { key: 'anomaly', prose: `${peakDate} Windows 崩溃率升到每万次会话 ${CRASH_PEAK} 次，是月均的 ${ratio} 倍；次日的 v2.4.2 热修复后回落。`, suggestion: '打开当天的崩溃报告' },
        { key: 'allocation', prose: '72.4% 的 AI 请求在端侧完成，不消耗云端额度。', suggestion: '哪些命令最常走云端？' },
      ]
    : [
        { key: 'compare', prose: `Linux searches grew ${linux.toFixed(1)}% over 30 days — the fastest of the three platforms.`, suggestion: 'Break Linux down by distribution' },
        { key: 'anomaly', prose: `On ${peakDate} the Windows crash rate hit ${CRASH_PEAK} per 10k sessions, ${ratio}× the monthly mean; it fell back after the v2.4.2 hotfix.`, suggestion: 'Open that day’s crash reports' },
        { key: 'allocation', prose: '72.4% of AI requests finish on-device and never touch the cloud quota.', suggestion: 'Which commands go to the cloud most?' },
      ]
})

const compareRows = computed<ChartTooltipRow[]>(() => {
  const index = compareHover.value
  if (index === null)
    return []
  return [
    { label: 'Linux', value: signedPercent(LINUX_CHANGE[index]?.value ?? 0), color: ChartPalette.categoricalVar(2) },
    { label: 'Windows', value: signedPercent(WINDOWS_CHANGE[index]?.value ?? 0), color: ChartPalette.categoricalVar(1) },
  ]
})

const anomalyRows = computed<ChartTooltipRow[]>(() => {
  const index = anomalyHover.value
  if (index === null)
    return []
  return [{ label: 'Windows', value: `${WINDOWS_CRASHES[index]?.value ?? 0} ${copy.value.kpi.crashUnit}`, color: RED }]
})

function scrubLabel(index: number | null): string {
  return index === null ? copy.value.last30 : dayFormat.value.format(dayStart(INSIGHT_WINDOW[0] + index))
}

const aiSegments = computed<AllocationSegment[]>(() => zh.value
  ? [
      { key: 'local', label: '端侧模型', short: '端侧', percent: 72.4, color: ChartPalette.categoricalVar(4), description: '在本机运行，不占用云端额度。' },
      { key: 'nexus', label: 'Nexus AI', short: 'Nexus', percent: 23.1, color: ChartPalette.categoricalVar(3), description: '长上下文与图像理解走云端。' },
      { key: 'keys', label: '自有密钥', short: '密钥', percent: 4.5, color: ChartPalette.categoricalVar(5), description: '用户自带 API Key 的请求。' },
    ]
  : [
      { key: 'local', label: 'On-device', short: 'LOCAL', percent: 72.4, color: ChartPalette.categoricalVar(4), description: 'Runs on the machine and costs no cloud quota.' },
      { key: 'nexus', label: 'Nexus AI', short: 'NEXUS', percent: 23.1, color: ChartPalette.categoricalVar(3), description: 'Long context and image understanding go to the cloud.' },
      { key: 'keys', label: 'Own keys', short: 'KEYS', percent: 4.5, color: ChartPalette.categoricalVar(5), description: 'Requests on the user’s own API key.' },
    ])

const followUpOpen = ref(false)
const followUpText = ref('')
let followUpTimer: ReturnType<typeof setTimeout> | undefined

function onFollowUp(page: InsightPage): void {
  if (!page.suggestion)
    return
  followUpText.value = page.suggestion
  followUpOpen.value = true
  clearTimeout(followUpTimer)
  followUpTimer = setTimeout(() => {
    followUpOpen.value = false
  }, 3200)
}

// ── Top plugins ──────────────────────────────────────────────────────────────

type PluginStatus = 'stable' | 'beta' | 'watch'

interface PluginRow {
  id: string
  name: string
  category: string
  icon: string
  version: string
  installs: number
  trend: SparkSeries[]
  crashFree: number
  rating: number
  status: PluginStatus
}

/** Real plugin ids and versions from `plugins/`; shares split the install total. */
const PLUGINS = [
  { id: 'clipboard-history', zh: '剪贴板历史', en: 'Clipboard History', categoryZh: '效率', categoryEn: 'Productivity', icon: 'i-carbon-paste', version: '1.2.0-beta.6', share: 0.2078, drift: 0.05, crashFree: 99.92, rating: 4.9 },
  { id: 'touch-translation', zh: '翻译', en: 'Translation', categoryZh: '语言', categoryEn: 'Language', icon: 'i-carbon-translate', version: '1.0.18-beta.4', share: 0.1507, drift: 0.14, crashFree: 99.61, rating: 4.7 },
  { id: 'touch-snipaste', zh: 'Snipaste 截图', en: 'Snipaste', categoryZh: '截图', categoryEn: 'Capture', icon: 'i-carbon-crop', version: '1.0.0', share: 0.1231, drift: -0.04, crashFree: 99.87, rating: 4.8 },
  { id: 'touch-quick-actions', zh: '快捷动作', en: 'Quick Actions', categoryZh: '系统', categoryEn: 'System', icon: 'i-carbon-flash', version: '1.0.0', share: 0.1044, drift: 0.02, crashFree: 99.95, rating: 4.6 },
  { id: 'touch-intelligence', zh: '智能问答', en: 'Intelligence', categoryZh: 'AI', categoryEn: 'AI', icon: 'i-carbon-machine-learning-model', version: '1.2.0', share: 0.0829, drift: 0.38, crashFree: 99.34, rating: 4.5 },
  { id: 'touch-window-presets', zh: '窗口预设', en: 'Window Presets', categoryZh: '桌面', categoryEn: 'Desktop', icon: 'i-carbon-grid', version: '1.0.0', share: 0.0667, drift: -0.08, crashFree: 99.9, rating: 4.4 },
  { id: 'json-formatter', zh: 'JSON 工具', en: 'JSON Formatter', categoryZh: '开发', categoryEn: 'Developer', icon: 'i-carbon-json', version: '1.0.9-beta.4', share: 0.0644, drift: 0.06, crashFree: 99.8, rating: 4.7 },
  { id: 'touch-dictation', zh: '语音听写', en: 'Dictation', categoryZh: '语音', categoryEn: 'Voice', icon: 'i-carbon-microphone', version: '1.0.0', share: 0.0362, drift: 0.24, crashFree: 98.94, rating: 4.2 },
]

const TREND_SAMPLES = 24

/**
 * 24 samples across whatever window is showing — a constant count, so a range
 * change morphs the line instead of redrawing it from scratch.
 */
function trendSamples(order: number, share: number, drift: number, [start, end]: DayWindow): SparkPoint[] {
  return Array.from({ length: TREND_SAMPLES }, (_, sample) => {
    const progress = sample / (TREND_SAMPLES - 1)
    const position = start + progress * (end - start)
    const low = Math.floor(position)
    const high = Math.min(end, low + 1)
    const base = INSTALLS[low]! + (INSTALLS[high]! - INSTALLS[low]!) * (position - low)
    const wobble = 1 + (noise(sample + order * 31, 5) - 0.5) * 0.16
    return { time: sample, value: base * share * (1 + drift * (progress - 0.5)) * wobble }
  })
}

const pluginRows = computed<PluginRow[]>(() => {
  const window = kpiWindow.value
  const installsTotal = total(INSTALLS, window)
  return PLUGINS.map((plugin, order) => {
    const samples = trendSamples(order, plugin.share, plugin.drift, window)
    const rising = samples.at(-1)!.value >= samples[0]!.value
    return {
      id: plugin.id,
      name: zh.value ? plugin.zh : plugin.en,
      category: zh.value ? plugin.categoryZh : plugin.categoryEn,
      icon: plugin.icon,
      version: plugin.version,
      installs: Math.round(installsTotal * plugin.share * (1 + (noise(window[0] * 7 + window[1], order + 3) - 0.5) * 0.08)),
      trend: [{ id: plugin.id, data: samples, color: rising ? GREEN : RED }],
      crashFree: plugin.crashFree,
      rating: plugin.rating,
      status: plugin.crashFree < 99 ? 'watch' : plugin.version.includes('beta') ? 'beta' : 'stable',
    }
  })
})

const installsShown = computed(() => pluginRows.value.reduce((sum, row) => sum + row.installs, 0))

const sort = ref<DataTableSortState | null>({ key: 'installs', order: 'desc' })

const STATUS_TONE = { stable: 'success', beta: 'info', watch: 'warning' } as const

function crashLevel(value: number): { bars: number, tone: string } {
  if (value >= 99.8)
    return { bars: 3, tone: GREEN }
  if (value >= 99.4)
    return { bars: 2, tone: ORANGE }
  return { bars: 1, tone: RED }
}

function columnsFor(layout: Layout): DataTableColumn<PluginRow>[] {
  const t = copy.value.table
  const columns: DataTableColumn<PluginRow>[] = [{ key: 'name', title: t.plugin }]
  if (layout !== 'narrow')
    columns.push({ key: 'category', title: t.category, width: 92 })
  if (layout === 'wide')
    columns.push({ key: 'version', title: t.version, width: 140 })
  columns.push({ key: 'installs', title: t.installs, width: 104, align: 'right', sortable: true, sorter: (a, b) => a.installs - b.installs })
  columns.push({ key: 'trend', title: t.trend, width: layout === 'wide' ? 188 : layout === 'narrow' ? 84 : 112 })
  if (layout !== 'narrow')
    columns.push({ key: 'crashFree', title: t.crashFree, width: 124, sortable: true, sorter: (a, b) => a.crashFree - b.crashFree })
  if (layout === 'wide')
    columns.push({ key: 'rating', title: t.rating, width: 92, align: 'right', sortable: true, sorter: (a, b) => a.rating - b.rating })
  if (layout !== 'narrow')
    columns.push({ key: 'status', title: t.status, width: 100 })
  return columns
}

// ── Stage geometry ───────────────────────────────────────────────────────────

/** Mirrors the `@container template` breakpoints; width 0 is the unmeasured first frame. */
function layoutOf(width: number): Layout {
  if (width === 0)
    return 'column'
  return width < 640 ? 'narrow' : width < 960 ? 'column' : 'wide'
}

function chartHeight(width: number, height: number): number {
  const layout = layoutOf(width)
  if (layout === 'wide')
    return height ? clamp(Math.round(height * 0.36), 220, 320) : 260
  return layout === 'narrow' ? 176 : 240
}

// ── Reset ────────────────────────────────────────────────────────────────────

function resetDemo(): void {
  range.value = '30d'
  customWindow.value = null
  zoom.value = null
  hiddenSeries.value = []
  legendHover.value = null
  platformKey.value = 'mac'
  shareActive.value = false
  sort.value = { key: 'installs', order: 'desc' }
  insightIndex.value = 0
  compareHover.value = null
  anomalyHover.value = null
  aiRoute.value = 'local'
  followUpOpen.value = false
  clearTimeout(followUpTimer)
}

onBeforeUnmount(() => clearTimeout(followUpTimer))

defineExpose({ resetDemo })
</script>

<template>
  <TemplateFrame :title="copy.frameTitle" :height="600" @enter="entered = true">
    <template #default="{ width, height }">
      <div class="pulse">
        <header class="pulse__header">
          <div class="pulse__brand">
            <span class="pulse__mark" aria-hidden="true">
              <span class="i-carbon-activity" />
            </span>
            <div class="pulse__titles">
              <span class="pulse__title-row">
                <span class="pulse__title">Tuff Pulse</span>
                <TxStatusBadge size="sm" status="warning" icon="i-carbon-warning-alt" :text="copy.degraded" />
              </span>
              <span class="pulse__subtitle">{{ copy.subtitle }}</span>
            </div>
          </div>

          <div class="pulse__controls">
            <TxFlatRadio
              class="pulse__range"
              size="lg"
              :model-value="range"
              :aria-label="copy.rangeLabel"
              @update:model-value="selectRange"
            >
              <TxFlatRadioItem value="7d" :label="copy.ranges['7d']" />
              <TxFlatRadioItem value="30d" :label="copy.ranges['30d']" />
              <TxFlatRadioItem value="90d" :label="copy.ranges['90d']" />
            </TxFlatRadio>
            <div class="pulse__dates">
              <TxDatePicker
                :model-value="dateValue"
                variant="field"
                range
                :min="isoDate(FIRST_DAY)"
                :max="isoDate(TODAY)"
                :title="copy.dateTitle"
                :placeholder="copy.dateTitle"
                :week-starts-on="zh ? 1 : 0"
                @update:model-value="pickDates"
              />
            </div>
          </div>
        </header>

        <section class="pulse__kpis" :aria-label="copy.kpiLabel">
          <TxStatCard
            v-for="kpi in visibleKpis(layoutOf(width))"
            :key="kpi.key"
            :value="kpi.value"
            :label="kpi.label"
            :icon-class="kpi.iconClass"
            :insight="kpi.insight"
          >
            <template #value>
              <span class="pulse__kpi-value">
                <TxTextMorph :text="kpi.value" :locale="localeTag" />
                <span v-if="kpi.unit" class="pulse__kpi-unit">{{ kpi.unit }}</span>
              </span>
            </template>
          </TxStatCard>
        </section>

        <div class="pulse__main">
          <section class="pulse__panel pulse__trend">
            <div class="pulse__panel-head">
              <div class="pulse__panel-titles">
                <span class="pulse__panel-title">{{ copy.trendTitle }}</span>
                <span class="pulse__panel-sub">{{ hourly ? copy.byHour : copy.byDay }}</span>
              </div>
              <button
                v-if="zoom"
                type="button"
                class="pulse__chip"
                :aria-label="copy.resetZoom"
                @click="zoom = null"
              >
                <span class="i-carbon-zoom-reset" aria-hidden="true" />
                <span>{{ copy.zoomed }} · {{ zoomLabel }}</span>
                <span class="pulse__chip-close i-carbon-close" aria-hidden="true" />
              </button>
            </div>

            <div class="pulse__legend">
              <TxChartLegendItem
                v-for="item in legend"
                :key="item.name"
                :variant="layoutOf(width) === 'wide' ? 'large' : 'small'"
                :name="item.name"
                :color="item.color"
                :value="item.value"
                :unit="copy.perDay"
                :inactive="hiddenSeries.includes(item.name)"
                :aria-pressed="!hiddenSeries.includes(item.name)"
                @click="toggleSeries(item.name)"
                @pointerenter="legendHover = item.name"
                @pointerleave="legendHover = null"
              />
              <span class="pulse__hint">
                <span class="i-carbon-cursor-1" aria-hidden="true" />
                {{ copy.brushHint }}
              </span>
            </div>

            <TxTimeseriesChart
              v-model:hidden-series="hiddenSeries"
              :data="chartData"
              :markers="markers"
              :incomplete="incomplete"
              :height="chartHeight(width, height)"
              :loading="!entered"
              :highlighted-series="highlighted"
              :x-axis-tick-format="formatTick"
              :y-axis-tick-format="compact"
              :tooltip-value-format="integerFormat.format"
              :timestamp-format="formatStamp"
              :cluster-label="copy.cluster"
              :aria-description="copy.chartDescription"
              @time-range-change="onZoom"
            />
          </section>

          <aside class="pulse__panel pulse__rail">
            <div
              class="pulse__block"
              @pointerenter="shareActive = true"
              @pointerleave="shareActive = false"
              @focusin="shareActive = true"
              @focusout="onShareFocusOut"
            >
              <div class="pulse__block-head">
                <span class="pulse__block-title">{{ copy.share }}</span>
                <span class="pulse__block-figure">{{ activeShare.label }} · {{ activeShare.percent.toFixed(1) }}%</span>
              </div>
              <TxAllocationBar
                v-model="platformKey"
                :segments="shareSegments"
                :aria-label="copy.shareLabel"
                :percent-formatter="(percent: number) => `${Math.round(percent)}%`"
              />
            </div>

            <div class="pulse__block">
              <div class="pulse__block-head">
                <span class="pulse__block-title">{{ copy.health }}</span>
              </div>
              <ul class="pulse__health">
                <li v-for="service in services" :key="service.key" class="pulse__health-row">
                  <TxDotIndicator :color="service.tone" :label="service.name" />
                  <span class="pulse__health-meta">{{ service.meta }}</span>
                  <TxSignalMeter :value="service.level" :tone="service.tone" :label="`${service.name}: ${service.state}`" />
                </li>
              </ul>
            </div>

            <div class="pulse__block">
              <div class="pulse__block-head">
                <span class="pulse__block-title">{{ copy.quota }}</span>
                <span class="pulse__block-figure">68K / 100K</span>
              </div>
              <TxProgressBar :segments="usage" :segments-total="100" height="8px" :aria-label="copy.quotaLabel" />
              <div class="pulse__usage-legend">
                <TxDotIndicator
                  v-for="route in usage"
                  :key="route.key"
                  :color="route.color"
                  :size="6"
                  :label="`${route.label} ${route.value}K`"
                />
              </div>
            </div>
          </aside>

          <section v-if="layoutOf(width) === 'wide'" class="pulse__panel pulse__insights">
            <TxInsightCards
              v-model:active-index="insightIndex"
              :pages="insightPages"
              :title="copy.insights"
              :previous-label="copy.previousInsight"
              :next-label="copy.nextInsight"
              @follow-up="onFollowUp"
            >
              <template #default="{ page }">
                <div v-if="page.key === 'compare'" class="pulse-insight">
                  <div class="pulse-insight__metrics">
                    <TxInsightMetric
                      label="Linux"
                      :color="ChartPalette.categoricalVar(2)"
                      :value="LINUX_GROWTH"
                      :precision="1"
                      :detail="`${compact(LINUX_DAILY)} ${copy.perDay}`"
                    />
                    <TxInsightMetric
                      label="Windows"
                      :color="ChartPalette.categoricalVar(1)"
                      :value="WINDOWS_GROWTH"
                      :precision="1"
                      :detail="`${compact(WINDOWS_DAILY)} ${copy.perDay}`"
                    />
                  </div>
                  <div class="pulse-insight__chart">
                    <div class="pulse-insight__bar">
                      <span class="pulse-insight__caption">{{ scrubLabel(compareHover) }}</span>
                    </div>
                    <TxChartScrubber
                      class="pulse-insight__stage"
                      :point-count="LINUX_CHANGE.length"
                      :rows="compareRows"
                      :time-label="scrubLabel(compareHover)"
                      @scrub="compareHover = $event"
                      @leave="compareHover = null"
                    >
                      <TxSparkChart v-if="entered" :series="compareSeries" :padding="{ top: 16, bottom: 12 }" :aria-label="copy.trendTitle" />
                    </TxChartScrubber>
                  </div>
                </div>

                <div v-else-if="page.key === 'anomaly'" class="pulse-insight">
                  <div class="pulse-insight__chart">
                    <div class="pulse-insight__bar">
                      <span class="pulse-insight__caption">{{ scrubLabel(anomalyHover) }}</span>
                      <span class="pulse-insight__badge">Windows</span>
                    </div>
                    <TxChartScrubber
                      class="pulse-insight__stage"
                      :point-count="WINDOWS_CRASHES.length"
                      :rows="anomalyRows"
                      :time-label="scrubLabel(anomalyHover)"
                      @scrub="anomalyHover = $event"
                      @leave="anomalyHover = null"
                    >
                      <TxSparkChart v-if="entered" :series="anomalySeries" grid :padding="{ top: 16, bottom: 12 }" :aria-label="copy.kpi.crash" />
                    </TxChartScrubber>
                  </div>
                  <div class="pulse-insight__footline">
                    <span class="pulse-insight__hero">{{ CRASH_PEAK }}</span>
                    <span class="pulse-insight__note">{{ copy.kpi.crashUnit }}</span>
                    <code class="pulse-insight__mono">{{ CRASH_EXCESS }}</code>
                  </div>
                </div>

                <div v-else class="pulse-insight">
                  <TxAllocationBar v-model="aiRoute" :segments="aiSegments" detail :aria-label="copy.quotaLabel" />
                </div>
              </template>
            </TxInsightCards>

            <div class="pulse__follow-up" :class="{ 'is-open': followUpOpen }">
              <TxToastPanel :open="followUpOpen" :stack="0" :aria-label="copy.sentTo">
                <!-- The pill it answers sits at the left edge, so the tether does too. -->
                <template #tether>
                  <span class="pulse__follow-up-tether" aria-hidden="true" />
                </template>
                <div class="pulse__follow-up-card">
                  <span class="pulse__follow-up-icon i-carbon-send" aria-hidden="true" />
                  <span class="pulse__follow-up-text">
                    <strong>{{ copy.sentTo }}</strong>
                    <span>{{ followUpText }}</span>
                  </span>
                </div>
              </TxToastPanel>
            </div>
          </section>
        </div>

        <section class="pulse__panel pulse__table">
          <div class="pulse__panel-head pulse__table-head">
            <div class="pulse__panel-titles">
              <span class="pulse__panel-title">{{ copy.tableTitle }}</span>
              <span class="pulse__panel-sub">{{ copy.tableSub(windowLabel) }}</span>
            </div>
            <span class="pulse__table-meta">{{ copy.tableMeta(pluginRows.length, integerFormat.format(installsShown)) }}</span>
          </div>

          <TxDataTable
            v-model:sort="sort"
            :columns="columnsFor(layoutOf(width))"
            :data="pluginRows"
            row-key="id"
            sort-cycle="bi"
            table-layout="fixed"
            :empty-text="copy.table.empty"
          >
            <template #cell-name="{ row }">
              <span class="pulse-plugin">
                <span class="pulse-plugin__icon" aria-hidden="true">
                  <span :class="(row as PluginRow).icon" />
                </span>
                <span class="pulse-plugin__text">
                  <span class="pulse-plugin__name">{{ (row as PluginRow).name }}</span>
                  <span class="pulse-plugin__id">{{ (row as PluginRow).id }}</span>
                </span>
              </span>
            </template>

            <template #cell-category="{ value }">
              <span class="pulse__muted">{{ value }}</span>
            </template>

            <template #cell-version="{ value }">
              <code class="pulse__mono">{{ value }}</code>
            </template>

            <template #cell-installs="{ value }">
              <span class="pulse__number">{{ integerFormat.format(value as number) }}</span>
            </template>

            <template #cell-trend="{ row }">
              <span class="pulse__spark">
                <TxSparkChart
                  v-if="entered"
                  :series="(row as PluginRow).trend"
                  :padding="{ top: 4, right: 4, bottom: 4, left: 2 }"
                  :line-width="1.5"
                  :baseline="false"
                  :interactive="false"
                  :aria-label="copy.trendLabel((row as PluginRow).name)"
                />
              </span>
            </template>

            <template #cell-crashFree="{ value }">
              <span class="pulse__crash">
                <TxSignalMeter
                  :value="crashLevel(value as number).bars"
                  :tone="crashLevel(value as number).tone"
                  :label="copy.crashLabel(`${(value as number).toFixed(2)}%`)"
                />
                <span class="pulse__mono">{{ (value as number).toFixed(2) }}%</span>
              </span>
            </template>

            <template #cell-rating="{ value }">
              <span class="pulse__rating">
                <span class="i-carbon-star-filled" aria-hidden="true" />
                {{ (value as number).toFixed(1) }}
              </span>
            </template>

            <template #cell-status="{ row }">
              <TxStatusBadge
                size="sm"
                :status="STATUS_TONE[(row as PluginRow).status]"
                :text="copy.status[(row as PluginRow).status]"
              />
            </template>
          </TxDataTable>
        </section>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
/* A grey page with white panels, like any analytics tool: the panels are the
   objects, the page is the ground. The body scrolls; the dashboard is taller
   than the column stage and the wide layout on a laptop. */
.pulse {
  --pulse-pad: 16px;

  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: 12px;
  box-sizing: border-box;
  height: 100%;
  padding: 0 var(--pulse-pad) var(--pulse-pad);
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--tx-bg-color-page, #f2f3f5);
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
  scrollbar-width: thin;
}

/* Header ------------------------------------------------------------------- */

/* The app's top bar: white on the grey page, pinned while the board scrolls
   under it, and separated by a hairline rather than a shadow. */
.pulse__header {
  position: sticky;
  z-index: 3;
  top: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  margin: 0 calc(var(--pulse-pad) * -1);
  padding: 12px var(--pulse-pad);
  background: var(--tx-bg-color, #fff);
  box-shadow: 0 1px 0 var(--tx-border-color-lighter, #ebeef5);
}

/* The brand takes whatever the controls leave, so a long subtitle truncates
   instead of pushing the controls onto a second row. */
.pulse__brand {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.pulse__mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--tx-color-primary-light-9, #ecf5ff);
  color: var(--tx-color-primary, #409eff);
  font-size: 18px;
}

.pulse__titles {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.pulse__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pulse__title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
}

.pulse__subtitle {
  overflow: hidden;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pulse__controls {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
}

.pulse__dates {
  width: 252px;
}

/* KPIs --------------------------------------------------------------------- */

.pulse__kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.pulse__kpi-value {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}

.pulse__kpi-unit {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0;
}

/* Panels ------------------------------------------------------------------- */

.pulse__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 264px;
  gap: 12px;
}

.pulse__panel {
  position: relative;
  min-width: 0;
  border-radius: 16px;
  background: var(--tx-bg-color, #fff);
  box-shadow: 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

.pulse__panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.pulse__panel-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pulse__panel-title {
  font-size: 13px;
  font-weight: 600;
}

.pulse__panel-sub {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.pulse__trend {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 8px;
}

.pulse__chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 8px 0 9px;
  border: 0;
  border-radius: 999px;
  background: var(--tx-color-primary-light-9, #ecf5ff);
  color: var(--tx-color-primary, #409eff);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.pulse__chip:hover {
  background: var(--tx-color-primary-light-8, #d9ecff);
}

.pulse__chip:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 2px;
}

.pulse__chip-close {
  font-size: 12px;
  opacity: 0.7;
}

.pulse__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 18px;
  color: var(--tx-text-color-regular, #606266);
}

.pulse__legend :deep(.tx-chart-legend-item:focus-visible) {
  border-radius: 4px;
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 3px;
}

.pulse__hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-size: 12px;
}

/* Rail --------------------------------------------------------------------- */

.pulse__rail {
  display: flex;
  flex-direction: column;
  padding: 4px 16px;
}

.pulse__block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 0;
}

.pulse__block + .pulse__block {
  border-top: 1px solid var(--tx-border-color-extra-light, #f2f6fc);
}

.pulse__block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.pulse__block-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-text-color-regular, #606266);
}

.pulse__block-figure {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.pulse__health {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pulse__health-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pulse__health-row :deep(.tx-bui-dot-indicator) {
  flex: 1;
  min-width: 0;
  color: var(--tx-text-color-primary, #303133);
  font-size: 12.5px;
}

.pulse__health-meta {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.pulse__usage-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.pulse__usage-legend :deep(.tx-bui-dot-indicator) {
  gap: 6px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

/* Insights (wide) ---------------------------------------------------------- */

.pulse__insights {
  padding: 14px 16px;
}

/* Every page reserves the same prose and card height, so paging through the
   insights never changes the row's height under the chart beside it. */
.pulse__insights :deep(.tx-bui-insight-cards__prose) {
  min-height: calc(12.5px * 1.625 * 3);
}

.pulse-insight {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 206px;
}

.pulse-insight__metrics {
  display: flex;
  gap: 16px;
}

.pulse-insight__chart {
  overflow: hidden;
  border-radius: var(--tx-bui-radius-control, 8px);
  background: var(--tx-bui-inset, #f7f8f9);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
}

.pulse-insight__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--tx-bui-line, #ecedef);
}

.pulse-insight__caption {
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.pulse-insight__badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--tx-bui-field, #f2f2f3);
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 10.5px;
  font-weight: 500;
}

.pulse-insight__stage {
  height: 128px;
}

.pulse-insight__footline {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.pulse-insight__hero {
  color: var(--tx-bui-ink, #1f2124);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
}

.pulse-insight__note {
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 11.5px;
}

.pulse-insight__mono {
  margin-left: auto;
  color: var(--tx-bui-red, #e3474c);
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-size: 11.5px;
}

/* Anchored under the follow-up pill; it keeps its box while closed, so it
   floats over the panel instead of reserving a row, and lets clicks through. */
.pulse__follow-up {
  position: absolute;
  right: 16px;
  bottom: 12px;
  left: 16px;
  pointer-events: none;
}

.pulse__follow-up.is-open {
  pointer-events: auto;
}

.pulse__follow-up-tether {
  flex: none;
  align-self: flex-start;
  width: 0;
  height: 14px;
  margin-left: 28px;
  border-left: 1px dashed var(--tx-border-color, #dcdfe6);
}

.pulse__follow-up-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
}

.pulse__follow-up-icon {
  flex: none;
  margin-top: 2px;
  color: var(--tx-color-primary, #409eff);
  font-size: 14px;
}

.pulse__follow-up-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  color: var(--tx-text-color-secondary, #909399);
}

.pulse__follow-up-text strong {
  color: var(--tx-text-color-primary, #303133);
  font-weight: 600;
}

/* Table -------------------------------------------------------------------- */

/* The table sits flush in its panel; the panel's corners do the clipping. */
.pulse__table {
  overflow: hidden;
}

.pulse__table-head {
  align-items: center;
  padding: 14px 16px 12px;
}

.pulse__table-meta {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  white-space: nowrap;
}

.pulse__table :deep(.tx-data-table) {
  border-radius: 0;
}

.pulse-plugin {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.pulse-plugin__icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-regular, #606266);
  font-size: 15px;
}

.pulse-plugin__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pulse-plugin__name,
.pulse-plugin__id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pulse-plugin__name {
  font-weight: 500;
}

.pulse-plugin__id {
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-family: var(--tx-font-mono, ui-monospace, "SF Mono", monospace);
  font-size: 11px;
}

.pulse__muted {
  color: var(--tx-text-color-secondary, #909399);
}

.pulse__mono {
  color: var(--tx-text-color-regular, #606266);
  font-family: var(--tx-font-mono, ui-monospace, "SF Mono", monospace);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.pulse__number {
  font-variant-numeric: tabular-nums;
}

/* A fixed box, so the rows are the same height before and after the sparks draw. */
.pulse__spark {
  display: block;
  width: 100%;
  height: 28px;
}

.pulse__crash {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.pulse__rating {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}

.pulse__rating span {
  color: var(--tx-color-warning, #e6a23c);
  font-size: 12px;
}

/* Breakpoints -------------------------------------------------------------- */

@container template (max-width: 639.98px) {
  .pulse {
    --pulse-pad: 12px;

    gap: 10px;
  }

  .pulse__subtitle,
  .pulse__hint {
    display: none;
  }

  .pulse__controls {
    flex-wrap: wrap;
    width: 100%;
  }

  /* Beside the range switch when there is room for the whole date span,
     otherwise on a row of its own. */
  .pulse__dates {
    flex: 1 1 220px;
    width: auto;
    min-width: 0;
  }

  .pulse__kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .pulse__main {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .pulse__table-meta {
    display: none;
  }
}

@container template (min-width: 960px) {
  .pulse {
    --pulse-pad: 20px;

    gap: 16px;
  }

  .pulse__kpis {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 16px;
  }

  .pulse__main {
    grid-template-columns: minmax(0, 1fr) 272px 340px;
    gap: 16px;
  }

  .pulse__trend {
    padding: 16px 20px 10px;
  }

  .pulse__legend {
    gap: 6px 28px;
  }

  .pulse__rail {
    padding: 4px 18px;
  }

  .pulse__insights {
    /* Room at the foot for the follow-up panel to surface into. */
    padding: 16px 18px 80px;
  }

  .pulse__table-head {
    padding: 16px 20px 12px;
  }
}
</style>
