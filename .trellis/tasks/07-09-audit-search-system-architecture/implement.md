# Implementation Plan

## Execution Model

This parent task owns planning, dependency mapping, and final integration
review. It should not be started for broad implementation. After the user
approves the artifacts, create the child tasks listed in `prd.md`, copy
their explicit dependencies into their artifacts, and start only the child that
owns the next deliverable.

Inline mode applies: each child loads `trellis-before-dev`, implements directly,
runs `trellis-check`, validates targeted and cross-layer behavior, updates specs
when a durable contract is learned, and commits before archive.

## Ordered Work

### 0. Planning review and child creation

- [x] Obtain the D1 plugin compatibility decision: hard safety cut approved.
- [x] Review `prd.md`, `design.md`, and this plan with the user.
- [x] Create the six child tasks from the parent task map with the listed
      priorities and dependencies.
- [ ] Give each child a focused PRD, design, and implementation plan before
      `task.py start`.
- [ ] Do not start the parent unless a direct parent-owned integration change is
      later identified.

### 1. Child: contain plugin window boundary

- [ ] Add tests that currently demonstrate remote compatibility loading,
      permission mapping drift, effective-profile mismatch, and reflective member
      invocation.
- [ ] Align actual event identities with permission mappings and route handlers
      through permission enforcement.
- [ ] Reject remote URLs for compatibility windows under the approved hard-cut
      policy; canonicalize and constrain local files to the owning plugin root.
- [ ] Replace full BrowserWindow constructor input with the validated public
      plugin-window option allowlist.
- [ ] Make eligible plugins use `trusted-plugin-view` as the effective profile.
- [ ] Introduce the allowlisted window-command union and adapt/remove the legacy
      property API.
- [ ] Add diagnostics for blocked origins, compatibility reasons, permission
      decisions, and rejected commands without logging sensitive payloads.
- [ ] Run plugin SDK, permission, security-profile, navigation, and packaged
      plugin smoke checks.

Rollback point: revert trusted-profile enablement for a specific audited local
plugin only. Remote+Node loading and arbitrary reflective commands are not valid
rollback states.

### 2. Child: serialize search gather updates

- [ ] Add a failing test with a delayed async consumer and late-fast provider.
- [ ] Change `TuffAggregatorCallback` to `void | Promise<void>`.
- [ ] Serialize every update path and await the terminal callback before the
      gather controller resolves.
- [ ] Define rejection and cancellation semantics; prove no callback publishes
      after terminal state.
- [ ] Run gather, search regression baseline, trace, and provider timeout tests.

Rollback point: this is an internal contract change. Revert as one unit if
latency or deadlock evidence appears; do not keep mixed awaited/unawaited paths.

### 3. Child: scope search sessions and streams

Explicit dependency: the ordered gather child must be complete.

- [x] Introduce `SearchSession`, `SearchSessionRegistry`, explicit caller context,
      and sink contracts behind existing behavior.
- [x] Move controller, latest id, activation snapshot, cache/session association,
      and trace ownership into the session.
- [x] Route legacy renderer updates only to the request sender; give AI and
      background callers collecting sinks.
- [x] Make cache hits create a new session envelope and make cancellation verify
      the requested live id.
- [x] Add the typed stream event and expose a server-side cancellation signal.
- [x] Migrate `useSearch`, then `ApplicationIndex`, and remove their global
      update/end subscriptions.
- [x] Remove `windowManager.current` delivery and the global active controller.
- [x] Add concurrent CoreBox/AI, two-window, cache-hit, stale-cancel, early-update,
      and destroy-with-live-session tests.

Rollback point: renderer callers may temporarily use the sender-scoped legacy
sink, but the request-scoped session registry remains authoritative.

### 4. Child: gate search on storage hydration

- [x] Add storage readiness state and a single-flight wait primitive.
- [x] Add an `OnboardingGate` with allowed/blocked/degraded results.
- [x] Replace SearchEngineCore and CoreBox shortcut fail-open catches.
- [x] Gate provider startup, indexing startup, maintenance, and consent-sensitive
      source activation.
- [x] Add recovery/retry and diagnostics behavior.
- [x] Test pending, ready-complete, ready-incomplete, failed-recoverable,
      failed-terminal, and repeated-start cases.

Rollback point: preserve the explicit readiness object and fail-closed result;
only UI presentation or retry timing may be rolled back.

### 5. Child: establish one search-index writer

Explicit dependency: storage gating must pass before production enablement of
changed automatic indexing startup. Development and parity instrumentation can
proceed earlier.

- [x] Add write-origin, duplicate-attempt, writer-queue, busy/retry, and drain
      evidence before changing ownership.
- [x] Extract a runtime-owned generic writer from the existing search-index
      worker client and implement `IndexStoreAdapter` over it.
- [x] Add single-flight reader/writer readiness and separate non-destructive
      readiness from explicit repair/migration.
- [x] Migrate AppProvider to runtime-only shared FTS mutations and verify parity.
- [x] Migrate FileProvider scan, watch, reconcile, cleanup, and reset paths to
      runtime-only shared FTS mutations while retaining provider-local persistence.
- [x] Replace DatabaseModule's FileProvider dependency with the writer drain /
      checkpoint contract.
- [ ] Remove source-scoped legacy FTS paths only after parity evidence, reconcile,
      and rollback rehearsal pass.
- [ ] Run migration preflight and copy-based FTS ownership simulation against an
      approved database fixture/profile.

Rollback point: select the previous writer for one source and reconcile it.
Never enable both writer paths for the same source mutation.

### 6. Child: unify provider lifecycle and control plane

Explicit dependencies: session, storage, and index ownership children are
complete.

- [ ] Add typed async provider lifecycle and idempotent disposal scope.
- [ ] Track ready/degraded/stopped state and remove failed providers from search
      execution while retaining diagnostics.
- [ ] Move every SearchCore/AppProvider/FileProvider listener, timer, polling job,
      worker, and stream under an owner scope.
- [ ] Build executable registry entries linking descriptor, implementation or
      indexed-source adapter, policy, health, state, and user configuration.
- [ ] Add the generic indexed-source query adapter for sources intended to be
      pull-searchable.
- [ ] Add unload/reload, partial-load failure, repeated-destroy, and shutdown
      drain tests.
- [ ] Propose module dependency declarations and coordinator extractions only
      where the new lifecycle boundary demonstrates a concrete owner.

Rollback point: registry read views may fall back to the prior descriptor
snapshot, but provider teardown and degraded-state semantics must remain typed.

### 7. Parent integration and production proof

- [ ] Run concurrent CoreBox, ApplicationIndex, DivisionBox, and AI-agent search
      stress against one application runtime.
- [ ] Verify no cross-caller cancellation, activation inheritance, update
      routing, stale cache identity, or update-after-complete event.
- [ ] Verify plugin window permission/profile/URL/command policies in a packaged
      build.
- [ ] Capture FTS write-origin, duplicate, busy/retry, WAL/checkpoint, and drain
      evidence under full scan plus watch churn.
- [ ] Run storage-failure and first-run packaged startup scenarios.
- [ ] Re-run R3 migration readiness, FTS copy simulation, Settings diagnostics,
      and cold-start evidence.
- [ ] Run CoreApp type-check and the focused regression suites from every child.
- [ ] Review whether new executable contracts belong in `.trellis/spec/` before
      archiving children and the parent.

## Validation Commands

Commands are refined in each child after `trellis-before-dev` loads the relevant
specs. The parent integration baseline is:

```bash
corepack pnpm -C packages/utils exec vitest run \
  __tests__/plugin-window-sdk.test.ts \
  __tests__/main-transport-stream.test.ts \
  __tests__/renderer-transport-stream.test.ts \
  __tests__/transport/port-policy.test.ts

corepack pnpm -C apps/core-app exec vitest run \
  src/main/modules/plugin/runtime/plugin-view-security-profile.test.ts \
  src/main/modules/plugin/plugin.test.ts \
  src/main/modules/storage/index.test.ts \
  src/main/modules/box-tool/search-engine/search-gather.test.ts \
  src/main/modules/box-tool/search-engine/search-core.regression-baseline.test.ts \
  src/main/modules/box-tool/search-engine/search-core.trace.test.ts \
  src/main/modules/box-tool/search-engine/indexing-store-adapter.test.ts \
  src/main/modules/box-tool/search-engine/indexing-runtime.test.ts \
  src/main/modules/box-tool/search-engine/search-index-service.schema-repair.test.ts \
  src/main/modules/box-tool/search-engine/workers/search-index-worker-client.test.ts

corepack pnpm -C apps/core-app run typecheck
```

High-risk database checks, using an approved copy/profile:

```bash
corepack pnpm -C apps/core-app run search:index-migration:preflight -- \
  --db <sqlite.db> --output <preflight.json>

corepack pnpm -C apps/core-app run search:fts-ownership-simulate -- \
  --db <sqlite.db> --output <fts-simulation.json>
```

No command may operate destructively on a natural user profile without a
separate explicit approval and rollback artifact.

## Risky Files and Ownership Boundaries

- `apps/core-app/src/main/modules/plugin/plugin-module.ts`: broad plugin runtime;
  keep the child limited to window capability handlers and extracted policy.
- `packages/utils/plugin/sdk/window/index.ts`: public plugin compatibility
  surface; version and document breaking behavior.
- `packages/utils/transport/types.ts` and event definitions: shared cross-layer
  contracts; require utils and CoreApp tests together.
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`: dirty,
  oversized coordinator; extract by ownership and preserve unrelated edits.
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts` and
  `apps/core-app/src/renderer/src/views/base/application/ApplicationIndex.vue`:
  renderer migration must keep early-update and unmount cancellation behavior.
- FileProvider and AppProvider: large, stateful modules with pre-existing work;
  migrate one mutation family at a time and avoid formatting churn.
- Search index worker/service and DatabaseModule: migration and checkpoint code;
  require copy-based evidence and explicit DDL ownership.
- StorageModule/CoreBox startup: first-run and privacy-sensitive; fail closed in
  every error path.

## Pre-Start Review Gate

Planning is ready for review when:

- D1 is resolved as a hard safety cut;
- no requirement or acceptance criterion is duplicated or ambiguous;
- the user approves the proposed child map and order;
- the first child has its own converged PRD/design/implementation artifacts;
- `task.py validate` passes for the parent and first child.

Only then may the first child transition from `planning` to `in_progress`.
