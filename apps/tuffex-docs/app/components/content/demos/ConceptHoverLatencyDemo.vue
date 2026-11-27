<script setup lang="ts">
import { useReducedMotion } from '@talex-touch/tuffex/utils'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * Two columns of rows that differ by one declaration: the second eases its hover
 * fill with `transition: background-color 200ms ease`, the anti-pattern the article
 * quotes. Every hover is timed. From `pointerenter` the row's computed fill is read
 * once a frame until it is the hover colour; a row the pointer leaves first keeps the
 * share its fill had reached on the last frame read.
 *
 * Below sits a real TxModeChip. Its fill and ink transition only while `.is-morphing`
 * is on it, so the figure reads the chip's computed `transition-*` at rest and during
 * a morph, and times how long the class stays.
 */

type Column = 'instant' | 'eased'
type ChipTone = 'muted' | 'danger' | 'success'
type Rgba = [number, number, number, number]

interface ColumnStats {
  /** Rows the pointer entered. */
  entered: number
  /** Rows whose fill reached the hover colour before the pointer left. */
  settled: number
  /** From `pointerenter` to the first frame showing the full fill, last measured. */
  lastSettleMs: number | null
  /** How far the fill had got, 0..1, on each row the pointer left first. */
  early: number[]
}

interface Sampler {
  column: Column
  start: number
  /** Share of the hover fill on the last frame read; null before the first. */
  progress: number | null
}

/** A fill this close to the hover colour reads as arrived; the 8-bit read rounds the rest. */
const ARRIVED = 0.995
/** The rows' resting fill, `transparent`, premultiplied. */
const REST: Rgba = [0, 0, 0, 0]
const COLUMNS: Column[] = ['instant', 'eased']
const CHIP_TONES: ChipTone[] = ['muted', 'danger', 'success']

const { locale } = useI18n()
const reducedMotion = useReducedMotion()

const copy = computed(() => locale.value === 'zh'
  ? {
      hint: '把指针从上到下快速扫过两列，再在某一行上停一下。',
      instant: '悬停立即生效',
      eased: '悬停加了颜色过渡',
      noTransition: '无过渡',
      rows: ['收件箱', '已加星标', '已发送', '草稿', '归档'],
      settle: '显色到位用时',
      reached: '离开前显色到位',
      rowsUnit: '行',
      early: '没到位的行离开时显到',
      chipTitle: '状态形变：真实的 TxModeChip',
      chipNote: '悬停它，填充立即变化；点它切换状态，颜色借 .is-morphing 过渡过去。',
      chipLabels: ['删除', '再点一次确认删除', '已删除'],
      chipRest: '平时 background-color 过渡',
      chipMorph: '形变期间 background-color 过渡',
      chipLife: '.is-morphing 停留',
      chipReduced: '减弱动态效果下不形变',
      chipWaiting: '点一下标签',
      caption: '两列只差一条 transition 声明。读数从 pointerenter 起逐帧读取行的实际背景色，直到它等于悬停色；指针先离开的行，记下离开前最后一帧显到了几成——扫得越快，过渡列越是还没亮起来就被甩在身后。TxModeChip 平时没有颜色过渡，只在切换状态时挂上 .is-morphing，过渡完立即摘掉，所以悬停它始终是立即的。',
    }
  : {
      hint: 'Sweep the pointer quickly down both columns, then rest on a row.',
      instant: 'Hover applies at once',
      eased: 'Hover eases its colour',
      noTransition: 'no transition',
      rows: ['Inbox', 'Starred', 'Sent', 'Drafts', 'Archive'],
      settle: 'Time to full fill',
      reached: 'Filled before the pointer left',
      rowsUnit: 'rows',
      early: 'Rows left early reached',
      chipTitle: 'State morph: a real TxModeChip',
      chipNote: 'Hover it and the fill changes at once; click it to switch state, and the colour eases over through .is-morphing.',
      chipLabels: ['Delete', 'Click again to delete', 'Deleted'],
      chipRest: 'background-color transition at rest',
      chipMorph: 'background-color transition while morphing',
      chipLife: '.is-morphing stayed',
      chipReduced: 'no morph under reduced motion',
      chipWaiting: 'click the chip',
      caption: 'The columns differ by one transition declaration. From pointerenter, each row’s actual fill is read every frame until it matches the hover colour; for a row the pointer leaves first, the share reached on the last frame is recorded. The faster the sweep, the more of the eased column is left behind before it lights up. TxModeChip has no colour transition at rest: it wears .is-morphing only while its state changes and drops it right after, so hovering it stays immediate.',
    })

const stageRef = ref<HTMLElement | null>(null)
const probeRef = ref<HTMLElement | null>(null)
const chipHostRef = ref<HTMLElement | null>(null)

function emptyStats(): ColumnStats {
  return { entered: 0, settled: 0, lastSettleMs: null, early: [] }
}

const stats = reactive<Record<Column, ColumnStats>>({ instant: emptyStats(), eased: emptyStats() })
/** Each column's computed transition for `background-color`, read from its first row. */
const columnTransition = reactive<Record<Column, { ms: number, easing: string } | null>>({ instant: null, eased: null })

const chipIndex = ref(0)
const chipTone = computed(() => CHIP_TONES[chipIndex.value]!)
const chipLabel = computed(() => copy.value.chipLabels[chipIndex.value]!)
const chipRestMs = ref<number | null>(null)
const chipMorphMs = ref<number | null>(null)
const chipLifeMs = ref<number | null>(null)

const samplers = new Map<HTMLElement, Sampler>()
let frame = 0
let chipObserver: MutationObserver | null = null
let morphStart: number | null = null
let canvasContext: CanvasRenderingContext2D | null = null

/** Splits a computed list on its top-level commas; `cubic-bezier(…)` keeps its own. */
function splitList(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of value) {
    if (char === '(')
      depth += 1
    else if (char === ')')
      depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  parts.push(current.trim())
  return parts
}

function parseTime(value: string): number {
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number))
    return 0
  return value.trim().endsWith('ms') ? number : number * 1000
}

/** The transition that applies to `property`, as computed: the last matching entry wins. */
function transitionFor(element: Element, property: string): { ms: number, easing: string } {
  const style = getComputedStyle(element)
  const properties = splitList(style.transitionProperty)
  const durations = splitList(style.transitionDuration)
  const easings = splitList(style.transitionTimingFunction)
  let result = { ms: 0, easing: '' }
  properties.forEach((name, index) => {
    if (name === property || name === 'all') {
      result = {
        ms: parseTime(durations[index % durations.length] ?? '0s'),
        easing: easings[index % easings.length] ?? '',
      }
    }
  })
  return result
}

/** Any CSS colour as premultiplied 0..255 RGBA, read back through a 1px canvas. */
function premultiplied(color: string): Rgba {
  if (!canvasContext) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    canvasContext = canvas.getContext('2d', { willReadFrequently: true })
  }
  if (!canvasContext)
    return REST
  canvasContext.clearRect(0, 0, 1, 1)
  // An unparsable colour leaves `fillStyle` as it was, so start from transparent.
  canvasContext.fillStyle = 'transparent'
  canvasContext.fillStyle = color
  canvasContext.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0, a = 0] = canvasContext.getImageData(0, 0, 1, 1).data
  const alpha = a / 255
  return [r * alpha, g * alpha, b * alpha, a]
}

/** Where `current` sits on the way from `from` to `to`, 0..1. */
function shareOf(current: Rgba, from: Rgba, to: Rgba): number {
  let along = 0
  let length = 0
  for (let i = 0; i < 4; i += 1) {
    const span = to[i]! - from[i]!
    along += (current[i]! - from[i]!) * span
    length += span * span
  }
  if (length < 1)
    return 1
  return Math.min(1, Math.max(0, along / length))
}

function sample() {
  frame = 0
  const probe = probeRef.value
  if (!probe) {
    samplers.clear()
    return
  }
  const now = performance.now()
  const targetText = getComputedStyle(probe).backgroundColor
  const target = premultiplied(targetText)
  for (const [row, sampler] of samplers) {
    const fill = getComputedStyle(row).backgroundColor
    const progress = fill === targetText ? 1 : shareOf(premultiplied(fill), REST, target)
    sampler.progress = progress
    if (progress >= ARRIVED) {
      const column = stats[sampler.column]
      column.settled += 1
      column.lastSettleMs = now - sampler.start
      samplers.delete(row)
    }
  }
  if (samplers.size)
    frame = requestAnimationFrame(sample)
}

function onEnter(column: Column, event: PointerEvent) {
  const row = event.currentTarget as HTMLElement
  stats[column].entered += 1
  samplers.set(row, { column, start: performance.now(), progress: null })
  if (!frame)
    frame = requestAnimationFrame(sample)
}

function onLeave(event: PointerEvent) {
  const row = event.currentTarget as HTMLElement
  const sampler = samplers.get(row)
  if (!sampler)
    return
  samplers.delete(row)
  // A row left before any frame was read never showed a fill; it counts as not
  // arrived without adding a share.
  if (sampler.progress !== null)
    stats[sampler.column].early.push(sampler.progress)
}

function describeTransition(column: Column) {
  const transition = columnTransition[column]
  if (!transition)
    return '—'
  return transition.ms > 0 ? `background-color ${formatMs(transition.ms)} ${transition.easing}` : copy.value.noTransition
}

function readColumns() {
  const stage = stageRef.value
  if (!stage)
    return
  for (const column of COLUMNS) {
    const row = stage.querySelector(`.hl-col.is-${column} .hl-row`)
    if (row)
      columnTransition[column] = transitionFor(row, 'background-color')
  }
}

function chipElement() {
  return chipHostRef.value?.querySelector<HTMLElement>('.tx-mode-chip') ?? null
}

function watchChip() {
  const chip = chipElement()
  if (!chip)
    return
  chipRestMs.value = transitionFor(chip, 'background-color').ms
  chipObserver = new MutationObserver(() => {
    const morphing = chip.classList.contains('is-morphing')
    if (morphing && morphStart === null) {
      morphStart = performance.now()
      chipMorphMs.value = transitionFor(chip, 'background-color').ms
    }
    else if (!morphing && morphStart !== null) {
      chipLifeMs.value = performance.now() - morphStart
      morphStart = null
      chipRestMs.value = transitionFor(chip, 'background-color').ms
    }
  })
  chipObserver.observe(chip, { attributes: true, attributeFilter: ['class'] })
}

function cycleChip() {
  chipIndex.value = (chipIndex.value + 1) % CHIP_TONES.length
}

function formatMs(value: number) {
  if (value === 0)
    return '0 ms'
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ms`
}

function formatMaybeMs(value: number | null) {
  return value === null ? '—' : formatMs(value)
}

function reachedText(column: Column) {
  const { settled, entered } = stats[column]
  return entered ? `${settled} / ${entered} ${copy.value.rowsUnit}` : '—'
}

const earlyShare = computed(() => {
  const { early } = stats.eased
  if (!early.length)
    return '—'
  return `${Math.round((early.reduce((sum, value) => sum + value, 0) / early.length) * 100)}%`
})

const chipMorphText = computed(() => {
  if (chipMorphMs.value !== null)
    return formatMs(chipMorphMs.value)
  return reducedMotion.value ? copy.value.chipReduced : copy.value.chipWaiting
})

const chipLifeText = computed(() => {
  if (chipLifeMs.value !== null)
    return formatMs(chipLifeMs.value)
  return reducedMotion.value ? copy.value.chipReduced : copy.value.chipWaiting
})

function resetDemo() {
  samplers.clear()
  if (frame)
    cancelAnimationFrame(frame)
  frame = 0
  for (const column of COLUMNS)
    Object.assign(stats[column], emptyStats())
  chipIndex.value = 0
  chipMorphMs.value = null
  chipLifeMs.value = null
}

onMounted(() => {
  readColumns()
  watchChip()
})

onBeforeUnmount(() => {
  if (frame)
    cancelAnimationFrame(frame)
  frame = 0
  samplers.clear()
  chipObserver?.disconnect()
  chipObserver = null
})

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure class="hl-root" :caption="copy.caption">
    <div ref="stageRef" class="hl">
      <p class="hl__hint">
        {{ copy.hint }}
      </p>
      <div class="cfig-split">
        <section v-for="column in COLUMNS" :key="column" class="cfig-panel hl-col" :class="`is-${column}`">
          <div class="cfig-panel__title">
            {{ column === 'instant' ? copy.instant : copy.eased }}
          </div>
          <span class="cfig-badge cfig-mono hl-col__rule" :class="column === 'instant' ? 'is-pass' : 'is-fail'">
            {{ describeTransition(column) }}
          </span>
          <ul class="hl-col__rows">
            <li
              v-for="label in copy.rows"
              :key="label"
              class="hl-row"
              @pointerenter="onEnter(column, $event)"
              @pointerleave="onLeave"
            >
              {{ label }}
            </li>
          </ul>
          <div class="hl-stats">
            <span class="cfig-stat" :class="column === 'instant' ? 'is-pass' : 'is-fail'">
              <span class="cfig-stat__label">{{ copy.settle }}</span>
              <span class="cfig-stat__value">{{ formatMaybeMs(stats[column].lastSettleMs) }}</span>
            </span>
            <span class="cfig-stat">
              <span class="cfig-stat__label">{{ copy.reached }}</span>
              <span class="cfig-stat__value">{{ reachedText(column) }}</span>
            </span>
            <span v-if="column === 'eased'" class="cfig-stat is-fail">
              <span class="cfig-stat__label">{{ copy.early }}</span>
              <span class="cfig-stat__value">{{ earlyShare }}</span>
            </span>
          </div>
        </section>
      </div>

      <section class="cfig-panel hl-chip">
        <div class="cfig-panel__title">
          {{ copy.chipTitle }}
        </div>
        <div ref="chipHostRef" class="hl-chip__stage">
          <TxModeChip :label="chipLabel" :tone="chipTone" @click="cycleChip" />
        </div>
        <p class="cfig-panel__note">
          {{ copy.chipNote }}
        </p>
        <div class="hl-stats">
          <span class="cfig-stat is-pass">
            <span class="cfig-stat__label">{{ copy.chipRest }}</span>
            <span class="cfig-stat__value">{{ formatMaybeMs(chipRestMs) }}</span>
          </span>
          <span class="cfig-stat is-accent">
            <span class="cfig-stat__label">{{ copy.chipMorph }}</span>
            <span class="cfig-stat__value">{{ chipMorphText }}</span>
          </span>
          <span class="cfig-stat">
            <span class="cfig-stat__label">{{ copy.chipLife }}</span>
            <span class="cfig-stat__value">{{ chipLifeText }}</span>
          </span>
        </div>
      </section>

      <span ref="probeRef" class="hl-probe" aria-hidden="true" />
    </div>
  </ConceptFigure>
</template>

<style scoped>
.hl-root {
  --hl-hover: color-mix(in srgb, var(--tx-color-primary, #409eff) 18%, transparent);
}

.hl {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

.hl__hint {
  margin: 0;
  color: var(--cfig-muted);
  font-size: 12px;
}

.hl-col__rule {
  align-self: flex-start;
  max-width: 100%;
  overflow-wrap: anywhere;
}

.hl-col__rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.hl-row {
  padding: 7px 10px;
  border-radius: 8px;
  background-color: transparent;
  cursor: default;
  user-select: none;
}

.hl-row:hover {
  background-color: var(--hl-hover);
}

/* The article's anti-pattern, verbatim. */
.hl-col.is-eased .hl-row {
  transition: background-color 200ms ease;
}

.hl-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hl-chip__stage {
  display: flex;
  align-items: center;
  min-height: 40px;
}

.hl-probe {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
  background-color: var(--hl-hover);
}
</style>
