# Unify Search Provider Lifecycle

## Goal

Create one executable, health-aware provider control plane with typed async
lifecycle and complete disposal ownership. A provider descriptor, query/source
implementation, permission/admission decision, health, user configuration, and
runtime state must describe the same executable entry.

## Parent and Dependency

- Parent: `07-09-audit-search-system-architecture`.
- Priority: P2.
- Explicit prerequisites:
  - `07-09-scope-search-sessions-and-streams`
  - `07-09-gate-search-on-storage-hydration`
  - `07-09-establish-single-search-index-writer`
- These prerequisites stabilize request, consent, and persistence ownership so
  this task does not wrap conflicting legacy behavior.

## Background

- Settings builds provider descriptors from indexed sources/plugins at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-provider-registry.ts:92`.
- Search execution uses a separate hard-coded provider map at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:428`.
- Provider load errors are swallowed while entries remain active at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:491`.
- `ISearchProvider` has no typed destroy/lifecycle contract at
  `packages/utils/core-box/tuff/tuff-dsl.ts:1524`.
- SearchCore dynamically detects and does not await destroy at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:2725`.
- AppProvider/FileProvider own timers, workers, polling, and background tasks
  without complete teardown ownership.

## Requirements

- Define typed, async, idempotent provider lifecycle methods: `load`, `start`,
  `stop`, and `destroy`.
- Add explicit runtime states such as registered, loading, ready, degraded,
  stopped, and destroyed.
- Search executes only ready providers. Load failures remain visible as degraded
  diagnostics and are not presented as successful activation.
- Every timer, listener, transport handler, stream, polling job, worker, and
  background task belongs to a disposable scope that is awaited on teardown.
- Build executable registry entries linking descriptor, implementation or
  indexed-source query adapter, policy, health, lifecycle state, and normalized
  user configuration.
- Provider/source id mismatches and collisions fail registration with a
  diagnostic issue.
- Indexed sources intended for pull search use a generic FTS-by-source adapter;
  push-only plugin providers remain explicit.
- `SearchEngineCore.destroy()` is async/idempotent, drains sessions/providers,
  unregisters listeners, and resets singleton/runtime state where required.
- Module dependency declarations and coordinator extraction proposals must be
  based on these real ownership boundaries, not line-count goals.

## Acceptance Criteria

- [ ] A failed provider load enters degraded state, is excluded from execution,
  and reports its reason in the same registry shown by Settings.
- [ ] Load/start/stop/destroy can be called repeatedly without duplicate handlers
  or leaked work.
- [ ] Unload/reload tests prove timers, pollers, listeners, streams, and workers
  are removed and recreated once.
- [ ] Shutdown awaits provider/session drain and leaves no active singleton
  controller or transport listener.
- [ ] Registry descriptors, executable provider/source ids, user config, health,
  and permission decisions remain consistent under collision/error tests.
- [ ] A generic indexed-source adapter can query an eligible indexed source by
  source id without adding another hard-coded SearchCore provider branch.
- [ ] Existing push-provider and provider ordering behavior remains compatible.

## Out of Scope

- New indexed-source product completion.
- Broad main-module dependency graph changes before provider ownership is proven.
- Arbitrary file splitting or UI redesign.
- Reopening search session, storage, or FTS ownership decisions completed by
  prerequisite tasks.
