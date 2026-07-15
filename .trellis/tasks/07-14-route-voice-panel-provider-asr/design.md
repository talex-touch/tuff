# Provider ASR Design

## Boundaries

- `VoicePanel.vue` owns transient microphone capture, bounded recording lifecycle, and browser Web Speech fallback.
- `AssistantEvents.voice.transcribeAudio` is the only renderer-to-main transport contract for captured audio.
- `AssistantModule` validates the transport payload and invokes `tuffIntelligence.audio.stt`; provider selection, quota, network policy, and normalized errors stay inside the existing Intelligence facade.

## Contract

Request:

- Base64 audio data URL.
- Browser-reported MIME type.
- Recording duration in milliseconds.
- Optional BCP-47 language hint from Assistant runtime settings.

Success:

- Trimmed transcript.
- Optional detected language and confidence.
- Provider, model, trace ID, and latency metadata.

Failure:

- Assistant-local codes for disabled state, invalid audio, oversized audio, overlong recording, unavailable ASR, or empty transcription.
- Existing canonical `IntelligenceErrorCode` values and normalized recovery text for governed provider failures.

## Data Flow

1. VoicePanel requests an audio-only `MediaStream` and starts a `MediaRecorder` using the first supported compact MIME type.
2. User toggles the microphone or the maximum duration elapses; VoicePanel stops all tracks and converts the in-memory Blob to a data URL.
3. Typed transport sends the bounded payload to `AssistantModule`.
4. Main validates MIME, encoded byte count, duration, and Assistant enabled state.
5. Main invokes `tuffIntelligence.audio.stt` with Assistant caller/source metadata.
6. VoicePanel appends the transcript to editable text and stops listening. On provider failure it exposes canonical recovery and starts the existing Web Speech recognizer when available.

## Lifecycle Invariants

- Only one recorder or Web Speech recognizer may be active.
- Provider recording is capped at 30 seconds and 5 MiB decoded audio.
- Cleanup never transcribes unless stop was explicitly requested by the user or duration timeout.
- Raw audio is never logged, persisted, or included in error messages.
- A stale recorder/recognizer callback cannot overwrite a newer capture session.

## Compatibility

- Keep existing Web Speech behavior as fallback, not a parallel capture pipeline.
- Use `audio/webm`/`audio/ogg`/`audio/mp4`/`audio/wav`/`audio/mpeg` formats already accepted by the OpenAI-compatible provider adapter.
- No migration or persisted data changes.
