# Tuff 当前稳定化 TODO

> 更新时间：2026-07-16
> 定位：唯一的两周级执行顺序。实时任务状态、owner 和实施记录以 [`.trellis/tasks/`](../../.trellis/tasks/) 为准。

## 决策

**P0 稳定化三项均已关闭。后续唯一执行顺序从下方 P1 开始；任务状态与 owner 继续实时读取 Trellis。**

P0-1 复核后的真实机制：

1. `SearchUsageService.recordExecute()` 依次写 `usage_logs`、`usage_summary`，并把 provider-aware 增量送入 `UsageStatsQueue`。
2. 旧 `UsageSummaryService.summarizeUsageLogs()` 把 `usage_logs.source`（source type）同时当作 `source_id/source_type`，每次启动后 30 秒及每 24 小时重复回放。
3. 结果主要是 source-type phantom rows；当 provider id 恰好等于 type 时才直接放大同一行。
4. 当前维护任务只重建 `item_time_stats` 并清理过期日志，不再写 `item_usage_stats`。

## P0：本轮必须关账

### P0-1 Usage 统计单写者与数据修复 ✅

- [x] `UsageStatsQueue` 为正常增量 writer；初始化期 direct fallback 与 queue 互斥，单次事件只写一次。
- [x] 移除周期 `usage_logs -> item_usage_stats` 加性回放，同时保留时间分布聚合与 retention cleanup。
- [x] `0027_usage_stats_single_writer_repair.sql` 保守删除有 provider sibling 的 phantom row，并只下调超过 `usage_summary.click_count` 的 execute 过计。
- [x] 迁移重放幂等；不修改无 summary 的行、under-count、search/cancel 计数或其它时间戳。
- [x] 3 个 focused files / 4 tests、scoped ESLint、CoreApp node typecheck、migration readiness 与临时数据库 execute→flush→maintenance smoke 通过。

代码入口：

- `apps/core-app/src/main/modules/box-tool/search-engine/search-usage-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/usage-stats-queue.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/usage-summary-service.ts`
- `apps/core-app/resources/db/migrations/0027_usage_stats_single_writer_repair.sql`

### P0-2 Nexus 大批量同步一致性 ✅

- [x] `pushSyncItemsV1` 对 item id / op sequence 做有界 JSON 批量预读，不再逐项读取 D1。
- [x] `updated_at + device_id` 冲突优先级保持一致；null existing device 在相同时间戳下正确让位。
- [x] oplog、materialized item、authoritative quota 与 session cursor 进入同一个 D1 `batch()` 事务；任一语句失败全量回滚。
- [x] 1001 项、重复 op、冲突、delete/tombstone 和中途失败均有 focused 回归；13/13 tests、scoped ESLint、Nexus typecheck 通过。
- [x] Miniflare 与经明确批准的 Preview D1 隔离验证通过：1001/1001/1001 写入一致，强制失败后 oplog/item/quota/session 均为 0；临时表已清理，production D1 未访问。

代码入口：`apps/nexus/server/utils/syncStoreV1.ts`、`apps/nexus/server/api/v1/sync/push.post.ts`。

### P0-3 任务与文档收敛 ✅

- [x] 逐项复核 Trellis task status、PRD 验收和 evidence；审计基线包含 54 个 active task（含本收敛任务），不再把该数字写成实时状态。
- [x] 44 个既有 completed / 验收全勾选任务与本收敛任务自身均以 `--no-commit` 归档；审计基线最终只保留 9 个真实开放任务，实时数量仍通过 `task.py list` 读取。
- [x] `TODO.md` 是唯一全局优先级来源；导航、Roadmap、专题 TODO 和任务 PRD 只链接或展开局部合同。
- [x] 长期文档不再保存 live branch、临时 HEAD、dirty worktree、可读取版本或 stale active-count 快照。

## P1：P0 之后顺序执行

1. **插件隔离闭环**：补 callback RPC、AbortSignal 代理、registry 清理；官方插件全量真机回归后再考虑默认开启。
2. **原生与发布链**：把 Rust screenshot build/verify 接入 CI/安装包；核对 macOS 签名、公证、架构与 updater 产物契约。
3. **R3 真实 evidence**：优先 attach-only natural Settings evidence；真实 profile SQLite/FTS/`scan_progress` 操作仍需独立审批、备份和回滚。
4. **Nexus deployed evidence**：只补真实 Cloudflare preview、OAuth callback、authenticated dashboard 与 bfcache；local-only 不升级为 production done。

## 专题状态护栏

- **R2 AI Stable**：`historical 13/13 / current recapture open`。任何“当前版本已通过”声明都必须使用 `--requireCurrentVersion`，并让 manifest baseline 精确匹配 `apps/core-app/package.json`；历史 artifact 不因本轮稳定化而升级。
- **R9.2 ContextHygiene**：P0/P1 与 isolated packaged entrypoint evidence 已完成；real-profile 与后续 scope migration 仍开放。该完成状态保留，但不覆盖本文件的当前执行顺序。

## 暂停抢占稳定化窗口

- R8-F CatalogService MVP。
- AI/Assistant/OmniPanel 视觉和性能 polish。
- 桌面烟花及其它新体验能力。
- Search 大规模拆分类重构；只在本文件到达对应阶段或直接修复高优先级稳定性缺陷时展开。

这些事项未取消，继续保留在 Roadmap、专题 TODO 或长期债务池；只在本文件到达对应阶段后恢复。

## 稳定化完成标准

- 已知数据双写关闭，历史污染有可审计修复方案和真实运行验证。
- 大批量同步不会因逐项 D1 子请求耗尽而半写，冲突语义无回归。
- 活跃 Trellis 任务均真实、可执行、可验收；完成项不再滞留 active tree。
- 插件隔离默认化有逐插件真机证据；原生截图模块在最终包内可验证。
- 文档入口不再出现互相冲突的当前版本、worktree 或优先级。

## 专题与历史入口

- AI：[`TODO-AI.md`](./TODO-AI.md)
- R3：[`TODO-R3.md`](./TODO-R3.md)
- Nexus：[`TODO-nexus.md`](./TODO-nexus.md)
- 长期债务：[`docs/TODO-BACKLOG-LONG-TERM.md`](./docs/TODO-BACKLOG-LONG-TERM.md)
- 安全/数据一致性交接：[`../engineering/security-hardening-remaining-backlog-2026-07-15.md`](../engineering/security-hardening-remaining-backlog-2026-07-15.md)
- 搜索/跨平台审计：[`.trellis/tasks/07-13-search-crossplatform-audit/prd.md`](../../.trellis/tasks/07-13-search-crossplatform-audit/prd.md)
- 完成事实：[`01-project/CHANGES.md`](./01-project/CHANGES.md)
