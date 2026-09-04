<script setup lang="ts" generic="T">
// API surface modeled on Cloudflare kumo's BubbleMap (MIT); d3-geo + SVG.
// Bubble area is proportional to value (sqrt radius between min/maxRadius).

import type { BubbleMapProps } from './types'
import { computed, ref, shallowRef } from 'vue'
import { resolveAccessor, resolveStyle } from './accessor'
import { useMapBase } from './use-map-base'

defineOptions({ name: 'TxBubbleMap' })

const props = withDefaults(defineProps<BubbleMapProps<T>>(), {
  zoom: 1.25,
  roam: false,
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

const base = useMapBase(props)
const container = base.container

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

function onEnter(bubble: Bubble): void {
  hovered.value = bubble
  emit('bubbleHover', bubble.row)
}

function onLeave(): void {
  hovered.value = null
  emit('bubbleHover', undefined)
}
</script>

<template>
  <div
    ref="container"
    class="tx-map tx-map--bubble"
    :style="base.rootStyle.value"
    @wheel="base.onWheel"
    @pointerdown="base.onPointerDown"
    @pointermove="base.onPointerMove"
    @pointerup="base.onPointerUp"
  >
    <svg
      v-if="base.ready.value"
      class="tx-map__svg"
      :viewBox="`0 0 ${base.width.value} ${base.height.value}`"
    >
      <g :transform="base.transform.value">
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
          @pointerenter="onEnter(bubble)"
          @pointerleave="onLeave"
          @click="emit('bubbleClick', bubble.row)"
        />
      </g>
    </svg>

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
