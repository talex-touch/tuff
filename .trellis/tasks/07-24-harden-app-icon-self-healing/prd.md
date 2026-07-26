# 应用图标自愈与数据库句柄加固

## Goal

CoreBox must render cached application icons immediately and recover missing icons without depending on a fully successful startup index pass. Eliminate the local libSQL transaction-handle pressure that repeatedly causes `SQLITE_BUSY`, so this icon/indexing path can be treated as frozen after the task.

## Confirmed Background

- Beta `2.4.13-beta.22` scanned 145 macOS applications in 295 ms; scanning is not the latency source.
- The real profile contained 249 app rows: 174 icon extensions referenced deleted `/var/folders/...` cache paths, 75 were empty, and 0 referenced the current cache root.
- CoreBox correctly mapped those missing paths to `i-ri-apps-line`; the visible command glyph is a terminal fallback, not a loading state.
- `app-provider.backfill-add` exhausted `SQLITE_BUSY` retries before metadata correction and `scheduleAppIconHydration()` ran.
- `@libsql/client@0.17.4` local transactions retain one native database handle per transaction until V8 GC because prepared statements own the detached connection. A controlled 200-transaction reproduction measured `1 -> 200`; explicit transaction `close()` and native database `close()` cannot finalize those statements. The real Tuff process held 486 handles to `database.db`, so high-cardinality per-app transactions are forbidden rather than hidden behind an incomplete dependency patch or global GC.
- The current cache key is deterministic from platform cache version plus `bundleId || appPath`, but recommendation mapping only attempts old-path filename migration.

## Requirements

### R1 — Immediate identity-based cache recovery

- One shared cache-key function must own the versioned application icon path for `IconService`, scanners, and recommendation mapping.
- If the persisted icon is empty or missing, app recommendations must resolve the current cache path from `app path + bundleId` before using the class fallback.
- Cache lookup must remain local, synchronous, bounded to the app result being mapped, and must not invoke Electron native icon extraction.

### R2 — Bounded transactional ownership

- AppProvider startup/full-sync additions, metadata corrections, and icon persistence must use a bounded number of phase transactions independent of app count; one native transaction per app is prohibited.
- File rows and their extension rows remain atomic within each phase. No renderer-side database access or second source of truth is allowed.
- Dependency monkey-patches and forced `global.gc()` are prohibited: the durable application-level fix is to remove high-cardinality transaction creation and keep the remaining low-frequency transaction count bounded.

### R3 — Icon hydration independent of index success

- A completed platform scan must start cache hydration even when app additions or metadata persistence later fail.
- Hydration must extract/dedupe outside a database transaction, persist resolved icon extensions in a bounded batch, and publish runtime updates only from the owning AppProvider boundary.
- Database-busy persistence failure receives bounded delayed retries. Cache extraction success remains usable through R1 while persistence retries.
- Shutdown drains or cancels hydration/retry work; no unbounded timer or orphan mutation may remain.

### R4 — Failure isolation and truthful retry

- One malformed app must not prevent unrelated app metadata/icon repair. Database-wide failures must fail the batch and retry; record-specific failures must be counted and skipped explicitly.
- The initial indexed-source scan must not silently convert a failed AppProvider scan into terminal success. Retry must be bounded and observable.
- Existing Darwin 27 `app.getFileIcon` fail-closed behavior remains unchanged; no synchronous scanner extraction and no native fallback reintroduction.

## Acceptance Criteria

- [x] With the captured stale-profile shape, cached Chrome, DingTalk, PixPin, and Preview icons resolve on the first CoreBox query without waiting for DB repair (real-profile packaged DOM + screenshot, all four `tfile://.../Library/Caches/app-icons/darwin/...`).
- [x] A successful repair leaves no app icon extension under `/var/folders/...`; valid icons point to the current versioned cache and unresolved apps use the existing fallback (real profile `41 -> 0` stale pointers; 134 current-cache pointers).
- [x] Startup/full-sync transaction count is independent of app count and the post-backfill database-handle delta stays within the documented constant bound without `global.gc()` (module-client `db.batch`; final real-profile cold start held 11 main DB descriptors versus the captured 486).
- [x] Injected `SQLITE_BUSY` during app-row persistence does not prevent a subsequent CoreBox cache-backed query; the write exhausted its bounded retry with an explicit retryable result and succeeded after lock release.
- [x] Repeated cold starts keep database handles and RSS bounded and produce no natural `DATABASE_BUSY_RETRY_EXHAUSTED` for AppProvider (isolated runs: 510-534 MB RSS, 11 descriptors; final real-profile run: 515 MB RSS, 11 descriptors).
- [x] Existing icon cache, drift, recommendation, AppProvider, platform scanner, database retry/scheduler/recovery, and indexing-runtime contracts remain green (69 icon/AppProvider tests + 22 Darwin/Windows scanner tests + 9 metadata tests + 17 DB tests + 120 Runtime/SearchCore tests; node typecheck, focused ESLint, and production build pass).
- [x] Real-profile packaged smoke shows genuine cache-backed application icons, no `EXC_BREAKPOINT`/`SIGTRAP`, and no generic fallback for Chrome, DingTalk, PixPin, or Preview.
- [ ] An official-attested N+1 release repeats the real-profile smoke with native trust `pass`; local packaging is explicitly unsigned (`signing-key-unavailable`) and cannot supply release evidence.

## Constraints / Out of Scope

- Do not redesign CoreBox cards, fallback visuals, recommendation ranking, or plugin icons.
- Do not clear or recreate the user database as the fix.
- Do not call `app.getFileIcon` on Darwin 27 or move native extraction back into scanners/renderers.
- Do not replace SQLite as the business source of truth or undertake the wider search-index split migration in this task.
- No unbounded retries, global GC dependency, administrator prompt, or compatibility shim.
