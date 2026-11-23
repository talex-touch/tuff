<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type {
  FoldCornerEmits,
  FoldCornerProps,
  FoldCornerSlotProps,
} from './types'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { stepSpring } from '../../../../utils/animation/spring'
import { createFrameLoop } from '../../../../utils/frame-loop'
import { createVelocityTracker, projectMomentum } from '../../../../utils/gesture'
import { useReducedMotion } from '../../../../utils/use-reduced-motion'
import TxBaseSurface from '../../base-surface/src/TxBaseSurface.vue'
import {
  clamp,
  clamp01,
  clampCornerTip,
  computeCornerPeelGeometry,
  projectPointerToPeelProgress,
  resolveCornerTipFromProgress,
} from './geometry'

defineOptions({
  name: 'TxFoldCorner',
})

const props = withDefaults(defineProps<FoldCornerProps>(), {
  modelValue: false,
  corner: 'bottom-right',
  trigger: 'hover-drag',
  restPeel: 0.12,
  hoverPeel: 0.28,
  openPeel: 0.84,
  surface: 'refraction',
  surfaceColor: '',
  surfaceOpacity: 0.96,
  size: 'md',
  radius: 16,
  creaseOpacity: 0.26,
  stiffness: 240,
  damping: 26,
  disabled: false,
  ariaLabel: 'Fold corner',
})

const emit = defineEmits<FoldCornerEmits>()

defineSlots<{
  default?: (props: FoldCornerSlotProps) => unknown
  under?: (props: FoldCornerSlotProps) => unknown
  reveal?: (props: FoldCornerSlotProps) => unknown
  flap?: (props: FoldCornerSlotProps) => unknown
}>()

const DRAG_THRESHOLD_PX = 4
const SETTLE_EPSILON = 0.25
const VELOCITY_EPSILON = 1

const rootRef = ref<HTMLElement | null>(null)
const reducedMotion = useReducedMotion()
const width = ref(320)
const height = ref(200)

const isControlledProgress = computed(() => props.progress !== undefined)
const localOpen = ref(Boolean(props.modelValue))
const isHovered = ref(false)
const isDragging = ref(false)
const isAnimating = ref(false)

const initialProgress = clamp01(
  props.progress ?? (props.modelValue ? props.openPeel : props.restPeel),
)
const initialTip = resolveCornerTipFromProgress(props.corner, width.value, height.value, initialProgress)
const tipX = ref(initialTip.x)
const tipY = ref(initialTip.y)
const targetTipX = ref(initialTip.x)
const targetTipY = ref(initialTip.y)
const velX = ref(0)
const velY = ref(0)

let activePointerId: number | null = null
let dragStartX = 0
let dragStartY = 0
let dragMoved = false
let suppressClick = false
let resizeObserver: ResizeObserver | null = null
let pendingEndValue: boolean | null = null

const velocityTracker = createVelocityTracker(100, 4000)

const allowsHover = computed(() => props.trigger === 'hover' || props.trigger === 'hover-drag')
const allowsDrag = computed(() => props.trigger === 'drag' || props.trigger === 'hover-drag')
const allowsSurfaceClick = computed(() => props.trigger === 'click' || props.trigger === 'hover-drag')

const isOpen = computed(() => {
  if (isControlledProgress.value)
    return currentProgress.value >= (props.restPeel + props.openPeel) * 0.5
  return localOpen.value
})

const currentProgress = computed(() =>
  projectPointerToPeelProgress(props.corner, width.value, height.value, tipX.value, tipY.value),
)

const geometry = computed(() =>
  computeCornerPeelGeometry({
    width: width.value,
    height: height.value,
    corner: props.corner,
    tipX: tipX.value,
    tipY: tipY.value,
    progress: currentProgress.value,
    creaseOpacity: props.creaseOpacity,
  }),
)

const isUnderInert = computed(() => currentProgress.value < 0.08)
const isMoving = computed(() => isDragging.value || isAnimating.value)

const handleLabel = computed(() => {
  if (isOpen.value)
    return props.labels?.flatten ?? 'Flatten corner'
  return props.labels?.peel ?? 'Peel corner'
})

const rootClasses = computed(() => [
  'tx-fold-corner',
  `tx-fold-corner--${props.size}`,
  `tx-fold-corner--${props.corner}`,
  {
    'is-peeled': isOpen.value,
    'is-hovered': isHovered.value,
    'is-dragging': isDragging.value,
    'is-draggable': allowsDrag.value && !props.disabled,
    'is-clickable': allowsSurfaceClick.value && !props.disabled,
    'is-disabled': props.disabled,
    'is-plain-surface': props.surface === 'plain',
  },
])

const rootStyle = computed<CSSProperties>(() => ({
  '--tx-fold-corner-radius': `${Math.max(0, props.radius)}px`,
}))

const frontStyle = computed<CSSProperties>(() => ({
  clipPath: geometry.value.frontClipPath,
}))

const flapShadowStyle = computed<CSSProperties>(() => {
  const g = geometry.value
  return {
    filter: g.active
      ? `drop-shadow(${g.shadowOffsetX}px ${g.shadowOffsetY}px ${g.shadowBlur}px rgb(0 0 0 / ${g.shadowAlpha}))`
      : 'none',
  }
})

const flapStyle = computed<CSSProperties>(() => ({
  clipPath: geometry.value.flapClipPath,
  transform: geometry.value.flapMatrix,
}))

const flapSheenStyle = computed<CSSProperties>(() => ({
  background: `linear-gradient(${geometry.value.sheenAngleDeg}deg, rgb(255 255 255 / 0.28) 0%, transparent 48%, rgb(0 0 0 / ${clamp(props.creaseOpacity * 0.72, 0.04, 0.34)}) 100%)`,
}))

const slotProps = computed<FoldCornerSlotProps>(() => ({
  progress: currentProgress.value,
  peeled: isOpen.value,
  corner: props.corner,
  angleDeg: geometry.value.creaseAngleDeg,
  toggle,
}))

function desiredIdleProgress(): number {
  if (props.progress !== undefined)
    return clamp01(props.progress)
  if (localOpen.value)
    return clamp01(props.openPeel)
  if (isHovered.value && allowsHover.value && !props.disabled)
    return clamp01(props.hoverPeel)
  return clamp01(props.restPeel)
}

function finishMotion(): void {
  tipX.value = targetTipX.value
  tipY.value = targetTipY.value
  velX.value = 0
  velY.value = 0
  isAnimating.value = false
  if (pendingEndValue !== null) {
    const val = pendingEndValue
    pendingEndValue = null
    emit('peel-end', val)
  }
}

const frameLoop = createFrameLoop((dt) => {
  const springConfig = {
    stiffness: Math.max(20, props.stiffness),
    damping: Math.max(2, props.damping),
    mass: 1,
  }
  const prevProgress = currentProgress.value
  const [nx, nvx] = stepSpring(tipX.value, velX.value, targetTipX.value, springConfig, dt)
  const [ny, nvy] = stepSpring(tipY.value, velY.value, targetTipY.value, springConfig, dt)

  tipX.value = nx
  tipY.value = ny
  velX.value = nvx
  velY.value = nvy

  const nextProgress = currentProgress.value
  if (!isControlledProgress.value && Math.abs(nextProgress - prevProgress) > 1e-4)
    emit('update:progress', nextProgress)

  if (
    Math.hypot(targetTipX.value - nx, targetTipY.value - ny) < SETTLE_EPSILON
    && Math.hypot(nvx, nvy) < VELOCITY_EPSILON
  ) {
    if (!isControlledProgress.value)
      emit('update:progress', projectPointerToPeelProgress(props.corner, width.value, height.value, targetTipX.value, targetTipY.value))
    finishMotion()
    return false
  }
  return true
})

function animateToProgress(progressValue: number, endValue: boolean | null = null): void {
  const pt = resolveCornerTipFromProgress(props.corner, width.value, height.value, progressValue)
  targetTipX.value = pt.x
  targetTipY.value = pt.y
  pendingEndValue = endValue

  if (reducedMotion.value) {
    frameLoop.stop()
    const prev = currentProgress.value
    finishMotion()
    if (!isControlledProgress.value && Math.abs(currentProgress.value - prev) > 1e-4)
      emit('update:progress', currentProgress.value)
    return
  }

  if (
    Math.hypot(tipX.value - pt.x, tipY.value - pt.y) < SETTLE_EPSILON
    && Math.hypot(velX.value, velY.value) < VELOCITY_EPSILON
  ) {
    finishMotion()
    return
  }

  isAnimating.value = true
  frameLoop.start()
}

function commitOpenState(nextOpen: boolean): void {
  const changed = nextOpen !== localOpen.value
  localOpen.value = nextOpen
  emit('peel-start', nextOpen)
  emit('update:modelValue', nextOpen)
  if (changed)
    emit('change', nextOpen)
  const target = nextOpen ? clamp01(props.openPeel) : clamp01(isHovered.value && allowsHover.value && !props.disabled ? props.hoverPeel : props.restPeel)
  if (isControlledProgress.value)
    emit('update:progress', nextOpen ? clamp01(props.openPeel) : clamp01(props.restPeel))
  animateToProgress(target, nextOpen)
}

function peel(): void {
  if (props.disabled)
    return
  commitOpenState(true)
}

function flatten(): void {
  if (props.disabled)
    return
  commitOpenState(false)
}

function toggle(): void {
  if (props.disabled)
    return
  commitOpenState(!isOpen.value)
}

function setProgress(value: number): void {
  if (props.disabled)
    return
  const clamped = clamp01(value)
  frameLoop.stop()
  isAnimating.value = false
  pendingEndValue = null
  velX.value = 0
  velY.value = 0
  const pt = resolveCornerTipFromProgress(props.corner, width.value, height.value, clamped)
  tipX.value = pt.x
  tipY.value = pt.y
  targetTipX.value = pt.x
  targetTipY.value = pt.y
  emit('update:progress', clamped)
  const threshold = (props.restPeel + props.openPeel) * 0.5
  const nextOpen = clamped >= threshold
  if (nextOpen !== localOpen.value) {
    localOpen.value = nextOpen
    emit('update:modelValue', nextOpen)
    emit('change', nextOpen)
  }
}

function isInteractiveDescendant(target: EventTarget | null): boolean {
  if (!(target instanceof Element))
    return false
  if (target.closest('.tx-fold-corner__handle'))
    return false
  return Boolean(target.closest('a, button, input, textarea, select, [role="button"], [contenteditable]'))
}

function pointerLocalCoords(clientX: number, clientY: number): { x: number, y: number } {
  const rect = rootRef.value?.getBoundingClientRect()
  if (!rect)
    return { x: tipX.value, y: tipY.value }
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  }
}

function onPointerEnter(event: PointerEvent): void {
  if (props.disabled || event.pointerType === 'touch' || !allowsHover.value || isDragging.value)
    return
  isHovered.value = true
  if (!localOpen.value && !isControlledProgress.value)
    animateToProgress(desiredIdleProgress(), null)
}

function onPointerLeave(): void {
  if (!isHovered.value)
    return
  isHovered.value = false
  if (!isDragging.value && !localOpen.value && !isControlledProgress.value)
    animateToProgress(desiredIdleProgress(), null)
}

function onPointerDown(event: PointerEvent): void {
  if (props.disabled || !allowsDrag.value)
    return
  if (event.button !== 0 || isInteractiveDescendant(event.target))
    return
  activePointerId = event.pointerId
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragMoved = false
  const local = pointerLocalCoords(event.clientX, event.clientY)
  velocityTracker.reset(event.timeStamp || performance.now(), local.x, local.y)

  window.addEventListener('pointermove', onWindowPointerMove)
  window.addEventListener('pointerup', onWindowPointerUp)
  window.addEventListener('pointercancel', onWindowPointerUp)
}

function onWindowPointerMove(event: PointerEvent): void {
  if (activePointerId === null || event.pointerId !== activePointerId)
    return
  const dx = event.clientX - dragStartX
  const dy = event.clientY - dragStartY
  if (!dragMoved) {
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX)
      return
    dragMoved = true
    isDragging.value = true
    frameLoop.stop()
    isAnimating.value = false
    emit('peel-start', !isOpen.value)
    try {
      rootRef.value?.setPointerCapture?.(event.pointerId)
    }
    catch {
      // Ignore synthetic pointer ids.
    }
  }

  const local = pointerLocalCoords(event.clientX, event.clientY)
  const clamped = clampCornerTip(props.corner, width.value, height.value, local.x, local.y)
  velocityTracker.push(event.timeStamp || performance.now(), clamped.x, clamped.y)
  tipX.value = clamped.x
  tipY.value = clamped.y
  targetTipX.value = clamped.x
  targetTipY.value = clamped.y
  emit('update:progress', currentProgress.value)
}

function cleanupWindowListeners(): void {
  window.removeEventListener('pointermove', onWindowPointerMove)
  window.removeEventListener('pointerup', onWindowPointerUp)
  window.removeEventListener('pointercancel', onWindowPointerUp)
  if (activePointerId !== null) {
    try {
      rootRef.value?.releasePointerCapture?.(activePointerId)
    }
    catch {
      // Ignore if not captured.
    }
  }
  activePointerId = null
}

function onWindowPointerUp(event: PointerEvent): void {
  if (activePointerId === null || event.pointerId !== activePointerId)
    return
  cleanupWindowListeners()

  if (!dragMoved)
    return

  isDragging.value = false
  suppressClick = true
  requestAnimationFrame(() => {
    suppressClick = false
  })

  if (event.type === 'pointercancel') {
    animateToProgress(desiredIdleProgress(), localOpen.value)
    return
  }

  const [vx, vy] = velocityTracker.velocity(event.timeStamp || performance.now())
  const projectedX = tipX.value + projectMomentum(vx, 0.99)
  const projectedY = tipY.value + projectMomentum(vy, 0.99)
  const projectedProgress = projectPointerToPeelProgress(
    props.corner,
    width.value,
    height.value,
    projectedX,
    projectedY,
  )
  const threshold = (props.restPeel + props.openPeel) * 0.48
  const nextOpen = projectedProgress >= threshold
  velX.value = vx
  velY.value = vy

  const changed = nextOpen !== localOpen.value
  localOpen.value = nextOpen
  emit('update:modelValue', nextOpen)
  if (changed)
    emit('change', nextOpen)
  const target = nextOpen ? clamp01(props.openPeel) : clamp01(isHovered.value && allowsHover.value && !props.disabled ? props.hoverPeel : props.restPeel)
  if (isControlledProgress.value)
    emit('update:progress', nextOpen ? clamp01(props.openPeel) : clamp01(props.restPeel))
  animateToProgress(target, nextOpen)
}

function onSurfaceClick(event: MouseEvent): void {
  if (suppressClick || props.disabled || !allowsSurfaceClick.value)
    return
  if (isInteractiveDescendant(event.target))
    return
  toggle()
}

function syncDimensions(): void {
  const el = rootRef.value
  if (!el)
    return
  const rect = el.getBoundingClientRect()
  const nextW = rect.width > 0 ? rect.width : width.value
  const nextH = rect.height > 0 ? rect.height : height.value
  if (nextW === width.value && nextH === height.value)
    return

  const activeProg = currentProgress.value
  width.value = nextW
  height.value = nextH
  const pt = resolveCornerTipFromProgress(props.corner, nextW, nextH, isDragging.value ? activeProg : desiredIdleProgress())
  tipX.value = pt.x
  tipY.value = pt.y
  targetTipX.value = pt.x
  targetTipY.value = pt.y
}

watch(
  () => props.modelValue,
  (val) => {
    const next = Boolean(val)
    localOpen.value = next
    if (!isControlledProgress.value)
      animateToProgress(desiredIdleProgress(), next)
  },
)

watch(
  () => props.progress,
  (val) => {
    if (val === undefined || isDragging.value)
      return
    const next = clamp01(val)
    localOpen.value = next >= (props.restPeel + props.openPeel) * 0.5
    const pt = resolveCornerTipFromProgress(props.corner, width.value, height.value, next)
    if (Math.hypot(pt.x - targetTipX.value, pt.y - targetTipY.value) < 0.1)
      return
    animateToProgress(next, null)
  },
)

watch(
  () => [props.corner, props.restPeel, props.hoverPeel, props.openPeel],
  () => {
    if (!isDragging.value)
      animateToProgress(desiredIdleProgress(), null)
  },
)

onMounted(() => {
  syncDimensions()
  if (typeof ResizeObserver !== 'undefined' && rootRef.value) {
    resizeObserver = new ResizeObserver(() => {
      syncDimensions()
    })
    resizeObserver.observe(rootRef.value)
  }
})

onBeforeUnmount(() => {
  frameLoop.stop()
  cleanupWindowListeners()
  resizeObserver?.disconnect()
  resizeObserver = null
})

defineExpose({
  peel,
  flatten,
  toggle,
  setProgress,
})
</script>

<template>
  <div
    ref="rootRef"
    :class="rootClasses"
    :style="rootStyle"
    role="region"
    :aria-label="ariaLabel"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @pointerdown="onPointerDown"
    @click="onSurfaceClick"
  >
    <div
      class="tx-fold-corner__under"
      :inert="isUnderInert || undefined"
      :aria-hidden="isUnderInert ? 'true' : undefined"
    >
      <slot v-if="$slots.under" name="under" v-bind="slotProps" />
      <slot v-else-if="$slots.reveal" name="reveal" v-bind="slotProps" />
      <div v-else class="tx-fold-corner__default-under">
        <span class="tx-fold-corner__under-kicker">HIDDEN LAYER</span>
        <p class="tx-fold-corner__under-title">
          Revealed underneath
        </p>
      </div>
    </div>

    <div
      v-if="geometry.frontVisible"
      class="tx-fold-corner__front"
      :style="frontStyle"
    >
      <TxBaseSurface
        class="tx-fold-corner__surface"
        preset="card"
        fake
        :mode="surface"
        :color="surfaceColor || undefined"
        :opacity="surfaceOpacity"
        :moving="isMoving"
      />
      <div class="tx-fold-corner__front-body">
        <slot v-bind="slotProps" />
      </div>
    </div>

    <div
      v-if="geometry.active"
      class="tx-fold-corner__flap-shadow"
      :style="flapShadowStyle"
      aria-hidden="true"
    >
      <div class="tx-fold-corner__flap" :style="flapStyle">
        <TxBaseSurface
          class="tx-fold-corner__surface"
          preset="card"
          fake
          :mode="surface"
          :color="surfaceColor || undefined"
          :opacity="Math.min(1, surfaceOpacity)"
          :moving="isMoving"
        />
        <div class="tx-fold-corner__flap-sheen" :style="flapSheenStyle" />
        <div class="tx-fold-corner__flap-body">
          <slot name="flap" v-bind="slotProps" />
        </div>
      </div>
    </div>

    <button
      type="button"
      class="tx-fold-corner__handle"
      :aria-expanded="isOpen"
      :aria-label="handleLabel"
      :disabled="disabled"
      @click.stop="toggle"
    >
      <span class="tx-fold-corner__handle-dot" aria-hidden="true" />
    </button>
  </div>
</template>

<style lang="scss" scoped>
@use '../../../style/mixins.scss' as *;

.tx-fold-corner {
  --tx-fold-corner-min-height: 180px;
  --tx-fold-corner-pad: 16px;
  --tx-fold-corner-radius: 16px;

  position: relative;
  width: 100%;
  min-height: var(--tx-fold-corner-min-height);
  border-radius: var(--tx-fold-corner-radius);
  @include tx-squircle(var(--tx-fold-corner-radius));
  overflow: hidden;
  user-select: none;
  box-sizing: border-box;
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color, #dcdfe6) 72%, transparent),
    var(--tx-box-shadow-light, 0 6px 20px rgb(0 0 0 / 0.08));

  &--xs {
    --tx-fold-corner-min-height: 120px;
    --tx-fold-corner-pad: 12px;
  }

  &--sm {
    --tx-fold-corner-min-height: 150px;
    --tx-fold-corner-pad: 14px;
  }

  &--md {
    --tx-fold-corner-min-height: 180px;
    --tx-fold-corner-pad: 16px;
  }

  &--lg {
    --tx-fold-corner-min-height: 230px;
    --tx-fold-corner-pad: 20px;
  }

  &.is-draggable {
    cursor: grab;
    touch-action: none;
  }

  &.is-clickable:not(.is-draggable) {
    cursor: pointer;
  }

  &.is-dragging {
    cursor: grabbing;
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  @include tx-when-high-contrast {
    box-shadow: inset 0 0 0 1.5px var(--tx-border-color, #6b7280);
  }
}

.tx-fold-corner__under {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  min-height: var(--tx-fold-corner-min-height);
  padding: var(--tx-fold-corner-pad);
  background: var(--tx-fill-color-light, #f5f7fa);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.tx-fold-corner__default-under {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tx-fold-corner__under-kicker {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--tx-color-primary, #409eff);
}

.tx-fold-corner__under-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
}

.tx-fold-corner__front {
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: inherit;
  background-color: var(--tx-bg-color, #ffffff);
  will-change: clip-path;

  .tx-fold-corner.is-plain-surface & {
    background-color: transparent;
  }
}

.tx-fold-corner__surface {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: 0;
}

.tx-fold-corner__front-body,
.tx-fold-corner__flap-body {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  padding: var(--tx-fold-corner-pad);
  box-sizing: border-box;
}

.tx-fold-corner__flap-shadow {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.tx-fold-corner__flap {
  position: absolute;
  inset: 0;
  transform-origin: 0 0;
  border-radius: inherit;
  background-color: var(--tx-fill-color-lighter, #fafafa);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color, #dcdfe6) 65%, transparent);
  will-change: transform, clip-path;
  overflow: hidden;

  .tx-fold-corner.is-plain-surface & {
    background-color: color-mix(in srgb, var(--tx-bg-color, #ffffff) 92%, transparent);
  }
}

.tx-fold-corner__flap-sheen {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.tx-fold-corner__handle {
  position: absolute;
  z-index: 4;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: transparent;
  color: var(--tx-text-color-secondary, #909399);

  .tx-fold-corner.is-draggable & {
    cursor: grab;
  }

  .tx-fold-corner.is-dragging & {
    cursor: grabbing;
  }

  &:focus-visible {
    outline: none;
    box-shadow:
      inset 0 0 0 1.5px var(--tx-color-primary, #409eff),
      var(--tx-focus-ring-shadow, 0 0 0 3px rgb(64 158 255 / 0.2));
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.tx-fold-corner__handle-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.55;
  pointer-events: none;
  transition: opacity 160ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-fold-corner.is-peeled .tx-fold-corner__handle-dot {
  opacity: 0;
}

.tx-fold-corner.is-peeled .tx-fold-corner__handle:focus-visible .tx-fold-corner__handle-dot {
  opacity: 0.55;
}

.tx-fold-corner--top-left .tx-fold-corner__handle {
  top: 6px;
  left: 6px;
}

.tx-fold-corner--top-right .tx-fold-corner__handle {
  top: 6px;
  right: 6px;
}

.tx-fold-corner--bottom-left .tx-fold-corner__handle {
  bottom: 6px;
  left: 6px;
}

.tx-fold-corner--bottom-right .tx-fold-corner__handle {
  bottom: 6px;
  right: 6px;
}
</style>
