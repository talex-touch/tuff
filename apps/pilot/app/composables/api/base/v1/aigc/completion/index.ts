import type { IInnerItemType } from './entity'
import type { IChatBody, IChatConversation, IChatInnerItem, IChatItem, ICompletionHandler, IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'
import { endHttp } from '~/composables/api/axios'
import { IChatItemStatus, IChatRole, PersistStatus, QuotaModel } from '~/composables/api/base/v1/aigc/completion-types'
import { calculateConversation, mapStrStatus } from './entity'

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

async function handleExecutorResult(reader: ReadableStreamDefaultReader<string>, callback: (data: any) => void) {
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

function processMessageEach({ ques, ans }: { ques: IChatItem, ans: IChatItem }) {
  const quesContent = ques.content[ques.page]!
  const ansContent = ans.content[ans.page]!

  // 判断ans的状态不是 AVAILABLE 直接返回
  if (ansContent.status !== IChatItemStatus.AVAILABLE)
    return false

  if (!ansContent.value.length)
    return false

  const quesText = quesContent.value
  const ansText = ansContent.value

  return [quesText, ansText]
}

async function useCompletionExecutor(body: IChatBody, callback: (data: any) => void) {
  const messages = ref(body.messages)

  messages.value = calculateConversation(messages)

  const msgList = messages.value
  const convertedMsgList: any = []

  msgList.pop()

  // 先将msgList按照2个划分为一组
  for (let i = 0; i < msgList.length - 2; i += 2) {
    const obj = {
      ques: msgList[i],
      ans: msgList[i + 1],
    }

    const res = processMessageEach(obj)

    if (!res)
      continue

    convertedMsgList.push({
      ...obj.ques,
      content: res[0],
    })

    convertedMsgList.push({
      ...obj.ans,
      content: res[1],
    })
  }

  const lastOne = msgList[msgList.length - 1]
  const lastContent = lastOne.content.find(item => item?.page === lastOne.page)

  if (!lastContent) {
    console.warn('lastContent', lastContent, msgList)

    throw new Error('LastContent is null!')
  }

  convertedMsgList.push({
    ...lastOne,
    content: lastContent?.value,
  })

  // console.log('msgList', convertedMsgList)

  body.messages = convertedMsgList

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
    try {
      const res: ReadableStream = await endHttp.$http({
        url: 'aigc/executor',
        method: 'POST',
        data: {
          ...body,
        },
        params: {
          uid: userStore.value.id,
        },
        headers: {
          Accept: 'text/event-stream',
        },
        adapter: 'fetch',
        responseType: 'stream',
        signal: body.signal || new AbortController().signal,
      })

      const reader = res.pipeThrough(new TextDecoderStream()).getReader()

      await handleExecutorResult(reader, wrappedCallback)
    }
    catch (e) {
      console.error(e)

      wrappedCallback({
        done: false,
        event: 'error',
        status: 'failed',
        id: 'assistant',
        message: normalizeExecutorErrorMessage(e),
      })
      wrappedCallback({
        done: true,
      })
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
            // console.log('RES', res, res.event)
            if (event === 'status_updated') {
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
              const innerMeta = innerMsg.value.at(-1)

              if (innerMeta?.type === 'markdown' && !innerMeta.extra?.done) {
                innerMeta.value += res.content
                if (res.completed) {
                  innerMeta.value = res.content
                  innerMeta.extra = {
                    ...innerMeta.extra,
                    done: true,
                  }
                }
              }
              else {
                innerMsg.value.push({
                  type: 'markdown',
                  value: res.content,
                })
              }

              handler.onCompletion?.(name, res.content)
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
