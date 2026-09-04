<script setup lang="ts">
import type { TimeseriesData } from '@talex-touch/tuffex-charts'
import { ChartPalette, TxChartLegendItem, TxTimeseriesChart } from '@talex-touch/tuffex-charts'
import { ref } from 'vue'

const start = Date.UTC(2026, 7, 30)
const hour = 3_600_000

const names = ['Requests', 'Cache hits', 'Errors']
const data: TimeseriesData[] = names.map((name, s) => ({
  name,
  data: Array.from({ length: 24 }, (_, i) => [
    start + i * hour,
    Math.round((3 - s) * 120 + 60 * Math.sin(i / 3 + s)),
  ]),
}))

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
        v-for="(name, index) in names"
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
