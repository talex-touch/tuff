<script setup lang="ts">
import { ChartPalette, TxChartLegendItem } from '@talex-touch/tuffex-charts'
import { ref } from 'vue'

const inactive = ref(false)
</script>

<template>
  <div class="charts-legend-demo">
    <div class="charts-legend-demo__row">
      <TxChartLegendItem name="Requests" :color="ChartPalette.categoricalVar(0)" value="1,234" @click="inactive = !inactive" />
      <TxChartLegendItem name="Errors" :color="ChartPalette.categoricalVar(2)" value="87" :inactive="inactive" />
      <TxChartLegendItem loading />
    </div>
    <div class="charts-legend-demo__row">
      <TxChartLegendItem variant="large" name="Latency" :color="ChartPalette.categoricalVar(3)" value="42" unit="ms" />
      <TxChartLegendItem variant="large" name="Cache hit" :color="ChartPalette.categoricalVar(4)" value="96.4" unit="%" />
      <TxChartLegendItem variant="large" loading />
    </div>
  </div>
</template>

<style scoped>
.charts-legend-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.charts-legend-demo__row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
}
</style>
