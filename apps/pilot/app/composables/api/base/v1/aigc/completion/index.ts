import type { IInnerItemType } from './entity'
import type { IChatBody, IChatConversation, IChatInnerItem, IChatItem, ICompletionHandler, IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'
import { serializePilotExecutorMessages } from '@talex-touch/tuff-intelligence/pilot-conversation'
import { endHttp } from '~/composables/api/axios'
import { IChatItemStatus, IChatRole, PersistStatus, QuotaModel } from '~/composables/api/base/v1/aigc/completion-types'

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
    callId: String(row.callId || '').trim(),
    toolId: String(row.toolId || '').trim(),
    toolName: String(row.toolName || '').trim() || 'tool',
    riskLevel: String(row.riskLevel || '').trim() || 'low',
    status: String(row.status || '').trim(),
    inputPreview: String(row.inputPreview || '').trim(),
    outputPreview: String(row.outputPreview || '').trim(),
    durationMs: Number.isFinite(Number(row.durationMs))
      ? Math.max(0, Number(row.durationMs))
      : 0,
    ticketId: String(row.ticketId || '').trim(),
    sources,
    errorCode: String(row.errorCode || '').trim(),
    errorMessage: String(row.errorMessage || '').trim(),
    auditType: String(row.auditType || '').trim(),
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

interface LegacyUiStreamInputPayload {
  message: string
}

function normalizeLegacyText(value: unknown): string {
  return String(value || '').trim()
}

function resolveLegacyUiStreamInput(messages: unknown): LegacyUiStreamInputPayload {
  if (!Array.isArray(messages)) {
    return {
      message: '',
    }
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index]
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const row = item as Record<string, unknown>
    const role = normalizeLegacyText(row.role).toLowerCase()
    if (role !== 'user') {
      continue
    }

    const contentBlocks = Array.isArray(row.content) ? row.content : []
    const textParts: string[] = []
    const attachmentLines: string[] = []

    for (const block of contentBlocks) {
      if (!block || typeof block !== 'object' || Array.isArray(block)) {
        continue
      }
      const blockRow = block as Record<string, unknown>
      const type = normalizeLegacyText(blockRow.type).toLowerCase()
      const value = normalizeLegacyText(blockRow.value)
      if (!value) {
        continue
      }

      if (type === 'image' || type === 'file') {
        const name = normalizeLegacyText(blockRow.name) || 'unnamed'
        const mimeType = normalizeLegacyText(blockRow.data)
        attachmentLines.push(`- [${type}] ${name}${mimeType ? ` (${mimeType})` : ''}: ${value}`)
        continue
      }

      if (type === 'card' || type === 'tool' || type === 'error') {
        continue
      }

      textParts.push(value)
    }

    const text = textParts.join('\n').trim()
    if (attachmentLines.length > 0) {
      const attachmentContext = ['[Attachment references]', ...attachmentLines].join('\n')
      return {
        message: text ? `${text}\n\n${attachmentContext}` : attachmentContext,
      }
    }

    return {
      message: text,
    }
  }

  return {
    message: '',
  }
}

async function useCompletionExecutor(body: IChatBody, callback: (data: any) => void) {
  const convertedMsgList = serializePilotExecutorMessages(body.messages || [], {
    assistantAvailableStatus: IChatItemStatus.AVAILABLE,
    skipUnavailableAssistant: true,
    keepNonTextWithoutValue: true,
  })
  if (convertedMsgList.length <= 0) {
    throw new Error('No valid conversation messages to execute')
  }

  body.messages = convertedMsgList as any

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

      const latestTurn = resolveLegacyUiStreamInput(convertedMsgList)
      if (!latestTurn.message) {
        throw new Error('latest user turn is empty')
      }

      const res: ReadableStream = await endHttp.$http({
        url: `chat/sessions/${encodeURIComponent(sessionId)}/stream`,
        method: 'POST',
        data: {
          message: latestTurn.message,
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
        },
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
      send: (options?: Partial<ChatCompletionDto>): AbortController => {
        innerMsg.status = IChatItemStatus.WAITING

        const signal = new AbortController()
        let pendingMarkdownBuffer = ''
        let pendingMarkdownSince = 0
        let markdownFlushTimer: ReturnType<typeof setTimeout> | null = null
        let lastCompletionName = 'assistant'
        let waitingToolApproval = false
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

        function getOrCreateStreamingMarkdownBlock(): IInnerItemMeta {
          const current = innerMsg.value.at(-1)
          if (current?.type === 'markdown' && !current.extra?.done) {
            return current
          }

          const created: IInnerItemMeta = {
            type: 'markdown' as IInnerItemType,
            value: '',
            extra: {},
          }
          innerMsg.value.push(created)
          return created
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

        function resolveToolCardKey(payload: ToolAuditCardPayload): string {
          if (payload.callId) {
            return payload.callId
          }
          if (payload.ticketId) {
            return `ticket_${payload.ticketId}`
          }
          if (payload.toolName) {
            return `tool_${payload.toolName}`
          }
          return `tool_${Date.now()}`
        }

        function upsertToolCard(payload: ToolAuditCardPayload): IInnerItemMeta {
          const key = resolveToolCardKey(payload)
          const prev = toolCardMap.get(key)
          const now = Date.now()
          const sessionId = String(payload.sessionId || conversation.id).trim() || conversation.id
          const nextExtra = {
            ...(prev?.extra || {}),
            start: prev?.extra?.start || now,
            end: payload.status === 'completed' || payload.status === 'failed' || payload.status === 'rejected'
              ? now
              : prev?.extra?.end,
            status: payload.status,
            callId: payload.callId,
            ticketId: payload.ticketId,
            errorCode: payload.errorCode,
            sessionId,
          }
          const nextData = JSON.stringify({
            sessionId,
            callId: payload.callId,
            toolId: payload.toolId,
            toolName: payload.toolName,
            riskLevel: payload.riskLevel,
            status: payload.status,
            inputPreview: payload.inputPreview,
            outputPreview: payload.outputPreview,
            durationMs: payload.durationMs,
            ticketId: payload.ticketId,
            sources: payload.sources,
            errorCode: payload.errorCode,
            errorMessage: payload.errorMessage,
            auditType: payload.auditType,
          })

          if (prev) {
            prev.name = 'pilot_tool_card'
            prev.type = 'card'
            prev.value = ''
            prev.data = nextData
            prev.extra = nextExtra
            return prev
          }

          const created: IInnerItemMeta = {
            type: 'card',
            name: 'pilot_tool_card',
            value: '',
            data: nextData,
            extra: nextExtra,
          }
          innerMsg.value.push(created)
          toolCardMap.set(key, created)
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

        function applyApprovalRequiredState(payload: ToolAuditCardPayload) {
          waitingToolApproval = true
          innerMsg.status = IChatItemStatus.TOOL_CALLING
          handler?.onTriggerStatus?.(innerMsg.status)
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
          innerMsg.value.push({
            type: 'error',
            value: rejectedMessage,
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
          signal.signal.addEventListener('abort', () => {
            window.removeEventListener(TOOL_APPROVAL_DECISION_EVENT, handleToolApprovalDecisionEvent as EventListener)
          }, { once: true })
        }

        const runEventCardMap = new Map<string, IInnerItemMeta>()

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
              : `intent:${sessionScope}`
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
          const prev = runEventCardMap.get(key)
          const now = Date.now()

          const prevData = parseJsonSafe<Record<string, unknown>>(String(prev?.data || '')) || {}
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
          }

          if (prev) {
            prev.name = 'pilot_run_event_card'
            prev.type = 'card'
            prev.value = ''
            prev.data = nextData
            prev.extra = nextExtra
            return prev
          }

          const created: IInnerItemMeta = {
            type: 'card',
            name: 'pilot_run_event_card',
            value: '',
            data: nextData,
            extra: nextExtra,
          }
          innerMsg.value.push(created)
          runEventCardMap.set(key, created)
          return created
        }

        function buildExecutorBody(requestId = ''): IChatBody & { requestId?: string } {
          const resolvedPilotMode = typeof innerMsg.meta.pilotMode === 'boolean'
            ? innerMsg.meta.pilotMode
            : conversation.pilotMode === true
          const payload: IChatBody & { requestId?: string } = {
            ...options || {},
            temperature: innerMsg.meta.temperature || 0.5,
            templateId: conversation.template?.id ?? -1,
            messages: JSON.parse(JSON.stringify(conversation.messages)),
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
          void useCompletionExecutor(
            buildExecutorBody(requestId),
            handleExecutorEvent,
          )
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

          if (eventType === 'thinking.delta') {
            const chunk = normalizeRunEventText(payload.delta || detail.text)
            upsertRunEventCard({
              sessionId,
              cardType: 'thinking',
              eventType,
              status: 'running',
              title: 'Thinking',
              summary: '思考中',
              turnId,
              seq,
              content: chunk,
              detail,
            })
            return
          }

          if (eventType === 'thinking.final') {
            const finalText = normalizeRunEventText(payload.message || detail.text)
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
          if (res?.code === 401) {
            res.error = true
            res.e = res.message
          }

          if (res.error) {
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
            innerMsg.value.push({
              type: 'error',
              value: errorMessage,
              extra,
            })

            complete()

            return
          }

          if (res.done) {
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
            const markdownBlock = getOrCreateStreamingMarkdownBlock()
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
            return
          }

          if (
            eventType === 'intent.started'
            || eventType === 'intent.completed'
            || eventType === 'memory.updated'
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
                innerMsg.value.push({
                  type: 'error',
                  value: payload.errorMessage,
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
            innerMsg.value.push({
              data: 'suggest',
              type: res.content_type as any,
              value: res.content,
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

            innerMsg.value.push({
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

        startExecutorStream()

        return signal
      },
    }
  },
}
