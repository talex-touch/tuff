<script setup lang="ts">
import type { PieChartProps } from './options/pie'
import { computed } from 'vue'
import TxEChart from './TxEChart.vue'
import { buildPieChartOption } from './options/pie'
import { mergeChartOption } from './core/shared'

defineOptions({ name: 'TxPieChart' })

const props = withDefaults(defineProps<PieChartProps>(), {
  donut: false,
  roseType: false,
  showLegend: true,
  labelPosition: 'outside',
  centerLabel: undefined,
  unit: undefined,
  option: undefined,
  height: 320,
  theme: 'auto',
  ariaLabel: undefined,
  loading: false,
})

const chartOption = computed(() => mergeChartOption(buildPieChartOption(props), props.option))
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
