# Single Search-Index Writer — Implementation Plan

## Preconditions

- Parent: `07-09-audit-search-system-architecture`.
- Storage/onboarding admission gate is completed; automatic indexing remains
  fail-closed until onboarding is allowed.
- Request-scoped search sessions and progressive renderer refresh are completed
  and must remain green.
- No real-profile SQLite/FTS/schema operation is permitted in this task without a
  separate explicit confirmation. Implementation and smoke use mocks, temporary
  SQLite, or copy-based fixtures only.

## 1. Establish Writer, Readiness, And Evidence Contracts

- [x] Add `SearchIndexMutationWriter`, narrow file-persistence port, writer
      readiness/status/drain snapshots, mutation result, and low-sensitivity
      evidence types.
- [x] Keep every delete provider-scoped; expose no cross-provider `removeItems`
      mutation on the writer contract.
- [x] Add an `IndexingRuntime` source epoch gate that holds a normal lease across
      provider-local commit plus store apply, and an exclusive bounded switch
      lease for drain -> mode change -> authoritative clear/snapshot replay.
- [x] Add typed weighted keyword/alias/legacy-id search projection to
      `IndexedSourceRecord` and preserve existing string-keyword compatibility.
- [x] Make runtime/legacy writer ports the only commit-generation publishers;
      lower SearchIndexService/worker proxy layers return results only.
- [x] Make writer initialization, drain, and shutdown single-flight/idempotent.
- [x] Extend commit generations to track source generations plus global revision.

Implementation gate:

- contracts compile without changing provider behavior;
- no second `SearchIndexWorkerClient` construction is introduced;
- source selection tests prove one writer call per mutation and no dual fallback.

Rollback point: contracts are unused; remove them without changing runtime paths.

## 2. Make The Worker The Physical FTS/DDL Owner

- [x] Add runtime-owned `SearchIndexWriter` as the sole constructor/owner of
      `SearchIndexWorkerClient`.
- [x] Replace worker `persistAndIndex` with a provider-local DTO that contains no
      SearchIndexItem/keyword/alias payload; remove FTS mutation and commit
      publication from every local-persistence message.
- [x] Route runtime batch/delta/clear/cleanup through the writer worker queue.
- [x] Refactor `SearchIndexService` to single-flight `verify | prepare | repair`
      readiness. Normal reads validate only; destructive repair is explicit.
- [x] Configure the main SearchIndexService as reader/legacy rollback port behind
      writer readiness. Keep `file_fts` retain policy unchanged.
- [x] Publish a source generation only after worker commit and main-reader
      visibility barrier.

Implementation gate:

- run a temporary-SQLite smoke: prepare once, concurrent reader/writer readiness,
  bounded upsert/delete/clear visibility, drain, and repeated shutdown;
- prove normal reader calls execute no CREATE/DROP/repair SQL;
- prove provider-local persistence emits no search-index commit.

Rollback point: keep the router on legacy mode; do not run both physical writers.

## 3. Wire Runtime, Cache, And Checkpoint Ownership

- [x] Inject `SourceScopedIndexWriterRouter` into `SearchIndexStoreAdapter` while
      keeping source lease/switch ownership in `IndexingRuntime`; the router must
      never call back into runtime/provider code.
- [x] Store commit revision on search cache entries and reject pre-generation
      entries after a committed source generation advances.
- [x] Replace DatabaseModule's FileProvider dependency with writer admission
      pause + bounded drain + checkpoint + resume; recheck the same barrier after
      `dbWriteScheduler` admission so no write enters between drain and PRAGMA.
- [x] Move shared orphan-keyword/source cleanup behind an IndexingRuntime/store
      maintenance operation.
- [x] Add authoritative source rebuild: clear the newly selected writer and replay
      a complete `SchemaMigration` provider-local snapshot before releasing the switch.
- [x] Reorder reset/rebuild so provider-local durable reset succeeds before the
      runtime clears/replays shared FTS; mark degraded and repair authoritatively
      if the later writer phase fails.

Implementation gate:

- runtime scan/watch/reconcile/reset/clear paths each call one selected writer;
- an identical query after a generation advance misses the old cache entry;
- checkpoint tests depend only on the writer interface.
- local reset failure preserves FTS; writer failure after local reset becomes a
  degraded authoritative-repair state;

Rollback point: use the runtime exclusive switch gate to select legacy, clear it,
replay an authoritative snapshot, and retain generation diagnostics.

## 4. Cut AppProvider To Runtime-Only Shared Mutations

- [x] Preserve provider-local app/files/extensions/managed-entry/deletion state.
- [x] Add the typed weighted alias/keyword/tool-source/legacy-id projection to
      runtime App records and remove AppIndexRecordSyncService direct writes.
- [x] Emit bounded scan batches after provider-local commits instead of one batch
      after full backfill; emit reconcile/watch add/change/delete deltas after
      local commit.
- [x] Make `SchemaMigration` scan enumerate the complete provider-local snapshot.
- [x] Switch `app-provider` under the exclusive runtime gate and run isolated
      clear + full snapshot replay/parity.

Implementation gate:

- keep an App scan unfinished while the first committed batch is readable;
- app watch/reconcile/delete/rebuild each observe one runtime writer origin;
- result ids, aliases, keyword priority, tool-source tags, and enabled-state
  parity remain unchanged.

Rollback point: exclusively drain/switch only `app-provider`, clear the selected
writer, replay its full provider-local snapshot, and prove no dual write.

## 5. Cut FileProvider To Runtime-Only Shared Mutations

- [x] Preserve provider-local files/content/embeddings/progress/scan_progress/
      extension/asset transactions through the narrow persistence port.
- [x] Emit runtime batches/deltas only after local commit; remove direct shared
      FTS delete/clear/reset/cleanup/orphan-keyword calls from FileProvider.
- [x] Stream scan batches through a bounded abortable channel with backpressure,
      close/fail/iterator-return cleanup, producer settlement, and propagated
      callback/store errors; do not retain the complete first-run scan.
- [x] Route reconcile, watch, stale cleanup, integrity cleanup, reset, and rebuild
      through runtime store operations exactly once.
- [x] Switch `file-provider` under the exclusive runtime gate and run isolated
      clear + full snapshot replay/parity.

Implementation gate:

- keep a File scan unfinished while the first committed batch is readable;
- local files/content/progress rows remain correct when runtime FTS write fails;
- delete/cleanup/reset produce one FTS origin and retain source-scoped local data;
- drain timeout remains bounded and visible in durable task diagnostics.
- local persistence DTOs contain no shared FTS item and publish no generation;
- both local-reset failure and post-reset writer failure preserve declared ordering;
- provider-scoped delete tests prove identical item ids cannot cross sources.

Rollback point: exclusively drain/switch only `file-provider`, clear the selected
writer, replay its full provider-local snapshot, and prove no dual write. Never
migrate or delete `file_fts`.

## 6. Integrated Isolated Proof

- [x] Run focused writer/readiness/router/generation/cache/checkpoint tests.
- [x] Run IndexingRuntime/store/scan/watch/reconcile/reset tests.
- [x] Run AppProvider/App indexed-source parity and progressive-batch tests.
- [x] Run FileProvider worker/local-persistence/scan/reconcile/cleanup/reset/
      integrity parity and progressive-batch tests.
- [x] Run scoped ESLint plus CoreApp node/web type-checks and Vite build.
- [x] Run temporary/copy SQLite preflight and FTS ownership simulation; assert
      source snapshot unchanged and legacy `file_fts` untouched.
- [x] Run source rollback rehearsal runtime -> legacy -> runtime with an
      authoritative clear + full snapshot replay after each switch and exactly
      one mutation origin.
- [x] Source-search constructors and mutation calls to prove only the runtime
      writer owns worker construction/DDL and providers own no shared FTS method.

## 7. Parent And Roadmap Convergence

- [x] Check each PRD acceptance item against current evidence before marking it.
- [x] Update parent single-writer implementation/acceptance and R3 TODO evidence.
- [x] Update task metadata with final files, evidence, rollback state, and next
      action. Archive only after a user-directed work commit.

Final rollback rule: one source may select the legacy physical writer and
reconcile. Provider-side dual writes, automatic fallback, normal-read repair, or
mixed runtime/legacy writes for one mutation are forbidden.
