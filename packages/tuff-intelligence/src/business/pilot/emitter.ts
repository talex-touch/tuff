import type { PilotStreamEmitOptions, PilotStreamEvent } from './types'
import { toPilotSafeRecord } from './utils'

export interface PilotTraceAppendRecord {
  sessionId: string
  seq: number
  type: string
  payload: Record<string, unknown>
}

export interface CreatePilotStreamEmitterOptions {
  sessionId: string
  appendRetry?: number
  now?: () => number
  getLastSeq: (sessionId: string) => Promise<number>
  appendTrace: (record: PilotTraceAppendRecord) => Promise<void>
  send: (payload: PilotStreamEvent & { sessionId: string, timestamp: number }) => Promise<void> | void
}

function isTraceSeqConflict(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : String(error || '')
  const normalized = message.toLowerCase()
  return normalized.includes('unique') && normalized.includes('seq')
}

export function createPilotStreamEmitter(options: CreatePilotStreamEmitterOptions) {
  const appendRetry = Number.isFinite(options.appendRetry) ? Math.max(1, Math.floor(Number(options.appendRetry))) : 3
  const now = options.now || Date.now
  let seqCursor = 0

  async function syncSessionSeq(): Promise<void> {
    const latest = Number(await options.getLastSeq(options.sessionId) || 0)
    seqCursor = Math.max(seqCursor, Number.isFinite(latest) ? latest : 0)
  }

  async function appendTrace(type: string, payload: Record<string, unknown>): Promise<number> {
    let lastError: unknown
    for (let attempt = 0; attempt < appendRetry; attempt++) {
      await syncSessionSeq()
      const nextSeq = seqCursor + 1
      try {
        await options.appendTrace({
          sessionId: options.sessionId,
          seq: nextSeq,
          type,
          payload,
        })
        seqCursor = nextSeq
        return nextSeq
      }
      catch (error) {
        lastError = error
        if (!isTraceSeqConflict(error) || attempt >= appendRetry - 1) {
          throw error
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('append trace failed')
  }

  async function emit(
    payload: Omit<PilotStreamEvent, 'sessionId' | 'timestamp'> & { sessionId?: string, timestamp?: number },
    emitOptions: PilotStreamEmitOptions = {},
  ): Promise<void> {
    let seq = Number.isFinite(payload.seq) ? Number(payload.seq) : undefined
    if (Number.isFinite(seq)) {
      seqCursor = Math.max(seqCursor, Number(seq))
    }
    else if (emitOptions.persist) {
      seq = await appendTrace(
        payload.type,
        emitOptions.tracePayload || toPilotSafeRecord(payload.payload),
      )
    }

    await options.send({
      ...payload,
      sessionId: payload.sessionId || options.sessionId,
      seq,
      timestamp: payload.timestamp || now(),
    })
  }

  return {
    emit,
    getSeqCursor() {
      return seqCursor
    },
    setSeqCursor(next: number) {
      if (Number.isFinite(next)) {
        seqCursor = Math.max(0, Math.floor(next))
      }
    },
  }
}
