<script setup lang="ts">
import type { TimeseriesData } from '@talex-touch/tuffex/charts'
import { TxTimeseriesChart } from '@talex-touch/tuffex/charts'

const start = Date.UTC(2026, 8, 1)
const hour = 3_600_000

const data: TimeseriesData[] = [{
  name: 'Retries',
  data: Array.from({ length: 8 }, (_, i) => [start + i * hour, (i % 3) + 1]),
}]

function formatHour(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <TxTimeseriesChart
    :data="data"
    :height="240"
    :y-axis-min-interval="1"
    :y-axis-tick-count="5"
    tooltip-footer="Sampled hourly · retries only"
    :x-axis-tick-format="formatHour"
  />
</template>
