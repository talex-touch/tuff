# Single Search-Index Writer — Design

## Intent

Make `IndexingRuntime` the only semantic entry point for shared `search_index`,
`search_index_meta`, and `keyword_mappings` mutations. One runtime-owned worker
connection owns the physical FTS queue and runtime DDL preparation. AppProvider
and FileProvider keep their provider-local tables and transactions, but they no
longer mutate shared search-index tables directly.

This cutover does not migrate, rebuild, or delete legacy `file_fts`, and it does
not open a real user profile during implementation or verification.

## Invariants

1. A provider-local commit emits one runtime batch/delta; that mutation reaches
   exactly one selected physical writer.
2. Only `SearchIndexWriter` constructs `SearchIndexWorkerClient`. The worker is
   the normal physical owner of shared FTS writes and runtime schema preparation.
3. Provider code receives only a narrow local-persistence port. It cannot call
   shared FTS index/remove/clear methods.
4. `IndexingRuntime` owns scan, watch, reconcile, cleanup, clear, reset, and
   rebuild semantics. Source rollback changes the physical writer selected by
   the runtime path; it never restores provider-side dual writes.
5. Normal reader/writer readiness is single-flight and non-destructive.
   Drop/recreate/repair is an explicit writer maintenance operation.
6. A source generation advances only after the worker transaction commits and a
   main read connection observes the mutation. Cache lookup cannot return an
   entry created before the current committed revision.
7. App/File scan adapters yield committed batches while the provider scan is
   still running. They do not retain the complete first-run scan in memory.
8. Database checkpoint coordination depends on the shared writer drain/status
   contract, never on FileProvider internals.
9. `file_fts` retain-unchanged policy remains intact.

## Current Overlap To Remove

```text
AppProvider local DB -> AppIndexRecordSyncService -> main SearchIndexService
                     -> IndexedSource batch/delta -> IndexingRuntime -> main SearchIndexService

FileProvider local DB/content/progress -> SearchIndexWorker.persistAndIndex -> worker SearchIndexService
                                       -> IndexedSource batch/delta -> IndexingRuntime -> main SearchIndexService

DatabaseModule -> FileProvider.isSearchIndexWorkerBusy() -> WAL checkpoint
```

Both main and worker `SearchIndexService` instances can currently run DDL and
repair. `SearchIndexService.ensureInitialized()` is boolean-only and reachable
from normal reads.

## Target Ownership

```text
App/File provider-local transaction
  -> committed IndexedSource batch/delta
  -> IndexingRuntime
  -> SearchIndexStoreAdapter
  -> SourceScopedIndexWriterRouter (runtime | legacy, exactly one)
  -> SearchIndexWriter worker queue
  -> shared FTS transaction
  -> main-reader visibility barrier
  -> SearchIndexCommitHub source generation/revision
  -> SearchCore cache invalidation + renderer commit stream

DatabaseModule
  -> SearchIndexWriter status/drain contract
  -> WAL checkpoint
```

### Runtime Writer

Add `search-index-writer.ts` beside `search-index-service.ts`.

```ts
interface SearchIndexMutationWriter {
  prepare(): Promise<void>
  indexItems(sourceId: string, items: SearchIndexItem[], options?: { legacyItemIds?: readonly string[] }): Promise<WriterCommit>
  removeProviderItems(sourceId: string, itemIds: string[]): Promise<WriterCommit>
  clearSource(sourceId: string): Promise<WriterCommit>
  cleanupSource(sourceId: string): Promise<WriterCommit>
  drain(): Promise<SearchIndexWriterDrainSnapshot>
  getStatus(): SearchIndexWriterStatus
}

interface FilePersistenceEntry {
  fileId: number
  fileUpdate: FileContentPersistenceUpdate | null
  progress: FileIndexProgressUpdate
}

interface SearchIndexFilePersistencePort {
  persistEntries(entries: FilePersistenceEntry[]): Promise<PersistSummary>
  upsertFiles(records: UpsertFileRecord[]): Promise<Array<Record<string, unknown>>>
  upsertScanProgress(paths: string[], lastScanned: string, sourceId: string): Promise<number>
  removeFile(path: string): Promise<void>
  removeFileExtensions(fileId: number, keys: string[]): Promise<void>
}
```

`SearchIndexWriter` owns one `SearchIndexWorkerClient` and exposes the two narrow
ports above. `SearchIndexWorkerClient` remains an internal worker proxy. Its
`persistAndIndex` message is split into provider-local `persistEntries`; no local
persistence message may invoke `SearchIndexService.indexItems()` or publish a
search-index commit.

`FilePersistenceEntry` deliberately contains no `SearchIndexItem`, keywords,
aliases, or provider-search payload. After the local transaction resolves, the
FileProvider caller constructs the typed `IndexedSourceRecord` outside the local
port and hands it to the runtime path.

The worker queue remains serialized and uses the existing SQLite retry policy.
Writer evidence records low-sensitivity source id, mutation kind, selected
writer, item count, queue depth, duplicate-denied count, busy/retry delta, commit
duration, visibility wait, drain duration, and generation. It never records raw
paths, titles, content, queries, or item payloads.

### Indexed Record Parity Contract

`IndexedSourceRecord` gains an optional typed search projection rather than
encoding weighted terms in untyped metadata:

```ts
interface IndexedSourceSearchTerm {
  value: string
  priority: number
}

interface IndexedSourceSearchProjection {
  keywords?: IndexedSourceSearchTerm[]
  aliases?: IndexedSourceSearchTerm[]
  legacyItemIds?: string[]
}
```

The store adapter prefers this projection and preserves the existing string-only
`keywords` field as the base `1.1` case for other sources. App records carry the
current acronym/alias `1.5`, ordinary keyword `1.1`, tool-source tags, and legacy
ids. The selected writer removes legacy ids and upserts the canonical item as
one routed mutation so rollback and generation evidence observe one origin.

Bottom-layer `SearchIndexWorkerClient` and `SearchIndexService` never publish
commit generations. They return mutation results only. The selected writer port
is the sole publisher for both runtime and legacy modes, after its visibility
barrier succeeds.

### Runtime Source Gate, Selection, And Rollback

Physical selection still belongs to `SourceScopedIndexWriterRouter`, but the
exclusive switch gate belongs one layer higher in `IndexingRuntime`. The router
must not call back into the runtime.

`IndexingRuntime` owns a per-source mutation epoch gate:

- scan/watch/reconcile/cleanup/reset obtains a normal lease **before** invoking
  provider code and holds it through provider-local commit and store application;
- a source switch blocks new leases and waits, with a bounded timeout, for every
  prior epoch lease to finish;
- the switch drains the currently selected physical writer, changes one source
  mode atomically, clears that source on the newly selected writer, then performs
  an authoritative full snapshot scan under the exclusive lease;
- only after the snapshot, visibility barrier, generation publication, and drain
  succeed does the runtime release the source.

The authoritative rebuild uses `IndexedSourceScanReasons.SchemaMigration` and
must enumerate the provider-local source of truth even when no local rows changed.
It is not the current incremental App/File reconcile path. This repairs a local
commit whose earlier FTS application failed.

The router owns a mode per source:

- `runtime`: worker-backed `SearchIndexWriter` (normal production mode);
- `legacy`: the main `SearchIndexService` mutation port, retained only as a
  source-scoped rollback writer during parity verification.

Both modes are reached only from the runtime store. A mismatched epoch/mode is
rejected before SQL and counted. Default App/File mode changes to `runtime` only
in the same cutover that removes their direct FTS calls. No mutation is silently
retried through the other writer.

## Readiness And DDL

Refactor `SearchIndexService` initialization into a single-flight promise and
explicit modes:

- `verify`: read-only schema validation; used by the main search reader;
- `prepare`: writer-owned, idempotent compatibility DDL after resource migrations;
- `repair`: explicit maintenance only; the sole path allowed to drop/recreate
  FTS or shadow tables.

Normal `search`, lookup, count, and mutation methods await readiness but cannot
trigger `repair`. Metadata read errors fail closed instead of silently dropping
FTS tables. The worker finishes `prepare` before its ready promise resolves. The
main reader is created with the writer readiness gate and does not publish
commits or own DDL.

Resource migrations remain the durable schema source of truth. Runtime
`prepare` keeps the current `file_fts` compatibility creation policy but does not
migrate, clear, or delete its rows.

## Provider Cutover

### AppProvider

- Keep `files`, `fileExtensions`, managed-entry metadata, deletion grace, and
  provider transactions unchanged.
- Populate the typed search projection with the existing canonical id, weighted
  aliases/keywords, tool-source tags, and legacy ids; then delete
  `AppIndexRecordSyncService` direct SearchIndexService mutations.
- Emit an app record batch after each bounded set of provider-local commits.
  Startup/manual/full scans expose an async sequence rather than one terminal
  batch after the full backfill.
- Watch add/change/delete returns runtime deltas only after local commit.
- `SchemaMigration` scan enumerates the complete provider-local app snapshot.
  Writer switching clears and replays that snapshot; ordinary reconcile remains
  incremental and is not used as rollback repair.

### FileProvider

- Keep `files`, content, embeddings, `file_index_progress`, `scan_progress`,
  extensions/assets, watch-root state, and their transactions unchanged.
- Replace `persistAndIndex` with local-only `persistEntries`; publish the
  corresponding runtime record batch only after that local transaction commits.
- Remove provider calls to shared `removeProviderItems`, `removeByProvider`, and
  orphan-keyword cleanup. Delete/cleanup/reconcile emits runtime deltas; integrity
  cleanup and reset call explicit `IndexingRuntime` store operations.
- Convert the indexed-source scan bridge to a bounded async batch channel with
  backpressure, `AbortSignal`, explicit close/fail, and iterator `return()`
  cleanup. A store/consumer failure aborts the producer and awaits its settlement;
  callback errors must propagate instead of being converted to successful stats.
- Each local commit is immediately yieldable. Terminal `done` is emitted only
  after producer completion and runtime writer drain.
- `SchemaMigration` scan enumerates the complete provider-local file snapshot for
  writer switch/rebuild; it does not depend on incremental reconcile detecting a
  changed local row.

### Reset And Rebuild Ordering

Provider-local durable reset/rebuild executes first. Only after it succeeds may
`IndexingRuntime` clear/replay the selected shared writer. A local reset failure
therefore leaves the existing FTS snapshot intact and emits no generation. If
the later writer clear/replay fails, the source becomes degraded and the runtime
repairs it with the same authoritative snapshot flow; it never re-runs or rolls
back the already committed local reset implicitly.

## Committed Generations And Cache Coherence

Extend `SearchIndexCommitHub` to track a monotonic global revision and a
monotonic generation per source. The writer publishes only after:

1. the selected writer transaction succeeds;
2. the main read connection passes a bounded visibility barrier for the upsert,
   delete, or clear operation.

`SearchIndexWriter` (runtime mode) and the legacy writer adapter are the only
commit publishers. `SearchIndexWorkerClient` and `SearchIndexService.onCommitted`
publication is removed, preventing an early or duplicate generation before the
read barrier.

`CoreBoxSearchIndexCommitPayload` carries the changed source ids and their current
generations. Existing renderer refresh coalescing continues to use the global
revision.

`SearchCacheEntry` stores the commit revision observed when the entry was
created. A lookup with a different current revision is a miss even if the cache
map has not yet been cleared. The existing commit subscriber still clears the
map eagerly. This gives both explicit coherence and bounded memory cleanup.

## Checkpoint And Lifecycle

`DatabaseModule` imports the generic writer admission/drain interface instead of
FileProvider. Checkpoint uses one bounded `pauseAdmission -> drain -> checkpoint
-> resume` critical section. Pausing covers both shared-index mutation submissions
and the narrow provider-local worker port, so upstream file-index results may
queue outside the writer but cannot enter SQLite during the checkpoint. After
`dbWriteScheduler` admits the checkpoint callback, DatabaseModule revalidates the
same pause token and drain state before executing PRAGMA; `finally` always resumes
admission. A pause/drain timeout skips the checkpoint with a stable reason rather
than racing a new worker write.

Shutdown permanently closes admission, drains/settles accepted tasks, terminates
the worker, then tears down reader/provider state. Repeated prepare, pause, drain,
resume, and shutdown are idempotent.

## Failure Semantics

- Writer prepare/visibility failure: fail the runtime mutation; do not publish a
  generation or fall back to a second writer automatically.
- Provider-local failure: emit no runtime batch/delta for the failed transaction.
- Provider-local reset failure: retain shared FTS rows and emit no commit.
- Shared writer failure after local reset: mark degraded and require authoritative
  clear + snapshot repair; do not report the reset as fully successful.
- Runtime writer failure: retain source mode, surface degraded diagnostics, and
  require an explicit runtime-gated source switch plus full snapshot rebuild.
- Readiness metadata error: fail closed; only explicit repair may drop derived
  FTS tables.
- Drain timeout: checkpoint or terminal scan reports a stable failure reason;
  no infinite polling/retry.
- Duplicate/mismatched origin: reject before SQL and increment evidence.
- Scan channel cancellation/error: abort the producer, close or fail every waiter,
  await producer settlement, and publish no terminal generation for an unapplied batch.

## Rollout And Verification

1. Land writer/readiness/router contracts and evidence behind existing behavior.
2. Wire the runtime adapter and main reader to the writer; keep source selection
   on legacy until each provider direct path is removed.
3. Hard-cut App, then File, to runtime mode; run authoritative clear + full
   snapshot replay and parity after each.
4. Exercise runtime -> legacy -> runtime source switches on isolated fixtures,
   replaying an authoritative snapshot after every switch and proving no dual write.
5. Run copy-based FTS ownership simulation/preflight only on approved isolated
   fixtures. Do not access a real profile without separate destructive-operation
   approval.

Rollback never enables two writers. It switches one source through the router
and performs an authoritative clear + full snapshot replay. Legacy `file_fts` remains untouched throughout.
