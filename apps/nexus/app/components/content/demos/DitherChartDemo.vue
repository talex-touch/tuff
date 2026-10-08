<!-- Composition adapted from Amicro SimpleCompExtracted (SPDX-License-Identifier: Apache-2.0).
     Copyright (c) 2026 SYED  SUBHAN UDDIN.
     Modified for Vue/TuffEx: consumer-authored pages, typed datasets, localized controls,
     accessible filters and source-equivalence documentation; no upstream image assets. -->
<script setup lang="ts">
import type { DitherChartVariant, DitherDataset, DitherHover, DitherPattern, DitherPeriod } from '@talex-touch/tuffex/charts'
import { DITHER_CHART_VARIANTS, DITHER_PATTERNS, DITHER_SOURCE_DIFFERENCES, TxDitherChart } from '@talex-touch/tuffex/charts'
import { TxFlipBook } from '@talex-touch/tuffex/flip-book'
import { computed, ref, useId, watch } from 'vue'

const { locale } = useI18n()
const id = useId()
const variant = ref<DitherChartVariant>('dither-donut')
const pattern = ref<DitherPattern>('pixel')
const animated = ref(true)
const compact = ref(false)
const multiplier = ref(1)
const indicator = ref<'dot' | 'line' | 'dashed'>('dot')
const hovered = ref<DitherHover | null>(null)
const cursor = ref<number | null>(null)
const bookPage = ref(0)
const book = ref<InstanceType<typeof TxFlipBook> | null>(null)
const copied = ref('')
watch(variant, () => { hovered.value = null; cursor.value = null })
const copy = computed(() => locale.value === 'zh' ? {
  variant: '图形', pattern: '纹理', animated: '播放粒子纹理', compact: '紧凑视图', scale: '输入数据倍率', indicator: '图例标记',
  gallery: '全部独立图形', compare: '来源差异与去重', composition: '书页与指标组合', copy: '复制Vue用法', copied: '已复制', failed: '复制失败',
  note: '每个缩略图使用同一真实输入API。选择图形后操作周期、图例、指标或日期游标；倍率同时修改图形和读数。',
  difference: '两个来源目录的11份同字节文件共用实现；另外11份已逐文件核对，图形公式相同，差异是以下运行时保护，而不是另一种图形。',
  noDifference: '该非目录变体在两个来源目录中为同字节副本。',
  dither: 'dither-charts：缓存尺寸、DPR上限、可见性、减少动态效果与低帧率保护', simple: 'simple-comp：相同几何，旧的每帧布局读取和后台播放不被重新引入',
  selected: '当前读数', cursor: '游标', previous: '上一页', next: '下一页', settings: '书页设置', padding: '内容留白', imageRadius: '内容圆角', creaseOpacity: '折痕强度', paperColor: '纸张颜色', shadowIntensity: '阴影强度', intro: '播放开场翻页',
  labels: { empty: '暂无数据', period: '周期', series: '系列与指标', chart: '抖动图表', total: '合计', capacity: '容量', less: '少', more: '多', cursor: '日期游标' },
  names: ['计划分布环图', '区域堆叠柱图', '新增面积图', '贡献活动矩阵', '服务器半圆仪表', '流量气泡', '转化漏斗', '设备环图', '存储容量条', '收入折线', '服务在线矩阵', '垂直柱图', '目标径向仪表', '节点趋势散点', '时段热力网格', '指标迷你图矩阵', '新增成员卡片', '支付卡片', '计划成员卡片'],
} : {
  variant: 'Geometry', pattern: 'Texture', animated: 'Animate particles', compact: 'Compact view', scale: 'Input multiplier', indicator: 'Legend indicator',
  gallery: 'Every independent geometry', compare: 'Source differences and deduplication', composition: 'Book and metric composition', copy: 'Copy Vue usage', copied: 'Copied', failed: 'Copy failed',
  note: 'Every thumbnail uses the same real data API. Choose a geometry and interact with its periods, legend, metric selection or date cursor; the multiplier changes both geometry and readings.',
  difference: 'Eleven byte-identical files share an implementation. The other eleven pairs were reviewed individually: their geometry formulas are equal and their differences are runtime protections, not additional chart shapes.',
  noDifference: 'This non-catalog variant is a byte-identical copy in both source directories.',
  dither: 'dither-charts: cached size, DPR cap, visibility, reduced motion and low-frame-rate protections', simple: 'simple-comp: equal geometry; its old per-frame layout reads and background playback are not reintroduced',
  selected: 'Current reading', cursor: 'Cursor', previous: 'Previous page', next: 'Next page', settings: 'Book settings', padding: 'Content padding', imageRadius: 'Content radius', creaseOpacity: 'Crease intensity', paperColor: 'Paper colour', shadowIntensity: 'Shadow intensity', intro: 'Replay opening flips',
  labels: { empty: 'No data', period: 'Period', series: 'Series and metrics', chart: 'Dither chart', total: 'Total', capacity: 'Capacity', less: 'Less', more: 'More', cursor: 'Date cursor' },
  names: ['Plan distribution donut', 'Regional stacked bars', 'Growth area', 'Contribution activity matrix', 'Server semicircle gauge', 'Traffic bubbles', 'Conversion funnel', 'Device donut', 'Storage capacity', 'Revenue line', 'System uptime matrix', 'Vertical bars', 'Target radial gauge', 'Node trend scatter', 'Hourly heatmap grid', 'Metric sparkline matrix', 'Member growth card', 'Payment card', 'Plan member card'],
})
const title = computed(() => copy.value.names[DITHER_CHART_VARIANTS.indexOf(variant.value)] ?? variant.value)
const weekdays = computed(() => locale.value === 'zh' ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
const periods = computed(() => {
  const zh = locale.value === 'zh'
  return [
    { id: 'week', label: zh ? '周' : 'Week', mult: 0.42 },
    { id: 'month', label: zh ? '月' : 'Month', mult: 1 },
    { id: 'quarter', label: zh ? '季' : 'Quarter', mult: 2.6 },
    { id: 'year', label: zh ? '年' : 'Year', mult: 8.4 },
  ]
})

function datasetFor(kind: DitherChartVariant, periodIndex = 1): DitherDataset {
  const zh = locale.value === 'zh'
  const m = multiplier.value
  if (['dither-donut', 'plan-card'].includes(kind)) {
    const names = zh ? ['无限次', '30日通行', '10次套餐', '单次', '学生'] : ['Unlimited', '30-day pass', '10-class pack', 'Drop-in', 'Student']
    return { series: [1240, 980, 620, 410, 300].map((base, index) => ({ id: `plan-${index}`, label: names[index]!, value: Math.round(base * periods.value[periodIndex]!.mult * (0.78 + 0.4 * (0.5 + 0.5 * Math.sin(index * 1.9 + periodIndex * 1.3))) * m) })) }
  }
  if (['dither-stacked', 'payments'].includes(kind)) {
    const branches = ['Bishkek', 'Osh', 'Jalal-Abad', 'Karakol']
    const names = zh ? ['现金', '二维码', '银行'] : ['Cash', 'QR', 'Bank']
    return { series: [0.46, 0.31, 0.23].map((share, band) => ({ id: `band-${band}`, label: names[band]!, unit: '$', data: [0.45, 0.25, 0.18, 0.12].map((weight, branch) => ({ label: branches[branch]!, value: Math.round(150000 * weight * [1, 4, 13, 52][periodIndex]! * share * (0.9 + 0.14 * Math.sin(branch * 3.1 + band * 1.7)) * m) })) })) }
  }
  if (['dither-growth', 'members-growth'].includes(kind)) {
    const count = [7, 14, 30, 90][periodIndex]!
    return { series: [{ id: 'members', label: zh ? '新增成员' : 'New members', change: '+14%', data: Array.from({ length: count }, (_, index) => ({ label: new Date(Date.UTC(2026, 6, 14 - (count - 1 - index))).toLocaleDateString(zh ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }), value: Math.max(3, Math.round(9 + index / Math.max(1, count - 1) * 23 + 6 * Math.sin(index * 0.7 + 1) + 3 * Math.sin(index * 1.9))) * m })) }] }
  }
  if (kind === 'dither-heatmap') {
    const weeks = periodIndex === 0 ? 12 : 24
    return { cells: Array.from({ length: weeks * 7 }, (_, index) => {
      const column = Math.floor(index / 7); const row = index % 7
      return { id: `activity-${index}`, row, column, label: `${zh ? '第' : 'Week '}${column + 1} · ${weekdays.value[row]}`, value: Math.max(0, Math.min(4, Math.floor(Math.sin(column * 0.5 + row * 0.2) * 2 + Math.cos(column * 1.2) * 1.5 + 2))) * m }
    }) }
  }
  if (kind === 'dither-gauge') return { series: [65, 82, 45].map((value, index) => ({ id: `metric-${index}`, label: (zh ? ['CPU负载', '内存', '网络'] : ['CPU load', 'Memory', 'Network'])[index]!, value: value * m, capacity: 100, unit: '%' })) }
  if (kind === 'dither-radial') return { series: [50, 75, 90, 100].map(value => ({ id: `target-${value}`, label: `${value}%`, value: value * m, capacity: 100, unit: '%' })) }
  if (kind === 'dither-traffic') {
    const raw = periodIndex === 0 ? [[50, 50, 35, 'US'], [30, 20, 20, 'UK'], [70, 80, 25, 'CA']] as const : [[40, 60, 40, 'IG'], [70, 30, 25, 'TW'], [20, 40, 15, 'FB']] as const
    return { nodes: raw.map(([x, y, radius, label], index) => ({ id: `traffic-${index}`, label, x, y, radius: radius * Math.sqrt(m), value: Math.round(radius * 100 * m) })) }
  }
  if (kind === 'dither-scatter') {
    const mult = [1, 1.4, 2.1][periodIndex] ?? 1
    return { nodes: [[15, 35], [28, 62], [42, 48], [58, 84], [72, 70], [88, 92]].map(([x, y], index) => ({ id: `node-${index}`, label: `${zh ? '节点' : 'Node '}${String.fromCharCode(65 + index)}`, x: x!, y: y! * mult / 2.1 * m, value: Math.round(y! * mult * m) })) }
  }
  if (kind === 'dither-funnel') return { series: (periodIndex === 0 ? [100, 62, 38, 18] : [100, 74, 45, 24]).map((value, index) => ({ id: `stage-${index}`, label: (zh ? ['访客', '线索', '交易', '成交'] : ['Visitors', 'Leads', 'Deals', 'Won'])[index]!, value: value * m })) }
  if (kind === 'dither-device') return { series: (periodIndex === 0 ? [65, 25, 10] : [55, 35, 10]).map((value, index) => ({ id: `device-${index}`, label: (zh ? ['手机', '桌面', '平板'] : ['Mobile', 'Desktop', 'Tablet'])[index]!, value: value * m })) }
  if (kind === 'dither-storage') return { series: [[500, 340], [1000, 850], [2000, 450]].map(([capacity, value], index) => ({ id: `storage-${index}`, label: (zh ? ['数据库', '资源', '备份'] : ['Database', 'Assets', 'Backups'])[index]!, value: value! * m, capacity, unit: 'GB' })) }
  if (kind === 'dither-revenue') return { series: [{ id: 'revenue', label: zh ? '收入' : 'Revenue', unit: '$', data: (periodIndex === 0 ? [1200, 1500, 1100, 1800, 2200, 2900, 1750] : [900, 1100, 800, 1300, 1600, 2100, 2000]).map((value, index) => ({ label: weekdays.value[index]!, value: value * m })) }] }
  if (kind === 'dither-uptime') return { cells: Array.from({ length: 90 }, (_, index) => ({ id: `uptime-${index}`, label: `${zh ? '第' : 'Day '}${index + 1}`, row: 0, column: index, value: Math.min(1, ([22, 60].includes(index) ? 0 : [12, 45, 78].includes(index) ? 0.8 : 1) * m) })) }
  if (kind === 'dither-bar') return { series: [{ id: 'events', label: zh ? '事件' : 'Events', data: [42, 68, 55, 92, 85, 110, 74].map((value, index) => ({ label: weekdays.value[index]!, value: Math.round(value * [1, 3.8, 11.2, 42.5][periodIndex]! * m) })) }] }
  if (kind === 'dither-heatmap-grid') return { cells: Array.from({ length: 84 }, (_, index) => {
    const row = Math.floor(index / 12); const column = index % 12
    return { id: `hour-${index}`, row, column, label: `${weekdays.value[row]} @ ${column * 2}:00`, value: Math.max(0, Math.round(20 + Math.sin(row * 1.5 + column * 0.8) * 35 + ((index * 17) % 40))) * m }
  }) }
  const metrics = [
    { id: 'arr', label: zh ? 'ARR增长' : 'ARR growth', value: 1_400_000 * m, unit: '$', change: '+24%', data: [20, 35, 45, 60, 55, 80, 95] },
    { id: 'users', label: zh ? '活跃用户' : 'Active users', value: 84_200 * m, change: '+18%', data: [40, 30, 55, 70, 65, 85, 90] },
    { id: 'conversion', label: zh ? '转化' : 'Conversion', value: 4.8 * m, unit: '%', change: '+3.2%', data: [15, 25, 30, 45, 60, 50, 75] },
    { id: 'retention', label: zh ? '留存' : 'Retention', value: 92.4 * m, unit: '%', change: '+1.5%', data: [60, 65, 70, 80, 85, 88, 94] },
  ]
  return { series: metrics.map(metric => ({ ...metric, data: metric.data.map((value, index) => ({ label: String(index + 1), value: value * m })) })) }
}

function periodsFor(kind: DitherChartVariant): DitherPeriod[] {
  const zh = locale.value === 'zh'
  let labels = periods.value.map(item => item.label)
  if (['dither-growth', 'members-growth', 'dither-bar'].includes(kind)) labels = kind === 'dither-bar' ? ['7D', '30D', '90D', '1Y'] : ['7D', '14D', '30D', '90D']
  else if (kind === 'dither-heatmap') labels = zh ? ['最近3个月', '最近6个月'] : ['Last 3 months', 'Last 6 months']
  else if (kind === 'dither-traffic') labels = zh ? ['直接访问', '社交'] : ['Direct', 'Social']
  else if (kind === 'dither-scatter') labels = zh ? ['散点', '趋势', '峰值'] : ['Scatter', 'Trend', 'Peak']
  else if (kind === 'dither-funnel') labels = ['Q1', 'Q2']
  else if (kind === 'dither-device') labels = zh ? ['今日', '最近7日'] : ['Today', 'Last 7 days']
  else if (kind === 'dither-revenue') labels = zh ? ['本周', '上周'] : ['This week', 'Last week']
  else if (!['dither-donut', 'plan-card', 'dither-stacked', 'payments'].includes(kind)) return []
  return labels.map((label, index) => ({ id: `period-${index}`, label, ...datasetFor(kind, index) }))
}
const data = computed(() => datasetFor(variant.value))
const chartPeriods = computed(() => periodsFor(variant.value))
const gallery = computed(() => DITHER_CHART_VARIANTS.map((kind, index) => ({ variant: kind, title: copy.value.names[index]!, dataset: datasetFor(kind), periods: periodsFor(kind) })))
const selectedDifference = computed(() => DITHER_SOURCE_DIFFERENCES.find(item => ({ ActivityHeatmap: 'dither-heatmap', DeviceUsageChart: 'dither-device', DitherDonutChart: 'dither-donut', DitherFunnelChart: 'dither-funnel', DitherGrowthChart: 'dither-growth', DitherStackedChart: 'dither-stacked', RevenueLineChart: 'dither-revenue', ServerGauge: 'dither-gauge', StorageUsageChart: 'dither-storage', TrafficBubble: 'dither-traffic', UptimeChart: 'dither-uptime' } as Record<string, string>)[item.component] === variant.value))
const bookPages = computed(() => [{ id: 'distribution', title: copy.value.names[0], content: copy.value.names[0] }, { id: 'payments', title: copy.value.names[17], content: copy.value.names[17] }, { id: 'growth', title: copy.value.names[16], content: copy.value.names[16] }])

function backgroundFlip(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element) || target.closest('button, input, select, a, summary, .tx-flip-book, .tx-dither-chart')) return
  const element = event.currentTarget as HTMLElement
  const bounds = element.getBoundingClientRect()
  if (event.clientX > bounds.left + bounds.width / 2) book.value?.next()
  else book.value?.previous()
}

async function copyUsage(): Promise<void> {
  const code = `<TxDitherChart variant="${variant.value}" pattern="${pattern.value}" :series="series" :nodes="nodes" :cells="cells" />`
  try {
    await navigator.clipboard.writeText(code)
    copied.value = copy.value.copied
  } catch {
    copied.value = copy.value.failed
  }
}
</script>

<template>
  <div class="dither-demo not-prose">
    <div class="dither-demo__controls">
      <label :for="`${id}-variant`">{{ copy.variant }}</label>
      <select :id="`${id}-variant`" v-model="variant">
<option v-for="(kind, index) in DITHER_CHART_VARIANTS" :key="kind" :value="kind">
{{ copy.names[index] }} · {{ kind }}
</option>
</select>
      <label :for="`${id}-pattern`">{{ copy.pattern }}</label>
      <select :id="`${id}-pattern`" v-model="pattern">
<option v-for="texture in DITHER_PATTERNS" :key="texture" :value="texture">
{{ texture }}
</option>
</select>
      <label :for="`${id}-indicator`">{{ copy.indicator }}</label>
      <select :id="`${id}-indicator`" v-model="indicator">
<option>dot</option><option>line</option><option>dashed</option>
</select>
      <label><input v-model="animated" type="checkbox">{{ copy.animated }}</label>
      <label><input v-model="compact" type="checkbox">{{ copy.compact }}</label>
      <label :for="`${id}-multiplier`">{{ copy.scale }}: {{ multiplier.toFixed(2) }}</label>
      <input :id="`${id}-multiplier`" v-model.number="multiplier" type="range" min="0.25" max="1.5" step="0.05">
    </div>
    <p>{{ copy.note }}</p>
    <TxDitherChart :key="variant" v-model:hover="hovered" v-model:date-cursor="cursor" v-bind="data" :variant="variant" :pattern="pattern" :periods="chartPeriods" :title="title" :labels="copy.labels" :animated="animated" :compact="compact" :indicator="indicator" :height="180" />
    <div class="dither-demo__reading" role="status" aria-live="polite">
{{ copy.selected }}: {{ hovered ? `${hovered.label} · ${hovered.value}` : '—' }} · {{ copy.cursor }}: {{ cursor ?? '—' }}
</div>
    <button type="button" @click="copyUsage">
{{ copy.copy }}
</button><span role="status">{{ copied }}</span>
    <details>
      <summary>{{ copy.compare }}</summary>
      <p>{{ copy.difference }}</p>
      <p>{{ copy.dither }}</p><p>{{ copy.simple }}</p>
      <code>{{ selectedDifference ? `${selectedDifference.component}: ${selectedDifference.differences.join(', ')}` : copy.noDifference }}</code>
    </details>
    <details>
      <summary>{{ copy.gallery }}</summary>
      <div class="dither-demo__gallery">
        <div v-for="item in gallery" :key="item.variant" class="dither-demo__specimen">
          <TxDitherChart v-bind="item.dataset" :variant="item.variant" :pattern="pattern" :title="item.title" :animated="false" :height="120" :labels="copy.labels" compact />
          <button type="button" :aria-pressed="variant === item.variant" @click="variant = item.variant">
{{ item.title }}
</button><code>{{ item.variant }}</code>
        </div>
      </div>
    </details>
    <details>
      <summary>{{ copy.composition }}</summary>
      <div class="dither-demo__extracted" @click="backgroundFlip">
      <TxFlipBook ref="book" v-model="bookPage" :pages="bookPages" mode="extracted-book" size="lg" intro :animated="animated" :labels="copy">
        <template #page="{ page, index }">
          <div class="dither-demo__book-page">
            <svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" :r="32 + index * 8" fill="none" stroke="currentColor" stroke-width="14" stroke-dasharray="2 4" /><path d="M24 132L48 100 74 110 98 66 132 28" fill="none" stroke="currentColor" stroke-width="2" /></svg>
            <strong>{{ page.title }}</strong>
          </div>
        </template>
      </TxFlipBook>
      <div class="dither-demo__composition">
        <TxDitherChart v-for="kind in (['plan-card', 'payments', 'members-growth'] as const)" :key="kind" v-bind="datasetFor(kind)" :variant="kind" :periods="periodsFor(kind)" :title="copy.names[DITHER_CHART_VARIANTS.indexOf(kind)]" :labels="copy.labels" :animated="animated" :height="160" />
      </div>
      </div>
    </details>
  </div>
</template>

<style scoped>
.dither-demo { display: flex; flex-direction: column; gap: 12px; width: 100%; font-size: 13px; color: var(--tx-text-color-primary, #303133); }
.dither-demo p { margin: 0; color: var(--tx-text-color-regular, #606266); }
.dither-demo__controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dither-demo__controls label { display: inline-flex; align-items: center; gap: 4px; }
.dither-demo select, .dither-demo > button { font: inherit; color: inherit; background: var(--tx-bg-color, #fff); border: 0; box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6); border-radius: 6px; padding: 5px 8px; max-width: 100%; }
.dither-demo button, .dither-demo select, .dither-demo summary, .dither-demo input { cursor: pointer; }
.dither-demo details { border-top: 1px solid var(--tx-border-color-light, #e4e7ed); padding-top: 12px; }
.dither-demo summary { margin-bottom: 12px; font-weight: 500; }
.dither-demo__gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 12px; }
.dither-demo__specimen { position: relative; min-width: 0; display: flex; flex-direction: column; align-items: stretch; gap: 4px; box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6); border-radius: 8px; padding: 8px; background: var(--tx-bg-color, #fff); }
.dither-demo__specimen > button { appearance: none; border: 0; border-radius: 4px; color: inherit; background: transparent; font: inherit; padding: 4px; }
.dither-demo__specimen > button[aria-pressed='true'] { box-shadow: inset 0 0 0 2px var(--tx-chart-categorical-1, var(--tx-color-primary, #409eff)); }
.dither-demo__gallery code { font-size: 12px; overflow-wrap: anywhere; }
.dither-demo__reading { font-variant-numeric: tabular-nums; }
.dither-demo__extracted { padding: 16px; background: var(--tx-fill-color-light, #f5f7fa); border-radius: 12px; }
.dither-demo__composition { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 16px; margin-top: 16px; }
.dither-demo__book-page { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; text-align: center; }
.dither-demo__book-page svg { width: 75%; color: var(--tx-chart-categorical-1, var(--tx-color-primary, #409eff)); }
.dither-demo :focus-visible { outline: 2px solid var(--tx-color-primary, #409eff); outline-offset: 2px; }
</style>
