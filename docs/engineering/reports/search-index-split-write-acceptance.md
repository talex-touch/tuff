# Acceptance: search-index split application evidence

> Migration note (2026-10-03): this living acceptance record is preserved verbatim from
> [`acceptance.md`](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-28-migrate-search-index-split-write-paths/acceptance.md)
> of the frozen task `07-28-migrate-search-index-split-write-paths`. "`prd.md` R3" below means that task's
> [baseline PRD](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/07-28-migrate-search-index-split-write-paths/prd.md); its frozen
> record is in the [backlog](../workflow/backlog.md#07-28-migrate-search-index-split-write-paths). Attach the
> run report here. The current owner closes R3 against user-agreed acceptance and observed application evidence; the frozen task remains read-only.

Status: **packaged isolated run executed and passed 62/62 on `v2.4.15-beta.13` (`darwin/arm64`, 2026-11-23); dev-launch path and non-macOS packaged runs remain unexercised.** Nothing below is claimed as observed except the sections marked `[executed]`. The frozen task record (`07-28-migrate-search-index-split-write-paths`) remains read-only, and all coverage boundaries below continue to apply.

## The one harness

`apps/core-app/scripts/search-split-app-evidence.ts` (driver) +
`apps/core-app/scripts/search-split-app-evidence.test.ts` (unit + real-SQLite contract tests).
It launches CoreApp itself, so the profile, the flag and the measurement are all under one process'
control and nothing has to be assembled by hand from three terminals.

```bash
# the whole gate: three launches, all state under a temp profile
pnpm -C apps/core-app run search-split:app-evidence -- --profile /tmp/tuff-split-evidence

# phase by phase, when an operator wants to watch a run
pnpm -C apps/core-app run search-split:app-evidence -- --profile /tmp/tuff-split-evidence --phase bootstrap
pnpm -C apps/core-app run search-split:app-evidence -- --profile /tmp/tuff-split-evidence --phase split
pnpm -C apps/core-app run search-split:app-evidence -- --profile /tmp/tuff-split-evidence --phase rollback

# judgement only: no launch, no database, no profile
pnpm -C apps/core-app run search-split:app-evidence:self-check

# offline cross-check of the same profile with the standalone verifier
pnpm -C apps/core-app run search-split:topology:verify -- \
  --profile /tmp/tuff-split-evidence --expect-split
```

Artifacts: `<profile>/.search-split-evidence/{state.json,phase-*.json,report.json,precore-*.json}`
and the app's own log under `<profile>/tuff-dev/logs/D.*.log`. The profile is deleted only when
`--cleanupProfile` is passed **and** every check passed.

## Isolation boundary (why a wrong `--profile` cannot damage a real one)

The profile is the only CoreApp `userData` this process points the app at, so the boundary is
enforced at every entry point, not just the CLI:

- `assertIsolatedProfileDir(profile)` refuses a path that is not under `os.tmpdir()`, `/tmp` or
  `/private/tmp`, a path inside the repository or under the home directory, **and** a path whose
  nearest existing ancestor resolves (via `realpath`) out of the temp root — so
  `--profile /tmp/link-into-home/...` is rejected before anything is created. It still accepts a
  not-yet-created leaf under a genuine temp root.
- `assertIsolatedFixtureRoot(profile, fixtureRoot)` requires the fixture root (the app's fake `HOME`
  and file-provider watch root) to be a real subtree of the profile, lexically **and** after
  resolution, so a symlinked fixture root cannot point the app's writes outside the profile.
- `prepareIsolatedProfile` re-runs both guards itself, so a direct import cannot bypass the CLI
  check; it resets an existing directory only when it is empty or carries the harness' own
  `PROFILE_OWNERSHIP_MARKER` (`tuff.search-split-evidence.profile/v1`), and refuses a symlink or
  non-directory outright. It never `rm`s a path it cannot account for.
- `prepareFixtureRoot` re-runs the profile and fixture-root guards and requires the profile's
  ownership marker before every seed, including an absent or empty fixture root. It preflights
  the canonical path of every Documents/Downloads destination and fixture file, refusing child
  directory or leaf symlinks that escape the fixture root before writing any seed.

The phases remain independently runnable (`--phase bootstrap` then `--phase split` then
`--phase rollback`): the mid-run reuse path checks the marker rather than in-process state, so the
`bootstrap → split → rollback` `state.json` survives as before.

## Assertion matrix

`phase` is the launch that produces the evidence. `split·bootstrap` means both phases assert it.

| id | phase | assertion | evidence | gate phrasing |
|----|-------|-----------|----------|---------------|
| isolation-effective | all | the app ran against the temp profile | precore diagnostic `userDataAfter` == `--profile` | constraint: no production profile |
| app-booted | all | the app reached a running state | CDP `/json/list` answers | — |
| indexing-settled | all | indexing finished within the budget | non-app `files` rows stable for `--stableMs` | — |
| the worker owns its own database file | split·bootstrap | the worker opened `search-index.db` under the profile | log `Search index database initialized` + `path` | "populated `search-index.db`" |
| no silent fallback to the primary database | split·bootstrap | search init did not degrade to the shared topology | absence of both `falling back to primary DB` warns | "no silent fallback" (R1) |
| provider writes waited for writer readiness | all | no split write ran before writer admission | absence of `File persistence port operation skipped: {port,readiness} unavailable` and of `SEARCH_INDEX_WRITER_*` / `FILE_PERSISTENCE_PORT_UNAVAILABLE` | "provider readiness ordering" (R1) |
| no contention warnings | all | no busy storm | `SQLITE_BUSY` / `SQLITE_LOCKED` / `database is locked` + health-threshold warns | "no busy storm" |
| judgeTopology(…, 'split') | split·bootstrap | index on the search home, no moved rows on the primary, app catalog not split | row counts in both files | "worker-owned `search-index.db`" |
| first-launch-reindex | bootstrap | an absent search file is rebuilt from scratch | `search-index.db` absent before the run, non-app `files` rows after | "first-launch full reindex" |
| no worker-owned write reached the primary | split·bootstrap | nothing wrote worker-owned data to `database.db`, including rows deleted again later | `tuff_split_write_sentinel` rows (AFTER INSERT/UPDATE/DELETE triggers) | "no worker-originating primary WAL growth" |
| the shared file carries the index again | rollback | `=0` puts the index back on `database.db` | non-app `files` rows on the primary | "toggle the flag off and confirm the rollback path" |
| the retired search file is not written while the split is off | rollback | the retired home stopped changing | search-home non-app `files` count vs the split-phase value | — |
| rollback writes reach the primary (positive control) | rollback | the detector is live and `=0` really routes to the primary | sentinel rows > 0 | — |
| the write detector is armed | split | every core guard was installed and survived the run | triggers present in `database.db`'s `sqlite_master` | — |
| the app catalog is still on the primary | rollback | the catalog did not move | `files` rows by type in both files | — |
| no app rows in the retired search file | rollback | the catalog never lands on the search home | search-home app rows == 0 | — |
| profile-topology-measured | all | a run that left no `database.db` fails rather than skips | file existence | — |
| count-parity | parity | app and file counts survive the rollback | `compareParity(split, rollback, 'shared')` over the **live homes**, never the union of both files | "matching pre/post counts" |
| query-parity | parity | the same rows answer the same queries in both topologies | per-query digests: split search home vs rollback primary | "correct app/file search results" |

### Reading the "no primary-WAL worker writes" row

`database.db-wal` legitimately grows during a run (app catalog, settings, task history), so its size
is not a usable assertion. The measurable form of "the worker's writes did not reach the primary" is
attribution, and that is what the sentinel provides: after-triggers in the primary record any
INSERT/UPDATE/DELETE against a worker-owned table, including a row inserted and deleted again before
measurement. `files` and `file_extensions` are guarded by *owner*, so the app catalog — which
belongs on the primary — does not fire them. Tables that cannot carry a trigger (`search_index` is
an FTS5 virtual table) are reported as uninstrumented rather than counted as covered, and a run
whose core guards could not be armed fails outright.

## Coverage boundaries (do not claim past these)

- No renderer-level search: rows are read from the databases the app wrote, not from the UI.
- No embedding-routing assertion: `embeddings` is not sentinel-guarded; the split-aware
  `EmbeddingService` unit evidence owns that contract.
- The app-catalog placement check is `not-exercised` on a profile with no catalog rows; pass
  `--seedAppCatalog` if that row is needed.
- `not-exercised` checks are printed and listed in `coverage.notExercised`: they do not fail the
  run, and they never count as passed.

## Executed so far

- `[executed]` `--self-check` — judgement assertions over synthetic logs, topologies, sentinels and
  digests; passes (`pnpm -C apps/core-app run search-split:app-evidence:self-check`, exit 0).
- `[executed]` `pnpm exec vitest run scripts/search-split-app-evidence.test.ts
  scripts/search-split-topology-verify.test.ts` — all contracts passing. Includes a real-SQLite test
  that arms the detector against a fabricated `database.db` and proves the trigger semantics
  (non-app rows and NULL-typed rows recorded, app rows not, FTS5 reported uninstrumented), the
  live-home parity case that the old union comparison passed wrongly, a process-group kill, and the
  full report pipeline (`judgeStateFile` → parity → `report.json` → redacted summary) driven from a
  collected state without launching CoreApp.
- `[executed]` Real-filesystem guard regressions: symlinked ancestors and fixture leaves refuse
  external writes; direct seeding cannot bypass profile ownership; multi-phase reuse preserves
  `state.json`. CLI `--profile "$HOME" --phase bootstrap` refuses before profile preparation.
- `[executed]` `tsc --noEmit` with the project's strictness (`strict`, `noUnusedLocals`,
  `noUnusedParameters`) over the harness, its tests and the topology verifier: clean. `scripts/search-split-*.ts`
  was added to `tsconfig.node.json`'s include list so this stays checked.
- `[executed]` CLI guard smoke: missing `--profile`, a profile under `~/Library/Application Support`,
  a profile inside the repository, an unknown `--phase`, `--phase split` without a bootstrap, and an
  inherited `TUFF_DB_SEARCH_SPLIT_ENABLED` each exit 1 with the intended message.

- `[executed]` **2026-11-23 packaged isolated 3-phase run (`v2.4.15-beta.13`, `darwin/arm64`, commit `645e8a01a`, synced via PR `#2278` `1598f49aa`)**:
  - Command: `pnpm -C apps/core-app run search-split:app-evidence -- --launch packaged --appBundle /Applications/Tuff.app --seedAppCatalog` against a non-system isolated sandbox profile.
  - Result: **62/62 assertions passed** (`bootstrap` 19/19, `split` 20/20, `rollback` 16/16, `parity` 7/7).
  - Observed metrics: `0 SQLITE_BUSY`, `0 SQLITE_LOCKED`, `0` worker-owned sentinel writes reaching primary `database.db`; `database.db` held `198` app rows; `search-index.db` held `4` non-app file rows and `202` `search_index` rows; rollback positive control recorded `13` primary writes; exact count-parity and query-parity matched across split and shared topologies.
  - Companion bug found & fixed: `file-scan-fd-backend.ts` did not canonicalize symlinked watch roots via `fs.realpath`, causing `isPathInsideRoot` to silently drop files under symlinked temp roots (fixed in PR `#2273` `44daa9e97`).

## Remaining unexercised scope (not claimed)

- The dev launch path (`pnpm run dev` → `electron-vite`) remains wired but unexercised by this harness.
- Non-macOS packaged runs (Windows / Linux) were not exercised by the 2026-11-23 `darwin/arm64` run.
- All limits in `## Coverage boundaries` remain in force (no renderer-level UI search assertion; no `embeddings` sentinel trigger — owned by `EmbeddingService` split unit evidence).
- Frozen task `07-28-migrate-search-index-split-write-paths` remains read-only; remaining R9 write-path convergence (such as AppProvider migration onto the worker typed persistence port) stays tracked in [`search-crossplatform-audit.md`](./search-crossplatform-audit.md).

## Hand-off for re-runs

1. `pnpm -C apps/core-app run search-split:app-evidence -- --profile /tmp/tuff-split-evidence`
   (or `--launch packaged --appBundle <path>` and optional `--repoSummary <file>` to emit a redacted summary).
2. If a phase fails, read `<profile>/.search-split-evidence/phase-<name>.json`; a failing run keeps
   its profile.
3. Re-run whenever split write-path ownership or worker persistence changes, and append the new observed evidence here rather than overwriting historical runs.
