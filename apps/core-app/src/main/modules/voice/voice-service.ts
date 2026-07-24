import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type {
  VoiceAsrStreamEvent,
  VoiceAsrStreamPayload,
  VoiceDictatePayload,
  VoiceDictateResult,
  VoiceSpeakPayload,
  VoiceSpeakResult
} from '@talex-touch/utils/transport/sdk/domains/voice'
import * as nativeAudio from '@talex-touch/tuff-native/audio'
import { clipboard } from 'electron'
import { createLogger } from '../../utils/logger'
import { tuffIntelligence } from '../ai/intelligence-sdk'
import { intelligenceTtsService } from '../ai/intelligence-tts-service'
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
const TOGGLE_MAX_DURATION_MS = 120_000
const TOGGLE_SILENCE_STOP_MS = 3_600_000

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
function getPlayAudio(): ((bytes: Buffer) => { playbackId: string }) | undefined {
  return (
    nativeAudio as unknown as {
      playAudio?: (bytes: Buffer) => { playbackId: string }
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
  /** One-shot dictation. Throws on hard failures (no mic / no ASR provider). */
  async dictate(
    payload: VoiceDictatePayload = {},
    _context?: HandlerContext
  ): Promise<VoiceDictateResult> {
    this.assertSupported()

    const maxDurationMs = payload.maxDurationMs ?? DEFAULT_MAX_DURATION_MS
    const silenceStopMs = payload.silenceStopMs ?? DEFAULT_SILENCE_STOP_MS

    const { sessionId } = nativeAudio.startCapture({ maxDurationMs, silenceStopMs })

    let capture: ReturnType<typeof nativeAudio.stopCapture>
    try {
      await this.waitForAutoStop(sessionId, maxDurationMs)
      capture = nativeAudio.stopCapture(sessionId)
    } catch (error) {
      try {
        nativeAudio.cancelCapture(sessionId)
      } catch {
        /* best effort */
      }
      throw error
    }

    if (!capture.audio || capture.audio.length === 0) {
      throw new Error('No audio was captured')
    }

    const transcript = await this.transcribe(capture.audio, payload.language)
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
    const polishedText = cleanup ? await this.polish(transcript.text, payload.language) : null

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

  /** Synthesize `text` via the intelligence `audio.tts` capability and (by default) play it. */
  async speak(payload: VoiceSpeakPayload): Promise<VoiceSpeakResult> {
    const text = typeof payload.text === 'string' ? payload.text.trim() : ''
    if (!text) {
      throw new Error('speak requires non-empty text')
    }

    const tts = await intelligenceTtsService.speak({
      text,
      ...(payload.voice ? { voice: payload.voice } : {}),
      ...(payload.language ? { language: payload.language } : {}),
      format: 'wav',
      metadata: { caller: 'core.voice.speak' }
    })

    const format = tts.format || 'wav'
    let played = false
    if (payload.play ?? true) {
      const bytes = dataUrlToBuffer(tts.audio)
      const playAudio = getPlayAudio()
      if (bytes && bytes.length > 0 && playAudio) {
        try {
          const playback = playAudio(bytes)
          played = Boolean(playback?.playbackId)
        } catch (error) {
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

  /** Begins a toggle-controlled capture (global hotkey). Returns the native session id. */
  beginCapture(): string {
    this.assertSupported()
    const { sessionId } = nativeAudio.startCapture({
      maxDurationMs: TOGGLE_MAX_DURATION_MS,
      silenceStopMs: TOGGLE_SILENCE_STOP_MS
    })
    return sessionId
  }

  /** Ends a toggle capture: stop → transcribe → optional polish. */
  async endCapture(
    sessionId: string,
    options?: { cleanup?: boolean; language?: string }
  ): Promise<{ text: string; raw: string; language?: string }> {
    const capture = nativeAudio.stopCapture(sessionId)
    if (!capture.audio || capture.audio.length === 0) {
      return { text: '', raw: '' }
    }
    const transcript = await this.transcribe(capture.audio, options?.language)
    const language = transcript.language ?? options?.language
    if (!transcript.text) {
      return { text: '', raw: '', ...(language ? { language } : {}) }
    }
    const cleanup = options?.cleanup ?? true
    const polished = cleanup ? await this.polish(transcript.text, options?.language) : null
    return {
      text: polished ?? transcript.text,
      raw: transcript.text,
      ...(language ? { language } : {})
    }
  }

  /** Discards an in-progress toggle capture. */
  abortCapture(sessionId: string): void {
    try {
      nativeAudio.cancelCapture(sessionId)
    } catch {
      /* best effort — session may already be gone */
    }
  }

  /**
   * Injects text into the frontmost app: native `enigo` keystrokes when available
   * and Accessibility is granted, otherwise falls back to the system clipboard.
   */
  injectText(text: string): { method: 'enigo' | 'clipboard' | 'none'; reason?: string } {
    const trimmed = text.trim()
    if (!trimmed) return { method: 'none', reason: 'empty' }

    const native = nativeAudio as unknown as {
      typeText?: (text: string) => { ok: boolean; reason?: string }
      isAccessibilityTrusted?: () => boolean
    }

    if (typeof native.typeText === 'function') {
      const trusted =
        typeof native.isAccessibilityTrusted === 'function' ? native.isAccessibilityTrusted() : true
      if (trusted) {
        const result = native.typeText(trimmed)
        if (result?.ok) return { method: 'enigo' }
        clipboard.writeText(trimmed)
        return { method: 'clipboard', reason: result?.reason ?? 'enigo-failed' }
      }
      clipboard.writeText(trimmed)
      return { method: 'clipboard', reason: 'accessibility-required' }
    }

    clipboard.writeText(trimmed)
    return { method: 'clipboard', reason: 'enigo-unavailable' }
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
  async *streamDictation(payload: VoiceAsrStreamPayload = {}): AsyncGenerator<VoiceAsrStreamEvent> {
    this.assertSupported()

    const wsConfig = getStreamingAsrConfig()
    const drainCapture = getDrainCapture()
    if (wsConfig && drainCapture) {
      yield* this.streamViaWebSocket(payload, wsConfig, drainCapture)
    } else {
      yield* this.streamViaChunkedBatch(payload)
    }
  }

  /** Real streaming ASR: pipe native PCM frames to a WebSocket endpoint. */
  private async *streamViaWebSocket(
    payload: VoiceAsrStreamPayload,
    wsConfig: StreamingAsrConfig,
    drainCapture: (sessionId: string) => { pcm: Buffer }
  ): AsyncGenerator<VoiceAsrStreamEvent> {
    const pollCapture = getPollCapture()
    const { sessionId } = nativeAudio.startCapture({
      maxDurationMs: DEFAULT_MAX_DURATION_MS,
      silenceStopMs: DEFAULT_SILENCE_STOP_MS
    })
    try {
      for await (const event of createAsrStream({
        url: wsConfig.url,
        sampleRate: wsConfig.sampleRate,
        language: payload.language,
        drainFrames: () => drainCapture(sessionId).pcm,
        isCapturing: () => (pollCapture ? pollCapture(sessionId).active : true)
      })) {
        if (event.type === 'final' && event.text) {
          const polished = await this.polish(event.text, payload.language)
          yield {
            type: 'final',
            text: polished ?? event.text,
            ...(event.language ? { language: event.language } : {})
          }
        } else {
          yield event
        }
      }
      yield { type: 'end' }
    } finally {
      this.abortCapture(sessionId)
    }
  }

  /** Chunked-batch streaming: re-transcribe the audio-so-far on an interval. */
  private async *streamViaChunkedBatch(
    payload: VoiceAsrStreamPayload
  ): AsyncGenerator<VoiceAsrStreamEvent> {
    const language = payload.language
    const snapshotCapture = getSnapshotCapture()
    const pollCapture = getPollCapture()

    const { sessionId } = nativeAudio.startCapture({
      maxDurationMs: DEFAULT_MAX_DURATION_MS,
      silenceStopMs: DEFAULT_SILENCE_STOP_MS
    })

    let lastPartial = ''
    let stopped = false
    try {
      if (snapshotCapture) {
        // Live partials: transcribe the audio-so-far on an interval until auto-stop.
        for (;;) {
          await delay(PARTIAL_INTERVAL_MS)
          const active = pollCapture ? pollCapture(sessionId).active : true
          const snapshot = snapshotCapture(sessionId)
          if (snapshot?.audio && snapshot.audio.length > WAV_HEADER_BYTES) {
            try {
              const { text } = await this.transcribe(snapshot.audio, language)
              if (text && text !== lastPartial) {
                lastPartial = text
                yield { type: 'partial', text }
              }
            } catch (error) {
              // A failed interim transcription must not kill the stream.
              voiceLog.debug('Partial transcription failed; continuing', { error })
            }
          }
          if (!active) break
        }
      } else {
        // No snapshot support → no live partials; just wait for auto-stop.
        await this.waitForAutoStop(sessionId, DEFAULT_MAX_DURATION_MS)
      }

      const final = nativeAudio.stopCapture(sessionId)
      stopped = true

      const transcript = await this.transcribe(final.audio, language)
      const finalLanguage = transcript.language ?? language

      if (!transcript.text) {
        yield { type: 'final', text: '', ...(finalLanguage ? { language: finalLanguage } : {}) }
      } else {
        const polished = await this.polish(transcript.text, language)
        yield {
          type: 'final',
          text: polished ?? transcript.text,
          ...(finalLanguage ? { language: finalLanguage } : {})
        }
      }
      yield { type: 'end' }
    } finally {
      if (!stopped) {
        try {
          nativeAudio.cancelCapture(sessionId)
        } catch {
          /* best effort — session may already be gone */
        }
      }
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
  private async waitForAutoStop(sessionId: string, maxDurationMs: number): Promise<void> {
    const pollCapture = getPollCapture()
    const deadline = maxDurationMs + CAPTURE_HARD_TIMEOUT_GRACE_MS
    let waited = 0
    while (waited < deadline) {
      if (pollCapture && !pollCapture(sessionId).active) {
        break
      }
      await delay(POLL_INTERVAL_MS)
      waited += POLL_INTERVAL_MS
      if (!pollCapture && waited >= maxDurationMs) {
        break
      }
    }
  }

  /** Speech-to-text via the intelligence `audio.stt` capability. */
  private async transcribe(
    audio: Buffer,
    language?: string
  ): Promise<{ text: string; language?: string }> {
    const dataUrl = `data:audio/wav;base64,${audio.toString('base64')}`
    const response = await tuffIntelligence.audio.stt(
      {
        audio: dataUrl,
        format: 'wav',
        ...(language ? { language } : {})
      },
      { timeout: CAPABILITY_TIMEOUT_MS, metadata: { caller: VOICE_CALLER } }
    )
    const text = typeof response.result?.text === 'string' ? response.result.text.trim() : ''
    const detected =
      typeof response.result?.language === 'string' ? response.result.language.trim() : ''
    return { text, ...(detected ? { language: detected } : {}) }
  }

  /** AI polish via the intelligence `text.chat` capability. Returns null on failure. */
  private async polish(transcript: string, language?: string): Promise<string | null> {
    try {
      const response = await tuffIntelligence.invoke<string>(
        'text.chat',
        {
          messages: [
            { role: 'system', content: withLanguageDirective(POLISH_SYSTEM_PROMPT, language) },
            { role: 'user', content: wrapTranscription(transcript) }
          ]
        },
        { timeout: CAPABILITY_TIMEOUT_MS, metadata: { caller: VOICE_CALLER } }
      )
      const cleaned = typeof response.result === 'string' ? response.result.trim() : ''
      return cleaned || null
    } catch (error) {
      voiceLog.warn('Polish pass failed; falling back to raw transcript', { error })
      return null
    }
  }
}

export const voiceService = new VoiceService()
