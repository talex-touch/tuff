import type { TransportPortEnvelope } from '../../events'
import type { StreamMessage } from '../../types'
import { STREAM_SUFFIXES } from '../constants'

export interface StreamEventNames {
  start: string
  cancel: string
  data: (streamId: string) => string
  end: (streamId: string) => string
  error: (streamId: string) => string
}

export function createStreamId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function getStreamEventNames(eventName: string): StreamEventNames {
  return {
    start: `${eventName}${STREAM_SUFFIXES.START}`,
    cancel: `${eventName}${STREAM_SUFFIXES.CANCEL}`,
    data: streamId => `${eventName}${STREAM_SUFFIXES.DATA}:${streamId}`,
    end: streamId => `${eventName}${STREAM_SUFFIXES.END}:${streamId}`,
    error: streamId => `${eventName}${STREAM_SUFFIXES.ERROR}:${streamId}`,
  }
}

export function buildStreamStartPayload<TReq>(payload: TReq, streamId: string): { streamId: string } {
  if (payload && typeof payload === 'object') {
    return { streamId, ...(payload as object) }
  }
  return { streamId }
}

export function unwrapChannelPayload<T>(raw: unknown): T {
  if (!raw || typeof raw !== 'object') {
    return raw as T
  }

  const record = raw as Record<string, unknown>
  if ('data' in record && 'header' in record) {
    return record.data as T
  }

  return raw as T
}

export function normalizePortStreamMessage<TChunk>(raw: unknown): StreamMessage<TChunk> | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const record = raw as StreamMessage<TChunk> & TransportPortEnvelope<StreamMessage<TChunk>>
  const rawType = (record as { type?: string }).type
  const rawStreamId = (record as { streamId?: string | number }).streamId
  if (!rawType || rawStreamId === undefined || rawStreamId === null) {
    return null
  }

  const streamId = String(rawStreamId)

  if (rawType === 'data') {
    const chunk = (record as { chunk?: TChunk }).chunk ?? (record as { payload?: { chunk?: TChunk } }).payload?.chunk
    return { type: 'data', streamId, chunk }
  }

  if (rawType === 'error') {
    const errorRecord = record as { error?: { message?: string } | string, payload?: { error?: string } }
    const errorMessage = typeof errorRecord.error === 'string'
      ? errorRecord.error
      : errorRecord.error?.message ?? errorRecord.payload?.error
    return { type: 'error', streamId, error: errorMessage }
  }

  if (rawType === 'end' || rawType === 'close') {
    return { type: 'end', streamId }
  }

  return null
}

export function buildStreamDataEnvelope<TChunk>(
  eventName: string,
  streamId: string,
  chunk: TChunk,
  portId?: string,
): TransportPortEnvelope<{ chunk: TChunk }> {
  return {
    channel: eventName,
    portId,
    streamId,
    type: 'data',
    payload: { chunk },
  }
}

export function buildStreamErrorEnvelope(
  eventName: string,
  streamId: string,
  errorMessage: string,
  portId?: string,
): TransportPortEnvelope<{ error: string }> {
  return {
    channel: eventName,
    portId,
    streamId,
    type: 'error',
    payload: { error: errorMessage },
    error: { code: 'stream_error', message: errorMessage },
  }
}

export function buildStreamEndEnvelope(
  eventName: string,
  streamId: string,
  portId?: string,
): TransportPortEnvelope {
  return {
    channel: eventName,
    portId,
    streamId,
    type: 'close',
  }
}

export function toStreamError(error: unknown, fallback = 'Stream error'): Error {
  if (error instanceof Error) {
    return error
  }

  const message = typeof error === 'string'
    ? error
    : error === undefined || error === null
      ? fallback
      : String(error)

  return new Error(message || fallback)
}
