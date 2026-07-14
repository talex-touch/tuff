# Implement CatalogService MVP

## Goal

Land R8-F: one host-owned, fail-closed CatalogService that keeps the built-in Domain Lexicon available offline, verifies a signed whole-pack replacement, imports it atomically into the existing CoreApp SQLite database, explicitly activates/rolls back versions, and supplies the current official registry to R8-E plugin facades.

The detailed EARS contract is `.spec-workflow/specs/catalog-service-mvp/requirements.md`.

## Requirements

- Add shared schema-versioned manifest and Domain Lexicon pack contracts with deterministic signing bytes, strict unknown-input normalization, `zh-CN` / `en-US` coverage, exact-byte SHA-256 binding, SDK compatibility, and bounded whole-pack replacement.
- Pin the existing packaged RSA trust root; manifests/endpoints cannot supply an authoritative key. CoreApp verifies the normalized manifest signature before import and verifies payload hash before parsing.
- Seed one deterministic built-in Domain Lexicon pack into SQLite idempotently. If SQLite is unavailable, retain the immutable in-memory baseline and expose a degraded diagnostic rather than breaking startup.
- Import verified pack metadata and normalized entries through the existing DB write scheduler and one failure-atomic transaction. Same ID/version/hash is idempotent; same ID/version with a different hash is rejected.
- Keep import separate from explicit activation. Activation/rollback atomically update active/previous pointers, rebuild the cached immutable registry from SQLite, and never swap the live registry before persistence succeeds.
- Add an official Nexus remote adapter using `NetworkService`, the runtime Nexus origin, and deterministic content-addressed routes. Startup does not auto-fetch or auto-activate.
- Change the scoped plugin lexicon registry to read the current official registry through a provider, preserving all plugin-local overlays and cross-plugin isolation across catalog activation.
- Expose low-sensitive status: availability, active/previous identity/version/hash/source, signature status, update time, rollback reason, and latest stable error code.

## Scope Boundaries

- First slice accepts only `domain-lexicon`, schema version 1, whole-pack replacement.
- No catalog publishing/admin API, D1/R2 provisioning, delta patch, automatic polling, Settings UI, private sync payload, plugin overlay persistence, currency/timezone expansion, or R8-G CI quality gates.
- JSON bytes are verified import input only; SQLite rows are the runtime source after import.
- Existing unit conversion behavior and exact `KB` / `Kb` semantics remain unchanged.

## Acceptance Criteria

- [ ] First initialization seeds and activates the built-in pack; repeated initialization preserves active/previous state and works offline.
- [ ] Manifest, signature, hash, schema, SDK, locale coverage, byte/entry bounds, and Domain Lexicon entry failures produce stable fail-closed errors before mutation.
- [ ] Import is serialized, transactional, idempotent for identical bytes, and rejects ID/version hash conflicts without partial rows.
- [ ] Activation and rollback are transactional, failure-atomic, and rebuild the runtime registry only after committed state changes.
- [ ] Nexus manifest/download requests use NetworkService and content-addressed paths; no update, invalid response, and download failure leave SQLite and active registry unchanged.
- [ ] Plugin SDK official resolve/search/collision checks follow the active registry dynamically while existing plugin overlays remain intact and isolated.
- [ ] Diagnostics report the required low-sensitive state and degraded baseline fallback.
- [ ] Focused shared contract, SQLite lifecycle, remote flow, plugin integration, lint, and CoreApp node/web typechecks pass.
- [ ] R8 PRD, execution plan, quality baseline, changelog, task artifacts, and developer documentation state the exact completed/open boundary.

## Risk / Approval Gate

This task introduces new SQLite catalog tables at CoreApp startup. Repository policy requires explicit approval before implementing that schema change; approval of the specification requirements is treated as approval of the listed tables and transactional lifecycle, but not as approval to touch production data or deploy Nexus infrastructure.
