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
  const common = {
    ...(spec.title
      ? { title: { text: spec.title, left: 'center', textStyle: { fontSize: 13 } } }
      : {}),
    tooltip: { trigger: spec.type === 'pie' ? 'item' : 'axis' },
    grid: { left: 40, right: 16, top: spec.title ? 44 : 20, bottom: 28 }
  }

  if (spec.type === 'pie') {
    // A pie has one ring: later series would silently stack on top of each other.
    const values = spec.series[0]?.values ?? []
    return {
      ...common,
      grid: undefined,
      series: [
        {
          type: 'pie',
          radius: ['38%', '68%'],
          data: spec.labels.map((label, index) => ({ name: label, value: values[index] ?? 0 }))
        }
      ]
    }
  }

  return {
    ...common,
    xAxis: { type: 'category', data: spec.labels },
    yAxis: { type: 'value' },
    ...(spec.series.length > 1 ? { legend: { bottom: 0, textStyle: { fontSize: 11 } } } : {}),
    series: spec.series.map((entry) => ({
      type: spec.type === 'scatter' ? 'scatter' : spec.type,
      ...(entry.name ? { name: entry.name } : {}),
      data: entry.values,
      ...(spec.type === 'line' ? { smooth: true } : {})
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
