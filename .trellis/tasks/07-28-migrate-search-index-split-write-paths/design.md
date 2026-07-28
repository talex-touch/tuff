# Design: search-index split write-path migration

## Safety invariant

`database.db` and `search-index.db` each have one writer connection. `DB_SEARCH_SPLIT_ENABLED` / `TUFF_DB_SEARCH_SPLIT_ENABLED` stays default **off** until every path below has flag-on application evidence. Turning it on earlier writes provider data to `database.db` while readers use `search-index.db`, causing **silent data loss**.

## Existing boundary

- `DatabaseModule` owns the `search-index.db` lifecycle and returns primary-db fallbacks when split is off.
- The worker protocol supplies `ExecWriteMessage` / `ExecWriteResult`, `handleExecWrite`, and `SearchIndexWorkerClient.execWrite()`.
- `SearchIndexWriter.execWrite()` passes exact SQL through the admission gate.
- `createDbUtils(db, auxDb, split?)` routes file-index reads to `readDb` and writes through `writer.execWrite(...)` when supplied split context.

## Migration map

### 2d.1 Provider split context

- `app-provider.ts:607`: pass `{ enabled: databaseManager.isSearchSplitEnabled(), searchDb: databaseManager.getSearchDb(), writer: searchIndexWriter }` to `createDbUtils`; add the currently missing writer import.
- `file-provider.ts:1822` and `file-provider.ts:2257`: pass equivalent context. The provider already has `filePersistencePort`.

### 2d.2 App provider transactions

`runAppTransaction(db, op)` at `app-provider.ts:460` executes arbitrary Drizzle transactions on the main-thread connection. It cannot merely use `getSearchDb()` and cannot blindly forward callbacks, because sites insert a file, require `.returning().id`, then write extensions.

Named sites: `app-provider.ts` lines **1288, 1911, 1979, 2435, 2510, 2545 (delete), 2650, 2674, 2788 (delete; uses `this.dbUtils!.getDb()`), 3497 (delete), 3787, 3809, 3831 (delete)**.

Preferred design: in a split-enabled branch, forward each exact Drizzle query with `execWrite([{ sql, args }])`, await the result, and forward dependent extension inserts. This preserves SQL semantics, though separate file/extension forwarding is re-indexable rather than fully atomic. A provider-local forwarding proxy is only acceptable after proving every builder method and any in-transaction reads are covered; do not put it in `db/utils` because its mocks are widespread.

### 2d.3 File provider writes

`withDbWrite` at `file-provider.ts:438` schedules but does not change connection ownership. Migrate its named sites **2619, 2638, 2697, 2817 (delete), 2828 (delete), 2851 (delete), 2938 (insert), 3226 (update), 3330 (extension upsert)** to the worker persistence API as appropriate:

- inserts/updates: `upsertFiles` or `persistEntries` only when their semantics match;
- deletes: `removeFile`;
- scan progress: `upsertScanProgress`;
- extension writers in opener/icon-cache/asset scan-progress/runtime-reset become safe after 2d.1 split context wiring.

`upsertFiles(records)` writes only `files` with a fixed conflict set and does **not** set `displayName` or write `file_extensions`; it is not a drop-in replacement for bespoke app-provider writes.

### 2e Remaining ownership and startup

- Route `embedding-service.ts:106` and all remaining main-thread `dbUtils.addEmbedding` callers through the worker; `persistChunk` already atomically writes files, embeddings, and file-index progress.
- On first launch with the split enabled, ensure empty `search-index.db` triggers a full provider rescan/reindex.
- Evaluate dropping stale moved tables from `database.db` only after split validation; this is optional reclamation, not a prerequisite for correctness.

## Runtime acceptance and rollback

Run `TUFF_DB_SEARCH_SPLIT_ENABLED=true pnpm core:dev` against a disposable profile. Confirm `search-index.db` is created and populated, first launch reindexes, apps/files search correctly, counts match flag-off, `database.db-wal` stops growing from worker writes, and logs show no busy storm or event-loop stall. Toggle the flag off again and confirm CoreApp returns to `database.db`.

Rollback is the default-off flag path. Do not enable the flag or delete primary tables until all migrations and app-run evidence pass.
