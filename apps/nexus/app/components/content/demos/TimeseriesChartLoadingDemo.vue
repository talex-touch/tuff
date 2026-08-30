<script setup lang="ts">
import type { TimeseriesData } from '@talex-touch/tuffex-charts'
import { TxTimeseriesChart } from '@talex-touch/tuffex-charts'
import { onBeforeUnmount, ref } from 'vue'

const loading = ref(true)
const type = ref<'line' | 'bar'>('line')

const start = Date.UTC(2026, 7, 30)
const hour = 3_600_000
const data: TimeseriesData[] = [{
  name: 'Requests',
  data: Array.from({ length: 24 }, (_, i) => [start + i * hour, 200 + (i % 5) * 40]),
}]

// Loop the loading state so both skeleton variants stay visible.
const timer = setInterval(() => {
  loading.value = !loading.value
  if (loading.value)
    type.value = type.value === 'line' ? 'bar' : 'line'
}, 2600)
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <TxTimeseriesChart :data="data" :type="type" :loading="loading" :height="240" />
</template>
