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
import { requirePilotAuth } from '../../../../utils/auth'
import {
  getPilotAdminRoutingConfig,
} from '../../../../utils/pilot-admin-routing-config'
import {
  PilotAttachmentDeliveryError,
  resolvePilotAttachmentDeliveriesOrThrow,
} from '../../../../utils/pilot-attachment-delivery'
import {
  getPilotAttachmentObject,
  resolvePilotAttachmentModelUrl,
} from '../../../../utils/pilot-attachment-storage'
import { requireSessionId, toErrorMessage } from '../../../../utils/pilot-http'
import { resolveLangGraphOrchestratorDecision } from '../../../../utils/pilot-langgraph-orchestrator'
import { markRouteFailure, markRouteSuccess } from '../../../../utils/pilot-route-health'
import { recordPilotRoutingMetric } from '../../../../utils/pilot-routing-metrics'
import { resolvePilotRoutingSelection } from '../../../../utils/pilot-routing-resolver'
import { createPilotRuntime } from '../../../../utils/pilot-runtime'
import { getPilotStoreMetricsSnapshot } from '../../../../utils/pilot-store'

interface StreamBody {
  message?: string
  fromSeq?: number
  follow?: boolean
  channelId?: string
  modelId?: string
  routeComboId?: string
  internet?: boolean
  thinking?: boolean
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

function getWaitUntilHandler(event: H3Event): ((promise: Promise<unknown>) => void) | null {
  const eventLike = event as unknown as {
    waitUntil?: (promise: Promise<unknown>) => void
    context?: {
      waitUntil?: (promise: Promise<unknown>) => void
    }
  }

  if (typeof eventLike.waitUntil === 'function') {
    return eventLike.waitUntil.bind(eventLike)
  }

  if (typeof eventLike.context?.waitUntil === 'function') {
    return eventLike.context.waitUntil.bind(eventLike.context)
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
): Promise<{
  attachments: UserMessageAttachment[]
  summary: Record<string, unknown>
}> {
  if (!Array.isArray(inputAttachments) || inputAttachments.length <= 0) {
    return {
      attachments: [],
      summary: {
        total: 0,
        resolved: 0,
        unresolved: 0,
        idCount: 0,
        urlCount: 0,
        base64Count: 0,
        loadedObjectCount: 0,
        inlinedImageBytes: 0,
        inlinedFileBytes: 0,
      },
    }
  }

  const records = await storeRuntime.listAttachments(sessionId)
  const recordMap = new Map(records.map(item => [item.id, item]))
  const deliveryInputs = await Promise.all(
    inputAttachments.map(async (item) => {
      const attachmentId = String(item?.id || '').trim()
      if (!attachmentId) {
        return null
      }
      const record = recordMap.get(attachmentId)
      if (!record) {
        return null
      }

      const modelUrl = await resolvePilotAttachmentModelUrl(event, {
        sessionId,
        attachmentId: record.id,
        ref: record.ref,
      })

      return {
        id: record.id,
        type: record.kind,
        ref: record.ref,
        name: record.name,
        mimeType: record.mimeType,
        size: record.size,
        modelUrl,
        previewUrl: modelUrl,
        loadObject: async () => {
          const object = await getPilotAttachmentObject(event, record.ref)
          if (!object) {
            return null
          }
          return {
            bytes: object.bytes,
            mimeType: object.mimeType,
            size: object.size,
          }
        },
      }
    }),
  )

  const normalizedInputs = deliveryInputs.filter((item): item is NonNullable<typeof item> => Boolean(item))
  const resolved = await resolvePilotAttachmentDeliveriesOrThrow(normalizedInputs, {
    concurrency: 3,
  })
  return {
    attachments: resolved.attachments,
    summary: resolved.summary as unknown as Record<string, unknown>,
  }
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
  const selectedChannel = await resolvePilotRoutingSelection(event, {
    requestChannelId: String(body?.channelId || '').trim(),
    requestedModelId: String(body?.modelId || '').trim(),
    routeComboId: String(body?.routeComboId || '').trim(),
    internet: body?.internet,
    thinking: body?.thinking,
  })

  const message = String(body?.message || '').trim()
  const inputAttachments = Array.isArray(body?.attachments) ? body.attachments : undefined
  const hasInputAttachments = Boolean(inputAttachments && inputAttachments.length > 0)
  const persistStreamLifecycle = Boolean(message) || hasInputAttachments
  const fromSeq = Number.isFinite(body?.fromSeq)
    ? Math.max(1, Math.floor(Number(body?.fromSeq)))
    : undefined
  const follow = normalizeFollowFlag(body || {}, fromSeq)

  if (!message && !fromSeq && !hasInputAttachments) {
    throw createError({
      statusCode: 400,
      statusMessage: 'message, attachments or fromSeq is required',
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
        const runStartedAt = Date.now()
        const shouldRecordRoutingMetric = Boolean(message)
        let firstDeltaAt = 0
        let ttftMs = 0
        let outputChars = 0
        let metricSuccess = false
        let metricFinishReason = 'failed'
        let metricErrorCode = ''
        const routingConfig = await getPilotAdminRoutingConfig(event).catch(() => null)
        const healthPolicy = {
          failureThreshold: routingConfig?.lbPolicy?.circuitBreakerFailureThreshold ?? 3,
          cooldownMs: routingConfig?.lbPolicy?.circuitBreakerCooldownMs ?? 60_000,
          halfOpenProbeCount: routingConfig?.lbPolicy?.halfOpenProbeCount ?? 1,
        }
        const orchestratorDecision = await resolveLangGraphOrchestratorDecision(
          event,
          selectedChannel.routeComboId || 'default-auto',
        )

        const { runtime, store } = createPilotRuntime({
          event,
          userId,
          channel: {
            channelId: selectedChannel.channelId,
            baseUrl: selectedChannel.channel.baseUrl,
            apiKey: selectedChannel.channel.apiKey,
            model: selectedChannel.providerModel || selectedChannel.channel.model,
            adapter: selectedChannel.adapter,
            transport: selectedChannel.transport,
            timeoutMs: selectedChannel.channel.timeoutMs,
            builtinTools: selectedChannel.builtinTools,
          },
          orchestrator: {
            mode: orchestratorDecision.mode,
            endpoint: orchestratorDecision.endpoint,
            apiKey: orchestratorDecision.apiKey,
            assistantId: orchestratorDecision.assistantId,
            graphProfile: orchestratorDecision.graphProfile,
          },
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
        const rawEmitEvent = streamEmitter.emit
        const emitEvent = async (
          payload: Omit<PilotStreamEvent, 'sessionId' | 'timestamp'> & { sessionId?: string, timestamp?: number },
          emitOptions?: {
            persist?: boolean
            tracePayload?: Record<string, unknown>
          },
        ) => {
          if (shouldRecordRoutingMetric) {
            const eventType = String(payload?.type || '').trim()
            if (eventType === 'assistant.delta') {
              const delta = typeof payload.delta === 'string'
                ? payload.delta
                : ''
              if (!firstDeltaAt && delta) {
                firstDeltaAt = Date.now()
                ttftMs = Math.max(0, firstDeltaAt - runStartedAt)
              }
              outputChars += delta.length
            }
            else if (eventType === 'assistant.final') {
              const finalMessage = typeof payload.message === 'string'
                ? payload.message
                : ''
              if (!firstDeltaAt && finalMessage) {
                firstDeltaAt = Date.now()
                ttftMs = Math.max(0, firstDeltaAt - runStartedAt)
              }
              if (outputChars <= 0 && finalMessage) {
                outputChars = finalMessage.length
              }
            }
            else if (eventType === 'error') {
              const detail = payload.detail && typeof payload.detail === 'object'
                ? payload.detail as Record<string, unknown>
                : {}
              metricErrorCode = String(detail.code || payload.message || 'PILOT_STREAM_ERROR')
              metricFinishReason = 'runtime_error'
            }
          }
          return await rawEmitEvent(payload, emitOptions)
        }

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

          await emitEvent({
            type: 'run.audit',
            payload: {
              auditType: 'routing.selection',
              channelId: selectedChannel.channelId,
              modelId: selectedChannel.modelId,
              providerModel: selectedChannel.providerModel,
              routeComboId: selectedChannel.routeComboId,
              selectionSource: selectedChannel.selectionSource,
              selectionReason: selectedChannel.selectionReason,
              internet: selectedChannel.internet,
              thinking: selectedChannel.thinking,
              builtinTools: selectedChannel.builtinTools,
              orchestratorMode: orchestratorDecision.mode,
              orchestratorReason: orchestratorDecision.reason,
              orchestratorAssistantId: orchestratorDecision.assistantId,
              orchestratorGraphProfile: orchestratorDecision.graphProfile,
            },
          }, persistStreamLifecycle
            ? {
                persist: true,
                tracePayload: {
                  auditType: 'routing.selection',
                  channelId: selectedChannel.channelId,
                  modelId: selectedChannel.modelId,
                  providerModel: selectedChannel.providerModel,
                  routeComboId: selectedChannel.routeComboId,
                  selectionSource: selectedChannel.selectionSource,
                  selectionReason: selectedChannel.selectionReason,
                  internet: selectedChannel.internet,
                  thinking: selectedChannel.thinking,
                  orchestratorMode: orchestratorDecision.mode,
                  orchestratorReason: orchestratorDecision.reason,
                  orchestratorAssistantId: orchestratorDecision.assistantId,
                  orchestratorGraphProfile: orchestratorDecision.graphProfile,
                },
              }
            : undefined)

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

          let resolvedAttachments: {
            attachments: UserMessageAttachment[]
            summary: Record<string, unknown>
          } = {
            attachments: [],
            summary: {
              total: 0,
              resolved: 0,
              unresolved: 0,
              idCount: 0,
              urlCount: 0,
              base64Count: 0,
              loadedObjectCount: 0,
              inlinedImageBytes: 0,
              inlinedFileBytes: 0,
            },
          }

          if (hasInputAttachments) {
            const attachmentResolveStartedAt = Date.now()
            await emitEvent({
              type: 'run.audit',
              payload: {
                auditType: 'attachment.resolve.start',
                attachmentCount: inputAttachments?.length || 0,
              },
            }, persistStreamLifecycle
              ? {
                  persist: true,
                  tracePayload: {
                    auditType: 'attachment.resolve.start',
                    attachmentCount: inputAttachments?.length || 0,
                  },
                }
              : undefined)

            try {
              resolvedAttachments = await resolveMessageAttachments(
                event,
                sessionId,
                store.runtime,
                inputAttachments,
              )

              await emitEvent({
                type: 'run.audit',
                payload: {
                  auditType: 'attachment.resolve.end',
                  status: 'ok',
                  durationMs: Date.now() - attachmentResolveStartedAt,
                  ...resolvedAttachments.summary,
                },
              }, persistStreamLifecycle
                ? {
                    persist: true,
                    tracePayload: {
                      auditType: 'attachment.resolve.end',
                      status: 'ok',
                      durationMs: Date.now() - attachmentResolveStartedAt,
                      ...resolvedAttachments.summary,
                    },
                  }
                : undefined)

              await emitEvent({
                type: 'run.audit',
                payload: {
                  auditType: 'attachment.delivery.summary',
                  ...resolvedAttachments.summary,
                },
              }, persistStreamLifecycle
                ? {
                    persist: true,
                    tracePayload: {
                      auditType: 'attachment.delivery.summary',
                      ...resolvedAttachments.summary,
                    },
                  }
                : undefined)
            }
            catch (error) {
              if (error instanceof PilotAttachmentDeliveryError) {
                const durationMs = Date.now() - attachmentResolveStartedAt
                await emitEvent({
                  type: 'run.audit',
                  payload: {
                    auditType: 'attachment.resolve.end',
                    status: 'failed',
                    code: error.code,
                    durationMs,
                    failureCount: error.failures.length,
                    ...error.summary,
                  },
                }, persistStreamLifecycle
                  ? {
                      persist: true,
                      tracePayload: {
                        auditType: 'attachment.resolve.end',
                        status: 'failed',
                        code: error.code,
                        durationMs,
                        failureCount: error.failures.length,
                        ...error.summary,
                      },
                    }
                  : undefined)

                await emitEvent({
                  type: 'run.audit',
                  payload: {
                    auditType: 'attachment.delivery.summary',
                    status: 'failed',
                    code: error.code,
                    failureCount: error.failures.length,
                    ...error.summary,
                  },
                }, persistStreamLifecycle
                  ? {
                      persist: true,
                      tracePayload: {
                        auditType: 'attachment.delivery.summary',
                        status: 'failed',
                        code: error.code,
                        failureCount: error.failures.length,
                        ...error.summary,
                      },
                    }
                  : undefined)

                throw createError({
                  statusCode: 422,
                  statusMessage: error.message,
                  data: {
                    code: error.code,
                    failures: error.failures,
                    summary: error.summary,
                  },
                })
              }
              throw error
            }
          }

          const result = await runPilotConversationStream({
            runtime,
            sessionId,
            message,
            fromSeq,
            attachments: resolvedAttachments.attachments,
            metadata: toPilotSafeRecord({
              ...(body?.metadata || {}),
              modelId: selectedChannel.modelId,
              providerModel: selectedChannel.providerModel,
              routeComboId: selectedChannel.routeComboId,
              selectionSource: selectedChannel.selectionSource,
              selectionReason: selectedChannel.selectionReason,
              internet: selectedChannel.internet,
              thinking: selectedChannel.thinking,
              builtinTools: selectedChannel.builtinTools,
              orchestratorMode: orchestratorDecision.mode,
              orchestratorReason: orchestratorDecision.reason,
              orchestratorAssistantId: orchestratorDecision.assistantId,
              orchestratorGraphProfile: orchestratorDecision.graphProfile,
            }),
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

          if (shouldRecordRoutingMetric) {
            metricSuccess = !result.aborted
            metricFinishReason = result.aborted ? 'paused' : 'completed'
            if (result.aborted && !metricErrorCode) {
              metricErrorCode = 'PILOT_STREAM_ABORTED'
            }
          }

          const runtimePersistMetrics = runtime.getAndResetRuntimePersistMetrics?.(sessionId) || null
          const storeMetrics = getPilotStoreMetricsSnapshot(event)
          const persistSummaryPayload = {
            metricType: 'persist.summary',
            runtimeDeltaPersistBatchCount: runtimePersistMetrics?.deltaPersistBatchCount ?? 0,
            runtimeDeltaPersistChars: runtimePersistMetrics?.deltaPersistChars ?? 0,
            runtimeDeltaPersistAvgChars: runtimePersistMetrics?.deltaPersistAvgChars ?? 0,
            runtimeTracePersistCount: runtimePersistMetrics?.runtimeTracePersistCount ?? 0,
            storeAppendTraceCount: storeMetrics.appendTraceCount,
            hasMessage: Boolean(message),
          }

          await emitEvent({
            type: 'run.metrics',
            payload: persistSummaryPayload,
          })

          console.log('[pilot-stream-persist]', JSON.stringify({
            sessionIdTail: sessionId.slice(-8),
            ...persistSummaryPayload,
          }))

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
          if (shouldRecordRoutingMetric) {
            metricSuccess = false
            metricFinishReason = 'error'
            metricErrorCode = String(detail.code || detail.statusCode || 'PILOT_STREAM_ERROR')
          }
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
          if (shouldRecordRoutingMetric) {
            const totalDurationMs = Math.max(0, Date.now() - runStartedAt)
            const resolvedTtftMs = ttftMs > 0
              ? ttftMs
              : (metricSuccess && outputChars > 0 ? totalDurationMs : 0)

            try {
              if (metricSuccess) {
                markRouteSuccess(selectedChannel.routeKey)
              }
              else {
                markRouteFailure(selectedChannel.routeKey, healthPolicy)
              }
            }
            catch (error) {
              console.warn('[pilot-stream-routing-health] failed', error)
            }

            try {
              await recordPilotRoutingMetric(event, {
                sessionId,
                userId,
                modelId: selectedChannel.modelId,
                routeComboId: selectedChannel.routeComboId,
                channelId: selectedChannel.channelId,
                providerModel: selectedChannel.providerModel,
                queueWaitMs: 0,
                ttftMs: resolvedTtftMs,
                totalDurationMs,
                outputChars,
                success: metricSuccess,
                errorCode: metricSuccess ? '' : metricErrorCode,
                finishReason: metricFinishReason,
                metadata: {
                  source: 'pilot-chat-stream',
                  selectionSource: selectedChannel.selectionSource,
                  selectionReason: selectedChannel.selectionReason,
                  adapter: selectedChannel.adapter,
                  transport: selectedChannel.transport,
                  internet: selectedChannel.internet,
                  thinking: selectedChannel.thinking,
                  builtinTools: selectedChannel.builtinTools,
                  orchestratorMode: orchestratorDecision.mode,
                  orchestratorReason: orchestratorDecision.reason,
                  orchestratorAssistantId: orchestratorDecision.assistantId,
                  orchestratorGraphProfile: orchestratorDecision.graphProfile,
                },
              })
            }
            catch (error) {
              console.warn('[pilot-stream-routing-metrics] failed', error)
            }
          }
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
