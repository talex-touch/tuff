import { requireAdmin } from '../../../../utils/auth'
import { touchRuntimeSessionHeartbeat } from '../../../../utils/tuffIntelligenceRuntimeStore'
import {
  orchestrateIntelligenceLabStream,
  pauseIntelligenceLabSession,
} from '../../../../utils/tuffIntelligenceLabService'

const SSE_KEEPALIVE_MS = 10_000

function resolveErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const statusMessage = (error as { statusMessage?: string }).statusMessage
    if (typeof statusMessage === 'string' && statusMessage.trim()) {
      return statusMessage
    }
    const message = (error as { message?: string }).message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }
  return 'Intelligence stream failed.'
}

function formatErrorDetail(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
      cause: (error as { cause?: unknown }).cause,
    }
  }
  if (error && typeof error === 'object') {
    return { ...(error as Record<string, unknown>) }
  }
  return { message: String(error || 'unknown error') }
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody<{
    message?: string
    sessionId?: string
    history?: unknown
    timeoutMs?: number
    heartbeatTimeoutMs?: number
  }>(event)

  const message = String(body?.message || '').trim()
  if (!message) {
    throw createError({
      statusCode: 400,
      statusMessage: 'message is required',
    })
  }

  const encoder = new TextEncoder()
  let disconnected = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let doneSent = false
      const targetSessionId = String(body?.sessionId || '').trim()
      let activeSessionId = targetSessionId
      let keepaliveTimer: ReturnType<typeof setInterval> | null = null

      const stopKeepalive = () => {
        if (keepaliveTimer) {
          clearInterval(keepaliveTimer)
          keepaliveTimer = null
        }
      }

      const touchHeartbeat = async () => {
        if (!activeSessionId) {
          return
        }
        try {
          await touchRuntimeSessionHeartbeat(event, {
            sessionId: activeSessionId,
            userId,
          })
        } catch {
          // ignore keepalive heartbeat failures
        }
      }

      const send = (payload: Record<string, unknown>) => {
        if (closed) {
          return
        }
        if (typeof payload.sessionId === 'string' && payload.sessionId.trim()) {
          activeSessionId = payload.sessionId.trim()
        }
        if (payload.type === 'done') {
          doneSent = true
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
        void touchHeartbeat()
      }

      const close = () => {
        if (closed) {
          return
        }
        closed = true
        stopKeepalive()
        controller.close()
      }

      keepaliveTimer = setInterval(() => {
        if (closed) {
          return
        }
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`))
        } catch {
          // ignore keepalive stream write failures
        }
        void touchHeartbeat()
      }, SSE_KEEPALIVE_MS)

      const run = async () => {
        try {
          await orchestrateIntelligenceLabStream(
            event,
            userId,
            {
              message: message || undefined,
              sessionId: typeof body?.sessionId === 'string' ? body.sessionId : undefined,
              history: body?.history,
              timeoutMs: typeof body?.timeoutMs === 'number' ? body.timeoutMs : undefined,
              heartbeatTimeoutMs: typeof body?.heartbeatTimeoutMs === 'number' ? body.heartbeatTimeoutMs : undefined,
            },
            {
              emit: async (streamEvent) => {
                send(streamEvent as unknown as Record<string, unknown>)
              },
              isDisconnected: () => disconnected,
            },
          )
        }
        catch (error) {
          const message = resolveErrorMessage(error)
          send({
            type: 'error',
            timestamp: Date.now(),
            message,
            payload: {
              i18nKey: 'dashboard.intelligenceLab.system.error',
              i18nParams: { message },
              error: formatErrorDetail(error),
            },
          })
        }
        finally {
          const pauseSessionId = activeSessionId || targetSessionId
          if (disconnected && pauseSessionId) {
            try {
              await pauseIntelligenceLabSession(event, userId, {
                sessionId: pauseSessionId,
                reason: 'client_disconnect',
              })
            } catch {
              // ignore fallback pause errors when socket already closed
            }
          }
          if (!doneSent) {
            send({
              type: 'done',
              timestamp: Date.now(),
              message: 'Stream closed.',
            })
          }
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
      Connection: 'keep-alive',
    },
  })
})
