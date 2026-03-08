import type { IntelligenceMessage } from '@talex-touch/tuff-intelligence'
import type { H3Event } from 'h3'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { createAudit } from './intelligenceStore'
import {
  appendRuntimeTraceEvent,
  getRuntimeSession,
  markRuntimeSessionPaused,
  saveRuntimeCheckpoint,
  shouldPauseByHeartbeat,
  upsertRuntimeSession,
  type TuffIntelligencePauseReason,
  type TuffIntelligenceRuntimeStatus,
} from './tuffIntelligenceRuntimeStore'
import {
  buildFinalAssistantReplyWithModel,
  executeIntelligenceLab,
  generateIntelligenceLabFollowUp,
  planIntelligenceLab,
  reflectIntelligenceLab,
  type IntelligenceLabAction,
  type IntelligenceLabExecutionResult,
  type IntelligenceLabFollowUpPlan,
  type IntelligenceLabOrchestrationResult,
  type IntelligenceLabRuntimeMetrics,
  type IntelligenceLabStreamEvent,
} from './tuffIntelligenceLabService'

const STREAM_CONTRACT_VERSION = 3
const STREAM_ENGINE = 'intelligence' as const
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 30_000

interface RuntimeCheckpointState {
  [key: string]: unknown
  objective: string
  history: IntelligenceMessage[]
  actions: IntelligenceLabAction[]
  results: IntelligenceLabExecutionResult[]
  reflection?: string
  followUp?: IntelligenceLabFollowUpPlan
  providerId?: string
  providerName?: string
  model?: string
  traceId?: string
  startedAt: number
}

interface AgentGraphRuntimeState {
  event: H3Event
  userId: string
  options?: {
    emit?: (event: IntelligenceLabStreamEvent) => void | Promise<void>
    isDisconnected?: () => boolean
  }
  sessionId: string
  runId: string
  startedAt: number
  timeoutMs?: number
  heartbeatTimeoutMs: number
  objective: string
  history: IntelligenceMessage[]
  actions: IntelligenceLabAction[]
  results: IntelligenceLabExecutionResult[]
  reflection: string
  followUp: IntelligenceLabFollowUpPlan
  activeProviderId: string
  activeProviderName: string
  activeModel: string
  activeTraceId: string
  totalFallbackCount: number
  totalRetryCount: number
  streamEventCount: number
  pauseReason: TuffIntelligencePauseReason | null
  finalResult?: IntelligenceLabOrchestrationResult
}

interface GraphContextEnvelope {
  capabilityId: string
  metadata: {
    runtime: AgentGraphRuntimeState
  }
}

function now(): number {
  return Date.now()
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function normalizeMessages(messages: unknown): IntelligenceMessage[] {
  if (!Array.isArray(messages))
    return []
  return messages
    .map((message) => {
      const row = asRecord(message)
      const roleRaw = String(row.role || '').trim().toLowerCase()
      const role: IntelligenceMessage['role']
        = roleRaw === 'system' || roleRaw === 'assistant' ? roleRaw : 'user'
      const content = String(row.content || '').trim()
      if (!content) {
        return null
      }
      return { role, content }
    })
    .filter((item): item is IntelligenceMessage => Boolean(item))
}

function toRuntimeStatus(
  status: IntelligenceLabRuntimeMetrics['status'],
): TuffIntelligenceRuntimeStatus {
  if (status === 'waiting_approval')
    return 'waiting_approval'
  if (status === 'paused_disconnect')
    return 'paused_disconnect'
  if (status === 'failed')
    return 'failed'
  return 'completed'
}

function computeActionStats(results: IntelligenceLabExecutionResult[]): {
  totalActions: number
  completedActions: number
  failedActions: number
  waitingApprovals: number
} {
  const totalActions = results.length
  const completedActions = results.filter(item => item.status === 'completed').length
  const failedActions = results.filter(item => item.status === 'failed').length
  const waitingApprovals = results.filter(item => item.status === 'waiting_approval').length
  return {
    totalActions,
    completedActions,
    failedActions,
    waitingApprovals,
  }
}

function buildToolFailureDistribution(results: IntelligenceLabExecutionResult[]): Record<string, number> {
  const distribution: Record<string, number> = {}
  for (const result of results) {
    if (result.status !== 'failed') {
      continue
    }
    const key = result.type === 'tool'
      ? (result.approvalTicket?.toolId || result.title || 'tool.unknown')
      : `${result.type}:runtime`
    distribution[key] = (distribution[key] ?? 0) + 1
  }
  return distribution
}

function chunkForStream(content: string, chunkSize = 72): string[] {
  const text = content.trim()
  if (!text) {
    return []
  }
  const chunks: string[] = []
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize))
  }
  return chunks
}

function formatModelErrorDetail(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const detail: Record<string, unknown> = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      cause: (error as { cause?: unknown }).cause,
    }
    const extra = error as unknown as Record<string, unknown>
    for (const key of Object.keys(extra)) {
      if (!(key in detail)) {
        detail[key] = extra[key]
      }
    }
    return detail
  }
  if (error && typeof error === 'object') {
    return { ...error as Record<string, unknown> }
  }
  return { message: String(error || 'unknown error') }
}

function buildCheckpointState(state: AgentGraphRuntimeState): RuntimeCheckpointState {
  return {
    objective: state.objective,
    history: state.history,
    actions: state.actions,
    results: state.results,
    reflection: state.reflection || undefined,
    followUp: state.followUp.summary ? state.followUp : undefined,
    providerId: state.activeProviderId || undefined,
    providerName: state.activeProviderName || undefined,
    model: state.activeModel || undefined,
    traceId: state.activeTraceId || undefined,
    startedAt: state.startedAt,
  }
}

function getState(context: GraphContextEnvelope): AgentGraphRuntimeState {
  return context.metadata.runtime
}

async function emitStreamEvent(
  state: AgentGraphRuntimeState,
  eventItem: Omit<IntelligenceLabStreamEvent, 'timestamp' | 'contractVersion' | 'engine' | 'runId' | 'seq'> & {
    timestamp?: number
  },
  options?: {
    status?: TuffIntelligenceRuntimeStatus
    checkpoint?: RuntimeCheckpointState
  },
): Promise<void> {
  const envelopeBase: IntelligenceLabStreamEvent = {
    ...eventItem,
    contractVersion: STREAM_CONTRACT_VERSION,
    engine: STREAM_ENGINE,
    runId: state.runId,
    sessionId: state.sessionId,
    timestamp: eventItem.timestamp ?? now(),
  }

  const trace = await appendRuntimeTraceEvent(state.event, {
    sessionId: state.sessionId,
    userId: state.userId,
    runId: state.runId,
    eventType: envelopeBase.type,
    phase: envelopeBase.phase || 'orchestration',
    traceId: envelopeBase.traceId,
    payload: envelopeBase as unknown as Record<string, unknown>,
    status: options?.status,
  })
  state.streamEventCount += 1
  envelopeBase.seq = trace.seq

  if (options?.checkpoint) {
    await saveRuntimeCheckpoint(state.event, {
      sessionId: state.sessionId,
      userId: state.userId,
      runId: state.runId,
      seq: trace.seq,
      phase: envelopeBase.phase || 'orchestration',
      state: options.checkpoint,
    })
  }

  try {
    await state.options?.emit?.(envelopeBase)
  } catch {
    // ignore emit failures on disconnected clients
  }
}

function createMetrics(
  state: AgentGraphRuntimeState,
  status: IntelligenceLabRuntimeMetrics['status'],
): IntelligenceLabRuntimeMetrics {
  const actionStats = computeActionStats(state.results)
  return {
    sessionId: state.sessionId,
    status,
    totalActions: Math.max(state.actions.length, actionStats.totalActions),
    completedActions: actionStats.completedActions,
    failedActions: actionStats.failedActions,
    waitingApprovals: actionStats.waitingApprovals,
    approvalHitCount: actionStats.waitingApprovals,
    fallbackCount: state.totalFallbackCount,
    retryCount: state.totalRetryCount,
    streamEventCount: state.streamEventCount,
    durationMs: now() - state.startedAt,
    toolFailureDistribution: buildToolFailureDistribution(state.results),
    generatedAt: new Date().toISOString(),
  }
}

function createResult(
  state: AgentGraphRuntimeState,
  metrics: IntelligenceLabRuntimeMetrics,
): IntelligenceLabOrchestrationResult {
  return {
    sessionId: state.sessionId,
    objective: state.objective,
    actions: state.actions,
    results: state.results,
    reflection: state.reflection,
    followUp: state.followUp,
    metrics,
    providerId: state.activeProviderId || 'runtime',
    providerName: state.activeProviderName || 'runtime',
    model: state.activeModel || 'runtime',
    traceId: state.activeTraceId || '',
  }
}

async function resolvePauseReason(state: AgentGraphRuntimeState): Promise<TuffIntelligencePauseReason | null> {
  if (state.options?.isDisconnected?.()) {
    return 'client_disconnect'
  }
  const sessionSnapshot = await getRuntimeSession(state.event, state.userId, state.sessionId)
  if (sessionSnapshot?.status === 'paused_disconnect') {
    return sessionSnapshot.pauseReason || 'manual_pause'
  }
  const heartbeatState = await shouldPauseByHeartbeat(state.event, {
    sessionId: state.sessionId,
    userId: state.userId,
    timeoutMs: state.heartbeatTimeoutMs,
  })
  if (heartbeatState.shouldPause) {
    return 'heartbeat_timeout'
  }
  return null
}

async function finalizePausedState(state: AgentGraphRuntimeState): Promise<void> {
  const pauseReason = state.pauseReason || 'client_disconnect'
  const pauseI18nKey = pauseReason === 'client_disconnect' || pauseReason === 'heartbeat_timeout'
    ? 'dashboard.intelligenceLab.system.pausedNetwork'
    : 'dashboard.intelligenceLab.system.pausedManual'

  await markRuntimeSessionPaused(state.event, {
    sessionId: state.sessionId,
    userId: state.userId,
    pauseReason,
  })

  const checkpoint = buildCheckpointState(state)
  const metrics = createMetrics(state, 'paused_disconnect')

  await emitStreamEvent(state, {
    type: 'session.paused',
    message: '',
    phase: 'pause',
    payload: {
      pauseReason,
      i18nKey: pauseI18nKey,
      i18nParams: {},
    },
  }, {
    status: 'paused_disconnect',
    checkpoint,
  })

  await emitStreamEvent(state, {
    type: 'run.metrics',
    phase: 'metrics',
    payload: metrics as unknown as Record<string, unknown>,
  }, {
    status: 'paused_disconnect',
    checkpoint,
  })

  await emitStreamEvent(state, {
    type: 'done',
    message: 'Session paused. Resume when connection is stable.',
    phase: 'done',
  }, {
    status: 'paused_disconnect',
    checkpoint,
  })

  await upsertRuntimeSession(state.event, {
    sessionId: state.sessionId,
    userId: state.userId,
    runId: state.runId,
    status: 'paused_disconnect',
    phase: 'pause',
    objective: state.objective,
    history: state.history,
    state: checkpoint,
    pauseReason,
  })

  state.finalResult = createResult(state, metrics)
}

async function finalizeFailureState(
  state: AgentGraphRuntimeState,
  stage: string,
  error: unknown,
  phase: string,
): Promise<void> {
  const errorDetail = formatModelErrorDetail(error)
  const checkpoint = buildCheckpointState(state)
  const metrics = createMetrics(state, 'failed')

  await emitStreamEvent(state, {
    type: 'error',
    message: `model_failed:${stage}`,
    phase,
    payload: {
      i18nKey: 'dashboard.intelligenceLab.system.modelFailed',
      i18nParams: { stage },
      stage,
      error: errorDetail,
    },
  }, {
    status: 'failed',
    checkpoint,
  })

  await emitStreamEvent(state, {
    type: 'run.metrics',
    phase: 'metrics',
    payload: metrics as unknown as Record<string, unknown>,
  }, {
    status: 'failed',
    checkpoint,
  })

  await emitStreamEvent(state, {
    type: 'done',
    message: '',
    phase: 'done',
  }, {
    status: 'failed',
    checkpoint,
  })

  try {
    await createAudit(state.event, {
      userId: state.userId,
      providerId: state.activeProviderId || 'runtime',
      providerType: 'runtime',
      model: state.activeModel || 'runtime',
      endpoint: null,
      status: 500,
      latency: metrics.durationMs,
      success: false,
      errorMessage: `intelligence-agent-runtime model_failed:${stage}`,
      traceId: state.activeTraceId || null,
      metadata: {
        source: 'intelligence-agent-runtime',
        sessionId: state.sessionId,
        status: metrics.status,
        stage,
        durationMs: metrics.durationMs,
        error: errorDetail,
        totalActions: metrics.totalActions,
        completedActions: metrics.completedActions,
        failedActions: metrics.failedActions,
        waitingApprovals: metrics.waitingApprovals,
        fallbackCount: metrics.fallbackCount,
        retryCount: metrics.retryCount,
      },
    })
  } catch {
    // ignore audit failure
  }

  await upsertRuntimeSession(state.event, {
    sessionId: state.sessionId,
    userId: state.userId,
    runId: state.runId,
    status: 'failed',
    phase,
    objective: state.objective,
    history: state.history,
    state: checkpoint,
    pauseReason: null,
  })

  state.finalResult = createResult(state, metrics)
}

async function finalizeSuccessState(state: AgentGraphRuntimeState): Promise<void> {
  const actionStats = computeActionStats(state.results)
  const status: IntelligenceLabRuntimeMetrics['status'] = actionStats.waitingApprovals > 0
    ? 'waiting_approval'
    : actionStats.failedActions > 0
      ? 'failed'
      : 'completed'
  const runtimeStatus = toRuntimeStatus(status)

  const metricsBeforeFinal = createMetrics(state, status)
  await emitStreamEvent(state, {
    type: 'status',
    message: '',
    phase: 'assistant',
    payload: {
      i18nKey: 'dashboard.intelligenceLab.system.finalStreamStart',
      i18nParams: {},
      kind: 'final_response_stream',
      objective: state.objective,
      status,
      providerId: state.activeProviderId,
      providerName: state.activeProviderName,
      model: state.activeModel,
      totalActions: actionStats.totalActions,
    },
  }, { status: runtimeStatus })

  const finalReply = await buildFinalAssistantReplyWithModel(state.event, state.userId, {
    objective: state.objective,
    actions: state.actions,
    results: state.results,
    reflection: state.reflection,
    followUp: state.followUp,
    metrics: metricsBeforeFinal,
    providerId: state.activeProviderId || undefined,
    model: state.activeModel || undefined,
    timeoutMs: state.timeoutMs,
    sessionId: state.sessionId,
  }, {
    onDelta: async (delta) => {
      await emitStreamEvent(state, {
        type: 'assistant.delta',
        phase: 'assistant',
        payload: { delta },
      }, { status: runtimeStatus })
    },
  })

  state.totalFallbackCount += finalReply.fallbackCount
  state.totalRetryCount += finalReply.retryCount
  if (finalReply.providerId) {
    state.activeProviderId = finalReply.providerId
  }
  if (finalReply.providerName) {
    state.activeProviderName = finalReply.providerName
  }
  if (finalReply.model) {
    state.activeModel = finalReply.model
  }
  if (finalReply.traceId) {
    state.activeTraceId = finalReply.traceId
  }

  const metrics = createMetrics(state, status)
  const checkpoint = buildCheckpointState(state)

  try {
    await createAudit(state.event, {
      userId: state.userId,
      providerId: state.activeProviderId || 'runtime',
      providerType: 'runtime',
      model: state.activeModel || 'runtime',
      endpoint: null,
      status: status === 'completed' ? 200 : status === 'waiting_approval' ? 202 : 500,
      latency: metrics.durationMs,
      success: status === 'completed',
      errorMessage: status === 'failed' ? 'intelligence-agent-runtime failed' : null,
      traceId: state.activeTraceId || null,
      metadata: {
        source: 'intelligence-agent-runtime',
        sessionId: state.sessionId,
        status,
        totalActions: metrics.totalActions,
        completedActions: metrics.completedActions,
        failedActions: metrics.failedActions,
        waitingApprovals: metrics.waitingApprovals,
        approvalHitCount: metrics.approvalHitCount,
        fallbackCount: metrics.fallbackCount,
        retryCount: metrics.retryCount,
        streamEventCount: metrics.streamEventCount,
        toolFailureDistribution: metrics.toolFailureDistribution,
        durationMs: metrics.durationMs,
        pauseReason: null,
      },
    })
  } catch {
    // ignore audit failure
  }

  await upsertRuntimeSession(state.event, {
    sessionId: state.sessionId,
    userId: state.userId,
    runId: state.runId,
    status: runtimeStatus,
    phase: 'done',
    objective: state.objective,
    history: state.history,
    state: checkpoint,
    pauseReason: null,
  })

  await emitStreamEvent(state, {
    type: 'run.metrics',
    phase: 'metrics',
    payload: metrics as unknown as Record<string, unknown>,
  }, {
    status: runtimeStatus,
    checkpoint,
  })

  if (!finalReply.streamed) {
    for (const chunk of chunkForStream(finalReply.message)) {
      await emitStreamEvent(state, {
        type: 'assistant.delta',
        phase: 'assistant',
        payload: { delta: chunk },
      }, { status: runtimeStatus })
    }
  }

  await emitStreamEvent(state, {
    type: 'done',
    phase: 'done',
    message: 'TuffIntelligence orchestration completed.',
  }, {
    status: runtimeStatus,
    checkpoint,
  })

  state.finalResult = createResult(state, metrics)
}

export async function runIntelligenceAgentGraphStream(
  event: H3Event,
  userId: string,
  payload: {
    message?: string
    sessionId?: string
    history?: unknown
    timeoutMs?: number
    heartbeatTimeoutMs?: number
  },
  options?: {
    emit?: (event: IntelligenceLabStreamEvent) => void | Promise<void>
    isDisconnected?: () => boolean
  },
): Promise<IntelligenceLabOrchestrationResult> {
  const objective = String(payload.message || '').trim()
  if (!objective) {
    throw new Error('Message is required.')
  }

  const state: AgentGraphRuntimeState = {
    event,
    userId,
    options,
    sessionId: payload.sessionId?.trim() || createId('session'),
    runId: createId('run'),
    startedAt: now(),
    timeoutMs: payload.timeoutMs,
    heartbeatTimeoutMs: Math.max(10_000, payload.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS),
    objective,
    history: normalizeMessages(payload.history),
    actions: [],
    results: [],
    reflection: '',
    followUp: {
      summary: '',
      nextActions: [],
      revisitInHours: 24,
    },
    activeProviderId: '',
    activeProviderName: '',
    activeModel: '',
    activeTraceId: '',
    totalFallbackCount: 0,
    totalRetryCount: 0,
    streamEventCount: 0,
    pauseReason: null,
  }

  const graphContext: GraphContextEnvelope = {
    capabilityId: 'intelligence.agent.stream',
    metadata: {
      runtime: state,
    },
  }

  const steps = [
    {
      id: 'session.start',
      run: async (context: GraphContextEnvelope) => {
        const runtime = getState(context)
        await upsertRuntimeSession(runtime.event, {
          sessionId: runtime.sessionId,
          userId: runtime.userId,
          runId: runtime.runId,
          status: 'planning',
          phase: 'planning',
          objective: runtime.objective,
          history: runtime.history,
          pauseReason: null,
          lastHeartbeatAt: new Date().toISOString(),
        })

        await emitStreamEvent(runtime, {
          type: 'status',
          message: '',
          phase: 'planning',
          payload: {
            i18nKey: 'dashboard.intelligenceLab.system.planningStart',
            i18nParams: {},
            kind: 'phase_change',
            mode: 'start',
            from: 'idle',
            to: 'planning',
          },
        }, { status: 'planning' })

        runtime.pauseReason = await resolvePauseReason(runtime)
        return context
      },
    },
    {
      id: 'plan',
      run: async (context: GraphContextEnvelope) => {
        const runtime = getState(context)
        if (runtime.pauseReason) {
          return context
        }

        const plan = await planIntelligenceLab(runtime.event, runtime.userId, {
          objective: runtime.objective,
          context: {
            history: runtime.history,
          },
          timeoutMs: runtime.timeoutMs,
          sessionId: runtime.sessionId,
        })
        runtime.actions = plan.actions
        runtime.totalFallbackCount += plan.fallbackCount
        runtime.totalRetryCount += plan.retryCount
        runtime.activeProviderId = plan.providerId
        runtime.activeProviderName = plan.providerName
        runtime.activeModel = plan.model
        runtime.activeTraceId = plan.traceId

        await emitStreamEvent(runtime, {
          type: 'plan.created',
          phase: 'planning',
          traceId: plan.traceId,
          payload: {
            actions: plan.actions,
            providerId: plan.providerId,
            providerName: plan.providerName,
            model: plan.model,
            rawModelOutput: plan.rawModelOutput,
            fallbackCount: runtime.totalFallbackCount,
            retryCount: runtime.totalRetryCount,
          },
        }, {
          status: 'executing',
          checkpoint: buildCheckpointState(runtime),
        })
        return context
      },
    },
    {
      id: 'execute',
      run: async (context: GraphContextEnvelope) => {
        const runtime = getState(context)
        if (runtime.pauseReason) {
          return context
        }
        runtime.pauseReason = await resolvePauseReason(runtime)
        if (runtime.pauseReason) {
          return context
        }

        await emitStreamEvent(runtime, {
          type: 'status',
          message: '',
          phase: 'executing',
          payload: {
            i18nKey: 'dashboard.intelligenceLab.system.executingStart',
            i18nParams: {},
            kind: 'phase_change',
            from: 'planning',
            to: 'executing',
            totalActions: runtime.actions.length,
          },
        }, { status: 'executing' })

        const streamedResults: IntelligenceLabExecutionResult[] = []
        const execution = await executeIntelligenceLab(runtime.event, runtime.userId, {
          objective: runtime.objective,
          actions: runtime.actions,
          providerId: runtime.activeProviderId || undefined,
          model: runtime.activeModel || undefined,
          timeoutMs: runtime.timeoutMs,
          sessionId: runtime.sessionId,
        }, {
          onStep: async (result, stepContext) => {
            streamedResults.push(result)
            runtime.results = [...streamedResults]
            await emitStreamEvent(runtime, {
              type: 'execution.step',
              phase: 'executing',
              payload: {
                result,
                index: stepContext.index,
                total: stepContext.total,
                fallbackCount: stepContext.fallbackCount + runtime.totalFallbackCount,
                retryCount: stepContext.retryCount + runtime.totalRetryCount,
              },
            }, {
              status: result.status === 'waiting_approval' ? 'waiting_approval' : 'executing',
              checkpoint: buildCheckpointState(runtime),
            })

            if (result.status === 'waiting_approval' && result.approvalTicket) {
              await emitStreamEvent(runtime, {
                type: 'tool.approval_required',
                phase: 'approval',
                payload: {
                  ticket: result.approvalTicket,
                  actionId: result.actionId,
                  title: result.title,
                },
              }, { status: 'waiting_approval' })
            }
          },
          shouldPause: async () => {
            const reason = await resolvePauseReason(runtime)
            return reason ? { paused: true, reason } : { paused: false }
          },
        })

        runtime.results = execution.results
        runtime.totalFallbackCount += execution.fallbackCount
        runtime.totalRetryCount += execution.retryCount
        runtime.activeProviderId = execution.providerId || runtime.activeProviderId
        runtime.activeProviderName = execution.providerName || runtime.activeProviderName
        runtime.activeModel = execution.model || runtime.activeModel
        runtime.activeTraceId = execution.traceId || runtime.activeTraceId
        if (execution.paused) {
          runtime.pauseReason = execution.pauseReason || 'client_disconnect'
        }
        return context
      },
    },
    {
      id: 'reflect',
      run: async (context: GraphContextEnvelope) => {
        const runtime = getState(context)
        if (runtime.pauseReason) {
          return context
        }
        runtime.pauseReason = await resolvePauseReason(runtime)
        if (runtime.pauseReason) {
          return context
        }

        await emitStreamEvent(runtime, {
          type: 'status',
          message: '',
          phase: 'reflecting',
          payload: {
            i18nKey: 'dashboard.intelligenceLab.system.reflectingStart',
            i18nParams: {},
            kind: 'phase_change',
            from: 'executing',
            to: 'reflecting',
          },
        }, { status: 'reflecting' })

        const reflection = await reflectIntelligenceLab(runtime.event, runtime.userId, {
          objective: runtime.objective,
          actions: runtime.actions,
          results: runtime.results,
          providerId: runtime.activeProviderId || undefined,
          model: runtime.activeModel || undefined,
          timeoutMs: runtime.timeoutMs,
          sessionId: runtime.sessionId,
        })
        runtime.reflection = reflection.summary
        runtime.totalFallbackCount += reflection.fallbackCount
        runtime.totalRetryCount += reflection.retryCount
        runtime.activeProviderId = reflection.providerId || runtime.activeProviderId
        runtime.activeProviderName = reflection.providerName || runtime.activeProviderName
        runtime.activeModel = reflection.model || runtime.activeModel
        runtime.activeTraceId = reflection.traceId || runtime.activeTraceId

        await emitStreamEvent(runtime, {
          type: 'reflection.completed',
          phase: 'reflecting',
          traceId: reflection.traceId,
          payload: {
            summary: reflection.summary,
            providerId: reflection.providerId,
            providerName: reflection.providerName,
            model: reflection.model,
            rawModelOutput: reflection.rawModelOutput,
          },
        }, {
          status: 'reflecting',
          checkpoint: buildCheckpointState(runtime),
        })

        runtime.pauseReason = await resolvePauseReason(runtime)
        if (runtime.pauseReason) {
          return context
        }

        const followUp = await generateIntelligenceLabFollowUp(runtime.event, runtime.userId, {
          objective: runtime.objective,
          reflection: runtime.reflection,
          results: runtime.results,
          providerId: runtime.activeProviderId || undefined,
          model: runtime.activeModel || undefined,
          timeoutMs: runtime.timeoutMs,
          sessionId: runtime.sessionId,
        })
        runtime.followUp = followUp.followUp
        runtime.totalFallbackCount += followUp.fallbackCount
        runtime.totalRetryCount += followUp.retryCount
        runtime.activeProviderId = followUp.providerId || runtime.activeProviderId
        runtime.activeProviderName = followUp.providerName || runtime.activeProviderName
        runtime.activeModel = followUp.model || runtime.activeModel
        runtime.activeTraceId = followUp.traceId || runtime.activeTraceId

        await emitStreamEvent(runtime, {
          type: 'followup.created',
          phase: 'followup',
          traceId: followUp.traceId,
          payload: {
            ...followUp.followUp,
            rawModelOutput: followUp.rawModelOutput,
          } as unknown as Record<string, unknown>,
        }, {
          status: 'reflecting',
          checkpoint: buildCheckpointState(runtime),
        })
        return context
      },
    },
    {
      id: 'finalize',
      run: async (context: GraphContextEnvelope) => {
        const runtime = getState(context)
        if (runtime.pauseReason) {
          await finalizePausedState(runtime)
          return context
        }
        await finalizeSuccessState(runtime)
        return context
      },
    },
  ]

  const RuntimeGraphAnnotation = Annotation.Root({
    context: Annotation<GraphContextEnvelope>,
  })
  const graphBuilder = new StateGraph(RuntimeGraphAnnotation as any) as any
  for (const step of steps) {
    graphBuilder.addNode(step.id, async (stateData: typeof RuntimeGraphAnnotation.State) => {
      const nextContext = await step.run(stateData.context)
      return { context: nextContext }
    })
  }
  graphBuilder.addEdge(START, steps[0]!.id)
  for (let index = 0; index < steps.length - 1; index++) {
    graphBuilder.addEdge(steps[index]!.id, steps[index + 1]!.id)
  }
  graphBuilder.addEdge(steps[steps.length - 1]!.id, END)
  const compiled = graphBuilder.compile()

  try {
    await compiled.invoke({ context: graphContext })
  } catch (error) {
    const stage = (error as { stage?: string }).stage || 'graph'
    await finalizeFailureState(state, stage, error, 'orchestration')
  }

  return state.finalResult || createResult(state, createMetrics(state, 'failed'))
}
