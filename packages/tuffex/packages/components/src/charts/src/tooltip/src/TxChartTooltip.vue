// ECharts `animationDurationUpdate` (500ms) etc. aside, the tooltip timings are
// reproduced exactly: showDelay 0, hideDelay 100ms, fade 200ms, position
// transition 400ms `cubic-bezier(0.23, 1, 0.32, 1)` and pointer tracking
// throttled to 50ms (echarts@6 TooltipModel / tooltip DOM defaults).

<script setup lang="ts">
import type { TooltipBoundaryBox } from './position'
import type { ChartTooltipProps } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import {
  TOOLTIP_FADE_DURATION,
  TOOLTIP_HIDE_DELAY,
  TOOLTIP_TRACK_THROTTLE,
} from '../../core/animate'
import { useChartContext } from '../../core/context'
import { placeTooltip } from './position'

defineOptions({ name: 'TxChartTooltip' })

const props = withDefaults(defineProps<ChartTooltipProps>(), {
  open: 'auto',
  follow: 'both',
  offset: 12,
  fixedY: 0,
  hiddenCount: 0,
  moreLabel: (count: number) => `+${count} more`,
  boundary: 'clipping-ancestors',
})

defineSlots<{
  /** Replaces the default rows body. */
  default?: (slotProps: { pointerX: number, pointerY: number }) => unknown
}>()

const ctx = useChartContext('TxChartTooltip')

const el = ref<HTMLElement | null>(null)
const size = ref({ width: 0, height: 0 })

let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect
    if (rect)
      size.value = { width: rect.width, height: rect.height }
  })
  if (el.value)
    observer.observe(el.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  clearHideTimers()
  clearTrackTimer()
})

const visible = computed(() => props.open === 'auto' ? ctx.pointer.inside : props.open)

// The element stays mounted for the fade-out window; `displayed` only flips
// after the opacity transition has finished (ECharts removes the DOM node once
// the hide transition completes).
const displayed = ref(visible.value)
const fadedOut = ref(!visible.value)

let hideTimer: ReturnType<typeof setTimeout> | null = null
let removeTimer: ReturnType<typeof setTimeout> | null = null

function clearHideTimers(): void {
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  if (removeTimer !== null) {
    clearTimeout(removeTimer)
    removeTimer = null
  }
}

// ECharts tooltip `showDelay` is 0 and `hideDelay` is 100ms: opening is
// synchronous, closing waits `TOOLTIP_HIDE_DELAY` so brief pointer excursions
// don't flicker the tooltip. Re-opening cancels the pending hide.
watch(visible, (isVisible) => {
  clearHideTimers()
  // Settle any throttled pointer sample immediately — on open so the tooltip
  // starts at the pointer, and on close so it doesn't freeze up to
  // `TOOLTIP_TRACK_THROTTLE` behind the pointer while fading out.
  flushPointerTracking()
  if (isVisible) {
    displayed.value = true
    // The element must be laid out before the opacity transition can run, so
    // the fade-in starts on the next tick (ECharts fades over 200ms).
    void nextTick(() => {
      if (visible.value)
        fadedOut.value = false
    })
    return
  }
  if (!displayed.value)
    return
  hideTimer = setTimeout(() => {
    hideTimer = null
    fadedOut.value = true
    removeTimer = setTimeout(() => {
      removeTimer = null
      displayed.value = false
    }, TOOLTIP_FADE_DURATION)
  }, TOOLTIP_HIDE_DELAY)
}, { flush: 'sync' })

/** Pointer position actually used for placement (see `trackPointer`). */
const tracked = ref({ x: ctx.pointer.x, y: ctx.pointer.y })
let lastTrackedAt = Number.NEGATIVE_INFINITY
let trackTimer: ReturnType<typeof setTimeout> | null = null
let pendingPointer: { x: number, y: number } | null = null

function clearTrackTimer(): void {
  if (trackTimer !== null) {
    clearTimeout(trackTimer)
    trackTimer = null
  }
  pendingPointer = null
}

function applyPointer(x: number, y: number): void {
  tracked.value = { x, y }
}

// ECharts throttles tooltip pointer tracking to `TOOLTIP_TRACK_THROTTLE`
// (50ms). Leading edge plus a trailing sample, so the tooltip settles on the
// pointer's final position instead of freezing up to 50ms behind it.
function trackPointer(x: number, y: number): void {
  const now = performance.now()
  const elapsed = now - lastTrackedAt
  if (elapsed >= TOOLTIP_TRACK_THROTTLE) {
    lastTrackedAt = now
    clearTrackTimer()
    applyPointer(x, y)
    return
  }
  pendingPointer = { x, y }
  if (trackTimer === null) {
    trackTimer = setTimeout(() => {
      trackTimer = null
      lastTrackedAt = performance.now()
      if (pendingPointer) {
        applyPointer(pendingPointer.x, pendingPointer.y)
        pendingPointer = null
      }
    }, TOOLTIP_TRACK_THROTTLE - elapsed)
  }
}

/** Apply the last pointer sample immediately (used when the tooltip closes). */
function flushPointerTracking(): void {
  if (trackTimer !== null) {
    clearTimeout(trackTimer)
    trackTimer = null
  }
  if (pendingPointer) {
    applyPointer(pendingPointer.x, pendingPointer.y)
    pendingPointer = null
  }
}

watch(
  () => [ctx.pointer.x, ctx.pointer.y] as const,
  ([x, y]) => trackPointer(x, y),
)

function intersectBox(a: TooltipBoundaryBox, b: TooltipBoundaryBox): TooltipBoundaryBox {
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  }
}

/**
 * ECharts-equivalent clamp box, in container-local pixels: the intersection of
 * the viewport (or the explicit `boundary` elements) with every ancestor whose
 * computed overflow is not `visible`.
 */
function measureBoundary(): TooltipBoundaryBox | null {
  const node = el.value
  const container = ctx.container.value
  if (!node || !container || typeof window === 'undefined')
    return null

  const containerRect = container.getBoundingClientRect()
  let box: TooltipBoundaryBox

  if (props.boundary === 'clipping-ancestors') {
    box = {
      left: 0,
      top: 0,
      right: window.innerWidth || containerRect.width,
      bottom: window.innerHeight || containerRect.height,
    }
    let parent = node.offsetParent as HTMLElement | null
    while (parent) {
      const style = window.getComputedStyle(parent)
      const clips = [style.overflow, style.overflowX, style.overflowY]
        .some(value => value !== '' && value !== 'visible')
      if (clips) {
        const rect = parent.getBoundingClientRect()
        box = intersectBox(box, { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })
      }
      parent = parent.offsetParent as HTMLElement | null
    }
  }
  else {
    const elements = Array.isArray(props.boundary) ? props.boundary : [props.boundary]
    const [first, ...rest] = elements
    if (!first)
      return null
    const firstRect = first.getBoundingClientRect()
    box = { left: firstRect.left, top: firstRect.top, right: firstRect.right, bottom: firstRect.bottom }
    for (const element of rest) {
      const rect = element.getBoundingClientRect()
      box = intersectBox(box, { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })
    }
  }

  return {
    left: box.left - containerRect.left,
    top: box.top - containerRect.top,
    right: box.right - containerRect.left,
    bottom: box.bottom - containerRect.top,
  }
}

const boundaryBox = ref<TooltipBoundaryBox | null>(null)

// Re-measure when the tooltip opens, the container moves, or its own size
// changes — measuring on every pointer move would be wasteful and the boundary
// does not depend on the pointer.
watchEffect(() => {
  void size.value.width
  void visible.value
  void ctx.container.value
  void el.value
  boundaryBox.value = measureBoundary()
})

const placement = computed(() => placeTooltip({
  pointerX: tracked.value.x,
  pointerY: tracked.value.y,
  tooltipWidth: size.value.width,
  tooltipHeight: size.value.height,
  containerWidth: ctx.width.value,
  containerHeight: ctx.height.value,
  offset: props.offset,
  follow: props.follow,
  fixedY: props.fixedY,
  boundary: boundaryBox.value ?? undefined,
}))
</script>

<template>
  <div
    v-show="displayed"
    ref="el"
    class="tx-chart-tooltip"
    :class="{ 'tx-chart-tooltip--hidden': fadedOut }"
    :style="{ transform: `translate3d(${placement.left}px, ${placement.top}px, 0)` }"
    role="presentation"
  >
    <slot :pointer-x="ctx.pointer.x" :pointer-y="ctx.pointer.y">
      <div v-if="props.title" class="tx-chart-tooltip__title">
        {{ props.title }}
      </div>
      <div
        v-for="row in props.rows ?? []"
        :key="row.name"
        class="tx-chart-tooltip__row"
      >
        <span class="tx-chart-tooltip__dot" :style="{ backgroundColor: row.color }" />
        <span class="tx-chart-tooltip__name">{{ row.name }}</span>
        <span class="tx-chart-tooltip__value">{{ row.value }}</span>
      </div>
      <div v-if="props.hiddenCount > 0" class="tx-chart-tooltip__more">
        {{ props.moreLabel(props.hiddenCount) }}
      </div>
      <div v-if="props.footer" class="tx-chart-tooltip__footer">
        {{ props.footer }}
      </div>
    </slot>
  </div>
</template>

<style lang="scss" scoped>
.tx-chart-tooltip {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  min-width: 150px;
  max-width: 20rem;
  padding: 0.5rem;
  border: 1px solid var(--tx-chart-grid-line, rgb(107 114 128 / 20%));
  border-radius: 0.5rem;
  background: var(--tx-chart-tooltip-bg, canvas);
  box-shadow: -2px 4px 12px rgb(0 0 0 / 10%);
  font-size: 0.75rem;
  opacity: 1;
  pointer-events: none;
  will-change: transform;

  // ECharts tooltip DOM: opacity fades over 200ms (`TOOLTIP_FADE_DURATION`)
  // and the position transitions over `transitionDuration` 0.4s
  // (`TOOLTIP_MOVE_DURATION`) with `cubic-bezier(0.23, 1, 0.32, 1)`.
  @media (prefers-reduced-motion: no-preference) {
    transition:
      opacity 200ms linear,
      transform 400ms cubic-bezier(0.23, 1, 0.32, 1);
  }

  &--hidden {
    opacity: 0;
  }

  &__title {
    margin-bottom: 0.25rem;
    color: var(--tx-chart-text-secondary, #9ca3af);
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-block: 0.125rem;
  }

  &__dot {
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }

  &__name {
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__value {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  &__more {
    margin-top: 0.25rem;
    color: var(--tx-chart-text-secondary, #9ca3af);
  }

  &__footer {
    margin-top: 0.25rem;
    color: var(--tx-chart-text-secondary, #9ca3af);
  }
}
</style>
