<script setup lang="ts">
import { TxAxis, TxChart, TxChartGrid, TxChartTooltip, TxScatterSeries } from '@talex-touch/tuffex/charts'
import { computed } from 'vue'
import { CHART_ZH_LABELS } from './chart-demo-locale'

interface Point { x: number, y: number, size: number }

const points: Point[] = Array.from({ length: 40 }, (_, i) => ({
  x: (i * 37) % 100,
  y: ((i * 53) % 80) + 10,
  size: 2 + (i % 5),
}))

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? { cursor: (x: number) => `指针在 ${x}px 处`, labels: CHART_ZH_LABELS }
  : { cursor: (x: number) => `cursor at ${x}px`, labels: undefined })
</script>

<template>
  <TxChart :height="260" :labels="copy.labels">
    <TxChartGrid y />
    <TxAxis position="bottom" />
    <TxAxis position="left" />
    <TxScatterSeries :data="points" x="x" y="y" :r="(d: Point) => d.size" :fill-opacity="0.7" />
    <template #overlay>
      <TxChartTooltip follow="x" :fixed-y="8">
        <template #default="{ pointerX }">
          <span class="custom-tip">{{ copy.cursor(Math.round(pointerX)) }}</span>
        </template>
      </TxChartTooltip>
    </template>
  </TxChart>
</template>

<style scoped>
.custom-tip {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
</style>
