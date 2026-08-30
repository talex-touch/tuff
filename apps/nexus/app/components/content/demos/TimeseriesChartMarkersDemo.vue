<script setup lang="ts">
import type { TimeseriesData, TimeseriesMarker, TimeseriesThreshold } from '@talex-touch/tuffex-charts'
import { ChartPalette, TxTimeseriesChart } from '@talex-touch/tuffex-charts'

const start = Date.UTC(2026, 7, 30)
const hour = 3_600_000

const data: TimeseriesData[] = [{
  name: 'Latency p95',
  data: Array.from({ length: 24 }, (_, i) => [
    start + i * hour,
    Math.round(180 + 60 * Math.sin(i / 3) + (i > 14 ? 90 : 0)),
  ]),
}]

const markers: TimeseriesMarker[] = [
  { timestamp: start + 6 * hour, label: 'Deploy v2.4', description: 'Rollout to 50% of traffic.' },
  { timestamp: start + 15 * hour, label: 'Config change', description: 'Cache TTL lowered.' },
  { timestamp: start + 15.4 * hour, label: 'Alert fired' },
]

const thresholds: TimeseriesThreshold[] = [
  { value: 300, label: 'SLO 300ms', color: ChartPalette.semantic('Attention') },
]
</script>

<template>
  <TxTimeseriesChart
    :data="data"
    :markers="markers"
    :thresholds="thresholds"
    :height="280"
    :tooltip-value-format="(value: number) => `${value} ms`"
  />
</template>
