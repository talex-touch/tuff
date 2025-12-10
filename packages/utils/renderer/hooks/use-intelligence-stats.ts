import type { Ref } from 'vue'
import { ref } from 'vue'
import { useChannel } from './use-channel'

/**
 * Usage summary for a specific period
 */
export interface IntelligenceUsageSummary {
  period: string
  periodType: 'minute' | 'day' | 'month'
  requestCount: number
  successCount: number
  failureCount: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  totalCost: number
  avgLatency: number
}

/**
 * Audit log entry
 */
export interface IntelligenceAuditLogEntry {
  traceId: string
  timestamp: number
  capabilityId: string
  provider: string
  model: string
  promptHash?: string
  caller?: string
  userId?: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  latency: number
  success: boolean
  error?: string
  estimatedCost?: number
}

/**
 * Current usage for a caller
 */
export interface CurrentUsage {
  requestsThisMinute: number
  requestsToday: number
  requestsThisMonth: number
  tokensThisMinute: number
  tokensToday: number
  tokensThisMonth: number
  costToday: number
  costThisMonth: number
}

/**
 * Quota configuration
 */
export interface QuotaConfig {
  callerId: string
  callerType: 'plugin' | 'user' | 'system'
  requestsPerMinute?: number
  requestsPerDay?: number
  requestsPerMonth?: number
  tokensPerMinute?: number
  tokensPerDay?: number
  tokensPerMonth?: number
  costLimitPerDay?: number
  costLimitPerMonth?: number
  enabled?: boolean
}

/**
 * Quota check result
 */
export interface QuotaCheckResult {
  allowed: boolean
  reason?: string
  remainingRequests?: number
  remainingTokens?: number
  remainingCost?: number
}

/**
 * Query options for audit logs
 */
export interface AuditLogQueryOptions {
  caller?: string
  capabilityId?: string
  provider?: string
  startTime?: number
  endTime?: number
  success?: boolean
  limit?: number
  offset?: number
}

interface IntelligenceStatsComposable {
  // Audit logs
  getAuditLogs: (options?: AuditLogQueryOptions) => Promise<IntelligenceAuditLogEntry[]>

  // Usage statistics
  getTodayStats: (callerId?: string) => Promise<IntelligenceUsageSummary | null>
  getMonthStats: (callerId?: string) => Promise<IntelligenceUsageSummary | null>
  getUsageStats: (
    callerId: string,
    periodType: 'day' | 'month',
    startPeriod?: string,
    endPeriod?: string,
  ) => Promise<IntelligenceUsageSummary[]>

  // Quota management
  getQuota: (callerId: string, callerType?: 'plugin' | 'user' | 'system') => Promise<QuotaConfig | null>
  setQuota: (config: QuotaConfig) => Promise<void>
  deleteQuota: (callerId: string, callerType?: 'plugin' | 'user' | 'system') => Promise<void>
  getAllQuotas: () => Promise<QuotaConfig[]>
  checkQuota: (callerId: string, callerType?: 'plugin' | 'user' | 'system', estimatedTokens?: number) => Promise<QuotaCheckResult>
  getCurrentUsage: (callerId: string, callerType?: 'plugin' | 'user' | 'system') => Promise<CurrentUsage>

  // Export utilities
  exportToCSV: (logs: IntelligenceAuditLogEntry[]) => string
  exportToJSON: (logs: IntelligenceAuditLogEntry[]) => string
  downloadAsFile: (content: string, filename: string, mimeType: string) => void

  // Loading state
  isLoading: Ref<boolean>
  lastError: Ref<string | null>
}

/**
 * Intelligence Statistics Composable for Vue components
 *
 * Provides access to audit logs, usage statistics, and quota management
 *
 * @example
 * ```ts
 * const { getTodayStats, getAuditLogs, exportToCSV } = useIntelligenceStats()
 *
 * // Get today's usage
 * const stats = await getTodayStats()
 * console.log(`Today: ${stats.requestCount} requests, $${stats.totalCost.toFixed(4)} cost`)
 *
 * // Get audit logs
 * const logs = await getAuditLogs({ limit: 100 })
 *
 * // Export to CSV
 * const csv = exportToCSV(logs)
 * downloadAsFile(csv, 'audit-logs.csv', 'text/csv')
 * ```
 */
export function useIntelligenceStats(): IntelligenceStatsComposable {
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)

  const channel = useChannel()

  interface ChannelResponse<T> {
    ok: boolean
    result?: T
    error?: string
  }

  async function sendRequest<T>(eventName: string, payload?: any): Promise<T> {
    const response = await channel.send<any, ChannelResponse<T>>(eventName, payload)
    if (!response?.ok) {
      throw new Error(response?.error || 'Request failed')
    }
    return response.result as T
  }

  async function withLoadingState<T>(operation: () => Promise<T>): Promise<T> {
    isLoading.value = true
    lastError.value = null

    try {
      return await operation()
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      lastError.value = errorMessage
      throw error
    }
    finally {
      isLoading.value = false
    }
  }

  // Export to CSV
  function exportToCSV(logs: IntelligenceAuditLogEntry[]): string {
    const headers = [
      'Trace ID',
      'Timestamp',
      'Capability',
      'Provider',
      'Model',
      'Caller',
      'Prompt Tokens',
      'Completion Tokens',
      'Total Tokens',
      'Estimated Cost',
      'Latency (ms)',
      'Success',
      'Error',
    ]

    const rows = logs.map(log => [
      log.traceId,
      new Date(log.timestamp).toISOString(),
      log.capabilityId,
      log.provider,
      log.model,
      log.caller || '',
      log.usage.promptTokens,
      log.usage.completionTokens,
      log.usage.totalTokens,
      log.estimatedCost?.toFixed(6) || '',
      log.latency,
      log.success ? 'Yes' : 'No',
      log.error || '',
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')

    return csvContent
  }

  // Export to JSON
  function exportToJSON(logs: IntelligenceAuditLogEntry[]): string {
    return JSON.stringify(logs, null, 2)
  }

  // Download as file
  function downloadAsFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return {
    // Audit logs
    getAuditLogs: (options?: AuditLogQueryOptions) =>
      withLoadingState(() => sendRequest<IntelligenceAuditLogEntry[]>('intelligence:get-audit-logs', options)),

    // Usage statistics
    getTodayStats: (callerId?: string) =>
      withLoadingState(() => sendRequest<IntelligenceUsageSummary | null>('intelligence:get-today-stats', { callerId })),

    getMonthStats: (callerId?: string) =>
      withLoadingState(() => sendRequest<IntelligenceUsageSummary | null>('intelligence:get-month-stats', { callerId })),

    getUsageStats: (callerId: string, periodType: 'day' | 'month', startPeriod?: string, endPeriod?: string) =>
      withLoadingState(() =>
        sendRequest<IntelligenceUsageSummary[]>('intelligence:get-usage-stats', {
          callerId,
          periodType,
          startPeriod,
          endPeriod,
        }),
      ),

    // Quota management
    getQuota: (callerId: string, callerType: 'plugin' | 'user' | 'system' = 'plugin') =>
      withLoadingState(() => sendRequest<QuotaConfig | null>('intelligence:get-quota', { callerId, callerType })),

    setQuota: (config: QuotaConfig) =>
      withLoadingState(() => sendRequest<void>('intelligence:set-quota', config)),

    deleteQuota: (callerId: string, callerType: 'plugin' | 'user' | 'system' = 'plugin') =>
      withLoadingState(() => sendRequest<void>('intelligence:delete-quota', { callerId, callerType })),

    getAllQuotas: () =>
      withLoadingState(() => sendRequest<QuotaConfig[]>('intelligence:get-all-quotas')),

    checkQuota: (callerId: string, callerType: 'plugin' | 'user' | 'system' = 'plugin', estimatedTokens: number = 0) =>
      withLoadingState(() =>
        sendRequest<QuotaCheckResult>('intelligence:check-quota', { callerId, callerType, estimatedTokens }),
      ),

    getCurrentUsage: (callerId: string, callerType: 'plugin' | 'user' | 'system' = 'plugin') =>
      withLoadingState(() => sendRequest<CurrentUsage>('intelligence:get-current-usage', { callerId, callerType })),

    // Export utilities
    exportToCSV,
    exportToJSON,
    downloadAsFile,

    // Loading state
    isLoading,
    lastError,
  }
}
