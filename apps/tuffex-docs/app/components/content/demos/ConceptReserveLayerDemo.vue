<script setup lang="ts">
import type { TxStreamElementInstance } from '@talex-touch/tuffex/stream-element'
import type { StreamState } from '@talex-touch/tuffex/stream-text'
import { STREAM_PACING_DEFAULTS } from '@talex-touch/tuffex/stream-text'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * Two real TxStreamElements hold the same complete answer and replay it together, one
 * with `reserve`, one without, each followed by the next block of the page. Every frame
 * of a replay measures how far that next block moved from where it rests (the dashed
 * line). Skip calls the components' own `skip()` and times how long the complete text
 * takes to be in the DOM; a selection made inside a pane while it plays is counted.
 * The panes keep their resting height, so the page around the figure never moves.
 */

type PanelKey = 'on' | 'off'

interface Shift {
  travel: number
  maxJump: number
  moves: number
}

interface SkipResult {
  ms: number
  beforeFrame: boolean
  complete: boolean
}

const PANELS: { key: PanelKey, reserve: boolean }[] = [
  { key: 'on', reserve: true },
  { key: 'off', reserve: false },
]
/** Below this a frame-to-frame difference is sub-pixel rounding, not a move. */
const MOVE_EPSILON = 0.5
const SLOW_FACTOR = 4
/** A replay that never reports done stops being tracked after this. */
const TRACK_LIMIT_MS = 30000

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const copy = computed(() => zh.value
  ? {
      answer: [
        '**占位层**先按完整答案排好版，再把自己藏起来：活动层在同一个网格单元里逐词出现，外层从第一帧起就是最终高度。',
        '',
        '- 占位层带 `aria-hidden` 与 `inert`，读屏和键盘都碰不到它',
        '- 两层都裁掉首尾子项的外边距，量出的高度一致',
        '- 已经出现的文字随时可以拖选、复制',
        '',
        '没有占位层时，容器从零开始长高，后面的内容每换一行就被推下去一次。',
      ].join('\n'),
      panels: { on: '开启 reserve', off: '关闭 reserve' } as Record<PanelKey, string>,
      notes: {
        on: '同一网格单元里叠着一份不可见的完整副本，播放期间才挂载。',
        off: '容器跟着已经出现的文字一起长高。',
      } as Record<PanelKey, string>,
      nextTitle: '下一条消息',
      nextBody: '这一块应该一直待在虚线上。',
      replay: '重播',
      skip: '跳过',
      slow: '慢放',
      rest: '下一块的静止位置',
      shift: (key: PanelKey) => `下一块位移 · ${key === 'on' ? '开启' : '关闭'} reserve`,
      moves: (n: number) => `${n} 次`,
      max: '最大',
      heights: '占位层高度 / 播完后高度',
      skipLabel: '跳过 → 完整文本',
      beforeFrame: '早于下一帧',
      afterFrame: '晚于下一帧',
      incomplete: '未完整',
      selected: '播放中选中',
      chars: (n: number) => `${n} 字`,
      reduced: '系统开启了「减弱动态效果」：TxStreamElement 会旁路节拍，重播会瞬间完成，因此也不自动播放。',
      caption: '两份 TxStreamElement 装着同一段完整答案，调用各自的 replay() 同时重播；左边开启 reserve，右边关闭（窄屏时上下排列）。每一帧都量一次下一块离开虚线的距离；「跳过」调用组件自己的 skip()，计时到完整文本进入 DOM。播放时可以直接拖选已经出现的文字。',
    }
  : {
      answer: [
        'The **reserve layer** lays out the complete answer first, then hides itself: the live layer reveals word by word in the same grid cell, and the outer box has its final height from the first frame.',
        '',
        '- The reserve carries `aria-hidden` and `inert`, so screen readers and the keyboard never reach it',
        '- Both layers trim their first and last child margins, so the heights they measure match',
        '- Words already on screen can be selected and copied at any moment',
        '',
        'Without it, the container grows from nothing, and everything after it is pushed down once per new line.',
      ].join('\n'),
      panels: { on: 'reserve on', off: 'reserve off' } as Record<PanelKey, string>,
      notes: {
        on: 'An invisible complete copy shares the grid cell, mounted only while it plays.',
        off: 'The box grows with the words shown so far.',
      } as Record<PanelKey, string>,
      nextTitle: 'Next message',
      nextBody: 'This block should stay on the dashed line.',
      replay: 'Replay',
      skip: 'Skip',
      slow: 'Slow motion',
      rest: 'Where the next block rests',
      shift: (key: PanelKey) => `Next block travel · reserve ${key}`,
      moves: (n: number) => `${n} ${n === 1 ? 'move' : 'moves'}`,
      max: 'max',
      heights: 'Reserve height / height when done',
      skipLabel: 'Skip → complete text',
      beforeFrame: 'before the next frame',
      afterFrame: 'after the next frame',
      incomplete: 'incomplete',
      selected: 'Selected while playing',
      chars: (n: number) => `${n} chars`,
      reduced: 'Reduced motion is on: TxStreamElement bypasses pacing, so a replay completes at once and nothing autoplays.',
      caption: 'Two TxStreamElements hold the same complete answer and replay it together through their own replay(); the first keeps reserve on, the second has it off (stacked on narrow screens). Every frame measures how far the next block has left the dashed line. Skip calls the components\' own skip() and times how long the complete text takes to reach the DOM. Words already shown can be selected while it plays.',
    })

const slow = ref(false)
const wordMs = computed(() => STREAM_PACING_DEFAULTS.wordMs * (slow.value ? SLOW_FACTOR : 1))

const playing = ref(false)
const states = ref<Record<PanelKey, StreamState>>({ on: 'done', off: 'done' })
const shifts = ref<Record<PanelKey, Shift> | null>(null)
const rest = ref<Record<PanelKey, number> | null>(null)
const holdHeight = ref(0)
const reserveHeight = ref<number | null>(null)
const finalHeight = ref<number | null>(null)
const skipResult = ref<SkipResult | null>(null)
const selected = ref(0)
const reducedMotion = ref(false)

const rootRef = shallowRef<HTMLElement | null>(null)
const viewports: Partial<Record<PanelKey, HTMLElement>> = {}
const streams: Partial<Record<PanelKey, TxStreamElementInstance>> = {}

function setViewport(key: PanelKey, el: unknown) {
  if (el instanceof HTMLElement)
    viewports[key] = el
  else
    delete viewports[key]
}

function setStream(key: PanelKey, instance: unknown) {
  if (instance)
    streams[key] = instance as TxStreamElementInstance
  else
    delete streams[key]
}

function nextBlock(key: PanelKey) {
  return viewports[key]?.querySelector<HTMLElement>('.rsv__next') ?? null
}

/** The next block's top, relative to its pane. */
function nextTop(key: PanelKey): number | null {
  const viewport = viewports[key]
  const next = nextBlock(key)
  if (!viewport || !next)
    return null
  return next.getBoundingClientRect().top - viewport.getBoundingClientRect().top
}

function liveLayer(key: PanelKey) {
  return viewports[key]?.querySelector<HTMLElement>('.tx-stream-element__live') ?? null
}

/** Characters of the complete answer, read from a pane at rest. */
let fullLength = 0

/** Where each next block rests, and the height both panes keep; only at rest. */
function measureRest() {
  if (playing.value)
    return
  const tops = {} as Record<PanelKey, number>
  let bottom = 0
  for (const { key } of PANELS) {
    const next = nextBlock(key)
    if (!next)
      return
    // offsetTop ignores the min-height the pane is holding.
    tops[key] = next.offsetTop
    bottom = Math.max(bottom, next.offsetTop + next.offsetHeight)
  }
  rest.value = tops
  holdHeight.value = bottom
  fullLength = liveLayer('on')?.textContent?.length ?? 0
}

let measureFrame = 0
function scheduleMeasure() {
  if (measureFrame)
    return
  measureFrame = requestAnimationFrame(() => {
    measureFrame = 0
    measureRest()
  })
}

let trackFrame = 0
let trackStart = 0
const lastTops: Record<PanelKey, number | null> = { on: null, off: null }

function stopTracking() {
  if (trackFrame)
    cancelAnimationFrame(trackFrame)
  trackFrame = 0
}

function track() {
  trackFrame = 0
  const current = shifts.value
  if (!current)
    return
  for (const { key } of PANELS) {
    const top = nextTop(key)
    const last = lastTops[key]
    if (top === null)
      continue
    if (last !== null) {
      const delta = Math.abs(top - last)
      if (delta > MOVE_EPSILON) {
        current[key].travel += delta
        current[key].maxJump = Math.max(current[key].maxJump, delta)
        current[key].moves++
      }
    }
    lastTops[key] = top
  }
  const done = states.value.on === 'done' && states.value.off === 'done'
  if (done || performance.now() - trackStart > TRACK_LIMIT_MS) {
    playing.value = false
    finalHeight.value = liveLayer('on')?.getBoundingClientRect().height ?? null
    scheduleMeasure()
    return
  }
  trackFrame = requestAnimationFrame(track)
}

function replay() {
  if (!streams.on || !streams.off)
    return
  stopTracking()
  measureRest()
  for (const { key } of PANELS)
    lastTops[key] = nextTop(key)
  shifts.value = {
    on: { travel: 0, maxJump: 0, moves: 0 },
    off: { travel: 0, maxJump: 0, moves: 0 },
  }
  reserveHeight.value = null
  finalHeight.value = null
  skipResult.value = null
  selected.value = 0
  // Set before the calls: a component reports its own states synchronously.
  states.value = { on: 'streaming', off: 'streaming' }
  playing.value = true
  trackStart = performance.now()
  streams.on.replay()
  streams.off.replay()
  void nextTick(() => {
    const reserve = viewports.on?.querySelector<HTMLElement>('.tx-stream-element__reserve')
    reserveHeight.value = reserve ? reserve.getBoundingClientRect().height : null
  })
  trackFrame = requestAnimationFrame(track)
}

async function skipNow() {
  if (!playing.value)
    return
  let framed = false
  const probe = requestAnimationFrame(() => {
    framed = true
  })
  const start = performance.now()
  streams.on?.skip()
  streams.off?.skip()
  await nextTick()
  const ms = performance.now() - start
  cancelAnimationFrame(probe)
  const complete = PANELS.every(({ key }) => (liveLayer(key)?.textContent?.length ?? 0) >= fullLength)
  skipResult.value = { ms, beforeFrame: !framed, complete }
}

function onState(key: PanelKey, state: StreamState) {
  states.value[key] = state
}

function onSelectionChange() {
  if (!playing.value)
    return
  const selection = document.getSelection()
  const root = rootRef.value
  if (!selection || selection.isCollapsed || !root || !selection.anchorNode || !root.contains(selection.anchorNode))
    return
  selected.value = Math.max(selected.value, selection.toString().length)
}

function resetDemo() {
  if (playing.value) {
    streams.on?.skip()
    streams.off?.skip()
  }
  stopTracking()
  playing.value = false
  states.value = { on: 'done', off: 'done' }
  shifts.value = null
  reserveHeight.value = null
  finalHeight.value = null
  skipResult.value = null
  selected.value = 0
  slow.value = false
  void nextTick(scheduleMeasure)
}

defineExpose({ resetDemo })

let resizeObserver: ResizeObserver | null = null
let intersectionObserver: IntersectionObserver | null = null
let motionQuery: MediaQueryList | null = null

function onMotionChange() {
  reducedMotion.value = Boolean(motionQuery?.matches)
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  onMotionChange()
  motionQuery.addEventListener('change', onMotionChange)
  document.addEventListener('selectionchange', onSelectionChange)
  scheduleMeasure()
  void document.fonts?.ready.then(scheduleMeasure)
  const root = rootRef.value
  if (!root)
    return
  resizeObserver = new ResizeObserver(scheduleMeasure)
  resizeObserver.observe(root)
  // One replay when the figure first comes into view, unless motion is reduced.
  intersectionObserver = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.4))
      return
    intersectionObserver?.disconnect()
    intersectionObserver = null
    if (!reducedMotion.value)
      replay()
  }, { threshold: 0.4 })
  intersectionObserver.observe(root)
})

onBeforeUnmount(() => {
  stopTracking()
  if (measureFrame)
    cancelAnimationFrame(measureFrame)
  measureFrame = 0
  resizeObserver?.disconnect()
  intersectionObserver?.disconnect()
  resizeObserver = null
  intersectionObserver = null
  motionQuery?.removeEventListener('change', onMotionChange)
  motionQuery = null
  document.removeEventListener('selectionchange', onSelectionChange)
})

// The answer is per language: a new one starts at rest.
watch(locale, resetDemo)

function px(value: number) {
  return `${Math.round(value * 10) / 10} px`
}

function shiftValue(key: PanelKey) {
  const shift = shifts.value?.[key]
  if (!shift)
    return '—'
  const base = `${px(shift.travel)} · ${copy.value.moves(shift.moves)}`
  return shift.moves > 0 ? `${base} · ${copy.value.max} ${px(shift.maxJump)}` : base
}

function shiftTone(key: PanelKey) {
  const shift = shifts.value?.[key]
  if (!shift || playing.value)
    return 'is-accent'
  return shift.moves === 0 ? 'is-pass' : 'is-fail'
}

const heightsValue = computed(() => {
  if (reserveHeight.value === null)
    return '—'
  return `${px(reserveHeight.value)} / ${finalHeight.value === null ? '…' : px(finalHeight.value)}`
})

const skipValue = computed(() => {
  const result = skipResult.value
  if (!result)
    return '—'
  const when = result.beforeFrame ? copy.value.beforeFrame : copy.value.afterFrame
  return `${result.ms.toFixed(1)} ms · ${result.complete ? when : copy.value.incomplete}`
})
</script>

<template>
  <ConceptFigure stage="plain" :caption="copy.caption">
    <div ref="rootRef" class="rsv">
      <div class="cfig-split">
        <div v-for="panel in PANELS" :key="panel.key" class="cfig-panel">
          <span class="cfig-panel__title">
            {{ copy.panels[panel.key] }}
            <span class="cfig-badge cfig-mono" :class="{ 'is-pass': states[panel.key] === 'done' }">{{ states[panel.key] }}</span>
          </span>
          <div
            :ref="el => setViewport(panel.key, el)"
            class="rsv__viewport"
            :style="holdHeight ? { minHeight: `${holdHeight}px` } : undefined"
          >
            <TxStreamElement
              :ref="instance => setStream(panel.key, instance)"
              class="rsv__answer"
              :content="copy.answer"
              :reserve="panel.reserve"
              :word-ms="wordMs"
              :locale="zh ? 'zh' : 'en'"
              @state-change="(state: StreamState) => onState(panel.key, state)"
            />
            <div class="rsv__next">
              <span class="rsv__next-title">{{ copy.nextTitle }}</span>
              <span class="rsv__next-body">{{ copy.nextBody }}</span>
            </div>
            <span
              v-if="rest"
              class="rsv__rest"
              :style="{ top: `${rest[panel.key]}px` }"
              aria-hidden="true"
            />
          </div>
          <span class="cfig-panel__note">{{ copy.notes[panel.key] }}</span>
        </div>
      </div>
    </div>

    <template #controls>
      <TxButton size="sm" variant="primary" @click="replay">
        {{ copy.replay }}
      </TxButton>
      <TxButton size="sm" variant="secondary" :disabled="!playing" @click="skipNow">
        {{ copy.skip }}
      </TxButton>
      <div class="cfig-control">
        <span class="cfig-control__label">{{ copy.slow }} ×{{ SLOW_FACTOR }}</span>
        <TxSwitch v-model="slow" :aria-label="copy.slow" />
        <span class="cfig-control__value">wordMs {{ wordMs }}</span>
      </div>
      <div class="cfig-legend">
        <span class="cfig-legend__item" style="--swatch: var(--cfig-accent)"><span class="cfig-legend__swatch" />{{ copy.rest }}</span>
      </div>
      <p v-if="reducedMotion" class="cfig-panel__note rsv__reduced">
        {{ copy.reduced }}
      </p>
    </template>

    <template #readout>
      <span v-for="panel in PANELS" :key="panel.key" class="cfig-stat" :class="shiftTone(panel.key)">
        <span class="cfig-stat__label">{{ copy.shift(panel.key) }}</span>
        <span class="cfig-stat__value">{{ shiftValue(panel.key) }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.heights }}</span>
        <span class="cfig-stat__value">{{ heightsValue }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.skipLabel }}</span>
        <span class="cfig-stat__value">{{ skipValue }}</span>
      </span>
      <span class="cfig-stat" :class="{ 'is-pass': selected > 0 }">
        <span class="cfig-stat__label">{{ copy.selected }}</span>
        <span class="cfig-stat__value">{{ selected > 0 ? copy.chars(selected) : '—' }}</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.rsv {
  padding: 14px;
}

.rsv__viewport {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rsv__answer {
  font-size: 14px;
  line-height: 1.65;
}

.rsv__next {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--cfig-line-strong);
  border-radius: 10px;
  background: var(--cfig-panel);
}

.rsv__next-title {
  font-size: 12px;
  font-weight: 600;
}

.rsv__next-body {
  color: var(--cfig-muted);
  font-size: 12px;
}

/* Where the next block's top edge rests. */
.rsv__rest {
  position: absolute;
  right: -6px;
  left: -6px;
  border-top: 1px dashed var(--cfig-accent);
  pointer-events: none;
}

.rsv__reduced {
  flex-basis: 100%;
  margin: 0;
}
</style>
