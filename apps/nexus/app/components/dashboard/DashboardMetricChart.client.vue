<script setup lang="ts">
import type { ECharts, EChartsOption, SeriesOption } from 'echarts'
import { hasDocument } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

export interface DashboardMetricChartSeries {
  name: string
  values: number[]
  type?: 'line' | 'bar'
  color?: string
  stack?: string
  smooth?: boolean
}

interface Props {
  title?: string
  categories: string[]
  series: DashboardMetricChartSeries[]
  height?: number
  emptyText?: string
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  height: 220,
  emptyText: 'No chart data',
  title: '',
  ariaLabel: '',
})

const chartRef = ref<HTMLElement | null>(null)
const chart = shallowRef<ECharts | null>(null)
const renderError = ref<string | null>(null)

let resizeObserver: ResizeObserver | null = null

const hasData = computed(() => {
  return props.categories.length > 0
    && props.series.some(item => item.values.some(value => Number.isFinite(value) && value > 0))
})

const chartTheme = computed(() => {
  if (!hasDocument())
    return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
})

function normalizeSeries(item: DashboardMetricChartSeries): SeriesOption {
  const type = item.type ?? 'line'
  const color = item.color

  return {
    name: item.name,
    type,
    data: item.values,
    stack: item.stack,
    smooth: item.smooth ?? type === 'line',
    symbol: type === 'line' ? 'circle' : undefined,
    symbolSize: type === 'line' ? 6 : undefined,
    barMaxWidth: type === 'bar' ? 20 : undefined,
    emphasis: {
      focus: 'series',
    },
    lineStyle: color ? { color, width: 2 } : { width: 2 },
    itemStyle: color ? { color } : undefined,
    areaStyle: type === 'line'
      ? {
          opacity: 0.08,
        }
      : undefined,
  } as SeriesOption
}

function buildOptions(): EChartsOption {
  const textColor = chartTheme.value === 'dark' ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.68)'
  const mutedColor = chartTheme.value === 'dark' ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.24)'
  const gridColor = chartTheme.value === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'

  return {
    backgroundColor: 'transparent',
    animationDuration: 420,
    animationEasing: 'cubicOut',
    color: props.series.map(item => item.color).filter(Boolean) as string[],
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      borderWidth: 0,
      padding: [8, 10],
      backgroundColor: chartTheme.value === 'dark' ? 'rgba(20,20,24,0.94)' : 'rgba(255,255,255,0.96)',
      textStyle: {
        color: textColor,
        fontSize: 12,
      },
    },
    legend: {
      top: 0,
      right: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: {
        color: textColor,
        fontSize: 11,
      },
    },
    grid: {
      left: 4,
      right: 4,
      top: props.series.length > 1 ? 34 : 18,
      bottom: 0,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: props.series.some(item => item.type === 'bar'),
      data: props.categories,
      axisLine: {
        lineStyle: { color: gridColor },
      },
      axisTick: { show: false },
      axisLabel: {
        color: mutedColor,
        fontSize: 11,
        hideOverlap: true,
      },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: {
        lineStyle: { color: gridColor },
      },
      axisLabel: {
        color: mutedColor,
        fontSize: 11,
      },
    },
    series: props.series.map(normalizeSeries),
  }
}

async function renderChart() {
  if (!chartRef.value || !hasData.value) {
    chart.value?.clear()
    return
  }

  try {
    renderError.value = null
    const echarts = await import('echarts/core')
    const charts = await import('echarts/charts')
    const components = await import('echarts/components')
    const renderer = await import('echarts/renderers')

    echarts.use([
      charts.BarChart,
      charts.LineChart,
      components.GridComponent,
      components.LegendComponent,
      components.TooltipComponent,
      renderer.CanvasRenderer,
    ])

    if (!chart.value) {
      chart.value = echarts.init(chartRef.value, undefined, { renderer: 'canvas' })
    }

    chart.value.setOption(buildOptions(), true)
  }
  catch (error) {
    renderError.value = error instanceof Error ? error.message : String(error)
  }
}

watch(
  () => [props.categories, props.series, chartTheme.value],
  async () => {
    await nextTick()
    await renderChart()
  },
  { deep: true },
)

onMounted(async () => {
  await nextTick()
  await renderChart()

  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      chart.value?.resize()
    })
    resizeObserver.observe(chartRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  chart.value?.dispose()
  chart.value = null
})
</script>

<template>
  <div class="DashboardMetricChart" :aria-label="ariaLabel || title">
    <div v-if="title" class="DashboardMetricChart__title">
      {{ title }}
    </div>
    <div class="DashboardMetricChart__body" :style="{ height: `${height}px` }">
      <div
        v-if="hasData"
        ref="chartRef"
        class="DashboardMetricChart__canvas"
      />
      <div v-else class="DashboardMetricChart__empty">
        {{ emptyText }}
      </div>
      <div v-if="renderError" class="DashboardMetricChart__empty">
        {{ emptyText }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.DashboardMetricChart {
  min-width: 0;
}

.DashboardMetricChart__title {
  margin-bottom: 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: uppercase;
  color: rgb(0 0 0 / 0.38);
}

.dark .DashboardMetricChart__title {
  color: rgb(255 255 255 / 0.38);
}

.DashboardMetricChart__body {
  position: relative;
  min-height: 160px;
}

.DashboardMetricChart__canvas {
  width: 100%;
  height: 100%;
}

.DashboardMetricChart__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgb(0 0 0 / 0.025);
  color: rgb(0 0 0 / 0.42);
  font-size: 12px;
}

.dark .DashboardMetricChart__empty {
  background: rgb(255 255 255 / 0.035);
  color: rgb(255 255 255 / 0.45);
}
</style>
