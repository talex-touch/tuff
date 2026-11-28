<script setup lang="ts">
import type { DitherSeries } from '@talex-touch/tuffex/charts/src/dither-chart'
import { TxDitherChart } from '@talex-touch/tuffex/charts/src/dither-chart'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const activeKeys = ref(['members'])
const dateCursor = ref<number | null>(null)

const copy = computed(() => locale.value === 'zh'
  ? {
      growth: '社区增长',
      members: '新增成员',
      series: '系列',
      period: '时间范围',
      total: '合计',
      less: '较少',
      more: '较多',
      empty: '暂无数据',
      months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月'],
    }
  : {
      growth: 'Community growth',
      members: 'New members',
      series: 'Series',
      period: 'Period',
      total: 'Total',
      less: 'Less',
      more: 'More',
      empty: 'No data',
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
    })

const ditherSeries = computed<DitherSeries[]>(() => [
  {
    id: 'members',
    label: copy.value.members,
    change: '+15%',
    data: [18, 24, 21, 30, 36, 33, 42, 48, 55].map((value, index) => ({
      label: copy.value.months[index]!,
      value,
    })),
  },
])
</script>

<template>
  <div class="docs-gallery__block">
    <TxDitherChart
      v-model:active-keys="activeKeys"
      v-model:date-cursor="dateCursor"
      variant="dither-growth"
      pattern="ordered"
      :series="ditherSeries"
      :title="copy.growth"
      :height="168"
      :labels="{
        chart: copy.growth,
        series: copy.series,
        period: copy.period,
        total: copy.total,
        less: copy.less,
        more: copy.more,
        empty: copy.empty,
      }"
    />
  </div>
</template>
