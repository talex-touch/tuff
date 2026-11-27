<script setup lang="ts">
import {
  getSurfaceEnvironment,
  setSurfacePowerSaving,
  SURFACE_MOTION_SETTLE_MS,
  SURFACE_POINTER_SPEED_THRESHOLD,
} from '@talex-touch/tuffex/base-surface'
import { useReducedMotion } from '@talex-touch/tuffex/utils'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, triggerRef, watch } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * A draggable card holding a real TxBaseSurface in refraction mode with `autoDetect` on.
 * The figure decides nothing for it: the state and material it shows are read from the
 * surface's root classes, and the signal badges from `getSurfaceEnvironment()`.
 *
 * Two of autoDetect's inputs are on offer. A drag is a pressed pointer, which the page-wide
 * environment rates by speed; Fling moves the card with a CSS `translate` transition, which
 * the surface hears as `transitionstart` / `transitionend` on an ancestor. The card sits at
 * `left` / `top` rather than an inline `transform`, because autoDetect reads an inline
 * transform on an ancestor as motion; a fling folds its offset back into them when it ends.
 *
 * The plotted speed is sampled the way the environment samples it, over spans of at least
 * 16 ms between pointer events, so the trace crosses the threshold where the surface falls back.
 *
 * Frames run only while a drag or fling is in progress, while the surface is out of its
 * resting state, or briefly after a change.
 */

type Phase = 'active' | 'fallback' | 'recovering'

interface Reading {
  material: string
  phase: Phase
  state: string
}

interface TimelineSample {
  t: number
  v: number
  phase: Phase
  transition: boolean
}

const { locale } = useI18n()
const reducedMotion = useReducedMotion()
const { pointerMoving, windowMoving, powerSaving, frameTier } = getSurfaceEnvironment()

const THRESHOLD = SURFACE_POINTER_SPEED_THRESHOLD
/** The environment's shortest sampling span (surface-environment.ts). */
const SAMPLE_SPAN_MS = 16
/** With no pointer event for this long the pointer is resting, and the meter reads 0. */
const REST_MS = 64
/** Frames keep running this long after the last change, to draw its tail. */
const TAIL_MS = 400
const SPAN_MS = 3000
const METER_MAX = 3
/** A fling's average speed in px/ms; its ease-out starts it at about three times that. */
const FLING_SPEED = 0.9
// TxBaseSurface's refraction recovery (base-surface-motion.ts), recomputed the way the
// component does: max(parameter blend, mask release delay + release duration).
const RECOVERY_MS = Math.max(Math.max(182, 299 * 0.35), 60 + Math.round(650 * 0.35))
/** blur, glass and acrylic hold their fallback for max(transitionDuration, settleDelay). */
const SETTLING_MS = Math.max(299, 150)
const MODES = ['refraction', 'glass', 'acrylic', 'blur', 'mica', 'mask', 'pure', 'flat', 'plain']
const AT_REST: Reading = { material: 'refraction', phase: 'active', state: 'Refraction_Active' }

// Timeline units.
const TL_W = 360
const TL_TOP = 6
const TL_BOTTOM = 62
const BAND_Y = 70
const BAND_H = 10

const copy = computed(() => locale.value === 'zh'
  ? {
      stage: '可拖动的琉光卡片：拖动它，或按“甩一下”',
      drag: '拖我',
      fling: '甩一下',
      saving: '模拟省电',
      speed: '指针速度',
      peak: '本次峰值',
      material: '渲染材质',
      state: '状态',
      signals: (active: string) => `环境信号：${active || '无'}`,
      sigPointer: '快速拖动',
      sigTransition: 'translate 过渡',
      sigWindow: '窗口移动或缩放',
      sigPower: '省电',
      sigFrames: (tier: string) => `帧预算 ${tier}`,
      threshold: `阈值 ${THRESHOLD} px/ms`,
      legendSpeed: '指针速度',
      legendTransition: 'translate 过渡',
      legendActive: (state: string) => `静止（${state}）`,
      legendFallback: (state: string) => `降级（${state}）`,
      legendRecovery: (state: string, ms: number) => `恢复（${state}，${ms} ms）`,
      timeline: (state: string, speed: string) => `最近 3 秒的指针速度与组件状态，当前 ${state}，速度 ${speed} px/ms`,
      caption: `卡片里的 TxBaseSurface 打开了 autoDetect：图上的状态和材质读自它根节点的类名，信号读自 getSurfaceEnvironment()，这张图不替它判断。按住拖动时，指针速度（每段至少 16 ms）超过 ${THRESHOLD} px/ms 立即降级；“甩一下”用 CSS translate 过渡移动卡片，过渡一开始就降级。两种信号都要安静满 ${SURFACE_MOTION_SETTLE_MS} ms 才算结束，琉光再用 ${RECOVERY_MS} ms 分层恢复。“模拟省电”调用 setSurfacePowerSaving，把琉光换成 blur：运动时换成 mask，运动结束后再保持 ${SETTLING_MS} ms。缩放浏览器窗口也会触发降级。`,
      reduced: '系统开启了减少动态效果：“甩一下”直接把卡片放到对角，不播放过渡，组件也就收不到运动信号。',
    }
  : {
      stage: 'A draggable refraction card: drag it, or press Fling',
      drag: 'Drag me',
      fling: 'Fling',
      saving: 'Simulate power saving',
      speed: 'Pointer speed',
      peak: 'Peak this gesture',
      material: 'Rendered material',
      state: 'State',
      signals: (active: string) => `Environment signals: ${active || 'none'}`,
      sigPointer: 'Fast drag',
      sigTransition: 'translate transition',
      sigWindow: 'Window moving or resizing',
      sigPower: 'Power saving',
      sigFrames: (tier: string) => `Frame budget ${tier}`,
      threshold: `Threshold ${THRESHOLD} px/ms`,
      legendSpeed: 'Pointer speed',
      legendTransition: 'translate transition',
      legendActive: (state: string) => `At rest (${state})`,
      legendFallback: (state: string) => `Fallen back (${state})`,
      legendRecovery: (state: string, ms: number) => `Recovering (${state}, ${ms} ms)`,
      timeline: (state: string, speed: string) => `Pointer speed and component state over the last 3 seconds; now ${state} at ${speed} px/ms`,
      caption: `The TxBaseSurface in the card has autoDetect on. The state and material shown are read from its root element's classes and the signals from getSurfaceEnvironment(); the figure decides nothing for it. While you drag, a pointer speed above ${THRESHOLD} px/ms, measured over spans of at least 16 ms, falls back at once. Fling moves the card with a CSS translate transition, which falls back the moment it starts. Either signal must stay quiet for ${SURFACE_MOTION_SETTLE_MS} ms before it ends, and refraction then recovers in layers over ${RECOVERY_MS} ms. Simulate power saving calls setSurfacePowerSaving, which swaps refraction for blur: blur turns to mask while moving and holds it for ${SETTLING_MS} ms after the motion ends. Resizing the browser window falls back too.`,
      reduced: 'Reduced motion is on: Fling places the card in the far corner without a transition, so the surface hears no motion and does not fall back.',
    })

const caption = computed(() => (reducedMotion.value ? `${copy.value.caption} ${copy.value.reduced}` : copy.value.caption))

const stageRef = ref<HTMLElement | null>(null)
const cardRef = ref<HTMLElement | null>(null)
const position = ref({ x: 0, y: 0 })
/** A running fling's offset from `position`, applied as `translate`; null when none. */
const flingOffset = ref<{ x: number, y: number } | null>(null)
const flingDuration = ref(0)
/** Between the fling's `transitionstart` and its end or cancel. */
const transitionRunning = ref(false)
const dragging = ref(false)
const saving = ref(false)
const reading = ref<Reading>({ ...AT_REST })
const speed = ref(0)
const peak = ref(0)
const timeline = shallowRef<TimelineSample[]>([])
const lastTime = ref(0)

let surfaceEl: HTMLElement | null = null
let anchor: { x: number, y: number, t: number } | null = null
let lastSample: { t: number, v: number } | null = null
let tailUntil = 0
let frame = 0
let pointerId: number | null = null
let stageRect: DOMRect | null = null
let grab = { x: 0, y: 0 }
let flingTimer: ReturnType<typeof setTimeout> | undefined
let resizeObserver: ResizeObserver | null = null
let classObserver: MutationObserver | null = null
/** Whether the card has been moved, so a resize clamps it instead of re-centring it. */
let placed = false

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function bounds() {
  const stage = stageRef.value
  const card = cardRef.value
  if (!stage || !card)
    return { maxX: 0, maxY: 0 }
  return {
    maxX: Math.max(0, stage.clientWidth - card.offsetWidth),
    maxY: Math.max(0, stage.clientHeight - card.offsetHeight),
  }
}

/** Event time on the performance.now() clock. */
function stamp(event: Event) {
  return event.timeStamp > 1e12 ? performance.now() : event.timeStamp
}

/** The surface's state, as its root classes report it. */
function readSurface(): Reading {
  const list = surfaceEl?.classList
  if (!list)
    return AT_REST
  const material = MODES.find(mode => list.contains(`tx-base-surface--${mode}`)) ?? 'refraction'
  if (material === 'refraction') {
    if (list.contains('tx-base-surface--refraction-motion'))
      return { material, phase: 'fallback', state: 'Layered_Fallback' }
    if (list.contains('tx-base-surface--with-motion-cover'))
      return { material, phase: 'recovering', state: 'Refraction_Recovering' }
    return { material, phase: 'active', state: 'Refraction_Active' }
  }
  // The frame budget's minimal tier: a solid fill, which motion leaves alone.
  if (material === 'flat')
    return { material, phase: 'active', state: 'Flat' }
  // Power saving or the reduced tier: blur, which swaps to its fallback mask while moving.
  if (list.contains('tx-base-surface--settling'))
    return { material, phase: 'recovering', state: 'Settling' }
  if (material === 'mask')
    return { material, phase: 'fallback', state: 'Fallback_Mode' }
  return { material, phase: 'active', state: 'Blur_Degraded' }
}

function record(t: number, v: number, phase: Phase) {
  const list = timeline.value
  const previous = list[list.length - 1]
  // After an idle stretch the speed was 0 until now, not a ramp from the last sample.
  if (previous && t - previous.t > 100)
    list.push({ t: t - 16, v: 0, phase: 'active', transition: false })
  list.push({ t, v, phase, transition: transitionRunning.value })
  while (list.length && list[0]!.t < t - SPAN_MS)
    list.shift()
  lastTime.value = t
  triggerRef(timeline)
}

function tick() {
  frame = 0
  const t = performance.now()
  const next = readSurface()
  const current = reading.value
  if (next.state !== current.state || next.material !== current.material)
    reading.value = next
  speed.value = lastSample && t - lastSample.t < REST_MS ? lastSample.v : 0
  record(t, speed.value, next.phase)

  if (dragging.value || flingOffset.value || next.phase !== 'active' || t < tailUntil)
    frame = requestAnimationFrame(tick)
}

/** Something changed: draw frames until it has settled, and a little after. */
function kick() {
  tailUntil = performance.now() + TAIL_MS
  if (!frame)
    frame = requestAnimationFrame(tick)
}

/**
 * Moves a fling's offset into `left` / `top` and drops the transition in the same update,
 * so nothing transitions back. An interrupted fling keeps the offset it had reached.
 */
function foldFling(interrupted: boolean) {
  const offset = flingOffset.value
  if (!offset)
    return
  clearTimeout(flingTimer)
  flingTimer = undefined
  let dx = offset.x
  let dy = offset.y
  if (interrupted && cardRef.value) {
    // The computed `translate` is the in-flight value; a zero y is left out of it.
    const [x, y] = getComputedStyle(cardRef.value).translate.split(' ')
    dx = Number.parseFloat(x ?? '') || 0
    dy = Number.parseFloat(y ?? '') || 0
  }
  const { maxX, maxY } = bounds()
  position.value = {
    x: clamp(position.value.x + dx, 0, maxX),
    y: clamp(position.value.y + dy, 0, maxY),
  }
  flingOffset.value = null
  transitionRunning.value = false
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 || !stageRef.value)
    return
  foldFling(true)
  stageRect = stageRef.value.getBoundingClientRect()
  grab = {
    x: event.clientX - stageRect.left - position.value.x,
    y: event.clientY - stageRect.top - position.value.y,
  }
  pointerId = event.pointerId
  placed = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragging.value = true
  anchor = { x: event.clientX, y: event.clientY, t: stamp(event) }
  lastSample = null
  peak.value = 0
  kick()
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value || event.pointerId !== pointerId || !stageRect)
    return
  const { maxX, maxY } = bounds()
  position.value = {
    x: clamp(event.clientX - stageRect.left - grab.x, 0, maxX),
    y: clamp(event.clientY - stageRect.top - grab.y, 0, maxY),
  }
  // Speed over the span since the last sample, once that span reaches 16 ms.
  const t = stamp(event)
  if (anchor && t - anchor.t >= SAMPLE_SPAN_MS) {
    const v = Math.hypot(event.clientX - anchor.x, event.clientY - anchor.y) / (t - anchor.t)
    anchor = { x: event.clientX, y: event.clientY, t }
    lastSample = { t, v }
    peak.value = Math.max(peak.value, v)
  }
  kick()
}

function onPointerEnd(event: PointerEvent) {
  if (event.pointerId !== pointerId)
    return
  pointerId = null
  anchor = null
  dragging.value = false
  kick()
}

function onCardTransition(event: TransitionEvent) {
  // The surface's own layers transition too, and their events bubble through the card.
  if (event.target !== cardRef.value || event.propertyName !== 'translate')
    return
  transitionRunning.value = event.type === 'transitionstart'
  if (event.type === 'transitionend')
    foldFling(false)
  kick()
}

function startFling() {
  foldFling(true)
  const { maxX, maxY } = bounds()
  const from = { ...position.value }
  const to = { x: from.x < maxX / 2 ? maxX : 0, y: from.y < maxY / 2 ? maxY : 0 }
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  if (distance < 1)
    return
  pointerId = null
  anchor = null
  lastSample = null
  dragging.value = false
  placed = true
  peak.value = 0
  if (reducedMotion.value) {
    position.value = to
    kick()
    return
  }
  flingDuration.value = Math.round(clamp(distance / FLING_SPEED, 160, 420))
  flingOffset.value = { x: to.x - from.x, y: to.y - from.y }
  // A transition that never reports its end (a hidden tab, say) is folded all the same.
  flingTimer = setTimeout(() => foldFling(false), flingDuration.value + 200)
  kick()
}

function centre() {
  const { maxX, maxY } = bounds()
  position.value = { x: maxX / 2, y: maxY / 2 }
}

const cardStyle = computed(() => {
  const offset = flingOffset.value
  return {
    'left': `${position.value.x}px`,
    'top': `${position.value.y}px`,
    'translate': offset ? `${offset.x}px ${offset.y}px` : undefined,
    '--sd-fling-duration': `${flingDuration.value}ms`,
  }
})

const meterWidth = computed(() => `${(Math.min(speed.value, METER_MAX) / METER_MAX) * 100}%`)
const thresholdLeft = `${(THRESHOLD / METER_MAX) * 100}%`

/** The state names of the path the surface is on: refraction, degraded blur, or flat. */
const names = computed(() => {
  const material = reading.value.material
  if (material === 'refraction')
    return { path: 'refraction', active: 'Refraction_Active', fallback: 'Layered_Fallback', recovery: 'Refraction_Recovering', ms: RECOVERY_MS }
  if (material === 'flat')
    return { path: 'flat', active: 'Flat', fallback: '', recovery: '', ms: 0 }
  return { path: 'blur', active: 'Blur_Degraded', fallback: 'Fallback_Mode', recovery: 'Settling', ms: SETTLING_MS }
})

const signals = computed(() => [
  { key: 'pointer', label: copy.value.sigPointer, on: pointerMoving.value },
  { key: 'transition', label: copy.value.sigTransition, on: transitionRunning.value },
  { key: 'window', label: copy.value.sigWindow, on: windowMoving.value },
  { key: 'power', label: copy.value.sigPower, on: powerSaving.value },
  { key: 'frames', label: copy.value.sigFrames(frameTier.value), on: frameTier.value !== 'ok' },
])

const signalsLabel = computed(() => copy.value.signals(
  signals.value.filter(signal => signal.on).map(signal => signal.label).join(locale.value === 'zh' ? '、' : ', '),
))

function timelineX(t: number) {
  return TL_W * (1 - (lastTime.value - t) / SPAN_MS)
}

function timelineY(v: number) {
  return TL_BOTTOM - (Math.min(v, METER_MAX) / METER_MAX) * (TL_BOTTOM - TL_TOP)
}

const speedTrace = computed(() => timeline.value.map(sample => `${timelineX(sample.t).toFixed(1)},${timelineY(sample.v).toFixed(1)}`).join(' '))

const bands = computed(() => {
  const result: Array<{ x: number, width: number, phase: Phase }> = []
  const list = timeline.value
  list.forEach((sample, index) => {
    const x = timelineX(sample.t)
    const next = list[index + 1]
    const end = next ? timelineX(next.t) : x
    const last = result[result.length - 1]
    if (last && last.phase === sample.phase)
      last.width = end - last.x
    else
      result.push({ x, width: end - x, phase: sample.phase })
  })
  return result
})

const transitionSpans = computed(() => {
  const result: Array<{ x: number, width: number }> = []
  const list = timeline.value
  let open: { x: number, width: number } | null = null
  list.forEach((sample, index) => {
    if (!sample.transition) {
      open = null
      return
    }
    const x = timelineX(sample.t)
    const next = list[index + 1]
    const end = next ? timelineX(next.t) : x
    if (open) {
      open.width = end - open.x
    }
    else {
      open = { x, width: end - x }
      result.push(open)
    }
  })
  return result
})

watch(saving, (value) => {
  // The host override; null hands the signal back to the Battery Status API.
  setSurfacePowerSaving(value ? true : null)
})

watch([pointerMoving, windowMoving, powerSaving, frameTier], kick)

function resetDemo() {
  if (frame)
    cancelAnimationFrame(frame)
  frame = 0
  clearTimeout(flingTimer)
  flingTimer = undefined
  flingOffset.value = null
  transitionRunning.value = false
  pointerId = null
  anchor = null
  lastSample = null
  tailUntil = 0
  dragging.value = false
  saving.value = false
  speed.value = 0
  peak.value = 0
  timeline.value = []
  placed = false
  centre()
  reading.value = readSurface()
}

onMounted(() => {
  centre()
  surfaceEl = cardRef.value?.querySelector<HTMLElement>('.tx-base-surface') ?? null
  reading.value = readSurface()
  if (surfaceEl && typeof MutationObserver !== 'undefined') {
    // Whatever moves the surface, the environment included, shows up in its classes first.
    classObserver = new MutationObserver(kick)
    classObserver.observe(surfaceEl, { attributes: true, attributeFilter: ['class'] })
  }
  if (typeof ResizeObserver !== 'undefined' && stageRef.value) {
    resizeObserver = new ResizeObserver(() => {
      foldFling(true)
      if (!placed) {
        centre()
        return
      }
      const { maxX, maxY } = bounds()
      position.value = { x: clamp(position.value.x, 0, maxX), y: clamp(position.value.y, 0, maxY) }
    })
    resizeObserver.observe(stageRef.value)
  }
})

onBeforeUnmount(() => {
  if (frame)
    cancelAnimationFrame(frame)
  frame = 0
  clearTimeout(flingTimer)
  flingTimer = undefined
  classObserver?.disconnect()
  classObserver = null
  resizeObserver?.disconnect()
  resizeObserver = null
  surfaceEl = null
  // The override is page-wide: hand it back rather than leave every other surface saving power.
  if (saving.value)
    setSurfacePowerSaving(null)
})

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure class="sd-root" :caption="caption">
    <div class="sd">
      <div ref="stageRef" class="sd-stage" role="group" :aria-label="copy.stage">
        <div class="sd-backdrop" aria-hidden="true">
          <span class="sd-blob is-1" />
          <span class="sd-blob is-2" />
          <span class="sd-blob is-3" />
          <span class="sd-word">Tuff</span>
        </div>
        <div
          ref="cardRef"
          class="sd-card"
          :class="{ 'is-dragging': dragging, 'is-flinging': flingOffset }"
          :style="cardStyle"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerEnd"
          @pointercancel="onPointerEnd"
          @lostpointercapture="onPointerEnd"
          @transitionstart="onCardTransition"
          @transitionend="onCardTransition"
          @transitioncancel="onCardTransition"
        >
          <TxBaseSurface mode="refraction" auto-detect :radius="16" class="sd-surface">
            <span class="sd-surface__body">
              <span class="sd-surface__title">{{ copy.drag }}</span>
              <span class="sd-surface__state cfig-mono">{{ reading.state }}</span>
            </span>
          </TxBaseSurface>
        </div>
      </div>

      <div class="sd-telemetry">
        <div class="sd-signals" role="img" :aria-label="signalsLabel">
          <span
            v-for="signal in signals"
            :key="signal.key"
            class="cfig-badge sd-signal"
            :class="{ 'is-on': signal.on }"
            aria-hidden="true"
          >{{ signal.label }}</span>
        </div>
        <div
          class="sd-meter"
          role="meter"
          :aria-label="copy.speed"
          :aria-valuenow="Number(speed.toFixed(2))"
          aria-valuemin="0"
          :aria-valuemax="METER_MAX"
        >
          <span class="sd-meter__fill" :class="{ 'is-over': speed > THRESHOLD }" :style="{ width: meterWidth }" />
          <span class="sd-meter__threshold" :style="{ left: thresholdLeft }" />
        </div>
        <svg class="sd-timeline" :viewBox="`0 0 ${TL_W} ${BAND_Y + BAND_H + 2}`" preserveAspectRatio="none" role="img" :aria-label="copy.timeline(reading.state, speed.toFixed(2))">
          <rect
            v-for="(span, index) in transitionSpans"
            :key="`t${index}`"
            class="sd-timeline__transition"
            :x="span.x"
            :y="TL_TOP"
            :width="Math.max(0, span.width)"
            :height="TL_BOTTOM - TL_TOP"
          />
          <line class="sd-timeline__threshold" x1="0" :y1="timelineY(THRESHOLD)" :x2="TL_W" :y2="timelineY(THRESHOLD)" />
          <line class="sd-timeline__axis" x1="0" :y1="TL_BOTTOM" :x2="TL_W" :y2="TL_BOTTOM" />
          <rect
            v-for="(band, index) in bands"
            :key="index"
            class="sd-timeline__band"
            :class="`is-${band.phase}`"
            :x="band.x"
            :y="BAND_Y"
            :width="Math.max(0, band.width)"
            :height="BAND_H"
          />
          <polyline class="sd-timeline__speed" :points="speedTrace" />
        </svg>
      </div>
    </div>

    <template #controls>
      <TxButton size="sm" variant="secondary" @click="startFling">
        {{ copy.fling }}
      </TxButton>
      <TxSwitch v-model="saving" :label="copy.saving" />
      <div class="cfig-legend">
        <span class="cfig-legend__item" style="--swatch: var(--sd-speed)"><span class="cfig-legend__swatch" />{{ copy.legendSpeed }}</span>
        <span class="cfig-legend__item" style="--swatch: var(--sd-threshold)"><span class="cfig-legend__swatch" />{{ copy.threshold }}</span>
        <span class="cfig-legend__item" style="--swatch: var(--sd-transition-swatch)"><span class="cfig-legend__swatch" />{{ copy.legendTransition }}</span>
        <span class="cfig-legend__item" style="--swatch: var(--sd-active)"><span class="cfig-legend__swatch" />{{ copy.legendActive(names.active) }}</span>
        <template v-if="names.path !== 'flat'">
          <span class="cfig-legend__item" style="--swatch: var(--sd-fallback)"><span class="cfig-legend__swatch" />{{ copy.legendFallback(names.fallback) }}</span>
          <span class="cfig-legend__item" style="--swatch: var(--sd-recovery)"><span class="cfig-legend__swatch" />{{ copy.legendRecovery(names.recovery, names.ms) }}</span>
        </template>
      </div>
    </template>

    <template #readout>
      <span class="cfig-stat" :class="{ 'is-accent': speed > THRESHOLD }">
        <span class="cfig-stat__label">{{ copy.speed }}</span>
        <span class="cfig-stat__value">{{ speed.toFixed(2) }} px/ms</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.peak }}</span>
        <span class="cfig-stat__value">{{ peak.toFixed(2) }} px/ms</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.material }}</span>
        <span class="cfig-stat__value">{{ reading.material }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.state }}</span>
        <span class="cfig-stat__value">{{ reading.state }}</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.sd-root {
  --sd-speed: var(--cfig-accent);
  --sd-threshold: var(--tx-color-warning, #e6a23c);
  --sd-transition: color-mix(in srgb, var(--cfig-accent) 14%, transparent);
  --sd-transition-swatch: color-mix(in srgb, var(--cfig-accent) 40%, transparent);
  --sd-active: color-mix(in srgb, var(--tx-color-success, #67c23a) 55%, transparent);
  --sd-fallback: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 60%, transparent);
  --sd-recovery: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 55%, transparent);
}

.sd {
  display: flex;
  flex-direction: column;
}

.sd-stage {
  position: relative;
  height: 230px;
  overflow: hidden;
  touch-action: none;
}

.sd-backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background:
    repeating-linear-gradient(90deg, rgb(255 255 255 / 0.28) 0 2px, transparent 2px 16px),
    linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
}

.sd-blob {
  position: absolute;
  border-radius: 50%;
  opacity: 0.6;
}

.sd-blob.is-1 {
  top: -40px;
  left: 6%;
  width: 160px;
  height: 160px;
  background: #ffd700;
}

.sd-blob.is-2 {
  right: 12%;
  bottom: -50px;
  width: 150px;
  height: 150px;
  background: #00d2ff;
}

.sd-blob.is-3 {
  top: 30px;
  right: -20px;
  width: 110px;
  height: 110px;
  background: #ff6b6b;
}

.sd-word {
  position: absolute;
  top: 50%;
  left: 50%;
  color: rgb(255 255 255 / 0.5);
  font-size: 72px;
  font-weight: 700;
  letter-spacing: 6px;
  transform: translate(-50%, -50%);
  user-select: none;
}

.sd-card {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  width: 156px;
  height: 100px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.sd-card.is-dragging {
  cursor: grabbing;
}

/* Ease-out cubic, the curve a thrown card decelerates along. */
.sd-card.is-flinging {
  transition: translate var(--sd-fling-duration) cubic-bezier(0.215, 0.61, 0.355, 1);
}

.sd-surface {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--tx-text-color-primary, #303133);
}

.sd-surface__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.sd-surface__title {
  font-size: 14px;
  font-weight: 600;
}

.sd-surface__state {
  font-size: 11px;
}

.sd-telemetry {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--cfig-line);
}

.sd-signals {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sd-signal {
  gap: 5px;
}

.sd-signal::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.35;
}

.sd-signal.is-on {
  background: color-mix(in srgb, var(--cfig-accent) 16%, transparent);
  color: color-mix(in srgb, var(--cfig-accent) 60%, var(--cfig-ink));
}

.sd-signal.is-on::before {
  opacity: 1;
}

.sd-meter {
  position: relative;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cfig-ink) 8%, transparent);
}

.sd-meter__fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: var(--sd-speed);
}

.sd-meter__fill.is-over {
  background: var(--tx-color-danger, #f56c6c);
}

.sd-meter__threshold {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  background: var(--sd-threshold);
}

.sd-timeline {
  display: block;
  width: 100%;
  height: 84px;
}

.sd-timeline__transition {
  fill: var(--sd-transition);
}

.sd-timeline__axis {
  stroke: var(--cfig-line-strong);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.sd-timeline__threshold {
  stroke: var(--sd-threshold);
  stroke-width: 1;
  stroke-dasharray: 4 3;
  vector-effect: non-scaling-stroke;
}

.sd-timeline__speed {
  fill: none;
  stroke: var(--sd-speed);
  stroke-width: 1.6;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.sd-timeline__band.is-active {
  fill: var(--sd-active);
}

.sd-timeline__band.is-fallback {
  fill: var(--sd-fallback);
}

.sd-timeline__band.is-recovering {
  fill: var(--sd-recovery);
}

@media (prefers-reduced-motion: reduce) {
  .sd-card.is-flinging {
    transition: none;
  }
}
</style>
