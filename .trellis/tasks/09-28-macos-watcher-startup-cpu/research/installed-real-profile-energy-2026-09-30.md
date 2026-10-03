# Installed application validation, September 30, 2026

## Verdict

The writer patch was **installed at `/Applications/tuff.app` and executed with
the existing real profile**, not only unit-tested or run in an isolated HOME.
Two 200-file metadata-update observations show materially lower process-group
CPU and Energy Impact, with exact persisted file/meta/FTS identities.

**Overall low-energy acceptance has not passed.** A subsequent window with no
test-file mutations consumed 116.171% process-group CPU and Energy Impact rate
4582.138. A later 300-second observation reproduced high load at 93.039% CPU
and Energy Impact rate 3847.683. Native task records and scan-worker diagnostics
show background traversal, so neither window is confirmed settled idle. The
scoped writer improvement must not be presented as a solution to every
scan/resume/background workload.

The task remains in progress and PR #2031 remains draft. No battery-life,
whole-machine wattage, signed-release, or foreground search-latency parity claim
is made.

## Installation And Safety

- The installed baseline was version `2.4.14-beta.54`, Electron `41.10.7`,
  macOS `15.7.5` arm64. Its source tag is `1924e469c`.
- The candidate source is the production writer patch `29044f48b`, cherry-picked
  onto that tag as `16457004a`. The production code of the earlier benchmark
  baseline and beta.54 is identical; their manifest versions/release notes differ.
- The original installed app and the full real profile were privately backed up
  before replacement. The search database was 24,649,629,696 bytes. Backup size,
  mtime and sampled header/middle/tail pages matched; a complete integrity check
  was **not** performed.
- The user's explicit installation request supersedes the earlier task
  prohibition on installed-app replacement. No database rebuild, profile reset,
  user-content cleanup, credential publication or permission change was made.
- `lsof` confirmed the candidate opened the original real database files. No
  isolated userData/HOME, synthetic provider padding, or energy-test IPC probe
  was used for this installed experiment.
- The first fully rebuilt candidate rendered a blank main window. All assets
  existed; Vue mounted and the IPC bridge was present. Shared package resolution
  mixed checkout identities and duplicated storage/transport modules. This is a
  confirmed build-isolation defect, not a proven rowid-code regression.
- The tested replacement retains **583 original renderer/preload files,
  byte-for-byte**, while using the rebuilt patched main-process output. Its
  ASAR contains the rowid implementation and no `TUFF_ENERGY_AB_SOCKET` probe.
  It is an **unsigned, main-output replacement**, not an independently verified
  clean signed release build. The blank candidate was retained privately, not
  left installed.
- The baseline and candidate were both actually placed at the installed path,
  launched, and normally exited between variants. The original app successfully
  ran again against the same profile, establishing app-only rollback.
- The final installation is the patched app. The original app/profile backups
  remain available locally. Do not restore the old profile over newer user data.

## Method

An agent-owned directory under an admitted Documents root contained 200 ordinary
Markdown files. No existing user file was changed. Each update increased all 200
files' sizes and timestamps while retaining their names. Renames/deletes were
limited to those owned fixtures.

Read-only checks compared the **exact expected path sets**, sizes and second-based
mtimes in `files`, fresh `search_index_meta` rows, and physical FTS MATCH identities.
FTS duplicates or extra/missing identities fail the check. This is stronger than
asserting that an arbitrary result count is nonzero.

Native `powermetrics` observation used `tasks,cpu_power,thermal`,
`--show-process-energy`, one-second sampling, and tracked the installed main
process plus descendants. Each update window requested 120 seconds and received
at least 117.54 seconds of valid sampling. Reported rates are duration-weighted.
Sampler exit was zero and thermal pressure Nominal in all listed windows.
Energy Impact is a **relative score, not W or J**.

Order was **B1, A1, A2, B2**. The same real profile and fixture directory were
retained; the profile was not rewound between variants. Builds, copies and heavy
tests did not overlap the energy windows. The main UI was open and CoreBox closed
during the four update windows.

These are repeated **installed field comparisons**, not perfectly isolated
matched A/B: other user/background activity, caches and startup work were not
controlled. A1 started with one busy writer request; startup/background states
were not identical. A1's update timeout was retained, then read-only verification
confirmed complete convergence before A2 began. Do not infer a pure mutation
causal effect from every difference in these native totals.

## Actual Installed Results

| Observation                    | Group CPU | Energy Impact rate |           Disk read | 200-file convergence                                  |
| ------------------------------ | --------: | -----------------: | ------------------: | ----------------------------------------------------- |
| B1 patched                     |    6.657% |            144.029 |     7,536,640 bytes | 1.277 s                                               |
| A1 original                    |  114.647% |           4782.810 |   768,954,368 bytes | 180.088 s timeout; later verified complete            |
| A2 original                    |   93.666% |           4314.030 |   579,665,920 bytes | 120.277 s                                             |
| B2 patched                     |    5.938% |            122.009 |     9,461,760 bytes | 1.282 s                                               |
| B post-work, scanning observed |  116.171% |           4582.138 | 1,546,166,272 bytes | No fixture mutations; not confirmed idle              |
| B later quiet observation      |    3.564% |             85.559 |     2,260,992 bytes | No fixture mutations; no matched original idle window |
| B later 300-second observation |   93.039% |           3847.683 | 7,915,184,128 bytes | No fixture mutations; scan worker busy, not idle      |

Both patched update runs finish with exactly **200 files, 200 meta identities,
200 physical FTS hits**, and current sizes/mtimes. A2 also meets those exact
assertions. At one intermediate A1 observation only 102/200 file rows had the
new metadata; its 180-second deadline failure is not erased by later convergence.

The post-work native breakdown places approximately 104% CPU in the Tuff process
and 12.4% in `fd`. This auxiliary breakdown is diagnostic; it is not an independently
filtered replacement for the valid-sample group total above. Nearby logs show the
writer worker offline, then recreated and busy, and later recreated again. These
observations do not identify the precise SQL statement or reason for restart.

Source inspection supplies two concrete next-probe boundaries: the writer
normally retires after 60 seconds without pending work, and a fresh rowid store
rediscovers each provider before its first mutation. That discovery is outside
full-scan pacing. Separately, fd's exclusions are applied after enumeration,
including root-only checkpoint passes, and reconciliation has cooperative yields
but no equivalent duty-cycle sleep. These are **falsifiable hypotheses for the
observed field spike**, not measured attribution to one particular SQL statement.

### Reproduced Long-Window Failure

The 300-second observation ran from **09:35:44 to 09:40:41 UTC**
(17:35:44 to 17:40:41 local time) with 280 valid native samples and 297.931
sampled seconds. It wrote 749,527,040 bytes and recorded 667,893 interrupt
wakeups. The sampler completed with exit 0 and Nominal thermal pressure. No
owned fixture existed and no test mutation was issued.

The diagnostic snapshots show a busy scan worker and an idle search-index
writer during this recurrence. A five-second native stack capture overlaps
this measurement: two WorkerThreads were waiting in `kevent`; another was
processing filesystem `AfterStat` callbacks, also present on the main thread.
This strengthens the need to measure traversal and event handling independently
of the rowid writer path. It does **not** identify a JavaScript call site or prove
that provider discovery cannot contribute to the earlier spike.

This is a diagnostic field observation, not a pristine idle or matched A/B
window: the profiler and lightweight read-only inspection ran concurrently.
The native sampling and profiler processes were subsequently confirmed exited.
The later attempt to close the main window and open CoreBox again timed out
in the native controller; the final UI/search-latency gate remains failed.

The earlier uncontrolled installed-baseline observation (49.478% CPU / Energy
Impact rate 2043.531 over 117.843 sampled seconds) is retained privately but
**excluded** from the repeated update comparison.

## File And UI Checks

- Installed main-window homepage and search entry rendered after the corrected
  package replacement.
- The first installed candidate's actual CoreBox UI showed the expected newly
  created fixture filename and exact owned path.
- Twenty renames converged in **1.264 s**, preserving exactly 200 expected
  file/meta/FTS identities and removing all old identities.
- Twenty deletes converged in **1.033 s**, leaving exactly 180 expected identities
  in all three stores.
- Final post-rename/delete UI assertions **did not pass**: the native controller
  alternated between two windows titled Tuff and timed out; a read-only database
  pass is not substituted for this missing UI acceptance.
- CoreBox was temporarily pinned while investigating native focus behavior.
  `tools.autoHide` was restored to **true**, matching the original backup.
- All 180 remaining owned fixtures were content-verified before cleanup. Cleanup
  converged in **0.796 s** to zero owned file/meta/FTS identities, and the empty
  fixture directory was removed. No user file or backup was deleted.
- The fixture's first seed assertion used millisecond mtimes although the
  production table stores seconds. That harness assertion failed; its corrected
  read-only check verified all 200 rows. This is not an application-indexing
  failure and is not silently counted as a passing seed-latency measurement.

## Evidence And Remaining Gates

Private native plist streams, numerical run files, samples, build/pack logs and
the owned-fixture driver are retained outside Git. Only allowlisted numerical
results and this redacted explanation are publishable. No personal file list,
profile, raw app log, process ID or credential is included.
The allowlisted observations are in `installed-energy-results-2026-09-30.json`.

The system `sqlite3` CLI could read ordinary tables but lacked the FTS5 module;
physical FTS assertions used a read-only Node SQLite connection instead.

The service/reader/DB/fd/fuzzy regressions previously rerun in this session remain
**99 files / 1,024 tests passed**, with Node typecheck passed. Installed runtime
measurements above are separate evidence, not a relabeling of those tests.

The summary-tool rerun passed **1 file / 4 tests** with the research directory
as Vitest's root. An initial invocation used unsupported `--include` and was
rejected before test collection; it is not counted as a test run. Scoped ESLint,
the seven current-task Markdown/JSON formatting checks, `git diff --check`,
and numerical equality checks for all seven native windows and seven fixture
checks passed. The final ASAR inspection found the production rowid code in
its independent main chunk and no energy-test IPC probe across 46 main JS files.

Still open:

- Identify/reproduce the fd/worker-restart high-energy workload and verify its
  bounded pacing on the real large profile.
- Complete final installed foreground UI search checks and timing. Provider-only
  synthetic P95, whose candidate medians increased, does not prove UI parity.
- Repeat genuinely settled idle with a matched baseline. A five-minute
  observation was executed and reproduced high load, not settled idle; no
  particularly-low-energy guarantee is justified yet.
- Verify a clean, fully rebuilt package and a signed release separately.
- Windows/Linux/Intel macOS runtime and total-machine/battery energy are untested.
- The existing upstream production dependency-audit blocker is not bypassed.
