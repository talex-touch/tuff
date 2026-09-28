# Verification — 2026-09-26 (session talex-touch-31 took the task over)

## Native crash delivery round-trip (items 10–11), isolated instance

Isolated profile: `TUFF_STARTUP_BENCHMARK_USER_DATA_DIR=/tmp/tuff-iso-1964/userData`, synthetic root
`TUFF_FILE_PROVIDER_BASE_WATCH_PATHS=/tmp/tuff-100k/tree`, launched from `apps/core-app` with the
dev `out/main/index.js` build and `ELECTRON_RENDERER_URL=http://127.0.0.1:5173`, CDP port 9334.
The real profile and the boss's running app were not touched.

1. Boot: `Native crash delivery discovery completed phase=idle pending=0`, `Sentry initialized environment=development`.
2. `kill -SEGV <pid>` at 15:24:43 → Crashpad wrote `logs/crashes/pending/b58d3ef3-….dmp` (crashDumps is `logs/crashes` per precore.ts).
3. Relaunch at 15:25:19: `discovery completed phase=discovered pending=1` → `Native crash minidump parsed phase=parsed` (15:25:19.350) → `Native crash event transport completed phase=sent statusCode=200` (15:25:20.374). `pending/` and `completed/` empty afterwards.
4. Independent receipt (Sentry API, org `quotawish`, project `tuff`): event `a66f76b63f954801b5134c9dbf249d61`, platform `native`, mechanism `minidump`, environment `development`, release `2.4.14-beta.41@release`, title `base::MessagePumpNSApplication::DoRun`, group `7755932277`.

Both instances were stopped; total lifetime of the isolated app ≈ 3 minutes. Note: it registered the same global shortcuts (⌥Space etc.) as the boss's dev app while alive; an env switch to skip shortcut registration in isolated runs would make longer soaks safe.

## Icon cutover (items 7–8), real dev app

- Search rows for files now render `tfile:///users/tagzixian/Library/Caches/file-icons/<sha256>.png` (probe: `img.complete=true`, `naturalWidth=64`), several rows sharing one hash file (cache reuse). App rows keep `…/Caches/app-icons/darwin/<hash>` at 256px.
- A row whose database value is still a legacy data URL renders it as before until converted.
- `iconGeneratedBytesCumulative` stayed 0 across the whole home scan: no scan-driven icon production.
- `file_extensions` icon values on the dev profile: 251,627 data URLs / 4,721 paths at 14:50 → 247,231 / 8,687 at 15:27 with only the lazy per-hit path (stale-icon regeneration on changed rows).
- `file-protocol/index.test.ts` failed 4 cases because `getFileIconCacheDirectory()` throws when Electron has no cache/userData path; `onInit` now treats the icon root as optional and logs a warning. `win.test.ts` registry-app case updated to the path contract.

## Legacy conversion (item 9)

`FileProviderIconMigrationService` is scheduled by the original task in `FileProvider.scheduleBackgroundStartupTasks` (once the search worker is ready, after the startup degrade window, minimum 30s), idle-gated per 32-row page, single-row compare-and-update writes through the writer. An extra scheduling call added during the takeover was redundant (the service's `iconMigrationScheduled` guard made it a no-op) and was removed before commit. On the dev profile it converts slowly while the whole-home scan holds the writer: data URLs 251,627 → 245,784 between 14:50 and 15:40.

## Memory (items 12–13 evidence so far, real dev app)

Per-worker heap telemetry added: the writer worker (`search-index`) could never answer the 300ms metrics message while inside synchronous libSQL, so its heap showed as `null`; `Worker#getHeapStatistics` now fills it in. With that, during the whole-home scan every isolate stays small (main heapTotal 105–183MB, search-index 21–25MB, file-index 4–9MB, file-scan ~6MB) while process RSS swings 1.2–5.2GB and `footprint` peaks at 4.8–6.2GB with ~4GB dirty under "App-Specific Tag 14" (the process allocator arena, not V8 — `Malloc*` zones are ~3MB because Electron routes malloc through PartitionAlloc). The V8-heap OOM class from the issue is therefore closed by evidence; the native arena growth during the scan is real, transient (drops after subtrees finish) and not yet attributed. libvips worker threads are idle (condition waits), not the cause.

## 2026-09-27 CPU / writer / shutdown follow-up

- Packaged beta.47 whole-home startup scan held the main process near one full core and exposed an 8s `search-engine-core` quit timeout. `context=FileProvider.fullScan Ns` was only the longest-lived perf label; `schedulerDeferredRecords` was cumulative since boot, not the live queue.
- Deterministic shutdown A/B used an isolated 20k tree and a separate process holding `BEGIN IMMEDIATE` on `search-index.db` for 20s. Before the fix, the 5s dev shutdown guard force-exited. After cancellation-first writer close, shutdown gives the worker 500ms to checkpoint, then unrefs/terminates it without awaiting confirmation on the quit critical path; the interrupted database reopened cleanly. Final re-run against the completed 100,002-row profile while the same 20s lock was held: all 44 modules unloaded in 2026ms, total shutdown 3.532s, no force-timeout.
- The fused fullScan result now returns `persistedCount` instead of structured-cloning persisted rows back from the worker, and the fullScan service no longer retains inserted rows for the whole root. Custom sinks retain the legacy per-batch row emission contract.
- Partial-root recovery is distinct from completion: child `scan_progress` rows keep an incomplete root eligible while counting as scan evidence. A profile interrupted at 3400 rows resumed to 6185 after restart instead of being suppressed by the 24h interval.

### Isolated 100k campaign

- Root: `/Users/talexdreamsoul/tuff-index-probe-beta47`; 100,000 synthetic Markdown files / 53.4 MiB, plus two files created during the live scan. Business profile and Chromium state were under `/tmp/tuff-beta47-100k`; `TUFF_DISABLE_GLOBAL_SHORTCUTS=1` prevented OS shortcut registration. The real profile was read-only.
- Full scan completed with exactly **100,002** `files` rows and one exact root completion checkpoint. Duration from first 30s telemetry sample to `File indexing auto run completed successfully`: about **1h31m56s**.
- Resource envelope across 187 snapshots: process RSS **214.1–514.6 MiB**; main V8 heapTotal max **155.7 MiB**; final scheduler active/queued/pending = `0/0/0`; pending/inflight buffers and bytes all `0`. `schedulerDeferredRecords=49,810` was cumulative; durable `file_index_progress` ended at 50,960 completed / 12 pending. The writer held **10** descriptors to the index after the full campaign.
- Concurrent CoreBox search returned indexed results in **230ms** during the scan. Two filesystem mutations intentionally created during the scan were held by the source mutation gate (not visible within 9s), then converged after the authoritative scan and were searchable in **171ms / 155ms**.
- One 553ms event-loop lag occurred during the 92-minute campaign; it coincided with a 30s `startup-analytics.outbox.flush` polling round plus interactive preview/default-opener IPC, so it is not evidence of a 748s main-thread fullScan block.

### Live dev divergence found from the user's screenshot

- The running dev PID 88881 used master before the stage-only beta.47 libSQL fixes: app-provider 50-item batches took **52.7–94.8s**, file enrichment hit `FILE_INDEX_PERSIST_BARRIER_TIMEOUT`, and `lsof` showed **241** descriptors to the 7.41GB `search-index.db`.
- The isolated fixed build held 10 descriptors under the completed 100k campaign. Released commits `9ed43e307` (libSQL/driver transaction update) and `bcac84591` (reconnect poisoned busy connections and close stale init clients) were therefore synchronized into the current worktree. The already-running old dev process must restart before those changes can affect it.

### 2026-09-27 post-scan enrichment re-admission fix

- Root cause: `SearchIndexStoreAdapter.onBatchApplied` acknowledges base file records after every FTS batch; the acknowledgement previously sent every acknowledged row through the same content scheduler, including rows already terminal in `file_index_progress`. A completed 100k scan therefore kept re-admitting 100-row pages while `Processed file extensions` ran with `extensions=0`.
- Fix: runtime writer acknowledgements still refresh extensions for the whole base batch, but schedule content enrichment only for rows with no progress row or `pending`/`processing` status. `worker-enrichment` publications remain excluded. The pure extension-keyword loop no longer pays the per-record adaptive queue delay.
- Regression evidence: shared side-effect tests 6/6; FileProvider startup/replay tests 57/57; a real isolated 300-file profile completed 300 rows with `pending=0`, explicit `schema-migration` replay completed in 104ms without growing the backlog, and a 10s post-replay CPU delta was +0.10s with the process RSS falling 435→428 MiB. Graceful shutdown unloaded 44/44 modules in 1,536ms with no force-timeout.

- Post-fix settle smoke: the completed 300-file profile stayed live for 180.008s across 12 samples with files fixed at 300, scheduler active/queued/pending `0/0/0`, result pending/inflight and bytes all zero, search-index handles fixed at 21, RSS 384.3–509.7 MiB, and no early exit. It then exited cleanly with 44/44 modules unloaded and no timeout.

### 2026-09-27 R10 fullScan batch-ceiling A/B

- Isolated clone, same 10,000 Markdown files and same startup/profile flags; only `upsertBatchScheduler.maxSize` changed. `maxSize=20`: **542 batches / 49,571 ms**. `maxSize=10`: **1,002 batches / 36,042 ms** (~27.3% faster). Both runs completed exactly 10,000 rows with `scan` task status `succeeded`.
- 3,000-file repeat control: `maxSize=20` **6,155 / 6,131 ms**; `maxSize=10` **5,917 / 5,896 ms**. `maxSize=40` measured **6,802 ms**, slower; no larger window was promoted.
- Production `upsertBatchScheduler.maxSize` is now 10. This closes the batch-ceiling subfinding; no live or real profile was used.

### 2026-09-27 R10 watch task-state persistence A/B

- Same isolated 300-file watch root; mutate 200 files in one storm. Before coalescing, `DbWriteScheduler` reported `indexing.task-state.save enqueued=191, ok=191`; after the one-second leading-edge window, the same probe reported `enqueued=49, ok=49` (about **−74%**). Both runs had `drop=0`, `fail=0`, and no `file-icon.persist` or `[Perf:EventLoop]` line in the probe log.
- Watch diagnostics update in-memory state immediately; durable history is flushed by `IndexingRuntime.drainTaskStateWrites()` during shutdown. Scan and reconcile task-state writes remain awaited. Focused runtime suite: **102/102**; node typecheck and Electron build passed.

### 2026-09-27 R10 file-icon writer-lane qualification

- The historical `file-icon.persist` slow-task evidence was not reproducible on the current default split topology. In an isolated 300-file profile, an explicit file-provider search returned 50 rows and caused 120 `icon`/`iconMeta` extension rows; the worker-owned search database stayed at 20 open handles, the Electron main process sampled about 0.6% CPU, and the log contained zero `file-icon.persist` and zero event-loop-lag entries.
- The emergency shared-file topology was then reproduced with `TUFF_DB_SEARCH_SPLIT_ENABLED=0`: no `search-index.db` existed, and the ordinary test file's `icon` + `iconMeta` rows landed in primary `database.db`. The legacy opener path also ran: Free Download Manager's app row and `openers.json.torrent` converged on the same `file-icons/...png`. Each lane wrote once; neither label reached the scheduler Top-5 summary, and the 16:54 / 17:02 write windows contained no event-loop-lag line. Later lag belonged to startup analytics, sync and polling. The historical 300+ icon slow-task storm is not reproducible in current code, so no queue or writer rewrite is justified; this closes the icon-lane boundary.

### 2026-09-27 R10 source-scoped diagnostics

- The real search profile was 7.48 GiB (`search-index.db`) with 148,510 file rows and 105,575 progress rows; an APFS clone was used for runtime verification.
- The six existing stats statements used covering indexes. Direct same-connection measurement on the clone was 4.5 ms median for six separate counts (4.2 ms for one scalar-subquery statement); the data does not justify a query-shape rewrite by itself.
- The former diagnostics IPC path always built all five source reports before filtering `sourceId`. On the isolated clone, the first all-source request hit an unrelated app-provider fast-read timeout and took 1,237 ms. After adding `IndexingRuntime.getSourceDiagnostics()` and using it for explicit `sourceId` requests, the first file-provider-scoped request took 10.9 ms and did not read unrelated sources. No-source diagnostics retain the full contract.
- Focused `indexing-runtime` + `common` suites passed 143/143 after the change; CoreApp node typecheck, targeted ESLint, and electron-vite build passed. No broad cache or query rewrite was made without runtime evidence.
- On the same clone, 100 repetitions of the current 10-path acknowledgement read (`files WHERE path IN (…)` plus `file_index_progress WHERE file_id IN (…)`) measured **44.25ms median / 73.2ms p95**; a single LEFT JOIN variant measured **43.55ms / 75.4ms**. The ~1.6% median difference is below the threshold for a cross-layer row-shape change, so this path remains monitored rather than rewritten.
