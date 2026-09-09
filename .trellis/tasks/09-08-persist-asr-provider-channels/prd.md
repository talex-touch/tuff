# Persist ASR provider channels

## Goal

Configure Bailian and Volcengine speech recognition through the existing Intelligence Channels surface, rather than through `TUFF_VOICE_*` process environment variables. A configured channel must become the sole source for its ASR credentials, protocol settings, capability routing, and runtime adapter selection.

## Confirmed facts

- `packages/tuff-voice` already provides `BailianParaformerVoiceProvider` with duplex PCM streaming and asynchronous uploaded-audio transcription. It requires an API key and workspace ID; optional stream model defaults to `paraformer-realtime-v2` and upload model to `paraformer-v2`.
- `voice-provider-runtime.ts` currently constructs Bailian/Doubao providers directly from `TUFF_VOICE_*` variables. The local environment contains none of those values.
- The Channels UI already persists provider channel type in `metadata.channelType`; both `bailian` and `volcengine` are selectable channel types.
- `ProviderCredentialService` already persists provider credentials in main-owned encrypted local-secret storage under a provider-specific key. Renderer requests carry a credential mutation, not the secret in the provider projection.
- Voice currently routes through its private environment-created registry, rather than the persisted Intelligence provider registry/capability binding.

## Requirements

1. Remove the runtime dependency on all `TUFF_VOICE_*` variables, including provider selection, credentials, endpoint overrides, model overrides, and the environment-only provider registry.
2. Extend persisted Intelligence Channel configuration with a validated, non-secret voice protocol projection:
   - Bailian: workspace ID, optional region, realtime model, upload model, and supported ASR capability selection.
   - Volcengine: its already-supported credential/protocol fields and ASR capability selection.
   - Existing plain provider metadata must never hold credentials.
3. Reuse `ProviderCredentialService` without a second secret store. Channel API keys must be written, read, cleared, deleted, and redacted through the existing main-owned credential transaction and renderer projection.
4. Make the Voice runtime resolve the enabled, credentialed persisted channel selected for `audio.stt` / `audio.transcribe`. It must construct only the corresponding provider adapter from the resolved secure credential and validated channel metadata.
5. Preserve the existing safety boundary: renderer and plugins cannot receive provider credentials; logs, errors, audit data, and persisted ordinary config must not contain them.
6. Retire all obsolete environment variable tests, comments, and documentation. No compatibility alias or fallback to environment configuration remains.
7. The Channels editor must expose only fields required by the selected channel and make a Bailian channel usable without terminal configuration.

## Acceptance Criteria

- [ ] A user can create or edit a Bailian Channel, select its ASR capabilities, enter workspace/model configuration, save its API key, restart the app, and use realtime and uploaded-audio recognition without any `TUFF_VOICE_*` environment variables.
- [ ] The rendered/synced provider projection contains `hasCredential` and safe protocol metadata only; it never contains the API key or secure-store key.
- [ ] A malformed or incomplete Bailian voice configuration is unavailable for ASR and yields a stable, non-secret error before any provider network request.
- [ ] Capability bindings deterministically select the configured voice channel; no enabled but unbound channel is used accidentally.
- [ ] Editing, clearing, or deleting a voice channel updates adapter availability atomically and removes its secure credential on deletion.
- [ ] Existing Doubao/Volcengine voice support is migrated to the same persisted-channel path; no `TUFF_VOICE_*` production code remains.
- [ ] Focused protocol, credential, routing, and UI tests pass, plus CoreApp Node/Web type checks and the sensitive-data inventory verification.

## Out of Scope

- OAuth acquisition or export of provider API keys.
- Adding a third ASR protocol beyond the existing Bailian and Doubao/Volcengine adapters.
- Changing Rust audio capture, VAD, native event handling, or dictation UI interaction semantics.
