<script setup lang="ts">
// Learning curves the way TensorBoard and Weights & Biases draw them: steps
// across, each run's metric smoothed by a debiased exponential moving average
// over its faint values as logged, and a run with several seeds as their mean
// inside a ± one-standard-deviation band. Built from the tuffex/charts
// primitives; it zooms and pans like TxTimeseriesChart, the value axis fits
// whatever is in view, and a window resting on the newest step follows a
// stream as it grows.

import type { CurveReadout, DrawnRun, LearningCurveProps } from './types'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { stepSpring } from '../../../../../../utils/animation/spring'
import { createFrameLoop } from '../../../../../../utils/frame-loop'
import { responseSpring } from '../../../../../../utils/gesture'
import { useReducedMotion } from '../../../../../../utils/use-reduced-motion'
import { TxAxis } from '../../axis'
import { TxChart } from '../../chart'
import { isBandScale } from '../../core/scales'
import { TxGrid } from '../../grid'
import { ChartPalette } from '../../palette'
import { TxChartTooltip } from '../../tooltip'
import { TxChartViewport } from '../../viewport'
import { aggregateSeeds, lowerBound, nearestIndex } from './smoothing'
import TxLearningCurveLayer from './TxLearningCurveLayer.vue'
import { LEARNING_CURVE_DEFAULT_LABELS } from './types'

defineOptions({ name: 'TxLearningCurve' })

const props = withDefaults(defineProps<LearningCurveProps>(), {
  smoothing: 0.6,
  showRaw: true,
  showBand: true,
  xType: 'linear',
  zoom: true,
  height: 300,
})

/** Runs hidden from the chart and tooltip, by name (drive it from a legend). */
const hiddenRuns = defineModel<string[]>('hiddenRuns', { default: () => [] })
/** The step window shown, `[from, to]`; `null` shows every step. */
const viewWindow = defineModel<[number, number] | null>('window', { default: null })

const chartRef = ref<InstanceType<typeof TxChart> | null>(null)
const ctx = computed(() => chartRef.value?.context ?? null)
const reduced = useReducedMotion()

const labels = computed(() => ({ ...LEARNING_CURVE_DEFAULT_LABELS, ...props.labels }))

// Smoothing is the only input the curves depend on besides the data, so
// hiding a run or moving the pointer does not smooth anything again.
const curves = computed<DrawnRun[]>(() =>
  props.runs.map((run, index) => ({
    key: run.name,
    // Colors follow a run's position, so hiding one does not repaint the rest.
    color: run.color ?? ChartPalette.categoricalVar(index),
    curve: aggregateSeeds(run.seeds ?? (run.data ? [run.data] : []), props.smoothing),
  })),
)

const visibleRuns = computed(() => curves.value.filter(run => !hiddenRuns.value.includes(run.key)))

/** With no smoothing the raw values are the line; there is nothing fainter to draw. */
const showRaw = computed(() => props.showRaw && props.smoothing > 0)

function formatStep(step: number): string {
  return props.stepFormat ? props.stepFormat(step) : step.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

function formatValue(value: number): string {
  return props.tooltipValueFormat ? props.tooltipValueFormat(value) : String(Number(value.toPrecision(4)))
}

// ── Axes ─────────────────────────────────────────────────────────────────────

const padding = computed(() => ({
  top: 24,
  right: 24,
  bottom: props.xAxisName ? 48 : 32,
  left: props.yAxisName ? 72 : 56,
}))

/** Steps run into the millions: by default ticks read `200k`, `1.5M`. */
const xTickFormat = computed(() => {
  const custom = props.xAxisTickFormat
  if (custom)
    return (value: number | Date | string) => custom(Number(value))
  const scale = ctx.value?.xScale.value
  if (!scale || isBandScale(scale) || 'tickFormat' in scale === false)
    return undefined
  const [d0, d1] = scale.domain().map(Number) as [number, number]
  // Below a thousand, SI would only add milli-steps to fractional ticks.
  if (Math.max(Math.abs(d0), Math.abs(d1)) < 1000)
    return undefined
  const format = scale.tickFormat(5, '~s')
  // d3 gives every tick the prefix of the largest one, so zero would read `0k`.
  return (value: number | Date | string) => Number(value) === 0 ? '0' : format(value as number & Date)
})

const yTickFormat = computed(() => {
  const custom = props.yAxisTickFormat
  return custom ? (value: number | Date | string) => custom(Number(value)) : undefined
})

/** The steps in view, or every step before the chart has a scale. */
function stepWindow(): [number, number] {
  const scale = ctx.value?.xScale.value
  if (!scale || isBandScale(scale))
    return [-Infinity, Infinity]
  const [d0, d1] = scale.domain().map(Number) as [number, number]
  return [Math.min(d0, d1), Math.max(d0, d1)]
}

/** A line's value where it crosses `step`, between the points either side of it. */
function valueAt(steps: readonly number[], values: readonly number[], step: number): number {
  const after = lowerBound(steps, step)
  if (after === 0 || after >= steps.length)
    return Number.NaN
  const x0 = steps[after - 1]!
  const x1 = steps[after]!
  const v0 = values[after - 1]!
  const v1 = values[after]!
  return x1 === x0 ? v1 : v0 + (v1 - v0) * (step - x0) / (x1 - x0)
}

/**
 * The value axis fits what is drawn in view: the smoothed lines, their bands
 * and the faint raw lines, including where each crosses the plot's edges.
 */
const yFit = computed<[number, number] | undefined>(() => {
  const [from, to] = stepWindow()
  const log = props.xType === 'log'
  let lo = Infinity
  let hi = -Infinity
  const take = (value: number): void => {
    if (Number.isFinite(value)) {
      lo = Math.min(lo, value)
      hi = Math.max(hi, value)
    }
  }
  for (const run of visibleRuns.value) {
    const { steps, raw, smoothed, spread } = run.curve
    const lines: Array<readonly number[]> = [smoothed]
    if (showRaw.value)
      lines.push(raw)
    const band = props.showBand && spread
    const first = Math.max(log ? lowerBound(steps, Number.MIN_VALUE) : 0, lowerBound(steps, from))
    for (let index = first; index < steps.length && steps[index]! <= to; index++) {
      for (const values of lines)
        take(values[index]!)
      if (band) {
        take(smoothed[index]! - spread[index]!)
        take(smoothed[index]! + spread[index]!)
      }
    }
    for (const edge of [from, to]) {
      if (!Number.isFinite(edge))
        continue
      for (const values of lines)
        take(valueAt(steps, values, edge))
      if (band) {
        const middle = valueAt(steps, smoothed, edge)
        const deviation = valueAt(steps, spread, edge)
        take(middle - deviation)
        take(middle + deviation)
      }
    }
  }
  if (lo > hi)
    return undefined
  const span = hi - lo
  const pad = span > 0 ? span * 0.05 : Math.abs(hi) * 0.1 || 1
  return [lo - pad, hi + pad]
})

// The value axis springs to a new fit rather than jumping, critically damped:
// a pan, a zoom, a toggled run and a fresh point all rescale it smoothly.
const Y_SPRING = responseSpring(0.35, 1)
const yDomain = ref<[number, number] | undefined>(yFit.value)
let yVelocity: [number, number] = [0, 0]
const yLoop = createFrameLoop(stepY)

function stopY(): void {
  yLoop.stop()
  yVelocity = [0, 0]
}

function stepY(dt: number): boolean {
  const goal = yFit.value
  const from = yDomain.value
  if (!goal || !from) {
    yDomain.value = goal
    yVelocity = [0, 0]
    return false
  }
  const [lo, vlo] = stepSpring(from[0], yVelocity[0], goal[0], Y_SPRING, dt)
  const [hi, vhi] = stepSpring(from[1], yVelocity[1], goal[1], Y_SPRING, dt)
  // At rest within a quarter pixel, moving under four pixels a second.
  const perPx = (goal[1] - goal[0]) / Math.max(1, ctx.value?.plot.value.height ?? props.height)
  if (
    Math.abs(lo - goal[0]) < perPx * 0.25 && Math.abs(hi - goal[1]) < perPx * 0.25
    && Math.abs(vlo) < perPx * 4 && Math.abs(vhi) < perPx * 4
  ) {
    yDomain.value = goal
    yVelocity = [0, 0]
    return false
  }
  yVelocity = [vlo, vhi]
  yDomain.value = [lo, hi]
  return true
}

watch(yFit, (goal) => {
  const from = yDomain.value
  if (!goal || !from || reduced.value) {
    stopY()
    yDomain.value = goal
    return
  }
  if (goal[0] === from[0] && goal[1] === from[1] && !yLoop.running())
    return
  yLoop.start()
})
onBeforeUnmount(stopY)

// ── Reading ──────────────────────────────────────────────────────────────────

/** The step nearest the reading: the crosshair snaps to data. */
const readStep = computed<number | null>(() => {
  const chart = ctx.value
  if (!chart || !chart.pointer.inside)
    return null
  const plot = chart.plot.value
  if (chart.pointer.x < plot.x || chart.pointer.x > plot.x + plot.width)
    return null
  const stop = chart.nearestXStop(chart.pointer.x)
  return stop === null ? null : Number(stop)
})

interface RunReading {
  run: DrawnRun
  index: number
}

/** Each visible run's point nearest `step`, for the runs whose steps reach it. */
function readingsAt(step: number): RunReading[] {
  const list: RunReading[] = []
  for (const run of visibleRuns.value) {
    const { steps, smoothed } = run.curve
    const first = props.xType === 'log' ? lowerBound(steps, Number.MIN_VALUE) : 0
    if (first >= steps.length || step < steps[first]! || step > steps[steps.length - 1]!)
      continue
    const index = Math.max(first, nearestIndex(steps, step))
    if (Number.isFinite(smoothed[index]!))
      list.push({ run, index })
  }
  return list
}

const readings = computed(() => (readStep.value === null ? [] : readingsAt(readStep.value)))

const readout = computed<CurveReadout | null>(() => {
  const step = readStep.value
  if (step === null)
    return null
  return { step, points: readings.value.map(({ run, index }) => ({ key: run.key, index })) }
})

/**
 * The run nearest the pointer's height at the step read, which every other
 * run dims behind, like ECharts' series focus; a legend's `highlightedRun`
 * applies when the pointer emphasizes nothing.
 */
const emphasized = computed<string | null>(() => {
  const chart = ctx.value
  const fallback = props.highlightedRun ?? null
  // A keyboard reading has no height: it reads every run alike.
  if (!chart || chart.pointer.source === 'keyboard' || readings.value.length < 2)
    return fallback
  const yScale = chart.yScale.value
  if (!yScale)
    return fallback
  const cursor = yScale.invert(chart.pointer.y)
  let focused = fallback
  let nearest = Infinity
  for (const { run, index } of readings.value) {
    const distance = Math.abs(run.curve.smoothed[index]! - cursor)
    if (distance < nearest) {
      nearest = distance
      focused = run.key
    }
  }
  return focused
})

interface TooltipRow {
  key: string
  color: string
  value: string
  spread: string | null
  raw: string | null
}

const tooltip = computed<{ title: string, rows: TooltipRow[] } | null>(() => {
  const step = readStep.value
  if (step === null || readings.value.length === 0)
    return null
  return {
    title: labels.value.step(formatStep(step)),
    rows: readings.value.map(({ run, index }) => {
      const { raw, smoothed, spread } = run.curve
      return {
        key: run.key,
        color: run.color,
        value: formatValue(smoothed[index]!),
        spread: props.showBand && spread ? `± ${formatValue(spread[index]!)}` : null,
        raw: props.smoothing > 0 ? formatValue(raw[index]!) : null,
      }
    }),
  }
})

// The tooltip fades out with the reading it last showed, not an empty box.
const shownTooltip = ref<{ title: string, rows: TooltipRow[] } | null>(null)
watch(tooltip, (next) => {
  if (next)
    shownTooltip.value = next
}, { flush: 'sync' })

/** What a keyboard reading says: the step, then each visible run's smoothed value. */
function announceAt(x: string | number): string {
  const step = Number(x)
  const title = labels.value.step(formatStep(step))
  const values = readingsAt(step).map(({ run, index }) => {
    const { smoothed, spread } = run.curve
    const deviation = props.showBand && spread ? ` ± ${formatValue(spread[index]!)}` : ''
    return `${run.key} ${formatValue(smoothed[index]!)}${deviation}`
  })
  return values.length > 0 ? `${title}: ${values.join(', ')}` : title
}
</script>

<template>
  <div class="tx-learning-curve">
    <TxChart
      ref="chartRef"
      :x-type="props.xType"
      :height="props.height"
      :width="props.width"
      :y-domain="yDomain"
      :y-nice="false"
      :padding="padding"
      :aria-description="props.ariaDescription"
      :announce="announceAt"
      :labels="labels"
    >
      <TxGrid y />
      <TxAxis position="bottom" :format="xTickFormat" :name="props.xAxisName" />
      <TxAxis position="left" :format="yTickFormat" :name="props.yAxisName" :name-gap="props.yAxisNameGap ?? 56" />
      <TxLearningCurveLayer
        :runs="visibleRuns"
        :show-raw="showRaw"
        :show-band="props.showBand"
        :emphasized="emphasized"
        :readout="readout"
      />
      <TxChartViewport
        v-if="props.zoom"
        v-model:window="viewWindow"
        :format="formatStep"
      />

      <template #overlay>
        <TxChartTooltip :open="tooltip !== null">
          <template #default>
            <div class="tx-learning-curve__title">
              {{ shownTooltip?.title }}
            </div>
            <div
              v-for="row in shownTooltip?.rows ?? []"
              :key="row.key"
              class="tx-learning-curve__row"
              :class="{ 'is-emphasized': row.key === emphasized }"
            >
              <span class="tx-learning-curve__dot" :style="{ backgroundColor: row.color }" />
              <span class="tx-learning-curve__name">{{ row.key }}</span>
              <span class="tx-learning-curve__value">{{ row.value }}</span>
              <span v-if="row.spread" class="tx-learning-curve__muted">{{ row.spread }}</span>
              <span v-if="row.raw" class="tx-learning-curve__muted">{{ labels.raw }} {{ row.raw }}</span>
            </div>
          </template>
        </TxChartTooltip>
      </template>
    </TxChart>
  </div>
</template>

<style lang="scss" scoped>
.tx-learning-curve {
  width: 100%;

  &__title {
    margin-bottom: 0.25rem;
    color: var(--tx-chart-text-secondary, #9ca3af);
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-block: 0.125rem;

    &.is-emphasized {
      font-weight: var(--tx-font-weight-semibold, 600);
    }
  }

  &__dot {
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }

  &__name {
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__value {
    font-weight: var(--tx-font-weight-medium, 500);
    font-variant-numeric: tabular-nums;
  }

  &__muted {
    color: var(--tx-chart-text-secondary, #9ca3af);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
}
</style>
