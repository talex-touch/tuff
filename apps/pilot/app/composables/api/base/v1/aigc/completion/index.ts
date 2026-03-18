import type { IInnerItemType } from './entity'
import type { ToolApprovalTicket } from './flow'
import type { IChatBody, IChatConversation, IChatInnerItem, IChatItem, ICompletionHandler, IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'
import { endHttp } from '~/composables/api/axios'
import { IChatItemStatus, IChatRole, PersistStatus, QuotaModel } from '~/composables/api/base/v1/aigc/completion-types'
import { mapStrStatus } from './entity'
import {
  buildApprovalMonitorFailureAuditPatch,
  buildRejectedApprovalAuditPatch,
  normalizeToolApprovalTicket,
  pollToolApprovalDecision,
  resolveStreamRequestId,
} from './flow'

function parseJsonSafe<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  }
  catch {
    return null
  }
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
    return error

  if (error instanceof Error)
    return error.message || '请求失败，请稍后重试'

  if (error && typeof error === 'object') {
    const payload = error as Record<string, any>
    const directMessage = payload.message
      || payload.error
      || payload.detail
      || payload.statusText

    if (typeof directMessage === 'string' && directMessage.trim())
      return directMessage.trim()

    const response = payload.response && typeof payload.response === 'object'
      ? payload.response as Record<string, any>
      : null
    const responseData = payload.data ?? response?.data

    if (typeof responseData === 'string' && responseData.trim())
      return responseData.trim()

    if (responseData && typeof responseData === 'object') {
      const data = responseData as Record<string, any>
      const dataMessage = data.message || data.error
      if (typeof dataMessage === 'string' && dataMessage.trim()) {
        const code = typeof data.code === 'number' ? data.code : response?.status
        return code ? `${code} ${dataMessage.trim()}` : dataMessage.trim()
      }
    }

    const statusCode = payload.status ?? response?.status
    if (typeof statusCode === 'number')
      return `${statusCode} 请求失败，请稍后重试`
  }

  return '请求失败，请稍后重试'
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

async function fetchToolApprovalTicket(options: {
  sessionId: string
  ticketId: string
}): Promise<ToolApprovalTicket | null> {
  const payload = await endHttp.$http({
    method: 'GET',
    url: `v1/chat/sessions/${encodeURIComponent(options.sessionId)}/tool-approvals`,
    params: {},
  }) as Record<string, unknown>
  const body = payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data as Record<string, unknown>
    : payload
  const approvals = Array.isArray(body.approvals)
    ? body.approvals
    : []
  for (const item of approvals) {
    const normalized = normalizeToolApprovalTicket(item)
    if (!normalized) {
      continue
    }
    if (normalized.ticketId === options.ticketId) {
      return normalized
    }
  }
  return null
}

const MARKDOWN_STREAM_FLUSH_MS = 16
const MARKDOWN_STREAM_FORCE_FLUSH_MS = 64

interface ToolAuditCardPayload {
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

function resolveActiveInnerItem(message: IChatItem): IChatInnerItem | null {
  const byPage = message.content.find(item => item?.page === message.page)
  if (byPage) {
    return byPage
  }

  const byIndex = message.content[message.page]
  if (byIndex) {
    return byIndex
  }

  return message.content.find(item => Boolean(item)) || null
}

function normalizeInnerMetaList(value: unknown): IInnerItemMeta[] {
  if (!Array.isArray(value)) {
    return []
  }

  const list: IInnerItemMeta[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const row = item as Record<string, unknown>
    const content = typeof row.value === 'string' ? row.value : ''
    if (!content) {
      continue
    }

    list.push({
      type: String(row.type || 'text') as IInnerItemType,
      value: content,
      name: typeof row.name === 'string' ? row.name : undefined,
      data: typeof row.data === 'string' ? row.data : undefined,
    })
  }

  return list
}

function serializeConversationForExecutor(messages: IChatItem[]): Array<{
  id: string
  role: IChatRole
  content: IInnerItemMeta[]
}> {
  const list: Array<{
    id: string
    role: IChatRole
    content: IInnerItemMeta[]
  }> = []

  for (const message of messages) {
    const inner = resolveActiveInnerItem(message)
    if (!inner) {
      continue
    }

    if (message.role === IChatRole.ASSISTANT && inner.status !== IChatItemStatus.AVAILABLE) {
      continue
    }

    const content = normalizeInnerMetaList(inner.value)
    if (content.length <= 0) {
      continue
    }

    list.push({
      id: message.id,
      role: message.role,
      content,
    })
  }

  return list
}

async function useCompletionExecutor(body: IChatBody, callback: (data: any) => void) {
  const existingRequestId = String((body as unknown as Record<string, unknown>)?.requestId || '').trim()
  const convertedMsgList = serializeConversationForExecutor(body.messages || [])
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

      const requestId = await resolveStreamRequestId({
        existingRequestId,
        createTurn: async () => {
          const turn = await endHttp.$http({
            url: `v1/chat/sessions/${encodeURIComponent(sessionId)}/turns`,
            method: 'POST',
            data: {
              ...body,
            },
            signal: streamController.signal,
          }) as Record<string, any>

          return {
            requestId: String(turn?.request_id || '').trim(),
            turnId: String(turn?.turn_id || '').trim(),
            queuePos: Number(turn?.queue_pos || 0),
          }
        },
        onTurnAccepted: (turn) => {
          wrappedCallback({
            done: false,
            event: 'turn.accepted',
            request_id: turn.requestId,
            turn_id: turn.turnId,
            queue_pos: turn.queuePos,
          })
        },
      })

      const res: ReadableStream = await endHttp.$http({
        url: `v1/chat/sessions/${encodeURIComponent(sessionId)}/stream`,
        method: 'POST',
        data: {
          request_id: requestId,
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
    function complete() {
      if (completionResolved) {
        return
      }
      completionResolved = true
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

        await useCompletionExecutor(
          {
            temperature: 0,
            templateId: -1,
            generateTitle: true,
            messages: JSON.parse(JSON.stringify(conversation.messages)),
            index: index === -1 ? 0 : index,
            chat_id: conversation.id,
            model: QuotaModel.QUOTA_THIS_TITLE,
          },
          (res) => {
            if (res.error) {
              titleOptions.status = IChatItemStatus.ERROR

              if (res.frequentLimit)
                handler.onFrequentLimit?.()

              return
            }

            if (res.done) {
              titleOptions.status = IChatItemStatus.AVAILABLE

              return
            }

            const { event } = res
            if (event === 'status_updated') {
              const mappedStatus = mapStrStatus(res.status)
              if (mappedStatus === IChatItemStatus.GENERATING && innerMsg.status !== IChatItemStatus.WAITING)
                return
              titleOptions.status = mappedStatus
            }
            else if (event === 'completion') {
              if (res.completed)
                return
              titleOptions.value += res.content

              conversation.topic = titleOptions.value

              // 截取前12位
              conversation.topic = conversation.topic.slice(0, 12)
            }
          },
        )

        return titleOptions
      },
      send: (options?: Partial<ChatCompletionDto>): AbortController => {
        innerMsg.status = IChatItemStatus.WAITING

        const signal = new AbortController()
        let pendingMarkdownBuffer = ''
        let pendingMarkdownSince = 0
        let markdownFlushTimer: ReturnType<typeof setTimeout> | null = null
        let lastCompletionName = ''
        let waitingToolApproval = false
        let activeRequestId = ''
        let approvalMonitorActive = false
        let approvalMonitorCompleted = false
        const runtimePublic = useRuntimeConfig().public as Record<string, unknown>
        const legacyEventCompatEnabled = normalizeBoolean(runtimePublic.pilotEnableLegacyExecutorEventCompat, false)
        const toolApprovalAutoResumeEnabled = normalizeBoolean(runtimePublic.pilotToolApprovalAutoResume, true)
        const toolApprovalPollIntervalMs = normalizeTimeoutMs(
          runtimePublic.pilotToolApprovalPollIntervalMs,
          1500,
          500,
          15_000,
        )
        const toolApprovalPollTimeoutMs = normalizeTimeoutMs(
          runtimePublic.pilotToolApprovalPollTimeoutMs,
          10 * 60_000,
          5_000,
          60 * 60_000,
        )

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
          }
          const nextData = JSON.stringify({
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

        async function waitApprovalDecision(ticketId: string): Promise<ToolApprovalTicket> {
          return pollToolApprovalDecision({
            ticketId,
            timeoutMs: toolApprovalPollTimeoutMs,
            intervalMs: toolApprovalPollIntervalMs,
            fetchTicket: async (id: string) => fetchToolApprovalTicket({
              sessionId: conversation.id,
              ticketId: id,
            }),
            isAborted: () => signal.signal.aborted,
          })
        }

        function startApprovalMonitor(payload: ToolAuditCardPayload): boolean {
          if (!toolApprovalAutoResumeEnabled || approvalMonitorActive || approvalMonitorCompleted) {
            return false
          }
          if (!payload.ticketId || !activeRequestId) {
            return false
          }

          approvalMonitorActive = true
          void (async () => {
            try {
              const ticket = await waitApprovalDecision(payload.ticketId)
              if (signal.signal.aborted) {
                return
              }

              if (ticket.status === 'approved') {
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
                startExecutorStream(activeRequestId)
                return
              }

              waitingToolApproval = false
              innerMsg.status = IChatItemStatus.TOOL_ERROR
              handler?.onTriggerStatus?.(innerMsg.status)
              const rejectedPatch = buildRejectedApprovalAuditPatch({
                fallbackMessage: payload.errorMessage || '工具审批被拒绝',
                ticket,
              })
              upsertToolCard({
                ...payload,
                ...rejectedPatch,
              })
              innerMsg.value.push({
                type: 'error',
                value: rejectedPatch.errorMessage,
              })
              complete()
            }
            catch (error) {
              if (signal.signal.aborted) {
                return
              }
              const raw = String(error instanceof Error ? error.message : error || '')
              if (raw === 'APPROVAL_MONITOR_ABORTED') {
                return
              }

              waitingToolApproval = false
              innerMsg.status = IChatItemStatus.TOOL_ERROR
              handler?.onTriggerStatus?.(innerMsg.status)
              const failedPatch = buildApprovalMonitorFailureAuditPatch({
                error,
                timeoutMs: toolApprovalPollTimeoutMs,
              })
              upsertToolCard({
                ...payload,
                ...failedPatch,
              })
              innerMsg.value.push({
                type: 'error',
                value: failedPatch.errorMessage,
              })
              complete()
            }
            finally {
              approvalMonitorActive = false
              approvalMonitorCompleted = true
            }
          })()
          return true
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

            innerMsg.value.push({
              type: 'error',
              value: errorMessage,
            })

            complete()

            return
          }

          if (res.done) {
            if (waitingToolApproval && toolApprovalAutoResumeEnabled && approvalMonitorActive) {
              innerMsg.status = IChatItemStatus.TOOL_CALLING
              handler?.onTriggerStatus?.(innerMsg.status)
              return
            }
            flushPendingMarkdownBuffer({
              markDone: true,
            })
            if (waitingToolApproval) {
              innerMsg.status = IChatItemStatus.TOOL_CALLING
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

          const { event, name, data } = res
          lastCompletionName = typeof name === 'string' ? name : lastCompletionName
          // console.log('RES', res, res.event)
          if (event === 'turn.accepted') {
            activeRequestId = String(res.request_id || activeRequestId || '').trim()
            innerMsg.status = IChatItemStatus.WAITING
            handler.onAccepted?.({
              requestId: res.request_id,
              turnId: res.turn_id,
              queuePos: res.queue_pos,
            })
            handler?.onTriggerStatus?.(innerMsg.status)
          }
          else if (event === 'turn.queued') {
            innerMsg.status = IChatItemStatus.WAITING
            handler?.onTriggerStatus?.(innerMsg.status)
          }
          else if (event === 'turn.started') {
            innerMsg.status = IChatItemStatus.GENERATING
            handler?.onTriggerStatus?.(innerMsg.status)
          }
          else if (event === 'turn.delta') {
            const chunk = typeof res.delta === 'string' ? res.delta : ''
            if (chunk) {
              appendPendingMarkdownChunk(chunk)
              scheduleMarkdownBufferFlush()
            }
            if (innerMsg.status !== IChatItemStatus.GENERATING) {
              innerMsg.status = IChatItemStatus.GENERATING
              handler?.onTriggerStatus?.(innerMsg.status)
            }
          }
          else if (event === 'turn.completed') {
            waitingToolApproval = false
            const markdownBlock = getOrCreateStreamingMarkdownBlock()
            const finalText = typeof res.message === 'string' ? res.message : ''
            const flushed = flushPendingMarkdownBuffer({
              markDone: true,
            })
            if (finalText) {
              if (finalText.length >= markdownBlock.value.length)
                markdownBlock.value = finalText
              else if (!markdownBlock.value)
                markdownBlock.value = finalText
            }
            markdownBlock.extra = {
              ...(markdownBlock.extra || {}),
              done: true,
            }
            if (finalText && finalText !== flushed)
              handler.onCompletion?.(lastCompletionName || name, finalText)
          }
          else if (event === 'turn.failed') {
            waitingToolApproval = false
            flushPendingMarkdownBuffer({
              force: true,
            })
            const message = String(res.message || '请求失败，请稍后重试')
            innerMsg.status = IChatItemStatus.ERROR
            handler.onError?.()
            handler?.onTriggerStatus?.(innerMsg.status)
            innerMsg.value.push({
              type: 'error',
              value: message,
            })
          }
          else if (event === 'turn.approval_required') {
            flushPendingMarkdownBuffer({
              force: true,
            })
            waitingToolApproval = true
            const detail = res.detail && typeof res.detail === 'object'
              ? res.detail as Record<string, unknown>
              : {}
            const toolName = String(detail.tool_name || detail.toolName || 'tool').trim() || 'tool'
            const payload: ToolAuditCardPayload = {
              callId: String(detail.call_id || detail.callId || '').trim() || `approval_${Date.now().toString(36)}`,
              toolId: String(detail.tool_id || detail.toolId || '').trim() || 'tool.unknown',
              toolName,
              riskLevel: String(detail.risk_level || detail.riskLevel || 'high').trim() || 'high',
              status: 'approval_required',
              inputPreview: '',
              outputPreview: '',
              durationMs: 0,
              ticketId: String(detail.ticket_id || detail.ticketId || '').trim(),
              sources: [],
              errorCode: String(res.code || detail.code || '').trim(),
              errorMessage: String(res.message || '高风险工具调用需要审批').trim(),
              auditType: 'tool.call.approval_required',
            }
            innerMsg.status = IChatItemStatus.TOOL_CALLING
            handler?.onTriggerStatus?.(innerMsg.status)
            upsertToolCard(payload)
            const monitorStarted = startApprovalMonitor(payload)
            if (!monitorStarted) {
              approvalMonitorCompleted = true
            }
          }
          else if (event === 'title.generated') {
            const title = String(res.title || '').trim()
            if (title)
              conversation.topic = title
            handler.onVerbose?.('title.generated', title)
          }
          else if (event === 'title.failed') {
            handler.onVerbose?.('title.failed', String(res.message || ''))
          }
          else if (event === 'run.audit') {
            const payload = normalizeToolAuditCardPayload(res.payload)
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
              handler.onToolEnd?.(payload.toolName, payload.outputPreview)
            }
            else if (payload.auditType === 'tool.call.failed' || payload.auditType === 'tool.call.rejected') {
              if (payload.errorMessage) {
                innerMsg.value.push({
                  type: 'error',
                  value: payload.errorMessage,
                })
              }
            }
          }
          else if (event === 'status_updated') {
            const mappedStatus = mapStrStatus(res.status)
            // if (mappedStatus === IChatItemStatus.GENERATING && innerMsg.status !== IChatItemStatus.WAITING)
            //   return
            innerMsg.status = mappedStatus
            handler?.onTriggerStatus?.(mappedStatus)

            if (res.status === 'start')
              handler?.onCompletionStart?.(res.id)

            if (res.status === 'end')
              handler?.onChainEnd?.(res.id)

            if (legacyEventCompatEnabled) {
              if (mappedStatus === IChatItemStatus.TOOL_CALLING) {
                handler.onVerbose?.(name, data)
              }
              else if (mappedStatus === IChatItemStatus.TOOL_RESULT) {
                handler.onToolEnd?.(name, data)
              }
            }
          }
          else if (event === 'completion') {
            if (!legacyEventCompatEnabled) {
              return
            }
            const chunk = typeof res.content === 'string' ? res.content : ''
            const isCompleted = Boolean(res.completed)

            if (!isCompleted) {
              if (chunk) {
                appendPendingMarkdownChunk(chunk)
                scheduleMarkdownBufferFlush()
              }
            }
            else {
              const markdownBlock = getOrCreateStreamingMarkdownBlock()
              flushPendingMarkdownBuffer({
                markDone: true,
              })

              let emitChunk = ''
              if (chunk) {
                // 兼容旧协议（completed=true 且 content 为全文）。
                if (chunk.startsWith(markdownBlock.value)) {
                  emitChunk = chunk.slice(markdownBlock.value.length)
                  markdownBlock.value = chunk
                }
                else if (chunk.length >= markdownBlock.value.length) {
                  emitChunk = chunk
                  markdownBlock.value = chunk
                }
                else {
                  emitChunk = chunk
                  markdownBlock.value += chunk
                }
              }

              markdownBlock.extra = {
                ...(markdownBlock.extra || {}),
                done: true,
              }

              if (emitChunk)
                handler.onCompletion?.(lastCompletionName || name, emitChunk)
            }
          }
          else if (event === 'suggest') {
            innerMsg.value.push({
              data: 'suggest',
              type: res.content_type as any,
              value: res.content,
            })
          }
          else if (event === 'verbose') {
            if (!legacyEventCompatEnabled) {
              return
            }
            handler.onVerbose?.(name, data)
            console.log('verbose calling', res)

            innerMsg.value.push({
              type: 'card',
              value: res.addon,
              data,
              name,
            })
          }
          else if (event === 'error') {
            flushPendingMarkdownBuffer({
              force: true,
            })
            handler.onError?.()

            const mappedStatus = mapStrStatus(res.status)
            if (mappedStatus === IChatItemStatus.ERROR) {
              console.error('@completion mapped error response', res)

              const message: string = res.message

              innerMsg.value.push({
                type: 'error',
                value: message,
              })

              if (message.includes('状态不可用'))
                innerMsg.status = IChatItemStatus.BANNED
              else if (message.includes('额度已用尽'))
                innerMsg.status = IChatItemStatus.REJECTED
              else
                innerMsg.status = IChatItemStatus.ERROR
            }
            else {
              innerMsg.status = mappedStatus
            }
          }
        }

        startExecutorStream()

        return signal
      },
    }
  },
}
