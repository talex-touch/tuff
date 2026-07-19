# Establish Single Search Index Writer

## Goal

Make `IndexingRuntime` the only semantic path for shared search-index mutations
and one dedicated SQLite writer the physical owner of FTS writes and DDL. Remove
duplicate File/App writes while making every committed first-run batch searchable
before the full scan completes, without losing provider-local persistence,
migration evidence, or rollback capability.

## Parent and Dependency

- Parent: `07-09-audit-search-system-architecture`.
- Priority: P1.
- Development may begin independently after its own planning review.
- Explicit production-enablement prerequisite:
  `07-09-gate-search-on-storage-hydration` must be complete so changed automatic
  indexing cannot start before consent state is known.

## Background

- `IndexingRuntime` applies scan and watch mutations through its store at
  `apps/core-app/src/main/modules/box-tool/search-engine/indexing-scan-scheduler.ts:80`
  and
  `apps/core-app/src/main/modules/box-tool/search-engine/indexing-watch-router.ts:124`.
- `SearchIndexStoreAdapter` then writes through `SearchIndexService` at
  `apps/core-app/src/main/modules/box-tool/search-engine/indexing-store-adapter.ts:169`.
- FileProvider performs legacy FTS work before returning the same scan/watch data
  at `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:762`,
  `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:1415`, and
  `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:1476`.
- AppProvider directly writes and also emits runtime records at
  `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts:647` and
  `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts:2151`.
- The file worker opens another connection and direct-mode index service at
  `apps/core-app/src/main/modules/box-tool/search-engine/workers/search-index-worker.ts:293`.
- Search index initialization has an `initialized` boolean but no single-flight
  promise at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:118`.
- The App indexed-source adapter waits for the complete provider scan before its
  first `yield` at
  `apps/core-app/src/main/modules/box-tool/search-engine/app-indexed-source.ts:48`.
- FileProvider accumulates all scan batches and waits for worker drain before
  returning at
  `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:1413`;
  `file-indexed-source.ts:150` therefore cannot yield a first batch early.
- Search cache entries live for five seconds and are not invalidated by index
  mutations at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:82` and
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:659`.

## Requirements

- `IndexingRuntime` owns all shared FTS scan, watch, reconcile, clear, reset, and
  rebuild mutation requests.
- Extract a runtime-owned generic search-index writer from existing worker
  capabilities. It owns one SQLite connection, queue, drain state, and FTS DDL.
- The runtime store adapter sends all provider records/deltas to that writer.
- Main-process search readers may use a separate read connection only after the
  writer publishes durable schema readiness.
- FileProvider retains provider-local `files`, content, scan-progress, and
  related transactions but removes shared FTS side effects before emitting
  runtime records/deltas.
- AppProvider removes direct shared FTS writes and uses its existing runtime
  records/deltas.
- Initialization is single-flight. Normal readiness checks are non-destructive;
  DDL repair/rebuild/migration is explicit and writer-owned.
- Add source-scoped writer selection for migration. One mutation uses exactly one
  writer; dual write is never a fallback or steady state.
- Capture write origin, duplicate attempts, busy/retry, queue depth, drain,
  checkpoint, and parity evidence before legacy removal.
- Database checkpoint coordination depends on the writer interface, not
  FileProvider worker internals.
- App/File indexed sources stream a batch immediately after its provider-local
  transaction commits; adapters must not retain all first-run batches until
  terminal drain.
- The writer commits bounded batches independently and advances a monotonic
  generation per source only after the batch is readable by search connections.
- Search cache lookup is generation-aware or receives precise source
  invalidation, so a post-commit query cannot return a pre-commit empty snapshot.
- The writer publishes a generic committed-generation signal. File/App progress
  events remain diagnostics and are not used as data-visibility signals.

## Acceptance Criteria

- [x] Instrumentation and invariant tests observe exactly one FTS mutation origin
  per provider/item mutation.
- [x] App scan/watch/reconcile paths use runtime writer only with result parity.
- [x] File scan/watch/reconcile/cleanup/reset paths use runtime writer only while
      provider-local durable tables remain correct.
- [x] Concurrent reader/writer startup performs FTS readiness/DDL once and no
      normal read path can trigger destructive repair.
- [x] Database checkpoint waits on the shared writer drain contract and imports
      no FileProvider implementation detail.
- [x] Source-scoped rollback switches one source to the previous writer, runs a
      reconcile, and never enables both writers.
- [x] Copy-based migration preflight/simulation, focused tests, type-check, and
  packaged indexing diagnostics pass. Real-profile query-only/copy evidence and
  isolated packaged maintenance scan both passed on 2026-07-18; the source DB
  checksum remained unchanged and legacy `file_fts` retained.
- [x] Legacy `file_fts` retain policy is unchanged.
- [x] App and File first-run contract tests keep the scan unfinished while a
      concurrent reader observes an earlier committed matching batch.
- [x] Repeating an identical query after a generation advance cannot hit the
      pre-commit cache entry.

## Out of Scope

- Migrating or deleting legacy `file_fts`.
- Adding new indexed sources or finishing Quicklinks/Browser Bookmarks products.
- Provider lifecycle registry consolidation.
- Search relevance/ranking changes.
- Renderer refresh/session transport implementation, owned by
  `07-09-scope-search-sessions-and-streams`; this task owns the committed-batch
  and generation contract it consumes.
