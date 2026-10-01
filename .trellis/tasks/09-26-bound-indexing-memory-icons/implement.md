# Implementation

Post-beta54 state: the original steps 1–3 are shipped; only the acceptance/residual order below is left.
Reconciliation with evidence: `research/2026-09-29-master-reconciliation.md`. Prior runtime evidence:
`research/verification-2026-09-26.md`.

## Closed ledger — do not reimplement

Landed by `b3edffef1` (this task) and reworked/shipped by `728d251a0` + `bd86b0af1`
(`.trellis/tasks/09-29-bounded-fd-fzf-file-indexing/`, beta54). Keep these as facts, not as work items:

- Diagnostics without extending idle worker lifetime; scheduler admission and result ownership bounded
  (100 submitted → 1 active + 1 queued, 1960 deferred records; utils 23/23, CoreApp 198/198 focused tests);
  dirty markers commit with metadata; byte-budget, publication-ownership and cancellation cases covered.
- Icon cutover to on-demand path delivery with every caller migrated; real app rendered
  `tfile:///…/Caches/file-icons/<sha256>.png` at 64px with hash reuse; `iconGeneratedBytesCumulative` stayed 0
  across a whole-home scan; protocol roots are the exact owned icon cache directory.
- Legacy conversion service, native minidump lifecycle diagnostics, 100k campaign, three-hour residency, replay-loop
  regression and graceful shutdown: all recorded on 2026-09-27 (see the verification log). R10 subfindings
  (batch ceiling 10, watch task-state coalescing, source-scoped diagnostics, split-off/opener icon writer lanes) are
  closed there too.
- Superseded by beta54: the beta.41 admission baseline, the single-queue memory contract, and every acceptance run
  made with enrichment implicitly on or the legacy walker as the default. Do not replay them.

## Remaining order

- [ ] **O1 — Cold-scan icon budget probe under the fd backend** (probe only; production edit only on failure).
- [ ] **O2 — Legacy icon conversion campaign**: completion, mid-pass kill/restart resume, failure preservation,
      page rate and peak RSS at legacy scale.
- [ ] **O3 — Native crash delivery re-confirmation** on the current Electron build (isolated SEGV → restart →
      independently observed receipt, or the exact external blocker).
- [ ] **O4 — 100k / three-hour isolated acceptance re-baseline** on the shipping pipeline: default profile
      (fd backend, content indexing off) plus a content-indexing-on control.
- [ ] **Close-out**: record residual external blockers in `task.json`, delete owned scratch artifacts, keep real
      profiles and live processes untouched. No commit/push/release.

## Next slice (S1) — icon substrate re-acceptance = O1 + O2

S1 is the smallest slice that closes two unchecked PRD criteria, needs no 3-hour run, and is expected to require
**no production edits**. All work happens under `/tmp`; the real profile is never opened for write.

### Exact files

Read/reference (no edits expected):

- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-icon-migration-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-asset-service.ts` (`:176` scheduling, `:254` thumbnails-only post-scan pass)
- `apps/core-app/src/main/db/utils.ts` (`:246` page, `:266` value read, `:283` compare-and-update)
- `apps/core-app/src/main/service/icon-service.ts`, `apps/core-app/src/main/service/file-icon-artifact.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-runtime-evidence.ts` (`:238` `iconGeneratedBytesCumulative`)
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` (`:2145` migration scheduling; asset callers)

Edit only if a probe fails, inside the file that the failing assertion names:

- scan-path icon write → `file-provider-asset-service.ts`
- conversion stall/loop/no-resume → `file-provider-icon-migration-service.ts` (+ `db/utils.ts` if the page query is at fault)

### Contracts

1. Cold scan over an existing-row tree produces **no** new `data:image/png;base64,%` icon value and keeps
   `iconGeneratedBytesCumulative === 0`; the post-scan pass touches thumbnails only.
2. Lazy rendering still resolves `tfile:///…/Caches/file-icons/<sha256>.png`, several rows share one hash file, and
   app rows resolve from `app-icons`.
3. A conversion pass terminates with `scanned === converted + skipped + failed` and **zero** remaining
   `data:image/png;base64,%` icon values for `files.type = 'file'` rows in the isolated database.
4. `skipped`/`failed` rows keep their original value byte-for-byte (compare `length(value)` and prefix before/after).
5. A `SIGTERM` during a page, followed by a cold restart, resumes at the next keyset id: no value is converted twice,
   no value is lost, and the second pass's `scanned` count equals the rows that were still legacy-shaped at start.
6. Page rate (rows/second) and peak RSS are recorded so the residual drain time on a 250k-row legacy profile is an
   explicit number, not a guess.

### Acceptance probes

```bash
# Isolated legacy-shaped profile: synthetic tree + legacy data-URL icon rows seeded directly.
#   TUFF_STARTUP_BENCHMARK_USER_DATA_DIR=/tmp/tuff-1964-o2/userData
#   TUFF_FILE_PROVIDER_BASE_WATCH_PATHS=/tmp/tuff-1964-o2/tree
#   TUFF_DISABLE_GLOBAL_SHORTCUTS=1
# P1 scan budget: grep the run log for `iconGeneratedBytesCumulative` and the `file-icon.persist` lane; diff
#    `SELECT count(*) FROM file_extensions WHERE key='icon' AND value LIKE 'data:image/png;base64,%'` before/after.
# P2 lazy delivery: query one row's `tfile://` URL, assert the PNG exists under the isolated Caches/file-icons root
#    and that at least two rows share one file name.
# P3 completion: run until `File icon migration pass finished` logs scanned/converted/skipped/failed; assert
#    scanned == converted + skipped + failed and the legacy-value count reaches 0.
# P4 kill/resume: SIGTERM mid-pass, restart with the same profile, assert the second pass's scanned count equals the
#    remaining legacy rows and no previously converted value regressed to a data URL.
# P5 failure preservation: make the cache directory read-only for one page and assert those rows keep their original
#    value while `failed` increments.
```

Focused suites to run once at the end of S1 (not mid-flight):

```bash
pnpm -C apps/core-app exec vitest run \
  src/main/service/file-icon-artifact.test.ts \
  src/main/service/icon-service.test.ts \
  src/main/modules/box-tool/addon/files/services/file-provider-icon-migration-service.test.ts \
  src/main/modules/box-tool/addon/files/services/file-provider-icon-cache-service.test.ts \
  src/main/db/utils.icon-migration.test.ts \
  src/main/modules/file-protocol/file-icon-cache-root.test.ts
pnpm -C apps/core-app run typecheck:node
```

### Do not

- Do not re-plan or re-implement admission, byte budgets, the content-index policy, fd enumeration, progress
  services, or the icon API surface — all landed (`research/2026-09-29-master-reconciliation.md` §1).
- Do not run the conversion against the real profile, delete rows, or VACUUM.
- Do not fold the 09-29 AC7 idle-CPU baseline into this task.

## Ownership (this wave)

- Main: task artifacts, slice sequencing, shared verification, `task.json` close-out.
- Probe owner for O1/O2: isolated profile, evidence log under `research/`, production fix only on failure.
- O3 owner: `core/precore.ts` + `modules/sentry/sentry-service.ts` read-only unless a hook is proven wrong.
- O4 owner: campaign harness + evidence log; no production edits expected.

All agents skip formatter/lint/build/test during mutation; Main runs the shared pass once. No sibling edits to the
same file without ownership transfer.

## Stop conditions

- Stop O2 and report if a page cannot advance (`afterId` does not progress) or if a converted value reappears as a
  data URL after restart — that is a correctness defect, not a throughput issue.
- Stop O4's default profile if content indexing is not observably off (parser activity > 0) — the probe would be
  measuring the wrong configuration.
- Never trade coverage, depth, symlink, root-completion or shutdown semantics for speed, and never raise V8 heap
  limits or shrink search scope to pass a probe.
