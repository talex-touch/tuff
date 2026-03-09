import type {
  CreatePilotStreamEmitterOptions,
  DeepAgentAuditRecord,
  PilotStreamEvent,
  TraceRecord,
  UserMessageAttachment,
  UserMessageInput,
} from '@talex-touch/tuff-intelligence'
import type { H3Event } from 'h3'
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
import {
  getPilotAttachmentObject,
  resolvePilotAttachmentModelUrl,
} from '../../../../../utils/pilot-attachment-storage'
import { requireSessionId, toErrorMessage } from '../../../../../utils/pilot-http'
import { createPilotRuntime } from '../../../../../utils/pilot-runtime'

interface StreamBody {
  message?: string
  fromSeq?: number
  follow?: boolean
  metadata?: Record<string, unknown>
  attachments?: UserMessageInput['attachments']
}

interface StreamEventPayload extends PilotStreamEvent {
  sessionId: string
  timestamp: number
}

interface StreamConnectionContext {
  closed: boolean
  disconnected: boolean
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  if (bytes.length <= 0) {
    return ''
  }

  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
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

function normalizeFollowFlag(body: StreamBody, fromSeq: number | undefined): boolean {
  if (!Number.isFinite(fromSeq)) {
    return false
  }
  return body.follow !== false
}

function mapTraceToStreamEvent(trace: TraceRecord): Omit<PilotStreamEvent, 'sessionId' | 'timestamp'> {
  const payload = toPilotSafeRecord(trace.payload)
  const text = String(payload.text || '')

  if (trace.type === 'assistant.delta') {
    return {
      type: 'assistant.delta',
      seq: trace.seq,
      delta: text,
      payload,
    }
  }

  if (trace.type === 'assistant.final') {
    return {
      type: 'assistant.final',
      seq: trace.seq,
      message: text,
      payload,
    }
  }

  if (trace.type === 'error') {
    return {
      type: 'error',
      seq: trace.seq,
      message: String(payload.message || 'Stream error'),
      detail: toPilotSafeRecord(payload.detail),
      payload,
    }
  }

  return {
    type: trace.type,
    seq: trace.seq,
    payload,
  }
}

async function resolveMessageAttachments(
  event: H3Event,
  sessionId: string,
  storeRuntime: {
    listAttachments: (sessionId: string) => Promise<Array<{
      id: string
      kind: 'image' | 'file'
      name: string
      mimeType: string
      size: number
      ref: string
    }>>
  },
  inputAttachments: UserMessageInput['attachments'],
): Promise<UserMessageAttachment[]> {
  if (!Array.isArray(inputAttachments) || inputAttachments.length <= 0) {
    return []
  }

  const records = await storeRuntime.listAttachments(sessionId)
  const recordMap = new Map(records.map(item => [item.id, item]))
  const result: UserMessageAttachment[] = []

  for (const item of inputAttachments) {
    const attachmentId = String(item?.id || '').trim()
    if (!attachmentId) {
      continue
    }

    const record = recordMap.get(attachmentId)
    if (!record) {
      continue
    }

    const previewUrl = await resolvePilotAttachmentModelUrl(event, {
      sessionId,
      attachmentId: record.id,
      ref: record.ref,
    })
    const hasExternalPreviewUrl = /^https?:\/\//i.test(previewUrl)

    const attachment: UserMessageAttachment = {
      id: record.id,
      type: record.kind,
      ref: record.ref,
      name: record.name,
      mimeType: record.mimeType,
      size: record.size,
      previewUrl,
    }

    if (attachment.type === 'image' && !hasExternalPreviewUrl) {
      const object = await getPilotAttachmentObject(event, record.ref)
      if (object && object.mimeType.startsWith('image/')) {
        const encoded = encodeBytesToBase64(object.bytes)
        attachment.dataUrl = `data:${object.mimeType};base64,${encoded}`
      }
    }

    result.push(attachment)
  }

  return result
}

async function followTraceTail(options: {
  storeRuntime: {
    listTrace: (sessionId: string, fromSeq?: number, limit?: number) => Promise<TraceRecord[]>
    getSession: (sessionId: string) => Promise<null | {
      status: 'idle' | 'planning' | 'executing' | 'paused_disconnect' | 'completed' | 'failed'
    }>
  }
  sessionId: string
  fromSeq: number
  emitEvent: (
    payload: Omit<PilotStreamEvent, 'sessionId' | 'timestamp'> & { sessionId?: string, timestamp?: number },
    emitOptions?: {
      persist?: boolean
      tracePayload?: Record<string, unknown>
    },
  ) => Promise<void>
  streamEmitter: {
    getSeqCursor: () => number
  }
  connection: StreamConnectionContext
}): Promise<void> {
  let nextSeq = Math.max(1, Math.floor(Number(options.fromSeq || 1)))
  nextSeq = Math.max(nextSeq, options.streamEmitter.getSeqCursor() + 1)

  while (!options.connection.closed && !options.connection.disconnected) {
    const traces = await options.storeRuntime.listTrace(options.sessionId, nextSeq, 200)

    if (traces.length > 0) {
      for (const trace of traces) {
        if (options.connection.closed || options.connection.disconnected) {
          return
        }
        await options.emitEvent(mapTraceToStreamEvent(trace))
        nextSeq = Math.max(nextSeq, Number(trace.seq || 0) + 1)
      }
      continue
    }

    const session = await options.storeRuntime.getSession(options.sessionId)
    const running = session?.status === 'executing' || session?.status === 'planning'
    if (!running) {
      return
    }

    await sleep(320)
  }
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
  const follow = normalizeFollowFlag(body || {}, fromSeq)

  if (!message && !fromSeq) {
    throw createError({
      statusCode: 400,
      statusMessage: 'message or fromSeq is required',
    })
  }

  const encoder = new TextEncoder()
  const connection: StreamConnectionContext = {
    closed: false,
    disconnected: false,
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let doneSent = false
      let keepaliveTimer: ReturnType<typeof setInterval> | null = null

      const close = () => {
        if (connection.closed) {
          return
        }
        connection.closed = true
        if (keepaliveTimer) {
          clearInterval(keepaliveTimer)
          keepaliveTimer = null
        }
        controller.close()
      }

      const sendRaw = (payload: StreamEventPayload) => {
        if (connection.closed || connection.disconnected) {
          return
        }
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(toPilotJsonSafe(payload))}\n\n`))
          if (payload.type === 'done') {
            doneSent = true
          }
        }
        catch {
          connection.disconnected = true
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
            })
          }, PILOT_DEFAULT_KEEPALIVE_MS)

          const resolvedAttachments = await resolveMessageAttachments(
            event,
            sessionId,
            store.runtime,
            Array.isArray(body?.attachments) ? body.attachments : undefined,
          )

          const result = await runPilotConversationStream({
            runtime,
            sessionId,
            message,
            fromSeq,
            attachments: resolvedAttachments,
            metadata: toPilotSafeRecord(body?.metadata),
            keepaliveMs: PILOT_DEFAULT_KEEPALIVE_MS,
            replayLimit: PILOT_DEFAULT_TRACE_REPLAY_LIMIT,
            listTrace: async (targetSessionId, targetFromSeq, limit) => {
              return await store.runtime.listTrace(targetSessionId, targetFromSeq, limit)
            },
            isCancelled: () => connection.closed,
            emit: emitEvent,
          })

          if (!message && Number.isFinite(fromSeq) && follow) {
            const followFromSeq = Number.isFinite(fromSeq) ? Number(fromSeq) : 1
            await followTraceTail({
              storeRuntime: store.runtime,
              sessionId,
              fromSeq: followFromSeq,
              emitEvent,
              streamEmitter,
              connection,
            })
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

      const runPromise = run()
      const waitUntil = getWaitUntilHandler(event)
      if (waitUntil) {
        waitUntil(runPromise)
      }
      void runPromise
    },
    cancel() {
      connection.disconnected = true
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
