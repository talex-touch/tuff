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
- Live delivery's acknowledged text is exactly the concatenation of successful native
  writes. Never rewind that text to a revised ASR common prefix: the target buffer has
  not been rewound. Both partial and final paths reconcile Unicode punctuation in
  order and append only the uncommitted suffix. Letters, numbers, symbols, and whitespace
  remain exact; an unalignable lexical final returns `none / transcript-revised`, not a
  guessed suffix or an edit to the user's earlier text. Preserve a prior native failure.
- Native input completion and visible input are separate boundaries: await `typeText`
  and observe the task-owned target's actual value before claiming delivery. Repeated
  final events must neither retype text nor change the acknowledged byte history.
- The polish deadline must reach the provider's actual request, not only the outer
  promise. OpenAI-compatible chat, stream, and shared vision calls pass the host-only
  AbortSignal into LangChain call options; healthy retry policy stays unchanged. Verify
  pre-abort zero requests, in-flight socket close, no delayed retry, and cancellation
  while awaiting an SSE delta with the installed client against loopback HTTP.

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

## Capture signal chain

`CaptureFrontend` in Rust `native-audio` owns everything between the device callback and the
target-rate mono buffer: downmix, non-finite sanitisation, optional RNNoise, high-pass,
anti-alias low-pass, resampling and speech detection. It is one struct behind one lock; do not
reintroduce a second processing site in the audio callback.

- Downsampling must band-limit first. Linear interpolation does not attenuate above the output
  Nyquist, so without a low-pass the 8-24 kHz half of a 48 kHz capture folds into the speech
  band — measured at -1.26 dB for 10 kHz landing on 6 kHz. The cascade is engaged only when the
  target rate is below the source rate, and must hold for non-integer ratios (44.1 kHz is real
  hardware, not a hypothetical). Band-limiting the existing resampler is the contract; replacing
  it with a polyphase design is not required and costs the tests that pin its behaviour.
- Filter coefficients and biquad state are `f64` while the signal stays `f32`. An 80 Hz corner
  against 48 kHz puts the poles within 0.01 rad of z=1, which single precision cannot hold.
- A non-finite input sample must be zeroed before it reaches any cascade. The sections are
  recursive: one NaN in their state is not one bad sample, it is silence to the end of the
  session.
- Trailing-silence detection runs on the chain's *output*, against a noise floor estimated from
  the signal — the minimum window RMS over a recent sliding window, plus an absolute guard.
  A fixed absolute threshold is wrong in both directions and was measured wrong on real
  hardware: at -40 dBFS it sat 3.7 dB under an ordinary quiet room's median noise, 18% of
  windows crossed it, the longest quiet gap was 500 ms against a 1500 ms requirement, and
  trailing-silence auto-stop therefore never fired at all.
- Do not estimate that floor with an exponential average. It forces a choice about whether to
  keep adapting while speech is believed present, and both answers fail: adapting lets a long
  utterance drag the floor to its own level, and freezing deadlocks, because the state that
  would release the freeze is gated on the frozen estimate. A minimum cannot be pushed up by
  loud input and has no feedback path.
- `should_stop_for_silence`, `SilenceState` and the silence-window semantics are unchanged by
  any of this. Only how a window is classified as speech changed.

## Noise suppression preference

- `voiceInput.noiseSuppression` is a preference defaulting to **off**, normalised `=== true`
  so an unreadable value fails closed. It is independent of the high-pass and anti-alias
  filtering, which are defect fixes and have no switch.
- Off by default because cloud recognisers are trained on noisy speech and spectral distortion
  can cost more accuracy than the noise removed. Changing that default requires a real-provider
  recognition A/B on real noisy audio. Objective dB reductions from synthetic signals prove the
  suppressor works; they are not evidence about recognition accuracy and must not be presented
  as such.
- Resolved exactly once, in `startSession`, before the first asynchronous boundary — the same
  contract as `polishStrength`. Never re-read while finalising or replaying retained audio: the
  audio in hand was captured one way, and re-reading describes it as something it is not.
  A payload field overrides for one capture and does not write the preference.
- RNNoise is defined only at 48 kHz. The stage converts to that rate rather than feeding the
  model a rate it was never trained on, and **keeps emitting 48 kHz after a failure**, because
  everything downstream is configured against it. Frame blocking must not shorten the recording;
  the model's fade-in frame emits its input rather than being dropped, which would shift the
  whole recording 10 ms earlier.
- A suppressor that fails degrades to a rate converter and the session keeps recording. Losing
  suppression is recoverable; losing the dictation is not.

## Provider VAD defaults

- A zero `server_vad` threshold is not a lenient setting, it is no detection at all. DashScope
  realtime shipped with `?? 0.0`, which disabled the only real voice-activity detection in the
  dictation path. Defaults use `??` so an explicit `0` from a caller remains distinguishable
  from an absent value.
- Do not invent VAD parameters for providers whose protocols do not expose them, and do not
  create a Voice-specific provider catalog to hold them.

## Required checks

- VoiceService and GlobalDictation focused Vitest.
- VoicePanel and Assistant focused Vitest.
- Plugin voice/child/runtime and clipboard AutoPaste focused tests.
- Shared Voice SDK tests and plugin manifest validation.
- Rust `native-audio` tests, release addon build, and headless addon load check.
- DSP assertions carry a control that fails when the stage under test is removed. A suppression
  measurement that reports silence because the generator broke passes a naive threshold.
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
  panel still opened). The Globe action is fired by WindowServer below the tap. The switch is the user
  preference `com.apple.HIToolbox AppleFnUsageType` ("Press 🌐 key to" -> Do Nothing), and writing it with
  `defaults` **applies immediately** — no logout, no agent restart, verified on macOS 26 by writing it and
  pressing the key. nix-darwin and two other Fn-triggered dictation apps all state that a logout is
  required; they are repeating each other, not reporting a test. Write it only on an explicit user click,
  and report status from a fresh read rather than from the write's exit code. Do not claim Fn interception
  from a downstream event probe reading zero — that probe cannot see this action; only looking at the
  panel can.
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

## Scenario: Dictation polish strength

### Scope / Trigger

Changes to Voice Input preferences, Assistant runtime configuration, dictation prompts, or recovery.

### Signatures

- `VoicePolishStrength = 'natural' | 'structured' | 'deep'` and `normalizeVoicePolishStrength(unknown)` live in the shared app-settings module; `DEFAULT_VOICE_POLISH_STRENGTH` is `deep`.
- `voiceInput.polishEnabled` stores the user's cleanup preference; `AssistantRuntimeConfig.polishAvailable` projects the configured, enabled `text.chat` capability. VoicePanel selects final delivery only when both are true; otherwise it selects live raw delivery. `voiceInput.polishStrength` selects editing scope.
- `VoiceDictatePayload.polishStrength` and `VoiceAsrStreamPayload.polishStrength` optionally override the saved preference for one session; no new provider or prompt-routing table is introduced.

### Contracts

- Missing/invalid strength normalizes to deep without overwriting explicit polish disablement, language, history, or unrelated settings. Hiding the selector when polish is off never clears its value.
- VoicePanel snapshots both the persisted cleanup preference and `text.chat` availability before capture. `VoiceService` resolves omitted strength from main storage before capture's first asynchronous boundary, stores it on the session, and retains it with the retry buffer. Do not reread preferences while finalizing or replaying old audio.
- One shared fidelity policy plus three precomposed editing directives owns the prompt. Natural preserves sequence, structured groups related points, and deep rewrites the draft assertively. All preserve independent requirements, qualifiers, negations, conditions, numbers, language and tone. ASR language is not a polish translation instruction.
- Live/cleanup-disabled recordings and their recovery skip the polish pass. A user who enables cleanup without a ready Chat capability still gets live raw dictation rather than an avoidable final-mode delay. Cancellation still prevents late delivery; the shipped `POLISH_TIMEOUT_MS` (8s, exported) returns raw text without claiming it was polished.

### Validation & Error Matrix

- Missing/invalid stored strength -> deep; valid stored choice -> unchanged across normalization and reload.
- Settings change during capture startup/recording -> next session only; retained-audio retry -> original strength and cleanup policy.
- Polish timeout/failure/empty response -> raw-final fallback; caller cancellation -> no late result delivery.

### Good / Base / Bad Cases

- Good: choose structured, start recording, switch to natural, and finish/retry using structured.
- Base: historical profile keeps polish disabled while acquiring the deep default; enabling polish restores its saved selection.
- Bad: rebuild the prompt from current settings at stop, infer that repeated sentence patterns cancel earlier list items, or force a translation from the recognition language hint.

### Tests Required

- Main-storage migration preserves disabled state and unrelated fields; real settings interactions hide/re-enable and reload without losing strength.
- VoiceService one-shot/startup/retry regressions defend session snapshots and no-cleanup replay. Existing live-delivery and cancellation tests continue to pass.
- UI smoke uses the actual settings SFC and TuffEx controls with isolated storage. Mocked prompt selection proves session policy, not linguistic quality; real-provider editing quality requires a separate coordinated run.

### Wrong vs Correct

- Wrong: resolve `getMainConfig(...).voiceInput.polishStrength` inside final polish or retry.
- Correct: resolve once in `startSession`, then use `session.polishStrength` and the retained retry snapshot.

## Scenario: Dictation polish length gate and telemetry

### Scope / Trigger

Changes to when the tidy-up pass runs at all, its per-length editing scope, or the polish telemetry
table/summary. Rationale and market evidence: `.trellis/tasks/09-10-voice-polish-length-gate/research.md`.

### Signatures

- `countPolishUnits(text): number` — CJK characters plus words in every other script, counted by
  ICU word segmentation (`Intl.Segmenter`) rather than a letter-run regex, because Thai/Lao/
  Khmer/Myanmar separate no words with spaces and combining marks must stay inside their word.
- `resolvePolishTier(text): 'short' | 'light' | 'full'` — `< 12` units short, `< 60` light, else full.
- `VoiceInsightsStore.recordPolishPass(input)` / `summarizePolishTelemetry(windowDays, now)`.
- Table `voice_polish_telemetry` (aux); migration `0045_voice_polish_telemetry`; schema export
  `schema.voicePolishTelemetry`.

### Contracts

- The gate is applied inside `polish()`, never in a caller. One-shot, streaming final and
  retained-audio retry all obey it, and a below-gate pass issues no intelligence request at all.
- `short` delivers the raw transcript with `polished: false`; it is not a failure and must not be
  logged as one. `light` requests the `natural` directive regardless of the session strength;
  `full` uses the session strength. A cap never rewrites the saved preference or the frozen session
  strength — `requestedStrength` exists only to make the cap observable.
- The transcript length is not known when `Voice stream tidy-up decision` is logged, so that log keeps
  only `live-delivery` / `caller-disabled` / `not-skipped`; the length decision is recorded by the
  polish pass (`reason: 'too-short'`) and by the telemetry row.
- Telemetry is content-free by construction: sizes, tier, outcome, effective/requested scope and
  latency. Never the transcript, the polished text, the audio path, the active-app identity, the
  provider id or any credential. A test must prove a sentinel transcript cannot appear in a row.
- Telemetry writes are best-effort and cannot change delivery; `clearInsights` deletes rows and
  advances the durable generation, and reads ignore rows from a superseded generation or outside the
  window. Retention matches the insights window (365 days).
- Adding the table is not optional bookkeeping: `AUX_COPY_TABLES`, the legacy DDL block in
  `modules/database/index.ts` and `utils/storage-usage.ts` must all list it, or the table is absent
  on the paths those lists own.

### Validation & Error Matrix

| Condition | Outcome |
|---|---|
| units < 12 | no request; raw delivered; one `skipped-short` row |
| 12 ≤ units < 60, strength deep | `natural` prompt; row records strength `natural`, requested `deep` |
| units ≥ 60 | configured strength; `applied` / `unchanged` recorded |
| provider deadline | raw delivered; `timeout` row with elapsed latency |
| provider error | raw delivered; `failed` row |
| user clears insights | rows deleted; summary returns zero |
| telemetry write fails | logged only; delivery unchanged |

### Tests Required

- Tier boundaries (11/12/59/60), CJK vs non-CJK unit counting (including no-space Thai/Lao/Khmer
  text and combining marks), punctuation not inflating the count.
- No-provider-call assertion for below-gate input on dictation and on retry; `natural` prompt
  assertion for a light-tier transcript with a `deep` session.
- Telemetry: one row per decision, idempotent id, generation/window filtering, delete on clear,
  and the no-content assertion.
- Migration chain applies; `pragma_table_info('voice_polish_telemetry')` exposes the columns.

### Wrong vs Correct

- Wrong: hide the gate behind a settings toggle or a feature flag for tests.
- Correct: constants with measured rationale; tests drive real transcript lengths.
- Wrong: keep the transcript in the row to "analyse the distribution later".
- Correct: sizes and outcomes are the distribution; text is never needed and never stored.

## Voice Input settings and informational device changes

- The Intelligence voice page is named Voice Input / 语音输入. Its existing settings drawer
  owns `voiceInput.enabled`, polish/history choices and the macOS Globe guidance; Assistant
  settings own only the floating entry. Reuse `ensureVoiceInputSetting` and the typed
  `AssistantEvents.voice` status/action APIs. Keep manual System Settings access and refresh
  the reported preference on focus return; never infer a successful preference write.
- Settings rows inside the 560px drawer must grow with wrapped descriptions. A fixed 56px
  height lets the Fn explanation overlap subsequent controls; scope the auto-height treatment
  to VoiceInputSettings rather than changing every business settings row.
- `VoiceAsrStreamEvent` with `type: 'device'` is informational, not terminal. VoicePanel
  keeps `listening`, the waveform, stop controls and transcript accumulation active. A separate
  900ms hint timer clears only the device hint and reveals the latest transcript; it never
  stops/restarts the stream, emits `finished`, or discards recovery audio.
- Clear the hint timer on session start, stop, cancel, end/error, reset and unmount. Old
  session timers cannot clear a newer hint. Real terminal failures retain their existing
  notice and recovery behavior.
- Required verification: device → partial/level → hint expiry leaves one stream alive and
  preserves text; explicit stop still reaches that stream once; stale timer/new-session and
  terminal-error cases remain isolated. Renderer-only visual smoke proves HUD continuity,
  not physical microphone hot-unplug recovery or provider reconnection.
