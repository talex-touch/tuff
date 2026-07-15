# Search and System Architecture Remediation Program

## Goal

Turn the completed search and system architecture audit into an approved,
independently verifiable remediation program. The program must first contain the
plugin-window privilege boundary, then restore request isolation and ordering in
search, establish one search-index write owner, fail closed while storage and
onboarding state are unknown, and finally consolidate provider lifecycle and
control-plane ownership.

This task is the parent planning and integration task. Product changes must be
implemented in child tasks after review; the parent is not a broad refactor
work item.

## Background

- The evidence-backed audit is recorded in
  `research/architecture-audit.md`. It verified one P0 security boundary, four
  P1 correctness/privacy/ownership defects, and several P2 lifecycle and
  composition risks.
- The repository is a pnpm monorepo. The affected runtime is primarily the
  Electron main/renderer code in `apps/core-app` and shared transport, plugin,
  and search contracts in `packages/utils`.
- The target abstractions already exist in partial form: typed transport and
  streams, plugin security profiles, `IndexingRuntime`, provider descriptors,
  source diagnostics, and module lifecycle hooks. The remediation should make
  those abstractions authoritative rather than create parallel replacements.
- The working tree contains extensive pre-existing changes. Planning and any
  later child implementation must preserve unrelated work.

## Requirements

### R0 - Contain the plugin window privilege boundary

Treat this as P0 and release-blocking.

- A compatibility plugin window must not load remote content with Node enabled.
- `window:new`, `window:visible`, and `window:property` must be mapped to and
  enforced by the declared plugin permission system.
- Reflective invocation of arbitrary `BrowserWindow` and `WebContents` members
  must be replaced by an allowlisted command contract.
- Full caller-controlled `BrowserWindowConstructorOptions` must be replaced by a
  validated plugin-window option allowlist; callers cannot inject preload or
  unreviewed Electron behavior.
- Eligible plugins must actually receive the hardened profile; compatibility
  mode must be an explicit, observable exception.
- Decision D1 (approved 2026-07-09): make a hard safety cut. Compatibility
  windows reject remote URLs, and non-allowlisted window commands fail closed.
- Current evidence:
  `apps/core-app/src/main/modules/plugin/runtime/plugin-view-security-profile.ts:35`,
  `apps/core-app/src/main/core/window-security-profile.ts:35`,
  `apps/core-app/src/main/modules/permission/permission-guard.ts:95`,
  `apps/core-app/src/main/modules/plugin/plugin-module.ts:2070`, and
  `apps/core-app/src/main/modules/plugin/plugin-module.ts:2200`.

### R1 - Make every search request own its session

Treat this as P1.

- Every request, including a cache hit, receives a new session identity.
- Session-owned state includes cancellation, caller identity, activation
  context, provider selection, trace identity, cache association, and delivery
  sink.
- CoreBox, ApplicationIndex, AI agents, DivisionBox, and future windows must not
  cancel, activate, or receive updates for one another.
- UI-specific activation behavior must live in a UI facade rather than the
  reusable search pipeline.
- Cancellation must address the requested live session and be a no-op for a
  stale or completed session.
- Index-generation refresh of an unchanged renderer query must create a new
  caller-owned session and deliver a replacement snapshot; it must not append
  into or revive a completed session.
- Index-driven refresh is coalesced and opt-in for visible UI callers. It must
  never restart AI or background searches implicitly.
- Current evidence:
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:152`,
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:676`,
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1222`,
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1297`,
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1507`,
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1674`,
  and `apps/core-app/src/main/modules/ai/agents/builtin/search-agent.ts:209`.

### R2 - Guarantee update-before-completion ordering

Treat this as P1 and complete it before changing the search delivery protocol.

- The gather update contract must support asynchronous consumers.
- Updates from fast, deferred, late-fast, final, and cancellation paths must be
  serialized.
- Completion cannot clear a session or emit an end state until all preceding
  result merge/rank/delivery work has settled.
- Abort must not allow queued callbacks to mutate a completed or replacement
  session.
- Current evidence: `packages/utils/common/search/gather.ts:51`,
  `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts:232`,
  `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts:301`,
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1525`,
  and `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1674`.

### R3 - Establish one durable search-index write owner

Treat this as P1.

- `IndexingRuntime` is the semantic owner of scan, watch, reconcile, reset, and
  clear mutations.
- One dedicated writer connection owns FTS mutations and FTS schema readiness;
  provider-local code may persist provider-owned tables but must only emit
  indexed records/deltas for shared search-index changes.
- File and App providers must stop applying the same FTS mutation before
  handing it to `IndexingRuntime`.
- Index initialization must be single-flight. Runtime readiness checks must be
  non-destructive; repair and migration must be explicit operations.
- App/File scans publish records incrementally after each provider-local commit
  instead of buffering an entire first run before the runtime sees its first
  batch.
- Each committed batch advances a monotonic source generation used to version or
  invalidate dependent search-cache entries. Indexing progress is not a commit
  signal.
- Temporary write-origin and duplicate-mutation evidence is required before a
  provider's legacy path is removed.
- Current evidence:
  `apps/core-app/src/main/modules/box-tool/search-engine/indexing-scan-scheduler.ts:80`,
  `apps/core-app/src/main/modules/box-tool/search-engine/indexing-watch-router.ts:124`,
  `apps/core-app/src/main/modules/box-tool/search-engine/indexing-store-adapter.ts:169`,
  `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:762`,
  `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:1415`,
  `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:1476`,
  `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts:647`,
  `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts:2151`,
  `apps/core-app/src/main/modules/box-tool/search-engine/workers/search-index-worker.ts:293`,
  and
  `apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:696`.

### R4 - Fail closed until storage and onboarding state are known

Treat this as P1 because it guards consent-sensitive indexing and CoreBox
visibility.

- Storage must expose an awaited readiness result with `pending`, `ready`, and
  `failed` states instead of requiring each consumer to infer readiness from a
  thrown read.
- Search provider startup, indexing startup, and CoreBox shortcut behavior must
  not treat a storage failure as completed onboarding.
- A failed readiness result must expose a degraded reason and recovery path;
  it must not fabricate initialized settings.
- Current evidence:
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:450`,
  `apps/core-app/src/main/modules/box-tool/core-box/index.ts:84`, and
  `apps/core-app/src/main/modules/storage/index.ts:784`.

### R5 - Consolidate provider lifecycle and the executable control plane

Treat this as P2 and begin only after R1-R4 ownership boundaries are stable.

- Search providers need an awaited, idempotent lifecycle with explicit runtime
  states and disposal ownership for timers, listeners, polling jobs, and
  workers.
- A failed provider load must produce a degraded/unavailable runtime state and
  must not remain indistinguishable from an active provider.
- Registry entries must link descriptor, query implementation or indexed-source
  adapter, lifecycle state, health, permissions, and user configuration.
- Indexed sources that are intended to be pull-searchable should use a generic
  indexed-source query adapter rather than a second hard-coded provider map.
- Module dependency declarations and coordinator decomposition are follow-up
  work after lifecycle ownership is explicit.
- Current evidence:
  `apps/core-app/src/main/modules/box-tool/search-engine/search-provider-registry.ts:92`,
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:428`,
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:491`,
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:2561`,
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:2725`,
  `packages/utils/core-box/tuff/tuff-dsl.ts:1524`,
  `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts:553`, and
  `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:397`.

### R6 - Preserve compatibility through explicit, temporary adapters

- Do not add raw IPC channels or bypass typed transport and permission APIs.
- Keep old search query/update/end contracts only behind a sender-scoped
  compatibility facade while renderer callers migrate to a request stream.
- Compatibility adapters must have removal criteria and tests; they cannot
  retain global session state or broadcast to `windowManager.current`.
- Do not run old and new FTS writers for the same provider mutation as a steady
  state. Migration flags are source-scoped and must select exactly one writer.
- High-risk migrations require preflight, simulation, rollback, and packaged
  runtime evidence before broad enablement.

## Completed Audit Baseline

- [x] The current-state architecture map names the main runtime/data boundaries
  and traces search across them.
- [x] The audit covers correctness, concurrency/lifecycle, persistence,
  performance, security/trust boundaries, extensibility, and observability.
- [x] Every high-severity finding cites current source, tests, configuration, or
  reproducible repository evidence.
- [x] Findings distinguish verified defects, high-confidence risks, and unknowns
  that still require runtime measurement.
- [x] The audit report includes prioritized remediation phases and targeted
  validation recommendations.
- [x] The audit changed no product source files and preserved pre-existing user
  changes.

## Parent Task Map

After review, create these independently verifiable child tasks. Dependencies
listed here must be copied into each child PRD and implementation plan.

| Proposed child | Priority | Explicit dependency |
| --- | --- | --- |
| `contain-plugin-window-boundary` | P0 | None; execute first for release safety. |
| `serialize-search-gather-updates` | P1 | None; complete before search stream/session migration. |
| `scope-search-sessions-and-streams` | P1 | Depends on `serialize-search-gather-updates`. |
| `gate-search-on-storage-hydration` | P1 | None; must finish before enabling changed automatic indexing startup. |
| `establish-single-search-index-writer` | P1 | Storage gate required before production enablement; implementation can be developed independently. |
| `unify-search-provider-lifecycle` | P2 | Depends on stable session, storage, and index ownership from the preceding P1 children. |

The parent owns the final concurrent-search, packaged-startup, permission,
SQLite ownership, and cross-child regression review.

## Acceptance Criteria

- [x] The user approved the D1 hard-cut plugin compatibility policy.
- [x] The user reviews and approves the parent artifacts and the first child's
  converged artifacts before any implementation task is started.
- [x] Child tasks are created with the explicit dependencies and acceptance
  criteria from this parent; only the child owning the next deliverable is
  started.
- [ ] R0 acceptance: privileged window events are permission-enforced, remote
  content cannot run in the compatibility profile, reflective member invocation
  is removed, and trusted candidates use hardened preferences.
- [ ] R1 acceptance: concurrent CoreBox and AI searches retain independent
  session ids, controllers, activation contexts, cache envelopes, and sinks.
- [ ] R2 acceptance: a delayed async update consumer proves that every update
  settles before completion, including late-fast and cancellation paths.
- [ ] R3 acceptance: instrumentation and tests prove one FTS mutation origin per
  provider/item change, one DDL owner, and single-flight initialization.
- [ ] R4 acceptance: pending or failed storage blocks consent-sensitive indexing
  and CoreBox activation until a real onboarding decision is available.
- [ ] R5 acceptance: failed load, unload/reload, shutdown, and provider health
  transitions are explicit and leave no registered listener, timer, poller, or
  worker behind.
- [ ] Progressive-index acceptance: while a first App/File scan is still
  running, an unchanged visible CoreBox query observes a newly committed matching
  record within one second, receives a final replacement snapshot at completion,
  and never restarts or cancels AI/background callers.
- [ ] Parent integration acceptance: targeted tests, CoreApp type-check, packaged
  cold-start, concurrent UI/AI search, and SQLite preflight/simulation evidence
  pass without modifying unrelated work.

## Out of Scope

- Search relevance/ranking or broader visual UX redesign. The explicitly
  requested removal of transient CoreBox searching, recommendation warm-up, and
  indexing hints plus selection preservation during progressive refresh are in
  scope; terminal no-result UX remains unchanged.
- Adding new indexed sources or completing Quicklinks/Browser Bookmarks product
  features as part of the ownership migration.
- A wholesale rewrite of `SearchEngineCore`, FileProvider, AppProvider, the
  plugin runtime, or the module manager.
- Migrating or deleting legacy `file_fts` as part of the first single-writer
  child; its existing retain policy remains unchanged.
- Opportunistic cleanup of unrelated dirty files.
