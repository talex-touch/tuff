<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { FoldPagePanelLayout } from './geometry'
import type {
  FoldPageEmits,
  FoldPagePanel,
  FoldPagePanelSlotProps,
  FoldPageProps,
} from './types'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { stepSpring } from '../../../../utils/animation/spring'
import { createFrameLoop } from '../../../../utils/frame-loop'
import { createVelocityTracker, projectMomentum, rubberband } from '../../../../utils/gesture'
import { useReducedMotion } from '../../../../utils/use-reduced-motion'
import TxBaseSurface from '../../base-surface/src/TxBaseSurface.vue'
import { clamp, clamp01, computeFoldPageLayout } from './geometry'

defineOptions({
  name: 'TxFoldPage',
})

const props = withDefaults(defineProps<FoldPageProps>(), {
  modelValue: false,
  count: 3,
  direction: 'horizontal',
  foldStyle: 'accordion',
  perspective: 1400,
  creaseOpacity: 0.28,
  surface: 'refraction',
  surfaceColor: '',
  size: 'md',
  radius: 16,
  draggable: true,
  clickToToggle: true,
  stiffness: 220,
  damping: 24,
  disabled: false,
  ariaLabel: 'Fold page',
})

const emit = defineEmits<FoldPageEmits>()

defineSlots<{
  panel?: (props: FoldPagePanelSlotProps) => unknown
  cover?: (props: { open: boolean, progress: number, toggle: () => void }) => unknown
  [key: `panel-${string}`]: ((props: FoldPagePanelSlotProps) => unknown) | undefined
}>()

const DRAG_THRESHOLD_PX = 4
const SETTLE_EPSILON = 1e-4
const VELOCITY_EPSILON = 1e-3

const rootRef = ref<HTMLElement | null>(null)
const reducedMotion = useReducedMotion()
const stageWidth = ref(540)
const stageHeight = ref(240)

const isControlledProgress = computed(() => props.progress !== undefined)
const localOpen = ref(Boolean(props.modelValue))
const currentProgress = ref(clamp01(props.progress ?? (props.modelValue ? 1 : 0)))
const visualProgress = ref(currentProgress.value)
const targetProgress = ref(currentProgress.value)
const velocity = ref(0)
const isAnimating = ref(false)
const isDragging = ref(false)

let activePointerId: number | null = null
let dragStartX = 0
let dragStartY = 0
let dragStartProgress = 0
let dragSign = 1
let dragMoved = false
let suppressClick = false
let resizeObserver: ResizeObserver | null = null
let pendingEndValue: boolean | null = null

const velocityTracker = createVelocityTracker(100, 3200)

const resolvedPanels = computed<FoldPagePanel[]>(() => {
  if (props.panels && props.panels.length >= 2)
    return props.panels
  const total = Math.max(2, Math.floor(props.count || 3))
  return Array.from({ length: total }, (_, index) => ({
    id: index,
    title: `Panel ${index + 1}`,
  }))
})

const resolvedSurfaceOpacity = computed(() => {
  if (typeof props.surfaceOpacity === 'number' && Number.isFinite(props.surfaceOpacity))
    return clamp01(props.surfaceOpacity)
  return props.foldStyle === 'gate' ? 0.94 : 0.78
})

const isMoving = computed(() => isDragging.value || isAnimating.value)
const primaryCoverIndex = computed(() => (resolvedPanels.value.length === 2 ? 1 : 0))

const layout = computed(() =>
  computeFoldPageLayout({
    count: resolvedPanels.value.length,
    width: stageWidth.value,
    height: stageHeight.value,
    progress: visualProgress.value,
    direction: props.direction,
    foldStyle: props.foldStyle,
    foldAngle: props.foldAngle,
    creaseOpacity: props.creaseOpacity,
  }),
)

const isOpen = computed(() => {
  if (isControlledProgress.value)
    return currentProgress.value >= 0.5
  return localOpen.value
})

const toggleLabel = computed(() => {
  if (isOpen.value)
    return props.labels?.collapse ?? 'Collapse fold page'
  return props.labels?.expand ?? 'Expand fold page'
})

const rootClasses = computed(() => [
  'tx-fold-page',
  `tx-fold-page--${props.size}`,
  `tx-fold-page--${props.direction}`,
  `tx-fold-page--${props.foldStyle}`,
  {
    'is-open': isOpen.value,
    'is-dragging': isDragging.value,
    'is-animating': isAnimating.value,
    'is-draggable': props.draggable && !props.disabled,
    'is-disabled': props.disabled,
    'is-plain-surface': props.surface === 'plain',
  },
])

const rootStyle = computed<CSSProperties>(() => ({
  '--tx-fold-radius': `${Math.max(0, props.radius)}px`,
  '--tx-fold-perspective': `${Math.max(320, props.perspective)}px`,
}))

function getSpanPx(): number {
  const base = props.direction === 'horizontal' ? stageWidth.value : stageHeight.value
  return Math.max(120, base * 0.45)
}

function panelStyle(panelLayout: FoldPagePanelLayout): CSSProperties {
  return {
    left: `${panelLayout.left}px`,
    top: `${panelLayout.top}px`,
    width: `${panelLayout.width}px`,
    height: `${panelLayout.height}px`,
    zIndex: panelLayout.zIndex,
    transform: panelLayout.transform,
    transformOrigin: panelLayout.transformOrigin,
  }
}

function panelSlotProps(panel: FoldPagePanel, index: number, panelLayout: FoldPagePanelLayout): FoldPagePanelSlotProps {
  return {
    panel,
    index,
    count: resolvedPanels.value.length,
    progress: currentProgress.value,
    angle: panelLayout.rotateDeg,
    open: isOpen.value,
  }
}

function finishMotion(): void {
  currentProgress.value = targetProgress.value
  visualProgress.value = targetProgress.value
  velocity.value = 0
  isAnimating.value = false
  if (pendingEndValue !== null) {
    const value = pendingEndValue
    pendingEndValue = null
    emit('fold-end', value)
  }
}

const frameLoop = createFrameLoop((dt) => {
  const [nextPos, nextVel] = stepSpring(
    visualProgress.value,
    velocity.value,
    targetProgress.value,
    {
      stiffness: Math.max(20, props.stiffness),
      damping: Math.max(2, props.damping),
      mass: 1,
    },
    dt,
  )

  visualProgress.value = nextPos
  velocity.value = nextVel
  const clamped = clamp01(nextPos)
  if (Math.abs(clamped - currentProgress.value) > 1e-4) {
    currentProgress.value = clamped
    if (!isControlledProgress.value)
      emit('update:progress', clamped)
  }

  if (
    Math.abs(targetProgress.value - nextPos) < SETTLE_EPSILON
    && Math.abs(nextVel) < VELOCITY_EPSILON
  ) {
    if (!isControlledProgress.value)
      emit('update:progress', targetProgress.value)
    finishMotion()
    return false
  }
  return true
})

function animateTo(nextTarget: number, endValue: boolean | null = null): void {
  const clamped = clamp01(nextTarget)
  targetProgress.value = clamped
  pendingEndValue = endValue

  if (reducedMotion.value) {
    frameLoop.stop()
    if (!isControlledProgress.value && Math.abs(clamped - currentProgress.value) > 1e-4)
      emit('update:progress', clamped)
    finishMotion()
    return
  }

  if (
    Math.abs(visualProgress.value - clamped) < SETTLE_EPSILON
    && Math.abs(velocity.value) < VELOCITY_EPSILON
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
  emit('fold-start', nextOpen)
  emit('update:modelValue', nextOpen)
  if (changed)
    emit('change', nextOpen)
  if (isControlledProgress.value)
    emit('update:progress', nextOpen ? 1 : 0)
  animateTo(nextOpen ? 1 : 0, nextOpen)
}

function open(): void {
  if (props.disabled)
    return
  commitOpenState(true)
}

function close(): void {
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
  velocity.value = 0
  targetProgress.value = clamped
  currentProgress.value = clamped
  visualProgress.value = clamped
  emit('update:progress', clamped)
  const nextOpen = clamped >= 0.5
  if (nextOpen !== localOpen.value) {
    localOpen.value = nextOpen
    emit('update:modelValue', nextOpen)
    emit('change', nextOpen)
  }
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element))
    return false
  if (target.closest('.tx-fold-page__toggle'))
    return false
  return Boolean(target.closest('a, button, input, textarea, select, [role="button"], [contenteditable]'))
}

function onPointerDown(event: PointerEvent): void {
  if (props.disabled || !props.draggable)
    return
  if (event.button !== 0 || isInteractiveTarget(event.target))
    return
  const el = rootRef.value
  if (!el)
    return

  const rect = el.getBoundingClientRect()
  activePointerId = event.pointerId
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragStartProgress = currentProgress.value
  dragMoved = false

  if (props.foldStyle === 'gate' && resolvedPanels.value.length === 2) {
    dragSign = 1
  }
  else if (props.direction === 'horizontal') {
    const centerX = rect.left + rect.width / 2
    dragSign = event.clientX < centerX ? -1 : 1
  }
  else {
    const centerY = rect.top + rect.height / 2
    dragSign = event.clientY < centerY ? -1 : 1
  }

  velocityTracker.reset(event.timeStamp || performance.now(), 0, 0)
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
    emit('fold-start', !isOpen.value)
    try {
      rootRef.value?.setPointerCapture?.(event.pointerId)
    }
    catch {
      // Ignore synthetic pointer ids without active capture in tests.
    }
  }

  const rawAxisDelta = props.direction === 'horizontal' ? dx : dy
  const signedDelta = rawAxisDelta * dragSign
  velocityTracker.push(event.timeStamp || performance.now(), signedDelta, 0)

  const span = getSpanPx()
  const rawProgress = dragStartProgress + signedDelta / span
  const bounded = rawProgress < 0
    ? rubberband(rawProgress, 0.35)
    : rawProgress > 1
      ? 1 + rubberband(rawProgress - 1, 0.35)
      : rawProgress

  visualProgress.value = clamp(bounded, -0.06, 1.06)
  const clamped = clamp01(rawProgress)
  if (Math.abs(clamped - currentProgress.value) > 1e-4) {
    currentProgress.value = clamped
    emit('update:progress', clamped)
  }
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
    animateTo(localOpen.value ? 1 : 0, localOpen.value)
    return
  }

  const span = getSpanPx()
  const [vx] = velocityTracker.velocity(event.timeStamp || performance.now())
  const normalizedVelocity = clamp(vx / span, -6, 6)
  const projected = currentProgress.value + projectMomentum(normalizedVelocity, 0.99)
  const nextOpen = projected >= 0.5
  velocity.value = normalizedVelocity

  const changed = nextOpen !== localOpen.value
  localOpen.value = nextOpen
  emit('update:modelValue', nextOpen)
  if (changed)
    emit('change', nextOpen)
  if (isControlledProgress.value)
    emit('update:progress', nextOpen ? 1 : 0)
  animateTo(nextOpen ? 1 : 0, nextOpen)
}

function onRootClick(event: MouseEvent): void {
  if (suppressClick || props.disabled || !props.clickToToggle)
    return
  if (isInteractiveTarget(event.target))
    return
  toggle()
}

function onRootKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && isDragging.value) {
    event.preventDefault()
    cleanupWindowListeners()
    isDragging.value = false
    animateTo(localOpen.value ? 1 : 0, localOpen.value)
  }
}

function syncDimensions(): void {
  const el = rootRef.value
  if (!el)
    return
  const rect = el.getBoundingClientRect()
  if (rect.width > 0)
    stageWidth.value = rect.width
  if (rect.height > 0)
    stageHeight.value = rect.height
}

watch(
  () => props.modelValue,
  (val) => {
    const next = Boolean(val)
    localOpen.value = next
    if (!isControlledProgress.value)
      animateTo(next ? 1 : 0, next)
  },
)

watch(
  () => props.progress,
  (val) => {
    if (val === undefined || isDragging.value)
      return
    const next = clamp01(val)
    localOpen.value = next >= 0.5
    if (Math.abs(next - targetProgress.value) < 1e-4)
      return
    animateTo(next, null)
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
  open,
  close,
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
    @pointerdown="onPointerDown"
    @click="onRootClick"
    @keydown="onRootKeydown"
  >
    <div class="tx-fold-page__stage">
      <div
        v-for="(panel, idx) in resolvedPanels"
        :key="panel.id ?? idx"
        class="tx-fold-page__panel"
        :class="{
          'is-wing': layout.panels[idx]?.isWing,
          'is-even': idx % 2 === 0,
        }"
        :style="panelStyle(layout.panels[idx]!)"
      >
        <div class="tx-fold-page__face tx-fold-page__face--inner">
          <TxBaseSurface
            class="tx-fold-page__surface"
            preset="card"
            fake
            :mode="surface"
            :color="surfaceColor || undefined"
            :opacity="resolvedSurfaceOpacity"
            :moving="isMoving"
          />
          <div class="tx-fold-page__body">
            <slot
              v-if="panel.id !== undefined && $slots[`panel-${String(panel.id)}`]"
              :name="`panel-${String(panel.id)}`"
              v-bind="panelSlotProps(panel, idx, layout.panels[idx]!)"
            />
            <slot
              v-else-if="$slots[`panel-${idx}`]"
              :name="`panel-${idx}`"
              v-bind="panelSlotProps(panel, idx, layout.panels[idx]!)"
            />
            <slot
              v-else
              name="panel"
              v-bind="panelSlotProps(panel, idx, layout.panels[idx]!)"
            >
              <div class="tx-fold-page__default-panel">
                <div class="tx-fold-page__panel-head">
                  <span v-if="panel.badge" class="tx-fold-page__badge">{{ panel.badge }}</span>
                  <span v-else class="tx-fold-page__index">0{{ idx + 1 }}</span>
                </div>
                <p v-if="panel.title" class="tx-fold-page__title">
                  {{ panel.title }}
                </p>
                <p v-if="panel.subtitle" class="tx-fold-page__subtitle">
                  {{ panel.subtitle }}
                </p>
                <p v-if="panel.content" class="tx-fold-page__content">
                  {{ panel.content }}
                </p>
              </div>
            </slot>
          </div>
          <div
            class="tx-fold-page__crease-shade"
            :style="{ opacity: layout.panels[idx]?.shadeOpacity ?? 0 }"
            aria-hidden="true"
          />
          <div
            class="tx-fold-page__crease-highlight"
            :style="{ opacity: layout.panels[idx]?.highlightOpacity ?? 0 }"
            aria-hidden="true"
          />
        </div>

        <div
          v-if="layout.panels[idx]?.isWing"
          class="tx-fold-page__face tx-fold-page__face--cover"
          :style="{ transform: layout.panels[idx]?.coverRotateTransform }"
          aria-hidden="true"
        >
          <TxBaseSurface
            class="tx-fold-page__surface"
            preset="card"
            fake
            :mode="surface"
            :color="surfaceColor || undefined"
            :opacity="resolvedSurfaceOpacity"
            :moving="isMoving"
          />
          <div class="tx-fold-page__body">
            <slot
              v-if="idx === primaryCoverIndex && $slots.cover"
              name="cover"
              :open="isOpen"
              :progress="currentProgress"
              :toggle="toggle"
            />
            <div v-else class="tx-fold-page__default-cover">
              <span class="tx-fold-page__cover-kicker">{{ panel.badge || 'FOLD COVER' }}</span>
              <p class="tx-fold-page__title">
                {{ panel.title || resolvedPanels[0]?.title || 'Overview' }}
              </p>
              <p v-if="panel.subtitle" class="tx-fold-page__subtitle">
                {{ panel.subtitle }}
              </p>
            </div>
          </div>
          <div
            class="tx-fold-page__crease-shade"
            :style="{ opacity: (layout.panels[idx]?.shadeOpacity ?? 0) * 0.5 }"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>

    <button
      type="button"
      class="tx-fold-page__toggle"
      :aria-expanded="isOpen"
      :aria-label="toggleLabel"
      :disabled="disabled"
      @click.stop="toggle"
    >
      <svg class="tx-fold-page__toggle-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M6 4l4 4-4 4"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </div>
</template>

<style lang="scss" scoped>
@use '../../../style/mixins.scss' as *;

.tx-fold-page {
  --tx-fold-min-height: 220px;
  --tx-fold-pad: 16px;
  --tx-fold-gap: 8px;
  --tx-fold-radius: 16px;
  --tx-fold-perspective: 1400px;

  position: relative;
  width: 100%;
  min-height: var(--tx-fold-min-height);
  user-select: none;
  box-sizing: border-box;

  &--xs {
    --tx-fold-min-height: 148px;
    --tx-fold-pad: 10px;
    --tx-fold-gap: 6px;
  }

  &--sm {
    --tx-fold-min-height: 180px;
    --tx-fold-pad: 12px;
    --tx-fold-gap: 6px;
  }

  &--md {
    --tx-fold-min-height: 220px;
    --tx-fold-pad: 16px;
    --tx-fold-gap: 8px;
  }

  &--lg {
    --tx-fold-min-height: 280px;
    --tx-fold-pad: 20px;
    --tx-fold-gap: 10px;
  }

  &--vertical.tx-fold-page--xs {
    --tx-fold-min-height: 240px;
  }

  &--vertical.tx-fold-page--sm {
    --tx-fold-min-height: 300px;
  }

  &--vertical.tx-fold-page--md {
    --tx-fold-min-height: 360px;
  }

  &--vertical.tx-fold-page--lg {
    --tx-fold-min-height: 440px;
  }

  &.is-draggable {
    cursor: grab;
    touch-action: pan-y;
  }

  &.tx-fold-page--vertical.is-draggable {
    touch-action: pan-x;
  }

  &.is-dragging {
    cursor: grabbing;
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.tx-fold-page__stage {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: var(--tx-fold-min-height);
  perspective: var(--tx-fold-perspective);
  transform-style: preserve-3d;
}

.tx-fold-page__panel {
  position: absolute;
  transform-style: preserve-3d;
  will-change: transform;
  box-sizing: border-box;
}

.tx-fold-page__face {
  position: absolute;
  inset: 0;
  border-radius: var(--tx-fold-radius);
  @include tx-squircle(var(--tx-fold-radius));
  background-color: var(--tx-bg-color, #ffffff);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color, #dcdfe6) 72%, transparent),
    var(--tx-box-shadow-light, 0 6px 20px rgb(0 0 0 / 0.08));
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  overflow: hidden;
  box-sizing: border-box;

  .tx-fold-page.is-plain-surface & {
    background-color: transparent;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color, #dcdfe6) 60%, transparent);
  }

  @include tx-when-high-contrast {
    box-shadow: inset 0 0 0 1.5px var(--tx-border-color, #6b7280);
  }
}

.tx-fold-page__face--cover {
  z-index: 2;
}

.tx-fold-page__surface {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: 0;
}

.tx-fold-page__body {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  padding: var(--tx-fold-pad);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.tx-fold-page__crease-shade,
.tx-fold-page__crease-highlight {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  border-radius: inherit;
}

.tx-fold-page__crease-shade {
  background: linear-gradient(
    90deg,
    rgb(0 0 0 / 0.34) 0%,
    rgb(0 0 0 / 0.14) 38%,
    transparent 100%
  );
}

.tx-fold-page__crease-highlight {
  background: linear-gradient(
    90deg,
    rgb(255 255 255 / 0.24) 0%,
    rgb(255 255 255 / 0.06) 42%,
    transparent 100%
  );
}

.tx-fold-page--vertical .tx-fold-page__crease-shade {
  background: linear-gradient(
    180deg,
    rgb(0 0 0 / 0.32) 0%,
    rgb(0 0 0 / 0.12) 40%,
    transparent 100%
  );
}

.tx-fold-page--vertical .tx-fold-page__crease-highlight {
  background: linear-gradient(
    180deg,
    rgb(255 255 255 / 0.22) 0%,
    rgb(255 255 255 / 0.06) 42%,
    transparent 100%
  );
}

.tx-fold-page__default-panel,
.tx-fold-page__default-cover {
  display: flex;
  flex-direction: column;
  gap: var(--tx-fold-gap);
  height: 100%;
}

.tx-fold-page__default-cover {
  justify-content: center;
}

.tx-fold-page__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tx-fold-page__badge,
.tx-fold-page__index,
.tx-fold-page__cover-kicker {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--tx-color-primary, #409eff);
}

.tx-fold-page__index {
  color: var(--tx-text-color-secondary, #909399);
}

.tx-fold-page__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--tx-text-color-primary, #303133);
}

.tx-fold-page__subtitle {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-fold-page__content {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--tx-text-color-regular, #606266);
}

.tx-fold-page__toggle {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 6;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--tx-text-color-regular, #606266);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #ffffff) 88%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color, #dcdfe6) 80%, transparent),
    1px 2px 8px rgb(0 0 0 / 0.1);
  transition: transform 200ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));

  &:hover:not(:disabled) {
    color: var(--tx-text-color-primary, #303133);
    background: var(--tx-bg-color-overlay, #ffffff);
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

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-fold-page.is-open .tx-fold-page__toggle-icon {
  transform: rotate(180deg);
}

.tx-fold-page__toggle-icon {
  width: 14px;
  height: 14px;
  transition: transform 220ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}
</style>
