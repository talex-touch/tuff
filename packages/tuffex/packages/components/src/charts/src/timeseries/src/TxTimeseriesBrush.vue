<script setup lang="ts">
// Drag-to-select time range (lineX brush). Emits the inverted [from, to] and
// clears itself, mirroring kumo's brushend → onTimeRangeChange → clear flow.

import type { BrushRect } from './brush'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useChartContext } from '../../core/context'
import { isBandScale } from '../../core/scales'
import { brushRange, brushRect } from './brush'

defineOptions({ name: 'TxTimeseriesBrush' })

const emit = defineEmits<{
  range: [from: number, to: number]
}>()

const ctx = useChartContext('TxTimeseriesBrush')

/**
 * The live selection rectangle, shared with `TxTimeseriesChart` so the series
 * layer can dim out-of-brush data (ECharts `outOfBrush.colorAlpha`) while the
 * drag is in progress. `null` whenever no selection is active.
 */
const selection = defineModel<BrushRect | null>('selection', { default: null })

const dragStartX = ref<number | null>(null)
const dragCurrentX = ref<number | null>(null)

function toLocalX(event: PointerEvent): number {
  const container = ctx.container.value
  if (!container)
    return event.offsetX
  return event.clientX - container.getBoundingClientRect().left
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0)
    return
  dragStartX.value = toLocalX(event)
  dragCurrentX.value = dragStartX.value
  // Optional call: jsdom's Element has no pointer-capture API.
  ;(event.target as Element).setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (dragStartX.value === null)
    return
  dragCurrentX.value = toLocalX(event)
}

function onPointerUp(event: PointerEvent): void {
  const start = dragStartX.value
  dragStartX.value = null
  dragCurrentX.value = null
  if (start === null)
    return
  const scale = ctx.xScale.value
  if (!scale || isBandScale(scale))
    return
  const end = toLocalX(event)
  const range = brushRange(start, end, (px) => {
    const inverted = scale.invert(px)
    return inverted instanceof Date ? inverted.getTime() : inverted
  })
  if (range)
    emit('range', range[0], range[1])
}

const selectionRect = computed<BrushRect | null>(() => {
  if (dragStartX.value === null || dragCurrentX.value === null)
    return null
  const plot = ctx.plot.value
  const rect = brushRect(dragStartX.value, dragCurrentX.value, plot.x, plot.width)
  return rect.width > 0 ? rect : null
})

// Publishes the rect for the still-dragging frame too, so out-of-brush dimming
// is live during the drag (ECharts dims `outOfBrush` as soon as the brush area
// exists). Cleared on pointerup alongside the local drag state, matching kumo's
// brushend → `dispatchAction({ type: 'brush', areas: [] })`.
watch(selectionRect, rect => {
  selection.value = rect
}, { immediate: true })

// Unmounting mid-drag (the listener that enables the brush disappearing) must
// not leave the series layer masked.
onBeforeUnmount(() => {
  selection.value = null
})
</script>

<template>
  <g class="tx-ts-brush">
    <rect
      class="tx-ts-brush__capture"
      :x="ctx.plot.value.x"
      :y="ctx.plot.value.y"
      :width="ctx.plot.value.width"
      :height="ctx.plot.value.height"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
    />
    <rect
      v-if="selection"
      class="tx-ts-brush__selection"
      :x="selection.x"
      :y="ctx.plot.value.y"
      :width="selection.width"
      :height="ctx.plot.value.height"
    />
  </g>
</template>

<style lang="scss" scoped>
.tx-ts-brush {
  &__capture {
    fill: transparent;
    cursor: crosshair;
  }

  &__selection {
    // kumo brushStyle: `rgba(120,140,180,0.3)` fill, `rgba(120,140,180,0.8)`
    // border, `borderWidth: 1`.
    fill: rgba(120, 140, 180, 0.3);
    stroke: rgba(120, 140, 180, 0.8);
    stroke-width: 1;
    pointer-events: none;
  }
}
</style>
