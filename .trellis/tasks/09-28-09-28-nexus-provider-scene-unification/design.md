# Design: Unified Nexus Provider Registry and Scene Routing

## Architecture

```text
CoreApp / Plugin / Docs / Admin / Speech API
        -> capabilityId + payload + request identity
        -> unified scene runtime resolver
             -> scene_registry
             -> ordered scene_strategy_bindings
             -> provider_registry + provider_capabilities
             -> explicit adapterKey + binding model
             -> provider_secure_store credential
        -> capability-specific adapter/service
        -> one credit reservation/settlement lifecycle
        -> normalized output + safe trace/ledger
```

`provider_registry`, `provider_capabilities`, `scene_registry`, `scene_strategy_bindings`, and `provider_secure_store` become the only provider/routing source of truth. A provider is an aggregation upstream channel. A scene determines which channel/model serves each capability and the ordered fallback list. Clients never select upstream implementation details.

## Contract Ownership

### Provider

Provider registry owns:

- identity, display name, scope and enabled state;
- aggregation endpoint;
- explicit `metadata.adapterKey`;
- bounded safe transport metadata;
- declared models and default model;
- `authRef` only, never credential plaintext.

Provider capability rows own the capability declaration and capability-specific safe metadata. The provider write boundary validates adapter registration and model consistency.

### Scene

Scene registry owns:

- required capabilities;
- routing mode (`priority` is the primary supported mode);
- metering, audit and cache policy metadata;
- health projection (`enabled`, `degraded`, `disabled`) and missing-capability reasons.

Each strategy binding owns:

```ts
interface SceneStrategyBinding {
  sceneId: string
  providerId: string
  capability: string
  model?: string
  priority: number
  enabled: boolean
  weight?: number // retained for compatibility, not used by the simple router
  constraints?: Record<string, unknown>
}
```

The binding model is validated against the selected provider's declared models. A blank model means the provider capability/default model resolution chain applies.

### Adapter Catalog

The adapter registry exports a safe catalog used by both server validation and admin UI. Resolution follows:

1. explicit provider `metadata.adapterKey`;
2. no vendor-derived fallback for newly written providers;
3. temporary read compatibility for existing registry rows only while the data migration runs;
4. after migration, every executable provider has an explicit key and implicit inference is removed.

A catalog item declares key, supported capabilities, whether streaming is supported, required auth type, and safe configuration hints. The UI does not maintain a second hand-written adapter list.

## Unified Candidate Resolution

The resolver input is `(event, authenticated subject, scene/capability, optional request context)`. It:

1. resolves the scene for the requested capability;
2. loads bindings ordered by `priority ASC`, then stable binding ID;
3. joins enabled providers and matching provider capability rows;
4. authorizes `system` providers for authenticated users and `user` providers only for their owner;
5. rejects missing credential/model/adapter readiness;
6. returns normalized candidates with provider, capability, binding, model, adapter and credential reference.

Dry-run stops before credential decryption, credit reservation and dispatch. Execution obtains credentials only immediately before adapter execution.

## Scene Mapping

Existing composite scenes remain explicit (`corebox.screenshot.translate`). Generic capability calls use canonical scene IDs derived from the capability, such as `nexus.intelligence.text.chat`, `nexus.intelligence.text.translate`, `nexus.intelligence.vision.ocr`, `nexus.intelligence.audio.stt`, and `nexus.intelligence.audio.transcribe`. The seed/upsert layer creates these canonical scenes without overwriting administrator bindings.

The client contract remains capability-oriented. `/api/v1/intelligence/invoke` and `/stream` translate the capability to its canonical scene unless an internal trusted route explicitly names a composite scene.

## Simple Fallback

Fallback is sequential, not load balancing:

- candidates are deterministic by scene binding priority;
- the next candidate is attempted only for a classified pre-acceptance/retry-safe failure and only before observable stream output;
- accepted, accepted-uncertain, partially streamed, cancelled-after-send, or billable failures terminate the request without another dispatch;
- every attempt uses one request identity and one credit reservation;
- ledger/trace records bounded attempt metadata and the final binding without upstream-native error text.

Capability adapters expose a normalized dispatch outcome classification. Existing specialized speech services retain their stronger accepted/uncertain fencing and therefore may return no-fallback even when another binding exists.

## Credits

All system and user channels are subject to existing authenticated credit admission. Scene execution becomes the single orchestration boundary for generic invoke/stream. Capability-specific services that already have stronger durable reservation records (notably ASR) keep those records, but their provider/model resolution moves to the unified resolver. No route may debit both generic scene billing and a capability-specific billing record for one call.

## Speech Integration

Speech uses the same provider/scene configuration while preserving protocol services:

- `audio.stt`: the Nexus-owned buffered voice route resolves its bound aggregation channel/model through the scene resolver;
- `audio.transcribe`: uploaded/batch routing resolves through the scene resolver before existing idempotent request/credit handling;
- DashScope adapters keep their protocol and media validation code;
- direct realtime transports that do not call Nexus remain CoreApp-owned;
- no independent Nexus provider list, environment fallback, or legacy Intelligence provider read remains.

## Consistency Projection

A shared validator computes:

```ts
interface SceneReadiness {
  status: 'ready' | 'degraded' | 'disabled'
  missingCapabilities: string[]
  invalidBindings: Array<{
    bindingId: string
    code: 'PROVIDER_MISSING' | 'CAPABILITY_MISSING' | 'ADAPTER_MISSING' | 'MODEL_INVALID' | 'CREDENTIAL_MISSING'
  }>
}
```

The store/API invokes it after seed and writes; list/detail routes include the safe projection. It does not expose credentials or raw endpoint details. Runtime revalidates rather than trusting the projection.

## Admin UI

The existing Provider Registry panel remains the owning surface:

- Providers: channel identity, scope, endpoint, adapter selector, models/default model, credential mutation, enabled state.
- Scene routes: scene required capabilities and per-capability ordered provider/model bindings.
- Health and usage remain separate tabs.
- Static provider templates are convenience defaults only; they cannot restrict the capability or adapter catalog.
- Degraded scenes show exact missing/invalid safe reasons.

Legacy Intelligence provider controls and redirect-only configuration shells are removed or redirect to Provider Registry. Intelligence workspace pages that provide chat/audit functionality remain consumers of the unified runtime.

## Legacy Cutover

1. Add new schema fields and resolver while existing registry data remains readable.
2. Migrate registry rows to explicit adapter keys and valid model metadata.
3. Import any unique legacy provider credential/configuration into Registry/Secure Store.
4. Switch all runtime consumers and old compatibility APIs to the unified resolver or remove them.
5. Prove dry-run, real invoke, stream, speech resolution, credits and browser UI.
6. Remove legacy provider code and ship a separate controlled production D1 backup/drop procedure.

`intelligenceStore.ts` is split by domain. Prompts, prompt bindings, audits and IP bans remain. Legacy provider CRUD/key encryption and provider-routing settings are deleted. Scene policies replace `defaultStrategy`; audit/cache behavior needed by consumers moves to scene policy or a focused non-provider runtime policy.

## Rollback

Before production table removal, rollback is code/config rollback plus disabling new scene bindings. After table removal, rollback restores the verified D1 backup and previous application artifact together. Runtime startup never executes destructive DDL.

## Security and Privacy

- Credential plaintext exists only inside server execution and provider-specific adapter calls.
- Safe traces contain stable IDs, capability, adapter key, model identifier where admin-visible, timing, credit counts and stable failure codes.
- Prompts, input media, transcripts, upstream response bodies, credentials, query strings and native errors are forbidden from ledger/audit projections.
- User providers require owner identity; system providers require authenticated admission and credits.
