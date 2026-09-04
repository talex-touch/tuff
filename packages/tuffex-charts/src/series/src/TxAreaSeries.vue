<script setup lang="ts" generic="T">
import type { AreaSeriesProps } from './types'
import { area, line } from 'd3-shape'
import { computed } from 'vue'
import { xPosition } from '../../core/scales'
import { curveFactory } from './curves'
import { nextSeriesUid, useCartesianSeries } from './use-series'

defineOptions({ name: 'TxAreaSeries' })

const props = withDefaults(defineProps<AreaSeriesProps<T>>(), {
  curve: 'linear',
  strokeWidth: 2,
  gradient: true,
  fillOpacity: 0.2,
})

const { ctx, color, points } = useCartesianSeries(props, { component: 'TxAreaSeries' })

const gradientId = `tx-area-gradient-${nextSeriesUid()}`

const positioned = computed(() => {
  const xs = ctx.xScale.value
  const ys = ctx.yScale.value
  if (!xs || !ys)
    return []
  return points.value.map(point => ({
    px: xPosition(xs, point.x),
    py: ys(point.y),
  }))
})

// Area drops to the zero line when zero is inside the y domain, otherwise to
// the nearest domain edge — never outside the plot.
const baselineY = computed(() => {
  const ys = ctx.yScale.value
  if (!ys)
    return 0
  const [lo, hi] = ys.domain() as [number, number]
  return ys(Math.min(Math.max(0, lo), hi))
})

const areaPath = computed(() => {
  const generator = area<{ px: number, py: number }>()
    .x(point => point.px)
    .y0(baselineY.value)
    .y1(point => point.py)
    .curve(curveFactory(props.curve))
  return generator(positioned.value) ?? ''
})

const linePath = computed(() => {
  if (props.strokeWidth <= 0)
    return ''
  const generator = line<{ px: number, py: number }>()
    .x(point => point.px)
    .y(point => point.py)
    .curve(curveFactory(props.curve))
  return generator(positioned.value) ?? ''
})
</script>

<template>
  <g class="tx-series tx-series--area" :clip-path="`url(#${ctx.clipId})`">
    <defs v-if="props.gradient">
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="color" stop-opacity="0.4" />
        <stop offset="100%" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path
      v-if="areaPath"
      class="tx-series__fill"
      :d="areaPath"
      :fill="props.gradient ? `url(#${gradientId})` : color"
      :fill-opacity="props.gradient ? undefined : props.fillOpacity"
      stroke="none"
    />
    <path
      v-if="linePath"
      class="tx-series__stroke"
      :d="linePath"
      fill="none"
      :stroke="color"
      :stroke-width="props.strokeWidth"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
  </g>
</template>
