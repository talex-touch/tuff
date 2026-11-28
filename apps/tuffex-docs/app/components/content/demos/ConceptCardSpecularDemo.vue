<script setup lang="ts">
import { useReducedMotion } from '@talex-touch/tuffex/utils'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * A real TxCard with `specular` on, on a stage pinned to the dark theme: the light is drawn in
 * dark themes only, so the stage carries `.dark`, which re-themes the TuffEx tokens under it.
 * The dot is the light read back from the --tx-card-light-x/y the card writes on its
 * `.tx-card__specular` layer, so what moves is the component's light, not a copy of it.
 *
 * The 95% time comes from TxCard's smoothing (card/src/TxCard.vue): each 60 Hz frame closes
 * α = 0.18 of the remaining gap, so n frames close 1 − (1 − α)^n of it.
 */

interface Point { x: number, y: number }

const { locale } = useI18n()
const reducedMotion = useReducedMotion()

const FRAME_MS = 1000 / 60
/** TxCard's SPECULAR_SMOOTHING. */
const SMOOTHING = 0.18
const SETTLE_FRAMES = Math.ceil(Math.log(0.05) / Math.log(1 - SMOOTHING))
/** Arrow keys move the target by this share of the card; Shift moves it four times as far. */
const KEY_STEP = 0.05
const CENTRE: Point = { x: 0.5, y: 0.5 }

const solid = ref(true)
const showMarkers = ref(true)
const size = shallowRef({ w: 0, h: 0 })
/** Where the pointer, or the arrow keys, put the light; null while nothing aims it. */
const target = shallowRef<Point | null>(null)
const light = shallowRef<Point>({ ...CENTRE })
const lit = ref(false)
const frameRef = ref<HTMLElement | null>(null)

let hovering = false
let observer: MutationObserver | null = null
let resizeObserver: ResizeObserver | null = null

const copy = computed(() => locale.value === 'zh'
  ? {
      cardTitle: 'TxCard · specular',
      cardHint: '移动指针，或聚焦后用方向键移动光斑',
      frameLabel: '卡片反光标本：移动指针，或用方向键移动光斑',
      solid: '实线边框（边缘反光）',
      markers: '显示标记',
      legendTarget: '目标点（指针位置）',
      legendLight: '反光点（从组件读回）',
      target: '目标点',
      light: '反光点',
      lag: '相差',
      settle: '95% 用时',
      frames: '帧',
      off: '未点亮',
      marks: (aim: string, point: string, gap: string) => `目标 ${aim}，反光 ${point}，相差 ${gap} 像素`,
      reduced: '系统开启了减少动态效果：反光点直接跳到指针处，不做平滑。',
      caption: '真实的 TxCard（打开 specular），舞台固定为暗色：反光只在暗色主题绘制。圆点是从组件写在反光层上的 --tx-card-light-x/y 读回的反光点；关掉实线边框，卡片换成 dashed，边缘那一圈反光随之消失。95% 用时按每个 60 Hz 帧走完剩余距离的 18% 推算。',
    }
  : {
      cardTitle: 'TxCard · specular',
      cardHint: 'Move the pointer, or focus and move the light with the arrow keys',
      frameLabel: 'Card specular specimen: move the pointer, or move the light with the arrow keys',
      solid: 'Solid border (edge glint)',
      markers: 'Show markers',
      legendTarget: 'Target (the pointer)',
      legendLight: 'Light (read from the component)',
      target: 'Target',
      light: 'Light',
      lag: 'Gap',
      settle: '95% time',
      frames: 'frames',
      off: 'Not lit',
      marks: (aim: string, point: string, gap: string) => `Target ${aim}, light ${point}, ${gap} px apart`,
      reduced: 'Reduce motion is on: the light jumps straight to the pointer, with no smoothing.',
      caption: 'A real TxCard with specular on, on a stage pinned to the dark theme, the only one the light is drawn in. The dot is the light read back from the --tx-card-light-x/y the card writes on its specular layer; turning the solid border off makes the card dashed, and the glint along the edge goes with it. The 95% time is worked out from each 60 Hz frame closing 18% of the remaining gap.',
    })

const caption = computed(() => (reducedMotion.value ? `${copy.value.caption} ${copy.value.reduced}` : copy.value.caption))

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function percent(point: Point) {
  return `(${(point.x * 100).toFixed(1)}%, ${(point.y * 100).toFixed(1)}%)`
}

const targetText = computed(() => target.value ? percent(target.value) : '—')
const lightText = computed(() => lit.value ? percent(light.value) : copy.value.off)
const lagPx = computed(() => {
  if (!target.value || !lit.value)
    return 0
  return Math.hypot((target.value.x - light.value.x) * size.value.w, (target.value.y - light.value.y) * size.value.h)
})
const settleText = computed(() => `${SETTLE_FRAMES} ${copy.value.frames} · ${Math.round(SETTLE_FRAMES * FRAME_MS)} ms`)
const marksLabel = computed(() => copy.value.marks(targetText.value, lightText.value, lagPx.value.toFixed(1)))
const viewBox = computed(() => `0 0 ${Math.max(1, size.value.w)} ${Math.max(1, size.value.h)}`)
const targetPx = computed(() => target.value && { x: target.value.x * size.value.w, y: target.value.y * size.value.h })
const lightPx = computed(() => ({ x: light.value.x * size.value.w, y: light.value.y * size.value.h }))

function cardElement() {
  return frameRef.value?.querySelector<HTMLElement>('.tx-card') ?? null
}

function readLight() {
  const layer = frameRef.value?.querySelector<HTMLElement>('.tx-card__specular')
  if (!layer)
    return
  const x = Number.parseFloat(layer.style.getPropertyValue('--tx-card-light-x'))
  const y = Number.parseFloat(layer.style.getPropertyValue('--tx-card-light-y'))
  if (Number.isFinite(x) && Number.isFinite(y))
    light.value = { x: x / 100, y: y / 100 }
  lit.value = layer.classList.contains('is-lit')
}

function onPointerMove(event: PointerEvent) {
  const rect = cardElement()?.getBoundingClientRect()
  if (!rect?.width || !rect.height)
    return
  hovering = true
  target.value = {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  }
}

function onPointerLeave() {
  hovering = false
  target.value = null
}

/** Aims the card at `point` with the event its own listener reads. */
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
  const from = target.value ?? CENTRE
  const distance = event.shiftKey ? KEY_STEP * 4 : KEY_STEP
  aimCard({
    x: clamp(from.x + move.x * distance, 0, 1),
    y: clamp(from.y + move.y * distance, 0, 1),
  })
}

/** Keys lit the light, so leaving by keyboard puts it out the way the pointer leaving does. */
function onBlur() {
  if (hovering)
    return
  target.value = null
  cardElement()?.dispatchEvent(new MouseEvent('mouseleave'))
}

function measure() {
  const element = frameRef.value
  if (element)
    size.value = { w: element.clientWidth, h: element.clientHeight }
}

function resetDemo() {
  solid.value = true
  showMarkers.value = true
  target.value = null
  cardElement()?.dispatchEvent(new MouseEvent('mouseleave'))
}

onMounted(() => {
  measure()
  readLight()
  const layer = frameRef.value?.querySelector<HTMLElement>('.tx-card__specular')
  if (layer) {
    observer = new MutationObserver(readLight)
    observer.observe(layer, { attributes: true, attributeFilter: ['style', 'class'] })
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
  <ConceptFigure :caption="caption" stage="plain">
    <div class="cs dark">
      <div
        ref="frameRef"
        class="cs-frame"
        tabindex="0"
        role="group"
        :aria-label="copy.frameLabel"
        @pointermove="onPointerMove"
        @pointerleave="onPointerLeave"
        @keydown="onKey"
        @blur="onBlur"
      >
        <TxCard class="cs-card" specular :variant="solid ? 'solid' : 'dashed'" :radius="16">
          <span class="cs-card__body">
            <span class="cs-card__title cfig-mono">{{ copy.cardTitle }}</span>
            <span class="cs-card__hint">{{ copy.cardHint }}</span>
          </span>
        </TxCard>
        <svg v-show="showMarkers" class="cs-marks" :viewBox="viewBox" role="img" :aria-label="marksLabel">
          <line v-if="targetPx && lit" class="cs-mark__lag" :x1="lightPx.x" :y1="lightPx.y" :x2="targetPx.x" :y2="targetPx.y" />
          <circle v-if="targetPx" class="cs-mark__target" :cx="targetPx.x" :cy="targetPx.y" r="8" />
          <circle v-if="lit" class="cs-mark__light" :cx="lightPx.x" :cy="lightPx.y" r="4" />
        </svg>
      </div>
    </div>

    <template #controls>
      <TxSwitch v-model="solid" :label="copy.solid" />
      <TxSwitch v-model="showMarkers" :label="copy.markers" />
      <div class="cfig-legend">
        <span class="cfig-legend__item"><span class="cs-swatch is-target" />{{ copy.legendTarget }}</span>
        <span class="cfig-legend__item"><span class="cs-swatch is-light" />{{ copy.legendLight }}</span>
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
        <span class="cfig-stat__label">{{ copy.settle }}</span>
        <span class="cfig-stat__value">{{ settleText }}</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
/* `.dark` re-themes the TuffEx tokens under it, so the card is the dark card the light belongs to. */
.cs {
  display: flex;
  justify-content: center;
  padding: 28px 16px;
  background:
    radial-gradient(120% 90% at 50% 0%, #1d1e1f 0%, #141414 70%);
}

.cs-frame {
  position: relative;
  width: 100%;
  max-width: 440px;
  height: 220px;
  border-radius: 16px;
  cursor: crosshair;
  outline: none;
}

.cs-frame:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 2px;
}

.cs-card {
  height: 100%;
}

.cs-card__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 6px;
  pointer-events: none;
}

.cs-card__title {
  color: var(--tx-text-color-primary, #e5eaf3);
  font-size: 14px;
  font-weight: 600;
}

.cs-card__hint {
  color: var(--tx-text-color-secondary, #a3a6ad);
  font-size: 12px;
}

.cs-marks {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.cs-mark__lag {
  stroke: rgb(255 255 255 / 0.45);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.cs-mark__target {
  fill: none;
  stroke: rgb(255 255 255 / 0.85);
  stroke-width: 1.5;
}

.cs-mark__light {
  fill: var(--tx-color-primary, #409eff);
  stroke: #141414;
  stroke-width: 1;
}

.cs-swatch {
  position: relative;
  flex: none;
  width: 16px;
  height: 16px;
}

.cs-swatch::after {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  border-radius: 50%;
}

.cs-swatch.is-target::after {
  box-sizing: border-box;
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--cfig-ink);
}

.cs-swatch.is-light::after {
  width: 8px;
  height: 8px;
  background: var(--tx-color-primary, #409eff);
  box-shadow: 0 0 0 1px var(--tx-bg-color, #fff);
}
</style>
