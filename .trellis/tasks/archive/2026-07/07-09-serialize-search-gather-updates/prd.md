# Serialize Async Search Gather Updates

## Goal

Guarantee that asynchronous search result processing completes in emission order
and that terminal completion cannot overtake a pending update. This child fixes
the verified ordering defect without changing caller/session routing.

## Parent and Dependency

- Parent: `07-09-audit-search-system-architecture`.
- Priority: P1.
- Explicit dependency: none.
- Downstream dependency: `07-09-scope-search-sessions-and-streams` must wait for
  this task because its session sink relies on deterministic gather ordering.

## Background

- `TuffAggregatorCallback` returns `void` at
  `packages/utils/common/search/gather.ts:51`.
- Gather calls the callback without awaiting it in fast, deferred, late-fast,
  final, and cancellation paths, including
  `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts:232`
  and
  `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts:301`.
- SearchCore supplies an async callback that merges, ranks, and sends results at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1525`.
- Search completion clears the controller and emits end state at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1674`.
- `cancelSearch()` aborts the gather and sends `search.end` immediately at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:812`,
  even though an already-running async update callback may still publish a
  later `search.update`. The gather cancellation callback can also emit another
  terminal update, so cancellation currently has split completion ownership.
- Existing tests use synchronous consumers and therefore do not cover the race.

## Requirements

- Change the callback contract to `void | Promise<void>` across shared and
  CoreApp types.
- Serialize callback execution in original emission order while keeping provider
  execution concurrent.
- Fast, deferred, late-fast, final, empty-provider, and cancellation emissions
  must use the same serializer.
- The first terminal update wins. It must wait for the currently executing
  callback, skip queued non-terminal callbacks, and refuse later emissions
  without invoking the callback.
- The terminal callback must settle before `IGatherController.promise` resolves.
- Cancellation must be terminal and prevent queued non-terminal callbacks from
  publishing after it.
- A callback rejection must reject/terminate the gather operation and abort
  remaining work with the original error; it cannot be silently logged, treated
  as a provider failure, or converted into a cancellation callback.
- Result-producing provider workers must await the serializer. This preserves
  configured provider concurrency while bounding pending callback work by the
  active worker counts instead of an unbounded result queue.
- SearchCore cancellation completion must be emitted once from the ordered
  cancellation callback. `cancelSearch()` may request abort and clear ownership
  state, but it cannot independently publish completion ahead of the callback.
- The implementation must not deadlock when a provider times out, ignores an
  abort temporarily, or completes while cancellation is pending.

## Acceptance Criteria

- [x] A deliberately delayed async consumer observes updates in exact fast ->
  late/deferred -> final order.
- [x] `search.end` or controller completion cannot occur before the final ranked
  update settles.
- [x] Cancellation during a pending callback emits one terminal cancellation and
  no later result update.
- [x] Callback rejection rejects the controller and aborts remaining provider
  work with a stable test assertion.
- [x] SearchCore sends exactly one cancellation `search.end` with
  `cancelled: true`, after any already-running update callback settles.
- [x] Existing synchronous callback behavior and provider concurrency remain
  compatible.
- [x] Gather, search baseline, trace, timeout, and abort tests pass.
- [x] No caller/session routing refactor is included in this child.

## Out of Scope

- Request-scoped session ownership, renderer streaming, cache identity, or AI/UI
  isolation; those belong to `07-09-scope-search-sessions-and-streams`.
- Replacing gather with an `AsyncIterable` in this change.
- Search ranking or provider priority tuning.
