import type { AgentEnvelope, ConversationAgentPort, UserMessageInput } from '@talex-touch/tuff-intelligence'
import type { H3Event } from 'h3'
import type {
  IntelligenceLabOrchestrationResult,
  IntelligenceLabRuntimeMetrics,
  IntelligenceLabStreamEvent,
} from './tuffIntelligenceLabService'
import {
  appendRuntimeTraceEvent,
  upsertRuntimeSession,
} from './tuffIntelligenceRuntimeStore'

interface RuntimeBridgeOptions {
  emit?: (event: IntelligenceLabStreamEvent) => void | Promise<void>
}

interface RuntimeBridgePayload {
  message: string
  sessionId: string
  timeoutMs?: number
}

export type NexusAgentRuntimePort = Pick<ConversationAgentPort, 'onMessage'>

let testRuntimePort: NexusAgentRuntimePort | null = null

const DEFAULT_RUNTIME_TIMEOUT_MS = 45_000
const MIN_RUNTIME_TIMEOUT_MS = 1_000
const MAX_RUNTIME_TIMEOUT_MS = 120_000
const RUNTIME_TIMEOUT_CODE = 'runtime_timeout'

function now(): number {
  return Date.now()
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function normalizeRuntimeTimeoutMs(timeoutMs?: number): number {
  if (!Number.isFinite(timeoutMs))
    return DEFAULT_RUNTIME_TIMEOUT_MS
  return Math.min(Math.max(Math.floor(timeoutMs as number), MIN_RUNTIME_TIMEOUT_MS), MAX_RUNTIME_TIMEOUT_MS)
}

function createRuntimeTimeoutError(timeoutMs: number): Error {
  const error = new Error(`Shared runtime did not finish within ${timeoutMs}ms.`)
  ;(error as { code?: string }).code = RUNTIME_TIMEOUT_CODE
  return error
}

function isRuntimeTimeoutError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === RUNTIME_TIMEOUT_CODE)
}

async function nextEnvelopeWithTimeout(
  iterator: AsyncIterator<AgentEnvelope>,
  remainingMs: number,
  timeoutMs: number,
): Promise<IteratorResult<AgentEnvelope>> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      iterator.next(),
      new Promise<IteratorResult<AgentEnvelope>>((_, reject) => {
        timer = setTimeout(() => reject(createRuntimeTimeoutError(timeoutMs)), remainingMs)
      }),
    ])
  }
  finally {
    if (timer)
      clearTimeout(timer)
  }
}

function closeRuntimeIterator(iterator: AsyncIterator<AgentEnvelope>): void {
  const close = iterator.return
  if (typeof close === 'function')
    void Promise.resolve(close.call(iterator)).catch(() => {})
}

function envelopeText(envelope: AgentEnvelope): string {
  const payload = envelope.payload as Record<string, unknown>
  return typeof payload?.text === 'string' ? payload.text : ''
}

function toStreamEvent(
  envelope: AgentEnvelope,
  runId: string,
  seq: number,
): IntelligenceLabStreamEvent | null {
  if (envelope.type === 'assistant.delta') {
    return {
      contractVersion: 3,
      engine: 'intelligence',
      runId,
      seq,
      sessionId: envelope.sessionId,
      timestamp: Date.parse(envelope.ts) || now(),
      type: 'assistant.delta',
      phase: 'assistant',
      payload: { delta: envelopeText(envelope) },
    }
  }
  if (envelope.type === 'assistant.final') {
    return {
      contractVersion: 3,
      engine: 'intelligence',
      runId,
      seq,
      sessionId: envelope.sessionId,
      timestamp: Date.parse(envelope.ts) || now(),
      type: 'done',
      phase: 'done',
      message: envelopeText(envelope),
    }
  }
  return null
}

function buildMetrics(sessionId: string, startedAt: number): IntelligenceLabRuntimeMetrics {
  return {
    sessionId,
    status: 'completed',
    totalActions: 0,
    completedActions: 0,
    failedActions: 0,
    waitingApprovals: 0,
    approvalHitCount: 0,
    fallbackCount: 0,
    retryCount: 0,
    streamEventCount: 0,
    durationMs: now() - startedAt,
    toolFailureDistribution: {},
    generatedAt: new Date().toISOString(),
  }
}

function buildInput(userId: string, payload: RuntimeBridgePayload): UserMessageInput {
  return {
    message: payload.message,
    sessionId: payload.sessionId,
    metadata: { nexusAgentRuntimeBridge: true, userId },
  }
}

export function registerNexusAgentRuntimePortForTest(port: NexusAgentRuntimePort): void {
  testRuntimePort = port
}

export function clearNexusAgentRuntimePortForTest(): void {
  testRuntimePort = null
}

export function resolveNexusAgentRuntimePort(
  explicitPort?: NexusAgentRuntimePort,
): NexusAgentRuntimePort | null {
  return explicitPort ?? testRuntimePort
}

export async function runNexusAgentRuntimeBridge(
  event: H3Event,
  userId: string,
  payload: RuntimeBridgePayload,
  runtimePort: NexusAgentRuntimePort,
  options: RuntimeBridgeOptions = {},
): Promise<IntelligenceLabOrchestrationResult> {
  const runId = createId('run')
  const startedAt = now()
  let finalMessage = ''
  let streamEventCount = 0
  await upsertRuntimeSession(event, {
    sessionId: payload.sessionId,
    userId,
    runId,
    status: 'executing',
    phase: 'shared-runtime',
    objective: payload.message,
    history: [],
    pauseReason: null,
  })

  const timeoutMs = normalizeRuntimeTimeoutMs(payload.timeoutMs)
  const deadlineAt = startedAt + timeoutMs
  const iterator = runtimePort.onMessage(buildInput(userId, payload))[Symbol.asyncIterator]()

  try {
    while (true) {
      const remainingMs = deadlineAt - now()
      if (remainingMs <= 0)
        throw createRuntimeTimeoutError(timeoutMs)

      const next = await nextEnvelopeWithTimeout(iterator, remainingMs, timeoutMs)
      if (next.done)
        break

      const envelope = next.value
      const streamEvent = toStreamEvent(envelope, runId, streamEventCount + 1)
      if (!streamEvent)
        continue
      const trace = await appendRuntimeTraceEvent(event, {
        sessionId: payload.sessionId,
        userId,
        runId,
        eventType: streamEvent.type,
        phase: streamEvent.phase,
        traceId: envelope.id,
        payload: streamEvent as unknown as Record<string, unknown>,
        status: streamEvent.type === 'done' ? 'completed' : 'executing',
      })
      streamEvent.seq = trace.seq
      streamEventCount += 1
      if (streamEvent.type === 'done')
        finalMessage = streamEvent.message || finalMessage
      await options.emit?.(streamEvent)
    }
  }
  catch (error) {
    if (!isRuntimeTimeoutError(error))
      throw error

    closeRuntimeIterator(iterator)
    const timeoutEvent: IntelligenceLabStreamEvent = {
      contractVersion: 3,
      engine: 'intelligence',
      runId,
      seq: streamEventCount + 1,
      sessionId: payload.sessionId,
      timestamp: now(),
      type: 'error',
      phase: 'shared-runtime',
      message: 'shared_runtime_timeout',
      payload: {
        i18nKey: 'dashboard.intelligenceLab.system.timeout',
        i18nParams: { timeoutMs },
        error: 'shared_runtime_timeout',
        timeoutMs,
      },
    }
    const trace = await appendRuntimeTraceEvent(event, {
      sessionId: payload.sessionId,
      userId,
      runId,
      eventType: timeoutEvent.type,
      phase: timeoutEvent.phase,
      payload: timeoutEvent as unknown as Record<string, unknown>,
      status: 'failed',
    })
    timeoutEvent.seq = trace.seq
    streamEventCount += 1
    await options.emit?.(timeoutEvent)

    const metrics = buildMetrics(payload.sessionId, startedAt)
    metrics.status = 'failed'
    metrics.failedActions = 1
    metrics.streamEventCount = streamEventCount
    await upsertRuntimeSession(event, {
      sessionId: payload.sessionId,
      userId,
      runId,
      status: 'failed',
      phase: 'shared-runtime',
      objective: payload.message,
      state: { finalMessage, metrics, error: 'shared_runtime_timeout', timeoutMs },
      pauseReason: null,
    })

    return {
      sessionId: payload.sessionId,
      objective: payload.message,
      actions: [],
      results: [],
      reflection: finalMessage,
      followUp: { summary: '', nextActions: [], revisitInHours: 24 },
      metrics,
      providerId: 'shared-runtime',
      providerName: 'shared-runtime',
      model: 'shared-runtime',
      traceId: runId,
    }
  }

  const metrics = buildMetrics(payload.sessionId, startedAt)
  metrics.streamEventCount = streamEventCount
  await upsertRuntimeSession(event, {
    sessionId: payload.sessionId,
    userId,
    runId,
    status: 'completed',
    phase: 'done',
    objective: payload.message,
    state: { finalMessage, metrics },
    pauseReason: null,
  })

  return {
    sessionId: payload.sessionId,
    objective: payload.message,
    actions: [],
    results: [],
    reflection: finalMessage,
    followUp: { summary: '', nextActions: [], revisitInHours: 24 },
    metrics,
    providerId: 'shared-runtime',
    providerName: 'shared-runtime',
    model: 'shared-runtime',
    traceId: runId,
  }
}
