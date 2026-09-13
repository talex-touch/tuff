<script setup lang="ts">
import type { BarChartProps } from './options/bar'
import { computed } from 'vue'
import TxEChart from './TxEChart.vue'
import { buildBarChartOption } from './options/bar'
import { mergeChartOption } from './core/shared'

defineOptions({ name: 'TxBarChart' })

const props = withDefaults(defineProps<BarChartProps>(), {
  categories: undefined,
  xAxisName: undefined,
  yAxisName: undefined,
  showLegend: undefined,
  grid: true,
  stacked: false,
  horizontal: false,
  barWidth: undefined,
  showLabel: false,
  option: undefined,
  height: 320,
  theme: 'auto',
  ariaLabel: undefined,
  loading: false,
})

const chartOption = computed(() => mergeChartOption(buildBarChartOption(props), props.option))
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
