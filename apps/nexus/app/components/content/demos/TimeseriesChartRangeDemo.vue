<script setup lang="ts">
import type { TimeseriesData } from '@talex-touch/tuffex-charts'
import { TxTimeseriesChart } from '@talex-touch/tuffex-charts'
import { ref } from 'vue'

const start = Date.UTC(2026, 7, 30)
const halfHour = 1_800_000

const data: TimeseriesData[] = [{
  name: 'Requests',
  data: Array.from({ length: 48 }, (_, i) => [
    start + i * halfHour,
    Math.round(300 + 120 * Math.sin(i / 5)),
  ]),
}]

const range = ref<[number, number] | null>(null)

function onRange(from: number, to: number): void {
  range.value = [from, to]
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="ts-range-demo">
    <TxTimeseriesChart :data="data" :height="260" @time-range-change="onRange" />
    <p class="ts-range-demo__readout">
      {{ range ? `${fmt(range[0])} → ${fmt(range[1])}` : 'Drag horizontally on the plot to select a range.' }}
    </p>
  </div>
</template>

<style scoped>
.ts-range-demo {
  width: 100%;
}

.ts-range-demo__readout {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--tx-chart-text-primary, #6b7280);
  font-variant-numeric: tabular-nums;
}
</style>
