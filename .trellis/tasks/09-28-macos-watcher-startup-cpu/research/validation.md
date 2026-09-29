# Validation evidence

## Actual production watcher comparison

Command:

```text
pnpm -C apps/core-app exec tsx scripts/file-watch-startup-benchmark.mjs --counts 20000 --repeats 3 --window-seconds 10
```

The harness ran `chokidar-fsevents@3.6.0` and the production `MacOSFileWatcher` in fresh child processes, alternating the order across three repeats. It generated 20,000 synthetic files, watched a canonical temporary root, and verified create, change, and delete delivery.

| Backend | Registration CPU median | JS fs calls median | Window CPU median |
| --- | ---: | ---: | ---: |
| chokidar-fsevents | 467.613 ms | 20,451 | 524.735 ms |
| MacOSFileWatcher | 3.991 ms | 0 | 60.736 ms |

All 6 watcher windows completed and all 18 file mutations were delivered. The registration CPU ratio was `0.0085348354`, meeting the benchmark budget of `<= 0.1` with `<= 64` registration fs calls. The JSON summary is in `watcher-module-benchmark-summary.json`.

## Resource and capability rerun

Command:

```text
pnpm -C apps/core-app exec tsx scripts/file-watch-startup-benchmark.mjs --counts 2000,20000 --repeats 3 --window-seconds 10
```

This second run covered 12 alternating windows across both fixture sizes. Every window completed, and every backend delivered all three create/change/delete probes. The candidate registration CPU medians were 3.944 ms at 2,000 files and 3.838 ms at 20,000 files, with zero instrumented registration filesystem calls. The baseline medians were 61.046 ms and 455.598 ms, with 2,055 and 20,451 calls respectively.

The candidate's observed peak RSS during the 10-second windows was 85.8–86.8 MiB at 2,000 files and 84.2–85.9 MiB at 20,000 files. The baseline was 91.6–93.0 MiB and 104.0–111.0 MiB for the same sizes. Candidate window CPU medians were 59.207 ms and 59.651 ms; baseline medians were 114.561 ms and 505.497 ms. Candidate event-loop p99 stayed between 11.4 and 12.3 ms, with a maximum observed delay of 18.7 ms. These are isolated watcher-process measurements, so they do not establish whole-app memory or energy usage.

All 12 runs and the per-run memory, CPU, event-loop, and delivery fields are in `watcher-resource-benchmark-summary.json`.

## Energy sampler

Command:

```text
pnpm -C apps/core-app exec tsx scripts/file-watch-startup-benchmark.mjs --counts 20000 --repeats 3 --window-seconds 10 --energy
```

The six module windows completed. The aggregate medians pool samples across all six windows for each backend rather than aggregating per-run medians: 30 non-null child Energy Impact samples (missing child samples excluded) and all 36 whole-SoC CPU samples. `powermetrics` recorded 10 of 12 target PID samples in every window; the missing samples were the sampler lead-in and tail where the short-lived child was not yet or no longer present. Aggregated observed Energy Impact medians were 0.800 for the baseline and 0.875 for the candidate. Whole-SoC CPU power medians were 7,313.5 mW and 9,086.0 mW respectively, but this includes unrelated host activity and is not app power. These samples establish sampler capability and preserve the observed values; they do not establish a candidate energy reduction. The redacted sampler output is in `watcher-energy-benchmark-summary.json`.

## Full application smoke

The installed `tuff` 2.4.14-beta.50 binary was launched once with a generated isolated user-data directory and the startup benchmark environment. It exited normally after 6.073 s and emitted `Startup health check passed` at 2.091 s; sampled peak main-process CPU was 145.9% and RSS was 485,984 KiB.

At draft creation, `electron-builder --dir` could not produce a packaged candidate because the Electron 41.10.4 download remained pending, and a temporary shadow bundle was discarded after a native startup crash. During integration review the locked dependencies became available: `pnpm -C apps/core-app run build:vite` completed, and that source-built Electron candidate supplied the cold-index and FSEvents runtime evidence below. This is still not a signed packaged-app acceptance result. The installed app and persistent user data were left unchanged.

## Integrated cold-index responsiveness A/B

Current `master` (`69b755528`) and the rebased integrated candidate indexed the same 3,000 generated Markdown files from `/Users/Shared/tuff-low-energy-bench` into separate `/tmp` profiles. The sampler started before Electron and recorded the whole process group every 500 ms. Both runs reached exactly 3,000 file rows.

| Build | Index phase | Busy CPU median | Busy CPU p95 | Busy RSS median | Event-loop lag |
| --- | ---: | ---: | ---: | ---: | --- |
| current `master` | 10.26 s | 125.05% | 243.1% | 1,529.87 MiB | one 593 ms lag plus 616–652 ms renderer IPC delays |
| integrated candidate | 38.57 s | 60.7% | 80.3% | 1,564.51 MiB | no `Perf:EventLoop` warning in the measured run |

The candidate deliberately took 3.76× longer to finish the cold index. In exchange, median process-group CPU fell 51.5% and p95 fell 67.0%. Peak startup CPU was effectively unchanged (261.6% baseline, 260.1% candidate), so this evidence supports lower sustained indexing pressure, not a lower startup peak or lower memory use.

The same runtime exposed a packaging bug in the draft: bundling `fsevents` converted its native addon into an ESM namespace and left `flags.SinceNow` undefined. `electron.vite.config.ts` now externalizes `fsevents`; the rebuilt output retains `import("fsevents")`. The final isolated Electron smoke registered the depth-24 watcher without errors, indexed a newly created file in 1,280 ms, removed it in 514 ms, and exited cleanly. After indexing, five one-second main-process samples were 0.0–1.0% CPU / power.

The shared filter smoke returned `development-path` for `uvcache`, `__pycache__`, and `site-packages`, and `null` for `/Users/me/Documents/build/2026/report.pdf`.

## Signed beta.53 follow-up and FTS cold-insert CPU

The signed arm64 `2.4.14-beta.53` app was installed over a clean profile and sampled every five seconds for 30 minutes. The one initial `FileProvider.fullScan` never completed in that window: 18,906 file/FTS rows had been published, process-group CPU averaged 109.3% (p95 148.3%, final five-minute mean 98.9%), and process-attributed energy averaged 3.82 W (p95 4.54 W). RSS peaked at 1.87 GiB and ended at 789 MiB; 652 MiB was read and 10.8 GiB written. Event-loop lag occurred five times with an 897 ms maximum, improved from the previous packaged beta.47 observation's 3.9 s maximum but still not an idle result.

A 20-second macOS `sample` separated responsiveness from energy: Electron's main thread was only 2.9% on-CPU, while one `WorkerThread` was 99.8% on-CPU; roughly 85% of its samples were the libSQL `index.node` `pread` path. Runtime worker telemetry identified the serialized `search-index` worker as busy. `SearchIndexService.applyDocument()` unconditionally deleted by FTS5 `provider` and `item_id`, both `UNINDEXED`, before every insert. On the live 22k-row database one missing-item FTS probe took 309 ms; this happened even for cold inserts and made the growing scan O(N²).

The fix verifies and caches FTS/meta coverage once per provider. With complete `(provider_id,item_id)` metadata, an item with no meta is new and skips the FTS delete; existing items still delete then insert. Profiles with an FTS row missing metadata retain the legacy safe path until provider replacement repairs coverage. Actual `SearchIndexService.applyProviderItems()` over 20,000 existing documents plus 100 new documents measured 57.30 ms / 60.86 CPU-ms on the complete path versus 938.43 ms / 919.42 CPU-ms with one deliberately missing meta row, a 16.38× wall-time difference. Updating ten existing probes kept exactly 100 rows and 100 distinct IDs.

The source-built isolated Electron acceptance indexed 3,000/3,000 Markdown files in 36.25 s with process-group CPU median 51.44%, p95 80.31%, peak 111.91%, and no `Perf:EventLoop` warning. It published 3,000 FTS rows, 2,655 completed enrichment rows, and logged `Index process complete` at 37 s. The earlier low-impact candidate was 38.57 s / 60.7% median / 80.3% p95; the small fixture is dominated by the intentional 100 ms chunk pauses, so the 20k service A/B is the evidence for the removed asymptotic cost rather than a claim of another large 3k CPU drop.

## Scope limits

- The module benchmark is a lower-level watcher comparison; it does not measure database indexing, Electron renderer startup, or idle whole-app power.
- Symlink parity and FSEvents overflow recovery are covered by injected-backend tests; they were not exercised against a live symlink-heavy home tree.
- Signed beta.53 startup and app-level energy were measured on a clean real profile. The FTS cold-insert fix itself has source-built isolated Electron evidence only; it has not yet shipped in a signed package. The externalized native load, real FSEvents add/delete delivery, and post-index idle CPU remain verified.
