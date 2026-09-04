<script setup lang="ts" generic="T">
import type { ArcSeriesProps, ArcSliceDatum } from './types'
import { arc, pie } from 'd3-shape'
import { computed } from 'vue'
import { resolveNumber, resolveString } from '../../core/accessor'
import { useChartContext } from '../../core/context'
import { ChartPalette } from '../../palette'

defineOptions({ name: 'TxArcSeries' })

const props = withDefaults(defineProps<ArcSeriesProps<T>>(), {
  innerRadius: 0.6,
  padAngle: 0.015,
  cornerRadius: 2,
})

const emit = defineEmits<{
  /** A slice was clicked. */
  sliceClick: [slice: ArcSliceDatum<T>]
}>()

const ctx = useChartContext('TxArcSeries')

const center = computed(() => {
  const plot = ctx.plot.value
  return { x: plot.x + plot.width / 2, y: plot.y + plot.height / 2 }
})

const outerRadius = computed(() => {
  const plot = ctx.plot.value
  return Math.max(0, Math.min(plot.width, plot.height) / 2)
})

interface Slice {
  key: number
  path: string
  fill: string
  slice: ArcSliceDatum<T>
}

const slices = computed<Slice[]>(() => {
  const radius = outerRadius.value
  if (radius <= 0 || props.data.length === 0)
    return []

  const values = props.data.map((datum, index) => resolveNumber(datum, index, props.value))
  const layout = pie<number>().sort(null).padAngle(props.padAngle)(values)
  const generator = arc<(typeof layout)[number]>()
    .innerRadius(radius * props.innerRadius)
    .outerRadius(radius)
    .cornerRadius(props.cornerRadius)

  return layout.map((segment) => {
    const index = segment.index
    const datum = props.data[index] as T
    return {
      key: index,
      path: generator(segment) ?? '',
      fill: props.color !== undefined
        ? resolveString(datum, index, props.color)
        : ChartPalette.categoricalVar(index),
      slice: {
        datum,
        index,
        name: props.name !== undefined ? resolveString(datum, index, props.name) : undefined,
        value: segment.value,
      },
    }
  })
})
</script>

<template>
  <g
    class="tx-series tx-series--arc"
    :transform="`translate(${center.x}, ${center.y})`"
  >
    <path
      v-for="slice in slices"
      :key="slice.key"
      class="tx-series__slice"
      :d="slice.path"
      :fill="slice.fill"
      @click="emit('sliceClick', slice.slice)"
    />
  </g>
</template>
