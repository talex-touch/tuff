import type { AgentEnvelope, DeepAgentAuditRecord, UserMessageAttachment } from '@talex-touch/tuff-intelligence'
import type { H3Event } from 'h3'
import process from 'node:process'
import { toDeepAgentErrorDetail } from '@talex-touch/tuff-intelligence'
import { requirePilotAuth } from '../../utils/auth'
import { getPilotAdminRoutingConfig } from '../../utils/pilot-admin-routing-config'
import {
  PilotAttachmentDeliveryError,
} from '../../utils/pilot-attachment-delivery'
import {
  createTitleSseResponse,
  randomId,
  resolveCompatAttachments,
  resolveExecutorModel,
  runWithExecutorTimeout,
  splitTextIntoChunks,
  toTitleMessages,
} from '../../utils/pilot-executor-utils'
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
import { createPilotRuntime } from '../../utils/pilot-runtime'
import { generateTitle } from '../../utils/pilot-title'
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
  thinking: boolean
  internet: boolean
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
    internet: trace.internet,
    thinking: trace.thinking,
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
    internet: trace.internet,
    thinking: trace.thinking,
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

  let selectedChannel: Awaited<ReturnType<typeof resolvePilotRoutingSelection>>
  try {
    const requestedModelId = String(body?.modelId || body?.model || '').trim()
    selectedChannel = await resolvePilotRoutingSelection(event, {
      requestChannelId: String(body?.channel_id || '').trim(),
      sessionChannelId: existingSession?.channelId,
      requestedModelId,
      routeComboId: String(body?.routeComboId || '').trim(),
      internet: body?.internet,
      thinking: body?.thinking,
    })
  }
  catch (error: any) {
    const detail = error?.data && typeof error.data === 'object'
      ? (error.data as Record<string, unknown>)
      : {}
    const message = String(error?.message || error?.statusMessage || '当前无可用渠道，请检查渠道配置。')
    const code = String(detail.code || 'PILOT_CHANNEL_UNAVAILABLE')
    const reason = String(detail.reason || '').trim()

    console.warn('[pilot][executor] channel selection failed', {
      user_id: auth.userId,
      chat_id: chatId,
      requested_chat_id: requestedChatId || null,
      request_channel_id: String(body?.channel_id || '').trim() || null,
      session_channel_id: existingSession?.channelId || null,
      code,
      reason: reason || null,
      status_code: Number(error?.statusCode || 503),
      message,
      detail,
    })

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'status_updated', status: 'start', id: 'assistant' })}\n\n`))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          event: 'error',
          status: 'failed',
          code,
          reason,
          message,
        })}\n\n`))
        controller.enqueue(encoder.encode('data: [DONE]\\n\\n'))
        controller.close()
      },
    })

    return new Response(stream, {
      status: 503,
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

  const selectedModel = resolveExecutorModel(
    body?.modelId || body?.model,
    selectedChannel.providerModel || selectedChannel.channel.model,
  )
  const routingConfig = await getPilotAdminRoutingConfig(event).catch(() => ({
    modelCatalog: [],
    routeCombos: [],
    routingPolicy: {
      defaultModelId: 'quota-auto',
      defaultRouteComboId: 'default-auto',
      quotaAutoStrategy: 'speed-first' as const,
      explorationRate: 0.08,
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
  const queueWaitMs = Number.isFinite(Number(body?.queueWaitMs))
    ? Math.max(0, Math.floor(Number(body?.queueWaitMs)))
    : 0
  const orchestratorDecision = await resolveLangGraphOrchestratorDecision(
    event,
    selectedChannel.routeComboId || 'default-auto',
  )
  const requestMeta = resolveRequestMeta(event)
  const requestId = randomId('req')
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
    thinking: selectedChannel.thinking,
    internet: selectedChannel.internet,
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
    internet: trace.internet,
    thinking: trace.thinking,
    builtin_tools: trace.builtinTools,
    selection_reason: trace.selectionReason,
    orchestrator_mode: trace.orchestratorMode,
    orchestrator_reason: trace.orchestratorReason,
    orchestrator_assistant_id: trace.orchestratorAssistantId,
    orchestrator_graph_profile: trace.orchestratorGraphProfile,
    message_chars: message.length,
    message_preview: truncateText(message, 120),
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

        const touchStreamEventAt = () => {
          lastStreamEventAt = Date.now()
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
            internet: trace.internet,
            thinking: trace.thinking,
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
              selection_reason: trace.selectionReason,
            })
            const { runtime, store } = createPilotRuntime({
              event,
              userId: auth.userId,
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
                endpoint: orchestratorDecision.endpoint,
                apiKey: orchestratorDecision.apiKey,
                assistantId: orchestratorDecision.assistantId,
                graphProfile: orchestratorDecision.graphProfile,
              },
              onAudit: (record) => {
                logExecutorAuditRecord(record, trace, debugEnabled)
              },
            })
            await store.runtime.ensureSchema()

            for await (const envelope of runtime.onMessage({
              sessionId: runtimeSessionId,
              message,
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
                internet: trace.internet,
                thinking: trace.thinking,
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
              output_chars: completedText.length,
              attachment_count: resolvedLegacyAttachments.attachments.length,
              attachment_summary: resolvedLegacyAttachments.summary,
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
                thinking: trace.thinking,
                internet: trace.internet,
                builtinTools: trace.builtinTools,
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
