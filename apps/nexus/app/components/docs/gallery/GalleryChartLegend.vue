<script setup lang="ts">
import { TxChartLegendItem } from '@talex-touch/tuffex/charts/src/chart-legend'
import { ChartPalette } from '@talex-touch/tuffex/charts/src/palette'
import { computed } from 'vue'

const { locale } = useI18n()
const items = computed(() => {
  const names = locale.value === 'zh' ? ['安装', '错误'] : ['Installs', 'Errors']
  return [4820, 87].map((count, index) => ({
    name: names[index]!,
    color: ChartPalette.categoricalVar(index * 2),
    value: count.toLocaleString(locale.value),
  }))
})
</script>

<template>
  <div class="docs-gallery__stack">
    <TxChartLegendItem v-for="item in items" :key="item.color" :name="item.name" :color="item.color" :value="item.value" />
  </div>
</template>
