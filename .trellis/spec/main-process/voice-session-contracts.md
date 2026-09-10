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
- VoicePanel is now the compact VoiceDock recording HUD and uses `delivery: 'active-app'`,
  as does GlobalDictation; plugin dictation requests active-app delivery through the
  host capability. No renderer-owned textarea or clipboard delivery pipeline remains.
- Permission and stream failures project stable user-facing states, with
  microphone recovery available for recognized permission failures.

## Voice input enablement

- `AppSetting.voiceInput.enabled` alone gates platform dictation gestures, HUD entry, and the
  Assistant voice runtime projection. Assistant visibility, floating-ball visibility, and legacy
  wake-word preferences must not authorize or disable shortcut dictation.
- Missing `voiceInput` is migrated during raw main-storage normalization, before caching/defaults
  can hide absence: preserve legacy `assistant.enabled && voiceWake.enabled` and language once.
  Any explicit new value wins; malformed new values fail closed rather than restoring legacy enablement.
- A hidden resting ball permits a temporary Fn HUD, and remains hidden when that HUD closes.
  Turning voice input off stops the active HUD; renderer starts must wait for enabled runtime config.
- Wake-word controls are unavailable until their actual runtime is implemented and verified.

## Speech capability configuration authority

- Existing Intelligence channels own credentials and safe protocol metadata. A custom speech
  channel stores only normalized `metadata.voiceAsr` identifiers beside its existing credential reference.
- `audio.asr` owns realtime capability bindings; `audio.stt` owns file transcription bindings.
  Reuse the shared Intelligence route resolver and model policy; never create a Voice-specific provider catalog
  or persist a second routing table in app settings. `audio.transcribe` retains its original semantics.
- Voice settings expose read-only readiness and links to the existing channel/capability editors.
  A configured state is not proof of cloud connectivity. ASR capability tests exercise only saved bindings.
- A live ASR session and its recovery retain the original adapter/model; no cross-provider/STT replay.
  Local file transcription is host-owned, bounded, cancellable through the network layer, and returns text
  without active-app delivery. Raw paths, bytes, and credentials do not cross into the renderer.

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

## Scenario: Fn interception and asynchronous HUD ownership

### Scope / Trigger

Changes to native Fn capture, voice gestures, HUD open/stop/close, or audio addon startup.

### Signatures

- `startFunctionKeyMonitor(listener): { active: boolean; reason?: string }`, `stopFunctionKeyMonitor()`.
- Events: `down { hasOtherKeys }`, `up`, `other-key-down`, `reset`, `escape-down`, `escape-up`.
- `CommandVoiceGestureController(sink, isVoiceSessionActive, registerKeyListener?)` defaults to the platform registrar.

### Contracts

- macOS Fn requires a main-thread active HID-level CGEventTap and Accessibility permission. Physical keycode63,
  not the Function flag alone, identifies Fn. Read/project original Fn down/up first, then clear only
  `MaskSecondaryFn` on standalone-owned Fn transitions and forward the original event. Preserve other flags
  and combination-key events, and do not return null for a standalone Fn transition: dropping it removes an
  edge other applications may need and buys nothing.
- The tap cannot stop the system's Globe/Emoji action, and no tap-level policy will. Both were tried
  physically on this machine and both failed: dropping the event (`753f75df0`, downstream measured 0 Fn
  events, panel still opened) and forwarding it with `MaskSecondaryFn` cleared (`8a7987d30` / `19febfb49`,
  panel still opened). The Globe action is fired by WindowServer below the tap. The only supported fix is the
  user preference `com.apple.HIToolbox AppleFnUsageType` ("Press 🌐 key to" -> Do Nothing); the System
  Settings toggle applies immediately, a `defaults write` only after logout. Do not change it silently for
  the user. Do not claim Fn interception from a downstream event probe reading zero — that probe cannot see
  this action; only looking at the panel can.
- Failed HID tap creation is explicitly unavailable; do not silently fall back to Session-level
  interception or change the user's global Fn preference. Native loader requires the current monitor ABI marker.
- Escape is observed globally but passes through to other applications. Assistant main owns the 600ms
  hold and sends typed `cancelHold` start/reset/commit; renderer progress is visual only. A short press
  does not cancel, and closing/resetting a HUD clears its hold timer.
- VoiceDock never dismisses or cancels on blur. Pending mount/config cancellation must fence late startup.
- Short Fn/Ctrl taps send `toggle` intent, not a start/stop guess based on window visibility.
  The recording HUD stops active capture or starts a fresh session from a terminal notice; it does not
  invoke recovery for old audio. Explicit hold-start is not blocked by a prior session's start latch.
- A bounded FIFO retains transition ordering; overflow invalidates queued actions and projects reset.
  Environment cleanup removes the tap and stale registered callbacks are inert.
- A panel/session generation owns every async callback. A pending-handle stop is applied as `stop()`
  when the handle arrives; cancellation discards it. Error retires the generation before showing a notice.
- C++ install/build/rebuild uses `node-gyp configure build`; destructive rebuild would erase Rust addons.
  `dev-electron-wrapper.mjs` prepares and verifies audio before launch. `build-audio.js` signs a staged
  artifact and atomically replaces the single `build/Release/tuff_native_audio.node`; no target-directory fallback.

### Validation & Error Matrix

- No permission / failed tap registration -> inactive reason, never report usable Fn.
- Other key before/after Fn -> no tap activation; an already-started hold receives one stop.
- Stop before asrStream handle -> finalize once on arrival, never cancel instead.
- Error followed by end / old callback after reopen -> preserve notice / ignore old callback.

### Good / Base / Bad Cases

- Good: native event interception plus downstream passthrough probe and real PCM capture.
- Base: Windows/Linux keep Ctrl through OmniPanel because hardware Fn is not universally exposed.
- Bad: count AppKit monitor registration as event proof, coalesce down/up into a single latest value,
  or infer current recording from a local toggle boolean after the session already ended.

### Required Checks

- Reducer tests cover key-order contamination and exact Fn-only suppression.
- Controller/HUD tests cover stale generations, pending stop, and error/end ordering.
- Native build/load, real Electron microphone capture and downstream key-event smoke; verify no
  transcript/audio is logged or written by the acceptance probe.

### Wrong vs Correct

- Wrong: `cancel()` because the stream handle has not resolved at key release.
- Correct: record a generation-owned stop request and call the arriving handle's `stop()`.
- Wrong: package-manager install silently deletes audio, then runtime loads an arbitrary old fallback.
- Correct: preserve independent C++/Rust products and prepare the canonical addon before Electron caches its loader result.
