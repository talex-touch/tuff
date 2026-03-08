import type { AgentEnvelope } from '../../protocol/envelope'
import {
  toPilotJsonSafe,
  toPilotSafeRecord,
} from './utils'

export interface PilotStreamEvent {
  type: string
  sessionId?: string
  turnId?: string
  seq?: number
  delta?: string
  message?: string
  reason?: string
  detail?: Record<string, unknown>
  envelope?: Record<string, unknown>
  payload?: Record<string, unknown>
  replay?: boolean
  timestamp?: number
}

export interface PilotStreamEmitOptions {
  persist?: boolean
  tracePayload?: Record<string, unknown>
}

export interface PilotAuditRecord {
  type: string
  payload: Record<string, unknown>
}

export function getEnvelopeText(envelope: AgentEnvelope): string {
  const payload = toPilotSafeRecord(envelope.payload)
  return String(payload.text || '').trim()
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
  const text = getEnvelopeText(envelope)
  const seq = getEnvelopeSeq(envelope)
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
  else if (envelope.type === 'assistant.final') {
    event.type = 'assistant.final'
    event.message = text
  }

  return event
}

export function mapPilotAuditToStreamEvent(record: PilotAuditRecord): PilotStreamEvent {
  return {
    type: 'run.audit',
    payload: toPilotJsonSafe({
      auditType: record.type,
      ...toPilotSafeRecord(record.payload),
    }),
  }
}
