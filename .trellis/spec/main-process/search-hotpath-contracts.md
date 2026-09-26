# Search Hot-Path Contracts (main process)

Source: task 08-05-search-hotpath-quadratic-fix (2026-08-05). These are executable
contracts for the per-keystroke CoreBox search path; violating them reintroduces the
quadratic-per-keystroke bug class this task removed.

## Scenario: code on the per-keystroke search path

CoreBox query → provider `onSearch` → candidate scoring → result build. Budget
context: `SLOW_PROCESS_THRESHOLD_MS = 300` (search-processing-service.ts), gather
fast layer 80ms.

## Contracts

### 1. Token dedup is O(1) per insert — all producers funnel through `addSearchToken`

`packages/utils/search/search-token-builder.ts` tracks dedup keys in a
`WeakMap<SearchTokenList, Set<string>>` seeded on first use. A direct `tokens.push`
after the first `addSearchToken` call bypasses dedup silently — never push token
lists directly; add tokens only via the `add*SearchTokens` helpers.

### 2. Per-app search derivation is memoized — the cache key MUST cover every input

`resolveAppSearchDerived` (search-processing-service.ts) memoizes semantic aliases,
tool-source ids, and `buildAppSearchTokens` output on a content fingerprint
(`buildAppSearchDerivedKey`). **Any new field that feeds catalog resolution or token
building must be added to the key** (exception: values derived from existing key
fields, e.g. `fileName`). A field feeding derivation but missing from the key is a
stale-cache bug: search results silently stop reflecting that field's changes.
User aliases (`setAliases`) flow in via `aliasList` — already keyed.

### 3. Cached arrays are shared references — consumers stay read-only

Cached `searchTokens`/`toolSourceIds` are attached to result items across
keystrokes. `matchFeature` copies tokens it returns (`normalizeSearchToken`) and
must stay non-mutating; no main-process code may write to
`item.meta.extension.searchTokens`. Cache is LRU-bounded
(`APP_SEARCH_DERIVED_CACHE_LIMIT = 512`).

### 4. Runtime index reads belong to the dedicated read worker

Local libSQL's Promise API executes native SQLite synchronously. `Promise.all`
does not move queries off Electron's main thread. Runtime SearchIndexService
receives a SearchIndexReadExecutor owned by SearchEngineCore; FTS, exact/prefix,
ngram/subsequence, counts and commit-visibility reads use that executor. Keep SQL
construction and result semantics in SearchIndexService, not a second worker query
implementation. Writer-side services retain their existing local connection.

The reader opens the same `getSearchDatabaseFilePath()` selected for the writer,
requires an existing regular database and enables `PRAGMA query_only`. It never
migrates, repairs or writes the index. Main still awaits writer readiness before
prewarming the reader; the visibility barrier observes commits on the read
connection. Never hold a long-lived read transaction across searches.

Each read lane owns a bounded queue and one physical native read at a time; since
2026-09-26 there are two lanes over the same worker script and file — `'deferred'`
(file provider, 15s) and `'fast'` (fast-layer providers, 3s) — so a slow file query
never queues an app lookup (see contract 7 below). Pass the
provider AbortSignal through every candidate lookup. A queued abort removes the
work; an active abort rejects its caller but retains the physical slot until the
worker replies or times out. Failure, premature exit, timeout and close settle
every pending caller without replay or a synchronous main-thread fallback. Core
closes both readers from its shutdown finally path, after normal writer drains.

### 5. Measure input delivery separately from SQL wall time

Short-lived search sessions use typed IPC by default, not a fresh MessagePort
handshake. Keep the 80ms input debounce and existing ranking policy independent
from that transport decision. SearchIndex duration includes readiness, queueing
and return scheduling; it is not isolated native SQL time. For runtime UI timing,
identify the owned native CoreBox window and its foreground state. Background
timer/animation-frame throttling must not be reported as foreground search latency.

The read-worker integration accepts `TUFF_SEARCH_READ_WORKER_TEST_PATH` for an
isolated build. On macOS canonicalize a temporary build root before electron-vite
build (`/var` can resolve to `/private/var`); relative asset locators otherwise
acquire the wrong parent depth. Use a script file rather than `node --input-type`
for ad-hoc native worker probes, whose child inherits Node loader arguments.

## Verification

```bash
cd packages/utils && npx vitest run                     # 979 tests
cd apps/core-app && npx vitest run src/main/modules/box-tool/addon/apps/
cd apps/core-app && npm run typecheck:node
```

Benchmark shape (throwaway vitest file, see task design.md): old-dedup replica vs
new at 150 apps × 200/400 tokens — measured 2026-08-05: old 1388→6006ms (4.33×,
quadratic), new 34→62ms (1.82×, linear); memoized `processSearchResults` over 150
rows: cold 21.6ms → warm 2.9ms with identical match sets.

## Contracts added 2026-09-26 (task 09-26-corebox-app-search-fast-lane)

Measured on a 9.2GB dev index (276k files, 156 apps): the app FTS lookup cost
0.4–0.5s because `search_index.provider` is UNINDEXED (MATCH scans the whole shared
table before the provider filter), and the single FIFO read worker made every fast
lookup wait behind the previous keystroke's file query. Apps therefore missed the
80ms fast window on every keystroke and arrived as a late batch.

### 6. App search issues no SQL on the keystroke path

`AppProvider.onSearch` recalls from `AppSearchCatalogService`
(`addon/apps/services/app-search-catalog-service.ts`) once it is ready; the SQL path
is the not-yet-loaded fallback only (`APP_SEARCH_MEMORY_PATH_ENABLED` is the kill
switch). The catalog reloads from the database (still the source of truth) on index
commits naming `app-provider`, alias edits (`AppUserAliasService.onChanged`),
icon-pointer repairs, and staleness. A write path that changes an app row without
ending in an index commit must call `searchCatalog.scheduleReload(reason)`; a reload
failure keeps the previous snapshot. The recall funnel mirrors the SQL one
(precise/phrase/prefix → FTS-shaped → n-gram → subsequence, same thresholds) and
`isFuzzySearch` keeps its meaning: no exact/phrase/prefix keyword hit.

### 7. Fast providers read through their own worker lane

`search-core.ts` builds two `SearchIndexReadWorkerClient`s over the same worker
script and database: lane `'deferred'` (15s timeout, the file provider) and lane
`'fast'` (`FAST_READ_LANE_TIMEOUT_MS = 3000`, handed to `priority === 'fast'`
providers through `SearchProviderRegistry` deps `getSearchIndexService(provider)`).
The fast `SearchIndexService` is reader-mode only: never pass it to
`LegacySearchIndexWriter` or the commit visibility barrier, and do not `preloadPinyin`
on it. Request ids carry the lane (`search-index-read-<lane>-<n>`), as does the
retire log.

### 8. Bulk index deletes are O(table) per row — budget them

`DELETE FROM search_index WHERE provider = ? AND item_id = ?` scans the FTS content
table on every call (both columns UNINDEXED): 500 rows ≈ 2 minutes on a 276k-row
index. `FileProviderCleanupDeleteService` therefore budgets stale-row removal
(`staleDeleteBudgetMs`, default 8s per pass) and logs what is left for the next boot;
do not add another unbounded per-row delete loop on the startup path. The fix that
lifts the budget is writer-side (delete by rowid via `search_index_meta`, or batch
`item_id IN (…)` per page).

### 9. Full scans checkpoint per top-level child

`FileProviderFullScanRunService` walks a root child by child and records each child in
`scan_progress` (`FileProviderFullScanCheckpointService`) before moving on; the root's
own files come last, and child records are cleared only after the root's record is
written. A restart resumes past completed children instead of rescanning `~` from
zero. Traversal exclusions apply at listing time, and `DEV_PATHS` are anchored to path
segments (`(^|/)out/`, not `out/`), with `~/go/pkg` and `~/OrbStack` excluded as
home-anchored toolchain caches.

### 10. Result rows obey the context-free directory rules at read time

`fileFilterService.filterSearchItems` (applied to every provider's batch in the gather)
also runs `getReadTimeDirectoryExclusionReason`: unconditional dev names anywhere on the
path (`node_modules`, dot directories), home-anchored toolchain caches and system
locations (minus `~/Library/Mobile Documents`, iCloud Drive). Context-dependent names
(`build`, `dist`, `out`, …) are a walker's decision and are not judged here. This is
what hides rows indexed under an older rule set while the budgeted cleanup (contract 8)
retires them; do not "fix" a stale-row sighting by widening the cleanup budget.
