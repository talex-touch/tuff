# Implementation plan: Persisted ASR provider channels

## 1. Define channel voice configuration contract

- Add one main-owned normalizer for `metadata.channelType` plus `metadata.voice` and reuse it for renderer save DTO validation and runtime resolution.
- Permit bounded, explicit non-secret Bailian/Volcengine fields only. Reject credentials, Authorization-like fields, unknown nested objects, invalid workspace IDs, endpoint query-string credentials, and unsupported capability/channel combinations before persistence.
- Extend existing typed provider projections without introducing a second channel-config or secret DTO.
- Add tests for accepted Bailian safe metadata and every rejected secret/invalid shape.

## 2. Build main-owned voice provider resolver

- Replace `voice-provider-runtime.ts` environment reads and registry creation with a resolver over the persisted Intelligence provider configuration, explicit audio capability bindings, and `ProviderCredentialService` memory-only credential resolution.
- Map `bailian` to `BailianParaformerVoiceProvider` and `volcengine` to `DoubaoVoiceProvider`; pass only validated safe metadata plus secure credentials to adapter constructors.
- Expose exact `stream` and `upload` resolution, configuration errors, and cache invalidation. Wire invalidation to successful provider save/clear/delete.
- Remove all `TUFF_VOICE_*` production code, tests, docs, and any generic ASR environment fallback.
- Add resolver tests for selected bindings, unavailable/malformed channels, secret absence, update/clear/delete invalidation, and environment independence.

## 3. Connect VoiceService to capability-selected channels

- Route stream dictation via the `audio.stt` binding and uploaded transcription via the `audio.transcribe` binding.
- Preserve existing voice cancellation, stop/finalization, audit, and retry constraints; do not fall back to an unbound channel after audio has started.
- Retain the legacy non-provider capture fallback only where it is an independently configured non-channel feature; it must not read `TUFF_VOICE_*`.
- Add focused VoiceService routing coverage for both modes and stable unavailable/error projections.

## 4. Finish Channels editor

- Extend the existing channel basic/configuration editor so Bailian and Volcengine reveal their relevant voice settings and selectable audio capabilities.
- Keep the existing `ProviderCredentialService` API key field and secure save flow; do not render stored values or make a second key field.
- Add localized labels/help text/errors for workspace ID, region, realtime/upload models, ASR capabilities, and incomplete configuration.
- Update component tests to prove a Bailian channel sends safe metadata plus a credential mutation and that reloaded data is redacted.

## 5. Verify and clean up

- Run focused provider DTO, credential-service, resolver, VoiceService, and Channels UI Vitest suites.
- Run `pnpm -C apps/core-app run typecheck`, scoped ESLint, `pnpm privacy:inventory:verify`, and `git diff --check`.
- Start the Electron app with no `TUFF_VOICE_*` variables, configure a Bailian channel through Channels, and verify realtime dictation plus uploaded transcription against the provider.
- Review source, localized text, documentation, tests, and output for every retired environment variable and raw credential exposure; remove obsolete artifacts.

## Rollback

A failed save leaves the prior credential/config pair intact through the existing credential-service rollback. The implementation does not retain an environment fallback; operational rollback is reverting the application version, not reintroducing two configuration authorities.
