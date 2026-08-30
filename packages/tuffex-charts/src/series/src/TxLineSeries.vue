<script setup lang="ts" generic="T">
import type { LineSeriesProps } from './types'
import { line } from 'd3-shape'
import { computed } from 'vue'
import { xPosition } from '../../core/scales'
import { curveFactory } from './curves'
import { useCartesianSeries } from './use-series'

defineOptions({ name: 'TxLineSeries' })

const props = withDefaults(defineProps<LineSeriesProps<T>>(), {
  curve: 'linear',
  strokeWidth: 2,
  showSymbol: false,
  dashed: false,
})

const { ctx, color, points } = useCartesianSeries(props, { component: 'TxLineSeries' })

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

const path = computed(() => {
  const generator = line<{ px: number, py: number }>()
    .x(point => point.px)
    .y(point => point.py)
    .curve(curveFactory(props.curve))
  return generator(positioned.value) ?? ''
})
</script>

<template>
  <g class="tx-series tx-series--line" :clip-path="`url(#${ctx.clipId})`">
    <path
      v-if="path"
      class="tx-series__stroke"
      :d="path"
      fill="none"
      :stroke="color"
      :stroke-width="props.strokeWidth"
      :stroke-dasharray="props.dashed ? '5 5' : undefined"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    <template v-if="props.showSymbol">
      <circle
        v-for="(point, index) in positioned"
        :key="index"
        class="tx-series__symbol"
        :cx="point.px"
        :cy="point.py"
        :r="props.strokeWidth + 1"
        :fill="color"
      />
    </template>
  </g>
</template>
