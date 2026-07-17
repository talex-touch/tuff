# 文档索引

> 更新时间：2026-07-16
> 定位：仓库文档导航，不保存易漂移的本地 `HEAD`、分支、工作区或“当前版本”快照。

## 30 秒入口

| 需要回答的问题 | 单一事实源 |
| --- | --- |
| 当前代码版本是什么 | 根目录与 `apps/core-app/package.json` |
| 当前任务由谁执行、状态如何 | [`.trellis/tasks/`](../.trellis/tasks/) 与 `.trellis/scripts/get_context.py` |
| 接下来两周先做什么 | [`plan-prd/TODO.md`](./plan-prd/TODO.md) |
| 产品阶段和能力边界是什么 | [`plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md`](./plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md) |
| 最近已经发生了什么 | [`plan-prd/01-project/CHANGES.md`](./plan-prd/01-project/CHANGES.md) |
| 某项是否真的完成 | 对应 Evidence Matrix 或 [`engineering/reports/`](./engineering/reports/) |

## 当前稳定化结论

Usage 单写者、Nexus 同步原子批处理和 Trellis 任务/文档收敛三个 P0 项均已关闭。

- `UsageStatsQueue` / direct fallback 是 `item_usage_stats` 唯一增量 writer；`0027` 保守修复可证明的历史污染。
- `pushSyncItemsV1` 以单个 D1 `batch()` 原子提交 oplog、item、quota 和 session cursor，并有本地/Preview D1 证据。
- 45 个完成任务（44 个既有任务 + 本收敛任务）已无提交归档；保留任务的 assignee、next action、blocker 和 evidence 均回到 task metadata。

本页只负责导航，不复制下一项全局优先级。实时顺序只看 [`plan-prd/TODO.md`](./plan-prd/TODO.md)。

代码落点与验证边界见 [`plan-prd/04-implementation/Stability-Architecture-Optimization-2026-07-04.md`](./plan-prd/04-implementation/Stability-Architecture-Optimization-2026-07-04.md)。

## 文档分层

### 1. 活跃执行层

- [`plan-prd/README.md`](./plan-prd/README.md)：规划入口与事实源边界。
- [`plan-prd/TODO.md`](./plan-prd/TODO.md)：唯一的两周级优先级清单。
- [`.trellis/tasks/`](../.trellis/tasks/)：任务 owner、状态、PRD、设计和实施记录。

### 2. 路线与专题层

- [`plan-prd/04-implementation/README.md`](./plan-prd/04-implementation/README.md)：实施文档状态索引。
- [`plan-prd/TODO-AI.md`](./plan-prd/TODO-AI.md)：AI Stable / 产品化专题。
- [`plan-prd/TODO-R3.md`](./plan-prd/TODO-R3.md)：Search / Indexing Runtime 专题。
- [`plan-prd/TODO-nexus.md`](./plan-prd/TODO-nexus.md)：Nexus 性能专题。
- [`plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`](./plan-prd/docs/TODO-BACKLOG-LONG-TERM.md)：非当前窗口的长期债务。

### 3. 工程交接与审计层

- [`engineering/README.md`](./engineering/README.md)：工程资料入口。
- [`engineering/security-hardening-handoff-2026-07-15.md`](./engineering/security-hardening-handoff-2026-07-15.md)：安全加固交接摘要。
- [`engineering/security-hardening-remaining-backlog-2026-07-15.md`](./engineering/security-hardening-remaining-backlog-2026-07-15.md)：剩余安全/数据一致性实施细节。
- [Search & Cross-Platform Audit](../.trellis/tasks/07-13-search-crossplatform-audit/prd.md)：搜索与跨平台风险清单。

### 4. 验收与历史层

- [`engineering/reports/`](./engineering/reports/)：curated evidence、manifest、checklist 与审计摘要。
- [`plan-prd/04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md`](./plan-prd/04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md)：AI Stable evidence。
- [`plan-prd/04-implementation/Evidence-Matrix-Release-Integrity-2026-06-21.md`](./plan-prd/04-implementation/Evidence-Matrix-Release-Integrity-2026-06-21.md)：发布完整性 evidence。
- [`plan-prd/04-implementation/Evidence-Matrix-Nexus-Governance-2026-06-18.md`](./plan-prd/04-implementation/Evidence-Matrix-Nexus-Governance-2026-06-18.md)：Nexus 治理 evidence。

## 维护规则

1. 任务状态只写 Trellis；两周优先级只写 `TODO.md`；路线只写 Roadmap；完成事实只写 `CHANGES.md` / evidence。
2. 长期文档不得固化本地 `HEAD`、dirty worktree、当前分支或可从 `package.json` 读取的版本。
3. 专题 TODO 只承载专题细节，不反向定义全局优先级。
4. 探索日志、临时截图、HAR、用户数据和原始 probe 输出不得进入文档树；只提交可复核摘要与最终 evidence。
5. 入口文档保持短小；过程记录进入 Git 历史，不再新增第二套“当前执行计划”。
