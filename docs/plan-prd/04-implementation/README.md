# Implementation Docs

> 更新时间：2026-07-16
> 定位：路线、稳定化和 evidence 文档索引。实时任务状态不在本目录维护。

## 活跃入口

- [`../TODO.md`](../TODO.md)：当前两周稳定化顺序。
- [`Roadmap-vNext-2026-06-18.md`](./Roadmap-vNext-2026-06-18.md)：R0-R9 产品路线。
- [`Stability-Architecture-Optimization-2026-07-04.md`](./Stability-Architecture-Optimization-2026-07-04.md)：稳定性代码落点与验证矩阵。
- [`R8-R9-Next-Stage-Execution-Plan-2026-06-24.md`](./R8-R9-Next-Stage-Execution-Plan-2026-06-24.md)：R8/R9 专题计划；不定义当前全局优先级。
- [`Launcher-TuffIntelligence-QuickReview-Roadmap-2026-07-07.md`](./Launcher-TuffIntelligence-QuickReview-Roadmap-2026-07-07.md)：Launcher / Intelligence / QuickReview 专题路线。
- [`Pricing-SoT-2026-06-18.md`](./Pricing-SoT-2026-06-18.md)：Pricing 单一事实源。

## Evidence Matrix

- [`Evidence-Matrix-AI-Stable-2026-06-18.md`](./Evidence-Matrix-AI-Stable-2026-06-18.md)
- [`Evidence-Matrix-Release-Integrity-2026-06-21.md`](./Evidence-Matrix-Release-Integrity-2026-06-21.md)
- [`Evidence-Matrix-Nexus-Governance-2026-06-18.md`](./Evidence-Matrix-Nexus-Governance-2026-06-18.md)
- [`Evidence-Matrix-Platform-2026-06-18.md`](./Evidence-Matrix-Platform-2026-06-18.md)

## Historical / 兼容入口

- [`Current-Execution-Plan-2026-06-17.md`](./Current-Execution-Plan-2026-06-17.md)：已退役为兼容跳转，不再维护当前事实。
- [`Project-Roadmap-Audit-2026-06-18.md`](./Project-Roadmap-Audit-2026-06-18.md)：历史审计快照。
- [`Release-2.4.11-Closure-2026-06-13.md`](./Release-2.4.11-Closure-2026-06-13.md)：历史发布收口记录。
- [`AI-2.5x-Execution-Plan-2026-06-16.md`](./AI-2.5x-Execution-Plan-2026-06-16.md)：AI 专题历史/阶段计划。

## 维护规则

- 不新增第二份“当前执行计划”；实时状态进入 Trellis，两周顺序进入 `TODO.md`。
- 路线文档不写本地 HEAD、分支、dirty worktree 或手工维护的当前版本。
- Evidence Matrix 只记录可复核证据，不把 focused/mock/local-only 提升为 packaged/production 完成。
- 历史文档保留时必须标明 Historical 或由本索引归类；旧事实不反向覆盖活跃入口。
