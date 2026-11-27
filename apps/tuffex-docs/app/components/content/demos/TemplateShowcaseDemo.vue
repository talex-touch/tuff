<script setup lang="ts">
// Showcase: the "What's new" page of a made-up release, Tuff 2.6. It sells
// nothing — no price, checkout or download — and every figure on it is sample
// data, labelled as such. Three bands tell the update: a headline revealed
// line by line under a fixed flow light, six features on a 3D deck lit by a
// prism glow, and three metric cards that roll from 2.5's figures to 2.6's.
// The deltas beside them are TxMotionMetric's own arithmetic on `previous`, so
// they cannot disagree with the figures they sit next to.
//
// The page is dark in both site themes, by the spec's recipe: the root carries
// `data-theme="dark"` (the attribute, so UnoCSS `dark:` variants stay with the
// site) and `color-scheme: dark`, and redeclares the five tokens `:root`
// derives with `var()`. Nothing teleports out of it: the changelog is a sheet
// inside the stage.
//
// Playback starts on `@enter`: the headline reveals, the lead and actions fade
// in, the metrics roll and the deck turns every 4 s. The deck holds while the
// pointer is on it, while the changelog is open, off screen and in a hidden
// tab. Focus entering the deck, or any press or key inside the page, ends the
// tour for good — except on the deck's own pause button, which comes first in
// the tab order and can start it again. The prism light unmounts off screen.
// Reduced motion renders the final state and starts no timer.
import type { MotionCardItem } from '@talex-touch/tuffex/card-spread'
import type { MotionMetricData } from '@talex-touch/tuffex/motion-metric'
import type { TxMotionTextInstance } from '@talex-touch/tuffex/motion-text'
import type { ComponentPublicInstance } from 'vue'
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type Layout = 'narrow' | 'column' | 'wide'
type MetricId = 'launch' | 'search' | 'plugins'
type LogKind = 'new' | 'improved' | 'fixed'
type Format = (value: number | string, unit?: string) => string

interface Bi {
  zh: string
  en: string
}

interface Feature {
  id: string
  /** Carbon icon class, written out in full so UnoCSS extracts it. */
  icon: string
  /** The card's gradient, top left to bottom right. */
  tint: [string, string]
  /** White marks on a 120 × 120 canvas, drawn over the gradient. */
  motif: string
  title: Bi
  /** The one-line description the caption shows under the deck. */
  line: Bi
}

interface MetricPart {
  label: Bi
  before: number
  after: number
}

interface Metric {
  title: Bi
  /** Empty for a count. */
  unit: string
  digits: number
  /** Tuff 2.5's figure: where the roll starts, and `previous` once it lands. */
  before: number
  /** Tuff 2.6's figure. */
  after: number
  /** Two parts that average (timings) or add up (counts) to the figure, in both releases. */
  parts: MetricPart[]
}

interface MetricState {
  value: number
  /** Landed on 2.6: the delta shows, and the parts switch releases with it. */
  settled: boolean
}

interface LogGroup {
  kind: LogKind
  icon: string
  entries: Bi[]
}

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const localeTag = computed(() => (zh.value ? 'zh-CN' : 'en-US'))

function pick(text: Bi): string {
  return zh.value ? text.zh : text.en
}

const COPY = {
  zh: {
    frameTitle: '版本亮点',
    eyebrow: 'Tuff 2.6 · 版本亮点（示例）',
    headline: '更快的 CoreBox，\n更懂你的剪贴板',
    lead: '唤起更快、搜索先出首屏结果，剪贴板记得图片与文件，截图框选即可翻译。',
    openLog: '查看更新日志',
    replay: '重看演示',
    deckLabel: '版本亮点',
    itemLabel: '亮点',
    pause: '暂停自动轮播',
    play: '开始自动轮播',
    announce: (title: string, line: string) => `${title}：${line}`,
    metricsLabel: '版本指标（示例数据，对比 Tuff 2.5）',
    sampleTag: '示例 · 对比 2.5',
    logTitle: 'Tuff 2.6 更新日志',
    logSub: '相较 2.5 的变化',
    close: '关闭更新日志',
    logNote: '示例更新日志，不对应任何真实版本。',
    kinds: { new: '新功能', improved: '改进', fixed: '修复' } satisfies Record<LogKind, string>,
  },
  en: {
    frameTitle: 'Showcase',
    eyebrow: "Tuff 2.6 · What's new (sample)",
    headline: 'A faster CoreBox.\nA smarter clipboard.',
    lead: 'Opens faster, shows results sooner, remembers images and files, and translates whatever you frame.',
    openLog: 'View changelog',
    replay: 'Replay tour',
    deckLabel: 'Highlights',
    itemLabel: 'Highlight',
    pause: 'Pause autoplay',
    play: 'Start autoplay',
    announce: (title: string, line: string) => `${title}: ${line}`,
    metricsLabel: 'Release figures (sample data, compared with Tuff 2.5)',
    sampleTag: 'Sample · vs 2.5',
    logTitle: 'Tuff 2.6 changelog',
    logSub: 'Changes since 2.5',
    close: 'Close changelog',
    logNote: 'A sample changelog; it matches no real release.',
    kinds: { new: 'New', improved: 'Improved', fixed: 'Fixed' } satisfies Record<LogKind, string>,
  },
}

const copy = computed(() => (zh.value ? COPY.zh : COPY.en))

// ── Release content (sample data) ────────────────────────────────────────────

const FEATURES: Feature[] = [
  {
    id: 'corebox',
    icon: 'i-carbon-flash',
    tint: ['#3b82f6', '#8b5cf6'],
    motif: [
      '<g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">',
      '<rect x="22" y="48" width="80" height="24" rx="12" fill="#fff" fill-opacity=".2"/>',
      '<circle cx="36" cy="60" r="5"/><path d="M40 64l4 4M54 54v12"/>',
      '<path d="M6 52h10M2 60h14M8 68h8" stroke-opacity=".65"/>',
      '</g>',
    ].join(''),
    title: { zh: '秒开 CoreBox', en: 'Instant CoreBox' },
    line: { zh: '常驻预热，按下 ⌥Space 就能输入', en: 'Kept warm, so ⌥Space is ready to type' },
  },
  {
    id: 'clipboard',
    icon: 'i-carbon-paste',
    tint: ['#10b981', '#0ea5e9'],
    motif: [
      '<rect x="34" y="26" width="58" height="44" rx="7" fill="#fff" fill-opacity=".35"/>',
      '<rect x="28" y="34" width="58" height="44" rx="7" fill="#fff" fill-opacity=".55"/>',
      '<rect x="22" y="42" width="58" height="44" rx="7" fill="#fff" fill-opacity=".92"/>',
      '<circle cx="36" cy="56" r="5" fill="#10b981"/>',
      '<path d="M26 82l16-16 10 10 8-6 16 12z" fill="#0ea5e9"/>',
    ].join(''),
    title: { zh: '剪贴板历史', en: 'Clipboard history' },
    line: { zh: '图片、文件和富文本都能找回', en: 'Images, files and rich text, all kept' },
  },
  {
    id: 'translate',
    icon: 'i-carbon-translate',
    tint: ['#f59e0b', '#ef4444'],
    motif: [
      '<g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">',
      '<rect x="14" y="30" width="56" height="40" rx="6" stroke-dasharray="5 4"/>',
      '<path d="M22 44h40M22 56h28"/><path d="M72 44q16 0 16 18M83 57l5 5 5-5"/>',
      '</g>',
      '<rect x="60" y="66" width="48" height="30" rx="7" fill="#fff" fill-opacity=".92"/>',
      '<path d="M68 77h30M68 86h20" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/>',
    ].join(''),
    title: { zh: '截图翻译', en: 'Screenshot translate' },
    line: { zh: '框选即识别，译文直接写回剪贴板', en: 'Frame any text; the translation lands on your clipboard' },
  },
  {
    id: 'ranking',
    icon: 'i-carbon-search',
    tint: ['#6366f1', '#ec4899'],
    motif: [
      '<rect x="18" y="26" width="84" height="16" rx="8" fill="#fff" fill-opacity=".95"/>',
      '<rect x="18" y="50" width="84" height="16" rx="8" fill="#fff" fill-opacity=".45"/>',
      '<rect x="18" y="74" width="84" height="16" rx="8" fill="#fff" fill-opacity=".3"/>',
      '<circle cx="28" cy="34" r="4" fill="#6366f1"/>',
      '<path d="M38 34h30" stroke="#6366f1" stroke-width="3" stroke-linecap="round"/>',
      '<path d="M90 28.5l1.5 3.9 4.2.3-3.2 2.6 1 4.1-3.5-2.3-3.5 2.3 1-4.1-3.2-2.6 4.2-.3z" fill="#f59e0b"/>',
    ].join(''),
    title: { zh: '更懂你的排序', en: 'Smarter ranking' },
    line: { zh: '常用的应用和命令排在前面', en: 'What you use most ranks first' },
  },
  {
    id: 'reload',
    icon: 'i-carbon-renew',
    tint: ['#14b8a6', '#84cc16'],
    motif: [
      '<g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">',
      '<path d="M88 60a28 28 0 1 1-8.2-19.8M84 26v16H68" stroke-width="7"/>',
      '<path d="M54 52l-6 8 6 8M66 52l6 8-6 8" stroke-width="4"/>',
      '</g>',
    ].join(''),
    title: { zh: '插件热重载', en: 'Plugin hot reload' },
    line: { zh: '保存 manifest.json 或 index.js 即生效', en: 'Save manifest.json or index.js to reload' },
  },
  {
    id: 'permission',
    icon: 'i-carbon-locked',
    tint: ['#a855f7', '#6366f1'],
    motif: [
      '<path d="M44 54V44a16 16 0 0 1 32 0v10" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>',
      '<rect x="34" y="52" width="52" height="40" rx="9" fill="#fff" fill-opacity=".94"/>',
      '<path d="M50 72l7 7 14-14" fill="none" stroke="#a855f7" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
    ].join(''),
    title: { zh: '按需授权', en: 'Permissions on demand' },
    line: { zh: '插件首次调用时才询问，随时可撤销', en: 'Asked on first use, revocable any time' },
  },
]

/** Gradient, motif and a scrim under the title, as one `background` value: no image request. */
function artOf(feature: Feature): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">${feature.motif}</svg>`
  const [from, to] = feature.tint
  return [
    'linear-gradient(to top, rgb(6 8 18 / 50%), transparent 50%)',
    `url("data:image/svg+xml,${encodeURIComponent(svg)}") center 38% / 58% no-repeat`,
    `linear-gradient(135deg, ${from}, ${to})`,
  ].join(', ')
}

const ART = FEATURES.map(artOf)

const METRIC_IDS: MetricId[] = ['launch', 'search', 'plugins']

const METRICS: Record<MetricId, Metric> = {
  launch: {
    title: { zh: '冷启动', en: 'Cold start' },
    unit: 's',
    digits: 1,
    before: 2.1,
    after: 1.3,
    parts: [
      { label: { zh: 'macOS', en: 'macOS' }, before: 1.9, after: 1.2 },
      { label: { zh: 'Windows', en: 'Windows' }, before: 2.3, after: 1.4 },
    ],
  },
  search: {
    title: { zh: '搜索首帧', en: 'First results' },
    unit: 'ms',
    digits: 0,
    before: 58,
    after: 42,
    parts: [
      { label: { zh: '应用', en: 'Apps' }, before: 51, after: 36 },
      { label: { zh: '文件', en: 'Files' }, before: 65, after: 48 },
    ],
  },
  plugins: {
    title: { zh: '可用插件', en: 'Plugins' },
    unit: '',
    digits: 0,
    before: 96,
    after: 120,
    parts: [
      { label: { zh: '官方', en: 'Official' }, before: 20, after: 24 },
      { label: { zh: '社区', en: 'Community' }, before: 76, after: 96 },
    ],
  },
}

/**
 * TxMotionMetric formats everything through one callback: the figure and each
 * part arrive with their `unit` (empty for a count), and the delta it derives
 * from `previous` arrives without one. So a missing unit means a delta, which
 * gets a sign and the metric's own unit. The percentage beside it is the
 * component's, with a hyphen-minus, which the sign here matches.
 */
function formatterOf(metric: Metric): Format {
  return (value, unit) => {
    if (typeof value === 'string')
      return value
    if (unit === undefined) {
      const sign = value > 0 ? '+' : value < 0 ? '-' : ''
      return `${sign}${Math.abs(value).toFixed(metric.digits)}${metric.unit ? ` ${metric.unit}` : ''}`
    }
    return `${value.toFixed(metric.digits)}${unit ? ` ${unit}` : ''}`
  }
}

const FORMAT: Record<MetricId, Format> = {
  launch: formatterOf(METRICS.launch),
  search: formatterOf(METRICS.search),
  plugins: formatterOf(METRICS.plugins),
}

const LOG: LogGroup[] = [
  {
    kind: 'new',
    icon: 'i-carbon-add',
    entries: [
      { zh: 'CoreBox 常驻预热，按下 ⌥Space 就能输入', en: 'CoreBox stays warm, so ⌥Space is ready to type' },
      { zh: '剪贴板历史收录图片、文件与富文本', en: 'Clipboard history keeps images, files and rich text' },
      { zh: '截图翻译：原生 OCR 没把握时交给 AI 重读', en: 'Screenshot translate: low-confidence OCR gets a second read by AI' },
    ],
  },
  {
    kind: 'improved',
    icon: 'i-carbon-upgrade',
    entries: [
      { zh: '搜索先出首屏结果，其余随后补齐', en: 'Search shows the first screen of results before the rest' },
      { zh: '常用的应用与命令排得更靠前', en: 'Apps and commands you use most rank higher' },
      { zh: '保存 manifest.json 或 index.js 后插件自动重载', en: 'Plugins reload when manifest.json or index.js is saved' },
      { zh: '插件权限在首次调用时询问，可随时撤销', en: 'Plugin permissions are asked on first use and can be revoked' },
    ],
  },
  {
    kind: 'fixed',
    icon: 'i-carbon-debug',
    entries: [
      { zh: '多显示器下 CoreBox 偶尔出现在上一块屏幕', en: 'CoreBox sometimes opened on the previous display' },
      { zh: '复制大图后短暂卡顿', en: 'A brief stall after copying a large image' },
      { zh: '输入法组字时误触发搜索', en: 'Searches fired while an input method was still composing' },
    ],
  },
]

// ── State ────────────────────────────────────────────────────────────────────

/** One card's turn on the deck. */
const AUTOPLAY_MS = 4000
/** The lead and then the actions follow the headline's first line. */
const LEAD_AT = 320
const ACTIONS_AT = 560
/**
 * The headline shows when its reveal starts, which waits for the headline itself
 * to be on screen. If the reveal cannot run at all, it shows plainly by this time.
 */
const HEADLINE_FALLBACK_AT = 1200
/** The first metric starts rolling here; each next one a stagger later. */
const METRICS_AT = 600
const METRIC_STAGGER = 160
/** A roll is this many evenly spaced values, the last being 2.6's figure. */
const ROLL_STEPS = 4
const ROLL_MS = 260
/** Keys that only move focus or modify a press: tabbing through the page is not using it. */
const PASSIVE_KEYS = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta'])

/**
 * TxCarousel3D at `lg`, its largest size: the band the cards move in, which the
 * wide deck zooms; what keeps its size under it — the deck's padding, the
 * caption at its wide min-height and the dots; and the width that shows the
 * front card with both neighbours whole.
 */
const DECK_BAND = 288
const DECK_CHROME = 10 + 50 + 28
const DECK_SPAN = 540
/** Past this the cards outgrow the type around them. */
const DECK_ZOOM_MAX = 2
/**
 * The wide band's fixed parts, as the stylesheet sets them: `--sc-pad`,
 * `--sc-gap`, and the split's column gap and deck share. Then the metrics row
 * and the hero above the deck, which are measured; these stand in for them
 * until they are, and the hero's also decides between the two arrangements,
 * which must not hang on a height only one of them has.
 */
const WIDE = { pad: 22, gap: 14, columnGap: 24, deckShare: 0.6, metrics: 116, hero: 260 }

function seedMetrics(settled: boolean): Record<MetricId, MetricState> {
  const seed = (id: MetricId): MetricState => ({ value: settled ? METRICS[id].after : METRICS[id].before, settled })
  return { launch: seed('launch'), search: seed('search'), plugins: seed('plugins') }
}

const rootRef = ref<HTMLElement | null>(null)
const heroRef = ref<HTMLElement | null>(null)
const metricsRef = ref<HTMLElement | null>(null)
const logRef = ref<HTMLElement | null>(null)
const headlineRef = ref<TxMotionTextInstance | null>(null)
const logTrigger = ref<ComponentPublicInstance | null>(null)

const entered = ref(false)
const reduced = ref(false)
/** Off screen or in a hidden tab. */
const hidden = ref(false)
/** Bumped to play the headline's reveal; it never plays by itself. */
const headlineKey = ref(0)
/**
 * Stays on once shown. A replay hides the lines itself: the reveal starts each
 * one below its mask, in the same frame the static text gives way to it.
 */
const headlineShown = ref(false)
const leadShown = ref(false)
/** Stays on once shown: a replay should not pull the button it was started from. */
const actionsShown = ref(false)
const current = ref(0)
/** The tour: on from `@enter` until the reader does anything, or presses pause. */
const autoplay = ref(false)
const deckHover = ref(false)
/** Restarts the progress ring with every armed turn. */
const slideTick = ref(0)
/** What the deck's own live line says; written only for the reader's own moves. */
const announcement = ref('')
const logOpen = ref(false)
const metricState = reactive(seedMetrics(false))
/**
 * The hero's and the metrics' heights: the wide deck zooms into what they
 * leave. Neither changes with the zoom. The deck's own box would, since its
 * row grows with the cards, and a zoom read from it could only ever grow.
 */
const bandHeights = reactive({ hero: 0, metrics: 0 })

const logId = `sc-log-${useId().replace(/[^\w-]/g, '')}`

const turning = computed(() => autoplay.value && !deckHover.value && !logOpen.value && !hidden.value)
/** Behind the changelog's scrim the deck is not on show, so the glow rests too. */
const glowOn = computed(() => entered.value && !hidden.value && !logOpen.value)

const cards = computed<MotionCardItem[]>(() => FEATURES.map(feature => ({
  id: feature.id,
  title: pick(feature.title),
  description: pick(feature.line),
})))

function metricData(id: MetricId): MotionMetricData {
  const metric = METRICS[id]
  const state = metricState[id]
  return {
    title: pick(metric.title),
    value: state.value,
    unit: metric.unit,
    // Mid-roll values belong to neither release: the delta waits for the landing.
    previous: state.settled ? metric.before : undefined,
    metrics: metric.parts.map((part, index) => ({
      id: `${id}-${index}`,
      label: pick(part.label),
      value: state.settled ? part.after : part.before,
      unit: metric.unit,
    })),
  }
}

// A computed rather than a call in the template: a fresh object per render would
// re-render all three cards every time the deck turns.
const metricCards = computed(() => METRIC_IDS.map(id => ({ id, data: metricData(id) })))

// ── Timers and visibility ────────────────────────────────────────────────────

let timers: ReturnType<typeof setTimeout>[] = []
let slideTimer: ReturnType<typeof setTimeout> | undefined
let visibilityObserver: IntersectionObserver | null = null
let bandObserver: ResizeObserver | null = null
let offScreen = false
/** A replay starts a tick late; it must not arm timers for a page already gone. */
let disposed = false

function later(ms: number, run: () => void): void {
  const id = setTimeout(() => {
    timers = timers.filter(timer => timer !== id)
    run()
  }, ms)
  timers.push(id)
}

function clearSlide(): void {
  if (slideTimer !== undefined)
    clearTimeout(slideTimer)
  slideTimer = undefined
}

function clearTimers(): void {
  for (const id of timers)
    clearTimeout(id)
  timers = []
  clearSlide()
}

function prefersReducedMotion(): boolean {
  return hasWindow()
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function syncHidden(): void {
  hidden.value = offScreen || (hasDocument() && document.visibilityState === 'hidden')
}

/** Mirrors the `@container template` breakpoints; width 0 is the unmeasured first frame. */
function layoutOf(width: number): Layout {
  if (width === 0)
    return 'column'
  return width < 640 ? 'narrow' : width < 960 ? 'column' : 'wide'
}

/** How far the `lg` deck can zoom in a box this size. */
function zoomIn(width: number, height: number): number {
  return Math.min(width / DECK_SPAN, (height - DECK_CHROME) / DECK_BAND)
}

/**
 * The wide band puts the hero beside the deck or above it, whichever leaves the
 * deck more room — beside on a short, wide stage, above on a tall one — and the
 * deck zooms to fill what it got. The stage's height is a number the container
 * query cannot read, hence the class and the custom property.
 */
function stageAttrs(width: number, height: number) {
  let split = false
  let zoom = 1
  if (layoutOf(width) === 'wide' && height > 0) {
    const inner = width - WIDE.pad * 2
    // The row over the metrics, which the hero shares with the deck or sits atop.
    const row = height - WIDE.pad * 2 - (bandHeights.metrics || WIDE.metrics) - WIDE.gap
    const beside = zoomIn((inner - WIDE.columnGap) * WIDE.deckShare, row)
    split = beside >= zoomIn(inner, row - WIDE.hero - WIDE.gap)
    const fit = split ? beside : zoomIn(inner, row - (bandHeights.hero || WIDE.hero) - WIDE.gap)
    zoom = Math.min(DECK_ZOOM_MAX, Math.max(1, fit))
  }
  return { class: { 'is-split': split }, style: { '--sc-deck-zoom': zoom.toFixed(3) } }
}

// ── Deck ─────────────────────────────────────────────────────────────────────

/**
 * Arms one turn. Every hold clears it and every release arms a full turn again,
 * so a card the reader paused on is never swapped out a moment after they leave.
 */
function scheduleSlide(): void {
  clearSlide()
  if (!turning.value)
    return
  slideTick.value++
  slideTimer = setTimeout(() => {
    slideTimer = undefined
    current.value = (current.value + 1) % FEATURES.length
    scheduleSlide()
  }, AUTOPLAY_MS)
}

watch(turning, scheduleSlide)

/**
 * TxCarousel3D emits `change` only from its own selection — a key, a click, a
 * drag, a dot — never when autoplay moves `v-model`. That makes it the one
 * signal that the reader moved the deck, which is when the live line speaks.
 */
function onDeckChange(_item: MotionCardItem, index: number): void {
  const feature = FEATURES[index]
  if (feature)
    announcement.value = copy.value.announce(pick(feature.title), pick(feature.line))
}

/** Any press or key inside the page ends the tour, except on the pause button and plain focus moves. */
function onReaderInput(event: PointerEvent | KeyboardEvent): void {
  if (!autoplay.value)
    return
  if ('key' in event && PASSIVE_KEYS.has(event.key))
    return
  if (event.target instanceof Element && event.target.closest('[data-autoplay-toggle]'))
    return
  autoplay.value = false
}

// ── Changelog ────────────────────────────────────────────────────────────────

function openLog(): void {
  if (logOpen.value)
    return
  logOpen.value = true
  // Only ever from a click on the trigger; nothing on a timer moves focus.
  void nextTick(() => logRef.value?.focus({ preventScroll: true }))
}

/**
 * The sheet's own ways out — the close button, the scrim, Escape — hand focus
 * back to the trigger. A click on the scrim leaves it on <body>, or on the
 * expanded overlay's panel, so it is not enough to look inside the sheet. A
 * reset only rescues focus from inside. The trigger sits in the page, which is
 * inert until this close renders; TxMotionButton's root is the <button>.
 */
function closeLog(fromSheet: boolean): void {
  if (!logOpen.value)
    return
  const focused = hasDocument() ? document.activeElement : null
  const inside = !!focused && !!logRef.value?.contains(focused)
  logOpen.value = false
  if (fromSheet || inside)
    void nextTick(() => (logTrigger.value?.$el as HTMLElement | undefined)?.focus({ preventScroll: true }))
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !logOpen.value || event.defaultPrevented)
    return
  // Consumed, so an expanded TemplateFrame stays open behind the sheet.
  event.preventDefault()
  closeLog(true)
}

// ── Timeline ─────────────────────────────────────────────────────────────────

function rollMetric(id: MetricId, startAt: number): void {
  const metric = METRICS[id]
  for (let step = 1; step <= ROLL_STEPS; step++) {
    later(startAt + (step - 1) * ROLL_MS, () => {
      const value = metric.before + (metric.after - metric.before) * step / ROLL_STEPS
      metricState[id].value = Number(value.toFixed(metric.digits))
      metricState[id].settled = step === ROLL_STEPS
    })
  }
}

/** The final frame, which reduced motion shows from the start. */
function settle(): void {
  headlineShown.value = true
  leadShown.value = true
  actionsShown.value = true
  Object.assign(metricState, seedMetrics(true))
}

function start(): void {
  if (disposed)
    return
  clearTimers()
  if (reduced.value) {
    settle()
    return
  }
  headlineKey.value++
  later(LEAD_AT, () => {
    leadShown.value = true
  })
  later(ACTIONS_AT, () => {
    actionsShown.value = true
  })
  later(HEADLINE_FALLBACK_AT, () => {
    headlineShown.value = true
  })
  METRIC_IDS.forEach((id, index) => rollMetric(id, METRICS_AT + index * METRIC_STAGGER))
  // The first turn is armed by the `turning` watcher.
  autoplay.value = true
}

function onEnter(): void {
  entered.value = true
  reduced.value = prefersReducedMotion()
  start()
}

function resetDemo(): void {
  clearTimers()
  autoplay.value = false
  current.value = 0
  leadShown.value = false
  announcement.value = ''
  Object.assign(metricState, seedMetrics(false))
  closeLog(false)
  reduced.value = prefersReducedMotion()
  if (reduced.value)
    settle()
  // A tick later, so the deck has rewound and the old run is gone before the new one starts.
  else if (entered.value)
    void nextTick(start)
}

watch(locale, resetDemo)

onMounted(() => {
  reduced.value = prefersReducedMotion()
  if (reduced.value)
    settle()
  if (!hasWindow())
    return
  document.addEventListener('visibilitychange', syncHidden)
  syncHidden()
  if (rootRef.value && 'IntersectionObserver' in window) {
    visibilityObserver = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (!entry)
        return
      offScreen = !entry.isIntersecting || entry.intersectionRatio < 0.1
      syncHidden()
    }, { threshold: [0, 0.1] })
    visibilityObserver.observe(rootRef.value)
  }
  if (heroRef.value && metricsRef.value && 'ResizeObserver' in window) {
    const hero = heroRef.value
    const metrics = metricsRef.value
    bandObserver = new ResizeObserver(() => {
      bandHeights.hero = hero.offsetHeight
      bandHeights.metrics = metrics.offsetHeight
    })
    bandObserver.observe(hero)
    bandObserver.observe(metrics)
  }
})

onBeforeUnmount(() => {
  disposed = true
  clearTimers()
  if (hasDocument())
    document.removeEventListener('visibilitychange', syncHidden)
  visibilityObserver?.disconnect()
  visibilityObserver = null
  bandObserver?.disconnect()
  bandObserver = null
})

defineExpose({ resetDemo })
</script>

<template>
  <TemplateFrame :title="copy.frameTitle" :height="680" @enter="onEnter">
    <template #default="{ width, height }">
      <div
        ref="rootRef"
        class="sc"
        v-bind="stageAttrs(width, height)"
        data-theme="dark"
        @pointerdown.capture="onReaderInput"
        @keydown.capture="onReaderInput"
        @keydown="onKeydown"
      >
        <!-- Inert under the changelog, which is modal to the stage only. -->
        <div class="sc__page" :inert="logOpen ? true : undefined">
          <div ref="heroRef" class="sc-hero">
            <TxFlowLight variant="corners" />
            <p class="sc-hero__eyebrow">
              <span class="sc-hero__spark" aria-hidden="true" />
              {{ copy.eyebrow }}
            </p>
            <!-- Hidden until its reveal starts. A replay requested off screen waits
                 for the headline to scroll in, and the static text must not show
                 for a frame first. A manual replay also stays requested after it
                 plays, and would run again each time the stage scrolls back in;
                 reset() clears the request. -->
            <TxMotionText
              ref="headlineRef"
              class="sc-hero__title"
              :class="{ 'is-shown': headlineShown }"
              tag="h2"
              variant="text-reveal"
              trigger="manual"
              :text="copy.headline"
              :locale="localeTag"
              :replay-key="headlineKey"
              @animation-start="headlineShown = true"
              @animation-complete="headlineRef?.reset()"
            />
            <p class="sc-hero__lead" :class="{ 'is-shown': leadShown }">
              {{ copy.lead }}
            </p>
            <div class="sc-hero__actions" :class="{ 'is-shown': actionsShown }">
              <TxMotionButton
                ref="logTrigger"
                class="sc-cta sc-cta--primary"
                variant="slide-arrow"
                active-icon="arrow-right"
                hover-background="#ffffff"
                :label="copy.openLog"
                aria-haspopup="dialog"
                :aria-expanded="logOpen"
                :aria-controls="logId"
                @click="openLog"
              >
                <template #icon>
                  <span class="i-carbon-catalog" />
                </template>
              </TxMotionButton>
              <TxMotionButton
                class="sc-cta"
                variant="rotate"
                icon="refresh"
                hover-background="rgb(255 255 255 / 14%)"
                :label="copy.replay"
                @click="resetDemo"
              />
            </div>
          </div>

          <div class="sc-deck">
            <!-- The light falls from the top edge onto the cards, away from the
                 caption. It grows with the stage on expand, which must not
                 retract it, hence collapse-on-grow off. -->
            <TxPrismGlow
              class="sc-deck__glow"
              :active="glowOn"
              placement="top"
              :intensity="0.7"
              :duration="8"
              :collapse-on-grow="false"
            >
              <div class="sc-deck__stage">
                <!-- First in the tab order, as a carousel's rotation control should
                     be, and outside the hold area, so pointing at it does not pause
                     the very tour it starts. Its data flag exempts it from the
                     input capture on the root. It sits in the glow's corner, not
                     the stage's: on a tall deck the stage is centred well below it. -->
                <button
                  v-if="entered && !reduced"
                  type="button"
                  class="sc-autoplay"
                  data-autoplay-toggle
                  :aria-label="autoplay ? copy.pause : copy.play"
                  :style="{ '--sc-turn': `${AUTOPLAY_MS}ms` }"
                  @click="autoplay = !autoplay"
                >
                  <svg v-if="turning" :key="slideTick" class="sc-autoplay__ring" viewBox="0 0 28 28" aria-hidden="true">
                    <circle cx="14" cy="14" r="12" pathLength="100" />
                  </svg>
                  <span :class="autoplay ? 'i-carbon-pause-filled' : 'i-carbon-play-filled-alt'" aria-hidden="true" />
                </button>
                <!-- The pointer holds the deck while it is over it. Focus arriving
                     on it ends the tour: a deck that turns under focus moves the
                     card the reader is on. -->
                <div
                  class="sc-deck__hold"
                  @pointerenter="deckHover = true"
                  @pointerleave="deckHover = false"
                  @focusin="autoplay = false"
                >
                  <TxCarousel3D
                    v-model="current"
                    class="sc-deck__carousel"
                    variant="card-carousel"
                    :items="cards"
                    :size="layoutOf(width) === 'wide' ? 'lg' : 'md'"
                    loop
                    :controls="false"
                    :aria-label="copy.deckLabel"
                    :item-label="copy.itemLabel"
                    @change="onDeckChange"
                  >
                    <template #item="{ item, index, active }">
                      <!-- The slide is a button named by the title: only spans in here. -->
                      <span class="sc-card" :class="{ 'is-active': active }" :style="{ background: ART[index] }">
                        <span class="sc-card__icon" aria-hidden="true">
                          <span :class="FEATURES[index]?.icon" />
                        </span>
                        <span class="sc-card__title">{{ item.title }}</span>
                      </span>
                    </template>
                    <!-- The caption region is always aria-live, so a deck that turns
                         by itself would speak every 4 s. Its content is hidden from
                         assistive tech; the live line below speaks instead, and only
                         for the reader's own moves. -->
                    <template #caption="{ item }">
                      <Transition name="sc-swap">
                        <span :key="item.id" class="sc-caption" aria-hidden="true">
                          <span class="sc-caption__title">{{ item.title }}</span>
                          <span class="sc-caption__line">{{ item.description }}</span>
                        </span>
                      </Transition>
                    </template>
                  </TxCarousel3D>
                </div>
              </div>
            </TxPrismGlow>
            <p class="sc-sr" aria-live="polite">
              {{ announcement }}
            </p>
          </div>

          <div ref="metricsRef" class="sc-metrics" role="group" :aria-label="copy.metricsLabel">
            <TxMotionMetric
              v-for="card in metricCards"
              :key="card.id"
              class="sc-metric"
              variant="mono-users"
              size="sm"
              :data="card.data"
              :format-value="FORMAT[card.id]"
            >
              <template #header>
                <span class="sc-metric__title">{{ card.data.title }}</span>
              </template>
              <template #avatar>
                <span class="sc-metric__tag">{{ copy.sampleTag }}</span>
              </template>
            </TxMotionMetric>
          </div>
        </div>

        <div class="sc-scrim" :class="{ 'is-open': logOpen }" aria-hidden="true" @click="closeLog(true)" />
        <div
          :id="logId"
          ref="logRef"
          class="sc-log"
          :class="{ 'is-open': logOpen }"
          role="dialog"
          :aria-labelledby="`${logId}-title`"
          tabindex="-1"
          :inert="logOpen ? undefined : true"
        >
          <TxFlowLight variant="rim" />
          <header class="sc-log__head">
            <div class="sc-log__heading">
              <h3 :id="`${logId}-title`" class="sc-log__title">
                {{ copy.logTitle }}
              </h3>
              <p class="sc-log__sub">
                {{ copy.logSub }}
              </p>
            </div>
            <button type="button" class="sc-log__close" :aria-label="copy.close" @click="closeLog(true)">
              <span class="i-carbon-close" aria-hidden="true" />
            </button>
          </header>
          <div class="sc-log__body">
            <section v-for="group in LOG" :key="group.kind" class="sc-log__group">
              <h4 class="sc-log__kind" :class="`is-${group.kind}`">
                <span :class="group.icon" aria-hidden="true" />
                {{ copy.kinds[group.kind] }}
              </h4>
              <ul class="sc-log__list">
                <li v-for="entry in group.entries" :key="entry.en">
                  {{ pick(entry) }}
                </li>
              </ul>
            </section>
            <p class="sc-log__note">
              {{ copy.logNote }}
            </p>
          </div>
        </div>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
/* A release page, dark in both site themes. The five tokens below are derived
   with var() at :root and not redeclared by the dark blocks, so this local
   dark scope would otherwise keep their light values. */
.sc {
  --sc-pad: 14px;
  --sc-gap: 10px;
  --tx-disabled-bg-color: var(--tx-fill-color-light);
  --tx-disabled-text-color: var(--tx-text-color-placeholder);
  --tx-disabled-border-color: var(--tx-border-color-light);
  --tx-chart-grid-line: color-mix(in srgb, var(--tx-chart-text-primary) 20%, transparent);
  --tx-skeleton-base-color: var(--tx-chart-semantic-skeleton);

  position: relative;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(110% 70% at 100% 0%, #1b1533 0%, transparent 60%),
    radial-gradient(90% 60% at 0% 100%, #0f1a2e 0%, transparent 60%),
    #0b0c10;
  color: #e9eaee;
  color-scheme: dark;
  font-size: 13px;
}

/* Page ---------------------------------------------------------------------- */

/* Rows are `auto 1fr auto`, not minmax(0, 1fr): a stage too short for the deck
   scrolls rather than letting the carousel spill over the metrics. */
.sc__page {
  display: grid;
  height: 100%;
  box-sizing: border-box;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto 1fr auto;
  gap: var(--sc-gap);
  padding: var(--sc-pad);
  overflow-y: auto;
}

/* Hero ---------------------------------------------------------------------- */

/* The flow light is positioned, so everything drawn over it is positioned too:
   in-flow content would paint under it. */
.sc-hero {
  position: relative;
  display: grid;
  grid-template-areas:
    'eyebrow actions'
    'title actions'
    'lead actions';
  grid-template-columns: minmax(0, 1fr) auto;
  align-content: center;
  column-gap: 24px;
  row-gap: 6px;
  padding: 14px 18px 16px;
  border-radius: 18px;
}

.sc-hero__eyebrow {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 7px;
  margin: 0;
  padding: 3px 10px 3px 8px;
  border-radius: 999px;
  background: rgb(255 255 255 / 6%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 10%);
  color: #c9cbd3;
  font-size: 11.5px;
  font-weight: 500;
  grid-area: eyebrow;
  line-height: 1.5;
}

.sc-hero__spark {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0894ff, #c959dd 50%, #ff9004);
  box-shadow: 0 0 8px rgb(201 89 221 / 60%);
}

/* (0,4,0) with the scope attribute, over TxMotionText's own (0,2,0) defaults.
   Its lines are `white-space: pre`, so each size is checked against the band's
   narrowest width; line height 1.2 matches the mask height set below. */
.sc .sc-hero .sc-hero__title {
  --tx-motion-text-font-size: clamp(22px, 3.6cqi, 28px);
  --tx-motion-text-line-height: 1.2;

  display: block;
  margin: 0;
  color: #fff;
  font-weight: 650;
  grid-area: title;
  letter-spacing: -0.01em;
  opacity: 0;
}

.sc .sc-hero .sc-hero__title.is-shown {
  opacity: 1;
}

/* Each revealed line sits in a mask with min-height 1.5em; at a tighter line
   height the lines stand taller than the text and jump when the reveal ends. */
.sc-hero__title :deep(.tx-motion-text__mask.is-line) {
  min-height: 0;
}

/* Fades in only: hiding for a replay is instant, so it never dips mid-fade. */
.sc-hero__lead {
  position: relative;
  max-width: 52ch;
  margin: 0;
  color: #b4b7c2;
  font-size: 13.5px;
  grid-area: lead;
  line-height: 1.55;
  opacity: 0;
  transform: translateY(6px);
}

.sc-hero__lead.is-shown {
  opacity: 1;
  transform: none;
  transition: opacity 0.5s ease, transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* `visibility`, not only opacity: invisible buttons must not take focus. */
.sc-hero__actions {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  align-self: center;
  gap: 8px;
  grid-area: actions;
  opacity: 0;
  transform: translateY(6px);
  visibility: hidden;
}

.sc-hero__actions.is-shown {
  opacity: 1;
  transform: none;
  transition: opacity 0.5s ease, transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
  visibility: visible;
}

/* TxMotionButton paints from these two tokens; redeclared on the button itself. */
.sc .sc-cta {
  --tx-fill-color-light: rgb(255 255 255 / 8%);
  --tx-text-color-regular: #e9eaee;

  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 10%);
}

.sc .sc-cta--primary {
  --tx-fill-color-light: #f3f4f7;
  --tx-text-color-regular: #0b0c10;

  box-shadow: none;
  font-weight: 600;
}

/* Deck ---------------------------------------------------------------------- */

.sc-deck {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
}

/* The glow root fills the deck's row and centres the stage in it; its field
   paints over this background and under the carousel. It is also what the
   autoplay button is positioned against. */
.sc .sc-deck__glow {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  border-radius: 18px;
  background: radial-gradient(90% 70% at 50% 0%, rgb(140 120 255 / 7%), transparent 70%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 6%);
}

.sc .sc-deck__carousel {
  padding: 4px 0 6px;
  background: transparent;
  color: inherit;
}

/* The default shadow is tinted with the text colour, which on a dark page is a
   pale halo. */
.sc .sc-deck__carousel :deep(.tx-carousel-3d__slide) {
  border-radius: 14px;
  background: #1b1d26;
  box-shadow: 0 12px 28px rgb(0 0 0 / 45%);
}

/* One grid cell, so the outgoing and incoming captions cross-fade in place and
   the dots below never move. */
.sc .sc-deck__carousel :deep(.tx-carousel-3d__caption) {
  display: grid;
  min-height: 40px;
  padding: 2px 16px 0;
  font-weight: 400;
}

.sc .sc-deck__carousel :deep(.tx-carousel-3d__dot.is-active span) {
  background: #fff;
}

/* The card's art covers the slide's own active ring, so it draws its own. */
.sc-card {
  position: relative;
  display: flex;
  height: 100%;
  box-sizing: border-box;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  padding: 9px;
  border-radius: inherit;
  color: #fff;
  text-align: left;
}

.sc-card::after {
  position: absolute;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 14%);
  content: '';
  inset: 0;
  pointer-events: none;
}

.sc-card.is-active::after {
  box-shadow: inset 0 0 0 2px rgb(255 255 255 / 85%);
}

.sc-card__icon {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgb(255 255 255 / 22%);
  font-size: 14px;
}

.sc-card__title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  font-size: 12px;
  font-weight: 600;
  -webkit-line-clamp: 2;
  line-height: 1.25;
  text-shadow: 0 1px 2px rgb(0 0 0 / 30%);
}

.sc-caption {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  grid-area: 1 / 1;
}

.sc-caption__title {
  color: #f3f4f7;
  font-size: 14px;
  font-weight: 600;
}

.sc-caption__line {
  color: #a9acb8;
  font-size: 12.5px;
}

.sc-swap-enter-active,
.sc-swap-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.sc-swap-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.sc-swap-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* The deck's top right corner, clear of the cards: they sit centred in a band
   twice their height, and even fanned out, a neighbour's top edge stays below
   90px. */
.sc-autoplay {
  position: absolute;
  z-index: 1;
  top: 10px;
  right: 10px;
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgb(255 255 255 / 8%);
  color: #e9eaee;
  cursor: pointer;
  font-size: 12px;
}

.sc-autoplay:hover {
  background: rgb(255 255 255 / 14%);
}

.sc-autoplay:focus-visible {
  outline: 2px solid var(--tx-color-primary);
  outline-offset: 2px;
}

.sc-autoplay__ring {
  position: absolute;
  width: 100%;
  height: 100%;
  inset: 0;
  pointer-events: none;
  transform: rotate(-90deg);
}

.sc-autoplay__ring circle {
  animation: sc-ring-fill var(--sc-turn) linear forwards;
  fill: none;
  stroke: rgb(255 255 255 / 70%);
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  stroke-width: 2;
}

.sc-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

/* Metrics ------------------------------------------------------------------- */

.sc-metrics {
  display: grid;
  gap: var(--sc-gap);
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

/* Sized so a figure and its delta share one line in a 640px stage: a delta
   that wraps adds a line to every card in the row, and the column band has
   no height to spare at 680. */
.sc .sc-metric {
  --tx-mm-pad: 12px 14px;
  --tx-mm-gap: 8px;
  --tx-mm-number: 22px;

  border-color: rgb(255 255 255 / 8%);
  border-radius: 14px;
  background: linear-gradient(180deg, rgb(255 255 255 / 5%), rgb(255 255 255 / 2%));
  color: #eef0f4;
}

/* In a narrow card the tag drops under the title rather than squeezing it. */
.sc-metric :deep(.tx-mm-header) {
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}

.sc-metric__title {
  color: #c3c6d0;
  font-size: 12px;
  font-weight: 500;
}

.sc-metric__tag {
  flex: none;
  padding: 1px 7px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 10%);
  color: #8b8e99;
  font-size: 10.5px;
  white-space: nowrap;
}

/* Every delta here is an improvement; the component leaves it in body grey, at
   `smaller` of the figure. */
.sc-metric :deep(.tx-mm-value small) {
  color: var(--tx-color-success);
  font-size: 12px;
}

.sc-metric :deep(.tx-mm-regions) {
  gap: 6px;
  color: #b4b7c2;
  font-size: 11.5px;
}

.sc-metric :deep(.tx-mm-regions span) {
  padding: 2px 8px;
  background: rgb(255 255 255 / 6%);
}

/* Changelog ----------------------------------------------------------------- */

.sc-scrim {
  position: absolute;
  z-index: 2;
  background: rgb(4 5 9 / 55%);
  inset: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.sc-scrim.is-open {
  opacity: 1;
  pointer-events: auto;
}

/* Stays mounted; while closed it is hidden and inert, out of the tab order. */
.sc-log {
  position: absolute;
  z-index: 3;
  top: 10px;
  right: 10px;
  bottom: 10px;
  display: flex;
  width: min(360px, calc(100% - 20px));
  box-sizing: border-box;
  flex-direction: column;
  overflow: hidden;
  border-radius: 16px;
  background: #14151b;
  box-shadow: 0 0 0 1px rgb(255 255 255 / 9%), 0 18px 48px rgb(0 0 0 / 55%);
  opacity: 0;
  transform: translateX(18px);
  transition: opacity 0.2s ease, transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1), visibility 0s linear 0.26s;
  visibility: hidden;
}

.sc-log.is-open {
  opacity: 1;
  transform: none;
  transition: opacity 0.2s ease, transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1), visibility 0s;
  visibility: visible;
}

.sc-log:focus {
  outline: none;
}

.sc-log__head {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 16px 12px 10px 18px;
}

.sc-log__heading {
  min-width: 0;
  flex: 1;
}

.sc-log__title {
  margin: 0;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}

.sc-log__sub {
  margin: 2px 0 0;
  color: #8b8e99;
  font-size: 12px;
}

.sc-log__close {
  display: inline-flex;
  width: 28px;
  height: 28px;
  flex: none;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #b4b7c2;
  cursor: pointer;
  font-size: 15px;
}

.sc-log__close:hover {
  background: rgb(255 255 255 / 8%);
  color: #fff;
}

.sc-log__close:focus-visible {
  outline: 2px solid var(--tx-color-primary);
  outline-offset: 1px;
}

.sc-log__body {
  position: relative;
  min-height: 0;
  flex: 1;
  padding: 4px 18px 16px;
  overflow-y: auto;
}

.sc-log__group + .sc-log__group {
  margin-top: 14px;
}

.sc-log__kind {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.sc-log__kind.is-new {
  color: #7dd3fc;
}

.sc-log__kind.is-improved {
  color: #c4b5fd;
}

.sc-log__kind.is-fixed {
  color: #fcd34d;
}

.sc-log__list {
  display: grid;
  gap: 5px;
  margin: 0;
  padding: 0 0 0 18px;
  color: #c9cbd3;
  font-size: 12.5px;
  line-height: 1.5;
}

.sc-log__list li::marker {
  color: rgb(255 255 255 / 28%);
}

.sc-log__note {
  margin: 16px 0 0;
  color: #7d808b;
  font-size: 11.5px;
}

/* Bands --------------------------------------------------------------------- */

/* Narrow: everything stacks and the page scrolls; the changelog is a bottom
   sheet. The caption keeps room for a description that wraps to two lines. */
@container template (max-width: 639.98px) {
  .sc__page {
    grid-template-rows: none;
  }

  .sc-hero {
    grid-template-areas:
      'eyebrow'
      'title'
      'lead'
      'actions';
    grid-template-columns: minmax(0, 1fr);
    row-gap: 8px;
    padding: 12px 12px 14px;
  }

  .sc .sc-hero .sc-hero__title {
    --tx-motion-text-font-size: clamp(20px, 6.4cqi, 26px);
  }

  .sc-hero__actions {
    flex-direction: row;
    flex-wrap: wrap;
    justify-self: start;
    margin-top: 4px;
  }

  .sc .sc-deck__carousel :deep(.tx-carousel-3d__caption) {
    min-height: 56px;
  }

  .sc-metrics {
    grid-template-columns: minmax(0, 1fr);
  }

  .sc-log {
    top: auto;
    right: 8px;
    bottom: 8px;
    left: 8px;
    width: auto;
    max-height: 82%;
    transform: translateY(18px);
  }
}

/* Wide (expanded): keynote-sized type, and a deck at `lg` that zooms to the
   room it gets — `--sc-deck-zoom`, worked out from the stage's size. The hero
   stays above the deck, as in the column, which suits a tall stage; `.is-split`
   moves it beside the deck when that leaves the deck more room. The values the
   zoom is worked out from are `WIDE` in the script. */
@container template (min-width: 960px) {
  .sc {
    --sc-pad: 22px;
    --sc-gap: 14px;
  }

  .sc-hero {
    column-gap: 32px;
    row-gap: 10px;
    padding: 22px 26px 24px;
  }

  .sc .sc-hero .sc-hero__title {
    --tx-motion-text-font-size: clamp(34px, 3.9cqi, 56px);
  }

  .sc-hero__lead {
    max-width: 60ch;
    font-size: 15px;
  }

  /* Only the band zooms: the caption and dots under it keep the page's type. */
  .sc .sc-deck__carousel :deep(.tx-carousel-3d__spatial) {
    zoom: var(--sc-deck-zoom, 1);
  }

  /* A fixed height the zoom can count on: both caption lines at the sizes
     below come to 43.5px in PingFang SC, first in the site's stack, and the
     rest is for fonts with taller lines. */
  .sc .sc-deck__carousel :deep(.tx-carousel-3d__caption) {
    min-height: 48px;
  }

  .sc-caption__title {
    font-size: 16px;
  }

  .sc-caption__line {
    font-size: 13.5px;
  }

  .sc-card {
    padding: 11px;
  }

  .sc-card__title {
    font-size: 13px;
  }

  .sc .sc-metric {
    --tx-mm-number: 26px;
  }

  /* Split: the hero beside the deck, hugging its text so the corner light
     frames it rather than the column's empty ends; the metrics across the
     bottom. */
  .sc.is-split .sc__page {
    column-gap: 24px;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
    grid-template-rows: 1fr auto;
  }

  .sc.is-split .sc-hero {
    align-self: center;
    grid-column: 1;
    grid-row: 1;
    grid-template-areas:
      'eyebrow'
      'title'
      'lead'
      'actions';
    grid-template-columns: minmax(0, 1fr);
    row-gap: 12px;
    padding: 24px 12px 24px 16px;
  }

  /* The longest line, "A smarter clipboard.", is 9.5em: at 3.3cqi it still
     fits a 0.8fr column at 960px. */
  .sc.is-split .sc-hero .sc-hero__title {
    --tx-motion-text-font-size: clamp(30px, 3.3cqi, 46px);
  }

  .sc.is-split .sc-hero__lead {
    max-width: 40ch;
  }

  .sc.is-split .sc-hero__actions {
    flex-direction: row;
    flex-wrap: wrap;
    justify-self: start;
    margin-top: 8px;
  }

  .sc.is-split .sc-deck {
    grid-column: 2;
    grid-row: 1;
  }

  .sc.is-split .sc-metrics {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}

/* Matches the state reduced motion already settles in script; also covers the
   frame before it runs. Each rule repeats the specificity it overrides. */
@media (prefers-reduced-motion: reduce) {
  .sc .sc-hero .sc-hero__title,
  .sc-hero__lead,
  .sc-hero__lead.is-shown,
  .sc-hero__actions,
  .sc-hero__actions.is-shown {
    opacity: 1;
    transform: none;
    transition: none;
    visibility: visible;
  }

  .sc-scrim,
  .sc-log,
  .sc-log.is-open,
  .sc-swap-enter-active,
  .sc-swap-leave-active {
    transition: none;
  }
}

@keyframes sc-ring-fill {
  to {
    stroke-dashoffset: 0;
  }
}
</style>
