import type {
  CreatePilotStreamEmitterOptions,
  DeepAgentAuditRecord,
  PilotStreamEvent,
  UserMessageInput,
} from '@talex-touch/tuff-intelligence'
import {
  createPilotStreamEmitter,
  mapPilotAuditToStreamEvent,
  PILOT_DEFAULT_KEEPALIVE_MS,
  PILOT_DEFAULT_TRACE_REPLAY_LIMIT,
  runPilotConversationStream,
  toPilotJsonSafe,
  toPilotSafeRecord,
  toPilotStreamErrorDetail,
} from '@talex-touch/tuff-intelligence'
import { createError } from 'h3'
import { requirePilotAuth } from '../../../../../utils/auth'
import { requireSessionId, toErrorMessage } from '../../../../../utils/pilot-http'
import { createPilotRuntime } from '../../../../../utils/pilot-runtime'

interface StreamBody {
  message?: string
  fromSeq?: number
  metadata?: Record<string, unknown>
  attachments?: UserMessageInput['attachments']
}

interface StreamEventPayload extends PilotStreamEvent {
  sessionId: string
  timestamp: number
}

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const sessionId = requireSessionId(event)
  const body = await readBody<StreamBody>(event)

  const message = String(body?.message || '').trim()
  const persistStreamLifecycle = Boolean(message)
  const fromSeq = Number.isFinite(body?.fromSeq)
    ? Math.max(1, Math.floor(Number(body?.fromSeq)))
    : undefined

  if (!message && !fromSeq) {
    throw createError({
      statusCode: 400,
      statusMessage: 'message or fromSeq is required',
    })
  }

  const encoder = new TextEncoder()
  let disconnected = false

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let doneSent = false
      let keepaliveTimer: ReturnType<typeof setInterval> | null = null

      const close = () => {
        if (closed) {
          return
        }
        closed = true
        if (keepaliveTimer) {
          clearInterval(keepaliveTimer)
          keepaliveTimer = null
        }
        controller.close()
      }

      const sendRaw = (payload: StreamEventPayload) => {
        if (closed || disconnected) {
          return
        }
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(toPilotJsonSafe(payload))}\n\n`))
          if (payload.type === 'done') {
            doneSent = true
          }
        }
        catch {
          disconnected = true
        }
      }

      const run = async () => {
        let emitAudit: ((record: DeepAgentAuditRecord) => Promise<void>) | null = null

        const { runtime, store } = createPilotRuntime({
          event,
          userId,
          onAudit: async (record) => {
            if (emitAudit) {
              await emitAudit(record)
            }
          },
        })
        const createStreamEmitterOptions: CreatePilotStreamEmitterOptions = {
          sessionId,
          appendRetry: 3,
          getLastSeq: async (targetSessionId) => {
            const current = await store.runtime.getSession(targetSessionId)
            return Number(current?.lastSeq || 0)
          },
          appendTrace: async (record) => {
            await store.runtime.appendTrace(record)
          },
          send: async (payload) => {
            sendRaw(payload as StreamEventPayload)
          },
        }
        const streamEmitter = createPilotStreamEmitter(createStreamEmitterOptions)
        const emitEvent = streamEmitter.emit

        try {
          await store.runtime.ensureSchema()

          let session = await store.runtime.getSession(sessionId)
          if (!session) {
            session = await store.runtime.createSession({
              sessionId,
              message: '',
              metadata: {
                source: 'pilot-stream',
              },
            })
            await store.runtime.completeSession(sessionId, 'idle')
          }
          streamEmitter.setSeqCursor(Number(session.lastSeq || 0))

          emitAudit = async (record) => {
            const auditEvent = mapPilotAuditToStreamEvent(record)
            await emitEvent(auditEvent, {
              persist: true,
              tracePayload: toPilotSafeRecord(auditEvent.payload),
            })
          }

          keepaliveTimer = setInterval(() => {
            void emitEvent({
              type: 'stream.heartbeat',
              payload: {
                ts: Date.now(),
              },
            }).catch(() => {
              disconnected = true
            })
          }, PILOT_DEFAULT_KEEPALIVE_MS)

          const result = await runPilotConversationStream({
            runtime,
            sessionId,
            message,
            fromSeq,
            attachments: Array.isArray(body?.attachments) ? body.attachments : undefined,
            metadata: toPilotSafeRecord(body?.metadata),
            keepaliveMs: PILOT_DEFAULT_KEEPALIVE_MS,
            replayLimit: PILOT_DEFAULT_TRACE_REPLAY_LIMIT,
            listTrace: async (targetSessionId, targetFromSeq, limit) => {
              return await store.runtime.listTrace(targetSessionId, targetFromSeq, limit)
            },
            isCancelled: () => closed || disconnected,
            emit: emitEvent,
          })

          if (disconnected) {
            await store.runtime.pauseSession(sessionId, 'client_disconnect')
            return
          }

          if (!doneSent) {
            await emitEvent({
              type: 'done',
              payload: {
                status: result.aborted ? 'paused' : 'ok',
              },
            }, persistStreamLifecycle
              ? {
                  persist: true,
                  tracePayload: {
                    status: result.aborted ? 'paused' : 'ok',
                  },
                }
              : undefined)
          }

          if (message && !result.aborted) {
            await store.runtime.setSessionNotification(sessionId, true)
          }
        }
        catch (error) {
          try {
            await store.runtime.pauseSession(sessionId, 'system_preempted')
            await store.runtime.completeSession(sessionId, 'failed')
          }
          catch {
            // ignore fallback status updates
          }

          const detail = toPilotStreamErrorDetail(error, 'stream.run', { sessionId })
          await emitEvent({
            type: 'error',
            message: detail.message ? String(detail.message) : toErrorMessage(error),
            detail,
            payload: detail,
          }, persistStreamLifecycle
            ? {
                persist: true,
                tracePayload: detail,
              }
            : undefined)

          if (!doneSent) {
            await emitEvent({
              type: 'done',
              payload: {
                status: 'error',
              },
            }, persistStreamLifecycle
              ? {
                  persist: true,
                  tracePayload: {
                    status: 'error',
                  },
                }
              : undefined)
          }
        }
        finally {
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
      'Connection': 'keep-alive',
    },
  })
})
