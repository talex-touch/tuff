import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type {
  VoiceAsrStreamEvent,
  VoiceAsrStreamPayload,
  VoiceDeliveryResult,
  VoiceDictatePayload,
  VoiceDictateResult,
  VoiceSpeakPayload,
  VoiceSpeakResult
} from '@talex-touch/utils/transport/sdk/domains/voice'
import type { AudioCaptureResult } from '@talex-touch/tuff-native/audio'
import * as nativeAudio from '@talex-touch/tuff-native/audio'
import { createLogger } from '../../utils/logger'
import { clipboardModule } from '../clipboard'
import { tuffIntelligence } from '../ai/intelligence-sdk'
import { intelligenceTtsService } from '../ai/intelligence-tts-service'
import { activeAppService, type ActiveAppInfo } from '../system/active-app'
import { POLISH_SYSTEM_PROMPT, withLanguageDirective, wrapTranscription } from './polish-prompt'
import type { StreamingAsrConfig } from './streaming-asr-client'
import { createAsrStream, getStreamingAsrConfig } from './streaming-asr-client'

const voiceLog = createLogger('Voice')

const DEFAULT_MAX_DURATION_MS = 15_000
const DEFAULT_SILENCE_STOP_MS = 1_500
const POLL_INTERVAL_MS = 120
const PARTIAL_INTERVAL_MS = 1_200
const CAPTURE_HARD_TIMEOUT_GRACE_MS = 2_000
const CAPABILITY_TIMEOUT_MS = 30_000
const WAV_HEADER_BYTES = 44
const VOICE_CALLER = 'core.voice.dictate'
// Toggle (global hotkey) capture: silence auto-stop effectively disabled so a pause
// mid-thought doesn't end the session — the user's second key press stops it; the
// max duration is only a safety cap.
type VoiceSessionPayload = VoiceDictatePayload | VoiceAsrStreamPayload

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

  /** Opens the canonical session used by global, renderer and plugin callers. */
  async startSession(
    payload: VoiceSessionPayload = {},
    signal?: AbortSignal,
    caller = VOICE_CALLER
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
      silenceStopMs: payload.silenceStopMs
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
   * Streaming dictation: yields live `partial` transcripts while the user speaks
   * (chunked-batch — re-transcribes the audio-so-far via the batch `audio.stt`
   * capability), then a single polished `final`, then `end`. When the native
   * `snapshotCapture` primitive is unavailable, it degrades to final-only.
   *
   * The event contract is provider-agnostic: a true streaming / WebSocket ASR
   * backend can later replace the inner loop without changing consumers.
   */
  async *streamDictation(
    payload: VoiceAsrStreamPayload = {},
    signal?: AbortSignal,
    caller = VOICE_CALLER
  ): AsyncGenerator<VoiceAsrStreamEvent> {
    throwIfCancelled(signal)
    this.assertSupported()

    const wsConfig = getStreamingAsrConfig()
    const drainCapture = getDrainCapture()
    if (wsConfig && drainCapture) {
      yield* this.streamViaWebSocket(payload, wsConfig, drainCapture, signal, caller)
    } else {
      yield* this.streamViaChunkedBatch(payload, signal, caller)
    }
  }

  /** Real streaming ASR: pipe native PCM frames through the canonical session. */
  private async *streamViaWebSocket(
    payload: VoiceAsrStreamPayload,
    wsConfig: StreamingAsrConfig,
    drainCapture: (sessionId: string) => { pcm: Buffer },
    signal?: AbortSignal,
    caller = VOICE_CALLER
  ): AsyncGenerator<VoiceAsrStreamEvent> {
    const pollCapture = getPollCapture()
    const maxDurationMs = payload.maxDurationMs ?? DEFAULT_MAX_DURATION_MS
    const silenceStopMs = payload.silenceStopMs ?? DEFAULT_SILENCE_STOP_MS
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
    try {
      for await (const event of createAsrStream({
        url: wsConfig.url,
        sampleRate: wsConfig.sampleRate,
        language: payload.language,
        signal,
        drainFrames: () => drainCapture(session.nativeSessionId).pcm,
        isCapturing: () => (pollCapture ? pollCapture(session.nativeSessionId).active : true)
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
