import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type {
  VoiceAsrStreamEvent,
  VoiceAsrStreamPayload,
  VoiceDeliveryResult,
  VoiceDictatePayload,
  VoiceDictateResult,
  VoiceRetryPayload,
  VoiceRetryResult,
  VoiceSpeakPayload,
  VoiceSpeakResult,
  VoiceTranscribeUploadPayload,
  VoiceTranscribeUploadResult
} from '@talex-touch/utils/transport/sdk/domains/voice'
import type { AudioCaptureResult } from '@talex-touch/tuff-native/audio'
import * as nativeAudio from '@talex-touch/tuff-native/audio'
import {
  assertVoiceUploadUrl,
  type VoiceProviderAdapter,
  type VoiceProviderEvent,
  type VoiceStreamRequest,
  type VoiceUploadRequest
} from '@talex-touch/tuff-voice'
import { createLogger } from '../../utils/logger'
import { clipboardModule } from '../clipboard'
import { tuffIntelligence } from '../ai/intelligence-sdk'
import { intelligenceTtsService } from '../ai/intelligence-tts-service'
import { activeAppService, type ActiveAppInfo } from '../system/active-app'
import { POLISH_SYSTEM_PROMPT, withLanguageDirective, wrapTranscription } from './polish-prompt'
import { getVoiceProvider } from './voice-provider-runtime'
import type { StreamingAsrConfig } from './streaming-asr-client'
import { createAsrStream, getStreamingAsrConfig } from './streaming-asr-client'

const voiceLog = createLogger('Voice')

const DEFAULT_MAX_DURATION_MS = 15_000
const DEFAULT_SILENCE_STOP_MS = 1_500
const DEFAULT_ASR_SAMPLE_RATE = 16_000
const POLL_INTERVAL_MS = 120
const PARTIAL_INTERVAL_MS = 1_200
const CAPTURE_HARD_TIMEOUT_GRACE_MS = 2_000
const CAPABILITY_TIMEOUT_MS = 30_000
const WAV_HEADER_BYTES = 44
const VOICE_CALLER = 'core.voice.dictate'
/**
 * How many un-consumed level frames the merge queue keeps.
 *
 * At one frame per pump tick (~100ms) this is a couple of seconds of slack. Past that the
 * oldest levels are dropped: a stale amplitude is worthless, and holding them would push
 * `final` behind a backlog.
 */
const MAX_QUEUED_LEVELS = 20
/**
 * The retry buffer: the raw PCM of the session in flight, kept so a failure can be retried
 * against the same audio instead of asking the user to say it again.
 *
 * The retention rules are the point of this feature, not an afterthought — memory only,
 * dropped the moment the reason to keep it disappears:
 *
 * - one slot; a new session replaces it
 * - cleared on success and on cancel (the user said no)
 * - kept for RETRY_GRACE_MS after a failure, then dropped by timer
 * - capped, so a long session degrades to "no retry" rather than to unbounded memory
 */
const RETRY_GRACE_MS = 60_000
const MAX_RETRY_BUFFER_BYTES = 4 * 1024 * 1024
const PCM_BITS_PER_SAMPLE = 16
const PCM_CHANNELS = 1
// Toggle (global hotkey) capture: silence auto-stop effectively disabled so a pause
// mid-thought doesn't end the session — the user's second key press stops it; the
// max duration is only a safety cap.
type VoiceSessionPayload = VoiceDictatePayload | VoiceAsrStreamPayload

/** One slot in the merged capture/provider queue that feeds `streamViaProvider`'s generator. */
type MergedStreamItem =
  | { kind: 'provider'; event: VoiceProviderEvent }
  | { kind: 'level'; rms: number }
  | { kind: 'done' }

/**
 * Root-mean-square amplitude of a 16-bit little-endian mono PCM chunk, normalized to 0..1.
 *
 * Returns 0 for an empty or odd-length chunk rather than guessing at a partial sample.
 */
function pcmRms(chunk: Buffer): number {
  const sampleCount = Math.floor(chunk.length / 2)
  if (sampleCount === 0) return 0

  let sumOfSquares = 0
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = chunk.readInt16LE(index * 2) / 32_768
    sumOfSquares += sample * sample
  }
  return Math.min(1, Math.sqrt(sumOfSquares / sampleCount))
}

/** 44-byte RIFF header so buffered PCM can go through the same `transcribe()` as one-shot audio. */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(WAV_HEADER_BYTES)
  const byteRate = (sampleRate * PCM_CHANNELS * PCM_BITS_PER_SAMPLE) / 8
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(PCM_CHANNELS, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE((PCM_CHANNELS * PCM_BITS_PER_SAMPLE) / 8, 32)
  header.writeUInt16LE(PCM_BITS_PER_SAMPLE, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

interface RetryBuffer {
  chunks: Buffer[]
  bytes: number
  sampleRate: number
  language?: string
  /** Set once the session fails; until then the buffer belongs to a live session. */
  expiresAt: number | null
  overflowed: boolean
}

interface VoiceSessionRecord {
  readonly id: string
  readonly nativeSessionId: string
  readonly caller: string
  readonly delivery: VoiceDictatePayload['delivery']
  readonly targetKey: string | null
  readonly abortSignal?: AbortSignal
  readonly onAbort?: () => void
}

let voiceSessionCounter = 0

function nextVoiceSessionId(): string {
  voiceSessionCounter += 1
  return `voice-session-${Date.now().toString(36)}-${voiceSessionCounter.toString(36)}`
}

function activeAppKey(info: ActiveAppInfo | null): string | null {
  if (!info) return null
  const identity = [
    info.bundleId || info.identifier || 'unknown',
    info.processId ?? 'unknown',
    info.windowTitle || 'unknown'
  ].join('|')
  return `${info.platform ?? 'unknown'}:${identity}`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function voiceCancellationError(): Error {
  return new Error('VOICE_OPERATION_CANCELLED')
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw voiceCancellationError()
}

async function awaitWithAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return await operation
  throwIfCancelled(signal)
  return await new Promise<T>((resolve, reject) => {
    let settled = false
    const onAbort = (): void => {
      if (settled) return
      settled = true
      reject(voiceCancellationError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    void operation.then(
      (value) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

/** Optional native pollCapture accessor — tolerated when the binding predates it. */
function getPollCapture(): ((sessionId: string) => { active: boolean }) | undefined {
  return (
    nativeAudio as unknown as {
      pollCapture?: (sessionId: string) => { active: boolean }
    }
  ).pollCapture
}

/** Optional native snapshotCapture accessor — enables live partials when present. */
function getSnapshotCapture():
  | ((sessionId: string) => { audio: Buffer; durationMs: number })
  | undefined {
  return (
    nativeAudio as unknown as {
      snapshotCapture?: (sessionId: string) => { audio: Buffer; durationMs: number }
    }
  ).snapshotCapture
}

/** Optional native playAudio accessor — enables speaker playback when present. */
function getPlayAudio():
  | ((bytes: Buffer) => Promise<{ playbackId: string }> | { playbackId: string })
  | undefined {
  return (
    nativeAudio as unknown as {
      playAudio?: (bytes: Buffer) => Promise<{ playbackId: string }> | { playbackId: string }
    }
  ).playAudio
}

/** Optional native drainCapture accessor — enables true WebSocket streaming when present. */
function getDrainCapture():
  | ((sessionId: string) => { pcm: Buffer; sampleRate: number; channels: number })
  | undefined {
  return (
    nativeAudio as unknown as {
      drainCapture?: (sessionId: string) => { pcm: Buffer; sampleRate: number; channels: number }
    }
  ).drainCapture
}

/** Extracts the raw bytes from a `data:...;base64,<data>` URL. */
function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const marker = 'base64,'
  const index = dataUrl.indexOf(marker)
  if (index < 0) return null
  try {
    return Buffer.from(dataUrl.slice(index + marker.length), 'base64')
  } catch {
    return null
  }
}

/**
 * The voice dictation orchestrator: native mic capture → STT → optional AI polish.
 *
 * Capture happens in the native (Rust/cpal) layer in the main process, so it is
 * unaffected by the plugin sandbox's microphone denial and needs no renderer.
 * STT + polish reuse the existing `ai/` intelligence capabilities.
 */
export class VoiceService {
  private readonly sessions = new Map<string, VoiceSessionRecord>()
  private disposed = false
  /** See RETRY_GRACE_MS: one slot, memory only, dropped as soon as its reason disappears. */
  private retryBuffer: RetryBuffer | null = null
  private retryExpiryTimer: ReturnType<typeof setTimeout> | null = null

  private clearRetryBuffer(): void {
    if (this.retryExpiryTimer) {
      clearTimeout(this.retryExpiryTimer)
      this.retryExpiryTimer = null
    }
    this.retryBuffer = null
  }

  private beginRetryBuffer(sampleRate: number, language?: string): void {
    this.clearRetryBuffer()
    this.retryBuffer = {
      chunks: [],
      bytes: 0,
      sampleRate,
      ...(language ? { language } : {}),
      expiresAt: null,
      overflowed: false
    }
  }

  private appendRetryBuffer(chunk: Buffer): void {
    const buffer = this.retryBuffer
    if (!buffer || buffer.overflowed) return
    if (buffer.bytes + chunk.length > MAX_RETRY_BUFFER_BYTES) {
      // Degrade to "no retry" rather than growing without bound. Dropping the partial audio
      // is deliberate: a truncated retry would transcribe half a sentence and look like a bug.
      buffer.chunks.length = 0
      buffer.bytes = 0
      buffer.overflowed = true
      return
    }
    buffer.chunks.push(chunk)
    buffer.bytes += chunk.length
  }

  /** Failure is the only path that keeps audio, and only for the grace window. */
  private armRetryBuffer(): void {
    const buffer = this.retryBuffer
    if (!buffer || buffer.overflowed || buffer.bytes === 0) {
      this.clearRetryBuffer()
      return
    }
    buffer.expiresAt = Date.now() + RETRY_GRACE_MS
    if (this.retryExpiryTimer) clearTimeout(this.retryExpiryTimer)
    this.retryExpiryTimer = setTimeout(() => {
      this.retryExpiryTimer = null
      this.retryBuffer = null
    }, RETRY_GRACE_MS)
    this.retryExpiryTimer.unref?.()
  }

  /** Opens the canonical session used by global, renderer and plugin callers. */
  async startSession(
    payload: VoiceSessionPayload = {},
    signal?: AbortSignal,
    caller = VOICE_CALLER,
    sampleRate = DEFAULT_ASR_SAMPLE_RATE
  ): Promise<string> {
    throwIfCancelled(signal)
    if (this.disposed) throw new Error('VOICE_SESSION_SERVICE_DISPOSED')
    this.assertSupported()

    const targetKey =
      payload.delivery === 'active-app'
        ? activeAppKey(await activeAppService.getActiveApp({ forceRefresh: true }))
        : null
    const { sessionId: nativeSessionId } = await nativeAudio.startCapture({
      maxDurationMs: payload.maxDurationMs,
      silenceStopMs: payload.silenceStopMs,
      sampleRate
    })
    if (this.disposed) {
      try {
        nativeAudio.cancelCapture(nativeSessionId)
      } catch {
        // The native session may already have stopped while teardown raced startup.
      }
      throw new Error('VOICE_SESSION_SERVICE_DISPOSED')
    }
    const id = nextVoiceSessionId()
    const onAbort = signal ? () => this.cancelSession(id) : undefined
    const record: VoiceSessionRecord = {
      id,
      nativeSessionId,
      caller,
      delivery: payload.delivery ?? 'none',
      targetKey,
      ...(signal ? { abortSignal: signal } : {}),
      ...(onAbort ? { onAbort } : {})
    }
    this.sessions.set(id, record)
    if (signal && onAbort) {
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) {
        this.cancelSession(id)
        throw voiceCancellationError()
      }
    }
    return id
  }

  private takeSession(sessionId: string): VoiceSessionRecord {
    const record = this.sessions.get(sessionId)
    if (!record) throw new Error('VOICE_SESSION_NOT_FOUND')
    this.sessions.delete(sessionId)
    if (record.abortSignal && record.onAbort) {
      record.abortSignal.removeEventListener('abort', record.onAbort)
    }
    return record
  }

  private async completeStoppedSession(
    sessionId: string,
    capture: AudioCaptureResult,
    payload: VoiceSessionPayload,
    signal?: AbortSignal
  ): Promise<VoiceDictateResult> {
    const record = this.takeSession(sessionId)
    const result = await this.finalizeCapture(capture, payload, signal, record.caller)
    if (record.delivery === 'active-app' && result.text) {
      result.delivery = await this.deliverText(result.text, record.targetKey)
    }
    return result
  }

  /** Stops, transcribes, polishes and optionally delivers one canonical session. */
  async stopSession(
    sessionId: string,
    options: { cleanup?: boolean; language?: string } = {}
  ): Promise<VoiceDictateResult> {
    const record = this.takeSession(sessionId)
    let capture: AudioCaptureResult
    try {
      capture = nativeAudio.stopCapture(record.nativeSessionId)
    } catch (error) {
      try {
        nativeAudio.cancelCapture(record.nativeSessionId)
      } catch {
        // The native session may already have been removed by stopCapture.
      }
      throw error
    }
    const result = await this.finalizeCapture(
      capture,
      { cleanup: options.cleanup, language: options.language, delivery: record.delivery },
      record.abortSignal,
      record.caller
    )
    if (record.delivery === 'active-app' && result.text) {
      result.delivery = await this.deliverText(result.text, record.targetKey)
    }
    return result
  }
  cancelSession(sessionId: string): void {
    const record = this.sessions.get(sessionId)
    if (!record) return
    this.sessions.delete(sessionId)
    if (record.abortSignal && record.onAbort) {
      record.abortSignal.removeEventListener('abort', record.onAbort)
    }
    try {
      nativeAudio.cancelCapture(record.nativeSessionId)
    } catch {
      // The native session may already have stopped.
    }
  }

  /** Cancels all sessions before module teardown. */
  dispose(): void {
    this.disposed = true
    this.clearRetryBuffer()
    for (const sessionId of Array.from(this.sessions.keys())) {
      this.cancelSession(sessionId)
    }
  }

  private async finalizeCapture(
    capture: AudioCaptureResult,
    payload: VoiceSessionPayload,
    signal: AbortSignal | undefined,
    caller: string
  ): Promise<VoiceDictateResult> {
    if (!capture.audio || capture.audio.length === 0) {
      return {
        text: '',
        raw: '',
        source: 'native-cpal',
        polished: false,
        durationMs: capture.durationMs,
        stoppedReason: capture.stoppedReason
      }
    }

    const transcript = await this.transcribe(capture.audio, payload.language, signal, caller)
    throwIfCancelled(signal)
    const language = transcript.language ?? payload.language
    if (!transcript.text) {
      return {
        text: '',
        raw: '',
        source: 'native-cpal',
        polished: false,
        ...(language ? { language } : {}),
        durationMs: capture.durationMs,
        stoppedReason: capture.stoppedReason
      }
    }

    const cleanup = payload.cleanup ?? true
    const polishedText = cleanup
      ? await this.polish(transcript.text, payload.language, signal, caller)
      : null
    throwIfCancelled(signal)
    return {
      text: polishedText ?? transcript.text,
      raw: transcript.text,
      source: 'native-cpal',
      polished: polishedText !== null,
      ...(language ? { language } : {}),
      durationMs: capture.durationMs,
      stoppedReason: capture.stoppedReason
    }
  }
  private async deliverText(text: string, targetKey: string | null): Promise<VoiceDeliveryResult> {
    const trimmed = text.trim()
    if (!trimmed) return { method: 'none', reason: 'empty' }
    if (!targetKey) return { method: 'none', reason: 'target-unavailable' }

    const currentTargetKey = activeAppKey(
      await activeAppService.getActiveApp({ forceRefresh: true })
    )
    if (currentTargetKey !== targetKey) {
      return { method: 'none', reason: 'target-changed' }
    }

    const native = nativeAudio as unknown as {
      typeText?: (value: string) => { ok: boolean; reason?: string }
      isAccessibilityTrusted?: () => boolean
    }
    if (
      typeof native.typeText === 'function' &&
      (typeof native.isAccessibilityTrusted !== 'function' || native.isAccessibilityTrusted())
    ) {
      const result = native.typeText(trimmed)
      if (result?.ok) return { method: 'native' }
    }

    const fallback = await clipboardModule.applyVoiceText(trimmed)
    if (fallback.success) return { method: 'autopaste' }
    return { method: 'none', reason: fallback.code ?? 'autopaste-failed' }
  }
  /** One-shot dictation backed by the canonical Voice Session owner. */
  async dictate(
    payload: VoiceDictatePayload = {},
    _context?: HandlerContext,
    signal?: AbortSignal,
    caller = VOICE_CALLER
  ): Promise<VoiceDictateResult> {
    const maxDurationMs = payload.maxDurationMs ?? DEFAULT_MAX_DURATION_MS
    const silenceStopMs = payload.silenceStopMs ?? DEFAULT_SILENCE_STOP_MS
    const sessionId = await this.startSession(
      { ...payload, maxDurationMs, silenceStopMs },
      signal,
      caller
    )
    try {
      const session = this.sessions.get(sessionId)
      if (!session) {
        throwIfCancelled(signal)
        throw new Error('VOICE_SESSION_NOT_FOUND')
      }
      await this.waitForAutoStop(session.nativeSessionId, maxDurationMs, signal)
      throwIfCancelled(signal)
      return await this.stopSession(sessionId, {
        cleanup: payload.cleanup,
        language: payload.language
      })
    } catch (error) {
      this.cancelSession(sessionId)
      throw error
    }
  }

  /** Transcribes a main-owned HTTPS audio source through the selected Provider. */
  async transcribeUpload(
    payload: VoiceTranscribeUploadPayload,
    signal?: AbortSignal
  ): Promise<VoiceTranscribeUploadResult> {
    throwIfCancelled(signal)
    const provider = getVoiceProvider('upload', payload.providerId)
    if (!provider) throw new Error('VOICE_UPLOAD_PROVIDER_UNAVAILABLE')
    const request: VoiceUploadRequest = {
      model: payload.model ?? provider.defaultUploadModel ?? 'default',
      source: { kind: 'url', url: assertVoiceUploadUrl(payload.sourceUrl) },
      ...(payload.language ? { language: payload.language } : {}),
      ...(payload.enableTimestamps === undefined
        ? {}
        : { enableTimestamps: payload.enableTimestamps }),
      ...(payload.enableSpeakerDiarization === undefined
        ? {}
        : { enableSpeakerDiarization: payload.enableSpeakerDiarization }),
      ...(payload.removeDisfluencies === undefined
        ? {}
        : { removeDisfluencies: payload.removeDisfluencies }),
      requestId: nextVoiceSessionId(),
      signal
    }
    const result = await awaitWithAbort(provider.transcribeUpload(request), signal)
    return {
      text: result.text,
      ...(result.language ? { language: result.language } : {}),
      ...(result.durationMs === undefined ? {} : { durationMs: result.durationMs }),
      ...(result.requestId ? { requestId: result.requestId } : {}),
      ...(result.segments
        ? {
            segments: result.segments.map((segment) => ({
              text: segment.text,
              startMs: segment.startMs,
              endMs: segment.endMs,
              ...(segment.speaker ? { speaker: segment.speaker } : {})
            }))
          }
        : {})
    }
  }

  /** Synthesize `text` via the intelligence `audio.tts` capability and (by default) play it. */
  async speak(
    payload: VoiceSpeakPayload,
    signal?: AbortSignal,
    caller = 'core.voice.speak'
  ): Promise<VoiceSpeakResult> {
    throwIfCancelled(signal)
    const text = typeof payload.text === 'string' ? payload.text.trim() : ''
    if (!text) {
      throw new Error('speak requires non-empty text')
    }

    const tts = await awaitWithAbort(
      intelligenceTtsService.speak({
        text,
        ...(payload.voice ? { voice: payload.voice } : {}),
        ...(payload.language ? { language: payload.language } : {}),
        format: 'wav',
        metadata: { caller }
      }),
      signal
    )
    throwIfCancelled(signal)

    const format = tts.format || 'wav'
    let played = false
    if (payload.play ?? true) {
      const bytes = dataUrlToBuffer(tts.audio)
      const playAudio = getPlayAudio()
      if (bytes && bytes.length > 0 && playAudio) {
        try {
          throwIfCancelled(signal)
          // Awaited because the decode moved to the libuv pool (#845); a binding
          // that still returns synchronously resolves to the same object.
          const playback = await playAudio(bytes)
          played = Boolean(playback?.playbackId)
        } catch (error) {
          if (signal?.aborted) throw voiceCancellationError()
          // A playback failure must not fail synthesis — the audio is still returned.
          voiceLog.warn('Audio playback failed', { error })
        }
      }
    }

    return {
      audio: tts.audio,
      format,
      played,
      ...(typeof tts.duration === 'number' ? { durationMs: Math.round(tts.duration * 1000) } : {})
    }
  }

  /**
   * Streaming dictation: routes native PCM through the configured Provider stream when available;
   * otherwise retains the generic WebSocket or chunked-batch compatibility fallback. Each path
   * yields partial/final/end events and keeps target delivery main-owned.
   *
   * `options.stopSignal` asks capture to stop early and still finalize — the opposite of `signal`,
   * which aborts the whole session. It is an options bag rather than a fourth positional argument
   * because two `AbortSignal`s in a row are trivially swapped at a call site.
   */
  async *streamDictation(
    payload: VoiceAsrStreamPayload = {},
    signal?: AbortSignal,
    options: { stopSignal?: AbortSignal; caller?: string } = {}
  ): AsyncGenerator<VoiceAsrStreamEvent> {
    const { stopSignal, caller = VOICE_CALLER } = options
    throwIfCancelled(signal)
    this.assertSupported()

    const drainCapture = getDrainCapture()
    const provider = getVoiceProvider('stream', payload.providerId)
    if (provider && drainCapture) {
      yield* this.streamViaProvider(payload, provider, drainCapture, signal, stopSignal, caller)
      return
    }

    const wsConfig = getStreamingAsrConfig()
    if (wsConfig && drainCapture) {
      yield* this.streamViaWebSocket(payload, wsConfig, drainCapture, signal, stopSignal, caller)
    } else {
      yield* this.streamViaChunkedBatch(payload, signal, caller)
    }
  }

  private async *streamViaProvider(
    payload: VoiceAsrStreamPayload,
    provider: VoiceProviderAdapter,
    drainCapture: (sessionId: string) => { pcm: Buffer },
    signal?: AbortSignal,
    stopSignal?: AbortSignal,
    caller = VOICE_CALLER
  ): AsyncGenerator<VoiceAsrStreamEvent> {
    const maxDurationMs = payload.maxDurationMs ?? DEFAULT_MAX_DURATION_MS
    const silenceStopMs = payload.silenceStopMs ?? DEFAULT_SILENCE_STOP_MS
    const pollCapture = getPollCapture()
    const sessionId = await this.startSession(
      { ...payload, maxDurationMs, silenceStopMs },
      signal,
      caller
    )
    const session = this.sessions.get(sessionId)
    if (!session) {
      throwIfCancelled(signal)
      throw new Error('VOICE_SESSION_NOT_FOUND')
    }

    let ownerReleased = false
    let connection: Awaited<ReturnType<VoiceProviderAdapter['createStream']>> | null = null
    // A new session owns the single retry slot; whatever the last one left is dropped here.
    this.beginRetryBuffer(DEFAULT_ASR_SAMPLE_RATE, payload.language)
    try {
      const request: VoiceStreamRequest = {
        model: provider.defaultStreamModel ?? 'default',
        audio: {
          format: 'pcm',
          sampleRate: 16_000,
          channels: 1,
          bitsPerSample: 16,
          codec: 'raw'
        },
        ...(payload.language ? { language: payload.language } : {}),
        requestId: sessionId,
        signal,
        timeoutMs: CAPABILITY_TIMEOUT_MS,
        enableDdc: payload.cleanup ?? true
      }
      connection = await provider.createStream(request)

      // The pump cannot `yield` — it is a detached task, while the generator is parked on
      // `connection.events`. Merging both into one queue is what lets input levels interleave
      // with transcript events without reordering them.
      const queue: MergedStreamItem[] = []
      let wake: (() => void) | null = null
      const push = (item: MergedStreamItem): void => {
        if (item.kind === 'level') {
          // Levels are disposable: a renderer that falls behind should drop frames rather
          // than push `final` behind a backlog of amplitudes.
          let levelCount = 0
          for (const queued of queue) if (queued.kind === 'level') levelCount += 1
          if (levelCount >= MAX_QUEUED_LEVELS) {
            const staleIndex = queue.findIndex((queued) => queued.kind === 'level')
            queue.splice(staleIndex, 1)
          }
        }
        queue.push(item)
        wake?.()
        wake = null
      }

      const pump = (async (): Promise<void> => {
        const deadline = Date.now() + maxDurationMs + CAPTURE_HARD_TIMEOUT_GRACE_MS
        for (;;) {
          await awaitWithAbort(delay(100), signal)
          throwIfCancelled(signal)
          const active = stopSignal?.aborted
            ? false
            : pollCapture
              ? pollCapture(session.nativeSessionId).active
              : Date.now() < deadline
          const chunk = drainCapture(session.nativeSessionId).pcm
          if (chunk.length > 0) {
            if (payload.emitLevel) push({ kind: 'level', rms: pcmRms(chunk) })
            this.appendRetryBuffer(chunk)
            await connection!.writePcm(chunk)
          }
          if (!active) break
        }
        nativeAudio.stopCapture(session.nativeSessionId)
        this.takeSession(sessionId)
        ownerReleased = true
        await connection!.end()
      })()
      void pump.catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'capture-pump-failed'
        return connection?.abort(message)
      })

      const forwarder = (async (): Promise<void> => {
        for await (const event of connection!.events) push({ kind: 'provider', event })
        push({ kind: 'done' })
      })()
      void forwarder.catch(() => push({ kind: 'done' }))

      for (;;) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve
          })
          continue
        }

        const item = queue.shift()!
        throwIfCancelled(signal)
        if (item.kind === 'done') break
        if (item.kind === 'level') {
          yield { type: 'level', rms: item.rms }
          continue
        }

        const event = item.event
        if (event.type === 'partial') {
          if (event.text) yield { type: 'partial', text: event.text }
          continue
        }
        if (event.type === 'final') {
          if (!event.text) continue
          const text =
            payload.cleanup === false
              ? event.text
              : ((await this.polish(event.text, payload.language, signal, caller)) ?? event.text)
          const delivery =
            payload.delivery === 'active-app'
              ? await this.deliverText(text, session.targetKey)
              : undefined
          yield {
            type: 'final',
            text,
            ...(event.language ? { language: event.language } : {}),
            ...(delivery ? { delivery } : {})
          }
        }
      }
      await pump
      throwIfCancelled(signal)
      // Reaching `end` means the transcript was delivered: the only reason to hold the audio
      // is gone, so it goes now rather than waiting for the grace timer.
      this.clearRetryBuffer()
      yield { type: 'end' }
    } catch (error) {
      // Cancellation is the user saying no — that clears. Anything else may be retried.
      if (error instanceof Error && error.message === 'VOICE_OPERATION_CANCELLED')
        this.clearRetryBuffer()
      else this.armRetryBuffer()
      throw error
    } finally {
      if (connection) await connection.abort('Voice session ended').catch(() => {})
      if (!ownerReleased) this.cancelSession(sessionId)
    }
  }

  /**
   * Re-transcribe the audio the last failed session captured.
   *
   * Returns `expired` rather than throwing when the buffer is gone: "the recording expired"
   * and "transcription failed" are different things to tell someone, and only one of them
   * is worth a retry button.
   */
  async retryLastFailure(
    payload: VoiceRetryPayload = {},
    signal?: AbortSignal,
    caller = VOICE_CALLER
  ): Promise<VoiceRetryResult> {
    throwIfCancelled(signal)
    const buffer = this.retryBuffer
    if (
      !buffer ||
      buffer.expiresAt === null ||
      buffer.bytes === 0 ||
      Date.now() > buffer.expiresAt
    ) {
      this.clearRetryBuffer()
      return { text: '', expired: true }
    }

    const language = payload.language ?? buffer.language
    const wav = pcmToWav(Buffer.concat(buffer.chunks), buffer.sampleRate)
    const targetKey = activeAppKey(await activeAppService.getActiveApp())

    const recognized = await this.transcribe(wav, language, signal, caller)
    if (!recognized.text) {
      // Still retryable: an empty result is not proof the audio is unusable.
      return { text: '' }
    }

    const text = (await this.polish(recognized.text, language, signal, caller)) ?? recognized.text
    const delivery =
      payload.delivery === 'active-app' ? await this.deliverText(text, targetKey) : undefined

    this.clearRetryBuffer()
    return {
      text,
      ...(recognized.language ? { language: recognized.language } : {}),
      ...(delivery ? { delivery } : {})
    }
  }

  /** Real streaming ASR: pipe native PCM frames through the canonical session. */
  private async *streamViaWebSocket(
    payload: VoiceAsrStreamPayload,
    wsConfig: StreamingAsrConfig,
    drainCapture: (sessionId: string) => { pcm: Buffer },
    signal?: AbortSignal,
    stopSignal?: AbortSignal,
    caller = VOICE_CALLER
  ): AsyncGenerator<VoiceAsrStreamEvent> {
    const pollCapture = getPollCapture()
    const maxDurationMs = payload.maxDurationMs ?? DEFAULT_MAX_DURATION_MS
    const silenceStopMs = payload.silenceStopMs ?? DEFAULT_SILENCE_STOP_MS
    const sessionId = await this.startSession(
      { ...payload, maxDurationMs, silenceStopMs },
      signal,
      caller,
      wsConfig.sampleRate
    )
    const session = this.sessions.get(sessionId)
    if (!session) {
      throwIfCancelled(signal)
      throw new Error('VOICE_SESSION_NOT_FOUND')
    }
    try {
      for await (const event of createAsrStream({
        url: wsConfig.url,
        sampleRate: wsConfig.sampleRate,
        language: payload.language,
        signal,
        drainFrames: () => drainCapture(session.nativeSessionId).pcm,
        isCapturing: () =>
          stopSignal?.aborted
            ? false
            : pollCapture
              ? pollCapture(session.nativeSessionId).active
              : true
      })) {
        throwIfCancelled(signal)
        if (event.type === 'final' && event.text) {
          const text =
            payload.cleanup === false
              ? event.text
              : ((await this.polish(event.text, payload.language, signal, caller)) ?? event.text)
          const delivery =
            payload.delivery === 'active-app'
              ? await this.deliverText(text, session.targetKey)
              : undefined
          yield {
            type: 'final',
            text,
            ...(event.language ? { language: event.language } : {}),
            ...(delivery ? { delivery } : {})
          }
        } else {
          yield event
        }
      }
      throwIfCancelled(signal)
      yield { type: 'end' }
    } finally {
      this.cancelSession(sessionId)
    }
  }

  /** Chunked-batch streaming: re-transcribe the audio-so-far on an interval. */
  private async *streamViaChunkedBatch(
    payload: VoiceAsrStreamPayload,
    signal?: AbortSignal,
    caller = VOICE_CALLER
  ): AsyncGenerator<VoiceAsrStreamEvent> {
    const language = payload.language
    const maxDurationMs = payload.maxDurationMs ?? DEFAULT_MAX_DURATION_MS
    const silenceStopMs = payload.silenceStopMs ?? DEFAULT_SILENCE_STOP_MS
    const snapshotCapture = getSnapshotCapture()
    const pollCapture = getPollCapture()
    const sessionId = await this.startSession(
      { ...payload, maxDurationMs, silenceStopMs },
      signal,
      caller
    )
    const session = this.sessions.get(sessionId)
    if (!session) {
      throwIfCancelled(signal)
      throw new Error('VOICE_SESSION_NOT_FOUND')
    }

    let stopped = false
    try {
      if (snapshotCapture) {
        // Live partials: transcribe the audio-so-far on an interval until auto-stop.
        for (;;) {
          await awaitWithAbort(delay(PARTIAL_INTERVAL_MS), signal)
          throwIfCancelled(signal)
          const active = pollCapture ? pollCapture(session.nativeSessionId).active : true
          const snapshot = snapshotCapture(session.nativeSessionId)
          if (snapshot?.audio && snapshot.audio.length > WAV_HEADER_BYTES) {
            try {
              const { text } = await this.transcribe(snapshot.audio, language, signal, caller)
              if (text) yield { type: 'partial', text }
            } catch (error) {
              if (signal?.aborted) throw voiceCancellationError()
              voiceLog.debug('Partial transcription failed; continuing', { error })
            }
          }
          if (!active) break
        }
      } else {
        await this.waitForAutoStop(session.nativeSessionId, maxDurationMs, signal)
      }

      throwIfCancelled(signal)
      const final = nativeAudio.stopCapture(session.nativeSessionId)
      stopped = true
      const result = await this.completeStoppedSession(
        sessionId,
        final,
        { ...payload, language, cleanup: payload.cleanup, delivery: session.delivery },
        signal
      )
      yield {
        type: 'final',
        text: result.text,
        ...(result.language ? { language: result.language } : {}),
        ...(result.delivery ? { delivery: result.delivery } : {})
      }
      yield { type: 'end' }
    } finally {
      if (!stopped) this.cancelSession(sessionId)
    }
  }

  private assertSupported(): void {
    const support = nativeAudio.getNativeAudioSupport()
    if (!support.supported) {
      throw new Error(`Voice capture is unavailable: ${support.reason ?? 'unsupported platform'}`)
    }
  }

  /**
   * Waits for the native capture thread to auto-stop (trailing silence / max
   * duration). Prefers the native `pollCapture` signal; falls back to a bounded
   * max-duration wait when it's unavailable. Does NOT stop the session.
   */
  private async waitForAutoStop(
    sessionId: string,
    maxDurationMs: number,
    signal?: AbortSignal
  ): Promise<void> {
    const pollCapture = getPollCapture()
    const deadline = maxDurationMs + CAPTURE_HARD_TIMEOUT_GRACE_MS
    let waited = 0
    while (waited < deadline) {
      throwIfCancelled(signal)
      if (pollCapture && !pollCapture(sessionId).active) {
        break
      }
      await awaitWithAbort(delay(POLL_INTERVAL_MS), signal)
      waited += POLL_INTERVAL_MS
      if (!pollCapture && waited >= maxDurationMs) {
        break
      }
    }
    throwIfCancelled(signal)
  }

  /** Speech-to-text via the intelligence `audio.stt` capability. */
  private async transcribe(
    audio: Buffer,
    language?: string,
    signal?: AbortSignal,
    caller = VOICE_CALLER
  ): Promise<{ text: string; language?: string }> {
    throwIfCancelled(signal)
    const dataUrl = `data:audio/wav;base64,${audio.toString('base64')}`
    const response = await awaitWithAbort(
      tuffIntelligence.audio.stt(
        {
          audio: dataUrl,
          format: 'wav',
          ...(language ? { language } : {})
        },
        { timeout: CAPABILITY_TIMEOUT_MS, metadata: { caller } }
      ),
      signal
    )
    throwIfCancelled(signal)
    const text = typeof response.result?.text === 'string' ? response.result.text.trim() : ''
    const detected =
      typeof response.result?.language === 'string' ? response.result.language.trim() : ''
    return { text, ...(detected ? { language: detected } : {}) }
  }

  /** AI polish via the intelligence `text.chat` capability. Returns null on failure. */
  private async polish(
    transcript: string,
    language?: string,
    signal?: AbortSignal,
    caller = VOICE_CALLER
  ): Promise<string | null> {
    try {
      throwIfCancelled(signal)
      const response = await awaitWithAbort(
        tuffIntelligence.invoke<string>(
          'text.chat',
          {
            messages: [
              { role: 'system', content: withLanguageDirective(POLISH_SYSTEM_PROMPT, language) },
              { role: 'user', content: wrapTranscription(transcript) }
            ]
          },
          { timeout: CAPABILITY_TIMEOUT_MS, metadata: { caller } }
        ),
        signal
      )
      throwIfCancelled(signal)
      const cleaned = typeof response.result === 'string' ? response.result.trim() : ''
      return cleaned || null
    } catch (error) {
      if (signal?.aborted) throw voiceCancellationError()
      voiceLog.warn('Polish pass failed; falling back to raw transcript', { error })
      return null
    }
  }
}

export const voiceService = new VoiceService()
