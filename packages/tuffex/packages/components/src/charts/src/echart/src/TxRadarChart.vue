<script setup lang="ts">
import type { RadarChartProps } from './options/radar'
import { computed } from 'vue'
import TxEChart from './TxEChart.vue'
import { buildRadarChartOption } from './options/radar'
import { mergeChartOption } from './core/shared'

defineOptions({ name: 'TxRadarChart' })

const props = withDefaults(defineProps<RadarChartProps>(), {
  shape: 'polygon',
  splitNumber: 4,
  showLegend: undefined,
  showAxisName: true,
  option: undefined,
  height: 320,
  theme: 'auto',
  ariaLabel: undefined,
  loading: false,
})

const chartOption = computed(() => mergeChartOption(buildRadarChartOption(props), props.option))
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
