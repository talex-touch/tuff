<script setup lang="ts">
import type { ECharts, EChartsOption } from 'echarts'
import { hasDocument } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

interface Props {
  values: number[]
  labels?: string[]
  height?: number
  color?: string
  fillOpacity?: number
  showGrid?: boolean
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  labels: () => [],
  height: 72,
  color: '#3b82f6',
  fillOpacity: 0.16,
  showGrid: false,
  ariaLabel: 'Trend chart',
})

const chartRef = ref<HTMLElement | null>(null)
const chart = shallowRef<ECharts | null>(null)
const renderError = ref(false)

let resizeObserver: ResizeObserver | null = null

const points = computed(() => props.values.filter(value => Number.isFinite(value)))
const hasData = computed(() => points.value.length > 0)

const chartTheme = computed(() => {
  if (!hasDocument())
    return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
})

function buildOptions(): EChartsOption {
  const textColor = chartTheme.value === 'dark' ? 'rgba(255,255,255,0.68)' : 'rgba(15,23,42,0.68)'
  const gridColor = chartTheme.value === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.06)'
  const categories = points.value.map((_, index) => props.labels[index] ?? `${index + 1}`)

  return {
    backgroundColor: 'transparent',
    animationDuration: 420,
    animationEasing: 'cubicOut',
    grid: {
      left: 0,
      right: 0,
      top: props.showGrid ? 8 : 2,
      bottom: 2,
      containLabel: false,
    },
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      borderWidth: 0,
      padding: [7, 9],
      backgroundColor: chartTheme.value === 'dark' ? 'rgba(20,20,24,0.94)' : 'rgba(255,255,255,0.96)',
      textStyle: {
        color: textColor,
        fontSize: 12,
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: categories,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: {
        show: props.showGrid,
        lineStyle: { color: gridColor },
      },
    },
    series: [
      {
        name: props.ariaLabel,
        type: 'line',
        data: points.value,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: props.color,
          width: 2.4,
        },
        areaStyle: {
          color: props.color,
          opacity: props.fillOpacity,
        },
        emphasis: {
          focus: 'series',
        },
      },
    ],
  }
}

async function renderChart() {
  if (!chartRef.value || !hasData.value) {
    chart.value?.clear()
    return
  }

  try {
    renderError.value = false
    const echarts = await import('echarts/core')
    const charts = await import('echarts/charts')
    const components = await import('echarts/components')
    const renderer = await import('echarts/renderers')

    echarts.use([
      charts.LineChart,
      components.GridComponent,
      components.TooltipComponent,
      renderer.CanvasRenderer,
    ])

    if (!chart.value)
      chart.value = echarts.init(chartRef.value, undefined, { renderer: 'canvas' })

    chart.value.setOption(buildOptions(), true)
  }
  catch {
    renderError.value = true
  }
}

watch(
  () => [props.values, props.labels, props.color, props.fillOpacity, props.showGrid, chartTheme.value],
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
  <div class="DashboardSparklineChart" :aria-label="ariaLabel" role="img">
    <div
      v-if="hasData && !renderError"
      ref="chartRef"
      class="DashboardSparklineChart__canvas"
      :style="{ height: `${height}px` }"
    />
    <div v-else class="DashboardSparklineChart__empty" :style="{ height: `${height}px` }" />
  </div>
</template>

<style scoped>
.DashboardSparklineChart {
  min-width: 0;
}

.DashboardSparklineChart__canvas,
.DashboardSparklineChart__empty {
  width: 100%;
}

.DashboardSparklineChart__empty {
  border-radius: 14px;
  background: rgb(0 0 0 / 0.025);
}

.dark .DashboardSparklineChart__empty {
  background: rgb(255 255 255 / 0.035);
}
</style>
