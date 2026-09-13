<script setup lang="ts">
import type { GaugeChartProps } from './options/gauge'
import { computed } from 'vue'
import TxEChart from './TxEChart.vue'
import { buildGaugeChartOption } from './options/gauge'
import { mergeChartOption } from './core/shared'

defineOptions({ name: 'TxGaugeChart' })

const props = withDefaults(defineProps<GaugeChartProps>(), {
  min: 0,
  max: 100,
  name: undefined,
  unit: undefined,
  precision: 0,
  progress: false,
  segments: 5,
  color: undefined,
  option: undefined,
  height: 320,
  theme: 'auto',
  ariaLabel: undefined,
  loading: false,
})

const chartOption = computed(() => mergeChartOption(buildGaugeChartOption(props), props.option))
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
