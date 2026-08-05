# Implementation Plan — Database single-writer root fix

Working set: `apps/core-app/src/main/db/**`, `apps/core-app/src/main/modules/**` (call
sites listed in design.md D3), `apps/core-app/src/main/modules/database/index.ts`.
Never touch unrelated dirty files in the working tree (90 dirty paths from other work).

## Phase 0 — Baseline & split validation evidence (V1)

- [ ] 0.1 Record baseline: run `pnpm core:dev` (defaults), capture startup log; note
      `DATABASE_BUSY_RETRY_EXHAUSTED` / `DB write task waited` occurrences.
- [ ] 0.2 Run `TUFF_DB_SEARCH_SPLIT_ENABLED=1 pnpm core:dev`; verify:
      `Search index database initialized`, worker `Initialized`, reindex completes,
      CoreBox search returns results, zero busy-exhausted on primary.
- [ ] 0.3 Relaunch (flag still on): reindex skipped (scan progress persisted); search
      still works. Save both logs into `research/` of this task.
- Gate G0: if V1 fails, STOP — fix the split before any scheduler work (root cause
  first). Do not proceed to Phase 1 with a broken split.

## Phase 1 — Scheduler-native busy retry (commit A)

- [ ] 1.1 `db/sqlite-retry.ts`: export `incrementSqliteBusyRetryCount()` and
      `notifySqliteRetryExhausted(event)` (reuse existing listener registry; no
      behavior change for `withSqliteRetry` itself).
- [ ] 1.2 `db/db-write-scheduler.ts`: add `busyRetries/busyBaseDelayMs/busyMaxDelayMs`
      to options + label policies (defaults: background/best_effort 6, interactive 3,
      critical 6); add `busyAttempts`/`nextEligibleAt` to tasks; eligibility-aware
      `pickNextTaskIndex`; idle-timer re-kick when nothing eligible; busy → re-enqueue
      with backoff; exhausted → notify + reject + circuit accounting on final failure
      only; preserve `enqueuedAt` across re-enqueues.
- [ ] 1.3 Unit tests (new or extend `db/db-write-scheduler.test.ts` if present; else
      create): busy task backs off while a second task executes in between (no
      head-of-line block); exhaustion rejects with original error + exhausted event
      fired once; droppable task ages out during backoff; non-busy error rejects
      without retry; nested schedule (taskContext) unchanged.
- [ ] 1.4 Validate: `cd apps/core-app && npx vitest run src/main/db/` and
      `npm run typecheck:node`.
- Rollback point: revert commit A (no call sites depend on new options yet).

## Phase 2 — Call-site convergence (commit B)

- [ ] 2.1 Create `db/db-write.ts`: `scheduleDbWrite`, `scheduleAuxWrite` (enqueue-time
      `{db, lane}` resolution per design; lane is a no-op passthrough until Phase 3 —
      accept and store the option now).
- [ ] 2.2 Migrate call sites (design.md D3 inventory; re-grep first:
      `grep -rn "withSqliteRetry" apps/core-app/src/main --include="*.ts" | grep -v test`):
      delete inner `withSqliteRetry`, delete per-module `withDbWrite`/`withWrite`
      wrappers, keep labels and per-label options identical (telemetry 15s maxQueueWait,
      app-config `retries:3, baseDelayMs:50`, recommendation latest_wins budgetKey, …).
- [ ] 2.3 Route bypasses through the helper: `recommendation-engine.ts` analytics
      insert, `db/utils.ts` `cleanExpiredRecommendationCache`.
- [ ] 2.4 V3 (adjacent-defect verification): for each aux store (telemetry, analytics
      report-queue, analytics db-store, clipboard-meta, ocr, recommendation), confirm
      construction timing vs background aux init; note which ones held a stale primary
      fallback. Fix via `scheduleAuxWrite`'s enqueue-time resolution; record findings in
      the task journal (this is in-scope: it is R3's mechanism, not scope creep).
- [ ] 2.5 Grep gate: `grep -rn "schedule([^)]*withSqliteRetry" apps/core-app/src/main
      --include="*.ts" | grep -v test` → 0 hits. Remaining `withSqliteRetry` usages
      must be non-scheduler paths (worker direct mode, reads) — list them in the
      journal with one-line justification each.
- [ ] 2.6 Validate: `npm run typecheck` (node+web) + `npx vitest run` for touched
      module suites (database, storage, ocr, analytics, search-engine, catalog).
- Rollback point: revert commit B (A stays safe).

## Phase 3 — Per-file lanes (commit C)

- [ ] 3.1 Scheduler: per-lane queues + loops (`'primary' | 'aux'`), per-lane
      `getStats`/`getDetailedStats` breakdown with backward-compatible aggregates;
      `drain()`/`waitForCapacity` across lanes; WAL-checkpoint busy-gating reads
      primary lane only (`database/index.ts` `getDbSchedulerBusyReason`).
- [ ] 3.2 `scheduleAuxWrite` activates real lane routing.
- [ ] 3.3 Tests: aux task proceeds while primary task is in busy backoff; drain waits
      both lanes; health-snapshot aggregates unchanged shape.
- [ ] 3.4 Validate: vitest db/ + database module suite; typecheck:node.
- Rollback point: revert commit C.

## Phase 4 — Startup gating (commit D)

- [ ] 4.1 Telemetry retention caller (privacy scheduled cleanup): skip DB-write portion
      inside `isInStartupDegradeWindow()`; next run covers it.
- [ ] 4.2 App-provider startup backfill: defer past the degrade window.
- [ ] 4.3 UsageSummaryService: initial delay past the window.
- [ ] 4.4 Validate: typecheck:node + affected suites; grep no other boot-time
      `schedule(` callers fire before `ALL_MODULES_LOADED` with heavy writes (spot
      check app logs in Phase 6).
- Rollback point: revert commit D.

## Phase 5 — Flip the split default (commit E)

- [ ] 5.1 `runtime-flags.ts`: `DB_SEARCH_SPLIT_ENABLED` default → `true`; rewrite the
      comment (validated on 2026-08-04 app-run; env kill switch documented).
- [ ] 5.2 Confirm fallback path still compiles/tests with flag forced off
      (`TUFF_DB_SEARCH_SPLIT_ENABLED=0` smoke run).
- Rollback point: env var at runtime; revert one-liner in code.

## Phase 6 — Full validation run (V2) + compat retirement (commit F)

- [ ] 6.1 V2: `pnpm core:dev` with all-default env, cold start → 5 min (startup
      indexing + CoreBox toggles + a few searches). PASS = zero
      `DATABASE_BUSY_RETRY_EXHAUSTED`, zero `DB write task waited >2000ms`, zero
      `storage.polling` timeout; `search-index.db` present and growing; health
      snapshot `busyRetryDelta` ≈ 0.
- [ ] 6.2 Compare against 0.1 baseline; save log to `research/`.
- [ ] 6.3 Commit F: remove `.compat` writes (telemetry `clearFailureBefore` coreDb
      branch, report-queue coreDb write); keep read-fallbacks; update their tests.
- [ ] 6.4 Re-run touched suites + typecheck.
- Gate G6: if V2 shows any busy-exhausted event, treat as defect — diagnose lane/retry
  first, do NOT paper over with raised timeouts.

## Phase 7 — Wrap-up (Trellis Phase 3)

- [ ] 7.1 Spec update (`trellis-update-spec`): record the two contracts as spec:
      "one writer connection per SQLite file" and "never sleep while holding the write
      queue; busy-backoff = delayed re-enqueue" + the shared-helper convention
      (`scheduleDbWrite`/`scheduleAuxWrite` only; no ad-hoc schedule+retry wrappers).
- [ ] 7.2 Debug retrospective (`trellis-break-loop`): why did #295's fix ship dark for
      2 weeks — capture "validation-gated flags need an owner + deadline" as process
      learning.
- [ ] 7.3 Commits per rollout order A–F (scoped files only; verify with
      `git show HEAD:path`, never stash/checkout).

## Validation commands (reference)

```bash
cd apps/core-app
npm run typecheck            # node + web
npx vitest run src/main/db/
npx vitest run src/main/modules/database/ src/main/modules/storage/
grep -rn "schedule([^)]*withSqliteRetry" src/main --include="*.ts" | grep -v test  # → empty
pnpm core:dev                # V1/V2 app runs from repo root (env per phase)
```
