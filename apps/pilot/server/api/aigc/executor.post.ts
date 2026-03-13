import type { AgentEnvelope, DeepAgentAuditRecord } from '@talex-touch/tuff-intelligence'
import type { H3Event } from 'h3'
import process from 'node:process'
import { toDeepAgentErrorDetail } from '@talex-touch/tuff-intelligence'
import { requirePilotAuth } from '../../utils/auth'
import {
  resolvePilotChannelSelection,
} from '../../utils/pilot-channel'
import {
  ensurePilotQuotaSessionSchema,
  getPilotQuotaSessionByChatId,
  upsertPilotQuotaSession,
} from '../../utils/pilot-quota-session'
import { createPilotRuntime } from '../../utils/pilot-runtime'
import { quotaError } from '../../utils/quota-api'
import { buildQuotaConversationSnapshot } from '../../utils/quota-conversation-snapshot'
import { extractLatestQuotaUserMessage } from '../../utils/quota-history-codec'
import {
  ensureQuotaHistorySchema,
  getQuotaHistory,
  upsertQuotaHistory,
} from '../../utils/quota-history-store'

interface QuotaExecutorBody {
  chat_id?: string
  channel_id?: string
  topic?: string
  model?: string
  temperature?: number
  messages?: unknown[]
}

const LEGACY_QUOTA_MODEL_ALIASES = new Set([
  'this-normal',
  'this-normal-turbo',
  'this-normal-ultra',
  'this-normal-ultimate',
])

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
  selectionSource: string
}

type SnapshotPersistStatus = 'streaming' | 'completed' | 'failed'

const STREAM_HEARTBEAT_INTERVAL_MS = 15_000
const STREAM_HEARTBEAT_IDLE_MS = 12_000
const SNAPSHOT_PERSIST_INTERVAL_MS = 0
const STREAM_DELTA_EMIT_CHUNK_SIZE = 32

function resolveExecutorModel(rawModel: unknown, fallbackModel: string): string {
  const candidate = String(rawModel || '').trim()
  if (!candidate) {
    return fallbackModel
  }
  if (LEGACY_QUOTA_MODEL_ALIASES.has(candidate.toLowerCase())) {
    return fallbackModel
  }
  return candidate
}

function splitTextIntoChunks(text: string, chunkSize = 24): string[] {
  const chars = Array.from(text)
  if (chars.length <= chunkSize) {
    return [text]
  }

  const chunks: string[] = []
  for (let index = 0; index < chars.length; index += chunkSize) {
    chunks.push(chars.slice(index, index + chunkSize).join(''))
  }
  return chunks
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString().slice(-6)}`
}

function createExecutorTimeoutError(timeoutMs: number): Error {
  const safeTimeout = Math.max(3_000, Math.floor(timeoutMs))
  const error = new Error(`[executor-timeout] stream stalled for ${safeTimeout}ms`)
  Object.assign(error, {
    code: 'EXECUTOR_STREAM_TIMEOUT',
    statusCode: 504,
    statusMessage: 'Gateway Timeout',
    phase: 'upstream.stream.wait',
  })
  return error
}

async function runWithExecutorTimeout<T>(task: () => Promise<T>, timeoutMs: number): Promise<T> {
  const safeTimeout = Math.max(3_000, Math.floor(timeoutMs))
  return await new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      reject(createExecutorTimeoutError(safeTimeout))
    }, safeTimeout)

    task()
      .then((result) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        resolve(result)
      })
      .catch((error) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        reject(error)
      })
  })
}

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
    selection_source: trace.selectionSource,
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

  const message = extractLatestQuotaUserMessage(body?.messages)
  if (!message) {
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

  let selectedChannel: Awaited<ReturnType<typeof resolvePilotChannelSelection>>
  try {
    selectedChannel = await resolvePilotChannelSelection(event, {
      requestChannelId: String(body?.channel_id || '').trim(),
      sessionChannelId: existingSession?.channelId,
    })
  }
  catch (error: any) {
    const message = String(error?.statusMessage || error?.message || '所有供应商已熔断，无可用渠道')
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'status_updated', status: 'start', id: 'assistant' })}\n\n`))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'error', status: 'failed', message })}\n\n`))
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
    body?.model,
    selectedChannel.channel.model,
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
    selectionSource: selectedChannel.selectionSource,
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
    message_chars: message.length,
    message_preview: truncateText(message, 120),
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
        let lastStreamEventAt = Date.now()
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null
        let snapshotSeedLoaded = false
        let snapshotBaseValue = ''
        let snapshotMeta = ''
        let snapshotTopic = String(body?.topic || existingSession?.topic || '').trim() || '新的聊天'
        let lastPersistAt = 0
        let lastPersistedReply = ''
        let persistPromise: Promise<void> = Promise.resolve()

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
          })

          emit({
            event: 'status_updated',
            status: 'start',
            id: 'assistant',
          })
          touchStreamEventAt()
          startHeartbeat()

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
                builtinTools: selectedChannel.channel.builtinTools,
              },
              onAudit: (record) => {
                logExecutorAuditRecord(record, trace, debugEnabled)
              },
            })
            await store.runtime.ensureSchema()

            for await (const envelope of runtime.onMessage({
              sessionId: runtimeSessionId,
              message,
              metadata: {
                source: 'quota-executor',
                model: selectedModel,
                temperature: Number(body?.temperature ?? 0.5),
                channelId: selectedChannel.channelId,
                channelAdapter: selectedChannel.adapter,
                channelTransport: selectedChannel.transport,
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
            output_chars: completedText.length,
            streamed_delta: streamedDelta,
            completion_emitted: completedSent || completedText.length > 0,
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
          logExecutorEvent('info', 'request', {
            phase: 'request.finally',
            request_id: trace.requestId,
            elapsed_ms: Math.max(0, Date.now() - trace.startedAt),
            closed,
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
