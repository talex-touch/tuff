<script setup lang="ts">
import type { TimeseriesData } from '@talex-touch/tuffex/charts'
import { ChartPalette, TxChartLegendItem, TxTimeseriesChart } from '@talex-touch/tuffex/charts'

interface PercentileMetric {
  /** Series name, shared by the metric item and the chart series. */
  name: string
  /** Categorical palette slot for both the dot and the line. */
  colorIndex: number
  /** Reading shown as the large metric number. */
  value: string
  /** Level the generated series oscillates around, in ms. */
  baseline: number
  /** Peak deviation from the baseline. */
  amplitude: number
  /** Phase offset so the four series never move in lockstep. */
  phase: number
}

const metrics: PercentileMetric[] = [
  { name: 'P99', colorIndex: 0, value: '124', baseline: 75, amplitude: 9, phase: 0.4 },
  { name: 'P95', colorIndex: 1, value: '76', baseline: 37, amplitude: 6, phase: 1.7 },
  { name: 'P75', colorIndex: 2, value: '32', baseline: 19, amplitude: 4, phase: 2.9 },
  { name: 'P50', colorIndex: 3, value: '10', baseline: 7.2, amplitude: 1.8, phase: 4.1 },
]

const start = Date.UTC(2026, 8, 13, 18, 0, 9)
const step = 30_000
const pointCount = 40

/**
 * Deterministic jitter so the demo draws the same curve on every load —
 * `Math.random()` would make the screenshot unverifiable.
 */
function jitter(index: number, phase: number): number {
  const noise = Math.sin(index * 12.9898 + phase * 78.233) * 43_758.5453
  return noise - Math.floor(noise)
}

const data: TimeseriesData[] = metrics.map(metric => ({
  name: metric.name,
  color: ChartPalette.categoricalVar(metric.colorIndex),
  data: Array.from({ length: pointCount }, (_, index): [number, number] => [
    start + index * step,
    Math.round((metric.baseline + Math.sin(index / 4 + metric.phase) * metric.amplitude + jitter(index, metric.phase) * 2) * 1000) / 1000,
  ]),
}))

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })

const stampFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
})

function formatTime(timestamp: number): string {
  return timeFormat.format(new Date(timestamp))
}

function formatStamp(timestamp: number): string {
  return stampFormat.format(new Date(timestamp))
}

/** Tooltip readings keep up to three decimals so small P50 moves stay visible. */
function formatValue(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}
</script>

<template>
  <div class="charts-legend-dashboard">
    <div class="charts-legend-dashboard__metrics">
      <div v-for="metric in metrics" :key="metric.name" class="charts-legend-dashboard__metric">
        <TxChartLegendItem
          variant="large"
          :name="metric.name"
          :color="ChartPalette.categoricalVar(metric.colorIndex)"
          :value="metric.value"
          unit="ms"
        />
      </div>
    </div>
    <TxTimeseriesChart
      :data="data"
      :height="300"
      x-axis-name="Time (UTC)"
      :x-axis-tick-format="formatTime"
      :timestamp-format="formatStamp"
      :tooltip-value-format="formatValue"
      tooltip-footer="Percentiles use a five-minute rolling window."
    />
  </div>
</template>

<style scoped>
.charts-legend-dashboard {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.charts-legend-dashboard__metrics {
  display: flex;
  align-items: stretch;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--tx-chart-grid-line);
}

.charts-legend-dashboard__metric {
  display: flex;
  flex: 1 1 0;
  min-width: 0;
}

.charts-legend-dashboard__metric + .charts-legend-dashboard__metric {
  padding-left: 16px;
  border-left: 1px solid var(--tx-chart-grid-line);
}

/* Let each metric fill its column so the dividers read as column rules. */
.charts-legend-dashboard__metric :deep(.tx-chart-legend-item) {
  flex: 1;
}
</style>
