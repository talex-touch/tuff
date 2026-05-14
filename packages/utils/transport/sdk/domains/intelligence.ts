import type {
  IntelligenceAgentStreamEvent,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceMessage,
  IntelligenceProviderConfig,
  IntelligenceTtsSpeakPayload,
  IntelligenceTtsSpeakResult,
  TuffIntelligenceAgentSession,
  TuffIntelligenceAgentTraceEvent,
  TuffIntelligenceApprovalTicket,
  TuffIntelligenceStateSnapshot,
  TuffIntelligenceTurn,
  WorkflowDefinition,
  WorkflowRunRecord,
  WorkflowTriggerType,
} from '../../../types/intelligence'
import type { ITuffTransport, StreamController, StreamOptions } from '../../types'
import { defineEvent } from '../../event/builder'

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

export interface IntelligenceWorkflowListPayload {
  includeDisabled?: boolean
  includeTemplates?: boolean
}

export interface IntelligenceWorkflowGetPayload {
  workflowId: string
}

export interface IntelligenceWorkflowDeletePayload {
  workflowId: string
}

export interface IntelligenceWorkflowHistoryPayload {
  workflowId?: string
  limit?: number
  status?: WorkflowRunRecord['status']
}

export interface IntelligenceWorkflowRunPayload {
  workflowId?: string
  workflow?: WorkflowDefinition
  runId?: string
  inputs?: Record<string, unknown>
  sessionId?: string
  triggerType?: WorkflowTriggerType
  continueOnError?: boolean
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
  ttsSpeak: (payload: IntelligenceTtsSpeakPayload) => Promise<IntelligenceTtsSpeakResult>
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
    options: StreamOptions<IntelligenceAgentStreamEvent>,
  ) => Promise<StreamController>
  agentSessionHistory: (payload?: IntelligenceAgentSessionHistoryPayload) => Promise<TuffIntelligenceAgentSession[]>
  agentSessionTrace: (payload: IntelligenceAgentTraceQueryPayload) => Promise<TuffIntelligenceAgentTraceEvent[]>
  agentSessionTraceExport: (payload: IntelligenceAgentTraceExportPayload) => Promise<{ format: 'json' | 'jsonl', content: string }>
  workflowList: (payload?: IntelligenceWorkflowListPayload) => Promise<WorkflowDefinition[]>
  workflowGet: (payload: IntelligenceWorkflowGetPayload) => Promise<WorkflowDefinition | null>
  workflowSave: (workflow: WorkflowDefinition) => Promise<WorkflowDefinition>
  workflowDelete: (payload: IntelligenceWorkflowDeletePayload) => Promise<{ deleted: boolean }>
  workflowRun: (payload: IntelligenceWorkflowRunPayload) => Promise<WorkflowRunRecord>
  workflowHistory: (payload?: IntelligenceWorkflowHistoryPayload) => Promise<WorkflowRunRecord[]>
}

export type IntelligenceSdkTransport = Pick<ITuffTransport, 'send'> & Partial<Pick<ITuffTransport, 'stream'>>

export const intelligenceApiEvents = {
  invoke: defineEvent('intelligence')
    .module('api')
    .event('invoke')
    .define<{
    capabilityId: string
    payload: unknown
    options?: IntelligenceInvokeOptions
  }, IntelligenceApiResponse<IntelligenceInvokeResult<unknown>>>(),
  ttsSpeak: defineEvent('intelligence')
    .module('api')
    .event('tts-speak')
    .define<IntelligenceTtsSpeakPayload, IntelligenceApiResponse<IntelligenceTtsSpeakResult>>(),
  chatLangChain: defineEvent('intelligence')
    .module('api')
    .event('chat-langchain')
    .define<IntelligenceChatRequest, IntelligenceApiResponse<IntelligenceInvokeResult<string>>>(),
  testProvider: defineEvent('intelligence')
    .module('api')
    .event('test-provider')
    .define<{ provider: IntelligenceProviderConfig }, IntelligenceApiResponse<unknown>>(),
  testCapability: defineEvent('intelligence')
    .module('api')
    .event('test-capability')
    .define<Record<string, unknown>, IntelligenceApiResponse<unknown>>(),
  getCapabilityTestMeta: defineEvent('intelligence')
    .module('api')
    .event('get-capability-test-meta')
    .define<
      { capabilityId: string },
      IntelligenceApiResponse<{ requiresUserInput: boolean, inputHint: string }>
    >(),
  fetchModels: defineEvent('intelligence')
    .module('api')
    .event('fetch-models')
    .define<
      { provider: IntelligenceProviderConfig },
      IntelligenceApiResponse<{ success: boolean, models?: string[], message?: string }>
    >(),
  getAuditLogs: defineEvent('intelligence')
    .module('api')
    .event('get-audit-logs')
    .define<IntelligenceAuditLogQueryOptions, IntelligenceApiResponse<IntelligenceAuditLogEntry[]>>(),
  getTodayStats: defineEvent('intelligence')
    .module('api')
    .event('get-today-stats')
    .define<{ callerId?: string }, IntelligenceApiResponse<IntelligenceUsageSummary | null>>(),
  getMonthStats: defineEvent('intelligence')
    .module('api')
    .event('get-month-stats')
    .define<{ callerId?: string }, IntelligenceApiResponse<IntelligenceUsageSummary | null>>(),
  getUsageStats: defineEvent('intelligence')
    .module('api')
    .event('get-usage-stats')
    .define<{
    callerId: string
    periodType: 'day' | 'month'
    startPeriod?: string
    endPeriod?: string
  }, IntelligenceApiResponse<IntelligenceUsageSummary[]>>(),
  getQuota: defineEvent('intelligence')
    .module('api')
    .event('get-quota')
    .define<
      { callerId?: string, callerType?: IntelligenceQuotaConfig['callerType'] },
      IntelligenceApiResponse<IntelligenceQuotaConfig | null>
    >(),
  setQuota: defineEvent('intelligence')
    .module('api')
    .event('set-quota')
    .define<IntelligenceQuotaConfig, IntelligenceApiResponse<void>>(),
  deleteQuota: defineEvent('intelligence')
    .module('api')
    .event('delete-quota')
    .define<
      { callerId?: string, callerType?: IntelligenceQuotaConfig['callerType'] },
      IntelligenceApiResponse<void>
    >(),
  getAllQuotas: defineEvent('intelligence')
    .module('api')
    .event('get-all-quotas')
    .define<void, IntelligenceApiResponse<IntelligenceQuotaConfig[]>>(),
  checkQuota: defineEvent('intelligence')
    .module('api')
    .event('check-quota')
    .define<{
    callerId?: string
    callerType?: IntelligenceQuotaConfig['callerType']
    estimatedTokens?: number
  }, IntelligenceApiResponse<IntelligenceQuotaCheckResult>>(),
  getCurrentUsage: defineEvent('intelligence')
    .module('api')
    .event('get-current-usage')
    .define<
      { callerId?: string, callerType?: IntelligenceQuotaConfig['callerType'] },
      IntelligenceApiResponse<IntelligenceCurrentUsage>
    >(),
  reloadConfig: defineEvent('intelligence')
    .module('api')
    .event('reload-config')
    .define<void, { ok: boolean, error?: string }>(),
} as const

export const intelligenceAgentEvents = {
  sessionStart: defineEvent('intelligence')
    .module('agent')
    .event('session:start')
    .define<IntelligenceAgentSessionStartPayload, IntelligenceApiResponse<TuffIntelligenceAgentSession>>(),
  sessionHeartbeat: defineEvent('intelligence')
    .module('agent')
    .event('session:heartbeat')
    .define<
      IntelligenceAgentSessionHeartbeatPayload,
      IntelligenceApiResponse<{ sessionId: string, heartbeatAt: string }>
    >(),
  sessionPause: defineEvent('intelligence')
    .module('agent')
    .event('session:pause')
    .define<
      IntelligenceAgentSessionPausePayload,
      IntelligenceApiResponse<TuffIntelligenceAgentSession | null>
    >(),
  sessionRecoverable: defineEvent('intelligence')
    .module('agent')
    .event('session:recoverable')
    .define<void, IntelligenceApiResponse<TuffIntelligenceAgentSession | null>>(),
  sessionResume: defineEvent('intelligence')
    .module('agent')
    .event('session:resume')
    .define<
      IntelligenceAgentSessionResumePayload,
      IntelligenceApiResponse<TuffIntelligenceAgentSession | null>
    >(),
  sessionCancel: defineEvent('intelligence')
    .module('agent')
    .event('session:cancel')
    .define<
      IntelligenceAgentSessionCancelPayload,
      IntelligenceApiResponse<TuffIntelligenceStateSnapshot | null>
    >(),
  sessionGetState: defineEvent('intelligence')
    .module('agent')
    .event('session:get-state')
    .define<
      IntelligenceAgentSessionStatePayload,
      IntelligenceApiResponse<TuffIntelligenceStateSnapshot | null>
    >(),
  plan: defineEvent('intelligence')
    .module('agent')
    .event('plan')
    .define<IntelligenceAgentPlanPayload, IntelligenceApiResponse<TuffIntelligenceTurn>>(),
  execute: defineEvent('intelligence')
    .module('agent')
    .event('execute')
    .define<IntelligenceAgentExecutePayload, IntelligenceApiResponse<TuffIntelligenceTurn>>(),
  reflect: defineEvent('intelligence')
    .module('agent')
    .event('reflect')
    .define<IntelligenceAgentReflectPayload, IntelligenceApiResponse<TuffIntelligenceTurn>>(),
  toolCall: defineEvent('intelligence')
    .module('agent')
    .event('tool:call')
    .define<
      IntelligenceAgentToolCallPayload,
      IntelligenceApiResponse<{
        success: boolean
        output?: unknown
        error?: string
        approvalTicket?: TuffIntelligenceApprovalTicket
        traceEvent: TuffIntelligenceAgentTraceEvent
      }>
    >(),
  toolResult: defineEvent('intelligence')
    .module('agent')
    .event('tool:result')
    .define<IntelligenceAgentToolResultPayload, IntelligenceApiResponse<{ accepted: boolean }>>(),
  toolApprove: defineEvent('intelligence')
    .module('agent')
    .event('tool:approve')
    .define<
      IntelligenceAgentToolApprovePayload,
      IntelligenceApiResponse<TuffIntelligenceApprovalTicket | null>
    >(),
  sessionStream: defineEvent('intelligence')
    .module('agent')
    .event('session:stream')
    .define<
      IntelligenceAgentTraceQueryPayload,
      IntelligenceApiResponse<TuffIntelligenceAgentTraceEvent[]>
    >(),
  sessionSubscribe: defineEvent('intelligence')
    .module('agent')
    .event('session:subscribe')
    .define<IntelligenceAgentTraceQueryPayload, AsyncIterable<IntelligenceAgentStreamEvent>>(),
  sessionHistory: defineEvent('intelligence')
    .module('agent')
    .event('session:history')
    .define<
      IntelligenceAgentSessionHistoryPayload | undefined,
      IntelligenceApiResponse<TuffIntelligenceAgentSession[]>
    >(),
  sessionTrace: defineEvent('intelligence')
    .module('agent')
    .event('session:trace')
    .define<
      IntelligenceAgentTraceQueryPayload,
      IntelligenceApiResponse<TuffIntelligenceAgentTraceEvent[]>
    >(),
  sessionTraceExport: defineEvent('intelligence')
    .module('agent')
    .event('session:trace:export')
    .define<
      IntelligenceAgentTraceExportPayload,
      IntelligenceApiResponse<{ format: 'json' | 'jsonl', content: string }>
    >(),
} as const

const intelligenceWorkflowEvents = {
  list: defineEvent('intelligence')
    .module('workflow')
    .event('list')
    .define<
      IntelligenceWorkflowListPayload | undefined,
      IntelligenceApiResponse<WorkflowDefinition[]>
    >(),
  get: defineEvent('intelligence')
    .module('workflow')
    .event('get')
    .define<IntelligenceWorkflowGetPayload, IntelligenceApiResponse<WorkflowDefinition | null>>(),
  save: defineEvent('intelligence')
    .module('workflow')
    .event('save')
    .define<WorkflowDefinition, IntelligenceApiResponse<WorkflowDefinition>>(),
  delete: defineEvent('intelligence')
    .module('workflow')
    .event('delete')
    .define<IntelligenceWorkflowDeletePayload, IntelligenceApiResponse<{ deleted: boolean }>>(),
  run: defineEvent('intelligence')
    .module('workflow')
    .event('run')
    .define<IntelligenceWorkflowRunPayload, IntelligenceApiResponse<WorkflowRunRecord>>(),
  history: defineEvent('intelligence')
    .module('workflow')
    .event('history')
    .define<
      IntelligenceWorkflowHistoryPayload | undefined,
      IntelligenceApiResponse<WorkflowRunRecord[]>
    >(),
} as const

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
      const response = await transport.send(intelligenceApiEvents.invoke, { capabilityId, payload, options })
      return assertApiResponse(response, 'Intelligence invoke failed') as IntelligenceInvokeResult<T>
    },

    async ttsSpeak(payload) {
      const response = await transport.send(intelligenceApiEvents.ttsSpeak, payload)
      return assertApiResponse(response, 'Intelligence TTS speak failed')
    },

    async chatLangChain(payload) {
      const response = await transport.send(intelligenceApiEvents.chatLangChain, payload)
      return assertApiResponse(response, 'Intelligence chat failed')
    },

    async testProvider(config) {
      const response = await transport.send(intelligenceApiEvents.testProvider, { provider: config })
      return assertApiResponse(response, 'Intelligence provider test failed')
    },

    async testCapability(params) {
      const response = await transport.send(intelligenceApiEvents.testCapability, params)
      return assertApiResponse(response, 'Intelligence capability test failed')
    },

    async getCapabilityTestMeta(payload) {
      const response = await transport.send(intelligenceApiEvents.getCapabilityTestMeta, payload)
      return assertApiResponse(response, 'Failed to get capability test metadata')
    },

    async fetchModels(config) {
      const response = await transport.send(intelligenceApiEvents.fetchModels, { provider: config })
      return assertApiResponse(response, 'Failed to fetch models')
    },

    async getAuditLogs(options = {}) {
      const response = await transport.send(intelligenceApiEvents.getAuditLogs, options)
      return assertApiResponse(response, 'Failed to get audit logs')
    },

    async getTodayStats(callerId) {
      const response = await transport.send(intelligenceApiEvents.getTodayStats, { callerId })
      return assertApiResponse(response, 'Failed to get today stats')
    },

    async getMonthStats(callerId) {
      const response = await transport.send(intelligenceApiEvents.getMonthStats, { callerId })
      return assertApiResponse(response, 'Failed to get month stats')
    },

    async getUsageStats(payload) {
      const response = await transport.send(intelligenceApiEvents.getUsageStats, payload)
      return assertApiResponse(response, 'Failed to get usage stats')
    },

    async getQuota(payload) {
      const response = await transport.send(intelligenceApiEvents.getQuota, payload)
      return assertApiResponse(response, 'Failed to get quota')
    },

    async setQuota(config) {
      const response = await transport.send(intelligenceApiEvents.setQuota, config)
      assertApiResponse(response, 'Failed to set quota')
    },

    async deleteQuota(payload) {
      const response = await transport.send(intelligenceApiEvents.deleteQuota, payload)
      assertApiResponse(response, 'Failed to delete quota')
    },

    async getAllQuotas() {
      const response = await transport.send(intelligenceApiEvents.getAllQuotas)
      return assertApiResponse(response, 'Failed to get all quotas')
    },

    async checkQuota(payload) {
      const response = await transport.send(intelligenceApiEvents.checkQuota, payload)
      return assertApiResponse(response, 'Failed to check quota')
    },

    async getCurrentUsage(payload) {
      const response = await transport.send(intelligenceApiEvents.getCurrentUsage, payload)
      return assertApiResponse(response, 'Failed to get current usage')
    },

    async agentSessionStart(payload = {}) {
      const response = await transport.send(intelligenceAgentEvents.sessionStart, payload)
      return assertApiResponse(response, 'Failed to start intelligence session')
    },

    async agentSessionHeartbeat(payload) {
      const response = await transport.send(intelligenceAgentEvents.sessionHeartbeat, payload)
      return assertApiResponse(response, 'Failed to send intelligence heartbeat')
    },

    async agentSessionPause(payload) {
      const response = await transport.send(intelligenceAgentEvents.sessionPause, payload)
      return assertApiResponse(response, 'Failed to pause intelligence session')
    },

    async agentSessionRecoverable() {
      const response = await transport.send(intelligenceAgentEvents.sessionRecoverable)
      return assertApiResponse(response, 'Failed to fetch recoverable intelligence session')
    },

    async agentSessionResume(payload) {
      const response = await transport.send(intelligenceAgentEvents.sessionResume, payload)
      return assertApiResponse(response, 'Failed to resume intelligence session')
    },

    async agentSessionCancel(payload) {
      const response = await transport.send(intelligenceAgentEvents.sessionCancel, payload)
      return assertApiResponse(response, 'Failed to cancel intelligence session')
    },

    async agentSessionGetState(payload) {
      const response = await transport.send(intelligenceAgentEvents.sessionGetState, payload)
      return assertApiResponse(response, 'Failed to get intelligence session state')
    },

    async agentPlan(payload) {
      const response = await transport.send(intelligenceAgentEvents.plan, payload)
      return assertApiResponse(response, 'Failed to create intelligence plan')
    },

    async agentExecute(payload) {
      const response = await transport.send(intelligenceAgentEvents.execute, payload)
      return assertApiResponse(response, 'Failed to execute intelligence plan')
    },

    async agentReflect(payload) {
      const response = await transport.send(intelligenceAgentEvents.reflect, payload)
      return assertApiResponse(response, 'Failed to reflect intelligence result')
    },

    async agentToolCall(payload) {
      const response = await transport.send(intelligenceAgentEvents.toolCall, payload)
      return assertApiResponse(response, 'Failed to call intelligence tool')
    },

    async agentToolResult(payload) {
      const response = await transport.send(intelligenceAgentEvents.toolResult, payload)
      return assertApiResponse(response, 'Failed to report intelligence tool result')
    },

    async agentToolApprove(payload) {
      const response = await transport.send(intelligenceAgentEvents.toolApprove, payload)
      return assertApiResponse(response, 'Failed to approve intelligence tool')
    },

    async agentSessionStream(payload) {
      const response = await transport.send(intelligenceAgentEvents.sessionStream, payload)
      return assertApiResponse(response, 'Failed to stream intelligence trace')
    },

    async agentSessionSubscribe(payload, options) {
      if (typeof transport.stream !== 'function') {
        throw new TypeError('Failed to subscribe intelligence trace stream: transport.stream is unavailable')
      }
      return transport.stream(intelligenceAgentEvents.sessionSubscribe, payload, options)
    },

    async agentSessionHistory(payload = {}) {
      const response = await transport.send(intelligenceAgentEvents.sessionHistory, payload)
      return assertApiResponse(response, 'Failed to query intelligence session history')
    },

    async agentSessionTrace(payload) {
      const response = await transport.send(intelligenceAgentEvents.sessionTrace, payload)
      return assertApiResponse(response, 'Failed to query intelligence trace')
    },

    async agentSessionTraceExport(payload) {
      const response = await transport.send(intelligenceAgentEvents.sessionTraceExport, payload)
      return assertApiResponse(response, 'Failed to export intelligence trace')
    },

    async workflowList(payload = {}) {
      const response = await transport.send(intelligenceWorkflowEvents.list, payload)
      return assertApiResponse(response, 'Failed to list workflows')
    },

    async workflowGet(payload) {
      const response = await transport.send(intelligenceWorkflowEvents.get, payload)
      return assertApiResponse(response, 'Failed to get workflow')
    },

    async workflowSave(workflow) {
      const response = await transport.send(intelligenceWorkflowEvents.save, workflow)
      return assertApiResponse(response, 'Failed to save workflow')
    },

    async workflowDelete(payload) {
      const response = await transport.send(intelligenceWorkflowEvents.delete, payload)
      return assertApiResponse(response, 'Failed to delete workflow')
    },

    async workflowRun(payload) {
      const response = await transport.send(intelligenceWorkflowEvents.run, payload)
      return assertApiResponse(response, 'Failed to run workflow')
    },

    async workflowHistory(payload = {}) {
      const response = await transport.send(intelligenceWorkflowEvents.history, payload)
      return assertApiResponse(response, 'Failed to query workflow history')
    },
  }
}
