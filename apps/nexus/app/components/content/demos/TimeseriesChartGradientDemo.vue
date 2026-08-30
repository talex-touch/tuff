<script setup lang="ts">
import type { TimeseriesData } from '@talex-touch/tuffex-charts'
import { TxTimeseriesChart } from '@talex-touch/tuffex-charts'

const start = Date.UTC(2026, 7, 30)
const hour = 3_600_000

const data: TimeseriesData[] = [{
  name: 'Throughput',
  data: Array.from({ length: 24 }, (_, i) => [
    start + i * hour,
    Math.round(500 + 180 * Math.sin(i / 4) + 60 * Math.sin(i / 1.5)),
  ]),
}]

// Points outside [before, after] render dashed: they cover incomplete periods.
const incomplete = { before: start + 3 * hour, after: start + 20 * hour }
</script>

<template>
  <TxTimeseriesChart :data="data" gradient :incomplete="incomplete" :height="280" />
</template>
