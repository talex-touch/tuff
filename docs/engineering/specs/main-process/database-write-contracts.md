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
- File opener associations describe applications, so their bundle/name/icon lookup and icon-pointer writes stay on the primary app catalog (`dbUtils.getDb()`), even when ordinary file indexing uses the search home. Do not use split-routed `addFileExtension` with an application id: identical primary/search ids identify unrelated rows. Resolve bundle metadata and its optional icon in one bounded primary query; write through `scheduleDbWrite`.
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
- Foreground preemption is a maintenance deferral, not a persistence failure. A buffered content flush retains its exact durable batch and completed publication/embedding/completion stages (the embedding stage includes the text files it left pending for retry), releases the old source lease after active writes settle, then resumes under a fresh maintenance lease once foreground activity is idle. Waiting and real-error retry backoff happen outside source ownership. Retained entries count as inflight only; canceled/reset/stale/low-space generations cannot publish late results. Genuine SQL failures keep their normal diagnostic and retry policy.
- Watch-event task history is diagnostic state, not indexing correctness: update it in memory immediately, coalesce durable saves in a bounded leading-edge window, and flush the latest snapshot during shutdown. Scan/reconcile/reset task state remains awaited and durable before the operation returns; never apply the watch coalescing rule to those terminal records.
- Image semantic enrichment uses the same opt-in file content policy and embedding home as text. Worker image results carry pending metadata with NULL content, never invented captions or chunks. Host inference alone reads a bounded O_NOFOLLOW snapshot through the pinned local encoder; IPC metadata cannot forge image authority. Keep the exact filesystem mtime for inference, but retain the database's second-resolution version in the SQL id/path/mtime/size/content/status fence. Recheck the live file after inference, and check that fence again in the existing sole-writer transaction before updating vector and progress.
- Deferred semantic recall starts after the first snapshot without delaying it. A session completes only after its recall publishes or cancellation settles; abort must not wait for a model that ignores its signal. Already published rows retain their positions and deduplicate subsequent recall. The query embedding is an interactive job in the local runtime's queue (see `background-task-timeout-contracts.md`): it waits behind the running job and never aborts an in-flight file embedding, whose vector is still stored.

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
- Migration `0056_ai_orchestrator_run_messages` adds the primary-homed encrypted run-message
  log: opaque `envelope`, `created_at`, and composite key `(run_id, seq)`. Its FK cascades
  when the run root is removed by Privacy or retention. It is not an aux hot table and
  encrypted records are not ordinary-exported. Retention byte estimates include envelope
  UTF-8 bytes without parsing or decrypting them.
- `AiOrchestratorStore.appendRunMessage` assigns `COALESCE(MAX(seq), 0) + 1` for the run
  inside the interactive primary write task and propagates FK/write failures; reads are
  ordered by `seq`, and explicit message deletion uses the same interactive write lane.
  `truncateRunMessages(runId, keepCount)` removes only `seq > keepCount` in that lane;
  the next append continues at the retained prefix's next sequence.
  The run lifecycle deletes the log when a run finishes, retaining it only for resumption.
- The hand-written `0056` migration raises `KNOWN_MISSING_SNAPSHOTS` from 42 to 43 in
  `scripts/check-drizzle-snapshot-drift.mjs`; this acknowledges the known snapshot gap,
  not a regenerated baseline. The ratchet test and real libSQL run-message store test
  cover registration, per-run sequencing and cascading deletion.

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

## Scenario: `search-index.db` 的大小上限（2026-10-20）

### Scope / Trigger

新增或改动 `search-index.db` 的写连接、它的启动打开顺序、文件扫描的失败处理，或者调整上限。起因：一台机器上这个文件长到 47.2 GB，磁盘只剩 3.8 GiB。

### Signatures

- `db/search-index-size-cap.ts`：`readSearchIndexMaxBytes(dir)` 返回 8 GiB 与所在卷容量 2% 中的较小者（读不到卷容量时取 8 GiB）；`applySearchIndexSizeCap(client, maxBytes)`、`deleteSearchIndexOverCap(dbPath, maxBytes)`、`measureSearchIndexFileBytes(dbPath)`。
- `DatabaseModule.getSearchIndexStorage()` 经 `app:file-index:status` 送出 `indexStorage: { fileBytes, maxBytes, resetFromBytes }`。
- `addon/files/services/file-provider-run-failure.ts`：`classifyRunFailure(error)`、`isIndexFullFailure(failure)`。

### Contracts

- 写这个文件的每条连接都要设 `PRAGMA max_page_count`，因为 SQLite 把它存在连接上而不是文件里。目前有两条：`configureSqliteClient` 的 `search` 连接和 worker 连接。新增写连接必须同样设置。
- `max_page_count` 只能阻止增长：文件已超限时它会被抬到当前页数。所以启动时、在任何连接打开之前检查，主库文件超过上限就连同 `-wal`、`-shm`、`-journal` 一起删除，从空库重建（只存派生数据）。只看主库文件：满库正好停在上限，崩溃留下的 WAL 不能把它推过线。
- 删除时上报 `SEARCH_INDEX_SIZE_CAP_RESET`（warning）；本次会话的状态带 `resetFromBytes`，设置页据此提示已重建。
- 初始化（跑迁移、建表）时撞上 `SQLITE_FULL` 也删库重建，上报 `SEARCH_INDEX_SETUP_STORAGE_FULL`（warning），不退回主库：主库没有上限。停在上限的旧库升级时，新迁移要的表和索引就会走到这里。
- 已有库的 schema 增量放进迁移，由上一条兜底；writer 的 `prepareSchema` 在迁移过的库上不能再需要新页。它在 worker 里撞满，worker 每次初始化都会失败，所有写入都跟着失败，能腾出页的删除也不例外，而且没有任何路径会触发重建。A10 的部分唯一索引原本由 writer 建：余量正好 2 页的库能通过迁移，writer 却永远起不来，所以这个索引挪进了迁移 0055。
- 到上限后，需要新页的写入报 `SQLITE_FULL`；新数据在那之前就被删除预留挡下（见 A18 场景），删除和原地修改复用空闲页和预留照常进行。扫描遇到 `SQLITE_FULL` 或 `ENOSPC` 记为 `FILE_INDEX_STORAGE_FULL`，不置 `initializationFailed`。后者会让文件源的 health 变成 `error`，runtime 随后跳过它的全部监听事件和扫描，删除就无法腾出空间。存储满之后本会话不再发起自动扫描，除非容量模式的清扫删掉了文件；手动重建和下次启动照常扫描。
- WAL 不受 `max_page_count` 约束。设置页的占用是主库加 WAL，可能略高于上限。
- 上限只限制增长，空闲页的回收见下一个场景。

### Verification

- `db/search-index-size-cap.test.ts` 用真实 libSQL：越过上限的页被拒绝，删除后复用空闲页，超限文件无法收缩，满库连同 WAL 不被删除。把删除判断改回「主库加 WAL」，这一条会失败。
- `database/index.search-schema.test.ts`：9 GiB 的稀疏旧库在打开前被删除并重建，连接的 `max_page_count × page_size` 不超过上限；上限内的库保留。停在上限、还没跑 0055 的旧库，初始化时上报 `SEARCH_INDEX_SETUP_STORAGE_FULL`，删库后在上限内重建出新 schema，没有退回主库。在上限附近升级、并把旧关键词搬空的用例见 A10 场景。
- `file-provider-startup.test.ts`：普通扫描失败仍会停住文件源；存储满不会，错误码为 `FILE_INDEX_STORAGE_FULL`，`runAutoIndexing` 不再发起扫描。两处改动各自撤掉都会让用例失败。
- 隔离 Electron 实测，profile 放在 512 MiB 的卷上，上限 10 MiB：主库停在 2621/2621 页；上限下删除 50 个文件，5 秒内全部出索引并腾出 216 页，随后新增的 30 个全部补进；再灌 2,000 个只收 12 个，失败去重上报，没有重扫；修改照常生效；重启后满库保留。另测 9 GiB 旧库：启动即删除重建，`indexStorage` 送到设置页。


## Scenario: `search-index.db` 的空间回收（2026-10-21）

### Scope / Trigger

改动搜索索引文件的 `auto_vacuum`、压缩决策（`search-index-compaction.ts`）、worker 的回收执行（`handleVacuum`），或者新增大批删除的流程（清理、淘汰、关键词规则变更）。

### Contracts

- 删除留下的页不会自动还给磁盘。新建的搜索库在开 WAL **之前**设 `PRAGMA auto_vacuum = INCREMENTAL`；开了 WAL 之后再设会静默停在 0（NONE），只有 VACUUM 能改。2026-10-21 之前建的库仍是 NONE，在第一次完整 VACUUM 时转成 INCREMENTAL，worker 会在 VACUUM 之前设好这个 PRAGMA。
- 增量模式下，空闲页不少于 32 MiB 时，每步执行 `PRAGMA incremental_vacuum(n)`，最多 64 MiB，不需要额外磁盘空间。maintenance 服务两步之间隔 250 ms，一直做到空闲页低于 32 MiB、写入方忙碌或开始关停为止，每次请求最多 64 步。在 libsql 上必须用 `executeMultiple` 执行：`execute` 会把它当成查询逐行取结果，然后报 `SQLITE_LOCKED`（已实测）。
- NONE 模式只能整库 VACUUM。触发条件是空闲页不少于 256 MiB 且不少于文件的 10%，并且磁盘剩余不少于「2 × 存活数据 + 1 GiB」（临时副本一份，WAL 一份）。原来按 2.5 倍文件大小算，对一个 47 GB、九成是空闲页的库要求 118 GB，现在约 11 GB。
- 触发点：关闭正文索引、启动时的正文清理，以及每次开机关键词回填结束后的 `boot-check`。都走 `FileProviderMaintenanceService.compactSearchIndex`，只在 split 拓扑下执行，用后台准入；维护繁忙时跳过，下次开机再查。
- 关键词搬出 `keyword_mappings`（A10）也会腾出大量页，由同一个 `boot-check` 回收。搬迁在检查之前做完，同一次开机就能回收；检查要是赶在搬迁中途，空闲页可能还不到 32 MiB 而跳过，留到下次开机。

### Verification

- `search-index-compaction.test.ts`：两种模式的判定、磁盘门槛边界、步长上限。
- `file-provider-maintenance-compaction.test.ts`：增量步骤重复到低于门槛，日志汇总一次。
- `index.search-schema.test.ts`：新建的搜索库 `auto_vacuum = 2`。把 PRAGMA 挪到 WAL 之后，这条会失败。
- 隔离 Electron 实测：用旧代码建的 4,232 个文件的库，人为造出 308 MB 空闲页，共 425.9 MB。用新代码启动后，关键词回填（版本 4）重写全部行，`boot-check` 整库 VACUUM 到 56.7 MB，用时 0.85 s，转为增量模式。再造 102.6 MB 空闲页后重启，两个增量步骤（344 ms、198 ms）回到 56.7 MB。
- 隔离 Electron 实测 A10 升级（4,251 个文件、122,737 行旧关键词）：搬迁先于检查做完，同一次开机增量回收 47.4 MB，67.2 MB → 19.8 MB，用时 274 ms。另一次检查赶在搬迁中途，只看到 26 MB 空闲页而跳过，下次开机用 516 ms 回收。


## Scenario: 关键词倒排用整数文档 id（A10，2026-10-21）

### Scope / Trigger

改动 `search_keyword_postings`、`search_index_meta.doc_id`、关键词的写入与读取，或者 `keyword_mappings` 的搬迁与退役。起因：只索引文件名时 `keyword_mappings` 占索引的 93%，每行都拿完整路径（平均 108 字节）作 `item_id`，两个索引里又各存一遍。

### Signatures

- 迁移 `0055_search_keyword_postings`：`search_index_meta.doc_id` 及其部分唯一索引 `idx_search_index_meta_doc_id`；`search_keyword_postings(provider_id, keyword, doc_id, priority)`，WITHOUT ROWID，主键 `(provider_id, keyword, doc_id)`；`idx_search_keyword_postings_doc(doc_id, priority)`。
- `search-engine/search-index-keyword-postings.ts`：`allocateKeywordDocId`、`writeKeywordPostings`、`deleteKeywordPostings`、`deleteProviderKeywordPostings`、`moveLegacyKeywords`、`keywordRowsSource`。
- `SearchIndexDocumentStore.migrateLegacyKeywords(limit)`：维护轮里的一片，每单位 `limit` 搬 16 行，`processed` 按行计。

### Contracts

- 文档 id 取 meta 与 postings 里仍在用的最大 id 再加 1，只要还有行可能指向某个 id，它就不会再分配出去。FTS rowid 不能当文档 id：每次重写文档都会删掉再插入 FTS 行。
- 新写入只进 postings。文档入库时就分到 id；关键词变了（`keyword_hash` 不同）才调 `writeKeywordPostings`，它先删这个文档的全部旧行，有旧行就再删它的 postings，然后整份写入。先删后写，上限下才有页可用。关键词没变的文档只拿到 id，旧行原地不动。
- 读取在一条语句里 UNION ALL 两种布局（`keywordRowsSource()`，以及 `listItemKeywords`、子序列和 n-gram 查询各自的两臂）。本版本的写入和搬迁都在同一事务里删旧插新，所以每行只在一种布局里，搬迁中途读者看到的每一行都恰好一次；一个文档可以一部分行在旧表，一部分在 postings。
- 维护轮的顺序：待发通知 → locator 回填 → 搬旧表 → 孤儿清理。搬迁排在回填之后：这时没有 meta 行的旧行就是孤儿，直接丢掉；每个文档在它最后一批行搬走时给来源发一次通知，provider 为空串的远古行不发。
- 搬迁按行 id 区间，先删后插：一片取最旧的若干行，先删掉 id 不超过其中最大值的旧行，再写 postings。上限下只有相邻的行才能腾出整页，同一文档的行可能散在整张表里，按文档整份搬就可能一页都腾不出来。
- 旧行覆盖同一文档的 postings：旧行只有旧版本会写，降级再升级之后，它们才是较新的那份。一个文档的行可能跨片，所以每轮开始时把当时最大的文档 id（W）和最大的旧行 id（R）记进 `search_index_maintenance_progress`，任务名是 `legacy-keyword-move:doc-id` 和 `legacy-keyword-move:row-id`。还没有 id 或 id 不超过 W 的文档，最先搬的那批行删掉它的 postings，并给它换一个大于 W 的新 id；之后的行在新 id 上累加，同一关键词取较大的 priority。一轮只搬 id 不超过 R 的行，轮中途旧版本写入的行等下一轮。旧表搬空后删掉这两条记录；`reset` 和 `clearSearchIndex` 也会清掉它们。
- 按文档 id 取 postings 或 meta 的语句，不能让 `provider_id` 参与索引选择。库里没有 `sqlite_stat1`，SQLite 把 `provider_id = ?` 前缀估成 10 行，IN 列表超过 10 个 id 时宁可把整个来源走一遍。需要来源条件就写 `+provider_id`；`provider_id = ? AND item_id IN (…)` 这种两列都在索引里的语句不受影响。
- 部分唯一索引在迁移 0055 里建，writer 的 `prepareSchema` 在迁移过的库上不需要新页（见大小上限场景）。

### Verification

- `search-index-service.documents.test.ts`「integer document ids」：删文档、删来源只删各自的 postings；孤儿 posting 还占着的 id 不会再分配；20 个文档加 20 个孤儿时，`listItemKeywords` 和孤儿清理的每条语句都不走整个来源。三处 `+provider_id` 撤掉任何一处，这条都会失败。
- 同文件「moving keyword rows out of the legacy table」：limit 为 1 时一片不超过 16 行，跨片时每个文档的两种布局合起来始终等于原关键词，召回不变；旧行跨片、跨轮覆盖 postings，同一关键词取较大的 priority；无主旧行每个文档只通知一次。去掉轮次边界、去掉取较大值、每片都数孤儿、不覆盖 id 不超过 W 的文档，四种改法各自被对应的用例抓到。
- `index.search-schema.test.ts`「upgrades an index at its cap and moves its legacy keyword rows」：300 个文件的旧库，旧行分三种排列（按文档、按关键词、两者都不按），上限从「页数加 0 页」起逐页放宽，每一档要么初始化撞满后重建，要么 writer 起得来、旧表搬空、关键词与升级前一致。把部分唯一索引挪回 writer，三种排列都在 writer 初始化时 `SQLITE_FULL`；换回按文档整份搬迁，后两种排列在搬迁时 `SQLITE_FULL`。
- 隔离 Electron 实测，4,251 个文件、122,737 行旧关键词。全新建库与由 A10 之前的快照升级两条路径，`(provider, item, keyword, priority)` 集合都与改前逐行相同，没有孤儿 posting，也没有重复的文档 id；17 个查询的完整结果列表（共 588 个文件）与改前一致。关键词表连索引 55.39 MB → 10.05 MB（−81.8%），文件 67.2 MB → 19.8 MB（−70.5%），每个文件约 4.7 KB。按行搬迁的版本由快照升级时，开机约 2 分钟后开始搬，不到 12 秒搬完，两条轮次记录随之删除。


## Scenario: 满库之后：删除预留与容量模式（A18，2026-10-21）

### Scope / Trigger

改动 `search-index.db` 满了之后的行为：哪些写入算新数据、扫描撞满之后怎么办、按时间淘汰旧文件的规则和它的进度记录。起因：到上限后只是不再收新文件，首轮扫描永远走不完（路线图 A7）；上限下删除也可能撞满，磁盘上删掉的文件会一直留在索引里。

### Signatures

- `db/search-index-size-cap.ts`：`resolveSearchIndexReservePages(maxPages)`、`hasSearchIndexRoomForNewData(tx)`、`searchIndexReserveReachedError()`、`isSearchIndexReserveReachedError(error)`。
- `addon/files/services/file-provider-capacity-service.ts`：`FileProviderCapacityService` 的 `relieve(error)`、`runSweepSlice(options)`、`authorizeEviction(records)`、`admit(records)`、`reset()`、`readHorizonMs()`；`resolveFileCapacityTime(record)`。
- `FileProviderMaintenanceService.admitScanRecords(records)`；`deleteFileRecords(records, 'capacity', options)`。
- `search_index_maintenance_progress` 里的两个任务：`file-capacity:horizon`（地平线，秒）和 `file-capacity:sweep`（清扫到的行 id）。
- `app:file-index:status` 在地平线存在时带 `capacityHorizon`（毫秒）。

### Contracts

- 删除预留：新数据要给删除和修改留出余量，取上限页数的 2%，限定在 256 到 16,384 页之间，且不超过上限的四分之一。新数据指 `files` 里还没有的路径，以及给还没有正文的文件写正文。判断放在同一个写事务里，算上这个事务已经占用的页（`page_count − freelist_count`）。余量不够时报 `SQLITE_FULL: SEARCH_INDEX_RESERVE_REACHED`（带 `code: 'SQLITE_FULL'`），调用方照满库处理：扫描记为 `FILE_INDEX_STORAGE_FULL`，正文等待。已收录文件的修改、替换正文和删除可以用掉预留。连接没有上限（legacy 拓扑）时不检查。原因是 2026-10-21 用真实 libSQL 的实测：一页都不剩时，64 个分散文件的删除批次会失败；4,000 个文件的库要 32 个空闲页，20,000 个要 64 个。不留余量，磁盘上删掉的文件会一直留在满库里。
- 上限和磁盘满只靠错误链里的 `SEARCH_INDEX_RESERVE_REACHED` 区分（message、cause、AggregateError 的成员、`original`、`error` 都要查），因为跨 writer worker 只有 message 留得下来。磁盘满的 `SQLITE_FULL` 不触发容量模式。
- 「到上限」以 writer 的拒绝为准，不在主线程数页：libsql 0.18 的 PRAGMA 只作用于连接池里执行它的那条连接，只有读 worker 是 `concurrency: 1`。
- 文件的时间取修改时间和创建时间中较晚的那个，单位秒（`files.ctime` 存的是 birthtime），所以复制出来的旧文件算新文件。两者都读不到的文件总是收录。
- 地平线 H 在扫描因预留被拒时抬一次（文件源运行失败的处理里调 `relieve`）：
  - 把行 id 范围分成 256 段，每段取 H 之上的第一个文件作样本；不足 32 个样本不抬。
  - 取样本的 10% 分位，并且不晚于「现在 − 30 天」。夹完之后要是没有一个样本不晚于新 H，就不抬，否则清扫会扫完整张表却几乎删不掉东西。
  - 上一次抬升的清扫还没结束时再被拒，只重新排维护，不再抬。
  - `reset` 会递增代数，抬到一半的结果不会写在 reset 之后。
- 清扫：
  - 维护轮先补发未确认的删除，接着跑清扫，之后才轮到过滤清理和对账任务，因为新文件在等它。
  - 按行 id 每 1,024 个一窗读取，每 64 条交给 `deleteFileRecords(…, 'capacity')`，在删除租约里重新授权：按当时的 H 再判一次时间，并排除在 Tuff 里打开过（`item_usage_stats` 里 `source_id = 'file-provider'` 且 `execute_count > 0`）或固定过（`pinned_items`）的文件。两张表的 `item_id` 都是路径。
  - 游标只在它自己和 H 都没变时前进；清扫结束时，也只在 H 没变时删掉清扫记录。
  - 清扫删掉了文件，或者接手的是重启之前的清扫，就回调 `onCapacityEvicted`：文件源清掉满库失败，重新跑自动扫描。
- 收录：时间不晚于 H 的文件不收，全量扫描、对账补收、子树对账和监听事件都过这道过滤（`admitScanRecords`，以及 `buildFileRecord` 里的 `admit`）。全量扫描在分块节流之前就过滤，被拒的文件不占分块之间的停顿（每块至少 250 ms）。手动添加的文件不过这道过滤，但它要是够旧又没打开过、没固定过，之后的清扫照样会清掉它。被拒只是不写，不会删掉已收录的行：删除仍然要各自的依据。
- 清空索引时先删这两条记录，再清数据：中途失败只会留下没有地平线的文件，不会留下一个清空了却仍然拒收旧文件的索引。带 `clearSearchIndex` 的重置先调 `reset()`（经 writer，并递增代数）；存储清理 `cleanupFileIndex` 不论是否带 `clearSearchIndex`，都先在主线程删掉这两条记录。
- 查询计划：库里没有 `sqlite_stat1`。按类型过滤写 `+files.type`（`fileTypeIs`），查使用记录写 `+execute_count`；id 的上下界用两个子查询（`min(id), max(id)` 写在同一个 SELECT 里会走全表）；要保留的路径用 `UNION ALL` 合并。

已知局限：

- 一次只淘汰约一成，而且这个比例是由样本估计的，往往要几轮才收得下一批新文件。和地平线落在同一秒的文件会一起被清。
- 按 id 分段抽样，id 成片分配时会有偏差。
- 碎片：分散的行删掉后腾出的整页少于它们的字节数。6 MiB 上限、1,170 个文件的满库清掉 117 个之后，接下来的 50 个新文件只收下 40 个。
- 只有扫描被拒会抬地平线。监听事件和正文写入被拒只会等待，要等下一次扫描被拒。
- 30 天下限：满库里全是近 30 天的文件时，索引保持满，日志记 `File index full; no files old enough to evict`。
- 移动或重命名的旧文件保留修改和创建时间，在新路径上会被拒；保护按路径认，跟不上重命名。收录时不看保护：打开过的旧文件一旦离开索引（比如移走再移回），就收不回来。
- 清扫排在其他维护前面，清扫没完时它们可能要等上几分钟。
- 清扫刚结束时有扫描报满，会再抬一次（少见）。
- `cleanupFileIndex` 不经过 `reset()`，不递增代数：恰在清理时进行中的抬升，可能把地平线写回清空后的索引（少见），要再清一次才消失。
- legacy（非 split）模式没有上限，容量模式也不生效。

### Verification

- `db/search-index-size-cap.test.ts`：预留页数的各档边界。真实 libSQL 下逐行写满，`hasSearchIndexRoomForNewData` 恰好在剩余页降到预留时变为 false。拒绝错误经过 cause、AggregateError、`original`、`error` 或只剩 message 都能认出，磁盘满和自引用的错误认不出。
- `file-index-persistence-repository.test.ts`：剩一页时，给没有正文的文件写正文被拒，替换正文照常；上限放开后补写成功。
- `database/index.search-schema.test.ts`「refuses new files before the pages deletions need」：2,000 页上限下逐批写满，最后的拒绝是预留拒绝，剩余页不超过预留；已收录文件照常更新；之后每 64 个一批删掉散布全表的文件，全部成功。
- `file-provider-capacity-service.test.ts`：
  - 用真实 writer 写满 6 MiB 上限：1,170 个文件，年龄 60–2,000 天，顺序与年龄无关。第一批 10 个新文件被拒；之后每被拒一次就抬一次地平线、清扫完，再试 50 个新文件，直到收得进（最多 6 次）。2026-10-21 实测一次就够：地平线在约 1,805 天前，清掉 117 个，50 个新文件收下 40 个。剩下的文件恰好是打开过、固定过或时间晚于 H 的；只搜索过、或在别的来源打开过的照样清掉。每个清掉的文件都发了删除通知，没有遗留的待提交记录，`search_index_meta` 与 `files` 一致。扫描再遇到清掉的文件不会收回来。
  - 真实 schema 上的单项：H 落在最旧一成附近；按窗清扫跨重启续上，时间新的复制品从不交给删除；接手重启之前的清扫算作腾出了空间；收录判定覆盖恰好等于 H、晚一秒、复制品、ISO 字符串和读不到时间几种情况；30 天下限和「全是近期文件不抬」；样本不足不抬；只认预留拒绝；reset 赢过进行中的抬升；H 在一片当中被换掉时游标不动；reset 之后什么都不拒、不清。抽样、清扫和授权的每条语句，EXPLAIN 里都没有整表扫描和临时 B 树。
  - 下面 14 种改法各自都有用例失败：去掉代数守卫、去掉游标的 H 守卫、去掉「样本之下不抬」、忽略保护、把条件改成 `execute_count >= 0`、恰好等于 H 的文件也收录、接手的清扫不回调、游标不保存、去掉 30 天下限、收录只看修改时间、授权全部放行、清扫谓词只看修改时间、reset 不删记录、`admitScanRecords` 不过容量过滤。
- `service/storage-maintenance.test.ts`：`cleanupFileIndex` 不带 `clearSearchIndex` 时也删掉这两条记录，别的任务记录留着。
- `SettingFileIndex.capacity.test.ts`：有地平线时提示「较旧的文件已移出」并显示日期，优先于 95% 的警告。`file-index-projection.test.ts`：`capacityHorizon` 只接受正数毫秒。
- 没有在隔离 Electron 实例里实测：验证时本机开着用户的 dev 实例。
