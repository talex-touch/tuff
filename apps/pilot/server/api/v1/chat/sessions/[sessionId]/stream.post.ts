import { networkClient } from '@talex-touch/utils/network'
import { createError, getHeader, getRequestURL } from 'h3'
import { requirePilotAuth } from '../../../../../utils/auth'
import {
  getChatTurnByRequestId,
  getQueuePosition,
  pickSessionHeadTurn,
  releaseSessionExecutionLock,
  tryAcquireSessionExecutionLock,
  updateChatTurnStatus,
} from '../../../../../utils/chat-turn-queue'
import { resolvePilotChannelSelection } from '../../../../../utils/pilot-channel'
import { requireSessionId, toErrorMessage } from '../../../../../utils/pilot-http'
import { createPilotStoreAdapter } from '../../../../../utils/pilot-store'
import { generateTitle } from '../../../../../utils/pilot-title'

interface StreamBody {
  request_id?: string
}

interface TurnPayload extends Record<string, unknown> {
  chat_id?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseSseFrame(frame: string): string | null {
  const lines = frame.split('\n')
  const dataLines: string[] = []
  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line || line.startsWith(':'))
      continue
    if (line.startsWith('data:')) {
      const data = line.slice(5)
      dataLines.push(data.startsWith(' ') ? data.slice(1) : data)
    }
  }
  if (!dataLines.length) {
    return null
  }
  return dataLines.join('\n')
}

async function proxyExecutorStream(options: {
  event: Parameters<typeof requirePilotAuth>[0]
  payload: TurnPayload
  onDelta: (delta: string) => Promise<void>
}): Promise<string> {
  const requestUrl = getRequestURL(options.event)
  const endpoint = `${requestUrl.protocol}//${requestUrl.host}/api/aigc/executor`
  const headers: Record<string, string> = {
    'accept': 'text/event-stream',
    'content-type': 'application/json',
  }
  const cookie = getHeader(options.event, 'cookie')
  const authorization = getHeader(options.event, 'authorization')
  if (cookie) {
    headers.cookie = cookie
  }
  if (authorization) {
    headers.authorization = authorization
  }

  const response = await networkClient.request<ReadableStream<Uint8Array> | null>({
    method: 'POST',
    url: endpoint,
    headers,
    body: options.payload,
    responseType: 'stream',
  })

  if (!response.data) {
    throw new Error(`Executor stream failed: HTTP ${response.status}`)
  }

  const reader = response.data.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      const tail = decoder.decode()
      if (tail) {
        buffer += tail.replace(/\r\n/g, '\n')
      }
      break
    }

    if (!value) {
      continue
    }

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let frameEndIndex = buffer.indexOf('\n\n')
    while (frameEndIndex !== -1) {
      const frame = buffer.slice(0, frameEndIndex)
      buffer = buffer.slice(frameEndIndex + 2)
      frameEndIndex = buffer.indexOf('\n\n')

      const data = parseSseFrame(frame)
      if (!data) {
        continue
      }
      if (data === '[DONE]') {
        continue
      }

      let payload: Record<string, unknown> | null = null
      try {
        payload = JSON.parse(data) as Record<string, unknown>
      }
      catch {
        throw new Error('Failed to parse upstream SSE payload')
      }

      if (!payload) {
        continue
      }

      if (payload.error === true) {
        throw new Error(String(payload.e || payload.message || 'Executor stream failed'))
      }

      if (payload.event === 'error') {
        throw new Error(String(payload.message || payload.data || 'Executor stream failed'))
      }

      if (payload.event === 'completion') {
        const content = typeof payload.content === 'string' ? payload.content : ''
        const completed = Boolean(payload.completed)
        if (!completed && content) {
          text += content
          await options.onDelta(content)
        }
        else if (completed && content && content.length > text.length) {
          text = content
        }
      }
    }
  }

  return text
}

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const sessionId = requireSessionId(event)
  const body = await readBody<StreamBody>(event)
  const requestId = String(body?.request_id || '').trim()

  if (!requestId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'request_id is required',
    })
  }

  const queued = await getChatTurnByRequestId(event, userId, sessionId, requestId)
  if (!queued) {
    throw createError({
      statusCode: 404,
      statusMessage: 'turn not found',
    })
  }

  const encoder = new TextEncoder()
  let closed = false
  let disconnected = false

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let seq = 0
      const lockOwner = `${requestId}:${Math.random().toString(36).slice(2, 8)}`

      const close = () => {
        if (closed) {
          return
        }
        closed = true
        controller.close()
      }

      const emit = (payload: Record<string, unknown>) => {
        if (closed || disconnected) {
          return
        }
        seq += 1
        const data = {
          session_id: sessionId,
          seq,
          ...payload,
        }
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }
        catch {
          disconnected = true
        }
      }

      const emitDone = () => {
        if (closed || disconnected) {
          return
        }
        try {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        }
        catch {
          disconnected = true
        }
      }

      const run = async () => {
        let lastQueuedPos = -1
        let assistantText = ''

        try {
          const acceptedQueuePos = await getQueuePosition(event, userId, sessionId, requestId)
          emit({
            event: 'turn.accepted',
            phase: 'reply',
            request_id: requestId,
            turn_id: queued.turnId,
            queue_pos: acceptedQueuePos,
          })
          if (queued.status === 'pending') {
            await updateChatTurnStatus(event, userId, sessionId, requestId, 'accepted')
          }

          while (true) {
            const row = await getChatTurnByRequestId(event, userId, sessionId, requestId)
            if (!row) {
              throw new Error('turn not found')
            }

            if (row.status === 'completed') {
              emit({
                event: 'turn.completed',
                phase: 'reply',
                request_id: requestId,
                turn_id: row.turnId,
                queue_pos: 0,
                message: row.responseText,
              })
              emitDone()
              close()
              return
            }

            if (row.status === 'failed') {
              emit({
                event: 'turn.failed',
                phase: 'reply',
                request_id: requestId,
                turn_id: row.turnId,
                queue_pos: 0,
                message: row.errorText || 'Turn failed',
              })
              emitDone()
              close()
              return
            }

            const queuePos = await getQueuePosition(event, userId, sessionId, requestId)
            if (queuePos > 0) {
              if (queuePos !== lastQueuedPos) {
                emit({
                  event: 'turn.queued',
                  phase: 'reply',
                  request_id: requestId,
                  turn_id: row.turnId,
                  queue_pos: queuePos,
                })
                lastQueuedPos = queuePos
              }
              await sleep(200)
              continue
            }

            if (!tryAcquireSessionExecutionLock(sessionId, lockOwner)) {
              await sleep(150)
              continue
            }

            try {
              const head = await pickSessionHeadTurn(event, userId, sessionId)
              if (!head || head.requestId !== requestId) {
                await sleep(120)
                continue
              }

              await updateChatTurnStatus(event, userId, sessionId, requestId, 'executing')
              emit({
                event: 'turn.started',
                phase: 'reply',
                request_id: requestId,
                turn_id: row.turnId,
                queue_pos: 0,
              })

              const parsedPayload = JSON.parse(row.payload || '{}') as TurnPayload
              parsedPayload.chat_id = sessionId
              assistantText = await proxyExecutorStream({
                event,
                payload: parsedPayload,
                onDelta: async (delta) => {
                  emit({
                    event: 'turn.delta',
                    phase: 'reply',
                    request_id: requestId,
                    turn_id: row.turnId,
                    queue_pos: 0,
                    delta,
                  })
                },
              })

              await updateChatTurnStatus(event, userId, sessionId, requestId, 'completed', {
                responseText: assistantText,
              })

              emit({
                event: 'turn.completed',
                phase: 'reply',
                request_id: requestId,
                turn_id: row.turnId,
                queue_pos: 0,
                message: assistantText,
              })

              const store = createPilotStoreAdapter(event, userId)
              await store.runtime.ensureSchema()
              const session = await store.runtime.getSession(sessionId)
              const needsTitle = row.turnNo === 1 && !String(session?.title || '').trim()
              if (needsTitle) {
                await updateChatTurnStatus(event, userId, sessionId, requestId, 'title', {
                  responseText: assistantText,
                })

                try {
                  const selectedChannel = await resolvePilotChannelSelection(event)
                  const titleModel = String(parsedPayload.model || selectedChannel.channel.model || '').trim() || 'gpt-5.2'
                  const messages = await store.runtime.listMessages(sessionId)
                  const result = await generateTitle({
                    baseUrl: selectedChannel.channel.baseUrl,
                    apiKey: selectedChannel.channel.apiKey,
                    model: titleModel,
                    messages: messages.map(item => ({
                      role: item.role,
                      content: item.content,
                    })),
                  })

                  if (result.title) {
                    await store.runtime.setSessionTitle(sessionId, result.title)
                  }

                  emit({
                    event: 'title.generated',
                    phase: 'title',
                    request_id: requestId,
                    turn_id: row.turnId,
                    queue_pos: 0,
                    title: result.title,
                    source: result.source,
                    generated: result.generated,
                  })
                }
                catch (error) {
                  emit({
                    event: 'title.failed',
                    phase: 'title',
                    request_id: requestId,
                    turn_id: row.turnId,
                    queue_pos: 0,
                    message: toErrorMessage(error),
                  })
                }
                finally {
                  await updateChatTurnStatus(event, userId, sessionId, requestId, 'completed', {
                    responseText: assistantText,
                  })
                }
              }

              emitDone()
              close()
              return
            }
            finally {
              releaseSessionExecutionLock(sessionId, lockOwner)
            }
          }
        }
        catch (error) {
          await updateChatTurnStatus(event, userId, sessionId, requestId, 'failed', {
            responseText: assistantText,
            errorText: toErrorMessage(error),
          })
          emit({
            event: 'turn.failed',
            phase: 'reply',
            request_id: requestId,
            turn_id: queued.turnId,
            queue_pos: 0,
            message: toErrorMessage(error),
          })
          emitDone()
          close()
        }
      }

      void run()
    },
    cancel() {
      disconnected = true
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'connection': 'keep-alive',
    },
  })
})
