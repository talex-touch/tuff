import { StorageList } from '@talex-touch/utils'
import {
  DEFAULT_VOICE_POLISH_STRENGTH,
  normalizeVoicePolishStrength,
  type VoicePolishStrength
} from '@talex-touch/utils/common/storage/entity/app-settings'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type {
  VoiceAsrStreamEvent,
  VoiceAsrStreamPayload,
  VoiceDeliveryResult,
  VoiceDictatePayload,
  VoiceDictateResult,
  VoiceFileTranscriptionEvent,
  VoiceRecoveryKind,
  VoiceRecoveryStatus,
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
  type VoiceStreamConnection,
  type VoiceUploadRequest,
  type VoiceUsage
} from '@talex-touch/tuff-voice'
import { createLogger } from '../../utils/logger'
import { clipboardModule } from '../clipboard'
import { tuffIntelligence } from '../ai/intelligence-sdk'
import { intelligenceTtsService } from '../ai/intelligence-tts-service'
import { activeAppService, type ActiveAppInfo } from '../system/active-app'
import { getVoicePolishPrompt, wrapTranscription } from './polish-prompt'
import { createLiveDelivery } from './voice-live-delivery'
import { getConfiguredAsrProvider } from './voice-provider-runtime'
import { selectVoiceFile } from './voice-file-transcription'
import { voiceRecognitionStore, type VoiceRecognitionRecordInput } from './voice-recognition-store'
import { getMainConfig } from '../storage'
import { voiceInsightsStore } from './voice-insights-store'

function isVoiceHistoryEnabled(): boolean {
  try {
    const setting = getMainConfig(StorageList.APP_SETTING) as {
      voiceInput?: { historyEnabled?: unknown }
    }
    return setting.voiceInput?.historyEnabled === true
  } catch {
    return false
  }
}

function resolvePolishStrength(requested: unknown): VoicePolishStrength {
  if (requested !== undefined) return normalizeVoicePolishStrength(requested)
  try {
    const setting = getMainConfig(StorageList.APP_SETTING) as
      | {
          voiceInput?: { polishStrength?: unknown }
        }
      | undefined
    return normalizeVoicePolishStrength(setting?.voiceInput?.polishStrength)
  } catch {
    return DEFAULT_VOICE_POLISH_STRENGTH
  }
}

/**
 * Whether this capture runs RNNoise, resolved the same way the polish strength is: once, from
 * the caller's override or the saved preference, before capture has an asynchronous boundary
 * to read a changed setting across.
 */
function resolveNoiseSuppression(requested: unknown): boolean {
  if (requested !== undefined) return requested === true
  try {
    const setting = getMainConfig(StorageList.APP_SETTING) as
      | {
          voiceInput?: { noiseSuppression?: unknown }
        }
      | undefined
    return setting?.voiceInput?.noiseSuppression === true
  } catch {
    return false
  }
}

const voiceLog = createLogger('Voice')

/**
 * The recording cap, and the denominator the HUD's progress ring is drawn against.
 *
 * 300s rather than the old 15s because dictation is a paragraph, not a phrase. It is also what
 * sizes MAX_RETRY_BUFFER_BYTES below: the two numbers are one decision.
 */
const DEFAULT_MAX_DURATION_MS = 300_000
const DEFAULT_SILENCE_STOP_MS = 1_500
const DEFAULT_ASR_SAMPLE_RATE = 16_000
const POLL_INTERVAL_MS = 40
const CAPTURE_HARD_TIMEOUT_GRACE_MS = 2_000
const POLISH_TIMEOUT_MS = 300
const CAPABILITY_TIMEOUT_MS = 30_000
const TRANSCRIPTION_TIMEOUT_MS = 600_000

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
const VOICE_CALLER = 'core.voice.dictate'
/**
 * How many un-consumed level frames the merge queue keeps.
 *
 * At one frame per pump tick (~40ms) this is a couple of seconds of slack. Past that the
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
 * - one slot, and a session start clears the previous one before recording a byte, so audio
 *   from a session the user has already moved on from never survives into the next
 * - cleared on success, the only path where the reason to keep it is gone: the transcript
 *   already landed in the foreground app
 * - after a failure or a cancel it lives exactly as long as the button that can spend it.
 *   `discardRecovery` is what the HUD calls when that button leaves the screen, and it is the
 *   normal path — the timer below is only the backstop for a renderer that never says so.
 * - capped, so a long session degrades to "no recovery" rather than to unbounded memory
 *
 * Cancel keeps audio for the same reason a failure does: "undo" has to restore the same words,
 * or that button is "record again" wearing the wrong name.
 */
const RECOVERY_GRACE_MS = 15_000
/**
 * 10MB: 300s of 16kHz mono 16-bit PCM is ~9.6MB, so the cap now admits a full-length recording
 * instead of silently dropping undo and retry partway through one. It is a real cost — that is
 * ten megabytes of what the user just said, resident until the offer goes away — which is why
 * the offer going away is wired to delete it rather than left to a timer.
 */
const MAX_RETRY_BUFFER_BYTES = 10 * 1024 * 1024

/**
 * Past this many characters, delivery pastes instead of typing.
 *
 * Typing is the nicer of the two — it leaves the clipboard alone — but it is not free:
 * `nativeAudio.typeText` is a synchronous napi call into `enigo.text()`, which posts one
 * synthetic CGEvent per character and does not return until the last one is out. The main
 * process is blocked for that whole stretch, so the cost is linear in the transcript and
 * a long dictation visibly stalls the UI at the moment it lands.
 *
 * Pasting costs a fixed two events whatever the length, and `applyVoiceText` snapshots and
 * restores the clipboard around it, so the thing typing was protecting is protected anyway.
 * The threshold is where a sentence stops being an insertion and starts being a paragraph;
 * it is a judgement, not a measurement, and it is cheap to move.
 */
const MAX_TYPED_DELIVERY_CHARS = 80
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
  | { kind: 'error'; error: unknown }
  | { kind: 'done' }

interface RetryBuffer {
  captureId: string
  chunks: Buffer[]
  bytes: number
  sampleRate: number
  language?: string
  /** Exact main-owned adapter snapshot from the failed stream; never re-resolved from settings. */
  provider: VoiceProviderAdapter
  model: string
  polishStrength: VoicePolishStrength
  cleanup: boolean
  /** Set once the session ends abnormally; until then the buffer belongs to a live session. */
  expiresAt: number | null
  kind: VoiceRecoveryKind | null
  overflowed: boolean
}
interface VoiceSessionRecord {
  readonly id: string
  readonly nativeSessionId: string
  /** What the OS called the input device this session opened; empty when it would not say. */
  readonly deviceName: string
  /** True only when this session opened a *different* device than the last one that named one. */
  readonly deviceChanged: boolean
  readonly caller: string
  readonly delivery: VoiceDictatePayload['delivery']
  readonly polishStrength: VoicePolishStrength
  readonly targetKey: string | null
  readonly startedAt: number
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
  /** See RECOVERY_GRACE_MS: one slot, memory only, dropped as soon as its reason disappears. */
  private retryBuffer: RetryBuffer | null = null
  /** The last input device that named itself; `null` until one does. See `noteCaptureDevice`. */
  private lastDeviceName: string | null = null
  private retryExpiryTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Drop the held audio because the affordance that could spend it is gone.
   *
   * Called by the HUD when the undo/retry notice leaves the screen. Retention here is justified
   * by there being a button to press; once there is not, keeping the audio is keeping it for
   * nobody. Idempotent — a UI that reports the same dismissal twice is not an error.
   */
  discardRecovery(): void {
    this.clearRetryBuffer()
  }

  /**
   * Remember which input device this capture opened, and say whether it is a new one.
   *
   * A switch is only reportable against something to switch *from*: the first session of a run
   * names a device nobody asked about, so it returns false and simply records. Unnamed devices
   * neither report nor overwrite — the platform going quiet is not the user changing hardware.
   */
  private noteCaptureDevice(deviceName: string): boolean {
    if (!deviceName) return false
    const changed = this.lastDeviceName !== null && this.lastDeviceName !== deviceName
    this.lastDeviceName = deviceName
    return changed
  }

  private clearRetryBuffer(): void {
    if (this.retryExpiryTimer) {
      clearTimeout(this.retryExpiryTimer)
      this.retryExpiryTimer = null
    }
    this.retryBuffer = null
  }
  private beginRetryBuffer(
    captureId: string,
    sampleRate: number,
    provider: VoiceProviderAdapter,
    model: string,
    polishStrength: VoicePolishStrength,
    cleanup: boolean,
    language?: string
  ): void {
    this.clearRetryBuffer()
    this.retryBuffer = {
      captureId,
      chunks: [],
      bytes: 0,
      sampleRate,
      provider,
      model,
      polishStrength,
      cleanup,
      ...(language ? { language } : {}),
      expiresAt: null,
      kind: null,
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

  /** Success is the only path that drops audio immediately; the rest get a recovery window. */
  private armRetryBuffer(kind: VoiceRecoveryKind): void {
    const buffer = this.retryBuffer
    if (!buffer || buffer.overflowed || buffer.bytes === 0) {
      this.clearRetryBuffer()
      return
    }
    buffer.kind = kind
    buffer.expiresAt = Date.now() + RECOVERY_GRACE_MS
    if (this.retryExpiryTimer) clearTimeout(this.retryExpiryTimer)
    this.retryExpiryTimer = setTimeout(() => {
      this.retryExpiryTimer = null
      this.retryBuffer = null
    }, RECOVERY_GRACE_MS)
    this.retryExpiryTimer.unref?.()
  }

  private snapshotRetryAudio(captureId: string): Buffer | undefined {
    const buffer = this.retryBuffer
    if (!buffer || buffer.captureId !== captureId || buffer.overflowed || buffer.bytes === 0) {
      return undefined
    }
    return Buffer.concat(buffer.chunks, buffer.bytes)
  }

  private async recordRecognitionDetail(input: VoiceRecognitionRecordInput): Promise<void> {
    if (!isVoiceHistoryEnabled()) return
    try {
      await voiceRecognitionStore.record(input)
    } catch (error) {
      voiceLog.warn('Voice recognition record persistence failed; speech remains delivered', {
        error
      })
    }
  }

  private async recordInsightSuccess(
    captureId: string,
    text: string,
    durationMs: number,
    polished: boolean,
    capturedAt = Date.now(),
    record: Omit<VoiceRecognitionRecordInput, 'id' | 'capturedAt' | 'status' | 'text'> = {
      source: 'microphone'
    }
  ): Promise<void> {
    try {
      await voiceInsightsStore.recordSuccess({ captureId, text, durationMs, polished, capturedAt })
    } catch (error) {
      voiceLog.warn('Voice insights persistence failed; speech remains delivered', { error })
    }
    await this.recordRecognitionDetail({
      ...record,
      id: captureId,
      capturedAt,
      status: 'success',
      text
    })
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
    const polishStrength = resolvePolishStrength(payload.polishStrength)
    const noiseSuppression = resolveNoiseSuppression(payload.noiseSuppression)

    const targetPromise =
      payload.delivery === 'active-app'
        ? activeAppService.getActiveApp({ forceRefresh: true })
        : Promise.resolve(null)
    const capturePromise = nativeAudio.startCapture({
      maxDurationMs: payload.maxDurationMs,
      silenceStopMs: payload.silenceStopMs,
      sampleRate,
      noiseSuppression
    })
    const [targetOutcome, captureOutcome] = await Promise.allSettled([
      targetPromise,
      capturePromise
    ])
    if (captureOutcome.status === 'rejected') throw captureOutcome.reason
    if (targetOutcome.status === 'rejected') {
      try {
        nativeAudio.cancelCapture(captureOutcome.value.sessionId)
      } catch {
        // The stream may have stopped while the target lookup failed.
      }
      throw targetOutcome.reason
    }
    const { sessionId: nativeSessionId, deviceName } = captureOutcome.value
    const targetKey = activeAppKey(targetOutcome.value)
    const deviceChanged = this.noteCaptureDevice(deviceName)
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
      deviceName,
      deviceChanged,
      caller,
      delivery: payload.delivery ?? 'none',
      polishStrength,
      targetKey,
      startedAt: Date.now(),
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
      {
        cleanup: options.cleanup,
        language: options.language,
        delivery: record.delivery,
        polishStrength: record.polishStrength
      },
      record.abortSignal,
      record.caller
    )
    if (record.delivery === 'active-app' && result.text) {
      result.delivery = await this.deliverText(result.text, record.targetKey)
    }
    const recordDetails: Omit<
      VoiceRecognitionRecordInput,
      'id' | 'capturedAt' | 'status' | 'text'
    > = {
      source: 'microphone',
      audio: capture.audio,
      audioDurationMs: capture.durationMs,
      recognitionDurationMs: Math.max(0, Date.now() - record.startedAt),
      ...(result.raw ? { rawText: result.raw } : {}),
      ...(result.delivery?.method ? { deliveryMethod: result.delivery.method } : {})
    }
    if (result.text && (record.delivery !== 'active-app' || result.delivery?.method !== 'none')) {
      await this.recordInsightSuccess(
        record.id,
        result.text,
        result.durationMs ?? Math.max(0, Date.now() - record.startedAt),
        result.polished,
        Date.now(),
        recordDetails
      )
    } else {
      await this.recordRecognitionDetail({
        ...recordDetails,
        id: record.id,
        capturedAt: Date.now(),
        status: result.text ? 'success' : 'empty',
        ...(result.text ? { text: result.text } : {})
      })
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
        ...(transcript.billing ? { billing: transcript.billing } : {}),
        durationMs: capture.durationMs,
        stoppedReason: capture.stoppedReason
      }
    }

    const cleanup = payload.cleanup ?? true
    const polishedText = cleanup
      ? await this.polish(
          transcript.text,
          normalizeVoicePolishStrength(payload.polishStrength),
          signal,
          caller
        )
      : null
    throwIfCancelled(signal)
    return {
      text: polishedText ?? transcript.text,
      raw: transcript.text,
      source: 'native-cpal',
      polished: polishedText !== null,
      ...(language ? { language } : {}),
      ...(transcript.billing ? { billing: transcript.billing } : {}),
      durationMs: capture.durationMs,
      stoppedReason: capture.stoppedReason
    }
  }
  private async deliverText(
    text: string,
    targetKey: string | null,
    options: { allowPaste?: boolean } = {}
  ): Promise<VoiceDeliveryResult> {
    // Live delivery forbids the paste path: pasting once per partial would overwrite the
    // user's clipboard several times a second and fire a ⌘V storm at the target. Its
    // deltas are a word at a time, which is what typing is good at anyway.
    const allowPaste = options.allowPaste !== false

    /*
     * A whole transcript is trimmed; a live delta must not be.
     *
     * The delta between "one" and "one two" is " two", and trimming it types "onetwo"
     * into the target — every word boundary in the sentence silently lost. Leading and
     * trailing space is meaningful precisely because this text is being appended to text
     * that is already there.
     */
    const outgoing = allowPaste ? text.trim() : text
    if (!outgoing) return { method: 'none', reason: 'empty' }
    if (!targetKey) return { method: 'none', reason: 'target-unavailable' }

    const currentTargetKey = activeAppKey(
      await activeAppService.getActiveApp({ forceRefresh: true })
    )
    if (currentTargetKey !== targetKey) {
      return { method: 'none', reason: 'target-changed' }
    }

    const native = nativeAudio as unknown as {
      typeText?: (value: string) => Promise<{ ok: boolean; reason?: string }>
      isAccessibilityTrusted?: () => boolean
    }
    const typable = !allowPaste || outgoing.length <= MAX_TYPED_DELIVERY_CHARS
    if (
      typable &&
      typeof native.typeText === 'function' &&
      (typeof native.isAccessibilityTrusted !== 'function' || native.isAccessibilityTrusted())
    ) {
      // Awaited: `typeText` hands the keystrokes to a worker thread and resolves when they
      // are out, so the main process stays responsive for the length of the transcript.
      const result = await native.typeText(outgoing)
      if (result?.ok) return { method: 'native' }
      if (!allowPaste) return { method: 'none', reason: result?.reason ?? 'type-failed' }
    }

    if (!allowPaste) return { method: 'none', reason: 'type-unavailable' }

    const fallback = await clipboardModule.applyVoiceText(outgoing)
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
    const configured = getConfiguredAsrProvider()
    const provider = configured.provider
    const request: VoiceUploadRequest = {
      model: provider.defaultUploadModel ?? configured.model,
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
  /** Main-owned file selection and bounded in-memory STT through the configured capability binding. */
  async *transcribeFile(signal?: AbortSignal): AsyncGenerator<VoiceFileTranscriptionEvent> {
    const selected = await selectVoiceFile(signal)
    if (!selected) {
      yield { type: 'cancelled' }
      return
    }
    const startedAt = Date.now()
    yield { type: 'selected', name: selected.name }
    const response = await tuffIntelligence.audio.stt(
      { audio: selected.audio, format: selected.format },
      {
        signal,
        timeout: TRANSCRIPTION_TIMEOUT_MS,
        metadata: { caller: 'core.voice.file-transcription' }
      }
    )
    throwIfCancelled(signal)
    const text = typeof response.result?.text === 'string' ? response.result.text.trim() : ''
    await this.recordRecognitionDetail({
      id: nextVoiceSessionId(),
      capturedAt: startedAt,
      source: 'file',
      status: text ? 'success' : 'empty',
      audio: Buffer.from(selected.audio),
      audioFormat: 'encoded',
      audioExt: selected.format,
      audioBytes: selected.audio.byteLength,
      recognitionDurationMs: Math.max(0, Date.now() - startedAt),
      ...(text ? { rawText: text, text } : {}),
      ...(response.result.billing ? { channel: 'audio.stt' } : {})
    })
    yield {
      type: 'result',
      text,
      ...(response.result.billing ? { billing: response.result.billing } : {})
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
   * Streaming dictation freezes the `audio.asr` capability-selected adapter before microphone capture.
   * Later configuration changes affect only future sessions and never trigger cross-provider replay.
   */
  async *streamDictation(
    payload: VoiceAsrStreamPayload = {},
    signal?: AbortSignal,
    options: { stopSignal?: AbortSignal; caller?: string } = {}
  ): AsyncGenerator<VoiceAsrStreamEvent> {
    const { stopSignal, caller = VOICE_CALLER } = options
    this.clearRetryBuffer()
    throwIfCancelled(signal)
    const drainCapture = getDrainCapture()
    if (!drainCapture) throw new Error('VOICE_ASR_CAPTURE_DRAIN_UNAVAILABLE')
    const configured = getConfiguredAsrProvider()
    yield* this.streamViaProvider(
      payload,
      configured.provider,
      drainCapture,
      signal,
      stopSignal,
      caller,
      configured.model
    )
  }

  /**
   * The device notice for this session, or null when there is nothing to announce.
   *
   * Returned rather than yielded from a delegated generator: `yield*` steps its iterator even
   * when it produces nothing, which costs a microtask on every session and shifts the timing of
   * everything downstream. A plain `yield` only costs one when there is actually something to
   * say — which is the rare case.
   *
   * Saying it every time would be noise; saying nothing when the hardware moved leaves the user
   * wondering which microphone is live.
   */
  private deviceChangeEvent(sessionId: string): VoiceAsrStreamEvent | null {
    const session = this.sessions.get(sessionId)
    if (!session?.deviceChanged) return null
    return { type: 'device', name: session.deviceName }
  }

  private async *streamViaProvider(
    payload: VoiceAsrStreamPayload,
    provider: VoiceProviderAdapter,
    drainCapture: (sessionId: string) => { pcm: Buffer },
    signal?: AbortSignal,
    stopSignal?: AbortSignal,
    caller = VOICE_CALLER,
    model = provider.defaultStreamModel ?? 'default'
  ): AsyncGenerator<VoiceAsrStreamEvent> {
    const maxDurationMs = payload.maxDurationMs ?? DEFAULT_MAX_DURATION_MS
    const silenceStopMs = payload.silenceStopMs ?? DEFAULT_SILENCE_STOP_MS
    const cleanup = payload.cleanup !== false && payload.deliveryTiming !== 'live'
    const pollCapture = getPollCapture()
    const requestId = nextVoiceSessionId()
    const request: VoiceStreamRequest = {
      model,
      audio: {
        format: 'pcm',
        sampleRate: 16_000,
        channels: 1,
        bitsPerSample: 16,
        codec: 'raw'
      },
      ...(payload.language ? { language: payload.language } : {}),
      requestId,
      signal,
      timeoutMs: CAPABILITY_TIMEOUT_MS,
      enableDdc: payload.cleanup ?? true
    }
    // Open the native capture and provider connection together. Yielding capture readiness before
    // the provider handshake prevents a slow network from being misreported as a slow microphone;
    // the native session keeps the bounded PCM buffer while the connection finishes opening.
    const connectionPromise = provider.createStream(request)
    // A generator may be cancelled while it is waiting for capture. Attach a rejection observer
    // now so a late provider failure cannot become an unhandled rejection on that path.
    void connectionPromise.catch(() => {})
    let sessionId: string
    try {
      sessionId = await this.startSession(
        { ...payload, maxDurationMs, silenceStopMs },
        signal,
        caller
      )
    } catch (error) {
      void connectionPromise.then(
        (connection) => connection.abort('Voice capture startup failed').catch(() => {}),
        () => {}
      )
      throw error
    }

    const session = this.sessions.get(sessionId)
    if (!session) {
      void connectionPromise.then(
        (connection) => connection.abort('Voice session disappeared').catch(() => {}),
        () => {}
      )
      throwIfCancelled(signal)
      throw new Error('VOICE_SESSION_NOT_FOUND')
    }

    yield { type: 'ready' }

    let connection: VoiceStreamConnection
    try {
      connection = await connectionPromise
    } catch (error) {
      this.cancelSession(sessionId)
      throw error
    }

    const deviceNotice = this.deviceChangeEvent(sessionId)
    if (deviceNotice) yield deviceNotice

    let ownerReleased = false
    let capturedBytes = 0
    let hasFinal = false
    let lastPartialText = ''
    // A new session owns the single retry slot; whatever the last one left is dropped here.
    this.beginRetryBuffer(
      sessionId,
      DEFAULT_ASR_SAMPLE_RATE,
      provider,
      model,
      session.polishStrength,
      cleanup,
      payload.language
    )
    try {
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
            capturedBytes += chunk.length
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
      void forwarder.catch((error: unknown) => push({ kind: 'error', error }))

      /*
       * The live preference types as it recognizes; final delivery waits until the end.
       *
       * Only the live path gets a stable-prefix committer, and only when there is
       * somewhere to deliver to. Its presence is also what turns the polish pass off
       * below: polishing rewrites the sentence, and the raw words are already in the
       * target — delivering the polished version too would type them a second time.
       */
      const live =
        payload.deliveryTiming === 'live' && payload.delivery === 'active-app'
          ? createLiveDelivery((delta) =>
              this.deliverText(delta, session.targetKey, { allowPaste: false })
            )
          : null

      const finalizeTranscript = async (
        rawText: string,
        language?: string,
        usage?: VoiceUsage
      ): Promise<{ text: string; language?: string; delivery?: VoiceDeliveryResult }> => {
        const normalized = rawText.trim()
        const polishedText = cleanup
          ? await this.polish(normalized, session.polishStrength, signal, caller)
          : null
        throwIfCancelled(signal)
        const text = polishedText ?? normalized
        const delivery = live
          ? await live.finish(normalized)
          : payload.delivery === 'active-app'
            ? await this.deliverText(text, session.targetKey)
            : undefined
        const details: Omit<VoiceRecognitionRecordInput, 'id' | 'capturedAt' | 'status' | 'text'> =
          {
            source: 'microphone',
            audioFormat: 'pcm',
            audioSampleRate: 16_000,
            audio: this.snapshotRetryAudio(session.id),
            audioBytes: capturedBytes,
            audioDurationMs: Math.round(capturedBytes / 32),
            recognitionDurationMs: Math.max(0, Date.now() - session.startedAt),
            rawText: normalized,
            providerId: provider.id,
            model,
            channel: provider.id,
            ...(usage?.inputTokens === undefined ? {} : { inputTokens: usage.inputTokens }),
            ...(usage?.outputTokens === undefined ? {} : { outputTokens: usage.outputTokens }),
            ...(usage?.totalTokens === undefined ? {} : { totalTokens: usage.totalTokens }),
            ...(delivery?.method ? { deliveryMethod: delivery.method } : {})
          }
        if (payload.delivery !== 'active-app' || delivery?.method !== 'none') {
          await this.recordInsightSuccess(
            session.id,
            text,
            Math.round(capturedBytes / 32),
            polishedText !== null,
            Date.now(),
            details
          )
        } else {
          await this.recordRecognitionDetail({
            ...details,
            id: session.id,
            capturedAt: Date.now(),
            status: 'success',
            text
          })
        }
        return { text, ...(language ? { language } : {}), ...(delivery ? { delivery } : {}) }
      }

      for (;;) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve
          })
          continue
        }

        const item = queue.shift()!
        throwIfCancelled(signal)
        if (item.kind === 'error') throw item.error
        if (item.kind === 'done') break
        if (item.kind === 'level') {
          yield { type: 'level', rms: item.rms }
          continue
        }

        const event = item.event
        if (event.type === 'error') {
          const providerError = Object.assign(new Error(event.code), {
            code: event.code,
            retryable: event.retryable,
            requestId: event.requestId,
            cause: event.message
          })
          throw providerError
        }
        if (event.type === 'partial') {
          const partial = event.text.trim()
          if (partial) lastPartialText = partial
          if (partial) {
            // Before the yield: the target application is the point of live delivery, and
            // the HUD showing a word the user's editor has not received yet is the wrong
            // way round.
            await live?.offerPartial(partial)
            yield { type: 'partial', text: partial }
          }
          continue
        }
        if (event.type === 'final') {
          if (!event.text.trim()) continue
          hasFinal = true
          lastPartialText = event.text.trim()
          const finalized = await finalizeTranscript(event.text, event.language, event.usage)
          yield {
            type: 'final',
            text: finalized.text,
            ...(finalized.language ? { language: finalized.language } : {}),
            ...(finalized.delivery ? { delivery: finalized.delivery } : {})
          }
        }
      }

      await pump
      throwIfCancelled(signal)
      // A provider normally emits completed before session.finished. If a connection
      // closes after delivering a non-empty partial only, preserve that visible speech
      // instead of converting it into a misleading empty-content result.
      if (!hasFinal && lastPartialText) {
        const finalized = await finalizeTranscript(lastPartialText)
        hasFinal = true
        yield {
          type: 'final',
          text: finalized.text,
          ...(finalized.language ? { language: finalized.language } : {}),
          ...(finalized.delivery ? { delivery: finalized.delivery } : {})
        }
      }
      // Completed recognition, including a no-speech result, needs no retry buffer.
      // Keep an empty attempt distinguishable in the detail view instead of losing
      // the reason the HUD showed no recognized content.
      if (!hasFinal) {
        await this.recordRecognitionDetail({
          id: session.id,
          capturedAt: Date.now(),
          source: 'microphone',
          status: 'empty',
          audioFormat: 'pcm',
          audioSampleRate: 16_000,
          audio: this.snapshotRetryAudio(session.id),
          audioBytes: capturedBytes,
          audioDurationMs: Math.round(capturedBytes / 32),
          recognitionDurationMs: Math.max(0, Date.now() - session.startedAt),
          providerId: provider.id,
          model,
          channel: provider.id
        })
      }
      this.clearRetryBuffer()
      if (!hasFinal) yield { type: 'final', text: '' }
      yield { type: 'end' }
    } catch (error) {
      const cancelled = error instanceof Error && error.message === 'VOICE_OPERATION_CANCELLED'
      const errorCode =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : error instanceof Error
            ? error.name
            : 'VOICE_RECOGNITION_FAILED'
      await this.recordRecognitionDetail({
        id: session.id,
        capturedAt: Date.now(),
        source: 'microphone',
        status: cancelled ? 'cancelled' : 'failed',
        audioFormat: 'pcm',
        audioSampleRate: 16_000,
        audio: this.snapshotRetryAudio(session.id),
        audioBytes: capturedBytes,
        audioDurationMs: Math.round(capturedBytes / 32),
        recognitionDurationMs: Math.max(0, Date.now() - session.startedAt),
        providerId: provider.id,
        model,
        channel: provider.id,
        errorCode
      })
      this.armRetryBuffer(cancelled ? 'cancelled' : 'failed')
      throw error
    } finally {
      if (connection) await connection.abort('Voice session ended').catch(() => {})
      if (!ownerReleased) this.cancelSession(sessionId)
    }
  }

  getRecoveryStatus(): VoiceRecoveryStatus {
    const buffer = this.retryBuffer
    if (!buffer || buffer.expiresAt === null || buffer.bytes === 0) return { available: false }
    const remaining = buffer.expiresAt - Date.now()
    if (remaining <= 0) {
      this.clearRetryBuffer()
      return { available: false }
    }
    return {
      available: true,
      ...(buffer.kind ? { kind: buffer.kind } : {}),
      expiresInMs: remaining
    }
  }

  /** Replays held PCM through the exact failed ASR adapter; it never routes through STT. */
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
    const request: VoiceStreamRequest = {
      model: buffer.model,
      audio: {
        format: 'pcm',
        sampleRate: buffer.sampleRate,
        channels: PCM_CHANNELS,
        bitsPerSample: PCM_BITS_PER_SAMPLE,
        codec: 'raw'
      },
      ...(language ? { language } : {}),
      requestId: nextVoiceSessionId(),
      signal,
      timeoutMs: CAPABILITY_TIMEOUT_MS,
      enableDdc: true
    }
    const targetKey = activeAppKey(await activeAppService.getActiveApp())
    const connection = await buffer.provider.createStream(request)
    let text = ''
    let detectedLanguage: string | undefined
    try {
      for (const chunk of buffer.chunks) {
        throwIfCancelled(signal)
        await connection.writePcm(chunk)
      }
      throwIfCancelled(signal)
      await connection.end()
      for await (const event of connection.events) {
        throwIfCancelled(signal)
        if (event.type === 'error') throw new Error(event.code || 'VOICE_ASR_RETRY_FAILED')
        if (event.type !== 'final' || !event.text.trim()) continue
        text += event.text
        if (event.language) detectedLanguage = event.language
      }
    } finally {
      await connection.abort('Voice retry ended').catch(() => {})
    }

    throwIfCancelled(signal)
    const recognized = text.trim()
    if (!recognized) return { text: '' }
    const polishedText = buffer.cleanup
      ? await this.polish(recognized, buffer.polishStrength, signal, caller)
      : null
    throwIfCancelled(signal)
    const deliveredText = polishedText ?? recognized
    const delivery =
      payload.delivery === 'active-app'
        ? await this.deliverText(deliveredText, targetKey)
        : undefined
    if (payload.delivery !== 'active-app' || delivery?.method !== 'none') {
      await this.recordInsightSuccess(
        buffer.captureId,
        deliveredText,
        Math.round(buffer.bytes / 32),
        polishedText !== null
      )
    }
    this.clearRetryBuffer()
    return {
      text: deliveredText,
      ...(detectedLanguage ? { language: detectedLanguage } : {}),
      ...(delivery ? { delivery } : {})
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
  ): Promise<{ text: string; language?: string; billing?: VoiceDictateResult['billing'] }> {
    throwIfCancelled(signal)
    const dataUrl = `data:audio/wav;base64,${audio.toString('base64')}`
    const response = await awaitWithAbort(
      tuffIntelligence.audio.stt(
        {
          audio: dataUrl,
          format: 'wav',
          ...(language ? { language } : {})
        },
        { signal, timeout: TRANSCRIPTION_TIMEOUT_MS, metadata: { caller } }
      ),
      signal
    )
    throwIfCancelled(signal)
    const text = typeof response.result?.text === 'string' ? response.result.text.trim() : ''
    const detected =
      typeof response.result?.language === 'string' ? response.result.language.trim() : ''
    return {
      text,
      ...(detected ? { language: detected } : {}),
      ...(response.result.billing ? { billing: response.result.billing } : {})
    }
  }

  /** AI polish via the intelligence `text.chat` capability. Returns null on failure. */
  private async polish(
    transcript: string,
    strength: VoicePolishStrength,
    signal?: AbortSignal,
    caller = VOICE_CALLER
  ): Promise<string | null> {
    if (!transcript.trim()) return null
    const polishController = new AbortController()
    const abortPolish = (): void => polishController.abort()
    let polishTimedOut = false
    const timeout = setTimeout(() => {
      polishTimedOut = true
      polishController.abort()
    }, POLISH_TIMEOUT_MS)
    signal?.addEventListener('abort', abortPolish, { once: true })
    try {
      throwIfCancelled(signal)
      const response = await awaitWithAbort(
        tuffIntelligence.invoke<string>(
          'text.chat',
          {
            messages: [
              { role: 'system', content: getVoicePolishPrompt(strength) },
              { role: 'user', content: wrapTranscription(transcript) }
            ]
          },
          {
            signal: polishController.signal,
            timeout: POLISH_TIMEOUT_MS,
            metadata: { caller }
          }
        ),
        signal
      )
      throwIfCancelled(signal)
      const cleaned = typeof response.result === 'string' ? response.result.trim() : ''
      return cleaned || null
    } catch (error) {
      if (signal?.aborted) throw voiceCancellationError()
      // Cleanup is bounded and optional. Its deadline is a normal raw-transcript path, not a
      // user-visible failure: logging it redraws the developer console precisely as the text lands.
      if (!polishTimedOut) {
        voiceLog.debug('Polish pass unavailable; falling back to raw transcript', { error })
      }
      return null
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortPolish)
    }
  }
}

export const voiceService = new VoiceService()
