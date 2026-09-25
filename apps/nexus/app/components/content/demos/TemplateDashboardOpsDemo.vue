<script setup lang="ts">
// Dashboard, second style: an ops wall — the screen a team leaves on during a
// launch. Nothing is filtered or picked here; it is watched. Big KPIs roll, a
// city bubble map shows who is online, a sankey follows CoreBox searches into
// plugins and actions, a ticker lists what just happened, and a focus card
// rotates through what is worth a look.
//
// The wall is dark on purpose, whatever the site theme: the template root sets
// `data-theme="dark"`, which the tuffex, BUI and chart token blocks all accept
// on any element, and redeclares the few tokens `:root` derives with `var()`
// (the dark blocks do not, so they would keep their light values here).
// `color-scheme: dark` darkens the tooltips' `canvas` fallback and scrollbars.
// No teleported overlay is used: it would render in the page theme.
//
// Every figure comes from counters advanced by one heartbeat, through a sine
// hash — deterministic, so a screenshot can be reproduced. The heartbeat runs
// only while the wall is live: after `@enter`, not paused by the reader, on
// screen and in a visible tab. Reduced motion renders a still snapshot and
// starts no timer at all.
import type { AllocationSegment } from '@talex-touch/tuffex/allocation-bar'
import type { MapGeoJson, SankeyLinkData, SankeyNodeData } from '@talex-touch/tuffex/charts'
import type { InsightPage } from '@talex-touch/tuffex/insight-cards'
import type { SparkPoint } from '@talex-touch/tuffex/spark-chart'
import { ChartPalette } from '@talex-touch/tuffex/charts'
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type Layout = 'narrow' | 'column' | 'wide'
type KpiKey = 'online' | 'search' | 'ai' | 'installs' | 'sync' | 'crash'
type Tone = 'up' | 'down' | 'flat'

interface City {
  id: string
  zh: string
  en: string
  lng: number
  lat: number
  /** Online users at tick 0. */
  base: number
}

interface CityRow {
  id: string
  name: string
  lng: number
  lat: number
  online: number
  /** Change against the same hour yesterday, in percent (sample). */
  change: number
}

interface TickerItem {
  id: number
  /** Wall-clock second it happened at. */
  at: number
  kind: 'install' | 'search' | 'ai' | 'translate' | 'sync' | 'alert' | 'recover'
  city: number
  plugin: number
  amount: number
}

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const localeTag = computed(() => (zh.value ? 'zh-CN' : 'en-US'))

// ── Deterministic figures ────────────────────────────────────────────────────

/** 0–1 jitter from a sine hash; `Math.random()` would make screenshots unverifiable. */
function noise(index: number, seed: number): number {
  const value = Math.sin(index * 12.9898 + seed * 78.233) * 43_758.5453
  return value - Math.floor(value)
}

/** −1…1. */
function wave(index: number, seed: number): number {
  return noise(index, seed) * 2 - 1
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** The wall's clock starts here: 12:04:31. */
const CLOCK_START = (12 * 60 + 4) * 60 + 31
const DEGRADE_AT = 18
const RECOVER_AT = 30
const HISTORY = 30

const CITIES: City[] = [
  { id: 'sh', zh: '上海', en: 'Shanghai', lng: 121.47, lat: 31.23, base: 3420 },
  { id: 'bj', zh: '北京', en: 'Beijing', lng: 116.4, lat: 39.9, base: 2610 },
  { id: 'sz', zh: '深圳', en: 'Shenzhen', lng: 114.06, lat: 22.54, base: 2180 },
  { id: 'hz', zh: '杭州', en: 'Hangzhou', lng: 120.16, lat: 30.27, base: 1540 },
  { id: 'cd', zh: '成都', en: 'Chengdu', lng: 104.07, lat: 30.57, base: 980 },
  { id: 'tyo', zh: '东京', en: 'Tokyo', lng: 139.69, lat: 35.68, base: 1260 },
  { id: 'sel', zh: '首尔', en: 'Seoul', lng: 126.98, lat: 37.57, base: 640 },
  { id: 'sin', zh: '新加坡', en: 'Singapore', lng: 103.82, lat: 1.35, base: 720 },
  { id: 'sfo', zh: '旧金山', en: 'San Francisco', lng: -122.42, lat: 37.77, base: 1080 },
  { id: 'nyc', zh: '纽约', en: 'New York', lng: -74.01, lat: 40.71, base: 760 },
  { id: 'lon', zh: '伦敦', en: 'London', lng: -0.13, lat: 51.51, base: 690 },
  { id: 'ber', zh: '柏林', en: 'Berlin', lng: 13.4, lat: 52.52, base: 820 },
  { id: 'sao', zh: '圣保罗', en: 'São Paulo', lng: -46.63, lat: -23.55, base: 310 },
  { id: 'syd', zh: '悉尼', en: 'Sydney', lng: 151.21, lat: -33.87, base: 270 },
]

/** Users online outside the fourteen cities, so the KPI is the map's total plus the rest. */
const ELSEWHERE = 924

/** Plugin names as the events print them; real ids from `plugins/`. */
const PLUGINS = [
  { zh: '翻译', en: 'Translation' },
  { zh: '剪贴板历史', en: 'Clipboard History' },
  { zh: 'JSON 工具', en: 'JSON Formatter' },
  { zh: '语音听写', en: 'Dictation' },
  { zh: '窗口预设', en: 'Window Presets' },
]

// Sankey: input → plugin / provider → action. Shares are fixed; each window
// scales the four sources and splits them by these shares, and every provider
// passes on exactly what it received, so no node ends in a stub.
const FLOW_NODES = [
  { zh: '搜索框', en: 'Search box', short: 'Search', column: 0 },
  { zh: '剪贴板', en: 'Clipboard', short: 'Clipboard', column: 0 },
  { zh: '划词', en: 'Selection', short: 'Selection', column: 0 },
  { zh: '语音', en: 'Voice', short: 'Voice', column: 0 },
  { zh: '应用', en: 'Apps', short: 'Apps', column: 1 },
  { zh: '文件', en: 'Files', short: 'Files', column: 1 },
  { zh: '剪贴板历史', en: 'Clipboard history', short: 'History', column: 1 },
  { zh: '翻译', en: 'Translate', short: 'Translate', column: 1 },
  { zh: '智能问答', en: 'Intelligence', short: 'AI', column: 1 },
  { zh: '打开', en: 'Open', short: 'Open', column: 2 },
  { zh: '复制回写', en: 'Copy back', short: 'Copy back', column: 2 },
  { zh: '翻译结果', en: 'Translation', short: 'Translated', column: 2 },
  { zh: '问 AI', en: 'Ask AI', short: 'Ask AI', column: 2 },
]
const SOURCE_BASE = [8200, 2100, 1300, 880]
/** [from, to, share of `from`]; the last share of each source takes the rounding remainder. */
const FIRST_HOP: Array<[number, number, number]> = [
  [0, 4, 4300 / 8200],
  [0, 5, 2200 / 8200],
  [0, 7, 700 / 8200],
  [0, 8, 1000 / 8200],
  [1, 6, 1],
  [2, 6, 300 / 1300],
  [2, 7, 1000 / 1300],
  [3, 8, 1],
]
const SECOND_HOP: Array<[number, number, number]> = [
  [4, 9, 1],
  [5, 9, 1700 / 2200],
  [5, 10, 500 / 2200],
  [6, 10, 1],
  [7, 11, 1500 / 1700],
  [7, 10, 200 / 1700],
  [8, 12, 1],
]
const FLOW_COLORS = [
  ChartPalette.categoricalVar(0),
  ChartPalette.categoricalVar(4),
  ChartPalette.categoricalVar(3),
  ChartPalette.categoricalVar(1),
]

const SERVICES = [
  { key: 'index', zh: '搜索索引', en: 'Search index', meta: '12 ms' },
  { key: 'sync', zh: '云同步', en: 'Cloud sync', meta: '96 ms' },
  { key: 'gateway', zh: 'AI 网关', en: 'AI gateway', meta: '180 ms' },
  { key: 'cdn', zh: '更新 CDN', en: 'Update CDN', meta: '99.99%' },
  { key: 'market', zh: '插件市场', en: 'Plugin market', meta: '64 ms' },
  { key: 'push', zh: '推送通道', en: 'Push channel', meta: '41 ms' },
  { key: 'account', zh: '账户服务', en: 'Accounts', meta: '58 ms' },
]

const GREEN = 'var(--tx-bui-green, #3ecf7c)'
const ORANGE = 'var(--tx-bui-orange, #ff9a3d)'
const ACCENT = 'var(--tx-bui-accent, #3b9dff)'

// ── Copy ─────────────────────────────────────────────────────────────────────

const copy = computed(() => zh.value
  ? {
      frameTitle: '运营大屏',
      live: '实时',
      title: 'Tuff 运营大屏',
      scope: '全球 · 示例数据',
      zone: 'UTC+8',
      servicesOk: (ok: number, all: number) => (ok === all ? `${ok}/${all} 服务正常` : `${ok}/${all} 正常 · 1 项降级`),
      running: '实时刷新中',
      paused: '已暂停',
      pauseHint: '点击暂停实时刷新',
      resumeHint: '点击恢复实时刷新',
      still: (clock: string) => `已按系统设置停止实时刷新 · 快照 ${clock}`,
      kpiLabel: '关键指标',
      kpi: {
        online: '在线用户',
        search: 'CoreBox 搜索 / 分',
        ai: 'AI 请求 / 分',
        installs: '插件安装 / 时',
        sync: '同步延迟 p95',
        crash: '崩溃 / 万次会话',
      } satisfies Record<KpiKey, string>,
      versus: '较 1 小时前',
      onDevice: '端侧',
      mapTitle: '活跃用户分布',
      mapSub: (count: number) => `${count} 城`,
      mapLabel: '全球活跃用户城市气泡图',
      mapLoading: '正在加载地图数据…',
      mapFailed: '地图数据加载失败。',
      onlineUnit: '在线',
      vsYesterday: '较昨日同一时刻',
      focusTitle: '焦点',
      previous: '上一张',
      next: '下一张',
      flowTitle: '搜索流向',
      flowSub: '近 1 分钟 · 次',
      flowLabel: 'CoreBox 搜索从输入来源经插件流向动作的桑基图',
      perMinute: '次 / 分',
      healthTitle: '服务健康',
      healthy: '运行正常',
      slow: '延迟升高',
      tokyo: (ms: number) => `东京 ${ms} ms`,
      moreHealthy: (count: number) => `另有 ${count} 项正常`,
      eventsTitle: '实时事件',
      peak: (count: string) => `华东正在高峰：上海和杭州共 ${count} 人在线，比昨天同一时刻高 12%（示例）。`,
      aiShare: '72.4% 的 AI 请求在端侧完成，不消耗云端额度。',
      market: '过去一小时装得最多的三个插件（示例）。',
      eastChina: '华东在线 · 近 30 次刷新',
      routes: [
        { key: 'local', label: '端侧模型', short: '端侧', percent: 72.4, description: '在本机运行，不占用云端额度。' },
        { key: 'nexus', label: 'Nexus AI', short: 'Nexus', percent: 23.1, description: '长上下文与图像理解走云端。' },
        { key: 'keys', label: '自有密钥', short: '密钥', percent: 4.5, description: '用户自带 API Key 的请求。' },
      ],
      routeLabel: 'AI 请求按调用路径占比',
      installsUnit: '次',
      events: {
        install: (city: string, plugin: string) => `${city} · 安装了「${plugin}」`,
        search: (city: string) => `${city} · CoreBox 搜索「clip」→ 剪贴板历史`,
        ai: (city: string, amount: number) => `${city} · AI 请求在端侧完成 · ${amount} ms`,
        translate: (city: string, amount: number) => `${city} · 划词翻译 · ${amount} 字`,
        sync: (city: string, amount: number) => `${city} · 同步了 ${amount} 台设备`,
        alert: '东京 · 云同步延迟升高，已切到备用线路',
        recover: '东京 · 云同步恢复正常',
      },
    }
  : {
      frameTitle: 'Ops wall',
      live: 'LIVE',
      title: 'Tuff ops wall',
      scope: 'Global · sample data',
      zone: 'UTC+8',
      servicesOk: (ok: number, all: number) => (ok === all ? `${ok}/${all} services healthy` : `${ok}/${all} healthy · 1 degraded`),
      running: 'Live',
      paused: 'Paused',
      pauseHint: 'Click to pause live updates',
      resumeHint: 'Click to resume live updates',
      still: (clock: string) => `Live updates off (system setting) · snapshot ${clock}`,
      kpiLabel: 'Key metrics',
      kpi: {
        online: 'Online now',
        search: 'CoreBox searches / min',
        ai: 'AI requests / min',
        installs: 'Plugin installs / hr',
        sync: 'Sync p95',
        crash: 'Crashes / 10k sessions',
      },
      versus: 'vs 1 hr ago',
      onDevice: 'on-device',
      mapTitle: 'Where people are online',
      mapSub: (count: number) => `${count} cities`,
      mapLabel: 'Bubble map of cities with active users',
      mapLoading: 'Loading map data…',
      mapFailed: 'Map data failed to load.',
      onlineUnit: 'online',
      vsYesterday: 'vs this time yesterday',
      focusTitle: 'Focus',
      previous: 'Previous card',
      next: 'Next card',
      flowTitle: 'Search flow',
      flowSub: 'Last minute · count',
      flowLabel: 'Sankey diagram of CoreBox searches flowing from input to plugin to action',
      perMinute: '/ min',
      healthTitle: 'Service health',
      healthy: 'Healthy',
      slow: 'Latency up',
      tokyo: (ms: number) => `Tokyo ${ms} ms`,
      moreHealthy: (count: number) => `${count} more healthy`,
      eventsTitle: 'Live events',
      peak: (count: string) => `East China is peaking: Shanghai and Hangzhou have ${count} online, 12% above this time yesterday (sample).`,
      aiShare: '72.4% of AI requests finish on-device and never touch the cloud quota.',
      market: 'The three most installed plugins in the last hour (sample).',
      eastChina: 'East China online · last 30 refreshes',
      routes: [
        { key: 'local', label: 'On-device', short: 'LOCAL', percent: 72.4, description: 'Runs on the machine and costs no cloud quota.' },
        { key: 'nexus', label: 'Nexus AI', short: 'NEXUS', percent: 23.1, description: 'Long context and image understanding go to the cloud.' },
        { key: 'keys', label: 'Own keys', short: 'KEYS', percent: 4.5, description: 'Requests on the user’s own API key.' },
      ],
      routeLabel: 'AI requests by route',
      installsUnit: '',
      events: {
        install: (city: string, plugin: string) => `${city} · installed ${plugin}`,
        search: (city: string) => `${city} · CoreBox “clip” → Clipboard History`,
        ai: (city: string, amount: number) => `${city} · AI request on-device · ${amount} ms`,
        translate: (city: string, amount: number) => `${city} · translated a selection · ${amount} chars`,
        sync: (city: string, amount: number) => `${city} · synced ${amount} devices`,
        alert: 'Tokyo · cloud sync latency up, switched to the backup route',
        recover: 'Tokyo · cloud sync back to normal',
      },
    })

// ── Live state ───────────────────────────────────────────────────────────────

const entered = ref(false)
const reduced = ref(false)
/** Reader's pause (the mode chip). */
const paused = ref(false)
/** Off screen or in a hidden tab: nobody is watching, so nothing ticks. */
const hidden = ref(false)
/** Seconds the wall has been live; drives every cadence below. */
const sec = ref(0)
const focusIndex = ref(0)
/** The reader paged by hand, so the rotation stops and leaves them in charge. */
const focusManual = ref(false)
const focusHold = ref(false)
const tickerHold = ref(false)
const flowHold = ref(false)
const flowWindow = ref(0)
const world = shallowRef<MapGeoJson | null>(null)
const worldFailed = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const live = computed(() => entered.value && !reduced.value && !paused.value && !hidden.value)
const kpiTick = computed(() => Math.floor(sec.value / 2))
const cityTick = computed(() => Math.floor(sec.value / 4))
const degraded = computed(() => sec.value >= DEGRADE_AT && sec.value < RECOVER_AT)

let timers: ReturnType<typeof setTimeout>[] = []

function later(ms: number, run: () => void): void {
  const id = setTimeout(() => {
    timers = timers.filter(timer => timer !== id)
    run()
  }, ms)
  timers.push(id)
}

function clearTimers(): void {
  for (const id of timers)
    clearTimeout(id)
  timers = []
}

function prefersReducedMotion(): boolean {
  return hasWindow()
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ── Figures ──────────────────────────────────────────────────────────────────

function cityOnline(city: City, index: number, tick: number): number {
  return Math.round(city.base * (1 + 0.05 * wave(tick, index + 3)))
}

function cityChange(index: number): number {
  return Math.round((6 + 10 * noise(index, 29)) * 10) / 10
}

const cityRows = computed<CityRow[]>(() => CITIES.map((city, index) => ({
  id: city.id,
  name: zh.value ? city.zh : city.en,
  lng: city.lng,
  lat: city.lat,
  online: cityOnline(city, index, cityTick.value),
  change: cityChange(index),
})))

function elsewhere(tick: number): number {
  return Math.round(ELSEWHERE * (1 + 0.1 * wave(tick, 41)))
}

interface Flow {
  sources: number[]
  links: SankeyLinkData[]
  total: number
}

/** One sankey window: sources scaled by ±3%, split by fixed shares, conserved at every node. */
function flowAt(window: number): Flow {
  const sources = SOURCE_BASE.map((base, index) => Math.round(base * (1 + 0.03 * wave(window, index + 51))))
  const links: SankeyLinkData[] = []
  const inflow = Array.from({ length: FLOW_NODES.length }, () => 0)
  sources.forEach((total, source) => {
    const hops = FIRST_HOP.filter(([from]) => from === source)
    let left = total
    hops.forEach(([, to, share], index) => {
      const value = index === hops.length - 1 ? left : Math.round(total * share)
      left -= value
      inflow[to] = (inflow[to] ?? 0) + value
      links.push({ source, target: to, value })
    })
  })
  for (let provider = 4; provider <= 8; provider++) {
    const hops = SECOND_HOP.filter(([from]) => from === provider)
    const total = inflow[provider] ?? 0
    let left = total
    hops.forEach(([, to, share], index) => {
      const value = index === hops.length - 1 ? left : Math.round(total * share)
      left -= value
      links.push({ source: provider, target: to, value })
    })
  }
  return { sources, links, total: sources.reduce((sum, value) => sum + value, 0) }
}

const flow = computed(() => flowAt(flowWindow.value))

function kpiValue(key: KpiKey, tick: number, window: number, cities: number, degradedNow: boolean): number {
  switch (key) {
    case 'online':
      return cities + elsewhere(tick)
    case 'search':
      return flowAt(window).total
    case 'ai':
      return Math.round(3216 * (1 + 0.04 * wave(tick, 7)))
    case 'installs':
      return Math.round(486 * (1 + 0.05 * wave(tick, 11)))
    case 'sync':
      return degradedNow ? Math.round(410 + 30 * wave(tick, 13)) : Math.round(182 * (1 + 0.06 * wave(tick, 13)))
    default:
      return Math.round((3.1 + 0.2 * wave(tick, 17)) * 10) / 10
  }
}

const KPI_KEYS: KpiKey[] = ['online', 'search', 'ai', 'installs', 'sync', 'crash']
/** Change against an hour ago, in percent (sample); sync and crashes are lower-is-better. */
const KPI_DELTA: Record<KpiKey, number> = { online: 3.2, search: 1.1, ai: 6.4, installs: -0.8, sync: -2.4, crash: -0.3 }
const LOWER_IS_BETTER: KpiKey[] = ['sync', 'crash']

const cityTotal = computed(() => cityRows.value.reduce((sum, row) => sum + row.online, 0))

const kpiValues = computed(() => Object.fromEntries(KPI_KEYS.map(key => [
  key,
  kpiValue(key, kpiTick.value, flowWindow.value, cityTotal.value, degraded.value),
])) as Record<KpiKey, number>)

/** 30-sample strips; each KPI step appends one and drops the oldest. */
const history = reactive<Record<KpiKey, number[]>>(seedHistory())

function seedHistory(): Record<KpiKey, number[]> {
  const cities = (tick: number): number => CITIES.reduce((sum, city, index) => sum + cityOnline(city, index, Math.floor(tick / 2)), 0)
  return Object.fromEntries(KPI_KEYS.map(key => [
    key,
    Array.from({ length: HISTORY }, (_, index) => {
      const tick = index - HISTORY + 1
      return kpiValue(key, tick, Math.floor(tick / 6), cities(tick), false)
    }),
  ])) as Record<KpiKey, number[]>
}

type SparkSeriesList = Array<{ id: string, data: SparkPoint[], color: string }>

// Computed, not built in the template: the wall re-renders every second for the
// clock, and a fresh array each time would make every strip redraw with it.
const kpiSeries = computed(() => Object.fromEntries(KPI_KEYS.map(key => [
  key,
  [{ id: key, data: history[key].map((value, time) => ({ time, value })), color: key === 'sync' && degraded.value ? ORANGE : ACCENT }],
])) as Record<KpiKey, SparkSeriesList>)

const eastChina = reactive<number[]>(seedEastChina())

function seedEastChina(): number[] {
  const sh = CITIES[0]!
  const hz = CITIES[3]!
  return Array.from({ length: HISTORY }, (_, index) => {
    const tick = index - HISTORY + 1
    return cityOnline(sh, 0, tick) + cityOnline(hz, 3, tick)
  })
}

const eastChinaNow = computed(() => (cityRows.value[0]?.online ?? 0) + (cityRows.value[3]?.online ?? 0))

const eastSeries = computed<SparkSeriesList>(() => [
  { id: 'east', data: eastChina.map((value, time) => ({ time, value })), color: ChartPalette.categoricalVar(0) },
])

// ── Formatting ───────────────────────────────────────────────────────────────

const integerFormat = computed(() => new Intl.NumberFormat(localeTag.value, { maximumFractionDigits: 0 }))

function clockOf(second: number): string {
  const total = CLOCK_START + second
  const pad = (value: number): string => String(Math.floor(value)).padStart(2, '0')
  return `${pad(total / 3600)}:${pad((total / 60) % 60)}:${pad(total % 60)}`
}

const clock = computed(() => clockOf(sec.value))

function deltaTone(key: KpiKey): Tone {
  const delta = KPI_DELTA[key]
  if (delta === 0)
    return 'flat'
  const better = LOWER_IS_BETTER.includes(key) ? delta < 0 : delta > 0
  return better ? 'up' : 'down'
}

function deltaText(key: KpiKey): string {
  const delta = key === 'sync' && degraded.value ? 124.6 : KPI_DELTA[key]
  // A real minus sign, so signed figures line up.
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
  return `${sign}${Math.abs(delta).toFixed(1)}%`
}

function kpiTone(key: KpiKey): Tone {
  if (key === 'sync' && degraded.value)
    return 'down'
  return deltaTone(key)
}

interface KpiTile {
  key: KpiKey
  label: string
  value: number
  decimals?: number
  unit: string
  sub?: string
}

const kpis = computed<KpiTile[]>(() => {
  const labels = copy.value.kpi
  const values = kpiValues.value
  return [
    { key: 'online', label: labels.online, value: values.online, unit: '' },
    { key: 'search', label: labels.search, value: values.search, unit: '' },
    { key: 'ai', label: labels.ai, value: values.ai, unit: '', sub: `${copy.value.onDevice} 72.4%` },
    { key: 'installs', label: labels.installs, value: values.installs, unit: '' },
    { key: 'sync', label: labels.sync, value: values.sync, unit: 'ms' },
    { key: 'crash', label: labels.crash, value: values.crash, decimals: 1, unit: '' },
  ]
})

function visibleKpis(layout: Layout): KpiTile[] {
  return layout === 'wide' ? kpis.value : kpis.value.slice(0, 4)
}

// ── Map ──────────────────────────────────────────────────────────────────────

const FOCUS_CITIES: Record<string, string[]> = { peak: ['sh', 'hz'] }

const focusPages = computed<InsightPage[]>(() => [
  { key: 'peak', prose: copy.value.peak(integerFormat.value.format(eastChinaNow.value)) },
  { key: 'ai', prose: copy.value.aiShare },
  { key: 'market', prose: copy.value.market },
])

const ringed = computed(() => FOCUS_CITIES[focusPages.value[focusIndex.value]?.key ?? ''] ?? [])

function bubbleColor(row: CityRow): string {
  return row.id === 'tyo' && degraded.value ? ORANGE : ChartPalette.categoricalVar(0)
}

function bubbleBorderColor(row: CityRow): string {
  return ringed.value.includes(row.id) ? 'var(--tx-bui-ink, #e9eaec)' : 'transparent'
}

function bubbleBorderWidth(row: CityRow): number {
  return ringed.value.includes(row.id) ? 2 : 0
}

function onBubbleClick(row: CityRow): void {
  const page = focusPages.value.findIndex(entry => (FOCUS_CITIES[entry.key] ?? []).includes(row.id))
  if (page < 0)
    return
  focusIndex.value = page
  focusManual.value = true
}

function signed(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(1)}%`
}

// Typed `string` so Nitro's typed-route inference short-circuits. Served from
// `public/geo` (a vendored copy of johan/world.geo.json), same origin.
const WORLD_URL: string = '/geo/world-countries.geo.json'
// Plain-function view of $fetch: typed-route inference explodes on free URLs (TS2589).
const fetchGeoJson = $fetch as (url: string) => Promise<MapGeoJson>
let worldRequest: Promise<void> | null = null

function loadWorld(): void {
  if (world.value || worldRequest)
    return
  worldFailed.value = false
  worldRequest = fetchGeoJson(WORLD_URL)
    .then((geo) => {
      world.value = geo
    })
    .catch(() => {
      worldFailed.value = true
    })
    .finally(() => {
      worldRequest = null
    })
}

// ── Sankey ───────────────────────────────────────────────────────────────────

/** Each node's throughput: what leaves a source, what reaches everything else. */
const flowValues = computed(() => {
  const values = Array.from({ length: FLOW_NODES.length }, () => 0)
  for (const link of flow.value.links) {
    if (FLOW_NODES[link.source]?.column === 0)
      values[link.source] = (values[link.source] ?? 0) + link.value
    values[link.target] = (values[link.target] ?? 0) + link.value
  }
  return values
})

function buildFlowNodes(wide: boolean): SankeyNodeData[] {
  return FLOW_NODES.map((node, index) => ({
    name: zh.value ? node.zh : wide ? node.en : node.short,
    // Sources keep their own hue; providers and actions share one each.
    color: node.column === 0 ? FLOW_COLORS[index] : node.column === 1 ? ChartPalette.categoricalVar(4) : ChartPalette.categoricalVar(0),
    // Values ride on the labels only where there is room for them.
    value: wide ? flowValues.value[index] : undefined,
  }))
}

// Stable between windows: a new `nodes` array re-lays the sankey out, and a
// re-layout clears whatever the pointer is hovering.
const flowNodeSets = computed(() => ({ wide: buildFlowNodes(true), compact: buildFlowNodes(false) }))

function flowValueOf(name: string): number {
  const index = FLOW_NODES.findIndex(node => node.zh === name || node.en === name || node.short === name)
  return index < 0 ? 0 : flowValues.value[index] ?? 0
}

function formatCount(value: number): string {
  return integerFormat.value.format(value)
}

// ── Health ───────────────────────────────────────────────────────────────────

const services = computed(() => SERVICES.map((service) => {
  const slow = service.key === 'sync' && degraded.value
  return {
    key: service.key,
    name: zh.value ? service.zh : service.en,
    meta: slow ? copy.value.tokyo(kpiValues.value.sync) : service.meta,
    level: slow ? 2 : 3,
    tone: slow ? ORANGE : GREEN,
    state: slow ? copy.value.slow : copy.value.healthy,
    slow,
  }
}))

const healthyCount = computed(() => services.value.filter(service => !service.slow).length)

function visibleServices(layout: Layout) {
  return layout === 'column' ? services.value.slice(0, 4) : services.value
}

// ── Ticker ───────────────────────────────────────────────────────────────────

const EVENT_KINDS: TickerItem['kind'][] = ['install', 'search', 'ai', 'translate', 'sync']

function makeEvent(seq: number, at: number, kind?: TickerItem['kind']): TickerItem {
  return {
    id: seq,
    at,
    kind: kind ?? EVENT_KINDS[seq % EVENT_KINDS.length]!,
    city: (seq * 5 + 3) % CITIES.length,
    plugin: (seq * 3) % PLUGINS.length,
    amount: kind === undefined && seq % EVENT_KINDS.length === 4 ? 2 + (seq % 3) : 40 + ((seq * 37) % 90),
  }
}

let eventSeq = 0

function seedEvents(): TickerItem[] {
  eventSeq = 5
  return [4, 3, 2, 1, 0].map(seq => makeEvent(seq, -3 * (5 - seq)))
}

const events = ref<TickerItem[]>(seedEvents())

function pushEvent(kind?: TickerItem['kind']): void {
  eventSeq += 1
  events.value = [makeEvent(eventSeq, sec.value, kind), ...events.value].slice(0, 10)
}

function eventText(item: TickerItem): string {
  const labels = copy.value.events
  const city = CITIES[item.city]
  const cityName = city ? (zh.value ? city.zh : city.en) : ''
  const plugin = PLUGINS[item.plugin]
  switch (item.kind) {
    case 'install':
      return labels.install(cityName, plugin ? (zh.value ? plugin.zh : plugin.en) : '')
    case 'search':
      return labels.search(cityName)
    case 'ai':
      return labels.ai(cityName, item.amount)
    case 'translate':
      return labels.translate(cityName, item.amount)
    case 'sync':
      return labels.sync(cityName, item.amount)
    case 'alert':
      return labels.alert
    default:
      return labels.recover
  }
}

function visibleEvents(layout: Layout): TickerItem[] {
  return events.value.slice(0, layout === 'wide' ? 9 : layout === 'narrow' ? 6 : 5)
}

// ── Focus card ───────────────────────────────────────────────────────────────

const routeSegments = computed<AllocationSegment[]>(() => copy.value.routes.map((route, index) => ({
  ...route,
  color: ChartPalette.categoricalVar([4, 3, 5][index] ?? 0),
})))
const route = ref('local')

const topPlugins = computed(() => [
  { name: zh.value ? '翻译' : 'Translation', installs: 128 },
  { name: zh.value ? '剪贴板历史' : 'Clipboard History', installs: 96 },
  { name: zh.value ? 'JSON 工具' : 'JSON Formatter', installs: 54 },
])

function onFocusIndex(value: number): void {
  focusIndex.value = value
  focusManual.value = true
}

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null
  if (!next || !(event.currentTarget as HTMLElement).contains(next))
    focusHold.value = false
}

// ── Heartbeat ────────────────────────────────────────────────────────────────

function beat(): void {
  sec.value += 1
  const second = sec.value
  if (second % 2 === 0) {
    for (const key of KPI_KEYS) {
      history[key].push(kpiValues.value[key])
      history[key].shift()
    }
  }
  if (second % 3 === 0 && !tickerHold.value)
    pushEvent()
  if (second % 4 === 0) {
    eastChina.push(eastChinaNow.value)
    eastChina.shift()
  }
  if (second % 8 === 0 && !focusHold.value && !focusManual.value)
    focusIndex.value = (focusIndex.value + 1) % focusPages.value.length
  // A new window re-lays the sankey out and clears its hover, so it waits while
  // the pointer is on it.
  if (second % 12 === 0 && !flowHold.value)
    flowWindow.value += 1
  if (second === DEGRADE_AT)
    pushEvent('alert')
  if (second === RECOVER_AT)
    pushEvent('recover')
  later(1000, beat)
}

watch(live, (on) => {
  clearTimers()
  if (on)
    later(1000, beat)
})

function togglePause(): void {
  paused.value = !paused.value
}

// ── Visibility ───────────────────────────────────────────────────────────────

let visibilityObserver: IntersectionObserver | null = null
let offScreen = false

function syncHidden(): void {
  hidden.value = offScreen || (hasDocument() && document.visibilityState === 'hidden')
}

onMounted(() => {
  document.addEventListener('visibilitychange', syncHidden)
  // The frame's `enter` fires once and has no "left" counterpart, so the wall
  // watches for itself and stops ticking once it is scrolled away.
  if (rootRef.value && 'IntersectionObserver' in window) {
    visibilityObserver = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (!entry)
        return
      offScreen = !entry.isIntersecting || entry.intersectionRatio < 0.1
      syncHidden()
    }, { threshold: [0, 0.1] })
    visibilityObserver.observe(rootRef.value)
  }
})

onBeforeUnmount(() => {
  clearTimers()
  document.removeEventListener('visibilitychange', syncHidden)
  visibilityObserver?.disconnect()
  visibilityObserver = null
})

// ── Stage geometry ───────────────────────────────────────────────────────────

/** Mirrors the `@container template` breakpoints; width 0 is the unmeasured first frame. */
function layoutOf(width: number): Layout {
  if (width === 0)
    return 'column'
  return width < 640 ? 'narrow' : width < 960 ? 'column' : 'wide'
}

/** A panel's padding, title row and gap, which sit around its chart. */
const PANEL_CHROME = { column: 48, wide: 56 }

interface Geometry {
  rows?: string
  map: number
  sankey: number
}

/**
 * The column and wide walls fill the stage exactly: the grid rows are set from
 * here, and the two charts, whose heights are pixel props no container query
 * reaches, get their panel's height minus its chrome. Narrow scrolls instead.
 */
function geometry(width: number, height: number): Geometry {
  const layout = layoutOf(width)
  if (layout === 'narrow')
    return { map: 180, sankey: 200 }
  const stage = height || 600
  if (layout === 'column') {
    const bottom = 170
    const middle = Math.max(200, stage - 24 - 40 - 92 - bottom - 30)
    return { rows: `40px 92px ${middle}px ${bottom}px`, map: middle - PANEL_CHROME.column, sankey: bottom - PANEL_CHROME.column }
  }
  const bottom = clamp(Math.round(stage * 0.3), 200, 280)
  const middle = Math.max(220, stage - 32 - 48 - 124 - bottom - 36)
  return { rows: `48px 124px ${middle}px ${bottom}px`, map: middle - PANEL_CHROME.wide, sankey: bottom - PANEL_CHROME.wide }
}

// ── Timeline ─────────────────────────────────────────────────────────────────

function onEnter(): void {
  entered.value = true
  reduced.value = prefersReducedMotion()
  loadWorld()
}

function resetDemo(): void {
  clearTimers()
  sec.value = 0
  flowWindow.value = 0
  focusIndex.value = 0
  focusManual.value = false
  focusHold.value = false
  tickerHold.value = false
  flowHold.value = false
  paused.value = false
  route.value = 'local'
  Object.assign(history, seedHistory())
  eastChina.splice(0, eastChina.length, ...seedEastChina())
  events.value = seedEvents()
  if (entered.value) {
    reduced.value = prefersReducedMotion()
    if (live.value)
      later(1000, beat)
  }
}

watch(locale, resetDemo)

defineExpose({ resetDemo })
</script>

<template>
  <TemplateFrame :title="copy.frameTitle" :height="600" @enter="onEnter">
    <template #default="{ width, height }">
      <div
        ref="rootRef"
        class="ops"
        data-theme="dark"
        :class="[`is-${layoutOf(width)}`, { 'is-live': live, 'is-degraded': degraded }]"
        :style="{ gridTemplateRows: geometry(width, height).rows }"
      >
        <header class="ops__head">
          <span class="ops__live" :class="{ 'is-off': !live, 'is-latin': !zh }">
            <span class="ops__live-dot" aria-hidden="true" />
            {{ copy.live }}
          </span>
          <span class="ops__title">{{ copy.title }}</span>
          <span class="ops__scope">{{ copy.scope }}</span>
          <span class="ops__spacer" />
          <span class="ops__clock">{{ clock }} <span class="ops__zone">{{ copy.zone }}</span></span>
          <TxStatusBadge
            size="sm"
            :status="healthyCount === SERVICES.length ? 'success' : 'warning'"
            :icon="healthyCount === SERVICES.length ? 'i-carbon-checkmark-filled' : 'i-carbon-warning-alt'"
            :text="copy.servicesOk(healthyCount, SERVICES.length)"
          />
          <span v-if="reduced" class="ops__still">{{ copy.still(clock.slice(0, 5)) }}</span>
          <TxModeChip
            v-else
            :label="paused ? copy.paused : copy.running"
            :icon="paused ? 'i-carbon-pause-filled' : 'i-carbon-play-filled-alt'"
            :tone="paused ? 'warning' : 'success'"
            :title="paused ? copy.resumeHint : copy.pauseHint"
            @click="togglePause"
          />
        </header>

        <section class="ops__kpis" :aria-label="copy.kpiLabel">
          <div v-for="kpi in visibleKpis(layoutOf(width))" :key="kpi.key" class="ops-kpi" :class="`is-${kpiTone(kpi.key)}`">
            <span class="ops-kpi__label">{{ kpi.label }}</span>
            <span class="ops-kpi__row">
              <span class="ops-kpi__value">
                <TxTextMorph :text="kpi.value" :decimals="kpi.decimals" :locale="localeTag" />
                <span v-if="kpi.unit" class="ops-kpi__unit">{{ kpi.unit }}</span>
              </span>
              <span class="ops-kpi__spark">
                <TxSparkChart
                  v-if="entered"
                  :series="kpiSeries[kpi.key]"
                  theme="dark"
                  :animation="false"
                  :interactive="false"
                  :baseline="false"
                  :endpoint="false"
                  :line-width="1.5"
                  :padding="{ top: 4, right: 2, bottom: 4, left: 2 }"
                  :aria-label="kpi.label"
                />
              </span>
            </span>
            <span class="ops-kpi__delta">
              <template v-if="kpi.sub">{{ kpi.sub }}</template>
              <template v-else>
                <span
                  class="ops-kpi__arrow"
                  :class="(kpi.key === 'sync' && degraded ? 124.6 : KPI_DELTA[kpi.key]) >= 0 ? 'i-carbon-arrow-up-right' : 'i-carbon-arrow-down-right'"
                  aria-hidden="true"
                />
                {{ deltaText(kpi.key) }}
                <span class="ops-kpi__versus">{{ copy.versus }}</span>
              </template>
            </span>
          </div>
        </section>

        <div class="ops__middle">
          <section class="ops-panel ops-map">
            <div class="ops-panel__head">
              <span class="ops-panel__title">{{ copy.mapTitle }}</span>
              <span class="ops-panel__sub">{{ copy.mapSub(CITIES.length) }}</span>
            </div>
            <div class="ops-map__stage" :style="{ height: `${geometry(width, height).map}px` }" role="img" :aria-label="copy.mapLabel">
              <TxBubbleMap
                v-if="entered && world"
                :geo-json="world"
                :data="cityRows"
                lng="lng"
                lat="lat"
                value="online"
                name="name"
                :height="geometry(width, height).map"
                :min-radius="layoutOf(width) === 'wide' ? 5 : 3.5"
                :max-radius="layoutOf(width) === 'wide' ? 22 : 15"
                :bubble-color="bubbleColor"
                :bubble-border-color="bubbleBorderColor"
                :bubble-border-width="bubbleBorderWidth"
                @bubble-click="onBubbleClick"
              >
                <template #tooltip="{ row }">
                  <span class="ops-tip">
                    <strong>{{ row.name }}</strong>
                    <span>{{ integerFormat.format(row.online) }} {{ copy.onlineUnit }}</span>
                    <span class="ops-tip__muted">{{ signed(row.change) }} {{ copy.vsYesterday }}</span>
                  </span>
                </template>
              </TxBubbleMap>
              <p v-else-if="worldFailed" class="ops-map__note">
                {{ copy.mapFailed }}
              </p>
              <TxSkeleton v-else :height="geometry(width, height).map" :radius="10" />
            </div>
          </section>

          <section
            class="ops-panel ops-focus"
            @pointerenter="focusHold = true"
            @pointerleave="focusHold = false"
            @focusin="focusHold = true"
            @focusout="onFocusOut"
          >
            <TxInsightCards
              :active-index="focusIndex"
              :pages="focusPages"
              :title="copy.focusTitle"
              :previous-label="copy.previous"
              :next-label="copy.next"
              @update:active-index="onFocusIndex"
            >
              <template #default="{ page }">
                <div v-if="page.key === 'peak'" class="ops-card">
                  <div class="ops-card__metrics">
                    <TxInsightMetric
                      :label="cityRows[0]?.name ?? ''"
                      :color="ChartPalette.categoricalVar(0)"
                      :value="cityRows[0]?.change ?? 0"
                      :precision="1"
                      :detail="`${integerFormat.format(cityRows[0]?.online ?? 0)} ${copy.onlineUnit}`"
                    />
                    <TxInsightMetric
                      :label="cityRows[3]?.name ?? ''"
                      :color="ChartPalette.categoricalVar(4)"
                      :value="cityRows[3]?.change ?? 0"
                      :precision="1"
                      :detail="`${integerFormat.format(cityRows[3]?.online ?? 0)} ${copy.onlineUnit}`"
                    />
                  </div>
                  <div class="ops-card__chart">
                    <span class="ops-card__caption">{{ copy.eastChina }}</span>
                    <div class="ops-card__spark">
                      <TxSparkChart
                        v-if="entered"
                        :series="eastSeries"
                        theme="dark"
                        :animation="false"
                        :interactive="false"
                        :baseline="false"
                        :padding="{ top: 6, right: 4, bottom: 4, left: 2 }"
                        :aria-label="copy.eastChina"
                      />
                    </div>
                  </div>
                </div>

                <div v-else-if="page.key === 'ai'" class="ops-card">
                  <TxAllocationBar v-model="route" :segments="routeSegments" :aria-label="copy.routeLabel" />
                </div>

                <ol v-else class="ops-card ops-rank">
                  <li v-for="(plugin, index) in topPlugins" :key="plugin.name" class="ops-rank__row">
                    <span class="ops-rank__index">{{ index + 1 }}</span>
                    <span class="ops-rank__name">{{ plugin.name }}</span>
                    <span class="ops-rank__bar" aria-hidden="true">
                      <span class="ops-rank__fill" :style="{ width: `${Math.round((plugin.installs / topPlugins[0]!.installs) * 100)}%` }" />
                    </span>
                    <span class="ops-rank__count">{{ plugin.installs }}{{ copy.installsUnit ? ` ${copy.installsUnit}` : '' }}</span>
                  </li>
                </ol>
              </template>
            </TxInsightCards>
          </section>
        </div>

        <div class="ops__bottom">
          <section
            class="ops-panel ops-flow"
            @pointerenter="flowHold = true"
            @pointerleave="flowHold = false"
          >
            <div class="ops-panel__head">
              <span class="ops-panel__title">{{ copy.flowTitle }}</span>
              <span class="ops-panel__sub">{{ copy.flowSub }}</span>
            </div>
            <div class="ops-flow__stage" role="img" :aria-label="copy.flowLabel">
              <TxSankeyChart
                v-if="entered"
                :nodes="flowNodeSets[layoutOf(width) === 'wide' ? 'wide' : 'compact']"
                :links="flow.links"
                :height="geometry(width, height).sankey"
                :node-width="layoutOf(width) === 'wide' ? 10 : 6"
                :node-padding="layoutOf(width) === 'wide' ? 12 : 6"
                :node-label-layout="layoutOf(width) === 'wide' ? 'stacked' : 'inline'"
                :left="4"
                :right="4"
                :link-opacity="0.42"
                :format-value="formatCount"
              >
                <template #tooltip="{ params }">
                  <span class="ops-tip">
                    <strong>{{ params.name }}</strong>
                    <span>
                      {{ formatCount(params.type === 'link' ? params.link?.value ?? 0 : flowValueOf(params.name)) }}
                      {{ copy.perMinute }}
                    </span>
                  </span>
                </template>
              </TxSankeyChart>
            </div>
          </section>

          <section class="ops-panel ops-health">
            <div class="ops-panel__head">
              <span class="ops-panel__title">{{ copy.healthTitle }}</span>
              <span class="ops-panel__sub">{{ healthyCount }}/{{ SERVICES.length }}</span>
            </div>
            <ul class="ops-health__list">
              <li v-for="service in visibleServices(layoutOf(width))" :key="service.key" class="ops-health__row" :class="{ 'is-slow': service.slow }">
                <span class="ops-health__dot" aria-hidden="true">
                  <TxDotIndicator :color="service.tone" :size="7" />
                </span>
                <span class="ops-health__name">{{ service.name }}</span>
                <span class="ops-health__meta">{{ service.meta }}</span>
                <TxSignalMeter :value="service.level" :tone="service.tone" :label="`${service.name}: ${service.state}`" />
              </li>
              <li v-if="layoutOf(width) === 'column'" class="ops-health__more">
                {{ copy.moreHealthy(SERVICES.length - 4) }}
              </li>
            </ul>
          </section>

          <section
            class="ops-panel ops-events"
            @pointerenter="tickerHold = true"
            @pointerleave="tickerHold = false"
          >
            <div class="ops-panel__head">
              <span class="ops-panel__title">{{ copy.eventsTitle }}</span>
            </div>
            <!-- No live region: an event every few seconds would talk over everything. -->
            <TxTransition class="ops-events__ticker" group preset="slide-fade" tag="ul" :duration="260" :appear="false">
              <li
                v-for="item in visibleEvents(layoutOf(width))"
                :key="item.id"
                class="ops-events__item"
                :class="`is-${item.kind}`"
              >
                <span class="ops-events__time">{{ clockOf(item.at) }}</span>
                <span class="ops-events__text">{{ eventText(item) }}</span>
              </li>
            </TxTransition>
          </section>
        </div>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
/* A wall, not a page: dark in both site themes, panels on a darker ground,
   every row sized so the column and wide layouts fill the stage without a
   scrollbar. The five tokens below are derived from others with var() in
   :root and not redeclared by the dark blocks, so they would keep their
   light values inside this local dark scope. */
.ops {
  --ops-pad: 12px;
  --ops-gap: 10px;
  --tx-disabled-bg-color: var(--tx-fill-color-light);
  --tx-disabled-text-color: var(--tx-text-color-placeholder);
  --tx-disabled-border-color: var(--tx-border-color-light);
  --tx-chart-grid-line: color-mix(in srgb, var(--tx-chart-text-primary) 20%, transparent);
  --tx-skeleton-base-color: var(--tx-chart-semantic-skeleton);

  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ops-gap);
  box-sizing: border-box;
  height: 100%;
  padding: var(--ops-pad);
  overflow: hidden;
  background: var(--tx-bui-page, #0f0f10);
  color: var(--tx-bui-ink, #e9eaec);
  color-scheme: dark;
  font-size: 13px;
}

/* Header ------------------------------------------------------------------- */

.ops__head {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.ops__live {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-bui-red, #ff5c5c) 16%, transparent);
  color: var(--tx-bui-red, #ff5c5c);
  font-size: 11px;
  font-weight: 600;
}

.ops__live.is-latin {
  letter-spacing: 0.08em;
}

.ops__live.is-off {
  background: var(--tx-bui-field, #232427);
  color: var(--tx-bui-ink-3, #86898f);
}

.ops__live-dot {
  position: relative;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
}

.ops__title {
  flex: none;
  font-size: 14px;
  font-weight: 600;
}

.ops__scope {
  min-width: 0;
  overflow: hidden;
  color: var(--tx-bui-ink-3, #86898f);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ops__spacer {
  flex: 1;
}

.ops__clock {
  flex: none;
  color: var(--tx-bui-ink, #e9eaec);
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.ops__zone {
  color: var(--tx-bui-ink-3, #86898f);
  font-size: 11px;
}

.ops__still {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--tx-bui-ink-2, #b4b7bd);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* KPIs --------------------------------------------------------------------- */

.ops__kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ops-gap);
  min-height: 0;
}

.ops-kpi,
.ops-panel {
  position: relative;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  border-radius: 12px;
  background: var(--tx-bui-surface, #18191b);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #2a2b2e);
}

.ops-kpi {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 2px;
  padding: 9px 12px;
  overflow: hidden;
}

.ops-kpi__label {
  overflow: hidden;
  color: var(--tx-bui-ink-2, #b4b7bd);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ops-kpi__row {
  display: flex;
  min-width: 0;
  align-items: flex-end;
  gap: 8px;
}

.ops-kpi__value {
  display: inline-flex;
  min-width: 0;
  flex: none;
  align-items: baseline;
  gap: 4px;
  color: var(--tx-bui-ink, #e9eaec);
  font-size: 26px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.15;
}

.ops-kpi__unit {
  color: var(--tx-bui-ink-3, #86898f);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0;
}

/* A fixed box, so the tile keeps its size before the strip draws. */
.ops-kpi__spark {
  display: block;
  min-width: 0;
  height: 26px;
  flex: 1;
  margin-bottom: 3px;
}

.ops-kpi__delta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  color: var(--tx-bui-ink-2, #b4b7bd);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ops-kpi.is-up .ops-kpi__delta {
  color: var(--tx-bui-green, #3ecf7c);
}

.ops-kpi.is-down .ops-kpi__delta {
  color: var(--tx-bui-orange, #ff9a3d);
}

.ops-kpi__arrow {
  flex: none;
  font-size: 12px;
}

.ops-kpi__versus {
  overflow: hidden;
  color: var(--tx-bui-ink-3, #86898f);
  text-overflow: ellipsis;
}

/* Panels ------------------------------------------------------------------- */

.ops__middle,
.ops__bottom {
  display: grid;
  gap: var(--ops-gap);
  min-height: 0;
}

.ops__middle {
  grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
}

.ops__bottom {
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 0.9fr) minmax(0, 1fr);
}

/* Padding 10 + title row 20 + gap 8 + padding 10 = PANEL_CHROME.column. */
.ops-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  overflow: hidden;
}

.ops-panel__head {
  display: flex;
  height: 20px;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ops-panel__title {
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ops-panel__sub {
  flex: none;
  color: var(--tx-bui-ink-3, #86898f);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* Map ---------------------------------------------------------------------- */

/* The dark land fill (#2b2c31) sits too close to the panel's own surface to
   read; one step lighter, still derived from the scope's tokens. */
.ops-map__stage {
  --tx-chart-map-area: color-mix(in srgb, var(--tx-bui-ink, #e9eaec) 11%, var(--tx-bui-surface, #18191b));

  position: relative;
  flex: none;
}

.ops-map__note {
  display: grid;
  height: 100%;
  place-items: center;
  margin: 0;
  color: var(--tx-bui-ink-2, #b4b7bd);
  font-size: 12px;
}

/* No transition on the radius here: bubbles jump with each refresh, which on a
   wall reads as "new data" rather than a stutter. */
.ops-map__stage :deep(.tx-map__bubble) {
  cursor: pointer;
}

.ops-tip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--tx-bui-ink, #e9eaec);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.ops-tip strong {
  font-weight: 600;
}

.ops-tip__muted {
  color: var(--tx-bui-ink-3, #86898f);
}

/* Focus -------------------------------------------------------------------- */

/* Every page reserves the same prose height, so rotating never shifts the card. */
.ops-focus :deep(.tx-bui-insight-cards__prose) {
  min-height: calc(12.5px * 1.625 * 2);
}

.ops-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ops-card__metrics {
  display: flex;
  gap: 18px;
}

.ops-card__chart {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px 2px;
  border-radius: 8px;
  background: var(--tx-bui-inset, #141517);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #2a2b2e);
}

.ops-card__caption {
  color: var(--tx-bui-ink-3, #86898f);
  font-size: 11px;
}

.ops-card__spark {
  height: 40px;
}

.ops-rank {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ops-rank__row {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) minmax(40px, 1.2fr) auto;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
}

.ops-rank__index {
  color: var(--tx-bui-ink-3, #86898f);
  font-variant-numeric: tabular-nums;
}

.ops-rank__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ops-rank__bar {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--tx-bui-field, #232427);
}

.ops-rank__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--tx-chart-categorical-1, #4290f0);
}

.ops-rank__count {
  color: var(--tx-bui-ink-2, #b4b7bd);
  font-variant-numeric: tabular-nums;
}

/* Sankey ------------------------------------------------------------------- */

.ops-flow__stage {
  position: relative;
  min-height: 0;
  flex: 1;
}

.ops-flow__stage :deep(.tx-sankey__label) {
  font-size: 11px;
}

/* Health ------------------------------------------------------------------- */

.ops-health__list {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ops-health__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 19px;
  font-size: 12.5px;
}

.ops-health__dot {
  position: relative;
  display: inline-flex;
  flex: none;
}

.ops-health__name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ops-health__meta {
  flex: none;
  color: var(--tx-bui-ink-3, #86898f);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.ops-health__row.is-slow .ops-health__meta {
  color: var(--tx-bui-orange, #ff9a3d);
}

.ops-health__more {
  color: var(--tx-bui-ink-3, #86898f);
  font-size: 12px;
}

/* Ticker ------------------------------------------------------------------- */

.ops-events :deep(.ops-events__ticker) {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.ops-events :deep(.ops-events__ticker > ul) {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ops-events__item {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  line-height: 18px;
}

/* A leaving row stops taking space, so the rest slide up under the new one. */
.ops-events__item.tx-slide-fade-leave-active {
  position: absolute;
  right: 0;
  left: 0;
}

.ops-events__time {
  flex: none;
  color: var(--tx-bui-ink-3, #86898f);
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.ops-events__text {
  min-width: 0;
  overflow: hidden;
  color: var(--tx-bui-ink-2, #b4b7bd);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ops-events__item.is-alert .ops-events__text {
  color: var(--tx-bui-orange, #ff9a3d);
  font-weight: 500;
}

.ops-events__item.is-recover .ops-events__text {
  color: var(--tx-bui-green, #3ecf7c);
}

/* Pulses: only while live, never under reduced motion ----------------------- */

@media (prefers-reduced-motion: no-preference) {
  .ops.is-live .ops__live-dot::after,
  .ops.is-live .ops-health__row.is-slow .ops-health__dot::after {
    position: absolute;
    border-radius: 999px;
    box-shadow: 0 0 0 2px currentColor;
    content: '';
    inset: -3px;
    animation: ops-pulse 1.6s ease-out infinite;
  }

  .ops.is-live .ops-health__row.is-slow .ops-health__dot {
    color: var(--tx-bui-orange, #ff9a3d);
  }
}

@keyframes ops-pulse {
  from {
    opacity: 0.7;
    transform: scale(0.6);
  }

  to {
    opacity: 0;
    transform: scale(1.8);
  }
}

/* Breakpoints -------------------------------------------------------------- */

/* Narrow: one column that scrolls inside the stage. The rows have to be
   max-content: auto rows in a grid of definite height only grow into the free
   space, so with more content than stage they were squeezed below it and the
   panels overlapped instead of scrolling. */
@container template (max-width: 639.98px) {
  .ops {
    grid-template-rows: none;
    grid-auto-rows: max-content;
    align-content: start;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .ops__head {
    flex-wrap: wrap;
    row-gap: 8px;
  }

  .ops__spacer {
    display: none;
  }

  .ops__kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ops-kpi {
    min-height: 88px;
  }

  .ops__middle,
  .ops__bottom {
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: max-content;
  }

  .ops-flow__stage {
    flex: none;
    height: 200px;
  }

  /* At least four rows of events, however the ticker is mid-transition. */
  .ops-events :deep(.ops-events__ticker) {
    flex: none;
    min-height: calc(4 * 18px + 3 * 4px);
  }
}

@container template (min-width: 960px) {
  .ops {
    --ops-pad: 16px;
    --ops-gap: 12px;
  }

  .ops__title {
    font-size: 15px;
  }

  .ops__kpis {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .ops-kpi {
    padding: 12px 14px;
  }

  .ops-kpi__value {
    font-size: 32px;
  }

  .ops-kpi__spark {
    height: 32px;
  }

  .ops__middle {
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  }

  .ops__bottom {
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1.1fr);
  }

  /* Padding 12 + title row 20 + gap 12 + padding 12 = PANEL_CHROME.wide. */
  .ops-panel {
    gap: 12px;
    padding: 12px 16px;
  }

  .ops-panel__title {
    font-size: 13px;
  }

  .ops-health__list {
    gap: 8px;
  }

  .ops-health__row {
    font-size: 13px;
  }

  .ops-events__item {
    font-size: 12.5px;
    line-height: 20px;
  }

  .ops-card__spark {
    height: 64px;
  }
}

@container template (min-width: 1200px) {
  .ops-kpi__value {
    font-size: 40px;
  }

  .ops-kpi__spark {
    height: 38px;
  }
}
</style>
