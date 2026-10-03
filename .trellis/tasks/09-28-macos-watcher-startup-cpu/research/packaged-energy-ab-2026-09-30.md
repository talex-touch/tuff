# Packaged application energy A/B, September 30, 2026

## Verdict

Three complete alternating-order pairs demonstrate a large reduction in native
Tuff process-group Energy Impact during a synthetic metadata-update workload.
This is actual packaged Electron execution, not extrapolation from a service CPU
microbenchmark. It does **not** establish lower settled-idle energy, unchanged
search latency, total-machine wattage, or battery-life improvement.

The existing writer patch remains scoped and the overall low-energy task remains
open. Do not turn the draft PR into a claim of complete energy acceptance.

## Method

- macOS 15.7.5 arm64, Electron 41.10.7; each run records Node v26.7.0.
- Baseline source: `226e8d2fb960c053b3d0dbd6204b1221c1ead217`.
- Candidate source: `29044f48bc1286aa55bdd24243d38860f2cf9d9a`.
  The isolated build checkout used `daeb89dd5`, whose tree has no difference
  from `29044f48b`. Both bundles contain the identical test-only IPC probe.
- Fresh unsigned packages, separate synthetic HOME/userData per run, identical
  settings, hidden windows, update downloads/sync/Sentry/startup analytics
  disabled. No installed app, private profile or credentials are copied.
- Each profile starts from the same template: 3,000 production-indexed real files
  plus 1,197,000 FTS/meta padding rows under a **different synthetic provider**.
  This models shared FTS cardinality, not 1.2 million real searchable files,
  production keyword cardinality or body-rich content.
- The fixture is recreated at its original indexed path for each launch. Fresh
  file timestamps trigger metadata reconciliation. Startup timing is therefore
  **existing-index startup plus stale metadata convergence**, not unchanged-index
  idle startup or a fresh million-file full scan.
- Wait through 165 seconds after launch and confirm provider readiness/no writer
  backlog. Observe 60 seconds before updates and 30 seconds after all work.
- Change 200 files, issue 20 concurrent real-provider searches, and measure
  persisted metadata plus queue convergence. Then issue 42 searches, create 20
  files, and delete those 20 files, asserting production FTS visibility/counts.
- The update observation window is 90 seconds, plus its initial 3-second guard,
  for both variants. Do not compare different-duration active phases.
- `powermetrics` starts before Electron and samples every second with
  `tasks,cpu_power,thermal`, `--show-process-energy`, and
  `--handle-invalid-values`. Track the root process group and descendants.
- Only valid native samples with the owned root and fully inside phase bounds
  are used; exclude one second at each edge. Every reported long window must
  have at least `wallMs - 7000` sampled milliseconds.
- Per-window rate = sum of native Energy Impact / observed seconds; CPU =
  sum of CPU milliseconds / observed milliseconds, multiplied by 100.
  Report the median of three run-level values, not the best run or the mean
  of differently sized sampling intervals.
- Energy Impact is a relative score, **not W or J**. Combined SoC counters include
  unrelated host activity and omit other machine components; no app-attributed
  watts or total-machine energy saving is calculated.
- Search timing measures actual `FileProvider.onSearch` and its read workers.
  It excludes foreground CoreBox IPC/rendering and broader fuzzy/typo workloads.
- Terminate only owned test process groups after the final phase and stop the
  native sampler. All six fixtures are removed and no campaign processes remain.
  Group termination produces renderer-killed/shutdown-ack warnings after the
  measurement windows; this is not evidence of normal UI-driven graceful quit.

## Matched Results

| Pair / order | Baseline update Energy Impact rate | Candidate rate | Baseline update drain | Candidate drain | Baseline concurrent P95 | Candidate concurrent P95 |
| ------------ | ---------------------------------: | -------------: | --------------------: | --------------: | ----------------------: | -----------------------: |
| 5 / A then B |                           2783.668 |         40.482 |              46.829 s |         4.065 s |                2.288 ms |                 4.063 ms |
| 6 / B then A |                           2715.476 |         74.583 |              45.283 s |         5.162 s |                1.941 ms |                 1.731 ms |
| 7 / A then B |                           2742.275 |         37.216 |              45.821 s |         4.062 s |                1.823 ms |                 4.529 ms |

| Metric / median of three                     | Baseline | Candidate | Interpretation                    |
| -------------------------------------------- | -------: | --------: | --------------------------------- |
| Update-window Energy Impact rate             | 2742.275 |    40.482 | 98.52% lower score                |
| Update-window process-group CPU              |  48.574% |    1.830% | 96.23% lower CPU                  |
| 200 updates, persisted and drained           | 45.821 s |   4.065 s | 11.27x faster                     |
| Startup plus metadata convergence            | 76.349 s |   4.823 s | This fixture only                 |
| 20 created files, MATCH-visible              |  1.030 s |   1.540 s | Candidate slower; one run 2.040 s |
| 20 deleted files, zero MATCH hits            |  5.044 s |   0.512 s | Faster removal                    |
| 42 post-update searches, per-run P95         | 1.781 ms |  2.256 ms | +0.475 ms, not latency parity     |
| 20 concurrent searches, per-run P95          | 1.941 ms |  4.063 ms | +2.123 ms, not latency parity     |
| Pre-update hidden-window Energy Impact rate  |    2.730 |     2.678 | No stable improvement             |
| Post-update hidden-window Energy Impact rate |    2.604 |     9.932 | Candidate worse in this sample    |
| Pre-update process-group CPU                 |   0.606% |    0.602% | Approximately equal               |
| Post-update process-group CPU                |   0.600% |    0.788% | Candidate higher                  |

All six runs finish with exactly **3,000 file rows, 3,000 file-provider FTS rows,
and 1,197,000 padding rows**. All 20 concurrent and 42 later searches per run
assert exactly one match **by count only**, not the exact expected item ID.
Insert/delete checks converge in every run. No measured event-loop warning reaches
2 seconds; the candidate's one warning
was 334 ms. Warning occurrences are not the same as distinct stalls.

Post-update energy increases are retained. Native task attribution places the
largest spikes in the candidate main process, not the renderer: pair 5 has
76.322 CPU-ms / 200.761 Energy Impact in one approximately 1.065-second sample;
pair 7 has 176.427 CPU-ms / 348.716 score in approximately 1.068 seconds.
These do not identify a causal main-process call stack. They cannot be deleted as
outliers or used to claim particularly low idle energy.

## Recompute and Checks

The unredacted harness, native plist streams, complete samples and app logs are
retained locally outside Git. The public JSON allowlists numerical evidence and
contains no profile paths, file contents, process IDs or app output.

```sh
node .trellis/tasks/09-28-macos-watcher-startup-cpu/research/packaged-energy-summary.mjs "$RAW_RUN_DIRECTORY"
pnpm exec vitest run --dir .trellis/tasks/09-28-macos-watcher-startup-cpu/research \
  --maxWorkers=1 --minWorkers=1 --no-file-parallelism --no-cache \
  .trellis/tasks/09-28-macos-watcher-startup-cpu/research/packaged-energy-summary.test.mjs
```

The summarizer demands complete paired runs 5/6/7, successful native sampler exit,
expected row/search counts, readiness and long-window coverage. Its four tests
cover duration weighting, incomplete coverage, invalid/unowned samples and
non-finite counters/short windows.

After the six-run sampler finished, reran the actual writer/read/DB/fd/fuzzy
regression suite without overlapping builds: **99 files / 1,024 tests passed** in
24.34 seconds. Same command as `energy-follow-up-2026-09-30.md`.

Earlier attempts are not counted: cold run 1 lacked sustained valid sampling;
cold run 2 failed the sampler-exit gate; warm run 1 detected a stale copied
diagnostic/profile path; warm run 2 failed search recall because the synthetic
root identity did not match the warmed template. Cold run 3 is only one pair and
does not count toward three-repeat cold-index acceptance.

Baseline packaged SearchIndexService chunk SHA-256:
`c5d637cc01bbeb85da0511060daf701fa5b0eb8f1ac9add132a95179b4055cbc`.
Candidate:
`aff00328f6b7f905900d8de2ae0e3daa7449bbfbe58bc1090e587f6b011bf3f1`.
The derived rowid store is present only in the candidate chunk.

## Remaining Gates

- No stable reduction in idle energy. Background work beyond the index provider
  remains possible even when that provider reports ready.
- Candidate search P95 medians and create visibility increased. All exact
  searches here remain below 6 ms, but that is not proof of zero performance
  regression or full search-workload parity.
- Host background activity was not controlled; order alternation does not
  eliminate thermal/cache/background confounding. Process-group attribution can
  miss short-lived children or suffer PID-reuse ambiguity.
- No real-profile, long-duration, body-rich, foreground UI, signed-package,
  Intel macOS, Windows/Linux or battery/whole-machine joule acceptance.
  Later installed real-profile observations are recorded separately in
  `installed-real-profile-energy-2026-09-30.md`; they do not retroactively change
  this synthetic campaign's method or settle the remaining low-energy gates.
- PR Quality still has the previously recorded baseline dependency-audit
  blocker. No unrelated dependency update or audit bypass is included.
