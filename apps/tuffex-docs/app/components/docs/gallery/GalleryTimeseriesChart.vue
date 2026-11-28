<script setup lang="ts">
import type { TimeseriesData } from '@talex-touch/tuffex/charts'
import { TxTimeseriesChart } from '@talex-touch/tuffex/charts'
import { computed } from 'vue'
import { chartTimeFormats, TIMESERIES_ZH_LABELS } from '../../content/demos/chart-demo-locale'

const DAY = 86_400_000
const start = Date.UTC(2026, 1, 9)
const samples = [
  Array.from({ length: 7 }, (_, i) => [start + i * DAY, 420 + (i % 3) * 80] as [number, number]),
  Array.from({ length: 7 }, (_, i) => [start + i * DAY, 40 + (i % 4) * 18] as [number, number]),
]

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? { names: ['安装', '错误'], labels: TIMESERIES_ZH_LABELS }
  : { names: ['Installs', 'Errors'], labels: undefined })
const time = computed(() => chartTimeFormats(locale.value))
const data = computed<TimeseriesData[]>(() => copy.value.names.map((name, index) => ({ name, data: samples[index]! })))

function compactDateTick(ms: number): string {
  const date = new Date(ms)
  const hours = date.getHours()
  const minutes = date.getMinutes()
  if (hours !== 0 || minutes !== 0)
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  return `${date.getMonth() + 1}/${date.getDate()}`
}
</script>

<template>
  <div class="docs-gallery__block">
    <TxTimeseriesChart
      type="bar"
      :data="data"
      :height="168"
      :x-axis-tick-count="4"
      :x-axis-tick-format="compactDateTick"
      :timestamp-format="time.stamp"
      :labels="copy.labels"
    />
  </div>
</template>
