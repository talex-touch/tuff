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

## Energy sampler

Command:

```text
pnpm -C apps/core-app exec tsx scripts/file-watch-startup-benchmark.mjs --counts 20000 --repeats 3 --window-seconds 10 --energy
```

The six module windows completed. `powermetrics` recorded 10 of 12 target PID samples in every window; the missing samples were the sampler lead-in and tail where the short-lived child was not yet or no longer present. Aggregated observed Energy Impact medians were 0.800 for the baseline and 0.875 for the candidate. Whole-SoC CPU power medians were 7,313.5 mW and 9,086.0 mW respectively, but this includes unrelated host activity and is not app power. These samples establish sampler capability and preserve the observed values; they do not establish a candidate energy reduction. The redacted sampler output is in `watcher-energy-benchmark-summary.json`.

## Full application smoke

The installed `tuff` 2.4.14-beta.50 binary was launched once with a generated isolated user-data directory and the startup benchmark environment. It exited normally after 6.073 s and emitted `Startup health check passed` at 2.091 s; sampled peak main-process CPU was 145.9% and RSS was 485,984 KiB.

A candidate full-app bundle could not be produced with `electron-builder --dir` because the local Electron 41.10.4 download remained pending. A temporary shadow bundle built from the installed runtime then crashed in Electron/V8 during native startup, so it is excluded from product conclusions. The installed app and persistent user data were left unchanged.

## Scope limits

- The module benchmark is a lower-level watcher comparison; it does not measure database indexing, Electron renderer startup, or idle whole-app power.
- Symlink parity and FSEvents overflow recovery are covered by injected-backend tests; they were not exercised against a live symlink-heavy home tree.
- The existing installed-app smoke is baseline evidence only. Candidate full-app startup remains blocked by the local packaging/runtime limitation described above.
