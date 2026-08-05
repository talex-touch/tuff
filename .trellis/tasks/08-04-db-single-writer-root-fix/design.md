# Design — Database single-writer root fix

## Target topology (end state)

```
main process ──(sole writer, busy_timeout 2s)──► database.db      (primary lane)
main process ──(sole writer, busy_timeout 2s)──► database-aux.db  (aux lane)
search-index worker ──(sole writer, 30s)──────► search-index.db   (worker-owned)
```

One writer connection per SQLite file. Cross-connection `SQLITE_BUSY` on the primary DB
becomes structurally impossible; `busy_timeout` and retry become safety nets instead of
load-bearing mechanisms (SQLite's documented best practice for WAL concurrency).

## D1 — Land the search split (FR1)

All plumbing exists (issue #295, commits 95eee4e83 / c86d82db5 / c5e952c3c):
`DatabaseModule.initSearchDatabase()` creates `search-index.db` + runs migrations;
`getSearchDatabaseFilePath()` routes the worker; provider dbUtils route through the
worker when split is on; tests cover the routing.

Change:
- `apps/core-app/src/main/db/runtime-flags.ts`: `DB_SEARCH_SPLIT_ENABLED` default
  `false → true`; update the comment (no longer "ships dark").
- Env override semantics unchanged: `TUFF_DB_SEARCH_SPLIT_ENABLED=0` is the kill switch.

Validation before the flip (V1): run `pnpm core:dev` with `TUFF_DB_SEARCH_SPLIT_ENABLED=1`,
observe: `Search index database initialized`, worker `Initialized`, one-time reindex
completes, CoreBox search works, no `DATABASE_BUSY_RETRY_EXHAUSTED`. Second launch skips
reindex (scan progress persisted in `search-index.db`).

Rollback: env var, or revert the one-line default. Flag off → worker reopens
`database.db`; the orphan `search-index.db` is inert (main-thread read connection falls
back to primary via `getSearchClient()`); flag back on → reindex resumes. No data loss
either direction (search data is rebuildable; primary data never moves).

## D2 — Scheduler-native busy retry (FR2)

Today ~20 modules run `withSqliteRetry` *inside* the scheduled operation: backoff sleeps
(200ms→3s exp, ≤6 retries ≈ 9s) execute while the task owns the single queue head. Fix:
the scheduler itself owns busy-retry, and backoff time is spent *queued, not executing*.

### Contract changes (`db/db-write-scheduler.ts`)

```ts
interface ScheduleOptions {
  // existing fields unchanged …
  busyRetries?: number        // default from label policy; 0 disables
  busyBaseDelayMs?: number    // default 200
  busyMaxDelayMs?: number     // default 3000
}
// internal task fields
busyAttempts: number          // starts 0
nextEligibleAt: number        // 0 = eligible now
```

### Loop semantics

- `pickNextTaskIndex` only considers tasks with `nextEligibleAt <= now` (priority, then
  FIFO, as today).
- If the queue is non-empty but nothing is eligible: release `processing`, arm a single
  timer for `min(nextEligibleAt) - now`, re-`kick()` on fire. Never spin, never sleep
  while holding the loop.
- Execute the operation once (no inner retry). On failure:
  - `isSqliteBusyError(error)` and `busyAttempts < busyRetries`: increment
    `busyAttempts`, set `nextEligibleAt = now + backoff(busyAttempts)` (same exp+jitter
    math as `withSqliteRetry`), re-enqueue the *same task object*; increment the shared
    `SQLITE_BUSY_RETRY_COUNT` (export an increment fn from `sqlite-retry.ts`) so the
    health snapshot's `busyRetryDelta` stays meaningful.
  - Busy and exhausted: fire the retry-exhausted notifier (export
    `notifySqliteRetryExhausted` from `sqlite-retry.ts`; DatabaseModule's listener and
    OperationalError reporting keep working with unchanged labels), then reject; per-label
    circuit accounting (`markTaskFailure`) runs only on this final failure — circuit
    trip rates keep today's meaning.
  - Non-busy error: reject immediately (unchanged).
- `enqueuedAt` is preserved across re-enqueues: droppable tasks still age out via
  `maxQueueWaitMs` (a busy-looping best-effort task should drop, not retry forever);
  `dropPolicy: 'none'` tasks are never dropped by aging (unchanged).
- Reentrancy guard (`taskContext`) unchanged: nested `schedule()` inside a task still
  executes directly.

### Why re-enqueue instead of retry-outside-schedule at call sites

`app-config-repository.ts` proved retry-outside works, but it costs one queue round-trip
per attempt *per call site convention* — every module must remember the pattern. Making
the scheduler own it removes the class of regression (FR3) and keeps backoff accounting,
circuits, and metrics in one place.

## D3 — Call-site convergence + per-file lanes (FR3, FR4)

### Shared helper (new `db/db-write.ts`)

```ts
export function scheduleDbWrite<T>(label, op, options?): Promise<T>      // primary lane
export function scheduleAuxWrite<T>(label, opFactory: (db) => Promise<T>, options?): Promise<T>
```

- `scheduleDbWrite` = `dbWriteScheduler.schedule` with busy-retry defaults on.
- `scheduleAuxWrite` resolves `{ db, lane }` **together at enqueue time**:
  `db = databaseModule.getAuxDb()`, `lane = databaseModule.isAuxReady() ? 'aux' : 'primary'`.
  The op receives the resolved handle. This kills two bugs at once:
  1. lane always matches the file actually written (no cross-lane writes to one file);
  2. **discovered adjacent defect**: stores that capture `auxDb` in their constructor
     (telemetry, analytics, …) race the background aux init — constructed before aux is
     ready, they can hold the primary fallback for the whole process lifetime.
     Enqueue-time resolution removes the stale-capture class. (V3 verifies per store.)

Migration: replace every `withDbWrite`/`withWrite` private wrapper and inline
`schedule(label, () => withSqliteRetry(op))` with the helper; delete the inner
`withSqliteRetry`. `withSqliteRetry` remains for non-scheduler paths (worker direct mode,
read-side retries). Known scheduler-bypassing writes route through the helper:
`recommendation-engine.ts:174` (plugin-analytics insert), `db/utils.ts`
`cleanExpiredRecommendationCache`.

Full call-site inventory (from 2026-08-04 grep; re-verify at implementation time):
`db/utils.ts`, `ai/intelligence-audit-logger.ts`, `ai/intelligence-context-hygiene.ts`,
`ai/intelligence-local-knowledge-engine.ts`, `box-tool/addon/apps/app-provider.ts`,
`box-tool/addon/files/embedding-service.ts`, `box-tool/addon/files/file-provider.ts`,
`box-tool/search-engine/{query-completion-service, indexing-task-state-store,
search-index-service, time-stats-aggregator, usage-stats-queue}.ts`,
`catalog/catalog-repository.ts`, `clipboard/clipboard-meta-persistence.ts`,
`ocr/ocr-service.ts`, `privacy/owner-utils.ts`, `sentry/telemetry-upload-stats-store.ts`,
`analytics/report-queue-store.ts`, `analytics/storage/db-store.ts`,
`system-update/index.ts`, `storage/app-config-repository.ts` (migrates its
outside-retry to the builtin; keep its tuned `retries:3, baseDelayMs:50` via options).

### Lanes

- `ScheduleOptions.lane?: 'primary' | 'aux'` (default `'primary'`).
- Internally: one queue + one processing loop **per lane**; each lane runs at most one
  task (single writer per file), lanes run concurrently (different files — no lock
  contention; LibSQL sync-binding means executes still interleave on the thread, but
  neither blocks the other's file lock).
- `drain()` awaits all lanes; `waitForCapacity` and stats gain per-lane breakdowns while
  keeping aggregate fields backward-compatible (health snapshot, WAL-checkpoint gating).
- WAL checkpoints: primary-DB checkpoint schedules into the primary lane (as today via
  its `schedule` call); its busy-gating reads primary-lane stats only.

## D4 — Startup write-storm gating (FR5)

Reuse `isInStartupDegradeWindow()` (`runtime-flags.ts`, 120s). At the three boot writers:

- telemetry retention (privacy scheduled cleanup path): skip the DB-write portion during
  the window; the next scheduled run covers it (idempotent retention).
- app-provider startup backfill: delay until window end (`setTimeout` / next poll tick).
- UsageSummaryService initial run: add initial delay past the window.

`system-update.state.update` is left as-is (single small write; harmless once D1–D3
land). No new framework — three local gates.

## D5 — Compat dual-write retirement (FR6)

- `sentry/telemetry-upload-stats-store.ts`: drop the `.compat` (coreDb) write branch in
  `clearFailureBefore`; keep the coreDb read-fallback in `get()`.
- `analytics/report-queue-store.ts`: drop the `.compat` coreDb write; keep read-fallback.
- Stale rows remain in the primary DB (inert; aux reads win). Rollback = revert commit;
  no migration needed either direction.

## Tradeoffs / alternatives considered

- **Serialize worker writes through the main scheduler (no split)**: rejected — IPC hop
  per batch, main-thread sync-binding stalls, and #295 already built + tested the split.
- **Raise main busy_timeout instead**: rejected — sync binding freezes the UI thread for
  the full wait (the 2s value is deliberate, `database/index.ts:46-54`).
- **Per-call-site retry-outside (generalize app-config pattern)**: rejected in favor of
  scheduler-native retry — same semantics, one implementation, un-regressable.
- **BEGIN IMMEDIATE transactions**: unnecessary once single-writer holds; drizzle/libsql
  batching stays as-is.

## Rollout / rollback

Commit sequence (each independently revertible, per-file `git show HEAD:path`
verification only — concurrent agents in this repo):

1. **A**: scheduler-native busy retry + eligibility timing + unit tests (no call-site
   changes; inner retries still work during overlap, just redundant).
2. **B**: call-site migration to `scheduleDbWrite`/`scheduleAuxWrite`; grep gate goes
   green (`schedule(label, () => withSqliteRetry` → 0 hits in `src/main`).
3. **C**: lanes + enqueue-time aux resolution (+ stats/drain updates + tests).
4. **D**: startup gating (3 sites).
5. **E**: split validation evidence recorded (V1 run) → flip `DB_SEARCH_SPLIT_ENABLED`
   default; final validation run (V2) with all defaults.
6. **F**: compat write retirement.

Emergency levers after ship: `TUFF_DB_SEARCH_SPLIT_ENABLED=0` (topology),
`TUFF_DB_QOS_ENABLED=0` (scheduler QoS), per-commit reverts (D2–D5 are main-process-only
refactors with no persisted-state coupling).
