import type {
  CreatePilotStreamEmitterOptions,
  DeepAgentAuditRecord,
  PilotStreamEvent,
  TraceRecord,
  UserMessageAttachment,
  UserMessageInput,
} from '@talex-touch/tuff-intelligence/pilot'
import type { H3Event } from 'h3'
import {
  createPilotStreamEmitter,
  mapPilotAuditToStreamEvent,
  PILOT_DEFAULT_KEEPALIVE_MS,
  PILOT_DEFAULT_TRACE_REPLAY_LIMIT,
  runPilotConversationStream,
  shouldExecutePilotWebsearch,
  toPilotJsonSafe,
  toPilotSafeRecord,
  toPilotStreamErrorDetail,
} from '@talex-touch/tuff-intelligence/pilot'
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
import {
  getPilotMemoryUserPreference,
  normalizePilotMemoryPolicy,
  resolvePilotMemoryEnabled,
} from '../../../../utils/pilot-chat-memory'
import {
  extractPilotMemoryFacts,
  upsertPilotMemoryFacts,
} from '../../../../utils/pilot-memory-facts'
import { requireSessionId, toErrorMessage } from '../../../../utils/pilot-http'
import { resolvePilotIntent } from '../../../../utils/pilot-intent-resolver'
import { resolveLangGraphOrchestratorDecision } from '../../../../utils/pilot-langgraph-orchestrator'
import { ensurePilotQuotaSessionSchema, upsertPilotQuotaSession } from '../../../../utils/pilot-quota-session'
import { markRouteFailure, markRouteSuccess } from '../../../../utils/pilot-route-health'
import { recordPilotRoutingMetric } from '../../../../utils/pilot-routing-metrics'
import { resolvePilotRoutingSelection } from '../../../../utils/pilot-routing-resolver'
import { createPilotRuntime, PILOT_STRICT_MODE_UNAVAILABLE_CODE } from '../../../../utils/pilot-runtime'
import { getPilotStoreMetricsSnapshot } from '../../../../utils/pilot-store'
import { executePilotMediaWithFallback } from '../../../../utils/pilot-media-fallback'
import {
  executePilotImageGenerateTool,
  executePilotWebsearchTool,
  mergeWebsearchContextIntoMessage,
  PilotToolApprovalRejectedError,
  PilotToolApprovalRequiredError,
} from '../../../../utils/pilot-tool-gateway'
import { buildQuotaConversationSnapshot } from '../../../../utils/quota-conversation-snapshot'
import { ensureQuotaHistorySchema, getQuotaHistory, upsertQuotaHistory } from '../../../../utils/quota-history-store'

interface StreamBody {
  message?: string
  fromSeq?: number
  follow?: boolean
  channelId?: string
  modelId?: string
  routeComboId?: string
  internet?: boolean
  thinking?: boolean
  pilotMode?: boolean
  memoryEnabled?: boolean
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

function resolveMemoryUpdateReason(input: {
  memoryEnabled: boolean
  requestedMemoryEnabled: boolean | undefined
  memoryUserPreference: boolean | null
  shouldStoreByIntent: boolean
  memoryDecisionReason: string
  addedCount: number
  extractorFailed: boolean
}): 'stored' | 'disabled_by_user' | 'policy_disabled' | 'intent_skip' | 'no_fact_extracted' | 'extractor_failed' {
  if (!input.memoryEnabled) {
    if (input.requestedMemoryEnabled === false || input.memoryUserPreference === false) {
      return 'disabled_by_user'
    }
    return 'policy_disabled'
  }

  if (!input.shouldStoreByIntent) {
    if (input.memoryDecisionReason === 'intent_skip') {
      return 'intent_skip'
    }
    return 'no_fact_extracted'
  }

  if (input.extractorFailed) {
    return 'extractor_failed'
  }

  if (input.addedCount > 0) {
    return 'stored'
  }
  return 'no_fact_extracted'
}

function buildImageMarkdown(urls: string[]): string {
  const list = urls
    .map(item => String(item || '').trim())
    .filter(Boolean)
  if (list.length <= 0) {
    return ''
  }
  return list
    .map((url, index) => `![Generated image ${index + 1}](${url})`)
    .join('\n\n')
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

  if (trace.type === 'thinking.delta') {
    return {
      type: 'thinking.delta',
      seq: trace.seq,
      delta: text,
      payload,
    }
  }

  if (trace.type === 'thinking.final') {
    return {
      type: 'thinking.final',
      seq: trace.seq,
      message: text,
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

async function syncLegacyQuotaConversationFromRuntime(
  event: H3Event,
  options: {
    userId: string
    chatId: string
    channelId: string
    storeRuntime: {
      getSession: (sessionId: string) => Promise<{ title?: string | null } | null>
      listMessages: (sessionId: string) => Promise<Array<{
        role: string
        content: string
      }>>
    }
  },
): Promise<void> {
  await ensureQuotaHistorySchema(event)
  await ensurePilotQuotaSessionSchema(event)

  const session = await options.storeRuntime.getSession(options.chatId)
  if (!session) {
    return
  }

  const runtimeMessages = await options.storeRuntime.listMessages(options.chatId)
  const previous = await getQuotaHistory(event, options.userId, options.chatId)
  const snapshot = buildQuotaConversationSnapshot({
    chatId: options.chatId,
    messages: runtimeMessages.map(item => ({
      role: item.role,
      content: item.content,
    })),
    assistantReply: '',
    topicHint: String(session.title || '').trim(),
    previousValue: previous?.value || '',
  })

  await upsertQuotaHistory(event, {
    chatId: options.chatId,
    userId: options.userId,
    topic: snapshot.topic,
    value: snapshot.value,
    meta: previous?.meta || '',
  })

  await upsertPilotQuotaSession(event, {
    chatId: options.chatId,
    userId: options.userId,
    runtimeSessionId: options.chatId,
    channelId: String(options.channelId || '').trim() || 'default',
    topic: snapshot.topic,
  })
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
  const message = String(body?.message || '').trim()
  const requestedModelId = String(body?.modelId || '').trim()
  const requestedRouteComboId = String(body?.routeComboId || '').trim()
  const intentDecision = message
    ? await resolvePilotIntent({
        event,
        message,
        requestChannelId: String(body?.channelId || '').trim(),
        requestedModelId,
        routeComboId: requestedRouteComboId,
      })
    : {
        intentType: 'chat' as const,
        prompt: message,
        strategy: 'fallback' as const,
        confidence: 0,
        reason: 'empty_message',
        websearchRequired: false,
        websearchReason: 'empty_message',
        memoryDecision: {
          shouldStore: false,
          reason: 'intent_skip' as const,
        },
      }
  const routedMessage = intentDecision.prompt || message
  const selectedChannel = await resolvePilotRoutingSelection(event, {
    requestChannelId: String(body?.channelId || '').trim(),
    requestedModelId,
    routeComboId: requestedRouteComboId,
    internet: body?.internet,
    thinking: body?.thinking,
    intentType: intentDecision.intentType,
  })
  const routingConfigForMemory = await getPilotAdminRoutingConfig(event).catch(() => null)
  const memoryPolicy = normalizePilotMemoryPolicy(routingConfigForMemory?.memoryPolicy)
  const metadataRecord = body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
    ? body.metadata
    : {}
  const requestedMemoryEnabled = typeof body?.memoryEnabled === 'boolean'
    ? body.memoryEnabled
    : (typeof (metadataRecord as Record<string, unknown>).memoryEnabled === 'boolean'
        ? (metadataRecord as Record<string, unknown>).memoryEnabled as boolean
        : undefined)
  const memoryUserPreference = typeof requestedMemoryEnabled === 'boolean'
    ? null
    : await getPilotMemoryUserPreference(event, userId)
  const memoryEnabled = resolvePilotMemoryEnabled(memoryPolicy, requestedMemoryEnabled, memoryUserPreference)
  const pilotMode = body?.pilotMode === true

  const inputAttachments = Array.isArray(body?.attachments) ? body.attachments : undefined
  const hasInputAttachments = Boolean(inputAttachments && inputAttachments.length > 0)
  const persistStreamLifecycle = Boolean(routedMessage) || hasInputAttachments
  const fromSeq = Number.isFinite(body?.fromSeq)
    ? Math.max(1, Math.floor(Number(body?.fromSeq)))
    : undefined
  const follow = normalizeFollowFlag(body || {}, fromSeq)

  if (!routedMessage && !fromSeq && !hasInputAttachments) {
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
        const shouldRecordRoutingMetric = Boolean(routedMessage)
        let firstDeltaAt = 0
        let ttftMs = 0
        let outputChars = 0
        let metricSuccess = false
        let metricFinishReason = 'failed'
        let metricErrorCode = ''
        let memoryHistoryMessageCount = 0
        let memoryHistoryAfterMessageCount = 0
        let memoryAddedCount = 0
        let memoryExtractorFailed = false
        let websearchContextText = ''
        let websearchSources: Array<Record<string, unknown>> = []
        const websearchDecision = shouldExecutePilotWebsearch({
          message: routedMessage,
          intentType: intentDecision.intentType,
          internetEnabled: selectedChannel.internet,
          builtinTools: selectedChannel.builtinTools,
          intentWebsearchRequired: intentDecision.websearchRequired,
        })
        let websearchConnectorSource: 'gateway' | 'responses_builtin' | 'none' = 'none'
        let websearchConnectorReason = websearchDecision.reason
        const routingConfig = await getPilotAdminRoutingConfig(event).catch(() => null)
        const healthPolicy = {
          failureThreshold: routingConfig?.lbPolicy?.circuitBreakerFailureThreshold ?? 3,
          cooldownMs: routingConfig?.lbPolicy?.circuitBreakerCooldownMs ?? 60_000,
          halfOpenProbeCount: routingConfig?.lbPolicy?.halfOpenProbeCount ?? 1,
        }
        const orchestratorDecision = await resolveLangGraphOrchestratorDecision(
          event,
          selectedChannel.routeComboId || 'default-auto',
          {
            preferLangGraph: pilotMode,
          },
        )

        const emitMemoryUpdatedEvent = async () => {
          const messages = memoryEnabled
            ? await store.runtime.listMessages(sessionId)
            : []
          memoryHistoryAfterMessageCount = messages.length
          memoryAddedCount = 0
          memoryExtractorFailed = false
          const shouldStoreByIntent = intentDecision.memoryDecision.shouldStore === true
          if (memoryEnabled && shouldStoreByIntent && routedMessage) {
            const latestAssistantReply = messages
              .filter(item => item.role === 'assistant')
              .at(-1)?.content || ''
            try {
              const facts = await extractPilotMemoryFacts({
                message: routedMessage,
                assistantReply: latestAssistantReply,
                channel: {
                  baseUrl: selectedChannel.channel.baseUrl,
                  apiKey: selectedChannel.channel.apiKey,
                  model: selectedChannel.providerModel || selectedChannel.channel.model,
                  transport: selectedChannel.transport,
                  timeoutMs: selectedChannel.channel.timeoutMs,
                },
              })
              if (facts.length > 0) {
                const upserted = await upsertPilotMemoryFacts(event, {
                  sessionId,
                  userId,
                  sourceText: routedMessage,
                  facts,
                })
                memoryAddedCount = upserted.addedCount
              }
            }
            catch {
              memoryExtractorFailed = true
            }
          }
          const reason = resolveMemoryUpdateReason({
            memoryEnabled,
            requestedMemoryEnabled,
            memoryUserPreference,
            shouldStoreByIntent,
            memoryDecisionReason: String(intentDecision.memoryDecision.reason || '').trim(),
            addedCount: memoryAddedCount,
            extractorFailed: memoryExtractorFailed,
          })
          const stored = memoryAddedCount > 0
          await emitEvent({
            type: 'memory.updated',
            payload: {
              memoryEnabled,
              historyBefore: memoryHistoryMessageCount,
              historyAfter: memoryHistoryAfterMessageCount,
              addedCount: memoryAddedCount,
              stored,
              reason,
            },
          }, persistStreamLifecycle
            ? {
                persist: true,
                tracePayload: {
                  memoryEnabled,
                  historyBefore: memoryHistoryMessageCount,
                  historyAfter: memoryHistoryAfterMessageCount,
                  addedCount: memoryAddedCount,
                  stored,
                  reason,
                },
              }
            : undefined)
        }

        if (pilotMode && orchestratorDecision.mode !== 'langgraph-local') {
          const detail = toPilotSafeRecord({
            code: PILOT_STRICT_MODE_UNAVAILABLE_CODE,
            reason: String(orchestratorDecision.reason || '').trim() || 'pilot_strict_mode_unavailable',
            status_code: 503,
            pilot_mode: true,
            orchestrator_mode: orchestratorDecision.mode,
            orchestrator_reason: orchestratorDecision.reason,
            orchestrator_assistant_id: orchestratorDecision.assistantId,
            orchestrator_graph_profile: orchestratorDecision.graphProfile,
            orchestrator_endpoint: orchestratorDecision.endpoint,
            route_combo_id: selectedChannel.routeComboId,
            channel_id: selectedChannel.channelId,
            model_id: selectedChannel.modelId,
            provider_model: selectedChannel.providerModel,
          })
          if (shouldRecordRoutingMetric) {
            metricSuccess = false
            metricFinishReason = 'strict_mode_unavailable'
            metricErrorCode = String(detail.code || PILOT_STRICT_MODE_UNAVAILABLE_CODE)
          }
          sendRaw({
            type: 'error',
            sessionId,
            timestamp: Date.now(),
            seq: 0,
            message: 'Pilot 严格模式不可用：当前未满足 LangGraph 运行条件，请检查配置后重试。',
            detail,
            payload: detail,
          })
          if (!doneSent) {
            sendRaw({
              type: 'done',
              sessionId,
              timestamp: Date.now(),
              seq: 0,
              payload: {
                status: 'error',
              },
            })
          }
          return
        }

        const { runtime, store } = createPilotRuntime({
          event,
          userId,
          strictPilotMode: pilotMode,
          allowDeepAgentFallback: !pilotMode,
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
            reason: orchestratorDecision.reason,
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
          if (memoryEnabled) {
            memoryHistoryMessageCount = (await store.runtime.listMessages(sessionId)).length
          }
          else {
            memoryHistoryMessageCount = 0
          }

          await emitEvent({
            type: 'intent.started',
            payload: {
              messageChars: routedMessage.length,
              hasAttachments: hasInputAttachments,
            },
          }, persistStreamLifecycle
            ? {
                persist: true,
                tracePayload: {
                  messageChars: routedMessage.length,
                  hasAttachments: hasInputAttachments,
                },
              }
            : undefined)

          await emitEvent({
            type: 'intent.completed',
            payload: {
              intentType: intentDecision.intentType,
              strategy: intentDecision.strategy,
              reason: intentDecision.reason,
              confidence: intentDecision.confidence,
              websearchRequired: intentDecision.websearchRequired === true,
              websearchReason: intentDecision.websearchReason,
              memoryDecision: intentDecision.memoryDecision,
              routedPrompt: routedMessage,
            },
          }, persistStreamLifecycle
            ? {
                persist: true,
                tracePayload: {
                  intentType: intentDecision.intentType,
                  strategy: intentDecision.strategy,
                  reason: intentDecision.reason,
                  confidence: intentDecision.confidence,
                  websearchRequired: intentDecision.websearchRequired === true,
                  websearchReason: intentDecision.websearchReason,
                  memoryDecision: intentDecision.memoryDecision,
                },
              }
            : undefined)

          await emitEvent({
            type: 'routing.selected',
            payload: {
              channelId: selectedChannel.channelId,
              modelId: selectedChannel.modelId,
              providerModel: selectedChannel.providerModel,
              routeComboId: selectedChannel.routeComboId,
              selectionSource: selectedChannel.selectionSource,
              selectionReason: selectedChannel.selectionReason,
              intentType: intentDecision.intentType,
              internet: selectedChannel.internet,
              thinking: selectedChannel.thinking,
              memoryEnabled,
              memoryHistoryMessageCount,
              builtinTools: selectedChannel.builtinTools,
              transport: selectedChannel.transport,
              adapter: selectedChannel.adapter,
              orchestratorMode: orchestratorDecision.mode,
              orchestratorReason: orchestratorDecision.reason,
              orchestratorAssistantId: orchestratorDecision.assistantId,
              orchestratorGraphProfile: orchestratorDecision.graphProfile,
            },
          }, persistStreamLifecycle
            ? {
                persist: true,
                tracePayload: {
                  channelId: selectedChannel.channelId,
                  modelId: selectedChannel.modelId,
                  providerModel: selectedChannel.providerModel,
                  routeComboId: selectedChannel.routeComboId,
                  selectionSource: selectedChannel.selectionSource,
                  selectionReason: selectedChannel.selectionReason,
                  intentType: intentDecision.intentType,
                  internet: selectedChannel.internet,
                  thinking: selectedChannel.thinking,
                  memoryEnabled,
                  memoryHistoryMessageCount,
                  transport: selectedChannel.transport,
                  adapter: selectedChannel.adapter,
                  orchestratorMode: orchestratorDecision.mode,
                  orchestratorReason: orchestratorDecision.reason,
                  orchestratorAssistantId: orchestratorDecision.assistantId,
                  orchestratorGraphProfile: orchestratorDecision.graphProfile,
                },
              }
            : undefined)

          await emitEvent({
            type: 'memory.context',
            payload: {
              memoryEnabled,
              memoryHistoryMessageCount,
              memoryDecision: intentDecision.memoryDecision,
              memoryPolicyEnabledByDefault: memoryPolicy.enabledByDefault,
              memoryPolicyAllowUserDisable: memoryPolicy.allowUserDisable,
              memoryUserPreference,
            },
          }, persistStreamLifecycle
            ? {
                persist: true,
                tracePayload: {
                  memoryEnabled,
                  memoryHistoryMessageCount,
                  memoryDecision: intentDecision.memoryDecision,
                  memoryPolicyEnabledByDefault: memoryPolicy.enabledByDefault,
                  memoryPolicyAllowUserDisable: memoryPolicy.allowUserDisable,
                  memoryUserPreference,
                },
              }
            : undefined)

          await emitEvent({
            type: 'websearch.decision',
            payload: {
              enabled: websearchDecision.enabled,
              reason: websearchDecision.reason,
              intentWebsearchRequired: intentDecision.websearchRequired === true,
              intentWebsearchReason: intentDecision.websearchReason,
              internetEnabled: selectedChannel.internet,
              builtinTools: selectedChannel.builtinTools,
            },
          }, persistStreamLifecycle
            ? {
                persist: true,
                tracePayload: {
                  enabled: websearchDecision.enabled,
                  reason: websearchDecision.reason,
                  intentWebsearchRequired: intentDecision.websearchRequired === true,
                  intentWebsearchReason: intentDecision.websearchReason,
                  internetEnabled: selectedChannel.internet,
                  builtinTools: selectedChannel.builtinTools,
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

          if (intentDecision.intentType === 'image_generate' && routedMessage) {
            const imageCallRequestId = `${sessionId}_${Date.now().toString(36)}`
            const imageExecution = await executePilotMediaWithFallback({
              event,
              capability: 'image.generate',
              initialSelection: selectedChannel,
              context: {
                requestChannelId: body?.channelId,
                sessionChannelId: selectedChannel.channelId,
                requestedModelId: body?.modelId,
                routeComboId: body?.routeComboId,
                internet: false,
                thinking: false,
                intentType: intentDecision.intentType,
              },
              execute: async (routeSelection) => {
                return await executePilotImageGenerateTool({
                  event,
                  userId,
                  sessionId,
                  requestId: imageCallRequestId,
                  prompt: routedMessage,
                  channel: {
                    baseUrl: routeSelection.channel.baseUrl,
                    apiKey: routeSelection.channel.apiKey,
                    model: routeSelection.providerModel || routeSelection.channel.model,
                    adapter: routeSelection.adapter,
                    transport: routeSelection.transport,
                    timeoutMs: routeSelection.channel.timeoutMs,
                  },
                  emitAudit: async (payload) => {
                    const normalizedPayload = toPilotSafeRecord(payload)
                    await emitEvent({
                      type: 'run.audit',
                      payload: normalizedPayload,
                    }, {
                      persist: true,
                      tracePayload: normalizedPayload,
                    })
                  },
                })
              },
            })
            const imageToolResult = imageExecution.result

            const markdown = buildImageMarkdown((imageToolResult?.images || []).map(item => item.url))
            if (!markdown) {
              throw createError({
                statusCode: 502,
                statusMessage: 'Image generation returned empty output',
              })
            }

            await store.runtime.completeSession(sessionId, 'executing')
            await store.runtime.saveMessage({
              id: `msg_user_${Date.now().toString(36)}`,
              sessionId,
              role: 'user',
              content: routedMessage,
              createdAt: new Date().toISOString(),
              metadata: toPilotSafeRecord({
                ...(body?.metadata || {}),
                intentType: intentDecision.intentType,
                intentStrategy: intentDecision.strategy,
                intentReason: intentDecision.reason,
                intentConfidence: intentDecision.confidence,
              }),
            })
            await store.runtime.saveMessage({
              id: `msg_assistant_${Date.now().toString(36)}`,
              sessionId,
              role: 'assistant',
              content: markdown,
              createdAt: new Date().toISOString(),
              metadata: toPilotSafeRecord({
                intentType: intentDecision.intentType,
                toolId: imageToolResult?.toolId || 'tool.image.generate',
                sources: imageToolResult?.sources || [],
              }),
            })
            await store.runtime.completeSession(sessionId, 'completed')
            await emitMemoryUpdatedEvent()

            await emitEvent({
              type: 'assistant.final',
              message: markdown,
              payload: {
                text: markdown,
                intentType: intentDecision.intentType,
              },
            }, {
              persist: true,
              tracePayload: {
                text: markdown,
                intentType: intentDecision.intentType,
              },
            })

            metricSuccess = true
            metricFinishReason = 'completed'
            metricErrorCode = ''

            if (!doneSent) {
              await emitEvent({
                type: 'done',
                payload: {
                  status: 'ok',
                },
              }, persistStreamLifecycle
                ? {
                    persist: true,
                    tracePayload: {
                      status: 'ok',
                    },
                  }
                : undefined)
            }

            await store.runtime.setSessionNotification(sessionId, true)
            return
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

          if (websearchDecision.enabled) {
            try {
              const websearchResult = await executePilotWebsearchTool({
                event,
                userId,
                sessionId,
                requestId: `${sessionId}_${Date.now().toString(36)}`,
                query: routedMessage,
                channel: {
                  baseUrl: selectedChannel.channel.baseUrl,
                  apiKey: selectedChannel.channel.apiKey,
                  model: selectedChannel.providerModel || selectedChannel.channel.model,
                  adapter: selectedChannel.adapter,
                  transport: selectedChannel.transport,
                  timeoutMs: selectedChannel.channel.timeoutMs,
                },
                emitAudit: async (payload) => {
                  const normalizedPayload = toPilotSafeRecord(payload)
                  await emitEvent({
                    type: 'run.audit',
                    payload: normalizedPayload,
                  }, {
                    persist: true,
                    tracePayload: normalizedPayload,
                  })
                },
              })

              if (websearchResult) {
                websearchContextText = websearchResult.contextText
                websearchConnectorSource = websearchResult.connectorSource
                websearchConnectorReason = websearchResult.connectorReason
                websearchSources = websearchResult.sources.map(item => ({
                  id: item.id,
                  url: item.url,
                  title: item.title,
                  snippet: item.snippet,
                  domain: item.domain,
                  sourceType: item.sourceType,
                }))
                await emitEvent({
                  type: 'websearch.executed',
                  payload: {
                    enabled: true,
                    source: websearchConnectorSource,
                    sourceReason: websearchConnectorReason,
                    sourceCount: websearchSources.length,
                    providerChain: websearchResult.providerChain,
                    providerUsed: websearchResult.providerUsed,
                    fallbackUsed: websearchResult.fallbackUsed,
                    dedupeCount: websearchResult.dedupeCount,
                  },
                }, persistStreamLifecycle
                  ? {
                      persist: true,
                      tracePayload: {
                        enabled: true,
                        source: websearchConnectorSource,
                        sourceReason: websearchConnectorReason,
                        sourceCount: websearchSources.length,
                        providerChain: websearchResult.providerChain,
                        providerUsed: websearchResult.providerUsed,
                        fallbackUsed: websearchResult.fallbackUsed,
                        dedupeCount: websearchResult.dedupeCount,
                      },
                    }
                  : undefined)
              }
              else {
                websearchConnectorSource = 'none'
                websearchConnectorReason = 'tool_failed_or_empty_result'
                await emitEvent({
                  type: 'websearch.skipped',
                  payload: {
                    enabled: false,
                    reason: websearchConnectorReason,
                  },
                }, persistStreamLifecycle
                  ? {
                      persist: true,
                      tracePayload: {
                        enabled: false,
                        reason: websearchConnectorReason,
                      },
                    }
                  : undefined)
              }
            }
            catch (error) {
              if (error instanceof PilotToolApprovalRequiredError) {
                if (shouldRecordRoutingMetric) {
                  metricSuccess = false
                  metricFinishReason = 'approval_required'
                  metricErrorCode = error.code
                }
                const approvalMessage = '高风险数据抓取需要审批，请完成审批后重试。'
                const approvalPayload = {
                  code: error.code,
                  message: approvalMessage,
                  ticket_id: error.ticketId,
                  call_id: error.callId,
                  tool_id: 'tool.websearch',
                  tool_name: error.toolName,
                  risk_level: error.riskLevel,
                }
                await emitEvent({
                  type: 'turn.approval_required',
                  message: approvalMessage,
                  detail: approvalPayload,
                  payload: approvalPayload,
                }, persistStreamLifecycle
                  ? {
                      persist: true,
                      tracePayload: approvalPayload,
                    }
                  : undefined)
                if (!doneSent) {
                  await emitEvent({
                    type: 'done',
                    payload: {
                      status: 'waiting_approval',
                    },
                  }, persistStreamLifecycle
                    ? {
                        persist: true,
                        tracePayload: {
                          status: 'waiting_approval',
                        },
                      }
                    : undefined)
                }
                return
              }

              if (error instanceof PilotToolApprovalRejectedError) {
                if (shouldRecordRoutingMetric) {
                  metricSuccess = false
                  metricFinishReason = 'approval_rejected'
                  metricErrorCode = error.code
                }
                await emitEvent({
                  type: 'error',
                  message: '高风险数据抓取审批被拒绝，请调整后再试。',
                  detail: {
                    code: error.code,
                    phase: 'tool.approval_rejected',
                    ticket_id: error.ticketId,
                    call_id: error.callId,
                    tool_name: error.toolName,
                    risk_level: error.riskLevel,
                  },
                  payload: {
                    code: error.code,
                    phase: 'tool.approval_rejected',
                    ticket_id: error.ticketId,
                    call_id: error.callId,
                    tool_name: error.toolName,
                    risk_level: error.riskLevel,
                  },
                }, persistStreamLifecycle
                  ? {
                      persist: true,
                      tracePayload: {
                        code: error.code,
                        phase: 'tool.approval_rejected',
                        ticket_id: error.ticketId,
                        call_id: error.callId,
                        tool_name: error.toolName,
                        risk_level: error.riskLevel,
                      },
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
                return
              }

              websearchConnectorSource = 'none'
              websearchConnectorReason = `tool_exception:${String(error instanceof Error ? error.message : error || '').slice(0, 120)}`
              await emitEvent({
                type: 'websearch.skipped',
                payload: {
                  enabled: false,
                  reason: websearchConnectorReason,
                },
              }, persistStreamLifecycle
                ? {
                    persist: true,
                    tracePayload: {
                      enabled: false,
                      reason: websearchConnectorReason,
                    },
                  }
                : undefined)
            }
          }

          const runtimeMessage = mergeWebsearchContextIntoMessage(routedMessage, websearchContextText)

          const result = await runPilotConversationStream({
            runtime,
            sessionId,
            message: runtimeMessage,
            fromSeq,
            attachments: resolvedAttachments.attachments,
            metadata: toPilotSafeRecord({
              ...(body?.metadata || {}),
              modelId: selectedChannel.modelId,
              providerModel: selectedChannel.providerModel,
              routeComboId: selectedChannel.routeComboId,
              selectionSource: selectedChannel.selectionSource,
              selectionReason: selectedChannel.selectionReason,
              intentType: intentDecision.intentType,
              intentStrategy: intentDecision.strategy,
              intentReason: intentDecision.reason,
              intentConfidence: intentDecision.confidence,
              internet: selectedChannel.internet,
              thinking: selectedChannel.thinking,
              memoryEnabled,
              memoryHistoryMessageCount,
              builtinTools: selectedChannel.builtinTools,
              toolSources: websearchSources,
              websearchSourceCount: websearchSources.length,
              websearchDecision: websearchDecision.reason,
              websearchConnectorSource,
              websearchConnectorReason,
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

          if (!routedMessage && Number.isFinite(fromSeq) && follow) {
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
          await emitMemoryUpdatedEvent()

          const runtimePersistMetrics = runtime.getAndResetRuntimePersistMetrics?.(sessionId) || null
          const storeMetrics = getPilotStoreMetricsSnapshot(event)
          const persistSummaryPayload = {
            metricType: 'persist.summary',
            runtimeDeltaPersistBatchCount: runtimePersistMetrics?.deltaPersistBatchCount ?? 0,
            runtimeDeltaPersistChars: runtimePersistMetrics?.deltaPersistChars ?? 0,
            runtimeDeltaPersistAvgChars: runtimePersistMetrics?.deltaPersistAvgChars ?? 0,
            runtimeTracePersistCount: runtimePersistMetrics?.runtimeTracePersistCount ?? 0,
            storeAppendTraceCount: storeMetrics.appendTraceCount,
            hasMessage: Boolean(routedMessage),
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

          if (routedMessage && !result.aborted) {
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
          if (persistStreamLifecycle) {
            try {
              await syncLegacyQuotaConversationFromRuntime(event, {
                userId,
                chatId: sessionId,
                channelId: selectedChannel.channelId,
                storeRuntime: store.runtime,
              })
            }
            catch (error) {
              console.warn('[pilot-stream-quota-sync] failed', error)
            }
          }

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
                  intentType: intentDecision.intentType,
                  intentStrategy: intentDecision.strategy,
                  intentReason: intentDecision.reason,
                  intentConfidence: intentDecision.confidence,
                  adapter: selectedChannel.adapter,
                  transport: selectedChannel.transport,
                  internet: selectedChannel.internet,
                  thinking: selectedChannel.thinking,
                  memoryEnabled,
                  memoryHistoryMessageCount,
                  builtinTools: selectedChannel.builtinTools,
                  websearchSourceCount: websearchSources.length,
                  websearchDecision: websearchDecision.reason,
                  websearchConnectorSource,
                  websearchConnectorReason,
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
