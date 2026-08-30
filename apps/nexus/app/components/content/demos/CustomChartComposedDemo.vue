<script setup lang="ts">
import { TxAxis, TxBarSeries, TxChart, TxGrid, TxLineSeries } from '@talex-touch/tuffex-charts'

interface Row { month: string, revenue: number, growth: number }

const rows: Row[] = [
  { month: 'Mar', revenue: 320, growth: 12 },
  { month: 'Apr', revenue: 410, growth: 28 },
  { month: 'May', revenue: 380, growth: -7 },
  { month: 'Jun', revenue: 520, growth: 37 },
  { month: 'Jul', revenue: 610, growth: 17 },
  { month: 'Aug', revenue: 690, growth: 13 },
]
</script>

<template>
  <TxChart x-type="band" :height="280" :padding="{ top: 24, right: 24, bottom: 36, left: 56 }">
    <TxGrid y />
    <TxAxis position="bottom" />
    <TxAxis position="left" :format="(v: number | Date | string) => `${v}k`" />
    <TxBarSeries :data="rows" x="month" y="revenue" :radius="3" />
    <TxLineSeries :data="rows" x="month" y="growth" curve="monotone" show-symbol />
  </TxChart>
</template>
