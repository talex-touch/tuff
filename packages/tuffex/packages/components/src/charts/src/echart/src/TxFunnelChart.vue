<script setup lang="ts">
import type { FunnelChartProps } from './options/funnel'
import { computed } from 'vue'
import TxEChart from './TxEChart.vue'
import { buildFunnelChartOption } from './options/funnel'
import { mergeChartOption } from './core/shared'

defineOptions({ name: 'TxFunnelChart' })

const props = withDefaults(defineProps<FunnelChartProps>(), {
  sort: 'descending',
  gap: 2,
  minSize: undefined,
  maxSize: undefined,
  labelPosition: 'inside',
  showLabel: true,
  showLegend: true,
  unit: undefined,
  option: undefined,
  height: 320,
  theme: 'auto',
  ariaLabel: undefined,
  loading: false,
})

const chartOption = computed(() => mergeChartOption(buildFunnelChartOption(props), props.option))
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
