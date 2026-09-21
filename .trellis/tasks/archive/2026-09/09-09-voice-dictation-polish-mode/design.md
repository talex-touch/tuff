# Design: Voice dictation polish mode

## Decision

Add `voiceInput.polishEnabled` as the single persisted policy deciding VoiceDock/Fn/Ctrl delivery timing. It defaults to `true`. When it is true, the main-owned VoiceService receives final timing and performs the existing final polish-and-deliver path. When false, it receives live timing, commits only acknowledged ASR prefixes during capture, and does not call polish.

The approved extension stores `voiceInput.polishStrength` beside the toggle. The shared settings module owns `VoicePolishStrength`, the ordered three-choice list, the deep default, and runtime normalization. Assistant runtime config and the existing Voice SDK payloads carry this typed value; VoiceService snapshots it at capture start (using the saved preference for callers that omit it) and retains it for retry.

## Data flow

```text
SettingSpeechRecognition toggle
  -> AppSetting.voiceInput.polishEnabled
  -> ensureVoiceInputSetting() normalization and persisted runtime snapshot
  -> AssistantRuntimeConfig.polishEnabled
  -> VoicePanel starts Voice SDK stream with final | live timing
  -> VoiceService streamViaProvider
      live: stable-prefix active-app delivery, no polish
      final: capture completion -> existing polish() -> one active-app delivery
```

`VoiceDock` remains responsible only for gesture lifecycle and panel visibility. It must stop selecting a transcript policy from hold versus toggle gestures; the normalized runtime setting is the policy authority.

## Contracts and boundaries

- `AppSetting.voiceInput.polishEnabled` is boolean. Missing and malformed values normalize to `true`; explicit `false` is retained.
- The renderer gets the flag only through the existing Assistant runtime configuration transport. It cannot route providers, invoke polishing, or write to the active app itself.
- VoicePanel maps the flag directly to `VoiceDeliveryTiming`. A session snapshots the chosen timing at start; changing the setting affects subsequent sessions only.
- `VoiceService` remains the sole capture, ASR, polish, target validation, delivery, cancellation, and insight owner.
- The existing `polished` result/insight field remains true only when final polishing completed. A polish timeout/failure follows the existing raw-final fallback, never silently changes to live delivery.
- Extend the established polish prompt with an explicit successive-correction rule: when later speech supersedes the same request, retain the final intended value rather than accumulate obsolete alternatives. Preserve genuinely enumerated items when the speaker expresses them as a list.
- Replace the fixed polish prompt with a shared fidelity policy plus three precomposed strength directives. Preserve language/mixed-language content rather than treating the ASR language hint as a translation command. Do not add a parallel prompt routing system.
- Keep the existing 300 ms best-effort deadline unchanged in this scoped feature. Test execution policy separately from real-provider quality; no latency improvement or editing quality is claimed without a live run.
- Reuse the settings row/select primitives; show a localized description for the selected strength. Hide the selector when polish is off, preserving its saved value.
- Repair follow-up: live acknowledgements only grow after successful native writes. Punctuation-only revisions are aligned left-to-right for both partial and final hypotheses; no backward bookkeeping, suffix-search dedupe, backspace, or clipboard fallback. A committed lexical conflict reports `none / transcript-revised` and leaves the already typed text unchanged.
- Repair follow-up: existing host-only cancellation reaches every shared LangChain chat-model call (`chat`, `chatStream`, `invokeVisionImage`). Do not disable healthy client retries to conceal a dropped AbortSignal. The 300 ms budget and persisted route bindings remain unchanged.

## Compatibility and rollback

- Normalizing absent data to `true` preserves historical behavior for every existing profile.
- Removing or reverting the UI does not corrupt the setting; pre-change runtime treats the extra field as inert.
- No provider metadata, secret storage, native capture, or typed transport domain expands.

## Exclusions

The GlobalDictation one-shot shortcut remains unchanged: it has no live stream callback path and is disabled by default. Adding live incremental output there would require a separately designed interaction surface.
