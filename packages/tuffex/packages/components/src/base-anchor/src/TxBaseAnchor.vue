<script setup lang="ts">
import type { TxCardProps } from '../../card/src/types'
import type { BaseAnchorClassValue, BaseAnchorProps, BaseAnchorVirtualReference } from './types'
import { arrow, autoUpdate, flip, offset as offsetMw, shift, size, useFloating } from '@floating-ui/vue'
import type { StyleValue } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
import { hasWindow } from '../../../../utils/env'
import { getZIndex, nextZIndex } from '../../../../utils/z-index-manager'
import TxCard from '../../card/src/TxCard.vue'
import { useBaseAnchorMotion } from './base-anchor-motion'

defineOptions({ name: 'TxBaseAnchor', inheritAttrs: false })

const props = withDefaults(defineProps<BaseAnchorProps>(), {
  modelValue: undefined,
  disabled: false,
  eager: false,
  placement: 'bottom-start',
  offset: 8,
  width: 0,
  minWidth: 0,
  maxWidth: 360,
  maxHeight: 420,
  unlimitedHeight: false,
  matchReferenceWidth: false,
  virtualReference: undefined,
  animation: () => ({}),
  duration: 432,
  ease: 'back.out(2)',
  useCard: true,
  panelVariant: 'plain',
  panelBackground: 'refraction',
  panelShadow: 'soft',
  panelRadius: 18,
  panelPadding: 10,
  showArrow: false,
  arrowSize: 10,
  keepAliveContent: false,
  surfaceMotionAdaptation: 'auto',
  closeOnClickOutside: true,
  closeOnEsc: true,
  toggleOnReferenceClick: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'open'): void
  (e: 'close'): void
}>()
const attrs = useAttrs()

const internalOpen = ref(false)
const isUnlimitedHeight = computed(() => props.unlimitedHeight || props.maxHeight <= 0)

const open = computed({
  get: () => (typeof props.modelValue === 'boolean' ? props.modelValue : internalOpen.value),
  set: (v: boolean) => {
    if (props.disabled && v)
      return

    const current = typeof props.modelValue === 'boolean' ? props.modelValue : internalOpen.value
    if (current === v)
      return

    internalOpen.value = v
    emit('update:modelValue', v)
    if (v)
      emit('open')
    else
      emit('close')
  },
})

/* ─── refs ─── */
const referenceRef = ref<HTMLElement | null>(null)
const floatingRef = ref<HTMLElement | null>(null)
const clipRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const arrowRef = ref<HTMLElement | null>(null)
const outlineW = ref(0)
const outlineH = ref(0)

const zIndex = ref(getZIndex())
const mounted = ref(false)
const cleanupAutoUpdate = ref<(() => void) | null>(null)
const cleanupResizeObserver = ref<(() => void) | null>(null)
const lastOpenedAt = ref(0)
const panelSurfaceMoving = ref(false)
interface RectSnapshot { x: number, y: number, width: number, height: number }
let lastReferenceRect: RectSnapshot | null = null
let panelSurfaceMoveTimer: ReturnType<typeof setTimeout> | null = null
let resizeUpdateFrame: number | null = null

let runId = 0

/* ─── floating-ui ─── */
const floatingReference = computed(() => props.virtualReference ?? referenceRef.value)

const { floatingStyles, middlewareData, placement, update } = useFloating(floatingReference as any, floatingRef, {
  placement: computed(() => props.placement),
  strategy: 'fixed',
  transform: false,
  middleware: [
    offsetMw(() => props.offset),
    flip({ padding: 8 }),
    shift({ padding: 8 }),
    size({
      padding: 8,
      apply({ rects, availableHeight, elements }) {
        const baseW = rects.reference.width
        const minW = Math.max(0, props.minWidth ?? 0)

        const style = elements.floating.style
        style.width = ''
        style.minWidth = ''

        if (props.width > 0) {
          style.width = `${props.width}px`
        }
        else if (props.matchReferenceWidth) {
          style.width = `${Math.max(baseW, minW)}px`
        }
        else if (minW > 0) {
          style.minWidth = `${minW}px`
        }

        style.maxWidth = `${props.maxWidth}px`
        if (isUnlimitedHeight.value) {
          elements.floating.style.setProperty('--tx-ba-max-height', 'none')
          return
        }
        const maxH = Math.max(0, Math.min(availableHeight, props.maxHeight))
        elements.floating.style.setProperty('--tx-ba-max-height', `${maxH}px`)
      },
    }),
    arrow({ element: arrowRef, padding: 6 }),
  ],
})

const side = computed(() => (placement.value?.split('-')[0] ?? 'bottom') as 'top' | 'bottom' | 'left' | 'right')
const floatingClass = computed<BaseAnchorClassValue | undefined>(
  () => (attrs as Record<string, unknown>).class as BaseAnchorClassValue | undefined,
)
const floatingStyle = computed<StyleValue | undefined>(() => (attrs as Record<string, unknown>).style as StyleValue | undefined)
const floatingAttrs = computed(() => {
  const source = attrs as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (key === 'class' || key === 'style')
      continue
    next[key] = value
  }
  return next
})

const panelCardProps = computed<Partial<TxCardProps>>(() => {
  const shouldFallbackSurface = props.surfaceMotionAdaptation === 'auto'
    ? panelSurfaceMoving.value
    : props.surfaceMotionAdaptation === 'manual'
      ? props.panelCard?.surfaceMoving
      : false
  const refractionSurfaceDefaults = props.panelBackground === 'refraction'
    ? {
        glassOverlayOpacity: 0.15,
        maskOpacity: 0.78,
      }
    : undefined
  return {
    ...(refractionSurfaceDefaults ?? {}),
    ...(props.panelCard ?? {}),
    variant: props.panelVariant,
    background: props.panelBackground,
    shadow: props.panelShadow,
    radius: props.panelRadius,
    padding: props.panelPadding,
    surfaceMoving: shouldFallbackSurface,
  }
})

const arrowStyle = computed<Record<string, string>>(() => {
  if (!props.showArrow || !arrowRef.value)
    return { display: 'none' }

  const data = (middlewareData.value as any)?.arrow
  if (!data || (data.x == null && data.y == null))
    return { display: 'none' }

  const base: Record<string, string> = {
    'display': 'block',
    'position': 'absolute',
    '--tx-ba-arrow-size': `${props.arrowSize ?? 10}px`,
  }

  if (data.x != null)
    base.left = `${data.x}px`
  if (data.y != null)
    base.top = `${data.y}px`

  const staticSideMap = {
    top: 'bottom',
    right: 'left',
    bottom: 'top',
    left: 'right',
  } as const

  const staticSide = staticSideMap[side.value] ?? 'top'
  const half = Math.round((props.arrowSize ?? 10) / 2)
  base[staticSide] = `-${half}px`
  return base
})

function fmt(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function syncOutlineSize() {
  const el = contentRef.value
  if (!el) {
    outlineW.value = 0
    outlineH.value = 0
    return
  }
  outlineW.value = Math.max(0, el.offsetWidth)
  outlineH.value = Math.max(0, el.offsetHeight)
}

function scheduleResizeUpdate() {
  if (!hasWindow())
    return
  if (resizeUpdateFrame != null)
    window.cancelAnimationFrame(resizeUpdateFrame)
  resizeUpdateFrame = window.requestAnimationFrame(() => {
    resizeUpdateFrame = null
    syncOutlineSize()
    void update()
  })
}

function setupResizeObserver() {
  cleanupResizeObserver.value?.()
  cleanupResizeObserver.value = null
  if (!hasWindow() || typeof ResizeObserver === 'undefined')
    return

  const observer = new ResizeObserver(() => {
    scheduleResizeUpdate()
  })
  if (contentRef.value)
    observer.observe(contentRef.value)
  if (referenceRef.value)
    observer.observe(referenceRef.value)

  cleanupResizeObserver.value = () => {
    observer.disconnect()
    if (resizeUpdateFrame != null) {
      window.cancelAnimationFrame(resizeUpdateFrame)
      resizeUpdateFrame = null
    }
  }
}

const outlinePath = computed(() => {
  if (!props.useCard)
    return ''

  const w = outlineW.value
  const h = outlineH.value
  if (!w || !h)
    return ''

  const r = Math.min(Math.max(0, props.panelRadius ?? 18), w / 2, h / 2)
  const borderInset = 0.5
  const left = borderInset
  const top = borderInset
  const right = w - borderInset
  const bottom = h - borderInset
  const radius = Math.max(0, r - borderInset)

  const topStart = left + radius
  const topEnd = right - radius
  const rightStart = top + radius
  const rightEnd = bottom - radius
  const bottomStart = left + radius
  const leftStart = top + radius
  const leftEnd = bottom - radius

  return [
    `M ${fmt(topStart)} ${fmt(top)}`,
    `L ${fmt(topEnd)} ${fmt(top)}`,
    `Q ${fmt(right)} ${fmt(top)} ${fmt(right)} ${fmt(rightStart)}`,
    `L ${fmt(right)} ${fmt(rightEnd)}`,
    `Q ${fmt(right)} ${fmt(bottom)} ${fmt(topEnd)} ${fmt(bottom)}`,
    `L ${fmt(bottomStart)} ${fmt(bottom)}`,
    `Q ${fmt(left)} ${fmt(bottom)} ${fmt(left)} ${fmt(leftEnd)}`,
    `L ${fmt(left)} ${fmt(leftStart)}`,
    `Q ${fmt(left)} ${fmt(top)} ${fmt(topStart)} ${fmt(top)}`,
  ].join(' ')
})

function clearPanelSurfaceMoveTimer() {
  if (panelSurfaceMoveTimer == null)
    return
  clearTimeout(panelSurfaceMoveTimer)
  panelSurfaceMoveTimer = null
}

function setPanelSurfaceMoving(value: boolean) {
  if (!props.useCard) {
    panelSurfaceMoving.value = false
    clearPanelSurfaceMoveTimer()
    return
  }
  panelSurfaceMoving.value = value
  if (!value)
    clearPanelSurfaceMoveTimer()
}

function pulsePanelSurfaceMoving(duration = 96) {
  if (!props.useCard)
    return
  panelSurfaceMoving.value = true
  clearPanelSurfaceMoveTimer()
  panelSurfaceMoveTimer = setTimeout(() => {
    panelSurfaceMoving.value = false
    panelSurfaceMoveTimer = null
  }, Math.max(40, duration))
}

const {
  animateClose,
  animateOpen,
  bouncePad,
  clearTimeline,
  hasActiveTimeline,
  settleOpenVisualStateForFollow,
} = useBaseAnchorMotion({
  clipRef,
  contentRef,
  arrowRef,
  side,
  arrowSize: computed(() => props.arrowSize ?? 10),
  showArrow: computed(() => props.showArrow),
  animation: computed(() => props.animation),
  duration: computed(() => props.duration),
  ease: computed(() => props.ease),
  panelBackground: computed(() => props.panelBackground),
  useCard: computed(() => props.useCard),
  keepAliveContent: computed(() => props.keepAliveContent),
  isUnlimitedHeight,
  isOpen: open,
  isCurrentRun: currentRunId => currentRunId === runId,
  setMounted: value => (mounted.value = value),
  setPanelSurfaceMoving,
  pulsePanelSurfaceMoving,
})

function normalizeRect(rect: DOMRect | ClientRect): RectSnapshot {
  const domRect = rect as DOMRect
  return {
    x: typeof domRect.x === 'number' ? domRect.x : rect.left,
    y: typeof domRect.y === 'number' ? domRect.y : rect.top,
    width: rect.width,
    height: rect.height,
  }
}

function readReferenceRect(): RectSnapshot | null {
  const reference = floatingReference.value as HTMLElement | BaseAnchorVirtualReference | null
  if (!reference)
    return null
  const rect = reference.getBoundingClientRect()
  return normalizeRect(rect)
}

function hasReferenceMoved(): boolean {
  const current = readReferenceRect()
  if (!current)
    return false
  if (!lastReferenceRect) {
    lastReferenceRect = current
    return false
  }

  const moveThreshold = 1.5
  const moved = Math.abs(current.x - lastReferenceRect.x) > moveThreshold
    || Math.abs(current.y - lastReferenceRect.y) > moveThreshold
    || Math.abs(current.width - lastReferenceRect.width) > moveThreshold
    || Math.abs(current.height - lastReferenceRect.height) > moveThreshold

  lastReferenceRect = current
  return moved
}

/* ─── toggle / close ─── */
function toggle() {
  if (props.disabled)
    return
  if (!open.value)
    lastOpenedAt.value = performance.now()
  open.value = !open.value
}

function handleReferenceClick() {
  if (!props.toggleOnReferenceClick)
    return
  toggle()
}

function close() {
  open.value = false
}

defineExpose({
  close,
  toggle,
  updatePosition: update,
})

/* ─── outside click / esc ─── */
function isEventInside(e: Event, el: HTMLElement | null): boolean {
  if (!el)
    return false
  const anyE = e as any
  const path: EventTarget[] | undefined = typeof anyE.composedPath === 'function' ? anyE.composedPath() : undefined
  if (path && path.length)
    return path.includes(el)
  const t = (e.target ?? null) as Node | null
  return !!t && el.contains(t)
}

function handleOutside(e: Event) {
  if (!props.closeOnClickOutside)
    return
  if (!open.value)
    return
  if (performance.now() - lastOpenedAt.value < 60)
    return

  const inRef = isEventInside(e, referenceRef.value)
  const inFloat = isEventInside(e, floatingRef.value)
  if (!inRef && !inFloat)
    close()
}

function handleEsc(e: KeyboardEvent) {
  if (!props.closeOnEsc)
    return
  if (e.key !== 'Escape')
    return
  if (!open.value)
    return
  close()
}

/* ─── watch open state ─── */
watch(
  open,
  async (v) => {
    runId++
    const currentRunId = runId

    if (!v) {
      cleanupAutoUpdate.value?.()
      cleanupAutoUpdate.value = null
      cleanupResizeObserver.value?.()
      cleanupResizeObserver.value = null
      lastReferenceRect = null
      animateClose(currentRunId)
      return
    }

    mounted.value = true
    zIndex.value = nextZIndex()
    lastOpenedAt.value = performance.now()

    await nextTick()
    await update()
    syncOutlineSize()
    setupResizeObserver()

    const reference = floatingReference.value
    if (reference && floatingRef.value) {
      cleanupAutoUpdate.value?.()
      if (props.virtualReference) {
        const updatePosition = () => update()
        window.addEventListener('resize', updatePosition, { passive: true })
        window.addEventListener('scroll', updatePosition, { passive: true, capture: true })
        cleanupAutoUpdate.value = () => {
          window.removeEventListener('resize', updatePosition)
          window.removeEventListener('scroll', updatePosition, { capture: true } as EventListenerOptions)
        }
      }
      else {
        cleanupAutoUpdate.value = autoUpdate(
          reference,
          floatingRef.value,
          () => {
            const referenceMoved = hasReferenceMoved()
            update()
            if (referenceMoved && open.value && props.panelBackground !== 'refraction') {
              pulsePanelSurfaceMoving(120)
            }
            if (referenceMoved && hasActiveTimeline() && open.value)
              settleOpenVisualStateForFollow()
          },
          { animationFrame: true },
        )
      }
    }

    await nextTick()
    lastReferenceRect = readReferenceRect()
    syncOutlineSize()
    animateOpen(currentRunId)
  },
  { flush: 'post' },
)

watch(
  () => props.disabled,
  (disabled) => {
    if (!disabled)
      return
    open.value = false
  },
)

/* ─── lifecycle ─── */
onMounted(async () => {
  document.addEventListener('pointerdown', handleOutside, true)
  document.addEventListener('keydown', handleEsc)

  await nextTick()
  if (referenceRef.value) {
    await update()
    syncOutlineSize()
    setupResizeObserver()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutside, true)
  document.removeEventListener('keydown', handleEsc)
  cleanupAutoUpdate.value?.()
  cleanupAutoUpdate.value = null
  cleanupResizeObserver.value?.()
  cleanupResizeObserver.value = null
  setPanelSurfaceMoving(false)
  clearTimeline()
})
</script>

<template>
  <div
    ref="referenceRef"
    class="tx-base-anchor__reference"
    :class="[props.referenceClass, { 'is-virtual-reference': !!props.virtualReference }]"
    @click.capture="handleReferenceClick"
  >
    <slot name="reference" />
  </div>

  <Teleport to="body">
    <div
      v-if="mounted || open || props.eager"
      ref="floatingRef"
      v-bind="floatingAttrs"
      class="tx-base-anchor"
      :class="[floatingClass, { 'is-open': open, 'is-unlimited-height': isUnlimitedHeight }]"
      :style="[floatingStyle, floatingStyles, { zIndex, '--tx-ba-max-height': isUnlimitedHeight ? 'none' : undefined }]"
    >
      <span
        v-if="props.showArrow"
        ref="arrowRef"
        class="tx-base-anchor__arrow"
        :data-side="side"
        :data-bg="props.panelBackground"
        :style="arrowStyle"
        aria-hidden="true"
      />

      <div
        ref="clipRef"
        class="tx-base-anchor__clip"
        :data-side="side"
        :style="bouncePad"
      >
        <div ref="contentRef" class="tx-base-anchor__content">
          <TxCard
            v-if="props.useCard"
            class="tx-base-anchor__card"
            v-bind="panelCardProps"
          >
            <slot :side="side" />
          </TxCard>
          <slot v-else :side="side" />
          <svg
            v-if="props.useCard && outlinePath"
            class="tx-base-anchor__outline"
            :viewBox="`0 0 ${outlineW} ${outlineH}`"
            aria-hidden="true"
          >
            <path class="tx-base-anchor__outline-path" :d="outlinePath" />
          </svg>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tx-base-anchor__reference {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: fit-content;
}

.tx-base-anchor__reference.is-full-width {
  display: flex;
  width: 100%;
}

.tx-base-anchor__reference.is-virtual-reference {
  position: fixed;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  overflow: hidden;
  pointer-events: none;
}

.tx-base-anchor {
  padding: 0;
  background: transparent;
  border: none;
  overflow: visible;
  pointer-events: none;
}

.tx-base-anchor__clip {
  position: relative;
  pointer-events: auto;
  overflow: hidden;
  will-change: clip-path;
  visibility: hidden;
  z-index: 2;
}

.tx-base-anchor__arrow {
  position: absolute;
  width: var(--tx-ba-arrow-size, 10px);
  height: var(--tx-ba-arrow-size, 10px);
  pointer-events: none;
  background: transparent;
  overflow: hidden;
  z-index: 4;
}

.tx-base-anchor:not(.is-open) .tx-base-anchor__arrow {
  opacity: 0;
  visibility: hidden;
}

.tx-base-anchor__arrow[data-side='bottom'] {
  clip-path: inset(0 0 50% 0);
}

.tx-base-anchor__arrow[data-side='top'] {
  clip-path: inset(50% 0 0 0);
}

.tx-base-anchor__arrow[data-side='left'] {
  clip-path: inset(0 0 0 50%);
}

.tx-base-anchor__arrow[data-side='right'] {
  clip-path: inset(0 50% 0 0);
}

.tx-base-anchor__arrow::before,
.tx-base-anchor__arrow::after {
  content: '';
  position: absolute;
  inset: 0;
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  box-sizing: border-box;
}

.tx-base-anchor__arrow::before {
  background: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent);
}

.tx-base-anchor__arrow::after {
  inset: 1px;
  background: var(--tx-bg-color-overlay, #fff);
}

.tx-base-anchor__arrow[data-bg='mask']::after {
  background: var(--tx-card-fake-background, var(--tx-bg-color-overlay, #fff));
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.tx-base-anchor__arrow[data-bg='blur']::after {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 12%, transparent);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
}

.tx-base-anchor__arrow[data-bg='glass']::after {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 50%, transparent);
  backdrop-filter: blur(22px) saturate(185%) contrast(1.08);
  -webkit-backdrop-filter: blur(22px) saturate(185%) contrast(1.08);
}

.tx-base-anchor__arrow[data-bg='refraction']::after {
  background: color-mix(in srgb, var(--tx-surface-refraction-mask-color, var(--tx-bg-color-overlay, #fff)) 22%, transparent);
  backdrop-filter: blur(18px) saturate(162%) contrast(1.06) brightness(1.02);
  -webkit-backdrop-filter: blur(18px) saturate(162%) contrast(1.06) brightness(1.02);
}

.tx-base-anchor__arrow[data-bg='pure']::after {
  background: var(--tx-fill-color-lighter, var(--tx-bg-color-overlay, #fff));
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.tx-base-anchor__outline-path {
  fill: none;
  stroke: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 88%, transparent);
  stroke-width: 1;
  stroke-linecap: butt;
  stroke-linejoin: round;
  shape-rendering: geometricPrecision;
  vector-effect: non-scaling-stroke;
}

.tx-base-anchor__content {
  position: relative;
  will-change: transform;
  max-height: var(--tx-ba-max-height, 420px);
}

.tx-base-anchor__card {
  width: 100%;
  max-height: var(--tx-ba-max-height, 420px);
  overflow: auto;
}

.tx-base-anchor__outline {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 3;
}

.tx-base-anchor.is-unlimited-height .tx-base-anchor__content,
.tx-base-anchor.is-unlimited-height .tx-base-anchor__card {
  max-height: none;
}
</style>
