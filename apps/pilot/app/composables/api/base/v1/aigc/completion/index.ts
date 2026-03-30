import type { IInnerItemType } from './entity'
import type { IChatBody, IChatConversation, IChatInnerItem, IChatItem, ICompletionHandler, IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'
import { endHttp } from '~/composables/api/axios'
import { IChatItemStatus, IChatRole, PersistStatus, QuotaModel } from '~/composables/api/base/v1/aigc/completion-types'
import { resolveLegacyUiStreamInput } from './legacy-stream-input'

function parseJsonSafe<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  }
  catch {
    return null
  }
}

const SENSITIVE_ERROR_ENDPOINT_RE = /\b(?:(?:\d{1,3}\.){3}\d{1,3}|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}|localhost):\d{2,5}\b/g
const SENSITIVE_ERROR_PATH_RE = /\/(?:Users|home|var|opt|private)\/[^\s)\],]+/g

function sanitizeClientErrorText(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) {
    return ''
  }
  return raw
    .replace(/connect\s+ETIMEDOUT\s+[^\s)]+/gi, 'connect ETIMEDOUT [REDACTED_ENDPOINT]')
    .replace(/connect\s+ECONNREFUSED\s+[^\s)]+/gi, 'connect ECONNREFUSED [REDACTED_ENDPOINT]')
    .replace(/connect\s+EHOSTUNREACH\s+[^\s)]+/gi, 'connect EHOSTUNREACH [REDACTED_ENDPOINT]')
    .replace(/connect\s+ENETUNREACH\s+[^\s)]+/gi, 'connect ENETUNREACH [REDACTED_ENDPOINT]')
    .replace(SENSITIVE_ERROR_ENDPOINT_RE, '[REDACTED_ENDPOINT]')
    .replace(SENSITIVE_ERROR_PATH_RE, '[REDACTED_PATH]')
    .trim()
}

function normalizeExecutorErrorMessage(error: unknown): string {
  const rawText = typeof error === 'string'
    ? error
    : error instanceof Error
      ? (error.message || '')
      : String((error as any)?.message || '')
  const normalizedRaw = rawText.trim()
  if (normalizedRaw.includes('ATTACHMENT_UNREACHABLE')) {
    return '附件不可达：请配置可公网访问的附件 Base URL（https）后重试。'
  }
  if (normalizedRaw.includes('ATTACHMENT_TOO_LARGE_FOR_INLINE')) {
    return '附件过大且无法走 URL/ID 投递，请缩小文件或先配置公网附件地址。'
  }
  if (normalizedRaw.includes('ATTACHMENT_LOAD_FAILED')) {
    return '附件读取失败，请重新上传后重试。'
  }

  if (typeof error === 'string')
    return sanitizeClientErrorText(error) || '请求失败，请稍后重试'

  if (error instanceof Error)
    return sanitizeClientErrorText(error.message) || '请求失败，请稍后重试'

  if (error && typeof error === 'object') {
    const payload = error as Record<string, any>
    const directMessage = payload.message
      || payload.error
      || payload.detail
      || payload.statusText

    if (typeof directMessage === 'string' && directMessage.trim())
      return sanitizeClientErrorText(directMessage.trim()) || '请求失败，请稍后重试'

    const response = payload.response && typeof payload.response === 'object'
      ? payload.response as Record<string, any>
      : null
    const responseData = payload.data ?? response?.data

    if (typeof responseData === 'string' && responseData.trim())
      return sanitizeClientErrorText(responseData.trim()) || '请求失败，请稍后重试'

    if (responseData && typeof responseData === 'object') {
      const data = responseData as Record<string, any>
      const dataMessage = data.message || data.error
      if (typeof dataMessage === 'string' && dataMessage.trim()) {
        const code = typeof data.code === 'number' ? data.code : response?.status
        const normalizedMessage = sanitizeClientErrorText(dataMessage.trim()) || '请求失败，请稍后重试'
        return code ? `${code} ${normalizedMessage}` : normalizedMessage
      }
    }

    const statusCode = payload.status ?? response?.status
    if (typeof statusCode === 'number')
      return `${statusCode} 请求失败，请稍后重试`
  }

  return '请求失败，请稍后重试'
}

function includesToolApprovalRequired(value: unknown): boolean {
  const text = String(value || '').trim().toUpperCase()
  if (!text) {
    return false
  }
  return text === 'TOOL_APPROVAL_REQUIRED' || text.includes('TOOL_APPROVAL_REQUIRED')
}

function isToolApprovalRequiredPayload(payload: Record<string, any>): boolean {
  const detail = payload?.detail && typeof payload.detail === 'object' && !Array.isArray(payload.detail)
    ? payload.detail as Record<string, any>
    : null
  return (
    includesToolApprovalRequired(payload?.code)
    || includesToolApprovalRequired(payload?.reason)
    || includesToolApprovalRequired(payload?.errorCode)
    || includesToolApprovalRequired(detail?.code)
    || includesToolApprovalRequired(detail?.reason)
    || includesToolApprovalRequired(payload?.message)
    || includesToolApprovalRequired(payload?.error)
    || includesToolApprovalRequired(payload?.detail)
  )
}

function normalizeTimeoutMs(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(Math.floor(parsed), min), max)
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) {
    return fallback
  }
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false
  }
  return fallback
}

const MARKDOWN_STREAM_FLUSH_MS = 16
const MARKDOWN_STREAM_FORCE_FLUSH_MS = 64
const TOOL_APPROVAL_DECISION_EVENT = 'pilot-tool-approval-decision'

interface ToolAuditCardPayload {
  sessionId: string
  callId: string
  toolId: string
  toolName: string
  riskLevel: string
  status: string
  inputPreview: string
  outputPreview: string
  durationMs: number
  ticketId: string
  sources: Array<Record<string, unknown>>
  errorCode: string
  errorMessage: string
  auditType: string
  seq?: number
}

interface RunEventCardPayload {
  sessionId: string
  cardType: 'intent' | 'routing' | 'memory' | 'websearch' | 'thinking'
  eventType: string
  status: 'running' | 'completed' | 'skipped' | 'failed'
  title: string
  summary: string
  turnId: string
  seq: number
  content: string
  detail: Record<string, unknown>
}

function normalizeToolAuditCardPayload(value: unknown): ToolAuditCardPayload {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const sources = Array.isArray(row.sources)
    ? row.sources
        .filter(item => item && typeof item === 'object' && !Array.isArray(item))
        .map(item => item as Record<string, unknown>)
    : []
  return {
    sessionId: String(row.sessionId || row.session_id || '').trim(),
    callId: String(row.callId || row.call_id || '').trim(),
    toolId: String(row.toolId || row.tool_id || '').trim(),
    toolName: String(row.toolName || row.tool_name || '').trim() || 'tool',
    riskLevel: String(row.riskLevel || row.risk_level || '').trim() || 'low',
    status: String(row.status || '').trim(),
    inputPreview: String(row.inputPreview || row.input_preview || '').trim(),
    outputPreview: String(row.outputPreview || row.output_preview || '').trim(),
    durationMs: Number.isFinite(Number(row.durationMs))
      ? Math.max(0, Number(row.durationMs))
      : 0,
    ticketId: String(row.ticketId || row.ticket_id || '').trim(),
    sources,
    errorCode: String(row.errorCode || row.error_code || '').trim(),
    errorMessage: String(row.errorMessage || row.error_message || '').trim(),
    auditType: String(row.auditType || row.audit_type || '').trim(),
    seq: Number.isFinite(Number(row.seq))
      ? Math.max(0, Math.floor(Number(row.seq)))
      : 0,
  }
}

function mapToolAuditTypeToChatStatus(auditType: string): IChatItemStatus | null {
  if (!auditType.startsWith('tool.call.')) {
    return null
  }
  if (auditType === 'tool.call.started' || auditType === 'tool.call.approval_required' || auditType === 'tool.call.approved') {
    return IChatItemStatus.TOOL_CALLING
  }
  if (auditType === 'tool.call.rejected' || auditType === 'tool.call.failed') {
    return IChatItemStatus.TOOL_ERROR
  }
  if (auditType === 'tool.call.completed') {
    return IChatItemStatus.TOOL_RESULT
  }
  return null
}

const TOOL_CARD_TERMINAL_STATUS = new Set(['completed', 'failed', 'rejected', 'cancelled'])

function normalizeToolStatus(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function normalizeToolCardSeq(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }
  return Math.max(1, Math.floor(parsed))
}

function parseToolCardIdentity(block: IInnerItemMeta): {
  callId: string
  ticketId: string
  toolName: string
  status: string
  seq: number
} {
  const data = parseJsonSafe<Record<string, unknown>>(String(block.data || '')) || {}
  const extra = block.extra && typeof block.extra === 'object' && !Array.isArray(block.extra)
    ? block.extra as Record<string, unknown>
    : {}
  return {
    callId: String(data.callId || data.call_id || extra.callId || extra.call_id || '').trim(),
    ticketId: String(data.ticketId || data.ticket_id || extra.ticketId || extra.ticket_id || '').trim(),
    toolName: String(data.toolName || data.tool_name || '').trim().toLowerCase(),
    status: normalizeToolStatus(data.status || extra.status),
    seq: normalizeToolCardSeq(data.seq || extra.seq),
  }
}

function buildErrorBlockExtra(payload: Record<string, any>): Record<string, unknown> | undefined {
  const detail = payload?.detail && typeof payload.detail === 'object' && !Array.isArray(payload.detail)
    ? payload.detail as Record<string, unknown>
    : null
  const detailRecord = detail as Record<string, any> | null
  const code = String(payload?.code || detailRecord?.code || '').trim()
  const reason = String(payload?.reason || detailRecord?.reason || '').trim()
  const requestId = String(
    payload?.request_id
    || payload?.requestId
    || detailRecord?.request_id
    || detailRecord?.requestId
    || '',
  ).trim()
  const statusCodeRaw = payload?.status_code
    ?? payload?.statusCode
    ?? detailRecord?.status_code
    ?? detailRecord?.statusCode
  const statusCode = Number(statusCodeRaw)
  const extra: Record<string, unknown> = {}

  if (code) {
    extra.code = code
  }
  if (reason) {
    extra.reason = reason
  }
  if (requestId) {
    extra.requestId = requestId
  }
  if (Number.isFinite(statusCode)) {
    extra.statusCode = statusCode
  }
  if (detail && Object.keys(detail).length > 0) {
    extra.detail = detail
  }

  return Object.keys(extra).length > 0 ? extra : undefined
}

function normalizeRunEventText(value: unknown): string {
  return String(value || '').trim()
}

function toConversationInitialTitle(value: unknown): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) {
    return ''
  }
  return text.slice(0, 24)
}

function extractLatestUserText(messages: IChatItem[]): string {
  const latestUser = [...messages]
    .reverse()
    .find(item => String(item?.role || '').trim().toLowerCase() === IChatRole.USER)
  if (!latestUser || !Array.isArray(latestUser.content) || latestUser.content.length <= 0) {
    return ''
  }

  const pageIndex = Number.isFinite(Number(latestUser.page))
    ? Math.max(0, Math.floor(Number(latestUser.page)))
    : 0
  const inner = latestUser.content[pageIndex] || latestUser.content[0]
  if (!inner || !Array.isArray(inner.value)) {
    return ''
  }

  const text = inner.value
    .filter(block => block && typeof block === 'object')
    .map((block) => {
      const row = block as IInnerItemMeta
      if (row.type !== 'text' && row.type !== 'markdown') {
        return ''
      }
      return String(row.value || '')
    })
    .join(' ')

  return text.replace(/\s+/g, ' ').trim()
}

async function ensureRemoteSessionInitialized(sessionId: string, initialTitle: string): Promise<void> {
  const payload: Record<string, unknown> = {
    sessionId,
  }
  if (initialTitle) {
    payload.title = initialTitle
  }
  await endHttp.$http({
    url: 'chat/sessions',
    method: 'POST',
    data: payload,
  })
}

function toFiniteSeq(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

async function handleExecutorItem(item: string, callback: (data: any) => void) {
  if (item === '[DONE]') {
    callback({
      done: true,
    })
  }
  else {
    try {
      const json = JSON.parse(item)

      callback({
        done: false,
        ...json,
      })
    }
    catch (e: any) {
      console.error('Failed to parse executor SSE data frame', item, e)
      console.log('item', item)

      callback({
        done: true,
        error: true,
      })
    }
  }
}

function parseSseFrame(frame: string): { event: string, data: string } | null {
  const lines = frame.split('\n')
  let event = 'message'
  const dataLines: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line || line.startsWith(':'))
      continue

    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || 'message'
      continue
    }

    if (line.startsWith('data:')) {
      const data = line.slice(5)
      dataLines.push(data.startsWith(' ') ? data.slice(1) : data)
    }
  }

  if (!dataLines.length)
    return null

  return {
    event,
    data: dataLines.join('\n'),
  }
}

async function handleExecutorResult(
  reader: ReadableStreamDefaultReader<string>,
  callback: (data: any) => void,
  hooks?: {
    onChunk?: () => void
  },
) {
  let buffer = ''

  const flushBuffer = async () => {
    let frameEndIndex = buffer.indexOf('\n\n')

    while (frameEndIndex !== -1) {
      const frame = buffer.slice(0, frameEndIndex)
      buffer = buffer.slice(frameEndIndex + 2)

      const parsed = parseSseFrame(frame)
      if (!parsed) {
        frameEndIndex = buffer.indexOf('\n\n')
        continue
      }

      if (parsed.event === 'error') {
        const payload = parseJsonSafe<Record<string, any>>(parsed.data)
        if (payload) {
          callback({
            ...payload,
            done: false,
            event: typeof payload.event === 'string' ? payload.event : 'error',
            status: typeof payload.status === 'string' ? payload.status : 'failed',
            id: payload.id || 'assistant',
            name: payload.name,
            data: payload.data,
            message: normalizeExecutorErrorMessage(payload.message || payload.error || payload.data || parsed.data),
          })
          frameEndIndex = buffer.indexOf('\n\n')
          continue
        }

        callback({
          done: false,
          error: true,
          e: normalizeExecutorErrorMessage(parsed.data),
        })
        frameEndIndex = buffer.indexOf('\n\n')
        continue
      }

      await handleExecutorItem(parsed.data, callback)
      frameEndIndex = buffer.indexOf('\n\n')
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    hooks?.onChunk?.()

    if (done) {
      if (buffer.trim().length) {
        const parsed = parseSseFrame(buffer)
        if (parsed)
          await handleExecutorItem(parsed.data, callback)
      }

      callback({
        done: true,
      })

      break
    }

    if (!value.length)
      continue

    buffer += value.replace(/\r\n/g, '\n')
    await flushBuffer()
  }
}

async function uploadLegacyDataUrlAttachment(
  sessionId: string,
  payload: {
    type: 'image' | 'file'
    name: string
    mimeType: string
    dataUrl: string
  },
): Promise<NonNullable<IChatBody['attachments']>[number]> {
  const response = await endHttp.$http({
    url: `chat/sessions/${encodeURIComponent(sessionId)}/uploads`,
    method: 'POST',
    data: {
      name: payload.name,
      mimeType: payload.mimeType,
      contentBase64: payload.dataUrl,
    },
  }) as Record<string, unknown>

  const attachment = response.attachment && typeof response.attachment === 'object'
    ? response.attachment as Record<string, unknown>
    : null
  const attachmentId = String(attachment?.id || '').trim()
  if (!attachmentId) {
    throw new Error('历史附件转换失败：未返回有效 attachmentId。')
  }

  const typeRaw = String(attachment?.type || attachment?.kind || '').trim().toLowerCase()
  const type: 'image' | 'file' = typeRaw === 'image' ? 'image' : payload.type
  const previewUrl = String(attachment?.previewUrl || attachment?.modelUrl || attachment?.ref || '').trim()
  const mimeType = String(attachment?.mimeType || payload.mimeType || '').trim() || payload.mimeType
  const name = String(attachment?.name || payload.name || '').trim() || payload.name

  return {
    id: attachmentId,
    type,
    ref: previewUrl || `attachment://${attachmentId}`,
    name,
    mimeType,
    previewUrl: previewUrl || undefined,
  }
}

async function useCompletionExecutor(body: IChatBody, callback: (data: any) => void) {
  const { promise, resolve } = withResolvers()

  function _callback() {
    let doComplete = false

    return (data: any) => {
      if (doComplete)
        return

      if (data?.done)
        doComplete = true

      callback(data)
    }
  }

  const wrappedCallback = _callback()

  async function _func() {
    const runtimePublic = useRuntimeConfig().public as Record<string, unknown>
    const idleTimeoutMs = normalizeTimeoutMs(
      runtimePublic.pilotStreamIdleTimeoutMs,
      45_000,
      5_000,
      10 * 60_000,
    )
    const maxDurationMs = normalizeTimeoutMs(
      runtimePublic.pilotStreamMaxDurationMs,
      8 * 60_000,
      10_000,
      30 * 60_000,
    )
    const streamController = new AbortController()
    const upstreamSignal = body.signal

    if (upstreamSignal) {
      if (upstreamSignal.aborted) {
        streamController.abort(upstreamSignal.reason || '用户主动取消')
      }
      else {
        upstreamSignal.addEventListener('abort', () => {
          streamController.abort(upstreamSignal.reason || '用户主动取消')
        }, { once: true })
      }
    }

    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let maxTimer: ReturnType<typeof setTimeout> | null = null
    const resetIdleTimer = () => {
      if (idleTimer)
        clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        streamController.abort(`上游长时间无响应（>${idleTimeoutMs}ms）`)
      }, idleTimeoutMs)
    }
    const clearTimers = () => {
      if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimer = null
      }
      if (maxTimer) {
        clearTimeout(maxTimer)
        maxTimer = null
      }
    }

    resetIdleTimer()
    maxTimer = setTimeout(() => {
      streamController.abort(`响应耗时过长（>${maxDurationMs}ms）`)
    }, maxDurationMs)

    try {
      const sessionId = String(body?.chat_id || '').trim()
      if (!sessionId) {
        throw new Error('chat_id is required')
      }

      const requestedFromSeq = Number(body?.fromSeq)
      const fromSeq = Number.isFinite(requestedFromSeq) && requestedFromSeq > 0
        ? Math.max(1, Math.floor(requestedFromSeq))
        : 0
      const followOnly = fromSeq > 0 && body?.follow === true
      const fallbackInitialTitle = toConversationInitialTitle(body.initialTitle || extractLatestUserText(body.messages || []))
      await ensureRemoteSessionInitialized(sessionId, fallbackInitialTitle)

      let requestPayload: Record<string, unknown>
      if (followOnly) {
        requestPayload = {
          fromSeq,
          follow: true,
          modelId: String(body.modelId || body.model || '').trim() || undefined,
          routeComboId: String(body.routeComboId || '').trim() || undefined,
          internet: body.internet !== false,
          thinking: body.thinking !== false,
          memoryEnabled: body.memoryEnabled !== false,
          pilotMode: body.pilotMode === true,
          metadata: {
            source: 'legacy-ui-completion-follow',
            index: body.index,
          },
        }
      }
      else {
        const latestTurn = await resolveLegacyUiStreamInput(sessionId, body.messages || [], {
          uploadDataUrlAttachment: uploadLegacyDataUrlAttachment,
        })
        if (!latestTurn.message && latestTurn.attachments.length <= 0) {
          throw new Error('latest user turn is empty')
        }

        requestPayload = {
          message: latestTurn.message,
          attachments: latestTurn.attachments.length > 0 ? latestTurn.attachments : undefined,
          modelId: String(body.modelId || body.model || '').trim() || undefined,
          routeComboId: String(body.routeComboId || '').trim() || undefined,
          internet: body.internet !== false,
          thinking: body.thinking !== false,
          memoryEnabled: body.memoryEnabled !== false,
          pilotMode: body.pilotMode === true,
          metadata: {
            source: 'legacy-ui-completion',
            index: body.index,
          },
        }
      }

      const res: ReadableStream = await endHttp.$http({
        url: `chat/sessions/${encodeURIComponent(sessionId)}/stream`,
        method: 'POST',
        data: requestPayload,
        headers: {
          Accept: 'text/event-stream',
        },
        adapter: 'fetch',
        responseType: 'stream',
        signal: streamController.signal,
      })

      const reader = res.pipeThrough(new TextDecoderStream()).getReader()

      await handleExecutorResult(reader, wrappedCallback, {
        onChunk: resetIdleTimer,
      })
    }
    catch (e) {
      console.error(e)

      let message = normalizeExecutorErrorMessage(e)
      if (streamController.signal.aborted) {
        const reason = String(streamController.signal.reason || '')
        if (reason)
          message = reason
      }

      wrappedCallback({
        done: false,
        event: 'error',
        status: 'failed',
        id: 'assistant',
        message,
      })
      wrappedCallback({
        done: true,
      })
    }
    finally {
      clearTimers()
    }

    resolve!(void 0)
  }

  _func()

  return promise
}

export const $completion = {
  randomUUID(type: 'Chat' | 'Item') {
    // 获取最后的时间戳6位
    const last6 = Date.now().toString().slice(-6)

    return `${type}-${randomStr(6)}-${last6}-${randomStr(6)}`
  },

  emptyHistory() {
    return {
      id: this.randomUUID('Chat'),
      topic: '新的聊天',
      messages: [],
      lastUpdate: Date.now(),
      sync: PersistStatus.SUCCESS,
      pilotMode: false,
    } as IChatConversation
  },

  emptyChatItem(role: IChatRole = IChatRole.USER) {
    return {
      id: this.randomUUID('Item'),
      role,
      page: 0,
      content: [],
    } as IChatItem
  },
  initInnerMeta(type: IInnerItemType, value: string) {
    return {
      type,
      value,
    } as IInnerItemMeta
  },

  emptyChatInnerItem({
    model,
    value,
    meta,
    page,
    status,
    timestamp,
  }: IChatInnerItem = { model: QuotaModel.QUOTA_THIS_NORMAL, page: 0, value: [], meta: {}, timestamp: Date.now(), status: IChatItemStatus.AVAILABLE }) {
    return {
      model,
      value,
      status,
      meta,
      page,
      timestamp,
    } as IChatInnerItem
  },

  emptyHistoryWithInput(input: string) {
    const history = this.emptyHistory()

    return {
      ...history,
      messages: [
        {
          date: formatDate(Date.now()),
          role: 'user',
          content: input,
          status: IChatItemStatus.AVAILABLE,
        },
      ],
    }
  },

  createCompletion(conversation: IChatConversation, curItem: IChatItem, index: number) {
    const itemIndex = conversation.messages.findIndex(item => item.id === curItem.id)

    if (itemIndex === -1)
      throw new Error('item not found')

    // 因为传入的curItem一定是（规范）role:User 如果User是最后一个 那么就是新增
    // 还有一种情况 用户重新生成最后一个 所以还要判断messages是不是odd
    const isAdd = itemIndex === conversation.messages.length - 1 && conversation.messages.length % 2 === 1

    let handler: ICompletionHandler = {}
    const tempMessage = reactive(isAdd ? this.emptyChatItem(IChatRole.ASSISTANT) : conversation.messages[itemIndex])
    const innerMsg = reactive(isAdd ? this.emptyChatInnerItem() : curItem.content[index]!)

    if (isAdd) {
      // 获得某一条消息的指定 innerItem
      const curInnerItem = curItem.content[index]
      tempMessage.page = innerMsg.page = index
      innerMsg.meta = (curInnerItem || curItem.content[0])!.meta

      while (tempMessage.content.length < index - 1)
        tempMessage.content.push(null)

      tempMessage.content.push(innerMsg)

      conversation.messages.push(tempMessage)
    }

    watch(() => innerMsg.status, (status) => {
      handler.onTriggerStatus?.(status)
    })

    /**
     * 当全部解析结束之后，将所有没有返回的工具链设定为超时
     */
    function handleEndToolParser() {
      const runtimePublic = useRuntimeConfig().public as Record<string, unknown>
      if (!normalizeBoolean(runtimePublic.pilotEnableLegacyExecutorEventCompat, false)) {
        return
      }
      innerMsg.value.forEach((item) => {
        if (item.type !== 'tool')
          return

        if (!item.extra?.end) {
          item.extra = {
            ...item.extra,
            error: {
              type: 'timeout',
              timestamp: Date.now(),
            },
            end: Date.now(),
          }
        }
      })
    }

    let completionResolved = false
    const completeCallbacks = new Set<() => void>()
    function registerCompleteCallback(callback: () => void) {
      completeCallbacks.add(callback)
      return () => {
        completeCallbacks.delete(callback)
      }
    }
    function complete() {
      if (completionResolved) {
        return
      }
      completionResolved = true
      completeCallbacks.forEach(callback => callback())
      completeCallbacks.clear()
      handleEndToolParser()

      setTimeout(() => {
        handler.onReqCompleted?.()
      }, 200)
    }

    return {
      tempMessage,
      innerMsg,
      registerHandler(_handler: ICompletionHandler = {}) {
        handler = _handler
      },
      async getTitle() {
        const titleOptions = reactive({
          value: '',
          status: IChatItemStatus.AVAILABLE,
        })

        titleOptions.status = IChatItemStatus.GENERATING
        try {
          const payload = await endHttp.$http({
            url: `chat/sessions/${encodeURIComponent(conversation.id)}/title`,
            method: 'POST',
            data: {},
          }) as Record<string, unknown>

          const title = String(
            payload?.title
            || (payload?.data as Record<string, unknown> | undefined)?.title
            || '',
          ).trim()

          if (title) {
            titleOptions.value = title
            conversation.topic = title.slice(0, 12)
          }
          titleOptions.status = IChatItemStatus.AVAILABLE
        }
        catch (error) {
          console.error('[completion] title generation failed', error)
          titleOptions.status = IChatItemStatus.ERROR
        }

        return titleOptions
      },
      send: (options?: Partial<ChatCompletionDto> & {
        fromSeq?: number
        follow?: boolean
      }): AbortController => {
        innerMsg.status = IChatItemStatus.WAITING

        const signal = new AbortController()
        let streamBlockOrder = 0
        let pendingMarkdownBuffer = ''
        let pendingMarkdownSince = 0
        let markdownFlushTimer: ReturnType<typeof setTimeout> | null = null
        let lastCompletionName = 'assistant'
        let waitingToolApproval = false
        let activeExecutorStreams = 0
        const legacyIgnoredEvents = new Set([
          'turn.accepted',
          'turn.queued',
          'turn.started',
          'turn.delta',
          'turn.completed',
          'turn.failed',
          'status_updated',
          'completion',
          'verbose',
          'session_bound',
        ])
        const legacyWarnedEvents = new Set<string>()

        function clearMarkdownFlushTimer() {
          if (!markdownFlushTimer)
            return
          clearTimeout(markdownFlushTimer)
          markdownFlushTimer = null
        }

        function finalizeAsCancelled(forceComplete = false) {
          if (completionResolved) {
            return
          }
          waitingToolApproval = false
          flushPendingMarkdownBuffer({
            force: true,
          })
          if (innerMsg.status !== IChatItemStatus.CANCELLED) {
            innerMsg.status = IChatItemStatus.CANCELLED
            handler?.onTriggerStatus?.(innerMsg.status)
          }
          if (forceComplete || activeExecutorStreams <= 0) {
            complete()
          }
        }

        function nextStreamBlockOrder(): number {
          streamBlockOrder += 1
          return streamBlockOrder
        }

        function resolveStreamOrder(value: unknown): number {
          const parsed = Number(value)
          return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
        }

        function pushInnerBlock(block: IInnerItemMeta): IInnerItemMeta {
          const extra = block.extra && typeof block.extra === 'object' && !Array.isArray(block.extra)
            ? block.extra as Record<string, unknown>
            : {}
          const existingOrder = resolveStreamOrder(extra.streamOrder)
          block.extra = {
            ...extra,
            streamOrder: existingOrder || nextStreamBlockOrder(),
          }
          innerMsg.value.push(block)
          return block
        }

        function getOrCreateStreamingMarkdownBlock(seq = 0): IInnerItemMeta {
          const current = innerMsg.value.at(-1)
          if (current?.type === 'markdown' && !current.extra?.done) {
            const currentExtra = current.extra && typeof current.extra === 'object' && !Array.isArray(current.extra)
              ? current.extra as Record<string, unknown>
              : {}
            const currentSeq = toFiniteSeq(currentExtra.seq)
            const currentOrder = resolveStreamOrder(currentExtra.streamOrder)
            current.extra = {
              ...currentExtra,
              seq: currentSeq || seq || 0,
              start: Number(currentExtra.start || Date.now()) || Date.now(),
              streamOrder: currentOrder || nextStreamBlockOrder(),
            }
            return current
          }

          const now = Date.now()
          const created: IInnerItemMeta = {
            type: 'markdown' as IInnerItemType,
            value: '',
            extra: {
              seq: seq || 0,
              start: now,
              streamOrder: nextStreamBlockOrder(),
            },
          }
          return pushInnerBlock(created)
        }

        function appendPendingMarkdownChunk(chunk: string) {
          if (!chunk) {
            return
          }
          if (!pendingMarkdownBuffer) {
            pendingMarkdownSince = Date.now()
          }
          pendingMarkdownBuffer += chunk
        }

        function takeFlushableMarkdownChunk(force = false): string {
          if (!pendingMarkdownBuffer) {
            return ''
          }

          if (force) {
            const chunk = pendingMarkdownBuffer
            pendingMarkdownBuffer = ''
            pendingMarkdownSince = 0
            return chunk
          }

          const now = Date.now()
          const elapsed = pendingMarkdownSince > 0 ? now - pendingMarkdownSince : 0
          const shouldForceFlush = elapsed >= MARKDOWN_STREAM_FORCE_FLUSH_MS
          const lastLineBreakIndex = pendingMarkdownBuffer.lastIndexOf('\n')

          if (!shouldForceFlush && lastLineBreakIndex < 0) {
            return ''
          }

          if (!shouldForceFlush && lastLineBreakIndex >= 0) {
            const chunk = pendingMarkdownBuffer.slice(0, lastLineBreakIndex + 1)
            pendingMarkdownBuffer = pendingMarkdownBuffer.slice(lastLineBreakIndex + 1)
            if (!pendingMarkdownBuffer) {
              pendingMarkdownSince = 0
            }
            return chunk
          }

          const chunk = pendingMarkdownBuffer
          pendingMarkdownBuffer = ''
          pendingMarkdownSince = 0
          return chunk
        }

        function flushPendingMarkdownBuffer(options: { markDone?: boolean, force?: boolean } = {}): string {
          clearMarkdownFlushTimer()

          const markDone = Boolean(options.markDone)
          const force = markDone || Boolean(options.force)
          const chunk = takeFlushableMarkdownChunk(force)
          if (!chunk && !markDone) {
            if (pendingMarkdownBuffer) {
              scheduleMarkdownBufferFlush()
            }
            return ''
          }

          const markdownBlock = getOrCreateStreamingMarkdownBlock()
          if (chunk) {
            markdownBlock.value += chunk
            if (lastCompletionName)
              handler.onCompletion?.(lastCompletionName, chunk)
          }

          if (!markDone && pendingMarkdownBuffer) {
            scheduleMarkdownBufferFlush()
          }

          if (markDone) {
            markdownBlock.extra = {
              ...(markdownBlock.extra || {}),
              done: true,
            }
          }

          return chunk
        }

        function scheduleMarkdownBufferFlush() {
          if (markdownFlushTimer) {
            return
          }
          markdownFlushTimer = setTimeout(() => {
            markdownFlushTimer = null
            flushPendingMarkdownBuffer()
          }, MARKDOWN_STREAM_FLUSH_MS)
        }

        const toolCardMap = new Map<string, IInnerItemMeta>()

        function bindToolCardIdentity(payload: ToolAuditCardPayload, block: IInnerItemMeta) {
          const parsed = parseToolCardIdentity(block)
          const callId = String(payload.callId || parsed.callId || '').trim()
          const ticketId = String(payload.ticketId || parsed.ticketId || '').trim()
          if (callId) {
            toolCardMap.set(`call_${callId}`, block)
          }
          if (ticketId) {
            toolCardMap.set(`ticket_${ticketId}`, block)
          }
        }

        function resolveToolCardFromMap(payload: ToolAuditCardPayload): IInnerItemMeta | null {
          const callId = String(payload.callId || '').trim()
          if (callId) {
            const fromCall = toolCardMap.get(`call_${callId}`)
            if (fromCall) {
              return fromCall
            }
          }

          const ticketId = String(payload.ticketId || '').trim()
          if (ticketId) {
            const fromTicket = toolCardMap.get(`ticket_${ticketId}`)
            if (fromTicket) {
              return fromTicket
            }
          }

          return null
        }

        function resolveToolCardFromHistory(payload: ToolAuditCardPayload): IInnerItemMeta | null {
          const callId = String(payload.callId || '').trim()
          const ticketId = String(payload.ticketId || '').trim()
          const toolName = String(payload.toolName || '').trim().toLowerCase()
          const payloadStatus = normalizeToolStatus(payload.status)
          const canFallbackByTool = Boolean(toolName) && !TOOL_CARD_TERMINAL_STATUS.has(payloadStatus)
          let toolCandidate: IInnerItemMeta | null = null

          for (let index = innerMsg.value.length - 1; index >= 0; index -= 1) {
            const item = innerMsg.value[index]
            if (!item || item.type !== 'card' || item.name !== 'pilot_tool_card') {
              continue
            }
            const identity = parseToolCardIdentity(item)
            if (callId && identity.callId && identity.callId === callId) {
              return item
            }
            if (ticketId && identity.ticketId && identity.ticketId === ticketId) {
              return item
            }
            if (!canFallbackByTool || identity.toolName !== toolName) {
              continue
            }
            if (TOOL_CARD_TERMINAL_STATUS.has(identity.status)) {
              continue
            }
            if (ticketId && !identity.ticketId) {
              return item
            }
            if (!toolCandidate) {
              toolCandidate = item
            }
          }

          return toolCandidate
        }

        function resolveExistingToolCard(payload: ToolAuditCardPayload): IInnerItemMeta | null {
          return resolveToolCardFromMap(payload) || resolveToolCardFromHistory(payload)
        }

        function createToolCardStorageKey(payload: ToolAuditCardPayload): string {
          if (payload.callId) {
            return `call_${payload.callId}`
          }
          if (payload.ticketId) {
            return `ticket_${payload.ticketId}`
          }
          return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        }

        function upsertToolCard(payload: ToolAuditCardPayload): IInnerItemMeta {
          const prev = resolveExistingToolCard(payload)
          const now = Date.now()
          const prevData = parseJsonSafe<Record<string, unknown>>(String(prev?.data || '')) || {}
          const prevIdentity = prev
            ? parseToolCardIdentity(prev)
            : {
                callId: '',
                ticketId: '',
                toolName: '',
                status: '',
                seq: 0,
              }
          const payloadSeq = normalizeToolCardSeq(payload.seq)
          const prevSeq = normalizeToolCardSeq(prevData.seq || prevIdentity.seq || prev?.extra?.seq)
          const sessionId = String(payload.sessionId || prevData.sessionId || prevData.session_id || conversation.id).trim() || conversation.id
          const resolvedCallId = String(payload.callId || prevIdentity.callId || prevData.callId || prevData.call_id || '').trim()
          const resolvedTicketId = String(payload.ticketId || prevIdentity.ticketId || prevData.ticketId || prevData.ticket_id || '').trim()
          const resolvedStatus = String(payload.status || prevData.status || prevIdentity.status || '').trim()
          const resolvedToolId = String(payload.toolId || prevData.toolId || prevData.tool_id || '').trim() || 'tool.unknown'
          const resolvedToolName = String(payload.toolName || prevData.toolName || prevData.tool_name || prevIdentity.toolName || 'tool').trim() || 'tool'
          const resolvedRiskLevel = String(payload.riskLevel || prevData.riskLevel || prevData.risk_level || 'low').trim() || 'low'
          const resolvedInputPreview = String(payload.inputPreview || prevData.inputPreview || prevData.input_preview || '').trim()
          const resolvedOutputPreview = String(payload.outputPreview || prevData.outputPreview || prevData.output_preview || '').trim()
          const resolvedDuration = Number.isFinite(payload.durationMs)
            ? Math.max(0, payload.durationMs)
            : (Number.isFinite(Number(prevData.durationMs)) ? Math.max(0, Number(prevData.durationMs)) : 0)
          const resolvedErrorCode = String(payload.errorCode || prevData.errorCode || prevData.error_code || '').trim()
          const resolvedErrorMessage = String(payload.errorMessage || prevData.errorMessage || prevData.error_message || '').trim()
          const resolvedAuditType = String(payload.auditType || prevData.auditType || prevData.audit_type || '').trim()
          const normalizedStatus = normalizeToolStatus(resolvedStatus)
          const prevStatus = normalizeToolStatus(prevData.status || prevIdentity.status || prev?.extra?.status)
          const prevTerminal = TOOL_CARD_TERMINAL_STATUS.has(prevStatus)
          const nextTerminal = TOOL_CARD_TERMINAL_STATUS.has(normalizedStatus)

          if (prev) {
            if (payloadSeq > 0 && prevSeq > 0 && payloadSeq < prevSeq) {
              return prev
            }
            if (prevTerminal && !nextTerminal) {
              return prev
            }
          }

          const payloadSources = Array.isArray(payload.sources)
            ? payload.sources.filter(item => item && typeof item === 'object' && !Array.isArray(item))
            : []
          const prevSources = Array.isArray(prevData.sources)
            ? prevData.sources.filter(item => item && typeof item === 'object' && !Array.isArray(item))
            : []
          const resolvedSources = payloadSources.length > 0
            ? payloadSources
            : prevSources
          const nextExtra = {
            ...(prev?.extra || {}),
            start: prev?.extra?.start || now,
            end: normalizedStatus === 'completed'
              || normalizedStatus === 'failed'
              || normalizedStatus === 'rejected'
              || normalizedStatus === 'cancelled'
              ? now
              : prev?.extra?.end,
            status: resolvedStatus,
            callId: resolvedCallId,
            ticketId: resolvedTicketId,
            errorCode: resolvedErrorCode,
            sessionId,
            seq: payloadSeq || prevSeq || 0,
            streamOrder: resolveStreamOrder(prev?.extra?.streamOrder) || nextStreamBlockOrder(),
          }
          const nextData = JSON.stringify({
            sessionId,
            callId: resolvedCallId,
            toolId: resolvedToolId,
            toolName: resolvedToolName,
            riskLevel: resolvedRiskLevel,
            status: resolvedStatus,
            inputPreview: resolvedInputPreview,
            outputPreview: resolvedOutputPreview,
            durationMs: resolvedDuration,
            ticketId: resolvedTicketId,
            sources: resolvedSources,
            errorCode: resolvedErrorCode,
            errorMessage: resolvedErrorMessage,
            auditType: resolvedAuditType,
            seq: payloadSeq || prevSeq || 0,
          })

          if (prev) {
            prev.name = 'pilot_tool_card'
            prev.type = 'card'
            prev.value = ''
            prev.data = nextData
            prev.extra = nextExtra
            bindToolCardIdentity(payload, prev)
            return prev
          }

          const created: IInnerItemMeta = {
            type: 'card',
            name: 'pilot_tool_card',
            value: '',
            data: nextData,
            extra: nextExtra,
          }
          pushInnerBlock(created)
          toolCardMap.set(createToolCardStorageKey(payload), created)
          bindToolCardIdentity(payload, created)
          return created
        }

        function buildApprovalRequiredToolPayload(eventPayload: Record<string, any>): ToolAuditCardPayload {
          const detail = eventPayload?.detail && typeof eventPayload.detail === 'object' && !Array.isArray(eventPayload.detail)
            ? eventPayload.detail as Record<string, any>
            : {}
          const ticketId = String(detail.ticket_id || detail.ticketId || '').trim()
          const callId = String(detail.call_id || detail.callId || '').trim()
            || (ticketId ? `ticket_${ticketId}` : `approval_${Date.now()}`)
          const durationRaw = Number(detail.duration_ms ?? detail.durationMs)

          return {
            sessionId: conversation.id,
            callId,
            toolId: String(detail.tool_id || detail.toolId || '').trim() || 'tool.unknown',
            toolName: String(detail.tool_name || detail.toolName || 'tool').trim() || 'tool',
            riskLevel: String(detail.risk_level || detail.riskLevel || 'high').trim() || 'high',
            status: 'approval_required',
            inputPreview: String(detail.input_preview || detail.inputPreview || '').trim(),
            outputPreview: String(detail.output_preview || detail.outputPreview || '').trim(),
            durationMs: Number.isFinite(durationRaw) ? Math.max(0, durationRaw) : 0,
            ticketId,
            sources: [],
            errorCode: String(eventPayload.code || detail.code || 'TOOL_APPROVAL_REQUIRED').trim() || 'TOOL_APPROVAL_REQUIRED',
            errorMessage: String(eventPayload.message || eventPayload.error || detail.message || '工具调用需要审批，请审批后继续。').trim(),
            auditType: 'tool.call.approval_required',
          }
        }

        const pendingToolApprovalMap = new Map<string, ToolAuditCardPayload>()
        let approvalCheckpointEmitted = false

        function emitApprovalCheckpoint() {
          if (approvalCheckpointEmitted) {
            return
          }
          approvalCheckpointEmitted = true
          handler.onReqCheckpoint?.('approval_required')
        }

        function applyApprovalRequiredState(payload: ToolAuditCardPayload) {
          waitingToolApproval = true
          innerMsg.status = IChatItemStatus.TOOL_CALLING
          handler?.onTriggerStatus?.(innerMsg.status)
          emitApprovalCheckpoint()
          upsertToolCard(payload)
          if (payload.ticketId) {
            pendingToolApprovalMap.set(payload.ticketId, payload)
          }
          else if (payload.callId) {
            pendingToolApprovalMap.set(payload.callId, payload)
          }
        }

        function resolvePendingApprovalPayload(detail: Record<string, any>): ToolAuditCardPayload | null {
          const ticketId = String(detail.ticketId || detail.ticket_id || '').trim()
          if (ticketId && pendingToolApprovalMap.has(ticketId)) {
            return pendingToolApprovalMap.get(ticketId) || null
          }
          const callId = String(detail.callId || detail.call_id || '').trim()
          if (callId && pendingToolApprovalMap.has(callId)) {
            return pendingToolApprovalMap.get(callId) || null
          }
          return null
        }

        function handleManualApprovalDecision(detail: Record<string, any>) {
          const sessionId = String(detail.sessionId || detail.session_id || '').trim()
          if (sessionId && sessionId !== conversation.id) {
            return
          }
          const approved = detail.approved === true
          const pendingPayload = resolvePendingApprovalPayload(detail)
          if (pendingPayload?.ticketId) {
            pendingToolApprovalMap.delete(pendingPayload.ticketId)
          }
          if (pendingPayload?.callId) {
            pendingToolApprovalMap.delete(pendingPayload.callId)
          }

          if (approved) {
            const payload = pendingPayload || buildApprovalRequiredToolPayload({
              detail,
              code: 'TOOL_APPROVAL_REQUIRED',
            })
            upsertToolCard({
              ...payload,
              auditType: 'tool.call.approved',
              status: 'approved',
              errorCode: '',
              errorMessage: '',
            })
            waitingToolApproval = false
            innerMsg.status = IChatItemStatus.TOOL_CALLING
            handler?.onTriggerStatus?.(innerMsg.status)
            startExecutorStream()
            return
          }

          const rejectedMessage = String(detail.reason || detail.errorMessage || '工具审批被拒绝').trim() || '工具审批被拒绝'
          if (pendingPayload) {
            upsertToolCard({
              ...pendingPayload,
              auditType: 'tool.call.rejected',
              status: 'rejected',
              errorCode: 'TOOL_APPROVAL_REJECTED',
              errorMessage: rejectedMessage,
            })
          }
          waitingToolApproval = false
          innerMsg.status = IChatItemStatus.TOOL_ERROR
          handler?.onTriggerStatus?.(innerMsg.status)
          pushInnerBlock({
            type: 'error',
            value: rejectedMessage,
            extra: {
              seq: toFiniteSeq(detail.seq),
            },
          })
          complete()
        }

        const handleToolApprovalDecisionEvent = (event: Event) => {
          const customEvent = event as CustomEvent<Record<string, any>>
          const detail = customEvent.detail && typeof customEvent.detail === 'object' && !Array.isArray(customEvent.detail)
            ? customEvent.detail as Record<string, any>
            : null
          if (!detail) {
            return
          }
          handleManualApprovalDecision(detail)
        }

        if (typeof window !== 'undefined') {
          window.addEventListener(TOOL_APPROVAL_DECISION_EVENT, handleToolApprovalDecisionEvent as EventListener)
          registerCompleteCallback(() => {
            window.removeEventListener(TOOL_APPROVAL_DECISION_EVENT, handleToolApprovalDecisionEvent as EventListener)
          })
        }

        const handleAbort = () => {
          if (typeof window !== 'undefined') {
            window.removeEventListener(TOOL_APPROVAL_DECISION_EVENT, handleToolApprovalDecisionEvent as EventListener)
          }
          finalizeAsCancelled()
        }
        signal.signal.addEventListener('abort', handleAbort, { once: true })
        registerCompleteCallback(() => {
          signal.signal.removeEventListener('abort', handleAbort)
        })

        const runEventCardMap = new Map<string, IInnerItemMeta>()
        const RUN_EVENT_TERMINAL_STATUSES = new Set(['completed', 'skipped', 'failed'])

        function normalizeThinkingTraceText(value: unknown): string {
          const text = normalizeRunEventText(value)
          return text === '__end__' ? '' : text
        }

        function normalizeWebsearchDecisionReason(value: unknown): string {
          const reason = normalizeRunEventText(value)
          if (!reason) {
            return '未命中联网决策'
          }
          if (reason === 'intent_required') {
            return '意图判定需要联网'
          }
          if (reason === 'intent_not_required') {
            return '意图判定无需联网'
          }
          if (reason === 'heuristic_required') {
            return '命中联网启发式规则'
          }
          if (reason === 'heuristic_required_classifier_fallback') {
            return '意图分类失败，启用启发式联网兜底'
          }
          if (reason === 'tool_unavailable') {
            return '当前模型未开放 websearch 工具'
          }
          if (reason === 'internet_disabled') {
            return '当前请求已关闭联网'
          }
          return reason
        }

        function resolveRunEventCardKey(payload: RunEventCardPayload): string {
          const sessionScope = payload.sessionId || conversation.id
          if (payload.cardType === 'thinking') {
            return payload.turnId
              ? `thinking:${sessionScope}:${payload.turnId}`
              : `thinking:${sessionScope}`
          }
          if (payload.cardType === 'websearch') {
            const segment = payload.eventType === 'websearch.decision' ? 'decision' : 'execution'
            return payload.turnId
              ? `websearch:${segment}:${sessionScope}:${payload.turnId}`
              : `websearch:${segment}:${sessionScope}`
          }
          if (payload.cardType === 'intent') {
            return payload.turnId
              ? `intent:${sessionScope}:${payload.turnId}`
              : `intent:${sessionScope}:pending`
          }
          if (payload.cardType === 'routing') {
            return payload.turnId
              ? `routing:${sessionScope}:${payload.turnId}`
              : `routing:${sessionScope}`
          }
          if (payload.cardType === 'memory') {
            return payload.turnId
              ? `memory:${sessionScope}:${payload.turnId}`
              : `memory:${sessionScope}`
          }
          return payload.turnId
            ? `${payload.cardType}:${sessionScope}:${payload.turnId}:${payload.seq}`
            : `${payload.cardType}:${sessionScope}:${payload.seq}`
        }

        function upsertRunEventCard(payload: RunEventCardPayload): IInnerItemMeta {
          const key = resolveRunEventCardKey(payload)
          const sessionScope = payload.sessionId || conversation.id
          const pendingIntentKey = `intent:${sessionScope}:pending`
          let prev = runEventCardMap.get(key)
          if (!prev && payload.cardType === 'intent' && payload.turnId) {
            prev = runEventCardMap.get(pendingIntentKey)
          }
          const now = Date.now()

          const prevData = parseJsonSafe<Record<string, unknown>>(String(prev?.data || '')) || {}
          const payloadSeq = toFiniteSeq(payload.seq)
          const prevSeq = toFiniteSeq(prevData.seq || prev?.extra?.seq)
          const prevStatus = normalizeRunEventText(prevData.status || prev?.extra?.status).toLowerCase()
          const nextStatus = normalizeRunEventText(payload.status).toLowerCase()
          if (prev) {
            if (payloadSeq > 0 && prevSeq > 0 && payloadSeq < prevSeq) {
              return prev
            }
            if (
              RUN_EVENT_TERMINAL_STATUSES.has(prevStatus)
              && !RUN_EVENT_TERMINAL_STATUSES.has(nextStatus)
              && (payloadSeq <= 0 || prevSeq <= 0 || payloadSeq <= prevSeq)
            ) {
              return prev
            }
          }

          const prevContent = normalizeRunEventText(prevData.content)
          let mergedContent = payload.content || prevContent
          if (payload.cardType === 'thinking') {
            const incoming = payload.content
            if (!incoming) {
              mergedContent = prevContent
            }
            else if (payload.status === 'completed') {
              if (!prevContent) {
                mergedContent = incoming
              }
              else if (incoming.startsWith(prevContent)) {
                mergedContent = incoming
              }
              else if (prevContent.startsWith(incoming)) {
                mergedContent = prevContent
              }
              else {
                mergedContent = `${prevContent}${incoming}`
              }
            }
            else {
              mergedContent = `${prevContent}${incoming}`
            }
          }

          const nextData = JSON.stringify({
            sessionId: payload.sessionId || conversation.id,
            cardType: payload.cardType,
            eventType: payload.eventType,
            status: payload.status,
            title: payload.title,
            summary: payload.summary,
            turnId: payload.turnId,
            seq: payload.seq,
            content: mergedContent,
            detail: payload.detail,
          })

          const nextExtra = {
            ...(prev?.extra || {}),
            start: prev?.extra?.start || now,
            end: payload.status === 'completed' || payload.status === 'skipped' || payload.status === 'failed'
              ? now
              : prev?.extra?.end,
            status: payload.status,
            cardType: payload.cardType,
            eventType: payload.eventType,
            seq: payload.seq || prev?.extra?.seq || 0,
            sessionId: payload.sessionId || prev?.extra?.sessionId || conversation.id,
            turnId: payload.turnId || prev?.extra?.turnId || '',
            streamOrder: resolveStreamOrder(prev?.extra?.streamOrder) || nextStreamBlockOrder(),
          }

          if (prev) {
            prev.name = 'pilot_run_event_card'
            prev.type = 'card'
            prev.value = ''
            prev.data = nextData
            prev.extra = nextExtra
            if (payload.cardType === 'intent' && payload.turnId && key !== pendingIntentKey) {
              runEventCardMap.delete(pendingIntentKey)
              runEventCardMap.set(key, prev)
            }
            return prev
          }

          const created: IInnerItemMeta = {
            type: 'card',
            name: 'pilot_run_event_card',
            value: '',
            data: nextData,
            extra: nextExtra,
          }
          pushInnerBlock(created)
          runEventCardMap.set(key, created)
          return created
        }

        function finalizeRunningThinkingCards(eventType: string) {
          for (const card of runEventCardMap.values()) {
            const raw = parseJsonSafe<Record<string, unknown>>(String(card.data || '')) || {}
            if (normalizeRunEventText(raw.cardType) !== 'thinking') {
              continue
            }
            if (normalizeRunEventText(raw.status).toLowerCase() !== 'running') {
              continue
            }
            upsertRunEventCard({
              sessionId: normalizeRunEventText(raw.sessionId) || conversation.id,
              cardType: 'thinking',
              eventType,
              status: 'completed',
              title: normalizeRunEventText(raw.title) || 'Thinking',
              summary: '思考完成',
              turnId: normalizeRunEventText(raw.turnId),
              seq: Number.isFinite(Number(raw.seq)) ? Number(raw.seq) : 0,
              content: '',
              detail: raw.detail && typeof raw.detail === 'object' && !Array.isArray(raw.detail)
                ? raw.detail as Record<string, unknown>
                : {},
            })
          }
        }

        function buildExecutorBody(requestId = ''): IChatBody & { requestId?: string } {
          const resolvedPilotMode = typeof innerMsg.meta.pilotMode === 'boolean'
            ? innerMsg.meta.pilotMode
            : conversation.pilotMode === true
          const payload: IChatBody & { requestId?: string } = {
            ...options || {},
            temperature: innerMsg.meta.temperature || 0.5,
            templateId: conversation.template?.id ?? -1,
            messages: conversation.messages,
            index: index === -1 ? 0 : index,
            chat_id: conversation.id,
            model: innerMsg.model,
            modelId: String(innerMsg.model || ''),
            internet: innerMsg.meta.internet !== false,
            thinking: innerMsg.meta.thinking !== false,
            memoryEnabled: innerMsg.meta.memoryEnabled !== false,
            pilotMode: resolvedPilotMode,
            signal: signal.signal,
          }
          if (requestId) {
            payload.requestId = requestId
          }
          return payload
        }

        function startExecutorStream(requestId = '') {
          activeExecutorStreams += 1
          void useCompletionExecutor(
            buildExecutorBody(requestId),
            handleExecutorEvent,
          ).finally(() => {
            activeExecutorStreams = Math.max(0, activeExecutorStreams - 1)
            if (signal.signal.aborted) {
              finalizeAsCancelled(true)
            }
          })
        }

        function pushRunEventCardFromStream(eventType: string, payload: Record<string, any>) {
          const seq = toFiniteSeq(payload.seq)
          const sessionId = normalizeRunEventText(payload.session_id || payload.sessionId || conversation.id) || conversation.id
          const turnId = normalizeRunEventText(payload.turn_id || payload.turnId)
          const detail = payload?.payload && typeof payload.payload === 'object'
            ? payload.payload as Record<string, unknown>
            : (payload?.detail && typeof payload.detail === 'object'
                ? payload.detail as Record<string, unknown>
                : {})

          if (eventType === 'intent.started') {
            upsertRunEventCard({
              sessionId,
              cardType: 'intent',
              eventType,
              status: 'running',
              title: '意图分析',
              summary: '正在分析意图',
              turnId,
              seq,
              content: '',
              detail,
            })
            return
          }

          if (eventType === 'intent.completed') {
            const confidence = Number(detail.confidence)
            upsertRunEventCard({
              sessionId,
              cardType: 'intent',
              eventType,
              status: 'completed',
              title: '意图分析',
              summary: `意图=${normalizeRunEventText(detail.intentType) || 'chat'}，置信=${Number.isFinite(confidence) ? `${(confidence * 100).toFixed(1)}%` : '-'}`,
              turnId,
              seq,
              content: '',
              detail,
            })
            return
          }

          if (eventType === 'memory.updated') {
            const addedCount = Number(detail.addedCount)
            const stored = detail.stored === true
            if (!stored) {
              return
            }
            const addedCountText = Number.isFinite(addedCount) && addedCount > 0
              ? `已沉淀 ${Math.floor(addedCount)} 条记忆`
              : '已沉淀记忆'
            upsertRunEventCard({
              sessionId,
              cardType: 'memory',
              eventType,
              status: 'completed',
              title: '记忆上下文',
              summary: addedCountText,
              turnId,
              seq,
              content: '',
              detail,
            })
            return
          }

          if (eventType === 'websearch.executed') {
            const sourceCount = Number(detail.sourceCount)
            if (!Number.isFinite(sourceCount) || sourceCount <= 0) {
              return
            }
            upsertRunEventCard({
              sessionId,
              cardType: 'websearch',
              eventType,
              status: 'completed',
              title: '联网检索执行',
              summary: `来源=${normalizeRunEventText(detail.source) || '-'}，命中=${Number.isFinite(sourceCount) ? sourceCount : 0}`,
              turnId,
              seq,
              content: '',
              detail,
            })
            return
          }

          if (eventType === 'websearch.decision') {
            upsertRunEventCard({
              sessionId,
              cardType: 'websearch',
              eventType,
              status: 'completed',
              title: '联网检索决策',
              summary: normalizeWebsearchDecisionReason(detail.reason),
              turnId,
              seq,
              content: '',
              detail,
            })
            return
          }

          if (eventType === 'websearch.skipped') {
            upsertRunEventCard({
              sessionId,
              cardType: 'websearch',
              eventType,
              status: 'skipped',
              title: '联网检索执行',
              summary: normalizeWebsearchDecisionReason(detail.reason || payload.reason),
              turnId,
              seq,
              content: '',
              detail,
            })
            return
          }

          if (eventType === 'thinking.delta') {
            const chunk = normalizeThinkingTraceText(payload.delta || detail.text)
            upsertRunEventCard({
              sessionId,
              cardType: 'thinking',
              eventType,
              status: chunk ? 'running' : 'completed',
              title: 'Thinking',
              summary: chunk ? '思考中' : '思考完成',
              turnId,
              seq,
              content: chunk,
              detail,
            })
            return
          }

          if (eventType === 'thinking.final') {
            const finalText = normalizeThinkingTraceText(payload.message || detail.text)
            upsertRunEventCard({
              sessionId,
              cardType: 'thinking',
              eventType,
              status: 'completed',
              title: 'Thinking',
              summary: '思考完成',
              turnId,
              seq,
              content: finalText,
              detail,
            })
          }
        }

        // signal.signal.addEventListener('abort', () => {
        //   innerMsg.status = IChatItemStatus.CANCELLED
        // })

        // console.log('template', conversation, conversation.template, conversation.template?.id ?? -1)

        function handleExecutorEvent(res: Record<string, any>) {
          if (completionResolved) {
            return
          }
          if (res?.code === 401) {
            res.error = true
            res.e = res.message
          }

          if (res.error) {
            if (signal.signal.aborted) {
              finalizeAsCancelled(true)
              return
            }
            flushPendingMarkdownBuffer({
              force: true,
            })
            console.error('@completion error response', res)
            const errorMessage = normalizeExecutorErrorMessage(res.e)

            innerMsg.status = IChatItemStatus.ERROR

            if (res.frequentLimit)
              handler.onFrequentLimit?.()

            if (signal.signal.aborted)
              innerMsg.status = IChatItemStatus.CANCELLED

            const extra = buildErrorBlockExtra(res)
            pushInnerBlock({
              type: 'error',
              value: errorMessage,
              extra,
            })

            finalizeRunningThinkingCards('error')
            complete()

            return
          }

          if (res.done) {
            flushPendingMarkdownBuffer({
              markDone: true,
            })
            finalizeRunningThinkingCards('done')
            if (waitingToolApproval) {
              innerMsg.status = IChatItemStatus.TOOL_CALLING
              handler?.onTriggerStatus?.(innerMsg.status)
              return
            }
            else if (
              innerMsg.status !== IChatItemStatus.ERROR
              && innerMsg.status !== IChatItemStatus.BANNED
              && innerMsg.status !== IChatItemStatus.REJECTED
              && innerMsg.status !== IChatItemStatus.CANCELLED
            ) {
              innerMsg.status = IChatItemStatus.AVAILABLE
            }
            complete()

            return
          }

          const eventType = String(res.event || res.type || '').trim()
          const eventName = typeof res.name === 'string' ? res.name.trim() : ''
          if (eventName) {
            lastCompletionName = eventName
          }
          if (!eventType || eventType === 'stream.heartbeat') {
            return
          }

          if (eventType === 'assistant.delta') {
            const chunk = typeof res.delta === 'string'
              ? res.delta
              : normalizeRunEventText(res?.payload?.text)
            if (chunk) {
              getOrCreateStreamingMarkdownBlock(toFiniteSeq(res.seq))
              appendPendingMarkdownChunk(chunk)
              scheduleMarkdownBufferFlush()
              handler?.onCompletionStart?.(lastCompletionName || 'assistant')
            }
            if (innerMsg.status !== IChatItemStatus.GENERATING) {
              innerMsg.status = IChatItemStatus.GENERATING
              handler?.onTriggerStatus?.(innerMsg.status)
            }
            return
          }

          if (eventType === 'assistant.final') {
            waitingToolApproval = false
            const markdownBlock = getOrCreateStreamingMarkdownBlock(toFiniteSeq(res.seq))
            const finalText = typeof res.message === 'string'
              ? res.message
              : normalizeRunEventText(res?.payload?.text)
            const flushed = flushPendingMarkdownBuffer({
              markDone: true,
            })
            if (finalText) {
              if (finalText.length >= markdownBlock.value.length) {
                markdownBlock.value = finalText
              }
              else if (!markdownBlock.value) {
                markdownBlock.value = finalText
              }
            }
            markdownBlock.extra = {
              ...(markdownBlock.extra || {}),
              done: true,
            }
            if (finalText && finalText !== flushed) {
              handler.onCompletion?.(lastCompletionName || 'assistant', finalText)
            }
            finalizeRunningThinkingCards('assistant.final')
            return
          }

          if (eventType === 'done' || eventType === 'turn.finished' || eventType === 'error') {
            finalizeRunningThinkingCards(eventType)
          }

          if (
            eventType === 'intent.started'
            || eventType === 'intent.completed'
            || eventType === 'memory.updated'
            || eventType === 'websearch.decision'
            || eventType === 'websearch.skipped'
            || eventType === 'websearch.executed'
            || eventType === 'thinking.delta'
            || eventType === 'thinking.final'
          ) {
            pushRunEventCardFromStream(eventType, res)
            if (eventType === 'thinking.delta' && innerMsg.status !== IChatItemStatus.GENERATING) {
              innerMsg.status = IChatItemStatus.GENERATING
              handler?.onTriggerStatus?.(innerMsg.status)
            }
            return
          }

          if (eventType === 'run.audit') {
            const payload = normalizeToolAuditCardPayload(res.payload)
            const eventSeq = toFiniteSeq(res.seq)
            if (eventSeq > 0) {
              payload.seq = eventSeq
            }
            if (!payload.sessionId) {
              payload.sessionId = conversation.id
            }
            const mappedStatus = mapToolAuditTypeToChatStatus(payload.auditType)

            if (mappedStatus !== null) {
              innerMsg.status = mappedStatus
              handler?.onTriggerStatus?.(mappedStatus)
              upsertToolCard(payload)
            }

            if (payload.auditType === 'tool.call.started') {
              handler.onToolStart?.(payload.toolName, payload.inputPreview)
            }
            else if (payload.auditType === 'tool.call.completed') {
              waitingToolApproval = false
              handler.onToolEnd?.(payload.toolName, payload.outputPreview)
            }
            else if (payload.auditType === 'tool.call.approval_required') {
              applyApprovalRequiredState(payload)
            }
            else if (payload.auditType === 'tool.call.failed' || payload.auditType === 'tool.call.rejected') {
              waitingToolApproval = false
              if (payload.errorMessage) {
                pushInnerBlock({
                  type: 'error',
                  value: payload.errorMessage,
                  extra: {
                    seq: payload.seq || 0,
                  },
                })
              }
            }
            return
          }

          if (eventType === 'turn.approval_required') {
            applyApprovalRequiredState(buildApprovalRequiredToolPayload(res))
            return
          }

          if (eventType === 'suggest') {
            pushInnerBlock({
              data: 'suggest',
              type: res.content_type as any,
              value: res.content,
              extra: {
                seq: toFiniteSeq(res.seq),
              },
            })
            return
          }

          if (eventType === 'title.generated') {
            const title = String(res.title || '').trim()
            if (title) {
              conversation.topic = title
            }
            handler.onVerbose?.('title.generated', title)
            return
          }

          if (eventType === 'title.failed') {
            handler.onVerbose?.('title.failed', String(res.message || ''))
            return
          }

          if (eventType === 'done') {
            flushPendingMarkdownBuffer({
              markDone: true,
            })
            if (waitingToolApproval) {
              innerMsg.status = IChatItemStatus.TOOL_CALLING
              handler?.onTriggerStatus?.(innerMsg.status)
              return
            }
            else if (
              innerMsg.status !== IChatItemStatus.ERROR
              && innerMsg.status !== IChatItemStatus.BANNED
              && innerMsg.status !== IChatItemStatus.REJECTED
              && innerMsg.status !== IChatItemStatus.CANCELLED
            ) {
              innerMsg.status = IChatItemStatus.AVAILABLE
            }
            complete()
            return
          }

          if (eventType === 'error') {
            if (signal.signal.aborted) {
              finalizeAsCancelled(true)
              return
            }
            flushPendingMarkdownBuffer({
              force: true,
            })
            if (isToolApprovalRequiredPayload(res)) {
              applyApprovalRequiredState(buildApprovalRequiredToolPayload(res))
              return
            }

            handler.onError?.()
            console.error('@completion mapped error response', res)

            const message = normalizeExecutorErrorMessage(res.message || res.error || res.detail)
            const extra = buildErrorBlockExtra(res)

            pushInnerBlock({
              type: 'error',
              value: message,
              extra,
            })

            if (message.includes('状态不可用'))
              innerMsg.status = IChatItemStatus.BANNED
            else if (message.includes('额度已用尽'))
              innerMsg.status = IChatItemStatus.REJECTED
            else
              innerMsg.status = IChatItemStatus.ERROR
            return
          }

          if (legacyIgnoredEvents.has(eventType)) {
            if (!legacyWarnedEvents.has(eventType)) {
              legacyWarnedEvents.add(eventType)
              console.warn('[completion] ignored legacy stream event', eventType)
            }
          }
        }

        upsertRunEventCard({
          sessionId: conversation.id,
          cardType: 'intent',
          eventType: 'intent.started',
          status: 'running',
          title: '意图分析',
          summary: '正在分析意图',
          turnId: '',
          seq: 0,
          content: '',
          detail: {},
        })
        startExecutorStream()

        return signal
      },
    }
  },
}
