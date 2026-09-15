<script setup lang="ts">
import { ChartPalette, TxChartLegendItem } from '@talex-touch/tuffex/charts'
import { ref } from 'vue'

const inactive = ref(false)
</script>

<template>
  <div class="charts-legend-items-demo">
    <TxChartLegendItem name="Requests" :color="ChartPalette.categoricalVar(0)" value="1,234" @click="inactive = !inactive" />
    <TxChartLegendItem name="Errors" :color="ChartPalette.categoricalVar(2)" value="87" :inactive="inactive" />
    <TxChartLegendItem loading />
  </div>
</template>

<style scoped>
.charts-legend-items-demo {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  width: 100%;
}
</style>
