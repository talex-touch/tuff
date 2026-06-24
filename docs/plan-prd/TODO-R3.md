# Tuff R3 Search / Indexing Runtime TODO

> 更新时间：2026-06-24
> 范围：Roadmap R3 / Search Provider 与 Indexing Runtime。专题设计以 `03-features/search/INDEXING-RUNTIME-V1-PLAN.md` 为准。

## 当前口径

- R3 目标是把 File write/store boundary、SQLite/FTS 写入、`scan_progress`、integrity reset 与 durable job history 收敛到 runtime task/store。
- 当前完成度约 `70%`。
- 2026-06-24 durable job history 已完成非 schema focused 小切片：复用现有 SQLite task state store，不新增表结构，不改变 `scan_progress` / FTS ownership。
- 2026-06-24 SQLite/FTS 与 `scan_progress` 高风险迁移新增只读 preflight / dry-run plan 工具：`pnpm -C "apps/core-app" run search:index-migration:preflight -- --db <sqlite.db> --output <report.json>`，用于输出并落盘迁移前 row-count、orphan、source-scope、FTS shadow table readiness、预计影响 rows、回滚建议与验证步骤；该工具不执行迁移或清理。
- 2026-06-24 `scan_progress` runtime boundary 已具备 source-scoped schema 兼容读写：旧 `path primary key` 表保持原路径，新 `(source_id, path)` 表会按 `file-provider` scope 读取、删除和 worker upsert；该切片不创建/迁移 schema。
- 2026-06-24 `scan_progress` source-scoped schema 已补受控 migration helper：`planScanProgressSourceScopeMigration()` 只读输出 approval/schema/data/rollback/verification 信息，`runScanProgressSourceScopeMigration()` 可在显式调用时把 path-only 表迁成 `PRIMARY KEY(source_id, path)` 并保留 `scan_progress_path_only_backup`；尚未接入生产 DB migrate，也未执行真实 profile 迁移。
- source-scoped `scan_progress` schema migration 属高风险数据结构变更，执行前必须单独确认影响范围。
- focused tests 可以证明边界合同，不能等同于完整 durable scheduler 或 SQLite/FTS 迁移完成。

## 已完成

- Watch-root policy、scan eligibility、scan strategy、runtime reset、task retry/debounce、recovery wait metadata 已完成多处 hygiene。
- Scan progress 读写边界已过滤空路径、重复路径、非法 timestamp，并返回真实写入 row count summary。
- FileProvider runtime reset cleanup 已覆盖当前 watch roots 下的 scan-progress cleanup。
- Runtime automatic scan/reconcile retry policy 已在同类成功任务后重置失败 backoff。
- App Semantic Alias Catalog（应用语义别名目录）已完成无 schema 小切片：AppProvider 复用现有 SearchIndex alias/token 通道，为已安装主流 IM、Design、Dev、Office、Browser、AI、DB/API、Git、Screenshot/OCR、Media、Archive/Transfer、Security、Remote/VM、国内高频工具等应用补内置语义别名，使 `im`、`design`、`ps`、`vsc`、`code`、`codex`、`ai`、`db`、`api`、`screenshot`、`password` 等查询可召回对应已安装应用；启动时按 catalog version 对既有 app SearchIndex keyword 做一次性回填，避免旧索引缺少新增别名；本切片不新增未安装应用推荐、不新增设置页、不改变 SQLite schema。
- Settings recovery chip display 已输出结构化 wait metadata。
- FileProvider incremental DB persist、FTS write/delete summary 与 index worker flush trace 已进入 indexed source runtime/store evidence；本阶段未新增 schema/migration、真实 watcher 或 Settings packaged evidence。
- Durable job history focused slice 已落地：`scan/watch/reconcile/reset` recent task history 记录 `durationMs`、`reason`、`trigger`、`attempt`、`errorCode`、`errorMessage` 等低敏审计字段；生产 `SearchEngineCore` 继续通过 `SqliteIndexingTaskStateStore` 写入 `indexed_source_task_state`；Settings diagnostics task chip 展示 duration / trigger / reason / attempt / code；focused tests 覆盖 SDK builder、runtime hydrate/history、SQLite store sanitize/clone 与 Settings display。
- SQLite/FTS durable ownership 与 `scan_progress` source-scoped migration 已补只读 readiness preflight / migration dry-run plan：检查 required tables、path-only/source-scoped `scan_progress`、blank/invalid progress rows、legacy `file_fts`、`search_index` FTS5 shadow tables、provider row parity、keyword/meta orphan 与 meta coverage，并输出每个迁移步骤的 approval/blocker/rollback/verification；CLI 支持 `--output <report.json>` 生成审批/evidence 附件；focused tests 覆盖 path-only、blocked、source-scoped clean、unsafe rows 与 report 文件落盘。
- `scan_progress` source-scoped runtime compatibility 已落地：`FileProviderScanProgressService`、runtime reset cleanup 与 SearchIndex worker upsert 会检测 `scan_progress` 表是否存在 `source_id`，source-scoped 表只读写当前 `file-provider` rows；旧 path-only 表保持现有 Drizzle 路径。真实 SQLite focused tests 覆盖 source-scoped read/delete/upsert isolation。
- `scan_progress` source-scoped controlled helper 已落地：migration plan 会阻塞空 path、非法 timestamp、重复 path、残留 staging/backup table，并显式标记 requiresApproval / requiresSchemaChange / requiresDataRewrite；execute path 使用 `BEGIN IMMEDIATE`、staging table、backup table 与 path index，在真实临时 SQLite 中覆盖旧 DB 迁移、新 DB 初始化、unsafe rows blocked 与 post-migration source-scoped shape。

## 未完成

| 主题 | 状态 | 缺口 |
| --- | --- | --- |
| FileProvider SQLite/FTS durable migration | preflight + dry-run ready / migration open | 只读 preflight 可输出并落盘 FTS shadow table、provider row parity、keyword/meta orphan、meta coverage、dry-run 影响 rows、rollback 与 verification；剩余是 SQLite/FTS durable ownership 迁移实现、兼容读写与真实 Settings evidence。 |
| `scan_progress` source-scoped schema | controlled helper ready / execution approval pending | 只读 preflight 可识别 path-only/source-scoped schema、blank/invalid rows、source/path duplicate 风险，并输出 source-scope 迁移步骤的 approval/blocker/rollback/verification；runtime 读/删/worker upsert 已兼容未来 source-scoped 表；controlled helper 可迁 path-only -> `PRIMARY KEY(source_id, path)` 并保留 backup；仍需生产 DB migration 接入、真实 profile 执行确认、数据清理影响范围确认与 Settings evidence。 |
| Durable job history | focused passed / packaged evidence pending | 非 schema append/update/store、SQLite task state 持久化、runtime hydrate 与 Settings chip focused tests 已完成；仍需 packaged/真实 Settings 截图或录屏，且不等同于 durable retry scheduler。 |
| Quicklinks persistent feed | open | 需要官方插件持久 feed storage、用户级 clear/rebuild UI 与 Settings evidence。 |
| Browser Bookmarks platform evidence | partial | 需要真实浏览器 profile、跨平台 watch root 与 packaged evidence。 |
| Everything productionization | partial | 需要 SDK/CLI 最终策略、registry/PATH 探测、Windows 性能与 fail-closed 诊断 evidence。 |

## 高风险迁移前置确认清单

> 适用范围：SQLite/FTS durable ownership migration 与 `scan_progress` source-scoped schema migration。该清单只定义执行前必须确认的影响范围；未完成确认前，不进入 schema / 数据迁移实现。

### SQLite / FTS durable ownership

- 数据对象范围：确认 `files`、`file_extensions`、`file_index_progress`、`search_index` FTS5 虚表及 shadow tables、`search_index_meta`、`keyword_mappings` 是否纳入同一迁移批次；明确 `file_fts` 是否仍保留、迁移或废弃。
- 写入所有权：确认 FileProvider、SearchIndexService、SearchIndexWorker、DbWriteScheduler、runtime task/store 的最终写入边界；迁移后不得出现 main thread 与 worker 对同一索引域并发写入。
- 兼容读写窗口：确认旧表/旧 FTS schema 与新 runtime/store 在一个版本内的 dual-read / dual-write 或只读迁移策略；明确 hard-cut 条件和不可回退点。
- FTS 重建影响：确认 `search_index` 重建、shadow table 清理、keyword mappings 清理、`searchIndex.didMigrate` 触发全量重扫的条件；估算重建耗时、UI degraded 状态与可取消/恢复行为。
- 数据一致性：确认 files rows、FTS rows、keyword_mappings orphan、search_index_meta keyword hash 的一致性检查口径；迁移前后必须有 row-count diff、orphan cleanup diff 和 integrity snapshot。
- SQLite 运行风险：确认 WAL / BUSY / retry / write queue / transaction 粒度 / batch size 对启动、搜索、扫描、删除和 Settings diagnostics 的影响；不得用无上限重试或大事务掩盖锁竞争。
- 回滚策略：确认失败时是保留旧表、重建 FTS、清空 provider-scoped index，还是触发 full rescan；列出哪些失败会导致用户只能等待重扫。
- 证据要求：除 focused tests 外，必须补只读 preflight report artifact（建议用 `--output <report.json>`）/ `migrationDryRun` summary、真实/packaged profile row-count evidence、Settings diagnostics 截图或录屏、`git diff --check` 与 CoreApp 贴近测试。

### `scan_progress` source-scoped schema

- schema 范围：确认从当前 `scan_progress(path primary key, last_scanned)` 迁到 source-scoped 结构时的主键形态，例如 `(source_id, path)`；明确 `source_id` 默认值、索引、唯一约束和空/非法 path 处理。
- 数据归属：确认现有 path-only rows 如何归属到 `file-provider`，以及 Browser Bookmarks、Everything、AppProvider 等 indexed source 是否需要独立 progress scope；避免不同 source 的相同 path 互相污染。
- path 规范化：确认 raw path、normalized path、watch root 展开、大小写敏感、符号链接和跨平台分隔符的迁移规则；迁移前后 pending/completed root 计算必须一致。
- 清理范围：确认 manual rebuild、schema migration、integrity repair、watch root 删除、permission revoked、provider disable 时清理的是 source-scoped rows 还是全局 rows；不得误删其它 source 的进度。
- 兼容读写：已具备 runtime old/new schema 读删写兼容层；controlled helper 使用 staging table 与 `scan_progress_path_only_backup` backfill path-only rows 到 `file-provider` scope。执行前仍需确认 `FileProviderScanProgressService`、worker `upsertScanProgress`、runtime reset、integrity repair 对真实旧 rows 的读取、回填和去重策略；旧版本回退时要能接受 path-only 数据或明确不可回退。
- 用户影响：确认迁移后会触发哪些 watch roots 全量重扫、哪些用户会看到 Settings recovery chip、预计扫描量/耗时、电池/权限 gate 与 failed file retry 是否被重置。
- 数据清理与回滚：确认重复 rows、空 path、非法 timestamp、旧 root 不在当前 watch roots、孤儿 progress 的清理规则；回滚必须说明是否保留 migrated rows、还原 path-only rows 或强制 rescan。
- 验证矩阵：至少覆盖 preflight path-only/source-scoped 报告、旧 DB 迁移、新 DB 初始化、重复 path 跨 source、FTS 重建联动清 progress、manual rebuild、integrity repair、watch root 变更、Settings diagnostics evidence。

## Durable job history 最小设计

> 目标：先补 runtime task/job 的可审计历史和 Settings diagnostics evidence，不改变 SQLite schema，不迁移 SQLite/FTS ownership，也不改 `scan_progress` 结构。

### 设计边界

- 记录对象：scan、reconcile、reset 三类 source maintenance job；Browser Bookmarks、Everything、Quicklinks 后续接入时复用同一 history shape。
- 最小字段：`jobId`、`sourceId`、`kind`、`status`、`queuedAt`、`startedAt`、`finishedAt`、`durationMs`、`reason`、`trigger`、`attempt`、`summary`、`errorCode`、`errorMessage`。
- 状态流转：`queued -> running -> succeeded | failed | skipped | cancelled`；失败可记录 retry metadata，但不在本批实现 durable retry scheduler。
- 存储策略：先复用现有 runtime diagnostics / task store 边界；若需要新持久表，必须先升级为独立 schema 设计批，不在 durable job history 小切片中直接落库。
- Settings 展示：diagnostics recovery chip 显示最近 job 状态、失败 reason、下一步 action；不得展示 raw path、secret、完整 stack trace。
- evidence 要求：focused tests 证明 append/update/store contract；Settings diagnostics 需要 packaged 或真实截图/录屏证明用户可见。

### 推荐执行切片

1. 侦察现有 `IndexingRuntime`、source task store、Settings diagnostics 数据流，确认是否已有可复用 history container。
2. 已完成：增加 append/update 的纯函数与 store/runtime/display focused tests，覆盖 scan/watch/reconcile/reset 成功、失败、skipped 与低敏审计 metadata。
3. 已完成：Settings diagnostics 消费最近 job summary，展示 duration / trigger / reason / attempt / code。
4. 待完成：采 Settings packaged/真实 evidence；必要时同步 `INDEXING-RUNTIME-V1-PLAN.md` 与后续 evidence 矩阵。

### 非目标

- 不新增 `scan_progress` source-scoped schema。
- 不迁移 `search_index` / FTS ownership。
- 不把 focused tests 写成真实 packaged Settings evidence。
- 不用 mock Browser Bookmarks、Everything、Quicklinks evidence 关闭真实平台项。

## 下一步

1. 继续非 schema 小切片，优先移除 FileProvider 内部仍手写 root/path/progress 规则的地方，但不要重复实现已有 runtime write evidence。
2. 补 durable job history 的 packaged/真实 Settings diagnostics evidence；focused code/test 小切片已完成。
3. 基于只读 preflight report / `migrationDryRun` 设计 SQLite/FTS durable ownership 与 `scan_progress` source-scoped migration；`scan_progress` runtime 兼容层与 controlled helper 已具备，执行真实 schema/data migration 前仍需按上方高风险迁移前置确认清单单独确认。
4. Browser Bookmarks、Everything、Quicklinks 只用真实平台/evidence artifact 关闭，不用 mock evidence 替代。

## 验证命令

```bash
corepack pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-watch-root-policy.test.ts" "__tests__/search/indexing-scan-strategy.test.ts" "__tests__/search/indexing-scan-eligibility.test.ts" "__tests__/search/indexing-source-progress-store.test.ts"
corepack pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-task-retry-policy.test.ts"
corepack pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-task-run-gate.test.ts"
corepack pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/file-provider-startup.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-watch-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-scan-progress-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-index-scheduler-service.test.ts"
corepack pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/indexing-runtime.test.ts"
corepack pnpm -C "apps/core-app" exec vitest run "src/renderer/src/views/base/settings/indexing-source-diagnostics-display.test.ts"
corepack pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/search-index-migration-preflight.test.ts" "scripts/search-index-migration-preflight.test.ts"
corepack pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/scan-progress-schema.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-scan-progress-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-runtime-reset-service.test.ts" "src/main/modules/box-tool/search-engine/workers/search-index-worker-client.test.ts" "src/main/modules/box-tool/search-engine/workers/search-index-worker-scan-progress.test.ts" "src/main/modules/box-tool/search-engine/workers/search-index-worker.retry.test.ts"
corepack pnpm -C "apps/core-app" run search:index-migration:preflight -- --db "<sqlite.db>" --output "<report.json>"
corepack pnpm -C "apps/core-app" run typecheck:node
corepack pnpm -C "apps/core-app" run typecheck:web
git diff --check
```
