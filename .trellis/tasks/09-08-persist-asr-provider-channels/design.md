# Design: Persisted ASR provider channels

## Decision

ASR becomes a specialization of the existing Intelligence Channel entity. A channel’s ordinary provider record keeps its ID, channel type, non-secret voice options, enabled state, capability declarations, and capability binding. Its API key remains exclusively in the existing `ProviderCredentialService` secure-store entry keyed by channel ID.

No `TUFF_VOICE_*` configuration, process-global voice registry, or environment fallback remains.

## Data flow

```text
Channels editor
  -> typed provider save request { safe provider projection, credential mutation }
  -> ProviderCredentialService
       -> encrypted local-secret: provider-credential:<channelId>
       -> redacted persisted Intelligence provider document
  -> capability binding for audio.stt / audio.transcribe
  -> VoiceProviderResolver (main only)
       -> configured provider + secure credential + validated metadata
       -> BailianParaformerVoiceProvider | DoubaoVoiceProvider
  -> VoiceService stream/upload path
```

## Persisted channel metadata

Use a single namespaced `metadata.voice` record, normalized at the main-owned provider configuration boundary. It contains only bounded, non-secret fields.

```ts
interface BailianVoiceChannelOptions {
  workspaceId: string
  region?: string // default cn-beijing
  realtimeModel?: string // default paraformer-realtime-v2
  uploadModel?: string // default paraformer-v2
}

interface VolcengineVoiceChannelOptions {
  // Existing protocol selectors/endpoint identifiers only; no API key,
  // app key, access key, token, authorization, or credential-like field.
}
```

`metadata.channelType` remains the discriminator. A Bailian channel must have `audio.stt` for stream use and/or `audio.transcribe` for upload use, a secure credential, and a valid `metadata.voice.workspaceId`. A Volcengine channel follows its existing protocol requirements.

The channel editor displays voice settings only for relevant channel types and declares the audio capabilities explicitly. It never displays or serializes a saved credential; the existing password field and `hasCredential` projection are retained.


## Information architecture

- **Channels** own API credentials and provider-safe voice protocol metadata.
- **Capabilities** own the `audio.stt` and `audio.transcribe` bindings, selected model, enablement, and priority. They are the only routing authority.
- **Prompts** may later own post-transcription cleanup, but never Provider selection or transport metadata.
- **Agents** consume capabilities and never own speech routing.
- **Voice settings** retain device/gesture behavior plus live microphone and local-file test controls; they do not duplicate channel, protocol, model, or identifier configuration.

Prompts and Agents are Beta-only navigation entries, visible only in Developer Mode; their routes remain registered for existing deep links.
## Resolution and lifecycle

1. Resolve the capability binding selected for the requested mode (`audio.stt` for stream, `audio.transcribe` for upload).
2. Require exactly the bound enabled provider, not an unbound provider chosen by priority.
3. Read the credential from `resolveProviderCredential()` in main process memory.
4. Validate channel type and its safe voice metadata once in `VoiceProviderResolver`.
5. Construct the corresponding adapter with the secure credential only in memory. The resolver returns a stable unavailable/configuration error without native error detail for missing credentials, bad workspace IDs, unsupported capability/channel combinations, or unknown selected providers.
6. Cache only immutable safe configuration or adapter instances that are invalidated whenever provider configuration changes. Never cache credentials beyond `ProviderCredentialService`’s existing in-memory map.
7. Provider save/clear/delete causes the resolver’s cache to be invalidated after the secure-store/config transaction succeeds. Failed mutations retain the previously usable adapter/configuration.

## Compatibility and cutover

This is a clean cutover. Environment configuration is not migrated because it is ephemeral and cannot prove ownership or safe persistence. Existing users must save a channel credential and voice settings in the Channels UI. The app does not silently copy shell values into persisted configuration.

Existing `BailianParaformerVoiceProvider` and `DoubaoVoiceProvider` protocol code remains the transport implementation; only their runtime construction and selection move. Rust audio capture, `VoiceService` session semantics, and renderer/plugin credential boundaries stay unchanged.

## Verification matrix

- DTO: reject credential-like keys nested in `metadata.voice`; permit only valid bounded safe configuration.
- Credential lifecycle: set/preserve/clear/delete stays encrypted and renderer projections remain redacted.
- Resolver: capability binding, invalid/incomplete Bailian configuration, channel type mismatch, no credential, cache invalidation, and no environment fallback.
- Protocol: existing Bailian/Doubao stream and upload fixtures remain valid through resolver-created adapters.
- UI: channel type selects visible relevant voice fields; save/reload shows safe settings and `hasCredential` only.
- Runtime: configured Bailian channel completes a real PCM dictation and upload transcription with `TUFF_VOICE_*` absent.
