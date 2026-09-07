/**
 * @fileoverview Voice domain SDK — speech dictation + TTS over the Tuff transport.
 * @module @talex-touch/utils/transport/sdk/domains/voice
 *
 * Surface:
 * - {@link VoiceSdk.dictate} — canonical one-shot Voice Session.
 * - {@link VoiceSdk.asrStream} — canonical live session (partial → final → end).
 * - {@link VoiceSdk.speak} — text-to-speech backed by the same native audio package.
 *
 * Every voice input caller uses this contract; capture and platform injection remain main-owned.
 * Modeled on the `intelligence` domain SDK.
 */
import type { ITuffTransport, StreamController, StreamOptions } from "../../types";
import { defineEvent } from "../../event/builder";

/** Standard envelope returned by voice API handlers. */
export type VoiceApiResponse<T = undefined> =
  | { ok: true; result?: T }
  | { ok: false; error: string };

/** Where the canonical session should deliver its final text. */
export type VoiceDeliveryMode = "none" | "active-app";

/** Result of the main-owned text delivery step. */
export interface VoiceDeliveryResult {
  method: "native" | "autopaste" | "none";
  reason?: string;
}

/** One-shot dictation request: capture mic → STT → optional AI polish. */
export interface VoiceDictatePayload {
  /** BCP-47 language hint (e.g. "zh-CN", "en-US"). Auto-detect when omitted. */
  language?: string;
  /** Run the AI cleanup/polish pass over the raw transcript. Default `true`. */
  cleanup?: boolean;
  /** Hard cap on capture length in ms (native auto-stops at this). */
  maxDurationMs?: number;
  /** Auto-stop after this much trailing silence in ms. */
  silenceStopMs?: number;
  /** Keep text only, or let main deliver it to the active application. */
  delivery?: VoiceDeliveryMode;
}

/** Result of a one-shot dictation. */
export interface VoiceDictateResult {
  /** Final text — polished when `cleanup` ran, otherwise the raw transcript. */
  text: string;
  /** Raw transcript before any polish pass. */
  raw: string;
  /** Where the transcript came from (e.g. "native-cpal"). */
  source: string;
  /** Whether the AI polish pass actually ran. */
  polished: boolean;
  /** Detected/echoed language, when available. */
  language?: string;
  /** Captured audio duration in ms. */
  durationMs?: number;
  /** Why capture stopped: "manual" | "max-duration" | "silence". */
  stoppedReason?: string;
  /** Main-owned delivery outcome when delivery was requested. */
  delivery?: VoiceDeliveryResult;
}

/** Text-to-speech request. */
export interface VoiceSpeakPayload {
  /** The text to synthesize. */
  text: string;
  /** BCP-47 language hint. */
  language?: string;
  /** Provider voice id, when supported. */
  voice?: string;
  /** Also play the audio through the system speakers. Default `true`. */
  play?: boolean;
}

/** Result of a text-to-speech request. */
export interface VoiceSpeakResult {
  /** Synthesized audio as a data URL. */
  audio: string;
  /** Audio container format (e.g. "wav", "mp3"). */
  format: string;
  /** Whether it was played through the speakers. */
  played: boolean;
  /** Audio duration in ms, when reported. */
  durationMs?: number;
}

/** Streaming ASR request backed by the same Voice Session owner. */
export interface VoiceAsrStreamPayload {
  language?: string;
  cleanup?: boolean;
  maxDurationMs?: number;
  silenceStopMs?: number;
  delivery?: VoiceDeliveryMode;
  /** Main-selected provider id; omitted uses the configured provider priority. */
  providerId?: string;
  /**
   * Emit `level` events alongside the transcript, for input-level visualization.
   *
   * Off by default so existing callers keep their exact event sequence: a caller
   * that only wants text must not have to filter frames it never asked for.
   */
  emitLevel?: boolean;
}

/**
 * Retry the most recent failed streaming session, reusing the audio it already captured.
 *
 * There is no token: stream failures travel the error channel, which only preserves a message
 * and a stable code, so main keeps a single slot instead. See the retention contract in the
 * task design — the buffer lives in main memory only, is dropped on success or cancel, and
 * expires on a grace timer after a failure.
 */
export interface VoiceRetryPayload {
  language?: string;
  delivery?: VoiceDeliveryMode;
}

export interface VoiceRetryResult {
  text: string;
  language?: string;
  delivery?: VoiceDeliveryResult;
  /**
   * The buffered audio is gone — the grace window closed, or it was cleared.
   *
   * The caller must say so rather than pretending a retry happened: `text` is empty here,
   * and reporting it as a failed transcription would blame the wrong thing.
   */
  expired?: boolean;
}

/** What left a recoverable recording behind — the two paths that keep audio. */
export type VoiceRecoveryKind = "cancelled" | "failed";

/**
 * Whether the last session left audio that can still be recovered.
 *
 * Exists so the dock can offer recovery after it has already collapsed: without it, audio
 * kept past the five seconds the pill is on screen would have no reachable entry point, and
 * retention with nothing to reach it is just retention.
 */
export interface VoiceRecoveryStatus {
  available: boolean;
  kind?: VoiceRecoveryKind;
  /** Milliseconds left in the recovery window; absent when nothing is held. */
  expiresInMs?: number;
}

/** Main-owned source reference for uploaded audio recognition. */
export interface VoiceTranscribeUploadPayload {
  /** HTTPS URL resolved by main; raw file paths and binary payloads are not public DTOs. */
  sourceUrl: string;
  language?: string;
  providerId?: string;
  model?: string;
  enableTimestamps?: boolean;
  enableSpeakerDiarization?: boolean;
  removeDisfluencies?: boolean;
}

export interface VoiceTranscribeUploadResult {
  text: string;
  language?: string;
  durationMs?: number;
  requestId?: string;
  segments?: Array<{
    text: string;
    startMs: number;
    endMs: number;
    speaker?: string;
  }>;
}

/** Streaming ASR event. */
export type VoiceAsrStreamEvent =
  | { type: "partial"; text: string }
  /**
   * Captured input level, normalized to 0..1, roughly 10Hz.
   *
   * Only emitted when the request opted in with `emitLevel`. It carries no
   * transcript and must never be treated as progress: it is the measured
   * amplitude of what the microphone just heard, nothing more.
   */
  | { type: "level"; rms: number }
  | {
      type: "final";
      text: string;
      language?: string;
      delivery?: VoiceDeliveryResult;
    }
  | { type: "end" };


/**
 * Voice domain events. Event names resolve to `voice:api:<action>`.
 */
export const voiceApiEvents = {
  dictate: defineEvent("voice")
    .module("api")
    .event("dictate")
    .define<VoiceDictatePayload, VoiceApiResponse<VoiceDictateResult>>(),
  speak: defineEvent("voice")
    .module("api")
    .event("speak")
    .define<VoiceSpeakPayload, VoiceApiResponse<VoiceSpeakResult>>(),
  transcribeUpload: defineEvent("voice")
    .module("api")
    .event("transcribe-upload")
    .define<
      VoiceTranscribeUploadPayload,
      VoiceApiResponse<VoiceTranscribeUploadResult>
    >(),
  /**
   * Open the operating system's microphone settings.
   *
   * Takes no payload on purpose: the caller names an intent, main owns the URL. The scheme
   * these panes use (`x-apple.systempreferences:`, `ms-settings:`) is not on the external-URL
   * allowlist, and it must not be — letting a renderer hand over an arbitrary scheme to open
   * would reopen exactly what that allowlist closes.
   */
  openMicrophoneSettings: defineEvent("voice")
    .module("api")
    .event("open-microphone-settings")
    .define<void, VoiceApiResponse>(),
  recoveryStatus: defineEvent("voice")
    .module("api")
    .event("recovery-status")
    .define<void, VoiceApiResponse<VoiceRecoveryStatus>>(),
  retryLastFailure: defineEvent("voice")
    .module("api")
    .event("retry-last-failure")
    .define<VoiceRetryPayload, VoiceApiResponse<VoiceRetryResult>>(),
  asrStream: defineEvent("voice")
    .module("api")
    .event("asr-stream")
    .define<VoiceAsrStreamPayload, AsyncIterable<VoiceAsrStreamEvent>>({
      stream: { enabled: true },
    }),
} as const;

/** Minimal transport surface the voice SDK needs (send required, stream optional). */
export type VoiceSdkTransport = Pick<ITuffTransport, "send"> &
  Partial<Pick<ITuffTransport, "stream">>;

export interface VoiceSdk {
  /** Capture speech and return (optionally AI-polished) text in one shot. */
  dictate: (payload?: VoiceDictatePayload) => Promise<VoiceDictateResult>;
  /** Synthesize text and (by default) play it through the speakers. */
  speak: (payload: VoiceSpeakPayload) => Promise<VoiceSpeakResult>;
  /** Transcribe a main-owned HTTPS audio source. */
  transcribeUpload: (
    payload: VoiceTranscribeUploadPayload,
  ) => Promise<VoiceTranscribeUploadResult>;
  /** Open a live streaming ASR session (partial → final → end). */
  asrStream: (
    payload: VoiceAsrStreamPayload,
    options: StreamOptions<VoiceAsrStreamEvent>,
  ) => Promise<StreamController>;
  /** Re-transcribe the audio the last failed session already captured. */
  retryLastFailure: (payload?: VoiceRetryPayload) => Promise<VoiceRetryResult>;
  /** Ask whether a cancelled or failed recording is still recoverable. */
  recoveryStatus: () => Promise<VoiceRecoveryStatus>;
  /** Open the OS microphone settings pane; rejects where the platform has none. */
  openMicrophoneSettings: () => Promise<void>;
}

function assertVoiceApiResponse<T>(
  response: VoiceApiResponse<T>,
  fallbackMessage: string,
): T {
  if (!response?.ok) {
    throw new Error(response?.error || fallbackMessage);
  }
  return response.result as T;
}

export function createVoiceSdk(transport: VoiceSdkTransport): VoiceSdk {
  return {
    async dictate(payload = {}) {
      const response = await transport.send(voiceApiEvents.dictate, payload);
      return assertVoiceApiResponse(response, "Voice dictate failed");
    },

    async speak(payload) {
      const response = await transport.send(voiceApiEvents.speak, payload);
      return assertVoiceApiResponse(response, "Voice speak failed");
    },
    async transcribeUpload(payload) {
      const response = await transport.send(voiceApiEvents.transcribeUpload, payload);
      return assertVoiceApiResponse(response, "Voice upload transcription failed");
    },

    async openMicrophoneSettings() {
      const response = await transport.send(voiceApiEvents.openMicrophoneSettings, undefined);
      assertVoiceApiResponse(response, "Voice microphone settings failed");
    },

    async recoveryStatus() {
      const response = await transport.send(voiceApiEvents.recoveryStatus, undefined);
      return assertVoiceApiResponse(response, "Voice recovery status failed");
    },

    async retryLastFailure(payload = {}) {
      const response = await transport.send(voiceApiEvents.retryLastFailure, payload);
      return assertVoiceApiResponse(response, "Voice retry failed");
    },

    async asrStream(payload, options) {
      if (typeof transport.stream !== "function") {
        throw new TypeError(
          "Voice streaming requires a stream-capable transport",
        );
      }
      return transport.stream(voiceApiEvents.asrStream, payload, options);
    },
  };
}
