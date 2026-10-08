// Adapted from Amicro (MIT). Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { ComputedRef, InjectionKey } from 'vue'
import type { MotionMetricData, MotionMetricLabels, MotionMetricTone, MotionMetricVariant } from './types'
import { inject } from 'vue'
export interface MetricContext {
  data: ComputedRef<MotionMetricData>
  labels: ComputedRef<MotionMetricLabels>
  active: ComputedRef<boolean>
  disabled: ComputedRef<boolean>
  index: ComputedRef<number>
  value: ComputedRef<number | undefined>
  range: ComputedRef<[number, number]>
  running: ComputedRef<boolean>
  message: ComputedRef<string>
  format: (value: number | string | undefined, unit?: string) => string
  select: (index: number, id?: string) => void
  setValue: (value: number) => void
  setRange: (value: [number, number]) => void
  setRunning: (value: boolean) => void
  setMessage: (value: string) => void
  action: (value: string) => void
  filterGroup: (groupId: string, period: string) => void
  send: () => void
}
export const metricContextKey: InjectionKey<MetricContext> = Symbol('MotionMetric')
export function useMetricContext(): MetricContext {
  const context = inject(metricContextKey)
  if (!context) throw new Error('Metric presentation requires TxMotionMetric')
  return context
}
export function ratio(value: number | undefined, target = 100, min = 0): number {
  if (value === undefined || !Number.isFinite(value) || target <= min) return 0
  return Math.max(0, Math.min(1, (value - min) / (target - min)))
}
export function toneColor(tone?: MotionMetricTone, index = 0): string {
  return tone === 'neutral' ? 'var(--tx-text-color-primary)' : tone
    ? `var(--tx-color-${tone})`
    : `var(--tx-chart-categorical-${index % 6 + 1}, var(--tx-color-primary))`
}
export const catalogKinds: Partial<Record<MotionMetricVariant, string>> = {
  'm-cache-bandwidth': 'cacheable-bandwidth-cost', 'm-net-matrix': 'network-telemetry-matrix',
  'm-progress-piano': 'progress-indicator-piano', 'm-server-step': 'server-performance-step-bars',
  'm-overview-scrubber': 'overview-bar-scrubber-card', 'm-sales-dual': 'sales-analytics-dual-bars',
  'm-sales-arc': 'sales-target-segmented-arc', 'm-sales-radial-dash': 'sales-overview-radial-dashboard',
  'm-credit-barcode': 'credit-score-barcode-meter', 'm-mono-stock': 'mono-stock',
  'm-users-pill': 'users-growth-pill-progress', 'm-views-wave': 'views-hourly-wave-chart',
  'm-mono-heatmap': 'mono-heatmap', 'm-timer-prep': 'timer-preparation-segmented',
  'm-noise-level': 'noise-decibel-level',
}
