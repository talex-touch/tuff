# TODO — `search-index.db` split: remaining write-path migration (issue #295)

The search-index worker gets its **own** sqlite file so `database.db` and
`search-index.db` each have a single writer connection and never contend for the
WAL writer lock. Gated behind `DB_SEARCH_SPLIT_ENABLED`
(env `TUFF_DB_SEARCH_SPLIT_ENABLED`, default **off**, `apps/core-app/src/main/db/runtime-flags.ts`).

## Done & verified — "B" (flag-OFF byte-identical, typecheck + tests green, mergeable now)

- **P0 stop-gap** — asymmetric `busy_timeout` (main-thread 2s, worker 30s) + routed `TimeStatsAggregator` / config-persist through `dbWriteScheduler`.
- **P1 foundation** — `search-index.db` lifecycle in `DatabaseModule`: `initSearchDatabase()`, `getSearchClient()/getSearchDb()/getSearchDatabaseFilePath()` (all fall back to the primary db when off), integrity + shutdown handling.
- **Step 1** — worker opens `getSearchDatabaseFilePath()` (`search-core.ts:243`); reader-mode `SearchIndexService` reads `getSearchDb()` (`search-core.ts:1829`).
- **2a** — generic `execWrite` protocol: `ExecWriteMessage`/`ExecWriteResult` (worker-types), `handleExecWrite` running forwarded `{sql,args}[]` on the worker's connection (`single`/`transaction`), `SearchIndexWorkerClient.execWrite()`.
- **2b** — `SearchIndexWriter.execWrite()` passthrough (via admission gate).
- **2c** — split-aware `dbUtils`: `createDbUtils(db, auxDb, split?)` with `DbUtilsSplitContext {enabled, searchDb, writer}`; file-index **reads** → `readDb`, file-index **writes** → `runWrite` (`query.toSQL()` → `writer.execWrite(...)`). Wired at `search-core.ts:1824`.

> **The flag must stay OFF until 2d + 2e land and are app-tested** — enabling it now writes provider data to `database.db` while reads come from `search-index.db` → silent data loss.

## 2d — Remaining (the write-path "sole-writer" migration)

Failure mode is **silent data loss**: any provider write left on the main-thread
`db` lands in `database.db` while reads come from `search-index.db`. Every site
below must be verified with an **app run** (flag ON), not just typecheck.

### 2d.1 — Pass the split context to the provider `dbUtils`
- `app-provider.ts:607` `createDbUtils(context.databaseManager.getDb())` → add `{ enabled: databaseManager.isSearchSplitEnabled(), searchDb: databaseManager.getSearchDb(), writer: searchIndexWriter }`. **`app-provider` does not import `searchIndexWriter` yet** — add the import.
- `file-provider.ts:1822` and `file-provider.ts:2257` — same. (file-provider already holds a `filePersistencePort`.)

### 2d.2 — app-provider `runAppTransaction` sites → worker high-level API (~15)
`runAppTransaction(db, op)` (`app-provider.ts:460`) runs an arbitrary drizzle tx
on the main-thread `db`. Cannot swap to `getSearchDb()` (would make the main
thread a 2nd writer on `search-index.db`) and cannot generically forward the
callback (each does insert-file → `.returning().id` → write-extensions-with-id,
e.g. `app-provider.ts:1911-1935` → `syncScannedAppExtensions(insertedFile.id, ...)`).

Convert each, only when split ON, to the worker's `FilePersistencePort`
(`searchIndexWriter.getFilePersistencePort()`), which does the id chain atomically:
- **insert/update file + extensions** → `upsertFiles([{ ...file, extensions }])` (see `UpsertFileRecord` in `file-index-persistence-repository.ts`; replicate the `syncScannedAppExtensions` extension mapping).
- **delete file** → `removeFile(path)`; **clear provider** → `removeByProvider(sourceId)`.

Sites: `app-provider.ts` lines **1288, 1911, 1979, 2435, 2510, 2545(del), 2650, 2674, 2788(del), 3497(del), 3787, 3809, 3831(del)** (+ `2788` uses `this.dbUtils!.getDb()`).

### 2d.3 — file-provider `withDbWrite` sites → worker API (~10)
`withDbWrite` (`file-provider.ts:438`) just schedules the op. Route the file-index
writes inside each to the worker (`filePersistencePort`): inserts/updates →
`upsertFiles`/`persistEntries`; deletes → `removeFile`; scan-progress →
`upsertScanProgress`. Sites: `file-provider.ts` **2619, 2638, 2697, 2817(del), 2828(del), 2851(del), 2938(ins), 3226(upd), 3330(ext upsert)** + the file-provider services (opener/icon-cache/asset scan-progress/runtime-reset) that call `dbUtils.addFileExtensions`/`removeFile*` (already routed once 2d.1 wires their split ctx).

### 2d — IMPLEMENTATION NOTE (worker API gap — read before converting sites)
`filePersistencePort.upsertFiles(records)` writes ONLY the `files` table with a
FIXED conflict set (name/extension/size/mtime/ctime/lastIndexedAt/isDir/type) — it
does NOT set `displayName` and does NOT write `file_extensions`. app-provider's
writes are bespoke: they set `displayName`, use per-site `onConflictDoUpdate` sets,
and write extensions via a dependent `syncScannedAppExtensions(insertedFile.id, app,
extensionWriter)`. So `upsertFiles` is NOT a drop-in — a naive swap silently drops
displayName + extensions.

**Recommended approach — `execWrite` forwarding (correct-by-construction, same SQL):**
route each raw write through the worker's generic `execWrite` (2a) so the EXACT
drizzle query runs on the worker's connection. Two options:
1. **Per-site branch** (explicit): `if (split) { const [row] = (await
   searchIndexWriter.execWrite([{ sql, args }]))[0]?.rows ?? []; const id = row.id;
   /* forward the extension inserts too */ } else { existing runAppTransaction }`.
   `row.id` works (uncoerced int, column `id`). Loses per-app atomicity (file +
   extensions become separate execWrites) — acceptable (re-indexable).
2. **Forwarding proxy in `runAppTransaction`** (collapses all ~15 sites into ONE
   change): when split, hand `operation(writer, extWriter)` a Proxy over
   `db.insert/update/delete(table)` whose chainable methods forward to the real
   builder and whose `.then` runs `execWrite([builder.toSQL()])`. Risk: must cover
   every drizzle method the sites use (incl. any `.select()` reads inside a tx →
   route to `searchDb`); fragile — verify method coverage, app-test hard.

Do NOT put the forwarder in `db/utils` (tests widely `vi.mock` it — see the 2d.1
lesson); keep it provider-local. Whichever option, gate on split-enabled and keep
the flag-OFF path byte-identical.

### 2e — embeddings, first-launch reindex, orphan cleanup
- **embeddings** — worker `persistChunk` already writes `files`+`embeddings`+`file_index_progress` atomically; `dbUtils.addEmbedding` is routed by 2c, but repoint the other main-thread embedding writer `embedding-service.ts:106` (and any `db/utils.addEmbedding` callers) through the worker so `embeddings` stays single-writer in `search-index.db`.
- **first-launch reindex** — on first launch with the split enabled, `search-index.db` is empty; ensure the providers trigger a **full rescan/reindex** (verify the existing "index empty → rescan" trigger fires; force it if needed).
- **orphan cleanup** — the moved tables (`files`, `file_extensions`, `search_index`, `keyword_mappings`, `scan_progress`, `file_index_progress`, `embeddings`, FTS) still exist (empty/stale) in `database.db`. Optionally `DROP` them once the split is validated to reclaim space.

## Test plan (app-run, flag ON)
1. `TUFF_DB_SEARCH_SPLIT_ENABLED=true pnpm core:dev`.
2. Confirm `search-index.db` is created and populated; `database.db-wal` stops growing from worker writes.
3. First launch triggers a full reindex; search returns correct results (apps + files).
4. Compare file/app counts before/after (flag off vs on) — **must match** (no silent loss).
5. Watch logs: no `SQLITE_BUSY` storm, no `Perf:EventLoop` stalls during indexing.
6. Toggle flag off again → app still works on `database.db` (rollback path).

## Risks
- **Silent data loss** if any of the ~25 sites is missed or mis-mapped — hence per-site app-testing.
- **Read-after-write** across the two connections — always `await` the worker ack (post-commit) before a dependent read.
- **Worker readiness** — provider writes must not run before `searchIndexWriter` init; `withAdmission` guards this but verify ordering.
