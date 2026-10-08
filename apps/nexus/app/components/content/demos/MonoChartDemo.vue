<script setup lang="ts">
import type { MonoChartData, MonoChartLabels, MonoChartVariant } from '@talex-touch/tuffex/charts'
import { MONO_CHART_VARIANTS, TxMonoChart } from '@talex-touch/tuffex/charts'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const alternate = ref(false)
const filter = ref('')
const username = ref('')
const requestedUser = ref('')
const customScale = ref(false)
const cellSize = ref(11)
const months = ref(5)
const readout = ref('')
const copy = computed(() => locale.value.startsWith('zh') ? {
  source: '切换输入数据', filter: '筛选原始变体 ID', extras: '额外来源能力', calendar: 'GitHub 日历与仓库展开',
  username: 'GitHub 用户名', load: '加载真实公开数据', provided: '调用方提供的确定性样本', custom: '切换自定义五级配色', cell: '单元格大小', months: '月数',
  selected: '选中', all: '完整范围', recent: '最近四项', primary: '主要', baseline: '基线', third: '扩展',
  empty: '空输入', month: ['一月', '二月', '三月', '四月', '五月', '六月'],
  items: ['核心', '界面', '资源', '其他'], stages: ['访问', '注册', '活跃', '付费'],
  price: '价格', metric: '指标', sourceA: '来源 A', sourceB: '来源 B', sink: '汇入', nested: '嵌套树图', range: '真实日期筛选',
} : {
  source: 'Switch input data', filter: 'Filter original variant IDs', extras: 'Additional source capabilities', calendar: 'GitHub calendar and repository disclosure',
  username: 'GitHub username', load: 'Load real public data', provided: 'Deterministic caller-provided samples', custom: 'Toggle custom five-level palette', cell: 'Cell size', months: 'Months',
  selected: 'Selected', all: 'Full range', recent: 'Latest four items', primary: 'Primary', baseline: 'Baseline', third: 'Extension',
  empty: 'Empty input', month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  items: ['Core', 'UI', 'Assets', 'Other'], stages: ['Visits', 'Signup', 'Active', 'Pro'],
  price: 'Price', metric: 'Metric', sourceA: 'Source A', sourceB: 'Source B', sink: 'Destination', nested: 'Nested treemap', range: 'Real date filtering',
})
const labels = computed<MonoChartLabels>(() => locale.value.startsWith('zh') ? {
  single: '单组', dual: '双组', col: '列', row: '行', monotone: '单调曲线', natural: '自然曲线', showLine: '曲线开启', hideLine: '曲线关闭',
  repositories: '主要贡献仓库', expand: '展开仓库', collapse: '收起仓库', empty: '无数据', loading: '加载活动数据', error: '活动数据加载失败', retry: '重试',
  less: '少', more: '多', target: '目标', open: '开盘', high: '最高', low: '最低', close: '收盘', x: 'X', y: 'Y', z: 'Z', min: '下界', max: '上界', delta: '变化', balance: '余额',
} : {})
const names: Record<MonoChartVariant, [string, string]> = {
  'mono-activity-green': ['Emerald activity', '翡翠活动矩阵'], 'mono-activity-blue': ['Sky blue activity', '天空蓝活动矩阵'], 'mono-activity-purple': ['Violet activity', '紫罗兰活动矩阵'],
  'mono-rounded-line': ['Rounded spline line', '圆端帽曲线'], 'mono-rounded-bar': ['Pill columns and rows', '圆角列柱与行条'], 'mono-rounded-area': ['Curved wave area', '渐变曲线面积'],
  'mono-rounded-donut': ['Rounded donut ring', '圆角分段环'], 'mono-rounded-composed': ['Hybrid spline and bar', '曲线与圆角柱组合'], 'mono-rounded-scatter': ['Scatter matrix', '加权散点矩阵'],
  'mono-rounded-candlestick': ['Financial candlesticks', '财务蜡烛'], 'mono-rounded-kpi': ['KPI sparkline card', '指标曲线卡'], 'mono-rounded-pyramid': ['Tier pyramid', '层级金字塔'],
  'mono-rounded-radial-group': ['180-degree radial group', '半圆径向组'], 'mono-rounded-gauge-arc': ['240-degree gauge arc', '240 度仪表弧'], 'mono-rounded-bullet': ['Bullet targets', '目标子弹条'],
  'mono-rounded-sankey': ['Flow channels', '数据流转通道'], 'mono-rounded-step': ['Step-after progression', '后阶梯进展'], 'mono-rounded-stacked-bar': ['Stacked monochrome tones', '单色堆叠柱'],
  'mono-rounded-radar': ['Polygon radar', '多边形雷达'], 'mono-rounded-radial-gauge': ['Concentric radial rings', '同心径向环'], 'mono-rounded-funnel': ['Pill stage funnel', '阶段圆角漏斗'],
  'mono-rounded-heatmap': ['Density matrix', '密度热图'], 'mono-rounded-sparkline': ['Telemetry rows', '遥测微曲线行'], 'mono-rounded-bubble': ['Scaled bubble clusters', '按面积缩放气泡'],
  'mono-rounded-treemap': ['Allocation treemap', '分配树图'], 'mono-rounded-stream': ['Natural stream waves', '自然双流波形'], 'mono-rounded-meter': ['180-degree arc meter', '180 度弧形仪表'],
  'mono-rounded-waterfall': ['Floating waterfall steps', '浮动瀑布增减'], 'mono-rounded-polar': ['360-degree polar pillars', '360 度径向圆条'], 'mono-rounded-range': ['Min-max spline band', '上下界曲线带'],
  'github-activity': ['GitHub activity', 'GitHub 活动日历'],
}
const variants = computed(() => MONO_CHART_VARIANTS.filter(variant => variant.includes(filter.value.toLowerCase())))
const sample = computed(() => {
  const scale = alternate.value ? 0.72 : 1
  const primary = [24, 45, 38, 65, 52, 84].map(value => Math.round(value * scale))
  const secondary = [18, 32, 29, 48, 41, 62].map(value => Math.round(value * (alternate.value ? 1.25 : 1)))
  const series = [
    { name: copy.value.primary, data: primary.map((value, index) => ({ x: copy.value.month[index]!, value })) },
    { name: copy.value.baseline, data: secondary.map((value, index) => ({ x: copy.value.month[index]!, value })), opacity: 0.5 },
    { name: copy.value.third, data: primary.map((value, index) => ({ x: copy.value.month[index]!, value: Math.round(value * 0.35) })), opacity: 0.22 },
  ]
  const items = [45, 30, 15, 10].map((value, index) => ({ label: copy.value.items[index]!, value: value * scale, max: 100, target: [40, 45, 20, 15][index] }))
  const contributions = Array.from({ length: 140 }, (_, index) => {
    const level = ((index * 13 + Math.floor(index / 5) + (alternate.value ? 2 : 0)) % 5) as 0 | 1 | 2 | 3 | 4
    return { date: new Date(Date.UTC(2026, 4, 10 + index)).toISOString().slice(0, 10), count: level * 3, level }
  })
  return { series, items, contributions, primary, secondary }
})
function chartData(variant: MonoChartVariant): MonoChartData {
  const { series, items, contributions, primary } = sample.value
  if (variant.startsWith('mono-activity-') || variant === 'github-activity') return { contributions, repos: [{ name: 'amicro-ui', count: alternate.value ? 83 : 142, href: 'https://github.com/Subhan-code/Amicro--Micro-transitions-' }, { name: 'tuffex', count: alternate.value ? 124 : 98, href: 'https://github.com/talex-touch/tuff' }, { name: 'charts', count: 64 }] }
  if (['mono-rounded-donut', 'mono-rounded-pyramid', 'mono-rounded-radial-group', 'mono-rounded-gauge-arc', 'mono-rounded-bullet', 'mono-rounded-radial-gauge', 'mono-rounded-meter', 'mono-rounded-polar', 'mono-rounded-radar', 'mono-rounded-treemap'].includes(variant)) {
    if (variant === 'mono-rounded-gauge-arc' || variant === 'mono-rounded-meter') return { items: [{ label: copy.value.metric, value: alternate.value ? 62 : variant === 'mono-rounded-gauge-arc' ? 84 : 78, max: 100 }] }
    if (variant === 'mono-rounded-pyramid') return { items: [...items].reverse() }
    if (variant === 'mono-rounded-radar') return { items: items.map((item, i) => ({ ...item, value: primary[i]! })) }
    return { items }
  }
  if (variant === 'mono-rounded-scatter' || variant === 'mono-rounded-bubble') return { points: primary.map((value, index) => ({ label: `${copy.value.metric} ${index + 1}`, x: 10 + index * 15, y: value, z: value * 10 })) }
  if (variant === 'mono-rounded-candlestick') return { candles: copy.value.month.map((x, index) => ({ x, open: 100 + primary[index]!, high: 155 + primary[index]!, low: 80 + primary[index]!, close: 100 + primary[index]! + (index % 2 ? -15 : 20) })) }
  if (variant === 'mono-rounded-range') return { ranges: copy.value.month.map((x, index) => ({ x, min: primary[index]! * 0.6, max: primary[index]! + 20 })) }
  if (variant === 'mono-rounded-waterfall') return { waterfall: [{ label: copy.value.primary, delta: alternate.value ? 35 : 50 }, { label: '+', delta: 30 }, { label: '−', delta: -20 }, { label: '=', delta: alternate.value ? 45 : 60, total: true }] }
  if (variant === 'mono-rounded-heatmap') return { matrix: copy.value.month.slice(0, 5).map((label, index) => ({ label, values: primary.map((value, column) => Math.round((value + index * 17 + column * 7) % 100)) })) }
  if (variant === 'mono-rounded-sankey') return { nodes: [{ name: copy.value.sourceA }, { name: copy.value.sourceB }, { name: copy.value.sink }], links: [{ source: 0, target: 2, value: alternate.value ? 24 : 60 }, { source: 1, target: 2, value: alternate.value ? 56 : 40 }] }
  if (variant === 'mono-rounded-funnel') return { items: [100, 68, 42, 24].map((value, index) => ({ label: copy.value.stages[index]!, value: alternate.value ? value * 0.8 : value })) }
  if (variant === 'mono-rounded-kpi') return { series: series.slice(0, 1), metric: alternate.value ? 35220 : 48920, metricLabel: copy.value.metric, change: alternate.value ? '−4.8%' : '+14.2%' }
  if (variant === 'mono-rounded-sparkline') return { series: series.map((series, index) => ({ ...series, metric: `${primary[index]} ${index === 2 ? 'RPM' : '°C'}` })) }
  return { categories: copy.value.month, series: variant === 'mono-rounded-stacked-bar' ? series : variant === 'mono-rounded-stream' || variant === 'mono-rounded-composed' || variant === 'mono-rounded-line' || variant === 'mono-rounded-bar' ? series.slice(0, 2) : series.slice(0, 1) }
}
const nestedTree = computed<MonoChartData>(() => ({ tree: [{ label: copy.value.primary, children: [{ label: copy.value.items[0]!, value: 45 }, { label: copy.value.items[1]!, value: alternate.value ? 60 : 30 }] }, { label: copy.value.items[2]!, value: alternate.value ? 35 : 15 }, { label: copy.value.items[3]!, value: 10 }] }))
const timeData = computed<MonoChartData>(() => ({ series: [{ name: copy.value.primary, data: sample.value.primary.map((value, index) => ({ x: Date.UTC(2026, 9, index + 1), value })) }] }))
const periods = computed(() => [{ value: 'all', label: copy.value.all }, { value: 'recent', label: copy.value.recent, range: [Date.UTC(2026, 9, 3), Date.UTC(2026, 9, 6)] as [number, number] }])
const datasetPeriods = computed(() => [{ value: 'primary', label: copy.value.primary }, { value: 'baseline', label: copy.value.baseline }])
const gaugeDatasets = computed<Record<string, MonoChartData>>(() => ({ primary: { items: [{ label: copy.value.primary, value: sample.value.primary.at(-1)!, max: 100 }] }, baseline: { items: [{ label: copy.value.baseline, value: sample.value.secondary.at(-1)!, max: 100 }] } }))
</script>

<template>
  <div class="mono-demo not-prose">
    <div class="mono-demo__toolbar">
<button type="button" @click="alternate = !alternate">
{{ copy.source }}
</button><input v-model="filter" :aria-label="copy.filter" :placeholder="copy.filter">
</div>
    <p>{{ copy.provided }}</p>
    <div class="mono-demo__grid">
      <article v-for="variant in variants" :key="variant">
        <code>{{ variant }}</code>
        <TxMonoChart :variant="variant" :title="names[variant][locale.startsWith('zh') ? 1 : 0]" :aria-label="names[variant][locale.startsWith('zh') ? 1 : 0]" :data="chartData(variant)" :width="360" :height="180" :labels="labels" :locale="locale" :cell-size="10" :months="5" @select="hit => readout = `${hit.label}: ${hit.rows.map(row => row.value).join(', ')}`" />
      </article>
    </div>
    <p role="status">
{{ copy.selected }}: {{ readout || '—' }}
</p>
    <h3>{{ copy.extras }}</h3>
    <div class="mono-demo__toolbar">
      <button type="button" @click="customScale = !customScale">
{{ copy.custom }}
</button>
      <label>{{ copy.cell }} <input v-model.number="cellSize" type="range" min="6" max="16"></label>
      <label>{{ copy.months }} <input v-model.number="months" type="range" min="1" max="12"></label>
    </div>
    <TxMonoChart variant="github-activity" :title="copy.calendar" :aria-label="copy.calendar" :data="chartData('github-activity')" :width="680" :cell-size="cellSize" :months="months" :labels="labels" :locale="locale" :accent="customScale ? ['var(--tx-fill-color)', 'var(--tx-chart-sequential-blues-1)', 'var(--tx-chart-sequential-blues-2)', 'var(--tx-chart-sequential-blues-3)', 'var(--tx-chart-sequential-blues-4)'] : undefined">
      <template #avatar="{ repo }">
<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="7" fill="var(--tx-fill-color)" /><text x="12" y="16" text-anchor="middle" font-size="13" fill="var(--tx-text-color-primary)">{{ repo.name.slice(0, 1) }}</text></svg>
</template>
    </TxMonoChart>
    <div class="mono-demo__toolbar">
<input v-model="username" :aria-label="copy.username" :placeholder="copy.username"><button type="button" :disabled="!username.trim()" @click="requestedUser = username.trim()">
{{ copy.load }}
</button>
</div>
    <TxMonoChart v-if="requestedUser" :key="requestedUser" variant="github-activity" :username="requestedUser" :title="requestedUser" :aria-label="requestedUser" :labels="labels" :locale="locale" :width="680" />
    <div class="mono-demo__grid">
      <TxMonoChart variant="mono-rounded-area" :title="copy.range" :aria-label="copy.range" :data="timeData" :periods="periods" :labels="labels" :locale="locale" :width="360" :height="180" />
      <TxMonoChart variant="mono-rounded-treemap" :title="copy.nested" :aria-label="copy.nested" :data="nestedTree" :labels="labels" :locale="locale" :width="360" :height="180" />
      <TxMonoChart variant="mono-rounded-gauge-arc" :title="copy.metric" :aria-label="copy.metric" :periods="datasetPeriods" :period-data="gaugeDatasets" :labels="labels" :locale="locale" :width="360" :height="180" />
      <TxMonoChart variant="mono-rounded-line" :title="copy.empty" :aria-label="copy.empty" :data="{}" :labels="labels" :locale="locale" :width="360" :height="180" />
    </div>
  </div>
</template>

<style scoped>
.mono-demo { display: grid; gap: 16px; color: var(--tx-text-color-primary, #303133); font-size: 13px; }
.mono-demo__toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mono-demo__toolbar button, .mono-demo__toolbar input:not([type='range']) { font: inherit; border: 0; border-radius: 8px; padding: 7px 10px; color: inherit; background: var(--tx-fill-color-light, #f5f7fa); box-shadow: inset 0 0 0 1px var(--tx-border-color-light, #e4e7ed); }
.mono-demo__toolbar button { cursor: pointer; }
.mono-demo__toolbar button:disabled { opacity: .5; cursor: not-allowed; }
.mono-demo__toolbar label { display: flex; gap: 6px; align-items: center; }
.mono-demo__toolbar input { min-width: 0; }
.mono-demo__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 16px; }
.mono-demo__grid article { min-width: 0; display: grid; align-content: start; gap: 6px; }
.mono-demo code { font-size: 12px; color: var(--tx-text-color-regular, #606266); }
.mono-demo h3 { margin: 0; font-size: 16px; font-weight: 600; }
.mono-demo p { margin: 0; }
</style>
