import type {
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceMessage,
  IntelligenceProviderConfig,
  TuffIntelligenceApprovalTicket,
  TuffIntelligenceSession,
  TuffIntelligenceStateSnapshot,
  TuffIntelligenceTraceEvent,
  TuffIntelligenceTurn,
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

export interface IntelligenceSessionStartPayload {
  sessionId?: string
  objective?: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface IntelligenceSessionResumePayload {
  sessionId: string
}

export interface IntelligenceSessionCancelPayload {
  sessionId: string
  reason?: string
}

export interface IntelligenceSessionStatePayload {
  sessionId: string
}

export interface IntelligenceSessionHeartbeatPayload {
  sessionId: string
}

export interface IntelligenceSessionPausePayload {
  sessionId: string
  reason?: 'client_disconnect' | 'heartbeat_timeout' | 'manual_pause' | 'system_preempted'
  note?: string
}

export interface IntelligenceOrchestratorPlanPayload {
  sessionId: string
  objective: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface IntelligenceOrchestratorExecutePayload {
  sessionId: string
  turnId?: string
  maxSteps?: number
  toolBudget?: number
  continueOnError?: boolean
  metadata?: Record<string, unknown>
}

export interface IntelligenceOrchestratorReflectPayload {
  sessionId: string
  turnId: string
  notes?: string
}

export interface IntelligenceToolCallPayload {
  sessionId: string
  turnId?: string
  actionId?: string
  toolId: string
  input?: unknown
  riskLevel?: TuffIntelligenceApprovalTicket['riskLevel']
  callId?: string
  timeoutMs?: number
  metadata?: Record<string, unknown>
}

export interface IntelligenceToolResultPayload {
  sessionId: string
  turnId?: string
  toolId: string
  success: boolean
  output?: unknown
  error?: string
  metadata?: Record<string, unknown>
}

export interface IntelligenceToolApprovePayload {
  ticketId: string
  approved: boolean
  approvedBy?: string
  reason?: string
}

export interface IntelligenceTraceQueryPayload {
  sessionId: string
  fromSeq?: number
  limit?: number
  level?: TuffIntelligenceTraceEvent['level']
  type?: TuffIntelligenceTraceEvent['type']
}

export interface IntelligenceTraceExportPayload {
  sessionId: string
  format?: 'json' | 'jsonl'
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

  sessionStart: (payload?: IntelligenceSessionStartPayload) => Promise<TuffIntelligenceSession>
  sessionHeartbeat: (payload: IntelligenceSessionHeartbeatPayload) => Promise<{ sessionId: string, heartbeatAt: string }>
  sessionPause: (payload: IntelligenceSessionPausePayload) => Promise<unknown>
  sessionRecoverable: () => Promise<unknown>
  sessionResume: (payload: IntelligenceSessionResumePayload) => Promise<TuffIntelligenceSession | null>
  sessionCancel: (payload: IntelligenceSessionCancelPayload) => Promise<TuffIntelligenceStateSnapshot | null>
  sessionGetState: (payload: IntelligenceSessionStatePayload) => Promise<TuffIntelligenceStateSnapshot | null>

  orchestratorPlan: (payload: IntelligenceOrchestratorPlanPayload) => Promise<TuffIntelligenceTurn>
  orchestratorExecute: (payload: IntelligenceOrchestratorExecutePayload) => Promise<TuffIntelligenceTurn>
  orchestratorReflect: (payload: IntelligenceOrchestratorReflectPayload) => Promise<TuffIntelligenceTurn>

  toolCall: (payload: IntelligenceToolCallPayload) => Promise<{
    success: boolean
    output?: unknown
    error?: string
    approvalTicket?: TuffIntelligenceApprovalTicket
    traceEvent: TuffIntelligenceTraceEvent
  }>
  toolResult: (payload: IntelligenceToolResultPayload) => Promise<{ accepted: boolean }>
  toolApprove: (payload: IntelligenceToolApprovePayload) => Promise<TuffIntelligenceApprovalTicket | null>

  traceStream: (payload: IntelligenceTraceQueryPayload) => Promise<TuffIntelligenceTraceEvent[]>
  traceQuery: (payload: IntelligenceTraceQueryPayload) => Promise<TuffIntelligenceTraceEvent[]>
  traceExport: (payload: IntelligenceTraceExportPayload) => Promise<{ format: 'json' | 'jsonl', content: string }>
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

const intelligenceSessionStartEvent = defineRawEvent<
  IntelligenceSessionStartPayload,
  IntelligenceApiResponse<TuffIntelligenceSession>
>('intelligence:session:start')

const intelligenceSessionHeartbeatEvent = defineRawEvent<
  IntelligenceSessionHeartbeatPayload,
  IntelligenceApiResponse<{ sessionId: string, heartbeatAt: string }>
>('intelligence:session:heartbeat')

const intelligenceSessionPauseEvent = defineRawEvent<
  IntelligenceSessionPausePayload,
  IntelligenceApiResponse<unknown>
>('intelligence:session:pause')

const intelligenceSessionRecoverableEvent = defineRawEvent<
  void,
  IntelligenceApiResponse<unknown>
>('intelligence:session:recoverable')

const intelligenceSessionResumeEvent = defineRawEvent<
  IntelligenceSessionResumePayload,
  IntelligenceApiResponse<TuffIntelligenceSession | null>
>('intelligence:session:resume')

const intelligenceSessionCancelEvent = defineRawEvent<
  IntelligenceSessionCancelPayload,
  IntelligenceApiResponse<TuffIntelligenceStateSnapshot | null>
>('intelligence:session:cancel')

const intelligenceSessionGetStateEvent = defineRawEvent<
  IntelligenceSessionStatePayload,
  IntelligenceApiResponse<TuffIntelligenceStateSnapshot | null>
>('intelligence:session:get-state')

const intelligenceOrchestratorPlanEvent = defineRawEvent<
  IntelligenceOrchestratorPlanPayload,
  IntelligenceApiResponse<TuffIntelligenceTurn>
>('intelligence:orchestrator:plan')

const intelligenceOrchestratorExecuteEvent = defineRawEvent<
  IntelligenceOrchestratorExecutePayload,
  IntelligenceApiResponse<TuffIntelligenceTurn>
>('intelligence:orchestrator:execute')

const intelligenceOrchestratorReflectEvent = defineRawEvent<
  IntelligenceOrchestratorReflectPayload,
  IntelligenceApiResponse<TuffIntelligenceTurn>
>('intelligence:orchestrator:reflect')

const intelligenceToolCallEvent = defineRawEvent<
  IntelligenceToolCallPayload,
  IntelligenceApiResponse<{
    success: boolean
    output?: unknown
    error?: string
    approvalTicket?: TuffIntelligenceApprovalTicket
    traceEvent: TuffIntelligenceTraceEvent
  }>
>('intelligence:tool:call')

const intelligenceToolResultEvent = defineRawEvent<
  IntelligenceToolResultPayload,
  IntelligenceApiResponse<{ accepted: boolean }>
>('intelligence:tool:result')

const intelligenceToolApproveEvent = defineRawEvent<
  IntelligenceToolApprovePayload,
  IntelligenceApiResponse<TuffIntelligenceApprovalTicket | null>
>('intelligence:tool:approve')

const intelligenceTraceStreamEvent = defineRawEvent<
  IntelligenceTraceQueryPayload,
  IntelligenceApiResponse<TuffIntelligenceTraceEvent[]>
>('intelligence:trace:stream')

const intelligenceTraceQueryEvent = defineRawEvent<
  IntelligenceTraceQueryPayload,
  IntelligenceApiResponse<TuffIntelligenceTraceEvent[]>
>('intelligence:trace:query')

const intelligenceTraceExportEvent = defineRawEvent<
  IntelligenceTraceExportPayload,
  IntelligenceApiResponse<{ format: 'json' | 'jsonl', content: string }>
>('intelligence:trace:export')

function assertApiResponse<T>(response: IntelligenceApiResponse<T>, fallbackMessage: string): T {
  if (!response?.ok) {
    throw new Error(response?.error || fallbackMessage)
  }
  return response.result as T
}

export function createIntelligenceSdk(transport: IntelligenceSdkTransport): IntelligenceSdk {
  return {
    async invoke<T = unknown>(
      capabilityId: string,
      payload: unknown,
      options?: IntelligenceInvokeOptions,
    ) {
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

    async sessionStart(payload = {}) {
      const response = await transport.send(intelligenceSessionStartEvent, payload)
      return assertApiResponse(response, 'Failed to start intelligence session')
    },

    async sessionHeartbeat(payload) {
      const response = await transport.send(intelligenceSessionHeartbeatEvent, payload)
      return assertApiResponse(response, 'Failed to send intelligence heartbeat')
    },

    async sessionPause(payload) {
      const response = await transport.send(intelligenceSessionPauseEvent, payload)
      return assertApiResponse(response, 'Failed to pause intelligence session')
    },

    async sessionRecoverable() {
      const response = await transport.send(intelligenceSessionRecoverableEvent)
      return assertApiResponse(response, 'Failed to fetch recoverable intelligence session')
    },

    async sessionResume(payload) {
      const response = await transport.send(intelligenceSessionResumeEvent, payload)
      return assertApiResponse(response, 'Failed to resume intelligence session')
    },

    async sessionCancel(payload) {
      const response = await transport.send(intelligenceSessionCancelEvent, payload)
      return assertApiResponse(response, 'Failed to cancel intelligence session')
    },

    async sessionGetState(payload) {
      const response = await transport.send(intelligenceSessionGetStateEvent, payload)
      return assertApiResponse(response, 'Failed to get intelligence session state')
    },

    async orchestratorPlan(payload) {
      const response = await transport.send(intelligenceOrchestratorPlanEvent, payload)
      return assertApiResponse(response, 'Failed to create intelligence plan')
    },

    async orchestratorExecute(payload) {
      const response = await transport.send(intelligenceOrchestratorExecuteEvent, payload)
      return assertApiResponse(response, 'Failed to execute intelligence plan')
    },

    async orchestratorReflect(payload) {
      const response = await transport.send(intelligenceOrchestratorReflectEvent, payload)
      return assertApiResponse(response, 'Failed to reflect intelligence result')
    },

    async toolCall(payload) {
      const response = await transport.send(intelligenceToolCallEvent, payload)
      return assertApiResponse(response, 'Failed to call intelligence tool')
    },

    async toolResult(payload) {
      const response = await transport.send(intelligenceToolResultEvent, payload)
      return assertApiResponse(response, 'Failed to report intelligence tool result')
    },

    async toolApprove(payload) {
      const response = await transport.send(intelligenceToolApproveEvent, payload)
      return assertApiResponse(response, 'Failed to approve intelligence tool')
    },

    async traceStream(payload) {
      const response = await transport.send(intelligenceTraceStreamEvent, payload)
      return assertApiResponse(response, 'Failed to stream intelligence trace')
    },

    async traceQuery(payload) {
      const response = await transport.send(intelligenceTraceQueryEvent, payload)
      return assertApiResponse(response, 'Failed to query intelligence trace')
    },

    async traceExport(payload) {
      const response = await transport.send(intelligenceTraceExportEvent, payload)
      return assertApiResponse(response, 'Failed to export intelligence trace')
    },
  }
}
