import type { Ref } from 'vue'
import { ref } from 'vue'
import { useIntelligenceSdk } from './use-intelligence-sdk'

/**
 * Usage summary for a specific period
 */
interface IntelligenceUsageSummary {
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
interface IntelligenceAuditLogEntry {
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
interface CurrentUsage {
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
interface QuotaConfig {
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
interface QuotaCheckResult {
  allowed: boolean
  reason?: string
  remainingRequests?: number
  remainingTokens?: number
  remainingCost?: number
}

/**
 * Query options for audit logs
 */
interface AuditLogQueryOptions {
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
/**
 * @deprecated 请优先使用 useIntelligenceSdk() 直接调用统计相关能力。
 */
export function useIntelligenceStats(): IntelligenceStatsComposable {
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)
  const intelligenceSdk = useIntelligenceSdk()

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
      withLoadingState(() => intelligenceSdk.getAuditLogs(options)),

    // Usage statistics
    getTodayStats: (callerId?: string) =>
      withLoadingState(() => intelligenceSdk.getTodayStats(callerId)),

    getMonthStats: (callerId?: string) =>
      withLoadingState(() => intelligenceSdk.getMonthStats(callerId)),

    getUsageStats: (callerId: string, periodType: 'day' | 'month', startPeriod?: string, endPeriod?: string) =>
      withLoadingState(() =>
        intelligenceSdk.getUsageStats({
          callerId,
          periodType,
          startPeriod,
          endPeriod,
        }),
      ),

    // Quota management
    getQuota: (callerId: string, callerType: 'plugin' | 'user' | 'system' = 'plugin') =>
      withLoadingState(() => intelligenceSdk.getQuota({ callerId, callerType })),

    setQuota: (config: QuotaConfig) =>
      withLoadingState(() => intelligenceSdk.setQuota(config)),

    deleteQuota: (callerId: string, callerType: 'plugin' | 'user' | 'system' = 'plugin') =>
      withLoadingState(() => intelligenceSdk.deleteQuota({ callerId, callerType })),

    getAllQuotas: () =>
      withLoadingState(() => intelligenceSdk.getAllQuotas()),

    checkQuota: (callerId: string, callerType: 'plugin' | 'user' | 'system' = 'plugin', estimatedTokens: number = 0) =>
      withLoadingState(() =>
        intelligenceSdk.checkQuota({ callerId, callerType, estimatedTokens }),
      ),

    getCurrentUsage: (callerId: string, callerType: 'plugin' | 'user' | 'system' = 'plugin') =>
      withLoadingState(() => intelligenceSdk.getCurrentUsage({ callerId, callerType })),

    // Export utilities
    exportToCSV,
    exportToJSON,
    downloadAsFile,

    // Loading state
    isLoading,
    lastError,
  }
}
