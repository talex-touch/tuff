# Nexus Intelligence Provider Table Retirement Plan

> Date: 2026-05-16
> Scope: Nexus `intelligence_providers` retirement toward Provider Registry / Scene runtime.

## Current State

- Legacy source table: `apps/nexus/server/utils/intelligenceStore.ts` still creates and reads `intelligence_providers`.
- Registry bridge: `apps/nexus/server/utils/intelligenceProviderRegistryBridge.ts` already mirrors legacy providers into Provider Registry with normalized `chat.completion` / `text.summarize` / `vision.ocr` capabilities.
- Migration API: `POST /api/dashboard/intelligence/providers/migrate` already supports dry-run and execute modes.
- Migration readiness: the API result includes `readyForRegistryPrimaryReads` and `blockers` so release evidence can distinguish dry-run planning from an executed migration that is safe to promote.
- Read bridge: dashboard provider list and user sync already use `listIntelligenceProvidersWithRegistryMirrors(...)`.
- Observability: Scene runtime writes `provider_usage_ledger`; provider checks write `provider_health_checks`.

## Retirement Goal

Move AI provider runtime and admin read paths to Provider Registry as the primary source, while keeping `intelligence_providers` as a rollback source until registry-only reads, health checks, usage ledger, and credential lookup have production evidence.

## Phase 0 - Baseline Inventory

- Run migration dry-run from Dashboard Admin or API and export the result.
- Record counts:
  - legacy provider count
  - registry mirror count
  - providers with missing API key decrypt
  - providers without registry mirror
- Confirm `provider_secure_store` has `authRef` entries for migrated API-key providers.

Acceptance:

- Dry-run result has `failed=0`, or every failure has an owner and reason.
- No API key is present in Provider Registry metadata.

## Phase 1 - Execute Mirror Migration

- Execute `POST /api/dashboard/intelligence/providers/migrate` with `dryRun=false`.
- Keep legacy writes enabled during this phase.
- Do not delete `intelligence_providers`.

Acceptance:

- Every enabled legacy provider has a Provider Registry mirror.
- Registry mirror status matches legacy enabled state.
- Registry capabilities include normalized `chat.completion` for legacy `text.chat`.
- Provider check for at least one AI mirror writes `provider_health_checks`.

Rollback:

- Keep dashboard/runtime reads using the bridge.
- Delete only the registry mirror via the existing mirror delete helper if a single provider migration is bad.
- Do not delete legacy rows.

## Phase 2 - Registry-Primary Reads

- Change dashboards and runtime candidates to prefer registry mirrors when both legacy and registry entries exist.
- Keep legacy fallback only for providers missing registry mirrors.
- Expose `providerRegistryId`, `authRef`, health status, and latest usage ledger ref in admin diagnostics.

Acceptance:

- `/api/dashboard/intelligence/providers` returns registry metadata for mirrored providers.
- `/api/dashboard/intelligence/providers/sync` still exports the same public provider shape to CoreApp.
- `/api/v1/intelligence/invoke` records `provider_usage_ledger` with `providerUsageLedgerIds` in metadata.
- Health / Usage views can locate the same provider by registry id and legacy provider id.

Rollback:

- Switch bridge merge precedence back to legacy-first.
- Keep `getIntelligenceProviderApiKeyWithRegistryFallback(...)` fallback path intact.

## Phase 3 - Legacy Write Freeze

- Stop creating new rows in `intelligence_providers`.
- New AI providers must be created in Provider Registry and projected into the legacy sync shape only when needed.
- Keep legacy table read-only for rollback and historical audit.

Acceptance:

- Dashboard create/update/delete writes Provider Registry only.
- CoreApp sync still works from registry-only mirrors.
- Tests cover registry-only provider sync, API key lookup from secure store, and disabled provider state.

Rollback:

- Re-enable legacy writes behind a temporary admin-only flag.
- Use Provider Registry metadata `intelligenceProviderId` to recreate legacy rows only if required.

## Phase 4 - Legacy Table Retirement

- Remove runtime dependency on `intelligence_providers`.
- Keep historical audit tables and prompt bindings separate unless explicitly migrated.
- Remove or archive legacy table creation only after production evidence shows no reads for a full release window.

Acceptance:

- No non-test runtime path imports `listProviders(...)` except migration/rollback tooling.
- Provider Registry health and usage ledgers cover AI invoke, model probe, and OCR-capable mirrors.
- Release evidence includes registry-only AI provider E2E.

## Focused Verification

- `pnpm -C "apps/nexus" exec vitest run "server/utils/intelligenceProviderRegistryBridge.test.ts"`
- `pnpm -C "apps/nexus" exec vitest run "test/api/dashboard/provider-registry/usage.api.test.ts" "test/api/dashboard/provider-registry/health.api.test.ts"`
- `pnpm -C "apps/nexus" run typecheck`

## Non-Goals

- Do not add new providers before migration evidence is clean.
- Do not move secrets into metadata, logs, JSON export, or client payloads.
- Do not delete `intelligence_providers` until registry-primary reads and rollback have production evidence.
