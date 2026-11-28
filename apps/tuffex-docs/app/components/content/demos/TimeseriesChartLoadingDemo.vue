<script setup lang="ts">
import type { TimeseriesData } from '@talex-touch/tuffex/charts'
import { TxTimeseriesChart } from '@talex-touch/tuffex/charts'
import { computed, onBeforeUnmount, ref } from 'vue'
import { chartTimeFormats, TIMESERIES_ZH_LABELS } from './chart-demo-locale'

const loading = ref(true)
const type = ref<'line' | 'bar'>('line')

const start = Date.UTC(2026, 7, 30)
const hour = 3_600_000

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? { requests: '请求', labels: TIMESERIES_ZH_LABELS }
  : { requests: 'Requests', labels: undefined })
const time = computed(() => chartTimeFormats(locale.value))

const requests = Array.from({ length: 24 }, (_, i): [number, number] => [start + i * hour, 200 + (i % 5) * 40])
const data = computed<TimeseriesData[]>(() => [{ name: copy.value.requests, data: requests }])

// Loop the loading state so both skeleton variants stay visible.
const timer = setInterval(() => {
  loading.value = !loading.value
  if (loading.value)
    type.value = type.value === 'line' ? 'bar' : 'line'
}, 2600)
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <TxTimeseriesChart
    :data="data"
    :type="type"
    :loading="loading"
    :height="240"
    :x-axis-tick-format="time.tick"
    :timestamp-format="time.stamp"
    :labels="copy.labels"
  />
</template>
