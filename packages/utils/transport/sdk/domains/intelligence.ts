import type {
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceMessage,
  IntelligenceProviderConfig,
} from '../../../types/intelligence'
import type { ITuffTransport } from '../../types'
import { defineRawEvent } from '../../event/builder'

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

export interface IntelligenceCurrentUsage {
  requestsThisMinute: number
  requestsToday: number
  requestsThisMonth: number
  tokensThisMinute: number
  tokensToday: number
  tokensThisMonth: number
  costToday: number
  costThisMonth: number
}

export interface IntelligenceQuotaConfig {
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

export interface IntelligenceQuotaCheckResult {
  allowed: boolean
  reason?: string
  remainingRequests?: number
  remainingTokens?: number
  remainingCost?: number
}

export interface IntelligenceAuditLogQueryOptions {
  caller?: string
  capabilityId?: string
  provider?: string
  startTime?: number
  endTime?: number
  success?: boolean
  limit?: number
  offset?: number
}

export interface IntelligenceChatRequest {
  messages: IntelligenceMessage[]
  providerId?: string
  model?: string
  promptTemplate?: string
  promptVariables?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type IntelligenceApiResponse<T = undefined>
  = { ok: true, result?: T }
    | { ok: false, error: string }

export interface IntelligenceSdk {
  invoke: <T = unknown>(
    capabilityId: string,
    payload: unknown,
    options?: IntelligenceInvokeOptions,
  ) => Promise<IntelligenceInvokeResult<T>>
  chatLangChain: (payload: IntelligenceChatRequest) => Promise<IntelligenceInvokeResult<string>>
  testProvider: (config: IntelligenceProviderConfig) => Promise<unknown>
  testCapability: (params: Record<string, unknown>) => Promise<unknown>
  getCapabilityTestMeta: (payload: { capabilityId: string }) => Promise<{ requiresUserInput: boolean, inputHint: string }>
  fetchModels: (config: IntelligenceProviderConfig) => Promise<{ success: boolean, models?: string[], message?: string }>

  getAuditLogs: (options?: IntelligenceAuditLogQueryOptions) => Promise<IntelligenceAuditLogEntry[]>
  getTodayStats: (callerId?: string) => Promise<IntelligenceUsageSummary | null>
  getMonthStats: (callerId?: string) => Promise<IntelligenceUsageSummary | null>
  getUsageStats: (payload: {
    callerId: string
    periodType: 'day' | 'month'
    startPeriod?: string
    endPeriod?: string
  }) => Promise<IntelligenceUsageSummary[]>

  getQuota: (payload: { callerId: string, callerType?: IntelligenceQuotaConfig['callerType'] }) => Promise<IntelligenceQuotaConfig | null>
  setQuota: (config: IntelligenceQuotaConfig) => Promise<void>
  deleteQuota: (payload: { callerId: string, callerType?: IntelligenceQuotaConfig['callerType'] }) => Promise<void>
  getAllQuotas: () => Promise<IntelligenceQuotaConfig[]>
  checkQuota: (payload: {
    callerId: string
    callerType?: IntelligenceQuotaConfig['callerType']
    estimatedTokens?: number
  }) => Promise<IntelligenceQuotaCheckResult>
  getCurrentUsage: (payload: {
    callerId: string
    callerType?: IntelligenceQuotaConfig['callerType']
  }) => Promise<IntelligenceCurrentUsage>
}

export type IntelligenceSdkTransport = Pick<ITuffTransport, 'send'>

const intelligenceInvokeEvent = defineRawEvent<
  {
    capabilityId: string
    payload: unknown
    options?: IntelligenceInvokeOptions
  },
  IntelligenceApiResponse<IntelligenceInvokeResult<unknown>>
>('intelligence:invoke')

const intelligenceChatLangChainEvent = defineRawEvent<
  IntelligenceChatRequest,
  IntelligenceApiResponse<IntelligenceInvokeResult<string>>
>('intelligence:chat-langchain')

const intelligenceTestProviderEvent = defineRawEvent<
  { provider: IntelligenceProviderConfig },
  IntelligenceApiResponse<unknown>
>('intelligence:test-provider')

const intelligenceTestCapabilityEvent = defineRawEvent<
  Record<string, unknown>,
  IntelligenceApiResponse<unknown>
>('intelligence:test-capability')

const intelligenceGetCapabilityTestMetaEvent = defineRawEvent<
  { capabilityId: string },
  IntelligenceApiResponse<{ requiresUserInput: boolean, inputHint: string }>
>('intelligence:get-capability-test-meta')

const intelligenceFetchModelsEvent = defineRawEvent<
  { provider: IntelligenceProviderConfig },
  IntelligenceApiResponse<{ success: boolean, models?: string[], message?: string }>
>('intelligence:fetch-models')

const intelligenceGetAuditLogsEvent = defineRawEvent<
  IntelligenceAuditLogQueryOptions,
  IntelligenceApiResponse<IntelligenceAuditLogEntry[]>
>('intelligence:get-audit-logs')

const intelligenceGetTodayStatsEvent = defineRawEvent<
  { callerId?: string },
  IntelligenceApiResponse<IntelligenceUsageSummary | null>
>('intelligence:get-today-stats')

const intelligenceGetMonthStatsEvent = defineRawEvent<
  { callerId?: string },
  IntelligenceApiResponse<IntelligenceUsageSummary | null>
>('intelligence:get-month-stats')

const intelligenceGetUsageStatsEvent = defineRawEvent<
  {
    callerId: string
    periodType: 'day' | 'month'
    startPeriod?: string
    endPeriod?: string
  },
  IntelligenceApiResponse<IntelligenceUsageSummary[]>
>('intelligence:get-usage-stats')

const intelligenceGetQuotaEvent = defineRawEvent<
  { callerId?: string, callerType?: IntelligenceQuotaConfig['callerType'] },
  IntelligenceApiResponse<IntelligenceQuotaConfig | null>
>('intelligence:get-quota')

const intelligenceSetQuotaEvent = defineRawEvent<
  IntelligenceQuotaConfig,
  IntelligenceApiResponse<void>
>('intelligence:set-quota')

const intelligenceDeleteQuotaEvent = defineRawEvent<
  { callerId?: string, callerType?: IntelligenceQuotaConfig['callerType'] },
  IntelligenceApiResponse<void>
>('intelligence:delete-quota')

const intelligenceGetAllQuotasEvent = defineRawEvent<
  void,
  IntelligenceApiResponse<IntelligenceQuotaConfig[]>
>('intelligence:get-all-quotas')

const intelligenceCheckQuotaEvent = defineRawEvent<
  {
    callerId?: string
    callerType?: IntelligenceQuotaConfig['callerType']
    estimatedTokens?: number
  },
  IntelligenceApiResponse<IntelligenceQuotaCheckResult>
>('intelligence:check-quota')

const intelligenceGetCurrentUsageEvent = defineRawEvent<
  { callerId?: string, callerType?: IntelligenceQuotaConfig['callerType'] },
  IntelligenceApiResponse<IntelligenceCurrentUsage>
>('intelligence:get-current-usage')

function assertApiResponse<T>(response: IntelligenceApiResponse<T>, fallbackMessage: string): T {
  if (!response?.ok) {
    throw new Error(response?.error || fallbackMessage)
  }
  return response.result as T
}

export function createIntelligenceSdk(transport: IntelligenceSdkTransport): IntelligenceSdk {
  return {
    async invoke<T = unknown>(capabilityId, payload, options) {
      const response = await transport.send(intelligenceInvokeEvent, { capabilityId, payload, options })
      return assertApiResponse(response, 'Intelligence invoke failed') as IntelligenceInvokeResult<T>
    },

    async chatLangChain(payload) {
      const response = await transport.send(intelligenceChatLangChainEvent, payload)
      return assertApiResponse(response, 'Intelligence chat failed')
    },

    async testProvider(config) {
      const response = await transport.send(intelligenceTestProviderEvent, { provider: config })
      return assertApiResponse(response, 'Intelligence provider test failed')
    },

    async testCapability(params) {
      const response = await transport.send(intelligenceTestCapabilityEvent, params)
      return assertApiResponse(response, 'Intelligence capability test failed')
    },

    async getCapabilityTestMeta(payload) {
      const response = await transport.send(intelligenceGetCapabilityTestMetaEvent, payload)
      return assertApiResponse(response, 'Failed to get capability test metadata')
    },

    async fetchModels(config) {
      const response = await transport.send(intelligenceFetchModelsEvent, { provider: config })
      return assertApiResponse(response, 'Failed to fetch models')
    },

    async getAuditLogs(options = {}) {
      const response = await transport.send(intelligenceGetAuditLogsEvent, options)
      return assertApiResponse(response, 'Failed to get audit logs')
    },

    async getTodayStats(callerId) {
      const response = await transport.send(intelligenceGetTodayStatsEvent, { callerId })
      return assertApiResponse(response, 'Failed to get today stats')
    },

    async getMonthStats(callerId) {
      const response = await transport.send(intelligenceGetMonthStatsEvent, { callerId })
      return assertApiResponse(response, 'Failed to get month stats')
    },

    async getUsageStats(payload) {
      const response = await transport.send(intelligenceGetUsageStatsEvent, payload)
      return assertApiResponse(response, 'Failed to get usage stats')
    },

    async getQuota(payload) {
      const response = await transport.send(intelligenceGetQuotaEvent, payload)
      return assertApiResponse(response, 'Failed to get quota')
    },

    async setQuota(config) {
      const response = await transport.send(intelligenceSetQuotaEvent, config)
      assertApiResponse(response, 'Failed to set quota')
    },

    async deleteQuota(payload) {
      const response = await transport.send(intelligenceDeleteQuotaEvent, payload)
      assertApiResponse(response, 'Failed to delete quota')
    },

    async getAllQuotas() {
      const response = await transport.send(intelligenceGetAllQuotasEvent)
      return assertApiResponse(response, 'Failed to get all quotas')
    },

    async checkQuota(payload) {
      const response = await transport.send(intelligenceCheckQuotaEvent, payload)
      return assertApiResponse(response, 'Failed to check quota')
    },

    async getCurrentUsage(payload) {
      const response = await transport.send(intelligenceGetCurrentUsageEvent, payload)
      return assertApiResponse(response, 'Failed to get current usage')
    },
  }
}
