<script setup lang="ts">
import type { TreemapChartProps } from './options/treemap'
import { computed } from 'vue'
import TxEChart from './TxEChart.vue'
import { buildTreemapChartOption } from './options/treemap'
import { mergeChartOption } from './core/shared'

defineOptions({ name: 'TxTreemapChart' })

const props = withDefaults(defineProps<TreemapChartProps>(), {
  maxDepth: undefined,
  showBreadcrumb: false,
  showLabel: true,
  unit: undefined,
  roam: false,
  option: undefined,
  height: 320,
  theme: 'auto',
  ariaLabel: undefined,
  loading: false,
})

const chartOption = computed(() => mergeChartOption(buildTreemapChartOption(props), props.option))
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
