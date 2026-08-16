// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

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
  /** Only used by hosts building legends; the canvas draws no labels. */
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
  /** Inner inset in CSS pixels. @default { top: 24, right: 0, bottom: 22, left: 0 } */
  padding?: Partial<SparkChartPadding>
  /** Fixed value range; omit to fit the data. */
  domain?: [number, number]
  /** Accessible name for the canvas (`role="img"`). */
  ariaLabel?: string
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
  /** Anchor clamp so the tooltip never overhangs the stage. @default 28 / 72 */
  anchorMin?: number
  anchorMax?: number
  disabled?: boolean
}

export interface ChartScrubberEmits {
  (e: 'update:activeIndex', index: number | null): void
  (e: 'scrub', index: number): void
  (e: 'leave'): void
}
