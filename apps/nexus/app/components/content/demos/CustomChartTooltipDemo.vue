<script setup lang="ts">
import { TxAxis, TxChart, TxChartTooltip, TxGrid, TxScatterSeries } from '@talex-touch/tuffex-charts'

interface Point { x: number, y: number, size: number }

const points: Point[] = Array.from({ length: 40 }, (_, i) => ({
  x: (i * 37) % 100,
  y: ((i * 53) % 80) + 10,
  size: 2 + (i % 5),
}))
</script>

<template>
  <TxChart :height="260">
    <TxGrid y />
    <TxAxis position="bottom" />
    <TxAxis position="left" />
    <TxScatterSeries :data="points" x="x" y="y" :r="(d: Point) => d.size" :fill-opacity="0.7" />
    <template #overlay>
      <TxChartTooltip follow="x" :fixed-y="8">
        <template #default="{ pointerX }">
          <span class="custom-tip">cursor at {{ Math.round(pointerX) }}px</span>
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
