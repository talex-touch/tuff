<script setup lang="ts">
import { TxAxis, TxBarSeries, TxChart, TxChartGrid, TxLineSeries } from '@talex-touch/tuffex/charts'
import { computed } from 'vue'
import { CHART_ZH_LABELS } from './chart-demo-locale'

interface Row { month: string, revenue: number, growth: number }

const { locale } = useI18n()
const labels = computed(() => (locale.value === 'zh' ? CHART_ZH_LABELS : undefined))

// March to August; revenue is in thousands.
const figures = [
  { revenue: 320, growth: 12 },
  { revenue: 410, growth: 28 },
  { revenue: 380, growth: -7 },
  { revenue: 520, growth: 37 },
  { revenue: 610, growth: 17 },
  { revenue: 690, growth: 13 },
]

const rows = computed<Row[]>(() => {
  const month = new Intl.DateTimeFormat(locale.value, { month: 'short', timeZone: 'UTC' })
  return figures.map((figure, index) => ({ month: month.format(Date.UTC(2026, 2 + index, 1)), ...figure }))
})

const compact = computed(() => new Intl.NumberFormat(locale.value, { notation: 'compact' }))
</script>

<template>
  <TxChart x-type="band" :height="280" :padding="{ top: 24, right: 24, bottom: 36, left: 56 }" :labels="labels">
    <TxChartGrid y />
    <TxAxis position="bottom" />
    <TxAxis position="left" :format="(v: number | Date | string) => compact.format(Number(v) * 1000)" />
    <TxBarSeries :data="rows" x="month" y="revenue" :radius="3" />
    <TxLineSeries :data="rows" x="month" y="growth" curve="monotone" show-symbol />
  </TxChart>
</template>
