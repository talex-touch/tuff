# Database Write Contracts (main process)

Source: task 08-04-db-single-writer-root-fix (2026-08-05), which eliminated the
recurring `SQLITE_BUSY` / `DATABASE_BUSY_RETRY_EXHAUSTED` startup failures. These are
executable contracts — violating any of them reintroduces a bug class this task fixed.

## Scenario: writing to any SQLite database from the main process

### 1. Scope / Trigger

Any code that writes to `database.db` (primary), `database-aux.db` (aux), or
`search-index.db` (search home), or adds a new SQLite file / writer.

### 2. Topology contract — one writer connection per SQLite file

| File | Sole writer | Writer mechanism |
|---|---|---|
| `database.db` | main process | `dbWriteScheduler` primary lane |
| `database-aux.db` | main process | `dbWriteScheduler` aux lane |
| `search-index.db` | search-index worker thread | worker port (`searchIndexWriter.execWrite`) |

`DB_SEARCH_SPLIT_ENABLED` default ON since 2026-08-05; `TUFF_DB_SEARCH_SPLIT_ENABLED=0`
is the emergency shared-file fallback. Never open a second write connection to a file
another owner writes (the original root cause: worker + main both writing `database.db`).

### 3. Signatures (db/db-write.ts, db/db-write-scheduler.ts)

```ts
scheduleDbWrite<T>(label: string, op: () => Promise<T>, options?: ScheduleOptions): Promise<T>
scheduleAuxWrite<T>(label: string, opFactory: (db: MainDatabase) => Promise<T>, options?: ScheduleOptions): Promise<T>
// ScheduleOptions additions from this task:
//   lane?: 'primary' | 'aux'            (scheduleAuxWrite sets it — do not set manually)
//   busyRetries?: number                 (default by priority: interactive 3, others 6; 0 = legacy fail-fast)
//   busyBaseDelayMs?: number (200) / busyMaxDelayMs?: number (3000)
```

Call-site convention: ONLY `scheduleDbWrite` / `scheduleAuxWrite`. Direct
`dbWriteScheduler.schedule` is allowed only inside `src/main/db/` and the WAL
checkpoint in `modules/database/index.ts`. `withSqliteRetry` is restricted to
worker-direct writes (worker thread owns its file, no scheduler) and read paths.

### 4. Scheduler semantics — never sleep while holding the queue

- SQLITE_BUSY → the task is **re-enqueued with delayed eligibility** in its own lane;
  other tasks run during the backoff. Backoff math = `withSqliteRetry`'s.
- Exhausted → retry-exhausted notifier fires once (label preserved → OperationalError
  `DATABASE_BUSY_RETRY_EXHAUSTED`), promise rejects with the original error, circuit
  accounting settles once per `schedule()` call.
- Wrapping `withSqliteRetry` INSIDE a scheduled op is forbidden (grep gate:
  `schedule([^)]*withSqliteRetry` must stay 0 in src/main) — it sleeps at the queue
  head and blocks every unrelated write (the 4–9s `DB write task waited` class).

### 5. Home resolution — resolve `{db, lane}` at call/enqueue time

Aux init is backgrounded; construction-time captures of `getAuxDb()` pin the primary
fallback for the process lifetime. Reads must target the same live home as writes.

#### Wrong
```ts
class Store { constructor(){ this.db = databaseModule.getAuxDb() }  // stale capture
  save(){ return dbWriteScheduler.schedule('x', () => withSqliteRetry(() => this.db.insert(...))) } }
```
#### Correct
```ts
scheduleAuxWrite('x', (db) => db.insert(...))          // live {db, lane} at enqueue
const rows = await resolveCurrentAuxDb()?.select(...)  // reads: same live home
```

### 6. Search-split parity rules

- Index-STATE reads (scan_progress, coverage, "should I index") go through the
  split-aware read home (`dbUtils.getFileIndexReadDb()` / reader-mode
  `SearchIndexService`); ids read from one home must never key writes into another
  (cross-home FK/id-collision class: 171+3181 FK failures in validation run 3).
- App catalog stays primary-homed (user-authored manual entries are not rebuildable);
  the push pipeline bridges it into the worker-owned index.
- **Every out-of-band schema fixup must run on every home that runs the migrations**
  (`initSearchDatabase` applies provider_id + scan_progress fixups; drizzle
  migrations alone are NOT primary-parity — the V1 `no such column` lesson).
- An empty worker-owned `search_index` with providers present triggers the
  once-per-boot bootstrap reindex (`file-provider-bootstrap-reindex.ts`).

### 7. Boot-time maintenance writers

Gate DB-writing maintenance (retention, backfill, summaries) on
`isInStartupDegradeWindow()` / `getStartupDegradeWindowRemainingMs()`. Exemptions:
user-initiated actions (manual privacy deletes) and first-launch initial population.
Gate the REAL entry point — verify with a boot log, not by reading the scheduler call
graph (the first gate landed on a dead caller).

### 8. Validation & error matrix

| Condition | Behavior |
|---|---|
| BUSY, retries left | delayed re-enqueue (lane-local), `SQLITE_BUSY_RETRY_COUNT`++ |
| BUSY, exhausted | notify once → reject original error → circuit accounting |
| Non-busy error | immediate reject, no retry |
| Droppable task ages out during backoff | drop error (maxQueueWaitMs vs original enqueuedAt) |
| Split init/fixup failure | fail-closed to shared-file topology (= flag-off), never dual-writer |
| Worker init failure | contained retry w/ backoff; NEVER fall back to opening `database.db` |

### 9. Tests required (existing anchors)

`db/db-write-scheduler.test.ts` (re-enqueue/no head-of-line, exhaustion-once, lane
isolation, drain-with-parked), `db/utils.split.test.ts` + `embedding-service.split.test.ts`
(home routing), `modules/database/index.search-schema.test.ts` (schema parity),
`file-provider-bootstrap-reindex.test.ts`, `failed-files-cleanup-task.test.ts`
(fail-closed), `app-provider.test.ts` backfill-gate cases. New writers copy these
assertion shapes: split-on → worker-forwarded SQL carries no cross-home ids;
split-off → byte-identical legacy behavior.
