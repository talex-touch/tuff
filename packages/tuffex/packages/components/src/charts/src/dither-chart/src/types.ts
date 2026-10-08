// Adapted from Amicro. MIT License — Copyright (c) 2026 SYED  SUBHAN UDDIN.
export const DITHER_CHART_VARIANTS = [
  'dither-donut', 'dither-stacked', 'dither-growth', 'dither-heatmap',
  'dither-gauge', 'dither-traffic', 'dither-funnel', 'dither-device',
  'dither-storage', 'dither-revenue', 'dither-uptime', 'dither-bar',
  'dither-radial', 'dither-scatter', 'dither-heatmap-grid',
  'dither-sparkline-matrix', 'members-growth', 'payments', 'plan-card',
] as const
export type DitherChartVariant = typeof DITHER_CHART_VARIANTS[number]
export const DITHER_PATTERNS = [
  'pixel', 'ordered', 'dot', 'hatched', 'duotone', 'striped', 'dotted',
  'area-gradient', 'primary-gradient', 'noise',
] as const
export type DitherPattern = typeof DITHER_PATTERNS[number]
export interface DitherPoint {
  /** Visible axis/date label. */
  label: string
  value: number
}
export interface DitherSeries {
  id: string
  label: string
  /** Donut, funnel, gauge and storage value; otherwise sum of data. */
  value?: number
  /** Gauge/storage denominator. Defaults to 100 for gauges. */
  capacity?: number
  data?: readonly DitherPoint[]
  /** Optional consumer colour; CSS variables are supported. */
  color?: string
  /** Consumer-provided display unit and change, never synthesized. */
  unit?: string
  change?: string
}
export interface DitherNode {
  id: string
  label: string
  /** Normalized position, 0–100; y grows upward for scatter, downward for traffic. */
  x: number
  y: number
  /** Traffic radius in logical CSS pixels. Scatter defaults to 7. */
  radius?: number
  value: number
  color?: string
}
export interface DitherCell {
  id: string
  label: string
  row: number
  column: number
  value: number
  /** Uptime status; otherwise derived from value (0, partial, 1). */
  status?: 'up' | 'degraded' | 'down'
}
export interface DitherDataset {
  series?: readonly DitherSeries[]
  nodes?: readonly DitherNode[]
  cells?: readonly DitherCell[]
}
export interface DitherPeriod extends DitherDataset {
  id: string
  label: string
}
export interface DitherHover {
  id: string
  seriesId?: string
  label: string
  value: number
}
export interface DitherChartLabels {
  empty?: string
  period?: string
  series?: string
  chart?: string
  total?: string
  capacity?: string
  less?: string
  more?: string
  cursor?: string
}
export interface DitherChartProps extends DitherDataset {
  variant?: DitherChartVariant
  pattern?: DitherPattern
  periods?: readonly DitherPeriod[]
  period?: string
  activeKeys?: readonly string[]
  selectedSeries?: string
  hover?: DitherHover | null
  /** Controlled point index for growth/revenue/member date cursors. */
  dateCursor?: number | null
  title?: string
  description?: string
  labels?: DitherChartLabels
  height?: number
  compact?: boolean
  animated?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Used by cell intensity and optional fixed chart bounds. */
  maxValue?: number
  showLegend?: boolean
  indicator?: 'dot' | 'line' | 'dashed'
  formatValue?: (value: number, label: string, series?: DitherSeries) => string
}
