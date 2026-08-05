# Root-cause analysis — recurring SQLITE_BUSY full chain (2026-08-04)

Symptom set (from dev-run log, 22:44 session):

- `[DbRetry] SQLITE_BUSY during telemetry.upload-stats.retention.compat, retry 1/6`
- `[OperationalError] database.telemetry.upload-stats.retention.compat … DATABASE_BUSY_RETRY_EXHAUSTED`
- `[DbWriteScheduler] DB write task waited 4146ms: storage.config.persist` / `8581ms: ocr.jobs.fail` / `7985ms: app-provider.backfill-update`
- `[OperationalError] database.app-provider.backfill-update … SQLITE_BUSY: database is locked`
- `[PollingService] Task 'storage.polling' timeout after 15000ms`
- `[OperationalError] privacy.cleanup.scheduled … PRIVACY_CLEANUP_PARTIAL` (downstream casualty)

## R1 — Structural: two writers on `database.db`

- Main-process connection: `modules/database/index.ts` `configureSqliteClient` —
  `busy_timeout = 2000` (`MAIN_DB_BUSY_TIMEOUT_MS`, deliberate: LibSQL local binding is
  synchronous on the calling thread; a long busy-wait freezes the UI. See comment at
  `database/index.ts:46-54`, issue #295).
- Worker connection: `modules/box-tool/search-engine/workers/search-index-worker.ts:408`
  `createClient({ url: file:${dbPath} })`, `:423` `busy_timeout = 30000`.
- `dbPath` = `databaseModule.getSearchDatabaseFilePath()` (`search-core.ts:246` →
  `search-index-writer.ts:193`), which falls back to **`database.db`** when
  `DB_SEARCH_SPLIT_ENABLED` is false (`database/index.ts:154-159`).
- `db/runtime-flags.ts:23`: `DB_SEARCH_SPLIT_ENABLED` default **false** — "Ships dark
  until validated by an app-run". The validation never happened. The complete fix
  (dedicated `search-index.db`, worker routing, tests) landed 2026-07-23:
  `95eee4e83`, `c86d82db5`, `c5e952c3c`.
- Startup: worker indexes 227 apps / 228 items in batches (log: `SearchIndex Indexed
  summary calls=5 items=228 avgMs=115`) holding the WAL writer lock; main-process
  writes exceed their 2s timeout → `SQLITE_BUSY` → `withSqliteRetry` 6 attempts
  (200ms→3s exp backoff ≈ 9.2s total) → exhausted → `DATABASE_BUSY_RETRY_EXHAUSTED`.

## R2 — Amplifier: global single queue + in-queue retry sleeps

- `db/db-write-scheduler.ts`: ONE queue serves primary + aux (+ checkpoint tasks).
- ~20 modules use `schedule(label, () => withSqliteRetry(op))` — backoff sleeps run
  INSIDE the queue-head task. One busy task blocks all writes to all files for up to
  ~9s. Inventory (grep 2026-08-04): db/utils.ts:504; ai/intelligence-audit-logger.ts:267,712;
  ai/intelligence-context-hygiene.ts:708,715; ai/intelligence-local-knowledge-engine.ts:223;
  box-tool/addon/apps/app-provider.ts:468,3737; box-tool/addon/files/embedding-service.ts:93,163;
  box-tool/addon/files/file-provider.ts:449; search-engine/query-completion-service.ts:51,219;
  search-engine/indexing-task-state-store.ts:83,116,133; search-engine/search-index-service.ts:213;
  search-engine/time-stats-aggregator.ts:120; search-engine/usage-stats-queue.ts:296;
  catalog/catalog-repository.ts:473; clipboard/clipboard-meta-persistence.ts:39;
  ocr/ocr-service.ts:402; privacy/owner-utils.ts:28; sentry/telemetry-upload-stats-store.ts:50;
  analytics/report-queue-store.ts:43-48; analytics/storage/db-store.ts:239,318,373;
  system-update/index.ts:198.
- Counter-example already in tree: `storage/app-config-repository.ts:519-556` wraps
  retry OUTSIDE `schedule` with an explanatory comment ("the backoff happens while
  queued rather than while holding the writer") — correct pattern, never generalized.
- Scheduler-bypassing writes (no queue at all):
  `search-engine/recommendation/recommendation-engine.ts:174` (pluginAnalytics insert,
  retry only), `db/utils.ts` `cleanExpiredRecommendationCache` (direct delete).
- Queue-wait warnings (`waited 4146/7985/8581ms`) and `storage.polling` 15s timeout are
  downstream of this head-of-line blocking, not independent failures.

## R3 — Aggravator: aux fallback window + permanent compat dual-writes

- Aux DB (`database-aux.db`, hot tables: analytics/telemetry/clipboard/ocr/config) init
  is backgrounded (`database/index.ts` `scheduleBackgroundStartupTasks` →
  `initAuxDatabase`); until ready, `getAuxDb()` returns the PRIMARY db — hot-table
  writes land on `database.db` exactly during the startup contention peak.
- Suspected adjacent defect (verify per store): stores capture `auxDb` at construction
  (e.g. `TelemetryUploadStatsStore` ctor, `report-queue-store`); if constructed before
  background aux init completes, they may hold the primary fallback for the entire
  process lifetime.
- `.compat` dual-writes keep hitting primary even after aux ready:
  `telemetry-upload-stats-store.ts:139-142` (`retention.compat` — the exact label that
  exhausts in the log), `report-queue-store.ts:48`.

## R4 — Minor: synchronized boot-time write storm

Telemetry retention (privacy scheduled cleanup), app-provider backfill (log 22:44:31,
"4 metadata corrections"), UsageSummaryService start, system-update state persist all
fire within seconds of boot, colliding with worker startup indexing.
`isInStartupDegradeWindow()` exists (`runtime-flags.ts:32`) but doesn't cover these.

## Why previous fixes never stuck

QoS priorities, circuits, retry/backoff, aux split, health snapshots all reduce
symptom frequency but leave two writers on one file; retry converts hard failures into
slow failures until load exceeds the retry budget. The actual structural fix was built
and then parked behind a dark flag with no owner for the validation run.
