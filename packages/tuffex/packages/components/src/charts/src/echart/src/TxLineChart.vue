<script setup lang="ts">
import type { LineChartProps } from './options/line'
import { computed } from 'vue'
import TxEChart from './TxEChart.vue'
import { buildLineChartOption } from './options/line'
import { mergeChartOption } from './core/shared'

defineOptions({ name: 'TxLineChart' })

const props = withDefaults(defineProps<LineChartProps>(), {
  categories: undefined,
  xAxisName: undefined,
  yAxisName: undefined,
  showLegend: undefined,
  grid: true,
  option: undefined,
  height: 320,
  theme: 'auto',
  ariaLabel: undefined,
  loading: false,
})

const chartOption = computed(() => mergeChartOption(buildLineChartOption(props), props.option))
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
