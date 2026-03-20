import type { AgentEnvelope, DeepAgentAuditRecord, UserMessageAttachment } from '@talex-touch/tuff-intelligence/pilot'
import type { H3Event } from 'h3'
import type { PilotIntentType } from '../../utils/pilot-routing-resolver'
import process from 'node:process'
import { shouldExecutePilotWebsearch, toDeepAgentErrorDetail } from '@talex-touch/tuff-intelligence/pilot'
import { requirePilotAuth } from '../../utils/auth'
import { getPilotAdminRoutingConfig } from '../../utils/pilot-admin-routing-config'
import {
  PilotAttachmentDeliveryError,
} from '../../utils/pilot-attachment-delivery'
import {
  getPilotMemoryUserPreference,
  normalizePilotMemoryPolicy,
  resolvePilotMemoryEnabled,
} from '../../utils/pilot-chat-memory'
import {
  extractPilotMemoryFacts,
  upsertPilotMemoryFacts,
} from '../../utils/pilot-memory-facts'
import {
  createTitleSseResponse,
  randomId,
  resolveCompatAttachments,
  resolveExecutorModel,
  runWithExecutorTimeout,
  splitTextIntoChunks,
  toTitleMessages,
} from '../../utils/pilot-executor-utils'
import { resolvePilotIntent } from '../../utils/pilot-intent-resolver'
import { resolveLangGraphOrchestratorDecision } from '../../utils/pilot-langgraph-orchestrator'
import {
  ensurePilotQuotaSessionSchema,
  getPilotQuotaSessionByChatId,
  upsertPilotQuotaSession,
} from '../../utils/pilot-quota-session'
import { markRouteFailure, markRouteSuccess } from '../../utils/pilot-route-health'
import {
  recordPilotRoutingMetric,
} from '../../utils/pilot-routing-metrics'
import {
  resolvePilotRoutingSelection,
} from '../../utils/pilot-routing-resolver'
import { createPilotRuntime, PILOT_STRICT_MODE_UNAVAILABLE_CODE } from '../../utils/pilot-runtime'
import { executePilotMediaWithFallback } from '../../utils/pilot-media-fallback'
import {
  generateTitle,
} from '../../utils/pilot-title'
import {
  executePilotImageGenerateTool,
  executePilotWebsearchTool,
  mergeWebsearchContextIntoMessage,
  PilotToolApprovalRejectedError,
  PilotToolApprovalRequiredError,
} from '../../utils/pilot-tool-gateway'
import { quotaError } from '../../utils/quota-api'
import { buildQuotaConversationSnapshot } from '../../utils/quota-conversation-snapshot'
import { extractLatestQuotaUserTurn } from '../../utils/quota-history-codec'
import {
  ensureQuotaHistorySchema,
  getQuotaHistory,
  upsertQuotaHistory,
} from '../../utils/quota-history-store'

interface QuotaExecutorBody {
  chat_id?: string
  channel_id?: string
  topic?: string
  modelId?: string
  model?: string
  internet?: boolean
  thinking?: boolean
  memoryEnabled?: boolean
  pilotMode?: boolean
  routeComboId?: string
  queueWaitMs?: number
  temperature?: number
  generateTitle?: boolean
  messages?: unknown[]
}

interface ExecutorErrorContext {
  requestId?: string
  startedAt?: number
  timeoutMs?: number
  channelId?: string
  adapter?: string
  transport?: string
  endpoint?: string
  model?: string
}

interface ExecutorErrorDetailPayload {
  message: string
  code?: string
  status_code?: number
  status_message?: string
  endpoint?: string
  model?: string
  phase?: string
  cause?: string
  channel_id?: string
  adapter?: string
  transport?: string
  timeout_ms?: number
  request_id?: string
  elapsed_ms?: number
}

interface ExecutorTraceContext {
  requestId: string
  startedAt: number
  method: string
  path: string
  host: string
  runtime: 'node'
  userId: string
  chatId: string
  runtimeSessionId: string
  channelId: string
  adapter: string
  transport: string
  endpoint: string
  timeoutMs: number
  model: string
  modelId: string
  providerModel: string
  routeComboId: string
  queueWaitMs: number
  intentType: Exclude<PilotIntentType, 'intent_classification'>
  intentStrategy: string
  intentReason: string
  intentConfidence: number
  thinking: boolean
  internet: boolean
  memoryEnabled: boolean
  pilotMode: boolean
  builtinTools: string[]
  selectionReason: string
  selectionSource: string
  orchestratorMode: 'langgraph-local' | 'deepagent'
  orchestratorReason: string
  orchestratorAssistantId?: string
  orchestratorGraphProfile?: string
}

type SnapshotPersistStatus = 'streaming' | 'completed' | 'failed'

const STREAM_HEARTBEAT_INTERVAL_MS = 15_000
const STREAM_HEARTBEAT_IDLE_MS = 12_000
const SNAPSHOT_PERSIST_INTERVAL_MS = 0
const STREAM_DELTA_EMIT_CHUNK_SIZE = 32

function getEnvelopeText(envelope: AgentEnvelope): string {
  const payload = envelope.payload as Record<string, unknown> | null | undefined
  const text = payload?.text
  if (typeof text === 'string') {
    return text
  }
  if (text === null || text === undefined) {
    return ''
  }
  return String(text)
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value ?? null)
  }
  catch {
    return String(value ?? '')
  }
}

function truncateText(value: string, maxLength = 240): string {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`
}

function buildImageMarkdown(urls: string[]): string {
  const list = urls
    .map(item => String(item || '').trim())
    .filter(Boolean)
  if (list.length <= 0) {
    return ''
  }
  return list
    .map((url, index) => `![Generated image ${index + 1}](${url})`)
    .join('\n\n')
}

function resolveMemoryUpdateReason(input: {
  memoryEnabled: boolean
  requestedMemoryEnabled: boolean | undefined
  memoryUserPreference: boolean | null
  shouldStoreByIntent: boolean
  memoryDecisionReason: string
  addedCount: number
  extractorFailed: boolean
}): 'stored' | 'disabled_by_user' | 'policy_disabled' | 'intent_skip' | 'no_fact_extracted' | 'extractor_failed' {
  if (!input.memoryEnabled) {
    if (input.requestedMemoryEnabled === false || input.memoryUserPreference === false) {
      return 'disabled_by_user'
    }
    return 'policy_disabled'
  }

  if (!input.shouldStoreByIntent) {
    if (input.memoryDecisionReason === 'intent_skip') {
      return 'intent_skip'
    }
    return 'no_fact_extracted'
  }

  if (input.extractorFailed) {
    return 'extractor_failed'
  }

  if (input.addedCount > 0) {
    return 'stored'
  }
  return 'no_fact_extracted'
}

function normalizeErrorCause(cause: unknown): string | undefined {
  if (!cause) {
    return undefined
  }
  if (typeof cause === 'string') {
    return truncateText(cause, 320)
  }
  if (cause instanceof Error) {
    return truncateText(cause.message || cause.name, 320)
  }
  try {
    return truncateText(JSON.stringify(cause), 320)
  }
  catch {
    return truncateText(String(cause), 320)
  }
}

function safeParseJsonRecord(value: string): Record<string, unknown> {
  const text = String(value || '').trim()
  if (!text) {
    return {}
  }
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  }
  catch {
    // ignore parse errors and fallback to empty object
  }
  return {}
}

function buildSnapshotMetaPayload(
  previousMeta: string,
  status: SnapshotPersistStatus,
  trace: ExecutorTraceContext,
  detail?: ExecutorErrorDetailPayload,
): string {
  const previous = safeParseJsonRecord(previousMeta)
  const next: Record<string, unknown> = {
    ...previous,
    sync_status: status,
    sync_updated_at: new Date().toISOString(),
    request_id: trace.requestId,
    runtime_session_id: trace.runtimeSessionId,
    channel_id: trace.channelId,
    adapter: trace.adapter,
    transport: trace.transport,
    model: trace.model,
    model_id: trace.modelId,
    provider_model: trace.providerModel,
    route_combo_id: trace.routeComboId,
    queue_wait_ms: trace.queueWaitMs,
    intent_type: trace.intentType,
    intent_strategy: trace.intentStrategy,
    intent_reason: trace.intentReason,
    intent_confidence: trace.intentConfidence,
    internet: trace.internet,
    thinking: trace.thinking,
    memory_enabled: trace.memoryEnabled,
    pilot_mode: trace.pilotMode,
    selection_source: trace.selectionSource,
    selection_reason: trace.selectionReason,
    orchestrator_mode: trace.orchestratorMode,
    orchestrator_reason: trace.orchestratorReason,
    orchestrator_assistant_id: trace.orchestratorAssistantId,
    orchestrator_graph_profile: trace.orchestratorGraphProfile,
  }

  if (status === 'failed' && detail) {
    next.last_error = {
      message: detail.message,
      code: detail.code,
      status_code: detail.status_code,
      status_message: detail.status_message,
      phase: detail.phase,
      cause: detail.cause,
      endpoint: detail.endpoint,
      timeout_ms: detail.timeout_ms,
      elapsed_ms: detail.elapsed_ms,
      request_id: detail.request_id,
    }
  }
  else {
    delete next.last_error
  }

  return JSON.stringify(next)
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function trimSuffixSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function buildUpstreamEndpoint(baseUrl: string, transport: string): string {
  const normalizedBaseUrl = trimSuffixSlash(String(baseUrl || '').trim())
  if (!normalizedBaseUrl) {
    return ''
  }
  const hasVersionPath = normalizedBaseUrl.endsWith('/v1')
  if (transport === 'chat.completions') {
    return hasVersionPath
      ? `${normalizedBaseUrl}/chat/completions`
      : `${normalizedBaseUrl}/v1/chat/completions`
  }
  return hasVersionPath
    ? `${normalizedBaseUrl}/responses`
    : `${normalizedBaseUrl}/v1/responses`
}

function toBooleanFlag(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === '1'
    || normalized === 'true'
    || normalized === 'yes'
    || normalized === 'on'
}

function resolveExecutorDebugEnabled(event: H3Event): boolean {
  const eventLike = event as unknown as {
    context?: {
      runtimeConfig?: {
        pilot?: Record<string, unknown>
      }
    }
  }

  const runtimePilot = eventLike.context?.runtimeConfig?.pilot
  if (toBooleanFlag(runtimePilot?.PILOT_EXECUTOR_DEBUG) || toBooleanFlag(runtimePilot?.executorDebug)) {
    return true
  }

  return toBooleanFlag(process.env.PILOT_EXECUTOR_DEBUG)
}

function resolveRequestMeta(event: H3Event): {
  method: string
  path: string
  host: string
  runtime: 'node'
} {
  const eventLike = event as unknown as {
    method?: string
    path?: string
    node?: {
      req?: {
        method?: string
        url?: string
        headers?: Record<string, string | string[] | undefined>
      }
    }
  }

  const method = String(eventLike.method || eventLike.node?.req?.method || 'POST').toUpperCase()
  const path = String(eventLike.path || eventLike.node?.req?.url || '')
  const hostValue = eventLike.node?.req?.headers?.host
  const host = Array.isArray(hostValue) ? String(hostValue[0] || '') : String(hostValue || '')
  return {
    method,
    path,
    host,
    runtime: 'node',
  }
}

function buildErrorMeta(error: unknown): Record<string, unknown> {
  const row = toObject(error)
  const meta: Record<string, unknown> = {}

  if (error instanceof Error) {
    meta.name = error.name
    meta.message = error.message
    if (error.stack) {
      meta.stack = truncateText(error.stack, 2_000)
    }
  }
  else {
    meta.message = truncateText(String(error || ''), 800)
  }

  const code = row.code
  if (typeof code === 'string' || typeof code === 'number') {
    meta.code = code
  }

  const statusCode = row.statusCode ?? row.status
  if (typeof statusCode === 'string' || typeof statusCode === 'number') {
    meta.status_code = statusCode
  }

  const statusMessage = row.statusMessage
  if (typeof statusMessage === 'string' && statusMessage.trim()) {
    meta.status_message = statusMessage.trim()
  }

  const cause = row.cause ?? (error instanceof Error ? error.cause : undefined)
  if (cause !== undefined) {
    meta.cause = normalizeErrorCause(cause)
    const causeRow = toObject(cause)
    if (typeof causeRow.code === 'string' || typeof causeRow.code === 'number') {
      meta.cause_code = causeRow.code
    }
    if (typeof causeRow.errno === 'string' || typeof causeRow.errno === 'number') {
      meta.cause_errno = causeRow.errno
    }
    if (typeof causeRow.syscall === 'string') {
      meta.cause_syscall = causeRow.syscall
    }
    if (typeof causeRow.address === 'string') {
      meta.cause_address = causeRow.address
    }
    if (typeof causeRow.port === 'string' || typeof causeRow.port === 'number') {
      meta.cause_port = causeRow.port
    }
  }

  return meta
}

function logExecutorEvent(
  level: 'info' | 'warn' | 'error',
  scope: string,
  payload: Record<string, unknown>,
): void {
  const log = level === 'error'
    ? console.error
    : level === 'warn'
      ? console.warn
      : console.info
  log(`[pilot-executor-${scope}]`, safeStringify({
    ...payload,
    ts: Date.now(),
  }))
}

function shouldLogAuditRecord(type: string, debugEnabled: boolean): boolean {
  if (debugEnabled) {
    return true
  }
  return type === 'upstream.error'
    || type === 'upstream.response_error'
    || type === 'upstream.direct_stream_error'
    || type === 'upstream.retry'
    || type === 'upstream.transport_fallback'
    || type === 'upstream.compat_fallback'
}

function logExecutorAuditRecord(
  record: DeepAgentAuditRecord,
  trace: ExecutorTraceContext,
  debugEnabled: boolean,
): void {
  if (!shouldLogAuditRecord(String(record.type || ''), debugEnabled)) {
    return
  }

  const level: 'info' | 'warn' | 'error' = record.type.includes('error')
    ? 'error'
    : record.type.includes('retry') || record.type.includes('fallback')
      ? 'warn'
      : 'info'

  logExecutorEvent(level, 'audit', {
    request_id: trace.requestId,
    audit_type: record.type,
    elapsed_ms: Math.max(0, Date.now() - trace.startedAt),
    channel_id: trace.channelId,
    adapter: trace.adapter,
    transport: trace.transport,
    endpoint: trace.endpoint,
    payload: record.payload,
  })
}

function buildExecutorErrorDetail(error: unknown, context?: ExecutorErrorContext): ExecutorErrorDetailPayload {
  const detail = toDeepAgentErrorDetail(error)
  const timeoutMs = Number(context?.timeoutMs)
  const resolvedTimeoutMs = Number.isFinite(timeoutMs)
    ? Math.max(3_000, Math.floor(timeoutMs))
    : undefined
  const elapsedMs = Number(context?.startedAt)
  const resolvedElapsedMs = Number.isFinite(elapsedMs)
    ? Math.max(0, Date.now() - elapsedMs)
    : undefined

  return {
    message: detail.message || 'executor failed',
    code: detail.code,
    status_code: detail.statusCode,
    status_message: detail.statusMessage,
    endpoint: detail.endpoint || context?.endpoint,
    model: detail.model || context?.model,
    phase: detail.phase,
    cause: normalizeErrorCause(detail.cause),
    channel_id: context?.channelId,
    adapter: context?.adapter,
    transport: context?.transport,
    timeout_ms: resolvedTimeoutMs,
    request_id: context?.requestId,
    elapsed_ms: resolvedElapsedMs,
  }
}

function mapExecutorErrorMessage(
  error: unknown,
  context?: ExecutorErrorContext,
  detail?: ExecutorErrorDetailPayload,
): string {
  const detailCode = String(detail?.code || '').trim().toUpperCase()
  if (detailCode === 'ATTACHMENT_UNREACHABLE') {
    return '附件不可达：请配置可公网访问的附件 URL（推荐 https）或 provider file id。'
  }
  if (detailCode === 'ATTACHMENT_TOO_LARGE_FOR_INLINE') {
    return '附件过大且无法走 URL/ID 投递：请缩小文件，或先配置可公网访问的附件地址。'
  }
  if (detailCode === 'ATTACHMENT_LOAD_FAILED') {
    return '附件读取失败，请重试上传后再发送。'
  }

  const raw = error instanceof Error ? error.message : String(error || 'executor failed')
  if (raw.includes('530 status code')) {
    return '上游 AIAPI 不可达，请检查后台渠道配置与网关状态'
  }
  const normalized = raw.toLowerCase()
  if (
    normalized.includes('request timed out')
    || normalized.includes('timed out')
    || normalized.includes('timeout')
    || normalized.includes('aborterror')
  ) {
    const timeoutMs = Number(context?.timeoutMs)
    const resolvedTimeoutMs = Number.isFinite(timeoutMs)
      ? Math.max(3_000, Math.floor(timeoutMs))
      : null
    const timeoutLabel = resolvedTimeoutMs ? `${resolvedTimeoutMs}ms` : '当前超时阈值'
    const channelSuffix = context?.channelId
      ? `（渠道：${context.channelId}${context?.transport ? ` / ${context.transport}` : ''}）`
      : ''
    return `请求超时（${timeoutLabel}）${channelSuffix}，请重试或切换渠道。`
  }
  if (
    normalized.includes('connection error')
    || normalized.includes('fetch failed')
    || normalized.includes('network error')
    || normalized.includes('socket hang up')
    || normalized.includes('econnreset')
    || normalized.includes('econnrefused')
    || normalized.includes('etimedout')
  ) {
    const endpoint = detail?.endpoint ? `（endpoint: ${detail.endpoint}）` : ''
    const channel = context?.channelId
      ? `（渠道：${context.channelId}${context?.transport ? ` / ${context.transport}` : ''}）`
      : ''
    return `上游连接失败${channel}${endpoint}，请检查网关连通性与渠道状态后重试。`
  }
  if (
    normalized.includes('unsupported legacy protocol')
    || normalized.includes('/v1/chat/completions is not supported')
  ) {
    const channelLabel = context?.channelId
      ? `（渠道：${context.channelId}${context?.adapter ? ` / ${context.adapter}` : ''}）`
      : ''
    return `渠道协议不匹配${channelLabel}：该渠道不支持 chat.completions，请改为 responses。`
  }
  return raw
}

function logExecutorError(
  scope: 'runtime-envelope' | 'executor-catch',
  message: string,
  detail: ExecutorErrorDetailPayload,
  trace: ExecutorTraceContext,
  error?: unknown,
): void {
  logExecutorEvent('error', 'error', {
    scope,
    message,
    detail,
    request_id: trace.requestId,
    elapsed_ms: Math.max(0, Date.now() - trace.startedAt),
    method: trace.method,
    path: trace.path,
    host: trace.host,
    runtime: trace.runtime,
    user_id: trace.userId,
    chat_id: trace.chatId,
    runtime_session_id: trace.runtimeSessionId,
    channel_id: trace.channelId,
    adapter: trace.adapter,
    transport: trace.transport,
    endpoint: trace.endpoint,
    timeout_ms: trace.timeoutMs,
    model: trace.model,
    model_id: trace.modelId,
    provider_model: trace.providerModel,
    route_combo_id: trace.routeComboId,
    queue_wait_ms: trace.queueWaitMs,
    intent_type: trace.intentType,
    intent_strategy: trace.intentStrategy,
    intent_reason: trace.intentReason,
    intent_confidence: trace.intentConfidence,
    internet: trace.internet,
    thinking: trace.thinking,
    memory_enabled: trace.memoryEnabled,
    builtin_tools: trace.builtinTools,
    selection_reason: trace.selectionReason,
    selection_source: trace.selectionSource,
    orchestrator_mode: trace.orchestratorMode,
    orchestrator_reason: trace.orchestratorReason,
    orchestrator_assistant_id: trace.orchestratorAssistantId,
    orchestrator_graph_profile: trace.orchestratorGraphProfile,
    raw_error: buildErrorMeta(error),
  })
}

function getWaitUntilHandler(event: H3Event): ((promise: Promise<unknown>) => void) | null {
  const eventLike = event as unknown as {
    waitUntil?: (promise: Promise<unknown>) => void
    context?: {
      waitUntil?: (promise: Promise<unknown>) => void
    }
  }

  if (typeof eventLike.waitUntil === 'function') {
    return eventLike.waitUntil.bind(eventLike)
  }
  if (typeof eventLike.context?.waitUntil === 'function') {
    return eventLike.context.waitUntil.bind(eventLike.context)
  }
  return null
}

function extractCapabilityInfo(envelope: AgentEnvelope): {
  name: string
  data: string
} {
  const payload = envelope.payload && typeof envelope.payload === 'object'
    ? (envelope.payload as Record<string, unknown>)
    : {}

  const name = String(
    payload.capabilityId
    || payload.toolId
    || payload.name
    || payload.id
    || 'tool',
  )

  const sourceData = envelope.type === 'capability.call'
    ? payload.input ?? payload
    : payload.output ?? payload.result ?? payload

  return {
    name,
    data: safeStringify(sourceData),
  }
}

function normalizeToolAuditPayload(
  payload: unknown,
): {
  auditType: string
  callId: string
  toolId: string
  toolName: string
  outputPreview: string
  inputPreview: string
  ticketId: string
  sources: Array<Record<string, unknown>>
  status: string
  errorCode: string
  errorMessage: string
  durationMs: number
  connectorSource: string
  connectorReason: string
} {
  const row = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {}
  const sources = Array.isArray(row.sources)
    ? row.sources
        .filter(item => item && typeof item === 'object' && !Array.isArray(item))
        .map(item => item as Record<string, unknown>)
    : []

  return {
    auditType: String(row.auditType || '').trim(),
    callId: String(row.callId || '').trim(),
    toolId: String(row.toolId || '').trim() || 'tool.unknown',
    toolName: String(row.toolName || '').trim() || 'tool',
    outputPreview: String(row.outputPreview || '').trim(),
    inputPreview: String(row.inputPreview || '').trim(),
    ticketId: String(row.ticketId || '').trim(),
    sources,
    status: String(row.status || '').trim(),
    errorCode: String(row.errorCode || '').trim(),
    errorMessage: String(row.errorMessage || '').trim(),
    durationMs: Number.isFinite(Number(row.durationMs))
      ? Math.max(0, Number(row.durationMs))
      : 0,
    connectorSource: String(row.connectorSource || '').trim(),
    connectorReason: String(row.connectorReason || '').trim(),
  }
}

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const body = await readBody<QuotaExecutorBody>(event)
  const latestUserTurn = extractLatestQuotaUserTurn(body?.messages)
  const message = String(latestUserTurn.text || '').trim()
  const isTitleRequest = Boolean(body?.generateTitle)
  const hasRawAttachments = latestUserTurn.attachments.some(item => String(item?.value || '').trim())

  if (!isTitleRequest && !message && !hasRawAttachments) {
    return quotaError(400, 'user message is required', null)
  }

  await ensureQuotaHistorySchema(event)
  await ensurePilotQuotaSessionSchema(event)

  const requestedChatId = String(body?.chat_id || '').trim()
  const existingSession = requestedChatId
    ? await getPilotQuotaSessionByChatId(event, auth.userId, requestedChatId)
    : null

  const chatId = requestedChatId || existingSession?.chatId || randomId('Chat')
  const runtimeSessionId = existingSession?.runtimeSessionId || randomId('session')
  const requestId = randomId('req')
  const requestedModelId = String(body?.modelId || body?.model || '').trim()
  const requestedRouteComboId = String(body?.routeComboId || '').trim()
  const intentDecision = isTitleRequest
    ? {
        intentType: 'chat' as const,
        prompt: message,
        strategy: 'fallback' as const,
        confidence: 0,
        reason: 'title_request',
        websearchRequired: false,
        websearchReason: 'title_request',
        memoryDecision: {
          shouldStore: false,
          reason: 'intent_skip' as const,
        },
      }
    : await resolvePilotIntent({
        event,
        message,
        requestChannelId: String(body?.channel_id || '').trim(),
        sessionChannelId: existingSession?.channelId,
        requestedModelId,
        routeComboId: requestedRouteComboId,
      })
  const routedMessage = intentDecision.prompt || message

  let selectedChannel: Awaited<ReturnType<typeof resolvePilotRoutingSelection>>
  try {
    selectedChannel = await resolvePilotRoutingSelection(event, {
      requestChannelId: String(body?.channel_id || '').trim(),
      sessionChannelId: existingSession?.channelId,
      requestedModelId,
      routeComboId: requestedRouteComboId,
      internet: body?.internet,
      thinking: body?.thinking,
      intentType: intentDecision.intentType,
    })
  }
  catch (error: any) {
    const detail = error?.data && typeof error.data === 'object'
      ? (error.data as Record<string, unknown>)
      : {}
    const message = String(error?.message || error?.statusMessage || '当前无可用渠道，请检查渠道配置。')
    const code = String(detail.code || 'PILOT_CHANNEL_UNAVAILABLE')
    const reason = String(detail.reason || '').trim()
    const statusCode = Number.isFinite(Number(error?.statusCode))
      ? Math.max(400, Math.floor(Number(error.statusCode)))
      : 503
    const normalizedDetail: Record<string, unknown> = {
      ...detail,
      code,
      reason: reason || 'channel_selection_failed',
      status_code: Number.isFinite(Number(detail.status_code))
        ? Math.max(400, Math.floor(Number(detail.status_code)))
        : statusCode,
      request_id: String(detail.request_id || requestId).trim() || requestId,
      intent_type: intentDecision.intentType,
      intent_reason: intentDecision.reason,
      model_id: String(
        detail.model_id
        || detail.modelId
        || requestedModelId
        || 'quota-auto',
      ).trim() || 'quota-auto',
      provider_model: String(
        detail.provider_model
        || detail.providerModel
        || requestedModelId
        || 'quota-auto',
      ).trim() || 'quota-auto',
      route_combo_id: String(
        detail.route_combo_id
        || detail.routeComboId
        || requestedRouteComboId
        || 'default-auto',
      ).trim() || 'default-auto',
      selection_source: String(
        detail.selection_source
        || detail.selectionSource
        || 'routing-resolver',
      ).trim() || 'routing-resolver',
      selection_reason: String(
        detail.selection_reason
        || detail.selectionReason
        || reason
        || 'channel_selection_failed',
      ).trim() || 'channel_selection_failed',
      orchestrator_reason: String(
        detail.orchestrator_reason
        || detail.orchestratorReason
        || '',
      ).trim(),
      channel_id: String(
        detail.channel_id
        || detail.channelId
        || body?.channel_id
        || existingSession?.channelId
        || '',
      ).trim(),
      session_channel_id: String(existingSession?.channelId || '').trim(),
      request_channel_id: String(body?.channel_id || '').trim(),
    }

    console.warn('[pilot][executor] channel selection failed', {
      user_id: auth.userId,
      chat_id: chatId,
      requested_chat_id: requestedChatId || null,
      request_channel_id: String(body?.channel_id || '').trim() || null,
      session_channel_id: existingSession?.channelId || null,
      code,
      reason: reason || null,
      status_code: statusCode,
      message,
      detail: normalizedDetail,
    })

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'status_updated', status: 'start', id: 'assistant' })}\n\n`))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          event: 'error',
          status: 'failed',
          code,
          reason: String(normalizedDetail.reason || reason || 'channel_selection_failed'),
          message,
          request_id: normalizedDetail.request_id,
          status_code: normalizedDetail.status_code,
          detail: normalizedDetail,
        })}\n\n`))
        controller.enqueue(encoder.encode('data: [DONE]\\n\\n'))
        controller.close()
      },
    })

    return new Response(stream, {
      status: statusCode,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    })
  }

  await upsertPilotQuotaSession(event, {
    chatId,
    userId: auth.userId,
    runtimeSessionId,
    channelId: selectedChannel.channelId,
    topic: String(body?.topic || existingSession?.topic || '').trim() || '新的聊天',
  })

  const selectedModel = intentDecision.intentType === 'chat'
    ? resolveExecutorModel(
        body?.modelId || body?.model,
        selectedChannel.providerModel || selectedChannel.channel.model,
      )
    : (selectedChannel.providerModel || selectedChannel.channel.model)
  const routingConfig = await getPilotAdminRoutingConfig(event).catch(() => ({
    modelCatalog: [],
    routeCombos: [],
    routingPolicy: {
      defaultModelId: 'quota-auto',
      defaultRouteComboId: 'default-auto',
      quotaAutoStrategy: 'speed-first' as const,
      explorationRate: 0.08,
      intentNanoModelId: '',
      intentRouteComboId: '',
      imageGenerationModelId: '',
      imageRouteComboId: '',
    },
    lbPolicy: {
      metricWindowHours: 24,
      recentRequestWindow: 200,
      circuitBreakerFailureThreshold: 3,
      circuitBreakerCooldownMs: 60_000,
      halfOpenProbeCount: 1,
    },
    memoryPolicy: {
      enabledByDefault: true,
      allowUserDisable: true,
      allowUserClear: true,
    },
  }))
  const healthPolicy = {
    failureThreshold: routingConfig.lbPolicy.circuitBreakerFailureThreshold,
    cooldownMs: routingConfig.lbPolicy.circuitBreakerCooldownMs,
    halfOpenProbeCount: routingConfig.lbPolicy.halfOpenProbeCount,
  }
  const memoryPolicy = normalizePilotMemoryPolicy(routingConfig.memoryPolicy)
  const memoryUserPreference = typeof body?.memoryEnabled === 'boolean'
    ? null
    : await getPilotMemoryUserPreference(event, auth.userId)
  const memoryEnabled = resolvePilotMemoryEnabled(memoryPolicy, body?.memoryEnabled, memoryUserPreference)
  const pilotMode = body?.pilotMode === true
  const queueWaitMs = Number.isFinite(Number(body?.queueWaitMs))
    ? Math.max(0, Math.floor(Number(body?.queueWaitMs)))
    : 0
  const orchestratorDecision = await resolveLangGraphOrchestratorDecision(
    event,
    selectedChannel.routeComboId || 'default-auto',
    {
      preferLangGraph: pilotMode,
    },
  )
  const requestMeta = resolveRequestMeta(event)
  const debugEnabled = resolveExecutorDebugEnabled(event)
  const trace: ExecutorTraceContext = {
    requestId,
    startedAt: Date.now(),
    method: requestMeta.method,
    path: requestMeta.path,
    host: requestMeta.host,
    runtime: requestMeta.runtime,
    userId: auth.userId,
    chatId,
    runtimeSessionId,
    channelId: selectedChannel.channelId,
    adapter: selectedChannel.adapter,
    transport: selectedChannel.transport,
    endpoint: buildUpstreamEndpoint(selectedChannel.channel.baseUrl, selectedChannel.transport),
    timeoutMs: selectedChannel.channel.timeoutMs,
    model: selectedModel,
    modelId: selectedChannel.modelId || selectedModel,
    providerModel: selectedChannel.providerModel || selectedModel,
    routeComboId: selectedChannel.routeComboId || 'default-auto',
    queueWaitMs,
    intentType: intentDecision.intentType,
    intentStrategy: intentDecision.strategy,
    intentReason: intentDecision.reason,
    intentConfidence: intentDecision.confidence,
    thinking: selectedChannel.thinking,
    internet: selectedChannel.internet,
    memoryEnabled,
    pilotMode,
    builtinTools: selectedChannel.builtinTools,
    selectionReason: selectedChannel.selectionReason,
    selectionSource: selectedChannel.selectionSource,
    orchestratorMode: orchestratorDecision.mode,
    orchestratorReason: orchestratorDecision.reason,
    orchestratorAssistantId: orchestratorDecision.assistantId,
    orchestratorGraphProfile: orchestratorDecision.graphProfile,
  }

  if (isTitleRequest) {
    const titleMessages = toTitleMessages(body?.messages)
    let titleMode: 'ai' | 'fallback' | 'empty' = 'fallback'
    let generatedTitle = '新的聊天'

    try {
      const result = await generateTitle({
        baseUrl: selectedChannel.channel.baseUrl,
        apiKey: selectedChannel.channel.apiKey,
        model: selectedModel,
        messages: titleMessages,
      })
      titleMode = result.source
      generatedTitle = result.title || '新的聊天'
    }
    catch (error) {
      logExecutorEvent('warn', 'title', {
        phase: 'title.generate.failed',
        request_id: trace.requestId,
        chat_id: trace.chatId,
        channel_id: trace.channelId,
        adapter: trace.adapter,
        transport: trace.transport,
        title_model: selectedModel,
        error: buildErrorMeta(error),
      })
    }

    logExecutorEvent('info', 'title', {
      phase: 'title.generated',
      request_id: trace.requestId,
      chat_id: trace.chatId,
      channel_id: trace.channelId,
      adapter: trace.adapter,
      transport: trace.transport,
      title_mode: titleMode,
      title_model: selectedModel,
      title_preview_chars: titleMessages.reduce((sum, row) => sum + row.content.length, 0),
      title_chars: generatedTitle.length,
    })

    return createTitleSseResponse(generatedTitle || '新的聊天')
  }

  if (pilotMode && orchestratorDecision.mode !== 'langgraph-local') {
    const statusCode = 503
    const detail: Record<string, unknown> = {
      code: PILOT_STRICT_MODE_UNAVAILABLE_CODE,
      reason: String(orchestratorDecision.reason || '').trim() || 'pilot_strict_mode_unavailable',
      status_code: statusCode,
      message: 'Pilot 严格模式不可用：当前未满足 LangGraph 运行条件，请检查配置后重试。',
      request_id: trace.requestId,
      pilot_mode: true,
      orchestrator_mode: orchestratorDecision.mode,
      orchestrator_reason: orchestratorDecision.reason,
      orchestrator_assistant_id: orchestratorDecision.assistantId,
      orchestrator_graph_profile: orchestratorDecision.graphProfile,
      orchestrator_endpoint: orchestratorDecision.endpoint,
      route_combo_id: trace.routeComboId,
      channel_id: trace.channelId,
      adapter: trace.adapter,
      transport: trace.transport,
      model_id: trace.modelId,
      provider_model: trace.providerModel,
    }

    logExecutorEvent('warn', 'request', {
      phase: 'request.strict_mode_unavailable',
      request_id: trace.requestId,
      elapsed_ms: Math.max(0, Date.now() - trace.startedAt),
      chat_id: trace.chatId,
      runtime_session_id: trace.runtimeSessionId,
      ...detail,
    })

    const strictEncoder = new TextEncoder()
    const strictStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(strictEncoder.encode(`data: ${JSON.stringify({ event: 'status_updated', status: 'start', id: 'assistant' })}\n\n`))
        controller.enqueue(strictEncoder.encode(`data: ${JSON.stringify({
          event: 'error',
          status: 'failed',
          code: PILOT_STRICT_MODE_UNAVAILABLE_CODE,
          reason: detail.reason,
          message: detail.message,
          request_id: detail.request_id,
          status_code: detail.status_code,
          detail,
        })}\n\n`))
        controller.enqueue(strictEncoder.encode('data: [DONE]\\n\\n'))
        controller.close()
      },
    })

    return new Response(strictStream, {
      status: statusCode,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    })
  }

  logExecutorEvent('info', 'request', {
    phase: 'request.start',
    request_id: trace.requestId,
    method: trace.method,
    path: trace.path,
    host: trace.host,
    runtime: trace.runtime,
    user_id: trace.userId,
    chat_id: trace.chatId,
    runtime_session_id: trace.runtimeSessionId,
    channel_id: trace.channelId,
    adapter: trace.adapter,
    transport: trace.transport,
    endpoint: trace.endpoint,
    timeout_ms: trace.timeoutMs,
    model: trace.model,
    model_id: trace.modelId,
    provider_model: trace.providerModel,
    route_combo_id: trace.routeComboId,
    queue_wait_ms: trace.queueWaitMs,
    intent_type: trace.intentType,
    intent_strategy: trace.intentStrategy,
    intent_reason: trace.intentReason,
    intent_confidence: trace.intentConfidence,
    internet: trace.internet,
    thinking: trace.thinking,
    builtin_tools: trace.builtinTools,
    selection_reason: trace.selectionReason,
    orchestrator_mode: trace.orchestratorMode,
    orchestrator_reason: trace.orchestratorReason,
    orchestrator_assistant_id: trace.orchestratorAssistantId,
    orchestrator_graph_profile: trace.orchestratorGraphProfile,
    message_chars: routedMessage.length,
    message_preview: truncateText(routedMessage, 120),
    attachment_count: latestUserTurn.attachments.length,
    has_raw_attachments: hasRawAttachments,
    requested_chat_id: requestedChatId || null,
    selection_source: trace.selectionSource,
    debug_enabled: debugEnabled,
  })

  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) {
          return
        }
        closed = true
        controller.close()
      }

      const emit = (payload: Record<string, unknown> | '[DONE]') => {
        if (closed) {
          return
        }

        const serialized = payload === '[DONE]'
          ? '[DONE]'
          : JSON.stringify(payload)
        controller.enqueue(encoder.encode(`data: ${serialized}\n\n`))
      }

      const run = async () => {
        let completedText = ''
        let completedSent = false
        let streamedDelta = false
        let streamFailed = false
        let streamWaitingApproval = false
        let streamErrorDetail: ExecutorErrorDetailPayload | null = null
        let metricSuccess = false
        let metricFinishReason = 'error'
        let metricErrorCode = ''
        let ttftMs = 0
        let firstDeltaAt = 0
        let lastStreamEventAt = Date.now()
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null
        let snapshotSeedLoaded = false
        let snapshotBaseValue = ''
        let snapshotMeta = ''
        let snapshotTopic = String(body?.topic || existingSession?.topic || '').trim() || '新的聊天'
        let lastPersistAt = 0
        let lastPersistedReply = ''
        let persistPromise: Promise<void> = Promise.resolve()
        let resolvedLegacyAttachments: {
          attachments: UserMessageAttachment[]
          summary: Record<string, unknown>
        } = {
          attachments: [],
          summary: {
            total: 0,
            resolved: 0,
            unresolved: 0,
            idCount: 0,
            urlCount: 0,
            base64Count: 0,
            loadedObjectCount: 0,
            inlinedImageBytes: 0,
            inlinedFileBytes: 0,
          },
        }
        let websearchContextText = ''
        let websearchSources: Array<Record<string, unknown>> = []
        let websearchConnectorSource: 'gateway' | 'responses_builtin' | 'none' = 'none'
        let websearchConnectorReason = 'not_evaluated'
        const memoryHistoryMessageCount = Array.isArray(body?.messages)
          ? body.messages.length
          : 0
        let memoryHistoryAfterMessageCount = memoryHistoryMessageCount
        let memoryAddedCount = 0
        let memoryExtractorFailed = false
        const websearchDecision = shouldExecutePilotWebsearch({
          message: routedMessage,
          intentType: intentDecision.intentType,
          internetEnabled: trace.internet,
          builtinTools: selectedChannel.builtinTools,
          intentWebsearchRequired: intentDecision.websearchRequired,
        })
        websearchConnectorReason = websearchDecision.reason
        let runtimeStore: ReturnType<typeof createPilotRuntime>['store'] | null = null

        const touchStreamEventAt = () => {
          lastStreamEventAt = Date.now()
        }

        const emitToolAudit = (payload: Record<string, unknown>) => {
          const normalized = normalizeToolAuditPayload(payload)
          const riskLevel = String(payload.riskLevel || 'low')
          emit({
            event: 'run.audit',
            payload: {
              auditType: normalized.auditType,
              callId: normalized.callId,
              toolId: normalized.toolId,
              toolName: normalized.toolName,
              riskLevel,
              status: normalized.status,
              inputPreview: normalized.inputPreview,
              outputPreview: normalized.outputPreview,
              durationMs: normalized.durationMs,
              ticketId: normalized.ticketId,
              sources: normalized.sources,
              errorCode: normalized.errorCode,
              errorMessage: normalized.errorMessage,
              connectorSource: normalized.connectorSource,
              connectorReason: normalized.connectorReason,
            },
          })
          touchStreamEventAt()
        }

        const emitMemoryUpdatedEvent = async (assistantReply = '') => {
          const runtimeMessages = memoryEnabled && runtimeStore
            ? await runtimeStore.runtime.listMessages(runtimeSessionId).catch(() => [])
            : []
          memoryHistoryAfterMessageCount = runtimeMessages.length
          memoryAddedCount = 0
          memoryExtractorFailed = false
          const shouldStoreByIntent = intentDecision.memoryDecision.shouldStore === true
          if (memoryEnabled && shouldStoreByIntent && routedMessage) {
            const latestAssistantReply = runtimeMessages
              .filter(item => item.role === 'assistant')
              .at(-1)?.content || assistantReply
            try {
              const facts = await extractPilotMemoryFacts({
                message: routedMessage,
                assistantReply: latestAssistantReply,
                channel: {
                  baseUrl: selectedChannel.channel.baseUrl,
                  apiKey: selectedChannel.channel.apiKey,
                  model: selectedModel,
                  transport: selectedChannel.transport,
                  timeoutMs: selectedChannel.channel.timeoutMs,
                },
              })
              if (facts.length > 0) {
                const upserted = await upsertPilotMemoryFacts(event, {
                  sessionId: runtimeSessionId,
                  userId: auth.userId,
                  sourceText: routedMessage,
                  facts,
                })
                memoryAddedCount = upserted.addedCount
              }
            }
            catch {
              memoryExtractorFailed = true
            }
          }

          const reason = resolveMemoryUpdateReason({
            memoryEnabled,
            requestedMemoryEnabled: body?.memoryEnabled,
            memoryUserPreference,
            shouldStoreByIntent,
            memoryDecisionReason: String(intentDecision.memoryDecision.reason || '').trim(),
            addedCount: memoryAddedCount,
            extractorFailed: memoryExtractorFailed,
          })
          const stored = memoryAddedCount > 0
          emit({
            event: 'memory.updated',
            payload: {
              memoryEnabled,
              historyBefore: memoryHistoryMessageCount,
              historyAfter: memoryHistoryAfterMessageCount,
              addedCount: memoryAddedCount,
              stored,
              reason,
            },
          })
          touchStreamEventAt()
        }

        const startHeartbeat = () => {
          if (heartbeatTimer || closed) {
            return
          }
          heartbeatTimer = setInterval(() => {
            if (closed) {
              return
            }
            const idleMs = Date.now() - lastStreamEventAt
            if (idleMs < STREAM_HEARTBEAT_IDLE_MS) {
              return
            }
            emit({
              event: 'status_updated',
              status: 'verbose',
              id: 'assistant',
              name: 'heartbeat',
              data: `waiting_upstream:${idleMs}ms`,
            })
            touchStreamEventAt()
          }, STREAM_HEARTBEAT_INTERVAL_MS)
        }

        const stopHeartbeat = () => {
          if (!heartbeatTimer) {
            return
          }
          clearInterval(heartbeatTimer)
          heartbeatTimer = null
        }

        const ensureSnapshotSeed = async () => {
          if (snapshotSeedLoaded) {
            return
          }
          const previous = await getQuotaHistory(event, auth.userId, chatId)
          snapshotBaseValue = previous?.value || ''
          snapshotMeta = previous?.meta || ''
          const requestTopic = String(body?.topic || '').trim()
          if (!requestTopic && previous?.topic) {
            snapshotTopic = previous.topic
          }
          snapshotSeedLoaded = true
        }

        const persistSnapshotNow = async (options: {
          force: boolean
          status: SnapshotPersistStatus
          allowEmptyReply?: boolean
          errorDetail?: ExecutorErrorDetailPayload
        }) => {
          await ensureSnapshotSeed()

          const now = Date.now()
          if (!options.force) {
            if (!completedText || completedText === lastPersistedReply) {
              return
            }
            if (now - lastPersistAt < SNAPSHOT_PERSIST_INTERVAL_MS) {
              return
            }
          }

          if (!completedText && !snapshotBaseValue && !options.allowEmptyReply) {
            return
          }

          const snapshot = buildQuotaConversationSnapshot({
            chatId,
            messages: body?.messages,
            assistantReply: completedText,
            topicHint: String(body?.topic || '').trim() || snapshotTopic,
            previousValue: snapshotBaseValue,
          })
          const nextMeta = buildSnapshotMetaPayload(
            snapshotMeta,
            options.status,
            trace,
            options.errorDetail,
          )

          await upsertQuotaHistory(event, {
            chatId,
            userId: auth.userId,
            topic: snapshot.topic,
            value: snapshot.value,
            meta: nextMeta,
          })

          await upsertPilotQuotaSession(event, {
            chatId,
            userId: auth.userId,
            runtimeSessionId,
            channelId: selectedChannel.channelId,
            topic: snapshot.topic,
          })

          snapshotBaseValue = snapshot.value
          snapshotTopic = snapshot.topic
          snapshotMeta = nextMeta
          lastPersistedReply = completedText
          lastPersistAt = now
        }

        const queuePersistSnapshot = (options: {
          force: boolean
          status: SnapshotPersistStatus
          allowEmptyReply?: boolean
          errorDetail?: ExecutorErrorDetailPayload
        }) => {
          persistPromise = persistPromise
            .then(() => persistSnapshotNow(options))
            .catch((error) => {
              logExecutorEvent('warn', 'snapshot', {
                phase: 'snapshot.persist.failed',
                request_id: trace.requestId,
                elapsed_ms: Math.max(0, Date.now() - trace.startedAt),
                force: options.force,
                status: options.status,
                error: buildErrorMeta(error),
              })
            })
          return persistPromise
        }

        try {
          emit({
            event: 'session_bound',
            request_id: trace.requestId,
            chat_id: chatId,
            runtime_session_id: runtimeSessionId,
            channel_id: selectedChannel.channelId,
            adapter: selectedChannel.adapter,
            transport: selectedChannel.transport,
            timeout_ms: selectedChannel.channel.timeoutMs,
            model_id: trace.modelId,
            provider_model: trace.providerModel,
            route_combo_id: trace.routeComboId,
            intent_type: trace.intentType,
            intent_strategy: trace.intentStrategy,
            intent_reason: trace.intentReason,
            intent_confidence: trace.intentConfidence,
            internet: trace.internet,
            thinking: trace.thinking,
            memory_enabled: trace.memoryEnabled,
            memory_history_message_count: memoryHistoryMessageCount,
            memory_decision_should_store: intentDecision.memoryDecision.shouldStore === true,
            memory_decision_reason: intentDecision.memoryDecision.reason,
            memory_policy_enabled_by_default: memoryPolicy.enabledByDefault,
            memory_user_preference: memoryUserPreference,
            selection_source: trace.selectionSource,
            selection_reason: trace.selectionReason,
            builtin_tools: trace.builtinTools,
            orchestrator_mode: trace.orchestratorMode,
            orchestrator_reason: trace.orchestratorReason,
            orchestrator_assistant_id: trace.orchestratorAssistantId,
            orchestrator_graph_profile: trace.orchestratorGraphProfile,
          })

          emit({
            event: 'status_updated',
            status: 'start',
            id: 'assistant',
          })
          touchStreamEventAt()
          startHeartbeat()

          emit({
            event: 'run.audit',
            payload: {
              auditType: 'memory.context',
              memoryEnabled: trace.memoryEnabled,
              memoryHistoryMessageCount,
              memoryDecision: intentDecision.memoryDecision,
              memoryPolicyEnabledByDefault: memoryPolicy.enabledByDefault,
              memoryPolicyAllowUserDisable: memoryPolicy.allowUserDisable,
              memoryUserPreference,
            },
          })
          touchStreamEventAt()

          emit({
            event: 'run.audit',
            payload: {
              auditType: 'websearch.decision',
              enabled: websearchDecision.enabled,
              reason: websearchDecision.reason,
              intentWebsearchRequired: intentDecision.websearchRequired === true,
              intentWebsearchReason: intentDecision.websearchReason,
              internetEnabled: trace.internet,
              builtinTools: trace.builtinTools,
            },
          })
          touchStreamEventAt()

          if (trace.intentType === 'image_generate') {
            try {
              const imageExecution = await executePilotMediaWithFallback({
                event,
                capability: 'image.generate',
                initialSelection: selectedChannel,
                context: {
                  requestChannelId: body?.channel_id,
                  sessionChannelId: trace.channelId,
                  requestedModelId: body?.modelId || body?.model,
                  routeComboId: body?.routeComboId,
                  internet: false,
                  thinking: false,
                  intentType: trace.intentType,
                },
                execute: async (routeSelection) => {
                  return await executePilotImageGenerateTool({
                    event,
                    userId: auth.userId,
                    sessionId: chatId,
                    requestId: trace.requestId,
                    prompt: routedMessage,
                    channel: {
                      baseUrl: routeSelection.channel.baseUrl,
                      apiKey: routeSelection.channel.apiKey,
                      model: routeSelection.providerModel || routeSelection.channel.model,
                      adapter: routeSelection.adapter,
                      transport: routeSelection.transport,
                      timeoutMs: routeSelection.channel.timeoutMs,
                    },
                    emitAudit: async (audit) => {
                      emitToolAudit({
                        ...audit,
                      })
                    },
                  })
                },
              })
              const imageToolResult = imageExecution.result

              const markdown = buildImageMarkdown((imageToolResult?.images || []).map(item => item.url))
              if (!markdown) {
                const emptyError = new Error('Image generation returned empty markdown')
                ;(emptyError as Error & { code?: string }).code = 'IMAGE_TOOL_EMPTY_RESULT'
                throw emptyError
              }

              completedText = markdown
              emit({
                event: 'status_updated',
                status: 'progress',
                id: 'assistant',
              })
              emit({
                event: 'completion',
                id: 'assistant',
                name: 'assistant',
                content: markdown,
                completed: false,
              })
              emit({
                event: 'completion',
                id: 'assistant',
                name: 'assistant',
                content: '',
                completed: true,
              })
              completedSent = true
              await queuePersistSnapshot({
                force: true,
                status: 'completed',
              })
              await emitMemoryUpdatedEvent(markdown)
              metricSuccess = true
              metricFinishReason = 'completed'
              metricErrorCode = ''
              emit({
                event: 'status_updated',
                status: 'end',
                id: 'assistant',
              })
              return
            }
            catch (error) {
              const context: ExecutorErrorContext = {
                requestId: trace.requestId,
                startedAt: trace.startedAt,
                timeoutMs: selectedChannel.channel.timeoutMs,
                channelId: selectedChannel.channelId,
                adapter: selectedChannel.adapter,
                transport: selectedChannel.transport,
                endpoint: trace.endpoint,
                model: trace.model,
              }
              const detail = buildExecutorErrorDetail(error, context)
              const message = mapExecutorErrorMessage(error, context, detail)
              streamFailed = true
              streamErrorDetail = detail
              metricSuccess = false
              metricFinishReason = 'runtime_error'
              metricErrorCode = String(detail.code || 'IMAGE_TOOL_FAILED')
              await queuePersistSnapshot({
                force: true,
                status: 'failed',
                allowEmptyReply: true,
                errorDetail: detail,
              })
              emit({
                event: 'error',
                status: 'failed',
                code: detail.code || 'IMAGE_TOOL_FAILED',
                message,
                detail,
              })
              return
            }
          }

          if (hasRawAttachments) {
            const attachmentResolveStartedAt = Date.now()
            const attachmentCount = latestUserTurn.attachments.length
            emit({
              event: 'status_updated',
              status: 'verbose',
              id: 'assistant',
              name: 'attachment.resolve.start',
              data: `count:${attachmentCount}`,
            })
            touchStreamEventAt()
            logExecutorEvent('info', 'attachment', {
              phase: 'attachment.resolve.start',
              request_id: trace.requestId,
              chat_id: trace.chatId,
              attachment_count: attachmentCount,
            })

            try {
              resolvedLegacyAttachments = await resolveCompatAttachments(event, latestUserTurn.attachments)
              const durationMs = Date.now() - attachmentResolveStartedAt
              const summary = resolvedLegacyAttachments.summary
              logExecutorEvent('info', 'attachment', {
                phase: 'attachment.resolve.end',
                request_id: trace.requestId,
                chat_id: trace.chatId,
                duration_ms: durationMs,
                status: 'ok',
                summary,
              })
              logExecutorEvent('info', 'attachment', {
                phase: 'attachment.delivery.summary',
                request_id: trace.requestId,
                chat_id: trace.chatId,
                summary,
              })
              emit({
                event: 'status_updated',
                status: 'verbose',
                id: 'assistant',
                name: 'attachment.delivery.summary',
                data: JSON.stringify(summary),
              })
              touchStreamEventAt()
            }
            catch (error) {
              if (error instanceof PilotAttachmentDeliveryError) {
                const context: ExecutorErrorContext = {
                  requestId: trace.requestId,
                  startedAt: trace.startedAt,
                  timeoutMs: selectedChannel.channel.timeoutMs,
                  channelId: selectedChannel.channelId,
                  adapter: selectedChannel.adapter,
                  transport: selectedChannel.transport,
                  endpoint: trace.endpoint,
                  model: trace.model,
                }
                const detail = buildExecutorErrorDetail(error, context)
                const durationMs = Date.now() - attachmentResolveStartedAt
                const message = mapExecutorErrorMessage(error, context, detail)
                streamFailed = true
                streamErrorDetail = detail
                metricFinishReason = 'attachment_error'
                metricErrorCode = String(detail.code || error.code || 'ATTACHMENT_DELIVERY_FAILED')
                await queuePersistSnapshot({
                  force: true,
                  status: 'failed',
                  allowEmptyReply: true,
                  errorDetail: detail,
                })
                logExecutorEvent('warn', 'attachment', {
                  phase: 'attachment.resolve.end',
                  request_id: trace.requestId,
                  chat_id: trace.chatId,
                  duration_ms: durationMs,
                  status: 'failed',
                  code: error.code,
                  failure_count: error.failures.length,
                  summary: error.summary,
                })
                logExecutorEvent('warn', 'attachment', {
                  phase: 'attachment.delivery.summary',
                  request_id: trace.requestId,
                  chat_id: trace.chatId,
                  status: 'failed',
                  code: error.code,
                  failure_count: error.failures.length,
                  summary: error.summary,
                })
                emit({
                  event: 'status_updated',
                  status: 'verbose',
                  id: 'assistant',
                  name: 'attachment.resolve.end',
                  data: `failed:${error.code}`,
                })
                touchStreamEventAt()
                emit({
                  event: 'error',
                  status: 'failed',
                  code: error.code,
                  message,
                  detail: {
                    ...detail,
                    code: error.code,
                    failures: error.failures,
                    summary: error.summary,
                  },
                })
                return
              }
              throw error
            }
          }

          if (websearchDecision.enabled) {
            try {
              const websearchResult = await executePilotWebsearchTool({
                event,
                userId: auth.userId,
                sessionId: chatId,
                requestId: trace.requestId,
                query: routedMessage,
                channel: {
                  baseUrl: selectedChannel.channel.baseUrl,
                  apiKey: selectedChannel.channel.apiKey,
                  model: selectedModel,
                  adapter: selectedChannel.adapter,
                  transport: selectedChannel.transport,
                  timeoutMs: selectedChannel.channel.timeoutMs,
                },
                emitAudit: async (audit) => {
                  emitToolAudit({
                    ...audit,
                  })
                },
              })

              if (websearchResult) {
                websearchConnectorSource = websearchResult.connectorSource
                websearchConnectorReason = websearchResult.connectorReason
                websearchContextText = websearchResult.contextText
                websearchSources = websearchResult.sources
                  .map(item => ({
                    id: item.id,
                    url: item.url,
                    title: item.title,
                    snippet: item.snippet,
                    domain: item.domain,
                    sourceType: item.sourceType,
                  }))
                emit({
                  event: 'run.audit',
                  payload: {
                    auditType: 'websearch.executed',
                    enabled: true,
                    source: websearchConnectorSource,
                    sourceReason: websearchConnectorReason,
                    sourceCount: websearchSources.length,
                    providerChain: websearchResult.providerChain,
                    providerUsed: websearchResult.providerUsed,
                    fallbackUsed: websearchResult.fallbackUsed,
                    dedupeCount: websearchResult.dedupeCount,
                  },
                })
                touchStreamEventAt()
              }
              else {
                websearchConnectorSource = 'none'
                websearchConnectorReason = 'tool_failed_or_empty_result'
                emit({
                  event: 'run.audit',
                  payload: {
                    auditType: 'websearch.skipped',
                    enabled: false,
                    reason: websearchConnectorReason,
                  },
                })
                touchStreamEventAt()
              }
            }
            catch (error) {
              if (error instanceof PilotToolApprovalRequiredError) {
                streamWaitingApproval = true
                metricFinishReason = 'approval_required'
                metricErrorCode = error.code
                const approvalMessage = '高风险数据抓取需要审批，请完成审批后重试。'
                const approvalPayload = {
                  code: error.code,
                  message: approvalMessage,
                  ticket_id: error.ticketId,
                  call_id: error.callId,
                  tool_id: 'tool.websearch',
                  tool_name: error.toolName,
                  risk_level: error.riskLevel,
                }
                emit({
                  event: 'turn.approval_required',
                  code: error.code,
                  message: approvalMessage,
                  detail: approvalPayload,
                  payload: approvalPayload,
                })
                emit({
                  event: 'done',
                  payload: {
                    status: 'waiting_approval',
                  },
                })
                return
              }

              if (error instanceof PilotToolApprovalRejectedError) {
                streamFailed = true
                metricFinishReason = 'approval_rejected'
                metricErrorCode = error.code
                const detail: ExecutorErrorDetailPayload = {
                  message: error.message,
                  code: error.code,
                  request_id: trace.requestId,
                  elapsed_ms: Math.max(0, Date.now() - trace.startedAt),
                  channel_id: trace.channelId,
                  adapter: trace.adapter,
                  transport: trace.transport,
                  endpoint: trace.endpoint,
                  model: trace.model,
                  phase: 'tool.approval_rejected',
                }
                streamErrorDetail = detail
                await queuePersistSnapshot({
                  force: true,
                  status: 'failed',
                  allowEmptyReply: true,
                  errorDetail: detail,
                })
                emit({
                  event: 'error',
                  status: 'failed',
                  code: error.code,
                  message: '高风险数据抓取审批被拒绝，请调整后再试。',
                  detail: {
                    ...detail,
                    ticket_id: error.ticketId,
                    call_id: error.callId,
                    tool_name: error.toolName,
                    risk_level: error.riskLevel,
                  },
                })
                return
              }

              websearchConnectorSource = 'none'
              websearchConnectorReason = `tool_exception:${truncateText(error instanceof Error ? error.message : String(error || ''), 160)}`
              emit({
                event: 'run.audit',
                payload: {
                  auditType: 'websearch.skipped',
                  enabled: false,
                  reason: websearchConnectorReason,
                },
              })
              touchStreamEventAt()
            }
          }

          const runWithChannel = async () => {
            logExecutorEvent('info', 'request', {
              phase: 'upstream.invoke.start',
              request_id: trace.requestId,
              elapsed_ms: Math.max(0, Date.now() - trace.startedAt),
              channel_id: trace.channelId,
              adapter: trace.adapter,
              transport: trace.transport,
              endpoint: trace.endpoint,
              timeout_ms: trace.timeoutMs,
              model: trace.model,
              model_id: trace.modelId,
              provider_model: trace.providerModel,
              route_combo_id: trace.routeComboId,
              intent_type: trace.intentType,
              intent_strategy: trace.intentStrategy,
              selection_reason: trace.selectionReason,
            })
            const { runtime, store } = createPilotRuntime({
              event,
              userId: auth.userId,
              strictPilotMode: pilotMode,
              allowDeepAgentFallback: !pilotMode,
              channel: {
                channelId: selectedChannel.channelId,
                baseUrl: selectedChannel.channel.baseUrl,
                apiKey: selectedChannel.channel.apiKey,
                model: selectedModel,
                adapter: selectedChannel.adapter,
                transport: selectedChannel.transport,
                timeoutMs: selectedChannel.channel.timeoutMs,
                builtinTools: selectedChannel.builtinTools,
              },
              orchestrator: {
                mode: orchestratorDecision.mode,
                reason: orchestratorDecision.reason,
                endpoint: orchestratorDecision.endpoint,
                apiKey: orchestratorDecision.apiKey,
                assistantId: orchestratorDecision.assistantId,
                graphProfile: orchestratorDecision.graphProfile,
              },
              onAudit: (record) => {
                logExecutorAuditRecord(record, trace, debugEnabled)
              },
            })
            runtimeStore = store
            await store.runtime.ensureSchema()
            const runtimeMessage = mergeWebsearchContextIntoMessage(routedMessage, websearchContextText)

            for await (const envelope of runtime.onMessage({
              sessionId: runtimeSessionId,
              message: runtimeMessage,
              attachments: resolvedLegacyAttachments.attachments.length > 0
                ? resolvedLegacyAttachments.attachments
                : undefined,
              metadata: {
                source: 'quota-executor',
                model: selectedModel,
                modelId: trace.modelId,
                providerModel: trace.providerModel,
                routeComboId: trace.routeComboId,
                queueWaitMs: trace.queueWaitMs,
                ttftMs: ttftMs || undefined,
                intentType: trace.intentType,
                intentStrategy: trace.intentStrategy,
                intentReason: trace.intentReason,
                intentConfidence: trace.intentConfidence,
                internet: trace.internet,
                thinking: trace.thinking,
                memoryEnabled: trace.memoryEnabled,
                memoryHistoryMessageCount,
                selectionReason: trace.selectionReason,
                orchestratorMode: trace.orchestratorMode,
                orchestratorReason: trace.orchestratorReason,
                orchestratorAssistantId: trace.orchestratorAssistantId,
                orchestratorGraphProfile: trace.orchestratorGraphProfile,
                temperature: Number(body?.temperature ?? 0.5),
                channelId: selectedChannel.channelId,
                channelAdapter: selectedChannel.adapter,
                channelTransport: selectedChannel.transport,
                attachmentCount: resolvedLegacyAttachments.attachments.length,
                attachmentSummary: resolvedLegacyAttachments.summary,
                builtinTools: selectedChannel.builtinTools,
                toolSources: websearchSources,
                websearchSourceCount: websearchSources.length,
                websearchDecision: websearchDecision.reason,
                websearchConnectorSource,
                websearchConnectorReason,
              },
            })) {
              if (closed) {
                return
              }

              if (envelope.type === 'assistant.delta') {
                touchStreamEventAt()
                const rawDelta = getEnvelopeText(envelope)
                if (!rawDelta) {
                  continue
                }
                if (!firstDeltaAt) {
                  firstDeltaAt = Date.now()
                  ttftMs = Math.max(0, firstDeltaAt - trace.startedAt)
                }
                streamedDelta = true

                const chunks = splitTextIntoChunks(rawDelta, STREAM_DELTA_EMIT_CHUNK_SIZE)
                for (const chunk of chunks) {
                  completedText += chunk
                  void queuePersistSnapshot({
                    force: false,
                    status: 'streaming',
                  })

                  emit({
                    event: 'status_updated',
                    status: 'progress',
                    id: 'assistant',
                  })
                  emit({
                    event: 'completion',
                    id: 'assistant',
                    name: 'assistant',
                    content: chunk,
                    completed: false,
                  })
                }
                continue
              }

              if (envelope.type === 'assistant.final') {
                touchStreamEventAt()
                const finalText = getEnvelopeText(envelope) || completedText
                if (!firstDeltaAt && finalText) {
                  firstDeltaAt = Date.now()
                  ttftMs = Math.max(0, firstDeltaAt - trace.startedAt)
                }

                // Some upstream providers may only emit `assistant.final` without deltas.
                // Convert final text into small pseudo-deltas so Quota UI keeps streaming behavior.
                if (!streamedDelta && finalText) {
                  completedText = ''
                  for (const chunk of splitTextIntoChunks(finalText)) {
                    completedText += chunk
                    void queuePersistSnapshot({
                      force: false,
                      status: 'streaming',
                    })
                    emit({
                      event: 'status_updated',
                      status: 'progress',
                      id: 'assistant',
                    })
                    emit({
                      event: 'completion',
                      id: 'assistant',
                      name: 'assistant',
                      content: chunk,
                      completed: false,
                    })
                  }
                }
                else {
                  completedText = finalText
                }

                emit({
                  event: 'completion',
                  id: 'assistant',
                  name: 'assistant',
                  content: '',
                  completed: true,
                })
                completedSent = true
                await queuePersistSnapshot({
                  force: true,
                  status: 'completed',
                })
                continue
              }

              if (envelope.type === 'capability.call' || envelope.type === 'capability.result') {
                touchStreamEventAt()
                const capability = extractCapabilityInfo(envelope)
                const payload = envelope.payload && typeof envelope.payload === 'object'
                  ? envelope.payload as Record<string, unknown>
                  : {}
                const callId = String(payload.callId || payload.call_id || payload.id || `${trace.requestId}_${capability.name}`)
                emit({
                  event: 'run.audit',
                  payload: {
                    auditType: envelope.type === 'capability.call' ? 'tool.call.started' : 'tool.call.completed',
                    callId,
                    toolId: String(payload.capabilityId || payload.toolId || capability.name || ''),
                    toolName: capability.name,
                    riskLevel: 'low',
                    status: envelope.type === 'capability.call' ? 'started' : 'completed',
                    inputPreview: envelope.type === 'capability.call' ? truncateText(capability.data, 600) : '',
                    outputPreview: envelope.type === 'capability.result' ? truncateText(capability.data, 600) : '',
                    durationMs: Number.isFinite(Number(payload.durationMs)) ? Number(payload.durationMs) : 0,
                    ticketId: '',
                    sources: [],
                    errorCode: '',
                    errorMessage: '',
                  },
                })
                emit({
                  event: 'status_updated',
                  status: envelope.type === 'capability.call' ? 'calling' : 'result',
                  id: 'assistant',
                  name: capability.name,
                  data: capability.data,
                })
                continue
              }

              if (envelope.type === 'error') {
                touchStreamEventAt()
                const payload = envelope.payload && typeof envelope.payload === 'object'
                  ? (envelope.payload as Record<string, unknown>)
                  : {}
                const context: ExecutorErrorContext = {
                  requestId: trace.requestId,
                  startedAt: trace.startedAt,
                  timeoutMs: selectedChannel.channel.timeoutMs,
                  channelId: selectedChannel.channelId,
                  adapter: selectedChannel.adapter,
                  transport: selectedChannel.transport,
                  endpoint: trace.endpoint,
                  model: trace.model,
                }
                const sourceError = payload.detail || payload
                const detail = buildExecutorErrorDetail(sourceError, context)
                const message = mapExecutorErrorMessage(
                  payload.message || payload.code || detail.message || 'run error',
                  context,
                  detail,
                )
                streamFailed = true
                streamErrorDetail = detail
                metricFinishReason = 'runtime_error'
                metricErrorCode = String(detail.code || 'RUNTIME_ENVELOPE_ERROR')
                await queuePersistSnapshot({
                  force: true,
                  status: 'failed',
                  allowEmptyReply: true,
                  errorDetail: detail,
                })
                logExecutorError('runtime-envelope', message, detail, trace, sourceError)
                emit({
                  event: 'error',
                  status: 'failed',
                  message,
                  detail,
                })
                break
              }
            }
          }

          await runWithExecutorTimeout(
            runWithChannel,
            selectedChannel.channel.timeoutMs,
          )

          if (streamWaitingApproval) {
            metricSuccess = false
            logExecutorEvent('info', 'request', {
              phase: 'request.waiting_approval',
              request_id: trace.requestId,
              elapsed_ms: Math.max(0, Date.now() - trace.startedAt),
              chat_id: trace.chatId,
              runtime_session_id: trace.runtimeSessionId,
              channel_id: trace.channelId,
              adapter: trace.adapter,
              transport: trace.transport,
              intent_type: trace.intentType,
              intent_strategy: trace.intentStrategy,
              attachment_count: resolvedLegacyAttachments.attachments.length,
              websearch_source_count: websearchSources.length,
            })
            return
          }

          if (!streamFailed) {
            await emitMemoryUpdatedEvent(completedText)
          }

          if (streamFailed) {
            metricSuccess = false
            if (!metricFinishReason) {
              metricFinishReason = 'runtime_error'
            }
            logExecutorEvent('warn', 'request', {
              phase: 'request.completed_with_runtime_error',
              request_id: trace.requestId,
              elapsed_ms: Math.max(0, Date.now() - trace.startedAt),
              chat_id: trace.chatId,
              runtime_session_id: trace.runtimeSessionId,
              channel_id: trace.channelId,
              adapter: trace.adapter,
              transport: trace.transport,
              intent_type: trace.intentType,
              intent_strategy: trace.intentStrategy,
              output_chars: completedText.length,
              attachment_count: resolvedLegacyAttachments.attachments.length,
              attachment_summary: resolvedLegacyAttachments.summary,
              websearch_source_count: websearchSources.length,
              error: streamErrorDetail,
            })
            return
          }

          if (!completedSent && completedText) {
            emit({
              event: 'completion',
              id: 'assistant',
              name: 'assistant',
              content: '',
              completed: true,
            })
          }
          await queuePersistSnapshot({
            force: true,
            status: 'completed',
          })
          metricSuccess = true
          metricFinishReason = 'completed'
          metricErrorCode = ''

          emit({
            event: 'status_updated',
            status: 'end',
            id: 'assistant',
          })

          logExecutorEvent('info', 'request', {
            phase: 'request.success',
            request_id: trace.requestId,
            elapsed_ms: Math.max(0, Date.now() - trace.startedAt),
            chat_id: trace.chatId,
            runtime_session_id: trace.runtimeSessionId,
            channel_id: trace.channelId,
            adapter: trace.adapter,
            transport: trace.transport,
            model_id: trace.modelId,
            provider_model: trace.providerModel,
            route_combo_id: trace.routeComboId,
            queue_wait_ms: trace.queueWaitMs,
            intent_type: trace.intentType,
            intent_strategy: trace.intentStrategy,
            intent_reason: trace.intentReason,
            intent_confidence: trace.intentConfidence,
            ttft_ms: ttftMs,
            internet: trace.internet,
            thinking: trace.thinking,
            orchestrator_mode: trace.orchestratorMode,
            orchestrator_reason: trace.orchestratorReason,
            output_chars: completedText.length,
            streamed_delta: streamedDelta,
            completion_emitted: completedSent || completedText.length > 0,
            attachment_count: resolvedLegacyAttachments.attachments.length,
            attachment_summary: resolvedLegacyAttachments.summary,
            websearch_source_count: websearchSources.length,
            websearch_connector_source: websearchConnectorSource,
            websearch_connector_reason: websearchConnectorReason,
            memory_history_message_count: memoryHistoryMessageCount,
          })
        }
        catch (error) {
          const context: ExecutorErrorContext = {
            requestId: trace.requestId,
            startedAt: trace.startedAt,
            timeoutMs: selectedChannel.channel.timeoutMs,
            channelId: selectedChannel.channelId,
            adapter: selectedChannel.adapter,
            transport: selectedChannel.transport,
            endpoint: trace.endpoint,
            model: trace.model,
          }
          const detail = buildExecutorErrorDetail(error, context)
          const message = mapExecutorErrorMessage(error, context, detail)
          metricSuccess = false
          metricFinishReason = 'executor_error'
          metricErrorCode = String(detail.code || 'EXECUTOR_ERROR')
          await queuePersistSnapshot({
            force: true,
            status: 'failed',
            allowEmptyReply: true,
            errorDetail: detail,
          })
          logExecutorError('executor-catch', message, detail, trace, error)
          emit({
            event: 'error',
            status: 'failed',
            message,
            detail,
          })
        }
        finally {
          stopHeartbeat()
          const totalDurationMs = Math.max(0, Date.now() - trace.startedAt)
          const resolvedTtftMs = ttftMs > 0
            ? ttftMs
            : (metricSuccess && completedText ? totalDurationMs : 0)

          try {
            if (metricSuccess) {
              markRouteSuccess(selectedChannel.routeKey)
            }
            else {
              markRouteFailure(selectedChannel.routeKey, healthPolicy)
            }
          }
          catch (error) {
            logExecutorEvent('warn', 'routing-health', {
              phase: 'routing.health.update.failed',
              request_id: trace.requestId,
              route_key: selectedChannel.routeKey,
              success: metricSuccess,
              error: buildErrorMeta(error),
            })
          }

          try {
            await recordPilotRoutingMetric(event, {
              requestId: trace.requestId,
              sessionId: chatId,
              userId: auth.userId,
              modelId: trace.modelId,
              routeComboId: trace.routeComboId,
              channelId: trace.channelId,
              providerModel: trace.providerModel || trace.model,
              queueWaitMs: trace.queueWaitMs,
              ttftMs: resolvedTtftMs,
              totalDurationMs,
              outputChars: completedText.length,
              success: metricSuccess,
              errorCode: metricSuccess ? '' : metricErrorCode,
              finishReason: metricFinishReason || (metricSuccess ? 'completed' : 'failed'),
              metadata: {
                selectionSource: trace.selectionSource,
                selectionReason: trace.selectionReason,
                adapter: trace.adapter,
                transport: trace.transport,
                endpoint: trace.endpoint,
                intentType: trace.intentType,
                intentStrategy: trace.intentStrategy,
                intentReason: trace.intentReason,
                intentConfidence: trace.intentConfidence,
                thinking: trace.thinking,
                internet: trace.internet,
                memoryEnabled: trace.memoryEnabled,
                memoryHistoryMessageCount,
                builtinTools: trace.builtinTools,
                websearchSourceCount: websearchSources.length,
                websearchDecision: websearchDecision.reason,
                websearchConnectorSource,
                websearchConnectorReason,
                orchestratorMode: trace.orchestratorMode,
                orchestratorReason: trace.orchestratorReason,
                orchestratorAssistantId: trace.orchestratorAssistantId,
                orchestratorGraphProfile: trace.orchestratorGraphProfile,
              },
            })
          }
          catch (error) {
            logExecutorEvent('warn', 'routing-metrics', {
              phase: 'routing.metric.record.failed',
              request_id: trace.requestId,
              error: buildErrorMeta(error),
            })
          }

          logExecutorEvent('info', 'request', {
            phase: 'request.finally',
            request_id: trace.requestId,
            elapsed_ms: totalDurationMs,
            closed,
            success: metricSuccess,
            output_chars: completedText.length,
            ttft_ms: resolvedTtftMs,
            route_combo_id: trace.routeComboId,
            provider_model: trace.providerModel,
            selection_reason: trace.selectionReason,
            intent_type: trace.intentType,
            intent_strategy: trace.intentStrategy,
            orchestrator_mode: trace.orchestratorMode,
            orchestrator_reason: trace.orchestratorReason,
            error_code: metricSuccess ? null : metricErrorCode,
            finish_reason: metricFinishReason,
          })
          emit('[DONE]')
          close()
        }
      }

      const runPromise = run()
      const waitUntil = getWaitUntilHandler(event)
      if (waitUntil) {
        waitUntil(runPromise)
      }
      void runPromise
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
})
