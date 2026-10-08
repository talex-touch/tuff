// Adapted from Amicro (MIT). Copyright (c) 2026 SYED  SUBHAN UDDIN.
export const MOTION_METRIC_CATALOG = [
  'm-cache-bandwidth', 'm-net-matrix', 'm-progress-piano', 'm-server-step',
  'm-overview-scrubber', 'm-sales-dual', 'm-sales-arc', 'm-sales-radial-dash',
  'm-credit-barcode', 'm-mono-stock', 'm-users-pill', 'm-views-wave',
  'm-mono-heatmap', 'm-timer-prep', 'm-noise-level',
] as const
export const MOTION_METRIC_COMPOSITES = [
  'animated-metric-card', 'budget', 'cache-stats-card', 'course-progress-card',
  'credit-score-cards', 'feedback-card', 'finance-dashboard', 'growth', 'growth-calendar',
  'health-cards', 'marketing-cards', 'network-telemetry', 'noise-cards', 'overview-chart',
  'progress-indicator', 'prompts-card', 'real-time-alerts', 'running-stats-card',
  'sales-dashboard', 'sales-overview', 'savings-cards', 'server-performance', 'status-cards',
  'stock-chart-card', 'system-metrics-card', 'timer-card', 'user-metrics',
  'users-chart-card', 'visitors-chart-card',
] as const
export const MOTION_METRIC_INTERACTIONS = [
  'cacheable-bandwidth-cost', 'sales-analytics-dual-bars', 'sales-target-segmented-arc',
  'sales-overview-radial-dashboard', 'users-growth-pill-progress', 'overview-bar-scrubber-card',
  'network-telemetry-matrix', 'progress-indicator-piano', 'server-performance-step-bars',
  'credit-score-barcode-meter', 'views-hourly-wave-chart', 'timer-preparation-segmented',
  'noise-decibel-level', 'mono-stock', 'mono-revenue', 'mono-credit', 'mono-wallet',
  'mono-savings', 'mono-heatmap', 'mono-activity-ring', 'mono-users', 'mono-kfactor',
  'mono-latency', 'mono-bandwidth', 'mono-server', 'mono-progress', 'mono-radar',
  'mono-timer-arc', 'mono-timer-ring',
] as const
export const MOTION_METRIC_VARIANTS = [...MOTION_METRIC_CATALOG, ...MOTION_METRIC_COMPOSITES, ...MOTION_METRIC_INTERACTIONS] as const
export type MotionMetricVariant = typeof MOTION_METRIC_VARIANTS[number]
export type MotionMetricInteraction = typeof MOTION_METRIC_INTERACTIONS[number]
export type MotionMetricTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
export interface MotionMetricPoint { label: string; value: number; description?: string; level?: number; tone?: MotionMetricTone }
export interface MotionMetricSeries {
  id: string
  label: string
  points: MotionMetricPoint[]
  unit?: string
  tone?: MotionMetricTone
}
export interface MotionMetricReadout {
  id: string
  label: string
  value: number | string
  unit?: string
  previous?: number
  target?: number
  description?: string
  status?: string
  tone?: MotionMetricTone
  grade?: string
}
export interface MotionMetricCell {
  id: string
  label: string
  value: number
  description?: string
  selected?: boolean
}
export interface MotionMetricGroup {
  id: string
  label: string
  value?: number
  target?: number
  unit?: string
  columns?: number
  cells?: MotionMetricCell[]
  metrics?: MotionMetricReadout[]
  period?: string
  periods?: MotionMetricPeriod[]
  series?: MotionMetricSeries[]
}
export interface MotionMetricStep { id: string; label: string; value: number; status?: string }
export interface MotionMetricProfile {
  id: string
  name: string
  initials?: string
  status: string
  detail?: string
  value?: number | string
  segments?: MotionMetricPoint[]
  flight?: { label: string; from: string; to: string; departure: string; arrival: string; progress: number }
}
export interface MotionMetricMessage { id: string; author: string; text: string; time?: string }
/** Caller-owned readouts. No generated business data or backend requests. */
export interface MotionMetricData {
  title?: string
  description?: string
  value?: number
  target?: number
  min?: number
  max?: number
  unit?: string
  previous?: number
  rank?: string
  status?: string
  remaining?: number
  total?: number
  threshold?: number
  columns?: number
  metrics?: MotionMetricReadout[]
  series?: MotionMetricSeries[]
  groups?: MotionMetricGroup[]
  cells?: MotionMetricCell[]
  weekdays?: string[]
  steps?: MotionMetricStep[]
  profiles?: MotionMetricProfile[]
  messages?: MotionMetricMessage[]
}
/** Selecting an option actually replaces its supplied data. Missing data stays empty. */
export interface MotionMetricPeriod { value: string; label: string; data: MotionMetricData }
export interface MotionMetricLabels {
  period: string
  empty: string
  details: string
  share: string
  more: string
  scrubber: string
  current: string
  target: string
  remaining: string
  low: string
  high: string
  minimum: string
  maximum: string
  threshold: string
  start: string
  pause: string
  message: string
  send: string
  all: string
  resume: string
  analysis: string
  average: string
}
export const MOTION_METRIC_DEFAULT_LABELS: MotionMetricLabels = {
  period: 'Period', empty: 'No data for this period', details: 'View details', share: 'Share', more: 'More actions',
  scrubber: 'Select a data point', current: 'Current', target: 'Target', remaining: 'Remaining',
  low: 'Low', high: 'High', minimum: 'Minimum', maximum: 'Maximum', threshold: 'Threshold',
  start: 'Start', pause: 'Pause', message: 'Message', send: 'Send', all: 'See all', resume: 'Resume',
  analysis: 'Analysis', average: 'Average',
}
export interface MotionMetricProps {
  variant?: MotionMetricVariant
  /** Dispatches the original AnimatedMetricCard's 29 interaction branches. */
  interaction?: MotionMetricInteraction
  data?: MotionMetricData
  series?: MotionMetricSeries[]
  metrics?: MotionMetricReadout[]
  status?: string
  period?: string
  periods?: MotionMetricPeriod[]
  filterStyle?: 'pills' | 'select'
  activeIndex?: number
  modelValue?: number
  range?: [number, number]
  running?: boolean
  message?: string
  disabled?: boolean
  animated?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  labels?: Partial<MotionMetricLabels>
  formatValue?: (value: number | string, unit?: string) => string
}
export interface MotionMetricEmits {
  (event: 'update:period', value: string): void
  (event: 'update:activeIndex', value: number): void
  (event: 'update:modelValue', value: number): void
  (event: 'update:range', value: [number, number]): void
  (event: 'update:running', value: boolean): void
  (event: 'update:message', value: string): void
  (event: 'select', value: { id: string; index: number }): void
  (event: 'filter', value: { groupId: string; period: string }): void
  (event: 'action', value: string): void
  (event: 'send', value: string): void
}
