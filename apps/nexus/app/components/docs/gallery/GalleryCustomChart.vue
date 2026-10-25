<script setup lang="ts">
import { TxChart } from '@talex-touch/tuffex/charts/src/chart'
import { ChartPalette } from '@talex-touch/tuffex/charts/src/palette'
import { TxArcSeries } from '@talex-touch/tuffex/charts/src/series'
import { TxChartTooltip } from '@talex-touch/tuffex/charts/src/tooltip'
import { computed, ref } from 'vue'
import { CHART_ZH_LABELS } from '../../content/demos/chart-demo-locale'

interface Slice { label: string, count: number }

const counts = [4820, 3160, 940]
const total = counts.reduce((sum, count) => sum + count, 0)

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? { channels: ['稳定版', '测试版', '快照版'], installs: '安装', labels: CHART_ZH_LABELS }
  : { channels: ['Stable', 'Beta', 'Snapshot'], installs: 'Installs', labels: undefined })
const slices = computed<Slice[]>(() => copy.value.channels.map((label, index) => ({ label, count: counts[index]! })))

const hover = ref<{ name?: string, index: number, value: number } | null>(null)
const rows = computed(() => {
  if (!hover.value)
    return []
  const share = new Intl.NumberFormat(locale.value, { style: 'percent' }).format(hover.value.value / total)
  return [{
    name: copy.value.installs,
    color: ChartPalette.categoricalVar(hover.value.index),
    value: `${hover.value.value.toLocaleString(locale.value)} · ${share}`,
  }]
})
</script>

<template>
  <div class="docs-gallery__block">
    <TxChart :height="150" :padding="8" :labels="copy.labels">
      <TxArcSeries
        :data="slices"
        value="count"
        name="label"
        :inner-radius="0.65"
        @slice-hover="hover = $event"
      />
      <template #overlay>
        <TxChartTooltip :open="hover !== null" :title="hover?.name" :rows="rows" />
      </template>
    </TxChart>
  </div>
</template>
