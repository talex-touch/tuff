<script setup lang="ts">
import type { TimeseriesData } from '@talex-touch/tuffex/charts'
import { TxTimeseriesChart } from '@talex-touch/tuffex/charts'
import { computed, ref } from 'vue'
import { chartTimeFormats, TIMESERIES_ZH_LABELS } from './chart-demo-locale'

const start = Date.UTC(2026, 7, 30)
const halfHour = 1_800_000

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? { requests: '请求', hint: '在图上横向拖拽，选出一段时间。', labels: TIMESERIES_ZH_LABELS }
  : { requests: 'Requests', hint: 'Drag horizontally on the plot to select a range.', labels: undefined })
const time = computed(() => chartTimeFormats(locale.value))

const requests = Array.from({ length: 48 }, (_, i): [number, number] => [
  start + i * halfHour,
  Math.round(300 + 120 * Math.sin(i / 5)),
])
const data = computed<TimeseriesData[]>(() => [{ name: copy.value.requests, data: requests }])

const range = ref<[number, number] | null>(null)

function onRange(from: number, to: number): void {
  range.value = [from, to]
}
</script>

<template>
  <div class="ts-range-demo">
    <TxTimeseriesChart
      :data="data"
      :height="260"
      :x-axis-tick-format="time.tick"
      :timestamp-format="time.stamp"
      :labels="copy.labels"
      @time-range-change="onRange"
    />
    <p class="ts-range-demo__readout">
      {{ range ? `${time.clock(range[0])} → ${time.clock(range[1])}` : copy.hint }}
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
