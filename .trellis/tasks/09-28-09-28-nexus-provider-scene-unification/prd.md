# Unify Nexus Provider Registry and Scene Routing

## Goal

Make `provider_registry` + `provider_capabilities` + `scene_registry` + `scene_strategy_bindings` + `provider_secure_store` the only Nexus AI configuration and runtime routing system. Administrators configure each scene with an upstream aggregation channel, an explicit adapter format, a model, priority, and simple fallback. CoreApp, plugins, docs assistant, admin chat, image translation, and speech recognition consume the same scene-owned routing and credit boundary.

## Confirmed Background

- Generic invoke/stream currently resolves legacy `intelligence_providers` plus user-scoped registry mirrors, while scene execution reads the full provider registry. The two pools can disagree.
- Scene adapters are currently inferred from `vendor:capability`; configured adapter metadata is not authoritative.
- Scene bindings do not carry a model. Models are inferred from provider metadata or request input.
- `providerSceneSeed.ts` can silently create an enabled scene whose required capabilities have no bindings.
- ASR uses dedicated DashScope services and provider-registry capability selection rather than the generic scene orchestrator.
- `intelligenceStore.ts` combines legacy provider persistence with unrelated settings, prompts, audit, and IP-ban stores. Removing the provider table requires preserving or relocating unrelated domains.
- Nexus D1 has no checked-in migration chain. Destructive table removal requires an explicit backup and controlled one-off DDL after the replacement path is proven.

## Product Decisions

1. Provider Registry and Scene are the sole source of truth. No registry-to-legacy mirror, dual write, compatibility alias, or second provider catalog remains.
2. Nexus channels represent aggregation upstreams. Nexus does not implement advanced upstream load balancing. Each scene owns a deterministic ordered primary/fallback list.
3. A scene binding explicitly selects channel, capability, adapter format, model, priority, and enabled state.
4. Fallback is sequential and safe: try the next binding only when the prior attempt definitively failed before billable/observable acceptance. Do not parallel-dispatch or retry an accepted/uncertain request.
5. System-scope channels are available to authenticated users. Calls remain subject to the existing Nexus credit admission and settlement rules.
6. All Nexus-owned AI capabilities, including text, code, OCR, image translation, buffered `audio.stt`, and uploaded `audio.transcribe`, participate in the same scene/provider configuration model. Direct device/provider realtime voice transports remain CoreApp-owned; Nexus provider selection and model/credential ownership apply whenever Nexus owns the speech request.
7. Scene strategy replaces legacy global provider strategy. Scene metadata/policy owns metering, audit, and cache behavior where applicable; legacy `intelligence_settings` must have no provider-routing authority.
8. Legacy `intelligence_providers`, its encrypted key column, mirror bridge, migration endpoint, provider CRUD/test/probe/sync routes, and runtime consumers are removed after data migration and verification.

## Requirements

### R1 — Explicit provider configuration

- Provider metadata must contain an explicit registered `adapterKey`.
- Provider configuration must reject an unknown adapter key.
- Provider `defaultModel` must be absent or included in its declared `models`.
- Credentials remain exclusively in `provider_secure_store` behind `authRef`; no API response, metadata, log, audit, or UI state may expose plaintext.

### R2 — Scene-owned route and fallback

- Every executable scene declares required capabilities and ordered bindings.
- Each binding carries an optional exact model and must reject a model not declared by its provider.
- Candidate resolution enforces `system` access for authenticated users and `user` access only for the owner.
- `priority` is the default and only required routing strategy for this change. Existing advanced strategy modes may remain for compatibility but must not be required by the admin workflow.
- Fallback must retain one request/credit identity and must not duplicate a provider call after accepted or uncertain dispatch.

### R3 — Unified runtime entry

- `/api/v1/intelligence/invoke` and `/api/v1/intelligence/stream` resolve the requested capability through the Scene/Registry runtime resolver.
- Existing consumers continue sending capability IDs; they do not select a provider, adapter, model, endpoint, credential, or price.
- Admin chat, docs assistant, Intelligence Lab, CoreApp Nexus provider, plugin Intelligence host, and image-translation routes use the unified resolver.
- Runtime errors preserve stable Nexus capability/provider/credit semantics and never reveal upstream-native sensitive text.

### R4 — Unified speech routing

- DashScope buffered `audio.stt` and uploaded `audio.transcribe` select provider/model/credential through Scene + Registry.
- Existing media validation, idempotency, uncertain-dispatch fencing, transcript privacy, and credit settlement remain authoritative.
- Direct realtime voice transports that never enter Nexus remain outside this server routing cutover.

### R5 — Scene consistency and observability

- After every seed or scene write, the store verifies that every required capability has at least one enabled, authorized-capable binding.
- An incomplete scene is persisted or projected as `degraded`, with explicit missing-capability reasons; it must never appear healthy while guaranteed to return 409.
- Dry-run exposes candidate and fallback order without dispatching or charging.
- Usage, latency, stable error, fallback attempt, and final selected binding are recorded without prompts, media, transcripts, credentials, endpoints, or full model responses.

### R6 — Admin consolidation

- Provider configuration exposes channel name, aggregation endpoint, adapter format, models, default model, credential state, scope, and enabled state.
- Scene configuration exposes required capabilities and, per capability, channel, model, priority, enabled state, and fallback order.
- Adapter options come from the server adapter catalog, not the static provider-template capability subset.
- Model options come from the selected provider's declared models.
- The UI visibly marks degraded scenes and explains missing/invalid bindings.
- Legacy Intelligence provider CRUD/configuration controls are removed; redirects or shell pages that only expose the retired system are retired or redirected to Provider Registry.

### R7 — Safe legacy retirement

- Canonicalize usable Registry configuration before deleting old reads. Legacy ciphertext is never a runtime fallback; the destructive cutover blocks until every enabled credentialed Registry channel has a secure-store credential, which the operator may re-enter through the unified admin surface.
- Preserve prompts, prompt bindings, audits, IP bans, runtime sessions/traces, health, usage ledger, and credit records.
- Remove the legacy provider schema and routes only after focused runtime and browser verification proves Registry/Scene operation.
- Provide a controlled D1 backup/drop procedure; production execution is a separate destructive release step and is not implicit in local code changes.

## Acceptance Criteria

- [x] Admin can configure an aggregation channel with an explicit adapter, models, default model, scope, and protected credential; invalid adapter/model combinations are rejected before save.
- [x] Admin can configure a scene capability with a provider and model plus ordered fallback, and dry-run shows the exact candidate order.
- [x] An authenticated user can invoke a system-scope channel and receives normal credit reservation/settlement.
- [x] `text.chat`, `text.translate`, `vision.ocr`, image-translation composition, and Nexus-owned speech resolve through the same Scene/Registry source of truth.
- [x] A safe pre-acceptance failure can select the next configured binding; an accepted/uncertain attempt never triggers another upstream call.
- [x] Incomplete scenes are shown as degraded with exact missing capabilities and cannot masquerade as healthy.
- [x] No production runtime code reads or writes `intelligence_providers`, calls `intelligenceProviderRegistryBridge`, or exposes its provider CRUD/migration/sync endpoints.
- [x] Non-provider Intelligence data (prompts, audits, IP bans, runtime sessions/traces) remains available.
- [x] Focused Nexus type checks and relevant tests pass; real local admin UI, authenticated dry-run, and a controlled real invoke prove the new behavior.

## Out of Scope

- Implementing weighted, random, cost-optimized, latency-optimized, or concurrent load balancing inside Nexus.
- Managing load balance within an aggregation upstream.
- Changing public credit prices, checkout, subscriptions, or representing credits as money.
- Dropping production D1 tables during ordinary application startup.
- Exposing provider credentials, endpoints, models, or routing decisions to ordinary clients beyond safe admin/audit projections.
