import type { IInnerItemType } from './entity'
import type { IChatBody, IChatConversation, IChatInnerItem, IChatItem, ICompletionHandler, IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'
import { endHttp } from '~/composables/api/axios'
import { IChatItemStatus, IChatRole, PersistStatus, QuotaModel } from '~/composables/api/base/v1/aigc/completion-types'
import { mapStrStatus } from './entity'

function parseJsonSafe<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  }
  catch {
    return null
  }
}

function normalizeExecutorErrorMessage(error: unknown): string {
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

const MARKDOWN_STREAM_FLUSH_MS = 80

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

      const turn = await endHttp.$http({
        url: `v1/chat/sessions/${encodeURIComponent(sessionId)}/turns`,
        method: 'POST',
        data: {
          ...body,
        },
        signal: streamController.signal,
      }) as Record<string, any>

      const requestId = String(turn?.request_id || '').trim()
      if (!requestId) {
        throw new Error('request_id is missing')
      }
      wrappedCallback({
        done: false,
        event: 'turn.accepted',
        request_id: requestId,
        turn_id: String(turn?.turn_id || '').trim(),
        queue_pos: Number(turn?.queue_pos || 0),
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

    function complete() {
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
        let markdownFlushTimer: ReturnType<typeof setTimeout> | null = null
        let lastCompletionName = ''

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

        function flushPendingMarkdownBuffer(options: { markDone?: boolean } = {}): string {
          clearMarkdownFlushTimer()

          const chunk = pendingMarkdownBuffer
          const markDone = Boolean(options.markDone)
          if (!chunk && !markDone) {
            return ''
          }

          const markdownBlock = getOrCreateStreamingMarkdownBlock()
          if (chunk) {
            markdownBlock.value += chunk
            pendingMarkdownBuffer = ''
            if (lastCompletionName)
              handler.onCompletion?.(lastCompletionName, chunk)
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

        // signal.signal.addEventListener('abort', () => {
        //   innerMsg.status = IChatItemStatus.CANCELLED
        // })

        // console.log('template', conversation, conversation.template, conversation.template?.id ?? -1)

        useCompletionExecutor(
          {
            ...options || {},
            temperature: innerMsg.meta.temperature || 0.5,
            templateId: conversation.template?.id ?? -1,
            messages: JSON.parse(JSON.stringify(conversation.messages)),
            index: index === -1 ? 0 : index,
            chat_id: conversation.id,
            model: innerMsg.model,
            signal: signal.signal,
          },
          (res) => {
            if (res?.code === 401) {
              res.error = true
              res.e = res.message
            }

            if (res.error) {
              flushPendingMarkdownBuffer()
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
              flushPendingMarkdownBuffer({
                markDone: true,
              })
              if (
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
                pendingMarkdownBuffer += chunk
                scheduleMarkdownBufferFlush()
              }
              if (innerMsg.status !== IChatItemStatus.GENERATING) {
                innerMsg.status = IChatItemStatus.GENERATING
                handler?.onTriggerStatus?.(innerMsg.status)
              }
            }
            else if (event === 'turn.completed') {
              const markdownBlock = getOrCreateStreamingMarkdownBlock()
              const finalText = typeof res.message === 'string' ? res.message : ''
              const flushed = flushPendingMarkdownBuffer()
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
              flushPendingMarkdownBuffer()
              const message = String(res.message || '请求失败，请稍后重试')
              innerMsg.status = IChatItemStatus.ERROR
              handler.onError?.()
              handler?.onTriggerStatus?.(innerMsg.status)
              innerMsg.value.push({
                type: 'error',
                value: message,
              })
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

              if (mappedStatus === IChatItemStatus.TOOL_CALLING) {
                handler.onVerbose?.(name, data)
                console.log('tool calling', res)

                innerMsg.value.push({
                  type: 'tool',
                  value: '',
                  data,
                  name,
                  extra: {
                    start: Date.now(),
                  },
                })
              }
              else if (mappedStatus === IChatItemStatus.TOOL_RESULT) {
                handler.onToolEnd?.(name, data)
                console.log('tool result', res)

                // 从最后一个往前找 name 相同的 meta
                for (let i = innerMsg.value.length - 1; i >= 0; i--) {
                  const meta = innerMsg.value[i]
                  if (meta.name === name) {
                    meta.value = data
                    meta.extra = {
                      ...meta.extra,
                      end: Date.now(),
                    }
                    return
                  }
                }

                // 找不到就新增一个 (算是有bug 不过先这样)
                innerMsg.value.push({
                  type: 'tool',
                  value: data,
                  data: '',
                  name,
                  extra: {
                    end: Date.now(),
                  },
                })
              }
            }
            else if (event === 'completion') {
              const chunk = typeof res.content === 'string' ? res.content : ''
              const isCompleted = Boolean(res.completed)

              if (!isCompleted) {
                if (chunk) {
                  pendingMarkdownBuffer += chunk
                  scheduleMarkdownBufferFlush()
                }
              }
              else {
                const markdownBlock = getOrCreateStreamingMarkdownBlock()
                flushPendingMarkdownBuffer()

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
              flushPendingMarkdownBuffer()
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
          },
        )

        return signal
      },
    }
  },
}
