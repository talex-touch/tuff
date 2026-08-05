# Database single-writer root fix: land search split, de-amplify write queue

## Background

Every dev/app run logs recurring `SQLITE_BUSY` failures on `database.db` during the startup
window (~0–60s): `DATABASE_BUSY_RETRY_EXHAUSTED` (telemetry retention compat, app-provider
backfill, system-update state), `DbWriteScheduler` queue waits of 4–9s
(storage.config.persist, ocr.jobs.fail), and `storage.polling` 15s timeouts. Root-cause
analysis (2026-08-04) identified four interlocking mechanisms:

- **R1 (structural)**: two writer connections on `database.db` — main process
  (busy_timeout 2s) and the search-index worker thread (busy_timeout 30s). The
  single-writer-per-file fix (issue #295, `search-index.db` split) was fully implemented
  and tested on 2026-07-23 but ships dark behind `DB_SEARCH_SPLIT_ENABLED` (default off);
  the planned app-run validation never happened.
- **R2 (amplifier)**: ~20 modules wrap `withSqliteRetry` **inside**
  `dbWriteScheduler.schedule()`, so busy-backoff sleeps (up to ~9s) hold the head of the
  single global write queue and block all unrelated writes across all three DB files.
  `app-config-repository.ts` already inverted this locally with an explanatory comment;
  the pattern was never generalized.
- **R3 (aggravator)**: before the background aux-DB init completes, hot-table writes fall
  back to the primary DB during the most contended startup window; `.compat` dual-write
  paths keep writing the primary DB permanently even after aux is ready.
- **R4 (minor)**: boot-time maintenance writes (telemetry retention, app backfill, usage
  summary, system-update state) all fire in the first seconds, colliding with the worker's
  startup indexing storm.

Prior fixes (QoS, circuits, retries, aux split, health reporting) mitigated symptoms; the
structural fix exists but was never landed. This task lands it and removes the amplifiers.

## Goal

Make `SQLITE_BUSY` on the primary DB structurally impossible in steady state (single
writer per SQLite file), and make residual contention non-cascading (no queue
head-of-line blocking, no cross-file queue coupling), so startup no longer produces
`DATABASE_BUSY_RETRY_EXHAUSTED` or multi-second write-queue waits.

## Requirements

- **FR1 — Land the search split (R1)**: validate `DB_SEARCH_SPLIT_ENABLED=true` in a real
  app run, then flip the default to `true`. The search-index worker must be the sole
  writer of `search-index.db`; the main process remains the sole writer of `database.db`
  and `database-aux.db`. Env override must remain as an emergency kill switch.
- **FR2 — Move busy-retry out of the queue (R2)**: the write scheduler must never sleep a
  backoff while holding the queue. Busy failures re-enter the queue with delayed
  eligibility (or equivalent) so other tasks proceed during backoff. Existing per-label
  circuit-breaker and priority semantics are preserved.
- **FR3 — Converge call-site wrappers (R2)**: replace the ~20 duplicated
  `schedule(label, () => withSqliteRetry(op))` wrappers with one shared helper so the
  retry placement cannot regress per-module. Known direct-write bypasses
  (`recommendation-engine.ts` plugin-analytics insert, `db/utils.ts`
  `cleanExpiredRecommendationCache`) route through the scheduler.
- **FR4 — Per-database write lanes (R3)**: writes targeting `database-aux.db` must not
  queue behind `database.db` contention (and vice versa). Lane selection must respect the
  aux→primary fallback at enqueue time. WAL-checkpoint gating and `drain()` semantics
  stay correct per lane.
- **FR5 — Startup write-storm gating (R4)**: boot-time maintenance writes (telemetry
  retention, app-provider backfill, usage summary initial run, system-update state
  persist) defer past the startup window using the existing degrade-window mechanism.
- **FR6 — Compat dual-write retirement plan (R3)**: stop `.compat` writes to the primary
  DB for aux-owned tables (telemetry upload stats, analytics report queue) while keeping
  read-fallback for one more release; document rollback.

## Constraints

- LibSQL local binding is synchronous on the calling thread: the main-process
  busy_timeout must stay short (2s); never busy-wait on the main thread.
- Flipping FR1's default triggers a one-time full search reindex on first launch (search
  data is rebuildable by design); this is accepted, but must be observed working in the
  validation run, and the fallback (flag off) must keep working.
- No behavior change for the worker's own write path semantics (direct mode, its own
  30s busy_timeout) other than the file it opens.
- Public API of `dbWriteScheduler.schedule()` may gain options but must stay
  backward-compatible for untouched call sites during migration.
- Multiple agents work in this repo concurrently: commits must include only files owned
  by this task's scope; use `git show HEAD:path` (never stash/checkout) for verification.

## Acceptance Criteria

- [ ] App run with the new defaults: from cold start through first 5 minutes (including
      full startup indexing), logs contain **zero** `DATABASE_BUSY_RETRY_EXHAUSTED` and
      zero `DB write task waited >2000ms` warnings attributable to busy-backoff blocking.
- [ ] `search-index.db` is created and written only by the worker; `database.db` shows a
      single writer connection from the main process (verified via logs + code paths).
- [ ] CoreBox search returns results after the one-time reindex on first launch with the
      split enabled; a second launch skips the reindex.
- [ ] Scheduler unit tests cover: busy → delayed re-enqueue (queue continues with other
      tasks during backoff), retry exhaustion → rejection + circuit behavior, lane
      isolation (aux task not blocked by busy primary task), drain across lanes.
- [ ] All previous call sites compile against the shared helper; no remaining
      `schedule(label, () => withSqliteRetry(...))` pattern in `src/main` (guarded by a
      grep check in the quality gate).
- [ ] `pnpm` typecheck (`npm run typecheck` in apps/core-app) and existing vitest suites
      for touched modules pass.
- [ ] Emergency rollback documented: `TUFF_DB_SEARCH_SPLIT_ENABLED=0` reverts to the
      shared-file topology without data loss; compat-write removal has a revert path.

## Out of Scope

- Renderer-side storage/IPC changes; plugin SDK changes.
- Schema changes or data migrations beyond what the existing split/aux code already does.
- The file-index worker (`file-index-worker-client.ts`) read paths, except where they
  share the converged write helper.
