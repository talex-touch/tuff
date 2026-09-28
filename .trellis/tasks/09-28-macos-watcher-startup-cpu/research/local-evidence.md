# Local evidence and design constraints

Date: 2026-09-28. Checkout baseline: `13903cb9b56fbb0acd30323616164c62150a0559`.

## Real application observations

Installed beta.50 on macOS 15.7.5 arm64 remained CPU-bound after startup. The main process measured 196.6–260.8% in five observations, 163.3% after eight minutes, and a restarted main process measured 278.5% after nine minutes. Two native samples showed substantial `node::fs::AfterStat`, `uv_fs_lstat` and directory enumeration work. Application logs included 4435–5648 ms event-loop delays.

These are observations, not a controlled proof that one watcher accounts for every stall. An independent app restart and index replacement during the observation invalidate treating those two live sessions as an A/B experiment. No production data/configuration was changed by this task.

Raw samples and private application paths stay outside Git/public reports. The summary above is the publishable boundary; no clipboard contents, credentials, personal filenames, or raw application logs belong in the issue/PR.

## Repeated isolated dependency probe

`research/watcher-startup-probe.cjs` uses the lockfile versions, Chokidar 3.6.0 and fsevents 2.3.3, on Node 26.8.2 arm64. It creates synthetic trees under a unique temporary directory, alternates backend order, runs each combination three times, and awaits watcher closure before deleting only its own fixture. The application and its profile remain untouched.

Reproduction:

```sh
probe_dir=$(mktemp -d /tmp/tuff-watcher-research-XXXXXX)
npm install --prefix "$probe_dir" --ignore-scripts --no-audit --no-fund --no-package-lock chokidar@3.6.0
node .trellis/tasks/09-28-macos-watcher-startup-cpu/research/watcher-startup-probe.cjs "$probe_dir"
```

| Fixture | Backend | Registration ready ms (3 runs) | CPU ms (3 runs) | stat+lstat+readdir calls per run | Created file delivered |
| --- | --- | --- | --- | --- | --- |
| 2,000 files | Chokidar | 49 / 50 / 41 | 79 / 79 / 67 | 2,054 | 3/3 |
| 2,000 files | Raw FSEvents | 1 / 1 / 4 | 2 / 2 / 2 | 0 | 3/3 |
| 20,000 files | Chokidar | 211 / 378 / 226 | 410 / 493 / 422 | 20,450 | 3/3 |
| 20,000 files | Raw FSEvents | 1 / 1 / 6 | 2 / 2 / 2 | 0 | 3/3 |

- Each CPU observation includes registration plus a 500 ms observation window; fixture creation is outside measurement.
- Instrumentation counts JavaScript-facing `fs.stat`, `fs.lstat`, and `fs.readdir`, not all kernel I/O. Zero does not mean the OS performs literally no work.
- Chokidar used `ignoreInitial: true`, `depth: 24`, `awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }`. Synthetic names are ordinary files; exclusions are intentionally absent to measure admitted directory cardinality.
- The 20k Chokidar run registered one stat, 20,228 lstats and 221 readdirs. The operation count is stable across repeats and scales with cardinality.
- The raw native comparison is a lower-bound feasibility probe, **not a replacement implementation**. It has no application event translation, write-settle handling, exclusions, symlink policy, loss recovery or database updates. Native creation latency must not be represented as equivalent product freshness.
- Maximum event-loop delay in this small probe was 27 ms. It does **not** reproduce the real application's multi-second stall; the full isolated application comparison remains required.
- The first probe failed its native delivery assertion because macOS reported the canonical `/private/var` path. Canonicalizing the synthetic root fixed the harness, after which all 12 runs delivered creation events. Alias/canonical-path handling is a real acceptance requirement, not a reason to weaken the assertion.

## Implementation facts

1. `apps/core-app/src/main/modules/box-tool/file-system-watcher/file-system-watcher.ts:103` creates a Chokidar backend on the main thread. On macOS it selects the pinned v3 alias; other platforms use the existing v4 backend.
2. Its `ignoreInitial` option suppresses initial add notifications, not initial enumeration. The pinned dependency's `lib/fsevents-handler.js:446` calls `_readdirp` before its ready signal even with this option.
3. `packages/utils/search/indexing-watch-path-policy.ts:37` selects depth 24 on macOS. The production root policy is intentionally broad; narrowing roots is diagnostic, not an acceptable silent product change.
4. `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-watch-service.ts:468` registers watchers independently of the automatic scan eligibility check around line 425.
5. `apps/core-app/src/main/modules/box-tool/search-engine/indexed-source-event-router.ts:152` subscribes file indexing to file events, while directory events currently feed app indexing on macOS. A native directory-only notification cannot simply replace Chokidar's synthesized descendant notifications.
6. `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:2446` currently ignores `request.roots` in `reconcileIndexedSource` and starts provider-wide indexing. Calling that API for every native directory event would reintroduce broad scanning and is **not** the proposed recovery mechanism.
7. `apps/core-app/src/main/modules/box-tool/file-system-watcher/file-system-watcher.ts:302` does not currently await backend close. Any asynchronous native stop contract needs explicit owner-level teardown and tests; no unrelated lifecycle cleanup is implied.
8. `apps/core-app/src/main/core/precore.ts:154` supports a benchmark user-data override; isolated acceptance additionally requires its explicit guard. A safe full-app probe must verify the effective data path before proceeding and must never copy private credentials into fixtures.

## Relationship to the standing audit

The R3 entry in `.trellis/tasks/07-13-search-crossplatform-audit/prd.md:132` records bounded scan-worker traversal and separate remaining reconciliation evidence. This task concerns watcher registration outside that scan worker. It neither reopens already-proven worker materialization fixes nor marks the existing reconciliation risk solved.

## Research conclusion

Unnecessary initial enumeration is confirmed at the pinned watcher boundary. A macOS root-event backend is technically feasible, but replacing Chokidar is acceptable only with directory/subtree correctness, loss recovery, bounded work, and isolated full-app evidence. The original fan/stall report remains open until those application-level checks pass.
