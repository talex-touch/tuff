# Talex Touch 项目文档中心

> 更新时间：2026-07-16
> 定位：规划入口。当前任务状态以 Trellis 为准；本目录只保留优先级、路线、专题和验收边界。

## 先看这四个入口

1. [`TODO.md`](./TODO.md)：当前两周稳定化顺序与完成条件。
2. [`.trellis/tasks/`](../../.trellis/tasks/)：实时任务、owner、PRD、设计和实施状态。
3. [`04-implementation/Roadmap-vNext-2026-06-18.md`](./04-implementation/Roadmap-vNext-2026-06-18.md)：R0-R9 产品路线。
4. [`01-project/CHANGES.md`](./01-project/CHANGES.md)：已完成事实与验证证据索引。

代码版本不在文档中手工维护；以根目录和 `apps/core-app/package.json` 为准。分支与工作区状态同样只在执行时读取，不写入长期文档。

## 当前判断

P0 稳定化三项均已关闭：

- Usage 单写者和 `0027` 保守历史修复已验证。
- Nexus push 已切换到有界预读与原子 D1 `batch()`，并完成本地与隔离 Preview D1 验证。
- Trellis 已无提交归档 45 个完成项；保留任务拥有单一 assignee、下一动作、blocker 和 evidence。

本页不再重复全局优先级；实时顺序只看 [`TODO.md`](./TODO.md)。

## 专题入口

- [`TODO-AI.md`](./TODO-AI.md)：AI Stable 与后续产品化。
- [`TODO-R3.md`](./TODO-R3.md)：Search / Indexing Runtime。
- [`TODO-nexus.md`](./TODO-nexus.md)：Nexus 性能与 deployed evidence。
- [`docs/TODO-BACKLOG-LONG-TERM.md`](./docs/TODO-BACKLOG-LONG-TERM.md)：长期债务池。
- [`04-implementation/Stability-Architecture-Optimization-2026-07-04.md`](./04-implementation/Stability-Architecture-Optimization-2026-07-04.md)：稳定性代码落点与验证矩阵。
- [`../engineering/security-hardening-handoff-2026-07-15.md`](../engineering/security-hardening-handoff-2026-07-15.md)：安全加固交接。
- [Search & Cross-Platform Audit](../../.trellis/tasks/07-13-search-crossplatform-audit/prd.md)：搜索/跨平台 backlog。

## Evidence 入口

- [`04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md`](./04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md)
- [`04-implementation/Evidence-Matrix-Release-Integrity-2026-06-21.md`](./04-implementation/Evidence-Matrix-Release-Integrity-2026-06-21.md)
- [`04-implementation/Evidence-Matrix-Nexus-Governance-2026-06-18.md`](./04-implementation/Evidence-Matrix-Nexus-Governance-2026-06-18.md)
- [`../engineering/reports/`](../engineering/reports/)

## 文档治理规则

- `TODO.md` 只承载当前两周顺序，不复制专题完成流水。
- Trellis 只承载任务执行状态；Roadmap 不记录临时 worktree 状态。
- 专题状态冲突时，全局优先级服从 `TODO.md`，完成声明服从 evidence。
- 行为、接口或架构变化至少同步对应专题文档与 `CHANGES.md`；只有全局优先级变化才更新本入口。
- 旧执行计划保留兼容入口并标记 Historical，不继续维护第二套“当前事实”。
