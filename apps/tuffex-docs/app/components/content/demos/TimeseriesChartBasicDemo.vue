<script setup lang="ts">
import type { TimeseriesData } from '@talex-touch/tuffex/charts'
import { TxTimeseriesChart } from '@talex-touch/tuffex/charts'
import { computed } from 'vue'
import { chartTimeFormats, TIMESERIES_ZH_LABELS } from './chart-demo-locale'

const start = Date.UTC(2026, 7, 30)
const hour = 3_600_000

function wave(base: number, amp: number, phase: number): Array<[number, number]> {
  return Array.from({ length: 24 }, (_, i) => [
    start + i * hour,
    Math.round(base + amp * Math.sin(i / 3 + phase) + amp * 0.3 * Math.sin(i / 1.7)),
  ])
}

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? { requests: '请求', cacheHits: '缓存命中', time: '时间', count: '次数', unit: '请求/秒', labels: TIMESERIES_ZH_LABELS }
  : { requests: 'Requests', cacheHits: 'Cache hits', time: 'Time', count: 'Count', unit: 'req/s', labels: undefined })
const time = computed(() => chartTimeFormats(locale.value))

const requests = wave(320, 80, 0)
const cacheHits = wave(240, 60, 1.2)
const data = computed<TimeseriesData[]>(() => [
  { name: copy.value.requests, data: requests },
  { name: copy.value.cacheHits, data: cacheHits },
])
</script>

<template>
  <TxTimeseriesChart
    :data="data"
    :height="280"
    :x-axis-name="copy.time"
    :y-axis-name="copy.count"
    :x-axis-tick-format="time.clock"
    :tooltip-value-format="(value: number) => `${value} ${copy.unit}`"
    :timestamp-format="time.stamp"
    :labels="copy.labels"
  />
</template>
