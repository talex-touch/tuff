import type { AgentEnvelope, PersistedAgentEnvelope } from '../../protocol/envelope'
import {
  toPilotJsonSafe,
  toPilotSafeRecord,
} from './utils'

export type PilotSeqOptionalEventType =
  | 'stream.started'
  | 'stream.heartbeat'
  | 'replay.started'
  | 'replay.finished'
  | 'run.metrics'
  | 'done'
  | 'error'

export interface PilotStreamEventBase {
  type: string
  sessionId?: string
  turnId?: string
  delta?: string
  message?: string
  reason?: string
  detail?: Record<string, unknown>
  envelope?: Record<string, unknown>
  payload?: Record<string, unknown>
  replay?: boolean
  timestamp?: number
}

export type PilotStreamEvent =
  | (PilotStreamEventBase & {
      type: PilotSeqOptionalEventType
      seq?: number
    })
  | (PilotStreamEventBase & {
      type: string
      seq: number
    })

export type PilotStreamDraftEvent = PilotStreamEventBase & {
  seq?: number
}

const PILOT_SEQ_OPTIONAL_EVENT_TYPES = new Set<PilotSeqOptionalEventType>([
  'stream.started',
  'stream.heartbeat',
  'replay.started',
  'replay.finished',
  'run.metrics',
  'done',
  'error',
])

export interface PilotStreamEmitOptions {
  persist?: boolean
  tracePayload?: Record<string, unknown>
}

export interface PilotAuditRecord {
  type: string
  payload: Record<string, unknown>
}

export function isPilotSeqOptionalEventType(type: unknown): type is PilotSeqOptionalEventType {
  return PILOT_SEQ_OPTIONAL_EVENT_TYPES.has(String(type || '').trim() as PilotSeqOptionalEventType)
}

function requirePersistedAgentEnvelope(envelope: AgentEnvelope): PersistedAgentEnvelope {
  const meta = toPilotSafeRecord(envelope.meta)
  const seq = Number(meta.seq)
  const traceId = String(meta.traceId || '').trim()
  if (!Number.isFinite(seq) || seq <= 0 || !traceId) {
    throw new Error(`Pilot runtime emitted non-persisted envelope "${envelope.type}" without seq/traceId.`)
  }
  return envelope as PersistedAgentEnvelope
}

export function getEnvelopeText(envelope: AgentEnvelope): string {
  const payload = toPilotSafeRecord(envelope.payload)
  const text = payload.text
  if (typeof text === 'string') {
    return text
  }
  if (text === null || text === undefined) {
    return ''
  }
  return String(text)
}

export function getEnvelopeSeq(envelope: AgentEnvelope): number | undefined {
  const meta = toPilotSafeRecord(envelope.meta)
  const seq = Number(meta.seq)
  return Number.isFinite(seq) ? seq : undefined
}

export function buildPilotPlanningTodos(message: string, attachmentCount: number): string[] {
  const todos: string[] = [
    'Analyze user intent and constraints from latest message.',
    'Call upstream model and stream normalized decision output.',
  ]
  if (attachmentCount > 0) {
    todos.splice(1, 0, `Process ${attachmentCount} attachment(s) metadata in context.`)
  }
  if (message.length > 600) {
    todos.push('Summarize long input before response generation.')
  }
  todos.push('Finalize assistant response and emit trace metrics.')
  return todos
}

export function mapAgentEnvelopeToPilotStreamEvent(envelope: AgentEnvelope): PilotStreamEvent {
  const persisted = requirePersistedAgentEnvelope(envelope)
  const text = getEnvelopeText(envelope)
  const seq = persisted.meta.seq
  const event: PilotStreamEvent = {
    type: envelope.type,
    sessionId: envelope.sessionId,
    turnId: envelope.turnId,
    seq,
    envelope: toPilotJsonSafe(envelope as unknown as Record<string, unknown>),
  }

  if (envelope.type === 'assistant.delta') {
    event.type = 'assistant.delta'
    event.delta = text
  }
  else if (envelope.type === 'thinking.delta') {
    event.type = 'thinking.delta'
    event.delta = text
  }
  else if (envelope.type === 'thinking.final') {
    event.type = 'thinking.final'
    event.message = text
  }
  else if (envelope.type === 'assistant.final') {
    event.type = 'assistant.final'
    event.message = text
  }

  return event
}

export function mapPilotAuditToStreamEvent(record: PilotAuditRecord): PilotStreamDraftEvent {
  return {
    type: 'run.audit',
    payload: toPilotJsonSafe({
      auditType: record.type,
      ...toPilotSafeRecord(record.payload),
    }),
  }
}
