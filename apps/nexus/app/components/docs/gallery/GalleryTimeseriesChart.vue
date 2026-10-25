<script setup lang="ts">
import type { TimeseriesData } from '@talex-touch/tuffex/charts/src/timeseries'
import { TxTimeseriesChart } from '@talex-touch/tuffex/charts/src/timeseries'
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
</script>

<template>
  <div class="docs-gallery__block">
    <TxTimeseriesChart
      type="bar"
      :data="data"
      :height="150"
      :x-axis-tick-format="time.tick"
      :timestamp-format="time.stamp"
      :labels="copy.labels"
    />
  </div>
</template>
