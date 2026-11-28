<script setup lang="ts">
import {
  ChartPalette,
  TxAreaSeries,
  TxAxis,
  TxChart,
  TxChartGrid,
  TxChartLegendItem,
  TxLineSeries,
} from '@talex-touch/tuffex/charts'
import { computed } from 'vue'
import { CHART_ZH_LABELS } from '../../content/demos/chart-demo-locale'

interface Point { day: string, installs: number, errors: number }

const { locale } = useI18n()

const copy = computed(() => locale.value === 'zh'
  ? {
      installs: '安装',
      errors: '错误',
      days: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
      labels: CHART_ZH_LABELS,
    }
  : {
      installs: 'Installs',
      errors: 'Errors',
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      labels: undefined,
    })

const installValues = [410, 520, 480, 690, 740, 860, 1120]
const errorValues = [68, 82, 54, 96, 72, 64, 87]

const points = computed<Point[]>(() =>
  copy.value.days.map((day, index) => ({
    day,
    installs: installValues[index]!,
    errors: errorValues[index]!,
  })),
)

const legendItems = computed(() => [
  { name: copy.value.installs, color: ChartPalette.categoricalVar(0), value: (4820).toLocaleString(locale.value) },
  { name: copy.value.errors, color: ChartPalette.categoricalVar(2), value: (87).toLocaleString(locale.value) },
])
</script>

<template>
  <div class="docs-gallery__block gallery-chart-primitives">
    <div class="gallery-chart-primitives__legend">
      <TxChartLegendItem
        v-for="item in legendItems"
        :key="item.name"
        :name="item.name"
        :color="item.color"
        :value="item.value"
      />
    </div>
    <TxChart
      x-type="band"
      :height="128"
      :padding="{ top: 8, right: 10, bottom: 22, left: 44 }"
      :labels="copy.labels"
    >
      <TxChartGrid :y-ticks="3" />
      <TxAxis position="left" :ticks="3" />
      <TxAxis position="bottom" :ticks="4" />
      <TxAreaSeries
        :data="points"
        x="day"
        y="installs"
        curve="monotone"
        :color="ChartPalette.categoricalVar(0)"
      />
      <TxLineSeries
        :data="points"
        x="day"
        y="errors"
        curve="monotone"
        :color="ChartPalette.categoricalVar(2)"
      />
    </TxChart>
  </div>
</template>

<style scoped>
.gallery-chart-primitives {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gallery-chart-primitives__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}
</style>
