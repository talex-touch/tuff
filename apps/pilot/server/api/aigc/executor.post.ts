import type { AgentEnvelope } from '@talex-touch/tuff-intelligence'
import type { H3Event } from 'h3'
import {
  requirePilotAuth,
} from '../../utils/auth'
import { quotaError } from '../../utils/quota-api'
import { extractLatestQuotaUserMessage } from '../../utils/quota-history-codec'
import { createPilotRuntime } from '../../utils/pilot-runtime'

interface QuotaExecutorBody {
  chat_id?: string
  model?: string
  temperature?: number
  messages?: unknown[]
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

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const body = await readBody<QuotaExecutorBody>(event)

  const chatId = String(body?.chat_id || '').trim()
  if (!chatId) {
    return quotaError(400, 'chat_id is required', null)
  }

  const message = extractLatestQuotaUserMessage(body?.messages)
  if (!message) {
    return quotaError(400, 'user message is required', null)
  }

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

        try {
          const { runtime, store } = createPilotRuntime({
            event,
            userId: auth.userId,
          })
          await store.runtime.ensureSchema()

          emit({
            event: 'status_updated',
            status: 'start',
            id: 'assistant',
          })

          for await (const envelope of runtime.onMessage({
            sessionId: chatId,
            message,
            metadata: {
              source: 'quota-executor',
              model: String(body?.model || ''),
              temperature: Number(body?.temperature ?? 0.5),
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
              emit({
                event: 'completion',
                id: 'assistant',
                name: 'assistant',
                content: completedText,
                completed: true,
              })
              completedSent = true
            }
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
            message: error instanceof Error ? error.message : 'executor failed',
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
