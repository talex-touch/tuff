# Search and index stress harness

Repeatable stress test for CoreBox search and the file indexer. It starts one isolated dev instance of the app on a fresh profile and a seeded corpus, runs up to 10,000 *different* scenarios (searches for apps, files and images; creating, changing and ignoring image files in many ways) and watches CPU, event-loop stalls, frames and memory the whole time. The principle behind every gate: the app must not use too much CPU, stall or drop frames while it indexes and searches. macOS only; run everything from `apps/core-app`.

```
pnpm search:stress doctor                      # may a run start here? sizes the full profile first
pnpm search:stress probe                       # 8 canned searches, then a clean shutdown (diagnosis, measures nothing)
pnpm search:stress run --profile smoke         # 200 scenarios, the default
pnpm search:stress run --profile full --ui show --seed 1
pnpm search:stress report <runId|runDir>       # re-render report.md / report.json from the files on disk
pnpm search:stress gen --count 10000 --out /tmp/plan.json   # only generate and describe a plan
```

In a git worktree whose `node_modules` is a symlink to another checkout, do not use `pnpm` (it tries to reinstall and refuses): run `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false ./node_modules/.bin/tsx scripts/search-index-stress/cli.ts <command>` from `apps/core-app` instead.

## Commands and options

`doctor`, `gen`, `probe`, `report` and `run` print their options with `--help`. The ones that matter: `--profile smoke|full|burst` (200 / 10,000 / 1,500 create-image-heavy scenarios), `--seed N` (same seed and app list = same plan), `--count N`, `--ui hidden|show`, `--embedding off|on`, `--concurrency N` (6) and `--burst-concurrency N` (24), `--qps N` (15 searches per second, all scenarios together), `--nice N`, `--keep`, `--corpus-root DIR`, `--run-dir DIR`, `--thresholds k=warn:fail,...`, `--seed-timeout SEC`, `--search-timeout MS`, `--resume RUN`, `--apps-file FILE`.

`search-app` scenarios are built from the apps installed on this machine (names read with `plutil`; fewer than 10 usable apps makes `doctor` warn). `--apps-file` takes a JSON array of names instead, so a plan can be reproduced on another machine; the list used is stored in `plan.json`. Each app contributes a bounded number of name variants, so a short list makes `search-app` shrink and the other classes take up the slack; the plan still holds `--count` distinct scenarios.

## What a run does

1. Preflight (the same checks as `doctor`): refuses when your own dev instance is running, a port or the run lock is taken, the disk is too small, or the corpus location is one the indexer silently ignores.
2. Writes the corpus to `/Users/Shared/tuff-stress/<runId>/corpus` (outside `/tmp`, `/private` and `~/Workspace`, which the file traversal excludes) and the profile to `<runDir>/profile`.
3. Phases: `seed` (waits until a sample of the seeded files and apps is findable), `steady` (85% of the scenarios), `burst` (the rest, higher concurrency), `drain` (waits for the file index to go quiet). A pacer halves the load while the monitor reports elevated pressure and holds it while critical.
4. Stops the app, runs `PRAGMA quick_check` on its databases, writes the report. Scratch data is deleted only after a clean pass.

## Output: `/private/tmp/tuff-stress/<runId>/`

`report.md` and `report.json` (verdict, gates G1-G11, per-class results, indexing speed, answer times, case comparison, the exact command to repeat the run), `plan.json` (every scenario with its steps and checks), `meta.json`, `results.ndjson` (one line per check), `monitor-summary.json`, `db-integrity.json`, `evidence/`, `profile/` (kept unless the run passed). Evidence: `timeline.ndjson` (samples plus marks such as `seed:ready`, `scenario-batch:N`, `pacing:*`), `stall-*.sample.txt` (macOS `sample` taken during a long main-loop block), `db-marker-*.txt` (log excerpts around a database-repair marker), `app-stdout.log`. To replay one failed scenario by hand: `jq '.scenarios[] | select(.id=="<id>")' plan.json`, then match the time of its check in `results.ndjson` against the breaches and `timeline.ndjson`.

## Exit codes

`0` pass, `1` fail (a gate failed or is `unknown`, the app did not stop cleanly, or the run was stopped early), `2` refused or bad usage (nothing was started), `3` internal error (the error and the run directory are printed). A run without a visible window cannot pass: G7 (frames) is `unknown`, which fails the verdict. Read the other gates of a `--ui hidden` run; use `--ui show` for an acceptance run.

## Safety rules

- Never while your own `pnpm core:dev` instance is running; the preflight refuses (process and :5173 check).
- `--ui show` brings CoreBox to the front and steals focus. The default `hidden` never touches the screen. Either way the app starts without the detached DevTools a dev build opens by itself (`TUFF_DISABLE_AUTO_DEVTOOLS`, honoured only together with the isolated profile): they would take focus and tax the renderer under measurement.
- `--nice N` (default 10, `0` = off) runs the app and the runner at that nice level so the machine stays usable; a niced app on a busy machine can stall for reasons that are not its own, and the report records the level. Heavy jobs elsewhere (`tsc`, `vitest`) distort the numbers.
- One run at a time (lock `/private/tmp/tuff-stress/.lock`). One Electron instance, closed at the end.
- The app is never killed: quit over IPC, then SIGTERM, otherwise it is left running and its pid is printed. A killed app leaves `*.running` markers and the next start repairs the index, which G8 would flag.
- A `--corpus-root` you give is never deleted; the runner refuses a non-empty directory without its own marker file.
- Ctrl-C stops releasing scenarios, lets the running ones finish, stops the app and writes the report (exit 1). A second Ctrl-C only reminds you that it is shutting down.

## Resume

`run --resume <runId|runDir>` continues a stopped, failed or crashed run as a new segment on a new profile (`profile-2`, `evidence-2`, `monitor-summary-2.json`). Settings come from the run's `meta.json`; only `--keep` is read from the command line (the runner's own priority still follows `--nice`). Scenarios with a result stay, scenarios cut short are skipped (their file steps may be half applied) and show up as not run, the rest run. Monitor figures in the report describe the last segment. A finished run, or one with nothing pending, is refused.

## Thresholds and gates

`THRESHOLDS.md` holds every number, why it was chosen and the gate rules; `--thresholds` overrides the monitor ones for one run and `report.json` records what the run was judged against. `warn` never changes the verdict. G3 (indexing speed) and G4 (search latency) limits are provisional until calibrated with three quiet `full` runs.

## Extending and limits

New scenario variety goes into `gen/dimensions.ts` (a dimension value plus the classes that allow it); `gen` lists the values a plan leaves uncovered. Not covered: other platforms, the packaged release build, real screenshot tools, and anything the isolated profile does not reproduce (the user's own index and settings). Files only appear while the app runs, so the live watcher path is what is measured; the hot-directory catch-up that runs once at boot (files that landed while the app was down) needs a stop, add files, start phase this harness does not have yet.
