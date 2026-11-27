<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * Two parts, both measured from what the browser lays out.
 *
 * Wrapping: the same heading and paragraph at one width, once with the default
 * `text-wrap: wrap` and once with the chosen mode. Lines are found by reading the box of
 * every character through a Range and grouping the boxes by line, which gives each
 * line's width, the share of the box the last line fills, and what sits on it.
 *
 * Tracking: body text with and without 1px of letter-spacing, and the three exemptions.
 * Two of the three are the real components (TxInsightMetric, TxAvatar); every size and
 * spacing shown is read from the computed style.
 */

type WrapMode = 'wrap' | 'pretty' | 'balance'

interface LineStats {
  count: number
  widths: number[]
  /** Words (en) or characters (zh) on the last line, punctuation left out. */
  lastUnits: number
  /** Width of the last line over the width of the box. */
  lastFill: number
  /** Width of all lines together. */
  advance: number
}

interface FaceStats {
  size: number
  spacing: number
}

// Measured in Chrome: at 240px the default wrap leaves a lone character on the Chinese
// paragraph's last line and a short last line on the English heading, and `pretty`
// visibly fixes both. At most other widths `pretty` lays the text out exactly like `wrap`.
const DEFAULT_WIDTH = 240
const MODES: WrapMode[] = ['wrap', 'pretty', 'balance']
const BOX_KEYS = ['base', 'test'] as const
const TRACK_KEYS = ['plain', 'tracked'] as const

type BoxKey = typeof BOX_KEYS[number]
type TrackKey = typeof TRACK_KEYS[number]

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const width = ref(DEFAULT_WIDTH)
const mode = ref<WrapMode>('pretty')
const exemptions = ref(true)
const support = ref<Record<WrapMode, boolean> | null>(null)

const copy = computed(() => zh.value
  ? {
      heading: '把常用指令固定在启动器顶部，打开即用',
      body: '固定后的指令会排在搜索结果之前，并在每次打开启动器时预先加载。拖动可以调整顺序，也可以随时在设置里取消固定，已经执行过的历史记录不受影响。',
      tracked: '字偶间距由字体设计师逐对调校，统一加宽字距会把每一对都拉开，正文读起来更松散，也更费眼。',
      widthLabel: '容器宽度',
      modeLabel: '对照组',
      exemptionsLabel: '应用豁免字距',
      supported: '支持',
      unsupported: '不支持，按 wrap 排版',
      baseline: '基线',
      lines: (n: number) => `${n} 行`,
      lastLine: (n: number) => `末行 ${n} 字`,
      fill: (value: string) => `末行占宽 ${value}`,
      ratio: (value: string) => `最短行 ÷ 最长行 ${value}`,
      singleLine: '单行',
      orphan: '孤字',
      trackingTitle: '正文字距',
      microTitle: '全大写微标签',
      microSample: 'Recent · Pinned · Shared',
      digitsTitle: '展示数字',
      metricLabel: '搜索量周环比',
      avatarTitle: '头像缩写',
      avatarName: 'Ada Lovelace',
      metricNote: 'TxInsightMetric（真实组件）',
      avatarNote: 'TxAvatar（真实组件）',
      measuredWidth: '文本实测宽度',
      headingRatio: '标题最短行 ÷ 最长行',
      lastLineStat: '正文末行占宽',
      growth: '1px 字距后正文总宽',
      caption: '上半部分：同一段标题与正文，在同一宽度下分别按默认 wrap 与所选模式断行；行数、每行宽度、末行占宽与末行字数都由浏览器的实际排版逐字测得。下半部分：正文加 1px 字距的效果，以及三种豁免场景；所有字号与字距均读自计算样式，其中展示数字下方的指标卡与头像是真实的 TuffEx 组件。',
    }
  : {
      heading: 'Pin your most-used commands to the top of the launcher',
      body: 'Pinned commands sit above search results and load ahead of time whenever the launcher opens. Drag them to reorder, or unpin any of them from Settings; your run history stays exactly as it was.',
      tracked: 'Kerning pairs such as AV, To and We are tuned by hand; spreading every letter evenly pulls each of those pairs apart and loosens the whole text.',
      widthLabel: 'Container width',
      modeLabel: 'Compare with',
      exemptionsLabel: 'Apply exemption tracking',
      supported: 'supported',
      unsupported: 'not supported, laid out as wrap',
      baseline: 'baseline',
      lines: (n: number) => `${n} ${n === 1 ? 'line' : 'lines'}`,
      lastLine: (n: number) => `last line: ${n} ${n === 1 ? 'word' : 'words'}`,
      fill: (value: string) => `last line fills ${value}`,
      ratio: (value: string) => `shortest ÷ longest line ${value}`,
      singleLine: 'single line',
      orphan: 'orphan',
      trackingTitle: 'Body tracking',
      microTitle: 'All-caps micro-label',
      microSample: 'Recent · Pinned · Shared',
      digitsTitle: 'Display numerals',
      metricLabel: 'Searches, week over week',
      avatarTitle: 'Avatar initials',
      avatarName: 'Ada Lovelace',
      metricNote: 'TxInsightMetric (the real component)',
      avatarNote: 'TxAvatar (the real component)',
      measuredWidth: 'Measured text width',
      headingRatio: 'Heading: shortest ÷ longest line',
      lastLineStat: 'Body: last line fills',
      growth: 'Body width with 1px tracking',
      caption: 'Top: the same heading and paragraph at one width, broken by the default wrap and by the chosen mode; line counts, line widths, the last line\'s share of the box and what sits on it are measured character by character from the browser\'s own layout. Bottom: body text with 1px of tracking, and the three exemptions; every size and spacing is read from the computed style, and the metric card and the avatar are the real TuffEx components.',
    })

const DISPLAY_FIGURE = '1,284,960'
const METRIC_VALUE = 12.48

const stageRef = ref<HTMLElement | null>(null)
const boxRefs: Partial<Record<BoxKey, HTMLElement>> = {}
const trackRefs: Partial<Record<TrackKey, HTMLElement>> = {}
const microRef = ref<HTMLElement | null>(null)
const digitsRef = ref<HTMLElement | null>(null)
const metricRef = ref<HTMLElement | null>(null)
const avatarRef = ref<HTMLElement | null>(null)

function setBoxRef(key: BoxKey, el: unknown) {
  if (el instanceof HTMLElement)
    boxRefs[key] = el
  else
    delete boxRefs[key]
}

function setTrackRef(key: TrackKey, el: unknown) {
  if (el instanceof HTMLElement)
    trackRefs[key] = el
  else
    delete trackRefs[key]
}

const boxStats = ref<Record<BoxKey, { heading: LineStats | null, body: LineStats | null }> | null>(null)
const trackStats = ref<Record<TrackKey, LineStats | null> | null>(null)
const trackSpacing = ref<Record<TrackKey, number> | null>(null)
const faces = ref<Record<'micro' | 'digits' | 'metric' | 'avatar', FaceStats | null> | null>(null)
const measuredWidth = ref(0)

const PUNCTUATION = /^[\p{P}\p{S}\s]+$/u
let segmenter: { locale: string, value: Intl.Segmenter } | null = null

/** Words for English, characters for Chinese, punctuation not counted. */
function countUnits(text: string) {
  if (zh.value)
    return Array.from(text).filter(char => !PUNCTUATION.test(char)).length
  if (typeof Intl.Segmenter !== 'function')
    return text.split(/\s+/).filter(word => word && !PUNCTUATION.test(word)).length
  if (segmenter?.locale !== locale.value)
    segmenter = { locale: locale.value, value: new Intl.Segmenter(locale.value, { granularity: 'word' }) }
  return Array.from(segmenter.value.segment(text)).filter(part => part.isWordLike).length
}

function measureLines(el: HTMLElement | null | undefined): LineStats | null {
  const node = el?.firstChild
  if (!el || !(node instanceof Text))
    return null
  const text = node.data
  const range = document.createRange()
  const lines: Array<{ bottom: number, left: number, right: number, start: number, end: number }> = []
  let offset = 0
  for (const char of text) {
    const end = offset + char.length
    if (char.trim()) {
      range.setStart(node, offset)
      range.setEnd(node, end)
      const rect = range.getBoundingClientRect()
      if (rect.width > 0) {
        const line = lines[lines.length - 1]
        // A character whose middle sits below the current line's bottom starts a new line.
        if (line && (rect.top + rect.bottom) / 2 < line.bottom) {
          line.left = Math.min(line.left, rect.left)
          line.right = Math.max(line.right, rect.right)
          line.bottom = Math.max(line.bottom, rect.bottom)
          line.end = end
        }
        else {
          lines.push({ bottom: rect.bottom, left: rect.left, right: rect.right, start: offset, end })
        }
      }
    }
    offset = end
  }
  const last = lines[lines.length - 1]
  if (!last || !el.clientWidth)
    return null
  const widths = lines.map(line => line.right - line.left)
  return {
    count: lines.length,
    widths,
    lastUnits: countUnits(text.slice(last.start, last.end)),
    lastFill: widths[widths.length - 1]! / el.clientWidth,
    advance: widths.reduce((sum, value) => sum + value, 0),
  }
}

function faceOf(el: Element | null | undefined): FaceStats | null {
  if (!el)
    return null
  const style = getComputedStyle(el)
  const size = Number.parseFloat(style.fontSize)
  // `normal` is no added spacing.
  const spacing = Number.parseFloat(style.letterSpacing) || 0
  return { size, spacing }
}

function measure() {
  const boxes = { base: boxRefs.base, test: boxRefs.test }
  boxStats.value = {
    base: { heading: measureLines(boxes.base?.querySelector('.twd__heading')), body: measureLines(boxes.base?.querySelector('.twd__body')) },
    test: { heading: measureLines(boxes.test?.querySelector('.twd__heading')), body: measureLines(boxes.test?.querySelector('.twd__body')) },
  }
  measuredWidth.value = boxes.base?.querySelector<HTMLElement>('.twd__body')?.clientWidth ?? 0
  trackStats.value = { plain: measureLines(trackRefs.plain), tracked: measureLines(trackRefs.tracked) }
  trackSpacing.value = { plain: faceOf(trackRefs.plain)?.spacing ?? 0, tracked: faceOf(trackRefs.tracked)?.spacing ?? 0 }
  faces.value = {
    micro: faceOf(microRef.value),
    digits: faceOf(digitsRef.value),
    metric: faceOf(metricRef.value?.querySelector('.tx-bui-insight-metric__value')),
    avatar: faceOf(avatarRef.value?.querySelector('.tx-avatar__text')),
  }
}

let frame = 0
function scheduleMeasure() {
  if (frame)
    return
  frame = requestAnimationFrame(() => {
    frame = 0
    measure()
  })
}

let observer: ResizeObserver | null = null
let disposed = false

onMounted(() => {
  const supports = (value: string) => Boolean(globalThis.CSS?.supports?.('text-wrap', value))
  support.value = { wrap: supports('wrap'), pretty: supports('pretty'), balance: supports('balance') }
  measure()
  document.fonts?.ready.then(() => {
    if (!disposed)
      scheduleMeasure()
  })
  if (stageRef.value) {
    observer = new ResizeObserver(scheduleMeasure)
    observer.observe(stageRef.value)
  }
})

onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  observer = null
  if (frame)
    cancelAnimationFrame(frame)
  frame = 0
})

watch([width, mode, exemptions, locale], () => nextTick(scheduleMeasure))

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

function px(value: number) {
  const rounded = Math.round(value * 100) / 100
  return `${rounded === 0 ? '0' : rounded > 0 ? rounded : `−${Math.abs(rounded)}`}px`
}

function emOf(face: FaceStats | null | undefined) {
  if (!face?.size)
    return '—'
  const em = Math.round((face.spacing / face.size) * 1000) / 1000
  return `${em === 0 ? '0' : em > 0 ? `+${em}` : `−${Math.abs(em)}`}em`
}

function faceLabel(face: FaceStats | null | undefined) {
  if (!face)
    return '—'
  return `${px(face.size)} · ${px(face.spacing)} (${emOf(face)})`
}

function headingRatio(stats: LineStats | null | undefined) {
  if (!stats)
    return '—'
  if (stats.count < 2)
    return copy.value.singleLine
  return (Math.min(...stats.widths) / Math.max(...stats.widths)).toFixed(2)
}

function isOrphan(stats: LineStats | null | undefined) {
  return Boolean(stats && stats.count > 1 && stats.lastUnits <= 1)
}

const testSupported = computed(() => support.value?.[mode.value] ?? true)

const boxes = computed(() => BOX_KEYS.map((key) => {
  const stats = boxStats.value?.[key]
  return {
    key,
    mode: key === 'base' ? 'wrap' as const : mode.value,
    heading: stats?.heading ?? null,
    body: stats?.body ?? null,
  }
}))

function headingLine(stats: LineStats | null) {
  return stats ? `${copy.value.lines(stats.count)} · ${copy.value.ratio(headingRatio(stats))}` : '—'
}

function bodyLine(stats: LineStats | null) {
  return stats
    ? `${copy.value.lines(stats.count)} · ${copy.value.lastLine(stats.lastUnits)} · ${copy.value.fill(percent(stats.lastFill))}`
    : '—'
}

const growth = computed(() => {
  const plain = trackStats.value?.plain?.advance ?? 0
  const tracked = trackStats.value?.tracked?.advance ?? 0
  if (!plain || !tracked)
    return '—'
  return `+${((tracked / plain - 1) * 100).toFixed(1)}%`
})

function formatWidth(value: number) {
  return `${value}px`
}

function resetDemo() {
  width.value = DEFAULT_WIDTH
  mode.value = 'pretty'
  exemptions.value = true
}

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure class="twd-root" stage="plain" :caption="copy.caption">
    <div ref="stageRef" class="twd">
      <div class="twd__support">
        <span v-for="item in MODES.filter(value => value !== 'wrap')" :key="item" class="cfig-badge" :class="support ? (support[item] ? 'is-pass' : 'is-fail') : undefined">
          <span class="cfig-mono">text-wrap: {{ item }}</span>&nbsp;{{ support ? (support[item] ? copy.supported : copy.unsupported) : '…' }}
        </span>
      </div>

      <div class="twd__boxes" :style="{ '--twd-width': `${width}px` }">
        <article
          v-for="box in boxes"
          :key="box.key"
          :ref="el => setBoxRef(box.key, el)"
          class="twd__box"
          :class="`is-${box.mode}`"
        >
          <span class="twd__mode cfig-mono">
            text-wrap: {{ box.mode }}
            <span v-if="box.key === 'base'" class="twd__mode-note">{{ copy.baseline }}</span>
          </span>
          <div class="twd__heading">
{{ copy.heading }}
</div>
          <p class="twd__body">
{{ copy.body }}
</p>
          <div class="twd__stats">
            <span>{{ headingLine(box.heading) }}</span>
            <span>
              {{ bodyLine(box.body) }}
              <span v-if="isOrphan(box.body)" class="cfig-badge is-fail">{{ copy.orphan }}</span>
            </span>
          </div>
          <p v-if="box.key === 'test' && !testSupported" class="cfig-panel__note">
            <span class="cfig-mono">text-wrap: {{ mode }}</span> {{ copy.unsupported }}
          </p>
        </article>
      </div>

      <div class="twd__tracking" :class="{ 'is-plain': !exemptions }">
        <div class="cfig-split">
          <div v-for="key in TRACK_KEYS" :key="key" class="cfig-panel">
            <span class="cfig-panel__title">
              {{ copy.trackingTitle }}
              <span class="cfig-badge cfig-mono" :class="key === 'tracked' ? 'is-fail' : 'is-pass'">{{ trackSpacing ? px(trackSpacing[key]) : '—' }}</span>
            </span>
            <p :ref="el => setTrackRef(key, el)" class="twd__tracked" :class="`is-${key}`">
{{ copy.tracked }}
</p>
            <span class="cfig-panel__note">{{ copy.lines(trackStats?.[key]?.count ?? 0) }}</span>
          </div>
        </div>

        <div class="twd__specimens">
          <div class="cfig-panel twd__specimen">
            <span class="cfig-panel__title">{{ copy.microTitle }}</span>
            <span ref="microRef" class="twd__micro">{{ copy.microSample }}</span>
            <span class="cfig-panel__note cfig-mono">{{ faceLabel(faces?.micro) }}</span>
          </div>
          <div class="cfig-panel twd__specimen">
            <span class="cfig-panel__title">{{ copy.digitsTitle }}</span>
            <span ref="digitsRef" class="twd__digits">{{ DISPLAY_FIGURE }}</span>
            <span class="cfig-panel__note cfig-mono">{{ faceLabel(faces?.digits) }}</span>
            <div ref="metricRef" class="twd__metric">
              <TxInsightMetric :label="copy.metricLabel" :value="METRIC_VALUE" />
            </div>
            <span class="cfig-panel__note">{{ copy.metricNote }}</span>
            <span class="cfig-panel__note cfig-mono">{{ faceLabel(faces?.metric) }}</span>
          </div>
          <div class="cfig-panel twd__specimen">
            <span class="cfig-panel__title">{{ copy.avatarTitle }}</span>
            <div ref="avatarRef" class="twd__avatar">
              <TxAvatar :name="copy.avatarName" size="xlarge" />
            </div>
            <span class="cfig-panel__note">{{ copy.avatarNote }}</span>
            <span class="cfig-panel__note cfig-mono">{{ faceLabel(faces?.avatar) }}</span>
          </div>
        </div>
      </div>
    </div>

    <template #controls>
      <label class="cfig-control twd__width">
        <span class="cfig-control__label">{{ copy.widthLabel }}</span>
        <TxSlider v-model="width" :min="200" :max="520" :step="10" show-value :format-value="formatWidth" :aria-label="copy.widthLabel" />
      </label>
      <div class="cfig-control">
        <span class="cfig-control__label">{{ copy.modeLabel }}</span>
        <TxRadioGroup v-model="mode">
          <TxRadio v-for="item in MODES" :key="item" :value="item">
            {{ item }}
          </TxRadio>
        </TxRadioGroup>
      </div>
      <div class="cfig-control">
        <span class="cfig-control__label">{{ copy.exemptionsLabel }}</span>
        <TxSwitch v-model="exemptions" :aria-label="copy.exemptionsLabel" />
      </div>
    </template>

    <template #readout>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.measuredWidth }}</span>
        <span class="cfig-stat__value">{{ measuredWidth ? px(measuredWidth) : '—' }}</span>
      </span>
      <span class="cfig-stat is-accent">
        <span class="cfig-stat__label">{{ copy.headingRatio }}</span>
        <span class="cfig-stat__value">{{ boxStats ? `${headingRatio(boxStats.base.heading)} → ${headingRatio(boxStats.test.heading)}` : '—' }}</span>
      </span>
      <span class="cfig-stat is-accent">
        <span class="cfig-stat__label">{{ copy.lastLineStat }}</span>
        <span class="cfig-stat__value">{{ boxStats?.base.body && boxStats.test.body ? `${percent(boxStats.base.body.lastFill)} → ${percent(boxStats.test.body.lastFill)}` : '—' }}</span>
      </span>
      <span class="cfig-stat is-fail">
        <span class="cfig-stat__label">{{ copy.growth }}</span>
        <span class="cfig-stat__value">{{ growth }}</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.twd {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 16px;
}

.twd__support {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.twd__boxes {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px;
}

/* The slider sets the text measure itself: the box adds its padding and border
   (14px + 1px a side) outside it, and still never overflows the stage. */
.twd__box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: content-box;
  width: min(calc(100% - 30px), var(--twd-width, 320px));
  padding: 12px 14px;
  border: 1px solid var(--cfig-line);
  border-radius: 12px;
  background: var(--tx-bg-color, #fff);
}

.twd__mode {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--cfig-accent);
  font-size: 11px;
}

.twd__box.is-wrap .twd__mode {
  color: var(--cfig-muted);
}

.twd__mode-note {
  color: var(--cfig-muted);
  font-family: inherit;
}

.twd__heading {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.35;
}

.twd__body {
  margin: 0;
  color: color-mix(in srgb, var(--cfig-ink) 86%, transparent);
  font-size: 14px;
  line-height: 1.6;
}

.twd__box.is-wrap :is(.twd__heading, .twd__body) {
  text-wrap: wrap;
}

.twd__box.is-pretty :is(.twd__heading, .twd__body) {
  text-wrap: pretty;
}

.twd__box.is-balance :is(.twd__heading, .twd__body) {
  text-wrap: balance;
}

.twd__stats {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 6px;
  border-top: 1px dashed var(--cfig-line);
  color: var(--cfig-muted);
  font-family: var(--cfig-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.twd__stats .cfig-badge {
  margin-left: 4px;
  font-family: inherit;
}

.twd__tracking {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--cfig-line);
}

.twd__tracked {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
}

.twd__tracked.is-plain {
  letter-spacing: 0;
}

.twd__tracked.is-tracked {
  letter-spacing: 1px;
}

.twd__specimens {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: 12px;
}

.twd__specimen {
  align-items: flex-start;
}

.twd__micro {
  color: var(--cfig-muted);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.twd__digits {
  font-size: 28px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.2;
}

.twd__metric {
  width: 100%;
}

.twd__avatar {
  display: flex;
}

/* Exemptions switched off: everything back to the body rule of zero tracking. */
.twd__tracking.is-plain :is(.twd__micro, .twd__digits),
.twd__tracking.is-plain :deep(.tx-bui-insight-metric__value),
.twd__tracking.is-plain :deep(.tx-avatar) {
  letter-spacing: 0;
}

.twd__width {
  flex: 1 1 260px;
}
</style>
