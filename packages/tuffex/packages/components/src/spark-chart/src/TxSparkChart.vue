<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
//
// Upstream renders this through `liveline`, a React-only package, with every
// live capability switched off (`paused`, `scrub={false}`, `pulse={false}`,
// `momentum={false}`) — only the static polyline renderer is actually used, so
// this is a direct implementation of that subset instead of a dependency.

import type { DrawSeries } from './draw'
import type { SparkChartProps, SparkSeries } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAutoTheme } from '../../stream-markdown/src/use-auto-theme'
import { drawSparkChart } from './draw'
import { projectSeries, resolvePadding, resolveTimeDomain, resolveValueDomain } from './geometry'

defineOptions({ name: 'TxSparkChart' })

const props = withDefaults(defineProps<SparkChartProps>(), {
  theme: 'auto',
  grid: false,
  gridLines: 4,
  lineWidth: 2.25,
  padding: undefined,
  domain: undefined,
  ariaLabel: undefined,
})

// Series colours default to the BUI ramp rather than upstream's hard-coded
// dark-theme hexes (`#f68f3c` / `#3d9aff`), which read too bright in light mode.
const SERIES_TOKENS = ['--tx-bui-accent', '--tx-bui-orange', '--tx-bui-green', '--tx-bui-red'] as const
const SERIES_FALLBACKS = {
  light: ['#0285ff', '#ef720c', '#189a4d', '#e3474c'],
  dark: ['#3d9aff', '#f68f3c', '#3dbb72', '#ee5c61'],
} as const
const GRID_FALLBACK = { light: '#ecedef', dark: '#2e3033' } as const

const rootRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const box = ref({ width: 0, height: 0 })

const resolvedTheme = useAutoTheme(() => props.theme)
const resolvedPadding = computed(() => resolvePadding(props.padding))

let resizeObserver: ResizeObserver | null = null

function readToken(name: string, fallback: string): string {
  const el = rootRef.value
  if (!el || typeof getComputedStyle !== 'function')
    return fallback
  const value = getComputedStyle(el).getPropertyValue(name).trim()
  return value || fallback
}

function seriesColor(series: SparkSeries, index: number): string {
  if (series.color)
    return series.color
  const slot = index % SERIES_TOKENS.length
  return readToken(SERIES_TOKENS[slot]!, SERIES_FALLBACKS[resolvedTheme.value][slot]!)
}

function measure(): void {
  const el = rootRef.value
  if (!el)
    return
  box.value = { width: el.clientWidth, height: el.clientHeight }
}

function redraw(): void {
  const canvas = canvasRef.value
  const { width, height } = box.value
  if (!canvas || width <= 0 || height <= 0)
    return

  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)

  // jsdom and other canvas-less hosts: keep the element, skip the painting.
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return

  const projection = {
    width,
    height,
    padding: resolvedPadding.value,
  }
  const timeDomain = resolveTimeDomain(props.series)
  const valueDomain = resolveValueDomain(props.series, props.domain)

  const drawable: DrawSeries[] = props.series.map((series, index) => ({
    color: seriesColor(series, index),
    points: projectSeries(series, projection, timeDomain, valueDomain),
  }))

  drawSparkChart(ctx, {
    width,
    height,
    dpr,
    lineWidth: props.lineWidth,
    padding: resolvedPadding.value,
    grid: props.grid,
    gridLines: props.gridLines,
    gridColor: readToken('--tx-bui-line', GRID_FALLBACK[resolvedTheme.value]),
    series: drawable,
  })
}

onMounted(async () => {
  measure()
  await nextTick()
  redraw()

  if (rootRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      measure()
      redraw()
    })
    resizeObserver.observe(rootRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

// The canvas cannot inherit CSS variables, so a theme flip has to repaint —
// `useAutoTheme` watches both `data-theme` and the `.dark` class, on <html> and
// <body>, which is what the tuffex token layer keys off.
watch(
  [() => props.series, resolvedTheme, box, () => props.grid, () => props.gridLines, () => props.lineWidth, resolvedPadding, () => props.domain],
  () => redraw(),
  { deep: true, flush: 'post' },
)

defineExpose({ redraw })
</script>

<template>
  <div ref="rootRef" class="tx-bui-spark-chart">
    <canvas
      ref="canvasRef"
      class="tx-bui-spark-chart__canvas"
      :role="ariaLabel ? 'img' : undefined"
      :aria-label="ariaLabel"
      :aria-hidden="ariaLabel ? undefined : 'true'"
    />
  </div>
</template>

<style lang="scss">
.tx-bui-spark-chart {
  position: relative;
  width: 100%;
  height: 100%;
}

.tx-bui-spark-chart__canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
