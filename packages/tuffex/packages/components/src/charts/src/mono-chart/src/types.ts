// Adapted from Amicro mono-charts (MIT).
// Copyright (c) 2026 SYED  SUBHAN UDDIN
import type { SankeyLinkData, SankeyNodeData } from '../../sankey/src/types'

export const MONO_CHART_VARIANTS = [
  'mono-activity-green', 'mono-activity-blue', 'mono-activity-purple',
  'mono-rounded-line', 'mono-rounded-bar', 'mono-rounded-area', 'mono-rounded-donut',
  'mono-rounded-composed', 'mono-rounded-scatter', 'mono-rounded-candlestick',
  'mono-rounded-kpi', 'mono-rounded-pyramid', 'mono-rounded-radial-group',
  'mono-rounded-gauge-arc', 'mono-rounded-bullet', 'mono-rounded-sankey',
  'mono-rounded-step', 'mono-rounded-stacked-bar', 'mono-rounded-radar',
  'mono-rounded-radial-gauge', 'mono-rounded-funnel', 'mono-rounded-heatmap',
  'mono-rounded-sparkline', 'mono-rounded-bubble', 'mono-rounded-treemap',
  'mono-rounded-stream', 'mono-rounded-meter', 'mono-rounded-waterfall',
  'mono-rounded-polar', 'mono-rounded-range',
] as const
export type MonoChartVariant = typeof MONO_CHART_VARIANTS[number] | 'github-activity'
export type MonoChartSeriesMode = 'single' | 'dual'
export type MonoChartLayout = 'col' | 'row'
export type MonoChartCurve = 'monotone' | 'natural'
export type MonoChartAccent = 'green' | 'blue' | 'purple' | 'mono'
export interface MonoChartPoint { x: string | number, value: number }
export interface MonoChartSeries {
  id?: string
  name: string
  data: MonoChartPoint[]
  /** Sparkline row readout; absent means the latest numeric value. */
  metric?: string | number
  opacity?: number
}
export interface MonoChartItem {
  label: string
  value: number
  /** Ring/gauge/bullet upper bound. */
  max?: number
  target?: number
  opacity?: number
}
export interface MonoChartScatterPoint { label: string, x: number, y: number, z?: number }
export interface MonoChartCandle { x: string | number, open: number, high: number, low: number, close: number }
export interface MonoChartRange { x: string | number, min: number, max: number }
export interface MonoChartWaterfall { label: string, delta: number, base?: number, total?: boolean }
export interface MonoChartMatrixRow { label: string, values: number[] }
export interface MonoChartContribution { date: string, count: number, level: 0 | 1 | 2 | 3 | 4 }
export interface MonoChartRepo { name: string, count: number, href?: string, logo?: string }
export interface MonoChartTreeNode { label: string, value?: number, children?: MonoChartTreeNode[] }
export interface MonoChartData {
  categories?: Array<string | number>
  series?: MonoChartSeries[]
  items?: MonoChartItem[]
  points?: MonoChartScatterPoint[]
  candles?: MonoChartCandle[]
  ranges?: MonoChartRange[]
  waterfall?: MonoChartWaterfall[]
  matrix?: MonoChartMatrixRow[]
  contributions?: MonoChartContribution[]
  repos?: MonoChartRepo[]
  nodes?: SankeyNodeData[]
  links?: SankeyLinkData[]
  tree?: MonoChartTreeNode[]
  metric?: string | number
  metricLabel?: string
  change?: string
}
export interface MonoChartPeriod {
  value: string
  label: string
  /** Inclusive numeric or ISO-date range. Without a range, periodData drives the switch. */
  range?: [string | number, string | number]
}
export interface MonoChartLabels {
  single?: string
  dual?: string
  col?: string
  row?: string
  monotone?: string
  natural?: string
  showLine?: string
  hideLine?: string
  repositories?: string
  expand?: string
  collapse?: string
  empty?: string
  loading?: string
  error?: string
  retry?: string
  less?: string
  more?: string
  target?: string
  open?: string
  high?: string
  low?: string
  close?: string
  x?: string
  y?: string
  z?: string
  min?: string
  max?: string
  delta?: string
  balance?: string
}
export interface MonoChartHit {
  key: string
  label: string
  rows: Array<{ name: string, value: number | string }>
  value?: number
  x: number
  y: number
}
export type MonoChartActivityLoader = (username: string, signal: AbortSignal) => Promise<Pick<MonoChartData, 'contributions' | 'repos'>>
export interface MonoChartProps {
  variant?: MonoChartVariant
  /** The caller owns every business value; an empty input renders an empty state. */
  data?: MonoChartData
  width?: number
  height?: number
  title?: string
  ariaLabel?: string
  compact?: boolean
  seriesMode?: MonoChartSeriesMode
  layout?: MonoChartLayout
  curve?: MonoChartCurve
  showLine?: boolean
  controls?: boolean
  periods?: MonoChartPeriod[]
  period?: string
  periodData?: Record<string, MonoChartData>
  centerMetric?: string | number
  centerLabel?: string
  showTooltip?: boolean
  showLegend?: boolean
  showMonths?: boolean
  months?: number
  cellSize?: number
  /** Overrides the activity palette with one color or five intensity colors. */
  accent?: string | string[]
  accentColor?: MonoChartAccent
  open?: boolean
  defaultOpen?: boolean
  year?: number
  /** github-activity only; omitted data is loaded from the public GitHub APIs. */
  username?: string
  activityLoader?: MonoChartActivityLoader
  labels?: MonoChartLabels
  /** Explicit month-header locale keeps SSR and hydration deterministic. */
  locale?: string
  formatValue?: (value: number) => string
}
export interface MonoChartEmits {
  (e: 'update:seriesMode', value: MonoChartSeriesMode): void
  (e: 'update:layout', value: MonoChartLayout): void
  (e: 'update:curve', value: MonoChartCurve): void
  (e: 'update:showLine', value: boolean): void
  (e: 'update:period', value: string): void
  (e: 'update:open', value: boolean): void
  (e: 'hover', hit: MonoChartHit | null): void
  (e: 'select', hit: MonoChartHit): void
  (e: 'load', data: Pick<MonoChartData, 'contributions' | 'repos'>): void
  (e: 'error', error: Error): void
}
