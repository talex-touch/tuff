<script setup lang="ts">
import type { HeatmapChartProps } from './options/heatmap'
import { computed } from 'vue'
import TxEChart from './TxEChart.vue'
import { buildHeatmapChartOption } from './options/heatmap'
import { mergeChartOption } from './core/shared'

defineOptions({ name: 'TxHeatmapChart' })

const props = withDefaults(defineProps<HeatmapChartProps>(), {
  xAxisName: undefined,
  yAxisName: undefined,
  visualMap: true,
  min: undefined,
  max: undefined,
  showLabel: false,
  unit: undefined,
  option: undefined,
  height: 320,
  theme: 'auto',
  ariaLabel: undefined,
  loading: false,
})

const chartOption = computed(() => mergeChartOption(buildHeatmapChartOption(props), props.option))
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
