<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * A real TxCard with background="refraction" and refraction-light-follow-mouse on. The
 * sliders set its spring props, and the dot is the light point read back from the
 * --tx-surface-refraction-light-x/y that the card's TxBaseSurface writes onto its own style,
 * so what moves is the component's light, not a copy of it.
 *
 * The figure tracks only the target the card aims at, normalised the way TxCard does it:
 * the pointer's position in the card clamped to 0–1, and the centre once the pointer leaves.
 * The arrow keys move that target by sending the card the mousemove a pointer would.
 *
 * Overshoot and settle time come from TxCard's integration (card/src/TxCard.vue),
 * v ← (v + k·(target − P)·Δ)·c^Δ and P ← clamp(P + v·Δ, 0, 1), run for one jump at 60 Hz
 * (Δ = 1). Without the 0–1 bounds the step response is the same at any jump size.
 */

interface Point { x: number, y: number }

const { locale } = useI18n()

const FRAME_MS = 1000 / 60
/** TxCard's defaults. */
const DEFAULT_STIFFNESS = 0.15
const DEFAULT_DAMPING = 0.6
const BASE_STRENGTH = 62
const FOLLOW_INTENSITY = 0.45
/** Arrow keys move the target by this share of the card; Shift moves it four times as far. */
const KEY_STEP = 0.05
const CENTRE: Point = { x: 0.5, y: 0.5 }

const stiffness = ref(DEFAULT_STIFFNESS)
const damping = ref(DEFAULT_DAMPING)
const spring = ref(true)
const showMarkers = ref(true)
const size = shallowRef({ w: 0, h: 0 })
const target = shallowRef<Point>({ ...CENTRE })
const light = shallowRef<Point>({ ...CENTRE })
const frameRef = ref<HTMLElement | null>(null)

let observer: MutationObserver | null = null
let resizeObserver: ResizeObserver | null = null

const copy = computed(() => locale.value === 'zh'
  ? {
      cardTitle: 'TxCard · refraction',
      cardHint: '移动指针，或聚焦后用方向键移动目标',
      frameLabel: '光源跟随标本：移动指针，或用方向键移动目标点',
      stiffness: '刚度 k（stiffness）',
      damping: '阻尼 c（damping）',
      spring: '弹簧',
      markers: '显示标记',
      legendTarget: '目标点（指针位置）',
      legendLight: '光源点（从组件读回）',
      target: '目标点',
      light: '光源点',
      lag: '相差',
      strength: '折射强度',
      overshoot: '过冲',
      settle: '95% 稳定',
      instant: '立即',
      frames: '帧',
      marks: (aim: string, point: string, gap: string) => `目标 ${aim}，光源 ${point}，相差 ${gap} 像素`,
      caption: '真实的 TxCard（background="refraction"，打开 refraction-light-follow-mouse），滑杆直接改它的弹簧参数；圆点是从组件写出的 --tx-surface-refraction-light-x/y 读回的光源点。过冲与稳定用时按组件的积分公式、以 60 Hz 推算一次跳变。',
    }
  : {
      cardTitle: 'TxCard · refraction',
      cardHint: 'Move the pointer, or focus and use the arrow keys',
      frameLabel: 'Light-follow specimen: move the pointer, or move the target with the arrow keys',
      stiffness: 'Stiffness k',
      damping: 'Damping c',
      spring: 'Spring',
      markers: 'Show markers',
      legendTarget: 'Target (the pointer)',
      legendLight: 'Light point (read from the component)',
      target: 'Target',
      light: 'Light point',
      lag: 'Gap',
      strength: 'Refraction strength',
      overshoot: 'Overshoot',
      settle: '95% settle',
      instant: 'Instant',
      frames: 'frames',
      marks: (aim: string, point: string, gap: string) => `Target ${aim}, light ${point}, ${gap} px apart`,
      caption: 'A real TxCard (background="refraction" with refraction-light-follow-mouse on): the sliders set its spring props directly, and the dot is the light point read back from the --tx-surface-refraction-light-x/y it writes. Overshoot and settle time are worked out from the integration TxCard runs, for one jump at 60 Hz.',
    })

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** One jump of the light spring at 60 Hz: how far past the target it swings, and the frames until it stays within 5%. */
function stepResponse(k: number, c: number) {
  let p = 0
  let v = 0
  let peak = 0
  let lastOutside = 0
  for (let n = 1; n <= 4000; n++) {
    v = (v + k * (1 - p)) * c
    p += v
    peak = Math.max(peak, p)
    if (Math.abs(1 - p) >= 0.05)
      lastOutside = n
  }
  return { overshoot: Math.max(0, peak - 1), frames: lastOutside }
}

const response = computed(() => stepResponse(stiffness.value, damping.value))
const overshootText = computed(() => spring.value ? `${(response.value.overshoot * 100).toFixed(1)}%` : '0%')
const settleText = computed(() => spring.value
  ? `${Math.round(response.value.frames * FRAME_MS)} ms · ${response.value.frames} ${copy.value.frames}`
  : copy.value.instant)

/** TxCard's strength: the base plus distance-from-centre × 16 × follow intensity. */
const strength = computed(() => {
  const rx = clamp(light.value.x * 2 - 1, -1, 1)
  const ry = clamp(light.value.y * 2 - 1, -1, 1)
  return clamp(BASE_STRENGTH + clamp(Math.hypot(rx, ry), 0, 1) * 16 * FOLLOW_INTENSITY, 0, 100)
})

function percent(point: Point) {
  return `(${(point.x * 100).toFixed(1)}%, ${(point.y * 100).toFixed(1)}%)`
}

const targetText = computed(() => percent(target.value))
const lightText = computed(() => percent(light.value))
const lagPx = computed(() => Math.hypot((target.value.x - light.value.x) * size.value.w, (target.value.y - light.value.y) * size.value.h))
const marksLabel = computed(() => copy.value.marks(targetText.value, lightText.value, lagPx.value.toFixed(1)))
const viewBox = computed(() => `0 0 ${Math.max(1, size.value.w)} ${Math.max(1, size.value.h)}`)
const targetPx = computed(() => ({ x: target.value.x * size.value.w, y: target.value.y * size.value.h }))
const lightPx = computed(() => ({ x: light.value.x * size.value.w, y: light.value.y * size.value.h }))

function cardElement() {
  return frameRef.value?.querySelector<HTMLElement>('.tx-card') ?? null
}

function readLight() {
  const surface = frameRef.value?.querySelector<HTMLElement>('.tx-base-surface')
  if (!surface)
    return
  const x = Number.parseFloat(surface.style.getPropertyValue('--tx-surface-refraction-light-x'))
  const y = Number.parseFloat(surface.style.getPropertyValue('--tx-surface-refraction-light-y'))
  if (Number.isFinite(x) && Number.isFinite(y))
    light.value = { x: x / 100, y: y / 100 }
}

function onPointerMove(event: PointerEvent) {
  const rect = cardElement()?.getBoundingClientRect()
  if (!rect?.width || !rect.height)
    return
  target.value = {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  }
}

function onPointerLeave() {
  target.value = { ...CENTRE }
}

/** Points the card at `point` with the event its own listener reads. */
function aimCard(point: Point) {
  const card = cardElement()
  const rect = card?.getBoundingClientRect()
  if (!card || !rect)
    return
  target.value = point
  card.dispatchEvent(new MouseEvent('mousemove', {
    clientX: rect.left + point.x * rect.width,
    clientY: rect.top + point.y * rect.height,
  }))
}

const KEY_MOVES: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
}

function onKey(event: KeyboardEvent) {
  const move = KEY_MOVES[event.key]
  if (!move)
    return
  event.preventDefault()
  const distance = event.shiftKey ? KEY_STEP * 4 : KEY_STEP
  aimCard({
    x: clamp(target.value.x + move.x * distance, 0, 1),
    y: clamp(target.value.y + move.y * distance, 0, 1),
  })
}

function measure() {
  const element = frameRef.value
  if (element)
    size.value = { w: element.clientWidth, h: element.clientHeight }
}

function resetDemo() {
  stiffness.value = DEFAULT_STIFFNESS
  damping.value = DEFAULT_DAMPING
  spring.value = true
  showMarkers.value = true
  target.value = { ...CENTRE }
  // The card sends its own target back to the centre on mouseleave.
  cardElement()?.dispatchEvent(new MouseEvent('mouseleave'))
}

onMounted(() => {
  measure()
  readLight()
  const surface = frameRef.value?.querySelector<HTMLElement>('.tx-base-surface')
  if (surface) {
    observer = new MutationObserver(readLight)
    observer.observe(surface, { attributes: true, attributeFilter: ['style'] })
  }
  if (typeof ResizeObserver !== 'undefined' && frameRef.value) {
    resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(frameRef.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  resizeObserver?.disconnect()
  resizeObserver = null
})

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure :caption="copy.caption" stage="plain">
    <div class="sl">
      <div class="sl-backdrop" aria-hidden="true">
        <span class="sl-blob is-1" />
        <span class="sl-blob is-2" />
        <span class="sl-blob is-3" />
        <span class="sl-word">Tuff</span>
      </div>
      <div
        ref="frameRef"
        class="sl-frame"
        tabindex="0"
        role="group"
        :aria-label="copy.frameLabel"
        @pointermove="onPointerMove"
        @pointerleave="onPointerLeave"
        @keydown="onKey"
      >
        <TxCard
          class="sl-card"
          background="refraction"
          :radius="16"
          refraction-light-follow-mouse
          :refraction-light-spring="spring"
          :refraction-light-spring-stiffness="stiffness"
          :refraction-light-spring-damping="damping"
        >
          <span class="sl-card__body">
            <span class="sl-card__title cfig-mono">{{ copy.cardTitle }}</span>
            <span class="sl-card__hint">{{ copy.cardHint }}</span>
          </span>
        </TxCard>
        <svg v-show="showMarkers" class="sl-marks" :viewBox="viewBox" role="img" :aria-label="marksLabel">
          <line class="sl-mark__lag" :x1="lightPx.x" :y1="lightPx.y" :x2="targetPx.x" :y2="targetPx.y" />
          <circle class="sl-mark__target" :cx="targetPx.x" :cy="targetPx.y" r="8" />
          <circle class="sl-mark__light" :cx="lightPx.x" :cy="lightPx.y" r="4" />
        </svg>
      </div>
    </div>

    <template #controls>
      <label class="cfig-control">
        <span class="cfig-control__label">{{ copy.stiffness }}</span>
        <TxSlider v-model="stiffness" :min="0.01" :max="0.55" :step="0.01" show-value :disabled="!spring" :aria-label="copy.stiffness" />
      </label>
      <label class="cfig-control">
        <span class="cfig-control__label">{{ copy.damping }}</span>
        <TxSlider v-model="damping" :min="0.55" :max="0.99" :step="0.01" show-value :disabled="!spring" :aria-label="copy.damping" />
      </label>
      <TxSwitch v-model="spring" :label="copy.spring" />
      <TxSwitch v-model="showMarkers" :label="copy.markers" />
      <div class="cfig-legend">
        <span class="cfig-legend__item"><span class="sl-swatch is-target" />{{ copy.legendTarget }}</span>
        <span class="cfig-legend__item"><span class="sl-swatch is-light" />{{ copy.legendLight }}</span>
      </div>
    </template>

    <template #readout>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.target }}</span>
        <span class="cfig-stat__value">{{ targetText }}</span>
      </span>
      <span class="cfig-stat is-accent">
        <span class="cfig-stat__label">{{ copy.light }}</span>
        <span class="cfig-stat__value">{{ lightText }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.lag }}</span>
        <span class="cfig-stat__value">{{ lagPx.toFixed(1) }} px</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.strength }}</span>
        <span class="cfig-stat__value">{{ strength.toFixed(1) }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.overshoot }}</span>
        <span class="cfig-stat__value">{{ overshootText }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.settle }}</span>
        <span class="cfig-stat__value">{{ settleText }}</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.sl {
  position: relative;
  display: flex;
  justify-content: center;
  padding: 24px 16px;
  overflow: hidden;
}

.sl-backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background:
    repeating-linear-gradient(90deg, rgb(255 255 255 / 0.28) 0 2px, transparent 2px 16px),
    linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
}

.sl-blob {
  position: absolute;
  border-radius: 50%;
  opacity: 0.6;
}

.sl-blob.is-1 {
  top: -40px;
  left: 8%;
  width: 160px;
  height: 160px;
  background: #ffd700;
}

.sl-blob.is-2 {
  right: 14%;
  bottom: -50px;
  width: 150px;
  height: 150px;
  background: #00d2ff;
}

.sl-blob.is-3 {
  top: 40px;
  right: -20px;
  width: 110px;
  height: 110px;
  background: #ff6b6b;
}

.sl-word {
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

.sl-frame {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
  height: 220px;
  border-radius: 16px;
  cursor: crosshair;
  outline: none;
}

.sl-frame:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 2px;
}

.sl-card {
  height: 100%;
}

.sl-card__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 6px;
  pointer-events: none;
}

.sl-card__title {
  color: var(--tx-text-color-primary, #303133);
  font-size: 14px;
  font-weight: 600;
}

.sl-card__hint {
  color: var(--tx-text-color-secondary, #606266);
  font-size: 12px;
}

.sl-marks {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.sl-mark__lag {
  stroke: var(--tx-text-color-secondary, #606266);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.sl-mark__target {
  fill: none;
  stroke: var(--tx-text-color-primary, #303133);
  stroke-width: 1.5;
}

.sl-mark__light {
  fill: var(--tx-color-primary, #409eff);
  stroke: var(--tx-bg-color, #fff);
  stroke-width: 1;
}

.sl-swatch {
  position: relative;
  flex: none;
  width: 16px;
  height: 16px;
}

.sl-swatch::after {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  border-radius: 50%;
}

.sl-swatch.is-target::after {
  box-sizing: border-box;
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--tx-text-color-primary, #303133);
}

.sl-swatch.is-light::after {
  width: 8px;
  height: 8px;
  background: var(--tx-color-primary, #409eff);
  box-shadow: 0 0 0 1px var(--tx-bg-color, #fff);
}
</style>
