<script setup lang="ts">
import type { TimeseriesData, TimeseriesMarker, TimeseriesThreshold } from '@talex-touch/tuffex/charts'
import { ChartPalette, TxTimeseriesChart } from '@talex-touch/tuffex/charts'
import { computed } from 'vue'
import { chartTimeFormats, TIMESERIES_ZH_LABELS } from './chart-demo-locale'

const start = Date.UTC(2026, 7, 30)
const hour = 3_600_000

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? {
      latency: 'p95 延迟',
      deploy: '部署 v2.4',
      rollout: '放量到 50% 流量。',
      config: '配置变更',
      ttl: '调低了缓存 TTL。',
      alert: '告警触发',
      cluster: (count: number) => `${count} 项变更`,
      labels: TIMESERIES_ZH_LABELS,
    }
  : {
      latency: 'Latency p95',
      deploy: 'Deploy v2.4',
      rollout: 'Rollout to 50% of traffic.',
      config: 'Config change',
      ttl: 'Cache TTL lowered.',
      alert: 'Alert fired',
      cluster: undefined,
      labels: undefined,
    })
const time = computed(() => chartTimeFormats(locale.value))

const latency = Array.from({ length: 24 }, (_, i): [number, number] => [
  start + i * hour,
  Math.round(180 + 60 * Math.sin(i / 3) + (i > 14 ? 90 : 0)),
])
const data = computed<TimeseriesData[]>(() => [{ name: copy.value.latency, data: latency }])

const markers = computed<TimeseriesMarker[]>(() => [
  { timestamp: start + 6 * hour, label: copy.value.deploy, description: copy.value.rollout },
  { timestamp: start + 15 * hour, label: copy.value.config, description: copy.value.ttl },
  { timestamp: start + 15.4 * hour, label: copy.value.alert },
])

const thresholds: TimeseriesThreshold[] = [
  { value: 300, label: 'SLO 300ms', color: ChartPalette.semantic('Attention') },
]
</script>

<template>
  <TxTimeseriesChart
    :data="data"
    :markers="markers"
    :thresholds="thresholds"
    :height="280"
    :tooltip-value-format="(value: number) => `${value} ms`"
    :cluster-label="copy.cluster"
    :x-axis-tick-format="time.tick"
    :timestamp-format="time.stamp"
    :labels="copy.labels"
  />
</template>
