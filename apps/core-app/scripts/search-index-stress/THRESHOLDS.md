# Search and index stress: thresholds

The principle every number here serves: while the tests run, the app must not use too much CPU, must not stall, and must not drop frames. The numbers are defaults, chosen for one machine (Apple M4 Pro, 14 cores, 48 GB, a 120 Hz display) and for one person using that machine while a run is in progress. The numbers in the first two tables can be overridden (see Overriding); `report.json` records the ones a run was judged against (`monitor.thresholds`, `limits`), so a report never has to be read against the wrong table.

`warn` marks something worth looking at and never changes the verdict. The verdict fails when a gate is `fail` or `unknown`: what was not proven did not pass.

## Monitor thresholds (live)

Source: `monitor/thresholds.ts` (`DEFAULT_THRESHOLDS`). A continuous overage is one breach (an episode) carrying its peak, so a long stall is one entry, not a thousand.

| Key | Warn | Fail | What is measured | Why this number |
| --- | ---: | ---: | --- | --- |
| `mainLoopBlockMs` | 100 ms | 250 ms | Longest single stall of the main-process event loop. Seen live (an inspector request left unanswered, a 25 ms heartbeat timer running late) and afterwards as the exact peak the app reports | The app's fleet telemetry already counts loop lag at 50 / 100 / 250 / 1000 ms (`apps/core-app/src/main/utils/event-loop-lag-window.ts:35-38`); 100 and 250 are two of those buckets. The app's own detector reports nothing below 200 ms (`apps/core-app/src/main/utils/perf-monitor-config.ts:30`, `perf-monitor.ts:394`); warning at 100 ms makes the harness stricter than the app is about itself. At 120 Hz a 100 ms stall is twelve missed frames |
| `mainLoopP99Ms` | 30 ms | 50 ms | p99 of event-loop delay over each 5 s window (5 reads at the default 1 s interval, `monitor/probes/scripts.ts:13`). Catches steady jank that no single block shows | 50 ms is the app's `over50` bucket and the long-task limit the CoreBox spec uses (`docs/engineering/specs/frontend/corebox-results-contracts.md:965-966`); 30 ms is about four frames at 120 Hz |
| `rendererBlockMs` | 100 ms | 250 ms | Longest main-thread block of any renderer page (long tasks, long animation frames, a round trip that came back late). A page that is not visible is capped at `warn`: nobody is looking at it | Same buckets as the main loop; the 50 ms rule of the spec is applied to frames below |
| `frameOver20msRatio` | 2% | 5% | Share of dropped frames among the frames of a visible window in any 10 s span (`monitor/probes/renderer.ts:11`), judged only when the span holds at least 60 frames (`:12`). A frame is dropped when its interval is over 20 ms: at least two missed vsyncs at 120 Hz, one at 60 Hz. This is the limit for sustained jank of 20 to 50 ms, which neither the next row nor `frameWorstMs` can see. It sees only what the timestamps show: a stall of up to about 40 ms at 60 Hz or 30 ms at 120 Hz can leave no gap ("What the frame probe cannot see", below) | **Provisional.** Fail is the spec's rule for turning an animation on, under 5% dropped frames (`docs/engineering/specs/frontend/corebox-results-contracts.md:965-966`), used as a line the harness must not cross. The only real 120 Hz sample in the spec (8.6 ms mean frame, five gaps over 20 ms in 4.2 s, about 1% of the frames, during a full scan right after a restart, `:967-968`) sits at half the warn line; warn at 2% is a choice. An idle headless Chrome at 60 Hz put 0 of 602 timestamp intervals over 20 ms on 2026-10-30 (1 of 360 in a second sample on a busier machine), so the line has headroom against noise. Calibrate on the first real runs (see below) |
| `frameOver50msRatio` | 1% | 3% | Share of frames longer than 50 ms among the frames of a visible window in any 10 s span (`monitor/probes/renderer.ts:11`), judged only when the span holds at least 60 frames (`:12`) | A frame over 50 ms is a freeze the eye reads as a hitch: six frames at 120 Hz, three at 60 Hz. Every such frame is also over 20 ms, so this share is held stricter than the one above: 1% of frames at 50 ms or more, a hitch every few seconds, is worth a warning while the 20 ms share may still be under its own. The spec's other half, no long task over 50 ms (`corebox-results-contracts.md:966`), is what `rendererBlockMs` watches |
| `frameWorstMs` | 150 ms | 400 ms | Longest single frame interval of a visible window | 150 ms is eighteen frames at 120 Hz, a freeze the eye reads as a hang. 400 ms is where the renderer gives up waiting on CoreBox's interactive entry point (`docs/engineering/specs/main-process/background-task-timeout-contracts.md:355`) |
| `cpuPct` | 150% | 300% | App-wide CPU (main process, renderers and helpers added together) as a percentage of one core, averaged over 5 s (`monitor/probes/process-cpu.ts:114`) | Same unit as the app's own performance report, which adds the per-process percentages (`apps/core-app/src/main/modules/system/performance-report.ts:121-123`). 300% is about a fifth of a 14-core machine. The maintainer works on that machine during runs, and on 2026-10-07 a load average of 16 on 14 cores made the dev instance lag for 28 minutes (`AGENTS.md`, Shared-machine discipline). The app has no CPU limit of its own, so this one is a choice, to be checked against the first full runs |
| `rssMb` | 2560 MB | 4096 MB | App-wide resident memory (all processes added together) | About 5% and 8% of 48 GB. The app only watches V8 heap pressure, at 85% of the heap limit (`apps/core-app/src/main/utils/perf-monitor.ts:418-419`), never resident memory, so this one is also a choice, to be checked against the first full runs |
| `sampleOnBlockMs` | 300 ms | | Not a limit: a main-loop block that is still going after this long makes the monitor run macOS `sample` on the app, and the capture is attached to the breach as `evidence` | A 300 ms block is already beyond the fail line of 250 ms, so a stack is worth its cost (`sample` runs 2 s) |

## Report limits (after the run)

Source: `report/limits.ts` (`DEFAULT_REPORT_LIMITS`). These decide the gates that look at the whole run.

| Key | Default | Gate | Meaning | Why this number |
| --- | ---: | --- | --- | --- |
| `indexP95WarnMs` | 6000 ms | G3 | p95 of the time from the last file step to a created image being found by name, warn above this | **Provisional.** The steady state observed on 2026-10-30 on the maintainer's machine (PixPin screenshots into `~/Pictures/PixPinAutoSave`, from the file landing to being searchable by name) was 1.2 to 2.2 s. Its floor is the watcher's stability wait of 500 ms plus its 100 ms poll (`apps/core-app/src/main/modules/box-tool/file-system-watcher/macos-file-watcher.ts:65-66`), the router's 300 ms coalescing (`modules/box-tool/search-engine/indexed-source-event-router.ts:31`) and about 0.3 s to write. Warn is about three times the slowest steady value |
| `indexP99FailMs` | 15000 ms | G3 | p99 of the same time, fail above this. An image that never became searchable before its deadline counts as infinite | **Provisional.** About seven times the slowest steady value. The same investigation saw outliers of 44 to 234 s overnight; the likely cause is the file watch job queuing behind the lease of a resume page (the mechanism is established, each case is not proven). A 1% share of outliers like that fails the gate, as it should |
| `answerP95WarnMs` | 300 ms | G4 | p95 of the time from typing to the end of the result stream, over present checks in the `steady` phase (all phases when none is tagged `steady`) | **Provisional.** 300 ms is the wait the code gives CoreBox's interactive entry point `recommend()`, with the renderer giving up at 400 ms (`docs/engineering/specs/main-process/background-task-timeout-contracts.md:355`) |
| `answerP99FailMs` | 1000 ms | G4 | p99 of the same time, fail above this | **Provisional.** 1 s is the app's own error level for main-process and IPC work (`perf-monitor-config.ts:2` and `:4`; the warn level is 200 ms at `:1` and `:3`) |
| `blindShareFail` | 2% | G9 | Fail when the monitor could not see the app for more than this share of the run | Time the monitor was blind could have hidden anything; 2% of a one-hour run is 72 s. Longer blindness makes every other gate unreliable |
| `undecidedShareFail` | 2% | G2 | Fail when more than this share of checks ended in `error` or `skipped` | Below it the missing checks move a pass rate by at most 2 points; above it the pass rates stop meaning much. Any undecided check still warns |
| `frameCoverageMin` | 80% | G7 | Frames must have been measured for at least this share of the sampled time, otherwise G7 is `unknown` | Frame drops in the 20% nobody measured would not show |
| `outlierFactor` | 2 | case comparison | A dimension value is flagged when its p95 is more than this many times the p95 of **the rest of its class** | The brief says "2x the class-wide p95". The rest-of-class baseline (the class without that value) is used because a class-wide p95 includes the value itself: a slow value that makes up more than a few percent of the class pulls the class p95 up towards its own and hides |

Fixed in `report/limits.ts` and not overridable: `FLAG_MIN_SAMPLES` 5 (a group of fewer checks is never flagged: its p95 is one or two observations), `FLAG_MIN_P95_MS` 50 (a group whose p95 is under 50 ms is never flagged: 12 ms against 30 ms is noise), `APP_LAG_FLOOR_MS` 200 (the app's detector reports nothing below `LOOP_LAG_WARN_MS`, `perf-monitor-config.ts:30`, so only probe episodes of 200 ms or more are compared with what the app reported). The app's detector also ignores the first 2.5 s after it starts (`perf-monitor.ts:294-300` and `:387-392`) and treats a lag of 30 s or more as the machine sleeping (`perf-monitor-config.ts:35`), so the probes can see blocks the app cannot report; the report lists them as not reported by the app, and no gate depends on that.

G3 and G4 stay provisional until calibrated. To calibrate: run the `full` profile at least three times on a quiet machine with the app in the state the question is about, read p95 and p99 from `report.json` (`indexing.censored`, `answers.answerMs`), then set warn near 1.5x the worst p95 and fail near 2x the worst p99, rounded to 0.5 s. Write the date, the runs and the new numbers in this file.

`frameOver20msRatio` is provisional in the same way. To calibrate it: run the `full` profile at least three times on a quiet machine with a visible window, read the share over 20 ms per 10 s window (the breaches in `report.json`, and the Windows table for the whole-run share), and set warn near 1.5x the worst share of a healthy run. Raise warn if healthy runs sit above 2%; keep fail at or below the spec's 5%.

## What the frame probe cannot see

Frame intervals are the differences between consecutive `requestAnimationFrame` timestamps (`monitor/probes/scripts.ts`). Chrome stamps each callback with the vsync it was produced for, and when the main thread is blocked it replays the vsyncs it missed back to back, each with its original stamp. A stall leaves a gap in the stamps of (the vsyncs inside it minus one) periods, so a short one leaves none. Measured on 2026-10-30 in a throw-away headless Chrome at 60 Hz (`nice -n 10`, other work running on the machine), with one main-thread block every 160 ms, 31 blocks per size:

| Block | Stamp intervals over 20 ms (what the limits count) | Callbacks more than 25 ms after the previous one |
| ---: | ---: | ---: |
| 15 ms | 0 | 7 |
| 20 ms | 0 | 17 |
| 25 ms | 1 | 29 |
| 30 ms | 1 to 2 | 31 |
| 40 ms | 17 | 31 |
| 50 ms | 30 | 31 |
| 100 ms | 30 | 31 |

An idle page showed 0 or 1 stamp intervals over 20 ms in about 360 frames. So at 60 Hz the frame limits see stalls from about 40 ms and surely from 50 ms. The same arithmetic at 120 Hz puts the floor near 25 ms (derived, not measured: a headless run has no 120 Hz display; a stall under 25 ms never shows, half of those at 29 ms do, every one from 33 ms does), so sustained jank of 20 to 30 ms stays invisible to `frameOver20msRatio` and `frameOver50msRatio` alike. `rendererBlockMs` is not affected: long tasks and long animation frames start at 50 ms and come from the browser, not from the stamps.

Reading the time the callback actually ran (`performance.now()`) would see those stalls. A cutoff of 25 ms on that gap caught every block of 30 ms and longer above and hit 0 or 1 times in about 360 idle frames (the one hit was a real late frame the stamps saw too); a cutoff of 20 ms is too noisy at 60 Hz, with 5 to 17 hits in the same idle frames. It would also change what the frame count, the 50 ms count and the worst frame mean (the callback after a stall arrives in a pair, 0.2 ms apart), and every frame limit would need calibrating again, so it is not done here. Decide it once the first real runs show how the 20 ms share behaves.

## Fixed monitor constants

Not configurable; change them in the source and in this file together.

| Constant | Value | Where | Meaning |
| --- | ---: | --- | --- |
| `BLIND_SPAN_MS` | warn 5 s, fail 20 s | `monitor/thresholds.ts:38` | A probe that stays unreadable this long raises a `monitor-blind` breach |
| `PRESSURE_HOLD_MS` | 5 s | `monitor/thresholds.ts:41` | `pressure()` stays raised this long after the last observation over a limit, so a pacer does not flap |
| `CPU_ELEVATED_SHARE` | 0.7 | `monitor/thresholds.ts:44` | `pressure()` reports `elevated` once app-wide CPU passes 70% of its fail limit (210% by default) |
| Stall samples | at least 20 s apart, 12 per run | `monitor/sample.ts:8-9` | Bounds the cost of `sample` |
| Probe period | 1 s (`MonitorOptions.intervalMs`, at least 100 ms) | `monitor/index.ts:30,108` | How often each probe reads the app. Local state (the age of an unanswered request) is checked every 100 ms, and the heartbeat is peeked every 250 ms (`monitor/probes/main-loop.ts:18`) |
| Heartbeat | 25 ms timer, 10 ms histogram resolution | `monitor/probes/scripts.ts:7,10` | The smallest stall the main-loop probe can see |
| Windows | 5 s (CPU, loop p99), 10 s (frames) | `monitor/probes/process-cpu.ts:114`, `monitor/probes/scripts.ts:13`, `monitor/probes/renderer.ts:11` | Averaging spans behind the limits above |

## Overriding

| What | How |
| --- | --- |
| Monitor thresholds, for one run | CLI: `--thresholds mainLoopBlockMs=200:600,cpuPct=200:400,sampleOnBlockMs=250` (`key=warn:fail`; `sampleOnBlockMs` takes one number; ratios are fractions, `frameOver20msRatio=0.03:0.08`). Code: `createMonitor(handles, { thresholds: { cpuPct: { fail: 400 } } })`; either side of a pair can be given alone. Both values must be above 0 and warn must not exceed fail, otherwise `createMonitor` throws |
| Report limits, for one report | Code: `buildReport({ ...inputs, limits: { indexP95WarnMs: 4000 } })`. A value that cannot be right (a share above 1, `outlierFactor` of 1 or less, anything not above 0) throws. No CLI flag exposes these yet |
| The defaults | Edit `monitor/thresholds.ts` or `report/limits.ts`, update the tests that pin them (`monitor/thresholds.test.ts`, `report/limits.test.ts`) and this file in the same change. A new `{ warn, fail }` key also goes into `LEVEL_KEYS` (`monitor/thresholds.ts`), otherwise the monitor ignores an override of it; the CLI reads the same list (`run/args.ts`), so `--thresholds` accepts it with no second edit |

## Gate rules at a glance

| Gate | Fails when | Unknown when | Warns when |
| --- | --- | --- | --- |
| G1 Hard-check correctness | a hard-tier check gave a wrong answer | no hard check ran, or some were undecided and none failed | never |
| G2 Completeness | scenarios were never started or are unaccounted for, a planned class never ran, or undecided checks exceed `undecidedShareFail` | the plan was not supplied, or nothing ran | any undecided or repeated result, a class missing from the run, a count that disagrees with the plan |
| G3 Indexing speed | p99 above `indexP99FailMs` (never-searchable counts as infinite) | no create-image check was decided | p95 above `indexP95WarnMs` |
| G4 Search latency | p99 above `answerP99FailMs` | no present check was answered | p95 above `answerP95WarnMs` |
| G5 Main-thread responsiveness | a main-loop or renderer block of `fail` size, a p99 window above its fail limit, or an app-reported lag at the fail size | the monitor recorded no loop sample and the app reported none | any breach at `warn` size |
| G6 CPU and memory | a CPU or RSS breach at `fail` size | no CPU or no RSS sample | any breach at `warn` size |
| G7 Frame delivery | a frame breach at `fail` size: the share of frames over 20 ms, the share over 50 ms or the worst frame | no visible window delivered frames, or frames were measured in less than `frameCoverageMin` of the time | any frame breach at `warn` size |
| G8 Database integrity | a repair-class log marker, a quarantined file, or a failing `quick_check` | `quick_check` did not run after shutdown | a `suspect` log marker |
| G9 Monitor integrity | blind for more than `blindShareFail` of the run | the monitor wrote no samples | dropped timeline lines, or app-reported severe lags the probes missed |
| G10 Process stability | the app process exited during the run | the monitor wrote no samples | never |
| G11 Soft-tier quality | never | never | never (shown per class, informational) |

A run without a visible window cannot pass: G7 is `unknown`, and `unknown` fails the verdict. A `--ui hidden` run is still worth reading gate by gate for everything but frames. A hidden window never counts for frames, so slow frames in one cannot move G7. The G7 detail lists the episodes per limit (share over 20 ms, share over 50 ms, worst frame) with the peak of each; one stall can raise both shares, because a frame over 50 ms is also over 20 ms.

## What the report shows besides the gates

Everything is in `report.json`; `report.md` shows the head of each list and says how many entries it left out.

| List | In `report.json` | In `report.md` |
| --- | ---: | ---: |
| Hard checks that failed | first 200 | first 20 |
| Hard checks that could not be decided | first 100 | first 10 |
| Soft checks that missed | first 50 | first 10 |
| Breaches (fail first, then by time) | first 400, plus the total | first 40 |
| Slowest checks | 15 per timing | 15 per timing |
| Scenarios never started | first 20 ids, plus the total | first 20 ids |
| Values per dimension in the comparison | up to 100, otherwise the dimension is reported as too wide | the slowest 5, every flagged value and the weakest, at most 10 |
