<script setup lang="ts">
import { ChartPalette, TxChartLegendItem } from '@talex-touch/tuffex/charts'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? { requests: '请求', errors: '错误' }
  : { requests: 'Requests', errors: 'Errors' })

const inactive = ref(false)
</script>

<template>
  <div class="charts-legend-items-demo">
    <TxChartLegendItem :name="copy.requests" :color="ChartPalette.categoricalVar(0)" :value="(1234).toLocaleString(locale)" @click="inactive = !inactive" />
    <TxChartLegendItem :name="copy.errors" :color="ChartPalette.categoricalVar(2)" value="87" :inactive="inactive" />
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
