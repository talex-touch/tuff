import type { DocAnalyticsResponse } from '~/types/docs-engagement'

export interface AnalyticsData {
  summary: {
    totalEvents: number
    totalUsers: number
    totalSearches: number
    avgSearchDuration: number
    avgQueryLength: number
    avgSortingDuration: number
    avgResultCount: number
    avgFirstResultMs: number
    searchSlowCount: number
    avgExecuteLatency: number
    performance: {
      longTaskCount: number
      longTaskTotalMs: number
      longTaskMaxMs: number
      longTaskAvgMs: number
      rafJankCount: number
      rafJankTotalMs: number
      rafJankMaxMs: number
      rafJankAvgMs: number
      eventLoopDelayP95AvgMs: number
      eventLoopDelayMaxMs: number
      unresponsiveCount: number
      unresponsiveTotalMs: number
      unresponsiveMaxMs: number
      unresponsiveAvgMs: number
    }
    dailyStats: Array<{
      date: string
      visits: number
      searches: number
      avgDuration: number
    }>
    deviceDistribution: Record<string, number>
    regionDistribution: Record<string, number>
    hourlyDistribution: Record<string, number>
    searchSceneDistribution: Record<string, number>
    searchInputTypeDistribution: Record<string, number>
    searchProviderDistribution: Record<string, number>
    searchProviderResultDistribution: Record<string, number>
    searchResultCategoryDistribution: Record<string, number>
    providerMetrics: Array<{
      provider: string
      calls: number
      avgDuration: number
      p95Duration: number
      maxDuration: number
      resultCount: number
      errorCount: number
      timeoutCount: number
      slowCount: number
      slowRate: number
    }>
    featureUseSourceTypeDistribution: Record<string, number>
    featureUseItemKindDistribution: Record<string, number>
    featureUsePluginDistribution: Record<string, number>
    featureUseCategoryDistribution: Record<string, number>
    updateActionDistribution: Record<string, number>
    updateStageDistribution: Record<string, number>
    updateResultDistribution: Record<string, number>
    updateChannelDistribution: Record<string, number>
    updateSourceDistribution: Record<string, number>
    updateTagDistribution: Record<string, number>
    updateItemKindDistribution: Record<string, number>
    versionDistribution: Record<string, number>
    moduleLoadMetrics: Array<{
      module: string
      avgDuration: number
      maxDuration: number
      minDuration: number
      ratio: number
    }>
  }
  realtime: {
    searchesLast24h: number
    visitsLast24h: number
    activeUsers: number
    avgLatency: number
  }
}

export interface GeoAnalyticsData {
  summary: {
    totalSearches: number
    uniqueIps: number
    countryCount: number
    subdivisionCount: number
  }
  countries: Array<{
    countryCode: string
    count: number
    latitude: number | null
    longitude: number | null
  }>
  subdivisions: Array<{
    countryCode: string
    regionCode: string | null
    regionName: string | null
    count: number
    latitude: number | null
    longitude: number | null
  }>
  topIps: Array<{
    ip: string
    count: number
    lastSeenAt: string
    countryCode: string | null
    regionCode: string | null
    city: string | null
  }>
  generatedAt: string
}

export interface ExchangeRateHistoryItem {
  baseCurrency: string
  targetCurrency: string
  rate: number
  fetchedAt: number
  providerUpdatedAt?: number | null
}

export interface ExchangeRateSnapshotSummary {
  id: string
  baseCurrency: string
  fetchedAt: number
  providerUpdatedAt?: number | null
  providerNextUpdateAt?: number | null
  payload?: Record<string, unknown>
}

export interface GeoMapPoint {
  id: string
  label: string
  latitude: number | null
  longitude: number | null
  value: number
}

export interface TelemetryMessage {
  id: string
  source: string
  severity: 'info' | 'warn' | 'error'
  title: string
  message: string
  status: string
  createdAt: string
}

export interface IntelligenceAnalyticsData {
  summary: {
    days: number
    totalRuns: number
    successRuns: number
    failureRuns: number
    successRate: number
    fallbackRate: number
    approvalHitRate: number
    recoveryRate: number
    streamCoverageRate: number
    retryRunRate: number
    disconnectPauseRate: number
    checkpointLossRate: number
    totalActions: number
    completedActions: number
    failedActions: number
    waitingApprovals: number
    avgDurationMs: number
    p95DurationMs: number
  }
  statusDistribution: Record<string, number>
  toolFailureDistribution: Array<{ toolId: string, count: number }>
  recentRuns: Array<{
    sessionId: string
    status: string
    providerName: string | null
    model: string
    fallbackCount: number
    approvalHitCount: number
    durationMs: number
    createdAt: string
  }>
}

export type { DocAnalyticsResponse }
