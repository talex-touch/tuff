/**
 * Shared analytics types.
 */

export type AnalyticsWindowType = '1m' | '5m' | '15m' | '1h' | '24h'

export interface CoreMetrics {
  ipc?: {
    requestCount?: number
    avgLatency?: number
    p50Latency?: number
    p95Latency?: number
    p99Latency?: number
    errorCount?: number
    slowRequests?: number
  }
  system?: {
    cpuUsage?: number
    memoryUsed?: number
    memoryTotal?: number
    heapUsed?: number
    heapTotal?: number
  }
  modules?: Record<string, {
    operationCount?: number
    avgDuration?: number
    errorCount?: number
  }>
  plugins?: Record<string, {
    featureCalls?: Record<string, number>
    totalCalls?: number
    avgResponseTime?: number
    topFeatures?: Array<{ id: string, count: number }>
  }>
  search?: {
    totalSearches?: number
    avgDuration?: number
    providerTimings?: Record<string, number>
  }
}

export interface AnalyticsSnapshot {
  windowType: AnalyticsWindowType
  timestamp: number
  metrics: CoreMetrics
}

export interface AnalyticsRangeRequest {
  windowType: AnalyticsWindowType
  from: number
  to: number
}

export interface AnalyticsExportPayload extends AnalyticsRangeRequest {
  format?: 'json' | 'csv'
  dimensions?: Array<'ipc' | 'system' | 'modules' | 'plugins' | 'search'>
}

export interface AnalyticsExportResult {
  format: 'json' | 'csv'
  content: string
  payload: AnalyticsExportPayload
  exportedAt: number
}

export interface PluginStats {
  featureCalls: Record<string, number>
  totalCalls: number
  avgResponseTime: number
  topFeatures: Array<{ id: string, count: number }>
  counters: Record<string, number>
  gauges: Record<string, number>
  histograms: Record<string, number[]>
}

export interface FeatureStats {
  count: number
  avgDuration: number
  lastDuration?: number
}

export interface TrackEventPayload {
  eventName: string
  featureId?: string
  metadata?: Record<string, unknown>
  pluginName?: string
  pluginVersion?: string
}

export interface TrackDurationPayload {
  operationName: string
  durationMs: number
  featureId?: string
  pluginName?: string
  pluginVersion?: string
}

export interface CounterPayload {
  name: string
  value?: number
  pluginName?: string
  pluginVersion?: string
}

export interface GaugePayload {
  name: string
  value: number
  pluginName?: string
  pluginVersion?: string
}

export interface HistogramPayload {
  name: string
  value: number
  pluginName?: string
  pluginVersion?: string
}

export type AnalyticsMessageStatus = 'unread' | 'read' | 'archived'
export type AnalyticsMessageSeverity = 'info' | 'warn' | 'error'
export type AnalyticsMessageSource = 'analytics' | 'sentry' | 'update' | 'permission' | 'system'

export interface AnalyticsMessage {
  id: string
  source: AnalyticsMessageSource
  severity: AnalyticsMessageSeverity
  title: string
  message: string
  meta?: Record<string, unknown>
  status: AnalyticsMessageStatus
  createdAt: number
}

export interface AnalyticsMessageListRequest {
  status?: AnalyticsMessageStatus | 'all'
  source?: AnalyticsMessageSource
  since?: number
  limit?: number
}

export interface AnalyticsMessageUpdateRequest {
  id: string
  status: AnalyticsMessageStatus
}

export interface PluginAnalyticsSDK {
  trackEvent: (eventName: string, metadata?: Record<string, unknown>, featureId?: string) => Promise<void>
  trackDuration: (operationName: string, durationMs: number, featureId?: string) => Promise<void>
  measure: <T>(operationName: string, fn: () => T | Promise<T>) => Promise<T>
  getStats: () => Promise<PluginStats>
  getFeatureStats: (featureId: string) => Promise<FeatureStats>
  getTopFeatures: (limit?: number) => Promise<Array<{ id: string, count: number }>>
  incrementCounter: (name: string, value?: number) => Promise<void>
  setGauge: (name: string, value: number) => Promise<void>
  recordHistogram: (name: string, value: number) => Promise<void>
}
