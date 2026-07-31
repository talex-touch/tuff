/**
 * Streaming ASR over a generic Whisper-compatible WebSocket.
 *
 * Protocol (server the user points us at must speak this):
 * - We connect, then send a JSON start frame:
 *     { "type": "start", "sampleRate": 16000, "encoding": "pcm_s16le", "language"?: string }
 * - We then stream BINARY frames of raw 16-bit little-endian mono PCM.
 * - When the user stops, we send { "type": "stop" }.
 * - The server streams back JSON text frames. A message is treated as:
 *     final  when `type:"final"` | `is_final:true` | `final:true`
 *     partial otherwise
 *   Transcript text is read from `text` | `transcript` | `partial`.
 *
 * Configure via env for now (a settings field is the productization step):
 *   TUFF_VOICE_ASR_WS_URL          e.g. wss://host/asr?token=... (embed auth in the URL)
 *   TUFF_VOICE_ASR_WS_SAMPLE_RATE  optional, default 16000
 */
import process from 'node:process'
import type { VoiceAsrStreamEvent } from '@talex-touch/utils/transport/sdk/domains/voice'
import { createLogger } from '../../utils/logger'

const log = createLogger('VoiceASR')
const FRAME_INTERVAL_MS = 200
const WS_OPEN = 1

interface MinimalWebSocket {
  readyState: number
  binaryType: string
  send: (data: string | ArrayBufferView) => void
  close: () => void
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onerror: ((event: unknown) => void) | null
  onclose: (() => void) | null
}

export interface StreamingAsrConfig {
  url: string
  sampleRate: number
}

/** Reads the streaming-ASR WebSocket endpoint from the environment (null when unset). */
export function getStreamingAsrConfig(): StreamingAsrConfig | null {
  const url = process.env.TUFF_VOICE_ASR_WS_URL?.trim()
  if (!url) return null
  const rate = Number(process.env.TUFF_VOICE_ASR_WS_SAMPLE_RATE)
  return { url, sampleRate: Number.isFinite(rate) && rate > 0 ? rate : 16000 }
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

/** Parses a server text frame into a partial/final event, or null to ignore. */
export function parseAsrMessage(data: unknown): VoiceAsrStreamEvent | null {
  if (typeof data !== 'string') return null
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(data) as Record<string, unknown>
  } catch {
    return null
  }
  const text = firstString(obj.text, obj.transcript, obj.partial)
  if (!text) return null
  const isFinal = obj.type === 'final' || obj.is_final === true || obj.final === true
  return isFinal ? { type: 'final', text } : { type: 'partial', text }
}

function streamCancellationError(): Error {
  return new Error('VOICE_ASR_STREAM_CANCELLED')
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw streamCancellationError()
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms))
  throwIfCancelled(signal)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(streamCancellationError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

interface EventQueue<T> {
  push: (item: T) => void
  fail: (error: Error) => void
  end: () => void
  iterate: () => AsyncGenerator<T>
}

function createQueue<T>(): EventQueue<T> {
  type Slot = { kind: 'item'; value: T } | { kind: 'error'; error: Error } | { kind: 'end' }
  const buffer: Slot[] = []
  let notify: (() => void) | null = null
  let terminal = false
  const wake = (): void => {
    const fn = notify
    notify = null
    fn?.()
  }
  return {
    push: (value) => {
      if (terminal) return
      buffer.push({ kind: 'item', value })
      wake()
    },
    fail: (error) => {
      if (terminal) return
      terminal = true
      buffer.push({ kind: 'error', error })
      wake()
    },
    end: () => {
      if (terminal) return
      terminal = true
      buffer.push({ kind: 'end' })
      wake()
    },
    async *iterate() {
      for (;;) {
        while (buffer.length) {
          const slot = buffer.shift()!
          if (slot.kind === 'end') return
          if (slot.kind === 'error') throw slot.error
          yield slot.value
        }
        await new Promise<void>((resolve) => {
          notify = resolve
        })
      }
    }
  }
}

export interface AsrStreamOptions {
  url: string
  sampleRate: number
  language?: string
  signal?: AbortSignal
  /** Pull newly-captured PCM (16-bit LE mono) since the last call; empty when none. */
  drainFrames: () => Buffer
  /** Returns false once native capture has auto-stopped. */
  isCapturing: () => boolean
}

/**
 * Streams captured PCM to a WebSocket ASR endpoint and yields partial/final events.
 * Does NOT emit a terminal `end` — the caller adds it after finalization.
 */
export async function* createAsrStream(
  options: AsrStreamOptions
): AsyncGenerator<VoiceAsrStreamEvent> {
  throwIfCancelled(options.signal)
  const WebSocketCtor = (
    globalThis as unknown as { WebSocket?: new (url: string) => MinimalWebSocket }
  ).WebSocket
  if (typeof WebSocketCtor !== 'function') {
    throw new Error('WebSocket is unavailable in this runtime')
  }

  const ws = new WebSocketCtor(options.url)
  ws.binaryType = 'arraybuffer'
  const queue = createQueue<VoiceAsrStreamEvent>()
  const pumpController = new AbortController()

  let opened = false
  let openResolve: (() => void) | null = null
  let openReject: ((error: Error) => void) | null = null
  let pump: Promise<void> = Promise.resolve()

  const closeSocket = (): void => {
    try {
      ws.close()
    } catch (error) {
      log.debug('ASR websocket close failed', { error })
    }
  }
  const onAbort = (): void => {
    const error = streamCancellationError()
    pumpController.abort()
    openReject?.(error)
    queue.fail(error)
    closeSocket()
  }

  ws.onopen = () => {
    opened = true
    openResolve?.()
  }
  ws.onmessage = (event) => {
    const parsed = parseAsrMessage(event.data)
    if (parsed) queue.push(parsed)
  }
  ws.onerror = () => {
    if (!opened) openReject?.(new Error('ASR websocket failed to open'))
    else queue.fail(new Error('ASR websocket error'))
  }
  ws.onclose = () => {
    if (!opened) openReject?.(new Error('ASR websocket closed before open'))
    queue.end()
  }
  options.signal?.addEventListener('abort', onAbort, { once: true })

  try {
    await new Promise<void>((resolve, reject) => {
      if (opened) return resolve()
      openResolve = resolve
      openReject = reject
    })
    throwIfCancelled(options.signal)

    ws.send(
      JSON.stringify({
        type: 'start',
        sampleRate: options.sampleRate,
        encoding: 'pcm_s16le',
        ...(options.language ? { language: options.language } : {})
      })
    )

    pump = (async () => {
      try {
        for (;;) {
          await delay(FRAME_INTERVAL_MS, pumpController.signal)
          const active = options.isCapturing()
          const pcm = options.drainFrames()
          if (pcm && pcm.length > 0 && ws.readyState === WS_OPEN) {
            ws.send(pcm)
          }
          if (!active) break
        }
        if (ws.readyState === WS_OPEN) ws.send(JSON.stringify({ type: 'stop' }))
      } catch (error) {
        if (!pumpController.signal.aborted) {
          queue.fail(error instanceof Error ? error : new Error(String(error)))
        }
      }
    })()

    for await (const event of queue.iterate()) {
      throwIfCancelled(options.signal)
      yield event
      if (event.type === 'final') break
    }
    throwIfCancelled(options.signal)
  } finally {
    options.signal?.removeEventListener('abort', onAbort)
    pumpController.abort()
    closeSocket()
    ws.onopen = null
    ws.onmessage = null
    ws.onerror = null
    ws.onclose = null
    await pump.catch(() => {})
  }
}
