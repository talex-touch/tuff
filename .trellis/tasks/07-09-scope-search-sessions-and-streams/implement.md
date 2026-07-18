# Request-Scoped Search Sessions and Streams — Implementation Plan

## Preconditions

- Parent: `07-09-audit-search-system-architecture`.
- Ordered gather prerequisite: archived
  `07-09-serialize-search-gather-updates` acceptance remains green.
- Progressive refresh prerequisite: archived
  `07-09-progressive-corebox-index-search` acceptance remains green.
- Storage/onboarding gate is already implemented and must remain unchanged.
- This task starts only after PRD/design/plan validation and task status changes
  from `planning` to `in_progress`.

## 1. Establish Session and Sink Contracts

- [x] Add `SearchCallerIdentity`, `SearchRequestContext`, `SearchSink`,
      `SearchExecution`, `SearchSession`, and `SearchSessionRegistry`.
- [x] Enforce fresh id, immutable caller/query/activation snapshots, owner-checked
      cancellation, ordered pre-snapshot buffering, terminal idempotence, and
      awaited registry destroy.
- [x] Add pure provider selection for a supplied activation map and pass that map
      through query orchestration/cache-key construction.
- [x] Add detached cache snapshot helpers that exclude session identity.

Validation gate:

- session registry focused contracts cover fresh ids, ownership, cancellation,
  ordered sink delivery, detached snapshots, and destroy;
- scoped type-check/ESLint for touched main-process files.

Rollback point: no renderer or IPC caller has moved yet; remove the new unused
contracts without changing existing search behavior.

## 2. Move SearchCore to Request Ownership

- [x] Add synchronous `startSearch(query, context)` and collecting `search`
      wrapper; make the existing pipeline execute against one `SearchSession`.
- [x] Replace `latestSessionId` stale checks with session cancellation/terminal
      checks and attach each gather controller to its session.
- [x] Remove process-global gather controller, last query, session timing map, and
      search-result activation mutation.
- [x] Route update/no-result/completion through the session sink; remove all
      `windowManager.current` search delivery.
- [x] Make cache, recommendation, failure, cancellation, and terminal paths close
      exactly their owning session.
- [x] Make destroy abort and await every live session; update teardown callers to
      await it.
- [x] Record query completion from the executed result context instead of a
      process-global last query.

Validation gate:

- existing gather FIFO/terminal ordering tests remain green;
- concurrent collecting sessions do not cancel one another;
- existing ranking, provider routing, cache-key, semantic recall, and trace tests
  remain green.

Rollback point: retain `SearchSessionRegistry` and restore only the pipeline
adapter while diagnosing; never restore current-window delivery or id-blind
cancellation after caller migration begins.

## 3. Add Typed Stream and Sender-Scoped Facade

- [x] Define `CoreBoxSearchSessionRequest` and discriminated stream chunks; add a
      dedicated `CoreBoxEvents.search.session` stream event.
- [x] Expose cancellation as `StreamContext.signal` from the shared server stream
      runtime and preserve fallback/MessagePort behavior.
- [x] Register the CoreBox stream facade. Derive caller identity from
      `context.sender`, link stream abort to the exact session, and await terminal
      delivery.
- [x] Keep invoke query compatibility on the same registry, with updates/end/
      no-result addressed only to `context.sender.id`.
- [x] Validate cancel requests against both the session id and sender owner.
- [x] Pass explicit collecting caller context from Search Agent execute and
      semantic paths so AI cannot inherit UI activation or emit renderer traffic.

Validation gate:

- main/renderer transport stream suites prove the abort signal and terminal
  behavior;
- two mocked renderer senders observe disjoint delivery;
- concurrent UI-stream and AI collecting searches both complete.

Rollback point: typed renderer consumers may fall back to sender-scoped invoke;
the request-scoped registry/facade remains authoritative.

## 4. Migrate Renderer Consumers

- [x] Migrate `useSearch.ts` to one controller-owned typed stream per request.
- [x] Process session/snapshot/update/no-result/complete chunks in order and
      remove invoke-order pending maps plus global update/end listeners.
- [x] Preserve progressive full-snapshot refresh, selected-item-by-id behavior,
      trailing refresh, and current filter/ranking application.
- [x] Migrate `ApplicationIndex.vue` to its own typed stream/controller.
- [x] Cancel only each component's controller on replacement and unmount.
- [x] Confirm detached DivisionBox search continues through its caller-owned
      `useSearch` stream without global delivery.

Validation gate:

- renderer composable/component contracts cover early update ordering, stale
  stream isolation, unmount cancellation, and selection preservation;
- renderer type-check passes;
- UI smoke verifies ordinary query, progressive refresh, terminal no-result, and
  two independently addressed renderer consumers.

Rollback point: switch a renderer consumer to the sender-scoped invoke facade;
do not restore global `search.update` / `search.end` subscriptions.

## 5. Integrated R3 Proof

- [x] Run focused SearchSession/SearchCore/CoreBox IPC/transport/useSearch/
      ApplicationIndex tests together.
- [x] Run existing search-core gather ordering, regression baseline, semantic
      recall, index-commit refresh, and selection-preservation coverage.
- [x] Run scoped changed-file ESLint plus CoreApp node and renderer type-checks.
- [x] Run a direct simultaneous UI-stream + AI collecting smoke and record:
      distinct ids, both terminals, no cross-cancel, no AI renderer sends.
- [x] Run a two-sender stream smoke and record that each sender observes only its
      own session chunks.
- [x] Verify by source search that search delivery no longer references
      `windowManager.current`, `currentGatherController`, `latestSessionId`, or
      renderer pending search maps.
- [x] Re-run progressive first-index refresh smoke/coverage to prove the archived
      integrated acceptance remains intact.

## 6. Parent and Task Convergence

- [x] Check every task acceptance criterion against current evidence and update
      `prd.md` only after its proof passes.
- [x] Mark the parent R3 implementation/acceptance items complete with the exact
      verification evidence and update the living roadmap/TODO state.
- [x] Update task metadata with final related files, evidence, and next action.
- [ ] Archive after a user-directed work commit; repository commit/archive was not authorized in this session.

## Verification Evidence — 2026-07-17

- CoreApp integrated search/session regression: 8 files / 51 tests passed, including concurrent UI/AI isolation, actual cache-hit detachment, sender scoping, stale cancellation, ordered gather, progressive refresh, ApplicationIndex controller ownership, and matching/stale no-results chunks.
- Semantic recall and index-commit regression: 2 files / 8 tests passed.
- Shared transport regression: 4 files / 15 tests passed across main, renderer, plugin fallback, MessagePort policy, and matching server abort signals.
- Scoped CoreApp and utils ESLint passed; `typecheck:node` and `typecheck:web` passed after the new behavioral tests were included.
- `pnpm run build:vite` completed successfully. Source search found no `windowManager.current`, `currentGatherController`, `latestSessionId`, or renderer pending search maps in the migrated delivery path.
- Isolated Electron dev smoke opened `ApplicationIndex`, submitted `Safari`, observed the UI transition to `0 searched`, and reached `core-box:search:session` in main. The fresh profile correctly failed closed at `onboarding-incomplete`; no real profile, SQLite schema, FTS, or `scan_progress` data was opened or modified.

Final rollback rule: a renderer transport fallback is allowed. Reintroducing a
single global gather controller, mutable cross-caller activation inheritance,
current-window delivery, or cached session ids is not.
