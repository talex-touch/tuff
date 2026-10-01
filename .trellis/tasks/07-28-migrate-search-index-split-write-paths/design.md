# Design: search-index split write-path migration

> **对账更正(2026-09-29).** 本文件的「Migration map」写于 `cd39bdbf6` 之前,其行号与两处核心结论**已经
> 与 master 不符**:`runAppTransaction` 从未迁移、且**不应**迁移(应用目录有意留在主库);`withDbWrite`
> 这个 API 在 `file-provider.ts` 里已不存在;`embedding-service.ts` 的 `addEmbedding` 也已改名。下面的
> 「Reconciled writer inventory」是按当前工作树逐条核对的清单,原文保留在末尾以便审计这次更正。
> 发布门(隔离 CoreApp 实跑)不变,现在由 `scripts/search-split-app-evidence.ts` 承载。

## Safety invariant

`database.db` and `search-index.db` each have one writer connection. `DB_SEARCH_SPLIT_ENABLED` /
`TUFF_DB_SEARCH_SPLIT_ENABLED` defaults **on** since `cd39bdbf6` (2026-08-05); `=0` is the emergency
rollback to the shared-file topology. The silent-data-loss mode this section originally guarded —
providers writing `database.db` while readers use `search-index.db` — was the half-migrated state;
the 2d.3 write-path migration landed with the flip, so the invariant now reads: every writer below
must hold under the default split, and the `=0` path must stay intact as the way back.

The worker enforces its half of that invariant itself: `SearchIndexWriter.initialize` marks the
writer `failed` on a bad `search-index.db` and every subsequent write throws through
`waitUntilReady()` — deliberately with **no** fallback to opening `database.db`
(`search-index-writer.ts:276-284`), because a second writer on the primary would recreate the
dual-writer contention the split exists to remove (#295).

## Existing boundary

- `DatabaseModule` owns the `search-index.db` lifecycle (`isSearchSplitEnabled()` at
  `modules/database/index.ts:136-138`, `initSearchDatabase` returning early when the split is off at
  `:1147-1150`) and returns primary-db fallbacks when it is off. A failed `search-index.db` init logs
  `Search index database initialization failed; falling back to primary DB` and degrades to the
  shared topology — that warning is the signal the harness fails on.
- The worker protocol supplies `ExecWriteMessage` / `ExecWriteResult`, `handleExecWrite`, and
  `SearchIndexWorkerClient.execWrite()`.
- `SearchIndexWriter.execWrite()` passes exact SQL through the admission gate;
  `getFilePersistencePort()` exposes `waitUntilReady()` plus the typed persistence API
  (`search-index-writer.ts:186-258`).
- `createDbUtils(db, auxDb, split?)` routes file-index reads to `readDb` and writes through
  `writer.execWrite(...)` when given split context (`db/utils.ts:76-93`, `:860-865`).
- Provider startup ordering is part of the sole-writer boundary and is wired structurally:
  `SearchEngineCore` awaits `searchIndexWriter.initialize(databaseModule.getSearchDatabaseFilePath())`
  inside `beforeProvidersLoad` (`search-core.ts:329-336`), so no provider load can precede writer
  admission. A provider that still tries is refused — `ensureSearchIndexWorkerReady()` warns
  `File persistence port operation skipped: {port,readiness} unavailable`
  (`file-provider.ts:1283-1298`) and the caller throws `FILE_PERSISTENCE_PORT_UNAVAILABLE`. Nothing
  in that path falls back to the primary `db`.

## Reconciled writer inventory (2026-09-29, verified against the working tree)

`check:search-index-writers` is the static half of this table: it fails the build if a
`files` / `fileExtensions` / `keywordMappings` mutation appears outside the approved owners.

| # | site (current lines) | writes | connection | state |
|---|----------------------|--------|------------|-------|
| 1 | `app-provider.ts:486-502` `runAppTransaction`, callers `528, 618, 1428, 1497, 2863, 2967, 2998, 3366, 4093, 4436`; `executeAppBatch:504-509`; direct batches `1445-1466, 1503-1512, 4428-4434` | app catalog `files` (`type='app'`) + `file_extensions` | primary `db` | **correct as-is.** Intentional ownership boundary, documented at `app-provider.ts:773-784`: passing the split context here (`c86d82db5`) routed catalog reads to the empty search file while the raw transactions stayed on the primary, so the record-batch builder found zero apps (V1 ship-blocker #3). The catalog is user data and must not move into the rebuildable search file. |
| 2 | `app-provider.ts:784` `createDbUtils(getDb())` | catalog reads | primary `db` | **correct as-is**, same reason. |
| 3 | `file-provider.ts:2545-2549` `onLoad`, `:2888-2895` recovery | file index reads/writes | split context `{enabled, searchDb, writer}` | migrated |
| 4 | `file-provider.ts:3626-3660` incremental insert | `files` | worker `upsertFiles` via the persistence port when split; primary transaction at `3663-3680` when off | migrated, both branches explicit |
| 5 | `file-provider.ts:3522-3547` reconcile delete | `files` + embeddings | `execSearchIndexFileDeletes` when split; primary `scheduleDbWrite` at `3538-3542` when off | migrated |
| 6 | `file-provider.ts:1779-1805` path normalization | `files.path` | worker `execWrite` when split; scheduled primary write when off | migrated |
| 7 | `file-provider.ts:1725-1735`, `1824-1834` | config / normalization version | primary `db` | not search-index data (config tables) |
| 8 | `file-provider.ts:3188-3217`, `3287-3290` | reconciliation temp state | `getFileIndexReadDb()` → `temp` schema | connection-local scratch, not persisted index data |
| 9 | `file-provider.ts:1940-1943`, `:3638` | `files` upserts | worker persistence port | migrated |
| 10 | `embedding-service.ts:68-89` `runWrite`, `:123` `indexFile`, `:215-229` removal | `embeddings` | `execWrite` when split, queued primary write when off; constructed only at `file-provider.ts:2559-2564` | migrated. No `dbUtils.addEmbedding` caller remains — only the definition at `db/utils.ts:461-463`. |
| 11 | `search-core.ts:2111-2115` | search engine `dbUtils` | split context | migrated |
| 12 | `search-core.ts:2181-2182` | recommendation engine app-catalog reads | primary only | correct as-is (catalog does not move) |
| 13 | extension writers reached through injected service callbacks: asset `402-425`, opener `277-282`, icon cache `23-25`, icon migration `94-96` | `file_extensions` | split-aware `DbUtils` | migrated via #1/#3 wiring |
| 14 | scan-progress reset: service `337-345`, runtime reset `114-130` | `scan_progress` | `execSearchIndexWrite` when split (fails closed if the writer is absent) | migrated |

### Claims in the original map that are now wrong

- `app-provider.ts:607` "pass `{enabled, searchDb, writer}`" — wrong twice: the call is at
  `:784`, and the context is deliberately *not* passed.
- `app-provider.ts:460` `runAppTransaction` "cannot merely use `getSearchDb()`" — the premise is
  void: those transactions write the app catalog, which stays on the primary.
- The 13 app-provider line numbers (`1288 … 3831`) and the 9 file-provider line numbers
  (`2619 … 3330`) no longer identify the sites they were listed for.
- `file-provider.ts:438` `withDbWrite` — no such method exists. The name now appears only as three
  injected callbacks (`:569-570, :603-604, :621-622`) that route through split-aware `DbUtils` or
  `scheduleDbWrite`.
- `embedding-service.ts:106` `addEmbedding` — the method was removed/renamed; the writer is
  `indexFile` → `runWrite`.
- `file-provider.ts:1822` / `:2257` provider split context — current calls are `:2545` and `:2888`.

### Residual candidates that were checked and cleared

A first pass flagged `file-provider.ts:3538-3542` (reconciliation deletion) and `3655-3680`
(incremental insertion fallback) as unguarded primary writes. They are not: both sit *after* a
`if (this.isSearchSplitEnabledNow()) { …; return }` branch, i.e. they are the flag-off path that R1
requires to stay intact.

## Runtime acceptance and rollback

The assertions live in one harness, `apps/core-app/scripts/search-split-app-evidence.ts`, with the
row-by-row matrix in this task's `acceptance.md`. It launches CoreApp three times against a
disposable profile under a temp root (never the real profile, which it refuses by path), arms
AFTER-triggers in `database.db` as a positive detector for forbidden writes, and measures both
files directly:

1. **bootstrap** — fresh profile, split flag *unset*: proves the default is on, the worker file was
   created and populated, and an absent `search-index.db` triggered a full reindex.
2. **split** — same profile, flag still unset, detector armed: topology (`judgeTopology(…, 'split')`),
   zero sentinel hits, no fallback warning, no pre-ready provider write, no busy storm.
3. **rollback** — `TUFF_DB_SEARCH_SPLIT_ENABLED=0`: the primary carries the index again, the retired
   search file stopped changing, the sentinel fires (positive control), and count/query parity holds
   against the split phase.

Parity is measured between **live homes**, not between the union of both files. The union is wrong
in exactly this direction: a data-preserving rollback leaves the rows the worker wrote in the
retired `search-index.db`, so counting both files double-counts and reports parity while the primary
index is empty. `compareParity` in the standalone verifier took `expect` for this reason
(2026-09-29).

Rollback itself is still a data-preserving state transition, not merely a flag flip: quiesce every
search-index writer, reconcile or rebuild the worker-owned index into `database.db` (or restore one
consistent snapshot), set `TUFF_DB_SEARCH_SPLIT_ENABLED=0`, restart CoreApp, and compare
application/file counts plus representative query results. The harness proves the rebuild variant —
the index is derived data and the app rebuilds it from the same roots — and it asserts the stale
rows are left in place rather than silently deleted. If reconciliation or parity cannot be proved,
restore the snapshot and keep the release blocked. Do not delete primary tables until all
migrations and app-run evidence pass; the `=0` path is the way back and must stay intact.

## Superseded original map (kept for audit)

### 2d.1 Provider split context

- `app-provider.ts:607`: pass `{ enabled, searchDb, writer }` … *(superseded: see #1/#2 above)*
- `file-provider.ts:1822` and `file-provider.ts:2257`: pass equivalent context … *(superseded: #3)*
- Wire the context only after writer readiness is established. *(still required, and satisfied
  structurally by `search-core.ts:329-336`)*

### 2d.2 App provider transactions

`runAppTransaction(db, op)` at `app-provider.ts:460` … named sites **1288, 1911, 1979, 2435, 2510,
2545, 2650, 2674, 2788, 3497, 3787, 3809, 3831**. *(superseded: #1 — these sites are the app
catalog and no longer need migrating; every listed line number is stale)*

### 2d.3 File provider writes

`withDbWrite` at `file-provider.ts:438` … named sites **2619, 2638, 2697, 2817 (delete), 2828
(delete), 2851 (delete), 2938 (insert), 3226 (update), 3330 (extension upsert)**. *(superseded: #4-#9
— no `withDbWrite` API exists; the scheduled-write call sites are the flag-off branches)*

### 2e Remaining ownership and startup

Route `embedding-service.ts:106` `addEmbedding` callers through the worker; ensure an empty
`search-index.db` triggers a full rescan. *(first half superseded: #10; the rescan exists at
`services/file-provider-bootstrap-reindex.ts` and is now asserted by the harness' `bootstrap`
phase)*
