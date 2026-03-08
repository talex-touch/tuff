import type {
  IntelligenceAgentStreamEvent,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceMessage,
  IntelligenceProviderConfig,
  TuffIntelligenceApprovalTicket,
  TuffIntelligenceAgentSession,
  TuffIntelligenceStateSnapshot,
  TuffIntelligenceAgentTraceEvent,
  TuffIntelligenceTurn,
} from '../../../types/intelligence'
import type { ITuffTransport, StreamController, StreamOptions } from '../../types'
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

export interface IntelligenceAgentSessionStartPayload {
  sessionId?: string
  objective?: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
  autoRunGraph?: boolean
  maxSteps?: number
  toolBudget?: number
  continueOnError?: boolean
  reflectNotes?: string
}

export interface IntelligenceAgentSessionResumePayload {
  sessionId: string
}

export interface IntelligenceAgentSessionCancelPayload {
  sessionId: string
  reason?: string
}

export interface IntelligenceAgentSessionStatePayload {
  sessionId: string
}

export interface IntelligenceAgentSessionHeartbeatPayload {
  sessionId: string
}

export interface IntelligenceAgentSessionPausePayload {
  sessionId: string
  reason?: 'client_disconnect' | 'heartbeat_timeout' | 'manual_pause' | 'system_preempted'
  note?: string
}

export interface IntelligenceAgentPlanPayload {
  sessionId: string
  objective: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface IntelligenceAgentExecutePayload {
  sessionId: string
  turnId?: string
  maxSteps?: number
  toolBudget?: number
  continueOnError?: boolean
  metadata?: Record<string, unknown>
}

export interface IntelligenceAgentReflectPayload {
  sessionId: string
  turnId: string
  notes?: string
}

export interface IntelligenceAgentToolCallPayload {
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

export interface IntelligenceAgentToolResultPayload {
  sessionId: string
  turnId?: string
  toolId: string
  success: boolean
  output?: unknown
  error?: string
  metadata?: Record<string, unknown>
}

export interface IntelligenceAgentToolApprovePayload {
  ticketId: string
  approved: boolean
  approvedBy?: string
  reason?: string
}

export interface IntelligenceAgentTraceQueryPayload {
  sessionId: string
  fromSeq?: number
  limit?: number
  level?: TuffIntelligenceAgentTraceEvent['level']
  type?: TuffIntelligenceAgentTraceEvent['type']
}

export interface IntelligenceAgentSessionHistoryPayload {
  limit?: number
  status?: TuffIntelligenceAgentSession['status']
}

export interface IntelligenceAgentTraceExportPayload {
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

  agentSessionStart: (payload?: IntelligenceAgentSessionStartPayload) => Promise<TuffIntelligenceAgentSession>
  agentSessionHeartbeat: (payload: IntelligenceAgentSessionHeartbeatPayload) => Promise<{ sessionId: string, heartbeatAt: string }>
  agentSessionPause: (payload: IntelligenceAgentSessionPausePayload) => Promise<TuffIntelligenceAgentSession | null>
  agentSessionRecoverable: () => Promise<TuffIntelligenceAgentSession | null>
  agentSessionResume: (payload: IntelligenceAgentSessionResumePayload) => Promise<TuffIntelligenceAgentSession | null>
  agentSessionCancel: (payload: IntelligenceAgentSessionCancelPayload) => Promise<TuffIntelligenceStateSnapshot | null>
  agentSessionGetState: (payload: IntelligenceAgentSessionStatePayload) => Promise<TuffIntelligenceStateSnapshot | null>

  agentPlan: (payload: IntelligenceAgentPlanPayload) => Promise<TuffIntelligenceTurn>
  agentExecute: (payload: IntelligenceAgentExecutePayload) => Promise<TuffIntelligenceTurn>
  agentReflect: (payload: IntelligenceAgentReflectPayload) => Promise<TuffIntelligenceTurn>

  agentToolCall: (payload: IntelligenceAgentToolCallPayload) => Promise<{
    success: boolean
    output?: unknown
    error?: string
    approvalTicket?: TuffIntelligenceApprovalTicket
    traceEvent: TuffIntelligenceAgentTraceEvent
  }>
  agentToolResult: (payload: IntelligenceAgentToolResultPayload) => Promise<{ accepted: boolean }>
  agentToolApprove: (payload: IntelligenceAgentToolApprovePayload) => Promise<TuffIntelligenceApprovalTicket | null>

  agentSessionStream: (payload: IntelligenceAgentTraceQueryPayload) => Promise<TuffIntelligenceAgentTraceEvent[]>
  agentSessionSubscribe: (
    payload: IntelligenceAgentTraceQueryPayload,
    options: StreamOptions<IntelligenceAgentStreamEvent>
  ) => Promise<StreamController>
  agentSessionHistory: (payload?: IntelligenceAgentSessionHistoryPayload) => Promise<TuffIntelligenceAgentSession[]>
  agentSessionTrace: (payload: IntelligenceAgentTraceQueryPayload) => Promise<TuffIntelligenceAgentTraceEvent[]>
  agentSessionTraceExport: (payload: IntelligenceAgentTraceExportPayload) => Promise<{ format: 'json' | 'jsonl', content: string }>
}

export type IntelligenceSdkTransport = Pick<ITuffTransport, 'send'> & Partial<Pick<ITuffTransport, 'stream'>>

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
  IntelligenceAgentSessionStartPayload,
  IntelligenceApiResponse<TuffIntelligenceAgentSession>
>('intelligence:agent:session:start')

const intelligenceSessionHeartbeatEvent = defineRawEvent<
  IntelligenceAgentSessionHeartbeatPayload,
  IntelligenceApiResponse<{ sessionId: string, heartbeatAt: string }>
>('intelligence:agent:session:heartbeat')

const intelligenceSessionPauseEvent = defineRawEvent<
  IntelligenceAgentSessionPausePayload,
  IntelligenceApiResponse<TuffIntelligenceAgentSession | null>
>('intelligence:agent:session:pause')

const intelligenceSessionRecoverableEvent = defineRawEvent<
  void,
  IntelligenceApiResponse<TuffIntelligenceAgentSession | null>
>('intelligence:agent:session:recoverable')

const intelligenceSessionResumeEvent = defineRawEvent<
  IntelligenceAgentSessionResumePayload,
  IntelligenceApiResponse<TuffIntelligenceAgentSession | null>
>('intelligence:agent:session:resume')

const intelligenceSessionCancelEvent = defineRawEvent<
  IntelligenceAgentSessionCancelPayload,
  IntelligenceApiResponse<TuffIntelligenceStateSnapshot | null>
>('intelligence:agent:session:cancel')

const intelligenceSessionGetStateEvent = defineRawEvent<
  IntelligenceAgentSessionStatePayload,
  IntelligenceApiResponse<TuffIntelligenceStateSnapshot | null>
>('intelligence:agent:session:get-state')

const intelligenceOrchestratorPlanEvent = defineRawEvent<
  IntelligenceAgentPlanPayload,
  IntelligenceApiResponse<TuffIntelligenceTurn>
>('intelligence:agent:plan')

const intelligenceOrchestratorExecuteEvent = defineRawEvent<
  IntelligenceAgentExecutePayload,
  IntelligenceApiResponse<TuffIntelligenceTurn>
>('intelligence:agent:execute')

const intelligenceOrchestratorReflectEvent = defineRawEvent<
  IntelligenceAgentReflectPayload,
  IntelligenceApiResponse<TuffIntelligenceTurn>
>('intelligence:agent:reflect')

const intelligenceToolCallEvent = defineRawEvent<
  IntelligenceAgentToolCallPayload,
  IntelligenceApiResponse<{
    success: boolean
    output?: unknown
    error?: string
    approvalTicket?: TuffIntelligenceApprovalTicket
    traceEvent: TuffIntelligenceAgentTraceEvent
  }>
>('intelligence:agent:tool:call')

const intelligenceToolResultEvent = defineRawEvent<
  IntelligenceAgentToolResultPayload,
  IntelligenceApiResponse<{ accepted: boolean }>
>('intelligence:agent:tool:result')

const intelligenceToolApproveEvent = defineRawEvent<
  IntelligenceAgentToolApprovePayload,
  IntelligenceApiResponse<TuffIntelligenceApprovalTicket | null>
>('intelligence:agent:tool:approve')

const intelligenceSessionStreamEvent = defineRawEvent<
  IntelligenceAgentTraceQueryPayload,
  IntelligenceApiResponse<TuffIntelligenceAgentTraceEvent[]>
>('intelligence:agent:session:stream')
const intelligenceSessionSubscribeEvent = defineRawEvent<
  IntelligenceAgentTraceQueryPayload,
  AsyncIterable<IntelligenceAgentStreamEvent>
>('intelligence:agent:session:subscribe')

const intelligenceSessionHistoryEvent = defineRawEvent<
  IntelligenceAgentSessionHistoryPayload | undefined,
  IntelligenceApiResponse<TuffIntelligenceAgentSession[]>
>('intelligence:agent:session:history')

const intelligenceSessionTraceEvent = defineRawEvent<
  IntelligenceAgentTraceQueryPayload,
  IntelligenceApiResponse<TuffIntelligenceAgentTraceEvent[]>
>('intelligence:agent:session:trace')

const intelligenceSessionTraceExportEvent = defineRawEvent<
  IntelligenceAgentTraceExportPayload,
  IntelligenceApiResponse<{ format: 'json' | 'jsonl', content: string }>
>('intelligence:agent:session:trace:export')

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

    async agentSessionStart(payload = {}) {
      const response = await transport.send(intelligenceSessionStartEvent, payload)
      return assertApiResponse(response, 'Failed to start intelligence session')
    },

    async agentSessionHeartbeat(payload) {
      const response = await transport.send(intelligenceSessionHeartbeatEvent, payload)
      return assertApiResponse(response, 'Failed to send intelligence heartbeat')
    },

    async agentSessionPause(payload) {
      const response = await transport.send(intelligenceSessionPauseEvent, payload)
      return assertApiResponse(response, 'Failed to pause intelligence session')
    },

    async agentSessionRecoverable() {
      const response = await transport.send(intelligenceSessionRecoverableEvent)
      return assertApiResponse(response, 'Failed to fetch recoverable intelligence session')
    },

    async agentSessionResume(payload) {
      const response = await transport.send(intelligenceSessionResumeEvent, payload)
      return assertApiResponse(response, 'Failed to resume intelligence session')
    },

    async agentSessionCancel(payload) {
      const response = await transport.send(intelligenceSessionCancelEvent, payload)
      return assertApiResponse(response, 'Failed to cancel intelligence session')
    },

    async agentSessionGetState(payload) {
      const response = await transport.send(intelligenceSessionGetStateEvent, payload)
      return assertApiResponse(response, 'Failed to get intelligence session state')
    },

    async agentPlan(payload) {
      const response = await transport.send(intelligenceOrchestratorPlanEvent, payload)
      return assertApiResponse(response, 'Failed to create intelligence plan')
    },

    async agentExecute(payload) {
      const response = await transport.send(intelligenceOrchestratorExecuteEvent, payload)
      return assertApiResponse(response, 'Failed to execute intelligence plan')
    },

    async agentReflect(payload) {
      const response = await transport.send(intelligenceOrchestratorReflectEvent, payload)
      return assertApiResponse(response, 'Failed to reflect intelligence result')
    },

    async agentToolCall(payload) {
      const response = await transport.send(intelligenceToolCallEvent, payload)
      return assertApiResponse(response, 'Failed to call intelligence tool')
    },

    async agentToolResult(payload) {
      const response = await transport.send(intelligenceToolResultEvent, payload)
      return assertApiResponse(response, 'Failed to report intelligence tool result')
    },

    async agentToolApprove(payload) {
      const response = await transport.send(intelligenceToolApproveEvent, payload)
      return assertApiResponse(response, 'Failed to approve intelligence tool')
    },

    async agentSessionStream(payload) {
      const response = await transport.send(intelligenceSessionStreamEvent, payload)
      return assertApiResponse(response, 'Failed to stream intelligence trace')
    },

    async agentSessionSubscribe(payload, options) {
      if (typeof transport.stream !== 'function') {
        throw new Error('Failed to subscribe intelligence trace stream: transport.stream is unavailable')
      }
      return transport.stream(intelligenceSessionSubscribeEvent, payload, options)
    },

    async agentSessionHistory(payload = {}) {
      const response = await transport.send(intelligenceSessionHistoryEvent, payload)
      return assertApiResponse(response, 'Failed to query intelligence session history')
    },

    async agentSessionTrace(payload) {
      const response = await transport.send(intelligenceSessionTraceEvent, payload)
      return assertApiResponse(response, 'Failed to query intelligence trace')
    },

    async agentSessionTraceExport(payload) {
      const response = await transport.send(intelligenceSessionTraceExportEvent, payload)
      return assertApiResponse(response, 'Failed to export intelligence trace')
    },
  }
}
