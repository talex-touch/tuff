import type { AgentEnvelope } from '@talex-touch/tuff-intelligence'
import type { H3Event } from 'h3'
import { requirePilotAuth } from '../../utils/auth'
import {
  rememberAutoChannelTransport,
  resolvePilotChannelSelection,
  shouldFallbackToChatCompletions,
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

function mapExecutorErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || 'executor failed')
  if (raw.includes('530 status code')) {
    return '上游 AIAPI 不可达，请检查 NUXT_PILOT_BASE_URL 与 NUXT_PILOT_API_KEY'
  }
  return raw
}

function getWaitUntilHandler(event: H3Event): ((promise: Promise<unknown>) => void) | null {
  const eventLike = event as unknown as {
    waitUntil?: (promise: Promise<unknown>) => void
    context?: {
      waitUntil?: (promise: Promise<unknown>) => void
      cloudflare?: {
        context?: {
          waitUntil?: (promise: Promise<unknown>) => void
        }
      }
    }
  }

  if (typeof eventLike.waitUntil === 'function') {
    return eventLike.waitUntil.bind(eventLike)
  }
  if (typeof eventLike.context?.waitUntil === 'function') {
    return eventLike.context.waitUntil.bind(eventLike.context)
  }
  if (typeof eventLike.context?.cloudflare?.context?.waitUntil === 'function') {
    return eventLike.context.cloudflare.context.waitUntil.bind(eventLike.context.cloudflare.context)
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

  let selectedChannel = resolvePilotChannelSelection(event, {
    requestChannelId: String(body?.channel_id || '').trim(),
    sessionChannelId: existingSession?.channelId,
  })

  await upsertPilotQuotaSession(event, {
    chatId,
    userId: auth.userId,
    runtimeSessionId,
    channelId: selectedChannel.channelId,
    topic: String(body?.topic || existingSession?.topic || '').trim() || '新的聊天',
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

        try {
          emit({
            event: 'session_bound',
            chat_id: chatId,
            runtime_session_id: runtimeSessionId,
            channel_id: selectedChannel.channelId,
            transport: selectedChannel.transport,
          })

          emit({
            event: 'status_updated',
            status: 'start',
            id: 'assistant',
          })

          const runWithChannel = async () => {
            const { runtime, store } = createPilotRuntime({
              event,
              userId: auth.userId,
              channel: {
                channelId: selectedChannel.channelId,
                baseUrl: selectedChannel.channel.baseUrl,
                apiKey: selectedChannel.channel.apiKey,
                model: String(body?.model || '').trim() || selectedChannel.channel.model,
                transport: selectedChannel.transport,
                builtinTools: selectedChannel.channel.builtinTools,
              },
            })
            await store.runtime.ensureSchema()

            for await (const envelope of runtime.onMessage({
              sessionId: runtimeSessionId,
              message,
              metadata: {
                source: 'quota-executor',
                model: String(body?.model || '').trim() || selectedChannel.channel.model,
                temperature: Number(body?.temperature ?? 0.5),
                channelId: selectedChannel.channelId,
                channelTransport: selectedChannel.transport,
              },
            })) {
              if (closed) {
                return
              }

              if (envelope.type === 'assistant.delta') {
                const delta = getEnvelopeText(envelope)
                if (!delta) {
                  continue
                }
                completedText += delta
                streamedDelta = true

                emit({
                  event: 'status_updated',
                  status: 'progress',
                  id: 'assistant',
                })
                emit({
                  event: 'completion',
                  id: 'assistant',
                  name: 'assistant',
                  content: delta,
                  completed: false,
                })
                continue
              }

              if (envelope.type === 'assistant.final') {
                const finalText = getEnvelopeText(envelope) || completedText
                completedText = finalText

                // Some upstream providers may only emit `assistant.final` without deltas.
                // Convert final text into small pseudo-deltas so Quota UI keeps streaming behavior.
                if (!streamedDelta && completedText) {
                  for (const chunk of splitTextIntoChunks(completedText)) {
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

                emit({
                  event: 'completion',
                  id: 'assistant',
                  name: 'assistant',
                  content: completedText,
                  completed: true,
                })
                completedSent = true
                continue
              }

              if (envelope.type === 'capability.call' || envelope.type === 'capability.result') {
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
                const payload = envelope.payload && typeof envelope.payload === 'object'
                  ? (envelope.payload as Record<string, unknown>)
                  : {}
                emit({
                  event: 'error',
                  status: 'failed',
                  message: String(payload.message || payload.code || 'run error'),
                })
              }
            }
          }

          try {
            await runWithChannel()
            if (selectedChannel.channel.transport === 'auto' && selectedChannel.transport === 'responses') {
              rememberAutoChannelTransport(event, selectedChannel.channelId, 'responses')
            }
          }
          catch (error) {
            const canFallback = selectedChannel.channel.transport === 'auto'
              && selectedChannel.transport === 'responses'
              && shouldFallbackToChatCompletions(error)

            if (!canFallback) {
              throw error
            }

            rememberAutoChannelTransport(event, selectedChannel.channelId, 'chat.completions')
            selectedChannel = resolvePilotChannelSelection(event, {
              requestChannelId: selectedChannel.channelId,
              sessionChannelId: selectedChannel.channelId,
            })

            emit({
              event: 'status_updated',
              status: 'verbose',
              id: 'assistant',
              name: 'transport',
              data: 'responses unavailable, fallback to chat.completions',
            })

            await runWithChannel()
          }

          if (!completedSent && completedText) {
            emit({
              event: 'completion',
              id: 'assistant',
              name: 'assistant',
              content: completedText,
              completed: true,
            })
          }

          const previous = await getQuotaHistory(event, auth.userId, chatId)
          const snapshot = buildQuotaConversationSnapshot({
            chatId,
            messages: body?.messages,
            assistantReply: completedText,
            topicHint: String(body?.topic || '').trim() || previous?.topic,
            previousValue: previous?.value,
          })

          await upsertQuotaHistory(event, {
            chatId,
            userId: auth.userId,
            topic: snapshot.topic,
            value: snapshot.value,
            meta: previous?.meta || '',
          })

          await upsertPilotQuotaSession(event, {
            chatId,
            userId: auth.userId,
            runtimeSessionId,
            channelId: selectedChannel.channelId,
            topic: snapshot.topic,
          })

          emit({
            event: 'status_updated',
            status: 'end',
            id: 'assistant',
          })
        }
        catch (error) {
          emit({
            event: 'error',
            status: 'failed',
            message: mapExecutorErrorMessage(error),
          })
        }
        finally {
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
