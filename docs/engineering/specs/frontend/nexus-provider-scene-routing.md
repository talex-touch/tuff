# Nexus Provider Registry and Scene Routing

## Scenario: Unified Provider Configuration and Runtime Routing

### 1. Scope / Trigger

Apply when changing Nexus Provider Registry, provider capabilities, Scene bindings, generic Intelligence invoke/stream, OCR/image translation, Nexus-owned ASR routing, provider credentials, or `/admin/provider-registry`.

The only provider/routing source of truth is:

```text
provider_registry + provider_capabilities
scene_registry + scene_strategy_bindings
provider_secure_store
```

Never add another provider table, registry mirror, provider-sync API, or runtime fallback to `intelligence_providers` / `intelligence_settings`.

### 2. Signatures

```ts
interface ProviderRegistryMetadata {
  adapterKey: string
  models?: string[]
  defaultModel?: string
}

interface SceneStrategyBinding {
  providerId: string
  capability: string
  model?: string
  priority: number
  status: 'enabled' | 'disabled'
}

resolveCapabilitySceneId(capabilityId: string): string
resolveSceneProviderCandidates(event, {
  sceneId,
  capability,
  ownerId,
  providerId?, // internal admin/probe use only
}): Promise<SceneProviderResolution>
```

D1 additive schema contract:

```sql
ALTER TABLE scene_strategy_bindings ADD COLUMN model TEXT;
```

Production legacy removal is operator-controlled only:

```sh
pnpm -C apps/nexus provider:legacy:drop -- --database <name>
NEXUS_LEGACY_PROVIDER_DROP_ACK=DROP_intelligence_providers_and_settings \
  pnpm -C apps/nexus provider:legacy:drop -- --database <name> --execute
```

### 3. Contracts

- Provider writes normalize legacy `metadata.adapter` to `metadata.adapterKey`, then reject unknown adapters and capabilities unsupported by the selected adapter.
- `metadata.defaultModel` must be included in `metadata.models`.
- Binding `model`, when present, must be included in the selected provider model list.
- Generic public invoke/stream accepts capability + payload; client provider/model/endpoint/credential fields never select the upstream.
- Canonical capability scenes use `nexus.intelligence.<registryCapabilityId>` and deterministic `priority ASC` binding order.
- Fallback is sequential. Continue only after a definitive pre-acceptance rejection (for example 400/401/403/404/409/422/429 or local quota rejection). Never replay an accepted, uncertain, cancelled-after-send, or partially streamed request.
- `system` providers require an authenticated caller on public routes; `user` providers require the matching owner; unresolved `workspace` scope fails closed.
- All calls remain credit-gated. Generic invokes use the Intelligence reservation/settlement path; ASR retains its stronger durable request ledger. One call must not enter both billing paths.
- Scene `auditPolicy` owns runtime audit enablement. No global provider strategy/settings table participates in routing.
- Scene list/create/update responses project readiness as `ready | degraded | disabled` plus missing capabilities and invalid binding codes.
- Credential plaintext stays inside `provider_secure_store` resolution and adapter execution.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Provider has capabilities but no adapterKey | 400 before persistence |
| Unknown adapterKey or unsupported capability | 400 before persistence |
| defaultModel absent from models | 400 before persistence |
| Binding model absent from provider models | 400 before persistence |
| Missing provider/capability/adapter binding | Persist/list as degraded; runtime returns capability unavailable |
| User provider requested by another user | Reject candidate before credential read |
| Workspace provider without authoritative workspace identity | Reject candidate |
| Pre-acceptance safe provider rejection | Record stable failure reason; try next binding when fallback enabled |
| 5xx/network/accepted-uncertain/stream-started failure | Stop; never dispatch another provider |
| Missing secure credential | Candidate unavailable or stable auth failure; no metadata fallback |
| Production legacy DROP without backup/readiness/ack | Script exits non-zero without DDL |

### 5. Good / Base / Bad Cases

- Good: Scene `text.chat` binds two aggregation channels with exact models and priorities 10/20. A definitive 429 from the primary selects the fallback under one request/credit identity.
- Base: One enabled system provider serves one capability; dry-run returns `planned`, one selected candidate, and no billing.
- Bad: Client sends `providerId`/`model` and bypasses Scene configuration.
- Bad: Generic retry or fallback runs after the provider returned a 5xx, after cancellation following send, or after a stream delta.
- Bad: Admin shows a scene as enabled/healthy while required capabilities have no valid bindings.
- Bad: App startup executes `DROP TABLE intelligence_providers`.

### 6. Tests Required

- Provider API: adapter/default-model validation, secure credential projection, adapter catalog response.
- Scene API/store: additive model column, round-trip binding model, invalid model rejection, readiness projection.
- Orchestrator: deterministic order, dry-run no credits, safe fallback, uncertain failure no fallback, stream delta no replay, system/user scope.
- Generic invoke/stream: Registry/Scene candidates, credit reserve/settle/release, safe error projection.
- Speech: Scene-selected DashScope provider/model while preserving ASR idempotency and accepted-uncertain behavior.
- Admin UI: real browser shows adapter selector, full capability catalog, binding model selector, and degraded missing-capability reason.
- Cutover guards: API route-tree check, absence search for legacy runtime references, drop-script fail-closed smoke, type checks, scoped lint, and `git diff --check`.

### 7. Wrong vs Correct

#### Wrong

```ts
const providers = await listLegacyProviders(userId)
const selected = providers.sort(byPriority)[0]
const model = request.options.model ?? selected.defaultModel
```

#### Correct

```ts
const resolution = await resolveSceneProviderCandidates(event, {
  sceneId: resolveCapabilitySceneId(capabilityId),
  capability: capabilityId,
  ownerId: userId,
})
const selected = resolution.candidates[0]
const model = selected.model ?? selected.provider.metadata?.defaultModel
```
