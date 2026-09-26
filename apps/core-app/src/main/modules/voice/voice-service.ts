import type { AudioCaptureResult } from '@talex-touch/tuff-native/audio'
import type {
  VoiceProviderAdapter,
  VoiceProviderEvent,
  VoiceStreamConnection,
  VoiceStreamRequest,
  VoiceUploadRequest,
  VoiceUsage
} from '@talex-touch/tuff-voice'
import type { VoicePolishStrength } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type {
  VoiceAsrStreamEvent,
  VoiceAsrStreamPayload,
  VoiceDeliveryResult,
  VoiceDictatePayload,
  VoiceDictateResult,
  VoiceFileTranscriptionEvent,
  VoiceRecognitionLocation,
  VoiceRecoveryKind,
  VoiceRecoveryStatus,
  VoiceRetryPayload,
  VoiceRetryResult,
  VoiceSpeakPayload,
  VoiceSpeakResult,
  VoiceTranscribeUploadPayload,
  VoiceTranscribeUploadResult
} from '@talex-touch/utils/transport/sdk/domains/voice'
import type { ActiveAppInfo } from '../system/active-app'
import type { VoicePolishOutcome } from './voice-insights-store'
import type { VoiceRecognitionMetricInput } from '../analytics'
import type { VoiceRecognitionRecordInput } from './voice-recognition-store'
import { randomUUID } from 'node:crypto'
import * as nativeAudio from '@talex-touch/tuff-native/audio'
import { assertVoiceUploadUrl } from '@talex-touch/tuff-voice'
import { StorageList } from '@talex-touch/utils'
import {
  DEFAULT_VOICE_POLISH_STRENGTH,
  normalizeVoicePolishStrength
} from '@talex-touch/utils/common/storage/entity/app-settings'
import { createLogger } from '../../utils/logger'
import { tuffIntelligence } from '../ai/intelligence-sdk'
import { intelligenceTtsService } from '../ai/intelligence-tts-service'
import { clipboardModule } from '../clipboard'
import { getMainConfig } from '../storage'
import { activeAppService } from '../system/active-app'
import {
  appFormatContextFromActiveApp,
  formatDictationText,
  resolveAppFormatProfile
} from './app-context'
import { getVoicePolishPrompt, wrapTranscription, type PolishContext } from './polish-prompt'
import {
  getVoiceQuickEditPrompt,
  resolveQuickEditCommand,
  wrapQuickEditRequest
} from './quick-edit-prompt'
import { selectVoiceFile } from './voice-file-transcription'
import { voiceInsightsStore } from './voice-insights-store'
import { createLiveDelivery } from './voice-live-delivery'
import { getConfiguredAsrProvider, getVoiceRecognitionLocation } from './voice-provider-runtime'
import { voiceRecognitionStore } from './voice-recognition-store'

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

/**
 * Analytics arrives by dynamic import rather than a top-level one.
 *
 * `modules/analytics` reaches the window core and from there the native mica module, which no Node
 * test environment can load: a static import here failed four voice-service suites at collection,
 * before a single test ran. The temp-file service is loaded the same way, for the same reason.
 *
 * The type import above is exempt — types are erased before a module graph exists.
 */
let analyticsModuleLoader: Promise<{
  recordVoiceMetrics: (input: VoiceRecognitionMetricInput) => void
}> | null = null

/**
 * One recognition into the metrics pipeline, with sizes and provider-reported names only — never
 * the transcript, the audio, or a file path.
 *
 * Failures are swallowed after a warning: telemetry is never allowed to cost a user a dictation.
 */
async function recordVoiceTelemetry(input: VoiceRecognitionRecordInput): Promise<void> {
  try {
    analyticsModuleLoader ??= import('../analytics').then((module) => module.analyticsModule)
    const analytics = await analyticsModuleLoader
    analytics.recordVoiceMetrics({
      recordingDurationMs: input.audioDurationMs,
      recognitionDurationMs: input.recognitionDurationMs,
      providerLatencyMs: input.providerLatencyMs,
      model: input.model,
      channel: input.channel
    })
  } catch (error) {
    voiceLog.warn('Voice recognition telemetry failed; recognition is unaffected', { error })
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
 * Where a transcript falls relative to the tidy-up length gate: `short` runs no pass at all,
 * `light` runs the natural editing scope, `full` runs the scope the user asked for.
 */
export type VoicePolishTierDecision = 'short' | 'light' | 'full'

/**
 * The polish length gate.
 *
 * A tidy-up pass is not free: measured on this machine's configured route the fixed cost alone is
 * 0.67-0.88s for a 7-24 character transcript, because the system prompt is ~2.6KB against an
 * average dictated message of ~20 characters. What that money buys on a short utterance is
 * nothing, or worse than nothing: a 7-character transcript came back as 3 characters, and an
 * 11-character one came back byte-identical after 834ms. The two sessions that gained nothing are
 * exactly the two this gate now skips.
 *
 * Sizes are counted in language-neutral units (CJK characters + words in every other script), so
 * one pair of thresholds holds for Chinese and English. 12 units is deliberately close to the
 * only hard number any shipping competitor publishes — Wispr Flow's iOS Polish requires 10
 * words — and 60 units is where a dictated message stops being one short sentence; deep/structured
 * rewriting only pays for itself past that, which is why the `light` band is capped to natural
 * editing regardless of the saved strength.
 */
const POLISH_MIN_UNITS = 12
const POLISH_FULL_UNITS = 60
const CJK_CHARACTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu

/**
 * Word counting for everything that is not CJK, via ICU rather than a letter-run regex.
 *
 * Thai, Lao, Khmer and Myanmar write without spaces, so `/[\p{L}]+/` reads a whole sentence as
 * one word and the gate would skip the pass on exactly the long transcripts it exists for.
 * `Intl.Segmenter`'s dictionary segmentation is the only word boundary those scripts publish;
 * it also keeps combining marks inside their word, which a regex splits — `e` + U+0301 + `clair`
 * is one French word, not two. The segmenter is language-neutral on purpose: the transcript's
 * language is not known before it exists, and ICU applies the right dictionary from the script.
 *
 * CJK keeps its character count below instead of ICU's word segmentation: 26 Chinese characters
 * are ~10 ICU words, which would push the primary dictation language under the gate.
 */
let polishWordSegmenter: Intl.Segmenter | undefined

function countPolishWords(text: string): number {
  polishWordSegmenter ??= new Intl.Segmenter(undefined, { granularity: 'word' })
  let words = 0
  for (const segment of polishWordSegmenter.segment(text)) {
    if (segment.isWordLike) words += 1
  }
  return words
}

/** CJK characters plus words in every other script: the size a transcript is gated on. */
export function countPolishUnits(text: string): number {
  const cjk = text.match(CJK_CHARACTER)?.length ?? 0
  return cjk + countPolishWords(text.replace(CJK_CHARACTER, ' '))
}

export function resolvePolishTier(text: string): VoicePolishTierDecision {
  const units = countPolishUnits(text)
  if (units < POLISH_MIN_UNITS) return 'short'
  return units < POLISH_FULL_UNITS ? 'light' : 'full'
}

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
/**
 * How long the tidy-up pass may take before delivery gives up and ships the raw transcript.
 *
 * This was 300ms, which is not a tight budget — it is an unreachable one, and it turned the
 * feature off without saying so. Measured against the configured endpoint, the TLS handshake
 * alone takes 85-358ms before a byte of the request is sent, and that is for an unauthenticated
 * rejection with no inference behind it. A real pass then has to upload, queue, prefill and
 * generate a whole rewritten paragraph. Every call aborted, every call fell back to raw text,
 * and the one log line that would have said so was explicitly skipped on the timeout branch.
 *
 * 8s is a ceiling for a slow provider, not the expected wait — a short paragraph on a normal
 * chat model lands in one to three. It is exported so the deadline test asserts against the
 * shipped value instead of a literal that silently stops matching it.
 */
export const POLISH_TIMEOUT_MS = 8_000
/**
 * The edit pass gets longer than the polish pass.
 *
 * Dictation waits on a rewrite of its own words and feels slow the moment it does; an edit is a
 * deliberate act the user triggers and then watches, and the passage it must preserve is longer
 * than a spoken sentence. Eight seconds is where a spoken instruction stops feeling like a
 * recognition step and starts feeling broken.
 */
export const QUICK_EDIT_TIMEOUT_MS = 20_000
const CAPABILITY_TIMEOUT_MS = 30_000
const BUFFERED_TRANSCRIPTION_TIMEOUT_MS = 150_000
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

/**
 * What the user had selected when an edit session started.
 *
 * Captured by the caller that opened the session and carried on the session record, because the
 * selection only means anything for as long as the passage is still selected in the target: the
 * pass edits what was picked, and delivery relies on that same selection still holding the old text
 * so that typing over it replaces it — no write access to another application's document is
 * involved anywhere in this feature.
 */
export interface VoiceQuickEditTarget {
  readonly selection: string
}

/** The session options the owner understands: the caller's payload plus host-only fields. */
type VoiceSessionOptions = VoiceSessionPayload & { editTarget?: VoiceQuickEditTarget }

/** One capture's speech-to-text result, normalized with the route that produced it. */
interface VoiceTranscript {
  text: string
  language?: string
  billing?: VoiceDictateResult['billing']
  latencyMs?: number
  providerId: string
  model: string
  recognitionLocation: VoiceRecognitionLocation
}

/** Private receipt fields are removed before the public Voice SDK result is returned. */
interface FinalizedCaptureResult extends VoiceDictateResult {
  recognitionProviderId?: string
  recognitionModel?: string
  recognitionLocation?: VoiceRecognitionLocation
}

/** One slot in the merged capture/provider queue that feeds `streamViaProvider`'s generator. */
type MergedStreamItem =
  | { kind: 'provider'; event: VoiceProviderEvent }
  | { kind: 'level'; rms: number }
  | { kind: 'error'; error: unknown }
  | { kind: 'done' }

interface RetryBuffer {
  captureId: string
  providerRequestId: string
  reuseProviderRequestId: boolean
  chunks: Buffer[]
  bytes: number
  sampleRate: number
  language?: string
  /** Exact main-owned adapter snapshot from the failed stream; never re-resolved from settings. */
  provider: VoiceProviderAdapter
  model: string
  recognitionLocation: VoiceRecognitionLocation

  requestTimeoutMs: number
  polishStrength: VoicePolishStrength
  cleanup: boolean
  /**
   * The delivery target's context, snapshotted with the audio.
   *
   * A retry replays a recording made for one application, so it must not re-derive the context
   * from whatever happens to be frontmost when the user asks for another attempt.
   */
  polishContext?: PolishContext
  /** Set once the session ends abnormally; until then the buffer belongs to a live session. */
  expiresAt: number | null
  kind: VoiceRecoveryKind | null
  overflowed: boolean
}

interface ActiveVoiceRetry {
  captureId: string | null
  controller: AbortController
  promise: Promise<VoiceRetryResult>
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
  /**
   * The delivery target's formatting context, captured with `targetKey` when the session started.
   *
   * Resolved once, for the same reason the target key is: the polish pass must describe the
   * application the user was dictating into, and re-reading the frontmost application after
   * transcription can describe a different one. A session that starts in an editor and finishes
   * with a browser focused would otherwise be polished for the browser while being delivered to
   * the editor, because delivery validates the captured key and the polish context did not.
   */
  readonly polishContext?: PolishContext
  /** Present only on an edit session; see `VoiceQuickEditTarget`. */
  readonly editTarget?: VoiceQuickEditTarget
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

/**
 * The formatting context to hand the polish pass, from a frontmost-application record.
 *
 * It reuses the same profile resolver the deterministic formatter uses, so polish and formatting
 * cannot disagree about what kind of application this is. Returns undefined when nothing is
 * known, which leaves the polish pass with no target hints rather than with invented ones.
 */
function polishContextFromActiveApp(info: ActiveAppInfo | null): PolishContext | undefined {
  const formatContext = appFormatContextFromActiveApp(info)
  if (!formatContext) return undefined
  const profile = resolveAppFormatProfile(formatContext)
  return {
    ...(formatContext.appName ? { appName: formatContext.appName } : {}),
    ...(formatContext.bundleId ? { bundleId: formatContext.bundleId } : {}),
    category: profile.id,
    ...(formatContext.windowTitle ? { windowTitle: formatContext.windowTitle } : {})
  }
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

/**
 * The provider's own round trip, bounded for the record column.
 *
 * The intelligence contract types `latency` as a required number, but it arrives from a provider
 * response and the record column rejects anything that is not a finite non-negative integer. A
 * value that cannot be trusted is dropped rather than rounded into a plausible-looking 0.
 */
function normalizeLatency(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined
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
  private retryInFlight: ActiveVoiceRetry | null = null
  private retryBufferGeneration = 0
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
    this.cancelRetryInFlight('Voice recovery discarded')
    this.clearRetryBuffer()
  }

  private cancelRetryInFlight(reason: string): void {
    this.retryInFlight?.controller.abort(reason)
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

  private clearRetryBuffer(captureId?: string): void {
    if (captureId && this.retryBuffer?.captureId !== captureId) return
    if (this.retryExpiryTimer) {
      clearTimeout(this.retryExpiryTimer)
      this.retryExpiryTimer = null
    }
    this.retryBuffer = null
  }

  private beginRetryBuffer(
    captureId: string,
    generation: number,
    providerRequestId: string,
    reuseProviderRequestId: boolean,
    sampleRate: number,
    provider: VoiceProviderAdapter,
    model: string,
    recognitionLocation: VoiceRecognitionLocation,

    requestTimeoutMs: number,
    polishStrength: VoicePolishStrength,
    cleanup: boolean,
    language?: string,
    polishContext?: PolishContext
  ): void {
    if (generation !== this.retryBufferGeneration) return
    this.clearRetryBuffer()
    this.retryBuffer = {
      captureId,
      providerRequestId,
      reuseProviderRequestId,
      chunks: [],
      bytes: 0,
      sampleRate,
      provider,
      model,
      recognitionLocation,

      requestTimeoutMs,
      polishStrength,
      cleanup,
      ...(language ? { language } : {}),
      ...(polishContext ? { polishContext } : {}),
      expiresAt: null,
      kind: null,
      overflowed: false
    }
  }

  private appendRetryBuffer(captureId: string, chunk: Buffer): void {
    const buffer = this.retryBuffer
    if (!buffer || buffer.captureId !== captureId || buffer.overflowed) return
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
  private armRetryBuffer(captureId: string, kind: VoiceRecoveryKind): void {
    const buffer = this.retryBuffer
    if (!buffer || buffer.captureId !== captureId) return
    if (buffer.overflowed || buffer.bytes === 0) {
      this.clearRetryBuffer(captureId)
      return
    }
    buffer.kind = kind
    buffer.expiresAt = Date.now() + RECOVERY_GRACE_MS
    if (this.retryExpiryTimer) clearTimeout(this.retryExpiryTimer)
    this.retryExpiryTimer = setTimeout(() => this.clearRetryBuffer(captureId), RECOVERY_GRACE_MS)
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
    // Usage telemetry is not a retention preference, so it runs before the history gate: a user
    // who keeps no transcripts still dictates, and the numbers that tune recognition are exactly
    // the ones that must not disappear with the records they were measured on.
    await recordVoiceTelemetry(input)

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
    capturedAt: number,
    record: Omit<VoiceRecognitionRecordInput, 'id' | 'capturedAt' | 'status' | 'text'>
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
    payload: VoiceSessionOptions = {},
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
    const polishContext = polishContextFromActiveApp(targetOutcome.value)
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
      ...(polishContext ? { polishContext } : {}),
      ...(payload.editTarget ? { editTarget: payload.editTarget } : {}),
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
    const finalized = await this.finalizeCapture(
      capture,
      {
        cleanup: options.cleanup,
        language: options.language,
        delivery: record.delivery,
        polishStrength: record.polishStrength,
        /*
         * Dropping this field here silently demotes an edit to dictation: the instruction would be
         * polished and then typed over the passage instead of replacing it.
         */
        ...(record.editTarget ? { editTarget: record.editTarget } : {})
      },
      record.abortSignal,
      record.caller,
      record.polishContext
    )
    const { recognitionProviderId, recognitionModel, recognitionLocation, ...result } = finalized
    if (record.delivery === 'active-app' && result.text) {
      /*
       * An edit's replacement is not formatted for the application it lands in.
       *
       * `formatDictationText` exists for speech becoming text — a command line should not gain a
       * full stop from how a sentence was spoken. The edit pass already returned the passage as it
       * should read, so running it through those rules would be a second, unasked edit, and in a
       * terminal profile it would strip punctuation the user had just asked for.
       */
      result.delivery = await this.deliverText(
        result.text,
        record.targetKey,
        record.editTarget ? { format: false } : {}
      )
    }
    const recordDetails: Omit<
      VoiceRecognitionRecordInput,
      'id' | 'capturedAt' | 'status' | 'text'
    > = {
      source: 'microphone',
      ...(recognitionLocation ? { recognitionLocation } : {}),
      ...(recognitionProviderId ? { providerId: recognitionProviderId } : {}),
      ...(recognitionModel ? { model: recognitionModel } : {}),
      ...(recognitionProviderId ? { channel: recognitionProviderId } : {}),
      audio: capture.audio,
      audioDurationMs: capture.durationMs,
      recognitionDurationMs: Math.max(0, Date.now() - record.startedAt),
      ...(result.latencyMs === undefined ? {} : { providerLatencyMs: result.latencyMs }),
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
    this.retryBufferGeneration += 1
    this.cancelRetryInFlight('Voice service disposed')
    this.clearRetryBuffer()
    for (const sessionId of Array.from(this.sessions.keys())) {
      this.cancelSession(sessionId)
    }
  }

  private async finalizeCapture(
    capture: AudioCaptureResult,
    payload: VoiceSessionOptions,
    signal: AbortSignal | undefined,
    caller: string,
    polishContext?: PolishContext
  ): Promise<FinalizedCaptureResult> {
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
    const recognitionReceipt = {
      recognitionProviderId: transcript.providerId,
      recognitionModel: transcript.model,
      recognitionLocation: transcript.recognitionLocation
    } as const

    if (!transcript.text) {
      return {
        text: '',
        raw: '',
        source: 'native-cpal',
        polished: false,
        ...recognitionReceipt,

        ...(language ? { language } : {}),
        ...(transcript.billing ? { billing: transcript.billing } : {}),
        ...(transcript.latencyMs === undefined ? {} : { latencyMs: transcript.latencyMs }),
        durationMs: capture.durationMs,
        stoppedReason: capture.stoppedReason
      }
    }

    if (payload.editTarget) {
      return await this.finalizeQuickEdit(
        capture,
        transcript,
        payload.editTarget,
        signal,
        caller,
        polishContext
      )
    }

    const cleanup = payload.cleanup ?? true
    const polishedText = cleanup
      ? await this.polish(
          transcript.text,
          normalizeVoicePolishStrength(payload.polishStrength),
          signal,
          caller,
          polishContext
        )
      : null
    throwIfCancelled(signal)
    return {
      text: polishedText ?? transcript.text,
      raw: transcript.text,
      source: 'native-cpal',
      polished: polishedText !== null,
      ...recognitionReceipt,

      ...(language ? { language } : {}),
      ...(transcript.billing ? { billing: transcript.billing } : {}),
      ...(transcript.latencyMs === undefined ? {} : { latencyMs: transcript.latencyMs }),
      durationMs: capture.durationMs,
      stoppedReason: capture.stoppedReason
    }
  }

  /**
   * The edit pass: the transcript is an instruction, the session's selection is what it acts on.
   *
   * Nothing here may fall back to the transcript. In dictation raw text is the honest fallback,
   * because those words are what the user wanted inserted; in an edit the words *are* the
   * instruction, and delivering them would overwrite the passage with "make this shorter". A failed
   * or cancelled pass therefore delivers nothing and says why, leaving the selection untouched —
   * which is also why this path records no polish telemetry: there is no polish tier here, and the
   * pass either produced a replacement or it did not.
   */
  private async finalizeQuickEdit(
    capture: AudioCaptureResult,
    transcript: VoiceTranscript,
    editTarget: VoiceQuickEditTarget,
    signal: AbortSignal | undefined,
    caller: string,
    polishContext?: PolishContext
  ): Promise<FinalizedCaptureResult> {
    const command = resolveQuickEditCommand(transcript.text)
    let replacement: string | null = null
    let outcome: 'literal' | 'model' | 'cancelled' | 'failed'
    if (command?.kind === 'cancel') {
      outcome = 'cancelled'
    } else if (command?.kind === 'replace') {
      replacement = command.text
      outcome = 'literal'
    } else {
      replacement = await this.rewriteSelection(
        transcript.text,
        editTarget.selection,
        signal,
        caller,
        polishContext
      )
      outcome = replacement === null ? 'failed' : 'model'
    }
    throwIfCancelled(signal)
    const text = replacement ?? ''
    voiceLog.info('Quick edit pass finished', {
      meta: {
        outcome,
        selectedChars: editTarget.selection.length,
        instructionChars: transcript.text.length,
        replacementChars: text.length
      }
    })
    return {
      text,
      raw: transcript.text,
      source: 'native-cpal',
      polished: outcome === 'model',
      recognitionProviderId: transcript.providerId,
      recognitionModel: transcript.model,
      recognitionLocation: transcript.recognitionLocation,
      ...(transcript.language ? { language: transcript.language } : {}),
      ...(transcript.billing ? { billing: transcript.billing } : {}),
      ...(transcript.latencyMs === undefined ? {} : { latencyMs: transcript.latencyMs }),
      durationMs: capture.durationMs,
      stoppedReason: capture.stoppedReason,
      ...(text
        ? {}
        : {
            delivery: {
              method: 'none' as const,
              reason: outcome === 'cancelled' ? 'quick-edit-cancelled' : 'quick-edit-failed'
            }
          })
    }
  }

  /**
   * One rewrite through the intelligence `text.chat` capability. Returns null when the pass failed,
   * timed out or came back empty; the caller then delivers nothing.
   *
   * The polish length gate does not apply: it exists to keep a two-word dictation from costing a
   * provider call, and an instruction is exactly the kind of utterance that is short — "短一点"
   * is two characters and the whole point of the feature.
   */
  private async rewriteSelection(
    instruction: string,
    selection: string,
    signal?: AbortSignal,
    caller = VOICE_CALLER,
    context?: PolishContext
  ): Promise<string | null> {
    const spoken = instruction.trim()
    if (!spoken || !selection.trim()) return null
    const startedAt = Date.now()
    const editController = new AbortController()
    const abortEdit = (): void => editController.abort()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      editController.abort()
    }, QUICK_EDIT_TIMEOUT_MS)
    signal?.addEventListener('abort', abortEdit, { once: true })
    try {
      throwIfCancelled(signal)
      const response = await awaitWithAbort(
        tuffIntelligence.invoke<string>(
          'text.chat',
          {
            messages: [
              { role: 'system', content: getVoiceQuickEditPrompt() },
              { role: 'user', content: wrapQuickEditRequest(selection, spoken, context) }
            ]
          },
          {
            signal: editController.signal,
            timeout: QUICK_EDIT_TIMEOUT_MS,
            metadata: { caller }
          }
        ),
        signal
      )
      throwIfCancelled(signal)
      const edited = typeof response.result === 'string' ? response.result.trim() : ''
      if (!edited) {
        voiceLog.warn('Quick edit pass returned nothing; the selection is left as it was', {
          meta: { elapsedMs: Date.now() - startedAt }
        })
        return null
      }
      voiceLog.info('Quick edit pass applied', {
        meta: {
          elapsedMs: Date.now() - startedAt,
          selectedChars: selection.length,
          editedChars: edited.length
        }
      })
      return edited
    } catch (error) {
      if (signal?.aborted) throw voiceCancellationError()
      voiceLog.warn('Quick edit pass failed; the selection is left as it was', {
        meta: { timedOut, elapsedMs: Date.now() - startedAt },
        error
      })
      return null
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortEdit)
    }
  }

  /** Leaves the complete recognized text on the clipboard when active-app delivery cannot finish. */
  private async copyVoiceTextFallback(text: string, reason: string): Promise<VoiceDeliveryResult> {
    const value = text.trim()
    if (!value) return { method: 'none', reason }
    try {
      await clipboardModule.write({ type: 'text', value })
      return { method: 'clipboard', reason }
    } catch (error) {
      voiceLog.warn('Voice text could not be copied after delivery failed', {
        meta: { reason },
        error
      })
      return { method: 'none', reason }
    }
  }

  private async deliverText(
    text: string,
    targetKey: string | null,
    options: { allowPaste?: boolean; format?: boolean } = {}
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
    const staged = allowPaste ? text.trim() : text
    if (!staged) return { method: 'none', reason: 'empty' }
    if (!targetKey) {
      return allowPaste
        ? await this.copyVoiceTextFallback(staged, 'target-unavailable')
        : { method: 'none', reason: 'target-unavailable' }
    }

    const activeApp = await activeAppService.getActiveApp({ forceRefresh: true })
    if (activeAppKey(activeApp) !== targetKey) {
      return allowPaste
        ? await this.copyVoiceTextFallback(staged, 'target-changed')
        : { method: 'none', reason: 'target-changed' }
    }

    /*
     * Shape the transcript for the application that is about to receive it: a command line
     * should not gain a full stop from how the speaker phrased the sentence, and an editor
     * wants identifiers where a chat window wants prose.
     *
     * Live deltas opt out. They are fragments being appended to text the target already
     * holds, so a rule such as "drop trailing sentence punctuation" would fire on every
     * fragment instead of once at the end — and once typed, it cannot be taken back.
     */
    const outgoing =
      options.format === false
        ? staged
        : formatDictationText(staged, appFormatContextFromActiveApp(activeApp)).text
    if (!outgoing) return { method: 'none', reason: 'empty' }

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
    return await this.copyVoiceTextFallback(outgoing, fallback.code ?? 'autopaste-failed')
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
    const providerLatencyMs = normalizeLatency(response.latency)
    await this.recordRecognitionDetail({
      id: nextVoiceSessionId(),
      capturedAt: startedAt,
      source: 'file',
      recognitionLocation: getVoiceRecognitionLocation(response.provider),
      providerId: response.provider,
      model: response.model,
      channel: response.provider,

      status: text ? 'success' : 'empty',
      audio: Buffer.from(selected.audio),
      audioFormat: 'encoded',
      audioExt: selected.format,
      audioBytes: selected.audio.byteLength,
      recognitionDurationMs: Math.max(0, Date.now() - startedAt),
      ...(providerLatencyMs === undefined ? {} : { providerLatencyMs }),
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
    this.retryBufferGeneration += 1
    const retryGeneration = this.retryBufferGeneration
    this.cancelRetryInFlight('Voice recovery superseded by a new session')
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
      configured.model,
      configured.location,

      configured.mode === 'buffered' ? BUFFERED_TRANSCRIPTION_TIMEOUT_MS : CAPABILITY_TIMEOUT_MS,
      configured.mode === 'buffered',
      retryGeneration
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
    model = provider.defaultStreamModel ?? 'default',
    recognitionLocation = getVoiceRecognitionLocation(provider.id),

    requestTimeoutMs = CAPABILITY_TIMEOUT_MS,
    reuseProviderRequestId = false,
    retryGeneration = this.retryBufferGeneration
  ): AsyncGenerator<VoiceAsrStreamEvent> {
    const maxDurationMs = payload.maxDurationMs ?? DEFAULT_MAX_DURATION_MS
    const silenceStopMs = payload.silenceStopMs ?? DEFAULT_SILENCE_STOP_MS
    const cleanup = payload.cleanup !== false && payload.deliveryTiming !== 'live'
    // Live delivery skips tidy-up by design — the raw words are already typed, so a polished
    // version would duplicate them. That is invisible from the outside, and indistinguishable
    // from tidy-up being broken, so say which branch was taken and why.
    voiceLog.info('Voice stream tidy-up decision', {
      meta: {
        cleanup,
        deliveryTiming: payload.deliveryTiming ?? 'final',
        requestedCleanup: payload.cleanup ?? true,
        skippedBecause: cleanup
          ? 'not-skipped'
          : payload.deliveryTiming === 'live'
            ? 'live-delivery'
            : 'caller-disabled'
      }
    })
    const pollCapture = getPollCapture()
    const requestId = reuseProviderRequestId ? randomUUID() : nextVoiceSessionId()
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
      timeoutMs: requestTimeoutMs,
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
      retryGeneration,
      requestId,
      reuseProviderRequestId,
      DEFAULT_ASR_SAMPLE_RATE,
      provider,
      model,
      recognitionLocation,

      requestTimeoutMs,
      session.polishStrength,
      cleanup,
      payload.language,
      session.polishContext
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
          for (const queued of queue) {
            if (queued.kind === 'level') levelCount += 1
          }
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
            this.appendRetryBuffer(session.id, chunk)
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
              this.deliverText(delta, session.targetKey, { allowPaste: false, format: false })
            )
          : null

      const finalizeTranscript = async (
        rawText: string,
        language?: string,
        usage?: VoiceUsage,
        providerLatencyMs?: number
      ): Promise<{ text: string; language?: string; delivery?: VoiceDeliveryResult }> => {
        const normalized = rawText.trim()
        const polishedText = cleanup
          ? await this.polish(
              normalized,
              session.polishStrength,
              signal,
              caller,
              session.polishContext
            )
          : null
        throwIfCancelled(signal)
        const text = polishedText ?? normalized
        let delivery = live
          ? await live.finish(normalized)
          : payload.delivery === 'active-app'
            ? await this.deliverText(text, session.targetKey)
            : undefined
        if (live && delivery?.method === 'none' && payload.delivery === 'active-app') {
          delivery = await this.copyVoiceTextFallback(
            text,
            delivery.reason ?? 'live-delivery-failed'
          )
        }
        const details: Omit<VoiceRecognitionRecordInput, 'id' | 'capturedAt' | 'status' | 'text'> =
          {
            source: 'microphone',
            recognitionLocation,

            audioFormat: 'pcm',
            audioSampleRate: 16_000,
            audio: this.snapshotRetryAudio(session.id),
            audioBytes: capturedBytes,
            audioDurationMs: Math.round(capturedBytes / 32),
            recognitionDurationMs: Math.max(0, Date.now() - session.startedAt),
            ...(providerLatencyMs === undefined ? {} : { providerLatencyMs }),
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
          const finalized = await finalizeTranscript(
            event.text,
            event.language,
            event.usage,
            normalizeLatency(event.latencyMs)
          )
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
          recognitionLocation,

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
      this.clearRetryBuffer(session.id)
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
      const retryable =
        !error || typeof error !== 'object' || !('retryable' in error) || error.retryable !== false
      const preserveFailureAudio = errorCode !== 'VOICE_ASR_AUTHORITY_CHANGED'
      await this.recordRecognitionDetail({
        id: session.id,
        capturedAt: Date.now(),
        source: 'microphone',
        recognitionLocation,

        status: cancelled ? 'cancelled' : 'failed',
        audioFormat: 'pcm',
        audioSampleRate: 16_000,
        audio: preserveFailureAudio ? this.snapshotRetryAudio(session.id) : undefined,
        audioBytes: capturedBytes,
        audioDurationMs: Math.round(capturedBytes / 32),
        recognitionDurationMs: Math.max(0, Date.now() - session.startedAt),
        providerId: provider.id,
        model,
        channel: provider.id,
        errorCode
      })
      if (retryable) this.armRetryBuffer(session.id, cancelled ? 'cancelled' : 'failed')
      else this.clearRetryBuffer(session.id)
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
      this.clearRetryBuffer(buffer.captureId)
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
    const captureId = this.retryBuffer?.captureId ?? null
    if (this.retryInFlight) {
      if (this.retryInFlight.captureId === captureId) {
        return await awaitWithAbort(this.retryInFlight.promise, signal)
      }
      throw Object.assign(new Error('VOICE_RECOVERY_IN_PROGRESS'), {
        code: 'VOICE_RECOVERY_IN_PROGRESS',
        retryable: true
      })
    }
    const controller = new AbortController()
    const operation = this.retryLastFailureOnce(payload, controller.signal, caller)
    const active: ActiveVoiceRetry = { captureId, controller, promise: operation }
    this.retryInFlight = active
    const release = (): void => {
      if (this.retryInFlight === active) this.retryInFlight = null
    }
    void operation.then(release, release)
    return await awaitWithAbort(operation, signal)
  }

  private async retryLastFailureOnce(
    payload: VoiceRetryPayload,
    signal: AbortSignal | undefined,
    caller: string
  ): Promise<VoiceRetryResult> {
    throwIfCancelled(signal)
    const buffer = this.retryBuffer
    if (
      !buffer ||
      buffer.expiresAt === null ||
      buffer.bytes === 0 ||
      Date.now() > buffer.expiresAt
    ) {
      this.clearRetryBuffer(buffer?.captureId)
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
      requestId: buffer.reuseProviderRequestId ? buffer.providerRequestId : nextVoiceSessionId(),
      signal,
      timeoutMs: buffer.requestTimeoutMs,
      enableDdc: true
    }
    let targetKey: string | null = null
    let connection: VoiceStreamConnection | null = null
    let text = ''
    let detectedLanguage: string | undefined
    let providerLatencyMs: number | undefined
    // A retry is its own recognition attempt, so its record times from here rather than
    // inheriting a span that includes the capture the failed attempt already accounted for.
    const attemptStartedAt = Date.now()
    try {
      targetKey = activeAppKey(await activeAppService.getActiveApp())
      throwIfCancelled(signal)
      connection = await buffer.provider.createStream(request)
      for (const chunk of buffer.chunks) {
        throwIfCancelled(signal)
        await connection.writePcm(chunk)
      }
      throwIfCancelled(signal)
      await connection.end()
      for await (const event of connection.events) {
        throwIfCancelled(signal)
        if (event.type === 'error') {
          throw Object.assign(new Error(event.code || 'VOICE_ASR_RETRY_FAILED'), {
            code: event.code || 'VOICE_ASR_RETRY_FAILED',
            retryable: event.retryable
          })
        }
        if (event.type !== 'final' || !event.text.trim()) continue
        text += event.text
        if (event.language) detectedLanguage = event.language
        const eventLatency = normalizeLatency(event.latencyMs)
        if (eventLatency !== undefined) providerLatencyMs = eventLatency
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'retryable' in error && error.retryable === false)
        this.clearRetryBuffer(buffer.captureId)
      throw error
    } finally {
      if (connection) await connection.abort('Voice retry ended').catch(() => {})
    }

    throwIfCancelled(signal)
    const recognized = text.trim()
    if (!recognized) return { text: '' }
    const polishedText = buffer.cleanup
      ? await this.polish(recognized, buffer.polishStrength, signal, caller, buffer.polishContext)
      : null
    throwIfCancelled(signal)
    const deliveredText = polishedText ?? recognized
    const delivery =
      payload.delivery === 'active-app'
        ? await this.deliverText(deliveredText, targetKey)
        : undefined
    if (payload.delivery !== 'active-app' || delivery?.method !== 'none') {
      // Everything the live path records comes from the buffer here. Without it a recovered
      // record kept the failure's fields — including the error code — beside a success status.
      await this.recordInsightSuccess(
        buffer.captureId,
        deliveredText,
        Math.round(buffer.bytes / 32),
        polishedText !== null,
        Date.now(),
        {
          source: 'microphone',
          recognitionLocation: buffer.recognitionLocation,
          audioFormat: 'pcm',
          audioSampleRate: buffer.sampleRate,
          audio: this.snapshotRetryAudio(buffer.captureId),
          audioBytes: buffer.bytes,
          audioDurationMs: Math.round(buffer.bytes / 32),
          recognitionDurationMs: Math.max(0, Date.now() - attemptStartedAt),
          rawText: recognized,
          providerId: buffer.provider.id,
          model: buffer.model,
          channel: buffer.provider.id,
          ...(providerLatencyMs === undefined ? {} : { providerLatencyMs }),
          errorCode: null
        }
      )
    }
    this.clearRetryBuffer(buffer.captureId)
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
  ): Promise<VoiceTranscript> {
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
    const latencyMs = normalizeLatency(response.latency)
    return {
      text,
      providerId: response.provider,
      model: response.model,
      recognitionLocation: getVoiceRecognitionLocation(response.provider),
      ...(detected ? { language: detected } : {}),
      ...(response.result.billing ? { billing: response.result.billing } : {}),
      ...(latencyMs === undefined ? {} : { latencyMs })
    }
  }

  /**
   * AI polish via the intelligence `text.chat` capability. Returns null when the gate skips the
   * pass or the pass fails; the caller then delivers the raw transcript.
   *
   * The length gate lives here, at the single choke point every caller (stream, one-shot,
   * retained-audio retry) already goes through, so a short utterance costs no provider call
   * anywhere. It is a property of the transcript, which does not exist when the stream's
   * tidy-up decision is logged, so the decision is recorded here rather than there.
   */
  private async polish(
    transcript: string,
    strength: VoicePolishStrength,
    signal?: AbortSignal,
    caller = VOICE_CALLER,
    context?: PolishContext
  ): Promise<string | null> {
    if (!transcript.trim()) return null
    // A caller with a fixed delivery target passes the context it captured at session start, so
    // a focus change mid-dictation cannot re-describe the target. Only a flow with no target
    // (a file or a one-shot capture) falls back to whatever is frontmost now.
    let effectiveContext = context
    if (!effectiveContext) {
      try {
        effectiveContext = polishContextFromActiveApp(await activeAppService.getActiveApp())
      } catch {
        // Active application discovery is best-effort; polish proceeds without target hints.
      }
    }
    const tier = resolvePolishTier(transcript)
    const units = countPolishUnits(transcript)
    const telemetryId = nextVoiceSessionId()
    const recordTelemetry = async (
      outcome: VoicePolishOutcome,
      effectiveStrength: VoicePolishStrength | null,
      latencyMs: number,
      polishedCharacters: number
    ): Promise<void> => {
      try {
        await voiceInsightsStore.recordPolishPass({
          id: telemetryId,
          capturedAt: Date.now(),
          tier,
          units,
          characters: transcript.length,
          outcome,
          strength: effectiveStrength,
          requestedStrength: strength,
          latencyMs,
          polishedCharacters
        })
      } catch (error) {
        voiceLog.warn('Voice polish telemetry persistence failed; the pass result is unaffected', {
          error
        })
      }
    }

    if (tier === 'short') {
      voiceLog.info('Polish pass skipped: transcript below the length gate', {
        meta: {
          reason: 'too-short',
          tier,
          units,
          transcriptChars: transcript.length,
          strength
        }
      })
      await recordTelemetry('skipped-short', null, 0, 0)
      return null
    }

    // Below the full-length tier the pass is capped to natural editing: grouping and reordering a
    // couple of sentences is where polish starts inventing structure the speaker never had.
    const effectiveStrength: VoicePolishStrength = tier === 'light' ? 'natural' : strength
    const startedAt = Date.now()
    voiceLog.info('Polish pass starting', {
      meta: {
        strength: effectiveStrength,
        requestedStrength: strength,
        tier,
        units,
        transcriptChars: transcript.length,
        budgetMs: POLISH_TIMEOUT_MS
      }
    })
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
              { role: 'system', content: getVoicePolishPrompt(effectiveStrength) },
              { role: 'user', content: wrapTranscription(transcript, effectiveContext) }
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
      if (!cleaned) {
        voiceLog.warn('Polish pass returned nothing; delivering the raw transcript', {
          meta: { elapsedMs: Date.now() - startedAt, tier }
        })
        await recordTelemetry('empty', effectiveStrength, Date.now() - startedAt, 0)
        return null
      }
      const outcome: VoicePolishOutcome = cleaned === transcript ? 'unchanged' : 'applied'
      voiceLog.info('Polish pass applied', {
        meta: {
          outcome,
          elapsedMs: Date.now() - startedAt,
          tier,
          strength: effectiveStrength,
          transcriptChars: transcript.length,
          polishedChars: cleaned.length
        }
      })
      await recordTelemetry(outcome, effectiveStrength, Date.now() - startedAt, cleaned.length)
      return cleaned
    } catch (error) {
      if (signal?.aborted) throw voiceCancellationError()
      // Cleanup is bounded and optional, so a deadline is a normal raw-transcript path rather
      // than a user-visible failure. It still has to be visible *somewhere*: this used to log
      // nothing at all on the timeout branch, which is precisely the branch that fires, and
      // "tidy-up silently never happens" is indistinguishable from "tidy-up is switched off"
      // when the only record of it is absent.
      const elapsedMs = Date.now() - startedAt
      if (polishTimedOut) {
        voiceLog.warn('Polish pass hit its deadline; delivering the raw transcript', {
          meta: {
            elapsedMs,
            budgetMs: POLISH_TIMEOUT_MS,
            strength: effectiveStrength,
            tier,
            transcriptChars: transcript.length
          }
        })
      } else {
        voiceLog.warn('Polish pass unavailable; delivering the raw transcript', {
          meta: { elapsedMs, tier },
          error
        })
      }
      await recordTelemetry(polishTimedOut ? 'timeout' : 'failed', effectiveStrength, elapsedMs, 0)
      return null
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortPolish)
    }
  }
}

export const voiceService = new VoiceService()
