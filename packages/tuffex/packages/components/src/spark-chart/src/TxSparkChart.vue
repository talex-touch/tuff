<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

import type { DrawAxisTick, DrawSeries } from './draw'
import type { SparkChartEmits, SparkChartProps, SparkSeries } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ANIMATION_THRESHOLD, easings, ENTER_DURATION, UPDATE_DURATION, useEnterProgress, useTweenedNumbers } from '../../charts/src/core/animate'
import { useAutoTheme } from '../../stream-markdown/src/use-auto-theme'
import { drawSparkChart } from './draw'
import { clamp, indexFromPointerX, projectSeries, resolvePadding, resolveTimeDomain, resolveValueDomain } from './geometry'

defineOptions({ name: 'TxSparkChart' })

const props = withDefaults(defineProps<SparkChartProps>(), {
  theme: 'auto',
  grid: false,
  gridLines: 4,
  lineWidth: 2.25,
  curve: 'monotone',
  xAxis: false,
  yAxis: false,
  xTicks: 3,
  yTicks: 4,
  xTickFormat: undefined,
  yTickFormat: undefined,
  padding: undefined,
  domain: undefined,
  activeIndex: undefined,
  interactive: true,
  baseline: true,
  endpoint: true,
  animation: true,
  ariaLabel: undefined,
})

const emit = defineEmits<SparkChartEmits>()

const SERIES_TOKENS = ['--tx-bui-accent', '--tx-bui-orange', '--tx-bui-green', '--tx-bui-red'] as const
const SERIES_FALLBACKS = {
  light: ['#0285ff', '#ef720c', '#189a4d', '#e3474c'],
  dark: ['#3d9aff', '#f68f3c', '#3dbb72', '#ee5c61'],
} as const
const GRID_FALLBACK = { light: '#ecedef', dark: '#2e3033' } as const

const rootRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const box = ref({ width: 0, height: 0 })
const internalIndex = ref<number | null>(null)

const resolvedTheme = useAutoTheme(() => props.theme)
const resolvedPadding = computed(() => {
  const padding = resolvePadding(props.padding)
  return {
    ...padding,
    left: props.yAxis ? Math.max(36, padding.left) : padding.left,
    bottom: props.xAxis ? Math.max(24, padding.bottom) : padding.bottom,
  }
})
const timeDomain = computed(() => resolveTimeDomain(props.series))
const valueDomain = computed(() => resolveValueDomain(props.series, props.domain))
const pointCount = computed(() => Math.max(0, ...props.series.map(series => series.data.length)))
const activeIndex = computed(() => props.activeIndex === undefined ? internalIndex.value : props.activeIndex)

const rawDrawable = computed<DrawSeries[]>(() => {
  const projection = { width: box.value.width, height: box.value.height, padding: resolvedPadding.value }
  return props.series.map((series, index) => ({
    color: seriesColor(series, index),
    points: projectSeries(series, projection, timeDomain.value, valueDomain.value),
  }))
})

const totalPoints = computed(() => rawDrawable.value.reduce((count, series) => count + series.points.length, 0))
const enterProgress = useEnterProgress({
  duration: ENTER_DURATION,
  easing: easings.cubicInOut,
  enabled: () => props.animation && totalPoints.value <= ANIMATION_THRESHOLD,
})
const tweenedGeometry = useTweenedNumbers(
  () => rawDrawable.value.flatMap(series => series.points.flatMap(point => [point.x, point.y])),
  {
    duration: UPDATE_DURATION,
    easing: easings.cubicInOut,
    enabled: () => props.animation && enterProgress.value >= 1 && totalPoints.value <= ANIMATION_THRESHOLD,
  },
)
const drawable = computed<DrawSeries[]>(() => {
  let cursor = 0
  return rawDrawable.value.map((series) => ({
    color: series.color,
    points: series.points.map((point) => {
      const x = tweenedGeometry.value[cursor++] ?? point.x
      const y = tweenedGeometry.value[cursor++] ?? point.y
      return { x, y }
    }),
  }))
})

const xAxisTicks = computed(() => makeTicks(timeDomain.value, props.xTicks, (value) =>
  props.xTickFormat?.(value) ?? formatTime(value, timeDomain.value[1] - timeDomain.value[0]),
))
const yAxisTicks = computed(() => makeTicks(valueDomain.value, props.yTicks, value => props.yTickFormat?.(value) ?? formatValue(value)))
const announcement = computed(() => {
  const index = activeIndex.value
  if (index === null)
    return ''
  return props.series
    .map(series => `${series.label ?? series.id}: ${formatValue(series.data[index]?.value ?? 0)}`)
    .join(', ')
})

/**
 * Published for `TxChartScrubber`: it wraps this chart and draws the crosshair
 * and tooltip, which must land on the plot box rather than the stage.
 */
const plotInsetStyle = computed(() => ({
  '--tx-bui-plot-left': `${resolvedPadding.value.left}px`,
  '--tx-bui-plot-right': `${resolvedPadding.value.right}px`,
}))

let resizeObserver: ResizeObserver | null = null

function readToken(name: string, fallback: string): string {
  const el = rootRef.value
  if (!el || typeof getComputedStyle !== 'function')
    return fallback
  const value = getComputedStyle(el).getPropertyValue(name).trim()
  return value || fallback
}

function seriesColor(series: SparkSeries, index: number): string {
  const slot = index % SERIES_TOKENS.length
  const fallback = SERIES_FALLBACKS[resolvedTheme.value][slot]!
  if (!series.color)
    return readToken(SERIES_TOKENS[slot]!, fallback)

  // SVG can consume `var(--token)` directly; a CanvasRenderingContext2D cannot.
  // Resolve the token on the chart root before assigning a stroke/fill style.
  const token = /^var\(\s*(--[\w-]+)/.exec(series.color)?.[1]
  return token ? readToken(token, fallback) : series.color
}

function makeTicks(domain: [number, number], count: number, format: (value: number) => string): DrawAxisTick[] {
  const safeCount = Math.max(2, Math.floor(count))
  const [min, max] = domain
  const span = max - min || 1
  const horizontal = domain === timeDomain.value
  const length = horizontal
    ? Math.max(0, box.value.width - resolvedPadding.value.left - resolvedPadding.value.right)
    : Math.max(0, box.value.height - resolvedPadding.value.top - resolvedPadding.value.bottom)
  const origin = horizontal ? resolvedPadding.value.left : resolvedPadding.value.top

  return Array.from({ length: safeCount }, (_, index) => {
    const ratio = index / (safeCount - 1)
    const value = horizontal ? min + ratio * span : max - ratio * span
    return { position: origin + ratio * length, label: format(value) }
  })
}

function formatValue(value: number): string {
  if (!Number.isFinite(value))
    return '–'
  const precision = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2
  return Number(value.toFixed(precision)).toString()
}

function formatTime(value: number, span: number): string {
  if (Math.abs(value) < 100000000)
    return formatValue(value)
  const date = new Date(value * 1000)
  const hours = `${date.getUTCHours()}`.padStart(2, '0')
  const minutes = `${date.getUTCMinutes()}`.padStart(2, '0')
  return span >= 86400 ? `${date.getUTCMonth() + 1}/${date.getUTCDate()}` : `${hours}:${minutes}`
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

  const ctx = canvas.getContext('2d')
  if (!ctx)
    return

  drawSparkChart(ctx, {
    width,
    height,
    dpr,
    lineWidth: props.lineWidth,
    padding: resolvedPadding.value,
    grid: props.grid,
    gridLines: props.gridLines,
    gridColor: readToken('--tx-bui-line', GRID_FALLBACK[resolvedTheme.value]),
    curve: props.curve,
    xAxis: props.xAxis,
    yAxis: props.yAxis,
    xTicks: xAxisTicks.value,
    yTicks: yAxisTicks.value,
    axisColor: readToken('--tx-bui-line-strong', GRID_FALLBACK[resolvedTheme.value]),
    axisTextColor: readToken('--tx-bui-ink-3', '#9a9da3'),
    axisFont: `10px ${readToken('--tx-font-family', 'system-ui, sans-serif')}`,
    activeIndex: activeIndex.value,
    activeColor: readToken('--tx-bui-ink-2', '#62656b'),
    revealProgress: enterProgress.value,
    baseline: props.baseline,
    endpointRadius: props.endpoint ? props.lineWidth + 0.6 : 0,
    series: drawable.value,
  })
}

function commitIndex(next: number | null): void {
  if (next === activeIndex.value)
    return
  if (props.activeIndex === undefined)
    internalIndex.value = next
  emit('update:activeIndex', next)
  if (next === null)
    emit('leave')
  else
    emit('hover', next)
}

function indexFromPointer(event: PointerEvent): number {
  const rect = rootRef.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0)
    return 0
  return indexFromPointerX(event.clientX, rect, pointCount.value, {
    left: resolvedPadding.value.left,
    right: resolvedPadding.value.right,
  })
}

function handlePointer(event: PointerEvent): void {
  if (!props.interactive || pointCount.value === 0)
    return
  commitIndex(indexFromPointer(event))
}

function handleKeydown(event: KeyboardEvent): void {
  if (!props.interactive || pointCount.value === 0)
    return
  const current = activeIndex.value ?? 0
  const next = event.key === 'ArrowRight' || event.key === 'ArrowUp'
    ? clamp(current + 1, 0, pointCount.value - 1)
    : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
      ? clamp(current - 1, 0, pointCount.value - 1)
      : event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? pointCount.value - 1
          : event.key === 'Escape'
            ? null
            : undefined
  if (next === undefined)
    return
  event.preventDefault()
  commitIndex(next)
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

watch(
  [rawDrawable, drawable, enterProgress, activeIndex, xAxisTicks, yAxisTicks, resolvedTheme, resolvedPadding],
  redraw,
  { deep: true, flush: 'post' },
)

defineExpose({ redraw })
</script>

<template>
  <div
    ref="rootRef"
    class="tx-bui-spark-chart"
    :class="{ 'is-interactive': interactive }"
    :style="plotInsetStyle"
    :tabindex="interactive ? 0 : undefined"
    @pointermove="handlePointer"
    @pointerleave="() => commitIndex(null)"
    @keydown="handleKeydown"
  >
    <canvas
      ref="canvasRef"
      class="tx-bui-spark-chart__canvas"
      :role="ariaLabel ? 'img' : undefined"
      :aria-label="ariaLabel"
      :aria-hidden="ariaLabel ? undefined : 'true'"
    />
    <span class="tx-bui-spark-chart__announcement" aria-live="polite">{{ announcement }}</span>
  </div>
</template>

<style lang="scss">
.tx-bui-spark-chart {
  position: relative;
  width: 100%;
  height: 100%;
  outline: none;

  &.is-interactive {
    cursor: crosshair;

    &:focus-visible {
      box-shadow: inset 0 0 0 2px var(--tx-bui-accent, #0285ff);
    }
  }
}

.tx-bui-spark-chart__canvas {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.tx-bui-spark-chart__announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
