<script setup lang="ts">
import type { TimeseriesData } from '@talex-touch/tuffex/charts'
import { TxTimeseriesChart } from '@talex-touch/tuffex/charts'
import { computed } from 'vue'
import { chartTimeFormats, TIMESERIES_ZH_LABELS } from './chart-demo-locale'

const start = Date.UTC(2026, 7, 24)
const day = 86_400_000

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? { names: ['成功', '客户端错误', '服务端错误'], labels: TIMESERIES_ZH_LABELS }
  : { names: ['Success', 'Client error', 'Server error'], labels: undefined })
const time = computed(() => chartTimeFormats(locale.value))

const series = [
  Array.from({ length: 7 }, (_, i): [number, number] => [start + i * day, 420 + (i % 3) * 80]),
  Array.from({ length: 7 }, (_, i): [number, number] => [start + i * day, 40 + (i % 4) * 18]),
  Array.from({ length: 7 }, (_, i): [number, number] => [start + i * day, 8 + (i % 2) * 10]),
]
const data = computed<TimeseriesData[]>(() => copy.value.names.map((name, s) => ({ name, data: series[s]! })))

function formatDay(ts: number): string {
  return new Date(ts).toLocaleDateString(locale.value, { weekday: 'short' })
}
</script>

<template>
  <TxTimeseriesChart
    type="bar"
    :data="data"
    :height="280"
    :x-axis-tick-format="formatDay"
    :timestamp-format="time.stamp"
    :labels="copy.labels"
  />
</template>
