<script setup lang="ts">
import type { EChartsCoreOption, EChartsType } from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { init, use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { OPENUI_CONTEXT } from './context'

const props = defineProps<{ spec: Record<string, unknown> }>()
use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, AriaComponent, SVGRenderer])
const ctx = inject(OPENUI_CONTEXT)!
const element = ref<HTMLElement>()
let chart: EChartsType | undefined
let resize: ResizeObserver | undefined
let theme: MutationObserver | undefined
function draw() {
  if (!element.value) return
  try {
    const spec = props.spec
    const rows = (Array.isArray(spec.data) ? spec.data : []).filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    const series = (Array.isArray(spec.series) ? spec.series : []).map(String)
    const x = String(spec.x ?? '')
    const styles = getComputedStyle(element.value)
    const primary = styles.getPropertyValue('--tx-color-primary').trim() || '#409eff'
    const colors = [primary, styles.getPropertyValue('--tx-color-success').trim() || '#67c23a', styles.getPropertyValue('--tx-color-warning').trim() || '#e6a23c', styles.getPropertyValue('--tx-color-danger').trim() || '#f56c6c']
    const text = styles.color
    const border = styles.getPropertyValue('--tx-border-color-light').trim() || '#e4e7ed'
    const pie = spec.type === 'pie'
    const format = (value: number) => {
      if (spec.format === 'percent') return `${value}%`
      if (spec.format === 'currency') {
        try { return value.toLocaleString(undefined, { style: 'currency', currency: String(spec.currency ?? 'USD'), maximumFractionDigits: 2 }) }
        catch { return String(value) }
      }
      return value.toLocaleString()
    }
    const option: EChartsCoreOption = {
      animation: false,
      color: colors,
      textStyle: { color: text, fontFamily: styles.fontFamily },
      aria: { enabled: true },
      tooltip: { trigger: pie ? 'item' : 'axis', renderMode: 'richText', valueFormatter: (value: unknown) => format(Number(value)) },
      legend: { show: !pie && series.length > 1, textStyle: { color: text }, bottom: 0 },
      ...(pie ? {} : {
        grid: { left: 12, right: 12, top: 20, bottom: series.length > 1 ? 36 : 12, containLabel: true },
        xAxis: { type: 'category', data: rows.map(row => String(row[x] ?? '')), axisLabel: { color: text }, axisLine: { lineStyle: { color: border } } },
        yAxis: { type: 'value', axisLabel: { color: text, formatter: format }, splitLine: { lineStyle: { color: border } } },
      }),
      series: pie
        ? [{ type: 'pie', radius: '72%', label: { color: text }, data: rows.map(row => ({ name: String(row[x] ?? ''), value: Number(row[series[0] ?? 'value']) || 0 })) }]
        : series.map(name => ({ name, type: spec.type === 'bar' ? 'bar' : 'line', ...(spec.type === 'area' ? { areaStyle: { opacity: 0.18 } } : {}), ...(spec.stacked ? { stack: 'total' } : {}), data: rows.map(row => Number(row[name]) || 0) })),
    }
    chart ??= init(element.value, undefined, { renderer: 'svg' })
    chart.setOption(option, { notMerge: true })
  }
  catch { ctx.notice(ctx.labels.value.chartError ?? 'This chart could not be rendered.') }
}
onMounted(() => {
  draw()
  if (typeof ResizeObserver !== 'undefined') {
    resize = new ResizeObserver(() => chart?.resize())
    resize.observe(element.value!)
  }
  theme = new MutationObserver(draw)
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] })
})
watch(() => props.spec, async () => { await nextTick(); draw() })
onBeforeUnmount(() => { resize?.disconnect(); theme?.disconnect(); chart?.dispose() })
</script>

<template>
  <div ref="element" class="tx-ai-openui__chart" role="img" :aria-label="`${spec.type} chart of ${Array.isArray(spec.series) ? spec.series.join(', ') : ''}`" :style="{ height: `${Math.max(160, Math.min(640, Number(spec.height ?? 260)))}px` }" />
</template>
