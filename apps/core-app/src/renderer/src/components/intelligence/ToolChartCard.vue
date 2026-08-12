<script lang="ts" name="ToolChartCard" setup>
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

/**
 * Renders a validated chart spec produced by the `tuff_render_chart` tool.
 *
 * The spec is declarative and was checked in the main process, so nothing the
 * model wrote is executed here — this maps fixed fields onto ECharts options.
 */
export interface ToolChartSpec {
  type: string
  title?: string
  labels: string[]
  series: Array<{ name?: string; values: number[] }>
  xLabel?: string
  yLabel?: string
  stacked?: boolean
  showValues?: boolean
}

const props = defineProps<{ spec: ToolChartSpec; dark?: boolean }>()

const hostRef = ref<HTMLElement | null>(null)
// `shallowRef`: an ECharts instance is a large mutable object and making it
// reactive would proxy its whole internal graph.
const chart = shallowRef<{
  setOption: (option: unknown) => void
  resize: () => void
  dispose: () => void
} | null>(null)
const failed = ref(false)
let observer: ResizeObserver | null = null

function buildOption(spec: ToolChartSpec): Record<string, unknown> {
  const label = spec.showValues ? { label: { show: true, fontSize: 10 } } : {}
  const legend =
    spec.series.length > 1 ? { legend: { bottom: 0, textStyle: { fontSize: 11 } } } : {}
  const common = {
    ...(spec.title
      ? { title: { text: spec.title, left: 'center', textStyle: { fontSize: 13 } } }
      : {}),
    tooltip: {},
    ...legend
  }

  // Radial and single-value families each need their own coordinate system, so
  // they are built whole rather than layered onto the cartesian defaults.
  if (spec.type === 'pie' || spec.type === 'doughnut') {
    // One ring only: later series would silently stack on top of each other.
    const values = spec.series[0]?.values ?? []
    return {
      ...common,
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: spec.type === 'doughnut' ? ['42%', '68%'] : '62%',
          data: spec.labels.map((name, index) => ({ name, value: values[index] ?? 0 })),
          ...label
        }
      ]
    }
  }

  if (spec.type === 'radar') {
    const max = Math.max(...spec.series.flatMap((entry) => entry.values), 0) || 1
    return {
      ...common,
      radar: { indicator: spec.labels.map((name) => ({ name, max })) },
      series: [
        {
          type: 'radar',
          data: spec.series.map((entry) => ({ name: entry.name, value: entry.values }))
        }
      ]
    }
  }

  if (spec.type === 'funnel') {
    const values = spec.series[0]?.values ?? []
    return {
      ...common,
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'funnel',
          data: spec.labels.map((name, index) => ({ name, value: values[index] ?? 0 })),
          ...label
        }
      ]
    }
  }

  if (spec.type === 'gauge') {
    // A gauge shows one reading; the first value is it.
    const value = spec.series[0]?.values[0] ?? 0
    return {
      ...common,
      legend: undefined,
      series: [
        {
          type: 'gauge',
          detail: { fontSize: 16, valueAnimation: true },
          data: [{ value, name: spec.series[0]?.name ?? spec.labels[0] ?? '' }]
        }
      ]
    }
  }

  if (spec.type === 'heatmap') {
    const rows = spec.series.map((entry) => entry.name ?? '')
    const data = spec.series.flatMap((entry, y) => entry.values.map((value, x) => [x, y, value]))
    const max = Math.max(...spec.series.flatMap((entry) => entry.values), 0) || 1
    return {
      ...common,
      legend: undefined,
      grid: { left: 60, right: 16, top: spec.title ? 48 : 24, bottom: 56 },
      xAxis: { type: 'category', data: spec.labels },
      yAxis: { type: 'category', data: rows },
      visualMap: { min: 0, max, calculable: true, orient: 'horizontal', left: 'center', bottom: 0 },
      series: [{ type: 'heatmap', data, ...label }]
    }
  }

  // Cartesian family: bar, line, area (a filled line) and scatter.
  return {
    ...common,
    tooltip: { trigger: 'axis' },
    grid: {
      left: 48,
      right: 16,
      top: spec.title ? 48 : 24,
      bottom: spec.series.length > 1 ? 44 : 28
    },
    xAxis: { type: 'category', data: spec.labels, ...(spec.xLabel ? { name: spec.xLabel } : {}) },
    yAxis: { type: 'value', ...(spec.yLabel ? { name: spec.yLabel } : {}) },
    series: spec.series.map((entry) => ({
      type: spec.type === 'area' ? 'line' : spec.type,
      ...(entry.name ? { name: entry.name } : {}),
      data: entry.values,
      ...(spec.type === 'line' || spec.type === 'area' ? { smooth: true } : {}),
      ...(spec.type === 'area' ? { areaStyle: {} } : {}),
      ...(spec.stacked && spec.type !== 'scatter' ? { stack: 'total' } : {}),
      ...label
    }))
  }
}

async function render(): Promise<void> {
  const host = hostRef.value
  if (!host) return

  try {
    // Imported on demand: charts are rare in a conversation and echarts is
    // heavy enough that the home surface should not pay for it up front.
    const echarts = await import('echarts')
    chart.value?.dispose()
    const instance = echarts.init(host, props.dark ? 'dark' : undefined, { renderer: 'canvas' })
    instance.setOption(buildOption(props.spec))
    chart.value = instance as unknown as typeof chart.value
    failed.value = false
  } catch {
    failed.value = true
  }
}

onMounted(() => {
  void render()
  if (typeof ResizeObserver !== 'undefined' && hostRef.value) {
    observer = new ResizeObserver(() => chart.value?.resize())
    observer.observe(hostRef.value)
  }
})

watch(
  () => [props.spec, props.dark],
  () => void render(),
  { deep: true }
)

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  chart.value?.dispose()
  chart.value = null
})
</script>

<template>
  <div class="ToolChartCard">
    <div v-show="!failed" ref="hostRef" class="ToolChartCard-Canvas" />
    <p v-if="failed" class="ToolChartCard-Failed" role="alert">
      {{ $t('home.chartFailed') }}
    </p>
  </div>
</template>

<style lang="scss" scoped>
.ToolChartCard {
  width: 100%;
}

.ToolChartCard-Canvas {
  width: 100%;
  height: 260px;
}

.ToolChartCard-Failed {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
}
</style>
