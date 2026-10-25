<script setup lang="ts">
import type { TimeseriesData } from '@talex-touch/tuffex/charts'
import { TxTimeseriesChart } from '@talex-touch/tuffex/charts'
import { computed } from 'vue'
import { chartTimeFormats, TIMESERIES_ZH_LABELS } from './chart-demo-locale'

const start = Date.UTC(2026, 8, 1)
const hour = 3_600_000

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? { retries: '重试', footer: '每小时采样 · 只计重试', labels: TIMESERIES_ZH_LABELS }
  : { retries: 'Retries', footer: 'Sampled hourly · retries only', labels: undefined })
const time = computed(() => chartTimeFormats(locale.value))

const retries = Array.from({ length: 8 }, (_, i): [number, number] => [start + i * hour, (i % 3) + 1])
const data = computed<TimeseriesData[]>(() => [{ name: copy.value.retries, data: retries }])
</script>

<template>
  <TxTimeseriesChart
    :data="data"
    :height="240"
    :y-axis-min-interval="1"
    :y-axis-tick-count="5"
    :tooltip-footer="copy.footer"
    :x-axis-tick-format="time.clock"
    :timestamp-format="time.stamp"
    :labels="copy.labels"
  />
</template>
