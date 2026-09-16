import type {
  VoiceProviderAdapter,
  VoiceProviderCapabilities,
  VoiceProviderEvent,
  VoiceRecognitionResult,
  VoiceSegment,
  VoiceStreamConnection,
  VoiceStreamRequest,
  VoiceUploadRequest,
} from '../contracts'
import type { LocalAsrEngine, LocalTranscribeOptions, LocalTranscribeResult, ResolvedLocalModel } from '../local/types'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AsyncEventQueue, createAbortError } from '../async'
import { assertVoiceProviderRequestId, VoiceProviderError } from '../contracts'
import { resolveModelEngine } from '../local/engine-factory'
import { LocalEngineError } from '../local/types'
import { pcmDurationMs, wrapPcmAsWav } from '../local/wav'

/**
 * Speech recognition that never leaves the machine.
 *
 * The cloud providers in this package trade latency for quality: audio is streamed to
 * a service and the service streams hypotheses back. This adapter has no service, which
 * changes the shape of the problem in two ways worth stating plainly.
 *
 * First, there is no session to keep open, so `ready` is not a handshake — it is an
 * availability probe. It resolves only when the executable and the weights are both
 * actually on disk, because the useful moment to tell a user their model is missing is
 * before they speak, not after.
 *
 * Second, an engine that decodes whole files cannot produce a partial for free. Partials
 * here are produced by re-decoding everything captured so far on a cadence. That is
 * roughly quadratic in utterance length, so it is throttled and eventually stopped;
 * the final decode is always authoritative and always runs.
 */

export interface LocalOfflineVoiceProviderOptions {
  model: ResolvedLocalModel
  /** Override for tests and benchmarks; otherwise the descriptor's engine is constructed. */
  engine?: LocalAsrEngine
  binaryPath?: string
  threads?: number
  timeoutMs?: number
  language?: string
  /**
   * Bias decoding toward Simplified Chinese. Defaults to the descriptor's own
   * declaration, which is why a model that emits Traditional must not leave this unset.
   */
  preferSimplifiedChinese?: boolean
  /** Cadence for re-decoding while the user is still speaking. */
  partialIntervalMs?: number
  /** Past this much captured audio, partials stop and only the final decode runs. */
  maxPartialAudioMs?: number
}

const DEFAULT_PARTIAL_INTERVAL_MS = 1_200
const DEFAULT_MAX_PARTIAL_AUDIO_MS = 45_000

export class LocalOfflineVoiceProvider implements VoiceProviderAdapter {
  readonly id = 'local-offline'
  readonly kind = 'local' as const
  readonly capabilities: VoiceProviderCapabilities = {
    stream: true,
    upload: true,
    // The engine reads containers off disk, so these are what it can actually open.
    formats: ['pcm', 'wav', 'mp3', 'ogg'],
  }

  readonly defaultStreamModel: string
  readonly defaultUploadModel: string

  private readonly model: ResolvedLocalModel
  private readonly engine: LocalAsrEngine
  private readonly options: LocalOfflineVoiceProviderOptions

  constructor(options: LocalOfflineVoiceProviderOptions) {
    this.options = options
    this.model = options.model
    this.engine = resolveModelEngine(options.model, {
      ...(options.engine === undefined ? {} : { engine: options.engine }),
      ...(options.binaryPath === undefined ? {} : { binaryPath: options.binaryPath }),
      ...(options.threads === undefined ? {} : { threads: options.threads }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    })
    this.defaultStreamModel = `${options.model.descriptor.id}@${options.model.descriptor.version}`
    this.defaultUploadModel = this.defaultStreamModel
  }

  async createStream(request: VoiceStreamRequest): Promise<VoiceStreamConnection> {
    const requestId = assertVoiceProviderRequestId(request.requestId)
    assertLocalStreamAudio(request)

    const { sampleRate, channels } = request.audio
    const bytesPerMs = (sampleRate * channels * 2) / 1000
    const partialTriggerBytes = Math.max(1, Math.round(bytesPerMs * (this.options.partialIntervalMs ?? DEFAULT_PARTIAL_INTERVAL_MS)))
    const maxPartialBytes = Math.max(partialTriggerBytes, Math.round(bytesPerMs * (this.options.maxPartialAudioMs ?? DEFAULT_MAX_PARTIAL_AUDIO_MS)))

    const events = new AsyncEventQueue<VoiceProviderEvent>()
    const captured: Uint8Array[] = []
    let capturedBytes = 0
    /** Audio length at which the last partial decode was started; the cadence is measured from here. */
    let partialMarkBytes = 0
    let lastPartialText = ''
    let partialInFlight = false
    /** The in-flight partial decode, so stopping can cancel work whose answer is already moot. */
    let partialAbort: AbortController | null = null
    let closed = false

    const decodeCaptured = async (extraSignal?: AbortSignal): Promise<LocalTranscribeResult> =>
      this.engine.transcribe(
        { kind: 'pcm', bytes: Buffer.concat(captured, capturedBytes), sampleRate, channels },
        this.model,
        this.transcribeOptions(request, false, extraSignal),
      )

    const ready = (async () => {
      const availability = await this.engine.checkAvailability(this.model, this.options.binaryPath)
      if (!availability.available) {
        throw new LocalEngineError(
          availability.reason?.code ?? 'LOCAL_ENGINE_UNAVAILABLE',
          availability.reason?.message ?? 'The on-device speech engine is unavailable.',
        )
      }
    })()

    const settle = async (): Promise<void> => {
      if (closed)
        return
      closed = true
      // A partial that is still decoding was asked about audio the final decode now covers
      // in full. Letting it finish would hold the host's single decode slot and delay the
      // answer the user is actually waiting for, so it is cancelled instead.
      partialAbort?.abort()
      partialAbort = null
      try {
        const result = capturedBytes === 0
          ? { text: '' }
          : await decodeCaptured()
        events.push({
          type: 'final',
          text: result.text,
          requestId,
          ...(result.language ? { language: result.language } : {}),
          ...(result.segments ? { segments: toVoiceSegments(result.segments) } : {}),
          usage: {
            durationMs: pcmDurationMs(capturedBytes, { sampleRate, channels, bitsPerSample: 16 }),
            inputBytes: capturedBytes,
          },
        })
        events.push({ type: 'end', requestId })
        events.end()
      }
      catch (error) {
        events.fail(toVoiceProviderError(error, requestId))
      }
    }

    return {
      ready,
      events,
      writePcm: async (chunk: Uint8Array | Buffer) => {
        if (closed)
          return
        const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
        captured.push(bytes)
        capturedBytes += bytes.byteLength

        if (partialInFlight || capturedBytes > maxPartialBytes)
          return
        if (capturedBytes - partialMarkBytes < partialTriggerBytes)
          return
        partialMarkBytes = capturedBytes
        partialInFlight = true
        const controller = new AbortController()
        partialAbort = controller
        // A partial is advisory: a decode that fails here must not close the stream, so the
        // failure is dropped and the final decode is left to report the real problem.
        void (async () => {
          try {
            const result = await decodeCaptured(controller.signal)
            if (!closed && result.text && result.text !== lastPartialText) {
              lastPartialText = result.text
              events.push({ type: 'partial', text: result.text, requestId })
            }
          }
          catch {
            // Intentionally ignored; see above.
          }
          finally {
            partialInFlight = false
            if (partialAbort === controller)
              partialAbort = null
          }
        })()
      },
      end: async () => {
        await ready.catch(() => undefined)
        await settle()
      },
      abort: async (reason?: string) => {
        if (closed)
          return
        closed = true
        events.fail(createAbortError(reason))
      },
    }
  }

  async transcribeUpload(request: VoiceUploadRequest): Promise<VoiceRecognitionResult> {
    const requestId = assertVoiceProviderRequestId(request.requestId)

    if (request.source.kind === 'url') {
      // Fetching a URL would make this adapter depend on the network, which is the one
      // property that makes it worth having. Local bytes only.
      throw new VoiceProviderError(
        'LOCAL_OFFLINE_URL_SOURCE_UNSUPPORTED',
        'On-device recognition transcribes local bytes only; resolve remote audio before calling it.',
        { retryable: false, requestId },
      )
    }

    const workDirectory = await mkdtemp(join(tmpdir(), 'tuff-local-upload-'))
    try {
      const bytes = Buffer.from(request.source.bytes)
      const format = request.source.format
      const extension = format === 'pcm' ? 'wav' : format
      const path = join(workDirectory, `input.${extension}`)
      await writeFile(
        path,
        format === 'pcm' ? wrapPcmAsWav(bytes, { sampleRate: 16000, channels: 1, bitsPerSample: 16 }) : bytes,
      )

      const result = await this.engine.transcribe({ kind: 'file', path }, this.model, this.transcribeOptions(request, true))
      return {
        text: result.text,
        requestId,
        ...(result.language ? { language: result.language } : {}),
        ...(result.durationMs === undefined ? {} : { durationMs: result.durationMs }),
        ...(result.segments ? { segments: toVoiceSegments(result.segments) } : {}),
        usage: { inputBytes: bytes.byteLength },
      }
    }
    catch (error) {
      throw toVoiceProviderError(error, requestId)
    }
    finally {
      await rm(workDirectory, { recursive: true, force: true })
    }
  }

  private transcribeOptions(
    request: VoiceStreamRequest | VoiceUploadRequest,
    upload = false,
    extraSignal?: AbortSignal,
  ): LocalTranscribeOptions {
    const descriptor = this.model.descriptor
    const options: LocalTranscribeOptions = {
      language: this.options.language ?? request.language ?? descriptor.defaultLanguage ?? descriptor.languages[0],
      preferSimplifiedChinese: this.options.preferSimplifiedChinese ?? descriptor.text?.requiresSimplifiedConversion ?? false,
    }
    if (this.options.threads !== undefined)
      options.threads = this.options.threads
    if (request.timeoutMs !== undefined)
      options.timeoutMs = request.timeoutMs
    else if (this.options.timeoutMs !== undefined)
      options.timeoutMs = this.options.timeoutMs

    const signals = [request.signal, extraSignal].filter((signal): signal is AbortSignal => signal !== undefined)
    if (signals.length === 1)
      options.signal = signals[0]
    else if (signals.length > 1)
      options.signal = AbortSignal.any(signals)

    if (upload && 'enableTimestamps' in request && request.enableTimestamps !== undefined)
      options.timestamps = request.enableTimestamps
    return options
  }
}

/**
 * Reject anything the engine cannot be handed directly.
 *
 * A local engine has no transport that could adapt the audio, so a stereo or 48 kHz
 * capture is not a degradation here — it is a wrong answer waiting to happen.
 */
function assertLocalStreamAudio(request: VoiceStreamRequest): void {
  if (request.audio.format !== 'pcm') {
    throw new VoiceProviderError(
      'LOCAL_OFFLINE_FORMAT_UNSUPPORTED',
      'On-device recognition requires raw PCM input.',
      { retryable: false },
    )
  }
  if (request.audio.channels !== 1) {
    throw new VoiceProviderError(
      'LOCAL_OFFLINE_CHANNELS_UNSUPPORTED',
      'On-device recognition requires mono audio.',
      { retryable: false },
    )
  }
  if (request.audio.bitsPerSample !== 16 || (request.audio.codec !== undefined && request.audio.codec !== 'raw')) {
    throw new VoiceProviderError(
      'LOCAL_OFFLINE_PCM_UNSUPPORTED',
      'On-device recognition requires signed 16-bit raw PCM audio.',
      { retryable: false },
    )
  }
  if (!Number.isFinite(request.audio.sampleRate) || request.audio.sampleRate <= 0) {
    throw new VoiceProviderError(
      'LOCAL_OFFLINE_SAMPLE_RATE_INVALID',
      'On-device recognition sample rate is invalid.',
      { retryable: false },
    )
  }
}

/** Engine segments are already in the contract's shape; this only narrows the type. */
function toVoiceSegments(segments: NonNullable<LocalTranscribeResult['segments']>): readonly VoiceSegment[] {
  return segments.map(segment => ({ text: segment.text, startMs: segment.startMs, endMs: segment.endMs, definite: true }))
}

/** Preserve the engine's own code, message and retryability across the provider boundary. */
function toVoiceProviderError(error: unknown, requestId: string): VoiceProviderError {
  if (error instanceof VoiceProviderError)
    return error
  if (error instanceof LocalEngineError) {
    return new VoiceProviderError(error.code, error.message, { retryable: error.retryable, requestId, cause: error })
  }
  return new VoiceProviderError(
    'LOCAL_OFFLINE_FAILED',
    error instanceof Error ? error.message : String(error),
    { requestId, cause: error },
  )
}
