<script setup lang="ts" generic="T">
import type { ScatterSeriesProps } from './types'
import { computed } from 'vue'
import { resolveNumber } from '../../core/accessor'
import { xPosition } from '../../core/scales'
import { useCartesianSeries } from './use-series'

defineOptions({ name: 'TxScatterSeries' })

const props = withDefaults(defineProps<ScatterSeriesProps<T>>(), {
  r: 3,
  fillOpacity: 0.9,
})

const { ctx, color, points } = useCartesianSeries(props, { component: 'TxScatterSeries' })

const dots = computed(() => {
  const xs = ctx.xScale.value
  const ys = ctx.yScale.value
  if (!xs || !ys)
    return []
  return points.value.map((point) => {
    const datum = props.data[point.index] as T
    return {
      key: point.index,
      cx: xPosition(xs, point.x),
      cy: ys(point.y),
      r: typeof props.r === 'number' ? props.r : resolveNumber(datum, point.index, props.r),
    }
  })
})
</script>

<template>
  <g class="tx-series tx-series--scatter" :clip-path="`url(#${ctx.clipId})`">
    <circle
      v-for="dot in dots"
      :key="dot.key"
      class="tx-series__dot"
      :cx="dot.cx"
      :cy="dot.cy"
      :r="dot.r"
      :fill="color"
      :fill-opacity="props.fillOpacity"
    />
  </g>
</template>
