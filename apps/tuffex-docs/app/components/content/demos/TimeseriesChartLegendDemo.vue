<script setup lang="ts">
import type { TimeseriesData } from '@talex-touch/tuffex/charts'
import { ChartPalette, TxChartLegendItem, TxTimeseriesChart } from '@talex-touch/tuffex/charts'
import { computed, ref } from 'vue'
import { chartTimeFormats, TIMESERIES_ZH_LABELS } from './chart-demo-locale'

const start = Date.UTC(2026, 7, 30)
const hour = 3_600_000

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? { names: ['请求', '缓存命中', '错误'], labels: TIMESERIES_ZH_LABELS }
  : { names: ['Requests', 'Cache hits', 'Errors'], labels: undefined })
const time = computed(() => chartTimeFormats(locale.value))

const series = Array.from({ length: 3 }, (_, s) => Array.from({ length: 24 }, (_, i): [number, number] => [
  start + i * hour,
  Math.round((3 - s) * 120 + 60 * Math.sin(i / 3 + s)),
]))
const data = computed<TimeseriesData[]>(() => copy.value.names.map((name, s) => ({ name, data: series[s]! })))

const hidden = ref<string[]>([])
const highlighted = ref<string | null>(null)

function toggle(name: string): void {
  hidden.value = hidden.value.includes(name)
    ? hidden.value.filter(n => n !== name)
    : [...hidden.value, name]
}
</script>

<template>
  <div class="ts-legend-demo">
    <div class="ts-legend-demo__legend">
      <TxChartLegendItem
        v-for="(name, index) in copy.names"
        :key="name"
        :name="name"
        :color="ChartPalette.categoricalVar(index)"
        value=""
        :inactive="hidden.includes(name)"
        @click="toggle(name)"
        @pointerenter="highlighted = name"
        @pointerleave="highlighted = null"
      />
    </div>
    <TxTimeseriesChart
      v-model:hidden-series="hidden"
      :data="data"
      :highlighted-series="highlighted"
      :height="260"
      :x-axis-tick-format="time.tick"
      :timestamp-format="time.stamp"
      :labels="copy.labels"
    />
  </div>
</template>

<style scoped>
.ts-legend-demo {
  width: 100%;
}

.ts-legend-demo__legend {
  display: flex;
  gap: 16px;
  margin-bottom: 4px;
}
</style>
