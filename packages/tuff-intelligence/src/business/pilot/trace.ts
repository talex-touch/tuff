import type { TraceRecord } from '../../store/store-adapter'
import type { PilotStreamEvent } from './types'
import { isPilotSeqOptionalEventType } from './types'
import { toPilotSafeRecord } from './utils'

export interface PilotSequencedTraceLike {
  seq: number
  type: string
}

const PILOT_RUNTIME_CARD_EVENT_TYPES = new Set([
  'intent.started',
  'intent.completed',
  'planning.started',
  'planning.updated',
  'planning.finished',
  'memory.context',
  'memory.updated',
  'websearch.decision',
  'websearch.executed',
  'websearch.skipped',
  'thinking.delta',
  'thinking.final',
])

const PILOT_LIFECYCLE_TRACE_EVENT_TYPES = new Set([
  'stream.started',
  'replay.started',
  'replay.finished',
  'turn.started',
  'turn.finished',
])

export function normalizePilotStreamSeq(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }
  return Math.max(1, Math.floor(parsed))
}

export function buildPilotTraceKey(seq: number, type: string): string {
  return `${seq}:${type}`
}

export function appendPilotTraceSorted<T extends PilotSequencedTraceLike>(
  list: T[],
  traceKeySet: Set<string>,
  item: T,
  maxItems = 800,
): number {
  const seq = normalizePilotStreamSeq(item.seq)
  const type = String(item.type || 'unknown').trim() || 'unknown'
  if (seq <= 0) {
    return 0
  }

  const key = buildPilotTraceKey(seq, type)
  if (traceKeySet.has(key)) {
    return seq
  }

  const nextItem = {
    ...item,
    seq,
    type,
  }

  traceKeySet.add(key)
  const tail = list[list.length - 1]
  if (!tail || tail.seq <= seq) {
    list.push(nextItem)
  }
  else {
    let index = list.length
    while (index > 0) {
      const previous = list[index - 1]
      if (!previous || previous.seq <= seq) {
        break
      }
      index -= 1
    }
    list.splice(index, 0, nextItem)
  }

  if (list.length > maxItems) {
    const removed = list.splice(0, list.length - maxItems)
    for (const trace of removed) {
      traceKeySet.delete(buildPilotTraceKey(trace.seq, trace.type))
    }
  }

  return seq
}

export function isPilotRuntimeCardEventType(type: unknown): boolean {
  return PILOT_RUNTIME_CARD_EVENT_TYPES.has(String(type || '').trim())
}

export function isPilotLifecycleTraceEvent(type: unknown): boolean {
  return PILOT_LIFECYCLE_TRACE_EVENT_TYPES.has(String(type || '').trim())
}

export function shouldPilotStreamEventRequireSeq(type: unknown): boolean {
  const normalized = String(type || '').trim()
  if (!normalized) {
    return false
  }
  return !isPilotSeqOptionalEventType(normalized)
}

export function mapPilotReplayTraceToStreamEvent(
  trace: TraceRecord,
): Omit<PilotStreamEvent, 'sessionId' | 'timestamp'> {
  const payload = toPilotSafeRecord(trace.payload)
  const text = typeof payload.text === 'string'
    ? payload.text
    : String(payload.text || '')
  const seq = normalizePilotStreamSeq(trace.seq)
  const detail = toPilotSafeRecord(payload.detail)
  const message = typeof payload.message === 'string'
    ? payload.message
    : undefined
  const reason = typeof payload.reason === 'string'
    ? payload.reason
    : undefined

  if (trace.type === 'assistant.delta') {
    return {
      type: 'assistant.delta',
      seq,
      delta: text,
      payload,
    }
  }

  if (trace.type === 'thinking.delta') {
    return {
      type: 'thinking.delta',
      seq,
      delta: text,
      payload,
    }
  }

  if (trace.type === 'assistant.final') {
    return {
      type: 'assistant.final',
      seq,
      message: text,
      payload,
    }
  }

  if (trace.type === 'thinking.final') {
    return {
      type: 'thinking.final',
      seq,
      message: text,
      payload,
    }
  }

  if (trace.type === 'error') {
    return {
      type: 'error',
      seq,
      message: message || 'Stream error',
      detail: Object.keys(detail).length > 0 ? detail : undefined,
      payload,
    }
  }

  return {
    type: trace.type,
    seq,
    payload,
    message,
    detail: Object.keys(detail).length > 0 ? detail : undefined,
    reason,
  }
}
