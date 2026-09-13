<script setup lang="ts">
import type { ScatterChartProps } from './options/scatter'
import { computed } from 'vue'
import TxEChart from './TxEChart.vue'
import { buildScatterChartOption } from './options/scatter'
import { mergeChartOption } from './core/shared'

defineOptions({ name: 'TxScatterChart' })

const props = withDefaults(defineProps<ScatterChartProps>(), {
  xAxisName: undefined,
  yAxisName: undefined,
  symbolSize: 8,
  showLegend: undefined,
  grid: true,
  xMin: undefined,
  xMax: undefined,
  yMin: undefined,
  yMax: undefined,
  option: undefined,
  height: 320,
  theme: 'auto',
  ariaLabel: undefined,
  loading: false,
})

const chartOption = computed(() => mergeChartOption(buildScatterChartOption(props), props.option))
</script>

<template>
  <TxEChart
    :option="chartOption"
    :height="height"
    :theme="theme"
    :aria-label="ariaLabel"
    :loading="loading"
  />
</template>
