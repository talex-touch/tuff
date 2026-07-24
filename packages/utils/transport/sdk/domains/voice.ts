/**
 * @fileoverview Voice domain SDK — speech dictation + TTS over the Tuff transport.
 * @module @talex-touch/utils/transport/sdk/domains/voice
 *
 * Surface:
 * - {@link VoiceSdk.dictate} — one-shot capture → transcribe → optional polish.
 * - {@link VoiceSdk.asrStream} — live streaming ASR (partial → final → end).
 * - {@link VoiceSdk.speak} — text-to-speech, optionally played through the speakers.
 *
 * Modeled on the `intelligence` domain SDK.
 */
import type { ITuffTransport, StreamController, StreamOptions } from "../../types";
import { defineEvent } from "../../event/builder";

/** Standard envelope returned by voice API handlers. */
export type VoiceApiResponse<T = undefined> =
  | { ok: true; result?: T }
  | { ok: false; error: string };

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

/** Reserved streaming ASR seam — not wired in the MVP backend. */
export interface VoiceAsrStreamPayload {
  language?: string;
}

/** Streaming ASR event. */
export type VoiceAsrStreamEvent =
  | { type: "partial"; text: string }
  | { type: "final"; text: string; language?: string }
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
  /** Open a live streaming ASR session (partial → final → end). */
  asrStream: (
    payload: VoiceAsrStreamPayload,
    options: StreamOptions<VoiceAsrStreamEvent>,
  ) => Promise<StreamController>;
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
