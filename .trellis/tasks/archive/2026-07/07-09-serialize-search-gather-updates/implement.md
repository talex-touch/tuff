# Implementation Plan

## Prerequisites

- The child PRD and technical design are reviewed before `task.py start`.
- Run `trellis-before-dev` before product edits and load shared type-safety,
  CoreApp main-process, search, and cross-layer guidance.
- Re-read every dirty target before editing. Preserve the repository's unrelated
  parallel work and avoid formatting broad `search-core.ts` sections.

## Ordered Checklist

### 1. Lock the failing contracts

- [x] Add a shared type contract proving `TuffAggregatorCallback` accepts both
  synchronous and asynchronous implementations.
- [x] Add a delayed-consumer gather test that fails when callback completion is
  overtaken by late-fast/deferred/final emissions.
- [x] Add a test proving `IGatherController.promise` remains pending until the
  terminal callback settles.
- [x] Add cancellation-during-callback coverage proving queued updates are
  skipped and exactly one cancellation terminal is delivered.
- [x] Add callback-rejection coverage proving original-error rejection and
  provider abort.
- [x] Add a provider barrier test proving configured provider execution remains
  concurrent.
- [x] Add SearchCore completion coverage for update-before-end ordering and one
  `cancelled: true` end event.

### 2. Change the shared callback contract

- [x] Change `TuffAggregatorCallback` to return `void | Promise<void>`.
- [x] Keep `IGatherController` and all event payloads source-compatible.
- [x] Confirm there are no additional callback implementations requiring an
  adapter or signature migration.

### 3. Add ordered dispatch and settlement

- [x] Implement the CoreApp-local Promise-tail dispatcher with open, terminal,
  delivered, and failed states.
- [x] Make the first terminal update invalidate queued non-terminal callbacks and
  deduplicate later terminal requests.
- [x] Preserve the original callback rejection and reject later emissions with
  the same error.
- [x] Add idempotent controller resolve/reject handling and an internal abort
  reason that suppresses cancellation emission after callback failure.

### 4. Route every gather emission through the dispatcher

- [x] Await empty-provider and immediate fast terminal updates.
- [x] Make late-fast and deferred result sinks async and await them outside
  provider error handling.
- [x] Await fast partial, deferred incremental, final, and cancellation updates.
- [x] Resolve normal completion only after the final/fast terminal callback.
- [x] Resolve cancellation only after the cancellation callback.
- [x] Confirm timed-out or temporarily abort-insensitive providers cannot publish
  after terminal state.

### 5. Make SearchCore use one completion owner

- [x] Remove direct cancellation `search.end` publication from `cancelSearch()`.
- [x] Add an explicit cancellation branch in the gather callback that avoids
  merge/rank work on an aborted signal.
- [x] Resolve an as-yet-unresolved initial search with the existing empty result
  shape when cancellation wins.
- [x] Send exactly one `CoreBoxEvents.search.end` with `cancelled: true` from the
  ordered terminal callback.
- [x] Recheck abort/session state before any post-await non-terminal publication.
- [x] Preserve existing window routing, cache, activation, ranking, and provider
  selection behavior.

### 6. Verify

- [x] Run focused shared contract and CoreApp gather tests.
- [x] Run SearchCore regression baseline, trace, timeout, and cancellation tests.
- [x] Run CoreApp node type-check, full CoreApp type-check, and task-scoped lint.
- [x] Run `trellis-check` across shared type -> gather dispatcher -> SearchCore
  async callback -> transport update/end ordering.
- [x] Update Trellis specs if promise-aware terminal callback ownership should be
  a project-wide search contract.

## Validation Commands

```bash
corepack pnpm -C packages/utils exec vitest run \
  __tests__/search/gather-contract.test.ts

corepack pnpm -C apps/core-app exec vitest run \
  src/main/modules/box-tool/search-engine/search-gather.test.ts \
  src/main/modules/box-tool/search-engine/search-core.gather-ordering.test.ts \
  src/main/modules/box-tool/search-engine/search-core.regression-baseline.test.ts \
  src/main/modules/box-tool/search-engine/search-core.trace.test.ts

corepack pnpm -C apps/core-app run typecheck:node
corepack pnpm -C apps/core-app run typecheck
```

Use package-local ESLint for only the touched CoreApp and utils files. Run
task-scoped `git diff --check`; report repository-wide failures separately when
they belong to existing parallel work.

## Risky Files

- `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts`:
  layered concurrency, timeouts, and abort settlement are intertwined. Keep
  provider failures separate from callback failures.
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`: large,
  dirty coordinator. Limit edits to gather callback ordering and cancellation
  completion ownership.
- `packages/utils/common/search/gather.ts`: shared public type contract; verify
  every callback implementation and package type-check.
- SearchCore tests require extensive module mocks. Prefer one focused ordering
  test over broad fixture churn.

## Rollback Points

- Tests may land first and remain if implementation must be reconsidered.
- The dispatcher, all awaited emission paths, callback type, and SearchCore
  cancellation ownership must roll forward or back together.
- Do not retain a hybrid state where some callbacks are awaited or where both
  `cancelSearch()` and the gather terminal callback publish completion.

## Pre-Start Gate

- [x] `prd.md` has no unresolved product or scope question.
- [x] `design.md` covers terminal, cancellation, rejection, and bounded queue
  semantics.
- [x] `implement.md` names focused tests and rollback points.
- [x] `task.py validate 07-09-serialize-search-gather-updates` passes.
- [x] The user reviews these artifacts and explicitly approves implementation.
