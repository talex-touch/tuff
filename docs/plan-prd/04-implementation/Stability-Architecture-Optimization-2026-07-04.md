# 稳定性与架构优化总览

> 更新时间：2026-07-16
> 定位：稳定化代码落点与验证导航。执行顺序以 [`../TODO.md`](../TODO.md) 为准；本文不复制任务状态。

## 1. 优先级原则

1. 数据正确性高于功能完整度。
2. 已确认、会持续放大的缺陷高于待验证风险。
3. 先建立单写者和可回滚边界，再做大规模拆分类重构。
4. focused tests 证明合同；packaged、真实 D1、真实 profile 和真机结论必须使用对应环境 evidence。

## 2. P0 稳定性状态

### P0-1 `item_usage_stats` 单写者 ✅ 已修

**根因**：`usage_logs.source` 保存 source type，而旧 `summarizeUsageLogs()` 把它同时写成 `item_usage_stats.source_id/source_type` 并周期加计。通常会生成 provider 无法消费的 phantom rows；provider id 等于 type 时才直接放大原行。

**交付**：

- `UsageStatsQueue` / direct fallback 成为唯一增量 writer。
- 周期维护只重建 `item_time_stats` 和清理过期 raw logs。
- `0027_usage_stats_single_writer_repair.sql` 删除有 provider sibling 的明确 phantom row，并把超过 `usage_summary.click_count` 的 execute 计数向下修正；不猜 provider id、不做全量重置。

**验证**：3 个 focused files / 4 tests、scoped ESLint、CoreApp node typecheck、migration journal readiness 与临时数据库端到端 smoke 通过；execute 在 flush 和 maintenance 前后均为 `1`。

### P0-2 Nexus sync 批量一致性 ✅ 已修

**根因**：旧 `pushSyncItemsV1()` 每个 item 独立执行 oplog/item 读取与写入，route 再单独累加 quota。查询量随 payload 线性放大；任何中途失败都可能留下 oplog、materialized item、quota 与 session cursor 不一致。

**交付**：完整请求先验证，再以 512 KiB JSON chunks 批量预读；`updated_at + device_id` 冲突排序保持一致。所有 oplog bulk insert、item upsert、authoritative quota reconcile 和 session cursor update 在一个 D1 `batch()` 事务中提交，并预留 100 条查询余量守卫 D1 paid-plan 1000-query 上限。push route 不再二次写 quota。

**验证**：13/13 focused tests、scoped ESLint、Nexus typecheck 通过；Miniflare 1001 项写入得到 oplog/item/quota `1001/1001/1001`，中间故障后均为 `0`。经明确批准的 Preview D1 隔离表复验同样得到 1001 项一致写入、强制失败全回滚和 null/lower/higher device tie-break 正确；临时表清理后 prefix 查询为空，production D1 未访问。

## 3. P0 协作风险 ✅ 已收敛

**根因**：completed、验收全勾选、planning 和长期 in-progress 任务同时滞留 active tree；部分任务没有 next action/blocker/evidence，入口文档又重复声明全局优先级。

**交付**：逐项核对 task status 与 PRD checklist 后，44 个既有完成项和本收敛任务自身均通过 `task.py archive --no-commit` 移入历史目录。最终仅保留 9 个真实开放任务；每项都有唯一 assignee，并在 `task.json.meta` 记录 next action、blocker 和 evidence。0/7 的 LP-03 从 `in_progress` 纠正为 `planning`，并行中的 file-filtering slice 保持 active 且未改生产代码。

**事实源**：实时任务树始终通过 `task.py list` 读取，不在长期文档固化数量。全局顺序只由 [`../TODO.md`](../TODO.md) 定义；任务 PRD 只拥有局部合同，CHANGES/reports 只拥有完成证据。

## 4. P1 高风险工程项

| 顺序 | 风险 | 当前边界 | 完成证据 |
| --- | --- | --- | --- |
| 1 | 插件隔离未默认化 | callback RPC、AbortSignal、registry cleanup 与逐插件真机回归仍开放 | 官方插件行为/权限/性能矩阵，flag 默认开启前全部通过 |
| 2 | Rust screenshot 未接入主打包校验 | `build:screenshot` 为独立脚本；`build-target.js` 仅严格验证 OCR `.node` | CI 生成并检查 `tuff_native_screenshot.node`，最终安装包运行 smoke |
| 3 | macOS release/updater 契约 | 当前配置仍是 unsigned、arm64、`dir` target；与自动更新/分发要求需统一 | 签名/公证/架构产品决策 + updater 真实 artifact evidence |
| 4 | R3 大目录与真实 profile 风险 | 大目录扫描内存峰值、真实 profile migration/evidence 未闭合 | chunked/streaming memory profile；attach-only 与审批后的 migration evidence |
| 5 | Linux 能力不对称 | OCR、更新安装、应用扫描等仍有明确缺口 | capability matrix 的 degraded/unsupported 与真实平台 smoke |

搜索与跨平台详情见 [Search & Cross-Platform Audit](../../../.trellis/tasks/07-13-search-crossplatform-audit/prd.md)。安全与数据一致性详情见 [`../../engineering/security-hardening-remaining-backlog-2026-07-15.md`](../../engineering/security-hardening-remaining-backlog-2026-07-15.md)。

## 5. 暂缓项

CatalogService、AI/Assistant/OmniPanel polish、桌面烟花、广泛 SRP 拆分等继续留在 Roadmap/专题 backlog。它们只有在直接解除 P0 阻塞时才能进入当前窗口。

## 6. 最小验证矩阵

| 改动 | 必须证明 |
| --- | --- |
| Usage 单写者 | focused DB tests + 应用真实 execute/restart/summary smoke + 修复前后计数对比 |
| Sync 批量化 | 真实 D1 >1000 项、冲突、重复 op、delete、失败恢复与配额 delta |
| 插件隔离 | 合成 callback/abort tests + 全官方插件真机回归 + 性能样本 |
| 原生打包 | clean-checkout CI build + 包内模块检查 + packaged runtime smoke |
| R3 migration | 只读 preflight、备份、copy simulation、审批、真实 profile evidence、回滚演练 |
| 文档 | 活跃入口相对链接可解析；无易漂移状态；`mise run ai-docs:dev` 通过 |

按改动选择最近验证，不把 local-only、mock、dry-run 或 focused test 升级成生产/真机完成声明。
