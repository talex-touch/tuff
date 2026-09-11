# Voice dictation polish mode

## Goal

Let users choose between immediate raw dictation and a final, intelligently polished dictation result. Immediate mode writes recognised text while speaking; polish mode waits until recording stops, then writes one cleaned result. The approved extension adds three selectable strengths — natural, structured, deep — with deep as the default, allowing assertive editing without changing the user's meaning.

## Confirmed facts

- `VoiceService` is the single main-process owner for capture, ASR, optional polish, active-app delivery, and teardown (`.trellis/spec/main-process/voice-session-contracts.md`).
- The streaming API already exposes `deliveryTiming: 'live' | 'final'`: live delivery types stable transcript deltas and deliberately skips polish; final delivery waits, polishes, and writes once (`apps/core-app/src/main/modules/voice/voice-service.stream-provider.test.ts`).
- `VoicePanel` now snapshots `polishEnabled` through `AssistantRuntimeConfig`; VoiceDock gesture handling no longer owns delivery timing.
- `AppSetting.voiceInput` owns enabled state, language, polish enablement, and optional history persistence; strength belongs in this existing settings boundary.

## Requirements

1. Add a persisted Voice Input polish setting, with localized settings UI and runtime projection.
2. When polish is disabled, every standard VoiceDock/Fn/Ctrl dictation session uses `deliveryTiming: 'live'`: recognised stable text is delivered during recording and no end-of-session polish request is made.
3. When polish is enabled, every standard VoiceDock/Fn/Ctrl dictation session uses `deliveryTiming: 'final'`: nothing is written to the active application until capture ends; the full transcript is then cleaned once before delivery.
4. All strengths remove meaningless fillers and resolve clear self-corrections while preserving genuine enumerations. Ambiguous successive statements must not be collapsed just because their sentence structure repeats.
5. Keep the current immutable session boundary: capture target before delivery, do not deliver empty text, keep raw transcription main-owned, and retain the typed delivery result and insight accounting.
6. Persisted values and invalid/missing-setting migration must be explicit, typed, and fail safe. `polishEnabled` defaults to `true`, preserving existing users’ final/polished behavior.
7. Add `polishStrength: 'natural' | 'structured' | 'deep'`, defaulting missing or malformed values to `deep`. Preserve existing selections, explicit polish disablement, language, and history on normalization and save/reload.
8. Natural fixes speech artifacts with minimal reordering; structured reorganizes related points and uses paragraphs/lists when useful; deep actively rewrites the whole draft for clarity and concision without losing distinct requirements, qualifiers, negations, quantities, chronology, or the user's register.
9. The settings selector offers exactly three localized choices while polish is enabled. Disabling polish hides the selector without erasing the saved strength.
10. Capture start freezes strength for the session and its retry. Changing settings mid-recording affects the next session only. One shared prompt policy owns fidelity; per-strength instructions only vary editing scope. ASR language hints must not force translation during polish.

## Acceptance criteria

- [x] Voice settings expose a localized polish toggle with its current effect described accurately.
- [x] Toggle off causes the next VoiceDock/Fn/Ctrl session to deliver stable text during capture and never invokes the polish capability (focused session tests).
- [x] Toggle on causes the next VoiceDock/Fn/Ctrl session to avoid all delivery during capture, invoke the existing polish route after capture, and deliver its final result once (focused session tests).
- [ ] A final-mode correction transcript is delivered as the last intended request, punctuated and readable; raw transcript remains available to the existing main-owned insight path.
- [x] Existing live-delta acknowledgement, target-validation, cancellation, delivery, and transcript privacy contracts remain intact. The real punctuation-revision replay is repaired and native-input verified in the follow-up below; lexical conflicts fail without replaying already typed text.
- [x] Focused VoiceService, VoicePanel/VoiceDock, assistant-setting, and relevant configuration tests pass, plus CoreApp node/web typechecks.
- [x] A missing or malformed persisted polish setting normalizes to enabled; an explicit disabled value remains disabled after save/reload.
- [x] All three localized strengths can be selected and survive remount/save/reload; new and historical profiles default to deep.
- [x] One-shot, final-stream, and retained-audio retry paths use the selected frozen strength; live mode and cleanup-disabled paths do not gain an end-of-session polish call.
- [x] No transcript or surrounding application text is newly collected, and no prompt sample is represented as real-provider quality evidence.

## Out of scope

- Changing ASR/STT provider routing, credentials, or model bindings.
- AOQ transport, ASR model upgrades, automatic application-context collection, and changes to the existing bounded polish timeout.
- Browser-owned microphone capture, renderer-owned paste/write paths, or a new voice-specific provider catalog.
- The disabled-by-default GlobalDictation one-shot shortcut, which cannot offer live streaming without a separate redesign.
- Editing historical recognition records.

## Verification evidence and limits

- CoreApp node/web typechecks passed; TuffEx renderer prerequisites built successfully. Scoped lint and whitespace checks passed with each package's own configuration.
- Isolated Chromium exercised the real settings SFC and TuffEx select/switch: missing strength displayed Deep, all three choices were selectable, disabling retained Natural, enabling restored Natural, and reload retained Structured. English labels and Deep selection were also checked at 640 CSS pixels without horizontal document overflow.
- Final focused run: 9 suites / 211 tests passed (`artifact://52` in this session). Regression fixtures were repaired without adding prompt-wording or mocked linguistic-quality assertions.
- The initial UI smoke isolated the host storage adapter and made no cloud calls. The subsequent user-authorized real-provider run below supersedes the earlier provider-evidence limit; physical microphone/Fn and packaged-profile acceptance remain untested. The existing 300 ms deadline is unchanged.

### User-authorized real-provider and native-input run

- Used the current source VoiceService, Intelligence config/SDK, CustomProvider, and Bailian ASR adapter in an isolated harness. Read only the dev profile's `aisdk-config`/`app-setting.ini` and the canonical secure-store getter; no persisted settings or credentials were changed. Operational storage/audit/cache/quota were isolated, HTTP used a native-fetch host adapter, and a paced 9.12-second local Tingting PCM fixture replaced hardware microphone capture. Native input was also exercised from Electron 41.10.4 into a separate, task-owned Electron textarea.
- Isolated saved-cloud-route failure: persisted `text.chat` bindings do not reach the enabled DashScope channel. With automatic local Pi fallback deliberately disabled in the harness, actual SDK invocation returned `No enabled providers for text.chat`, no HTTP request was made, and polish returned null. This does not prove the full running app has no route: its automatic Pi availability probe was not exercised. The valid realtime ASR binding is DashScope `paraformer-realtime-v2`.
- Quality-only comparison temporarily bound the existing DashScope `qwen3.8-max-0902` inside the test process, with a separate 25-second observation limit. Three fixed synthetic texts across three strengths produced 8 responses in 5.053–11.233 seconds (median 7.554 seconds); structured editing of the constraints sample hit the 25-second cancellation limit. Responses preserved the short correction/enumeration and kept the script request as prose rather than executing it. This is limited sample evidence, not a general linguistic-quality pass.
- Actual unchanged deadline: deep polish returned null after 302 ms. The underlying chat adapter issued a second HTTP attempt after that return during a four-second observation window. `langchain-openai-compatible-provider.ts:706` invokes the model without passing the caller signal; the isolated sender was stopped to terminate outstanding retry work.
- Final-mode native delivery passed: the receiver was empty 3.5 seconds into capture, then received exactly one whole final raw transcript after capture stopped. Actual textarea content matched the emitted final text, and insight projection reported `polished: false`. Observe the downstream value after the native call: immediate return-time reads can precede DOM input events.
- Live-mode native delivery failed: partial text arrived during capture and no chat HTTP call occurred, but the final ASR added punctuation inside an already committed prefix. Actual receiver text repeated `带上苹果、香蕉和菠萝`. In `voice-live-delivery.ts:94-95`, resetting `delivered` to the common prefix does not undo already typed text, so `advanceTo` appends the suffix twice. The existing focused tests do not cover this real provider revision.
- Evidence: session artifact `local://voice-dictation-real-20260909.json` records synthetic inputs/outputs, timings, downstream input events, delivery calls, and the failure screenshot. No physical microphone, hardware Fn gesture, clipboard fallback, installed-profile migration, source fix, commit, or release was performed in this testing turn.

### Repair follow-up: append-only delivery and cancellation

- `voice-live-delivery.ts` keeps `delivered()` equal to successful native writes. A shared partial/final reconciliation accepts ordered Unicode punctuation revisions without changing committed lexical content or whitespace. Repeated finals do not replay the suffix; true committed lexical conflicts return `none / transcript-revised` and preserve the target. The existing final ASR text remains available independently of the append-only input.
- `langchain-openai-compatible-provider.ts` propagates the host-only caller signal into `chat`, `chatStream`, and the shared vision invocation. No routing, model, credentials, default retry policy, or 300 ms polish-budget change. Direct REST operations remain outside this chat-model boundary.
- Final scoped run: seven suites / 105 tests passed (`artifact://104`), covering live delivery, VoiceService one-shot/stream, real-LangChain cancellation, OpenAI/local providers, and vision result decoding. Main-process TypeScript passed; scoped ESLint and Prettier checks passed. Removed brittle vision assertions that pinned the number of arguments passed to a mocked model.
- Actual installed LangChain/OpenAI runtime with a loopback HTTP server: pre-aborted chat/stream opened zero requests; an in-flight non-stream request closed on caller cancellation and remained at one request through a four-second observation; an SSE stream emitted its first delta, then cancellation rejected pending `next()` and closed its transport without a success terminal event. These tests replace NetworkService with native fetch; they are not a new cloud-provider/network-stack acceptance run.
- Actual native input smoke: current live-delivery source plus Rust `typeText`, called from Electron 41.10.4 into a separate task-owned Electron textarea. The first stable text ended with `带上苹果、香蕉和菠萝`; the revised final added only `，这三样都要。`. Actual receiver text equaled the acknowledged write history, and replaying that final made no additional write. Screenshot and synthetic evidence are in `local://voice-dictation-repair-20260909.json`. The earlier missing internal comma is intentionally not inserted retroactively.
- Verification-harness corrections: activate the exact task-owned receiver after the headless sender has started, await the Rust async result despite the stale declaration in `audio.d.ts`, and inspect the downstream DOM after native completion. No source-level input guard or clipboard policy was relaxed for the smoke.
- Remaining quality gate is unchanged: earlier real cloud outputs required 5.053–11.233 seconds, with one cancellation at 25 seconds. That does not fit the approved 300 ms best-effort budget. Reliable final-mode linguistic editing still needs an explicit route/latency scope decision; no new cloud call, real microphone/Fn session, profile write, commit, or release occurred in this repair turn.

### User-requested settings ownership and naming

- Move the independent voice-input enable control and the conditional macOS Fn/Globe system-action guidance from SettingAssistant into the existing speech-settings drawer of the Intelligence voice page.
- Rename all product-facing Audio/Voice Insights page, navigation, route-title and share/aggregate labels to Voice Input / 语音输入 (aggregate operations remain explicitly statistics-only). Keep internal API keys, data schemas and route paths stable.
- Preserve `voiceInput.enabled`, migration/default normalization, polish/history choices, typed Globe status and keyboard-settings action, and focus-return status refresh. The former Assistant page must no longer render these controls or own keyboard-status requests.
- [x] New page shows the two controls, old page does not; toggling is independent from assistant/ball settings and status refresh/action still work.
- [x] Chinese/English labels and real settings-drawer rendering are verified before the pending grouped commits.

### User-requested nonterminal device notices

- A `VoiceAsrStreamEvent` device notification is informational: it must not end the current capture/ASR stream, clear acknowledged/preview text, remove stop controls or emit finished. Keep the waveform active while a short device-name hint is shown, then reveal the latest ongoing transcript.
- A dedicated hint timer only clears the hint; it is cancelled on start/stop/cancel/end/error/unmount and never controls session lifecycle. Preserve the existing main-owned capture/provider connection rather than restarting it for a display message.
- [x] Device notice, continued levels/partials, explicit stop/cancel and timer cleanup are covered by observable HUD behavior and isolated visual verification. Physical microphone hot-unplug/reconnect is not inferred from this notification-path verification.

### Grouped-commit verification follow-up

- Current-source focused runs: 31 CoreApp main suites / 380 tests, 7 renderer suites / 131 tests and 3 shared transport suites / 55 tests passed. Both main and renderer typechecks passed after aligning the settings fixtures with the existing VoiceInputSetting interface.
- Renderer-only smoke loaded the real IntelligenceVoicePage, SettingSpeechRecognition, SettingAssistant and VoicePanel SFCs with production TuffEx styling, real locales and an isolated typed host adapter. The Voice Input heading and relocated controls were visible in Chinese/English, the manual keyboard-settings action reached the adapter, and Assistant retained only its floating-entry controls.
- The 560px drawer exposed fixed-height row overlap; VoiceInputSettings now scopes auto-height rows and readable wrapped descriptions. Browser geometry confirmed every label remained inside its row, including the Fn explanation.
- Device notification smoke kept one ASR fixture stream alive: device-name hint plus waveform/confirm stayed visible, continued partial text appeared after the 900ms hint, and counters remained starts=1/stops=0/cancels=0/finished=0 until explicit stop changed stops to1. No microphone/provider/system-preference calls were made by this smoke.
