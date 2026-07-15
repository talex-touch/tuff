# Provider ASR Implementation

1. Extend typed Assistant voice transport contracts with bounded audio transcription request/response types.
2. Register a validated `transcribeAudio` main handler that invokes `tuffIntelligence.audio.stt` with canonical metadata and normalized failures.
3. Add VoicePanel MediaRecorder lifecycle, timeout, cleanup, transcript merge, canonical recovery, and Web Speech fallback.
4. Add localized Chinese and English recording/transcription/fallback copy.
5. Extend focused Assistant behavioral/contract coverage for validation, governed invocation, metadata, and failure mapping.
6. Run focused Assistant tests, CoreApp node and renderer typechecks, scoped ESLint, and a renderer smoke check for VoicePanel behavior.

## Rollback

Remove the new transport event/handler and MediaRecorder branch; the existing Web Speech recognizer remains intact and requires no data rollback.
