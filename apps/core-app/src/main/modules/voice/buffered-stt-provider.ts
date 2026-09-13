import type {
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceSTTPayload,
  IntelligenceSTTResult
} from '@talex-touch/tuff-intelligence'
import type {
  VoiceProviderAdapter,
  VoiceProviderEvent,
  VoiceStreamConnection,
  VoiceStreamRequest
} from '@talex-touch/tuff-voice'
import { VoiceProviderError } from '@talex-touch/tuff-voice'
import { Buffer } from 'node:buffer'
import { tuffIntelligence } from '../ai/intelligence-sdk'

export const BUFFERED_STT_MAX_PCM_BYTES = 10 * 1024 * 1024
const DEFAULT_SAMPLE_RATE = 16_000

type SttInvoker = (
  payload: IntelligenceSTTPayload,
  options?: IntelligenceInvokeOptions & { readonly signal?: AbortSignal }
) => Promise<IntelligenceInvokeResult<IntelligenceSTTResult>>

export interface BufferedSttProviderOptions {
  providerId: string
  model: string
  invoke?: SttInvoker
  authorityCheck?: () => boolean
  /** PCM bytes accepted before WAV framing; always capped by the local hard limit. */
  maxBufferBytes?: number
  /** Maximum PCM duration accepted for the frozen stream route. */
  maxDurationSec?: number
  /** Provider deadline; a shorter session deadline still wins. */
  timeoutMs?: number
}

class EventQueue<T> implements AsyncIterableIterator<T> {
  private readonly values: T[] = []
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = []
  private closed = false

  push(value: T): void {
    if (this.closed) return
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter({ value, done: false })
      return
    }
    this.values.push(value)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    while (this.waiters.length > 0) this.waiters.shift()!({ value: undefined as T, done: true })
  }

  next(): Promise<IteratorResult<T>> {
    const value = this.values.shift()
    if (value !== undefined) return Promise.resolve({ value, done: false })
    if (this.closed) return Promise.resolve({ value: undefined as T, done: true })
    const pending = Promise.withResolvers<IteratorResult<T>>()
    this.waiters.push(pending.resolve)
    return pending.promise
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this
  }
}

function normalizeSampleRate(sampleRate: number): number {
  return Number.isInteger(sampleRate) && sampleRate > 0 && sampleRate <= 192_000
    ? sampleRate
    : DEFAULT_SAMPLE_RATE
}

function encodePcm16Wav(pcm: Buffer, sampleRate: number): Buffer {
  const rate = normalizeSampleRate(sampleRate)
  const output = Buffer.allocUnsafe(44 + pcm.byteLength)
  output.write('RIFF', 0, 'ascii')
  output.writeUInt32LE(36 + pcm.byteLength, 4)
  output.write('WAVE', 8, 'ascii')
  output.write('fmt ', 12, 'ascii')
  output.writeUInt32LE(16, 16)
  output.writeUInt16LE(1, 20)
  output.writeUInt16LE(1, 22)
  output.writeUInt32LE(rate, 24)
  output.writeUInt32LE(rate * 2, 28)
  output.writeUInt16LE(2, 32)
  output.writeUInt16LE(16, 34)
  output.write('data', 36, 'ascii')
  output.writeUInt32LE(pcm.byteLength, 40)
  pcm.copy(output, 44)
  return output
}

function readResultText(result: { result?: IntelligenceSTTResult } | null | undefined): string {
  const text = result?.result?.text
  return typeof text === 'string' ? text.trim() : ''
}

function readResultLanguage(
  result: { result?: IntelligenceSTTResult } | null | undefined
): string | undefined {
  const language = result?.result?.language
  return typeof language === 'string' && language.trim() ? language.trim() : undefined
}

function readResultUsage(result: { result?: IntelligenceSTTResult } | null | undefined) {
  const seconds = result?.result?.billing?.billedSeconds
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? { durationMs: Math.round(seconds * 1000) }
    : undefined
}

function readErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = error.code
    if (typeof code === 'string' && code.trim()) return code.trim()
  }
  if (error instanceof Error && /^[A-Z0-9_:-]{3,120}$/.test(error.message.trim()))
    return error.message.trim()
  return 'VOICE_STT_FAILED'
}

function invokeDefaultStt(
  payload: IntelligenceSTTPayload,
  options?: IntelligenceInvokeOptions & { readonly signal?: AbortSignal }
): Promise<IntelligenceInvokeResult<IntelligenceSTTResult>> {
  return tuffIntelligence.audio.stt(payload, options)
}

function positiveInteger(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function minimumTimeout(first: number | undefined, second: number | undefined): number | undefined {
  const values = [positiveInteger(first), positiveInteger(second)].filter(
    (value): value is number => value !== undefined
  )
  return values.length ? Math.min(...values) : undefined
}
class BufferedSttConnection implements VoiceStreamConnection {
  readonly ready = Promise.resolve()
  readonly events: AsyncIterable<VoiceProviderEvent>

  private readonly queue = new EventQueue<VoiceProviderEvent>()
  private readonly chunks: Buffer[] = []
  private readonly request: VoiceStreamRequest
  private readonly providerId: string
  private readonly model: string
  private readonly invoke: SttInvoker
  private readonly authorityCheck?: () => boolean
  private readonly abortController = new AbortController()
  private readonly maxBufferBytes: number
  private readonly timeoutMs?: number
  private totalBytes = 0
  private terminal: Promise<void> | null = null
  private aborted = false

  constructor(request: VoiceStreamRequest, options: BufferedSttProviderOptions) {
    this.request = request
    this.providerId = options.providerId
    this.model = options.model
    this.invoke = options.invoke ?? invokeDefaultStt
    this.authorityCheck = options.authorityCheck
    const configuredBytes = positiveInteger(options.maxBufferBytes) ?? BUFFERED_STT_MAX_PCM_BYTES
    const configuredDuration = positiveInteger(options.maxDurationSec)
    const durationBytes = configuredDuration
      ? Math.floor(
          configuredDuration *
            normalizeSampleRate(request.audio.sampleRate) *
            request.audio.channels *
            2
        )
      : BUFFERED_STT_MAX_PCM_BYTES
    this.maxBufferBytes = Math.min(BUFFERED_STT_MAX_PCM_BYTES, configuredBytes, durationBytes)
    this.timeoutMs = positiveInteger(options.timeoutMs)
    this.events = this.queue
  }

  private hasCurrentAuthority(): boolean {
    try {
      return this.authorityCheck?.() !== false
    } catch {
      return false
    }
  }
  async writePcm(chunk: Buffer | Uint8Array): Promise<void> {
    if (this.aborted)
      throw new VoiceProviderError(
        'VOICE_STREAM_ABORTED',
        'Buffered speech recognition was cancelled.'
      )
    if (this.terminal)
      throw new VoiceProviderError('VOICE_STREAM_ENDED', 'Buffered speech recognition has ended.')
    const copy = Buffer.from(chunk)
    if (copy.byteLength === 0) return
    if (this.totalBytes + copy.byteLength > this.maxBufferBytes) {
      throw new VoiceProviderError(
        'VOICE_AUDIO_TOO_LARGE',
        'Buffered speech recognition audio exceeds its bounded limit.'
      )
    }
    this.chunks.push(copy)
    this.totalBytes += copy.byteLength
  }

  async end(): Promise<void> {
    if (this.terminal) return this.terminal
    if (this.aborted) return
    this.terminal = this.finish()
    return this.terminal
  }

  async abort(reason = 'Buffered speech recognition aborted.'): Promise<void> {
    if (this.aborted) return
    this.aborted = true
    this.abortController.abort(reason)
    this.chunks.length = 0
    this.totalBytes = 0
    this.queue.close()
  }

  private async finish(): Promise<void> {
    try {
      if (this.totalBytes === 0) {
        this.queue.push({ type: 'end', requestId: this.request.requestId })
        return
      }
      if (!this.hasCurrentAuthority()) {
        throw new VoiceProviderError(
          'VOICE_ASR_AUTHORITY_CHANGED',
          'Buffered speech recognition authority changed before upload.'
        )
      }
      const pcm = Buffer.concat(this.chunks, this.totalBytes)
      const wav = encodePcm16Wav(pcm, this.request.audio.sampleRate)
      const response = await this.invoke(
        {
          audio: `data:audio/wav;base64,${wav.toString('base64')}`,
          format: 'wav',
          ...(this.request.language ? { language: this.request.language } : {})
        },
        {
          preferredProviderId: this.providerId,
          modelPreference: [this.model],
          signal: AbortSignal.any([
            ...(this.request.signal ? [this.request.signal] : []),
            this.abortController.signal
          ]),
          timeout: minimumTimeout(this.request.timeoutMs, this.timeoutMs),
          metadata: {
            caller: 'core.voice.buffered-asr',
            idempotencyKey: this.request.requestId
          }
        }
      )
      if (!this.hasCurrentAuthority()) {
        throw new VoiceProviderError(
          'VOICE_ASR_AUTHORITY_CHANGED',
          'Buffered speech recognition authority changed before delivery.'
        )
      }
      if (this.aborted) return
      const text = readResultText(response)
      if (text) {
        const language = readResultLanguage(response)
        const usage = readResultUsage(response)
        this.queue.push({
          type: 'final',
          text,
          ...(language ? { language } : {}),
          ...(usage ? { usage } : {}),
          requestId: this.request.requestId
        })
      }
      this.queue.push({ type: 'end', requestId: this.request.requestId })
    } catch (error) {
      if (!this.aborted) {
        const code = readErrorCode(error)
        this.queue.push({
          type: 'error',
          code: /^[A-Z0-9_:-]{3,120}$/.test(code) ? code : 'VOICE_STT_FAILED',
          message: 'Buffered speech recognition failed.',
          retryable: code !== 'VOICE_ASR_AUTHORITY_CHANGED',
          requestId: this.request.requestId
        })
      }
    } finally {
      this.chunks.length = 0
      this.totalBytes = 0
      this.queue.close()
    }
  }
}

/**
 * Adapts a capability-selected main-process STT route to the Voice Session stream contract.
 * It emits no partials: the selected provider is a recorded-audio endpoint, not realtime ASR.
 */
export function createBufferedSttVoiceProvider(
  options: BufferedSttProviderOptions
): VoiceProviderAdapter {
  return {
    id: 'nexus-audio-stt-buffered',
    defaultStreamModel: options.model,
    capabilities: { stream: true, upload: false, formats: ['pcm'] },
    createStream: async (request) => {
      if (
        request.audio.format !== 'pcm' ||
        request.audio.channels !== 1 ||
        request.audio.bitsPerSample !== 16 ||
        (request.audio.codec !== undefined && request.audio.codec !== 'raw')
      ) {
        throw new VoiceProviderError(
          'VOICE_AUDIO_FORMAT_UNSUPPORTED',
          'Buffered speech recognition requires mono 16-bit PCM.'
        )
      }
      if (
        !Number.isInteger(request.audio.sampleRate) ||
        request.audio.sampleRate <= 0 ||
        request.audio.sampleRate > 192_000
      ) {
        throw new VoiceProviderError(
          'VOICE_AUDIO_SAMPLE_RATE_INVALID',
          'Buffered speech recognition requires a valid PCM sample rate.'
        )
      }
      return new BufferedSttConnection(request, options)
    },
    transcribeUpload: async () => {
      throw new VoiceProviderError(
        'VOICE_UPLOAD_UNSUPPORTED',
        'Buffered speech recognition supports microphone streams only.'
      )
    }
  }
}
