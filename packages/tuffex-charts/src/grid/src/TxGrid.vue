<script setup lang="ts">
import type { GridProps } from './types'
import { computed } from 'vue'
import { useChartContext } from '../../core/context'
import { xPosition, xTickValues } from '../../core/scales'

defineOptions({ name: 'TxGrid' })

const props = withDefaults(defineProps<GridProps>(), {
  x: false,
  y: true,
  ticks: 5,
})

const ctx = useChartContext('TxGrid')

const yLines = computed<number[]>(() => {
  if (!props.y)
    return []
  const scale = ctx.yScale.value
  if (!scale)
    return []
  return scale.ticks(props.ticks).map(value => scale(value))
})

const xLines = computed<number[]>(() => {
  if (!props.x)
    return []
  const scale = ctx.xScale.value
  if (!scale)
    return []
  return xTickValues(scale, props.ticks)
    .map(value => xPosition(scale, value instanceof Date ? value.getTime() : value))
})
</script>

<template>
  <g class="tx-grid" aria-hidden="true">
    <line
      v-for="(y, index) in yLines"
      :key="`y-${index}`"
      class="tx-grid__line"
      :x1="ctx.plot.value.x"
      :y1="y"
      :x2="ctx.plot.value.x + ctx.plot.value.width"
      :y2="y"
    />
    <line
      v-for="(x, index) in xLines"
      :key="`x-${index}`"
      class="tx-grid__line"
      :x1="x"
      :y1="ctx.plot.value.y"
      :x2="x"
      :y2="ctx.plot.value.y + ctx.plot.value.height"
    />
  </g>
</template>

<style lang="scss" scoped>
.tx-grid__line {
  stroke: var(--tx-chart-grid-line, rgb(107 114 128 / 20%));
  stroke-width: 1;
  stroke-dasharray: 4 4;
}
</style>
