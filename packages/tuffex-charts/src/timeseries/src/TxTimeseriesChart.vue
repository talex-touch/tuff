<script setup lang="ts">
// High-level timeseries chart with the kumo TimeseriesChart feature set,
// composed from the tuffex-charts primitives (no echarts).

import type { TooltipRow } from '../../tooltip'
import type { TimeseriesChartProps, TimeseriesData, TimeseriesMarkerCluster } from './types'
import { computed, getCurrentInstance, onBeforeUnmount, ref, watch } from 'vue'
import { TxAxis } from '../../axis'
import { TxChart } from '../../chart'
import { TxGrid } from '../../grid'
import { ChartPalette } from '../../palette'
import { TxAreaSeries, TxBarSeries, TxLineSeries } from '../../series'
import { TxChartTooltip } from '../../tooltip'
import { formatTimestamp } from './format'
import { splitIncompleteSegments } from './incomplete'
import { clusterTimeseriesMarkers, getApproximateMarkerClusterInterval } from './markers'
import { getAllTooltipRowsAtTimestamp, limitTooltipRows } from './tooltip-data'
import TxTimeseriesAnnotations from './TxTimeseriesAnnotations.vue'
import TxTimeseriesBrush from './TxTimeseriesBrush.vue'
import TxTimeseriesSkeleton from './TxTimeseriesSkeleton.vue'

defineOptions({ name: 'TxTimeseriesChart' })

const props = withDefaults(defineProps<TimeseriesChartProps>(), {
  type: 'line',
  xAxisTickCount: 5,
  yAxisTickCount: 5,
  tooltipMode: 'all',
  tooltipMaxItems: 10,
  tooltipFollowCursor: 'both',
  gradient: false,
  loading: false,
  height: 350,
  clusterLabel: (count: number) => `${count} changes`,
  timestampFormat: formatTimestamp,
})

const emit = defineEmits<{
  /** Fired when the user selects a time range via brush selection. */
  timeRangeChange: [from: number, to: number]
}>()

/** Series hidden from the chart and tooltip (drive it from a custom legend). */
const hiddenSeries = defineModel<string[]>('hiddenSeries', { default: () => [] })

const chartRef = ref<InstanceType<typeof TxChart> | null>(null)
const ctx = computed(() => chartRef.value?.context ?? null)

// Colors are fixed by original series position, so toggling series does not
// reshuffle the palette of the remaining ones.
function seriesColor(series: TimeseriesData, index: number): string {
  return series.color ?? ChartPalette.categoricalVar(index)
}

const visibleSeries = computed(() =>
  props.data
    .map((series, index) => ({
      series,
      color: seriesColor(series, index),
      segments: splitIncompleteSegments(
        series.data,
        props.type === 'line' ? props.incomplete?.before : undefined,
        props.type === 'line' ? props.incomplete?.after : undefined,
      ),
    }))
    .filter(entry => !hiddenSeries.value.includes(entry.series.name)),
)

const tupleX = (d: [number, number]): number => d[0]
const tupleY = (d: [number, number]): number => d[1]

// Dim non-highlighted series; falls through to each series' root <g>.
function seriesOpacity(name: string): number | undefined {
  const highlighted = props.highlightedSeries
  return highlighted && name !== highlighted ? 0.3 : undefined
}

const allTimestamps = computed(() => [
  ...props.data.flatMap(series => series.data.map(point => point[0])),
  ...(props.markers ?? []).map(marker => marker.timestamp),
])

const xDomain = computed<[number, number] | undefined>(() => {
  const stamps = allTimestamps.value
  if (stamps.length === 0)
    return undefined
  return [Math.min(...stamps), Math.max(...stamps)]
})

const yDomain = computed<[number, number] | undefined>(() => {
  let lo = Infinity
  let hi = -Infinity

  if (props.type === 'bar') {
    // Bars stack: the domain must cover per-timestamp totals, not series maxima.
    const totals = new Map<number, number>()
    for (const { series } of visibleSeries.value) {
      for (const [ts, value] of series.data)
        totals.set(ts, (totals.get(ts) ?? 0) + value)
    }
    for (const total of totals.values()) {
      lo = Math.min(lo, Math.min(0, total))
      hi = Math.max(hi, Math.max(0, total))
    }
  }
  else {
    for (const { series } of visibleSeries.value) {
      for (const [, value] of series.data) {
        lo = Math.min(lo, value)
        hi = Math.max(hi, value)
      }
    }
  }

  for (const threshold of props.thresholds ?? []) {
    lo = Math.min(lo, threshold.value)
    hi = Math.max(hi, threshold.value)
  }

  if (lo > hi)
    return undefined
  // Value axes include zero (echarts/kumo default), extended by thresholds.
  return [Math.min(lo, 0), Math.max(hi, 0)]
})

const padding = computed(() => ({
  top: 24,
  right: 24,
  bottom: props.xAxisName ? 48 : 32,
  left: props.yAxisName ? 72 : 56,
}))

const clusters = computed<TimeseriesMarkerCluster[]>(() =>
  clusterTimeseriesMarkers(
    props.markers,
    getApproximateMarkerClusterInterval(allTimestamps.value, props.xAxisTickCount),
    props.clusterLabel,
  ),
)

const xTickFormat = computed(() =>
  props.xAxisTickFormat
    ? (value: number | Date | string) =>
        props.xAxisTickFormat!(value instanceof Date ? value.getTime() : Number(value))
    : undefined,
)

const yTickFormat = computed(() =>
  props.yAxisTickFormat
    ? (value: number | Date | string) => props.yAxisTickFormat!(Number(value))
    : undefined,
)

// ── Tooltip state ────────────────────────────────────────────────────────────

const hoveredCluster = ref<TimeseriesMarkerCluster | null>(null)

const pointerTimestamp = computed<number | null>(() => {
  const chart = ctx.value
  if (!chart || !chart.pointer.inside)
    return null
  const scale = chart.xScale.value
  if (!scale || !('invert' in scale))
    return null
  const plot = chart.plot.value
  if (chart.pointer.x < plot.x || chart.pointer.x > plot.x + plot.width)
    return null
  const inverted = scale.invert(chart.pointer.x)
  return inverted instanceof Date ? inverted.getTime() : inverted
})

function formatValue(value: number): string {
  return props.tooltipValueFormat ? props.tooltipValueFormat(value) : String(value)
}

const tooltipData = computed<{ title: string, rows: TooltipRow[], hiddenCount: number } | null>(() => {
  const chart = ctx.value
  const ts = hoveredCluster.value?.timestamp ?? pointerTimestamp.value
  if (ts === null || ts === undefined)
    return null

  const allRows = getAllTooltipRowsAtTimestamp(
    props.data,
    ts,
    hiddenSeries.value,
    seriesColor,
  )

  let limited = limitTooltipRows(allRows, props.tooltipMaxItems)
  if (!hoveredCluster.value && props.tooltipMode === 'single' && chart) {
    const yScale = chart.yScale.value
    const cursorValue = yScale ? yScale.invert(chart.pointer.y) : null
    if (cursorValue !== null && allRows.length > 0) {
      const nearest = allRows.reduce((best, row) =>
        Math.abs(row.value - cursorValue) < Math.abs(best.value - cursorValue) ? row : best)
      limited = { rows: [nearest], hiddenCount: 0 }
    }
  }

  return {
    title: props.timestampFormat(ts),
    rows: limited.rows.map(row => ({
      name: row.name,
      color: row.color,
      value: formatValue(row.value),
    })),
    hiddenCount: limited.hiddenCount,
  }
})

const tooltipOpen = computed(() => tooltipData.value !== null)

const crosshairX = computed<number | null>(() => {
  const chart = ctx.value
  if (!chart || !chart.pointer.inside || hoveredCluster.value)
    return null
  return chart.pointer.x
})

// Fallback close: after a native context menu the browser can drop the events
// that would flip `pointer.inside`, leaving the tooltip stuck open. Any mouse
// move outside the chart recovers from that. (Same workaround as kumo.)
function closeWhenOutside(event: MouseEvent): void {
  const chart = ctx.value
  const container = chart?.container.value
  if (!chart || !container)
    return
  const rect = container.getBoundingClientRect()
  if (
    event.clientX < rect.left || event.clientX > rect.right
    || event.clientY < rect.top || event.clientY > rect.bottom
  ) {
    hoveredCluster.value = null
    chart.pointer.inside = false
  }
}

// Client-only by construction: the watcher fires on pointer interaction and
// unmount hooks don't run during SSR, so no environment guard is needed.
watch(tooltipOpen, (open) => {
  if (open)
    window.addEventListener('mousemove', closeWhenOutside)
  else
    window.removeEventListener('mousemove', closeWhenOutside)
})
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', closeWhenOutside)
})

// ── Brush ────────────────────────────────────────────────────────────────────

// Declared emits don't appear in attrs; the vnode props carry the listener.
const brushEnabled = computed(() => {
  const vnodeProps = getCurrentInstance()?.vnode.props
  return Boolean(vnodeProps && 'onTimeRangeChange' in vnodeProps)
})

function onBrushRange(from: number, to: number): void {
  emit('timeRangeChange', from, to)
}
</script>

<template>
  <div class="tx-timeseries" :aria-busy="props.loading || undefined">
    <TxTimeseriesSkeleton v-if="props.loading" :height="props.height" :type="props.type" />
    <TxChart
      v-else
      ref="chartRef"
      x-type="time"
      :height="props.height"
      :width="props.width"
      :x-domain="xDomain"
      :y-domain="yDomain"
      :padding="padding"
      :aria-description="props.ariaDescription"
    >
      <TxGrid y :ticks="props.yAxisTickCount" />
      <TxAxis
        position="bottom"
        :ticks="props.xAxisTickCount"
        :format="xTickFormat"
        :name="props.xAxisName"
      />
      <TxAxis
        position="left"
        :ticks="props.yAxisTickCount"
        :format="yTickFormat"
        :name="props.yAxisName"
      />

      <template v-for="entry in visibleSeries" :key="entry.series.name">
        <TxBarSeries
          v-if="props.type === 'bar'"
          :data="entry.series.data"
          :x="tupleX"
          :y="tupleY"
          stack="total"
          :color="entry.color"
          :opacity="seriesOpacity(entry.series.name)"
        />
        <template v-else>
          <TxAreaSeries
            v-if="props.gradient"
            :data="entry.segments.complete"
            :x="tupleX"
            :y="tupleY"
            :color="entry.color"
            gradient
            :opacity="seriesOpacity(entry.series.name)"
          />
          <TxLineSeries
            v-else
            :data="entry.segments.complete"
            :x="tupleX"
            :y="tupleY"
            :color="entry.color"
            :opacity="seriesOpacity(entry.series.name)"
          />
          <TxLineSeries
            v-if="entry.segments.before.length > 0"
            :data="entry.segments.before"
            :x="tupleX"
            :y="tupleY"
            :color="entry.color"
            dashed
            :opacity="seriesOpacity(entry.series.name)"
          />
          <TxLineSeries
            v-if="entry.segments.after.length > 0"
            :data="entry.segments.after"
            :x="tupleX"
            :y="tupleY"
            :color="entry.color"
            dashed
            :opacity="seriesOpacity(entry.series.name)"
          />
        </template>
      </template>

      <TxTimeseriesAnnotations
        :clusters="clusters"
        :thresholds="props.thresholds"
        :crosshair-x="crosshairX"
        @marker-enter="hoveredCluster = $event"
        @marker-leave="hoveredCluster = null"
      />
      <TxTimeseriesBrush v-if="brushEnabled" @range="onBrushRange" />

      <template #overlay>
        <TxChartTooltip
          :open="tooltipOpen"
          :follow="props.tooltipFollowCursor"
          :title="tooltipData?.title"
          :rows="tooltipData?.rows"
          :hidden-count="tooltipData?.hiddenCount ?? 0"
        >
          <template v-if="hoveredCluster" #default>
            <div
              v-if="hoveredCluster.markers.length === 1"
              class="tx-timeseries__marker-time"
            >
              {{ props.timestampFormat(hoveredCluster.timestamp) }}
            </div>
            <div
              v-for="(marker, index) in hoveredCluster.markers"
              :key="index"
              class="tx-timeseries__marker-entry"
            >
              <div class="tx-timeseries__marker-label">
                {{ marker.label ?? props.timestampFormat(marker.timestamp) }}
              </div>
              <div v-if="marker.description" class="tx-timeseries__marker-desc">
                {{ marker.description }}
              </div>
            </div>
            <div
              v-for="row in tooltipData?.rows ?? []"
              :key="row.name"
              class="tx-timeseries__marker-row"
            >
              <span class="tx-timeseries__marker-dot" :style="{ backgroundColor: row.color }" />
              <span class="tx-timeseries__marker-name">{{ row.name }}</span>
              <span class="tx-timeseries__marker-value">{{ row.value }}</span>
            </div>
          </template>
        </TxChartTooltip>
      </template>
    </TxChart>
  </div>
</template>

<style lang="scss" scoped>
.tx-timeseries {
  width: 100%;

  &__marker-time {
    margin-bottom: 0.25rem;
    color: var(--tx-chart-text-secondary, #9ca3af);
  }

  &__marker-entry {
    margin-bottom: 0.25rem;
  }

  &__marker-label {
    font-weight: 600;
  }

  &__marker-desc {
    color: var(--tx-chart-text-secondary, #9ca3af);
  }

  &__marker-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-block: 0.125rem;
  }

  &__marker-dot {
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }

  &__marker-name {
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__marker-value {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
}
</style>
