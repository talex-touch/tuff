<script setup lang="ts" generic="T">
// API surface modeled on Cloudflare kumo's BubbleMap (MIT); d3-geo + SVG.
// Bubble area is proportional to value (sqrt radius between min/maxRadius).

import type { BubbleMapProps } from './types'
import { computed, ref, shallowRef } from 'vue'
import { ANIMATION_THRESHOLD, useEnterProgress } from '../../core/animate'
import { resolveAccessor, resolveStyle } from './accessor'
import { useMapBase, useMapEmphasis } from './use-map-base'

defineOptions({ name: 'TxBubbleMap' })

const props = withDefaults(defineProps<BubbleMapProps<T>>(), {
  zoom: 1.25,
  roam: true,
  minRadius: 6,
  maxRadius: 26,
  bubbleBorderColor: 'transparent',
  bubbleBorderWidth: 0,
  showTooltip: true,
  valueFormat: (value: number) => value.toLocaleString(),
})

const emit = defineEmits<{
  /** Pointer entered/left a bubble (undefined on leave). */
  bubbleHover: [row: T | undefined]
  bubbleClick: [row: T]
}>()

defineSlots<{
  /** Replaces the default tooltip body. */
  tooltip?: (slotProps: { row: T }) => unknown
}>()

const base = useMapBase(props, { onDragStart: () => onLeave() })

interface Bubble {
  key: number
  row: T
  cx: number
  cy: number
  r: number
  fill: string
  stroke: string
  strokeWidth: number
  name: string | undefined
  value: number
}

const bubbles = computed<Bubble[]>(() => {
  if (!base.ready.value)
    return []
  const values = props.data.map(row => resolveAccessor<T, number>(row, props.value))
  const vmax = Math.max(0, ...values)

  // kumo: area-proportional radius between minRadius and maxRadius.
  const radiusFor = (value: number): number => {
    if (props.bubbleSize)
      return props.bubbleSize(value)
    if (vmax <= 0)
      return props.minRadius
    const t = Math.sqrt(Math.max(0, value) / vmax)
    return props.minRadius + t * (props.maxRadius - props.minRadius)
  }

  const result: Bubble[] = []
  props.data.forEach((row, index) => {
    const point = base.project(
      resolveAccessor<T, number>(row, props.lng),
      resolveAccessor<T, number>(row, props.lat),
    )
    if (!point)
      return
    const value = values[index] as number
    result.push({
      key: index,
      row,
      cx: point[0],
      cy: point[1],
      r: radiusFor(value),
      fill: props.bubbleColor !== undefined
        ? resolveStyle(row, props.bubbleColor)
        : 'var(--tx-chart-categorical-1, #4290F0)',
      stroke: resolveStyle(row, props.bubbleBorderColor),
      strokeWidth: resolveStyle(row, props.bubbleBorderWidth),
      name: props.name !== undefined ? resolveAccessor<T, string>(row, props.name) : undefined,
      value,
    })
  })
  return result
})

// shallowRef: a deep ref would unwrap the generic row type (UnwrapRef<T> ≠ T).
const hovered = shallowRef<Bubble | null>(null)
const tooltipEl = ref<HTMLElement | null>(null)

// kumo renders bubbles as a scatter series, so they animate in on first render
// (ECharts `animationDuration` 1000ms, `cubicInOut`) and stop above the
// `animationThreshold` of 2000 graphic items.
const enterProgress = useEnterProgress({
  enabled: () => props.data.length <= ANIMATION_THRESHOLD,
})

// kumo bubble emphasis: the hovered bubble scales to 1.2 and its opacity rises
// to 1 (`itemStyle.opacity` 0.8 → 1) over `stateAnimation`.
const emphasisState = useMapEmphasis<number>()

const ENTER_OPACITY = 0.8
const EMPHASIS_SCALE = 1.2

/**
 * Bubble presentation as ECharts' prop interpolation: the enter animation
 * scales/opens every symbol, and the emphasised one blends from the base
 * opacity/scale to kumo's `emphasis` values. Geometry (cx/cy/r) stays
 * synchronous — kumo sets `animationDurationUpdate: 0` on maps.
 */
function bubbleStyle(bubble: Bubble): Record<string, string> {
  const enter = enterProgress.value
  const emphasis = emphasisState.activeKey.value === bubble.key
    ? emphasisState.progress.value
    : 0
  const opacity = ENTER_OPACITY + (1 - ENTER_OPACITY) * emphasis
  const scale = 1 + (EMPHASIS_SCALE - 1) * emphasis
  return {
    'fill-opacity': String(enter * opacity),
    'transform': `scale(${enter * scale})`,
  }
}

function onEnter(bubble: Bubble): void {
  if (base.dragging.value)
    return
  hovered.value = bubble
  emphasisState.enter(bubble.key)
  emit('bubbleHover', bubble.row)
}

function onLeave(): void {
  if (!hovered.value)
    return
  hovered.value = null
  emphasisState.leave()
  emit('bubbleHover', undefined)
}
</script>

<template>
  <div
    :ref="base.container"
    class="tx-map tx-map--bubble"
    :class="{ 'is-roam': props.roam, 'is-dragging': base.dragging.value }"
    :style="base.rootStyle.value"
    v-bind="base.rootAttrs.value"
    @wheel="base.onWheel"
    @pointerdown="base.onPointerDown"
    @pointermove="base.onPointerMove"
    @pointerup="base.onPointerUp"
    @pointercancel="base.onPointerCancel"
    @lostpointercapture="base.onLostPointerCapture"
    @keydown="base.onKeyDown"
    @dblclick="base.onDblClick"
    @click.capture="base.onClickCapture"
  >
    <span v-if="props.roam" :id="base.instructionsId" class="tx-map__instructions">{{ base.labels.value.instructions }}</span>
    <svg
      v-if="base.ready.value"
      class="tx-map__svg"
      :viewBox="`0 0 ${base.width.value} ${base.height.value}`"
    >
      <g :transform="base.transform.value">
        <path
          v-if="base.graticulePath.value"
          class="tx-map__graticule"
          :d="base.graticulePath.value"
          :stroke-width="0.5 / base.scaleFactor.value"
          aria-hidden="true"
        />
        <!-- kumo's geo layer sets `emphasis: { disabled: true }`: land never reacts. -->
        <path
          class="tx-map__land"
          :d="base.landPath.value"
          :stroke-width="0.5 / base.scaleFactor.value"
        />
        <circle
          v-for="bubble in bubbles"
          :key="bubble.key"
          class="tx-map__bubble"
          :cx="bubble.cx"
          :cy="bubble.cy"
          :r="bubble.r / base.scaleFactor.value"
          :fill="bubble.fill"
          :stroke="bubble.stroke"
          :stroke-width="bubble.strokeWidth / base.scaleFactor.value"
          :style="bubbleStyle(bubble)"
          @pointerenter="onEnter(bubble)"
          @pointerleave="onLeave"
          @click="emit('bubbleClick', bubble.row)"
        />
      </g>
    </svg>

    <div
      v-if="props.roam && base.ready.value"
      class="tx-map__controls"
      @pointerdown.stop
      @dblclick.stop
      @click.stop
    >
      <button
        type="button"
        class="tx-map__control-btn"
        aria-label="Zoom in"
        :disabled="!base.canZoomIn.value"
        @click="base.zoomIn"
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>
      <button
        type="button"
        class="tx-map__control-btn"
        aria-label="Zoom out"
        :disabled="!base.canZoomOut.value"
        @click="base.zoomOut"
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>
      <button
        v-if="base.isTransformed.value"
        type="button"
        class="tx-map__control-btn"
        aria-label="Reset view"
        @click="base.resetView"
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M4.5 6.5A4 4 0 1 1 5.2 11M4.5 3.5v3h3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>

    <div
      v-if="props.showTooltip && hovered"
      ref="tooltipEl"
      class="tx-map__tooltip"
      :style="base.tooltipStyle(tooltipEl)"
      role="presentation"
    >
      <slot name="tooltip" :row="hovered.row">
        <strong v-if="hovered.name">{{ hovered.name }}</strong>
        <span class="tx-map__tooltip-value">{{ props.valueFormat(hovered.value) }}</span>
      </slot>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use './map-shared';
</style>
