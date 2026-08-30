<script setup lang="ts">
import type { TimeseriesData } from '@talex-touch/tuffex-charts'
import { TxTimeseriesChart } from '@talex-touch/tuffex-charts'

const start = Date.UTC(2026, 7, 24)
const day = 86_400_000

const data: TimeseriesData[] = [
  { name: 'Success', data: Array.from({ length: 7 }, (_, i) => [start + i * day, 420 + (i % 3) * 80]) },
  { name: 'Client error', data: Array.from({ length: 7 }, (_, i) => [start + i * day, 40 + (i % 4) * 18]) },
  { name: 'Server error', data: Array.from({ length: 7 }, (_, i) => [start + i * day, 8 + (i % 2) * 10]) },
]

function formatDay(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short' })
}
</script>

<template>
  <TxTimeseriesChart type="bar" :data="data" :height="280" :x-axis-tick-format="formatDay" />
</template>
