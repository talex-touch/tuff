# Tuff v2.4.7 Release Notes

> Scope: changes accumulated from the `2.4.6 -> 2.4.7` cycle (starting when `apps/core-app` moved from `2.4.6` to `2.4.7-beta.1`). This cycle includes **600+ non-release mainline commits** across `core-app / nexus / utils / tuffex / plugins`.

## What Changed Since 2.4.6

### 1) Intelligence Agent Runtime Upgrade

- Core and Nexus namespaces are unified under `intelligence:agent:*`.
- `session/stream` moved to a graph-based runtime flow (`plan -> execute -> reflect -> finalize`).
- Prompt Registry (record + binding) is now fully wired with API and admin UI.
- Provider probing and planner timeout/retry policies were hardened.

### 2) Release/Update Pipeline Consolidation

- Desktop release flow is unified on `build-and-release`.
- GitHub Release, Nexus Release, and CLI npm publish pipelines are now linked and automated.
- Update assets now consistently ship with manifest/checksum metadata for better integrity checks.
- Versioned release-notes routing is introduced: `/notes/update_<version>`.

### 3) Nexus Platform and Stability Work

- Multiple OAuth/callback hardening iterations for runtime stability.
- i18n no longer depends on `?lang`; locale orchestration is unified to reduce callback fallback issues.
- Store (formerly market) routes/APIs/admin flows continue to be consolidated.
- Dashboard/Review/Assets/Updates UX and maintainability were improved.

### 4) Core-App and Plugin System Evolution

- Plugin issue sync moved to incremental event updates with full-reset reconciliation fallback.
- Quick Actions, permission checks, and manifest validation paths were strengthened.
- OmniPanel feature hub and plugin-dev management flows were expanded.
- OCR/native integration paths were stabilized for better platform capability support.

### 5) SDK/Transport and Architecture Cleanup

- SDK Hard-Cut continued with more cross-layer calls moved to typed transport.
- Legacy sync risk path continued to be reduced; legacy `syncStore` was removed.
- Flow/DivisionBox permission and trigger consistency saw multiple fixes.

### 6) Design System and UI Consistency

- Ongoing Tuffex migration and behavior stabilization, especially overlay/dialog internals.
- `FlipDialog` was unified across Core and Nexus.
- Multiple UI consistency fixes landed (mask behavior, layering, sizing, close-guard feedback).

## Commit-Level Breakdown

### Scale Snapshot

- Non-release mainline commits: `604`
- Unique touched files: `4422`
- Top hotspots by commit-touch count:
  - `apps/core-app`: `348`
  - `apps/nexus`: `194`
  - `packages/utils`: `161`
  - `packages/tuffex`: `113`
  - `docs/plan-prd`: `82`

### Phase Cadence

- **2025-11 (cycle kickoff)**: Nexus app baseline, multi-provider market groundwork, startup optimization.
- **2025-12 (systemization)**: release APIs/pipeline and Prompt/Intelligence orchestration expanded rapidly.
- **2026-01 (integration)**: agent management and cross-module integration stabilized.
- **2026-02 (closure wave)**: auth/sync/store migration, intelligence graph runtime, and UI consistency converged.

### Representative Commits (Selected)

- **Release / Update pipeline**
  - `bc56d262` (2025-12-13): release management API + composables.
  - `1da67f66` (2025-12-13): end-to-end release publishing and update path wiring.
  - `7d5b479d` (2026-02-10): reusable update tasks + download management hardening.
- **Intelligence / Agent**
  - `b1e01942` (2025-12-18): prompt management introduced.
  - `896666d0` (2025-12-19): intelligence orchestration package + storage adapter.
  - `f86d4596` (2026-01-19): agent management/integration enhancement.
  - `02da84fb` (2026-02-26): switch to graph runtime and unified agent endpoints.
- **Nexus auth and runtime stability**
  - `15823a9f` (2026-02-04): Nexus auth migrated to nuxt-auth.
  - `bf87e09e` (2026-02-10): sign-in callback/OAuth stabilization.
  - `65f47e92` (2026-02-23): OAuth callback fallback hardening.
  - `44c406d2` (2026-02-24): Cloudflare hkdf runtime compatibility fix.
  - `5efaf342` (2026-02-26): locale flow stabilization without `?lang`.
- **Sync / Storage / Security**
  - `5d94e8ed` (2026-02-06): CloudSyncSDK added.
  - `0ffc835d` (2026-02-22): cloud sync module + clipboard sync enhancements.
  - `48ae43ff` (2026-02-26): legacy sync store removed with guard tests.
- **Store migration (from market)**
  - `2b9ce669` (2026-02-26): Nexus routes/APIs migrated to store with data migration.
  - `f636d167` (2026-02-26): utils market domain hard-cut to store.
  - `705256fd` (2026-02-26): core-app plugin market pipeline migrated to store.
- **Core-App / plugin capability**
  - `a818329e` (2026-02-24): OmniPanel feature hub + auto-mount flow.
  - `08c85846` (2026-02-23): cross-layer omni-panel + workspace sync integration.
  - `aa474fc2` (2026-02-25): quick-actions feature id + permission sync fix.
  - `6429e781` (2026-02-25): plugin issues switched to id-based incremental sync.
  - `2fb46fc7` (2026-02-25): native OCR addon loading + smoke test hardening.
- **Early baseline commits**
  - `3df15e30` (2025-11-20): startup prefetch optimization.
  - `3e755571` (2025-11-29): new Nexus app structure introduced.
  - `c7cf4a07` (2025-11-29): typecheck job introduced and script simplification.
  - `80ce220d` (2025-11-30): multi-provider plugin market support.

### Full Appendix

- Full grouped commit list: `notes/update_2.4.7.appendix.md`

## Compatibility Notes

- Legacy `intelligence-lab` routes are retired; use the `intelligence-agent` route family.
- For future releases, maintain notes in `notes/update_<version>.{zh,en}.md` for automatic Nexus sync.
