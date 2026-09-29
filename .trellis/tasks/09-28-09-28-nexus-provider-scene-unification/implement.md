# Implementation Plan: Unified Nexus Provider Registry and Scene Routing

## Order

### 1. Baseline and contracts

- [x] Re-read the current registry, scene, adapter, orchestrator, invoke/stream, ASR and admin component implementations in complete sections.
- [x] Map every legacy provider/store/bridge caller and every scene/provider DTO consumer.
- [x] Define shared adapter catalog, binding-model and scene-readiness DTOs at their existing owners.
- [x] Capture focused baseline commands and existing failures before changing source.

### 2. Provider and scene schema

- [x] Add explicit adapter-key normalization/validation to provider create/update paths.
- [x] Validate `defaultModel` against declared `models`.
- [x] Add additive `model` storage and projection to `scene_strategy_bindings`.
- [x] Validate binding model/provider capability/adapter combinations at writes.
- [x] Add shared scene readiness computation and expose safe degraded reasons.
- [x] Make seed/upsert preserve administrator bindings and mark incomplete scenes degraded rather than silently healthy.

### 3. Unified runtime resolver

- [x] Build one authorized Registry + Scene candidate resolver for generic and specialized services.
- [x] Support system channels for authenticated users and user channels only for their owner.
- [x] Add canonical capability scenes and deterministic priority ordering.
- [x] Add normalized pre-acceptance failure classification and sequential fallback.
- [x] Ensure streaming stops fallback after first output or accepted/uncertain dispatch.
- [x] Route generic invoke and stream through the resolver without accepting client-selected provider/model/endpoint.
- [x] Consolidate generic credit reservation/settlement around the unified execution path.

### 4. Speech and composed capabilities

- [x] Point Nexus-owned DashScope buffered/uploaded ASR provider/model selection at the unified resolver.
- [x] Seed canonical `audio.stt` / `audio.transcribe` scenes without claiming ownership of direct CoreApp realtime transports.
- [x] Keep unsupported TTS/direct realtime adapter formats out of the Nexus adapter catalog.
- [x] Keep ASR media bounds, idempotency, accepted-uncertain fencing, transcript privacy and durable credit records unchanged.
- [x] Repair image-translation scene readiness and preserve `vision.ocr -> text.translate -> overlay.render` composition.

### 5. Admin consolidation

- [x] Serve the adapter catalog from the server/admin API.
- [x] Add adapter selector and model consistency feedback to provider editing.
- [x] Replace capability-only route editing with scene capability -> provider -> model -> priority/fallback editing.
- [x] Show scene readiness/degraded reasons in the real admin surface.
- [x] Remove legacy Intelligence provider configuration controls and redirect obsolete configuration shells to Provider Registry where appropriate.

### 6. Legacy cutover

- [x] Canonicalize existing Registry rows (adapter key, model default, capability IDs, legacy metadata) and fail closed when an enabled channel lacks secure credentials; runtime never reads the legacy provider table.
- [x] Repoint admin chat, docs assistant, Intelligence Lab and all compatibility endpoints that still consumed the legacy bridge.
- [x] Remove `intelligenceProviderRegistryBridge` and legacy provider CRUD/key encryption/migration/sync/probe/model routes.
- [x] Split `intelligenceStore.ts` so prompts, audits and IP bans remain without `intelligence_providers`.
- [x] Remove provider-routing authority from `intelligence_settings`; move audit policy to Scene runtime policy.
- [x] Add a separate guarded D1 backup/drop command path; do not execute destructive DDL during ordinary startup or local development.

### 7. Verification

- [x] Run focused server/provider/scene/invoke/ASR tests already present in the repository and update broken contract assertions.
- [x] Run Nexus typecheck and the smallest relevant lint/format checks.
- [x] Run an authenticated local scene dry-run showing candidates and ordered model fallback.
- [x] Run a real local generic invoke against a controlled aggregation upstream with credit settlement; cover stream fallback/no-replay through focused runtime tests.
- [x] Run speech resolution tests without exposing or duplicating credentials.
- [x] Start the real Nexus admin surface and verify provider adapter/model editing, scene fallback editing and degraded-state rendering in Ego Browser.
- [x] Search for remaining production references to `intelligence_providers` and `intelligenceProviderRegistryBridge`; only explicit historical/controlled-drop artifacts may remain.
- [x] Run `git diff --check` and audit every PRD acceptance criterion against current code/evidence.

## Focused Validation Commands

Commands are refined after reading package scripts; expected categories:

```sh
corepack pnpm -C apps/nexus typecheck
corepack pnpm -C apps/nexus test -- <focused provider/scene/invoke/asr files>
corepack pnpm -C apps/nexus lint -- <changed paths>
git diff --check
```

Runtime proof:

```text
POST /api/v1/scenes/<scene>/run { dryRun: true, input: ... }
POST /api/v1/intelligence/invoke { capabilityId: ..., input: ... }
POST /api/v1/intelligence/stream { capabilityId: ..., input: ... }
```

## Risk and Rollback Gates

- Do not delete legacy reads until imported registry credentials and bindings are proven.
- Do not fallback after accepted/uncertain provider dispatch.
- Do not charge both generic scene billing and a specialized speech ledger.
- Do not remove prompt/audit/IP-ban/runtime stores with the provider table.
- Do not run production `DROP TABLE` without a verified D1 backup and an exact artifact rollback pair.
- A failing credential import, model validation, readiness check or credit reconciliation blocks destructive cutover but not additive code cleanup that remains safely reversible.
