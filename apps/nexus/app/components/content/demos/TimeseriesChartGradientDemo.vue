<script setup lang="ts">
import type { TimeseriesData } from '@talex-touch/tuffex/charts'
import { TxTimeseriesChart } from '@talex-touch/tuffex/charts'
import { computed } from 'vue'
import { chartTimeFormats, TIMESERIES_ZH_LABELS } from './chart-demo-locale'

const start = Date.UTC(2026, 7, 30)
const hour = 3_600_000

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? { throughput: '吞吐量', labels: TIMESERIES_ZH_LABELS }
  : { throughput: 'Throughput', labels: undefined })
const time = computed(() => chartTimeFormats(locale.value))

const throughput = Array.from({ length: 24 }, (_, i): [number, number] => [
  start + i * hour,
  Math.round(500 + 180 * Math.sin(i / 4) + 60 * Math.sin(i / 1.5)),
])
const data = computed<TimeseriesData[]>(() => [{ name: copy.value.throughput, data: throughput }])

// Points outside [before, after] render dashed: they cover incomplete periods.
const incomplete = { before: start + 3 * hour, after: start + 20 * hour }
</script>

<template>
  <TxTimeseriesChart
    :data="data"
    gradient
    :incomplete="incomplete"
    :height="280"
    :x-axis-tick-format="time.tick"
    :timestamp-format="time.stamp"
    :labels="copy.labels"
  />
</template>
