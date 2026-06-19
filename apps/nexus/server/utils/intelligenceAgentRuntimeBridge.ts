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

function now(): number {
  return Date.now()
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
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

  for await (const envelope of runtimePort.onMessage(buildInput(userId, payload))) {
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
