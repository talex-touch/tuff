# Database Write Contracts (main process)

Source: task 08-04-db-single-writer-root-fix (2026-08-05), which eliminated the
recurring `SQLITE_BUSY` / `DATABASE_BUSY_RETRY_EXHAUSTED` startup failures. These are
executable contracts — violating any of them reintroduces a bug class this task fixed.

## Scenario: writing to any SQLite database from the main process

### 1. Scope / Trigger

Any code that writes to `database.db` (primary), `database-aux.db` (aux), or
`search-index.db` (search home), or adds a new SQLite file / writer.

### 2. Topology contract — one writer connection per SQLite file

| File              | Sole writer                | Writer mechanism                            |
| ----------------- | -------------------------- | ------------------------------------------- |
| `database.db`     | main process               | `dbWriteScheduler` primary lane             |
| `database-aux.db` | main process               | `dbWriteScheduler` aux lane                 |
| `search-index.db` | search-index worker thread | worker port (`searchIndexWriter.execWrite`) |

`DB_SEARCH_SPLIT_ENABLED` default ON since 2026-08-05; `TUFF_DB_SEARCH_SPLIT_ENABLED=0`
is the emergency shared-file fallback. Never open a second write connection to a file
another owner writes (the original root cause: worker + main both writing `database.db`).

Pause window (`searchIndexWriter.withPausedAdmission`, reached via
`SourceScopedIndexWriterRouter.withPausedSelectedAdmission` for a source reset): the writer
drains in-flight work, then holds every **foreign** write at the admission gate until the
operation settles. Writes issued by the pausing operation's own async context (tracked with
`AsyncLocalStorage`) are admitted immediately — the pause exists so that operation can
mutate the index alone. Do not add an outer `await` on a second `withPausedAdmission`
from inside an operation, and do not "fix" the bypass by making it wait: that is the
2026-09-21 manual-rebuild self-deadlock (reset → `clearScanProgress` → `execWrite` waited
on its own caller's gate; the reset task gate then stayed running for the session and every
later file watch event was skipped). Regression anchors:
`search-index-writer.test.ts` "paused-window self writes".

`SearchIndexWriter` 的 Worker admission 也是单写者边界。物理执行最多 1 个请求，内部最多保留 2 个等待请求；后台 fullScan/enrichment 最多占 1 个等待位，另一个位置留给 watch、checkpoint、reset 和用户设置操作。容量外的生产者只等待共享 capacity pulse，不进入 Worker pending map。关闭必须拒绝队列并唤醒容量等待者。暂停期间不能启动外部排队请求，但 `pausedAdmissionScope` 的自写可在 active 槽空闲时直接执行。

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
- `scan_progress` child rows are resumable checkpoints, **not root completion**. They count as scan
  evidence (so restart obeys the idle gate), but only an exact watch-root row closes that root's
  eligibility. A restart re-enters the incomplete root and the checkpoint planner skips completed
  children; folding a child row into a synthetic root completion suppresses coverage for 24 hours.
- Shutdown is cancellation-first. `SearchEngineCore.destroy()` starts the writer close before it
  waits for source scans, because a scan blocked in synchronous worker-side libSQL cannot release
  its mutation lease until that write rejects. File content enrichment is already marked `pending`
  before admission, so shutdown may cancel its worker/queued batches and resume them next launch.
  The writer gets a short graceful-close window, then is terminated and detached; an unconfirmed
  termination during app exit is diagnostic evidence, not a reason to exceed the outer quit budget.
  Ordinary runtime termination timeouts remain failures.
- Watch-event task history is diagnostic state, not indexing correctness: update it in memory immediately, coalesce durable saves in a bounded leading-edge window, and flush the latest snapshot during shutdown. Scan/reconcile/reset task state remains awaited and durable before the operation returns; never apply the watch coalescing rule to those terminal records.

### 7. Boot-time maintenance writers

Gate DB-writing maintenance (retention, backfill, summaries) on
`isInStartupDegradeWindow()` / `getStartupDegradeWindowRemainingMs()`. Exemptions:
user-initiated actions (manual privacy deletes) and first-launch initial population.
Gate the REAL entry point — verify with a boot log, not by reading the scheduler call
graph (the first gate landed on a dead caller).

### 8. Validation & error matrix

| Condition                              | Behavior                                                             |
| -------------------------------------- | -------------------------------------------------------------------- |
| BUSY, retries left                     | delayed re-enqueue (lane-local), `SQLITE_BUSY_RETRY_COUNT`++         |
| BUSY, exhausted                        | notify once → reject original error → circuit accounting             |
| Non-busy error                         | immediate reject, no retry                                           |
| Droppable task ages out during backoff | drop error (maxQueueWaitMs vs original enqueuedAt)                   |
| Split init/fixup failure               | fail-closed to shared-file topology (= flag-off), never dual-writer  |
| Worker init failure                    | contained retry w/ backoff; NEVER fall back to opening `database.db` |

### 9. Tests required (existing anchors)

`db/db-write-scheduler.test.ts` (re-enqueue/no head-of-line, exhaustion-once, lane
isolation, drain-with-parked), `db/utils.split.test.ts` + `embedding-service.split.test.ts`
(home routing), `modules/database/index.search-schema.test.ts` (schema parity),
`file-provider-bootstrap-reindex.test.ts`, `failed-files-cleanup-task.test.ts`
(fail-closed), `app-provider.test.ts` backfill-gate cases. New writers copy these
assertion shapes: split-on → worker-forwarded SQL carries no cross-home ids;
split-off → byte-identical legacy behavior.

## Scenario: authoring a schema migration (2026-08-06, from 0037)

### 1. Scope / Trigger

Any change under `resources/db/migrations/`. Migrations are **hand-written**: the
drizzle-kit snapshot chain died at `meta/0014_snapshot.json` (0015+ have no snapshots)
and drizzle-kit is not installed — `npm run db:generate` cannot work. Do not "fix"
this by running a newer drizzle-kit: it would re-diff the whole schema against 0014.

### 2. Signatures

- SQL file: `NNNN_<snake_case_tag>.sql`, statements split by `--> statement-breakpoint`.
- Journal entry: `{ idx: N, version: "7", when: <prev + 86_400_000>, tag, breakpoints: true }`.

### 3. Contracts

- **`when` must be the journal maximum.** The drizzle libsql migrator only applies
  entries with `folderMillis` greater than the newest `created_at` already in the DB —
  a non-max `when` silently never runs on upgraded installs. Repo convention: previous
  entry + exactly one day (synthetic timestamps).
- **Table rebuilds (PK/column-type changes)**: SQLite cannot ALTER a primary key.
  Pattern: `CREATE __new_<table>` (verbatim copy of the current DDL, only the changed
  line differs) → `INSERT INTO __new (explicit cols) SELECT explicit cols FROM old`
  (explicit lists on both sides = column-order independent) → `DROP` → `RENAME` →
  recreate indexes. No `PRAGMA foreign_keys` needed for **leaf child tables**:
  `client.migrate()` already wraps the batch in `PRAGMA foreign_keys=off` + a deferred
  transaction; verify nothing references the table before relying on this.
- **Renderer-assigned ids are scope-local.** If the renderer generates ids per parent
  ('user-1', 'assistant-2' per conversation), the PK must include the parent id.
  A global text PK on such ids collides across parents (0037's root cause).

### 4. Validation & error matrix

| Condition                                             | Outcome                                         |
| ----------------------------------------------------- | ----------------------------------------------- |
| `when` not journal max                                | migration silently skipped on existing installs |
| INSERT SELECT without explicit columns                | data scrambled if column order drifts           |
| Rebuild of a referenced (non-leaf) table w/o FK check | cascade/constraint breakage                     |

### 5. Tests required

Chain-application is already asserted by `recommendation-exposure-schema.test.ts`
("applies cleanly on top of the full migration chain" iterates the journal) — a bad
journal entry or SQL fails there. Add a table-specific schema test asserting the new
PK/columns via `pragma_table_info` plus the behavior the change exists for
(`conversation-messages-schema.test.ts` is the model: cross-parent insert allowed,
in-parent duplicate rejected). Known debt: `retention-migration.test.ts` hard-codes
`at(-1) === '0034…'` + journal length 35 — pre-existing red since 0035, needs re-slicing
by the 0034 index (separate task).

## Scenario: recording accepted usage and reading recommendation evidence (2026-09-30)

### 1. Scope / Trigger

Changes to execute accounting, behavior windows, recommendation freshness, or search-detail retention.

### 2. Signatures

- `DbUtils.recordExecuteTransaction({ eventId, sourceId, itemId, sourceType, sessionId, timestamp: Date, context })` returns `{ accepted, usageStats }` only after the primary-lane transaction commits.
- `DbUtils.getUsageBehaviorBatch(keys, now?)` returns lifetime counts plus reliable 30/7-day executions, distinct **local** days, dated decay, and time distributions in requested-key order.
- `SearchUsageService.onExecuteAccepted(listener)` emits a pre-write invalidation with `usageStats: null` and, only after a new committed admission, the updated serialized row.
- `SearchUsageService.flush()` waits for admitted execution writes to settle before a recommendation read; failure settles the barrier without inventing data.

### 3. Contracts

- The provider confirms the main action was accepted first. Activation, selection, preview, capture, and secondary app actions are not acceptance.
- Resolve source aliases and rebuilt `_originalSourceId` / `_originalItemId` before recording. One user action owns one opaque `eventId`; repeated notifications reuse it, a second intentional action gets a new one.
- `usage_execute_events.event_id` is the admission PK. Its insert, execution log, lifetime counter, summary, daily trend, and stored time distributions share **one** `scheduleDbWrite` transaction. No second writer and no ten-minute execution queue.
- A PK conflict returns `accepted: false` without changing any count. A later statement failure rolls back admission too; reject rather than reporting a durable success.
- Only the accepted ledger supplies dated evidence. Legacy lifetime counts stay intact, but old timestamps, exposure totals, and UTC-floored daily trends cannot fabricate accepted executions or local-day habits. Retained logs do not reconstruct a smaller lifetime total.
- Keep migration `0051_usage_execute_events`, the aux DDL, search privacy owner/export, and storage inventory consistent. Dedupe is retained under the same search-detail policy as its behavior evidence; it is not an indefinite exemption from privacy deletion.

### 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| Same admitted `eventId` delivered again | No new admission, log, count, trend, or time bucket |
| Failure after admission insert | All execution writes roll back; no committed-row notification |
| Provider rejects/cancels or path is missing | No execution write; the original failure remains visible |
| Statistics fail after a real action succeeds | Action stays successful; statistics error is logged, not relabeled as saved |
| Legacy cumulative 50 with no accepted dated events | Lifetime 50; recent 0; last reliable execution unknown; no automatic habit |
| Process restarts after acknowledged commit | Count and receipt survive; replay does not increment |

### 5. Good / Base / Bad Cases

- Good: file open accepted, receipt committed, current count updates, next recommendation reads the settled ledger.
- Base: a retry opens the same target again but reuses the action receipt and adds no second statistic.
- Bad: enqueue an execute, advertise a new persisted count, then let the next reader see the old database; or backfill dated habit evidence from lifetime totals.

### 6. Tests Required

- `search-usage-service.test.ts`: atomic rollback, duplicate receipts, read-after-write, complete time-bucket fold, reliable local-day evidence, and preservation of unknown legacy lifetime history.
- `search-core.contracts.test.ts`: canonical identity, accepted non-activating actions, failed/secondary actions, and invalidation before a queued commit.
- `privacy/search-retention-owner.test.ts`: receipt retention/export/deletion follows the same owner policy.
- Runtime proof uses a real libSQL database, process reopen, acknowledged-commit crash/replay, and actual provider/clipboard actions; mocks cannot prove durability.

### 7. Wrong vs Correct

```ts
// Wrong: no atomic admission and no read-after-write guarantee.
queue.enqueue(sourceId, itemId, sourceType, 'execute')
// Correct: the accepted action owns the receipt; await the sole-writer transaction.
await dbUtils.recordExecuteTransaction({ eventId, sourceId, itemId, sourceType, sessionId, timestamp, context })
```


## Scenario: 有界索引维护、可信定位与删除回执（2026-10-06）

### Scope / Trigger

配置退出根、规则淘汰、完整扫描缺失、孤儿搜索候选、孤儿关键词和旧 profile 的 FTS 定位迁移。
只维护索引及派生数据，不删除磁盘文件；继续沿用每个 SQLite 文件的唯一写者。

### Signatures

- `FileProviderMaintenanceService.runConfigurationCleanup(options)` 返回本轮真实删除数、完成状态及已发布游标。
- `scheduleFileMaintenance()` 续跑持久工作；`cancelRun()` 中断当前等待/本轮并等待其结束，不销毁整个 Provider。
- `SourceScopedIndexWriterRouter.runIndexMaintenanceSlice()` 使用当前 source 的实际 home 和有界请求。
- `dbUtils.getFileIndexReadDb()` 是文件记录、恢复工作与游标的 live read home；不能改读 primary 来掩盖 split 未就绪。

### Contracts

- 先等待前台空闲，再申请 writer admission 和短 source lease。交互恢复时只允许当前短事务结束；每片提交、可见性和发布后释放权限。
- Worker 空闲退休后的重新初始化可能跨越前台/取消边界。最终发送维护 RPC 前必须在 `ensureInitialized(signal)` 返回后复核 idle 和取消；接收端复用有界请求的共享取消标记，不以初始化前的准入结果授权迟到请求。
- 配置清理每片最多 64 条、每轮最多 16 页并受 1,500 ms 整轮预算约束。清理轮与持久工作轮交替；空工作队列不能让尚未完成的配置清理失去下一轮。
- `search_index_meta.fts_rowid` 和 `document_hash` 与完整入库文档同事务维护。迁移 `0053_search_index_document_locators`、primary 初始化及 search-home 初始化必须一致。
- 已定位文档按主键/rowid 删除或替换；FTS 重建、错位 rowid、重复身份和缺失元数据走有界修复，不清空真实库或重扫磁盘。
- 文件删除在同一 home 内原子维护 FTS、关键词、metadata 及派生记录，并保存实际提交回执。只发布成功提交，不把入队当完成；失败不推进恢复游标。
- 旧库无 locator 的孤儿发现和映射完成后的新发现可以为同一 `(source, itemId)` 产生不同持久任务。每项仍复核当前版本与配置，授权删除按当前身份合并；真实提交和发布后退役该身份的全部对应任务，不能将重复身份交给 repository 后反复卡住同页。
- 发布失败时保留回执。恢复只重放发布/ACK，不再次按路径物理删除；同路径新版本及不同 Provider 的同名 ID 必须保留。
- 临时 seen-path 表和扫描子目录 checkpoint 不是删除授权。权限错误、离线卷、未完整完成或取消的扫描必须延后缺失删除；执行前再次复核当前配置、额外监控根和观测版本。
- 实时 watch、主动重建和隐私清除不无限等待后台 idle，仍遵守唯一写者、短 lease、真实提交状态和取消协议。

### Verification

复用真实 libSQL 的文档/删除回归、前台会话生命周期、worker admission、扫描取消和 schema parity 检查。
隔离 Electron 实测 split/primary 两种拓扑的 4,096 条合成积压、前台打断、空闲续跑、取消、退出重启和实际 watch delete/add。
补充实机边界烟测覆盖真实 worker 退休/重建与受控初始化窗口：前台或取消到达后维护请求不发送；重复孤儿发现连同同页其他文档在 split/primary 都收敛。受控时序只用于复现竞态，不作为正常启动耗时或性能证据。
核对 FTS、metadata、关键词最终收敛与磁盘文件保留；这些是功能及调度证据，不是生产大库性能 A/B。

