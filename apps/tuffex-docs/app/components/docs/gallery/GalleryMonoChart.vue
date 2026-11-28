<script setup lang="ts">
import type { MonoChartData, MonoChartSeriesMode } from '@talex-touch/tuffex/charts/src/mono-chart'
import { TxMonoChart } from '@talex-touch/tuffex/charts/src/mono-chart'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const monoMode = ref<MonoChartSeriesMode>('single')

const copy = computed(() => locale.value === 'zh'
  ? {
      chart: '每周输出',
      series: '输出',
      target: '目标',
      weeks: ['第1周', '第2周', '第3周', '第4周', '第5周'],
      single: '单序列',
      dual: '双序列',
      col: '列',
      row: '行',
      monotone: '单调曲线',
      natural: '自然曲线',
      showLine: '显示线条',
      hideLine: '隐藏线条',
      empty: '暂无数据',
    }
  : {
      chart: 'Weekly output',
      series: 'Output',
      target: 'Target',
      weeks: ['W1', 'W2', 'W3', 'W4', 'W5'],
      single: 'Single series',
      dual: 'Dual series',
      col: 'Column',
      row: 'Row',
      monotone: 'Monotone',
      natural: 'Natural',
      showLine: 'Show line',
      hideLine: 'Hide line',
      empty: 'No data',
    })

const monoData = computed<MonoChartData>(() => ({
  categories: copy.value.weeks,
  series: [
    { id: 'output', name: copy.value.series, data: [24, 48, 36, 62, 55].map((value, index) => ({ x: copy.value.weeks[index]!, value })) },
    { id: 'target', name: copy.value.target, data: [36, 40, 44, 48, 52].map((value, index) => ({ x: copy.value.weeks[index]!, value })) },
  ],
}))
</script>

<template>
  <div class="gallery-mono-chart">
    <TxMonoChart
      v-model:series-mode="monoMode"
      variant="mono-rounded-line"
      :data="monoData"
      :width="320"
      :height="168"
      compact
      :title="copy.chart"
      :aria-label="copy.chart"
      :labels="{
        single: copy.single,
        dual: copy.dual,
        col: copy.col,
        row: copy.row,
        monotone: copy.monotone,
        natural: copy.natural,
        showLine: copy.showLine,
        hideLine: copy.hideLine,
        empty: copy.empty,
      }"
    />
  </div>
</template>

<style scoped>
.gallery-mono-chart {
  display: flex;
  justify-content: center;
  width: 100%;
}
</style>
