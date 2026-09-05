# Voice Session Contracts

## Scope

This contract applies to CoreApp voice dictation, the global dictation shortcut,
Assistant VoicePanel, the official `touch-dictation` plugin, and the
`@talex-touch/tuff-native/audio` boundary.

## Ownership

`VoiceService` is the single main-process Voice Session owner. Its
`startSession`, `stopSession`, `cancelSession`, `dictate`, and `streamDictation`
paths own caller identity, target snapshot, AbortSignal handling, native session
lifecycle, STT, polish, delivery, and teardown. Renderer and plugin callers use
the shared Voice SDK; they do not start browser `MediaRecorder`/
`SpeechRecognition`, load the native addon, or implement a second paste path.

Rust `native-audio` owns cpal capture, VAD/trailing silence, bounded PCM
snapshot/drain, platform text injection, Accessibility probing, and playback.
Provider routing, prompts, credentials, Electron clipboard policy, active-app
identity, and plugin permissions remain in main.

## Session invariants

- Every session has a main-issued opaque session id distinct from the native id.
- A session is owned by exactly one caller and can reach one terminal path:
  stop/finalize, cancel, error, or service dispose.
- Caller abort cancels only its own native session. Service teardown cancels every
  owned session before transport cleanup.
- Native session ids never cross renderer, plugin, or ordinary transport
  boundaries.
- Audio bytes and recognized text remain main-owned until the typed SDK result;
  raw native attachments are not public plugin or renderer data.
- The target snapshot is captured before active-app delivery. Delivery is
  refused when the active app/window identity changes.

## Delivery invariants

- Empty text is never delivered.
- Rust native text injection is attempted first when Accessibility is trusted.
- Fallback uses the main-owned AutoPaste automation and snapshots all clipboard
  formats before app-owned writes.
- Clipboard capture is suppressed for the whole write/paste/restore operation.
- Restore attempts each original format independently; a partial restore is a
  stable failure and is never reported as full success.
- Delivery results expose only `native`, `autopaste`, or `none` plus a bounded
  stable reason. Paths, window titles, native errors, and transcript content do
  not enter diagnostics.

## Plugin and UI invariants

- `voice.dictation` remains the plugin permission for dictation and main-owned
  active-app delivery; `touch-dictation` does not require `clipboard.write` for
  its dictation path.
- `voice.stream` callbacks are resource-owned, bounded, and revoked with the
  plugin activation.
- VoicePanel uses `delivery: 'none'` and owns only transcript editing/submission;
  GlobalDictation uses `delivery: 'active-app'`; plugin dictation requests
  active-app delivery through the host capability.
- Permission and stream failures project stable user-facing states, with
  microphone recovery available for recognized permission failures.

## Required checks

- VoiceService and GlobalDictation focused Vitest.
- VoicePanel and Assistant focused Vitest.
- Plugin voice/child/runtime and clipboard AutoPaste focused tests.
- Shared Voice SDK tests and plugin manifest validation.
- Rust `native-audio` tests, release addon build, and headless addon load check.
- CoreApp Web typecheck and Node typecheck; a missing unrelated workspace type
  dependency must be reported separately rather than bypassed in source.
- Packaged Electron/plugin isolation smoke and explicit real-app injection
  evidence before claiming cross-platform support.
