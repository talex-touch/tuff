<script setup lang="ts">
import type { TimeseriesData } from '@talex-touch/tuffex-charts'
import { TxTimeseriesChart } from '@talex-touch/tuffex-charts'

const start = Date.UTC(2026, 7, 30)
const hour = 3_600_000

function wave(base: number, amp: number, phase: number): Array<[number, number]> {
  return Array.from({ length: 24 }, (_, i) => [
    start + i * hour,
    Math.round(base + amp * Math.sin(i / 3 + phase) + amp * 0.3 * Math.sin(i / 1.7)),
  ])
}

const data: TimeseriesData[] = [
  { name: 'Requests', data: wave(320, 80, 0) },
  { name: 'Cache hits', data: wave(240, 60, 1.2) },
]

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <TxTimeseriesChart
    :data="data"
    :height="280"
    x-axis-name="Time"
    y-axis-name="Count"
    :x-axis-tick-format="formatTime"
    :tooltip-value-format="(value: number) => `${value} req/s`"
  />
</template>
