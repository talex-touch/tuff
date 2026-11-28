<script setup lang="ts">
import type { Component } from 'vue'
import { computed, defineAsyncComponent } from 'vue'

export type EChartFamilyKind = 'line' | 'bar' | 'pie' | 'radar' | 'scatter' | 'funnel' | 'gauge' | 'heatmap' | 'treemap'

const props = defineProps<{
  kind: EChartFamilyKind
}>()

// Keep ECharts (~1 MiB+) strictly out of the SSR worker bundle.
function lazyEChart(exportName: string) {
  return defineAsyncComponent(() => {
    if (import.meta.server)
      return Promise.resolve({ render: () => null } as Component)
    return import('@talex-touch/tuffex/charts/src/echart').then(m => (m as unknown as Record<string, Component>)[exportName]!)
  })
}

const TxLineChart = lazyEChart('TxLineChart')
const TxBarChart = lazyEChart('TxBarChart')
const TxPieChart = lazyEChart('TxPieChart')
const TxRadarChart = lazyEChart('TxRadarChart')
const TxScatterChart = lazyEChart('TxScatterChart')
const TxFunnelChart = lazyEChart('TxFunnelChart')
const TxGaugeChart = lazyEChart('TxGaugeChart')
const TxHeatmapChart = lazyEChart('TxHeatmapChart')
const TxTreemapChart = lazyEChart('TxTreemapChart')

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const days = computed(() => zh.value
  ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])

const lineSeries = computed(() => [
  { name: zh.value ? '活跃用户' : 'Active', data: [420, 512, 488, 640, 728, 810, 790], area: true, smooth: true },
  { name: zh.value ? '新增用户' : 'New', data: [120, 148, 165, 210, 240, 286, 260], smooth: true, dashed: true },
])

const barCategories = computed(() => zh.value
  ? ['Q1', 'Q2', 'Q3', 'Q4']
  : ['Q1', 'Q2', 'Q3', 'Q4'])

const barSeries = computed(() => [
  { name: zh.value ? '桌面端' : 'Desktop', data: [320, 410, 465, 540] },
  { name: zh.value ? '移动端' : 'Mobile', data: [180, 230, 295, 360] },
])

const pieData = computed(() => zh.value
  ? [
      { name: '稳定版', value: 58 },
      { name: '测试版', value: 27 },
      { name: '快照版', value: 15 },
    ]
  : [
      { name: 'Stable', value: 58 },
      { name: 'Beta', value: 27 },
      { name: 'Canary', value: 15 },
    ])

const radarIndicators = computed(() => zh.value
  ? [
      { name: '启动', max: 100 },
      { name: '帧率', max: 100 },
      { name: '内存', max: 100 },
      { name: '包体', max: 100 },
      { name: '无障碍', max: 100 },
    ]
  : [
      { name: 'Startup', max: 100 },
      { name: 'FPS', max: 100 },
      { name: 'Memory', max: 100 },
      { name: 'Size', max: 100 },
      { name: 'A11y', max: 100 },
    ])

const radarSeries = computed(() => [
  { name: 'v0.9', data: [92, 95, 86, 88, 94], area: true },
  { name: 'v0.8', data: [76, 82, 74, 71, 80] },
])

const scatterSeries = computed(() => [
  {
    name: zh.value ? '缓存命中' : 'Cache hit',
    data: [[12, 22], [18, 28], [25, 31], [34, 38], [42, 46], [56, 52], [68, 61]] as Array<[number, number]>,
  },
  {
    name: zh.value ? '冷启动' : 'Cold miss',
    data: [[22, 68], [31, 79], [45, 92], [58, 108], [72, 124]] as Array<[number, number]>,
  },
])

const funnelData = computed(() => zh.value
  ? [
      { name: '访问', value: 1000 },
      { name: '试用', value: 640 },
      { name: '安装', value: 380 },
      { name: '留存', value: 210 },
    ]
  : [
      { name: 'Visit', value: 1000 },
      { name: 'Try', value: 640 },
      { name: 'Install', value: 380 },
      { name: 'Retain', value: 210 },
    ])

const heatmapRows = computed(() => zh.value ? ['晚间', '午后', '上午'] : ['Eve', 'PM', 'AM'])
const heatmapCols = computed(() => zh.value ? ['一', '二', '三', '四', '五'] : ['M', 'T', 'W', 'T', 'F'])
const heatmapValues = [
  [18, 26, 31, 24, 42],
  [45, 62, 58, 74, 66],
  [28, 39, 52, 48, 35],
]

const treemapData = computed(() => zh.value
  ? [
      {
        name: '核心包',
        children: [
          { name: '组件', value: 142 },
          { name: '图表', value: 96 },
          { name: '动效', value: 64 },
        ],
      },
      {
        name: '资源',
        children: [
          { name: '图标', value: 58 },
          { name: '样式', value: 34 },
        ],
      },
    ]
  : [
      {
        name: 'Core',
        children: [
          { name: 'Components', value: 142 },
          { name: 'Charts', value: 96 },
          { name: 'Motion', value: 64 },
        ],
      },
      {
        name: 'Assets',
        children: [
          { name: 'Icons', value: 58 },
          { name: 'Styles', value: 34 },
        ],
      },
    ])
</script>

<template>
  <div class="docs-gallery__block">
    <ClientOnly>
      <TxLineChart
        v-if="props.kind === 'line'"
        :categories="days"
        :series="lineSeries"
        :height="200"
        :zoom="false"
      />
      <TxBarChart
        v-else-if="props.kind === 'bar'"
        :categories="barCategories"
        :series="barSeries"
        stacked
        :height="200"
        :zoom="false"
      />
      <TxPieChart
        v-else-if="props.kind === 'pie'"
        :data="pieData"
        donut
        :center-label="zh ? '渠道占比' : 'Channels'"
        unit="%"
        :height="200"
      />
      <TxRadarChart
        v-else-if="props.kind === 'radar'"
        :indicators="radarIndicators"
        :series="radarSeries"
        :height="200"
      />
      <TxScatterChart
        v-else-if="props.kind === 'scatter'"
        :series="scatterSeries"
        :height="200"
        :zoom="false"
      />
      <TxFunnelChart
        v-else-if="props.kind === 'funnel'"
        :data="funnelData"
        :show-legend="false"
        :height="200"
      />
      <TxGaugeChart
        v-else-if="props.kind === 'gauge'"
        :value="78"
        :name="zh ? '可用率' : 'Uptime'"
        unit="%"
        progress
        :height="200"
      />
      <TxHeatmapChart
        v-else-if="props.kind === 'heatmap'"
        :rows="heatmapRows"
        :columns="heatmapCols"
        :values="heatmapValues"
        show-label
        :selectable="false"
        :height="214"
      />
      <TxTreemapChart
        v-else-if="props.kind === 'treemap'"
        :data="treemapData"
        unit=" KB"
        :roam="false"
        :height="200"
      />
      <template #fallback>
        <div style="height: 200px" aria-hidden="true" />
      </template>
    </ClientOnly>
  </div>
</template>
