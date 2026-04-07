import type { AgentEnvelope } from '../../protocol/envelope'
import type { UserMessageInput } from '../../protocol/session'
import type { ConversationAgentPort } from '../../runtime/conversation-agent-port'
import type { TraceRecord } from '../../store/store-adapter'
import type { PilotStreamDraftEvent, PilotStreamEmitOptions } from './types'
import {
  mapAgentEnvelopeToPilotStreamEvent,
  shouldPilotPersistTraceEvent,
} from './types'
import { mapPilotReplayTraceToStreamEvent } from './trace'

export const PILOT_DEFAULT_KEEPALIVE_MS = 10_000
export const PILOT_DEFAULT_TRACE_REPLAY_LIMIT = 1_000

export interface RunPilotConversationStreamOptions {
  runtime: ConversationAgentPort
  sessionId: string
  message?: string
  fromSeq?: number
  attachments?: UserMessageInput['attachments']
  metadata?: Record<string, unknown>
  keepaliveMs?: number
  replayLimit?: number
  listTrace?: (sessionId: string, fromSeq: number, limit: number) => Promise<TraceRecord[]>
  isCancelled?: () => boolean
  emit: (
    payload: Omit<PilotStreamDraftEvent, 'sessionId' | 'timestamp'> & { sessionId?: string, timestamp?: number },
    options?: PilotStreamEmitOptions,
  ) => Promise<void>
}

export interface RunPilotConversationStreamResult {
  aborted: boolean
  hasTurn: boolean
}

function clampReplayLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return PILOT_DEFAULT_TRACE_REPLAY_LIMIT
  }
  return Math.min(Math.max(Math.floor(limit), 1), PILOT_DEFAULT_TRACE_REPLAY_LIMIT)
}

function isCancelled(options: RunPilotConversationStreamOptions): boolean {
  return Boolean(options.isCancelled?.())
}

async function emit(
  options: RunPilotConversationStreamOptions,
  payload: Omit<PilotStreamDraftEvent, 'sessionId' | 'timestamp'> & { sessionId?: string, timestamp?: number },
  emitOptions?: PilotStreamEmitOptions,
): Promise<void> {
  await options.emit(payload, emitOptions)
}

async function replayTrace(
  options: RunPilotConversationStreamOptions,
  persistLifecycleEvents: boolean,
): Promise<void> {
  const fromSeq = Number.isFinite(options.fromSeq)
    ? Math.max(1, Math.floor(Number(options.fromSeq)))
    : undefined
  if (!fromSeq || !options.listTrace) {
    return
  }

  const replayLimit = clampReplayLimit(Number(options.replayLimit ?? PILOT_DEFAULT_TRACE_REPLAY_LIMIT))

  await emit(options, {
    type: 'replay.started',
    payload: {
      fromSeq,
      limit: replayLimit,
    },
  }, persistLifecycleEvents
    ? {
        persist: true,
        tracePayload: {
          fromSeq,
          limit: replayLimit,
        },
      }
    : undefined)

  const traces = await options.listTrace(options.sessionId, fromSeq, replayLimit)
  const replayableTraces = traces.filter(trace => shouldPilotPersistTraceEvent(trace.type))
  for (const trace of replayableTraces) {
    if (isCancelled(options)) {
      return
    }
    await emit(options, {
      ...mapPilotReplayTraceToStreamEvent(trace),
      replay: true,
    })
  }

  await emit(options, {
    type: 'replay.finished',
    payload: {
      fromSeq,
      replayCount: replayableTraces.length,
    },
  }, persistLifecycleEvents
    ? {
        persist: true,
        tracePayload: {
          fromSeq,
          replayCount: replayableTraces.length,
        },
      }
    : undefined)
}

function toTurnInput(options: RunPilotConversationStreamOptions): UserMessageInput {
  return {
    sessionId: options.sessionId,
    message: String(options.message || ''),
    attachments: Array.isArray(options.attachments) ? options.attachments : undefined,
    metadata: options.metadata,
  }
}

async function runTurn(options: RunPilotConversationStreamOptions): Promise<boolean> {
  const message = String(options.message || '').trim()
  const attachmentCount = Array.isArray(options.attachments) ? options.attachments.length : 0

  if (!message && attachmentCount <= 0) {
    return false
  }

  const turnStartedAt = Date.now()
  await emit(options, {
    type: 'turn.started',
    payload: {
      messageChars: message.length,
      attachmentCount,
    },
  }, {
    persist: true,
    tracePayload: {
      messageChars: message.length,
      attachmentCount,
    },
  })

  const turnInput = toTurnInput(options)
  for await (const envelope of options.runtime.onMessage(turnInput)) {
    if (isCancelled(options)) {
      return true
    }

    const mapped = mapAgentEnvelopeToPilotStreamEvent(envelope as AgentEnvelope)
    await emit(options, mapped)

    const envelopeSeq = typeof mapped.seq === 'number' && Number.isFinite(mapped.seq)
      ? mapped.seq
      : null
    await emit(options, {
      type: 'run.metrics',
      sessionId: envelope.sessionId,
      turnId: envelope.turnId,
      payload: {
        eventType: envelope.type,
        envelopeSeq,
      },
    })
  }

  await emit(options, {
    type: 'turn.finished',
    payload: {
      durationMs: Date.now() - turnStartedAt,
    },
  }, {
    persist: true,
    tracePayload: {
      durationMs: Date.now() - turnStartedAt,
    },
  })

  return false
}

export async function runPilotConversationStream(
  options: RunPilotConversationStreamOptions,
): Promise<RunPilotConversationStreamResult> {
  const hasTurnMessage = Boolean(String(options.message || '').trim())
  const attachmentCount = Array.isArray(options.attachments) ? options.attachments.length : 0
  const hasTurnInput = hasTurnMessage || attachmentCount > 0

  await emit(options, {
    type: 'stream.started',
    payload: {
      hasMessage: hasTurnInput,
      fromSeq: Number.isFinite(options.fromSeq) ? Math.max(1, Math.floor(Number(options.fromSeq))) : null,
      keepaliveMs: Number(options.keepaliveMs || PILOT_DEFAULT_KEEPALIVE_MS),
      attachmentCount,
    },
  }, hasTurnInput
    ? {
        persist: true,
        tracePayload: {
          hasMessage: hasTurnInput,
          fromSeq: Number.isFinite(options.fromSeq) ? Math.max(1, Math.floor(Number(options.fromSeq))) : null,
          keepaliveMs: Number(options.keepaliveMs || PILOT_DEFAULT_KEEPALIVE_MS),
          attachmentCount,
        },
      }
    : undefined)

  await replayTrace(options, hasTurnInput)
  if (isCancelled(options)) {
    return { aborted: true, hasTurn: false }
  }

  const aborted = await runTurn(options)
  return {
    aborted,
    hasTurn: hasTurnInput,
  }
}
