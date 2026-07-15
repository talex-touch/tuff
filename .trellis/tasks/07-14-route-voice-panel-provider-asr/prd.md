# Route VoicePanel Through Provider ASR

## Goal

Route Assistant VoicePanel microphone input through the governed Intelligence `audio.stt` provider path so voice entry works without depending on browser Web Speech, while retaining Web Speech as a compatibility fallback.

## Requirements

- Capture a short microphone recording inside VoicePanel with browser media APIs and send it to the main process over a typed Assistant transport event.
- Invoke the existing `tuffIntelligence.audio.stt` facade with explicit Assistant caller/source metadata; do not call providers, raw HTTP endpoints, or the host-only runtime directly.
- Validate audio MIME type, encoded size, and recording duration in the main process before invoking Intelligence.
- Return normalized transcription text plus non-sensitive provider/model/trace metadata, or a canonical Intelligence error with recovery guidance.
- Preserve microphone-permission recovery and use browser Web Speech only when media recording is unavailable or governed provider transcription fails.
- Keep all audio transient in memory. Do not persist or log raw microphone bytes.
- Local Whisper/model-runtime installation and provider configuration UI changes are out of scope.

## Acceptance Criteria

- [x] VoicePanel records supported microphone audio, stops on user action or a bounded timeout, and sends a typed transcription request.
- [x] The main handler rejects disabled Assistant state, invalid/oversized audio, and overlong recordings before provider work.
- [x] A valid request calls `tuffIntelligence.audio.stt` with `caller=core.assistant.voice-transcribe` and returns trimmed text and invocation metadata.
- [x] Provider errors preserve canonical error codes and expose Intelligence settings recovery where appropriate.
- [x] Unsupported media recording or failed provider transcription can fall back to the existing Web Speech path without a second capture implementation.
- [x] Closing, submitting, translating, or unmounting VoicePanel stops recorder tracks and discards unfinished audio.
- [x] Chinese and English UI copy covers recording, transcription, fallback, and failure states.
- [x] Focused Assistant tests, CoreApp node typecheck, renderer typecheck, and scoped lint pass.

## Out of Scope

- Bundling or downloading Whisper models.
- Changing provider registration or model-selection policy.
- Long-form transcription, audio-file import, diarization, or stored recording history.
