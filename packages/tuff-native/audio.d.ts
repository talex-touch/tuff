/// <reference types="node" />

import type { Buffer } from 'node:buffer'

export interface NativeAudioSupport {
  supported: boolean
  platform: string
  reason?: string
}

export interface AudioCaptureOptions {
  /** Hard cap before the session auto-stops. Default 15000. */
  maxDurationMs?: number
  /** Trailing-silence window that ends the session once speech was heard. Default 1500. */
  silenceStopMs?: number
  /** Requested capture sample rate; falls back to the device default when omitted. */
  sampleRate?: number
}

export interface AudioCaptureStart {
  sessionId: string
}

export type AudioStoppedReason = 'manual' | 'max-duration' | 'silence' | 'cancelled'

export interface AudioCaptureResult {
  /** 16-bit PCM mono WAV bytes (complete file, with header). */
  audio: Buffer
  format: 'wav'
  sampleRate: number
  /** Channel count of the returned WAV (always 1 — capture is downmixed to mono). */
  channels: number
  durationMs: number
  /** How the session ended. `cancelCapture` sessions never surface here. */
  stoppedReason: 'manual' | 'max-duration' | 'silence'
}

export interface AudioCaptureState {
  /** `false` once the native capture thread has auto-stopped (silence/max-duration) or been stopped. */
  active: boolean
  /** Audio captured so far, in whole milliseconds. */
  durationMs: number
  /** `null` while active; the stop reason once the thread has stopped. */
  stoppedReason: string | null
}

export interface AudioSnapshot {
  /** 16-bit PCM mono WAV of everything captured so far (complete file, with header). */
  audio: Buffer
  /** Audio captured so far, in whole milliseconds. */
  durationMs: number
}

export interface AudioPcmChunk {
  /** NEW samples since the last drain, as raw 16-bit signed little-endian MONO PCM (no header). Empty when no new frames. */
  pcm: Buffer
  sampleRate: number
  /** Always 1 — the delta is downmixed to mono. */
  channels: number
}

export interface AudioPlaybackStart {
  playbackId: string
}

export interface TypeTextResult {
  ok: boolean
  /** Present when `ok` is false, e.g. 'accessibility-required' | 'disabled-by-env' | an error message. */
  reason?: string
}

export declare function getNativeAudioSupport(): NativeAudioSupport
export declare function startCapture(options?: AudioCaptureOptions): AudioCaptureStart
export declare function pollCapture(sessionId: string): AudioCaptureState
export declare function snapshotCapture(sessionId: string): AudioSnapshot
/** Returns only the NEW captured PCM since the last drain (raw 16-bit LE mono). Throws `session-not-found: <id>` for an unknown id. */
export declare function drainCapture(sessionId: string): AudioPcmChunk
export declare function stopCapture(sessionId: string): AudioCaptureResult
export declare function cancelCapture(sessionId: string): void
/** Decode WAV/MP3 bytes and play them through the default output device. Returns immediately; playback continues on a native thread. Throws when the binding is unavailable or the audio can't be decoded. */
export declare function playAudio(bytes: Buffer): AudioPlaybackStart
/** Stop one playback by id, or all playbacks when omitted. Unknown/absent id is a no-op. */
export declare function stopPlayback(playbackId?: string): void
/** macOS: whether this process has Accessibility (AX) trust; always true on Windows/Linux. Never prompts. */
export declare function isAccessibilityTrusted(): boolean
/** Type `text` into the frontmost app (unicode-safe). On macOS without AX trust returns `{ ok:false, reason:'accessibility-required' }`. Never throws. */
export declare function typeText(text: string): TypeTextResult
