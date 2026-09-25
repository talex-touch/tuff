// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

import type { LineCurve } from '../../charts/src/series/src/types'

export interface SparkPoint {
  /** Epoch seconds (or any monotonic x value). Uniform gaps read as an even series. */
  time: number
  value: number
}

export interface SparkSeries {
  id: string
  data: SparkPoint[]
  /** Stroke colour. Falls back to the BUI accent ramp by series order. */
  color?: string
  /** Used in hover announcements when provided. */
  label?: string
}

export interface SparkChartPadding {
  top: number
  right: number
  bottom: number
  left: number
}

export type SparkChartTheme = 'light' | 'dark' | 'auto'

export interface SparkChartProps {
  series: SparkSeries[]
  /** `auto` follows `data-theme` / `.dark` on `<html>` or `<body>`. @default 'auto' */
  theme?: SparkChartTheme
  /** Horizontal hairlines behind the series. @default false */
  grid?: boolean
  /** Number of horizontal hairlines when `grid` is on. @default 4 */
  gridLines?: number
  /** @default 2.25 — the upstream stroke weight. */
  lineWidth?: number
  /** `d3-shape` curve. @default 'monotone' */
  curve?: LineCurve
  /** Draw an x baseline and time ticks. @default false */
  xAxis?: boolean
  /** Draw a y baseline and value ticks. @default false */
  yAxis?: boolean
  /** Number of x tick labels. @default 3 */
  xTicks?: number
  /** Number of y tick labels. @default 4 */
  yTicks?: number
  /** Formats x tick values. The default uses UTC HH:MM for epoch values. */
  xTickFormat?: (time: number) => string
  /** Formats y tick values. @default compact decimal */
  yTickFormat?: (value: number) => string
  /** Inner inset in CSS pixels. @default { top: 24, right: 0, bottom: 22, left: 0 } */
  padding?: Partial<SparkChartPadding>
  /** Fixed value range; omit to fit the data. */
  domain?: [number, number]
  /** Controlled highlighted sample. Omit to let the chart own pointer and key state. */
  activeIndex?: number | null  /** Enables pointer, keyboard crosshair and value announcement. @default true */
  interactive?: boolean

  /**
   * Draw a dashed rule at each series' own starting value.
   *
   * Without a reference the eye can see that a line wobbles but not whether it
   * ended up above or below where it began. Per series rather than one shared
   * zero line, because two series on one spark chart rarely share a scale.
   *
   * @default true
   */
  baseline?: boolean

  /**
   * Draw a filled dot on each series' last sample.
   *
   * The line's end is the current value — the one number the reader is after —
   * and a stroke alone gives it no more weight than any midpoint.
   *
   * @default true
   */
  endpoint?: boolean
  /** Enables ECharts-parity enter and update motion. @default true */
  animation?: boolean
  /** Accessible name for the canvas (`role="img"`). */
  ariaLabel?: string
}

export interface SparkChartEmits {
  (e: 'update:activeIndex', index: number | null): void
  (e: 'hover', index: number): void
  (e: 'leave'): void
}

export interface ChartTooltipRow {
  label: string
  value: string
  /** Swatch colour; omit to hide the dot. */
  color?: string
}

export interface ChartScrubberProps {
  /** Number of samples the pointer maps onto. */
  pointCount: number
  /**
   * Controlled scrub position. Leave undefined to let the component own it —
   * the pointer index is a UI transient, so most hosts only need `@scrub`.
   */
  activeIndex?: number | null
  /** Tooltip rows for the active index. */
  rows?: ChartTooltipRow[]
  /** Caption above the rows, e.g. 'Today, 12:00'. */
  timeLabel?: string
  /** @default true — set false for a bare cursor line. */
  tooltip?: boolean
  /**
   * Gap kept between the tooltip and the stage edges, in px. The tooltip is
   * clamped only when it would overhang, so it tracks the pointer across the
   * whole width instead of freezing inside a fixed percentage band.
   * @default 8
   */
  anchorMargin?: number
  disabled?: boolean
}

export interface ChartScrubberEmits {
  (e: 'update:activeIndex', index: number | null): void
  (e: 'scrub', index: number): void
  (e: 'leave'): void
}
